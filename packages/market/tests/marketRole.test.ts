import { describe, expect, it } from 'vitest'
import type { MarketCompetitor } from '../shared/marketProfile'
import {
  MARKET_CANDIDATE_ROLES,
  marketFieldCandidates,
  marketIsSelfCandidate,
} from '../shared/marketProfile'
import { resolveMarketPaywall } from '../shared/marketPaywall'

/**
 * DIE ROLLE EINES KANDIDATEN (MV1 M4, Plan §7.2 Nr. 2) — pur geprüft.
 *
 * Die Regel „`self` ist kein Teil des Feldes" hat vier Leser (Deckel,
 * Modell-Eingabe, Matrix, Quoten) und lebt deshalb in EINER Funktion. Genau
 * die wird hier festgenagelt — mit Gegenprobe an jeder Stelle: eine Funktion,
 * die ALLES herausfiltert, bestünde die halbe Prüfung ebenso.
 */

function competitor(id: string, role?: 'competitor' | 'self'): MarketCompetitor {
  return {
    id,
    name: id,
    url: `https://${id}.example/`,
    status: 'fetched',
    ...(role ? { role } : {}),
  }
}

describe('marketIsSelfCandidate', () => {
  it('fehlende Rolle heisst Wettbewerber — der Bestand aus M1–M3', () => {
    expect(marketIsSelfCandidate({})).toBe(false)
    expect(marketIsSelfCandidate({ role: 'competitor' })).toBe(false)
  })

  it('erkennt die eigene alte Website', () => {
    expect(marketIsSelfCandidate({ role: 'self' })).toBe(true)
  })
})

describe('marketFieldCandidates', () => {
  it('nimmt die eigene alte Website aus dem Feld', () => {
    const list = [competitor('a'), competitor('alt', 'self'), competitor('b', 'competitor')]
    expect(marketFieldCandidates(list).map(entry => entry.id)).toEqual(['a', 'b'])
  })

  it('GEGENPROBE: ohne `self` bleibt die Liste unverändert', () => {
    const list = [competitor('a'), competitor('b', 'competitor')]
    expect(marketFieldCandidates(list)).toHaveLength(2)
  })

  it('der Fünfer-Deckel zählt nur das Feld (§2.9 Nr. 8)', () => {
    const list = [
      competitor('1'), competitor('2'), competitor('3'), competitor('4'), competitor('5'),
      competitor('alt', 'self'),
    ]
    // Sechs Zeilen, aber fünf Wettbewerber — genau deshalb darf die Abfrage
    // eine Zeile mehr holen als der Deckel erlaubt.
    expect(list).toHaveLength(6)
    expect(marketFieldCandidates(list)).toHaveLength(5)
  })

  it('kennt genau zwei Rollen', () => {
    expect([...MARKET_CANDIDATE_ROLES]).toEqual(['competitor', 'self'])
  })
})

/**
 * DIE SCHRANKE (§1.9) — beide Zustände, weil heute nur einer vorkommt.
 *
 * Der einzige Weg auf die Seite führt über das Beta-Gate; wer sie sieht, ist
 * freigeschaltet. Der gesperrte Zweig ist trotzdem eine Tatsache und kein
 * toter Code — der Test ist der Beleg dafür (Begründung im Kopf von
 * `shared/marketPaywall.ts`).
 */
describe('resolveMarketPaywall', () => {
  it('Beta-Konto ⇒ frei, mit benannter Herkunft', () => {
    expect(resolveMarketPaywall({ betaAccess: true, derivationUnlocked: false }))
      .toEqual({ unlocked: true, grant: 'beta' })
  })

  it('GEGENPROBE: ohne Beta-Zugang UND ohne Ableitung steht die Schranke', () => {
    expect(resolveMarketPaywall({ betaAccess: false, derivationUnlocked: false }))
      .toEqual({ unlocked: false, grant: 'none' })
  })

  /**
   * DIE ZWEITE EINGABE (BK1 K1, BS1 §4.1 b): die Ableitung gehört der MARKE
   * und trägt allein — das ist der Weg jedes Kaufs ab BS1 Z1, wenn es keine
   * Beta mehr gibt.
   */
  it('Ableitung freigeschaltet ⇒ frei, auch ohne Beta-Konto', () => {
    expect(resolveMarketPaywall({ betaAccess: false, derivationUnlocked: true }))
      .toEqual({ unlocked: true, grant: 'derivation' })
  })

  it('beides ⇒ frei; die Herkunft nennt die Beta (sie trägt schon für sich)', () => {
    expect(resolveMarketPaywall({ betaAccess: true, derivationUnlocked: true }))
      .toEqual({ unlocked: true, grant: 'beta' })
  })
})
