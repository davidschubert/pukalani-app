import { z } from 'zod'
import {
  BRAND_PUBLICATION_DEFAULT_FILTER,
  BRAND_PUBLICATION_FILTERS,
  BRAND_PUBLICATION_NOTE_MAX,
  BRAND_PUBLICATION_REPORT_DEFAULT_FILTER,
  BRAND_PUBLICATION_REPORT_EMAIL_MAX,
  BRAND_PUBLICATION_REPORT_FILTERS,
  BRAND_PUBLICATION_REPORT_REASON_MAX,
  BRAND_PUBLICATION_REPORT_REASON_MIN,
} from '../shared/brandPublication'

/**
 * DIE RÜMPFE UND ABFRAGEN DER MODERATION (docs/plans/DISCOVER-BRANDS.md §4.4,
 * §6 — Paket D3).
 *
 * Die REGELN (Zustände, Deckel, Fenster) stehen pur in
 * `shared/brandPublication.ts`; hier steht nur, wie sie an der Kante gemessen
 * werden. Dieselbe Arbeitsteilung wie zwischen `shared/brandCheckCorrections.ts`
 * und dem Korrektur-Teil von `schemas/brandCheck.ts`.
 */

export const BRAND_PUBLICATION_PAGE_DEFAULT = 50
export const BRAND_PUBLICATION_PAGE_MAX = 100

/**
 * DIE ABFRAGE DER BETREIBER-LISTE. Wie bei der Warteliste ohne `.strict()`
 * (eine Query trägt Fremdes mit) und mit einem Deckel, den der Aufrufer nicht
 * heben kann — `Query.limit()` ist in diesem Repo Pflicht, und ein frei
 * wählbares Limit wäre ein Deckel, der keiner ist.
 */
export function createBrandPublicationListQuerySchema() {
  return z.object({
    status: z.enum(BRAND_PUBLICATION_FILTERS).default(BRAND_PUBLICATION_DEFAULT_FILTER),
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_PUBLICATION_PAGE_MAX)
      .default(BRAND_PUBLICATION_PAGE_DEFAULT),
  })
}

export type BrandPublicationListQuery
  = z.output<ReturnType<typeof createBrandPublicationListQuerySchema>>

/**
 * ABLEHNEN UND AUSBLENDEN: DIE BEGRÜNDUNG IST PFLICHT.
 *
 * Anders als beim Korrekturvorschlag, wo ein leerer String gilt. Hier SIEHT
 * der Kunde den Satz in seiner Leseansicht (§3.4, Entscheidung 8 „Ausblenden
 * mit Begründung"), und eine Ablehnung ohne Satz wäre für ihn eine
 * geschlossene Tür ohne Klinke: er weiss nicht, was zu ändern ist, und reicht
 * dasselbe noch einmal ein. `min(1)` NACH dem `trim()` — ein Feld voller
 * Leerzeichen ist keine Begründung.
 *
 * `.strict()`, weil dieses Formular genau ein Feld schickt: käme ein `status`
 * mit, wäre das ein Versuch, die Zustands-Regeln über die Notiz zu umgehen.
 */
export function createBrandPublicationDecisionSchema() {
  return z.object({
    decisionNote: z.string().trim().min(1).max(BRAND_PUBLICATION_NOTE_MAX),
  }).strict()
}

export type BrandPublicationDecisionInput
  = z.output<ReturnType<typeof createBrandPublicationDecisionSchema>>

/**
 * DIE ZWEI SCHALTER (Brand of the Day, Beispiel-Badge).
 *
 * Ein ausdrückliches Boolean statt zweier Routen („feature"/„unfeature"): der
 * Schalter in der Oberfläche kennt seine Stellung, und ein `POST …/feature`
 * ohne Rumpf müsste sie erraten — womit zwei schnelle Klicks in beliebiger
 * Reihenfolge landeten. Getrennte Rümpfe für die zwei Schalter, weil sie zwei
 * verschiedene Fragen sind und ein gemeinsames `{ value: boolean }` an der
 * Aufrufstelle nicht mehr sagte, worum es geht.
 */
export function createBrandPublicationFeatureSchema() {
  return z.object({ featured: z.boolean() }).strict()
}

export function createBrandPublicationExampleSchema() {
  return z.object({ example: z.boolean() }).strict()
}

/**
 * DER RUMPF EINER MELDUNG (§3.4, §6) — die dritte öffentliche Schreibroute
 * dieses Layers, und wie die zwei davor ohne jeden Beweis.
 *
 * Sie MUSS es sein: gemeldet wird von jemandem, der eine fremde Marke sieht,
 * und der hat hier kein Konto. Ein Gate davor wäre derselbe Zirkel wie bei der
 * Warteliste — und eine Meldewege, der eine Anmeldung kostet, wird nicht
 * benutzt.
 *
 * ── DER GRUND IST PFLICHT, DIE ADRESSE NICHT ──────────────────────────────
 * Begründung an den Konstanten in `shared/brandPublication.ts`. Die Adresse
 * bleibt freiwillig: sie ist für die Rückfrage da, nicht für die Meldung.
 *
 * ── `hp` IST DIE FALLE, KEIN DATENFELD ────────────────────────────────────
 * Erlaubt (sonst wiese `.strict()` den Bot mit einem 400 ab und verriete ihm
 * die Falle), in der Route ausgewertet, nie gespeichert.
 */
export const BRAND_PUBLICATION_REPORT_HONEYPOT_MAX = 200

export function createBrandPublicationReportSchema() {
  return z.object({
    reason: z.string().trim()
      .min(BRAND_PUBLICATION_REPORT_REASON_MIN)
      .max(BRAND_PUBLICATION_REPORT_REASON_MAX),
    email: z.union([
      z.literal(''),
      z.string().trim().toLowerCase().max(BRAND_PUBLICATION_REPORT_EMAIL_MAX).pipe(z.email()),
    ]).default(''),
    hp: z.string().max(BRAND_PUBLICATION_REPORT_HONEYPOT_MAX).optional(),
  }).strict()
}

export type BrandPublicationReportInput
  = z.output<ReturnType<typeof createBrandPublicationReportSchema>>

/** Die Abfrage der Melde-Liste — dieselbe Form wie die Veröffentlichungen. */
export function createBrandPublicationReportListQuerySchema() {
  return z.object({
    status: z.enum(BRAND_PUBLICATION_REPORT_FILTERS).default(BRAND_PUBLICATION_REPORT_DEFAULT_FILTER),
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_PUBLICATION_PAGE_MAX)
      .default(BRAND_PUBLICATION_PAGE_DEFAULT),
  })
}

export type BrandPublicationReportListQuery
  = z.output<ReturnType<typeof createBrandPublicationReportListQuerySchema>>
