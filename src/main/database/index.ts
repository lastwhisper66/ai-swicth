import Database from 'better-sqlite3'
import { mkdirSync, lstatSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PortableProvider } from '../providers/store'
import type { ProviderToolId } from '@shared/ipc'
import { AppError } from '../errors'

export interface BackupIndexRow {
  id: string
  kind: 'tool' | 'configuration'
  createdAt: string
  toolId: string | null
  path: string
  document: unknown
}

/** The main process owns one connection; transactions must never span an await. */
export class AppDatabase {
  readonly sql: Database.Database
  readonly filePath: string

  constructor(readonly rootPath: string) {
    mkdirSync(rootPath, { recursive: true })
    this.filePath = join(rootPath, 'ai-switch.db')
    try {
      writeFileSync(this.filePath, '', { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    }
    const file = lstatSync(this.filePath)
    if (!file.isFile() || file.isSymbolicLink())
      throw new AppError('STORAGE_CORRUPTED', '数据库路径不是普通文件，请检查 ai-switch.db。')
    this.sql = new Database(this.filePath)
    this.sql.pragma('foreign_keys = ON')
    this.sql.pragma('busy_timeout = 5000')
  }

  close(): void {
    this.sql.close()
  }

  transaction<T>(operation: () => T): T {
    return this.sql.transaction(operation).immediate()
  }

  readTransaction<T>(operation: () => T): T {
    return this.sql.transaction(operation).deferred()
  }

  getSetting<T>(table: 'device_settings' | 'cloud_settings', key: string): T | null {
    const row = this.sql.prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : null
  }

  setSetting(table: 'device_settings' | 'cloud_settings', key: string, value: unknown): void {
    this.sql
      .prepare(
        `INSERT INTO ${table} (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, JSON.stringify(value))
  }

  readProviders(): PortableProvider[] {
    const providers = this.sql.prepare('SELECT * FROM providers ORDER BY position').all() as Array<{
      id: string
      name: string
      base_url: string
      api_key: string
      created_at: string
      updated_at: string
    }>
    return providers.map((p) => {
      const connections = this.sql
        .prepare('SELECT * FROM provider_connections WHERE provider_id = ? ORDER BY position')
        .all(p.id) as Array<{
        tool_id: ProviderToolId
        default_model_id: string
        options: string
      }>
      return {
        id: p.id,
        name: p.name,
        baseUrl: p.base_url,
        apiKey: p.api_key,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        tools: connections.map((c) => c.tool_id),
        configurations: Object.fromEntries(
          connections.map((c) => {
            const models = this.sql
              .prepare(
                'SELECT id, name, model, options FROM model_presets WHERE provider_id = ? AND tool_id = ? ORDER BY position'
              )
              .all(p.id, c.tool_id) as Array<{
              id: string
              name: string
              model: string
              options: string
            }>
            const headers = this.sql
              .prepare(
                'SELECT id, name, value FROM provider_headers WHERE provider_id = ? AND tool_id = ? ORDER BY position'
              )
              .all(p.id, c.tool_id)
            return [
              c.tool_id,
              {
                ...JSON.parse(c.options),
                defaultModelId: c.default_model_id,
                models: models.map((m) => ({ ...m, options: JSON.parse(m.options) })),
                headers
              }
            ]
          })
        )
      }
    })
  }

  replaceProviders(providers: PortableProvider[]): void {
    this.transaction(() => {
      this.sql.prepare('DELETE FROM providers').run()
      const provider = this.sql.prepare('INSERT INTO providers VALUES (?, ?, ?, ?, ?, ?, ?)')
      const connection = this.sql.prepare('INSERT INTO provider_connections VALUES (?, ?, ?, ?, ?)')
      const model = this.sql.prepare('INSERT INTO model_presets VALUES (?, ?, ?, ?, ?, ?, ?)')
      const header = this.sql.prepare('INSERT INTO provider_headers VALUES (?, ?, ?, ?, ?, ?)')
      providers.forEach((p, position) => {
        provider.run(p.id, p.name, p.baseUrl, p.apiKey, p.createdAt, p.updatedAt, position)
        p.tools.forEach((toolId, index) => {
          const { models, headers, defaultModelId, ...options } = p.configurations[toolId]!
          connection.run(p.id, toolId, defaultModelId, JSON.stringify(options), index)
          models.forEach((m, order) =>
            model.run(p.id, toolId, m.id, m.name, m.model, JSON.stringify(m.options), order)
          )
          headers.forEach((h, order) => header.run(p.id, toolId, h.id, h.name, h.value, order))
        })
      })
    })
  }

  readRecord(reference: string): string | null {
    const target = parseRecordReference(reference)
    if (!target) throw new Error('Invalid configuration record')
    if (target.kind === 'template') {
      const row = this.sql
        .prepare('SELECT content FROM common_templates WHERE tool_id = ?')
        .get(target.toolId) as { content: string | null } | undefined
      return row ? `${JSON.stringify({ content: row.content }, null, 2)}\n` : null
    }
    const row = this.sql
      .prepare('SELECT document FROM managed_states WHERE tool_id = ?')
      .get(target.toolId) as { document: string } | undefined
    return row?.document ?? null
  }

  writeRecord(reference: string, content: string | null): void {
    const target = parseRecordReference(reference)
    if (!target) throw new Error('Invalid configuration record')
    if (target.kind === 'template') {
      if (content === null)
        this.sql.prepare('DELETE FROM common_templates WHERE tool_id = ?').run(target.toolId)
      else
        this.sql
          .prepare(
            'INSERT INTO common_templates VALUES (?, ?) ON CONFLICT(tool_id) DO UPDATE SET content = excluded.content'
          )
          .run(target.toolId, JSON.parse(content).content)
    } else {
      if (content === null)
        this.sql.prepare('DELETE FROM managed_states WHERE tool_id = ?').run(target.toolId)
      else
        this.sql
          .prepare(
            'INSERT INTO managed_states VALUES (?, ?) ON CONFLICT(tool_id) DO UPDATE SET document = excluded.document'
          )
          .run(target.toolId, content)
    }
  }

  listBackups(kind: BackupIndexRow['kind']): BackupIndexRow[] {
    return (
      this.sql
        .prepare('SELECT * FROM backup_records WHERE kind = ? ORDER BY created_at DESC')
        .all(kind) as Array<{
        id: string
        kind: BackupIndexRow['kind']
        created_at: string
        tool_id: string | null
        path: string
        document: string
      }>
    ).map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      toolId: r.tool_id,
      path: r.path,
      document: JSON.parse(r.document)
    }))
  }

  putBackup(row: BackupIndexRow): void {
    this.sql
      .prepare(
        'INSERT INTO backup_records VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document'
      )
      .run(row.id, row.kind, row.createdAt, row.toolId, row.path, JSON.stringify(row.document))
  }
}

export function parseRecordReference(
  value: string
): { kind: 'template' | 'state'; toolId: string } | null {
  const match = /^(template|state):(claude-code|codex)(-wsl)?$/u.exec(value)
  if (!match || (match[1] === 'template' && match[3])) return null
  return { kind: match[1] as 'template' | 'state', toolId: `${match[2]}${match[3] ?? ''}` }
}
