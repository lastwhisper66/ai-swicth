import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import type { ToolId } from '@shared/ipc'
import { TOOL_IDS } from '@shared/ipc'
import { readOptionalText, writeTextAtomic } from '../utils/files'

/** Templates may contain environment secrets; keep their bodies in the local app data directory. */
export class CommonConfigStore {
  constructor(private readonly rootPath: string) {}

  getPath(toolId: ToolId): string {
    return join(this.rootPath, `${toolId}.common.json`)
  }

  decode(content: string | null): string | null {
    return content
  }

  encode(content: string): string {
    return content
  }

  async exportPortable(): Promise<Record<ToolId, string | null>> {
    const entries = await Promise.all(
      TOOL_IDS.map(async (toolId) => {
        const encoded = await readOptionalText(this.getPath(toolId))
        return [toolId, this.decode(encoded)] as const
      })
    )
    return Object.fromEntries(entries) as Record<ToolId, string | null>
  }

  async importPortable(configs: Record<ToolId, string | null>): Promise<void> {
    for (const toolId of TOOL_IDS) {
      const content = configs[toolId]
      if (content === null) {
        await unlink(this.getPath(toolId)).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        })
      } else {
        await writeTextAtomic(this.getPath(toolId), this.encode(content), true)
      }
    }
  }
}
