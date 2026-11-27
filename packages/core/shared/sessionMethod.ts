/**
 * Anmelde-Weg und zweite Faktoren einer Sitzung, so wie Appwrite sie liefert
 * (`email`, `password`, `totp`, `google` …), als Wort für Menschen (UX-013,
 * Q16). Bekannte Werte haben einen Text unter `account.sessions.method.*`;
 * ein OAuth-Anbieter bleibt sein Name, mit großem Anfangsbuchstaben.
 */
export const SESSION_METHODS = ['email', 'password', 'magic-url', 'phone', 'totp', 'anonymous', 'token', 'server'] as const

/**
 * `server` legt Appwrite an, wenn UNSER Server eine Sitzung anlegt
 * (`users.createSession`). Das tut nur die Übergabe an eine eigene Domain im
 * Modus `write` (`server/utils/sessionHandoff.ts`) — darum heißt sie für
 * Menschen „Community-Seite" (PK1-EIN, Befund 1). Welche Seite, weiß Appwrite
 * nicht; das bleibt dem großen Paket (eigene Ablage beim Anlegen).
 * Appwrite setzt dazu den Faktor `server` — der ist kein zweiter Faktor und
 * wird nicht noch einmal gezeigt.
 */
export const SITE_SESSION_PROVIDER = 'server'

/** Icon zum Anmelde-Weg einer Sitzung. */
export function sessionMethodIcon(provider: string): string {
  if (provider === 'email') return 'i-ph-envelope-simple'
  if (provider === SITE_SESSION_PROVIDER) return 'i-ph-globe'
  return 'i-ph-plugs-connected'
}

/** Die Faktoren, die ein Mensch als Anmelde-Faktor lesen soll. */
export function visibleSessionFactors(factors: readonly string[]): string[] {
  return factors.filter(factor => factor !== SITE_SESSION_PROVIDER)
}

export function sessionMethodLabel(value: string, t: (key: string) => string): string {
  if ((SESSION_METHODS as readonly string[]).includes(value)) return t(`account.sessions.method.${value}`)
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '—'
}
