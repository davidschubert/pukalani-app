import type { RunEventKind, RunFinalStatus } from './protocol.ts'

/**
 * `stream-json` lesen und VERDICHTEN — docs/archiv/AI-RUNNER.md § 4/§ 7.2
 * Schritt 6 und § 11.
 *
 * In `run_events` gehört BEWUSST NICHT das komplette Protokoll (§ 4): das volle
 * Transkript geht als Datei in den Bucket. Hier entsteht die Zeitleiste —
 * Statuszeilen, Werkzeugaufrufe mit Ziel, Text, Fehler.
 *
 * Alles PUR und alles DEFENSIV: die Zeilen kommen von einem fremden Prozess,
 * dessen Format sich mit der nächsten CLI-Version bewegen darf. Eine
 * unbekannte Zeile ergibt KEINEN Eintrag und wirft nicht — sie fehlt in der
 * Anzeige, und der Lauf läuft weiter. Was der Runner wirklich braucht, ist
 * genau eine Frage (§ 11: „Ein blockierter Lauf endet als success"), und die
 * wird an drei Stellen gleichzeitig gesucht, damit ein umbenanntes Feld nicht
 * still ein `needs_input` verschluckt.
 */

export interface StreamEventDraft {
  kind: RunEventKind
  message: string
}

/** Text-Blöcke werden hart gekürzt: die Zeitleiste ist eine Zeitleiste, kein Transkript. */
export const MAX_TEXT_CHARS = 500
/** Spalten-Budget von `run_events.message` (Schema `runEventsSchema`). */
export const MAX_MESSAGE_CHARS = 4000

export function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(0, max - 1))}…`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown> | null, key: string): string {
  const value = source?.[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Woran arbeitet das Werkzeug? Eine Kurzform, keine Argumentliste — die
 * Zeitleiste soll „Edit: src/api.ts" zeigen und nicht den halben Patch.
 */
export function toolTarget(input: unknown): string {
  const record = asRecord(input)
  if (!record) return ''
  for (const key of ['file_path', 'path', 'notebook_path', 'command', 'pattern', 'url', 'query', 'description', 'prompt']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return truncate(value, 120)
  }
  return ''
}

/**
 * Die Kategorie des `post_turn_summary` — an DREI Orten gesucht, weil das
 * Format nicht unser eigenes ist: oben, unter `summary` und unter
 * `post_turn_summary`. Findet man sie nicht, ist der Lauf nicht blockiert;
 * das ist die richtige Vorgabe, denn die zweite Quelle für `needs_input`
 * (`permission_denials`) prüft unabhängig davon.
 */
export function summaryStatusCategory(value: unknown): string {
  const record = asRecord(value)
  if (!record) return ''
  const nested = asRecord(record.summary) ?? asRecord(record.post_turn_summary)
  return readString(record, 'status_category') || readString(nested, 'status_category')
}

export function isPostTurnSummary(value: unknown): boolean {
  const record = asRecord(value)
  if (!record) return false
  return readString(record, 'type') === 'post_turn_summary'
    || readString(record, 'subtype') === 'post_turn_summary'
    || asRecord(record.post_turn_summary) !== null
}

/** Die `permission_denials` der Abschluss-Zeile, als kurze Namen. */
export function permissionDenials(value: unknown): string[] {
  const record = asRecord(value)
  const denials = record?.permission_denials
  if (!Array.isArray(denials)) return []
  return denials.map((entry) => {
    const denial = asRecord(entry)
    const name = readString(denial, 'tool_name') || readString(denial, 'tool') || readString(denial, 'name')
    return name || 'unbekannt'
  })
}

/**
 * Eine `stream-json`-Zeile zu Zeitleisten-Einträgen verdichten.
 *
 * `assistant` liefert je Block einen Eintrag: `tool_use` ⇒ `tool` mit Werkzeug
 * und Ziel, `text` ⇒ `text` auf 500 Zeichen gekürzt. `system` und
 * `post_turn_summary` ⇒ `status`. `user`-Zeilen (Werkzeug-Ergebnisse) ergeben
 * nichts: sie verdoppeln nur, was die `tool`-Zeile schon sagt.
 */
export function condenseStreamLine(value: unknown): StreamEventDraft[] {
  const record = asRecord(value)
  if (!record) return []

  const type = readString(record, 'type')
  const subtype = readString(record, 'subtype')

  if (isPostTurnSummary(record)) {
    const category = summaryStatusCategory(record)
    const needsAction = readString(record, 'needs_action')
      || readString(asRecord(record.summary) ?? asRecord(record.post_turn_summary), 'needs_action')
    const parts = ['Zusammenfassung', category && `Status: ${category}`, needsAction].filter(Boolean)
    return [{ kind: 'status', message: truncate(parts.join(' — '), MAX_MESSAGE_CHARS) }]
  }

  if (type === 'assistant') {
    const message = asRecord(record.message)
    const content = Array.isArray(message?.content) ? message.content : []
    const drafts: StreamEventDraft[] = []
    for (const entry of content) {
      const block = asRecord(entry)
      if (!block) continue
      const blockType = readString(block, 'type')
      if (blockType === 'tool_use') {
        const name = readString(block, 'name') || 'Werkzeug'
        const target = toolTarget(block.input)
        drafts.push({ kind: 'tool', message: truncate(target ? `${name}: ${target}` : name, MAX_MESSAGE_CHARS) })
      }
      else if (blockType === 'text') {
        const text = truncate(readString(block, 'text'), MAX_TEXT_CHARS)
        if (text) drafts.push({ kind: 'text', message: text })
      }
    }
    return drafts
  }

  if (type === 'system') {
    // Zähl-Ticks sind kein Fortschritt: `thinking_tokens` feuert im Sekundentakt
    // und hat die Zeitleiste im ersten End-zu-End-Beweis (2026-08-18) mit
    // Dutzenden gleichlautenden Zeilen geflutet. Was der Leser braucht, ist
    // „init — Modell X" und der Abschluss, nicht der Tacho.
    if (subtype === 'thinking_tokens') return []
    const model = readString(record, 'model')
    const parts = [subtype || 'system', model && `Modell ${model}`].filter(Boolean)
    return [{ kind: 'status', message: truncate(parts.join(' — '), MAX_MESSAGE_CHARS) }]
  }

  if (type === 'result') {
    const cost = typeof record.total_cost_usd === 'number' ? ` — ${record.total_cost_usd.toFixed(4)} USD` : ''
    return [{ kind: 'status', message: truncate(`Abschluss: ${subtype || 'result'}${cost}`, MAX_MESSAGE_CHARS) }]
  }

  return []
}

/** Was der Runner aus dem Abschluss-JSON mitnimmt (§ 7.2 Schritt 9). */
export interface ResultSummary {
  isError: boolean
  costUsd: number
  numTurns: number
  denials: string[]
  subtype: string
  /**
   * Die Session-Id, die die CLI selbst geführt hat (`session_id`). Bei einem
   * `--resume`-Lauf (§ 9) ist das die NEUE Session — der einzige Ort, an dem
   * der Runner sie erfährt, weil er sie nicht selbst gewürfelt hat. '' wenn die
   * Abschluss-Zeile keine trägt.
   */
  sessionId: string
}

export function readResultLine(value: unknown): ResultSummary | null {
  const record = asRecord(value)
  if (!record || readString(record, 'type') !== 'result') return null
  return {
    isError: record.is_error === true,
    costUsd: typeof record.total_cost_usd === 'number' ? record.total_cost_usd : 0,
    numTurns: typeof record.num_turns === 'number' ? record.num_turns : 0,
    denials: permissionDenials(record),
    subtype: readString(record, 'subtype'),
    sessionId: readString(record, 'session_id'),
  }
}

export interface FinalStatusInput {
  timedOut: boolean
  cancelled: boolean
  /** Abschluss-Zeile gesehen? Ohne sie ist ein Exit ≠ 0 ein Absturz */
  sawResult: boolean
  isError: boolean
  exitCode: number
  denials: string[]
  blocked: boolean
}

export interface FinalStatusDecision {
  status: RunFinalStatus
  error: string
}

/**
 * DER Punkt, an dem man dem Exit-Code NICHT glauben darf (§ 11, gemessen):
 * ohne passenden Modus verweigert die CLI headless jede Schreibaktion und
 * beendet den Lauf trotzdem mit `subtype: 'success'`, `is_error: false`. Wer
 * nur auf Exit-Code und `is_error` schaut, meldet Erfolge, die keine sind —
 * das Ergebnis ist dann bloss die höfliche Bitte um eine Berechtigung.
 *
 * Die Reihenfolge ist Absicht:
 *  1. Abbruch schlägt alles — das Board hat entschieden.
 *  2. Zeitüberschreitung ist ein Fehlschlag mit eigenem Grund.
 *  3. ECHTE Fehler (`is_error`, oder ein Exit ≠ 0 OHNE Abschluss-Zeile) vor
 *     `needs_input`: ein gerissenes Budget ist keine Rückfrage.
 *  4. Erst dann `needs_input` — aus den zwei Quellen aus § 7.2, aber FEIN
 *     unterschieden (Verfeinerung 2026-08-18):
 *     - Eine `blocked`-Summary ruft IMMER einen Menschen (der gemessene Fall:
 *       ein komplett blockierter Lauf endet als success/is_error:false). Sie
 *       schlägt jede Verweigerungs-Verrechnung.
 *     - Verweigerte Berechtigungen (`permission_denials`) OHNE `blocked`-Summary
 *       sind KEINE Blockade, solange der Lauf zu einem ERGEBNIS kam (Abschluss-
 *       Zeile gesehen): dann ist er trotz der Verweigerung fertig geworden. Der
 *       Beleg dafür (Lauf 6a844a1c, 2026-08-18): eine verweigerte Bash-
 *       Berechtigung meldete `needs_input`, obwohl Commit, Bericht und grüne
 *       Tests vorlagen. Die Verweigerung wird dann NUR notiert (run.ts:
 *       Ereigniszeile + Zahl im Bericht), nicht zur Rückfrage. FEHLT das
 *       Ergebnis, fehlt der Beweis, dass der Lauf trotzdem durchkam — dann
 *       bleibt es `needs_input`.
 */
export function deriveFinalStatus(input: FinalStatusInput): FinalStatusDecision {
  if (input.cancelled) return { status: 'cancelled', error: '' }
  if (input.timedOut) return { status: 'failed', error: 'timeout' }
  if (input.isError) return { status: 'failed', error: 'Der Agent hat den Lauf als Fehler beendet (is_error)' }
  if (!input.sawResult && input.exitCode !== 0) {
    return { status: 'failed', error: `Der Agent endete mit Exit-Code ${input.exitCode} ohne Abschluss-Meldung` }
  }
  if (input.blocked) {
    return { status: 'needs_input', error: 'Der Agent meldet sich als blockiert (post_turn_summary)' }
  }
  if (input.denials.length && !input.sawResult) {
    return { status: 'needs_input', error: `Berechtigung verweigert: ${[...new Set(input.denials)].join(', ')}` }
  }
  return { status: 'succeeded', error: '' }
}
