import { useId, useState, type ReactNode } from 'react'
import { Code2, Plus, Save, Trash2 } from 'lucide-react'
import type {
  CopilotApiType,
  CopilotConfiguration,
  CopilotModel,
  CopilotProvider
} from '@shared/copilot'
import { isObject, type ConfigObject } from '@shared/configuration'
import { PasswordInput } from '@renderer/components/PasswordInput'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { createCopilotHeader, type CopilotHeaderRow } from '@renderer/lib/copilot-provider-form'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ConfigurationSwitch } from './ConfigurationSwitch'
import { CopilotReasoningEffortSelect, CopilotRequestHeaders } from './CopilotModelOptions'

const COPILOT_PROTOCOL_CHOICES = [
  ['chat-completions', 'Chat Completions'],
  ['responses', 'Responses'],
  ['messages', 'Anthropic Messages']
] as const

function newModel(): CopilotModel {
  return {
    id: '',
    name: '',
    url: '',
    apiType: 'chat-completions',
    toolCalling: true,
    vision: true,
    streaming: true,
    thinking: true,
    supportsReasoningEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxOutputTokens: 0
  }
}

interface CopilotDraft {
  raw: string
  document: ConfigObject | null
  form: CopilotConfiguration
  headerRows: CopilotHeaderRow[][]
}

function formConfiguration(document: ConfigObject): CopilotConfiguration {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const number = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  return {
    name: text(document.name),
    vendor: 'customendpoint',
    apiKey: text(document.apiKey),
    models: ((document.models ?? []) as ConfigObject[]).map((model) => ({
      id: text(model.id),
      name: text(model.name),
      url: text(model.url),
      apiType: (text(model.apiType) ||
        text(document.apiType) ||
        'chat-completions') as CopilotApiType,
      toolCalling: model.toolCalling === true,
      vision: model.vision === true,
      // Omitted streaming in existing native JSON means true in VS Code.
      streaming: model.streaming !== false,
      thinking: model.thinking === true,
      maxInputTokens: number(model.maxInputTokens),
      contextWindow: number(model.contextWindow),
      maxOutputTokens: number(model.maxOutputTokens) ?? 0,
      supportsReasoningEffort: Array.isArray(model.supportsReasoningEffort)
        ? model.supportsReasoningEffort.filter(
            (value): value is string => typeof value === 'string'
          )
        : undefined
    }))
  }
}

function modelHeaderRows(document: ConfigObject): CopilotHeaderRow[][] {
  return ((document.models ?? []) as ConfigObject[]).map((model) => {
    const entries = isObject(model.requestHeaders) ? Object.entries(model.requestHeaders) : []
    return entries.length
      ? entries.map(([name, value]) =>
          createCopilotHeader(name, typeof value === 'string' ? value : '')
        )
      : [createCopilotHeader()]
  })
}

function documentDraft(
  document: ConfigObject,
  headerRows = modelHeaderRows(document)
): CopilotDraft {
  return {
    raw: JSON.stringify(document, null, 2),
    document,
    form: formConfiguration(document),
    headerRows
  }
}

export function CopilotProviderForm({
  provider,
  onCancel,
  onSaved,
  onBusyChange
}: {
  provider: CopilotProvider | null
  onCancel: () => void
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<CopilotDraft>(() =>
    documentDraft(
      provider
        ? structuredClone(provider.configuration)
        : {
            name: '',
            vendor: 'customendpoint',
            apiKey: '',
            models: [newModel()]
          }
    )
  )
  const [jsonEditing, setJsonEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const configuration = draft.form

  function updateDocument(
    update: (current: ConfigObject) => ConfigObject,
    updateHeaders: (current: CopilotHeaderRow[][]) => CopilotHeaderRow[][] = (current) => current
  ): void {
    setDraft((current) =>
      current.document
        ? documentDraft(update(current.document), updateHeaders(current.headerRows))
        : current
    )
    setError(null)
  }

  function updateProvider(update: ConfigObject): void {
    updateDocument((current) => ({ ...current, ...update }))
  }

  function updateModel(index: number, update: Partial<CopilotModel>): void {
    updateDocument((current) => ({
      ...current,
      models: ((current.models ?? []) as ConfigObject[]).map((model, i) => {
        if (i !== index) return model
        const next = { ...model, ...update }
        for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key]
        return next
      })
    }))
  }

  function updateRaw(raw: string): void {
    let document: ConfigObject | null = null
    try {
      const value: unknown = JSON.parse(raw)
      if (
        isObject(value) &&
        (value.models === undefined ||
          (Array.isArray(value.models) && value.models.every(isObject)))
      )
        document = value
    } catch {
      // Keep incomplete JSON verbatim; switching views never validates the draft.
    }
    setDraft((current) => ({
      raw,
      document,
      form: document ? formConfiguration(document) : current.form,
      headerRows: document ? modelHeaderRows(document) : current.headerRows
    }))
    setError(null)
  }

  function updateRequestHeaders(index: number, rows: CopilotHeaderRow[]): void {
    const headers = Object.fromEntries(
      rows.filter((row) => row.name.trim() || row.value).map((row) => [row.name.trim(), row.value])
    )
    updateDocument(
      (current) => ({
        ...current,
        models: ((current.models ?? []) as ConfigObject[]).map((model, i) => {
          if (i !== index) return model
          const next = { ...model }
          if (Object.keys(headers).length) next.requestHeaders = headers
          else delete next.requestHeaders
          return next
        })
      }),
      (current) => current.map((entries, i) => (i === index ? rows : entries))
    )
  }

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    let value: unknown
    try {
      value = JSON.parse(draft.raw)
    } catch {
      setError('原生 JSON 无效，无法保存。请检查 JSON 语法后重试。')
      return
    }
    if (!isObject(value)) {
      setError('原生 JSON 无效，无法保存。供应商配置必须是 JSON 对象。')
      return
    }
    if (draft.document) {
      for (const [modelIndex, rows] of draft.headerRows.entries()) {
        const names = new Set<string>()
        for (const [index, row] of rows.entries()) {
          if (!row.name.trim() && !row.value) continue
          const label = `模型 ${modelIndex + 1} 的请求头 ${index + 1}`
          if (!row.name.trim()) {
            setError(`${label}缺少名称，无法保存。请填写名称或清空此行。`)
            return
          }
          const name = row.name.trim().toLowerCase()
          if (names.has(name)) {
            setError(`${label}名称重复，无法保存。请求头名称不区分大小写，请合并或删除重复行。`)
            return
          }
          names.add(name)
        }
      }
    }
    setSaving(true)
    onBusyChange(true)
    setError(null)
    try {
      const response = await window.api.copilot.saveProvider({
        ...(provider ? { id: provider.id, revision: provider.updatedAt } : {}),
        configuration: value as unknown as CopilotConfiguration
      })
      if (!response.ok)
        setError(
          response.error.code === 'INVALID_INPUT'
            ? `供应商配置无效，无法保存。${response.error.message}`
            : response.error.message
        )
      else onSaved()
    } catch {
      setError('无法保存 Copilot 供应商，请重新打开应用后重试。')
    } finally {
      setSaving(false)
      onBusyChange(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void save(event)}
      className="@container mx-auto w-full max-w-5xl space-y-5 [&_input]:h-9 [&_[data-slot=input-group]]:h-9 [&_[data-slot=select-trigger]]:h-9"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{provider ? '编辑' : '添加'} Copilot 供应商</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            配置连接信息与模型，保存后可在首页应用到 VS Code。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2 px-3"
            disabled={saving}
            onClick={() => {
              setJsonEditing((current) => !current)
              setError(null)
            }}
          >
            <Code2 />
            {jsonEditing ? '返回表单' : '原生 JSON'}
          </Button>
          <Button type="submit" className="h-9 gap-2 px-4" disabled={saving}>
            <Save />
            {saving ? '保存中…' : '保存供应商'}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        {jsonEditing ? (
          <CopilotField
            label="原生供应商 JSON"
            hint="此编辑器包含真实 API Key 和请求头值。可添加 reasoningEffortFormat、editTools、modelOptions、statefulResponses 等官方字段；返回表单时保留高级字段。"
          >
            {(id) => (
              <Textarea
                id={id}
                className="min-h-120 font-mono text-xs"
                value={draft.raw}
                onChange={(event) => updateRaw(event.target.value)}
                spellCheck={false}
              />
            )}
          </CopilotField>
        ) : (
          <>
            {!draft.document && (
              <p className="text-sm leading-6 text-muted-foreground" role="status">
                JSON 草稿已保留，表单暂时显示上次可映射的内容。可随时切回 JSON
                继续编辑，完整校验仅在保存时进行。
              </p>
            )}
            <fieldset disabled={!draft.document} className="min-w-0 space-y-5">
              <section
                className="overflow-hidden rounded-xl border bg-card shadow-xs"
                aria-label="连接信息"
              >
                <div className="border-b bg-muted/35 px-5 py-3">
                  <h2 className="text-sm font-semibold">连接信息</h2>
                </div>
                <div className="grid gap-x-5 gap-y-4 p-5 @lg:grid-cols-2">
                  <CopilotField label="供应商名称" hint="对应 VS Code 模型选择器中的分组名称。">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        maxLength={100}
                        value={configuration.name}
                        onChange={(e) => updateProvider({ name: e.target.value })}
                      />
                    )}
                  </CopilotField>
                  <div className="min-w-0">
                    <CopilotField
                      label="API Key"
                      hint="允许留空供本地端点使用；应用时以明文写入各模型的认证请求头。也可填写已有的 ${input:...} 凭据引用。"
                    >
                      {(id) => (
                        <PasswordInput
                          id={id}
                          label="Copilot API Key"
                          value={configuration.apiKey}
                          maxLength={16384}
                          onChange={(e) => updateProvider({ apiKey: e.target.value })}
                        />
                      )}
                    </CopilotField>
                  </div>
                </div>
              </section>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      模型配置
                      <Badge variant="secondary">{configuration.models.length}</Badge>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      分别设置各模型的接口、容量与能力。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2 px-3"
                    disabled={configuration.models.length >= 100}
                    onClick={() =>
                      updateDocument(
                        (current) => ({
                          ...current,
                          models: [...((current.models ?? []) as ConfigObject[]), newModel()]
                        }),
                        (current) => [...current, [createCopilotHeader()]]
                      )
                    }
                  >
                    <Plus />
                    添加模型
                  </Button>
                </div>
                {configuration.models.map((model, index) => (
                  <section
                    key={index}
                    aria-label={`模型 ${index + 1}`}
                    className="overflow-hidden rounded-xl border bg-card shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/35 px-5 py-3">
                      <h3 className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="truncate">
                          {model.name || model.id || `模型 ${index + 1}`}
                        </span>
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除模型 ${index + 1}`}
                        disabled={configuration.models.length === 1}
                        onClick={() =>
                          updateDocument(
                            (current) => ({
                              ...current,
                              models: ((current.models ?? []) as ConfigObject[]).filter(
                                (_, i) => i !== index
                              )
                            }),
                            (current) => current.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="grid gap-4 @lg:grid-cols-2">
                        <CopilotField label="模型 ID">
                          {(id) => (
                            <Input
                              id={id}
                              required
                              maxLength={256}
                              value={model.id}
                              onChange={(e) =>
                                updateModel(index, {
                                  id: e.target.value,
                                  ...(model.name === model.id ? { name: e.target.value } : {})
                                })
                              }
                              placeholder="供应商 API 中的模型 ID"
                            />
                          )}
                        </CopilotField>
                        <CopilotField label="显示名称">
                          {(id) => (
                            <Input
                              id={id}
                              required
                              maxLength={256}
                              value={model.name}
                              onChange={(e) => updateModel(index, { name: e.target.value })}
                            />
                          )}
                        </CopilotField>
                      </div>
                      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <CopilotField
                          label="API 基础地址"
                          hint="填写到 /v1 即可，VS Code 会按右侧 API 类型补全请求路径；已有完整接口地址也可保留。"
                        >
                          {(id) => (
                            <Input
                              id={id}
                              type="url"
                              required
                              maxLength={4096}
                              value={model.url}
                              onChange={(e) => updateModel(index, { url: e.target.value })}
                              placeholder="https://gateway.example.com/v1"
                            />
                          )}
                        </CopilotField>
                        <ConfigurationSelect
                          label="模型 API 类型"
                          choices={COPILOT_PROTOCOL_CHOICES}
                          value={model.apiType}
                          onChange={(type) =>
                            updateModel(index, { apiType: type as CopilotApiType })
                          }
                          hint="仅对当前模型生效，请按接口实际支持的协议选择。"
                        />
                      </div>
                      <CopilotReasoningEffortSelect
                        value={model.supportsReasoningEffort}
                        disabled={saving || !draft.document}
                        onChange={(supportsReasoningEffort) =>
                          updateModel(index, { supportsReasoningEffort })
                        }
                      />
                      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground">模型容量</h4>
                        <div className="grid gap-4 @xl:grid-cols-3">
                          <CopilotField label="最大输入 tokens">
                            {(id) => (
                              <Input
                                id={id}
                                type="number"
                                required={!model.contextWindow}
                                min={1}
                                max={1_000_000_000}
                                step={1}
                                value={model.maxInputTokens ?? ''}
                                onChange={(e) =>
                                  updateModel(index, {
                                    maxInputTokens:
                                      e.target.value === '' ? undefined : Number(e.target.value)
                                  })
                                }
                              />
                            )}
                          </CopilotField>
                          <CopilotField label="最大输出 tokens">
                            {(id) => (
                              <Input
                                id={id}
                                type="number"
                                required
                                min={1}
                                max={1_000_000_000}
                                step={1}
                                value={model.maxOutputTokens || ''}
                                onChange={(e) =>
                                  updateModel(index, { maxOutputTokens: Number(e.target.value) })
                                }
                              />
                            )}
                          </CopilotField>
                          <CopilotField label="上下文窗口（可选）">
                            {(id) => (
                              <Input
                                id={id}
                                type="number"
                                min={1}
                                max={1_000_000_000}
                                step={1}
                                value={model.contextWindow ?? ''}
                                onChange={(e) =>
                                  updateModel(index, {
                                    contextWindow:
                                      e.target.value === '' ? undefined : Number(e.target.value)
                                  })
                                }
                              />
                            )}
                          </CopilotField>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          最大输入与上下文窗口至少填写一项；填写上下文窗口后，VS Code
                          可用总容量减去最大输出来计算输入容量。
                        </p>
                      </div>
                      <div className="grid gap-3 @lg:grid-cols-2">
                        <ConfigurationSwitch
                          label="支持工具调用（toolCalling）"
                          hint="Agent 使用的模型需要此能力，请按实际能力开启。"
                          className="rounded-lg border px-4 py-3"
                          checked={model.toolCalling}
                          onCheckedChange={(checked) =>
                            updateModel(index, { toolCalling: checked })
                          }
                        />
                        <ConfigurationSwitch
                          label="支持图片输入（vision）"
                          hint="允许向模型发送图片，请按实际能力开启。"
                          className="rounded-lg border px-4 py-3"
                          checked={model.vision}
                          onCheckedChange={(checked) => updateModel(index, { vision: checked })}
                        />
                        <ConfigurationSwitch
                          label="支持流式响应（streaming）"
                          hint="逐步接收模型输出，请按接口实际能力开启。"
                          className="rounded-lg border px-4 py-3"
                          checked={model.streaming === true}
                          onCheckedChange={(checked) => updateModel(index, { streaming: checked })}
                        />
                        <ConfigurationSwitch
                          label="支持思考（thinking）"
                          hint="声明模型支持思考能力，具体强度由上方支持列表配置。"
                          className="rounded-lg border px-4 py-3"
                          checked={model.thinking === true}
                          onCheckedChange={(checked) => updateModel(index, { thinking: checked })}
                        />
                      </div>
                      <CopilotRequestHeaders
                        modelIndex={index}
                        rows={draft.headerRows[index]!}
                        onChange={(rows) => updateRequestHeaders(index, rows)}
                      />
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>
          </>
        )}
      </fieldset>
      <div className="flex justify-end gap-3 border-t pt-5">
        <Button
          type="button"
          variant="outline"
          className="h-9 px-4"
          onClick={onCancel}
          disabled={saving}
        >
          取消
        </Button>
        <Button type="submit" className="h-9 gap-2 px-4" disabled={saving}>
          <Save />
          {saving ? '保存中…' : '保存供应商'}
        </Button>
      </div>
    </form>
  )
}

export function CopilotField({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children(id)}
      {hint && <FieldDescription className="text-xs leading-5">{hint}</FieldDescription>}
    </Field>
  )
}
