import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * DER WÄCHTER FÜR RECHTE AN ABLAGEN UND TABELLEN (`pnpm check:permissions`,
 * SEC-001 und SEC-002) — bis hierher ohne Test (WL1 d, 2026-11-17): er lief
 * bei jedem Lint, aber niemand prüfte, ob er einen Fehler überhaupt FÄNDE.
 *
 * Der Test lässt das echte Skript laufen, gegen eine KOPIE der Migrationen
 * und des Bootstrap-Skripts. Sauber ⇒ grün. Dann je ein eingebauter Fehler:
 * der Wächter muss rot werden und die Datei nennen.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(REPO, 'scripts', 'check-permissions.mjs')

let root: string

function run() {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, PUKALANI_CHECK_ROOT: root } })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

/** Legt eine Datei in die Kopie, lässt den Wächter laufen und nimmt sie wieder heraus. */
function withFile(relativePath: string, content: string) {
  const file = join(root, relativePath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
  try {
    return run()
  }
  finally {
    rmSync(file)
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'check-permissions-'))
  mkdirSync(join(root, 'scripts'))
  cpSync(join(REPO, 'scripts', 'bootstrap.mjs'), join(root, 'scripts', 'bootstrap.mjs'))
  for (const layer of readdirSync(join(REPO, 'packages'))) {
    const migrations = join(REPO, 'packages', layer, 'scripts', 'migrations')
    if (existsSync(migrations)) cpSync(migrations, join(root, 'packages', layer, 'scripts', 'migrations'), { recursive: true })
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pnpm check:permissions', () => {
  it('der heutige Stand ist grün — und der Wächter hat wirklich etwas gelesen', () => {
    const { code, out } = run()
    expect(code, out).toBe(0)
    const buckets = /Ablagen-Rechte: (\d+) Bucket-Definitionen geprüft \(davon (\d+) in scripts\/bootstrap\.mjs\)/.exec(out)
    const tables = /Tabellen-Rechte: (\d+) Tabellen, die nur der Server schreibt, (\d+) Definitionen geprüft/.exec(out)
    // Untergrenzen statt fester Zahlen: ein Lauf, der nichts findet, ist nicht grün.
    expect(Number(buckets?.[1])).toBeGreaterThanOrEqual(10)
    expect(Number(buckets?.[2])).toBeGreaterThanOrEqual(1)
    expect(Number(tables?.[1])).toBeGreaterThanOrEqual(5)
    expect(Number(tables?.[2])).toBeGreaterThanOrEqual(5)
  })

  it.each([
    ['Schreibrecht für Konten als Aufruf', `permissions: [Permission.read(Role.any()), Permission.create(Role.users())]`, 'probe-bucket'],
    ['Schreibrecht als Zeichenkette', `permissions: ['read("any")', 'update("users")']`, 'probe-bucket'],
    ['Rechte aus einer Variable (nicht lesbar)', `permissions: bucketRights`, 'probe-bucket'],
  ])('GEGENPROBE Ablage: %s ⇒ rot, mit Datei und Bucket', (_name, permissions, bucket) => {
    const { code, out } = withFile('packages/media/scripts/migrations/998-probe-bucket.ts', `
const bucketRights = []
await storage.createBucket({
  bucketId: '${bucket}',
  name: 'Probe',
  ${permissions},
  fileSecurity: true,
  enabled: true,
})
`)
    expect(code).toBe(1)
    expect(out).toContain('Bucket mit Schreibrecht oder unlesbaren Rechten')
    expect(out).toContain('packages/media/scripts/migrations/998-probe-bucket.ts')
    expect(out).toContain(`'${bucket}'`)
  })

  it('eine Ablage mit reinem Leserecht bleibt grün', () => {
    const { code, out } = withFile('packages/media/scripts/migrations/998-probe-bucket.ts', `
await storage.createBucket({
  bucketId: 'probe-bucket',
  name: 'Probe',
  permissions: [Permission.read(Role.any())],
  fileSecurity: true,
  enabled: true,
})
`)
    expect(code, out).toBe(0)
  })

  it('GEGENPROBE Tabelle: eine spätere Migration gibt einer Server-Tabelle ein Schreibrecht zurück ⇒ rot', () => {
    const { code, out } = withFile('packages/comments/scripts/migrations/998-probe-rights.ts', `
await tablesDB.updateTable({
  databaseId,
  tableId: 'comments',
  name: 'Comments',
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
})
`)
    expect(code).toBe(1)
    expect(out).toContain('Tabelle, die nur der Server schreibt')
    expect(out).toContain('packages/comments/scripts/migrations/998-probe-rights.ts')
    expect(out).toContain(`'comments'`)
  })

  it('GEGENPROBE Tabelle: auch eine neue Anlage mit Schreibrecht nach der Rechte-Migration ist rot', () => {
    const { code, out } = withFile('packages/comments/scripts/migrations/998-probe-rights.ts', `
await tablesDB.createTable({
  databaseId,
  tableId: 'comments',
  name: 'Comments',
  permissions: [Permission.create(Role.users())],
  rowSecurity: true,
})
`)
    expect(code).toBe(1)
    expect(out).toContain('(createTable)')
  })

  it('ohne Bucket im Bootstrap-Skript ist der Wächter rot — er sähe dessen Ablagen nicht', () => {
    const bootstrap = join(root, 'scripts', 'bootstrap.mjs')
    const original = join(REPO, 'scripts', 'bootstrap.mjs')
    writeFileSync(bootstrap, '// leer\n')
    try {
      const { code, out } = run()
      expect(code).toBe(1)
      expect(out).toContain('keine Bucket-Definition gefunden')
    }
    finally {
      cpSync(original, bootstrap)
    }
  })
})
