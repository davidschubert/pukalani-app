import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeAccountRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
} from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { AVATARS_BUCKET, coreKit } from './support/coreRouteKit'
import { requireRecentAuth } from '../server/utils/recentAuth'

/**
 * SITZUNGEN, ZWEI-FAKTOR, EXPORT/LÖSCHUNG, ABLAGE — ROLLEN-TESTS AN DER
 * ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Alles hier gehört dem eigenen Konto. Gefragt wird jedes Mal: Gast ⇒ 401,
 * angemeldet ⇒ durch, und die Wirkung trifft NUR das eigene Konto — über den
 * Session-Klienten, oder (Admin-Klient) mit der Konto-Id aus der Sitzung, nie
 * aus der Anfrage. Die Löschung verlangt zusätzlich die FRISCHE Anmeldung
 * (echte `requireRecentAuth`, das Alter liefert die nachgebaute Sitzung).
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)

beforeEach(() => {
  appwriteFake.reset()
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// ── Sitzungen ───────────────────────────────────────────────────────────────

const SESSION_GLOBALS = {
  mapSafeSession: (session: { $id: string }, current: boolean) => ({ id: session.$id, current }),
  lookupCityForIp: async () => '',
}

describeAccountRoute('GET /api/auth/sessions', () => import('../server/api/auth/sessions/index.get'), {
  globals: { ...coreKit().globals, ...SESSION_GLOBALS },
})

describe('GET /api/auth/sessions — liest nur die eigenen Sitzungen', () => {
  it('über den Session-Klienten, nie per Admin', async () => {
    appwriteFake.reply('session.account.listSessions', () => ({ sessions: [{ $id: 's-1', current: true }] }))
    const run = await probeRoute(() => import('../server/api/auth/sessions/index.get'), {
      who: 'stranger',
      query: { userId: userIdOf('member') },
      globals: { ...coreKit().globals, ...SESSION_GLOBALS },
    })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.listSessions')).toHaveLength(1)
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

describeAccountRoute('DELETE /api/auth/sessions', () => import('../server/api/auth/sessions/index.delete'), {
  globals: coreKit().globals,
})

describe('DELETE /api/auth/sessions — beendet alle EIGENEN Sitzungen', () => {
  it('über den Session-Klienten, Cookie fällt', async () => {
    const run = await probeRoute(() => import('../server/api/auth/sessions/index.delete'), { who: 'member', globals: coreKit().globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.deleteSessions')).toHaveLength(1)
    expect(appwriteFake.used('admin')).toBe(false)
    expect(appwriteFake.cookiesCleared()).toBe(1)
  })
})

describeAccountRoute('DELETE /api/auth/sessions/[id]', () => import('../server/api/auth/sessions/[id].delete'), {
  params: { id: 's-andere' },
  globals: coreKit().globals,
})

describe('DELETE /api/auth/sessions/[id] — die Id reicht nur ins eigene Konto', () => {
  const load = () => import('../server/api/auth/sessions/[id].delete')

  it('löscht über den Session-Klienten (Appwrite grenzt auf das eigene Konto ein), nie per Admin', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell' }))
    const run = await probeRoute(load, { who: 'member', params: { id: 's-andere' }, globals: coreKit().globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.deleteSession')).toEqual([{ sessionId: 's-andere' }])
    expect(appwriteFake.used('admin')).toBe(false)
    expect(appwriteFake.cookiesCleared(), 'eine andere Sitzung: das eigene Cookie bleibt').toBe(0)
  })

  it('die eigene, aktuelle Sitzung: Cookie fällt mit', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell' }))
    const run = await probeRoute(load, { who: 'member', params: { id: 's-aktuell' }, globals: coreKit().globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.cookiesCleared()).toBe(1)
  })

  it('eine Sitzung, die Appwrite im eigenen Konto nicht findet: kein Erfolg', async () => {
    appwriteFake.reply('session.account.deleteSession', () => {
      throw Object.assign(new Error('session not found'), { code: 404, type: 'user_session_not_found' })
    })
    const run = await probeRoute(load, { who: 'stranger', params: { id: 's-fremd' }, globals: coreKit().globals })
    expect(run.status).not.toBe(200)
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

// ── Realtime-Ausweis ────────────────────────────────────────────────────────

describeAccountRoute('GET /api/auth/realtime-token', () => import('../server/api/auth/realtime-token.get'), {
  globals: coreKit().globals,
})

describe('GET /api/auth/realtime-token — das JWT gilt nur dem eigenen Konto', () => {
  const load = () => import('../server/api/auth/realtime-token.get')

  it('geprägt für die Konto-Id der Sitzung, eine Id in der Anfrage zählt nicht', async () => {
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    const run = await probeRoute(load, {
      who: 'stranger',
      query: { userId: userIdOf('member') },
      body: { userId: userIdOf('member') },
      globals: coreKit().globals,
    })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createJWT').map(args => args.userId)).toEqual([userIdOf('stranger')])
  })

  it('ohne Konto: kein JWT geprägt', async () => {
    await probeRoute(load, { who: 'guest', globals: coreKit().globals })
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

// ── Zwei-Faktor ─────────────────────────────────────────────────────────────

describeAccountRoute('GET /api/auth/mfa/status', () => import('../server/api/auth/mfa/status.get'), {
  globals: coreKit().globals,
})

describe('GET /api/auth/mfa/status — liest die Faktoren der eigenen Sitzung', () => {
  it('über den Session-Klienten, nie per Admin', async () => {
    appwriteFake.reply('session.account.listMFAFactors', () => ({ totp: true, recoveryCode: true }))
    const run = await probeRoute(() => import('../server/api/auth/mfa/status.get'), {
      who: 'member',
      userFields: { mfa: true },
      globals: coreKit().globals,
    })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ enabled: true, totpVerified: true, hasRecoveryCodes: true })
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

describeAccountRoute('POST /api/auth/mfa/setup', () => import('../server/api/auth/mfa/setup.post'), {
  globals: coreKit().globals,
})

describe('POST /api/auth/mfa/setup — richtet den Faktor am eigenen Konto ein', () => {
  it('über den Session-Klienten, nie per Admin', async () => {
    appwriteFake.reply('session.account.createMFAAuthenticator', () => ({ secret: 'probe-geheimnis', uri: 'otpauth://probe' }))
    const run = await probeRoute(() => import('../server/api/auth/mfa/setup.post'), { who: 'stranger', globals: coreKit().globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.createMFAAuthenticator')).toHaveLength(1)
    expect(appwriteFake.used('admin')).toBe(false)
  })
})

const TOTP_BODY = { code: '123456' }
const INVALID_CODE = () => {
  throw Object.assign(new Error('invalid token'), { type: 'user_invalid_token', code: 401 })
}

describeAccountRoute('POST /api/auth/mfa/verify', () => import('../server/api/auth/mfa/verify.post'), {
  body: TOTP_BODY,
  globals: coreKit().globals,
})

describe('POST /api/auth/mfa/verify — der Code entscheidet, die Bremse zählt das eigene Konto', () => {
  const load = () => import('../server/api/auth/mfa/verify.post')

  it('richtiger Code: schaltet MFA am eigenen Konto an, Bremse für die eigene Id', async () => {
    appwriteFake.reply('session.account.createMFARecoveryCodes', () => ({ recoveryCodes: ['a'] }))
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'member', body: TOTP_BODY, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(kit.record.attempts).toEqual([{ scope: 'mfa', account: userIdOf('member') }])
    expect(appwriteFake.argsOf('session.account.updateMFA')).toEqual([{ mfa: true }])
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('falscher Code: 400, MFA bleibt aus', async () => {
    appwriteFake.reply('session.account.updateMFAAuthenticator', INVALID_CODE)
    const run = await probeRoute(load, { who: 'member', body: TOTP_BODY, globals: coreKit().globals })
    expect(run.status).toBe(400)
    expect(run.error?.data?.code).toBe('mfa_invalid_code')
    expect(appwriteFake.argsOf('session.account.updateMFA')).toEqual([])
  })
})

const DISABLE_BODY = { mode: 'totp', code: '123456' }

describeAccountRoute('POST /api/auth/mfa/disable', () => import('../server/api/auth/mfa/disable.post'), {
  body: DISABLE_BODY,
  globals: coreKit().globals,
})

describe('POST /api/auth/mfa/disable — nur mit gültigem zweiten Faktor', () => {
  const load = () => import('../server/api/auth/mfa/disable.post')

  it('richtiger Code: schaltet MFA am eigenen Konto ab, Bremse für die eigene Id', async () => {
    appwriteFake.reply('session.account.createMFAChallenge', () => ({ $id: 'ch-1' }))
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'stranger', body: DISABLE_BODY, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(kit.record.attempts).toEqual([{ scope: 'mfa', account: userIdOf('stranger') }])
    expect(appwriteFake.argsOf('session.account.updateMFA')).toEqual([{ mfa: false }])
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('falscher Code: 400, MFA bleibt an', async () => {
    appwriteFake.reply('session.account.createMFAChallenge', () => ({ $id: 'ch-1' }))
    appwriteFake.reply('session.account.updateMFAChallenge', INVALID_CODE)
    const run = await probeRoute(load, { who: 'stranger', body: DISABLE_BODY, globals: coreKit().globals })
    expect(run.status).toBe(400)
    expect(run.error?.data?.code).toBe('mfa_invalid_code')
    expect(appwriteFake.argsOf('session.account.updateMFA')).toEqual([])
  })
})

// ── Export und Löschung (DSGVO) ─────────────────────────────────────────────

function exportGlobals(asked: Array<{ userId: string, via: unknown }>) {
  return {
    exportUserCompletely: async (_event: unknown, userId: string, options: { via: unknown }) => {
      asked.push({ userId, via: options.via })
      return { user: { $id: userId } }
    },
  }
}

describeAccountRoute('GET /api/auth/export', () => import('../server/api/auth/export.get'), {
  globals: exportGlobals([]),
})

describe('GET /api/auth/export — exportiert nur das eigene Konto', () => {
  it('die Konto-Id kommt aus der Sitzung, eine Id in der Anfrage zählt nicht', async () => {
    const asked: Array<{ userId: string, via: unknown }> = []
    const run = await probeRoute(() => import('../server/api/auth/export.get'), {
      who: 'stranger',
      query: { userId: userIdOf('member') },
      globals: exportGlobals(asked),
    })
    expect(run.status).toBe(200)
    expect(asked).toEqual([{ userId: userIdOf('stranger'), via: 'session' }])
  })

  it('ohne Konto: kein Export', async () => {
    const asked: Array<{ userId: string, via: unknown }> = []
    const run = await probeRoute(() => import('../server/api/auth/export.get'), { who: 'guest', globals: exportGlobals(asked) })
    expect(run.status).toBe(401)
    expect(asked).toEqual([])
  })
})

function lastAdminRefusal() {
  return Object.assign(new Error('At least one admin must remain'), { status: 409, statusCode: 409, data: { code: 'last_admin' } })
}

function deleteGlobals(deleted: string[], overrides: Record<string, unknown> = {}) {
  return {
    ...coreKit().globals,
    requireRecentAuth,
    isActiveAdmin: () => false,
    assertNotLastAdmin: async () => {},
    deleteUserCompletely: async (_event: unknown, userId: string) => {
      deleted.push(userId)
      return { ok: true, results: [] }
    },
    ...overrides,
  }
}

describe('DELETE /api/auth/account — nur das eigene Konto, nur mit frischer Anmeldung', () => {
  const load = () => import('../server/api/auth/account.delete')

  it('ohne Konto: 401, nichts gelöscht', async () => {
    const deleted: string[] = []
    const run = await probeRoute(load, { who: 'guest', globals: deleteGlobals(deleted) })
    expect(run.status).toBe(401)
    expect(deleted).toEqual([])
  })

  for (const who of ['member', 'stranger'] as const) {
    it(`${who}, frisch angemeldet: löscht das EIGENE Konto`, async () => {
      appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell', $createdAt: minutesAgo(1) }))
      const deleted: string[] = []
      const run = await probeRoute(load, { who, body: { userId: userIdOf('owner') }, globals: deleteGlobals(deleted) })
      expect(run.status).toBe(200)
      expect(deleted).toEqual([userIdOf(who)])
    })
  }

  it('alte Sitzung (gestohlenes Cookie, offener Laptop): 403 reauth_required, nichts gelöscht, Cookie bleibt', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell', $createdAt: minutesAgo(60 * 24) }))
    const deleted: string[] = []
    const run = await probeRoute(load, { who: 'member', globals: deleteGlobals(deleted) })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('reauth_required')
    expect(deleted).toEqual([])
    expect(appwriteFake.cookiesCleared()).toBe(0)
  })

  it('letzter aktiver Admin: 409 last_admin VOR der frischen Anmeldung, nichts gelöscht, Cookie bleibt', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell', $createdAt: minutesAgo(60 * 24) }))
    const deleted: string[] = []
    const run = await probeRoute(load, {
      who: 'member',
      globals: deleteGlobals(deleted, { isActiveAdmin: () => true, assertNotLastAdmin: async () => { throw lastAdminRefusal() } }),
    })
    expect(run.status).toBe(409)
    expect(run.error?.data).toEqual({ code: 'last_admin' })
    expect(deleted).toEqual([])
    expect(appwriteFake.cookiesCleared()).toBe(0)
  })

  it('letzter Admin erst unter der Sperre erkannt: 409 geht unverändert hinaus, Cookie bleibt (nichts gesperrt)', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell', $createdAt: minutesAgo(1) }))
    const run = await probeRoute(load, {
      who: 'member',
      globals: deleteGlobals([], { deleteUserCompletely: async () => { throw lastAdminRefusal() } }),
    })
    expect(run.status).toBe(409)
    expect(run.error?.data).toEqual({ code: 'last_admin' })
    expect(appwriteFake.cookiesCleared()).toBe(0)
  })

  it('Gegenprobe: Admin mit einem zweiten Admin daneben löscht sich', async () => {
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-aktuell', $createdAt: minutesAgo(1) }))
    const deleted: string[] = []
    const run = await probeRoute(load, { who: 'member', globals: deleteGlobals(deleted, { isActiveAdmin: () => true }) })
    expect(run.status).toBe(200)
    expect(deleted).toEqual([userIdOf('member')])
    expect(appwriteFake.cookiesCleared()).toBe(1)
  })

  it('Sitzung nicht lesbar: gilt als nicht frisch (403), nichts gelöscht', async () => {
    appwriteFake.reply('session.account.getSession', () => {
      throw new Error('unreachable')
    })
    const deleted: string[] = []
    const run = await probeRoute(load, { who: 'member', globals: deleteGlobals(deleted) })
    expect(run.status).toBe(403)
    expect(deleted).toEqual([])
  })
})

// ── Ablage: eigenes Profilbild löschen ──────────────────────────────────────

describeAccountRoute('DELETE /api/storage/[bucket]/[fileId]', () => import('../server/api/storage/[bucket]/[fileId].delete'), {
  params: { bucket: AVATARS_BUCKET, fileId: 'f-1' },
  globals: coreKit().globals,
})

describe('DELETE /api/storage/[bucket]/[fileId] — nur der Profilbild-Bucket, nur mit den eigenen Rechten', () => {
  const load = () => import('../server/api/storage/[bucket]/[fileId].delete')

  it('Profilbild-Bucket: löscht über den Session-Klienten (Datei-Rechte des Kontos entscheiden), nie per Admin', async () => {
    const run = await probeRoute(load, { who: 'member', params: { bucket: AVATARS_BUCKET, fileId: 'f-1' }, globals: coreKit().globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.storage.deleteFile')).toEqual([{ bucketId: AVATARS_BUCKET, fileId: 'f-1' }])
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('ein anderer Bucket: 403, nichts gelöscht', async () => {
    const run = await probeRoute(load, { who: 'member', params: { bucket: 'gdpr-exports', fileId: 'f-1' }, globals: coreKit().globals })
    expect(run.status).toBe(403)
    expect(appwriteFake.calls).toEqual([])
  })

  it('fremde Datei (Appwrite verweigert dem Konto das Löschen): kein Erfolg', async () => {
    appwriteFake.reply('session.storage.deleteFile', () => {
      throw Object.assign(new Error('unauthorized'), { code: 401, type: 'user_unauthorized' })
    })
    const run = await probeRoute(load, {
      who: 'stranger',
      params: { bucket: AVATARS_BUCKET, fileId: 'f-fremd' },
      globals: { ...coreKit().globals, toH3Error: (error: { code?: number }) => Object.assign(new Error('denied'), { status: error.code }) },
    })
    expect(run.status).toBe(401)
  })
})
