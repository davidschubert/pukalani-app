import {
  brandSlotValueView,
  formatBrandSlotList,
  formatBrandSlotStructured,
} from './brandSlotFormat'
import { BRAND_NAME_TYPES, type BrandKitTerm } from './brandKitVocab'

/**
 * DIE INNERE FORM DER SCHICHT-3-WERTE — EIN Schreiber und EIN Leser je
 * Session (Konzept docs/plans/BRAND-BOOK-KIT.md §2.2–§2.4, Paket K5).
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * `brandSlotFormat.ts` beschreibt die ÄUSSERE Form einer Art (`- ` je Zeile,
 * `## ` je Block) und sagt bewusst nichts über den Inhalt eines Eintrags. Für
 * Schicht 3 reicht das nicht: ein Muster trägt DREI Teile (Muster, Beispiel,
 * Herkunft), eine Leitplanken-Gruppe trägt eine Liste IN einem Block, und ein
 * Presse-Kontakt trägt drei beschriftete Felder. Wer diese innere Form
 * nachbaut, baut sie zweimal — einmal im Schreiber (Otto/Nika, die pure
 * Rechnung, der Bühnen-Editor) und einmal im Leser (`brandFoundation.ts`,
 * K4). Genau das war bis K4 der Zustand: die Split-Logik der Tabelle stand in
 * `nomenclatureBlocks`, und der Schreiber, der sie hätte bedienen müssen, gab
 * es noch gar nicht. Das erste Muster mit einer Herkunft hätte die Tabelle
 * still falsch gefüllt.
 *
 * Ab hier gilt: WER EINEN K5-WERT SCHREIBT, GEHT DURCH `format…`; WER IHN
 * LIEST, DURCH `parse…`. Der K4-Leser tut es seit diesem Paket ebenfalls.
 *
 * ── DIE FALLE AUS K4 GELERNT (§2.18 „Stand K4", Gelernt 1) ────────────────
 * `formatBrandSlotStructured` zieht JEDEN Block auf EINE Zeile. Für Muster
 * und Leitplanken ist das in Ordnung — sie bekommen ` · ` als Trenner, und
 * ein Mittelpunkt zerbricht nicht an den Gedankenstrichen, die in den Mustern
 * selbst stehen. Für eine PROMPT-VORLAGE ist es falsch: eine Vorlage ohne
 * Zeilenumbrüche ist nicht dieselbe Vorlage. `formatBrandPromptTemplates`
 * baut den Wert deshalb SELBST — die äussere Form (`## ` + Leerzeile) bleibt
 * dieselbe, nur der Rumpf behält seine Zeilen. `brandSlotValueView` liest das
 * ohne Zutun (es fügt die Rumpfzeilen mit `\n` wieder zusammen); die einzige
 * Bedingung ist, dass IN einem Rumpf keine LEERZEILE steht — sie wäre im
 * Speicher nicht mehr von einem Blockwechsel zu unterscheiden.
 *
 * ── DIESE DATEI IST PUR ───────────────────────────────────────────────────
 * Kein i18n, kein H3, kein Appwrite, kein Zod. Die Zod-Formverträge der zwei
 * Entwurfs-Sessions stehen in `schemas/brandKitSlots.ts` — dieselbe
 * Arbeitsteilung wie überall im Layer (`shared/` beschreibt, `schemas/`
 * validiert), und `shared/` bleibt damit frei von einer Bibliothek, die auf
 * jeder Leseansicht mitgeladen würde.
 *
 * ── BESCHRIFTUNGEN STEHEN IN DER INHALTSSPRACHE DER MARKE ─────────────────
 * Die Block-Überschriften (`Ton-Parameter`, `Name`, `System-Prompt`) sind Teil
 * des WERTES und reisen mit ihm ins Handbuch und nach `brand.md`. Sie sind
 * deshalb zweisprachig hier gepflegt und NICHT als i18n-Schlüssel — dieselbe
 * Auflösung wie in `brandKitVocab.ts` und `brandChoiceOptions.ts` (K4
 * Gelernt 2: der Renderer darf Sätze in der Inhaltssprache erzeugen, nur der
 * RAHMEN reist als Schlüssel). Gelesen wird trotzdem TOLERANT gegen Id, de
 * und en: ein von Hand korrigierter Wert soll nicht seine Gruppe verlieren.
 */

/**
 * DER TRENNER INNERHALB EINES BLOCKS.
 *
 * Ein Mittelpunkt und kein Semikolon, kein Gedankenstrich, kein Komma: die
 * Muster selbst tragen Gedankenstriche („Ort + Erntemonat — kein
 * Fantasiename"), Sätze tragen Kommas, und ein Semikolon sähe im Handbuch aus
 * wie Zeichensetzung statt wie Struktur. Derselbe Trenner, den `ruleEntries`
 * in `brandFoundation.ts` seit K4 liest.
 */
export const BRAND_KIT_PART_SEPARATOR = ' · '

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

function text(locale: string, de: string, en: string): string {
  return isDe(locale) ? de : en
}

/** Eine Zeile ohne Umbrüche und ohne Rand — was in einen Teil gehört. */
function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim()
}

/** Die Teile eines Block-Rumpfs — Zeilen zuerst, sonst Mittelpunkte. */
function bodyParts(body: string): string[] {
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length > 1) return lines
  return (lines[0] ?? '')
    .split(BRAND_KIT_PART_SEPARATOR.trim())
    .map(part => part.trim())
    .filter(Boolean)
}

/** Vergleichsform: Gross/Klein, Rand und Schlusszeichen zählen nicht. */
function comparable(value: string): string {
  return value.trim().toLowerCase().replace(/[.!?:;]+$/u, '')
}

// ── M · Nomenklatur: die Namensmuster (`m.patterns`) ────────────────────────

/**
 * EIN MUSTER JE PRODUKTTYP — vier Teile, drei davon Pflicht.
 *
 * `source` ist die HERKUNFT und laut Session-Qualität Pflicht („Every pattern
 * names its source"). Sie steht als EIGENER Teil und nicht am Ende des
 * Beispiels, weil sie im Handbuch eine eigene Spalte bekommt: ein Beispiel
 * („Kona Februar 2026") und eine Begründung („aus dem Architektur-Modell
 * ‚eine Marke'") sind zwei verschiedene Auskünfte, und in einer Zelle
 * gemischt kann man weder die eine noch die andere überfliegen.
 *
 * BESTANDSWERTE OHNE HERKUNFT bleiben lesbar: `source` ist dann ''. Ein
 * Muster, das vor K5 entstanden ist, verliert nicht seine Zeile, nur weil die
 * dritte Auskunft fehlt (dieselbe Nachsicht wie überall beim Lesen).
 */
export interface BrandNamePattern {
  /** Die Typ-Id aus `BRAND_NAME_TYPES` — oder, bei Altdaten, ihr Label. */
  readonly type: string
  /** Die Regel, die ein Fremder morgen anwenden könnte. */
  readonly pattern: string
  /** Ein Name, der ihr gehorcht. */
  readonly example: string
  /** Die Stelle der Foundation, aus der sie folgt. '' bei Altdaten. */
  readonly source: string
}

export function formatBrandNamePatterns(entries: readonly BrandNamePattern[]): string {
  return formatBrandSlotStructured(entries.map(entry => ({
    label: entry.type,
    body: [entry.pattern, entry.example, entry.source]
      .map(part => oneLine(part))
      .filter(Boolean)
      .join(BRAND_KIT_PART_SEPARATOR),
  })))
}

/**
 * DIE MUSTER AUS EINEM GESPEICHERTEN WERT.
 *
 * Zwei Schreibweisen, eine Lesart (die Regel steht seit K4 im Renderer und
 * wohnt jetzt hier): der Rumpf trägt seine Teile entweder auf ZEILEN oder in
 * einer Zeile durch ` · ` getrennt. Beides gibt es wirklich — der kanonische
 * Schreiber zieht zusammen, ein Mensch im Bühnen-Editor tippt untereinander.
 *
 * Ein Block OHNE Muster fällt heraus: eine Zeile mit Typ und ohne Regel wäre
 * im Handbuch eine leere Behauptung.
 */
export function parseBrandNamePatterns(value: string): BrandNamePattern[] {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks') return []
  return view.blocks
    .map((block) => {
      const [pattern = '', example = '', ...rest] = bodyParts(block.body)
      return {
        type: block.label.trim(),
        pattern,
        example,
        source: rest.join(BRAND_KIT_PART_SEPARATOR),
      }
    })
    .filter(entry => entry.type.length > 0 && entry.pattern.length > 0)
}

/** Passt dieser Wert zu einer Typ-Id bzw. einem Typ-Label? */
function sameKitTerm(terms: readonly BrandKitTerm[], left: string, right: string): boolean {
  const of = (value: string): string => {
    const needle = comparable(value)
    const term = terms.find(entry => comparable(entry.id) === needle
      || comparable(entry.de) === needle
      || comparable(entry.en) === needle)
    return term ? term.id : needle
  }
  return of(left) === of(right)
}

export type BrandKitViolation =
  | 'pattern_missing'
  | 'pattern_stray_type'
  | 'pattern_duplicate_type'
  | 'pattern_no_example'
  | 'guardrail_groups_missing'
  | 'guardrail_taboo_in_tone'

export type BrandKitCheck =
  | { readonly ok: true }
  | { readonly ok: false, readonly violation: BrandKitViolation, readonly detail: string }

/**
 * DIE INVARIANTEN DER NAMENSMUSTER (§2.2) — sie prüfen den ENTWURF, bevor er
 * einer wird.
 *
 * Vier Fragen, und jede hat einen anderen Schaden im Rücken:
 *  1. JEDER gewählte Typ hat ein Muster — sonst steht im Handbuch eine
 *     Tabelle, die für „Ort/Filiale" schweigt, obwohl der Mensch ihn gewählt
 *     hat.
 *  2. KEIN Typ ausserhalb der Wahl — ein Muster für „Digital" bei einer
 *     Marke, die kein Digitales benannt hat, ist eine erfundene Festlegung.
 *  3. KEIN Typ zweimal — dann weiss niemand, welche der beiden Regeln gilt
 *     (Anti-Muster der Session, wörtlich).
 *  4. JEDES Muster mit Beispiel — ein Muster ohne Beispiel ist ein Satz, der
 *     erst beim ersten echten Namen zeigt, ob er stimmt.
 *
 * Die HERKUNFT wird hier NICHT erzwungen. Sie steht als Pflicht im Prompt und
 * in der Qualität, aber ein Entwurf, dem sie fehlt, ist ein Entwurf mit einer
 * fehlenden Begründung — kein falscher Wert. Ihn deswegen zu verwerfen
 * kostete den Menschen einen ganzen Lauf für eine Zelle, die er in zwei
 * Sekunden selbst füllt.
 */
export function checkBrandNamePatterns(
  chosenTypes: readonly string[],
  value: string,
): BrandKitCheck {
  const patterns = parseBrandNamePatterns(value)
  const types = chosenTypes.map(entry => entry.trim()).filter(Boolean)

  for (const type of types) {
    const hits = patterns.filter(entry => sameKitTerm(BRAND_NAME_TYPES, entry.type, type))
    if (hits.length === 0) return { ok: false, violation: 'pattern_missing', detail: type }
    if (hits.length > 1) return { ok: false, violation: 'pattern_duplicate_type', detail: type }
  }
  for (const entry of patterns) {
    if (!types.some(type => sameKitTerm(BRAND_NAME_TYPES, entry.type, type))) {
      return { ok: false, violation: 'pattern_stray_type', detail: entry.type }
    }
    if (entry.example.length === 0) {
      return { ok: false, violation: 'pattern_no_example', detail: entry.type }
    }
  }
  return { ok: true }
}

// ── M · Nomenklatur: die Regeln (`m.rules`) ─────────────────────────────────

/**
 * DIE REGELN, VORBEFÜLLT AUS DEN MUSTERN — PUR, kein Modell-Lauf (§2.2:
 * `generator: 'none'`).
 *
 * Vier Regeln entstehen mechanisch, weil die Session genau vier Dinge
 * verlangt (Reihenfolge, Gross-/Kleinschreibung, Trennzeichen, „nie"), und
 * jede davon liest etwas, das oben schon steht:
 *  · die REIHENFOLGE aus der Architektur-Regel `b2.rule`, sonst aus dem
 *    ersten Muster (dort steht die Dachmarke vorn oder nicht);
 *  · SCHREIBWEISE und TRENNZEICHEN als die zwei Fassungen, die jede Marke
 *    braucht (Fliesstext und Adresse) — sie sind eine Setzung, keine
 *    Ableitung, und sagen das im Text auch nicht anders;
 *  · das „nie" aus den Mustern selbst: was ein Muster ausschliesst
 *    („kein Fantasiename", „nie eine Nummer"), ist die Verbotsregel, die
 *    dazugehört.
 *
 * Sie sind ein VORSCHLAG. Der Mensch bestätigt oder ändert sie auf der Bühne
 * — dieselbe Mechanik wie bei `l.rules` (D7) und `i.rules` (D4).
 */
export function deriveBrandNameRules(input: {
  readonly patterns: readonly BrandNamePattern[]
  readonly architectureRule: string
  readonly locale: string
}): string[] {
  const { locale } = input
  const rules: string[] = []
  const first = input.patterns[0]

  const order = oneLine(input.architectureRule)
  if (order) {
    rules.push(text(
      locale,
      `Reihenfolge: ${order}`,
      `Order: ${order}`,
    ))
  }
  else if (first) {
    rules.push(text(
      locale,
      `Reihenfolge: wie im Muster für ${first.type} — ${first.pattern}`,
      `Order: as in the pattern for ${first.type} — ${first.pattern}`,
    ))
  }

  rules.push(text(
    locale,
    'Schreibweise: im Fliesstext wie ein Eigenname, in Adressen und Dateinamen '
    + 'alles klein und mit Bindestrich.',
    'Spelling: like a proper name in running text; lower case with hyphens in '
    + 'addresses and file names.',
  ))
  rules.push(text(
    locale,
    'Trennzeichen: ein Leerzeichen zwischen Dachmarke und Zusatz — kein „by", '
    + 'kein Schrägstrich, kein Bindestrich.',
    'Separator: one space between umbrella brand and addition — no "by", no '
    + 'slash, no hyphen.',
  ))

  const never = input.patterns
    .map(entry => entry.pattern)
    .map(pattern => pattern.split(/\s+—\s+|\s+–\s+/u)[1] ?? '')
    .map(part => oneLine(part))
    .filter(Boolean)
  rules.push(never.length > 0
    ? text(
      locale,
      `Nie: ${never.join(BRAND_KIT_PART_SEPARATOR)}.`,
      `Never: ${never.join(BRAND_KIT_PART_SEPARATOR)}.`,
    )
    : text(
      locale,
      'Nie zwei Namen für dieselbe Sache — an der Tür steht, was auf der Rechnung steht.',
      'Never two names for one thing — the door says what the invoice says.',
    ))

  return rules
}

export function formatBrandNameRules(rules: readonly string[]): string {
  return formatBrandSlotList(rules)
}

// ── N · AI-Guidelines: die Leitplanken (`n.guardrails`) ─────────────────────

/**
 * DIE VIER GRUPPEN — feste Reihenfolge, stabile Ids (§2.3).
 *
 * Die Reihenfolge ist die des Konzepts und die des abgenommenen Klickdummys,
 * und sie ist nicht beliebig: sie geht vom HÄUFIGSTEN zum SELTENSTEN Fall.
 * Ein Mensch, der die Leitplanken einem Werkzeug gibt, liest den Ton jeden
 * Tag, die Tabus wöchentlich, die Schreibweisen beim Korrekturlesen und die
 * No-go-Themen hoffentlich nie.
 */
export const BRAND_GUARDRAIL_GROUPS: readonly { id: string, de: string, en: string }[] = [
  { id: 'tone', de: 'Ton-Parameter', en: 'Tone parameters' },
  { id: 'taboo', de: 'Tabus', en: 'Taboos' },
  { id: 'spelling', de: 'Markenzeichen-Schreibweisen', en: 'Brand mark spellings' },
  { id: 'nogo', de: 'No-go-Themen', en: 'No-go topics' },
]

export interface BrandGuardrailGroup {
  /** Eine der vier Ids — '' bei einer von Hand ergänzten fünften Gruppe. */
  readonly id: string
  /** Die Überschrift, wie sie im Wert steht (Inhaltssprache). */
  readonly label: string
  readonly lines: readonly string[]
}

export function brandGuardrailGroupLabel(id: string, locale: string): string {
  const group = BRAND_GUARDRAIL_GROUPS.find(entry => entry.id === id)
  return group ? text(locale, group.de, group.en) : id
}

/** Die Gruppen-Id hinter einer Überschrift — '' für eine fremde Gruppe. */
export function brandGuardrailGroupId(label: string): string {
  const needle = comparable(label)
  const group = BRAND_GUARDRAIL_GROUPS.find(entry => comparable(entry.id) === needle
    || comparable(entry.de) === needle
    || comparable(entry.en) === needle)
  return group ? group.id : ''
}

export function formatBrandGuardrails(groups: readonly BrandGuardrailGroup[]): string {
  return formatBrandSlotStructured(groups.map(group => ({
    label: group.label,
    body: group.lines.map(line => oneLine(line)).filter(Boolean).join(BRAND_KIT_PART_SEPARATOR),
  })))
}

export function parseBrandGuardrails(value: string): BrandGuardrailGroup[] {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks') return []
  return view.blocks
    .map(block => ({
      id: brandGuardrailGroupId(block.label),
      label: block.label.trim(),
      lines: bodyParts(block.body),
    }))
    .filter(group => group.label.length > 0 && group.lines.length > 0)
}

/**
 * DIE INVARIANTEN DER LEITPLANKEN (§2.3).
 *
 * Zwei Fragen, und die zweite ist die teure: ein TABU-WORT, das in den
 * Ton-Parametern auftaucht, ist ein Regelwerk, das sich selbst widerspricht —
 * und zwar in genau der Datei, die eine Maschine liest. Ein Modell, das
 * `brand.md` bekommt, liest „Ton: erlebnisreich" und „Tabu: Erlebnis" und
 * entscheidet sich für eines von beidem; welches, weiss niemand.
 *
 * Geprüft wird auf WORTGRENZE, nicht auf Teilstring: „Auszeit" darf ein
 * „auszeichnen" im Ton nicht zu Fall bringen.
 */
export function checkBrandGuardrails(
  avoidWords: readonly string[],
  value: string,
): BrandKitCheck {
  const groups = parseBrandGuardrails(value)
  const present = new Set(groups.map(group => group.id).filter(Boolean))
  const missing = BRAND_GUARDRAIL_GROUPS.filter(group => !present.has(group.id))
  if (missing.length > 0) {
    return {
      ok: false,
      violation: 'guardrail_groups_missing',
      detail: missing.map(group => group.id).join(', '),
    }
  }

  const tone = groups.find(group => group.id === 'tone')?.lines.join(' ').toLowerCase() ?? ''
  for (const raw of avoidWords) {
    const word = raw.trim()
    if (word.length < 3) continue
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word.toLowerCase())}([^\\p{L}\\p{N}]|$)`, 'u')
    if (pattern.test(tone)) {
      return { ok: false, violation: 'guardrail_taboo_in_tone', detail: word }
    }
  }
  return { ok: true }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── N · AI-Guidelines: die drei Vorlagen (`n.prompts`) ──────────────────────

/**
 * DREI VORLAGEN, NICHT VIER (§2.3, Anti-Muster der Session wörtlich: „a fourth
 * template, because three is what a person keeps at hand").
 */
export const BRAND_PROMPT_TEMPLATES: readonly { id: string, de: string, en: string }[] = [
  { id: 'system', de: 'System-Prompt', en: 'System prompt' },
  { id: 'social', de: 'Social-Post', en: 'Social post' },
  { id: 'email', de: 'E-Mail an Kunden', en: 'Email to customers' },
]

export interface BrandPromptTemplate {
  readonly id: string
  /** Der Titel, wie er im Wert steht (Inhaltssprache). */
  readonly title: string
  /** Die Vorlage — MIT Zeilenumbrüchen, ohne Leerzeilen (s. Kopf). */
  readonly body: string
}

export function brandPromptTemplateTitle(id: string, locale: string): string {
  const template = BRAND_PROMPT_TEMPLATES.find(entry => entry.id === id)
  return template ? text(locale, template.de, template.en) : id
}

export function brandPromptTemplateId(title: string): string {
  const needle = comparable(title)
  const template = BRAND_PROMPT_TEMPLATES.find(entry => comparable(entry.id) === needle
    || comparable(entry.de) === needle
    || comparable(entry.en) === needle)
  return template ? template.id : ''
}

/**
 * DER EIGENE SCHREIBER — er hält die äussere Form ein und behält die Zeilen
 * (s. Kopf, K4 Gelernt 1).
 *
 * LEERZEILEN IM RUMPF WERDEN GESCHLOSSEN, nicht verboten: eine leere Zeile
 * mitten in einer Vorlage wäre im Speicher ein Blockwechsel, und die halbe
 * Vorlage stünde danach als Vorlage ohne Titel da. Sie fällt deshalb weg —
 * sichtbar weniger, aber lesbar.
 */
export function formatBrandPromptTemplates(templates: readonly BrandPromptTemplate[]): string {
  return templates
    .map(template => ({
      title: oneLine(template.title),
      lines: template.body.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean),
    }))
    .filter(template => template.title.length > 0 && template.lines.length > 0)
    .map(template => `## ${template.title}\n${template.lines.join('\n')}`)
    .join('\n\n')
}

export function parseBrandPromptTemplates(value: string): BrandPromptTemplate[] {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks') return []
  return view.blocks
    .map(block => ({
      id: brandPromptTemplateId(block.label),
      title: block.label.trim(),
      body: block.body.trim(),
    }))
    .filter(template => template.title.length > 0 && template.body.length > 0)
}

/**
 * DIE DREI VORLAGEN, PUR GERECHNET (§2.11: null KI-Aufrufe).
 *
 * ── DER SYSTEM-PROMPT IST DIE KURZFORM VON `brand.md`, NICHT SEIN ZWILLING ─
 * Die Session-Qualität sagt es wörtlich: „The system prompt is the short form
 * of brand.md, in the same words." Der Rumpf kommt deshalb als fertiger Text
 * von `renderBrandContextSystemPrompt` (K3) herein und wird hier NICHT noch
 * einmal formuliert. Eine zweite Fassung derselben Sätze wäre die eine, die
 * beim nächsten Umbau vergessen wird.
 *
 * ── DIE ANDEREN ZWEI TRAGEN DIE LEITPLANKEN, NICHT IHRE ZUSAMMENFASSUNG ───
 * Ebenfalls Session-Qualität: „Each template carries the guardrails, not a
 * summary of them." Ton und Tabus stehen deshalb als die Zeilen, die in
 * `n.guardrails` bestätigt wurden — Wort für Wort.
 */
export function buildBrandPromptTemplates(input: {
  readonly systemPrompt: string
  readonly guardrails: readonly BrandGuardrailGroup[]
  readonly title: string
  readonly locale: string
}): BrandPromptTemplate[] {
  const { locale } = input
  const brand = oneLine(input.title) || text(locale, 'diese Marke', 'this brand')
  const linesOf = (id: string): string[] =>
    input.guardrails.find(group => group.id === id)?.lines.map(line => oneLine(line)).filter(Boolean) ?? []
  const tone = linesOf('tone')
  const taboo = linesOf('taboo')
  const spelling = linesOf('spelling')
  const nogo = linesOf('nogo')

  const carry = (): string[] => [
    ...(tone.length ? [text(locale, `Ton: ${tone.join(' ')}`, `Tone: ${tone.join(' ')}`)] : []),
    ...(taboo.length ? [text(locale, `Nie: ${taboo.join(' ')}`, `Never: ${taboo.join(' ')}`)] : []),
    ...(spelling.length
      ? [text(locale, `Schreibweisen: ${spelling.join(' ')}`, `Spellings: ${spelling.join(' ')}`)]
      : []),
    ...(nogo.length ? [text(locale, `Nicht behandeln: ${nogo.join(' ')}`, `Do not touch: ${nogo.join(' ')}`)] : []),
  ]

  const templates: BrandPromptTemplate[] = []

  const system = input.systemPrompt.trim()
  if (system) {
    templates.push({
      id: 'system',
      title: brandPromptTemplateTitle('system', locale),
      body: system,
    })
  }

  templates.push({
    id: 'social',
    title: brandPromptTemplateTitle('social', locale),
    body: [
      text(
        locale,
        `Schreibe einen Social-Post für ${brand}, höchstens 60 Wörter.`,
        `Write a social post for ${brand}, 60 words at most.`,
      ),
      text(
        locale,
        'Ein Satz, was es gibt. Ein Satz, für wen. Ein Satz, wo.',
        'One sentence on what it is. One on who it is for. One on where.',
      ),
      ...carry(),
    ].join('\n'),
  })

  templates.push({
    id: 'email',
    title: brandPromptTemplateTitle('email', locale),
    body: [
      text(
        locale,
        `Schreibe eine kurze E-Mail an Kundinnen und Kunden von ${brand}.`,
        `Write a short email to customers of ${brand}.`,
      ),
      text(
        locale,
        'Der Anlass steht im ersten Satz, keine Floskel davor.',
        'The reason is in the first sentence, no pleasantry before it.',
      ),
      ...carry(),
    ].join('\n'),
  })

  return templates
}

// ── P · Pressekit: die freigegebenen Fakten (`p.facts`) ────────────────────

/**
 * DIE EINTRÄGE VON `a.facts` — die Auswahlliste dieser Session.
 *
 * Sie steht hier und nicht im Panel, weil BEIDE Enden dieselbe Zerlegung
 * brauchen: der Server liest `a.facts` (die Datei ist `internal` und erreicht
 * den Browser nur über den Besitzer-Pfad), die Prüfung vergleicht die
 * gewählten Texte gegen dieselbe Liste.
 */
export function brandFactEntries(value: string): string[] {
  const view = brandSlotValueView('list', value)
  if (view.kind === 'list') return view.items.filter(Boolean)
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim().replace(/^(?:[-–—*•·]\s+|\d{1,2}[.)]\s+)/u, '').trim())
    .filter(Boolean)
}

/**
 * GESPEICHERT WIRD DER TEXT, NICHT DER INDEX (§2.4).
 *
 * Ein Index zeigte auf eine Zeile in `a.facts`, und `a.facts` ist genau die
 * Liste, die nie reist: das Pressekit wäre dann ein Verweis auf etwas, das
 * kein Leser sehen darf — und eine später ergänzte Zeile verschöbe still die
 * Freigabe von Fakt 2 auf Fakt 3.
 */
export function formatBrandPressFacts(facts: readonly string[]): string {
  return formatBrandSlotList(facts)
}

export function parseBrandPressFacts(value: string): string[] {
  return brandFactEntries(value)
}

// ── P · Pressekit: der Kontakt (`p.contact`) ───────────────────────────────

export const BRAND_CONTACT_FIELDS: readonly { id: 'name' | 'role' | 'email', de: string, en: string }[] = [
  { id: 'name', de: 'Name', en: 'Name' },
  { id: 'role', de: 'Rolle', en: 'Role' },
  { id: 'email', de: 'E-Mail', en: 'Email' },
]

export interface BrandPressContact {
  readonly name: string
  readonly role: string
  readonly email: string
}

export function brandContactFieldLabel(id: 'name' | 'role' | 'email', locale: string): string {
  const field = BRAND_CONTACT_FIELDS.find(entry => entry.id === id)
  return field ? text(locale, field.de, field.en) : id
}

/**
 * DREI BESCHRIFTETE BLÖCKE — und NIE eine Telefonnummer (§2.4, Anti-Muster
 * der Session: „a private mobile number given because the field was there").
 *
 * Die Vorlage „Kontakt aus dem Erstgespräch" trägt eine Telefonnummer; sie
 * wird schon serverseitig nicht mitgeschickt. Dass sie hier ein zweites Mal
 * nicht vorkommt, ist kein Doppel: dieser Schreiber ist die Stelle, an der
 * der Wert ENTSTEHT, und was er nicht schreiben kann, kann auch kein
 * künftiger Aufrufer hineinreichen.
 */
export function formatBrandPressContact(contact: BrandPressContact, locale: string): string {
  return formatBrandSlotStructured([
    { label: brandContactFieldLabel('name', locale), body: contact.name },
    { label: brandContactFieldLabel('role', locale), body: contact.role },
    { label: brandContactFieldLabel('email', locale), body: contact.email },
  ])
}

const EMAIL = /\S+@\S+\.\S+/u

/**
 * DER KONTAKT AUS EINEM GESPEICHERTEN WERT — TOLERANT, weil ein Mensch ihn
 * ändern darf.
 *
 * `p.contact` ist `structured`, aber `editor: 'text'`: wer die Rolle
 * korrigiert, tippt drei Zeilen und keine `## `-Blöcke. Gelesen wird deshalb,
 * was dasteht — die E-Mail ist der Eintrag mit dem `@`, der erste Rest ist der
 * Name, der zweite die Rolle. `null` heisst „daraus wird kein Kontakt"; der
 * Aufrufer stellt den Wert dann als Text hin, statt ihn zu verlieren.
 *
 * (Diese Regel stand seit K4 in `brandFoundation.ts` und ist mit K5 hierher
 * gezogen — sie ist der LESER zum Schreiber darüber, und die zwei gehören
 * nebeneinander.)
 */
export function parseBrandPressContact(value: string): BrandPressContact | null {
  const view = brandSlotValueView('structured', value)
  const entries = view.kind === 'blocks'
    ? view.blocks.map(block => block.body.trim()).filter(Boolean)
    : value.replace(/\r\n/g, '\n').split('\n')
      .map(line => line.trim().replace(/^(?:[-–—*•·]\s+)/u, '').trim())
      .filter(Boolean)
  if (entries.length === 0) return null

  const email = entries.find(entry => EMAIL.test(entry)) ?? ''
  const rest = entries.filter(entry => entry !== email)
  const name = rest[0] ?? ''
  if (!name && !email) return null
  return { name, role: rest[1] ?? '', email: EMAIL.exec(email)?.[0] ?? '' }
}

// ── P · Pressekit: die Vorschau (`p.summary`) ──────────────────────────────

export interface BrandPressSummarySection {
  readonly label: string
  readonly body: string
}

/**
 * DIE VORSCHAU IST EINE ZUSAMMENSTELLUNG (§2.4) — sie erfindet keinen Satz.
 *
 * Ein fehlender Teil wird BENANNT und nicht gefüllt (Session-Qualität: „A
 * part that is missing is named as missing, not filled with something
 * similar"). Deshalb reicht der Aufrufer auch die leeren Abschnitte herein
 * und diese Funktion setzt den Vermisst-Satz — nicht umgekehrt: eine
 * Zusammenstellung, die selbst entscheidet, was fehlen darf, ist wieder eine
 * zweite Wahrheit über das Pressekit.
 */
export function formatBrandPressSummary(sections: readonly BrandPressSummarySection[]): string {
  return formatBrandSlotStructured(sections.map(section => ({
    label: section.label,
    body: section.body,
  })))
}

export function brandPressSummaryMissing(locale: string): string {
  return text(
    locale,
    'Fehlt noch — kommt aus dem Kapitel darüber.',
    'Still missing — it comes from the chapter above.',
  )
}
