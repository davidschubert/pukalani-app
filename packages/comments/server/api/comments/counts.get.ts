import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { COMMENTS_TABLE } from '../../../shared/types/comment'
import { softFail } from '../../../../core/server/utils/softFail'

const MAX_TARGETS = 50
/** Zeilen je Abruf beim Zählen in einem Zug. */
const PAGE = 1_000
/**
 * Ab so vielen Kommentaren über alle Ziele zählt die Route wieder je Ziel:
 * dann sind 50 Zähl-Abfragen billiger, als jede Zeile zu übertragen.
 */
const SWEEP_CAP = 5_000

/**
 * Kommentar-Anzahl je Target, gebündelt (z. B. für Kommentar-Buttons im
 * Community-Feed, BEVOR eine Section geöffnet ist). Zählt wie der Listen-
 * Header: alle nicht-hidden Kommentare (deleted-Platzhalter inklusive).
 * Öffentlich — dieselbe Sichtbarkeit wie die Kommentarliste selbst.
 *
 * IN EINEM ZUG (Q12, PERF-004): vorher eine Zähl-Abfrage JE Ziel (25 Beiträge
 * ⇒ 25 Abfragen). Jetzt EINE Liste über alle Ziele, nur die Spalte
 * `targetId`, gezählt im Code. Dieselbe Tür (`tenantDb(event)`, Klinke
 * `member`) und dieselben Filter wie vorher: der Mandant hängt die Tür an, und
 * die Leserechte der Zeilen wirken weiter — ein Kommentar, den diese Sitzung
 * nicht lesen darf, zählt nicht, versteckte (`hidden`) zählen nie.
 * Nur bei sehr vielen Kommentaren (über `SWEEP_CAP`) zählt sie wie früher je
 * Ziel.
 */
export default defineEventHandler(async (event): Promise<{ counts: Record<string, number> }> => {
  const query = getQuery(event)
  const targetType = String(query.targetType ?? '')
  const ids = [...new Set(String(query.targetIds ?? '').split(',').map(s => s.trim()).filter(Boolean))]
  if (!targetType || ids.length === 0) {
    throw createError({ status: 400, statusText: 'targetType and targetIds are required' })
  }
  if (ids.length > MAX_TARGETS) {
    throw createError({ status: 422, statusText: 'Too many targets' })
  }

  const db = tenantDb(event)
  const filters = [
    Query.equal('targetId', ids),
    Query.equal('targetType', targetType),
    Query.notEqual('status', 'hidden'),
  ]

  const counts: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  let seen = 0
  let cursor: string | undefined
  for (;;) {
    const page = await db.list<Models.Row & { targetId: string }>(COMMENTS_TABLE, [
      ...filters,
      Query.select(['$id', 'targetId']),
      Query.orderAsc('$id'),
      Query.limit(PAGE),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]).catch(softFail('comments:api/comments/counts.get:list', null))
    // Lesefehler: wie vorher je Ziel „0" — die Knöpfe zeigen dann den Verb-CTA.
    if (!page) return { counts: Object.fromEntries(ids.map(id => [id, 0])) }
    for (const row of page.rows) {
      if (row.targetId in counts) counts[row.targetId] = (counts[row.targetId] ?? 0) + 1
    }
    seen += page.rows.length
    if (page.rows.length < PAGE) return { counts }
    if (seen >= SWEEP_CAP) break
    cursor = page.rows.at(-1)!.$id
  }

  const totals = await Promise.all(ids.map(id =>
    db.count(COMMENTS_TABLE, [
      Query.equal('targetId', id),
      Query.equal('targetType', targetType),
      Query.notEqual('status', 'hidden'),
    ]).catch(softFail('comments:api/comments/counts.get:count', 0)),
  ))
  return { counts: Object.fromEntries(ids.map((id, index) => [id, totals[index] ?? 0])) }
})
