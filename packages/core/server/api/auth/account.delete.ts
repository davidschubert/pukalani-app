import { clearSessionCookie } from '../../lib/appwrite'
import { LAST_ADMIN_CODE } from '../../../shared/lastAdmin'


function isLastAdminRefusal(error: unknown): boolean {
  return (error as { data?: { code?: unknown } } | null)?.data?.code === LAST_ADMIN_CODE
}

/**
 * Eigenen Account VOLLSTÄNDIG löschen (Art. 17 DSGVO) — orchestriert über
 * deleteUserCompletely: Pre-Delete-Snapshot (für Admins, 30 Tage), Sperren,
 * alle UserDataContributors (Kommentare→Tombstone, Votes/Reports/
 * Notifications→Hard-Delete, Audit→Pseudonymisierung), Avatar + Presence,
 * users.delete() als letzter Schritt NUR bei Voll-Erfolg. Unumkehrbar.
 *
 * Deshalb nur mit FRISCHER Anmeldung (RA1, `requireRecentAuth`): vorher
 * genügte ein gültiges Cookie, also auch ein gestohlenes oder ein offener
 * Laptop. Die Prüfung läuft VOR allem anderen — eine Ablehnung hat nichts
 * angefasst, und das Cookie bleibt stehen (der `finally` unten räumt es
 * sonst bei JEDEM Ausgang ab).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const userId = event.context.user.$id
  // Der letzte aktive Admin löscht sich nicht (lastAdmin.ts) — VOR der
  // frischen Anmeldung: den fachlichen Grund braucht niemand erst nach einem
  // neuen Login zu erfahren (wie die Betreiber-Route). Verbindlich prüft
  // `deleteUserCompletely` unter der Sperre noch einmal.
  if (isActiveAdmin(event.context.user)) await assertNotLastAdmin(event, userId)

  await requireRecentAuth(event)

  let result: Awaited<ReturnType<typeof deleteUserCompletely>>
  let refused = false
  try {
    result = await deleteUserCompletely(event, userId, { actor: 'self' })
  }
  catch (error) {
    // Letzter aktiver Admin (unter der Sperre erkannt): nichts gelöscht,
    // nichts gesperrt — der fachliche Grund geht unverändert hinaus.
    if (isLastAdminRefusal(error)) {
      refused = true
      throw error
    }
    // z. B. Snapshot fehlgeschlagen → es wurde noch NICHTS gelöscht
    console.error('[gdpr] Self-Delete fehlgeschlagen (vor Cleanup):', error)
    throw createError({ status: 500, statusText: 'Account deletion failed' })
  }
  finally {
    // Session ist durch das Sperren ohnehin tot — Cookie entfernen. Nur die
    // Ablehnung „letzter Admin" hat NICHT gesperrt: dort bleibt die Sitzung.
    if (!refused) clearSessionCookie(event)
  }

  if (!result.ok) {
    // Keine Interna an den (Ex-)User leaken (E7) — Details stehen im Log;
    // der Account ist gesperrt, ein Admin-Re-Run räumt den Rest ab.
    console.error('[gdpr] Self-Delete Teilfehler — Account gesperrt, Re-Run nötig:', JSON.stringify(result.results))
    throw createError({ status: 500, statusText: 'Account deletion failed' })
  }

  return { ok: true }
})
