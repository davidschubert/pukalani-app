import { z } from 'zod'
import type { RowRetentionResult } from '../../../../../../core/shared/rowRetention'

const bodySchema = z.object({
  apply: z.boolean().optional(),
}).optional()

/**
 * FRISTEN-LAUF DES KONTO-PROTOKOLLS JETZT LAUFEN LASSEN (Ops/Verifikation,
 * EL1 c) — dasselbe Paar aus Takt und Hand-Route wie beim Aufräumen der
 * Sicherungskopien (`gdpr-exports/prune.post.ts`, daneben): ein Lauf, den man
 * nur durch Warten beobachten kann, wird nie bewiesen. Der Takt steht im
 * Core (`core/server/plugins/audit-log-retention.ts`).
 *
 * Tor `system.manage`, VOR jedem Lesen. Die Protokoll-Ansicht verlangt
 * `audit.read`; beide hält heute nur die Rolle `admin` — `system.manage`,
 * weil diese Route nicht liest, sondern Einträge des Protokolls löscht.
 *
 * Body `{ apply?: boolean }`, ohne Angabe wird NUR gezählt. `apply: true`
 * löscht NUR, wenn der Schalter `pukalani.audit.retention` der App auf
 * `apply` steht — sonst 409 `audit_retention_not_apply`: die Hand-Route ist
 * kein Weg am Schalter vorbei. Zählen geht immer, auch bei `off` (es liest
 * nur). Läuft gerade ein Lauf (Takt oder zweiter Klick) ⇒ 409
 * `audit_retention_busy`.
 *
 * PROTOKOLL: ein Handlauf mit `apply` schreibt GENAU EINEN Eintrag
 * (`audit_log.retention_applied`, in den Zusatzangaben nur die Zahlen des
 * Laufs) — NACH dem Lauf, damit die Zahlen stimmen, und nicht strikt: das
 * Löschen ist geschehen, ein Ausfall des Protokolls meldet `recordAudit` als
 * `audit.write_failed`. Je gelöschter Zeile entsteht nie ein Eintrag, und
 * Zählen schreibt keinen.
 *
 * Antwort: nur die Zahlen des Laufs, keine Ids, keine Namen.
 */
export default defineEventHandler(async (event): Promise<RowRetentionResult> => {
  requirePermission(event, 'system.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const apply = body?.apply === true

  if (apply && auditLogRetentionMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Audit log retention is not switched to apply',
      data: { code: 'audit_retention_not_apply' },
    })
  }

  const result = await runAuditLogRetention(apply ? 'apply' : 'count')
  if (!result) {
    throw createError({
      status: 409,
      statusText: 'Audit log retention is already running',
      data: { code: 'audit_retention_busy' },
    })
  }

  if (apply) {
    await recordAudit(event, {
      action: 'audit_log.retention_applied',
      targetType: 'audit_logs',
      metadata: {
        considered: result.considered,
        expired: result.expired,
        deleted: result.deleted,
        failed: result.failed,
        truncated: result.truncated,
      },
    })
  }
  return result
})
