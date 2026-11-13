import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMMUNITY_NOT_A_MEMBER_CODE,
  notAMemberNoticeApplies,
  participationVerdict,
} from '../shared/communityParticipation'
import { COMMUNITY_SUSPENDED_CODE } from '../shared/communitySuspension'
import {
  forgetCommunityAccessDecision,
  joinCommunity,
  rememberCommunityAccessRevoked,
} from '../server/utils/communityJoin'
import { requireCommunityParticipant } from '../server/utils/communityParticipation'
import { COMMUNITY_ID, resetCommunityWorld, wireCommunityWorld, type CommunityWorld, type ThrownLike } from './support/participationHarness'

/**
 * SEC-030 — MITMACHEN VERLANGT ZUGEHÖRIGKEIT.
 *
 * Ein Konto im Pool ist auf JEDEM Community-Host angemeldet. Bis hierher
 * prüften die Schreib-Routen nur „angemeldet", und die Datentür fragte zwar
 * beim Anlegen nach dem Beitritt, las die Antwort aber nicht: eine
 * geschlossene Registrierung und ein entzogener Zugang hielten niemanden ab.
 *
 * Die Regel (festgelegt, hier nur bewiesen): OFFENE Registrierung ⇒ der erste
 * eigene Schreibvorgang IST der Beitritt (A5). Geschlossen oder entzogen ⇒
 * 403 `not_a_member`. Silo und Kontroll-Host bleiben unberührt.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

async function outcome(fn: () => Promise<unknown>): Promise<{ ok: boolean, error?: ThrownLike }> {
  try {
    await fn()
    return { ok: true }
  }
  catch (error) {
    return { ok: false, error: error as ThrownLike }
  }
}

function participant(world: CommunityWorld, options?: Parameters<typeof requireCommunityParticipant>[1]) {
  const wired = wireCommunityWorld(world)
  return { ...wired, run: () => outcome(() => requireCommunityParticipant(wired.event, options)) }
}

describe('participationVerdict — Ausgang des Beitritts ⇒ Urteil', () => {
  it.each([
    ['joined', 'allow'],
    ['member', 'allow'],
    ['closed', 'deny'],
    ['removed', 'deny'],
    ['unavailable', 'ask-membership'],
  ] as const)('%s ⇒ %s', (joinOutcome, verdict) => {
    expect(participationVerdict(joinOutcome)).toBe(verdict)
  })

  it('der Grund-Schlüssel ist stabil (der Client liest ihn als reason)', () => {
    expect(COMMUNITY_NOT_A_MEMBER_CODE).toBe('not_a_member')
  })
})

describe('requireCommunityParticipant', () => {
  it('ohne Konto: 401, kein Beitrittsversuch', async () => {
    const p = participant({ who: 'guest', registration: 'open' })
    const r = await p.run()
    expect(r.error?.status).toBe(401)
    expect(p.joinHandlerCalls()).toBe(0)
  })

  it('Mitglied: durch, ohne das Control Plane zu fragen', async () => {
    const p = participant({ who: 'member' })
    expect((await p.run()).ok).toBe(true)
    expect(p.joinHandlerCalls()).toBe(0)
  })

  it('offene Registrierung: der erste Schreibvorgang ist der Beitritt ⇒ durch', async () => {
    const p = participant({ who: 'stranger', registration: 'open' })
    expect((await p.run()).ok).toBe(true)
    expect(p.joinHandlerCalls()).toBe(1)
    // Das Label folgt der Mitgliedschaft im selben Request.
    expect(p.event.context.user?.labels).toContain(COMMUNITY_ID)
  })

  it('geschlossene Registrierung: 403 not_a_member', async () => {
    const r = await participant({ who: 'stranger', registration: 'closed' }).run()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
  })

  it('entzogener Zugang: 403 not_a_member — auch wenn der Rollen-Cache noch „viewer" sagt', async () => {
    const r = await participant({ who: 'removed' }).run()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
  })

  it('Naht gestört, Pool, ohne Label: 403 (fail-closed)', async () => {
    const r = await participant({ who: 'stranger', registration: 'open', seam: 'down' }).run()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
  })

  it('Naht gestört, Pool, mit Label: durch (die Mitgliedschaft entscheidet)', async () => {
    const r = await participant({ who: 'legacy', seam: 'down' }).run()
    expect(r.ok).toBe(true)
  })

  it('kein Handler registriert, Pool, ohne Label: 403', async () => {
    const r = await participant({ who: 'stranger', seam: 'none' }).run()
    expect(r.error?.status).toBe(403)
  })

  it('Silo: angemeldet genügt (das Projekt ist die Grenze)', async () => {
    const p = participant({ who: 'stranger', mode: 'silo' })
    expect((await p.run()).ok).toBe(true)
    expect(p.joinHandlerCalls()).toBe(0)
  })

  it('gesperrte Community: 403 community_suspended und KEIN Beitrittsversuch', async () => {
    const p = participant({ who: 'stranger', registration: 'open', suspended: true })
    const r = await p.run()
    expect(r.error).toMatchObject({ status: 403, data: { code: COMMUNITY_SUSPENDED_CODE } })
    expect(p.joinHandlerCalls()).toBe(0)
    expect(p.event.context.user?.labels).not.toContain(COMMUNITY_ID)
  })

  it('gesperrte Community: auch ein Mitglied schreibt keinen Inhalt', async () => {
    const r = await participant({ who: 'member', suspended: true }).run()
    expect(r.error?.data?.code).toBe(COMMUNITY_SUSPENDED_CODE)
  })
})

describe('requireCommunityParticipant mit openDuringSuspension (Melden)', () => {
  const options = { openDuringSuspension: true } as const

  it('gesperrt: ein Mitglied darf melden', async () => {
    const p = participant({ who: 'member', suspended: true }, options)
    expect((await p.run()).ok).toBe(true)
    expect(p.joinHandlerCalls()).toBe(0)
  })

  it('gesperrt: ein Nicht-Mitglied nicht — und es wird NICHT beigetreten, auch bei offener Registrierung', async () => {
    const p = participant({ who: 'stranger', registration: 'open', suspended: true }, options)
    const r = await p.run()
    expect(r.error).toMatchObject({ status: 403, data: { code: 'not_a_member' } })
    expect(p.joinHandlerCalls()).toBe(0)
  })

  it('gesperrt: ein Entfernter nicht', async () => {
    const r = await participant({ who: 'removed', suspended: true }, options).run()
    expect(r.error?.status).toBe(403)
  })

  it('nicht gesperrt: verhält sich wie ohne Option (offen ⇒ Beitritt)', async () => {
    const p = participant({ who: 'stranger', registration: 'open' }, options)
    expect((await p.run()).ok).toBe(true)
    expect(p.joinHandlerCalls()).toBe(1)
  })

  it('nicht gesperrt, geschlossen: 403', async () => {
    const r = await participant({ who: 'stranger', registration: 'closed' }, options).run()
    expect(r.error?.data?.code).toBe('not_a_member')
  })
})

describe('joinCommunity — die gemerkte Ablehnung und das Gedächtnis je Request', () => {
  it('ein gemerkter Entzug schlägt die gecachte Rolle', async () => {
    const { event, joinHandlerCalls } = wireCommunityWorld({ who: 'removed' })
    expect(await joinCommunity(event, 'contribution')).toBe('removed')
    // Die Notiz beantwortet es ohne Rückfrage beim Control Plane.
    expect(joinHandlerCalls()).toBe(0)
  })

  it('nach forgetCommunityAccessDecision (Einladung angenommen) gilt die Rolle wieder', async () => {
    wireCommunityWorld({ who: 'removed' })
    forgetCommunityAccessDecision(COMMUNITY_ID, 'u-removed')
    // Ein frisches Event — die Annahme läuft in einem eigenen Request.
    const { event } = { event: { context: { user: { $id: 'u-removed', labels: [] }, tenant: { mode: 'pool', tenantId: 't-a', communityId: COMMUNITY_ID, projectId: 'pool', suspension: '' } } } }
    expect(await joinCommunity(event as never, 'contribution')).toBe('member')
  })

  it('der Entzug in diesem Prozess wirkt sofort, auch für ein bisheriges Mitglied', async () => {
    const { event } = wireCommunityWorld({ who: 'member' })
    rememberCommunityAccessRevoked(COMMUNITY_ID, 'u-member')
    expect(await joinCommunity(event, 'contribution')).toBe('removed')
  })

  it('fragt das Control Plane höchstens EINMAL je Request', async () => {
    const { event, joinHandlerCalls } = wireCommunityWorld({ who: 'stranger', registration: 'open' })
    expect(await joinCommunity(event, 'contribution')).toBe('joined')
    expect(await joinCommunity(event, 'contribution')).toBe('joined')
    expect(joinHandlerCalls()).toBe(1)
  })

  it('auch eine Ablehnung wird je Request nur einmal erfragt', async () => {
    const { event, joinHandlerCalls } = wireCommunityWorld({ who: 'stranger', registration: 'closed' })
    await joinCommunity(event, 'contribution')
    await joinCommunity(event, 'contribution')
    expect(joinHandlerCalls()).toBe(1)
  })

  it('wirft weiterhin nie: eine gestörte Naht heißt unavailable', async () => {
    const { event } = wireCommunityWorld({ who: 'stranger', seam: 'down' })
    await expect(joinCommunity(event, 'contribution')).resolves.toBe('unavailable')
  })
})

describe('notAMemberNoticeApplies — wann der zentrale Hinweis erscheint', () => {
  const base = { status: 403, reason: 'not_a_member', method: 'POST', url: '/api/comments' }

  it('Schreibversuch mit not_a_member ⇒ Hinweis', () => {
    expect(notAMemberNoticeApplies(base, [])).toBe(true)
  })

  it('anderer Status oder anderer Grund ⇒ kein Hinweis', () => {
    expect(notAMemberNoticeApplies({ ...base, status: 401 }, [])).toBe(false)
    expect(notAMemberNoticeApplies({ ...base, reason: 'community_suspended' }, [])).toBe(false)
  })

  it('Lesezugriff ⇒ kein Hinweis (die Seite zeigt es selbst); ohne Methode gilt GET', () => {
    expect(notAMemberNoticeApplies({ ...base, method: 'GET' }, [])).toBe(false)
    expect(notAMemberNoticeApplies({ status: 403, reason: 'not_a_member' }, [])).toBe(false)
  })

  it('Adressen, deren Seiten es selbst erklären, bleiben still — auch absolut', () => {
    const prefixes = ['/api/courses/', '/api/lessons/']
    expect(notAMemberNoticeApplies({ ...base, url: '/api/courses/wolken/enroll' }, prefixes)).toBe(false)
    expect(notAMemberNoticeApplies({ ...base, url: 'https://kunde-a.example/api/lessons/l1/complete' }, prefixes)).toBe(false)
    expect(notAMemberNoticeApplies({ ...base, url: '/api/comments' }, prefixes)).toBe(true)
  })

  it('DELETE und PATCH zählen als Schreibversuch', () => {
    expect(notAMemberNoticeApplies({ ...base, method: 'delete' }, [])).toBe(true)
    expect(notAMemberNoticeApplies({ ...base, method: 'PATCH' }, [])).toBe(true)
  })
})

describe('der Hinweis hat einen Leser und Texte in beiden Sprachen', () => {
  const REPO = resolve(import.meta.dirname, '../../..')
  const plugin = readFileSync(resolve(REPO, 'packages/core/app/plugins/community-suspended-notice.client.ts'), 'utf8')

  it('das Plugin fragt die pure Regel und nennt die Schlüssel', () => {
    expect(plugin).toContain('notAMemberNoticeApplies(')
    expect(plugin).toContain('error.notAMember')
    expect(plugin).toContain('error.notAMemberHint')
  })

  it.each(['de', 'en'] as const)('%s: beide Schlüssel vorhanden, ohne spitze Klammern', (locale) => {
    const messages = JSON.parse(readFileSync(resolve(REPO, `packages/core/i18n/locales/${locale}.json`), 'utf8')) as { error?: Record<string, string> }
    for (const key of ['notAMember', 'notAMemberHint']) {
      expect(messages.error?.[key], key).toBeTruthy()
      expect(messages.error?.[key]).not.toMatch(/[<>@]/)
    }
  })

  it('die Kurs-Seiten erklären es selbst und sind abgemeldet (kein doppelter Hinweis)', () => {
    const courses = readFileSync(resolve(REPO, 'packages/courses/app/app.config.ts'), 'utf8')
    expect(courses).toContain('notAMemberSelfExplained')
    expect(courses).toContain('/api/courses/')
  })

  it('die Vorlage reicht Methode und Adresse an den Haken', () => {
    const config = readFileSync(resolve(REPO, 'packages/core/nuxt.config.ts'), 'utf8')
    expect(config).toContain('method: String(context.options?.method')
    expect(config).toContain('url: typeof context.request')
  })
})
