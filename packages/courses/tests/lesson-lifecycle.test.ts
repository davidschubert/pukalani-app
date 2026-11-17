import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { runRoute } from './support/courseRouteHarness'
import { removeLessonProgress } from '../server/utils/courseAccess'
import { LESSON_PROGRESS_TABLE, LESSONS_TABLE } from '../shared/types/course'

/**
 * BE-018 — Lektionen eines zurückgezogenen Kurses und Reste gelöschter
 * Lektionen.
 *
 *  - Abschließen verlangt einen VERÖFFENTLICHTEN Kurs, wie das Lesen
 *    (`publishedLessonWithCourse` prüft es jetzt für alle Aufrufer).
 *  - Beim Löschen einer Lektion verschwinden ihre Fortschritts-Zeilen mit —
 *    und nur ihre.
 */

const completeRoute = () => import('../server/api/lessons/[id]/complete.post')
const deleteRoute = () => import('../server/api/lessons/[id].delete')

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('POST /api/lessons/:id/complete — Kurs muss veröffentlicht sein', () => {
  it('Lektion in einem Entwurfs-Kurs: 404 Course not found, keine Fortschritts-Zeile', async () => {
    const run = await runRoute(completeRoute, { who: 'member', params: { id: 'l-in-draft' } })
    expect(run.status).toBe(404)
    expect(run.error).toMatchObject({ statusText: 'Course not found' })
    expect(run.tables.lesson_progress).toEqual([])
  })

  it('Gegenprobe: veröffentlichter Kurs ⇒ 200 und genau eine Fortschritts-Zeile', async () => {
    const run = await runRoute(completeRoute, { who: 'member', params: { id: 'l-pub' } })
    expect(run.status).toBe(200)
    expect(run.tables.lesson_progress).toHaveLength(1)
  })
})

describe('DELETE /api/lessons/:id — Fortschritt der Lektion geht mit', () => {
  function rows(): Record<string, FakeRow[]> {
    return {
      [LESSONS_TABLE]: [
        { $id: 'l-1', courseId: 'c-1', status: 'published', communityId: 'c-a' },
        { $id: 'l-2', courseId: 'c-1', status: 'published', communityId: 'c-a' },
      ],
      [LESSON_PROGRESS_TABLE]: [
        { $id: 'p-1', lessonId: 'l-1', courseId: 'c-1', userId: 'u-a' },
        { $id: 'p-2', lessonId: 'l-1', courseId: 'c-1', userId: 'u-b' },
        { $id: 'p-3', lessonId: 'l-2', courseId: 'c-1', userId: 'u-a' },
      ],
    }
  }

  const globals = {
    requireCommunityPermission: async () => ({ user: { $id: 'u-ed', name: 'Ed' }, actor: 'member' }),
    syncLessonCount: async () => {},
    removeLessonProgress,
  }

  it('genau die Zeilen dieser Lektion sind weg, die fremde bleibt', async () => {
    const door = fakeDoor({ rows: rows() })
    const run = await runDoorRoute(deleteRoute, { door, params: { id: 'l-1' }, globals })

    expect(run.status).toBe(200)
    expect(door.rows[LESSONS_TABLE]!.map(r => r.$id)).toEqual(['l-2'])
    expect(door.rows[LESSON_PROGRESS_TABLE]!.map(r => r.$id)).toEqual(['p-3'])
  })

  it('Aufräumen nach dem Löschen der Lektion, über die Operator-Klinke', async () => {
    const door = fakeDoor({ rows: rows() })
    await runDoorRoute(deleteRoute, { door, params: { id: 'l-1' }, globals })

    const lessonRemoved = door.calls.findIndex(c => c.method === 'remove' && c.table === LESSONS_TABLE)
    const progressCalls = door.calls.filter(c => c.table === LESSON_PROGRESS_TABLE)
    expect(progressCalls.length).toBeGreaterThan(0)
    expect(door.calls.findIndex(c => c.table === LESSON_PROGRESS_TABLE)).toBeGreaterThan(lessonRemoved)
    expect(progressCalls.every(c => c.handle === 'operator')).toBe(true)
  })

  it('best-effort: scheitert das Aufräumen, ist die Lektion trotzdem weg (200) und die Reste stehen im Log', async () => {
    const door = fakeDoor({ rows: rows() })
    const logEvent = vi.fn()
    const brokenDoor = {
      ...door,
      tenantDb: (event: Parameters<typeof door.tenantDb>[0], options?: Parameters<typeof door.tenantDb>[1]) => {
        const handle = door.tenantDb(event, options)
        return {
          ...handle,
          async remove(table: string, id: string, text?: string) {
            if (table === LESSON_PROGRESS_TABLE) throw new Error('down')
            return (handle.remove as (t: string, i: string, x?: string) => Promise<void>)(table, id, text)
          },
        }
      },
    }
    const run = await runDoorRoute(deleteRoute, { door: brokenDoor, params: { id: 'l-1' }, globals: { ...globals, logEvent } })

    expect(run.status).toBe(200)
    expect(door.rows[LESSONS_TABLE]!.map(r => r.$id)).toEqual(['l-2'])
    expect(logEvent).toHaveBeenCalledWith('error', 'courses.lesson_progress_cleanup_failed', { lessonId: 'l-1', remaining: 2 })
  })
})
