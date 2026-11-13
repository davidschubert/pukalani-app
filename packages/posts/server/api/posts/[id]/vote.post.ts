import { Permission, Query, Role } from 'node-appwrite'
import { voteSchema } from '../../../../schemas/post'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost, type PollVote } from '../../../../shared/types/post'

/**
 * Poll-Stimme: setzen, wechseln oder (gleiche Option erneut) zurückziehen —
 * server-autoritativ über den Admin-Client (poll_votes haben bewusst keine
 * User-Schreibrechte). Gesperrt nach pollEndsAt. Antwort = frischer
 * Poll-Zustand (Ergebnisse sichtbar, solange die eigene Stimme steht).
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  // SEC-030: ein Pool-Konto ist auf jedem Community-Host angemeldet — wer hier
  // mitmacht, muss dazugehören. Offene Registrierung: dieser Schritt IST der
  // Beitritt (A5); geschlossen oder entzogen: 403 `not_a_member`. 401 ohne Konto.
  const user = await requireCommunityParticipant(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Wartungsmodus friert ALLE Schreibvorgänge ein — die Schwester-Route
  // [id]/score.post.ts (Up-/Downvote) prüft das seit jeher, die Poll-Stimme
  // hier nicht. Beide schreiben, beide gehören still.
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const { optionIndex } = await readValidatedBody(event, voteSchema.parse)
  // Datentür als Operator (poll_votes haben bewusst keine User-Schreibrechte;
  // create stempelt den Mandanten, get/list belegen die Zugehörigkeit).
  // `actor: 'member'` (Audit-Befund 2026-08-01): die Klinke ist Technik, an einer
  // Umfrage teilgenommen hat ein Mitglied. Die M13-Sperre nennt „Umfragen"
  // ausdrücklich — über die Klinke lief die Stimme still daran vorbei.
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  /**
   * ERST LESEN, WIE DAS KONTO LIEST (SEC-031, 2026-11-13): die Umfrage über
   * die Mitglieder-Klinke (Session-Client, Leserecht der Zeile) holen, BEVOR
   * die Operator-Klinke irgendetwas liest oder schreibt. Wer den Beitrag nicht
   * lesen darf, bekommt dasselbe 404 wie für eine erfundene Id — vorher
   * verrieten 409 „Not an open poll" und die Antwort mit Optionen und
   * Zwischenstand eine Umfrage, die das Konto nie sehen sollte.
   */
  const post = await tenantDb(event).get<CommunityPost>(POSTS_TABLE, id, 'Post not found')
  if (post.type !== 'poll' || post.status !== 'published') {
    throw createError({ status: 409, statusText: 'Not an open poll' })
  }
  if (post.pollEndsAt && Date.parse(post.pollEndsAt) <= Date.now()) {
    throw createError({ status: 409, statusText: 'Poll has ended' })
  }
  const options = parsePollOptions(post)
  if (optionIndex >= options.length) {
    throw createError({ status: 422, statusText: 'Unknown option' })
  }

  const current = await db.find<PollVote>(POLL_VOTES_TABLE, [
    Query.equal('postId', id),
    Query.equal('userId', user.$id),
  ])

  if (current && current.optionIndex === optionIndex) {
    // Toggle: gleiche Option erneut = Stimme zurückziehen
    await db.remove(POLL_VOTES_TABLE, current.$id)
  }
  else if (current) {
    await db.update(POLL_VOTES_TABLE, current.$id, { optionIndex })
  }
  else {
    await db.create(POLL_VOTES_TABLE, {
      postId: id,
      userId: user.$id,
      optionIndex,
    }, {
      // eigene Stimme lesbar (Debug/Export) — mehr nicht
      permissions: [Permission.read(Role.user(user.$id))],
    }).catch(async (error) => {
      // Unique-Index-Race (Doppelklick/zwei Tabs): der Gewinner steht — dessen
      // Row auf die gewünschte Option ziehen statt 409 zu leaken
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
        const winner = await db.find<PollVote>(POLL_VOTES_TABLE, [
          Query.equal('postId', id),
          Query.equal('userId', user.$id),
        ])
        if (winner && winner.optionIndex !== optionIndex) {
          await db.update(POLL_VOTES_TABLE, winner.$id, { optionIndex })
        }
        return
      }
      throw toH3Error(error, 'Could not vote')
    })
  }

  // Frischen Zustand zurückgeben — die UI ersetzt ihren Poll-State atomar.
  // Nur der Umfrage-Zustand (Optionen, Zähler, eigene Stimme), nie der
  // Beitrag; sichtbar ist er erst NACH der Lese-Prüfung oben (SEC-031).
  const states = await pollStatesFor(event, [post], user.$id)
  return { poll: states.get(post.$id) }
})
