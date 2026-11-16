import { isRunRetentionRunning, runRetentionMode, runRunRetention } from '../utils/runRetention'

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

  // Die Zusammenfassung schreibt der Lauf selbst (logEvent); hier wird sein
  // Ergebnis nur für `job.run` übersetzt (OPS-011).
  defineTimedJob({
    name: 'run-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      // Der Riegel der Util meldet „schon im Gange" nur als leeres Ergebnis —
      // nicht unterscheidbar von einem Lauf ohne Arbeit. Deshalb VORHER
      // fragen; zwischen Frage und Aufruf liegt kein `await`.
      if (isRunRetentionRunning()) return 'skipped'
      const result = await runRunRetention(mode)
      const failed = result.transcripts.failed + result.events.failed
      if (failed > 0) throw new Error(`unvollständig: ${failed} Schritte gescheitert`)
    },
  })
})
