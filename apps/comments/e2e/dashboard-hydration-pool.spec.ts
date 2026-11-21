import { test, expect } from '@playwright/test'
import { Client, Users } from 'node-appwrite'
import { expectNoMismatchOnFreshLoad } from './support/hydration'

/**
 * Dashboard im POOL: keine Abweichung zwischen Server- und Browser-Fassung
 * (FE-003, Q15, 2026-11-21) — was der Seitenlauf in `e2e.yml`
 * (`dashboard-landmarks.spec.ts`, Einzel-Instanz) nicht sehen kann, weil es
 * die Seiten dort nicht gibt: allen voran die MITGLIEDER-Verwaltung (Layer
 * `onboarding`), eine der sechs Seiten aus dem Befund.
 *
 * Läuft auf der Bühne (`pnpm buehne e2e`), als Owner der Community B. Nur
 * lesend: es wird nichts angelegt und nichts geändert.
 *
 * Die Erwartung steht fest im Test (die Adresse der Mitglieder-Seite und der
 * Statistik), sie kommt nicht aus der Seite, die geprüft wird.
 *
 * GEGENPROBE (2026-11-21, gegen die Seiten davor): rot mit sechs Seiten —
 * Mitglieder und Statistik (Baustein mit altem Namen), Kategorien,
 * Vertrauensstufen, Nachrichten und Gemeldete Nachrichten (Ladezustand).
 */
const poolUrl = process.env.PW_POOL_URL_B
const endpoint = process.env.PW_POOL_ENDPOINT
const projectId = process.env.PW_POOL_PROJECT
const apiKey = process.env.PW_POOL_KEY
const ownerId = process.env.PW_POOL_OWNER_B_USER_ID
const clientAddress = process.env.PW_CLIENT_ADDRESS
const configured = Boolean(poolUrl && endpoint && projectId && apiKey && ownerId)

const SIDEBAR_LINKS = '[role="complementary"] nav a[href*="/dashboard"]'
const MEMBERS = '/dashboard/members'
/** Reiter einer Hülle, ohne eigenen Punkt in der Seitenleiste. */
const EXTRA_FRESH_LOADS = ['/dashboard/community/statistics']

test.describe('Pool: Dashboard ohne Abweichung zwischen Server und Browser (Q15)', () => {
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

  test('Frisch vom Server: keine Seite der Seitenleiste meldet eine Abweichung', async ({ page, context }) => {
    // Jede Seite wird einzeln geladen; der Dev-Server bündelt sie beim ersten Zugriff.
    test.setTimeout(900_000)
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: sessionSecret,
      domain: new URL(poolUrl!).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
    await page.goto(`${poolUrl}/dashboard`)
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    // Mit Wiederholung: der Dev-Server lädt die Seite nach dem ersten Bündeln
    // einmal neu, ein Auslesen genau dann verliert seinen Kontext.
    let hrefs: string[] = []
    await expect(async () => {
      hrefs = await page.locator(SIDEBAR_LINKS).evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href') ?? ''))].filter(Boolean))
      // Ein leerer Lauf sähe grün aus; und ohne die Mitglieder-Seite fehlte
      // genau die, derentwegen es diese Datei gibt.
      expect(hrefs.length, 'Punkte in der Seitenleiste').toBeGreaterThanOrEqual(8)
      expect(hrefs, 'die Mitglieder-Verwaltung steht in der Seitenleiste des Owners').toContain(MEMBERS)
    }).toPass({ timeout: 60_000 })

    await expectNoMismatchOnFreshLoad(page, [...new Set([...hrefs, ...EXTRA_FRESH_LOADS])].map(href => `${poolUrl}${href}`))
  })
})
