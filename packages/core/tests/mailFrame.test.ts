import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { asMailLocale, frameMail, mailGreeting, resolveMailLocale } from '../shared/mailFrame'

/**
 * DER EINE RAHMEN FÜR JEDE EIGENE MAIL (Q06, BRD-006; Davids Antwort R6).
 *
 * Zwei Hälften:
 *  1. Der Rahmen selbst: Anrede, Schluss-Zeile mit Marke, Sprach-Regel, HTML.
 *  2. DER WÄCHTER: jede Datei, die `sendMail(` ruft, baut ihren Text mit
 *     `frameMail(` — selbst oder in einem Modul, das sie relativ importiert.
 *     Eine neue Mail ohne Rahmen ist rot. Gegenprobe: dieselbe Prüfung
 *     meldet eine erfundene Datei ohne Rahmen.
 */

describe('frameMail', () => {
  it('Anrede mit Namen, Absätze, Schluss-Zeile mit der Marke (de)', () => {
    const { text, html } = frameMail({ brand: 'Morgenlicht', locale: 'de', name: 'Ana', lines: ['Erster Absatz.', '', 'Zweiter Absatz.'] })
    expect(text).toBe('Hallo Ana,\n\nErster Absatz.\n\nZweiter Absatz.\n\nViele Grüße\nMorgenlicht')
    expect(html).toBeUndefined()
  })

  it('englisch und ohne Namen', () => {
    expect(frameMail({ brand: 'Pukalani', locale: 'en', lines: ['Body.'] }).text).toBe('Hi,\n\nBody.\n\nBest regards\nPukalani')
    expect(mailGreeting('de', '   ')).toBe('Hallo,')
  })

  it('Fußzeile unter dem Gruß; HTML escaped und ohne feste Farbe', () => {
    const { text, html } = frameMail({ brand: 'B', locale: 'en', name: '<b>x</b>', lines: ['See https://example.test/a?b=1'], footer: 'Why you get this.', html: true })
    expect(text.endsWith('Best regards\nB\n\n—\nWhy you get this.')).toBe(true)
    expect(html).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
    expect(html).toContain('<a href="https://example.test/a?b=1">')
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('ohne Marke wirft er — die Schluss-Zeile darf nicht leer sein', () => {
    expect(() => frameMail({ brand: ' ', locale: 'de', lines: ['x'] })).toThrow(/brand fehlt/)
  })
})

describe('resolveMailLocale — EINE Regel: Konto, sonst Anfrage, sonst Englisch', () => {
  it('Konto schlägt Anfrage', () => {
    expect(resolveMailLocale({ account: 'en', request: 'de' })).toBe('en')
    expect(resolveMailLocale({ account: 'de', request: 'en' })).toBe('de')
  })
  it('ohne Konto die Anfrage, auch als de-DE', () => {
    expect(resolveMailLocale({ request: 'de-DE' })).toBe('de')
  })
  it('sonst Englisch — kein Rückfall auf Deutsch', () => {
    expect(resolveMailLocale({ account: 'fr', request: '' })).toBe('en')
    expect(resolveMailLocale({})).toBe('en')
    expect(asMailLocale(42)).toBeNull()
  })
})

// ── Wächter ─────────────────────────────────────────────────────────────────

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MAILER = 'packages/core/server/utils/mailer.ts'
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'tests', 'e2e', 'scripts', 'dist'])

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

/** Code ohne Kommentarzeilen — ein `sendMail(` in einer Erklärung zählt nicht. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n')
}

function relativeImports(file: string, source: string): string[] {
  return [...source.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)]
    .map(m => resolve(dirname(file), m[1]!))
    .flatMap(base => [`${base}.ts`, join(base, 'index.ts')])
    .filter(existsSync)
}

/** Pur: ruft die Datei `sendMail(`, ohne dass sie oder ein Import `frameMail(` ruft? */
function unframedMail(file: string, source: string, read: (path: string) => string): boolean {
  const own = code(source)
  if (!/\bsendMail\(/.test(own)) return false
  if (/\bframeMail\(/.test(own)) return false
  return !relativeImports(file, own).some(path => /\bframeMail\(/.test(code(read(path))))
}

describe('Wächter: jede eigene Mail geht durch den Rahmen', () => {
  const roots = ['packages', 'apps'].flatMap(top =>
    readdirSync(join(REPO, top)).flatMap(name => ['server', 'shared'].map(sub => join(REPO, top, name, sub))))
  const files = roots.flatMap(walk).filter(path => relative(REPO, path) !== MAILER)
  const read = (path: string) => readFileSync(path, 'utf8')

  it('findet die Versand-Stellen überhaupt (sonst wäre der Wächter blind)', () => {
    const senders = files.filter(path => /\bsendMail\(/.test(code(read(path))))
    expect(senders.length).toBeGreaterThanOrEqual(15)
  })

  it('keine Datei ruft sendMail( ohne frameMail(', () => {
    const offenders = files.filter(path => unframedMail(path, read(path), read)).map(path => relative(REPO, path))
    expect(offenders, `Mail ohne gemeinsamen Rahmen — Text über frameMail() aus core/shared/mailFrame.ts bauen:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('Gegenprobe: eine erfundene Datei ohne Rahmen ist rot, mit Rahmen grün', () => {
    const fake = join(REPO, 'packages/x/server/utils/fake.ts')
    expect(unframedMail(fake, `await sendMail(event, { to, subject, text: 'Hallo' })`, () => '')).toBe(true)
    expect(unframedMail(fake, `const { text } = frameMail({ brand, locale, lines })\nawait sendMail(event, { to, subject, text })`, () => '')).toBe(false)
    expect(unframedMail(fake, `/** ruft sendMail(…) */\nexport const x = 1`, () => '')).toBe(false)
  })
})
