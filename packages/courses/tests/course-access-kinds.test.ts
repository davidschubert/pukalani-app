import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCourseEditSchema, createCourseSchema } from '../schemas/course'
import { toCoursePreview, toManagedCourse } from '../shared/coursePreview'
import { COURSE_ACCESS, normalizeCourseAccess, type CourseRow } from '../shared/types/course'
import { runRoute } from './support/courseRouteHarness'

/**
 * ZWEI ZUGANGSARTEN STATT DREI (KU1, Davids Entscheidung 2026-11-16).
 *
 * „Kostenlos" und „Mitglieder" verlangten beide die Mitgliedschaft und sind
 * EINE Zugangsart geworden. Eine Migration gibt es bewusst nicht: Kurse aus
 * der Zeit davor tragen in der Spalte weiter `'free'`. Diese Datei hält fest,
 * dass davon nach außen nichts mehr sichtbar wird — weder in einer Antwort
 * noch als wählbare Auswahl — und dass ein Bestands-Kurs sich genauso verhält
 * wie ein neuer.
 *
 * Der Prüfstand sät seine Kurse absichtlich mit dem ALTEN Wert
 * (`support/courseRouteHarness.ts`): jede Route hier läuft gegen Bestand.
 */

const base = {
  $id: 'c-1', $createdAt: '2026-11-01T00:00:00.000Z', $updatedAt: '2026-11-02T00:00:00.000Z',
  title: 'Wolken lesen', slug: 'wolken', description: 'Ein Kurs.', status: 'published',
  entitlementProduct: null, authorId: 'u-1', authorName: 'Autorin', lessonCount: 1,
} as unknown as CourseRow

describe('Die eine Lese-Regel', () => {
  it('kennt genau zwei Zugangsarten', () => {
    expect([...COURSE_ACCESS]).toEqual(['members', 'paid'])
  })

  it('liest den alten Wert und alles Unbekannte als „Mitglieder", nur paid als paid', () => {
    expect(normalizeCourseAccess('free')).toBe('members')
    expect(normalizeCourseAccess('members')).toBe('members')
    expect(normalizeCourseAccess('')).toBe('members')
    expect(normalizeCourseAccess(undefined)).toBe('members')
    expect(normalizeCourseAccess('paid')).toBe('paid')
  })

  it('gibt in Vorschau und Verwaltung nie den alten Wert heraus', () => {
    const legacy = { ...base, access: 'free' } as CourseRow
    expect(toCoursePreview(legacy).access).toBe('members')
    expect(toManagedCourse(legacy).access).toBe('members')
    expect(toManagedCourse({ ...base, access: 'paid' } as CourseRow).access).toBe('paid')
    // Die Zeile selbst bleibt unberührt — umgeschrieben wird nur die Antwort.
    expect(legacy.access).toBe('free')
  })
})

describe('Das Schema nimmt den alten Wert an und speichert den neuen', () => {
  const input = { title: 'Theming 101', slug: 'theming-101', description: 'Grundlagen.' }

  it('Anlegen: free wird zu members', () => {
    const parsed = createCourseSchema().parse({ ...input, access: 'free' })
    expect(parsed.access).toBe('members')
    expect(createCourseSchema().parse({ ...input, access: 'members' }).access).toBe('members')
  })

  it('Ändern: free wird zu members, fehlend bleibt fehlend', () => {
    expect(createCourseEditSchema().parse({ access: 'free' }).access).toBe('members')
    expect(createCourseEditSchema().parse({ title: 'Neu' }).access).toBeUndefined()
  })

  it('lehnt weiter ab, was es nie gab', () => {
    expect(createCourseSchema().safeParse({ ...input, access: 'vip' }).success).toBe(false)
  })
})

describe('Die Routen gegen einen Bestands-Kurs (Spalte trägt noch free)', () => {
  beforeEach(() => {
    const manager = { $id: 'u-member', name: 'Redaktion', labels: ['c-a'] }
    vi.stubGlobal('requireCommunityPermission', async () => ({ user: manager, actor: 'member' }))
    vi.stubGlobal('assertPoolWriteQuota', async () => {})
  })

  it('öffentliche Liste und Vorschau nennen „members"', async () => {
    const list = await runRoute<{ rows: Array<{ slug: string, access: string }> }>(
      () => import('../server/api/courses/index.get'), { who: 'guest' })
    expect(list.status).toBe(200)
    expect(list.result?.rows.map(row => row.access)).toEqual(['members'])

    const preview = await runRoute<{ access: string }>(
      () => import('../server/api/courses/[slug].get'), { who: 'guest', params: { slug: 'wolken' } })
    expect(preview.result?.access).toBe('members')
  })

  it('die Verwaltung zeigt den Bestand ebenfalls als „members"', async () => {
    const list = await runRoute<{ rows: Array<{ access: string }> }>(
      () => import('../server/api/courses/manage.get'), { who: 'member' })
    expect(list.result?.rows.map(row => row.access)).toEqual(['members', 'members'])
    // Gegenprobe: in der Tabelle steht weiter der alte Wert.
    expect(list.tables.courses?.map(row => row.access)).toEqual(['free', 'free'])

    const detail = await runRoute<{ access: string }>(
      () => import('../server/api/courses/[slug]/manage.get'), { who: 'member', params: { slug: 'c-pub' } })
    expect(detail.result?.access).toBe('members')
  })

  it('Ändern ohne Zugangs-Angabe lässt die Spalte in Ruhe und antwortet mit „members"', async () => {
    const run = await runRoute<{ access: string, title: string }>(
      () => import('../server/api/courses/[slug]/index.patch'),
      { who: 'member', params: { slug: 'c-pub' }, body: { title: 'Neuer Titel' } })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ title: 'Neuer Titel', access: 'members' })
    expect(run.tables.courses?.find(row => row.$id === 'c-pub')?.access).toBe('free')
  })

  it('Anlegen mit dem alten Wert speichert „members"', async () => {
    const run = await runRoute<{ $id: string, access: string }>(
      () => import('../server/api/courses/index.post'),
      { who: 'member', body: { title: 'Neu', slug: 'neu-kurs', description: 'Ein neuer Kurs.', access: 'free' } })
    expect(run.status).toBe(201)
    expect(run.result?.access).toBe('members')
    expect(run.tables.courses?.find(row => row.$id === run.result?.$id)?.access).toBe('members')
  })

  it('Einschreiben in einen Bestands-Kurs braucht nur die Mitgliedschaft', async () => {
    const stranger = await runRoute(
      () => import('../server/api/courses/[slug]/enroll.post'), { who: 'stranger', params: { slug: 'wolken' } })
    expect(stranger.error?.status).toBe(403)
    expect(stranger.error?.data?.code).toBe('not_a_member')
  })
})
