import type { InsightsChannelsSeededResponse } from '../../../../shared/types/insightsApi'

/**
 * DIE SAAT ÜBERNEHMEN (`insights.manage`, BI2 K3) — EINMAL, in eine leere Liste.
 *
 * Die elf Kanäle, mit denen der Radar seit I4 läuft, standen bis BI2 in
 * `apps/branding/app/app.config.ts`. Dieser Knopf ist der Umzug: er schreibt
 * sie in die Tabelle, samt der Notizen, die vorher Code-Kommentare waren.
 *
 * ── NUR IN EINE LEERE TABELLE, UND DAS IST DER PUNKT ────────────────────
 * Ein zweiter Lauf auf eine gepflegte Liste brächte Kanäle zurück, die der
 * Betreiber bewusst entfernt hat — die Übernahme wäre dann ein Knopf, der
 * Arbeit rückgängig macht. Steht schon eine Zeile, passiert nichts, und die
 * Antwort sagt es (`seeded: 0`) statt stillschweigend zu gelingen.
 */
export default defineEventHandler(async (event): Promise<InsightsChannelsSeededResponse> => {
  requirePermission(event, 'insights.manage')

  const seeded = await seedInsightsChannels(event)
  return { seeded, channels: await listInsightsChannels(event) }
})
