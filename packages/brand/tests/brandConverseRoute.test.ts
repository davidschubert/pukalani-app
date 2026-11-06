import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { confirmableRequiredSlotsForStep, slotById } from '../shared/slotRegistry'
import { brandSlotPromptLabel, brandSlotShortLabel } from '../server/utils/brandSlotPromptLabels'
import {
  type BrandGenerationEvent,
  decodeBrandGenerationChunk,
} from '../shared/brandGeneration'

/**
 * DIE KONVERSATIONS-ROUTE, DURCHGESPIELT — mit gefälschter Ablage, echtem
 * Handler.
 *
 * Drei Aussagen tragen diese Runde, und keine davon steht in einer puren
 * Funktion:
 *
 *  1. **HIER WIRD NIE EIN FELD GESCHRIEBEN.** Kein `slot.ready`, kein
 *     `updateRow` auf `brand_steps`, keine `revision`. Das ist die Grenze
 *     zwischen „der Berater redet" und „der Berater entwirft", und sie hat
 *     eine GEGENPROBE: derselbe Aufruf gegen die Generierungs-Route schreibt
 *     nachweislich.
 *  2. **DIE REIHENFOLGE IST DER VERLAUF.** Erst die Zeile des Menschen, dann
 *     der Strom, dann die Zeile des Beraters, dann „fertig". `brand_messages`
 *     wird nach `$id` sortiert gelesen — eine Antwort vor ihrer Frage wäre ein
 *     Protokoll, das niemand mehr versteht.
 *  3. **DAS GESPRÄCH BUCHT AUF SEINEN EIGENEN EIMER.** Gemessen wird an den
 *     Schlüsseln: `brand-ai-talk-day:p1` ja, `brand-ai-slot-day:*` nie.
 *
 * Die Frames gehen wie bei der Generierung durch DENSELBEN Leser, den der
 * Browser benutzt — Server und Client hängen damit an EINEM Beweis.
 */

const appConfig = { pukalani: { brand: { aiDailyInstanceCap: 1000 } } }

let hits: string[] = []
let bucketCounts: Record<string, number> = {}

interface FakeRow { $id: string, [key: string]: unknown }

const profileRow: FakeRow = {
  $id: 'p1',
  $createdAt: '2026-08-01T00:00:00.000Z',
  $updatedAt: '2026-08-01T00:00:00.000Z',
  createdByUserId: 'u1',
  ownerType: 'user',
  ownerId: 'u1',
  title: 'Testmarke',
  contentLocale: 'de',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'unknown',
  websiteUrl: 'https://kailua.coffee',
  industry: 'Kaffeerösterei',
  about: 'Wir rösten Kaffee in kleinen Mengen.',
  audience: 'Cafés auf Maui.',
  progressPct: 0,
  currentStepKey: 'context',
  lastActivityAt: '2026-08-01T00:00:00.000Z',
}

let stepRow: FakeRow
let stepRows: FakeRow[]
let appConfigRow: FakeRow
/** Die Reihenfolge ALLER Wirkungen — Schreibvorgänge und gesendete Frames. */
let timeline: string[]
/** Die geschriebenen `brand_messages`-Zeilen, in der Reihenfolge der Anlage. */
let messageRows: Record<string, unknown>[]
/** Was `listRows` für den Verlauf liefert (ABSTEIGEND, wie die Route fragt). */
let historyRows: FakeRow[]
/** Die Abfragen gegen `brand_messages`, als Zeichenketten — je Aufruf eine Liste. */
let messageQueries: string[][]
/** Antwort der Existenz-Prüfung „hat diese Session schon einen George-Zug?". */
let sessionProbeRows: FakeRow[]
/** Antwort der Existenz-Prüfung „hat dieses Kapitel schon eine Nachricht?". */
let stepProbeRows: FakeRow[]
/**
 * Was die Kapitel-Antworten-Abfrage liefert (converse-12): die Antworten des
 * MENSCHEN im ganzen Kapitel, ABSTEIGEND — wie die Route fragt.
 */
let chapterAnswerRows: FakeRow[]
/** Was auf `brand_steps` geschrieben wurde (Sammel-Session, s. dort). */
let stepWrites: Record<string, unknown>[]
/** Welchen Baustein die Route sieht — `getRouterParam('stepKey')`. */
let routeStepKey: string
/** Die offenen Befunde (brand-014) — Grundlage des „hat mitgelesen"-Blocks. */
let findingRows: FakeRow[]

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') return profileRow
    if (tableId === 'brand_steps') {
      const hit = stepRows.find(row => row.$id === rowId)
      if (!hit) throw new Error('not found')
      return hit
    }
    if (tableId === 'app_config') return appConfigRow
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: unknown[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    if (tableId === 'brand_messages') {
      // VIER Abfragen teilen sich diese Tabelle, und sie sind an ihrer FORM zu
      // unterscheiden: die Kapitel-Antworten (converse-12) filtern auf `role`
      // UND sortieren absteigend, die Existenz-Prüfung der Session filtert nur
      // auf `role`, die des Kapitels sortiert nicht, der Verlauf sortiert
      // absteigend ohne Rollen-Filter.
      const asText = (queries ?? []).map(query => String(query))
      messageQueries.push(asText)
      const joined = asText.join(' ')
      if (joined.includes('"role"') && joined.includes('orderDesc')) return { rows: chapterAnswerRows }
      if (joined.includes('"role"')) return { rows: sessionProbeRows }
      if (!joined.includes('orderDesc')) return { rows: stepProbeRows }
      return { rows: historyRows }
    }
    if (tableId === 'brand_findings') return { rows: findingRows }
    return { rows: [] }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: {
    tableId: string
    rowId?: string
    data?: Record<string, unknown>
  }) => {
    timeline.push(`write:${tableId}`)
    if (tableId === 'brand_steps' && data) stepWrites.push(data)
    if (tableId === 'brand_findings' && data) {
      const row = findingRows.find(entry => entry.$id === rowId)
      if (row) Object.assign(row, data)
    }
    return stepRow
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    timeline.push(`write:${tableId}`)
    if (tableId === 'brand_messages') messageRows.push(data)
    return { $id: `row${messageRows.length}` }
  }),
}

/** Was das Modell schreibt — je Test austauschbar. */
let modelText: string
let modelFails: Error | null
const aiCompleteStream = vi.fn(async (
  _event: unknown,
  prompt: string,
  options: { system: string, onDelta?: (text: string) => Promise<void> | void },
) => {
  lastPrompt = prompt
  lastSystem = options.system
  if (modelFails) throw modelFails
  // In Stücken, wie ein echter Anbieter — der Putzer muss über die Grenzen hinweg
  // dasselbe Ergebnis liefern.
  for (const chunk of modelText.match(/[\s\S]{1,7}/g) ?? []) await options.onDelta?.(chunk)
  return { text: modelText, model: 'test-model', provider: 'test', aborted: false }
})
let lastPrompt = ''
let lastSystem = ''

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => (name === 'id' ? 'p1' : routeStepKey))
vi.stubGlobal('getEffectiveAiConfig', async () => ({ model: 'configured-model' }))
vi.stubGlobal('aiCompleteStream', aiCompleteStream)

let body: Record<string, unknown>
vi.stubGlobal('readBody', async () => body)
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:test:',
  store: {
    hit: async (key: string) => {
      const bucket = key.replace('rl:test:', '')
      hits.push(bucket)
      return { count: bucketCounts[bucket] ?? 1, resetInMs: 3_600_000 }
    },
  },
}))

const handler = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/converse.post'))
  .default as unknown as (event: H3Event) => Promise<unknown>
const { clearBrandConverseKeys } = await import('../server/utils/brandConverse')
const { clearActiveBrandGenerations } = await import('../server/utils/brandGenerators')

function fakeEvent() {
  const chunks: string[] = []
  const closeHandlers: (() => void)[] = []
  const res = {
    writableEnded: false,
    headed: false,
    writeHead(..._args: unknown[]) { this.headed = true },
    write(chunk: string) {
      chunks.push(chunk)
      timeline.push(`send:${/"type":"([^"]+)"/.exec(chunk)?.[1] ?? 'unknown'}`)
      return true
    },
    end() { this.writableEnded = true },
  }
  const req = { on(name: string, fn: () => void) { if (name === 'close') closeHandlers.push(fn) } }
  return {
    event: { node: { req, res }, context: {} } as unknown as H3Event,
    chunks,
    res,
    close: () => closeHandlers.forEach(fn => fn()),
  }
}

function readBack(chunks: readonly string[]): BrandGenerationEvent[] {
  let buffer = ''
  const events: BrandGenerationEvent[] = []
  for (const letter of [...chunks.join('')]) {
    const step = decodeBrandGenerationChunk(buffer, letter)
    buffer = step.buffer
    events.push(...step.events)
  }
  return events
}

function stepRowFor(stepKey: string, overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'open',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    revision: 0,
    activeSeconds: 0,
    ...overrides,
  }
}

const TALK_BUCKET = 'brand-ai-talk-day:p1'
const ACCOUNT_BUCKET = 'brand-ai-day:u1'
const INSTANCE_BUCKET = 'brand-ai-instance-day'

beforeEach(() => {
  timeline = []
  hits = []
  bucketCounts = {}
  messageRows = []
  historyRows = []
  messageQueries = []
  sessionProbeRows = []
  stepProbeRows = []
  chapterAnswerRows = []
  stepWrites = []
  findingRows = []
  routeStepKey = 'context'
  modelText = 'Das nehme ich mit. Was loben eure Kunden an euch?'
  modelFails = null
  lastPrompt = ''
  lastSystem = ''
  appConfigRow = { $id: 'global', brandAiEnabled: true }
  // `a.origin` ist beantwortet ⇒ die nächste offene Frage ist `a.customerPraise`.
  stepRow = stepRowFor('context', {
    revision: 3,
    slots: JSON.stringify({ 'a.origin': { confirmed: 'Wir haben 2019 angefangen.' } }),
  })
  stepRows = [stepRow, stepRowFor('pvm')]
  body = {
    text: 'Weil uns der Kaffee hier zu langweilig war.',
    slotId: 'a.origin',
    question: 'Warum habt ihr angefangen?',
    nextSlotId: 'a.customerPraise',
    nextQuestion: 'Was loben eure Kunden?',
  }
  tablesDB.updateRow.mockClear()
  tablesDB.createRow.mockClear()
  aiCompleteStream.mockClear()
  clearBrandConverseKeys()
  clearActiveBrandGenerations()
})

describe('POST …/steps/:stepKey/converse', () => {
  it('sendet Start, Deltas und Abschluss — und NIE ein `slot.ready`', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)
    const events = readBack(chunks)

    expect(events[0]!.type).toBe('generation.started')
    expect(events.filter(item => item.type === 'message.delta').length).toBeGreaterThanOrEqual(4)
    expect(events.at(-1)!.type).toBe('generation.completed')
    // DIE Grenze dieser Runde: ein Zug füllt kein Feld.
    expect(events.some(item => item.type === 'slot.ready')).toBe(false)
    expect(new Set(events.map(item => item.generationId)).size).toBe(1)
  })

  it('GEGENPROBE: kein einziger Schreibvorgang auf `brand_steps`', async () => {
    const { event } = fakeEvent()
    await handler(event)
    // Kein Slot, kein inputHash, keine neue Fassung. Der plausible Umbau wäre,
    // die Antwort „sicherheitshalber" auch hier zu speichern — genau der fällt
    // hier durch.
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(timeline).not.toContain('write:brand_steps')
    // Und die gemeldete Fassung ist die GELESENE, nicht eine erhöhte.
    const completed = readBack([]).at(-1)
    expect(completed).toBeUndefined()
  })

  it('meldet die GELESENE revision, ohne sie zu erhöhen', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({
      type: 'generation.completed',
      revision: 3,
      outcome: 'question',
      reused: false,
    })
  })

  it('SCHREIBT IN DER REIHENFOLGE DES VERLAUFS: Mensch, Strom, Berater, fertig', async () => {
    const { event } = fakeEvent()
    await handler(event)
    const first = timeline.indexOf('write:brand_messages')
    const started = timeline.indexOf('send:generation.started')
    const last = timeline.lastIndexOf('write:brand_messages')
    const completed = timeline.indexOf('send:generation.completed')

    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(started)
    expect(last).toBeGreaterThan(started)
    expect(last).toBeLessThan(completed)
  })

  it('legt beide Zeilen mit ihrer Art an — `answer` und `reply`', async () => {
    const { event } = fakeEvent()
    await handler(event)

    expect(messageRows).toHaveLength(2)
    expect(messageRows[0]).toMatchObject({ role: 'user', body: body.text, stepKey: 'context' })
    expect(JSON.parse(String(messageRows[0]!.parts))).toEqual({ kind: 'answer', slotId: 'a.origin' })
    expect(messageRows[1]).toMatchObject({ role: 'george', body: modelText })
    expect(JSON.parse(String(messageRows[1]!.parts))).toEqual({ kind: 'reply', slotId: 'a.origin' })
    // Dieselbe Id verbindet Antwort und Reaktion.
    expect(messageRows[0]!.generationId).toBe(messageRows[1]!.generationId)
  })

  it('PUTZT verirrte Marker aus dem Zug, statt sie in den Verlauf zu schreiben', async () => {
    // Dasselbe Modell schreibt in anderen Zügen mit `BASIS:`/`ASK:` — hier
    // gehört das Etikett weg, nicht in die Sprechblase.
    modelText = 'BASIS: eure Antwort\nDas nehme ich mit.\nASK: Was loben eure Kunden?'
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(String(messageRows[1]!.body)).not.toMatch(/^(BASIS|ASK):/m)
    expect(String(messageRows[1]!.body)).toContain('Das nehme ich mit.')
    const streamed = readBack(chunks)
      .filter(item => item.type === 'message.delta')
      .map(item => (item as { text: string }).text)
      .join('')
    expect(streamed).not.toContain('BASIS:')
    expect(streamed).not.toContain('ASK:')
  })
})

/**
 * ANTWORT-MÖGLICHKEITEN (Davids Anforderung 2026-09-04) — die Wahl reist
 * STRUKTURIERT, nicht als Text.
 *
 * Drei Aussagen, und jede hat ihre eigene Bruchstelle:
 *  1. Die Beschriftungen erreichen das Abschluss-Frame — daraus baut die Bühne
 *     die Knöpfe.
 *  2. Sie stehen NICHT im persistierten `body` und nicht im Strom: dort wären
 *     sie roher Marker-Text in der Sprechblase.
 *  3. `parts` trägt sie additiv — ein künftiger Verlaufs-Leser soll wissen,
 *     welche Wahl damals angeboten wurde.
 */
describe('Antwort-Möglichkeiten', () => {
  const WITH_OPTIONS = [
    'Das trage ich mit. Was passt besser zu euch?',
    'OPTION: Der Handwerker',
    'OPTION: Der Mentor',
  ].join('\n')

  it('trägt die Beschriftungen ins Abschluss-Frame', async () => {
    modelText = WITH_OPTIONS
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({
      type: 'generation.completed',
      options: ['Der Handwerker', 'Der Mentor'],
    })
  })

  it('GEGENPROBE: im Zug selbst steht keine einzige OPTION-Zeile', async () => {
    modelText = WITH_OPTIONS
    const { event, chunks } = fakeEvent()
    await handler(event)

    // Weder gespeichert …
    expect(String(messageRows[1]!.body)).toBe('Das trage ich mit. Was passt besser zu euch?')
    expect(String(messageRows[1]!.body)).not.toContain('OPTION')
    expect(String(messageRows[1]!.body)).not.toContain('Der Handwerker')
    // … noch gestreamt: ein Delta kennt kein Zurück.
    const streamed = readBack(chunks)
      .filter(item => item.type === 'message.delta')
      .map(item => (item as { text: string }).text)
      .join('')
    expect(streamed).not.toContain('OPTION')
    expect(streamed).not.toContain('Der Mentor')
  })

  it('legt sie ADDITIV in `parts` — neben `kind` und `slotId`', async () => {
    modelText = WITH_OPTIONS
    const { event } = fakeEvent()
    await handler(event)
    expect(JSON.parse(String(messageRows[1]!.parts))).toEqual({
      kind: 'reply',
      slotId: 'a.origin',
      options: ['Der Handwerker', 'Der Mentor'],
    })
  })

  it('RÜCKWÄRTS-VERTRAG: ohne OPTION-Zeilen bleibt alles wie bisher', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)
    const completed = readBack(chunks).at(-1) as { options?: unknown }
    expect(completed.options).toBeUndefined()
    expect(JSON.parse(String(messageRows[1]!.parts))).toEqual({ kind: 'reply', slotId: 'a.origin' })
  })

  it('EINE Möglichkeit ist keine Wahl — kein Feld, und die Zeile ist trotzdem weg', async () => {
    modelText = 'Passt der Handwerker?\nOPTION: Der Handwerker'
    const { event, chunks } = fakeEvent()
    await handler(event)
    const completed = readBack(chunks).at(-1) as { options?: unknown }
    expect(completed.options).toBeUndefined()
    expect(String(messageRows[1]!.body)).toBe('Passt der Handwerker?')
  })
})

describe('Der Kill-Switch und die stillen Neins', () => {
  it('KI AUS ⇒ `{ conversed: false }`, kein Strom, keine Zeile, keine Buchung', async () => {
    appConfigRow = { $id: 'global', brandAiEnabled: false }
    const { event, res } = fakeEvent()
    const result = await handler(event)

    expect(result).toEqual({ conversed: false })
    // Kein `writeHead`: ein `fetch` sieht eine gewöhnliche JSON-Antwort und die
    // Werkstatt verhält sich wie vor P3.2.
    expect(res.headed).toBe(false)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(hits).toEqual([])
    expect(aiCompleteStream).not.toHaveBeenCalled()
  })

  it('GEGENPROBE: fehlt die Spalte, gilt dasselbe (fail-closed)', async () => {
    appConfigRow = { $id: 'global' }
    const { event } = fakeEvent()
    expect(await handler(event)).toEqual({ conversed: false })
  })

  it('DERSELBE IDEMPOTENZSCHLÜSSEL kostet kein zweites Mal', async () => {
    body = { ...body, idempotencyKey: 'k1' }
    const first = fakeEvent()
    await handler(first.event)
    expect(aiCompleteStream).toHaveBeenCalledOnce()

    hits = []
    const second = fakeEvent()
    expect(await handler(second.event)).toEqual({ conversed: false })
    expect(aiCompleteStream).toHaveBeenCalledOnce()
    expect(hits).toEqual([])
  })

  it('ein LAUFENDER Zug im selben Baustein wird still übergangen', async () => {
    aiCompleteStream.mockImplementationOnce(async (_event, _prompt, options) => {
      await new Promise(resolve => setTimeout(resolve, 40))
      await options.onDelta?.(modelText)
      return { text: modelText, model: 'test-model', provider: 'test', aborted: false }
    })
    const first = fakeEvent()
    const running = handler(first.event)
    const second = fakeEvent()
    const result = await handler(second.event)
    await running

    // Kein Fehler-Frame, kein Hinweis: die Antwort ist gespeichert, die Frage
    // steht da — es fehlt nur die Reaktion.
    expect(result).toEqual({ conversed: false })
    expect(second.res.headed).toBe(false)
  })
})

describe('Die Drossel des Gesprächs', () => {
  it('bucht den GESPRÄCHS-Eimer, nie den eines Slots', async () => {
    const { event } = fakeEvent()
    await handler(event)
    expect(hits).toEqual([TALK_BUCKET, ACCOUNT_BUCKET, INSTANCE_BUCKET])
    // Der Punkt der Entscheidung: wer antwortet, verliert nicht die Entwürfe
    // für das Feld, für das er geantwortet hat.
    expect(hits.some(key => key.startsWith('brand-ai-slot-day'))).toBe(false)
  })

  it('DER GESPRÄCHS-DECKEL lehnt ab — und verbraucht die weiteren NICHT', async () => {
    bucketCounts[TALK_BUCKET] = 41
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_ai_talk_limit' },
    })
    expect(hits).toEqual([TALK_BUCKET])
    expect(aiCompleteStream).not.toHaveBeenCalled()
    // Und die Zeile des Menschen wird auch nicht geschrieben — abgewiesen wird
    // VOR jeder Wirkung.
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('gibt den Burst-Platz nach einem Nein wieder frei', async () => {
    const module = await import('../server/utils/brandGenerators')
    bucketCounts[TALK_BUCKET] = 41
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 429 })
    expect(module.countActiveBrandGenerations('u1')).toBe(0)

    bucketCounts = {}
    const second = fakeEvent()
    await handler(second.event)
    expect(module.countActiveBrandGenerations('u1')).toBe(0)
  })
})

describe('Die nächste Frage gehört der Registry', () => {
  it('nimmt den Wortlaut, wenn er zur berechneten Frage gehört', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('[the next question]\nWas loben eure Kunden?')
    expect(lastPrompt).toContain('Ask it IN YOUR OWN WORDS')
    // converse-13 (Davids Klick-Test): das Profil dieses Tests gründet ALLEIN
    // — die Weiche muss den Auftrag erreichen, nicht nur die Beschriftungen.
    expect(lastPrompt).toContain('BUILDS THIS BRAND ALONE')
    // Und die Werkstatt erfährt, dass diese Frage gestellt wurde — daran hängt,
    // ob der Katalog-Satz darunter noch einmal erscheint.
    expect(readBack(chunks).at(-1)).toMatchObject({ slotId: 'a.customerPraise' })
  })

  it('VERWIRFT einen Wortlaut, der zu einer ANDEREN Frage gehört', async () => {
    // Ein zweiter Tab hat weitergearbeitet — der Client zeigt eine Frage, die
    // der Server gar nicht als nächste sieht.
    body = { ...body, nextSlotId: 'a.challenge', nextQuestion: 'Was ist eure größte Hürde?' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).not.toContain('Was ist eure größte Hürde?')
    expect(lastPrompt).toContain('Do NOT')
    expect(readBack(chunks).at(-1)).toMatchObject({ slotId: '' })
  })

  it('RECHNET MIT ÜBERSPRUNGENEN FRAGEN — sonst zeigten beide auf Verschiedenes', async () => {
    // „Weiß ich nicht" auf `a.customerPraise`: der Server speichert davon
    // nichts und käme ohne diese Liste auf dieselbe Frage zurück.
    body = {
      ...body,
      skipped: ['a.customerPraise'],
      nextSlotId: 'a.complaints',
      nextQuestion: 'Worüber beschweren sich Kunden?',
    }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).toContain('[the next question]\nWorüber beschweren sich Kunden?')
  })

  it('OHNE Katalog-Frage, ABER offene Pflicht-Felder: nie „fertig" behaupten (converse-3)', async () => {
    // Alle FRAGE-Slots bestätigt, aber Ableitungs-Pflichten (a.pitch & Co.)
    // stehen noch — Davids Live-Fund am Krume-Archetyp: der alte Zweig sagte
    // hier „nichts mehr offen", während vier Felder unbestätigt waren.
    stepRow.slots = JSON.stringify(Object.fromEntries(
      ['a.origin', 'a.customerPraise', 'a.complaints', 'a.oneThing', 'a.challenge', 'a.facts']
        .map(id => [id, { confirmed: 'steht' }]),
    ))
    body = { text: 'Und was ist hier eigentlich noch offen?' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THERE ARE NO MORE CATALOG QUESTIONS')
    expect(lastPrompt).toContain('Never claim the chapter is done')
    expect(lastPrompt).not.toContain('THERE IS NO OPEN QUESTION LEFT')
    expect(readBack(chunks).at(-1)).toMatchObject({ slotId: '' })
  })

  it('ALLES bestätigt: der Auftrag sagt „nichts mehr offen"', async () => {
    stepRow.slots = JSON.stringify(Object.fromEntries(
      confirmableRequiredSlotsForStep('context').map(slot => [slot.id, { confirmed: 'steht' }]),
    ))
    body = { text: 'Und was heißt eigentlich Positionierung?' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THERE IS NO OPEN QUESTION LEFT')
    expect(readBack(chunks).at(-1)).toMatchObject({ slotId: '' })
  })

  /**
   * TESTLAUF-BEFUND 2 (2026-09-09): der Mensch ERGÄNZTE etwas im
   * Gründungsimpuls; der Zug endete mit der Frage der nächsten Session
   * („Kundenstimmen"). Die Bühne stand aber weiter auf dem Gründungsimpuls
   * (`brandStageClaim`) — die Antwort darauf landete deshalb dort.
   *
   * Der Riegel gehört dem SERVER: der Auftrag sagt „bleib bei diesem Feld" UND
   * die Eingaben tragen keine fremde Frage mehr. Zwei Aussagen über denselben
   * Zug, die auseinanderlaufen könnten, gibt es damit nicht.
   */
  it('EINE UNBESTÄTIGTE SESSION HÄLT DEN ZUG — keine fremde Frage, nirgends', async () => {
    // `a.origin` trägt einen unbestätigten Entwurf, der Mensch sitzt darauf.
    stepRow.slots = JSON.stringify({ 'a.origin': { latestDraft: 'Wir haben 2019 angefangen.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = {
      text: 'Und noch etwas: der erste Sack kam aus Kona.',
      sessionKey: 'a.origin',
      slotId: 'a.origin',
      // Genau das, was der Browser heute schickt, wenn die Bühne auf einem
      // beantworteten Feld steht — der Wegweiser des KAPITELS.
      nextSlotId: 'a.customerPraise',
      nextQuestion: 'Was loben eure Kunden?',
    }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain(
      `THIS TURN BELONGS TO "${brandSlotPromptLabel('a.origin', 'de', 'new', 'solo')}"`,
    )
    // Der fremde Wortlaut erreicht weder den Auftrag noch die Eingaben.
    expect(lastPrompt).not.toContain('Was loben eure Kunden?')
    expect(lastPrompt).not.toContain('[the next question]')
    expect(lastPrompt).not.toContain('CLOSE YOUR TURN WITH THE NEXT OPEN QUESTION')
    // Und die Bühne erfährt, dass KEINE Katalog-Frage gestellt wurde.
    expect(readBack(chunks).at(-1)).toMatchObject({ slotId: '' })
  })

  it('GEGENPROBE: ist die nächste Frage die EIGENE, wird sie ganz normal gestellt', async () => {
    // Leeres Feld, aktive Session = die nächste offene Frage: hier ist „stell
    // sie" genau richtig, und der Riegel darf nicht greifen.
    stepRow.slots = '{}'
    stepRows = [stepRow, stepRowFor('pvm')]
    body = {
      text: 'Kurz gesagt: Langeweile.',
      sessionKey: 'a.origin',
      slotId: 'a.origin',
      nextSlotId: 'a.origin',
      nextQuestion: 'Warum habt ihr angefangen?',
    }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('[the next question]\nWarum habt ihr angefangen?')
    expect(lastPrompt).toContain('CLOSE YOUR TURN WITH THE NEXT OPEN QUESTION')
    expect(lastPrompt).not.toContain('THIS TURN BELONGS TO')
  })

  it('GEGENPROBE: eine BESTÄTIGTE Session hält den Zug nicht fest', async () => {
    // Vertiefen an einem abgeschlossenen Feld ist ein Gespräch, kein offener
    // Punkt — der Weg darf dort weitergehen.
    stepRow.slots = JSON.stringify({ 'a.origin': { confirmed: 'Wir haben 2019 angefangen.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = {
      text: 'Nur eine Rückfrage dazu.',
      sessionKey: 'a.origin',
      nextSlotId: 'a.customerPraise',
      nextQuestion: 'Was loben eure Kunden?',
    }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).not.toContain('THIS TURN BELONGS TO')
    expect(lastPrompt).toContain('[the next question]\nWas loben eure Kunden?')
  })

  it('nimmt eine FREIE Frage ohne Slot an', async () => {
    body = { text: 'Was meinst du mit Positionierung?' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(readBack(chunks).at(-1)!.type).toBe('generation.completed')
    expect(JSON.parse(String(messageRows[0]!.parts))).toEqual({ kind: 'answer' })
  })

  it('lehnt einen Slot aus einem ANDEREN Baustein ab', async () => {
    body = { ...body, slotId: 'b.purpose' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 400 })
  })

  it('lehnt einen leeren Text ab', async () => {
    body = { ...body, text: '   ' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'invalid_body' } })
  })
})

describe('Der Verlauf und der Kontext', () => {
  it('legt die letzten Nachrichten in den Prompt — ÄLTESTE zuerst', async () => {
    // Die Route fragt absteigend und dreht um.
    historyRows = [
      { $id: 'm2', profileId: 'p1', stepKey: 'context', role: 'george', body: 'Und für wen?' },
      { $id: 'm1', profileId: 'p1', stepKey: 'context', role: 'user', body: 'Wir sind eine Rösterei.' },
    ]
    const { event } = fakeEvent()
    await handler(event)

    const older = lastPrompt.indexOf('person: Wir sind eine Rösterei.')
    const newer = lastPrompt.indexOf('you: Und für wen?')
    expect(older).toBeGreaterThanOrEqual(0)
    expect(newer).toBeGreaterThan(older)
  })

  it('reicht Startkarte, Baustein-Werte und den getippten Text durch', async () => {
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).toContain('Kaffeerösterei')
    // Menschliche Beschriftung statt interner Id (converse-2, Davids
    // Live-Fund 2026-09-03: George sprach `a.customerPraise` & Co. nach).
    expect(lastPrompt).toContain('[Warum hast du angefangen — was war der Auslöser, welches Problem konntest du nicht ignorieren?]\nWir haben 2019 angefangen.')
    expect(lastPrompt).not.toContain('[a.origin]')
    expect(lastPrompt).toContain('[what they just wrote]\nWeil uns der Kaffee hier zu langweilig war.')
    expect(lastPrompt).toContain('[the question they were answering]\nWarum habt ihr angefangen?')
  })

  it('spricht mit dem BERATER dieses Bausteins und in der Sprache der Seite', async () => {
    body = { ...body, uiLocale: 'en' }
    const { event } = fakeEvent()
    await handler(event)
    // Baustein A gehört George (Registry), die Marke ist deutsch, die Seite englisch.
    expect(lastSystem).toContain('You are George')
    expect(lastSystem).toContain('you speak to the person in en')
    expect(lastSystem).toContain('is written in de')
  })

  it('ein unlesbarer Verlauf kostet den Zug NICHT', async () => {
    tablesDB.listRows.mockImplementationOnce(async ({ tableId }: { tableId: string }) =>
      (tableId === 'brand_steps' ? { rows: stepRows } : { rows: [] }))
    tablesDB.listRows.mockImplementationOnce(async () => { throw new Error('kaputt') })
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)!.type).toBe('generation.completed')
  })
})

describe('Wenn etwas schiefgeht', () => {
  it('ANBIETER KAPUTT ⇒ `provider_error` und KEINE Berater-Zeile', async () => {
    modelFails = new Error('502')
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(readBack(chunks).at(-1)).toMatchObject({ type: 'generation.failed', code: 'provider_error' })
    // Die Zeile des MENSCHEN steht trotzdem — sie ist nicht das Ergebnis dieses
    // Laufs, sondern das Protokoll seiner Antwort.
    expect(messageRows).toHaveLength(1)
    expect(messageRows[0]).toMatchObject({ role: 'user' })
  })

  it('LEERER ZUG ⇒ `empty_result`, nichts wird geschrieben', async () => {
    modelText = '   '
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({ type: 'generation.failed', code: 'empty_result' })
    expect(messageRows).toHaveLength(1)
  })

  it('SCHREIBT DIE BERATER-ZEILE NICHT ⇒ `persist_failed` statt „fertig"', async () => {
    // Ein „fertig" für einen Text, den ein Reload nicht mehr findet, wäre eine
    // Lüge — anders als bei der Generierung ist die Nachricht hier die Sache.
    tablesDB.createRow.mockImplementationOnce(async ({ tableId, data }) => {
      timeline.push(`write:${tableId}`)
      messageRows.push(data)
      return { $id: 'row1' }
    })
    tablesDB.createRow.mockImplementationOnce(async () => { throw new Error('voll') })
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({ type: 'generation.failed', code: 'persist_failed' })
  })

  it('LOG-REGEL §6: der getippte Text landet NIE in `brand_events`', async () => {
    const { event } = fakeEvent()
    await handler(event)
    const events = tablesDB.createRow.mock.calls
      .map(call => call[0] as { tableId: string, data: Record<string, unknown> })
      .filter(call => call.tableId === 'brand_events')
    for (const record of events) {
      expect(JSON.stringify(record.data)).not.toContain('langweilig')
      expect(JSON.stringify(record.data)).not.toContain('loben')
    }
  })
})

/**
 * DER ZUG GEHÖRT EINER SESSION (BW2 Paket 3a) — vier Aussagen, vier
 * Bruchstellen:
 *
 *  1. Eine Session aus einem FREMDEN Baustein wird abgewiesen (400) — sonst
 *     stünde im Prompt das Ziel eines anderen Kapitels und im Verlauf eine
 *     Zeile, die niemand mehr zuordnen kann.
 *  2. Eine GESPERRTE Session wird abgewiesen (409) — und zwar VOR jeder
 *     Wirkung: keine Buchung, keine Zeile, kein Strom.
 *  3. OHNE Schlüssel rechnet der Server die Grundfassung (`resolveNextSession`)
 *     — der Rückwärts-Vertrag für jeden Client bis Paket 3c.
 *  4. Jede geschriebene Zeile trägt den Schlüssel (brand-011).
 */
describe('Die Session eines Zuges', () => {
  it('lehnt eine Session aus einem FREMDEN Baustein ab — 400 `session_foreign`', async () => {
    body = { ...body, sessionKey: 'b.purpose' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'session_foreign' },
    })
    // VOR jeder Wirkung: keine Zeile, keine Buchung, kein Anbieter-Aufruf.
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(hits).toEqual([])
    expect(aiCompleteStream).not.toHaveBeenCalled()
  })

  it('lehnt eine unbekannte Session ab — dieselbe Antwort', async () => {
    body = { ...body, sessionKey: 'a.erfunden' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'session_foreign' },
    })
  })

  it('lehnt eine GESPERRTE Session ab — 409 `session_locked`, ohne jede Wirkung', async () => {
    // `c.candidates` liest sieben bestätigte Felder; keines davon steht. Damit
    // der BAUSTEIN erreichbar ist (sonst käme 403 aus der Journey), sind seine
    // Vorgänger abgeschlossen.
    routeStepKey = 'values'
    stepRows = [
      stepRowFor('context', { state: 'done' }),
      stepRowFor('pvm', { state: 'done' }),
      stepRowFor('architecture', { state: 'done' }),
      stepRowFor('values'),
    ]
    stepRow = stepRows[3]!
    body = { text: 'Verlässlichkeit, glaube ich.', sessionKey: 'c.candidates' }

    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'session_locked' },
    })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(hits).toEqual([])
    expect(aiCompleteStream).not.toHaveBeenCalled()
  })

  it('eine OFFENE Session desselben Bausteins geht durch', async () => {
    body = { ...body, sessionKey: 'a.customerPraise' }
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)!.type).toBe('generation.completed')
    // Und ihr Ziel steht im Prompt.
    expect(lastPrompt).toContain('THIS SESSION:')
    expect(lastPrompt).toContain(slotById('a.customerPraise')!.goal)
  })

  it('OHNE Schlüssel gilt die Grundfassung — die erste offene Pflicht-Session', async () => {
    // `a.origin` ist beantwortet ⇒ `a.customerPraise` ist dran (dieselbe
    // Rechnung, die auch die nächste Frage bestimmt).
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).toContain(slotById('a.customerPraise')!.goal)
    expect(lastPrompt).not.toContain(slotById('a.origin')!.goal)
  })

  it('STEMPELT beide Zeilen mit dem Schlüssel der Session', async () => {
    body = { ...body, sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    expect(messageRows).toHaveLength(2)
    expect(messageRows[0]).toMatchObject({ role: 'user', sessionKey: 'a.customerPraise' })
    expect(messageRows[1]).toMatchObject({ role: 'george', sessionKey: 'a.customerPraise' })
  })

  it('meldet die NÄCHSTE Session im Abschluss-Frame (Auto-Weiter §5)', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({
      next: { stepKey: 'context', sessionKey: 'a.customerPraise' },
    })
  })

  it('AM KAPITELENDE zeigt der Wegweiser auf die Finale Abnahme (Paket 3b)', async () => {
    // Jeder Pflicht-Slot bestätigt, keine Frage mehr offen: `next: null` war
    // hier zweideutig („nichts zu fragen" sah aus wie „hier ist Schluss") —
    // seit §5a gibt es einen Ort, an den es weitergeht.
    stepRow.slots = JSON.stringify(Object.fromEntries(
      confirmableRequiredSlotsForStep('context').map(slot => [slot.id, { confirmed: 'steht' }]),
    ))
    body = { text: 'Und was heißt eigentlich Positionierung?' }
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({
      next: { stepKey: 'context', acceptance: true },
    })
  })

  it('GEGENPROBE: fehlt ein bestätigter Pflicht-Wert, bleibt `next` null', async () => {
    // Keine offene FRAGE mehr, aber ein Bühnen-Entwurf ist unbestätigt — dann
    // ist weder eine Session dran noch die Abnahme reif. Seit Befund E muss der
    // unbestätigte Wert eine ABLEITUNG sein: eine unbestätigte FRAGE wäre der
    // nächste Halt und kein „bleib stehen".
    const required = confirmableRequiredSlotsForStep('context')
    const derived = required.find(slot => slot.type !== 'question' && slot.type !== 'choice')!
    stepRow.slots = JSON.stringify(Object.fromEntries(
      required.map(slot => [
        slot.id,
        slot.id === derived.id ? { latestDraft: 'Entwurf' } : { confirmed: 'steht' },
      ]),
    ))
    body = { text: 'Und was heißt eigentlich Positionierung?' }
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({ next: null })
  })
})

/**
 * DER VERLAUF WIRD AUF DIE SESSION GESCHNITTEN — mit der einen Bestands-Regel,
 * ohne die jedes Bestands-Branding nach dem Deploy ohne Gedächtnis dastünde:
 * Zeilen mit LEEREM Schlüssel zählen zur ERSTEN Session des Kapitels.
 */
describe('Der Verlaufs-Filter', () => {
  function historyQuery(): string {
    // Seit converse-12 sortiert auch die Kapitel-Antworten-Abfrage absteigend —
    // sie ist am Rollen-Filter zu unterscheiden.
    return (messageQueries.find(query =>
      query.join(' ').includes('orderDesc') && !query.join(' ').includes('"role"')) ?? []).join(' ')
  }

  it('die ERSTE Session des Kapitels liest auch den Kapitel-Verlauf von vorher mit', async () => {
    // `a.origin` ist die erste Session in `context` (Registry-Reihenfolge —
    // seit dem Gruppen-Umbau 2026-09-09 steht die erste FRAGE vorn).
    body = { ...body, sessionKey: 'a.origin' }
    const { event } = fakeEvent()
    await handler(event)
    expect(historyQuery()).toContain('"sessionKey"')
    expect(historyQuery()).toContain('""')
    expect(historyQuery()).toContain('"a.origin"')
  })

  it('GEGENPROBE: jede ANDERE Session liest nur ihren eigenen Faden', async () => {
    body = { ...body, sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    const query = historyQuery()
    expect(query).toContain('"a.customerPraise"')
    // Der leere Schlüssel gehört NUR der ersten Session — sonst sähe jede
    // Session denselben alten Kapitel-Faden.
    expect(query).not.toMatch(/"values":\["",/)
  })
})

/**
 * DIE BEANTWORTETEN FRAGEN DES GANZEN KAPITELS (converse-12, Kailua-Befund 7 —
 * Davids Entscheidung 2026-09-08).
 *
 * Der Verlaufs-Schnitt oben BLEIBT. Daneben liest die Route einmal je Zug, was
 * die ANDEREN Sessions dieses Kapitels schon beantwortet haben — sonst stellte
 * George deren Fragen ein zweites Mal, weil sie für ihn nie stattgefunden
 * hatten.
 */
describe('Die Kapitel-Antworten im Prompt', () => {
  function answersQuery(): string[] {
    return messageQueries.find(query =>
      query.join(' ').includes('orderDesc') && query.join(' ').includes('"role"')) ?? []
  }

  beforeEach(() => {
    chapterAnswerRows = [
      { $id: 'm9', sessionKey: 'a.complaints', role: 'user', body: 'Dass die Lieferung mal spät kommt.' },
      { $id: 'm7', sessionKey: 'a.origin', role: 'user', body: 'Wir haben 2019 in einer Garage angefangen.' },
    ]
  })

  it('liest EINMAL je Zug, gefiltert auf den Menschen und mit ausdrücklichem Limit', async () => {
    const { event } = fakeEvent()
    await handler(event)

    const matches = messageQueries.filter(query =>
      query.join(' ').includes('orderDesc') && query.join(' ').includes('"role"'))
    expect(matches).toHaveLength(1)
    const query = answersQuery().join(' ')
    expect(query).toContain('"values":["user"]')
    // „Immer explizites Query.limit()" — ohne ihn entschiede der Zufall der
    // Sortierung, WELCHE fünfundzwanzig Zeilen der Zug sieht.
    expect(query).toMatch(/"method":"limit"/)
  })

  it('stehen als eigener Block, mit der Beschriftung ihrer Frage', async () => {
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('[questions already answered in this chapter, in earlier sessions]')
    // Beschriftet wie überall: die FRAGE aus dem Katalog, nie die interne Id
    // (converse-2 — George sprach die Ids sonst wortwörtlich nach).
    const label = brandSlotPromptLabel('a.complaints', 'de', 'new', 'solo')
    expect(label).not.toBe('a.complaints')
    expect(lastPrompt).toContain(`[${label}]`)
    expect(lastPrompt).toContain('Wir haben 2019 in einer Garage angefangen.')
    expect(lastPrompt).toContain('Dass die Lieferung mal spät kommt.')
    expect(lastPrompt).not.toContain('[a.complaints]')
  })

  /**
   * DIE EIGENE SESSION FÄLLT RAUS — sonst stünde derselbe Satz zweimal im
   * Prompt: einmal als Verlauf, einmal als „schon beantwortet".
   */
  it('lässt die laufende Session weg', async () => {
    chapterAnswerRows = [
      { $id: 'm9', sessionKey: 'a.customerPraise', role: 'user', body: 'Dass wir jede Röstung erklären.' },
      { $id: 'm7', sessionKey: 'a.origin', role: 'user', body: 'Wir haben 2019 angefangen — in einer Garage.' },
    ]
    body = { ...body, sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('Wir haben 2019 angefangen — in einer Garage.')
    expect(lastPrompt).not.toContain('Dass wir jede Röstung erklären.')
  })

  /**
   * DER ERÖFFNUNGSZUG BEKOMMT SIE EBENFALLS, und zwar mit Absicht: eine
   * frische Session hat KEINEN eigenen Verlauf (er ist auf sie geschnitten),
   * und ihr erster Satz ist damit der wahrscheinlichste Ort, an dem eine
   * längst beantwortete Frage wieder aufgemacht wird.
   */
  it('reisen auch im ERÖFFNUNGSZUG mit', async () => {
    body = { opening: true, sessionKey: 'a.complaints' }
    chapterAnswerRows = [
      { $id: 'm7', sessionKey: 'a.origin', role: 'user', body: 'Wir haben 2019 angefangen.' },
    ]
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('TASK: OPEN the next session')
    expect(lastPrompt).toContain('[questions already answered in this chapter, in earlier sessions]')
    expect(lastPrompt).toContain('DO NOT RE-OPEN WHAT IS SETTLED')
  })

  it('LEER heisst KEIN BLOCK', async () => {
    chapterAnswerRows = []
    const { event } = fakeEvent()
    await handler(event)
    // Der BLOCK, nicht der Satz aus dem Auftrag — der nennt ihn ohnehin.
    expect(lastPrompt).not.toContain('[questions already answered')
  })

  /**
   * OHNE SESSION KEIN LESEZUGRIFF: dann liest der Verlauf ohnehin kapitelweit,
   * und die Liste wäre dieselbe Auskunft ein zweites Mal.
   */
  it('GEGENPROBE: ohne laufende Session wird gar nicht gelesen', async () => {
    // Alle Pflicht-Felder bestätigt ⇒ keine Session mehr dran (freie Frage).
    stepRow.slots = JSON.stringify(Object.fromEntries(
      confirmableRequiredSlotsForStep('context').map(slot => [slot.id, { confirmed: 'steht' }]),
    ))
    body = { text: 'Und was heißt eigentlich Positionierung?' }
    const { event } = fakeEvent()
    await handler(event)

    expect(answersQuery()).toEqual([])
    expect(lastPrompt).not.toContain('[questions already answered')
  })
})

/**
 * EINE ENTWURFS-SESSION SCHLIESST AUF SICH SELBST (converse-12, Kailua-Befund
 * 5 — Davids „Weg B", Nebenbefund).
 *
 * Gemessen war: Session `a.pitch` (Ableitung, keine Katalog-Frage), und der
 * Zug schloss trotzdem mit der Frage von `a.origin` — dem Feld, auf dem
 * niemand sass.
 */
describe('Der Abschluss einer Entwurfs-Session', () => {
  it('nennt das eigene Feld und den Knopf — nie die Frage eines fremden', async () => {
    body = { text: 'Wir rösten in kleinen Mengen.', sessionKey: 'a.pitch' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THE FIELD THEY ARE SITTING ON IS NOT A QUESTION')
    expect(lastPrompt).toContain('never close with a question that belongs to a different field')
    expect(lastPrompt).toContain('George, entwirf das')
    expect(lastPrompt).not.toContain('Ask it IN YOUR OWN WORDS')
  })

  it('GEGENPROBE: eine Frage-Session schliesst unverändert mit ihrer Frage', async () => {
    body = { ...body, sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('Ask it IN YOUR OWN WORDS')
    expect(lastPrompt).not.toContain('THE FIELD THEY ARE SITTING ON IS NOT A QUESTION')
  })
})

/**
 * DER ERÖFFNUNGSZUG (§6) — George spricht zuerst, und zwar genau EINMAL je
 * Session. Der Client ruft ihn bei jedem Öffnen; ohne die Sicherung bekäme
 * dieselbe Session bei jedem Blick einen neuen ersten Satz, bezahlt aus dem
 * Tages-Eimer.
 */
describe('Der Eröffnungszug', () => {
  beforeEach(() => {
    body = { opening: true, sessionKey: 'a.customerPraise' }
  })

  it('erzeugt EINEN Zug des Beraters — und KEINE Zeile des Menschen', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(readBack(chunks).at(-1)!.type).toBe('generation.completed')
    expect(messageRows).toHaveLength(1)
    expect(messageRows[0]).toMatchObject({ role: 'george', sessionKey: 'a.customerPraise' })
    expect(lastPrompt).toContain('TASK: OPEN the next session')
    // Ohne Nachricht gibt es auch keinen Block darüber.
    expect(lastPrompt).not.toContain('[what they just wrote]')
  })

  it('IDEMPOTENT: hat die Session ihren Zug, kommt `skipped` statt eines zweiten', async () => {
    sessionProbeRows = [{ $id: 'm1', role: 'george' }]
    const { event, res } = fakeEvent()
    const result = await handler(event)

    expect(result).toEqual({ conversed: false, skipped: true })
    expect(res.headed).toBe(false)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(aiCompleteStream).not.toHaveBeenCalled()
    // Und er kostet nichts: abgewiesen wird VOR der Buchung.
    expect(hits).toEqual([])
  })

  it('das KAPITEL-INTRO fällt nur, wenn das Kapitel noch keine Nachricht hat', async () => {
    const first = fakeEvent()
    await handler(first.event)
    expect(lastPrompt).toContain('THIS IS THE FIRST TURN OF A NEW CHAPTER')

    // Zweite Session desselben Kapitels: der Faden läuft schon.
    stepProbeRows = [{ $id: 'm1', role: 'user' }]
    body = { opening: true, sessionKey: 'a.complaints' }
    const second = fakeEvent()
    await handler(second.event)
    expect(lastPrompt).toContain('THE CHAPTER IS ALREADY RUNNING')
    expect(lastPrompt).not.toContain('THIS IS THE FIRST TURN OF A NEW CHAPTER')
  })

  it('ein Eröffnungszug MIT Text ist ein Rumpf-Fehler', async () => {
    body = { opening: true, sessionKey: 'a.customerPraise', text: 'Hallo?' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'invalid_body' } })
  })
})

/**
 * DER ABSCHLUSSZUG (Davids Entscheidung 2026-09-09, DECISION-LOG Punkt 10) —
 * der dritte Zug einer Session, nach Eröffnung und Antwort.
 *
 * Drei Aussagen tragen ihn, und keine steht in einer puren Funktion: er läuft
 * NUR über einer bestätigten Session, sein ZIEL kommt aus `resolveNextStop`
 * (nicht aus Georges Urteil), und er nennt die übersprungenen Sessions mit
 * ihrer BESCHRIFTUNG — eine rohe Slot-Id wäre der Live-Fund vom 2026-09-03 an
 * genau der Stelle, an der der Mensch weiterklicken soll.
 */
describe('Der Abschlusszug', () => {
  /** Alle Fragen bis `a.complaints` beantwortet, `a.origin` bestätigt. */
  function confirmedThrough(...slotIds: string[]): void {
    stepRow.slots = JSON.stringify(Object.fromEntries(
      slotIds.map(id => [id, { confirmed: 'Wir haben 2019 angefangen.' }]),
    ))
    stepRows = [stepRow, stepRowFor('pvm')]
  }

  beforeEach(() => {
    confirmedThrough('a.origin')
    body = { closing: true, sessionKey: 'a.origin' }
  })

  it('würdigt und nennt das ZIEL — ohne eine Zeile des Menschen zu schreiben', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(readBack(chunks).at(-1)!.type).toBe('generation.completed')
    expect(lastPrompt).toContain('TASK: CLOSE this session')
    expect(lastPrompt).toContain('ASK NOTHING in this turn')
    /**
     * DAS ZIEL TRÄGT DEN KURZEN NAMEN, NICHT DIE FRAGE (Testlauf-Befund 3,
     * 2026-09-09). Im Live-Lauf stand „Der nächste Schritt heißt „Was sagen
     * deine glücklichsten Kunden über euch — in DEREN Worten?"" — der
     * Fragetext kam über `brandSlotPromptLabel` genau hierher.
     */
    expect(lastPrompt).toContain('the next session is "Kundenstimmen"')
    expect(brandSlotShortLabel('a.customerPraise', 'de', 'new', 'solo')).toBe('Kundenstimmen')
    expect(lastPrompt).not.toContain(
      `the next session is "${brandSlotPromptLabel('a.customerPraise', 'de', 'new', 'solo')}"`,
    )
    expect(lastPrompt).not.toContain('"a.customerPraise"')
    /**
     * UND DER BESTÄTIGTE WERT REIST MIT (Testlauf-Befund 1): ohne ihn kannte
     * der Abschluss den Zustand des Feldes nicht und verwies am fertigen Feld
     * auf den Entwurfs-Knopf.
     */
    expect(lastPrompt).toContain('IT IS ALREADY WRITTEN AND CONFIRMED')
    expect(lastPrompt).toContain('Wir haben 2019 angefangen.')
    expect(lastPrompt).not.toContain('WHEN THEY NAME A CONCRETE DECISION')
    // Genau EINE Zeile im Verlauf: die des Beraters.
    expect(messageRows).toHaveLength(1)
    expect(messageRows[0]).toMatchObject({ role: 'george', sessionKey: 'a.origin' })
    expect(JSON.parse(String(messageRows[0]!.parts))).toMatchObject({ kind: 'closing' })
  })

  it('NENNT die übersprungenen Sessions — bestätigte und vertagte', async () => {
    // `a.customerPraise` ist schon bestätigt, `a.complaints` vertagt: der
    // Wegweiser zeigt auf `a.oneThing`, und George soll den Sprung erklären
    // („Kundenstimmen hast du schon beantwortet, weiter mit …").
    stepRow.slots = JSON.stringify({
      'a.origin': { confirmed: 'steht' },
      'a.customerPraise': { confirmed: 'steht' },
      'a.complaints': { confirmed: 'steht', deferred: true },
    })
    stepRows = [stepRow, stepRowFor('pvm')]
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THESE PARTS ARE ALREADY SETTLED')
    // Auch die Übersprungenen tragen den kurzen NAMEN (Befund 3): eine Kette
    // aus drei zitierten Fragebogen-Sätzen wäre der Satz, den niemand liest.
    const settled = /THESE PARTS ARE ALREADY SETTLED[\s\S]*?\n/.exec(lastPrompt)![0]
    expect(settled).toContain(brandSlotShortLabel('a.customerPraise', 'de', 'new', 'solo'))
    expect(settled).toContain(brandSlotShortLabel('a.complaints', 'de', 'new', 'solo'))
    expect(lastPrompt).toContain(
      `the next session is "${brandSlotShortLabel('a.oneThing', 'de', 'new', 'solo')}"`,
    )
  })

  it('OHNE Ziel verweist er auf die Finale Abnahme', async () => {
    confirmedThrough(...confirmableRequiredSlotsForStep('context').map(slot => slot.id))
    body = { closing: true, sessionKey: 'a.origin' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THERE IS NO FURTHER SESSION in this chapter')
    expect(lastPrompt).not.toContain('WHERE IT GOES ON')
    // Und der Wegweiser im Frame zeigt dorthin, wo der Knopf hinführt.
    expect(readBack(chunks).at(-1)).toMatchObject({
      type: 'generation.completed',
      next: { stepKey: 'context', acceptance: true },
    })
  })

  it('der Wegweiser reist MIT — die Bühne baut daraus den Weiter-Knopf', async () => {
    const { event, chunks } = fakeEvent()
    await handler(event)
    expect(readBack(chunks).at(-1)).toMatchObject({
      type: 'generation.completed',
      // Keine Frage gestellt ⇒ kein `slotId`, sonst verschluckte die Bühne die
      // Katalog-Frage der nächsten Session.
      slotId: '',
      next: { stepKey: 'context', sessionKey: 'a.customerPraise' },
    })
  })

  it('ÜBER EINER UNBESTÄTIGTEN SESSION läuft er nicht — geprüft am Server', async () => {
    // Der Rumpf sagt nur, dass ein Abschluss gewünscht ist. Ein „Gründungs-
    // impuls steht" über einem offenen Feld wäre dieselbe Lüge wie die
    // Nachfrage über einem Häkchen, nur mit vertauschten Rollen.
    stepRow.slots = JSON.stringify({ 'a.origin': { latestDraft: 'Wir haben 2019 angefangen.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    const { event, res } = fakeEvent()

    expect(await handler(event)).toEqual({ conversed: false, skipped: true })
    expect(res.headed).toBe(false)
    expect(aiCompleteStream).not.toHaveBeenCalled()
    expect(hits).toEqual([])
  })

  it('ein Abschlusszug MIT Text ist ein Rumpf-Fehler', async () => {
    body = { closing: true, sessionKey: 'a.origin', text: 'Danke!' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'invalid_body' } })
  })

  it('erster UND letzter Zug zugleich ist ein Rumpf-Fehler', async () => {
    body = { closing: true, opening: true, sessionKey: 'a.origin' }
    const { event } = fakeEvent()
    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'invalid_body' } })
  })
})

/**
 * DIE BESTÄTIGUNG IM AUFTRAG (converse-14) — der Widerspruch aus Davids
 * Klick-Test, gemessen an der Route: kennt der Prompt den Zustand der Session,
 * und trägt der Zug den Knopf nur dort, wo er auch wirkt?
 */
describe('Bestätigung und Nachfrage wissen voneinander', () => {
  it('BESTÄTIGTE Session ⇒ kein Nachbohren mehr im Auftrag', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { confirmed: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Und was heißt das für uns?', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('THIS SESSION IS ALREADY CONFIRMED')
    expect(lastPrompt).not.toContain('IF THE ANSWER IS THIN')
    // Und kein Knopf: bestätigt ist bestätigt.
    expect(lastPrompt).not.toContain('A LINE THAT READS EXACTLY `CONFIRM:`')
  })

  it('UNBESTÄTIGT MIT WERT ⇒ der Auftrag bietet den Knopf an', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { latestDraft: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Sie loben die Röstung.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('A LINE THAT READS EXACTLY `CONFIRM:`')
    expect(lastPrompt).toContain('IF THE ANSWER IS THIN')
  })

  it('LEERES FELD ⇒ kein Angebot (der Klick liefe in `slot_empty`)', async () => {
    body = { text: 'Weiß ich noch nicht.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).not.toContain('A LINE THAT READS EXACTLY `CONFIRM:`')
  })

  it('der Marker wird zum Frame — und fällt aus Text und Feld', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { latestDraft: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Sie loben die Röstung.', sessionKey: 'a.customerPraise' }
    modelText = 'Das trägt für mich schon.\nCONFIRM:'
    const { event, chunks } = fakeEvent()
    await handler(event)

    const completed = readBack(chunks).at(-1)
    expect(completed).toMatchObject({ type: 'generation.completed', confirm: true })
    // In der Sprechblase steht der Marker NIE — er ist ein Knopf, kein Satz.
    const georgeRow = messageRows.find(row => row.role === 'george')
    expect(String(georgeRow!.body)).toBe('Das trägt für mich schon.')
    expect(JSON.parse(String(georgeRow!.parts))).toMatchObject({ confirm: true })
  })

  it('EIN ANGEBOT OHNE DECKUNG WIRD VERWORFEN', async () => {
    // Das Modell setzt den Marker auf Zuruf; ob es etwas zu bestätigen gibt,
    // weiss nur der Server. Ohne dieses UND stünde ein Knopf da, dessen Klick
    // garantiert eine Absage kassiert.
    modelText = 'Erzähl mir mehr.\nCONFIRM:'
    body = { text: 'Hm.', sessionKey: 'a.customerPraise' }
    const { event, chunks } = fakeEvent()
    await handler(event)

    const completed = readBack(chunks).at(-1) as { confirm?: boolean }
    expect(completed.confirm).toBeUndefined()
    expect(String(messageRows.find(row => row.role === 'george')!.body)).toBe('Erzähl mir mehr.')
  })

  /**
   * DAS ANGEBOT ENTSCHEIDET DIE ROUTE (Testlauf-Befund C, 2026-09-09).
   *
   * Bei Kundenstimmen und Größtes Hindernis kamen die zwei Knöpfe NIE: George
   * bohrte nach und vergass den Marker. Der Mensch hatte damit keinen Weg,
   * seine Antwort für gut zu erklären. Jetzt reist das Angebot mit, sobald die
   * Session einen Wert trägt und unbestätigt ist — der Marker ist nur noch
   * Stil.
   */
  it('OHNE MARKER kommt das Angebot trotzdem (C)', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { latestDraft: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Sie loben die Röstung.', sessionKey: 'a.customerPraise' }
    // George bohrt nach — und schreibt keinen einzigen Marker.
    modelText = 'Was genau loben sie an der Röstung?'
    const { event, chunks } = fakeEvent()
    await handler(event)

    expect(readBack(chunks).at(-1)).toMatchObject({ type: 'generation.completed', confirm: true })
    const georgeRow = messageRows.find(row => row.role === 'george')
    expect(JSON.parse(String(georgeRow!.parts))).toMatchObject({ confirm: true })
  })

  /**
   * KEIN ZWEITES PAAR KNÖPFE (Testlauf-Befund D): schreibt das Modell die
   * Beschriftungen als `OPTION:`-Zeilen nach, wären es Chips — und ein Chip
   * ist eine ANTWORT, sein Klick schreibt seinen Text ins Feld.
   */
  it('OPTION-Zeilen mit der Bedeutung der Knöpfe fallen weg (D)', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { latestDraft: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Sie loben die Röstung.', sessionKey: 'a.customerPraise', uiLocale: 'de' }
    modelText = [
      'Das trägt für mich schon.',
      'OPTION: Passt so, bestätigen',
      'OPTION: Ich ergänze noch etwas',
    ].join('\n')
    const { event, chunks } = fakeEvent()
    await handler(event)

    const completed = readBack(chunks).at(-1) as { confirm?: boolean, options?: string[] }
    expect(completed.confirm).toBe(true)
    expect(completed.options).toBeUndefined()
    // Und auch der VERLAUF trägt sie nicht — ein Reload holte sie sonst zurück.
    const georgeRow = messageRows.find(row => row.role === 'george')
    expect(JSON.parse(String(georgeRow!.parts)).options).toBeUndefined()
  })

  it('… echte Antwort-Möglichkeiten bleiben daneben stehen', async () => {
    stepRow.slots = JSON.stringify({ 'a.customerPraise': { latestDraft: 'Sie loben die Röstung.' } })
    stepRows = [stepRow, stepRowFor('pvm')]
    body = { text: 'Sie loben die Röstung.', sessionKey: 'a.customerPraise', uiLocale: 'de' }
    modelText = [
      'Was wiegt schwerer?',
      'OPTION: Die Röstung',
      'OPTION: Der Service',
      'OPTION: Passt so, bestätigen',
    ].join('\n')
    const { event, chunks } = fakeEvent()
    await handler(event)

    const completed = readBack(chunks).at(-1) as { options?: string[] }
    expect(completed.options).toEqual(['Die Röstung', 'Der Service'])
  })
})

/**
 * DIE SAMMEL-SESSION (`a.facts`) — die EINE Stelle, an der diese Route in
 * `brand_steps` schreibt.
 *
 * Drei Teile, drei Züge, EIN Wert am Ende. Die Zuordnung „welcher Teil ist
 * dran" ist eine Rechnung (`nextCollectPart`), keine KI-Einordnung: der Text
 * gehört dem Teil, der gerade gefragt wurde.
 */
describe('Die Sammel-Session', () => {
  /** Der Stand, den der letzte Schreibvorgang hinterlassen hat. */
  function writtenSlots(): Record<string, { collected?: Record<string, string>, latestDraft?: string }> {
    const last = stepWrites.at(-1)
    return last ? JSON.parse(String(last.slots)) : {}
  }

  async function answer(text: string) {
    body = { text, sessionKey: 'a.facts' }
    const { event, chunks } = fakeEvent()
    await handler(event)
    // Der Stand des nächsten Zuges ist der, den dieser geschrieben hat —
    // Slots UND Fassung, sonst zählte die Fassung nie weiter.
    const written = stepWrites.at(-1)
    if (written) {
      stepRow.slots = String(written.slots)
      stepRow.revision = written.revision
    }
    return readBack(chunks)
  }

  it('fragt die drei Teile NACHEINANDER und schreibt den Wert erst am Ende', async () => {
    await answer('3 fest, 2 auf Saison')
    expect(writtenSlots()['a.facts']!.collected).toEqual({ teamSize: '3 fest, 2 auf Saison' })
    expect(writtenSlots()['a.facts']!.latestDraft).toBeUndefined()
    // Der nächste Teil steht im Prompt — der übernächste nicht. Und zwar in
    // der Fassung der Weiche W3: die Testmarke ist `team: 'solo'`.
    expect(lastPrompt).toContain('you are on part 2 of 3')
    expect(lastPrompt).toContain('Seit wann machst du das?')

    await answer('2021')
    expect(writtenSlots()['a.facts']!.collected).toEqual({ teamSize: '3 fest, 2 auf Saison', age: '2021' })
    expect(writtenSlots()['a.facts']!.latestDraft).toBeUndefined()
    expect(lastPrompt).toContain('you are on part 3 of 3')

    const events = await answer('Landkreis und Wochenmarkt')
    const value = writtenSlots()['a.facts']!.latestDraft
    // Die Form ist die des Schemas (`structured`): beschriftete Blöcke, die
    // Beschriftung in der INHALTSSPRACHE der Marke.
    expect(value).toBe([
      '## Team',
      '3 fest, 2 auf Saison',
      '',
      '## Seit',
      '2021',
      '',
      '## Märkte',
      'Landkreis und Wochenmarkt',
    ].join('\n'))
    // Ein unbestätigter ENTWURF — bestätigt wird auf der Bühne.
    expect(writtenSlots()['a.facts']!.confirmed).toBeUndefined()
    // Und die Fassung steigt mit, sonst liefe der nächste Autosave in einen 409.
    expect(events.at(-1)).toMatchObject({ type: 'generation.completed', revision: 6 })
  })

  it('stellt die TEILE in der Fassung der Weiche W3 (2026-09-09)', async () => {
    /**
     * Die Klammer-Frage („ein paar schnelle Zahlen") drehte die Anrede seit der
     * Anrede-Runde, die drei Teilfragen nicht — im Solo-Gespräch stand also
     * mitten in einem durchgehend geduzten Chat „Seit wann gibt es euch?".
     * Der Solo-Fall steht im Test darüber; hier die GEGENPROBE, dass der
     * abgenommene Team-Wortlaut wörtlich erhalten bleibt.
     */
    profileRow.team = 'team'
    try {
      await answer('7 Angestellte, davon 3 in Teilzeit')
      expect(lastPrompt).toContain('Seit wann gibt es euch?')
      await answer('1998')
      expect(lastPrompt).toContain('Wo verkauft ihr wirklich')
    }
    finally {
      profileRow.team = 'solo'
    }
  })

  it('legt die schon gesammelten Teile in den Prompt', async () => {
    await answer('3 fest, 2 auf Saison')
    await answer('2021')
    expect(lastPrompt).toContain('[what this session has collected so far]')
    expect(lastPrompt).toContain('[Team]\n3 fest, 2 auf Saison')
    expect(lastPrompt).toContain('[Seit]\n2021')
  })

  it('GEGENPROBE: jede ANDERE Session schreibt weiterhin NICHTS auf `brand_steps`', async () => {
    body = { text: 'Weil uns der Kaffee zu langweilig war.', sessionKey: 'a.origin' }
    const { event } = fakeEvent()
    await handler(event)
    expect(stepWrites).toEqual([])
    expect(timeline).not.toContain('write:brand_steps')
  })
})

/**
 * DER „HAT MITGELESEN"-BLOCK (BW2 Paket 4, Plan §7/§8).
 *
 * Zwei Zusagen, und beide sind Verbote: George sagt es EINMAL, und er sagt es
 * NICHT, wenn es nichts zu sagen gibt. Die Marken dafür (`briefDelivered` am
 * Slot, `mentionedAt` am Befund) setzt der Zug, der es ausspricht — ohne sie
 * stünde derselbe Satz in jedem Zug, und aus einem Hinweis würde eine Mahnung.
 */
describe('Was die Kollegin beim Mitlesen gemerkt hat', () => {
  /** Ein geschlossenes Feld mit unerfülltem Ziel — der Stoff des Nachtrags. */
  function withUnmetGoal(): void {
    stepRow.slots = JSON.stringify({
      'a.origin': {
        confirmed: 'Wir haben 2019 angefangen.',
        reviewed: true,
        review: { goalReached: false, missing: ['nennt keinen Moment'], at: '2026-09-05T10:00:00.000Z' },
      },
    })
  }

  function withConflict(mentionedAt: string | null = null): void {
    findingRows.push({
      $id: 'f1',
      $createdAt: '2026-09-05T09:00:00.000Z',
      profileId: 'p1',
      stepKey: 'context',
      kind: 'conflict',
      slots: JSON.stringify(['a.customerPraise', 'b.purpose']),
      why: 'Das reibt sich mit eurem Purpose.',
      suggestion: 'Eines von beiden anfassen.',
      status: 'open',
      sourceSession: 'a.customerPraise',
      mentionedAt,
    })
  }

  it('trägt das unerfüllte Ziel in den Prompt — und markiert es als gesagt', async () => {
    withUnmetGoal()
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('WHAT A COLLEAGUE NOTICED WHILE READING ALONG:')
    expect(lastPrompt).toContain('nennt keinen Moment')
    expect(lastPrompt).toMatch(/Mention this ONCE/)
    // Die Marke fällt NACH dem Persistieren des Zuges.
    const written = JSON.parse(String(stepWrites.at(-1)!.slots)) as Record<string, { briefDelivered?: boolean }>
    expect(written['a.origin']!.briefDelivered).toBe(true)
    expect(stepWrites.at(-1)!.revision).toBe(4)
  })

  it('sagt es NICHT ein zweites Mal', async () => {
    stepRow.slots = JSON.stringify({
      'a.origin': {
        confirmed: 'Wir haben 2019 angefangen.',
        reviewed: true,
        briefDelivered: true,
        review: { goalReached: false, missing: ['nennt keinen Moment'], at: '2026-09-05T10:00:00.000Z' },
      },
    })
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).not.toContain('WHAT A COLLEAGUE NOTICED WHILE READING ALONG:')
    expect(stepWrites).toEqual([])
  })

  it('GEGENPROBE: ein ERREICHTES Ziel erzeugt keinen Nachtrag', async () => {
    stepRow.slots = JSON.stringify({
      'a.origin': {
        confirmed: 'Wir haben 2019 angefangen.',
        reviewed: true,
        review: { goalReached: true, missing: [], at: '2026-09-05T10:00:00.000Z' },
      },
    })
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).not.toContain('WHAT A COLLEAGUE NOTICED WHILE READING ALONG:')
  })

  it('nennt einen offenen Konflikt DIESER Session — und stempelt ihn', async () => {
    withConflict()
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)

    expect(lastPrompt).toContain('Das reibt sich mit eurem Purpose.')
    expect(lastPrompt).toContain('Eines von beiden anfassen.')
    // Beide Felder MIT Beschriftung, nie mit ihrer Id.
    expect(lastPrompt).not.toContain('a.customerPraise + b.purpose')
    expect(findingRows[0]!.mentionedAt).toBeTruthy()
  })

  it('GEGENPROBE: ein SCHON genannter Konflikt kommt nicht zurück', async () => {
    withConflict('2026-09-05T08:00:00.000Z')
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).not.toContain('Das reibt sich mit eurem Purpose.')
  })

  it('GEGENPROBE: ein Konflikt an einer ANDEREN Session bleibt still', async () => {
    withConflict()
    body = { text: 'Passt.', sessionKey: 'a.origin' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).not.toContain('Das reibt sich mit eurem Purpose.')
    expect(findingRows[0]!.mentionedAt).toBeNull()
  })

  it('nennt in Georges EIGENEM Baustein keine Kollegin', async () => {
    withUnmetGoal()
    body = { text: 'Passt.', sessionKey: 'a.customerPraise' }
    const { event } = fakeEvent()
    await handler(event)
    // Baustein A ist Georges eigener — er hat selbst noch einmal darüber
    // gelesen, und „George hat gemerkt" wäre ein zweiter George im Zug.
    expect(lastPrompt).toContain('Reading back over the value that was just settled')
    expect(lastPrompt).not.toContain('George read over')
  })

  it('nennt in einem FREMDEN Baustein die Kollegin', async () => {
    routeStepKey = 'pvm'
    stepRow = stepRowFor('pvm', {
      revision: 3,
      slots: JSON.stringify({
        'b.whyStarted': {
          confirmed: 'Weil es niemand sonst tat.',
          reviewed: true,
          review: { goalReached: false, missing: ['zu allgemein'], at: '2026-09-05T10:00:00.000Z' },
        },
      }),
    })
    stepRows = [stepRowFor('context', { state: 'done' }), stepRow]
    body = { text: 'Passt.', sessionKey: 'b.worldLoses' }
    const { event } = fakeEvent()
    await handler(event)
    expect(lastPrompt).toContain('Vera read over')
  })
})
