import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER BURST-PLATZ DER VIER KI-LÄUFE VON BRAND DESIGN (Audit-Befund
 * 2026-09-09).
 *
 * `brandAiQuota.ts` sagt in seinem Kopf zu: „Die Route ruft
 * `retainBrandGeneration()` VOR der Buchung und gibt bei einem Nein wieder
 * frei." Das galt für den Entwurf und das Gespräch — und ausgerechnet NICHT
 * für die vier Läufe dieses Kapitels, die die teuersten des Layers sind (ein
 * Vision-Zug über zwölf Bilder, vier Bild-Aufrufe in einem Klick). Zwölf
 * geöffnete Tabs hätten zwölf Läufe bezahlt, während der Tages-Deckel erst
 * hinterher zählt.
 *
 * Zwei Aussagen je Route, beide nicht typisierbar:
 *
 *  1. ZWEI LAUFEN SCHON ⇒ der dritte bekommt `brand_ai_busy` — und zwar OHNE
 *     einen Eimer anzufassen (die Burst-Frage steht VOR jedem `store.hit`).
 *  2. DER PLATZ WIRD WIEDER FREI, auch nach einem Nein. Ein Platz, der nach
 *     einer Ablehnung belegt bliebe, sperrte das Konto dauerhaft aus — das ist
 *     die Fehlerklasse, gegen die das `finally` in den Routen steht.
 *
 * Alles vor der Buchung ist Attrappe (Zugang, Datentür, Listen); die BUCHUNG
 * selbst und der Burst-Zähler sind ECHT — sonst prüfte der Test seine eigene
 * Attrappe.
 */

vi.mock('../server/utils/brandInspirationStore', async () => ({
  requireBrandInspirationContext: async () => ({ profile, stepRows: [] }),
  listBrandInspiration: async () => [{ id: 'f1', number: 1, area: 'web', note: '', filename: 'a.png', createdAt: '', reading: null }],
}))
vi.mock('../server/utils/brandInspirationReading', async () => ({
  brandReadingStubEnabled: () => true,
  brandReadingRunLine: () => '',
  brandReadingSlotLabels: () => ({ keeps: 'Behalten', improves: 'Ändern' }),
  runBrandInspirationReading: async () => ({ failure: 'provider_error' as const }),
  storeBrandReadings: async () => 0,
  writeBrandReadingSlot: async () => {},
}))
vi.mock('../server/utils/brandMarkBrief', async () => ({
  BRAND_MARK_BRIEF_SLOT_ID: 'j.brief',
  brandMarkBriefStubEnabled: () => true,
  requireBrandMarkContext: async () => ({ profile, stepRows: [] }),
  runBrandMarkBrief: async () => ({ failure: 'no_foundation' as const }),
  writeBrandMarkBriefSlot: async () => {},
}))
vi.mock('../server/utils/brandMarkDrafts', async () => ({
  brandMarkDraftTitleFor: () => 'Entwurf 1',
  brandMarkDraftsFree: () => 12,
  brandMarkDraftsStubEnabled: () => true,
  createBrandMarkDraft: async () => {},
  listBrandMarkDrafts: async () => [],
  runBrandMarkDrafts: async () => ({ failure: 'no_brief' as const }),
  syncBrandMarkDraftsSlot: async () => {},
}))
vi.mock('../server/utils/brandDnaProposal', async () => ({
  BRAND_DNA_SLOT_ID: 'g.dna',
  brandDnaPromptReadings: () => [],
  brandDnaStubEnabled: () => true,
  runBrandDnaProposal: async () => ({ failure: 'no_foundation' as const }),
  writeBrandDnaSlot: async () => {},
}))
vi.mock('../server/utils/brandEvents', async () => ({
  recordBrandEvent: async () => {},
}))

const profile = { $id: 'p1', contentLocale: 'de' }

/** Jeder `store.hit` ist ein angefasster Eimer — die Liste ist der Zeuge. */
let hits: string[] = []

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' }, appwriteKey: 'k' }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:',
  store: {
    hit: async (key: string) => {
      hits.push(key)
      return { count: 1, resetInMs: 3_600_000 }
    },
  },
}))

const generators = await import('../server/utils/brandGenerators')

const handlers: Record<string, (event: H3Event) => Promise<unknown>> = {
  'Vorbilder lesen': (await import('../server/api/brand/profiles/[id]/inspiration/read.post'))
    .default as unknown as (event: H3Event) => Promise<unknown>,
  'DNA vorschlagen': (await import('../server/api/brand/profiles/[id]/dna/propose.post'))
    .default as unknown as (event: H3Event) => Promise<unknown>,
  'Zeichen-Briefing': (await import('../server/api/brand/profiles/[id]/mark/brief.post'))
    .default as unknown as (event: H3Event) => Promise<unknown>,
  'Zeichen-Entwürfe': (await import('../server/api/brand/profiles/[id]/mark/drafts/index.post'))
    .default as unknown as (event: H3Event) => Promise<unknown>,
}

const event = { context: {} } as unknown as H3Event

beforeEach(() => {
  hits = []
  generators.clearActiveBrandGenerations()
})

afterEach(() => {
  generators.clearActiveBrandGenerations()
})

describe.each(Object.entries(handlers))('%s — der Burst-Platz', (_name, handler) => {
  it('ZWEI LAUFEN SCHON ⇒ 429 `brand_ai_busy`, OHNE einen Eimer anzufassen', async () => {
    generators.retainBrandGeneration('u1')
    generators.retainBrandGeneration('u1')

    await expect(handler(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_ai_busy' },
    })
    expect(hits).toEqual([])
  })

  it('GIBT DEN PLATZ WIEDER FREI — auch nach einem Nein der Drossel', async () => {
    generators.retainBrandGeneration('u1')
    generators.retainBrandGeneration('u1')
    await expect(handler(event)).rejects.toMatchObject({ status: 429 })
    // Der eigene Platz ist zurück; die zwei fremden Läufe stehen unberührt da.
    expect(generators.countActiveBrandGenerations('u1')).toBe(2)
  })

  it('GEGENPROBE: EIN laufender Lauf reicht nicht — der zweite darf', async () => {
    generators.retainBrandGeneration('u1')
    // Der Lauf selbst endet an seiner Attrappe (409/502) — entscheidend ist,
    // dass er die Drossel ERREICHT hat und danach seinen Platz zurückgibt.
    await expect(handler(event)).rejects.not.toMatchObject({ data: { code: 'brand_ai_busy' } })
    expect(hits.length).toBeGreaterThan(0)
    expect(generators.countActiveBrandGenerations('u1')).toBe(1)
  })
})
