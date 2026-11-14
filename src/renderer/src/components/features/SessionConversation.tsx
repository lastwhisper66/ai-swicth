import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ListTree,
  MessageSquareText,
  Terminal,
  Trash2
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { SESSION_SOURCE_NAMES, type SessionDetail, type SessionMessage } from '@shared/sessions'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { cn } from '@renderer/lib/utils'
import { formatSessionTime } from '@renderer/lib/session-format'

export function SessionConversation({
  visible,
  onBack,
  detail,
  search,
  loading,
  error,
  busy,
  onLoadPrevious,
  onLoadMore,
  onDelete,
  onPrevious,
  onNext
}: {
  visible: boolean
  onBack: () => void
  detail: SessionDetail | null
  search: string
  loading: boolean
  error: string | null
  busy: boolean
  onLoadPrevious: () => void
  onLoadMore: () => void
  onDelete: () => void
  onPrevious?: () => void
  onNext?: () => void
}): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'conversation' | 'all'>('conversation')
  useEffect(() => {
    if (!visible || !search.trim()) return
    const timer = window.setTimeout(() => {
      const match = document.querySelector('[data-session-match="true"]')
      match?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [detail?.session.key, search, visible])
  if (!detail)
    return (
      <section
        className={cn(
          'flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-xl border bg-card p-8',
          !visible && 'hidden lg:flex'
        )}
        aria-label="会话内容"
      >
        <div className="max-w-md space-y-3 text-center">
          {loading ? (
            <Spinner className="mx-auto size-8" />
          ) : (
            <MessageSquareText className="mx-auto size-10 text-muted-foreground/50" />
          )}
          <p className="text-sm text-muted-foreground" role="status">
            {loading ? '正在读取对话…' : error || '选择左侧的一个会话，查看完整对话'}
          </p>
          <Button className="lg:hidden" size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft />
            返回列表
          </Button>
        </div>
      </section>
    )
  const timeline = buildTimeline(detail.messages, viewMode, search)
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card',
        !visible && 'hidden lg:flex'
      )}
      aria-label="会话内容"
      aria-busy={loading}
    >
      <header className="shrink-0 space-y-2 border-b p-4">
        <Button className="h-6 lg:hidden" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          返回列表
        </Button>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-base font-semibold break-words">{detail.session.title}</h2>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy || !onPrevious}
              onClick={onPrevious}
              aria-label="上一个会话"
              title="上一个会话"
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy || !onNext}
              onClick={onNext}
              aria-label="下一个会话"
              title="下一个会话"
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={onDelete}
              aria-label="删除整个会话"
              title="删除整个会话"
              className="text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {SESSION_SOURCE_NAMES[detail.session.sourceId]} ·{' '}
          {formatSessionTime(detail.session.updatedAt)}
          {detail.session.archived ? ' · 已归档' : ''}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">会话信息</summary>
          <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3">
            <p className="break-all select-text">
              项目 · {detail.session.project || '未记录项目路径'}
            </p>
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-mono text-[11px] break-all select-text">
                ID · {detail.session.sessionId}
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0"
                aria-label="复制会话 ID"
                title="复制会话 ID"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(detail.session.sessionId)
                    .then(() => toast.success('会话 ID 已复制'))
                    .catch(() => toast.error('复制失败，请选择文字后手动复制。'))
                }}
              >
                <Copy />
              </Button>
            </div>
          </div>
        </details>
      </header>
      <div
        key={detail.session.key}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/10 p-4 lg:p-6"
      >
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="inline-flex items-center rounded-lg border bg-background p-1"
              role="group"
              aria-label="对话显示方式"
            >
              <button
                type="button"
                aria-pressed={viewMode === 'conversation'}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'conversation'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setViewMode('conversation')}
              >
                对话
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'all'}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  viewMode === 'all'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setViewMode('all')}
              >
                完整记录
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              本页 {detail.messages.filter((message) => message.role === 'user').length} 条提问
              {' · '}
              {detail.messages.filter((message) => message.role === 'assistant').length} 条回复
              {' · '}
              {detail.messages.filter((message) => message.role === 'tool').length} 条工具记录
            </span>
          </div>
          {detail.warnings.map((warning) => (
            <Alert key={warning}>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
          {detail.offset > 0 && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onLoadPrevious} disabled={loading || busy}>
                {loading && <Spinner />}加载之前消息
              </Button>
            </div>
          )}
          {timeline.map((item) => {
            if (item.type === 'activity')
              return (
                <ToolActivity
                  key={`activity:${item.call?.id ?? ''}:${item.result?.id ?? ''}`}
                  call={item.call}
                  result={item.result}
                  search={search}
                />
              )
            if (item.type === 'system')
              return <SystemRecord key={item.message.id} message={item.message} search={search} />
            return (
              <ConversationMessage key={item.message.id} message={item.message} search={search} />
            )
          })}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {detail.offset + detail.messages.length < detail.totalMessages && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onLoadMore} disabled={loading || busy}>
                {loading && <Spinner />}加载后续消息
              </Button>
            </div>
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t px-4 py-2 text-[11px] text-muted-foreground">
        只读对话 · 共 {detail.totalMessages} 条记录
        {detail.messages.length > 0 &&
          ` · 已显示 ${detail.offset + 1}–${detail.offset + detail.messages.length} 条`}
      </footer>
    </section>
  )
}

function ConversationMessage({
  message,
  search
}: {
  message: SessionMessage
  search: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败，请选择文字后手动复制。')
    }
  }
  const userMessage = message.role === 'user'
  const contextSegments = splitContextBlocks(message.text)
  return (
    <article
      data-session-match={matchesSearch(message, search) ? 'true' : undefined}
      className={cn(
        'group flex min-w-0 flex-col space-y-2',
        userMessage ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2',
          userMessage ? 'w-full max-w-[88%] lg:max-w-[80%]' : 'w-full'
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'font-semibold',
              userMessage ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {userMessage ? '你' : '助手'}
          </span>
          {message.timestamp && (
            <time className="text-[10px] text-muted-foreground">
              {formatSessionTime(message.timestamp)}
            </time>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void copy()}
          aria-label="复制消息"
          title="复制消息"
          className="size-6 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div
        className={cn(
          'session-markdown min-w-0 rounded-lg border p-4 text-sm select-text',
          userMessage
            ? 'w-fit max-w-[88%] border-primary/10 bg-primary/5 lg:max-w-[80%]'
            : 'w-full bg-background shadow-xs'
        )}
      >
        {contextSegments.map((segment, index) =>
          segment.type === 'context' ? (
            <details
              key={index}
              className="my-2 min-w-0 rounded-lg border bg-muted/35"
              open={matchesSearch(message, search) || undefined}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                <ChevronDown className="size-3.5 shrink-0 transition-transform [&_details[open]_&]:rotate-180" />
                <span>{segment.label}</span>
                <span className="ml-auto">原文</span>
              </summary>
              <pre className="max-h-72 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words select-text">
                {segment.text}
              </pre>
            </details>
          ) : segment.text.trim() ? (
            <MarkdownText key={index} text={segment.text} />
          ) : null
        )}
      </div>
    </article>
  )
}

function MarkdownText({ text }: { text: string }): React.JSX.Element {
  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ alt }) => (
          <span className="text-xs text-muted-foreground">[图片附件{alt ? `：${alt}` : ''}]</span>
        ),
        a: ({ href, children }) => (
          <span
            className="underline decoration-muted-foreground/50 underline-offset-2"
            title={href}
          >
            {children}
          </span>
        )
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function ToolActivity({
  call,
  result,
  search
}: {
  call?: SessionMessage
  result?: SessionMessage
  search: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const messages = [call, result].filter((message): message is SessionMessage => Boolean(message))
  const matches = messages.some((message) => matchesSearch(message, search))
  const title = call?.label || result?.label || '工具记录'
  const preview = compactPreview(call?.text || result?.text || '')
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(messages.map((message) => message.text).join('\n\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败，请选择文字后手动复制。')
    }
  }
  return (
    <details
      className="min-w-0 rounded-lg border bg-muted/20"
      data-session-match={matches ? 'true' : undefined}
      open={matches || undefined}
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs">
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform [&_details[open]_&]:rotate-180" />
        <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{title}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {preview || '工具活动'}
        </span>
        {result && <span className="shrink-0 text-muted-foreground">已完成</span>}
      </summary>
      <div className="space-y-3 border-t px-3 py-3">
        {call && (
          <ToolPayload
            label={call.kind === 'activity' ? '执行详情' : '输入'}
            message={call}
            search={search}
          />
        )}
        {result && <ToolPayload label="结果" message={result} search={search} />}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void copy()}
            aria-label="复制工具记录"
            title="复制工具记录"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </div>
    </details>
  )
}

function ToolPayload({
  label,
  message,
  search
}: {
  label: string
  message: SessionMessage
  search: string
}): React.JSX.Element {
  return (
    <section className="min-w-0 space-y-1.5">
      <h3 className="text-[11px] font-medium text-muted-foreground">{label}</h3>
      <pre className="max-h-96 overflow-auto rounded-md bg-background/70 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words select-text">
        <Highlight text={message.text} search={search} />
      </pre>
    </section>
  )
}

function SystemRecord({
  message,
  search
}: {
  message: SessionMessage
  search: string
}): React.JSX.Element {
  const matches = matchesSearch(message, search)
  return (
    <details
      className="min-w-0 rounded-lg border border-dashed bg-muted/20"
      data-session-match={matches ? 'true' : undefined}
      open={matches || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
        <ChevronDown className="size-3.5 transition-transform [&_details[open]_&]:rotate-180" />
        <ListTree className="size-3.5" />
        {message.label || '系统记录'}
        {message.timestamp && (
          <time className="ml-auto text-[10px] font-normal">
            {formatSessionTime(message.timestamp)}
          </time>
        )}
      </summary>
      <pre className="max-h-96 overflow-auto border-t px-3 py-3 font-mono text-xs whitespace-pre-wrap break-words select-text">
        <Highlight text={message.text} search={search} />
      </pre>
    </details>
  )
}

type TimelineItem =
  | { type: 'message'; message: SessionMessage }
  | { type: 'activity'; call?: SessionMessage; result?: SessionMessage }
  | { type: 'system'; message: SessionMessage }

function buildTimeline(
  messages: SessionMessage[],
  viewMode: 'conversation' | 'all',
  search: string
): TimelineItem[] {
  const results = new Map<string, SessionMessage[]>()
  for (const message of messages) {
    if (message.kind !== 'tool-result' || !message.toolCallId) continue
    const matching = results.get(message.toolCallId) ?? []
    matching.push(message)
    results.set(message.toolCallId, matching)
  }

  const consumed = new Set<string>()
  const timeline: TimelineItem[] = []
  for (const message of messages) {
    if (consumed.has(message.id)) continue
    if (message.role === 'tool') {
      if (message.kind === 'tool-result') {
        consumed.add(message.id)
        timeline.push({ type: 'activity', result: message })
        continue
      }
      let result: SessionMessage | undefined
      if (message.kind === 'tool-call' && message.toolCallId) {
        result = results.get(message.toolCallId)?.find((candidate) => !consumed.has(candidate.id))
        if (result) consumed.add(result.id)
      }
      timeline.push({ type: 'activity', call: message, result })
      continue
    }
    if (message.role === 'system') {
      if (viewMode === 'all' || matchesSearch(message, search))
        timeline.push({ type: 'system', message })
      continue
    }
    timeline.push({ type: 'message', message })
  }
  return timeline
}

function matchesSearch(message: SessionMessage, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase()
  return Boolean(needle && message.text.toLocaleLowerCase().includes(needle))
}

function compactPreview(value: string): string {
  const preview = value.replace(/\s+/gu, ' ').trim()
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview
}

function splitContextBlocks(
  value: string
): Array<{ type: 'markdown'; text: string } | { type: 'context'; label: string; text: string }> {
  const wrappers = [
    { tag: 'environment_context', label: '运行环境上下文' },
    { tag: 'app-context', label: '应用上下文' },
    { tag: 'skills_instructions', label: '技能说明' },
    { tag: 'permissions instructions', label: '权限信息' }
  ]
  const segments: Array<
    { type: 'markdown'; text: string } | { type: 'context'; label: string; text: string }
  > = []
  let cursor = 0
  while (cursor < value.length) {
    const next = wrappers
      .map((wrapper) => ({
        ...wrapper,
        start: value.indexOf(`<${wrapper.tag}>`, cursor)
      }))
      .filter((wrapper) => wrapper.start >= 0)
      .sort((left, right) => left.start - right.start)[0]
    if (!next) break
    const close = `</${next.tag}>`
    const end = value.indexOf(close, next.start + next.tag.length + 2)
    if (end < 0) break
    if (next.start > cursor)
      segments.push({ type: 'markdown', text: value.slice(cursor, next.start) })
    const blockEnd = end + close.length
    segments.push({ type: 'context', label: next.label, text: value.slice(next.start, blockEnd) })
    cursor = blockEnd
  }
  if (cursor < value.length || !segments.length)
    segments.push({ type: 'markdown', text: value.slice(cursor) })
  return segments
}

function Highlight({ text, search }: { text: string; search: string }): React.JSX.Element {
  const needle = search.trim()
  if (!needle) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'giu'))
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? (
          <mark
            key={index}
            className="rounded bg-yellow-300/70 px-0.5 text-inherit dark:bg-yellow-500/50"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
