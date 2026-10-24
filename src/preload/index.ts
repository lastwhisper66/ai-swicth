import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DesktopApi } from '@shared/ipc'

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  createProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.createProvider, input),
  updateProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateProvider, input),
  deleteProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.deleteProvider, input),
  pickToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.pickToolPath, input),
  setToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.setToolPath, input),
  resetToolPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.resetToolPath, input),
  getCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.getCommonConfig, input),
  saveCommonConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveCommonConfig, input),
  previewConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewConfig, input),
  applyProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.applyProvider, input),
  restoreBackup: (input) => ipcRenderer.invoke(IPC_CHANNELS.restoreBackup, input)
}

contextBridge.exposeInMainWorld('api', api)
