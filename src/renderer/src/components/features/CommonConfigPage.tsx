import { useEffect, useState } from 'react'
import { AlertCircle, Download, Save } from 'lucide-react'
import { TOOL_IDS, type AppSnapshot, type CommonConfig, type ToolId } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Textarea } from '@renderer/components/ui/textarea'

export function CommonConfigPage({
  busy,
  onPendingChange,
  onSaved
}: {
  busy: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}): React.JSX.Element {
  const [toolId, setToolId] = useState<ToolId>('claude-code')
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">共通配置</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          每个工具的所有供应商共享一份配置，地址、密钥和主模型由供应商管理。
        </p>
      </div>
      <Tabs
        value={toolId}
        onValueChange={(value) => {
          if (value === 'claude-code' || value === 'codex') setToolId(value)
        }}
      >
        <TabsList className="h-11" aria-label="共通配置所属工具">
          {TOOL_IDS.map((id) => (
            <TabsTrigger key={id} value={id} disabled={busy} className="gap-2 px-4">
              <ToolIcon toolId={id} />
              {id === 'codex' ? 'Codex' : 'Claude Code'}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {TOOL_IDS.map((id) => (
        <div key={id} hidden={id !== toolId}>
          <CommonConfigEditor
            toolId={id}
            busy={busy}
            onPendingChange={onPendingChange}
            onSaved={onSaved}
          />
        </div>
      ))}
    </div>
  )
}

function CommonConfigEditor({
  toolId,
  busy,
  onPendingChange,
  onSaved
}: {
  toolId: ToolId
  busy: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}): React.JSX.Element {
  const [configuration, setConfiguration] = useState<CommonConfig | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const toolName = toolId === 'codex' ? 'Codex' : 'Claude Code'
  const dirty = configuration !== null && content !== configuration.content

  useEffect(() => {
    let active = true
    window.api
      .getCommonConfig({ toolId })
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setConfiguration(result.value)
          setContent(result.value.content)
        } else setError(result.error.message)
      })
      .catch(() => {
        if (active) setError('无法读取共通配置，请重试。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [toolId, reload])

  async function importCurrent(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getCommonConfig({ toolId, fromCurrent: true })
      if (result.ok) {
        setConfiguration(result.value)
        setContent(result.value.content)
      } else setError(result.error.message)
    } catch {
      setError('无法读取当前配置，请重试。')
    } finally {
      setLoading(false)
    }
  }

  async function save(): Promise<void> {
    if (!configuration) return
    onPendingChange(true)
    setError(null)
    try {
      const result = await window.api.saveCommonConfig({
        toolId,
        content,
        revision: configuration.revision
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      onSaved(result.value.snapshot, result.value.operation.message)
      setLoading(true)
      setReload((value) => value + 1)
    } catch {
      setError('无法保存共通配置，请重新打开应用后重试。')
    } finally {
      onPendingChange(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Badge variant="secondary">{toolId === 'codex' ? 'TOML' : 'JSON'}</Badge>
            <Badge variant="outline">
              {configuration?.source === 'saved' ? '已保存模板' : '从当前文件提取'}
            </Badge>
            {dirty && <Badge variant="outline">未保存</Badge>}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={busy || loading}>
                <Download aria-hidden="true" />
                从当前文件重新提取
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重新提取共通配置？</AlertDialogTitle>
                <AlertDialogDescription>
                  将读取当前工具文件并去除供应商字段，替换编辑器中的内容。尚未保存的编辑会丢失。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void importCurrent()}>确认提取</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              {error}
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={busy || loading}
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  setReload((value) => value + 1)
                }}
              >
                重新读取
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <Spinner aria-label="正在读取共通配置" />
        ) : (
          configuration && (
            <Field className="min-w-0 gap-3">
              <FieldLabel htmlFor={`${toolId}-common-content`}>{toolName} 共通配置</FieldLabel>
              <Textarea
                id={`${toolId}-common-content`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={busy}
                spellCheck={false}
                autoCapitalize="none"
                wrap="off"
                aria-describedby={`${toolId}-common-description`}
                className="h-96 resize-y [field-sizing:fixed] font-mono text-xs leading-6"
              />
              <FieldDescription id={`${toolId}-common-description`} className="text-xs leading-6">
                {toolId === 'claude-code'
                  ? '可管理 permissions、hooks、cleanPeriodDays 和通用 env 等字段；不能包含 model 和供应商环境变量。'
                  : '可管理审批、沙箱、历史和 MCP 等字段；不能包含 model、model_provider、model_providers，供应商地址和 API Key 统一由 config.toml 中的供应商配置管理。'}
                <span className="block">
                  这是完整模板，删除字段会同步从工具配置中删除。保存会立即应用，并保留当前供应商字段。
                </span>
                <span className="mt-2 block break-all">
                  本地加密模板：{configuration.templatePath}
                </span>
              </FieldDescription>
            </Field>
          )
        )}
        <div className="flex justify-end border-t pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={busy || loading || !configuration}>
                <Save aria-hidden="true" />
                保存并应用
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>保存并应用 {toolName} 共通配置？</AlertDialogTitle>
                <AlertDialogDescription>
                  将立即更新当前工具配置和共通模板，保留供应商字段。未包含的通用字段将被删除；操作前会一起备份，失败时自动回滚。之后应用任何供应商都会使用这份模板，请新建或重启会话使配置生效。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void save()}>确认保存并应用</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
