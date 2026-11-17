import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BEWEISE, e2eDetector, GRUND_MIN, manifestProblems } from '../../../scripts/buehne/beweise.mjs'
import { countMarks, selectProofs, timeoutSeconds } from '../../../scripts/buehne/run.mjs'
import { proofScripts } from '../../../scripts/live-beweise.mjs'

/**
 * OPS-009 (GA1 P27, Etappe 3): JEDES BEWEIS-SKRIPT HAT GENAU EINE ZEILE IN
 * DER EINTEILUNG `scripts/buehne/beweise.mjs`.
 *
 * Die Einteilung sagt, wann ein Skript läuft: in der E2E (`e2e`), bei jedem
 * Lauf auf der Bühne (`buehne`), nachts (`nacht`) oder nur von Hand (`hand`,
 * dann mit Grund). Ein neues Skript ohne Zeile würde nie laufen und niemand
 * merkte es — genau so lagen 82 Skripte im Repo, von denen 6 liefen.
 *
 * Dieselben Regeln prüft `pnpm check:live-beweise` im Lint-Lauf; dieser Test
 * hält sie zusätzlich in `pnpm -r test`. Kein Netz, keine Umgebung: gelesen
 * werden nur Dateien.
 */
const REPO = join(__dirname, '..', '..', '..')
const e2eYaml = readFileSync(join(REPO, '.github/workflows/e2e.yml'), 'utf8')
const runsInE2e = e2eDetector(e2eYaml)
const scripts: string[] = proofScripts(REPO)

describe('Selbsttest der Erkennung', () => {
  const runsNowhere = () => false
  const ok = { skript: 'packages/x/scripts/verify-a.mjs', lauf: 'buehne' as const, env: 'platform' as const }

  it('eine vollständige Einteilung ist grün', () => {
    expect(manifestProblems({ scripts: [ok.skript], beweise: [ok], runsInE2e: runsNowhere })).toEqual([])
  })

  it('ein Skript ohne Zeile ist rot', () => {
    const problems = manifestProblems({ scripts: [ok.skript, 'packages/x/scripts/verify-neu.mjs'], beweise: [ok], runsInE2e: runsNowhere })
    expect(problems.join('\n')).toContain('verify-neu.mjs: fehlt')
  })

  it('eine doppelte Zeile und eine Zeile ohne Datei sind rot', () => {
    const ghost = { ...ok, skript: 'packages/x/scripts/verify-weg.mjs' }
    const problems = manifestProblems({ scripts: [ok.skript], beweise: [ok, ok, ghost], runsInE2e: runsNowhere })
    expect(problems.join('\n')).toContain('steht 2-mal')
    expect(problems.join('\n')).toContain('verify-weg.mjs: in scripts/buehne/beweise.mjs, aber die Datei gibt es nicht')
  })

  it('„hand" ohne ausreichenden Grund ist rot, mit Satz grün', () => {
    const short = { skript: ok.skript, lauf: 'hand' as const, grund: 'zu kurz' }
    const long = { skript: ok.skript, lauf: 'hand' as const, grund: 'Braucht einen Dienst, den es auf der Bühne nicht gibt.' }
    expect(manifestProblems({ scripts: [ok.skript], beweise: [short], runsInE2e: runsNowhere })).toHaveLength(1)
    expect(manifestProblems({ scripts: [ok.skript], beweise: [long], runsInE2e: runsNowhere })).toEqual([])
  })

  it('„buehne"/„nacht" ohne env ist rot', () => {
    const noEnv = { skript: ok.skript, lauf: 'nacht' as const }
    expect(manifestProblems({ scripts: [ok.skript], beweise: [noEnv], runsInE2e: runsNowhere }).join('\n')).toContain('braucht `env`')
  })

  it('„e2e" muss in e2e.yml stehen, und was dort steht, muss „e2e" sein', () => {
    const e2e = { skript: ok.skript, lauf: 'e2e' as const }
    expect(manifestProblems({ scripts: [ok.skript], beweise: [e2e], runsInE2e: runsNowhere }).join('\n')).toContain('steht aber nicht in')
    expect(manifestProblems({ scripts: [ok.skript], beweise: [ok], runsInE2e: () => true }).join('\n')).toContain('dort „e2e" eintragen')
  })

  it('die e2e-Erkennung kennt den ganzen Pfad, `cd` + `scripts/…` und überliest Kommentare', () => {
    const detect = e2eDetector([
      '      - run: node packages/a/scripts/verify-ganz.mjs',
      '      - run: |',
      '          cd packages/b',
      '          node scripts/verify-cd.mjs',
      '      # node packages/c/scripts/verify-kommentar.mjs',
    ].join('\n'))
    expect(detect('packages/a/scripts/verify-ganz.mjs')).toBe(true)
    expect(detect('packages/b/scripts/verify-cd.mjs')).toBe(true)
    expect(detect('packages/a/scripts/verify-cd.mjs')).toBe(false)
    expect(detect('packages/c/scripts/verify-kommentar.mjs')).toBe(false)
  })
})

describe('Selbsttest des Läufers', () => {
  const list = [
    { skript: 'packages/a/scripts/verify-1.mjs', lauf: 'buehne' as const, env: 'control' as const, dauer: 2 },
    { skript: 'packages/a/scripts/verify-2.mjs', lauf: 'nacht' as const, env: 'control' as const, dauer: 100 },
    { skript: 'packages/b/scripts/verify-3.mjs', lauf: 'hand' as const, grund: 'Braucht einen Dienst, den es auf der Bühne nicht gibt.' },
  ]

  it('„buehne" nimmt nur buehne, „nacht" buehne UND nacht, --only jede Klasse', () => {
    expect(selectProofs(list, { lauf: 'buehne' }).map(entry => entry.skript)).toEqual([list[0]!.skript])
    expect(selectProofs(list, { lauf: 'nacht' })).toHaveLength(2)
    expect(selectProofs(list, { only: ['verify-3'] }).map(entry => entry.lauf)).toEqual(['hand'])
  })

  it('Zeitgrenze: dreimal die Dauer, mindestens 60 s, ohne Dauer 300 s', () => {
    expect(timeoutSeconds(list[0]!)).toBe(60)
    expect(timeoutSeconds(list[1]!)).toBe(300)
    expect(timeoutSeconds({ skript: 'x', lauf: 'buehne', dauer: 30 })).toBe(90)
    expect(timeoutSeconds(list[2]!)).toBe(300)
  })

  it('zählt ✔ und ✗ am Zeilenanfang, nicht die Schlusszeile', () => {
    const lines = ['  ✔ eins', '✔ zwei', '  ✗ drei', 'Text mit ✔ mittendrin', '✔ 2 bestanden, 1 fehlgeschlagen', '✔ 3/3 Prüfungen bestanden', '  ✔ 1. Lauf kommt durch']
    expect(countMarks(lines)).toEqual({ pass: 3, fail: 1 })
  })
})

describe('Die Einteilung passt zum Repo (OPS-009)', () => {
  it('findet die Skripte überhaupt (der Wächter sieht hin)', () => {
    expect(scripts.length).toBeGreaterThanOrEqual(80)
    expect(BEWEISE.length).toBeGreaterThanOrEqual(80)
  })

  it('jedes Skript hat genau eine Zeile, jede Zeile eine Datei, jede Regel hält', () => {
    const problems = manifestProblems({ scripts, beweise: BEWEISE, runsInE2e })
    expect(problems, `Einteilung scripts/buehne/beweise.mjs passt nicht:\n  ${problems.join('\n  ')}`).toEqual([])
  })

  it('jeder Eintrag für die Bühne nennt seine Env-Datei, jeder Hand-Eintrag einen Satz', () => {
    const wrong = BEWEISE.flatMap((entry) => {
      if ((entry.lauf === 'buehne' || entry.lauf === 'nacht') && !entry.env) return [`${entry.skript}: env fehlt`]
      if (entry.lauf === 'hand' && (entry.grund ?? '').trim().length < GRUND_MIN) return [`${entry.skript}: Grund zu kurz`]
      return []
    })
    expect(wrong).toEqual([])
  })
})
