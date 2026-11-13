import type { H3Event } from 'h3'
import type { CurrentUser } from '../../../core/shared/types/appwrite'
import {
  joinOutcomeGrantsAccess,
  joinOutcomeRevokesAccess,
  type CommunityJoinOutcome,
} from '../../../core/shared/communityJoin'
import { COMMUNITY_SUSPENDED_CODE, memberWritesAllowedFor } from '../../../core/shared/communitySuspension'
import { COURSE_NOT_A_MEMBER_CODE } from '../../shared/types/course'

/**
 * WER DARF MEHR ALS DIE VORSCHAU? (SEC-029, Davids Entscheidung 2026-11-12)
 *
 * Übersicht und Vorschau sind öffentlich. Lektions-Inhalt, Einschreiben,
 * Fortschritt und Übersetzen gehören angemeldeten MITGLIEDERN dieser
 * Community. Kurs-Zeilen tragen kein Leserecht, die Routen lesen über die
 * Operator-Klinke — diese Wache ist deshalb die Grenze und steht in jeder
 * Mitglieder-Route VOR dem ersten Datenbankzugriff: so ist die Antwort für
 * vorhandene und nicht vorhandene Ids dieselbe.
 */
export async function requireCourseMember(event: H3Event): Promise<CurrentUser> {
  return requireCommunityMembership(event)
}

export type CourseJoinVerdict = 'allow' | 'deny' | 'ask-membership'

/**
 * PURE: Was folgt aus dem Ausgang des Beitritts für das Einschreiben?
 *
 * Gewährt ⇒ durch, auch wenn der Mitgliedschafts-Cache (30 s, Labels am
 * Request) das frische Mitglied noch nicht kennt — hier zählt der Ausgang.
 * Verweigert/entzogen ⇒ abweisen. `unavailable` (Silo, kein Handler, Störung
 * der Naht) sagt nichts über die Person ⇒ die Mitgliedschaft entscheidet,
 * im Pool fail-closed.
 */
export function courseJoinVerdict(outcome: CommunityJoinOutcome): CourseJoinVerdict {
  if (joinOutcomeGrantsAccess(outcome)) return 'allow'
  if (joinOutcomeRevokesAccess(outcome)) return 'deny'
  return 'ask-membership'
}

/**
 * Dasselbe für das EINSCHREIBEN: es ist Mitmachen (A5), also darf es — wie
 * jeder erste eigene Schreibvorgang — in einer offenen Community zum Beitritt
 * führen. Die Inhalts-Sperre (M13) kommt ZUERST, wie in der Datentür: ein
 * Versuch in einer gesperrten Community macht niemanden zum Mitglied.
 */
export async function requireCourseMemberJoining(event: H3Event): Promise<CurrentUser> {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  if (!memberWritesAllowedFor(useTenant(event))) {
    throw createError({
      status: 403,
      statusText: 'Community is read-only',
      data: { code: COMMUNITY_SUSPENDED_CODE },
    })
  }

  const verdict = courseJoinVerdict(await joinCommunity(event, 'contribution'))
  if (verdict === 'allow') return user
  if (verdict === 'deny') {
    throw createError({ status: 403, statusText: 'Not a member', data: { code: COURSE_NOT_A_MEMBER_CODE } })
  }
  return requireCommunityMembership(event)
}
