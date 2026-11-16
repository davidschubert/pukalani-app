import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPS-004 (2026-11-16): der Realtime-Wächter (`ops/realtime-watchdog.sh`)
 * startet `appwrite-realtime` höchstens dreimal in Folge neu und meldet danach
 * nur noch — über das Wort `realtime-status` im Tor-Skript.
 *
 * Der Beweis mit echtem docker steht in `ops/realtime-watchdog-attrappe.sh`
 * (von Hand, nach jeder Änderung). Hier läuft das ECHTE Skript gegen zwei
 * Stellvertreter, gesteuert über Dateien in STUB_DIR:
 *
 *   bin/curl     antwortet mit `HTTP/1.1 101`, solange `healthy` existiert,
 *                sonst mit 502
 *   bin/docker   zählt jedes Neu-Erstellen in `docker.log` (samt Ordner);
 *                existiert `restart-heals`, legt es `healthy` an
 *
 * „Neustart hilft, fünf Minuten später wieder tot" ist dann: vor jedem Lauf
 * `healthy` löschen, `restart-heals` stehen lassen.
 */
vi.setConfig({ testTimeout: 30_000 })

const REPO = join(__dirname, '..', '..', '..')
const WATCHDOG = join(REPO, 'ops', 'realtime-watchdog.sh')
const GATE = join(REPO, 'ops', 'appwrite-cert-gate.sh')

/** Dieselbe Form prüft der Produktions-Wächter (production-watch.yml). */
const STATUS_LINE = /^realtime ergebnis=(ok|neustart-geholfen|neustart-erfolglos|aufgegeben) fehlschlaege=[0-9]+ neustarts_24h=[0-9]+ neustarts_7t=[0-9]+ alter_minuten=([0-9]+|nie)$/

let dir: string
let stubDir: string
let compose: string
let stateFile: string

function stub(name: string, body: string) {
  const file = join(dir, 'bin', name)
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(file, 0o755)
}

const env = (extra: Record<string, string> = {}) => ({
  ...process.env,
  PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
  STUB_DIR: stubDir,
  APPWRITE_COMPOSE_DIR: compose,
  REALTIME_URL: 'http://realtime.invalid/v1/realtime?project=console',
  REALTIME_STATE_FILE: stateFile,
  REALTIME_RECHECK_SLEEP: '0',
  ...extra,
})

function watch(extra: Record<string, string> = {}) {
  const result = spawnSync('bash', [WATCHDOG], { encoding: 'utf8', env: env(extra) })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

function gate(word = 'realtime-status') {
  const result = spawnSync('bash', [GATE, word], { encoding: 'utf8', env: env() })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const state = () => Object.fromEntries(readFileSync(stateFile, 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const restarts = () => (existsSync(join(stubDir, 'docker.log')) ? readFileSync(join(stubDir, 'docker.log'), 'utf8').trim().split('\n').filter(Boolean) : [])
const restartFile = () => (existsSync(`${stateFile}.restarts`) ? readFileSync(`${stateFile}.restarts`, 'utf8').trim().split('\n').filter(Boolean) : [])
const healthy = (on: boolean) => (on ? writeFileSync(join(stubDir, 'healthy'), '') : rmSync(join(stubDir, 'healthy'), { force: true }))
const restartHeals = (on: boolean) => (on ? writeFileSync(join(stubDir, 'restart-heals'), '') : rmSync(join(stubDir, 'restart-heals'), { force: true }))
const now = () => Math.floor(Date.now() / 1000)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'realtime-watchdog-'))
  stubDir = join(dir, 'stub')
  compose = join(dir, 'appwrite')
  stateFile = join(dir, 'ops', 'state', 'realtime-watchdog')
  for (const d of ['bin', 'stub', 'appwrite']) mkdirSync(join(dir, d), { recursive: true })

  stub('curl', [
    'if [ -f "$STUB_DIR/healthy" ]; then',
    '  printf "HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\n\\r\\n"',
    // Wie das echte curl: nach dem Upgrade hängt es bis zum Timeout.
    '  exit 28',
    'fi',
    'printf "HTTP/1.1 502 Bad Gateway\\r\\nContent-Length: 0\\r\\n\\r\\n"',
  ].join('\n'))
  stub('docker', [
    'if [ "$*" = "compose up -d --no-deps --force-recreate appwrite-realtime" ]; then',
    '  echo "neu erstellt in $(pwd)" >> "$STUB_DIR/docker.log"',
    '  [ -f "$STUB_DIR/restart-heals" ] && touch "$STUB_DIR/healthy"',
    '  echo " Container appwrite-realtime  Started"',
    '  exit 0',
    'fi',
    'echo "docker-Stellvertreter kennt das nicht: $*" >&2',
    'echo "unerwartet: $*" >> "$STUB_DIR/docker.unexpected"',
    'exit 97',
  ].join('\n'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/realtime-watchdog.sh — Handshake gut', () => {
  it('startet nichts neu, schreibt ok und bleibt still', () => {
    healthy(true)
    const { code, out } = watch()
    expect(code).toBe(0)
    expect(out).toBe('')
    expect(restarts()).toEqual([])
    expect(state()).toMatchObject({ last_result: 'ok', failures: '0' })
    expect(Number(state().last_ok_epoch)).toBeGreaterThanOrEqual(now() - 5)
    expect(Number(state().last_check_epoch)).toBeGreaterThanOrEqual(now() - 5)
  })
})

describe('ops/realtime-watchdog.sh — ein Fehlschlag', () => {
  it('ein Neustart hilft; der nächste gute Lauf setzt den Zähler zurück', () => {
    restartHeals(true)
    const first = watch()
    expect(first.code).toBe(0)
    expect(restarts()).toEqual([`neu erstellt in ${compose}`])
    expect(first.out).toContain('Container appwrite-realtime  Started')
    expect(state()).toMatchObject({ last_result: 'neustart-geholfen', failures: '1' })
    expect(restartFile()).toHaveLength(1)

    const second = watch()
    expect(second.code).toBe(0)
    expect(second.out).toContain('Realtime wieder gesund nach 1 Fehlschlägen')
    expect(restarts()).toHaveLength(1)
    expect(state()).toMatchObject({ last_result: 'ok', failures: '0' })
  })

  it('Compose-Ordner fehlt: kein Neustart, Stand trotzdem geschrieben, Exit 1', () => {
    const { code, out } = watch({ APPWRITE_COMPOSE_DIR: join(dir, 'gibt-es-nicht') })
    expect(code).toBe(1)
    expect(out).toContain('fehlt')
    expect(restarts()).toEqual([])
    expect(state()).toMatchObject({ last_result: 'neustart-erfolglos', failures: '1' })
  })
})

describe('ops/realtime-watchdog.sh — höchstens drei Neustarts in Folge', () => {
  it('Dauerfehler: drei Neustarts, danach nur noch „aufgegeben"', () => {
    const results: string[] = []
    for (let run = 1; run <= 5; run++) {
      const { code } = watch()
      expect(code, `Lauf ${run}`).toBe(1)
      results.push(state().last_result)
      expect(state().failures).toBe(String(run))
      expect(restarts(), `Lauf ${run}`).toHaveLength(Math.min(run, 3))
    }
    expect(results).toEqual(['neustart-erfolglos', 'neustart-erfolglos', 'neustart-erfolglos', 'aufgegeben', 'aufgegeben'])
    expect(restartFile()).toHaveLength(3)
    expect(existsSync(join(stubDir, 'docker.unexpected'))).toBe(false)
  })

  it('wieder gesund setzt zurück, ein neuer Fehlschlag startet wieder neu', () => {
    for (let run = 1; run <= 5; run++) watch()
    expect(restarts()).toHaveLength(3)

    healthy(true)
    const back = watch()
    expect(back.code).toBe(0)
    expect(back.out).toContain('Realtime wieder gesund nach 5 Fehlschlägen')
    expect(state()).toMatchObject({ last_result: 'ok', failures: '0' })

    healthy(false)
    restartHeals(true)
    expect(watch().code).toBe(0)
    expect(restarts()).toHaveLength(4)
    expect(state()).toMatchObject({ last_result: 'neustart-geholfen', failures: '1' })
  })

  it('Neustart hilft, fünf Minuten später wieder tot — beim vierten Mal kein Neustart', () => {
    restartHeals(true)
    const results: string[] = []
    for (let run = 1; run <= 4; run++) {
      healthy(false)
      watch()
      results.push(state().last_result)
    }
    expect(results).toEqual(['neustart-geholfen', 'neustart-geholfen', 'neustart-geholfen', 'aufgegeben'])
    expect(restarts()).toHaveLength(3)
    expect(state().failures).toBe('4')
  })
})

describe('ops/realtime-watchdog.sh — Stand-Datei', () => {
  it('Unsinn in der Stand-Datei gilt als „noch kein Stand"', () => {
    mkdirSync(join(dir, 'ops', 'state'), { recursive: true })
    writeFileSync(stateFile, 'failures=abc; touch /tmp/boese\n\u0000\u0001kaputt\nlast_ok_epoch=$(id)\n')
    const { code } = watch()
    expect(code).toBe(1)
    expect(restarts()).toHaveLength(1)
    expect(state()).toMatchObject({ last_result: 'neustart-erfolglos', failures: '1', last_ok_epoch: '' })
  })

  it('übergroße oder führend-nullige Zahlen brechen nichts', () => {
    mkdirSync(join(dir, 'ops', 'state'), { recursive: true })
    writeFileSync(stateFile, 'failures=99999999999999999999999\n')
    expect(watch().code).toBe(1)
    expect(state().failures).toBe('1')
    writeFileSync(stateFile, 'failures=02\n')
    watch()
    expect(state()).toMatchObject({ last_result: 'neustart-erfolglos', failures: '3' })
    writeFileSync(stateFile, 'failures=08\n')
    watch()
    expect(state()).toMatchObject({ last_result: 'aufgegeben', failures: '9' })
  })

  it('kein Rest einer Temp-Datei, und die Neustart-Liste bleibt bei 500 Zeilen', () => {
    mkdirSync(join(dir, 'ops', 'state'), { recursive: true })
    writeFileSync(`${stateFile}.restarts`, Array.from({ length: 600 }, (_, i) => String(1_000_000 + i)).join('\n') + '\n')
    watch()
    const lines = restartFile()
    expect(lines).toHaveLength(500)
    expect(lines[0]).toBe('1000101')
    expect(Number(lines[499])).toBeGreaterThanOrEqual(now() - 5)
    expect(spawnSync('ls', [join(dir, 'ops', 'state')], { encoding: 'utf8' }).stdout.trim().split('\n').sort())
      .toEqual(['realtime-watchdog', 'realtime-watchdog.restarts'])
  })

  it('kennt keine eigene Melde-Adresse mehr', () => {
    expect(readFileSync(WATCHDOG, 'utf8')).not.toContain('ALERT_WEBHOOK')
  })

  it('liest die Handshake-Antwort ohne Pipe', () => {
    const code = readFileSync(WATCHDOG, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')
    expect(code).not.toMatch(/\|\s*head\b/)
    expect(code).not.toMatch(/\|\s*grep -q/)
    expect(code).not.toMatch(/\b(eval|source)\b|^\s*\.\s/m)
  })
})

describe('ops/appwrite-cert-gate.sh — realtime-status', () => {
  const writeState = (content: string, restartEpochs: number[] = []) => {
    mkdirSync(join(dir, 'ops', 'state'), { recursive: true })
    writeFileSync(stateFile, content)
    writeFileSync(`${stateFile}.restarts`, restartEpochs.map(String).join('\n') + (restartEpochs.length ? '\n' : ''))
  }

  it('gibt für jeden Zustand genau eine Zeile in der festen Form aus', () => {
    for (const result of ['ok', 'neustart-geholfen', 'neustart-erfolglos', 'aufgegeben']) {
      writeState(`last_check_epoch=${now() - 600}\nlast_result=${result}\nfailures=2\nlast_ok_epoch=${now() - 900}\n`, [now() - 60])
      const { code, out } = gate()
      expect(code, result).toBe(0)
      expect(out.endsWith('\n')).toBe(true)
      expect(out.trimEnd().split('\n')).toHaveLength(1)
      expect(out.trimEnd()).toMatch(STATUS_LINE)
      expect(out).toBe(`realtime ergebnis=${result} fehlschlaege=2 neustarts_24h=1 neustarts_7t=1 alter_minuten=10\n`)
    }
  })

  it('zählt Neustarts nur im jeweiligen Fenster und überspringt Unsinn', () => {
    writeState(`last_check_epoch=${now()}\nlast_result=aufgegeben\nfailures=5\n`, [now() - 100, now() - 23 * 3600, now() - 25 * 3600, now() - 3 * 86400, now() - 8 * 86400])
    writeFileSync(`${stateFile}.restarts`, `${readFileSync(`${stateFile}.restarts`, 'utf8')}kaputt\n$(id)\n`)
    const { code, out } = gate()
    expect(code).toBe(0)
    expect(out).toBe('realtime ergebnis=aufgegeben fehlschlaege=5 neustarts_24h=2 neustarts_7t=4 alter_minuten=0\n')
  })

  it('ohne Neustart-Liste und ohne Zeitpunkt: Nullen und „nie"', () => {
    mkdirSync(join(dir, 'ops', 'state'), { recursive: true })
    writeFileSync(stateFile, 'last_result=ok\nfailures=0\n')
    const { code, out } = gate()
    expect(code).toBe(0)
    expect(out.trimEnd()).toMatch(STATUS_LINE)
    expect(out).toBe('realtime ergebnis=ok fehlschlaege=0 neustarts_24h=0 neustarts_7t=0 alter_minuten=nie\n')
  })

  it('ohne Stand: ergebnis=unbekannt, Exit 6', () => {
    const { code, out } = gate()
    expect(code).toBe(6)
    expect(out).toBe('realtime ergebnis=unbekannt\n')
  })

  it('reicht eingeschleusten Text nie durch', () => {
    writeState('last_result=ok; rm -rf /\nfailures=1\nlast_check_epoch=1\n')
    expect(gate()).toEqual({ code: 6, out: 'realtime ergebnis=unbekannt\n' })
    writeState('last_result=ok\nfailures=1; rm -rf /\n')
    expect(gate()).toEqual({ code: 6, out: 'realtime ergebnis=unbekannt\n' })
    writeState('last_result=ok\nfailures=1\nlast_check_epoch=$(id)\n')
    const path = gate()
    expect(path.code).toBe(0)
    expect(path.out).toBe('realtime ergebnis=ok fehlschlaege=1 neustarts_24h=0 neustarts_7t=0 alter_minuten=nie\n')
  })

  it('ruft kein docker auf', () => {
    writeState(`last_check_epoch=${now()}\nlast_result=ok\nfailures=0\n`)
    gate()
    expect(existsSync(join(stubDir, 'docker.unexpected'))).toBe(false)
    expect(restarts()).toEqual([])
  })

  it('unbekanntes Wort: Exit 64, die fünf erlaubten werden genannt', () => {
    const { code, out } = gate('realtime-status; id')
    expect(code).toBe(64)
    expect(out).toContain('probe, renew, reset-account, backup-status, realtime-status')
  })

  it('liest den Stand, den der Wächter schreibt', () => {
    for (let run = 1; run <= 5; run++) watch()
    const { code, out } = gate()
    expect(code).toBe(0)
    expect(out).toBe('realtime ergebnis=aufgegeben fehlschlaege=5 neustarts_24h=3 neustarts_7t=3 alter_minuten=0\n')
  })
})
