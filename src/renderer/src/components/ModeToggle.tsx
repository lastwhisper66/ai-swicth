import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@renderer/components/ThemeProvider'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

const themeModes = {
  system: { Icon: Monitor, next: 'light' },
  light: { Icon: Sun, next: 'dark' },
  dark: { Icon: Moon, next: 'system' }
} as const

export function ModeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const { Icon, next } = themeModes[theme]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground active:translate-y-0"
          onClick={() => setTheme(next)}
          aria-label="切换主题"
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        切换主题
      </TooltipContent>
    </Tooltip>
  )
}
