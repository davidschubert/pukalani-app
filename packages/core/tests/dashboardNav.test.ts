import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_NAV_GROUPS,
  MAX_DASHBOARD_NAV_IDS,
  MAX_DASHBOARD_NAV_ID_LENGTH,
  applyDashboardNavPrefs,
  parseDashboardNavPrefs,
  resolveDashboardPlace,
  scopeVisibleAt,
  filterDashboardModules,
  configFlagEnabled,
  type DashboardNavFilter,
  type DashboardNavModule,
  type DashboardPlace,
  type DashboardScope,
} from '../shared/dashboardNav'
import { planAllowsProduct } from '../server/utils/tenantPlanProducts'
import { COMMUNITY_ROLES, communityCapabilitiesFor } from '../shared/communityAuthz'
import { capabilitiesFor } from '../shared/authz'
import type { Capability } from '../shared/types/authz'

const PLACES: DashboardPlace[] = ['community', 'control', 'single-tenant']
const SCOPES: DashboardScope[] = ['operator', 'community', 'account']

describe('resolveDashboardPlace', () => {
  it('ohne Mandantenfähigkeit ist jeder Host Einzelbetrieb (Silo, Betreiber-Konsole, Playground)', () => {
    expect(resolveDashboardPlace(false, false)).toBe('single-tenant')
    // tenantHost kann ohne Gate gar nicht true werden (isTenantHost); selbst
    // dann bliebe es Einzelbetrieb — die Config ist die stärkere Aussage.
    expect(resolveDashboardPlace(false, true)).toBe('single-tenant')
  })
  it('mit Gate trennt der Host: Mandant vs. Kontroll-Host', () => {
    expect(resolveDashboardPlace(true, true)).toBe('community')
    expect(resolveDashboardPlace(true, false)).toBe('control')
  })
})

describe('scopeVisibleAt — die eine Regel (E9)', () => {
  it('Betreiber-Module verschwinden auf einem MANDANTEN-Host', () => {
    expect(scopeVisibleAt('operator', 'community')).toBe(false)
  })
  it('Betreiber-Module stehen auf Kontroll-Host und im Einzelbetrieb', () => {
    expect(scopeVisibleAt('operator', 'control')).toBe(true)
    expect(scopeVisibleAt('operator', 'single-tenant')).toBe(true)
  })
  it('Community-Module stehen NUR auf einem Mandanten-Host …', () => {
    expect(scopeVisibleAt('community', 'community')).toBe(true)
    expect(scopeVisibleAt('community', 'control')).toBe(false)
  })
  it('… mit der Ausnahme Einzelbetrieb: dort gibt es keine zweite Ebene (Silo behält sein Menü)', () => {
    expect(scopeVisibleAt('community', 'single-tenant')).toBe(true)
  })
  it('Konto-Module stehen überall', () => {
    for (const place of PLACES) expect(scopeVisibleAt('account', place), place).toBe(true)
  })
  it('an JEDEM Ort ist mindestens eine Ebene sichtbar (kein leeres Menü durch die Regel)', () => {
    for (const place of PLACES) {
      expect(SCOPES.some(scope => scopeVisibleAt(scope, place)), place).toBe(true)
    }
  })
})

/** Prüf-Matrix: Modul-Liste × (Ort, Rolle/Labels) → sichtbare Ids. */
interface TestModule extends DashboardNavModule {
  id: string
}

const MODULES: TestModule[] = [
  { id: 'tenants', scope: 'operator', requiredCapability: 'sites.manage' },
  { id: 'billing', scope: 'operator', requiredCapability: 'billing.manage', placement: 'userMenu' },
  { id: 'docs', scope: 'operator', requiredCapability: 'dashboard.access', placement: 'bottom' },
  { id: 'comments', scope: 'community', requiredCapability: 'comments.moderate' },
  { id: 'members', scope: 'community', requiredCapability: 'team.manage' },
  { id: 'themes', scope: 'community', requiredCapability: 'system.manage', productKey: 'themes' },
  { id: 'profile', scope: 'account', requiredCapability: 'dashboard.access' },
]

/**
 * Module MIT Tarif-Gate (C2) — bewusst eine eigene Liste, damit die
 * Erwartungen der Ebenen-/Rollen-Matrix oben unverändert bleiben.
 * `courses`/`events` sind im Pool Pro-Produkte, `comments` ist frei.
 */
const PLAN_MODULES: TestModule[] = [
  { id: 'comments', scope: 'community', requiredCapability: 'comments.moderate' },
  { id: 'posts', scope: 'community', requiredCapability: 'posts.moderate', productKey: 'posts', planProduct: 'posts' },
  { id: 'events', scope: 'community', requiredCapability: 'events.manage', productKey: 'events', planProduct: 'events' },
  { id: 'courses', scope: 'community', requiredCapability: 'courses.manage', productKey: 'courses', planProduct: 'courses' },
]

/**
 * Der Betrachter mit seinen ZWEI getrennten Rechte-Quellen — genau so, wie
 * das Layout sie hält: globales Label vs. Rolle in dieser Community.
 */
function viewer(labels: string[], role: Parameters<typeof communityCapabilitiesFor>[0]) {
  const operatorCaps = capabilitiesFor(labels)
  const memberCaps = communityCapabilitiesFor(role)
  return {
    canAsOperator: (capability: Capability) => operatorCaps.has(capability),
    canAsMember: (capability: Capability) => memberCaps.has(capability),
  }
}

type Viewer = ReturnType<typeof viewer>

function visible(place: DashboardPlace, who: Viewer, placement: 'nav' | 'bottom' | 'userMenu' = 'nav') {
  return filterDashboardModules(MODULES, { place, placement, ...who }).map(m => m.id)
}

describe('filterDashboardModules — Ebene × Rolle', () => {
  const operator = viewer(['admin'], null)
  const owner = viewer([], 'owner')
  const moderator = viewer([], 'moderator')
  const guest = viewer([], null)

  it('Betreiber auf einem MANDANTEN-Host sieht keine Betreiber-Module mehr', () => {
    // Er hat jede Capability (admin = ALL_CAPABILITIES) — es ist der ORT, der
    // ihn hier bremst, nicht das Recht.
    expect(visible('community', operator)).toEqual(['comments', 'members', 'themes', 'profile'])
    expect(visible('community', operator, 'bottom')).toEqual([])
    expect(visible('community', operator, 'userMenu')).toEqual([])
  })

  it('Betreiber auf dem KONTROLL-Host sieht keine Community-Module', () => {
    expect(visible('control', operator)).toEqual(['tenants', 'profile'])
    expect(visible('control', operator, 'bottom')).toEqual(['docs'])
    expect(visible('control', operator, 'userMenu')).toEqual(['billing'])
  })

  it('Betreiber im EINZELBETRIEB sieht wie vor E9 alles, was seine Rechte hergeben', () => {
    expect(visible('single-tenant', operator)).toEqual(['tenants', 'comments', 'members', 'themes', 'profile'])
    expect(visible('single-tenant', operator, 'bottom')).toEqual(['docs'])
    expect(visible('single-tenant', operator, 'userMenu')).toEqual(['billing'])
  })

  it('Community-Owner auf seinem Host: Community-Module nach Capability, nie Betreiber-Module', () => {
    // themes fehlt bewusst: die Seite verlangt system.manage, das trägt keine
    // Community-Rolle — das Menü verspricht nichts, was die Seite nicht hält.
    expect(visible('community', owner)).toEqual(['comments', 'members', 'profile'])
  })

  it('Community-Moderator sieht nur, was seine Rolle trägt', () => {
    expect(visible('community', moderator)).toEqual(['comments', 'profile'])
  })

  it('Gast/rollenloser Nutzer sieht nirgends etwas (dashboard.access fehlt ihm)', () => {
    for (const place of PLACES) expect(visible(place, guest), place).toEqual([])
  })

  it('KEINE Community-Rolle erreicht je ein Betreiber-Modul — an keinem Ort (N1)', () => {
    // Härter als der Ort allein: 'docs' verlangt nur `dashboard.access`, das
    // JEDE Community-Rolle trägt, und im Einzelbetrieb bremst kein Ort. Was
    // ihn dort fernhält, ist die getrennte Rechte-Quelle (moduleAllowedFor).
    const operatorIds = MODULES.filter(m => m.scope === 'operator').map(m => m.id)
    for (const role of COMMUNITY_ROLES) {
      const who = viewer([], role)
      for (const place of PLACES) {
        for (const placement of ['nav', 'bottom', 'userMenu'] as const) {
          const seen = visible(place, who, placement)
          for (const id of operatorIds) expect(seen, `${role}@${place}/${placement}`).not.toContain(id)
        }
      }
    }
  })

  it('der Betreiber-Break-Glass bleibt: mit Label sieht er Community-Module auf dem Kunden-Host', () => {
    // Serverseitig erlaubt und protokolliert (decideCommunityAccess) — ein
    // Menü, das ihn verschweigt, wäre eine zweite, abweichende Regel.
    expect(visible('community', viewer(['admin'], null))).toContain('comments')
  })

  it('Konto-Module bleiben für jeden Angemeldeten an jedem Ort stehen', () => {
    for (const role of COMMUNITY_ROLES) {
      for (const place of PLACES) {
        expect(visible(place, viewer([], role)), `${role}@${place}`).toContain('profile')
      }
    }
  })

  it('abgeschaltetes Produkt (F2) fällt zusätzlich heraus', () => {
    const seen = filterDashboardModules(MODULES, {
      place: 'single-tenant',
      placement: 'nav',
      ...operator,
      productOn: key => key !== 'themes',
    }).map(m => m.id)
    expect(seen).not.toContain('themes')
    expect(seen).toContain('comments')
  })

  it('ein Modul OHNE gültige Ebene erscheint nirgends (fail-closed — app.config wird nicht typgeprüft)', () => {
    const broken = [{ id: 'vergessen', requiredCapability: 'dashboard.access' } as unknown as TestModule]
    for (const place of PLACES) {
      expect(
        filterDashboardModules(broken, { place, placement: 'nav', ...viewer(['admin'], 'owner') }),
        place,
      ).toEqual([])
    }
  })

  it('placement trennt sauber — ein Modul erscheint an genau EINEM Ausgang', () => {
    const all = (['nav', 'bottom', 'userMenu'] as const)
      .flatMap(placement => visible('single-tenant', operator, placement))
    expect(all.length).toBe(new Set(all).size)
  })
})

/**
 * C2 — DAS MENÜ DARF NICHT LÜGEN.
 *
 * Kurse und Events sind im Pool Pro-Produkte (`pukalani.tenancy.products`).
 * Ihre Routen antworten für einen Basic-/Personal-Mandanten längst 404
 * (`requirePlanProduct`) — der Menüpunkt stand trotzdem da und führte in die
 * Wand. Das Gate ist deshalb an DIESELBE pure Entscheidung genagelt, die der
 * Server trifft (`planAllowsProduct`), nicht an eine zweite, nachgebaute
 * Rangordnung: eine abweichende Kopie wäre genau der Bruch, den C2 behebt.
 *
 * `planOn` ist NUR UX. Die Autorität bleibt `requirePlanProduct` an der Route.
 */
describe('Tarif-Gate der Dashboard-Nav (C2)', () => {
  // Katalog wie in apps/platform/app/app.config.ts (identisch zu
  // posts-plan-gate.test.ts — dieselbe Wahrheit, zwei Blickwinkel).
  const PLAN_ORDER = ['basic', 'personal', 'pro'] as const
  const PRODUCTS = { posts: 'personal', ai: 'pro', events: 'pro', courses: 'pro' }

  const owner = viewer([], 'owner')

  /** Menü eines Pool-Mandanten mit diesem Plan. */
  function seenWithPlan(plan: string) {
    return filterDashboardModules(PLAN_MODULES, {
      place: 'community',
      placement: 'nav',
      ...owner,
      planOn: key => planAllowsProduct(PLAN_ORDER, PRODUCTS, plan, key),
    }).map(m => m.id)
  }

  it('Basic sieht weder Beiträge noch Events noch Kurse — nur das freie Produkt', () => {
    expect(seenWithPlan('basic')).toEqual(['comments'])
  })

  it('Personal bekommt die Beiträge dazu, Events/Kurse bleiben zu', () => {
    expect(seenWithPlan('personal')).toEqual(['comments', 'posts'])
  })

  it('Pro sieht alles', () => {
    expect(seenWithPlan('pro')).toEqual(['comments', 'posts', 'events', 'courses'])
  })

  it('OHNE Pool-Kontext (Silo, Kontroll-Host, Playground) ändert sich nichts', () => {
    // Der Aufrufer reicht dort `useTenantPlan().planAllows` durch, und die gibt
    // ohne Tenant-Plan true zurück — hier abgebildet als fehlendes `planOn`.
    // Nur die zwei Orte, an denen Community-Module überhaupt stehen (E9);
    // auf dem Kontroll-Host verschwinden sie schon am Ort, nicht am Tarif.
    for (const place of ['community', 'single-tenant'] as const) {
      expect(
        filterDashboardModules(PLAN_MODULES, { place, placement: 'nav', ...owner }).map(m => m.id),
        place,
      ).toEqual(['comments', 'posts', 'events', 'courses'])
    }
  })

  it('ein Modul OHNE planProduct fasst das Tarif-Gate nie an', () => {
    const seen = filterDashboardModules(PLAN_MODULES, {
      place: 'community',
      placement: 'nav',
      ...owner,
      planOn: () => false, // härtester Fall: nichts ist im Tarif enthalten
    }).map(m => m.id)
    expect(seen).toEqual(['comments'])
  })

  it('die beiden Produkt-Gates sind UNABHÄNGIG: Betreiber-Schalter vs. Tarif', () => {
    // F2 aus, Tarif an → weg. Tarif aus, F2 an → ebenfalls weg. Ein Gate darf
    // das andere weder ersetzen noch überstimmen.
    const only = (opts: Partial<DashboardNavFilter>) =>
      filterDashboardModules(PLAN_MODULES, { place: 'community', placement: 'nav', ...owner, ...opts }).map(m => m.id)

    expect(only({ productOn: key => key !== 'events' })).toEqual(['comments', 'posts', 'courses'])
    expect(only({ planOn: key => key !== 'events' })).toEqual(['comments', 'posts', 'courses'])
    expect(only({
      productOn: key => key !== 'events',
      planOn: key => key !== 'courses',
    })).toEqual(['comments', 'posts'])
  })

  it('Capability schlägt weiterhin durch — ein Tarif ersetzt kein Recht', () => {
    const editor = viewer([], 'editor')
    const seen = filterDashboardModules(PLAN_MODULES, {
      place: 'community',
      placement: 'nav',
      ...editor,
      planOn: () => true,
    }).map(m => m.id)
    expect(seen).not.toContain('comments') // comments.moderate trägt ein Editor nicht
  })
})

/**
 * F37 — DER BAU-SCHALTER DER APP.
 *
 * Das Einbetter-Register des Widgets stand im Menü JEDER App, die den
 * comments-Layer zieht — auch dort, wo `pukalani.comments.embed.enabled` nie
 * gesetzt wurde und die Seite dahinter 404 antwortet. Ein Menüpunkt, der ins
 * Nichts führt, ist schlimmer als keiner.
 *
 * Das dritte, UNABHÄNGIGE Gate: `productOn` ist der Betreiber-Schalter zur
 * Laufzeit, `planOn` der Vertrag des Kunden, `configOn` die Frage, ob DIESE
 * App das Produkt überhaupt gebaut hat.
 */
describe('Bau-Schalter-Gate der Dashboard-Nav (F37)', () => {
  const CONFIG_MODULES: TestModule[] = [
    { id: 'comments', scope: 'community', requiredCapability: 'comments.moderate' },
    { id: 'embed', scope: 'community', requiredCapability: 'community.embed', configFlag: 'comments.embed.enabled' },
  ]
  const owner = viewer([], 'owner')

  /** Menü einer App mit dieser (gemergten) `pukalani`-Config. */
  function seenWith(pukalani: unknown) {
    return filterDashboardModules(CONFIG_MODULES, {
      place: 'community',
      placement: 'nav',
      ...owner,
      configOn: flag => configFlagEnabled(pukalani, flag),
    }).map(m => m.id)
  }

  it('App MIT Embed-Schalter zeigt den Eintrag', () => {
    expect(seenWith({ comments: { embed: { enabled: true } } })).toEqual(['comments', 'embed'])
  })

  it('App OHNE Embed-Schalter (Core-Default aus) zeigt ihn nicht', () => {
    expect(seenWith({ comments: { embed: { enabled: false } } })).toEqual(['comments'])
    // Der häufigere Fall: die App hat den Zweig gar nicht.
    expect(seenWith({ comments: { autoHideReports: 3 } })).toEqual(['comments'])
    expect(seenWith({})).toEqual(['comments'])
  })

  it('ein Modul OHNE configFlag fasst das Gate nie an', () => {
    const seen = filterDashboardModules(CONFIG_MODULES, {
      place: 'community', placement: 'nav', ...owner, configOn: () => false,
    }).map(m => m.id)
    expect(seen).toEqual(['comments'])
  })

  it('ohne configOn (Aufrufer reicht nichts durch) bleibt alles sichtbar', () => {
    expect(
      filterDashboardModules(CONFIG_MODULES, { place: 'community', placement: 'nav', ...owner }).map(m => m.id),
    ).toEqual(['comments', 'embed'])
  })

  it('Capability schlägt durch: ein Admin sieht den Eintrag auch bei aktivem Produkt nicht', () => {
    const admin = viewer([], 'admin')
    const seen = filterDashboardModules(CONFIG_MODULES, {
      place: 'community',
      placement: 'nav',
      ...admin,
      configOn: flag => configFlagEnabled({ comments: { embed: { enabled: true } } }, flag),
    }).map(m => m.id)
    expect(seen).toEqual(['comments'])
  })
})

describe('configFlagEnabled — fail-closed', () => {
  const config = { comments: { embed: { enabled: true } }, auth: { otp: false } }

  it('liest verschachtelte Pfade', () => {
    expect(configFlagEnabled(config, 'comments.embed.enabled')).toBe(true)
    expect(configFlagEnabled(config, 'auth.otp')).toBe(false)
  })

  it('unbekannter Pfad / Tippfehler ⇒ AUS (ein toter Menüpunkt fällt nicht auf)', () => {
    expect(configFlagEnabled(config, 'comments.embed.enabeld')).toBe(false)
    expect(configFlagEnabled(config, 'kommentare.embed.enabled')).toBe(false)
    expect(configFlagEnabled(config, '')).toBe(false)
  })

  it('durch einen Nicht-Objekt-Zweig wird nicht weitergelaufen', () => {
    expect(configFlagEnabled({ comments: 'ja' }, 'comments.embed.enabled')).toBe(false)
    expect(configFlagEnabled(null, 'comments.embed.enabled')).toBe(false)
    expect(configFlagEnabled(undefined, 'a')).toBe(false)
  })

  it('nur `true` gilt als an — kein „truthy"', () => {
    expect(configFlagEnabled({ a: 1 }, 'a')).toBe(false)
    expect(configFlagEnabled({ a: 'true' }, 'a')).toBe(false)
    expect(configFlagEnabled({ a: {} }, 'a')).toBe(false)
    expect(configFlagEnabled({ a: true }, 'a')).toBe(true)
  })
})

/**
 * NAV1 PAKET 3 — DIE REIHENFOLGE JE PERSON.
 *
 * Sechs Zusagen aus docs/plans/DASHBOARD-NAV-JE-PERSON.md, jede MIT
 * Gegenprobe: eine Regel, die nur den erwarteten Fall prüft, ist grün, auch
 * wenn sie gar nichts tut.
 *
 * Zusage 5 (ausgeblendet fehlt in der Seitenleiste, NICHT in der ⌘K-Suche) ist
 * hier nur zur HÄLFTE prüfbar — die Suche liest ihre eigene, unpersonalisierte
 * Liste im Layout (packages/admin/app/layouts/dashboard.vue). Geprüft wird
 * hier die Seitenleisten-Hälfte; die andere gehört dorthin, wo die zweite
 * Liste entsteht.
 */
interface OrderModule {
  id: string
  group?: string
  order?: number
}

/** Registry-Auszug: zwei Gruppen, ein Modul ohne Gruppe, `order` mit Lücken. */
const ORDER_MODULES: OrderModule[] = [
  { id: 'inbox' },
  { id: 'members', group: 'products', order: 10 },
  { id: 'posts', group: 'products', order: 20 },
  { id: 'media', group: 'products', order: 30 },
  { id: 'themes', group: 'branding', order: 10 },
  { id: 'fonts', group: 'branding', order: 20 },
]

/** Kompakte Sicht auf das Ergebnis: [ohne Gruppe, [Gruppe, Ids]…]. */
function shape(result: ReturnType<typeof applyDashboardNavPrefs<OrderModule>>) {
  return {
    ungrouped: result.ungrouped.map(m => m.id),
    groups: result.groups.map(g => [g.group, g.modules.map(m => m.id)] as const),
  }
}

const STANDARD = {
  ungrouped: ['inbox'],
  groups: [
    ['products', ['members', 'posts', 'media']],
    ['branding', ['themes', 'fonts']],
  ],
}

describe('applyDashboardNavPrefs — die Reihenfolge je Person (NAV1 Paket 3)', () => {
  it('Zusage 1: ohne Prefs ist das Ergebnis exakt die heutige Nav', () => {
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, undefined))).toEqual(STANDARD)
    // Gegenprobe an den drei Formen von „nichts gewählt": ein leeres Objekt
    // und leere Listen dürfen sich nicht anders verhalten als `undefined`.
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, {}))).toEqual(STANDARD)
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, { groups: [], items: [], hidden: [] }))).toEqual(STANDARD)
  })

  it('Zusage 1: `order` schlägt die Registry-Reihenfolge, Gleichstand bleibt stabil', () => {
    // Absichtlich VERDREHT in der Registry und mit einem Gleichstand (media/
    // extra teilen sich 30): der Gleichstand behält die Registry-Reihenfolge.
    const jumbled: OrderModule[] = [
      { id: 'media', group: 'products', order: 30 },
      { id: 'extra', group: 'products', order: 30 },
      { id: 'members', group: 'products', order: 10 },
    ]
    expect(shape(applyDashboardNavPrefs(jumbled, undefined)).groups)
      .toEqual([['products', ['members', 'media', 'extra']]])
  })

  it('Zusage 1: ein Modul OHNE `order` hängt hinter jedem mit (999)', () => {
    const withGap: OrderModule[] = [
      { id: 'namenlos', group: 'products' },
      { id: 'members', group: 'products', order: 10 },
    ]
    expect(shape(applyDashboardNavPrefs(withGap, undefined)).groups)
      .toEqual([['products', ['members', 'namenlos']]])
  })

  it('Zusage 2: unbekannte Ids in groups/items/hidden ändern GAR NICHTS', () => {
    const prefs = {
      groups: ['gibtesnicht', 'auch-nicht'],
      items: ['verschwundener-layer'],
      hidden: ['weg-seit-gestern'],
    }
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, prefs))).toEqual(STANDARD)
    // Gegenprobe: eine BEKANNTE Id an derselben Stelle wirkt sehr wohl —
    // sonst prüfte der Test nur, dass die Funktion überhaupt etwas zurückgibt.
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, { groups: ['branding'] })).groups[0]?.[0])
      .toBe('branding')
  })

  it('Zusage 3: Genanntes vorn, Rest hinten — Gruppen im Standard, Einträge nach order', () => {
    const result = shape(applyDashboardNavPrefs(ORDER_MODULES, {
      groups: ['branding'],
      items: ['media'],
    }))
    // `branding` wandert nach vorn, `products` folgt im Standard.
    expect(result.groups).toEqual([
      ['branding', ['themes', 'fonts']],
      ['products', ['media', 'members', 'posts']],
    ])
  })

  it('Zusage 3: die Reihenfolge in `items` zählt, nicht die in der Registry', () => {
    const result = shape(applyDashboardNavPrefs(ORDER_MODULES, { items: ['media', 'posts'] }))
    expect(result.groups[0]).toEqual(['products', ['media', 'posts', 'members']])
    // Gegenprobe: umgedreht kommt auch das Gegenteil heraus.
    const flipped = shape(applyDashboardNavPrefs(ORDER_MODULES, { items: ['posts', 'media'] }))
    expect(flipped.groups[0]).toEqual(['products', ['posts', 'media', 'members']])
  })

  it('Zusage 3: `items` wirkt nur INNERHALB der Gruppe — kein Eintrag wechselt sie', () => {
    // `themes` (branding) steht ganz vorn in der Liste, bleibt aber in seiner
    // Gruppe; die Gruppen-Reihenfolge ändert sich davon nicht.
    const result = shape(applyDashboardNavPrefs(ORDER_MODULES, { items: ['themes', 'media'] }))
    expect(result.groups).toEqual([
      ['products', ['media', 'members', 'posts']],
      ['branding', ['themes', 'fonts']],
    ])
  })

  it('Zusage 4: eine Gruppe, deren Einträge alle ausgeblendet sind, fehlt ganz', () => {
    const result = shape(applyDashboardNavPrefs(ORDER_MODULES, { hidden: ['themes', 'fonts'] }))
    expect(result.groups.map(g => g[0])).toEqual(['products'])
    // Gegenprobe: EIN sichtbarer Eintrag genügt, damit die Gruppe bleibt.
    const partial = shape(applyDashboardNavPrefs(ORDER_MODULES, { hidden: ['themes'] }))
    expect(partial.groups).toEqual([
      ['products', ['members', 'posts', 'media']],
      ['branding', ['fonts']],
    ])
  })

  it('Zusage 5 (Seitenleisten-Hälfte): `hidden` nimmt Einträge heraus, auch ungruppierte', () => {
    const result = shape(applyDashboardNavPrefs(ORDER_MODULES, { hidden: ['inbox', 'posts'] }))
    expect(result.ungrouped).toEqual([])
    expect(result.groups[0]).toEqual(['products', ['members', 'media']])
    // Gegenprobe: ohne `hidden` sind beide da.
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, {})).ungrouped).toEqual(['inbox'])
  })

  it('Zusage 6: Module ohne Gruppe bleiben vorn und folgen ebenfalls `items`', () => {
    const loose: OrderModule[] = [
      { id: 'inbox', order: 10 },
      { id: 'board', order: 20 },
      { id: 'members', group: 'products', order: 10 },
    ]
    expect(shape(applyDashboardNavPrefs(loose, undefined)).ungrouped).toEqual(['inbox', 'board'])
    expect(shape(applyDashboardNavPrefs(loose, { items: ['board'] })).ungrouped).toEqual(['board', 'inbox'])
    // Sie bleiben VOR den Gruppen — `ungrouped` ist ein eigenes Feld, keine
    // Position in einer Liste, die man versehentlich umsortieren könnte.
    expect(shape(applyDashboardNavPrefs(loose, { items: ['members'] })).ungrouped).toEqual(['inbox', 'board'])
  })

  it('ein Modul mit UNBEKANNTER Gruppe erscheint nirgends (fail-closed, wie heute)', () => {
    const strange: OrderModule[] = [
      { id: 'inbox' },
      { id: 'vertippt', group: 'produkte' },
      { id: 'members', group: 'products', order: 10 },
    ]
    const result = shape(applyDashboardNavPrefs(strange, undefined))
    expect(result.ungrouped).toEqual(['inbox'])
    expect(result.groups).toEqual([['products', ['members']]])
  })

  it('die Standard-Reihenfolge der Gruppen ist die des Layouts (E9 + U7)', () => {
    const all = DASHBOARD_NAV_GROUPS.map((group, index) => ({ id: `m${index}`, group }))
    expect(shape(applyDashboardNavPrefs(all, undefined)).groups.map(g => g[0]))
      .toEqual([...DASHBOARD_NAV_GROUPS])
  })

  it('die Eingabe wird NICHT verändert (die Registry ist geteilt)', () => {
    const before = ORDER_MODULES.map(m => m.id)
    applyDashboardNavPrefs(ORDER_MODULES, { items: ['media'], groups: ['branding'] })
    expect(ORDER_MODULES.map(m => m.id)).toEqual(before)
  })
})

describe('parseDashboardNavPrefs — fail-soft (ein Prefs-Dokument darf nichts umwerfen)', () => {
  it('kein Objekt ⇒ undefined', () => {
    for (const raw of [undefined, null, 'nav', 42, true, ['items']]) {
      expect(parseDashboardNavPrefs(raw), String(raw)).toBeUndefined()
    }
  })

  it('ein Objekt ohne brauchbare Liste ⇒ undefined (nicht `{}`)', () => {
    expect(parseDashboardNavPrefs({})).toBeUndefined()
    expect(parseDashboardNavPrefs({ groups: 'products' })).toBeUndefined()
    expect(parseDashboardNavPrefs({ fremdes: ['feld'] })).toBeUndefined()
    // Gegenprobe: EINE brauchbare Liste genügt.
    expect(parseDashboardNavPrefs({ groups: ['products'] })).toEqual({ groups: ['products'] })
  })

  it('gemischte Typen: nur die gültigen Ids bleiben, der Rest fällt EINZELN weg', () => {
    expect(parseDashboardNavPrefs({ items: ['posts', 7, null, { id: 'x' }, 'media'] }))
      .toEqual({ items: ['posts', 'media'] })
  })

  it('Ids gegen das Muster: nur [a-z0-9-], höchstens 64 Zeichen', () => {
    const raw = {
      items: [
        'brand-check',
        'Posts', // Großbuchstabe
        'mit punkt.', // Punkt und Leerzeichen
        '', // leer
        'a'.repeat(MAX_DASHBOARD_NAV_ID_LENGTH),
        'b'.repeat(MAX_DASHBOARD_NAV_ID_LENGTH + 1),
      ],
    }
    expect(parseDashboardNavPrefs(raw)).toEqual({
      items: ['brand-check', 'a'.repeat(MAX_DASHBOARD_NAV_ID_LENGTH)],
    })
  })

  it('doppelte Ids: der ERSTE Auftritt zählt', () => {
    expect(parseDashboardNavPrefs({ items: ['posts', 'media', 'posts'] }))
      .toEqual({ items: ['posts', 'media'] })
  })

  it('zu lange Liste wird GEKÜRZT, nicht verworfen (Lesen ist milder als Schreiben)', () => {
    const many = Array.from({ length: MAX_DASHBOARD_NAV_IDS + 25 }, (_, i) => `m${i}`)
    const parsed = parseDashboardNavPrefs({ items: many })
    expect(parsed?.items).toHaveLength(MAX_DASHBOARD_NAV_IDS)
    // Die ERSTEN gewinnen — sie stehen oben in der Seitenleiste; der Rest
    // hängt nach Zusage 3 ohnehin hinten an.
    expect(parsed?.items?.[0]).toBe('m0')
    expect(parsed?.items?.at(-1)).toBe(`m${MAX_DASHBOARD_NAV_IDS - 1}`)
  })

  it('eine leere Liste bleibt eine leere Liste — und wirkt wie „nichts gewählt"', () => {
    expect(parseDashboardNavPrefs({ items: [], groups: ['products'] }))
      .toEqual({ items: [], groups: ['products'] })
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, parseDashboardNavPrefs({ items: [] }))))
      .toEqual(STANDARD)
  })

  it('das Gelesene ist gültige Eingabe für die Regel (beide Enden passen zusammen)', () => {
    const parsed = parseDashboardNavPrefs({
      groups: ['branding', 'Products', 'branding'],
      items: ['media', 42],
      hidden: ['themes'],
    })
    expect(parsed).toEqual({ groups: ['branding'], items: ['media'], hidden: ['themes'] })
    expect(shape(applyDashboardNavPrefs(ORDER_MODULES, parsed)).groups).toEqual([
      ['branding', ['fonts']],
      ['products', ['media', 'members', 'posts']],
    ])
  })
})
