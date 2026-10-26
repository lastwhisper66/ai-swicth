import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@renderer/components/ThemeProvider'
import { Button } from '@renderer/components/ui/button'

const themeModes = {
  system: { label: '跟随系统', Icon: Monitor, next: 'light' },
  light: { label: '明亮', Icon: Sun, next: 'dark' },
  dark: { label: '黑暗', Icon: Moon, next: 'system' }
} as const

export function ModeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const { label, Icon, next } = themeModes[theme]
  const description = `当前主题：${label}；点击切换为${themeModes[next].label}`

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-10 w-full justify-start gap-3 px-3"
      onClick={() => setTheme(next)}
      aria-label={description}
      title={description}
    >
      <Icon aria-hidden="true" />
      <span>主题</span>
      <span className="ml-auto text-xs font-normal text-muted-foreground">{label}</span>
    </Button>
  )
}
