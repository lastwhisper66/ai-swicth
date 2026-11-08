import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ListFilter,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react'
import { TOOL_NAMES, type ToolId } from '@shared/ipc'
import type { UsageGroup, UsageQuery, UsageSnapshot } from '@shared/usage'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@renderer/components/ui/empty'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { cacheRate, formatCost, formatTokens, summaryCost } from '@renderer/lib/usage-format'
import { cn } from '@renderer/lib/utils'
import { UsageChart, type UsageMetric } from './UsageChart'
import { UsagePricesDialog } from './UsagePricesDialog'

const PAGE_SIZE = 25
const metrics: { id: UsageMetric; label: string; help: string }[] = [
  {
    id: 'cost',
    label: '总成本',
    help: '优先使用日志金额，其余按模型价格估算（USD）。缺少价格的记录不计入金额。'
  },
  {
    id: 'requests',
    label: '总请求数',
    help: '本地日志中包含有效用量的模型响应数。未记录用量的请求和失败请求无法统计。'
  },
  {
    id: 'tokens',
    label: '总 Tokens',
    help: '新增输入、输出、缓存读取与缓存写入之和。Codex 的输入已扣除缓存读取，避免重复计算。'
  },
  {
    id: 'cache',
    label: '缓存命中率',
    help: '缓存读取 Tokens ÷（新增输入 + 缓存读取 + 缓存写入），按 Token 数加权。'
  }
]

export function UsagePage(): React.JSX.Element {
  const [query, setQuery] = useState<UsageQuery>({ days: 7, toolId: 'all', offset: 0 })
  const [refresh, setRefresh] = useState(0)
  const previousRefresh = useRef(0)
  const [data, setData] = useState<UsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<UsageMetric>('tokens')
  const [tab, setTab] = useState('requests')
  const [pricing, setPricing] = useState(false)

  useEffect(() => {
    let active = true
    const forceRefresh = previousRefresh.current !== refresh
    previousRefresh.current = refresh
    void (async () => {
      try {
        if (!window.api?.usage) throw new Error('用量接口未加载，请完整重启应用后重试。')
        const response = await window.api.usage.query({ ...query, refresh: forceRefresh })
        if (!active) return
        if (response.ok) setData(response.value)
        else {
          setError(response.error.message)
          setData(null)
        }
      } catch (failure) {
        if (active) {
          setData(null)
          setError(
            failure instanceof Error ? failure.message : '无法读取用量，请重新打开应用后重试。'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [query, refresh])

  function filter(next: Partial<UsageQuery>): void {
    setLoading(true)
    setError(null)
    setQuery((current) => ({ ...current, ...next, offset: 0 }))
  }
  function changePage(offset: number): void {
    setLoading(true)
    setError(null)
    setQuery((current) => ({ ...current, offset }))
  }
  function reload(): void {
    setLoading(true)
    setError(null)
    setRefresh((n) => n + 1)
  }
  const totals = data?.totals
  const input = totals ? totals.input + totals.cacheRead + totals.cacheWrite : 0
  const values = totals
    ? {
        cost: `${totals.estimated ? '≈' : ''}${summaryCost(totals)}`,
        requests: totals.requests.toLocaleString('zh-CN'),
        tokens: formatTokens(totals.tokens),
        cache: input > 0 ? `${cacheRate(totals).toFixed(1)}%` : '—'
      }
    : null
  const details = totals
    ? {
        cost: totals.unpriced
          ? `${totals.unpriced.toLocaleString()} 条未计价`
          : totals.estimated
            ? '按模型价格估算 · USD'
            : '日志记录金额 · USD',
        requests: '含用量记录的模型响应',
        tokens: `输入 ${formatTokens(totals.input)} · 输出 ${formatTokens(totals.output)}`,
        cache: `命中 ${formatTokens(totals.cacheRead)} Tokens`
      }
    : null

  return (
    <section className="space-y-5" aria-labelledby="usage-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="size-5" />
          <h1 id="usage-title" className="text-xl font-semibold tracking-tight">
            用量统计
          </h1>
          <Help text="从本地 Claude Code / Codex 会话日志汇总，包含子代理和已归档日志。供应商以日志为准，缺失时标为「会话日志」。不包含 Copilot 或云端账单。" />
        </div>
        <div className="flex items-center gap-2">
          <span
            role="status"
            className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex"
          >
            {loading ? (
              <>
                <Spinner className="size-3" />
                读取日志中
              </>
            ) : data ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                同步于{' '}
                {new Date(data.scannedAt).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </>
            ) : null}
          </span>
          <Button variant="outline" size="sm" disabled={loading} onClick={reload}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            {loading ? '同步中…' : '同步日志'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || loading}
            onClick={() => setPricing(true)}
          >
            <SlidersHorizontal className="size-3.5" />
            模型价格
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="用量筛选">
        <FilterSelect
          label="统计时间"
          value={String(query.days)}
          onChange={(value) =>
            filter({
              days: Number(value) as UsageQuery['days'],
              provider: undefined,
              model: undefined
            })
          }
          icon={<CalendarDays />}
        >
          <SelectItem value="1">今天</SelectItem>
          <SelectItem value="7">近 7 天</SelectItem>
          <SelectItem value="30">近 30 天</SelectItem>
          <SelectItem value="90">近 90 天</SelectItem>
        </FilterSelect>
        <FilterSelect
          label="应用"
          value={query.toolId}
          onChange={(value) =>
            filter({ toolId: value as UsageQuery['toolId'], provider: undefined, model: undefined })
          }
        >
          <SelectItem value="all">全部本机应用</SelectItem>
          {(Object.keys(TOOL_NAMES) as ToolId[]).map((toolId) => (
            <SelectItem key={toolId} value={toolId}>
              <ToolIcon toolId={toolId} />
              {TOOL_NAMES[toolId]}
            </SelectItem>
          ))}
        </FilterSelect>
        <span className="mx-1 hidden h-5 border-l sm:block" />
        <FilterSelect
          label="供应商"
          value={query.provider ?? '*'}
          onChange={(value) => filter({ provider: value === '*' ? undefined : value })}
          icon={<ListFilter />}
        >
          <SelectItem value="*">全部供应商</SelectItem>
          {data?.providerOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect
          label="模型"
          value={query.model ?? '*'}
          onChange={(value) => filter({ model: value === '*' ? undefined : value })}
        >
          <SelectItem value="*">全部模型</SelectItem>
          {data?.modelOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </FilterSelect>
        {(query.provider || query.model || query.toolId !== 'all' || query.days !== 7) && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() =>
              filter({ days: 7, toolId: 'all', provider: undefined, model: undefined })
            }
          >
            重置筛选
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !!data?.warnings.length && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">部分日志未纳入统计</p>
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border bg-background" aria-busy={loading}>
        <div className="grid grid-cols-2 border-b lg:grid-cols-4">
          {metrics.map((item) => (
            <div
              key={item.id}
              className="relative min-w-0 border-b even:border-l lg:border-b-0 lg:not-first:border-l"
            >
              <button
                type="button"
                className={cn(
                  'w-full px-5 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-3px]',
                  metric === item.id && 'bg-muted/20'
                )}
                aria-pressed={metric === item.id}
                onClick={() => setMetric(item.id)}
              >
                <span className="block text-xs text-muted-foreground">{item.label}</span>
                <span className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">
                  {loading ? (
                    <span className="block h-8 w-24 animate-pulse rounded bg-muted" />
                  ) : (
                    (values?.[item.id] ?? '—')
                  )}
                </span>
                <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">
                  {loading ? '正在汇总本地日志…' : (details?.[item.id] ?? '暂无数据')}
                </span>
              </button>
              <div className="absolute top-3 right-3">
                <Help text={item.help} />
              </div>
              {metric === item.id && (
                <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-cyan-600 dark:bg-cyan-500" />
              )}
            </div>
          ))}
        </div>
        {loading ? (
          <div className="flex h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            正在读取用量…
          </div>
        ) : data ? (
          <UsageChart days={data.days} metric={metric} />
        ) : (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            同步日志后显示趋势
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-0 overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <TabsList variant="line" className="gap-4">
            <TabsTrigger value="requests">
              请求日志
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {loading ? '…' : (totals?.requests.toLocaleString() ?? 0)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="providers">
              供应商
              <Badge variant="secondary" className="text-[10px]">
                {loading ? '…' : (data?.providers.length ?? 0)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="models">
              模型
              <Badge variant="secondary" className="text-[10px]">
                {loading ? '…' : (data?.models.length ?? 0)}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <span className="text-[11px] text-muted-foreground">
            {tab === 'requests' ? '按时间倒序' : '按 Tokens 降序'} · 本地日志
          </span>
        </div>
        <TabsContent value="requests" className="mt-0">
          <Table className="whitespace-nowrap text-xs">
            <TableHeader className="bg-muted/50">
              <TableRow>
                {[
                  '时间',
                  '应用',
                  '供应商',
                  '模型',
                  '成本',
                  '新增输入',
                  '输出',
                  '缓存读取',
                  '缓存写入'
                ].map((name, i) => (
                  <TableHead key={name} className={cn('h-9 px-4 text-xs', i >= 4 && 'text-right')}>
                    {name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading &&
                data?.records.map((row) => (
                  <TableRow key={row.id} className="h-11 tabular-nums">
                    <TableCell
                      className="px-4"
                      title={new Date(row.timestamp).toLocaleString('zh-CN')}
                    >
                      {new Date(row.timestamp).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })}
                    </TableCell>
                    <TableCell className="px-4">
                      <span className="flex items-center gap-2">
                        <ToolIcon toolId={row.toolId} className="size-3.5" />
                        {TOOL_NAMES[row.toolId]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-44 truncate px-4" title={row.provider}>
                      {row.provider}
                    </TableCell>
                    <TableCell
                      className="max-w-56 truncate px-4 font-mono text-[11px]"
                      title={row.model}
                    >
                      {row.model}
                    </TableCell>
                    <TableCell
                      className="px-4 text-right font-medium"
                      title={
                        row.cost === null
                          ? '请在模型价格中设置单价'
                          : row.estimated
                            ? '按自定义模型价格估算'
                            : '日志记录金额'
                      }
                    >
                      {row.cost === null ? (
                        <span className="text-muted-foreground">未计价</span>
                      ) : (
                        `${row.estimated ? '≈' : ''}${formatCost(row.cost, true)}`
                      )}
                    </TableCell>
                    {[row.input, row.output, row.cacheRead, row.cacheWrite].map((value, i) => (
                      <TableCell key={i} className="px-4 text-right" title={value.toLocaleString()}>
                        {formatTokens(value)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {loading ? (
            <LoadingRows />
          ) : !data?.records.length ? (
            <NoUsage error={!!error} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>
                第 {data.offset + 1}–{data.offset + data.records.length} 条，共{' '}
                {data.totals.requests.toLocaleString()} 条
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="上一页"
                  disabled={data.offset === 0}
                  onClick={() => changePage(Math.max(0, data.offset - PAGE_SIZE))}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-12 text-center tabular-nums">
                  {Math.floor(data.offset / PAGE_SIZE) + 1} /{' '}
                  {Math.ceil(data.totals.requests / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="下一页"
                  disabled={data.offset + PAGE_SIZE >= data.totals.requests}
                  onClick={() => changePage(data.offset + PAGE_SIZE)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="providers" className="mt-0">
          <GroupTable
            groups={data?.providers ?? []}
            kind="供应商"
            loading={loading}
            error={!!error}
            onSelect={(name) => {
              filter({ provider: name })
              setTab('requests')
            }}
          />
        </TabsContent>
        <TabsContent value="models" className="mt-0">
          <GroupTable
            groups={data?.models ?? []}
            kind="模型"
            loading={loading}
            error={!!error}
            onSelect={(name) => {
              filter({ model: name })
              setTab('requests')
            }}
          />
        </TabsContent>
      </Tabs>
      <p className="text-xs leading-5 text-muted-foreground">
        按本机日期统计，仅包含日志已记录的用量；删除日志后对应数据也会消失。费用为日志金额或自定义单价估算，未计价记录不会按零费用处理。
      </p>
      {pricing && data && (
        <UsagePricesDialog
          prices={data.prices}
          models={data.modelOptions}
          onClose={() => setPricing(false)}
          onSaved={() => {
            setPricing(false)
            reload()
          }}
        />
      )}
    </section>
  )
}

function Help({ text }: { text: string }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 text-xs leading-5">{text}</TooltipContent>
    </Tooltip>
  )
}
function FilterSelect({
  label,
  value,
  onChange,
  icon,
  children
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="max-w-56 text-xs">
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}
function LoadingRows(): React.JSX.Element {
  return (
    <div role="status" className="space-y-4 p-4" aria-label="正在读取用量">
      {[0, 1, 2, 3, 4].map((n) => (
        <div key={n} className="h-6 animate-pulse rounded bg-muted/60" />
      ))}
    </div>
  )
}
function NoUsage({ error }: { error: boolean }): React.JSX.Element {
  return (
    <Empty className="py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BarChart3 />
        </EmptyMedia>
        <EmptyTitle>{error ? '用量读取失败' : '暂无用量记录'}</EmptyTitle>
        <EmptyDescription>
          {error
            ? '请检查上方错误提示，处理后重新同步日志。'
            : '此范围内没有可统计的日志。可以调整筛选，或使用 Claude Code / Codex 后同步；日志目录沿用各工具的配置路径。'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
function GroupTable({
  groups,
  kind,
  loading,
  error,
  onSelect
}: {
  groups: UsageGroup[]
  kind: string
  loading: boolean
  error: boolean
  onSelect: (name: string) => void
}): React.JSX.Element {
  return (
    <>
      <Table className="whitespace-nowrap text-xs">
        <TableHeader className="bg-muted/50">
          <TableRow>
            {[kind, '请求数', '总 Tokens', '新增输入', '输出', '缓存命中率', '成本'].map(
              (name, i) => (
                <TableHead key={name} className={cn('h-9 px-4 text-xs', i > 0 && 'text-right')}>
                  {name}
                </TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading &&
            groups.map((row) => (
              <TableRow key={row.name} className="h-12 tabular-nums">
                <TableCell className="px-4">
                  <Button
                    variant="link"
                    className="h-auto max-w-64 justify-start p-0 text-xs"
                    onClick={() => onSelect(row.name)}
                    title={`查看 ${row.name} 的请求`}
                  >
                    <span className="truncate">{row.name}</span>
                  </Button>
                </TableCell>
                <TableCell className="px-4 text-right">{row.requests.toLocaleString()}</TableCell>
                <TableCell className="px-4 text-right font-medium">
                  {formatTokens(row.tokens)}
                </TableCell>
                <TableCell className="px-4 text-right">{formatTokens(row.input)}</TableCell>
                <TableCell className="px-4 text-right">{formatTokens(row.output)}</TableCell>
                <TableCell className="px-4 text-right">
                  {row.input + row.cacheRead + row.cacheWrite > 0
                    ? `${cacheRate(row).toFixed(1)}%`
                    : '—'}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <span>
                    {row.estimated ? '≈' : ''}
                    {summaryCost(row)}
                  </span>
                  {row.unpriced > 0 && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {row.unpriced} 条未计价
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {loading ? <LoadingRows /> : groups.length === 0 ? <NoUsage error={error} /> : null}
    </>
  )
}
