import type { AccountDeletionCheck, AccountDeletionWarning } from '../../../../shared/accountDeletion'
import { isActiveAdmin, lastAdminDeps, otherActiveAdminExists } from '../../../utils/lastAdmin'
import { softFail } from '../../../utils/softFail'
import { listUserDataContributors } from '../../../utils/userData'

/**
 * WAS VOR DEM LÖSCHEN DES EIGENEN KONTOS ZU SAGEN IST (2026-11-23,
 * `shared/accountDeletion.ts`): die Karte „Konto löschen" fragt das, bevor
 * jemand den Knopf drückt.
 *
 * NUR DAS EIGENE KONTO: die Konto-Id kommt aus der Sitzung, nie aus der
 * Anfrage. Nur lesen. Eine Störung bei einer der Fragen macht die Antwort
 * nicht falsch, sondern `incomplete: true` — die Löschung selbst prüft den
 * letzten Admin unter der Projekt-Sperre noch einmal (`withLastAdminGuard`).
 * Diese Antwort ist nur die freundliche Vorab-Auskunft für die Karte.
 */
export default defineEventHandler(async (event): Promise<AccountDeletionCheck> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const userId = event.context.user.$id
  let incomplete = false

  // Nur ein aktiver Admin kann „der letzte" sein — alle anderen fragen gar nicht.
  const lastAdmin = isActiveAdmin(event.context.user)
    ? await otherActiveAdminExists(lastAdminDeps(event).users, userId)
      .then(other => !other)
      .catch(softFail('core:api/auth/account/deletion-check:otherActiveAdminExists', null))
    : false
  if (lastAdmin === null) incomplete = true

  const warnings: AccountDeletionWarning[] = []
  for (const contributor of listUserDataContributors()) {
    if (!contributor.deletionWarnings) continue
    const found = await contributor.deletionWarnings(event, userId)
      .catch(softFail('core:api/auth/account/deletion-check:deletionWarnings', null))
    if (found === null) {
      incomplete = true
      continue
    }
    warnings.push(...found.filter(warning => warning.items.length > 0))
  }

  return { lastAdmin: lastAdmin === true, warnings, incomplete }
})
