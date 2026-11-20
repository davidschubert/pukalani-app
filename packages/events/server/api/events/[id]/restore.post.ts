import { canRestoreEvent } from '../../../../shared/eventModerationPolicy'
import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'
import { softFailWith } from '../../../../../core/server/utils/softFail'

/**
 * Moderation: ausgeblendeten Termin wiederherstellen (F15) — Leserecht und
 * Status zurück, Titelbild folgt.
 *
 * REIHENFOLGE: ERST DER ZUSTAND, DANN DAS LESERECHT (BE-017). Bis dahin stand
 * es andersherum (Muster posts/restore.post.ts), damit das Status-Realtime-
 * Event eine schon lesbare Zeile trifft. Scheiterte dann der zweite Schritt,
 * war ein AUSGEBLENDETER Termin lesbar — Bequemlichkeit vor Sicherheit. Jetzt
 * kann ein offenes Fenster das „published" kurz vor dem Leserecht sehen und
 * zeigt eine Lücke, bis es nachlädt; das ist der kleinere Schaden.
 *
 * WIEDERHOLBAR: scheitert das Leserecht, setzt die Route den Zustand zurück
 * auf `hidden` (best-effort, laut geloggt) und antwortet mit dem Fehler. Dann
 * gilt `canRestoreEvent` wieder, und „Wiederherstellen" lässt sich einfach noch
 * einmal drücken. Ohne den Rückweg stünde ein „veröffentlichter" Termin ohne
 * Leserecht da: unsichtbar und über diese Route nicht mehr erreichbar.
 *
 * WIEDERHERGESTELLT WIRD IMMER NACH `published`, nie nach `draft`: ausgeblendet
 * werden kann laut `canHideEvent` nur ein veröffentlichter Termin, also ist
 * `published` der Zustand, aus dem er kam. Deshalb darf `hidden` auch nicht auf
 * Entwürfe angewandt werden — sonst wäre dieses Zurückschreiben eine
 * Veröffentlichung, die nie jemand angeordnet hat.
 *
 * WER HANDELT (C1c): KEIN `actor` — Moderation, dieselbe Begründung wie beim
 * Ausblenden (hide.post.ts): die M13-Sperre lässt sie durch, ein A5-Beitritt wäre
 * falsch. Produkt-Gate und Autorisierung ebenfalls wie dort.
 *
 * DIE MELDUNGEN BLEIBEN GESCHLOSSEN. `hide` hat sie mit `resolution: 'hidden'`
 * abgeschlossen; ein Wiederherstellen macht daraus keine offenen Meldungen
 * zurück. Die Entscheidung „doch in Ordnung" ist der ABSCHLUSS des Vorgangs, kein
 * Rücksprung an seinen Anfang — sonst stünde derselbe Termin sofort wieder in der
 * Queue, die ihn gerade freigegeben hat.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  // Datentür als Operator — get belegt die Zugehörigkeit (fremd → 404).
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  const verdict = canRestoreEvent(row.status)
  if (!verdict.allowed) {
    throw createError({
      status: 409,
      statusText: 'Only hidden events can be restored',
      data: { code: verdict.reason },
    })
  }

  const updated = await db.update<EventRow>(EVENTS_TABLE, id, { status: 'published' })
    .catch((error) => { throw toH3Error(error, 'Could not restore event') })
  const permissions = withPublishedRead(row.$permissions, event)
  try {
    await db.updatePermissions(EVENTS_TABLE, id, permissions)
  }
  catch (error) {
    // Rückweg auf `hidden`, damit der nächste Versuch wieder erlaubt ist.
    await db.update(EVENTS_TABLE, id, { status: 'hidden' }).catch(softFailWith('events:api/events/[id]/restore.post:update', () => {
      logEvent('error', 'events.restore_rollback_failed', { eventId: id })
    }))
    throw toH3Error(error, 'Could not restore event')
  }

  await applyEventCoverVisibility(event, { ...updated, $permissions: permissions })

  return { ok: true }
})
