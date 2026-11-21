import { test, expect, type BrowserContext } from '@playwright/test'
import { Client, Users, ID } from 'node-appwrite'
import { expectNoMismatchOnFreshLoad } from './support/hydration'

/**
 * Aufbau des Dashboards für Tastatur und Vorleseprogramm (UX-006, UX-010; Q09,
 * 2026-11-21).
 *
 * Drei Zusagen, im Browser gemessen:
 *  1. SEITENLAUF: jede Seite, die die Seitenleiste verlinkt, hat GENAU EIN
 *     `main`, und darin steht nach dem Wechsel auch etwas. Gewechselt wird per
 *     KLICK (ohne Neuladen), weil genau dort ein Bereich um den Seiten-Slot
 *     schaden könnte: `UDashboardPanel` ist mehrwurzelig.
 *  2. SPRUNGLINK: der ERSTE Tab-Schritt landet auf „Zum Inhalt springen",
 *     Enter setzt den Fokus in den Hauptbereich — statt über zwanzig Schritten
 *     durch die Seitenleiste.
 *  3. UMSCHALTER: der Knopf, der die Seitenleiste einklappt, sagt seinen
 *     Zustand (`aria-expanded`), und der wechselt mit.
 *
 *  4. KEINE ABWEICHUNG (FE-003, Q15): jede Seite der Seitenleiste, FRISCH vom
 *     Server geladen, lässt die Konsole ohne Abweichungs-Meldung — der
 *     Browser übernimmt, was der Server gezeichnet hat, statt es neu zu bauen.
 *     Einzelheiten und Grenzen: `support/hydration.ts`.
 *
 * Die Erwartungen stehen fest im Test (Kennung des Bereichs, Testmarke des
 * Links); nichts davon kommt aus der Seite, die geprüft wird.
 *
 * Env-gated wie session-revoke.spec.ts: braucht den Runtime-Key aus `.env`.
 * Das Konto (Label `admin`) wird per Schlüssel angelegt und am Ende gelöscht,
 * die Sitzung entsteht server-seitig — kein Passwort wird getippt.
 *
 * GEGENPROBE (2026-11-21, gegen das Layout davor und den Umschalter ohne
 * Zustand): alle drei Fälle rot — der Seitenlauf zählt 0 statt 1 `main`, die
 * beiden anderen finden den Hauptbereich gar nicht erst.
 *
 * GEGENPROBE ZU 4 (2026-11-21, gegen die Seiten davor): rot mit fünf Seiten —
 * Kategorien, Vertrauensstufen, Nachrichten, Gemeldete Nachrichten (der
 * Server zeichnete „nichts da", der Browser „lädt") und Statistik (ein
 * Baustein mit altem Namen). Die sechste Seite des Befunds, die Mitglieder-
 * Verwaltung, gibt es nur im Pool: `dashboard-hydration-pool.spec.ts`.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && apiKey)

/**
 * Seiten OHNE eigenen Punkt in der Seitenleiste (Reiter einer Hülle), die
 * trotzdem frisch geladen werden: die Statistik stand im Befund.
 */
const EXTRA_FRESH_LOADS = ['/dashboard/community/statistics']

/** Die Seitenleiste des Dashboards — benannter Bereich aus dem Layout. */
const SIDEBAR_LINKS = '[role="complementary"] nav a[href*="/dashboard"]'

test.describe('Dashboard: Hauptbereich, Sprunglink, Umschalter (Q09)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — Dashboard-E2E übersprungen.')
  test.use({ viewport: { width: 1280, height: 900 } })

  let users: Users
  let userId = ''
  let secret = ''

  test.beforeAll(async () => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const user = await users.create({ userId: ID.unique(), email: `e2e-q09-${ID.unique()}@example.test`, name: 'E2E Q09' })
    userId = user.$id
    await users.updateEmailVerification({ userId, emailVerification: true })
    await users.updateLabels({ userId, labels: ['admin'] })
    secret = (await users.createSession({ userId })).secret
  })

  test.afterAll(async () => {
    if (userId) await users.delete({ userId }).catch(() => {})
  })

  async function signIn(context: BrowserContext, baseURL: string) {
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: secret,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
  }

  test('Seitenlauf: jede Seite der Seitenleiste hat genau einen Hauptbereich mit Inhalt', async ({ page, context, baseURL }) => {
    // Der Dev-Server bündelt jede Route beim ersten Zugriff.
    test.setTimeout(600_000)
    await signIn(context, baseURL!)
    await page.goto('/dashboard')
    await expect(page.locator('main')).toHaveCount(1)

    const hrefs = await page.locator(SIDEBAR_LINKS).evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href') ?? ''))].filter(Boolean))
    // Ein leerer Lauf sähe grün aus: die Einzel-Instanz zeigt einem Betreiber
    // deutlich mehr als eine Handvoll Punkte.
    expect(hrefs.length, 'Punkte in der Seitenleiste').toBeGreaterThanOrEqual(8)

    for (const href of hrefs) {
      await test.step(href, async () => {
        await page.locator(`${SIDEBAR_LINKS}[href="${href}"]`).first().click()
        // Manche Punkte leiten weiter (Hülle → erster Reiter): es zählt, dass
        // die Adresse im Dashboard bleibt und sich die Seite gezeichnet hat.
        await expect(page).toHaveURL(/\/dashboard/)
        await expect(page.locator('main'), `genau ein main auf ${href}`).toHaveCount(1)
        await expect(page.locator('main#dashboard-main h1').first(), `Überschrift im Hauptbereich auf ${href}`).toBeVisible({ timeout: 60_000 })
        await expect(page.locator('main'), `immer noch genau ein main auf ${href}`).toHaveCount(1)
      })
    }

    // Und einmal frisch vom Server: dieselbe Zusage ohne vorherigen Klick.
    await page.goto(hrefs[hrefs.length - 1]!)
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })
  })

  test('Frisch vom Server: keine Seite der Seitenleiste meldet eine Abweichung zwischen Server und Browser', async ({ page, context, baseURL }) => {
    // Jede Seite wird einzeln geladen; der Dev-Server bündelt sie beim ersten Zugriff.
    test.setTimeout(900_000)
    await signIn(context, baseURL!)
    await page.goto('/dashboard')
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    // Mit Wiederholung: der Dev-Server lädt die Seite nach dem ersten Bündeln
    // einmal neu, ein Auslesen genau dann verliert seinen Kontext.
    let hrefs: string[] = []
    await expect(async () => {
      hrefs = await page.locator(SIDEBAR_LINKS).evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href') ?? ''))].filter(Boolean))
      // Ein leerer Lauf sähe grün aus (wie im Seitenlauf oben).
      expect(hrefs.length, 'Punkte in der Seitenleiste').toBeGreaterThanOrEqual(8)
    }).toPass({ timeout: 60_000 })

    await expectNoMismatchOnFreshLoad(page, [...new Set([...hrefs, ...EXTRA_FRESH_LOADS])])
  })

  test('Sprunglink: ein Tab-Schritt, Enter, und der Fokus steht im Hauptbereich', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!)
    await page.goto('/dashboard')
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    const skip = page.getByTestId('skip-to-content')
    // Vor dem Fokus ist der Link nicht zu sehen (ein Pixel groß).
    expect((await skip.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1)

    await page.keyboard.press('Tab')
    await expect(skip, 'der ERSTE Tab-Schritt ist der Sprunglink').toBeFocused()
    expect((await skip.boundingBox())?.width ?? 0, 'mit Fokus ist er sichtbar').toBeGreaterThan(40)

    await page.keyboard.press('Enter')
    await expect(page.locator('main#dashboard-main')).toBeFocused()

    // Der nächste Tab-Schritt liegt IM Hauptbereich, nicht in der Seitenleiste.
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('main#dashboard-main'))).toBe(true)
  })

  test('Umschalter der Seitenleiste sagt seinen Zustand', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!)
    await page.goto('/dashboard')
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    // Der Knopf mit Zustand in der Kopfzeile des Hauptbereichs. Der zweite
    // Knopf dort (Schublade) ist breit unsichtbar — sein Fall steht unten.
    const toggle = page.locator('main#dashboard-main button[aria-expanded]:visible').first()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Mit Wiederholung: vor der Hydration tut der Klick nichts.
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  test('Schubladen-Knopf im schmalen Fenster sagt seinen Zustand (Q09-Rest)', async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signIn(context, baseURL!)
    await page.goto('/dashboard')
    await expect(page.locator('main#dashboard-main h1').first()).toBeVisible({ timeout: 60_000 })

    const drawer = page.locator('main#dashboard-main [data-slot="toggle"]:visible').first()
    await expect(drawer).toHaveAttribute('aria-expanded', 'false')
    // Mit Wiederholung: vor der Hydration tut der Klick nichts.
    await expect(async () => {
      await drawer.click()
      await expect(page.locator('main#dashboard-main [data-slot="toggle"]').first()).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })
})
