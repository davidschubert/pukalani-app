import type { Models } from 'node-appwrite'
import {
  AUDIT_LOG_RETENTION_DAYS,
  AUDIT_LOG_RETENTION_JOB,
  decideAuditLogRetention,
} from '../../shared/auditLogRetention'
import type {
  ActiveRowRetentionMode,
  RowRetentionDeps,
  RowRetentionMode,
  RowRetentionResult,
} from '../../shared/rowRetention'
import { retentionCutoffIso } from '../../shared/rowRetention'
import { AUDIT_LOGS_TABLE } from './auditLog'
import { isAppwriteTableMissing } from './listAllRows'
import { retentionModeOf, runRetentionJob, tableRetentionDeps } from './rowRetention'

/**
 * DER FRISTEN-LAUF DES KONTO-PROTOKOLLS (EL1 c — Davids Entscheidungen
 * 2026-11-15 und 2026-11-17 „Ganz löschen"): Einträge in `audit_logs` 12
 * Monate nach dem Schreiben löschen. Die Regel je Zeile ist pur und steht samt
 * Begründung in `shared/auditLogRetention.ts`; Blättern, Zählen, Sperre und
 * Log-Zeilen kommen aus dem gemeinsamen Gerüst (`shared/rowRetention.ts`,
 * `server/utils/rowRetention.ts`).
 *
 * WARUM IM CORE: die Tabelle gehört dem system-Layer, der in jeder App
 * mitläuft; der EINE Schreiber (`auditLog.ts`) und dieser Lauf leben im Core
 * wie der Aufräumer der Sicherungskopien (`gdpr-export-prune`).
 *
 * WAS ER TUT:
 *  - jeden Eintrag löschen, dessen `$createdAt` mehr als 365 Tage zurückliegt
 *    — unabhängig von Aktion und Handelndem, auch Einträge über Handlungen
 *    des Betreibers (Entscheidung 2026-11-17);
 *  - Vorauswahl der Abfrage: angelegt vor mehr als 365 Tagen, älteste zuerst.
 *
 * WAS ER NIE TUT:
 *  - einen Eintrag JE GELÖSCHTER ZEILE ins Protokoll schreiben — das Löschen
 *    alter Einträge erzeugte sonst neue. Den EINEN Eintrag über einen
 *    Handlauf mit `apply` schreibt die Hand-Route des admin-Layers
 *    (`audit_log.retention_applied`, nur Zahlen); der Takt schreibt keinen.
 *  - einen Eintrag ändern statt löschen.
 *  - in `count` schreiben: dort zählt er mit GENAU der Auswahl, die `apply`
 *    träfe, und schreibt die Zahlen ins Log (`retention.run`,
 *    `job: audit-log-retention`). Das ist die Stellung nach dem Ausliefern —
 *    `apply` erst mit dem Ja des Betreibers zur gezählten Zahl.
 *  - Ids, Namen oder Adressen ins Log schreiben — nur Zahlen.
 *
 * FEHLT DIE TABELLE auf einer Instanz (Appwrite 404 `table_not_found`), ist
 * das „nichts zu tun" — sonst schrieb ein solcher Lauf stündlich ein
 * Scheitern. NUR dieser Fall: jeder andere Lesefehler wirft weiter
 * (`isAppwriteTableMissing`, ein 404 ohne Art vom Proxy zählt nicht).
 *
 * VERDRAHTET in `server/plugins/audit-log-retention.ts` (Takt) und
 * `admin/server/api/admin/audit-logs/retention/run.post.ts` (Handlauf).
 */

/** Der wirksame Schalter dieser App (`pukalani.audit.retention`). */
export function auditLogRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { audit?: { retention?: unknown } } }
  return retentionModeOf(AUDIT_LOG_RETENTION_JOB, appConfig.pukalani?.audit?.retention)
}

/**
 * Dieselben Abhängigkeiten — mit GENAU EINER Nachsicht beim Lesen: fehlt die
 * Tabelle auf dieser Instanz, ist die Seite leer (= nichts zu tun). Jeder
 * andere Lesefehler wirft weiter; Entscheiden und Löschen bleiben unberührt.
 * Auch für Tabellen, die per ensure-Skript statt Migration entstehen.
 */
export function retentionDepsIgnoringMissingTable<T extends { $id: string }>(
  deps: RowRetentionDeps<T>,
): RowRetentionDeps<T> {
  return {
    ...deps,
    listPage: async (args) => {
      try {
        return await deps.listPage(args)
      }
      catch (error) {
        if (isAppwriteTableMissing(error)) return []
        throw error
      }
    },
  }
}

/**
 * EIN LAUF. `null`, wenn gerade einer läuft (Takt und Hand-Route teilen sich
 * die Sperre). Ein Lesefehler wirft (außer der fehlenden Tabelle, s. o.); ein
 * einzelner Lösch-Fehler zählt als `failed`, der Lauf macht weiter.
 *
 * Ohne `H3Event`: ein Takt bedient keinen Request, der Admin-Client wird ohne
 * Event gebaut.
 */
export async function runAuditLogRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const { tablesDB } = createAdminClient()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const deps = tableRetentionDeps<Models.Row>(tablesDB, databaseId, AUDIT_LOGS_TABLE, {
    createdBefore: retentionCutoffIso(now, AUDIT_LOG_RETENTION_DAYS),
    decide: decideAuditLogRetention,
  })
  return runRetentionJob(AUDIT_LOG_RETENTION_JOB, mode, retentionDepsIgnoringMissingTable(deps), { now })
}
