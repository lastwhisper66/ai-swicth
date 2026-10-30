import { isAbsolute, relative, resolve } from 'node:path'
import { readOptionalText } from '../utils/files'

/** Legacy JSON conversion prepares records without rewriting the source files. */
export class MigrationContext {
  private readonly originals: Record<string, string | null> = {}
  private readonly changes: Record<string, string | null> = {}

  constructor(readonly rootPath: string) {}

  async read(name: string): Promise<string | null> {
    const path = this.resolvePath(name)
    if (!Object.hasOwn(this.originals, name)) this.originals[name] = await readOptionalText(path)
    return this.originals[name]
  }

  write(name: string, content: string | null): void {
    this.resolvePath(name)
    if (!Object.hasOwn(this.originals, name))
      throw new Error('A migration must read a file before changing it')
    if (this.originals[name] === content) delete this.changes[name]
    else this.changes[name] = content
  }

  get hasChanges(): boolean {
    return Object.keys(this.changes).length > 0
  }

  snapshot(): Record<string, string | null> {
    return { ...this.originals }
  }

  preparedFiles(): Record<string, string | null> {
    return { ...this.originals, ...this.changes }
  }

  private resolvePath(name: string): string {
    const path = resolve(this.rootPath, name)
    const withinRoot = relative(this.rootPath, path)
    if (
      isAbsolute(name) ||
      !withinRoot ||
      isAbsolute(withinRoot) ||
      withinRoot.split(/[\\/]/u).includes('..')
    )
      throw new Error('Migration files must stay inside the app data directory')
    return path
  }
}
