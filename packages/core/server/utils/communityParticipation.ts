import type { H3Event } from 'h3'
import type { CurrentUser } from '../../shared/types/appwrite'
import { COMMUNITY_NOT_A_MEMBER_CODE, participationVerdict } from '../../shared/communityParticipation'
import { COMMUNITY_SUSPENDED_CODE, memberWritesAllowedFor } from '../../shared/communitySuspension'

/**
 * DIE WACHE FÜR MITMACHEN (SEC-030, seit 2026-11-13).
 *
 * Für jede Route, deren Schreibvorgang ein erster eigener Beitrag sein kann:
 * Beitrag, Kommentar, Stimme, Reaktion, Zusage, Einschreiben, Melden. Sie steht
 * VOR dem ersten Datenbankzugriff, damit die Antwort für vorhandene und nicht
 * vorhandene Ids dieselbe ist und ein Fremder nichts hinterlässt.
 *
 * Reihenfolge, und jede Zeile hat einen Grund:
 *  1. Kein Konto ⇒ 401.
 *  2. Inhalts-Sperre (M13) ⇒ 403 `community_suspended` — VOR dem Beitritt, wie
 *     in der Datentür: ein Versuch in einer gesperrten Community macht niemanden
 *     zum Mitglied.
 *  3. Beitritt fragen (`joinCommunity('contribution')`) und den AUSGANG werten
 *     (`participationVerdict`): gewährt ⇒ durch; geschlossen/entzogen ⇒ 403
 *     `not_a_member`; keine Aussage ⇒ die Mitgliedschaft entscheidet (Pool
 *     fail-closed, Silo/Kontroll-Host durch).
 *
 * Die Datentür fragt beim Anlegen noch einmal — als Netz hinter vergessenen
 * Routen. Doppelt kostet das nichts: `joinCommunity` merkt sich den Ausgang je
 * Request.
 *
 * WAS NICHT HIERHER GEHÖRT: Schreibvorgänge, die KEIN Beitritt sein dürfen —
 * eigenes Bearbeiten/Löschen, Zurückziehen, Übersetzen, Einstellungen. Die
 * verlangen nur die Mitgliedschaft: `requireCommunityMembership(event)`.
 */

export interface CommunityParticipantOptions {
  /**
   * Die Route bleibt in einer GESPERRTEN Community offen (M13) — heute nur das
   * Melden. Melden ist Moderation, kein Inhalt: wer in einer Community mit
   * Zahlungsverzug einen Übergriff sieht, soll ihn weiter melden können,
   * sonst nähme die Mahnung der Community ihren Schutz. Dann gibt es keine
   * Sperr-Ablehnung — aber auch KEINEN Beitritt (die Sperre friert ein, sie
   * lässt niemanden herein), sondern nur die Frage nach der Mitgliedschaft.
   */
  openDuringSuspension?: boolean
}

export async function requireCommunityParticipant(
  event: H3Event,
  options: CommunityParticipantOptions = {},
): Promise<CurrentUser> {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  if (!memberWritesAllowedFor(useTenant(event))) {
    if (options.openDuringSuspension) return requireCommunityMembership(event)
    throw createError({
      status: 403,
      statusText: 'Community is read-only',
      data: { code: COMMUNITY_SUSPENDED_CODE },
    })
  }

  const verdict = participationVerdict(await joinCommunity(event, 'contribution'))
  if (verdict === 'allow') return user
  if (verdict === 'deny') {
    throw createError({ status: 403, statusText: 'Not a member', data: { code: COMMUNITY_NOT_A_MEMBER_CODE } })
  }
  return requireCommunityMembership(event)
}
