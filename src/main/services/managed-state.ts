import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { TOOL_IDS, type ToolId } from '@shared/ipc'
import {
  isObject,
  readField,
  setField,
  type ConfigObject,
  type ConfigPath,
  type ManagedState,
  type OwnedField
} from '@shared/configuration'
import { AppError } from '../errors'
import { readOptionalText, writeTextAtomic } from '../utils/files'

export type DesiredField = { path: ConfigPath; value: unknown }

export function applyOwnedFields(
  root: ConfigObject,
  desired: DesiredField[],
  previous: OwnedField[] = []
): OwnedField[] {
  for (const field of previous) {
    if (isDeepStrictEqual(readField(root, field.path), field.applied)) {
      setField(root, field.path, field.before.exists ? field.before.value : undefined)
    }
  }
  return desired.map(({ path, value }) => {
    const before = structuredClone(readField(root, path))
    setField(root, path, value)
    return { path, before, applied: structuredClone(readField(root, path)) }
  })
}

export function verifyFields(root: ConfigObject, desired: DesiredField[]): boolean {
  return desired.every(({ path, value }) =>
    isDeepStrictEqual(
      readField(root, path),
      value === undefined ? { exists: false } : { exists: true, value }
    )
  )
}

export class ManagedStateStore {
  constructor(private readonly rootPath: string) {}
  getPath(toolId: ToolId): string {
    return join(this.rootPath, `${toolId}.managed.v1.json`)
  }
  decode(content: string | null): ManagedState | null {
    if (content === null) return null
    try {
      const value: unknown = JSON.parse(content)
      if (
        !isObject(value) ||
        value.version !== 1 ||
        typeof value.targetPath !== 'string' ||
        !Array.isArray(value.fields)
      )
        throw new Error('Invalid state')
      if (
        !value.fields.every(
          (field) =>
            isObject(field) &&
            Array.isArray(field.path) &&
            field.path.length > 0 &&
            field.path.every(
              (key) =>
                typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key)
            ) &&
            isFieldValue(field.before) &&
            isFieldValue(field.applied)
        )
      )
        throw new Error('Invalid fields')
      if (value.attribution !== undefined && !isFieldValue(value.attribution))
        throw new Error('Invalid attribution')
      if (value.common !== undefined && typeof value.common !== 'string')
        throw new Error('Invalid applied common template')
      if (
        value.selection !== undefined &&
        (!isObject(value.selection) ||
          typeof value.selection.providerId !== 'string' ||
          typeof value.selection.modelId !== 'string' ||
          (value.selection.signature !== undefined &&
            (typeof value.selection.signature !== 'string' ||
              !/^[a-f0-9]{64}$/u.test(value.selection.signature))))
      )
        throw new Error('Invalid selection')
      return value as unknown as ManagedState
    } catch {
      throw new AppError('STORAGE_CORRUPTED', '配置接管状态损坏。请从本地备份恢复后再操作。')
    }
  }
  encode(state: ManagedState): string {
    return `${JSON.stringify(state, null, 2)}\n`
  }
  async get(toolId: ToolId): Promise<ManagedState | null> {
    return this.decode(await readOptionalText(this.getPath(toolId)))
  }
  async exportPortable(): Promise<Record<ToolId, ManagedState | null>> {
    return Object.fromEntries(
      await Promise.all(TOOL_IDS.map(async (toolId) => [toolId, await this.get(toolId)]))
    ) as Record<ToolId, ManagedState | null>
  }
  async importPortable(states: Record<ToolId, ManagedState | null>): Promise<void> {
    for (const toolId of TOOL_IDS) {
      const state = states[toolId]
      if (state === null) {
        await unlink(this.getPath(toolId)).catch((error: unknown) => {
          if (!(isObject(error) && error.code === 'ENOENT')) throw error
        })
      } else {
        const content = this.encode(state)
        this.decode(content)
        await writeTextAtomic(this.getPath(toolId), content, true)
      }
    }
  }
}

function isFieldValue(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.exists === 'boolean' &&
    (!value.exists || Object.hasOwn(value, 'value'))
  )
}
