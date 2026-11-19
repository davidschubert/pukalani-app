import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeIssue,
  composeUpdate,
  findingLines,
  planAlarm,
  REMINDER_SECONDS,
  runAlarm,
  SOURCES,
  sourceText,
  stamp,
} from '../../../scripts/ops/alarm-issue.mjs'

/**
 * Der Alarmweg des Produktions-Wächters (OPEN-ITEMS „KM1" e, 2026-11-19).
 *
 * Anlass: Issue 401 ging um 21:39 UTC aus dem täglichen Teil auf und wurde um
 * 22:10 UTC vom Halbstunden-Lauf mit „alle Wächter wieder grün" geschlossen —
 * der den täglichen Teil gar nicht prüft. Die Zusagen hier, je mit Gegenprobe:
 *  1. ein Lauf ändert nur, was er GEMESSEN hat (`skipped` ist keine Aussage);
 *  2. geschlossen wird erst, wenn keine Quelle mehr offen ist;
 *  3. ein Issue nur aus dem Halbstunden-Teil schließt der Halbstunden-Lauf
 *     wie vorher;
 *  4. der Heartbeat hängt am Lauf, nicht am Issue.
 */
const REPO = join(__dirname, '..', '..', '..')
const NOW = Date.parse('2026-11-19T10:00:00Z')
const HALF_HOUR = { tls: 'success', server: 'skipped', kundendomains: 'success' }
const ALL_GREEN = { tls: 'success', server: 'success', kundendomains: 'success' }

function issue(labels: string[], minutesAgo = 20) {
  return {
    number: 401,
    labels: ['produktions-alarm', ...labels],
    updatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  }
}

describe('planAlarm — die Entscheidung', () => {
  it('nichts rot, nichts offen: nichts zu tun, Heartbeat', () => {
    const plan = planAlarm({ results: HALF_HOUR, open: null, now: NOW })
    expect(plan).toMatchObject({ action: 'none', wechsel: 'keiner', gruen: true })
  })

  it('täglicher Teil rot, nichts offen: Issue mit alarm:server', () => {
    const plan = planAlarm({ results: { ...ALL_GREEN, server: 'failure' }, open: null, now: NOW })
    expect(plan).toMatchObject({ action: 'open', wechsel: 'alarm', gruen: false, addLabels: ['alarm:server'] })
  })

  it('DER ANLASS: Tages-Issue offen, Halbstunden-Lauf (server skipped) lässt es offen und entwarnt nicht', () => {
    const plan = planAlarm({ results: HALF_HOUR, open: issue(['alarm:server']), now: NOW })
    expect(plan.action).toBe('waiting')
    expect(plan.wechsel).toBe('keiner')
    expect(plan.rest).toEqual(['server'])
    expect(plan.ungeprueft).toEqual(['server'])
    expect(plan.addLabels).toEqual([])
    expect(plan.removeLabels).toEqual([])
    // Der Lauf selbst hat nichts Rotes gesehen: der Heartbeat geht raus.
    expect(plan.gruen).toBe(true)
  })

  it('Gegenprobe: derselbe Stand, aber `server` gelaufen und grün ⇒ Entwarnung', () => {
    const plan = planAlarm({ results: ALL_GREEN, open: issue(['alarm:server']), now: NOW })
    expect(plan).toMatchObject({ action: 'close', wechsel: 'entwarnung', removeLabels: ['alarm:server'] })
  })

  it('nur der Halbstunden-Teil offen: der Halbstunden-Lauf schließt wie vorher', () => {
    for (const labels of [['alarm:tls'], ['alarm:kundendomains'], ['alarm:tls', 'alarm:kundendomains']]) {
      const plan = planAlarm({ results: HALF_HOUR, open: issue(labels), now: NOW })
      expect(plan.action).toBe('close')
      expect(plan.wechsel).toBe('entwarnung')
      expect(plan.removeLabels).toEqual(labels)
    }
  })

  it('gemischt: Halbstunden-Teil wird grün, der tägliche bleibt ungeprüft ⇒ Label weg, Issue offen, keine Entwarnung', () => {
    const plan = planAlarm({ results: HALF_HOUR, open: issue(['alarm:tls', 'alarm:server']), now: NOW })
    expect(plan).toMatchObject({ action: 'update', wechsel: 'keiner', removeLabels: ['alarm:tls'], addLabels: [] })
    expect(plan.rest).toEqual(['server'])
    expect(plan.erholt).toEqual(['tls'])
  })

  it('gemischt, andere Richtung: der tägliche Teil wird grün, tls bleibt rot ⇒ offen; danach schließt der Halbstunden-Lauf', () => {
    const daily = planAlarm({
      results: { tls: 'failure', server: 'success', kundendomains: 'success' },
      open: issue(['alarm:tls', 'alarm:server']),
      now: NOW,
    })
    expect(daily).toMatchObject({ action: 'update', wechsel: 'keiner', removeLabels: ['alarm:server'], gruen: false })
    expect(daily.rest).toEqual(['tls'])

    const later = planAlarm({ results: HALF_HOUR, open: issue(['alarm:tls']), now: NOW })
    expect(later.action).toBe('close')
  })

  it('eine neue Quelle wird rot, während ein Issue offen ist: Label dazu, kein zweites Issue', () => {
    const plan = planAlarm({
      results: { tls: 'success', server: 'failure', kundendomains: 'success' },
      open: issue(['alarm:tls']),
      now: NOW,
    })
    // tls ist in diesem Lauf grün gesehen, server neu rot.
    expect(plan).toMatchObject({ action: 'update', wechsel: 'keiner', addLabels: ['alarm:server'], removeLabels: ['alarm:tls'] })
    expect(plan.rest).toEqual(['server'])
  })

  it('weiterhin rot: Kommentar erst nach 12 Stunden', () => {
    const results = { ...ALL_GREEN, server: 'failure' }
    expect(planAlarm({ results, open: issue(['alarm:server'], 30), now: NOW })).toMatchObject({ action: 'still-red', reminder: false })
    const old = planAlarm({ results, open: issue(['alarm:server'], REMINDER_SECONDS / 60), now: NOW })
    expect(old).toMatchObject({ action: 'still-red', reminder: true })
  })

  it('ein wartendes Tages-Issue bekommt KEINEN 12-Stunden-Kommentar vom Halbstunden-Lauf', () => {
    const plan = planAlarm({ results: HALF_HOUR, open: issue(['alarm:server'], 13 * 60), now: NOW })
    expect(plan).toMatchObject({ action: 'waiting', reminder: false })
  })

  it('`cancelled` und ein leeres Ergebnis sind keine Aussage — weder rot noch grün', () => {
    for (const value of ['cancelled', '', undefined]) {
      const plan = planAlarm({ results: { tls: value, server: value, kundendomains: value }, open: issue(['alarm:tls']), now: NOW })
      expect(plan.action).toBe('waiting')
      expect(plan.rest).toEqual(['tls'])
    }
  })

  it('offenes Issue OHNE Quellen-Label (von Hand, oder von vor der Regel): der erste Lauf ohne Rot schließt es', () => {
    expect(planAlarm({ results: HALF_HOUR, open: issue([]), now: NOW })).toMatchObject({ action: 'close', removeLabels: [] })
    // … und ein roter Lauf vermerkt seine Quelle daran.
    const red = planAlarm({ results: { ...ALL_GREEN, server: 'failure' }, open: issue([]), now: NOW })
    expect(red).toMatchObject({ action: 'update', addLabels: ['alarm:server'] })
  })

  it('jede Quelle hat genau ein Label mit der Vorsilbe `alarm:`', () => {
    expect(SOURCES.map(source => source.key)).toEqual(['tls', 'server', 'kundendomains'])
    for (const source of SOURCES) expect(source.label).toBe(`alarm:${source.key}`)
    // GitHub schneidet eine Label-Beschreibung nach 100 Zeichen ab (422).
    for (const source of SOURCES) expect(source.description.length).toBeLessThanOrEqual(100)
  })
})

describe('Texte', () => {
  it('Titel und Text eines neuen Issues nennen die Quelle, den Lauf und den Weg zum Schließen', () => {
    const made = composeIssue({ red: ['server'], drill: true, findings: ['Zeit-Lauf überfällig: …'], runUrl: 'https://example.test/run/1', now: NOW })
    expect(made.title).toBe(`🔴 Produktions-Alarm (Probealarm): ${sourceText(['server'])} — 2026-11-19 10:00 UTC`)
    expect(made.body).toContain('https://example.test/run/1')
    expect(made.body).toContain('**PROBEALARM**')
    expect(made.body).toContain('gh workflow run production-watch.yml')
    expect(made.body).toContain('- Zeit-Lauf überfällig: …')
    expect(composeIssue({ red: ['tls'], drill: false, findings: [], runUrl: '', now: NOW }).body).not.toContain('PROBEALARM')
  })

  it('der Kommentar im gemischten Fall sagt, was grün wurde und worauf das Issue wartet', () => {
    const plan = planAlarm({ results: HALF_HOUR, open: issue(['alarm:tls', 'alarm:server']), now: NOW })
    const text = composeUpdate({ plan, findings: [], runUrl: 'https://example.test/run/2', now: NOW })
    expect(text).toContain('Wieder grün: Zertifikate')
    expect(text).toContain('Offen bleibt: Server-Blicke')
    expect(text).toContain('04:17 UTC')
    expect(text).not.toContain('Entwarnung')
  })

  it('findingLines wirft Leerzeilen heraus; stamp ist UTC auf die Minute', () => {
    expect(findingLines('a\n\n', '', '  \nb')).toEqual(['a', 'b'])
    expect(stamp(NOW)).toBe('2026-11-19 10:00 UTC')
  })
})

describe('runAlarm — mit gestelltem gh', () => {
  function stage(env: Record<string, string>, open: ReturnType<typeof issue> | null, failOn?: string) {
    const calls: { args: string[], input?: string }[] = []
    const logs: string[] = []
    const outputs: string[] = []
    const gh = (args: string[], input?: string) => {
      calls.push({ args, input })
      if (failOn && args.slice(0, 2).join(' ') === failOn) throw new Error('gh kaputt')
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify(open ? [{ number: open.number, updatedAt: open.updatedAt, labels: open.labels.map(name => ({ name })) }] : [])
      }
      if (args[0] === 'issue' && args[1] === 'create') return 'https://example.test/issues/500\n'
      return ''
    }
    const run = () => runAlarm({
      env: { LABEL: 'produktions-alarm', RUN_URL: 'https://example.test/run/9', ALARM_ASSIGNEE: 'besitzer', ...env },
      gh,
      now: NOW,
      log: (line: string) => logs.push(line),
      output: (line: string) => outputs.push(line),
    })
    const verbs = () => calls.map(call => call.args.slice(0, 2).join(' '))
    return { run, calls, logs, outputs, verbs }
  }

  it('DER ANLASS am Stück: Halbstunden-Lauf bei offenem Tages-Issue schreibt nichts ans Issue', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'skipped', KUNDEN_RESULT: 'success', DRILL: '0' }, issue(['alarm:server']))
    s.run()
    // Nur lesen: Label sicherstellen, Liste holen. Kein Kommentar, kein Schließen.
    expect(s.verbs()).toEqual(['label create', 'issue list'])
    expect(s.outputs).toEqual(['wechsel=keiner', 'rot=', 'gruen=1'])
    expect(s.logs.join('\n')).toContain('bleibt offen')
    expect(s.logs.join('\n')).toContain('keine Entwarnung')
  })

  it('grüner Lauf mit `server` schließt: Kommentar, schließen, Label weg, Ausgang entwarnung', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'success', KUNDEN_RESULT: 'success', DRILL: '0' }, issue(['alarm:server']))
    s.run()
    expect(s.verbs()).toEqual(['label create', 'issue list', 'issue comment', 'issue close', 'issue edit'])
    expect(s.calls[2].input).toContain('Entwarnung')
    expect(s.calls[4].args).toEqual(['issue', 'edit', '401', '--remove-label', 'alarm:server'])
    expect(s.outputs).toEqual(['wechsel=entwarnung', 'rot=', 'gruen=1'])
  })

  it('neuer Alarm aus dem täglichen Teil: Quellen-Label angelegt, Issue mit beiden Labels, zugewiesen', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'failure', KUNDEN_RESULT: 'success', DRILL: '1', BEFUNDE_SERVER: 'Ein Satz.\n\n' }, null)
    s.run()
    expect(s.verbs()).toEqual(['label create', 'issue list', 'label create', 'issue create'])
    expect(s.calls[2].args[2]).toBe('alarm:server')
    const create = s.calls[3]
    expect(create.args).toContain('produktions-alarm,alarm:server')
    expect(create.args.slice(-2)).toEqual(['--assignee', 'besitzer'])
    expect(create.args[create.args.indexOf('--title') + 1]).toContain('(Probealarm)')
    expect(create.input).toContain('- Ein Satz.')
    expect(s.outputs).toEqual(['wechsel=alarm', `rot=${sourceText(['server'])}`, 'gruen=0'])
  })

  it('gemischt: ein Aufruf nimmt das grüne Label weg, ein Kommentar erklärt den Rest — kein Schließen', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'skipped', KUNDEN_RESULT: 'success', DRILL: '0' }, issue(['alarm:tls', 'alarm:server']))
    s.run()
    expect(s.verbs()).toEqual(['label create', 'issue list', 'issue edit', 'issue comment'])
    expect(s.calls[2].args).toEqual(['issue', 'edit', '401', '--remove-label', 'alarm:tls'])
    expect(s.outputs[0]).toBe('wechsel=keiner')
  })

  it('STRENG: scheitert ein Aufruf, wirft der Lauf und schreibt KEINEN Ausgang (weder Mail noch Heartbeat)', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'success', KUNDEN_RESULT: 'success' }, issue(['alarm:server']), 'issue close')
    expect(() => s.run()).toThrow('gh kaputt')
    expect(s.outputs).toEqual([])
  })

  it('STRENG: eine Antwort ohne Nummer ist ein kaputter Alarmweg, nicht „nichts offen"', () => {
    const s = stage({ TLS_RESULT: 'success', SERVER_RESULT: 'success', KUNDEN_RESULT: 'success' }, { number: Number.NaN, labels: [], updatedAt: 'kein Datum' })
    expect(() => s.run()).toThrow(/ohne Nummer/)
    expect(s.outputs).toEqual([])
  })

  it('das Protokoll nennt keine Sätze aus den Befunden (sie stehen nur im Issue)', () => {
    const s = stage({ TLS_RESULT: 'failure', SERVER_RESULT: 'skipped', KUNDEN_RESULT: 'success', BEFUNDE_TLS: 'GEHEIMER-SATZ' }, null)
    s.run()
    expect(s.logs.join('\n')).not.toContain('GEHEIMER-SATZ')
  })
})

describe('der Workflow ruft das Skript', () => {
  const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')
  const start = workflow.indexOf('\n  alarm:\n')
  const alarmJob = workflow.slice(start, workflow.indexOf('\n  kundendomains-namen:\n'))

  it('der Job `alarm` führt die Regel aus dem Skript aus und kennt alle drei Ergebnisse', () => {
    expect(start).toBeGreaterThan(0)
    expect(alarmJob).toContain('run: node scripts/ops/alarm-issue.mjs')
    for (const name of ['tls', 'server', 'kundendomains']) {
      expect(alarmJob).toContain(`needs.${name}.result`)
    }
    // Die alte Regel („nichts rot ⇒ schließen") steht nicht mehr als Shell da.
    expect(alarmJob).not.toContain('gh issue close')
  })

  it('die Jobs, auf die `alarm` wartet, sind genau die Quellen des Skripts (neuer Wächter-Job ⇒ Zeile in SOURCES)', () => {
    const needs = /^ {4}needs: \[([^\]]+)\]$/m.exec(alarmJob)?.[1].split(',').map(name => name.trim()).sort()
    expect(needs).toEqual(SOURCES.map(source => source.key).sort())
  })

  it('jeder Probe-Schalter des Workflows zählt als Probealarm', () => {
    const switches = [...workflow.matchAll(/^ {6}(\w+_drill):$/gm)].map(match => match[1])
    expect(switches.length).toBeGreaterThanOrEqual(7)
    const drill = alarmJob.split('\n').find(line => line.trimStart().startsWith('DRILL:')) ?? ''
    for (const name of switches) expect(drill).toContain(`inputs.${name}`)
  })
})
