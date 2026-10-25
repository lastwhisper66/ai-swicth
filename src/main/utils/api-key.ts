export function maskApiKey(key: string): string {
  if (key.length >= 18) return `${key.slice(0, 6)}…${key.slice(-6)}`
  if (key.length >= 12) return `${key.slice(0, 3)}…${key.slice(-4)}`
  if (key.length >= 6) return `${key.slice(0, 1)}…${key.slice(-2)}`
  return key.length > 0 ? '••••••••' : ''
}
