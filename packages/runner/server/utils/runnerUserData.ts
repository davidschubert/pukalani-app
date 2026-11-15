import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { RUNS_TABLE, type RunRow } from '../../shared/types/runner'

/**
 * DSGVO-Contributor des runner-Layers (SEC-026, Davids Entscheidung
 * 2026-11-15 „Export und Löschung erreichen alle Tabellen mit Personenbezug").
 *
 * Personenbezug in diesem Layer ist `runs.createdBy` (die userId des
 * Betreiber-Kontos, das den Lauf angelegt hat) und — darüber erreichbar — der
 * Auftragstext, den diese Person eingegeben hat (`promptSource`).
 *
 * AUSKUNFT: die eigenen Läufe mit Zustand, Ziel und dem eingegebenen Auftrag.
 * BEWUSST OHNE Protokolle (Transkripte), Ereignisse, Anhänge und den Bericht
 * (`resultJson`): das ist die Ausgabe des Runners, kein Datum über die Person.
 *
 * LÖSCHUNG: nur `createdBy` wird geleert. Die Läufe selbst, ihre Ereignisse,
 * Protokolle und Anhänge bleiben unter dem bestehenden Aufräum-Lauf
 * (`server/utils/runRetention.ts`: Protokolle 30 Tage, Ereignisse 90 Tage nach
 * dem Ende; die `runs`-Zeile und Anhänge ohne Frist). Ob der Auftragstext
 * einer gelöschten Person eine eigene Frist braucht, ist als offener Punkt
 * „RU1" geführt — hier wird das nicht nebenbei entschieden.
 *
 * Läuft nur, wo der runner-Layer läuft (heute allein apps/control), dort gibt
 * es `runs` — ein Lesefehler wirft (`listAllRows`), nie „nichts gefunden".
 * IDEMPOTENT: `''` matcht `Query.equal('createdBy', userId)` nicht mehr.
 */
export async function runnerExportUserData(event: H3Event, userId: string) {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const runs = await listAllRows<RunRow>(tablesDB, databaseId, RUNS_TABLE, [
    Query.equal('createdBy', userId),
    Query.orderAsc('$createdAt'),
  ])

  return {
    runs: runs.map(row => ({
      id: row.$id,
      createdAt: row.$createdAt,
      status: row.status,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      repoKey: row.repoKey,
      model: row.model,
      finishedAt: row.finishedAt ?? null,
      promptSource: row.promptSource,
    })),
  }
}

export async function runnerDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const runs = await listAllRows<RunRow>(tablesDB, databaseId, RUNS_TABLE, [Query.equal('createdBy', userId)])
  let anonymized = 0
  for (const row of runs) {
    await tablesDB.updateRow({ databaseId, tableId: RUNS_TABLE, rowId: row.$id, data: { createdBy: '' } })
    anonymized++
  }
  return { deleted: 0, anonymized }
}
