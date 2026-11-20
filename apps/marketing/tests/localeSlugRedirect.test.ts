/**
 * EIN LINK IN DER EINEN SPRACHE, EIN BROWSER IN DER ANDEREN (Q03, 2026-11-20).
 *
 * Die Sprach-Erkennung (`redirectOn: 'all'`) schickt einen deutschen Browser
 * von `/products/posts` auf `/de/produkte/posts` — sie übersetzt nur den
 * festen Teil der Adresse. Den Namen dahinter übersetzt die Seite selbst:
 * `matchProductSlug` / `matchAudienceSlug` sagen ihr „Treffer", „weiterleiten
 * nach …" oder „404". Bis dahin endeten sechs Adressen je Richtung auf einer
 * Fehlerseite.
 *
 * DIE ERWARTUNGEN STEHEN AUSGESCHRIEBEN DA, nicht aus der Namens-Tabelle
 * berechnet: ein Test, der sein Soll aus derselben Tabelle liest wie der
 * geprüfte Code, wäre immer grün. Ein letzter Test hält diese Liste gegen die
 * Tabelle — ein neues Produkt mit zwei Namen ohne Zeile hier ist rot.
 *
 * WAS DIESER TEST NICHT BEWEIST: dass der Server die Weiterleitung wirklich
 * ausliefert (das zeigt nur ein Abruf mit `Accept-Language`), und was
 * @nuxtjs/i18n davor mit der Adresse macht.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUDIENCE_KEYS,
  AUDIENCE_SLUGS,
  PRODUCT_KEYS,
  PRODUCT_SLUGS,
  matchAudienceSlug,
  matchProductSlug,
} from '../shared/marketing'

/** [englischer Name, deutscher Name] — nur Seiten, deren Name sich unterscheidet. */
const PRODUCT_PAIRS = [
  ['comments', 'kommentare'],
  ['posts', 'beitraege'],
  ['courses', 'kurse'],
] as const

const AUDIENCE_PAIRS = [
  ['course-creators', 'kurse'],
  ['creators', 'creator'],
  ['clubs', 'vereine'],
] as const

/** Seiten, die in beiden Sprachen gleich heißen: nie eine Weiterleitung. */
const PRODUCT_SAME = ['moderation', 'branding', 'events', 'analytics'] as const
const AUDIENCE_SAME = ['coaches'] as const

describe.each([
  { name: 'Produkte', match: matchProductSlug, pairs: PRODUCT_PAIRS, same: PRODUCT_SAME },
  { name: 'Anwendungsfälle', match: matchAudienceSlug, pairs: AUDIENCE_PAIRS, same: AUDIENCE_SAME },
])('$name: Name der anderen Sprache', ({ match, pairs, same }) => {
  it.each(pairs)('deutsche Seite mit englischem Namen %s leitet auf %s', (en, de) => {
    expect(match(en, 'de')).toMatchObject({ slug: de, redirect: true })
  })

  it.each(pairs)('englische Seite mit deutschem Namen (%s ← %s) leitet auf den englischen', (en, de) => {
    expect(match(de, 'en')).toMatchObject({ slug: en, redirect: true })
  })

  it.each(pairs)('der eigene Name (%s / %s) zeigt die Seite ohne Weiterleitung', (en, de) => {
    expect(match(en, 'en')).toMatchObject({ slug: en, redirect: false })
    expect(match(de, 'de')).toMatchObject({ slug: de, redirect: false })
  })

  it.each(pairs)('beide Richtungen von %s / %s meinen dieselbe Seite', (en, de) => {
    const key = match(en, 'en')?.key
    expect(key).toBeDefined()
    expect(match(de, 'de')?.key).toBe(key)
    expect(match(en, 'de')?.key).toBe(key)
    expect(match(de, 'en')?.key).toBe(key)
  })

  it.each(same)('%s heißt in beiden Sprachen gleich und leitet nie weiter', (slug) => {
    expect(match(slug, 'de')).toMatchObject({ slug, redirect: false })
    expect(match(slug, 'en')).toMatchObject({ slug, redirect: false })
  })

  it('ein unbekannter Name bleibt eine Fehlerseite, in beiden Sprachen', () => {
    expect(match('gibt-es-nicht', 'de')).toBeUndefined()
    expect(match('gibt-es-nicht', 'en')).toBeUndefined()
    expect(match('', 'de')).toBeUndefined()
  })
})

describe('die Liste oben ist vollständig', () => {
  it('jede Seite der Namens-Tabellen steht in den Paaren oder bei den Gleichnamigen', () => {
    const listed = (pairs: readonly (readonly [string, string])[], same: readonly string[]) =>
      [...pairs.map(([en, de]) => `${en}|${de}`), ...same.map(slug => `${slug}|${slug}`)].sort()
    expect(PRODUCT_KEYS.map(key => `${PRODUCT_SLUGS[key].en}|${PRODUCT_SLUGS[key].de}`).sort())
      .toEqual(listed(PRODUCT_PAIRS, PRODUCT_SAME))
    expect(AUDIENCE_KEYS.map(key => `${AUDIENCE_SLUGS[key].en}|${AUDIENCE_SLUGS[key].de}`).sort())
      .toEqual(listed(AUDIENCE_PAIRS, AUDIENCE_SAME))
  })
})

describe('die beiden Seiten leiten wirklich weiter', () => {
  const page = (rel: string) =>
    readFileSync(fileURLToPath(new URL(`../app/pages/${rel}`, import.meta.url)), 'utf8')

  it.each([
    ['produkte/[slug].vue', 'matchProductSlug', 'produkte-slug'],
    ['use-cases/[slug].vue', 'matchAudienceSlug', 'use-cases-slug'],
  ])('%s fragt %s und leitet mit 301 über localePath weiter', (rel, fn, routeName) => {
    const source = page(rel)
    expect(source).toContain(`${fn}(String(route.params.slug), locale.value)`)
    expect(source).toMatch(/if \(match\.redirect\) \{\s*await navigateTo\(\s*localePath\(/)
    expect(source).toContain(`name: '${routeName}', params: { slug: match.slug }`)
    expect(source).toContain('redirectCode: 301')
  })

  it('keine feste Regel in nuxt.config.ts fängt eine dieser Adressen vorher ab', () => {
    const config = readFileSync(fileURLToPath(new URL('../nuxt.config.ts', import.meta.url)), 'utf8')
    const sources = [...config.matchAll(/^\s*'([^']+)':\s*\{\s*redirect:/gm)].map(m => m[1])
    expect(sources.length).toBeGreaterThan(0)
    const pages = [
      ...PRODUCT_PAIRS.flatMap(([en, de]) => [`/products/${en}`, `/products/${de}`, `/de/produkte/${en}`, `/de/produkte/${de}`]),
      ...AUDIENCE_PAIRS.flatMap(([en, de]) => [`/use-cases/${en}`, `/use-cases/${de}`, `/de/use-cases/${en}`, `/de/use-cases/${de}`]),
    ]
    expect(pages.filter(path => sources.includes(path))).toEqual([])
  })
})
