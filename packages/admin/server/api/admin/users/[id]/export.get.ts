/**
 * DSGVO: Daten eines Users als JSON exportieren (Admin) + Audit.
 * Zusammensetzung (Account + Sessions + alle UserDataContributors) macht
 * exportUserCompletely — vollständig paginiert, kein Produkt-Wissen hier.
 * `via: 'admin'` heißt Empfänger Betreiber: private Nachrichten kommen nur
 * als Eckdaten mit, ohne Text (SEC-034).
 *
 * HERAUSGABE VON PERSONENDATEN (BE-021/SEC-034, Davids Entscheidungen
 * 2026-11-16): frische Anmeldung (10 Minuten) NACH dem Rechte-Gate und VOR
 * dem ersten Datenzugriff, und ERST der Protokoll-Eintrag, DANN die Antwort
 * — scheitert der Eintrag, antwortet die Route 503 `audit_unavailable` und
 * gibt nichts heraus.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')
  await requireRecentAuth(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const payload = await exportUserCompletely(event, userId, { via: 'admin' })
    .catch((error) => { throw toH3Error(error, 'User not found') })

  await recordAudit(event, { action: 'user.exported', targetType: 'user', targetId: userId, targetName: payload.account.name }, { strict: true })

  return payload
})
