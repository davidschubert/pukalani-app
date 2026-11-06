import { BRAND_HEX_RE } from './brandDesign'
import { BRAND_DIRECTION_SOURCE_SLOTS } from './brandDirections'
import { brandGenerationHashInput } from './brandGeneration'
import {
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandInvariant,
  type BrandSessionConfig,
  type BrandSessionKind,
  type BrandSessionSubstance,
  type BrandSlotStateFacts,
  type BrandStepKey,
} from './slotRegistry'

/**
 * DIE DREI REINEN RECHNUNGEN ÜBER DEM SESSION-VERTRAG (BW2 Paket 1,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §9 und §3a Nr. 6).
 *
 * PURE — kein Appwrite, kein H3, kein i18n, wie `slotRegistry.ts` und
 * `brandJourney.ts`. Dieselben Regeln laufen im Browser (Impact-Hinweis,
 * Warteschlange „neu besprechen") und auf dem Server (409 beim Bestätigen).
 *
 *  1. `sessionsAffectedBy` — die UMKEHRUNG der Abhängigkeiten. Die Registry
 *     sagt, woraus eine Session schöpft; diese Rechnung sagt, WER an ihr
 *     hängt. Ohne sie ist „diese Änderung berührt 14 bestätigte Felder" eine
 *     gepflegte Liste, und eine gepflegte Liste ist irgendwann falsch.
 *  2. `computeSourcesHash` — „veraltet" für ALLE Feldarten, nicht nur für
 *     generierte. Bis BW2 war der `inputHash` einer GENERATION die einzige
 *     Antwort darauf; ein Frage-Feld wie `c.livedExamples` hängt an `c.final`
 *     und merkte eine Änderung nie.
 *  3. `evaluateInvariants` — was ein Test prüfen kann, wird nicht der KI
 *     überlassen. Sie ist billiger, schneller und lügt nie.
 *  4. `nextCollectPart` (Paket 3a) — welcher Teil einer Sammel-Session gerade
 *     dran ist. Ebenfalls Rechnung statt Modell: der Text gehört dem Teil, der
 *     gefragt wurde.
 *  5. Die KORREKTUR-REGEL (Paket 6): `confirmedDependents` (was kostet diese
 *     Korrektur), `correctionNeedsAck` (braucht sie eine Bestätigung) und
 *     `applyAffected` (welche Felder bleiben danach veraltet). Drei Zeilen
 *     Rechnung, die an drei Enden gleich lauten müssen — Layer, 409, Stempel.
 *
 * ── FAIL-OPEN IST HIER DIE RICHTIGE RICHTUNG ──────────────────────────────
 * Alle drei rechnen mit `BrandSlotStateFacts`, und dessen `value` ist
 * OPTIONAL (s. dort). Fehlt er, prüft `evaluateInvariants` NICHTS und
 * `computeSourcesHash` rechnet mit leeren Zeichenketten. Eine Sperre, die
 * zuschlägt, weil eine Aufrufstelle einen Wert nicht mitgibt, hielte einen
 * Menschen von seinem eigenen Feld fern — und dem 409 sähe niemand an, dass
 * er ein Verdrahtungsfehler ist.
 */

// ── 1 · Wer hängt an dieser Session? ───────────────────────────────────────

export interface BrandSessionsAffected {
  /** Sessions, deren `inputs.slots` DIREKT auf diese Id zeigen. */
  readonly direct: readonly string[]
  /**
   * Die volle Hülle: direkt UND über Zwischenschritte, in Registry-Reihenfolge.
   *
   * `direct` ist ihre Teilmenge und nicht ihr Gegenstück — die beiden Mengen
   * ÜBERLAPPEN sich zwangsläufig (`b.mission` hängt an `a.pitch` direkt UND
   * über `b.purpose`). Eine Spalte „nur indirekt" wäre deshalb keine
   * Aufteilung, sondern eine dritte Zahl, die niemand addieren kann; die
   * Anhang-A-Spalte „berührt" ist genau diese Länge hier.
   */
  readonly transitive: readonly string[]
  /** Dieselbe Hülle, gruppiert je Kapitel — leere Kapitel kommen nicht vor. */
  readonly byStep: Readonly<Partial<Record<BrandStepKey, readonly string[]>>>
}

/**
 * DIE UMKEHRUNG (§9). Deaktivierte Sessions zählen NIE mit: sie werden nicht
 * mehr gefragt, also berührt eine Korrektur sie auch nicht — sie im
 * Impact-Hinweis zu zeigen hiesse, einem Menschen Arbeit anzukündigen, die
 * niemand mehr macht.
 *
 * `sessions` ist überschreibbar, damit der Beweis eine MUTIERTE Registry
 * vorlegen kann (eine erfundene Abhängigkeit muss die Hülle vergrössern) —
 * dieselbe Begründung wie bei `dependencyClosure`/`validateSlotRegistry`.
 */
export function sessionsAffectedBy(
  sessionId: string,
  sessions: readonly BrandSessionConfig[] = BRAND_SLOTS,
): BrandSessionsAffected {
  const active = sessions.filter(session => !session.deactivated)

  const direct: string[] = []
  const hull = new Set<string>()
  const queue: string[] = [sessionId]
  const walked = new Set<string>([sessionId])

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const session of active) {
      if (!session.inputs.slots.includes(current)) continue
      if (current === sessionId) direct.push(session.id)
      if (hull.has(session.id)) continue
      hull.add(session.id)
      // `walked` terminiert AUCH bei einem versehentlichen Zyklus — die
      // Rückwärts-Regel des Katalogs schliesst ihn strukturell aus, aber ein
      // Helfer, der bei fehlerhaften Daten hängt, wäre ein Ausfall statt
      // eines roten Tests.
      if (walked.has(session.id)) continue
      walked.add(session.id)
      queue.push(session.id)
    }
  }

  const transitive = active.filter(session => hull.has(session.id)).map(session => session.id)
  const byStep: Partial<Record<BrandStepKey, string[]>> = {}
  for (const session of active) {
    if (!hull.has(session.id)) continue
    ;(byStep[session.stepId] ??= []).push(session.id)
  }

  return { direct, transitive, byStep }
}

/**
 * DIE HÜLLE, WIE DER MENSCH SIE SIEHT (Brand Design D0, Prüf-Befund).
 *
 * `sessionsAffectedBy` ist die WAHRHEIT der Registry — seit Schicht 2 zählt
 * sie auch die 26 Design-Sessions, die an `c.final`, `d.primary`,
 * `d.toneWords` und `result.direction` hängen. Für eine Marke OHNE
 * Freischaltung stünde damit unter jedem Foundation-Feld „fließt in 53
 * weitere Felder ein — … Moodboard · Farbwelt · …": Kapitel, die es in ihrer
 * Oberfläche nicht gibt. Der Hinweis beschreibt deshalb nur Kapitel, die der
 * Journey nach ERREICHBAR sind: gesperrte Design-Kapitel (`design_locked`)
 * fallen samt ihren Sessions heraus. Nach der Freischaltung zählen sie mit —
 * ohne zweite Regel, weil die Journey dann keinen `design_locked` mehr trägt.
 *
 * SEIT K0 GILT DASSELBE FÜR SCHICHT 3 (`derivation_locked`): Brand Book & Kit
 * liegt ohne Freischaltung nicht auf dem Weg, seine Sessions zählen also
 * ebenso wenig mit. Nach der Freischaltung zählen sie mit — ohne zweite Regel,
 * weil die Journey dann keinen `derivation_locked` mehr trägt.
 *
 * Bewusst KEINE Änderung an `sessionsAffectedBy`: Korrektur-Kaskade und
 * Neustart-Kosten rechnen weiter mit der vollen Hülle (ein gesperrtes
 * Design-Feld ist leer, eine Kaskade dorthin kostet nichts).
 */
export interface BrandAffectsView {
  count: number
  /** Kapitel in Journey-Reihenfolge — nur die, die etwas berühren UND erreichbar sind. */
  steps: BrandStepKey[]
}

export function affectsView(
  sessionId: string,
  journey: readonly { stepKey: BrandStepKey, reason: string | null }[],
  sessions: readonly BrandSessionConfig[] = BRAND_SLOTS,
): BrandAffectsView {
  const affected = sessionsAffectedBy(sessionId, sessions)
  // VIER GRÜNDE, DIESELBE FRAGE: `design_locked` ist ein gesperrtes Kapitel
  // der Schicht 2, `derivation_locked` ein Kapitel der Schicht 3, das ohne
  // Freischaltung gar nicht auf dem Weg liegt — und seit dem zweiten Testlauf
  // (Befund 6, 2026-09-09) auch die beiden WEICHEN-Gründe. Für den Hinweis
  // bedeuten alle vier dasselbe: der Mensch hat dieses Kapitel in seiner
  // Oberfläche nicht, also darf es nicht in „fliesst in N Felder ein"
  // mitzählen.
  //
  // ── DER BEFUND, IN EINEM ABSATZ ────────────────────────────────────────
  // Unter jedem Feld des Profils stand „fließt später in 32 weitere Felder
  // ein — Purpose · … · Markenarchitektur · …", obwohl `subBrands: 'unknown'`
  // ist und die Markenarchitektur damit gar nicht auf dem Weg liegt
  // (`includedBrandSteps` lässt sie weg, die Journey stempelt sie `skipped`
  // mit `junction_undecided`). Der Hinweis versprach Wirkung in einem Kapitel,
  // das es für dieses Branding nicht gibt — und zählte seine Sessions mit.
  //
  // Die Liste ist damit genau die Gegenmenge zu `includedBrandSteps` plus dem
  // gesperrten Design: `includeStep` kennt als Ausschluss-Gründe ausschliesslich
  // `junction_off`, `junction_undecided` und `derivation_locked`.
  const HIDDEN_REASONS: readonly string[] = [
    'design_locked',
    'derivation_locked',
    'junction_off',
    'junction_undecided',
  ]
  const hidden = new Set(journey
    .filter(entry => entry.reason !== null && HIDDEN_REASONS.includes(entry.reason))
    .map(entry => entry.stepKey))
  const steps = journey
    .map(entry => entry.stepKey)
    .filter(candidate => !hidden.has(candidate) && affected.byStep[candidate]?.length)
  const count = (Object.entries(affected.byStep) as [BrandStepKey, readonly string[]][])
    .filter(([stepKey]) => !hidden.has(stepKey))
    .reduce((sum, [, ids]) => sum + ids.length, 0)
  return { count, steps }
}

// ── 1b · Was kostet „Nochmal von vorn"? ───────────────────────────────────

export interface BrandRestartImpact {
  /** Bestätigte Sessions SPÄTERER Kapitel, die an diesem Kapitel hängen. */
  readonly sessions: readonly string[]
  /** Dieselbe Menge, gruppiert je Kapitel — leere Kapitel kommen nicht vor. */
  readonly byStep: Readonly<Partial<Record<BrandStepKey, readonly string[]>>>
  readonly count: number
}

/**
 * DIE HÜLLE EINES GANZEN KAPITELS (Plan §5a, Schutz vor „Nochmal von vorn").
 *
 * `sessionsAffectedBy` beantwortet die Frage für EIN Feld; der Restart löscht
 * ein ganzes Kapitel, also ist die Antwort die VEREINIGUNG über alle seine
 * Sessions. Gezählt wird nur, was auch wirklich etwas verliert:
 *
 *  1. **BESTÄTIGTE** Sessions — ein unbestätigter Entwurf, der veraltet, ist
 *     kein Verlust, den man ankündigen müsste.
 *  2. Sessions **SPÄTERER** Kapitel — die des eigenen Kapitels gehen ohnehin
 *     mit; sie noch einmal als „berührt" aufzuführen, machte die Zahl im
 *     Schutz-Layer zu einer, die niemand nachrechnen kann.
 *
 * PUR und mit überschreibbarer Registry, wie `sessionsAffectedBy`: der Beweis
 * muss eine mutierte Fassung vorlegen können.
 */
export function brandRestartImpact(
  stepKey: BrandStepKey,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  sessions: readonly BrandSessionConfig[] = BRAND_SLOTS,
): BrandRestartImpact {
  const order = BRAND_STEP_KEYS.indexOf(stepKey)
  const hull = new Set<string>()
  for (const session of sessions) {
    if (session.stepId !== stepKey || session.deactivated) continue
    for (const affected of sessionsAffectedBy(session.id, sessions).transitive) hull.add(affected)
  }

  const byStep: Partial<Record<BrandStepKey, string[]>> = {}
  const list: string[] = []
  for (const session of sessions) {
    if (!hull.has(session.id) || session.deactivated) continue
    if (BRAND_STEP_KEYS.indexOf(session.stepId) <= order) continue
    if (!slotFacts[session.id]?.confirmed) continue
    list.push(session.id)
    ;(byStep[session.stepId] ??= []).push(session.id)
  }

  return { sessions: list, byStep, count: list.length }
}

// ── 1c · Was kostet die Korrektur EINES Feldes? (§9) ──────────────────────

export interface BrandCorrectionImpact {
  /** Bestätigte Sessions, deren `inputs.slots` DIREKT auf dieses Feld zeigen. */
  readonly direct: readonly string[]
  /** Dieselben plus die über Zwischenschritte — in Registry-Reihenfolge. */
  readonly transitive: readonly string[]
  /** Dieselbe Menge je Kapitel — leere Kapitel kommen nicht vor. */
  readonly byStep: Readonly<Partial<Record<BrandStepKey, readonly string[]>>>
  /** Die Zahl im Hinweis: „berührt {count} bestätigte Felder". */
  readonly count: number
}

/**
 * WER HÄNGT AN DIESEM FELD — UND HAT SCHON EINEN BESTÄTIGTEN WERT? (§9
 * Schritt 1.)
 *
 * `sessionsAffectedBy` beantwortet die STRUKTUR-Frage („wer schöpft daraus"),
 * diese hier die Frage des Menschen vor dem Klick: was ist SCHON entschieden
 * und wird durch meine Korrektur wieder unsicher. Eine noch nicht bestätigte
 * Session ist kein Verlust — sie wird ohnehin erst später besprochen, und sie
 * in einer Warnung mitzuzählen liesse die Zahl bedrohlicher aussehen, als die
 * Sache ist (`a.customerPraise` berührt strukturell 29 Felder; am zweiten Tag
 * eines Brandings sind davon vielleicht drei bestätigt).
 *
 * Dieselbe Rechnung läuft im Browser (der Layer zeigt die Liste) und auf dem
 * Server (der Ack-Hash, das 409). Zwei Fassungen wären zwei Zahlen für
 * dieselbe Warnung — und der Hash über die eine passte nie zur anderen.
 *
 * `sessions` bleibt überschreibbar (Gegenprobe mit mutierter Registry).
 */
export function confirmedDependents(
  sessionId: string,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  sessions: readonly BrandSessionConfig[] = BRAND_SLOTS,
): BrandCorrectionImpact {
  const hull = sessionsAffectedBy(sessionId, sessions)
  const isConfirmed = (id: string): boolean => slotFacts[id]?.confirmed === true

  const transitive = hull.transitive.filter(isConfirmed)
  const kept = new Set(transitive)
  const byStep: Partial<Record<BrandStepKey, string[]>> = {}
  for (const [stepKey, ids] of Object.entries(hull.byStep)) {
    const own = (ids ?? []).filter(id => kept.has(id))
    if (own.length) byStep[stepKey as BrandStepKey] = own
  }

  return {
    direct: hull.direct.filter(isConfirmed),
    transitive,
    byStep,
    count: transitive.length,
  }
}

/**
 * BRAUCHT DIESE KORREKTUR EINE BESTÄTIGUNG? (§9 Schritt 3.)
 *
 * Eine Zeile, aber an EINER Stelle: der Server entscheidet damit über das 409,
 * der Browser darüber, ob er den Layer überhaupt zeigt. Stünde die Bedingung
 * zweimal, wäre der Layer irgendwann höflicher oder strenger als die Route —
 * und beides ist schlecht: eine Warnung, die der Server nicht erzwingt, ist
 * Theater; ein 409 ohne vorherige Warnung ist eine Sackgasse.
 *
 * Leere Hülle ⇒ kein Ack. Die Korrektur eines Feldes, an dem nichts hängt
 * (`a.challenge`, `f.decision`, alle `ep.*`), läuft wie vor Paket 6.
 */
export function correctionNeedsAck(impact: Pick<BrandCorrectionImpact, 'count'>): boolean {
  return impact.count > 0
}

// ── 1d · Die Eingrenzung nach der Korrektur (§9) ──────────────────────────

export interface BrandAffectedSplit {
  /** Nicht getroffen ⇒ der Server stempelt ihren `sourcesHash` neu (wieder `done`). */
  readonly restamp: readonly string[]
  /** Getroffen ⇒ bleiben `stale` und bekommen je einen Befund `affected`. */
  readonly stale: readonly string[]
}

/**
 * WELCHE DER MECHANISCH VERALTETEN FELDER BLEIBEN VERALTET? (§9 „Die
 * Eingrenzung durch den Spezialisten".)
 *
 * Nach einer erneuten Bestätigung ist JEDES Feld der Hülle mechanisch `stale`
 * (der Quell-Hash weicht ab). Der Spezialist sagt, welche die Änderung
 * INHALTLICH trifft; für alle anderen wird neu gestempelt — eine
 * Kommakorrektur soll niemanden zwanzig Gespräche kosten.
 *
 * ── FAIL-CLOSED, UND ZWAR IN RICHTUNG „BITTE ANSEHEN" (§7) ────────────────
 * `affected === undefined` heisst „es gab keine gültige Antwort" (Drossel,
 * Anbieter, Schema, KI aus). Dann bleibt ALLES veraltet: der Mensch sieht
 * bernstein, was er selbst mit einem Klick („gilt weiter") wieder grün machen
 * kann. Die andere Richtung — ohne Urteil alles neu stempeln — hiesse, einen
 * Ausfall als „geprüft, passt" auszugeben, und niemand erführe je davon.
 *
 * Eine LEERE Liste ist ausdrücklich etwas anderes als keine Liste: „ich habe
 * nachgesehen, es trifft nichts" ist die häufigste richtige Antwort.
 *
 * Feld-Ids ausserhalb der Hülle werden verworfen — ein Modell darf die Menge
 * nicht vergrössern, nur aufteilen.
 */
export function applyAffected(
  hull: readonly string[],
  affected: readonly string[] | undefined,
): BrandAffectedSplit {
  if (affected === undefined) return { restamp: [], stale: [...hull] }
  const hit = new Set(affected)
  return {
    restamp: hull.filter(id => !hit.has(id)),
    stale: hull.filter(id => hit.has(id)),
  }
}

// ── 2 · Ist dieser Stand noch der, aus dem der Wert entstand? ──────────────

/**
 * Der zweite Platz der kanonischen Zeichenkette. Bei einer GENERATION steht
 * dort die Inhaltssprache; hier ist es dieser feste Marker — dieselbe Funktion,
 * zwei Fragen, und die Hashes dürfen sich nicht zufällig treffen.
 */
export const BRAND_SOURCES_HASH_SCOPE = 'sources'

/**
 * DIE KANONISCHE ZEICHENKETTE ÜBER DEN QUELL-WERTEN einer Session (§9).
 *
 * Sie benutzt WÖRTLICH denselben Bauer wie der `inputHash` der Generationen
 * (`brandGenerationHashInput`) — inklusive seiner Trennung mit U+0000 und
 * seiner Registry-Fassung im Kopf. Eine zweite Hash-Regel wäre eine zweite
 * Antwort auf „hat sich die Quelle geändert", und die Abweichung sähe man erst
 * an einem Feld, das sich für aktuell hält.
 *
 * Der Server hasht sie wie dort mit sha256 (`brandGenerationInputHash`); die
 * interessante Aussage hängt vollständig an der Zeichenkette, und `node:crypto`
 * hat in `shared/` nichts verloren (es läge im Client-Bündel).
 *
 * REIHENFOLGE-UNABHÄNGIG gegenüber den Fakten, aber NICHT gegenüber der
 * Registry: gelaufen wird über `config.inputs.slots`, nicht über die Schlüssel
 * des Fakten-Objekts. Ein Slot ohne Fakten geht als LEERE Zeichenkette ein —
 * sonst hätten „Quelle fehlt" und „Quelle ist leer" denselben Hash, und ein
 * nachgetragener Wert bewegte ihn nicht.
 */
export function computeSourcesHash(
  config: BrandSessionConfig,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
): string {
  return brandGenerationHashInput(
    config.id,
    BRAND_SOURCES_HASH_SCOPE,
    config.inputs.slots.map(slotId => ({ slotId, value: slotFacts[slotId]?.value ?? '' })),
  )
}

// ── 3 · Die deterministischen Prüfungen ───────────────────────────────────

export type BrandInvariantResult =
  | { readonly ok: true }
  | { readonly ok: false, readonly code: 'invariant_violated', readonly invariant: BrandInvariant }

/**
 * DIE EINTRÄGE EINES WERTS — TOLERANT GELESEN (Paket-6-Vorabklärung zum
 * Paket-1-Befund (a)).
 *
 * ── WARUM TOLERANZ HIER PFLICHT IST ───────────────────────────────────────
 * `brandSlotFormat.ts` schreibt für einen `list`-Wert „eine Zeile je Eintrag,
 * jede beginnt mit `- `" — aber diese Regel bindet den GENERATOR, nicht den
 * MENSCHEN. Nachgemessen am 2026-09-05: `c.final` und `f.shortlist` haben den
 * Editor `chips`, und den gibt es in der Werkstatt gar nicht (nur `cards` hat
 * ein eigenes Modul, s. `choiceCardsFor`). Ihre Antwort läuft deshalb durch
 * `answerFromGeorge()` und landet als GETIPPTER FLIESSTEXT im Slot —
 * „Geduld, Unbestechlichkeit und Klarheit", nicht drei Zeilen. Im lokalen
 * Test-Branding (`6a9b5e870033ce9c82f4`) steht wörtlich nichts anderes:
 * `c.discovery1` = "Wir servieren nur Bohnen von Farmen, die wir kennen." —
 * ein Satz, eine Zeile, kein Strich.
 *
 * Eine Invariante darf NIE an der Schreibweise scheitern, nur an der Sache:
 * „drei Werte, in eine Zeile getippt" ist die Erfüllung von `count 3–5`, nicht
 * ihr Bruch. Ein 409 auf eine formal richtige Antwort wäre ein Programmfehler
 * mit dem Gesicht einer Regel.
 *
 * ── DIE REGEL, MIT BEISPIELEN ─────────────────────────────────────────────
 * 1. MEHRERE ZEILEN ⇒ eine Zeile ist ein Eintrag. Führende Aufzählungszeichen
 *    fallen weg: `- `, `– `, `— `, `* `, `• `, `1. `, `2) `.
 *      "- Geduld\n- Klarheit"      ⇒ ['Geduld', 'Klarheit']
 *      "1. Geduld\n2) Klarheit"    ⇒ ['Geduld', 'Klarheit']
 *      "• Geduld\n\n• Klarheit"    ⇒ ['Geduld', 'Klarheit']  (Leerzeilen raus)
 * 2. GENAU EINE ZEILE ⇒ zusätzlich an Komma, Semikolon, „·", „/" und den
 *    Konjunktionen „und"/„and"/„sowie" getrennt — das ist die Form, in der ein
 *    Mensch eine Aufzählung tippt.
 *      "Geduld, Unbestechlichkeit und Klarheit" ⇒ drei Einträge
 *      "Bogen; Nordfeld; Satzbau"               ⇒ drei Einträge
 * 3. EINE ZEILE OHNE TRENNER bleibt EIN Eintrag — auch wenn sie ein ganzer
 *    Satz ist. Der Punkt am Ende fällt erst in `comparable()`.
 *      "Wir schliessen lieber früher" ⇒ ein Eintrag
 *
 * DIE KEHRSEITE, BEWUSST IN KAUF GENOMMEN: ein einzeiliger Satz MIT Komma
 * wird geschnitten („Bohnen von Farmen, die wir kennen" ⇒ zwei). Das ist
 * richtig herum: die Invarianten, die hier lesen, hängen ausschliesslich an
 * AUFZÄHLENDEN Feldern (`c.final` zählt, `f.decision` prüft Zugehörigkeit),
 * und dort ist „drei Werte in eine Zeile getippt" der häufigere Fall. Ein
 * Prosa-Feld hat keine dieser Regeln, die Rechnung läuft für es also nie.
 *
 * ── WARUM NUR BEI EINER ZEILE GETRENNT WIRD ───────────────────────────────
 * Wer Zeilen schreibt, hat seine Einträge schon getrennt. Ein Komma INNERHALB
 * einer solchen Zeile gehört dann zum Eintrag („Klarheit, auch wenn es weh
 * tut") — dort noch einmal zu schneiden machte aus zwei Werten vier und aus
 * `count 3–5` eine Lotterie.
 */
export function brandListEntries(value: string): string[] {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => stripListMarker(line.trim()))
    .filter(line => line.length > 0)

  if (lines.length !== 1) return lines
  return splitInlineList(lines[0]!)
}

/** Führendes Aufzählungszeichen weg — Strich, Punkt, Stern, Ziffer mit `.`/`)`. */
function stripListMarker(line: string): string {
  return line.replace(/^(?:[-–—*•·]\s+|\d{1,2}[.)]\s+)/u, '').trim()
}

/**
 * Eine EINZELNE Zeile als Aufzählung lesen (s. Regel 2). Bleibt nach dem
 * Schneiden nur ein Stück übrig, war es keine Aufzählung — dann gilt die Zeile
 * wörtlich, samt ihrer Kommas.
 */
function splitInlineList(line: string): string[] {
  const parts = line
    .split(/\s*[,;·/]\s*|\s+(?:und|and|sowie)\s+/giu)
    .map(part => part.trim())
    .filter(part => part.length > 0)
  return parts.length > 1 ? parts : [line]
}


/**
 * Vergleichsform: Leerraum zusammengezogen, kleingeschrieben, Satzzeichen am
 * Ende weg. Ein Wert, der sich nur in einem Punkt unterscheidet, ist derselbe
 * Wert — und eine Invariante, die daran scheitert, hielte einen Menschen von
 * seinem eigenen Feld fern.
 */
function comparable(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[.,;:!?—–-]+$/u, '').trim().toLowerCase()
}

function checkOne(
  invariant: BrandInvariant,
  value: string,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
): boolean {
  const source = invariant.of === undefined ? undefined : slotFacts[invariant.of]?.value
  // FAIL-OPEN: ohne Quelle gibt es nichts zu vergleichen (s. Kopf).
  const needsSource = invariant.kind !== 'count' && invariant.kind !== 'mentionsNone'
    && invariant.kind !== 'hex' && invariant.kind !== 'oneOf'
  if (needsSource && !source?.trim()) return true

  /** Vergleichsformen der Quell-Einträge, leere weggeworfen. */
  const sourceTerms = (): string[] =>
    brandListEntries(source ?? '').map(comparable).filter(entry => entry.length > 0)

  switch (invariant.kind) {
    case 'hex': {
      // Die FORM eines Wertes, nicht sein Verhältnis zu einem anderen: dieselbe
      // Prüfung wie in der Themes-Engine, aus der EINEN Stelle des Layers
      // (`brandDesign.ts`) — ein zweiter Ausdruck daneben wäre eine zweite
      // Auslegung derselben sechs Zeichen.
      return BRAND_HEX_RE.test(value.trim())
    }
    case 'oneOf': {
      // Die MENGE steht in `terms` und kommt aus einem Katalog des Layers
      // (D4) — nicht aus dem Wert eines anderen Slots. Eine leere Menge
      // erlaubt nichts: eine Invariante ohne Vorrat ist ein Fehler im
      // Katalog, und still durchzulassen hiesse, ihn zu verstecken.
      return (invariant.terms ?? []).some(term => comparable(term) === comparable(value))
    }
    case 'count': {
      const count = brandListEntries(value).length
      if (invariant.min !== undefined && count < invariant.min) return false
      if (invariant.max !== undefined && count > invariant.max) return false
      return true
    }
    case 'memberOf': {
      const allowed = brandListEntries(source!).map(comparable)
      return allowed.includes(comparable(value))
    }
    case 'subsetOf': {
      const allowed = new Set(brandListEntries(source!).map(comparable))
      return brandListEntries(value).every(entry => allowed.has(comparable(entry)))
    }
    case 'sentenceOf': {
      // Der Wert muss WÖRTLICH im Quelltext vorkommen — der Wähler zeigt
      // dessen Zeilen, also ist alles andere eine Neuerfindung.
      return comparable(source!).includes(comparable(value))
    }
    case 'mentionsNone': {
      const haystack = comparable(value)
      // `terms` sind die FESTEN Verbote, `of` die aus einer anderen Session
      // (Paket 2b): `d.secondary` darf nicht derselbe Archetyp sein wie
      // `d.primary`, und dafür braucht es keine eigene Invarianten-Art —
      // „nennt das hier nicht" ist genau die Frage. Ohne Quelle bleibt die
      // Liste leer, die Prüfung also offen (s. Kopf).
      const terms = [
        ...(invariant.terms ?? []).map(comparable),
        ...sourceTerms(),
      ].filter(term => term.length > 0)
      return terms.every(term => !haystack.includes(term))
    }
    case 'mentionsFrom': {
      const terms = sourceTerms()
      // Eine Quelle, aus der nichts Vergleichbares übrig bleibt, prüft nichts.
      if (terms.length === 0) return true
      const haystack = comparable(value)
      const hits = terms.filter(term => haystack.includes(term)).length
      return invariant.min === undefined ? hits === terms.length : hits >= invariant.min
    }
  }
}

/**
 * ALLE INVARIANTEN EINER SESSION gegen einen Wert (§3a Nr. 6). Der ERSTE
 * Verstoss gewinnt — der Mensch soll eine Sache reparieren, nicht eine Liste.
 *
 * Ein leerer Wert ist IMMER in Ordnung: „bestätige nichts" ist die Sache der
 * Route (`required_slots_missing`), nicht die einer Formregel.
 */
export function evaluateInvariants(
  config: BrandSessionConfig,
  value: string | undefined,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
): BrandInvariantResult {
  if (!value?.trim()) return { ok: true }
  for (const invariant of config.invariants) {
    if (!checkOne(invariant, value, slotFacts)) {
      return { ok: false, code: 'invariant_violated', invariant }
    }
  }
  return { ok: true }
}

// ── 4 · Die Sammel-Session: welcher Teil ist dran? ────────────────────────

/**
 * DER NÄCHSTE OFFENE TEIL einer `collect`-Session (BW2 §6, Paket 3a) — pur,
 * ohne KI und ohne Route.
 *
 * `collect` sammelt ihre Teile NACHEINANDER, einen je Zug (heute nur
 * `a.facts`: Teamgrösse, Alter, Märkte). Welcher gerade offen ist, ergibt sich
 * aus der REGISTRY-Reihenfolge der Teile und dem bisher Gesammelten — nicht
 * aus einer Zählung von Zügen und schon gar nicht aus einer KI-Einordnung: der
 * Text, den der Mensch schreibt, gehört dem Teil, der gerade gefragt wurde,
 * und mehr Wahrheit gibt es darüber nicht.
 *
 * `null` heisst „alle Teile beantwortet" — dann schreibt die Route den
 * strukturierten Wert und hört auf zu fragen.
 *
 * Leerraum zählt NICHT als Antwort: ein Teil, in dem nur Leerzeichen stehen,
 * ist offen. Sonst schöbe ein versehentlich leerer Zug den Fortschritt vor.
 */
export function nextCollectPart(
  config: BrandSessionConfig,
  collected: Readonly<Record<string, string | undefined>> = {},
): string | null {
  return config.parts.find(part => !collected[part]?.trim()) ?? null
}

/**
 * DARF DER BROWSER DIESE ANTWORT ALS FELDWERT SCHREIBEN? (Kailua-Befund 4,
 * 2026-09-08)
 *
 * Für jede Session heisst die Antwort ja: der getippte Text IST der Entwurf,
 * der Autosave schreibt ihn, und George reagiert darauf. Für die SAMMEL-Session
 * heisst sie nein — und das ist keine Ausnahme dieser Regel, sondern die
 * Kehrseite der einen Ausnahme, die die Konversations-Route ohnehin schon hat:
 * dort und nur dort entsteht der Wert im SERVER, aus allen Teilen zusammen
 * (`nextCollectPart` oben, `formatBrandSlotStructured` in `converse.post.ts`).
 *
 * ── WAS OHNE DIESE REGEL PASSIERT (gemessen, erster Kailua-Lauf) ──────────
 * Die Antwort auf den ERSTEN Teil („wie gross ist das Team") landete als
 * `latestDraft` von `a.facts`. Damit galt das Feld als gefüllt, die Bühne
 * verliess das Sammel-Modul, und die Antworten auf Teil zwei und drei waren
 * für den Browser „freie Fragen" ohne Feld. Der Server sammelte sie brav
 * weiter, legte am Ende den vollständigen Wert ab — und der nächste Autosave
 * überschrieb ihn wieder mit dem Rohtext von Teil eins. Auf der Karte stand
 * genau ein Fakt von dreien.
 */
export function brandAnswerWritesSlot(session: { kind: BrandSessionKind } | null | undefined): boolean {
  return Boolean(session) && session!.kind !== 'collect'
}

/**
 * MINDEST-SUBSTANZ IN WÖRTERN — die drei Stufen aus `sessionContent.ts` als
 * Zahl, die im Prompt stehen kann (Plan §16).
 *
 * Die Stufen sind der Pflege-Massstab (68 Zahlen von Hand pflegt niemand); der
 * PROMPT braucht trotzdem etwas Greifbares, sonst heisst „thin" für jedes
 * Modell etwas anderes. Die Zahlen sind bewusst grob und mit „roughly"
 * eingeleitet: eine harte Grenze machte aus dem Gespräch eine Zeichenzählung.
 *
 *  short  ≈ 12  ein Halbsatz reicht (Auswahl, Bestätigung, eine Jahreszahl)
 *  medium ≈ 40  zwei bis drei Sätze — die Menschenfragen des Katalogs
 *  long   ≈ 100 eine Geschichte mit Szene (heute von keiner Session verlangt,
 *               die Stufe gibt es trotzdem, weil die Config sie kennt)
 */
export const BRAND_SUBSTANCE_MIN_WORDS: Readonly<Record<BrandSessionSubstance, number>> = {
  short: 12,
  medium: 40,
  long: 100,
}

/**
 * WAS DIE BÜHNE EINES KAPITELS AUS FREMDEN KAPITELN BRAUCHT (Paket G4).
 *
 * Der Browser lädt immer nur EIN Kapitel; `slots` trägt genau dessen Sessions
 * (s. Kopf von `BrandStepDetailResponse.sourceValues`). Das reicht überall —
 * bis auf eine Stelle: das Ergebnis-Kapitel schlägt seine drei
 * Richtungs-Vorschläge aus Haupt- und Neben-Archetyp auf, und die stehen in
 * `archetype`.
 *
 * GEPFLEGT UND NAMENTLICH, nicht aus `dependencies` gerechnet: eine Ableitung
 * schickte für jedes Kapitel den halben Wertevorrat mit (`ep.taglines` allein
 * hängt an fünf fremden Sessions), und was eine ANTWORT trägt, soll man einer
 * Liste ansehen können. Der Test nagelt fest, dass jede Id hier eine echte
 * Session ist und aus einem ANDEREN Kapitel stammt.
 */
export const BRAND_STAGE_SOURCE_SLOTS: Readonly<Partial<Record<BrandStepKey, readonly string[]>>> = {
  result: BRAND_DIRECTION_SOURCE_SLOTS,
  /**
   * SCHICHT 2 BRAUCHT DIE GEWÄHLTE RICHTUNG (Brand Design D2c/D3).
   *
   * Die drei Moodboards und die Farb-Kandidaten schöpfen ihren Dreiklang aus
   * `result.direction` — und die steht im Kapitel `result`. Ohne diese zwei
   * Zeilen kam sie nie in der Bühne an, und BEIDE Rechnungen fielen still auf
   * die erste Richtung des Katalogs zurück (in D2c gebaut, hier beim Bau von
   * D3 am eigenen Klick gefunden: die Boards zeigten für jede Marke dieselbe
   * Farbwelt).
   */
  dna: ['result.direction'],
  color: ['g.mix', 'result.direction'],
  /**
   * DIE TYPOGRAFIE BRAUCHT DIE FERTIGE FARBWELT (D4).
   *
   * Die Vorschau-Szene des Kapitels zeigt die Schrift IN der Marke — auf ihrem
   * Papierton, mit ihrem Akzent. Die drei Werte stehen im Kapitel davor
   * (`color`), und ohne sie fiele die Szene auf die Notfarbe zurück
   * (`BRAND_SCENE_FALLBACK_BASE`): ein Schiefergrau, das über die Wirkung
   * einer Schrift in DIESER Marke nichts sagt.
   *
   * `g.mix` trägt die Vorbelegung (DNA „Typografie" ⇒ Paar), `result.direction`
   * nur den RÜCKFALL: ist die Farbwelt noch nicht bestätigt — von Hand
   * korrigiert, oder das Kapitel wieder geöffnet —, rechnet dieselbe Regel wie
   * in D3 einen Vorschlag daraus, statt die Szene grau zu lassen.
   */
  type: ['g.mix', 'h.base', 'h.neutral', 'h.accent', 'result.direction'],
  /**
   * DAS ZEICHEN BRAUCHT BEIDES: FARBWELT UND SCHRIFT (D5b).
   *
   * Eine gesetzte Wortmarke IST das Schriftpaar in der Farbwelt — ohne
   * `i.pair` stünde sie in der ersten Schrift des Katalogs, ohne `h.base` auf
   * der Notfarbe, und beides wäre eine Setzung einer anderen Marke.
   * `i.rules` kommt mit, weil Gewicht, Laufweite und Versalien laut D4
   * ausdrücklich auch für die Wortmarke gelten; `g.mix` trägt die Vorbelegung
   * der Richtung (DNA „Visueller Stil") und die Eckenrundung (DNA
   * „Formsprache"), `result.direction` wie überall nur den Rückfall der
   * Farbwelt.
   */
  mark: ['g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'i.rules', 'result.direction'],
  /**
   * DIE BILDSPRACHE BRAUCHT DIE FARBWELT UND DIE TEXTSCHRIFT (D6).
   *
   * Die drei Prinzip-Karten zeigen ABSTRAHIERTE Kompositionen statt Fotos
   * (§1.4) — und die bestehen aus nichts als der bestätigten Farbwelt; ohne
   * `h.*` stünden dort drei Skizzen in der Notfarbe. `i.pair` entscheidet die
   * Spanne der Icon-Strichstärke („passt die Strichstärke zur Textschrift?"),
   * `g.mix` belegt Prinzip, Illustration und Icons vor (DNA „Bildwelt" und
   * „Formsprache"), `result.direction` trägt wie überall nur den Rückfall der
   * Farbwelt.
   *
   * `i.rules` fehlt bewusst: Gewicht, Laufweite und Versalien gelten für
   * Überschrift und Wortmarke — ein Icon hat weder das eine noch das andere.
   */
  imagery: ['g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'result.direction'],
  /**
   * DIE BEWEGUNG BRAUCHT DIE GANZE MARKE (D7).
   *
   * Dieses Kapitel zeigt keine eigene Fläche: es spielt die Szene ab, die aus
   * Farbwelt, Schriftpaar UND den Schrift-Regeln besteht — nur so ist zu
   * beurteilen, ob 240 ms zu DIESER Marke passen. `i.rules` gehört anders als
   * in D6 dazu, weil die Wortmarke im Kopf der Szene mit Gewicht, Laufweite und
   * Versalien gesetzt wird (dieselbe Liste wie beim Zeichen); `g.mix` belegt
   * Tempo und kinetisches Zeichen vor (DNA „Bewegungs-Charakter"),
   * `result.direction` trägt wie überall nur den Rückfall der Farbwelt.
   */
  motion: ['g.mix', 'h.base', 'h.neutral', 'h.accent', 'i.pair', 'i.rules', 'result.direction'],
}

/** Die Quell-Slots einer Bühne — leer, wo sie keine braucht. */
export function brandStageSourceSlots(stepKey: BrandStepKey): readonly string[] {
  return BRAND_STAGE_SOURCE_SLOTS[stepKey] ?? []
}
