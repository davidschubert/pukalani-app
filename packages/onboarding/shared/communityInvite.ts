import type { MemberInviteQuotaView } from '../../control/shared/communityInviteQuota'

/**
 * Was `POST /api/community/members` dem BROWSER antwortet.
 *
 * Zwei Dinge, die diesen Typ zu mehr als einer Formalie machen (AU1,
 * 2026-08-15):
 *
 *  1. **`delivered` steht hier NICHT.** Das Control Plane meldet mit diesem
 *     Feld, ob wirklich etwas verschickt wurde — für den stillen Fall, in dem
 *     die eingeladene Adresse längst Mitglied ist und ein Nicht-Team-Mitglied
 *     das nicht erfahren soll (`decideInviteDelivery`). Die Naht liest es und
 *     schneidet es ab; stünde es hier, wäre das Mitgliedschafts-Orakel nur
 *     eine Ebene höher gewandert. Der Typ ist damit der Wächter: wer das Feld
 *     durchreichen will, muss ihn zuerst ändern.
 *  2. **`quota` ist die VOLLE Anzeige** (`MemberInviteQuotaView`), nicht mehr
 *     ein Vier-Felder-Auszug. Die Oberfläche schreibt die Antwort direkt in
 *     ihren Kontingent-Zustand fort; mit dem Auszug fehlten dort danach
 *     `enabled`/`reason`, und der Einladen-Knopf verschwand bis zum nächsten
 *     Seitenaufbau.
 */
export interface CommunityInviteResponse {
  ok: boolean
  inviteId: string
  email: string
  role: string
  expiresAt: string
  quota: MemberInviteQuotaView
  // Bewusst KEIN `existingAccount` mehr (SEC-028, 2026-11-15): ob es zur
  // eingeladenen Adresse ein Konto gibt, ist eine Auskunft über eine fremde
  // Person. Die Route nutzt sie intern (Glocken-Meldung), die Antwort trägt sie
  // nicht — wer das Feld zurückbringen will, muss diesen Typ ändern.
}
