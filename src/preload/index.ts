import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DesktopApi } from '@shared/ipc'

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo)
}

contextBridge.exposeInMainWorld('api', api)
