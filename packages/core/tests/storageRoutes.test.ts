import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { fileBelongsToUser } from '../shared/avatarOwnership'

/**
 * SEC-001 — die beiden Storage-Routen im Original, gestellt sind nur die
 * Nitro-Auto-Imports und die zwei Appwrite-Clients.
 *
 * GET: ausgeliefert wird nur, was als Bild gespeichert ist UND am Inhalt ein
 * Bild ist; `Content-Type` ist der erkannte Typ; jede Antwort trägt die
 * Schutz-Kopfzeilen. POST: geschrieben wird mit dem ADMIN-Client, erst nach
 * allen Prüfungen, mit festem Dateinamen und den Rechten des Besitzers.
 * Jeder positive Fall hat seine Gegenprobe.
 */

// ── Fake-Appwrite ──────────────────────────────────────────────────────────

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const HTML = Buffer.from('<!doctype html><p>kein Bild</p>')
const WEBP_PREVIEW = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer

let storedMime: string
let storedContent: Buffer
let previewWorks: boolean

function makeStorage() {
  return {
    getFile: vi.fn(async () => ({ $id: 'f1', mimeType: storedMime })),
    getFileView: vi.fn(async () => storedContent.buffer.slice(storedContent.byteOffset, storedContent.byteOffset + storedContent.byteLength)),
    getFilePreview: vi.fn(async () => {
      if (!previewWorks) throw Object.assign(new Error('no imagick'), { code: 500 })
      return WEBP_PREVIEW
    }),
    createFile: vi.fn(async (params: Record<string, unknown>) => ({ $id: 'new-file', ...params })),
  }
}
let sessionStorage = makeStorage()
let adminStorage = makeStorage()

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ storage: sessionStorage }),
  createAdminClient: () => ({ storage: adminStorage }),
}))

// ── Nitro-Auto-Imports ─────────────────────────────────────────────────────

interface FakeEvent {
  context: { user?: { $id: string } }
  params: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
  form?: { name: string, filename?: string, type?: string, data: Buffer }[]
}

class HttpError extends Error {
  status: number
  constructor(init: { status: number, statusText: string }) {
    super(init.statusText)
    this.status = init.status
  }
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (init: { status: number, statusText: string }) => new HttpError(init))
vi.stubGlobal('toH3Error', (error: unknown) => error instanceof HttpError ? error : new HttpError({ status: 404, statusText: 'File not found' }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteAvatarsBucket: 'avatars' } }))
vi.stubGlobal('getRouterParam', (event: FakeEvent, name: string) => event.params[name])
vi.stubGlobal('getQuery', (event: FakeEvent) => event.query)
vi.stubGlobal('setHeader', (event: FakeEvent, name: string, value: string) => {
  event.headers[name.toLowerCase()] = value
})
vi.stubGlobal('readMultipartFormData', async (event: FakeEvent) => event.form)

type Handler = (event: H3Event) => Promise<unknown>
const getRoute = (await import('../server/api/storage/[bucket]/[fileId].get')).default as unknown as Handler
const postRoute = (await import('../server/api/storage/[bucket]/index.post')).default as unknown as Handler

function makeEvent(init: Partial<FakeEvent> = {}): FakeEvent {
  return {
    context: {},
    params: { bucket: 'avatars', fileId: 'f1' },
    query: {},
    headers: {},
    ...init,
  }
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise
    return 200
  }
  catch (error) {
    if (error instanceof HttpError) return error.status
    throw error
  }
}

beforeEach(() => {
  sessionStorage = makeStorage()
  adminStorage = makeStorage()
  storedMime = 'image/png'
  storedContent = PNG
  previewWorks = false
})

// ── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/storage/:bucket/:fileId', () => {
  it('echtes PNG: Inhalt zurück, Content-Type aus dem Inhalt, beide Schutz-Kopfzeilen', async () => {
    const event = makeEvent()
    const body = await getRoute(event as unknown as H3Event)
    expect(Buffer.isBuffer(body)).toBe(true)
    expect((body as Buffer).equals(PNG)).toBe(true)
    expect(event.headers['content-type']).toBe('image/png')
    expect(event.headers['x-content-type-options']).toBe('nosniff')
    expect(event.headers['content-security-policy']).toContain('sandbox')
  })

  it('Gegenprobe: gespeicherter Typ text/html → 404, getFileView wird nicht gerufen', async () => {
    storedMime = 'text/html'
    const event = makeEvent()
    expect(await statusOf(getRoute(event as unknown as H3Event))).toBe(404)
    expect(sessionStorage.getFileView).not.toHaveBeenCalled()
    // Auch die Fehlerantwort trägt die Schutz-Kopfzeilen
    expect(event.headers['x-content-type-options']).toBe('nosniff')
    expect(event.headers['content-security-policy']).toContain('sandbox')
  })

  it('Gegenprobe: gespeichert als image/png, Inhalt aber HTML → 404', async () => {
    storedContent = HTML
    const event = makeEvent()
    expect(await statusOf(getRoute(event as unknown as H3Event))).toBe(404)
    expect(sessionStorage.getFileView).toHaveBeenCalledOnce()
    expect(event.headers['content-type']).toBeUndefined()
  })

  it('mit ?w=64 und funktionierender Preview → image/webp', async () => {
    previewWorks = true
    const event = makeEvent({ query: { w: '64' } })
    const body = await getRoute(event as unknown as H3Event)
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(event.headers['content-type']).toBe('image/webp')
    expect(sessionStorage.getFilePreview).toHaveBeenCalledOnce()
    expect(sessionStorage.getFileView).not.toHaveBeenCalled()
  })

  it('Gegenprobe: ?w=64, aber gespeicherter Typ text/html → 404 ohne Preview-Aufruf', async () => {
    previewWorks = true
    storedMime = 'text/html'
    const event = makeEvent({ query: { w: '64' } })
    expect(await statusOf(getRoute(event as unknown as H3Event))).toBe(404)
    expect(sessionStorage.getFilePreview).not.toHaveBeenCalled()
    expect(sessionStorage.getFileView).not.toHaveBeenCalled()
  })

  it('Preview nicht verfügbar → Original mit erkanntem Typ', async () => {
    const event = makeEvent({ query: { w: '64' } })
    await getRoute(event as unknown as H3Event)
    expect(sessionStorage.getFilePreview).toHaveBeenCalledOnce()
    expect(event.headers['content-type']).toBe('image/png')
  })

  it('fremder Bucket → 403, Appwrite wird nicht gefragt', async () => {
    const event = makeEvent({ params: { bucket: 'gdpr-exports', fileId: 'f1' } })
    expect(await statusOf(getRoute(event as unknown as H3Event))).toBe(403)
    expect(sessionStorage.getFile).not.toHaveBeenCalled()
    expect(event.headers['x-content-type-options']).toBe('nosniff')
  })
})

// ── POST ───────────────────────────────────────────────────────────────────

describe('POST /api/storage/:bucket', () => {
  const user = { $id: 'user-1' }

  it('gültiges PNG: createFile über den ADMIN-Client, Name avatar.png, Rechte des Besitzers', async () => {
    const event = makeEvent({
      context: { user },
      params: { bucket: 'avatars' },
      form: [{ name: 'file', filename: 'mein foto', type: 'image/png', data: PNG }],
    })
    const result = await postRoute(event as unknown as H3Event) as { $id: string }
    expect(result.$id).toBe('new-file')
    expect(adminStorage.createFile).toHaveBeenCalledOnce()
    expect(sessionStorage.createFile).not.toHaveBeenCalled()

    const params = adminStorage.createFile.mock.calls[0]![0] as { bucketId: string, file: { filename: string }, permissions: string[] }
    expect(params.bucketId).toBe('avatars')
    expect(params.file.filename).toBe('avatar.png')
    expect([...params.permissions].sort()).toEqual([
      'delete("user:user-1")',
      'read("any")',
      'update("user:user-1")',
    ])
    // Kopplung zu BE-001: die Kontolöschung findet die Dateien eines Kontos über
    // genau diese Rechte (`deleteAvatarFilesOf`). Vergibt die Route sie nicht
    // mehr, bleiben Bilder nach einer Löschung liegen — dann wird dieser Test rot.
    expect(fileBelongsToUser(params.permissions, 'user-1')).toBe(true)
    expect(fileBelongsToUser(params.permissions, 'user-2')).toBe(false)
  })

  it('Gegenprobe: HTML mit deklariertem Typ image/png → 415, kein createFile', async () => {
    const event = makeEvent({
      context: { user },
      params: { bucket: 'avatars' },
      form: [{ name: 'file', filename: 'x.png', type: 'image/png', data: HTML }],
    })
    expect(await statusOf(postRoute(event as unknown as H3Event))).toBe(415)
    expect(adminStorage.createFile).not.toHaveBeenCalled()
    expect(sessionStorage.createFile).not.toHaveBeenCalled()
  })

  it('Gegenprobe: deklarierter Typ image/svg+xml → 415, kein createFile', async () => {
    const event = makeEvent({
      context: { user },
      params: { bucket: 'avatars' },
      form: [{ name: 'file', filename: 'x.svg', type: 'image/svg+xml', data: PNG }],
    })
    expect(await statusOf(postRoute(event as unknown as H3Event))).toBe(415)
    expect(adminStorage.createFile).not.toHaveBeenCalled()
  })

  it('Gegenprobe: ohne Anmeldung → 401, kein createFile', async () => {
    const event = makeEvent({
      params: { bucket: 'avatars' },
      form: [{ name: 'file', filename: 'x.png', type: 'image/png', data: PNG }],
    })
    expect(await statusOf(postRoute(event as unknown as H3Event))).toBe(401)
    expect(adminStorage.createFile).not.toHaveBeenCalled()
    expect(sessionStorage.createFile).not.toHaveBeenCalled()
  })

  it('Gegenprobe: fremder Bucket → 403, kein createFile', async () => {
    const event = makeEvent({
      context: { user },
      params: { bucket: 'gdpr-exports' },
      form: [{ name: 'file', filename: 'x.png', type: 'image/png', data: PNG }],
    })
    expect(await statusOf(postRoute(event as unknown as H3Event))).toBe(403)
    expect(adminStorage.createFile).not.toHaveBeenCalled()
  })
})
