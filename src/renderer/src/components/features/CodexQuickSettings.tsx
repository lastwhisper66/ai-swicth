import {
  CODEX_CONTEXT_WINDOW,
  CODEX_DEFAULT_COMPACT_LIMIT,
  isObject,
  setField,
  type ConfigObject
} from '@shared/configuration'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { ConfigurationSwitch } from './ConfigurationSwitch'

export function CodexQuickSettings({
  root,
  disabled,
  onChange
}: {
  root: ConfigObject | null
  disabled: boolean
  onChange: (root: ConfigObject) => void
}): React.JSX.Element {
  const context1m = root?.model_context_window === CODEX_CONTEXT_WINDOW
  const compactLimit = root?.model_auto_compact_token_limit ?? CODEX_DEFAULT_COMPACT_LIMIT
  const features = root && isObject(root.features) ? root.features : {}
  const fast = root?.service_tier === 'fast'
  const update = (change: (next: ConfigObject) => void): void => {
    if (!root) return
    const next = structuredClone(root)
    change(next)
    onChange(next)
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/15 p-4">
      <p className="text-xs leading-6 text-muted-foreground">
        修改会立即同步到下方原文，对 Codex 的所有供应商和模型生效。保存后，应用供应商时写入本机或
        WSL。
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ConfigurationSwitch
          id="codex-common-context1m"
          label="1M 长上下文"
          hint="开启时添加右侧两项字段，关闭时从共通草稿移除这两项。"
          checked={context1m}
          disabled={disabled || !root}
          onCheckedChange={(checked) =>
            update((next) => {
              if (checked) {
                next.model_context_window = CODEX_CONTEXT_WINDOW
                next.model_auto_compact_token_limit ??= CODEX_DEFAULT_COMPACT_LIMIT
              } else {
                delete next.model_context_window
                delete next.model_auto_compact_token_limit
              }
            })
          }
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field className="min-w-0 gap-2">
            <FieldLabel htmlFor="codex-common-context-window">上下文窗口（tokens）</FieldLabel>
            <Input
              id="codex-common-context-window"
              type="number"
              value={CODEX_CONTEXT_WINDOW}
              readOnly
              disabled={disabled || !context1m}
              aria-describedby="codex-common-context-window-hint"
            />
            <FieldDescription
              id="codex-common-context-window-hint"
              className="text-xs leading-5 wrap-anywhere"
            >
              model_context_window = 1000000
            </FieldDescription>
          </Field>
          <Field className="min-w-0 gap-2">
            <FieldLabel htmlFor="codex-common-compact-limit">自动压缩阈值（tokens）</FieldLabel>
            <Input
              id="codex-common-compact-limit"
              type="number"
              min={1}
              max={CODEX_CONTEXT_WINDOW}
              step={1}
              value={typeof compactLimit === 'number' ? compactLimit : ''}
              disabled={disabled || !context1m}
              aria-describedby="codex-common-compact-limit-hint"
              aria-invalid={
                context1m &&
                (typeof compactLimit !== 'number' ||
                  !Number.isSafeInteger(compactLimit) ||
                  compactLimit < 1 ||
                  compactLimit > CODEX_CONTEXT_WINDOW)
              }
              onChange={(event) => {
                const value = event.target.valueAsNumber
                update((next) => {
                  next.model_auto_compact_token_limit = Number.isNaN(value) ? '' : value
                })
              }}
            />
            <FieldDescription
              id="codex-common-compact-limit-hint"
              className="text-xs leading-5 wrap-anywhere"
            >
              model_auto_compact_token_limit；快捷开启时默认 900,000（900k）。
            </FieldDescription>
          </Field>
        </div>
      </div>
      <ConfigurationSwitch
        id="codex-common-fast"
        label="Fast Mode"
        checked={fast}
        disabled={disabled || !root}
        onCheckedChange={(checked) =>
          update((next) => {
            next.service_tier = checked ? 'fast' : 'default'
            setField(next, ['features', 'fast_mode'], checked)
          })
        }
        hint={
          fast
            ? 'service_tier = fast；features.fast_mode = true。'
            : root?.service_tier === 'default' && features.fast_mode === false
              ? 'service_tier = default；features.fast_mode = false。'
              : '开启时写入 service_tier = fast 与 features.fast_mode = true；关闭时分别写入 default 与 false。'
        }
      />
      {!root && (
        <p className="text-xs text-destructive">请先修复下方 TOML 原文，再使用快捷设置。</p>
      )}
    </div>
  )
}
