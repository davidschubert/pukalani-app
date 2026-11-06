import { resolveBrandJourney } from '../../shared/brandJourney'
import type { BrandCheckJudgeDocumentField } from './brandCheckJudge'
import { brandSlotPromptLabel } from './brandSlotPromptLabels'
import {
  type BrandProfileRow,
  type BrandStepRow,
  confirmedSlotValues,
  profileFacts,
  toStepFacts,
} from './brandStore'

/**
 * DAS MATERIAL DES DOKUMENT-CHECKS (BRAND-CHECK-SEITE §5b) — die BESTÄTIGTEN
 * Feldwerte des Fundaments, beschriftet und in Kapitel-Reihenfolge.
 *
 * ── NUR BESTÄTIGTES, UND ZWAR DIESELBE REGEL WIE IM DOKUMENT ──────────────
 * `confirmedSlotValues` ist wörtlich die Lese-Regel der Dokument-Seite
 * (`/api/brand/profiles/:id/document`): ein Entwurf ist etwas, das George
 * vorgeschlagen hat, ein bestätigter Wert etwas, das ein Mensch gesagt hat.
 * Ein Check über Entwürfe würde eine Marke danach benoten, was ein Modell
 * über sie geraten hat — und der ganze Check steht dafür, das nicht zu tun.
 *
 * ── ÜBERSPRUNGENE KAPITEL STEHEN NICHT DRIN ──────────────────────────────
 * Dieselbe Regel wie im Dokument (§10): es zählt, was diese Marke IST, nicht
 * was sie hätte sein können. Ein abgewähltes Naming hat Daten — es gehört nur
 * nicht zum Weg.
 *
 * ── DIE BESCHRIFTUNG IST DIE FRAGE, NICHT DIE SLOT-ID ────────────────────
 * `brandSlotPromptLabel` in der INHALTSSPRACHE der Marke, wie überall im
 * Prompt-Aufbau (Davids Live-Fund vom 2026-09-03: George sprach sonst
 * `a.customerPraise` im Chat nach). Ein Beleg, der eine interne Id zitiert,
 * wäre auf der Ergebnis-Seite unlesbar.
 */
export function brandDocumentCheckFields(
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  /** Die Beta-Tatsache des Aufrufers (K1) — s. `profileFacts`. */
  betaAccount: boolean,
): BrandCheckJudgeDocumentField[] {
  const facts = profileFacts(profile, betaAccount)
  const journey = resolveBrandJourney(facts, toStepFacts(stepRows))
  const contentLocale = profile.contentLocale || 'de'

  const fields: BrandCheckJudgeDocumentField[] = []
  for (const step of journey) {
    if (step.state === 'skipped') continue
    const row = stepRows.find(candidate => candidate.stepKey === step.stepKey)
    if (!row) continue
    for (const entry of confirmedSlotValues(row)) {
      fields.push({
        label: brandSlotPromptLabel(entry.slotId, contentLocale, facts.pathKind, facts.team),
        value: entry.value,
      })
    }
  }
  return fields
}
