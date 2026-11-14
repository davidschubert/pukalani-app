import { runRetentionMode, runRunRetention } from '../utils/runRetention'

/**
 * Der Takt des AUFRÄUM-LAUFS (BE-025): Protokolle der Runner-Läufe nach 30
 * Tagen, Ereignisse nach 90 Tagen. Was der Lauf tut und was er NIE tut, steht
 * im Kopf von `server/utils/runRetention.ts`.
 *
 * IM LAYER und nicht in der App: `runner` BESITZT die Tabellen und den Bucket,
 * und der Layer läuft nur in `apps/control`. Eine App-Verdrahtung wie beim
 * Label-Abgleich (zwei Layer, zwei Projekte) braucht es hier nicht.
 *
 * SCHALTER `pukalani.runner.retention` ('off' | 'dry-run' | 'apply';
 * Layer-Default 'off'). Bei 'off' gibt es keinen Timer — die Ops-Route
 * `POST /api/runner/retention/run` kann trotzdem einen Probelauf machen. Ein
 * ungültiger Wert gilt als 'off' und schreibt eine Fehlerzeile.
 *
 * TAKT stündlich (die Fristen rechnen in Tagen). Erster Lauf nach 4 Minuten,
 * VERSETZT zu den übrigen Läufen der Konsole (Testphasen-Sweep nach 30 s) —
 * zwei Läufe im selben Augenblick teilten sich sonst den Boot-Moment.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 4 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = runRetentionMode()
  if (mode === 'off') return

  const sweep = () => {
    // Die Zusammenfassung schreibt der Lauf selbst (logEvent); hier landet nur,
    // was ihn als Ganzes scheitern ließ (z. B. ein fehlender Schlüssel).
    void runRunRetention(mode).catch((error: unknown) => {
      console.error('[runner] Aufräum-Lauf fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
