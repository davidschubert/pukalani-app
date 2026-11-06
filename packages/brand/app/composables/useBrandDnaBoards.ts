import {
  type BrandDnaBoard,
  type BrandDnaMixSources,
  type BrandDnaProposalEntry,
  brandDnaBoards,
  brandDnaBoardsSlotValue,
  brandDnaMixDefault,
  brandDnaMixEntries,
  brandDnaMixSlotValue,
  brandDnaResuggest,
  brandDnaValuesOf,
  parseBrandDnaMixSlotValue,
  parseBrandDnaSlotValue,
} from '../../shared/brandDesignDna'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE DREI BOARDS UND DER MIX — EINE Rechnung für DREI Abschnitte (Brand
 * Design D2c, Konzept §2.2 Schritt 5).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Der DNA-Vorschlag, die Board-Karten und Mix & Match stehen untereinander in
 * derselben Bühne und meinen dieselbe Rechnung. Jede Komponente, die sie
 * selbst anstellte, wäre eine zweite Meinung darüber, welche drei Boards es
 * gibt — dieselbe Begründung wie bei `useBrandInspiration` (D2b).
 *
 * ── SIE HÄLT KEINEN ZUSTAND ──────────────────────────────────────────────
 * Alles hier ist aus dem STORE gerechnet: der Vorschlag steht in `g.dna`, die
 * Wahl in `g.board`, die Mischung in `g.mix`. Es gibt bewusst keine zweite
 * Ablage im Browser — eine, die den Reload überlebt, wäre der gespeicherte
 * Wert selbst, und eine, die ihn nicht überlebt, widerspräche ihm nach dem
 * ersten Seitenaufbau. Deshalb braucht das Composable auch keine Marken-Id:
 * der Store trägt immer genau eine Marke.
 *
 * „FESTGEHALTEN" IST DIE AUSNAHME und wohnt deshalb NICHT hier, sondern in der
 * Mix-Komponente: das Schloss ist eine GESTE beim Mischen („den Rest bitte
 * neu, dieses hier nicht"), keine Festlegung über die Marke. Gespeichert
 * müsste es in `g.mix` mitreisen und stünde damit im Handbuch.
 *
 * ── SIE SCHREIBT NICHTS ──────────────────────────────────────────────────
 * Sie RECHNET die Werte aus, die in `g.boards` und `g.mix` gehören; geschrieben
 * werden sie von der SEITE über `setSlotValue` + Autosave — dieselbe
 * Arbeitsteilung wie überall in dieser Werkstatt (die Komponente zeigt, die
 * Seite entscheidet). Ein zweiter Autosave-Lauf neben dem der Seite wäre ein
 * zweiter Schreiber auf dieselbe `revision`.
 */
export function useBrandDnaBoards() {
  const store = useBrandWorkspaceStore()

  /** Die Sprache, in der die WERTE stehen — nie die der Oberfläche. */
  const contentLocale = computed(() => (store.profile?.contentLocale === 'en' ? 'en' : 'de'))

  /**
   * Der bestätigte oder entworfene Vorschlag. `[]`, solange er nicht lesbar
   * ist — ohne ihn gibt es keine Boards, und drei leere Karten wären
   * schlechter als keine.
   */
  const proposal = computed<readonly BrandDnaProposalEntry[]>(() =>
    parseBrandDnaSlotValue(store.slotValue('g.dna')) ?? [])

  /**
   * Die Richtung aus Kapitel 10 der Foundation liegt in einem FREMDEN Kapitel;
   * sie reist als `sourceValues` in der Kapitel-Antwort mit (Muster von G4).
   * Fehlt sie, fällt `brandDnaBoards` auf die erste des Katalogs zurück.
   */
  const directionId = computed(() => store.sourceValues['result.direction'] ?? '')

  const boards = computed<readonly BrandDnaBoard[]>(() =>
    (proposal.value.length ? brandDnaBoards(brandDnaValuesOf(proposal.value), directionId.value) : []))

  const chosenBoardId = computed(() => store.slotValue('g.board'))

  /**
   * WOHER JEDE DIMENSION KOMMT — aus dem gespeicherten Mix, sonst „alles aus
   * dem gewählten Board".
   */
  const sources = computed<BrandDnaMixSources>(() => {
    const chosen = chosenBoardId.value || boards.value[0]?.id || ''
    const stored = parseBrandDnaMixSlotValue(store.slotValue('g.mix'))
    if (!stored) return brandDnaMixDefault(chosen)
    const known = new Set(boards.value.map(board => board.id))
    // Ein Board, das es nicht mehr gibt (ein neuer Vorschlag hat die Karten
    // ersetzt), fällt auf die Wahl zurück statt ins Leere zu zeigen.
    return Object.fromEntries(stored.map(entry =>
      [entry.dimension, known.has(entry.board) ? entry.board : chosen]))
  })

  const mixEntries = computed(() =>
    (boards.value.length ? brandDnaMixEntries(boards.value, sources.value, proposal.value) : []))

  /** Das Board, dessen FARBWELT der Stand zeigt (Davids „Farbwelt aus 1"). */
  const colorBoard = computed<BrandDnaBoard | null>(() =>
    boards.value.find(board => board.id === sources.value.color) ?? boards.value[0] ?? null)

  /** Das Board, dessen TYPOGRAFIE der Stand zeigt („… Typografie aus 3"). */
  const typeBoard = computed<BrandDnaBoard | null>(() =>
    boards.value.find(board => board.id === sources.value.typography) ?? boards.value[0] ?? null)

  /**
   * Der Wert, der in `g.boards` gehört. Die SEITE vergleicht ihn mit dem, was
   * dasteht, und schreibt nur bei Unterschied — ohne diesen Vergleich schriebe
   * jeder Renderdurchlauf denselben Text und der Autosave liefe im Kreis.
   */
  const boardsSlotValue = computed(() =>
    (boards.value.length ? brandDnaBoardsSlotValue(boards.value, contentLocale.value) : ''))

  /** Der Wert, der in `g.mix` gehört — für die aktuelle oder eine neue Belegung. */
  function mixSlotValue(next: BrandDnaMixSources = sources.value): string {
    if (!boards.value.length) return ''
    return brandDnaMixSlotValue(
      brandDnaMixEntries(boards.value, next, proposal.value),
      contentLocale.value,
    )
  }

  /** Die nächste Belegung nach „Nicht festgehaltene neu vorschlagen". */
  function resuggested(held: Readonly<Record<string, boolean>>): BrandDnaMixSources {
    return brandDnaResuggest(sources.value, held, boards.value)
  }

  /** Eine einzelne Dimension auf ein anderes Board legen. */
  function withSource(dimensionId: string, boardId: string): BrandDnaMixSources {
    return { ...sources.value, [dimensionId]: boardId }
  }

  return {
    contentLocale,
    proposal,
    boards,
    chosenBoardId,
    sources,
    mixEntries,
    colorBoard,
    typeBoard,
    boardsSlotValue,
    mixSlotValue,
    resuggested,
    withSource,
  }
}
