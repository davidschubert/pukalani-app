/**
 * Anmelde-Weg und zweite Faktoren einer Sitzung, so wie Appwrite sie liefert
 * (`email`, `password`, `totp`, `google` …), als Wort für Menschen (UX-013,
 * Q16). Bekannte Werte haben einen Text unter `account.sessions.method.*`;
 * ein OAuth-Anbieter bleibt sein Name, mit großem Anfangsbuchstaben.
 */
export const SESSION_METHODS = ['email', 'password', 'magic-url', 'phone', 'totp', 'anonymous', 'token'] as const

export function sessionMethodLabel(value: string, t: (key: string) => string): string {
  if ((SESSION_METHODS as readonly string[]).includes(value)) return t(`account.sessions.method.${value}`)
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '—'
}
