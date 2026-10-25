import { useRef, useState } from 'react'
import type { ToolId, ToolInstallation } from '@shared/ipc'
import {
  COMMON_FIELDS,
  attributionStatus,
  atLeast,
  isObject,
  readField,
  setField,
  type ConfigObject,
  type FieldValue
} from '@shared/configuration'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ConfigurationCheckbox } from './ConfigurationCheckbox'

const formFields: Record<ToolId, ReadonlySet<string>> = {
  'claude-code': new Set(['effortLevel', 'env.ENABLE_TOOL_SEARCH']),
  codex: new Set(['web_search', 'check_for_update_on_startup', 'history.max_bytes'])
}

export function CommonOptionsForm({
  toolId,
  root,
  onChange,
  disabled,
  installation,
  attributionOriginal
}: {
  toolId: ToolId
  root: ConfigObject
  onChange: (root: ConfigObject) => void
  disabled: boolean
  installation: ToolInstallation
  attributionOriginal?: FieldValue
}): React.JSX.Element {
  const attributionBefore = useRef<FieldValue | undefined>(attributionOriginal)
  const update = (path: string[], value: unknown): void => {
    const next = structuredClone(root)
    setField(next, path, value)
    onChange(next)
  }
  const status = attributionStatus(root)
  const versionDisabled =
    disabled ||
    !installation.version ||
    !atLeast(installation.version, toolId === 'codex' ? '0.154.0' : '2.1.310')
  return (
    <div className="space-y-5">
      {versionDisabled && !disabled && (
        <Alert>
          <AlertDescription>
            工具版本未知或低于本版核对基线，表单选项暂不可编辑。请更新工具并刷新检测；高级原文保留原有未知字段。
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5">
        {COMMON_FIELDS[toolId]
          .filter((field) => formFields[toolId].has(field.path.join('.')))
          .map((field) => {
            const entry = readField(root, field.path)
            const key = field.path.join('.')
            if (field.kind === 'bytes')
              return (
                <HistorySizeField
                  key={key}
                  value={entry.value}
                  disabled={versionDisabled}
                  onChange={(value) => update(field.path, value)}
                />
              )
            if (field.kind === 'text' || field.kind === 'integer')
              return (
                <Field key={key} className="gap-2">
                  <FieldLabel htmlFor={`${toolId}-${key}`}>{field.label}</FieldLabel>
                  <Input
                    id={`${toolId}-${key}`}
                    value={
                      typeof entry.value === 'string' || typeof entry.value === 'number'
                        ? entry.value
                        : ''
                    }
                    type={field.kind === 'integer' ? 'number' : 'text'}
                    min={field.kind === 'integer' ? 1 : undefined}
                    step={field.kind === 'integer' ? 1 : undefined}
                    disabled={versionDisabled}
                    placeholder="工具默认"
                    onChange={(event) =>
                      update(
                        field.path,
                        event.target.value === ''
                          ? undefined
                          : field.kind === 'integer'
                            ? Number(event.target.value)
                            : event.target.value
                      )
                    }
                  />
                  <FieldDescription className="text-xs leading-5">{field.hint}</FieldDescription>
                </Field>
              )
            const value = !entry.exists
              ? field.path[0] === 'effortLevel'
                ? ''
                : 'default'
              : field.kind === 'disable'
                ? 'true'
                : String(entry.value)
            return (
              <ConfigurationSelect
                key={key}
                label={field.label}
                value={value}
                disabled={versionDisabled}
                choices={
                  field.kind === 'disable'
                    ? [
                        ['default', '恢复默认（清除禁用字段）'],
                        ['true', '禁用']
                      ]
                    : (field.choices ?? [])
                }
                hint={field.hint}
                placeholder={field.path[0] === 'effortLevel' ? '思考强度' : undefined}
                onChange={(selected) => {
                  const value =
                    selected === 'default'
                      ? undefined
                      : field.kind === 'disable'
                        ? '1'
                        : field.path[0] === 'env'
                          ? selected
                          : selected === 'true'
                            ? true
                            : selected === 'false'
                              ? false
                              : selected
                  update(field.path, value)
                }}
              />
            )
          })}
        {toolId === 'claude-code' && (
          <>
            {(['WebSearch', 'WebFetch'] as const).map((tool) => (
              <PermissionField
                key={tool}
                tool={tool}
                root={root}
                disabled={versionDisabled}
                onChange={onChange}
              />
            ))}
            <ConfigurationCheckbox
              id="hide-ai-attribution"
              label="隐藏 AI 署名"
              hint={
                <>
                  {status === 'custom'
                    ? '当前为部分隐藏／自定义状态。'
                    : status === 'hidden'
                      ? '提交、PR 与会话链接三类署名均已隐藏。'
                      : '使用工具默认署名。'}{' '}
                  一个开关同时控制三类署名；关闭后恢复接管前设置，保留其他署名子字段。此完整语义的核对基线为
                  Claude Code 2.1.281。
                </>
              }
              checked={status === 'hidden' ? true : status === 'custom' ? 'indeterminate' : false}
              disabled={disabled || !atLeast(installation.version, '2.1.281')}
              onCheckedChange={(checked) => {
                const next = structuredClone(root)
                if (checked === true) {
                  if (status !== 'hidden' && attributionOriginal === undefined)
                    attributionBefore.current = structuredClone(readField(root, ['attribution']))
                  next.attribution = {
                    ...(isObject(root.attribution) ? root.attribution : {}),
                    commit: '',
                    pr: '',
                    sessionUrl: false
                  }
                } else {
                  const before = attributionOriginal ??
                    attributionBefore.current ?? { exists: false }
                  if (before.exists && !isObject(before.value)) next.attribution = before.value
                  else {
                    const value = isObject(root.attribution) ? { ...root.attribution } : {}
                    for (const key of ['commit', 'pr', 'sessionUrl']) {
                      if (
                        before.exists &&
                        isObject(before.value) &&
                        Object.hasOwn(before.value, key)
                      )
                        value[key] = before.value[key]
                      else delete value[key]
                    }
                    if (Object.keys(value).length) next.attribution = value
                    else delete next.attribution
                  }
                }
                onChange(next)
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}

function PermissionField({
  tool,
  root,
  disabled,
  onChange
}: {
  tool: 'WebSearch' | 'WebFetch'
  root: ConfigObject
  disabled: boolean
  onChange: (root: ConfigObject) => void
}): React.JSX.Element {
  const permissions = isObject(root.permissions) ? root.permissions : {}
  const modes = (['allow', 'ask', 'deny'] as const).filter(
    (mode) => Array.isArray(permissions[mode]) && permissions[mode].includes(tool)
  )
  const value = modes.length > 1 ? 'custom' : (modes[0] ?? 'default')
  const conflicts = Object.values(permissions).some(
    (rules) =>
      Array.isArray(rules) &&
      rules.some(
        (rule) => typeof rule === 'string' && (rule === '*' || rule.startsWith(`${tool}(`))
      )
  )
  return (
    <ConfigurationSelect
      label={tool === 'WebSearch' ? '网络搜索' : '网络拉取'}
      value={value}
      choices={[
        ['default', '工具默认'],
        ['allow', '允许'],
        ['ask', '每次询问'],
        ['deny', '禁止']
      ]}
      disabled={disabled}
      hint={
        conflicts || modes.length > 1
          ? '已有通配符、限定范围或冲突规则；高优先级规则可能覆盖本选择。请在高级原文中核对，其他规则会保留。'
          : '只增删此工具的精确规则，保留其他权限；托管配置、项目配置及外部规则也可能影响实际行为。'
      }
      onChange={(mode) => {
        const next = structuredClone(root)
        for (const target of ['allow', 'ask', 'deny']) {
          const rules = readField(next, ['permissions', target]).value
          const filtered = Array.isArray(rules) ? rules.filter((rule) => rule !== tool) : []
          if (target === mode) filtered.push(tool)
          setField(next, ['permissions', target], filtered.length ? filtered : undefined)
        }
        onChange(next)
      }}
    />
  )
}

function HistorySizeField({
  value,
  onChange,
  disabled
}: {
  value: unknown
  onChange: (value: number | undefined) => void
  disabled: boolean
}): React.JSX.Element {
  const bytes = typeof value === 'number' ? value : undefined
  const [unit, setUnit] = useState(
    bytes && bytes % 1048576 === 0 ? '1048576' : bytes && bytes % 1024 === 0 ? '1024' : '1'
  )
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor="history-max-bytes">历史文件大小</FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
        <Input
          id="history-max-bytes"
          type="number"
          min="0"
          step="any"
          disabled={disabled}
          value={bytes === undefined ? '' : bytes / Number(unit)}
          onChange={(event) =>
            onChange(
              event.target.value === '' ? undefined : Number(event.target.value) * Number(unit)
            )
          }
          placeholder="不设置上限"
          aria-describedby="history-max-bytes-description"
        />
        <ConfigurationSelect
          label="历史文件大小单位"
          hideLabel
          value={unit}
          choices={[
            ['1', 'bytes'],
            ['1024', 'KiB'],
            ['1048576', 'MiB'],
            ['1073741824', 'GiB']
          ]}
          onChange={setUnit}
          disabled={disabled}
        />
      </div>
      <FieldDescription id="history-max-bytes-description" className="text-xs leading-5">
        留空恢复默认；转换后必须为正整数字节。超过上限时工具会丢弃最早记录。
      </FieldDescription>
    </Field>
  )
}
