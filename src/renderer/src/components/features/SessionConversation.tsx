import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, MessageSquareText, Trash2 } from 'lucide-react'
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
          !visible && 'hidden md:flex'
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
          <Button className="md:hidden" size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft />
            返回列表
          </Button>
        </div>
      </section>
    )
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card',
        !visible && 'hidden md:flex'
      )}
      aria-label="会话内容"
      aria-busy={loading}
    >
      <header className="shrink-0 space-y-2 border-b p-4">
        <Button className="h-6 md:hidden" size="sm" variant="ghost" onClick={onBack}>
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
        <p
          className="truncate text-xs text-muted-foreground select-text"
          title={detail.session.project}
        >
          {detail.session.project || '未记录项目路径'}
        </p>
        <p className="font-mono text-[11px] break-all text-muted-foreground select-text">
          ID · {detail.session.sessionId}
        </p>
      </header>
      <div
        key={detail.session.key}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 lg:p-6"
      >
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
        {detail.messages.map((message) => (
          <ConversationMessage key={message.id} message={message} search={search} />
        ))}
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
      <footer className="shrink-0 border-t px-4 py-2 text-[11px] text-muted-foreground">
        只读对话 · 共 {detail.totalMessages} 条记录
        {detail.messages.length > 0 &&
          ` · 已显示 ${detail.offset + 1}–${detail.offset + detail.messages.length} 条`}
        {' · '}工具调用与结果可展开查看
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
  if (message.role === 'tool' || message.role === 'system')
    return (
      <details
        className="min-w-0 rounded-lg border bg-muted/25"
        data-session-match={
          search.trim() &&
          message.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
            ? 'true'
            : undefined
        }
        open={Boolean(
          search.trim() &&
          message.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
        )}
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
          {message.label || (message.role === 'tool' ? '工具记录' : '系统记录')}
        </summary>
        <div className="flex justify-end border-t px-2 pt-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void copy()}
            aria-label="复制工具记录"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <pre className="max-h-96 overflow-auto px-3 pb-3 font-mono text-xs whitespace-pre-wrap break-all select-text">
          <Highlight text={message.text} search={search} />
        </pre>
      </details>
    )
  return (
    <article
      data-session-match={
        search.trim() &&
        message.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
          ? 'true'
          : undefined
      }
      className={cn('group min-w-0 space-y-2', message.role === 'user' && 'ml-4 lg:ml-12')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'font-semibold',
              message.role === 'user' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {message.role === 'user' ? '你' : '助手'}
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
          'session-markdown min-w-0 rounded-xl border p-4 text-sm select-text',
          message.role === 'user' ? 'bg-muted/50' : 'bg-background'
        )}
      >
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ alt }) => (
              <span className="text-xs text-muted-foreground">
                [图片附件{alt ? `：${alt}` : ''}]
              </span>
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
          {message.text}
        </ReactMarkdown>
      </div>
    </article>
  )
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
