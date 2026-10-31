interface ApplicationVersion {
  core: string[]
  prerelease: string[]
}

/** SemVer precedence, including prereleases; build metadata does not affect updates. */
export function compareApplicationVersions(left: string, right: string): number | null {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return null
  for (let index = 0; index < 3; index += 1) {
    const difference = compareNumeric(a.core[index], b.core[index])
    if (difference) return difference
  }
  if (!a.prerelease.length || !b.prerelease.length)
    return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const first = a.prerelease[index]
    const second = b.prerelease[index]
    if (first === undefined) return -1
    if (second === undefined) return 1
    if (first === second) continue
    const firstNumeric = /^\d+$/u.test(first)
    const secondNumeric = /^\d+$/u.test(second)
    if (firstNumeric && secondNumeric) return compareNumeric(first, second)
    if (firstNumeric !== secondNumeric) return firstNumeric ? -1 : 1
    return first < second ? -1 : 1
  }
  return 0
}

function parseVersion(value: string): ApplicationVersion | null {
  if (value.length > 256) return null
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      value
    )
  if (!match) return null
  const prerelease = match[4]?.split('.') ?? []
  if (prerelease.some((part) => /^0\d+$/u.test(part))) return null
  return { core: match.slice(1, 4), prerelease }
}

function compareNumeric(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left === right ? 0 : left < right ? -1 : 1
}
