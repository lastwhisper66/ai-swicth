import { join } from 'node:path'

export function getCodexCommandDirectories(): string[] {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return []
  return [join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin')]
}
