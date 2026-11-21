/**
 * Anmelde-Merker (Q12, PERF-003; Davids Entscheidung B3 vom 2026-11-21).
 *
 * WARUM: Beim Rendern einer Seite ruft Nuxt die eigenen `/api`-Routen auf, und
 * jeder dieser Aufrufe läuft wieder durch `02.auth.ts`. Ohne Merker fragte der
 * Server je Seitenaufbau bis zu dreizehnmal bei Appwrite, wer die Person ist.
 *
 * DIE REGELN (jede davon hat einen Test in `core/tests/sessionAccountMemo.test.ts`):
 *  1. SCHLÜSSEL IST DIE SITZUNG SELBST — der Aufrufer reicht einen Hash aus
 *     Projekt, Mandant und Sitzungs-Geheimnis herein (`sessionMemoKey`), nie
 *     den Wert, nie nur Host oder Konto-Id. Zwei Sitzungen teilen nie einen
 *     Eintrag, dieselbe Sitzung auf zwei Mandanten auch nicht.
 *  2. HÖCHSTENS `ttlMs` (5 s, B3): so lange wirkt eine Sitzung nach, die ein
 *     ANDERER Prozess (oder Appwrite direkt) widerrufen hat.
 *  3. NUR IM SPEICHER, BEGRENZTE GRÖSSE: voll ⇒ erst Abgelaufene, dann die
 *     ältesten Einträge raus.
 *  4. GLEICHZEITIGE ANFRAGEN DERSELBEN SITZUNG TEILEN SICH EINE ABFRAGE.
 *  5. FEHLER WERDEN NICHT GEMERKT — und eine fehlgeschlagene Abfrage räumt den
 *     alten Eintrag (eine Sitzung, die Appwrite gerade abgelehnt hat, gilt ab
 *     da nicht mehr, auch nicht aus dem Merker).
 *  6. RÄUMEN (`forgetKey`, `forgetUser`) wirkt sofort und auch auf Abfragen,
 *     die beim Räumen schon unterwegs waren: deren Ergebnis wird nicht mehr
 *     gemerkt (Epoche), und neue Aufrufer hängen sich nicht mehr an sie an.
 *  7. JEDER TREFFER IST EINE KOPIE: eine Route, die ihr `context.user`
 *     verändert, verändert nicht den Eintrag der nächsten Anfrage.
 *
 * PUR (ohne Nuxt/h3): Uhr und Abfrage kommen von außen, damit die Tests die
 * Zeit vorstellen können. Die Server-Anbindung steht in
 * `core/server/utils/sessionAccount.ts`.
 */

export interface SessionAccountMemoOptions {
  /** Wie lange ein Ergebnis gilt (ms). B3: 5000. */
  ttlMs: number
  /** Obergrenze der Einträge. */
  maxEntries: number
  /** Uhr (Tests). */
  now?: () => number
}

export interface LookupOptions {
  /** Immer neu fragen (schreibende Anfragen, `/api/auth/me`); das Ergebnis wird gemerkt. */
  fresh?: boolean
}

export interface SessionAccountMemo<T extends { $id: string }> {
  lookup: (key: string, fetcher: () => Promise<T>, options?: LookupOptions) => Promise<T>
  /** Genau diese Sitzung vergessen (Abmelden). */
  forgetKey: (key: string) => void
  /** Alle Sitzungen dieses Kontos vergessen (Widerruf, Labels, Sperre, Profil). */
  forgetUser: (userId: string) => void
  /** Wie viele Einträge gerade gemerkt sind (Tests, Überlauf). */
  size: () => number
}

interface Entry<T> {
  value: T
  expires: number
}

export function createSessionAccountMemo<T extends { $id: string }>(options: SessionAccountMemoOptions): SessionAccountMemo<T> {
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, Entry<T>>()
  const inflight = new Map<string, Promise<T>>()
  /** Konto-Id → Schlüssel seiner gemerkten Sitzungen. */
  const keysByUser = new Map<string, Set<string>>()
  /**
   * Zählt jedes Räumen. Eine Abfrage merkt ihr Ergebnis nur, wenn seit ihrem
   * Start nichts geräumt wurde — sonst könnte eine Antwort von VOR einem
   * Widerruf nach ihm im Merker landen. Ein Räumen bei einem fremden Konto
   * kostet damit höchstens einen Treffer, nie die Richtigkeit.
   */
  let epoch = 0

  function dropKey(key: string) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    const keys = keysByUser.get(entry.value.$id)
    keys?.delete(key)
    if (keys && keys.size === 0) keysByUser.delete(entry.value.$id)
  }

  function makeRoom() {
    if (entries.size < options.maxEntries) return
    const at = now()
    for (const [key, entry] of entries) {
      if (entry.expires <= at) dropKey(key)
    }
    // Map hält die Einfüge-Reihenfolge: vorn stehen die ältesten.
    for (const key of entries.keys()) {
      if (entries.size < options.maxEntries) break
      dropKey(key)
    }
  }

  function store(key: string, value: T) {
    dropKey(key)
    makeRoom()
    entries.set(key, { value, expires: now() + options.ttlMs })
    let keys = keysByUser.get(value.$id)
    if (!keys) keysByUser.set(value.$id, keys = new Set())
    keys.add(key)
  }

  function start(key: string, fetcher: () => Promise<T>): Promise<T> {
    const startedAt = epoch
    const promise = fetcher().then(
      (value) => {
        if (inflight.get(key) === promise) inflight.delete(key)
        if (startedAt === epoch) store(key, value)
        return value
      },
      (error: unknown) => {
        if (inflight.get(key) === promise) inflight.delete(key)
        dropKey(key)
        throw error
      },
    )
    inflight.set(key, promise)
    return promise
  }

  return {
    async lookup(key, fetcher, lookupOptions = {}) {
      if (!lookupOptions.fresh) {
        const entry = entries.get(key)
        if (entry && entry.expires > now()) return structuredClone(entry.value)
        if (entry) dropKey(key)
        const pending = inflight.get(key)
        if (pending) return structuredClone(await pending)
      }
      return structuredClone(await start(key, fetcher))
    },
    forgetKey(key) {
      epoch++
      inflight.delete(key)
      dropKey(key)
    },
    forgetUser(userId) {
      epoch++
      // Welches Konto eine laufende Abfrage betrifft, weiß erst ihre Antwort —
      // also hängt sich ab jetzt niemand mehr an IRGENDEINE laufende an.
      inflight.clear()
      for (const key of [...(keysByUser.get(userId) ?? [])]) dropKey(key)
    },
    size: () => entries.size,
  }
}
