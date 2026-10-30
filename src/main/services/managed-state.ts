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
import type { AppDatabase } from '../database'

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
  constructor(private readonly database: AppDatabase) {}
  getReference(toolId: ToolId): string {
    return `state:${toolId}`
  }
  decode(content: string | null): ManagedState | null {
    return ManagedStateStore.decode(content)
  }
  static decode(content: string | null): ManagedState | null {
    if (content === null) return null
    try {
      const value: unknown = JSON.parse(content)
      if (
        !isObject(value) ||
        (value.version !== undefined && value.version !== 1) ||
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
      const state = { ...value }
      delete state.version
      return state as unknown as ManagedState
    } catch {
      throw new AppError('STORAGE_CORRUPTED', '配置接管状态损坏。请从本地备份恢复后再操作。')
    }
  }
  encode(state: ManagedState): string {
    return `${JSON.stringify(this.decode(JSON.stringify(state)), null, 2)}\n`
  }
  async get(toolId: ToolId): Promise<ManagedState | null> {
    return this.decode(this.database.readRecord(this.getReference(toolId)))
  }
  async exportPortable(): Promise<Record<ToolId, ManagedState | null>> {
    return Object.fromEntries(
      await Promise.all(TOOL_IDS.map(async (toolId) => [toolId, await this.get(toolId)]))
    ) as Record<ToolId, ManagedState | null>
  }
  async importPortable(states: Record<ToolId, ManagedState | null>): Promise<void> {
    this.database.transaction(() => {
      for (const toolId of TOOL_IDS)
        this.database.writeRecord(
          this.getReference(toolId),
          states[toolId] === null ? null : this.encode(states[toolId])
        )
    })
  }
}

function isFieldValue(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.exists === 'boolean' &&
    (!value.exists || Object.hasOwn(value, 'value'))
  )
}
