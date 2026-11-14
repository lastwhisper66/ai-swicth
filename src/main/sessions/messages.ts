import type { SessionMessage } from '@shared/sessions'
import { stripVTControlCharacters } from 'node:util'

export type JsonRecord = Record<string, unknown>
export const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
export const text = (value: unknown): string => (typeof value === 'string' ? value : '')
export const cleanText = (value: string): string => stripVTControlCharacters(value)

export function contentText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value)
  if (!Array.isArray(value)) return ''
  return value
    .map((entry) => {
      const block = record(entry)
      if (block.type === 'image' || block.type === 'input_image') return '[图片附件]'
      if (block.type === 'tool_result') return contentText(block.content)
      return text(block.text) || text(block.content)
    })
    .filter(Boolean)
    .join('\n\n')
}

export interface ParsedConversation {
  sessionId: string
  title: string
  project: string
  messages: SessionMessage[]
}
