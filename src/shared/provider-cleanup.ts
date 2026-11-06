export interface ProviderCleanupEntry {
  label: string
  location: string
  content: string
}

export interface ProviderCleanupPreview {
  path: string
  language: 'json' | 'toml'
  revision: string
  entries: ProviderCleanupEntry[]
  hasChanges: boolean
  notes: string[]
  warnings: string[]
}
