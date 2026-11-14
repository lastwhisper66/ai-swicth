import { useState } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { SESSION_SOURCE_NAMES, type SessionDeletePreview } from '@shared/sessions'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

export function SessionDeleteDialog({
  preview,
  busy,
  onClose,
  onConfirm
}: {
  preview: SessionDeletePreview
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const [offset, setOffset] = useState(0)
  const clearAll = Boolean(preview.clearSource)
  const pageSize = 50
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {clearAll ? '清空全部' : '永久删除'} {preview.sessions.length} 个会话？
          </DialogTitle>
          <DialogDescription>
            {preview.clearSource && (
              <span className="mb-1 block font-medium text-foreground">
                范围：{SESSION_SOURCE_NAMES[preview.clearSource]} ·{' '}
                {preview.clearSource.endsWith('-wsl') ? 'WSL' : '本地'}
                ，包含全部项目和归档，不受当前筛选限制。
              </span>
            )}
            将永久删除完整对话及关联的本地记录，无法通过本应用恢复。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto">
          <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
            {preview.sessions.slice(offset, offset + pageSize).map((entry) => (
              <div key={entry.key} className="space-y-1 p-3">
                <p className="text-sm font-medium break-words">{entry.title}</p>
                <p className="text-xs break-all text-muted-foreground">
                  {entry.project || '未记录项目'}
                </p>
                <p className="font-mono text-[10px] break-all text-muted-foreground">
                  {entry.sessionId}
                </p>
              </div>
            ))}
          </div>
          {preview.sessions.length > pageSize && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {offset + 1}–{Math.min(offset + pageSize, preview.sessions.length)} /{' '}
                {preview.sessions.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="上一页删除预览"
                  disabled={offset === 0 || busy}
                  onClick={() => setOffset(offset - pageSize)}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="下一页删除预览"
                  disabled={offset + pageSize >= preview.sessions.length || busy}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1 rounded-lg bg-muted/50 p-3">
            {preview.notes.map((note) => (
              <p key={note} className="text-xs leading-5 text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !preview.sessions.length}
            onClick={onConfirm}
          >
            {busy ? <Spinner /> : <Trash2 />}
            {busy ? '正在删除…' : clearAll ? '确认清空全部会话' : '确认永久删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
