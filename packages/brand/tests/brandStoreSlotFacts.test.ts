import { describe, expect, it } from 'vitest'
import type { BrandJourneyStep } from '../shared/brandJourney'
import { BRAND_DESIGN_STEP_KEYS, type BrandStepKey } from '../shared/slotRegistry'
import { resolveProfileProgress, toSlotFacts } from '../server/utils/brandStore'

/**
 * `toSlotFacts` MUSS rechnen wie die Anzeige (`brandSlotDisplayValue`:
 * latestDraft ?? firstDraft ?? confirmed) — nicht „gab es je einen Entwurf".
 *
 * Der Fall, der das erzwingt (live erwischt 2026-09-03, `b.mission`): ein
 * GELEERTES Feld (latestDraft `''`, firstDraft noch mit Text) zählte über den
 * firstDraft-Fallback als gefüllt. Die Journey (Server) meldete den Baustein
 * 10/10, die Live-Rechnung des offenen Bausteins (Client, aus dem Sichtbaren)
 * 9/10 — und der „Gesamtfortschritt" zeigte je nach Seite 20/59 oder 19/59.
 *
 * SEIT PAKET 3b REIST DER WERT MIT — und zwar in der SERVER-Rangfolge
 * (`brandSlotStoredValue`: bestätigt schlägt Entwurf), nicht in der
 * Anzeige-Rangfolge daneben. Beides steht bewusst in EINEM Objekt und bleibt
 * getrennt: `hasValue` beantwortet „bewegt sich der Balken?", `value` ist der
 * Stoff, aus dem `computeSourcesHash` rechnet. Wer sie gleichsetzt, bekommt
 * entweder den alten Fortschritts-Fehler zurück oder einen Hash, der den
 * ENTWURF für die Quelle hält.
 */
describe('toSlotFacts', () => {
  it('ein geleerter Entwurf zählt NICHT als gefüllt (Anzeige-Rangfolge)', () => {
    const facts = toSlotFacts({
      'b.mission': { firstDraft: 'x', latestDraft: '' },
    })
    // Der WERT bleibt trotzdem der gespeicherte (Server-Rangfolge) — sonst
    // rechnete der Hash mit einer leeren Quelle, sobald jemand ein Feld leert.
    expect(facts['b.mission']).toEqual({ hasValue: false, confirmed: false, value: 'x' })
  })

  it('Entwurf, Alt-Entwurf und reine Bestätigung zählen weiter', () => {
    const facts = toSlotFacts({
      draft: { latestDraft: 'neu' },
      first: { firstDraft: 'alt' },
      confirmedOnly: { confirmed: 'zugestimmt' },
    })
    expect(facts.draft).toEqual({ hasValue: true, confirmed: false, value: 'neu' })
    expect(facts.first).toEqual({ hasValue: true, confirmed: false, value: 'alt' })
    expect(facts.confirmedOnly).toEqual({ hasValue: true, confirmed: true, value: 'zugestimmt' })
  })

  it('Gegenprobe: leere Bestätigung ist weder Wert noch Zustimmung', () => {
    const facts = toSlotFacts({ empty: { confirmed: '' } })
    expect(facts.empty).toEqual({ hasValue: false, confirmed: false, value: '' })
  })
})

describe('toSlotFacts — die Flags der Finalen Abnahme (Paket 3b)', () => {
  it('reicht `accepted`/`deferred` NUR durch, wo sie gesetzt sind', () => {
    const facts = toSlotFacts({
      taken: { confirmed: 'ja', accepted: true },
      later: { deferred: true },
      plain: { latestDraft: 'x' },
    })
    expect(facts.taken).toMatchObject({ confirmed: true, accepted: true })
    expect(facts.later).toMatchObject({ deferred: true })
    // Ein leeres Flag ist keine Aussage — und ein `false` an 68 Feldern wäre
    // Rauschen in jeder Rechnung.
    expect(facts.plain).not.toHaveProperty('accepted')
    expect(facts.plain).not.toHaveProperty('deferred')
    expect(facts.taken).not.toHaveProperty('deferred')
  })

  it('trägt den gespeicherten `sourcesHash` weiter — er ist die Quelle von `stale`', () => {
    const facts = toSlotFacts({ hashed: { confirmed: 'ja', sourcesHash: 'abc' } })
    expect(facts.hashed).toMatchObject({ sourcesHash: 'abc' })
    // Ohne gespeicherten Hash gilt die Session als AKTUELL (Migrationsvertrag).
    expect(toSlotFacts({ old: { confirmed: 'ja' } }).old).not.toHaveProperty('sourcesHash')
  })
})

/**
 * DER FORTSCHRITTS-CACHE ZÄHLT DIE FOUNDATION (Brand Design D0).
 *
 * `resolveProfileProgress` füttert die Marken-Karte („Schritt 3 von 9",
 * Prozentwert) und den `currentStepKey`-Cache. Seit D0 liegen sechs weitere
 * Kapitel in der Journey; zählten sie mit, fiele der Wert jedes FERTIGEN
 * Brandings im Deploy-Moment unter 100 — und `currentStepKey` rutschte hinter
 * `result`, womit der „Euer Branding"-Einstieg auf `/dashboard/brands`
 * lautlos aufginge (Audit-Befund C4). Wie Schicht 2 gezählt wird, entscheidet
 * D1; bis dahin nagelt diese Prüfung fest, dass sie es NICHT tut.
 */
describe('resolveProfileProgress — Brand Design zählt (noch) nicht mit', () => {
  const step = (
    stepKey: BrandStepKey,
    state: BrandJourneyStep['state'],
    requiredTotal: number,
    requiredFilled: number,
  ): BrandJourneyStep => ({
    stepKey,
    state,
    reason: state === 'done' ? 'completed' : 'design_locked',
    optional: false,
    progress: { requiredTotal, requiredFilled, pct: 100 },
    missingRequired: [],
    confidence: null,
  })

  it('eine fertige Foundation steht auf 100 %, obwohl Schicht 2 gesperrt danebensteht', () => {
    const journey: BrandJourneyStep[] = [
      step('context', 'done', 11, 11),
      step('result', 'done', 2, 2),
      ...BRAND_DESIGN_STEP_KEYS.map(key => step(key, 'locked', 6, 0)),
    ]
    expect(resolveProfileProgress(journey))
      .toEqual({ progressPct: 100, currentStepKey: 'result' })
  })

  it('GEGENPROBE: ohne die Regel wäre es ein Drittel und der falsche Schritt', () => {
    // Dieselbe Rechnung über ALLE Kapitel — sie steht hier, damit die Zeile
    // oben nicht auch für eine Fassung grün wäre, die gar nichts filtert.
    const all = [
      { requiredTotal: 11, requiredFilled: 11 },
      { requiredTotal: 2, requiredFilled: 2 },
      ...BRAND_DESIGN_STEP_KEYS.map(() => ({ requiredTotal: 6, requiredFilled: 0 })),
    ]
    const total = all.reduce((sum, entry) => sum + entry.requiredTotal, 0)
    const filled = all.reduce((sum, entry) => sum + entry.requiredFilled, 0)
    expect(Math.round((filled / total) * 100)).toBe(27)
  })
})
