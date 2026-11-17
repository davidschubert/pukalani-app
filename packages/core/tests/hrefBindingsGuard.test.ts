import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: JEDE `:href`-BINDUNG ZEIGT NUR AUF http(s) ODER INS EIGENE HAUS
 * (SEC-021).
 *
 * Ein Link, dessen Ziel aus einer gespeicherten Zeile kommt, darf nur mit
 * http oder https beginnen. Das sichert die Ausgabe — unabhängig davon, ob das
 * Schema beim Speichern schon streng war (Bestandsdaten werden nicht
 * umgeschrieben). Die eine Prüfung dafür ist `safeExternalHref()` aus
 * `core/shared/safeHref.ts`.
 *
 * Diese Liste kann man nicht vergessen: sie zählt die Bindungen selbst. Jede
 * `:href="…"` (auch `v-bind:href`) in `packages/* /app/**` und `apps/* /app/**`
 * muss eines davon sein:
 *  (a) ein Aufruf `safeExternalHref(…)` als GANZER Ausdruck;
 *  (b) erkennbar unbedenklich: ein Literal/Template-String, das mit `/` (nicht
 *      `//`), `#`, `mailto:`, `tel:` oder `https://` beginnt, oder `localePath(…)`;
 *  (c) eine Hilfsfunktion aus WRAPPERS, deren Definition der Test selbst auf
 *      `safeExternalHref(` prüft;
 *  (d) ein Eintrag in EXCEPTIONS — nur für Werte, die aus dem CODE stammen
 *      (Konstanten, Datenlisten im Repo, im Code gebaute Adressen), nie aus
 *      einer Datenbank-Zeile. Ein Eintrag ohne passende Bindung macht den Test
 *      ebenfalls rot, damit keine Ausnahme still eine neue Stelle freistellt.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground'])

interface Binding { file: string, expr: string }

/** (c) Hilfen, die selbst über `safeExternalHref` gehen. `defFile` = wo sie definiert sind. */
const WRAPPERS: ReadonlyArray<{ file: string, name: string, defFile: string }> = [
  {
    file: 'packages/insights/app/components/InSourceList.vue',
    name: 'insightsSourceHref',
    defFile: 'packages/insights/app/utils/insightsFormat.ts',
  },
  {
    file: 'packages/insights/app/components/InSourceList.vue',
    name: 'insightsLicenseHref',
    defFile: 'packages/insights/app/utils/insightsFormat.ts',
  },
  {
    // Die Prototyp-Naht `resolveHref` bleibt — aber nur für eine Quelle, die
    // selbst http(s) ist.
    file: 'packages/market/app/components/MkEvidence.vue',
    name: 'href',
    defFile: 'packages/market/app/components/MkEvidence.vue',
  },
]

/** (d) Ausnahmen — Schlüssel `Datei :: Ausdruck`, Wert = Grund in einem Satz. */
const EXCEPTIONS: Record<string, string> = {
  'apps/marketing/app/components/ComparisonSection.vue :: src.href':
    'Quellenliste als Konstante in derselben Komponente.',
  'apps/marketing/app/components/FeeCalculator.vue :: provider.source':
    'FEE_PROVIDERS ist eine Datenliste im Repo.',
  'apps/marketing/app/components/FeeCalculator.vue :: FEE_CUMULATIVE_SOURCE.href':
    'Konstante aus einer Datenliste im Repo.',
  'apps/portfolio/app/components/SiteFooter.vue :: CONTACT.calLink':
    'Kontakt-Konstante aus apps/portfolio/app/data/contact.',
  'apps/portfolio/app/pages/erstgespraech/index.vue :: CONTACT.calLink':
    'Kontakt-Konstante aus apps/portfolio/app/data/contact.',
  'apps/portfolio/app/pages/cases/[slug].vue :: entry.link.href':
    'Fallstudien sind eine Datenliste im Repo (apps/portfolio/app/data/cases).',
  'apps/portfolio/app/pages/index.vue :: channel.url':
    'Kontaktkanäle aus einer Datenliste im Repo, interner Kanal über localePath.',
  'apps/portfolio/app/pages/ux-audit/index.vue :: link.href':
    'Marketing-Datenliste im Repo (AUDIT_METHOD_NOTE).',
  'apps/portfolio/app/pages/wissen/freelancer-oder-agentur/index.vue :: item.href':
    'Inhaltsverzeichnis als Datenliste im Repo (AGENTUR_TOC).',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: item.href':
    'Inhaltsverzeichnis als Datenliste im Repo (KOSTEN_TOC).',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: row.sourceUrl':
    'Quellen der Datenliste RATE_ROWS im Repo.',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: link.href':
    'Marketing-Datenliste im Repo (KOSTEN_PROJECTS.noteLinks).',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: stat.sourceUrl':
    'Quellen der Datenliste ROI_STATS im Repo.',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: KOSTEN_BFSG.linkUrl':
    'Konstante aus einer Datenliste im Repo.',
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue :: source.url':
    'Quellenliste KOSTEN_SOURCES im Repo.',
  'packages/billing/app/pages/dashboard/billing.vue :: stripeCustomerUrl(row.original.stripeCustomerId)':
    'stripeCustomerUrl baut im Code eine feste https-Adresse auf dashboard.stripe.com.',
  'packages/brand/app/pages/brand/[profileId]/kit.vue :: row.source':
    'Lizenz-Quellen kommen aus dem Schriften-Katalog im Code (brandFontPair), nicht aus der Zeile.',
  'packages/events/app/components/EventDetail.vue :: mapsUrl':
    'Im Code gebaute https-Adresse der Kartensuche, Adressdaten nur URL-kodiert im Query.',
  'packages/market/app/components/MkBrandScore.vue :: href':
    'Interner Ergebnis-Pfad /brand-check/<id> aus einer Resolver-Funktion im Code.',
  'packages/market/app/components/MkCompetitorCard.vue :: resolveCheckHref(check.checkId)':
    'Interner Ergebnis-Pfad /brand-check/<id> aus einer Resolver-Funktion im Code.',
  'packages/onboarding/app/pages/profile/activity.vue :: entryLink(group.host, entry) ?? undefined':
    'entryLink baut im Code immer eine https-Adresse aus Host und Pfad.',
}

/** (b) Literal/Template-String mit festem, unbedenklichem Anfang. */
const SAFE_LITERAL = /^[`'](?:\/(?![/\\])|#|mailto:|tel:|https:\/\/)/
const SAFE_CALL = /^localePath\(/

function vueFilesUnder(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) vueFilesUnder(path, out)
    else if (name.endsWith('.vue')) out.push(path)
  }
  return out
}

function appRoots(): string[] {
  const roots: string[] = []
  for (const group of ['packages', 'apps']) {
    const base = join(REPO, group)
    for (const name of readdirSync(base)) {
      if (SKIP_DIRS.has(name)) continue
      const app = join(base, name, 'app')
      if (existsSync(app) && statSync(app).isDirectory()) roots.push(app)
    }
  }
  return roots
}

/** Alle `:href`/`v-bind:href`-Bindungen im Template, HTML-Kommentare ausgenommen. */
function hrefBindings(source: string): string[] {
  const start = source.indexOf('<template')
  const end = source.lastIndexOf('</template>')
  if (start < 0 || end < 0) return []
  const template = source.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')
  const found: string[] = []
  for (const match of template.matchAll(/(?<=\s)(?:v-bind)?:href=(?:"([^"]*)"|'([^']*)')/g)) {
    found.push((match[1] ?? match[2] ?? '').replace(/\s+/g, ' ').trim())
  }
  return found
}

function isWholeSafeCall(expr: string): boolean {
  if (!expr.startsWith('safeExternalHref(') || !expr.endsWith(')')) return false
  // Genau EIN Aufruf als ganzer Ausdruck: die erste Klammer schließt am Ende.
  let depth = 0
  for (let i = 'safeExternalHref'.length; i < expr.length; i++) {
    if (expr[i] === '(') depth++
    else if (expr[i] === ')') {
      depth--
      if (depth === 0) return i === expr.length - 1
    }
  }
  return false
}

function wrapperFor(binding: Binding) {
  return WRAPPERS.find(w => w.file === binding.file
    && (binding.expr === w.name || (binding.expr.startsWith(`${w.name}(`) && binding.expr.endsWith(')'))))
}

function collectBindings(): Binding[] {
  const bindings: Binding[] = []
  for (const root of appRoots()) {
    for (const path of vueFilesUnder(root)) {
      const file = relative(REPO, path).split('\\').join('/')
      for (const expr of hrefBindings(readFileSync(path, 'utf8'))) bindings.push({ file, expr })
    }
  }
  return bindings
}

describe('SEC-021: jede :href-Bindung ist nur http(s) oder intern', () => {
  const bindings = collectBindings()

  it('findet die Bindungen überhaupt (Selbstprobe des Suchmusters)', () => {
    expect(hrefBindings('<template>\n  <a :href="x.url">a</a>\n  <a v-bind:href=\'y\'>b</a>\n  <!-- <a :href="z"> -->\n</template>'))
      .toEqual(['x.url', 'y'])
    expect(bindings.length).toBeGreaterThan(20)
  })

  it('jede Bindung geht über safeExternalHref, ist erkennbar unbedenklich oder begründet ausgenommen', () => {
    const offenders = bindings
      .filter(b => !isWholeSafeCall(b.expr))
      .filter(b => !SAFE_LITERAL.test(b.expr) && !SAFE_CALL.test(b.expr))
      .filter(b => !wrapperFor(b))
      .filter(b => !(`${b.file} :: ${b.expr}` in EXCEPTIONS))
      .map(b => `${b.file} :: ${b.expr}`)
    expect(offenders).toEqual([])
  })

  it('die Selbstprobe der Regel: ein Teilausdruck mit safeExternalHref zählt nicht', () => {
    expect(isWholeSafeCall('safeExternalHref(a.url)')).toBe(true)
    expect(isWholeSafeCall('safeExternalHref(a.url) || b.url')).toBe(false)
    expect(isWholeSafeCall('b.url || safeExternalHref(a.url)')).toBe(false)
    expect(SAFE_LITERAL.test('`//${host}`')).toBe(false)
  })

  it('jede Hilfsfunktion aus WRAPPERS ruft selbst safeExternalHref', () => {
    for (const wrapper of WRAPPERS) {
      const source = readFileSync(join(REPO, wrapper.defFile), 'utf8')
      const at = source.search(new RegExp(`(?:function ${wrapper.name}\\(|const ${wrapper.name} = )`))
      expect(at, `${wrapper.defFile}: Definition von ${wrapper.name}`).toBeGreaterThanOrEqual(0)
      const body = source.slice(at).split('\n').slice(0, 12).join('\n')
      expect(body, `${wrapper.defFile}: ${wrapper.name}`).toContain('safeExternalHref(')
    }
  })

  it('keine Ausnahme und keine Hilfsfunktion ohne Gegenstand', () => {
    const keys = new Set(bindings.map(b => `${b.file} :: ${b.expr}`))
    const staleExceptions = Object.keys(EXCEPTIONS).filter(key => !keys.has(key))
    const staleWrappers = WRAPPERS
      .filter(w => !bindings.some(b => wrapperFor(b) === w))
      .map(w => `${w.file} :: ${w.name}`)
    expect([...staleExceptions, ...staleWrappers]).toEqual([])
  })
})
