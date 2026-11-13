import { z } from 'zod'
import { callControlPlane, mintRuntimeJwt } from '../../../utils/controlPlane'

/**
 * Einladung annehmen — der Klick der eingeladenen Person (nicht des Betreibers).
 *
 * Deshalb bewusst OHNE Site-Rollen-Gate: hier ENTSTEHT die Mitgliedschaft, ein
 * `requireCommunityPermission` würde sich selbst den Weg versperren. Was bleibt:
 * Login-Pflicht, Mandanten-Kontext und die Adressprüfung im Control Plane
 * (weitergeleitete Links binden nicht den falschen Account).
 *
 * Entweder `token` (aus dem Mail-Link) oder `inviteId` (aus der eigenen
 * Einladungs-Liste) — nie beides.
 */
const bodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  inviteId: z.string().min(1).max(36).optional(),
}).strict().refine(body => Boolean(body.token) !== Boolean(body.inviteId), {
  message: 'Either token or inviteId',
})

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const jwt = await mintRuntimeJwt(event)

  const result = await callControlPlane<{ ok: boolean, communityId: string, host: string, role: string, invitedBy: string }>(
    event,
    '/api/control/community/members/accept',
    { jwt, ...(body.token ? { token: body.token } : { inviteId: body.inviteId }) },
  )

  /**
   * Das Lese-Publikum SOFORT, nicht erst in 30 Sekunden (A5).
   *
   * Die Label-Middleware würde es beim nächsten Request auch vergeben — aber
   * erst, wenn der Rollen-Resolver die neue Mitgliedschaft sieht, und der hat für
   * diesen Nutzer gerade „keine Rolle" gecacht (30 s). Für die annehmende Person
   * wäre das eine halbe Minute, in der sie drin ist und trotzdem niemanden sieht:
   * kein Anwesender, kein Activity-Feed. Ein Klick, der wirkt, muss wirken.
   *
   * Nur wenn die Einladung zu DIESER Community gehört: `communityId` kommt aus der
   * Einladung (nie aus dem Body), ein Link für eine andere Community darf hier
   * kein Label setzen.
   */
  if (result.communityId === tenant.communityId) {
    // Rückkehr nach einem Entzug: die „gerade entzogen"-Notiz muss weg, sonst
    // zieht die Label-Middleware das Publikum bis zu einer Minute lang wieder ab
    // (siehe rememberCommunityAccessRevoked).
    const userId = event.context.user?.$id
    if (userId) {
      forgetCommunityAccessDecision(result.communityId, userId)
      // …und die Sperre für Entfernte sofort lösen (SEC-030 Teil 2): der
      // Cache „ehemalig" sagt sonst bis zu 60 s weiter „ja", und die gerade
      // zurückgeholte Person stünde wieder vor der Hinweisseite.
      rememberCommunityAccessRestored(result.communityId, userId)
    }
    await grantCommunityLabel(event, result.communityId)

    /**
     * DAS ABZEICHEN „PROMOTER" (F57 Mechanik 2): gutgeschrieben wird dem
     * EINLADENDEN, und zwar hier — in der Runtime, wo `member_counters` liegt
     * und wo `recordUserCounterEvents` einen Mandanten-Kontext hat.
     *
     * GEZÄHLT WIRD DIE ANNAHME, NICHT DER VERSAND. Genau deshalb steht diese
     * Zeile hier und nicht in der Einladungs-Route: hundert verschickte
     * Einladungen sind keine Leistung, eine angenommene ist eine.
     *
     * GENAU EINMAL, ohne dass hier etwas dafür getan wird: eine Einladung geht
     * nur ein einziges Mal von `pending` nach `accepted` (das Control Plane
     * lehnt jede weitere ab), also kann dieser Punkt für dieselbe Einladung
     * kein zweites Mal erreicht werden. Darüber liegen zusätzlich die drei
     * bestehenden Netze der Verleihung (Zähler-Kreuzung, Unique-Index auf
     * `user_badges`, Idempotenz-Schlüssel der Meldung).
     *
     * DREI GRÜNDE ZUM AUSSTEIGEN, alle mit Absicht:
     *  - kein `invitedBy` — Einladung aus der Zeit vor control-019.
     *  - `invitedBy === userId` — jemand hat seine eigene Einladung
     *    angenommen. Heute unerreichbar (`decideInvite` lehnt bestehende
     *    Mitglieder ab), aber ein Abzeichen, das man sich selbst schicken
     *    kann, ist keines.
     *  - Der Aufruf ist FAIL-SOFT wie jede Zähl-Buchung: eine Feier darf eine
     *    Mitgliedschaft nicht kosten. `recordUserCounterEvents` wirft nicht;
     *    das `catch` ist der Gürtel dazu.
     */
    if (result.invitedBy && result.invitedBy !== userId) {
      await recordUserCounterEvents(event, [
        { userId: result.invitedBy, kind: 'invitesAccepted', delta: 1 },
      ]).catch(() => {})

      /**
       * UND DIE ZUORDNUNG SELBST FESTHALTEN (F57-Stufen): `invitedBy` wandert
       * an die Zähler-Zeile DES EINGELADENEN.
       *
       * WARUM HIER UND NICHT SPÄTER: `campaigner`/`champion` hängen laut
       * Katalog an der Vertrauensstufe der Eingeladenen — ein Ereignis, das
       * Wochen später in einer fremden Zeile entsteht. Wüsste der Aufstieg
       * nicht, wer diesen Menschen hergeholt hat, müsste er das Control Plane
       * fragen: eine Naht über die Projektgrenze, in einem Schreibpfad, für
       * eine Antwort, die sich nie ändert. Der Stempel kostet EINEN
       * Schreibvorgang, EINMAL im Leben dieser Mitgliedschaft.
       *
       * Dieselbe Zeile deckt beide Abzeichen-Familien: `invitesAccepted` zählt
       * die ANNAHME (Promoter), `invitedBy` merkt sich, wem die späteren
       * Aufstiege gutgeschrieben werden.
       */
      await recordCommunityInviter(event, { userId: userId ?? '', inviterId: result.invitedBy })
    }
  }

  return result
})
