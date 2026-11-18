import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readMailBreaker, summarizeMailBreaker, UNCHECKED_TEXT } from '../../../scripts/ops/mail-breaker-rules.mjs'
import { readApps } from '../../../scripts/ops/verify-app-signals.mjs'

/**
 * WA1 e (2026-11-18): der Mail-Blick las im Log-Ordner des App-Servers jede
 * Datei `*-error*.log` — auch die früherer Prozess-Nummern; nur das
 * Zeitfenster hielt ihn richtig. Jetzt fragt er je App das Zähl-Skript
 * (`ops/app-watch-counts.mjs`), das nur die Dateien des laufenden Prozesses
 * liest. DASS das Zähl-Skript eine alte Datei liegen lässt, belegt
 * `appWatchCounts.test.ts`; hier steht der Weg von seiner Antwort bis zum
 * Exit-Code des Blicks.
 */
const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'scripts', 'ops', 'verify-mail-breaker.mjs')
const APPS = readApps(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))

function counts(options: { breaker?: number | null, last?: number | 'nie', status?: string } = {}): string {
  return [
    `zaehler version=1 prozess=testprozess stunden=25 status=${options.status ?? 'online'}`,
    'prozess speicher_mb=150 neustarts=3 laeuft_min=600',
    'fehler server=0 browser=0 browser_gedeckelt=0',
    'ki ausfaelle=0 ohne_guthaben=0 kein_endpunkt=0 abgeschaltet=0',
    'protokoll ausfaelle=0',
    'skriptregel berichte=0 gedeckelt=0',
    // `breaker: null` = ein Server mit dem Zähl-Skript von vorher (ohne die Zeile).
    ...(options.breaker === null ? [] : [`mailbremse ausgeloest=${options.breaker ?? 0} letzte_min=${options.last ?? 'nie'}`]),
    'ende laeufe=0',
    '',
  ].join('\n')
}

describe('mail-breaker-rules.mjs — die Antwort des Zähl-Skripts deuten', () => {
  it('ruhig: gezählt, null Mal', () => {
    expect(readMailBreaker(counts())).toEqual({ state: 'counted', count: 0, lastMin: null })
  })

  it('ausgelöst: Zahl und „zuletzt vor n Minuten"', () => {
    expect(readMailBreaker(counts({ breaker: 3, last: 42 }))).toEqual({ state: 'counted', count: 3, lastMin: 42 })
  })

  it.each([
    ['keine Antwort', null, 'nicht-erreichbar'],
    ['ein Zähl-Skript ohne die Zeile', counts({ breaker: null }), 'zaehl-skript-aelter'],
    ['eine fremde Zeile', `${counts()}cat /etc/passwd\n`, 'unlesbar'],
    ['eine Antwort ohne Schlusszeile', counts().replace('ende laeufe=0\n', ''), 'abgeschnitten'],
    ['„Prozess fehlt"', 'zaehler version=1 prozess=testprozess stunden=25 status=fehlt\n', 'prozess-fehlt'],
    ['eine kaputte Zeile der Notbremse', counts().replace('letzte_min=nie', 'letzte_min=gestern'), 'unlesbar'],
  ])('%s ist „nicht gezählt", nie „ruhig"', (_label, text, reason) => {
    expect(readMailBreaker(text)).toEqual({ state: 'unchecked', reason })
    expect(UNCHECKED_TEXT[reason as keyof typeof UNCHECKED_TEXT]).toBeTruthy()
  })

  it('fasst zusammen: Funde je Site, Summe, und was nicht gezählt wurde', () => {
    const summary = summarizeMailBreaker([
      { site: 'a.example', text: counts({ breaker: 2, last: 10 }) },
      { site: 'b.example', text: counts() },
      { site: 'c.example', text: null },
      { site: 'd.example', text: counts({ breaker: 1, last: 300 }) },
    ])
    expect(summary).toEqual({
      counted: 3,
      total: 3,
      findings: [{ site: 'a.example', count: 2, lastMin: 10 }, { site: 'd.example', count: 1, lastMin: 300 }],
      unchecked: [{ site: 'c.example', reason: 'nicht-erreichbar' }],
    })
  })
})

describe('verify-mail-breaker.mjs — von der gespeicherten Antwort bis zum Exit-Code', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mail-breaker-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function answers(perApp: (app: string) => string | null) {
    for (const { app } of APPS) {
      const text = perApp(app)
      if (text !== null) writeFileSync(join(dir, `${app}.txt`), text)
    }
  }
  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [SCRIPT, '--from-dir', dir, ...args], { encoding: 'utf8', env: { ...process.env, RESEND_API_KEY: '' } })
    return { code: result.status, out: `${result.stdout}${result.stderr}` }
  }

  it('alle Apps ruhig ⇒ Exit 0', () => {
    answers(() => counts())
    const { code, out } = run('--strict')
    expect(code).toBe(0)
    expect(out).toContain(`${APPS.length} von ${APPS.length} Apps gezählt`)
    expect(out).toContain('✔ Notbremse hat nicht gegriffen.')
  })

  it('eine App mit ausgelöster Notbremse ⇒ mit --strict Exit 1, ohne Exit 0; genannt wird die Site', () => {
    const hit = APPS[0]!
    answers(app => (app === hit.app ? counts({ breaker: 2, last: 17 }) : counts()))
    const strict = run('--strict')
    expect(strict.code).toBe(1)
    expect(strict.out).toContain('✗ 2 Mal ausgelöst:')
    expect(strict.out).toContain(`· ${hit.site}: 2 Mal, zuletzt vor 17 min`)
    expect(run().code).toBe(0)
  })

  it('eine App nicht gezählt ⇒ eine Zeile, der Blick bleibt grün (rot macht sie der Blick „In die App hinein")', () => {
    const gone = APPS[0]!
    answers(app => (app === gone.app ? null : counts()))
    const { code, out } = run('--strict')
    expect(code).toBe(0)
    expect(out).toContain(`… ${gone.site}: nicht gezählt — ${UNCHECKED_TEXT['nicht-erreichbar']}.`)
    expect(out).toContain(`${APPS.length - 1} von ${APPS.length} Apps gezählt`)
  })

  it('ein Server mit dem Zähl-Skript von vorher ⇒ „nicht gezählt", und ohne eine einzige Zahl Exit 2 (kaputter Weg, kein Alarm)', () => {
    answers(() => counts({ breaker: null }))
    const { code, out } = run('--strict')
    expect(code).toBe(2)
    expect(out).toContain(UNCHECKED_TEXT['zaehl-skript-aelter'])
    expect(out).toContain('Keine App konnte gezählt werden.')
    expect(out).not.toContain('✔ Notbremse hat nicht gegriffen.')
  })

  it('der echte Blick schickt das Tor-Wort app-signals, nur der Probelauf noch mail-breaker', () => {
    const source = readFileSync(SCRIPT, 'utf8')
    expect(source.match(/gateSshArgs\(SERVER, 'app-signals'/g)).toHaveLength(1)
    expect(source.match(/gateSshArgs\(SERVER, 'mail-breaker', seit, PATTERN\)/g)).toHaveLength(1)
    expect(source.match(/gateSshArgs\(/g)).toHaveLength(2)
  })
})
