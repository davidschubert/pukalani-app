import { AppwriteException, ID } from 'node-appwrite'
import type { H3Event } from 'h3'
import { AUDIT_UNAVAILABLE_REASON } from '../../shared/auditLog'

/**
 * DER EINE SCHREIBER DES BETREIBER-PROTOKOLLS (`audit_logs`, BE-021,
 * 2026-11-16).
 *
 * Bis hierher schrieben zwei Stellen selbst in die Tabelle — `recordAudit`
 * (admin-Layer) und `logAuthEvent` (core) — und beide schluckten JEDEN Fehler
 * mit einem leeren `catch`. Fehlte eine Spalte oder dem Schlüssel ein Recht,
 * entstand kein einziger Eintrag mehr, und niemand bemerkte es: das
 * Protokoll war leer und sah aus wie ein ruhiger Tag.
 *
 * Jetzt gilt:
 *   · Jeder gescheiterte Eintrag schreibt GENAU EINE Zeile
 *     `audit.write_failed` ins Log. Der tägliche Kontroll-Lauf zählt sie
 *     (ops/app-watch-counts.mjs → `protokoll ausfaelle=<n>`). Die Zeile trägt
 *     nur Aktion, Zielart und eine kurze Kennung des Fehlers (Status und
 *     Appwrite-`type`) — keine Namen, keine Personen-Ids, keine rohe Meldung.
 *   · Vorgabe: nicht strikt. Die eigentliche Handlung läuft weiter (sperren,
 *     anmelden, Rolle setzen …), der Ausfall wird nur gemeldet. Rückgabe
 *     `false`.
 *   · `strict: true` für die HERAUSGABE von Personendaten: scheitert der
 *     Eintrag, wirft der Schreiber 503 mit `data.code = audit_unavailable`,
 *     und die Route gibt nichts heraus. Deshalb gehört der strikte Eintrag
 *     VOR die Antwort.
 *
 * core besitzt die Tabelle nicht (sie gehört dem system-Layer, der in jeder
 * App mitläuft) — der Schreiber kennt nur ihre Spalten, kein Produkt.
 */

export const AUDIT_LOGS_TABLE = 'audit_logs'

export interface AuditLogRow {
  actorId: string
  actorName: string
  /** z. B. 'user.exported', 'user.login' — eine feste Kennung aus dem Code */
  action: string
  targetType?: string
  targetId?: string
  targetName?: string
  /** Schon serialisiert oder als Objekt; leer = keine Metadaten */
  metadata?: Record<string, unknown> | string
}

/**
 * Was über einen gescheiterten Eintrag ins Log darf (pur, getestet): Status
 * und Appwrite-`type`, beides nur in fester Form. Die Meldung selbst bleibt
 * draußen — sie nennt Tabellen, Spalten und gelegentlich Werte.
 */
export function auditFailureFields(error: unknown): { status: number | null, type: string | null } {
  if (error instanceof AppwriteException) {
    const type = typeof error.type === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(error.type) ? error.type : null
    return { status: Number.isInteger(error.code) ? error.code : null, type }
  }
  return { status: null, type: null }
}

/** Der 503 der Herausgabe-Routen — auch ohne Schreibversuch (kein Betreiber im Kontext). */
export function auditUnavailableError() {
  return createError({
    status: 503,
    statusText: 'Audit log unavailable',
    data: { code: AUDIT_UNAVAILABLE_REASON },
  })
}

export async function writeAuditLog(
  event: H3Event,
  row: AuditLogRow,
  opts: { strict?: boolean } = {},
): Promise<boolean> {
  const strict = opts.strict === true
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    // Die IP im Protokoll ist eine BEHAUPTUNG über einen Menschen — sie muss
    // vom eigenen Proxy stammen, nicht vom Client: das LETZTE
    // X-Forwarded-For-Segment (Audit 2026-08-02, server/utils/clientIp.ts).
    const ip = trustedClientIp(event) ?? ''
    const metadata = typeof row.metadata === 'string'
      ? row.metadata
      : row.metadata && Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : ''
    await admin.tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: AUDIT_LOGS_TABLE,
      rowId: ID.unique(),
      data: {
        actorId: row.actorId,
        actorName: row.actorName,
        action: row.action,
        targetType: row.targetType ?? '',
        targetId: row.targetId ?? '',
        targetName: row.targetName ?? '',
        metadata,
        ip,
      },
    })
    return true
  }
  catch (error) {
    logEvent('error', 'audit.write_failed', {
      action: row.action,
      targetType: row.targetType ?? '',
      strict,
      ...auditFailureFields(error),
    })
    if (strict) throw auditUnavailableError()
    return false
  }
}
