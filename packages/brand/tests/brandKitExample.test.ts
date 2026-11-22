import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { strFromU8, unzipSync } from 'fflate'
import { BRAND_KIT_ZIP_MAX_BYTES } from '../shared/brandKitLimits'
import { KAILUA_COFFEE_KIT, KAILUA_COFFEE_KIT_TILES, kailuaCoffeeKitHref } from '../shared/examples/kailuaCoffeeKit'

/**
 * DAS ÖFFENTLICHE BEISPIEL-KIT (BK1 Paket K7, §2.7 „Beispiel", §2.9).
 *
 * Zugesagt ist: (1) dieselben Erzeuger wie das Kit einer Marke — also die
 * vollen Dateien mit Design; (2) öffentlich mit `public, max-age=3600`;
 * (3) byte-gleich bei jedem Abruf (fester Stand); (4) `:file` ist eine Wahl
 * aus der Registry, nichts sonst; (5) nur Reisendes — kein Wettbewerber, kein
 * Konto-Wert. Die Live-Probe derselben Zusagen steht in
 * `scripts/verify-brand-kit.mjs` (Abschnitt 10).
 */

let headers: Record<string, string | number> = {}
let fileParam = ''

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init))
vi.stubGlobal('getRouterParam', () => fileParam)
vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: string | number) => {
  headers[name.toLowerCase()] = value
})

const fileRoute = (await import('../server/api/brand/example/kit/[file].get'))
  .default as unknown as (event: H3Event) => string
const zipRoute = (await import('../server/api/brand/example/kit.zip.get'))
  .default as unknown as (event: H3Event) => Buffer
const { brandKitExample } = await import('../server/utils/brandKitExample')

const EVENT = {} as H3Event

function getFile(file: string): { body?: string, status?: number } {
  headers = {}
  fileParam = file
  try {
    return { body: fileRoute(EVENT) }
  }
  catch (error) {
    return { status: (error as { status?: number }).status }
  }
}

describe('Beispiel-Kit: Dateien', () => {
  it.each(['brand.md', 'brand.json', 'tokens.json', 'tokens.css', 'licenses.md', 'readme.md'])('%s ist öffentlich da', (file) => {
    const res = getFile(file)
    expect(res.status).toBeUndefined()
    expect(res.body!.length).toBeGreaterThan(50)
    expect(headers['cache-control']).toBe('public, max-age=3600')
    expect(String(headers['content-disposition'])).toMatch(/^inline; filename="kailua-coffee-co-/)
    expect(String(headers['content-disposition'])).toContain('2026-09-09')
  })

  it('unbekannte Datei und Pfad-Versuche ⇒ 404', () => {
    for (const file of ['', 'secret.txt', '../brand.md', 'marks', 'kit.zip']) {
      expect(getFile(file).status).toBe(404)
    }
  })

  it('mit Design gerechnet: die Tokens tragen die Farben des Beispiels', () => {
    const css = getFile('tokens.css').body!
    expect(css).toMatch(/--[a-z-]+:\s*#[0-9a-f]{6}/i)
    const json = JSON.parse(getFile('tokens.json').body!) as Record<string, unknown>
    expect(Object.keys(json).length).toBeGreaterThan(0)
  })

  it('nur Reisendes: kein Wettbewerber, keine Konto-Angabe', () => {
    const md = getFile('brand.md').body!
    expect(md).toContain('Kailua Coffee Co.')
    expect(md).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i)
  })
})

describe('Beispiel-Kit: Bündel', () => {
  it('ein gültiges Zip mit README, Dateien und Zeichen, öffentlich', () => {
    headers = {}
    const zip = zipRoute(EVENT)
    expect(headers['content-type']).toBe('application/zip')
    expect(headers['cache-control']).toBe('public, max-age=3600')
    expect(String(headers['content-disposition'])).toContain('kailua-coffee-co-brand-kit-2026-09-09.zip')
    const entries = unzipSync(new Uint8Array(zip))
    const names = Object.keys(entries)
    expect(names).toContain('README.md')
    expect(names).toContain('brand.md')
    expect(names).toContain('tokens.css')
    expect(names.filter(name => name.startsWith('marks/') && name.endsWith('.svg')).length).toBeGreaterThan(0)
    expect(strFromU8(entries['brand.md']!)).toBe(getFile('brand.md').body)
  })

  it('byte-gleich bei jedem Abruf und unter dem Deckel', () => {
    const a = zipRoute(EVENT)
    const b = zipRoute(EVENT)
    expect(Buffer.compare(a, b)).toBe(0)
    expect(a.byteLength).toBeLessThan(BRAND_KIT_ZIP_MAX_BYTES)
    expect(brandKitExample().stand).toBe(KAILUA_COFFEE_KIT.stand)
  })
})

describe('Beispiel-Kit: Kacheln der Anatomie', () => {
  it('jede Kachel zeigt auf eine Adresse, die antwortet', () => {
    for (const tile of KAILUA_COFFEE_KIT_TILES) {
      const href = kailuaCoffeeKitHref(tile.file)
      if (tile.file === 'bundle') {
        expect(href).toBe('/api/brand/example/kit.zip')
        continue
      }
      expect(href).toBe(`/api/brand/example/kit/${tile.file}`)
      expect(getFile(tile.file).status).toBeUndefined()
    }
  })
})
