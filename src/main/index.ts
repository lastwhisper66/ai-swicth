import { app, BrowserWindow, dialog, Menu, nativeImage, Tray } from 'electron'
import { join, resolve } from 'path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { WINDOW_STATE_CHANGED } from '@shared/ipc'
import { registerAppIpc } from './ipc'
import { ClaudeCodeAdapter } from './adapters/claude-code'
import { CodexAdapter } from './adapters/codex'
import { WslService } from './services/wsl'
import { ProviderStore } from './providers/store'
import { AppController } from './services/app-controller'
import { BackupService } from './services/backup'
import { CommonConfigStore } from './services/common-config'
import { PathSettingsStore } from './services/path-settings'
import { SwitchService } from './services/switch'
import { ToolStatusService } from './services/tool-status'
import { AppSettingsStore } from './services/app-settings'
import { CloudBackupService } from './services/cloud-backup'
import { ToolInstallationService } from './services/tool-installation'
import { ManagedStateStore } from './services/managed-state'
import { toApiError } from './errors'
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
const appSettings = new AppSettingsStore(join(app.getPath('userData'), 'preferences.v1.json'))
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let isInitialized = false

if (!hasSingleInstanceLock) {
  app.quit()
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (isInitialized && !isQuitting) createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

app.on('second-instance', showMainWindow)
app.on('before-quit', () => {
  isQuitting = true
})
app.on('will-quit', () => {
  tray?.destroy()
  tray = null
})

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'AI Switch',
    frame: false,
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

  mainWindow = window
  window.on('ready-to-show', () => {
    window.show()
  })

  const notifyWindowState = (): void => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(WINDOW_STATE_CHANGED, { isMaximized: window.isMaximized() })
    }
  }
  window.on('maximize', notifyWindowState)
  window.on('unmaximize', notifyWindowState)

  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    if (appSettings.get().closeBehavior === 'tray' && tray && !tray.isDestroyed()) {
      window.hide()
    } else {
      app.quit()
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  void window.loadURL(rendererUrl)
}

function createTray(): void {
  try {
    const trayIcon =
      process.platform === 'win32'
        ? windowsIcon
        : nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
    tray = new Tray(trayIcon)
    tray.setToolTip('AI Switch · 点击打开窗口')
    tray.setContextMenu(
      Menu.buildFromTemplate([{ label: '退出应用程序', click: () => app.quit() }])
    )
    tray.on('click', showMainWindow)
    tray.on('double-click', showMainWindow)
  } catch {
    tray?.destroy()
    tray = null
    dialog.showErrorBox('系统托盘不可用', '无法创建系统托盘图标，本次关闭窗口将直接退出应用程序。')
  }
}

app.whenReady().then(async () => {
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
  try {
    await appSettings.load()
  } catch (error) {
    dialog.showErrorBox('无法读取应用设置', toApiError(error).message)
  }
  const providerStore = new ProviderStore(join(userDataPath, 'providers.v1.json'))
  const wsl = new WslService()
  const pathSettings = new PathSettingsStore(join(userDataPath, 'settings.v1.json'), wsl)
  const commonConfigs = new CommonConfigStore(userDataPath)
  const managedStates = new ManagedStateStore(userDataPath)
  const installations = new ToolInstallationService(wsl)
  const backupService = new BackupService(
    join(userDataPath, 'backups'),
    commonConfigs,
    managedStates
  )
  const cloudBackupService = new CloudBackupService(
    providerStore,
    commonConfigs,
    appSettings,
    managedStates
  )
  const adapters = {
    'claude-code': new ClaudeCodeAdapter(),
    codex: new CodexAdapter(),
    'claude-code-wsl': new ClaudeCodeAdapter('claude-code-wsl'),
    'codex-wsl': new CodexAdapter('codex-wsl')
  }
  const toolStatusService = new ToolStatusService(
    providerStore,
    pathSettings,
    adapters,
    installations,
    managedStates
  )
  const switchService = new SwitchService(
    providerStore,
    pathSettings,
    backupService,
    adapters,
    commonConfigs,
    managedStates
  )
  const controller = new AppController(
    providerStore,
    pathSettings,
    backupService,
    switchService,
    toolStatusService,
    appSettings,
    cloudBackupService
  )
  const unregisterIpc = registerAppIpc(rendererUrl, controller)
  app.once('before-quit', unregisterIpc)

  createTray()
  isInitialized = true
  if (!mainWindow) createWindow()

  app.on('activate', showMainWindow)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
