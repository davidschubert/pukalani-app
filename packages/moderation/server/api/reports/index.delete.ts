import { Query } from 'node-appwrite'
import { REPORT_RESOLVED_CODE } from '../../../shared/reportErrors'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eigene Meldung zu einem Target zurückziehen. Per Target adressiert (der
 * Client kennt die Report-$id nicht).
 *
 * ZURÜCKZIEHEN MUSS IMMER GEHEN (Moderations-Audit Befund 2, 2026-08-01).
 *
 * Der Befund war eine ASYMMETRIE: Melden lief über die Operator-Klinke (die
 * M13-Zahlungssperre greift dort nicht), Zurückziehen über die member-Klinke
 * (sie greift). In einer gesperrten Community bekam der Melder also 403 — und
 * die Oberfläche behauptete weiter „deine Meldung ist noch aktiv", während sie
 * es unabänderlich war.
 *
 * Die Richtung ist eindeutig: eine Meldung ist kein INHALT, sondern eine
 * AUSSAGE über andere. Sie abgeben zu dürfen, aber nicht zurücknehmen, ist die
 * falsche Hälfte. Also dieselbe Klinke wie beim Abgeben — nur-lesend heißt
 * „keine neuen Inhalte", nicht „deine Aussage bleibt stehen".
 *
 * SICHER TROTZ ADMIN-CLIENT: der Zugriff ist doppelt eingeengt, bevor gelöscht
 * wird — `find` filtert auf `reporterId = <Session-User>` UND die Tür hängt den
 * Mandanten-Filter an, `remove` belegt die Zugehörigkeit noch einmal. Ein
 * fremder Report ist auf diesem Weg nicht erreichbar.
 *
 * DIE EINZIGE PRÜFUNG (SEC-002, GA1 P13): eine Meldung trägt kein
 * Schreibrecht des Melders mehr — gelöscht wird nur die Zeile, die `find`
 * oben über `reporterId` = Konto in dieser Anfrage gefunden hat.
 *
 * NUR OFFENE MELDUNGEN (BE-020, Davids Entscheidung: „Erledigte Meldungen
 * lassen sich nicht mehr zurückziehen"): eine erledigte Meldung trägt die
 * Entscheidung der Moderation (`resolvedBy`, `resolution`) und gehört zum
 * Verlauf. Die Lese-Seite (`myOpenReportTargetIds`) zählt ohnehin nur offene;
 * zeigt ein Knopf trotzdem „Zurückziehen" (veraltete Seite, oder der Weg über
 * `already_reported`), antwortet die Route ehrlich 409 `report_resolved`
 * statt „zurückgezogen" zu behaupten.
 */
export default defineEventHandler(async (event) => {
  // SEC-030: nur Mitglieder dieser Community (ein Pool-Konto ist auf jedem
  // Community-Host angemeldet). Bewusst KEIN Beitritt — die eigene Meldung zurückzuziehen macht
  // niemanden zum Mitglied. 401 ohne Konto, 403 `not_a_member` für Fremde.
  const user = await requireCommunityMembership(event)

  const query = getQuery(event)
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  const targetId = typeof query.targetId === 'string' ? query.targetId : ''
  if (!targetType || !targetId) {
    throw createError({ status: 400, statusText: 'Missing target' })
  }

  // Datentür als Operator (siehe Kopf: Zurückziehen darf die Sperre nicht
  // treffen). Der Mandanten-Filter der Tür bleibt: derselbe Pool-User kann
  // dasselbe Target auf ZWEI Mandanten gemeldet haben (geteilter
  // users-Namensraum) — die Tür zieht die richtige Row.
  //
  // KEIN `actor:` — dieselbe bewusste Ausnahme wie beim Abgeben
  // (index.post.ts): eine Meldung ist kein Inhalt, also greift die
  // Inhalts-Sperre hier nicht.
  const db = tenantDb(event, { as: 'operator' })
  const own = [
    Query.equal('reporterId', user.$id),
    Query.equal('targetType', targetType),
    Query.equal('targetId', targetId),
  ]
  const existing = await db.find<Report>(REPORTS_TABLE, [...own, Query.equal('status', 'open')])
  if (existing) {
    await db.remove(REPORTS_TABLE, existing.$id)
    return { ok: true }
  }

  // Keine offene: gibt es eine erledigte eigene? Die bleibt stehen (BE-020).
  // Gar keine eigene Meldung ⇒ nichts zu tun (idempotent).
  const closed = await db.find<Report>(REPORTS_TABLE, own)
  if (closed) {
    throw createError({ status: 409, statusText: 'Report already resolved', data: { code: REPORT_RESOLVED_CODE } })
  }

  return { ok: true }
})
