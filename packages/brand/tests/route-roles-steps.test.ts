import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  brandWorld,
  callBrandRoute,
  describeWorkshopRoute,
  leaks,
  messageRow,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: KAPITEL, VERLAUF, DESIGN UND KIT EINER MARKE (OPS-009, BT1 b).
 *
 * Lesende Routen an einer Marke. Jede läuft ECHT; die Fragen stellt
 * `describeWorkshopRoute` (Gast, ohne Zugang, entzogen, fremde Marke,
 * Betreiber, Besitzer). Dazu je Route, was nur dem Besitzer gehört: der
 * Verlauf der FREMDEN Marke steht in derselben Ablage und erscheint nie.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const messagesRoute = () => import('../server/api/brand/profiles/[id]/messages.get')

const bothMessages = () => [
  messageRow('m-eigen', OWN_PROFILE, 'eigene Nachricht'),
  messageRow('m-fremd', FOREIGN_PROFILE, 'GEHEIM-fremde-Nachricht'),
]

describeWorkshopRoute('GET /api/brand/profiles/[id]/messages', messagesRoute, {
  seed: bothMessages,
  owner: (run) => {
    const messages = (run.result as { messages: { id: string }[] }).messages
    expect(messages.map(entry => entry.id)).toEqual(['m-eigen'])
    expect(leaks(run.result, 'GEHEIM-fremde-Nachricht')).toBe(false)
  },
})

describe('GET /api/brand/profiles/[id]/messages — fremder Verlauf', () => {
  it('stranger an fremder Marke: kein Wort aus dem Verlauf, keine Abfrage des Verlaufs', async () => {
    const db = brandWorld(bothMessages())
    const run = await callBrandRoute(messagesRoute, { who: 'stranger', db, params: { id: OWN_PROFILE } })
    expect(run.status).toBe(404)
    expect(leaks(run, 'eigene Nachricht')).toBe(false)
    expect(db.calls.some(call => call.target === 'brand_messages')).toBe(false)
  })
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/steps/[stepKey]', () => import('../server/api/brand/profiles/[id]/steps/[stepKey].get'), {
  params: () => ({ stepKey: 'context' }),
  owner: (run) => {
    expect(run.result).toMatchObject({ profileId: OWN_PROFILE, stepKey: 'context' })
  },
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/steps/[stepKey]/generations', () => import('../server/api/brand/profiles/[id]/steps/[stepKey]/generations.get'), {
  params: () => ({ stepKey: 'context' }),
  query: { slotId: 'a.origin' },
  owner: (run) => {
    expect(run.result).toMatchObject({ slotId: 'a.origin', items: [] })
  },
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/design', () => import('../server/api/brand/profiles/[id]/design.get'), {
  owner: (run) => {
    expect(run.result).toMatchObject({ profileId: OWN_PROFILE })
  },
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/kit/workshop', () => import('../server/api/brand/profiles/[id]/kit/workshop.get'), {
  owner: (run) => {
    // Die Route setzt `private, no-store` — eine fremde Antwort darf in keinem Zwischenspeicher liegen.
    expect(run.headers['Cache-Control']).toBe('private, no-store')
  },
})
