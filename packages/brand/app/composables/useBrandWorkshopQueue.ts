import { computed, ref, type Ref, watch } from 'vue'
import { brandAiRejectionMessageKey } from '../../shared/brandAiLimits'
import {
  type BrandSlotControls,
  brandSlotControls,
} from '../../shared/brandSlotControls'
import type {
  BrandReadinessNeed,
  BrandSlotReadiness,
} from '../../shared/brandSlotReadiness'
import {
  type BrandSlot,
  type BrandStepKey,
  slotIsConfirmable,
} from '../../shared/slotRegistry'
import type {
  BrandSessionAcceptResponse,
  BrandSessionView,
} from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import type { useBrandConversation } from './useBrandConversation'
import type { useBrandGeneration } from './useBrandGeneration'

/**
 * Je Slot: WAS er gerade ist (leer · Entwurf · bestätigt) und WELCHE
 * Bedienelemente dazugehören. Die Entscheidung liegt pur nebenan
 * (`brandSlotControls`) und ist dort vollständig getestet.
 */
export interface BrandSlotCard {
  slot: BrandSlot
  controls: BrandSlotControls
  /** Der Satz des Bereitschafts-Gates — nur, wenn er auch gezeigt wird. */
  note: string | null
}

/** Die Bedarfs-Schlüssel tragen Punkte (`startcard.about`), i18n-Knoten nicht. */
const READINESS_KEYS: Record<BrandReadinessNeed, string> = {
  'startcard.about': 'startcardAbout',
  'startcard.audience': 'startcardAudience',
  'startcard.industry': 'startcardIndustry',
  'competitor_names': 'competitorNames',
  'source_texts': 'sourceTexts',
  'source_slots': 'sourceSlots',
  'name_types': 'nameTypes',
  'tone_words': 'toneWords',
}

export interface UseBrandWorkshopQueueOptions {
  profileId: Readonly<Ref<string>>
  routeStepKey: Readonly<Ref<string>>
  stepKey: Readonly<Ref<BrandStepKey | null>>
  slots: Readonly<Ref<readonly BrandSlot[]>>
  activeSessionKey: Readonly<Ref<string>>
  activeSlot: Readonly<Ref<BrandSlot | null>>
  activeSession: Readonly<Ref<BrandSessionView | null>>
  voice: Readonly<Ref<{ name: string }>>
  /** Dieselbe Bereitschafts-Regel, die `stageClaim` liest — sie bleibt in der Seite (TDZ). */
  readinessOf: (slot: BrandSlot) => BrandSlotReadiness
  /** Gehört der Seite (s. dort); der Session-Wechsel räumt es hier. */
  editingSlotId: Ref<string | null>
  /** Refs des Schreibfelds (`useBrandWorkshopComposer`), die der Session-Wechsel räumt. */
  promptDraft: Ref<string>
  exampleOpen: Ref<boolean>
  keepWritingFor: Ref<string>
  generation: ReturnType<typeof useBrandGeneration>
  conversation: ReturnType<typeof useBrandConversation>
  autosave: { flush: () => Promise<void> }
}

/**
 * DIE WARTESCHLANGE „NEU BESPRECHEN" UND DIE KARTEN-RECHNUNG (§9) — aus
 * `pages/brand/[profileId]/[stepKey].vue` geschnitten (WS1 f, Rest,
 * 2026-11-27), ohne Verhaltensänderung.
 *
 * Hier wohnt: der Veraltet-Hinweis mit „Gilt weiter", der Hinweis je Slot,
 * die Flanke `turnEnded`, das Räumen der Bühne beim Kapitel- und
 * Session-Wechsel, die Karten je Slot (`slotCards`/`cardFor`), der
 * Erzeugen-Klick und der Satz zu einem abgelehnten KI-Lauf.
 *
 * KEINE NEUE ZUSTANDS-QUELLE: `editingSlotId` gehört der Seite, die drei
 * Schreibfeld-Refs gehören `useBrandWorkshopComposer` — hier werden sie nur
 * beim Wechsel geräumt. Die Seite ruft den Baustein an DERSELBEN Stelle im
 * `setup` auf, an der der Abschnitt stand (Reihenfolge der Beobachter
 * unverändert); die beiden Beobachter, die `turnEnded` setzen bzw. löschen,
 * bleiben bei `stageModule` in der Seite.
 */
export function useBrandWorkshopQueue(options: UseBrandWorkshopQueueOptions) {
  const {
    profileId,
    routeStepKey,
    stepKey,
    slots,
    activeSessionKey,
    activeSlot,
    activeSession,
    voice,
    readinessOf,
    editingSlotId,
    promptDraft,
    exampleOpen,
    keepWritingFor,
    generation,
    conversation,
    autosave,
  } = options
  const store = useBrandWorkspaceStore()
  const { t } = useI18n()
  const toast = useToast()

  /**
   * DIESE SESSION IST VERALTET: ein Feld, aus dem sie schöpft, hat sich
   * geändert. Zwei Wege stehen offen, und der Mensch wählt — „Gilt weiter"
   * stempelt den neuen Stand als Grundlage, „Neu besprechen" lässt das Gespräch
   * laufen (George eröffnet mit Bezug auf die Änderung, s. converse-9).
   *
   * Der Hinweis ist RUHIG und keine Sperre: der bestätigte Wert steht weiter da,
   * und wer nichts tut, verliert nichts.
   */
  const activeStale = computed(() => activeSession.value?.state === 'stale')
  const staleHidden = ref(false)
  const restamping = ref(false)

  async function keepSessionValid(): Promise<void> {
    const slot = activeSlot.value
    if (!slot || !stepKey.value || restamping.value) return
    restamping.value = true
    try {
      // Erst ausspülen: der Stempel schreibt dieselbe Zeile, und eine offene
      // Eingabe liefe danach in einen 409 mit der alten Fassung.
      await autosave.flush()
      const response = await $fetch<BrandSessionAcceptResponse>(
        `/api/brand/profiles/${profileId.value}/steps/${stepKey.value}/sessions/${slot.id}/restamp`,
        { method: 'POST', body: { revision: store.revision } },
      )
      store.applySessionRestamp(response)
    }
    catch {
      toast.add({ color: 'warning', title: t('brand.session.keepFailed') })
    }
    finally {
      restamping.value = false
    }
  }

  /** Der Hinweis je Slot („wärmer", „kürzer") — lokal, nie gespeichert. */
  const hints = ref<Record<string, string>>({})
  const hintOpen = ref(false)

  /**
   * EIN GESPRÄCHSZUG IST GERADE ZU ENDE GEGANGEN (Befund 8b) — die Flanke, an
   * der die Hervorhebung des Entwurfs-Knopfes hängt. Sie steht hier oben, weil
   * `generateSlot` sie beim Klick löscht; die Bedingung selbst (`draftNudge`)
   * wohnt unten bei `stageModule`, wo sie hingehört.
   */
  const turnEnded = ref(false)

  /**
   * Die Bedien-Zustände der Bühne hängen am BAUSTEIN und fallen mit ihm — und
   * seit BW2 3c-i genauso an der SESSION: ein halb getippter Satz, der beim
   * Umschalten stehen bliebe, gehörte plötzlich zu einer anderen Frage, und ein
   * offenes Korrektur-Feld zeigte auf ein Feld, das gar nicht mehr dasteht.
   */
  watch([routeStepKey, activeSessionKey], () => {
    hints.value = {}
    hintOpen.value = false
    promptDraft.value = ''
    exampleOpen.value = false
    editingSlotId.value = null
    // Auch die Einladung „ergänze noch etwas" gehörte GENAU dieser Session.
    keepWritingFor.value = ''
    // Ein weggeklickter Veraltet-Hinweis gehörte zu GENAU dieser Session.
    staleHidden.value = false
  })


  function readinessNote(readiness: BrandSlotReadiness): string | null {
    if (readiness.ready) return null
    return t('brand.workspace.ready.needs', {
      advisor: voice.value.name,
      needs: readiness.missing.map(need => t(`brand.workspace.ready.need.${READINESS_KEYS[need]}`)).join(' · '),
    })
  }


  const slotCards = computed<BrandSlotCard[]>(() => slots.value.map((slot) => {
    const readiness = readinessOf(slot)
    const controls = brandSlotControls({
      // s. `editingSlotId` (Befund F): eine Karte in Korrektur verhält sich wie
      // ein offenes Feld — Editor, „Übernehmen", „Korrigieren beenden". Gesendet
      // wird deswegen nichts; die Bestätigung nimmt erst die Eingabe.
      confirmed: store.slotConfirmed(slot.id) && editingSlotId.value !== slot.id,
      hasValue: store.slotValue(slot.id).length > 0,
      isGeorgeDraft: store.slotIsGeorgeDraft(slot.id),
      hasEditor: slot.editor !== 'none',
      // Der Paarvergleich (Katalog §12) hat kein Instrument und keine
      // Bestätigung. Die Regel steht in der Registry, damit die Bühne und die
      // Abschluss-Rechnung dieselbe Menge meinen (Audit A4).
      confirmable: slotIsConfirmable(slot),
      generatable: slot.generator !== 'none',
      hasHistory: Boolean(store.serverSlots[slot.id]?.firstDraft),
      ready: readiness.ready,
    })
    return { slot, controls, note: controls.showReadinessNote ? readinessNote(readiness) : null }
  }))

  function cardFor(slotId: string): BrandSlotCard | null {
    return slotCards.value.find(entry => entry.slot.id === slotId) ?? null
  }

  /* Einen KAPITEL-Balken zeigt diese Seite nicht mehr (Audit A10): der
   * Rail-Fuss ist aus (`railFooter=false`), unten rechts im Log steht der
   * GESAMT-Fortschritt. `brandChapterProgress` bleibt als geprüfte Regel im
   * shared-Ordner stehen — der Klickdummy dokumentiert den Balken weiter. */

  async function generateSlot(slot: BrandSlot): Promise<void> {
    // Der Hinweis hat seinen Zweck erfüllt, sobald geklickt wurde (Befund 8b).
    turnEnded.value = false
    await generation.generate(slot.id, hints.value[slot.id] ?? '')
    // Der Hinweis hat gewirkt oder nicht — stehen bleiben soll er nicht, sonst
    // reist er stillschweigend in den nächsten Versuch.
    hints.value = { ...hints.value, [slot.id]: '' }
    hintOpen.value = false
  }

  /**
   * `ai_disabled` und `no_generator` sind BETRIEBSZUSTÄNDE, kein Unglück: der
   * Stand bleibt voll bearbeitbar (§9b.5). Vom GESPRÄCH kommt hier nur die
   * Drossel an (und seit KI1 d der fehlende Endpunkt) — ein sonst ausgefallener
   * Zug bleibt still (s. `useBrandConversation`).
   */
  const generationNotice = computed<string | null>(() => {
    const code = generation.failureCode.value ?? conversation.failureCode.value
    if (!code) return null
    const throttled = brandAiRejectionMessageKey(code)
    if (throttled) return t(throttled)
    // Die drei Betriebs-Sätze NENNEN die Stimme — und die ist in Schicht 2 Frida
    // (D8). Ein hier ausgeschriebenes „George" stand sonst unter Fridas Kapitel.
    if (code === 'ai_disabled') return t('brand.workspace.generate.aiDisabled', { voice: voice.value.name })
    if (code === 'no_generator') return t('brand.workspace.generate.noGenerator', { voice: voice.value.name })
    if (code === 'generation_active') return t('brand.workspace.generate.busy', { voice: voice.value.name })
    if (code === 'aborted') return t('brand.workspace.generate.stopped')
    if (code === 'not_ready') return t('brand.workspace.generate.notReady')
    if (code === 'slot_confirmed') return t('brand.workspace.generate.slotConfirmed')
    // KI1 d: kein Endpunkt unter der Datenschutz-Bindung — der genaue Satz des
    // Core (derselbe Schlüssel wie im zentralen Hinweis), nicht „hat nicht
    // geklappt". Der Strom läuft an `$fetch` vorbei, deshalb zeigt ihn hier die
    // Seite selbst.
    if (code === 'ai_endpoint_unavailable') return t('error.aiEndpointUnavailableHint')
    return t('brand.workspace.generate.failed')
  })

  return {
    activeStale,
    staleHidden,
    restamping,
    keepSessionValid,
    hints,
    hintOpen,
    turnEnded,
    slotCards,
    cardFor,
    generateSlot,
    generationNotice,
  }
}
