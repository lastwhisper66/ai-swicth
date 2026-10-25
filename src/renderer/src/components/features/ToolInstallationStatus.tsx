import { AlertCircle, CheckCircle2, CircleHelp } from 'lucide-react'
import type { ToolInstallation } from '@shared/ipc'
import { Badge } from '@renderer/components/ui/badge'

export function InstallationBadge({
  installation
}: {
  installation: ToolInstallation
}): React.JSX.Element {
  if (installation.state === 'installed') {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        已安装 · {installation.version}
      </Badge>
    )
  }
  const unavailable = installation.state === 'unavailable'
  const Icon = unavailable ? AlertCircle : CircleHelp
  return (
    <Badge variant={unavailable ? 'destructive' : 'outline'} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {unavailable ? '安装需检查' : '未检测到安装'}
    </Badge>
  )
}

export function ToolInstallationStatus({
  installation,
  showPath = false
}: {
  installation: ToolInstallation
  showPath?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1 text-xs leading-5 text-muted-foreground" role="status">
      <p>{installation.message}</p>
      {showPath && installation.executablePath && (
        <p className="break-all">
          启动文件：<span className="font-mono">{installation.executablePath}</span>
        </p>
      )}
    </div>
  )
}
