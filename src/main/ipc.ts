import { app, BrowserWindow, dialog, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  CLOUD_BACKUP_RETENTION,
  TOOL_IDS,
  type ApiResult,
  type AppInfo,
  type AppSettingsInput,
  type CloudBackupOperationInput,
  type CloudBackupSettingsInput,
  type ApplyProviderInput,
  type CreateProviderInput,
  type CommonConfigInput,
  type MigrateCommonConfigInput,
  type SaveCommonConfigInput,
  type PreviewConfigInput,
  type DeleteProviderInput,
  type PickToolPathInput,
  type OpenToolLocationInput,
  type ResetToolPathInput,
  type RevealProviderApiKeyInput,
  type RestoreBackupInput,
  type SetNativeThemeInput,
  type SetToolPathInput,
  type ToolId,
  type UpdateProviderInput
} from '@shared/ipc'
import type { HeaderInput, ProviderConfigurations } from '@shared/configuration'
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
    controller.getSnapshot(true)
  )
  registerBusinessHandler(IPC_CHANNELS.setAppSettings, rendererUrl, parseAppSettings, (input) =>
    controller.setAppSettings(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.setCloudBackupSettings,
    rendererUrl,
    parseCloudBackupSettings,
    (input) => controller.setCloudBackupSettings(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.testCloudBackup,
    rendererUrl,
    parseCloudBackupSettings,
    (input) => controller.testCloudBackup(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.setCloudBackupPassword,
    rendererUrl,
    parseCloudBackupOperation,
    (input) => controller.setCloudBackupPassword(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.uploadCloudBackup,
    rendererUrl,
    parseCloudBackupOperation,
    (input) => controller.uploadCloudBackup(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.restoreCloudBackup,
    rendererUrl,
    parseCloudBackupOperation,
    (input) => controller.restoreCloudBackup(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.setNativeTheme,
    rendererUrl,
    parseNativeTheme,
    async (input) => {
      nativeTheme.themeSource = input.theme
    }
  )
  registerBusinessHandler(IPC_CHANNELS.createProvider, rendererUrl, parseCreateProvider, (input) =>
    controller.createProvider(input)
  )
  registerBusinessHandler(IPC_CHANNELS.updateProvider, rendererUrl, parseUpdateProvider, (input) =>
    controller.updateProvider(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.revealProviderApiKey,
    rendererUrl,
    parseRevealProviderApiKey,
    (input) => controller.revealProviderApiKey(input)
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
      const defaultPath = await controller.getToolPickerDirectory(input)
      const result = await dialog.showOpenDialog(window, {
        title: `选择 ${input.toolId === 'claude-code' ? 'Claude Code' : 'Codex'} 配置目录`,
        defaultPath,
        properties: ['openDirectory']
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
  registerBusinessHandler(
    IPC_CHANNELS.openToolLocation,
    rendererUrl,
    parseOpenToolLocation,
    (input) => controller.openToolLocation(input)
  )
  registerBusinessHandler(IPC_CHANNELS.applyProvider, rendererUrl, parseApplyProvider, (input) =>
    controller.applyProvider(input)
  )
  registerBusinessHandler(IPC_CHANNELS.restoreBackup, rendererUrl, parseRestoreBackup, (input) =>
    controller.restoreBackup(input)
  )
  registerBusinessHandler(IPC_CHANNELS.getCommonConfig, rendererUrl, parseCommonConfig, (input) =>
    controller.getCommonConfig(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.saveCommonConfig,
    rendererUrl,
    parseSaveCommonConfig,
    (input) => controller.saveCommonConfig(input)
  )
  registerBusinessHandler(IPC_CHANNELS.previewConfig, rendererUrl, parsePreviewConfig, (input) =>
    controller.previewConfig(input)
  )
  registerBusinessHandler(
    IPC_CHANNELS.migrateCommonConfig,
    rendererUrl,
    parseMigrateCommonConfig,
    (input) => controller.migrateCommonConfig(input)
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
    configurations: expectConfigurations(input.configurations)
  }
}

function parseAppSettings(args: unknown[]): AppSettingsInput {
  const input = expectRecordArgument(args)
  if (input.closeBehavior !== 'tray' && input.closeBehavior !== 'quit') throw invalidRequest()
  return { closeBehavior: input.closeBehavior }
}

function parseCloudBackupSettings(args: unknown[]): CloudBackupSettingsInput {
  const input = expectRecordArgument(args)
  if (
    typeof input.retentionCount !== 'number' ||
    !CLOUD_BACKUP_RETENTION.options.some((count) => count === input.retentionCount)
  ) {
    throw new AppError('INVALID_INPUT', '云端备份保留数量请选择 1、3、5、10 或 20 份。')
  }
  const secretAccessKey = expectRecord(input.secretAccessKey)
  if (
    secretAccessKey.mode !== 'keep' &&
    secretAccessKey.mode !== 'replace' &&
    secretAccessKey.mode !== 'clear'
  ) {
    throw invalidRequest()
  }
  return {
    enabled: expectBoolean(input.enabled),
    endpoint: expectString(input.endpoint, 2048),
    region: expectString(input.region, 100),
    bucket: expectString(input.bucket, 255),
    prefix: expectString(input.prefix, 512),
    retentionCount: input.retentionCount,
    accessKeyId: expectString(input.accessKeyId, 256),
    secretAccessKey:
      secretAccessKey.mode === 'replace'
        ? { mode: 'replace', value: expectString(secretAccessKey.value, 4096) }
        : { mode: secretAccessKey.mode }
  }
}

function parseCloudBackupOperation(args: unknown[]): CloudBackupOperationInput {
  const input = expectRecordArgument(args)
  return { encryptionPassword: expectString(input.encryptionPassword, 256) }
}

function parseNativeTheme(args: unknown[]): SetNativeThemeInput {
  const input = expectRecordArgument(args)
  if (input.theme !== 'system' && input.theme !== 'light' && input.theme !== 'dark') {
    throw invalidRequest()
  }
  return { theme: input.theme }
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
    configurations: expectConfigurations(input.configurations)
  }
}

function parseDeleteProvider(args: unknown[]): DeleteProviderInput {
  const input = expectRecordArgument(args)
  return { id: expectIdentifier(input.id) }
}

function parseRevealProviderApiKey(args: unknown[]): RevealProviderApiKeyInput {
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

function parseOpenToolLocation(args: unknown[]): OpenToolLocationInput {
  const input = expectRecordArgument(args)
  if (input.target !== 'directory' && input.target !== 'config') throw invalidRequest()
  return { toolId: expectToolId(input.toolId), target: input.target }
}

function parseApplyProvider(args: unknown[]): ApplyProviderInput {
  const input = expectRecordArgument(args)
  return {
    toolId: expectToolId(input.toolId),
    providerId: expectIdentifier(input.providerId),
    ...(input.modelId === undefined ? {} : { modelId: expectIdentifier(input.modelId) })
  }
}

function parseRestoreBackup(args: unknown[]): RestoreBackupInput {
  const input = expectRecordArgument(args)
  return { backupId: expectIdentifier(input.backupId) }
}

function parseCommonConfig(args: unknown[]): CommonConfigInput {
  const input = expectRecordArgument(args)
  if (input.fromCurrent !== undefined && typeof input.fromCurrent !== 'boolean')
    throw invalidRequest()
  return {
    toolId: expectToolId(input.toolId),
    fromCurrent: input.fromCurrent as boolean | undefined
  }
}

function parseSaveCommonConfig(args: unknown[]): SaveCommonConfigInput {
  const input = expectRecordArgument(args)
  const revision = expectString(input.revision, 64)
  if (!/^[a-f0-9]{64}$/u.test(revision)) throw invalidRequest()
  return {
    toolId: expectToolId(input.toolId),
    content: expectString(input.content, 1024 * 1024),
    revision
  }
}

function parsePreviewConfig(args: unknown[]): PreviewConfigInput {
  const input = expectRecordArgument(args)
  if (input.providerId !== undefined && input.draft !== undefined) throw invalidRequest()
  const draft = input.draft === undefined ? undefined : expectRecord(input.draft)
  return {
    toolId: expectToolId(input.toolId),
    ...(input.modelId === undefined ? {} : { modelId: expectIdentifier(input.modelId) }),
    ...(input.providerId === undefined ? {} : { providerId: expectIdentifier(input.providerId) }),
    ...(draft === undefined
      ? {}
      : { draft: 'id' in draft ? parseUpdateProvider([draft]) : parseCreateProvider([draft]) })
  }
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

function expectBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalidRequest()
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

function expectConfigurations(value: unknown): ProviderConfigurations<HeaderInput> {
  return expectRecord(value) as ProviderConfigurations<HeaderInput>
}

function parseMigrateCommonConfig(args: unknown[]): MigrateCommonConfigInput {
  const input = expectRecordArgument(args)
  const revision = expectString(input.revision, 64)
  if (!/^[a-f0-9]{64}$/u.test(revision)) throw invalidRequest()
  return {
    toolId: expectToolId(input.toolId),
    providerId: expectIdentifier(input.providerId),
    modelId: expectIdentifier(input.modelId),
    revision
  }
}

function invalidRequest(): AppError {
  return new AppError('INVALID_INPUT', '请求参数无效，请刷新页面后重试。')
}
