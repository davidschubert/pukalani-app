import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_FAMILY, brandFamilyLinks, pukalaniSpeaks, type BrandFamilyKey } from '../shared/brandFamily'

/**
 * WÄCHTER: EINE MARKE, EIN ZEICHEN — DREI MARKEN, DIE AUFEINANDER ZEIGEN
 * (Q24, Davids Entscheidungen R4 und R9, DECISION-LOG 2026-11-21).
 *
 *  1. Das Pukalani-Zeichen gibt es GENAU EINMAL als Baustein (`PukaMark` im
 *     Core); Anmeldung und Kundenbereich benutzen ihn, die alten Ersatz-
 *     Symbole sind dort weg.
 *  2. Das Zeichen erscheint nur, wo Pukalani selbst spricht — nie in der
 *     Community eines Kunden (Mandanten-Host) und nie auf einer Silo-Site.
 *  3. Jede der drei Fußzeilen nennt die zwei anderen Marken, mit normalen
 *     Links.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground', 'dist'])

function read(file: string): string {
  return readFileSync(join(REPO, file), 'utf8')
}

/** Ohne HTML-Kommentare: die nennen die Bausteine beim Namen. */
function code(file: string): string {
  return read(file).replace(/<!--[\s\S]*?-->/g, '')
}

function vueFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) vueFiles(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

const MARK = 'packages/core/app/components/PukaMark.vue'

/** Die Flächen des Kundenbereichs, auf denen Pukalani selbst spricht. */
const CUSTOMER_AREA = [
  'packages/core/app/components/AuthBrandHeader.vue',
  'packages/onboarding/app/layouts/onboarding.vue',
  'packages/onboarding/app/pages/start/done.vue',
]

const FOOTERS: Record<BrandFamilyKey, string> = {
  pukalani: 'packages/marketing/app/components/MarketingFooter.vue',
  studio: 'apps/portfolio/app/components/SiteFooter.vue',
  branding: 'packages/brand/app/components/BwSiteFooter.vue',
}

describe('Zeichen: ein Baustein für Marketing-Site und Kundenbereich (R4)', () => {
  it('gibt es genau einmal als Komponente, und keine andere Komponente kopiert die Grafik', () => {
    const all = ['packages', 'apps'].flatMap(group => vueFiles(join(REPO, group)))
      .map(full => relative(REPO, full))
    expect(all.filter(file => file.endsWith('/PukaMark.vue'))).toEqual([MARK])
    // Die Sonne der puka (Verlauf) steht nur im Baustein selbst.
    const copies = all.filter(file => file !== MARK && read(file).includes('hsl(40 98% 66%)'))
    expect(copies).toEqual([])
  })

  it.each(CUSTOMER_AREA)('%s zeigt das gemeinsame Zeichen statt eines Ersatz-Symbols', (file) => {
    const source = code(file)
    expect(source).toContain('<PukaMark')
    expect(source).not.toContain('i-ph-sun-horizon')
  })

  it('zeigt das Zeichen über der Anmeldung nur, wo Pukalani spricht', () => {
    expect(code('packages/core/app/components/AuthBrandHeader.vue')).toMatch(/<PukaMark v-if="pukalaniSpeaks"/)
  })

  it.each([
    ['packages/core/app/components/auth/LoginForm.vue', 'i-ph-user-circle'],
    ['packages/core/app/components/auth/RegisterForm.vue', 'i-ph-user-circle-plus'],
  ])('%s blendet das Formular-Symbol aus, wo das Zeichen steht', (file, icon) => {
    expect(code(file)).toContain(`<UIcon v-if="!pukalaniSpeaks" name="${icon}"`)
  })

  it('die Marketing-Site benutzt denselben Baustein (keine eigene Kopie im Layer)', () => {
    expect(existsSync(join(REPO, 'packages/marketing/app/components/PukaMark.vue'))).toBe(false)
    expect(code('packages/marketing/app/components/MarketingHeader.vue')).toContain('<PukaMark')
  })
})

describe('Wer spricht? Das Pukalani-Zeichen nie in der Community eines Kunden (R4)', () => {
  it('Kundenbereich auf einem Kontroll-Host ohne Mandant: ja', () => {
    expect(pukalaniSpeaks({ tenantBrand: null, controlHost: true })).toBe(true)
  })

  it('Community im Pool (Mandanten-Host mit eigenem Namen): nein', () => {
    expect(pukalaniSpeaks({ tenantBrand: 'Morgenlicht', controlHost: false })).toBe(false)
  })

  it('ein gesetzter Mandant schlägt jede Host-Einstufung: nein', () => {
    expect(pukalaniSpeaks({ tenantBrand: 'Morgenlicht', controlHost: true })).toBe(false)
  })

  it('Silo-Site (eigene Marke, kein Kontroll-Host): nein', () => {
    expect(pukalaniSpeaks({ tenantBrand: null, controlHost: false })).toBe(false)
  })
})

describe('Fußzeilen: jede der drei Marken nennt die zwei anderen (R9)', () => {
  it.each(Object.entries(FOOTERS))('%s: %s bindet die Zeile mit der eigenen Marke ein', (key, file) => {
    expect(code(file)).toContain(`<CoreBrandFamily current="${key}"`)
  })

  it.each(BRAND_FAMILY.map(brand => brand.key))('%s verlinkt genau die zwei anderen', (current) => {
    const links = brandFamilyLinks(current, 'en')
    expect(links.map(link => link.key).sort()).toEqual(
      BRAND_FAMILY.map(brand => brand.key).filter(key => key !== current).sort(),
    )
  })

  it('führt deutsche Leser auf die deutsche Fassung, englische auf die Wurzel', () => {
    expect(brandFamilyLinks('pukalani', 'de').map(link => link.href))
      .toEqual(['https://pukalani.studio/de', 'https://branding.supply/de'])
    expect(brandFamilyLinks('branding', 'en').map(link => link.href))
      .toEqual(['https://pukalani.app', 'https://pukalani.studio'])
  })

  it('setzt normale Links: kein nofollow, kein neues Fenster', () => {
    const source = code('packages/core/app/components/core/BrandFamily.vue')
      .replace(/<script[\s\S]*?<\/script>/g, '')
    expect(source).toContain(':href="link.href"')
    expect(source).not.toMatch(/nofollow|target=/)
  })

  it.each(['de', 'en'])('hat die Wörter der Zeile auf %s', (locale) => {
    const messages = JSON.parse(read(`packages/core/i18n/locales/${locale}.json`)) as {
      ui: { brandFamily: { label: string, aria: string, roles: Record<BrandFamilyKey, string> } }
    }
    const family = messages.ui.brandFamily
    expect(family.label).toBeTruthy()
    expect(family.aria).toBeTruthy()
    for (const brand of BRAND_FAMILY) expect(family.roles[brand.key]).toBeTruthy()
  })
})
