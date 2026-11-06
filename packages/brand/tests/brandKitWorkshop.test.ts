import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBrandPressContact } from '../shared/brandKitSlots'
import { formatBrandSlotList, formatBrandSlotStructured } from '../shared/brandSlotFormat'
import type { BrandKitContext } from '../server/utils/brandKit'

/**
 * DIE WERKSTATT-QUELLEN DER DRITTEN SCHICHT (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.4/§2.9, Paket K5).
 *
 * ── WAS HIER BEWIESEN WIRD ────────────────────────────────────────────────
 *  1. DIE KONTAKT-VORLAGEN: der Konto-Inhaber ist IMMER dabei, die
 *     Erstgespräch-Anfrage NUR, wenn es eine für DIESE Marke und dieses Konto
 *     gibt — und in KEINEM Fall reist eine Telefonnummer mit (§2.4).
 *  2. GESPEICHERT WIRD TEXT, kein Verweis: was aus einer Vorlage entsteht,
 *     ist derselbe `structured`-Wert wie ein von Hand getippter (§2.20 Nr. 3
 *     — „die Konto-Daten dürfen sich später ändern, ohne das Pressekit still
 *     mitzuändern").
 *  3. DIE VORSCHAU benennt, was fehlt, statt es zu füllen.
 *
 * ── DIE STUBS SIND DIE ZWEI ABFRAGEN, MEHR NICHT ─────────────────────────
 * `createAdminClient` und `useRuntimeConfig` gibt es nur zur Laufzeit
 * (Auto-Import) — dieselbe Klammer wie in `advisorGenerators.test.ts`. Alles
 * andere an dieser Datei ist reine Rechnung.
 */

const usersGet = vi.fn()
const listRows = vi.fn()

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'brand' } }))
vi.stubGlobal('createAdminClient', () => ({
  users: { get: usersGet },
  tablesDB: { listRows },
}))

const {
  brandKitContactTemplates,
  brandKitPressSummary,
  brandKitSlotValues,
} = await import('../server/utils/brandKitWorkshop')

const EVENT = {} as H3Event

function contextWith(slots: Record<string, string>, preset: unknown = null): BrandKitContext {
  return {
    profile: { $id: 'p1', title: 'Kailua Coffee Co.', contentLocale: 'de' },
    stepRows: [{
      $id: 'p1_presskit',
      slots: JSON.stringify(Object.fromEntries(
        // `confirmed` trägt den bestätigten TEXT, kein Flag (`BrandSlotRecord`).
        Object.entries(slots).map(([id, value]) => [id, { confirmed: value }]),
      )),
    }],
    preset,
    stand: '',
    slug: 'kailua-coffee-co',
    view: { chapters: [] },
    userId: 'u1',
  } as unknown as BrandKitContext
}

beforeEach(() => {
  usersGet.mockReset()
  listRows.mockReset()
})

describe('K5 — die Kontakt-Vorlagen (§2.20 Nr. 3)', () => {
  it('gibt den Konto-Inhaber IMMER, auch ohne Erstgespräch', async () => {
    usersGet.mockResolvedValue({ name: 'Leilani Kahale', email: 'leilani@kailuacoffee.co' })
    listRows.mockResolvedValue({ rows: [] })

    const templates = await brandKitContactTemplates(EVENT, contextWith({}), 'de')
    expect(templates.map(entry => entry.id)).toEqual(['account'])
    expect(templates[0]).toMatchObject({ name: 'Leilani Kahale', email: 'leilani@kailuacoffee.co' })
  })

  it('gibt die Erstgespräch-Vorlage NUR mit einer Anfrage dieser Marke und dieses Kontos', async () => {
    usersGet.mockResolvedValue({ name: 'Leilani Kahale', email: 'leilani@kailuacoffee.co' })
    listRows.mockResolvedValue({
      rows: [{
        name: 'Noa Kealoha',
        email: 'presse@kailuacoffee.co',
        company: 'Presse',
        phone: '+1 808 555 0100',
      }],
    })

    const templates = await brandKitContactTemplates(EVENT, contextWith({}), 'de')
    expect(templates.map(entry => entry.id)).toEqual(['account', 'intro'])

    // DIE ABFRAGE FRAGT NACH BEIDEM — Marke UND Konto.
    const queries = String(listRows.mock.calls[0]?.[0]?.queries ?? '')
    expect(queries).toContain('profileId')
    expect(queries).toContain('userId')

    // KEINE TELEFONNUMMER, nirgends — weder im Vertrag noch im Wert.
    expect(JSON.stringify(templates)).not.toContain('555 0100')
  })

  it('fällt weich aus, wenn Konto oder Tabelle nicht lesbar sind', async () => {
    usersGet.mockRejectedValue(new Error('gone'))
    listRows.mockRejectedValue(new Error('gone'))
    expect(await brandKitContactTemplates(EVENT, contextWith({}), 'de')).toEqual([])
  })

  it('macht aus einer Vorlage denselben TEXT-Wert wie aus einer Eingabe von Hand', () => {
    // Der Schreiber ist derselbe (`formatBrandPressContact`, in der Komponente
    // aufgerufen) — im Wert steht kein Verweis auf ein Konto, nur der Text.
    const value = formatBrandSlotStructured([
      { label: 'Name', body: 'Leilani Kahale' },
      { label: 'Rolle', body: 'Inhaberin' },
      { label: 'E-Mail', body: 'leilani@kailuacoffee.co' },
    ])
    expect(value).not.toContain('u1')
    expect(parseBrandPressContact(value)).toEqual({
      name: 'Leilani Kahale',
      role: 'Inhaberin',
      email: 'leilani@kailuacoffee.co',
    })
  })
})

describe('K5 — die Pressekit-Vorschau (`p.summary`)', () => {
  it('stellt zusammen, was da ist, und benennt, was fehlt', () => {
    const context = contextWith({
      'ep.taglines': formatBrandSlotList(['Kaffee von hier.']),
      'p.facts': formatBrandSlotList(['Gegründet 2026 in Kailua.']),
    })
    const summary = brandKitPressSummary(context, brandKitSlotValues(context))

    expect(summary).toContain('Kaffee von hier.')
    expect(summary).toContain('Gegründet 2026 in Kailua.')
    // Boilerplates und Kontakt fehlen — sie stehen als fehlend da.
    expect(summary).toContain('Fehlt noch')
    // Ohne Preset sagt der Zeichen-Abschnitt OFFEN, dass er später kommt.
    expect(summary).toContain('Brand Design')
  })

  it('nimmt die Fakten NUR aus `p.facts` — `a.facts` bleibt intern (§2.12 Nr. 2)', () => {
    const context = contextWith({
      'a.facts': formatBrandSlotList(['GEHEIM-UMSATZ-310000']),
      'p.facts': formatBrandSlotList(['Gegründet 2026 in Kailua.']),
    })
    const summary = brandKitPressSummary(context, brandKitSlotValues(context))
    expect(summary).not.toContain('GEHEIM-UMSATZ-310000')
    expect(summary).toContain('Gegründet 2026 in Kailua.')
  })
})
