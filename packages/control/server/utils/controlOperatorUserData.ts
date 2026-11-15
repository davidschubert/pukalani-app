import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { ABUSE_REPORTS_TABLE, type AbuseReportRow } from '../../shared/abuseReports'
import { CUSTOMER_FEEDBACK_MUTES_TABLE, type CustomerFeedbackMuteRow } from '../../shared/customerFeedback'
import { JOBS_TABLE, type JobRow } from '../../shared/types/job'

/**
 * DSGVO-Contributor des control-Layers für die KONTEN DER BETREIBER-KONSOLE
 * (apps/control, Projekt `admin`) — SEC-026, Davids Entscheidung 2026-11-15
 * „Export und Löschung erreichen alle Tabellen mit Personenbezug".
 *
 * Nicht zu verwechseln mit `communityErasure.ts`: das ist die Naht für
 * Pool-Konten (anderes Projekt, Aufruf über das Service-Secret). Hier geht es
 * um die userId eines Betreiber-Kontos, die an drei Stellen als Bearbeiter
 * steht: `provisioning_jobs.requestedBy`, `abuse_reports.handledBy` und
 * `customer_feedback_mutes.mutedBy`.
 *
 * DIE ZEILEN BLEIBEN, nur die userId wird geleert. Sie sind das Arbeits-
 * protokoll der Konsole und beschreiben HANDLUNGEN, nicht die Person: ein
 * Provisionierungs-Auftrag, eine bearbeitete Meldung (Beleg einer womöglich
 * verhängten Sperre), eine stummgeschaltete Community. Ohne den Verweis auf
 * das gelöschte Konto ist jede Zeile genau das, was sie fachlich sein soll.
 *
 * `communities` FASST DIESER CONTRIBUTOR BEWUSST NICHT AN: Name, Host und
 * Stripe-Kennungen sind Kunden- und Vertragsdaten mit Aufbewahrungspflicht —
 * die Begründung steht in `communityErasure.ts` („WAS BEWUSST STEHEN BLEIBT",
 * F8, Davids Entscheidung 2026-08-02: §147 AO / §257 HGB, Art. 17 Abs. 3
 * lit. b DSGVO). Eine Kontolöschung in der Konsole ist keine Kündigung.
 *
 * Läuft nur, wo der control-Layer läuft (heute allein apps/control), und dort
 * existieren alle drei Tabellen — ein Lesefehler ist deshalb ein Fehler
 * (`listAllRows` wirft), nie „nichts gefunden".
 *
 * IDEMPOTENT: geleert wird auf `''`, und `''` matcht `Query.equal(…, userId)`
 * beim zweiten Lauf nicht mehr.
 */

const OPERATOR_COLUMNS = [
  { tableId: JOBS_TABLE, column: 'requestedBy' },
  { tableId: ABUSE_REPORTS_TABLE, column: 'handledBy' },
  { tableId: CUSTOMER_FEEDBACK_MUTES_TABLE, column: 'mutedBy' },
] as const

export async function controlOperatorExportUserData(event: H3Event, userId: string) {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const jobs = await listAllRows<JobRow>(tablesDB, databaseId, JOBS_TABLE, [
    Query.equal('requestedBy', userId), Query.orderAsc('$createdAt'),
  ])
  const reports = await listAllRows<AbuseReportRow>(tablesDB, databaseId, ABUSE_REPORTS_TABLE, [
    Query.equal('handledBy', userId), Query.orderAsc('$createdAt'),
  ])
  const mutes = await listAllRows<CustomerFeedbackMuteRow>(tablesDB, databaseId, CUSTOMER_FEEDBACK_MUTES_TABLE, [
    Query.equal('mutedBy', userId), Query.orderAsc('$createdAt'),
  ])

  return {
    // Ohne Payload, Log und Ergebnis: das sind Betriebsdaten des Auftrags.
    provisioningJobs: jobs.map(row => ({ id: row.$id, type: row.type, status: row.status, createdAt: row.$createdAt })),
    // Ohne Melder-Adresse, Text und Notiz: über die MELDENDE Person wird hier
    // keine Auskunft gegeben, nur darüber, dass diese Person bearbeitet hat.
    handledAbuseReports: reports.map(row => ({
      id: row.$id, status: row.status, createdAt: row.$createdAt, handledAt: row.handledAt ?? null,
    })),
    feedbackMutes: mutes.map(row => ({ id: row.$id, communityId: row.communityId, createdAt: row.$createdAt })),
  }
}

export async function controlOperatorDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)
  let anonymized = 0

  // Erst ALLE lesen, dann schreiben: scheitert ein Lesen, ist noch nichts
  // halb geschrieben (der Orchestrator wiederholt ohnehin, aber so bleibt die
  // Fehlermeldung eindeutig).
  const pending: { tableId: string, column: string, rowIds: string[] }[] = []
  for (const { tableId, column } of OPERATOR_COLUMNS) {
    const rows = await listAllRows(tablesDB, databaseId, tableId, [Query.equal(column, userId)])
    pending.push({ tableId, column, rowIds: rows.map(row => row.$id) })
  }

  for (const { tableId, column, rowIds } of pending) {
    for (const rowId of rowIds) {
      await tablesDB.updateRow({ databaseId, tableId, rowId, data: { [column]: '' } })
      anonymized++
    }
  }

  return { deleted: 0, anonymized }
}
