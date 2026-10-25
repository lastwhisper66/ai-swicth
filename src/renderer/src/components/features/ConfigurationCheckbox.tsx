import { useId } from 'react'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@renderer/components/ui/field'

export function ConfigurationCheckbox({
  id,
  label,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Checkbox> & {
  label: string
  hint?: React.ReactNode
}): React.JSX.Element {
  const generatedId = useId()
  const checkboxId = id ?? generatedId

  return (
    <Field className={className}>
      <div className="flex items-center justify-between gap-4">
        <FieldContent className="min-w-0">
          <FieldLabel htmlFor={checkboxId}>{label}</FieldLabel>
          {hint && (
            <FieldDescription id={`${checkboxId}-hint`} className="text-xs leading-5">
              {hint}
            </FieldDescription>
          )}
        </FieldContent>
        <Checkbox
          id={checkboxId}
          aria-describedby={hint ? `${checkboxId}-hint` : undefined}
          {...props}
        />
      </div>
    </Field>
  )
}
