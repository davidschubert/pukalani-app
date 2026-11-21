import { test, expect, type Page } from '@playwright/test'
import { Client, Users } from 'node-appwrite'

/**
 * Listen-Zustände im POOL (FE-004, Q14, 2026-11-21): zwei umgestellte Seiten
 * des Owner-Dashboards zeigen bei gestörtem Abruf „Fehler" mit einem
 * funktionierenden „Noch einmal versuchen", und bei einer leeren Antwort
 * „leer" — nicht mehr „nichts vorhanden" nach einem Fehler.
 *
 * Läuft auf der Bühne (`pnpm buehne e2e`), als Owner der Community B. Nur
 * lesend: Störung und leere Antwort stellt der Browser selbst (`page.route`),
 * in der Datenbank wird nichts angelegt oder geändert.
 *
 * - Vertrauensstufen (`posts`): der Abruf läuft nur im Browser — er ist bei
 *   jedem Laden abfangbar.
 * - Mitglieder (`onboarding`): der Abruf läuft beim frischen Laden auf dem
 *   Server; abgefangen wird er beim Wechsel aus der Seitenleiste, wo der
 *   Browser ihn stellt.
 *
 * GEGENPROBE (2026-11-21): mit der alten Rechnung (ein Fehler zählt als
 * „leer") sind beide Fehler-Fälle rot — die Seite zeigt den leeren Zustand.
 */
const poolUrl = process.env.PW_POOL_URL_B
const endpoint = process.env.PW_POOL_ENDPOINT
const projectId = process.env.PW_POOL_PROJECT
const apiKey = process.env.PW_POOL_KEY
const ownerId = process.env.PW_POOL_OWNER_B_USER_ID
const clientAddress = process.env.PW_CLIENT_ADDRESS
const configured = Boolean(poolUrl && endpoint && projectId && apiKey && ownerId)

const TRUST_API = '**/api/posts/trust-levels'
const MEMBERS_API = '**/api/community/members'

test.describe('Pool: Listen zeigen lädt, Fehler, leer oder Daten (Q14)', () => {
  test.skip(!configured, 'Keine Pool-Bühne gesetzt (PW_POOL_*) — `pnpm buehne e2e` setzt sie.')
  test.use({ viewport: { width: 1280, height: 900 } })
  if (clientAddress) test.use({ extraHTTPHeaders: { 'x-forwarded-for': clientAddress } })

  let users: Users
  let sessionId = ''
  let sessionSecret = ''

  test.beforeAll(async () => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const session = await users.createSession({ userId: ownerId! })
    sessionId = session.$id
    sessionSecret = session.secret
  })

  test.afterAll(async () => {
    if (sessionId) await users.deleteSession({ userId: ownerId!, sessionId }).catch(() => {})
  })

  test.beforeEach(async ({ context }) => {
    test.setTimeout(180_000)
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: sessionSecret,
      domain: new URL(poolUrl!).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
  })

  /**
   * Wechsel IM BROWSER (über den Router der App, wie ein Klick in der
   * Seitenleiste): nur dann stellt der Browser den Abruf, und `page.route`
   * kann ihn stören. Ein voller Seitenaufruf holte die Liste auf dem Server.
   */
  async function clientNavigate(page: Page, path: string): Promise<void> {
    await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as unknown as { __vue_app__?: unknown } | null)?.__vue_app__), null, { timeout: 60_000 })
    await page.evaluate(async (target) => {
      const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }).__vue_app__
      await app.config.globalProperties.$router.push(target)
    }, path)
  }

  test('Vertrauensstufen: Störung ⇒ Fehler, „Noch einmal versuchen" ⇒ Daten', async ({ page }) => {
    let fail = true
    await page.route(TRUST_API, route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }) : route.fallback())
    await page.goto(`${poolUrl}/dashboard/trust-levels`)

    const list = page.locator('[data-trust-list]')
    await expect(list).toHaveAttribute('data-list-state', 'error', { timeout: 60_000 })
    await expect(list.locator('[role="alert"] [data-load-error]')).toBeVisible()
    await expect(page.locator('[data-empty-state]')).toHaveCount(0)

    fail = false
    await list.locator('[data-load-error-retry]').click()
    await expect(list).toHaveAttribute('data-list-state', /^(ready|empty)$/, { timeout: 30_000 })
    await expect(page.locator('[data-load-error]')).toHaveCount(0)
  })

  test('Vertrauensstufen: leere Antwort ⇒ leer, im role="status"', async ({ page }) => {
    await page.route(TRUST_API, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leaders: [], members: [], truncated: false }) }))
    await page.goto(`${poolUrl}/dashboard/trust-levels`)

    const list = page.locator('[data-trust-list]')
    await expect(list).toHaveAttribute('data-list-state', 'empty', { timeout: 60_000 })
    await expect(list.locator('[role="status"] [data-empty-state]')).toBeVisible()
    await expect(page.locator('[data-load-error]')).toHaveCount(0)
  })

  test('Mitglieder: Störung beim Wechsel ⇒ Fehler, „Noch einmal versuchen" ⇒ Tabelle', async ({ page }) => {
    await page.goto(`${poolUrl}/dashboard`)
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    let fail = true
    let blocked = 0
    await page.route(MEMBERS_API, (route) => {
      if (!fail) return route.fallback()
      blocked++
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' })
    })
    await clientNavigate(page, '/dashboard/members')

    const list = page.locator('[data-members-list]')
    await expect(list).toHaveAttribute('data-list-state', 'error', { timeout: 60_000 })
    await expect(list.locator('[role="alert"] [data-load-error]')).toBeVisible()
    await expect(page.locator('[data-members-table]')).toHaveCount(0)
    expect(blocked, 'der Browser hat den Abruf gestellt (sonst prüft der Fall nichts)').toBeGreaterThan(0)

    fail = false
    await list.locator('[data-load-error-retry]').click()
    await expect(list).toHaveAttribute('data-list-state', 'ready', { timeout: 30_000 })
    await expect(page.locator('[data-members-table]')).toBeVisible()
  })

  test('Mitglieder: leere Antwort beim Wechsel ⇒ leer mit Einladen-Knopf', async ({ page }) => {
    await page.goto(`${poolUrl}/dashboard`)
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    await page.route(MEMBERS_API, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [], invites: [], actorRole: 'owner' }) }))
    await clientNavigate(page, '/dashboard/members')

    const list = page.locator('[data-members-list]')
    await expect(list).toHaveAttribute('data-list-state', 'empty', { timeout: 60_000 })
    await expect(list.locator('[role="status"] [data-empty-state]')).toBeVisible()
  })
})
