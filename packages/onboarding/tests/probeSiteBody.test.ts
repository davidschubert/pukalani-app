import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { onboardingSiteSchema } from '../../control/schemas/onboarding'
import { generateInviteCode, probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

/**
 * DER RUMPF DER BEWEIS-SKRIPTE PASST ZUR ECHTEN ROUTE (OPS-009, GA1 P27).
 *
 * 22 Beweis-Skripte legen ihre Probe-Community über `POST /api/onboarding/site`
 * an, alle mit EINEM Rumpf aus `scripts/lib/probe-stage.mjs`. Bekommt die
 * Route ein neues Pflichtfeld, wird DIESER Test rot — nicht erst der nächste
 * Live-Lauf eines Skripts. Geprüft wird gegen das echte Schema des Control
 * Plane UND gegen den echten Handler mit eingeschalteten
 * Betreiber-Bedingungen; nachgebildet ist nur, was hinter einer Naht liegt
 * (Control Plane, JWT, Saat-Helfer, Schreiber der Zustimmung) — dieselben
 * Attrappen wie in `operatorTermsRoute.test.ts`.
 */

const callControlPlane = vi.fn(async (_event: unknown, _path: string, _body: unknown) => ({
  communityId: 'c1', host: 'probe.pukalani.app', url: 'https://probe.pukalani.app', plan: 'pro',
  trialEndsAt: '2026-11-30T00:00:00.000Z', tenantId: 't1', reused: false,
}))
const mintRuntimeJwt = vi.fn(async () => 'jwt-1')
vi.mock('../server/utils/controlPlane', () => ({ callControlPlane, mintRuntimeJwt }))
vi.mock('../../pages/server/utils/seedHomePage', () => ({ seedHomePage: async () => null }))
vi.mock('../../pages/server/utils/seedLegalPages', () => ({ seedLegalPages: async () => null }))

const writeConsentRecord = vi.fn(async () => 'recorded')
function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}
let body: unknown = {}
const OPERATOR_TERMS_ON = {
  url: { de: 'https://pukalani.app/de/betreiber-bedingungen', en: 'https://pukalani.app/community-operator-terms' },
  version: '2026-11-entwurf-1',
  draft: true,
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', makeError)
vi.stubGlobal('readBody', async () => body)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { onboarding: { operatorTerms: OPERATOR_TERMS_ON } } }))
vi.stubGlobal('writeConsentRecord', writeConsentRecord)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('grantCommunityLabel', async () => {})
vi.stubGlobal('seedGuidelinesPage', async () => null)
vi.stubGlobal('seedCommunityFirstContent', async () => {})
vi.stubGlobal('controlHosts', () => [])
vi.stubGlobal('sendCommunityReadyMail', async () => true)

type Handler = (event: H3Event) => Promise<unknown>
const { default: createSite } = await import('../server/api/onboarding/site.post') as unknown as { default: Handler }
const event = { context: { user: { $id: 'u-probe', name: 'Probe', email: 'probe@example.test', prefs: {} } } } as unknown as H3Event

function withoutOperatorTerms(input: Record<string, unknown>): Record<string, unknown> {
  const { operatorTerms: _operatorTerms, ...rest } = input
  return rest
}

/** Die Abweichungen, die die umgestellten Skripte heute als `overrides` schicken. */
const SCRIPT_VARIANTS: Array<[string, Record<string, unknown>]> = [
  ['Standard', {}],
  ['anderer Vibe und Text', { vibe: 'elegant', description: 'Wir prüfen etwas.' }],
  ['Ziel „relationships", ohne Beschreibung', { goal: 'relationships', vibe: 'warm', description: undefined }],
  ['nur die drei Pflicht-Antworten (U12)', { purpose: undefined, memberRange: undefined, goal: undefined, description: undefined, category: 'other', vibe: 'calm' }],
  ['ohne Sprache', { locale: undefined }],
]

describe('probeSiteBody — der gemeinsame Rumpf der Beweis-Skripte', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(SCRIPT_VARIANTS)('%s: besteht das echte Schema des Control Plane (nach Abzug von operatorTerms)', (_label, overrides) => {
    const sent = probeSiteBody({ name: 'Probe Kiez', slug: 'probe-kiez', inviteCode: generateInviteCode('test'), ...overrides })
    expect(sent.operatorTerms).toBe(true)
    const parsed = onboardingSiteSchema.safeParse(withoutOperatorTerms(sent))
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true)
  })

  it.each(SCRIPT_VARIANTS)('%s: die echte Route nimmt ihn bei eingeschalteten Betreiber-Bedingungen an', async (_label, overrides) => {
    body = probeSiteBody({ name: 'Probe Kiez', slug: 'probe-kiez', inviteCode: generateInviteCode('test'), ...overrides })
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    expect(writeConsentRecord).toHaveBeenCalledTimes(1)
    const sentSite = (callControlPlane.mock.calls[0]?.[2] as { site: Record<string, unknown> }).site
    expect(sentSite).toEqual(withoutOperatorTerms(body as Record<string, unknown>))
  })

  it('ohne Einladungs-Code (Tor abgeschaltet) bleibt der Rumpf gültig', () => {
    const sent = probeSiteBody({ name: 'Probe Kiez', slug: 'probe-kiez' })
    expect(sent).not.toHaveProperty('inviteCode')
    expect(onboardingSiteSchema.safeParse(withoutOperatorTerms(sent)).success).toBe(true)
  })

  it('Gegenprobe: ohne die Betreiber-Bestätigung lehnt die Route ab — der Test sieht also hin', async () => {
    body = probeSiteBody({ name: 'Probe Kiez', slug: 'probe-kiez', operatorTerms: undefined })
    const thrown = await createSite(event).then(() => null, (error: unknown) => error as { status?: number, data?: { code?: string } })
    expect(thrown?.status).toBe(400)
    expect(thrown?.data?.code).toBe('operator_terms_required')
    expect(callControlPlane).not.toHaveBeenCalled()
  })
})
