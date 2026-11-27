import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'
import { isAppwriteUserMissing } from '../../core/server/utils/userDataOrchestration'

/**
 * DIE LÖSCHUNG EINES BRANDINGS HÖRT NICHT MEHR „TROTZDEM" AUF (SEC-026,
 * Teil 2 und Nachtrag).
 *
 * Zwei Stellen meldeten Erfolg, wo keiner war:
 *
 *  1. DIE KASKADE. `runBrandProfileCascades` fing den Fehler eines Mitläufers
 *     (heute `market`) ab, loggte und gab `-1` zurück; Löschroute und
 *     GDPR-Contributor löschten danach das PROFIL. Die Zeilen des anderen
 *     Layers hängen aber an genau diesem Profil — ohne Kopf findet sie keine
 *     Route und kein zweiter Lauf mehr. Jetzt bleibt das Profil stehen, die
 *     Route antwortet 502 `profile_delete_incomplete`, der Contributor wirft.
 *  2. DIE ADRESSE. `accountEmailLower` las das Konto mit einem `catch`, das
 *     JEDEN Fehler zu „Konto weg" machte — die Einladungen an diese Adresse
 *     blieben dann still unangetastet. Jetzt ist nur das 404 „weg".
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, FakeRow[]>
let deletedRows: string[]
let getUser: () => Promise<unknown>
const routerParams: Record<string, string> = {}

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

/** Tabellen, deren LESEN scheitert (500) — für „ein Lesefehler bricht ab". */
let brokenReads: Set<string>
/** Tabellen, deren SCHREIBEN scheitert (500). */
let brokenWrites: Set<string>

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (brokenReads.has(tableId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const filters = equalFilters(queries)
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const found = (tables[tableId] ?? []).find(row => row.$id === rowId)
    if (!found) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return found
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const rows = tables[tableId] ?? []
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
    deletedRows.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (brokenWrites.has(tableId)) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const found = (tables[tableId] ?? []).find(row => row.$id === rowId)
    if (!found) throw new AppwriteException('Row not found', 404, 'row_not_found')
    Object.assign(found, data)
    return found
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB,
  storage: { deleteFile: async () => {} },
  users: { get: async () => getUser() },
}))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('isAppwriteUserMissing', isAppwriteUserMissing)
vi.stubGlobal('BRAND_INVITES_TABLE', 'brand_invites')
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => routerParams[name] ?? '')
let recentAuth = true
vi.stubGlobal('requireRecentAuth', async () => {
  if (!recentAuth) throw Object.assign(new Error('Recent sign-in required'), { status: 403, data: { code: 'reauth_required' } })
})

const { registerBrandProfileCascade } = await import('../server/utils/brandProfileCascade')
const { brandDeleteUserData, brandExportUserData } = await import('../server/utils/brandUserData')
const deleteRoute = (await import('../server/api/brand/profiles/[id]/index.delete')).default as unknown as
  (event: H3Event) => Promise<unknown>
const purgeRoute = (await import('../server/api/brand/profiles/[id]/purge.delete')).default as unknown as
  (event: H3Event) => Promise<unknown>
const restoreRoute = (await import('../server/api/brand/profiles/[id]/restore.post')).default as unknown as
  (event: H3Event) => Promise<unknown>

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown> = {}): FakeRow =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', ...extra })

let cascadeError: unknown
registerBrandProfileCascade({
  id: 'market',
  removeProfileData: async () => {
    if (cascadeError) throw cascadeError
    return 2
  },
})

beforeEach(() => {
  tables = {
    brand_profiles: [row('p1', { ownerType: 'user', ownerId: 'u1' })],
    brand_steps: [row('s1', { profileId: 'p1' })],
    brand_invites: [row('i1', { emailLower: 'a@example.com' })],
  }
  deletedRows = []
  brokenReads = new Set()
  brokenWrites = new Set()
  cascadeError = undefined
  getUser = async () => ({ $id: 'u1', email: 'A@example.com', emailVerification: true })
  routerParams.id = 'p1'
  recentAuth = true
  tablesDB.updateRow.mockClear()
})

describe('brandDeleteUserData — die Kaskade', () => {
  it('Normalfall: Kinder, Mitläufer und Profil sind weg', async () => {
    const result = await brandDeleteUserData(event, 'u1')
    expect(deletedRows).toContain('brand_profiles/p1')
    expect(result.deleted).toBe(4) // Baustein + 2 Mitläufer-Zeilen + Profil
  })

  it('ein scheiternder Mitläufer ⇒ Abbruch, das PROFIL bleibt stehen', async () => {
    cascadeError = new Error('market down')
    await expect(brandDeleteUserData(event, 'u1')).rejects.toThrow()
    expect(deletedRows).not.toContain('brand_profiles/p1')
    expect(tables.brand_profiles).toHaveLength(1)
  })
})

describe('brandDeleteUserData — die Adresse', () => {
  it('users.get mit 500 ⇒ Abbruch statt „Konto weg"', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(brandDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('users.get mit 404 ⇒ Konto weg, Löschung endet erfolgreich ohne Einladungen', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    await expect(brandDeleteUserData(event, 'u1')).resolves.toMatchObject({ anonymized: 0 })
  })

  it('Normalfall: die Einladung an die Adresse wird anonymisiert', async () => {
    await expect(brandDeleteUserData(event, 'u1')).resolves.toMatchObject({ anonymized: 1 })
  })
})

/**
 * DER PAPIERKORB (WH1): „Marke löschen" versteckt, die Kaskade läuft erst
 * beim endgültigen Löschen (`purge.delete.ts` und der Lauf nach 90 Tagen).
 */
describe('DELETE /api/brand/profiles/:id — in den Papierkorb', () => {
  it('setzt erasedAt, löscht NICHTS am Inhalt', async () => {
    await expect(deleteRoute(event)).resolves.toMatchObject({ trashed: true })
    expect(tables.brand_profiles![0]!.erasedAt).toEqual(expect.any(String))
    expect(deletedRows).toEqual([])
  })

  it('ein zweiter Aufruf verschiebt den Zeitpunkt nicht', async () => {
    tables.brand_profiles![0]!.erasedAt = '2026-11-01T00:00:00.000Z'
    await expect(deleteRoute(event)).resolves.toMatchObject({ erasedAt: '2026-11-01T00:00:00.000Z' })
    expect(tables.brand_profiles![0]!.erasedAt).toBe('2026-11-01T00:00:00.000Z')
  })

  it('geteilte Links gehen sofort, die Veröffentlichung wird zurückgezogen', async () => {
    tables.brand_shares = [row('sh1', { profileId: 'p1' })]
    tables.brand_publications = [row('p1', { status: 'published', snapshot: 'S', pendingSnapshot: '' })]
    await deleteRoute(event)
    expect(deletedRows).toEqual(['brand_shares/sh1'])
    expect(tables.brand_publications[0]).toMatchObject({ status: 'withdrawn', snapshot: '' })
  })
})

describe('DELETE /api/brand/profiles/:id/purge — die Kaskade', () => {
  beforeEach(() => {
    tables.brand_profiles![0]!.erasedAt = '2026-11-20T00:00:00.000Z'
  })

  it('Normalfall: das Profil ist weg', async () => {
    await purgeRoute(event)
    expect(deletedRows).toContain('brand_profiles/p1')
  })

  it('eine lebende Marke ⇒ 404, nichts gelöscht', async () => {
    tables.brand_profiles![0]!.erasedAt = null
    await expect(purgeRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(deletedRows).toEqual([])
  })

  it('ohne frische Anmeldung ⇒ 403 reauth_required, nichts gelöscht', async () => {
    recentAuth = false
    await expect(purgeRoute(event)).rejects.toMatchObject({ status: 403 })
    expect(deletedRows).toEqual([])
  })

  it('ein scheiternder Mitläufer ⇒ 502 profile_delete_incomplete, das Profil bleibt', async () => {
    cascadeError = new Error('market down')
    await expect(purgeRoute(event)).rejects.toMatchObject({
      status: 502,
      data: { code: 'profile_delete_incomplete' },
    })
    expect(deletedRows).not.toContain('brand_profiles/p1')
    cascadeError = undefined
    await purgeRoute(event)
    expect(deletedRows).toContain('brand_profiles/p1')
  })
})

describe('brandDeleteUserData — Marken im Papierkorb', () => {
  it('die Kontolöschung nimmt auch Marken im Papierkorb sofort mit', async () => {
    tables.brand_profiles![0]!.erasedAt = '2026-11-20T00:00:00.000Z'
    await brandDeleteUserData(event, 'u1')
    expect(deletedRows).toContain('brand_profiles/p1')
  })

  it('die Auskunft nennt Marken im Papierkorb', async () => {
    tables.brand_profiles![0]!.erasedAt = '2026-11-20T00:00:00.000Z'
    const exported = JSON.stringify(await brandExportUserData(event, 'u1'))
    expect(exported).toContain('p1')
  })
})

/**
 * PRÜFERGEBNISSE, KORREKTUR-MELDUNGEN, WARTELISTE UND EIGENE MELDUNGEN
 * (SEC-015, Davids Entscheidung 2026-11-12: „Export und Löschung nehmen auch
 * Prüfergebnisse, Korrektur-Meldungen und die Warteliste mit.").
 *
 * Ein Check wird beim Löschen nicht sofort entfernt, sondern als gelöscht
 * markiert (`erasedAt`): ab da sieht ihn niemand mehr, nach 90 Tagen räumt ein
 * Lauf ihn ab. Die Warteliste-Zeile ist eine Nachricht dieses Menschen und
 * geht sofort; Korrekturvorschläge und Meldungen sind die Arbeitsliste des
 * Betreibers und verlieren nur die Adresse.
 */
describe('brandExportUserData / brandDeleteUserData — Checks, Korrekturen, Warteliste', () => {
  beforeEach(() => {
    tables.brand_checks = [
      row('c-doc', { userId: 'u1', profileId: 'p1', urlKey: 'doc:p1', source: 'document', ipHash: 'IPHASH', textHash: 'TH', host: 'Kailua', url: '' }),
      row('c-web', { userId: 'u1', profileId: 'p1', urlKey: 'kailua.coffee', source: 'website', ipHash: 'IPHASH', textHash: 'TH', host: 'kailua.coffee', url: 'https://kailua.coffee/' }),
      row('c-market', { userId: 'u1', profileId: '', urlKey: 'rival.example', source: 'website', ipHash: 'IPHASH', textHash: 'TH', host: 'rival.example', url: 'https://rival.example/' }),
      row('c-other', { userId: 'u2', profileId: 'p2', urlKey: 'other.example', source: 'website', ipHash: 'X', textHash: 'X' }),
    ]
    tables.brand_waitlist = [
      row('w1', { emailLower: 'a@example.com', email: 'A@example.com', name: 'A', company: 'K', website: 'kailua.coffee', note: '', status: 'confirmed', tokenHash: 'SECRET' }),
      row('w2', { emailLower: 'b@example.com', email: 'b@example.com', name: 'B', company: '', website: '', note: '', status: 'pending', tokenHash: 'SECRET2' }),
    ]
    tables.brand_check_corrections = [
      row('k1', { checkId: 'c-web', reporterEmail: 'a@example.com', reason: 'falsch', proposed: 'food', ipHash: 'IPHASH', status: 'open' }),
      row('k2', { checkId: 'c-web', reporterEmail: 'b@example.com', reason: 'auch', proposed: 'food', ipHash: 'Y', status: 'open' }),
    ]
    tables.brand_publication_reports = [
      row('r1', { publicationId: 'pub-x', reporterEmail: 'a@example.com', reason: 'spam', status: 'open', ipHash: 'IPHASH' }),
      row('r2', { publicationId: 'pub-x', reporterEmail: 'b@example.com', reason: 'spam', status: 'open', ipHash: 'Y' }),
    ]
  })

  it('EXPORT: vier neue Abschnitte, ohne ipHash, textHash und tokenHash', async () => {
    const exported = await brandExportUserData(event, 'u1') as Record<string, unknown[]>

    expect((exported.checks as { id: string }[]).map(c => c.id).sort()).toEqual(['c-doc', 'c-market', 'c-web'])
    expect(exported.checkCorrections).toHaveLength(1)
    expect(exported.waitlist).toHaveLength(1)
    expect(exported.publicationReportsFiled).toHaveLength(1)

    const text = JSON.stringify({
      checks: exported.checks,
      checkCorrections: exported.checkCorrections,
      waitlist: exported.waitlist,
      publicationReportsFiled: exported.publicationReportsFiled,
    })
    expect(text).not.toContain('IPHASH')
    expect(text).not.toContain('"TH"')
    expect(text).not.toContain('SECRET')
    // GEGENPROBE: der fremde Check und die fremden Meldungen fehlen.
    expect(text).not.toContain('c-other')
    expect(text).not.toContain('b@example.com')
  })

  it('UNBESTÄTIGTE Adresse ist kein Schlüssel: Export ohne Adress-Abschnitte, Löschung lässt sie stehen', async () => {
    getUser = async () => ({ $id: 'u1', email: 'A@example.com', emailVerification: false })
    const exported = await brandExportUserData(event, 'u1') as Record<string, unknown[]>
    expect(exported.waitlist).toHaveLength(0)
    expect(exported.checkCorrections).toHaveLength(0)
    expect(exported.publicationReportsFiled).toHaveLength(0)
    // Was über die Konto-Id gefunden wird, bleibt im Export.
    expect(exported.checks).toHaveLength(3)

    await brandDeleteUserData(event, 'u1')
    expect(tables.brand_waitlist!.some(w => w.$id === 'w1')).toBe(true)
    expect(tables.brand_check_corrections!.find(k => k.$id === 'k1')?.reporterEmail).toBe('a@example.com')
  })

  it('LÖSCHEN: Checks markiert, Warteliste weg, Adressen geleert — Fremdes unberührt', async () => {
    const result = await brandDeleteUserData(event, 'u1')

    for (const id of ['c-doc', 'c-web', 'c-market']) {
      expect(tables.brand_checks!.find(c => c.$id === id)?.erasedAt).toEqual(expect.any(String))
    }
    expect(tables.brand_checks!.find(c => c.$id === 'c-other')?.erasedAt).toBeUndefined()

    expect(tables.brand_waitlist!.map(w => w.$id)).toEqual(['w2'])
    expect(tables.brand_check_corrections!.find(k => k.$id === 'k1')?.reporterEmail).toBe('')
    expect(tables.brand_check_corrections!.find(k => k.$id === 'k2')?.reporterEmail).toBe('b@example.com')
    expect(tables.brand_publication_reports!.find(r => r.$id === 'r1')?.reporterEmail).toBe('')
    expect(tables.brand_publication_reports!.find(r => r.$id === 'r2')?.reporterEmail).toBe('b@example.com')

    // Einladung (1) + drei Checks + Korrektur + Meldung
    expect(result.anonymized).toBe(6)
  })

  it('ein zweiter Lauf ändert nichts und verschiebt `erasedAt` nicht', async () => {
    await brandDeleteUserData(event, 'u1')
    const before = tables.brand_checks!.map(c => c.erasedAt)
    // Das Profil ist nach dem ersten Lauf weg; die Checks tragen den Stempel.
    tablesDB.updateRow.mockClear()

    const second = await brandDeleteUserData(event, 'u1')
    expect(second).toEqual({ deleted: 0, anonymized: 0 })
    expect(tables.brand_checks!.map(c => c.erasedAt)).toEqual(before)
  })

  it('ein Lesefehler auf `brand_checks` lässt die Löschung scheitern', async () => {
    brokenReads.add('brand_checks')
    await expect(brandDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
    // Das Profil bleibt: ohne es fände ein zweiter Lauf die Marken-Checks nicht mehr.
    expect(deletedRows).not.toContain('brand_profiles/p1')
  })
})

describe('DELETE /api/brand/profiles/:id — die Checks der Marke', () => {
  beforeEach(() => {
    tables.brand_checks = [
      row('c-doc', { userId: '', profileId: '', urlKey: 'doc:p1', source: 'document' }),
      row('c-web', { userId: '', profileId: 'p1', urlKey: 'kailua.coffee' }),
      row('c-guest', { userId: '', profileId: '', urlKey: 'kailua.coffee' }),
      // Von einem FRÜHEREN Löschen versteckt — das Zurückholen lässt sie liegen.
      row('c-old', { userId: '', profileId: 'p1', urlKey: 'old.example', erasedAt: '2026-10-01T00:00:00.000+00:00' }),
    ]
  })

  it('markiert die Checks über profileId UND den Dokument-Schlüssel, mit dem Zeitpunkt der Marke', async () => {
    await deleteRoute(event)
    const at = tables.brand_profiles![0]!.erasedAt
    expect(tables.brand_checks!.find(c => c.$id === 'c-doc')?.erasedAt).toBe(at)
    expect(tables.brand_checks!.find(c => c.$id === 'c-web')?.erasedAt).toBe(at)
    expect(tables.brand_checks!.find(c => c.$id === 'c-guest')?.erasedAt).toBeUndefined()
  })

  it('scheitert das Markieren ⇒ 502 profile_delete_incomplete, die Marke bleibt sichtbar', async () => {
    brokenWrites.add('brand_checks')
    await expect(deleteRoute(event)).rejects.toMatchObject({
      status: 502,
      data: { code: 'profile_delete_incomplete' },
    })
    expect(tables.brand_profiles![0]!.erasedAt).toBeUndefined()

    brokenWrites.clear()
    await deleteRoute(event)
    expect(tables.brand_profiles![0]!.erasedAt).toEqual(expect.any(String))
  })

  it('Zurückholen zeigt genau die Checks wieder, die DIESES Löschen versteckt hat', async () => {
    await deleteRoute(event)
    // Appwrite schreibt `+00:00`, wo `Z` geschickt wurde — verglichen wird der Zeitpunkt.
    const at = String(tables.brand_profiles![0]!.erasedAt).replace('Z', '+00:00')
    tables.brand_profiles![0]!.erasedAt = at
    for (const check of tables.brand_checks!) if (check.erasedAt && check.$id !== 'c-old') check.erasedAt = at
    await expect(restoreRoute(event)).resolves.toEqual({ restored: true })
    expect(tables.brand_profiles![0]!.erasedAt).toBeNull()
    expect(tables.brand_checks!.find(c => c.$id === 'c-doc')?.erasedAt).toBeNull()
    expect(tables.brand_checks!.find(c => c.$id === 'c-web')?.erasedAt).toBeNull()
    expect(tables.brand_checks!.find(c => c.$id === 'c-old')?.erasedAt).toBe('2026-10-01T00:00:00.000+00:00')
  })

  it('Zurückholen nach 90 Tagen ⇒ 409 trash_expired, nichts geändert', async () => {
    tables.brand_profiles![0]!.erasedAt = '2020-01-01T00:00:00.000Z'
    await expect(restoreRoute(event)).rejects.toMatchObject({ status: 409, data: { code: 'trash_expired' } })
    expect(tables.brand_profiles![0]!.erasedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('Zurückholen einer lebenden Marke ⇒ 404', async () => {
    await expect(restoreRoute(event)).rejects.toMatchObject({ status: 404 })
  })
})
