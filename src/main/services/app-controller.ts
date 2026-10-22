import { app } from 'electron'
import type {
  AppSnapshot,
  ApplyProviderInput,
  ApplyResult,
  CreateProviderInput,
  DeleteProviderInput,
  OperationResponse,
  ResetToolPathInput,
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

export class AppController {
  private mutationLock: Promise<void> = Promise.resolve()

  constructor(
    private readonly providerStore: ProviderStore,
    private readonly pathSettings: PathSettingsStore,
    private readonly backupService: BackupService,
    private readonly switchService: SwitchService,
    private readonly toolStatusService: ToolStatusService
  ) {}

  async getSnapshot(): Promise<AppSnapshot> {
    const [providers, tools, backups] = await Promise.all([
      this.providerStore.list(),
      this.toolStatusService.getAll(),
      this.backupService.list()
    ])
    return {
      appInfo: { name: app.getName(), version: app.getVersion() },
      providers,
      tools,
      backups
    }
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

  async applyProvider(input: ApplyProviderInput): Promise<OperationResponse<ApplyResult>> {
    return this.withMutation(async () => {
      const operation = await this.switchService.apply(input.toolId, input.providerId)
      return { operation, snapshot: await this.getSnapshot() }
    })
  }

  async restoreBackup(input: RestoreBackupInput): Promise<OperationResponse<RestoreResult>> {
    return this.withMutation(async () => {
      const operation = await this.switchService.restore(input.backupId)
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
