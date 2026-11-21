import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { devEnvHint } from '../build/devEnvHint'

/**
 * OHNE `.env` KOMMT GENAU EINE KLARE ZEILE (DOC-006, Q20 — 2026-11-21).
 *
 * Vorher: Dev-Server startet, jede Daten-Route antwortet 500, das Log nennt nur
 * „Endpoint must be a valid string". Der Test hält fest, WAS die Zeile sagt
 * (Datei beim Namen, Vorlage, Verweis aufs README), WANN sie schweigt (alles
 * gesetzt; App ohne Datenbank) und dass der Dev-Start sie wirklich aufruft.
 *
 * WAS DER TEST NICHT BEWEIST: wie die Zeile im laufenden `nuxi dev` aussieht —
 * das ist ein Beweis von Hand (Start ohne `.env`).
 */

const FULL = { NUXT_PUBLIC_APPWRITE_ENDPOINT: 'http://localhost/v1', NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'probe' }
const EXAMPLE = 'NUXT_APPWRITE_KEY=\nNUXT_PUBLIC_APPWRITE_ENDPOINT=http://localhost/v1\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=\n'

let repoDir: string

function app(name: string, files: Record<string, string>) {
  const rootDir = join(repoDir, 'apps', name)
  mkdirSync(rootDir, { recursive: true })
  for (const [file, content] of Object.entries(files)) writeFileSync(join(rootDir, file), content)
  return rootDir
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'dev-env-hint-'))
})
afterAll(() => rmSync(repoDir, { recursive: true, force: true }))

describe('devEnvHint', () => {
  it('ohne .env: eine Zeile mit Datei, Vorlage und Verweis aufs README', () => {
    const hint = devEnvHint({ rootDir: app('ohne', { '.env.example': EXAMPLE }), repoDir, env: {} })
    expect(hint).toContain('apps/ohne/.env fehlt')
    expect(hint).toContain('Vorlage: apps/ohne/.env.example')
    expect(hint).toContain('README.md')
    expect(hint?.split('\n')).toHaveLength(1)
  })

  it('.env da, aber eine Pflicht-Variable leer: nennt die Variable', () => {
    const rootDir = app('halb', { '.env.example': EXAMPLE, '.env': 'NUXT_PUBLIC_APPWRITE_ENDPOINT=http://localhost/v1\n' })
    const hint = devEnvHint({ rootDir, repoDir, env: { ...FULL, NUXT_PUBLIC_APPWRITE_PROJECT_ID: ' ' } })
    expect(hint).toContain('apps/halb/.env ist unvollständig: NUXT_PUBLIC_APPWRITE_PROJECT_ID fehlt')
    expect(hint).not.toContain('NUXT_PUBLIC_APPWRITE_ENDPOINT fehlt')
    expect(hint?.split('\n')).toHaveLength(1)
  })

  it('alles gesetzt: keine Zeile — auch ohne .env (Werte aus der Shell)', () => {
    expect(devEnvHint({ rootDir: app('voll', { '.env.example': EXAMPLE }), repoDir, env: FULL })).toBeNull()
  })

  it('App ohne Datenbank (Vorlage lässt den Endpunkt leer oder fehlt): keine Zeile', () => {
    const leer = app('hilfe', { '.env.example': 'NUXT_PUBLIC_APPWRITE_ENDPOINT=\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=\n' })
    expect(devEnvHint({ rootDir: leer, repoDir, env: {} })).toBeNull()
    expect(devEnvHint({ rootDir: app('spielwiese', {}), repoDir, env: {} })).toBeNull()
  })

  it('nennt nie einen Wert aus der Umgebung', () => {
    const rootDir = app('wert', { '.env.example': EXAMPLE, '.env': '' })
    const hint = devEnvHint({ rootDir, repoDir, env: { NUXT_PUBLIC_APPWRITE_ENDPOINT: 'http://geheim.example/v1' } })
    expect(hint).not.toContain('geheim')
  })
})

describe('Aufruf im Dev-Start', () => {
  const config = readFileSync(fileURLToPath(new URL('../nuxt.config.ts', import.meta.url)), 'utf8')

  it('der Core ruft die Prüfung im Hook `ready` — nur im Dev-Server, nie bei prepare', () => {
    const hook = config.slice(config.indexOf('\'ready\': (nuxt) => {'))
    expect(hook).toContain('devEnvHint({')
    expect(hook.slice(0, hook.indexOf('devEnvHint({'))).toContain('if (!nuxt.options.dev || nuxt.options._prepare) return')
  })

  it('die echten Vorlagen: comments wird gefragt, help nicht', () => {
    const repo = fileURLToPath(new URL('../../..', import.meta.url))
    expect(devEnvHint({ rootDir: join(repo, 'apps/comments'), repoDir: repo, env: {} })).not.toBeNull()
    expect(devEnvHint({ rootDir: join(repo, 'apps/help'), repoDir: repo, env: {} })).toBeNull()
  })
})

describe('Bootstrap ohne .env', () => {
  const repo = fileURLToPath(new URL('../../..', import.meta.url))

  it('jeder Paket-Befehl `bootstrap` lädt die Datei nachsichtig — sonst endet er bei Nodes „.env: not found"', () => {
    const scripts = readdirSync(join(repo, 'apps'))
      .map(name => join(repo, 'apps', name, 'package.json'))
      .filter(file => existsSync(file))
      .map(file => (JSON.parse(readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }).scripts?.bootstrap)
      .filter((script): script is string => typeof script === 'string')
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) expect(script).toContain('--env-file-if-exists=.env')
    expect(readFileSync(join(repo, 'scripts/create-site.mjs'), 'utf8')).toContain('--env-file-if-exists=.env ../../scripts/bootstrap.mjs')
  })

  it('das Skript nennt dann die fehlende Datei und die Vorlage', () => {
    const source = readFileSync(join(repo, 'scripts/bootstrap.mjs'), 'utf8')
    expect(source).toContain('.env fehlt — Vorlage: apps/${APP_NAME}/.env.example')
  })
})
