import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../database'
import { AppError } from '../errors'

export interface DatabaseMigration {
  readonly version: number
  readonly name: string
  prepare?: (database: AppDatabase) => Promise<() => void>
  up: (database: AppDatabase) => void
}

export async function runMigrations(
  database: AppDatabase,
  migrations: readonly DatabaseMigration[]
): Promise<void> {
  if (migrations.some((m, i) => m.version !== i + 1))
    throw new Error('Migration versions must be consecutive')
  const current = database.sql.pragma('user_version', { simple: true }) as number
  if (current > migrations.length)
    throw new AppError('STORAGE_CORRUPTED', '数据库由更新版本的应用创建，请升级应用后重试。')
  if (database.sql.pragma('quick_check', { simple: true }) !== 'ok')
    throw new AppError('STORAGE_CORRUPTED', '数据库完整性校验失败，请从本机数据库备份恢复。')
  if (current > 0 && current < migrations.length) {
    const directory = join(database.rootPath, 'backups', 'database')
    await mkdir(directory, { recursive: true })
    await database.sql.backup(
      join(directory, `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}.db`)
    )
  }
  database.sql.pragma('journal_mode = WAL')
  database.sql.pragma('synchronous = FULL')
  for (const migration of migrations) {
    if (migration.version <= current) continue
    try {
      const prepared = await migration.prepare?.(database)
      database.transaction(() => {
        migration.up(database)
        prepared?.()
        database.sql.pragma(`user_version = ${migration.version}`)
      })
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(
        'STORAGE_CORRUPTED',
        `数据库迁移 ${migration.version}（${migration.name}）失败，当前步骤已回滚。请检查旧配置格式、磁盘空间和目录权限后重试。`
      )
    }
  }
}
