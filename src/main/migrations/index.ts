import { runMigrations, type DatabaseMigration } from './runner'
import { createSchema } from './steps/001-create-schema'
import { importLegacyStorage, cleanupLegacyStorage } from './steps/002-import-legacy-storage'
import type { AppDatabase } from '../database'

// Keep explicit imports and append new steps: electron-vite bundles these into the main process.
const migrations: readonly DatabaseMigration[] = [createSchema, importLegacyStorage]

export async function runAppMigrations(database: AppDatabase): Promise<string[]> {
  await runMigrations(database, migrations)
  return cleanupLegacyStorage(database)
}
