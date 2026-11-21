import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { topicLinkToken } from '../shared/topicLinks'
import { DISCUSSION_LINKS_TABLE, POST_CATEGORIES_TABLE, POSTS_TABLE } from '../shared/types/post'
import { syncTopicLinks, topicLinksForPosts } from '../server/utils/topicLinks'

/**
 * EIN LESEFEHLER LÖSCHT KEINE RÜCKVERWEISE (Bahn 2, Q13-Stelle 2).
 *
 * `syncTopicLinks` ERSETZT den Index einer Quelle. Vorher machte ein
 * Lesefehler (Beiträge oder Kategorien) aus allen Zielen „ungültig" — und der
 * Abgleich entfernte JEDEN vorhandenen Rückverweis. Jetzt wirft er, der
 * Aufrufer fängt, der alte Index bleibt. Beim ANZEIGEN bleibt es fail-soft:
 * ein Lesefehler kostet Verweise, nie den Beitrag.
 */

const TARGET = 'a1b2c3d4e5f6a7b8c9d0'
const SOURCE = 'f0e9d8c7b6a5f4e3d2c1'

let failing = new Set<string>()
let links: Array<{ $id: string, sourceId: string, targetId: string }>
const removed: string[] = []

const db = {
  list: vi.fn(async (table: string) => {
    if (failing.has(table)) throw Object.assign(new Error('down'), { code: 500, type: 'general_unknown' })
    if (table === POSTS_TABLE) return { rows: [{ $id: TARGET, status: 'published', categoryId: 'cat-1', title: 'Ziel', body: 'x' }], total: 1 }
    if (table === POST_CATEGORIES_TABLE) return { rows: [{ $id: 'cat-1', slug: 'allgemein' }], total: 1 }
    if (table === DISCUSSION_LINKS_TABLE) return { rows: links, total: links.length }
    return { rows: [], total: 0 }
  }),
  remove: vi.fn(async (_table: string, id: string) => { removed.push(id) }),
  create: vi.fn(async () => ({})),
}

vi.stubGlobal('tenantDb', () => db)
vi.stubGlobal('logEvent', vi.fn())
vi.spyOn(console, 'warn').mockImplementation(() => {})

const event = { context: {} } as unknown as H3Event
const source = { $id: SOURCE, body: `Siehe ${topicLinkToken(TARGET)}` }

beforeEach(() => {
  failing = new Set()
  removed.length = 0
  links = [{ $id: 'l-1', sourceId: SOURCE, targetId: TARGET }]
  db.create.mockClear()
})

describe('syncTopicLinks bei einem Lesefehler', () => {
  it('Kategorien nicht lesbar ⇒ wirft, der vorhandene Rückverweis bleibt', async () => {
    failing = new Set([POST_CATEGORIES_TABLE])
    await expect(syncTopicLinks(event, source)).rejects.toMatchObject({ code: 500 })
    expect(removed).toEqual([])
  })

  it('Beiträge nicht lesbar ⇒ wirft, der vorhandene Rückverweis bleibt', async () => {
    failing = new Set([POSTS_TABLE])
    await expect(syncTopicLinks(event, source)).rejects.toMatchObject({ code: 500 })
    expect(removed).toEqual([])
  })

  it('vorhandene Index-Zeilen nicht lesbar ⇒ wirft, nichts angelegt', async () => {
    failing = new Set([DISCUSSION_LINKS_TABLE])
    await expect(syncTopicLinks(event, source)).rejects.toMatchObject({ code: 500 })
    expect(db.create).not.toHaveBeenCalled()
  })

  it('Gegenprobe: Verweis aus dem Text entfernt ⇒ der Rückverweis geht', async () => {
    await expect(syncTopicLinks(event, { $id: SOURCE, body: 'ohne Verweis' })).resolves.toEqual({ added: 0, removed: 1 })
    expect(removed).toEqual(['l-1'])
  })

  it('Gegenprobe: Verweis steht ⇒ nichts entfernt', async () => {
    await expect(syncTopicLinks(event, source)).resolves.toEqual({ added: 0, removed: 0 })
  })
})

describe('Anzeige bleibt fail-soft', () => {
  it('Kategorien nicht lesbar ⇒ Beitrag ohne Verweis, kein Fehler', async () => {
    failing = new Set([POST_CATEGORIES_TABLE])
    await expect(topicLinksForPosts(event, [source])).resolves.toEqual(new Map())
  })
})
