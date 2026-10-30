import { PROVIDER_TOOL_IDS, TOOL_IDS } from '@shared/ipc'
import { isObject, parseConfiguration } from '@shared/configuration'
import { decodeDocument } from '../providers/store'
import { decodeAppSettingsDocument } from '../services/app-settings'
import { decodeBackupIndex } from '../services/backup'
import { decodeCommonConfig } from '../services/common-config'
import { ManagedStateStore } from '../services/managed-state'
import { decodePathSettings } from '../services/path-settings'
import { MigrationContext } from './context'

export async function prepareLegacyStorage(rootPath: string): Promise<MigrationContext> {
  const context = new MigrationContext(rootPath)
  const read = (name: string): Promise<string | null> => context.read(name)
  const set = (name: string, content: string | null): void => context.write(name, content)
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
  for (const [current, legacy, decode] of [
    ['providers.json', 'providers.v1.json', decodeDocument],
    ['settings.json', 'settings.v1.json', decodePathSettings],
    ['backups/index.json', 'backups/index.v1.json', decodeBackupIndex]
  ] as const) {
    const saved = await read(current)
    const old = await read(legacy)
    const source = saved ?? old
    if (source !== null) set(current, json(decode(JSON.parse(source))))
    if (old !== null) set(legacy, null)
  }
  const preferences = await read('preferences.json')
  const oldPreferences = await read('preferences.v1.json')
  if (preferences !== null || oldPreferences !== null) {
    const document = JSON.parse((preferences ?? oldPreferences)!) as Record<string, unknown>
    decodeAppSettingsDocument(document)
    delete document.version
    set('preferences.json', json(document))
  }
  if (oldPreferences !== null) set('preferences.v1.json', null)

  for (const toolId of PROVIDER_TOOL_IDS) {
    const current = `${toolId}.common.json`
    const legacy = `${toolId}.common.v2.json`
    const wsl = `${toolId}-wsl.common.json`
    const saved = await read(current)
    const old = await read(legacy)
    const oldWsl = await read(wsl)
    let hasContainer = false
    if (saved !== null) {
      try {
        const parsed: unknown = JSON.parse(saved)
        hasContainer =
          isObject(parsed) &&
          Object.hasOwn(parsed, 'content') &&
          Object.keys(parsed).every((key) => key === 'content' || key === 'version')
      } catch {
        /* A legacy Codex template is TOML. */
      }
    }
    const content = hasContainer
      ? decodeCommonConfig(saved)
      : old !== null
        ? decodeCommonConfig(old)
        : (saved ?? oldWsl)
    if (content !== null) parseConfiguration(toolId, content)
    if (saved !== null || old !== null || oldWsl !== null) set(current, json({ content }))
    if (old !== null) set(legacy, null)
    if (oldWsl !== null) set(wsl, null)
  }
  for (const toolId of TOOL_IDS) {
    const current = `${toolId}.managed.json`
    const legacy = `${toolId}.managed.v1.json`
    const saved = await read(current)
    const old = await read(legacy)
    const state = ManagedStateStore.decode(saved ?? old)
    if (state !== null) set(current, json(state))
    if (old !== null) set(legacy, null)
  }
  return context
}
