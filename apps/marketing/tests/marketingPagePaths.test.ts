/**
 * DRIFT-WÄCHTER FÜR `MARKETING_PAGE_PATHS` (packages/marketing/shared/marketing.ts).
 *
 * Die Tabelle ist eine ABSCHRIFT: sie hält für jede feste Seite den fertigen
 * Pfad je Sprache, damit der Chrome-Layer (Kopf/Fuß) sie auch auf einer App
 * ohne diese Routen verlinken kann — dort als absolute URL auf pukalani.app.
 * Auf pukalani.app SELBST wird weiterhin über den Route-Namen aufgelöst; die
 * Tabelle ist dort also gar nicht im Spiel.
 *
 * GENAU DAS IST DIE GEFAHR: ändert jemand `defineI18nRoute` einer Seite, merkt
 * er es hier nicht — die Marketing-Seite bleibt richtig, und nur die Links auf
 * help.pukalani.app zeigen still ins Leere (ein 404 auf einem fremden Host
 * fällt niemandem auf, der an dieser App arbeitet). Dieser Test liest deshalb
 * die WAHRHEIT aus den Seiten selbst.
 *
 * Zwei Vergleiche:
 *  1. gegen `defineI18nRoute` in `app/pages/<name>.vue` — der Pfad, den
 *     @nuxtjs/i18n tatsächlich baut (DE mit dem `/de`-Präfix, das die Seite
 *     selbst nicht notiert),
 *  2. gegen `MARKETING_ROUTES` (server/utils/marketingRoutes.ts), wo dieselben
 *     Pfade für die Sitemap ein zweites Mal stehen. Nur für die Seiten, die
 *     dort überhaupt vorkommen — die Rechtstexte fehlen dort ABSICHTLICH
 *     (noindex bis zu den verbindlichen Texten).
 *
 * NEUE CHROME-SEITE OHNE `defineI18nRoute` ist ein Fehlschlag, kein Sonderfall:
 * ohne den Block wäre der EN-Pfad der Dateiname (also deutsch) und die Tabelle
 * müsste raten. Wer eine Seite in den Chrome hängt, notiert ihre Pfade.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MARKETING_PAGE_PATHS } from '../shared/marketing'
import { MARKETING_ROUTES } from '../server/utils/marketingRoutes'

const PAGES_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'app', 'pages')

const PAGE_NAMES = Object.keys(MARKETING_PAGE_PATHS) as (keyof typeof MARKETING_PAGE_PATHS)[]

/**
 * Die `paths` aus dem `defineI18nRoute`-Aufruf einer Seite. Bewusst eine
 * Textanalyse und kein Import: die Datei ist ein SFC mit Auto-Imports, sie
 * lässt sich hier nicht ausführen. Der Aufruf steht in jeder Seite auf einer
 * oder zwei Zeilen und benutzt einfache Anführungszeichen — genau das wird
 * gelesen, und ein anderer Schreibstil fällt als „nicht gefunden" auf, statt
 * still das Falsche zu liefern.
 */
function i18nPathsOf(name: string): { en: string, de: string } | null {
  const src = readFileSync(join(PAGES_DIR, `${name}.vue`), 'utf8')
  const call = src.match(/defineI18nRoute\(\{([\s\S]*?)\}\s*\)/)
  if (!call) return null
  const en = call[1]?.match(/\ben:\s*'([^']+)'/)
  const de = call[1]?.match(/\bde:\s*'([^']+)'/)
  if (!en || !de) return null
  return { en: en[1]!, de: de[1]! }
}

describe('MARKETING_PAGE_PATHS', () => {
  it.each(PAGE_NAMES)('deckt sich mit defineI18nRoute in app/pages/%s.vue', (name) => {
    const paths = i18nPathsOf(name)
    expect(paths, `app/pages/${name}.vue: defineI18nRoute mit en+de nicht gefunden`).not.toBeNull()
    expect(MARKETING_PAGE_PATHS[name].en).toBe(paths!.en)
    // Die Seite notiert den DE-Pfad OHNE Präfix — das setzt @nuxtjs/i18n
    // (`prefix_except_default`, EN als Vorgabe). Die Tabelle trägt ihn fertig.
    expect(MARKETING_PAGE_PATHS[name].de).toBe(`/de${paths!.de}`)
  })

  /**
   * AUSGESCHRIEBEN UND NICHT AUS DER SITEMAP ABGELEITET. Ein „nimm alle, die
   * dort vorkommen" hätte eine Lücke, die genau den gesuchten Fehler durchlässt:
   * ein FALSCHER Pfad in der Tabelle kommt in der Sitemap nicht vor, fiele
   * damit aus der Auswahl und die Prüfung bliebe grün (beim Bau am 2026-08-18
   * an einer Gegenprobe gemessen). Die Rechtstexte fehlen hier
   * ABSICHTLICH: sie sind bis zu den verbindlichen Texten noindex und stehen
   * deshalb in keiner Sitemap.
   */
  const SITEMAP_PAGES = ['faq', 'glossar', 'wechseln', 'dsgvo'] as const

  it.each(SITEMAP_PAGES)('deckt sich mit der Sitemap-Route von %s', (name) => {
    const sitemap = new Set(MARKETING_ROUTES.map(route => `${route.en}|${route.de}`))
    const { en, de } = MARKETING_PAGE_PATHS[name]
    expect(sitemap, `${name}: ${en} / ${de} steht so nicht in MARKETING_ROUTES`).toContain(`${en}|${de}`)
  })
})
