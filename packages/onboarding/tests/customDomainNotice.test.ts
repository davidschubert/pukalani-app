import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomDomainGraceNotice } from '../../control/shared/customDomainNotice'
import { createRaceTablesDB } from '../../control/tests/support/raceTablesDB'

/**
 * BE-014 — DER HINWEIS-LAUF der Platform-App: je (Community, Frist, Art,
 * Owner) GENAU EINE Glocken-Zeile und GENAU EINE Mail — auch bei zwei
 * gleichzeitigen Läufen (zwei Prozesse = zwei Modul-Instanzen) und bei
 * stündlicher Wiederholung. Die Mail geht an der Benachrichtigungs-Einstellung
 * vorbei (Hinweis zum Vertrag).
 *
 * Echt laufen: der Lauf UND `notify()` aus dem Core gegen die Renn-Ablage
 * (feste Zeilen-Id ⇒ 409 für den Zweiten). Nachgebildet: der Leser des
 * Control Plane, die Konten im Pool und der Mail-Versand.
 */

const race = createRaceTablesDB()
const { notify } = await import('../../core/server/utils/notify')

interface Account { $id: string, email: string, prefs: Record<string, unknown> }
const accounts = new Map<string, Account>()
const users = {
  get: async ({ userId }: { userId: string }) => {
    const found = accounts.get(userId)
    if (!found) throw Object.assign(new Error('User not found'), { code: 404 })
    return found
  },
}

const mails: { to: string, subject: string, text: string }[] = []
let mailBehaviour: (to: string) => Promise<boolean> = async () => true
const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main', appwriteProjectId: 'account' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: race.tablesDB, users }))
vi.stubGlobal('notify', notify)
vi.stubGlobal('sendMail', async (_event: unknown, input: { to: string, subject: string, text: string }) => {
  const sent = await mailBehaviour(input.to)
  if (sent) mails.push(input)
  return sent
})
vi.stubGlobal('resolveEmailPrefs', (prefs: Record<string, unknown> | undefined) => ({
  emailNotifications: prefs?.emailNotifications === 'instant' || prefs?.emailNotifications === 'digest' ? prefs.emailNotifications : 'off',
  emailLocale: prefs?.emailLocale === 'de' ? 'de' : 'en',
  emailDigestLastAt: '',
}))
vi.stubGlobal('logEvent', (level: string, name: string, detail: Record<string, unknown> = {}) => { logs.push({ level, name, detail }) })

type NoticeModule = typeof import('../server/utils/customDomainNotice')
async function freshModule(): Promise<NoticeModule> {
  vi.resetModules()
  return await import('../server/utils/customDomainNotice')
}

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

let communities: CustomDomainGraceNotice[] = []
const reader = async (runtimeProjectId: string) => {
  expect(runtimeProjectId).toBe('account')
  return communities.map(community => ({ ...community, ownerUserIds: [...community.ownerUserIds] }))
}

function grace(endsAt: number, overrides: Partial<CustomDomainGraceNotice> = {}): CustomDomainGraceNotice {
  return {
    communityId: 'c1', tenantId: 't-c1', host: 'surfclub.pukalani.app', name: 'Surfclub', domain: 'surfclub.de',
    graceEndsAt: iso(endsAt), ownerUserIds: ['u-de', 'u-en'], ...overrides,
  }
}

function bellRows() {
  return [...race.table('notifications').values()]
}

let mod: NoticeModule

beforeEach(async () => {
  race.reset()
  accounts.clear()
  mails.length = 0
  logs.length = 0
  mailBehaviour = async () => true
  // Beide Owner haben Benachrichtigungs-Mails AUS — der Hinweis kommt trotzdem.
  accounts.set('u-de', { $id: 'u-de', email: 'de@example.test', prefs: { emailLocale: 'de', emailNotifications: 'off' } })
  accounts.set('u-en', { $id: 'u-en', email: 'en@example.test', prefs: {} })
  communities = [grace(NOW + 14 * DAY)]
  mod = await freshModule()
  mod.registerCustomDomainNoticeReader(reader)
})

describe('runCustomDomainNoticeSweep', () => {
  it('erster Tag: je Owner eine Glocken-Zeile und eine Mail in seiner Sprache, trotz Einstellung „aus"', async () => {
    const result = await mod.runCustomDomainNoticeSweep(NOW)
    expect(result).toMatchObject({ checked: 1, notified: 2, mailed: 2 })
    const rows = bellRows()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).toMatchObject({ type: 'billing', link: '/dashboard/community/domain', communityId: 't-c1', title: 'Surfclub' })
    }
    expect(mails.map(mail => mail.to).sort()).toEqual(['de@example.test', 'en@example.test'])
    expect(mails.find(mail => mail.to === 'de@example.test')!.subject).toContain('bleibt noch bis zum 30. November 2026 aktiv')
    expect(mails.find(mail => mail.to === 'en@example.test')!.subject).toContain('stays active until November 30, 2026')
  })

  it('stündliche Wiederholung: nichts Neues, keine Mail', async () => {
    await mod.runCustomDomainNoticeSweep(NOW)
    mails.length = 0
    const again = await mod.runCustomDomainNoticeSweep(NOW + 60 * 60 * 1000)
    expect(again.notified).toBe(0)
    expect(mails).toEqual([])
    expect(bellRows()).toHaveLength(2)
  })

  it('zwei gleichzeitige Läufe in zwei Prozessen: trotzdem genau eine Zeile und eine Mail je Owner', async () => {
    const other = await freshModule()
    other.registerCustomDomainNoticeReader(reader)
    const [a, b] = await Promise.all([mod.runCustomDomainNoticeSweep(NOW), other.runCustomDomainNoticeSweep(NOW)])
    expect(a.notified + b.notified).toBe(2)
    expect(bellRows()).toHaveLength(2)
    expect(mails).toHaveLength(2)
    expect(new Set(mails.map(mail => mail.to)).size).toBe(2)
  })

  it('drei Tage vorher kommt die Erinnerung dazu — genau einmal', async () => {
    await mod.runCustomDomainNoticeSweep(NOW)
    mails.length = 0
    const later = NOW + 11 * DAY + 60_000 // noch knapp 3 Tage
    await mod.runCustomDomainNoticeSweep(later)
    expect(mails).toHaveLength(2)
    expect(mails.find(mail => mail.to === 'de@example.test')!.subject).toBe('In drei Tagen schalten wir surfclub.de ab')
    await mod.runCustomDomainNoticeSweep(later + 60 * 60 * 1000)
    expect(mails).toHaveLength(2)
    expect(bellRows()).toHaveLength(4)
  })

  it('erst kurz vor Schluss bemerkt: nur die Erinnerung, nicht zugleich „noch 14 Tage"', async () => {
    communities = [grace(NOW + 2 * DAY, { ownerUserIds: ['u-de'] })]
    await mod.runCustomDomainNoticeSweep(NOW)
    expect(mails.map(mail => mail.subject)).toEqual([
      'In drei Tagen schalten wir surfclub.de ab',
    ])
  })

  it('nach dem Ende der Frist: nichts', async () => {
    communities = [grace(NOW - 1)]
    expect((await mod.runCustomDomainNoticeSweep(NOW)).notified).toBe(0)
    expect(mails).toEqual([])
  })

  it('eine NEUE Frist (neues Ende) meldet wieder', async () => {
    await mod.runCustomDomainNoticeSweep(NOW)
    mails.length = 0
    communities = [grace(NOW + 40 * DAY)]
    await mod.runCustomDomainNoticeSweep(NOW + 26 * DAY)
    expect(mails).toHaveLength(2)
    expect(bellRows()).toHaveLength(4)
  })

  it('Konto ohne Adresse: nur die Glocke', async () => {
    accounts.set('u-en', { $id: 'u-en', email: '', prefs: {} })
    const result = await mod.runCustomDomainNoticeSweep(NOW)
    expect(result.notified).toBe(2)
    expect(mails.map(mail => mail.to)).toEqual(['de@example.test'])
  })

  it('Mail scheitert (false oder Wurf): Fehlerzeile, die Glocke steht, der Lauf geht weiter', async () => {
    mailBehaviour = async (to) => {
      if (to === 'de@example.test') throw new Error('SMTP weg')
      return false
    }
    const result = await mod.runCustomDomainNoticeSweep(NOW)
    expect(result).toMatchObject({ notified: 2, mailed: 0 })
    expect(bellRows()).toHaveLength(2)
    const failed = logs.filter(log => log.name === 'custom_domain.notice_mail_failed')
    expect(failed).toHaveLength(2)
    for (const log of failed) {
      expect(log.level).toBe('error')
      expect(log.detail).toEqual({ communityId: 'c1', kind: 'start' })
    }
    // Kein zweiter Versuch beim nächsten Lauf: der Vermerk ist die Zeile.
    mailBehaviour = async () => true
    await mod.runCustomDomainNoticeSweep(NOW + 60_000)
    expect(mails).toEqual([])
  })

  it('fehlendes Konto: Zeile im Log, der andere Owner bekommt seinen Hinweis', async () => {
    accounts.delete('u-de')
    const result = await mod.runCustomDomainNoticeSweep(NOW)
    expect(result.notified).toBe(1)
    expect(logs.some(log => log.name === 'custom_domain.notice_recipient_missing')).toBe(true)
    expect(mails.map(mail => mail.to)).toEqual(['en@example.test'])
  })

  it('keine Adresse und kein Name im Log', async () => {
    await mod.runCustomDomainNoticeSweep(NOW)
    expect(JSON.stringify(logs)).not.toContain('@')
  })
})
