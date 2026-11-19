import { Client, Query, TablesDB } from 'node-appwrite'
import type { UnreachableCommunitiesResolver } from '../../../core/server/utils/communityReachability'
import { communityUnreachableReason } from '../../shared/communityReachability'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * SE1 d — die Antwort auf den core-Vertrag
 * `registerUnreachableCommunitiesResolver`: viele Ablage-Stempel → welche
 * davon sind NICHT erreichbar (stillgelegt oder wegen Missbrauchs gesperrt)?
 *
 * Dieselbe Bauart wie `createCommunityHostResolver` nebenan: explizite
 * Verbindungsdaten (der Leser läuft im Runtime-Projekt, die Zeilen liegen im
 * Control Plane), read-only-Key.
 *
 * NACHGESCHLAGEN WIRD `tenantId`, NICHT `$id`: der Stempel einer Termin-Zeile
 * ist der Zeilen-Scope des Pools (`t-…`, `scopeRowFor`). Genagelt in
 * packages/control/tests/unreachableCommunitiesResolver.test.ts.
 *
 * OHNE STATUS-FILTER IN DER ABFRAGE: ein `Query.equal('status', 'active')` wie
 * beim Host-Resolver ließe gerade die stillgelegten Zeilen weg — „stillgelegt"
 * wäre dann nicht mehr von „unbekannt" zu unterscheiden. Und `suspension` ist
 * eine optionale Spalte (control-034): ein `Query.notEqual` sortierte in
 * SQL-Semantik jede Zeile mit NULL mit aus. Beide Spalten reisen deshalb in
 * `Query.select` mit, entschieden wird im Code (`communityUnreachableReason`).
 *
 * NUR EINE POSITIVE TATSACHE NENNT EINE COMMUNITY: genannt wird, was eine
 * Zeile HAT und laut Regel nicht erreichbar ist. Ein Stempel ohne Zeile wird
 * NICHT genannt — unbekannt heißt erinnern (Regel im Kopf des core-Vertrags).
 *
 * FEHLER WERDEN NICHT GESCHLUCKT: ein Lesefehler wirft. Erst der core-Vertrag
 * fängt ihn und macht daraus `answered: false`; schluckte der Resolver ihn
 * selbst, sähe eine Störung aus wie „alle erreichbar".
 *
 * KEIN ZWISCHENSPEICHER: der einzige Aufrufer (der Zeit-Lauf
 * `event-reminders`) fragt einmal je Stunde, gebündelt — ein Cache spart dort
 * nichts. Und er hielte eine AUFGEHOBENE Sperre fest: eine Community, die
 * gerade wieder ans Netz ging, bekäme bis zum Ablauf keine Erinnerung.
 *
 * KEIN eigener Index: `communities` hat eine Zeile je Kunde; derselbe
 * Gleichheitsfilter auf `tenantId` wie beim Host-Resolver.
 */

export interface UnreachableCommunitiesResolverOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
}

/** Query.equal nimmt höchstens 100 Werte. */
const CHUNK = 100

export function createUnreachableCommunitiesResolver(options: UnreachableCommunitiesResolverOptions): UnreachableCommunitiesResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )

  return async (communityIds: string[]): Promise<string[]> => {
    const ids = [...new Set(communityIds.filter(Boolean))]
    const unreachable: string[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { rows } = await tablesDB.listRows<TenantRow>({
        databaseId: options.databaseId,
        tableId: COMMUNITIES_TABLE,
        queries: [
          Query.equal('tenantId', chunk),
          Query.select(['tenantId', 'status', 'suspension']),
          Query.limit(chunk.length),
        ],
      })
      const asked = new Set(chunk)
      for (const row of rows) {
        if (asked.has(row.tenantId) && communityUnreachableReason(row) !== null) unreachable.push(row.tenantId)
      }
    }
    return [...new Set(unreachable)]
  }
}
