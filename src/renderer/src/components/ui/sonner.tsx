import { useEffect, useRef } from 'react'
import { toast, Toaster as Sonner, useSonner, type ToasterProps } from 'sonner'
import { useTheme } from '@renderer/components/ThemeProvider'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon
} from 'lucide-react'

const Toaster = ({ visibleToasts = 3, ...props }: ToasterProps): React.JSX.Element => {
  const { theme } = useTheme()
  const { toasts } = useSonner()
  const toasterRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // Sonner only hides overflow; dismiss it so older notifications cannot reappear.
    toasts
      .filter((notification) => notification.toasterId === props.id)
      .slice(visibleToasts)
      .forEach((notification) => toast.dismiss(notification.id))
  }, [toasts, visibleToasts, props.id])

  useEffect(() => {
    const toaster = toasterRef.current
    if (!toaster) return

    function dismissNotification(event: MouseEvent | KeyboardEvent): void {
      if (!(event.target instanceof Element)) return
      if (
        event.target.closest(
          'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
        )
      )
        return
      const notification = event.target.closest<HTMLElement>('[data-sonner-toast]')
      if (!notification || notification.dataset.dismissible === 'false') return
      if (event instanceof KeyboardEvent) {
        if (event.target !== notification || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
      }
      // Use Sonner's own dismissal to preserve callbacks and the exit animation.
      notification.querySelector<HTMLButtonElement>('[data-close-button]')?.click()
    }

    toaster.addEventListener('click', dismissNotification)
    toaster.addEventListener('keydown', dismissNotification)
    return () => {
      toaster.removeEventListener('click', dismissNotification)
      toaster.removeEventListener('keydown', dismissNotification)
    }
  }, [])

  return (
    <Sonner
      ref={toasterRef}
      theme={theme}
      className="toaster group"
      position="bottom-center"
      expand
      visibleToasts={visibleToasts}
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
          toast: 'cn-toast cursor-pointer',
          content: 'min-w-0',
          title: 'leading-5 break-words [overflow-wrap:anywhere]'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
