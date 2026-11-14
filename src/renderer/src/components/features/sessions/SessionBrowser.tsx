import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Folder,
  ListFilter,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SESSION_SOURCE_NAMES,
  type SessionSourceId,
  type SessionSearchScope,
  type SessionSummary,
  type SessionList,
  type SessionDetail,
  type SessionDeletePreview,
  type SessionDeleteResult
} from '@shared/sessions'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { SessionDeleteDialog } from './SessionDeleteDialog'
import { Spinner } from '@renderer/components/ui/spinner'
import { SessionConversation } from '../SessionConversation'
import { formatSessionTime } from '@renderer/lib/session-format'
import { cn } from '@renderer/lib/utils'

const PAGE_SIZE = 50
export function SessionBrowser({
  sourceId,
  description,
  relatedAction,
  onHome,
  onBusyChange
}: {
  sourceId: SessionSourceId
  description: string
  relatedAction?: (busy: boolean) => ReactNode
  onHome: () => void
  onBusyChange: (busy: boolean) => void
}): React.JSX.Element {
  const [groupBy, setGroupBy] = useState<'time' | 'project'>('project')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [scope, setScope] = useState<SessionSearchScope>('all')
  const [project, setProject] = useState('all')
  const [period, setPeriod] = useState('all')
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const lastRefresh = useRef(-1)
  const [data, setData] = useState<SessionList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const activeKey = useRef<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [messageRequest, setMessageRequest] = useState({ offset: 0, locateSearch: true })
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selected, setSelected] = useState(new Map<string, SessionSummary>())
  const [preview, setPreview] = useState<SessionDeletePreview | null>(null)
  const [deleteResult, setDeleteResult] = useState<SessionDeleteResult | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)
  const selectAllVersion = useRef(0)
  const busyRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useLayoutEffect(() => {
    // Invalidate pending selections before responses can reach the newly committed filters.
    selectAllVersion.current++
  }, [sourceId, search, appliedSearch, scope, groupBy, project, period, refresh])
  useEffect(() => {
    const nextSearch = search.trim()
    if (nextSearch === appliedSearch) return
    const timer = window.setTimeout(() => {
      setAppliedSearch(nextSearch)
      setOffset(0)
      setSelected(new Map())
      setDetail(null)
      setMessageRequest({ offset: 0, locateSearch: true })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search, appliedSearch])
  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => {
      if (current) {
        setLoading(true)
        setError(null)
      }
    })
    const since =
      period === 'all'
        ? undefined
        : new Date(Date.now() - Number(period) * 86_400_000).toISOString()
    const forceRefresh = lastRefresh.current !== refresh
    lastRefresh.current = refresh
    void window.api.sessions
      .list({
        sourceId,
        search: appliedSearch,
        scope,
        groupBy,
        project: project === 'all' ? undefined : project.slice(8),
        since,
        offset,
        limit: PAGE_SIZE,
        refresh: forceRefresh
      })
      .then((response) => {
        if (!current) return
        if (!response.ok) {
          setError(response.error.message)
          setData(null)
          return
        }
        if (offset > 0 && offset >= response.value.total) {
          setOffset(Math.max(0, Math.floor((response.value.total - 1) / PAGE_SIZE) * PAGE_SIZE))
          return
        }
        setData(response.value)
        if (!response.value.sessions.some((entry) => entry.key === activeKey.current)) {
          activeKey.current = null
          setActive(null)
          setDetail(null)
        } else if (forceRefresh) {
          setDetail(null)
          setMessageRequest({ offset: 0, locateSearch: true })
        }
      })
      .catch(() => {
        if (current) {
          setError('无法连接会话服务，请重新打开应用后重试。')
          setData(null)
        }
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [sourceId, appliedSearch, scope, groupBy, project, period, offset, refresh])
  useEffect(() => {
    if (!active) return
    let current = true
    void Promise.resolve().then(() => {
      if (current) {
        setDetailLoading(true)
        setDetailError(null)
      }
    })
    void window.api.sessions
      .read({
        key: active,
        offset: messageRequest.offset,
        search: messageRequest.locateSearch ? appliedSearch : undefined
      })
      .then((response) => {
        if (!current) return
        if (!response.ok) {
          setDetailError(response.error.message)
          return
        }
        setDetail((previous) => {
          const page = response.value
          if (
            messageRequest.locateSearch ||
            previous?.session.key !== active ||
            previous.session.revision !== page.session.revision
          )
            return page
          if (page.offset === previous.offset + previous.messages.length)
            return {
              ...page,
              offset: previous.offset,
              messages: [...previous.messages, ...page.messages]
            }
          if (page.offset + page.messages.length === previous.offset)
            return { ...page, messages: [...page.messages, ...previous.messages] }
          return page
        })
      })
      .catch(() => {
        if (current) setDetailError('无法读取此会话，请刷新后重试。')
      })
      .finally(() => {
        if (current) setDetailLoading(false)
      })
    return () => {
      current = false
    }
  }, [active, messageRequest, appliedSearch])

  function resetFilter(): void {
    activeKey.current = null
    setOffset(0)
    setSelected(new Map())
    setActive(null)
    setDetailLoading(false)
    setDetailError(null)
    setDetail(null)
    setDeleteResult(null)
  }
  function openSession(entry: SessionSummary): void {
    if (busy || active === entry.key) return
    setDetail(null)
    setDetailError(null)
    setMessageRequest({ offset: 0, locateSearch: true })
    activeKey.current = entry.key
    setActive(entry.key)
  }
  function toggleSelected(entry: SessionSummary): void {
    setSelected((previous) => {
      const next = new Map(previous)
      if (next.has(entry.key)) next.delete(entry.key)
      else next.set(entry.key, entry)
      return next
    })
  }
  function setOperationBusy(value: boolean): void {
    busyRef.current = value
    setBusy(value)
    onBusyChange(value)
  }
  async function prepareDelete(entries: SessionSummary[]): Promise<void> {
    if (busyRef.current || !entries.length) return
    if (entries.length > 50_000) {
      toast.error('每次最多删除 50,000 个会话，请缩小筛选条件。')
      return
    }
    setOperationBusy(true)
    setOperationError(null)
    try {
      const response = await window.api.sessions.previewDelete({
        sessions: entries.map(({ key, revision }) => ({ key, revision }))
      })
      if (!mounted.current) return
      if (!response.ok) {
        setOperationError(response.error.message)
        return
      }
      setPreview(response.value)
    } catch {
      setOperationError('无法生成删除预览，请刷新后重试。')
    } finally {
      if (mounted.current) setOperationBusy(false)
    }
  }
  async function prepareClear(): Promise<void> {
    if (busyRef.current || selectingAll) return
    setOperationBusy(true)
    setOperationError(null)
    try {
      const response = await window.api.sessions.previewClear({ sourceId })
      if (!mounted.current) return
      if (!response.ok) {
        setOperationError(response.error.message)
        return
      }
      if (!response.value.sessions.length) {
        toast.info('当前工具与环境没有可清理的会话。')
        return
      }
      setPreview(response.value)
    } catch {
      setOperationError('无法生成清空预览，请刷新后重试。')
    } finally {
      if (mounted.current) setOperationBusy(false)
    }
  }
  async function confirmDelete(): Promise<void> {
    if (busyRef.current || !preview) return
    setOperationBusy(true)
    setOperationError(null)
    try {
      const response = await window.api.sessions.delete({ token: preview.token })
      if (!mounted.current) return
      if (!response.ok) {
        // Tokens are consumed on submission; the next attempt requires a new preview.
        setPreview(null)
        setOperationError(response.error.message)
        setRefresh((value) => value + 1)
        return
      }
      setDeleteResult(response.value)
      const removed = new Set(response.value.deleted)
      setSelected(new Map())
      if (active && removed.has(active)) {
        activeKey.current = null
        setActive(null)
        setDetail(null)
      }
      setPreview(null)
      if (removed.size) toast.success(`已删除 ${removed.size} 个完整会话`)
      if (response.value.failures.length)
        toast.error(`${response.value.failures.length} 个会话未能完整删除，请查看下方原因。`)
      if (response.value.warnings.length)
        toast.warning('会话已删除，部分关联记录未能清理，请查看下方说明。')
      setOffset(0)
      setRefresh((value) => value + 1)
    } catch {
      setPreview(null)
      setOperationError('连接中断，删除结果尚未确认。请刷新列表核对后再操作。')
      setRefresh((value) => value + 1)
    } finally {
      if (mounted.current) setOperationBusy(false)
    }
  }
  async function selectAllMatching(): Promise<void> {
    if (busyRef.current || selectingAll || loading || search.trim() !== appliedSearch) return
    const version = ++selectAllVersion.current
    const isCurrent = (): boolean => mounted.current && version === selectAllVersion.current
    setSelectingAll(true)
    try {
      const since =
        period === 'all'
          ? undefined
          : new Date(Date.now() - Number(period) * 86_400_000).toISOString()
      const response = await window.api.sessions.selectAll({
        sourceId,
        search: appliedSearch,
        scope,
        groupBy,
        project: project === 'all' ? undefined : project.slice(8),
        since,
        offset: 0,
        limit: 100
      })
      if (!isCurrent()) return
      if (!response.ok) {
        toast.error(response.error.message)
        return
      }
      setSelected(new Map(response.value.map((entry) => [entry.key, entry])))
      toast.success(`已选择当前筛选条件下的 ${response.value.length} 个会话`)
    } catch {
      if (isCurrent()) toast.error('无法全选会话，请刷新后重试。')
    } finally {
      if (mounted.current) setSelectingAll(false)
    }
  }

  const sessions = data?.sessions ?? []
  const activeIndex = sessions.findIndex((entry) => entry.key === active)
  const pageSelected = sessions.length > 0 && sessions.every((entry) => selected.has(entry.key))
  const groups = new Map<string, SessionSummary[]>()
  for (const entry of sessions) {
    const label =
      groupBy === 'project'
        ? entry.project || '未记录项目'
        : new Date(entry.updatedAt).toLocaleDateString('zh-CN')
    groups.set(label, [...(groups.get(label) ?? []), entry])
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 h-7 text-xs text-muted-foreground"
            disabled={busy}
            onClick={onHome}
          >
            <ArrowLeft />
            返回首页
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {SESSION_SOURCE_NAMES[sourceId]} · 会话管理
            </h1>
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              {sourceId.endsWith('-wsl') ? data?.source.distribution || 'WSL' : '本地'}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {relatedAction?.(busy)}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || loading || selectingAll}
            onClick={() => {
              setRefresh((value) => value + 1)
              setSelected(new Map())
            }}
          >
            <RefreshCw className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy || loading || selectingAll}
            onClick={() => void prepareClear()}
          >
            {busy ? <Spinner /> : <Trash2 />}清空全部会话
          </Button>
        </div>
      </header>
      {operationError && (
        <Alert variant="destructive" className="shrink-0 pr-16">
          <AlertDescription className="max-h-20 overflow-y-auto">{operationError}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1 right-2"
            aria-label="关闭操作提示"
            onClick={() => setOperationError(null)}
          >
            关闭
          </Button>
        </Alert>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <section
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border lg:w-80 lg:shrink-0 lg:flex-none xl:w-90',
            active && 'hidden lg:flex'
          )}
          aria-label="会话列表"
          aria-busy={loading}
        >
          <div className="grid shrink-0 grid-cols-2 gap-2 border-b bg-muted/15 p-3">
            <div className="relative col-span-2 min-w-0">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                value={search}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索会话…"
                aria-label="搜索会话"
              />
            </div>
            <FilterSelect
              value={scope}
              label="搜索范围"
              disabled={busy}
              onChange={(value) => {
                setScope(value as SessionSearchScope)
                resetFilter()
              }}
              options={[
                ['all', '全部内容'],
                ['title', '标题'],
                ['content', '消息内容'],
                ['id', '会话 ID']
              ]}
            />
            <FilterSelect
              value={project}
              label="项目筛选"
              disabled={busy}
              onChange={(value) => {
                setProject(value)
                resetFilter()
              }}
              options={[
                ['all', '所有项目'],
                ...(data?.projects ?? []).map((item): [string, string] => [
                  `project:${item.path}`,
                  `${item.path || '未记录项目'}（${item.count}）`
                ])
              ]}
              align="end"
            />
            <FilterSelect
              value={period}
              label="时间范围"
              disabled={busy}
              onChange={(value) => {
                setPeriod(value)
                resetFilter()
              }}
              options={[
                ['all', '全部时间'],
                ['1', '最近 24 小时'],
                ['7', '最近 7 天'],
                ['30', '最近 30 天']
              ]}
            />
            <div className="flex items-center gap-1" aria-label="列表显示方式">
              <Button
                size="icon-sm"
                variant={groupBy === 'project' ? 'secondary' : 'ghost'}
                aria-label="按项目分组"
                title="按项目分组"
                aria-pressed={groupBy === 'project'}
                disabled={busy}
                onClick={() => {
                  setGroupBy('project')
                  setOffset(0)
                }}
              >
                <Folder />
              </Button>
              <Button
                size="icon-sm"
                variant={groupBy === 'time' ? 'secondary' : 'ghost'}
                aria-label="按时间排序"
                title="按时间排序"
                aria-pressed={groupBy === 'time'}
                disabled={busy}
                onClick={() => {
                  setGroupBy('time')
                  setOffset(0)
                }}
              >
                <CalendarDays />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-1.5 text-xs text-muted-foreground"
                disabled={
                  busy || (!search && scope === 'all' && period === 'all' && project === 'all')
                }
                onClick={() => {
                  setSearch('')
                  setAppliedSearch('')
                  setScope('all')
                  setProject('all')
                  setPeriod('all')
                  resetFilter()
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                aria-label="本页全选会话"
                disabled={busy || selectingAll || loading || !sessions.length}
                checked={
                  pageSelected
                    ? true
                    : sessions.some((entry) => selected.has(entry.key))
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={() =>
                  setSelected((previous) => {
                    const next = new Map(previous)
                    for (const entry of sessions) {
                      if (pageSelected) next.delete(entry.key)
                      else next.set(entry.key, entry)
                    }
                    return next
                  })
                }
              />
              {selected.size ? `已选 ${selected.size} 个` : '本页全选'}
            </label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                disabled={
                  busy ||
                  loading ||
                  !sessions.length ||
                  selectingAll ||
                  search.trim() !== appliedSearch
                }
                onClick={() => void selectAllMatching()}
              >
                {selectingAll && <Spinner />}
                全选结果
              </Button>
              {selected.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={busy || selectingAll}
                  onClick={() => setSelected(new Map())}
                >
                  取消选择
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive"
                disabled={busy || selectingAll || !selected.size || loading}
                onClick={() => void prepareDelete([...selected.values()])}
              >
                {busy ? <Spinner /> : <Trash2 />}删除{selected.size > 0 && `（${selected.size}）`}
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div
                className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground"
                role="status"
              >
                <Spinner />
                {appliedSearch && (scope === 'all' || scope === 'content')
                  ? '正在检索对话内容…'
                  : '正在读取会话…'}
              </div>
            ) : error ? (
              <div className="space-y-3 p-4">
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  刷新
                </Button>
              </div>
            ) : !sessions.length ? (
              <div className="space-y-2 px-4 py-4 text-center text-xs text-muted-foreground">
                <ListFilter className="mx-auto mb-2 hidden size-6 opacity-50 xl:block" />
                <p>{data?.source.message || '没有符合条件的会话'}</p>
                <p>试试重置筛选，或刷新以重新读取记录</p>
              </div>
            ) : (
              [...groups].map(([label, entries]) => (
                <div key={label}>
                  <div
                    className="sticky top-0 z-10 flex items-center gap-1.5 border-y bg-muted px-3 py-2 text-[11px] font-medium"
                    title={label}
                  >
                    {groupBy === 'project' ? (
                      <Folder className="size-3 shrink-0" />
                    ) : (
                      <CalendarDays className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">{entries.length}</span>
                  </div>
                  {entries.map((entry) => (
                    <div
                      key={entry.key}
                      className={cn(
                        'relative flex items-start gap-3 border-b border-border/60 px-3 py-4 transition-colors hover:bg-muted/40',
                        active === entry.key &&
                          'bg-primary/5 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                      )}
                    >
                      <Checkbox
                        className="mt-1"
                        aria-label={`选择会话：${entry.title}`}
                        disabled={busy || selectingAll}
                        checked={selected.has(entry.key)}
                        onCheckedChange={() => toggleSelected(entry)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 space-y-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={busy}
                        onClick={() => openSession(entry)}
                        aria-current={active === entry.key ? 'true' : undefined}
                      >
                        <p className="line-clamp-2 text-sm font-medium break-words">
                          {entry.title}
                        </p>
                        <p
                          className="truncate text-[11px] text-muted-foreground"
                          title={entry.project}
                        >
                          {entry.project || '未记录项目'}
                        </p>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <time>{formatSessionTime(entry.updatedAt)}</time>
                          {entry.archived && <span>已归档</span>}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <footer className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              {data?.total ?? 0} 个会话
              {(data?.total ?? 0) > 0 &&
                ` · ${offset + 1}–${Math.min(offset + PAGE_SIZE, data!.total)}`}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="上一页"
                disabled={busy || loading || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="下一页"
                disabled={busy || loading || offset + PAGE_SIZE >= (data?.total ?? 0)}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                <ArrowRight />
              </Button>
            </div>
          </footer>
        </section>
        <SessionConversation
          visible={active !== null}
          onBack={() => {
            activeKey.current = null
            setActive(null)
            setDetailLoading(false)
            setDetailError(null)
            setDetail(null)
          }}
          detail={detail}
          search={appliedSearch}
          loading={active !== null && detailLoading}
          error={active !== null ? detailError : null}
          busy={busy || selectingAll}
          onLoadPrevious={() => {
            if (detail)
              setMessageRequest({ offset: Math.max(0, detail.offset - 100), locateSearch: false })
          }}
          onLoadMore={() => {
            if (detail)
              setMessageRequest({
                offset: detail.offset + detail.messages.length,
                locateSearch: false
              })
          }}
          onDelete={() => {
            if (detail) void prepareDelete([detail.session])
          }}
          onPrevious={activeIndex > 0 ? () => openSession(sessions[activeIndex - 1]) : undefined}
          onNext={
            activeIndex >= 0 && activeIndex < sessions.length - 1
              ? () => openSession(sessions[activeIndex + 1])
              : undefined
          }
        />
      </div>
      <div
        className={cn(
          'shrink-0 space-y-1 text-[11px] text-muted-foreground',
          active && 'hidden lg:block'
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="min-w-0 flex-1 truncate select-text"
            title={data?.source.directories?.join('\n') || data?.source.directory}
          >
            {data?.source.distribution && `${data.source.distribution} · `}
            {(data?.source.directories?.length
              ? data.source.directories.join(' · ')
              : data?.source.directory) || SESSION_SOURCE_NAMES[sourceId]}
          </span>
        </div>
        {(Boolean(data?.warnings.length) ||
          Boolean(deleteResult?.failures.length) ||
          Boolean(deleteResult?.warnings.length)) && (
          <details
            className="rounded border px-2 py-1"
            open={Boolean(deleteResult?.failures.length || deleteResult?.warnings.length)}
          >
            <summary className="cursor-pointer">
              读取与删除说明（
              {(data?.warnings.length ?? 0) +
                (deleteResult?.failures.length ?? 0) +
                (deleteResult?.warnings.length ?? 0)}
              ）
            </summary>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto break-words">
              {data?.warnings.map((warning) => (
                <p key={warning} role="status">
                  {warning}
                </p>
              ))}
              {deleteResult?.failures.map((failure) => (
                <p key={failure.key} className="text-destructive" role="alert">
                  {failure.title}：{failure.message}
                </p>
              ))}
              {deleteResult?.warnings.map((warning) => (
                <p key={`${warning.key}:${warning.message}`} role="status">
                  {warning.title}：{warning.message}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
      {preview && (
        <SessionDeleteDialog
          key={preview.token}
          preview={preview}
          busy={busy}
          onClose={() => setPreview(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  )
}

function FilterSelect({
  value,
  label,
  options,
  disabled,
  onChange,
  align = 'start'
}: {
  value: string
  label: string
  options: Array<[string, string]>
  disabled: boolean
  onChange: (value: string) => void
  align?: 'start' | 'end'
}): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-8 w-full min-w-0 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent align={align} sideOffset={8} className="max-h-64 max-w-[min(42rem,90vw)]">
        {options.map(([id, name]) => (
          <SelectItem key={id} value={id} className="max-w-full break-all" title={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
