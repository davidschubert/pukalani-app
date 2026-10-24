import type {
  InsightsBrand,
  InsightsBrandScore,
  InsightsBrandState,
  InsightsDuelFact,
  InsightsFormat,
  InsightsLocale,
  InsightsPost,
  InsightsRanking,
  InsightsReviewIssue,
  InsightsState,
} from '../insightsPost'
import type {
  InsightsPublicBrand,
  InsightsPublicBrandRef,
  InsightsPublicDuelSide,
  InsightsPublicPost,
  InsightsPublicPostListItem,
} from '../insightsPublic'
import type { InsightsRadarStoredVideo } from '../insightsRadar'
import type {
  InsightsCorrection,
  InsightsCorrectionStatus,
} from '../insightsCorrection'

/**
 * DIE ANTWORT-TYPEN DER REDAKTIONS-ROUTEN (BI1 I2).
 *
 * ── WARUM SIE ÜBERHAUPT EXISTIEREN ───────────────────────────────────────
 * Nitros Routen-Typisierung ist im Repo AUS (Davids Entscheidung 2026-08-14,
 * TS2589-Strukturfix): `$fetch('/api/x')` liefert `unknown`, und jeder
 * gebundene Aufruf nennt seinen Antworttyp SELBST. Diese Datei ist die
 * gemeinsame Wahrheit dafür — verlangt an BEIDEN Enden (Handler-Annotation
 * `Promise<XyzResponse>` und `$fetch<XyzResponse>` in der Seite). Ein Typ, den
 * nur eine Seite kennt, ist eine Vermutung.
 *
 * ── DIE LISTE TRÄGT KEINEN FLIESSTEXT ────────────────────────────────────
 * `InsightsPostListItem` ist bewusst KEIN `InsightsPost`: die Liste zeigt
 * zwanzig Zeilen, und jede trüge sonst zwei vollständige Artikel-Fassungen
 * über die Leitung. Was sie zeigt, steht hier — mehr holt der Editor.
 */

/** Eine Zeile der Redaktionsliste (`GET /api/insights/posts`). */
export interface InsightsPostListItem {
  id: string
  format: InsightsFormat
  state: InsightsState
  baseLocale: InsightsLocale
  titleDe: string
  titleEn: string
  slug: string
  translationReviewed: boolean
  /** Leer, solange die zweite Fassung nie maschinell erzeugt wurde. */
  translatedAt: string
  publishedAt: string
  readingMinutes: number
  /** `$updatedAt` der Zeile — die Sortierung der Liste. */
  updatedAt: string
}

export interface InsightsPostsListResponse {
  posts: InsightsPostListItem[]
}

/**
 * Eine Marken-Zeile, so wie der Editor sie zur Auswahl und die Marken-SEITE
 * sie als Tabellenzeile braucht.
 *
 * `country` und `updatedAt` kamen mit der Marken-Seite (BI1 I2-Rest) dazu —
 * sie sind zwei Spalten dort und kosten in der Editor-Auswahl nichts. Eine
 * zweite, breitere Listen-Form daneben wäre ein zweiter Mapper über dieselbe
 * Zeile; die Antwort ist ohnehin auf 200 Zeilen gedeckelt und trägt keinen
 * Fliesstext.
 */
export interface InsightsBrandListItem {
  id: string
  name: string
  slug: string
  homepage: string
  industry: string
  country: string
  state: InsightsBrandState
  /** `$updatedAt` der Zeile — die Spalte „Zuletzt". */
  updatedAt: string
}

export interface InsightsBrandsListResponse {
  brands: InsightsBrandListItem[]
}

export interface InsightsBrandCreatedResponse {
  brand: InsightsBrandListItem
  id: string
}

/**
 * EINE MARKE ZUM BEARBEITEN (`GET /api/insights/brands/<id>`).
 *
 * Anders als das Listen-Item trägt sie den GANZEN Vertrag — Zeichen,
 * Historie, Beziehungen, Belege. Genau deshalb ist sie eine eigene Antwort
 * und reist nicht in der Liste mit: zweihundert Zeilen mit je vierzig Quellen
 * wären ein Megabyte für eine Tabelle mit sechs Spalten.
 */
export interface InsightsBrandDetailResponse {
  brand: InsightsBrand
  id: string
}

/**
 * Das Speichern gibt BEIDES zurück: die Zeile für das Formular und das
 * Listen-Item für die Tabelle dahinter.
 *
 * Ohne das `listItem` müsste die Seite nach jedem Speichern die ganze Liste
 * neu holen, nur um einen geänderten Namen anzuzeigen — für Daten, die diese
 * Antwort schon trägt (dasselbe Argument wie am Beitrags-Editor).
 */
export interface InsightsBrandSavedResponse {
  brand: InsightsBrand
  id: string
  listItem: InsightsBrandListItem
}

/**
 * Der Editor-Kontext (`GET /api/insights/posts/<id>`).
 *
 * `issues` kommt hier OHNE Beleg-Abruf: die Seite soll sofort zeigen, was
 * FORMAL fehlt (Herausgeber, Datum, Lizenz, Beleg-Zeiger, Marken-Zeile). Ob
 * ein Zitat wörtlich in seiner Quelle steht, kostet einen Abruf je Quelle und
 * passiert auf Knopfdruck bzw. im Zustands-Gate — nicht bei jedem Öffnen.
 */
export interface InsightsPostDetailResponse {
  post: InsightsPost
  id: string
  knownBrandIds: string[]
  brands: InsightsBrandListItem[]
  issues: InsightsReviewIssue[]
}

export interface InsightsPostCreatedResponse {
  post: InsightsPost
  id: string
}

/**
 * Das Löschen (`DELETE /api/insights/posts/<id>`) — die Id zurück, damit die
 * Liste die Zeile herausnehmen kann, ohne zu raten, welche gemeint war.
 *
 * `deleted: true` ist ein LITERAL und keine Höflichkeit: eine Antwort, die
 * `deleted: false` sagen könnte, hätte einen zweiten Ausgang, den niemand
 * behandelt. Was NICHT gelöscht werden darf, ist eine 409 — kein `false`.
 */
export interface InsightsPostDeletedResponse {
  id: string
  deleted: true
}

/** Das Speichern gibt die Zeile und die formalen Prüfpunkte zurück. */
export interface InsightsPostSavedResponse {
  post: InsightsPost
  issues: InsightsReviewIssue[]
}

/**
 * DIE ANTWORT DES ZUSTANDS-GATES — und warum sie ein `changed` trägt statt
 * eines 409.
 *
 * Ein blockierter Übergang ist kein Client-FEHLER, sondern eine ANTWORT: „nein,
 * und hier sind die neun Stellen". Genau diese Liste kann ein Fehler-Körper
 * aber nicht transportieren — der zentrale Handler (`core/server/error.ts`)
 * hebt aus `error.data` AUSSCHLIESSLICH einen kurzen Schlüssel als `reason`
 * ins Envelope und lässt den Rest bewusst draussen (keine Appwrite-Details).
 * Eine 409 mit `issues` im Körper wäre also eine 409 OHNE `issues` beim
 * Empfänger, und die Oberfläche müsste den ganzen teuren Gate-Lauf (bis zu
 * zwanzig fremde Websites) ein zweites Mal auslösen, nur um zu erfahren, was
 * der Server gerade gerechnet hat.
 *
 * `changed: false` mit gefüllter `issues`-Liste sagt beides in einer Antwort.
 * Der ZUSTAND ist trotzdem serverseitig gesichert: geschrieben wird nichts,
 * `post` ist unverändert. Was ein echter Client-Fehler ist, bleibt einer — ein
 * Übergang, den die Tabelle gar nicht kennt, antwortet weiter 409
 * (`transition_not_allowed`).
 */
export interface InsightsPostStateResponse {
  post: InsightsPost
  issues: InsightsReviewIssue[]
  changed: boolean
}

/**
 * WARUM DIE BELEG-AMPEL EINEN GRUND TRÄGT UND NICHT NUR EIN JA/NEIN.
 *
 * „Nicht gefunden" und „wir durften die Seite nicht lesen" sind für die
 * Redaktion zwei verschiedene Arbeiten: das eine heisst Zitat prüfen, das
 * andere Quelle wechseln. Ein einzelnes `false` liesse beide gleich aussehen.
 */
export type InsightsEvidenceReason =
  | 'ok'
  | 'not_found'
  | 'fetch_failed'
  | 'robots_denied'
  | 'tdm_reserved'
  | 'no_url'

export interface InsightsEvidenceResponse {
  grounded: boolean
  reason: InsightsEvidenceReason
  /** ISO-Zeitpunkt der Prüfung. Nichts davon wird gespeichert. */
  checkedAt: string
}

export interface InsightsTranslateResponse {
  post: InsightsPost
}

export interface InsightsDraftResponse {
  post: InsightsPost
}

// ── Themenradar (BI1 I4, §9.6) ─────────────────────────────────────────────

/**
 * EIN VIDEO IN DER BETREIBER-ANSICHT — die API-Zahlen PLUS unsere drei.
 *
 * Der Typ ist ein Re-Export und keine zweite Aufzählung derselben Felder:
 * `InsightsRadarStoredVideo` beschreibt, was in der Zeile LIEGT, und die
 * Antwort gibt genau das weiter. Zwei Listen derselben Felder liefen
 * auseinander, sobald eine Spalte dazukäme.
 */
export type InsightsRadarVideoItem = InsightsRadarStoredVideo

/**
 * `GET /api/insights/radar` — der Zustand des Radars UND seine Zeilen.
 *
 * ── WARUM DER ZUSTAND MITKOMMT UND NICHT AUS EINER ZWEITEN ROUTE ────────
 * „Gibt es einen Schlüssel?", „wie viele Kanäle?", „was kostet ein Lauf?" und
 * „wann lief er zuletzt?" sind die vier Fragen, die die Seite beantworten
 * MUSS, bevor ihr Knopf überhaupt Sinn ergibt. Eine leere Tabelle heisst je
 * nach Antwort „noch nie gelaufen", „kein Schlüssel" oder „keine Kanäle" —
 * drei sehr verschiedene Arbeiten für den Betreiber, und eine zweite Route
 * dafür wäre ein zweiter Ladezustand für dieselbe Seite.
 */
export interface InsightsRadarResponse {
  /** Liegt ein API-Schlüssel vor? (`NUXT_INSIGHTS_YOUTUBE_KEY`) */
  configured: boolean
  /** Wie viele GÜLTIGE Kanäle in der Konfiguration stehen. */
  channels: number
  /** Was ein Lauf nach der Formel aus §9.6 kostet (von 10.000 am Tag). */
  quotaEstimate: number
  /**
   * Der jüngste `fetchedAt` aller Zeilen — `null`, wenn es keine gibt.
   * KEIN zweiter Zustand irgendwo: ein Stempel, der von den Zeilen abweichen
   * kann, wäre ein Datum, dem niemand mehr glaubt.
   */
  lastRunAt: string | null
  /** Der Stichtag der SERVER-Uhr (`YYYY-MM-DD`) — gegen ihn rechnet das Alter. */
  today: string
  /** Älter als so viele Tage (ab Veröffentlichung) speichert der Lauf nichts — die Ansicht sagt es dazu. */
  maxVideoAgeDays: number
  videos: InsightsRadarVideoItem[]
}

/**
 * `POST /api/insights/radar/run` — das Ergebnis EINES Laufs, in Zahlen.
 *
 * Es ist das Sweep-Ergebnis unverändert. `skipped` sagt, wenn gar nichts
 * passiert ist, und WARUM — ein Lauf, der „0 Videos" meldet, weil kein
 * Schlüssel da ist, sieht sonst aus wie einer, der nichts gefunden hat.
 */
export interface InsightsRadarRunResponse {
  channels: number
  videos: number
  upserted: number
  deleted: number
  /** Gelieferte Videos, die der Alters-Deckel nicht gespeichert hat. */
  tooOld: number
  errors: number
  quotaUnits: number
  skipped?: 'not_configured' | 'no_channels' | 'quota_estimate' | 'running'
}


// ── Korrekturvorschläge (BI1 I2-Rest, §9.3) ────────────────────────────────

/**
 * EINE ZEILE DER KORREKTUR-ARBEITSLISTE.
 *
 * ── DIE ADRESSE REIST NICHT MIT, NUR IHR VORHANDENSEIN ───────────────────
 * `contactEmail` ist das EINZIGE personenbezogene Feld dieses Layers (§9.3).
 * Die Arbeitsliste braucht es nicht: entschieden wird über Feld, Vorschlag
 * und Grund — die Adresse braucht erst, wer ANTWORTET, und das ist ein
 * eigener Vorgang. Eine Liste, die zwanzig fremde Adressen in den Browser
 * schiebt (und in jedes Protokoll dazwischen), damit eine Spalte ein Häkchen
 * zeigen kann, ist die teuerste Art, eine Auskunftspflicht zu verfehlen.
 * `hasContact` sagt dasselbe, was die Spalte zeigen soll.
 *
 * ── `targetLabel` IST LEER, WENN DAS ZIEL FEHLT ──────────────────────────
 * Der Vorschlag zeigt auf eine Zeilen-Id; ob es die Zeile noch gibt, ist eine
 * zweite Frage (ein gelöschter Beitrag, eine entfernte Marke). Leer heisst
 * „nicht auflösbar" — die Seite zeigt dann die Id, statt eine Leerstelle zu
 * zeigen, mit der niemand etwas anfangen kann.
 */
export type InsightsCorrectionListItem = Omit<InsightsCorrection, 'contactEmail'> & {
  id: string
  /** Titel des Beitrags bzw. Name der Marke — leer, wenn das Ziel fehlt. */
  targetLabel: string
  /** Ob eine Kontakt-Adresse hinterlegt ist — NIE die Adresse selbst. */
  hasContact: boolean
  createdAt: string
  /** Leer, solange die Zeile `open` ist. */
  decidedAt: string
}

/**
 * DIE ZÄHLER SIND UNABHÄNGIG VOM FILTER (wörtlich wie bei
 * `brand_check_corrections`): sonst wäre die Kopfzeile eine Funktion der
 * gerade gewählten Ansicht („0 offen", weil man die abgelehnten anschaut)
 * statt eine Aussage über die Liste.
 */
export interface InsightsCorrectionsListResponse {
  items: InsightsCorrectionListItem[]
  counts: Record<InsightsCorrectionStatus, number>
}

/** Die Entscheidung über einen Vorschlag — die Zeile, wie sie danach dasteht. */
export interface InsightsCorrectionDecisionResponse {
  item: InsightsCorrectionListItem
}

// ── Die öffentlichen Seiten (BI1 I3, §9.2/§9.5) ────────────────────────────

/**
 * DIE ANTWORT-TYPEN DER LESEROUTEN.
 *
 * ── EINE DISKRIMINIERTE UNION, WEIL ES ZWEI ANTWORTEN GIBT ───────────────
 * Eine Adresse kann eine SEITE sein oder eine WEITERLEITUNG (§9.2:
 * umbenannter Slug, umgedrehtes Duell ⇒ 301). Beides in einem Objekt mit
 * optionalen Feldern wäre eine Form, die vier Zustände zulässt, von denen
 * zwei unmöglich sind — und die Seite müsste raten, welcher gilt. `kind`
 * macht daraus zwei, und der Typ erzwingt, dass beide behandelt werden.
 *
 * Die Route liefert im Weiterleitungs-Fall NUR den Slug, nie einen Pfad: den
 * baut die SEITE mit `localePath()`, weil nur sie die Sprache des Lesers
 * kennt. Ein Pfad aus dem Server wäre auf `/de/…` die englische Adresse.
 */
export interface InsightsPublicRedirect {
  kind: 'redirect'
  slug: string
}

/** Die Journal-Liste (`GET /api/insights/public/posts`). */
export interface InsightsPublicListResponse {
  posts: InsightsPublicPostListItem[]
}

/** Ein Artikel samt seiner erwähnten Marken. */
export interface InsightsPublicPostPayload {
  kind: 'post'
  post: InsightsPublicPost
  brands: InsightsPublicBrandRef[]
  /** Nur in der Betreiber-Vorschau gesetzt (`?preview=1`) — die Seite trägt dann `noindex`. */
  preview?: true
}

export type InsightsPublicPostResponse = InsightsPublicPostPayload | InsightsPublicRedirect

/**
 * EIN MARKENPROFIL (`GET /api/insights/public/brands/<slug>`).
 *
 * `posts` sind die öffentlichen Beiträge, die diese Marke erwähnen (höchstens
 * zwölf — eine Marken-Seite ist ein Dossier und kein Archiv), `relations` die
 * Wettbewerber, die selbst öffentlich stehen.
 *
 * BEI `state: 'removed'` SIND `marks`, `history`, `sources` UND `relations`
 * LEER (die Route räumt sie aus): über eine auf Wunsch entfernte Marke wird
 * nichts mehr behauptet — die Seite sagt nur noch, DASS und WANN.
 */
export interface InsightsPublicBrandPayload {
  kind: 'brand'
  brand: InsightsPublicBrand
  score: InsightsBrandScore | null
  /** Die Farbwelt-Kachel des Hero — aufgelöst über den brand-Vertrag. */
  gradient: readonly [string, string]
  posts: InsightsPublicPostListItem[]
  relations: { id: string, name: string, slug: string }[]
  preview?: true
}

export type InsightsPublicBrandResponse = InsightsPublicBrandPayload | InsightsPublicRedirect

/**
 * EIN DUELL (`GET /api/insights/public/duels/<slug>`).
 *
 * `left` ist die Marke, deren Slug im Duell-Slug VORNE steht — die Tafel soll
 * in derselben Reihenfolge stehen wie die Adresse, sonst liest man eine
 * andere Aufstellung, als man angeklickt hat.
 *
 * Fehlt eine der beiden Marken oder ihr Score, antwortet die Route 404: die
 * Tafel vergleicht acht Dimensionen: eine halbe Tafel wäre ein Vergleich, der
 * nichts vergleicht.
 */
export interface InsightsPublicDuelPayload {
  kind: 'duel'
  post: InsightsPublicPost
  left: InsightsPublicDuelSide
  right: InsightsPublicDuelSide
  facts: InsightsDuelFact[]
  preview?: true
}

export type InsightsPublicDuelResponse = InsightsPublicDuelPayload | InsightsPublicRedirect

/** Die Ranking-Übersicht (`GET /api/insights/public/rankings`). */
export interface InsightsPublicRankingsResponse {
  posts: InsightsPublicPostListItem[]
}

/**
 * EINE RANKING-AUSGABE (`GET /api/insights/public/rankings/<slug>`).
 *
 * `brands` ist eine KARTE Zeilen-Id → Name/Adresse und keine Liste: die
 * Einträge tragen Ids (§9.3), der Leser will Namen, und eine Liste zwänge die
 * Seite bei zehn Plätzen zu zehn linearen Suchen. Nur ÖFFENTLICHE Marken
 * stehen darin — wer fehlt, wird als Name ohne Link gezeigt.
 */
export interface InsightsPublicRankingPayload {
  kind: 'ranking'
  post: InsightsPublicPost
  ranking: InsightsRanking
  brands: Record<string, { name: string, slug: string }>
  preview?: true
}

export type InsightsPublicRankingResponse = InsightsPublicRankingPayload | InsightsPublicRedirect

/**
 * DER KORREKTURVORSCHLAG (`POST /api/insights/public/corrections`).
 *
 * `ok: true` ist ein LITERAL und sagt nichts über den Zustand des Ziels, über
 * frühere Vorschläge oder darüber, ob der Honigtopf zugeschlagen hat: „ist
 * eingegangen" ist alles, was der Absender in diesem Moment wirklich weiss
 * (wörtlich wie beim Melden im brand-Layer).
 */
export interface InsightsCorrectionSubmitResponse {
  ok: true
}

/**
 * DER NEWSLETTER-EINTRAG (`POST /api/insights/public/newsletter/subscribe`).
 *
 * `ok: true` ist ein LITERAL und sagt BEWUSST nichts weiter. Vier Fälle laufen
 * in genau diese Antwort: neue Adresse, bekannte unbestätigte, bekannte
 * BESTÄTIGTE und der zugeschnappte Honigtopf. Jede Unterscheidung wäre eine
 * Auskunft darüber, wer auf der Liste steht — an eine Adresse gerichtet, die
 * der Fragende vielleicht nicht besitzt. Was der Absender in diesem Moment
 * wirklich weiss, ist „angekommen, schau in dein Postfach".
 *
 * (Die Warteliste im brand-Layer unterscheidet `mail_sent` und
 * `already_confirmed` — dort ist das vertretbar, weil die Liste ein
 * Betreiber-Vorgang ohne öffentliche Seite ist. Hier steht das Formular auf
 * jeder Artikel-Seite, also auf einer Adresse, die jeder aufrufen kann.)
 */
export interface InsightsNewsletterSubscribeResponse {
  ok: true
}

/**
 * DIE BESTÄTIGUNG (`POST …/newsletter/confirm`).
 *
 * `already_confirmed` ist hier KEIN Leck: wer den Token hat, hat die Mail, und
 * die ging an genau diese Adresse. Zwei Zustände, damit die Seite den
 * passenden Satz sagen kann, statt zweimal „fertig".
 */
export interface InsightsNewsletterConfirmResponse {
  ok: true
  state: 'confirmed' | 'already_confirmed'
}

/**
 * DIE ABMELDUNG (`POST …/newsletter/unsubscribe`).
 *
 * EIN Zustand, und das ist die Zusage: ein zweiter Klick aus einer alten Mail
 * bekommt dieselbe 200 wie der erste (idempotent, kein 409). Ein unbekannter
 * oder abgelaufener Token ebenfalls — wer sich abmelden will, soll nie eine
 * Fehlermeldung lesen müssen.
 */
export interface InsightsNewsletterUnsubscribeResponse {
  ok: true
}
