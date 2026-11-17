import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COUNTS_VERSION, LINE_FORMS, NOWHERE, RULES, drillCounts, evaluateApp, parseCounts, parseExpectedJobs, summaryLine } from '../../../scripts/ops/app-signals-rules.mjs'
import { readApps } from '../../../scripts/ops/verify-app-signals.mjs'

/**
 * OPS-011 (2026-11-16): der Blick „In die App hinein". Geprüft werden die
 * REGELN (pur) und der Weg vom gespeicherten Zähl-Ergebnis bis zum roten
 * Lauf — und dass Auswertung, Zähl-Skript, Liste der Zeit-Läufe und der Code
 * zueinander passen. Der ssh-Aufruf selbst läuft nur in der CI.
 *
 * Der Maßstab ist ein Alarm, dem man glaubt: zu jeder roten Regel steht hier
 * die Gegenprobe, die NICHT rot werden darf.
 */
const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'scripts', 'ops', 'verify-app-signals.mjs')

interface JobLine { name: string, every?: number, ok?: number, failed?: number, skipped?: number, overlap?: number, lastOk?: number | 'nie', lastRun?: number | 'nie', result?: string, registered?: number | 'nie' }

function countsText(options: { status?: string, up?: number, server?: number, browser?: number, capped?: number, ai?: number, noCredit?: number, noEndpoint?: number, disabled?: number, audit?: number | null, csp?: number | null, cspCapped?: number, jobs?: JobLine[], version?: number } = {}): string {
  const jobs = options.jobs ?? []
  return [
    `zaehler version=${options.version ?? COUNTS_VERSION} prozess=testprozess stunden=25 status=${options.status ?? 'online'}`,
    `prozess speicher_mb=150 neustarts=3 laeuft_min=${options.up ?? 600}`,
    `fehler server=${options.server ?? 0} browser=${options.browser ?? 0} browser_gedeckelt=${options.capped ?? 0}`,
    `ki ausfaelle=${options.ai ?? 0} ohne_guthaben=${options.noCredit ?? 0} kein_endpunkt=${options.noEndpoint ?? 0} abgeschaltet=${options.disabled ?? 0}`,
    // `audit: null` = Ausgabe eines Servers mit dem Skript von VOR BE-021 (ohne die Zeile).
    ...(options.audit === null ? [] : [`protokoll ausfaelle=${options.audit ?? 0}`]),
    // `csp: null` = Ausgabe eines Servers mit dem Skript von VOR SE1 a (ohne die Zeile).
    ...(options.csp === null ? [] : [`skriptregel berichte=${options.csp ?? 0} gedeckelt=${options.cspCapped ?? 0}`]),
    ...jobs.map(job => `lauf name=${job.name} takt_min=${job.every ?? 60} ok=${job.ok ?? 24} gescheitert=${job.failed ?? 0} uebersprungen=${job.skipped ?? 0} haengt=${job.overlap ?? 0} letzter_ok_min=${job.lastOk ?? 10} letzter_lauf_min=${job.lastRun ?? 10} letztes_ergebnis=${job.result ?? 'ok'} angemeldet_min=${job.registered ?? 600}`),
    `ende laeufe=${jobs.length}`,
  ].join('\n')
}

function evaluate(text: string, expected: string[] = [], app = 'control') {
  return evaluateApp({ app, site: 'test.example', counts: parseCounts(text), expected: new Set(expected) })
}

describe('parseCounts — nur die feste Form kommt durch', () => {
  it('liest eine vollständige Antwort', () => {
    const counts = parseCounts(countsText({ server: 3, jobs: [{ name: 'trial-sweep' }] }))
    expect(counts.problem).toBeUndefined()
    expect(counts.server).toBe(3)
    expect(counts.jobs.get('trial-sweep')?.everyMin).toBe(60)
  })

  it.each([
    ['fremde Zeile dazwischen', `${countsText()}\nirgendeine Log-Zeile mit Inhalt`.replace('ende laeufe=0\nirgendeine', 'irgendeine').concat('\nende laeufe=0')],
    ['kein Kopf', 'fehler server=1 browser=0 browser_gedeckelt=0'],
    ['leer', ''],
    ['Kennung mit Sonderzeichen', countsText({ jobs: [{ name: 'trial;rm' }] })],
  ])('%s ⇒ unlesbar, keine Zahlen', (_name, text) => {
    expect(parseCounts(text).problem).toBe('unlesbar')
  })

  it('ohne Schlusszeile oder mit falscher Zahl darin ⇒ abgeschnitten', () => {
    expect(parseCounts(countsText().replace(/\nende laeufe=0$/, '')).problem).toBe('abgeschnitten')
    expect(parseCounts(countsText({ jobs: [{ name: 'trial-sweep' }] }).replace('ende laeufe=1', 'ende laeufe=2')).problem).toBe('abgeschnitten')
  })

  it('andere Version, fehlender Prozess, pm2 stumm ⇒ je ein eigener Grund', () => {
    expect(parseCounts(countsText({ version: COUNTS_VERSION + 1 })).problem).toBe('version')
    expect(parseCounts('zaehler version=1 prozess=testprozess stunden=25 status=fehlt').problem).toBe('prozess-fehlt')
    expect(parseCounts('zaehler version=1 prozess=testprozess stunden=25 status=unbekannt').problem).toBe('pm2-antwortet-nicht')
  })
})

describe('Regeln — Zeit-Läufe', () => {
  it('gesund ⇒ nichts Rotes, nichts zu berichten', () => {
    const result = evaluate(countsText({ jobs: [{ name: 'trial-sweep' }, { name: 'health-sweep', every: 5, lastOk: 3 }] }), ['trial-sweep', 'health-sweep'])
    expect(result).toEqual({ red: [], notes: [] })
  })

  it('überfällig: kein guter Lauf seit mehr als zwei Takten plus 30 Minuten ⇒ rot; genau an der Grenze nicht', () => {
    const limit = 2 * 60 + 30
    expect(evaluate(countsText({ jobs: [{ name: 'trial-sweep', lastOk: limit }] }), ['trial-sweep']).red).toEqual([])
    const red = evaluate(countsText({ jobs: [{ name: 'trial-sweep', lastOk: limit + 1, result: 'failed', failed: 3 }] }), ['trial-sweep']).red
    expect(red).toHaveLength(1)
    expect(red[0]).toContain('„trial-sweep"')
    expect(red[0]).toContain(`seit ${limit + 1} Minuten keinen guten Lauf`)
    expect(red[0]).toContain('Tun:')
    expect(red[0]).toContain('PRODUKTIONS-ALARM.md')
  })

  it('EIN gescheiterter Takt eines stündlichen Laufs ist kein Alarm (der nächste kommt)', () => {
    const result = evaluate(countsText({ jobs: [{ name: 'trial-sweep', failed: 1, lastOk: 70, lastRun: 10, result: 'failed' }] }), ['trial-sweep'])
    expect(result.red).toEqual([])
    expect(result.notes[0]).toContain('1× gescheitert in 25 h, zuletzt gescheitert, noch in der Frist')
    // Der nächste Takt war wieder gut ⇒ der Hinweis sagt es.
    const healed = evaluate(countsText({ jobs: [{ name: 'trial-sweep', failed: 1, lastOk: 10, lastRun: 10, result: 'ok' }] }), ['trial-sweep'])
    expect(healed.notes[0]).toContain('zuletzt wieder gut')
  })

  it('ein Tages-Lauf ist schon rot, wenn sein letzter Lauf gescheitert ist', () => {
    const red = evaluate(countsText({ jobs: [{ name: 'insights-radar', every: 1440, failed: 1, lastOk: 1500, lastRun: 60, result: 'failed' }] }), ['insights-radar']).red
    expect(red).toHaveLength(1)
    expect(red[0]).toContain('zuletzt gescheitert')
    // Gegenprobe: zuletzt gut ⇒ nicht rot, auch wenn es im Fenster einen Fehlschlag gab.
    expect(evaluate(countsText({ jobs: [{ name: 'insights-radar', every: 1440, failed: 1, lastOk: 60, lastRun: 60, result: 'ok' }] }), ['insights-radar']).red).toEqual([])
  })

  it('noch nie ein guter Lauf: die Frist beginnt mit der Anmeldung', () => {
    const fresh = countsText({ jobs: [{ name: 'gdpr-export-prune', ok: 0, lastOk: 'nie', lastRun: 'nie', result: 'nie', registered: 4 }] })
    expect(evaluate(fresh, ['gdpr-export-prune']).red).toEqual([])
    const stale = countsText({ jobs: [{ name: 'gdpr-export-prune', ok: 0, lastOk: 'nie', lastRun: 'nie', result: 'nie', registered: 151 }] })
    expect(evaluate(stale, ['gdpr-export-prune']).red[0]).toContain('noch nie einen guten Lauf')
  })

  it('ein hängender Lauf wird überfällig und der Satz sagt es', () => {
    const red = evaluate(countsText({ jobs: [{ name: 'health-sweep', every: 5, ok: 0, overlap: 9, lastOk: 45, lastRun: 2, result: 'skipped' }] }), ['health-sweep']).red
    expect(red[0]).toContain('Der Lauf hängt (9 Takte')
  })

  it('erwarteter Lauf fehlt ganz ⇒ rot — aber nicht in den ersten Minuten nach einem Start', () => {
    expect(evaluate(countsText({ up: RULES.missingAfterUpMin }), ['trial-sweep']).red[0]).toContain('hat sich nie gemeldet')
    const early = evaluate(countsText({ up: RULES.missingAfterUpMin - 1 }), ['trial-sweep'])
    expect(early.red).toEqual([])
    expect(early.notes[0]).toContain('noch nicht gemeldet')
  })

  it('ein Lauf, der läuft, aber nicht in der Liste steht, wird berichtet, nicht rot', () => {
    const result = evaluate(countsText({ jobs: [{ name: 'neuer-lauf' }] }), [])
    expect(result.red).toEqual([])
    expect(result.notes[0]).toContain('ops/timed-jobs.conf')
  })
})

describe('Regeln — Fehler und KI', () => {
  it('Server-Fehler sind nur dort scharf, wo es eine gemessene Schwelle gibt', () => {
    const limit = RULES.serverErrors.platform
    expect(limit).toBe(25)
    expect(evaluate(countsText({ server: limit - 1 }), [], 'platform').red).toEqual([])
    expect(evaluate(countsText({ server: limit }), [], 'platform').red[0]).toContain(`${limit} Server-Fehler (5xx)`)
    // Die fünf anderen Apps zählen nur — auch bei sehr vielen Zeilen.
    for (const app of ['control', 'branding', 'portfolio', 'marketing', 'help']) {
      expect(RULES.serverErrors[app as keyof typeof RULES.serverErrors], app).toBeNull()
      const result = evaluate(countsText({ server: 5000 }), [], app)
      expect(result.red, app).toEqual([])
      expect(result.notes[0]).toContain('zählt nur')
    }
  })

  it('Fehler aus dem Browser zählen nur', () => {
    const result = evaluate(countsText({ browser: 900, capped: 3 }), [], 'platform')
    expect(result.red).toEqual([])
    expect(result.notes[0]).toContain('der Deckel hat 3× gegriffen')
  })

  it('KI: 402 und 404 sind ab dem ersten Vorkommen rot, alles andere zählt nur', () => {
    expect(evaluate(countsText({ ai: 1, noCredit: 1 })).red[0]).toContain('Status 402')
    expect(evaluate(countsText({ ai: 1, noEndpoint: 1 })).red[0]).toContain('Status 404')
    const other = evaluate(countsText({ ai: 40, disabled: 2 }))
    expect(other.red).toEqual([])
    expect(other.notes.join(' ')).toContain('40 weitere KI-Ausfälle')
    expect(other.notes.join(' ')).toContain('Abschalter')
  })

  it('Prozess läuft nicht ⇒ rot; keine Zahlen ⇒ genau ein Befund', () => {
    expect(evaluate(countsText({ status: 'errored' })).red[0]).toContain('der Prozess läuft nicht')
    const none = evaluateApp({ app: 'control', site: 'test.example', counts: { problem: 'nicht-erreichbar' } })
    expect(none.red).toHaveLength(1)
    expect(none.red[0]).toContain('keine Zahlen')
  })

  it('jeder rote Satz nennt einen Handgriff und den Abschnitt im Runbook', () => {
    const all = [
      ...evaluate(countsText({ status: 'stopped', server: 99, ai: 2, noCredit: 1, noEndpoint: 1, jobs: [{ name: 'a-lauf', lastOk: 999 }, { name: 'b-lauf', every: 1440, result: 'failed' }] }), ['a-lauf', 'b-lauf', 'c-lauf'], 'platform').red,
      ...evaluateApp({ app: 'control', site: 'test.example', counts: { problem: 'version' } }).red,
    ]
    expect(all.length).toBeGreaterThanOrEqual(7)
    for (const line of all) {
      expect(line, line).toContain('Tun:')
      expect(line, line).toMatch(/\(docs\/runbooks\/PRODUKTIONS-ALARM\.md, „[^"]+"\)$/)
    }
  })

  it('die Abschnitte, auf die die Sätze zeigen, gibt es im Runbook', () => {
    const runbook = readFileSync(join(REPO, 'docs', 'runbooks', 'PRODUKTIONS-ALARM.md'), 'utf8')
    const rules = readFileSync(join(REPO, 'scripts', 'ops', 'app-signals-rules.mjs'), 'utf8')
    const realtime = readFileSync(join(REPO, 'scripts', 'ops', 'verify-realtime.mjs'), 'utf8')
    const sections = new Set([...`${rules}\n${realtime}`.matchAll(/\$\{RUNBOOK\}, „([^"]+)"/g)].map(hit => hit[1]!))
    expect(sections.size).toBeGreaterThanOrEqual(5)
    for (const section of sections) expect(runbook, section).toContain(`**${section}.**`)
  })
})

describe('Regeln — Betreiber-Protokoll (BE-021)', () => {
  it('ab 3 gescheiterten Einträgen rot, mit Handgriff und Runbook-Abschnitt', () => {
    expect(RULES.auditWriteFailures).toBe(3)
    const red = evaluate(countsText({ audit: 3 })).red
    expect(red).toHaveLength(1)
    expect(red[0]).toContain('3 Einträge ins Betreiber-Protokoll gescheitert')
    expect(red[0]).toContain('Tun:')
    expect(red[0]).toContain('„Betreiber-Protokoll fällt aus"')
  })

  it('darunter nur berichtet, bei 0 still', () => {
    const two = evaluate(countsText({ audit: 2 }))
    expect(two.red).toEqual([])
    expect(two.notes.join(' ')).toContain('2 Eintrag/Einträge ins Betreiber-Protokoll')
    expect(evaluate(countsText({ audit: 0 }))).toEqual({ red: [], notes: [] })
  })

  it('ALTE Ausgabe ohne die Zeile (Server noch nicht ausgeliefert) ⇒ kein Problem, nicht rot, „nicht gezählt"', () => {
    const counts = parseCounts(countsText({ audit: null }))
    expect(counts.problem).toBeUndefined()
    expect(counts.version).toBe(1)
    expect(counts.auditFailed).toBeUndefined()
    const result = evaluate(countsText({ audit: null }))
    expect(result.red).toEqual([])
    expect(result.notes).toEqual(['test.example: Betreiber-Protokoll nicht gezählt (das Zähl-Skript auf dem Server ist älter; nach dem nächsten Ausliefern kommt die Zahl)'])
  })

  it('eine kaputte protokoll-Zeile ist weiterhin „unlesbar"', () => {
    expect(parseCounts(countsText().replace('protokoll ausfaelle=0', 'protokoll ausfaelle=viele')).problem).toBe('unlesbar')
  })
})

describe('Berichte der Skript-Regel (SE1 a) — zählt nur', () => {
  it('Berichte machen nie rot und stehen als Hinweis mit der Zahl da', () => {
    const result = evaluate(countsText({ csp: 7, cspCapped: 1 }))
    expect(result.red).toEqual([])
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toContain('7 Bericht(e) der Skript-Regel in 25 h, der Deckel hat 1× gegriffen')
    expect(summaryLine({ site: 'test.example', counts: parseCounts(countsText({ csp: 7 })) })).toContain('Skript-Regel 7')
  })

  it('ohne Berichte kein Hinweis', () => {
    expect(evaluate(countsText()).notes).toEqual([])
  })

  it('ALTE Ausgabe ohne die Zeile ⇒ kein Problem, nicht rot, in der Übersicht „nicht gezählt"', () => {
    const counts = parseCounts(countsText({ csp: null }))
    expect(counts.problem).toBeUndefined()
    expect(counts.cspReports).toBeUndefined()
    expect(evaluate(countsText({ csp: null }))).toEqual({ red: [], notes: [] })
    expect(summaryLine({ site: 'test.example', counts })).toContain('Skript-Regel nicht gezählt')
  })

  it('eine kaputte Zeile ist „unlesbar"', () => {
    expect(parseCounts(countsText().replace('berichte=0', 'berichte=-1')).problem).toBe('unlesbar')
  })
})

describe('Probealarm', () => {
  it('macht eine gesunde Antwort rot, ohne die echten Zahlen zu verlieren', () => {
    const counts = parseCounts(countsText({ jobs: [{ name: 'trial-sweep' }] }))
    const drilled = drillCounts(counts, new Set(['trial-sweep']))
    expect(evaluateApp({ app: 'control', site: 'test.example', counts: drilled, expected: new Set(['trial-sweep']) }).red).toHaveLength(1)
    expect(counts.jobs.get('trial-sweep')?.lastOkMin).toBe(10)
  })

  it('eine App ohne Zeit-Läufe wird über die KI-Regel rot', () => {
    const drilled = drillCounts(parseCounts(countsText()), new Set())
    expect(evaluateApp({ app: 'help', site: 'test.example', counts: drilled }).red[0]).toContain('Status 402')
  })
})

describe('Listen und Skripte passen zusammen', () => {
  const apps = readApps(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))
  const conf = parseExpectedJobs(readFileSync(join(REPO, 'ops', 'timed-jobs.conf'), 'utf8'))

  it('ops/timed-jobs.conf ist lesbar und nennt nur ausgerollte Apps', () => {
    expect(conf.problems).toEqual([])
    const known = new Set([...apps.map(entry => entry.app), NOWHERE])
    for (const app of conf.expected.keys()) expect(known.has(app), app).toBe(true)
  })

  it('ein Lauf steht entweder bei einer App oder unter „nirgends", nie beides', () => {
    const nowhere = conf.expected.get(NOWHERE) ?? new Set<string>()
    for (const [app, jobs] of conf.expected) {
      if (app === NOWHERE) continue
      for (const name of jobs) expect(nowhere.has(name), `${name} (${app})`).toBe(false)
    }
  })

  it('jede Kennung der Liste ist ein Zeit-Lauf im Code, und jeder Zeit-Lauf im Code steht in der Liste', () => {
    const inCode = new Set<string>()
    const roots = [join(REPO, 'packages'), join(REPO, 'apps')]
    for (const root of roots) {
      for (const pkg of readdirSync(root, { withFileTypes: true })) {
        if (!pkg.isDirectory()) continue
        const plugins = join(root, pkg.name, 'server', 'plugins')
        if (!existsSync(plugins)) continue
        for (const file of readdirSync(plugins).filter(name => name.endsWith('.ts'))) {
          const source = readFileSync(join(plugins, file), 'utf8')
          for (const hit of source.matchAll(/defineTimedJob\(\{\s*name: '([a-z][a-z0-9-]{1,39})'/g)) inCode.add(hit[1]!)
        }
      }
    }
    const inConf = new Set([...conf.expected.values()].flatMap(set => [...set]))
    expect(inCode.size).toBeGreaterThanOrEqual(18)
    expect([...inConf].filter(name => !inCode.has(name)), 'in der Liste, aber kein Zeit-Lauf im Code').toEqual([])
    expect([...inCode].filter(name => !inConf.has(name)), 'Zeit-Lauf im Code, aber in keiner App der Liste erwartet').toEqual([])
  })

  it('Auswertung und Zähl-Skript sprechen dieselbe Version und dieselben Zeilen', () => {
    const script = readFileSync(join(REPO, 'ops', 'app-watch-counts.mjs'), 'utf8')
    expect(script).toContain(`const VERSION = ${COUNTS_VERSION}\n`)
    // Jede Zeilenart, die das Skript ausgibt, hat hier eine Form.
    for (const start of ['zaehler version=', 'prozess speicher_mb=', 'fehler server=', 'ki ausfaelle=', 'protokoll ausfaelle=', 'skriptregel berichte=', 'lauf name=', 'ende laeufe=']) {
      expect(script, start).toContain(`console.log(\`${start}`)
    }
    expect(Object.keys(LINE_FORMS)).toHaveLength(8)
  })
})

describe('verify-app-signals.mjs — vom gespeicherten Zähl-Ergebnis bis zum Exit-Code', () => {
  const apps = readApps(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))
  const conf = parseExpectedJobs(readFileSync(join(REPO, 'ops', 'timed-jobs.conf'), 'utf8'))
  let dir: string

  function healthy(app: string): string {
    return countsText({ jobs: [...(conf.expected.get(app) ?? [])].sort().map(name => ({ name })) })
  }

  function run(env: Record<string, string> = {}) {
    const result = spawnSync(process.execPath, [SCRIPT, '--from-dir', dir, '--strict'], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '', ...env } })
    return { code: result.status, out: result.stdout }
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-signals-'))
    for (const entry of apps) writeFileSync(join(dir, `${entry.app}.txt`), healthy(entry.app))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('alles gesund ⇒ Exit 0', () => {
    const { code, out } = run()
    expect(code).toBe(0)
    expect(out).toContain('✔ Nichts Rotes.')
  })

  it('ein überfälliger Lauf in EINER App ⇒ Exit 1, der Satz steht in der Befund-Datei', () => {
    const app = [...conf.expected.keys()].filter(name => name !== NOWHERE)[0]!
    const job = [...conf.expected.get(app)!].sort()[0]!
    writeFileSync(join(dir, `${app}.txt`), healthy(app).replace(new RegExp(`(lauf name=${job} .*letzter_ok_min=)10 `), '$1999 '))
    const findings = join(dir, 'befunde.txt')
    const { code, out } = run({ PUKALANI_FINDINGS_FILE: findings })
    expect(code).toBe(1)
    expect(out).toContain(`„${job}"`)
    const lines = readFileSync(findings, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('seit 999 Minuten keinen guten Lauf')
  })

  it('eine App antwortet gar nicht ⇒ Exit 1 mit „keine Zahlen"', () => {
    rmSync(join(dir, `${apps[0]!.app}.txt`))
    const { code, out } = run()
    expect(code).toBe(1)
    expect(out).toContain('keine Zahlen')
  })

  it('Probealarm ⇒ Exit 1 und als Probealarm gekennzeichnet, obwohl alles gesund ist', () => {
    const { code, out } = run({ PUKALANI_SIGNALS_DRILL: '1' })
    expect(code).toBe(1)
    expect(out).toContain('PROBEALARM — ')
  })

  it('in CI wird der Befund zur roten Anmerkung am Lauf', () => {
    rmSync(join(dir, `${apps[0]!.app}.txt`))
    expect(run({ GITHUB_ACTIONS: 'true' }).out).toContain('::error::')
  })
})
