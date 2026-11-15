import { describe, expect, it } from 'vitest'
import { canReadBrandCheck } from '../server/utils/brandCheckVisibility'

/**
 * WER EIN CHECK-ERGEBNIS LESEN DARF — die Regel als Tabelle (SEC-014).
 *
 * Ein Website-Check urteilt über eine öffentlich erreichbare Startseite und
 * ist teilbar. Ein Dokument-Check urteilt über eine nicht veröffentlichte
 * Brand Foundation: ihn sieht nur die Besitzerin — oder jeder, wenn sie ihn
 * ins Ranking gegeben hat. Ausgeblendet schlägt alles.
 */
describe('canReadBrandCheck', () => {
  it('Dokument, fremd, ohne Häkchen ⇒ nein', () => {
    expect(canReadBrandCheck({ source: 'document', rankingOptIn: false, hidden: false, erased: false, isOwner: false })).toBe(false)
  })

  it('Dokument, Besitzerin ⇒ ja', () => {
    expect(canReadBrandCheck({ source: 'document', rankingOptIn: false, hidden: false, erased: false, isOwner: true })).toBe(true)
  })

  it('Dokument mit Ranking-Häkchen ⇒ ja, auch für Fremde', () => {
    expect(canReadBrandCheck({ source: 'document', rankingOptIn: true, hidden: false, erased: false, isOwner: false })).toBe(true)
  })

  it('Website ⇒ ja, unabhängig von Besitz und Häkchen', () => {
    for (const isOwner of [true, false]) {
      for (const rankingOptIn of [true, false]) {
        expect(canReadBrandCheck({ source: 'website', rankingOptIn, hidden: false, erased: false, isOwner })).toBe(true)
      }
    }
  })

  it('ausgeblendet ⇒ immer nein', () => {
    for (const source of ['website', 'document'] as const) {
      for (const isOwner of [true, false]) {
        for (const rankingOptIn of [true, false]) {
          expect(canReadBrandCheck({ source, rankingOptIn, hidden: true, erased: false, isOwner })).toBe(false)
        }
      }
    }
  })

  it('gelöscht (Konto oder Marke, SEC-015) ⇒ immer nein, auch für die Besitzerin', () => {
    for (const source of ['website', 'document'] as const) {
      for (const isOwner of [true, false]) {
        for (const rankingOptIn of [true, false]) {
          expect(canReadBrandCheck({ source, rankingOptIn, hidden: false, erased: true, isOwner })).toBe(false)
        }
      }
    }
  })
})
