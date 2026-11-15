import { brandCheckErasureMode, runBrandCheckErasure } from '../utils/brandCheckErasureRun'

/**
 * DER TAKT DES LÖSCH-LAUFS DER PRÜFERGEBNISSE (SEC-015, SEC-026): gelöschte
 * Checks nach 90 Tagen abräumen, Absender-Adressen alter Korrekturvorschläge
 * leeren. Was der Lauf tut und was er NIE tut, steht im Kopf von
 * `server/utils/brandCheckErasureRun.ts`.
 *
 * SCHALTER `pukalani.brand.checkErasure` ('off' | 'dry-run' | 'apply';
 * Layer-Default 'off'). Bei 'off' gibt es keinen Timer — die Ops-Route
 * `POST /api/brand/admin/check-erasure/run` kann trotzdem einen Probelauf
 * machen. Ein ungültiger Wert gilt als 'off' und schreibt beim Start eine
 * Fehlerzeile.
 *
 * TAKT STÜNDLICH, obwohl die Frist in Tagen rechnet: die Zusage lautet
 * „nach 90 Tagen", und ein Takt, der nur täglich fragt, verlängert sie bei
 * jedem Neustart um bis zu einen Tag. Ein leerer Lauf kostet zwei Abfragen.
 *
 * ERSTER LAUF NACH 6 MINUTEN, versetzt zum Ereignis-Sweep desselben Layers
 * (`brand-events-sweep.ts`, nach 60 Sekunden) — zwei Läufe im selben
 * Augenblick teilten sich sonst den Boot-Moment.
 *
 * DAS PRODUKT-GATE steht IM Takt und nicht im Plugin-Rumpf — dieselbe
 * Begründung wie beim Ereignis-Sweep: `product-manifest.ts` läuft nicht
 * garantiert vor dieser Datei.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 6 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = brandCheckErasureMode()
  if (mode === 'off') return

  const sweep = () => {
    if (!getProductRegistry().has('brand')) return
    // Die Zusammenfassung und das Scheitern meldet der Lauf selbst (logEvent);
    // hier wird nur verhindert, dass eine abgelehnte Promise unbehandelt bleibt.
    void runBrandCheckErasure(mode).catch(() => {})
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // unref, damit die Timer einen sauberen Exit (CLI, Tests) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
