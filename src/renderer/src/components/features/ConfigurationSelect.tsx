import { useId } from 'react'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

export function ConfigurationSelect({
  label,
  value,
  choices,
  onChange,
  disabled,
  hint,
  hideLabel = false,
  indicator,
  placeholder
}: {
  label: string
  value: string
  choices: readonly (readonly [string, string])[]
  onChange: (value: string) => void
  disabled?: boolean
  hint?: string
  hideLabel?: boolean
  indicator?: React.ReactNode
  placeholder?: string
}): React.JSX.Element {
  const id = useId()
  const known = choices.some(([key]) => key === value)
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          <SelectValue placeholder={placeholder} />
          {indicator && <span className="ml-auto flex shrink-0 items-center">{indicator}</span>}
        </SelectTrigger>
        <SelectContent>
          {!known && value && <SelectItem value={value}>原有自定义值（保留）</SelectItem>}
          {choices.map(([key, name]) => (
            <SelectItem key={key} value={key}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <FieldDescription id={`${id}-hint`} className="text-xs leading-5">
          {hint}
        </FieldDescription>
      )}
    </Field>
  )
}
