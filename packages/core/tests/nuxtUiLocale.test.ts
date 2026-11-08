import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { nuxtUiLocaleFor } from '../app/utils/nuxtUiLocale'

// Nuxt UI spricht nur die Sprache, die `<UApp :locale>` ihm gibt — sonst
// Englisch auf /de (CL1, 2026-11-06: „Oct 27, 2026" auf /de/changelog).
const repoRoot = join(__dirname, '..', '..', '..')

describe('nuxtUiLocaleFor', () => {
  it('ordnet JEDE i18n-Sprache aus core der gleichnamigen Nuxt-UI-Sprache zu', () => {
    const config = readFileSync(join(repoRoot, 'packages/core/nuxt.config.ts'), 'utf8')
    const codes = [...config.matchAll(/\{\s*code:\s*'([a-z_-]+)'/gi)].map(m => m[1])
    expect(codes.length).toBeGreaterThan(1)
    for (const code of codes) expect(nuxtUiLocaleFor(code).code).toBe(code)
  })

  it('fällt bei unbekannter oder fehlender Sprache auf Englisch zurück', () => {
    expect(nuxtUiLocaleFor('xx').code).toBe('en')
    expect(nuxtUiLocaleFor(undefined).code).toBe('en')
  })

  it('bringt deutsche Komponententexte mit', () => {
    expect(nuxtUiLocaleFor('de').messages.modal.close).toBe('Schließen')
  })
})

describe('jede UApp bekommt die Sprache', () => {
  const roots = [
    ...readdirSync(join(repoRoot, 'apps')).map(a => `apps/${a}/app/app.vue`),
    ...readdirSync(join(repoRoot, 'packages'))
      .map(p => `packages/${p}/.playground/app/app.vue`),
    'packages/core/app/components/core/ErrorPage.vue',
  ].filter(f => existsSync(join(repoRoot, f)))

  it.each(roots)('%s', (file) => {
    const src = readFileSync(join(repoRoot, file), 'utf8')
    const tags = [...src.matchAll(/<UApp\b[^>]*>/g)].map(m => m[0])
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) expect(tag).toContain(':locale="uiLocale"')
    expect(src).toContain('useNuxtUiLocale()')
  })
})
