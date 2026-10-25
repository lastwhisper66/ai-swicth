import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Info } from 'lucide-react'
import type { AppSnapshot, ProviderSummary, ToolId, ToolInstallation } from '@shared/ipc'
import { nativeModel, type HeaderInput, type ProviderConfigurations } from '@shared/configuration'
import { ModelPresetEditor } from './ModelPresetEditor'
import { createModelPreset } from '@renderer/lib/provider-form'
import { ConnectionOptionsEditor } from './ConnectionOptionsEditor'
import { ConfigPreview } from './ConfigPreview'
import { ToolIcon } from '@renderer/components/ToolIcon'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
import { Spinner } from '@renderer/components/ui/spinner'

interface ProviderFormProps {
  provider: ProviderSummary | null
  toolId: ToolId
  currentModelId: string | null
  installation: ToolInstallation
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}

interface ProviderFormState {
  name: string
  baseUrl: string
  apiKey: string
}

export function ProviderForm({
  provider,
  toolId,
  currentModelId,
  installation,
  onCancel,
  onPendingChange,
  onSaved
}: ProviderFormProps): React.JSX.Element {
  const toolName = toolId === 'claude-code' ? 'Claude Code' : 'Codex'
  const [form, setForm] = useState<ProviderFormState>(() => ({
    name: provider?.name ?? '',
    baseUrl: provider?.baseUrl ?? '',
    apiKey: ''
  }))
  const [configurations, setConfigurations] = useState<ProviderConfigurations<HeaderInput>>(() => {
    if (provider)
      return Object.fromEntries(
        Object.entries(provider.configurations).map(([id, config]) => [
          id,
          {
            ...structuredClone(config),
            ...(id === 'claude-code' && {
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
  const [showApiKey, setShowApiKey] = useState(false)
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null)
  const [loadingApiKey, setLoadingApiKey] = useState(false)
  const [apiKeyReadError, setApiKeyReadError] = useState<string | null>(null)
  const apiKeyError = fieldErrors.apiKey ?? apiKeyReadError
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
    if (pending) return
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
            apiKey: form.apiKey,
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

  async function toggleApiKeyVisibility(): Promise<void> {
    if (pending || loadingApiKey) return
    if (showApiKey) {
      setShowApiKey(false)
      return
    }
    if (form.apiKey || savedApiKey !== null || !provider?.hasApiKey) {
      setShowApiKey(true)
      return
    }
    setLoadingApiKey(true)
    setApiKeyReadError(null)
    try {
      const result = await window.api.revealProviderApiKey({ id: provider.id })
      if (!result.ok) {
        setApiKeyReadError(result.error.message)
        return
      }
      setSavedApiKey(result.value)
      setShowApiKey(true)
    } catch {
      setApiKeyReadError('无法读取已保存的 API Key，请重新打开应用后重试。')
    } finally {
      setLoadingApiKey(false)
    }
  }

  return (
    <div className="min-w-0 w-full space-y-5">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        <ArrowLeft aria-hidden="true" />
        返回 {toolName} 供应商
      </Button>

      <Card className="gap-0 py-0">
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
                    toolId === 'claude-code'
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
                  error={apiKeyError}
                  htmlFor="provider-key"
                  hint={
                    provider?.hasApiKey
                      ? '已保存的密钥默认隐藏，点击右侧眼睛查看完整内容；留空可保留。'
                      : provider
                        ? '当前没有保存密钥，请输入 API Key。'
                        : '密钥保存在本机应用数据目录中，上传云端时会使用备份密码整体加密。'
                  }
                >
                  <InputGroup>
                    <InputGroupInput
                      id="provider-key"
                      type={showApiKey ? 'text' : 'password'}
                      value={form.apiKey || savedApiKey || ''}
                      onChange={(event) => {
                        setSavedApiKey(null)
                        setApiKeyReadError(null)
                        updateForm('apiKey', event.target.value)
                      }}
                      placeholder={provider?.hasApiKey ? '••••••••' : '输入 API Key'}
                      disabled={loadingApiKey}
                      aria-invalid={Boolean(apiKeyError)}
                      aria-describedby={`provider-key-hint${apiKeyError ? ' provider-key-error' : ''}`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-sm"
                        onClick={() => void toggleApiKeyVisibility()}
                        disabled={loadingApiKey}
                        aria-label={
                          loadingApiKey
                            ? '正在读取 API Key'
                            : showApiKey
                              ? '隐藏 API Key'
                              : '显示 API Key'
                        }
                        aria-busy={loadingApiKey}
                        aria-pressed={showApiKey}
                      >
                        {loadingApiKey ? (
                          <Spinner aria-hidden="true" />
                        ) : showApiKey ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </FormField>

                <ModelPresetEditor
                  toolId={toolId}
                  configuration={configurations[toolId]!}
                  installation={installation}
                  onChange={(value) =>
                    setConfigurations((current) => ({ ...current, [toolId]: value }))
                  }
                />
                <ConnectionOptionsEditor
                  toolId={toolId}
                  configuration={configurations[toolId]!}
                  installation={installation}
                  savedHeaders={provider?.configurations[toolId]?.headers}
                  onChange={(value) =>
                    setConfigurations((current) => ({ ...current, [toolId]: value }))
                  }
                />
              </FieldGroup>
            </FieldSet>
            {provider && (
              <section className="min-w-0 space-y-4 border-t pt-5" aria-label="供应商完整配置">
                <h3 className="font-semibold">完整配置</h3>
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
              </section>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
              <p className="text-xs leading-5 text-muted-foreground">保存后需手动应用到工具。</p>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                  取消
                </Button>
                <Button type="submit" disabled={pending}>
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
