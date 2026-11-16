import type { H3Event } from 'h3'

export interface AuditInput {
  /** z.B. 'user.block', 'comment.hidden' */
  action: string
  targetType?: string
  targetId?: string
  targetName?: string
  metadata?: Record<string, unknown>
}

/**
 * Schreibt einen Audit-Eintrag (wer hat was getan) über den EINEN Schreiber
 * des Protokolls (`writeAuditLog`, core — BE-021, 2026-11-16).
 *
 * ABBRECHEN ODER WEITERLAUFEN (Davids Plan 2026-11-16):
 *   · Vorgabe (nicht strikt): die Admin-Aktion läuft weiter, ein Ausfall des
 *     Protokolls wird nur gemeldet (`audit.write_failed`, zählt der tägliche
 *     Kontroll-Lauf). Sperren, Sitzungen beenden, Rollen, Löschen,
 *     Einstellungen und Ansichten gehören hierher — Sperren muss sofort gehen.
 *   · `strict: true` für die HERAUSGABE von Personendaten (Export, CSV,
 *     Lösch-Kopie): ERST der Eintrag, DANN die Antwort. Scheitert der
 *     Eintrag, wirft er 503 `audit_unavailable` und die Route gibt nichts
 *     heraus.
 *
 * Rückgabe: `true`, wenn der Eintrag steht.
 */
export async function recordAudit(event: H3Event, input: AuditInput, opts: { strict?: boolean } = {}): Promise<boolean> {
  const actor = event.context.user
  if (!actor) {
    // Ohne Betreiber kein Eintrag — für eine Herausgabe heißt das: nichts herausgeben.
    if (opts.strict) throw auditUnavailableError()
    return false
  }

  return writeAuditLog(event, {
    actorId: actor.$id,
    actorName: actor.name,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetName: input.targetName,
    metadata: input.metadata,
  }, opts)
}
