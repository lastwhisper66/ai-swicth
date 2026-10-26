import type { AppInfo } from '@shared/ipc'
import { AppIcon } from '@renderer/components/AppIcon'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'

export function AboutSettings({ appInfo }: { appInfo: AppInfo }): React.JSX.Element {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">关于</h2>
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-4">
            <AppIcon className="size-14" />
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-xl font-semibold">AI Switch</h3>
              <p className="text-sm text-muted-foreground">本地 AI 供应商配置管理与工具切换</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            集中管理供应商、API 连接与模型预设，分别切换 Claude Code 和 Codex
            的配置，并通过备份与恢复管理配置历史。
          </p>
          <dl className="divide-y border-t text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">应用名称</dt>
              <dd className="font-medium">{appInfo.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">版本</dt>
              <dd>
                <Badge variant="outline">v{appInfo.version}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">作者</dt>
              <dd>LastWhisper</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pt-3">
              <dt className="text-muted-foreground">开源许可</dt>
              <dd>MIT License</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
