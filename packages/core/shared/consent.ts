import type { ConsentKind, ConsentWay, RequiredConsent } from './types/consent'
import { isRole } from './authz'

/**
 * BETREIBER-KONTEN SIND AUSGENOMMEN (Davids Entscheidung 2026-11-16: „Konten
 * mit Betreiber-Rolle werden nie gefragt und nie gesperrt"). Die AGB gelten für
 * Kundinnen und Kunden, nicht für den Betreiber selbst — und eine Tür, die den
 * Betreiber aus seiner eigenen Konsole sperren kann, wäre ein Betriebsrisiko.
 *
 * „Betreiber-Rolle" ist genau das, was `authz.ts` als Rolle kennt (die
 * globalen Labels `admin` und `moderator`). Community-Labels und Community-
 * Rollen (Owner, Admin einer Community) sind KEINE Betreiber-Rolle: wer eine
 * Community führt, ist Kunde.
 */
export function isOperatorAccount(labels: readonly string[] | null | undefined): boolean {
  return (labels ?? []).some(label => isRole(label))
}

/**
 * DIE ZUSTIMMUNG IST EINE TATSACHE AM SERVER (SEC-008, Davids Entscheidung
 * 2026-11-12: „Die Zustimmung zu den AGB wird vom Server geprüft und an einer
 * Stelle festgehalten, die das Konto nicht selbst ändern kann.")
 *
 * Der pure Teil: welche Zustimmungen eine App verlangt, wie der Weg heißt,
 * das kurzlebige Merkzeichen für den Google-Weg und die Übernahme aus dem
 * Bestand. Schreiber und Leser: `server/utils/consentRecords.ts`; Tür:
 * `server/middleware/07.consent-required.ts` mit der Liste in
 * `shared/consentGate.ts`.
 *
 * ── WO DER NACHWEIS LIEGT ────────────────────────────────────────────────
 * In der Tabelle `consent_records` (system-041): keine Rechte für Konten,
 * gelesen und geschrieben nur mit dem Admin-Client. Die Prefs-Felder
 * (`termsAcceptedAt`, `termsVersion`, `businessConfirmedAt`) werden weiter
 * geschrieben, sie gehören aber dem Konto und belegen nichts — sie sind nur
 * noch die Quelle der einmaligen Übernahme (`adoptedConsentAt`).
 *
 * ── EINE ZEILE ENTSTEHT NUR, WENN DER SERVER DIE BESTÄTIGUNG GESEHEN HAT ─
 * Passwort-Anlage: `terms: true` (und `business: true`) im Body, sonst 400.
 * Code-Anmeldung: dieselben Felder im Body beim ersten Beitritt, sonst keine
 * Zeile. Google: das Merkzeichen `pk_consent`, das das Formular unmittelbar
 * vor dem Start setzt. Nachfrage: `POST /api/auth/consent`.
 */

/** `pukalani.auth.*`, soweit die Zustimmung davon abhängt. */
export interface ConsentConfig {
  /** gesetzt = diese App verlangt die AGB */
  termsUrl?: string
  /** die aktuelle Fassung; leer erlaubt */
  termsVersion?: string
  /** true = diese App verlangt die Unternehmer-Bestätigung */
  businessOnly?: boolean
}

/** Der Grund im 403 der Tür (der zentrale Fehler-Handler hebt ihn als `reason`). */
export const CONSENT_REQUIRED_CODE = 'consent_required'

/** Ablehnung der Passwort-Anlage ohne AGB-Bestätigung im Body. */
export const TERMS_REQUIRED_CODE = 'terms_required'

/** Ablehnung der Passwort-Anlage ohne Unternehmer-Bestätigung im Body. */
export const BUSINESS_REQUIRED_CODE = 'business_required'

/**
 * Konten, die NACH diesem Zeitpunkt angelegt wurden, müssen eine vom Server
 * geschriebene Zeile haben — für sie wird aus den Prefs nichts übernommen.
 * Davor angelegte Konten konnten die Zustimmung nur in den Prefs tragen
 * (vor SEC-008 gab es keinen anderen Ort); deren Vermerk wird einmal als
 * `adopted` übernommen. Fest im Code, damit kein Schalter die Grenze
 * verschiebt.
 */
export const CONSENT_ADOPTION_CUTOVER = '2026-11-18T00:00:00.000Z'

/** Name des kurzlebigen Merkzeichens für den Google-Weg. */
export const CONSENT_COOKIE = 'pk_consent'

/** Lebensdauer des Merkzeichens: zehn Minuten reichen für den Weg zum Anbieter und zurück. */
export const CONSENT_COOKIE_MAX_AGE_S = 600

const KINDS: readonly ConsentKind[] = ['terms', 'business']

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Welche Zustimmungen DIESE App verlangt, mit der aktuellen Fassung. Leer =
 * die App verlangt nichts (Core-Default) — dann gibt es keine Tür, keine
 * Nachfrage und keinen Netzaufruf.
 */
export function requiredConsents(config: ConsentConfig | undefined): RequiredConsent[] {
  const required: RequiredConsent[] = []
  if (trimmed(config?.termsUrl)) required.push({ kind: 'terms', version: trimmed(config?.termsVersion) })
  if (config?.businessOnly === true) required.push({ kind: 'business', version: '' })
  return required
}

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

/**
 * Der Weg aus dem Pfad der Anfrage, wenn der Aufrufer ihn nicht nennt. Nur
 * die drei Anlage-Routen haben einen; alles andere ist `null`.
 */
export function consentWayFromPath(path: string): ConsentWay | null {
  const clean = path.split('?')[0] ?? ''
  if (clean.includes('/auth/oauth/')) return 'oauth'
  if (clean.includes('/auth/otp/')) return 'otp'
  if (clean.endsWith('/auth/signup')) return 'password'
  return null
}

/** Wert des Merkzeichens aus den bestätigten Arten, z. B. `terms.business`. */
export function formatConsentCookie(kinds: readonly ConsentKind[]): string {
  return KINDS.filter(kind => kinds.includes(kind)).join('.')
}

/** Liest das Merkzeichen; Unbekanntes wird ignoriert. */
export function parseConsentCookie(value: string | undefined | null): ConsentKind[] {
  if (typeof value !== 'string' || value.length > 64) return []
  const parts = value.split('.')
  return KINDS.filter(kind => parts.includes(kind))
}

export interface AdoptionInput {
  kind: ConsentKind
  /** die aktuelle Fassung der App */
  version: string
  /** Prefs des Kontos */
  prefs: Record<string, unknown> | undefined
  /** `$createdAt` des Kontos */
  accountCreatedAt: string | undefined
  /** nur für Tests; sonst `CONSENT_ADOPTION_CUTOVER` */
  cutover?: string
}

/**
 * ÜBERNAHME AUS DEM BESTAND („übernimm, was da ist, und kennzeichne es als
 * übernommen"). Liefert den Zeitpunkt der alten Zustimmung, oder `null`.
 *
 * Übernommen wird nur, wenn
 *  1. das Konto VOR `CONSENT_ADOPTION_CUTOVER` angelegt wurde (danach muss
 *     eine vom Server geschriebene Zeile existieren),
 *  2. die Prefs einen lesbaren Zeitpunkt tragen,
 *  3. bei den AGB die gespeicherte Fassung der aktuellen gleicht — eine
 *     Zustimmung zu einem anderen Text ist keine zu diesem.
 */
export function adoptedConsentAt(input: AdoptionInput): string | null {
  const created = Date.parse(input.accountCreatedAt ?? '')
  const cutover = Date.parse(input.cutover ?? CONSENT_ADOPTION_CUTOVER)
  if (!Number.isFinite(created) || !Number.isFinite(cutover) || created >= cutover) return null

  const prefs = input.prefs ?? {}
  const raw = input.kind === 'terms' ? trimmed(prefs.termsAcceptedAt) : trimmed(prefs.businessConfirmedAt)
  if (!raw) return null
  if (input.kind === 'terms' && trimmed(prefs.termsVersion) !== input.version) return null

  const at = Date.parse(raw)
  if (!Number.isFinite(at)) return null
  return new Date(at).toISOString()
}
