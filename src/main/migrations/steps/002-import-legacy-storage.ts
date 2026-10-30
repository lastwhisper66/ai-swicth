import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { PROVIDER_TOOL_IDS, TOOL_IDS, type ConfigurationBackupSummary } from '@shared/ipc'
import { isObject } from '@shared/configuration'
import type { AppDatabase } from '../../database'
import { AppError } from '../../errors'
import { decodeDocument } from '../../providers/store'
import { decodeAppSettingsDocument } from '../../services/app-settings'
import { decodeBackupIndex } from '../../services/backup'
import { ConfigurationArchiveStore } from '../../services/configuration-archives'
import { hashContent, readOptionalText, assertNotSymbolicLink } from '../../utils/files'
import { prepareLegacyStorage } from '../legacy-storage'
import type { DatabaseMigration } from '../runner'

export const importLegacyStorage: DatabaseMigration = {
  version: 2,
  name: 'import-legacy-storage',
  up: () => undefined,
  async prepare(database) {
    const context = await prepareLegacyStorage(database.rootPath)
    await context.read('migrations/completed.json')
    const original = context.snapshot()
    const files = context.preparedFiles()
    const archives = new ConfigurationArchiveStore(database)
    const sourceFiles = Object.fromEntries(
      Object.entries(original).filter(([, value]) => value !== null)
    )
    const migrationBackup = Object.keys(sourceFiles).length
      ? await archives.prepare(sourceFiles, 'migration')
      : null
    const history: ConfigurationBackupSummary[] = []
    const directory = join(database.rootPath, 'backups', 'configurations')
    const names = await readdir(directory).catch((error: unknown) => {
      if (isObject(error) && error.code === 'ENOENT') return []
      throw error
    })
    for (const name of names) {
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/iu.test(name)
      )
        continue
      const path = join(directory, name)
      let value: unknown
      try {
        value = JSON.parse((await readOptionalText(path))!)
      } catch {
        /* Keep damaged history visible; read validates the payload later. */
      }
      history.push({
        id: name.slice(0, -5),
        createdAt:
          isObject(value) &&
          typeof value.createdAt === 'string' &&
          Number.isFinite(Date.parse(value.createdAt))
            ? value.createdAt
            : (await stat(path)).mtime.toISOString(),
        reason:
          isObject(value) && (value.reason === 'cloud' || value.reason === 'migration')
            ? value.reason
            : 'restore'
      })
    }
    for (const [name, content] of Object.entries(original)) {
      if ((await readOptionalText(join(database.rootPath, name))) !== content)
        throw new AppError(
          'CONCURRENT_MODIFICATION',
          '旧配置在迁移期间被外部修改，未导入，请重新启动应用。'
        )
    }
    return () => {
      if (files['providers.json'] !== null && files['providers.json'] !== undefined)
        database.replaceProviders(decodeDocument(JSON.parse(files['providers.json'])).providers)
      if (files['preferences.json']) {
        const settings = decodeAppSettingsDocument(JSON.parse(files['preferences.json']))
        database.setSetting('device_settings', 'closeBehavior', settings.closeBehavior)
        database.setSetting('cloud_settings', 'connection', settings.cloudBackup)
      }
      const paths = files['settings.json']
        ? (JSON.parse(files['settings.json']).paths as Record<string, string>)
        : {}
      const insertPath = database.sql.prepare('INSERT INTO tool_paths VALUES (?, ?)')
      for (const [id, path] of Object.entries(paths)) insertPath.run(id, path)
      for (const id of PROVIDER_TOOL_IDS) {
        const content = files[`${id}.common.json`]
        if (content !== null && content !== undefined)
          database.writeRecord(`template:${id}`, content)
      }
      for (const id of TOOL_IDS) {
        const content = files[`${id}.managed.json`]
        if (content !== null && content !== undefined) database.writeRecord(`state:${id}`, content)
      }
      if (files['backups/index.json']) {
        for (const record of decodeBackupIndex(JSON.parse(files['backups/index.json'])).backups)
          database.putBackup({
            id: record.id,
            kind: 'tool',
            createdAt: record.createdAt,
            toolId: record.toolId,
            path: join(database.rootPath, 'backups', record.toolId, `${record.id}.backup`),
            document: record
          })
      }
      for (const backup of history) archives.register(backup)
      if (migrationBackup) archives.register(migrationBackup)
      const cleanup = Object.entries(sourceFiles).map(([name, content]) => ({
        name,
        hash: hashContent(content)
      }))
      if (cleanup.length) database.setSetting('device_settings', 'legacyCleanup', cleanup)
    }
  }
}

export async function cleanupLegacyStorage(database: AppDatabase): Promise<string[]> {
  const pending =
    database.getSetting<Array<{ name: string; hash: string }>>(
      'device_settings',
      'legacyCleanup'
    ) ?? []
  const remaining: typeof pending = []
  for (const entry of pending) {
    // Only importer-owned names are eligible; paths from database contents never escape userData.
    if (
      !/^(?:(?:providers|preferences|settings)(?:\.v1)?\.json|(?:claude-code|codex)(?:-wsl)?\.(?:common(?:\.v2)?|managed(?:\.v1)?)\.json|backups\/index(?:\.v1)?\.json|migrations\/completed\.json)$/u.test(
        entry.name
      )
    )
      throw new AppError('STORAGE_CORRUPTED', '旧配置清理记录无效，未删除文件。')
    const path = join(database.rootPath, entry.name)
    try {
      await assertNotSymbolicLink(path)
      const content = await readOptionalText(path)
      if (content === null) continue
      if (hashContent(content) !== entry.hash) {
        remaining.push(entry)
        continue
      }
      await unlink(path)
    } catch {
      remaining.push(entry)
    }
  }
  if (pending.length) {
    if (remaining.length) database.setSetting('device_settings', 'legacyCleanup', remaining)
    else database.sql.prepare("DELETE FROM device_settings WHERE key = 'legacyCleanup'").run()
  }
  return remaining.map((entry) => entry.name)
}
