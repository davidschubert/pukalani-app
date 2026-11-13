/**
 * ABGELEHNTES PASSWORT, ABGELEHNTE ADRESSE — die pure Zuordnung (P29).
 *
 * Seit P29 setzt `scripts/ops/appwrite-auth-policies.mjs` die Anmelde-Regeln
 * des Projekts (Leak-Abgleich, persönliche Daten, Passwort-Verlauf,
 * Wegwerf-Adressen). Appwrite lehnt dann beim Anlegen eines Kontos, beim
 * Ändern und beim Zurücksetzen eines Passworts mit einem eigenen Fehlertyp ab.
 * Vorher wurde daraus pauschal „Email not allowed" (Signup) bzw. „hat nicht
 * geklappt" (Ändern, Reset) — für einen Menschen falsch bzw. nichtssagend.
 *
 * Diese Datei übersetzt den APPWRITE-Typ in einen eigenen, kurzen Code, der
 * als `data: { code }` die Route verlässt und beim Client als
 * `error.data.reason` ankommt. Nach außen geht NUR dieser Code, nie der
 * Appwrite-Typ oder dessen Meldung.
 *
 * BEWUSST NICHT ZUGEORDNET: die Wörterbuch-Ablehnung („zu häufiges Passwort").
 * Appwrite meldet sie als allgemeinen Parameter-Fehler
 * (`general_argument_invalid`, gemessen 2026-11-13 auf 2.7.1) — derselbe Typ
 * wie für eine verletzte Mindestlänge und jeden anderen ungültigen Parameter.
 * Unterscheidbar wäre er nur am englischen Meldungstext; eine Zuordnung, die
 * an einem Satz hängt, ist keine sichere Erkennung. Dieser Fall bleibt beim
 * bisherigen Verhalten der jeweiligen Route.
 */

/** Die fachlichen Codes — dieselben Wörter im Server und im Client. */
export const PASSWORD_POLICY_REASONS = [
  'password_breached',
  'password_personal_data',
  'password_recently_used',
  'password_check_unavailable',
  'email_not_allowed',
] as const

export type PasswordPolicyReason = typeof PASSWORD_POLICY_REASONS[number]

export function isPasswordPolicyReason(value: unknown): value is PasswordPolicyReason {
  return typeof value === 'string' && (PASSWORD_POLICY_REASONS as readonly string[]).includes(value)
}

/** Ergebnis der Zuordnung: Status der eigenen Antwort plus fachlicher Code. */
export interface PasswordPolicyRejection {
  status: 422 | 503
  code: PasswordPolicyReason
}

/**
 * Appwrite-Fehlertyp → eigene Ablehnung, sonst `null` (dann antwortet die
 * Route wie bisher). Der Leak-Dienst nicht erreichbar ist KEINE Ablehnung des
 * Passworts, sondern ein vorübergehender Ausfall — deshalb 503 statt 422.
 */
export function passwordPolicyRejection(appwriteType: unknown): PasswordPolicyRejection | null {
  switch (appwriteType) {
    case 'password_pwned': return { status: 422, code: 'password_breached' }
    case 'password_personal_data': return { status: 422, code: 'password_personal_data' }
    case 'password_recently_used': return { status: 422, code: 'password_recently_used' }
    case 'general_pwned_passwords_unavailable': return { status: 503, code: 'password_check_unavailable' }
    case 'user_email_disposable': return { status: 422, code: 'email_not_allowed' }
    default: return null
  }
}
