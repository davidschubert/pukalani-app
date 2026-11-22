/**
 * EIGENE DOMAIN: MITMACHEN JA, VERWALTEN NEIN (PK1 E1b-2).
 *
 * Nur im Modus `write` (`NUXT_SITE_CARD_MODE`) und nur auf einer eigenen
 * Domain einer Community (`isCustomDomainHost`). Dann:
 *  - `event.context.customDomainScope = true` — der Seitenaufbau spiegelt es
 *    in den Browser (`tenant-brand.server.ts`), damit die Oberfläche keine
 *    Konto- und Verwaltungs-Links ins Leere zeigt und keinen Token für die
 *    Live-Verbindung holt;
 *  - jede `/api/**`-Route, die nicht auf der Erlaubnisliste steht, antwortet
 *    404 — dieselbe Antwort wie eine unbekannte Route (Regel, Liste und
 *    Gründe: `core/shared/customDomainScope.ts`).
 *
 * Mit `off`/`read`, auf der Pukalani-Adresse, auf Kontroll-Hosts und in Apps
 * ohne Mandanten-Trennung ändert sich nichts.
 *
 * Läuft nach `00.tenant.ts` (der Mandant muss aufgelöst sein) und VOR
 * `02.auth.ts`: eine verbotene Route kostet so keinen Appwrite-Aufruf.
 */
import { isCustomDomainApiAllowed } from '../../shared/customDomainScope'
import { isCustomDomainHost } from '../../shared/siteCard'
import { getProductRegistry } from '../utils/productRegistry'
import { liveRelayReady, siteCardSettings } from '../utils/siteCard'
import { normalizeHost } from '../utils/tenantResolver'

/** `apiPrefixes` aller registrierten Layer der Art `product`. */
function communityProductPrefixes(): string[] {
  const prefixes: string[] = []
  for (const manifest of getProductRegistry().values()) {
    if (manifest.kind !== 'product') continue
    prefixes.push(...(manifest.apiPrefixes ?? []))
  }
  return prefixes
}

export default defineEventHandler((event) => {
  if (siteCardSettings().mode !== 'write') return
  const tenant = event.context.tenant
  if (!tenant) return
  const host = normalizeHost(getHeader(event, 'host'))
  if (!isCustomDomainHost(host, tenant)) return

  event.context.customDomainScope = true
  // PK1 E1d: läuft die Live-Verbindung hier über unseren Server? Der
  // Seitenaufbau spiegelt es (`useLiveRelay`), damit der Browser nur dann
  // `/api/live` anspricht, wenn es den Dienst wirklich gibt.
  if (liveRelayReady()) event.context.liveRelay = true

  if (!isCustomDomainApiAllowed(event.path, communityProductPrefixes(), event.method)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
})
