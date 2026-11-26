import { computed, type ComputedRef } from 'vue'
import type { BwLogCard, BwLogChapter } from '../components/BwWorkshopLog.vue'
import type { brandStepCompletion } from '../../shared/brandJourney'
import { countOpenFindings } from '../../shared/brandWorkspaceNav'
import {
  type BrandSlot,
  type BrandStepKey,
  slotIsConfirmable,
  slotsForStep,
} from '../../shared/slotRegistry'
import {
  brandSlotDisplayValue,
  brandSlotIsConfirmed,
} from '../../shared/brandAutosaveDiff'
import { type BrandSlotControls, brandLogCardAction } from '../../shared/brandSlotControls'
import type {
  BrandFindingDecisionResponse,
  BrandFindingView,
  BrandSlotView,
} from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DER LOG DER WERKSTATT: Kapitel-Sektionen, ihre Karten und die Befunde —
 * aus der Werkstatt-Seite geschnitten (WS1, Rest nach Bahn C).
 *
 * Reine Rechnung, kein eigener Zustand: alles hier liest den Store und die
 * Rechnungen, die die Seite mit der Bühne teilt (Karten des offenen Kapitels,
 * Kapitel-Stand, Beschriftungen). Die Seite reicht sie herein, statt dass sie
 * hier ein zweites Mal entstehen — sonst sagten Log und Bühne irgendwann
 * Verschiedenes über dasselbe Feld.
 */
export interface BrandWorkshopLogCardsInput {
  stepKey: ComputedRef<BrandStepKey | null>
  /** Der Kapitel-Stand aus Server-Sicht (`brandStepCompletion`). */
  completion: ComputedRef<ReturnType<typeof brandStepCompletion> | null>
  /** Bestätigungen, die noch zum Server unterwegs sind. */
  confirmsInFlight: ComputedRef<number>
  /** Die bedienbaren Karten des OFFENEN Kapitels (`slotCards` der Seite). */
  slotCards: ComputedRef<ReadonlyArray<{ slot: BrandSlot, controls: BrandSlotControls }>>
  activeSessionKey: ComputedRef<string>
  slotLabel: (slot: BrandSlot) => string
  slotNote: (slot: BrandSlot) => string
  slotDisplayValue: (slotId: string, value: string) => string
}

export function useBrandWorkshopLogCards(input: BrandWorkshopLogCardsInput) {
  const { stepKey, completion, confirmsInFlight, slotCards, activeSessionKey } = input
  const { slotLabel, slotNote, slotDisplayValue } = input
  const { t } = useI18n()
  const store = useBrandWorkspaceStore()

  function findingsForSlot(slotId: string): BrandFindingView[] {
    return store.findings.filter(finding => finding.slots.includes(slotId))
  }

  /**
   * DIE BEFUNDE DER AKTIVEN SESSION — der Chip auf der BÜHNE (§8, „im Log und in
   * beiden Sessions").
   *
   * Er steht EINMAL über dem Feld, unter der Session-Zeile. George hat den Befund
   * schon einmal ausgesprochen (Paket 4, `mentionedAt`); der Chip ist der
   * BLEIBENDE Weg, kein zweiter Chat-Text — ein Hinweis, der mit dem nächsten Zug
   * nach oben scrollt, ist nach drei Antworten weg.
   */
  const activeFindings = computed<BrandFindingView[]>(() =>
    (activeSessionKey.value ? findingsForSlot(activeSessionKey.value) : []))

  /**
   * EIN BEFUND WURDE ENTSCHIEDEN (§8). Der Store nimmt ihn aus der Liste und
   * übernimmt die `revision` — ein vollständiger Neuabruf des Kapitels wäre hier
   * der falsche Handgriff: `applyStepDetail` leert die gestreamten Züge, und der
   * Mensch stünde nach einem Klick auf einen Chip vor einem leeren Gespräch.
   */
  function findingDecided(decision: BrandFindingDecisionResponse): void {
    store.applyFindingDecision(decision)
  }

  /** Der Ersatztext einer leeren Karte — s. `BwLogCard.placeholder`. */
  function slotPlaceholder(slot: BrandSlot): string {
    return slotIsConfirmable(slot)
      ? t('brand.workspace.stage.pending')
      : t('brand.workspace.stage.pairsPlaceholder')
  }

  const logChapters = computed<BwLogChapter[]>(() => store.railSteps.map((entry) => {
    const current = entry.stepKey === stepKey.value
    const confirmed = current
      ? (completion.value?.confirmed ?? 0)
      : entry.progress.requiredTotal - entry.missingRequired.length
    const chapter = {
      stepKey: entry.stepKey,
      label: t(`brand.steps.${entry.stepKey}`),
      state: entry.state,
      confirmed,
      total: current ? (completion.value?.total ?? 0) : entry.progress.requiredTotal,
      optional: slotsForStep(entry.stepKey).filter(slot => !slot.required).length,
      current,
      findings: countOpenFindings(store.findings, entry.stepKey),
    }
    return { ...chapter, countLine: chapterCountLine(chapter) }
  }))

  /**
   * Der Name eines Karten-Knopfs für Hilfsmittel (UX-011): sichtbarer Text
   * ZUERST, dann das Feld — „Bestätigen: Gründungsimpuls".
   */
  function chapterCountLine(chapter: Omit<BwLogChapter, 'countLine'>): string {
    const values = { confirmed: chapter.confirmed, total: chapter.total, optional: chapter.optional }
    if (chapter.current) {
      const line = t(chapter.optional > 0 ? 'brand.workspace.log.confirmedOfOptional' : 'brand.workspace.log.confirmedOf', values)
      /**
       * NOCH UNTERWEGS (Kailua-Befund 3): der Zähler zeigt seit heute nur den
       * SERVER-Stand — ohne diesen Zusatz sähe der Klick auf „Bestätigen" für
       * einen Augenblick nach nichts aus, und das wäre die zweite Art zu lügen.
       */
      return confirmsInFlight.value > 0
        ? `${line} · ${t('brand.workspace.log.confirmSaving', { count: confirmsInFlight.value })}`
        : line
    }
    return t(chapter.optional > 0 ? 'brand.workspace.log.countOptional' : 'brand.workspace.log.count', values)
  }

  /**
   * EINE KARTE IM LOG (`BwWorkshopLog`). Für das LAUFENDE Kapitel kommt sie aus
   * `slotCards` (voll bedienbar); für ein anderes Kapitel aus einem eigenen,
   * LESENDEN Abruf derselben GET-Route, den der Log beim Aufklappen macht und
   * hier hereinreicht (`loaded`) — der Store darf dafür nicht benutzt werden,
   * denn `applyStepDetail` würde den offenen Baustein ersetzen.
   *
   * Ein fremdes Kapitel wird beim AUFKLAPPEN gelesen, nicht auf Vorrat: neun
   * Abrufe beim Betreten der Werkstatt wären neun Anfragen für etwas, das
   * niemand aufgeschlagen hat. FAIL-SOFT — bleibt der Abruf aus, ist die
   * Sektion eben leer.
   */
  function chapterCards(chapter: BwLogChapter, loaded: Record<string, BrandSlotView> | undefined): BwLogCard[] {
    if (chapter.current) {
      return slotCards.value.map(entry => ({
        id: entry.slot.id,
        label: slotLabel(entry.slot),
        note: slotNote(entry.slot),
        value: store.slotValue(entry.slot.id),
        display: slotDisplayValue(entry.slot.id, store.slotValue(entry.slot.id)),
        confirmed: entry.controls.state === 'confirmed',
        placeholder: slotPlaceholder(entry.slot),
        controls: entry.controls,
        action: brandLogCardAction({
          confirmed: entry.controls.state === 'confirmed',
          hasValue: store.slotValue(entry.slot.id).trim().length > 0,
          askable: entry.slot.type === 'question' || entry.slot.type === 'choice',
          confirmable: slotIsConfirmable(entry.slot),
          generatable: entry.slot.generator !== 'none',
        }),
        findings: findingsForSlot(entry.slot.id),
        reviewNotes: store.sessions[entry.slot.id]?.notes ?? '',
        missing: store.sessions[entry.slot.id]?.missing ?? [],
        // Ohne Session-Stand gilt „geprüft": ein Etikett „noch nicht
        // gegengelesen" an einem Feld, über das wir nichts wissen, wäre eine
        // Behauptung statt einer Auskunft.
        reviewed: store.sessions[entry.slot.id]?.reviewed !== false,
      }))
    }
    if (!loaded) return []
    return slotsForStep(chapter.stepKey as BrandStepKey).map(slot => ({
      id: slot.id,
      label: slotLabel(slot),
      note: slotNote(slot),
      value: brandSlotDisplayValue(loaded[slot.id]),
      display: slotDisplayValue(slot.id, brandSlotDisplayValue(loaded[slot.id])),
      confirmed: brandSlotIsConfirmed(loaded[slot.id]),
      placeholder: slotPlaceholder(slot),
      controls: null,
      // Fremdes Kapitel: die Karte ist eine Auskunft, kein Bedienfeld (s. `action`).
      action: 'none' as const,
      findings: findingsForSlot(slot.id),
      // Notizen und Prüf-Stand stehen in der `sessions`-Karte, und die gibt es
      // nur für das OFFENE Kapitel — der lesende Abruf holt bewusst nur Slots.
      reviewNotes: '',
      missing: [],
      reviewed: true,
    }))
  }

  return { findingsForSlot, activeFindings, findingDecided, logChapters, chapterCards }
}
