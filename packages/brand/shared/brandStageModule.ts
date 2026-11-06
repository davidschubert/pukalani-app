import type { BrandSlotType } from './slotRegistry'

/**
 * WELCHES MODUL ZEIGT DIE BÜHNE — UND ZU WELCHEM FELD? (Kailua-Befund 5,
 * Davids Entscheidung „Weg B", 2026-09-08).
 *
 * ── DER BEFUND, IN EINEM ABSATZ ───────────────────────────────────────────
 * Vier Sessions des Kapitels `context` (`a.pitch`, `a.category`,
 * `a.competitors`, `a.audienceSketch`) sind `derivation`/`stage-edit` — für
 * sie gibt es KEINE Katalog-Frage, `resolveNextSession` filtert sie über die
 * fragbaren Arbeitsformen heraus. Sie stehen aber ganz vorn in der Registry,
 * und `resolveActiveSession` nimmt beim Betreten des Kapitels die erste OFFENE
 * Session — also `a.pitch`. Die Bühne rechnete ihr Modul dagegen aus
 * `nextSlot`, und das war die erste offene FRAGE des Kapitels (`a.origin`).
 * Ergebnis: die Session hiess `a.pitch`, die Bühne fragte nach `a.origin`, und
 * der Entwurfs-Knopf des Feldes, auf dem der Mensch sass, war nirgends.
 *
 * ── DIE REGEL: DIE AKTIVE SESSION BEANSPRUCHT IHRE EIGENE BÜHNE ───────────
 * Bühnen-Frage = Session-Slot, nie ein fremder. Wer eine Session angesteuert
 * hat (oder von der Rangfolge dorthin gesetzt wurde), sieht das Modul GENAU
 * DIESES Feldes — die Katalog-Frage eines anderen Feldes ist dort ein
 * Themenwechsel, den niemand ausgelöst hat.
 *
 * ── WARUM DAS EINE PURE FUNKTION IST ──────────────────────────────────────
 * Dieselbe Begründung wie bei `brandSlotControls`: die Frage „welches Modul
 * gehört zu diesem Zustand" wird EINMAL beantwortet und ist danach prüfbar.
 * Als `v-if`-Kette im Markup war sie über `activeAwaitsConfirm`, `nextSlot`
 * und `stageModule` verteilt, und genau in der Naht dazwischen sass der
 * Befund. Pur heisst hier: kein Vue, kein i18n, keine Registry-Abfrage — die
 * Aufrufstelle reicht die fünf Tatsachen herein, die sie ohnehin schon hat.
 */

/**
 * GENAU EIN MODUL IST DRAN — die Bühne fragt nie zwei Dinge gleichzeitig.
 *
 * 'answer'  offene Menschenfrage → Beispiel-Link, geantwortet wird im Prompt
 * 'options' offene Auswahl       → volle Zeilen, „Übermitteln" unten rechts
 * 'draft'   George entwirft/hat entworfen → Nochmal · Korrigieren · Übernehmen
 * 'confirm' es steht ein Text, der nur noch bestätigt werden muss
 * 'gate'    alle Pflicht-Slots bestätigt → die Konfidenz-Weiche
 * 'none'    nichts offen und nichts zu bestätigen
 */
export type BrandStageModule = 'answer' | 'options' | 'draft' | 'confirm' | 'gate' | 'none'

/** Was die Bühne über die AKTIVE Session weiss — mehr braucht die Regel nicht. */
export interface BrandStageActiveSession {
  id: string
  /** `slot.type` aus der Registry: 'question'/'choice' sind Katalog-Fragen. */
  type: BrandSlotType
  /** `slotIsConfirmable(slot)` — der Paarvergleich (`special`) kennt keine Zustimmung. */
  confirmable: boolean
  /** `slot.generator !== 'none'` — es gibt einen Knopf, der dieses Feld füllen kann. */
  generatable: boolean
  /** `controls.showGenerate` — entwerfbar UND genug Material (Bereitschafts-Gate). */
  canGenerate: boolean
  /** Steht ein Text im Feld (lokal oder vom Server)? */
  hasValue: boolean
  confirmed: boolean
}

/**
 * DER ANSPRUCH DER AKTIVEN SESSION auf die Bühne. `null` heisst: sie erhebt
 * keinen — dann gilt unverändert die Grundfassung (nächste Katalog-Frage des
 * Kapitels, sonst das erste offene Pflicht-Feld).
 */
export interface BrandStageClaim {
  module: 'answer' | 'options' | 'draft' | 'confirm'
  /** Das Feld, dessen Frage/Karte die Bühne zeigt — immer die Session selbst. */
  slotId: string
}

/**
 * ── DIE VIER ZEILEN, UND WARUM JEDE SO HERUM STEHT ────────────────────────
 *
 * 1. EINE UNBEANTWORTETE KATALOG-FRAGE ZEIGT IHR EIGENES MODUL. Frage ⇒
 *    Antwort-Modul, Auswahl ⇒ Options-Modul — beide zu GENAU diesem Feld.
 * 2. EINE BEANTWORTETE, ABER UNBESTÄTIGTE KATALOG-FRAGE BEHÄLT DIE BÜHNE
 *    (Testlauf-Befunde A/G, 2026-09-09). Bis zum Session-Abschluss gab sie sie
 *    FREI, sobald ein Wert dastand — und weil der Auto-Sprung nach der Antwort
 *    entfallen ist (Davids Entscheidung 2026-09-09), fiel die Bühne danach auf
 *    die nächste offene Frage des KAPITELS zurück. Die Folge im Live-Test: in
 *    der Session „Kundenstimmen" stand das Eingabe-Modul von „Zahlen & Fakten",
 *    und die nächste getippte Antwort landete in „Kritik & Beschwerden". Eine
 *    beantwortete Session ist nicht fertig, sie ist unbestätigt — und genau
 *    dafür ist die Bestätigungs-Karte da.
 * 3. WER NICHTS BESTÄTIGEN KANN, BEANSPRUCHT NICHTS. `d.pairs` hat weder Feld
 *    noch Zustimmung — eine Karte mit „Übernehmen" wäre dort ein Knopf ohne
 *    Wirkung (Audit A4). Ebenso ein bereits bestätigtes Feld: dort ist
 *    „Korrigieren" die einzige Tür, und die hängt an der Karte, nicht an der
 *    Bühne.
 * 4. ENTWURFS-SESSION MIT WERT: das bisherige Verhalten
 *    (`activeAwaitsConfirm`) — Entwurfs-Modul, wo entworfen werden darf, sonst
 *    die reine Bestätigungs-Karte.
 * 5. ENTWURFS-SESSION, LEER UND ENTWERFBAR: das NEUE aus Weg B. Die Session
 *    hat einen Knopf, der sie füllen kann, also zeigt die Bühne ihn — mit
 *    Georges Frage zu diesem Feld und einem Eingabefeld, dessen Text als
 *    HINWEIS in den Entwurf geht. Der Deckel dagegen ist bewusst `generatable`
 *    und NICHT `canGenerate`: fehlt Material, gehört genau dieser Satz auf die
 *    Bühne (`showReadinessNote`) und nicht die Frage eines fremden Feldes.
 *
 * LEER UND NICHT ENTWERFBAR gibt die Bühne frei: die deterministisch
 * gerechneten Felder der Design-Kapitel (`h.ramp`, `i.scale`, `j.examples` …)
 * werden von den Panels DARÜBER gefüllt, und eine leere Karte mit einem
 * abgeschalteten Knopf hätte hier nichts anzubieten.
 */
export function brandStageClaim(active: BrandStageActiveSession | null): BrandStageClaim | null {
  if (!active) return null

  if (active.type === 'question' || active.type === 'choice') {
    if (!active.hasValue) {
      return { module: active.type === 'choice' ? 'options' : 'answer', slotId: active.id }
    }
    // Beantwortet: erst die Bestätigung gibt die Bühne frei (s. Zeile 2/3).
    if (active.confirmed || !active.confirmable) return null
    return { module: 'confirm', slotId: active.id }
  }

  if (!active.confirmable || active.confirmed) return null
  if (active.hasValue) return { module: active.canGenerate ? 'draft' : 'confirm', slotId: active.id }
  return active.generatable ? { module: 'draft', slotId: active.id } : null
}

/**
 * WOHIN GEHÖRT EINE GETIPPTE ANTWORT — UND ERSETZT SIE ODER ERGÄNZT SIE?
 * (Testlauf-Befunde A und D, 2026-09-09.)
 *
 * ── DER BEFUND, IN EINEM ABSATZ ───────────────────────────────────────────
 * Die Bühne rechnete das Ziel einer getippten Antwort aus `nextSlot` — der
 * NÄCHSTEN offenen Katalog-Frage des Kapitels. Solange nach jeder Antwort
 * automatisch weitergesprungen wurde, waren „aktive Session" und „nächste
 * Frage" dasselbe. Seit der Sprung entfallen ist (Davids Entscheidung
 * 2026-09-09), laufen beide auseinander: in der Session `a.customerPraise`
 * landete die getippte Nachricht wortwörtlich in `a.complaints`, die nächste in
 * `a.oneThing` — drei Felder, die niemand beantwortet hat.
 *
 * ── DIE REGEL ─────────────────────────────────────────────────────────────
 * Eine getippte Antwort gehört IMMER der AKTIVEN Session, nie der nächsten
 * Frage. Sie schreibt aber nur dort, wo es etwas zu beantworten gibt: eine
 * Katalog-Frage (`question`/`choice`), die noch nicht bestätigt ist. Alles
 * andere — eine Ableitung, eine bestätigte Session, gar keine Session — macht
 * aus dem Text einen reinen Gesprächszug ohne Feld.
 *
 * ── UND SIE ÜBERSCHREIBT NICHTS, WAS SCHON DASTEHT (Befund D) ────────────
 * „Ich ergänze noch etwas" heisst ERGÄNZEN. Ein zweiter Satz zu derselben
 * Frage ist kein Ersatz für den ersten: würde er ihn überschreiben, verlöre
 * genau der Knopf seine Bedeutung, der ihn eingeladen hat. Steht also schon
 * eine Antwort, wird ANGEHÄNGT; ist das Feld leer, wird gesetzt. Wer seine
 * Antwort wirklich ersetzen will, geht über „Korrigieren" — die eine Tür, die
 * dafür da ist.
 *
 * ── EINE BEANTWORTETE AUSWAHL NIMMT NICHTS ENTGEGEN ──────────────────────
 * Ihr Wert ist eine stabile Id aus einem geschlossenen Vertrag
 * (`brandChoiceOptions`), kein Text: angehängte Prosa machte daraus einen
 * Wert, den weder das Dokument noch der Generator lesen kann. Solange sie
 * OFFEN ist, gehört ihr die eigene Formulierung sehr wohl — sonst hätte das
 * Options-Modul kein Ziel.
 */
export type BrandAnswerMode = 'set' | 'append'

export interface BrandAnswerTarget {
  slotId: string
  mode: BrandAnswerMode
}

export function brandAnswerTarget(active: BrandStageActiveSession | null): BrandAnswerTarget | null {
  if (!active) return null
  if (active.type !== 'question' && active.type !== 'choice') return null
  if (active.confirmed) return null
  if (!active.hasValue) return { slotId: active.id, mode: 'set' }
  if (active.type === 'choice') return null
  return { slotId: active.id, mode: 'append' }
}

/**
 * STEHT DIE STATISCHE KATALOG-FRAGE UNTER DEM GESPRÄCH? (Dritter Testlauf,
 * Befund 2, 2026-09-10.)
 *
 * ── DER BEFUND, IN EINEM ABSATZ ───────────────────────────────────────────
 * Die Bühne hängt unter die Züge des Beraters die Katalog-Frage des Feldes,
 * sofern der Server nicht gemeldet hat, dass DIESER Zug sie gestellt hat
 * (`coveredSlotId` aus dem Abschluss-Frame). Diese Auskunft gibt es aber nur
 * für den EINEN Zug, der gerade gelaufen ist — und sie ist bewusst leer,
 * solange die Session unbestätigt bleibt (`staysOnSession` in
 * `converse.post.ts` setzt `askedSlotId` dann auf `''`). Folge im Live-Lauf:
 * unter JEDER Teilantwort der Sammel-Session stand zusätzlich die statische
 * Klammer-Frage („Ein paar schnelle Zahlen: Wie groß ist das Team, wie lange
 * machst du das schon, welche Märkte?") — sie fragte auch das noch einmal, was
 * eine Zeile darüber schon beantwortet war. Nach einem RELOAD dasselbe in jeder
 * Frage-Session: der Verlauf trägt Georges Frage, `coveredSlotId` ist beim
 * Laden `null`, und die Katalog-Frage stand ein zweites Mal darunter.
 *
 * ── DIE REGEL ─────────────────────────────────────────────────────────────
 * Die statische Zeile ist ein ERSATZ für einen Zug, den es nicht gibt — nie
 * eine Ergänzung zu einem, den es gibt. Sie steht deshalb nur da, solange im
 * Verlauf DIESER Session noch kein Zug des Beraters steht, der dieses Feld
 * fragt. In der SAMMEL-Session steht sie nie: dort fragt George die TEILfrage,
 * und die Klammer-Frage daneben ist immer die falsche Auskunft.
 *
 * `ownSession` ist die dritte Tatsache und keine Formalität: fällt die Bühne
 * auf „die nächste offene Frage des KAPITELS" zurück (die aktive Session ist
 * bestätigt oder erhebt keinen Anspruch), dann handeln Georges Züge von einem
 * ANDEREN Feld — seine Anwesenheit sagt über diese Frage nichts.
 */
export interface BrandStaticQuestionFacts {
  /** Die Session, in der gesprochen wird, sammelt ihre Teile nacheinander. */
  collecting: boolean
  /** Fragt die statische Zeile das Feld der AKTIVEN Session? */
  ownSession: boolean
  /** Steht im Verlauf dieser Session schon ein Zug des Beraters? */
  advisorSpoke: boolean
}

export function brandStaticQuestionVisible(facts: BrandStaticQuestionFacts): boolean {
  if (facts.collecting) return false
  return !(facts.ownSession && facts.advisorSpoke)
}

/**
 * DIE ÜBERSCHRIFT UND DER PLATZHALTER DER ANTWORT-KARTE (Dritter Testlauf,
 * Befund 9, 2026-09-10).
 *
 * ── ZWEI KLEINE UNWAHRHEITEN AUF EINER KARTE ─────────────────────────────
 *  1. Im Eingabefeld stand „Oder etwas ganz Eigenes …" — ohne die Auswahl, auf
 *     die sich das „Oder" bezieht. Für eine Session mit geschlossenem Vertrag
 *     (Richtungen, Moodboards, Chip-Karten) ist der Satz richtig; steht das
 *     Feld ALLEIN da, verweist er auf etwas, das es nicht gibt.
 *  2. Die Karte trug den Namen der SESSION („Zahlen & Fakten"), während George
 *     daneben den einzelnen Teil fragte („Seit wann gibt es dich?"). Solange
 *     eine Sammel-Session läuft, gehört die laufende TEILfrage in die
 *     Überschrift — sonst beschriftet die Karte eine andere Frage als die, die
 *     gerade beantwortet wird.
 *
 * PUR und mit SCHLÜSSELN statt Sätzen: dieselbe Trennung wie in
 * `brandFoundation.ts` — die Regel gehört dem Layer, der Text dem Katalog.
 * `partKey` ist `''`, wo keine Sammel-Session läuft; dann bleibt es beim
 * Feld-Etikett, das die Aufrufstelle ohnehin schon kennt.
 */
export interface BrandStageAnswerCardFacts {
  /** Rendert die Karte gerade Auswahl-Karten (Richtungen, Boards, Chips)? */
  hasOptions: boolean
  /** Der i18n-Schlüssel der laufenden TEILfrage — `''`, wo keine läuft. */
  partKey: string
}

export interface BrandStageAnswerCard {
  /** Überschrift: die Teilfrage, solange eine läuft — sonst `''` (Feld-Etikett). */
  titleKey: string
  placeholderKey: string
}

export const BRAND_OWN_ANSWER_PLACEHOLDER_KEY = 'brand.workspace.ownAnswerPlaceholder'
export const BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY = 'brand.workspace.ownAnswerPlaceholderPlain'

export function brandStageAnswerCard(facts: BrandStageAnswerCardFacts): BrandStageAnswerCard {
  return {
    titleKey: facts.partKey,
    placeholderKey: facts.hasOptions
      ? BRAND_OWN_ANSWER_PLACEHOLDER_KEY
      : BRAND_OWN_ANSWER_PLAIN_PLACEHOLDER_KEY,
  }
}

/**
 * ZEIGT DIE BÜHNE GERADE DAS ANTWORT-MODUL EINER ENTWURFS-SESSION? — der eine
 * Zustand, in dem der getippte Text NICHT in den Chat geht, sondern als
 * Hinweis in `generateSlot()`.
 *
 * Er hängt am LEEREN Feld und nicht am Modul allein: steht schon ein Entwurf
 * da, ist „Nochmal, mit Hinweis" der richtige Weg, und der hat sein eigenes
 * Ausklapp-Feld. Zwei gleichzeitig offene Hinweis-Zeilen wären zwei Felder für
 * dieselbe Eingabe.
 */
export function brandStageAwaitsDraftAnswer(claim: BrandStageClaim | null, hasValue: boolean): boolean {
  return claim?.module === 'draft' && !hasValue
}
