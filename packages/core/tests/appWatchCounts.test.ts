import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * OPS-011 (2026-11-16): `ops/app-watch-counts.mjs` zählt auf dem App-Server
 * die pm2-Logs und gibt NUR Zahlen zurück — das Protokoll des Aufrufers
 * (GitHub Actions) ist öffentlich. Hier läuft das ECHTE Skript gegen eine
 * Attrappe:
 *
 *   bin/pm2                 Stellvertreter (Bash, läuft unter Linux und macOS):
 *                           gibt die Prozessliste aus einer Datei aus
 *   logs/<name>-error-4.log die zwei Dateien, in die der Prozess „gerade
 *   logs/<name>-out-4.log   schreibt" (laut Prozessliste)
 *   logs/<name>-error-9.log eine ALTE Datei früherer pm2-Nummer, die NICHT
 *                           gezählt werden darf (auf dem Server liegen solche
 *                           seit Juli daneben)
 */
const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'ops', 'app-watch-counts.mjs')
const PROC = 'adminpukalaniapp'

/** Dieselben Formen prüft die Auswertung, bevor eine Zeile ins Protokoll kommt. */
const LINE_FORMS = [
  /^zaehler version=\d+ prozess=[a-z0-9]{3,40} stunden=\d{1,3} status=(online|stopping|stopped|launching|errored|unbekannt|fehlt)$/,
  /^prozess speicher_mb=\d+ neustarts=\d+ laeuft_min=\d+$/,
  /^fehler server=\d+ browser=\d+ browser_gedeckelt=\d+$/,
  /^ki ausfaelle=\d+ ohne_guthaben=\d+ kein_endpunkt=\d+ abgeschaltet=\d+$/,
  /^protokoll ausfaelle=\d+$/,
  /^skriptregel berichte=\d+ gedeckelt=\d+$/,
  /^mailbremse ausgeloest=\d+ letzte_min=(\d+|nie)$/,
  /^erinnerungen takte=\d+ ohne_antwort=\d+ termine=\d+ empfaenger=\d+ gefragt=\d+$/,
  /^reichweite aelteste_zeile_min=(\d+|nie)$/,
  /^stillefehler zeilen=\d+ stellen=\d+$/,
  /^lauf name=[a-z][a-z0-9-]{1,39} takt_min=\d+ ok=\d+ gescheitert=\d+ uebersprungen=\d+ haengt=\d+ letzter_ok_min=(\d+|nie) letzter_lauf_min=(\d+|nie) letztes_ergebnis=(ok|failed|skipped|nie) angemeldet_min=(\d+|nie)$/,
  /^ende laeufe=\d+$/,
]

let dir: string
let logs: string

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function event(minutes: number, level: string, name: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ time: minutesAgo(minutes), level, event: name, ...data })
}

function writeLog(kind: 'error' | 'out', id: number, lines: string[]) {
  writeFileSync(join(logs, `${PROC}-${kind}-${id}.log`), `${lines.join('\n')}\n`)
}

function processList(extra: Record<string, unknown> = {}) {
  return [
    {
      name: 'anderer',
      monit: { memory: 1 },
      pm2_env: { status: 'online', restart_time: 1, pm_uptime: Date.now(), pm_err_log_path: '/nirgends', pm_out_log_path: '/nirgends' },
    },
    {
      name: PROC,
      monit: { memory: 153 * 1048576 },
      pm2_env: {
        status: 'online',
        restart_time: 103,
        pm_uptime: Date.now() - 51 * 60_000,
        pm_err_log_path: join(logs, `${PROC}-error-4.log`),
        pm_out_log_path: join(logs, `${PROC}-out-4.log`),
        ...extra,
      },
    },
  ]
}

function pm2Answers(body: string) {
  writeFileSync(join(dir, 'jlist.txt'), body)
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, STUB_DIR: dir },
  })
  return { code: result.status, lines: result.stdout.split('\n').filter(Boolean), out: result.stdout, err: result.stderr }
}

function lineOf(lines: string[], start: string): string {
  const hit = lines.find(line => line.startsWith(start))
  if (!hit) throw new Error(`keine Zeile mit „${start}" in:\n${lines.join('\n')}`)
  return hit
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-watch-counts-'))
  logs = join(dir, 'logs')
  mkdirSync(logs)
  mkdirSync(join(dir, 'bin'))
  // Der Stellvertreter kennt nur `jlist`; alles andere wäre ein Schreibversuch.
  writeFileSync(join(dir, 'bin', 'pm2'), '#!/usr/bin/env bash\nif [ "$1" = "jlist" ]; then cat "$STUB_DIR/jlist.txt"; exit 0; fi\necho "pm2 $*" >> "$STUB_DIR/pm2-andere-aufrufe"\nexit 1\n')
  chmodSync(join(dir, 'bin', 'pm2'), 0o755)
  writeLog('error', 4, [])
  writeLog('out', 4, [])
  pm2Answers(JSON.stringify(processList()))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/app-watch-counts.mjs', () => {
  it('zählt im Fenster, lässt Älteres und Fremdes liegen, und jede Zeile hat die feste Form', () => {
    writeLog('error', 4, [
      event(10, 'error', 'server.error', { path: '/api/x', status: 500, message: 'GEHEIM-MARKER in der Meldung', stack: 'at /home/ploi/geheim' }),
      event(20, 'error', 'server.error', { path: '/api/y', status: 502 }),
      event(26 * 60, 'error', 'server.error', { status: 500 }),
      event(5, 'error', 'client.error', { message: 'GEHEIM-MARKER', url: 'https://kunde.example/pfad', userId: 'nutzer-123' }),
      event(6, 'warn', 'telemetry.client_error_capped', { max: 120 }),
      event(7, 'error', 'ai.failed', { label: 'brand', kind: 'http', status: 402, model: 'm', run: 'r1' }),
      event(8, 'error', 'ai.failed', { label: 'brand', kind: 'http', status: 404, model: 'm', run: 'r2' }),
      event(9, 'error', 'ai.failed', { label: 'brand', kind: 'call', model: 'm', run: 'r3' }),
      event(11, 'warn', 'ai.disabled', { label: 'brand' }),
      event(13, 'error', 'audit.write_failed', { action: 'user.exported', targetType: 'user', strict: true, status: 401, type: 'general_unauthorized_scope' }),
      event(14, 'error', 'audit.write_failed', { action: 'user.login', targetType: '', strict: false, status: null, type: null }),
      event(27 * 60, 'error', 'audit.write_failed', { action: 'user.login', targetType: '', strict: false }),
      event(15, 'warn', 'csp.report', { directive: 'script-src-elem', blocked: 'https://fremd.example', source: '', area: '/dashboard' }),
      event(16, 'warn', 'csp.report', { directive: 'script-src', blocked: 'eval', source: '', area: '/' }),
      event(17, 'warn', 'csp.report_capped', { max: 40 }),
      event(28 * 60, 'warn', 'csp.report', { directive: 'script-src', blocked: 'eval', source: '', area: '/' }),
      event(12, 'error', 'job.run', { job: 'trial-sweep', result: 'failed', ms: 4, everyMin: 60, error: 'Error', message: 'GEHEIM-MARKER' }),
      '[control] freie Zeile ohne Zeit — GEHEIM-MARKER',
      '    at irgendwo (/home/ploi/geheim.js:1:1)',
      '{"time":"kaputt',
    ])
    writeLog('out', 4, [
      event(200, 'info', 'job.registered', { job: 'trial-sweep', everyMin: 60 }),
      // Ein späterer Neustart meldet denselben Lauf noch einmal an — es zählt die früheste Anmeldung.
      event(40, 'info', 'job.registered', { job: 'trial-sweep', everyMin: 60 }),
      event(190, 'info', 'job.run', { job: 'trial-sweep', result: 'ok', ms: 3, everyMin: 60 }),
      event(130, 'info', 'job.run', { job: 'trial-sweep', result: 'ok', ms: 3, everyMin: 60 }),
      event(200, 'info', 'job.registered', { job: 'health-sweep', everyMin: 5 }),
      event(3, 'info', 'job.run', { job: 'health-sweep', result: 'ok', ms: 9, everyMin: 5 }),
      event(4, 'info', 'job.run', { job: 'nur-uebersprungen', result: 'skipped', ms: 0, everyMin: 1440 }),
      event(30 * 60, 'info', 'job.run', { job: 'tages-lauf', result: 'ok', ms: 1, everyMin: 1440 }),
      // Keine Kennung ⇒ wird nie ausgegeben.
      event(2, 'info', 'job.run', { job: 'Nicht Erlaubt; rm -rf', result: 'ok', ms: 1, everyMin: 5 }),
      event(2, 'info', 'job.run', { job: 'unbekanntes-ergebnis', result: 'vielleicht', ms: 1, everyMin: 5 }),
    ])
    // Alte Datei einer früheren pm2-Nummer: steht nicht in der Prozessliste.
    writeLog('error', 9, [event(1, 'error', 'server.error', { status: 500 }), event(1, 'error', 'server.error', { status: 500 })])

    const { code, lines, out } = run(PROC)
    expect(code).toBe(0)
    for (const line of lines) expect(LINE_FORMS.some(form => form.test(line)), line).toBe(true)
    expect(out).not.toContain('GEHEIM')
    expect(out).not.toContain('/home/')
    expect(out).not.toContain('example')
    expect(out).not.toContain('nutzer-123')
    expect(out).not.toContain('rm -rf')

    expect(lines[0]).toBe(`zaehler version=1 prozess=${PROC} stunden=25 status=online`)
    expect(lineOf(lines, 'prozess ')).toBe('prozess speicher_mb=153 neustarts=103 laeuft_min=51')
    expect(lineOf(lines, 'fehler ')).toBe('fehler server=2 browser=1 browser_gedeckelt=1')
    expect(lineOf(lines, 'ki ')).toBe('ki ausfaelle=3 ohne_guthaben=1 kein_endpunkt=1 abgeschaltet=1')
    // Betreiber-Protokoll (BE-021): nur die Zahl im Fenster, nie Aktion oder Kennung.
    expect(lineOf(lines, 'protokoll ')).toBe('protokoll ausfaelle=2')
    expect(out).not.toContain('user.exported')
    // Berichte der Skript-Regel (SE1 a): nur die Zahl, nie Quelle oder Seite.
    expect(lineOf(lines, 'skriptregel ')).toBe('skriptregel berichte=2 gedeckelt=1')
    expect(out).not.toContain('fremd')
    expect(lineOf(lines, 'lauf name=trial-sweep ')).toBe('lauf name=trial-sweep takt_min=60 ok=2 gescheitert=1 uebersprungen=0 haengt=0 letzter_ok_min=130 letzter_lauf_min=12 letztes_ergebnis=failed angemeldet_min=200')
    expect(lineOf(lines, 'lauf name=health-sweep ')).toBe('lauf name=health-sweep takt_min=5 ok=1 gescheitert=0 uebersprungen=0 haengt=0 letzter_ok_min=3 letzter_lauf_min=3 letztes_ergebnis=ok angemeldet_min=200')
    // „Übersprungen" hält einen Lauf am Leben.
    expect(lineOf(lines, 'lauf name=nur-uebersprungen ')).toContain('uebersprungen=1 haengt=0 letzter_ok_min=4 letzter_lauf_min=4 letztes_ergebnis=skipped angemeldet_min=nie')
    // Außerhalb des Fensters: nicht gezählt, aber „letzter guter Lauf" bleibt lesbar.
    expect(lineOf(lines, 'lauf name=tages-lauf ')).toContain('ok=0 gescheitert=0 uebersprungen=0 haengt=0 letzter_ok_min=1800')
    expect(lineOf(lines, 'lauf name=unbekanntes-ergebnis ')).toContain('letztes_ergebnis=nie')
    expect(lines.at(-1)).toBe('ende laeufe=5')
  })

  it('ein hängender Lauf (der vorige Takt läuft noch) zählt eigens und gilt nicht als am Leben', () => {
    writeLog('out', 4, [
      event(400, 'info', 'job.run', { job: 'health-sweep', result: 'ok', ms: 9, everyMin: 5 }),
      event(15, 'info', 'job.run', { job: 'health-sweep', result: 'skipped', ms: 0, everyMin: 5, reason: 'overlap' }),
      event(10, 'info', 'job.run', { job: 'health-sweep', result: 'skipped', ms: 0, everyMin: 5, reason: 'overlap' }),
      event(5, 'info', 'job.run', { job: 'health-sweep', result: 'skipped', ms: 0, everyMin: 5, reason: 'overlap' }),
    ])
    expect(lineOf(run(PROC).lines, 'lauf name=health-sweep ')).toBe('lauf name=health-sweep takt_min=5 ok=1 gescheitert=0 uebersprungen=0 haengt=3 letzter_ok_min=400 letzter_lauf_min=5 letztes_ergebnis=skipped angemeldet_min=nie')
  })

  it('das Fenster ist einstellbar', () => {
    writeLog('error', 4, [event(90, 'error', 'server.error', { status: 500 }), event(30, 'error', 'server.error', { status: 500 })])
    expect(lineOf(run(PROC, '1').lines, 'fehler ')).toBe('fehler server=1 browser=0 browser_gedeckelt=0')
    expect(lineOf(run(PROC, '2').lines, 'fehler ')).toBe('fehler server=2 browser=0 browser_gedeckelt=0')
  })

  it('liest die Prozessliste auch, wenn pm2 Hinweise davor schreibt', () => {
    pm2Answers(`[PM2] Spawning PM2 daemon with pm2_home=/x\n>>>> In-memory PM2 is out-of-date\n${JSON.stringify(processList())}`)
    const { code, lines } = run(PROC)
    expect(code).toBe(0)
    expect(lines[0]).toContain('status=online')
  })

  it('Notbremse der Mail-Routen: zählt nur die Dateien des laufenden Prozesses und nur das Fenster (WA1 e)', () => {
    writeLog('error', 4, [
      event(90, 'warn', 'auth.mail_route_breaker', { route: '/api/auth/signup' }),
      event(30, 'warn', 'auth.mail_route_breaker', { route: '/api/auth/recovery', x: 'GEHEIM-MARKER' }),
      // außerhalb des Fensters von 25 h
      event(26 * 60, 'warn', 'auth.mail_route_breaker', { route: '/api/auth/signup' }),
    ])
    // Die Datei einer FRÜHEREN Prozess-Nummer, mit einer Zeile mitten im
    // Fenster: ein `grep` über `*-error*.log` zählte sie mit.
    writeLog('error', 9, [event(15, 'warn', 'auth.mail_route_breaker', { route: '/api/auth/signup' })])
    // Ein fremder Prozess im selben Ordner.
    writeFileSync(join(logs, 'anderer-error-4.log'), `${event(5, 'warn', 'auth.mail_route_breaker', { route: '/api/auth/signup' })}\n`)
    const { code, lines, out } = run(PROC)
    expect(code).toBe(0)
    expect(lineOf(lines, 'mailbremse ')).toBe('mailbremse ausgeloest=2 letzte_min=30')
    expect(out).not.toContain('GEHEIM-MARKER')
    for (const line of lines) expect(LINE_FORMS.some(form => form.test(line)), line).toBe(true)
  })

  it('leere und fehlende Log-Dateien sind kein Fehler', () => {
    pm2Answers(JSON.stringify(processList({ pm_err_log_path: join(logs, 'gibt-es-nicht.log') })))
    const { code, lines } = run(PROC)
    expect(code).toBe(0)
    expect(lines).toEqual([
      `zaehler version=1 prozess=${PROC} stunden=25 status=online`,
      'prozess speicher_mb=153 neustarts=103 laeuft_min=51',
      'fehler server=0 browser=0 browser_gedeckelt=0',
      'ki ausfaelle=0 ohne_guthaben=0 kein_endpunkt=0 abgeschaltet=0',
      'protokoll ausfaelle=0',
      'skriptregel berichte=0 gedeckelt=0',
      'mailbremse ausgeloest=0 letzte_min=nie',
      'erinnerungen takte=0 ohne_antwort=0 termine=0 empfaenger=0 gefragt=0',
      'reichweite aelteste_zeile_min=nie',
      'stillefehler zeilen=0 stellen=0',
      'ende laeufe=0',
    ])
  })

  it('Erinnerungen an nicht erreichbare Communities: Summen im Fenster, nur Ziffern (SE1 d)', () => {
    const line = (minutes: number, fields: Record<string, unknown>) => event(minutes, 'info', 'events.reminder_unreachable', fields)
    writeLog('out', 4, [
      line(10, { mode: 'count', asked: true, answered: true, dueEvents: 5, communities: 1, events: 2, recipients: 7 }),
      line(70, { mode: 'count', asked: true, answered: false, dueEvents: 3, communities: 0, events: 0, recipients: 0 }),
      line(130, { mode: 'count', asked: false, answered: false, dueEvents: 0, communities: 0, events: 0, recipients: 0 }),
      line(190, { mode: 'skip', asked: true, answered: true, dueEvents: 4, communities: 2, events: 3, recipients: 0 }),
      // außerhalb des Fensters von 25 h
      line(26 * 60, { mode: 'count', asked: true, answered: false, dueEvents: 9, communities: 9, events: 9, recipients: 9 }),
    ])
    writeLog('error', 4, [
      // Vergiftet: nichts davon darf als etwas anderes als 0 durchkommen —
      // und nur `asked: true` + `answered: false` (Wahrheitswerte) ist „ohne Antwort".
      line(20, { mode: 'GEHEIM-MARKER', asked: 'true', answered: 0, events: -4, recipients: 2.5 }),
      line(21, { asked: true, answered: 'false', events: '12', recipients: 'GEHEIM-MARKER t-kunde-a' }),
      line(22, { asked: true, answered: false, events: 1e12, recipients: Number.MAX_SAFE_INTEGER, title: 'GEHEIM-MARKER' }),
      line(23, { events: null, recipients: { n: 1 } }),
    ])
    // Die Datei einer FRÜHEREN Prozess-Nummer zählt nicht mit.
    writeLog('error', 9, [line(15, { asked: true, answered: false, events: 50, recipients: 50 })])

    const { code, lines, out } = run(PROC)
    expect(code).toBe(0)
    // 4 + 4 Zeilen im Fenster; ohne Antwort: 70 min und 22 min; gefragt
    // (nur der Wahrheitswert `asked: true`): 10, 70, 190, 21 und 22 min.
    expect(lineOf(lines, 'erinnerungen ')).toBe('erinnerungen takte=8 ohne_antwort=2 termine=5 empfaenger=7 gefragt=5')
    expect(out).not.toContain('GEHEIM-MARKER')
    expect(out).not.toContain('t-kunde')
    expect(out).not.toContain('skip')
    for (const entry of lines) expect(LINE_FORMS.some(form => form.test(entry)), entry).toBe(true)
  })

  describe('umgelaufene Log-Dateien (SE1 c)', () => {
    const rotated = (suffix: string) => join(logs, `${PROC}-error-4.log${suffix}`)

    it('liest die Geschwister der laufenden Datei: .1, .2.gz, Datum und die Form von pm2-logrotate', () => {
      // Laufende Datei: nur das Jüngste. Der Rest des Fensters liegt daneben.
      writeLog('error', 4, [event(10, 'error', 'server.error', { status: 500 })])
      writeFileSync(rotated('.1'), `${[
        event(6 * 60, 'error', 'server.error', { status: 500 }),
        event(7 * 60, 'warn', 'csp.report', { directive: 'script-src', blocked: 'eval', source: '', area: '/' }),
      ].join('\n')}\n`)
      writeFileSync(rotated('.2.gz'), gzipSync(`${[
        event(20 * 60, 'error', 'server.error', { status: 502 }),
        // Älter als das Fenster — zählt nicht als Fehler, wohl aber für „letzter guter Lauf".
        event(40 * 60, 'info', 'job.registered', { job: 'trial-sweep', everyMin: 1440 }),
        event(39 * 60, 'info', 'job.run', { job: 'trial-sweep', result: 'ok', ms: 3, everyMin: 1440 }),
      ].join('\n')}\n`))
      writeFileSync(rotated('-20261116'), `${event(22 * 60, 'error', 'client.error', { message: 'x' })}\n`)
      writeFileSync(join(logs, `${PROC}-error-4__2026-11-16_00-00-00.log`), `${event(23 * 60, 'error', 'audit.write_failed', { action: 'x' })}\n`)

      const { code, lines } = run(PROC)
      expect(code).toBe(0)
      expect(lineOf(lines, 'fehler ')).toBe('fehler server=3 browser=1 browser_gedeckelt=0')
      expect(lineOf(lines, 'protokoll ')).toBe('protokoll ausfaelle=1')
      expect(lineOf(lines, 'skriptregel ')).toBe('skriptregel berichte=1 gedeckelt=0')
      // Ohne die umgelaufene Datei hieße das „nie" — und der tägliche Blick meldete den Lauf als fehlend.
      expect(lineOf(lines, 'lauf name=trial-sweep ')).toBe(`lauf name=trial-sweep takt_min=1440 ok=0 gescheitert=0 uebersprungen=0 haengt=0 letzter_ok_min=${39 * 60} letzter_lauf_min=${39 * 60} letztes_ergebnis=ok angemeldet_min=${40 * 60}`)
      for (const line of lines) expect(LINE_FORMS.some(form => form.test(line)), line).toBe(true)
    })

    it('GEGENPROBE: Dateien früherer pm2-Nummern, fremder Prozesse und älter als acht Tage bleiben liegen', () => {
      const line = `${event(5, 'error', 'server.error', { status: 500 })}\n`
      writeFileSync(join(logs, `${PROC}-error-3.log`), line)
      writeFileSync(join(logs, `${PROC}-error-3.log.1`), line)
      writeFileSync(join(logs, `anderer-error-4.log.1`), line)
      writeFileSync(join(logs, `${PROC}-error-4.log.bak`), line)
      writeFileSync(rotated('.9'), line)
      const old = new Date(Date.now() - 9 * 24 * 3600_000)
      utimesSync(rotated('.9'), old, old)
      expect(lineOf(run(PROC).lines, 'fehler ')).toBe('fehler server=0 browser=0 browser_gedeckelt=0')
    })

    it('zählt still abgefangene Fehler (Q13): Zeilen samt `repeated`, verschiedene Stellen — und gibt nur zwei Zahlen aus', () => {
      writeLog('out', 4, [
        event(10, 'warn', 'soft_fail', { where: 'posts:utils/topicLinks:listCategories', status: 500, type: 'general_unknown' }),
        event(9, 'warn', 'soft_fail', { where: 'posts:utils/topicLinks:listCategories', status: 500, repeated: 40 }),
        event(8, 'warn', 'soft_fail', { where: 'control:api/control/invites/[id].patch:getRow#2', status: 503 }),
        // Vergiftet: die Stelle zählt als Zeile, aber nicht als Kennung; `repeated` in falscher Form zählt 0.
        event(7, 'warn', 'soft_fail', { where: 'mail@example.org mit leerzeichen', status: 500, repeated: 'viele' }),
        // Älter als das Fenster.
        event(40 * 60, 'warn', 'soft_fail', { where: 'core:utils/x:get', status: 500 }),
      ])
      writeLog('error', 4, [])
      const { lines } = run(PROC)
      expect(lineOf(lines, 'stillefehler ')).toBe('stillefehler zeilen=44 stellen=2')
      expect(lines.join('\n')).not.toContain('topicLinks')
      expect(lines.join('\n')).not.toContain('example.org')
    })

    it('nennt, wie weit die gelesenen Zeilen zurückreichen — über die laufende Datei und ihre Geschwister', () => {
      writeLog('error', 4, [event(10, 'error', 'server.error', { status: 500 })])
      writeLog('out', 4, [event(90, 'info', 'job.run', { job: 'trial-sweep', result: 'ok', ms: 3, everyMin: 60 })])
      // Älter als das Fenster von 25 Stunden: zählt nicht als Fehler, wohl aber für die Reichweite.
      writeFileSync(rotated('.1'), `${event(40 * 60, 'error', 'server.error', { status: 500 })}\n`)
      const { lines } = run(PROC)
      expect(lineOf(lines, 'fehler ')).toBe('fehler server=1 browser=0 browser_gedeckelt=0')
      expect(lineOf(lines, 'reichweite ')).toBe(`reichweite aelteste_zeile_min=${40 * 60}`)
    })

    it('der Fall vom 2026-11-19: neue pm2-Nummer ⇒ neue Dateien, die Zählung beginnt neu — und die Reichweite sagt es', () => {
      // Bis zum Neustart des pm2-Dienstes schrieb der Prozess unter Nummer 3.
      writeFileSync(join(logs, `${PROC}-error-3.log`), `${[
        event(20 * 60, 'error', 'server.error', { status: 500 }),
        event(19 * 60, 'error', 'job.run', { job: 'gdpr-export-prune', result: 'failed', ms: 3, everyMin: 1440 }),
      ].join('\n')}\n`)
      writeFileSync(join(logs, `${PROC}-out-3.log`), `${[
        event(30 * 60, 'info', 'job.registered', { job: 'audit-log-retention', everyMin: 1440 }),
        event(29 * 60, 'info', 'job.run', { job: 'audit-log-retention', result: 'ok', ms: 3, everyMin: 1440 }),
      ].join('\n')}\n`)
      // Seit sieben Minuten unter Nummer 4: angemeldet, die erste Verzögerung (14 Minuten) läuft noch.
      writeLog('out', 4, [event(7, 'info', 'job.registered', { job: 'audit-log-retention', everyMin: 1440 })])
      writeLog('error', 4, [])
      const { code, lines } = run(PROC)
      expect(code).toBe(0)
      expect(lineOf(lines, 'fehler ')).toBe('fehler server=0 browser=0 browser_gedeckelt=0')
      expect(lineOf(lines, 'lauf name=audit-log-retention ')).toBe('lauf name=audit-log-retention takt_min=1440 ok=0 gescheitert=0 uebersprungen=0 haengt=0 letzter_ok_min=nie letzter_lauf_min=nie letztes_ergebnis=nie angemeldet_min=7')
      expect(lines.some(line => line.startsWith('lauf name=gdpr-export-prune '))).toBe(false)
      expect(lineOf(lines, 'reichweite ')).toBe('reichweite aelteste_zeile_min=7')
    })

    it('eine beschädigte gepackte Datei beendet nur ihr eigenes Lesen', () => {
      writeLog('error', 4, [event(10, 'error', 'server.error', { status: 500 })])
      writeFileSync(rotated('.2.gz'), 'das ist kein gzip')
      writeFileSync(rotated('.1'), `${event(60, 'error', 'server.error', { status: 500 })}\n`)
      const { code, lines } = run(PROC)
      expect(code).toBe(0)
      expect(lineOf(lines, 'fehler ')).toBe('fehler server=2 browser=0 browser_gedeckelt=0')
      expect(lines.at(-1)).toBe('ende laeufe=0')
    })
  })

  it('ein unbekannter Zustand aus pm2 wird nicht durchgereicht', () => {
    pm2Answers(JSON.stringify(processList({ status: 'online; curl boese' })))
    expect(run(PROC).lines[0]).toBe(`zaehler version=1 prozess=${PROC} stunden=25 status=unbekannt`)
  })

  it('Prozess fehlt ⇒ eine Zeile, Exit 5; pm2 antwortet nicht ⇒ „unbekannt", Exit 5', () => {
    const missing = run('gibtesnicht')
    expect(missing.code).toBe(5)
    expect(missing.lines).toEqual(['zaehler version=1 prozess=gibtesnicht stunden=25 status=fehlt'])

    pm2Answers('kein json')
    const broken = run(PROC)
    expect(broken.code).toBe(5)
    expect(broken.lines).toEqual([`zaehler version=1 prozess=${PROC} stunden=25 status=unbekannt`])
  })

  it('lehnt alles ab, was kein Prozessname und keine Stundenzahl ist', () => {
    for (const args of [[], ['../../etc/passwd'], ['admin;ls'], ['ADMIN'], [PROC, '0'], [PROC, '169'], [PROC, '1.5'], [PROC, 'x']]) {
      const { code, out } = run(...args)
      expect(code, args.join(' ')).toBe(64)
      expect(out).toMatch(/^Abgelehnt: /)
      expect(out).not.toContain('passwd')
    }
  })

  it('liest nur: ruft von pm2 nichts außer der Prozessliste und schreibt nirgends', () => {
    writeLog('out', 4, [event(3, 'info', 'job.run', { job: 'health-sweep', result: 'ok', ms: 9, everyMin: 5 })])
    const before = readFileSync(join(logs, `${PROC}-out-4.log`), 'utf8')
    expect(run(PROC).code).toBe(0)
    expect(readFileSync(join(logs, `${PROC}-out-4.log`), 'utf8')).toBe(before)
    expect(() => readFileSync(join(dir, 'pm2-andere-aufrufe'))).toThrow()
    const source = readFileSync(SCRIPT, 'utf8')
    expect(source).not.toMatch(/writeFile|appendFile|unlink|rmSync|\bexec\(|spawn\(/)
    expect(source.match(/execFileSync\(/g)).toHaveLength(1)
  })

  it('deckelt die Zahl der Läufe, damit eine vergiftete Datei klein bleibt', () => {
    writeLog('out', 4, Array.from({ length: 80 }, (_, i) => event(2, 'info', 'job.run', { job: `lauf-${i}`, result: 'ok', ms: 1, everyMin: 5 })))
    const { lines } = run(PROC)
    expect(lines.filter(line => line.startsWith('lauf ')).length).toBe(60)
    expect(lines.at(-1)).toBe('ende laeufe=60')
  })
})
