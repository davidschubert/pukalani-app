import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WATCHDOG_LINE, WATCHDOG_RULES, evaluateWatchdogLine, handshake, handshakeWithRetries } from '../../../scripts/ops/verify-realtime.mjs'

/**
 * OPS-004 (2026-11-16): die zwei Blicke auf die Live-Verbindung. Geprüft
 * werden die Regeln für die Stand-Zeile des Wächters (pur), die Versuche des
 * Handshakes von außen (mit eingesetztem Stellvertreter statt Netz) und dass
 * Tor-Skript, Auswertung und Workflow dieselbe Zeile meinen.
 */
const REPO = join(__dirname, '..', '..', '..')

function line(result: string, failures = 0, r24 = 0, r7 = 0, age: number | 'nie' = 2): string {
  return `realtime ergebnis=${result} fehlschlaege=${failures} neustarts_24h=${r24} neustarts_7t=${r7} alter_minuten=${age}`
}

describe('Stand-Zeile des Realtime-Wächters', () => {
  it('gesund ⇒ nichts Rotes', () => {
    expect(evaluateWatchdogLine(line('ok'))).toEqual({ red: [], notes: [] })
  })

  it('ein Neustart, der geholfen hat, ist kein Alarm — er wird berichtet', () => {
    const result = evaluateWatchdogLine(line('neustart-geholfen', 1, 1, 1))
    expect(result.red).toEqual([])
    expect(result.notes[0]).toContain('1 Neustart(s) in 24 h')
  })

  it('aufgegeben ⇒ rot, mit der Zahl der Fehlschläge', () => {
    const red = evaluateWatchdogLine(line('aufgegeben', 7, 3, 3)).red
    expect(red[0]).toContain('nach 7 Fehlschlägen in Folge AUFGEGEBEN')
  })

  it('der letzte Neustart hat nicht geholfen ⇒ rot', () => {
    expect(evaluateWatchdogLine(line('neustart-erfolglos', 2, 2, 2)).red[0]).toContain('hat nicht geholfen')
  })

  it('der Zeitplan läuft nicht mehr: zu alter oder gar kein Lauf ⇒ rot; an der Grenze nicht', () => {
    expect(evaluateWatchdogLine(line('ok', 0, 0, 0, WATCHDOG_RULES.maxAgeMin)).red).toEqual([])
    expect(evaluateWatchdogLine(line('ok', 0, 0, 0, WATCHDOG_RULES.maxAgeMin + 1)).red[0]).toContain('der Zeitplan auf dem Appwrite-Server läuft nicht')
    expect(evaluateWatchdogLine(line('ok', 0, 0, 0, 'nie')).red[0]).toContain('nie gewesen')
  })

  it('ab drei Neustarts in 24 Stunden ⇒ rot, auch wenn der letzte geholfen hat', () => {
    expect(evaluateWatchdogLine(line('neustart-geholfen', 1, 2, 2)).red).toEqual([])
    expect(evaluateWatchdogLine(line('neustart-geholfen', 1, 3, 3)).red[0]).toContain('3 Neustarts in 24 Stunden')
  })

  it.each([
    ['unbekannter Stand', 'realtime ergebnis=unbekannt'],
    ['leer', ''],
    ['eingeschleuster Text', `${line('ok')}; rm -rf /`],
    ['zwei Zeilen', `${line('ok')}\n${line('ok')}`],
    ['fremdes Ergebnis', line('prima')],
  ])('%s ⇒ „kein lesbarer Stand", nichts davon im Satz', (_name, text) => {
    const { red } = evaluateWatchdogLine(text)
    expect(red).toHaveLength(1)
    expect(red[0]).toContain('kein lesbarer Stand')
    expect(red[0]).not.toContain('rm -rf')
  })

  it('Probealarm: mit einer Altersgrenze unter null ist auch ein gesunder Stand rot', () => {
    expect(evaluateWatchdogLine(line('ok', 0, 0, 0, 0), { ...WATCHDOG_RULES, maxAgeMin: -1 }).red).toHaveLength(1)
  })

  it('jeder rote Satz nennt einen Handgriff und den Abschnitt im Runbook', () => {
    const all = [
      ...evaluateWatchdogLine(line('aufgegeben', 5, 4, 4, 99)).red,
      ...evaluateWatchdogLine(line('neustart-erfolglos', 1, 1, 1)).red,
      ...evaluateWatchdogLine('').red,
    ]
    expect(all).toHaveLength(5)
    for (const text of all) {
      expect(text).toContain('Tun:')
      expect(text).toMatch(/\(docs\/runbooks\/PRODUKTIONS-ALARM\.md, „Live-Verbindung \(Realtime\)"\)$/)
    }
  })
})

describe('Handshake von außen', () => {
  const quiet = { sleep: async () => {}, log: () => {} }

  it('gelingt der erste, gibt es keinen zweiten', async () => {
    let calls = 0
    const result = await handshakeWithRetries('https://x.invalid', { ...quiet, attempt: async () => ({ ok: ++calls > 0, detail: '' }) })
    expect(result).toEqual({ ok: true, attempts: 1 })
    expect(calls).toBe(1)
  })

  it('ein Ausfall, der sich bis zum dritten Versuch heilt, ist kein Befund — und gewartet wird 20 und 330 Sekunden', async () => {
    const waits: number[] = []
    let calls = 0
    const result = await handshakeWithRetries('https://x.invalid', {
      log: () => {},
      sleep: async (seconds: number) => { waits.push(seconds) },
      attempt: async () => ({ ok: ++calls === 3, detail: 'keine Verbindung' }),
    })
    expect(result).toEqual({ ok: true, attempts: 3 })
    // Die zweite Pause ist länger als der Takt des Wächters auf dem Server (300 s).
    expect(waits).toEqual([20, 330])
  })

  it('drei Fehlschläge ⇒ Befund mit dem letzten Grund', async () => {
    const result = await handshakeWithRetries('https://x.invalid', { ...quiet, attempt: async () => ({ ok: false, detail: 'Status 502 statt 101' }) })
    expect(result).toEqual({ ok: false, attempts: 3, detail: 'Status 502 statt 101' })
  })

  it('der echte Aufruf endet ohne Verbindung als „gescheitert" mit festem Grund, nie mit einer Ausnahme', async () => {
    // Ein TLS-Server lässt sich hier nicht ohne Zertifikat aufsetzen; geprüft
    // wird deshalb der Fehlerweg des echten Aufrufs: keine Verbindung ⇒
    // `ok: false` mit einem festen Grund, nie eine Ausnahme.
    const result = await handshake('https://127.0.0.1:9/v1/realtime?project=console', 2000)
    expect(result.ok).toBe(false)
    expect(['keine Verbindung', 'keine Antwort in der Frist']).toContain(result.detail)
  })
})

describe('Tor-Skript, Auswertung und Workflow meinen dieselbe Zeile', () => {
  const gate = readFileSync(join(REPO, 'ops', 'appwrite-cert-gate.sh'), 'utf8')
  const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')

  it('das Tor gibt genau die Wörter aus, die die Auswertung kennt', () => {
    expect(gate).toContain('case "$RESULT" in ok|neustart-geholfen|neustart-erfolglos|aufgegeben) ;;')
    expect(gate).toContain('echo "realtime ergebnis=$RESULT fehlschlaege=$(( 10#$FAILS )) neustarts_24h=$R24 neustarts_7t=$R7 alter_minuten=$AGE"')
    expect(WATCHDOG_LINE.source).toContain('(ok|neustart-geholfen|neustart-erfolglos|aufgegeben)')
    expect(WATCHDOG_LINE.test(line('ok', 0, 0, 0, 'nie'))).toBe(true)
    expect(WATCHDOG_LINE.test('realtime ergebnis=unbekannt')).toBe(false)
  })

  it('der Workflow fragt das Tor nach dem Stand und reicht die Zeile an die Auswertung', () => {
    expect(workflow).toContain('ssh appwrite-prod realtime-status')
    expect(workflow).toContain('node scripts/ops/verify-realtime.mjs --watchdog-line')
    expect(workflow).toContain('node scripts/ops/verify-realtime.mjs --handshake')
  })
})
