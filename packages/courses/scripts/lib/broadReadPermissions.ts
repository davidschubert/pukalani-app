/**
 * Die REGEL der Migration courses-008 (SEC-029) — pur, getestet
 * (`tests/course-server-only-read.test.ts`) und von der Migration direkt
 * importiert. Läuft per `node --experimental-strip-types`: keine Nuxt-Aliasse,
 * keine Laufzeit-Abhängigkeit, nur Typ-Syntax, die sich wegstreichen lässt.
 *
 * „Breit" heißt: ein Leserecht, das an einer ROLLE hängt statt an einer
 * Person — `any`, `guests`, `users` (auch `users/verified` u. ä.) und
 * `label:…`. Alles andere (Schreibrechte, `read("user:…")`, Teams) fasst die
 * Migration nicht an.
 */

const READ_PATTERN = /^read\("([^"]*)"\)$/

export function isBroadReadPermission(permission: string): boolean {
  const match = READ_PATTERN.exec(permission)
  if (!match) return false
  const role = match[1] ?? ''
  return role === 'any'
    || role === 'guests'
    || role === 'users'
    || role.startsWith('users/')
    || role.startsWith('label:')
}

export interface PermissionSplit {
  kept: string[]
  removed: string[]
}

/** Teilt die Rechte einer Zeile: was bleibt, was fällt. Reihenfolge bleibt. */
export function splitBroadReads(permissions: readonly string[]): PermissionSplit {
  const kept: string[] = []
  const removed: string[] = []
  for (const permission of permissions) {
    if (isBroadReadPermission(permission)) removed.push(permission)
    else kept.push(permission)
  }
  return { kept, removed }
}

/**
 * Für Einschreibungen und Fortschritt: trägt die Zeile HÖCHSTENS ein
 * Leserecht für eine einzelne Person? Jeder andere Eintrag ist eine
 * Abweichung, die die Migration meldet (nicht ändert).
 */
export function onlyOwnUserReads(permissions: readonly string[]): boolean {
  return permissions.every(permission => /^read\("user:[^"]+"\)$/.test(permission))
}
