import { nativeModel, type ModelPreset } from '@shared/configuration'
import type { ToolId } from '@shared/ipc'

export function createModelPreset(): ModelPreset {
  return { id: crypto.randomUUID(), model: '', options: {} }
}

/** Keep presets for the same API model distinguishable without saved display names. */
export function modelPresetChoices(toolId: ToolId, models: ModelPreset[]): [string, string][] {
  const apiModels = models.map((preset) => nativeModel(toolId, preset))
  const labels = models.map((preset, index) => {
    const apiModel = apiModels[index]
    if (apiModels.filter((model) => model === apiModel).length === 1) return apiModel
    const options = preset.options
    const details = [
      options.context1m && '1M',
      options.fast !== undefined && `Fast ${options.fast ? '开启' : '关闭'}`,
      options.planEffort && `计划思考 ${options.planEffort}`,
      options.reasoningSummary && `思考摘要 ${options.reasoningSummary}`,
      options.verbosity && `回复详细程度 ${options.verbosity}`
    ].filter(Boolean)
    return `${apiModel}（${details.length ? details.join('，') : '未覆盖选项'}）`
  })
  return models.map((preset, index) => {
    const label = labels[index]
    return [
      preset.id,
      labels.filter((entry) => entry === label).length > 1 ? `${label} · 预设 ${index + 1}` : label
    ]
  })
}
