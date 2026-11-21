import { test, expect, type Page } from '@playwright/test'
import { Client, Users, ID } from 'node-appwrite'

/**
 * EIN Anwesenheits-Abruf je Takt und Reiter (PERF-011, Q23, 2026-11-21).
 *
 * Eine Seite hat mehrere Leser der Anwesenheit (siehe `PAGES`). Vorher legte jeder seinen eigenen
 * 20-s-Takt an: alle Abrufe `GET /v1/presences` kamen im Bündel, einer je
 * Leser. Seit Q23 teilen sie EINEN Abruf (`core/shared/sharedPoll.ts`).
 *
 * Gezählt wird im Browser, in einem Ruhe-Fenster nach dem Laden: jeder Abruf
 * mit seiner Zeit. Zusage: nie zwei Abrufe in derselben Sekunde (ein Bündel
 * hiesse: mehrere Leser fragen getrennt), und höchstens einer je 20 s — der
 * Takt ist nur Rückhalt (20 s nach dem letzten Abruf, ein Ereignis bricht
 * ihn ab), und der unveränderte eigene Herzschlag lädt nichts nach.
 *
 * FREMDE PERSONEN zählen nicht mit: in der CI laufen andere angemeldete
 * Browser-Fälle parallel, und ihre Anwesenheit (Silo: `read("users")`) löst
 * bei diesem Reiter zu Recht einen Abruf aus. Ein Abruf bis 1,5 s nach einem
 * fremden Anwesenheits-Ereignis auf dem Socket gilt als erklärt; geprüft
 * werden die übrigen.
 *
 * GEGENPROBE (2026-11-21, lokal gegen den Stand davor): rot — in 45 s 8
 * Abrufe, je Takt zwei Leser gleichzeitig, jeder mit Takt UND Ereignis.
 *
 * Env-gated wie dashboard-landmarks.spec.ts: braucht den Runtime-Key aus
 * `.env`. Das Konto (Label `admin`) wird per Schlüssel angelegt und am Ende
 * gelöscht, die Sitzung entsteht server-seitig — kein Passwort wird getippt.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && apiKey)

const WINDOW_MS = 45_000

/**
 * Seiten mit mehreren Lesern: die Dashboard-Übersicht (Kachel „online",
 * „N sehen diese Seite", Moderation) und die Beitrags-Seite der Community
 * (Kommentar-Thread mit „wer liest mit" und Moderation).
 */
const PAGES = [
  { name: 'Dashboard-Übersicht', path: '/dashboard', ready: 'main#dashboard-main h1' },
  { name: 'Beitrags-Seite', path: '/', ready: '[data-comment-section]' },
]

/** So lange nach einem fremden Ereignis gilt ein Abruf als dessen Folge (250 ms Bündelung + Netz). */
const EXPLAINED_MS = 1_500

/** Zeitpunkte (ms) der Anwesenheits-Ereignisse ANDERER Konten auf dem Socket. */
function recordForeignPresenceEvents(page: Page, ownUserId: string): number[] {
  const at: number[] = []
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/realtime')) return
    ws.on('framereceived', (frame) => {
      let message: { type?: string, data?: { channels?: string[], payload?: { userId?: string } } }
      try { message = JSON.parse(String(frame.payload)) }
      catch { return } // kein JSON (Ping o. Ä.) — kein Ereignis
      const data = message.data
      if (message.type !== 'event' || !data?.channels?.some(c => c.includes('presences'))) return
      if (data.payload?.userId && data.payload.userId !== ownUserId) at.push(Date.now())
    })
  })
  return at
}

/** Zeitpunkte (ms) aller Listen-Abrufe der Anwesenheit ab jetzt. */
function recordPresenceLists(page: Page): number[] {
  const at: number[] = []
  page.on('request', (req) => {
    if (req.method() !== 'GET') return
    if (new URL(req.url()).pathname.endsWith('/v1/presences')) at.push(Date.now())
  })
  return at
}

test.describe('Anwesenheit: ein Abruf je Takt und Reiter (Q23)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — Anwesenheits-E2E übersprungen.')
  test.use({ viewport: { width: 1280, height: 900 } })
  // NACHEINANDER: beide Fälle nutzen dasselbe Konto. Zwei gleichzeitige
  // Reiter melden sich gegenseitig ihre Angaben (Seite, Thread) als Änderung
  // — dann lädt jeder zu Recht nach, und der Fall misst den Test statt der Seite.
  test.describe.configure({ mode: 'serial' })

  let users: Users
  let userId = ''
  let secret = ''

  test.beforeAll(async () => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const user = await users.create({ userId: ID.unique(), email: `e2e-q23-${ID.unique()}@example.test`, name: 'E2E Q23' })
    userId = user.$id
    await users.updateEmailVerification({ userId, emailVerification: true })
    await users.updateLabels({ userId, labels: ['admin'] })
    secret = (await users.createSession({ userId })).secret
  })

  test.afterAll(async () => {
    if (userId) await users.delete({ userId }).catch(() => {})
  })

  for (const target of PAGES) {
    test(`${target.name}: mehrere Leser, kein Bündel, höchstens ein Abruf je 20 s`, async ({ page, context, baseURL }) => {
    test.setTimeout(180_000)
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: secret,
      domain: new URL(baseURL!).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
    // Erster Aufruf wärmt den Dev-Server (er bündelt und lädt einmal neu).
    await page.goto(target.path)
    await expect(page.locator(target.ready).first()).toBeVisible({ timeout: 60_000 })
    await page.waitForLoadState('networkidle')
    const at = recordPresenceLists(page)
    const foreign = recordForeignPresenceEvents(page, userId)
    await page.reload()
    await expect(page.locator(target.ready).first()).toBeVisible({ timeout: 60_000 })

    // Der erste Abruf beim Laden zeigt, dass die Seite überhaupt liest — ohne
    // ihn wäre „kein Bündel" auch bei null Abrufen grün.
    await expect.poll(() => at.length, { timeout: 30_000 }).toBeGreaterThan(0)
    const start = Date.now()
    await page.waitForTimeout(WINDOW_MS)
    const inWindow = at.filter(t => t >= start && t < start + WINDOW_MS)
    const own = inWindow.filter(t => !foreign.some(e => e <= t && t - e <= EXPLAINED_MS))
    const secs = (list: number[]) => list.map(t => ((t - start) / 1000).toFixed(1)).join(' ')

    // Messwert im Bericht (Reporter `json`/`html`): Zahl und Zeitpunkte.
    test.info().annotations.push({ type: 'presence-lists', description: `${inWindow.length} in ${WINDOW_MS / 1000} s: ${secs(inWindow)}; davon durch fremde Ereignisse erklärt: ${inWindow.length - own.length}` })
    const perSecond = new Map<number, number>()
    for (const t of own) perSecond.set(Math.floor(t / 1000), (perSecond.get(Math.floor(t / 1000)) ?? 0) + 1)
    const burst = Math.max(0, ...perSecond.values())
    expect(burst, `Abrufe in derselben Sekunde (ohne fremde Ereignisse: ${own.length}, ab Start in s: ${secs(own)})`).toBeLessThanOrEqual(1)
    expect(own.length, `Abrufe im Fenster ohne fremde Ereignisse (${secs(own)})`).toBeLessThanOrEqual(Math.ceil(WINDOW_MS / 20_000))
  })
  }
})
