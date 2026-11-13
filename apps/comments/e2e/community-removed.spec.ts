import { test, expect } from '@playwright/test'
import { Client, Users } from 'node-appwrite'

/**
 * ENTFERNT ⇒ HINWEISSEITE (SEC-030 Teil 2, 2026-11-13).
 *
 * Wem ein Administrator den Zugang zu einer Community entzogen hat, der sieht
 * dort — angemeldet — auf JEDER Adresse nur noch die Hinweisseite, bekommt von
 * den Inhalts-Routen 403 `community_removed` und kann der Leitung höchstens
 * eine Nachricht pro Woche schicken.
 *
 * ── WARUM DIESE SPEC IN DER CI ÜBERSPRUNGEN WIRD ───────────────────────────
 * „Entfernt" gibt es nur im POOL (viele Communities, ein Projekt) und nur mit
 * dem Control Plane dahinter, das die Mitgliedschaft führt. Die CI-Bühne ist
 * die Silo-App `apps/comments` ohne Mandant — dort ist das Projekt die Grenze,
 * und niemand kann entfernt sein. Die Spec läuft deshalb gegen eine lokale
 * Pool-Bühne (Platform-App + Betreiber-App, siehe docs/referenz/LIVE-BEWEISE.md)
 * und braucht ein Konto, dem dort der Zugang SCHON entzogen wurde:
 *
 *   PW_POOL_URL=http://kunde-a.localhost:3150 \
 *   PW_POOL_ENDPOINT=http://localhost/v1 PW_POOL_PROJECT=account PW_POOL_KEY=… \
 *   PW_POOL_REMOVED_USER_ID=… \
 *   pnpm --filter comments exec playwright test community-removed
 *
 * Die Kontakt-Route ist je Adresse auf 5 Aufrufe je Stunde gebremst; wer die
 * Spec öfter hintereinander fährt, sieht danach den allgemeinen Fehlertext
 * statt Bestätigung oder Wochen-Grenze (Zähler im Prozess: Dev-Server neu
 * starten).
 *
 * Den HTTP-Beweis ohne Browser (samt Anlegen, Entziehen, Glocke, Mail und
 * Rückkehr per Einladung) führt Abschnitt 10 b2 in
 * `packages/onboarding/scripts/verify-site-authz.mjs`.
 */

const poolUrl = process.env.PW_POOL_URL
const endpoint = process.env.PW_POOL_ENDPOINT
const projectId = process.env.PW_POOL_PROJECT
const apiKey = process.env.PW_POOL_KEY
const removedUserId = process.env.PW_POOL_REMOVED_USER_ID
const configured = Boolean(poolUrl && endpoint && projectId && apiKey && removedUserId)

test.describe('Entfernt aus einer Community: nur noch die Hinweisseite', () => {
  test.skip(!configured, 'Keine Pool-Bühne gesetzt (PW_POOL_*) — in der CI gibt es keinen Pool-Mandanten.')

  let users: Users
  let sessionId = ''

  test.beforeEach(async ({ context }) => {
    users = new Users(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const session = await users.createSession({ userId: removedUserId! })
    sessionId = session.$id
    await context.addCookies([{
      name: `a_session_${projectId}`,
      value: session.secret,
      domain: new URL(poolUrl!).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])
  })

  test.afterEach(async () => {
    if (sessionId) await users.deleteSession({ userId: removedUserId!, sessionId }).catch(() => {})
  })

  test('jede Seite führt auf den Hinweis, Inhalte bleiben zu', async ({ page }) => {
    // Haken am handelnden Element, nicht an einem Container eines Layouts:
    // die Hinweisseite hat bewusst KEIN Community-Layout.
    const notice = page.locator('[data-removed-notice]')

    await page.goto(`${poolUrl}/`)
    await expect(notice).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/removed\/?$/)

    // Eine Inhalts-Adresse direkt: derselbe Hinweis statt der Inhalte.
    await page.goto(`${poolUrl}/discussions`)
    await expect(notice).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/removed\/?$/)

    // Die Inhalts-Routen antworten der Sitzung mit dem fachlichen Grund —
    // gemessen im Browser, mit dem Cookie der entfernten Person.
    const read = await page.evaluate(async () => {
      const res = await fetch('/api/comments?targetId=e2e-removed&targetType=verify')
      const body = await res.json().catch(() => ({})) as { reason?: string }
      return { status: res.status, reason: body.reason ?? '' }
    })
    expect(read).toEqual({ status: 403, reason: 'community_removed' })

    // Abmelden bleibt möglich.
    await expect(page.getByRole('button', { name: /sign out|abmelden/i })).toBeVisible()
  })

  test('Nachricht an die Leitung: senden oder die Wochen-Grenze sehen', async ({ page }) => {
    await page.goto(`${poolUrl}/removed`)
    await expect(page.locator('[data-removed-notice]')).toBeVisible({ timeout: 60_000 })
    // Erst nach der Hydration DIESES Teilbaums tippen: vorher landet `fill()`
    // nur im DOM, Vue setzt das Feld beim Übernehmen wieder leer, und der
    // Versand wird nie gerufen (dieselbe Falle wie F10 in embed-write.spec.ts;
    // `__vnode` gibt es im Dev-Build, gegen den die Suite immer fährt).
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-removed-notice]') as (Element & { __vnode?: unknown }) | null
      return Boolean(el && el.__vnode !== undefined)
    }, undefined, { timeout: 60_000 })

    const form = page.locator('[data-removed-contact-form]')
    const sent = page.locator('[data-removed-contact-sent]')
    const limit = page.locator('[data-removed-contact-limit]')

    // Die Spec ist wiederholbar: die Grenze „eine Nachricht je Woche" gilt je
    // Konto, ein zweiter Lauf sieht also den Grenz-Hinweis statt des Formulars
    // oder bekommt ihn als Antwort. Beides ist das richtige Verhalten.
    if (await form.isVisible().catch(() => false)) {
      const message = form.locator('textarea')
      const send = form.getByRole('button', { name: /send message|nachricht senden/i })
      const tooShort = form.getByText(/at least 20 characters|mindestens 20 Zeichen/i)

      // Zu kurz ⇒ Feldmeldung, kein Versand.
      await message.fill('Zu kurz.')
      await send.click()
      await expect(tooShort).toBeVisible()
      await expect(sent).toHaveCount(0)

      // Erst klicken, wenn die Feldmeldung WEG ist: sie verschwindet beim
      // Verlassen des Felds, und ein Klick im selben Augenblick trifft einen
      // Knopf, der gerade verrutscht (im Test gemessen: kein Versand). Ein
      // Mensch tippt länger, als die Prüfung braucht.
      await message.fill('Ich möchte gern verstehen, warum mein Zugang entzogen wurde, und bitte um eine kurze Rückmeldung.')
      await message.blur()
      await expect(tooShort).toBeHidden()
      await send.click()
    }
    await expect(sent.or(limit)).toBeVisible({ timeout: 30_000 })
  })
})
