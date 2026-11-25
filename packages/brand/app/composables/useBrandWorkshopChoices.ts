import { computed, type ComputedRef, type Ref, ref, watch } from 'vue'
import type { BwChoiceCard } from '../components/BwChoiceCards.vue'
import type { BwDirectionChoice } from '../components/BwWorkshopLog.vue'
import {
  BRAND_STAGE_CHOICE_SLOTS,
  brandChoiceContract,
} from '../../shared/brandChoiceOptions'
import {
  brandDirectionById,
  suggestBrandDirections,
} from '../../shared/brandDirections'
import { type BrandSlot, slotById } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE AUSWAHL-KARTEN DER WERKSTATT — aus der Werkstatt-Seite geschnitten
 * (WS1, Rest nach Bahn C).
 *
 * Text-Karten eines geschlossenen Vertrags, die drei Richtungen (G4) und die
 * eigene Formulierung. Geantwortet wird über den EINEN Sende-Pfad der Seite
 * (`answerFromGeorge`, `useBrandWorkshopComposer`) — die Seite reicht ihn
 * herein, hier entsteht kein zweiter. Der einzige Zustand ist `ownChoice`;
 * er lag vorher als Ref in der Seite und liegt jetzt hier, nirgends sonst.
 */
export interface BrandWorkshopChoicesInput {
  nextSlot: ComputedRef<BrandSlot | null>
  conversationPending: Ref<boolean>
  answerFromGeorge: (said: string) => Promise<void>
}

/** Die eine Session, die statt Text-Karten eine Farbwelt zeigt (Paket G4). */
const DIRECTION_SLOT = 'result.direction'

export function useBrandWorkshopChoices(input: BrandWorkshopChoicesInput) {
  const { nextSlot, conversationPending, answerFromGeorge } = input
  const { t } = useI18n()
  const store = useBrandWorkspaceStore()

  /**
   * DIE AUSWAHL-OPTIONEN kommen aus dem Feld selbst (P3.1): George legt sie als
   * Text hinein, hier gibt es keine zweite Liste. Solange nichts drinsteht,
   * bleibt das Modul eine Zeile mit „Übermitteln" für die eigene Formulierung —
   * ein erfundener Options-Katalog wäre genau der Schaden, den
   * `brandChoiceOptions` verhindert.
   */
  const ownChoice = ref('')
  watch(nextSlot, () => { ownChoice.value = '' })

  async function submitChoice(): Promise<void> {
    const said = ownChoice.value.trim()
    if (!said) return
    ownChoice.value = ''
    await answerFromGeorge(said)
  }

  /**
   * DIE GESCHLOSSENE AUSWAHL BEKOMMT KARTEN (P4, Infografik §12.3).
   *
   * Der Absatz darüber bleibt wörtlich wahr: hier entsteht KEINE zweite Liste.
   * Die Menge kommt aus dem geschlossenen Vertrag (`brandChoiceOptions.ts`) —
   * derselben Stelle, aus der auch die Prompt-Regel des Generators gebaut wird.
   * Sähe der Mensch andere Modelle als das Sprachmodell, wäre jede Begründung
   * hinterher eine über etwas anderes.
   *
   * ZWEI BEDINGUNGEN, weil beide etwas ANDERES sagen: die Registry sagt, womit
   * dieser Slot bedient wird (`editor: 'cards'`), der Vertrag sagt, dass es
   * überhaupt eine endliche Menge gibt (`kind: 'closed'`). Ein offener
   * choice-Slot wie `b.positioningCategory` fällt an beiden durch und behält
   * sein Textfeld — dort IST der Text die Antwort.
   */
  function choiceCardsFor(slotId: string): BwChoiceCard[] {
    // SLOTS MIT EIGENER BÜHNE BEKOMMEN KEINE TEXT-KARTEN (Liste in
    // `brandChoiceOptions.ts`): `result.direction` zeigt eine Farbwelt (G4),
    // `g.board` drei gerenderte Szenen (D2c), und seit D8 haben auch die acht
    // Auswahl-Sessions der Schicht 2 ihre eigenen Karten — Schriftproben,
    // SVG-Setzungen, laufende Szenen. Ihre Verträge stehen trotzdem, damit im
    // Handbuch „Knapp" steht und nicht die rohe Id `snappy`; ohne diese Zeile
    // stünden daneben drei Textzeilen einer Karten-Copy, die es nicht gibt.
    if (BRAND_STAGE_CHOICE_SLOTS.includes(slotId)) return []
    if (slotById(slotId)?.editor !== 'cards') return []
    const contract = brandChoiceContract(slotId)
    if (!contract || contract.kind !== 'closed') return []
    return contract.options.map(option => ({
      id: option.id,
      label: t(`${option.copyKey}.label`),
      hint: t(`${option.copyKey}.hint`),
      example: t(`${option.copyKey}.example`),
    }))
  }

  const choiceCards = computed<BwChoiceCard[]>(() =>
    (nextSlot.value ? choiceCardsFor(nextSlot.value.id) : []))

  /**
   * DREI RICHTUNGEN, PASSEND ZU HAUPT- UND NEBEN-ARCHETYP (Konzept §11 b).
   *
   * Die Menge kommt aus der PUREN Regel (`suggestBrandDirections`), nicht aus
   * dem Markup — dieselbe Arbeitsteilung wie bei den Architektur-Karten: was in
   * dem Feld stehen DARF, sagt der Vertrag; welche drei ANGEBOTEN werden, sagt
   * die Regel; wie sie aussehen, sagt der Katalog.
   *
   * DIE ZWEI ARCHETYPEN LIEGEN IN EINEM FREMDEN KAPITEL. Der Browser lädt immer
   * nur eines, deshalb reisen sie als `sourceValues` in der Kapitel-Antwort mit
   * (`brandStageSourceSlots`, Paket G4). Fehlen sie — weil der Archetyp noch
   * nicht bestätigt ist oder ein alter Server antwortet —, greift der Rückfall
   * der Regel: die ersten drei des Katalogs. Ein leerer Bildschirm wäre die
   * teuerste Antwort auf eine fehlende Quelle.
   */
  function directionChoicesFor(slotId: string): BwDirectionChoice[] {
    if (slotId !== DIRECTION_SLOT) return []
    const primary = store.sourceValues['d.primary'] ?? ''
    const secondary = store.sourceValues['d.secondary'] ?? ''
    return suggestBrandDirections(primary, secondary || null).flatMap((suggestion) => {
      const direction = brandDirectionById(suggestion.id)
      if (!direction) return []
      return [{
        direction,
        name: t(direction.nameKey),
        reason: t(direction.reasonKey),
        match: t(suggestion.reasonKey),
      }]
    })
  }

  const directionChoices = computed<BwDirectionChoice[]>(() =>
    (nextSlot.value ? directionChoicesFor(nextSlot.value.id) : []))

  /**
   * Der Klick auf eine Karte geht denselben Weg wie die getippte Antwort — nur
   * mit der stabilen ID als Text. `answerFromGeorge` schreibt sie in den Slot,
   * legt sie als Zug in den Verlauf und reicht sie an George weiter; ein eigener
   * Übermittlungsweg wäre eine zweite Wahrheit über dieselbe Handlung.
   */
  async function pickChoice(id: string): Promise<void> {
    if (conversationPending.value) return
    ownChoice.value = ''
    await answerFromGeorge(id)
  }

  return {
    ownChoice,
    submitChoice,
    choiceCardsFor,
    choiceCards,
    directionChoicesFor,
    directionChoices,
    pickChoice,
  }
}
