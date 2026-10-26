import { useEffect, useId, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { ConfigPreview as ConfigPreviewData, PreviewConfigInput } from '@shared/ipc'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'

export function ConfigPreview({
  input,
  disabled = false
}: {
  input: PreviewConfigInput
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  const [refresh, setRefresh] = useState(0)
  const requestKey = JSON.stringify(input)

  return (
    <PreviewContent
      key={`${requestKey}:${refresh}`}
      id={id}
      requestKey={requestKey}
      disabled={disabled}
      onRefresh={() => setRefresh((value) => value + 1)}
    />
  )
}

function PreviewContent({
  id,
  requestKey,
  disabled,
  onRefresh
}: {
  id: string
  requestKey: string
  disabled: boolean
  onRefresh: () => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<ConfigPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const input = JSON.parse(requestKey) as PreviewConfigInput

  useEffect(() => {
    let active = true
    window.api
      .previewConfig(JSON.parse(requestKey) as PreviewConfigInput)
      .then((result) => {
        if (!active) return
        if (result.ok) setPreview(result.value)
        else setError(result.error.message)
      })
      .catch(() => {
        if (active) setError('无法读取配置，请重新打开应用后重试。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [requestKey])

  return (
    <div id={id} className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {input.providerId || input.draft
            ? '当前模型配置：合并供应商草稿与已保存的共通配置，应用后写入文件。'
            : '当前文件：展示所选配置目录中实际保存的内容。'}
          API Key 已脱敏，内容只读。
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={loading || disabled}
          aria-label="刷新完整配置"
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
      {loading && <Spinner aria-label="正在生成完整配置" />}
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview?.warnings.map((warning) => (
        <p key={warning} className="text-xs leading-5 text-muted-foreground">
          {warning}
        </p>
      ))}
      {preview?.files.map((file, index) => (
        <div key={file.path} className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-${index}`} className="block text-xs font-medium break-all">
            {file.path}
          </Label>
          {file.content === null ? (
            <p className="text-xs text-muted-foreground">文件尚不存在。</p>
          ) : (
            <Textarea
              id={`${id}-${index}`}
              readOnly
              value={file.content}
              wrap="off"
              spellCheck={false}
              className="h-72 w-full resize-y field-sizing-fixed bg-background font-mono text-xs leading-6"
            />
          )}
        </div>
      ))}
    </div>
  )
}
