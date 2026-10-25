import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DesktopApi } from '@shared/ipc'

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  setAppSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.setAppSettings, input),
  setCloudBackupSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.setCloudBackupSettings, input),
  setCloudBackupPassword: (input) => ipcRenderer.invoke(IPC_CHANNELS.setCloudBackupPassword, input),
  testCloudBackup: () => ipcRenderer.invoke(IPC_CHANNELS.testCloudBackup),
  uploadCloudBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.uploadCloudBackup, input),
  restoreCloudBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.restoreCloudBackup, input),
  setNativeTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.setNativeTheme, input),
  createProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.createProvider, input),
  updateProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateProvider, input),
  revealProviderApiKey: (input) => ipcRenderer.invoke(IPC_CHANNELS.revealProviderApiKey, input),
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
