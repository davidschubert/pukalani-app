/**
 * Typen der festgehaltenen Zustimmung (SEC-008/SEC-007). Regeln:
 * `shared/consent.ts` (pur), `server/utils/consentRecords.ts` (Tabelle
 * `consent_records`, nur Admin-Client), Tür: `server/middleware/07.consent-required.ts`.
 */

/** Wozu zugestimmt wurde: AGB oder die Unternehmer-Bestätigung. */
export type ConsentKind = 'terms' | 'business'

/**
 * Wie die Zustimmung festgehalten wurde:
 *  - `password` | `otp` | `oauth` — bei der Anlage, auf diesem Weg,
 *  - `prompt` — nachgeholt über die Nachfrage,
 *  - `adopted` — aus dem Bestand (Konto-Prefs) übernommen, vom Server damals
 *    nicht geprüft.
 */
export type ConsentWay = 'password' | 'otp' | 'oauth' | 'prompt' | 'adopted'

/** Eine Zustimmung, die eine App verlangt — mit der aktuellen Fassung. */
export interface RequiredConsent {
  kind: ConsentKind
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
