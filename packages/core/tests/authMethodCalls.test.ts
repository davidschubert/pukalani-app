import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../../scripts/lib/migration-inventory.mjs'

/**
 * SEC-007 (GA1 P13): die Anmelde-Wege eines Appwrite-Projekts sind für Aufrufe
 * OHNE API-Schlüssel abgeschaltet (Auth → Settings → Auth methods), damit kein
 * Konto an unserer Registrierung vorbei entsteht. Aufrufe mit Schlüssel
 * überspringt Appwrite. Jeder Aufruf unseres Servers, den diese Schalter
 * treffen, muss deshalb über den ADMIN-Client laufen — ein Aufruf über den
 * Session-Client bekäme 501, und der Weg fiele für alle aus.
 *
 * Die Liste unten sind die SDK-Methoden hinter den gesperrten Endpunkten
 * (Appwrite 2.7.1, Label `auth.type`). Nicht dabei, weil nicht gesperrt:
 * Wiederherstellung, E-Mail-Bestätigung, OAuth, Zwei-Faktor, `createSession`
 * aus einem Token.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const GATED = [
  'create', // account.create — nur mit `account.` davor gemeint, s. Muster
  'createEmailPasswordSession',
  'createEmailToken',
  'createMagicURLToken',
  'createAnonymousSession',
  'createPhoneToken',
  'createPhoneVerification',
  'createJWT',
]

function serverFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.ts')) files.push(path)
    }
  }
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const server = join(ROOT, group, name, 'server')
      if (existsSync(server)) walk(server)
    }
  }
  return files
}

export function guestAuthCalls(file: string, source: string): string[] {
  const code = stripComments(source)
  const findings: string[] = []
  const pattern = new RegExp(`\\baccount\\s*\\.\\s*(${GATED.join('|')})\\s*\\(`, 'g')
  for (const match of code.matchAll(pattern)) {
    // Woher kommt `account`? Die letzte Zuweisung davor entscheidet.
    const before = code.slice(0, match.index)
    const declarations = [...before.matchAll(/\{[^}]*\baccount\b[^}]*\}\s*=\s*(createAdminClient|createSessionClient)\s*\(/g)]
    const last = declarations.at(-1)?.[1]
    const inline = /(createAdminClient|createSessionClient)\s*\([^)]*\)\s*\.\s*$/.exec(before)?.[1]
    const origin = inline ?? last
    if (origin !== 'createAdminClient') {
      const line = before.split('\n').length
      findings.push(`${file}:${line} account.${match[1]}() über ${origin ?? 'unbekannten Client'}`)
    }
  }
  return findings
}

describe('Anmelde-Aufrufe, die Appwrites Schalter treffen, laufen über den Admin-Client', () => {
  const files = serverFiles().map(path => ({ file: relative(ROOT, path), source: readFileSync(path, 'utf8') }))

  it('der Leser sieht die Aufrufe (sonst wäre der Wächter blind)', () => {
    const seen = files.filter(f => /\baccount\s*\.\s*(createEmailToken|createEmailPasswordSession)\s*\(/.test(stripComments(f.source))).map(f => f.file)
    expect(seen).toContain('packages/core/server/api/auth/otp.post.ts')
    expect(seen).toContain('packages/core/server/api/auth/login.post.ts')
    expect(seen).toContain('packages/core/server/api/auth/signup.post.ts')
  })

  it('Gegenprobe: derselbe Aufruf über den Session-Client fällt auf', () => {
    const otp = files.find(f => f.file === 'packages/core/server/api/auth/otp.post.ts')!
    const asGuest = otp.source.replace('const { account } = createAdminClient(event)', 'const { account } = createSessionClient(event)')
    expect(asGuest).not.toBe(otp.source)
    expect(guestAuthCalls(otp.file, asGuest)).toHaveLength(1)
  })

  it('kein gesperrter Aufruf läuft über den Session-Client', () => {
    expect(files.flatMap(f => guestAuthCalls(f.file, f.source))).toEqual([])
  })
})
