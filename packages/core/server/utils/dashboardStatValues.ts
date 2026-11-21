import type { H3Event } from 'h3'
import type { DashboardStatValue } from '../../shared/types/dashboard-stat'
import { softFail } from './softFail'

/**
 * DIE ZAHLEN zur Kennzahlen-Registry (U9/K2, 2026-08-11) — die zweite Hälfte
 * von `pukalani.admin.stats` (core/shared/types/dashboard-stat.ts).
 *
 * Die KACHEL steht in `app.config` und ist ohne Request bekannt. Die ZAHL kann
 * nur der Layer liefern, dem die Tabelle gehört (A14) — also dasselbe Muster
 * wie `registerCommunityUsageCounter`, `registerUserDataContributor` und
 * `registerCommunityFirstContentProvider`: der Produkt-Layer meldet sich per
 * Nitro-Plugin selbst an, der Konsument sammelt ein.
 *
 * WARUM EIN PROVIDER JE LAYER UND NICHT JE KACHEL: die Übersicht ist die
 * meistbesuchte Seite des Dashboards. Ein Provider je Kachel hieße, dass ein
 * Layer mit drei Zahlen dreimal dieselbe Verbindung aufmacht; so kann er seine
 * Abfragen bündeln (der onboarding-Layer holt Mitglieder und Einladungen in
 * EINEM Ruf ans Control Plane).
 *
 * `ids` IST DIE EINKAUFSLISTE, NICHT EINE BITTE: die Route hat vorher mit
 * `resolveDashboardStats` ausgerechnet, welche Kacheln dieser Betrachter an
 * diesem Ort überhaupt sieht. Ein Provider, der ungefragt Zahlen erhebt,
 * bezahlt Abfragen für Kacheln, die niemand sieht — und liefert im
 * schlimmsten Fall etwas aus, das der Filter gerade ausgeschlossen hat.
 * Deshalb: NICHTS erheben, was nicht in `ids` steht.
 *
 * DER FILTER ERSETZT DIE EIGENE PRÜFUNG NICHT. Er ist eine Sicht-Regel (Ort,
 * Capability, Produkt) und kennt den INHALT der Zahl nicht. Wo eine Zahl mehr
 * verrät als die Kachel (offene Meldungen sind Moderations-Wissen, C1), prüft
 * der Provider zusätzlich selbst — zwei Netze, weil eine Registry ein
 * Deklarations-Fehler weit tragen kann.
 *
 * MUSS DEGRADIEREN, nie werfen: eine fehlende Kennzahl lässt eine Kachel
 * entfallen, ein Fehler nähme die ganze Landeseite mit. Teilfehler werden
 * hier abgefangen (`catch → {}`), damit ein Layer den anderen nicht mitreißt.
 */
export interface DashboardStatValueProvider {
  /** Stabile Id des LIEFERANTEN (Layer), z. B. 'comments', 'onboarding'. */
  id: string
  /**
   * Die Zahlen zu den angefragten Kachel-Ids. Rückgabe-Keys sind KACHEL-Ids
   * (`pukalani.admin.stats`), nicht Layer-Ids. Was nicht geliefert wird, hat
   * keine Kachel.
   */
  collect(event: H3Event, ids: ReadonlySet<string>): Promise<Record<string, DashboardStatValue>>
}

const providers = new Map<string, DashboardStatValueProvider>()

export function registerDashboardStatValueProvider(provider: DashboardStatValueProvider): void {
  providers.set(provider.id, provider)
}

/**
 * Alle angefragten Kennzahlen einsammeln — parallel, Teilfehler = leer.
 *
 * Ein Provider, der für keine der angefragten Ids zuständig ist, wird gar nicht
 * erst gefragt? Nein — er WIRD gefragt und antwortet leer. Das ist billiger als
 * ein zweites Register „welcher Provider kann welche Id" , das mit den
 * Deklarationen auseinanderlaufen könnte; die Kosten trägt ohnehin nur, wer
 * eine Abfrage macht, und die macht ein Provider nur für Ids aus `ids`.
 */
export async function collectDashboardStatValues(
  event: H3Event,
  ids: ReadonlySet<string>,
): Promise<Record<string, DashboardStatValue>> {
  if (ids.size === 0) return {}
  const results = await Promise.all(
    [...providers.values()].map(provider =>
      provider.collect(event, ids).catch(softFail('core:utils/dashboardStatValues:collect', {} as Record<string, DashboardStatValue>)),
    ),
  )
  return Object.assign({}, ...results) as Record<string, DashboardStatValue>
}
