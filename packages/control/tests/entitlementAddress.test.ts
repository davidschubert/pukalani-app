import { generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DIE ADRESSE DES ENTITLEMENT-DOKUMENTS ZIEHT UM (WL1 c, 2026-11-17).
 *
 * Neu: `/api/control/entitlements/<projectId>` (unter dem Präfix des Control
 * Plane, sein Not-Aus erreicht sie). Die alte Adresse
 * `/api/platform/entitlements/<projectId>` antwortet weiter, bis keine Site
 * sie mehr abruft. Geprüft wird an den geladenen Routen:
 *  - beide Adressen liefern DASSELBE Dokument (ein Rumpf, ein
 *    Zwischenspeicher),
 *  - die Signatur stimmt und der Inhalt nennt genau die aktiven Produkte,
 *  - die Ablehnungen der neuen Adresse sind die der alten.
 */

type Handler = (event: { projectId: string }) => Promise<string>

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const PRIVATE = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')

let reads: string[]
let config: { entitlementsPrivateKey: string, entitlementsKid: string, public: { appwriteDatabaseId: string } }

beforeEach(() => {
  reads = []
  config = { entitlementsPrivateKey: PRIVATE, entitlementsKid: 'k-test', public: { appwriteDatabaseId: 'db' } }
  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('getRouterParam', (event: { projectId: string }) => event.projectId)
  vi.stubGlobal('setResponseHeader', () => {})
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('createMicrocache', () => {
    const store = new Map<string, string>()
    return { get: (key: string) => store.get(key), set: (key: string, value: string) => { store.set(key, value) } }
  })
  vi.stubGlobal('createAdminClient', () => ({
    tablesDB: {
      listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
        reads.push(tableId)
        const known = queries.some(query => query.includes('probe-site'))
        if (tableId === 'websites') return { rows: known ? [{ projectId: 'probe-site', status: 'active' }] : [] }
        return { rows: [{ productKey: 'posts' }, { productKey: 'comments' }] }
      },
    },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const load = async (path: string) => (await import(path)).default as Handler
const NEW = '../server/api/control/entitlements/[projectId].get'
const OLD = '../server/api/platform/entitlements/[projectId].get'

describe('Entitlement-Dokument: neue und alte Adresse', () => {
  it('beide liefern dasselbe signierte Dokument — einmal gelesen, einmal signiert', async () => {
    const fresh = await (await load(NEW))({ projectId: 'probe-site' })
    const again = await (await load(OLD))({ projectId: 'probe-site' })
    expect(again).toBe(fresh)
    expect(reads).toHaveLength(2)

    const [segment, signature] = fresh.split('.') as [string, string]
    expect(verify(null, Buffer.from(segment, 'utf8'), publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>
    expect(payload).toMatchObject({ v: 1, kid: 'k-test', siteProjectId: 'probe-site', products: ['comments', 'posts'], suspended: false })
  })

  it.each([
    ['unlesbare Projekt-Kennung', 'Nicht/Erlaubt', 400],
    ['unbekannte Site', 'gibt-es-nicht', 404],
  ])('%s ⇒ %s an BEIDEN Adressen', async (_name, projectId, status) => {
    await expect((await load(NEW))({ projectId })).rejects.toMatchObject({ status })
    await expect((await load(OLD))({ projectId })).rejects.toMatchObject({ status })
  })

  it('ohne Signier-Schlüssel ⇒ 503 an beiden Adressen, nichts gelesen', async () => {
    config.entitlementsPrivateKey = ''
    await expect((await load(NEW))({ projectId: 'probe-site' })).rejects.toMatchObject({ status: 503 })
    await expect((await load(OLD))({ projectId: 'probe-site' })).rejects.toMatchObject({ status: 503 })
    expect(reads).toEqual([])
  })
})
