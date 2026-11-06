import { contextBridge, ipcRenderer } from 'electron'
import { COPILOT_CHANNELS } from '@shared/copilot'
import {
  APPLICATION_TASK_CHANGED,
  APPLICATION_DETECTED,
  IPC_CHANNELS,
  WINDOW_STATE_CHANGED,
  type ApplicationTask,
  type ApplicationDetectionResult,
  type DesktopApi,
  type WindowState
} from '@shared/ipc'

const api: DesktopApi = {
  copilot: {
    snapshot: () => ipcRenderer.invoke(COPILOT_CHANNELS.snapshot),
    getProvider: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.getProvider, input),
    saveProvider: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.saveProvider, input),
    deleteProvider: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.deleteProvider, input),
    setProviderOrder: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.setProviderOrder, input),
    setPath: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.setPath, input),
    pickPath: () => ipcRenderer.invoke(COPILOT_CHANNELS.pickPath),
    openLocation: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.openLocation, input),
    apply: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.apply, input),
    cleanup: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.cleanup, input),
    previewCleanup: () => ipcRenderer.invoke(COPILOT_CHANNELS.previewCleanup),
    disable: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.disable, input),
    restore: (input) => ipcRenderer.invoke(COPILOT_CHANNELS.restore, input)
  },
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  getToolStatus: (input) => ipcRenderer.invoke(IPC_CHANNELS.getToolStatus, input),
  getApplications: (input) => ipcRenderer.invoke(IPC_CHANNELS.getApplications, input),
  onApplicationDetected: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ApplicationDetectionResult): void =>
      listener(result)
    ipcRenderer.on(APPLICATION_DETECTED, handler)
    return () => ipcRenderer.removeListener(APPLICATION_DETECTED, handler)
  },
  getApplicationTasks: () => ipcRenderer.invoke(IPC_CHANNELS.getApplicationTasks),
  setApplicationVisibility: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.setApplicationVisibility, input),
  setApplicationOrder: (input) => ipcRenderer.invoke(IPC_CHANNELS.setApplicationOrder, input),
  setSidebarCollapsed: (input) => ipcRenderer.invoke(IPC_CHANNELS.setSidebarCollapsed, input),
  setWslLaunchSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.setWslLaunchSettings, input),
  startApplicationTask: (input) => ipcRenderer.invoke(IPC_CHANNELS.startApplicationTask, input),
  onApplicationTaskChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, task: ApplicationTask): void =>
      listener(task)
    ipcRenderer.on(APPLICATION_TASK_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(APPLICATION_TASK_CHANGED, handler)
    }
  },
  window: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowState),
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState): void =>
        listener(state)
      ipcRenderer.on(WINDOW_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(WINDOW_STATE_CHANGED, handler)
    }
  },
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  setAppSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.setAppSettings, input),
  setCloudBackupSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.setCloudBackupSettings, input),
  setCloudBackupPassword: (input) => ipcRenderer.invoke(IPC_CHANNELS.setCloudBackupPassword, input),
  getCloudBackupSecret: () => ipcRenderer.invoke(IPC_CHANNELS.getCloudBackupSecret),
  testCloudBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.testCloudBackup, input),
  uploadCloudBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.uploadCloudBackup, input),
  restoreCloudBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.restoreCloudBackup, input),
  listCloudBackups: () => ipcRenderer.invoke(IPC_CHANNELS.listCloudBackups),
  restoreConfigurationBackup: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreConfigurationBackup, input),
  setNativeTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.setNativeTheme, input),
  initializeTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.initializeTheme, input),
  saveTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveTheme, input),
  createProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.createProvider, input),
  updateProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateProvider, input),
  getProviderSecrets: (input) => ipcRenderer.invoke(IPC_CHANNELS.getProviderSecrets, input),
  deleteProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteProvider, input),
  setProviderOrder: (input) => ipcRenderer.invoke(IPC_CHANNELS.setProviderOrder, input),
  pickToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.pickToolPath, input),
  setToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.setToolPath, input),
  resetToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.resetToolPath, input),
  openToolLocation: (input) => ipcRenderer.invoke(IPC_CHANNELS.openToolLocation, input),
  getCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.getCommonConfig, input),
  saveCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveCommonConfig, input),
  migrateCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.migrateCommonConfig, input),
  previewConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewConfig, input),
  applyProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.applyProvider, input),
  cleanupCodexProviders: (input) => ipcRenderer.invoke(IPC_CHANNELS.cleanupCodexProviders, input),
  previewCodexCleanup: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewCodexCleanup, input),
  restoreBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.restoreBackup, input)
}

contextBridge.exposeInMainWorld('api', api)
