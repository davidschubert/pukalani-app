import { z } from 'zod'
import type { InsightsPost } from '../../../../../shared/insightsPost'
import { INSIGHTS_STATES, insightsTransitionAllowed } from '../../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPostStateResponse } from '../../../../../shared/types/insightsApi'

/**
 * DER ZUSTANDSWECHSEL (`insights.manage`) — DAS GATE DIESES PRODUKTS.
 *
 * ── ZWEI SICHERUNGEN, ZWEI FRAGEN ────────────────────────────────────────
 *  1. IST DER ÜBERGANG ERLAUBT? — `insightsTransitionAllowed`, eine Tabelle
 *     im Vertrag. Sie sagt, was überhaupt ein Weg ist (und dass es aus
 *     `updated` nur zurück nach `draft` geht).
 *  2. HÄLT DER BEITRAG DIE SECHS PRÜFREGELN? — `insightsGateIssues`, MIT
 *     abgerufenen Quelltexten. Sie sagt, ob dieser Beitrag diesen Weg gehen
 *     DARF.
 *
 * Die zweite Prüfung läuft vor JEDEM Ziel ausser `draft`. Der Rückweg ist
 * bewusst frei: einen Beitrag zurückzuziehen darf nie an einer Prüfregel
 * scheitern — sonst hinge ausgerechnet ein fehlerhafter Beitrag in der
 * Öffentlichkeit fest.
 *
 * ── WARUM DAS GATE HIER UND NICHT IM EDITOR SITZT ────────────────────────
 * Der Editor zeigt dieselben Punkte; er ist eine Anzeige. Die Regeln sind die
 * rechtlich teuren dieses Produkts (Zitatschranke, Belegpflicht, Lizenz-Link,
 * Herabsetzung, Methodik-Link, Marken-Zeile) — eine Sperre, die nur im
 * Browser steht, ist mit einem `curl` erledigt.
 *
 * ── DIE FREIGABE UNTERSCHREIBT MIT NAMEN ─────────────────────────────────
 * `reviewedBy` ist das Konto, das den Knopf gedrückt hat, `reviewedAt` der
 * Zeitpunkt. `publishedAt` wird nur gesetzt, wenn es noch leer ist: eine
 * Auffrischung ändert nicht das Erscheinungsdatum — das wäre eine Aussage
 * gegenüber dem Leser, die niemand treffen wollte.
 */
const bodySchema = z.object({ to: z.enum(INSIGHTS_STATES) })

export default defineEventHandler(async (event): Promise<InsightsPostStateResponse> => {
  const user = requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const { to } = await readValidatedBody(event, bodySchema.parse)
  const row = await loadInsightsPostRow(event, id)
  const current = toInsightsPost(row)

  if (!insightsTransitionAllowed(current.state, to)) {
    throw createError({
      status: 409,
      statusText: 'Transition not allowed',
      data: { code: 'transition_not_allowed' },
    })
  }

  const brandRows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)

  if (to !== 'draft') {
    const issues = await insightsGateIssues(current, brandRows)
    if (issues.length > 0) {
      // KEIN 409: die Liste käme dort nie an (Begründung am Typ
      // `InsightsPostStateResponse`). Geschrieben wird nichts — der Zustand
      // bleibt, was er war.
      return { post: current, issues, changed: false }
    }
  }

  const now = new Date().toISOString()
  const isPublic = to === 'published' || to === 'updated'

  const next: InsightsPost = {
    ...current,
    state: to,
    publishedAt: isPublic ? (current.publishedAt || now) : current.publishedAt,
    reviewedAt: isPublic ? now : current.reviewedAt,
    reviewedBy: isPublic ? user.$id.slice(0, 64) : current.reviewedBy,
  }

  const saved = await saveInsightsPostRow(event, id, next)
  return { post: toInsightsPost(saved), issues: [], changed: true }
})
