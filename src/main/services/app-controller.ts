import { app } from 'electron'
import type {
  AppSnapshot,
  AppSettingsInput,
  CloudBackupOperationInput,
  CloudBackupOperationResult,
  CloudBackupConnectionResult,
  CloudBackupSettingsInput,
  ApplyProviderInput,
  ApplyResult,
  CreateProviderInput,
  CommonConfigInput,
  CommonConfig,
  MigrateCommonConfigInput,
  ConfigPreview,
  SaveCommonConfigInput,
  PreviewConfigInput,
  DeleteProviderInput,
  OperationResponse,
  OpenToolLocationInput,
  PickToolPathInput,
  ResetToolPathInput,
  RevealProviderApiKeyInput,
  RestoreBackupInput,
  RestoreResult,
  SetToolPathInput,
  UpdateProviderInput
} from '@shared/ipc'
import type { ProviderStore } from '../providers/store'
import type { BackupService } from './backup'
import type { PathSettingsStore } from './path-settings'
import type { SwitchService } from './switch'
import type { ToolStatusService } from './tool-status'
import { openToolLocation } from './tool-location'
import type { AppSettingsStore } from './app-settings'
import type { CloudBackupService } from './cloud-backup'

export class AppController {
  private mutationLock: Promise<void> = Promise.resolve()

  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly backupService: BackupService,
    private readonly switchService: SwitchService,
    private readonly toolStatusService: ToolStatusService,
    private readonly appSettings: AppSettingsStore,
    private readonly cloudBackup: CloudBackupService
  ) {}

  async getSnapshot(refreshInstallations = false): Promise<AppSnapshot> {
    const [providers, tools, backups] = await Promise.all([
      this.providerStore.list(),
      this.toolStatusService.getAll(refreshInstallations),
      this.backupService.list()
    ])
    return {
      appInfo: { name: app.getName(), version: app.getVersion() },
      settings: this.appSettings.get(),
      providers,
      tools,
      backups
    }
  }

  async setAppSettings(input: AppSettingsInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.appSettings.set(input)
      return this.getSnapshot()
    })
  }

  async setCloudBackupSettings(input: CloudBackupSettingsInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.appSettings.setCloudBackup(input)
      return this.getSnapshot()
    })
  }

  async testCloudBackup(): Promise<CloudBackupConnectionResult> {
    return this.withMutation(() => this.cloudBackup.testConnection())
  }

  async setCloudBackupPassword(input: CloudBackupOperationInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.appSettings.setCloudBackupPassword(input.encryptionPassword)
      return this.getSnapshot()
    })
  }

  async uploadCloudBackup(
    input: CloudBackupOperationInput
  ): Promise<OperationResponse<CloudBackupOperationResult>> {
    return this.withMutation(async () => {
      await this.appSettings.setCloudBackupPassword(input.encryptionPassword)
      return {
        operation: await this.cloudBackup.upload(input.encryptionPassword),
        snapshot: await this.getSnapshot()
      }
    })
  }

  async restoreCloudBackup(
    input: CloudBackupOperationInput
  ): Promise<OperationResponse<CloudBackupOperationResult>> {
    return this.withMutation(async () => {
      await this.appSettings.setCloudBackupPassword(input.encryptionPassword)
      return {
        operation: await this.cloudBackup.restore(input.encryptionPassword),
        snapshot: await this.getSnapshot()
      }
    })
  }

  async createProvider(input: CreateProviderInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.providerStore.create(input)
      return this.getSnapshot()
    })
  }

  async updateProvider(input: UpdateProviderInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.providerStore.update(input)
      return this.getSnapshot()
    })
  }

  async deleteProvider(input: DeleteProviderInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.providerStore.delete(input.id)
      return this.getSnapshot()
    })
  }

  async revealProviderApiKey(input: RevealProviderApiKeyInput): Promise<string> {
    return this.withMutation(async () => (await this.providerStore.getResolved(input.id)).apiKey)
  }

  async getToolPickerDirectory(input: PickToolPathInput): Promise<string> {
    return this.pathSettings.getPickerDirectory(input.toolId)
  }

  async setToolPath(input: SetToolPathInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.pathSettings.set(input.toolId, input.path)
      return this.getSnapshot()
    })
  }

  async resetToolPath(input: ResetToolPathInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.pathSettings.reset(input.toolId)
      return this.getSnapshot()
    })
  }

  async openToolLocation(input: OpenToolLocationInput): Promise<void> {
    return this.withMutation(async () => {
      const location = await this.pathSettings.get(input.toolId)
      await openToolLocation(location, input.target)
    })
  }

  async applyProvider(input: ApplyProviderInput): Promise<OperationResponse<ApplyResult>> {
    return this.withMutation(async () => {
      const operation = await this.switchService.apply(
        input.toolId,
        input.providerId,
        input.modelId
      )
      return { operation, snapshot: await this.getSnapshot() }
    })
  }

  async restoreBackup(input: RestoreBackupInput): Promise<OperationResponse<RestoreResult>> {
    return this.withMutation(async () => {
      const operation = await this.switchService.restore(input.backupId)
      return { operation, snapshot: await this.getSnapshot() }
    })
  }

  async getCommonConfig(input: CommonConfigInput): Promise<CommonConfig> {
    return this.withMutation(() => this.switchService.getCommonConfig(input))
  }

  async migrateCommonConfig(input: MigrateCommonConfigInput): Promise<AppSnapshot> {
    return this.withMutation(async () => {
      await this.switchService.migrateCommonConfig(input)
      return this.getSnapshot()
    })
  }

  async previewConfig(input: PreviewConfigInput): Promise<ConfigPreview> {
    return this.withMutation(() => this.switchService.previewConfig(input))
  }

  async saveCommonConfig(input: SaveCommonConfigInput): Promise<OperationResponse<ApplyResult>> {
    return this.withMutation(async () => {
      const operation = await this.switchService.saveCommonConfig(input)
      return { operation, snapshot: await this.getSnapshot() }
    })
  }

  private async withMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationLock
    let release: () => void = () => undefined
    this.mutationLock = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}
