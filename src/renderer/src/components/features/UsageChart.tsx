import type { UsageGroup } from '@shared/usage'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cacheRate, formatCost, formatTokens } from '@renderer/lib/usage-format'

export type UsageMetric = 'cost' | 'requests' | 'tokens' | 'cache'
const names = { cost: '成本', requests: '请求次数', tokens: 'Tokens', cache: '缓存命中率' }
const valueOf = (day: UsageGroup, metric: UsageMetric): number =>
  metric === 'cache' ? cacheRate(day) : day[metric]
const formatValue = (value: number, metric: UsageMetric): string =>
  metric === 'cache'
    ? `${value.toFixed(1)}%`
    : metric === 'cost'
      ? formatCost(value)
      : formatTokens(value)

export function UsageChart({
  days,
  metric
}: {
  days: UsageGroup[]
  metric: UsageMetric
}): React.JSX.Element {
  const maximum = Math.max(...days.map((day) => valueOf(day, metric)), 0)
  const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum)) : 1
  const rounded = maximum > 0 ? Math.ceil((maximum * 1.1) / magnitude) * magnitude : 2
  const upper =
    metric === 'cache' ? 100 : metric === 'requests' ? Math.ceil(rounded / 2) * 2 : rounded
  const interval = Math.max(1, Math.ceil(days.length / 8))
  return (
    <div className="px-5 pt-5 pb-4">
      <div className="mb-5 flex items-center justify-between text-xs">
        <span className="font-medium">
          {names[metric]} <span className="text-muted-foreground">· 按天</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-sm bg-cyan-600" />
          {names[metric]}
        </span>
      </div>
      <div
        className="flex h-44 gap-3"
        role="group"
        aria-label={`每日${names[metric]}趋势，使用 Tab 查看各天数据`}
      >
        <div
          className="flex w-14 shrink-0 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-muted-foreground"
          aria-hidden="true"
        >
          <span>{formatValue(upper, metric)}</span>
          <span>{formatValue(upper / 2, metric)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between"
            aria-hidden="true"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-t border-border/60" />
            ))}
          </div>
          <div className="relative flex h-full gap-1">
            {days.map((day, i) => {
              const value = valueOf(day, metric)
              const missing = metric === 'cost' && day.requests > 0 && day.unpriced === day.requests
              const formatted = missing ? '未计价' : formatValue(value, metric)
              return (
                <Tooltip key={day.name}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="group relative flex min-w-0 flex-1 flex-col items-center justify-end rounded-sm pb-6 focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={`${day.name}，${names[metric]} ${formatted}`}
                    >
                      <span className="absolute inset-x-0 top-0 bottom-6 rounded-sm group-hover:bg-muted/50 group-focus-visible:bg-muted/50" />
                      <span
                        className="relative w-3/5 max-w-11 rounded-t-[3px] bg-cyan-600 transition-colors group-hover:bg-cyan-500 dark:bg-cyan-500"
                        style={{
                          height: `${(value / upper) * 100}%`,
                          minHeight: value > 0 ? 2 : 0
                        }}
                      />
                      <span
                        className="absolute bottom-0 text-[10px] whitespace-nowrap text-muted-foreground"
                        aria-hidden="true"
                      >
                        {i % interval === 0 ||
                        (i === days.length - 1 && i % interval > interval / 2)
                          ? day.name.slice(5).replace('-', '/')
                          : ''}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="space-y-1">
                    <p>{day.name}</p>
                    <p>
                      {names[metric]}：{formatted}
                    </p>
                    <p>{day.requests.toLocaleString()} 次请求</p>
                    {metric === 'cost' && day.unpriced > 0 && <p>{day.unpriced} 条未计价</p>}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
