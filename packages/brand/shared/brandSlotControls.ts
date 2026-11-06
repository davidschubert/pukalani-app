/**
 * WELCHE BEDIENELEMENTE ZEIGT EIN SLOT? — die eine Rechnung hinter der
 * Werkstatt-Bühne (Davids Live-Walkthrough, 2026-09-02).
 *
 * ── WARUM DAS EINE FUNKTION IST UND KEINE FÜNFZEHN `v-if` ─────────────────
 * Bis hierher stand die Sichtbarkeit jedes Elements als eigener Ausdruck im
 * Markup: der Bestätigungs-Knopf hier, das Hinweis-Feld dort, der Entwurfs-
 * Rahmen an dritter Stelle. Solange es nur zwei Zustände gab, ging das gut.
 * Mit dem BESTÄTIGTEN Slot kommt ein dritter dazu, und ab dann ist die Frage
 * nicht mehr „zeige ich X", sondern „welche Elemente gehören zu Zustand Y" —
 * eine Frage, die man EINMAL beantwortet und danach prüfen kann.
 *
 * Der Anlass war ein echter Befund: der Bestätigungs-Knopf wurde nach dem
 * Klick nur ausgegraut, das Feld blieb beschreibbar, und der nächste
 * Tastendruck schrieb still einen neuen `latestDraft` NEBEN die bestätigte
 * Fassung. Der Mensch sah einen Text, das Dokument trug einen anderen —
 * Davids Satz dazu: „wenn confirmed müsste es unmöglich sein zu korrigieren,
 * außer wir klicken auf einen Button Korrigieren".
 *
 * ── DER ZUSTAND IST DREIWERTIG, DIE HERKUNFT IST ES NICHT ─────────────────
 * `state` beantwortet die Frage der AMPEL: leer · ein unbestätigter Wert ·
 * bestätigt. Ob dieser Wert von George kam oder getippt wurde, ist eine ANDERE
 * Frage — sie hängt an `showDraftBadge` (Georges Handschrift, §3b.3) und darf
 * nicht in die Ampel wandern: ein selbst getippter, unbestätigter Text ist
 * genauso „offen" wie ein Entwurf, und eine Ampel, die das unterscheidet,
 * beantwortet zwei Fragen mit einer Farbe.
 *
 * ── DIE FARBEN STEHEN SCHON IM SYSTEM ─────────────────────────────────────
 * Bernstein ist `--bw-draft` (die Familie des DRAFT-BY-GEORGE-Etiketts), Grün
 * ist `--bw-accent`. Beide gibt es in Hell und Dunkel, beide haben eine
 * `-soft`-Fläche. Zwei neue semantische Variablen wären eine zweite Wahrheit
 * über dieselbe Farbe — deshalb kommen hier keine dazu.
 *
 * PURE, ohne Vue und ohne i18n: dasselbe Muster wie `brandSlotReadiness.ts`
 * und `brandJourney.ts`.
 */

/** Die Ampel eines Slots. `draft` = es steht etwas drin, aber unbestätigt. */
export type BrandSlotVisualState = 'empty' | 'draft' | 'confirmed'

export interface BrandSlotControlsInput {
  /** `brand_steps.slots[id].confirmed` trägt Text — der Mensch hat zugestimmt. */
  confirmed: boolean
  /** Steht überhaupt ein Text im Feld (lokal oder vom Server)? */
  hasValue: boolean
  /** Die Markierung aus `georgeDrafts` (§3b.3) — Herkunft, nicht Zustand. */
  isGeorgeDraft: boolean
  /** `slot.editor !== 'none'` — eine Ableitung hat kein Eingabefeld. */
  hasEditor: boolean
  /** `slot.type !== 'special'` — der Paarvergleich ist ein eigenes Instrument. */
  confirmable: boolean
  /** `slot.generator !== 'none'` — eine reine Menschenfrage entwirft niemand. */
  generatable: boolean
  /** Es gab je einen gespeicherten Text (`firstDraft`). */
  hasHistory: boolean
  /** Das Bereitschafts-Gate (`slotReadiness`) sagt: genug Material da. */
  ready: boolean
}

export interface BrandSlotControls {
  state: BrandSlotVisualState
  /** Darf getippt werden? Ein bestätigter Slot ist zu — das ist die ganze Regel. */
  editable: boolean
  /**
   * ZEIGT DIESER SLOT SEINEN TEXT STATT SEINES FELDES? (Davids Wortlaut
   * 2026-09-02: „kann man dann dort direkt den antworttext zeigen, anstatt den
   * antworttext im form field").
   *
   * Ein bestätigter Slot ist kein Eingabegerät mehr, sondern eine STELLE IM
   * DOKUMENT. Ein schreibgeschütztes Feld sagt das nicht: es sieht aus wie ein
   * Feld, es hat einen Rahmen wie ein Feld, und es lädt zum Tippen ein, das
   * dann nichts tut. Also fällt der Rahmen weg und der Text steht als Fliesstext
   * da — dieselbe Typografie wie der übrige Dokument-Körper.
   *
   * DIE ENTSCHEIDUNG STEHT HIER UND NICHT ALS `v-if` IM MARKUP, weil sie an
   * derselben Ampel hängt wie `editable`: die beiden sind zwei Seiten
   * derselben Münze, und getrennt geschriebene Seiten laufen auseinander.
   *
   * `hasEditor` ist Bedingung: eine Ableitung (`editor: 'none'`) steht ohnehin
   * schon als Text da und hat kein Feld, das man ersetzen könnte.
   */
  renderAsText: boolean
  /** „Entwurf von George" (Herkunft) — fällt mit der Bestätigung weg. */
  showDraftBadge: boolean
  /** „Bestätigt" (Zustand) — steht an derselben Stelle wie das Entwurfs-Etikett. */
  showConfirmedBadge: boolean
  showConfirm: boolean
  confirmEnabled: boolean
  /**
   * STEHT DA, WARUM DER BESTÄTIGEN-KNOPF NICHT GEHT? (Davids Befund 9,
   * 2026-09-09).
   *
   * Der Knopf war in diesem Zustand nie klickbar — `confirmEnabled` ist seit
   * jeher `hasValue`, und das Markup setzt `:disabled` auf ein natives
   * `<button>`. Er sah nur nicht danach aus: `.bw-confirm--open:disabled` blasst
   * ihn auf 40 % Deckkraft ab, mehr nicht. Wer auf einer Karte, die „Noch offen
   * — kommt im Gespräch" sagt, darauf klickt, bekommt also weder eine Wirkung
   * noch eine Auskunft — der stille No-op aus Davids Durchlauf.
   *
   * Die Karte sagt es jetzt in EINER Zeile. Und zwar nur dort, wo es nicht
   * schon dasteht: solange der Bereitschafts-Hinweis (`showReadinessNote`)
   * erklärt, was zum ENTWERFEN fehlt, wäre ein zweiter Satz über dasselbe
   * leere Feld eine Wiederholung — dieselbe Regel wie „entweder der Hinweis
   * oder die Werkzeuge".
   */
  showConfirmBlockedNote: boolean
  /** „Korrigieren" — die EINZIGE Tür zurück in den offenen Zustand. */
  showRevise: boolean
  showReadinessNote: boolean
  showGenerate: boolean
  showHint: boolean
  showVersions: boolean
  /**
   * Darf eine frühere Fassung ZURÜCKGEHOLT werden? Auf einem bestätigten Slot
   * nicht: das Wiederherstellen schreibt eine gewöhnliche lokale Eingabe, und
   * die weist der Server jetzt mit `slot_confirmed` ab. Ein Knopf, der einen
   * Konflikt erzeugt, den der Mensch nicht ausgelöst hat, ist schlechter als
   * ein sichtbar abgeschalteter — die LISTE bleibt deshalb lesbar, nur die
   * Übernahme ruht bis „Korrigieren".
   */
  canRestoreVersion: boolean
  /**
   * Zählt dieser Slot in den Kapitel-Balken? Nur, was der Mensch überhaupt
   * bestätigen KANN — ein Nenner, den niemand bewegen kann, hielte den Balken
   * für immer unter 100 %.
   *
   * ── DAS IST NICHT DASSELBE WIE „HAT EIN FELD" (Audit-Befund A4) ──────────
   * Bis zum 2026-09-02 stand hier `confirmable && hasEditor`, und weil
   * `showConfirm`/`showRevise` daran hingen, trug eine ABLEITUNG (`editor:
   * 'none'`) nie einen Bestätigen-Knopf. Im Baustein `archetype` sind vier der
   * zwölf Pflicht-Entscheidungen genau das: George leitet sie ab, ein Mensch
   * bestätigt sie. Ohne Knopf blieben sie offen, die Konfidenz-Weiche kam nie,
   * der Baustein war zu.
   *
   * ANNEHMEN und TIPPEN sind zwei Dinge: `editable` hängt weiter am Feld
   * (ohne Feld tippt niemand), die ZUSTIMMUNG hängt nur daran, ob der Slot
   * überhaupt eine kennt (`confirmable`, s. `slotIsConfirmable`).
   */
  countsForProgress: boolean
}

/**
 * DIE ZUSTANDS-ENTSCHEIDUNG. Bestätigt schlägt alles: kein Tippen, kein
 * Entwerfen, kein Hinweis, kein Wiederherstellen — nur „Korrigieren".
 *
 * Umgekehrt ist der offene Zustand exakt das bisherige Verhalten; wer diese
 * Funktion mit `confirmed: false` füttert, bekommt die Werkstatt von vorher.
 */
export function brandSlotControls(input: BrandSlotControlsInput): BrandSlotControls {
  const countsForProgress = input.confirmable
  const showVersions = input.generatable && input.hasHistory
  const showReadinessNote = input.generatable && !input.ready

  if (input.confirmed) {
    return {
      state: 'confirmed',
      editable: false,
      renderAsText: input.hasEditor,
      // Die Bestätigung ist die Übernahme: ab hier ist es SEIN Text, auch wenn
      // George ihn geschrieben hat. Beide Etiketten nebeneinander behaupteten
      // zwei Dinge gleichzeitig.
      showDraftBadge: false,
      showConfirmedBadge: true,
      showConfirm: countsForProgress,
      confirmEnabled: false,
      // Ein bestätigter Slot hat seinen Wert — hier fehlt nichts.
      showConfirmBlockedNote: false,
      showRevise: countsForProgress,
      // Was fehlt, um zu entwerfen, ist gegenstandslos, solange nicht entworfen
      // werden darf.
      showReadinessNote: false,
      showGenerate: false,
      showHint: false,
      showVersions,
      canRestoreVersion: false,
      countsForProgress,
    }
  }

  return {
    state: input.hasValue ? 'draft' : 'empty',
    editable: input.hasEditor,
    // Offen heisst: hier wird geschrieben. Das Feld bleibt das Feld.
    renderAsText: false,
    showDraftBadge: input.isGeorgeDraft,
    showConfirmedBadge: false,
    showConfirm: countsForProgress,
    // Einen leeren Slot zu bestätigen lehnt die Route mit `slot_empty` ab —
    // der Knopf sagt es vorher.
    confirmEnabled: input.hasValue,
    // … und die Karte sagt WARUM (Befund 9), sofern nicht schon der
    // Bereitschafts-Hinweis über dasselbe leere Feld spricht.
    showConfirmBlockedNote: countsForProgress && !input.hasValue && !showReadinessNote,
    showRevise: false,
    // Entweder steht da, WAS fehlt, oder es stehen die Werkzeuge da. Beides
    // nebeneinander wäre ein Knopf neben seiner eigenen Absage.
    showReadinessNote,
    showGenerate: input.generatable && input.ready,
    showHint: input.generatable && input.ready,
    showVersions,
    canRestoreVersion: true,
    countsForProgress,
  }
}

/**
 * WELCHER KNOPF STEHT AUF EINER KARTE IM NOTIZBLOCK? (Davids Befund 18,
 * 2026-09-09.)
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Jede Karte trug „Korrigieren" — auch die LEEREN. Auf einer Karte, die „Noch
 * offen — kommt im Gespräch" sagt, ist das das falsche Wort: es gibt nichts zu
 * korrigieren, es gibt etwas zu TUN. Und was zu tun ist, hängt an der
 * Arbeitsform: eine Frage wird beantwortet, eine Ableitung wird entworfen.
 *
 * ── VIER ANTWORTEN, UND JEDE FÜHRT AN DIESELBE STELLE ────────────────────
 * 'revise'  es steht etwas da (bestätigt oder nicht) — die bisherige Tür.
 * 'answer'  leer und fragbar ⇒ „Beantworten", springt in die Session.
 * 'draft'   leer und entwerfbar ⇒ „Entwerfen", springt in die Session (dort
 *           beansprucht `brandStageClaim` das Entwurfs-Modul).
 * 'none'    nichts anzubieten: der Paarvergleich (`d.pairs`, nicht bestätigbar)
 *           und die deterministisch gerechneten Felder der Design-Kapitel
 *           (`h.ramp`, `i.scale` …), die von den Panels darüber gefüllt werden.
 *           Ein Knopf, der auf eine leere Bühne führte, wäre schlimmer als
 *           keiner.
 *
 * BESTÄTIGEN bleibt davon unberührt: der Knopf steht weiter da, deaktiviert,
 * mit dem Satz daneben (`showConfirmBlockedNote`, Befund 9). Die zwei Befunde
 * beantworten zwei Fragen — „warum geht das nicht" und „was geht stattdessen".
 */
export type BrandCardAction = 'revise' | 'answer' | 'draft' | 'none'

export interface BrandCardActionInput {
  confirmed: boolean
  hasValue: boolean
  /** `slot.type === 'question' | 'choice'` — George stellt diese Session als FRAGE. */
  askable: boolean
  /** `slotIsConfirmable(slot)` — der Paarvergleich kennt keine Zustimmung. */
  confirmable: boolean
  /** `slot.generator !== 'none'` — es gibt einen Knopf, der dieses Feld füllt. */
  generatable: boolean
}

export function brandLogCardAction(input: BrandCardActionInput): BrandCardAction {
  if (!input.confirmable) return 'none'
  if (input.confirmed || input.hasValue) return 'revise'
  if (input.askable) return 'answer'
  return input.generatable ? 'draft' : 'none'
}

/** Der Balken EINES Kapitels: bestätigte Entscheidungen von allen möglichen. */
export interface BrandChapterProgress {
  confirmed: number
  total: number
  pct: number
}

/**
 * DER KAPITEL-BALKEN IST NICHT DER GESAMT-BALKEN (zwei Balken, zwei Fragen).
 *
 * Unten in der Leiste steht der Weg durch das ganze Branding; hier steht „wie
 * weit bin ich in DIESEM Kapitel". Gezählt wird deshalb ausschliesslich, was
 * auf dieser Seite sichtbar ist — inklusive der optionalen Slots, denn der
 * Mensch sieht sie und würde einen Balken nicht verstehen, der sie
 * unterschlägt (`stepProgress` zählt bewusst nur die PFLICHT-Slots und
 * beantwortet damit die andere Frage: „darf ich abschliessen").
 */
export function brandChapterProgress(
  controls: readonly BrandSlotControls[],
): BrandChapterProgress {
  const relevant = controls.filter(entry => entry.countsForProgress)
  const confirmed = relevant.filter(entry => entry.state === 'confirmed').length
  return {
    confirmed,
    total: relevant.length,
    pct: relevant.length === 0 ? 0 : Math.round((confirmed / relevant.length) * 100),
  }
}
