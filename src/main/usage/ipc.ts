import { ipcMain } from 'electron'
import { TOOL_IDS, type ToolId } from '@shared/ipc'
import {
  USAGE_CHANNELS,
  USAGE_LABEL_MAX_LENGTH,
  type UsagePrice,
  type UsageQuery
} from '@shared/usage'
import { hasControlCharacters } from '@shared/configuration'
import { AppError } from '../errors'
import { registerBusinessHandler } from '../ipc'
import { object } from './parse'
import type { UsageService } from './service'

const invalid = (): AppError =>
  new AppError('INVALID_INPUT', '用量筛选或价格格式不正确，请检查后重试。')

export function registerUsageIpc(rendererUrl: string, service: UsageService): () => void {
  registerBusinessHandler(
    USAGE_CHANNELS.query,
    rendererUrl,
    (args): UsageQuery => {
      if (args.length !== 1) throw invalid()
      const input = object(args[0])
      if (![1, 7, 30, 90].includes(Number(input.days)) || typeof input.days !== 'number')
        throw invalid()
      if (input.toolId !== 'all' && !TOOL_IDS.includes(input.toolId as ToolId)) throw invalid()
      if (
        !Number.isInteger(input.offset) ||
        Number(input.offset) < 0 ||
        Number(input.offset) > 250_000
      )
        throw invalid()
      for (const key of ['provider', 'model'] as const)
        if (
          input[key] !== undefined &&
          (typeof input[key] !== 'string' ||
            input[key].length > USAGE_LABEL_MAX_LENGTH ||
            hasControlCharacters(input[key]))
        )
          throw invalid()
      if (input.refresh !== undefined && typeof input.refresh !== 'boolean') throw invalid()
      return input as unknown as UsageQuery
    },
    (input) => service.query(input)
  )
  registerBusinessHandler(
    USAGE_CHANNELS.savePrices,
    rendererUrl,
    (args): UsagePrice[] => {
      if (args.length !== 1) throw invalid()
      const prices = object(args[0]).prices
      if (!Array.isArray(prices) || prices.length > 200) throw invalid()
      const result = prices.map((raw): UsagePrice => {
        const price = object(raw)
        if (
          typeof price.model !== 'string' ||
          !price.model.trim() ||
          price.model.length > USAGE_LABEL_MAX_LENGTH ||
          hasControlCharacters(price.model)
        )
          throw invalid()
        for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const)
          if (
            typeof price[key] !== 'number' ||
            !Number.isFinite(price[key]) ||
            price[key] < 0 ||
            price[key] > 1_000_000
          )
            throw invalid()
        return {
          model: price.model.trim(),
          input: price.input as number,
          output: price.output as number,
          cacheRead: price.cacheRead as number,
          cacheWrite: price.cacheWrite as number
        }
      })
      if (new Set(result.map((p) => p.model)).size !== result.length) throw invalid()
      return result
    },
    async (prices) => service.savePrices(prices)
  )
  return () => {
    for (const channel of Object.values(USAGE_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
