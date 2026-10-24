import { join } from 'node:path'
import type { ToolId } from '@shared/ipc'
import { decryptSecret, encryptSecret } from '../security/secure-storage'

/** Templates may contain environment secrets; keep their bodies encrypted at rest. */
export class CommonConfigStore {
  constructor(private readonly rootPath: string) {}

  getPath(toolId: ToolId): string {
    return join(this.rootPath, `${toolId}.common.enc`)
  }

  decode(content: string | null): string | null {
    return content === null
      ? null
      : decryptSecret(content, '共通配置无法解密，请检查应用数据目录或从备份恢复。')
  }

  encode(content: string): string {
    return encryptSecret(content)
  }
}
