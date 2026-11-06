import { useId } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { PasswordInput } from '@renderer/components/PasswordInput'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { createCopilotHeader, type CopilotHeaderRow } from '@renderer/lib/copilot-provider-form'

const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']

export function CopilotReasoningEffortSelect({
  value = [],
  disabled,
  onChange
}: {
  value?: string[]
  disabled: boolean
  onChange: (value: string[] | undefined) => void
}): React.JSX.Element {
  const id = useId()
  const choices = [...new Set([...REASONING_EFFORTS, ...value])]
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>支持的思考强度（可多选）</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-9 w-full min-w-0 justify-between gap-2 font-normal"
            aria-describedby={`${id}-hint`}
            disabled={disabled}
          >
            <span className="truncate">{value.length ? value.join('、') : '默认（不指定）'}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem
            checked={!value.length}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onChange(undefined)}
          >
            默认（不指定）
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {choices.map((effort) => (
            <DropdownMenuCheckboxItem
              key={effort}
              checked={value.includes(effort)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => {
                const selected = checked
                  ? choices.filter((choice) => choice === effort || value.includes(choice))
                  : value.filter((choice) => choice !== effort)
                onChange(selected.length ? selected : undefined)
              }}
            >
              {effort}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <FieldDescription id={`${id}-hint`} className="text-xs leading-5">
        VS Code 会提供勾选的强度供切换，请按模型实际能力调整；选择“默认（不指定）”可清空列表。
      </FieldDescription>
    </Field>
  )
}

export function CopilotRequestHeaders({
  modelIndex,
  rows,
  onChange
}: {
  modelIndex: number
  rows: CopilotHeaderRow[]
  onChange: (rows: CopilotHeaderRow[]) => void
}): React.JSX.Element {
  return (
    <section className="space-y-3 border-t pt-4" aria-label={`模型 ${modelIndex + 1} 请求头`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">自定义请求头（可选）</h4>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-2 px-3"
          onClick={() => onChange([...rows, createCopilotHeader()])}
        >
          <Plus />
          添加请求头
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {
          '支持 Authorization 等认证头；值可使用 ${apiKey} 引用上方密钥。名称和值均留空的行不会保存。'
        }
      </p>
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Field className="col-span-2 min-w-0 gap-2 @lg:col-span-1">
            <FieldLabel htmlFor={`copilot-header-${row.id}-name`}>
              名称（Key） {index + 1}
            </FieldLabel>
            <Input
              id={`copilot-header-${row.id}-name`}
              value={row.name}
              placeholder="X-Client-Name"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) =>
                onChange(
                  rows.map((entry) =>
                    entry.id === row.id ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
          </Field>
          <Field className="min-w-0 gap-2">
            <FieldLabel htmlFor={`copilot-header-${row.id}-value`}>值（Value）</FieldLabel>
            <PasswordInput
              id={`copilot-header-${row.id}-value`}
              label={`请求头 ${index + 1} 的值`}
              value={row.value}
              placeholder="输入请求头值"
              onChange={(event) =>
                onChange(
                  rows.map((entry) =>
                    entry.id === row.id ? { ...entry, value: event.target.value } : entry
                  )
                )
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`删除模型 ${modelIndex + 1} 的请求头 ${index + 1}`}
            onClick={() => {
              const remaining = rows.filter((entry) => entry.id !== row.id)
              onChange(remaining.length ? remaining : [createCopilotHeader()])
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </section>
  )
}
