import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { TOOL_NAMES, type ToolId } from '@shared/ipc'
import type {
  UsageGroup,
  UsagePrice,
  UsageQuery,
  UsageRecord,
  UsageSnapshot,
  UsageTotals
} from '@shared/usage'
import type { AppDatabase } from '../database'
import type { PathSettingsStore } from '../services/path-settings'
import { fingerprint, missing, walk, withinRoot } from '../sessions/files'
import { parseUsageFile } from './parse'

interface Catalog {
  records: UsageRecord[]
  warnings: string[]
  scannedAt: string
}
interface CachedFile {
  revision: string
  records: UsageRecord[]
  invalid: number
}

const RECORD_LIMIT = 200_000

export class UsageService {
  private files = new Map<string, CachedFile>()
  private catalogs = new Map<string, Catalog>()
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly database: AppDatabase,
    private readonly paths: PathSettingsStore
  ) {}

  savePrices(prices: UsagePrice[]): void {
    this.database.setSetting('device_settings', 'usage.prices', prices)
  }

  query(query: UsageQuery): Promise<UsageSnapshot> {
    const pending = this.lock.then(() => this.read(query))
    this.lock = pending.catch(() => undefined)
    return pending
  }

  private async read(query: UsageQuery): Promise<UsageSnapshot> {
    let catalog = this.catalogs.get(query.toolId)
    if (!catalog || query.refresh || Date.now() - Date.parse(catalog.scannedAt) > 30_000) {
      catalog = await this.scan(query.toolId)
      this.catalogs.set(query.toolId, catalog)
    }
    const prices = this.database.getSetting<UsagePrice[]>('device_settings', 'usage.prices') ?? []
    const byModel = new Map(prices.map((price) => [price.model, price]))
    const start = rangeStart(query.days)
    const end = new Date()
    const available = catalog.records.filter((row) => {
      const time = Date.parse(row.timestamp)
      return time >= start.getTime() && time <= end.getTime()
    })
    const filtered = available
      .filter(
        (row) =>
          (!query.provider || row.provider === query.provider) &&
          (!query.model || row.model === query.model)
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id))
    const records = filtered.slice(0, RECORD_LIMIT).map((row) => {
      const price = byModel.get(row.model)
      if (row.cost !== null || !price) return row
      return {
        ...row,
        cost:
          (row.input * price.input +
            row.output * price.output +
            row.cacheRead * price.cacheRead +
            row.cacheWrite * price.cacheWrite) /
          1_000_000,
        estimated: true
      }
    })
    const daily = new Map<string, UsageGroup>()
    const date = new Date(start)
    for (let i = 0; i < query.days; i++) {
      const name = dayKey(date)
      daily.set(name, { name, ...emptyTotals() })
      date.setDate(date.getDate() + 1)
    }
    const providers = new Map<string, UsageGroup>()
    const models = new Map<string, UsageGroup>()
    const totals = emptyTotals()
    for (const row of records) {
      add(totals, row)
      add(daily.get(dayKey(new Date(row.timestamp)))!, row)
      for (const [map, name] of [
        [providers, row.provider],
        [models, row.model]
      ] as const) {
        if (!map.has(name)) map.set(name, { name, ...emptyTotals() })
        add(map.get(name)!, row)
      }
    }
    const offset = Math.min(query.offset, Math.max(0, Math.floor((records.length - 1) / 25) * 25))
    return {
      scannedAt: catalog.scannedAt,
      totals,
      days: [...daily.values()],
      providers: [...providers.values()].sort((a, b) => b.tokens - a.tokens),
      models: [...models.values()].sort((a, b) => b.tokens - a.tokens),
      providerOptions: [...new Set(available.map((r) => r.provider))].sort(),
      modelOptions: [...new Set(available.map((r) => r.model))].sort(),
      records: records.slice(offset, offset + 25),
      offset,
      prices,
      warnings:
        filtered.length > RECORD_LIMIT
          ? [
              ...catalog.warnings,
              '当前筛选超过 200,000 条用量记录，仅统计最近 200,000 条；请缩短统计时间或筛选应用、供应商、模型。'
            ]
          : catalog.warnings
    }
  }

  private async scan(tool: UsageQuery['toolId']): Promise<Catalog> {
    // Older source records still suppress fork copies with rewritten timestamps.
    // Keep only their IDs during the scan, then discard them with the scan state.
    const records = new Map<string, UsageRecord | null>()
    const earliest = rangeStart(90).getTime()
    const warnings: string[] = []
    const tools: ToolId[] = tool === 'all' ? ['claude-code', 'codex'] : [tool]
    let unreadable = 0
    let invalid = 0
    const visited = new Set<string>()
    for (const toolId of tools) {
      try {
        const directories = await this.paths.getSessionDirectories(toolId)
        for (const directory of directories) {
          const root = resolve(directory)
          const rootKey = `${toolId}:${process.platform === 'win32' ? root.toLowerCase() : root}`
          if (visited.has(rootKey)) continue
          visited.add(rootKey)
          try {
            await withinRoot(root, root)
            const roots = toolId.startsWith('codex')
              ? ['sessions', 'archived_sessions']
              : ['projects']
            for (const child of roots) {
              const paths = await walk(join(root, child), 12, (name) => name.endsWith('.jsonl'))
              for (const path of paths) {
                try {
                  await withinRoot(root, path)
                  const revision = await fingerprint(path)
                  const key = `${toolId}:${path}`
                  let cached = this.files.get(key)
                  if (!cached || cached.revision !== revision) {
                    if ((await stat(path)).size > 128 * 1024 * 1024) {
                      unreadable++
                      continue
                    }
                    const parsed = await parseUsageFile(path, toolId)
                    cached = { revision, ...parsed }
                    // Cache usage fields only; bound retained file data in long-running applications.
                    if (cached.records.length < 5000) {
                      this.files.delete(key)
                      this.files.set(key, cached)
                      while (this.files.size > 200)
                        this.files.delete(this.files.keys().next().value!)
                    }
                  }
                  invalid += cached.invalid
                  for (const row of cached.records) {
                    if (Date.parse(row.timestamp) < earliest) {
                      records.set(row.id, null)
                      continue
                    }
                    const existing = records.get(row.id)
                    if (existing === null) continue
                    if (!existing) records.set(row.id, row)
                    else {
                      const merged = { ...existing }
                      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const)
                        merged[key] = Math.max(existing[key], row[key])
                      merged.timestamp =
                        existing.timestamp < row.timestamp ? existing.timestamp : row.timestamp
                      merged.cost = existing.cost ?? row.cost
                      records.set(row.id, merged)
                    }
                  }
                } catch {
                  unreadable++
                }
              }
            }
          } catch (error) {
            if (!missing(error))
              warnings.push(
                `${TOOL_NAMES[toolId]} 的部分日志目录无法读取，请检查配置路径和目录权限后同步。`
              )
          }
        }
      } catch {
        warnings.push(
          `${TOOL_NAMES[toolId]} 的日志位置不可用，请检查工具配置路径或 WSL 状态后同步。`
        )
      }
    }
    if (unreadable)
      warnings.push(
        `${unreadable} 个日志无法读取或超过 128 MiB，统计可能不完整；请检查文件权限或日志大小。`
      )
    if (invalid)
      warnings.push(`${invalid} 行日志不完整或格式损坏，已跳过；可在原工具结束写入后重新同步。`)
    return {
      records: [...records.values()].filter((row): row is UsageRecord => row !== null),
      warnings: [...new Set(warnings)],
      scannedAt: new Date().toISOString()
    }
  }
}

function rangeStart(days: number): Date {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days + 1)
  return start
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function emptyTotals(): UsageTotals {
  return {
    requests: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    tokens: 0,
    cost: 0,
    unpriced: 0,
    estimated: 0
  }
}
function tokenCount(row: UsageRecord): number {
  return row.input + row.output + row.cacheRead + row.cacheWrite
}
function add(totals: UsageTotals, row: UsageRecord): void {
  totals.requests++
  totals.input += row.input
  totals.output += row.output
  totals.cacheRead += row.cacheRead
  totals.cacheWrite += row.cacheWrite
  totals.tokens += tokenCount(row)
  totals.cost += row.cost ?? 0
  if (row.cost === null) totals.unpriced++
  if (row.estimated) totals.estimated++
}
