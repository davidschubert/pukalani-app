import type { Models } from 'node-appwrite'
import type {
  InsightsBrand,
  InsightsBrandRef,
  InsightsDuelFact,
  InsightsFormat,
  InsightsLocale,
  InsightsPost,
  InsightsRanking,
  InsightsSource,
  InsightsTopicKey,
} from './insightsPost'
import {
  INSIGHTS_BRAND_STATES,
  INSIGHTS_FORMATS,
  INSIGHTS_LOCALES,
  INSIGHTS_STATES,
  INSIGHTS_TOPIC_KEYS,
} from './insightsPost'
import type {
  InsightsCorrection,
  InsightsCorrectionKind,
  InsightsCorrectionStatus,
  InsightsCorrectionTargetKind,
} from './insightsCorrection'
import {
  INSIGHTS_CORRECTION_KINDS,
  INSIGHTS_CORRECTION_STATUSES,
  INSIGHTS_CORRECTION_TARGET_KINDS,
} from './insightsCorrection'
import type { InsightsRadarStoredVideo } from './insightsRadar'
import { INSIGHTS_RADAR_TOPIC_FALLBACK } from './insightsRadar'
import type { InsightsChannel } from './insightsChannel'
import { INSIGHTS_CHANNEL_NOTE_MAX } from './insightsChannel'
import type { InsightsVerdict, InsightsWatchItem } from './insightsWatchlist'
import { INSIGHTS_VERDICTS, INSIGHTS_VERDICT_FALLBACK, INSIGHTS_WATCH_NOTE_MAX } from './insightsWatchlist'
import type { InsightsCorrectionListItem } from './types/insightsApi'

/**
 * DER ABLAGE-VERTRAG VON BRAND INSIGHTS (Migrationen insights-001…004,
 * Plan §9.3 und §9.6) — wie ein Beitrag, ein Markenprofil, ein
 * Korrekturvorschlag und ein Radar-Video als Appwrite-ZEILE liegen, und die
 * reine Abbildung in beide Richtungen.
 *
 * ── ZWEI EBENEN, ZWEI DATEIEN (Muster: market) ───────────────────────────
 * `insightsPost.ts` und `insightsCorrection.ts` sind der PRODUKT-Vertrag: was
 * ein Beitrag IST, was eine Quelle mitbringen muss, was vor der Freigabe
 * gilt. Diese Datei ist der ABLAGE-Vertrag. Sie hängt von jenen ab, nie
 * umgekehrt — sonst wanderte die Datenbank in den Produktbegriff (wörtlich
 * derselbe Zuschnitt wie `market/shared/marketProfile.ts` ↔
 * `market/shared/types/market.ts`).
 *
 * ── WARUM SIE IN `shared/` LIEGT UND NICHT IN `server/utils/` ────────────
 * Weil sie PUR ist: kein `H3Event`, kein Appwrite-Client, kein Auto-Import.
 * Nur so lässt sie sich in einem Vitest-Lauf ohne Nitro prüfen — und geprüft
 * werden muss sie, weil hier die Rundreise Zeile ⇄ Vertrag stattfindet und
 * ein stiller Verlust in einer JSON-Spalte sonst erst auf einer öffentlichen
 * Seite auffällt. `server/utils/insightsStore.ts` daneben hält, was einen
 * Request braucht (Client, Database-Id, Tabellennamen).
 *
 * ── DIE JSON-SPALTEN WERDEN FAIL-SOFT GELESEN ───────────────────────────
 * `sources`, `brandRefs`, `facts`, `slugHistory`, `marks`, `history`,
 * `relations` und `topics` sind Zeichenketten in der Datenbank. Was darin
 * steht, hat teils ein MODELL geschrieben (Entwurf, Übersetzung), teils eine
 * ältere Prompt- oder Schema-Fassung. Ein `JSON.parse` ohne Netz liesse eine
 * einzige kaputte Zeile die ganze Redaktionsliste mit einem 500 beenden —
 * und zwar genau die Zeile, die jemand reparieren wollte. Ungültiges JSON
 * ergibt deshalb eine LEERE Liste, nie einen Absturz. Die inhaltliche Prüfung
 * bleibt Sache der Schemas im Produkt-Vertrag; sie läuft dort, wo eine
 * Ablehnung einem Menschen gezeigt werden kann.
 *
 * ── UNBEKANNTE AUFZÄHLUNGSWERTE FALLEN IN DIE SICHERE RICHTUNG ──────────
 * `format`, `state`, `baseLocale`, `targetKind`, `kind` und `status` sind
 * varchars (Begründung in den Migrationsköpfen: die Wahrheit über die
 * erlaubten Werte steht im Code, ein siebter Wert soll keine Migration auf
 * einer laufenden Instanz kosten). Liest ein Leser hier trotzdem etwas
 * Unbekanntes, ist das ein FEHLER — und die Abbildung muss trotzdem eine
 * Antwort geben, sonst kann die Redaktion die kaputte Zeile nicht öffnen, um
 * sie zu reparieren. Der Ersatzwert ist deshalb immer der ENGSTE: `state`
 * fällt auf `draft` (nicht öffentlich), `status` auf `open` (nicht
 * entschieden), `format` auf `article` (das Format ohne Faktenpflicht). Ein
 * Fallback in die andere Richtung würde eine unfertige Zeile veröffentlichen.
 */

// ── Tabellennamen ──────────────────────────────────────────────────────────
// EINMAL, weil eine Zeichenkette in vier Dateien ein Tippfehler in vier
// Dateien ist — und ein falscher Tabellenname in Appwrite ein 404, das wie
// „keine Daten" aussieht. Sie stehen HIER und nicht in `server/utils`, damit
// die Migrationen (die kein Nitro haben) dieselben Namen lesen können.
export const INSIGHTS_POSTS_TABLE = 'insights_posts'
export const INSIGHTS_BRANDS_TABLE = 'insights_brands'
export const INSIGHTS_CORRECTIONS_TABLE = 'insights_corrections'
/** Der Themenradar (insights-004, BI1 I4) — kurzlebig, s. Kopf der Migration. */
export const INSIGHTS_TOPICS_TABLE = 'insights_topics'
/**
 * Die kuratierte Kanalliste (insights-005, BI2 K3) — das genaue GEGENTEIL von
 * `insights_topics`: dort stehen fremde Zahlen, die täglich neu geholt und nach
 * dreissig Tagen gelöscht werden; hier steht eine REDAKTIONELLE Entscheidung,
 * die bleibt, bis ein Mensch sie ändert.
 */
export const INSIGHTS_CHANNELS_TABLE = 'insights_channels'
/**
 * Die eigene Video-Liste (insights-007, BI2 K4) — die EINZIGE Tabelle dieses
 * Layers, in der ein Teil der Zeile bleibt und ein anderer abläuft: das Urteil
 * ist deins, die Zahlen gehören YouTube.
 */
export const INSIGHTS_WATCHLIST_TABLE = 'insights_watchlist'

/** Die Newsletter-Liste (insights-006, BI1 I5a) — eigene Liste, eigenes DOI. */
export const INSIGHTS_SUBSCRIBERS_TABLE = 'insights_subscribers'

/**
 * Das Protokoll eines Versands (insights-008, BI1 I5b) — EINE Zeile je
 * Beitrag, `postId` ist unique. Sie ist der FORTSCHRITTSSTAND, nicht der
 * Bericht: ohne sie bekäme nach einem Abbruch die erste Hälfte der Liste ihre
 * Mail ein zweites Mal.
 */
export const INSIGHTS_SENDS_TABLE = 'insights_sends'

// ── Zeilen (insights-001 … insights-004) ───────────────────────────────────

/** Ein Beitrag (insights-001). Alle Listen-Spalten sind JSON (s. Kopf). */
export type InsightsPostRow = Models.Row & {
  format: string
  slug: string
  /** JSON `string[]` — alte Slugs, jüngster zuerst. */
  slugHistory?: string
  state: string
  baseLocale: string
  titleDe?: string
  titleEn?: string
  dekDe?: string
  dekEn?: string
  /** MEDIUMTEXT ⇒ kein Spalten-Default, deshalb `null` möglich. */
  bodyDe?: string | null
  bodyEn?: string | null
  translatedAt?: string | null
  translationModel?: string
  translationPromptVersion?: string
  translationReviewed?: boolean
  /** JSON `string[]` — Schlüssel aus dem Cluster-Katalog. */
  topics?: string
  /** MEDIUMTEXT, JSON `InsightsSource[]`. */
  sources?: string | null
  /** JSON `InsightsBrandRef[]`. */
  brandRefs?: string
  /**
   * MEDIUMTEXT, ZWEI Formen (§9.3): eine LISTE ⇒ Duell-Zeilen, ein OBJEKT ⇒
   * das eingefrorene Ranking. Die Form entscheidet, nicht `format` — so
   * überlebt eine Zeile, deren Format jemand umgestellt und deren Daten er
   * stehen gelassen hat, wenigstens lesbar.
   */
  facts?: string | null
  readingMinutes?: number
  publishedAt?: string | null
  reviewedAt?: string | null
  reviewedBy?: string
  noteInternal?: string
  draftModel?: string
  draftPromptVersion?: string
}

/** Ein Markenprofil einer FREMDEN Marke (insights-002). */
export type InsightsBrandRow = Models.Row & {
  slug: string
  /** JSON `string[]`. */
  slugHistory?: string
  name: string
  homepage?: string
  libraryKey?: string
  checkId?: string
  publicationId?: string
  industry?: string
  country?: string
  /** 0 = unbekannt (die Spalte hat keinen NULL-Zustand). */
  foundedYear?: number
  archetype?: string
  archetypeSecondary?: string
  paletteId?: string
  /** JSON `InsightsMark[]`. */
  marks?: string
  /** JSON `InsightsHistoryEntry[]`. */
  history?: string
  /** JSON `string[]` — Zeilen-Ids der Wettbewerber. */
  relations?: string
  /** MEDIUMTEXT, JSON `InsightsSource[]`. */
  sources?: string | null
  state: string
  removedAt?: string | null
  removalReason?: string
  claimedBy?: string
}

/**
 * EIN VIDEO IM THEMENRADAR (insights-004).
 *
 * Alle Zahlen-Spalten sind optional, obwohl der Sweep sie IMMER schreibt: eine
 * Appwrite-Spalte mit Vorgabewert liefert bei einer Zeile, die vor der Spalte
 * entstanden ist, `undefined` — und der Radar ist die eine Tabelle dieses
 * Layers, in der ein solcher Übergang wirklich vorkommt (sie wird täglich neu
 * beschrieben, während ein Deploy läuft).
 */
export type InsightsTopicRow = Models.Row & {
  videoId: string
  channelId: string
  channelTitle: string
  channelSubscribers?: number
  title: string
  views?: number
  likes?: number
  commentCount?: number
  /** datetime — der Vertrag kennt nur den Kalendertag (s. `toInsightsRadarVideo`). */
  publishedAt?: string | null
  fetchedAt?: string | null
  topic: string
  /** UNSERE Zahl (0–1). */
  relevance?: number
  /** UNSERE Zahl (0–100) — `null` heisst „kein Signal", nie „schlecht". */
  opportunity?: number | null
  opportunitySignals?: number
}

/** Ein Korrekturvorschlag oder Entfernungs-Wunsch (insights-003). */
export type InsightsCorrectionRow = Models.Row & {
  targetKind: string
  targetId: string
  kind: string
  field?: string
  proposed?: string
  reason?: string
  /** Kleingeschrieben gespeichert — der Lesepfad des GDPR-Contributors. */
  contactEmail?: string
  status: string
  decisionNote?: string
  decidedAt?: string | null
  /** sha256 mit Tages-Salz, nie die rohe IP. */
  ipHash?: string
  /** Ab hier werden `contactEmail` und `ipHash` geleert (§9.3). */
  retentionAt?: string | null
}

/**
 * EINE NEWSLETTER-EINTRAGUNG (insights-006, §9.3a).
 *
 * Es gibt KEINE `toInsightsSubscriber`-Abbildung daneben, und das ist der
 * Unterschied zu den vier Zeilen darüber: diese Tabelle trägt keine
 * JSON-Spalte, keinen Aufzählungswert und keinen Vertrag, den eine Oberfläche
 * anzeigt — sie trägt eine Adresse, eine Sprache und vier Zeitstempel. Die
 * drei Routen lesen die Felder, die sie brauchen, und schreiben JEDE Spalte
 * explizit (CLAUDE.md). Eine Abbildung wäre hier eine Schicht ohne Arbeit.
 *
 * `''` und nicht `null` bei den Stempeln (wörtlich wie `brand_waitlist`): die
 * Routen LEEREN sie, und '' neben null wären zwei Wörter für „gibt es nicht",
 * von denen jeder Leser beide kennen müsste. Verglichen wird im Code
 * (`Date.parse`), nie in einer Abfrage.
 *
 * AUSNAHME `retentionAt`: ein echtes `datetime`, weil der Sweep es als
 * ABFRAGE braucht (`lessThanEqual` über `idx_retention`) und beim Leeren auf
 * `null` setzt. Ein leerer String wäre dort lexikografisch KLEINER als jedes
 * Datum — jede geleerte Zeile bliebe damit für immer „fällig" und füllte
 * jeden Stapel (die Lehre aus I1, s. Kopf des Sweeps).
 */
export type InsightsSubscriberRow = Models.Row & {
  /** Kleingeschrieben und getrimmt — trägt den UNIQUE-Index. */
  emailLower?: string
  /** Dieselbe Adresse in ihrer Original-Schreibweise (die Anrede). */
  email?: string
  locale?: string
  /** sha256 des offenen Bestätigungs-Links — '' heisst „keiner offen". */
  tokenHash?: string
  tokenExpiresAt?: string
  confirmedAt?: string
  unsubscribedAt?: string
  /** WO sich jemand eingetragen hat ('list', 'post:<slug>') — die Zahl aus §9.7. */
  source?: string
  /** sha256 mit Tages-Salz, nie die rohe IP. */
  ipHash?: string
  /** Ab hier werden `email`, `emailLower` und `ipHash` geleert (12 Monate). */
  retentionAt?: string | null
}

/**
 * EIN VERSAND (insights-008, BI1 I5b) — derselbe Zuschnitt wie die Zeile
 * darüber: keine Abbildung daneben, die Routen lesen die Felder, die sie
 * brauchen, und schreiben jede Spalte explizit.
 *
 * ── HIER STEHT KEINE ADRESSE, UND DAS IST DER ENTWURF ──────────────────
 * Die Zeile ZÄHLT (`recipients`, `sent`, `failed`) und nennt niemanden.
 * `cursor` ist die `$id` einer Abonnenten-Zeile — kein Name, keine Adresse,
 * kein Hash einer Adresse (ein Hash wäre wieder ein Personenbezug, und
 * `insights_subscribers` hat eine Löschfrist, die eine Kopie daneben
 * aushebelte). Wer eine Empfängerliste sucht, fragt die Liste.
 *
 * `''` und nicht `null` bei den zwei Stempeln (wörtlich wie beim Abonnenten):
 * `finishedAt` beginnt LEER und wird beim Abschluss gesetzt; verglichen wird
 * im Code, nie in einer Abfrage.
 */
export type InsightsSendRow = Models.Row & {
  /** Die Zeilen-Id des Beitrags — UNIQUE, und damit DIE Sicherung (s. Kopf). */
  postId?: string
  /** Der Betreff, wie er verschickt WURDE (der Titel darf sich danach ändern). */
  subject?: string
  /** Die eigenen zwei, drei Sätze je Sprache — der zweite Stapel braucht sie
   *  genauso, und die Mail folgt der Sprache des Lesers (kein Rückfall). */
  introDe?: string
  introEn?: string
  /** Die GRUNDSPRACHE des Beitrags, NICHT die Sprache der Mails. */
  locale?: string
  /** `running` · `done` · `failed`. */
  state?: string
  /** Die `$id` des zuletzt ERFOLGREICH bedienten Empfängers. */
  cursor?: string
  recipients?: number
  sent?: number
  failed?: number
  startedAt?: string
  finishedAt?: string
}

// ── Die puren Helfer ───────────────────────────────────────────────────────

/**
 * JSON aus einer Spalte lesen — `null` statt eines Wurfs (s. Kopf).
 *
 * Bewusst OHNE Schema-Prüfung: die inhaltliche Wahrheit steht in den Zod-
 * Schemas des Produkt-Vertrags, und die gehören an die Stelle, an der eine
 * Ablehnung jemandem gezeigt werden kann. Hier geht es nur darum, dass eine
 * kaputte Zeile die Liste nicht mitreisst.
 */
function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

/** Eine JSON-Liste aus einer Spalte — leer, wenn dort nichts Lesbares steht. */
function parseJsonArray<T>(raw: string | null | undefined): T[] {
  const value = parseJson(raw)
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Ein Aufzählungswert aus einem varchar — mit Ersatzwert in die sichere
 * Richtung (s. Kopf).
 */
function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

/** JSON schreiben. Leere Listen werden zu `[]`, nie zu `''` — eine leere
 *  Zeichenkette liest sich beim nächsten Mal als „kaputt" statt als „leer". */
function toJson(value: unknown): string {
  return JSON.stringify(value)
}

// ── Beitrag: Zeile ⇄ Vertrag ───────────────────────────────────────────────

/**
 * ZEILE → VERTRAG. Fail-soft in jeder JSON-Spalte, engster Ersatzwert in
 * jeder Aufzählung (s. Kopf). Das Ergebnis ist NICHT geprüft — wer eine
 * geprüfte Zusage braucht (Freigabe, öffentliche Route), schickt es durch
 * `insightsPostSchema`.
 */
export function toInsightsPost(row: InsightsPostRow): InsightsPost {
  const facts = parseJson(row.facts)
  const isRanking = !!facts && !Array.isArray(facts) && typeof facts === 'object'
  return {
    format: oneOf<InsightsFormat>(INSIGHTS_FORMATS, row.format, 'article'),
    slug: row.slug,
    slugHistory: parseJsonArray<string>(row.slugHistory),
    state: oneOf(INSIGHTS_STATES, row.state, 'draft'),
    baseLocale: oneOf<InsightsLocale>(INSIGHTS_LOCALES, row.baseLocale, 'en'),
    titleDe: row.titleDe ?? '',
    titleEn: row.titleEn ?? '',
    dekDe: row.dekDe ?? '',
    dekEn: row.dekEn ?? '',
    bodyDe: row.bodyDe ?? '',
    bodyEn: row.bodyEn ?? '',
    translatedAt: row.translatedAt ?? '',
    translationModel: row.translationModel ?? '',
    translationPromptVersion: row.translationPromptVersion ?? '',
    translationReviewed: row.translationReviewed === true,
    // Unbekannte Cluster-Schlüssel fallen heraus statt den Typ zu brechen:
    // ein umbenanntes Thema soll keine ganze Zeile unlesbar machen.
    topics: parseJsonArray<string>(row.topics)
      .filter((key): key is InsightsTopicKey => (INSIGHTS_TOPIC_KEYS as readonly string[]).includes(key)),
    sources: parseJsonArray<InsightsSource>(row.sources),
    brandRefs: parseJsonArray<InsightsBrandRef>(row.brandRefs),
    facts: isRanking ? [] : parseJsonArray<InsightsDuelFact>(row.facts),
    ranking: isRanking ? (facts as InsightsRanking) : null,
    readingMinutes: row.readingMinutes ?? 0,
    publishedAt: row.publishedAt ?? '',
    reviewedAt: row.reviewedAt ?? '',
    reviewedBy: row.reviewedBy ?? '',
    noteInternal: row.noteInternal ?? '',
    draftModel: row.draftModel ?? '',
    draftPromptVersion: row.draftPromptVersion ?? '',
  }
}

/** Die schreibbaren Felder einer Beitrags-Zeile — ohne die `$`-Attribute. */
export type InsightsPostRowData = Omit<InsightsPostRow, keyof Models.Row>

/**
 * VERTRAG → ZEILE. Die Datums-Spalten sind `datetime` und vertragen KEINE
 * leere Zeichenkette (Appwrite lehnt sie ab) — leer heisst hier `null`.
 */
export function fromInsightsPost(post: InsightsPost): InsightsPostRowData {
  return {
    format: post.format,
    slug: post.slug,
    slugHistory: toJson(post.slugHistory),
    state: post.state,
    baseLocale: post.baseLocale,
    titleDe: post.titleDe,
    titleEn: post.titleEn,
    dekDe: post.dekDe,
    dekEn: post.dekEn,
    bodyDe: post.bodyDe,
    bodyEn: post.bodyEn,
    translatedAt: post.translatedAt || null,
    translationModel: post.translationModel,
    translationPromptVersion: post.translationPromptVersion,
    translationReviewed: post.translationReviewed,
    topics: toJson(post.topics),
    sources: toJson(post.sources),
    brandRefs: toJson(post.brandRefs),
    // Die zwei Formen aus §9.3 in EINER Spalte: das Ranking gewinnt, wenn es
    // da ist — ein Beitrag kann nie beides sein (das Schema verbietet es).
    facts: post.ranking ? toJson(post.ranking) : toJson(post.facts),
    readingMinutes: post.readingMinutes,
    publishedAt: post.publishedAt || null,
    reviewedAt: post.reviewedAt || null,
    reviewedBy: post.reviewedBy,
    noteInternal: post.noteInternal,
    draftModel: post.draftModel,
    draftPromptVersion: post.draftPromptVersion,
  }
}

// ── Markenprofil: Zeile ⇄ Vertrag ──────────────────────────────────────────

/** ZEILE → VERTRAG (s. Kopf: fail-soft, engster Ersatzwert). */
export function toInsightsBrand(row: InsightsBrandRow): InsightsBrand {
  return {
    slug: row.slug,
    slugHistory: parseJsonArray<string>(row.slugHistory),
    name: row.name,
    homepage: row.homepage ?? '',
    libraryKey: row.libraryKey ?? '',
    checkId: row.checkId ?? '',
    publicationId: row.publicationId ?? '',
    industry: row.industry ?? '',
    country: row.country ?? '',
    // 0 in der Spalte heisst „unbekannt" — im Vertrag ist das `null` (dort
    // gibt es keinen Jahrgang 0, und `null` sagt es ehrlicher als eine Zahl).
    foundedYear: row.foundedYear ? row.foundedYear : null,
    archetype: row.archetype ?? '',
    archetypeSecondary: row.archetypeSecondary ?? '',
    paletteId: row.paletteId ?? '',
    marks: parseJsonArray<InsightsBrand['marks'][number]>(row.marks),
    history: parseJsonArray<InsightsBrand['history'][number]>(row.history),
    relations: parseJsonArray<string>(row.relations),
    sources: parseJsonArray<InsightsSource>(row.sources),
    state: oneOf(INSIGHTS_BRAND_STATES, row.state, 'draft'),
    removedAt: row.removedAt ?? '',
    removalReason: row.removalReason ?? '',
    claimedBy: row.claimedBy ?? '',
  }
}

/** Die schreibbaren Felder einer Marken-Zeile. */
export type InsightsBrandRowData = Omit<InsightsBrandRow, keyof Models.Row>

/** VERTRAG → ZEILE. */
export function fromInsightsBrand(brand: InsightsBrand): InsightsBrandRowData {
  return {
    slug: brand.slug,
    slugHistory: toJson(brand.slugHistory),
    name: brand.name,
    homepage: brand.homepage,
    libraryKey: brand.libraryKey,
    checkId: brand.checkId,
    publicationId: brand.publicationId,
    industry: brand.industry,
    country: brand.country,
    foundedYear: brand.foundedYear ?? 0,
    archetype: brand.archetype,
    archetypeSecondary: brand.archetypeSecondary,
    paletteId: brand.paletteId,
    marks: toJson(brand.marks),
    history: toJson(brand.history),
    relations: toJson(brand.relations),
    sources: toJson(brand.sources),
    state: brand.state,
    removedAt: brand.removedAt || null,
    removalReason: brand.removalReason,
    claimedBy: brand.claimedBy,
  }
}

// ── Korrekturvorschlag: Zeile ⇄ Vertrag ────────────────────────────────────

/**
 * ZEILE → VERTRAG. `ipHash`, `decidedAt` und `retentionAt` reisen NICHT mit:
 * der Vertrag beschreibt, was ein Mensch eingereicht und was die Redaktion
 * entschieden hat — die drei sind Betriebsdaten der Zeile und haben in einer
 * Antwort nichts verloren (der `ipHash` erst recht nicht).
 */
export function toInsightsCorrection(row: InsightsCorrectionRow): InsightsCorrection {
  return {
    targetKind: oneOf<InsightsCorrectionTargetKind>(INSIGHTS_CORRECTION_TARGET_KINDS, row.targetKind, 'brand'),
    targetId: row.targetId,
    kind: oneOf<InsightsCorrectionKind>(INSIGHTS_CORRECTION_KINDS, row.kind, 'correction'),
    field: row.field ?? '',
    proposed: row.proposed ?? '',
    reason: row.reason ?? '',
    contactEmail: row.contactEmail ?? '',
    status: oneOf<InsightsCorrectionStatus>(INSIGHTS_CORRECTION_STATUSES, row.status, 'open'),
    decisionNote: row.decisionNote ?? '',
  }
}

/** Die schreibbaren Felder einer Korrektur-Zeile. */
export type InsightsCorrectionRowData = Omit<InsightsCorrectionRow, keyof Models.Row>

/**
 * VERTRAG → ZEILE. `ipHash`, `decidedAt` und `retentionAt` setzt die ROUTE
 * (I3) — sie stammen nicht aus dem Vertrag, und sie hier mit Vorgabewerten zu
 * füllen hiesse, eine Aufbewahrungsfrist zu erfinden, die niemand gerechnet
 * hat.
 */
export function fromInsightsCorrection(
  correction: InsightsCorrection,
): Omit<InsightsCorrectionRowData, 'ipHash' | 'decidedAt' | 'retentionAt'> {
  return {
    targetKind: correction.targetKind,
    targetId: correction.targetId,
    kind: correction.kind,
    field: correction.field,
    proposed: correction.proposed,
    reason: correction.reason,
    contactEmail: correction.contactEmail,
    status: correction.status,
    decisionNote: correction.decisionNote,
  }
}

// ── Themenradar: Zeile ⇄ Vertrag ───────────────────────────────────────────

/**
 * ZEILE → VERTRAG (insights-004, BI1 I4).
 *
 * ── DATUM: SPALTE IST `datetime`, VERTRAG IST KALENDERTAG ───────────────
 * `insightsRadarVideoSchema` verlangt `YYYY-MM-DD` (dieselbe `dateSchema` wie
 * bei den Quellen), die Spalte ist ein `datetime`. Das ist kein Widerspruch,
 * sondern die richtige Arbeitsteilung: Appwrite braucht für den Fristen-Filter
 * (`fetchedAt < heute − 30 Tage`) eine echte Zeit, die Redaktion braucht einen
 * TAG — „vor 12 Tagen" rechnet niemand aus einer Uhrzeit, und eine Uhrzeit in
 * der Tabelle wäre eine Genauigkeit, die die Zahl darunter nicht hat. Beim
 * Lesen fallen deshalb die ersten zehn Zeichen an.
 *
 * ── FAIL-SOFT WIE ÜBERALL IN DIESER DATEI ───────────────────────────────
 * Eine kaputte Radar-Zeile darf die Radar-Tabelle nicht mitnehmen. Unbekannte
 * Cluster fallen auf `INSIGHTS_RADAR_TOPIC_FALLBACK` (Begründung dort: der
 * Ersatzwert entscheidet hier über eine RUBRIK, nicht über Sichtbarkeit),
 * fehlende Zahlen auf 0 — und `opportunity` auf `null`, NICHT auf 0: eine 0
 * wäre die Aussage „das Video taugt nichts", wo in Wahrheit nichts gemessen
 * wurde (wörtlich die Regel aus `insightsOpportunity`).
 */
export function toInsightsRadarVideo(row: InsightsTopicRow): InsightsRadarStoredVideo {
  const clampUnit = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return {
    videoId: row.videoId,
    channelId: row.channelId,
    channelTitle: row.channelTitle,
    channelSubscribers: Math.max(0, Math.round(row.channelSubscribers ?? 0)),
    title: row.title,
    views: Math.max(0, Math.round(row.views ?? 0)),
    likes: Math.max(0, Math.round(row.likes ?? 0)),
    commentCount: Math.max(0, Math.round(row.commentCount ?? 0)),
    publishedAt: (row.publishedAt ?? '').slice(0, 10),
    fetchedAt: (row.fetchedAt ?? '').slice(0, 10),
    topic: oneOf<InsightsTopicKey>(INSIGHTS_TOPIC_KEYS, row.topic, INSIGHTS_RADAR_TOPIC_FALLBACK),
    relevance: clampUnit(row.relevance),
    opportunity: typeof row.opportunity === 'number' && Number.isFinite(row.opportunity)
      ? Math.max(0, Math.min(100, Math.round(row.opportunity)))
      : null,
    opportunitySignals: Math.max(0, Math.round(row.opportunitySignals ?? 0)),
  }
}

/** Die schreibbaren Felder einer Radar-Zeile. */
export type InsightsTopicRowData = Omit<InsightsTopicRow, keyof Models.Row>

/**
 * VERTRAG → ZEILE.
 *
 * Die beiden Datums-Werte kommen als KALENDERTAG herein und gehen als
 * UTC-Mitternacht hinaus: ein `datetime` verträgt keine blosse `YYYY-MM-DD`
 * bei allen Appwrite-Ständen zuverlässig, und ein selbst gesetzter Zeitpunkt
 * ist ehrlicher als einer, den der Server sich denkt. Wer die genaue
 * Abrufzeit braucht, liest `$updatedAt` — die schreibt Appwrite ohnehin.
 */
export function fromInsightsRadarVideo(video: InsightsRadarStoredVideo): InsightsTopicRowData {
  const asDateTime = (day: string) => (day ? `${day.slice(0, 10)}T00:00:00.000Z` : null)
  return {
    videoId: video.videoId,
    channelId: video.channelId,
    channelTitle: video.channelTitle.slice(0, 160),
    channelSubscribers: video.channelSubscribers,
    title: video.title.slice(0, 300),
    views: video.views,
    likes: video.likes,
    commentCount: video.commentCount,
    publishedAt: asDateTime(video.publishedAt),
    fetchedAt: asDateTime(video.fetchedAt),
    topic: video.topic,
    relevance: video.relevance,
    opportunity: video.opportunity,
    opportunitySignals: video.opportunitySignals,
  }
}


/**
 * ZEILE → ARBEITSLISTEN-EINTRAG (BI1 I2-Rest).
 *
 * ── WARUM DIESER MAPPER HIER STEHT UND NICHT IN `server/utils` ───────────
 * Sein Nachbar `toInsightsPostListItem` liegt dort, und das ist für ihn auch
 * richtig. Dieser hier gibt aber ein VERSPRECHEN ab: die Kontakt-Adresse
 * verlässt den Server nicht, nur ihr Vorhandensein tut es (§9.3, das einzige
 * personenbezogene Feld des Layers). Ein Versprechen dieser Art gehört an
 * eine Stelle, die eine Gegenprobe zeigen kann — und ein Vitest-Lauf ohne
 * Nitro kann `server/utils` nicht importieren (Auto-Imports, `H3Event`,
 * Appwrite-Client). Hier ist er pur und geprüft.
 *
 * `targetLabel` reicht die Route herein: sie allein weiss, ob es zu
 * `targetId` noch einen Beitrag oder eine Marke gibt.
 */
export function toInsightsCorrectionListItem(
  row: InsightsCorrectionRow,
  targetLabel = '',
): InsightsCorrectionListItem {
  const { contactEmail, ...correction } = toInsightsCorrection(row)
  return {
    ...correction,
    id: row.$id,
    targetLabel,
    // Bewusst `Boolean(...)` und nicht die Adresse: siehe Kopf. Nach dem
    // Retention-Sweep (12 Monate) ist das Feld leer — dann sagt die Spalte
    // ehrlich „kein Kontakt (mehr)", statt eine Adresse zu behaupten.
    hasContact: Boolean(contactEmail),
    createdAt: row.$createdAt,
    decidedAt: row.decidedAt ?? '',
  }
}

// ── Die Kanalliste (insights-005, BI2 K3) ──────────────────────────────────

/**
 * EIN KURATIERTER KANAL ALS ZEILE.
 *
 * ── WAS VON DER API KOMMT UND WAS VOM MENSCHEN ──────────────────────────
 * `topic`, `active` und `note` gehören dem BETREIBER — sie sind die
 * Entscheidung, und nichts überschreibt sie. `title`, `handle`, `subscribers`,
 * `lastUploadAt` und `checkedAt` gehören der API: sie werden bei der Vorschau
 * und bei jedem Lauf nachgezogen. Die Trennung steht hier, weil sie sonst in
 * jedem Schreibpfad neu erfunden würde — und beim ersten Mal, bei dem jemand
 * sie vergisst, trägt ein Lauf die Notiz des Betreibers aus.
 */
export type InsightsChannelRow = Models.Row & {
  channelId: string
  topic: string
  title: string
  handle: string
  subscribers: number
  active: boolean
  note: string
  lastUploadAt: string | null
  checkedAt: string | null
}

/** Die schreibbaren Felder einer Kanal-Zeile. */
export type InsightsChannelRowData = Omit<InsightsChannelRow, keyof Models.Row>

/**
 * ZEILE → VERTRAG, fail-soft wie überall in dieser Datei.
 *
 * `topic` fällt auf denselben Wert zurück wie eine Radar-Zeile
 * (`INSIGHTS_RADAR_TOPIC_FALLBACK`) und aus demselben Grund: ein Cluster, das
 * der Katalog nicht mehr kennt, ist eine falsche RUBRIK und kein Grund, die
 * Kanal-Liste mit einer Ausnahme abzubrechen. `active` ist bei einer Zeile
 * ohne Wert WAHR — eine Zeile, die vor der Spalte entstanden wäre, soll
 * mitlaufen und nicht still aus dem Radar fallen.
 */
export function toInsightsChannel(row: InsightsChannelRow): InsightsChannel {
  return {
    channelId: row.channelId,
    topic: oneOf<InsightsTopicKey>(INSIGHTS_TOPIC_KEYS, row.topic, INSIGHTS_RADAR_TOPIC_FALLBACK),
    title: row.title ?? '',
    handle: row.handle ?? '',
    subscribers: Math.max(0, Math.round(row.subscribers ?? 0)),
    active: row.active !== false,
    note: row.note ?? '',
    lastUploadAt: (row.lastUploadAt ?? '').slice(0, 10),
    checkedAt: row.checkedAt ?? '',
  }
}

/**
 * VERTRAG → ZEILE.
 *
 * `lastUploadAt` reist als Kalendertag und geht als UTC-Mitternacht hinaus —
 * wörtlich dieselbe Begründung wie bei `fromInsightsRadarVideo`. `checkedAt`
 * dagegen ist ein echter ZEITPUNKT und bleibt einer: „heute geprüft" und
 * „heute um 23:50 geprüft" sind bei einem stündlichen Lauf zwei verschiedene
 * Aussagen.
 */
export function fromInsightsChannel(channel: InsightsChannel): InsightsChannelRowData {
  return {
    channelId: channel.channelId,
    topic: channel.topic,
    title: channel.title.slice(0, 160),
    handle: channel.handle.slice(0, 64),
    subscribers: channel.subscribers,
    active: channel.active,
    note: channel.note.slice(0, INSIGHTS_CHANNEL_NOTE_MAX),
    lastUploadAt: channel.lastUploadAt ? `${channel.lastUploadAt.slice(0, 10)}T00:00:00.000Z` : null,
    checkedAt: channel.checkedAt || null,
  }
}

// ── Die Fundstücke (insights-007, BI2 K4) ──────────────────────────────────

/**
 * EIN FUNDSTÜCK ALS ZEILE.
 *
 * ── DIE TRENNLINIE IST HIER DIE WICHTIGSTE DES LAYERS ───────────────────
 * `verdict`, `note`, `topic` und `addedAt` gehören dem MENSCHEN und werden von
 * keinem Lauf angefasst. `title`, `channelId`, `channelTitle`,
 * `channelSubscribers`, `views`, `likes`, `commentCount`, `publishedAt`,
 * `available` und `refreshedAt` gehören der API und werden täglich
 * überschrieben. Wer das durcheinanderbringt, löscht beim Aufräumen das
 * Urteil — und das Urteil ist der einzige Grund, warum es diese Tabelle gibt.
 *
 * `available: false` heisst „beim letzten Abruf nicht mehr da" (gelöscht,
 * privat). Dann sind die Zahlen GELEERT und die Zeile bleibt. Im Radar ginge
 * in diesem Fall die ganze Zeile; der Unterschied steht im Kopf der Migration.
 */
export type InsightsWatchRow = Models.Row & {
  videoId: string
  verdict: string
  note: string
  topic: string
  addedAt: string | null
  available: boolean
  refreshedAt: string | null
  title: string
  channelId: string
  channelTitle: string
  channelSubscribers: number
  views: number
  likes: number
  commentCount: number
  publishedAt: string | null
}

/** Die schreibbaren Felder eines Fundstücks. */
export type InsightsWatchRowData = Omit<InsightsWatchRow, keyof Models.Row>

/**
 * ZEILE → VERTRAG, fail-soft wie überall hier.
 *
 * `verdict` fällt auf `unrated` zurück und NICHT auf `interesting` — ein
 * geratenes Urteil schöbe ein Video in die Vorauswahl, die ein Mensch nie
 * getroffen hat (Begründung im Kopf von `insightsWatchlist.ts`).
 * `available` ist bei einer Zeile ohne Wert WAHR: eine Zeile, die vor der
 * Spalte entstanden wäre, soll nicht als gelöschtes Video erscheinen.
 */
export function toInsightsWatchItem(row: InsightsWatchRow): InsightsWatchItem {
  return {
    videoId: row.videoId,
    verdict: oneOf<InsightsVerdict>(INSIGHTS_VERDICTS, row.verdict, INSIGHTS_VERDICT_FALLBACK),
    note: row.note ?? '',
    topic: oneOf<InsightsTopicKey>(INSIGHTS_TOPIC_KEYS, row.topic, INSIGHTS_RADAR_TOPIC_FALLBACK),
    addedAt: row.addedAt ?? row.$createdAt,
    available: row.available !== false,
    refreshedAt: row.refreshedAt ?? '',
    title: row.title ?? '',
    channelId: row.channelId ?? '',
    channelTitle: row.channelTitle ?? '',
    channelSubscribers: Math.max(0, Math.round(row.channelSubscribers ?? 0)),
    views: Math.max(0, Math.round(row.views ?? 0)),
    likes: Math.max(0, Math.round(row.likes ?? 0)),
    commentCount: Math.max(0, Math.round(row.commentCount ?? 0)),
    publishedAt: (row.publishedAt ?? '').slice(0, 10),
  }
}

/** VERTRAG → ZEILE. `publishedAt` reist als Kalendertag, wie überall hier. */
export function fromInsightsWatchItem(item: InsightsWatchItem): InsightsWatchRowData {
  return {
    videoId: item.videoId,
    verdict: item.verdict,
    note: item.note.slice(0, INSIGHTS_WATCH_NOTE_MAX),
    topic: item.topic,
    addedAt: item.addedAt || null,
    available: item.available,
    refreshedAt: item.refreshedAt || null,
    title: item.title.slice(0, 300),
    channelId: item.channelId.slice(0, 64),
    channelTitle: item.channelTitle.slice(0, 160),
    channelSubscribers: item.channelSubscribers,
    views: item.views,
    likes: item.likes,
    commentCount: item.commentCount,
    publishedAt: item.publishedAt ? `${item.publishedAt.slice(0, 10)}T00:00:00.000Z` : null,
  }
}
