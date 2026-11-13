/**
 * ANTWORT von `POST /api/community/delete` (Community stilllegen, C16) — von
 * BEIDEN Seiten benutzt: der Handler annotiert sie, die Gefahrenzone unter
 * /dashboard/community liest sie (`$fetch<CommunityDeleteResponse>`), weil
 * Nitros Routen-Typisierung aus ist.
 */
export interface CommunityDeleteResponse {
  ok: boolean
  communityId: string
  status: 'disabled'
  /** Mitgliedschaften im Control Plane (Schritt 1). */
  members: { total: number, removed: number, failed: number, complete: boolean }
  /**
   * Lese-Publikum im Pool (Schritt 2, SEC-024): je entfernter Person ein
   * nachgeprüfter Label-Entzug. `failed > 0` ⇒ die Oberfläche zeigt einen
   * Hinweis statt reinem Erfolg; der stündliche Abgleich holt den Rest nach.
   */
  labels: { total: number, revoked: number, failed: number }
}
