/**
 * DER BELEG-RIEGEL — steht das Zitat WÖRTLICH im Text seiner Quelle?
 *
 * ── WARUM IM FUNDAMENT UND NICHT IM PRODUKT (BI1 I1a) ─────────────────────
 * Die Regel entstand im Marktvergleich (`market`, Plan §2.2) und wurde dort
 * gebraucht, weil ein Modell über seine eigene Ausgabe nicht entscheiden darf.
 * Brand Insights (`insights`) stellt dieselbe Frage an eine redaktionelle
 * Quelle, und ein Produkt-Layer importiert keinen anderen (CONCEPT.md A14).
 * Es blieben drei Wege: abschreiben (zwei Riegel driften, und der schwächere
 * gewinnt), hereinreichen (jeder Aufrufer baut ihn neu und darf ihn vergessen)
 * — oder das, was hier steht: EINE Regel im Fundament.
 *
 * ── WAS HIER NICHT STEHEN DARF ────────────────────────────────────────────
 * Kein Produktwissen. Diese Datei kennt keine Marktfelder, keine Slot-Ids und
 * keinen Beitrags-Zustand — sie kennt ein Zitat und einen Text. Wer sie um ein
 * `fieldId` erweitert, hat ein Produkt ins Fundament geholt.
 */

/**
 * DIE ZITATSCHRANKE (§ 51 UrhG) — dieselbe Zahl für jede Stelle, an der ein
 * fremder Text wörtlich übernommen wird.
 *
 * Sie steht hier und nicht je Produkt: zwei verschiedene Zahlen für dieselbe
 * Rechtsfrage sind eine Einladung, die kleinere zu vergessen. `market` und
 * `insights` leiten ihre eigenen Konstanten daraus ab (`MARKET_EVIDENCE_MAX`,
 * `INSIGHTS_QUOTE_MAX`), damit die Produktsprache erhalten bleibt, ohne dass
 * die Zahl zweimal dasteht.
 */
export const EVIDENCE_QUOTE_MAX = 200

/**
 * DIE NORMALISIERUNG FÜR DEN VERGLEICH: Weissraum wird zusammengezogen,
 * typografische Anführungszeichen und Bindestriche werden auf ihre einfache
 * Form gebracht.
 *
 * ── WARUM SO WENIG UND NICHT MEHR ─────────────────────────────────────────
 * GROSS-/KLEINSCHREIBUNG BLEIBT: ein Zitat, das die Schreibweise ändert, ist
 * kein Zitat mehr. Wer hier zusätzlich kleinschreibt, lässt „WIR RÖSTEN
 * SELBST" als Beleg für „wir rösten selbst" durchgehen — und ab da ist die
 * Zitatschranke eine Erzählung.
 *
 * Weissraum MUSS dagegen weg: die Text-Extraktion zieht Zeilenumbrüche und
 * Einrückungen des Quelltexts zusammen, ein Modell gibt sie anders zurück, und
 * an dieser Kleinigkeit stürbe sonst jeder ehrliche Beleg.
 *
 * Typografische Zeichen ebenso: „" ' ' – — sind dieselben Zeichen wie " ' -,
 * nur hübscher gesetzt; ein Modell tippt sie regelmässig anders als die Seite.
 */
export function normalizeEvidenceText(value: string): string {
  return value
    .replace(/[‘’‚‛]/g, '\'')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    // Geschütztes Leerzeichen als ESCAPE geschrieben: als Zeichen ist es im
    // Quelltext unsichtbar, und ESLint verbietet es zu Recht.
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface EvidenceCheckInput {
  /** Das Zitat, so wie es behauptet wird (Modell-Ausgabe oder Formular). */
  readonly quote: string
  /** Der Text GENAU DER Quelle, die als Beleg genannt ist. */
  readonly pageText: string
}

/**
 * STEHT DAS ZITAT WIRKLICH DA?
 *
 * Der Riegel ist absichtlich stumpf: Zeichenkette in Zeichenkette, nach der
 * Normalisierung oben. Kein Fuzzy-Vergleich, keine Ähnlichkeit, keine
 * „ungefähre" Übereinstimmung — ein Beleg, der nur ungefähr dasteht, ist
 * erfunden, und die Zitatschranke schützt uns nur, solange wir wörtlich
 * zitieren.
 *
 * LEER ⇒ NEIN: ein Feld ohne Zitat hat keinen Beleg, und ein Feld ohne Beleg
 * gibt es nicht.
 */
export function evidenceIsGrounded(input: EvidenceCheckInput): boolean {
  const quote = normalizeEvidenceText(input.quote)
  if (!quote || quote.length > EVIDENCE_QUOTE_MAX) return false
  return normalizeEvidenceText(input.pageText).includes(quote)
}
