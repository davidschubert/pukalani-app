import type { Capability } from '../../../../core/shared/types/authz'
import type { DashboardStatValue, PukalaniDashboardStatConfig } from '../../../../core/shared/types/dashboard-stat'
import { resolveDashboardStats } from '../../../../core/shared/types/dashboard-stat'
import { hasCapability } from '../../../../core/shared/authz'
import { communityRoleHasCapability } from '../../../../core/shared/communityAuthz'
import { configFlagEnabled, resolveDashboardPlace } from '../../../../core/shared/dashboardNav'
import { isProductStateEnabled } from '../../../../core/shared/types/config'
import { planAllowsProduct } from '../../../../core/server/utils/tenantPlanProducts'
import { requireOverviewAccess } from '../../utils/overviewAccess'

/**
 * DIE ZAHLEN DER ÜBERSICHT — EINE Route für ALLE Kacheln (U9/K2, 2026-08-11).
 *
 * Vorher standen hier drei fest verdrahtete Felder (`usersTotal`,
 * `commentsTotal`, `commentsReported`) aus der Silo-Vergangenheit von
 * `apps/comments`. Jetzt beantwortet die Route eine allgemeinere Frage: „welche
 * Kennzahlen sieht DIESER Betrachter an DIESEM Ort — und wie lauten sie?"
 * Die Kacheln melden die Layer selbst an (`pukalani.admin.stats`), die Zahlen
 * liefern ihre Provider (`registerDashboardStatValueProvider`).
 *
 * WARUM GEBÜNDELT: die Übersicht ist die meistbesuchte Seite des Dashboards.
 * Eine Kachel, die sich ihre Zahl selbst holt, wäre ein Request pro Kachel —
 * bei sieben Kacheln sieben Verbindungen für eine Landeseite. Derselbe
 * Grundsatz wie beim Aktivitäts-Vertrag (AH-3).
 *
 * ERST FILTERN, DANN ZÄHLEN — und das ist keine Optimierung, sondern die
 * Autorisierung. `resolveDashboardStats` ist DIESELBE pure Regel, die die
 * Seite fürs Rendern benutzt (Ort × Capability × Produkt-Gates). Sie
 * entscheidet hier, WELCHE Zahlen überhaupt erhoben werden — ohne das wäre die
 * gebündelte Route eine Abkürzung um die Capability herum: sie liefe unter
 * `dashboard.access` und gäbe einem `viewer` die Zahl der offenen Meldungen.
 * Die Provider prüfen zusätzlich selbst, wo eine Zahl mehr verrät als die
 * Kachel (C1) — zwei Netze, weil ein Deklarations-Fehler in einer Registry
 * weit trägt.
 *
 * AUTORISIERUNG (C1): `await requireCommunityPermission(event,
 * 'dashboard.access')`, seit BT1 e verpackt in `requireOverviewAccess` — im
 * Pool-Not-Zugang kommt nur der Betreiber (Label `admin`) durch, nicht das
 * Instanz-Label `moderator`. Das ist der Gate der SEITE — alle fünf Site-Rollen
 * tragen ihn und landen hier (communityAuthz.ts). Was jemand von den Zahlen
 * sieht, entscheidet die Kachel, nicht der Gate; eine engere Capability hier
 * ließe Editor und Viewer wieder vor leeren Kacheln stehen. Das `await` ist
 * Pflicht: `requireCommunityPermission` ist bewusst asynchron.
 *
 * DER ORT KOMMT AUS DEM AUFGELÖSTEN KONTEXT, nicht aus der Host-Rechnung:
 * `isTenantHost` (shared/controlCenter.ts) ist die Ausschluss-Rechnung FÜR DEN
 * BROWSER; serverseitig liegt die Wahrheit in `useTenant(event)`. Beide Wege
 * enden am selben Ort, aber nur einer davon kann hier nicht lügen.
 *
 * NUTZERZAHL IM POOL (Befund B2): die Kachel ist heute eine Deklaration mit
 * `scope: 'operator'` (packages/admin/app/app.config.ts) und verschwindet damit
 * auf jedem Mandanten-Host von selbst — die Regel steht jetzt an der Kachel
 * statt als `null` im Rückgabe-Objekt. Ihr Provider zählt zusätzlich nur
 * außerhalb des Pools; die Begründung steht dort.
 */
export default defineEventHandler(async (event): Promise<Record<string, DashboardStatValue>> => {
  const { user, role } = await requireOverviewAccess(event)

  const appConfig = useAppConfig() as {
    pukalani?: {
      tenancy?: { enabled?: boolean, products?: Record<string, string | undefined>, quota?: { plans?: Record<string, unknown> } }
      admin?: { stats?: PukalaniDashboardStatConfig }
    }
  }
  const pukalani = appConfig.pukalani
  const tenant = useTenant(event)
  const place = resolveDashboardPlace(pukalani?.tenancy?.enabled === true, tenant?.mode === 'pool')

  // Dieselben zwei Rechte-Quellen wie in der Nav (N1) und BEWUSST getrennt:
  // ein Betreiber-Eintrag ist nie über eine Community-Rolle erreichbar.
  const canAsOperator = (capability: Capability) => hasCapability(user.labels ?? [], capability)
  const canAsMember = (capability: Capability) => (role ? communityRoleHasCapability(role, capability) : false)

  // Produkt-Gates wie im Layout — nur eben aus den Server-Quellen. Die
  // Laufzeit-Flags sind 5 s gecacht (productGates.ts), der Tarif ist eine reine
  // Config-Rechnung: beide kosten hier keine Abfrage.
  const products = await getEffectiveProducts(event)
  const planOrder = Object.keys(pukalani?.tenancy?.quota?.plans ?? {})
  const poolPlan = tenant?.mode === 'pool' ? tenant.plan : undefined

  const visible = resolveDashboardStats(pukalani?.admin?.stats, {
    place,
    canAsOperator,
    canAsMember,
    productOn: productKey => !productKey || isProductStateEnabled(products[productKey]),
    planOn: planProduct => planAllowsProduct(planOrder, pukalani?.tenancy?.products, poolPlan, planProduct),
    configOn: configFlag => configFlagEnabled(pukalani, configFlag),
  })

  return await collectDashboardStatValues(event, new Set(visible.map(stat => stat.id)))
})
