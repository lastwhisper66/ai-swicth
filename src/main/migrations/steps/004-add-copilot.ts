import type { DatabaseMigration } from '../runner'

export const addCopilot: DatabaseMigration = {
  version: 4,
  name: 'add-copilot',
  up(database) {
    database.sql.exec(`
      CREATE TABLE copilot_providers (
        id TEXT PRIMARY KEY,
        document TEXT NOT NULL CHECK(json_valid(document)),
        position INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE copilot_backups (
        id TEXT PRIMARY KEY,
        document TEXT NOT NULL CHECK(json_valid(document))
      ) STRICT;
    `)
  }
}
