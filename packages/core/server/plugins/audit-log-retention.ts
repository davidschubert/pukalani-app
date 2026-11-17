import { retentionTick } from '../utils/rowRetention'
import { auditLogRetentionMode, runAuditLogRetention } from '../utils/auditLogRetention'

/**
 * DER TAKT DES FRISTEN-LAUFS DES KONTO-PROTOKOLLS (EL1 c): Einträge in
 * `audit_logs` 12 Monate nach dem Schreiben löschen. Was der Lauf tut und
 * was er NIE tut, steht im Kopf von `server/utils/auditLogRetention.ts`.
 *
 * SCHALTER `pukalani.audit.retention` ('off' | 'count' | 'apply';
 * Core-Default 'off'). Bei 'off' gibt es keinen Timer — die Hand-Route
 * `POST /api/admin/audit-logs/retention/run` (admin-Layer) kann trotzdem
 * zählen. Ein ungültiger Wert gilt als 'off' und schreibt eine Fehlerzeile
 * (`retention.invalid_mode`).
 *
 * TAKT STÜNDLICH, obwohl die Frist in Tagen rechnet — dieselbe Begründung wie
 * bei den übrigen Fristen-Läufen: ein täglicher Takt verlängerte die Zusage
 * bei jedem Neustart um bis zu einen Tag. Ein leerer Lauf kostet eine
 * Abfrage.
 *
 * ERSTER LAUF NACH 14 MINUTEN, versetzt hinter die übrigen Läufe des Core
 * (Aufräumer der Sicherungskopien nach 5 Minuten) und der Layer (bis 10
 * Minuten), damit der Boot-Moment nicht alle zugleich trifft.
 *
 * KEIN PRODUKT-GATE: die Tabelle gehört dem system-Layer, der in jeder App
 * mitläuft. Eine Instanz ohne die Tabelle meldet der Lauf als „nichts zu
 * tun", nicht als Scheitern.
 *
 * DIE KENNUNG steht als Literal, weil die Wächter sie im Quelltext lesen
 * (`timedJobGuard.test.ts`, `verifyAppSignals.test.ts`); dass sie gleich
 * `AUDIT_LOG_RETENTION_JOB` ist, hält `auditLogRetention.test.ts`.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 14 * 60 * 1000

export default defineNitroPlugin(() => {
  const mode = auditLogRetentionMode()
  if (mode === 'off') return

  // Die Zahlen und das Scheitern meldet der Lauf selbst (`retention.*`);
  // `retentionTick` übersetzt sein Ergebnis nur für `job.run` (OPS-011).
  // unref, damit der Timer einen sauberen Exit (CLI/Tests) nicht offen hält.
  defineTimedJob({
    name: 'audit-log-retention',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: retentionTick(() => runAuditLogRetention(mode)),
  })
})
