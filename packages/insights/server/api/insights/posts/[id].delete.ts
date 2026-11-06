import { insightsPostDeletable } from '../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../shared/insightsRows'
import type { InsightsPostDeletedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINEN BEITRAG LÖSCHEN (`insights.manage`, BI1 I2-Rest).
 *
 * ── NUR AUS `draft` UND `review` HERAUS ──────────────────────────────────
 * `insightsPostDeletable` ist die Regel, und sie steht im Vertrag (Begründung
 * dort): ein öffentlicher Beitrag wird ZUERST zurückgezogen
 * (`POST /api/insights/posts/<id>/state` mit `to: 'draft'`) und erst dann
 * gelöscht. Sonst verschwände eine Adresse aus der Öffentlichkeit, ohne dass
 * es je einen Vorgang dazu gegeben hätte.
 *
 * 409 statt 403: das ist kein Rechte-Problem — der Aufrufer DARF löschen, nur
 * dieser Beitrag ist gerade nicht in dem Zustand dafür. `data.code` trägt den
 * fachlichen Grund (`not_deletable`) durch den zentralen Handler, die
 * Oberfläche macht daraus „erst zurückziehen".
 *
 * ── DER ZUSTAND WIRD AUS DER ZEILE GELESEN, NICHT GEGLAUBT ───────────────
 * Die Liste graut ihren Papierkorb aus, und der Editor tut es auch — beides
 * ist eine ANZEIGE. Zwischen dem Laden der Liste und dem Klick kann ein
 * zweiter Reiter denselben Beitrag freigegeben haben; die Wahrheit steht in
 * der Ablage und wird hier geholt.
 *
 * ── ES GIBT KEINEN PAPIERKORB ────────────────────────────────────────────
 * Und das ist Absicht: ein gelöschter Entwurf war nie öffentlich, hat keine
 * fremden Links und keine `slugHistory`, die jemand sucht. Ein zweiter
 * Zustand „gelöscht" neben vier bestehenden wäre eine fünfte Zeile in jeder
 * Zustands-Tabelle für einen Fall, der keine Rückkehr kennt.
 */
export default defineEventHandler(async (event): Promise<InsightsPostDeletedResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const row = await loadInsightsPostRow(event, id)
  const post = toInsightsPost(row)

  if (!insightsPostDeletable(post.state)) {
    throw createError({
      status: 409,
      statusText: 'Post is public — withdraw it first',
      data: { code: 'not_deletable' },
    })
  }

  await deleteInsightsPostRow(event, row.$id)

  logEvent('info', 'insights.post_deleted', { rowId: row.$id, state: post.state, format: post.format })

  return { id: row.$id, deleted: true }
})
