import type { CommunityRedirectConfig } from '../../../../core/shared/communityRedirects'
import { emptyCommunityRedirectConfig } from '../../../../core/shared/communityRedirects'

/**
 * Die gespeicherten WEITERLEITUNGEN dieser Community — für den Editor.
 *
 * ── DIESE ROUTE IST NICHT ÖFFENTLICH, UND DARIN LIEGT DER UNTERSCHIED ZU
 *    `navigation.get.ts` ─────────────────────────────────────────────────
 * Das Menü muss öffentlich lesbar sein: das blueprint-Layout holt es beim
 * SSR-Aufbau, um es zu rendern. Die Weiterleitungen holt NIEMAND ausser dem
 * Editor — angewendet werden sie in der Middleware, die die Zeile selbst
 * liest. Eine öffentliche Leseroute wäre hier also kein Gleichschritt, sondern
 * eine Veröffentlichung: die Liste ist die Struktur-Historie dieser Website
 * (welche Seiten es gab, wie sie hiessen, wohin sie gezogen sind). Dieselbe
 * Begründung, aus der die Tabelle `permissions: []` trägt (system-035) — sie
 * hier über eine offene Route wieder herauszugeben, machte die Least-Privilege-
 * Entscheidung zunichte.
 *
 * Deshalb `branding.manage`, wortgleich die Schreibroute daneben. Wer die
 * Weiterleitungen setzen darf, darf sie sehen; alle anderen bekommen 403 —
 * bzw. 401 ohne Anmeldung, wie überall.
 *
 * OHNE MANDANT: leeres Dokument statt 404. Der Editor ist ein Reiter des
 * Community-Hubs und wird auf einem Kontroll-Host oder in einer Silo-App gar
 * nicht angeboten; wer trotzdem hier landet, sieht eine leere Liste und keinen
 * Fehler. Die SCHREIB-Route antwortet dort 404 — sie ist die Stelle, an der es
 * eine Wirkung gäbe.
 */
export default defineEventHandler(async (event): Promise<CommunityRedirectConfig> => {
  await requireCommunityPermission(event, 'branding.manage')

  // Dieselbe Row-Id-Regel wie beim Schreiben (core/shared/communitySettingsRow.ts).
  const rowId = communitySettingsRowIdFor(event)
  if (!rowId) return emptyCommunityRedirectConfig()

  const config = await readCommunityRedirects(event, rowId)
  return config ?? emptyCommunityRedirectConfig()
})
