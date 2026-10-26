import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
import { Spinner } from '@renderer/components/ui/spinner'

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string
  loading?: boolean
}

export function PasswordInput({
  label,
  loading = false,
  disabled,
  ...props
}: PasswordInputProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)

  return (
    <InputGroup>
      <InputGroupInput
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled || loading}
        aria-busy={loading}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled || loading}
          aria-label={loading ? `正在读取${label}` : `${visible ? '隐藏' : '显示'}${label}`}
          aria-pressed={visible}
          aria-busy={loading}
          aria-controls={props.id}
        >
          {loading ? (
            <Spinner aria-hidden="true" />
          ) : visible ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
