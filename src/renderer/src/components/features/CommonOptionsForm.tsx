import { useRef } from 'react'
import type { ToolId } from '@shared/ipc'
import {
  COMMON_FIELDS,
  attributionStatus,
  isObject,
  readField,
  setField,
  type ConfigObject,
  type FieldValue
} from '@shared/configuration'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ConfigurationCheckbox } from './ConfigurationCheckbox'

const formFields: Record<ToolId, ReadonlySet<string>> = {
  'claude-code': new Set(['effortLevel']),
  codex: new Set(['model_reasoning_effort'])
}

export function CommonOptionsForm({
  toolId,
  root,
  onChange,
  disabled,
  attributionOriginal
}: {
  toolId: ToolId
  root: ConfigObject
  onChange: (root: ConfigObject) => void
  disabled: boolean
  attributionOriginal?: FieldValue
}): React.JSX.Element {
  const attributionBefore = useRef<FieldValue | undefined>(attributionOriginal)
  const update = (path: string[], value: unknown): void => {
    const next = structuredClone(root)
    setField(next, path, value)
    onChange(next)
  }
  const status = attributionStatus(root)
  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        {COMMON_FIELDS[toolId]
          .filter((field) => formFields[toolId].has(field.path.join('.')))
          .map((field) => {
            const entry = readField(root, field.path)
            const key = field.path.join('.')
            const isEffort = ['effortLevel', 'model_reasoning_effort'].includes(key)
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
                    disabled={disabled}
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
              ? isEffort
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
                disabled={disabled}
                choices={
                  field.kind === 'disable'
                    ? [
                        ['default', '恢复默认（清除禁用字段）'],
                        ['true', '禁用']
                      ]
                    : (field.choices ?? [])
                }
                hint={field.hint}
                placeholder={isEffort ? '思考强度' : undefined}
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
                一个开关同时控制三类署名；关闭后恢复接管前设置，保留其他署名子字段。
              </>
            }
            checked={status === 'hidden' ? true : status === 'custom' ? 'indeterminate' : false}
            disabled={disabled}
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
                const before = attributionOriginal ?? attributionBefore.current ?? { exists: false }
                if (before.exists && !isObject(before.value)) next.attribution = before.value
                else {
                  const value = isObject(root.attribution) ? { ...root.attribution } : {}
                  for (const key of ['commit', 'pr', 'sessionUrl']) {
                    if (before.exists && isObject(before.value) && Object.hasOwn(before.value, key))
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
        )}
      </div>
    </div>
  )
}
