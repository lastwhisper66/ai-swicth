import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS, type AppInfo } from '@shared/ipc'

export function registerAppIpc(rendererUrl: string): void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event, ...args: unknown[]): AppInfo => {
    const frame = event.senderFrame

    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      !frame ||
      frame !== event.sender.mainFrame ||
      frame.url !== rendererUrl
    ) {
      throw new Error('无法识别请求来源，请重新打开应用。')
    }

    if (args.length !== 0) {
      throw new Error('应用信息请求不接受参数。')
    }

    return { name: app.getName(), version: app.getVersion() }
  })
}
