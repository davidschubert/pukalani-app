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
 * EIN ZU LANGER BRIEF WIRD GEKÜRZT — UND ZWAR AN EINER GRENZE.
 *
 * ── WARUM DAS SCHEMA IHN NICHT MEHR ABLEHNT ──────────────────────────────
 * Bis zum 2026-10-28 stand hier `brief: z.string().max(INSIGHTS_BRIEF_MAX)`,
 * und ein Brief über dem Deckel liess `parse` werfen. Das klingt streng und
 * ist in Wahrheit die teuerste Antwort, die diese Route geben kann: der
 * Video-Lauf ist DURCH und BEZAHLT, wenn das Schema zuschlägt. Es gibt
 * nichts zu retten und keinen Grund, es wegzuwerfen — der Deckel ist UNSER
 * Spaltenmass, nicht ein Formfehler des Modells.
 *
 * GEMESSEN, nicht vermutet (echte Läufe gegen genau diesen Prompt,
 * `gemini-3.1-flash-lite` auf `google-vertex/eu`, 2026-10-28):
 *   1575 · 1673 · 1848 · 1897 · **2027** · **2387** Zeichen
 * Zwei von sechs gelesenen Videos lagen über 2.000 — und die Länge hängt
 * NICHT an der des Videos: die 2.387 kamen aus einem Achtminüter, die 1.897
 * aus 45 Minuten. Das Modell zielt auf den Deckel, den der Prompt nennt, und
 * trifft ihn mal von unten, mal von oben. Jeder Treffer von oben kostete bei
 * der alten Fassung den ganzen Lauf (rund 2 bis 10 Cent) und gab dem
 * Menschen davor einen 500er ohne Erklärung.
 *
 * ── WARUM AN EINER GRENZE UND NICHT EINFACH `slice` ──────────────────────
 * Ein nacktes `slice(0, 2000)` endete am 2026-10-27 im Klick-Beweis wörtlich
 * mit „… den Markteintr" — mitten im Wort. Ein Auftrag, dessen letzter Satz
 * abbricht, sieht nicht nach Deckel aus, sondern nach Fehler, und der Mensch
 * davor fragt sich, was ihm fehlt. Deshalb schneidet `clampInsightsBrief` am
 * SPÄTESTEN sauberen Schluss vor dem Deckel.
 *
 * Es gewinnt das spätere von Zeilen- und Satzende, nicht das erste gefundene:
 * vom bezahlten Brief soll so viel wie möglich stehen bleiben. Erst wenn es
 * weder Zeile noch Satz gibt, wird am Wort getrennt — und wenn auch das
 * nicht geht (ein Text ohne jedes Leerzeichen), hart. Die letzte Stufe ist
 * kein Versehen: lieber ein harter Schnitt als eine leere Antwort.
 *
 * Danach fällt noch weg, was am Ende nur ANKÜNDIGT — s. `dropDanglingLead`.
 */
/**
 * EINE ÜBERSCHRIFT OHNE INHALT IST KEIN SCHLUSS.
 *
 * In der Gegenprobe vom 2026-10-28 landete der Schnitt eines 2.387-Zeichen-
 * Briefs genau auf dem Zeilenumbruch NACH „### OFFENE FRAGEN" — der Brief
 * endete also mit der Ankündigung von etwas, das nicht mehr kam. Das liest
 * sich schlechter als ein kurzer Brief: es sieht aus, als hätte das Modell
 * aufgegeben.
 *
 * Weg kommt deshalb jede abschliessende Zeile, die nur ANKÜNDIGT: eine
 * Markdown-Überschrift (hier steht sie zwangsläufig ohne Rumpf, weil nichts
 * dahinter ist) und ein leerer Aufzählungs- oder Nummern-Marker.
 */
function dropDanglingLead(text: string): string {
  let result = text.trimEnd()
  for (;;) {
    const lastBreak = result.lastIndexOf('\n')
    if (lastBreak <= 0) return result
    const lastLine = result.slice(lastBreak + 1).trim()
    if (!/^(#{1,6}\s|[-*+]$|\d+\.$)/.test(lastLine)) return result
    result = result.slice(0, lastBreak).trimEnd()
  }
}

export function clampInsightsBrief(raw: string): string {
  const text = raw.trim()
  if (text.length <= INSIGHTS_BRIEF_MAX) return text

  const cut = text.slice(0, INSIGHTS_BRIEF_MAX)
  let end = cut.lastIndexOf('\n')
  // `(?=\s|$)` — ein Punkt MITTEN in einer Zahl („3.1") ist kein Satzende;
  // einer am Ende des Zuschnitts schon, deshalb das `$`. Ein Punkt in einer
  // Abkürzung („z. B.") zählt dagegen MIT, und das ist eine Entscheidung und
  // kein Übersehen: eine Liste deutscher Abkürzungen wäre nie vollständig,
  // und der Preis ist klein — der Schnitt landet dann auf einem Satzzeichen
  // statt im Wort, nur ein paar Zeichen früher als nötig.
  const sentence = /[.!?](?=\s|$)/g
  for (let found = sentence.exec(cut); found; found = sentence.exec(cut)) {
    end = Math.max(end, found.index + 1)
  }
  if (end <= 0) end = cut.lastIndexOf(' ')
  return dropDanglingLead(end > 0 ? cut.slice(0, end) : cut)
}

/**
 * WAS DAS MODELL ZURÜCKGEBEN DARF.
 *
 * Alle drei Felder KLEMMEN, keines lehnt ab — aus dem einen Grund, der im
 * Kopf von `clampInsightsBrief` steht: wenn dieses Schema etwas zu sehen
 * bekommt, ist das Video gelesen und der Lauf bezahlt. Eine Ablehnung hier
 * wirft Geld weg, das schon ausgegeben ist.
 *
 * `topics` ist bewusst gegen den KATALOG geklemmt und nicht gegen „irgendeine
 * Zeichenkette": ein erfundener Cluster-Schlüssel wäre ein Thema, das es in
 * der Navigation nicht gibt. Unbekannte Werte fallen weg statt alles
 * abzulehnen — ein brauchbarer Brief soll nicht an einem Schlagwort scheitern.
 *
 * Beim `title` ist der harte Zuschnitt richtig und nicht faul: er ist eine
 * BESCHRIFTUNG, kein Fliesstext, und `insightsBriefTitle` schneidet ihn ohnehin
 * auf dasselbe Mass. Ein Arbeitstitel über 200 Zeichen ist kein Titel mehr,
 * sondern ein Satz — den kürzt der Mensch davor im Formular.
 */
export const insightsVideoBriefSchema = z.object({
  title: z.string().default('').transform(value => value.trim().slice(0, 200)),
  brief: z.string().default('').transform(clampInsightsBrief),
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
