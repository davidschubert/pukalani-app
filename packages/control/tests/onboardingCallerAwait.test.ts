import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * JEDE AUFRUFSTELLE DES NAHT-GATES WARTET AUF IHRE ANTWORT (A0, 2026-08-18).
 *
 * `requireOnboardingCaller` ist seit dem Umzug der Naht-Geheimnisse in die
 * Betreiber-Konsole ASYNC — es liest die Ablage-Zeile, und das ist ein
 * Appwrite-Ruf. Ohne `await` wäre das Gate FAIL-OPEN und nicht etwa kaputt:
 * ein Promise ist truthy, `throw` geschieht erst später und landet in einer
 * unbehandelten Ablehnung, während der Handler längst weitergelaufen ist.
 * Genau davor warnt CLAUDE.md bei `requireCommunityPermission` („die ist
 * synchron und wird ohne await gerufen") — nur ist es hier umgekehrt: die
 * Funktion ist jetzt asynchron, und jede Aufrufstelle muss es wissen.
 *
 * Die Prüfung ist STRUKTURELL, weil der Fehler strukturell wäre: kein Typ und
 * kein Test einer einzelnen Route fällt darüber (der Aufruf ist syntaktisch
 * gültig, der Test einer Route mit gültigem Secret bleibt grün). Eine NEUE
 * Service-Route ohne `await` bricht dagegen genau hier.
 *
 * ── ALLE SERVER-ORDNER, NICHT NUR DIESER LAYER (SEC-023, 2026-11-13) ──────
 * Bis dahin las der Wächter nur `packages/control/server/api/control`. Routen
 * liegen aber auch in den APPS (`apps/control/server/api/control/billing/…`),
 * und genau dort standen zwei Aufrufe ohne `await`. Gelesen wird deshalb
 * jedes `server/` unter `packages/*` UND `apps/*`, rekursiv — ein neuer Ort
 * für Routen braucht hier keinen Eintrag. Zweites Netz seit demselben Tag:
 * die typisierte Lint-Regel `@typescript-eslint/no-floating-promises` über
 * alle Server-Ordner (eslint.config.mjs).
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return tsFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/** Jedes `server/` unter `packages/*` und `apps/*` — abgeleitet, nicht gepflegt. */
const serverDirs = ['packages', 'apps'].flatMap(top =>
  readdirSync(`${repoRoot}${top}`, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => `${repoRoot}${top}/${entry.name}/server`)
    .filter(dir => existsSync(dir)))

// Die Definition selbst (`function requireOnboardingCaller(`) ist kein Aufruf.
const CALL = /(?<!function )requireOnboardingCaller\(/g
const AWAITED_CALL = /await requireOnboardingCaller\(/g

const callers = serverDirs.flatMap(tsFiles)
  .map(path => ({ file: path.slice(repoRoot.length), source: readFileSync(path, 'utf8') }))
  .filter(({ source }) => (source.match(CALL)?.length ?? 0) > 0)

describe('Service-Naht: das Gate wird immer abgewartet', () => {
  it('findet die Service-Routen überhaupt', () => {
    // Ein Wächter, der nichts findet, ist grün und wertlos — z. B. nach einer
    // Umbenennung des Ordners.
    expect(callers.length).toBeGreaterThan(40)
  })

  it.each(callers.map(c => c.file))('%s ruft `await requireOnboardingCaller`', (file) => {
    const source = callers.find(c => c.file === file)!.source
    const calls = source.match(CALL)?.length ?? 0
    const awaited = source.match(AWAITED_CALL)?.length ?? 0
    expect(awaited).toBe(calls)
  })
})

describe('Der Empfänger prüft gegen die MENGE, nicht gegen einen Wert', () => {
  const gate = readFileSync(fileURLToPath(new URL('../server/utils/onboardingService.ts', import.meta.url)), 'utf8')

  it('benutzt den geteilten Helfer statt einer eigenen Kopie', () => {
    // Vor A0 stand hier eine eigene `secretsMatch`-Kopie — dieselbe wie im
    // domains-Layer. Zwei Kopien einer Vertrauensnaht sind genau die Sorte
    // Doppelpflege, bei der eines Tages nur eine beide Werte annimmt.
    expect(gate).toContain('seamSecretsFor')
    expect(gate).toContain('seamSecretMatches')
    expect(gate).not.toContain('timingSafeEqual')
  })

  it('bleibt bei 404 ohne jede Konfiguration und 401 bei falschem Wert', () => {
    // Die zwei Antworten sind eine Aussage: „gibt es hier nicht" gegen „du
    // bist es nicht". Wer sie zusammenlegt, macht die Route zum Orakel.
    expect(gate).toContain('status: 404')
    expect(gate).toContain('status: 401')
  })
})
