import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * OPS-007 (2026-11-15): `ops/rollback.sh` stellt eine App auf einen Stand
 * zurück, der noch auf dem Server liegt. Ein Rückweg, der falsch zeigt, ist
 * gefährlicher als keiner — deshalb läuft das Skript hier gegen eine ATTRAPPE,
 * bevor es einen Server sieht:
 *
 *   <wurzel>/releases/help/<commit>/server/index.mjs   die Stände
 *   <wurzel>/releases/help/current                     der Verweis
 *   <wurzel>/help.pukalani.app/ops/…                   Ecosystem-Datei + der
 *                                                      ECHTE pm2-heal.sh
 *   bin/pm2, bin/curl                                  Stellvertreter
 *
 * Das Server-Stück läuft über `ROLLBACK_REMOTE="bash -s --"` lokal statt
 * über ssh. Der pm2-Stellvertreter „übernimmt" beim Neuladen den Stand, auf
 * den der Verweis zeigt; der curl-Stellvertreter meldet ihn als
 * `/api/health`. So prüft der Test die ganze Kette: Verweis, Neustart, Probe.
 */
const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'ops', 'rollback.sh')

const OLD = `abc1234${'0'.repeat(33)}`
const TWIN = `abc1234${'f'.repeat(33)}`
const LIVE = `def5678${'1'.repeat(33)}`
const HALF = `9999999${'2'.repeat(33)}`

let dir: string
let root: string
let state: string

function release(sha: string, minutesAgo: number, complete = true) {
  const base = join(root, 'releases', 'help', sha)
  mkdirSync(join(base, 'server'), { recursive: true })
  if (complete) writeFileSync(join(base, 'server', 'index.mjs'), '')
  const when = new Date(Date.now() - minutesAgo * 60_000)
  utimesSync(base, when, when)
}

function stub(name: string, body: string) {
  const file = join(dir, 'bin', name)
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(file, 0o755)
}

/**
 * Was jeder Skript-Lauf des gerade laufenden Tests ergeben hat. Scheitert der
 * Test, gibt `beforeEach` das alles aus (siehe dort) — der Fehlschlag auf
 * `main` vom 2026-11-16 zeigte nur „leere Ausgabe", und daraus ließ sich
 * keine Ursache lesen.
 */
interface ScriptRun {
  args: string[]
  code: number | null
  signal: NodeJS.Signals | null
  spawnError: string
  ms: number
  stdout: string
  stderr: string
}
let runs: ScriptRun[] = []
/** Stand der Attrappe am Ende des Tests — festgehalten, BEVOR `afterEach` sie löscht. */
let stageAtEnd = ''

function describeStage() {
  const pm2Log = existsSync(join(state, 'log')) ? readFileSync(join(state, 'log'), 'utf8').trim() : ''
  const link = join(root, 'releases', 'help', 'current')
  let target = '(fehlt)'
  try { target = readlinkSync(link).split('/').pop() ?? '(leer)' }
  catch { /* Verweis fehlt */ }
  return [
    `── Attrappe am Ende: der Verweis zeigt auf ${target}`,
    `   Aufrufe des pm2-Stellvertreters:\n${pm2Log || '   (keine)'}`,
  ].join('\n')
}

function describeRuns() {
  if (runs.length === 0) return 'ops/rollback.sh wurde in diesem Test nicht gestartet.'
  return runs.map((entry, index) => [
    `── Lauf ${index + 1} von ${runs.length}: ops/rollback.sh ${entry.args.join(' ')}`,
    `   Exit-Code: ${entry.code === null ? 'keiner' : entry.code} · Signal: ${entry.signal ?? 'keines'} · Dauer: ${entry.ms} ms`,
    `   Start des Prozesses: ${entry.spawnError || 'gelungen'}`,
    `   stdout (${entry.stdout.length} Zeichen):`,
    entry.stdout || '   (leer)',
    `   stderr (${entry.stderr.length} Zeichen):`,
    entry.stderr || '   (leer)',
  ].join('\n')).join('\n')
}

function run(...args: string[]) {
  const started = Date.now()
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      ROLLBACK_REMOTE: 'bash -s --',
      ROLLBACK_ROOT: root,
      ROLLBACK_PROBE_SLEEP: '0',
      ROLLBACK_PROBE_TRIES: '4',
      STUB_DIR: state,
      STUB_ROOT: root,
    },
  })
  // Ein Prozess, der gar nicht startet, liefert weder Ausgabe noch Exit-Code
  // (`stdout` ist dann `null`) — das steht hier getrennt, statt als Text
  // „null" in der Ausgabe zu landen.
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  runs.push({
    args,
    code: result.status,
    signal: result.signal,
    spawnError: result.error ? `${result.error.name}: ${result.error.message}` : '',
    ms: Date.now() - started,
    stdout,
    stderr,
  })
  return { code: result.status, out: `${stdout}${stderr}` }
}

const current = () => readlinkSync(join(root, 'releases', 'help', 'current')).split('/').pop()
const pm2Calls = () => (existsSync(join(state, 'log')) ? readFileSync(join(state, 'log'), 'utf8') : '')
  .split('\n').filter(line => line.startsWith('pm2 '))

beforeEach(({ onTestFailed }) => {
  // MG1 (b): scheitert ein Test, stehen Ausgabe UND Exit-Code JEDES
  // Skript-Laufs im Protokoll, dazu der Stand der Attrappe. Ohne Deutung —
  // die Ursache wird gelesen, nicht vermutet.
  runs = []
  stageAtEnd = ''
  // Läuft NACH `afterEach` — die Attrappe ist dann schon gelöscht, ihr Stand
  // kommt deshalb aus `stageAtEnd`.
  onTestFailed(() => {
    console.error(['ops/rollback.sh — Diagnose zum gescheiterten Test', describeRuns(), stageAtEnd].join('\n'))
  })

  dir = mkdtempSync(join(tmpdir(), 'rollback-'))
  root = join(dir, 'server')
  state = join(dir, 'state')
  mkdirSync(join(dir, 'bin'))
  mkdirSync(state)
  mkdirSync(join(root, 'help.pukalani.app', 'ops'), { recursive: true })
  writeFileSync(join(root, 'help.pukalani.app', 'ops', 'ecosystem-help.config.cjs'), 'module.exports = {}\n')
  copyFileSync(join(REPO, 'ops', 'pm2-heal.sh'), join(root, 'help.pukalani.app', 'ops', 'pm2-heal.sh'))

  release(OLD, 30)
  release(TWIN, 20)
  release(HALF, 10, false)
  release(LIVE, 1)
  symlinkSync(join(root, 'releases', 'help', LIVE), join(root, 'releases', 'help', 'current'))
  writeFileSync(join(state, 'live'), LIVE)

  stub('pm2', [
    'echo "pm2 $*" >> "$STUB_DIR/log"',
    'case "$1" in',
    '  jlist) echo "[]" ;;',
    '  describe) exit 1 ;;',
    '  startOrReload)',
    '    if [ -f "$STUB_DIR/pm2-fail" ]; then echo "│ tabelle │"; echo "Error: Script not found"; exit 1; fi',
    '    if [ ! -f "$STUB_DIR/pm2-stale" ]; then basename "$(readlink "$STUB_ROOT/releases/help/current")" > "$STUB_DIR/live"; fi ;;',
    'esac',
  ].join('\n'))
  stub('curl', [
    'ok=true; [ -f "$STUB_DIR/unhealthy" ] && ok=false',
    'printf \'{"ok":%s,"build":"%s"}\' "$ok" "$(cat "$STUB_DIR/live")"',
  ].join('\n'))
})

afterEach(() => {
  stageAtEnd = describeStage()
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/rollback.sh — zeigt zuerst nur', () => {
  it('nennt ohne Angabe die Apps aus ops/apps.conf', () => {
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toContain('help.pukalani.app')
    expect(out).toContain('helppukalaniapp')
    expect(out).toContain('adminpukalaniapp')
  })

  it('zeigt die Stände einer App, neuester zuerst, und ändert nichts', () => {
    const { code, out } = run('help')
    expect(code).toBe(0)
    expect(out.indexOf(LIVE)).toBeLessThan(out.indexOf(TWIN))
    expect(out.indexOf(TWIN)).toBeLessThan(out.indexOf(OLD))
    expect(out).toMatch(new RegExp(`▶ ${LIVE}.*aktiv`))
    expect(out).toMatch(new RegExp(`${HALF}.*UNVOLLSTÄNDIG`))
    expect(out).toContain(`Build ${LIVE}, ok: true`)
    expect(out).toContain('Nichts geändert')
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })

  it('ändert mit einem Stand, aber ohne --apply, nichts', () => {
    const { code, out } = run('help', OLD)
    expect(code).toBe(0)
    expect(out).toContain(`Würde umstellen: help von ${LIVE} auf ${OLD}`)
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })
})

describe('ops/rollback.sh — stellt um', () => {
  it('legt den Verweis um, lädt den richtigen Prozess neu und prüft Build und ok', () => {
    const { code, out } = run('help', OLD, '--apply')
    expect(out).toContain(`läuft durchgängig auf ${OLD} und meldet ok:true`)
    expect(code).toBe(0)
    expect(current()).toBe(OLD)
    const calls = pm2Calls()
    expect(calls.some(c => c.startsWith('pm2 startOrReload') && c.includes('/help.pukalani.app/ops/ecosystem-help.config.cjs --update-env'))).toBe(true)
    expect(calls).toContain('pm2 save')
    // Kein Aufräumen: der Rückweg löscht keinen Stand.
    expect(existsSync(join(root, 'releases', 'help', LIVE, 'server', 'index.mjs'))).toBe(true)
  })

  it('nimmt ein eindeutiges Kürzel an', () => {
    const { code } = run('help', OLD.slice(0, 12), '--apply')
    expect(code).toBe(0)
    expect(current()).toBe(OLD)
  })

  it('geht denselben Weg wieder nach vorn', () => {
    expect(run('help', OLD, '--apply').code).toBe(0)
    const { code } = run('help', LIVE, '--apply')
    expect(code).toBe(0)
    expect(current()).toBe(LIVE)
  })

  it('tut nichts, wenn die App schon gesund auf dem Stand läuft', () => {
    const { code, out } = run('help', LIVE, '--apply')
    expect(code).toBe(0)
    expect(out).toContain('nichts zu tun')
    expect(pm2Calls()).toEqual([])
  })
})

describe('ops/rollback.sh — bricht ab, ohne etwas anzufassen', () => {
  it.each([
    ['einen Stand, der nicht auf dem Server liegt', `1234567${'a'.repeat(33)}`],
    ['ein mehrdeutiges Kürzel', 'abc1234'],
    ['einen unvollständigen Stand', HALF],
    ['etwas, das kein Commit ist', '../current'],
    ['den Namen des Verweises', 'current'],
  ])('bei %s', (_label, wanted) => {
    const { code, out } = run('help', wanted, '--apply')
    expect(code).toBe(3)
    expect(out).toContain('nichts geändert')
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })

  it('bei einer unbekannten App', () => {
    const { code, out } = run('comments', OLD, '--apply')
    expect(code).toBe(2)
    expect(out).toContain('Unbekannte App')
    expect(current()).toBe(LIVE)
  })

  it('bei --apply ohne Stand', () => {
    const { code } = run('help', '--apply')
    expect(code).toBe(2)
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })

  it('wenn die Ecosystem-Datei der Site fehlt', () => {
    rmSync(join(root, 'help.pukalani.app', 'ops', 'ecosystem-help.config.cjs'))
    const { code } = run('help', OLD, '--apply')
    expect(code).toBe(4)
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })
})

describe('ops/rollback.sh — wenn etwas schiefgeht', () => {
  it('legt den Verweis zurück, wenn der Neustart scheitert, und zeigt keine pm2-Tabelle', () => {
    writeFileSync(join(state, 'pm2-fail'), '')
    const { code, out } = run('help', OLD, '--apply')
    expect(code).toBe(5)
    expect(out).toContain('Neustart ist gescheitert')
    expect(out).toContain('Script not found')
    expect(out).not.toContain('│')
    expect(current()).toBe(LIVE)
  })

  it('meldet rot, wenn die Seite den Stand trägt, aber nicht gesund ist', () => {
    writeFileSync(join(state, 'unhealthy'), '')
    const { code, out } = run('help', OLD, '--apply')
    expect(code).toBe(6)
    expect(out).toContain('meldet aber nicht gesund')
    expect(out).toContain(`ops/rollback.sh help ${LIVE} --apply`)
    expect(current()).toBe(OLD)
  })

  it('meldet rot, wenn der Prozess den alten Stand weiter ausliefert', () => {
    writeFileSync(join(state, 'pm2-stale'), '')
    const { code, out } = run('help', OLD, '--apply')
    expect(code).toBe(6)
    expect(out).toContain(`Zuletzt gemeldet: Build ${LIVE}`)
  })
})
