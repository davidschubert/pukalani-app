import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * BETREIBER-BEDINGUNGEN AN DER ANLAGE-ROUTE (seit 2026-11-16).
 *
 * `POST /api/onboarding/site` (Platform-Seite) verlangt bei eingeschaltetem
 * Schalter `operatorTerms: true` im Body — VOR dem JWT und vor dem Control
 * Plane — und hält die Bestätigung nach der Anlage als Zeile fest
 * (`kind: 'operator'`, `way: 'wizard'`). Das Feld reist NIE ins Control Plane
 * (getrennte Deployments, `.strict()`-Schema dort).
 *
 * Nachgebildet ist, was hinter einer Naht liegt: Control Plane, JWT, die
 * Saat-Helfer und der Schreiber der Zustimmung (dessen eigenes Verhalten belegt
 * `core/tests/consentRecords.test.ts`).
 */

const order: string[] = []
const mintRuntimeJwt = vi.fn(async () => {
  order.push('jwt')
  return 'jwt-1'
})
let reused = false
const callControlPlane = vi.fn(async (_event: unknown, path: string, _body: unknown) => {
  order.push(`control:${path}`)
  return {
    communityId: 'c1', host: 'kiez.pukalani.app', url: 'https://kiez.pukalani.app', plan: 'pro',
    trialEndsAt: '2026-11-30T00:00:00.000Z', tenantId: 't1', reused,
  }
})
vi.mock('../server/utils/controlPlane', () => ({ callControlPlane, mintRuntimeJwt }))
vi.mock('../../pages/server/utils/seedHomePage', () => ({ seedHomePage: async () => null }))
vi.mock('../../pages/server/utils/seedLegalPages', () => ({ seedLegalPages: async () => null }))

let recordFails = false
const writeConsentRecord = vi.fn(async (_event: unknown, input: Record<string, unknown>) => {
  order.push(`consent:${String(input.kind)}`)
  if (recordFails) throw new Error('appwrite down')
  return 'recorded'
})
const logs: Array<{ level: string, name: string, data: Record<string, unknown> }> = []

let operatorTerms: Record<string, unknown> | undefined
function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}
let body: unknown = {}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', makeError)
vi.stubGlobal('readBody', async () => body)
// Für den Vergleich mit dem Stand vor den Betreiber-Bedingungen (der las den
// Body über `readValidatedBody`): dieselbe Quelle, dasselbe Schema.
vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (value: unknown) => unknown) => parse(body))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { onboarding: { operatorTerms } } }))
vi.stubGlobal('writeConsentRecord', writeConsentRecord)
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown>) => logs.push({ level, name, data }))
vi.stubGlobal('grantCommunityLabel', async () => {})
vi.stubGlobal('seedGuidelinesPage', async () => null)
vi.stubGlobal('seedCommunityFirstContent', async () => {})
vi.stubGlobal('controlHosts', () => [])
vi.stubGlobal('sendCommunityReadyMail', async () => true)

type Handler = (event: H3Event) => Promise<unknown>
const { default: createSite } = await import('../server/api/onboarding/site.post') as unknown as { default: Handler }

const event = { context: { user: { $id: 'u-owner', name: 'Owner', email: 'owner@example.test', prefs: {} } } } as unknown as H3Event
const SITE = { name: 'Kiez', slug: 'kiez', category: 'club', vibe: 'calm', locale: 'de' }
const ON = { url: { de: 'https://pukalani.app/de/betreiber-bedingungen', en: 'https://pukalani.app/community-operator-terms' }, version: '2026-11-entwurf-1', draft: true }

function sentSite(): Record<string, unknown> {
  const call = callControlPlane.mock.calls[0]
  return (call?.[2] as { site: Record<string, unknown> }).site
}

async function rejection(): Promise<{ status?: number, data?: { code?: string } } | null> {
  return createSite(event).then(() => null, (error: unknown) => error as { status?: number, data?: { code?: string } })
}

describe('POST /api/onboarding/site — Betreiber-Bedingungen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.length = 0
    logs.length = 0
    reused = false
    recordFails = false
    operatorTerms = ON
  })

  it('Schalter an, Kästchen fehlt ⇒ 400 operator_terms_required, kein JWT, kein Control Plane, keine Zeile', async () => {
    body = { ...SITE }
    const thrown = await rejection()
    expect(thrown?.status).toBe(400)
    expect(thrown?.data?.code).toBe('operator_terms_required')
    expect(mintRuntimeJwt).not.toHaveBeenCalled()
    expect(callControlPlane).not.toHaveBeenCalled()
    expect(writeConsentRecord).not.toHaveBeenCalled()
  })

  it('Schalter an, Kästchen ist nicht genau true ⇒ ebenfalls 400', async () => {
    for (const value of ['true', 1, false, null]) {
      body = { ...SITE, operatorTerms: value }
      const thrown = await rejection()
      expect(thrown?.data?.code, String(value)).toBe('operator_terms_required')
    }
    expect(callControlPlane).not.toHaveBeenCalled()
  })

  it('Schalter an, Kästchen gesetzt ⇒ Control Plane OHNE das Feld, danach die Zeile', async () => {
    body = { ...SITE, operatorTerms: true }
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    expect(sentSite()).toEqual(SITE)
    expect(sentSite()).not.toHaveProperty('operatorTerms')
    expect(writeConsentRecord).toHaveBeenCalledTimes(1)
    expect(writeConsentRecord.mock.calls[0]?.[1]).toEqual({
      userId: 'u-owner', kind: 'operator', version: '2026-11-entwurf-1', way: 'wizard',
    })
    expect(order).toEqual(['jwt', 'control:/api/control/onboarding/site', 'consent:operator'])
  })

  it('auch bei einer wiederholten Anlage (reused) wird die Bestätigung dieser Anfrage festgehalten', async () => {
    reused = true
    body = { ...SITE, operatorTerms: true }
    await createSite(event)
    expect(writeConsentRecord).toHaveBeenCalledTimes(1)
  })

  it('scheitert das Festhalten, bleibt die Anlage ein Erfolg — mit Warnung im Log, ohne E-Mail', async () => {
    recordFails = true
    body = { ...SITE, operatorTerms: true }
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    const warning = logs.find(entry => entry.name === 'onboarding.operator_terms_record_failed')
    expect(warning?.level).toBe('warn')
    expect(warning?.data).toMatchObject({ userId: 'u-owner', communityId: 'c1' })
    expect(JSON.stringify(warning?.data)).not.toContain('owner@example.test')
  })

  it('ein ungültiger Rest bleibt ein 400 aus dem Schema, ohne Control Plane', async () => {
    body = { ...SITE, slug: 'X', operatorTerms: true }
    const thrown = await rejection()
    expect(thrown?.status).toBe(400)
    expect(thrown?.data?.code).not.toBe('operator_terms_required')
    expect(callControlPlane).not.toHaveBeenCalled()
  })
})

describe('POST /api/onboarding/site — Schalter aus (Layer-Default)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.length = 0
    reused = false
    operatorTerms = { url: { de: '', en: '' }, version: '', draft: false }
  })

  it('legt an wie bisher, ohne Zeile', async () => {
    body = { ...SITE }
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    expect(sentSite()).toEqual(SITE)
    expect(writeConsentRecord).not.toHaveBeenCalled()
  })

  it('ein mitgeschicktes Feld stört nicht und reist nicht weiter', async () => {
    body = { ...SITE, operatorTerms: true }
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    expect(sentSite()).not.toHaveProperty('operatorTerms')
    expect(writeConsentRecord).not.toHaveBeenCalled()
  })

  it('auch ganz ohne Config-Eintrag: aus', async () => {
    operatorTerms = undefined
    body = { ...SITE }
    await expect(createSite(event)).resolves.toMatchObject({ communityId: 'c1' })
    expect(writeConsentRecord).not.toHaveBeenCalled()
  })
})
