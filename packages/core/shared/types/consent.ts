/**
 * Typen der festgehaltenen Zustimmung (SEC-008/SEC-007). Regeln:
 * `shared/consent.ts` (pur), `server/utils/consentRecords.ts` (Tabelle
 * `consent_records`, nur Admin-Client), Tür: `server/middleware/07.consent-required.ts`.
 */

/**
 * Wozu zugestimmt wurde: AGB, die Unternehmer-Bestätigung oder die
 * Bedingungen für Community-Betreiber (`operator`, seit 2026-11-16). Die
 * Betreiber-Bedingungen verlangt KEINE App über `requiredConsents` — sie
 * werden nur beim Anlegen einer Community geprüft (onboarding-Layer,
 * `pukalani.onboarding.operatorTerms`), nie von der Tür.
 */
export type ConsentKind = 'terms' | 'business' | 'operator'

/**
 * Die Arten, die eine App über `pukalani.auth` verlangen kann und die die Tür
 * (`07.consent-required.ts`) prüft. `operator` gehört bewusst nicht dazu —
 * so kann `requiredConsents` sie schon vom Typ her nicht liefern.
 */
export type GatedConsentKind = Exclude<ConsentKind, 'operator'>

/**
 * Wie die Zustimmung festgehalten wurde:
 *  - `password` | `otp` | `oauth` — bei der Anlage, auf diesem Weg,
 *  - `prompt` — nachgeholt über die Nachfrage,
 *  - `adopted` — aus dem Bestand (Konto-Prefs) übernommen, vom Server damals
 *    nicht geprüft,
 *  - `wizard` — beim Anlegen einer Community im Wizard bestätigt (nur für
 *    `operator`).
 */
export type ConsentWay = 'password' | 'otp' | 'oauth' | 'prompt' | 'adopted' | 'wizard'

/** Eine Zustimmung, die eine App verlangt — mit der aktuellen Fassung. */
export interface RequiredConsent {
  kind: GatedConsentKind
  /** Fassung der Texte; `''` = die App nennt keine (Unternehmer-Bestätigung immer `''`). */
  version: string
}

/** Antwort von `GET`/`POST /api/auth/consent`. */
export interface ConsentStateResponse {
  required: RequiredConsent[]
  missing: ConsentKind[]
  termsUrl: string
}

/** Eine Zeile der Tabelle `consent_records`. */
export interface ConsentRecordData {
  userId: string
  kind: ConsentKind
  version: string
  acceptedAt: string
  way: ConsentWay
  source: string
}
