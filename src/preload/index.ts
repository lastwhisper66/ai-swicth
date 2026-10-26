import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, WINDOW_STATE_CHANGED, type DesktopApi, type WindowState } from '@shared/ipc'

const api: DesktopApi = {
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
  setNativeTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.setNativeTheme, input),
  createProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.createProvider, input),
  updateProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateProvider, input),
  getProviderSecrets: (input) => ipcRenderer.invoke(IPC_CHANNELS.getProviderSecrets, input),
  deleteProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteProvider, input),
  pickToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.pickToolPath, input),
  setToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.setToolPath, input),
  resetToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.resetToolPath, input),
  openToolLocation: (input) => ipcRenderer.invoke(IPC_CHANNELS.openToolLocation, input),
  getCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.getCommonConfig, input),
  saveCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveCommonConfig, input),
  migrateCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.migrateCommonConfig, input),
  previewConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewConfig, input),
  applyProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.applyProvider, input),
  restoreBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.restoreBackup, input)
}

contextBridge.exposeInMainWorld('api', api)
