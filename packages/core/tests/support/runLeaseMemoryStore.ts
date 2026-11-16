import type {
  RunLeaseCreateData,
  RunLeaseRow,
  RunLeaseStore,
  RunLeaseUpdateData,
} from '../../server/utils/runLease'

/**
 * EIN LAUF-SPERREN-STORE IM SPEICHER (GA1 P18) — für jeden Test, der die
 * echte Sperr-Logik (`core/server/utils/runLease.ts`) ohne Appwrite fahren
 * will: der Test des Fundaments und die Routen-Tests der Layer
 * (market `run.post.ts`).
 *
 * Er verhält sich an der EINEN Stelle wie Appwrite, auf die es ankommt:
 * `create` mit einer vorhandenen Id ist ein Konflikt (`isConflict`). Mit
 * `gate` lässt sich `latest` aufhalten, NACHDEM es gelesen hat — so sehen
 * mehrere Starter denselben Vorgänger, und das Rennen ist echt.
 */

export class ConflictError extends Error {}

export interface MemoryStore extends RunLeaseStore {
  rows: Map<string, RunLeaseRow>
  calls: { create: number, update: number, remove: number }
  /** Wartet `latest` auf dieses Tor, bevor es liest-und-antwortet. */
  gate: Promise<void> | null
  failLatest: boolean
  failUpdate: boolean
  failRemove: boolean
}

export function memoryStore(): MemoryStore {
  const store: MemoryStore = {
    rows: new Map(),
    calls: { create: 0, update: 0, remove: 0 },
    gate: null,
    failLatest: false,
    failUpdate: false,
    failRemove: false,
    async latest(scope, subject) {
      // Erst lesen, DANN warten: so sehen alle Starter denselben Stand.
      const found = [...store.rows.values()]
        .filter(row => row.scope === scope && row.subject === subject)
        .sort((a, b) => b.seq - a.seq)[0] ?? null
      if (store.gate) await store.gate
      if (store.failLatest) throw new Error('read failed')
      return found ? { ...found } : null
    },
    async create(id: string, data: RunLeaseCreateData) {
      store.calls.create++
      await Promise.resolve()
      if (store.rows.has(id)) throw new ConflictError('exists')
      const row: RunLeaseRow = { $id: id, ...data, finishedAt: '', outcome: '' }
      store.rows.set(id, row)
      return { ...row }
    },
    async update(id: string, data: RunLeaseUpdateData) {
      store.calls.update++
      if (store.failUpdate) throw new Error('update failed')
      const row = store.rows.get(id)
      if (!row) throw new Error('missing')
      Object.assign(row, data)
      return { ...row }
    },
    async remove(id: string) {
      store.calls.remove++
      if (store.failRemove) throw new Error('remove failed')
      store.rows.delete(id)
    },
    isConflict(error) {
      return error instanceof ConflictError
    },
  }
  return store
}
