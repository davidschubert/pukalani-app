import { z } from 'zod'
import { forgetAccountSessions } from '../../../../../../core/server/utils/sessionAccount'

const statusSchema = z.object({ blocked: z.boolean() })

/** Blockieren/Entsperren — der eigene Account ist nicht blockierbar. */
export default defineEventHandler(async (event) => {
  const adminUser = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const { blocked } = await readValidatedBody(event, statusSchema.parse)

  if (blocked && userId === adminUser.$id) {
    throw createError({ status: 400, statusText: 'You cannot block your own account' })
  }
  const admin = createAdminClient(event)
  // Appwrite-Semantik: status true = aktiv, false = blockiert.
  // Den letzten aktiven Admin nicht aussperren: das Sperren läuft unter der
  // Projekt-Sperre und nur, wenn ein anderer aktiver Admin bleibt (409
  // `last_admin`, core/server/utils/lastAdmin.ts). Entsperren braucht nichts.
  const write = () => admin.users.updateStatus({ userId, status: !blocked })
  const updated = await (blocked ? withLastAdminGuard(event, userId, write) : write())
    .catch((error) => { throw toH3Error(error, 'User not found') })
  // Gesperrt heißt sofort gesperrt — auch im Anmelde-Merker (Q12).
  forgetAccountSessions(userId)

  await recordAudit(event, {
    action: blocked ? 'user.block' : 'user.unblock',
    targetType: 'user',
    targetId: updated.$id,
    targetName: updated.name,
  })

  return { $id: updated.$id, status: updated.status }
})
