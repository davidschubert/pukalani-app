import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { BwRailStep } from '../components/BwProgressRail.vue'
import type { BrandFindingKind, BrandFindingStatus } from '../../shared/brandFindings'
import type { BrandWorkspaceNavExtra } from '../../shared/brandWorkspaceNav'
import { resolveWorkspaceNavExtras } from '../../shared/brandWorkspaceNav'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE ZUSATZ-EINTRÄGE DER WERKSTATT-LEISTE ALS FERTIGE LEISTEN-ZEILEN
 * (MV1 M4, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.5).
 *
 * ── WARUM EIN COMPOSABLE UND NICHT DREIMAL DIESELBEN ZEHN ZEILEN ─────────
 * Drei Seiten zeigen dieselbe Leiste: die Werkstatt (`[stepKey].vue`), das
 * Dokument (`document.vue`) und — seit M4 — die Seite „Markt" des
 * market-Layers. Jede von ihnen baut ihre `railLayers` selbst, weil sie über
 * die KAPITEL Verschiedenes weiss (offene Sessions, Zähler, Fortschritt).
 * Über die ZUSATZ-Einträge weiss keine von ihnen etwas Eigenes — und genau
 * deshalb gehört diese Rechnung an EINE Stelle. Drei Kopien wären drei Orte,
 * an denen der nächste Eintrag vergessen wird, und in der Leiste sieht man
 * das erst, wenn jemand danach sucht.
 *
 * ── DIE BEFUNDE KOMMEN VON AUSSEN HEREIN ─────────────────────────────────
 * Sie liegen je Seite woanders: die Werkstatt hat sie im Store (aus der
 * Baustein-Antwort), das Dokument in seiner eigenen Antwort, die Markt-Seite
 * in ihrem Bericht. Ein Composable, das sie SELBST holte, machte aus einer
 * Anzeige-Rechnung einen vierten Abruf — und zwar auf jeder dieser Seiten
 * einen zusätzlichen.
 *
 * ── DIE SPERRE IST EINE TATSACHE DER JOURNEY ─────────────────────────────
 * `lockedUntil: 'pvm'` heisst „bis Kapitel B abgenommen ist", und abgenommen
 * ist ein Kapitel genau dann, wenn seine `brand_steps`-Zeile auf `done` steht
 * (`resolveBrandJourney` reicht das als `state: 'done'` durch). Dieselbe
 * Tatsache prüft der Server an der Route (`marketUnlocked`) — die Leiste
 * ERKLÄRT die Sperre, sie setzt sie nicht durch.
 *
 * ── DAS PRODUKT-GATE WIRD HIER GELESEN, UND ZWAR GENERISCH (MV1 M4-Nachfix) ─
 * Jeder Eintrag nennt seinen eigenen Schalter (`productKey`), diese Stelle
 * schlägt ihn nach: `pukalani.<productKey>.enabled === true`. Ein Eintrag
 * ohne eingeschaltetes Produkt fällt weg — vorher stand „Markt" auch in einer
 * App, die den Layer zwar montiert, das Produkt aber ausgeschaltet hat, und
 * der Klick landete auf dem 404 der Seite (die ihr Gate schon las).
 *
 * `brand` nennt dabei NIRGENDS ein Produkt: es liest einen Namen aus der
 * Konfiguration und fragt die Konfiguration nach ihm (CONCEPT A14). Deshalb
 * die Sicht als `Record` — ein fest getippter Zugriff `appConfig.pukalani
 * .market` wäre genau die Kopplung, die dieser Erweiterungspunkt vermeidet.
 *
 * FAIL-CLOSED: fehlt der Schlüssel, gilt das Produkt als AUS. Der Layer, dem
 * der Eintrag gehört, bringt seinen Default selbst mit (`app/app.config.ts`);
 * fehlt er trotzdem, ist „nicht anbieten" die harmlosere Antwort als ein
 * Menüpunkt ins Leere.
 */
export interface BrandWorkspaceNavExtrasInput {
  profileId: MaybeRefOrGetter<string>
  /** Die Befunde, die diese Seite ohnehin geladen hat (s. Kopf). */
  findings: MaybeRefOrGetter<readonly { kind: BrandFindingKind, status: BrandFindingStatus }[]>
  /** Der Schlüssel des Eintrags, auf dem der Mensch GERADE steht (falls einer). */
  activeKey?: MaybeRefOrGetter<string>
}

export function useBrandWorkspaceNavExtras(
  input: BrandWorkspaceNavExtrasInput,
): ComputedRef<BwRailStep[]> {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const store = useBrandWorkspaceStore()
  const appConfig = useAppConfig()

  return computed<BwRailStep[]>(() => {
    const configured = (appConfig.pukalani?.brand?.workspaceNavExtras ?? []) as BrandWorkspaceNavExtra[]
    if (!configured.length) return []

    const products = (appConfig.pukalani ?? {}) as Record<string, { enabled?: boolean } | undefined>
    const active = toValue(input.activeKey) ?? ''
    const states = resolveWorkspaceNavExtras(configured, {
      profileId: toValue(input.profileId),
      doneStepKeys: store.railSteps
        .filter(entry => entry.state === 'done')
        .map(entry => entry.stepKey),
      findings: toValue(input.findings),
      productEnabled: productKey => products[productKey]?.enabled === true,
    })

    return states.map((state): BwRailStep => ({
      id: state.key,
      label: t(state.labelKey),
      icon: state.icon,
      // `active` ist die Seite, auf der man steht; sonst `open`. Ein
      // gesperrter Eintrag bleibt SICHTBAR (die Schranke soll man sehen) und
      // wird von der Sidebar `disabled` gerendert.
      state: state.locked ? 'locked' : active === state.key ? 'active' : 'open',
      kind: 'extra',
      // Ein gesperrter Eintrag bekommt KEIN Ziel: die Sidebar navigiert sonst
      // an ihrer eigenen `disabled`-Prüfung vorbei, sobald sich die Regel dort
      // einmal ändert.
      ...(state.locked ? {} : { to: localePath(state.to) }),
      // Eine Zeile „0 Befunde" wäre eine Beruhigung, nach der niemand gefragt
      // hat — dieselbe Regel wie beim Dokument-Eintrag.
      ...(state.count > 0
        ? { counter: t('brand.finding.openCount', { count: state.count }, state.count) }
        : {}),
    }))
  })
}
