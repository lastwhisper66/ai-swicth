import { Plus, Trash2 } from 'lucide-react'
import type { ToolId, ToolInstallation } from '@shared/ipc'
import {
  DEFAULT_CHOICES,
  ROUTE_KEYS,
  atLeast,
  type HeaderInput,
  type HeaderSummary,
  type ProviderToolConfiguration
} from '@shared/configuration'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { ConfigurationSelect } from './ConfigurationSelect'

export function ConnectionOptionsEditor({
  toolId,
  configuration,
  installation,
  savedHeaders = [],
  onChange
}: {
  toolId: ToolId
  configuration: ProviderToolConfiguration<HeaderInput>
  installation: ToolInstallation
  savedHeaders?: HeaderSummary[]
  onChange: (value: ProviderToolConfiguration<HeaderInput>) => void
}): React.JSX.Element {
  const updateHeader = (id: string, change: Partial<HeaderInput>): void =>
    onChange({
      ...configuration,
      headers: configuration.headers.map((header) =>
        header.id === id ? { ...header, ...change } : header
      )
    })
  return (
    <section className="space-y-5 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">自定义 API 请求头</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...configuration,
              headers: [
                ...configuration.headers,
                { id: crypto.randomUUID(), name: '', value: { mode: 'replace', value: '' } }
              ]
            })
          }
        >
          <Plus />
          添加请求头
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        值默认隐藏；保留已保存的值，或输入新值替换，点击删除移除此头。API Key 负责鉴权，请勿添加
        Authorization 或 x-api-key。不保证覆盖 SDK 自动生成的头。
      </p>
      {configuration.headers.map((header, index) => (
        <div key={header.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <Field className="min-w-0 gap-2">
            <FieldLabel htmlFor={`header-${header.id}-name`}>名称 {index + 1}</FieldLabel>
            <Input
              id={`header-${header.id}-name`}
              value={header.name}
              placeholder="X-Client-Name"
              onChange={(event) =>
                updateHeader(header.id, {
                  name: event.target.value,
                  ...(header.value.mode === 'keep' ? { value: { mode: 'replace', value: '' } } : {})
                })
              }
              spellCheck={false}
            />
          </Field>
          <Field className="min-w-0 gap-2">
            <FieldLabel htmlFor={`header-${header.id}-value`}>
              值{header.value.mode === 'keep' ? '（已保存）' : ''}
            </FieldLabel>
            <Input
              id={`header-${header.id}-value`}
              type="password"
              value={header.value.mode === 'replace' ? header.value.value : ''}
              onChange={(event) =>
                updateHeader(header.id, { value: { mode: 'replace', value: event.target.value } })
              }
              placeholder={header.value.mode === 'keep' ? '•••••••• 留空保留' : '输入请求头值'}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`删除请求头 ${index + 1}`}
            onClick={() =>
              onChange({
                ...configuration,
                headers: configuration.headers.filter((entry) => entry.id !== header.id)
              })
            }
          >
            <Trash2 />
          </Button>
          {savedHeaders.some(
            (saved) =>
              saved.id === header.id && saved.name.toLowerCase() === header.name.toLowerCase()
          ) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="col-span-3 justify-start"
              disabled={header.value.mode === 'keep'}
              onClick={() => updateHeader(header.id, { value: { mode: 'keep' } })}
            >
              保留原值
            </Button>
          )}
        </div>
      ))}
      {toolId === 'codex' ? (
        <ConfigurationSelect
          label="Responses WebSocket 兼容能力"
          value={
            configuration.supportsWebsockets === undefined
              ? 'default'
              : String(configuration.supportsWebsockets)
          }
          choices={DEFAULT_CHOICES}
          onChange={(value) => {
            const next = { ...configuration }
            if (value === 'default') delete next.supportsWebsockets
            else next.supportsWebsockets = value === 'true'
            onChange(next)
          }}
          disabled={!atLeast(installation.version, '0.154.0')}
          hint="仅声明供应商是否支持 Responses WebSocket 传输，不检测网关。当前核对基线为 Codex CLI 0.154.0。"
        />
      ) : (
        <div className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">默认模型路由</h3>
          <p className="text-xs text-muted-foreground">
            可引用列表中的 API 模型 ID，或输入供应商指定的模型。留空保留未接管的原有路由。
          </p>
          <datalist id="claude-route-models">
            {[...new Set(configuration.models.map((model) => model.model).filter(Boolean))].map(
              (model) => (
                <option key={model} value={model} />
              )
            )}
          </datalist>
          <div className="grid gap-4">
            {ROUTE_KEYS.map((key) => (
              <Field key={key} className="gap-2">
                <FieldLabel htmlFor={`route-${key}`}>
                  {key === 'subagent'
                    ? '子代理模型'
                    : `默认 ${key[0]!.toUpperCase()}${key.slice(1)} 模型`}
                </FieldLabel>
                <Input
                  id={`route-${key}`}
                  list="claude-route-models"
                  value={configuration.routes?.[key] ?? ''}
                  placeholder="工具默认 / 输入模型 ID"
                  onChange={(event) => {
                    const routes = { ...configuration.routes }
                    if (event.target.value) routes[key] = event.target.value
                    else delete routes[key]
                    onChange({ ...configuration, routes })
                  }}
                  spellCheck={false}
                />
              </Field>
            ))}
          </div>
        </div>
      )}
      <FieldDescription>连接选项仅属于此供应商和当前工具，切换时一并应用。</FieldDescription>
    </section>
  )
}
