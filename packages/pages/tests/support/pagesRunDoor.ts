import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { PAGES_RUNS_TABLE } from '../../shared/types/page'

/**
 * EINE NACHGEBAUTE DATENTÜR FÜR `pages_runs` (LL1 d) — so viel Appwrite, wie
 * die Lauf-Sperre braucht, und an den Stellen genau so streng:
 *  - `create` mit einer vorhandenen Id ⇒ `AppwriteException` 409 (das ist die
 *    Sperre; `doorFake.ts` vergibt Ids selbst und kennt keinen Konflikt);
 *  - `list` filtert nach `equal`, sortiert nach `orderDesc`, kürzt auf `limit`
 *    und hängt — wie `scopeQuery` — den Mandanten an;
 *  - `update`/`remove` belegen die Zugehörigkeit (fremde oder fehlende Zeile
 *    ⇒ 404, wie die Tür);
 *  - mit `gate` wartet `list` NACH dem Lesen, damit gleichzeitige Starter
 *    denselben Vorgänger sehen und das Rennen echt ist;
 *  - `missing` stellt eine Instanz ohne pages-007 nach (404 der Tabelle).
 * Jede andere Tabelle wirft: die Übersetzung fasst die Seiten-Zeilen nicht an.
 */

export type RunRow = Record<string, unknown> & { $id: string, communityId: string }

export interface PagesRunDoor {
  rows: RunRow[]
  /** Rechte, mit denen Zeilen angelegt wurden (je Anlegen ein Eintrag). */
  createdPermissions: unknown[]
  opens: { as?: string, actor?: string, community: string }[]
  gate: Promise<void> | null
  missing: boolean
  /** Lässt das n-te `update` (1-basiert) scheitern. */
  failUpdateAt: number | null
  updates: number
  door: (event: H3Event, options?: { as?: string, actor?: string }) => unknown
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(queries: string[] = []): ParsedQuery[] {
  return queries.map(raw => JSON.parse(raw) as ParsedQuery)
}

function notFound(): AppwriteException {
  return new AppwriteException('Row not found', 404, 'row_not_found')
}

/** `community`: der Mandant, für den die Tür geöffnet wird (Standard: der der Probe). */
export function pagesRunDoor(options: { community?: () => string } = {}): PagesRunDoor {
  const state: PagesRunDoor = {
    rows: [],
    createdPermissions: [],
    opens: [],
    gate: null,
    missing: false,
    failUpdateAt: null,
    updates: 0,
    door: (_event, open) => {
      const community = options.community?.() ?? 'c-a'
      state.opens.push({ as: open?.as, actor: open?.actor, community })
      const only = (table: string) => {
        if (table !== PAGES_RUNS_TABLE) throw new Error(`unerwartete Tabelle ${table}`)
        if (state.missing) throw new AppwriteException('Table not found', 404, 'table_not_found')
      }
      const own = (id: string) => {
        const row = state.rows.find(r => r.$id === id && r.communityId === community)
        if (!row) throw notFound()
        return row
      }
      return {
        async list(table: string, queries?: string[]) {
          only(table)
          const parsed = parse(queries)
          let found = state.rows.filter(row => row.communityId === community)
          for (const q of parsed) {
            if (q.method === 'equal' && q.attribute) found = found.filter(row => (q.values ?? []).includes(row[q.attribute!]))
          }
          const order = parsed.find(q => q.method === 'orderDesc')
          if (order?.attribute) found = [...found].sort((a, b) => Number(b[order.attribute!]) - Number(a[order.attribute!]))
          const limit = parsed.find(q => q.method === 'limit')
          if (limit) found = found.slice(0, Number(limit.values?.[0] ?? 25))
          const copy = found.map(row => ({ ...row }))
          if (state.gate) await state.gate
          return { rows: copy, total: copy.length }
        },
        async create(table: string, data: Record<string, unknown>, opts: { rowId?: string, permissions?: unknown } = {}) {
          only(table)
          await Promise.resolve()
          const id = opts.rowId ?? `auto-${state.rows.length + 1}`
          if (state.rows.some(r => r.$id === id)) throw new AppwriteException('Row already exists', 409, 'row_already_exists')
          state.createdPermissions.push(opts.permissions)
          const row: RunRow = { finishedAt: '', outcome: '', result: '', ...data, $id: id, communityId: community }
          state.rows.push(row)
          return { ...row }
        },
        async update(table: string, id: string, data: Record<string, unknown>) {
          only(table)
          state.updates++
          if (state.failUpdateAt !== null && state.updates === state.failUpdateAt) throw new Error('update failed')
          const row = own(id)
          Object.assign(row, data)
          return { ...row }
        },
        async remove(table: string, id: string) {
          only(table)
          const row = own(id)
          state.rows = state.rows.filter(r => r !== row)
        },
      }
    },
  }
  return state
}
