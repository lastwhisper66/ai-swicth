import {
  CLAUDE_EFFORTS,
  attributionStatus,
  setField,
  type ConfigObject
} from '@shared/configuration'
import { ConfigurationSelect } from './ConfigurationSelect'
import { ConfigurationSwitch } from './ConfigurationSwitch'

export function ClaudeQuickSettings({
  root,
  disabled,
  onChange
}: {
  root: ConfigObject | null
  disabled: boolean
  onChange: (root: ConfigObject) => void
}): React.JSX.Element {
  const attribution = root ? attributionStatus(root) : 'default'
  const update = (change: (next: ConfigObject) => void): void => {
    if (!root) return
    const next = structuredClone(root)
    change(next)
    onChange(next)
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/15 p-4">
      <p className="text-xs leading-6 text-muted-foreground">
        修改会立即同步到下方原文。保存后，应用供应商时写入本机或 WSL 的 Claude Code 配置。
      </p>
      <ConfigurationSelect
        label="思考强度"
        value={typeof root?.effortLevel === 'string' ? root.effortLevel : 'default'}
        choices={[
          ['default', '工具默认'],
          ...CLAUDE_EFFORTS.map((effort) => [effort, effort] as const)
        ]}
        disabled={disabled || !root}
        onChange={(value) =>
          update((next) => {
            if (value === 'default') delete next.effortLevel
            else next.effortLevel = value
          })
        }
        hint="设置顶层 effortLevel；适用范围与实际强度由 Claude Code 版本、模型和网关决定。"
      />
      <ConfigurationSwitch
        id="claude-common-hide-attribution"
        label="隐藏 AI 签名"
        checked={attribution === 'hidden'}
        disabled={disabled || !root}
        onCheckedChange={(checked) =>
          update((next) => {
            if (checked) {
              setField(next, ['attribution', 'commit'], '')
              setField(next, ['attribution', 'pr'], '')
              setField(next, ['attribution', 'sessionUrl'], false)
            } else if (next.attribution === false) delete next.attribution
            else {
              for (const key of ['commit', 'pr', 'sessionUrl'])
                setField(next, ['attribution', key], undefined)
            }
          })
        }
        hint={
          attribution === 'custom'
            ? '当前保留原文中的自定义签名；开启后同时隐藏 commit、PR 和 session URL。'
            : '开启后同时隐藏 commit、PR 和 session URL；关闭时从共通草稿移除这三项。'
        }
      />
      {!root && (
        <p className="text-xs text-destructive">请先修复下方 JSON 原文，再使用快捷设置。</p>
      )}
    </div>
  )
}
