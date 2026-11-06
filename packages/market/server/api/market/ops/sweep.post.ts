import type { MarketRawSweepResult } from '../../../utils/marketRawSweep'
import { runMarketRawSweep } from '../../../utils/marketRawSweep'

/**
 * DEN ROHTEXT-SWEEP JETZT LAUFEN LASSEN (MV1 M5) — der Handgriff neben dem
 * Takt aus `server/plugins/raw-text-sweep.ts`.
 *
 * Wörtlich dieselbe Form wie `POST /api/notifications/run-digest` im core:
 * `system.manage`, kein Rumpf, das Ergebnis des Sweeps als Antwort. Sie
 * existiert aus zwei Gründen, und beide sind Betrieb:
 *
 *  1. **Beweisbarkeit.** Der E2E-Beweis
 *     (`scripts/verify-market-retention.mjs`) kann die Frist nicht abwarten
 *     und soll auch keine interne Funktion über einen Dev-Hook aufrufen — das
 *     wäre ein zweiter Einstieg, den nur der Test kennt. Ein Betreiber-Knopf,
 *     den der Beweis mitbenutzt, misst dagegen genau den Weg, den es auch in
 *     Produktion gibt.
 *  2. **Nach einem Vorfall.** Wer den Marktvergleich abschaltet, will die
 *     schon gesammelten fremden Texte SOFORT los sein und nicht in dreissig
 *     Minuten.
 *
 * ── WARUM `system.manage` UND NICHT DIE MARKT-TÜR ────────────────────────
 * Der Sweep läuft über ALLE Brandings (die Frist gehört dem fremden
 * Website-Betreiber, nicht dem Kunden). `requireMarketProfile` wäre hier also
 * die falsche Frage: es gibt kein Branding, dessen Besitz etwas beweisen
 * würde. Betreiber-Handgriff, Betreiber-Recht — dieselbe Wahl wie beim
 * Digest.
 *
 * ── SIE HÄNGT UNTER `/api/market` UND FÄLLT DAMIT MIT DER NOTABSCHALTUNG ──
 * `04.product-gate.ts` prüft jede `/api/market/**`-Route gegen
 * `app_config.products.market.enabled`. Das ist hier hingenommen und nicht
 * umgangen: die ZUSAGE hält der Takt (er läuft weiter, Begründung dort), diese
 * Route ist der Handgriff. Ein zweites API-Präfix im Manifest, nur damit ein
 * Ops-Knopf die Notabschaltung überlebt, wäre der teurere Tausch — genau der
 * zweite Eintrag, den man beim nächsten Mal vergisst.
 *
 * Kein `requireMarketEnabled()`: das Build-Gate steht für die KUNDEN-Fläche
 * („bietet dieses Deployment das Produkt an?"). Ein Betreiber, der aufräumen
 * will, ist keine Kunden-Fläche — und eine App ohne den Layer hat diese Datei
 * gar nicht erst.
 */
export default defineEventHandler(async (event): Promise<MarketRawSweepResult> => {
  requirePermission(event, 'system.manage')
  return await runMarketRawSweep()
})
