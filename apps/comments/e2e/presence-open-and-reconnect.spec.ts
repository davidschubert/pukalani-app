import { test, expect, type Page } from '@playwright/test'
import { Client, Users, ID } from 'node-appwrite'

/**
 * ZWEI RESTE AUS Q23 (Bahn 2, 2026-11-21) — im Browser gezählt.
 *
 * (a) HERZSCHLÄGE BEIM ÖFFNEN: beim Laden einer Seite melden sich mehrere
 *     Bausteine kurz nacheinander (Anmeldung, Seite, Thread, Fokus). Vorher
 *     schrieb jeder Anlass sofort: zwei bis vier `POST /api/presence/heartbeat`
 *     in der ersten Sekunde. Jetzt bündelt `usePresenceState()` sie zu EINEM
 *     (`PRESENCE_BUNDLE_MS`). Gezählt in den ersten 5 s nach dem Laden — der
 *     Takt (20 s) liegt außerhalb.
 *
 * (b) NEUVERSUCH NACH ABLEHNUNG: nimmt der Server die Live-Verbindung an und
 *     schließt sie gleich wieder, versuchte das SDK es JEDE Sekunde neu (es
 *     nullt seinen Zähler beim Öffnen). Jetzt wachsen die Abstände
 *     (`core/shared/realtimeReconnect.ts`). Gestellt wird die Ablehnung mit
 *     `page.routeWebSocket`: jede Verbindung wird angenommen und sofort
 *     geschlossen; gezählt werden die Versuche in 20 s.
 *
 * GEMESSEN (lokal, Dev-Server, 2026-11-21): (a) vorher 3 Herzschläge auf
 * beiden Seiten, nachher 1; (b) vorher 39 Versuche in 20 s (zwei je
 * Sekunde), nachher 6 (bei 0, 1, 3, 8, 17 s und ein Abo-Anstoß). Die
 * Gegenprobe gegen den Stand davor ist damit rot. Messwerte stehen im Bericht
 * (`annotations`).
 *
 * Env-gated wie presence-shared-poll.spec.ts: Konto per Schlüssel, Sitzung
 * server-seitig, am Ende gelöscht.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && apiKey)

const OPEN_WINDOW_MS = 5_000
const RECONNECT_WINDOW_MS = 20_000

function countHeartbeats(page: Page): number[] {
  const at: number[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/presence/heartbeat') at.push(Date.now())
  })
  return at
}

test.describe('Anwesenheit: Öffnen und Neuversuch (Q23-Rest)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — übersprungen.')
  test.use({ viewport: { width: 1280, height: 900 } })
  test.describe.configure({ mode: 'serial' })

  let users: Users
  let userId = ''
  let secret = ''

  test.beforeAll(async () => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const user = await users.create({ userId: ID.unique(), email: `e2e-q23b-${ID.unique()}@example.test`, name: 'E2E Q23b' })
    userId = user.$id
    await users.updateEmailVerification({ userId, emailVerification: true })
    await users.updateLabels({ userId, labels: ['admin'] })
    secret = (await users.createSession({ userId })).secret
  })

  test.afterAll(async () => {
    if (userId) await users.delete({ userId }).catch(() => {})
  })

  async function signIn(page: Page, baseURL: string) {
    await page.context().addCookies([{
      name: `a_session_${projectId}`,
      value: secret,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
  }

  for (const target of [
    { name: 'Dashboard-Übersicht', path: '/dashboard', ready: 'main#dashboard-main h1' },
    { name: 'Beitrags-Seite', path: '/', ready: '[data-comment-section]' },
  ]) {
    test(`(a) ${target.name}: ein Herzschlag beim Öffnen`, async ({ page, baseURL }) => {
      test.setTimeout(120_000)
      await signIn(page, baseURL!)
      // Erster Aufruf wärmt den Dev-Server.
      await page.goto(target.path)
      await expect(page.locator(target.ready).first()).toBeVisible({ timeout: 60_000 })
      await page.waitForLoadState('networkidle')

      const at = countHeartbeats(page)
      const start = Date.now()
      await page.reload()
      await expect(page.locator(target.ready).first()).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(Math.max(0, OPEN_WINDOW_MS - (Date.now() - start)))
      const inWindow = at.filter(t => t - start < OPEN_WINDOW_MS)
      test.info().annotations.push({ type: 'heartbeats-on-open', description: `${inWindow.length} in ${OPEN_WINDOW_MS / 1000} s` })

      // Gegenprobe im selben Fall: es WIRD geschrieben (sonst wäre ≤ 1 auch bei 0 grün).
      expect(inWindow.length).toBeGreaterThanOrEqual(1)
      expect(inWindow.length).toBeLessThanOrEqual(1)
    })
  }

  test('(b) abgelehnte Verbindung: die Abstände wachsen', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    let attempts = 0
    const times: number[] = []
    await page.routeWebSocket(/\/v1\/realtime/, (ws) => {
      attempts++
      times.push(Date.now())
      // Angenommen (der `open`-Handler läuft), dann sofort geschlossen —
      // nicht mit 1008, das beendete die Neuversuche ganz.
      setTimeout(() => ws.close({ code: 1011, reason: 'probe' }), 50)
    })
    await signIn(page, baseURL!)
    await page.goto('/')
    await expect(page.locator('[data-comment-section]').first()).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => attempts, { timeout: 30_000 }).toBeGreaterThan(0)

    const before = attempts
    const start = Date.now()
    await page.waitForTimeout(RECONNECT_WINDOW_MS)
    const inWindow = attempts - before
    const secs = times.filter(t => t >= start).map(t => ((t - start) / 1000).toFixed(1)).join(' ')
    test.info().annotations.push({ type: 'reconnects', description: `${inWindow} Versuche in ${RECONNECT_WINDOW_MS / 1000} s: ${secs}` })
    // Vorher zwei je Sekunde (39); mit 1, 2, 4, 8, 16 s fünf, dazu höchstens
    // ein paar Anstöße neuer Abos. Die Grenze liegt weit unter dem alten Wert.
    expect(inWindow).toBeGreaterThanOrEqual(1)
    expect(inWindow).toBeLessThanOrEqual(10)
  })
})
