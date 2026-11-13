import { POSTS_TABLE, type CommunityPost } from '../../shared/types/post'

/**
 * MELDBAR: Beiträge (Moderations-Audit Befund 8, 2026-08-01).
 *
 * posts hat eine Queue (`/dashboard/posts` + `/api/posts/moderation`), also
 * gehört der Typ 'post' in die Registry des moderation-Layers — sonst weist
 * `/api/reports` ihn ab. Umgekehrt gilt dasselbe: WEIL hier registriert wird,
 * ist die Zusage „ein Moderator sieht sich das an" für Beiträge gedeckt.
 *
 * Die Prüfung läuft durch die Datentür über die MITGLIEDER-Klinke (SEC-031,
 * 2026-11-13 — vorher als Operator): meldbar ist, was das Konto LESEN darf.
 * Ein Beitrag aus einer FREMDEN Community, einer ohne Leserecht für dieses
 * Konto (geplant, ausgeblendet) und eine erfundene Id ergeben dieselbe
 * Antwort — vorher unterschied die Melde-Route „gibt es" von „gibt es nicht"
 * auch für Beiträge, die das Konto nie sehen sollte. Was es sieht, kann es
 * weiter melden.
 */
export default defineNitroPlugin(() => {
  registerReportTarget('post', async (event, targetId) => {
    const row = await tenantDb(event)
      .get<CommunityPost>(POSTS_TABLE, targetId, 'Post not found')
      .catch(() => null)
    return !!row
  })
})
