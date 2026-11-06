import { brandChoiceContract, brandChoicePromptRule } from '../../shared/brandChoiceOptions'
import {
  type BrandPathKind,
  type BrandSessionConfig,
  slotById,
} from '../../shared/slotRegistry'
import {
  type BrandSlotInstructionOptions,
  GEORGE_PRIMARY_SOURCE_ANSWERS,
  GEORGE_PRIMARY_SOURCE_START_CARD,
  brandSlotInstructionTail,
  brandValueHasSpeaker,
} from './georgePrompt'

/**
 * DER EINE PROMPT-BAUER JE SESSION (BW2 Paket 1,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §3 „Prompt-Aufbau aus der Config").
 *
 * ── WARUM EINER STATT VIER ────────────────────────────────────────────────
 * Bis heute lagen die Feld-Anweisungen in vier Dateien —
 * `contextSlotInstruction`, `veraSlotInstruction`, `miloSlotInstruction`,
 * `archetypeSlotInstruction` —, je eine Tabelle `slotId → Zeilen`. Das war nie
 * eine Aussage über Bausteine, sondern der Zustand „wir bauen Kapitel für
 * Kapitel": vier Tabellen, vier Stellen, an denen ein Rahmen fehlen kann, und
 * ein Slot, der in der falschen Tabelle nachschlug, warf. Die Aufträge sind
 * jetzt INHALT der Session (`sessionContent.ts`), dieser Bauer setzt sie
 * zusammen, und das Regel-FUNDAMENT (Quellen-Ehrlichkeit, Leitplanken, Form
 * des Feldwerts, Zug-Vertrag) bleibt wo es war: in
 * `brandSlotInstructionTail()`.
 *
 * ── DIE FESTE REIHENFOLGE ─────────────────────────────────────────────────
 * Ziel · Eingaben · Verarbeitung · Form · Qualität · Anti-Muster · Beispiele ·
 * Leiter, danach das Fundament. Leere Abschnitte werden AUSGELASSEN — eine
 * Überschrift ohne Inhalt liest ein Modell als Lücke und füllt sie.
 *
 * Zwei Abschnitte stehen bewusst nicht darin:
 *  · EINGABEN. Welche Felder er lesen darf, sagt das Fundament schon
 *    (`Your inputs are the fields: …`) — hier eine zweite Liste zu setzen
 *    hiesse, dieselbe Auskunft zweimal zu geben und beim nächsten Umbau
 *    einmal zu vergessen.
 *  · ANTWORT-REGELN (`answers`). Sie steuern das GESPRÄCH — wie oft George
 *    nachfragt, ob „weiss ich nicht" gilt, ob man vertagen darf. Ein
 *    ENTWURFS-Auftrag fragt niemanden; sie gehören deshalb in
 *    `conversePrompt.ts` (Paket 3) und nicht hierher.
 *
 * ── SEIT PAKET 2 IST DAS ERGEBNIS LÄNGER ALS DAS ALTE ────────────────────
 * `quality`, `antiPatterns`, `examples`, `ladder` und `form` sind gefüllt
 * (Davids Inhalts-Gate), also stehen unter den unveränderten
 * Verarbeitungsregeln jetzt weitere Abschnitte. Was BLEIBT, ist die
 * Zeilen-Deckung: jede Zeile der vier Vorgänger — ausser der `TASK:`-Zeile,
 * deren Ziel geschärft werden durfte — steht wörtlich auch im neuen Prompt,
 * bewiesen an `tests/fixtures/slotInstructions.before.json` (vor dem Umbau
 * erzeugt). Weil der Text sich damit GEÄNDERT hat, sind in Paket 2 alle vier
 * Prompt-Fassungen gestiegen; in Paket 1 war das Gegenteil richtig.
 *
 * ── EINE SESSION OHNE VERARBEITUNGSREGELN HAT KEINEN ENTWURFS-AUFTRAG ─────
 * Dann wirft der Bauer, wie die vier Vorgänger auch. Das ist Absicht: ein
 * stiller Allzweck-Text wäre ein Entwurf ohne Auftrag, und der landet
 * ununterscheidbar im Brand-Dokument. Die Route macht aus dem Wurf
 * `provider_error`, der Stand bleibt bearbeitbar (§9b.5). Die zweite
 * Bedingung — `generator: 'none'` — hält den Wurf auch dann, wenn Paket 2
 * jeder Session Regeln gibt: ein Feld, das George gar nicht entwirft
 * (`d.pairs`, jede reine Menschenfrage), bekommt hier nie eine Anweisung.
 */

/** Abschnitt: Überschrift plus Zeilen. Leere Zeilenlisten fliegen raus. */
function section(heading: string, lines: readonly string[]): string[] {
  return lines.length ? [heading, ...lines] : []
}

/**
 * DIE FORM DES WERTS als Prompt-Zeilen — nur, was ABWEICHT.
 *
 * `person: 'fromTeam'`, `tense: 'any'`, kein Wortdeckel und keine Verbotsliste
 * sind die mechanischen Vorgaben aus `defineSession`; sie auszuschreiben hiesse,
 * dem Modell „keine Regel" als Regel zu verkaufen.
 *
 * ── DIE TEAM-WEICHE SCHLÄGT DIE FESTE PERSON (a-14) ───────────────────────
 * Sagt die Weiche etwas (`options.team` gesetzt UND die Form sieht überhaupt
 * einen Sprecher vor), schweigt die Person-Zeile hier: die Regel steht dann
 * weiter unten im Fundament (`brandTeamVoiceLines`), ausformuliert und mit der
 * Ausnahme für „ohne Person". Zwei Vorgaben zur selben Frage im selben Prompt
 * wären ein Widerspruch — und `a.pitch` steht fest auf „wir", also entstünde er
 * ausgerechnet an dem Feld, das Davids Befund ausgelöst hat.
 */
function formLines(config: BrandSessionConfig, options: BrandSlotInstructionOptions): string[] {
  const lines: string[] = []
  const teamDecides = !!options.team && brandValueHasSpeaker(config.form.person)
  if (!teamDecides && config.form.person === 'we') {
    lines.push('Write it in the first person plural ("we").')
  }
  if (!teamDecides && config.form.person === 'I') {
    lines.push('Write it in the first person singular ("I").')
  }
  if (config.form.person === 'brand') lines.push('Write it about the brand, in the third person.')
  if (config.form.person === 'none') lines.push('Write it without a grammatical subject for the brand.')
  if (config.form.tense === 'present') lines.push('Present tense.')
  if (config.form.tense === 'future') lines.push('Future tense.')
  if (config.form.maxWords !== null) lines.push(`At most ${config.form.maxWords} words.`)
  if (config.form.forbidden.length) {
    lines.push(`Never in this value: ${config.form.forbidden.join('; ')}.`)
  }
  return lines
}

/**
 * Beispiele des PFADES und der INHALTSSPRACHE — nie die des anderen Pfades und
 * nie die der anderen Sprache (Plan §3a Nr. 3).
 *
 * Die Sprachwahl folgt derselben Konvention wie `advisorOpenersFor`: alles, was
 * nicht mit `de` beginnt, bekommt die englische Fassung. Fehlt die Sprache
 * ganz, ist es `en` — die Default-Locale des Layers (s. `contentLocale` in
 * `BrandSlotInstructionOptions`).
 */
function exampleLines(
  config: BrandSessionConfig,
  pathKind: BrandPathKind,
  contentLocale: string | undefined,
): string[] {
  const set = config.examples[pathKind]
  const texts = (contentLocale ?? 'en').toLowerCase().startsWith('de') ? set.de : set.en
  return texts.map(example => `- ${example}`)
}

function ladderLines(config: BrandSessionConfig): string[] {
  const lines: string[] = []
  if (config.ladder.opening.trim()) lines.push(`Open with: ${config.ladder.opening}`)
  for (const probe of config.ladder.probes) lines.push(`If the answer is thin, ask: ${probe}`)
  for (const reframe of config.ladder.reframes) lines.push(`If it falls into a known trap: ${reframe}`)
  return lines
}

/**
 * DIE ANWEISUNG FÜR EINE SESSION. Wirft, wenn sie keinen Entwurfs-Auftrag hat
 * (s. Kopf).
 */
export function sessionInstruction(
  config: BrandSessionConfig,
  options: BrandSlotInstructionOptions,
): string {
  if (config.generator === 'none' || config.processing.rules.length === 0) {
    throw new Error(`Kein Entwurfs-Auftrag für Session ${config.id}`)
  }

  const lines = [
    `TASK: ${config.goal}`,
    ...config.processing.rules,
    ...config.processing.pathRules[options.pathKind],
    ...section('The form of the value:', formLines(config, options)),
    ...section('Marks of a good value:', config.quality.map(mark => `- ${mark}`)),
    ...section('Never accept:', config.antiPatterns.map(pattern => `- ${pattern}`)),
    ...section(
      'Examples of the FORM only — a different industry, never copy their content:',
      exampleLines(config, options.pathKind, options.contentLocale),
    ),
    ...section('How to lead this session:', ladderLines(config)),
  ]

  /**
   * DIE PRIMÄRE QUELLE — mechanisch, nicht je Baustein gepflegt.
   *
   * Baustein A schöpft aus der STARTKARTE, und seine Sessions haben genau
   * deshalb keine Slot-Eingaben. Sobald eine Session ANTWORTEN liest, sind die
   * ihre Quelle und die Karte nur noch Hintergrund — ein Purpose aus vier
   * Startkarten-Zeilen statt aus fünf beantworteten Fragen wäre genau die
   * Behauptung, die Regel 4 verbietet.
   */
  const primarySource = config.inputs.startCard && config.inputs.slots.length === 0
    ? GEORGE_PRIMARY_SOURCE_START_CARD
    : GEORGE_PRIMARY_SOURCE_ANSWERS

  // Die legale Menge einer Auswahl steht WÖRTLICH im Prompt
  // (`brandChoiceOptions.ts`): „choose one of the common models" bringt
  // „Hybrid" zurück, und ein fünftes Modell im Brand-Dokument rechnet niemand
  // mehr zurück. Sessions ohne Vertrag bekommen keine Wert-Regeln.
  const contract = brandChoiceContract(config.id)

  return [
    ...lines,
    ...brandSlotInstructionTail(options, {
      primarySource,
      // a-14: WER im Feld spricht, entscheidet die Team-Weiche — aber nur, wo
      // die Session einen Sprecher vorsieht. Das Fundament kann das nicht
      // wissen, der Bauer schon: er hält die Session in der Hand.
      valuePerson: config.form.person,
      ...(contract ? { valueRules: brandChoicePromptRule(contract) } : {}),
    }),
  ].join('\n')
}

/**
 * DIESELBE ANWEISUNG ÜBER DIE SLOT-ID — die Form, in der die Generator-Naht
 * sie erwartet (`AdvisorSlotGeneratorOptions.instruction`).
 *
 * Sie wirft für eine unbekannte Id, statt still nichts zu liefern: eine Id, die
 * es nicht gibt, ist ein Tippfehler in einer Registrierung und kein Zustand.
 */
export function sessionInstructionForSlot(
  slotId: string,
  options: BrandSlotInstructionOptions,
): string {
  const config = slotById(slotId)
  if (!config) throw new Error(`Unbekannte Session ${slotId}`)
  return sessionInstruction(config, options)
}
