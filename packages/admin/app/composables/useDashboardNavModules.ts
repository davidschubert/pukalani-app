import type { ComputedRef } from 'vue'
import type { Capability } from '../../../core/shared/types/authz'
import type { DashboardNavFilter, DashboardPlace } from '../../../core/shared/dashboardNav'
import {
  configFlagEnabled,
  filterDashboardModules,
  resolveDashboardPlace,
  scopeVisibleAt,
} from '../../../core/shared/dashboardNav'
import { isProductStateEnabled } from '../../../core/shared/types/config'

/**
 * DIE ZUTATEN DER DASHBOARD-NAVIGATION — EINMAL GERECHNET (NAV1 Paket 3).
 *
 * Bis hierher standen Ort, die zwei Rechte-Quellen und die drei Produkt-Gates
 * nur im Layout (`packages/admin/app/layouts/dashboard.vue`). Solange die
 * Seitenleiste der einzige Leser war, war das richtig. Seit die Konto-Seite
 * „Navigation" dieselbe Liste zum Sortieren anbietet
 * (docs/plans/DASHBOARD-NAV-JE-PERSON.md), gibt es einen ZWEITEN Leser — und
 * zwei Kopien derselben Filterrechnung wären genau der Bruch, den der Editor
 * der Site-Navigation schon einmal hatte: er böte Einträge an, die die Leiste
 * nie zeigt, oder verschwiege welche, die sie zeigt.
 *
 * HIER STEHT NUR, WOHER DIE EINGABEN KOMMEN. Die Regeln selbst bleiben pur und
 * unit-getestet in `core/shared/dashboardNav.ts`; dieses Composable hält keine
 * eigene Rechte-Liste und keine zweite Gruppen-Reihenfolge.
 *
 * Die PERSÖNLICHE Reihenfolge (`applyDashboardNavPrefs`) gehört bewusst NICHT
 * hierher: die Seitenleiste legt sie auf, die ⌘K-Suche nicht (Zusage 5), und
 * der Editor braucht die Liste sogar OHNE `hidden`, um Ausgeblendetes
 * anzeigen zu können. Ein Composable, das sie schon mitbrächte, müsste alle
 * drei Fälle als Optionen tragen.
 */
export interface DashboardNavModulesContext {
  /** Der Ort, an dem die Shell läuft (E9) — eine Tatsache des Requests. */
  place: DashboardPlace
  /** Darf die Betreiber-Ebene hier überhaupt stehen? (hart verdrahtete Links) */
  operatorHere: boolean
  /** Globales Operator-Label (authz.ts) — die INSTANZ-weite Rechte-Quelle. */
  canAsOperator: (capability: Capability) => boolean
  /** Rolle in DIESER Community (communityAuthz.ts) — die zweite Quelle. */
  canAsMember: (capability: Capability) => boolean
  /** Beide zusammen — für hart verdrahtete Links, Unterpunkte und die Suche. */
  can: (capability: Capability) => boolean
  /** Laufzeit-Produkt-Gate (F2, Betreiber-Schalter über app_config). */
  productOn: (productKey?: string) => boolean
  /** Tarif-Produkt-Gate im Pool (C2, Vertrag des Kunden). */
  planOn: (planProduct: string) => boolean
  /** Bau-Schalter der App (F37) — hat DIESE App das Produkt eingeschaltet? */
  configOn: (configFlag: string) => boolean
  /**
   * Die Filter-Zutaten als EIN Objekt — für `resolveSettingsTabs`, das
   * dieselben fünf Fragen stellt, aber keine Platzierung kennt.
   */
  tabFilter: Omit<DashboardNavFilter, 'placement'>
  /** Die Module der Seitenleiste (placement 'nav'), Ort × Rolle × drei Gates. */
  navModules: ComputedRef<PukalaniAdminModule[]>
  /** Die Module des Unterbaus (placement 'bottom'), bereits nach `order` sortiert. */
  bottomModules: ComputedRef<PukalaniAdminModule[]>
}

export function useDashboardNavModules(): DashboardNavModulesContext {
  const auth = useAuthStore()
  const appConfig = useAppConfig()

  // Laufzeit-Produkt-Gates (F2): Module deaktivierter Produkte verschwinden
  // aus der Nav — live über den Realtime-Config-Kanal (useRuntimeFlags).
  // Nur UX; die Autorität bleibt die Server-Middleware (Routen 404en).
  const runtimeFlags = useRuntimeFlags()
  const productOn = (productKey?: string) =>
    !productKey || isProductStateEnabled(runtimeFlags.value.products[productKey])

  // TARIF-Gate (C2): Module, die der Plan dieser Community nicht enthält,
  // verschwinden — ihre Routen antworten wegen `requirePlanProduct` ohnehin 404
  // (Kurse/Events sind Pro). Zweites, unabhängiges Gate neben `productOn`: das
  // ist der Betreiber-Schalter, das hier der Vertrag des Kunden. `planAllows`
  // gibt ohne Pool-Tenant (Silo, Kontroll-Host, Playground) true zurück — dort
  // bleibt das Menü unverändert. Nur UX; die Autorität sitzt an der Route.
  const { planAllows } = useTenantPlan()
  const planOn = (planProduct: string) => planAllows(planProduct)

  // BAU-SCHALTER der App (F37): Module, deren Produkt diese App gar nicht
  // angeschaltet hat, verschwinden — z.B. das Einbetter-Register des Widgets in
  // einer App ohne `pukalani.comments.embed.enabled`. Drittes, unabhängiges Gate
  // neben productOn (Betreiber-Schalter) und planOn (Tarif des Kunden); die
  // Regel selbst ist pur und getestet (core/shared/dashboardNav.ts).
  const configOn = (configFlag: string) => configFlagEnabled(appConfig.pukalani, configFlag)

  // Capability-Prüfung mit ZWEI Quellen (N1): Operator-Labels und die Community-
  // Rolle dieses Mandanten (useCommunityRole, SSR-gespiegelt). Sie bleiben seit
  // E9 GETRENNT, weil die Ebene eines Moduls entscheidet, welche zählt
  // (moduleAllowedFor in core/shared/dashboardNav.ts): Betreiber-Module nur per
  // Label, Community-Module per Rolle ODER Label (Support-Break-Glass). Die
  // Zuordnung ist KONSERVATIV — sie ergibt sich vollständig aus den vorhandenen
  // Capabilities der Module × der Rollen-Matrix (core/shared/communityAuthz.ts),
  // hier wird keine neue Rechte-Liste gepflegt. Für einen Community-OWNER auf
  // seinem Host heißt das:
  //   sichtbar: Overview (dashboard.access), Kommentare (comments.moderate),
  //     Beiträge (posts.moderate), Events/Kurse/Activity (events/courses/
  //     activity.manage), Seiten (pages.manage), Medien (media.manage),
  //     Mitglieder (team.manage), Abo (community.billing)
  //   unsichtbar (Operator-only, Community-Rollen tragen die Caps nicht):
  //     Themes/Embed (system.manage) — deshalb ist „Branding" für ihn heute noch
  //     leer, s. Kommentar in packages/themes/app/app.config.ts
  //   gar nicht am Ort (scope 'operator'): Nutzer, Admin/Audit, Speicher, System,
  //     Plattform/Studio, Feedback, Board, Zahlungs-Protokolle
  const { capabilities: siteCaps } = useCommunityRole()
  const canAsOperator = (capability: Capability) => userHasCapability(auth.user, capability)
  const canAsMember = (capability: Capability) => siteCaps.value.has(capability)
  const can = (capability: Capability) => canAsOperator(capability) || canAsMember(capability)

  /**
   * DER ORT (E9, docs/plans/DASHBOARD-IA.md): Betreiber-Einträge verschwinden
   * auf einem Mandanten-Host, Community-Einträge erscheinen nur dort — und im
   * Silo-/Einzelbetrieb bleibt alles wie vorher, weil es dort keine zweite Ebene
   * gibt. Die Regel selbst ist pur und getestet (core/shared/dashboardNav.ts);
   * hier steht nur, woher ihre zwei Eingaben kommen.
   *
   * Beides ist eine Tatsache des REQUESTS (Config + Host), keine reaktive
   * Größe — SSR und Client kommen zwangsläufig zum selben Ergebnis, also gibt
   * es keinen Hydration-Bruch.
   */
  const place = resolveDashboardPlace(
    (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
    useIsTenantHost(),
  )
  /** Nur für die HART verdrahteten Links (Nutzer, Admin, Speicher, System). */
  const operatorHere = scopeVisibleAt('operator', place)

  const tabFilter = { place, canAsOperator, canAsMember, productOn, planOn, configOn }

  const registry = () => (appConfig.pukalani?.admin?.modules ?? []) as PukalaniAdminModule[]

  const navModules = computed(() =>
    filterDashboardModules(registry(), { ...tabFilter, placement: 'nav' }))

  const bottomModules = computed(() =>
    filterDashboardModules(registry(), { ...tabFilter, placement: 'bottom' })
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)))

  return {
    place,
    operatorHere,
    canAsOperator,
    canAsMember,
    can,
    productOn,
    planOn,
    configOn,
    tabFilter,
    navModules,
    bottomModules,
  }
}
