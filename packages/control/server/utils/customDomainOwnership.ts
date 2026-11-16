/**
 * WEM GEHÖRT DIESE DOMAIN SCHON? — über BEIDE Sorten Site (control-036).
 *
 * Seit es eigene Domains für Pool-Communities (control-035) UND für Silos
 * (control-036) gibt, kann eine Domain auf zwei verschiedene Arten belegt
 * sein: als `communities.customDomain` oder als `websites.customDomain`. Beide
 * Tabellen leben im selben Control-Plane-Projekt, beide Adressen zeigen auf
 * dieselben Server.
 *
 * Fragte jede Seite nur ihre eigene Tabelle, wäre `www.kunde.de` gleichzeitig
 * an eine Community und an ein Silo vergebbar. Beide bekämen ihren Alias bzw.
 * Tenant bei ploi, und wer dann tatsächlich antwortet, entschiede die
 * Reihenfolge der nginx-vHosts — also nichts, worauf man zeigen könnte. Der
 * Kunde, dessen Domain „manchmal die falsche Seite" zeigt, hat dann ein
 * Problem, das man nicht mehr nachvollziehen kann.
 *
 * Also EINE Frage an beide Tabellen, und zwar über BEIDE FORMEN (www ↔ Apex):
 * trägt jemand `www.kunde.de`, ist auch `kunde.de` vergeben — sie lösen auf
 * dieselbe Seite auf.
 *
 * ── EIN BLOSSER EINTRAG BLOCKIERT NIEMANDEN (control-040, SEC-022) ─────────
 * Bis control-040 zählte jede Zeile, die die Domain trug — auch `pending_dns`,
 * also ein Eintrag OHNE jeden Nachweis. Wer eine fremde Domain zuerst
 * eintippte, sperrte sie damit für jede andere Community auf Dauer. Jetzt
 * zählt eine COMMUNITY-Zeile nur, wenn sie den Nachweis schon geführt hat
 * (`customDomainHasProof`: `pending_cert`, `pending_platform`, `active`,
 * `paused`). Pool-Aufrufer sagen das mit `onlyProvenCommunities: true`.
 *
 * Weil damit zwei Communities gleichzeitig unbewiesene Einträge derselben
 * Domain halten können, fragt `verify.post.ts` NOCH EINMAL in dem Moment, in
 * dem der Nachweis gelingt — der erste Nachweis gewinnt, der zweite bleibt
 * mit `409 domain_taken` in `pending_dns`. Was bleibt, ist das Fenster
 * zwischen zwei GLEICHZEITIGEN Nachweisen (Millisekunden); beide müssten
 * dafür ihr Token in DERSELBEN Zone stehen haben — also derselbe Mensch.
 *
 * ── SILO-ZEILEN (`websites`) ZÄHLEN WIE BISHER IMMER ──────────────────────
 * Ihr Status-Wertebereich ist derselbe, die Regel aber nicht: Silo-Domains
 * trägt der Betreiber oder der Silo-Owner ein, es gibt für sie keinen Verfall
 * eines Eintrags, und ihr Prüf-Weg (`siteDomainService.ts`) fragt beim
 * Nachweis nicht noch einmal nach. Für SILO-Aufrufer zählt deshalb auch jede
 * Community-Zeile weiter (ohne `onlyProvenCommunities`) — sonst könnten eine
 * Community und ein Silo dieselbe Domain bis zum Nachweis tragen, und der
 * Silo-Weg merkte die Kollision nicht.
 */
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { customDomainForms, customDomainHasProof } from '../../shared/customDomain'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { WEBSITES_TABLE, type WebsiteRow } from '../../shared/types/website'

export interface DomainOwnershipQuery {
  /** Die eingetragene Form; beide Formen werden daraus gerechnet. */
  domain: string
  /** Row-Id der Community, die sie schon haben DARF ('' = keine). */
  allowCommunityId?: string
  /** Row-Id der Website, die sie schon haben DARF ('' = keine). */
  allowWebsiteId?: string
  /**
   * true = eine fremde COMMUNITY-Zeile zählt nur mit Nachweis
   * (`customDomainHasProof`). Setzen nur die Pool-Routen (control-040);
   * `websites`-Zeilen zählen immer.
   */
  onlyProvenCommunities?: boolean
}

/**
 * true = die Domain (oder ihre Geschwister-Form) gehört bereits jemand
 * ANDEREM. Wirft nur, wenn die Abfrage selbst scheitert — ein Lesefehler darf
 * hier NICHT als „frei" durchgehen.
 */
export async function customDomainTakenByOther(
  event: H3Event,
  query: DomainOwnershipQuery,
): Promise<boolean> {
  const forms = customDomainForms(query.domain)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const [communities, websites] = await Promise.all([
    admin.tablesDB.listRows<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE,
      // 25 statt 5 (control-040): unbewiesene Einträge blockieren nicht mehr
      // und dürfen sich deshalb häufen — eine bewiesene Zeile darf nicht hinter
      // fünf bloßen Einträgen aus dem Fenster fallen.
      queries: [Query.equal('customDomain', forms), Query.limit(25)],
    }),
    admin.tablesDB.listRows<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.equal('customDomain', forms), Query.limit(5)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Could not check domain') })

  return communities.rows.some(row => row.$id !== query.allowCommunityId
    && (!query.onlyProvenCommunities || customDomainHasProof(row.customDomainStatus)))
  || websites.rows.some(row => row.$id !== query.allowWebsiteId)
}
