import { test, expect } from '@playwright/test'
import { Client, ID, TablesDB } from 'node-appwrite'

/**
 * Kurs-Vorschau für Gäste (SEC-029, 2026-11-13).
 *
 * Übersicht und Vorschau eines veröffentlichten Kurses sind öffentlich; der
 * Lektions-INHALT nicht. Hier im Silo gilt „angemeldet = Mitglied", deshalb
 * prüft die Spec die Gast-Seite: Galerie und Vorschau rendern ohne Konto, der
 * Knopf führt zur Anmeldung mit Rücksprung, die Lektions-Route antwortet 401,
 * und die Vorschau-Antwort der API trägt keinen Lektions-Inhalt.
 *
 * Env-gated wie session-revoke.spec.ts: Kurs und Lektion entstehen per
 * Runtime-Key direkt in der Datenbank (ein veröffentlichter Kurs ohne
 * Leserecht — der Zielzustand nach courses-008) und werden am Ende gelöscht.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const configured = Boolean(endpoint && projectId && databaseId && apiKey)

const LESSON_CONTENT = 'Nur für Teilnehmende: der Inhalt dieser Lektion.'

test.describe('Kurs-Vorschau für Gäste (SEC-029)', () => {
  test.skip(!configured, 'Appwrite-Runtime-Key nicht gesetzt (.env) — Kurs-Vorschau-E2E übersprungen.')

  let tablesDB: TablesDB
  const slug = `e2e-vorschau-${Date.now().toString(36)}`
  const title = `E2E Vorschau ${slug}`
  let courseId = ''
  let lessonId = ''

  test.beforeAll(async () => {
    tablesDB = new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    const course = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: 'courses',
      rowId: ID.unique(),
      data: {
        title, slug, description: 'Ein öffentlich sichtbarer Kurs.', status: 'published', access: 'free',
        entitlementProduct: null, authorId: 'e2e-author', authorName: 'E2E', lessonCount: 1,
      },
      permissions: [],
    })
    courseId = course.$id
    const lesson = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: 'lessons',
      rowId: ID.unique(),
      data: {
        courseId, title: 'Erste Lektion', order: 0, content: LESSON_CONTENT,
        videoUrl: 'https://video.example.test/e2e', status: 'published',
      },
      permissions: [],
    })
    lessonId = lesson.$id
  })

  test.afterAll(async () => {
    if (lessonId) await tablesDB.deleteRow({ databaseId: databaseId!, tableId: 'lessons', rowId: lessonId }).catch(() => {})
    if (courseId) await tablesDB.deleteRow({ databaseId: databaseId!, tableId: 'courses', rowId: courseId }).catch(() => {})
  })

  test('ein Gast sieht die Galerie mit dem Kurs', async ({ page }) => {
    await page.goto('/courses')
    await expect(page.locator(`[data-course-card="${slug}"]`)).toBeVisible({ timeout: 60_000 })
  })

  test('ein Gast sieht die Vorschau, der Knopf zeigt auf die Anmeldung', async ({ page }) => {
    await page.goto(`/courses/${slug}`)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('lesson-list')).toContainText('Erste Lektion')
    await expect(page.getByTestId('enroll-button')).toHaveCount(0)

    // Das ZIEL des Knopfs prüfen, nicht den Klick: die Login-Seite kompiliert
    // im Dev-Server beim ersten Zugriff bis zu 30 s (Kaltstart), und was sie
    // mit `redirect` tut, belegen die Auth-Specs.
    const href = await page.getByTestId('course-sign-in').getAttribute('href')
    const target = new URL(href ?? '', 'http://localhost')
    expect(target.pathname).toBe('/login')
    expect(target.searchParams.get('redirect')).toBe(`/courses/${slug}`)
  })

  test('die Lektion antwortet einem Gast 401', async ({ request }) => {
    const res = await request.get(`/api/lessons/${lessonId}`)
    expect(res.status()).toBe(401)
  })

  test('die Vorschau-Antwort trägt keinen Lektions-Inhalt und keine internen Felder', async ({ request }) => {
    const res = await request.get(`/api/courses/${slug}`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown> & { lessons: Array<Record<string, unknown>> }
    expect(body.title).toBe(title)
    expect(body.enrolled).toBe(false)
    for (const key of ['authorId', 'communityId', 'entitlementProduct', '$permissions']) {
      expect(body, key).not.toHaveProperty(key)
    }
    expect(body.lessons).toEqual([{ $id: lessonId, title: 'Erste Lektion', order: 0, status: 'published' }])
    expect(JSON.stringify(body)).not.toContain(LESSON_CONTENT)
  })
})
