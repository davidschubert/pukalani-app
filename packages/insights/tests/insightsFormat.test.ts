import { describe, expect, it } from 'vitest'
import { insightsCalendarDay, insightsDay, insightsDaysBetween } from '../app/utils/insightsFormat'

/**
 * DIE ANZEIGE-FORMATE (BI1 I3, Klick-Beweis 2026-09-10).
 *
 * Diese Datei gibt es, weil der Prototyp (I0) mit reinen Datums-Strings
 * gebaut war (`publishedAt: '2026-09-04'`), die echten Spalten aber
 * Appwrite-`datetime` sind und einen vollen Zeitstempel liefern. Auf jeder
 * öffentlichen Karte stand deshalb `2026-09-08T10:00:00.000+00:00` statt
 * „8. Sept. 2026" — sichtbar erst gegen echte Daten, unsichtbar für
 * Typecheck, Lint und jeden Test, der nur die Prototyp-Form kennt.
 *
 * DIE GEGENPROBE IST DER PUNKT: jeder Fall hat hier seinen Partner (voller
 * Zeitstempel ⇄ reines Datum, Unsinn ⇄ leer), sonst prüft der Test nur, dass
 * die Funktion nicht wirft.
 */
describe('insightsCalendarDay', () => {
  it('nimmt den UTC-Tag aus einem vollen Zeitstempel', () => {
    expect(insightsCalendarDay('2026-09-08T10:00:00.000+00:00')).toBe('2026-09-08')
    expect(insightsCalendarDay('2026-09-08T23:59:59.999Z')).toBe('2026-09-08')
  })

  it('lässt ein reines Datum unverändert', () => {
    expect(insightsCalendarDay('2026-09-08')).toBe('2026-09-08')
  })

  it('macht aus allem, was kein Datum ist, eine Leere — nie die Eingabe', () => {
    // Der alte Ausweg „gib die Eingabe zurück" war genau der Grund, warum der
    // rohe Zeitstempel auf der Seite landete: ein Fehler, der wie Absicht aussah.
    expect(insightsCalendarDay('')).toBe('')
    expect(insightsCalendarDay('demnächst')).toBe('')
    expect(insightsCalendarDay('08.09.2026')).toBe('')
  })
})

describe('insightsDay', () => {
  it('formatiert einen vollen Zeitstempel als Tag — nicht als Zeitstempel', () => {
    const formatted = insightsDay('2026-09-08T10:00:00.000+00:00', 'de')
    expect(formatted).not.toContain('T10:00')
    expect(formatted).toContain('2026')
    // Gegenprobe: dasselbe Ergebnis wie beim reinen Datum.
    expect(formatted).toBe(insightsDay('2026-09-08', 'de'))
  })

  it('rechnet in UTC — der Tag kippt nicht über die Zeitzone', () => {
    // 00:30 UTC ist in jeder westlichen Zone noch der Vortag; ohne feste Zone
    // stünde auf dem Server ein anderer Tag als im Browser (Hydrations-Fehler).
    expect(insightsDay('2026-09-08T00:30:00.000Z', 'de')).toBe(insightsDay('2026-09-08', 'de'))
  })

  it('bleibt bei einem leeren oder unlesbaren Wert leer', () => {
    expect(insightsDay('', 'de')).toBe('')
    expect(insightsDay('demnächst', 'de')).toBe('')
  })
})

describe('insightsDaysBetween', () => {
  it('zählt Tage auch zwischen vollen Zeitstempeln', () => {
    expect(insightsDaysBetween('2026-09-01T22:00:00.000Z', '2026-09-08')).toBe(7)
    // Gegenprobe: reine Datums-Strings ergeben dieselbe Zahl.
    expect(insightsDaysBetween('2026-09-01', '2026-09-08')).toBe(7)
  })

  it('wird nie negativ und bleibt bei Unsinn bei 0', () => {
    expect(insightsDaysBetween('2026-09-10', '2026-09-08')).toBe(0)
    expect(insightsDaysBetween('irgendwann', '2026-09-08')).toBe(0)
  })
})
