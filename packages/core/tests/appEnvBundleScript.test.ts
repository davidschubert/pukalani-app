import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { decrypt, GPG_REQUIRED, HAS_GPG, makeKey, stopAgent, type ThrowawayKey } from './support/throwawayGpg'

/**
 * BU1 b (2026-11-18): `ops/app-env-bundle.sh` packt auf dem App-Server die
 * `.env` jeder Site aus `ops/apps.conf` in EIN Bündel, verschlüsselt mit dem
 * öffentlichen Schlüssel des Backups. Der Appwrite-Server holt es ab
 * (`ops/appwrite-backup.sh`, APP_ENV_SOURCE; Tests dazu in
 * appwriteBackupScript.test.ts).
 *
 * Geprüft mit ECHTEM gpg und Wegwerf-Schlüsseln: das Bündel öffnet sich mit
 * dem privaten Teil und enthält genau `<site>/.env` je Site, byte-gleich; ein
 * Wert aus einer .env erscheint in keiner Ausgabe im Klartext; ein halbes
 * Bündel gibt es nicht; das Wort kommt auch über SSH_ORIGINAL_COMMAND an und
 * Fremdes wird abgelehnt, nie ausgeführt.
 */
// Jeder Test startet das Skript als eigenen Prozess, dazu gpg (Schlüssel
// erzeugen, entschlüsseln) — mehr als die 5 s Standardfrist auf einem
// langsamen Runner.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'ops', 'app-env-bundle.sh')
const BACKUP = join(REPO, 'ops', 'appwrite-backup.sh')
const SITES = ['admin.example.test', 'example.test', 'shop.example.test']
const MARKER = 'KLARTEXT-WERT-7f3a'
const VAR = 'NUXT_GEHEIMER_NAME'
const envBody = (site: string) => `${VAR}=${MARKER}-${site}\nNUXT_PUBLIC_SITE=${site}\n`

let root: string
let base: string
let right: ThrowawayKey

function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    env: {
      ...process.env,
      TMPDIR: join(root, 'tmp'),
      APP_ENV_APPS_CONF: join(root, 'apps.conf'),
      APP_ENV_BASE: base,
      BACKUP_PUBLIC_KEY: right?.pub ?? join(root, 'fehlt.asc'),
      BACKUP_KEY_FINGERPRINT: right?.fingerprint ?? 'A'.repeat(40),
      SSH_ORIGINAL_COMMAND: '',
      ...env,
    },
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr.toString('utf8') }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'app-env-bundle-'))
  if (HAS_GPG) right = makeKey(root, 'richtig')
})

afterAll(() => {
  if (right) stopAgent(right)
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  base = join(root, `base-${Math.random().toString(36).slice(2)}`)
  rmSync(join(root, 'tmp'), { recursive: true, force: true })
  mkdirSync(join(root, 'tmp'))
  writeFileSync(join(root, 'apps.conf'), `# Kommentar\n\n${SITES.map((s, i) => `app${i}  ${s}`).join('\n')}\n`)
  for (const site of SITES) {
    mkdirSync(join(base, site), { recursive: true })
    writeFileSync(join(base, site, '.env'), envBody(site))
  }
})

describe('ops/app-env-bundle.sh — gpg ist da, wo es sein muss', () => {
  it.runIf(GPG_REQUIRED)('in der CI gibt es gpg (sonst fiele der Beweis still aus)', () => {
    expect(HAS_GPG).toBe(true)
  })
})

describe.skipIf(!HAS_GPG)('ops/app-env-bundle.sh — das Bündel', () => {
  it('öffnet sich mit dem privaten Schlüssel und enthält genau <site>/.env je Site, byte-gleich', () => {
    const { code, stdout, stderr } = run([])
    expect(stderr).toContain('3 Sites verschlüsselt')
    expect(code).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)
    const enc = join(root, 'b.gpg')
    writeFileSync(enc, stdout)
    decrypt(right, enc, join(root, 'b.tar.gz'))
    const listed = spawnSync('tar', ['tzf', join(root, 'b.tar.gz')], { encoding: 'utf8' })
    expect(listed.status).toBe(0)
    expect(listed.stdout.trim().split('\n').sort()).toEqual(SITES.map(s => `${s}/.env`).sort())
    const out = join(root, 'aus')
    mkdirSync(out, { recursive: true })
    expect(spawnSync('tar', ['xzf', join(root, 'b.tar.gz'), '-C', out]).status).toBe(0)
    for (const site of SITES) expect(readFileSync(join(out, site, '.env'), 'utf8')).toBe(envBody(site))
    rmSync(out, { recursive: true })
  })

  it('kein Wert und kein Variablenname aus einer .env in irgendeiner Ausgabe, kein Rest im Temp-Ordner', () => {
    const { code, stdout, stderr } = run(['bundle'])
    expect(code).toBe(0)
    expect(stdout.toString('latin1')).not.toContain(MARKER)
    expect(stdout.toString('latin1')).not.toContain(VAR)
    expect(stderr).not.toContain(MARKER)
    expect(stderr).not.toContain(VAR)
    // Das eigene gpg-Home ist am Ende gelöscht.
    expect(readdirSync(join(root, 'tmp'))).toEqual([])
  })

  it('fehlt eine .env: Exit 1, die Site wird genannt, NICHTS auf der Standard-Ausgabe', () => {
    rmSync(join(base, 'example.test', '.env'))
    const { code, stdout, stderr } = run(['bundle'])
    expect(code).toBe(1)
    expect(stdout.length).toBe(0)
    expect(stderr).toContain('example.test')
    expect(stderr).toContain('fehlt')
  })

  it('ist eine .env leer: Exit 1, nichts auf der Standard-Ausgabe', () => {
    writeFileSync(join(base, 'shop.example.test', '.env'), '')
    const { code, stdout, stderr } = run(['bundle'])
    expect(code).toBe(1)
    expect(stdout.length).toBe(0)
    expect(stderr).toContain('shop.example.test')
    expect(stderr).toContain('leer')
  })

  it('falscher Fingerabdruck: Abbruch, nichts verschlüsselt, Temp-Ordner aufgeräumt', () => {
    const { code, stdout, stderr } = run(['bundle'], { BACKUP_KEY_FINGERPRINT: 'B'.repeat(40) })
    expect(code).toBe(1)
    expect(stdout.length).toBe(0)
    expect(stderr).toContain('Falscher Schlüssel')
    expect(readdirSync(join(root, 'tmp'))).toEqual([])
  })

  it('das Wort kommt auch über SSH_ORIGINAL_COMMAND an (erzwungener Befehl) — leer heißt bundle', () => {
    const viaSsh = run([], { SSH_ORIGINAL_COMMAND: 'bundle' })
    expect(viaSsh.code).toBe(0)
    expect(viaSsh.stdout.length).toBeGreaterThan(0)
    const empty = run([], { SSH_ORIGINAL_COMMAND: '' })
    expect(empty.code).toBe(0)
    expect(empty.stdout.length).toBeGreaterThan(0)
    const list = run([], { SSH_ORIGINAL_COMMAND: 'list' })
    expect(list.code).toBe(0)
    expect(list.stdout.toString('utf8')).toBe(SITES.map(s => `${s} vorhanden\n`).join(''))
  })
})

describe('ops/app-env-bundle.sh — list und fremde Wörter (ohne gpg)', () => {
  it('list nennt je Site einen Zustand, nie einen Wert oder Variablennamen', () => {
    rmSync(join(base, 'example.test', '.env'))
    writeFileSync(join(base, 'shop.example.test', '.env'), '')
    const { code, stdout, stderr } = run(['list'])
    expect(code).toBe(0)
    expect(stdout.toString('utf8')).toBe('admin.example.test vorhanden\nexample.test fehlt\nshop.example.test leer\n')
    expect(`${stdout}${stderr}`).not.toContain(MARKER)
    expect(`${stdout}${stderr}`).not.toContain(VAR)
  })

  it('liest ohne Angabe die echte apps.conf neben dem Skript', () => {
    const conf = readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8')
    const sites = conf.split('\n').filter(l => l.trim() && !l.trimStart().startsWith('#')).map(l => l.trim().split(/\s+/)[1])
    expect(sites.length).toBeGreaterThan(3)
    const { code, stdout } = run(['list'], { APP_ENV_APPS_CONF: '' })
    expect(code).toBe(0)
    expect(stdout.toString('utf8')).toBe(sites.map(s => `${s} fehlt\n`).join(''))
  })

  it('unbekanntes Wort: Exit 2, nichts ausgeführt, nichts wiederholt', () => {
    const marker = join(root, 'ausgefuehrt')
    for (const word of ['restore', `touch ${marker}`, 'bundle; id', 'list && id', '$(id)', 'bundle extra']) {
      const viaArg = run([word])
      expect(viaArg.code, word).toBe(2)
      expect(viaArg.stdout.length, word).toBe(0)
      expect(viaArg.stderr, word).not.toContain(word)
      const viaSsh = run([], { SSH_ORIGINAL_COMMAND: word })
      expect(viaSsh.code, word).toBe(2)
      expect(viaSsh.stdout.length, word).toBe(0)
    }
    expect(() => readFileSync(marker)).toThrow()
    expect(run(['bundle', 'list']).code).toBe(2)
  })

  it('lehnt einen Site-Namen ab, der aus dem Basis-Ordner herausführt', () => {
    writeFileSync(join(root, 'apps.conf'), 'boese ../etc\n')
    const { code, stdout } = run(['list'])
    expect(code).toBe(1)
    expect(stdout.length).toBe(0)
  })
})

describe('ops/app-env-bundle.sh — ein Schlüssel', () => {
  it('trägt denselben Fingerabdruck wie das Backup-Skript (das den Schlüssel im Repo prüft)', () => {
    const fpr = (file: string) => readFileSync(file, 'utf8').match(/^DEFAULT_FINGERPRINT='([0-9A-F]{40})'$/m)?.[1]
    expect(fpr(SCRIPT)).toMatch(/^[0-9A-F]{40}$/)
    expect(fpr(SCRIPT)).toBe(fpr(BACKUP))
  })

  it('führt das Wort nie aus: kein eval, SSH_ORIGINAL_COMMAND nur an einer Stelle gelesen', () => {
    const code = readFileSync(SCRIPT, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#'))
    expect(code.join('\n')).not.toMatch(/\beval\b/)
    expect(code.filter(l => l.includes('SSH_ORIGINAL_COMMAND'))).toEqual(['WORD="${1:-${SSH_ORIGINAL_COMMAND:-}}"'])
  })
})
