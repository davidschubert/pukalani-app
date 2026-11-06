import { BRAND_DIRECTIONS_VERSION, brandDirectionById } from '../../shared/brandDirections'
import {
  type BrandFoundationDesignInput,
  type BrandFoundationView,
  buildBrandFoundation,
} from '../../shared/brandFoundation'
import type { BrandJourneyStep } from '../../shared/brandJourney'
import { type BrandStepKey, isBrandDesignStep } from '../../shared/slotRegistry'
import { type BrandProfileRow, type BrandStepRow, confirmedSlotValues, toStoryView } from './brandStore'

/**
 * DIE LESEANSICHT DES FUNDAMENTS AUS LIVE-WERTEN — EINE Stelle für BOOK UND
 * KIT (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6, Paket K4).
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * Bis K3 stand diese Rechnung zweimal da: einmal in `foundation.get.ts` (die
 * Leseansicht) und einmal als `brandKitFoundationView` in `brandKit.ts`
 * (`brand.md`, `brand.json`, README). Beide legten die bestätigten Werte in
 * die Form des `BrandShareSnapshot`, beide holten die gewählte Richtung von
 * aussen, beide entschieden, welche Kapitel des Weges hineindürfen — und sie
 * entschieden es BEREITS UNTERSCHIEDLICH: die Route übersprang die Kapitel der
 * dritten Schicht, das Kit nicht (K3 hat den Unterschied im Kopf jener Datei
 * ausdrücklich begründet und auf K4 vertagt).
 *
 * Genau dieser Unterschied ist mit K4 nicht mehr harmlos: sobald der Renderer
 * für `nomenclature`, `aiguide` und `presskit` Blöcke baut, zeigte die eine
 * Ansicht sie und die andere nicht — dieselbe Marke, zwei Handbücher. §2.6
 * sagt dazu „`brand.md` liest DIESELBE Ansicht wie das Book"; ab hier ist das
 * kein Vorsatz mehr, sondern derselbe Funktionsaufruf.
 *
 * ── SIE LÄDT NICHTS ──────────────────────────────────────────────────────
 * Profil, Kapitel-Zeilen, Journey und Preset kommen als Argumente herein: die
 * beiden Aufrufer haben sie ohnehin (Besitz-Prüfung, Schranke, Zähler), und
 * ein eigener Ladeweg wäre eine zweite Wahrheit über dieselben Zeilen. Damit
 * bleibt sie PUR genug, um im Test ohne Instanz zu laufen.
 *
 * ── ZWEI AUSLASSUNGEN, BEIDE MIT GRUND ───────────────────────────────────
 * ÜBERSPRUNGENE Kapitel fallen heraus (sie sind nicht, was diese Marke IST,
 * §2.2), und die sechs DESIGN-Kapitel ebenfalls: ihr Ergebnis reist als
 * PRESET, ihre rohen Werte sind Vokabular-Ids und Hex-Töne, aus denen der
 * Renderer nichts baut. Die Kapitel der SCHICHT 3 werden NICHT übersprungen —
 * ihre Werte sind Text, und sie füllen fünf Kapitel-Anker (§2.5).
 */
export interface BrandFoundationViewInput {
  readonly profile: BrandProfileRow
  readonly stepRows: readonly BrandStepRow[]
  /** Der Weg dieser Marke — `resolveBrandJourney` über denselben Zeilen. */
  readonly journey: readonly BrandJourneyStep[]
  /**
   * Das Ergebnis von Brand Design — `null`, solange Schicht 2 nicht steht.
   * Beide Fassungen passen hinein (die Route reicht das volle Preset durch,
   * das Kit die Snapshot-Fassung ohne Entwürfe); der Renderer macht daraus
   * ohnehin die Snapshot-Fassung.
   */
  readonly design: BrandFoundationDesignInput | null
  /**
   * DIE SCHRANKE DER SCHICHT 3 (K1/K4, §2.8) — `resolveDerivationAccess`
   * (Beta ODER Feld), gerechnet vom Aufrufer.
   *
   * Sie ist PFLICHT und hat keinen Vorgabewert: ein stilles `false` nähme
   * jedem Beta-Konto die drei Anwendungs-Kapitel aus dem eigenen Handbuch,
   * ohne dass irgendwo etwas rot wird — dieselbe Begründung wie bei
   * `BrandSnapshotOptions.betaAccount`.
   */
  readonly derivationUnlocked: boolean
}

/** Die bestätigten Werte der Kapitel, die auf dem Weg dieser Marke liegen. */
function chapterValues(
  journey: readonly BrandJourneyStep[],
  stepRows: readonly BrandStepRow[],
): { stepKey: BrandStepKey, slots: { slotId: string, value: string }[] }[] {
  const byStepKey = new Map(stepRows.map(row => [row.stepKey, row]))
  const values: { stepKey: BrandStepKey, slots: { slotId: string, value: string }[] }[] = []
  for (const entry of journey) {
    if (entry.state === 'skipped') continue
    if (isBrandDesignStep(entry.stepKey)) continue
    const row = byStepKey.get(entry.stepKey)
    values.push({ stepKey: entry.stepKey, slots: row ? confirmedSlotValues(row) : [] })
  }
  return values
}

export function buildBrandFoundationView(input: BrandFoundationViewInput): BrandFoundationView {
  const values = chapterValues(input.journey, input.stepRows)

  /**
   * DIE GEWÄHLTE RICHTUNG kommt von AUSSEN und nicht aus den Werten:
   * `result.direction` ist `audience: 'internal'` und fiele durch das eine Tor
   * des Renderers (`isBrandSlotShareable`). Ohne Preset ist sie das, was
   * Kapitel 10 überhaupt zeigen kann; mit Preset tritt sie zurück (D8). Nur
   * eine Id, die der Katalog KENNT, reist weiter — stünde hier ein von Hand
   * korrigierter Freitext, ginge er als roher Wert an genau dem Tor vorbei,
   * das die Leseansicht ausmacht.
   */
  const chosen = values
    .find(chapter => chapter.stepKey === 'result')?.slots
    .find(slot => slot.slotId === 'result.direction')?.value ?? ''
  const direction = brandDirectionById(chosen.trim())

  return buildBrandFoundation({
    title: input.profile.title ?? '',
    contentLocale: input.profile.contentLocale,
    story: toStoryView(input.profile).body,
    chapters: values,
    pathKind: input.profile.pathKind === 'relaunch' ? 'relaunch' : 'new',
    team: input.profile.team === 'team' ? 'team' : 'solo',
    derivationUnlocked: input.derivationUnlocked,
    ...(direction
      ? { direction: { id: direction.id, version: String(BRAND_DIRECTIONS_VERSION) } }
      : {}),
    ...(input.design ? { design: input.design } : {}),
  })
}
