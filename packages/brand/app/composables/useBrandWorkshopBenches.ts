import { computed, type ComputedRef, onMounted, watch } from 'vue'
import type { BwBoardChoice } from '../components/BwStageOptions.vue'
import {
  type BrandDnaMixSources,
  brandDnaBoardDifferences,
  brandDnaBoardName,
  brandDnaBoardNote,
  brandDnaDimensionLabel,
} from '../../shared/brandDesignDna'
import type { BrandSlot, BrandStepKey } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import { useBrandDesignToolSync } from './useBrandDesignToolSync'

/**
 * DIE WERKBÄNKE ÜBER DEM GESPRÄCH — Vorbilder und Lesung (D2a/D2b), der
 * DNA-Vorschlag mit Boards und Mix (D2c), die fünf Design-Werkzeuge (D3–D7)
 * und die drei Kapitel von Book & Kit (K5). Aus der Werkstatt-Seite
 * geschnitten (WS1, Rest nach Bahn C).
 *
 * Kein eigener Zustand: die Werkzeuge rechnen, geschrieben wird über den
 * EINEN Eingabe-Weg der Seite (`onInput`, Store + Autosave), den sie
 * hereinreicht. Die Beobachter laufen wie vorher erst nach dem Mount und in
 * derselben Reihenfolge — das Composable wird an derselben Stelle im Setup
 * aufgerufen, an der der Abschnitt vorher stand.
 */
export interface BrandWorkshopBenchesInput {
  profileId: ComputedRef<string>
  stepKey: ComputedRef<BrandStepKey | null>
  nextSlot: ComputedRef<BrandSlot | null>
  onInput: (slotId: string, value: string) => void
}

export function useBrandWorkshopBenches(input: BrandWorkshopBenchesInput) {
  const { profileId, stepKey, nextSlot, onInput } = input
  const { locale } = useI18n()
  const store = useBrandWorkspaceStore()

  /**
   * ZEIGT DIE BÜHNE DAS UPLOAD-INSTRUMENT? (Brand Design D2a, §2.2)
   *
   * Genau dann, wenn wir im Kapitel `dna` stehen UND die Weiche `g.source` auf
   * „wir haben Vorbilder" steht. Der andere Weg („Frida schlägt vor") lässt
   * `g.inspiration` ENTFALLEN — und zwar ohne eine einzige neue Regel in der
   * Zustandsmaschine (§2.1: „NICHTS Neues"):
   *
   *  · `g.inspiration` ist `required: false` UND `type: 'special'`, also nach
   *    `slotIsConfirmable` nicht bestätigbar. Es steht damit in KEINER
   *    Abschluss-Bedingung (`brandStepCompletion`), in keinem Fortschritts-
   *    Nenner (`brandChapterProgress`) und auf keiner Bühne als Karte.
   *  · Es zu überspringen heisst deshalb: es nicht zeigen. Ein `deferred`-Flag
   *    oder ein `skipped`-Zustand für einen Slot, den niemand einfordert, wäre
   *    ein zweiter Weg, dasselbe zu sagen.
   *
   * GELESEN WIRD DER ROHE SLOT-WERT, nicht nur der bestätigte: die Karte
   * schreibt die Id, sobald sie geklickt wird, und das Instrument soll direkt
   * danach dastehen — nicht erst nach „Übernehmen".
   */
  const showInspiration = computed(() => (
    stepKey.value === 'dna' && store.slotValue('g.source') === 'inspiration'
  ))

  /**
   * DER ANDERE WEG SAGT, DASS ER DER ANDERE IST.
   *
   * Auf „Frida schlägt vor" entfällt `g.inspiration` — aber die Session steht
   * weiter in der Leiste (die Zustandsmaschine kennt kein „übersprungen" JE
   * SESSION, nur je Kapitel, und §2.1 sagt ausdrücklich: nichts Neues daran).
   * Wer dort klickt, landete sonst auf einer leeren Fläche. Ein Satz statt des
   * Instruments ist die billigste ehrliche Antwort — und er nennt den Weg
   * zurück, weil die Weiche jederzeit korrigierbar ist.
   */
  const showInspirationSkipped = computed(() => (
    stepKey.value === 'dna' && store.slotValue('g.source') === 'foundation'
  ))

  // ── Der DNA-Vorschlag, die drei Boards und der Mix (D2c, §2.2 Schritte 4–5) ─

  /**
   * DIE RECHNUNG STEHT IM COMPOSABLE, DAS SCHREIBEN HIER.
   *
   * `useBrandDnaBoards()` leitet Vorschlag, Boards und Mischung aus den
   * Slot-Werten ab und hält keinen eigenen Zustand (s. dessen Kopf). Die SEITE
   * ist die einzige Stelle, die `setSlotValue` ruft und den Autosave spült —
   * dieselbe Arbeitsteilung wie bei jeder anderen Komponente dieser Werkstatt
   * (die Komponente zeigt, die Seite entscheidet).
   */
  const dna = useBrandDnaBoards()

  /** Der Vorschlag steht, sobald die Weiche beantwortet ist — auf beiden Wegen. */
  const showDnaPanel = computed(() => stepKey.value === 'dna' && store.slotValue('g.source').length > 0)

  /** Mischen kann nur, wer ein Board gewählt hat. */
  const showDnaMix = computed(() => (
    stepKey.value === 'dna' && dna.boards.value.length > 0 && dna.chosenBoardId.value.length > 0
  ))

  /**
   * DIE DREI BOARD-KARTEN als Auswahl von `g.board` — dasselbe Muster wie die
   * Richtungs-Karten aus G4: was in dem Feld stehen DARF, sagt der geschlossene
   * Vertrag; welche drei ANGEBOTEN werden, sagt die pure Regel; wie sie aussehen,
   * sagt die Karte. Ein leeres Array heisst „hier gibt es keine Boards", und die
   * Bühne behält ihr Textfeld.
   */
  const boardChoices = computed<BwBoardChoice[]>(() => {
    if (nextSlot.value?.id !== 'g.board') return []
    return dna.boards.value.map(board => ({
      board,
      name: brandDnaBoardName(board.id, locale.value),
      note: brandDnaBoardNote(board.id, locale.value),
      differences: brandDnaBoardDifferences(dna.boards.value, board.id)
        .map(id => brandDnaDimensionLabel(id, locale.value)),
    }))
  })

  /**
   * ZWEI ABGELEITETE FELDER, DIE SICH SELBST FÜLLEN (H5: „jede Session muss als
   * BESTÄTIGUNG durchlaufbar sein").
   *
   * `g.boards` und `g.mix` sind RECHNUNGEN, keine Eingaben — es gibt für sie
   * nichts zu tippen und (bewusst) keinen Generator. Die Bühne braucht trotzdem
   * einen Wert, sonst stünde dort eine Karte ohne Inhalt mit einem
   * Übernehmen-Knopf, der nichts übernimmt.
   *
   * DIE GLEICHHEITS-PRÜFUNG IST DIE GANZE SICHERUNG: ohne sie schriebe jeder
   * Renderdurchlauf denselben Text und der Autosave liefe im Kreis. Sie hält
   * auch, wenn sich der Vorschlag ÄNDERT — dann rechnet dieselbe Regel neue
   * Werte, der Vergleich schlägt an, und der Stand heilt sich selbst.
   *
   * NUR NACH DEM MOUNT — `import.meta.client` allein reicht NICHT (Brand Design
   * D3, am eigenen Klick gefunden): ein `watch(..., { immediate: true })` läuft
   * im Browser schon im SETUP, also VOR dem ersten Rendern. Der Server malt die
   * Karte dann leer („Noch offen — kommt im Gespräch"), der Client malt sie im
   * selben Augenblick gefüllt — drei Hydration-Mismatches, darunter ein
   * `disabled`-Attribut am Bestätigen-Knopf. Dieselbe Falle und dieselbe Kur wie
   * beim Eröffnungszug oben: `onMounted` ist die kleinste ehrliche Klammer, und
   * der Server schreibt so ohnehin nichts.
   */
  const dnaMixValue = computed(() => (dna.chosenBoardId.value ? dna.mixSlotValue() : ''))

  onMounted(() => {
    watch(dna.boardsSlotValue, (value) => {
      if (stepKey.value !== 'dna' || !value) return
      if (store.slotValue('g.boards') === value) return
      onInput('g.boards', value)
    }, { immediate: true })

    watch(dnaMixValue, (value) => {
      if (stepKey.value !== 'dna' || !value) return
      if (store.slotValue('g.mix') === value) return
      onInput('g.mix', value)
    }, { immediate: true })
  })

  /** Eine neue Mischung aus dem Panel — sie geht denselben Weg wie jede Eingabe. */
  function applyMixSources(next: BrandDnaMixSources): void {
    const value = dna.mixSlotValue(next)
    if (!value) return
    onInput('g.mix', value)
  }

  // ── Die Farbwelt (D3, §2.3) ───────────────────────────────────────────────

  /**
   * Die fünf Design-Werkzeuge (Farbwelt, Typografie, Zeichen, Bildsprache,
   * Bewegung) teilen EINE Mechanik: das Werkzeug rechnet, die Seite schreibt
   * über `onInput`, bestätigte Felder bleiben unberührt, der Abgleich läuft erst
   * nach dem Mount — `useBrandDesignToolSync` (WS1, Kapitel d), dort begründet.
   */
  const colorWorld = useBrandColorWorld()
  const { show: showColorPanel, confirmed: confirmedColorSlots, pick: applyColorPick } = useBrandDesignToolSync({
    stepKey,
    chapter: 'color',
    slots: ['h.base', 'h.ramp', 'h.neutral', 'h.accent', 'h.roles', 'h.contrast'],
    values: colorWorld.slotValues,
    onInput,
  })

  // ── Die Typografie (D4, §2.4) ─────────────────────────────────────────────

  const typeWorld = useBrandTypeWorld()
  const { show: showTypePanel, confirmed: confirmedTypeSlots, pick: applyTypePick } = useBrandDesignToolSync({
    stepKey,
    chapter: 'type',
    slots: ['i.pair', 'i.scale', 'i.rules'],
    values: typeWorld.slotValues,
    onInput,
  })

  // ── Das Zeichen (D5a/D5b, §2.5) ───────────────────────────────────────────

  /**
   * DREI der vier Sessions belegt das Kapitel selbst vor — `j.brief` NICHT.
   *
   * Das Briefing ist die einzige Session dieses Kapitels, die weder gerechnet
   * noch gewählt wird: sie entsteht im Lauf (server-seitig, `POST …/mark/brief`)
   * oder von Hand. Stünde sie in dieser Liste, überschriebe der Autosave beim
   * nächsten Rendern genau den Text, den der Mensch gerade bekommen hat.
   * `j.drafts` (Stufe 3, D5c) fehlt aus einem anderen Grund: der Wert dieser
   * Session beschreibt die BEHALTENEN Entwürfe und wird server-seitig
   * nachgezogen (`syncBrandMarkDraftsSlot`) — ein Autosave von hier schriebe ihn
   * bei jedem Rendern leer. Bestätigt sein kann auch `j.brief` — das Panel
   * sperrt dann seinen Lauf (`panelSlots`).
   */
  const markWorld = useBrandMarkWorld()
  const { show: showMarkPanel, confirmed: confirmedMarkSlots, pick: applyMarkPick } = useBrandDesignToolSync({
    stepKey,
    chapter: 'mark',
    slots: ['j.kind', 'j.examples', 'j.pick'],
    panelSlots: ['j.kind', 'j.brief', 'j.examples', 'j.pick'],
    values: markWorld.slotValues,
    onInput,
  })

  // ── Die Bildsprache (D6, §2.6) ────────────────────────────────────────────

  /**
   * ALLE VIER Sessions belegt das Kapitel selbst vor — anders als beim Zeichen,
   * wo `j.brief` aus einem Lauf kommt. Hier gibt es keinen Modell-Text, den ein
   * Autosave überschreiben könnte (§1.4: „Regeln statt Bilder").
   */
  const imageryWorld = useBrandImageryWorld()
  const { show: showImageryPanel, confirmed: confirmedImagerySlots, pick: applyImageryPick } = useBrandDesignToolSync({
    stepKey,
    chapter: 'imagery',
    slots: ['k.photo', 'k.illustration', 'k.icons', 'k.dodont'],
    values: imageryWorld.slotValues,
    onInput,
  })

  // ── Die Bewegung (D7, §2.7) ───────────────────────────────────────────────

  /**
   * ALLE VIER Sessions belegt das Kapitel selbst vor — wie in der Bildsprache
   * gibt es hier keinen Modell-Text, den ein Autosave überschreiben könnte
   * (§1.4). `l.rules` ist `stage-edit` und darf von Hand ergänzt werden: eine
   * BESTÄTIGTE Fassung rührt der Abgleich nicht an (Sicherung 2).
   */
  const motionWorld = useBrandMotionWorld()
  const { show: showMotionPanel, confirmed: confirmedMotionSlots, pick: applyMotionPick } = useBrandDesignToolSync({
    stepKey,
    chapter: 'motion',
    slots: ['l.tempo', 'l.transitions', 'l.logo', 'l.rules'],
    values: motionWorld.slotValues,
    onInput,
  })

  // ── Die drei Kapitel von Book & Kit (K5, §2.2–§2.4) ───────────────────────

  /**
   * DIESELBE ARBEITSTEILUNG WIE IN SCHICHT 2 — mit EINER Verschiebung: es
   * rechnet nicht der Browser, sondern der SERVER, und die Seite schreibt.
   *
   * Der Grund steht im Kopf von `useBrandKitWorkshop`: die Prompt-Vorlagen
   * brauchen die ganze Foundation, die Pressekit-Vorschau vier fremde Kapitel,
   * und die Fakten (`a.facts`) dürfen den Browser überhaupt nur über einen
   * Eigentümer-Pfad erreichen. Der Store der Werkstatt trägt immer nur den
   * offenen Baustein.
   */
  const kitWorkshop = useBrandKitWorkshop(profileId)

  const showNomenclaturePanel = computed(() => stepKey.value === 'nomenclature')
  const showAiguidePanel = computed(() => stepKey.value === 'aiguide')
  const showPresskitPanel = computed(() => stepKey.value === 'presskit')

  const NOMENCLATURE_SLOTS = ['m.types', 'm.patterns', 'm.rules'] as const
  const AIGUIDE_SLOTS = ['n.scope', 'n.review', 'n.guardrails', 'n.prompts'] as const
  const PRESSKIT_SLOTS = ['p.facts', 'p.contact', 'p.summary'] as const

  const confirmedNomenclatureSlots = computed(() =>
    NOMENCLATURE_SLOTS.filter(slotId => store.slotConfirmed(slotId)))
  const confirmedAiguideSlots = computed(() =>
    AIGUIDE_SLOTS.filter(slotId => store.slotConfirmed(slotId)))
  const confirmedPresskitSlots = computed(() =>
    PRESSKIT_SLOTS.filter(slotId => store.slotConfirmed(slotId)))

  /**
   * EINE WAHL AUS EINEM KIT-PANEL — derselbe Weg wie jede Eingabe.
   *
   * KEIN selbst-vorbelegender Beobachter wie in den Design-Kapiteln: dort
   * entsteht NICHTS von Hand, hier schon (`m.rules` ist `stage-edit`,
   * `p.contact` ein Formular). Ein Automatismus überschriebe genau die Fassung,
   * die jemand gerade tippt. Übernommen wird deshalb auf Klick — der Knopf ist
   * in den Panels, der Schreibvorgang hier.
   */
  function applyKitPick(slotId: string, value: string): void {
    if (store.slotConfirmed(slotId)) return
    onInput(slotId, value)
  }

  return {
    showInspiration,
    showInspirationSkipped,
    showDnaPanel,
    showDnaMix,
    boardChoices,
    applyMixSources,
    showColorPanel,
    confirmedColorSlots,
    applyColorPick,
    showTypePanel,
    confirmedTypeSlots,
    applyTypePick,
    showMarkPanel,
    confirmedMarkSlots,
    applyMarkPick,
    showImageryPanel,
    confirmedImagerySlots,
    applyImageryPick,
    showMotionPanel,
    confirmedMotionSlots,
    applyMotionPick,
    kitWorkshop,
    showNomenclaturePanel,
    showAiguidePanel,
    showPresskitPanel,
    confirmedNomenclatureSlots,
    confirmedAiguideSlots,
    confirmedPresskitSlots,
    applyKitPick,
  }
}
