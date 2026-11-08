import { z } from 'zod'
import type { InsightsRadarVideo, InsightsTopicKey } from './insightsPost'
import { INSIGHTS_TOPIC_KEYS } from './insightsPost'

/**
 * DIE EIGENE VIDEO-LISTE DER REDAKTION (BI2 K4, Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §4 und §5).
 *
 * ── ZWEI LISTEN, EIN RECHENWEG, ZWEI LEBENSDAUERN ───────────────────────
 * Der Themenradar und die Fundstücke zeigen dieselben Spalten und rechnen
 * dieselbe Opportunity — alles andere wären zwei Wahrheiten über dasselbe
 * Video. Sie unterscheiden sich in EINEM Punkt, und der ist der Grund für
 * diese Datei: eine RADAR-Zeile ist flüchtig (täglich überschrieben,
 * 30-Tage-Netz, Alters-Deckel 180 Tage — YouTube-Policies III.E.4), eine
 * FUNDSTÜCK-Zeile bleibt, bis ein Mensch sie wegnimmt.
 *
 * ── WAS DEINS IST UND WAS YOUTUBE GEHÖRT ────────────────────────────────
 * Dauerhaft: die Video-Id, wann du sie hinzugefügt hast, dein Urteil, deine
 * Notiz, das Cluster. Das sind keine API-Daten — das sind deine
 * Aufzeichnungen ÜBER ein Video.
 * Flüchtig: Titel, Kanal, Abonnenten, Aufrufe, Likes, Kommentarzahl,
 * Veröffentlichungsdatum. Die zieht der tägliche Lauf nach; ist ein Video
 * nicht mehr abrufbar, werden die ZAHLEN geleert und die Zeile bleibt
 * (`available: false`). Im Radar ginge in diesem Fall die ganze Zeile — der
 * Unterschied ist beabsichtigt und steht im Kopf der Migration insights-007.
 *
 * ── DAS URTEIL LEBT HIER, AUCH WENN ES IM RADAR GEKLICKT WIRD ───────────
 * Das ist die tragende Entscheidung von K4. Eine Spalte an der Radar-Zeile
 * wäre naheliegend und falsch: die Zeile wird täglich überschrieben und nach
 * spätestens dreissig Tagen gelöscht, ein Urteil daran verschwände mit ihr.
 * Es liegt deshalb HIER, geschlüsselt über die Video-Id, und der Radar liest
 * es dazu. Daraus folgt die Mechanik, die der Plan beschreibt: **„Interessant"
 * im Radar zu klicken, LEGT das Video in die Fundstücke.** Der Radar ist der
 * Zulauf, diese Liste ist die Vorauswahl, und der Link-Wurf ist der zweite
 * Weg hinein — für alles, was der Radar nicht sieht.
 */

// ── Das Urteil ─────────────────────────────────────────────────────────────

/**
 * DREI STELLUNGEN, UND „NICHT GEPRÜFT" IST EINE DAVON.
 *
 * Nicht zwei plus ein `null`: „noch nicht angesehen" ist eine ANGABE, die man
 * filtern und zählen will, und ein fehlender Wert lässt sich von einem
 * fehlenden Datensatz nicht unterscheiden. Die Reihenfolge ist zugleich die
 * des Schalters in der Oberfläche.
 */
export const INSIGHTS_VERDICTS = ['unrated', 'uninteresting', 'interesting'] as const
export type InsightsVerdict = (typeof INSIGHTS_VERDICTS)[number]

/**
 * Der Ersatzwert beim LESEN einer Zeile mit unbekanntem Urteil.
 *
 * FAIL-SOFT IN DIE ENGSTE RICHTUNG, anders als beim Cluster einer Radar-Zeile
 * (`INSIGHTS_RADAR_TOPIC_FALLBACK`, dort die weiteste). Der Grund ist derselbe
 * wie überall in diesem Projekt: es kommt darauf an, was der Ersatzwert
 * ENTSCHEIDET. Eine falsche Rubrik kostet nichts; ein geratenes „interessant"
 * schöbe ein Video in die Vorauswahl, die ein Mensch nie getroffen hat — und
 * genau diese Vorauswahl ist der Zweck der Liste.
 */
export const INSIGHTS_VERDICT_FALLBACK: InsightsVerdict = 'unrated'

// ── Der Vertrag ────────────────────────────────────────────────────────────

/**
 * EIN FUNDSTÜCK — dein Teil und der Teil, den die API nachliefert.
 *
 * Er ERWEITERT `InsightsRadarVideo` bewusst nicht: jene Form trägt
 * `fetchedAt` und ein Pflicht-`topic` und beschreibt eine Radar-Zeile. Hier
 * sind dieselben Zahlen eine ABSCHRIFT, die auch leer sein darf — ein Video,
 * das gelöscht wurde, hat keine Aufrufe mehr, und `0` wäre an dieser Stelle
 * eine Behauptung.
 */
export interface InsightsWatchItem {
  videoId: string
  /** Dein Urteil — der Grund, warum es diese Liste gibt. */
  verdict: InsightsVerdict
  /** Deine Notiz. Warum hast du das aufgehoben? */
  note: string
  /** Das Cluster, unter dem du es führst. */
  topic: InsightsTopicKey
  /** Wann du es hinzugefügt hast (ISO) — die Vorgabe-Sortierung der Liste. */
  addedAt: string
  /**
   * Der Beitrag, dessen Brief aus diesem Video entstand (K5) — leer heisst
   * „noch keiner".
   *
   * Er steht HIER und nicht nur am Beitrag, und zwar für genau eine Frage,
   * die diese Liste beantworten muss: „habe ich das schon verarbeitet?". Ohne
   * die Spalte wäre der Knopf „Brief aus diesem Video" bei jedem Besuch
   * wieder unbenutzt — und ein zweiter Klick kostet echtes Geld (ein
   * Video-Lauf ist der teuerste Weg dieses Monorepos).
   *
   * Er gehört damit zur dauerhaften, menschlichen Hälfte der Zeile: ein
   * Zahlen-Nachtrag fasst ihn nie an.
   */
  briefPostId: string
  /**
   * Wann der laufende oder letzte Brief-Lauf GEBUCHT wurde (ISO) — leer heisst
   * „nie einer" (BI3).
   *
   * Sie ist der ANKER des Zustands und nicht seine Anzeige: ob daraus „läuft
   * gerade" oder „ist nicht zurückgekommen" wird, rechnet
   * `insightsBriefState()` gegen die Uhr. Eine Spalte `briefState` daneben
   * wäre eine zweite Wahrheit über dieselbe Sache — dieselbe Begründung, aus
   * der `insightsVideoUrl` gerechnet und nicht gespeichert wird.
   */
  briefRunAt: string
  /**
   * Warum der letzte Lauf nichts geliefert hat — leer heisst „kein Fehler"
   * (BI3).
   *
   * Ein GESCHLOSSENER Satz von Gründen (`INSIGHTS_BRIEF_ERRORS`), damit die
   * Oberfläche ihn übersetzen kann. Die Diagnose-Kennung des Anbieters
   * (`502 AI video failed`) gehört ins LOG und nicht in eine Spalte, die ein
   * Mensch liest.
   */
  briefError: InsightsBriefError | ''

  /** Ist das Video beim letzten Abruf noch da gewesen? */
  available: boolean
  /** Wann die Zahlen zuletzt geholt wurden (ISO) — leer heisst „noch nie". */
  refreshedAt: string

  // Ab hier: Abschrift der API. Alles optional leer.
  title: string
  channelId: string
  channelTitle: string
  channelSubscribers: number
  views: number
  likes: number
  commentCount: number
  /** `YYYY-MM-DD` oder leer. */
  publishedAt: string
}

// ── Deckel ─────────────────────────────────────────────────────────────────

/**
 * Wie viele Fundstücke die Liste trägt.
 *
 * Grosszügiger als die Kanalliste (50) und kleiner als der Radar (500), und
 * beides aus demselben Grund: das hier ist eine LESELISTE eines Menschen.
 * Zweihundert sind ein halbes Jahr Sammeln; was darüber hinausgeht, ist kein
 * Vorrat mehr, sondern ein Archiv — und für ein Archiv wäre die Liste die
 * falsche Form (sie holt ihre Zahlen täglich neu).
 *
 * Der Deckel ist zugleich der Quota-Riegel: 200 Videos sind vier Stapel à 50
 * und damit vier Einheiten je Lauf.
 */
export const INSIGHTS_WATCHLIST_MAX = 200

/** Wie lang eine Notiz sein darf — ein Gedanke, kein Artikel. */
export const INSIGHTS_WATCH_NOTE_MAX = 500

// ── Ablehnungsgründe, die als `data.code` reisen ───────────────────────────

export const INSIGHTS_WATCH_CODES = {
  /** Aus der Eingabe lässt sich keine Video-Id lesen. */
  unreadable: 'video_unreadable',
  /** Die API kennt dieses Video nicht (oder es ist privat). */
  notFound: 'video_not_found',
  /** Steht schon in der Liste. */
  duplicate: 'video_duplicate',
  /** Die Liste ist voll. */
  tooMany: 'watchlist_limit',
  /** Kein API-Schlüssel. */
  notConfigured: 'not_configured',
} as const

// ── Der Lauf an der Zeile (BI3, 2026-11-08) ────────────────────────────────

/**
 * WIE LANGE EIN VIDEO-LAUF HÖCHSTENS DAUERT.
 *
 * Es ist die Zeitgrenze, die die Route dem Transport mitgibt
 * (`packages/core/server/utils/aiVideo.ts`). Sie steht HIER und nicht als
 * Zahl in der Route, weil zwei Regeln sie brauchen und sie sonst
 * auseinanderlaufen: die Route begrenzt damit den Lauf, und
 * `INSIGHTS_BRIEF_STALL_MS` leitet daraus ab, ab wann ein Lauf als
 * verschollen gilt.
 */
export const INSIGHTS_BRIEF_TIMEOUT_MS = 180_000

/**
 * AB WANN EIN LAUF ALS VERSCHOLLEN GILT — und warum die Zahl GRÖSSER ist als
 * die Zeitgrenze.
 *
 * Ein Lauf, der noch läuft, bricht spätestens nach `INSIGHTS_BRIEF_TIMEOUT_MS`
 * von selbst ab und schreibt dann seinen Fehler an die Zeile. Verschollen ist
 * also nur, wer DANACH noch nichts geschrieben hat — der Prozess ist
 * neugestartet, der Container weg, der Deploy dazwischen.
 *
 * Die Minute Zuschlag ist kein Sicherheitsgefühl, sondern die Rechenzeit
 * danach: parsen, Adresse suchen, Beitrag anlegen, Zeile nachtragen. Eine
 * Grenze UNTERHALB der Zeitgrenze wäre der teuerste Fehler, den diese Datei
 * machen kann — sie gäbe die Zeile frei, WÄHREND der erste Lauf noch bezahlt
 * wird, und der zweite Klick zahlte ein zweites Mal. Genau das nagelt ein
 * Test fest.
 */
export const INSIGHTS_BRIEF_STALL_MS = INSIGHTS_BRIEF_TIMEOUT_MS + 60_000

/** Wie oft die Liste nachfragt, solange ein Lauf offen ist (BI3). */
export const INSIGHTS_BRIEF_POLL_MS = 5_000

/**
 * DIE GRÜNDE, AUS DENEN EIN LAUF NICHTS GELIEFERT HAT — zwei, nicht fünf.
 *
 *  · `brief_failed` — der Lauf kam nicht mit einem brauchbaren Brief zurück.
 *    Das deckt BEWUSST drei Fälle in einem: der Anbieter hat abgelehnt (nicht
 *    jedes öffentliche Video ist für das Modell lesbar — gemessen drei von
 *    zehn), die Zeitgrenze ist gerissen, oder die Antwort war kein JSON. Der
 *    Transport wirft für alle drei dasselbe `502`; eine feinere Auskunft an
 *    dieser Stelle wäre erfunden, und die Handlung des Menschen ist in allen
 *    drei Fällen dieselbe.
 *  · `slug_taken` — unsere eigene Ablehnung: zum Arbeitstitel ist keine freie
 *    Adresse zu finden. Derselbe Schlüssel, den die Route vor BI3 als
 *    `data.code` geworfen hat, und derselbe Satz in der Oberfläche.
 */
export const INSIGHTS_BRIEF_ERRORS = ['brief_failed', 'slug_taken'] as const
export type InsightsBriefError = (typeof INSIGHTS_BRIEF_ERRORS)[number]

/**
 * EIN GRUND AUS DEM SATZ — oder keiner.
 *
 * Fail-soft auf LEER und nicht auf `brief_failed`: ein unbekannter Wert in
 * der Spalte (Altstand, Hand angelegt) heisst „ich weiss es nicht", und
 * daraus einen Fehlschlag zu machen wäre eine Behauptung über einen Lauf, den
 * niemand gesehen hat.
 */
export function insightsBriefErrorOrNone(value: string | undefined): InsightsBriefError | '' {
  const raw = (value ?? '').trim()
  return (INSIGHTS_BRIEF_ERRORS as readonly string[]).includes(raw) ? raw as InsightsBriefError : ''
}

/** „Der Lauf zu diesem Video läuft noch." — die Zusage für den zweiten Klick. */
export const INSIGHTS_BRIEF_RUNNING_CODE = 'brief_running'

/**
 * FÜNF ZUSTÄNDE, UND KEINER VON IHNEN WIRD GESPEICHERT.
 *
 * Er wird aus zwei Spalten und der Uhr GERECHNET — wörtlich dieselbe
 * Entscheidung wie bei der Opportunity einer Zeile: eine gespeicherte Zahl
 * wäre die Aussage von damals, und niemand sähe ihr das an. Hier kommt dazu,
 * dass „läuft gerade" überhaupt erst durch den Zeitablauf zu „verschollen"
 * wird; eine Spalte dafür müsste jemand zurückschreiben, der in diesem Fall
 * gerade nicht mehr lebt.
 */
export const INSIGHTS_BRIEF_STATES = ['none', 'running', 'stalled', 'failed', 'done'] as const
export type InsightsBriefState = (typeof INSIGHTS_BRIEF_STATES)[number]

/**
 * DIE REIHENFOLGE DER FRAGEN IST DIE REGEL.
 *
 *  1. STEHT EIN BEITRAG? Dann ist der Brief da — egal was sonst an der Zeile
 *     steht. Das ist kein Schönheitsfehler, sondern die K5-Entscheidung „der
 *     Verweis überlebt einen Fehlschlag": ein bezahlter Brief, der angelegt
 *     ist, zählt mehr als ein Fehler-Vermerk aus einem früheren Versuch.
 *  2. STEHT EIN FEHLER? Dann ist der Lauf gelaufen und schiefgegangen.
 *  3. IST DIE BUCHUNG FRISCH? Dann läuft er noch.
 *  4. IST SIE ALT? Dann ist er nicht zurückgekommen.
 *
 * Eine Buchung in der ZUKUNFT (schiefe Uhr, Hand angelegt) zählt als „läuft"
 * — fail-safe in die teure Richtung: lieber einmal zu lange warten als ein
 * zweites Mal zahlen.
 */
export function insightsBriefState(
  item: Pick<InsightsWatchItem, 'briefPostId' | 'briefRunAt' | 'briefError'>,
  nowMs: number,
): InsightsBriefState {
  if (item.briefPostId) return 'done'
  if (item.briefError) return 'failed'
  const startedMs = item.briefRunAt ? Date.parse(item.briefRunAt) : Number.NaN
  if (Number.isNaN(startedMs)) return 'none'
  return nowMs - startedMs < INSIGHTS_BRIEF_STALL_MS ? 'running' : 'stalled'
}

/**
 * DARF EIN NEUER — BEZAHLTER — LAUF STARTEN?
 *
 * `failed` und `stalled` dürfen: beide heissen „es liegt nichts vor, das ein
 * zweiter Lauf doppeln würde". `running` und `done` dürfen nicht, und das ist
 * die eine Zusage, die diese Datei einhalten muss.
 */
export function insightsBriefStartable(state: InsightsBriefState): boolean {
  return state === 'none' || state === 'stalled' || state === 'failed'
}

/**
 * MUSS DIE LISTE WEITER NACHFRAGEN?
 *
 * Genau solange mindestens ein Lauf offen ist. `stalled` zählt NICHT mit —
 * sonst fragte die Seite bis zum Neuladen weiter nach einer Antwort, die
 * niemand mehr gibt.
 */
export function insightsBriefPending(
  items: readonly Pick<InsightsWatchItem, 'briefPostId' | 'briefRunAt' | 'briefError'>[],
  nowMs: number,
): boolean {
  return items.some(item => insightsBriefState(item, nowMs) === 'running')
}

// ── Eine YouTube-Adresse lesen ─────────────────────────────────────────────

/**
 * DIE VIDEO-ID AUS DEM, WAS EIN MENSCH EINFÜGT.
 *
 * Erlaubt ist jede Form, die beim Kopieren aus einem Browser oder einer
 * Teilen-Schaltfläche entsteht:
 *   `youtube.com/watch?v=ID` · `youtu.be/ID` · `youtube.com/shorts/ID` ·
 *   `youtube.com/live/ID` · `youtube.com/embed/ID` · die nackte Id.
 *
 * ── WARUM DIE NACKTE ID ZULETZT GEPRÜFT WIRD ────────────────────────────
 * Eine Video-Id ist elf Zeichen aus `[A-Za-z0-9_-]` — ein Muster, auf das
 * auch Bruchstücke anderer Dinge passen. Eine Adresse wird deshalb IMMER
 * zuerst als Adresse gelesen; die nackte Id ist der Fall für „ich habe nur
 * die Id".
 *
 * ── WAS NICHT GEHT, UND WARUM DAS RICHTIG IST ───────────────────────────
 * Eine PLAYLIST-Adresse (`?list=…` ohne `v=`) und ein Kanal liefern hier
 * nichts. Beides sind keine Videos, und eine Liste, die „irgendwas daraus"
 * nimmt, legt ein Video ab, das niemand gemeint hat.
 */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function insightsWatchVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  const fromUrl = videoIdFromUrl(raw)
  if (fromUrl) return fromUrl

  // Keine Adresse: dann muss es die nackte Id sein.
  if (!raw.includes('/') && VIDEO_ID_RE.test(raw)) return raw
  return null
}

function videoIdFromUrl(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  }
  catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
  const ok = (id: string | undefined) => (id && VIDEO_ID_RE.test(id) ? id : null)

  if (host === 'youtu.be') return ok(url.pathname.split('/').filter(Boolean)[0])
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] === 'watch') return ok(url.searchParams.get('v') ?? undefined)
  if (segments[0] === 'shorts' || segments[0] === 'live' || segments[0] === 'embed') return ok(segments[1])
  return null
}

/**
 * DIE ADRESSE ZU EINER VIDEO-ID — der erste der zwei Links je Zeile (§5).
 *
 * Sie wird GERECHNET und nicht gespeichert: sie folgt aus der Id, und eine
 * zweite Spalte dafür könnte von ihr abweichen.
 */
export function insightsVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

// ── Der Radar liest das Urteil dazu ────────────────────────────────────────

/**
 * WIE DER RADAR NACH DEM URTEIL FILTERT.
 *
 * Drei Stellungen, und die VORGABE ist bewusst nicht „alle": wer ein Video
 * als uninteressant abgehakt hat, soll es morgen nicht wieder oben sehen —
 * sonst ist das Urteil eine Geste ohne Wirkung. „Alle" bleibt eine Stellung,
 * damit man seine eigene Ablage nachsehen kann.
 */
export const INSIGHTS_RADAR_VERDICT_FILTERS = ['without-uninteresting', 'interesting', 'all'] as const
export type InsightsRadarVerdictFilter = (typeof INSIGHTS_RADAR_VERDICT_FILTERS)[number]
export const INSIGHTS_RADAR_VERDICT_DEFAULT: InsightsRadarVerdictFilter = 'without-uninteresting'

/** Darf eine Zeile mit diesem Urteil unter diesem Filter erscheinen? */
export function insightsVerdictPasses(verdict: InsightsVerdict, filter: InsightsRadarVerdictFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'interesting': return verdict === 'interesting'
    case 'without-uninteresting': return verdict !== 'uninteresting'
  }
}

// ── Die Formulare ──────────────────────────────────────────────────────────

const topicSchema = z.enum(INSIGHTS_TOPIC_KEYS as [InsightsTopicKey, ...InsightsTopicKey[]])
const verdictSchema = z.enum(INSIGHTS_VERDICTS as unknown as [InsightsVerdict, ...InsightsVerdict[]])

/**
 * HINZUFÜGEN — der Link-Wurf.
 *
 * Hier reist die ROHE Eingabe und nicht die Id: anders als bei der Kanalliste
 * gibt es keine Vorschau, die der Mensch bestätigt. Das ist kein Versehen —
 * bei einem Kanal entscheidet die Identität über Monate von Läufen, bei einem
 * Video entscheidet sie über eine Zeile, die man in zwei Sekunden wieder
 * wegnimmt. Eine Bestätigungsstufe wäre hier Reibung ohne Gegenwert.
 */
export const insightsWatchAddSchema = z.object({
  input: z.string().trim().min(1).max(300),
  note: z.string().trim().max(INSIGHTS_WATCH_NOTE_MAX).default(''),
  /** Ohne Angabe ordnet die Schlagwortliste ein (wie im Radar). */
  topic: topicSchema.optional(),
  /** Aus dem Radar kommt das Urteil gleich mit. */
  verdict: verdictSchema.default('unrated'),
})

/** Ändern — dasselbe Dreigespann, das einem Menschen gehört. */
export const insightsWatchPatchSchema = z.object({
  verdict: verdictSchema.optional(),
  note: z.string().trim().max(INSIGHTS_WATCH_NOTE_MAX).optional(),
  topic: topicSchema.optional(),
}).refine(
  body => body.verdict !== undefined || body.note !== undefined || body.topic !== undefined,
  'nichts zu ändern',
)

/**
 * DAS URTEIL AUS DEM RADAR — eine eigene, kleinere Form.
 *
 * Sie trägt die Video-Id statt einer Adresse, weil der Radar sie schon hat,
 * und sonst nichts. Ihr Ziel ist nicht „ein Fundstück anlegen", sondern „zu
 * DIESEM Video ein Urteil hinterlegen" — ob dafür eine Zeile entsteht, ist
 * eine Folge, keine Absicht.
 */
export const insightsWatchVerdictSchema = z.object({
  videoId: z.string().trim().regex(VIDEO_ID_RE, 'keine Video-Id'),
  verdict: verdictSchema,
})

/**
 * WAS DER RADAR EINEM FUNDSTÜCK MITGIBT, wenn ein Urteil es anlegt.
 *
 * Die Zahlen stehen in der Radar-Zeile schon da — sie noch einmal von der API
 * zu holen wäre eine Einheit für nichts. Der Lauf schreibt sie ohnehin täglich
 * neu; was hier ankommt, ist nur der erste Stand.
 */
export function insightsWatchFromRadar(
  video: InsightsRadarVideo,
  verdict: InsightsVerdict,
  addedAt: string,
): InsightsWatchItem {
  return {
    videoId: video.videoId,
    verdict,
    note: '',
    topic: video.topic,
    addedAt,
    briefPostId: '',
    briefRunAt: '',
    briefError: '',
    available: true,
    refreshedAt: addedAt,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    channelSubscribers: video.channelSubscribers,
    views: video.views,
    likes: video.likes,
    commentCount: video.commentCount,
    publishedAt: video.publishedAt,
  }
}
