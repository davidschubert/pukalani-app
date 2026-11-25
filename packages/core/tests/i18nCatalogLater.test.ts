import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createCatalogLater } from '../app/utils/i18nCatalogLater'

/**
 * TK1: die Seite bringt ihre Texte mit, der volle Katalog kommt nach dem
 * Start. Zwei Teile: (1) die Weiche selbst, (2) Wächter für die drei
 * Stellen in @nuxtjs/i18n und vue-i18n, auf die sie sich stützt — ändert ein
 * Update eine davon, ist dieser Test rot, bevor im Browser Texte fehlen.
 */
function setup(opts: { hydrating?: boolean, pagePart?: boolean } = {}) {
  let hydrating = opts.hydrating ?? true
  const idle: Array<() => void> = []
  const load = vi.fn(async (_locale: string) => {})
  const later = createCatalogLater({
    load,
    isHydrating: () => hydrating,
    hasPagePart: () => opts.pagePart ?? true,
    whenIdle: run => idle.push(run),
  })
  return { later, load, idle, endHydration: () => { hydrating = false } }
}

describe('createCatalogLater — die Weiche', () => {
  it('während der Hydration mit eingebetteten Texten: kein Abruf, Nachladen im Leerlauf', async () => {
    const { later, load, idle, endHydration } = setup()
    await later.loader('de')
    await later.loader('de') // Middleware der ersten Route ruft noch einmal
    expect(load).not.toHaveBeenCalled()
    expect(later.isPending('de')).toBe(true)
    expect(idle).toHaveLength(1)
    endHydration()
    idle[0]!()
    await Promise.resolve()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('de')
    expect(later.isPending('de')).toBe(false)
  })

  it('Gegenprobe: ohne eingebettete Texte (SPA-Seite, Fehlerseite) lädt sie wie das Modul', async () => {
    const { later, load, idle } = setup({ pagePart: false })
    await later.loader('de')
    expect(load).toHaveBeenCalledTimes(1)
    expect(idle).toHaveLength(0)
    expect(later.isPending('de')).toBe(false)
  })

  it('Gegenprobe: nach der Hydration (Sprachwechsel, Navigation) lädt sie sofort', async () => {
    const { later, load } = setup({ hydrating: false })
    await later.loader('en')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ein fehlender Text holt den Katalog sofort, und alle warten auf denselben Abruf', async () => {
    const { later, load, idle, endHydration } = setup()
    await later.loader('de')
    endHydration()
    const a = later.loadNow('de')
    const b = later.loadNow('de')
    const c = later.loader('de') // erste Navigation (preload-Plugin des Moduls)
    expect(later.isPending('de')).toBe(true)
    await Promise.all([a, b, c])
    expect(load).toHaveBeenCalledTimes(1)
    idle[0]!() // der Leerlauf kommt danach — ein weiterer Abruf wäre nur Doppelarbeit
    expect(later.isPending('de')).toBe(false)
  })
})

const require = createRequire(import.meta.url)
const i18nDir = dirname(require.resolve('@nuxtjs/i18n/package.json'))
const vueI18nDir = dirname(createRequire(join(i18nDir, 'package.json')).resolve('vue-i18n/package.json'))
const read = (path: string) => readFileSync(path, 'utf8')

describe('TK1-Wächter: worauf sich die Weiche verlässt', () => {
  it('@nuxtjs/i18n ruft `i18n:beforeLocaleSwitch` VOR `ctx.loadMessages` (dort wird verdrahtet)', () => {
    const utils = read(join(i18nDir, 'dist/runtime/utils.js'))
    const body = utils.slice(utils.indexOf('export async function loadAndSetLocale'))
    const hook = body.indexOf('i18n:beforeLocaleSwitch')
    const load = body.indexOf('ctx.loadMessages(locale)')
    expect(hook).toBeGreaterThan(0)
    expect(load).toBeGreaterThan(hook)
  })

  it('@nuxtjs/i18n legt seinen Kontext als `nuxt._nuxtI18n` ab, mit `loadMessages` und `preloaded`', () => {
    const plugin = read(join(i18nDir, 'dist/runtime/plugins/i18n.js'))
    expect(plugin).toContain('nuxt._nuxtI18n = ctx')
    const context = read(join(i18nDir, 'dist/runtime/context.js'))
    expect(context).toMatch(/loadMessages: async \(locale\) =>/)
    expect(context).toMatch(/preloaded: false/)
  })

  it('vue-i18n rendert `<i18n-t>` über das Symbol `__translateVNode` (Server-Nachtrag)', () => {
    const lib = read(join(vueI18nDir, 'dist/vue-i18n.mjs'))
    expect(lib).toContain('makeSymbol(\'__translateVNode\')')
    expect(lib).toMatch(/i18n\[TranslateVNodeSymbol\]\(props\.keypath/)
  })

  it('der Core schaltet `preload` + `stripMessagesPayload` ein (sonst hätte die Seite keine Texte)', () => {
    const config = read(join(__dirname, '../nuxt.config.ts'))
    expect(config).toMatch(/experimental: \{\s*preload: true,\s*stripMessagesPayload: true,/)
  })
})
