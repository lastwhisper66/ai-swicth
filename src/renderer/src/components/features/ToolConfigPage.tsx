import { baseToolId } from '@shared/ipc'
import { Info, Plus, RefreshCw } from 'lucide-react'
import type { ProviderSummary, ToolId, ToolStatus } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { ProviderRow } from './ProviderRow'
import { InstallationBadge, ToolInstallationStatus } from './ToolInstallationStatus'

interface ToolConfigPageProps {
  toolId: ToolId
  status: ToolStatus | undefined
  providers: ProviderSummary[] | undefined
  statusError?: string | null
  onRetry: () => void
  busy: boolean
  pendingProviderId: string | null
  onApply: (toolId: ToolId, providerId: string, modelId: string) => void
  onAdd: (toolId: ToolId) => void
  onEdit: (provider: ProviderSummary) => void
  onDelete: (providerId: string) => void
}

const toolDetails = {
  'claude-code': {
    name: 'Claude Code',
    description: '管理 Claude Code 使用的供应商与模型，供应商与 WSL 共用。'
  },
  codex: {
    name: 'Codex',
    description: '管理 Codex 使用的供应商与模型，供应商与 WSL 共用。'
  },
  'claude-code-wsl': {
    name: 'Claude Code WSL',
    description: '与本机 Claude Code 共用供应商，应用到当前 WSL 配置。'
  },
  'codex-wsl': {
    name: 'Codex WSL',
    description: '与本机 Codex 共用供应商，应用到当前 WSL 配置。'
  }
} as const

export function ToolConfigPage({
  toolId,
  status,
  providers,
  statusError,
  onRetry,
  busy,
  pendingProviderId,
  onApply,
  onAdd,
  onEdit,
  onDelete
}: ToolConfigPageProps): React.JSX.Element {
  const details = toolDetails[toolId]
  const compatibleProviders =
    providers?.filter((provider) => provider.tools.includes(baseToolId(toolId))) ?? []
  const showStatusMessage = Boolean(
    status?.statusMessage && !(status.fileState === 'ready' && status.currentProviderId)
  )

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b bg-muted/35 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
              <ToolIcon toolId={toolId} className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{details.name}</h2>
                {status ? (
                  <>
                    <InstallationBadge installation={status.installation} />
                    <StatusBadge status={status} />
                  </>
                ) : (
                  <Badge variant="outline">
                    {!statusError && <Spinner className="size-3" />}
                    {statusError ? '状态待确认' : '正在确认'}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{details.description}</p>
              {status && status.installation.state !== 'installed' && (
                <div className="mt-2">
                  <ToolInstallationStatus installation={status.installation} />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-[1fr_1fr_1.5fr]">
          <InfoItem
            label="当前供应商"
            value={
              status
                ? (status.currentProviderName ?? (status.isExternalConfig ? '外部配置' : '未配置'))
                : '—'
            }
            loading={!status && !statusError}
          />
          <InfoItem
            label="当前模型"
            value={status?.model ?? '—'}
            loading={!status && !statusError}
            mono
          />
          <InfoItem
            label="Base URL"
            value={status?.baseUrl ?? '—'}
            loading={!status && !statusError}
            mono
          />
          {statusError && (
            <Alert variant="destructive" className="sm:col-span-3">
              <Info />
              <AlertDescription>{statusError}</AlertDescription>
              <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
                <RefreshCw />
                重试
              </Button>
            </Alert>
          )}
          {status && showStatusMessage && (
            <Alert className="bg-muted/25 sm:col-span-3" role="status">
              <Info aria-hidden="true" />
              <AlertDescription className="text-xs leading-5 wrap-anywhere">
                {status.statusMessage}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              供应商
              {providers && <Badge variant="secondary">{compatibleProviders.length}</Badge>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              点击“应用”切换 {details.name} 使用的供应商。
            </p>
          </div>
          {compatibleProviders.length > 0 && (
            <Button onClick={() => onAdd(toolId)} disabled={busy}>
              <Plus aria-hidden="true" />
              添加供应商
            </Button>
          )}
        </div>

        {!providers ? (
          <div className="space-y-3" aria-busy="true" aria-label="正在读取供应商">
            <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
            <div className="h-28 animate-pulse rounded-xl border bg-muted/30" />
          </div>
        ) : compatibleProviders.length === 0 ? (
          <Empty className="border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ToolIcon toolId={toolId} />
              </EmptyMedia>
              <EmptyTitle>尚无适用于 {details.name} 的供应商</EmptyTitle>
              <EmptyDescription>添加连接信息和模型预设后，即可在这里应用。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => onAdd(toolId)} disabled={busy}>
                <Plus aria-hidden="true" />
                添加供应商
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul
            className="grid list-none grid-cols-1 gap-3 p-0"
            aria-label={`${details.name} 供应商`}
          >
            {compatibleProviders.map((provider) => (
              <li key={provider.id} className="min-w-0">
                <ProviderRow
                  provider={provider}
                  toolId={toolId}
                  isCurrent={provider.id === status?.currentProviderId}
                  currentModelId={
                    provider.id === status?.currentProviderId ? status.currentModelId : null
                  }
                  pending={provider.id === pendingProviderId}
                  busy={busy}
                  applyDisabled={!status}
                  onApply={(modelId) => onApply(toolId, provider.id, modelId)}
                  onEdit={() => onEdit(provider)}
                  onDelete={() => onDelete(provider.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function InfoItem({
  label,
  value,
  mono = false,
  loading = false
}: {
  label: string
  value: string
  mono?: boolean
  loading?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`truncate text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {loading ? (
          <>
            <Spinner className="size-4" />
            <span className="sr-only">正在确认</span>
          </>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ToolStatus }): React.JSX.Element {
  if (status.fileState === 'invalid' || status.fileState === 'unreadable') {
    return <Badge variant="destructive">配置需处理</Badge>
  }
  if (status.currentProviderId) {
    return <Badge variant="secondary">配置已匹配</Badge>
  }
  return (
    <Badge variant="outline">{status.fileState === 'missing' ? '配置未创建' : '配置未匹配'}</Badge>
  )
}
