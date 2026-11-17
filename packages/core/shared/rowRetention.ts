/**
 * DAS GEMEINSAME GERÜST DER FRISTEN-LÄUFE (EL1 c, KE3, RU1 c — seit 2026-11-17).
 *
 * Bis dahin brachte jeder Aufräum-Lauf sein eigenes Blättern, seinen eigenen
 * Schalter und seine eigene Zählung mit (Prüfergebnisse, Runner, Kopien
 * gelöschter Konten). Mit den Fristen für Einträge ohne Konto kamen fünf Läufe
 * auf einmal dazu — fünf Kopien derselben Schleife wären fünf Stellen, an
 * denen „beim Löschen wird eine Zeile übersprungen" neu entstehen kann.
 *
 * WAS HIER STEHT, IST PUR: der Schalter, die Rechnung „älter als N Tage" und
 * die Schleife mit eingereichten Abhängigkeiten. Kein Appwrite, kein Nitro —
 * so prüft ein Test den Lauf mit gestellter Uhr, und ein Beweis-Skript kann
 * dieselbe Schleife gegen eine echte Instanz fahren. Die Anbindung an Appwrite,
 * die Sperre gegen den Doppelstart und die Log-Zeilen stehen in
 * `server/utils/rowRetention.ts`.
 *
 * DREI STELLUNGEN, EIN WORT JE STELLUNG:
 *   off    — der Lauf meldet sich gar nicht an (Layer- und Core-Vorgabe).
 *   count  — er liest und zählt mit GENAU der Auswahl, die `apply` träfe, und
 *            schreibt nichts. DAS IST DIE STELLUNG NACH DEM AUSLIEFERN: Löschen
 *            ist nicht umkehrbar, die Zahl sieht der Betreiber vorher.
 *   apply  — er löscht. Scharf geschaltet wird je App in deren `app.config.ts`,
 *            mit dem Ja des Betreibers zur gezählten Zahl.
 * Ein unbekannter Wert heisst `off` und wird als ungültig gemeldet — ein
 * Tippfehler darf nie „löschen" bedeuten.
 *
 * WARUM EINZELN LÖSCHEN statt per Abfrage: die Entscheidung je Zeile trifft
 * eine pure Funktion (`decide`), die der Test mit gestellter Uhr prüft. Eine
 * Sammel-Löschung per Abfrage hätte eine zweite Formulierung derselben Regel —
 * und nur eine der beiden wäre getestet.
 */

export const ROW_RETENTION_MODES = ['off', 'count', 'apply'] as const

export type RowRetentionMode = (typeof ROW_RETENTION_MODES)[number]

/** Die Stellungen, in denen ein Lauf überhaupt fährt. */
export type ActiveRowRetentionMode = Exclude<RowRetentionMode, 'off'>

/** Einen Schalterwert auflösen — Unbekanntes heisst `off` und gilt als ungültig. */
export function resolveRowRetentionMode(value: unknown): { mode: RowRetentionMode, invalid: boolean } {
  if (value === undefined || value === null) return { mode: 'off', invalid: false }
  if (typeof value === 'string' && (ROW_RETENTION_MODES as readonly string[]).includes(value)) {
    return { mode: value as RowRetentionMode, invalid: false }
  }
  return { mode: 'off', invalid: true }
}

export const RETENTION_DAY_MS = 24 * 60 * 60 * 1000

/** Der Zeitpunkt „vor N Tagen" als ISO-Text (für Abfragen `$createdAt < …`). */
export function retentionCutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * RETENTION_DAY_MS).toISOString()
}

/**
 * Liegt `iso` mehr als `days` Tage vor `now`?
 *
 * Ein leerer oder unlesbarer Zeitpunkt heisst NEIN: eine Zeile, deren Alter
 * sich nicht belegen lässt, wird nicht gelöscht. Genau `days` Tage alt heisst
 * ebenfalls nein — die Zusage lautet „nach N Tagen", nicht „am N-ten Tag".
 */
export function olderThanDays(iso: string | null | undefined, days: number, now: Date): boolean {
  if (!iso) return false
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return false
  return now.getTime() - at > days * RETENTION_DAY_MS
}

/** Die Deckel je Lauf. Als Parameter, damit Tests sie klein drehen können. */
export interface RowRetentionLimits {
  /** Seitengröße beim Blättern. */
  pageSize: number
  /** Höchstens so viele Einträge ansehen. */
  maxConsidered: number
  /** Höchstens so viele Einträge löschen (in `count`: als fällig zählen). */
  maxDeletes: number
}

export const ROW_RETENTION_LIMITS: RowRetentionLimits = {
  pageSize: 100,
  maxConsidered: 5000,
  maxDeletes: 1000,
}

/**
 * Die Abhängigkeiten eines Laufs — eingereicht, damit die Schleife ohne
 * Appwrite prüfbar ist.
 */
export interface RowRetentionDeps<T extends { $id: string }> {
  /**
   * Eine Seite Kandidaten in FESTER Reihenfolge, hinter dem Eintrag `after`
   * (`null` = von vorn). Ein Lesefehler WIRFT — ein Lauf, der nicht lesen kann,
   * darf nicht wie „nichts zu tun" aussehen.
   */
  listPage: (args: { after: string | null, limit: number }) => Promise<T[]>
  /**
   * Die Regel je Eintrag: ein kurzes Wort als GRUND, wenn er fällig ist
   * (es wird die Zählung `byReason`), sonst `null` = bleibt. Darf asynchron
   * sein (ein Nachschlagen je Eintrag); wirft sie, zählt der Eintrag als
   * `failed` und bleibt stehen.
   */
  decide: (row: T, now: Date) => string | null | Promise<string | null>
  /**
   * Löscht EINEN Eintrag. Wirft bei einem Fehler. Darf `'kept'` zurückgeben,
   * wenn ein letzter Blick direkt vor dem Löschen ergibt, dass der Eintrag
   * DOCH bleibt (er wurde zwischen Entscheiden und Löschen wieder gebraucht):
   * dann zählt er weder als fällig noch als Fehler. Jeder andere Rückgabewert
   * (auch keiner) heisst „gelöscht".
   */
  remove: (row: T) => Promise<unknown>
  /** Sagt, ob ein Fehler beim Löschen „gibt es nicht mehr" bedeutet (dann Erfolg). */
  isGone?: (error: unknown) => boolean
}

export interface RowRetentionResult {
  mode: ActiveRowRetentionMode
  /** Angesehene Einträge. */
  considered: number
  /** Fällige Einträge — in `count` die Zahl, die `apply` löschen würde. */
  expired: number
  /** Wirklich gelöscht (in `count` immer 0). */
  deleted: number
  /** Einträge, bei denen Entscheiden oder Löschen scheiterte — der Lauf machte weiter. */
  failed: number
  /** Ein Deckel griff; der nächste Lauf macht weiter. */
  truncated: boolean
  /** Fällige Einträge je Grund. */
  byReason: Record<string, number>
}

/**
 * EIN LAUF.
 *
 * BLÄTTERN OHNE LÜCKE: der Cursor zeigt immer auf den LETZTEN Eintrag einer
 * Seite, der STEHEN GEBLIEBEN ist — Appwrite verlangt, dass es den
 * Cursor-Eintrag noch gibt, und ein gelöschter Eintrag als Cursor liesse die
 * nächste Seite scheitern oder Zeilen überspringen. Wurde eine ganze Seite
 * gelöscht, wird mit demselben Cursor neu gelesen. In `count` bleibt alles
 * stehen, der Cursor wandert also einfach weiter.
 *
 * ENDLICH: bleibt eine volle Seite stehen und bewegt sich der Cursor nicht,
 * gäbe es eine Endlosschleife — das kann nur geschehen, wenn `listPage` den
 * Cursor ignoriert; der Lauf bricht dann mit einem Fehler ab statt zu kreisen.
 */
export async function runRowRetention<T extends { $id: string }>(
  mode: ActiveRowRetentionMode,
  deps: RowRetentionDeps<T>,
  opts: { now?: Date, limits?: Partial<RowRetentionLimits> } = {},
): Promise<RowRetentionResult> {
  const now = opts.now ?? new Date()
  const limits: RowRetentionLimits = { ...ROW_RETENTION_LIMITS, ...opts.limits }
  const result: RowRetentionResult = {
    mode, considered: 0, expired: 0, deleted: 0, failed: 0, truncated: false, byReason: {},
  }

  let cursor: string | null = null
  for (;;) {
    const page = await deps.listPage({ after: cursor, limit: limits.pageSize })
    if (page.length === 0) return result

    let lastKept: string | null = null
    for (const row of page) {
      if (result.considered >= limits.maxConsidered || result.expired >= limits.maxDeletes) {
        result.truncated = true
        return result
      }
      result.considered++

      let reason: string | null
      try {
        reason = await deps.decide(row, now)
      }
      catch {
        result.failed++
        lastKept = row.$id
        continue
      }
      if (reason === null) {
        lastKept = row.$id
        continue
      }

      const countExpired = (): void => {
        result.expired++
        result.byReason[reason] = (result.byReason[reason] ?? 0) + 1
      }
      if (mode === 'count') {
        countExpired()
        lastKept = row.$id
        continue
      }
      try {
        if (await deps.remove(row) === 'kept') {
          lastKept = row.$id
          continue
        }
        countExpired()
        result.deleted++
      }
      catch (error) {
        countExpired()
        if (deps.isGone?.(error)) {
          result.deleted++
        }
        else {
          result.failed++
          lastKept = row.$id
        }
      }
    }

    if (page.length < limits.pageSize) return result
    if (lastKept === null) continue
    if (lastKept === cursor) {
      throw new Error('runRowRetention: der Cursor bewegt sich nicht — listPage ignoriert `after`')
    }
    cursor = lastKept
  }
}
