import { computed, ref, type Ref } from 'vue'
import { brandAnswerWritesSlot } from '../../shared/brandSessions'
import type { BrandAnswerTarget } from '../../shared/brandStageModule'
import {
  type BrandPathKind,
  type BrandSlot,
  type BrandStepKey,
  type BrandTeamKind,
  exampleKeyFor,
  questionKeyFor,
  slotLabelKeyFor,
} from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import type { useBrandConversation } from './useBrandConversation'

/**
 * DAS SCHREIBFELD DER WERKSTATT (WS1 e, Teil, 2026-11-25): Eingabe, Beispiel-
 * Antwort, „Ich ergänze noch etwas" und der EINE Sende-Pfad `answerFromGeorge`.
 *
 * Herausgeschnitten aus `pages/brand/[profileId]/[stepKey].vue` ohne
 * Verhaltensänderung. Der Zustand bleibt, wo er war: die Seite besitzt Session,
 * Ziel und nächste Frage und reicht sie herein; `confirmDismissed` gehört der
 * Seite (die Bestätigungs-Rechnung liest es). Die Refs, die die Warteschlange
 * beim Session-Wechsel räumt (`promptDraft`, `exampleOpen`, `keepWritingFor`),
 * gibt das Composable zurück. Kein `await` in `setup`, kein Abruf beim Aufbau —
 * die Server-Fassung ändert sich dadurch nicht (Prüfweg:
 * `scripts/verify-workshop-hydration.mjs`).
 */
export interface UseBrandWorkshopComposerOptions {
  profileId: Readonly<Ref<string>>
  stepKey: Readonly<Ref<BrandStepKey | null>>
  pathKind: Readonly<Ref<BrandPathKind>>
  teamKind: Readonly<Ref<BrandTeamKind>>
  voice: Readonly<Ref<{ name: string }>>
  activeSessionKey: Readonly<Ref<string>>
  answerSlot: Readonly<Ref<BrandSlot | null>>
  answerTarget: Readonly<Ref<BrandAnswerTarget | null>>
  nextSlot: Readonly<Ref<BrandSlot | null>>
  /** Gehört der Seite: welche Bestätigungs-Karte weggeräumt ist. */
  confirmDismissed: Ref<string>
  conversation: ReturnType<typeof useBrandConversation>
  autosave: { schedule: () => void }
  slotLabel: (slot: BrandSlot) => string
  slotDisplayValue: (slotId: string, value: string) => string
}

export function useBrandWorkshopComposer(options: UseBrandWorkshopComposerOptions) {
  const {
    profileId,
    stepKey,
    pathKind,
    teamKind,
    voice,
    activeSessionKey,
    answerSlot,
    answerTarget,
    nextSlot,
    confirmDismissed,
    conversation,
    autosave,
    slotLabel,
    slotDisplayValue,
  } = options
  const store = useBrandWorkspaceStore()
  const { t } = useI18n()

  const promptBox = ref<HTMLElement | null>(null)

  /**
   * „ICH ERGÄNZE NOCH ETWAS" ist bewusst KEINE `OPTION:`-Zeile (die liefe als
   * Antwort-TEXT in den Slot — genau der Schaden, den `readsLikeQuestion` an
   * anderer Stelle abfängt). Der Knopf tut das Kleinstmögliche: er räumt die Wahl
   * weg und setzt den Cursor dorthin, wo weitergeschrieben wird.
   *
   * ── UND SAGT, WOZU (Testlauf-Befund D, 2026-09-09) ───────────────────────
   * Im Live-Test war nach dem Klick nichts anders: dasselbe Feld, derselbe
   * Platzhalter, kein Hinweis, dass der nächste Satz an DIESES Feld geht. Jetzt
   * nennt der Platzhalter das Feld („Ergänzung zu Kundenstimmen"), und die
   * Ergänzung landet in derselben Session (`answerSlot`, Befund A). Der Merker
   * fällt mit dem Absenden und beim Session-Wechsel — ein Platzhalter, der über
   * ein fremdes Feld weiterredet, wäre die nächste Verwechslung.
   */
  const keepWritingFor = ref('')

  function keepWriting(turnId: string): void {
    confirmDismissed.value = turnId
    keepWritingFor.value = activeSessionKey.value
    promptBox.value?.querySelector('textarea')?.focus()
  }

  const promptPlaceholder = computed<string>(() => {
    const slot = keepWritingFor.value === activeSessionKey.value && answerSlot.value
      ? answerSlot.value
      : null
    return slot
      ? t('brand.workspace.george.addToPlaceholder', { field: slotLabel(slot) })
      : t('brand.workspace.george.placeholder', { voice: voice.value.name })
  })

  /**
   * Der Klick auf einen Chip geht denselben Weg wie eine getippte Antwort —
   * `answerFromGeorge` ist der EINE Sende-Pfad (Prompt, eigene Formulierung,
   * Auswahl-Karte hängen alle daran). Ein zweiter Weg hier hiesse: eine Regel
   * (Gegenfrage-Heuristik, Slot-Schreiben, Verlauf) an zwei Stellen pflegen.
   */
  async function answerOption(label: string): Promise<void> {
    if (conversation.pending.value) return
    await answerFromGeorge(label)
  }

  /**
   * DIE BEISPIEL-ANTWORT (Davids Wunsch 2026-09-01, Muster Claude Desktop).
   * Sie steht seit dem Umbau als aufklappbarer Link DIREKT UNTER DER FRAGE
   * (Runde 23) statt als grauer Platzhalter im Feld — Klick ODER Tab übernimmt
   * sie ins leere Prompt. Die Texte stehen statisch im Katalog
   * (`brand.example.<id>`, pfad- UND team-abhängig wie die Frage selbst —
   * ohne `teamKind` stünde unter der Team-Fassung von `c.discovery3` das
   * Beispiel zur Solo-Frage, Paket 8).
   */
  const composerExample = computed<string>(() => {
    const slot = nextSlot.value
    if (!slot || slot.type !== 'question') return ''
    return t(exampleKeyFor(slot, pathKind.value, teamKind.value))
  })

  const exampleOpen = ref(false)
  const promptDraft = ref('')

  function takeExample(): void {
    if (!composerExample.value) return
    promptDraft.value = composerExample.value
  }

  /** Tab übernimmt die Beispiel-Antwort — nur im LEEREN Feld, wie im Composer. */
  function promptTab(event: KeyboardEvent): void {
    if (event.shiftKey || !exampleOpen.value || !composerExample.value || promptDraft.value.length > 0) return
    event.preventDefault()
    takeExample()
  }

  /**
   * EINE GETIPPTE ANTWORT — und was daraus folgt (P3.2).
   * Der Text gehört in den SLOT; danach macht der Berater dazu einen Zug. Ohne
   * offene Frage ist er eine FREIE Frage ohne Slot — geschrieben wird dann nichts.
   *
   * EINE GEGENFRAGE IST KEINE ANTWORT (Davids Live-Fund 2026-09-03): „wo hast
   * du die website her?" stand danach wörtlich als Wert im Baustein-Feld —
   * George erkannte die Gegenfrage im GESPRÄCH, aber der Slot war schon
   * beschrieben. Endet die Eingabe mit einem Fragezeichen, läuft sie deshalb
   * als freie Frage (kein Slot-Schreiben; George antwortet, die Katalog-Frage
   * bleibt offen). Bewusst eine HEURISTIK: eine echte Antwort, die auf „?"
   * endet, ist im Feld-Kontext die seltene Ausnahme — und wer sie meint, kann
   * das Feld über die Karte füllen. Die Testdaten trugen denselben Schaden
   * schon einmal (b.positioningFirstChoice: „examples?").
   */
  function readsLikeQuestion(text: string): boolean {
    return text.trimEnd().endsWith('?')
  }

  async function answerFromGeorge(text: string): Promise<void> {
    // DIE AKTIVE SESSION, NIE DIE NÄCHSTE FRAGE (Testlauf-Befund A) — s.
    // `answerSlot`/`brandAnswerTarget`. `null` heisst: ein Gesprächszug ohne Feld.
    const slot = readsLikeQuestion(text) ? null : answerSlot.value
    // `slotLabelKeyFor` und nicht `questionKeyFor`: die AKTIVE Session ist jede
    // Session, die der Mensch angeklickt hat — auch eine Ableitung oder der
    // Paarvergleich (`special`). Nur die geteilte Regel weiss für alle, welcher
    // Katalog-Schlüssel wirklich existiert.
    const question = slot ? t(slotLabelKeyFor(slot, pathKind.value, teamKind.value)) : ''
    /**
     * DER SAMMEL-WERT GEHÖRT DEM SERVER (Kailua-Befund 4) — die Regel steht pur
     * nebenan (`brandAnswerWritesSlot`), samt Begründung. Der Zug reist trotzdem
     * MIT `slotId`: die Verlaufs-Zeile soll wissen, worüber gesprochen wurde.
     */
    const writesSlot = brandAnswerWritesSlot(slot)

    /**
     * ERGÄNZEN STATT ÜBERSCHREIBEN, wo schon eine Antwort steht (Befund D) —
     * die Regel steht pur nebenan (`brandAnswerTarget`, `mode`). Der zweite Satz
     * zu derselben Frage ist eine Ergänzung; würde er den ersten ersetzen,
     * verlöre der Knopf „Ich ergänze noch etwas" seine Bedeutung.
     */
    function nextSlotValue(slotId: string): string {
      if (answerTarget.value?.mode !== 'append') return text
      const before = store.slotValue(slotId).trim()
      return before ? `${before}\n\n${text}` : text
    }

    if (slot && writesSlot) store.setSlotValue(slot.id, nextSlotValue(slot.id))
    /**
     * DIE EIGENE BLASE ZEIGT DIE LESEFASSUNG, DER SLOT BEHÄLT DIE ID (D8).
     *
     * Ein Karten-Klick schickt die Katalog-Id (`snappy`, `yes`) — gespeichert
     * gehört sie, gelesen nie: der Mensch hat auf „Knapp" geklickt und sah
     * danach `snappy` in seiner eigenen Sprechblase. `slotDisplayValue` ist
     * dieselbe Auflösung wie in Log-Karte und Handbuch; für jeden Slot ohne
     * Vertrag gibt sie den Text unverändert zurück (getippte Antworten bleiben
     * also wörtlich stehen).
     */
    store.addUserMessage(
      `answer-${slot?.id ?? 'free'}-${store.streamMessages.length}`,
      slot ? slotDisplayValue(slot.id, text) : text,
    )
    if (slot && writesSlot) autosave.schedule()

    const upcoming = nextSlot.value
    // DIE SESSION REIST IMMER MIT (BW2 §6): ohne sie rechnete der Server die
    // Grundfassung und George bekäme das Ziel eines anderen Feldes in den
    // Prompt — genau die Session, die der Mensch NICHT angeklickt hat.
    const from = activeSessionKey.value
    await conversation.converse({
      text,
      ...(from ? { sessionKey: from } : {}),
      slotId: slot?.id,
      question,
      nextSlotId: upcoming?.id,
      nextQuestion: upcoming ? t(questionKeyFor(upcoming, pathKind.value, teamKind.value)) : '',
    })
    /**
     * DER ZUG HAT GESCHRIEBEN — ALSO NACHLESEN (Kailua-Befund 4).
     *
     * Nur die Sammel-Session und der „hat mitgelesen"-Stempel bewegen die
     * Fassung, und nur die erste bewegt dabei einen WERT. Kein Frame trägt ihn:
     * `slot.ready` kommt aus dieser Route nie. Ohne diesen Abruf sähe die Bühne
     * den zusammengelegten Wert von `a.facts` erst nach einem Neuladen der Seite.
     * `refreshStep` lässt das Gespräch stehen (s. dort).
     */
    if (conversation.wrote.value && stepKey.value) {
      await store.refreshStep(profileId.value, stepKey.value)
    }
    /**
     * ES KAM GAR KEIN ZUG (Kill-Switch aus, Sperre belegt, Drossel): dann hat
     * auch niemand den Sammel-Teil aufgehoben — die Route kommt gar nicht so
     * weit. Der Browser schreibt ihn deshalb doch, und die Werkstatt verhält
     * sich wie vor der Konversations-Runde. Ein abgerissener STROM zählt hier
     * NICHT (s. `noTurn`): dort könnte der Server ihn längst haben.
     */
    else if (slot && !writesSlot && conversation.noTurn.value) {
      store.setSlotValue(slot.id, text)
      autosave.schedule()
    }
    /**
     * UND HIER WIRD NICHT MEHR GESPRUNGEN (Davids Entscheidung 2026-09-09,
     * DECISION-LOG Punkt 10: „Kein automatischer Sprung mehr mitten im
     * Gespräch").
     *
     * Bis hierher stand an dieser Stelle `autoAdvance(from,
     * conversation.nextStop.value)` — und sie feuerte nach JEDER Antwort: sobald
     * ein Wert im Feld stand, galt die Session für `resolveNextStop` als
     * beantwortet, und der Wegweiser zeigte auf die nächste. Der Mensch las
     * Georges Rückfrage, und die Seite zog ihm die Session unter der Hand weg —
     * die zwei Knöpfe darunter („Passt so, bestätigen" / „Ich ergänze noch
     * etwas") wären nie klickbar gewesen.
     *
     * Eine Session verlässt man jetzt über GENAU ZWEI Wege: die Bestätigung (dann
     * kommt der Abschlusszug mit seinem Knopf) und das Vertagen. Beide sind ein
     * Klick, keiner ist eine Nebenwirkung.
     */
  }

  /**
   * Das Prompt bedient den offenen answer-Zug — und die freie Frage (s. Kopf,
   * Abweichung 2). Gesperrt ist es nur, wenn eine AUSWAHL dran ist: die hat ihr
   * eigenes Modul im Zug.
   */
  const promptEnabled = computed(() => nextSlot.value?.type !== 'choice')

  async function submitPrompt(): Promise<void> {
    const said = promptDraft.value.trim()
    if (!said || !promptEnabled.value || conversation.pending.value) return
    promptDraft.value = ''
    exampleOpen.value = false
    // Die Ergänzung ist geschrieben — der Platzhalter fällt zurück (Befund D).
    keepWritingFor.value = ''
    await answerFromGeorge(said)
  }

  return {
    promptBox,
    keepWritingFor,
    keepWriting,
    promptPlaceholder,
    answerOption,
    composerExample,
    exampleOpen,
    promptDraft,
    takeExample,
    promptTab,
    answerFromGeorge,
    promptEnabled,
    submitPrompt,
  }
}
