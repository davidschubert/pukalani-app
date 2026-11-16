import { AppwriteException, Permission, Query, Role } from 'node-appwrite'
import { eventVoteSchema } from '../../../../schemas/event'
import { toVoteCounts } from '../../../../../core/shared/voteCounts'
import { eventIsPubliclyVisible } from '../../../../shared/eventModerationPolicy'
import { EVENT_VOTES_TABLE, EVENTS_TABLE, type EventRow, type EventVote, type EventVoteResponse, type EventVoteValue } from '../../../../shared/types/event'

/**
 * Up-/Downvote auf ein Event — Toggle-Semantik (Muster posts/score):
 *   kein Vote → anlegen · gleicher Value → entfernen · anderer → umdrehen.
 * Drei Türen: `db` LIEST, wie das Konto liest (Mitglieder-Klinke); `writer`
 * schreibt die eigene Stimme; `ops` zählt neu und schreibt die Zähler auf die
 * Event-Zeile; serialisiert pro Event gegen Lost Updates. Der Unique-Index
 * (eventId, userId) sichert gegen Doppelklicks ab.
 *
 * DIE STIMME SCHREIBT DER SERVER (SEC-002, GA1 P13): `writer` ist die
 * Operator-Klinke mit `actor: 'member'` — gehandelt hat das Mitglied, also
 * greifen Inhalts-Sperre (M13) und Beitritt (A5) wie bisher. Wer darf, prüft
 * die Route selbst, VOR dem Schreiben: die Wache (Zugehörigkeit) und die
 * Suche nach der EIGENEN Stimme (`userId` = Konto).
 *
 * WER HANDELT (F17): `ops` bekommt bewusst KEIN `actor` — der Zähler ist eine
 * Ableitung aus ALLEN Stimmen (Muster comments/vote). Deshalb NICHT `ops` für
 * die Stimme.
 */
export default defineEventHandler(async (event): Promise<EventVoteResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  // SEC-030: ein Pool-Konto ist auf jedem Community-Host angemeldet — wer hier
  // mitmacht, muss dazugehören. Offene Registrierung: dieser Schritt IST der
  // Beitritt (A5); geschlossen oder entzogen: 403 `not_a_member`. 401 ohne Konto.
  const user = await requireCommunityParticipant(event)

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const { value } = await readValidatedBody(event, eventVoteSchema.parse)
  const db = tenantDb(event)
  const writer = tenantDb(event, { as: 'operator', actor: 'member' })
  const ops = tenantDb(event, { as: 'operator' })

  /**
   * Nur sichtbare Events sind votbar (published/cancelled — drafts nie);
   * get belegt die Zugehörigkeit — ein fremder Mandant bekommt 404.
   *
   * DIE FRAGE STEHT SEIT F15 IN `eventModerationPolicy.ts`, weil hier ein Loch
   * war: die Zeile prüfte nur `draft`. Diese Route holt den Termin mit der
   * OPERATOR-Klinke und liest damit ABSICHTLICH an den Row-Permissions vorbei —
   * der Entzug des Leserechts beim Ausblenden hätte sie also nicht gebremst, und
   * ein ausgeblendeter Termin wäre weiter bewertbar geblieben. Überall dort, wo
   * eine Route den Admin-Client benutzt, muss der Status die Sichtbarkeit
   * ausdrücklich nachbauen.
   *
   * SEIT SEC-031 (2026-11-13) liest die Route deshalb gar nicht mehr als
   * Operator, sondern über die Mitglieder-Klinke: dort entscheidet das
   * Leserecht der Zeile, ein Entwurf oder ein ausgeblendeter Termin ergibt
   * dasselbe 404 wie eine erfundene Id, und `ops` wird erst danach berührt.
   * Die Status-Prüfung bleibt als zweites Netz stehen.
   */
  const target = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!eventIsPubliclyVisible(target.status)) {
    throw createError({ status: 409, statusText: 'Event not votable' })
  }

  // DIE EIGENE STIMME: gesucht über `userId` = Konto. Nur eine so gefundene
  // Zeile wird unten geändert oder entfernt (ihre Id, aus dieser Anfrage).
  const found = await db.find<EventVote>(EVENT_VOTES_TABLE, [
    Query.equal('eventId', id), Query.equal('userId', user.$id),
  ])
  const current = found && found.userId === user.$id ? found : null

  if (current && current.value === value) {
    await writer.remove(EVENT_VOTES_TABLE, current.$id)
  }
  else if (current) {
    await writer.update<EventVote>(EVENT_VOTES_TABLE, current.$id, { value })
  }
  else {
    try {
      await writer.create<EventVote>(EVENT_VOTES_TABLE, {
        eventId: id, userId: user.$id, value,
      }, {
        // NUR LESERECHT (SEC-002): die eigene Stimme sieht nur der Stimmende;
        // ändern und entfernen läuft über diese Route.
        permissions: [Permission.read(Role.user(user.$id))],
      })
    }
    catch (error) {
      // Doppelklick-Race: der Unique-Index lässt nur einen durch — Counts +
      // myVote werden unten ohnehin autoritativ neu gelesen
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
    }
  }

  return await serializePerEvent(id, async (): Promise<EventVoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      ops.count(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('value', 1)]),
      ops.count(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('value', -1)]),
      ops.find<EventVote>(EVENT_VOTES_TABLE, [Query.equal('eventId', id), Query.equal('userId', user.$id)]),
    ])
    const myVote: EventVoteValue | null = mine?.value === -1 ? -1 : mine ? 1 : null

    const updated = await ops.update<EventRow>(EVENTS_TABLE, id, {
      upvotes, downvotes, score: upvotes - downvotes,
    })

    // NUR die Zähler (SEC-031): die frisch geschriebene Zeile kam über die
    // Operator-Klinke — Beschreibung, Link und Adresse gehören nicht hierher.
    return { event: toVoteCounts(updated), myVote }
  })
})
