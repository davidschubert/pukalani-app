/**
 * DER § 6 UWG-RIEGEL DES MARKTVERGLEICHS (Plan §1.7 Nr. 5, §2.9 Nr. 5) —
 * seit BI1 I1a eine HÜLLE über `core/shared/disparagementGuard.ts`.
 *
 * ── WARUM DIE REGEL UMGEZOGEN IST ─────────────────────────────────────────
 * Brand Insights (`insights`) stellt dieselbe Frage an einen redaktionellen
 * Text: nennt dieser Satz einen Dritten, oder setzt er ihn herab? Ein
 * Produkt-Layer importiert keinen anderen (CONCEPT.md A14), und Abschreiben
 * wäre der teurere Fehler — zwei Riegel driften, und der schwächere gewinnt.
 * Die Regel liegt deshalb im Fundament; hier stehen nur noch die MARKT-Namen.
 *
 * ── WAS DAMIT GLEICH BLEIBT ───────────────────────────────────────────────
 * Alles, was der Layer sieht. `createMarketDisparagementGuard`,
 * `checkMarketTexts`, `MARKET_NAME_TOKEN_MIN`, `MARKET_GENERIC_TOKENS`,
 * `MARKET_DISPARAGING_TERMS`, `MarketFilterReason` und die Guard-Typen heissen
 * unverändert; keine Aufrufstelle im market-Layer und kein Beweis-Skript
 * ändert sich. Die Prüfungen aus `tests/marketDisparagement.test.ts` sind mit
 * nach `core/tests/disparagementGuard.test.ts` gezogen — der Test hier ist
 * seither der Beweis, dass die HÜLLE dieselbe Regel weiterreicht.
 *
 * ── WAS MARKT BLEIBT UND NICHT NACH core GEHÖRT ───────────────────────────
 * Die HERKUNFT der Eingaben. `candidates` sind die Wettbewerber DIESES
 * Berichts; `ownTexts` sind die BESTÄTIGTEN Foundation-Felder des Kunden
 * (Kategorie, Pitch, Zielgruppe) — die Zuordnung „welches Marktfeld füllt
 * `ownTexts`" ist Produktwissen und steht bei den Aufrufern im Layer, nie im
 * Fundament. Das Fundament kennt nur Namen, Domains und Zeichenketten.
 *
 * ── DER STÄRKSTE TEIL DES RIEGELS STEHT WEITERHIN NICHT HIER ──────────────
 * Der Vergleichs-Prompt bekommt die Wettbewerber gar nicht mit NAMEN, sondern
 * nur als `c1 … c5` (s. `server/prompts/marketReportPrompt.ts`). Ein Modell
 * kann einen Namen also nicht einmal versehentlich abschreiben — es kennt ihn
 * nicht. Der Riegel ist das Netz darunter.
 */

export {
  createDisparagementGuard as createMarketDisparagementGuard,
  checkGuardedTexts as checkMarketTexts,
  DISPARAGING_TERMS as MARKET_DISPARAGING_TERMS,
  GENERIC_NAME_TOKENS as MARKET_GENERIC_TOKENS,
  NAME_TOKEN_MIN as MARKET_NAME_TOKEN_MIN,
  normalizeForFilter,
} from '../../core/shared/disparagementGuard'

export type {
  DisparagementGuard as MarketDisparagementGuard,
  DisparagementReason as MarketFilterReason,
  GuardCandidate as MarketGuardCandidate,
  GuardOptions as MarketGuardOptions,
} from '../../core/shared/disparagementGuard'
