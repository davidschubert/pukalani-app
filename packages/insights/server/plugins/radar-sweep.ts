import { runInsightsRadarSweep } from '../utils/insightsRadarSweep'

/**
 * DER TAKT DES THEMENRADARS (Plan §9.6, Paket I4).
 *
 * Muster und Begründungen wie beim Fristen-Sweep nebenan
 * (`corrections-sweep.ts`) und beim Ereignis-Sweep des brand-Layers: eine
 * Konstante je Zahl, erster Lauf kurz nach dem Boot, `setInterval` danach,
 * Single-Instanz-Annahme, Arbeit in `server/utils`. Ein Betreiber soll nicht je
 * Layer eine andere Mechanik lernen müssen.
 *
 * ── WARUM EINMAL AM TAG, UND NICHT ÖFTER ────────────────────────────────
 * Weil die Aufbewahrungs-Entscheidung genau daran hängt (Kopf der Migration
 * insights-004): „täglich neu holen und überschreiben" ist einer der beiden
 * Wege, die die YouTube API Services Developer Policies in III.E.4 erlauben.
 * Ein Lauf alle sechs Stunden wäre nicht vier Mal so aktuell — Aufrufzahlen
 * bewegen sich in Tagen —, er kostete aber das Vierfache an Quota und nähme
 * dem Betreiber-Knopf sein Budget.
 *
 * ── DER ERSTE LAUF KOMMT NACH 90 SEKUNDEN ───────────────────────────────
 * Etwas später als der Fristen-Sweep (60 s), und mit Absicht: dieser Lauf
 * spricht mit einem FREMDEN Dienst und schreibt bis zu ein paar hundert
 * Zeilen. Er soll nicht in denselben Moment fallen wie der Rest des
 * Boot-Geschäfts, und ein Deploy soll nicht daran hängen. Die halbe Minute
 * Abstand kostet nichts und trennt die beiden Läufe im Log.
 *
 * ── DAS PRODUKT-GATE: `getProductRegistry().has('insights')` ────────────
 * Dieselbe Frage wie nebenan — „ist dieses Produkt in DIESE App
 * einkompiliert?". Ohne sie liefe der Takt in jeder App, die den Layer aus
 * einem anderen Grund im Baum hat. Die Prüfung steht IM `setTimeout` und nicht
 * im Plugin-Rumpf, weil Nitro Plugins alphabetisch lädt und
 * `product-manifest.ts` daher nicht garantiert vorher gelaufen ist.
 *
 * ── UND WARUM DER PRODUKT-SCHALTER HIER ANDERS LIEGT ALS NEBENAN ────────
 * Beim Fristen-Sweep steht ausdrücklich, dass der Runtime-Kill ihn NICHT
 * anhalten darf: eine Aufbewahrungsfrist ist kein Produktmerkmal. Der Radar
 * ist das Gegenteil — er HOLT Daten, statt sie loszuwerden. Er braucht den
 * Schalter trotzdem nicht als eigene Zeile: ohne Schlüssel (`not_configured`)
 * oder ohne Kanäle (`no_channels`) tut der Lauf ohnehin nichts, und wer den
 * Radar abstellen will, nimmt die Kanäle aus der Config — das ist die Stelle,
 * an der die Entscheidung ohnehin getroffen wird, und sie wirkt sofort auf
 * BEIDE Auslöser (Takt und Knopf).
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 90 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    if (!getProductRegistry().has('insights')) return
    // OHNE `then`: der Lauf loggt seine Zahlen selbst (`insights.radar_swept`),
    // und ein übersprungener Lauf loggt bewusst gar nichts — „kein Schlüssel"
    // ist ein Betriebszustand, keine tägliche Nachricht. Eine zweite Log-Zeile
    // hier wäre dieselbe Auskunft an einer zweiten Stelle.
    void runInsightsRadarSweep().catch((error) => {
      console.error('[insights] Radar-Lauf fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI, Tests, Migrations-Läufe) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
