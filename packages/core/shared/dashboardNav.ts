import type { Capability } from './types/authz'

/**
 * DIE EINE NAVIGATIONS-REGEL des Dashboards (E9, Davids Entscheidung
 * 2026-07-30, docs/plans/DASHBOARD-IA.md) — PURE, damit Layout und Test
 * dieselbe Wahrheit lesen.
 *
 * Es gibt EINE Dashboard-Navigation. Welche Einträge erscheinen, entscheidet
 * sich nach ORT und ROLLE, nicht nach App:
 *
 *  - **Betreiber** (`operator`): Plattform-Verwaltung. Nur dort, wo es keine
 *    fremde Community gibt — auf einem Mandanten-Host hat das nichts zu suchen.
 *  - **Community** (`community`): Verwaltung EINER Kunden-Community durch ihr
 *    Team. Nur auf dem Host dieser Community.
 *  - **Konto** (`account`): überall, für jeden Angemeldeten.
 *
 * DIE DOPPEL-NATUR (und warum sie kein Sonderfall ist): dieselbe Seite ist im
 * Silo-/Einzelbetrieb eine BETREIBER-Seite (apps/comments moderiert seine
 * eigenen Kommentare) und im Pool eine COMMUNITY-Seite. Genau diese Semantik
 * hat `decideCommunityAccess` schon serverseitig — ohne Mandanten-Kontext
 * entscheidet das Operator-Label, mit Mandanten-Kontext die Community-Rolle.
 * `scopeVisibleAt` spiegelt das: im Einzelbetrieb ist JEDER Scope sichtbar,
 * die Capability filtert wie bisher. Nur wo es überhaupt Mandanten GIBT,
 * trennt der Ort die Ebenen.
 *
 * NUR UX: die Autorität bleiben `requirePermission` /
 * `requireCommunityPermission` auf den Routen und `requiredCapability` in der
 * Page-Meta. Diese Regel entscheidet, was im Menü STEHT — nie, was geht.
 */

/**
 * DIE VERGABE-REGEL FÜR `order` (U7/M1, 2026-08-11).
 *
 * Sortiert wird stabil nach `order` (packages/admin/app/layouts/dashboard.vue);
 * bei GLEICHSTAND entscheidet die Merge-Reihenfolge der Registry-Arrays, also
 * die Reihenfolge in `extends`. Genau das war der Zustand bis hierher: neun
 * Einträge der Gruppe „Produkte" vergaben 1–5 über sechs Layer hinweg, mit drei
 * Gleichständen. Die Reihenfolge war damit nicht entworfen, sondern zufällig
 * stabil — und ein neuer Layer hätte sie verschoben, ohne dass jemand etwas
 * geändert hätte.
 *
 * Deshalb bekommt JEDER Layer einen eigenen Zehner-Block, und innerhalb zählt
 * er in Zehnerschritten. Kein Block überschneidet einen anderen, zwischen zwei
 * Einträgen ist immer Platz für einen dritten:
 *
 *   posts 10–40 · events 50–60 · courses 70 · media 80 · messages 90–100 ·
 *   comments 110–120 · brand 130 · feedback 10 (eigene Gruppe „Dein Konto")
 *
 * Die Blöcke gelten je LAYER, nicht je Gruppe: `posts` vergibt 10 an seine
 * Moderationsfläche (Gruppe „Moderation") und 20–40 an seine drei übrigen
 * (Gruppe „Produkte"). So bleibt die Vergabe an EINER Stelle nachlesbar, auch
 * wenn ein Eintrag später die Gruppe wechselt.
 *
 * Ein NEUER Layer nimmt den nächsten freien Zehner-Block und trägt ihn hier
 * ein. Die `communityTabs` machen es schon länger so (10–120,
 * packages/onboarding/app/app.config.ts).
 */

/** Ebene, auf der ein Dashboard-Modul lebt. Pflichtfeld an jeder Registrierung. */
export type DashboardScope = 'operator' | 'community' | 'account'

export const DASHBOARD_SCOPES: readonly DashboardScope[] = ['operator', 'community', 'account']

/**
 * Type-Guard — und zugleich das Netz unter dem Pflichtfeld: `app.config.ts`
 * wird NICHT gegen `PukalaniAdminModule` typgeprüft (der Typ ist dort nicht
 * auto-importiert, das Layout castet erst beim Lesen). Ein vergessenes `scope`
 * wäre also nur ein Kommentar-Fehler. Hier wird er zu einem Verhalten:
 * unbekannte Ebene ⇒ der Eintrag erscheint NIRGENDS (fail-closed). Ein
 * fehlender Menüpunkt fällt beim ersten Blick auf, ein an den falschen Ort
 * gerutschter nicht.
 */
export function isDashboardScope(value: unknown): value is DashboardScope {
  return typeof value === 'string' && (DASHBOARD_SCOPES as readonly string[]).includes(value)
}

/**
 * Der ORT, an dem die Dashboard-Shell gerade läuft.
 *
 *  - `community`     — Mandanten-Host (Community eines Kunden)
 *  - `control`       — Kontroll-Host einer mandantenfähigen App (Kundenbereich,
 *                      Onboarding): es GIBT Communities, aber diese hier ist
 *                      keine. Community-Einträge wären Einstellungen für eine
 *                      Community, die es an diesem Ort nicht gibt.
 *  - `single-tenant` — App ganz ohne Mandanten (Silo, Betreiber-Konsole,
 *                      Playground). Kein Ort trennt hier etwas; es filtert
 *                      allein die Capability, genau wie vor E9.
 */
export type DashboardPlace = 'community' | 'control' | 'single-tenant'

/**
 * Ort aus den zwei Tatsachen, die Server und Browser gleichermaßen kennen:
 * ist die Mandantenfähigkeit dieser App überhaupt an (`pukalani.tenancy.
 * enabled`), und ist DIESER Host ein Mandant (`isTenantHost`, shared/
 * controlCenter.ts)?
 */
export function resolveDashboardPlace(tenancyEnabled: boolean, tenantHost: boolean): DashboardPlace {
  if (!tenancyEnabled) return 'single-tenant'
  return tenantHost ? 'community' : 'control'
}

/** Darf ein Modul dieser Ebene an diesem Ort überhaupt im Menü stehen? */
export function scopeVisibleAt(scope: DashboardScope, place: DashboardPlace): boolean {
  // Konto gilt überall — Profil und Benachrichtigungen braucht jeder, immer.
  if (scope === 'account') return true
  // Ohne Mandanten gibt es keine zweite Ebene, die man trennen könnte.
  if (place === 'single-tenant') return true
  return place === 'community' ? scope === 'community' : scope === 'operator'
}

/** Was `filterDashboardModules` von einem Modul mindestens braucht. */
export interface DashboardNavModule {
  scope: DashboardScope
  requiredCapability: Capability
  placement?: 'nav' | 'bottom' | 'userMenu'
  productKey?: string
  planProduct?: string
  configFlag?: string
}

export interface DashboardNavFilter {
  place: DashboardPlace
  /** Nur Module DIESER Platzierung (Default in der Registry ist 'nav'). */
  placement: 'nav' | 'bottom' | 'userMenu'
  /** Capabilities aus GLOBALEN Operator-Labels (authz.ts). */
  canAsOperator: (capability: Capability) => boolean
  /** Capabilities aus der COMMUNITY-Rolle dieses Hosts (communityAuthz.ts). */
  canAsMember: (capability: Capability) => boolean
  /** Laufzeit-Produkt-Gate (F2) — ohne Angabe zählt jedes Produkt als an. */
  productOn?: (productKey: string | undefined) => boolean
  /**
   * Tarif-Produkt-Gate im Pool (C2) — ohne Angabe zählt jedes Produkt als
   * enthalten. Der Aufrufer reicht `useTenantPlan().planAllows` durch; die
   * gibt AUSSERHALB des Pools (Silo, Kontroll-Host, Playground: kein
   * Tenant-Plan im SSR-Payload) immer `true` zurück, das Menü bleibt dort
   * also unverändert.
   *
   * Wird NUR für Module mit gesetztem `planProduct` gefragt — anders als
   * `productOn`, das die Undefined-Behandlung bis heute jedem Aufrufer
   * überlässt (`!productKey || …`, an drei Stellen wiederholt). Ein Aufrufer,
   * der das einmal vergisst, blendet sonst das halbe Menü aus.
   */
  planOn?: (planProduct: string) => boolean
  /**
   * BAU-SCHALTER der App (F37) — ohne Angabe zählt jeder Eintrag als an.
   *
   * Das DRITTE Produkt-Gate, und es ist wieder ein anderes: `productOn` ist der
   * Betreiber-Schalter zur LAUFZEIT (app_config), `planOn` der Vertrag des
   * Kunden — hier geht es um einen Punkt in `app.config.ts`, den eine APP
   * setzt oder eben nicht (`pukalani.comments.embed.enabled`). Ein Layer kann
   * das nicht selbst prüfen: seine eigene `app.config.ts` kennt den gemergten
   * Endstand nicht, und die Modul-Registry ist ein ARRAY (ein App-Override
   * würde den Eintrag verdoppeln statt ihn zu ersetzen).
   *
   * Der Aufrufer reicht einen Pfad-Auflöser durch (`'comments.embed.enabled'`
   * → `pukalani.comments.embed.enabled`). Nur UX: die Seite selbst antwortet
   * bei ausgeschaltetem Produkt längst 404.
   */
  configOn?: (configFlag: string) => boolean
}

/**
 * Darf dieser Betrachter das Modul sehen? Die zwei Rechte-Quellen sind
 * BEWUSST getrennt und spiegeln `decideCommunityAccess` (shared/
 * communityAccess.ts):
 *
 *  - `operator` — NUR das globale Label. Eine Community-Rolle erreicht ein
 *    Betreiber-Modul nie, an keinem Ort. Ohne diese Trennung genügte eine
 *    schwache Capability am Modul (`dashboard.access` an der internen Doku),
 *    und jedes Community-Mitglied hätte den Eintrag — der Ort allein schützt
 *    ihn nicht, denn im Einzelbetrieb gibt es keinen.
 *  - `community` — Rolle ODER Label: der Betreiber-Break-Glass, mit dem er im
 *    Support-Fall im Kunden-Dashboard arbeitet, ist serverseitig erlaubt und
 *    protokolliert; das Menü darf ihn nicht verschweigen.
 *  - `account` — beides zählt; Konto-Einträge tragen ohnehin nur
 *    `dashboard.access`.
 */
export function moduleAllowedFor(
  module: DashboardNavModule,
  filter: Pick<DashboardNavFilter, 'canAsOperator' | 'canAsMember'>,
): boolean {
  const capability = module.requiredCapability
  if (module.scope === 'operator') return filter.canAsOperator(capability)
  return filter.canAsOperator(capability) || filter.canAsMember(capability)
}

/**
 * Die sichtbaren Module einer Platzierung, in Registry-Reihenfolge.
 * Reihenfolge der Prüfungen ist egal (alle sind UND-verknüpft); die
 * Gruppierung/Sortierung macht das Layout.
 *
 * ZWEI Produkt-Gates, und sie sind NICHT dasselbe (C2):
 *  - `productKey` / `productOn` (F2) — der BETREIBER hat das Produkt in dieser
 *    Instanz abgeschaltet (app_config, live über den Realtime-Config-Kanal).
 *  - `planProduct` / `planOn` (P4) — der TARIF dieser Community enthält das
 *    Produkt nicht (pukalani.tenancy.products). Die API antwortet dort längst
 *    404 (requirePlanProduct); ohne dieses Gate steht der Menüpunkt trotzdem
 *    da und führt in eine Wand — das Menü lügt.
 * Dazu `configFlag` / `configOn` (F37) — der BAU-Schalter der App: eine App,
 * die das Produkt gar nicht anschaltet, soll seinen Menüpunkt nicht tragen.
 * Alle drei sind NUR UX. Autorität bleiben die Server-Middleware,
 * `requirePlanProduct` an den Routen und der 404 der Seite.
 */
export function filterDashboardModules<M extends DashboardNavModule>(
  modules: readonly M[],
  filter: DashboardNavFilter,
): M[] {
  const productOn = filter.productOn ?? (() => true)
  const planOn = filter.planOn ?? (() => true)
  const configOn = filter.configOn ?? (() => true)
  return modules.filter(m =>
    (m.placement ?? 'nav') === filter.placement
    && isDashboardScope(m.scope)
    && scopeVisibleAt(m.scope, filter.place)
    && moduleAllowedFor(m, filter)
    && productOn(m.productKey)
    && (m.planProduct === undefined || planOn(m.planProduct))
    && (m.configFlag === undefined || configOn(m.configFlag)),
  )
}

/**
 * PURE (unit-getestet): den Wert eines `configFlag`-Pfades unter
 * `pukalani.*` lesen und als „an/aus" beantworten.
 *
 * FAIL-CLOSED, und das ist der Punkt: ein Tippfehler im Pfad oder ein Zweig,
 * den die App nie gesetzt hat, ergibt `undefined` — und `undefined` heißt hier
 * AUS. Ein Eintrag, den niemand angeschaltet hat, ist eine tote Fläche; ein
 * fehlender Menüpunkt fällt beim ersten Blick auf, ein toter nicht. Genau
 * dieselbe Wahl wie bei `isDashboardScope`.
 *
 * Nur `true` gilt als an — kein „truthy". Sonst schaltete ein leerer String
 * oder eine 0 aus Versehen mit.
 */
export function configFlagEnabled(pukalani: unknown, path: string): boolean {
  let node: unknown = pukalani
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false
    node = (node as Record<string, unknown>)[key]
  }
  return node === true
}

/**
 * DIE STANDARD-REIHENFOLGE DER GRUPPEN — an EINER Stelle (NAV1 Paket 3).
 *
 * Bis hierher stand sie als Literal-Array im Layout (packages/admin/app/
 * layouts/dashboard.vue) und der Typ `PukalaniAdminModule.group` kannte nur
 * SIEBEN der neun Werte: `account` und `moderation` fehlten dort, seit U7 sie
 * hinzufügte. Aufgefallen ist es nie, weil `app.config.ts` nicht gegen den Typ
 * geprüft wird (s. `isDashboardScope`) — die Registry hätte also beliebige
 * Gruppen tragen können. Jetzt gibt es die Liste genau einmal: der Typ liest
 * sie, das Layout iteriert über sie, und die Prefs-Regel unten sortiert gegen
 * sie.
 *
 * Die Reihenfolge ist Davids Struktur (E9 + U7): erst die Betreiber-Ebene
 * (Plattform · Studio · Management), dann die Konto-Ebene, dann die
 * Community-Ebene (Website · Produkte · Moderation · Gestaltung ·
 * Einstellungen).
 */
export const DASHBOARD_NAV_GROUPS = [
  'platform',
  'studio',
  'management',
  'account',
  'website',
  'products',
  'moderation',
  'branding',
  'settings',
] as const

export type DashboardNavGroup = typeof DASHBOARD_NAV_GROUPS[number]

function isDashboardNavGroup(value: unknown): value is DashboardNavGroup {
  return typeof value === 'string' && (DASHBOARD_NAV_GROUPS as readonly string[]).includes(value)
}

/**
 * DIE REIHENFOLGE DER DASHBOARD-NAVIGATION IST DIE WAHL JEDER PERSON
 * (NAV1 Paket 3, Entscheidung 3 aus DECISION-LOG „Navigation anpassen",
 * 2026-09-08 — Konzept: docs/plans/DASHBOARD-NAV-JE-PERSON.md).
 *
 * JE PERSON, NICHT JE COMMUNITY: die Nav ist rollen-gefiltert, eine vom Owner
 * gesetzte Reihenfolge ginge für einen Moderator gar nicht auf — er sieht die
 * halben Einträge nicht. Gespeichert wird deshalb in den Prefs des KONTOS
 * (`prefs.dashboardNav`, kein Table), gültig auf jeder Site desselben
 * Konten-Stamms. Was auf einer anderen Site dazukommt, hängt dort hinten an
 * (Zusage 3) und wird dort sortiert.
 *
 * ANGEWENDET NACH `filterDashboardModules`, nie davor: die Filter (Ort ×
 * Rolle × drei Produkt-Gates) entscheiden, WAS es gibt — die Prefs nur, in
 * welcher Reihenfolge. Andersherum könnte eine gespeicherte Id etwas sichtbar
 * machen, das der Filter wegnimmt; die Nav bliebe zwar UX (Autorität sind die
 * Routen), aber sie versprächen etwas, das die Seite nicht hält.
 *
 * AUSBLENDEN IST KEIN LÖSCHEN: `hidden` nimmt einen Eintrag aus der
 * SEITENLEISTE, nicht aus der ⌘K-Suche. Die Suche liest bewusst die
 * unpersonalisierte Liste (Zusage 5) — sonst wäre „ausblenden" ein Weg, sich
 * selbst aus einer Fläche auszusperren, die man weiterhin betreten darf.
 * Der zweite Rückweg ist „Zurücksetzen" (PUT null).
 *
 * NUR ADDITIV erweiterbar, kein `version`-Feld: fehlende Felder sind der
 * Normalfall (jedes Konto von vor dieser Änderung hat gar keins), und
 * `parseDashboardNavPrefs` verwirft alles, was nicht passt.
 */
export interface DashboardNavPrefs {
  /** Reihenfolge der GRUPPEN (Gruppen-Ids). Nicht Erwähntes hängt hinten an, in Standardreihenfolge. */
  groups?: string[]
  /** Reihenfolge der EINTRÄGE (Modul-Ids) — gilt innerhalb ihrer Gruppe. Nicht Erwähntes hängt hinten an, nach `order`. */
  items?: string[]
  /** Ausgeblendete Modul-Ids. Ausblenden ist kein Löschen: der Eintrag bleibt in der ⌘K-Suche erreichbar. */
  hidden?: string[]
}

/**
 * Grenzen — Schema (server/api/auth/dashboard-nav.put.ts) UND Regel lesen
 * DIESELBEN Zahlen. Prefs sind ein JSON-Dokument am Konto; ein Menü mit ~30
 * Ids liegt weit unter jeder Appwrite-Grenze, die 100 sind Kopfschutz gegen
 * ein aufgeblähtes Dokument, nicht eine erwartete Größe.
 */
export const MAX_DASHBOARD_NAV_IDS = 100
export const MAX_DASHBOARD_NAV_ID_LENGTH = 64
/** Modul-Ids der Registry sind Kleinbuchstaben, Ziffern und Bindestriche. */
export const DASHBOARD_NAV_ID_PATTERN = /^[a-z0-9-]+$/

function isNavId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_DASHBOARD_NAV_ID_LENGTH
    && DASHBOARD_NAV_ID_PATTERN.test(value)
}

/**
 * Eine gelesene Liste in eine brauchbare Id-Liste verwandeln — FAIL-SOFT.
 *
 * Kein Wurf: was hier ankommt, kommt aus einem Prefs-Dokument, das eine
 * ältere (oder kaputte) Fassung geschrieben haben kann. Ein Fehler beim Lesen
 * hieße „Dashboard weiß"; eine verworfene Liste heißt nur „Standard-
 * Reihenfolge", und die ist immer richtig.
 *
 *  - Kein Array ⇒ die Liste fällt GANZ weg (ein Objekt ist keine Reihenfolge).
 *  - Einzelne Einträge, die keine gültige Id sind (Zahl, Objekt, zu lang,
 *    falsches Muster), fallen EINZELN weg — eine kaputte Id soll nicht die
 *    Reihenfolge der 29 anderen kosten.
 *  - Doppelte Ids: der ERSTE Auftritt zählt. Eine Id zweimal zu nennen ergibt
 *    keine zweite Position.
 *  - Zu lange Liste: GEKÜRZT auf `MAX_DASHBOARD_NAV_IDS`, nicht verworfen.
 *    Dieselbe Begründung wie oben — die ersten 100 sind die, die man sieht,
 *    und der Rest hängt nach Zusage 3 ohnehin hinten an. (Die SCHREIB-Route
 *    ist strenger: dort ist eine zu lange Liste eine 400, denn dort schickt
 *    ein Client gerade etwas, das er sich ausgedacht hat.)
 */
function parseNavIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isNavId(entry) || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
    if (out.length >= MAX_DASHBOARD_NAV_IDS) break
  }
  return out
}

/**
 * Das gelesene Prefs-Feld in den Vertrag übersetzen. `undefined` heißt „diese
 * Person hat nichts gewählt" — und das ist der Normalfall, nicht der Fehler.
 */
export function parseDashboardNavPrefs(raw: unknown): DashboardNavPrefs | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const prefs: DashboardNavPrefs = {}
  const groups = parseNavIds(source.groups)
  const items = parseNavIds(source.items)
  const hidden = parseNavIds(source.hidden)
  if (groups) prefs.groups = groups
  if (items) prefs.items = items
  if (hidden) prefs.hidden = hidden
  // Kein einziges brauchbares Feld ⇒ dasselbe wie „nichts gewählt". Sonst
  // reiste ein leeres Objekt durch die halbe Anwendung und müsste überall
  // gegen `undefined` mitgeprüft werden.
  return prefs.groups || prefs.items || prefs.hidden ? prefs : undefined
}

/** Was `applyDashboardNavPrefs` von einem Modul mindestens braucht. */
export interface DashboardNavOrderable {
  id: string
  group?: string
  order?: number
}

/** Das Ergebnis: erst die Module ohne Gruppe, dann die nicht-leeren Gruppen. */
export interface DashboardNavLayout<M> {
  ungrouped: M[]
  groups: { group: DashboardNavGroup, modules: M[] }[]
}

/**
 * Die persönliche Reihenfolge auf eine BEREITS GEFILTERTE Modul-Liste legen.
 *
 * Sechs Zusagen (jede mit Gegenprobe unit-getestet,
 * packages/core/tests/dashboardNav.test.ts):
 *
 *  1. Ohne Prefs (fehlend, leer, alle Listen leer) ist das Ergebnis exakt die
 *     heutige Nav — Gruppen in `DASHBOARD_NAV_GROUPS`, Einträge nach `order`.
 *  2. Unbekannte Ids (Gruppe wie Eintrag) werden STILL ignoriert. Ein Layer,
 *     der verschwunden ist, darf keine Nav zerlegen; und deshalb prüft die
 *     Schreib-Route die Ids auch gar nicht erst gegen die Registry — sie kennt
 *     die effektive Registry der App je Ort nicht.
 *  3. Nicht Erwähntes hängt HINTEN an: Gruppen in Standardreihenfolge,
 *     Einträge nach `order` (fehlend = 999), untereinander stabil in
 *     Registry-Reihenfolge. Sichtbar am Ende ist die ehrlichere Vorgabe als
 *     unsichtbar — ein neues Produkt taucht auf, statt sich zu verstecken.
 *  4. Eine Gruppe ohne sichtbare Einträge erscheint NICHT (wie heute).
 *  5. `hidden` entfernt Einträge aus dieser Liste — die ⌘K-Suche liest eine
 *     andere (unpersonalisierte), s. Kopf von `DashboardNavPrefs`.
 *  6. Module OHNE Gruppe bleiben vor den Gruppen und folgen ebenfalls `items`.
 *
 * Module mit einer UNBEKANNTEN Gruppe (nicht in `DASHBOARD_NAV_GROUPS`)
 * erscheinen nirgends — genau wie heute im Layout, das über seine feste
 * Gruppenliste iteriert. Fail-closed aus demselben Grund wie bei
 * `isDashboardScope`: ein vertippter Gruppenname soll auffallen, nicht
 * stillschweigend nach oben rutschen.
 */
export function applyDashboardNavPrefs<M extends DashboardNavOrderable>(
  modules: readonly M[],
  prefs: DashboardNavPrefs | undefined,
): DashboardNavLayout<M> {
  const hidden = new Set(prefs?.hidden ?? [])
  const visible = modules.filter(m => !hidden.has(m.id))

  // Rang aus `items`: kleiner = weiter vorn. Unerwähnt = kein Rang.
  const rank = new Map<string, number>()
  ;(prefs?.items ?? []).forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index)
  })

  /**
   * Erwähnte vor Unerwähnten, dann jeweils in ihrer eigenen Ordnung.
   * `Array.prototype.sort` ist seit ES2019 stabil — Gleichstand behält also
   * die Registry-Reihenfolge, dieselbe Zusage wie beim `order`-Sortieren im
   * Layout seit jeher.
   */
  const ordered = (list: M[]): M[] => [...list].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return (a.order ?? 999) - (b.order ?? 999)
  })

  // Gruppen-Reihenfolge: erst die genannten (unbekannte und doppelte fallen
  // weg), dann der Rest im Standard.
  const groupOrder: DashboardNavGroup[] = []
  for (const group of prefs?.groups ?? []) {
    if (isDashboardNavGroup(group) && !groupOrder.includes(group)) groupOrder.push(group)
  }
  for (const group of DASHBOARD_NAV_GROUPS) {
    if (!groupOrder.includes(group)) groupOrder.push(group)
  }

  const groups: DashboardNavLayout<M>['groups'] = []
  for (const group of groupOrder) {
    const members = ordered(visible.filter(m => m.group === group))
    if (members.length) groups.push({ group, modules: members })
  }

  return { ungrouped: ordered(visible.filter(m => !m.group)), groups }
}
