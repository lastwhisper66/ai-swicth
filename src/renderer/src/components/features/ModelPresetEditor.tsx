import { baseToolId } from '@shared/ipc'
import { createModelPreset } from '@renderer/lib/provider-form'
import { Plus, Star, Trash2 } from 'lucide-react'
import type { ToolId } from '@shared/ipc'
import {
  claudeBaseModel,
  type HeaderInput,
  type ModelPreset,
  type ProviderToolConfiguration
} from '@shared/configuration'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Badge } from '@renderer/components/ui/badge'
import { ConfigurationSwitch } from './ConfigurationSwitch'

export function ModelPresetEditor({
  toolId,
  configuration,
  onChange
}: {
  toolId: ToolId
  configuration: ProviderToolConfiguration<HeaderInput>
  onChange: (value: ProviderToolConfiguration<HeaderInput>) => void
}): React.JSX.Element {
  const isClaude = baseToolId(toolId) === 'claude-code'
  const changeModel = (id: string, changes: Partial<ModelPreset>): void =>
    onChange({
      ...configuration,
      models: configuration.models.map((model) =>
        model.id === id ? { ...model, ...changes } : model
      )
    })
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{isClaude ? '模型列表与选项' : '模型列表'}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...configuration, models: [...configuration.models, createModelPreset()] })
          }
        >
          <Plus />
          添加模型
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        {isClaude
          ? '直接填写 API 模型 ID，开启 1M 上下文即可添加 [1m] 后缀。思考强度在共通配置中统一设置。'
          : '填写供应商提供的 API 模型 ID。1M 长上下文与 Fast Mode 在 Codex 共通配置中统一设置。'}
      </p>
      {configuration.models.map((preset, index) => {
        return (
          <div key={preset.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                模型 {index + 1}
                {configuration.defaultModelId === preset.id && (
                  <Badge variant="secondary">默认模型</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={configuration.defaultModelId === preset.id}
                  onClick={() => onChange({ ...configuration, defaultModelId: preset.id })}
                >
                  <Star />
                  设为默认
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除模型 ${index + 1}`}
                  disabled={configuration.models.length === 1}
                  onClick={() => {
                    const models = configuration.models.filter((model) => model.id !== preset.id)
                    onChange({
                      ...configuration,
                      models,
                      defaultModelId:
                        configuration.defaultModelId === preset.id
                          ? models[0]!.id
                          : configuration.defaultModelId
                    })
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-4">
              <Field className="gap-2">
                <FieldLabel htmlFor={`${preset.id}-model`}>API 模型 ID</FieldLabel>
                <Input
                  id={`${preset.id}-model`}
                  value={preset.model}
                  onChange={(event) => {
                    const value = event.target.value
                    if (!isClaude) {
                      changeModel(preset.id, { model: value })
                      return
                    }
                    const model = claudeBaseModel(value)
                    const options = { ...preset.options }
                    if (model !== value) options.context1m = true
                    else delete options.context1m
                    changeModel(preset.id, { model: value, options })
                  }}
                  spellCheck={false}
                />
              </Field>
              {isClaude && (
                <ConfigurationSwitch
                  id={`${preset.id}-context1m`}
                  label="启用 1M 上下文"
                  hint="开启时在模型名末尾添加 [1m]，关闭时移除；实际支持由模型和网关决定。"
                  checked={Boolean(preset.options.context1m)}
                  onCheckedChange={(checked) => {
                    const options = { ...preset.options }
                    if (checked) options.context1m = true
                    else delete options.context1m
                    const base = claudeBaseModel(preset.model)
                    changeModel(preset.id, {
                      model: checked ? `${base}[1m]` : base,
                      options
                    })
                  }}
                />
              )}
            </div>
          </div>
        )
      })}
      <FieldDescription>
        {isClaude
          ? '保存模型不会立即修改工具文件；返回首页点击“应用”后生效。关闭 1M 仅移除后缀，模型原生上下文容量由工具决定。'
          : '1M 长上下文与 Fast Mode 由共通配置统一管理，切换供应商或模型后继续沿用。保存模型列表不会立即修改工具文件。'}
      </FieldDescription>
    </section>
  )
}
