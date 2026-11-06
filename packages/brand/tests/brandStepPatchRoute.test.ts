import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER AUTOSAVE ALS TÜRSTEHER — die Bestätigungs-Sperre, durchgespielt.
 *
 * Davids Entscheidung (2026-09-02): „wenn confirmed müsste es unmöglich sein
 * zu korrigieren, außer wir klicken auf einen Button Korrigieren." Die
 * Oberfläche setzt das um (`brandSlotControls`, eigene Datei), aber eine
 * Oberfläche ist kein Schutz: ein zweiter Tab, ein alter Client oder ein
 * direkter Aufruf gingen daran vorbei. Deshalb ist die Route der Ort, an dem
 * die Regel wirklich gilt — und deshalb wird sie hier gemessen.
 *
 * WARUM DAS WICHTIG IST: vorher nahm die Route die Änderung an und schrieb
 * einen neuen `latestDraft` NEBEN das unveränderte `confirmed`. Der Mensch sah
 * seinen neuen Text im Feld, das Dokument (`confirmedSlotValues`, die Grundlage
 * jeder Veröffentlichung) trug weiter den alten — und niemand erfuhr davon.
 * Genau diese Divergenz prüft der letzte Test.
 */

const profileRow = {
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
  progressPct: 0,
  currentStepKey: 'context',
  lastActivityAt: '2026-08-01T00:00:00.000Z',
}

interface FakeRow { $id: string, [key: string]: unknown }

let stepRow: FakeRow
/**
 * WEITERE KAPITEL-ZEILEN (BW2 Paket 6): die Abhängigkeits-Hülle eines Feldes
 * liegt fast immer in einem ANDEREN Kapitel (`a.pitch` → `b.purpose`), und
 * ohne dessen Zeile wäre jede Hülle leer — der Test bewiese dann genau nichts.
 */
let extraRows: FakeRow[]
let body: Record<string, unknown>

const tablesDB = {
  getRow: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_profiles') return profileRow
    if (tableId === 'brand_steps') return stepRow
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => (tableId === 'brand_steps'
    ? { rows: [stepRow, ...extraRows] }
    : { rows: [] })),
  updateRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    if (tableId === 'brand_steps') Object.assign(stepRow, data)
    return stepRow
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
/**
 * Die Adresse ist ab Paket 6 beweglich: die Invarianten-Prüfung braucht das
 * Kapitel `values` (dort wohnt `c.final`), und die Impact-Route trägt
 * zusätzlich eine Session-Id.
 */
let routeStepKey = 'context'
let routeSlotId = 'a.pitch'
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => {
  if (name === 'id') return 'p1'
  if (name === 'stepKey') return routeStepKey
  return routeSlotId
})
vi.stubGlobal('readBody', async () => body)

const handler = (await import('../server/api/brand/profiles/[id]/steps/[stepKey].patch'))
  .default as unknown as (event: H3Event) => Promise<{ revision: number, slots: Record<string, { latestDraft: string | null, confirmed: string | null }> }>

/** Die Lese-Route der Hülle — sie liefert den `ack`, den der PATCH verlangt. */
const impactHandler = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/impact.get'))
  .default as unknown as (event: H3Event) => Promise<{ count: number, transitive: string[], ack: string }>

const event = { context: {} } as unknown as H3Event

/** Der Stand, wie er nach dem Lauf in der Tabelle steht. */
function storedSlots(): Record<string, { firstDraft?: string | null, latestDraft?: string | null, confirmed?: string | null }> {
  return JSON.parse(String(stepRow.slots))
}

beforeEach(() => {
  routeStepKey = 'context'
  routeSlotId = 'a.pitch'
  extraRows = []
  stepRow = {
    $id: 'p1_context',
    profileId: 'p1',
    stepKey: 'context',
    state: 'active',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    revision: 3,
    activeSeconds: 0,
    startedAt: '2026-08-01T00:00:00.000Z',
  }
  tablesDB.updateRow.mockClear()
})

describe('PATCH …/steps/:stepKey — bestätigen und aufheben', () => {
  it('BESTÄTIGT den Text, der nach diesem Speichern gilt', async () => {
    body = { revision: 3, slots: { 'a.pitch': { value: 'Wir rösten Kaffee.', confirmed: true } } }
    const response = await handler(event)

    expect(response.revision).toBe(4)
    expect(response.slots['a.pitch']).toMatchObject({
      firstDraft: 'Wir rösten Kaffee.',
      latestDraft: 'Wir rösten Kaffee.',
      confirmed: 'Wir rösten Kaffee.',
    })
  })

  it('HEBT DIE BESTÄTIGUNG AUF — „Korrigieren" ist die Tür zurück', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.pitch': { confirmed: false } } }
    const response = await handler(event)

    expect(response.slots['a.pitch']!.confirmed).toBeNull()
    // Der TEXT bleibt stehen — aufheben ist kein Verwerfen.
    expect(response.slots['a.pitch']!.latestDraft).toBe('alt')
  })

  it('LEHNT eine Wert-Änderung am bestätigten Slot mit 409 `slot_confirmed` ab', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'heimlich neu' } } }

    await expect(handler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'slot_confirmed' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('LEHNT auch das erneute Bestätigen mit anderem Text ab', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'neu', confirmed: true } } }
    await expect(handler(event)).rejects.toMatchObject({ status: 409, data: { code: 'slot_confirmed' } })
  })

  it('LÄSST aufheben UND schreiben in EINEM Zug durch — dieselbe Tür, ein Handgriff', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'korrigiert', confirmed: false } } }
    const response = await handler(event)

    expect(response.slots['a.pitch']).toMatchObject({
      // Der ERSTE Entwurf bleibt für immer stehen (Versions-Vertrag).
      firstDraft: 'alt',
      latestDraft: 'korrigiert',
      confirmed: null,
    })
  })

  it('SPERRT NUR DEN BESTÄTIGTEN SLOT, nicht den ganzen Baustein', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.category': { value: 'Kaffeerösterei' } } }
    const response = await handler(event)
    expect(response.slots['a.category']!.latestDraft).toBe('Kaffeerösterei')
    expect(response.slots['a.pitch']!.confirmed).toBe('alt')
  })

  it('GEGENPROBE: derselbe Patch OHNE Bestätigung geht durch', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: null } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'ganz normal' } } }
    const response = await handler(event)
    expect(response.slots['a.pitch']!.latestDraft).toBe('ganz normal')
  })

  it('DAS WAR DER BEFUND: ohne Sperre liefen Feld und Dokument auseinander', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'was der Mensch jetzt sieht' } } }

    await expect(handler(event)).rejects.toMatchObject({ data: { code: 'slot_confirmed' } })

    // Der entscheidende Teil: die Zeile ist UNVERÄNDERT. Vorher stand hier
    // `latestDraft: 'was der Mensch jetzt sieht'` neben `confirmed: 'alt'` —
    // zwei Wahrheiten, und veröffentlicht wurde die alte.
    expect(storedSlots()['a.pitch']).toEqual({
      firstDraft: 'alt',
      latestDraft: 'alt',
      confirmed: 'alt',
    })
  })

  it('EINE LEERE ZEICHENKETTE IST KEINE BESTÄTIGUNG', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { latestDraft: 'alt', confirmed: '' } })
    body = { revision: 3, slots: { 'a.pitch': { value: 'neu' } } }
    const response = await handler(event)
    expect(response.slots['a.pitch']!.latestDraft).toBe('neu')
  })

  it('DIE `revision` GEHT VOR: ein Konflikt wird als Konflikt gemeldet', async () => {
    stepRow.slots = JSON.stringify({ 'a.pitch': { latestDraft: 'alt', confirmed: 'alt' } })
    body = { revision: 1, slots: { 'a.pitch': { value: 'neu' } } }
    // Sonst bekäme ein veralteter Tab `slot_confirmed` statt des Dialogs, der
    // ihm seine eigene Fassung zeigt.
    await expect(handler(event)).rejects.toMatchObject({ data: { code: 'revision_conflict' } })
  })

  it('EINEN LEEREN SLOT ZU BESTÄTIGEN bleibt abgelehnt (`slot_empty`)', async () => {
    body = { revision: 3, slots: { 'a.pitch': { confirmed: true } } }
    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'slot_empty' } })
  })
})

/**
 * „NOCHMAL VON VORN" (C5, 2026-09-03): die pure `reopen`-Transition war
 * UNVERDRAHTET — kein API-Weg löste sie je aus, der Chip auf einem
 * abgeschlossenen Kapitel speicherte nur die Konfidenz und der Baustein
 * blieb `done`. Jetzt trägt der Autosave-PATCH ein optionales `reopen`.
 */
describe('PATCH …/steps/:stepKey — „Nochmal von vorn" (reopen)', () => {
  it('ÖFFNET einen abgeschlossenen Baustein wieder — Konfidenz im selben Zug', async () => {
    stepRow.state = 'done'
    stepRow.confidence = 'fits'
    body = { revision: 3, reopen: true, confidence: 'almost' }

    const response = await handler(event)

    expect(response.revision).toBe(4)
    expect(stepRow.state).toBe('active')
    expect(stepRow.confidence).toBe('almost')
  })

  it('NIMMT `restart` NICHT MEHR ALS KONFIDENZ (Paket 3b)', async () => {
    // Seit §5a ist „Nochmal von vorn" eine eigene Handlung mit Schnappschuss
    // und Ack — als Selbstauskunft gespeichert hiesse eine Zeile gleichzeitig
    // „abgeschlossen" und „von vorn".
    stepRow.state = 'done'
    body = { revision: 3, reopen: true, confidence: 'restart' }

    await expect(handler(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'invalid_confidence' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('GEGENPROBE: reopen auf einem offenen Baustein wird mit `not_done` abgewiesen', async () => {
    body = { revision: 3, reopen: true }

    await expect(handler(event)).rejects.toMatchObject({ status: 400, data: { code: 'not_done' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })
})

/**
 * DER GERECHNETE ZUSTAND SCHLÄGT DEN ROHEN (Davids Durchspiel-Audit
 * 2026-09-03): `open` ist kein gespeicherter Zustand — eine Zeile, deren
 * Vorgänger fertig wird, bleibt roh `locked`. Mit dem rohen Zustand nahm der
 * Start-Zweig solche Bausteine nie mit, und `setConfidence` prallte mit
 * `step_locked` ab: Krume & Golds pvm stand mit 10/10 bestätigten Feldern da
 * und liess sich trotzdem nicht abschliessen („Passt" ⇒ stilles 400).
 */
describe('PATCH …/steps/:stepKey — roh verriegelt, aber auf dem Weg erreichbar', () => {
  it('NIMMT Konfidenz an: die Journey rechnet die Zeile `open`, der Start greift', async () => {
    stepRow.state = 'locked'
    body = { revision: 3, confidence: 'almost' }

    const response = await handler(event)

    expect(response.revision).toBe(4)
    expect(stepRow.state).toBe('active')
    expect(stepRow.confidence).toBe('almost')
  })
})

/**
 * DER QUELLEN-HASH UND DIE ABNAHME (BW2 Paket 3b) — was der Autosave NEBEN
 * dem Text noch schreibt.
 *
 * Beides ist Server-Sache und darf es nie werden: der Hash, weil ohne ihn
 * „Nochmal von vorn" nachgelagerte Felder nicht als veraltet zeigen kann
 * (§9); die Rücknahme der Abnahme, weil `accepted` eine Aussage über einen
 * GELESENEN Wortlaut ist — und der ist nach einer Änderung ein anderer.
 */
describe('PATCH …/steps/:stepKey — Quellen-Hash und Abnahme (Paket 3b)', () => {
  it('STEMPELT beim Bestätigen den Stand der Quellen', async () => {
    body = { revision: 3, slots: { 'a.pitch': { value: 'Wir rösten Kaffee.', confirmed: true } } }
    await handler(event)

    const stored = storedSlots()['a.pitch'] as { sourcesHash?: string }
    expect(typeof stored.sourcesHash).toBe('string')
    expect(stored.sourcesHash).toHaveLength(64)
  })

  it('stempelt NICHT beim blossen Speichern — bestätigt ist etwas anderes als geschrieben', async () => {
    body = { revision: 3, slots: { 'a.pitch': { value: 'Ein Entwurf.' } } }
    await handler(event)

    expect(storedSlots()['a.pitch']).not.toHaveProperty('sourcesHash')
  })

  it('NIMMT DIE ABNAHME, sobald sich der Wert bewegt', async () => {
    stepRow.slots = JSON.stringify({
      'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt', accepted: true },
    })
    // Erst aufheben (die einzige Tür), im selben Zug neu schreiben.
    body = { revision: 3, slots: { 'a.pitch': { value: 'neu', confirmed: false } } }
    await handler(event)

    expect(storedSlots()['a.pitch']).not.toHaveProperty('accepted')
    expect(storedSlots()['a.pitch']!.latestDraft).toBe('neu')
  })

  it('GEGENPROBE: ein No-op lässt die Abnahme stehen', async () => {
    stepRow.slots = JSON.stringify({
      'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt', accepted: true },
    })
    // Dieselbe Bestätigung noch einmal — `sameSlot` sieht keine Änderung, und
    // `accepted`/`deferred` sind darin bewusst kein Inhalt.
    body = { revision: 3, slots: { 'a.pitch': { confirmed: true } } }
    await handler(event)

    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(storedSlots()['a.pitch']).toMatchObject({ accepted: true })
  })
})

/**
 * DIE KORREKTUR-REGEL AM AUTOSAVE (BW2 Paket 6, Plan §9).
 *
 * ── WARUM DAS HIER GEMESSEN WIRD UND NICHT NUR PUR ────────────────────────
 * `confirmedDependents` sagt, WER an einem Feld hängt; ob die Route daraus
 * wirklich ein 409 macht, sagt nur die Route. Genau dazwischen liegen die
 * Fehler, die eine pure Prüfung nie sieht: eine Hülle, die aus dem falschen
 * Stand gerechnet wird (mit dem Patch statt vor ihm), ein Ack, der gegen eine
 * andere `revision` gebildet wurde, oder eine Sperre, die auch dann zuschlägt,
 * wenn gar nichts daran hängt.
 *
 * Die Zeile des zweiten Kapitels ist Bedingung: `a.pitch` berührt `b.purpose`,
 * und ohne die `pvm`-Zeile wäre die Hülle leer.
 */
describe('PATCH …/steps/:stepKey — Impact-Ack vor der Korrektur (Paket 6)', () => {
  /** Ein bestätigtes `a.pitch` und ein bestätigtes `b.purpose` daran. */
  function withDependent(): void {
    stepRow.slots = JSON.stringify({
      'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' },
    })
    extraRows = [{
      $id: 'p1_pvm',
      profileId: 'p1',
      stepKey: 'pvm',
      state: 'active',
      slots: JSON.stringify({ 'b.purpose': { confirmed: 'Damit die Welt besser wird.' } }),
      generations: '{"items":[],"count":0}',
      revision: 1,
      activeSeconds: 0,
    }]
  }

  it('LEHNT die Korrektur ohne Ack mit 409 `impact_unacknowledged` ab', async () => {
    withDependent()
    body = { revision: 3, slots: { 'a.pitch': { confirmed: false } } }

    await expect(handler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'impact_unacknowledged' },
    })
    // NICHTS geschrieben — die Bestätigung steht unangetastet.
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('MIT dem passenden Ack geht sie durch — und merkt sich den alten Wortlaut', async () => {
    withDependent()
    const impact = await impactHandler(event)
    expect(impact.count).toBe(1)
    expect(impact.transitive).toEqual(['b.purpose'])

    body = { revision: 3, slots: { 'a.pitch': { confirmed: false } }, impactAck: impact.ack }
    await handler(event)

    expect(storedSlots()['a.pitch']!.confirmed).toBeNull()
    // `previousValue` ist die einzige Spur, an der die Eingrenzung später
    // erkennt, dass sie eine Korrektur vor sich hat (§9).
    expect(storedSlots()['a.pitch']).toMatchObject({ previousValue: 'alt' })
  })

  it('ein FREMDER Ack wird abgewiesen — die Hülle kann sich bewegt haben', async () => {
    withDependent()
    body = { revision: 3, slots: { 'a.pitch': { confirmed: false } }, impactAck: 'a'.repeat(64) }

    await expect(handler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'impact_unacknowledged' },
    })
  })

  it('LEERE HÜLLE ⇒ kein Ack, kein Hinweis, kein `previousValue`', async () => {
    // Ohne bestätigte Abhängige läuft „Korrigieren" wie vor Paket 6.
    stepRow.slots = JSON.stringify({
      'a.pitch': { firstDraft: 'alt', latestDraft: 'alt', confirmed: 'alt' },
    })
    body = { revision: 3, slots: { 'a.pitch': { confirmed: false } } }
    await handler(event)

    expect(storedSlots()['a.pitch']!.confirmed).toBeNull()
    expect(storedSlots()['a.pitch']).not.toHaveProperty('previousValue')
  })

  it('ein gewöhnliches Speichern braucht nie ein Ack', async () => {
    withDependent()
    body = { revision: 3, slots: { 'a.category': { value: 'Rösterei' } } }
    await handler(event)

    expect(storedSlots()['a.category']!.latestDraft).toBe('Rösterei')
  })
})

/**
 * DIE INVARIANTEN SIND SCHARF (BW2 Paket 6, §3a Nr. 6).
 *
 * Sie standen seit Paket 1 in `transitionBrandStep('confirmSlot')` — und diese
 * Handlung ruft keine Route: bestätigt wird HIER. Eine Regel, die niemand
 * ausführt, ist eine Zusage ohne Deckung, und genau das misst dieser Block.
 */
describe('PATCH …/steps/:stepKey — Invarianten beim Bestätigen (Paket 6)', () => {
  beforeEach(() => {
    routeStepKey = 'values'
    stepRow.$id = 'p1_values'
    stepRow.stepKey = 'values'
    // Die Vorgänger-Kapitel müssen ABGESCHLOSSEN sein, sonst ist `values`
    // gesperrt und `canEnterBrandStep` weist schon vor der Regel ab.
    extraRows = ['context', 'pvm', 'architecture'].map(stepKey => ({
      $id: `p1_${stepKey}`,
      profileId: 'p1',
      stepKey,
      state: 'done',
      slots: '{}',
      generations: '{"items":[],"count":0}',
      revision: 1,
      activeSeconds: 0,
    }))
  })

  it('LEHNT `c.final` mit zwei Einträgen ab — 409 `invariant_violated`', async () => {
    body = { revision: 3, slots: { 'c.final': { value: '- Geduld\n- Klarheit', confirmed: true } } }

    await expect(handler(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'invariant_violated' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('… und nimmt drei an', async () => {
    body = {
      revision: 3,
      slots: { 'c.final': { value: '- Geduld\n- Klarheit\n- Sorgfalt', confirmed: true } },
    }
    await handler(event)

    expect(storedSlots()['c.final']!.confirmed).toBe('- Geduld\n- Klarheit\n- Sorgfalt')
  })

  it('TOLERANT gegenüber der Schreibweise — drei Werte in EINER Zeile gelten auch', async () => {
    // Der Editor `chips` gibt es in der Werkstatt nicht; die Antwort kommt als
    // getippter Fliesstext (Paket-6-Vorabklärung). Eine Invariante darf an der
    // Form nie scheitern, nur an der Sache.
    body = {
      revision: 3,
      slots: { 'c.final': { value: 'Geduld, Unbestechlichkeit und Klarheit', confirmed: true } },
    }
    await handler(event)

    expect(storedSlots()['c.final']!.confirmed).toBe('Geduld, Unbestechlichkeit und Klarheit')
  })

  it('BESTAND wird NICHT nachgeprüft — nur der Schreibweg', async () => {
    // Ein schon bestätigter Wert, der die Regel verletzt, bleibt stehen: eine
    // Regel, die rückwirkend sperrt, nähme jemandem sein fertiges Kapitel weg.
    stepRow.slots = JSON.stringify({ 'c.final': { confirmed: '- Geduld\n- Klarheit' } })
    body = { revision: 3, slots: { 'c.livedExamples': { value: 'Ein Beispiel.' } } }
    await handler(event)

    expect(storedSlots()['c.final']!.confirmed).toBe('- Geduld\n- Klarheit')
  })
})
