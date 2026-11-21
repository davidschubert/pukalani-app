import { test, expect, type Page } from '@playwright/test'
import { Client, Users } from 'node-appwrite'
import { NARROW_WIDTHS, coveredByFeedback, expectNoSidewaysScroll, expectReachable, labelsIn, openDrawer } from './support/narrowScreens'

/**
 * Schmale Fenster im POOL (Q01, 2026-11-20) — was der Test in `e2e.yml` nicht
 * sehen kann, weil es das dort nicht gibt: EIGENE Punkte und Unterpunkte (der
 * Navigations-Editor kommt aus dem pages-Layer), die Symbole einer angemeldeten
 * Person in der Kopfzeile, und der Feedback-Knopf.
 *
 * Läuft auf der Bühne (`pnpm buehne e2e`), als Owner der Community B. Die
 * Navigation wird über die ECHTE Route gesetzt (`PATCH /api/pages/navigation`)
 * und am Ende auf den Stand von vorher zurückgestellt.
 *
 * VORAUSSETZUNG: Community B steht auf Plan `pro` — ohne Plan gilt `basic`,
 * und „Feed", „Discussions" und „Events" gibt es erst ab `personal` (dann
 * fehlen sie in der Schublade, so im nächtlichen Lauf vom 2026-11-21: ein
 * Beweis-Skript hatte den Plan verstellt hinterlassen). Die Datei kann den
 * Plan nicht selbst setzen (er steht im Control Plane, sie hat nur den
 * Pool-Schlüssel); `pnpm buehne e2e` stellt den Soll-Stand der Bühne vor dem
 * ersten Test her (`scripts/buehne/baseline.mjs`).
 *
 * Die Namen unten sind FEST und stehen sonst nirgends — die Erwartung kommt
 * also nicht aus der Antwort, die geprüft wird.
 *
 * GEGENPROBE (2026-11-20, gegen den Stand davor): die Schubladen-Fälle rot
 * (kein Menü-Knopf), der Feedback-Fall bei 375 px rot („Impressum" überdeckt).
 */
const poolUrl = process.env.PW_POOL_URL_B
const endpoint = process.env.PW_POOL_ENDPOINT
const projectId = process.env.PW_POOL_PROJECT
const apiKey = process.env.PW_POOL_KEY
const ownerId = process.env.PW_POOL_OWNER_B_USER_ID
const clientAddress = process.env.PW_CLIENT_ADDRESS
const configured = Boolean(poolUrl && endpoint && projectId && apiKey && ownerId)

const GROUP = 'Q01 Gruppe'
const CHILD_INTERNAL = 'Q01 Unterpunkt'
const CHILD_EXTERNAL = 'Q01 Extern'
const OWN_LINK = 'Q01 Eigener Punkt'
const OVERRIDE = {
  entries: [
    { id: 'group-q01', label: GROUP },
    { id: 'link-q01-a', label: CHILD_INTERNAL, to: '/', parent: 'group-q01' },
    { id: 'link-q01-b', label: CHILD_EXTERNAL, to: 'https://example.org/q01', external: true, parent: 'group-q01' },
    { id: 'link-q01-c', label: OWN_LINK, to: '/' },
  ],
}

async function patchNavigation(page: Page, body: unknown): Promise<number> {
  return page.evaluate(async (payload) => {
    const res = await fetch('/api/pages/navigation', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.status
  }, body)
}

test.describe('Pool: eigene Punkte, Unterpunkte und der Feedback-Knopf im schmalen Fenster', () => {
  test.skip(!configured, 'Keine Pool-Bühne gesetzt (PW_POOL_*) — `pnpm buehne e2e` setzt sie.')
  // Nacheinander in EINEM Arbeiter (die Navigation der Community ist geteilt),
  // aber ohne dass ein roter Fall die übrigen überspringt.
  test.describe.configure({ mode: 'default' })
  if (clientAddress) test.use({ extraHTTPHeaders: { 'x-forwarded-for': clientAddress } })

  let users: Users
  let sessionId = ''
  let sessionSecret = ''
  let before: unknown = null

  test.beforeAll(async ({ browser }) => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const session = await users.createSession({ userId: ownerId! })
    sessionId = session.$id
    sessionSecret = session.secret

    const context = await browser.newContext(clientAddress ? { extraHTTPHeaders: { 'x-forwarded-for': clientAddress } } : {})
    await signIn(context)
    const page = await context.newPage()
    await page.goto(`${poolUrl}/`)
    // Mit Wiederholung: der Dev-Server lädt die Seite nach dem ersten Bündeln
    // einmal neu, ein Abruf genau dann verliert seinen Kontext.
    await expect(async () => {
      before = await page.evaluate(async () => (await fetch('/api/pages/navigation')).json())
      expect(await patchNavigation(page, OVERRIDE), 'Navigation setzen').toBe(200)
    }).toPass({ timeout: 60_000 })
    await context.close()
  })

  test.afterAll(async ({ browser }) => {
    try {
      if (before) {
        const context = await browser.newContext(clientAddress ? { extraHTTPHeaders: { 'x-forwarded-for': clientAddress } } : {})
        await signIn(context)
        const page = await context.newPage()
        await page.goto(`${poolUrl}/`)
        await expect(async () => {
          expect(await patchNavigation(page, before), 'Navigation zurückstellen').toBe(200)
        }).toPass({ timeout: 60_000 })
        await context.close()
      }
    }
    finally {
      if (sessionId) await users.deleteSession({ userId: ownerId!, sessionId }).catch(() => {})
    }
  })

  async function signIn(context: { addCookies: (cookies: Array<Record<string, unknown>>) => Promise<void> }) {
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: sessionSecret,
      domain: new URL(poolUrl!).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
  }

  test.beforeEach(async ({ context }) => { await signIn(context) })

  for (const width of NARROW_WIDTHS) {
    test(`${width} px: Schublade zeigt Produkte, eigene Punkte und Unterpunkte`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(`${poolUrl}/`)
      const toggle = page.getByTestId('chrome-nav-toggle')
      await expect(toggle).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('chrome-nav')).toBeHidden()
      await expectNoSidewaysScroll(page)

      // Angemeldet: Name, Menü-Knopf und alle Symbole rechts liegen nebeneinander.
      const controls = page.getByTestId('main-nav').locator('a:visible, button:visible')
      const count = await controls.count()
      expect(count, 'Menü-Knopf, Name und die Symbole der angemeldeten Person').toBeGreaterThanOrEqual(4)
      for (let i = 0; i < count; i++) await expectReachable(controls.nth(i), `Kopfzeile, Teil ${i + 1}`)

      const drawer = page.getByTestId('chrome-nav-drawer')
      await openDrawer(toggle, drawer)
      const labels = await labelsIn(drawer)
      for (const expected of [GROUP, CHILD_INTERNAL, CHILD_EXTERNAL, OWN_LINK]) {
        expect(labels.some(label => label.includes(expected)), `„${expected}" fehlt: ${labels.join(' · ')}`).toBe(true)
      }
      for (const product of [/feed/i, /dis[ck]ussion/i, /events/i]) {
        expect(labels.some(label => product.test(label)), `${product} fehlt: ${labels.join(' · ')}`).toBe(true)
      }

      // Unterpunkte stehen aufgeklappt da und sind erreichbar; der externe
      // öffnet in einem neuen Tab und gibt der Zielseite keinen Griff zurück.
      const child = drawer.getByRole('link', { name: CHILD_INTERNAL })
      await expectReachable(child, 'interner Unterpunkt')
      const external = drawer.getByRole('link', { name: CHILD_EXTERNAL })
      await expectReachable(external, 'externer Unterpunkt')
      await expect(external).toHaveAttribute('href', 'https://example.org/q01')
      await expect(external).toHaveAttribute('target', '_blank')
      await expect(external).toHaveAttribute('rel', /noopener/)
      await expectReachable(drawer.getByRole('link', { name: OWN_LINK }), 'eigener Punkt')
      const links = drawer.locator('a')
      for (let i = 0; i < await links.count(); i++) await expectReachable(links.nth(i), `Schublade, Link ${i + 1}`)
      await expectNoSidewaysScroll(page)
    })
  }

  for (const width of [...NARROW_WIDTHS, 1440]) {
    test(`${width} px: der Feedback-Knopf liegt am Seitenende über keinem Link`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(`${poolUrl}/`)
      await expect(page.getByTestId('feedback-button')).toBeVisible({ timeout: 60_000 })
      expect(await coveredByFeedback(page)).toEqual([])
      // Der erste Link der Fusszeile (Rechtsseite) lässt sich treffen.
      const legal = page.locator('footer nav a').first()
      await expectReachable(legal, 'erster Link der Fusszeile')
    })
  }
})
