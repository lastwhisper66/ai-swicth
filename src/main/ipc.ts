import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  TOOL_IDS,
  type ApiResult,
  type AppInfo,
  type ApplyProviderInput,
  type CreateProviderInput,
  type DeleteProviderInput,
  type PickToolPathInput,
  type ResetToolPathInput,
  type RestoreBackupInput,
  type SetToolPathInput,
  type ToolId,
  type ToolModels,
  type UpdateProviderInput
} from '@shared/ipc'
import { AppError, toApiError } from './errors'
import type { AppController } from './services/app-controller'

type BusinessChannel = Exclude<(typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS], 'app:get-info'>

export function registerAppIpc(rendererUrl: string, controller: AppController): () => void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event, ...args: unknown[]): AppInfo => {
    assertTrustedEvent(event, rendererUrl)
    if (args.length !== 0) {
      throw new Error('应用信息请求不接受参数。')
    }
    return { name: app.getName(), version: app.getVersion() }
  })

  registerBusinessHandler(IPC_CHANNELS.getSnapshot, rendererUrl, expectNoArguments, () =>
    controller.getSnapshot()
  )
  registerBusinessHandler(IPC_CHANNELS.createProvider, rendererUrl, parseCreateProvider, (input) =>
    controller.createProvider(input)
  )
  registerBusinessHandler(IPC_CHANNELS.updateProvider, rendererUrl, parseUpdateProvider, (input) =>
    controller.updateProvider(input)
  )
  registerBusinessHandler(IPC_CHANNELS.deleteProvider, rendererUrl, parseDeleteProvider, (input) =>
    controller.deleteProvider(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.pickToolPath,
    rendererUrl,
    parsePickToolPath,
    async (input, event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) throw new AppError('INVALID_INPUT', '无法识别应用窗口。')
      const extension = input.toolId === 'claude-code' ? 'json' : 'toml'
      const result = await dialog.showOpenDialog(window, {
        title: `选择 ${input.toolId === 'claude-code' ? 'Claude Code' : 'Codex'} 配置文件`,
        properties: ['openFile'],
        filters: [{ name: '配置文件', extensions: [extension] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    }
  )
  registerBusinessHandler(IPC_CHANNELS.setToolPath, rendererUrl, parseSetToolPath, (input) =>
    controller.setToolPath(input)
  )
  registerBusinessHandler(IPC_CHANNELS.resetToolPath, rendererUrl, parseResetToolPath, (input) =>
    controller.resetToolPath(input)
  )
  registerBusinessHandler(IPC_CHANNELS.applyProvider, rendererUrl, parseApplyProvider, (input) =>
    controller.applyProvider(input)
  )
  registerBusinessHandler(IPC_CHANNELS.restoreBackup, rendererUrl, parseRestoreBackup, (input) =>
    controller.restoreBackup(input)
  )

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }
  }
}

function registerBusinessHandler<TInput, TResult>(
  channel: BusinessChannel,
  rendererUrl: string,
  parseInput: (args: unknown[]) => TInput,
  operation: (input: TInput, event: IpcMainInvokeEvent) => Promise<TResult>
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<TResult>> => {
    assertTrustedEvent(event, rendererUrl)
    try {
      const input = parseInput(args)
      return { ok: true, value: await operation(input, event) }
    } catch (error) {
      return { ok: false, error: toApiError(error) }
    }
  })
}

function assertTrustedEvent(event: IpcMainInvokeEvent, rendererUrl: string): void {
  const frame = event.senderFrame
  if (
    !BrowserWindow.fromWebContents(event.sender) ||
    !frame ||
    frame !== event.sender.mainFrame ||
    frame.url !== rendererUrl
  ) {
    throw new Error('无法识别请求来源，请重新打开应用。')
  }
}

function expectNoArguments(args: unknown[]): undefined {
  if (args.length !== 0) throw invalidRequest()
  return undefined
}

function parseCreateProvider(args: unknown[]): CreateProviderInput {
  const input = expectRecordArgument(args)
  return {
    name: expectString(input.name),
    baseUrl: expectString(input.baseUrl),
    apiKey: expectString(input.apiKey),
    tools: expectTools(input.tools),
    models: expectModels(input.models)
  }
}

function parseUpdateProvider(args: unknown[]): UpdateProviderInput {
  const input = expectRecordArgument(args)
  const apiKey = expectRecord(input.apiKey)
  const mode = apiKey.mode
  if (mode !== 'keep' && mode !== 'replace') throw invalidRequest()
  return {
    id: expectIdentifier(input.id),
    name: expectString(input.name),
    baseUrl: expectString(input.baseUrl),
    apiKey:
      mode === 'keep' ? { mode: 'keep' } : { mode: 'replace', value: expectString(apiKey.value) },
    tools: expectTools(input.tools),
    models: expectModels(input.models)
  }
}

function parseDeleteProvider(args: unknown[]): DeleteProviderInput {
  const input = expectRecordArgument(args)
  return { id: expectIdentifier(input.id) }
}

function parsePickToolPath(args: unknown[]): PickToolPathInput {
  const input = expectRecordArgument(args)
  return { toolId: expectToolId(input.toolId) }
}

function parseSetToolPath(args: unknown[]): SetToolPathInput {
  const input = expectRecordArgument(args)
  return { toolId: expectToolId(input.toolId), path: expectString(input.path, 32767) }
}

function parseResetToolPath(args: unknown[]): ResetToolPathInput {
  const input = expectRecordArgument(args)
  return { toolId: expectToolId(input.toolId) }
}

function parseApplyProvider(args: unknown[]): ApplyProviderInput {
  const input = expectRecordArgument(args)
  return {
    toolId: expectToolId(input.toolId),
    providerId: expectIdentifier(input.providerId)
  }
}

function parseRestoreBackup(args: unknown[]): RestoreBackupInput {
  const input = expectRecordArgument(args)
  return { backupId: expectIdentifier(input.backupId) }
}

function expectRecordArgument(args: unknown[]): Record<string, unknown> {
  if (args.length !== 1) throw invalidRequest()
  return expectRecord(args[0])
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRequest()
  }
  return value as Record<string, unknown>
}

function expectString(value: unknown, maxLength = 4096): string {
  if (typeof value !== 'string' || value.length > maxLength) throw invalidRequest()
  return value
}

function expectIdentifier(value: unknown): string {
  const identifier = expectString(value, 100)
  if (!/^[A-Za-z0-9-]+$/u.test(identifier)) throw invalidRequest()
  return identifier
}

function expectToolId(value: unknown): ToolId {
  if (typeof value !== 'string' || !TOOL_IDS.includes(value as ToolId)) throw invalidRequest()
  return value as ToolId
}

function expectTools(value: unknown): ToolId[] {
  if (!Array.isArray(value) || value.length > TOOL_IDS.length) throw invalidRequest()
  return value.map(expectToolId)
}

function expectModels(value: unknown): ToolModels {
  const input = expectRecord(value)
  const models: ToolModels = {}
  for (const [toolId, model] of Object.entries(input)) {
    const parsedToolId = expectToolId(toolId)
    models[parsedToolId] = expectString(model, 200)
  }
  return models
}

function invalidRequest(): AppError {
  return new AppError('INVALID_INPUT', '请求参数无效，请刷新页面后重试。')
}
