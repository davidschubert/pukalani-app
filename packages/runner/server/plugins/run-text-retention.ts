import { retentionTick } from '../../../core/server/utils/rowRetention'
import { runRunTextRetention, runTextRetentionMode } from '../utils/runTextRetention'

/**
 * Der Takt des FRISTEN-LAUFS FÜR TEXTE UND ANHÄNGE (RU1 c): 12 Monate nach
 * dem Ende eines Laufs fallen Auftrag, Fehlertext, freie Berichtsfelder und
 * Anhänge, die Zahlen bleiben. Was er tut und was nie: Kopf von
 * `server/utils/runTextRetention.ts`.
 *
 * SCHALTER `pukalani.runner.textRetention` ('off' | 'count' | 'apply';
 * Layer-Vorgabe 'off'). Bei 'off' gibt es keinen Takt — die Hand-Route
 * `POST /api/runner/retention/texts` kann trotzdem zählen. EIGENER Schalter,
 * nicht der des Aufräum-Laufs daneben (der steht in apps/control auf 'apply').
 *
 * TAKT stündlich (die Frist rechnet in Monaten). Erster Lauf nach 7 Minuten,
 * VERSETZT zum Aufräum-Lauf der Protokolle (4 Minuten) und zum
 * Testphasen-Sweep (30 s) — zwei Läufe teilten sich sonst den Boot-Moment.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 7 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = runTextRetentionMode()
  if (mode === 'off') return

  defineTimedJob({
    name: 'run-text-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: retentionTick(() => runRunTextRetention(mode)),
  })
})
