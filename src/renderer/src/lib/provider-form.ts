import type { ModelPreset } from '@shared/configuration'

export function createModelPreset(): ModelPreset {
  return { id: crypto.randomUUID(), name: '', model: '', options: {} }
}
