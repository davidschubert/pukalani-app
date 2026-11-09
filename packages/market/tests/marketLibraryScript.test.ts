import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Das Bibliotheks-Werkzeug MUSS LADEN (MV1, 2026-11-09).
 *
 * `market-library-compute.mjs` läuft unter purem Node (Typen werden entfernt,
 * kein Bundler) — und Node ergänzt KEINE Dateiendungen. Seit BS1 R2b
 * (2026-09-08) importierte `shared/marketRobots.ts` die Regel aus
 * `brand/shared/brandRobots` ohne `.ts`; Vite und Nitro lösen das auf, Node
 * nicht. Das Werkzeug brach damit schon beim Start, zwei Monate lang, und weder
 * Typecheck noch Lint noch die übrigen Tests sahen es (sie laufen alle über
 * Vite). Gefunden erst, als der wöchentliche `--stale`-Lauf dazukam.
 *
 * Darum hier der echte Start: `--stale` fasst kein Netz an und braucht weder
 * Server noch Appwrite. Gegen ein festes Datum gerechnet, damit der Test nicht
 * mit dem Kalender rot wird.
 */
const SCRIPT = fileURLToPath(new URL('../scripts/market-library-compute.mjs', import.meta.url))

function run(now: string) {
  return spawnSync(process.execPath, [SCRIPT, '--stale', '--now', now], { encoding: 'utf8' })
}

describe('market-library-compute.mjs --stale', () => {
  it('lädt und rechnet (Exit 0 oder 1, kein Absturz)', () => {
    const result = run('2026-09-10')
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
    expect(result.stdout).toContain('ALTER DER BIBLIOTHEK')
    expect([0, 1]).toContain(result.status)
  })

  it('meldet Überfälliges mit Exit 1 — davon lebt der wöchentliche Lauf', () => {
    const result = run('2099-01-01')
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('überfällig')
  })
})
