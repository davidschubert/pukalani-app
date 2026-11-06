import { z } from 'zod'
import type { InsightsPost } from '../../../../shared/insightsPost'
import { INSIGHTS_FORMATS, INSIGHTS_LOCALES } from '../../../../shared/insightsPost'
import { toInsightsPost } from '../../../../shared/insightsRows'
import type { InsightsPostCreatedResponse } from '../../../../shared/types/insightsApi'

/**
 * EINEN BEITRAG ANLEGEN (`insights.manage`).
 *
 * DREI ANGABEN, mehr nicht: Format, Grundsprache, Titel. Alles Weitere
 * entsteht im Editor — ein Anlege-Dialog, der den ganzen Vertrag abfragt, ist
 * ein Formular, vor dem man umkehrt.
 *
 * ── DER ZUSTAND IST IMMER `draft` ────────────────────────────────────────
 * Er kommt nicht aus dem Körper, und das ist die halbe Sicherung dieses
 * Produkts: es gibt keinen Weg, eine Zeile in einem anderen Zustand ENTSTEHEN
 * zu lassen — jeder Wechsel läuft über `state.post.ts` und damit durch die
 * sechs Prüfregeln.
 *
 * ── DIE ADRESSE ENTSTEHT AUS DEM TITEL, ÜBER DEN VERTRAG ─────────────────
 * `brandPublicationSlug` (brand-Layer, §9.2) macht sie; die Kollision löst
 * `brandPublicationSlugCandidate` (`titel-2`, `titel-3`, …). Der UNIQUE-Index
 * `uq_slug` bleibt die eigentliche Sicherung — findet die Suche in zehn
 * Anläufen nichts Freies, gibt es eine ehrliche Ablehnung statt einer Adresse
 * wie `kaffee-47`.
 */
const bodySchema = z.object({
  format: z.enum(INSIGHTS_FORMATS),
  baseLocale: z.enum(INSIGHTS_LOCALES),
  title: z.string().trim().min(1).max(200),
})

export default defineEventHandler(async (event): Promise<InsightsPostCreatedResponse> => {
  requirePermission(event, 'insights.manage')

  const body = await readValidatedBody(event, bodySchema.parse)

  const slug = await findFreeInsightsSlug(event, 'posts', body.title, '')
  if (!slug) {
    throw createError({ status: 409, statusText: 'Slug unavailable', data: { code: 'slug_taken' } })
  }

  // JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll eine Entscheidung
  // an dieser Stelle sein, kein stiller Default.
  const post: InsightsPost = {
    format: body.format,
    slug,
    slugHistory: [],
    state: 'draft',
    baseLocale: body.baseLocale,
    titleDe: body.baseLocale === 'de' ? body.title : '',
    titleEn: body.baseLocale === 'en' ? body.title : '',
    dekDe: '',
    dekEn: '',
    bodyDe: '',
    bodyEn: '',
    translatedAt: '',
    translationModel: '',
    translationPromptVersion: '',
    translationReviewed: false,
    topics: [],
    sources: [],
    brandRefs: [],
    facts: [],
    ranking: null,
    readingMinutes: 0,
    publishedAt: '',
    reviewedAt: '',
    reviewedBy: '',
    noteInternal: '',
    // Ein getippter Brief beginnt leer; `briefVideoId` leer heisst „nicht aus
    // einem Video" (der Weg aus K5 legt den Beitrag selbst an).
    brief: '',
    briefModel: '',
    briefPromptVersion: '',
    briefVideoId: '',
    draftModel: '',
    draftPromptVersion: '',
  }

  const row = await createInsightsPostRow(event, post)
  return { post: toInsightsPost(row), id: row.$id }
})
