import { BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname } from 'node:path'
import { COPILOT_CHANNELS } from '@shared/copilot'
import type { SaveCopilotProviderInput } from '@shared/copilot'
import { isObject } from '@shared/configuration'
import { AppError } from './errors'
import { registerBusinessHandler } from './ipc'
import type { CopilotService } from './services/copilot'
import { openToolLocation } from './services/tool-location'

export function registerCopilotIpc(rendererUrl: string, service: CopilotService): () => void {
  registerBusinessHandler(COPILOT_CHANNELS.snapshot, rendererUrl, noArgs, () =>
    service.exclusive(() => service.snapshot())
  )
  registerBusinessHandler(COPILOT_CHANNELS.getProvider, rendererUrl, identifier, async (input) =>
    service.providers.get(input.id)
  )
  registerBusinessHandler(
    COPILOT_CHANNELS.saveProvider,
    rendererUrl,
    (args): SaveCopilotProviderInput => {
      const input = record(args)
      if (!isObject(input.configuration)) throw invalid()
      return {
        ...(input.id === undefined ? {} : { id: id(input.id), revision: revision(input.revision) }),
        configuration: input.configuration as unknown as SaveCopilotProviderInput['configuration']
      }
    },
    (input) => service.exclusive(() => service.providers.save(input))
  )
  registerBusinessHandler(
    COPILOT_CHANNELS.setProviderOrder,
    rendererUrl,
    (args) => ids(record(args).order),
    (order) =>
      service.exclusive(() => {
        service.providers.setOrder(order)
        return service.snapshot()
      })
  )
  registerBusinessHandler(
    COPILOT_CHANNELS.setPath,
    rendererUrl,
    (args) => {
      const input = record(args)
      if (input.directory !== null && typeof input.directory !== 'string') throw invalid()
      return input.directory as string | null
    },
    (directory) => service.exclusive(() => service.setPath(directory))
  )
  registerBusinessHandler(COPILOT_CHANNELS.pickPath, rendererUrl, noArgs, async (_input, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw invalid()
    const result = await dialog.showOpenDialog(window, {
      title: '选择 VS Code 用户或 Profile 配置目录',
      defaultPath: await service.pickerDirectory(),
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  registerBusinessHandler(
    COPILOT_CHANNELS.openLocation,
    rendererUrl,
    (args) => {
      const target = record(args).target
      if (target !== 'directory' && target !== 'config') throw invalid()
      return target
    },
    (target) => {
      const path = service.getPath()
      return openToolLocation({ path, directory: dirname(path), source: 'custom' }, target)
    }
  )
  for (const [channel, operation] of [
    [COPILOT_CHANNELS.apply, service.apply.bind(service)],
    [COPILOT_CHANNELS.disable, service.disable.bind(service)]
  ] as const) {
    registerBusinessHandler(
      channel,
      rendererUrl,
      (args) => {
        const input = record(args)
        return { providerIds: ids(input.providerIds), revision: revision(input.revision) }
      },
      (input) => service.exclusive(() => operation(input))
    )
  }
  registerBusinessHandler(
    COPILOT_CHANNELS.cleanup,
    rendererUrl,
    (args) => revision(record(args).revision),
    (revision) => service.exclusive(() => service.cleanup(revision))
  )
  registerBusinessHandler(COPILOT_CHANNELS.previewCleanup, rendererUrl, noArgs, () =>
    service.exclusive(() => service.previewCleanup())
  )
  for (const [channel, operation] of [
    [
      COPILOT_CHANNELS.deleteProvider,
      (id: string, revision: string) => service.deleteProvider(id, revision)
    ],
    [COPILOT_CHANNELS.restore, (id: string, revision: string) => service.restore(id, revision)]
  ] as const) {
    registerBusinessHandler(
      channel,
      rendererUrl,
      (args) => {
        const input = record(args)
        return { id: id(input.id), revision: revision(input.revision) }
      },
      (input) => service.exclusive(() => operation(input.id, input.revision))
    )
  }
  return () => Object.values(COPILOT_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel))
}

function invalid(): AppError {
  return new AppError('INVALID_INPUT', 'Copilot 请求参数无效，请刷新页面后重试。')
}
function noArgs(args: unknown[]): undefined {
  if (args.length) throw invalid()
  return undefined
}
function record(args: unknown[]): Record<string, unknown> {
  if (args.length !== 1 || !isObject(args[0])) throw invalid()
  return args[0]
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/u.test(value)) throw invalid()
  return value
}
function identifier(args: unknown[]): { id: string } {
  return { id: id(record(args).id) }
}
function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w:.+-]{1,128}$/u.test(value)) throw invalid()
  return value
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw invalid()
  const result = value.map(id)
  if (new Set(result).size !== result.length) throw invalid()
  return result
}
