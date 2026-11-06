import type { ProviderCleanupPreview } from '@shared/provider-cleanup'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Spinner } from '@renderer/components/ui/spinner'

export function ProviderCleanupDialog({
  toolName,
  preview,
  busy,
  error,
  onClose,
  onRefresh,
  onConfirm
}: {
  toolName: string
  preview: ProviderCleanupPreview | null
  busy: boolean
  error: string | null
  onClose: () => void
  onRefresh: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[85svh] min-w-0 flex-col sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{toolName} 清理预览</DialogTitle>
          <DialogDescription>
            确认后将从配置文件中移除以下内容。密钥、令牌和请求头已脱敏，执行前自动备份。
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 space-y-1">
          <p className="text-xs font-medium">目标文件 · {preview?.language.toUpperCase()}</p>
          <p className="text-xs break-all text-muted-foreground select-text">{preview?.path}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          <h3 className="text-sm font-medium">
            将移除 {preview?.entries.length ?? 0} 个
            {preview?.language === 'toml' ? '供应商表' : '供应商分组'}
          </h3>
          {preview?.entries.map((entry) => (
            <section key={entry.location} className="min-w-0 overflow-hidden rounded-lg border">
              <div className="space-y-1 border-b px-4 py-3">
                <h4 className="text-sm font-medium break-all">{entry.label}</h4>
                <p className="font-mono text-xs break-all text-muted-foreground select-text">
                  {entry.location}
                </p>
              </div>
              <pre className="overflow-x-auto bg-muted/40 p-4 text-xs select-text">
                <code>{entry.content}</code>
              </pre>
            </section>
          ))}
          {preview?.entries.length === 0 && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              没有待从配置文件移除的供应商。
            </p>
          )}
          {preview?.notes.map((note) => (
            <p key={note} className="text-xs leading-5 text-muted-foreground">
              {note}
            </p>
          ))}
          {preview?.warnings.map((warning) => (
            <Alert key={warning}>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" disabled={busy} onClick={onRefresh}>
            重新预览
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !preview?.hasChanges || !!error}
            onClick={onConfirm}
          >
            {busy && <Spinner />}
            {busy
              ? '处理中…'
              : `确认清理${preview?.entries.length ? `（${preview.entries.length}）` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
