import type { DatabaseMigration } from '../runner'

export const createSchema: DatabaseMigration = {
  version: 1,
  name: 'create-schema',
  up(database) {
    database.sql.exec(`
      CREATE TABLE providers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, base_url TEXT NOT NULL, api_key TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, position INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE provider_connections (
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        tool_id TEXT NOT NULL CHECK(tool_id IN ('claude-code', 'codex')),
        default_model_id TEXT NOT NULL, options TEXT NOT NULL CHECK(json_valid(options)), position INTEGER NOT NULL,
        PRIMARY KEY (provider_id, tool_id),
        FOREIGN KEY(provider_id, tool_id, default_model_id) REFERENCES model_presets(provider_id, tool_id, id) DEFERRABLE INITIALLY DEFERRED
      ) STRICT;
      CREATE TABLE model_presets (
        provider_id TEXT NOT NULL, tool_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
        options TEXT NOT NULL CHECK(json_valid(options)), position INTEGER NOT NULL,
        PRIMARY KEY (provider_id, tool_id, id),
        FOREIGN KEY(provider_id, tool_id) REFERENCES provider_connections(provider_id, tool_id) ON DELETE CASCADE
      ) STRICT;
      CREATE TABLE provider_headers (
        provider_id TEXT NOT NULL, tool_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL,
        position INTEGER NOT NULL, PRIMARY KEY(provider_id, tool_id, id),
        FOREIGN KEY(provider_id, tool_id) REFERENCES provider_connections(provider_id, tool_id) ON DELETE CASCADE
      ) STRICT;
      CREATE TABLE common_templates (tool_id TEXT PRIMARY KEY CHECK(tool_id IN ('claude-code','codex')), content TEXT) STRICT;
      CREATE TABLE device_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
      CREATE TABLE cloud_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
      CREATE TABLE tool_paths (tool_id TEXT PRIMARY KEY, path TEXT NOT NULL) STRICT;
      CREATE TABLE managed_states (tool_id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document))) STRICT;
      CREATE TABLE backup_records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('tool','configuration')), created_at TEXT NOT NULL,
        tool_id TEXT, path TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
      ) STRICT;
      CREATE INDEX backups_kind_time ON backup_records(kind, created_at DESC);
      CREATE TABLE pending_operations (
        id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document))
      ) STRICT;
    `)
  }
}
