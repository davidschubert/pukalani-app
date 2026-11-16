import { createAppReportEvidenceSweep, reportEvidenceSweepMode } from '../utils/reportEvidenceSweep'

/**
 * DER TAKT DES LÖSCH-LAUFS FÜR GEMELDETE NACHRICHTEN (SEC-033).
 *
 * Was er tut und warum, steht in `server/utils/reportEvidenceSweep.ts`; die
 * Regel pur in `shared/messageReport.ts`. Hier nur der Takt.
 *
 * SCHALTER `pukalani.messages.reportEvidenceSweep` (`off` | `count` |
 * `apply`, Vorgabe `off`): bei `off` meldet sich der Lauf gar nicht an — ein
 * Lauf, der in dieser App nicht fährt, hielte der tägliche Wächter sonst für
 * überfällig (`core/server/utils/timedJob.ts`). `apply` setzt erst Davids Ja
 * zu einer gezählten Zahl.
 *
 * STÜNDLICH reicht: die Frist misst in Tagen. ERSTER LAUF nach 4 Minuten,
 * also hinter dem Ende eines alten Prozesses beim Neuladen.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 4 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = reportEvidenceSweepMode()
  if (mode === 'off') return

  const run = createAppReportEvidenceSweep(mode)
  defineTimedJob({
    name: 'message-report-evidence',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run,
  })
})
