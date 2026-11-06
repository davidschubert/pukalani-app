import { BRAND_DNA_DIMENSIONS, isBrandDnaValue } from './brandDesignVocab'
import { brandSlotValueView, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE LESUNG DER VORBILDER — die REGELN, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.2 Schritt 3, Paket D2b).
 *
 * ── WAS EINE LESUNG IST, UND WAS SIE NICHT IST ────────────────────────────
 * Sie ist eine DNA-BELEGUNG mit Urteil, kein Geschmacksurteil und keine
 * Bildbeschreibung: je Vorbild zwei bis drei beobachtete Werte AUS DEM
 * VOKABULAR, ein Urteil gegen die Foundation (`fits`/`tension`/`off`), die
 * STELLE der Foundation, an der gemessen wurde, und eine Begründung. Das ist
 * Leitplanke (b) aus §2.2: „Die Foundation ist der Massstab" — ein Vorbild
 * ohne Bezug zur Foundation wird nicht schöner gefunden, sondern eingeordnet.
 *
 * ── DIE KLEMMUNG IST DIE EIGENTLICHE ARBEIT ───────────────────────────────
 * Die Antwort kommt von einem Sprachmodell, das Bilder gesehen hat. Sie kann
 * Dimensionen erfinden, Werte erfinden, auf Bilder zeigen, die es nicht gibt,
 * und beliebig lang werden. `clampBrandReadings()` wirft all das weg, statt es
 * zu reparieren: eine erfundene Dimension als Freitext durchzulassen hiesse,
 * das Versprechen des Vokabulars zu brechen (`brandDesignVocab.ts`: „kein
 * Freitext, sonst kennt das Preset das Wort nicht"), und ein FEHLENDES Bild zu
 * erfinden wäre eine Lesung ohne Vorbild.
 *
 * PURE: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

/** Die drei Urteile (Ids aus `BRAND_READING_VERDICTS`). */
export const BRAND_READING_VERDICT_IDS = ['fits', 'tension', 'off'] as const
export type BrandReadingVerdict = (typeof BRAND_READING_VERDICT_IDS)[number]

export function isBrandReadingVerdict(value: unknown): value is BrandReadingVerdict {
  return typeof value === 'string'
    && (BRAND_READING_VERDICT_IDS as readonly string[]).includes(value)
}

/**
 * ZWEI BIS DREI BEOBACHTUNGEN JE BILD (§2.2 Schritt 3: „beobachtete Werte je
 * Dimension").
 *
 * Nicht zehn: ein Screenshot belegt nicht die ganze DNA, und ein Modell, das
 * zehn Zeilen liefern MUSS, füllt sieben davon mit Vermutungen. Nicht eine:
 * eine einzelne Dimension ist eine Behauptung, keine Lesung.
 */
export const BRAND_READING_OBSERVATIONS_MAX = 3

/** Die Foundation-Stelle („gemessen an: …") — eine Zeile, keine Herleitung. */
export const BRAND_READING_ANCHOR_MAX = 160
/** Die Begründung — zwei bis drei Sätze, nicht mehr. */
export const BRAND_READING_REASON_MAX = 420
/** Der Übernehmen-/Nicht-übernehmen-Satz bei Spannung und Widerspruch. */
export const BRAND_READING_SUGGESTION_MAX = 320
/** Eine Zeile des Fazits. */
export const BRAND_READING_SUMMARY_LINE_MAX = 200
/** Wie viele Zeilen je Fazit-Liste — mehr ist kein Fazit mehr. */
export const BRAND_READING_SUMMARY_MAX = 6

/** Eine beobachtete DNA-Belegung: Dimensions-Id und Wert-Id, beide aus dem Vokabular. */
export interface BrandReadingObservation {
  readonly dimension: string
  readonly value: string
}

/** Die Lesung EINES Vorbilds, wie sie in `brand_inspiration.reading` steht. */
export interface BrandReadingEntry {
  readonly observed: readonly BrandReadingObservation[]
  readonly verdict: BrandReadingVerdict
  readonly anchor: string
  readonly reason: string
  readonly suggestion?: string
  /** Wann der Lauf war, aus dem diese Lesung stammt (ISO). */
  readonly at: string
  /** WIE VIELE Bilder dieser Lauf gelesen hat — die Grundlage von `stale`. */
  readonly runSize: number
}

/** Das Fazit eines Laufs — zwei Listen, wie David es gesagt hat. */
export interface BrandReadingSummary {
  readonly keeps: readonly string[]
  readonly improves: readonly string[]
}

/**
 * DIE ROHE ANTWORT DES MODELLS. Jedes Feld ist `unknown`, weil nichts davon
 * geprüft ist — der Typ ist eine Beschreibung der ERWARTUNG, kein Beweis.
 */
export interface BrandReadingRawEntry {
  id?: unknown
  observed?: unknown
  verdict?: unknown
  anchor?: unknown
  reason?: unknown
  suggestion?: unknown
}

export interface BrandReadingRawResponse {
  readings?: unknown
  summary?: unknown
}

function trimTo(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // Zeilenumbrüche fallen weg: jedes dieser Felder ist EINE Aussage, und ein
  // mehrzeiliger `anchor` bräche die `structured`-Form des Slot-Wertes.
  return value.replace(/\s*\n\s*/g, ' ').trim().slice(0, max)
}

/**
 * ' · ' IST DAS TRENNZEICHEN DES SLOT-WERTES (s. `brandReadingSlotValue`) —
 * eine Fazit-Zeile, die es selbst enthält, wäre beim Zurücklesen zwei Zeilen.
 * Ersetzt statt abgelehnt: der Satz des Modells ist brauchbar, nur sein
 * Satzzeichen nicht.
 */
function withoutSeparator(value: string): string {
  return value.replace(/\s*·\s*/g, ' — ')
}

function clampObservations(raw: unknown): BrandReadingObservation[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: BrandReadingObservation[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as { dimension?: unknown, value?: unknown }
    const dimension = typeof entry.dimension === 'string' ? entry.dimension.trim() : ''
    const value = typeof entry.value === 'string' ? entry.value.trim() : ''
    // UNBEKANNTES FLIEGT RAUS statt als Freitext durchzugehen — sonst stünde
    // im Kapitel ein Wert, den weder das Preset noch die Oberfläche kennt.
    if (!isBrandDnaValue(dimension, value)) continue
    // Je Dimension höchstens einmal: zwei Werte derselben Dimension wären ein
    // Widerspruch, kein zusätzlicher Befund.
    if (seen.has(dimension)) continue
    seen.add(dimension)
    out.push({ dimension, value })
    if (out.length >= BRAND_READING_OBSERVATIONS_MAX) break
  }
  return out
}

function clampSummaryList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(line => withoutSeparator(trimTo(line, BRAND_READING_SUMMARY_LINE_MAX)))
    .filter(line => line.length > 0)
    .slice(0, BRAND_READING_SUMMARY_MAX)
}

export interface BrandReadingClampResult {
  /** Nur Lesungen zu Bildern, die es WIRKLICH gibt — Id → Lesung. */
  readonly readings: Record<string, BrandReadingEntry>
  readonly summary: BrandReadingSummary
  /** Die Ids, für die das Modell keine brauchbare Lesung geliefert hat. */
  readonly missing: readonly string[]
}

/**
 * DIE KLEMMUNG (§2.2: „unbekannte Ids raus, Längen begrenzt, fehlende Bilder
 * ⇒ Fehler statt Erfindung").
 *
 * `knownIds` ist die Liste der Bilder, die der Lauf geschickt hat. Eine
 * Lesung zu einer Id, die nicht darin steht, wird VERWORFEN — das Modell hat
 * sich dann ein Bild ausgedacht, und eine erfundene Lesung ist schlimmer als
 * eine fehlende. Umgekehrt landet jede Id ohne brauchbare Lesung in `missing`;
 * die ROUTE entscheidet daraus, ob der Lauf ein Fehler ist.
 *
 * BRAUCHBAR heisst: gültiges Urteil, mindestens eine Beobachtung aus dem
 * Vokabular, eine Foundation-Stelle und eine Begründung. Fehlt eines davon,
 * ist es keine Lesung, sondern eine Meinung.
 */
export function clampBrandReadings(
  raw: BrandReadingRawResponse | null | undefined,
  knownIds: readonly string[],
  at: string,
): BrandReadingClampResult {
  const known = new Set(knownIds)
  const readings: Record<string, BrandReadingEntry> = {}
  const list = Array.isArray(raw?.readings) ? raw.readings : []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const entry = item as BrandReadingRawEntry
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!known.has(id) || readings[id]) continue

    const observed = clampObservations(entry.observed)
    const verdict = entry.verdict
    const anchor = trimTo(entry.anchor, BRAND_READING_ANCHOR_MAX)
    const reason = trimTo(entry.reason, BRAND_READING_REASON_MAX)
    if (!observed.length || !isBrandReadingVerdict(verdict) || !anchor || !reason) continue

    const suggestion = trimTo(entry.suggestion, BRAND_READING_SUGGESTION_MAX)
    readings[id] = {
      observed,
      verdict,
      anchor,
      reason,
      ...(suggestion ? { suggestion } : {}),
      at,
      runSize: knownIds.length,
    }
  }

  const rawSummary = (raw?.summary ?? {}) as { keeps?: unknown, improves?: unknown }
  return {
    readings,
    summary: { keeps: clampSummaryList(rawSummary.keeps), improves: clampSummaryList(rawSummary.improves) },
    missing: knownIds.filter(id => !readings[id]),
  }
}

// ── Der Slot-Wert von `g.reading` ──────────────────────────────────────────

/**
 * DIE DREI ÜBERSCHRIFTEN — sie kommen vom Aufrufer, weil der Wert in der
 * INHALTSSPRACHE der Marke steht (dieselbe Trennung wie überall:
 * `contentLocale`, nicht `uiLocale`).
 */
export interface BrandReadingSlotLabels {
  readonly keeps: string
  readonly improves: string
  readonly run: string
  /** „Ohne Befund." — ein Block ohne Rumpf würde sonst ganz wegfallen. */
  readonly empty: string
}

/**
 * DER SLOT-WERT (`kind: 'structured'`) — drei Blöcke, IMMER alle drei.
 *
 * ── WARUM DIE ZEILEN MIT ' · ' VERBUNDEN SIND ─────────────────────────────
 * `formatBrandSlotStructured` macht aus jedem Rumpf EINE Zeile (`oneLine`) —
 * das ist die Form, auf die alle Leser dieses Layers gebaut sind. Eine
 * mehrzeilige Liste hier hiesse, den Schreiber zu umgehen und die Form von
 * Hand nachzubauen; die erste Datei, die das tut, ist die erste, die beim
 * nächsten Format-Schritt vergessen wird (Kopf von `brandSlotFormat.ts`).
 *
 * ── WARUM AUCH LEERE BLÖCKE GESCHRIEBEN WERDEN ────────────────────────────
 * Der Schreiber wirft Blöcke ohne Rumpf WEG. Fiele „Geht besser" bei einem
 * Lauf ohne Spannung weg, verschöbe sich die Reihenfolge, und
 * `parseBrandReadingSlotValue` läse den Lauf-Block als zweite Liste. Ein
 * ausdrückliches „Ohne Befund." ist ausserdem die ehrlichere Auskunft als eine
 * fehlende Überschrift.
 *
 * ── DER LAUF-BLOCK IST TEXT, KEIN DATENSATZ ───────────────────────────────
 * Zeit, Anzahl und Modell-Kennung stehen als fertiger Satz da und werden nie
 * zurückgeparst. Wer sie MASCHINELL braucht (die Veraltet-Rechnung), nimmt die
 * Lesungen selbst — dort stehen `at` und `runSize` (s. `brandReadingState`).
 */
export function brandReadingSlotValue(
  summary: BrandReadingSummary,
  runLine: string,
  labels: BrandReadingSlotLabels,
): string {
  const line = (entries: readonly string[]): string =>
    (entries.length ? entries.join(' · ') : labels.empty)
  return formatBrandSlotStructured([
    { label: `${labels.keeps} · ${summary.keeps.length}`, body: line(summary.keeps) },
    { label: `${labels.improves} · ${summary.improves.length}`, body: line(summary.improves) },
    { label: labels.run, body: runLine || labels.empty },
  ])
}

export interface BrandReadingSlotView {
  readonly keeps: readonly string[]
  readonly improves: readonly string[]
  readonly runLine: string
}

/**
 * DER WEG ZURÜCK — die Werkstatt zeigt das Fazit als zwei Listen, und nach
 * einem Seitenaufbau steht es nur noch im Slot-Wert.
 *
 * GELESEN WIRD NACH POSITION, nicht nach Überschrift: die Überschriften
 * stehen in der Inhaltssprache der Marke, und ein Leser, der sie erkennen
 * müsste, wäre bei der dritten Sprache falsch. Der Schreiber oben garantiert
 * die drei Blöcke; alles andere (Bestandswert, von Hand bearbeitet, formfremd)
 * ergibt `null` — dann zeigt die Werkstatt den rohen Wert wie jeden anderen.
 */
export function parseBrandReadingSlotValue(value: string): BrandReadingSlotView | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length < 3) return null
  const split = (body: string): string[] =>
    body.split('·').map(part => part.trim()).filter(part => part.length > 0)
  return {
    keeps: split(view.blocks[0]!.body),
    improves: split(view.blocks[1]!.body),
    runLine: view.blocks[2]!.body,
  }
}

// ── Ist die Lesung noch aktuell? ───────────────────────────────────────────

/**
 * DREI ZUSTÄNDE, EINE FRAGE: „passt die Lesung noch zu den Bildern, die da
 * liegen?"
 *
 *  · `none`   — es gibt noch keine einzige Lesung.
 *  · `stale`  — es gibt welche, aber sie beschreiben einen ANDEREN Stand.
 *  · `read`   — jedes Bild ist gelesen, und alle aus demselben Lauf.
 *
 * ── WARUM `runSize` UND NICHT EINE ID-LISTE ───────────────────────────────
 * Der naheliegende Weg wäre, die Datei-Ids des Laufs mitzuschreiben und zu
 * vergleichen. Er kostet zwölf Kopien derselben Liste (eine je Zeile) und
 * beantwortet keine Frage mehr als diese Rechnung:
 *
 *  · ein Bild kam DAZU  ⇒ es hat keine Lesung          ⇒ `stale`
 *  · ein Bild fiel WEG  ⇒ `runSize` > heutige Anzahl   ⇒ `stale`
 *  · beides zugleich    ⇒ der Neuzugang hat keine Lesung ⇒ `stale`
 *
 * Der dritte Fall ist der Grund, warum die Anzahl allein nicht reicht — und
 * die erste Bedingung der Grund, warum sie es zusammen doch tut.
 *
 * `at` fängt den halben Lauf ab: liefert ein Modell für zehn von zwölf Bildern
 * etwas Brauchbares und ein späterer Lauf ergänzt die zwei, tragen die Zeilen
 * verschiedene Zeitstempel — das Fazit im Slot-Wert gehört dann nur zu einem
 * der beiden Läufe.
 */
export type BrandReadingState = 'none' | 'stale' | 'read'

export function brandReadingState(
  entries: readonly { readonly reading: BrandReadingEntry | null }[],
): BrandReadingState {
  const readings = entries.map(entry => entry.reading).filter((r): r is BrandReadingEntry => !!r)
  if (readings.length === 0) return 'none'
  if (readings.length !== entries.length) return 'stale'
  if (readings.some(reading => reading.runSize !== entries.length)) return 'stale'
  const first = readings[0]!.at
  return readings.every(reading => reading.at === first) ? 'read' : 'stale'
}

/** Wie viele Bilder noch keine Lesung haben — die Beschriftung des Knopfes. */
export function brandReadingUnreadCount(
  entries: readonly { readonly reading: BrandReadingEntry | null }[],
): number {
  return entries.filter(entry => !entry.reading).length
}

// ── Ablage in der Zeile ────────────────────────────────────────────────────

/**
 * Die Fassung des JSON in `brand_inspiration.reading`. Sie steht drin, damit
 * ein späterer Umbau alte Zeilen erkennen kann, statt sie stillschweigend
 * falsch zu lesen — dieselbe Vorsicht wie bei `config`-JSON der Themes, nur
 * hier mit Feld, weil die Zeile keine andere Kennung hat.
 */
export const BRAND_READING_VERSION = 1

export function serializeBrandReading(entry: BrandReadingEntry): string {
  return JSON.stringify({ v: BRAND_READING_VERSION, ...entry })
}

/**
 * Zurücklesen — FAIL-SOFT: kaputtes JSON, fremde Fassung oder fehlende
 * Pflichtfelder ergeben `null`, und `null` heisst überall dasselbe wie „noch
 * nicht gelesen". Eine halbe Lesung anzuzeigen wäre schlechter als keine.
 */
export function parseBrandReading(raw: string | null | undefined): BrandReadingEntry | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const entry = parsed as Record<string, unknown>
  if (entry.v !== BRAND_READING_VERSION) return null
  const observed = clampObservations(entry.observed)
  const anchor = trimTo(entry.anchor, BRAND_READING_ANCHOR_MAX)
  const reason = trimTo(entry.reason, BRAND_READING_REASON_MAX)
  if (!observed.length || !isBrandReadingVerdict(entry.verdict) || !anchor || !reason) return null
  const suggestion = trimTo(entry.suggestion, BRAND_READING_SUGGESTION_MAX)
  return {
    observed,
    verdict: entry.verdict,
    anchor,
    reason,
    ...(suggestion ? { suggestion } : {}),
    at: typeof entry.at === 'string' ? entry.at : '',
    runSize: typeof entry.runSize === 'number' && Number.isFinite(entry.runSize) ? entry.runSize : 0,
  }
}

/** Die Ablehnungsgründe der Lesung, die als `data.code` reisen. */
export type BrandReadingRejection =
  | 'reading_no_images'
  | 'reading_unavailable'
  | 'vision_unavailable'

/**
 * DIE DIMENSIONS-IDS FÜR DEN PROMPT — Id und beide Lesefassungen, damit das
 * Modell weiss, welche Wörter es benutzen DARF. Der Prompt-Bau lebt im Server;
 * die Liste hier, weil sie aus dem Vokabular kommt und nichts anderes tut, als
 * es umzuformen.
 */
export function brandReadingVocabLines(locale: string): string[] {
  const de = locale.toLowerCase().startsWith('de')
  return BRAND_DNA_DIMENSIONS.map((dimension) => {
    const values = dimension.values.map(value => `${value.id} (${de ? value.de : value.en})`)
    return `${dimension.id} (${de ? dimension.de : dimension.en}): ${values.join(', ')}`
  })
}
