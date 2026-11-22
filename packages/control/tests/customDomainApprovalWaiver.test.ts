import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureSiteCard } from '../../core/server/utils/siteCard'
import { customDomainApprovalWaived, customDomainApprovalWaiverState, resetCustomDomainApprovalWaiver } from '../server/utils/customDomainApprovalWaiver'

/**
 * PK1 K6 — DIE FREIGABE-PFLICHT FÜR EIGENE DOMAINS FÄLLT NUR, WENN BEIDE
 * SEITEN `write` MIT KARTEN BESTÄTIGEN: die Konsole selbst (eigener Schalter)
 * UND die Platform (über ihr öffentliches `/api/health`), und die Platform
 * die Live-Weiterleitung aus E1d meldet (`liveRelay`, Gegenlesen E1c Fund 1). Alles andere ⇒ die
 * Pflicht bleibt (fail-closed). Erwartungswerte stehen ausgeschrieben, nie
 * aus der geprüften Antwort abgeleitet.
 */

const KEY = Buffer.alloc(32, 3).toString('base64')
const HEALTH_URL = 'https://platform.example.test/api/health'
const events: Array<{ name: string, fields: Record<string, unknown> }> = []
let runtime: Record<string, unknown> = {}

vi.stubGlobal('logEvent', (_level: string, name: string, fields: Record<string, unknown>) => events.push({ name, fields }))
vi.stubGlobal('useRuntimeConfig', () => runtime)

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', fetchMock)

function platformAnswers(body: unknown, status = 200) {
  // Je Abruf eine NEUE Antwort — ein Rumpf lässt sich nur einmal lesen.
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

const NOW = Date.parse('2026-11-22T10:00:00.000Z')

beforeEach(() => {
  resetCustomDomainApprovalWaiver()
  events.length = 0
  fetchMock.mockReset()
  runtime = { customDomainPlatformHealthUrl: HEALTH_URL }
  configureSiteCard({ mode: 'write', key: KEY })
})

afterEach(() => {
  configureSiteCard({ mode: 'off' })
})

describe('customDomainApprovalWaived — eigener Schalter', () => {
  it.each([
    ['off', { mode: 'off' }],
    ['read', { mode: 'read', key: KEY }],
    ['write ohne Schlüssel', { mode: 'write', key: '' }],
  ])('%s ⇒ Pflicht bleibt, die Platform wird gar nicht gefragt', async (_label, config) => {
    configureSiteCard(config)
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, previous: false, liveRelay: true } })
    expect(await customDomainApprovalWaived(NOW)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('customDomainApprovalWaived — Bestätigung der Platform', () => {
  it('Platform meldet write mit Karten UND Live-Weiterleitung (E1d) ⇒ Pflicht entfällt', async () => {
    platformAnswers({ ok: true, build: 'x', siteCard: { mode: 'write', cards: true, previous: false, liveRelay: true } })
    expect(await customDomainApprovalWaiverState(NOW)).toEqual({ waived: true, answered: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(HEALTH_URL)
  })

  it.each([
    ['read', { ok: true, siteCard: { mode: 'read', cards: true, previous: false } }],
    ['write ohne Schlüssel', { ok: true, siteCard: { mode: 'write', cards: false, previous: false } }],
    ['off', { ok: true, siteCard: { mode: 'off', cards: false, previous: false } }],
    ['Stand vor E1c (kein Feld)', { ok: true, build: 'x' }],
    ['Stand E1c: write mit Karten, ohne Live-Weiterleitung', { ok: true, siteCard: { mode: 'write', cards: true, previous: false } }],
  ])('Platform meldet %s ⇒ Pflicht bleibt, Frage beantwortet', async (_label, body) => {
    platformAnswers(body)
    expect(await customDomainApprovalWaiverState(NOW)).toEqual({ waived: false, answered: true })
  })

  const UNANSWERED = { waived: false, answered: false }

  it('Platform antwortet mit Fehlerstatus ⇒ Pflicht bleibt, Frage offen', async () => {
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } }, 503)
    expect(await customDomainApprovalWaiverState(NOW)).toEqual(UNANSWERED)
  })

  it('Platform nicht erreichbar ⇒ Pflicht bleibt, Frage offen', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await customDomainApprovalWaiverState(NOW)).toEqual(UNANSWERED)
  })

  it('kein JSON ⇒ Pflicht bleibt, Frage offen', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await customDomainApprovalWaiverState(NOW)).toEqual(UNANSWERED)
  })

  it.each([
    ['leer (Vorgabe)', ''],
    ['http auf fremdem Host', 'http://platform.example.test/api/health'],
    ['anderes Schema', 'ftp://platform.example.test/api/health'],
  ])('Adresse %s ⇒ Pflicht bleibt, kein Abruf', async (_label, url) => {
    runtime = { customDomainPlatformHealthUrl: url }
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } })
    expect(await customDomainApprovalWaiverState(NOW)).toEqual(UNANSWERED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lokale http-Adresse ist erlaubt (Entwicklung, Bühne)', async () => {
    runtime = { customDomainPlatformHealthUrl: 'http://localhost:3250/api/health' }
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } })
    expect(await customDomainApprovalWaived(NOW)).toBe(true)
  })
})

describe('customDomainApprovalWaived — Zwischenspeicher und Protokoll', () => {
  it('ein „ja" gilt 60 s, danach wird neu gefragt', async () => {
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } })
    expect(await customDomainApprovalWaived(NOW)).toBe(true)
    // Platform schaltet zurück — innerhalb der 60 s gilt noch das „ja" …
    platformAnswers({ ok: true, siteCard: { mode: 'read', cards: true } })
    expect(await customDomainApprovalWaived(NOW + 59_000)).toBe(true)
    // … danach nicht mehr.
    expect(await customDomainApprovalWaived(NOW + 61_000)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ein „nein" gilt 30 s', async () => {
    platformAnswers({ ok: true, siteCard: { mode: 'read', cards: true } })
    expect(await customDomainApprovalWaived(NOW)).toBe(false)
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } })
    expect(await customDomainApprovalWaived(NOW + 29_000)).toBe(false)
    expect(await customDomainApprovalWaived(NOW + 31_000)).toBe(true)
  })

  it('ein Wechsel schreibt genau eine Zeile, ohne Adresse und ohne Schlüssel', async () => {
    platformAnswers({ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: true } })
    await customDomainApprovalWaived(NOW)
    await customDomainApprovalWaived(NOW + 61_000)
    expect(events).toEqual([{ name: 'community.custom_domain_approval_waiver', fields: { waived: true, answered: true, reason: 'platform_confirms' } }])
    expect(JSON.stringify(events)).not.toContain(KEY)
  })
})
