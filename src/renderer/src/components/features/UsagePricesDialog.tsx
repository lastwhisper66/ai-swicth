import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { USAGE_LABEL_MAX_LENGTH, type UsagePrice } from '@shared/usage'
import { hasControlCharacters } from '@shared/configuration'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

const fields = [
  ['input', '新增输入'],
  ['output', '输出'],
  ['cacheRead', '缓存读取'],
  ['cacheWrite', '缓存写入']
] as const
type Draft = {
  key: number
  model: string
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
}

export function UsagePricesDialog({
  prices,
  models,
  onClose,
  onSaved
}: {
  prices: UsagePrice[]
  models: string[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<Draft[]>(() =>
    prices.map((price, key) => ({
      key,
      model: price.model,
      input: String(price.input),
      output: String(price.output),
      cacheRead: String(price.cacheRead),
      cacheWrite: String(price.cacheWrite)
    }))
  )
  const [nextKey, setNextKey] = useState(prices.length)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(): Promise<void> {
    const result: UsagePrice[] = []
    for (const row of rows) {
      if (
        !row.model.trim() ||
        row.model.length > USAGE_LABEL_MAX_LENGTH ||
        hasControlCharacters(row.model) ||
        fields.some(
          ([key]) =>
            !row[key].trim() ||
            !Number.isFinite(Number(row[key])) ||
            Number(row[key]) < 0 ||
            Number(row[key]) > 1_000_000
        )
      ) {
        setError('请填写模型名称及四项非负单价；免费项请填 0。')
        return
      }
      result.push({
        model: row.model.trim(),
        input: Number(row.input),
        output: Number(row.output),
        cacheRead: Number(row.cacheRead),
        cacheWrite: Number(row.cacheWrite)
      })
    }
    if (new Set(result.map((r) => r.model)).size !== result.length) {
      setError('模型名称不能重复，请合并相同模型的价格。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await window.api.usage.savePrices({ prices: result })
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      toast.success('模型价格已保存，历史用量将按新单价重新估算。')
      onSaved()
    } catch {
      setError('价格保存失败，请重新打开应用后重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>模型价格</DialogTitle>
          <DialogDescription>
            单位为美元 / 百万 Tokens。按模型 ID
            精确匹配，同名模型共用单价；估算仅供参考，实际费用以供应商账单为准。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-1">
          {!rows.length && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              尚未设置价格。添加后即可估算日志中的 Token 成本。
            </p>
          )}
          {rows.map((row) => (
            <fieldset key={row.key} disabled={saving} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`usage-model-${row.key}`}>模型 ID</Label>
                  <Input
                    id={`usage-model-${row.key}`}
                    list="usage-model-options"
                    value={row.model}
                    maxLength={USAGE_LABEL_MAX_LENGTH}
                    placeholder="填写日志中的模型 ID"
                    onChange={(e) =>
                      setRows((previous) =>
                        previous.map((item) =>
                          item.key === row.key ? { ...item, model: e.target.value } : item
                        )
                      )
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${row.model || '此模型'} 的价格`}
                  onClick={() =>
                    setRows((previous) => previous.filter((item) => item.key !== row.key))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fields.map(([key, name]) => (
                  <div key={key} className="space-y-1.5">
                    <Label
                      className="text-xs text-muted-foreground"
                      htmlFor={`usage-${row.key}-${key}`}
                    >
                      {name}
                    </Label>
                    <Input
                      id={`usage-${row.key}-${key}`}
                      type="number"
                      min="0"
                      max="1000000"
                      step="any"
                      placeholder="0.00"
                      value={row[key]}
                      onChange={(e) =>
                        setRows((previous) =>
                          previous.map((item) =>
                            item.key === row.key ? { ...item, [key]: e.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <datalist id="usage-model-options">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <Button
            variant="outline"
            size="sm"
            disabled={saving || rows.length >= 200}
            onClick={() => {
              setRows((previous) => [
                ...previous,
                {
                  key: nextKey,
                  model: models.find((model) => !previous.some((r) => r.model === model)) ?? '',
                  input: '',
                  output: '',
                  cacheRead: '',
                  cacheWrite: ''
                }
              ])
              setNextKey((key) => key + 1)
            }}
          >
            <Plus />
            添加模型价格
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          日志已有金额时优先使用日志金额。价格仅保存在本机，更改后对所有历史记录生效；留空不会被当作免费。
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存价格'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
