/**
 * BEDINGUNGEN FÜR COMMUNITY-BETREIBER (seit 2026-11-16, Davids Auftrag:
 * „betreiber benötigen eigene agb's, die sie per kästchen bestätigen müssen,
 * wenn sie eine neue community bei uns starten").
 *
 * PURE und ohne Nuxt — dieselben Regeln lesen die Seite
 * (`pages/start/community.vue`) und die Anlage-Route
 * (`server/api/onboarding/site.post.ts`).
 *
 * ── DER SCHALTER ─────────────────────────────────────────────────────────
 * `pukalani.onboarding.operatorTerms` (app.config). Layer-Default: beide
 * Adressen leer ⇒ AUS — kein Kästchen, keine Prüfung, keine Zeile. Die
 * Platform-App schaltet ihn ein.
 *
 * ── NUR BEIM ANLEGEN, NIE AN DER TÜR ─────────────────────────────────────
 * Die Bedingungen gelten für Konten, die eine Community anlegen — nicht für
 * jedes Mitglied. Deshalb laufen sie bewusst NICHT über
 * `pukalani.auth.termsUrl`/`requiredConsents` (die Tür fragte sonst jedes
 * Mitglied jeder Community), sondern allein über die Anlage-Route.
 *
 * ── DAS FELD REIST NICHT INS CONTROL PLANE ───────────────────────────────
 * Platform und Control Plane werden getrennt ausgerollt, und das Schema dort
 * ist `.strict()`: ein neues Feld im Umschlag beantwortete ein älteres
 * Control Plane mit 400. Geprüft und festgehalten wird hier, auf der
 * Platform-Seite; `splitOperatorTerms` nimmt das Feld IMMER ab — auch wenn
 * der Schalter aus ist.
 */

/** Grund im 400, wenn das Kästchen fehlt (der zentrale Handler hebt ihn als `reason`). */
export const OPERATOR_TERMS_REQUIRED_CODE = 'operator_terms_required'

/** Das Feld im Body der Anlage-Route. */
export const OPERATOR_TERMS_FIELD = 'operatorTerms'

export type OperatorTermsLocale = 'de' | 'en'

/** `pukalani.onboarding.operatorTerms` — so, wie es in der app.config steht. */
export interface OperatorTermsConfig {
  /** Absolute Adresse des Textes je Sprache; beide leer = aus. */
  url?: Partial<Record<OperatorTermsLocale, string>>
  /** Die aktuelle Fassung — landet in `consent_records.version` (höchstens 64 Zeichen). */
  version?: string
  /** true = Entwurf: das Kästchen zeigt den Entwurfs-Hinweis. */
  draft?: boolean
}

/** Der wirksame Zustand: `null` = aus. */
export interface OperatorTerms {
  url: Record<OperatorTermsLocale, string>
  version: string
  draft: boolean
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Liest die Config. AN ist der Schalter, sobald EINE Adresse gesetzt ist;
 * fehlt die andere Sprache, zeigt sie auf dieselbe.
 */
export function resolveOperatorTerms(config: OperatorTermsConfig | null | undefined): OperatorTerms | null {
  const de = trimmed(config?.url?.de)
  const en = trimmed(config?.url?.en)
  if (!de && !en) return null
  return {
    url: { de: de || en, en: en || de },
    version: trimmed(config?.version).slice(0, 64),
    draft: config?.draft === true,
  }
}

/** Die Adresse für die Sprache der Oberfläche (unbekannte Sprache ⇒ Englisch). */
export function operatorTermsHref(terms: OperatorTerms, locale: string): string {
  return locale === 'de' ? terms.url.de : terms.url.en
}

/**
 * Nimmt das Kästchen vom Body ab. `accepted` ist nur bei genau `true` wahr;
 * `rest` ist der Body OHNE das Feld (ein Nicht-Objekt bleibt unverändert,
 * das Schema lehnt es danach ab).
 */
export function splitOperatorTerms(body: unknown): { accepted: boolean, rest: unknown } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { accepted: false, rest: body }
  }
  const { [OPERATOR_TERMS_FIELD]: flag, ...rest } = body as Record<string, unknown>
  return { accepted: flag === true, rest }
}
