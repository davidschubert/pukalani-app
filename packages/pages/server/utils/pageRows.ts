import { Query, type Models } from 'node-appwrite'
import { guidelinesFallbackGroup } from '../../shared/guidelinesFallback'
import { GUIDELINES_SLUG, PAGES_TABLE, type PageGroup, type PageRow } from '../../shared/types/page'

/**
 * SEITEN-ZEILEN GEBLÄTTERT LESEN (KK1 c, nach dem Vorbild BE-019).
 *
 * Bis dahin las jede Route der Seiten mit einer festen Obergrenze und ohne
 * Blättern — die Verwaltungs-Liste 500 Zeilen, der Editor 20 Fassungen, das
 * Löschen 50. Was darüber lag, fehlte ohne Hinweis; beim Löschen blieben
 * Fassungen stehen, und die Antwort sagte trotzdem „gelöscht".
 *
 * Die Hilfe nimmt die schon geöffnete Datentür entgegen, nicht das Event:
 * WELCHE Klinke liest, entscheidet die Route und steht dort sichtbar
 * (der Wächter `tests/redaction-actor.test.ts` liest genau diese Zeile).
 */

/** Was die Hilfe von der Datentür braucht — `tenantDb(event, …)` erfüllt es. */
export interface PageRowsDoor {
  list: <T extends Models.Row>(tableId: string, queries?: string[]) => Promise<{ rows: T[], total: number }>
}

export interface PagedListOptions {
  /** Zeilen je Abfrage. */
  pageSize: number
  /** Das NETZ: mehr Zeilen liest die Hilfe nicht. Kein Alltag, sondern Schutz. */
  maxRows: number
  /** Log-Kennung, wenn das Netz greift (z. B. `pages.public_list_capped`). */
  logName: string
  /** Mandanten-Kennung für die Log-Zeile (`tenantCacheScope(event)`). */
  scope: string
}

export interface PagedListResult<T> {
  rows: T[]
  /** true ⇔ das Netz hat gegriffen und es gab weitere Zeilen. */
  capped: boolean
}

/**
 * ALLE Zeilen zu dieser Abfrage, geblättert nach Kennung.
 *
 * Nach Kennung (Appwrites Standard-Reihenfolge, der Cursor zeigt auf eine
 * eindeutige Zeile), sortiert wird beim Aufrufer im Speicher: ein Cursor auf
 * `sortOrder` liefe bei Gleichstand über viele Zeilen derselben Reihenfolge.
 * Die Abfrage darf deshalb KEIN `orderAsc`/`limit`/`cursor*` mitbringen.
 *
 * Greift das Netz und gibt es weitere Zeilen, steht das als EINE Log-Zeile im
 * Protokoll — nur Zahlen und die Mandanten-Kennung, kein Titel.
 * Fehler der Tür reisen unverändert zum Aufrufer (der übersetzt sie selbst).
 */
export async function listPageRowsPaged<T extends Models.Row>(
  db: PageRowsDoor,
  tableId: string,
  queries: string[],
  options: PagedListOptions,
): Promise<PagedListResult<T>> {
  const { pageSize, maxRows } = options
  const rows: T[] = []
  let cursor: string | undefined

  for (;;) {
    // Nie über das Netz hinaus anfragen — so bleibt das Ergebnis höchstens
    // `maxRows` lang, auch wenn es kein Vielfaches der Seitengröße ist.
    const limit = Math.min(pageSize, maxRows - rows.length)
    const res = await db.list<T>(tableId, [
      ...queries,
      Query.limit(limit),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ])
    rows.push(...res.rows)
    if (res.rows.length < limit) return { rows, capped: false }
    if (rows.length >= maxRows) {
      const capped = res.total > rows.length
      if (capped) {
        logEvent('warn', options.logName, { scope: options.scope, read: rows.length, total: res.total })
      }
      return { rows, capped }
    }
    cursor = res.rows.at(-1)!.$id
  }
}

/** Seitengröße und Netz für die FASSUNGEN einer Seite (eine je Sprache). */
export const PAGE_VERSIONS_PAGE_SIZE = 100
/**
 * Eine Seite hat eine Fassung je Sprache — eine Handvoll. 200 ist ein Netz,
 * das kein echter Mandant erreicht; greift es, ist etwas anderes kaputt, und
 * die Log-Zeile sagt es.
 */
export const PAGE_VERSIONS_MAX = 200

/**
 * Seitengröße und Netz der VERWALTUNGS-Liste (eine Zeile je Seite UND
 * Sprache). Das Kontingent liegt bei höchstens 300 Zeilen je Community —
 * 2.000 ist reichlich Luft darüber (auch für Bestände von vor dem
 * Kontingent) und hält die Antwort trotzdem bei höchstens 20 Abfragen.
 */
export const ADMIN_PAGES_PAGE_SIZE = 100
export const ADMIN_PAGES_MAX = 2_000

/**
 * Die Verwaltungs-Liste aus den Zeilen bauen: nach slug gruppiert, Gruppen
 * nach `sortOrder` (kleinste Fassung), dann `slug`. Die Regeln stehen in der
 * Liste, auch wenn es sie als Zeile noch nicht gibt — sonst wäre der
 * bearbeitbare Standardtext für den Owner unauffindbar (F1, Davids
 * Entscheidung 2). Hier braucht es KEINE zweite Abfrage: diese Liste ist
 * ungefiltert, ein Entwurf stünde also schon in den Zeilen.
 */
export function buildAdminPageGroups(rows: PageRow[], guidelinesFallback: boolean): PageGroup[] {
  const bySlug = new Map<string, PageGroup>()
  for (const row of rows) {
    let group = bySlug.get(row.slug)
    if (!group) {
      group = { slug: row.slug, sortOrder: row.sortOrder, locales: [] }
      bySlug.set(row.slug, group)
    }
    group.sortOrder = Math.min(group.sortOrder, row.sortOrder)
    group.locales.push({ $id: row.$id, locale: row.locale, title: row.title, status: row.status })
  }
  const rawGroups = [...bySlug.values()]
  if (!bySlug.has(GUIDELINES_SLUG) && guidelinesFallback) rawGroups.push(guidelinesFallbackGroup())
  return rawGroups.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
}

/**
 * Löschen: Zeilen je Runde und harter Deckel der Runden. Eine Runde löscht
 * gleichzeitig, und jedes Löschen belegt vorher die Zugehörigkeit (zwei
 * Aufrufe je Zeile) — die Runde bleibt deshalb klein. 25 × 40 = 1.000 Zeilen
 * je Aufruf sind weit mehr, als eine Seite je an Fassungen hat.
 */
export const PAGE_DELETE_BATCH = 25
export const PAGE_DELETE_MAX_ROUNDS = 40

export interface RemovePageVersionsResult {
  deleted: number
  /** Fassungen, die nach dem Deckel noch standen (0 = vollständig). */
  remaining: number
}

/** Was das Löschen von der Datentür braucht. */
export interface PageRemoveDoor extends PageRowsDoor {
  remove: (tableId: string, rowId: string) => Promise<unknown>
}

/**
 * ALLE Fassungen einer Seite löschen — so lange, bis keine mehr da ist.
 *
 * WARUM NICHT „erst alle lesen, dann löschen": beim Löschen zählt
 * Vollständigkeit, nicht das Netz einer Liste. Jede Runde fragt deshalb von
 * vorn (ohne Cursor — die gerade gelöschten Zeilen sind weg, ein Cursor
 * zeigte auf eine Zeile, die es nicht mehr gibt) und löscht, was sie findet.
 * Leer ⇒ fertig. Der Deckel (40 Runden à 25 = 1.000 Fassungen) schützt nur
 * gegen eine Endlosschleife, falls ein Löschen still nichts bewirkt; steht
 * danach noch etwas, meldet das Ergebnis den Rest ehrlich — die Route macht
 * daraus einen Fehler statt „gelöscht".
 */
export async function removePageVersions(
  db: PageRemoveDoor,
  slug: string,
  options: { logName: string, scope: string },
): Promise<RemovePageVersionsResult> {
  let deleted = 0
  for (let round = 0; round < PAGE_DELETE_MAX_ROUNDS; round++) {
    const res = await db.list<PageRow>(PAGES_TABLE, [
      Query.equal('slug', slug),
      Query.limit(PAGE_DELETE_BATCH),
    ])
    if (!res.rows.length) return { deleted, remaining: 0 }
    await Promise.all(res.rows.map(row => db.remove(PAGES_TABLE, row.$id)))
    deleted += res.rows.length
  }
  const rest = await db.list<PageRow>(PAGES_TABLE, [Query.equal('slug', slug), Query.limit(1)])
  if (rest.total > 0) {
    logEvent('warn', options.logName, { scope: options.scope, deleted, remaining: rest.total })
  }
  return { deleted, remaining: rest.total }
}
