import type { InsightsPost } from '../../../../shared/insightsPost'
import {
  insightsBodyOf,
  insightsIsPublic,
  insightsPostEditSchema,
  insightsReadingMinutes,
  insightsTitleOf,
} from '../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../shared/insightsRows'
import type { InsightsPostSavedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINEN BEITRAG SPEICHERN (`insights.manage`).
 *
 * ── DER KÖRPER TRÄGT NUR, WAS EIN MENSCH ENTSCHEIDET ─────────────────────
 * `insightsPostEditSchema` lässt die Server-eigenen Felder gar nicht erst
 * herein (`INSIGHTS_SERVER_OWNED_FIELDS`). Ein durchgereichtes
 * `state: 'published'` wäre die Freigabe an den sieben Prüfregeln vorbei, ein
 * durchgereichtes `reviewedBy` eine Unterschrift unter fremdem Namen. Der
 * Server setzt sie aus dem BESTAND der Zeile — nie aus dem Körper.
 *
 * ── DREI DINGE RECHNET DER SERVER SELBST ─────────────────────────────────
 *  1. `readingMinutes` aus der GRUNDFASSUNG, „beim Speichern, nicht beim
 *     Lesen" (§9.3) — sonst rechnet jede Seitenansicht dieselbe Zahl neu und
 *     die Sortierung „Kürzeste Lesezeit" müsste den ganzen Text laden.
 *  2. `slugHistory`, wenn sich die Adresse ändert — sonst bricht jede
 *     Umbenennung still jeden Link (§9.2, der Befund gegen `brand_publications`).
 *  3. Die Eindeutigkeit der Adresse (`uq_slug` ist die Sicherung, die Suche
 *     der Kandidat).
 *
 * ── DAS HÄKCHEN BRAUCHT EINE ZWEITE FASSUNG ──────────────────────────────
 * `translationReviewed: true` heisst „diese Fassung darf öffentlich werden"
 * (§3.2). Über einem LEEREN Feld wäre das eine Zusage über nichts — und die
 * öffentliche Route zeigte dem Leser eine leere Seite in seiner Sprache statt
 * der Grundfassung. Erlaubt ist das Häkchen deshalb nur, wenn es eine zweite
 * Fassung GIBT: entweder maschinell erzeugt (`translatedAt`) oder von Hand
 * geschrieben (Titel UND Text der Nicht-Grundsprache gefüllt).
 *
 * ── EIN VERÖFFENTLICHTER ARTIKEL WIRD ERST GEPRÜFT, DANN GEÄNDERT (BE-009) ─
 * Steht der Beitrag auf `published` oder `updated`, ist jede gespeicherte
 * Änderung SOFORT öffentlich. Bis BE-009 lief sie an den sieben Prüfregeln
 * vorbei — die liefen nur beim Zustandswechsel. Jetzt geht der neue Stand
 * vorher durch dasselbe Gate (`insightsPublicationGate`) wie die
 * Veröffentlichung, mit einem Unterschied: abgerufen werden nur die Belege,
 * die neu oder geändert sind (Begründung an `insightsSourcesToFetch`).
 *
 * Besteht er nicht, wird NICHTS geschrieben — online bleibt die geprüfte
 * Fassung stehen, und die Antwort trägt sie (`saved: false`) samt der Liste.
 * 200 statt 409 aus demselben Grund wie beim Zustandswechsel: die Liste käme
 * in einem Fehler-Körper nie an (`InsightsPostStateResponse`).
 *
 * WARUM KEIN ENTWURF NEBEN DEM ÖFFENTLICHEN STAND: das Datenmodell trägt EINE
 * Zeile je Beitrag. Eine Arbeitsfassung daneben wäre eine Migration (zweiter
 * Satz Spalten oder zweite Tabelle) und eine zweite Wahrheit darüber, was
 * gilt. Wer einen Zwischenstand speichern will, der die Regeln (noch) nicht
 * hält, zieht den Beitrag zurück — als Entwurf lässt sich alles speichern.
 */
export default defineEventHandler(async (event): Promise<InsightsPostSavedResponse> => {
  requirePermission(event, 'insights.manage')

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, insightsPostEditSchema.parse)
  const row = await loadInsightsPostRow(event, id)
  const current = toInsightsPost(row)

  const otherLocale = body.baseLocale === 'de' ? 'en' : 'de'
  const hasSecondVersion = Boolean(current.translatedAt)
    || Boolean(insightsTitleOf(body, otherLocale).trim() && insightsBodyOf(body, otherLocale).trim())
  if (body.translationReviewed && !hasSecondVersion) {
    throw createError({
      status: 400,
      statusText: 'Translation empty',
      data: { code: 'translation_empty' },
    })
  }

  const { slug, slugHistory } = await applyInsightsSlugChange(event, 'posts', id, current, body.slug)

  const next: InsightsPost = {
    ...body,
    slug,
    slugHistory,
    // Der Bestand entscheidet über alles, was ein Lauf oder eine Freigabe
    // gesetzt hat — der Körper hat diese Felder nie gesehen.
    state: current.state,
    publishedAt: current.publishedAt,
    reviewedAt: current.reviewedAt,
    reviewedBy: current.reviewedBy,
    translatedAt: current.translatedAt,
    translationModel: current.translationModel,
    translationPromptVersion: current.translationPromptVersion,
    draftModel: current.draftModel,
    draftPromptVersion: current.draftPromptVersion,
    // Der BRIEF kommt aus dem Körper (ihn ändert der Mensch), seine HERKUNFT
    // nicht: welches Modell, welche Prompt-Fassung, welches Video — das hat
    // der Lauf gesetzt (K5).
    briefModel: current.briefModel,
    briefPromptVersion: current.briefPromptVersion,
    briefVideoId: current.briefVideoId,
    readingMinutes: insightsReadingMinutes(insightsBodyOf(body, body.baseLocale)),
  }

  // EINMAL gelesen: das Gate braucht sie (Regeln 4 und 6) und die Antwort auch.
  const brandRows = await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)

  if (insightsIsPublic(current)) {
    const verdict = await insightsPublicationGate({ next, published: current, brandRows })
    if (!verdict.passed) {
      // Nichts geschrieben: online steht weiter die geprüfte Fassung.
      return { post: current, issues: verdict.issues, saved: false }
    }
    const saved = await saveInsightsPostRow(event, id, next, verdict.clearance)
    return { post: toInsightsPost(saved), issues: [], saved: true }
  }

  const saved = await saveInsightsPostRow(event, id, next)
  const post = toInsightsPost(saved)
  return { post, issues: insightsFormIssues(post, brandRows), saved: true }
})
