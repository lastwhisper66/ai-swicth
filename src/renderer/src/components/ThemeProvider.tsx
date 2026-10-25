import { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AppTheme } from '@shared/ipc'

// https://ui.shadcn.com/docs/dark-mode/vite

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: AppTheme
  storageKey?: string
}

type ThemeProviderState = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps): React.JSX.Element {
  const [theme, setTheme] = useState<AppTheme>(
    () => (localStorage.getItem(storageKey) as AppTheme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const api = window.api
    let active = true

    function updateTheme(): void {
      if (!active) return
      const resolvedTheme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
    }

    if (theme === 'system') {
      systemTheme.addEventListener('change', updateTheme)
    }

    // Electron's theme override also affects matchMedia. Resolve system mode after
    // the main process has removed the previous override.
    if (theme !== 'system' || !api) updateTheme()

    if (api) {
      void api
        .setNativeTheme({ theme })
        .then((result) => {
          if (!active) return
          updateTheme()
          if (!result.ok) {
            toast.error(`无法同步标题栏主题：${result.error.message}`, { id: 'native-theme-sync' })
          }
        })
        .catch(() => {
          if (!active) return
          updateTheme()
          toast.error('无法同步标题栏主题，请再次切换或重新打开应用。', { id: 'native-theme-sync' })
        })
    }

    return () => {
      active = false
      systemTheme.removeEventListener('change', updateTheme)
    }
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: AppTheme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    }
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// Keep the provider and hook together, as in the shadcn/ui Vite example.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
