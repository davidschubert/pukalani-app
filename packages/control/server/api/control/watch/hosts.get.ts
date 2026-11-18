import { Query } from 'node-appwrite'
import { listAllRows } from '../../../../../core/server/utils/listAllRows'
import { COMMUNITIES_TABLE } from '../../../../shared/types/tenantRecord'
import { WEBSITES_TABLE } from '../../../../shared/types/website'
import {
  collectWatchHosts,
  type WatchCommunityRow,
  type WatchHostsResponse,
  type WatchWebsiteRow,
} from '../../../../shared/watchHosts'
import { requireWatchCaller } from '../../../utils/watchHostsGate'
import type { Models } from 'node-appwrite'

/**
 * WÄCHTER: DIE KUNDENDOMAINS, DIE GEPRÜFT WERDEN SOLLEN (WA1 d).
 *
 * Der Produktions-Wächter (GitHub Actions) kannte Kundendomains nur aus einer
 * von Hand gepflegten Liste. Diese Route gibt ihm die Liste aus dem Register:
 * live geschaltete eigene Domains von Pool-Communities und Einzel-Sites,
 * sonst nichts (Regel und Begründung: `shared/watchHosts.ts`).
 *
 * WER DARF: nur, wer das Wächter-Geheimnis schickt (`requireWatchCaller`) —
 * ohne gesetztes Geheimnis gibt es die Route nicht (404).
 *
 * WAS HINAUSGEHT: je Host der Name und ein Ja/Nein „antwortet selbst". Keine
 * Kennung, kein Name einer Community, nichts über Personen. Gelesen werden je
 * Tabelle nur die Spalten, die die Rechnung braucht (`Query.select`).
 *
 * NIE ZWISCHENGESPEICHERT: `Cache-Control: no-store` — die Antwort hängt an
 * einer Kopfzeile, die ein Zwischenspeicher nicht kennt.
 *
 * Ein Lesefehler ist ein 5xx, keine leere Liste: der Wächter unterscheidet
 * „keine Kundendomains" von „nicht gelesen" und prüft bei „nicht gelesen"
 * seine feste Liste weiter.
 */
export default defineEventHandler(async (event): Promise<WatchHostsResponse> => {
  requireWatchCaller(event)
  setHeader(event, 'Cache-Control', 'no-store')

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  // Vollständig, nicht die erste Seite (Index idx_custom_domain) — eine
  // gekappte Liste ließe genau die jüngste Kundendomain ungeprüft.
  const [communities, websites] = await Promise.all([
    listAllRows<Models.Row & WatchCommunityRow>(tablesDB, databaseId, COMMUNITIES_TABLE, [
      Query.notEqual('customDomain', ''),
      Query.select(['$id', 'status', 'suspension', 'customDomain', 'customDomainStatus']),
    ]),
    listAllRows<Models.Row & WatchWebsiteRow>(tablesDB, databaseId, WEBSITES_TABLE, [
      Query.notEqual('customDomain', ''),
      Query.select(['$id', 'customDomain', 'customDomainStatus']),
    ]),
  ]).catch((error) => { throw toH3Error(error, 'Could not read watch hosts') })

  return { hosts: collectWatchHosts({ communities, websites }) }
})
