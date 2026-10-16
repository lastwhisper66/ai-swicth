import { useEffect, useState } from 'react'
import { ArrowLeftRight, CircleCheck, LoaderCircle, RefreshCw } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

const connectionError = '无法连接本地应用，请点击重试；如果仍然失败，请关闭并重新打开应用。'

function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    window.api
      .getAppInfo()
      .then((info) => {
        if (active) setAppInfo(info)
      })
      .catch(() => {
        if (active) setError(connectionError)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function refreshAppInfo(): Promise<void> {
    setIsLoading(true)
    setError(null)

    try {
      setAppInfo(await window.api.getAppInfo())
    } catch {
      setError(connectionError)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col px-8 py-12 sm:px-12">
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ArrowLeftRight className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">AI Switch</h1>
        <Badge variant="outline" className="ml-auto">
          本地配置管理
        </Badge>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-8 py-12">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Claude Code · Codex</p>
          <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            统一管理你的 AI 供应商
          </h2>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            集中维护 API 信息，为不同工具独立切换供应商。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>欢迎使用 AI Switch</CardTitle>
            <CardDescription>开发环境已初始化，可以开始构建应用功能。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
              {isLoading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : error ? null : (
                <CircleCheck className="size-4 text-emerald-600" aria-hidden="true" />
              )}
              <span className={error ? 'text-destructive' : undefined}>
                {isLoading ? '正在连接本地应用…' : error || `本地连接正常 · v${appInfo?.version}`}
              </span>
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-4">
            <span className="text-xs leading-5 text-muted-foreground">
              供应商管理、配置切换与备份恢复待接入。
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void refreshAppInfo()}
            >
              <RefreshCw aria-hidden="true" />
              {error ? '重试连接' : '刷新连接'}
            </Button>
          </CardFooter>
        </Card>
      </section>

      <footer className="text-xs text-muted-foreground">AI Switch · 让本地配置更简单</footer>
    </main>
  )
}

export default App
