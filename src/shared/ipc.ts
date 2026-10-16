export const IPC_CHANNELS = {
  getAppInfo: 'app:get-info'
} as const

export interface AppInfo {
  name: string
  version: string
}

export interface DesktopApi {
  getAppInfo: () => Promise<AppInfo>
}
