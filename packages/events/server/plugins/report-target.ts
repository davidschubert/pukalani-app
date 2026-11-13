import { EVENTS_TABLE, type EventRow } from '../../shared/types/event'

/**
 * MELDBAR: Termine (F15, 2026-08-03 — schließt Moderations-Audit Befund 4).
 *
 * DIE VORGESCHICHTE: an der Termin-Detailseite hing bis zum 2026-08-01 ein
 * Melde-Knopf. Er schickte `targetType: 'event'` an /api/reports und versprach
 * „ein Moderator sieht sich das an" — nur kannte keine Queue den Typ. Die Zeilen
 * entstanden, wurden gezählt und nie von einem Menschen gesehen. Der Knopf wurde
 * deshalb ENTFERNT, nicht repariert: lieber kein Knopf als ein Knopf ins Leere.
 *
 * Diese Registrierung ist die Gegenleistung dafür, dass er zurückkommt. Sie ist
 * die Zusage, die `reportTargets.ts` einfordert: WEIL hier registriert wird, gibt
 * es eine Queue (`/dashboard/events-moderation` + `/api/events/moderation`) und
 * einen Menschen, der entscheidet. Fällt eines von beidem weg, gehört auch diese
 * Zeile weg.
 *
 * Die Prüfung läuft durch die Datentür über die MITGLIEDER-Klinke — wie bei
 * posts (SEC-031, 2026-11-13; vorher als OPERATOR): meldbar ist, was das Konto
 * LESEN darf. Ein Termin aus einer FREMDEN Community, einer ohne Leserecht für
 * dieses Konto (Entwurf, ausgeblendet) und eine erfundene Id ergeben dieselbe
 * Antwort, die Melde-Route verrät keine Existenz mehr. Abgesagte Termine
 * bleiben meldbar (sie behalten ihr Leserecht). Ein ausgeblendeter Termin ist
 * damit für Mitglieder nicht mehr meldbar — sie sehen ihn auch nicht mehr; der
 * Fall liegt ohnehin schon bei der Moderation.
 *
 * KEIN PRODUKT-GATE HIER: `requirePlanProduct` braucht einen Plan-Kontext, den
 * eine Ziel-Prüfung nicht hat — und sie würde ohnehin nur „nicht vorhanden"
 * sagen, was die Datentür bei einem fremden Mandanten schon tut.
 */
export default defineNitroPlugin(() => {
  registerReportTarget('event', async (event, targetId) => {
    const row = await tenantDb(event)
      .get<EventRow>(EVENTS_TABLE, targetId, 'Event not found')
      .catch(() => null)
    return !!row
  })
})
