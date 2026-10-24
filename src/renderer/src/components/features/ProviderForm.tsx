import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Info } from 'lucide-react'
import type { AppSnapshot, ProviderSummary, ToolId } from '@shared/ipc'
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
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
}

interface ProviderFormState {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

export function ProviderForm({
  provider,
  toolId,
  onCancel,
  onPendingChange,
  onSaved
}: ProviderFormProps): React.JSX.Element {
  const toolName = toolId === 'claude-code' ? 'Claude Code' : 'Codex'
  const [form, setForm] = useState<ProviderFormState>(() => ({
    name: provider?.name ?? '',
    baseUrl: provider?.baseUrl ?? '',
    apiKey: '',
    model: provider?.models[toolId] ?? ''
  }))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [pending, setPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [fieldErrors])

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    const tools = provider?.tools ?? [toolId]
    const models = { ...provider?.models, [toolId]: form.model }

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
            models
          })
        : await window.api.createProvider({
            name: form.name,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey,
            tools,
            models
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
    <div className="max-w-2xl space-y-5">
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
                  error={fieldErrors.apiKey}
                  htmlFor="provider-key"
                  hint={
                    provider
                      ? `当前密钥：${provider.maskedApiKey}，留空可保留。`
                      : '密钥仅在本机加密保存。'
                  }
                >
                  <InputGroup>
                    <InputGroupInput
                      id="provider-key"
                      type={showApiKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={(event) => updateForm('apiKey', event.target.value)}
                      placeholder={provider ? '留空表示保留已保存密钥' : '输入 API Key'}
                      aria-invalid={Boolean(fieldErrors.apiKey)}
                      aria-describedby={`provider-key-hint${fieldErrors.apiKey ? ' provider-key-error' : ''}`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-sm"
                        onClick={() => setShowApiKey((visible) => !visible)}
                        aria-label={showApiKey ? '隐藏 API Key' : '显示本次输入的 API Key'}
                        aria-pressed={showApiKey}
                      >
                        {showApiKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </FormField>

                <FormField
                  label="模型名称"
                  error={fieldErrors[`models.${toolId}`]}
                  htmlFor="provider-model"
                  hint={`填写供应商提供的 ${toolName} 模型标识。`}
                >
                  <Input
                    id="provider-model"
                    value={form.model}
                    onChange={(event) => updateForm('model', event.target.value)}
                    placeholder={
                      toolId === 'claude-code' ? '例如：claude-sonnet-4-6' : '例如：gpt-5.4'
                    }
                    aria-invalid={Boolean(fieldErrors[`models.${toolId}`])}
                    aria-describedby={`provider-model-hint${fieldErrors[`models.${toolId}`] ? ' provider-model-error' : ''}`}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </FormField>
              </FieldGroup>
            </FieldSet>

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
