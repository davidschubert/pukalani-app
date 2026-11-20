import type { H3Event } from 'h3'
import { EVENTS_TABLE, EVENT_RSVPS_TABLE, type EventRow } from '../../shared/types/event'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * Community-Export des events-Layers (Vertrag: core/server/utils/communityExport.ts).
 *
 * Die Termine dieser Community mit allem, was zum Termin gehört: Zeit, Ort,
 * Beschreibung, Serien-Zugehörigkeit, Zugang und der öffentliche Name des
 * Veranstalters.
 *
 * NICHT DRIN: `organizerId` (Konto-Id, kein Inhalt) und die Zu-/Absagen selbst.
 * Eine RSVP-Zeile sagt „diese Person kommt am Dienstag" — eine Aussage über
 * einen einzelnen Menschen und nicht über die Community; sie bleibt als anonyme
 * Anzahl übrig. `event_votes` ebenso: die Stimmung steht bereits denormalisiert
 * am Termin.
 *
 * TICKETS (`event_tickets`) sind bewusst ausgelassen — Zahlungsdaten
 * (Stripe-Sitzungen, Beträge, Käufer) gehören in kein Inhalts-Archiv.
 */
export async function eventsCommunityExport(event: H3Event) {
  /**
   * Die Betreiber-Klinke ist hier notwendig, nicht bequem: Entwürfe (`draft`)
   * und von der Moderation gestoppte Termine (`hidden`) tragen kein
   * öffentliches Leserecht. Ein Session-Client bekäme sie nicht, und im Bündel
   * fehlte lautlos genau der Teil, den der Owner selbst vorbereitet hat — ein
   * Archiv mit unsichtbaren Löchern ist schlechter als ein ehrlicher Fehler.
   * Die Datentür scopet trotzdem jede Abfrage auf diese Community; mit dem
   * Admin-Client ist sie die einzige Grenze, und das ist dieselbe bewusste
   * Abwägung wie in der Moderation (Präzedenz:
   * `packages/posts/server/utils/seedWelcomePost.ts`).
   *
   * `actor: 'member'`, weil der Owner handelt und der ist Mitglied. Der Export
   * schreibt keine Zeile, die M13-Sperre kann also nie zuschlagen — den
   * Handelnden dennoch beim Namen zu nennen, ist der Kern der C1c-Trennung
   * zwischen Klinke (Technik) und Akteur (Fachlichkeit).
   */
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  // Haupt-Tabelle, bewusst OHNE `.catch`: sind die Termine nicht lesbar, muss
  // der Export scheitern statt ein leeres Kapitel zu behaupten.
  const events = await collectTenantRows<EventRow>(db, EVENTS_TABLE)

  // Nur die Anzahl, und die degradiert: eine Instanz mit ausstehender Migration
  // soll ein Bündel ohne diese Zahl liefern, nicht gar keins.
  const rsvps = await db.count(EVENT_RSVPS_TABLE, []).catch(softFail('events:utils/eventsCommunityExport:count', 0))

  return {
    events: events.map(e => ({
      id: e.$id,
      createdAt: e.$createdAt,
      title: e.title,
      description: e.description,
      startAt: e.startAt,
      endAt: e.endAt,
      location: e.location,
      locationType: e.locationType,
      address: e.address,
      locationNotes: e.locationNotes,
      url: e.url,
      replayUrl: e.replayUrl,
      capacity: e.capacity,
      attendeeCount: e.attendeeCount,
      status: e.status,
      organizerName: e.organizerName,
      recurrence: e.recurrence,
      seriesId: e.seriesId,
      seriesIndex: e.seriesIndex,
      access: e.access,
      priceAmount: e.priceAmount,
      upvotes: e.upvotes,
      downvotes: e.downvotes,
      score: e.score,
    })),
    counts: {
      events: events.length,
      rsvps,
    },
  }
}
