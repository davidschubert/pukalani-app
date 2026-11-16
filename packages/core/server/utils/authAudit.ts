import type { H3Event } from 'h3'

/**
 * Selbst-bezogene Auth-/Account-Ereignisse fürs Aktivitätsprotokoll —
 * Login/Logout plus Security-Signale (Passwort, Recovery) und Profil-Updates.
 * Das Audit-Log IST der „Admin-Feed" für diese Ereignisse: admin-only
 * (audit.read), IP-behaftet, bei GDPR-Löschung pseudonymisiert statt
 * gelöscht — genau die Garantien, die der Community-Feed (activities,
 * Hard-Delete) bewusst NICHT hat.
 *
 * ZWEITER LESER (seit 2026-11-13): der Nutzer selbst sieht eine AUSWAHL seiner
 * eigenen Zeilen unter `/profile/activity` („Konto und Sicherheit") — ohne
 * An-/Abmeldungen, mit Ort statt IP. Leseweg: `server/utils/accountEvents.ts`,
 * Regeln: `shared/accountEvents.ts`. Wer hier eine Aktion ergänzt, entscheidet
 * dort, ob sie dazugehört; wer ein Profil-FELD ergänzt, trägt es in
 * `ACCOUNT_EVENT_PROFILE_FIELDS` ein (ein Wächter-Test meldet es sonst).
 */
export type AuthAuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.self_deleted'
  | 'user.password_changed'
  | 'user.recovery_requested'
  | 'user.email_verified'
  | 'user.profile_updated'
  // Zwei-Faktor (U15 Teil 4). Der FEHLVERSUCH gehört mit ins Protokoll: er ist
  // das einzige Signal, an dem man sieht, dass jemand mit gültigem Passwort
  // vor dem zweiten Faktor steht und rät.
  | 'user.mfa_enabled'
  | 'user.mfa_disabled'
  | 'user.mfa_challenge_failed'

/**
 * Schreibt ein Auth-Ereignis ins Aktivitätsprotokoll (audit_logs). Bewusst
 * NICHT über recordAudit (admin-Layer) — core darf nicht von admin abhängen;
 * stattdessen über den EINEN Schreiber des Protokolls (`writeAuditLog`,
 * server/utils/auditLog.ts), NICHT strikt: Auth darf nie blockieren. Ein
 * gescheiterter Eintrag wird seit BE-021 (2026-11-16) gemeldet
 * (`audit.write_failed`) statt still geschluckt. Actor ist der jeweilige
 * User selbst. `fields` trägt NUR Feldnamen, nie Werte.
 */
export async function logAuthEvent(
  event: H3Event,
  action: AuthAuditAction,
  opts: { userId: string, name?: string, method?: string, fields?: string[] },
): Promise<void> {
  let name = opts.name ?? ''
  if (opts.name === undefined) {
    try {
      name = await createAdminClient(event).users.get({ userId: opts.userId }).then(u => u.name)
    }
    catch {
      // Ohne Namen wird trotzdem protokolliert — die Id trägt den Eintrag.
      name = ''
    }
  }
  const metadata: Record<string, unknown> = {}
  if (opts.method) metadata.method = opts.method
  if (opts.fields?.length) metadata.fields = opts.fields
  await writeAuditLog(event, {
    actorId: opts.userId,
    actorName: name,
    action,
    metadata,
  })
}
