import type { BrandShareStatusResponse } from '../../../../../shared/types/brand'
import { listActiveShares, loadOwnedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * GIBT ES GERADE EINEN LESE-LINK? (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6 „Share-Dialog", Paket G3.)
 *
 * ── WARUM ES DIESE ROUTE ÜBERHAUPT BRAUCHT ────────────────────────────────
 * Der Dialog hat zwei Gesichter — „Link erzeugen" und „aktiv bis …, widerrufen
 * oder neu erzeugen" —, und welches er zeigt, darf er nicht raten. Die Liste
 * „Meine Brandings" trägt zwar ein abgeleitetes `hasActiveShare`, aber ohne
 * Datum: „aktiv" ohne „bis wann" wäre im Dialog die halbe Auskunft, und das
 * Ablaufdatum ist genau das, was ein Mensch vor dem Verschicken wissen will.
 *
 * ── DEN TOKEN GIBT ES HIER NICHT ──────────────────────────────────────────
 * Gespeichert ist nur sein sha256-Hash (`brandShares.ts`); der rohe Token
 * steht ein einziges Mal in der Antwort des Veröffentlichens. Wer ihn verloren
 * hat, erzeugt einen neuen — das ist die Rotation, und sie ist billiger als
 * eine Route, über die sich ein Geheimnis nachfragen liesse.
 *
 * ── FREMDES BRANDING IST 404 ──────────────────────────────────────────────
 * `loadOwnedProfile` ist die einzige Prüfung, die es braucht (DECISION-LOG
 * 2026-09-05) — und sie steht VOR der Abfrage der Zeilen, nicht dahinter.
 *
 * ── MEHRERE AKTIVE ZEILEN SIND MÖGLICH ────────────────────────────────────
 * Die Rotation widerruft die Vorgänger fail-soft (`share.post.ts`); scheitert
 * ein Widerruf, bleiben zwei gültige Links stehen. Gemeldet wird dann der
 * JÜNGSTE — das ist der, den der Mensch gerade verschickt hat. Der Knopf
 * „Widerrufen" nimmt ohnehin ALLE (`revoke.post.ts`), die Anzeige eines
 * einzelnen Datums verspricht also nichts Falsches.
 */
export default defineEventHandler(async (event): Promise<BrandShareStatusResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  await loadOwnedProfile(event, userId, profileId)

  const active = await listActiveShares(event, profileId)
  if (!active.length) return { active: null }

  const newest = active.reduce((latest, row) => (
    Date.parse(row.publishedAt) > Date.parse(latest.publishedAt) ? row : latest
  ))

  return {
    active: {
      shareId: newest.$id,
      // Appwrite gibt Zeitstempel als `+00:00` zurück, die Publish-Antwort
      // schreibt `Z` (toISOString) — derselbe Augenblick, zwei Schreibweisen.
      // Der Client vergleicht Zeichenketten (verify-brand-share, Abschnitt 2,
      // live erwischt): hier deshalb dieselbe Form wie beim Veröffentlichen.
      publishedAt: new Date(newest.publishedAt).toISOString(),
      expiresAt: new Date(newest.expiresAt).toISOString(),
    },
  }
})
