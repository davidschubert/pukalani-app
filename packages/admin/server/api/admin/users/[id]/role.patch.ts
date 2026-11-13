import { z } from 'zod'

const roleSchema = z.object({
  // Jeder Eintrag muss eine bekannte Rolle sein (isRole aus core/shared/authz).
  roles: z.array(z.string()).max(20).refine(values => values.every(isRole), { message: 'Unknown role' }),
})

/**
 * Rollen eines Users setzen (Mehrfachauswahl, als Appwrite-Labels gespeichert).
 * Ersetzt das frühere { admin: boolean }. Siehe docs/referenz/RBAC-CONCEPT.md.
 *
 * BEWUSST OHNE FRISCHE ANMELDUNG (RA2, 2026-11-08): Rollen setzen und entziehen
 * ist umkehrbar (dieselbe Route setzt sie zurück); gegen das Gefährliche —
 * Selbst-Aussperren, letzter Admin, Eskalation über die eigenen Rechte —
 * stehen die Regeln unten. `requireRecentAuth` gehört an Unumkehrbares.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  const { roles } = await readValidatedBody(event, roleSchema.parse)
  const nextRoles = [...new Set(roles)]

  // Eskalations-Schutz: nur Rollen vergeben, deren Capabilities ⊆ den eigenen sind.
  const actorCaps = capabilitiesFor(actor.labels)
  for (const role of nextRoles) {
    if (!isRole(role)) continue
    for (const cap of ROLE_CAPABILITIES[role]) {
      if (!actorCaps.has(cap)) {
        throw createError({ status: 403, statusText: 'Cannot assign a role beyond your own permissions' })
      }
    }
  }

  const admin = createAdminClient(event)
  const target = await admin.users.get({ userId }).catch((error) => {
    throw toH3Error(error, 'User not found')
  })
  const currentRoles = (target.labels ?? []).filter(isRole)

  const removingAdmin = currentRoles.includes('admin') && !nextRoles.includes('admin')
  // Kein Selbst-Lockout: die eigene Admin-Rolle nicht entziehen
  if (removingAdmin && userId === actor.$id) {
    throw createError({ status: 400, statusText: 'You cannot revoke your own admin role' })
  }
  // Es muss immer mindestens ein Admin übrig bleiben
  if (removingAdmin) {
    await assertNotLastAdmin(event, userId)
  }

  // NUR die Rollen-Labels tauschen — „diese Rollen raus, jene rein" (SEC-024).
  // Bis 2026-11-13 schrieb die Route die GANZE Liste aus dem oben gelesenen
  // Stand zurück; ein Community-Label, das dazwischen vergeben oder entzogen
  // wurde (Beitritt, „Zugang entziehen"), ging dabei verloren bzw. kam zurück.
  // Der EINE Schreiber liest frisch, ändert nur die genannten Labels,
  // serialisiert je Konto und prüft nach.
  const result = await mutateUserLabels(event, userId, {
    remove: ROLES.filter(role => !nextRoles.includes(role)),
    add: nextRoles,
  })
  if (!result.ok) {
    throw result.reason === 'not_found'
      ? createError({ status: 404, statusText: 'User not found' })
      : createError({ status: 502, statusText: 'Roles could not be updated' })
  }

  await recordAudit(event, {
    action: 'user.roles_updated',
    targetType: 'user',
    targetId: userId,
    targetName: target.name,
    metadata: { before: currentRoles, after: nextRoles },
  })

  return { $id: userId, labels: result.labels }
})
