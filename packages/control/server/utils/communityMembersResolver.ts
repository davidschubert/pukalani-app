import { Client, Query, TablesDB } from 'node-appwrite'
import { createMicrocache } from '../../../core/server/utils/microcache'
import type { CommunityMemberLookup, CommunityRoleResolver } from '../../../core/server/utils/communityPermission'
import type {
  FormerCommunityMembersLookup,
  FormerCommunityMembersResolver,
  FormerMembersByTenantLookup,
  FormerMembersByTenantResolver,
} from '../../../core/server/utils/communityMembership'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * G1 — Resolver-Implementierung über die community_members-Table des Control Plane
 * (Migration control-015). Eine Platform-App registriert das Ergebnis per
 * Nitro-Plugin:
 *
 *   registerCommunityRoleResolver(createCommunityMembersResolver({ endpoint, projectId,
 *     apiKey, databaseId }))
 *
 * Verbindungsdaten EXPLIZIT (kein useRuntimeConfig): der prüfende Request läuft
 * im Runtime-Projekt (Pool/Silo), die Rollen aber liegen im Control Plane —
 * Cross-Projekt-Read mit read-only-Key (Scope rows.read), dieselbe Verbindung
 * wie der tenants-Resolver.
 *
 * Cache (Default 30 s) macht die Revoke-Latenz ≤ Cache-TTL (Anforderung ≤60 s).
 * Nur ERFOLGREICHE Reads werden gecacht — inkl. „keine Mitgliedschaft" (null).
 * Ein transienter Lesefehler cacht NICHT (kein 30-s-Aussperren echter User);
 * der Request wird trotzdem fail-closed (null → 403), retryt aber sofort.
 */

export interface CommunityMembersResolverOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
  /** Cache-Dauer der Rollen-Auflösung. Default 30 s (Revoke ≤30 s). */
  cacheTtlMs?: number
}

/** Cache-Key: alle drei Anker-Werte, NUL-getrennt (kollisionssicher). */
export function communityMemberCacheKey(lookup: CommunityMemberLookup): string {
  return `${lookup.communityId}\u0000${lookup.runtimeProjectId}\u0000${lookup.runtimeUserId}`
}

export function createCommunityMembersResolver(options: CommunityMembersResolverOptions): CommunityRoleResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  const cache = createMicrocache<string | null>(options.cacheTtlMs ?? 30_000)

  return async (lookup: CommunityMemberLookup): Promise<string | null> => {
    if (!lookup.communityId || !lookup.runtimeProjectId || !lookup.runtimeUserId) return null

    const key = communityMemberCacheKey(lookup)
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    try {
      const { rows } = await tablesDB.listRows<CommunityMemberRow>({
        databaseId: options.databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        queries: [
          Query.equal('communityId', lookup.communityId),
          Query.equal('runtimeProjectId', lookup.runtimeProjectId),
          Query.equal('runtimeUserId', lookup.runtimeUserId),
          Query.equal('status', 'active'),
          Query.limit(1),
        ],
      })
      const role = rows[0]?.role ?? null
      cache.set(key, role)
      return role
    }
    catch {
      // Transienter Cross-Projekt-Fehler: NICHT cachen (sofortiger Retry beim
      // nächsten Request), aber fail-closed für diesen Request.
      return null
    }
  }
}

/**
 * N9 — der GEBÜNDELTE Vertrag (core/server/utils/communityMembership.ts): „welche
 * dieser Autoren sind ehemalige Mitglieder dieser Community?"
 *
 * Warum nicht der Einzel-Resolver in einer Schleife: eine Kommentarliste hat bis
 * zu 25 (und mit Antworten mehr) Autoren. 25 Cross-Projekt-Abfragen pro
 * Seitenaufruf wären die klassische N+1-Falle — nur teurer, weil jede über
 * Projektgrenzen geht. Hier ist es EINE Abfrage je 100 unbekannter IDs.
 *
 * Gecacht wird PRO NUTZER, nicht pro Anfrage-Menge (60 s). Das ist der Punkt, an
 * dem dieser Cache sich von einem Set-basierten unterscheidet: in einem Thread
 * wiederholen sich die Autoren über Seiten und über Besucher hinweg, und ein
 * Cache pro Menge hätte für jede neue Zusammenstellung einen Fehltreffer. So
 * bezahlt der zweite Aufruf nur die Autoren, die neu dazugekommen sind — auf
 * einem lebhaften Thread meist keinen einzigen.
 *
 * Auch das NEGATIVE Ergebnis wird gecacht (der Normalfall „ist kein ehemaliges
 * Mitglied"): ohne das würde jeder gewöhnliche Autor bei JEDEM Aufruf erneut
 * gefragt, und der Cache wäre wirkungslos. Fehler cachen nie.
 *
 * 60 s statt 30 s wie bei den Rollen ist bewusst: hier hängt kein Zugriff dran,
 * nur ein Hinweis-Zeichen — eine Minute Verzögerung ist billiger als die halbe
 * Trefferquote.
 */
export interface FormerMembersResolverOptions extends CommunityMembersResolverOptions {
  /** Cache-Dauer je Nutzer. Default 60 s. */
  cacheTtlMs?: number
}

export function createFormerCommunityMembersResolver(
  options: FormerMembersResolverOptions,
): FormerCommunityMembersResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  const cache = createMicrocache<boolean>(options.cacheTtlMs ?? 60_000)

  return async (lookup: FormerCommunityMembersLookup): Promise<string[]> => {
    if (!lookup.communityId || !lookup.runtimeProjectId) return []

    const ids = [...new Set(lookup.runtimeUserIds.filter(Boolean))]
    if (ids.length === 0) return []

    const former: string[] = []
    const unknown: string[] = []
    for (const id of ids) {
      const cached = cache.get(formerMemberCacheKey(lookup.communityId, lookup.runtimeProjectId, id))
      if (cached === undefined) unknown.push(id)
      else if (cached) former.push(id)
    }
    if (unknown.length === 0) return former

    try {
      // Query.equal nimmt maximal 100 Werte → in Blöcken.
      for (let i = 0; i < unknown.length; i += 100) {
        const chunk = unknown.slice(i, i + 100)
        const { rows } = await tablesDB.listRows<CommunityMemberRow>({
          databaseId: options.databaseId,
          tableId: COMMUNITY_MEMBERS_TABLE,
          queries: [
            Query.equal('communityId', lookup.communityId),
            Query.equal('runtimeProjectId', lookup.runtimeProjectId),
            Query.equal('runtimeUserId', chunk),
            Query.equal('status', 'removed'),
            Query.select(['runtimeUserId']),
            Query.limit(chunk.length),
          ],
        })
        const hits = new Set(rows.map(row => row.runtimeUserId))
        for (const id of chunk) {
          const isFormer = hits.has(id)
          cache.set(formerMemberCacheKey(lookup.communityId, lookup.runtimeProjectId, id), isFormer)
          if (isFormer) former.push(id)
        }
      }
      return former
    }
    catch {
      // Fail-soft: das Zeichen fehlt, die Liste bleibt heil. Nichts cachen —
      // der nächste Aufruf versucht es sofort wieder.
      return former
    }
  }
}

/** Cache-Key des gebündelten Lookups — Trenner wie bei communityMemberCacheKey. */
export function formerMemberCacheKey(communityId: string, projectId: string, userId: string): string {
  return `${communityId}\u0000${projectId}\u0000${userId}`
}

/**
 * „EHEMALIG?" ÜBER DEN ABLAGE-STEMPEL (MM1 b, 2026-11-17) — der Vertrag
 * `FormerMembersByTenantResolver` aus dem Core.
 *
 * Benachrichtigungen kennen ihre Community nur über den Stempel der Zeile
 * (`communities.tenantId`), und Läufe ohne Request (Termin-Erinnerungen,
 * Sammel-Mail) haben gar keinen Mandanten. Hier wird der Stempel in den
 * Anker der Mitgliedschaft übersetzt (`communities.$id` + Projekt) und dann
 * DERSELBE gebündelte Resolver gefragt wie für das Zeichen in der
 * Kommentarliste — eine Regel für „ehemalig", ein Cache je Konto.
 *
 * Der Anker wird je Stempel 60 s gehalten (auch „gibt es nicht"); er ändert
 * sich im Leben einer Community nie. BEWUSST OHNE Filter auf den Zustand der
 * Community: eine stillgelegte Community hat alle Mitgliedschaften entzogen —
 * genau das soll die Antwort sagen. Fehler werden nicht gehalten und ergeben
 * eine leere Antwort (fail-soft, wie der Vertrag es verlangt).
 */
export function createFormerMembersByTenantResolver(
  options: FormerMembersResolverOptions,
  former: FormerCommunityMembersResolver = createFormerCommunityMembersResolver(options),
): FormerMembersByTenantResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  const anchors = createMicrocache<{ communityId: string, runtimeProjectId: string } | null>(options.cacheTtlMs ?? 60_000)

  return async (lookup: FormerMembersByTenantLookup): Promise<string[]> => {
    if (!lookup.tenantId || lookup.runtimeUserIds.length === 0) return []

    let anchor = anchors.get(lookup.tenantId)
    if (anchor === undefined) {
      try {
        const { rows } = await tablesDB.listRows<TenantRow>({
          databaseId: options.databaseId,
          tableId: COMMUNITIES_TABLE,
          queries: [
            Query.equal('tenantId', lookup.tenantId),
            Query.select(['$id', 'projectId']),
            Query.limit(1),
          ],
        })
        const row = rows[0]
        anchor = row?.$id && row.projectId ? { communityId: row.$id, runtimeProjectId: row.projectId } : null
        anchors.set(lookup.tenantId, anchor)
      }
      catch {
        return []
      }
    }
    if (!anchor) return []

    return await former({ ...anchor, runtimeUserIds: lookup.runtimeUserIds })
  }
}
