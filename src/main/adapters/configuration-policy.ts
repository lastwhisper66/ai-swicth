import {
  hasControlCharacters,
  COMMON_FIELDS,
  atLeast,
  isObject,
  readField,
  attributionStatus,
  type ConfigObject
} from '@shared/configuration'
import type { ToolId } from '@shared/ipc'
import { AppError } from '../errors'

export function requireVersion(
  toolId: ToolId,
  version: string | null,
  minimum: string,
  label: string
): void {
  if (!atLeast(version, minimum))
    throw new AppError(
      'INCOMPATIBLE_PROVIDER',
      `${label}需要已核对的 ${toolId === 'codex' ? 'Codex CLI' : 'Claude Code'} ${minimum} 或更高版本（当前：${version ?? '未知'}）。请更新工具并刷新版本检测后重试；未写入配置。`
    )
}

export function validateCommonFields(toolId: ToolId, root: ConfigObject): void {
  for (const field of COMMON_FIELDS[toolId]) {
    const entry = readField(root, field.path)
    if (!entry.exists) continue
    const value = entry.value
    let valid = true
    if (field.kind === 'integer' || field.kind === 'bytes')
      valid = typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    else if (field.kind === 'text')
      valid =
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 200 &&
        !hasControlCharacters(value)
    else if (field.kind === 'disable')
      valid = typeof value === 'string' && value.length > 0 && !/^(?:false|0)$/iu.test(value)
    else if (field.path[0] === 'env')
      valid =
        typeof value === 'string' &&
        Boolean(field.choices?.some(([key]) => key !== 'default' && key === value))
    else
      valid = Boolean(
        field.choices?.some(
          ([key]) =>
            key !== 'default' &&
            (key === 'true' ? value === true : key === 'false' ? value === false : key === value)
        )
      )
    if (!valid)
      throw new AppError(
        'INVALID_INPUT',
        `${field.label}的值无效。请在表单中重新选择，或从高级原文中清除此字段以恢复默认。`
      )
  }
  if (toolId === 'claude-code') {
    if (root.attribution !== undefined && root.attribution !== false && !isObject(root.attribution))
      throw new AppError('INVALID_INPUT', 'attribution 必须是对象或 false。')
    if (isObject(root.attribution)) {
      if (
        ['commit', 'pr'].some(
          (key) =>
            root.attribution &&
            isObject(root.attribution) &&
            key in root.attribution &&
            typeof root.attribution[key] !== 'string'
        ) ||
        ('sessionUrl' in root.attribution && typeof root.attribution.sessionUrl !== 'boolean')
      )
        throw new AppError(
          'INVALID_INPUT',
          '署名的 commit / pr 必须为字符串，sessionUrl 必须为布尔值。'
        )
    }
    if (isObject(root.permissions))
      for (const key of ['allow', 'ask', 'deny']) {
        const rules = root.permissions[key]
        if (
          rules !== undefined &&
          (!Array.isArray(rules) || !rules.every((rule) => typeof rule === 'string'))
        )
          throw new AppError('INVALID_INPUT', '权限规则必须为字符串列表。')
      }
  }
}

export function validateCommonVersion(
  toolId: ToolId,
  root: ConfigObject,
  version: string | null
): void {
  const hasFields = COMMON_FIELDS[toolId].some((field) => readField(root, field.path).exists)
  if (hasFields && !version)
    requireVersion(toolId, version, toolId === 'codex' ? '0.154.0' : '2.1.310', '共通配置表单')
  if (toolId === 'codex' && hasFields)
    requireVersion(toolId, version, '0.154.0', '本版 Codex 共通选项（兼容核对基线）')
  if (toolId === 'claude-code' && hasFields)
    requireVersion(toolId, version, '2.1.310', '本版 Claude 共通选项（兼容核对基线）')
  if (toolId === 'claude-code' && attributionStatus(root) === 'hidden')
    requireVersion(toolId, version, '2.1.281', '同时隐藏三类 AI 署名')
}
