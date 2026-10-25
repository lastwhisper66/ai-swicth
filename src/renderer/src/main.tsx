import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@renderer/components/ThemeProvider'
import { Toaster } from '@renderer/components/ui/sonner'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="ai-switch-theme">
      <App />
      <Toaster />
    </ThemeProvider>
  </StrictMode>
)
