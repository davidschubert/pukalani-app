/**
 * BOT-BEWEIS AN DEN MAIL-ROUTEN (Cloudflare Turnstile) — die pure Regel.
 *
 * ── Der Anlass (Vorfall 2026-10-27) ───────────────────────────────────────
 * Ein Skript rief `POST /api/auth/signup` im 20-Sekunden-Takt auf (Name =
 * Spamtext mit Link, E-Mail = ein fremdes Opfer) und ließ Appwrite 209
 * Verifizierungs-Mails über unser Resend-Konto verschicken. Stundenfenster und
 * Notbremse (Paket 1, `05.rate-limit.ts`) drosseln EINE Quelle — gegen ein
 * Skript, das die IP wechselt, hilft nur ein Beweis, dass ein Browser mit
 * einem Menschen davor fragt. Das ist Turnstile: das Widget im Formular holt
 * einen Einmal-Token, der Server lässt ihn bei Cloudflare gegenprüfen.
 *
 * ── Warum drei Zustände statt eines Schalters ─────────────────────────────
 * Der Schalter SIND die zwei Schlüssel (dieselbe Regel wie beim SMTP-Host:
 * „der Wert ist der Schalter"). Beide leer ⇒ `off`, und alles läuft exakt wie
 * vor dem Vorfall — so bleiben Dev, CI und die E2E-Specs, die über das
 * Formular registrieren, ohne Cloudflare lauffähig. Beide gesetzt ⇒ `on`.
 * NUR EINER gesetzt ist ein Konfigurationsfehler, und zwar ein gefährlicher
 * in beide Richtungen — deshalb ein eigener Wert, den Server-Util und
 * Startwarnung laut melden:
 *   - Secret ohne Site-Key: die Formulare zeigen kein Widget, schicken also
 *     nie einen Token — der Server lehnt JEDEN Gast ab.
 *   - Site-Key ohne Secret: das Widget erscheint, aber niemand prüft den
 *     Token — eine Hürde, die nur so aussieht.
 * Was der Server im zweiten Fall TUT, entscheidet `server/utils/turnstile.ts`.
 */
export type TurnstileMode = 'off' | 'on' | 'misconfigured'

export function turnstileMode(siteKey: string, secret: string): TurnstileMode {
  const hasSiteKey = siteKey.trim().length > 0
  const hasSecret = secret.trim().length > 0
  if (hasSiteKey && hasSecret) return 'on'
  if (!hasSiteKey && !hasSecret) return 'off'
  return 'misconfigured'
}

/**
 * Die drei Gast-Routen, die eine Mail auslösen — und zugleich die
 * `action`-Namen am Widget. Cloudflare gibt die `action` in der Prüfantwort
 * zurück; der Server vergleicht sie, damit ein Token aus dem
 * Passwort-vergessen-Formular nicht für die Registrierung taugt.
 */
export const TURNSTILE_ACTIONS = ['signup', 'otp', 'recovery'] as const
export type TurnstileAction = typeof TURNSTILE_ACTIONS[number]

/** Die Grund-Schlüssel, die als `reason` im Fehler-Envelope reisen. */
export const BOT_CHECK_REASONS = ['bot_check_required', 'bot_check_failed', 'bot_check_unavailable'] as const
export type BotCheckReason = typeof BOT_CHECK_REASONS[number]

export function isBotCheckReason(value: unknown): value is BotCheckReason {
  return typeof value === 'string' && (BOT_CHECK_REASONS as readonly string[]).includes(value)
}
