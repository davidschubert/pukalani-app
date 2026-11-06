import type { BrandPublicationResponse } from '../../../../../shared/types/brand'
import {
  loadBrandPublication,
  readBrandPublicationFacts,
  toBrandPublicationState,
} from '../../../../utils/brandPublications'
import { loadOwnedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * DER ZUSTAND DER VERÖFFENTLICHUNG (docs/plans/DISCOVER-BRANDS.md §4.3) — die
 * Frage der Leseansicht und der Brands-Karte: „steht diese Marke öffentlich,
 * wartet sie, oder wurde sie abgelehnt?"
 *
 * ── EIGENTÜMER-ROUTE, ALSO DIESELBE KETTE WIE ÜBERALL ────────────────────
 * `requireBrandAccess` → `loadOwnedProfile` (fremdes Branding = 404, nicht
 * unterscheidbar von „gibt es nicht"). Der ZUSTAND einer fremden Marke ist
 * keine öffentliche Auskunft: dass jemandes Einreichung abgelehnt wurde,
 * erfährt nur er selbst.
 *
 * ── ES SCHREIBT NICHTS UND KOSTET NICHTS ─────────────────────────────────
 * Ein `getRow` auf eine Zeile, deren Id die Profil-Id ist. Deshalb kein
 * eigener Drossel-Eimer — der Zugang ist die Grenze (dieselbe Begründung wie
 * bei `checks.get.ts`).
 *
 * ── KEINE ZEILE IST EINE ANTWORT, KEIN FEHLER ────────────────────────────
 * `status: 'none'`. Und fehlt die TABELLE (Deploy vor brand-020), ist die
 * Antwort dieselbe: „diese Marke ist nicht veröffentlicht" ist dann wahr, und
 * die Leseansicht soll deswegen nicht kaputt aussehen.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const [row, facts] = await Promise.all([
    loadBrandPublication(event, profileId),
    readBrandPublicationFacts(event, profile),
  ])
  return { publication: toBrandPublicationState(row), readiness: facts.readiness }
})
