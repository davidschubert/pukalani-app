import { brandChoiceDisplayLabel } from './brandChoiceOptions'
import type {
  BrandFoundationBlock,
  BrandFoundationChapter,
  BrandFoundationChapterId,
  BrandFoundationView,
} from './brandFoundation'
import { brandFontPair } from './brandFontPairs'
import type { BrandDesignSnapshotPreset } from './types/brand'
import type {
  BrandContextInput,
  BrandContextJson,
  BrandContextJsonBlock,
  BrandContextJsonChapter,
} from './types/brandKit'

/**
 * DER BRAND CONTEXT — `brand.md` UND `brand.json` (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.12, Paket K3).
 *
 * ── EINE QUELLE: DIE FERTIGE `BrandFoundationView` ───────────────────────
 * Beide Dateien lesen AUSSCHLIESSLICH die Ansicht, die auch das Book rendert
 * (§2.6: „dieselbe wie das Book"). Das ist die Reise-Regel als Export-Regel
 * (§2.12 Nr. 1): `buildBrandFoundation` hat jeden Wert schon durch
 * `isBrandSlotShareable` (= `sessionTravels`) geschickt, bevor er ein Block
 * wurde. Hier gibt es deshalb KEINEN Zugriff auf rohe Slots, keine Map von
 * Slot-Ids und keinen zweiten Filter — was der View nicht zeigt, kann diese
 * Datei nicht schreiben. `a.competitors` („ACME hat Schwäche X") und `a.facts`
 * sind damit nicht „gefiltert", sondern schlicht nicht vorhanden.
 *
 * Ein zweiter Filter DAVOR wäre eine zweite Antwort auf dieselbe Frage — und
 * die eine, die jemand später ändert, ist garantiert nicht die, die noch
 * gelesen wird (dieselbe Begründung wie im Kopf von `foundation.get.ts`).
 *
 * ── WARUM `brand.md` NUR SIEBEN ABSCHNITTE HAT ───────────────────────────
 * §2.6 zählt sie auf: Wer wir sind · Werte · Stimme · Botschaften ·
 * Nomenklatur · Regeln für KI · Visuell. Story, Manifest, Markenarchitektur
 * und das Namens-Kapitel stehen NICHT darin, und das ist kein Vergessen: die
 * Datei ist ein SYSTEM-PROMPT von rund siebzig Zeilen, kein Handbuch. Wer
 * alles will, liest das Book (K4) oder `brand.json` — dort reist JEDES
 * Kapitel der Ansicht mit. Der abgenommene Klickdummy (§3 Screen 1,
 * `demoBrandMd()`) hat genau diese sieben.
 *
 * ── WERTE SIND TEXT, NICHT MARKUP (§2.12 Nr. 6) ──────────────────────────
 * Jeder Wert kommt von einem Menschen. Eine Zeile, die mit `#` beginnt, wäre
 * sonst eine Überschrift in UNSERER Datei — und ein Wert, der „## Regeln für
 * KI" heisst, könnte einem Modell einen Abschnitt unterschieben, den die Marke
 * nie geschrieben hat. `escapeBrandContextMarkdown` setzt deshalb vor jedes
 * Zeilen-Anfangszeichen mit Markdown-Bedeutung einen Rückstrich.
 *
 * ── `brand.json` TRÄGT IDS UND WERTE, KEINE ÜBERSETZUNGEN ────────────────
 * Die Frage, die sich beim Bauen stellte: löst das JSON seine Beschriftungen
 * auf („Ton-Wörter") oder trägt es die Schlüssel (`brand.foundation.label.
 * toneWords`)? Es trägt die SCHLÜSSEL. Die Datei ist maschinenlesbar — sie
 * wird von einem Skript, einem Agenten oder einem Import gelesen, und der
 * braucht einen stabilen Bezeichner, keinen Satz, der sich mit der nächsten
 * Textrunde ändert. Aufgelöste Beschriftungen hätten zusätzlich eine dritte
 * Sprachfrage aufgemacht (Inhaltssprache der Marke, Sprache des Lesers,
 * Sprache der Datei). Wer lesbare Wörter will, nimmt `brand.md`.
 *
 * DIESE DATEI IST PUR: kein H3, kein Appwrite, kein i18n-Modul. Die zwei
 * Sprachen stehen im Code (dieselbe Regel wie in `brandKitLicenses.ts`).
 */

function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

function text(locale: string, de: string, en: string): string {
  return isDe(locale) ? de : en
}

/**
 * DER STAND ALS DATUM — `2026-09-09` aus dem ISO-Stempel, '' ohne Stempel.
 *
 * Dieselbe Regel wie `brandKitStandStamp` in `brandKitFiles.ts`, hier
 * ABSICHTLICH ohne Import: die Registry importiert diesen Renderer (sie hängt
 * ihre Erzeuger hier ein), ein Import zurück wäre ein Zirkel zwischen Karte
 * und Erzeuger. Drei Zeilen sind der kleinere Preis.
 */
function standDate(stand: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(stand.trim())?.[1] ?? ''
}

// ── Markdown aus Werten (§2.12 Nr. 6) ──────────────────────────────────────

/**
 * ZEILENANFÄNGE MIT MARKDOWN-BEDEUTUNG ENTSCHÄRFEN — `#`, `>`, `-`, `*`, `+`,
 * `|` und `1.` / `1)`.
 *
 * Bis zu drei führende Leerzeichen zählen mit, weil Markdown sie ignoriert;
 * ab vier ist die Zeile ohnehin ein Code-Block und keine Überschrift. Der Rest
 * der Zeile bleibt UNANGETASTET: ein Sternchen mitten in einem Satz ist ein
 * Sternchen, und ein Renderer, der jeden Unterstrich escapte, machte aus einer
 * Tagline eine Zeile voller Rückstriche.
 */
export function escapeBrandContextMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/^(\s{0,3})([#>\-*+|]|\d{1,9}[.)])/u, '$1\\$2'))
    .join('\n')
}

/** Ein Wert in EINER Zeile — für Aufzählungen und Tabellen-Zellen. */
function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim()
}

/** Eine Tabellen-Zelle: eine Zeile, und die Rohre der Tabelle bleiben unsere. */
function cell(value: string): string {
  return oneLine(value).replace(/\|/g, '\\|')
}

// ── Die Beschriftungen (Spiegel des Locale-Katalogs) ───────────────────────

/**
 * DIE BESCHRIFTUNGEN DER BLÖCKE — DE/EN IM CODE, und zwar wörtlich wie in
 * `i18n/locales/{de,en}.json` unter `brand.foundation.label`.
 *
 * ── WARUM EINE KOPIE UND NICHT DER KATALOG ───────────────────────────────
 * Der Renderer ist PUR (kein i18n-Modul), und die Datei spricht die
 * INHALTSSPRACHE DER MARKE — nicht die des Lesers. vue-i18n beantwortet immer
 * nur die zweite Frage: `t()` im Browser eines englischen Lesers gäbe „Tone
 * words" in eine Datei, die sonst durchgehend deutsch ist. Die Blöcke tragen
 * deshalb Schlüssel (Kopf von `brandFoundation.ts`), und wer eine DATEI daraus
 * macht, löst sie in der Sprache der Marke auf.
 *
 * ── DIE KOPIE IST BEWACHT ────────────────────────────────────────────────
 * `tests/brandContext.test.ts` prüft, dass JEDER Schlüssel aus
 * `brand.foundation.label` und `.column` hier einen Eintrag hat — beide
 * Sprachen. Ein neuer Block im Book ohne Zeile hier ist damit rot, nicht
 * stillschweigend unbeschriftet.
 */
export const BRAND_CONTEXT_LABELS: Readonly<Record<string, { de: string, en: string }>> = {
  pitch: { de: 'In einem Satz', en: 'In one sentence' },
  category: { de: 'Kategorie', en: 'Category' },
  audience: { de: 'Zielgruppen', en: 'Audiences' },
  purpose: { de: 'Purpose', en: 'Purpose' },
  vision: { de: 'Vision', en: 'Vision' },
  mission: { de: 'Mission', en: 'Mission' },
  positioningCategory: { de: 'Positionierungs-Kategorie', en: 'Positioning category' },
  firstChoice: { de: 'Erste Wahl für', en: 'First choice for' },
  model: { de: 'Architektur-Modell', en: 'Architecture model' },
  namingRule: { de: 'Namensregel', en: 'Naming rule' },
  values: { de: 'Die Werte', en: 'Your values' },
  definitions: { de: 'Definitionen', en: 'Definitions' },
  livedExamples: { de: 'Gelebte Beispiele', en: 'Lived examples' },
  conflictRule: { de: 'Konfliktregel', en: 'Conflict rule' },
  teamFilter: { de: 'Einstellungs-Filter', en: 'Hiring filter' },
  archetype: { de: 'Archetyp', en: 'Archetype' },
  emotion: { de: 'Ziel-Gefühl', en: 'Target feeling' },
  toneWords: { de: 'Ton-Wörter', en: 'Tone words' },
  voiceSamples: { de: 'Stimmproben', en: 'Voice samples' },
  doDont: { de: 'Do & Don\'t', en: 'Do & don\'t' },
  vocabulary: { de: 'Wort-Leitfaden', en: 'Word guide' },
  anchorLine: { de: 'Zeile für die Wand', en: 'Line for the wall' },
  composition: { de: 'Ton, Länge & Verwendung', en: 'Tone, length & use' },
  tagline: { de: 'Tagline', en: 'Tagline' },
  boilerplates: { de: 'Boilerplates', en: 'Boilerplates' },
  keyMessages: { de: 'Kernbotschaften', en: 'Key messages' },
  distinctiveAsset: { de: 'Verbales Erkennungszeichen', en: 'Verbal signature' },
  nameDecision: { de: 'Top drei', en: 'Top three' },
  nameChecks: { de: 'Verfügbarkeits-Check', en: 'Availability check' },
  nameCriteria: { de: 'Acht Kriterien', en: 'Eight criteria' },

  // ── Schicht 3 (Paket K4, §2.5) ───────────────────────────────────────────
  nameTypes: { de: 'Produkttypen', en: 'Product types' },
  namePatterns: { de: 'Muster je Produkttyp', en: 'Pattern per product type' },
  nameRules: { de: 'Namens-Regeln', en: 'Naming rules' },
  markKind: { de: 'Zeichenart', en: 'Kind of mark' },
  markBrief: { de: 'Briefing', en: 'Brief' },
  markClearSpace: { de: 'Schutzraum', en: 'Clear space' },
  markMinSizes: { de: 'Mindestgrößen', en: 'Minimum sizes' },
  markVariants: { de: 'Varianten', en: 'Variants' },
  markDonts: { de: 'Don\'ts', en: 'Don\'ts' },
  colorRolesLight: { de: 'Rollen im hellen Modus', en: 'Roles in light mode' },
  colorRolesDark: { de: 'Rollen im dunklen Modus', en: 'Roles in dark mode' },
  accentLift: { de: 'Akzent im dunklen Modus', en: 'Accent in dark mode' },
  contrastPairs: { de: 'Kontrast-Paare mit Urteil', en: 'Contrast pairs with verdict' },
  colorRules: { de: 'Farb-Regeln', en: 'Colour rules' },
  typePair: { de: 'Schriftpaar', en: 'Font pair' },
  typeScale: { de: 'Größen-Skala', en: 'Size scale' },
  typeRules: { de: 'Schrift-Regeln', en: 'Type rules' },
  typeLicense: { de: 'Lizenz', en: 'Licence' },
  pressFacts: { de: 'Freigegebene Fakten', en: 'Released facts' },
  pressContact: { de: 'Presse-Kontakt', en: 'Press contact' },
  pressMark: { de: 'Zeichen', en: 'Mark' },
  aiScope: { de: 'Was KI erzeugen darf', en: 'What AI may produce' },
  aiReview: { de: 'Freigabe-Regel', en: 'Review rule' },
  aiGuardrails: { de: 'Leitplanken', en: 'Guardrails' },
  aiPrompt: { de: 'Vorlage', en: 'Template' },
}

export const BRAND_CONTEXT_COLUMNS: Readonly<Record<string, { de: string, en: string }>> = {
  name: { de: 'Name', en: 'Name' },
  note: { de: 'Notiz', en: 'Note' },
  rank: { de: 'Rang', en: 'Rank' },
  check: { de: 'Prüfung', en: 'Check' },
  criteria: { de: 'Kriterium', en: 'Criterion' },

  // ── Schicht 3 (Paket K4, §2.5) ───────────────────────────────────────────
  nameType: { de: 'Typ', en: 'Type' },
  pattern: { de: 'Muster', en: 'Pattern' },
  example: { de: 'Beispiel', en: 'Example' },
  // K5: die HERKUNFT eines Musters bekommt eine eigene Spalte — Beispiel
  // und Begründung in einer Zelle kann man weder überfliegen noch trennen.
  source: { de: 'Herkunft', en: 'Source' },
  usage: { de: 'Verwendung', en: 'Use' },
  minSize: { de: 'Mindestgröße', en: 'Minimum size' },
  role: { de: 'Rolle', en: 'Role' },
  hex: { de: 'Hex', en: 'Hex' },
  contrast: { de: 'Kontrast', en: 'Contrast' },
  accent: { de: 'Akzent', en: 'Accent' },
  ground: { de: 'Grund', en: 'Ground' },
  pair: { de: 'Paar', en: 'Pair' },
  ratio: { de: 'Verhältnis', en: 'Ratio' },
  verdict: { de: 'Urteil', en: 'Verdict' },
  step: { de: 'Stufe', en: 'Step' },
  size: { de: 'Größe', en: 'Size' },
  lineHeight: { de: 'Zeilenhöhe', en: 'Line height' },
  weight: { de: 'Gewicht', en: 'Weight' },
  font: { de: 'Schrift', en: 'Font' },
}

/** Der Name hinter dem letzten Punkt — `brand.foundation.label.pitch` ⇒ `pitch`. */
function keyTail(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1)
}

/**
 * Beschriftung eines Schlüssels — '' wenn wir sie nicht kennen. Der Aufrufer
 * schreibt dann den Wert OHNE Beschriftung: ein Block ohne Etikett ist
 * lesbar, ein Block mit einem rohen `brand.foundation.label.xy` davor nicht
 * (die Falle aus CLAUDE.md, „ein Schlüssel in einer Config ist ein
 * Versprechen" — nur dass sie hier nicht in der Oberfläche landet).
 */
function labelOf(key: string | undefined, locale: string, table = BRAND_CONTEXT_LABELS): string {
  if (!key) return ''
  const entry = table[keyTail(key)]
  return entry ? text(locale, entry.de, entry.en) : ''
}

// ── Ein Block als Markdown ─────────────────────────────────────────────────

/** `**Etikett:** Wert` — ohne Etikett bleibt der Wert für sich. */
function labelled(label: string, value: string): string {
  return label ? `**${label}:** ${value}` : value
}

/**
 * DIE ZEILEN EINES BLOCKS.
 *
 * Die vier Block-Arten des Kapitels 10 (`locked`, `direction`, `swatches`,
 * `design`) stehen NICHT hier: das Visuelle ist Abschnitt 8 und wird aus dem
 * PRESET geschrieben, nicht aus Blöcken (§2.6 Nr. 8). Ein `default`-Zweig
 * fängt sie ab, statt sie halb zu rendern.
 */
function blockMarkdown(block: BrandFoundationBlock, locale: string): string[] {
  const label = 'labelKey' in block ? labelOf(block.labelKey, locale) : ''
  switch (block.kind) {
    case 'lead':
    case 'text':
      return [labelled(label, escapeBrandContextMarkdown(block.text))]
    case 'list':
      return [
        ...(label ? [`**${label}:**`] : []),
        ...block.items.map(item => `- ${escapeBrandContextMarkdown(oneLine(item))}`),
      ]
    case 'cards':
      return [
        ...(label ? [`**${label}:**`] : []),
        ...block.items.map((item) => {
          const title = escapeBrandContextMarkdown(oneLine(item.title))
          const body = oneLine(item.text)
          const note = item.note
            ? ` _${text(locale, 'Gelebt', 'In practice')}:_ ${oneLine(item.note)}`
            : ''
          return `- **${title}**${body ? ` — ${body}` : ''}${note}`
        }),
      ]
    case 'chips':
      return [
        ...(label ? [`**${label}:**`] : []),
        ...block.items.map((item) => {
          const word = escapeBrandContextMarkdown(oneLine(item.word))
          // Eine leere Stimmprobe bleibt leer — erfunden wird hier nichts
          // (Kopf der Block-Art in `brandFoundation.ts`).
          return item.sample ? `- ${word} — „${oneLine(item.sample)}"` : `- ${word}`
        }),
      ]
    case 'dodont': {
      const use = block.pairs.map(pair => pair.doText).filter(Boolean)
      const avoid = block.pairs.map(pair => pair.dontText).filter(Boolean)
      return [
        ...(label ? [`**${label}:**`] : []),
        ...(use.length ? [`- ${text(locale, 'Benutzen', 'Use')}: ${use.map(oneLine).join(' · ')}`] : []),
        ...(avoid.length ? [`- ${text(locale, 'Meiden', 'Avoid')}: ${avoid.map(oneLine).join(' · ')}`] : []),
      ]
    }
    case 'table': {
      const heads = block.columnKeys.map(key => labelOf(key, locale, BRAND_CONTEXT_COLUMNS) || ' ')
      return [
        ...(label ? [`**${label}:**`] : []),
        `| ${heads.join(' | ')} |`,
        `| ${heads.map(() => '---').join(' | ')} |`,
        ...block.rows.map(row => `| ${row.map(cell).join(' | ')} |`),
      ]
    }
    case 'choice': {
      // Gespeichert ist die Id (`sage`), lesbar ist der Name — aufgelöst in
      // der INHALTSSPRACHE der Marke, weil die Datei in ihr geschrieben ist.
      const names = block.optionIds.map(id => brandChoiceDisplayLabel(block.slotId, id, locale))
      return [labelled(label, escapeBrandContextMarkdown(names.join(' · ')))]
    }
    case 'rules': {
      /* Der Rahmen und die Überschrift der MARKE stehen hintereinander
       * („Leitplanken · Ton") — dieselbe Form wie im Klickdummy. */
      const head = [label, block.label].filter(Boolean).join(' · ')
      return [
        ...(head ? [`**${head}:**`] : []),
        ...block.items.flatMap((item, index) => [
          `${index + 1}. ${escapeBrandContextMarkdown(oneLine(item.text))}`,
          ...(item.dont
            ? [`   ${text(locale, 'Nicht', 'Not')}: ${escapeBrandContextMarkdown(oneLine(item.dont))}`]
            : []),
        ]),
      ]
    }
    case 'prompt':
      /* Die Vorlage steht als CODE-BLOCK: sie wird kopiert, nicht gelesen —
       * und ihre Zeilenumbrüche sind Teil des Prompts. Ein escapetes Zitat
       * hätte hier den umgekehrten Effekt: der Empfänger übernähme die
       * Rückstriche in sein KI-Werkzeug. */
      return [
        `**${[label, oneLine(block.title)].filter(Boolean).join(' · ')}:**`,
        '',
        '```text',
        block.text.replace(/\r\n/g, '\n').replace(/```/g, "'''").trimEnd(),
        '```',
      ]
    case 'contact':
      return [labelled(
        text(locale, 'Presse-Kontakt', 'Press contact'),
        escapeBrandContextMarkdown([block.name, block.role, block.email].filter(Boolean).join(' · ')),
      )]
    case 'aiRules':
      return aiRulesMarkdown(block, locale)
    default:
      return []
  }
}

/** Der Drei-Zeilen-Rahmen (§2.6 Nr. 7) — Ton, Meiden, Steht für. */
function aiRulesMarkdown(
  block: Extract<BrandFoundationBlock, { kind: 'aiRules' }>,
  locale: string,
): string[] {
  const line = (de: string, en: string, items: readonly string[]): string[] =>
    (items.length
      ? [`- **${text(locale, de, en)}:** ${items.map(item => oneLine(item)).join(' · ')}`]
      : [])
  return [
    ...line('Schreibt in diesem Ton', 'Write in this tone', block.tone),
    ...line('Vermeidet', 'Avoid', block.avoid),
    ...line('Steht für', 'Stands for', block.stands),
  ]
}

/** Die Zeilen aller Blöcke eines Kapitels, durch Leerzeilen getrennt. */
function chapterMarkdown(chapter: BrandFoundationChapter | undefined, locale: string): string[] {
  if (!chapter) return []
  const parts: string[] = []
  for (const block of chapter.blocks) {
    const lines = blockMarkdown(block, locale)
    if (lines.length === 0) continue
    if (parts.length > 0) parts.push('')
    parts.push(...lines)
  }
  return parts
}

// ── Die Abschnitte (§2.6 Nr. 2–6) ──────────────────────────────────────────

/**
 * WELCHE KAPITEL DER ANSICHT WELCHEN ABSCHNITT FÜLLEN.
 *
 * GEPFLEGT, nicht gerechnet — dieselbe Begründung wie bei
 * `BRAND_FOUNDATION_SOURCE_STEPS`: eine Ableitung aus Kapitel-Ids wäre eine
 * zweite Wahrheit, die beim ersten neuen Anker still veraltet. Ein Abschnitt
 * ohne einen einzigen Block entfällt OHNE LÜCKE (wie ein Kapitel im Book).
 */
const CONTEXT_SECTIONS: readonly {
  de: string
  en: string
  chapters: readonly BrandFoundationChapterId[]
}[] = [
  { de: 'Wer wir sind', en: 'Who we are', chapters: ['kontext', 'purpose', 'positionierung'] },
  { de: 'Werte', en: 'Values', chapters: ['werte'] },
  { de: 'Stimme', en: 'Voice', chapters: ['stimme'] },
  { de: 'Botschaften', en: 'Messaging', chapters: ['messaging'] },
  // Nur auf dem B2-Weg vorhanden (§2.20 Nr. 4) — sonst gibt es das Kapitel
  // nicht und der Abschnitt entfällt.
  { de: 'Nomenklatur', en: 'Nomenclature', chapters: ['nomenklatur'] },
]

/** Das Kapitel dieser Id — `undefined`, wenn die Ansicht es nicht hat. */
function chapterOf(
  view: BrandFoundationView,
  id: BrandFoundationChapterId,
): BrandFoundationChapter | undefined {
  return view.chapters.find(chapter => chapter.id === id)
}

// ── Abschnitt 8: Visuell in einem Absatz ───────────────────────────────────

/**
 * DAS VISUELLE IN WORTEN (§2.6 Nr. 8) — nur mit Preset, sonst entfällt der
 * Abschnitt und NICHTS SONST ändert sich.
 *
 * Er ist ein ABSATZ und keine Tabelle: `brand.md` ist ein System-Prompt, und
 * ein Modell braucht die Farbwelt als Satz („Basisfarbe … Rollen …"), nicht
 * als Token-Baum. Die maschinenlesbare Fassung steht in `tokens.json`, und die
 * letzte Zeile sagt das auch — sonst rechnete jemand aus diesem Absatz eine
 * zweite Wahrheit über die Farben.
 *
 * Hell und Dunkel stehen NICHT beide hier: die Rollen des Presets sind EINE
 * Liste mit aufgelöstem Hex (`BrandColorRole`), die Modi entstehen erst in
 * `buildBrandTokens` (K2). Sie hier nachzurechnen wäre die zweite Stelle, an
 * der dieselbe Farbe gerechnet wird.
 */
function visualMarkdown(preset: BrandDesignSnapshotPreset, locale: string): string[] {
  const roles = preset.color.roles
    .map(role => `${role.id} ${role.hex}`)
    .join(', ')
  const pair = brandFontPair(preset.type.pair)
  const principles = preset.imagery.principles.map(oneLine).filter(Boolean)
  const base = preset.motion.transitions[0]

  const lines: string[] = []
  lines.push(text(
    locale,
    `Basisfarbe ${preset.color.base}, Akzent ${preset.color.accent}.`
    + (roles ? ` Rollen: ${roles}.` : ''),
    `Base colour ${preset.color.base}, accent ${preset.color.accent}.`
    + (roles ? ` Roles: ${roles}.` : ''),
  ))
  if (pair) {
    lines.push('')
    lines.push(text(
      locale,
      `Schriftpaar: ${pair.headingFamily} für Überschriften, ${pair.bodyFamily} für Fließtext.`,
      `Font pair: ${pair.headingFamily} for headings, ${pair.bodyFamily} for body copy.`,
    ))
  }
  if (principles.length > 0) {
    lines.push('')
    lines.push(text(
      locale,
      `Bildsprache: ${escapeBrandContextMarkdown(principles.join(' · '))}`,
      `Imagery: ${escapeBrandContextMarkdown(principles.join(' · '))}`,
    ))
  }
  if (base) {
    lines.push('')
    lines.push(text(
      locale,
      `Bewegung: Tempo ${preset.motion.tempo}, Grunddauer ${base.durationMs} ms, ${base.easing}.`,
      `Motion: tempo ${preset.motion.tempo}, base duration ${base.durationMs} ms, ${base.easing}.`,
    ))
  }
  lines.push('')
  lines.push(text(
    locale,
    'Alle Werte maschinenlesbar in `tokens.json` (DTCG 2025.10) und `tokens.css`.',
    'All values machine-readable in `tokens.json` (DTCG 2025.10) and `tokens.css`.',
  ))
  return lines
}

// ── `brand.md` ─────────────────────────────────────────────────────────────

/**
 * `brand.md` — DER BRAND CONTEXT ALS SYSTEM-PROMPT (§2.6 Aufbau 1–8).
 *
 * Der Kopf sagt in drei Zeilen, was die Datei ist, von wann sie ist und wozu
 * sie taugt. Danach die Abschnitte in der Reihenfolge des Konzepts; jeder, der
 * keinen Inhalt hat, entfällt.
 */
export function renderBrandContextMarkdown(
  view: BrandFoundationView,
  input: BrandContextInput,
  preset: BrandDesignSnapshotPreset | null,
): string {
  const { locale } = input
  const lines: string[] = []

  // ── 1. Kopf ──────────────────────────────────────────────────────────────
  lines.push(`# ${escapeBrandContextMarkdown(oneLine(input.title)) || 'Brand'}`)
  lines.push('')
  const stand = standDate(input.stand)
  lines.push([
    text(locale, '> Brand Context aus branding.supply', '> Brand context from branding.supply'),
    ...(stand ? [text(locale, `Stand ${stand}`, `as of ${stand}`)] : []),
    text(locale, `Inhaltssprache ${locale}`, `content language ${locale}`),
  ].join(' · '))
  lines.push('>')
  lines.push(text(
    locale,
    '> Diese Datei ist als System-Prompt einsetzbar: gib sie einem KI-Werkzeug, '
    + 'bevor du es für diese Marke schreiben lässt.',
    '> Use this file as a system prompt: give it to an AI tool before you let it '
    + 'write for this brand.',
  ))

  const section = (title: string, body: readonly string[]): void => {
    if (body.length === 0) return
    lines.push('')
    lines.push(`## ${title}`)
    lines.push('')
    lines.push(...body)
  }

  // ── 2.–6. Die Abschnitte aus den Kapiteln ────────────────────────────────
  for (const entry of CONTEXT_SECTIONS) {
    const body: string[] = []
    for (const id of entry.chapters) {
      const part = chapterMarkdown(chapterOf(view, id), locale)
      if (part.length === 0) continue
      if (body.length > 0) body.push('')
      body.push(...part)
    }
    section(text(locale, entry.de, entry.en), body)
  }

  // ── 7. Regeln für KI ─────────────────────────────────────────────────────
  /*
   * ZWEI FÄLLE, EINE ÜBERSCHRIFT (§2.6 Nr. 7): trägt das Kapitel `ki-texte`
   * eigene Guidelines-Blöcke (Nikas Kapitel `aiguide`, K4/K5), stehen DIESE
   * da; sonst der Drei-Zeilen-Rahmen aus Ton, Tabu und Werten. Heute gibt es
   * nur den Rahmen — die Weiche steht trotzdem schon, weil sie sonst in dem
   * Paket entstünde, das zufällig als erstes einen Block dafür schreibt.
   */
  const ai = chapterOf(view, 'ki-texte')
  const guidelines = (ai?.blocks ?? []).filter(block => block.kind !== 'aiRules')
  const aiBody = guidelines.length > 0
    ? chapterMarkdown({ ...ai!, blocks: guidelines }, locale)
    : chapterMarkdown(ai, locale)
  section(text(locale, 'Regeln für KI', 'Rules for AI'), aiBody)

  // ── 8. Visuell ───────────────────────────────────────────────────────────
  if (preset) section(text(locale, 'Visuell', 'Visual'), visualMarkdown(preset, locale))

  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * DIE KURZFORM VON `brand.md` — der System-Prompt der Vorlagen-Session
 * (`n.prompts`, Konzept §2.3, Paket K5).
 *
 * ── SIE IST EINE AUSWAHL, KEINE ZWEITE FASSUNG ───────────────────────────
 * Die Session-Qualität sagt es wörtlich: „The system prompt is the short form
 * of brand.md, in the same words." Deshalb baut diese Funktion NICHTS neu —
 * sie geht durch DIESELBEN Kapitel-Renderer (`chapterMarkdown`) und nimmt
 * weniger davon. Eine eigene Formulierung wäre die zweite Fassung derselben
 * Sätze, und die eine, die jemand später anfasst, ist garantiert nicht die,
 * die der Kunde kopiert hat.
 *
 * ── VIER KAPITEL, UND WARUM GERADE DIESE ─────────────────────────────────
 * Ein System-Prompt beantwortet einem Modell vier Fragen, bevor es schreibt:
 * WER ist die Marke (`kontext`), WOZU gibt es sie (`purpose`), WIE klingt sie
 * (`stimme`) und WAS darf sie nicht (`ki-texte`). Werte, Botschaften,
 * Nomenklatur und das Visuelle stehen in `brand.md` und im Handbuch — hier
 * wären sie Ballast in einem Text, den jemand in ein Chat-Fenster klebt.
 *
 * ── OHNE ÜBERSCHRIFTEN UND OHNE LEERZEILEN ───────────────────────────────
 * Der Wert von `n.prompts` ist ein `structured`-Block, und eine LEERZEILE
 * darin wäre im Speicher ein Blockwechsel (s. `formatBrandPromptTemplates`).
 * Die Kurzform ist deshalb eine Folge von Zeilen, keine Datei mit Abschnitten.
 */
export function renderBrandContextSystemPrompt(
  view: BrandFoundationView,
  input: BrandContextInput,
): string {
  const { locale } = input
  const title = oneLine(input.title)
  const lines: string[] = []

  lines.push(text(
    locale,
    `Du schreibst als ${title || 'diese Marke'}. Halte dich an das, was hier steht.`,
    `You write as ${title || 'this brand'}. Stay within what is written here.`,
  ))

  for (const id of SYSTEM_PROMPT_CHAPTERS) {
    for (const line of chapterMarkdown(chapterOf(view, id), locale)) {
      const clean = line.trim()
      if (clean.length > 0) lines.push(clean)
    }
  }

  lines.push(text(
    locale,
    'Erfinde nichts, was hier nicht steht — keine Zahlen, keine Herkünfte, keine Preise.',
    'Invent nothing that is not written here — no numbers, no origins, no prices.',
  ))

  return lines.join('\n')
}

/** Die vier Kapitel der Kurzform — gepflegt, nicht gerechnet (s. o.). */
const SYSTEM_PROMPT_CHAPTERS: readonly BrandFoundationChapterId[] = [
  'kontext',
  'purpose',
  'stimme',
  'ki-texte',
]

// ── `brand.json` ───────────────────────────────────────────────────────────

/**
 * DIE KAPITEL, DIE IM JSON EINEN EIGENEN PLATZ HABEN — sie stehen NICHT
 * zusätzlich in `foundation.chapters`.
 *
 * `story` ist ein Feld (§2.6), `visuell` reist als `design` (das Preset ist
 * die Wahrheit, seine Blöcke wären ein zweites Abbild davon), und die drei
 * Schicht-3-Kapitel haben ihre eigenen Schlüssel, weil ein Leser sie einzeln
 * sucht (`nomenclature`, `aiGuidelines`, `presskit`).
 *
 * SEIT K4 STEHEN DIE DREI ANWENDUNGS-KAPITEL AUCH HIER — und zwar OHNE eigenen
 * Schlüssel, sie fallen also ganz heraus. Derselbe Grund wie bei `visuell`:
 * Rollen-Tabellen, Kontrast-Urteile und die Größen-Leiter sind GERECHNET aus
 * dem Preset, das in dieser Datei schon vollständig steht (`design`). Ein
 * zweites Abbild daneben wären dieselben Hex-Werte ein zweites Mal — und die
 * eine Fassung, die jemand später anfasst, ist garantiert nicht die, die ein
 * Skript liest. Wer die Regeln als TEXT will, liest das Book (§2.5) oder
 * `tokens.json`.
 */
const JSON_OWN_KEYS: readonly BrandFoundationChapterId[] = [
  'story',
  'visuell',
  'zeichen-anwendung',
  'farbe-anwendung',
  'typografie-anwendung',
  'nomenklatur',
  'ki-texte',
  'pressekit',
]

/**
 * EIN BLOCK ALS DATEN. Die vier Arten des Kapitels 10 fallen heraus — sie
 * tragen Hex-Werte und SVG-Setzungen, und die stehen im `design`-Zweig, nicht
 * zweimal.
 */
function jsonBlock(block: BrandFoundationBlock): BrandContextJsonBlock | null {
  switch (block.kind) {
    case 'lead':
    case 'text':
      return { kind: block.kind, ...(block.labelKey ? { labelKey: block.labelKey } : {}), text: block.text }
    case 'list':
      return { kind: 'list', ...(block.labelKey ? { labelKey: block.labelKey } : {}), items: [...block.items] }
    case 'cards':
      return {
        kind: 'cards',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        items: block.items.map(item => ({
          title: item.title,
          text: item.text,
          ...(item.note ? { note: item.note } : {}),
        })),
      }
    case 'chips':
      return {
        kind: 'chips',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        items: block.items.map(item => ({ word: item.word, sample: item.sample })),
      }
    case 'dodont':
      return {
        kind: 'dodont',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        pairs: block.pairs.map(pair => ({ doText: pair.doText, dontText: pair.dontText })),
      }
    case 'table':
      return {
        kind: 'table',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        columnKeys: [...block.columnKeys],
        rows: block.rows.map(row => [...row]),
      }
    case 'choice':
      return {
        kind: 'choice',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        slotId: block.slotId,
        optionIds: [...block.optionIds],
      }
    case 'rules':
      return {
        kind: 'rules',
        ...(block.labelKey ? { labelKey: block.labelKey } : {}),
        ...(block.label ? { label: block.label } : {}),
        items: block.items.map(item => ({ text: item.text, ...(item.dont ? { dont: item.dont } : {}) })),
      }
    case 'prompt':
      return { kind: 'prompt', labelKey: block.labelKey, title: block.title, text: block.text }
    case 'contact':
      return { kind: 'contact', name: block.name, role: block.role, email: block.email }
    case 'aiRules':
      return {
        kind: 'aiRules',
        tone: [...block.tone],
        avoid: [...block.avoid],
        stands: [...block.stands],
      }
    default:
      return null
  }
}

function jsonChapter(chapter: BrandFoundationChapter): BrandContextJsonChapter {
  return {
    id: chapter.id,
    anchor: chapter.anchor,
    titleKey: chapter.titleKey,
    blocks: chapter.blocks
      .map(jsonBlock)
      .filter((block): block is BrandContextJsonBlock => block !== null),
  }
}

/** Die Story als Text — ihre Absätze stehen in der Ansicht als Blöcke. */
function storyText(view: BrandFoundationView): string {
  const chapter = chapterOf(view, 'story')
  if (!chapter) return ''
  return chapter.blocks
    .map(block => (block.kind === 'lead' || block.kind === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * `brand.json` — DIESELBEN QUELLEN, MASCHINENLESBAR (§2.6).
 *
 * `design` ist das SNAPSHOT-Preset: `BrandDesignSnapshotPreset` lässt
 * `mark.keptDrafts` nicht zu (`Omit`), die behaltenen KI-Entwürfe können hier
 * also nicht mitreisen — der TYP erzwingt es, kein Filter (§1.11 b).
 */
export function buildBrandContextJson(
  view: BrandFoundationView,
  input: BrandContextInput,
  preset: BrandDesignSnapshotPreset | null,
): BrandContextJson {
  const own = (id: BrandFoundationChapterId): BrandContextJsonChapter | undefined => {
    const chapter = chapterOf(view, id)
    if (!chapter) return undefined
    const mapped = jsonChapter(chapter)
    return mapped.blocks.length > 0 ? mapped : undefined
  }

  const nomenclature = own('nomenklatur')
  const aiGuidelines = own('ki-texte')
  const presskit = own('pressekit')

  return {
    schemaVersion: 1,
    brand: {
      title: input.title,
      locale: input.locale,
      stand: standDate(input.stand),
    },
    foundation: {
      story: storyText(view),
      chapters: view.chapters
        .filter(chapter => !JSON_OWN_KEYS.includes(chapter.id))
        .map(jsonChapter)
        .filter(chapter => chapter.blocks.length > 0),
    },
    ...(nomenclature ? { nomenclature } : {}),
    ...(aiGuidelines ? { aiGuidelines } : {}),
    ...(presskit ? { presskit } : {}),
    design: preset,
  }
}

/**
 * `brand.json` ALS TEXT — zwei Leerzeichen Einrückung, ein Zeilenende am Schluss.
 *
 * STABIL heisst hier: aus derselben Ansicht kommt Zeichen für Zeichen dieselbe
 * Datei. Die Reihenfolge der Schlüssel ist die des BAUENS und wird bewusst
 * NICHT alphabetisch sortiert — sie ist eine Aussage (Kapitel in Lese-Reihenfolge,
 * `brand` vor `foundation`), und ein `sort()` machte aus dem Preset eine
 * Streuung, in der `accent` vor `base` steht und niemand mehr etwas findet.
 */
export function renderBrandContextJson(json: BrandContextJson): string {
  return `${JSON.stringify(json, null, 2)}\n`
}
