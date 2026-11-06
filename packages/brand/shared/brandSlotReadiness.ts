import { type BrandStepKey, dependencyClosure, slotById } from './slotRegistry'
import type { BrandStartCard } from './types/brand'

/**
 * DAS BEREITSCHAFTS-GATE — „zu wenig ist zu wenig" (Davids Entscheidung,
 * 2026-09-01), deterministisch und kostenlos.
 *
 * ── WOZU, WENN GEORGE DOCH NACHFRAGEN KANN ────────────────────────────────
 * Seit `george-a-4` kann das Modell statt eines Entwurfs eine Rückfrage stellen
 * (`outcome: 'question'`). Das kostet aber einen echten Anbieter-Lauf, um zu
 * einer Auskunft zu kommen, die schon VOR dem Klick feststand: wer keine
 * Website eingelesen hat, hat keine vorhandenen Texte, und daran ändert kein
 * Sprachmodell etwas. Was man rechnen kann, fragt man nicht — das Gate spart
 * das Geld, die Wartezeit und den enttäuschten Klick.
 *
 * Die Rückfrage bleibt trotzdem nötig: sie fängt das ab, was man NICHT rechnen
 * kann („die Startkarte ist da, aber sie trägt nichts für dieses Feld").
 *
 * ── DIE QUELLEN SIND DECKUNGSGLEICH MIT DEM GENERATOR ─────────────────────
 * George sieht genau drei Dinge (`BrandGeneratorContext`): die STARTKARTE des
 * Profils, den WEBSITE-TEXT und die Werte der QUELL-SLOTS aus
 * `dependencyClosure()`. Mehr prüft dieses Gate deshalb auch nicht — ein Gate,
 * das andere Quellen zählt als der Prompt, widerspricht George irgendwann
 * öffentlich („George braucht erst X" während George fröhlich entwirft).
 *
 * ── WER DIE FREMDEN BAUSTEINE SIEHT, DARF ÜBER SIE URTEILEN (P3.1) ────────
 * Bis P3.1 las der Generator NUR die Zeile des aktuellen Bausteins; ein
 * Quell-Slot aus einem anderen Baustein war dort leer, und dieses Gate bildete
 * diese Grenze ehrlich mit ab. Seit P3.1 lädt die Route ALLE neun Zeilen (sie
 * liegen ohnehin schon in `loadBrandStepContext`), und die Grenze ist gefallen:
 * `b.purpose` sieht `a.pitch`, `c.candidates` sieht `a.origin`.
 *
 * Der BROWSER sieht sie weiterhin nicht — sein Store trägt nur den offenen
 * Baustein (`applyStepDetail` ersetzt `serverSlots`). Deshalb sagt der Aufrufer
 * mit `coveredSteps`, worüber er überhaupt Bescheid weiss, und die
 * Registry-Regel urteilt nur über abgedeckte Quellen. Der Server reicht alle
 * neun herein und sperrt mit vollem Wissen; die Werkstatt reicht den einen
 * offenen herein und lässt im Zweifel DURCH. Ein Gate, das clientseitig
 * fälschlich sperrt, nimmt dem Menschen einen Knopf, den der Server ihm gegeben
 * hätte — und das ist der teurere Fehler von beiden.
 *
 * ── ANTWORTFORM ───────────────────────────────────────────────────────────
 * `{ ready: true }` oder `{ ready: false, missing: [...] }` mit SPRECHENDEN
 * Bedarfs-Schlüsseln. Die Oberfläche macht daraus einen ruhigen Satz
 * (`brand.workspace.ready.need.*`), die Route ein 409 mit `not_ready`. Ein
 * blosses `false` liesse beiden nur „geht nicht" übrig — und das ist genau die
 * Auskunft, die Davids Leitsatz verbietet.
 */

/** Was fehlt. Ein Schlüssel je Satz in der Oberfläche. */
export type BrandReadinessNeed =
  | 'startcard.about'
  | 'startcard.audience'
  | 'startcard.industry'
  | 'competitor_names'
  | 'source_texts'
  | 'source_slots'
  /** Schicht 3 (K5): ohne die gewählten Produkttypen gibt es kein Muster. */
  | 'name_types'
  /** Schicht 3 (K5): ohne Ton-Wörter gibt es keine Ton-Parameter. */
  | 'tone_words'

export interface BrandReadinessInput {
  startCard: BrandStartCard
  /** Wurde die Website je eingelesen (`brand_profiles.siteAnalysis` nicht leer)? */
  hasSiteAnalysis: boolean
  /** Slot-Id → geltender Wert, so weit der Aufrufer sie kennt (s. `coveredSteps`). */
  records: Readonly<Record<string, string>>
  /**
   * WELCHE BAUSTEINE `records` ABDECKT (s. Kopf). Server: alle neun. Browser:
   * der eine offene. Eine Quelle aus einem NICHT abgedeckten Baustein wird von
   * der Registry-Regel übersprungen — wer sie nicht sehen kann, darf über sie
   * auch nicht urteilen.
   *
   * PFLICHTFELD, obwohl ein Default bequemer wäre: der Default müsste „alles"
   * oder „nur dieser" heissen, und beide Antworten sind für einen der zwei
   * Aufrufer falsch. Ein Typfehler an der neuen Aufrufstelle ist billiger als
   * ein Gate, das still das Falsche annimmt.
   */
  coveredSteps: readonly BrandStepKey[]
}

export type BrandSlotReadiness =
  | { ready: true }
  | { ready: false, missing: BrandReadinessNeed[] }

function filled(value: string | undefined): boolean {
  return (value ?? '').trim().length > 0
}

/**
 * FEHLT DIESE EINE QUELLE — und darf der Aufrufer das überhaupt behaupten?
 *
 * Dieselbe Vorsicht wie in der Registry-Regel unten (s. Kopf, `coveredSteps`):
 * wer einen Slot gar nicht sehen kann, darf nicht sagen, er sei leer. Der
 * SERVER reicht alle Bausteine herein und urteilt mit vollem Wissen; die
 * WERKSTATT kennt nur den offenen Baustein und lässt im Zweifel durch — ein
 * Gate, das clientseitig fälschlich sperrt, nimmt dem Menschen einen Knopf,
 * den der Server ihm gegeben hätte.
 *
 * Ohne diese Klammer wäre `n.guardrails` im Browser IMMER gesperrt:
 * `d.toneWords` liegt im Baustein „Stimme", und der ist beim Kapitel
 * `aiguide` nie geladen.
 */
function needsSource(input: BrandReadinessInput, slotId: string): boolean {
  const home = slotById(slotId)?.stepId
  if (!home || !input.coveredSteps.includes(home)) return false
  return !filled(input.records[slotId])
}

/**
 * Die SLOT-EIGENEN Regeln (Content-Spec §4). Alles, was hier nicht steht, wird
 * allein von der Registry-Regel unten beurteilt.
 *
 * `a.competitors` und `a.toneAnalysis` hängen beide an derselben Tatsache — es
 * gibt Material ausserhalb der vier kurzen Startkarten-Antworten —, benennen
 * sie aber VERSCHIEDEN: dem einen fehlen NAMEN, dem anderen TEXTE. Zwei
 * Schlüssel, weil zwei verschiedene Sätze herauskommen müssen; „lest eure
 * Website ein" hilft beim Ton, beim Wettbewerb kann man die Namen auch selbst
 * eintragen.
 */
const SLOT_RULES: Record<string, (input: BrandReadinessInput) => BrandReadinessNeed[]> = {
  'a.pitch': (input) => {
    const missing: BrandReadinessNeed[] = []
    if (!filled(input.startCard.about)) missing.push('startcard.about')
    if (!filled(input.startCard.audience)) missing.push('startcard.audience')
    return missing
  },
  'a.category': input => (filled(input.startCard.industry) ? [] : ['startcard.industry']),
  'a.audienceSketch': input => (filled(input.startCard.audience) ? [] : ['startcard.audience']),
  // NAMEN kann nur nennen, wer sie irgendwo hingeschrieben hat — heute ist das
  // ausschliesslich die eigene Website. Ohne sie bleibt der Weg über die Hand
  // offen (das Feld ist editierbar), nur eben nicht über George.
  'a.competitors': input => (input.hasSiteAnalysis ? [] : ['competitor_names']),
  // Eine Ton-ANALYSE ohne Texte wäre eine Ton-Erfindung (Instruktion §4 sagt
  // dasselbe; hier kostet die Einsicht nichts).
  'a.toneAnalysis': input => (input.hasSiteAnalysis ? [] : ['source_texts']),

  /**
   * SCHICHT 3 BRAUCHT ZWEI EIGENE REGELN (Konzept BRAND-BOOK-KIT §2.2/§2.3,
   * Paket K5) — die Registry-Regel unten reicht hier NICHT.
   *
   * Sie sperrt erst, wenn ALLE Quellen leer sind, und das ist bei diesen zwei
   * Sessions praktisch nie der Fall: `m.patterns` hängt auch an `b2.model` und
   * `d.toneWords`, `n.guardrails` an sechs Slots. Ohne die eine Quelle, die den
   * ENTWURF trägt, käme trotzdem ein Lauf zustande — und der schriebe Muster
   * für Typen, die niemand gewählt hat, bzw. Ton-Parameter, die es gar nicht
   * gibt. Genau davor steht die Invariante (`checkBrandNamePatterns`), aber sie
   * kostet dann schon einen bezahlten Lauf: was man rechnen kann, fragt man
   * nicht.
   *
   * Es sind die STRUKTUR-Quellen, nicht die inhaltlichen: `m.patterns` verlangt
   * die gewählten TYPEN (aus ihnen entsteht je ein Block), `n.guardrails` die
   * TON-WÖRTER (aus ihnen entsteht die erste der vier Gruppen). Die übrigen
   * Quellen dürfen fehlen — eine Solo-Marke ohne `m.rules` bekommt ihre
   * Schreibweisen aus Titel und Tagline (§2.20 Nr. 4), und genau dafür ist die
   * Abhängigkeit optional.
   */
  'm.patterns': input => (needsSource(input, 'm.types') ? ['name_types'] : []),
  'n.guardrails': input => (needsSource(input, 'd.toneWords') ? ['tone_words'] : []),

  /**
   * BAUSTEIN D STEHT BEWUSST NICHT IN DIESER TABELLE.
   *
   * INTERIM bis zum Paarvergleich-Instrument (Spec §12.2) — Davids Entscheidung
   * 2026-09-04: `d.primary`/`d.secondary` werden im GESPRÄCH hergeleitet statt
   * aus `d.pairs` berechnet. `d.pairs` bleibt leer, solange es das Instrument
   * nicht gibt — und das ist genau der Fall, in dem eine eigene Slot-Regel
   * („ohne Paare kein Archetyp") den einzigen Weg zusperren würde, den es
   * heute gibt.
   *
   * Die Registry-Regel unten lässt den Interim-Weg von selbst durch, und zwar
   * ohne Ausnahme: sie fragt die TRANSITIVE Hülle, und die von `d.primary` ist
   * `d.pairs · d.hypothesis · a.pitch · a.toneAnalysis · a.customerPraise`.
   * Ein leeres `d.pairs` neben einem gefüllten Pitch ist damit „eine Quelle
   * trägt", also bereit — und ein Stand, in dem AUCH Pitch, Ton-Analyse, Lob
   * und Hypothese leer sind, ist zu Recht nicht bereit: daraus lässt sich kein
   * Archetyp ableiten, nur einer erfinden.
   *
   * Es steht als Kommentar hier und nicht nur in den Beweisen, weil die
   * Abwesenheit einer Regel sonst wie ein Versehen aussieht. Kommt das
   * Instrument, ändert sich hier nichts.
   */
}

/**
 * Ist für diesen Slot genug da, dass ein Entwurf ehrlich sein KANN?
 *
 * Zwei Regeln, in dieser Reihenfolge:
 *  1. die Slot-eigene aus der Tabelle oben,
 *  2. die aus der REGISTRY abgeleitete: hat der Slot Quell-Slots und ist
 *     JEDER davon leer, gibt es nichts abzuleiten. „Alle leer" und nicht
 *     „einer leer", weil ein teilweise gefüllter Stand genau der Fall ist, für
 *     den es Georges Rückfrage gibt.
 *
 *     Sie urteilt NUR über abgedeckte Quellen (`coveredSteps`) und nur, wenn
 *     ALLE Quellen abgedeckt sind: ein einziger ungesehener Quell-Slot könnte
 *     gefüllt sein, und dann wäre „da ist nichts" schlicht falsch.
 *
 * Ein unbekannter Slot gilt als bereit: dieses Gate ist eine Sicherung, kein
 * zweiter Katalog — welche Slots es gibt, sagt die Registry.
 */
export function slotReadiness(slotId: string, input: BrandReadinessInput): BrandSlotReadiness {
  const missing = new Set<BrandReadinessNeed>(SLOT_RULES[slotId]?.(input) ?? [])

  if (slotById(slotId)) {
    const covered = new Set<BrandStepKey>(input.coveredSteps)
    const sources = dependencyClosure(slotId)
    const allVisible = sources.every((id) => {
      const home = slotById(id)?.stepId
      return home !== undefined && covered.has(home)
    })
    if (sources.length > 0 && allVisible && !sources.some(id => filled(input.records[id]))) {
      missing.add('source_slots')
    }
  }

  return missing.size === 0 ? { ready: true } : { ready: false, missing: [...missing] }
}
