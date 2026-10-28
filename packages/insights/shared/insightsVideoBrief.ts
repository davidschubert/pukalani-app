import { z } from 'zod'
import type { InsightsLocale, InsightsSource, InsightsTopicKey } from './insightsPost'
import { INSIGHTS_BRIEF_MAX, INSIGHTS_FORMATS, INSIGHTS_LOCALES, INSIGHTS_TOPICS, INSIGHTS_TOPIC_KEYS } from './insightsPost'
import { insightsVideoUrl } from './insightsWatchlist'

/**
 * DER BRIEF AUS EINEM VIDEO (BI2 K5, `insights-b-1`) — pur, damit die Sätze,
 * auf die es rechtlich ankommt, ein Test lesen kann statt eines Kommentars.
 *
 * ── WAS DIESER KNOPF IST, UND WAS ER NICHT IST ───────────────────────────
 * Er heisst „Brief aus diesem Video" und nicht „Video analysieren". Was
 * entsteht, ist der AUFTRAG an die Redaktion — Thesen, Gegenpositionen,
 * offene Fragen — nicht der Artikel. Der Artikel entsteht danach aus dem
 * bestehenden Entwurfs-Lauf (`insights-d-1`), und zwischen beidem sitzt ein
 * Mensch, der den Brief liest und ändert. Zwei Läufe statt einem, mit
 * Absicht: ein Modell, das in EINEM Zug vom fremden Video zum
 * veröffentlichbaren Text kommt, hat an keiner Stelle jemanden gefragt.
 *
 * ── DIE EINE REGEL, DIE HIER NEU IST: KEINE WÖRTLICHEN ZITATE ────────────
 * Der Entwurfs-Prompt erlaubt wörtliche Zitate, SOFERN sie im Brief stehen
 * (`insightsPrompts.ts`, HARD_RULES). Für einen Brief aus einem VIDEO gilt
 * das Gegenteil, und der Grund steht in der Mechanik unseres eigenen
 * Beleg-Riegels: `insightsReviewIssues()` prüft ein Zitat, indem es die
 * Quelle ABRUFT und den Satz im Text sucht (`evidenceIsGrounded`). Der
 * abgerufene Text einer YouTube-Seite ist Titel und Beschreibung — gesprochene
 * Sätze stehen dort nicht. Ein wörtliches Zitat aus der Tonspur wäre damit
 * nicht belegbar: es würde entweder das Gate blockieren
 * (`quote_not_grounded`) oder, schlimmer, als Behauptung darüber im Artikel
 * stehen, was jemand gesagt hat, ohne dass irgendetwas das prüfen kann.
 *
 * Deshalb verlangt dieser Prompt PARAPHRASEN MIT ZEITMARKE („bei 12:40
 * argumentiert der Sprecher, dass …"). Die Zeitmarke ist das, was ein Mensch
 * nachsehen kann — und damit mehr Beleg als ein Zitat, das niemand findet.
 *
 * Die Regel trennt AUSSAGE und FACHBEGRIFF, und das ist eine Schärfung aus
 * dem ersten echten Lauf (2026-10-27): das Modell setzte „rasterisierte" PDFs
 * in Anführungszeichen — ein Fachwort, keine Behauptung darüber, was jemand
 * gesagt hat. Ein Verbot, das auch das trifft, ist breiter als sein Zweck und
 * lädt dazu ein, es für Unsinn zu halten. Kein Fassungs-Sprung, weil
 * `insights-b-1` zu diesem Zeitpunkt noch nie gelaufen war: es gibt keinen
 * gespeicherten Brief, der sich auf die alte Fassung beruft.
 *
 * ── DIE QUELLE TRÄGT KEIN ZITAT, UND DAS IST DIESELBE ENTSCHEIDUNG ───────
 * `insightsVideoBriefSource()` setzt `quote: ''`. Ein Zitat dort würde den
 * Beleg-Riegel gegen die Videoseite laufen lassen, mit demselben Ergebnis.
 * Was die Quelle trägt, ist überprüfbar: Adresse, Kanal als Herausgeber,
 * Veröffentlichungsdatum.
 */

export const INSIGHTS_BRIEF_PROMPT_VERSION = 'insights-b-1'

/**
 * WIE VIELE CLUSTER DER BRIEF VORSCHLAGEN DARF — dieselbe Vier wie das
 * Beitrags-Schema (`topics` max 4). Eine andere Zahl hier hiesse, dass ein
 * Vorschlag nicht speicherbar ist.
 */
export const INSIGHTS_BRIEF_TOPICS_MAX = 4

/**
 * WAS DAS MODELL ZURÜCKGEBEN DARF.
 *
 * `topics` ist bewusst gegen den KATALOG geklemmt und nicht gegen „irgendeine
 * Zeichenkette": ein erfundener Cluster-Schlüssel wäre ein Thema, das es in
 * der Navigation nicht gibt. Unbekannte Werte fallen weg statt alles
 * abzulehnen — ein brauchbarer Brief soll nicht an einem Schlagwort scheitern.
 */
export const insightsVideoBriefSchema = z.object({
  title: z.string().max(200).default(''),
  brief: z.string().max(INSIGHTS_BRIEF_MAX).default(''),
  topics: z.array(z.string()).default([]).transform(keys => keys
    .map(key => key.trim())
    .filter((key): key is InsightsTopicKey => (INSIGHTS_TOPIC_KEYS as readonly string[]).includes(key))
    .slice(0, INSIGHTS_BRIEF_TOPICS_MAX)),
})

export type InsightsVideoBrief = z.infer<typeof insightsVideoBriefSchema>

export interface InsightsVideoBriefPromptInput {
  /** Die Grundsprache des künftigen Beitrags — der Brief entsteht in ihr. */
  locale: InsightsLocale
  /** Was wir über das Video schon WISSEN (aus der YouTube-API, nicht geraten). */
  videoTitle: string
  channelTitle: string
  /** `YYYY-MM-DD` — steht im Prompt, damit „heute" im Video datierbar ist. */
  publishedDate: string
  /** Das Cluster, unter dem der Mensch das Video führt. */
  topic: string
}

function languageName(locale: InsightsLocale): string {
  return locale === 'de' ? 'Deutsch (German)' : 'Englisch (English)'
}

/** Der Katalog, wie der Prompt ihn nennt: `schlüssel` (Label). */
function topicCatalog(): string {
  return INSIGHTS_TOPICS.map(topic => `${topic.key} (${topic.label})`).join(', ')
}

/**
 * DIE VERBOTE DES BRIEFS. Vier davon sind wörtlich die des Entwurfs
 * (`insightsPrompts.ts`) — sie stehen hier noch einmal, weil der Brief dem
 * Entwurf VORAUSGEHT: was hier hineinkommt, gilt dort als gegeben („wörtliche
 * Zitate stammen ausschliesslich aus dem Brief"). Ein Brief, der die Regeln
 * erst beim Entwurf einholt, hat sie zu spät.
 *
 * Das erste Verbot ist das neue und das wichtigste (s. Kopf).
 */
const BRIEF_RULES = [
  'ERFINDE KEIN ZITAT UND SCHREIBE KEINES AUF. Gib gesprochene Aussagen IMMER in eigenen Worten wieder, mit Zeitmarke — „bei 12:40 argumentiert der Sprecher, dass …". Setze KEINE AUSSAGE aus dem Video in Anführungszeichen: wir können einen gesprochenen Satz nicht belegen, eine Zeitmarke kann jeder nachsehen. (Ein FACHBEGRIFF in Anführungszeichen ist in Ordnung — er behauptet nicht, dass jemand einen Satz gesagt hat.)',
  'ERFINDE KEINE ZAHL. Jede Zahl aus dem Video bekommt ihre Zeitmarke. Zahlen, die nicht im Video fallen, gehören nicht in den Brief.',
  'SETZE NIEMANDEN HERAB. Keine wertenden Urteile über Menschen, Marken oder Kanäle; beschreibe, was gesagt und gezeigt wird.',
  'BEHAUPTE NICHTS ÜBER DAS, WAS DU NICHT GESEHEN HAST. Ist die Tonspur unverständlich oder das Video inhaltlich leer, schreibe das in den Brief, statt es zu füllen.',
  'ZÄHLE NICHT NACH, SONDERN HAKE AN. Eine Zusammenfassung ist hier nutzlos: der Brief soll sagen, WORÜBER WIR schreiben könnten — mit welcher These, gegen welche Gegenposition, mit welcher offenen Frage.',
].join('\n')

/**
 * DER BRIEF-PROMPT (`insights-b-1`).
 *
 * Die Metadaten gehen MIT hinein, obwohl das Modell das Video sieht: Titel,
 * Kanal und Datum stehen bei uns aus der YouTube-API fest. Sie im Prompt zu
 * nennen, verhindert die häufigste Erfindung — ein Modell, das das
 * Veröffentlichungsdatum aus dem Gesagten schätzt („letztes Jahr").
 *
 * Der Video-Teil selbst reist NICHT in diesem Text, sondern als eigener
 * `video_url`-Teil derselben Nachricht (`aiVideo`).
 */
export function buildInsightsVideoBriefPrompt(input: InsightsVideoBriefPromptInput): string {
  return [
    `Du siehst ein YouTube-Video und schreibst daraus einen BRIEF für die Redaktion von Brand Insights, auf ${languageName(input.locale)}.`,
    'Brand Insights ist ein redaktioneller Bereich über FREMDE Marken und über Markenarbeit. Der Brief ist ein AUFTRAG, kein Artikel: ihn liest ein Mensch, ändert ihn und gibt ihn danach in den Entwurf.',
    '',
    'WAS WIR ÜBER DAS VIDEO SCHON WISSEN (verlässlich, nicht schätzen):',
    `- Titel: ${input.videoTitle || 'unbekannt'}`,
    `- Kanal: ${input.channelTitle || 'unbekannt'}`,
    `- Veröffentlicht am: ${input.publishedDate || 'unbekannt'}`,
    `- Cluster, unter dem wir es führen: ${input.topic || 'unbekannt'}`,
    '',
    'AUFBAU DES BRIEFS (so, mit diesen Zwischenzeilen, als Markdown-Aufzählungen):',
    '1. WORUM ES GEHT — zwei bis drei Sätze, was das Video tatsächlich behandelt.',
    '2. DIE THESE, DIE EINEN ARTIKEL TRÄGT — ein Satz, prüfbar formuliert, nicht das Thema, sondern die Behauptung.',
    '3. BELEGE AUS DEM VIDEO — drei bis fünf Punkte, jeder mit Zeitmarke, jeder in eigenen Worten.',
    '4. GEGENPOSITION — was gegen die These spricht oder was das Video übergeht.',
    '5. OFFENE FRAGEN — zwei bis vier Fragen, die der Artikel klären müsste und die das Video nicht klärt.',
    '',
    BRIEF_RULES,
    '',
    `CLUSTER-KATALOG (nur diese Schlüssel, höchstens ${INSIGHTS_BRIEF_TOPICS_MAX}): ${topicCatalog()}`,
    '',
    `Der Brief ist höchstens ${INSIGHTS_BRIEF_MAX} Zeichen lang. Der Arbeitstitel ist kein Video-Titel-Echo, sondern benennt UNSERE These.`,
    '',
    'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in dieser Form, ohne Text davor oder dahinter:',
    '{"title": "Arbeitstitel unseres Beitrags", "brief": "Der Brief als Markdown", "topics": ["cluster-schluessel"]}',
  ].join('\n')
}

/**
 * WAS EIN BRIEF-AUFRUF MITSCHICKEN DARF — und warum das ein `preprocess` ist.
 *
 * Format und Grundsprache haben VORGABEN, damit ein Klick ohne Rumpf
 * funktioniert. Genau das tat es nicht: `z.object` mit lauter Defaults nimmt
 * ein Objekt, dem Schlüssel fehlen — aber kein FEHLENDES Objekt. Ein POST
 * ohne Rumpf kommt bei `readValidatedBody` als `undefined` an, und der Lauf
 * endete mit 400 „Validation Error", bevor irgendetwas passierte (beim
 * Klick-Beweis am 2026-10-27 aufgefallen, nicht im Typecheck und nicht in den
 * Tests — beide sahen nur, dass es ein Schema GIBT).
 *
 * `undefined → {}` ist deshalb Teil des Vertrags und keine Bequemlichkeit:
 * eine Route, deren Vorgaben nur greifen, wenn man ausdrücklich `{}` schickt,
 * hat keine Vorgaben.
 *
 * `article` ist die Vorgabe, weil ein Video-Brief eine THESE trägt: ein
 * Markenprofil oder ein Duell entsteht nicht aus einem fremden Video, ein
 * Ranking schon gar nicht.
 */
export const insightsBriefRequestSchema = z.preprocess(
  value => value ?? {},
  z.object({
    format: z.enum(INSIGHTS_FORMATS).default('article'),
    baseLocale: z.enum(INSIGHTS_LOCALES).default('de'),
  }),
)

export interface InsightsVideoBriefSourceInput {
  videoId: string
  channelTitle: string
  /** `YYYY-MM-DD`. Ohne Datum gibt es keine Quelle — s. unten. */
  publishedDate: string
}

/**
 * DAS VIDEO ALS QUELLE (§9.3, `kind: 'youtube'`).
 *
 * `null`, wenn das Datum fehlt — und das ist keine Bequemlichkeit, sondern
 * das Schema: eine Fremdquelle OHNE Herausgeber und Datum lässt sich nicht
 * speichern („eine Website von 2019 sagt etwas anderes als dieselbe Adresse
 * heute", `insightsSourceSchema`). Der Aufrufer macht daraus eine ehrliche
 * Ablehnung VOR dem Modell-Aufruf, statt einen Brief zu bezahlen, den er
 * danach nicht ablegen kann.
 *
 * `quote` bleibt leer — Begründung im Kopf dieser Datei.
 */
export function insightsVideoBriefSource(input: InsightsVideoBriefSourceInput): InsightsSource | null {
  if (!input.publishedDate || !input.channelTitle.trim()) return null
  return {
    url: insightsVideoUrl(input.videoId),
    publisher: input.channelTitle.trim().slice(0, 160),
    date: input.publishedDate,
    kind: 'youtube',
    quote: '',
    license: '',
  }
}

/**
 * `YYYY-MM-DD` aus dem Zeitstempel der YouTube-API (`publishedAt`, ISO).
 *
 * Bewusst ein Zuschnitt und keine `Date`-Rechnung: ein `new Date(...)` würde
 * den Tag in die ZEITZONE des Servers drehen, und ein Video, das am 1. um
 * 00:30 UTC erschien, hiesse dann je nach Maschine der 31. Das Datum einer
 * Quelle ist eine Angabe, keine Uhrzeit.
 */
export function insightsVideoPublishedDate(publishedAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(publishedAt.trim())
  return match ? match[1]! : ''
}

/**
 * DER ARBEITSTITEL. Der Vorschlag des Modells gewinnt, sonst der Video-Titel
 * — ein Beitrag ohne Titel lässt sich nicht anlegen (die Adresse entsteht aus
 * ihm), und „ohne Titel" wäre eine Adresse, die niemand wiederfindet.
 */
export function insightsBriefTitle(suggested: string, videoTitle: string): string {
  const title = suggested.trim() || videoTitle.trim()
  return title.slice(0, 200)
}
