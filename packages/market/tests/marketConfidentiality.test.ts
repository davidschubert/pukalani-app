import { describe, expect, it } from 'vitest'
import type { BrandShareSnapshot } from '../../brand/shared/types/brand'
import { brandShareableSlotValues, isBrandSlotShareable } from '../../brand/shared/brandSharing'
import { BRAND_FINDING_KINDS } from '../../brand/shared/brandFindings'
import {
  MARKET_COMPETITORS_TABLE,
  MARKET_PROFILES_TABLE,
  MARKET_REPORTS_TABLE,
} from '../shared/types/market'

/**
 * VERTRAULICHKEIT — DIE ZUSAGE AUS §1.7 Nr. 6 / §2.9 Nr. 7, GEPRÜFT VON DER
 * SEITE, DIE SIE GEGEBEN HAT (MV1 M5).
 *
 * „Vertraulich wie `a.competitors`: Marktprofile und Berichte reisen nicht per
 * Share-Link und nicht ins Dokument-Export (Sensitivity `internal`)."
 *
 * ── WARUM DIESER TEST IM market-LAYER STEHT UND NICHT IN brand ────────────
 * Weil hier die Zusage gemacht wurde. `brand` hat mit `brandSharing.ts` seine
 * eigene Prüfung (dort steht die Regel); dieser Test hält den SATZ des
 * Marktvergleichs gegen sie — er wird rot, wenn jemand `a.competitors` wieder
 * öffentlich macht, und dann ist nicht ein brand-Test falsch, sondern eine
 * Aussage in DIESEM Plan.
 *
 * ── WAS DIE VIER ZEILEN DES SATZES SIND ───────────────────────────────────
 * Kandidaten, Marktprofile, Berichte, Befunde der Art `market`. Für die
 * ersten drei gilt: sie haben gar keinen Weg in einen Snapshot — das ist die
 * stärkste Form der Zusage und wird hier als FORM festgenagelt, damit sie es
 * bleibt. Für die vierte gilt dasselbe aus demselben Grund: der Snapshot trägt
 * überhaupt keine Befunde.
 */

/**
 * EIN VOLLSTÄNDIG BESETZTER SNAPSHOT. Die Zuweisung an `BrandShareSnapshot`
 * ist der eigentliche Wächter: käme ein PFLICHTfeld dazu (etwa `findings`),
 * bricht schon `pnpm -r typecheck` an dieser Stelle — und zwar hier im
 * market-Layer, also genau bei dem, der die Zusage gegeben hat.
 *
 * Die Schlüssel werden DARAUS gelesen und nicht daneben abgetippt: eine zweite
 * Liste im Test wäre eine Tautologie („meine Liste enthält nicht, was ich
 * nicht hineingeschrieben habe") und würde eine Erweiterung nie bemerken.
 */
const SNAPSHOT: BrandShareSnapshot = {
  schemaVersion: 1,
  title: '',
  contentLocale: 'de',
  story: '',
  chapters: [],
  presetId: '',
  presetVersion: '',
}

describe('Markt-Daten reisen nicht per Share-Link', () => {
  it('der Snapshot trägt genau die sieben bekannten Felder', () => {
    expect(Object.keys(SNAPSHOT).sort()).toEqual([
      'chapters', 'contentLocale', 'presetId', 'presetVersion', 'schemaVersion', 'story', 'title',
    ])
  })

  it('KEIN Feld für Befunde — auch nicht für die Art `market`', () => {
    // `market` IST eine gültige Befund-Art (seit M3, Migration brand-018);
    // die Gegenprobe steht daneben: gültig UND ohne Weg in den Snapshot, weil
    // der überhaupt keine Befunde kennt.
    expect(BRAND_FINDING_KINDS).toContain('market')
    expect(Object.keys(SNAPSHOT)).not.toContain('findings')
  })

  it('kein Snapshot-Feld heisst nach einer der drei market-Tabellen', () => {
    const keys = Object.keys(SNAPSHOT).map(key => key.toLowerCase())
    for (const table of [MARKET_COMPETITORS_TABLE, MARKET_PROFILES_TABLE, MARKET_REPORTS_TABLE]) {
      const noun = table.replace('market_', '')
      expect(keys.some(key => key.includes(noun)), `${table} hätte ein Feld`).toBe(false)
    }
  })
})

describe('der Massstab der Zusage hält', () => {
  it('`a.competitors` reist NICHT — sonst hätte „vertraulich wie a.competitors" keine Bedeutung', () => {
    expect(isBrandSlotShareable('a.competitors')).toBe(false)
  })

  it('GEGENPROBE: ein öffentliches Feld reist sehr wohl — der Filter ist keine Attrappe', () => {
    expect(isBrandSlotShareable('b.purpose')).toBe(true)
  })

  it('ein Wettbewerber-Name aus dem Kontext-Kapitel überlebt das Veröffentlichen nicht', () => {
    const shared = brandShareableSlotValues([
      { slotId: 'a.competitors', value: 'Kona Trading, Upcountry Roast' },
      { slotId: 'b.purpose', value: 'Wir rösten Kaffee für Leute mit wenig Zeit.' },
    ])
    expect(JSON.stringify(shared)).not.toContain('Kona Trading')
    expect(JSON.stringify(shared)).toContain('Wir rösten Kaffee')
  })
})
