import type { DatabaseMigration } from '../runner'

export const removeModelDisplayNames: DatabaseMigration = {
  version: 3,
  name: 'remove-model-display-names',
  up(database) {
    database.sql.exec('ALTER TABLE model_presets DROP COLUMN name')
  }
}
