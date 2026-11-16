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
 *  2. HÄLT DER BEITRAG DIE SIEBEN PRÜFREGELN? — `insightsPublicationGate`,
 *     MIT abgerufenen Quelltexten (hier immer ALLE Belege — es gibt keinen
 *     geprüften öffentlichen Stand, auf den man sich berufen könnte). Sie sagt,
 *     ob dieser Beitrag diesen Weg gehen DARF, und stellt bei Ja das
 *     Freigabe-Zeichen aus, ohne das `saveInsightsPostRow` keinen öffentlichen
 *     Stand schreibt (BE-009).
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

  // `next` ZUERST: die Regeln hängen nicht am Zustand, und geprüft wird genau
  // das Objekt, das danach geschrieben wird — nur dafür gilt das Zeichen.
  const now = new Date().toISOString()
  const isPublic = to === 'published' || to === 'updated'

  const next: InsightsPost = {
    ...current,
    state: to,
    publishedAt: isPublic ? (current.publishedAt || now) : current.publishedAt,
    reviewedAt: isPublic ? now : current.reviewedAt,
    reviewedBy: isPublic ? user.$id.slice(0, 64) : current.reviewedBy,
  }

  if (to === 'draft') {
    // Zurückziehen ist frei (s. Kopf) und braucht kein Zeichen: ein Entwurf
    // ist nicht öffentlich.
    const saved = await saveInsightsPostRow(event, id, next)
    return { post: toInsightsPost(saved), issues: [], changed: true }
  }

  const brandRows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)
  const verdict = await insightsPublicationGate({ next, brandRows })
  if (!verdict.passed) {
    // KEIN 409: die Liste käme dort nie an (Begründung am Typ
    // `InsightsPostStateResponse`). Geschrieben wird nichts — der Zustand
    // bleibt, was er war.
    // `sourcesTimedOut` (GA1 P18): Quellen, die in der Gesamtfrist nicht
    // gelesen wurden — sie stehen schon als „nicht belegt" in der Liste; die
    // Zahl sagt nur, dass ein zweiter Versuch reichen kann.
    return { post: current, issues: verdict.issues, changed: false, sourcesTimedOut: verdict.sourcesTimedOut }
  }

  const saved = await saveInsightsPostRow(event, id, next, verdict.clearance)
  return { post: toInsightsPost(saved), issues: [], changed: true }
})
