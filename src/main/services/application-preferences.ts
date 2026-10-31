import {
  TOOL_IDS,
  WSL_SHELLS,
  type ApplicationPreferences,
  type ToolId,
  type WslLaunchSettings
} from '@shared/ipc'
import type { AppDatabase } from '../database'
import { hasControlCharacters } from '@shared/configuration'
import { APPLICATION_IDS, type ApplicationId } from '@shared/applications'
import { AppError } from '../errors'

export const DEFAULT_WSL_LAUNCH: WslLaunchSettings = { shell: 'auto' }

export class ApplicationPreferencesStore {
  constructor(private readonly database: AppDatabase) {}

  get(): ApplicationPreferences {
    const saved = this.database.getSetting<unknown>('device_settings', 'applications')
    const result: ApplicationPreferences = {
      visible: Object.fromEntries(TOOL_IDS.map((id) => [id, true])) as Record<ToolId, boolean>,
      wsl: {},
      order: [...APPLICATION_IDS]
    }
    if (saved === null) return result
    if (!isRecord(saved) || !isRecord(saved.visible) || !isRecord(saved.wsl)) throw corrupt()
    if (saved.order !== undefined) {
      if (
        !Array.isArray(saved.order) ||
        saved.order.some((id) => typeof id !== 'string') ||
        new Set(saved.order).size !== saved.order.length
      )
        throw corrupt()
      const known = saved.order.filter((id): id is ApplicationId =>
        APPLICATION_IDS.includes(id as ApplicationId)
      )
      result.order = [...known, ...APPLICATION_IDS.filter((id) => !known.includes(id))]
    }
    for (const id of TOOL_IDS) {
      if (saved.visible[id] === undefined) continue
      if (typeof saved.visible[id] !== 'boolean') throw corrupt()
      result.visible[id] = saved.visible[id]
    }
    for (const [distribution, value] of Object.entries(saved.wsl)) {
      if (
        !distribution ||
        /[\\/]/u.test(distribution) ||
        hasControlCharacters(distribution) ||
        !isRecord(value)
      )
        throw corrupt()
      // Ignore the removed flag field in settings saved by earlier versions.
      if (!WSL_SHELLS.includes(value.shell as WslLaunchSettings['shell'])) throw corrupt()
      Object.defineProperty(result.wsl, distribution, {
        value: { shell: value.shell },
        enumerable: true,
        writable: true
      })
    }
    return result
  }

  getLaunch(distribution: string): WslLaunchSettings {
    const settings = this.get()
    return Object.hasOwn(settings.wsl, distribution)
      ? settings.wsl[distribution]
      : { ...DEFAULT_WSL_LAUNCH }
  }

  setVisible(toolId: ToolId, visible: boolean): ApplicationPreferences {
    const next = this.get()
    next.visible[toolId] = visible
    this.database.setSetting('device_settings', 'applications', next)
    return next
  }

  setOrder(order: ApplicationId[]): ApplicationPreferences {
    const next = this.get()
    next.order = [...order]
    this.database.setSetting('device_settings', 'applications', next)
    return next
  }

  setLaunch(distribution: string, launch: WslLaunchSettings): void {
    const next = this.get()
    Object.defineProperty(next.wsl, distribution, {
      value: { ...launch },
      enumerable: true,
      writable: true
    })
    this.database.setSetting('device_settings', 'applications', next)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function corrupt(): AppError {
  return new AppError('STORAGE_CORRUPTED', 'AI 应用设置损坏，请从本机备份恢复应用数据库。')
}
