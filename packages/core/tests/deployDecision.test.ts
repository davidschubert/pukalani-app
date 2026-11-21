import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Der Schritt „Deploy nötig?" aus `.github/workflows/deploy.yml`, AUSGEFÜHRT.
 *
 * Warum ein Test (2026-11-21): am 2026-11-20 wurde die rote Prüfung eines
 * ÄLTEREN main-Commits per Re-run grün. Der Auslöser `workflow_run` feuerte
 * für genau diesen Commit, der Schritt verglich ihn mit dem Stand, der schon
 * lief (dem neueren), sah Unterschiede und sagte „deploye" — der ältere Stand
 * lief rund zehn Minuten über dem neueren. Die Sperre dagegen steht als Shell
 * in einer YAML-Datei; weder Typecheck noch Lint noch `check:workflows` führen
 * sie aus.
 *
 * Der Test schneidet deshalb den `run:`-Block des Schritts aus der echten
 * Datei und lässt ihn in einem Wegwerf-Repo laufen. `curl` ist eine Attrappe,
 * die je Host den Build aus einer Datei meldet; `git` und `jq` sind echt.
 */
const REPO = join(__dirname, '..', '..', '..')
const STEP = '      - name: Deploy nötig?'
const INDENT = '          '

function stepScript(eventName: string): string {
  const lines = readFileSync(join(REPO, '.github', 'workflows', 'deploy.yml'), 'utf8').split('\n')
  const start = lines.indexOf(STEP)
  if (start < 0) throw new Error('Schritt „Deploy nötig?" nicht gefunden — der Test liest ihn aus deploy.yml.')
  const run = lines.findIndex((line, index) => index > start && line === '        run: |')
  const body: string[] = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && !line.startsWith(INDENT)) break
    body.push(line.slice(INDENT.length))
  }
  const script = body.join('\n')
  // Der einzige Ausdruck, den GitHub vor dem Lauf einsetzt.
  const filled = script.replaceAll('${{ github.event_name }}', eventName)
  if (filled.includes('${{')) throw new Error('Der Schritt nutzt einen Ausdruck, den der Test nicht einsetzt.')
  return filled
}

let dir: string
let repo: string
const sha: Record<string, string> = {}

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

function commit(name: string, file: string): void {
  mkdirSync(join(repo, file, '..'), { recursive: true })
  writeFileSync(join(repo, file), `${name}\n`)
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', name)
  sha[name] = git('rev-parse', 'HEAD')
}

/** `live`: welcher Commit je Host läuft (`''` = der Host antwortet nicht). */
function decide(expected: string, live: Record<string, string>, eventName = 'workflow_run') {
  const builds = join(dir, 'builds')
  rmSync(builds, { recursive: true, force: true })
  mkdirSync(builds)
  const hosts = Object.keys(live)
  for (const host of hosts) writeFileSync(join(builds, host), live[host] ?? '')
  const output = join(dir, 'output')
  writeFileSync(output, '')
  const result = spawnSync('bash', ['-c', stepScript(eventName)], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      BUILDS: builds,
      EXPECTED_SHA: expected,
      APP_HOSTS: hosts.map(host => `${host.split('.')[0]}=${host}`).join(' '),
      GITHUB_OUTPUT: output,
    },
  })
  const text = `${result.stdout}${result.stderr}`
  // Rot soll die Ursache zeigen, nicht nur „skip war undefined".
  if (result.status !== 0) throw new Error(`Schritt endete mit ${result.status}:\n${text}`)
  return { skip: /^skip=(true|false)$/m.exec(readFileSync(output, 'utf8'))?.[1], text }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-decision-'))
  repo = join(dir, 'repo')
  mkdirSync(repo)
  mkdirSync(join(dir, 'bin'))
  // Attrappe: `curl -fsS -m 15 https://<host>/api/health` → der Build des Hosts.
  writeFileSync(join(dir, 'bin', 'curl'), [
    '#!/usr/bin/env bash',
    'for last; do :; done',
    'host="${last#https://}"; host="${host%%/*}"',
    'build=$(cat "$BUILDS/$host" 2>/dev/null)',
    '[ -n "$build" ] || exit 22',
    'printf \'{"ok":true,"build":"%s"}\' "$build"',
    '',
  ].join('\n'))
  chmodSync(join(dir, 'bin', 'curl'), 0o755)
  git('init', '-q', '-b', 'main')
  commit('alt', 'apps/a/seite.vue')
  commit('mitte', 'apps/a/zweite.vue')
  commit('neu', 'apps/a/dritte.vue')
  commit('doku', 'docs/notiz.md')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('deploy.yml — „Deploy nötig?"', () => {
  it('liefert einen neueren Commit aus', () => {
    const { skip, text } = decide(sha.neu!, { 'a.test': sha.mitte!, 'b.test': sha.mitte! })
    expect(text).toContain('App-relevante Änderungen')
    expect(skip).toBe('false')
  })

  it('der Vorfall: ein älterer Commit überschreibt den neueren Stand nicht', () => {
    const { skip, text } = decide(sha.mitte!, { 'a.test': sha.neu!, 'b.test': sha.neu! })
    expect(text).toContain('Überholt')
    expect(skip).toBe('true')
  })

  it('auch dann nicht, wenn der neuere Stand nur Doku voraus ist', () => {
    const { skip } = decide(sha.neu!, { 'a.test': sha.doku!, 'b.test': sha.doku! })
    expect(skip).toBe('true')
  })

  it('gemischter Stand: läuft EIN Host schon neuer, wird er nicht zurückgestellt — mit Warnung', () => {
    const { skip, text } = decide(sha.mitte!, { 'a.test': sha.alt!, 'b.test': sha.neu! })
    expect(text).toContain('::warning::')
    expect(text).toContain('b laufen schon neuer')
    expect(skip).toBe('true')
  })

  it('ein zurückgebliebener Host zieht das Ausliefern nach, wenn keiner neuer ist', () => {
    const { skip } = decide(sha.neu!, { 'a.test': sha.alt!, 'b.test': sha.neu! })
    expect(skip).toBe('false')
  })

  it('derselbe Commit noch einmal: nichts zu tun', () => {
    const { skip, text } = decide(sha.neu!, { 'a.test': sha.neu!, 'b.test': sha.neu! })
    expect(text).toContain('Keine Datei-Änderungen')
    expect(skip).toBe('true')
  })

  it('nur Doku geändert: übersprungen', () => {
    const { skip } = decide(sha.doku!, { 'a.test': sha.neu!, 'b.test': sha.neu! })
    expect(skip).toBe('true')
  })

  it('ein Host ohne Antwort: es wird sicherheitshalber ausgeliefert', () => {
    const { skip, text } = decide(sha.neu!, { 'a.test': sha.mitte!, 'b.test': '' })
    expect(text).toContain('deploye sicherheitshalber')
    expect(skip).toBe('false')
  })

  it('der manuelle Start bleibt frei — der Rückweg auf einen älteren Commit', () => {
    const { skip } = decide(sha.alt!, { 'a.test': sha.neu!, 'b.test': sha.neu! }, 'workflow_dispatch')
    expect(skip).toBe('false')
  })
})
