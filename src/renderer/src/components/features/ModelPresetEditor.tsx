import { createModelPreset } from '@renderer/lib/provider-form'
import { Plus, Star, Trash2 } from 'lucide-react'
import type { ToolId, ToolInstallation } from '@shared/ipc'
import {
  codexEfforts,
  REASONING_SUMMARIES,
  VERBOSITIES,
  DEFAULT_CHOICES,
  atLeast,
  claudeBaseModel,
  nativeModel,
  type HeaderInput,
  type ModelOptions,
  type ModelPreset,
  type ProviderToolConfiguration
} from '@shared/configuration'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Badge } from '@renderer/components/ui/badge'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ConfigurationCheckbox } from './ConfigurationCheckbox'

export function ModelPresetEditor({
  toolId,
  configuration,
  installation,
  onChange
}: {
  toolId: ToolId
  configuration: ProviderToolConfiguration<HeaderInput>
  installation: ToolInstallation
  onChange: (value: ProviderToolConfiguration<HeaderInput>) => void
}): React.JSX.Element {
  const isClaude = toolId === 'claude-code'
  const version = installation.version
  const changeModel = (id: string, changes: Partial<ModelPreset>): void =>
    onChange({
      ...configuration,
      models: configuration.models.map((model) => {
        if (model.id !== id) return model
        const next = { ...model, ...changes }
        if (isClaude) next.name = nativeModel(toolId, next)
        return next
      })
    })
  const option = (preset: ModelPreset, key: keyof ModelOptions, value: string): void => {
    const options = { ...preset.options }
    if (value === 'default') delete options[key]
    else
      Object.assign(options, { [key]: value === 'true' ? true : value === 'false' ? false : value })
    changeModel(preset.id, { options })
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">模型列表与选项</h3>
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
          ? '直接填写模型名，勾选 1M 上下文即可添加 [1m] 后缀。思考强度在共通配置中统一设置。'
          : '同一 API 模型 ID 可保存多个预设。选项随预设保存；1M、Fast 及思考级别的实际可用性由模型和网关决定。'}
      </p>
      {!isClaude && !version && (
        <p role="status" className="text-sm text-amber-600">
          工具版本未知，模型选项暂不可选。请先安装或修复工具并刷新检测。
        </p>
      )}
      {configuration.models.map((preset, index) => {
        const canUseOptions = atLeast(version, '0.154.0')
        const efforts = canUseOptions ? codexEfforts(preset.model) : []
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
              {!isClaude && (
                <Field className="gap-2">
                  <FieldLabel htmlFor={`${preset.id}-name`}>显示名称</FieldLabel>
                  <Input
                    id={`${preset.id}-name`}
                    value={preset.name}
                    onChange={(event) => changeModel(preset.id, { name: event.target.value })}
                    placeholder="例如：日常编程 / 深度思考"
                  />
                </Field>
              )}
              <Field className="gap-2">
                <FieldLabel htmlFor={`${preset.id}-model`}>
                  {isClaude ? '模型名' : 'API 模型 ID'}
                </FieldLabel>
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
                  placeholder={isClaude ? 'claude-sonnet-4-6' : 'gpt-5.4'}
                />
              </Field>
              {isClaude ? (
                <ConfigurationCheckbox
                  id={`${preset.id}-context1m`}
                  label="启用 1M 上下文"
                  hint="勾选在模型名末尾添加 [1m]，取消时移除；实际支持由模型和网关决定。"
                  checked={Boolean(preset.options.context1m)}
                  onCheckedChange={(checked) => {
                    const options = { ...preset.options }
                    if (checked === true) options.context1m = true
                    else delete options.context1m
                    const base = claudeBaseModel(preset.model)
                    changeModel(preset.id, {
                      model: checked === true ? `${base}[1m]` : base,
                      options
                    })
                  }}
                />
              ) : (
                <>
                  <ConfigurationSelect
                    label="1M 长上下文"
                    value={preset.options.context1m ? 'true' : 'default'}
                    choices={[
                      ['default', '恢复工具默认'],
                      ...(canUseOptions ? [['true', '请求 1M'] as const] : [])
                    ]}
                    onChange={(value) => option(preset, 'context1m', value)}
                    disabled={!canUseOptions && !preset.options.context1m}
                    hint="请求固定 1,000,000 tokens；不设置自动压缩阈值。"
                  />
                  <ConfigurationSelect
                    label="思考强度"
                    value={preset.options.effort ?? 'default'}
                    choices={[
                      ['default', '工具默认'],
                      ...efforts.map((value) => [value, value] as const)
                    ]}
                    onChange={(value) => option(preset, 'effort', value)}
                    disabled={!efforts.length && preset.options.effort === undefined}
                    hint={
                      efforts.length
                        ? '仅列出该官方模型已核对的级别；网关实际支持情况未探测。'
                        : '自定义别名或此型号的强度尚未核对，请使用工具默认。'
                    }
                  />
                  <ConfigurationSelect
                    label="Fast mode"
                    value={
                      preset.options.fast === undefined ? 'default' : String(preset.options.fast)
                    }
                    choices={DEFAULT_CHOICES}
                    onChange={(value) => option(preset, 'fast', value)}
                    disabled={!canUseOptions}
                    hint="使用 service_tier = fast，并同步 features.fast_mode。"
                  />
                  <ConfigurationSelect
                    label="计划模式思考强度"
                    value={preset.options.planEffort ?? 'default'}
                    choices={[
                      ['default', '工具默认'],
                      ...efforts.map((value) => [value, value] as const)
                    ]}
                    onChange={(value) => option(preset, 'planEffort', value)}
                    disabled={!canUseOptions}
                  />
                  <ConfigurationSelect
                    label="思考摘要"
                    value={preset.options.reasoningSummary ?? 'default'}
                    choices={[
                      ['default', '工具默认'],
                      ...REASONING_SUMMARIES.map((value) => [value, value] as const)
                    ]}
                    onChange={(value) => option(preset, 'reasoningSummary', value)}
                    disabled={!canUseOptions}
                  />
                  <ConfigurationSelect
                    label="回复详细程度"
                    value={preset.options.verbosity ?? 'default'}
                    choices={[
                      ['default', '工具默认'],
                      ...VERBOSITIES.map((value) => [value, value] as const)
                    ]}
                    onChange={(value) => option(preset, 'verbosity', value)}
                    disabled={!canUseOptions}
                  />
                </>
              )}
            </div>
          </div>
        )
      })}
      <FieldDescription>
        {isClaude
          ? '保存模型不会立即修改工具文件；返回首页点击“应用”后生效。取消 1M 勾选仅移除后缀，模型原生上下文容量由工具决定。'
          : '未设置的选项恢复接管前的值；原本没有设置时清除本应用生成的覆盖。保存此列表不会立即修改工具文件。'}
      </FieldDescription>
    </section>
  )
}
