import type { BrandDesignResponse } from '../../../../../shared/types/brand'
import { brandDesignStand, loadBrandDesignPreset } from '../../../../utils/brandDesignPreset'
import { loadOwnedProfile, loadStepRows, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * DAS ERGEBNIS-BOARD (`GET /api/brand/profiles/:id/design`, Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Paket D8).
 *
 * ── SIE LIEST EIN PRESET UND SONST NICHTS ────────────────────────────────
 * Zwei Abfragen (Profil, Kapitel-Zeilen) plus die behaltenen Entwürfe. Kein
 * Journey-Aufbau, keine Abnahme-Rechnung, kein Prüfblick — die Board-Seite
 * zeigt eine Fläche, und alles darüber hinaus wäre Arbeit für eine Antwort,
 * die niemand liest.
 *
 * ── LESEN IST IMMER ERLAUBT, FREMDES IST 404 ─────────────────────────────
 * Dieselbe Grenze wie bei Dokument und Leseansicht: `loadOwnedProfile`
 * (mit `assertBrandOwnerAccess`) — ein fremdes oder erfundenes Branding
 * antwortet 404 wie überall in diesem Silo-Layer (DECISION-LOG 2026-09-05).
 * Ein `canEnterBrandStep` gibt es NICHT: gezeigt wird nur, was der Mensch
 * selbst abgenommen hat.
 *
 * ── SIE ÄNDERT NICHTS UND RUFT NICHTS AN ─────────────────────────────────
 * Null KI-Aufrufe, kein Ereignis: das Board ist eine zweite Ansicht auf
 * Kapitel 10, und `foundation.viewed` zweimal zu zählen (einmal je Fläche)
 * machte aus einer Kennzahl über Nutzung eine über Klicks.
 */
export default defineEventHandler(async (event): Promise<BrandDesignResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const stepRows = await loadStepRows(event, profileId)

  const { preset, done, total } = await loadBrandDesignPreset(event, profile, stepRows)

  return {
    profileId: profile.$id,
    title: profile.title ?? '',
    contentLocale: profile.contentLocale,
    preset,
    done,
    total,
    // Ohne Preset kein Stand: ein Datum an einer Sperr-Fläche behauptete, dort
    // sei etwas entschieden worden.
    stand: preset ? brandDesignStand(stepRows) : '',
  }
})
