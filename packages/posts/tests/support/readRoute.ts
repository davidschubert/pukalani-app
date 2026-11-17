import { runDoorRoute, type DoorCall, type FakeDoor, type FakeRow, type RouteRun } from '../../../core/tests/support/doorFake'
import type { Who } from '../../../core/tests/support/participationHarness'

/**
 * LESENDE ROUTEN DER BEITRÄGE AUSFÜHREN (P27, OPS-009).
 *
 * Eine dünne Hülle um `runDoorRoute` (core): dieselbe Welt, dieselbe
 * nachgebaute Datentür, dazu nur die Technik, die lesende Routen zusätzlich
 * brauchen (Query-Parameter, Header). Regeln (wer darf was) werden hier NICHT
 * nachgebildet — die Sichtbarkeit einer Zeile entscheidet allein das
 * Leserecht der Tür (`readable`), genau wie die Row-Permissions beim
 * Session-Client.
 */

export interface ReadProbe {
  who: Who
  door: FakeDoor
  params?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
  globals?: Record<string, unknown>
}

export function runRead(load: () => Promise<{ default: unknown }>, probe: ReadProbe): Promise<RouteRun> {
  const query = probe.query ?? {}
  return runDoorRoute(load, {
    who: probe.who,
    door: probe.door,
    params: probe.params,
    body: probe.body,
    globals: {
      getQuery: () => query,
      getValidatedQuery: async (_e: unknown, parse: (q: unknown) => unknown) => parse(query),
      setHeader: () => {},
      ...probe.globals,
    },
  })
}

/** Wurde ausschließlich über die Mitglieder-Klinke zugegriffen? */
export function memberHandleOnly(calls: readonly DoorCall[]): boolean {
  return calls.length > 0 && calls.every(call => call.handle === 'member')
}

/** Zugriffe über die Operator-Klinke (für Zusagen „nur diese Tabelle"). */
export function operatorCalls(calls: readonly DoorCall[]): DoorCall[] {
  return calls.filter(call => call.handle === 'operator')
}

export const CATEGORY_ID = 'cat-1'

/** Eine aktive Kategorie. */
export function category(id = CATEGORY_ID, slug = 'hilfe'): FakeRow {
  return { $id: id, name: 'Hilfe', slug, description: '', sortOrder: 0, active: true, translations: '' }
}

/** Ein veröffentlichtes Thema in `categoryId`. */
export function topic(id: string, authorId: string, categoryId = CATEGORY_ID): FakeRow {
  return {
    $id: id,
    authorId,
    authorName: 'Autorin',
    status: 'published',
    type: 'post',
    title: `Titel ${id}`,
    body: 'Text',
    categoryId,
    score: 0,
    pinned: false,
    closed: false,
    solved: false,
    translations: '',
    publishedAt: '2026-11-10T00:00:00.000Z',
    lastActivityAt: '2026-11-10T00:00:00.000Z',
    $createdAt: '2026-11-10T00:00:00.000Z',
  }
}

/** Leserecht wie bei Row-Permissions: die genannten Zeilen sieht die Mitglieder-Klinke nicht. */
export function hiddenRows(...ids: string[]): (table: string, row: FakeRow) => boolean {
  return (_table, row) => !ids.includes(row.$id)
}
