import { app, BrowserWindow } from 'electron'
import { join, resolve } from 'path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAppIpc } from './ipc'
import { ClaudeCodeAdapter } from './adapters/claude-code'
import { CodexAdapter } from './adapters/codex'
import { ProviderStore } from './providers/store'
import { AppController } from './services/app-controller'
import { BackupService } from './services/backup'
import { CommonConfigStore } from './services/common-config'
import { PathSettingsStore } from './services/path-settings'
import { SwitchService } from './services/switch'
import { ToolStatusService } from './services/tool-status'
import icon from '../../resources/icon.png?asset'
import windowsIcon from '../../resources/icon.ico?asset'

if (is.dev && process.env.AI_SWITCH_USER_DATA_DIR) {
  app.setPath('userData', resolve(process.env.AI_SWITCH_USER_DATA_DIR))
}

const rendererUrl =
  is.dev && process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL']).href
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'AI Switch',
    show: false,
    autoHideMenuBar: true,
    icon: process.platform === 'win32' ? windowsIcon : icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  void mainWindow.loadURL(rendererUrl)
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  electronApp.setAppUserModelId('com.lastwhisper.ai-switch')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const userDataPath = app.getPath('userData')
  const providerStore = new ProviderStore(join(userDataPath, 'providers.v1.json'))
  const pathSettings = new PathSettingsStore(join(userDataPath, 'settings.v1.json'))
  const commonConfigs = new CommonConfigStore(userDataPath)
  const backupService = new BackupService(join(userDataPath, 'backups'), commonConfigs)
  const adapters = {
    'claude-code': new ClaudeCodeAdapter(),
    codex: new CodexAdapter()
  }
  const toolStatusService = new ToolStatusService(providerStore, pathSettings, adapters)
  const switchService = new SwitchService(
    providerStore,
    pathSettings,
    backupService,
    adapters,
    commonConfigs
  )
  const controller = new AppController(
    providerStore,
    pathSettings,
    backupService,
    switchService,
    toolStatusService
  )
  const unregisterIpc = registerAppIpc(rendererUrl, controller)
  app.once('before-quit', unregisterIpc)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
