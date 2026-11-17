import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decideRunTarget, loadSiteManifest, planMigrations, readEnvValues } from '../../../scripts/lib/migrate-plan.mjs'

/**
 * OPS-002 (GA1 P21): der Migrations-Runner prüft das Ziel, bevor er schreibt.
 * Vorfall 2026-08-31: ein Lauf mit der falschen Env-Datei legte 18 fremde
 * Tabellen im Projekt `branding` an.
 *
 * Die CLI-Fälle starten den ECHTEN Runner mit Env-Dateien im Temp-Ordner.
 * Jeder Fall endet VOR dem ersten Migrationsprozess (Abbruch oder
 * --dry-run) — kein Netz, keine Appwrite. Der Endpunkt `*.invalid` ist per
 * RFC 2606 nie auflösbar, falls doch einmal etwas durchrutscht.
 */
const REPO = join(__dirname, '..', '..', '..')
const RUNNER = join(REPO, 'scripts', 'migrate.mjs')
const REMOTE = 'https://appwrite.example.invalid/v1'
const LOCAL = 'http://localhost/v1'

let dir: string

function envFile(name: string, endpoint: string, projectId: string) {
  const file = join(dir, `${name}.env`)
  writeFileSync(file, `# Testdatei\nNUXT_PUBLIC_APPWRITE_ENDPOINT="${endpoint}"\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}\nNUXT_APPWRITE_MIGRATIONS_KEY=nie-ausgeben\n`)
  return file
}

function run(...args: string[]) {
  // Die Umgebung des Testlaufs darf das Ergebnis nicht färben.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NUXT_') && key !== 'PUKALANI_TARGET_CONFIRM'))
  const result = spawnSync(process.execPath, ['--experimental-strip-types', RUNNER, ...args], { cwd: REPO, env, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'migrate-runner-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('migrate.mjs — Ziel-Prüfung (CLI)', () => {
  it('falsches Projekt für die App ⇒ Exit 1, die Meldung nennt beide Ids', () => {
    const file = envFile('wrong', LOCAL, 'branding')
    const result = run('--app', 'comments', '--env-file', file, '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('„branding"')
    expect(result.stderr).toContain('„account"')
    expect(result.stdout).not.toContain('PROBELAUF')
  })

  it('richtiges Projekt, entfernter Endpunkt, ohne --prod ⇒ Exit 1 mit dem genauen Aufruf', () => {
    const file = envFile('remote', REMOTE, 'branding')
    const result = run('--app', 'branding', '--env-file', file)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--prod')
    expect(result.stderr).toContain(`--app branding --env-file ${file} --prod`)
  })

  it('richtiges Projekt, entfernt, --prod --dry-run ⇒ Exit 0 und listet die Dateien', () => {
    const file = envFile('remote-prod', REMOTE, 'branding')
    const result = run('--app', 'branding', '--env', file, '--prod', '--dry-run')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('PROBELAUF')
    expect(result.stdout).toContain('NICHT lokal')
    expect(result.stdout).toContain('packages/system/scripts/migrations/001-')
    expect(result.stdout).toContain('packages/brand/scripts/migrations/026-')
    expect(result.stdout).toContain('nichts geschrieben')
    // Die Env-Datei wird nur auf Endpunkt und Projekt gelesen.
    expect(result.stdout + result.stderr).not.toContain('nie-ausgeben')
  })

  it('--dry-run gegen entfernt ohne --prod ⇒ Exit 0 mit Hinweis auf --prod', () => {
    const file = envFile('remote-dry', REMOTE, 'branding')
    const result = run('--app', 'branding', '--env-file', file, '--dry-run')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('braucht --prod')
  })

  it('--prod mit lokalem Endpunkt ⇒ Exit 1', () => {
    const file = envFile('local-prod', LOCAL, 'branding')
    const result = run('--app', 'branding', '--env-file', file, '--prod', '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('lokal')
  })

  it('--env-file ohne --app ⇒ Exit 1 (die frühere ungefilterte Tür ist zu)', () => {
    const file = envFile('no-app', LOCAL, 'branding')
    const result = run('--env-file', file, '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--app')
  })

  it('--layer, den die App nicht nutzt ⇒ Exit 1', () => {
    const file = envFile('layer', LOCAL, 'branding')
    const result = run('--app', 'branding', '--env-file', file, '--layer', 'courses', '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('courses')
  })

  it('--only mit unbekannter Nummer ⇒ Exit 1 und listet, was es gibt', () => {
    const file = envFile('only-unknown', LOCAL, 'branding')
    const result = run('--app', 'branding', '--env-file', file, '--only', 'brand-999', '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('brand-026')
  })

  it('--only brand-026 --dry-run ⇒ genau eine Datei', () => {
    const file = envFile('only', LOCAL, 'branding')
    const result = run('--app', 'branding', '--env-file', file, '--only', 'brand-026', '--dry-run')
    expect(result.status).toBe(0)
    const listed = result.stdout.split('\n').filter(line => /scripts\/migrations\/\d{3}-.*\.ts$/.test(line.trim()))
    expect(listed).toEqual(['    packages/brand/scripts/migrations/026-brand-check-erasure.ts'])
  })

  it('App ohne eigene Appwrite-Instanz (leere Liste) ⇒ Exit 1', () => {
    const file = envFile('marketing', LOCAL, 'marketing')
    const result = run('--app', 'marketing', '--env-file', file, '--dry-run')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('keine eigene Appwrite-Instanz')
  })
})

describe('migrate-plan — reine Logik', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'migrate-plan-'))
    const app = (name: string, source: string) => {
      mkdirSync(join(root, 'apps', name), { recursive: true })
      writeFileSync(join(root, 'apps', name, 'site.manifest.ts'), source)
    }
    app('kaputt', 'throw new Error(\'Ladefehler im Manifest\')\nexport default {}\n')
    app('ohne-liste', 'export default { siteId: \'ohne-liste\', products: [\'comments\'] }\n')
    app('gut', 'export default { siteId: \'gut\', products: [\'comments\'], appwriteProjects: [\'gut-1\'] }\n')
    mkdirSync(join(root, 'apps', 'leer'), { recursive: true })
    for (const [layer, files] of [['system', ['001-a.ts', '002-b.ts']], ['comments', ['001-c.ts', 'README.md']], ['posts', ['001-d.ts']]] as const) {
      mkdirSync(join(root, 'packages', layer, 'scripts', 'migrations'), { recursive: true })
      for (const name of files) writeFileSync(join(root, 'packages', layer, 'scripts', 'migrations', name), '')
    }
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('fehlendes Manifest ⇒ Abbruch', async () => {
    const result = await loadSiteManifest(root, 'leer')
    expect(result.ok).toBe(false)
  })

  it('nicht ladbares Manifest ⇒ Abbruch (früher: ALLE Layer migrieren)', async () => {
    const result = await loadSiteManifest(root, 'kaputt')
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.message).toContain('nicht ladbar')
  })

  it('ungültiges Manifest (ohne appwriteProjects) ⇒ Abbruch', async () => {
    const result = await loadSiteManifest(root, 'ohne-liste')
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.message).toContain('appwriteProjects')
  })

  it('gültiges Manifest ⇒ geladen', async () => {
    const result = await loadSiteManifest(root, 'gut')
    expect(result).toEqual({ ok: true, manifest: { siteId: 'gut', products: ['comments'], appwriteProjects: ['gut-1'] } })
  })

  const layerOrder = ['system', 'comments', 'posts']
  const manifest = { products: ['comments'] }

  it('ohne Angaben: system + Produkte der App, Reihenfolge LAYER_ORDER', () => {
    const plan = planMigrations({ root, layerOrder, manifest })
    expect(plan).toMatchObject({ ok: true, layers: ['system', 'comments'], skipped: ['posts'] })
    expect(plan.ok && plan.files.map(f => f.file.split('/').at(-1))).toEqual(['001-a.ts', '002-b.ts', '001-c.ts'])
  })

  it('--only sortiert nach LAYER_ORDER, dann Nummer — egal in welcher Reihenfolge angegeben', () => {
    const plan = planMigrations({ root, layerOrder, manifest, only: ['comments-001', 'system-002', 'system-001'] })
    expect(plan.ok && plan.files.map(f => `${f.layer}/${f.file.split('/').at(-1)}`)).toEqual(['system/001-a.ts', 'system/002-b.ts', 'comments/001-c.ts'])
  })

  it('--only / --layer außerhalb der App ⇒ Abbruch', () => {
    expect(planMigrations({ root, layerOrder, manifest, only: ['posts-001'] }).ok).toBe(false)
    expect(planMigrations({ root, layerOrder, manifest, layers: ['posts'] }).ok).toBe(false)
    expect(planMigrations({ root, layerOrder, manifest, layers: ['gibtsnicht'] }).ok).toBe(false)
  })

  it('--only in falscher Form oder zusammen mit --layer ⇒ Abbruch', () => {
    expect(planMigrations({ root, layerOrder, manifest, only: ['system-1'] }).ok).toBe(false)
    expect(planMigrations({ root, layerOrder, manifest, only: ['system-001'], layers: ['system'] }).ok).toBe(false)
  })

  it('Wellen-Modus (kein Manifest): jeder bekannte Layer erlaubt', () => {
    expect(planMigrations({ root, layerOrder, manifest: null, layers: ['posts'] })).toMatchObject({ ok: true, layers: ['posts'] })
  })

  it('readEnvValues liest nur die genannten Schlüssel, ohne Anführungszeichen und Kommentar', () => {
    const text = 'export NUXT_PUBLIC_APPWRITE_ENDPOINT=\'https://x/v1\'\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=branding # Kommentar\nNUXT_APPWRITE_KEY=geheim\n# NUXT_PUBLIC_APPWRITE_PROJECT_ID=alt\n'
    expect(readEnvValues(text, ['NUXT_PUBLIC_APPWRITE_ENDPOINT', 'NUXT_PUBLIC_APPWRITE_PROJECT_ID'])).toEqual({
      NUXT_PUBLIC_APPWRITE_ENDPOINT: 'https://x/v1',
      NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'branding',
    })
  })

  it('decideRunTarget: --dry-run ersetzt --prod nur für die Bestätigung, nie für die Liste', () => {
    expect(decideRunTarget({ endpoint: REMOTE, projectId: 'b', allowedProjects: ['b'], prod: false, dryRun: true })).toEqual({ ok: true, local: false })
    expect(decideRunTarget({ endpoint: REMOTE, projectId: 'a', allowedProjects: ['b'], prod: false, dryRun: true })).toMatchObject({ ok: false, reason: 'project_not_allowed' })
    expect(decideRunTarget({ endpoint: LOCAL, projectId: 'b', allowedProjects: ['b'], prod: true, dryRun: true })).toMatchObject({ ok: false, reason: 'prod_but_local' })
    expect(decideRunTarget({ endpoint: REMOTE, projectId: 'b', allowedProjects: ['b'], prod: false, dryRun: false })).toMatchObject({ ok: false, reason: 'remote_unconfirmed' })
  })
})

/**
 * MG1 (c): 13 Layer trugen ein eigenes `migrate`-Skript, das den Runner ohne
 * `--app` rief — seit es mehrere Apps gibt, endete jedes mit „Mehrere Apps
 * gefunden". Ein Befehl, der immer scheitert, sieht aus wie ein zweiter Weg.
 * Es gibt genau einen: `pnpm migrate --app <app>` aus der Wurzel.
 */
describe('migrate — ein Weg, kein Befehl je Layer oder App', () => {
  function scriptsOf(file: string): Record<string, string> {
    return (JSON.parse(readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
  }

  it('die Wurzel trägt den Runner als „migrate"', () => {
    expect(scriptsOf(join(REPO, 'package.json')).migrate).toContain('scripts/migrate.mjs')
  })

  it('kein package.json unter packages/ oder apps/ ruft den Runner selbst', () => {
    const offenders: string[] = []
    for (const group of ['packages', 'apps']) {
      for (const name of readdirSync(join(REPO, group))) {
        const file = join(REPO, group, name, 'package.json')
        if (!existsSync(file)) continue
        for (const [script, command] of Object.entries(scriptsOf(file))) {
          if (script === 'migrate' || command.includes('scripts/migrate.mjs')) offenders.push(`${group}/${name}: "${script}"`)
        }
      }
    }
    expect(offenders, `Eigene Migrations-Befehle:\n  ${offenders.join('\n  ')}\n\nDer eine Weg: pnpm migrate --app <app> (.claude/rules/appwrite.md).`).toEqual([])
  })
})
