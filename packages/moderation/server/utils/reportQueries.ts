import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report } from '../../shared/types/report'

/**
 * Server-Vertrag des Moderation-Layers für Konsumenten (comments, admin, …).
 * Bewusst als benannte Funktionen statt direktem `reports`-Tabellenzugriff —
 * so bleibt die Kopplung explizit und an einer Stelle (Layer-Grenze A14).
 * Auto-importiert in alle Server-Routen (Nitro), läuft über den AdminClient.
 */

// Reports werden in einem begrenzten Fenster betrachtet (wie die Fenster-Sorts
// Trending/Meistdiskutiert bei comments) — riesige Mengen offener Meldungen sind der Ausnahmefall. Auch die
// Resolve-Route (api/reports/resolve.post.ts) arbeitet mit diesem Fenster.
export const REPORTS_WINDOW = 500

/** Welche der gegebenen Targets hat DIESER User offen gemeldet? */
export async function myOpenReportTargetIds(
  event: import('h3').H3Event,
  targetType: string,
  targetIds: string[],
  reporterId: string,
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set()
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const result = new Set<string>()
  // Query.equal ist auf 100 Werte begrenzt → in Batches (Thread-Subtrees können groß sein)
  for (let i = 0; i < targetIds.length; i += 100) {
    const batch = targetIds.slice(i, i + 100)
    const res = await tablesDB.listRows<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      queries: scopeQuery(event, [
        Query.equal('reporterId', reporterId),
        Query.equal('targetType', targetType),
        Query.equal('targetId', batch),
        Query.equal('status', 'open'),
        Query.limit(batch.length),
      ]),
    })
    for (const row of res.rows) result.add(row.targetId)
  }
  return result
}

/**
 * Alle offenen Meldungen zu einem Target abschließen. Vertrag für Konsumenten
 * (Resolve-Route, admin-Bulk-Aktionen) — `resolution` ist ein offener String
 * (z. B. 'hidden', 'no_action'), die Semantik bestimmt der Aufrufer.
 * Arbeitet im REPORTS_WINDOW; Überlauf wird geloggt und bleibt open (der
 * nächste Lauf erfasst ihn).
 */
export async function resolveReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
  resolution: string,
  resolvedBy: string,
): Promise<number> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const open = await tablesDB.listRows<Report>({
    databaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.limit(REPORTS_WINDOW),
    ]),
  })
  if (open.total > open.rows.length) {
    console.warn(`[moderation] resolve ${targetType}/${targetId}: ${open.total} offene Meldungen, Fenster ${REPORTS_WINDOW} — Rest bleibt open`)
  }

  // Parallel in Chunks statt strikt sequentiell — bei vielen Meldungen pro
  // Target sonst unnötig langsam; Chunk-Größe begrenzt die Last auf Appwrite.
  const CHUNK = 10
  for (let i = 0; i < open.rows.length; i += CHUNK) {
    await Promise.all(open.rows.slice(i, i + CHUNK).map(row =>
      tablesDB.updateRow<Report>({
        databaseId,
        tableId: REPORTS_TABLE,
        rowId: row.$id,
        data: { status: 'resolved', resolvedBy, resolution },
      }),
    ))
  }
  return open.rows.length
}

/**
 * WIE VIELE offene Meldungen hat dieses Target? — die ZAHL, nicht die Zeilen.
 *
 * Moderations-Audit Befund 7 (2026-08-01): die Eskalation zählte bis hierher
 * `openReportsForTarget(...).length`, und die Funktion holt höchstens 100
 * Zeilen. Ein `pukalani.comments.autoHideReports` von 150 hätte deshalb NIE
 * gezündet — der Schwellwert war stillschweigend bei 100 gedeckelt. Hier kommt
 * `total` aus Appwrite: ein Limit von 1 überträgt keine Zeile und zählt trotzdem
 * richtig.
 */
export async function countOpenReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
): Promise<number> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.limit(1),
    ]),
  })
  return res.total
}

/**
 * Alle offenen Meldungen zu EINEM Target (neueste zuerst). Für Detail-Ansichten
 * und den KI-Moderations-Assist (admin) — die Meldegründe/Notizen gehören zum
 * Kontext der Einschätzung.
 *
 * ANZEIGE-FENSTER, KEIN ZÄHLER: die 100 sind bewusst — eine Detailansicht und
 * ein KI-Prompt brauchen keine 5000 Meldegründe. Wer eine ZAHL braucht, nimmt
 * countOpenReportsForTarget (Befund 7).
 */
export async function openReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
): Promise<Report[]> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]),
  })
  return res.rows
}

/** Höchstens so viele Seiten je Bündel (500 Zeilen je Seite) — ein Netz, kein Fenster. */
const OPEN_COUNT_MAX_PAGES = 20

/**
 * WIE VIELE offene Meldungen hat JEDES dieser Targets? — gebündelt für eine
 * ganze Seite einer Melde-Liste (SEC-033: die Liste gemeldeter privater
 * Nachrichten gibt Text nur bei offener Meldung heraus und braucht dafür die
 * echte Zahl je Zeile, ohne je Zeile eine Abfrage).
 *
 * Bündel zu 100 Ids (Grenze von `Query.equal`), mit dem Mandanten-Filter der
 * Anfrage (`scopeQuery`). Innerhalb eines Bündels wird seitenweise gelesen,
 * damit ein Target mit vielen Meldungen die anderen nicht aus dem Fenster
 * drängt. Targets ohne offene Meldung fehlen in der Karte.
 */
export async function openReportCountsForTargets(
  event: import('h3').H3Event,
  targetType: string,
  targetIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (targetIds.length === 0) return counts
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  for (let i = 0; i < targetIds.length; i += 100) {
    const batch = targetIds.slice(i, i + 100)
    let after: string | null = null
    for (let page = 0; page < OPEN_COUNT_MAX_PAGES; page++) {
      const res: { rows: Report[] } = await tablesDB.listRows<Report>({
        databaseId,
        tableId: REPORTS_TABLE,
        queries: scopeQuery(event, [
          Query.equal('targetType', targetType),
          Query.equal('targetId', batch),
          Query.equal('status', 'open'),
          Query.limit(REPORTS_WINDOW),
          ...(after ? [Query.cursorAfter(after)] : []),
        ]),
      })
      for (const row of res.rows) counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1)
      if (res.rows.length < REPORTS_WINDOW) break
      after = res.rows[res.rows.length - 1]!.$id
    }
  }
  return counts
}

/** Stand der Meldungen zu EINEM Target, wie ihn ein Lauf ohne Anfrage braucht. */
export interface TargetReportEvidenceState {
  /** Offene Meldungen. */
  open: number
  /** Nicht offene (erledigte) Meldungen. Zurückgezogene sind gelöscht. */
  closed: number
  /** Spätestes `$updatedAt` der nicht offenen; '' = keine. */
  lastClosedAt: string
}

/**
 * Der Mandanten-Filter für eine AUSDRÜCKLICH genannte Community. Ohne Id
 * (Einzelbetrieb: die Zeilen tragen keinen Stempel) nur Zeilen ohne Stempel —
 * nie „alle".
 */
function communityScope(communityId: string): string[] {
  return communityId
    ? [Query.equal('communityId', communityId)]
    : [Query.or([Query.equal('communityId', ''), Query.isNull('communityId')])]
}

/**
 * STAND DER MELDUNGEN ZU EINEM TARGET — OHNE ANFRAGE, IN EINER COMMUNITY
 * (SEC-033, Vertrag für den Lösch-Lauf des Belegs gemeldeter Nachrichten).
 *
 * Ein Lauf hat keinen Mandanten-Kontext; die Community nennt der Aufrufer
 * deshalb ausdrücklich (die `communityId` des Targets), und gefragt wird NUR
 * dort — keine Abfrage über Community-Grenzen.
 *
 * Der Zeitpunkt der Erledigung ist das `$updatedAt` der erledigten Zeile
 * (eine eigene Spalte gibt es nicht; `resolveReportsForTarget` schreibt sie
 * zuletzt). Zwei Abfragen mit `limit(1)`: `total` zählt exakt, ohne Zeilen zu
 * übertragen.
 */
export async function reportEvidenceStateForTarget(input: {
  communityId: string
  targetType: string
  targetId: string
}): Promise<TargetReportEvidenceState> {
  const config = useRuntimeConfig()
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient()
  const base = [
    Query.equal('targetType', input.targetType),
    Query.equal('targetId', input.targetId),
    ...communityScope(input.communityId),
  ]
  const [open, closed] = await Promise.all([
    tablesDB.listRows<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      queries: [...base, Query.equal('status', 'open'), Query.limit(1)],
    }),
    tablesDB.listRows<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      queries: [...base, Query.notEqual('status', 'open'), Query.orderDesc('$updatedAt'), Query.limit(1)],
    }),
  ])
  return { open: open.total, closed: closed.total, lastClosedAt: closed.rows[0]?.$updatedAt ?? '' }
}

/**
 * Offene Meldungen eines Target-Typs: distinkte Target-IDs nach Aktualität +
 * Anzahl je Target. Für die Moderations-Queue (Admin).
 */
export async function openReportsByTarget(
  event: import('h3').H3Event,
  targetType: string,
): Promise<{ order: string[], counts: Map<string, number> }> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('status', 'open'),
      Query.orderDesc('$createdAt'),
      Query.limit(REPORTS_WINDOW),
    ]),
  })

  const counts = new Map<string, number>()
  const order: string[] = []
  for (const row of res.rows) {
    if (!counts.has(row.targetId)) order.push(row.targetId)
    counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1)
  }
  return { order, counts }
}
