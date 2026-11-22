import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: DAS SITZUNGS-COOKIE LIEST NUR DER EINE LESEPUNKT (PK1 E1a).
 *
 * `readRequestSession()` (`core/server/utils/requestSession.ts`) versteht
 * Klartext UND Eintrittskarte und wendet den Schalter `NUXT_SITE_CARD_MODE`
 * an. Eine Stelle, die das Cookie selbst mit `getCookie` liest, sähe eine
 * Karte als Geheimnis (Appwrite lehnt ab) oder umginge die Regel „auf einer
 * eigenen Domain gilt nur die Karte". Deshalb hier, über ALLE
 * `server/`-Ordner aller Layer und Apps: kein `getCookie(…)` auf den
 * Sitzungs-Namen — weder über `sessionCookieName(…)` (auch nicht über eine
 * Variable dazwischen) noch über ein `a_session_`-Literal — außerhalb des
 * Lesepunkts.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const READ_POINT = 'packages/core/server/utils/requestSession.ts'

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (name.endsWith('.ts')) found.push(path)
  }
  return found
}

function serverFiles(): string[] {
  const files: string[] = []
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(ROOT, group))) {
      files.push(...walk(join(ROOT, group, name, 'server')))
    }
  }
  return files.map(file => relative(ROOT, file).split('\\').join('/')).sort()
}

/** Kommentare fallen weg — ein Aufruf in einer Begründung zählt nicht. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Fundstellen eines verbotenen Lesens: direkter Name, `a_session_`-Literal,
 * oder eine Variable, die aus `sessionCookieName(…)` stammt.
 */
function sessionCookieReads(source: string): string[] {
  const text = code(source)
  const hits: string[] = []
  const direct = /getCookie\s*\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*(?:sessionCookieName\s*\(|['"`]a_session_)/g
  for (const match of text.matchAll(direct)) hits.push(match[0])
  const aliases = [...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*sessionCookieName\s*\(/g)].map(m => m[1])
  for (const alias of aliases) {
    const viaAlias = new RegExp(`getCookie\\s*\\(\\s*[^,()]+\\s*,\\s*${alias.replace(/\$/g, '\\$')}\\s*\\)`, 'g')
    for (const match of text.matchAll(viaAlias)) hits.push(match[0])
  }
  return hits
}

const FILES = serverFiles()

describe('Sitzungs-Cookie: nur der eine Lesepunkt', () => {
  it('findet die Server-Ordner überhaupt (sonst wäre der Wächter blind)', () => {
    expect(FILES).toContain(READ_POINT)
    expect(FILES).toContain('packages/core/server/middleware/02.auth.ts')
    expect(FILES.length).toBeGreaterThan(200)
  })

  it('kein getCookie auf den Sitzungs-Namen außerhalb des Lesepunkts', () => {
    const offenders = FILES
      .filter(file => file !== READ_POINT)
      .flatMap(file => sessionCookieReads(readFileSync(join(ROOT, file), 'utf8')).map(hit => `${file}: ${hit}`))
    expect(offenders).toEqual([])
  })

  it('der Lesepunkt selbst liest das Cookie (der Wächter erkennt die echte Stelle)', () => {
    expect(sessionCookieReads(readFileSync(join(ROOT, READ_POINT), 'utf8')).length).toBeGreaterThan(0)
  })

  describe('Gegenprobe: erfundene Zeilen werden erkannt', () => {
    it.each([
      ['direkt', 'const secret = getCookie(event, sessionCookieName(event))'],
      ['mit Leerzeichen und Umbruch', 'const s = getCookie(\n  event,\n  sessionCookieName(event),\n)'],
      ['über eine Variable', 'const name = sessionCookieName(event)\nconst s = getCookie(event, name)'],
      ['Literal', "const s = getCookie(event, 'a_session_account')"],
      ['Template-Literal', 'const s = getCookie(event, `a_session_${projectId}`)'],
      ['Event als Ausdruck', 'const s = getCookie(ctx.event, sessionCookieName(ctx.event))'],
    ])('%s', (_label, line) => {
      expect(sessionCookieReads(line).length).toBeGreaterThan(0)
    })

    it.each([
      ['anderes Cookie', "getCookie(event, 'i18n_redirected')"],
      ['nur im Kommentar', '// getCookie(event, sessionCookieName(event))'],
      ['Name nur gesetzt, nicht gelesen', 'deleteCookie(event, sessionCookieName(event), { path: "/" })'],
    ])('nicht gemeldet: %s', (_label, line) => {
      expect(sessionCookieReads(line)).toEqual([])
    })
  })
})
