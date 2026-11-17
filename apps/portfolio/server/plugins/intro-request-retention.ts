import { introRequestRetentionMode, runIntroRequestRetention } from '../utils/introRequestRetentionRun'

/**
 * DER TAKT DES FRISTEN-LAUFS DER GESPRÄCHSANFRAGEN VON pukalani.studio
 * (EL1 c): Anfragen 12 Monate nach dem Eingang löschen. Was der Lauf tut und
 * was er NIE tut, steht im Kopf von `server/utils/introRequestRetentionRun.ts`.
 *
 * SCHALTER `pukalani.portfolio.introRequestRetention` ('off' | 'count' |
 * 'apply'; ohne Wert 'off' — es gibt keinen Layer, der einen Default setzt).
 * Bei 'off' gibt es keinen Timer — die Hand-Route
 * `POST /api/admin/intro-requests/retention/run` kann trotzdem zählen. Ein
 * ungültiger Wert gilt als 'off' und schreibt eine Fehlerzeile
 * (`retention.invalid_mode`).
 *
 * TAKT STÜNDLICH, obwohl die Frist in Tagen rechnet — dieselbe Begründung wie
 * bei den übrigen Fristen-Läufen: ein täglicher Takt verlängerte die Zusage
 * bei jedem Neustart um bis zu einen Tag. Ein leerer Lauf kostet eine
 * Abfrage.
 *
 * ERSTER LAUF NACH 10 MINUTEN, versetzt zu den übrigen Läufen dieser App
 * (Aufräumer der Sicherungskopien nach 5, Konto-Protokoll nach 14 Minuten).
 *
 * KEIN PRODUKT-GATE: Tabelle, Schreibweg und Lauf gehören dieser App, nicht
 * einem abschaltbaren Layer.
 *
 * DIE KENNUNG steht als Literal, weil die Wächter sie im Quelltext lesen
 * (`timedJobGuard.test.ts`, `verifyAppSignals.test.ts`); dass sie gleich
 * `INTRO_REQUEST_RETENTION_JOB` ist, hält `introRequestRetention.test.ts`.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = introRequestRetentionMode()
  if (mode === 'off') return

  // Die Zahlen und das Scheitern meldet der Lauf selbst (`retention.*`);
  // `retentionTick` übersetzt sein Ergebnis nur für `job.run` (OPS-011).
  defineTimedJob({
    name: 'intro-request-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: retentionTick(() => runIntroRequestRetention(mode)),
  })
})
