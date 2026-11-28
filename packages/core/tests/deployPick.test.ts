import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Der Schritt „Neuesten grünen Commit wählen" aus `.github/workflows/deploy.yml`,
 * AUSGEFÜHRT (CW1 c, 2026-11-28).
 *
 * Warum: die concurrency-Gruppe des Deploys hält einen laufenden und EINEN
 * wartenden Lauf, ein neuer verdrängt den wartenden. Endet die Prüfung eines
 * ÄLTEREN Commits zuletzt, verdrängt dessen Lauf den wartenden des NEUEREN —
 * und der neuere bliebe liegen. Der Schritt wählt deshalb den neuesten
 * main-Commit mit vier grünen Prüfungen, der Nachfahre des Auslösers ist.
 *
 * Wie `deployDecision.test.ts`: der `run:`-Block wird aus der echten Datei
 * geschnitten und in einem Wegwerf-Repo ausgeführt. `gh` ist eine Attrappe:
 * die Liste der Prüfläufe kommt aus einer Datei und läuft durch den ECHTEN
 * `jq`-Ausdruck des Schritts; der Vergleich zweier Commits fragt das echte
 * `git` im Wegwerf-Repo.
 */
const REPO = join(__dirname, '..', '..', '..')
const STEP = '      - name: Neuesten grünen Commit wählen'
const INDENT = '          '
const SLUG = 'owner/repo'

function stepScript(): string {
  const lines = readFileSync(join(REPO, '.github', 'workflows', 'deploy.yml'), 'utf8').split('\n')
  const start = lines.indexOf(STEP)
  if (start < 0) throw new Error('Schritt „Neuesten grünen Commit wählen" nicht gefunden — der Test liest ihn aus deploy.yml.')
  const run = lines.findIndex((line, index) => index > start && line === '        run: |')
  const body: string[] = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && !line.startsWith(INDENT)) break
    body.push(line.slice(INDENT.length))
  }
  const script = body.join('\n')
  if (script.includes('${{')) throw new Error('Der Schritt nutzt im run-Block einen Ausdruck — Werte gehören in env.')
  return script
}

let dir: string
let repo: string
const sha: Record<string, string> = {}

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

function commit(name: string): void {
  writeFileSync(join(repo, `${name}.txt`), `${name}\n`)
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', name)
  sha[name] = git('rev-parse', 'HEAD')
}

const CHECKS = ['Test', 'Lint', 'Typecheck', 'E2E (Appwrite)']
interface Run {
  head_sha: string
  name: string
  conclusion: string | null
  created_at: string
  event: string
  head_branch: string
  head_repository: { full_name: string }
}

/** Vier Prüfläufe eines main-Pushes; `override` ändert einzelne Workflows. */
function pushRuns(commitSha: string, minute: number, override: Record<string, string | null> = {}): Run[] {
  return CHECKS.map(name => ({
    head_sha: commitSha,
    name,
    conclusion: name in override ? override[name]! : 'success',
    created_at: `2026-11-28T10:${String(minute).padStart(2, '0')}:00Z`,
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: SLUG },
  }))
}

interface Pick { sha?: string, opsRef?: string, text: string }

function pick(env: Record<string, string>, runs: Run[] | 'fehler'): Pick {
  const runsFile = join(dir, 'runs.json')
  writeFileSync(runsFile, runs === 'fehler' ? '' : JSON.stringify({ workflow_runs: runs }))
  const output = join(dir, 'output')
  writeFileSync(output, '')
  const result = spawnSync('bash', ['-c', stepScript()], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      RUNS: runsFile,
      GH_FAIL: runs === 'fehler' ? '1' : '',
      GITREPO: repo,
      REPO: SLUG,
      EVENT: 'workflow_run',
      TRIGGER_SHA: '',
      INPUT_SHA: '',
      BRANCH_SHA: '',
      GITHUB_OUTPUT: output,
      ...env,
    },
  })
  const text = `${result.stdout}${result.stderr}`
  if (result.status !== 0) throw new Error(`Schritt endete mit ${result.status}:\n${text}`)
  const out = readFileSync(output, 'utf8')
  return { sha: /^sha=(.*)$/m.exec(out)?.[1], opsRef: /^ops_ref=(.*)$/m.exec(out)?.[1], text }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-pick-'))
  repo = join(dir, 'repo')
  mkdirSync(repo)
  mkdirSync(join(dir, 'bin'))
  // Attrappe: `gh api <pfad> --jq <ausdruck>`.
  writeFileSync(join(dir, 'bin', 'gh'), [
    '#!/usr/bin/env bash',
    '[ -z "$GH_FAIL" ] || { echo "gh: HTTP 502" >&2; exit 1; }',
    'path="$2"; expr="$4"',
    'case "$path" in',
    '  */actions/runs\\?*) jq -r "$expr" "$RUNS" ;;',
    '  */compare/*)',
    '    range="${path##*/compare/}"; base="${range%%...*}"; head="${range##*...}"',
    '    if [ "$base" = "$head" ]; then status=identical',
    '    elif git -C "$GITREPO" merge-base --is-ancestor "$base" "$head"; then status=ahead',
    '    elif git -C "$GITREPO" merge-base --is-ancestor "$head" "$base"; then status=behind',
    '    else status=diverged; fi',
    '    printf \'{"status":"%s"}\' "$status" | jq -r "$expr" ;;',
    '  *) echo "unbekannter Pfad $path" >&2; exit 1 ;;',
    'esac',
    '',
  ].join('\n'))
  chmodSync(join(dir, 'bin', 'gh'), 0o755)
  git('init', '-q', '-b', 'main')
  commit('a')
  commit('b')
  commit('c')
  // Ein Seitenzweig, der nie auf main lag.
  git('checkout', '-q', '-b', 'seite', sha.a!)
  commit('seite')
  git('checkout', '-q', 'main')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('deploy.yml — „Neuesten grünen Commit wählen"', () => {
  it('kein neuerer grüner Commit: der Auslöser wird ausgeliefert', () => {
    const result = pick({ TRIGGER_SHA: sha.c! }, [...pushRuns(sha.a!, 1), ...pushRuns(sha.b!, 2), ...pushRuns(sha.c!, 3)])
    expect(result.sha).toBe(sha.c)
    expect(result.opsRef).toBe(sha.c)
    expect(result.text).toContain('Ausgeliefert wird der Auslöser')
  })

  it('der Vorfall: der Lauf eines älteren Commits liefert den neueren, schon grünen aus', () => {
    const result = pick({ TRIGGER_SHA: sha.a! }, [...pushRuns(sha.a!, 1), ...pushRuns(sha.b!, 2), ...pushRuns(sha.c!, 3)])
    expect(result.sha).toBe(sha.c)
    expect(result.opsRef).toBe(sha.c)
    expect(result.text).toContain('Gebündelt')
  })

  it('der neueste läuft noch: der nächstältere grüne wird ausgeliefert', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.b!, 2), ...pushRuns(sha.c!, 3, { 'E2E (Appwrite)': null })]
    expect(pick({ TRIGGER_SHA: sha.a! }, runs).sha).toBe(sha.b)
  })

  it('der neueste ist rot: er wird nie ausgeliefert', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.c!, 3, { Lint: 'failure' })]
    expect(pick({ TRIGGER_SHA: sha.a! }, runs).sha).toBe(sha.a)
  })

  it('es zählt je Workflow der letzte Lauf: rot, dann per Re-run grün', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.c!, 3, { Test: 'failure' }), ...pushRuns(sha.c!, 9).filter(run => run.name === 'Test')]
    expect(pick({ TRIGGER_SHA: sha.a! }, runs).sha).toBe(sha.c)
  })

  it('es zählt je Workflow der letzte Lauf: grün, dann per Re-run rot', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.c!, 3), ...pushRuns(sha.c!, 9, { Test: 'failure' }).filter(run => run.name === 'Test')]
    expect(pick({ TRIGGER_SHA: sha.a! }, runs).sha).toBe(sha.a)
  })

  it('fehlt eine der vier Prüfungen, ist der Commit nicht grün', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.c!, 3).filter(run => run.name !== 'Typecheck')]
    expect(pick({ TRIGGER_SHA: sha.a! }, runs).sha).toBe(sha.a)
  })

  it('ein grüner Commit, der kein Nachfahre des Auslösers ist, wird nie gewählt', () => {
    const runs = [...pushRuns(sha.b!, 1), ...pushRuns(sha.seite!, 5)]
    expect(pick({ TRIGGER_SHA: sha.b! }, runs).sha).toBe(sha.b)
  })

  it('ein älterer grüner Commit wird nie gewählt', () => {
    const runs = [...pushRuns(sha.a!, 1), ...pushRuns(sha.c!, 3, { Test: 'failure' })]
    expect(pick({ TRIGGER_SHA: sha.b! }, runs).sha).toBe(sha.b)
  })

  it('Läufe fremder Repos und von Pull Requests zählen nicht', () => {
    const fremd = pushRuns(sha.c!, 3).map(run => ({ ...run, head_repository: { full_name: 'fremd/repo' } }))
    const pr = pushRuns(sha.c!, 4).map(run => ({ ...run, event: 'pull_request' }))
    const zweig = pushRuns(sha.c!, 5).map(run => ({ ...run, head_branch: 'arbeit' }))
    expect(pick({ TRIGGER_SHA: sha.a! }, [...pushRuns(sha.a!, 1), ...fremd, ...pr, ...zweig]).sha).toBe(sha.a)
  })

  it('ist die Liste nicht lesbar, bleibt es beim Auslöser', () => {
    const result = pick({ TRIGGER_SHA: sha.a! }, 'fehler')
    expect(result.sha).toBe(sha.a)
    expect(result.opsRef).toBe(sha.a)
  })

  it('manueller Start mit Eingabe: genau dieser Commit, ops/ von der Spitze des Zweigs', () => {
    const result = pick({ EVENT: 'workflow_dispatch', INPUT_SHA: sha.a!, BRANCH_SHA: sha.c! }, [...pushRuns(sha.c!, 3)])
    expect(result.sha).toBe(sha.a)
    expect(result.opsRef).toBe(sha.c)
  })

  it('manueller Start ohne Eingabe: die Spitze des Zweigs', () => {
    const result = pick({ EVENT: 'workflow_dispatch', BRANCH_SHA: sha.c! }, [])
    expect(result.sha).toBe(sha.c)
    expect(result.opsRef).toBe(sha.c)
  })
})
