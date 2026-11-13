import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBroadReadPermission, onlyOwnUserReads, splitBroadReads } from '../scripts/lib/broadReadPermissions'
import { courseJoinVerdict, requireCourseMemberJoining } from '../server/utils/courseMembership'
import { requireCommunityParticipant } from '../../core/server/utils/communityParticipation'
import { toCoursePreview, toLessonSummary } from '../shared/coursePreview'
import type { CourseRow, LessonRow } from '../shared/types/course'

/**
 * SEC-029 — die puren Teile und die Wächter am Quelltext.
 *
 * Das Verhalten der Routen prüft `course-routes-membership.test.ts`; hier
 * steht, was ohne Route gilt: die Feldauswahl der Vorschau, die Entscheidung
 * nach einem Beitritt, die Regel der Migration courses-008 und zwei
 * Quelltext-Zusagen, die kein Laufzeit-Test zuverlässig sieht.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const course = {
  $id: 'c1', $sequence: 7, $tableId: 'courses', $databaseId: 'db',
  $createdAt: '2026-11-01T00:00:00.000Z', $updatedAt: '2026-11-02T00:00:00.000Z',
  $permissions: ['read("users")'],
  title: 'T', slug: 's', description: 'D', status: 'published', access: 'paid',
  entitlementProduct: 'paidCourses', authorId: 'u1', authorName: 'A', lessonCount: 3,
  translations: '{"de":{"body":"x"}}', communityId: 't-a',
} as CourseRow & { communityId: string }

describe('Vorschau-Feldauswahl', () => {
  it('liefert GENAU die freigegebenen Felder', () => {
    expect(Object.keys(toCoursePreview(course)).sort()).toEqual([
      '$createdAt', '$id', '$updatedAt', 'access', 'authorName', 'description',
      'lessonCount', 'slug', 'status', 'title', 'translations',
    ])
  })

  it('ein neues Feld an der Zeile wird nicht von selbst öffentlich', () => {
    const extended = { ...course, secretField: 'intern' } as CourseRow
    expect(toCoursePreview(extended)).not.toHaveProperty('secretField')
  })

  it('fehlende Übersetzungen werden zu einem leeren Cache', () => {
    const { translations: _drop, ...withoutTranslations } = course
    expect(toCoursePreview(withoutTranslations as CourseRow).translations).toBe('')
  })

  it('Gliederung: Titel und Reihenfolge, nie Inhalt, Video oder Übersetzungen', () => {
    const lesson = {
      $id: 'l1', $sequence: 1, $tableId: 'lessons', $databaseId: 'db', $createdAt: '', $updatedAt: '', $permissions: [],
      courseId: 'c1', title: 'L', order: 2, content: 'Inhalt', videoUrl: 'https://v', status: 'published', translations: '{}',
    } as LessonRow
    expect(toLessonSummary(lesson)).toEqual({ $id: 'l1', title: 'L', order: 2, status: 'published' })
  })
})

describe('Einschreiben: Ausgang des Beitritts', () => {
  it.each([
    ['joined', 'allow'],
    ['member', 'allow'],
    ['closed', 'deny'],
    ['removed', 'deny'],
    ['unavailable', 'ask-membership'],
  ] as const)('%s ⇒ %s', (outcome, verdict) => {
    expect(courseJoinVerdict(outcome)).toBe(verdict)
  })
})

describe('requireCourseMemberJoining', () => {
  function stub(options: { user?: { $id: string }, suspension?: string, outcome?: string, member?: boolean }) {
    const calls: string[] = []
    vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
    vi.stubGlobal('useTenant', () => ({ mode: 'pool', tenantId: 't-a', communityId: 'c-a', suspension: options.suspension ?? '' }))
    // Seit SEC-030 delegiert das Einschreiben an die EINE Core-Wache.
    vi.stubGlobal('requireCommunityParticipant', requireCommunityParticipant)
    vi.stubGlobal('joinCommunity', async () => {
      calls.push('join')
      return options.outcome ?? 'unavailable'
    })
    vi.stubGlobal('requireCommunityMembership', async () => {
      calls.push('membership')
      if (!options.member) throw Object.assign(new Error('Not a member'), { status: 403, data: { code: 'not_a_member' } })
      return options.user
    })
    const event = { context: { user: options.user } }
    return { calls, run: () => requireCourseMemberJoining(event as never) }
  }

  it('ohne Anmeldung: 401, kein Beitritt', async () => {
    const { calls, run } = stub({})
    await expect(run()).rejects.toMatchObject({ status: 401 })
    expect(calls).toEqual([])
  })

  it('gesperrte Community: 403 community_suspended, BEVOR beigetreten wird', async () => {
    const { calls, run } = stub({ user: { $id: 'u' }, suspension: 'billing', outcome: 'joined' })
    await expect(run()).rejects.toMatchObject({ status: 403, data: { code: 'community_suspended' } })
    expect(calls).toEqual([])
  })

  it('gewährter Beitritt zählt, auch wenn die Mitgliedschaft noch nein sagt', async () => {
    const { calls, run } = stub({ user: { $id: 'u' }, outcome: 'joined', member: false })
    await expect(run()).resolves.toEqual({ $id: 'u' })
    expect(calls).toEqual(['join'])
  })

  it('geschlossene Community: 403 not_a_member ohne Rückfrage', async () => {
    const { calls, run } = stub({ user: { $id: 'u' }, outcome: 'closed', member: true })
    await expect(run()).rejects.toMatchObject({ status: 403, data: { code: 'not_a_member' } })
    expect(calls).toEqual(['join'])
  })

  it('Naht nicht erreichbar: die Mitgliedschaft entscheidet', async () => {
    const yes = stub({ user: { $id: 'u' }, outcome: 'unavailable', member: true })
    await expect(yes.run()).resolves.toEqual({ $id: 'u' })
    expect(yes.calls).toEqual(['join', 'membership'])
    const no = stub({ user: { $id: 'u' }, outcome: 'unavailable', member: false })
    await expect(no.run()).rejects.toMatchObject({ status: 403 })
  })
})

describe('Regel der Migration courses-008', () => {
  it.each([
    'read("users")', 'read("users/verified")', 'read("any")', 'read("guests")', 'read("label:c-a")',
  ])('%s fällt', (permission) => {
    expect(isBroadReadPermission(permission)).toBe(true)
  })

  it.each([
    'read("user:u1")', 'read("team:t1")', 'update("users")', 'delete("label:c-a")', 'write("any")',
  ])('%s bleibt', (permission) => {
    expect(isBroadReadPermission(permission)).toBe(false)
  })

  it('teilt eine Zeile und lässt alles Übrige in Reihenfolge stehen', () => {
    expect(splitBroadReads(['update("user:u1")', 'read("users")', 'read("user:u1")', 'read("label:x")'])).toEqual({
      kept: ['update("user:u1")', 'read("user:u1")'],
      removed: ['read("users")', 'read("label:x")'],
    })
  })

  it('eine Zeile ohne breite Rechte ist im Zielzustand', () => {
    expect(splitBroadReads([]).removed).toEqual([])
    expect(splitBroadReads(['read("user:u1")']).removed).toEqual([])
  })

  it('Einschreibungen: höchstens read(user:…)', () => {
    expect(onlyOwnUserReads(['read("user:u1")'])).toBe(true)
    expect(onlyOwnUserReads([])).toBe(true)
    expect(onlyOwnUserReads(['read("user:u1")', 'read("users")'])).toBe(false)
    expect(onlyOwnUserReads(['update("user:u1")'])).toBe(false)
  })
})

/**
 * WÄCHTER AM QUELLTEXT: das Modell „nur Server-Zugriff" hält nur, solange
 * niemand einer Kurs-Zeile wieder ein Leserecht gibt oder eine Route über den
 * Session-Client liest — nach courses-008 sähe diese Route schlicht nichts.
 */
const serverRoot = fileURLToPath(new URL('../server/', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : []
  })
}

const sources = sourceFiles(serverRoot).map(path => [path.slice(serverRoot.length), readFileSync(path, 'utf8')] as const)

describe('Wächter: Kurs-Zeilen tragen kein Leserecht', () => {
  it('findet die Server-Dateien', () => {
    expect(sources.length).toBeGreaterThan(15)
  })

  it.each(sources)('%s setzt kein breites Leserecht', (_path, source) => {
    expect(source).not.toMatch(/Role\.(users|any|guests|label)\(/)
    expect(source).not.toContain('withPublishedRead')
    expect(source).not.toContain('registerAudienceRepermissionTable')
  })

  it('Permission.read steht nur in ownRowRead (eigene Zeile)', () => {
    const hits = sources.flatMap(([path, source]) =>
      source.split('\n').filter(line => line.includes('Permission.read(')).map(line => `${path}: ${line.trim()}`))
    expect(hits).toEqual([
      'utils/courseAccess.ts: export const ownRowRead = (userId: string): string[] => [Permission.read(Role.user(userId))]',
    ])
  })

  it('ein neuer Kurs entsteht ohne Rechte', () => {
    const source = sources.find(([path]) => path === 'api/courses/index.post.ts')?.[1] ?? ''
    expect(source).toContain('permissions: [],')
  })
})

describe('Wächter: keine Route liest über die Mitglieder-Klinke', () => {
  it.each(sources)('%s öffnet die Datentür nicht ohne Klinke', (_path, source) => {
    expect(source).not.toMatch(/tenantDb\(event\)/)
    expect(source).not.toContain('createSessionClient')
  })
})
