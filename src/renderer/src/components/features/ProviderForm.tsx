import { TOOL_NAMES } from '@shared/ipc'
import { baseToolId } from '@shared/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ChevronDown, Info, RefreshCw } from 'lucide-react'
import type { AppSnapshot, ProviderSummary, ToolId } from '@shared/ipc'
import { nativeModel, type HeaderInput, type ProviderConfigurations } from '@shared/configuration'
import { ModelPresetEditor } from './ModelPresetEditor'
import { createModelPreset } from '@renderer/lib/provider-form'
import { ConnectionOptionsEditor } from './ConnectionOptionsEditor'
import { ConfigPreview } from './ConfigPreview'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { PasswordInput } from '@renderer/components/PasswordInput'
import { useStoredSecrets } from '@renderer/hooks/use-stored-secrets'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet
} from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'

interface ProviderFormProps {
  provider: ProviderSummary | null
  toolId: ToolId
  currentModelId: string | null
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}

interface ProviderFormState {
  name: string
  baseUrl: string
  apiKey: string | null
}

export function ProviderForm({
  provider,
  toolId,
  currentModelId,
  onCancel,
  onPendingChange,
  onSaved
}: ProviderFormProps): React.JSX.Element {
  const toolName = TOOL_NAMES[toolId]
  const [form, setForm] = useState<ProviderFormState>(() => ({
    name: provider?.name ?? '',
    baseUrl: provider?.baseUrl ?? '',
    apiKey: null
  }))
  const [configurations, setConfigurations] = useState<ProviderConfigurations<HeaderInput>>(() => {
    if (provider)
      return Object.fromEntries(
        Object.entries(provider.configurations).map(([id, config]) => [
          id,
          {
            ...structuredClone(config),
            ...(baseToolId(id as ToolId) === 'claude-code' && {
              models: config.models.map((model) => ({
                ...structuredClone(model),
                model: nativeModel('claude-code', model)
              }))
            }),
            headers: config.headers.map((header) => ({
              id: header.id,
              name: header.name,
              value: { mode: 'keep' as const }
            }))
          }
        ])
      )
    const model = createModelPreset()
    return { [toolId]: { models: [model], defaultModelId: model.id, headers: [] } }
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const providerId = provider?.id
  const readSecrets = useCallback(
    () => window.api.getProviderSecrets({ id: providerId! }),
    [providerId]
  )
  const secrets = useStoredSecrets(
    readSecrets,
    Boolean(providerId),
    '无法读取已保存的 API Key 和请求头值，请重试或重新打开应用。'
  )
  const [pending, setPending] = useState(false)
  const configuration = configurations[toolId]!
  const modelId =
    configuration.models.find((model) => model.id === currentModelId)?.id ??
    configuration.defaultModelId
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [fieldErrors])

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending || secrets.loading) return
    const tools = provider?.tools ?? [toolId]

    setPending(true)
    onPendingChange(true)
    setFieldErrors({})
    setFormError(null)
    try {
      const result = provider
        ? await window.api.updateProvider({
            id: provider.id,
            name: form.name,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey ? { mode: 'replace', value: form.apiKey } : { mode: 'keep' },
            tools,
            configurations
          })
        : await window.api.createProvider({
            name: form.name,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey ?? '',
            tools,
            configurations
          })

      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {})
        setFormError(result.error.message)
        return
      }

      onSaved(
        result.value,
        `${toolName} 供应商已${provider ? '更新' : '添加'}，可在工具页面点击“应用”。`
      )
    } catch {
      setFormError('无法连接本地应用，请重新打开应用后重试。')
    } finally {
      setPending(false)
      onPendingChange(false)
    }
  }

  function updateForm(key: keyof ProviderFormState, value: string): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="min-w-0 w-full space-y-5">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        <ArrowLeft aria-hidden="true" />
        返回 {toolName} 供应商
      </Button>

      <Card className="gap-0 overflow-visible py-0">
        <CardHeader className="border-b bg-muted/25 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background">
              <ToolIcon toolId={toolId} className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg leading-7 font-semibold">
                {provider ? '编辑' : '添加'} {toolName} 供应商
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                保存供应商后，可前往 {toolName} 页面应用配置。
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          <form ref={formRef} className="grid gap-6" onSubmit={(event) => void submit(event)}>
            {formError && (
              <Alert variant="destructive" className="px-4 py-3">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {secrets.error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>
                  {secrets.error}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto justify-start p-0"
                    onClick={secrets.reload}
                    disabled={pending}
                  >
                    <RefreshCw aria-hidden="true" />
                    重新读取密钥
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {provider && provider.tools.length > 1 && (
              <Alert role="note" className="bg-muted/40 px-4 py-3">
                <Info aria-hidden="true" />
                <AlertDescription>
                  这是此前保存的共用供应商。名称、API 地址与 Key 由两个工具共用，模型仅修改
                  {toolName} 的配置。
                </AlertDescription>
              </Alert>
            )}

            <FieldSet disabled={pending} className="min-w-0">
              <FieldGroup className="gap-6">
                <FormField label="供应商名称" error={fieldErrors.name} htmlFor="provider-name">
                  <Input
                    id="provider-name"
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="例如：我的 API 服务"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'provider-name-error' : undefined}
                    autoFocus
                  />
                </FormField>

                <FormField
                  label="API 地址"
                  error={fieldErrors.baseUrl}
                  htmlFor="provider-url"
                  hint={
                    baseToolId(toolId) === 'claude-code'
                      ? '填写支持 Anthropic Messages 协议的服务地址。'
                      : '填写支持 OpenAI Responses 协议的服务地址。'
                  }
                >
                  <Input
                    id="provider-url"
                    value={form.baseUrl}
                    onChange={(event) => updateForm('baseUrl', event.target.value)}
                    placeholder="https://gateway.example.com"
                    aria-invalid={Boolean(fieldErrors.baseUrl)}
                    aria-describedby={`provider-url-hint${fieldErrors.baseUrl ? ' provider-url-error' : ''}`}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </FormField>

                <FormField
                  label="API Key"
                  error={fieldErrors.apiKey}
                  htmlFor="provider-key"
                  hint={
                    provider?.hasApiKey
                      ? '已保存的密钥会自动载入并默认隐藏，可直接编辑；点击右侧眼睛查看，留空保留原值。'
                      : provider
                        ? '当前没有保存密钥，请输入 API Key。'
                        : '密钥保存在本机应用数据目录中，上传云端时会使用备份密码整体加密。'
                  }
                >
                  <PasswordInput
                    id="provider-key"
                    label="API Key"
                    value={form.apiKey ?? secrets.value?.apiKey ?? ''}
                    onChange={(event) => updateForm('apiKey', event.target.value)}
                    placeholder={
                      secrets.loading
                        ? '正在读取 API Key…'
                        : provider?.hasApiKey
                          ? '留空保留已保存的 API Key'
                          : '输入 API Key'
                    }
                    loading={secrets.loading}
                    disabled={pending}
                    aria-invalid={Boolean(fieldErrors.apiKey)}
                    aria-describedby={`provider-key-hint${fieldErrors.apiKey ? ' provider-key-error' : ''}`}
                  />
                </FormField>

                <ModelPresetEditor
                  toolId={toolId}
                  configuration={configurations[toolId]!}
                  onChange={(value) =>
                    setConfigurations((current) => ({ ...current, [toolId]: value }))
                  }
                />
                <details className="group rounded-lg border bg-muted/15">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                    <span>
                      高级连接选项
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        自定义请求头与默认模型路由
                      </span>
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-t p-4 [&>section]:border-t-0 [&>section]:pt-0">
                    <ConnectionOptionsEditor
                      toolId={toolId}
                      configuration={configurations[toolId]!}
                      savedHeaders={provider?.configurations[toolId]?.headers}
                      savedValues={secrets.value?.headers[toolId]}
                      loadingSecrets={secrets.loading}
                      onChange={(value) =>
                        setConfigurations((current) => ({ ...current, [toolId]: value }))
                      }
                    />
                  </div>
                </details>
              </FieldGroup>
            </FieldSet>
            {provider && (
              <details className="group min-w-0 rounded-lg border bg-muted/15">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  完整配置预览
                  <ChevronDown
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t p-4">
                  <ConfigPreview
                    disabled={pending}
                    input={{
                      toolId,
                      modelId,
                      draft: {
                        id: provider.id,
                        name: form.name,
                        baseUrl: form.baseUrl,
                        apiKey: form.apiKey
                          ? { mode: 'replace', value: form.apiKey }
                          : { mode: 'keep' },
                        tools: provider.tools,
                        configurations
                      }
                    }}
                  />
                </div>
              </details>
            )}

            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-4 border-t bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
              <p className="text-xs leading-5 text-muted-foreground">保存后需手动应用到工具。</p>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                  取消
                </Button>
                <Button type="submit" disabled={pending || secrets.loading}>
                  {pending && <Spinner aria-hidden="true" />}
                  {pending ? '正在保存…' : '保存供应商'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function FormField({
  label,
  error,
  hint,
  htmlFor,
  children
}: {
  label: string
  error?: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Field data-invalid={Boolean(error)} className="min-w-0 gap-2.5">
      <FieldLabel htmlFor={htmlFor} className="leading-5">
        {label}
      </FieldLabel>
      {children}
      {hint && (
        <FieldDescription id={`${htmlFor}-hint`} className="text-xs leading-5">
          {hint}
        </FieldDescription>
      )}
      {error && (
        <FieldError id={`${htmlFor}-error`} className="text-xs leading-5">
          {error}
        </FieldError>
      )}
    </Field>
  )
}
