/** Keep credentials out of deletion previews, including unmanaged provider settings. */
export function redactCleanupValue(value: unknown, key = '', sensitive = false): unknown {
  const mask =
    sensitive ||
    /(?:api[-_]?key|secret|password|authorization|credential|headers|^auth$|(?:^|[_-])(?:access|auth|refresh|bearer|experimental_bearer)?[_-]?token$)/iu.test(
      key
    )
  if (Array.isArray(value)) return value.map((entry) => redactCleanupValue(entry, '', mask))
  if (value instanceof Date) return mask ? '••••••' : value
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, redactCleanupValue(entry, name, mask)])
    )
  if (mask) return '••••••'
  if (typeof value === 'string' && /^https?:/iu.test(value)) {
    try {
      const url = new URL(value)
      if (url.username) url.username = 'REDACTED'
      if (url.password) url.password = 'REDACTED'
      for (const name of [...url.searchParams.keys()]) url.searchParams.set(name, 'REDACTED')
      return url.toString()
    } catch {
      return '[地址已脱敏]'
    }
  }
  return value
}
