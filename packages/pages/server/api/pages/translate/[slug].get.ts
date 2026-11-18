import { MAX_PAGE_SLUG, PAGE_SLUG_PATTERN } from '../../../../schemas/page'
import type { PageTranslateRunResponse } from '../../../../shared/types/page'
import { readPageTranslateRun } from '../../../utils/pageTranslateRun'

/**
 * DER STAND DER ÜBERSETZUNG EINER SEITE (LL1 d, 2026-11-18) — die Seite
 * fragt ihn ab, solange ein Lauf rechnet, und beim Öffnen der Seite, damit sie
 * einen laufenden Lauf nach dem Neuladen wieder aufnimmt.
 *
 * Lesen darf, wer die Seite bearbeiten darf (`pages.manage`, dasselbe Tor wie
 * Start und Editor) — der fertige Vorschlag ist ein Entwurf ihres Texts. Die
 * Datentür hängt den Mandanten an die Abfrage, und der Gegenstand der Sperre
 * ist ein Hash aus Mandant und Adresse: ein Lauf einer anderen Community ist
 * von hier aus weder sichtbar noch erratbar.
 *
 * Fail-soft: ohne Lauf-Tabelle (Instanz ohne pages-007) heisst der Stand
 * „kein Lauf" (`server/utils/pageTranslateRun.ts`).
 *
 * Eigener Pfad `translate/:slug` statt `?slug=` an `/api/pages/translate`:
 * ein fester Pfad `GET /api/pages/translate` schattete die Seite mit der
 * Adresse `translate` im Editor (`GET /api/pages/:slug`).
 */
export default defineEventHandler(async (event): Promise<PageTranslateRunResponse> => {
  await requireCommunityPermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug') ?? ''
  if (!PAGE_SLUG_PATTERN.test(slug) || slug.length > MAX_PAGE_SLUG) {
    throw createError({ status: 400, statusText: 'Invalid slug' })
  }
  return { run: await readPageTranslateRun(event, slug) }
})
