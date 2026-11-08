import { test, expect, type Page } from '@playwright/test'
import { Client, Users, ID, type Models } from 'node-appwrite'

/**
 * Sofort-Abmeldung bei Session-Widerruf (RT2, 2026-11-08).
 *
 * Der `account`-Channel läuft seit RT2 über den GETEILTEN Realtime-Socket
 * (useRealtimeAccount). Appwrite ≥ 2.7 bindet jede angemeldete Verbindung an
 * ihre Session: beim Widerruf kommt erst `users.<id>.sessions.<id>.delete`,
 * dann ein 401-Frame, dann Close (`onRealtimeAccessEnded`).
 * `realtime-account.client.ts` prüft daraufhin `/api/auth/me` und schickt zur
 * Anmeldung.
 *
 * Beide Auth-Arten des Sockets sind abgedeckt, je nachdem, wohin der
 * Dev-Server den BROWSER schickt: Endpoint `http://localhost/v1` ⇒ das
 * host-only Cookie erreicht Appwrite, Cookie-Modus (RT1). Endpoint
 * `http://127.0.0.1/v1` ⇒ es erreicht ihn nicht, JWT-Modus wie in Prod.
 *
 * Env-gated wie realtime.spec.ts: braucht den Runtime-Key aus `.env`.
 * Der Testnutzer wird per Admin-Key angelegt und am Ende gelöscht; die
 * Sessions entstehen server-seitig (`users.createSession`), es wird kein
 * Passwort getippt.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && apiKey)

test.describe('Session-Widerruf meldet sofort ab (RT2)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — Widerrufs-E2E übersprungen.')

  let users: Users
  let userId = ''

  test.beforeAll(async () => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const user = await users.create({ userId: ID.unique(), email: `e2e-rt2-${ID.unique()}@example.com`, name: 'E2E RT2' })
    userId = user.$id
  })

  test.afterAll(async () => {
    if (userId) await users.delete({ userId }).catch(() => {})
  })

  /** Neue Session server-seitig, Cookie in den Browser, Seite öffnen, bis `account` abonniert ist. */
  async function openSignedIn(page: Page, baseURL: string): Promise<{ session: Models.Session, frames: string[] }> {
    const session = await users.createSession({ userId })
    await page.context().addCookies([{
      name: `a_session_${projectId}`,
      value: session.secret,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
    const frames: string[] = []
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/realtime')) return
      frames.push(`url ${ws.url().includes('jwt=') ? 'jwt' : 'cookie'} ${decodeURIComponent(ws.url())}`)
      ws.on('framereceived', f => frames.push(String(f.payload)))
      ws.on('framesent', f => frames.push(`> ${String(f.payload)}`))
    })
    await page.goto('/')
    // Ein Socket ist angemeldet (Appwrite meldet den Nutzer im `connected`-Frame)
    // UND `account` ist abonniert — per Subscribe-Frame (SDK) oder, wie vor
    // RT2, per `channels[]=account` in der URL eines eigenen Sockets. Beides
    // gilt, damit die Gegenprobe gegen den alten Code am WIDERRUF scheitert
    // und nicht schon hier.
    await expect.poll(() => frames.some(f => f.includes('"type":"connected"') && f.includes(`"$id":"${userId}"`)), { timeout: 60_000 }).toBe(true)
    await expect.poll(() => frames.some(f => (f.startsWith('> ') && f.includes('"account"')) || (f.startsWith('url ') && f.includes('channels[]=account'))), { timeout: 30_000 }).toBe(true)
    // Die Bestätigung des Abos ist kein eigener Frame-Typ — kurz Luft lassen.
    await page.waitForTimeout(1_500)
    return { session, frames }
  }

  test('Gegenprobe: eine ANDERE Session zu beenden lässt diesen Tab angemeldet', async ({ page, baseURL }) => {
    const { frames } = await openSignedIn(page, baseURL!)
    const other = await users.createSession({ userId })
    await users.deleteSession({ userId, sessionId: other.$id })

    // Das Ereignis kommt an (der Socket ist also wirklich der Nutzer) …
    await expect.poll(() => frames.some(f => f.includes(`sessions.${other.$id}.delete`)), { timeout: 15_000 }).toBe(true)
    // … der Nachtrag läuft, und der Tab bleibt, wo er ist.
    await page.waitForTimeout(3_000)
    expect(new URL(page.url()).pathname).not.toMatch(/\/login$/)
    expect(frames.some(f => f.includes('"code":401'))).toBe(false)
    expect(await page.evaluate(() => fetch('/api/auth/me').then(r => r.status))).toBe(200)
  })

  test('die EIGENE Session zu widerrufen schickt den Tab sofort zur Anmeldung', async ({ page, baseURL }) => {
    const { session, frames } = await openSignedIn(page, baseURL!)
    const revokedAt = Date.now()
    await users.deleteSession({ userId, sessionId: session.$id })

    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 })
    const seconds = (Date.now() - revokedAt) / 1000
    // Welche Auth trug der Socket? (Handshake-URL mit `jwt=` ⇒ JWT-Modus wie in Prod)
    console.log(`[RT2] Abmeldung nach ${seconds.toFixed(1)} s · Sockets: ${frames.filter(f => f.startsWith('url ')).map(f => f.split(' ')[1]).join(', ')}`)
    // Beide Signale aus Appwrite 2.7: Ereignis und 401 vor dem Close.
    expect(frames.some(f => f.includes(`sessions.${session.$id}.delete`))).toBe(true)
    expect(frames.some(f => f.includes('"type":"error"') && f.includes('"code":401'))).toBe(true)
  })
})
