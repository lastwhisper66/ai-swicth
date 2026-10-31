import { TOOL_NAMES } from '@shared/ipc'
import { baseToolId } from '@shared/ipc'
import { useEffect, useState } from 'react'
import { AlertCircle, Download, Save } from 'lucide-react'
import {
  PROVIDER_TOOL_IDS,
  type AppSnapshot,
  type CommonConfig,
  type ProviderSummary,
  type ProviderToolId
} from '@shared/ipc'
import {
  nativeModel,
  parseConfiguration,
  serializeConfiguration,
  type ConfigObject
} from '@shared/configuration'
import { modelPresetChoices } from '@renderer/lib/provider-form'
import { CommonOptionsForm } from './CommonOptionsForm'
import { ConfigurationSelect } from './ConfigurationSelect'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Textarea } from '@renderer/components/ui/textarea'

export function CommonConfigPage({
  busy,
  providers,
  onPendingChange,
  onSaved
}: {
  busy: boolean
  providers: ProviderSummary[]
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}): React.JSX.Element {
  const [toolId, setToolId] = useState<ProviderToolId>('claude-code')
  const [openedTools, setOpenedTools] = useState<ProviderToolId[]>(['claude-code'])
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">共通配置</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          每个工具的本机与 WSL 共用一份配置。上方快捷修改，下方原文同步更新，也可直接编辑原文。
        </p>
      </div>
      <Tabs
        value={toolId}
        onValueChange={(value) => {
          if (PROVIDER_TOOL_IDS.includes(value as ProviderToolId)) {
            const id = value as ProviderToolId
            setToolId(id)
            setOpenedTools((previous) => (previous.includes(id) ? previous : [...previous, id]))
          }
        }}
      >
        <TabsList
          className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto xl:inline-flex xl:w-auto"
          aria-label="共通配置所属工具"
        >
          {PROVIDER_TOOL_IDS.map((id) => (
            <TabsTrigger key={id} value={id} disabled={busy} className="h-9 gap-2 px-3">
              <ToolIcon toolId={id} />
              {TOOL_NAMES[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        {openedTools.map((id) => (
          <TabsContent key={id} value={id} forceMount className="mt-3 data-[state=inactive]:hidden">
            <CommonConfigEditor
              toolId={id}
              providers={providers}
              busy={busy}
              onPendingChange={onPendingChange}
              onSaved={onSaved}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function CommonConfigEditor({
  toolId,
  providers,
  busy,
  onPendingChange,
  onSaved
}: {
  toolId: ProviderToolId
  providers: ProviderSummary[]
  busy: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}): React.JSX.Element {
  const [configuration, setConfiguration] = useState<CommonConfig | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [migrationProviderId, setMigrationProviderId] = useState('')
  const [migrationModelId, setMigrationModelId] = useState('')
  const toolName = TOOL_NAMES[toolId]
  const dirty =
    configuration !== null &&
    (configuration.source !== 'saved' || content !== configuration.content)
  let root: ConfigObject | null = null
  try {
    root = parseConfiguration(toolId, content)
  } catch {
    /* Advanced editor remains available to repair the draft. */
  }
  const compatibleProviders = providers.filter((provider) =>
    provider.tools.includes(baseToolId(toolId))
  )
  const migrationProvider =
    compatibleProviders.find((provider) => provider.id === migrationProviderId) ??
    compatibleProviders[0]
  const migrationConfig = migrationProvider?.configurations[baseToolId(toolId)]
  const migrationModel =
    migrationConfig?.models.find((model) => model.id === migrationModelId) ??
    migrationConfig?.models.find((model) => model.id === migrationConfig.defaultModelId)

  async function migrate(): Promise<void> {
    if (!configuration || !migrationProvider || !migrationModel) return
    onPendingChange(true)
    setError(null)
    try {
      const result = await window.api.migrateCommonConfig({
        toolId,
        providerId: migrationProvider.id,
        modelId: migrationModel.id,
        revision: configuration.revision
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      onSaved(result.value, '已将归属字段迁移到所选供应商和模型，目标工具文件尚未修改。')
      setLoading(true)
      setReload((value) => value + 1)
    } catch {
      setError('迁移失败，请重新读取后重试。')
    } finally {
      onPendingChange(false)
    }
  }

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
            <Badge variant="secondary">{baseToolId(toolId) === 'codex' ? 'TOML' : 'JSON'}</Badge>
            <Badge variant="outline">
              {configuration?.source === 'saved'
                ? '已保存模板'
                : configuration?.source === 'current'
                  ? '从本机配置提取'
                  : '尚未保存模板'}
            </Badge>
            {dirty && <Badge variant="outline">未保存</Badge>}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={busy || loading}>
                <Download aria-hidden="true" />
                从本机配置提取
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>从本机配置提取共通配置？</AlertDialogTitle>
                <AlertDialogDescription>
                  将读取本机 {toolName}{' '}
                  配置，去除供应商字段后替换编辑器中的内容。尚未保存的编辑会丢失；保存仅更新应用中的共用模板。
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
            <div className="space-y-5">
              {configuration.warnings.map((warning) => (
                <Alert key={warning}>
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
              {configuration.conflicts.length > 0 && (
                <Alert className="space-y-4">
                  <AlertDescription className="space-y-4">
                    <p>
                      旧模板包含属于供应商／模型的字段，请先迁移。仅更新所选记录；请求头不会复制给其他供应商，目标工具文件不会改动。
                    </p>
                    <ul className="list-inside list-disc text-xs">
                      {configuration.conflicts.map((path) => (
                        <li key={path} className="break-all">
                          {path}
                        </li>
                      ))}
                    </ul>
                    {migrationProvider && migrationModel ? (
                      <>
                        <ConfigurationSelect
                          label="迁移到供应商"
                          value={migrationProvider.id}
                          choices={compatibleProviders.map((provider) => [
                            provider.id,
                            provider.name
                          ])}
                          onChange={(id) => {
                            setMigrationProviderId(id)
                            setMigrationModelId('')
                          }}
                          disabled={busy}
                        />
                        <ConfigurationSelect
                          label="迁移到模型预设"
                          value={migrationModel.id}
                          choices={modelPresetChoices(toolId, migrationConfig!.models)}
                          onChange={setMigrationModelId}
                          disabled={busy}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline" disabled={busy}>
                              迁移归属字段
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                迁移到 {migrationProvider.name} /{' '}
                                {nativeModel(toolId, migrationModel)}？
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                将读取已保存模板，把可映射字段迁移到所选连接和模型，替换其对应选项和请求头，然后从模板移除这些字段。未保存草稿不会参与迁移，并会在迁移完成后丢弃；其他模型的
                                目标工具文件不变。所选供应商的修改由本机与 WSL
                                共用，需分别手动应用。Claude 的思考强度统一由共通配置管理。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void migrate()}>
                                确认迁移
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <p>请先在供应商设置中添加此工具的供应商和模型，再回来迁移。</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <section className="space-y-4" aria-label="快捷修改">
                <div>
                  <h3 className="text-sm font-medium">快捷修改</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    常用选项的修改会立即反映在下方原文中，保存后才会写入配置。
                  </p>
                </div>
                {root ? (
                  <CommonOptionsForm
                    key={configuration.revision}
                    toolId={toolId}
                    root={root}
                    onChange={(value) => setContent(serializeConfiguration(toolId, value))}
                    disabled={busy || configuration.conflicts.length > 0}
                  />
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      原文格式无效，请在下方修复后继续使用快捷修改。未保存任何内容。
                    </AlertDescription>
                  </Alert>
                )}
              </section>
              <section className="border-t pt-5" aria-label="共通配置原文">
                <Field className="min-w-0 gap-3">
                  <FieldLabel htmlFor={`${toolId}-common-content`}>
                    {toolName} 共通配置原文
                  </FieldLabel>
                  <Textarea
                    id={`${toolId}-common-content`}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    disabled={busy}
                    spellCheck={false}
                    autoCapitalize="none"
                    wrap="off"
                    aria-describedby={`${toolId}-common-description`}
                    className="h-96 resize-y field-sizing-fixed font-mono text-xs leading-6"
                  />
                  <FieldDescription
                    id={`${toolId}-common-description`}
                    className="text-xs leading-6"
                  >
                    {baseToolId(toolId) === 'claude-code'
                      ? '共通字段与表单共享同一草稿；保留未知字段，供应商连接、路由与模型选项请在供应商侧设置。'
                      : '可管理审批、沙箱、历史和 MCP 等字段；不能包含 model、model_provider、model_providers，供应商地址和 API Key 统一由 config.toml 中的供应商配置管理。'}
                    <span className="block">
                      保存仅更新应用中的共用模板。在本机或 WSL
                      应用供应商时，才会合并写入对应工具配置。
                    </span>
                  </FieldDescription>
                </Field>
              </section>
              <p className="text-xs leading-6 break-all text-muted-foreground">
                通用模板保存到应用，应用供应商时写入工具配置。
              </p>
            </div>
          )
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
          <p className="text-xs leading-5 text-muted-foreground">
            保存到 AI Switch，应用供应商时生效。
          </p>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={
              busy ||
              loading ||
              !configuration ||
              !dirty ||
              !root ||
              configuration.conflicts.length > 0
            }
          >
            <Save aria-hidden="true" />
            保存共通配置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
