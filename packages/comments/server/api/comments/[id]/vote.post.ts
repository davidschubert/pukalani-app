import { AppwriteException, Permission, Query, Role } from 'node-appwrite'
import { LIKE_LIMIT_REACHED } from '../../../../../core/shared/likeAllowance'
import { upvoteDelta, type UpvoteState } from '../../../../../core/shared/upvoteDelta'
import { toVoteCounts } from '../../../../../core/shared/voteCounts'
import { voteSchema } from '../../../../schemas/comment'
import {
  COMMENTS_TABLE,
  VOTES_TABLE,
  type Comment,
  type CommentVote,
  type VoteResponse,
  type VoteValue,
} from '../../../../shared/types/comment'

/**
 * Vote mit Toggle-Semantik (Spec):
 *   kein Vote      → anlegen
 *   gleicher Value → Vote ENTFERNEN (Toggle)
 *   anderer Value  → umdrehen
 *
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab).
 * Danach werden upvotes/downvotes/score aus den ECHTEN Vote-Counts (AdminClient,
 * sieht alle Rows) neu berechnet und in EINEM updateRow auf den Kommentar
 * geschrieben:
 *  - genau EIN Realtime-Event statt zwei → kein Zähler-Flackern im UI,
 *  - Zähler immer autoritativ → kein Increment-Drift bei parallelen/Doppel-Votes.
 */
export default defineEventHandler(async (event): Promise<VoteResponse> => {
  // SEC-030: ein Pool-Konto ist auf jedem Community-Host angemeldet — wer hier
  // mitmacht, muss dazugehören. Offene Registrierung: dieser Schritt IST der
  // Beitritt (A5); geschlossen oder entzogen: 403 `not_a_member`. 401 ohne Konto.
  const user = await requireCommunityParticipant(event)

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  await assertCommentsWritable(event)

  const { value } = await readValidatedBody(event, voteSchema.parse)
  // Zwei Türklinken, ein Vorgang: die eigene Stimme schreibt der User selbst
  // (Session), die autoritativen Zähler liest und schreibt der Betreiber-Weg
  // (Admin sieht ALLE Stimmen). Gescopt wird bei beiden gleich.
  //
  // WER HANDELT (F17): `ops` bekommt bewusst KEIN `actor`. Die HANDLUNG des
  // Menschen ist die Stimme, und die geht über `db` (Mitglieds-Klinke, also
  // Inhalts-Sperre M13 und Beitritt A5). Was `ops` danach schreibt, ist die
  // Summe ALLER Stimmen auf einer fremden Zeile — eine Ableitung, kein zweiter
  // Schreibvorgang derselben Person. Ist die Community gesperrt, scheitert
  // schon `db` und der Recount ist nie erreicht.
  const db = tenantDb(event)
  const ops = tenantDb(event, { as: 'operator' })

  // Status prüfen: auf gelöschte/ausgeblendete Kommentare darf nicht gevotet
  // werden (UI blockt nur clientseitig). Sonst ließen sich Vote-Rows + Score
  // eines [gelöscht]-Platzhalters per direktem Request manipulieren.
  // `get` der Tür weist zugleich Stimmen auf fremde Mandanten ab.
  //
  // ÜBER DIE MITGLIEDER-KLINKE (SEC-031, 2026-11-13): gelesen wird, wie das
  // Konto liest — ein ausgeblendeter Kommentar trägt kein Leserecht mehr und
  // ergibt dasselbe 404 wie eine erfundene Id. Erst danach zählt und schreibt
  // `ops`. Vorher las die Route gleich als Operator, und ein 409 „nicht
  // stimmbar" bestätigte einen Kommentar, den das Konto nie sehen sollte.
  const target = await db.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (target.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not votable' })
  }

  const current = await db.find<CommentVote>(VOTES_TABLE, [
    Query.equal('commentId', commentId),
    Query.equal('userId', user.$id),
  ])

  /**
   * DAS TAGES-LIMIT FÜR LIKES (F57 Mechanik 3, Davids Entscheidung 2026-08-14).
   *
   * VOR dem Schreiben, und NUR für ein Like, das gerade neu vergeben wird. Der
   * beabsichtigte Folgezustand ergibt sich aus der Umschalt-Semantik (gleicher
   * Wert = weg); ob das ein Like IST, beantwortet `upvoteDelta` — dieselbe
   * Rechnung, die unten den Zähler bewegt, damit „was ist ein Like" hier und
   * dort dasselbe heißt. Abstimmen und Rücknahmen kosten also nichts; eine
   * Rücknahme erstattet aber auch nichts (sonst wäre das Limit ein Toggle
   * entfernt).
   *
   * DIE ZEILE, DIE DEN STAND HÄLT, GEHÖRT EINEM ANDEREN LAYER — gefragt wird
   * deshalb über den Core-Vertrag, nicht bei `posts` (A14). In einer App ohne
   * Discussions ist der Vertrag unbesetzt und es gibt kein Limit.
   */
  const previousVote: UpvoteState = current?.value === 1 ? 1 : current?.value === -1 ? -1 : null
  const intendedVote: UpvoteState = previousVote === value ? null : value
  if (upvoteDelta(previousVote, intendedVote) === 1) {
    const allowance = await spendLikeAllowance(event, user.$id)
    if (!allowance.ok) {
      throw createError({
        status: 429,
        statusText: 'Like limit reached',
        data: { code: LIKE_LIMIT_REACHED },
      })
    }
  }

  if (current && current.value === value) {
    // Toggle: Vote entfernen
    await db.remove(VOTES_TABLE, current.$id, 'Vote not found')
  }
  else if (current) {
    // Umdrehen
    await db.update<CommentVote>(VOTES_TABLE, current.$id, { value }, 'Vote not found')
  }
  else {
    // Neuer Vote. Bei Doppelklick können zwei Requests parallel hier landen — der
    // Unique-Index (commentId,userId) lässt nur einen durch; der 409 des zweiten
    // ist kein Fehler (Counts + myVote werden unten autoritativ neu gelesen).
    try {
      await db.create<CommentVote>(VOTES_TABLE, { commentId, userId: user.$id, value }, {
        // Die eigene Stimme sieht NUR der Stimmende (Lehre comment_votes):
        // die Liste liefert die API aggregiert, nicht die Rohzeilen.
        permissions: [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      })
    }
    catch (error) {
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
    }
  }

  // Zähler UND eigenen Vote autoritativ aus den echten Votes ableiten (AdminClient
  // sieht alle Rows) und upvotes/downvotes/score in EINEM Write setzen → genau ein
  // Realtime-Event. myVote aus der DB statt aus dem Write-Pfad: bei Doppelklick
  // (Toggle/Flip parallel) gewinnt sonst eine Race und myVote weicht vom Count ab.
  // Recount+Write pro Kommentar serialisiert (voteLock): parallele Votes
  // verschiedener User können sonst einen Write auf VERALTETEM Recount
  // hinterlassen (Lost Update — Zähler driften bis zum nächsten Vote).
  return await serializePerComment(commentId, async (): Promise<VoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      ops.count(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('value', 1)]),
      ops.count(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('value', -1)]),
      ops.find<CommentVote>(VOTES_TABLE, [Query.equal('commentId', commentId), Query.equal('userId', user.$id)]),
    ])
    const myVote: VoteValue | null = mine?.value === -1 ? -1 : mine ? 1 : null

    const comment = await ops.update<Comment>(
      COMMENTS_TABLE,
      commentId,
      { upvotes, downvotes, score: upvotes - downvotes },
      'Comment not found',
    )

    /**
     * MITSCHREIBENDE ZÄHLER (F1): eine Stimme bewegt ZWEI Menschen — den
     * Gebenden und den Autor. Die Vorzeichen-Regel ist pur und geteilt
     * (`core/shared/upvoteDelta.ts`); dieser Layer weiß weiterhin nicht, dass
     * es Beiträge gibt (A14), er nennt eine Ereignis-Art.
     *
     * Gerechnet wird ZUSTAND VORHER gegen ZUSTAND NACHHER: `myVote` ist
     * autoritativ aus der Datenbank gelesen, `current` der Stand von vorher.
     * Nur Aufstimmen zählen — Abstimmen sind abzeichen-neutral.
     *
     * GAST-KOMMENTARE fallen von selbst heraus: sie tragen `authorId: ''`, und
     * ohne Konto gibt es niemanden, dem etwas gutzuschreiben wäre.
     */
    // `previousVote` ist der Stand von VORHER — dieselbe Einengung, die schon
    // das Tages-Limit oben gebraucht hat, und deshalb bewusst nicht ein zweites
    // Mal hingeschrieben: zwei Namen für denselben Zustand laufen beim nächsten
    // Sonderfall auseinander. Sie ist keine Formalie — `CommentVote.value` ist
    // ein loser `number` (die Spalte ist ein Integer), und sie macht aus einem
    // versehentlichen 0 oder 7 ein „keine Aufstimme" statt eines Typfehlers zur
    // Laufzeit.
    const delta = upvoteDelta(previousVote, myVote)
    if (delta !== 0) {
      await recordUserCounterEvents(event, [
        { userId: user.$id, kind: 'upvotesGiven', delta },
        ...(target.authorId ? [{ userId: target.authorId, kind: 'upvotesReceived' as const, delta }] : []),
      ])
    }

    /**
     * „DIESE ANTWORT HAT JETZT SO VIELE STIMMEN" (F1 Teilpaket 2, Core-Vertrag
     * `reportContentUpvotes`). Wer daraus ein Abzeichen macht, ist der Layer mit
     * dem Katalog — dieser hier nennt eine FORM („eine Antwort") und zwei
     * Zahlen, keinen Nachbarn (A14). Ohne Empfänger (Silo ohne Discussions)
     * verpufft die Meldung.
     *
     * Gast-Kommentare fallen von selbst heraus: sie tragen `authorId: ''`, und
     * der Vertrag verwirft eine Meldung ohne Empfänger.
     */
    await reportContentUpvotes(event, {
      authorId: target.authorId,
      contentId: commentId,
      kind: 'reply',
      upvotes,
      previousUpvotes: target.upvotes,
    })

    // NUR die Zähler (SEC-031): die frisch geschriebene Zeile kam über die
    // Operator-Klinke; der Store übernimmt die Zähler in seine eigene Zeile.
    return { comment: toVoteCounts(comment), myVote }
  })
})
