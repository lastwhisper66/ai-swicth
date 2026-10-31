import { app, BrowserWindow, dialog, Menu, nativeImage, nativeTheme, screen, Tray } from 'electron'
import { join, resolve } from 'path'
import { pathToFileURL } from 'node:url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { APPLICATION_TASK_CHANGED, WINDOW_STATE_CHANGED } from '@shared/ipc'
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
import { ConfigurationArchiveStore } from './services/configuration-archives'
import { runAppMigrations } from './migrations'
import { AppDatabase } from './database'
import { ConfigurationTargets } from './database/configuration-targets'
import { toApiError } from './errors'
import { ApplicationPreferencesStore } from './services/application-preferences'
import { ApplicationManagementService } from './services/application-management'
import { WslRuntime } from './services/wsl-runtime'
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
let database: AppDatabase | null = null
let appSettings: AppSettingsStore | null = null
let applications: ApplicationManagementService | null = null
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
app.on('before-quit', (event) => {
  if (applications?.hasRunningTasks()) {
    event.preventDefault()
    showMainWindow()
    dialog.showErrorBox(
      'AI 应用任务正在运行',
      '请等待安装、更新或卸载任务结束后再退出。可以最小化窗口，任务会继续执行。'
    )
    return
  }
  isQuitting = true
})
app.on('will-quit', () => {
  database?.close()
  database = null
  tray?.destroy()
  tray = null
})

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1600, workArea.width)
  const height = Math.min(1080, workArea.height)
  const window = new BrowserWindow({
    width,
    height,
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    minWidth: Math.min(720, width),
    minHeight: Math.min(560, height),
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
    if (appSettings?.get().closeBehavior === 'tray' && tray && !tray.isDestroyed()) {
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
  let targets: ConfigurationTargets
  try {
    database = new AppDatabase(userDataPath)
    const unremoved = await runAppMigrations(database)
    targets = new ConfigurationTargets(database)
    await targets.recover()
    if (unremoved.length)
      dialog.showErrorBox(
        '旧配置清理未完成',
        '数据已导入数据库，部分旧 JSON 被占用或发生变化，已保留原文件；应用仅使用 ai-switch.db，不会重复导入。请检查旧文件后重启以重试清理。'
      )
    appSettings = new AppSettingsStore(database)
    await appSettings.load()
    const theme = database.getSetting<unknown>('device_settings', 'theme')
    if (theme === 'system' || theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme
  } catch (error) {
    dialog.showErrorBox('无法打开或迁移本地数据', toApiError(error).message)
    app.quit()
    return
  }
  const providerStore = new ProviderStore(database)
  const applicationPreferences = new ApplicationPreferencesStore(database)
  const wslRuntime = new WslRuntime((distribution) =>
    applicationPreferences.getLaunch(distribution)
  )
  const wsl = new WslService(wslRuntime)
  const pathSettings = new PathSettingsStore(database, wsl)
  const commonConfigs = new CommonConfigStore(database)
  const managedStates = new ManagedStateStore(database)
  const installations = new ToolInstallationService(wsl)
  applications = new ApplicationManagementService(
    applicationPreferences,
    pathSettings,
    installations,
    wslRuntime,
    (task) => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed())
        mainWindow.webContents.send(APPLICATION_TASK_CHANGED, task)
    }
  )
  const backupService = new BackupService(database, commonConfigs, managedStates)
  const cloudBackupService = new CloudBackupService(
    providerStore,
    commonConfigs,
    appSettings,
    new ConfigurationArchiveStore(database),
    database
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
    managedStates,
    database,
    targets
  )
  const controller = new AppController(
    providerStore,
    pathSettings,
    backupService,
    switchService,
    toolStatusService,
    appSettings,
    cloudBackupService,
    applications
  )
  const unregisterIpc = registerAppIpc(rendererUrl, controller)
  app.once('will-quit', unregisterIpc)

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
