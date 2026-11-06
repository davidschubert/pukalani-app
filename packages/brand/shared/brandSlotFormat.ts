import type { BrandSlotSchemaKind } from './slotRegistry'

/**
 * DIE ÄUSSERE FORM EINES SLOT-WERTES — eine Beschreibung, zwei Leser.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * Ein Slot der Art `list` oder `structured` ist im Speicher trotzdem TEXT
 * (`brand_steps.slots` ist JSON aus Zeichenketten, Schema-Anhang §2). Wie
 * dieser Text aussieht, wussten bis P2.2 ZWEI Stellen unabhängig voneinander:
 * der Entwicklungs-Ersatz, der ihn erzeugt, und — ab jetzt — die
 * Prompt-Instruktion, die das Sprachmodell darauf verpflichtet. Zwei Quellen
 * für dieselbe Form heisst: sie laufen auseinander, sobald eine von beiden
 * angefasst wird, und die Werkstatt zeigt danach für den Stub etwas anderes
 * als für George. Deshalb steht die Form GENAU HIER, und beide Seiten lesen
 * sie: `brandSlotFormatRule()` geht wörtlich in den Prompt,
 * `brandSlotFormatExample()` wörtlich in den Prompt UND in den Stub-Text.
 *
 * ── DIE PRÜFUNG IST TEIL DES VERTRAGS ─────────────────────────────────────
 * `brandSlotValueMatchesFormat()` ist keine Validierung für die Route (die
 * klemmt nur auf `maxLength` — ein formfremder Entwurf ist kein Grund, dem
 * Menschen seinen Text wegzunehmen). Sie existiert, damit ein TEST beweisen
 * kann, dass Regel und Beispiel dasselbe sagen: ein Beispiel, das die eigene
 * Regel verletzt, ist die teuerste Art, ein Modell zu verwirren.
 *
 * ── WAS HIER BEWUSST NICHT STEHT ──────────────────────────────────────────
 * Die INNERE Form eines Eintrags (bei `a.competitors`: „Name — stark · schwach")
 * gehört zum SLOT, nicht zur Art — sie steht in seiner Instruktion in
 * `server/utils/georgePrompt.ts`. Hier steht nur, was für JEDE Liste bzw.
 * JEDEN strukturierten Wert gilt.
 *
 * Die Regeln sind ENGLISCH, weil sie in den Prompt gehen (sprachneutraler
 * Kern, Content-Spec §1.2); das Beispiel ist bewusst sprachlos (Platzhalter in
 * spitzen Klammern), damit es in beiden Inhaltssprachen taugt.
 */

/** Wie eine `list` aussieht — eine Zeile je Eintrag, nichts drumherum. */
export const BRAND_LIST_FORMAT_RULE
  = 'Format: one entry per line. Every line starts with "- ". '
    + 'No numbering, no blank lines, no heading, no text before or after the list.'

/** Wie ein `structured` Wert aussieht — beschriftete Blöcke. */
export const BRAND_STRUCTURED_FORMAT_RULE
  = 'Format: labelled blocks. Every block starts with a heading line "## " followed by the label, '
    + 'then one or more plain text lines. Exactly one blank line between blocks. '
    + 'No text before the first heading.'

const LIST_EXAMPLE = [
  '- <entry>',
  '- <entry>',
].join('\n')

const STRUCTURED_EXAMPLE = [
  '## <label>',
  '<one or more plain lines>',
  '',
  '## <label>',
  '<one or more plain lines>',
].join('\n')

/**
 * Die Regel für eine Art — `null` heisst „freier Text": `text` und `richtext`
 * haben keine äussere Form, und eine erfundene wäre eine Fessel für das
 * Manifest.
 */
export function brandSlotFormatRule(kind: BrandSlotSchemaKind): string | null {
  if (kind === 'list') return BRAND_LIST_FORMAT_RULE
  if (kind === 'structured') return BRAND_STRUCTURED_FORMAT_RULE
  return null
}

/** Das Muster zur Regel — dieselbe Zeichenkette in Prompt und Dev-Stub. */
export function brandSlotFormatExample(kind: BrandSlotSchemaKind): string | null {
  if (kind === 'list') return LIST_EXAMPLE
  if (kind === 'structured') return STRUCTURED_EXAMPLE
  return null
}

/**
 * Auf EINE Zeile bringen — Zeilenumbrüche in einem Eintrag würden aus einem
 * Listenpunkt zwei machen und aus einem Block zwei Blöcke.
 */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/**
 * DER SCHREIBER für `list`. Er existiert, damit niemand die Form nachbaut: wer
 * eine Liste erzeugt (heute der Dev-Stub, morgen eine Schema-Reparatur), geht
 * hier durch, und die Regel oben bleibt automatisch wahr.
 */
export function formatBrandSlotList(entries: readonly string[]): string {
  return entries
    .map(entry => oneLine(entry))
    .filter(entry => entry.length > 0)
    .map(entry => `- ${entry}`)
    .join('\n')
}

/** Derselbe Schreiber für `structured` — beschriftete Blöcke. */
export function formatBrandSlotStructured(
  blocks: readonly { label: string, body: string }[],
): string {
  return blocks
    .map(block => ({ label: oneLine(block.label), body: oneLine(block.body) }))
    .filter(block => block.label.length > 0 && block.body.length > 0)
    .map(block => `## ${block.label}\n${block.body}`)
    .join('\n\n')
}

/**
 * DIE LESE-FORM EINES WERTES (Finale Abnahme, §5a Schritt 1: „der bestätigte
 * Wert, VOLLSTÄNDIG, nicht gekürzt").
 *
 * ── WARUM DIE ANSICHT HIER WOHNT UND NICHT IN DER SEITE ──────────────────
 * Die Schreiber stehen schon hier (`formatBrandSlotList`,
 * `formatBrandSlotStructured`). Ein LESER, der die Form woanders nachbaut,
 * ist die zweite Stelle, an der `- ` und `## ` stehen — und die erste, die
 * beim nächsten Format-Schritt vergessen wird.
 *
 * ── FAIL-SOFT IST HIER PFLICHT, NICHT KOMFORT ────────────────────────────
 * Ein Wert kann formfremd sein: das Modell hat sich vertan, ein Mensch hat im
 * Textfeld nachgebessert, ein Bestandswert stammt aus der Zeit vor der Regel.
 * Dann gilt „freier Text", und der Mensch sieht seinen Satz — statt einer
 * leeren Liste, die behauptet, er hätte nichts gesagt.
 */
export type BrandSlotValueView =
  | { kind: 'text', text: string }
  | { kind: 'list', items: string[] }
  | { kind: 'blocks', blocks: { label: string, body: string }[] }

export function brandSlotValueView(
  kind: BrandSlotSchemaKind,
  value: string,
): BrandSlotValueView {
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!brandSlotValueMatchesFormat(kind, text)) return { kind: 'text', text }

  if (kind === 'list') {
    return { kind: 'list', items: text.split('\n').map(line => line.slice(2).trim()) }
  }

  if (kind === 'structured') {
    return {
      kind: 'blocks',
      blocks: text.split(/\n{2,}/).map((block) => {
        const [heading, ...body] = block.split('\n')
        return { label: (heading ?? '').slice(3).trim(), body: body.join('\n').trim() }
      }),
    }
  }

  return { kind: 'text', text }
}

/**
 * Hält dieser Wert die Form seiner Art ein? Arten ohne Regel sind IMMER in
 * Ordnung — sonst hätte „keine Form" plötzlich eine.
 */
export function brandSlotValueMatchesFormat(kind: BrandSlotSchemaKind, value: string): boolean {
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text) return false

  if (kind === 'list') {
    // Keine Leerzeile IRGENDWO: eine Liste mit Absätzen ist im Speicher nicht
    // mehr von zwei Listen zu unterscheiden.
    return text.split('\n').every(line => line.startsWith('- ') && line.trim().length > 2)
  }

  if (kind === 'structured') {
    const blocks = text.split(/\n{2,}/)
    return blocks.length > 0 && blocks.every(block => block.startsWith('## ') && block.trim().length > 3)
  }

  return true
}
