import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  ACCOUNT_EVENT_AUDIT_ACTIONS,
  accountEventFromAuditRow,
  formatAccountEventPlace,
  type AccountEventAuditRow,
  type AccountEventEntry,
  type AccountEventsSection,
} from '../../shared/accountEvents'

/**
 * Leseweg der eigenen Konto-Ereignisse (Regeln: shared/accountEvents.ts).
 *
 * DAS GEGENSTÜCK ZU `logAuthEvent` und an DERSELBEN Grenze: core liest
 * `audit_logs` direkt, NICHT über den admin-Layer — core darf von admin nicht
 * abhängen, und die Admin-Route (`/api/admin/audit`, `audit.read`) beantwortet
 * ohnehin eine andere Frage („was geschah auf dieser Instanz?"). Diese hier
 * beantwortet „was geschah an MEINEM Konto?".
 *
 * Gelesen wird mit dem ADMIN-Client — die Tabelle hat keine Row-Permissions
 * (system-001, „ausschließlich über den Server-API-Key"). Die Grenze ist
 * deshalb die `actorId`, doppelt gezogen: als `Query.equal` (die Datenbank
 * liefert nichts anderes; Index `actor`, system-001) UND als Nachprüfung an
 * jeder gelesenen Zeile (`accountEventFromAuditRow`).
 *
 * `userId` kommt IMMER aus der Session der aufrufenden Route, NIE aus Query
 * oder Body — dieselbe Pflicht wie bei `AccountActivityContributor`.
 */

type AuditRow = Models.Row & Omit<AccountEventAuditRow, '$id' | '$createdAt'>

/** Die zwei Dinge, die der Leser von außen braucht — getrennt, damit testbar. */
export interface AccountEventsSource {
  /** Liefert Protokoll-Zeilen zu fertig gebauten Appwrite-Queries. */
  listRows(queries: string[]): Promise<AccountEventAuditRow[]>
  /** IP → „Stadt, Region" oder ''. Darf NIE werfen (ein Ort ist Komfort). */
  resolvePlace(ip: string): Promise<string>
}

/**
 * Die neuesten eigenen Konto-Ereignisse, höchstens `limit` Stück.
 *
 * Es wird EINE Zeile mehr angefragt als gezeigt: nur so ist `truncated` eine
 * Tatsache („es gibt Älteres") statt einer Vermutung („das Fenster war voll").
 */
export async function readAccountEvents(
  source: AccountEventsSource,
  userId: string,
  limit: number,
): Promise<AccountEventsSection> {
  if (!userId || limit <= 0) return { events: [], truncated: false }

  const rows = await source.listRows([
    Query.equal('actorId', userId),
    Query.equal('action', [...ACCOUNT_EVENT_AUDIT_ACTIONS]),
    Query.orderDesc('$createdAt'),
    Query.limit(limit + 1),
  ])

  const events: AccountEventEntry[] = []
  for (const row of rows.slice(0, limit)) {
    // ERST der Besitz, DANN der Ort: für eine fremde Zeile wird gar nicht
    // erst nachgeschlagen, wo ihre IP liegt.
    if (!accountEventFromAuditRow(row, userId)) continue
    const place = row.ip ? await source.resolvePlace(row.ip).catch(() => '') : ''
    const entry = accountEventFromAuditRow(row, userId, place)
    if (entry) events.push(entry)
  }

  return { events, truncated: rows.length > limit }
}

/** Verdrahtung mit Appwrite und der lokalen Orts-Datenbank. Darf werfen. */
export async function listAccountEvents(event: H3Event, userId: string, limit: number): Promise<AccountEventsSection> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  return readAccountEvents({
    listRows: async (queries) => {
      const res = await tablesDB.listRows<AuditRow>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: 'audit_logs',
        queries,
      })
      return res.rows
    },
    // `lookupCityForIp` ist selbst fail-soft (kein Pfad, private IP, kein
    // Treffer ⇒ null) und liefert die Namen in der Sprache der Anfrage.
    resolvePlace: async ip => formatAccountEventPlace(await lookupCityForIp(event, ip)),
  }, userId, limit)
}
