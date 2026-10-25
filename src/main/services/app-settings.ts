import type { AppSettings } from '@shared/ipc'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

export class AppSettingsStore {
  private settings: AppSettings = { closeBehavior: 'quit' }

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const content = await readOptionalText(this.filePath)
    if (content === null) return

    try {
      const value: unknown = JSON.parse(content)
      if (
        typeof value !== 'object' ||
        value === null ||
        !('version' in value) ||
        value.version !== 1 ||
        !('closeBehavior' in value) ||
        (value.closeBehavior !== 'tray' && value.closeBehavior !== 'quit')
      ) {
        throw new Error('Invalid app settings')
      }
      this.settings = { closeBehavior: value.closeBehavior }
    } catch {
      throw new AppError(
        'STORAGE_CORRUPTED',
        '应用设置无法读取，本次关闭窗口将直接退出。请在设置中重新选择关闭行为。'
      )
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  async set(settings: AppSettings): Promise<void> {
    await writeTextAtomic(
      this.filePath,
      `${JSON.stringify({ version: 1, closeBehavior: settings.closeBehavior }, null, 2)}\n`,
      true
    )
    this.settings = { closeBehavior: settings.closeBehavior }
  }
}
