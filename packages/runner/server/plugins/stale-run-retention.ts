import { retentionTick } from '../../../core/server/utils/rowRetention'
import { runStaleRunRetention, staleRunRetentionMode } from '../utils/staleRunRetention'

/**
 * Der Takt des FRISTEN-LAUFS FÜR LÄUFE, DIE NIE BEENDET WURDEN (RU1 c): ein
 * Entwurf oder ein Lauf auf `queued`/`claimed`/`running`, der 7 Tage kein
 * Lebenszeichen gab, wird abgebrochen (Grund `abandoned`). Was er tut und was
 * nie: Kopf von `shared/staleRunRetention.ts` und
 * `server/utils/staleRunRetention.ts`.
 *
 * SCHALTER `pukalani.runner.staleRunRetention` ('off' | 'count' | 'apply';
 * Layer-Vorgabe 'off'). Bei 'off' gibt es keinen Takt — die Hand-Route
 * `POST /api/runner/retention/stale` kann trotzdem zählen. EIGENER Schalter,
 * nicht der der beiden Läufe daneben (beide stehen in apps/control auf
 * 'apply').
 *
 * TAKT stündlich (die Frist rechnet in Tagen). Erster Lauf nach 10 Minuten,
 * VERSETZT zum Aufräum-Lauf der Protokolle (4 Minuten), zur Text-Frist
 * (7 Minuten) und zum Testphasen-Sweep (30 s).
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = staleRunRetentionMode()
  if (mode === 'off') return

  defineTimedJob({
    name: 'stale-run-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: retentionTick(() => runStaleRunRetention(mode)),
  })
})
