import type { BrandSessionState } from '../../shared/brandJourney'
import {
  BRAND_SLOTS,
  type BrandPathKind,
  type BrandSlot,
  type BrandStepKey,
  type BrandTeamKind,
  slotsForStep,
} from '../../shared/slotRegistry'
import { brandSlotPromptLabel } from './brandSlotPromptLabels'
import type { BrandSlotRecord } from './brandStore'
import type { BrandReviewDocumentEntry, BrandReviewSessionInfo } from './reviewPrompt'

/**
 * WAS DER SPEZIALIST ZU SEHEN BEKOMMT (BW2 Paket 4, Plan §7 „Eingaben").
 *
 * Diese Datei baut die vier Eingabe-Listen aus dem gelesenen Stand — und tut
 * sonst nichts: kein Anbieter, kein Schreibvorgang, keine Politik. Sie steht
 * neben `brandReview.ts` aus derselben Begründung, aus der `advisorGenerator`
 * neben den Routen steht: der TRANSPORT soll nicht wissen, wie man ein
 * Dokument zusammenlegt, und die ROUTE soll es nicht zweimal tun (der
 * Schliess-Aufruf und der Kapitel-Modus brauchen dieselben Listen).
 *
 * ── NUR BESTÄTIGTE WERTE (§8) ─────────────────────────────────────────────
 * „Geprüft wird nur gegen bestätigte Werte. Entwürfe sind keine Wahrheit."
 * Deshalb liest hier nichts `latestDraft` — ein Widerspruch zu etwas, dem
 * niemand zugestimmt hat, ist kein Widerspruch, und ein Chip darüber wäre eine
 * Sperre auf einen Text, den der Mensch im nächsten Zug ohnehin verwirft.
 *
 * ── MENSCHLICHE BESCHRIFTUNG, INHALTSSPRACHE ──────────────────────────────
 * Jede Zeile trägt Id UND Label. Die Id, weil das Modell sie in `slots`
 * zurückgeben MUSS (der Chip verlinkt darauf); das Label, weil ein Modell mit
 * nackten Ids Unsinn über „a.customerPraise" schreibt — derselbe Live-Fund vom
 * 2026-09-03, der schon den Gesprächs-Prompt umgestellt hat. Die Sprache ist
 * die des DOKUMENTS (`contentLocale`), nicht die der Seite: der Spezialist
 * liest das Brand-Dokument, und das ist einsprachig.
 */

/**
 * ALLE BESTÄTIGTEN WERTE ALLER KAPITEL, in Registry-Reihenfolge — das
 * Dokument, gegen das geprüft wird.
 *
 * Die Reihenfolge ist Absicht und nicht Kosmetik: das Modell liest die Marke
 * in der Reihenfolge, in der sie entstanden ist (Kontext vor Purpose vor
 * Werten), und ein Widerspruch zwischen zwei Feldern liest sich in dieser
 * Folge als das, was er ist — eine spätere Aussage, die einer früheren
 * widerspricht.
 */
export function brandReviewDocument(
  records: Readonly<Record<string, BrandSlotRecord>>,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): BrandReviewDocumentEntry[] {
  const entries: BrandReviewDocumentEntry[] = []
  for (const session of BRAND_SLOTS) {
    const confirmed = records[session.id]?.confirmed
    if (typeof confirmed !== 'string' || confirmed.length === 0) continue
    entries.push({
      slotId: session.id,
      label: brandSlotPromptLabel(session.id, contentLocale, pathKind, team),
      value: confirmed,
    })
  }
  return entries
}

/** Dieselben Zeilen, aber nur die EINES Kapitels (Kapitel-Modus, §5a). */
export function brandReviewChapter(
  records: Readonly<Record<string, BrandSlotRecord>>,
  stepKey: BrandStepKey,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): BrandReviewDocumentEntry[] {
  const own = new Set(slotsForStep(stepKey).map(session => session.id))
  return brandReviewDocument(records, contentLocale, pathKind, team).filter(entry => own.has(entry.slotId))
}

/**
 * DIE NOTIZEN DIESES KAPITELS (§4) — was frühere Sessions gelernt haben und
 * in kein Feld passte.
 *
 * Sie reisen IMMER mit, nicht nur wo `inputs.notes === 'chapter'` steht: jenes
 * Flag steuert Georges GESPRÄCHS-Prompt („darf diese Session die Notizen
 * mitlesen?"), der Spezialist dagegen prüft gegen alles, was das Kapitel über
 * sich weiss. Eine Notiz zurückzuhalten hiesse, ihn einen Widerspruch
 * übersehen zu lassen, den ein Mensch mit derselben Information gesehen hätte.
 */
export function brandReviewNotes(
  records: Readonly<Record<string, BrandSlotRecord>>,
  stepKey: BrandStepKey,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): BrandReviewDocumentEntry[] {
  const entries: BrandReviewDocumentEntry[] = []
  for (const session of slotsForStep(stepKey)) {
    const note = records[session.id]?.notes
    if (typeof note !== 'string' || note.trim().length === 0) continue
    entries.push({
      slotId: session.id,
      label: brandSlotPromptLabel(session.id, contentLocale, pathKind, team),
      value: note,
    })
  }
  return entries
}

/**
 * ALLE NOTIZEN DES BRANDINGS (Paket 7, §10: „der Spezialist liest ALLE Notizen
 * des Brandings beim Prüfblick").
 *
 * Dieselbe Form wie `brandReviewNotes`, nur ohne Kapitel-Grenze — und das ist
 * genau die Aussage des Prüfblicks: er sucht die Reibungen ZWISCHEN den
 * Kapiteln, und eine Notiz aus Kapitel A ist oft der Grund, aus dem etwas in
 * Kapitel E anders klingt. In REGISTRY-Reihenfolge, wie das Dokument selbst.
 */
export function brandReviewAllNotes(
  records: Readonly<Record<string, BrandSlotRecord>>,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): BrandReviewDocumentEntry[] {
  const entries: BrandReviewDocumentEntry[] = []
  for (const session of BRAND_SLOTS) {
    const note = records[session.id]?.notes
    if (typeof note !== 'string' || note.trim().length === 0) continue
    entries.push({
      slotId: session.id,
      label: brandSlotPromptLabel(session.id, contentLocale, pathKind, team),
      value: note,
    })
  }
  return entries
}

/**
 * DIE OFFENEN SESSIONS DIESES KAPITELS — die Menge, aus der `nextSession`
 * kommen darf (§6).
 *
 * `open` und nichts anderes: `locked` heisst „ihre Eingaben stehen noch
 * nicht", `done`/`stale` heissen „hier steht ein bestätigter Wert". Dieselbe
 * Bedingung prüft `pickNextSession` danach noch einmal gegen den Serverstand —
 * die Liste hier ist die Auswahl, die Prüfung ist die Durchsetzung.
 */
export function brandReviewOpenSessions(
  stepKey: BrandStepKey,
  sessionStates: Readonly<Record<string, BrandSessionState | undefined>>,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): { id: string, label: string }[] {
  return slotsForStep(stepKey)
    .filter(session => sessionStates[session.id] === 'open')
    .map(session => ({
      id: session.id,
      label: brandSlotPromptLabel(session.id, contentLocale, pathKind, team),
    }))
}

/** Der Massstab EINER Session — Ziel, Qualität, Anti-Muster, Form, Invarianten. */
export function brandReviewSessionInfo(
  session: BrandSlot,
  contentLocale: string,
  pathKind: BrandPathKind,
  team: BrandTeamKind,
): BrandReviewSessionInfo {
  return {
    id: session.id,
    label: brandSlotPromptLabel(session.id, contentLocale, pathKind, team),
    goal: session.goal,
    quality: session.quality,
    antiPatterns: session.antiPatterns,
    form: session.form,
    invariants: session.invariants,
  }
}
