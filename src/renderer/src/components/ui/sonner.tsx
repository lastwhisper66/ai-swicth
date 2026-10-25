import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@renderer/components/ThemeProvider'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon
} from 'lucide-react'

const Toaster = ({ ...props }: ToasterProps): React.JSX.Element => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={24}
      mobileOffset={16}
      closeButton
      richColors
      duration={4000}
      containerAriaLabel="操作通知"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--toast-close-button-start': 'unset',
          '--toast-close-button-end': '0',
          '--toast-close-button-transform': 'translate(35%, -35%)'
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: '关闭提示',
        classNames: {
          toast: 'cn-toast',
          content: 'min-w-0',
          title: 'leading-5 break-words [overflow-wrap:anywhere]'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
