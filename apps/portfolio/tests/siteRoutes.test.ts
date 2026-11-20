import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SITE_ROUTES } from '../server/utils/siteRoutes'

/**
 * LISTE GEGEN SEITEN-ORDNER (SEO-006, 2026-11-20). `SITE_ROUTES` speist
 * sitemap.xml UND llms.txt und wird von Hand geführt. Ohne Vergleich driftet
 * sie: das Erstgespräch — die Seite, auf die die ganze Site hinführt — stand
 * monatelang in keiner der beiden Dateien.
 *
 * Geprüft werden die festen Seiten in `app/pages`. Seiten mit `[slug]` sind
 * ausgenommen: die Cases kommen aus ihrer typisierten Datei in die Liste, die
 * CMS-Seiten trägt die Sitemap-Route selbst bei.
 */
const pagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'pages')

function pageFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? pageFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : entry.name.endsWith('.vue') ? [`${prefix}${entry.name}`] : [])
}

/** `ux-audit/index.vue` → `/ux-audit`, `index.vue` → `/`. */
function filePath(file: string): string {
  const path = `/${file.replace(/\.vue$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, '')
  return path === '' ? '/' : path
}

const fixedPages = pageFiles(pagesDir).filter(file => !file.includes('['))

describe('pukalani.studio: jede feste Seite steht in SITE_ROUTES', () => {
  it('findet die Seiten überhaupt (sonst wäre der Vergleich leer und immer grün)', () => {
    expect(fixedPages).toContain('index.vue')
    expect(fixedPages).toContain('erstgespraech/index.vue')
    expect(fixedPages.length).toBeGreaterThanOrEqual(6)
  })

  it('jede feste Seite hat einen Eintrag', () => {
    const listed = new Set(SITE_ROUTES.map(route => route.path))
    for (const file of fixedPages) {
      expect(listed.has(filePath(file)), `${file} (${filePath(file)}) fehlt in SITE_ROUTES`).toBe(true)
    }
  })

  it('kein Eintrag zeigt auf eine Seite, die es nicht gibt', () => {
    const pages = new Set(fixedPages.map(filePath))
    for (const route of SITE_ROUTES) {
      if (route.path.startsWith('/cases/')) continue
      expect(pages.has(route.path), `${route.path} steht in SITE_ROUTES, aber nicht in app/pages`).toBe(true)
    }
  })

  it('GEGENPROBE: der Vergleich merkt eine fehlende Zeile', () => {
    const without = new Set(SITE_ROUTES.map(route => route.path).filter(path => path !== '/erstgespraech'))
    expect(fixedPages.map(filePath).filter(path => !without.has(path))).toEqual(['/erstgespraech'])
  })

  it('jede Adresse steht nur einmal drin', () => {
    expect(new Set(SITE_ROUTES.map(route => route.path)).size).toBe(SITE_ROUTES.length)
  })
})
