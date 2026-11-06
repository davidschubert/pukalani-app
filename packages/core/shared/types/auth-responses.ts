/**
 * ANTWORT-TYPEN DER AUTH-ROUTEN — von BEIDEN Seiten benutzt.
 *
 * Seit Nitros Routen-Typisierung aus ist (packages/core/nuxt.config.ts,
 * `types:extend`), leitet `$fetch('/api/…')` seinen Antworttyp nicht mehr aus
 * dem Handler ab. Statt jede Aufrufstelle ihre eigene Form erfinden zu lassen,
 * steht die Form EINMAL hier und wird an beiden Enden verlangt:
 *
 *   - der Handler annotiert `): Promise<LoginResponse>` — er kann die Form
 *     also nicht mehr versehentlich ändern,
 *   - die Aufrufstelle schreibt `$fetch<LoginResponse>(…)`.
 *
 * Das ist STRENGER als das, was die Ableitung vorher geliefert hat: `$fetch<T>`
 * hat den Handler NIE gegengeprüft (`TypedInternalResponse` kürzt bei
 * angegebenem `T` sofort auf `T` ab). Ein geteilter Typ prüft beide Seiten.
 *
 * Domain-Types gehören nach `shared/types/`, nie nach `app/types/` — der Server
 * sieht sie sonst nicht (CLAUDE.md).
 */

import type { DashboardNavPrefs } from '../dashboardNav'

/** POST /api/auth/login */
export interface LoginResponse {
  ok: true
  /** true = erste Stufe steht, der zweite Faktor fehlt noch. */
  mfaRequired: boolean
}

/**
 * POST /api/auth/otp/verify — dieselbe Form wie der Passwort-Login, aus
 * demselben Grund: auch nach dem richtigen E-Mail-Code kann Appwrite noch
 * einen zweiten Faktor verlangen (Befund 2026-10-24, prod).
 */
export interface OtpVerifyResponse {
  ok: true
  /** true = der Code saß, der zweite Faktor fehlt noch. */
  mfaRequired: boolean
}

/** GET /api/auth/mfa/status */
export interface MfaStatusResponse {
  enabled: boolean
  totpVerified: boolean
  /** Ob noch ungenutzte Wiederherstellungs-Codes existieren (nie die Codes selbst). */
  hasRecoveryCodes: boolean
}

/** POST /api/auth/mfa/setup */
export interface MfaSetupResponse {
  secret: string
  uri: string
  /** QR-Code als Data-URI. */
  qr: string
}

/** POST /api/auth/mfa/verify */
export interface MfaVerifyResponse {
  ok: true
  /** Genau EINMAL gezeigt — danach gibt sie keine Route mehr heraus. */
  recoveryCodes: string[]
}

/** POST /api/auth/mfa/disable */
export interface MfaDisableResponse {
  ok: true
}

/**
 * PUT /api/auth/timezone
 *
 * Die Route gibt die GESPEICHERTE Zone zurück, nicht die geschickte: '' ist
 * hier ein gültiger Wert und heisst „automatisch" (shared/timezone.ts).
 */
export interface TimezoneResponse {
  ok: true
  timezone: string
}

/**
 * PUT /api/auth/dashboard-nav
 *
 * `dashboardNav: null` ist die Antwort auf das Zurücksetzen — der Schlüssel
 * wurde aus den Prefs ENTFERNT, nicht auf `{}` gesetzt. Die Route gibt den
 * GESPEICHERTEN Stand zurück, nicht den geschickten: leere Listen fallen beim
 * Lesen weg (parseDashboardNavPrefs), und der Client soll denselben Stand
 * sehen wie die Seitenleiste nach `auth.refresh()`.
 */
export interface DashboardNavResponse {
  ok: true
  dashboardNav: DashboardNavPrefs | null
}
