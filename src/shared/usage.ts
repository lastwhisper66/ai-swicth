import type { ApiResult, ToolId } from './ipc'

// Match provider model validation, including Claude's optional [1m] suffix.
export const USAGE_LABEL_MAX_LENGTH = 204

export const USAGE_CHANNELS = {
  query: 'usage:query',
  savePrices: 'usage:save-prices'
} as const

export interface UsageQuery {
  days: 1 | 7 | 30 | 90
  toolId: ToolId | 'all'
  provider?: string
  model?: string
  offset: number
  refresh?: boolean
}

/** USD per million tokens, explicitly supplied by the user. */
export interface UsagePrice {
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface UsageRecord {
  id: string
  timestamp: string
  toolId: ToolId
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number | null
  estimated: boolean
}

export interface UsageTotals {
  requests: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  tokens: number
  cost: number
  unpriced: number
  estimated: number
}

export interface UsageGroup extends UsageTotals {
  name: string
}

export interface UsageSnapshot {
  scannedAt: string
  totals: UsageTotals
  days: UsageGroup[]
  providers: UsageGroup[]
  models: UsageGroup[]
  providerOptions: string[]
  modelOptions: string[]
  records: UsageRecord[]
  offset: number
  prices: UsagePrice[]
  warnings: string[]
}

export interface UsageApi {
  query: (input: UsageQuery) => Promise<ApiResult<UsageSnapshot>>
  savePrices: (input: { prices: UsagePrice[] }) => Promise<ApiResult<void>>
}
