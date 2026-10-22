import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import type { AppSnapshot, ProviderSummary, ToolId } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

interface ProviderDialogProps {
  open: boolean
  provider: ProviderSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: (snapshot: AppSnapshot, message: string) => void
  onFailure: (message: string) => void
}

interface ProviderFormState {
  name: string
  baseUrl: string
  apiKey: string
  claudeEnabled: boolean
  codexEnabled: boolean
  claudeModel: string
  codexModel: string
}

const emptyForm: ProviderFormState = {
  name: '',
  baseUrl: '',
  apiKey: '',
  claudeEnabled: true,
  codexEnabled: false,
  claudeModel: '',
  codexModel: ''
}

export function ProviderDialog({
  open,
  provider,
  onOpenChange,
  onSaved,
  onFailure
}: ProviderDialogProps): React.JSX.Element {
  const [form, setForm] = useState<ProviderFormState>(() =>
    provider
      ? {
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: '',
          claudeEnabled: provider.tools.includes('claude-code'),
          codexEnabled: provider.tools.includes('codex'),
          claudeModel: provider.models['claude-code'] ?? '',
          codexModel: provider.models.codex ?? ''
        }
      : emptyForm
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const tools: ToolId[] = []
    if (form.claudeEnabled) tools.push('claude-code')
    if (form.codexEnabled) tools.push('codex')
    const models = {
      ...(form.claudeEnabled ? { 'claude-code': form.claudeModel } : {}),
      ...(form.codexEnabled ? { codex: form.codexModel } : {})
    }

    setPending(true)
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

      onSaved(result.value, provider ? '供应商已更新。' : '供应商已添加。')
      onOpenChange(false)
    } catch {
      const message = '无法连接本地应用，请重新打开应用后重试。'
      setFormError(message)
      onFailure(message)
    } finally {
      setPending(false)
    }
  }

  function updateForm<Key extends keyof ProviderFormState>(
    key: Key,
    value: ProviderFormState[Key]
  ): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider ? '编辑供应商' : '添加供应商'}</DialogTitle>
          <DialogDescription>保存只维护供应商信息，不会立即修改工具配置。</DialogDescription>
        </DialogHeader>
        {formError && (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            role="alert"
          >
            {formError}
          </p>
        )}
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={pending} className="contents">
            <FormField label="名称" error={fieldErrors.name} htmlFor="provider-name">
              <Input
                id="provider-name"
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                autoFocus
              />
            </FormField>

            <FormField label="API 地址" error={fieldErrors.baseUrl} htmlFor="provider-url">
              <Input
                id="provider-url"
                value={form.baseUrl}
                onChange={(event) => updateForm('baseUrl', event.target.value)}
                placeholder="https://gateway.example.com"
                aria-invalid={Boolean(fieldErrors.baseUrl)}
              />
            </FormField>

            <FormField label="API Key" error={fieldErrors.apiKey} htmlFor="provider-key">
              <div className="flex gap-2">
                <Input
                  id="provider-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(event) => updateForm('apiKey', event.target.value)}
                  placeholder={provider ? '留空表示保留已保存密钥' : '输入 API Key'}
                  aria-invalid={Boolean(fieldErrors.apiKey)}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey((visible) => !visible)}
                  aria-label={showApiKey ? '隐藏 API Key' : '显示本次输入的 API Key'}
                >
                  {showApiKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </FormField>

            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">适用工具与模型</legend>
              <ToolOption
                id="provider-claude"
                label="Claude Code"
                checked={form.claudeEnabled}
                model={form.claudeModel}
                modelError={fieldErrors['models.claude-code']}
                onCheckedChange={(checked) => updateForm('claudeEnabled', checked)}
                onModelChange={(value) => updateForm('claudeModel', value)}
              />
              <ToolOption
                id="provider-codex"
                label="Codex"
                checked={form.codexEnabled}
                model={form.codexModel}
                modelError={fieldErrors['models.codex']}
                onCheckedChange={(checked) => updateForm('codexEnabled', checked)}
                onModelChange={(value) => updateForm('codexModel', value)}
              />
              {fieldErrors.tools && <p className="text-xs text-destructive">{fieldErrors.tools}</p>}
            </fieldset>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                保存供应商
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormField({
  label,
  error,
  htmlFor,
  children
}: {
  label: string
  error?: string
  htmlFor: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ToolOption({
  id,
  label,
  checked,
  model,
  modelError,
  onCheckedChange,
  onModelChange
}: {
  id: string
  label: string
  checked: boolean
  model: string
  modelError?: string
  onCheckedChange: (checked: boolean) => void
  onModelChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-2"
      />
      <div className="space-y-2">
        <Label htmlFor={id} className="inline-block pt-1.5">
          {label}
        </Label>
        {checked && (
          <>
            <Input
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder="模型名称"
              aria-label={`${label} 模型名称`}
              aria-invalid={Boolean(modelError)}
            />
            {modelError && <p className="text-xs text-destructive">{modelError}</p>}
          </>
        )}
      </div>
    </div>
  )
}
