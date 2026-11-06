import type { MarketAiStatement, MarketFieldId, MarketFrequency } from './marketProfile'
import { normalizeEvidenceText } from '../../core/shared/evidenceGrounding'

/**
 * DIE DREI REINEN REGELN DER EXTRAKTION (Plan §2.2, §7.4, §7.5 b) — der
 * BELEG-RIEGEL, die HÄUFIGKEIT und der KONSENS-FILTER.
 *
 * Alle drei haben dasselbe Muster und denselben Grund: sie entscheiden über
 * eine Modell-Ausgabe, und ein Modell darf über seine eigene Ausgabe nicht
 * entscheiden. Sie stehen deshalb im CODE, nicht im Prompt — ein Prompt ist
 * eine Bitte, eine Funktion ist eine Regel.
 */

// ── 1. Der Beleg-Riegel (§2.2, §2.9 Nr. 4) ─────────────────────────────────

/**
 * DER RIEGEL LIEGT SEIT BI1 I1a IM FUNDAMENT (`core/shared/evidenceGrounding`).
 *
 * Brand Insights stellt dieselbe Frage an eine redaktionelle Quelle, und ein
 * Produkt-Layer importiert keinen anderen (CONCEPT.md A14). Hier bleiben nur
 * die MARKT-Namen stehen: jede Aufrufstelle im Layer (`marketExtract.ts`,
 * `marketReportRules.ts`) und jeder Test lesen weiter `normalizeEvidence` und
 * `evidenceIsGrounded` von hier — der Umzug ändert im market-Layer nichts
 * ausser dieser Datei.
 *
 * Die Zitatschranke wandert NICHT mit: `MARKET_EVIDENCE_MAX` in
 * `marketProfile.ts` LEITET SICH jetzt aus `EVIDENCE_QUOTE_MAX` ab, damit
 * dieselbe Rechtsfrage nur eine Zahl hat.
 */
export {
  evidenceIsGrounded,
  normalizeEvidenceText as normalizeEvidence,
} from '../../core/shared/evidenceGrounding'
export type { EvidenceCheckInput } from '../../core/shared/evidenceGrounding'

// ── 2. Die Häufigkeit (§7.4) ───────────────────────────────────────────────

/**
 * WIE LANG EIN KERN MINDESTENS IST, damit die Häufigkeit etwas aussagt.
 *
 * Unter 25 Zeichen zählt man Floskeln: „Qualität" steht auf jeder Seite jeder
 * Marke, und „6 von 6 Seiten" wäre dann eine Aussage über die deutsche
 * Sprache, nicht über die Marke.
 */
export const MARKET_FREQUENCY_CORE_MIN = 25

/**
 * DER KERN EINES ZITATS — die ersten `MARKET_FREQUENCY_CORE_MIN` Zeichen an
 * einer Wortgrenze, oder das ganze Zitat, wenn es kürzer ist.
 *
 * WARUM DER ANFANG UND NICHT DIE MITTE: eine Aussage, die auf mehreren Seiten
 * wiederkehrt, tut das fast immer als derselbe Satzanfang (Claim im Kopf,
 * Slogan im Fuss). Das Ende ist der Teil, den eine Seite kürzt.
 */
export function evidenceCore(quote: string): string {
  const normalized = normalizeEvidenceText(quote)
  if (normalized.length <= MARKET_FREQUENCY_CORE_MIN) return normalized
  const cut = normalized.slice(0, MARKET_FREQUENCY_CORE_MIN)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace >= MARKET_FREQUENCY_CORE_MIN - 10 ? cut.slice(0, lastSpace) : cut
}

/**
 * AUF WIE VIELEN SEITEN STEHT DIESE AUSSAGE?
 *
 * Gezählt wird im CODE über die gespeicherten Seitentexte — NIE vom Modell.
 * Ein Modell, das seine eigene Häufigkeit angibt, gibt eine Zahl an, die
 * niemand prüfen kann; die hier stimmt oder ist ein Fehler in dieser Funktion.
 *
 * `of` ist die Zahl der GELESENEN Seiten, nicht die der Treffer — „auf 2 von
 * 6" ist die Aussage, „2" allein wäre keine.
 */
export function countEvidenceFrequency(
  quote: string,
  pages: ReadonlyMap<string, string>,
): MarketFrequency {
  const of = pages.size
  /**
   * GEMESSEN WIRD DAS GANZE ZITAT, GEZÄHLT WIRD MIT DEM KERN.
   *
   * Die Mindestlänge fragt, ob das ZITAT genug hergibt — nicht, ob der an
   * einer Wortgrenze gekürzte Kern zufällig noch 25 Zeichen hat. Beim ersten
   * Anlauf stand die Prüfung auf dem Kern, und ein 49 Zeichen langer Satz fiel
   * durch, weil sein Kern bei 21 Zeichen endete (Test „zählt über die
   * Seiten"): eine Aussage, die auf zwei Seiten steht, hätte „1 von 3"
   * gemeldet — die Häufigkeits-Angabe wäre für kurze Sätze systematisch
   * falsch gewesen.
   */
  const normalized = normalizeEvidenceText(quote)
  if (normalized.length < MARKET_FREQUENCY_CORE_MIN) {
    // Ein zu kurzes Zitat wird nicht gezählt, sondern als „einmal"
    // ausgewiesen: eine 0 sähe aus wie „steht nirgends", und das wäre falsch —
    // der Beleg steht ja nachweislich auf seiner Seite (Riegel oben).
    return { pages: Math.min(1, of), of }
  }
  const core = evidenceCore(quote)
  if (!core) return { pages: Math.min(1, of), of }
  let hits = 0
  for (const text of pages.values()) {
    if (normalizeEvidenceText(text).includes(core)) hits++
  }
  return { pages: hits, of }
}

// ── 3. Der Konsens-Filter der KI-Aussensicht (§7.5 b) ──────────────────────

/**
 * DIE FELDER, ÜBER DIE DIE AUSSENSICHT ÜBERHAUPT GEFRAGT WIRD (§7.5).
 *
 * Fünf statt zehn, und das ist der Kern der Leitplanke: nach einer Tagline
 * oder einem Markenzeichen zu fragen, hiesse, ein Modell zum Erfinden eines
 * WÖRTLICHEN Satzes einzuladen — und für den gäbe es hier keinen Beleg. Was
 * ein Modell über eine Marke plausibel WEISS, ist ihre Kategorie, ihr
 * Versprechen, ihr Publikum, ihr Grund und ihre Werte.
 */
export const MARKET_AI_VIEW_FIELDS: readonly MarketFieldId[] = [
  'categoryLanguage',
  'pitch',
  'audience',
  'firstChoice',
  'values',
]

/** Ab welcher Ähnlichkeit zwei Antworten „dasselbe" sagen (§7.5 b). */
export const MARKET_AI_CONSENSUS_JACCARD = 0.5

/** Wörter, die in jedem Satz stehen und über die Übereinstimmung nichts sagen. */
const STOP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'für', 'fur', 'von', 'mit', 'auf', 'ist', 'sind', 'im', 'in', 'an', 'zu', 'zum',
  'zur', 'als', 'auch', 'sich', 'wir', 'sie', 'es', 'nicht', 'am', 'bei', 'aus', 'dass',
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'with', 'to', 'in', 'on', 'is', 'are', 'that',
  'it', 'its', 'they', 'we', 'their', 'this', 'as', 'by', 'at', 'from', 'be',
])

/** Ein Satz als Menge bedeutungstragender Wörter, klein und ohne Satzzeichen. */
export function consensusTokens(value: string): Set<string> {
  const tokens = new Set<string>()
  for (const raw of value.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue
    tokens.add(raw)
  }
  return tokens
}

/** Jaccard über die Wortmengen — 1 = identisch, 0 = kein gemeinsames Wort. */
export function tokenJaccard(left: string, right: string): number {
  const a = consensusTokens(left)
  const b = consensusTokens(right)
  if (!a.size && !b.size) return 1
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * SAGEN ZWEI ANTWORTEN DASSELBE?
 *
 * Zwei Wege, und der zweite ist der wichtigere: KURZE Werte („Kaffeerösterei"
 * vs. „Coffee roastery") haben kaum Wörter, an denen ein Jaccard greifen
 * könnte — für sie zählt die normalisierte GLEICHHEIT. Alles Längere geht über
 * die Wortmengen.
 */
export function statementsAgree(left: string, right: string): boolean {
  const a = normalizeEvidenceText(left).toLowerCase().replace(/[.!?]+$/, '')
  const b = normalizeEvidenceText(right).toLowerCase().replace(/[.!?]+$/, '')
  if (!a || !b) return false
  if (a === b) return true
  return tokenJaccard(a, b) >= MARKET_AI_CONSENSUS_JACCARD
}

/** Was EIN Modell zu EINEM Feld gesagt hat. */
export interface MarketAiAnswer {
  readonly model: string
  readonly fieldId: MarketFieldId
  readonly value: string
}

/**
 * DER KONSENS-FILTER (§7.5 b): übernommen wird nur, was MINDESTENS ZWEI
 * VERSCHIEDENE Modelle übereinstimmend sagen.
 *
 * ── DREI DINGE, DIE MAN NICHT VEREINFACHEN DARF ───────────────────────────
 * 1. VERSCHIEDENE Modelle. Zwei Antworten desselben Modells sind kein Konsens,
 *    sondern dasselbe Modell zweimal — und `agree: 2` wäre dann eine Lüge über
 *    die Belastbarkeit.
 * 2. Der ÜBERNOMMENE Wert ist die Antwort des ERSTEN Modells der grössten
 *    übereinstimmenden Gruppe, wörtlich. Ein zusammengefasster Wert wäre eine
 *    dritte Formulierung, die kein Modell gesagt hat.
 * 3. KEIN Konsens ⇒ das Feld FEHLT. Nicht „mit `agree: 1` anzeigen und klein
 *    beschriften": die Leitplanke ist, dass Ungeprüftes gar nicht erst
 *    erscheint (§7.5 b), und `agree ≥ 2` steht auch im Ablage-Schema.
 */
export function consensusStatements(
  answers: readonly MarketAiAnswer[],
  askedModels: number,
): MarketAiStatement[] {
  const out: MarketAiStatement[] = []

  for (const fieldId of MARKET_AI_VIEW_FIELDS) {
    // Je Modell zählt die ERSTE Antwort zu diesem Feld.
    const byModel = new Map<string, string>()
    for (const answer of answers) {
      if (answer.fieldId !== fieldId) continue
      const value = answer.value.trim()
      if (!value || byModel.has(answer.model)) continue
      byModel.set(answer.model, value)
    }
    if (byModel.size < 2) continue

    const entries = [...byModel.entries()]
    let best: { value: string, agree: number } | null = null
    for (const [, value] of entries) {
      const agree = entries.filter(([, other]) => statementsAgree(value, other)).length
      if (agree >= 2 && (!best || agree > best.agree)) best = { value, agree }
    }
    if (!best) continue

    out.push({
      fieldId,
      value: best.value,
      agree: best.agree,
      // `asked` ist die Zahl der BEFRAGTEN Modelle, nicht die der antwortenden:
      // „2 von 3" sagt etwas anderes als „2 von 2", und ein ausgefallenes
      // Modell soll den Nenner nicht schrumpfen lassen.
      asked: Math.max(askedModels, best.agree),
    })
  }

  return out
}
