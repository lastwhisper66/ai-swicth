import { useId } from 'react'
import { Switch } from '@renderer/components/ui/switch'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@renderer/components/ui/field'

export function ConfigurationSwitch({
  id,
  label,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Switch> & {
  label: string
  hint?: React.ReactNode
}): React.JSX.Element {
  const generatedId = useId()
  const switchId = id ?? generatedId

  return (
    <Field className={className}>
      <div className="flex items-center gap-3">
        <Switch id={switchId} aria-describedby={hint ? `${switchId}-hint` : undefined} {...props} />
        <FieldContent className="min-w-0">
          <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
          {hint && (
            <FieldDescription id={`${switchId}-hint`} className="text-xs leading-5">
              {hint}
            </FieldDescription>
          )}
        </FieldContent>
      </div>
    </Field>
  )
}
