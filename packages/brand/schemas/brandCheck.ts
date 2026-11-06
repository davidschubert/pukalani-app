import { z } from 'zod'
import { BRAND_SCORE_BANDS } from '../shared/brandCheck'
import {
  BRAND_CHECK_CORRECTION_DEFAULT_FILTER,
  BRAND_CHECK_CORRECTION_FIELDS,
  BRAND_CHECK_CORRECTION_FILTERS,
} from '../shared/brandCheckCorrections'
import {
  BRAND_CHECK_RANKING_DEFAULT_SORT,
  normalizeBrandCheckRankingPage,
  normalizeBrandCheckRankingSort,
} from '../shared/brandCheckRanking'
import { isBrandIndustryValue } from '../shared/brandIndustries'
import { isBrandWebsiteUrl } from '../shared/brandStartCard'
import { normalizeBrandWaitlistWebsite } from './brandWaitlist'

/**
 * DER RUMPF VON `POST /api/brand/check` — die EINZIGE öffentliche Route des
 * Layers, die eine ausgehende Verbindung auslöst UND einen KI-Aufruf bezahlt.
 *
 * ── DAS SCHEMA IST HIER DIE ERSTE SICHERUNG ───────────────────────────────
 * Es gibt kein Konto davor (Davids Hybrid-Zugang: „Score sofort ohne
 * Anmeldung"). Was diese Route also an Grenzen hat, hat sie hier, in der
 * Drossel (`brand:check`, 3/min je IP), in den zwei Tages-Deckeln der Route
 * und im SSRF-Vertrag von `shared/brandSiteAnalysis.ts`. Ein offenes
 * `z.string()` wäre die Einladung, mit einer 10-MB-„Adresse" anzufangen.
 *
 * ── DAS SCHEMA WIRD ERGÄNZT, NICHT NUR GEPRÜFT ────────────────────────────
 * Wer in ein Prüf-Feld „kailua.coffee" tippt, hat die Frage beantwortet.
 * Das fehlende `https://` ergänzt DIESELBE Funktion wie in der Warteliste
 * (`normalizeBrandWaitlistWebsite`) — eine zweite Variante wäre eine, die
 * irgendwann anders normalisiert als die erste. Ein vorhandenes, aber falsches
 * Schema (`ftp://`) bleibt stehen, damit die Prüfung darunter es ABLEHNEN kann.
 *
 * ── `hp` IST DIE FALLE, KEIN DATENFELD ────────────────────────────────────
 * Dasselbe Muster wie in der Warteliste: erlaubt (sonst wiese `.strict()` den
 * Bot mit einem 400 ab und verriete ihm die Falle), in der Route ausgewertet,
 * nie gespeichert.
 */

/**
 * 512 ist der Deckel der Spalte `brand_checks.url`; 4 ist die kürzeste
 * Zeichenkette, aus der nach dem Ergänzen des Schemas überhaupt eine Adresse
 * mit Punkt werden kann (`a.de`).
 */
export const BRAND_CHECK_URL_MIN = 4
export const BRAND_CHECK_URL_MAX = 512
export const BRAND_CHECK_HONEYPOT_MAX = 256

/** http(s), parsebar UND mit einem Punkt im Hostnamen (wie die Warteliste). */
export function isBrandCheckUrl(value: string): boolean {
  if (!isBrandWebsiteUrl(value)) return false
  try {
    return new URL(value).hostname.includes('.')
  }
  catch {
    return false
  }
}

export function createBrandCheckSchema() {
  return z.object({
    url: z.string().trim()
      .min(BRAND_CHECK_URL_MIN, { message: 'brand.validation.websiteUrl' })
      .max(BRAND_CHECK_URL_MAX, { message: 'brand.validation.websiteUrl' })
      .transform(normalizeBrandWaitlistWebsite)
      // Nach dem Ergänzen kann der Wert acht Zeichen länger sein als die
      // Eingabe — die Spalte fasst 512, also wird HIER erneut gemessen.
      .refine(value => value.length <= BRAND_CHECK_URL_MAX, { message: 'brand.validation.websiteUrl' })
      .refine(isBrandCheckUrl, { message: 'brand.validation.websiteUrl' }),
    // Die Sprache der FRAGENDEN Seite. Sie entscheidet über die Sprache der
    // Ergebnis-Seite, NICHT über die der Belege: ein Zitat spricht die Sprache
    // der geprüften Seite, sonst wäre es kein Zitat mehr (Plan §2).
    locale: z.enum(['de', 'en']).default('en'),
    /**
     * DAS HÄKCHEN „INS RANKING AUFNEHMEN" (Davids Entscheidung 1 vom
     * 2026-09-05). Default AUS — ein Check ist bis zum Widerspruch PRIVAT
     * (teilbare Adresse, `noindex`), und ein Default AN wäre ein Ranking, in
     * das jeder Auftritt gerät, den irgendwer einmal eingetippt hat.
     */
    rankingOptIn: z.boolean().default(false),
    /**
     * „NEU ERMITTELN" — den Sieben-Tage-Zwischenspeicher überspringen (§5,
     * §8.4). Wirkt NUR mit Konto und bucht dann vom Konto-Deckel (10/Tag);
     * ein Gast bekommt schlicht den gewöhnlichen Check
     * (`decideBrandCheckMode`, `shared/brandAiLimits.ts`).
     */
    force: z.boolean().default(false),
    /**
     * Die eigene Brand, zu der dieser Check gehört (§5 „Meine Brands"). Sie
     * wird NUR übernommen, wenn der eingeloggte Mensch das Profil besitzt —
     * geprüft in der Route über `loadOwnedProfile`, nicht hier: ein Schema
     * kann eine Länge messen, keinen Besitz. 64 ist die Spaltengrösse.
     */
    profileId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    hp: z.string().max(BRAND_CHECK_HONEYPOT_MAX).optional(),
  }).strict()
}

export type BrandCheckInput = z.output<ReturnType<typeof createBrandCheckSchema>>

/**
 * DER RUMPF DES DOKUMENT-CHECKS (`POST /api/brand/profiles/:id/check`, §5b).
 *
 * Es gibt hier KEINE Adresse und keinen Honigtopf: die Route liegt hinter
 * `requireBrandAccess` und `loadOwnedProfile`, das Material sind die eigenen
 * bestätigten Felder. Was bleibt, sind dieselben zwei Entscheidungen wie beim
 * Website-Check — das Ranking-Häkchen (Default AUS, §8.1) und „neu ermitteln"
 * (§8.4).
 *
 * `force` wirkt hier IMMER, wo es beim Website-Check nur mit Konto wirkt: ohne
 * Konto gibt es diese Route gar nicht. Gebucht wird deshalb ausnahmslos der
 * Konto-Deckel (10/Tag) — ein Dokument-Check ist ein KI-Aufruf wie jeder
 * andere, und einen Anschluss-Deckel für eine Route mit Session gäbe es nicht
 * zu umgehen, sondern nur zu verwechseln.
 */
export function createBrandDocumentCheckSchema() {
  return z.object({
    rankingOptIn: z.boolean().default(false),
    force: z.boolean().default(false),
  }).strict()
}

export type BrandDocumentCheckInput = z.output<ReturnType<typeof createBrandDocumentCheckSchema>>

/**
 * DIE ANTWORT DES MODELLS auf die beurteilten Kriterien (Plan §2).
 *
 * ── JE EINTRAG GEPRÜFT, NICHT DIE GANZE LISTE ─────────────────────────────
 * Bewusst KEIN Schema über das ganze Array: fiele die Antwort als Ganzes
 * durch, weil EIN Eintrag eine `score: 3` trägt, verlöre der Check 23 gültige
 * Urteile wegen eines Ausrutschers — und der Mensch bekäme einen leeren
 * Bericht statt eines fast vollständigen. Der Aufrufer prüft deshalb Eintrag
 * für Eintrag; was durchfällt, ist „nicht bewertbar" (`null`), nicht 0.
 *
 * `id` wird hier NICHT gegen den Katalog geprüft — das tut der Aufrufer, der
 * ihn kennt. Hier steht nur die FORM.
 */
export const BRAND_CHECK_JUDGE_EVIDENCE_MAX = 160
export const BRAND_CHECK_JUDGE_NOTE_MAX = 240

export function createBrandCheckJudgementSchema() {
  return z.object({
    id: z.string().trim().min(1).max(8),
    // `z.coerce` wäre hier falsch: ein Modell, das "2" als Zeichenkette
    // schickt, hat die Form verfehlt — und aus einem "zwei" würde `NaN`, aus
    // einem "" eine 0. Lieber ein Eintrag weniger als eine erfundene Note.
    score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    // Der BELEG ist Pflicht: ein Urteil ohne Zitat ist genau das „gefühlt",
    // gegen das der ganze Check gebaut ist (Plan §2).
    evidence: z.string().trim().min(1).max(BRAND_CHECK_JUDGE_EVIDENCE_MAX * 4)
      .transform(value => value.slice(0, BRAND_CHECK_JUDGE_EVIDENCE_MAX)),
    note: z.string().trim().max(BRAND_CHECK_JUDGE_NOTE_MAX * 4)
      .transform(value => value.slice(0, BRAND_CHECK_JUDGE_NOTE_MAX))
      .default(''),
  })
}

export type BrandCheckJudgementInput = z.output<ReturnType<typeof createBrandCheckJudgementSchema>>

/**
 * ── DIE ÖFFENTLICHE LESEANSICHT UND DIE BETREIBER-SEITE DERSELBEN TABELLE ──
 *
 * Ab hier beschreibt diese Datei nicht mehr den Anstoss eines Checks, sondern
 * das Ranking (§3), den Korrekturvorschlag (§3b) und die zwei Betreiber-Wege
 * (§3b, §7). Die Schemas stehen trotzdem hier und nicht in einer zweiten
 * Datei: es ist DIESELBE Tabelle, und die Deckel müssen zu denselben Spalten
 * passen — zwei Dateien hiessen zwei Orte, an denen jemand eine Spaltengrösse
 * nachpflegen müsste (dieselbe Begründung wie in `schemas/brandWaitlist.ts`).
 */

/**
 * DIE ABFRAGE DES RANKINGS.
 *
 * `.strict()` ist hier BEWUSST NICHT gesetzt: eine öffentliche, teilbare
 * Adresszeile trägt regelmässig Fremdes mit sich (`utm_*` aus einem
 * Newsletter, Cache-Brecher eines Proxys), und ein 400 darauf wäre eine
 * Fehlfunktion ohne Angreifer.
 *
 * ── UNBEKANNTES WIRD GEZOGEN, NICHT ABGEWIESEN ────────────────────────────
 * `?industry=agentur`, `?sort=quatsch`, `?page=` — alles drei sind Bedienspuren
 * (ein alter Link, ein leeres Formularfeld), keine Angriffe. Sie werden auf
 * einen gültigen Wert gezogen (kein Filter / Standard-Sortierung / Seite 1),
 * statt eine Seite zu zeigen, die nach einem Fehler aussieht. Die WAHRHEIT
 * über die gültigen Werte steht dabei in den Katalogen und nicht hier —
 * `.transform` schlägt dort nach.
 */
export function createBrandCheckRankingQuerySchema() {
  return z.object({
    industry: z.string().trim().toLowerCase().max(40).default('')
      .transform(value => (isBrandIndustryValue(value) ? value : '')),
    band: z.string().trim().toLowerCase().max(32).default('')
      .transform(value => (BRAND_SCORE_BANDS.includes(value) ? value : '')),
    sort: z.string().trim().max(32).default(BRAND_CHECK_RANKING_DEFAULT_SORT)
      .transform(normalizeBrandCheckRankingSort),
    page: z.union([z.string(), z.number()]).optional()
      .transform(normalizeBrandCheckRankingPage),
  })
}

export type BrandCheckRankingQuery = z.output<ReturnType<typeof createBrandCheckRankingQuerySchema>>

/** Der Deckel der Begründung = die Spaltengrösse aus brand-017. */
export const BRAND_CHECK_CORRECTION_REASON_MAX = 300
export const BRAND_CHECK_CORRECTION_PROPOSED_MAX = 120
export const BRAND_CHECK_CORRECTION_EMAIL_MAX = 254
export const BRAND_CHECK_CORRECTION_NOTE_MAX = 300

/**
 * DER RUMPF EINES KORREKTURVORSCHLAGS (§3b) — die zweite öffentliche
 * Schreibroute des Layers nach der Warteliste, und wie diese ohne jeden
 * Beweis davor.
 *
 * ── DER VORSCHLAG WIRD GEGEN DEN KATALOG GEMESSEN, NICHT NUR GEDECKELT ────
 * `field: 'industry'` ⇒ `proposed` MUSS eine Branchen-Id sein. Ein freier Text
 * wäre genau das, was der geschlossene Katalog verhindern soll: dann stünde
 * nach der ersten Annahme „Agentur & Beratung" in einer Spalte, nach der
 * gefiltert wird. Die Prüfung hängt am FELD und nicht am Schema-Rumpf, damit
 * ein zweites Feld später eine Entscheidung an dieser Stelle erzwingt.
 *
 * ── `hp` IST DIE FALLE, KEIN DATENFELD ────────────────────────────────────
 * Dasselbe Feld und dieselbe Begründung wie beim Check und bei der Warteliste:
 * erlaubt (sonst wiese `.strict()` den Bot mit einem 400 ab und verriete ihm
 * die Falle), in der Route ausgewertet, nie gespeichert. Der Plan nennt es
 * „`website`-Feld wie die Warteliste" — die Warteliste hat dort ein ECHTES
 * Datenfeld `website` und ihren Honigtopf in `hp`; wir folgen dem Muster, das
 * im Code steht, nicht dem Namen im Plan.
 */
export function createBrandCheckCorrectionSchema() {
  return z.object({
    field: z.enum(BRAND_CHECK_CORRECTION_FIELDS),
    proposed: z.string().trim().toLowerCase().min(1).max(BRAND_CHECK_CORRECTION_PROPOSED_MAX),
    reason: z.string().trim().max(BRAND_CHECK_CORRECTION_REASON_MAX).default(''),
    // Freiwillig. Leer ist ein gültiger Wert — wer nichts hinterlassen will,
    // soll trotzdem melden dürfen; nur eine ANGEGEBENE Adresse muss eine sein.
    email: z.union([
      z.literal(''),
      z.string().trim().toLowerCase().max(BRAND_CHECK_CORRECTION_EMAIL_MAX).pipe(z.email()),
    ]).default(''),
    hp: z.string().max(BRAND_CHECK_HONEYPOT_MAX).optional(),
  }).strict().refine(
    value => value.field !== 'industry' || isBrandIndustryValue(value.proposed),
    { path: ['proposed'], message: 'brand.validation.industry' },
  )
}

export type BrandCheckCorrectionInput = z.output<ReturnType<typeof createBrandCheckCorrectionSchema>>

/**
 * DIE ABFRAGE DER BETREIBER-LISTE. Wie bei der Warteliste ohne `.strict()`
 * (eine Query trägt Fremdes) und mit einem Deckel, den der Aufrufer nicht
 * heben kann — `Query.limit()` ist in diesem Repo Pflicht, und ein frei
 * wählbares Limit wäre ein Deckel, der keiner ist.
 */
export const BRAND_CHECK_CORRECTION_PAGE_DEFAULT = 50
export const BRAND_CHECK_CORRECTION_PAGE_MAX = 100

export function createBrandCheckCorrectionListQuerySchema() {
  return z.object({
    status: z.enum(BRAND_CHECK_CORRECTION_FILTERS).default(BRAND_CHECK_CORRECTION_DEFAULT_FILTER),
    cursor: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).default(''),
    limit: z.coerce.number().int().min(1).max(BRAND_CHECK_CORRECTION_PAGE_MAX)
      .default(BRAND_CHECK_CORRECTION_PAGE_DEFAULT),
  })
}

export type BrandCheckCorrectionListQuery
  = z.output<ReturnType<typeof createBrandCheckCorrectionListQuerySchema>>

/**
 * DIE ABLEHNUNG. Die Begründung ist FREIWILLIG (ein leerer String ist gültig),
 * aber sie hat einen eigenen Rumpf statt eines leeren POST: sie ist das, was
 * den Vorschlagenden von einer stillen Ablehnung unterscheidet, und ein Feld,
 * das man nur über eine zweite Route nachtragen kann, wird nie ausgefüllt.
 *
 * `.strict()`, weil dieses Formular genau ein Feld schickt: käme ein `status`
 * mit, wäre das ein Versuch, die Zustands-Regeln
 * (`shared/brandCheckCorrections.ts`) über die Notiz zu umgehen.
 */
export function createBrandCheckCorrectionDeclineSchema() {
  return z.object({
    decisionNote: z.string().trim().max(BRAND_CHECK_CORRECTION_NOTE_MAX).default(''),
  }).strict()
}

export type BrandCheckCorrectionDeclineInput
  = z.output<ReturnType<typeof createBrandCheckCorrectionDeclineSchema>>

/**
 * DER ENTFERNEN-WEG DES BETREIBERS (§3 „Recht", §7): ein Schalter, kein
 * Löschen. Die Zeile bleibt stehen — sie ist der Beleg dafür, was wann
 * behauptet wurde, und ein gelöschter Check käme beim nächsten Aufruf
 * derselben Adresse frisch zurück.
 *
 * `hidden` ist PFLICHT und hat keinen Default: „ausblenden" und „wieder
 * einblenden" sind zwei Handlungen, und ein Default machte eine davon zum
 * Zufall.
 */
export function createBrandCheckHiddenSchema() {
  return z.object({
    hidden: z.boolean(),
  }).strict()
}

export type BrandCheckHiddenInput = z.output<ReturnType<typeof createBrandCheckHiddenSchema>>
