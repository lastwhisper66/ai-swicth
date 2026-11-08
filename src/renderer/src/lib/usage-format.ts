import type { UsageTotals } from '@shared/usage'

export const formatTokens = (value: number): string => {
  if (value >= 1_000_000_000) return `${Number((value / 1_000_000_000).toFixed(2))}B`
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`
  if (value >= 10_000) return `${Number((value / 1000).toFixed(1))}K`
  return value.toLocaleString('zh-CN')
}

export const formatCost = (value: number, detailed = false): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: detailed ? 4 : 2
  }).format(value)

export const cacheRate = (row: UsageTotals): number => {
  const input = row.input + row.cacheRead + row.cacheWrite
  return input ? (row.cacheRead / input) * 100 : 0
}

export const summaryCost = (row: UsageTotals): string =>
  row.requests > 0 && row.unpriced === row.requests ? '—' : formatCost(row.cost)
