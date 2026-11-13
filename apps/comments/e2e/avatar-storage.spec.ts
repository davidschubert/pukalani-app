import { test, expect } from '@playwright/test'
import { Client, ID, Permission, Role, Storage, Users } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

/**
 * Profilbild-Ablage (SEC-001): der Bucket nimmt nur, was der Server nach
 * seinen Prüfungen schreibt, und die Auslieferung gibt nur Bilder heraus.
 *
 * Appwrite ist unter eigener Adresse direkt erreichbar — ein Recht am Bucket
 * gälte neben der Route. Deshalb prüft dieser Spec BEIDE Wege: den direkten
 * zu Appwrite (muss scheitern) und den über die Route (muss gehen, mit
 * Schutz-Kopfzeilen). Reiner API-Test, kein Seitenaufbau.
 *
 * Env-gated wie session-revoke.spec.ts: braucht den Runtime-Key aus `.env`
 * und einen konfigurierten Avatars-Bucket. Der Testnutzer wird per Admin-Key
 * angelegt und am Ende gelöscht, ebenso jede Datei, die der Test erzeugt.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const bucketId = process.env.NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET
const configured = Boolean(endpoint && projectId && apiKey && bucketId)

/** 1×1-PNG, gültig bis zum IEND. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const HTML = Buffer.from('<!doctype html><html><body><p>kein Bild</p></body></html>')

test.describe('Profilbild-Ablage: nur über die Route, nur Bilder (SEC-001)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key oder Avatars-Bucket nicht gesetzt (.env) — Ablage-E2E übersprungen.')

  let users: Users
  let storage: Storage
  let userId = ''
  let sessionId = ''
  let sessionSecret = ''
  const createdFiles: string[] = []

  test.beforeAll(async () => {
    const client = new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!)
    users = new Users(client)
    storage = new Storage(client)
    const user = await users.create({ userId: ID.unique(), email: `e2e-sec001-${ID.unique()}@example.test`, name: 'E2E SEC001' })
    userId = user.$id
    const session = await users.createSession({ userId })
    sessionId = session.$id
    sessionSecret = session.secret
  })

  test.afterAll(async () => {
    for (const fileId of createdFiles) {
      await storage.deleteFile({ bucketId: bucketId!, fileId }).catch(() => {})
    }
    if (userId) await users.delete({ userId }).catch(() => {})
  })

  /** Multipart-Upload DIREKT an Appwrite, angemeldet per JWT des Testnutzers. */
  async function directUpload(jwt: string, content: Buffer, name: string, type: string): Promise<number> {
    const form = new FormData()
    form.append('fileId', 'unique()')
    form.append('file', new Blob([new Uint8Array(content)], { type }), name)
    const response = await fetch(`${endpoint}/storage/buckets/${bucketId}/files`, {
      method: 'POST',
      headers: { 'X-Appwrite-Project': projectId!, 'X-Appwrite-JWT': jwt },
      body: form,
    })
    if (response.ok) {
      // Darf nicht passieren — aber dann wenigstens aufräumen.
      const body = await response.json() as { $id?: string }
      if (body.$id) createdFiles.push(body.$id)
    }
    return response.status
  }

  test('direkter Upload an der Route vorbei scheitert', async () => {
    const { jwt } = await users.createJWT({ userId, sessionId })
    expect(await directUpload(jwt, PNG, 'avatar.png', 'image/png')).toBe(401)
    expect(await directUpload(jwt, HTML, 'avatar.png', 'image/png')).toBe(401)
  })

  test('die Route nimmt ein Bild und liefert es geschützt aus', async ({ request, baseURL }) => {
    const headers = {
      // Die App prüft bei unsicheren Methoden die Herkunft (csrfOriginCheck).
      'Origin': new URL(baseURL!).origin,
      'Cookie': `a_session_${projectId}=${sessionSecret}`,
    }

    const upload = await request.post(`/api/storage/${bucketId}`, {
      headers,
      multipart: { file: { name: 'irgendwas', mimeType: 'image/png', buffer: PNG } },
    })
    expect(upload.status()).toBe(200)
    const file = await upload.json() as { $id: string }
    expect(file.$id).toBeTruthy()
    createdFiles.push(file.$id)
    // Der gespeicherte Name kommt aus dem erkannten Typ, nicht vom Aufrufer.
    expect((await storage.getFile({ bucketId: bucketId!, fileId: file.$id })).name).toBe('avatar.png')

    const view = await request.get(`/api/storage/${bucketId}/${file.$id}`)
    expect(view.status()).toBe(200)
    const viewHeaders = view.headers()
    expect(viewHeaders['content-type']).toMatch(/^image\/png/)
    expect(viewHeaders['x-content-type-options']).toBe('nosniff')
    expect(viewHeaders['content-security-policy']).toContain('sandbox')
    expect(Buffer.from(await view.body()).equals(PNG)).toBe(true)

    // Gegenprobe: HTML mit deklariertem Bildtyp
    const rejected = await request.post(`/api/storage/${bucketId}`, {
      headers,
      multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: HTML } },
    })
    expect(rejected.status()).toBe(415)
  })

  test('eine Nicht-Bild-Datei im Bucket wird nicht ausgeliefert', async ({ request }) => {
    // Per Admin-Key abgelegt — der Name passt zur Endungsliste, der Inhalt ist HTML.
    const probe = await storage.createFile({
      bucketId: bucketId!,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(HTML, 'probe.png'),
      permissions: [Permission.read(Role.any())],
    })
    createdFiles.push(probe.$id)

    const view = await request.get(`/api/storage/${bucketId}/${probe.$id}`)
    expect(view.status()).toBe(404)
    expect(view.headers()['x-content-type-options']).toBe('nosniff')
    expect(view.headers()['content-type'] ?? '').not.toMatch(/text\/html/)
  })
})
