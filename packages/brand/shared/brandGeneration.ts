import { REGISTRY_VERSION } from './slotRegistry'
import type { BrandGenerationEntry, BrandNextSessionRef } from './types/brand'

/**
 * DAS §3e-STREAMING-PROTOKOLL ALS PURE REGEL — Serialisierung, Lese-Seite,
 * Sperr-Entscheidung, inputHash-Bau und Historien-Beschnitt.
 *
 * Diese Datei ist PURE und wird an BEIDEN Enden gelesen: der Server serialisiert
 * mit ihr, der Browser liest mit ihr. Genau deshalb steht hier KEIN `node:crypto`
 * — sie läge sonst im Client-Bundle. Der inputHash entsteht in zwei Schritten:
 * die KANONISCHE ZEICHENKETTE wird hier gebaut (und hier geprüft), das sha256
 * darüber zieht der Server (`brandGenerators.ts`). Die interessante Aussage —
 * „ändert sich ein Quell-Slot, ändert sich der Hash" — hängt vollständig an der
 * Zeichenkette; sha256 fügt ihr nichts hinzu, was ein Test belegen müsste.
 *
 * ── WARUM DER TYP IM DATENFELD STEHT UND NICHT NUR IM `event:` ────────────
 * Jedes Frame trägt `event: <name>` UND `data: {"type":"<name>", …}`. Der
 * `event:`-Kopf ist die SSE-Konvention (ein `EventSource` bräuchte ihn), das
 * Feld im JSON ist die Wahrheit für unseren Leser: `useBrandGeneration()`
 * konsumiert über fetch/ReadableStream, nicht über `EventSource`, und ein
 * Leser, der Frame-Köpfe UND Nutzlast zusammenhalten muss, hat eine zweite
 * Zustandsmaschine. Ein Feld kostet ~25 Bytes je Frame und spart sie.
 *
 * ── DIE SPERRE IST EINE ENTSCHEIDUNG, KEINE DATENSTRUKTUR ─────────────────
 * `brandGenerationLockHeld()` bekommt den Eintrag, die Zeit und die Frist und
 * antwortet ja/nein. Wo die Einträge liegen (In-Memory-Map im Prozess), ist
 * Sache des Servers — und bewusst NICHT Teil dieser Regel: eine spätere Ablage
 * in Redis oder in einer Tabelle tauscht den Speicher, nicht die Regel.
 */

/** Die fünf Ereignisse aus Plan §3e — in dieser Reihenfolge und keine mehr. */
export const BRAND_GENERATION_EVENTS = [
  'generation.started',
  'message.delta',
  'slot.ready',
  'generation.completed',
  'generation.failed',
] as const
export type BrandGenerationEventName = (typeof BRAND_GENERATION_EVENTS)[number]

/**
 * Warum eine Generierung nicht (mehr) läuft. Die Codes reisen im
 * `generation.failed`-Frame und sind für den MENSCHEN gedacht — die Oberfläche
 * macht daraus einen ruhigen Hinweis, keinen Fehler-Toast.
 */
export type BrandGenerationFailureCode
  = | 'ai_disabled'
    | 'no_generator'
    | 'generation_active'
    | 'provider_error'
    | 'aborted'
    | 'empty_result'
    | 'persist_failed'

/**
 * WAS EIN LAUF HERVORGEBRACHT HAT (george-a-4, Audit-Befund B3).
 *
 * `'draft'` ist der Normalfall und der Default an jeder Stelle, an der das Feld
 * fehlen darf (Rückwärtskompatibilität: ein Generator, der es nicht setzt,
 * verhält sich wie vorher). `'question'` heisst: das Material reichte nicht,
 * George hat NACHGEFRAGT statt zu erfinden — es gibt dann keinen Slot-Text,
 * kein `slot.ready` und keine Entwurfs-Markierung, nur einen Zug im Verlauf.
 */
export type BrandGenerationOutcome = 'draft' | 'question'

/**
 * ANTWORT-MÖGLICHKEITEN ZU EINER ENTWEDER-ODER-FRAGE (Davids Anforderung
 * 2026-09-04) — die Obergrenzen stehen HIER und nicht beim Parser.
 *
 * Sie werden an ZWEI Enden gebraucht: der Server klemmt beim Lesen der
 * `OPTION:`-Zeilen (`parseGeorgeOptions`), der Browser beim Auspacken des
 * Frames. Zwei Zahlenpaare wären zwei Wahrheiten darüber, was noch ein Chip
 * ist — und die Abweichung sähe man erst an einer Knopfreihe, die umbricht.
 *
 * DREI ist die Grenze, weil eine Wahl mit vier Knöpfen keine Wahl mehr ist,
 * sondern ein Menü; SECHZIG Zeichen, weil ein Chip in EINE Zeile passen muss.
 */
export const BRAND_TURN_OPTIONS_MAX = 3
export const BRAND_TURN_OPTION_LABEL_MAX = 60

/**
 * Aus einem beliebigen Wert eine gültige Optionsliste machen — oder eine leere.
 *
 * WENIGER ALS ZWEI IST KEINE WAHL: ein einzelner Knopf sähe aus wie eine
 * Zustimmung („Der Handwerker"), obwohl George eine Alternative gemeint hat.
 * Dann lieber gar keine Chips und die Frage als Text — das ist der Stand von
 * heute und damit der Rückwärts-Vertrag dieses Feldes.
 */
export function normalizeBrandTurnOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const labels: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const label = entry.trim().slice(0, BRAND_TURN_OPTION_LABEL_MAX).trim()
    if (label) labels.push(label)
    if (labels.length === BRAND_TURN_OPTIONS_MAX) break
  }
  return labels.length >= 2 ? labels : []
}

export interface BrandGenerationStartedData {
  generationId: string
  slotId: string
  stepKey: string
}

export interface BrandGenerationDeltaData {
  generationId: string
  text: string
}

export interface BrandGenerationSlotReadyData {
  generationId: string
  slotId: string
  draft: string
}

export interface BrandGenerationCompletedData {
  generationId: string
  slotId: string
  /** Die NEUE `brand_steps.revision` — ohne sie liefe der nächste Autosave in einen 409. */
  revision: number
  messageId: string | null
  model: string
  promptVersion: string
  createdAt: string
  /** Der Entwurf lag schon vor (gleicher Idempotenzschlüssel) — kein neuer KI-Aufruf. */
  reused: boolean
  /**
   * Entwurf oder Rückfrage. Der Client entscheidet daran, ob er überhaupt einen
   * Slot-Text erwartet — ohne dieses Feld müsste er aus der ABWESENHEIT eines
   * `slot.ready` schliessen, und „nichts gekommen" ist auch der Zustand eines
   * abgerissenen Stroms.
   */
  outcome: BrandGenerationOutcome
  /**
   * ANTWORT-MÖGLICHKEITEN zu der Frage, mit der dieser Zug endet (Davids
   * Anforderung 2026-09-04) — zwei oder drei kurze Beschriftungen, aus denen
   * die Bühne Chips baut.
   *
   * OPTIONAL, und das ist der Rückwärts-Vertrag: FEHLT das Feld, gibt es keine
   * Chips und die Frage steht als Text da — also exakt das Verhalten von
   * vorher. Ein Frame ohne `options` ist deshalb kein halber Frame, sondern der
   * Normalfall jeder offenen Frage.
   */
  options?: readonly string[]
  /**
   * DAS BESTÄTIGUNGS-ANGEBOT (Davids Entscheidung 2026-09-09, Session-
   * Abschluss): dieser Zug bietet die Wahl „Passt so, bestätigen" / „Ich
   * ergänze noch etwas" an — die Bühne rendert daraus zwei Knöpfe.
   *
   * Ein BOOLEAN und keine Beschriftungen: die Texte stehen im Locale-Katalog,
   * und der erste Knopf ist ohnehin keine Antwort, sondern löst `confirmSlot()`
   * aus (`georgeTurn.ts`). OPTIONAL wie `options` — fehlt es, gibt es keine
   * Knöpfe, also exakt das Verhalten von vorher.
   */
  confirm?: boolean
  /**
   * AUTO-WEITER (BW2 §5, Paket 3a): Kapitel und Session, die nach diesem Zug
   * als nächste offen sind — gerechnet vom SERVER aus dem gespeicherten Stand,
   * nie vom Client vorgeschlagen.
   *
   * OPTIONAL wie `options`, und aus demselben Grund: ein Frame ohne `next` ist
   * der Normalfall jedes Zuges, der nichts weiterschiebt (Entwurfs-Route,
   * Kapitel fertig). Fehlt es, bleibt der Mensch, wo er ist — genau das
   * Verhalten von vor BW2.
   */
  next?: BrandNextSessionRef | null
}

export interface BrandGenerationFailedData {
  generationId: string
  code: BrandGenerationFailureCode
}

export interface BrandGenerationEventDataMap {
  'generation.started': BrandGenerationStartedData
  'message.delta': BrandGenerationDeltaData
  'slot.ready': BrandGenerationSlotReadyData
  'generation.completed': BrandGenerationCompletedData
  'generation.failed': BrandGenerationFailedData
}

export type BrandGenerationEvent = {
  [N in BrandGenerationEventName]: { type: N } & BrandGenerationEventDataMap[N]
}[BrandGenerationEventName]

/**
 * EIN Frame. `JSON.stringify` maskiert Zeilenumbrüche — die `data:`-Zeile bleibt
 * also auch bei mehrzeiligem Entwurfstext EINE Zeile, und der Leser braucht
 * keine SSE-Mehrzeilen-Regel.
 */
export function serializeBrandGenerationEvent<N extends BrandGenerationEventName>(
  type: N,
  data: BrandGenerationEventDataMap[N],
): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

/**
 * DER FRAME-SPLITTER DER LESE-SEITE — pur und chunk-grenzen-fest, wie sein
 * Gegenstück im Core.
 *
 * ── WARUM HIER EINE ZWEITE FASSUNG STEHT ──────────────────────────────────
 * `decodeSseChunk()` in `packages/core/server/utils/aiCompleteStream.ts` kann
 * dasselbe — liegt aber in `server/utils`, also im NITRO-Bündel: der Browser
 * kann es nicht importieren. Ihn nach `core/shared/` zu ziehen wäre die
 * sauberere Faktorisierung, ist aber eine CORE-Änderung und gehört damit in
 * einen eigenen Commit (Repo-Regel), nicht in eine Client-Verdrahtung.
 *
 * Was hier doppelt liegt, ist ausserdem klein und eine andere Aufgabe: der
 * Core-Dekodierer versteht zusätzlich OpenAIs Chunk-FORM (choices/delta/usage),
 * dieser hier nur unser eigenes Protokoll. Geteilt wäre allein die Regel
 * „trenne an Leerzeilen, hebe den Rest auf" — zwölf Zeilen mit eigenem Beweis.
 * Wer sie zusammenlegen will, legt `core/shared/sse.ts` an und lässt BEIDE
 * darauf zeigen.
 */
export interface BrandGenerationDecodeResult {
  /** Der unvollständige Rest — beim nächsten Aufruf wieder hineingeben. */
  buffer: string
  events: BrandGenerationEvent[]
}

export function decodeBrandGenerationChunk(buffer: string, chunk: string): BrandGenerationDecodeResult {
  const combined = (buffer + chunk).replace(/\r\n/g, '\n')
  const frames = combined.split('\n\n')
  // Das letzte Stück ist per Definition unabgeschlossen.
  const rest = frames.pop() ?? ''
  const events: BrandGenerationEvent[] = []
  for (const frame of frames) {
    for (const rawLine of frame.split('\n')) {
      const line = rawLine.trimEnd()
      // `event:`-Kopf und Kommentare tragen nichts bei — die Wahrheit steht im
      // `type`-Feld der Nutzlast (s. Kopf dieser Datei).
      if (!line.startsWith('data:')) continue
      const parsed = parseBrandGenerationEvent(line.slice('data:'.length).replace(/^ /, ''))
      if (parsed) events.push(parsed)
    }
  }
  return { buffer: rest, events }
}

/** Die Lese-Seite: aus einer `data:`-Nutzlast ein geprüftes Ereignis — oder `null`. */
export function parseBrandGenerationEvent(payload: string): BrandGenerationEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  }
  catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const type = (parsed as { type?: unknown }).type
  if (typeof type !== 'string') return null
  if (!(BRAND_GENERATION_EVENTS as readonly string[]).includes(type)) return null

  /**
   * `options` IST DAS EINE FELD, DAS HIER GEPRÜFT WIRD — und das hat einen
   * Grund, der für die anderen nicht gilt: es ist das einzige, aus dem die
   * Oberfläche eine LISTE rendert (`v-for` über Chips). Ein Text statt eines
   * Arrays wäre dort kein falscher Wert, sondern ein Fehler im Rendern; alle
   * übrigen Felder landen in einer Zeichenkette und tragen sich selbst.
   * Ungültiges verschwindet, statt den Frame zu verwerfen: der Zug ist die
   * Sache, die Chips sind die Beilage.
   */
  if (type === 'generation.completed' && 'options' in (parsed as object)) {
    const { options: _raw, ...rest } = parsed as BrandGenerationCompletedData & { type: 'generation.completed' }
    const options = normalizeBrandTurnOptions(_raw)
    return options.length ? { ...rest, options } : rest
  }
  return parsed as BrandGenerationEvent
}

// ── Die Sperre: max EINE aktive Generierung je Profil × Baustein ────────────

/** §3e: „max. EINE aktive Generierung je Brand × Step". */
export const BRAND_GENERATION_LOCK_TTL_MS = 120_000

export interface BrandGenerationLockEntry {
  generationId: string
  startedAt: number
}

export function brandGenerationLockKey(profileId: string, stepKey: string): string {
  return `${profileId}:${stepKey}`
}

/**
 * Hält jemand die Sperre? Ein Eintrag ÄLTER als die Frist gilt als verwaist
 * (der Prozess ist gestorben, der Client hat die Verbindung verloren) und
 * blockiert nicht — sonst wäre ein einziger abgestürzter Lauf eine dauerhafte
 * Sperre auf diesem Baustein, und der Mensch müsste warten, ohne zu wissen
 * worauf.
 */
export function brandGenerationLockHeld(
  entry: BrandGenerationLockEntry | undefined,
  now: number,
  ttlMs: number = BRAND_GENERATION_LOCK_TTL_MS,
): boolean {
  if (!entry) return false
  return now - entry.startedAt < ttlMs
}

// ── inputHash: woraus dieser Entwurf entstanden ist ─────────────────────────

/**
 * DIE KANONISCHE ZEICHENKETTE (der Server hasht sie mit sha256).
 *
 * Sie trägt die Registry-Fassung, den Ziel-Slot, die Inhaltssprache und JEDEN
 * Quell-Slot mit seinem Wert. Getrennt wird mit dem Steuerzeichen U+0000 — einem Zeichen, das
 * in keinem Slot-Text vorkommen kann: mit einem gewöhnlichen Trennzeichen
 * liessen sich zwei verschiedene Stände zur selben Zeichenkette zusammenschieben
 * („a|b" + „c" gegen „a" + „b|c"), und dann meldete der Wizard einen Entwurf als
 * aktuell, der es nicht ist.
 *
 * Die Reihenfolge der Einträge wird NICHT sortiert — `dependencyClosure()`
 * liefert Katalog-Reihenfolge, und die ist stabil. Sortieren hier hiesse: eine
 * zweite Ordnung, die mit der ersten auseinanderlaufen kann.
 */
export function brandGenerationHashInput(
  slotId: string,
  locale: string,
  dependencies: readonly { slotId: string, value: string }[],
): string {
  const parts = [`v${REGISTRY_VERSION}`, slotId, locale]
  for (const dependency of dependencies) parts.push(dependency.slotId, dependency.value)
  return parts.join('\u0000')
}

// ── Die Historie: letzte 10 mit Entwurf, danach Metadaten ───────────────────

/** §-Anhang 2 „letzte ~10 Generationen" — hier die Zahl, an EINER Stelle. */
export const BRAND_GENERATIONS_KEEP = 10

/** Der Zod-Deckel der Spalte (Schema-Anhang §2, dieselbe Grösse wie `slots`). */
export const BRAND_GENERATIONS_MAX_LENGTH = 200_000

export interface BrandGenerationsPack {
  items: BrandGenerationEntry[]
  count: number
  json: string
}

/**
 * DER BESCHNITT. Drei Stufen, in dieser Reihenfolge:
 *
 * 1. Nur die JÜNGSTEN `keep` Einträge bleiben — ältere fliegen ganz raus.
 *    `count` zählt trotzdem weiter: „wie oft wurde hier generiert?" ist eine
 *    andere Frage als „welche Fassungen kann ich zurückholen?".
 * 2. Passt das immer noch nicht in die Spalte, werden die ÄLTESTEN Entwürfe
 *    GELEERT (die Metadaten bleiben) — ein langer Entwurf soll nicht die
 *    Herkunft aller anderen mitreissen.
 * 3. Erst wenn auch ohne jeden Entwurf zu wenig Platz ist, fallen die ältesten
 *    Einträge weg. Diese Stufe ist praktisch unerreichbar (Metadaten sind
 *    ~200 Bytes) und existiert, damit die Funktion NIE etwas zurückgibt, das
 *    das Schema ablehnt.
 *
 * Erwartete Eingabe-Ordnung: ÄLTESTE zuerst (angehängt wird hinten).
 */
export function packBrandGenerations(
  items: readonly BrandGenerationEntry[],
  count: number,
  options: { keep?: number, maxLength?: number } = {},
): BrandGenerationsPack {
  const keep = options.keep ?? BRAND_GENERATIONS_KEEP
  const maxLength = options.maxLength ?? BRAND_GENERATIONS_MAX_LENGTH

  let kept: BrandGenerationEntry[] = items.slice(-keep).map(entry => ({ ...entry }))
  const serialize = () => JSON.stringify({ items: kept, count })

  let json = serialize()
  for (let index = 0; json.length > maxLength && index < kept.length; index += 1) {
    if (kept[index]!.draft === undefined) continue
    kept[index] = { ...kept[index]!, draft: undefined }
    json = serialize()
  }
  while (json.length > maxLength && kept.length > 0) {
    kept = kept.slice(1)
    json = serialize()
  }

  return { items: kept, count, json }
}

/**
 * Metadaten OHNE Entwurf — die Form, in der die Baustein-Detailantwort ihre
 * Generationen ausgibt (`shared/types/brand.ts`: „nie ihr Inhalt"). Die
 * Fassungs-Wiederherstellung hat dafür ihre EIGENE Route, die den Entwurf
 * ausdrücklich mitschickt.
 */
export function stripBrandGenerationDrafts(
  items: readonly BrandGenerationEntry[],
): BrandGenerationEntry[] {
  return items.map(({ draft: _draft, ...meta }) => meta)
}

/**
 * Der zuletzt abgeschlossene Lauf mit DIESEM Idempotenzschlüssel — die Grundlage
 * der Wiederverwendung (§3e: „jede Generierung hat generationId +
 * Idempotenzschlüssel"). Ein doppelt abgeschickter Knopfdruck erzeugt so keinen
 * zweiten KI-Aufruf; ohne Schlüssel gibt es nichts wiederzuverwenden.
 */
export function findBrandGenerationByKey(
  items: readonly BrandGenerationEntry[],
  idempotencyKey: string | undefined,
): BrandGenerationEntry | null {
  if (!idempotencyKey) return null
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const entry = items[index]!
    if (entry.idempotencyKey === idempotencyKey && typeof entry.draft === 'string') return entry
  }
  return null
}
