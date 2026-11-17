import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import { formatAccountEventPlace } from '../../../core/shared/accountEvents'
import type { AdminUserActivity } from '../../shared/types/admin'
import {
  USER_ACTIVITY_HIDDEN_ACTIONS,
  mergeUserActivityRows,
  userActivityFromAuditRow,
  type UserActivityAuditRow,
} from '../../shared/userActivity'

/**
 * Leseweg der Aktivitätsliste in der Admin-Nutzeransicht (AL1; Regeln:
 * shared/userActivity.ts). Quelle ist `audit_logs` — dieselbe Tabelle, die
 * `/api/admin/audit` zeigt, hier auf EIN Konto zugeschnitten.
 *
 * Gelesen wird mit dem ADMIN-Client wie in `audit.get.ts`: die Tabelle hat
 * keine Zeilen-Rechte für Konten. Die Grenze ist deshalb doppelt gezogen —
 * in der Abfrage (Index `actor` bzw. `target`, system-001) UND als
 * Nachprüfung an jeder gelesenen Zeile (`userActivityOrigin`).
 *
 * `userId` ist der Pfad-Parameter der Route — die Route hängt an
 * `users.manage`, der Betreiber darf jedes Konto ansehen.
 */

type AuditRow = Models.Row & Omit<UserActivityAuditRow, '$id' | '$createdAt'>

/** Die zwei Dinge, die der Leser von außen braucht — getrennt, damit testbar. */
export interface UserActivitySource {
  /** Liefert Protokoll-Zeilen zu fertig gebauten Appwrite-Queries. Darf werfen. */
  listRows(queries: string[]): Promise<UserActivityAuditRow[]>
  /** IP → „Stadt, Region" oder ''. Darf NIE werfen (ein Ort ist Komfort). */
  resolvePlace(ip: string): Promise<string>
}

export interface UserActivitySection {
  activity: AdminUserActivity[]
  truncated: boolean
}

/** Ansichten schon in der ABFRAGE auslassen — je Aktion ein `notEqual`. */
function hiddenActionQueries(): string[] {
  return USER_ACTIVITY_HIDDEN_ACTIONS.map(action => Query.notEqual('action', action))
}

/**
 * Die neuesten Einträge zu EINEM Konto, höchstens `limit` Stück. Zwei
 * Abfragen, je EINE Zeile mehr als gezeigt — so ist `truncated` eine Tatsache:
 *  (a) was die Person selbst tat: `actorId` = Konto, OHNE Ziel;
 *  (b) was ein Betreiber am Konto tat: `targetType` 'user', `targetId` = Konto.
 * Ein Lesefehler WIRFT — die Route macht daraus `activityFailed`.
 */
export async function readUserActivity(
  source: UserActivitySource,
  userId: string,
  limit: number,
): Promise<UserActivitySection> {
  if (!userId || limit <= 0) return { activity: [], truncated: false }

  const [selfRows, operatorRows] = await Promise.all([
    source.listRows([
      Query.equal('actorId', userId),
      // Ältere Zeilen können `null` statt '' tragen — beides heißt „kein Ziel".
      Query.or([Query.equal('targetId', ''), Query.isNull('targetId')]),
      ...hiddenActionQueries(),
      Query.orderDesc('$createdAt'),
      Query.limit(limit + 1),
    ]),
    source.listRows([
      Query.equal('targetId', userId),
      Query.equal('targetType', 'user'),
      ...hiddenActionQueries(),
      Query.orderDesc('$createdAt'),
      Query.limit(limit + 1),
    ]),
  ])

  const { rows, truncated } = mergeUserActivityRows([selfRows, operatorRows], userId, limit)

  const activity: AdminUserActivity[] = []
  for (const row of rows) {
    const first = userActivityFromAuditRow(row, userId)
    if (!first) continue
    // Ort NUR für Selbst-Zeilen: die IP einer Betreiber-Zeile gehört dem
    // Betreiber, für sie wird gar nicht erst nachgeschlagen.
    const place = first.origin === 'self' && first.ip
      ? await source.resolvePlace(first.ip).catch(() => '')
      : ''
    activity.push(place ? { ...first, place } : first)
  }

  return { activity, truncated }
}

/** Verdrahtung mit Appwrite und der lokalen Orts-Datenbank. Darf werfen. */
export async function listUserActivity(event: H3Event, userId: string, limit: number): Promise<UserActivitySection> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  return readUserActivity({
    listRows: async (queries) => {
      const res = await tablesDB.listRows<AuditRow>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: 'audit_logs',
        queries,
      })
      return res.rows
    },
    // `lookupCityForIp` ist selbst fail-soft (kein Pfad, private IP, kein
    // Treffer ⇒ null) — dieselbe Kette wie die Sitzungsliste derselben Route.
    resolvePlace: async ip => formatAccountEventPlace(await lookupCityForIp(event, ip)),
  }, userId, limit)
}
