import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ApplicationTask, ManagedApplication } from '@shared/ipc'
import {
  getApplicationDefinition,
  isWslApplication,
  type ApplicationId
} from '@shared/applications'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

const PAGE_SIZE = 5
const actionNames = {
  install: '安装',
  update: '更新',
  uninstall: '卸载',
  'check-update': '检查更新'
}
const stateNames = { running: '进行中', succeeded: '已完成', failed: '失败' }

export function ApplicationDetailsDialog({
  applicationId,
  application,
  tasks,
  error,
  onClose
}: {
  applicationId: ApplicationId
  application: ManagedApplication | null
  tasks: ApplicationTask[]
  error: string | null
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState('installation')
  const [page, setPage] = useState(1)
  const body = useRef<HTMLDivElement>(null)
  const history = [...tasks].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  const pages = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const records = history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const definition = getApplicationDefinition(applicationId)

  if (page !== currentPage) setPage(currentPage)

  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [currentPage, tab])

  function changePage(nextPage: number): void {
    setPage(nextPage)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex h-[min(40rem,85dvh)] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{definition.name} · 详情</DialogTitle>
          <DialogDescription>
            {isWslApplication(applicationId)
              ? `WSL · ${application?.distributionLabel ?? '发行版待确认'}`
              : '本机'}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList className="shrink-0">
            <TabsTrigger value="installation">安装详情</TabsTrigger>
            <TabsTrigger value="history">操作记录（{history.length}）</TabsTrigger>
          </TabsList>
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <TabsContent value="installation" className="m-0 space-y-3">
              {application ? (
                <InstallationDetails application={application} />
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  正在确认安装信息…
                </div>
              )}
            </TabsContent>
            <TabsContent value="history" className="m-0 space-y-2">
              {!records.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  本次运行暂无此工具的操作记录。
                </p>
              )}
              {records.map((task) => (
                <details key={task.id} className="rounded-lg border p-3 text-xs">
                  <summary className="cursor-pointer leading-6 marker:text-muted-foreground">
                    <span className="font-medium">{actionNames[task.action]}</span>
                    <span
                      className={
                        task.state === 'failed'
                          ? 'ml-2 text-destructive'
                          : 'ml-2 text-muted-foreground'
                      }
                    >
                      {stateNames[task.state]}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(task.startedAt).toLocaleString('zh-CN')}
                    </span>
                  </summary>
                  <p className="mt-2 break-all leading-5">{task.message}</p>
                  <pre className="mt-2 rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-5 break-all whitespace-pre-wrap">
                    {task.log.join('\n')}
                  </pre>
                </details>
              ))}
            </TabsContent>
          </div>
          {tab === 'history' && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                第 {currentPage} / {pages} 页 · 共 {history.length} 条
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  onClick={() => changePage(currentPage - 1)}
                >
                  <ChevronLeft />
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= pages}
                  onClick={() => changePage(currentPage + 1)}
                >
                  下一页
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function InstallationDetails({
  application
}: {
  application: ManagedApplication
}): React.JSX.Element {
  const definition = getApplicationDefinition(application.applicationId)
  const fields = [
    ['安装版本', application.installation.version ?? '未检测到'],
    ['npm 最新版', application.latestVersion ?? '未确认'],
    ['启动文件', application.installation.executablePath ?? '未检测到'],
    [
      '安装来源',
      application.npm.managed
        ? 'npm 全局安装'
        : application.installation.state === 'installed' && application.npm.available
          ? '其他安装方式'
          : '未确认'
    ],
    ['Node.js', application.npm.nodeVersion ?? '未检测到'],
    ['npm', application.npm.npmVersion ?? '未检测到'],
    ['全局目录', application.npm.prefix ?? '未检测到'],
    ['安装命令', `npm install -g ${definition.npmPackage}`],
    ...(application.distribution
      ? [
          ['发行版', `${application.distributionLabel}（${application.distribution}）`],
          ['Linux 用户', application.user ?? '未确认'],
          ['shell', application.shell ?? '未确认']
        ]
      : [])
  ]
  return (
    <>
      <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs leading-5">
        <p>{application.installation.message}</p>
        <p>{application.npm.message}</p>
        {application.latestVersionError && (
          <p className="text-destructive">{application.latestVersionError}</p>
        )}
        {application.environmentError && (
          <p className="text-destructive">{application.environmentError}</p>
        )}
      </div>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs leading-5">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {application.distribution && (
        <p className="text-xs text-muted-foreground">自动 shell 跟随默认登录 shell。</p>
      )}
    </>
  )
}
