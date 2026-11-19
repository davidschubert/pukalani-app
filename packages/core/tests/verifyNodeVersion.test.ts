import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GATE_REJECTED } from '../../../scripts/ops/app-watch-gate.mjs'
import { answerFrom, compareNodeVersions, drillAnswer, parseNodeVersions, processNames, readNvmrc } from '../../../scripts/ops/verify-node-version.mjs'

/**
 * Der tägliche Blick „Läuft auf dem App-Server das Node aus `.nvmrc`?"
 * (2026-11-19): `.nvmrc` nennt EINE exakte Version für Rechner, CI und Server;
 * auf dem Server hebt sie niemand von selbst. Hier die Vergleichsregel pur.
 * Das Tor-Wort `node-version` selbst: appWatchGate.test.ts; die Kette über
 * einen echten sshd: ops/app-watch-gate-attrappe.sh.
 *
 * Die erwarteten Sätze stehen AUSGESCHRIEBEN da — nie aus derselben Funktion
 * berechnet, die geprüft wird.
 */
const REPO = join(__dirname, '..', '..', '..')
const NAMES = ['portfoliopukalaniapp', 'adminpukalaniapp', 'platformpukalaniapp']

const gateText = (program: string, procs: Record<string, string>, extra: string[] = []) =>
  [`program ${program}`, ...Object.entries(procs).map(([name, version]) => `proc ${name} ${version}`), 'fremd 1', ...extra, ''].join('\n')
const allAt = (version: string) => Object.fromEntries(NAMES.map(name => [name, version]))
const compare = (stdout: string, expected: string | null = '24.22.3') =>
  compareNodeVersions({ expected, answer: answerFrom({ status: 0, stdout }), names: NAMES })

describe('.nvmrc lesen', () => {
  it.each([
    ['24.22.3\n', '24.22.3'],
    ['v24.22.3', '24.22.3'],
    ['  24.22.3  \n', '24.22.3'],
  ])('%j ist die exakte Version %s', (text, version) => {
    expect(readNvmrc(text)).toBe(version)
  })

  it.each([['24'], ['24.22'], ['lts/*'], ['lts/krypton'], ['24.22.3-rc.1'], ['24.22.3\n22.21.0'], [''], ['node']])('%j ist keine exakte Version', (text) => {
    expect(readNvmrc(text)).toBeNull()
  })

  it('die Datei im Repo nennt eine exakte Version — sonst hätte der Blick nichts zu vergleichen', () => {
    expect(readNvmrc(readFileSync(join(REPO, '.nvmrc'), 'utf8'))).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('Prozess-Namen aus ops/apps.conf', () => {
  it('Site ohne Punkte, in der Reihenfolge der Liste; Kommentare und Leerzeilen fallen weg', () => {
    expect(processNames('# App  Site\n\nportfolio  portfolio.pukalani.app\ncontrol admin.pukalani.app # Betreiber\nbranding   branding.supply\nkaputte zeile hier\n'))
      .toEqual(['portfoliopukalaniapp', 'adminpukalaniapp', 'brandingsupply'])
  })

  it('die Liste im Repo ergibt je App genau einen Namen', () => {
    const names = processNames(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))
    expect(names).toContain('platformpukalaniapp')
    expect(names).toContain('brandingsupply')
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThanOrEqual(6)
  })
})

describe('die Zeilen des Tors', () => {
  it('nur Zeilen in fester Form zählen — alles andere fällt weg', () => {
    expect(parseNodeVersions([
      'program 24.22.3',
      'proc platformpukalaniapp 24.22.3',
      'proc helppukalaniapp fehlt',
      'proc adminpukalaniapp unlesbar',
      'proc ../etc/passwd 24.22.3',
      'proc platformpukalaniapp 24.22.3 und mehr',
      'proc Gross 24.22.3',
      'program /usr/bin/node',
      'fremd 2',
      'fremd viele',
      'irgendeine Zeile',
      '',
    ].join('\n'))).toEqual({
      program: '24.22.3',
      procs: [
        { name: 'platformpukalaniapp', version: '24.22.3' },
        { name: 'helppukalaniapp', version: 'fehlt' },
        { name: 'adminpukalaniapp', version: 'unlesbar' },
      ],
      foreign: 2,
      pm2Unreadable: false,
    })
    expect(parseNodeVersions('program fehlt\npm2 unlesbar\n')).toEqual({ program: 'fehlt', procs: [], foreign: null, pm2Unreadable: true })
  })

  it('Exit 64 heißt „das Tor kennt das Wort noch nicht", jeder andere Fehler „nicht erreichbar"', () => {
    expect(answerFrom({ status: GATE_REJECTED, stdout: 'Abgelehnt: erlaubt sind site-env, …\n' })).toEqual({ state: 'unknown-word' })
    expect(answerFrom({ status: 255, stdout: '' })).toEqual({ state: 'unreachable', detail: 'Exit 255' })
    expect(answerFrom({ status: null, stdout: '' })).toEqual({ state: 'unreachable', detail: 'keine Antwort' })
    expect(answerFrom({ status: 6, stdout: 'Nicht geprüft: die App-Liste fehlt auf dem Server (ops/apps.conf).\n' })).toEqual({ state: 'unreachable', detail: 'Exit 6' })
    expect(answerFrom({ status: 0, stdout: 'Willkommen auf dem Server\n' })).toEqual({ state: 'unreachable', detail: 'Antwort ohne lesbare Zeile' })
  })
})

describe('der Vergleich mit .nvmrc', () => {
  it('Programm und alle Prozesse nennen die Version: grün, keine Warnung', () => {
    const result = compare(gateText('24.22.3', allAt('24.22.3')))
    expect(result.red).toEqual([])
    expect(result.notChecked).toEqual([])
    expect(result.checked).toBe(4)
    expect(result.lines).toEqual([
      '✔ Programm                     24.22.3',
      '✔ portfoliopukalaniapp         24.22.3',
      '✔ adminpukalaniapp             24.22.3',
      '✔ platformpukalaniapp          24.22.3',
      '· 1 weitere pm2-Prozesse, die ops/apps.conf nicht kennt (nicht verglichen)',
    ])
  })

  it('das Programm auf dem Server ist älter: rot, mit Handgriff und Runbook-Abschnitt', () => {
    const { red, checked } = compare(gateText('24.11.0', allAt('24.22.3')))
    expect(checked).toBe(4)
    expect(red).toEqual([
      'app-prod: das Programm /usr/bin/node nennt 24.11.0, .nvmrc verlangt 24.22.3 — das Paket nodejs auf dem Server auf 24.22.3 heben und pm2 neu starten, oder .nvmrc per Pull Request angleichen (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).',
    ])
  })

  it('das Paket ist gehoben, pm2 aber nicht neu gestartet: jeder Prozess mit altem Stand ist ein Befund', () => {
    const { red, lines } = compare(gateText('24.22.3', { ...allAt('24.22.3'), adminpukalaniapp: '24.11.0', platformpukalaniapp: '22.21.0' }))
    expect(red).toEqual([
      'app-prod: der Prozess adminpukalaniapp läuft mit Node 24.11.0, .nvmrc verlangt 24.22.3 — das Paket nodejs auf 24.22.3 heben und den pm2-Dienst neu starten (pm2 update; ein pm2 reload reicht nicht), oder .nvmrc per Pull Request angleichen (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).',
      'app-prod: der Prozess platformpukalaniapp läuft mit Node 22.21.0, .nvmrc verlangt 24.22.3 — das Paket nodejs auf 24.22.3 heben und den pm2-Dienst neu starten (pm2 update; ein pm2 reload reicht nicht), oder .nvmrc per Pull Request angleichen (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).',
    ])
    expect(lines).toContain('✗ platformpukalaniapp          22.21.0 statt 24.22.3')
  })

  it('der Server ist NEUER als .nvmrc: ebenfalls rot — „dieselbe" heißt dieselbe', () => {
    expect(compare(gateText('24.22.4', allAt('24.22.4'))).red).toHaveLength(4)
  })

  it('ein Prozess, der fehlt oder keine lesbare Version nennt, ist eine Warnung, kein Befund', () => {
    const result = compare(gateText('24.22.3', { portfoliopukalaniapp: '24.22.3', adminpukalaniapp: 'fehlt', platformpukalaniapp: 'unlesbar' }))
    expect(result.red).toEqual([])
    expect(result.checked).toBe(2)
    expect(result.notChecked).toEqual([
      'app-prod: die Site der Liste hat keinen pm2-Prozess adminpukalaniapp — NICHT GEPRÜFT (ob die App läuft, meldet der Health-Blick).',
      'app-prod: der Prozess platformpukalaniapp nennt keine lesbare Node-Version — NICHT GEPRÜFT.',
    ])
  })

  it('eine App der Repo-Liste, die das Tor gar nicht nennt, ist eine Warnung', () => {
    const result = compare(gateText('24.22.3', { portfoliopukalaniapp: '24.22.3', adminpukalaniapp: '24.22.3' }))
    expect(result.red).toEqual([])
    expect(result.notChecked).toEqual([
      'app-prod: das Tor nennt den Prozess platformpukalaniapp nicht — NICHT GEPRÜFT (die App-Liste auf dem Server kennt die Site nicht).',
    ])
  })

  it('pm2 antwortet nicht: die Prozesse sind nicht geprüft, das Programm schon', () => {
    const result = compare('program 24.11.0\npm2 unlesbar\n')
    expect(result.checked).toBe(1)
    expect(result.red).toHaveLength(1)
    expect(result.notChecked).toEqual(['app-prod: pm2 hat nicht lesbar geantwortet — die Prozesse sind NICHT GEPRÜFT.'])
  })

  it('das Programm fehlt oder ist unlesbar: Warnung, kein Befund', () => {
    for (const state of ['fehlt', 'unlesbar']) {
      const result = compare(gateText(state, allAt('24.22.3')))
      expect(result.red, state).toEqual([])
      expect(result.checked, state).toBe(3)
      expect(result.notChecked, state).toEqual([
        `app-prod: das Programm /usr/bin/node nennt keine lesbare Version (${state}) — NICHT GEPRÜFT. Auf dem Server nachsehen, mit welchem Programm pm2 startet (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).`,
      ])
    }
  })

  it('keine klare Antwort ist keine Aussage: nichts rot, nichts verglichen (das Skript endet dann mit Exit 2)', () => {
    const unknown = compareNodeVersions({ expected: '24.22.3', answer: answerFrom({ status: GATE_REJECTED, stdout: '' }), names: NAMES })
    expect(unknown).toEqual({
      lines: [],
      red: [],
      notChecked: ['app-prod: das Tor kennt das Wort „node-version“ noch nicht — NICHT GEPRÜFT. ops/app-watch-gate.sh aus dem Repo von Hand einspielen (docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, „Das Wächter-Tor").'],
      checked: 0,
    })
    const offline = compareNodeVersions({ expected: '24.22.3', answer: answerFrom({ status: 255, stdout: '' }), names: NAMES })
    expect(offline.red).toEqual([])
    expect(offline.checked).toBe(0)
    expect(offline.notChecked).toEqual(['app-prod: nicht erreichbar (Exit 255) — NICHT GEPRÜFT, keine Aussage über die Node-Version dort.'])
  })

  it('.nvmrc ohne exakte Version ist selbst ein Befund', () => {
    const result = compare(gateText('24.22.3', allAt('24.22.3')), null)
    expect(result.red).toEqual(['.nvmrc nennt keine exakte Node-Version (erwartet drei Zahlen wie 24.22.3) — ohne sie gibt es nichts zu vergleichen. Die Datei berichtigen (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).'])
  })
})

describe('Probealarm', () => {
  it('macht den Prozess der ersten App rot — auch ohne Antwort des Servers', () => {
    for (const status of [0, GATE_REJECTED, 255]) {
      const answer = drillAnswer(answerFrom({ status, stdout: gateText('24.22.3', allAt('24.22.3')) }), NAMES)
      const { red } = compareNodeVersions({ expected: '24.22.3', answer, names: NAMES })
      expect(red, String(status)).toHaveLength(1)
      expect(red[0], String(status)).toMatch(/^app-prod: der Prozess portfoliopukalaniapp läuft mit Node 0\.0\.0, \.nvmrc verlangt 24\.22\.3/)
    }
  })
})

describe('das Skript als Ganzes', () => {
  const source = readFileSync(join(REPO, 'scripts', 'ops', 'verify-node-version.mjs'), 'utf8')

  it('fragt nur das Tor-Wort und kennt die drei Ausgänge', () => {
    expect(source).toContain('gateSshArgs(APP_SERVER, \'node-version\')')
    expect(source).toContain('process.exit(2)')
    expect(source).toContain('if (strict) process.exit(1)')
  })

  it('der Befund nennt den Abschnitt, den es im Runbook gibt', () => {
    expect(readFileSync(join(REPO, 'docs', 'runbooks', 'DEPLOYMENT.md'), 'utf8')).toMatch(/^## A4\. Node: eine Version an drei Orten$/m)
  })
})
