import { Ban, Check, Cpu, Globe, KeyRound, Pencil, Play, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CopilotProviderSummary } from '@shared/copilot'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { ProviderCard, ProviderDetail } from './ProviderCard'

const syncLabels = {
  synced: '已应用',
  changed: '待重新应用',
  external: '外部配置',
  missing: '未应用'
}

const apiLabels = {
  'chat-completions': 'Chat Completions',
  responses: 'Responses',
  messages: 'Anthropic Messages'
}

export function CopilotProviderRow({
  provider,
  selected,
  busy,
  fileUnavailable,
  dragHandle,
  onSelectedChange,
  onApply,
  onEdit,
  onDisable,
  onDelete
}: {
  provider: CopilotProviderSummary
  selected: boolean
  busy: boolean
  fileUnavailable: boolean
  dragHandle?: ReactNode
  onSelectedChange: (selected: boolean) => void
  onApply: () => void
  onEdit: () => void
  onDisable: () => void
  onDelete: () => void
}): React.JSX.Element {
  const applied = provider.syncState === 'synced'
  const urls = [...new Set(provider.models.map((model) => model.url))]
  const models = provider.models
    .map((model) => (model.name === model.id ? model.id : `${model.name} (${model.id})`))
    .join('、')

  return (
    <ProviderCard
      name={provider.name}
      active={applied}
      selected={selected}
      leading={
        <div className="flex items-center gap-2">
          {dragHandle}
          <div className="flex size-8 items-center justify-center">
            <Checkbox
              aria-label={`选择 ${provider.name}`}
              disabled={busy}
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
            />
          </div>
        </div>
      }
      badges={
        <>
          <Badge
            variant={applied ? 'default' : 'outline'}
            className={applied ? 'bg-emerald-600 text-white hover:bg-emerald-600' : undefined}
          >
            {applied && <Check aria-hidden="true" />}
            {syncLabels[provider.syncState]}
          </Badge>
          {provider.apiTypes.map((apiType) => (
            <Badge key={apiType} variant="outline">
              {apiLabels[apiType]}
            </Badge>
          ))}
        </>
      }
      actions={
        <>
          <Button
            variant={applied ? 'outline' : 'default'}
            disabled={busy || fileUnavailable}
            aria-label={`应用 ${provider.name}`}
            onClick={onApply}
          >
            <Play aria-hidden="true" />
            应用
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            aria-label={`编辑 ${provider.name}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            编辑
          </Button>
          <Button
            variant="outline"
            disabled={busy || fileUnavailable || !provider.canDisable}
            aria-label={`禁用 ${provider.name}`}
            title="从当前 VS Code 配置中移除，保留应用内记录"
            onClick={onDisable}
          >
            <Ban aria-hidden="true" />
            禁用
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            aria-label={`删除 ${provider.name}`}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
            删除
          </Button>
        </>
      }
    >
      <ProviderDetail label="Base URL" value={urls.join('、')} Icon={Globe} />
      <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
        <ProviderDetail label="模型" value={models} Icon={Cpu} />
        <ProviderDetail label="API Key" value={provider.maskedApiKey || '未设置'} Icon={KeyRound} />
      </div>
    </ProviderCard>
  )
}
