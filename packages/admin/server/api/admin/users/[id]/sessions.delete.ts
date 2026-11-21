import { forgetAccountSessions } from '../../../../../../core/server/utils/sessionAccount'
/** Alle Sessions eines Users invalidieren (Security-Aktion, z.B. nach Kompromittierung) */
export default defineEventHandler(async (event) => {
  const adminUser = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const admin = createAdminClient(event)
  await admin.users.deleteSessions({ userId })
    .catch((error) => { throw toH3Error(error, 'User not found') })
  // Widerrufen heißt sofort widerrufen — auch im Anmelde-Merker (Q12).
  forgetAccountSessions(userId)

  await recordAudit(event, { action: 'user.sessions_cleared', targetType: 'user', targetId: userId })

  // Hat der Admin die EIGENEN Sessions beendet, ist auch die aktuelle Session weg —
  // Cookie entfernen; der Client loggt daraufhin aus und leitet auf die Startseite.
  const self = adminUser.$id === userId
  if (self) clearSessionCookie(event)

  return { ok: true, self }
})
