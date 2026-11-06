export interface CopilotHeaderRow {
  id: string
  name: string
  value: string
}

export function createCopilotHeader(name = '', value = ''): CopilotHeaderRow {
  return { id: crypto.randomUUID(), name, value }
}
