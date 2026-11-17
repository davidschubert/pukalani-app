import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeRoleGateToDoor,
  probeRoute,
  resetCommunityWorld,
  type Who,
} from '../../core/tests/support/participationHarness'

/**
 * AUSLIEFERUNG DER TICKET-ANHÄNGE (SEC-001, OPS-009).
 *
 * Zwei Fragen an die ECHTE Route:
 *  1. Wer kommt durch? `tickets.manage` ist ein Instanz-Recht (`requirePermission`,
 *     globale Labels) — im Pool kommt nur der Betreiber durch.
 *  2. Was geht hinaus? Der gespeicherte Typ geht nie durch
 *     (`core/shared/fileDelivery.ts`): inline nur ein echtes Bild mit dem
 *     erkannten Typ, alles andere als Download; die Schutz-Kopfzeilen stehen
 *     auf JEDER Antwort, auch auf der Ablehnung.
 */

const load = () => import('../server/api/tickets/files/[fileId].get')

const runtimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })

const INSTANCE_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

describeRoleGateToDoor('GET /api/tickets/files/:fileId', load, INSTANCE_ONLY, {
  params: { fileId: 'f-1' },
  globals: { useRuntimeConfig: runtimeConfig },
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52])
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>')

/** Führt die Route mit einer Datei aus und gibt die gesetzten Kopfzeilen zurück. */
async function deliver(file: { mimeType: string, name: string, bytes: Buffer }, who: Who = 'operator') {
  const headers: Record<string, string> = {}
  const admin = {
    tablesDB: {
      listRows: async () => ({ total: 1, rows: [{ $id: 'r-1', fileId: 'f-1', mimeType: file.mimeType, name: file.name }] }),
    },
    storage: {
      getFileView: async () => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength),
    },
  }
  const run = await probeRoute(load, {
    who,
    params: { fileId: 'f-1' },
    globals: {
      useRuntimeConfig: runtimeConfig,
      createAdminClient: () => admin,
      setHeader: (_event: unknown, name: string, value: string) => { headers[name.toLowerCase()] = value },
    },
  })
  return { run, headers }
}

function expectProtectionHeaders(headers: Record<string, string>) {
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['content-security-policy']).toBe('default-src \'none\'; sandbox')
}

describe('GET /api/tickets/files/:fileId — Typ und Darstellung', () => {
  it('gespeicherter Typ text/html ⇒ Download ohne text/html', async () => {
    const { run, headers } = await deliver({ mimeType: 'text/html', name: 'a.html', bytes: HTML })
    expect(run.status).toBe(200)
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(headers['content-disposition']).toMatch(/^attachment;/)
    expect(Object.values(headers).join(' ')).not.toContain('text/html')
    expectProtectionHeaders(headers)
  })

  it('echtes PNG ⇒ inline image/png', async () => {
    const { run, headers } = await deliver({ mimeType: 'image/png', name: 'screenshot.png', bytes: PNG })
    expect(run.status).toBe(200)
    expect(headers['content-type']).toBe('image/png')
    expect(headers['content-disposition']).toMatch(/^inline;/)
    expectProtectionHeaders(headers)
  })

  it('Typ image/png mit HTML-Inhalt ⇒ Download', async () => {
    const { headers } = await deliver({ mimeType: 'image/png', name: 'a.png', bytes: HTML })
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(headers['content-disposition']).toMatch(/^attachment;/)
    expectProtectionHeaders(headers)
  })

  it('SVG geht nie inline', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
    const { headers } = await deliver({ mimeType: 'image/svg+xml', name: 'a.svg', bytes: svg })
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(headers['content-disposition']).toMatch(/^attachment;/)
  })

  it('auch die Ablehnung trägt die Schutz-Kopfzeilen', async () => {
    const { run, headers } = await deliver({ mimeType: 'image/png', name: 'a.png', bytes: PNG }, 'member')
    expect(run.status).toBe(403)
    expectProtectionHeaders(headers)
    expect(headers['content-type']).toBeUndefined()
  })
})
