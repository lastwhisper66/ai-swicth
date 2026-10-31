import { useState, type ReactNode } from 'react'
import { Download, FileText, MoreHorizontal, RefreshCw, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  type ApplicationAction,
  type ApplicationPreferences,
  type ApplicationTask,
  type ManagedApplication,
  type SetWslLaunchSettingsInput,
  type ToolId
} from '@shared/ipc'
import {
  APPLICATION_IDS,
  APPLICATION_INSTANCES,
  getApplicationDefinition,
  isWslApplication,
  type ApplicationId
} from '@shared/applications'
import { ApplicationIcon } from '@renderer/components/ApplicationIcon'
import { useApplications } from '@renderer/hooks/use-applications'
import { ApplicationDetailsDialog } from './ApplicationDetailsDialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Spinner } from '@renderer/components/ui/spinner'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'

interface ApplicationsPageProps {
  preferences: ApplicationPreferences
  tasks: ApplicationTask[]
  onVisibilityChange: (toolId: ToolId, visible: boolean) => Promise<boolean>
  onTaskStarted: (task: ApplicationTask) => void
  onEnvironmentChanged: () => void
}

const actionNames: Record<ApplicationAction, string> = {
  install: '安装',
  update: '更新',
  uninstall: '卸载',
  'check-update': '检查更新'
}

export function ApplicationsPage({
  preferences,
  tasks,
  onVisibilityChange,
  onTaskStarted,
  onEnvironmentChanged
}: ApplicationsPageProps): React.JSX.Element {
  const { applications, refreshing, error, readyForActions, refresh } = useApplications(tasks)
  const [pending, setPending] = useState<ApplicationId | null>(null)
  const [pendingChecks, setPendingChecks] = useState(new Set<ApplicationId>())
  const [detailsTarget, setDetailsTarget] = useState<ApplicationId | null>(null)
  const [uninstallTarget, setUninstallTarget] = useState<ManagedApplication | null>(null)

  async function changeLaunch(input: SetWslLaunchSettingsInput): Promise<void> {
    setPending(input.applicationId)
    try {
      const response = await window.api.setWslLaunchSettings(input)
      if (!response.ok) {
        toast.error(response.error.message)
        return
      }
      toast.success('shell 已保存，同一发行版的应用共用此设置。')
      onEnvironmentChanged()
      await refresh(false, true)
    } catch {
      toast.error('无法保存 WSL 设置，请重新打开应用后重试。')
    } finally {
      setPending(null)
    }
  }

  async function start(applicationId: ApplicationId, action: ApplicationAction): Promise<void> {
    const checking = action === 'check-update'
    if (checking) setPendingChecks((current) => new Set(current).add(applicationId))
    else setPending(applicationId)
    try {
      const response = await window.api.startApplicationTask({ applicationId, action })
      if (!response.ok) {
        toast.error(response.error.message, { duration: 8000 })
        return
      }
      onTaskStarted(response.value)
    } catch {
      toast.error('任务未能启动，请重新打开应用后重试。')
    } finally {
      if (checking)
        setPendingChecks((current) => {
          const next = new Set(current)
          next.delete(applicationId)
          return next
        })
      else setPending(null)
    }
  }

  async function toggleVisibility(toolId: ToolId, visible: boolean): Promise<void> {
    setPending(toolId)
    try {
      await onVisibilityChange(toolId, visible)
    } finally {
      setPending(null)
    }
  }

  const installed =
    applications?.filter((application) => application.installation.state === 'installed') ?? []
  const remaining =
    applications?.filter((application) => application.installation.state !== 'installed') ?? []
  const hasUncertain = remaining.some(
    (application) => application.installation.state === 'unavailable'
  )

  function renderApplication(application: ManagedApplication): React.JSX.Element {
    const configurationToolId = APPLICATION_INSTANCES[application.applicationId].configurationToolId
    const task = tasks.findLast((entry) => entry.applicationId === application.applicationId)
    const sameEnvironment = (applicationId: ApplicationId): boolean =>
      isWslApplication(applicationId) === isWslApplication(application.applicationId) &&
      (!isWslApplication(applicationId) ||
        applications?.find((item) => item.applicationId === applicationId)?.distribution ===
          application.distribution)
    const environmentTasks = tasks.filter(
      (entry) => entry.state === 'running' && sameEnvironment(entry.applicationId)
    )
    const mutationRunning = environmentTasks.some((entry) => entry.action !== 'check-update')
    const checkStarting = [...pendingChecks].some(sameEnvironment)
    return (
      <ApplicationRow
        key={application.applicationId}
        application={application}
        task={task}
        visible={configurationToolId ? preferences.visible[configurationToolId] : false}
        visibilityDisabled={pending !== null || !configurationToolId}
        disabled={
          !readyForActions || pending !== null || environmentTasks.length > 0 || checkStarting
        }
        checkDisabled={
          !readyForActions ||
          pending !== null ||
          mutationRunning ||
          pendingChecks.has(application.applicationId) ||
          (task?.state === 'running' && task.action === 'check-update')
        }
        checking={
          pendingChecks.has(application.applicationId) ||
          (task?.state === 'running' && task.action === 'check-update')
        }
        relatedRunning={mutationRunning}
        onVisibilityChange={(visible) => {
          if (configurationToolId) void toggleVisibility(configurationToolId, visible)
        }}
        onAction={(action) => void start(application.applicationId, action)}
        onLaunchChange={(input) => void changeLaunch(input)}
        onUninstall={() => setUninstallTarget(application)}
        onDetails={() => setDetailsTarget(application.applicationId)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight">AI 应用</h1>
          <p className="text-xs text-muted-foreground">管理 CLI 安装与版本</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void refresh(true)}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? '正在刷新' : '重新检测'}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {applications?.some((application) => application.latestVersionError) && (
        <p role="status" className="text-xs text-muted-foreground">
          部分应用的 npm 最新版本查询失败，对应更新已禁用。请检查网络后重试。
        </p>
      )}
      {!applications ? (
        <ApplicationSection title="待确认" count={APPLICATION_IDS.length} versionTitle="版本">
          {APPLICATION_IDS.map((applicationId) => {
            const configurationToolId = APPLICATION_INSTANCES[applicationId].configurationToolId
            return (
              <PendingApplicationRow
                key={applicationId}
                applicationId={applicationId}
                visible={configurationToolId ? preferences.visible[configurationToolId] : false}
                failed={!!error}
              />
            )
          })}
        </ApplicationSection>
      ) : (
        <>
          <ApplicationSection title="已安装" count={installed.length} versionTitle="版本">
            {installed.length ? (
              installed.map(renderApplication)
            ) : (
              <EmptyApplications message="暂未检测到已安装的应用" />
            )}
          </ApplicationSection>
          <ApplicationSection
            title={hasUncertain ? '未安装 / 待确认' : '未安装'}
            count={remaining.length}
            versionTitle="状态"
          >
            {remaining.length ? (
              remaining.map(renderApplication)
            ) : (
              <EmptyApplications message="所有应用均已安装" />
            )}
          </ApplicationSection>
        </>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        WSL 使用已配置或默认发行版；显示开关控制供应商页面在侧栏的显示。
      </p>
      {detailsTarget && (
        <ApplicationDetailsDialog
          key={detailsTarget}
          applicationId={detailsTarget}
          application={
            applications?.find((application) => application.applicationId === detailsTarget) ?? null
          }
          tasks={tasks.filter((task) => task.applicationId === detailsTarget)}
          error={error}
          onClose={() => setDetailsTarget(null)}
        />
      )}
      <AlertDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              卸载{' '}
              {uninstallTarget ? getApplicationDefinition(uninstallTarget.applicationId).name : ''}
              ？
            </AlertDialogTitle>
            <AlertDialogDescription>
              将卸载
              {uninstallTarget?.distributionLabel
                ? ` WSL ${uninstallTarget.distributionLabel}`
                : '本机'}{' '}
              中的 npm 全局安装。工具配置、登录信息和历史记录会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (uninstallTarget) void start(uninstallTarget.applicationId, 'uninstall')
              }}
            >
              卸载
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ApplicationSection({
  title,
  count,
  versionTitle,
  children
}: {
  title: string
  count: number
  versionTitle: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col />
          <col className="w-20 md:w-24" />
          <col className="w-10 md:w-12" />
          <col className="w-12" />
          <col className="w-16" />
          <col className="w-24" />
        </colgroup>
        <thead className="border-b bg-muted/25 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-normal">
              <h2 className="font-medium text-foreground">
                {title}
                <span className="ml-1.5 font-normal text-muted-foreground">· {count}</span>
              </h2>
            </th>
            <th scope="col" className="py-2 text-center font-normal">
              {versionTitle}
            </th>
            <th scope="col" className="py-2 text-center font-normal">
              显示
            </th>
            <th scope="col" className="py-2 text-center font-normal">
              详情
            </th>
            <th scope="col" className="py-2 text-center font-normal">
              检查更新
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">
              操作
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </section>
  )
}

function EmptyApplications({ message }: { message: string }): React.JSX.Element {
  return (
    <tbody>
      <tr>
        <td colSpan={6} className="px-3 py-5 text-center text-xs text-muted-foreground">
          {message}
        </td>
      </tr>
    </tbody>
  )
}

function PendingApplicationRow({
  applicationId,
  visible,
  failed
}: {
  applicationId: ApplicationId
  visible: boolean
  failed: boolean
}): React.JSX.Element {
  const name = getApplicationDefinition(applicationId).name
  return (
    <tbody className="border-b last:border-b-0">
      <tr>
        <td className="px-3 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ApplicationIcon applicationId={applicationId} className="size-5" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium">{name}</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {isWslApplication(applicationId) ? 'WSL' : '本机'}
                </Badge>
              </div>
              <div
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                role="status"
              >
                {!failed && <Spinner className="size-3 shrink-0" />}
                <span className="truncate">
                  {failed
                    ? '路径待确认'
                    : isWslApplication(applicationId)
                      ? '正在确认发行版与路径'
                      : '正在确认路径'}
                </span>
              </div>
            </div>
          </div>
        </td>
        <td className="text-center text-[11px] text-muted-foreground" role="status">
          {failed ? (
            '待确认'
          ) : (
            <>
              <Spinner className="mx-auto size-4" />
              <span className="sr-only">正在确认版本</span>
            </>
          )}
        </td>
        <td className="text-center">
          <Switch size="sm" checked={visible} disabled aria-label={`在侧栏显示 ${name}`} />
        </td>
        <td className="text-center">
          <IconActionButton label={`${name} 安装详情与记录`} disabled>
            <FileText />
          </IconActionButton>
        </td>
        <td className="text-center">
          <IconActionButton label={`检查 ${name} 更新`} disabled>
            <RefreshCw />
          </IconActionButton>
        </td>
        <td className="pr-2 text-right">
          <Button size="icon-xs" variant="ghost" disabled aria-label={`${name} 更多操作`}>
            <MoreHorizontal />
          </Button>
        </td>
      </tr>
    </tbody>
  )
}

function ApplicationRow({
  application,
  task,
  visible,
  disabled,
  checkDisabled,
  checking,
  visibilityDisabled,
  relatedRunning,
  onVisibilityChange,
  onAction,
  onLaunchChange,
  onUninstall,
  onDetails
}: {
  application: ManagedApplication
  task: ApplicationTask | undefined
  visible: boolean
  disabled: boolean
  checkDisabled: boolean
  checking: boolean
  visibilityDisabled: boolean
  relatedRunning: boolean
  onVisibilityChange: (visible: boolean) => void
  onAction: (action: ApplicationAction) => void
  onLaunchChange: (input: SetWslLaunchSettingsInput) => void
  onUninstall: () => void
  onDetails: () => void
}): React.JSX.Element {
  const installed = application.installation.state === 'installed'
  const missing = application.installation.state === 'not-detected'
  const warning =
    application.environmentError ??
    (application.installation.state === 'unavailable'
      ? application.installation.message
      : !application.npm.available
        ? application.npm.message
        : null)
  const name = getApplicationDefinition(application.applicationId).name
  const wsl = isWslApplication(application.applicationId)
  const hasProviderPage = !!APPLICATION_INSTANCES[application.applicationId].configurationToolId
  const visibilityLabel = hasProviderPage
    ? `在侧栏显示 ${name}${wsl ? ' WSL' : ''}`
    : `${name} 支持安装管理，尚未接入供应商页面`
  const installable = missing && application.npm.available && !application.environmentError
  const progress =
    task?.state === 'running' && task.message.startsWith('npm ')
      ? '正在执行 npm，请稍候…'
      : task?.message
  const showTaskProgress = task && task.action !== 'check-update' && task.state !== 'succeeded'
  const hasSecondary = wsl || warning || relatedRunning || showTaskProgress
  return (
    <tbody className="border-b last:border-b-0">
      <tr>
        <td className="px-3 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ApplicationIcon applicationId={application.applicationId} className="size-5" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-sm font-medium">{name}</span>
                <Badge
                  variant="secondary"
                  className="h-4 max-w-full px-1.5 text-[10px]"
                  title={application.distributionLabel ?? undefined}
                >
                  <span className="truncate">
                    {wsl ? `WSL · ${application.distributionLabel ?? '不可用'}` : '本机'}
                  </span>
                </Badge>
              </div>
              <p
                className="truncate text-[11px] text-muted-foreground"
                title={application.installation.executablePath ?? undefined}
              >
                {application.installation.executablePath ??
                  (missing ? '通过 npm 安装' : '安装状态需检查')}
              </p>
            </div>
          </div>
        </td>
        <td className="px-1 py-3 text-center">
          {installed ? (
            <div className="space-y-0.5">
              <p className="font-mono text-xs tabular-nums">{application.installation.version}</p>
              <p
                className="text-[10px] text-muted-foreground"
                title={
                  application.latestVersionError ??
                  `npm 最新版本：${application.latestVersion ?? '未知'}`
                }
              >
                {checking
                  ? '正在检查更新'
                  : application.latestVersionError
                    ? '查询更新失败'
                    : application.updateAvailable
                      ? `新版本 ${application.latestVersion}`
                      : application.latestVersion
                        ? '无可用更新'
                        : ''}
              </p>
            </div>
          ) : (
            <span className={`text-xs ${missing ? 'text-muted-foreground' : 'text-destructive'}`}>
              {missing ? '未安装' : '需检查'}
            </span>
          )}
        </td>
        <td className="text-center">
          <Switch
            size="sm"
            checked={visible}
            disabled={visibilityDisabled}
            aria-label={visibilityLabel}
            title={visibilityLabel}
            onCheckedChange={onVisibilityChange}
          />
        </td>
        <td className="text-center">
          <IconActionButton
            label={`${name}${wsl ? ' WSL' : ''} 安装详情与记录`}
            onClick={onDetails}
          >
            <FileText />
          </IconActionButton>
        </td>
        <td className="text-center">
          <IconActionButton
            label={
              checking
                ? `正在检查 ${name}${wsl ? ' WSL' : ''} 更新`
                : `检查 ${name}${wsl ? ' WSL' : ''} 更新`
            }
            disabled={checkDisabled || !!application.environmentError}
            busy={checking}
            onClick={() => onAction('check-update')}
          >
            <RefreshCw className={checking ? 'animate-spin' : undefined} />
          </IconActionButton>
        </td>
        <td className="pr-2">
          <div className="flex items-center justify-end gap-1">
            {missing ? (
              <Button
                size="xs"
                variant="outline"
                disabled={disabled || !installable}
                onClick={() => onAction('install')}
              >
                <Download />
                安装
              </Button>
            ) : application.updateAvailable ? (
              <Button
                size="xs"
                variant="outline"
                disabled={disabled || !application.npm.managed || !!application.environmentError}
                title={
                  application.npm.managed
                    ? `更新至 ${application.latestVersion}`
                    : application.npm.message
                }
                onClick={() => onAction('update')}
              >
                <Upload />
                更新
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`${name}${wsl ? ' WSL' : ''} 更多操作`}
                  title="更多操作"
                  disabled={missing}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  variant="destructive"
                  disabled={disabled || !application.npm.managed || !!application.environmentError}
                  onSelect={onUninstall}
                >
                  <Trash2 />
                  卸载
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>
      {hasSecondary && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <div className="space-y-2">
              {wsl && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7.5">
                  <LaunchSelect
                    id={`shell-${application.applicationId}`}
                    label="shell"
                    value={application.launchSettings.shell}
                    choices={[
                      ['auto', '自动'],
                      ['bash', 'bash'],
                      ['zsh', 'zsh'],
                      ['fish', 'fish']
                    ]}
                    disabled={disabled || !application.distribution}
                    onChange={(shell) =>
                      onLaunchChange({
                        applicationId: application.applicationId,
                        ...application.launchSettings,
                        shell: shell as SetWslLaunchSettingsInput['shell']
                      })
                    }
                  />
                </div>
              )}
              {warning && <p className="text-xs leading-5 text-destructive">{warning}</p>}
              {relatedRunning && task?.state !== 'running' && (
                <p className="text-xs text-muted-foreground">此环境的另一个任务正在运行…</p>
              )}
              {task && showTaskProgress && (
                <div
                  role="status"
                  className={`flex items-start gap-2 text-xs leading-5 ${task.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {task.state === 'running' && <Spinner className="mt-0.5 size-4 shrink-0" />}
                  <span>
                    {actionNames[task.action]}：{progress}
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}

function IconActionButton({
  label,
  children,
  disabled,
  busy,
  onClick
}: {
  label: string
  children: ReactNode
  disabled?: boolean
  busy?: boolean
  onClick?: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={label}
          aria-busy={busy}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LaunchSelect({
  id,
  label,
  value,
  choices,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  choices: readonly (readonly [string, string])[]
  disabled: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} size="sm" className="w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map(([key, name]) => (
            <SelectItem key={key} value={key}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
