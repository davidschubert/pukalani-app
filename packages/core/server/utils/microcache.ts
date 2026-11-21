/**
 * Kleiner In-Memory-TTL-Cache für teure, user-agnostische GET-Antworten
 * (Microcaching, OPEN-ITEMS Idee 3). NIEMALS für Antworten mit Session-/
 * User-Daten verwenden — der Cache unterscheidet nicht nach User.
 *
 * ⚠️ In-memory wie rate-limit.ts: reicht für Single-Instanz; Multi-Instanz
 * hätte pro Instanz einen eigenen (harmlos, nur Cache-Effizienz).
 */
const MAX_ENTRIES = 500

export interface Microcache<T> {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
  /**
   * GENAU einen Eintrag verwerfen. Braucht jede Schreibroute, deren neuer Stand
   * sich nicht in einem Wert ausdrücken lässt (sonst würde man ihn einfach neu
   * setzen) — `clear()` wäre dort falsch, weil es die Einträge ALLER anderen
   * Mandanten mitnimmt und deren nächste Anfrage teuer macht.
   */
  delete: (key: string) => void
  clear: () => void
}

/** `maxEntries` nur, wenn die Werte groß sind (ganze HTML-Seiten, Q22). */
export function createMicrocache<T>(ttlMs: number, maxEntries: number = MAX_ENTRIES): Microcache<T> {
  const store = new Map<string, { value: T, expires: number }>()
  return {
    get(key) {
      const hit = store.get(key)
      if (hit && hit.expires > Date.now()) return hit.value
      store.delete(key)
      return undefined
    },
    set(key, value) {
      // Simpler Überlauf-Schutz statt LRU — bei so wenigen Keys ist Leeren billig
      if (store.size >= maxEntries) store.clear()
      store.set(key, { value, expires: Date.now() + ttlMs })
    },
    delete(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}
