import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BASELINE_FIELDS, baselineDrift, checkStageBaseline, driftText, stageBaseline } from '../../../scripts/buehne/baseline.mjs'
import { AppwriteRestError } from '../../../scripts/lib/probe-stage.mjs'

/**
 * DER SOLL-STAND DER BÜHNE (`scripts/buehne/baseline.mjs`, 2026-11-21).
 *
 * Anlass: ein Beweis-Skript ließ beide Probe-Communities ohne Plan zurück; rot
 * wurde im nächtlichen Lauf 40 Skripte später ein Browser-Test, dem
 * Menüpunkte fehlten. Seitdem vergleicht der Läufer nach jedem Skript die
 * zwei Zeilen mit dem, was `pnpm buehne up` zugesagt hat. Geprüft wird hier
 * ohne Netz: die Regel, das Zurückstellen, und dass Läufer und E2E-Befehl sie
 * wirklich aufrufen.
 */
const REPO = join(__dirname, '..', '..', '..')

// Ein Stand wie aus `pnpm buehne up` — nur die Felder, die zählen.
const state = {
  controlDatabaseId: 'main',
  communities: {
    a: { communityId: 'buehneax', plan: 'pro', audience: 'public', openRegistration: false },
    b: { communityId: 'buehnebx', plan: 'pro', audience: 'public', openRegistration: true },
  },
}
// So gibt Appwrite eine frisch angelegte Zeile zurück: nie gesetzte Spalten sind `null`.
const rowA = { status: 'active', plan: 'pro', audience: 'public', openRegistration: false, suspension: null }
const rowB = { status: 'active', plan: 'pro', audience: 'public', openRegistration: true, suspension: null }

function fakeControl(rows: Record<string, Record<string, unknown> | Error>) {
  const updates: Array<{ rowId: string, data: Record<string, unknown> }> = []
  return {
    updates,
    getRow: async (_db: string, _table: string, rowId: string) => {
      const row = rows[rowId]
      if (!row) throw new AppwriteRestError(404, 'row_not_found', 'fehlt')
      if (row instanceof Error) throw row
      return row
    },
    updateRow: async (_db: string, _table: string, rowId: string, data: Record<string, unknown>) => {
      updates.push({ rowId, data })
    },
  }
}

describe('Soll-Stand aus dem Stand der Bühne', () => {
  it('je Community: aktiv, der Plan und das Publikum aus `up`, keine Sperre', () => {
    expect(stageBaseline(state)).toEqual([
      { letter: 'A', communityId: 'buehneax', soll: { status: 'active', plan: 'pro', audience: 'public', openRegistration: false, suspension: '' } },
      { letter: 'B', communityId: 'buehnebx', soll: { status: 'active', plan: 'pro', audience: 'public', openRegistration: true, suspension: '' } },
    ])
  })

  it('ohne Stand gibt es nichts zu prüfen', () => {
    expect(stageBaseline(null)).toEqual([])
  })
})

describe('Abweichung erkennen', () => {
  const soll = stageBaseline(state)[1]!.soll

  it('die frische Zeile weicht nicht ab — eine nie gesetzte Sperre ist `null`, das Soll sagt leer', () => {
    expect(baselineDrift(soll, rowB)).toEqual([])
    expect(baselineDrift(soll, { ...rowB, suspension: '' })).toEqual([])
  })

  it('der Fall vom 2026-11-21: der Plan steht nicht mehr auf pro', () => {
    // Appwrite füllt eine auf `null` gesetzte Plan-Spalte mit ihrer Vorgabe.
    expect(baselineDrift(soll, { ...rowB, plan: 'free' }).map(entry => driftText('B', entry))).toEqual(['B plan free statt pro'])
    expect(baselineDrift(soll, { ...rowB, plan: null }).map(entry => driftText('B', entry))).toEqual(['B plan (leer) statt pro'])
  })

  it('jedes Soll-Feld zählt, auch ein `false`, und sonst keines', () => {
    const changed = { status: 'disabled', plan: 'basic', audience: 'members', openRegistration: false, suspension: 'billing', name: 'anders', theme: 'x' }
    expect(baselineDrift(soll, changed).map(entry => entry.field)).toEqual(BASELINE_FIELDS)
    const sollA = stageBaseline(state)[0]!.soll
    expect(baselineDrift(sollA, { ...rowA, openRegistration: true }).map(entry => driftText('A', entry))).toEqual(['A openRegistration true statt false'])
  })
})

describe('Prüfen und zurückstellen', () => {
  it('im Soll-Stand: keine Abweichung, kein Schreibzugriff', async () => {
    const control = fakeControl({ buehneax: rowA, buehnebx: rowB })
    expect(await checkStageBaseline({ control, databaseId: 'main', state })).toEqual({ drift: [], repaired: false, unreadable: [] })
    expect(control.updates).toEqual([])
  })

  it('zurückgestellt werden NUR die abweichenden Felder der abweichenden Zeile', async () => {
    const control = fakeControl({ buehneax: rowA, buehnebx: { ...rowB, plan: 'free', suspension: 'billing' } })
    const result = await checkStageBaseline({ control, databaseId: 'main', state })
    expect(result).toEqual({ drift: ['B plan free statt pro', 'B suspension billing statt (leer)'], repaired: true, unreadable: [] })
    expect(control.updates).toEqual([{ rowId: 'buehnebx', data: { plan: 'pro', suspension: '' } }])
  })

  it('`repair: false` meldet nur', async () => {
    const control = fakeControl({ buehneax: { ...rowA, plan: 'free' }, buehnebx: rowB })
    const result = await checkStageBaseline({ control, databaseId: 'main', state, repair: false })
    expect(result).toEqual({ drift: ['A plan free statt pro'], repaired: false, unreadable: [] })
    expect(control.updates).toEqual([])
  })

  it('eine fehlende Zeile ist eine Abweichung, ein Lesefehler nicht', async () => {
    const control = fakeControl({ buehnebx: new AppwriteRestError(500, 'general_unknown', 'Störung') })
    expect(await checkStageBaseline({ control, databaseId: 'main', state })).toEqual({ drift: ['A fehlt'], repaired: false, unreadable: ['B'] })
  })
})

describe('Läufer und E2E-Befehl rufen die Prüfung auf', () => {
  const run = readFileSync(join(REPO, 'scripts/buehne/run.mjs'), 'utf8')
  const e2e = readFileSync(join(REPO, 'scripts/buehne/e2e.mjs'), 'utf8')

  it('der Läufer prüft nach jedem Skript, und eine Abweichung macht das Skript rot', () => {
    expect(run).toContain('const stage = await stageCheck()')
    expect(run).toMatch(/const ok = passed && leftovers\.length === 0 && stage\.drift\.length === 0/)
  })

  it('der E2E-Befehl stellt den Soll-Stand her, BEVOR Playwright startet', () => {
    const check = e2e.indexOf('await checkStageBaseline(')
    const playwright = e2e.indexOf('await runPlaywright(')
    expect(check).toBeGreaterThan(-1)
    expect(playwright).toBeGreaterThan(check)
  })
})
