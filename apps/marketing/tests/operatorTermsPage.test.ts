/**
 * Wächter für die Bedingungen für Community-Betreiber (seit 2026-11-16).
 *
 * Drei stille Fehler, die weder Typecheck noch `check:i18n-keys` sehen:
 *  1. `:section-count` der Seite und die Zahl der Abschnitte in den Locales
 *     laufen auseinander — zu hoch rendert vue-i18n rohe Schlüssel, zu niedrig
 *     fehlt ein Abschnitt still.
 *  2. Deutsch und Englisch haben verschieden viele Abschnitte (die englische
 *     Fassung ist eine Übersetzung, kein anderer Text).
 *  3. Die Fassungs-Zeile der Seite nennt eine andere Fassung als die, die der
 *     Wizard festhält (`version` in apps/platform/app/app.config.ts).
 * Dazu: keine Zeichen, an denen der Nachrichten-Compiler von vue-i18n
 * scheitert oder etwas anderes tut (spitze Klammern, geschweifte Klammern,
 * `@`, `|`) — `.claude/rules/i18n-seo.md`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

interface OperatorBundle {
  title: string
  draftNote: string
  version: string
  sections: Array<{ title: string, body: string }>
}

function operator(locale: 'de' | 'en'): OperatorBundle {
  const raw = JSON.parse(readFileSync(join(root, 'i18n', 'locales', `${locale}.json`), 'utf8')) as {
    marketing: { legal: { operator: OperatorBundle } }
  }
  return raw.marketing.legal.operator
}

const page = readFileSync(join(root, 'app', 'pages', 'betreiber-bedingungen.vue'), 'utf8')
const platformConfig = readFileSync(join(root, '..', 'platform', 'app', 'app.config.ts'), 'utf8')

describe('Bedingungen für Community-Betreiber', () => {
  const count = Number(page.match(/:section-count="(\d+)"/)?.[1] ?? Number.NaN)

  it.each(['de', 'en'] as const)('%s: so viele Abschnitte, wie die Seite rendert, jeder mit Titel und Text', (locale) => {
    const bundle = operator(locale)
    expect(bundle.sections).toHaveLength(count)
    for (const section of bundle.sections) {
      expect(section.title.trim()).not.toBe('')
      expect(section.body.trim()).not.toBe('')
    }
  })

  it('Deutsch und Englisch haben gleich viele Absätze je Abschnitt', () => {
    const de = operator('de').sections.map(section => section.body.split('\n').length)
    const en = operator('en').sections.map(section => section.body.split('\n').length)
    expect(en).toEqual(de)
  })

  it('die Fassungs-Zeile nennt die Fassung, die der Wizard festhält', () => {
    const block = platformConfig.slice(platformConfig.indexOf('operatorTerms:'))
    const version = block.match(/version:\s*'([^']+)'/)?.[1]
    expect(version).toBeTruthy()
    expect(operator('de').version).toContain(version!)
    expect(operator('en').version).toContain(version!)
  })

  it.each(['de', 'en'] as const)('%s: keine Zeichen, die der Nachrichten-Compiler anders liest', (locale) => {
    const text = JSON.stringify(operator(locale))
    for (const bad of ['<', '>', '{', '}', '@', '|']) {
      // JSON.stringify setzt selbst geschweifte Klammern um Objekte — die Texte
      // werden deshalb einzeln geprüft.
      if (bad === '{' || bad === '}') continue
      expect(text, `${locale}: ${bad}`).not.toContain(bad)
    }
    const strings = [operator(locale).title, operator(locale).draftNote, operator(locale).version,
      ...operator(locale).sections.flatMap(section => [section.title, section.body])]
    for (const value of strings) {
      expect(value).not.toMatch(/[{}]/)
    }
  })
})
