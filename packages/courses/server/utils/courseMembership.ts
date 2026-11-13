import type { H3Event } from 'h3'
import type { CurrentUser } from '../../../core/shared/types/appwrite'
import type { CommunityJoinOutcome } from '../../../core/shared/communityJoin'
import { participationVerdict, type ParticipationVerdict } from '../../../core/shared/communityParticipation'

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

export type CourseJoinVerdict = ParticipationVerdict

/**
 * PURE: Was folgt aus dem Ausgang des Beitritts für das Einschreiben?
 *
 * Seit SEC-030 (2026-11-13) dieselbe Regel wie für jedes Mitmachen — sie liegt
 * im Core (`participationVerdict`), hier steht nur noch der Name, unter dem die
 * Kurs-Tests sie kennen. Keine zweite Kopie: eine Abweichung zwischen „sich
 * einschreiben" und „kommentieren" wäre eine Lücke, die niemand sieht.
 */
export function courseJoinVerdict(outcome: CommunityJoinOutcome): CourseJoinVerdict {
  return participationVerdict(outcome)
}

/**
 * Dasselbe für das EINSCHREIBEN: es ist Mitmachen (A5), also darf es — wie
 * jeder erste eigene Schreibvorgang — in einer offenen Community zum Beitritt
 * führen. Bis SEC-030 stand die Regel hier ausgeschrieben; seitdem gilt sie für
 * alle Produkte und lebt als EINE Wache im Core (`requireCommunityParticipant`:
 * erst Inhalts-Sperre, dann Beitritt, und der AUSGANG zählt).
 */
export async function requireCourseMemberJoining(event: H3Event): Promise<CurrentUser> {
  return requireCommunityParticipant(event)
}
