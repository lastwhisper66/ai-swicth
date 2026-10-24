import { Info, Plus } from 'lucide-react'
import type { ProviderSummary, ToolId, ToolStatus } from '@shared/ipc'
import { ToolIcon } from '@renderer/components/ToolIcon'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { ProviderCard } from './ProviderCard'

interface ToolConfigPageProps {
  toolId: ToolId
  status: ToolStatus
  providers: ProviderSummary[]
  busy: boolean
  pendingProviderId: string | null
  onApply: (toolId: ToolId, providerId: string) => void
  onAdd: (toolId: ToolId) => void
  onEdit: (provider: ProviderSummary) => void
  onDelete: (providerId: string) => void
}

const toolDetails = {
  'claude-code': {
    name: 'Claude Code',
    description: '管理 Claude Code 使用的供应商与模型。'
  },
  codex: {
    name: 'Codex',
    description: '管理 Codex 使用的供应商与模型。'
  }
} as const

export function ToolConfigPage({
  toolId,
  status,
  providers,
  busy,
  pendingProviderId,
  onApply,
  onAdd,
  onEdit,
  onDelete
}: ToolConfigPageProps): React.JSX.Element {
  const details = toolDetails[toolId]
  const compatibleProviders = providers.filter((provider) => provider.tools.includes(toolId))

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
                <CardTitle className="text-lg">{details.name}</CardTitle>
                <StatusBadge status={status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{details.description}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-[1fr_1fr_1.5fr]">
          <InfoItem
            label="当前供应商"
            value={status.currentProviderName ?? (status.isExternalConfig ? '外部配置' : '未配置')}
          />
          <InfoItem label="当前模型" value={status.model ?? '—'} mono />
          <InfoItem label="Base URL" value={status.baseUrl ?? '—'} mono />
          <Alert className="bg-muted/25 sm:col-span-3" role="status">
            <Info aria-hidden="true" />
            <AlertDescription className="text-xs leading-5 wrap-anywhere">
              {status.statusMessage}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              供应商
              <Badge variant="secondary">{compatibleProviders.length}</Badge>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              点击“应用”切换 {details.name} 使用的供应商。
            </p>
          </div>
          <Button onClick={() => onAdd(toolId)} disabled={busy}>
            <Plus aria-hidden="true" />
            添加供应商
          </Button>
        </div>

        {compatibleProviders.length === 0 ? (
          <Empty className="border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ToolIcon toolId={toolId} />
              </EmptyMedia>
              <EmptyTitle>尚无适用于 {details.name} 的供应商</EmptyTitle>
              <EmptyDescription>点击“添加供应商”开始配置。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            className="grid list-none gap-4 p-0 md:grid-cols-2"
            aria-label={`${details.name} 供应商`}
          >
            {compatibleProviders.map((provider) => (
              <li key={provider.id} className="min-w-0">
                <ProviderCard
                  provider={provider}
                  toolId={toolId}
                  isCurrent={provider.id === status.currentProviderId}
                  pending={provider.id === pendingProviderId}
                  busy={busy}
                  onApply={() => onApply(toolId, provider.id)}
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
  mono = false
}: {
  label: string
  value: string
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`truncate text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ToolStatus }): React.JSX.Element {
  if (status.fileState === 'invalid' || status.fileState === 'unreadable') {
    return <Badge variant="destructive">需处理</Badge>
  }
  if (status.currentProviderId) {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">已匹配</Badge>
  }
  return <Badge variant="outline">{status.fileState === 'missing' ? '未创建' : '未匹配'}</Badge>
}
