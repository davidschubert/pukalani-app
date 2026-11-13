import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORBIDDEN_LESSON_KEYS, FORBIDDEN_PREVIEW_KEYS, runRoute, type Scenario } from './support/courseRouteHarness'

/**
 * SEC-029 — WER SIEHT WAS VON EINEM KURS (Davids Entscheidung 2026-11-12).
 *
 *  1. Übersicht und Vorschau eines VERÖFFENTLICHTEN Kurses sieht jeder, auch
 *     ohne Konto — als ausdrückliche Feldauswahl, nie die rohe Zeile.
 *  2. Lektions-Inhalt, Einschreiben, Fortschritt und Übersetzen nur für
 *     angemeldete MITGLIEDER dieser Community; ein Fremder wird abgewiesen,
 *     BEVOR die Datentür gefragt wird (gleiche Antwort für vorhandene und nicht
 *     vorhandene Ids).
 *  3. Entwürfe sieht außerhalb der Redaktion niemand.
 *
 * Gefahren werden die ECHTEN Handler; die Datentür im Prüfstand bildet den
 * Zielzustand ab, in dem Kurs-Zeilen kein Leserecht mehr tragen.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const listRoute = () => import('../server/api/courses/index.get')
const previewRoute = () => import('../server/api/courses/[slug].get')
const enrollRoute = () => import('../server/api/courses/[slug]/enroll.post')
const lessonRoute = () => import('../server/api/lessons/[id].get')
const completeRoute = () => import('../server/api/lessons/[id]/complete.post')
const lessonTranslateRoute = () => import('../server/api/lessons/[id]/translate.post')
const courseTranslateRoute = () => import('../server/api/courses/[slug]/translate.post')

interface PreviewLike extends Record<string, unknown> {
  lessons?: Array<Record<string, unknown>>
}

function expectPreviewOnly(row: Record<string, unknown>) {
  for (const key of FORBIDDEN_PREVIEW_KEYS) expect(row, key).not.toHaveProperty(key)
}

describe('Übersicht GET /api/courses', () => {
  it('Gast: 200 mit den veröffentlichten Kursen, ohne Entwürfe', async () => {
    const run = await runRoute<{ rows: Array<Record<string, unknown>> }>(listRoute, { who: 'guest' })
    expect(run.status).toBe(200)
    expect(run.result?.rows.map(r => r.$id)).toEqual(['c-pub'])
  })

  it('Gast: nur Vorschau-Felder, enrolled immer false, keine Einschreibungs-Abfrage', async () => {
    const run = await runRoute<{ rows: Array<Record<string, unknown>> }>(listRoute, { who: 'guest' })
    const row = run.result!.rows[0]!
    expectPreviewOnly(row)
    expect(row.enrolled).toBe(false)
    expect(run.reads).not.toContain('enrollments')
  })

  it('angemeldetes Nicht-Mitglied (Pool): 200, enrolled false, keine Einschreibungs-Abfrage', async () => {
    const run = await runRoute<{ rows: Array<Record<string, unknown>> }>(listRoute, { who: 'stranger' })
    expect(run.status).toBe(200)
    expect(run.result?.rows.map(r => r.enrolled)).toEqual([false])
    expect(run.reads).not.toContain('enrollments')
  })

  it('Mitglied: sieht die eigene Einschreibung', async () => {
    const run = await runRoute<{ rows: Array<Record<string, unknown>> }>(listRoute, { who: 'member' })
    expect(run.status).toBe(200)
    expect(run.result?.rows).toHaveLength(1)
    expect(run.result?.rows[0]?.enrolled).toBe(true)
    expectPreviewOnly(run.result!.rows[0]!)
  })
})

describe('Vorschau GET /api/courses/:slug', () => {
  const published: Scenario['params'] = { slug: 'wolken' }

  it('Gast: 200 mit Titel und Gliederung', async () => {
    const run = await runRoute<PreviewLike>(previewRoute, { who: 'guest', params: published })
    expect(run.status).toBe(200)
    expect(run.result?.title).toBe('Wolken lesen')
    expect(run.result?.lessons).toEqual([{ $id: 'l-pub', title: 'Cumulus', order: 0, status: 'published' }])
  })

  it('Gast: keine internen Felder, kein Lektions-Inhalt, keine Lektions-Übersetzungen', async () => {
    const run = await runRoute<PreviewLike>(previewRoute, { who: 'guest', params: published })
    expectPreviewOnly(run.result!)
    for (const lesson of run.result!.lessons ?? []) {
      for (const key of FORBIDDEN_LESSON_KEYS) expect(lesson, key).not.toHaveProperty(key)
    }
  })

  it('Gast: kein Fortschritt und keine Abfrage von Einschreibung oder Fortschritt', async () => {
    const run = await runRoute<PreviewLike>(previewRoute, { who: 'guest', params: published })
    expect(run.result?.enrolled).toBe(false)
    expect(run.result?.completedLessonIds).toEqual([])
    expect(run.result?.completedAt).toBeNull()
    expect(run.reads).not.toContain('enrollments')
    expect(run.reads).not.toContain('lesson_progress')
  })

  it('angemeldetes Nicht-Mitglied: 200, aber enrolled false', async () => {
    const run = await runRoute<PreviewLike>(previewRoute, { who: 'stranger', params: published })
    expect(run.status).toBe(200)
    expect(run.result?.enrolled).toBe(false)
    expect(run.reads).not.toContain('enrollments')
  })

  it('Mitglied: 200 mit eigener Einschreibung', async () => {
    const run = await runRoute<PreviewLike>(previewRoute, { who: 'member', params: published })
    expect(run.status).toBe(200)
    expect(run.result?.enrolled).toBe(true)
    expectPreviewOnly(run.result!)
  })

  it.each(['guest', 'member'] as const)('Entwurf: 404 auch für %s', async (who) => {
    const run = await runRoute<PreviewLike>(previewRoute, { who, params: { slug: 'entwurf' } })
    expect(run.status).toBe(404)
  })
})

describe('Einschreiben POST /api/courses/:slug/enroll', () => {
  const params = { slug: 'wolken' }
  const enrollmentsOf = (tables: Record<string, Array<Record<string, unknown>>>, userId: string) =>
    (tables.enrollments ?? []).filter(r => r.userId === userId && r.courseId === 'c-pub')

  it('Gast: 401, die Datentür bleibt zu', async () => {
    const run = await runRoute(enrollRoute, { who: 'guest', params })
    expect(run.status).toBe(401)
    expect(run.doorCalls).toEqual([])
  })

  it('Nicht-Mitglied bei geschlossener Community: 403 not_a_member, vor der Datentür, keine Zeile', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', params, joinOutcome: 'closed' })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorCalls).toEqual([])
    expect(enrollmentsOf(run.tables, 'u-stranger')).toEqual([])
  })

  it('entzogener Zugang: 403 not_a_member', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', params, joinOutcome: 'removed' })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorCalls).toEqual([])
  })

  it('Naht nicht erreichbar: die Mitgliedschaft entscheidet (fail-closed im Pool)', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', params, joinOutcome: 'unavailable' })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorCalls).toEqual([])
  })

  it('offene Community: das Einschreiben IST der Beitritt — 201, obwohl der Mitgliedschafts-Cache noch nein sagt', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', params, joinOutcome: 'joined' })
    expect(run.status).toBe(201)
    expect(enrollmentsOf(run.tables, 'u-stranger')).toHaveLength(1)
  })

  it('gesperrte Community: 403 community_suspended, ohne Beitritts-Versuch', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', params, joinOutcome: 'joined', suspended: true })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('community_suspended')
    expect(run.joinCalls).toBe(0)
    expect(run.doorCalls).toEqual([])
  })

  it('Mitglied: 201 (idempotent bei bestehender Einschreibung)', async () => {
    const run = await runRoute(enrollRoute, { who: 'member', params })
    expect(run.status).toBe(201)
    expect(enrollmentsOf(run.tables, 'u-member')).toHaveLength(1)
  })

  it('Mitglied: Entwurf ⇒ 404', async () => {
    const run = await runRoute(enrollRoute, { who: 'member', params: { slug: 'entwurf' } })
    expect(run.status).toBe(404)
  })

  it('Silo: angemeldet genügt', async () => {
    const run = await runRoute(enrollRoute, { who: 'stranger', mode: 'silo', params })
    expect(run.status).toBe(201)
  })
})

describe.each([
  ['Lektion lesen GET /api/lessons/:id', lessonRoute, undefined, true],
  // Der Abschluss prüft den Kurs-STATUS bewusst nicht (courseAccess.ts,
  // publishedLessonWithCourse) — unverändert, nicht Teil von SEC-029.
  ['Lektion abschließen POST /api/lessons/:id/complete', completeRoute, undefined, false],
  ['Lektion übersetzen POST /api/lessons/:id/translate', lessonTranslateRoute, { locale: 'de' }, true],
] as const)('%s', (_label, route, body, checksCourseStatus) => {
  it('Gast: 401, die Datentür bleibt zu', async () => {
    const run = await runRoute(route, { who: 'guest', params: { id: 'l-pub' }, body })
    expect(run.status).toBe(401)
    expect(run.doorCalls).toEqual([])
  })

  it('Nicht-Mitglied: 403 not_a_member, BEVOR die Datentür gefragt wird', async () => {
    const run = await runRoute(route, { who: 'stranger', params: { id: 'l-pub' }, body })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorCalls).toEqual([])
    expect(run.aiCalls).toBe(0)
  })

  it('Nicht-Mitglied: dieselbe Antwort für eine Id, die es nicht gibt', async () => {
    const run = await runRoute(route, { who: 'stranger', params: { id: 'gibt-es-nicht' }, body })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
  })

  it('Mitglied: 200', async () => {
    const run = await runRoute(route, { who: 'member', params: { id: 'l-pub' }, body })
    expect(run.status).toBe(200)
  })

  it.runIf(checksCourseStatus)('Mitglied: Lektion eines Entwurfs ⇒ 404', async () => {
    const run = await runRoute(route, { who: 'member', params: { id: 'l-in-draft' }, body })
    expect(run.status).toBe(404)
  })
})

describe('Lektion lesen liefert dem Mitglied den Inhalt', () => {
  it('Inhalt und Video stehen in der Antwort', async () => {
    const run = await runRoute<Record<string, unknown>>(lessonRoute, { who: 'member', params: { id: 'l-pub' } })
    expect(run.result?.content).toBe('Lektionsinhalt Cumulus')
    expect(run.result?.videoUrl).toBe('https://video.example.test/1')
  })
})

describe('Kurs übersetzen POST /api/courses/:slug/translate', () => {
  const body = { locale: 'de' }

  it('Gast: 401, die Datentür bleibt zu', async () => {
    const run = await runRoute(courseTranslateRoute, { who: 'guest', params: { slug: 'wolken' }, body })
    expect(run.status).toBe(401)
    expect(run.doorCalls).toEqual([])
  })

  it('Nicht-Mitglied: 403 not_a_member, BEVOR die Datentür gefragt wird', async () => {
    const run = await runRoute(courseTranslateRoute, { who: 'stranger', params: { slug: 'wolken' }, body })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.doorCalls).toEqual([])
    expect(run.aiCalls).toBe(0)
  })

  it('Mitglied: 200, gelesen über die Operator-Klinke', async () => {
    const run = await runRoute(courseTranslateRoute, { who: 'member', params: { slug: 'wolken' }, body })
    expect(run.status).toBe(200)
    expect(run.aiCalls).toBe(1)
    expect(run.doorCalls.every(call => call.as === 'operator')).toBe(true)
  })

  it('Mitglied: Entwurf ⇒ 404', async () => {
    const run = await runRoute(courseTranslateRoute, { who: 'member', params: { slug: 'entwurf' }, body })
    expect(run.status).toBe(404)
  })
})
