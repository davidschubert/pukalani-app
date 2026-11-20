import { handleChangeAvailableAt, mayChangeHandleAt } from '../../../shared/handles'
import type { AccountHandleResponse } from '../../../shared/types/handle'
import { activeAccountHandleRow, ensureAccountHandle, ensureAccountHandleAudience } from '../../utils/accountHandles'
import { softFail } from '../../utils/softFail'

/**
 * „Wie heisse ich?" — und zugleich die VERGABE (AH-7, 2026-08-11).
 *
 * Ablöser von `GET /api/handles/me`, das den Namen JE COMMUNITY verwaltete.
 * Seit Davids Entscheidung vom 2026-08-11 gibt es genau einen je Konto, und
 * damit gehört die Route unter `/api/account/` — dorthin, wo auch
 * `/api/account/activity` liegt: Dinge, die dem Menschen gehören und nicht
 * einer seiner Communities.
 *
 * ── WARUM DIE VERGABE IN EINER LESE-ROUTE STECKT ──────────────────────────
 * Aus demselben Grund wie vorher: es gibt kein Migrations-Skript, das
 * Anzeigenamen aus Appwrite `users` durchblättert und daraus Vorschläge macht.
 * Vergeben wird deshalb dort, wo ein angemeldeter Mensch und sein Anzeigename
 * zusammenkommen — beim ersten Hinsehen. Idempotent, wirft nie.
 *
 * ── UND WARUM SIE DIESMAL OHNE MITGLIEDER-WACHE AUSKOMMT ──────────────────
 * H1 (2026-08-05) musste die Vorgänger-Route bewachen, weil sie beim Hinsehen
 * einen Namen IN EINER FREMDEN COMMUNITY belegte: ein Konto konnte sich so
 * durch den ganzen Pool arbeiten und überall `@vorstand` wegschnappen. Im
 * globalen Register kann ein Konto genau EINEN Namen halten — der Angriff ist
 * nicht abgesichert, sondern nicht mehr formulierbar. Und die Route MUSS ohne
 * Community auskommen: ihr Hauptwohnsitz ist `/profile` auf
 * account.pukalani.app, wo es keine gibt.
 *
 * Die andere Hälfte von H1 bleibt: SICHTBAR wird der Name nur dort, wo der
 * Mensch dazugehört. Deshalb der zweite, an die Zugehörigkeit gebundene
 * Schritt (`ensureAccountHandleAudience`) — auf einem Community-Host trägt er
 * die Lese-Rolle dieser Community nach, damit das Erwähnungs-Menü den Menschen
 * kennt, ohne dass er erst etwas schreiben muss.
 */
export default defineEventHandler(async (event): Promise<AccountHandleResponse> => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  await ensureAccountHandle(event, user.$id, user.name)

  // Nur für Mitglieder — und fail-soft: die Zugehörigkeits-Frage wirft
  // (fail-closed by design), diese Auskunft soll daran nicht sterben.
  if (await resolveCommunityMembership(event).catch(softFail('core:api/account/handle.get:resolveCommunityMembership', false))) {
    await ensureAccountHandleAudience(event, user.$id)
  }

  const row = await activeAccountHandleRow(event, user.$id)

  return {
    handle: row?.handle ?? null,
    changedAt: row?.changedAt || null,
    canChange: mayChangeHandleAt(row?.changedAt || null),
    /** Millisekunden-Zeitstempel oder null („jederzeit"). */
    availableAt: handleChangeAvailableAt(row?.changedAt || null),
  }
})
