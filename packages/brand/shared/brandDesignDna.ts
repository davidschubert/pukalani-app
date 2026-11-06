import {
  BRAND_DNA_BOARD_KINDS,
  BRAND_DNA_DIMENSION_IDS,
  BRAND_DNA_DIMENSIONS,
  BRAND_DNA_ORIGIN_TERMS,
  type BrandDnaOrigin,
  type BrandDnaValues,
  brandDnaDimension,
  brandTermById,
  brandTermLabel,
  isBrandDnaValue,
} from './brandDesignVocab'
import { type BrandDirection, brandDirectionById } from './brandDirections'
import { BRAND_FONT_PAIRS } from './brandFontPairs'
import { brandSlotValueView, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DER DNA-VORSCHLAG, DIE DREI BOARDS UND DER MIX — die REGELN, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.2 Schritte 4–5, Paket D2c).
 *
 * ── DREI SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ───────────────────
 * `g.dna` ist der VORSCHLAG (ein Text-KI-Lauf), `g.boards` sind drei
 * VARIANTEN davon (eine pure Rechnung, kein Modell), `g.mix` ist die
 * FESTLEGUNG daraus. Jede Stufe liest die vorige zurück; getrennt lägen
 * Schreiber und Leser desselben Formats in drei Dateien, und die erste
 * Format-Änderung fände nur zwei davon.
 *
 * ── DER SLOT-WERT IST DIE WAHRHEIT, NICHT EINE ANZEIGE ────────────────────
 * Anders als bei der Lesung (D2b, `brand_inspiration.reading`) gibt es hier
 * keine Tabelle daneben: die DNA lebt ausschliesslich im Slot-Wert. Er muss
 * deshalb BEIDES sein — lesbar im Handbuch (`g.dna` reist, s.
 * `sessionTravels`) und maschinell zurücklesbar für Boards, Mix und Preset.
 *
 * Gewählt ist die `structured`-Form des Layers (`brandSlotFormat.ts`): zehn
 * Blöcke, einer je Dimension, IN KATALOG-REIHENFOLGE. Gelesen wird nach
 * POSITION (die Dimension) und nach LABEL (der Wert) — dieselbe Arbeitsteilung
 * wie bei `parseBrandReadingSlotValue`, mit einem Unterschied: der WERT muss
 * hier zurückgewonnen werden, und die Überschriften stehen in der
 * Inhaltssprache der Marke. Deshalb sucht `brandDnaValueIdFromLabel` in BEIDEN
 * Sprachen des Vokabulars. Ein roher `dimension=value`-Stempel im Text wäre
 * die Alternative gewesen — er stünde dann so im Handbuch.
 *
 * ── HERKUNFT: `inspiration` ALLEIN GIBT ES NICHT ──────────────────────────
 * Leitplanke (e) aus §2.2 verlangt an jeder Zeile, woher sie kommt; Leitplanke
 * (b) verlangt, dass die Foundation der Massstab bleibt. Beides zusammen
 * heisst: eine Zeile ohne Foundation-Bezug fällt weg (die Begründung ist
 * Pflicht), und was übrig bleibt, ist `foundation` oder `both`. Die Id
 * `inspiration` bleibt trotzdem im Vokabular — ein späterer Leser (Snapshot,
 * Produkt 03) muss sie kennen, und die Klemmung soll sie ABWEISEN können,
 * nicht an ihr scheitern.
 *
 * PUR: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

// ── Der Vorschlag (`g.dna`) ────────────────────────────────────────────────

/** Die Begründung aus der Foundation — zwei bis drei Sätze, nicht mehr. */
export const BRAND_DNA_REASON_MAX = 420
/** Der Satz, der auf ein Vorbild zeigt („wie in Vorbild 3, aber wärmer"). */
export const BRAND_DNA_INSPIRATION_REASON_MAX = 320

/** EINE Zeile des Vorschlags: Dimension, Wert, Herkunft, Begründung. */
export interface BrandDnaProposalEntry {
  readonly dimension: string
  readonly value: string
  readonly origin: BrandDnaOrigin
  /** PFLICHT — die Stelle der Foundation, aus der die Zeile folgt. */
  readonly reason: string
  /** Nur bei `origin: 'both'` — der Bezug auf ein Vorbild. */
  readonly inspirationReason?: string
}

/** Die rohe Antwort des Modells: jedes Feld `unknown`, weil nichts geprüft ist. */
export interface BrandDnaRawEntry {
  dimension?: unknown
  value?: unknown
  origin?: unknown
  reason?: unknown
  inspirationReason?: unknown
}

export interface BrandDnaRawResponse {
  dna?: unknown
}

function trimTo(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // Zeilenumbrüche fallen weg: jedes dieser Felder ist EINE Aussage, und ein
  // mehrzeiliger Grund bräche die `structured`-Form des Slot-Wertes.
  return value.replace(/\s*\n\s*/g, ' ').trim().slice(0, max)
}

/**
 * ' · ' TRENNT DIE TEILE EINES BLOCK-RUMPFES (s. `brandDnaSlotValue`) — ein
 * Grund, der es selbst enthält, wäre beim Zurücklesen zwei Felder. Ersetzt
 * statt abgelehnt: der Satz des Modells ist brauchbar, nur sein Satzzeichen
 * nicht (dieselbe Regel wie in `brandReading.ts`).
 */
function withoutSeparator(value: string): string {
  return value.replace(/\s*·\s*/g, ' — ')
}

export interface BrandDnaClampResult {
  /** Die brauchbaren Zeilen, in KATALOG-Reihenfolge der Dimensionen. */
  readonly entries: readonly BrandDnaProposalEntry[]
  /** Dimensionen ohne brauchbare Zeile — die Route entscheidet daraus. */
  readonly missing: readonly string[]
}

/**
 * DIE KLEMMUNG DES VORSCHLAGS.
 *
 * BRAUCHBAR heisst: bekannte Dimension, ein Wert aus IHREM Vokabular und eine
 * Begründung. Fehlt eines davon, ist es keine Ableitung, sondern eine
 * Behauptung — sie fällt weg und die Dimension steht in `missing`.
 *
 * ── `hasInspiration` IST KEINE KOSMETIK ───────────────────────────────────
 * Auf dem Weg „Frida schlägt vor" gibt es keine Vorbilder. Ein Modell, das
 * dort trotzdem „wie in Vorbild 2" schreibt, halluziniert — die Klemmung zieht
 * deshalb JEDE Zeile auf `foundation` und wirft den Vorbild-Satz weg, statt
 * ihn dem Menschen zu zeigen.
 *
 * ── DIE ZWEI ABSTIEGE ─────────────────────────────────────────────────────
 *  · `inspiration` ⇒ `both`. Die Begründung ist Pflicht und ist immer ein
 *    Foundation-Bezug; eine Zeile, die beides trägt, IST beides (s. Kopf).
 *  · `both` ohne Vorbild-Satz ⇒ `foundation`. „Aus beidem" ohne den zweiten
 *    Beleg ist eine Behauptung über eine Quelle, die niemand nachlesen kann.
 */
export function clampBrandDnaProposal(
  raw: BrandDnaRawResponse | null | undefined,
  hasInspiration: boolean,
): BrandDnaClampResult {
  const list = Array.isArray(raw?.dna) ? raw.dna : []
  const byDimension = new Map<string, BrandDnaProposalEntry>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const entry = item as BrandDnaRawEntry
    const dimension = typeof entry.dimension === 'string' ? entry.dimension.trim() : ''
    const value = typeof entry.value === 'string' ? entry.value.trim() : ''
    if (!isBrandDnaValue(dimension, value)) continue
    // Die ERSTE brauchbare Zeile je Dimension gewinnt: eine zweite ist ein
    // Widerspruch, kein Zusatz.
    if (byDimension.has(dimension)) continue

    const reason = withoutSeparator(trimTo(entry.reason, BRAND_DNA_REASON_MAX))
    if (!reason) continue

    const rawInspiration = hasInspiration
      ? withoutSeparator(trimTo(entry.inspirationReason, BRAND_DNA_INSPIRATION_REASON_MAX))
      : ''
    const claimed = typeof entry.origin === 'string' ? entry.origin.trim() : ''
    const origin: BrandDnaOrigin = !hasInspiration
      ? 'foundation'
      : (claimed === 'both' || claimed === 'inspiration') && rawInspiration
          ? 'both'
          : 'foundation'

    byDimension.set(dimension, {
      dimension,
      value,
      origin,
      reason,
      ...(origin === 'both' ? { inspirationReason: rawInspiration } : {}),
    })
  }

  const entries: BrandDnaProposalEntry[] = []
  const missing: string[] = []
  for (const dimensionId of BRAND_DNA_DIMENSION_IDS) {
    const entry = byDimension.get(dimensionId)
    if (entry) entries.push(entry)
    else missing.push(dimensionId)
  }
  return { entries, missing }
}

/** Die Belegung hinter einem Vorschlag — Dimensions-Id → Wert-Id. */
export function brandDnaValuesOf(
  entries: readonly { readonly dimension: string, readonly value: string }[],
): BrandDnaValues {
  return Object.fromEntries(entries.map(entry => [entry.dimension, entry.value]))
}

// ── Etiketten und ihr Weg zurück ───────────────────────────────────────────

/** Die Lesefassung eines DNA-Werts in der gefragten Sprache. */
export function brandDnaValueLabel(dimensionId: string, valueId: string, locale: string): string {
  const value = brandDnaDimension(dimensionId)?.values.find(entry => entry.id === valueId)
  return value ? brandTermLabel(value, locale) : valueId
}

/** Die Lesefassung einer Dimension. */
export function brandDnaDimensionLabel(dimensionId: string, locale: string): string {
  const dimension = brandDnaDimension(dimensionId)
  return dimension ? brandTermLabel(dimension, locale) : dimensionId
}

/**
 * DER WEG ZURÜCK VON EINEM ETIKETT ZU SEINER ID — in BEIDEN Sprachen gesucht.
 *
 * Der Slot-Wert steht in der INHALTSSPRACHE der Marke; wer ihn liest, kennt
 * sie nicht unbedingt (der Client rendert in der Oberflächen-Sprache, ein
 * späterer Leser gar in einer dritten). Die Suche über beide Kataloge ist
 * eindeutig, weil die fünf Etiketten EINER Dimension in jeder Sprache
 * verschieden sind (`validateBrandDesignVocab` nagelt es).
 */
export function brandDnaValueIdFromLabel(dimensionId: string, label: string): string {
  const needle = label.trim().toLowerCase()
  const value = brandDnaDimension(dimensionId)?.values
    .find(entry => entry.de.toLowerCase() === needle || entry.en.toLowerCase() === needle)
  return value?.id ?? ''
}

function originIdFromLabel(label: string): BrandDnaOrigin | '' {
  const needle = label.trim().toLowerCase()
  const term = BRAND_DNA_ORIGIN_TERMS
    .find(entry => entry.de.toLowerCase() === needle || entry.en.toLowerCase() === needle)
  return (term?.id as BrandDnaOrigin | undefined) ?? ''
}

/** Die Lesefassung einer Herkunft („Aus Foundation und Vorbild"). */
export function brandDnaOriginLabel(origin: BrandDnaOrigin, locale: string): string {
  const term = brandTermById(BRAND_DNA_ORIGIN_TERMS, origin)
  return term ? brandTermLabel(term, locale) : origin
}

// ── Der Slot-Wert von `g.dna` ──────────────────────────────────────────────

/**
 * DER SLOT-WERT (`kind: 'structured'`) — zehn Blöcke in Katalog-Reihenfolge.
 *
 * Kopf: die Dimension. Rumpf: Wert · Herkunft · Begründung [· Vorbild-Satz].
 * Der Rumpf ist EINE Zeile, weil `formatBrandSlotStructured` daraus eine macht
 * (s. Kopf von `brandSlotFormat.ts`) — die Trennung übernimmt ' · ', und
 * `withoutSeparator` hat oben dafür gesorgt, dass kein Text sie mitbringt.
 */
export function brandDnaSlotValue(
  entries: readonly BrandDnaProposalEntry[],
  locale: string,
): string {
  return formatBrandSlotStructured(entries.map(entry => ({
    label: brandDnaDimensionLabel(entry.dimension, locale),
    body: [
      brandDnaValueLabel(entry.dimension, entry.value, locale),
      brandDnaOriginLabel(entry.origin, locale),
      entry.reason,
      ...(entry.inspirationReason ? [entry.inspirationReason] : []),
    ].join(' · '),
  })))
}

/**
 * DER WEG ZURÜCK — `null`, sobald etwas nicht passt.
 *
 * FAIL-SOFT WIE ÜBERALL: ein von Hand bearbeiteter Wert, ein Bestandswert oder
 * eine formfremde Antwort ergeben `null`, und die Werkstatt zeigt dann den
 * rohen Wert wie jeden anderen strukturierten Slot. Ein HALB gelesener
 * Vorschlag wäre schlimmer — aus ihm entstünden drei Boards mit einem Loch.
 *
 * Gelesen wird nach POSITION (Block n ⇒ Dimension n): die Überschrift steht in
 * der Inhaltssprache, und ein Leser, der sie erkennen müsste, wäre bei der
 * dritten Sprache falsch.
 */
export function parseBrandDnaSlotValue(value: string): readonly BrandDnaProposalEntry[] | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_DNA_DIMENSION_IDS.length) return null

  const entries: BrandDnaProposalEntry[] = []
  for (const [index, block] of view.blocks.entries()) {
    const dimension = BRAND_DNA_DIMENSION_IDS[index]!
    const parts = block.body.split('·').map(part => part.trim()).filter(part => part.length > 0)
    if (parts.length < 3) return null
    const valueId = brandDnaValueIdFromLabel(dimension, parts[0]!)
    const origin = originIdFromLabel(parts[1]!)
    if (!valueId || !origin) return null
    const inspirationReason = parts.slice(3).join(' — ')
    entries.push({
      dimension,
      value: valueId,
      origin,
      reason: parts[2]!,
      ...(origin === 'both' && inspirationReason ? { inspirationReason } : {}),
    })
  }
  return entries
}

// ── Die drei Boards (`g.boards`) ───────────────────────────────────────────
//
// Die drei Ids, Namen und Notizen stehen im VOKABULAR (`BRAND_DNA_BOARD_KINDS`)
// — dort, wo auch `brandChoiceOptions.ts` sie erreicht, ohne einen Import-Ring
// über `brandDirections.ts` zu legen. Hier steht die REGEL, die aus einer DNA
// drei davon macht.

/** Die Lesefassung eines Board-Namens. */
export function brandDnaBoardName(boardId: string, locale: string): string {
  const kind = BRAND_DNA_BOARD_KINDS.find(entry => entry.id === boardId)
  return kind ? brandTermLabel(kind, locale) : boardId
}

/** Die Lesefassung der Board-Notiz. */
export function brandDnaBoardNote(boardId: string, locale: string): string {
  const kind = BRAND_DNA_BOARD_KINDS.find(entry => entry.id === boardId)
  if (!kind) return ''
  return locale.toLowerCase().startsWith('de') ? kind.noteDe : kind.noteEn
}

/**
 * DIE ACHSE JEDER DIMENSION, VON RUHIG NACH LAUT.
 *
 * Sie ist die einzige Zutat der Board-Regel und deshalb die einzige Stelle,
 * an der überhaupt eine Wertung steht: „ruhiger" und „mutiger" brauchen eine
 * Richtung, sonst wären die drei Boards drei Würfe. Die Reihenfolge ist eine
 * gestalterische Setzung (Davids Inhalts-Gate wie alle Texte dieser Schicht) —
 * geprüft ist nur, dass jede Achse GENAU die fünf Werte ihrer Dimension trägt
 * (`validateBrandDnaCalmOrder`).
 *
 * NACHGERECHNET AM ABGENOMMENEN PROTOTYP: auf die Belegung von
 * `DS_DNA_PROPOSAL` angewandt erzeugt die Regel unten wörtlich die zwei
 * Varianten aus `DS_BOARDS` — ruhiger: minimal · humanist · monochrome ·
 * smooth · focused; mutiger: print90 · mixed · contrast · dense · confident.
 * Genau dafür stehen die Achsen so und nicht anders.
 */
export const BRAND_DNA_CALM_ORDER: Readonly<Record<string, readonly string[]>> = {
  style: ['minimal', 'editorial', 'technical', 'organic', 'playful'],
  era: ['timeless', 'craft', 'midcentury', 'digital', 'print90'],
  form: ['soft', 'geometric', 'irregular', 'sharp', 'mixed'],
  typography: ['humanist', 'bookish', 'geometricType', 'mono', 'contrast'],
  color: ['monochrome', 'earthy', 'airy', 'deep', 'vivid'],
  imagery: ['still', 'documentary', 'craftClose', 'people', 'abstract'],
  composition: ['calm', 'centered', 'grid', 'asymmetric', 'dense'],
  materiality: ['smooth', 'paper', 'textile', 'wood', 'glass'],
  motion: ['none', 'calmMotion', 'precise', 'springy', 'playfulMotion'],
  mood: ['focused', 'honest', 'light', 'warm', 'confident'],
}

/**
 * WELCHE FÜNF DIMENSIONEN EIN BOARD ANFASST.
 *
 * Nicht alle zehn: ein Board, das jede Zeile verschiebt, ist keine Variante
 * mehr, sondern ein zweiter Vorschlag — und der Mensch könnte die drei nicht
 * mehr vergleichen. Fünf ist die Zahl aus dem abgenommenen Prototyp, und die
 * Auswahl ist es auch: RUHIGER greift dort an, wo Lautstärke entsteht (Stil,
 * Schrift, Farbe, Oberfläche, Grundstimmung), MUTIGER dort, wo Auffälligkeit
 * entsteht (Epoche, Form, Schrift, Dichte, Grundstimmung). Schrift und
 * Grundstimmung stehen in beiden — sie tragen den Unterschied am deutlichsten.
 */
const CALMER_DIMENSIONS: readonly string[] = ['style', 'typography', 'color', 'materiality', 'mood']
const BOLDER_DIMENSIONS: readonly string[] = ['era', 'form', 'typography', 'composition', 'mood']

/**
 * EIN SCHRITT NACH AUSSEN — zum ruhigen bzw. zum lauten Ende der Achse.
 *
 * Genommen wird das ENDE, nicht der Nachbarschritt: „eine Stufe ruhiger" soll
 * ein sichtbar anderes Board sein, kein Millimeter. Steht der Vorschlag schon
 * am Ende, rückt das Board auf den ZWEITEN Wert von dort — so bewegt sich
 * jede der fünf Dimensionen IMMER, und die drei Boards unterscheiden sich
 * verlässlich in fünf Zeilen. Ein „bleibt stehen" wäre der Fall, in dem zwei
 * der drei Karten identisch aussähen.
 */
function stepOutward(dimensionId: string, current: string, direction: 'calm' | 'bold'): string {
  const order = BRAND_DNA_CALM_ORDER[dimensionId]
  if (!order || order.length < 2) return current
  const endIndex = direction === 'calm' ? 0 : order.length - 1
  const nextIndex = direction === 'calm' ? 1 : order.length - 2
  return order[current === order[endIndex] ? nextIndex : endIndex]!
}

/**
 * DIE SCHRIFT EINES BOARDS FOLGT SEINER DNA — Dimension „Typografie-Charakter"
 * auf die Paar-Id des Katalogs.
 *
 * `mono` hat kein eigenes Paar: die Mono-Rolle ist im Katalog fix und keine
 * dritte Marke (`BRAND_MONO_STACK`). Ein Board, das „Schreibmaschine" sagt,
 * bekommt deshalb das neutrale Paar — die Mono-Rolle setzt später das Kapitel
 * `type`.
 */
const FONT_PAIR_BY_TYPOGRAPHY: Readonly<Record<string, string>> = {
  bookish: 'editorial',
  humanist: 'humanist',
  geometricType: 'geometric',
  mono: 'inter',
  contrast: 'contrast',
}

export function brandFontPairForDnaTypography(typographyValue: string): string {
  return FONT_PAIR_BY_TYPOGRAPHY[typographyValue] ?? BRAND_FONT_PAIRS[0]!.id
}

/** Ein Board: dieselben zehn Dimensionen, eigene Farbrollen, eigenes Paar. */
export interface BrandDnaBoard {
  readonly id: string
  readonly values: BrandDnaValues
  /** Die tragende Farbe der Vorschau — Hex. */
  readonly base: string
  readonly accent: string
  readonly fontPairId: string
}

/**
 * DIE FARBWELT KOMMT AUS DER GEWÄHLTEN RICHTUNG, NICHT AUS DEM BOARD.
 *
 * Alle drei Boards teilen sich EINEN Dreiklang — den der Richtung aus Kapitel
 * 10 der Foundation (`result.direction`, Paket G4) — und unterscheiden sich
 * nur in seiner ROLLENVERTEILUNG. Ein vierter Farbton wäre eine Entscheidung,
 * und die gehört dem Kapitel `color` (§2.3, `h.base`): das Moodboard wählt die
 * RICHTUNG, nicht die Marken-Farbe.
 *
 *  · wie vorgeschlagen — Tiefe trägt, Mittelton akzentuiert (die Richtung selbst)
 *  · ruhiger          — Tiefe trägt und akzentuiert: monochrom, ein Ton
 *  · mutiger          — der Mittelton wird zur FLÄCHE, die Tiefe zum Akzent
 *
 * Ohne bestätigte Richtung (unbekannte Id, von Hand korrigierter Slot) gilt
 * die erste des Katalogs — die Boards sollen stehen, auch wenn die Richtung
 * nicht mehr auflösbar ist.
 */
const BOARD_ROLES: Readonly<Record<string, readonly [base: 1 | 2, accent: 1 | 2]>> = {
  proposed: [2, 1],
  calmer: [2, 2],
  bolder: [1, 2],
}

export function brandDnaBoards(
  dna: BrandDnaValues,
  directionId: string,
): readonly BrandDnaBoard[] {
  const direction: BrandDirection | null = brandDirectionById(directionId)
  const gradient = direction?.gradient ?? brandDirectionById('warm-editorial')!.gradient

  return BRAND_DNA_BOARD_KINDS.map((kind) => {
    const shift = kind.id === 'calmer'
      ? { dimensions: CALMER_DIMENSIONS, direction: 'calm' as const }
      : kind.id === 'bolder'
        ? { dimensions: BOLDER_DIMENSIONS, direction: 'bold' as const }
        : null

    const values: Record<string, string> = {}
    for (const dimensionId of BRAND_DNA_DIMENSION_IDS) {
      const current = dna[dimensionId] ?? ''
      values[dimensionId] = shift && shift.dimensions.includes(dimensionId)
        ? stepOutward(dimensionId, current, shift.direction)
        : current
    }

    const [baseRole, accentRole] = BOARD_ROLES[kind.id] ?? BOARD_ROLES.proposed!
    return {
      id: kind.id,
      values,
      base: gradient[baseRole]!,
      accent: gradient[accentRole]!,
      fontPairId: brandFontPairForDnaTypography(values.typography ?? ''),
    }
  })
}

/**
 * WORIN SICH EIN BOARD VOM VORSCHLAG UNTERSCHEIDET — die Dimensions-Ids. Die
 * Karte sagt es dem Menschen, der Beweis zählt sie.
 */
export function brandDnaBoardDifferences(
  boards: readonly BrandDnaBoard[],
  boardId: string,
): readonly string[] {
  const proposed = boards[0]
  const board = boards.find(entry => entry.id === boardId)
  if (!proposed || !board || board.id === proposed.id) return []
  return BRAND_DNA_DIMENSION_IDS.filter(id => board.values[id] !== proposed.values[id])
}

/**
 * DER SLOT-WERT VON `g.boards` — drei Blöcke, einer je Board.
 *
 * Er wird NIE zurückgelesen: die Boards entstehen bei jedem Aufruf neu aus
 * `g.dna` und der Richtung (eine pure Rechnung, kein Modell). Der Wert ist die
 * ABNAHME — was der Mensch bestätigt hat, muss aufschreibbar sein — und
 * `g.boards` ist `internal`, reist also ohnehin nicht ins Handbuch (der Vorrat
 * ist nicht die Wahl, wie `c.candidates`).
 */
export function brandDnaBoardsSlotValue(
  boards: readonly BrandDnaBoard[],
  locale: string,
): string {
  return formatBrandSlotStructured(boards.map((board) => {
    const differences = brandDnaBoardDifferences(boards, board.id)
      .map(id => brandDnaDimensionLabel(id, locale))
    return {
      label: brandDnaBoardName(board.id, locale),
      body: differences.length
        ? `${brandDnaBoardNote(board.id, locale)} — ${differences.join(', ')}`
        : brandDnaBoardNote(board.id, locale),
    }
  }))
}

// ── Mix & Match (`g.mix`) ──────────────────────────────────────────────────

/** Je Dimension: aus welchem Board ihr Wert kommt. */
export type BrandDnaMixSources = Readonly<Record<string, string>>

/** Der Ausgangspunkt: alles aus dem gewählten Board. */
export function brandDnaMixDefault(boardId: string): BrandDnaMixSources {
  return Object.fromEntries(BRAND_DNA_DIMENSION_IDS.map(id => [id, boardId]))
}

/**
 * „NICHT FESTGEHALTENE NEU VORSCHLAGEN" — jede offene Dimension rückt EIN
 * Board weiter.
 *
 * Deterministisch und im Kreis, damit zweimal Klicken nachvollziehbar ist und
 * jeder Wert wieder erreichbar bleibt. Ein Wurf über 10 × 5 Werten erzeugte
 * Kombinationen, die niemand verantwortet (Marktbefund Huemint/Fontjoy: das
 * Lock-Muster lebt davon, dass der Rest aus einem KATALOG kommt).
 *
 * Festgehaltene Dimensionen bleiben unangetastet — genau dafür hat sie jemand
 * festgehalten.
 */
export function brandDnaResuggest(
  sources: BrandDnaMixSources,
  held: Readonly<Record<string, boolean>>,
  boards: readonly BrandDnaBoard[],
): BrandDnaMixSources {
  if (boards.length === 0) return sources
  const next: Record<string, string> = { ...sources }
  for (const dimensionId of BRAND_DNA_DIMENSION_IDS) {
    if (held[dimensionId]) continue
    const current = boards.findIndex(board => board.id === sources[dimensionId])
    next[dimensionId] = boards[(current + 1) % boards.length]!.id
  }
  return next
}

/** EINE Zeile des Mixes: Wert, Board, Herkunft. */
export interface BrandDnaMixEntry {
  readonly dimension: string
  readonly value: string
  /** Aus WELCHEM Board der Wert kommt — die Herkunft des Mixes. */
  readonly board: string
  /** Foundation oder beides — die Herkunft der ABLEITUNG (§2.2 Leitplanke e). */
  readonly origin: BrandDnaOrigin
}

/**
 * DIE ZEHN ZEILEN DES MIXES.
 *
 * ── ZWEI HERKÜNFTE, UND SIE MEINEN VERSCHIEDENES ─────────────────────────
 * `board` sagt, aus welcher der drei Varianten der Wert stammt — das ist
 * Davids „Farbwelt aus 1, Typografie aus 3". `origin` sagt, ob die ABLEITUNG
 * aus der Foundation allein kam oder auch aus einem Vorbild; sie stammt vom
 * VORSCHLAG und wird übernommen, solange der Wert unverändert ist.
 *
 * Weicht der Wert vom Vorschlag ab, steht dort `foundation` — und das ist
 * keine Notlösung: die drei Boards sind pure Varianten DERSELBEN
 * Foundation-Ableitung (kein Modell, keine Bilder). Was daran anders ist,
 * kommt aus der Achse in dieser Datei, nicht aus einem Vorbild; der
 * Vorbild-Bezug wäre dort schlicht falsch.
 */
export function brandDnaMixEntries(
  boards: readonly BrandDnaBoard[],
  sources: BrandDnaMixSources,
  proposal: readonly BrandDnaProposalEntry[],
): readonly BrandDnaMixEntry[] {
  const fallback = boards[0]
  const proposalByDimension = new Map(proposal.map(entry => [entry.dimension, entry]))

  return BRAND_DNA_DIMENSION_IDS.map((dimensionId) => {
    const board = boards.find(entry => entry.id === sources[dimensionId]) ?? fallback
    const value = board?.values[dimensionId] ?? ''
    const proposed = proposalByDimension.get(dimensionId)
    return {
      dimension: dimensionId,
      value,
      board: board?.id ?? '',
      origin: proposed && proposed.value === value ? proposed.origin : 'foundation',
    }
  })
}

/** Der Slot-Wert von `g.mix` — zehn Blöcke: Wert · Board · Herkunft. */
export function brandDnaMixSlotValue(
  entries: readonly BrandDnaMixEntry[],
  locale: string,
): string {
  return formatBrandSlotStructured(entries.map(entry => ({
    label: brandDnaDimensionLabel(entry.dimension, locale),
    body: [
      brandDnaValueLabel(entry.dimension, entry.value, locale),
      brandDnaBoardName(entry.board, locale),
      brandDnaOriginLabel(entry.origin, locale),
    ].join(' · '),
  })))
}

/**
 * DER WEG ZURÜCK — die Quelle aller folgenden Kapitel.
 *
 * `null` bei allem, was nicht passt (s. `parseBrandDnaSlotValue`): D3 bis D7
 * lesen hier ihre Vorbelegung, und eine halbe DNA wäre eine Farbwelt, die es
 * nicht gibt.
 */
export function parseBrandDnaMixSlotValue(value: string): readonly BrandDnaMixEntry[] | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_DNA_DIMENSION_IDS.length) return null

  const entries: BrandDnaMixEntry[] = []
  for (const [index, block] of view.blocks.entries()) {
    const dimension = BRAND_DNA_DIMENSION_IDS[index]!
    const parts = block.body.split('·').map(part => part.trim()).filter(part => part.length > 0)
    if (parts.length < 3) return null
    const valueId = brandDnaValueIdFromLabel(dimension, parts[0]!)
    const origin = originIdFromLabel(parts[2]!)
    if (!valueId || !origin) return null
    const board = BRAND_DNA_BOARD_KINDS
      .find(kind => kind.de === parts[1] || kind.en === parts[1])?.id ?? ''
    entries.push({ dimension, value: valueId, board, origin })
  }
  return entries
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * Trägt jede Achse GENAU die fünf Werte ihrer Dimension? Nimmt eine BELIEBIGE
 * Tabelle, damit der Beweis mutierte Fassungen vorlegen kann — eine Prüfung,
 * die nur die richtige Tabelle kennt, ist immer grün.
 */
export function validateBrandDnaCalmOrder(
  order: Readonly<Record<string, readonly string[]>> = BRAND_DNA_CALM_ORDER,
): readonly string[] {
  const problems: string[] = []
  for (const dimension of BRAND_DNA_DIMENSIONS) {
    const axis = order[dimension.id]
    if (!axis) {
      problems.push(`${dimension.id}: keine Achse ruhig→laut`)
      continue
    }
    const expected = new Set(dimension.values.map(value => value.id))
    if (axis.length !== expected.size) {
      problems.push(`${dimension.id}: Achse hat ${axis.length} Werte, das Vokabular ${expected.size}`)
    }
    for (const valueId of axis) {
      if (!expected.has(valueId)) problems.push(`${dimension.id}: "${valueId}" steht nicht im Vokabular`)
    }
    if (new Set(axis).size !== axis.length) problems.push(`${dimension.id}: doppelter Wert in der Achse`)
  }
  for (const dimensionId of Object.keys(order)) {
    if (!brandDnaDimension(dimensionId)) problems.push(`unbekannte Dimension in der Achse: ${dimensionId}`)
  }
  return problems
}
