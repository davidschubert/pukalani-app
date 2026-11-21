import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantContext } from '../../../../packages/core/shared/types/tenant'
import { communityContentIsPublic } from '../../../../packages/core/shared/communityAudience'
import { softFail } from '../../../../packages/core/server/utils/softFail'
import { COURSES_TABLE, type CourseRow } from '../../../../packages/courses/shared/types/course'
import { EVENTS_TABLE, type EventRow } from '../../../../packages/events/shared/types/event'
import { PAGES_TABLE, type PageRow } from '../../../../packages/pages/shared/types/page'
import { POST_CATEGORIES_TABLE, POSTS_TABLE, type CommunityPost, type PostCategory } from '../../../../packages/posts/shared/types/post'
import { tenantRequestOrigin } from '../utils/tenantRequestOrigin'
import {
  SITEMAP_CATEGORY_LIMIT,
  SITEMAP_COURSE_LIMIT,
  SITEMAP_EVENT_LIMIT,
  SITEMAP_TOPIC_LIMIT,
  tenantSitemapEntries,
  tenantSitemapXml,
  type TenantSitemapInput,
} from '../utils/tenantSitemap'

/**
 * sitemap.xml PRO MANDANTEN-HOST (Audit-Befund S6) — aus echten Daten, nicht
 * aus einer Liste: welche Seiten eine Community hat, weiß nur ihr Datenraum.
 *
 * Datenweg = DIE Datentür (`tenantDb`, CLAUDE.md „Mandanten-Isolation"): der
 * Filter `tenantId` hängt garantiert dran, es gibt also keinen Weg, in der
 * Sitemap von Kunde A die Seiten von Kunde B zu nennen. `as: 'operator'` +
 * `status='published'` ist genau das Lese-Muster der öffentlichen
 * pages-Routen (`/api/pages/public`) — Entwürfe verlassen den Server nie.
 * Bewusst NICHT über einen internen Aufruf dieser Route: `event.$fetch` ist
 * in Nitro als @experimental markiert, und die Tür ist der kürzere, hier schon
 * verbindliche Weg (die Route bräuchte nur die Slugs, nicht ihr DTO).
 *
 * KONTROLL-Hosts (account.pukalani.app) antworten 404 — konsistent zu ihrer robots.txt
 * (`Disallow: /`): dort gibt es keinen öffentlichen Inhalt, also nichts zu
 * deklarieren. Eine leere Sitemap wäre die zweite mögliche Antwort, aber ein
 * `<urlset>` ohne URLs ist eine Aussage über nichts — und sie stünde in einer
 * robots.txt, die gar keine Sitemap nennt. Unbekannte Hosts erledigt schon
 * `00.tenant.ts` (404, keine Default-Site).
 *
 * GESCHLOSSENE Communities (C18, `audience === 'members'`) antworten aus
 * demselben Grund 404, und zwar VOR dem Datenlesen: eine Sitemap ist eine
 * Einladung an Crawler, und die Seiten, die sie nennen würde, sind für Gäste
 * ohnehin zu. Dass die URLs selbst kein Geheimnis sind, ändert daran nichts —
 * eine Liste aller Seiten einer geschlossenen Community auszuliefern wäre
 * genau die Art Rest, die C18 meint.
 */

/** Darf der Plan dieses Mandanten den Feed (Produkt `posts`)? Serverseitige
 *  Sicht auf dieselbe Entscheidung, die `requirePlanProduct(event, 'posts')`
 *  an `/api/posts` trifft — nur als Frage statt als Wurf. Ohne Pool-Kontext
 *  (Silo/Einzelbetrieb) ist alles erlaubt, genau wie dort. */
function planAllows(tenant: TenantContext | null, product: string): boolean {
  if (tenant?.mode !== 'pool') return true
  const appConfig = useAppConfig() as {
    pukalani?: { tenancy?: { quota?: { plans?: Record<string, unknown> }, products?: Record<string, string | undefined> } }
  }
  const tenancy = appConfig.pukalani?.tenancy
  return planAllowsProduct(Object.keys(tenancy?.quota?.plans ?? {}), tenancy?.products, tenant.plan, product)
}

/** Slugs der veröffentlichten CMS-Seiten dieses Mandanten. Best-effort: fällt
 *  der Read aus, bleibt die Sitemap bei den statischen Routen — eine kürzere
 *  Sitemap ist besser als ein 500 auf einer Crawler-URL. */
async function publishedSlugs(event: H3Event): Promise<string[]> {
  try {
    const res = await tenantDb(event, { as: 'operator' }).list<PageRow>(PAGES_TABLE, [
      Query.equal('status', 'published'),
      // NUR die Slug-Spalte: `body` ist MEDIUMTEXT (bis ~16 MB je Row) und
      // hätte in dieser Antwort nichts zu suchen.
      Query.select(['slug']),
      // Explizites Limit (Projektregel). 200 Rows = ~100 Slugs in zwei
      // Sprachen; darüber würde die Sitemap abschneiden, was für eine
      // Community-Site kein realistischer Fall ist.
      Query.limit(200),
    ])
    return res.rows.map(row => row.slug)
  }
  catch {
    return []
  }
}

/**
 * DIE INHALTE DER COMMUNITY (Q10, SEO-003) — Diskussionen, Kurse, Termine.
 *
 * WAS „ÖFFENTLICH" HEISST, steht in jeder Abfrage selbst und ist dieselbe
 * Bedingung, mit der die Listen-Routen der Produkte lesen:
 *   · Themen: `status = published` (nicht geplant, nicht von der Moderation
 *     verborgen, nicht gelöscht) UND in einer Kategorie, die aktiv ist;
 *   · Kurse: `status = published` (kein Entwurf, nicht archiviert);
 *   · Termine: `status = published`, nicht geschwärzt, und in der ZUKUNFT —
 *     ein vergangener Termin ist kein Ziel für eine Suche.
 * Eine geschlossene Community kommt hier gar nicht an (404 weiter unten).
 *
 * DIE MANDANTEN-GRENZE ist die Datentür: `tenantDb().list` scopt jede Abfrage
 * auf die Community des Hosts. Operator-Klinke wie bei den Seiten darüber —
 * die Antwort ist für alle gleich und wird eine Stunde gehalten, sie darf
 * also nicht davon abhängen, wer zufällig fragt.
 *
 * VIER ABFRAGEN, JE EINE OBERGRENZE, nur die Spalten für Adresse und Datum.
 * Ein Lesefehler lässt den Teil weg und wird gezählt (`softFail`) — die
 * Sitemap bleibt gültig, nur kürzer.
 */
async function communityContent(event: H3Event, tenant: TenantContext | null): Promise<Pick<TenantSitemapInput, 'discussions' | 'courses' | 'events'>> {
  const db = tenantDb(event, { as: 'operator' })
  const content: Pick<TenantSitemapInput, 'discussions' | 'courses' | 'events'> = {}

  if (planAllows(tenant, 'posts')) {
    const [categories, topics] = await Promise.all([
      db.list<PostCategory>(POST_CATEGORIES_TABLE, [
        Query.equal('active', true),
        Query.select(['$id', 'slug']),
        Query.limit(SITEMAP_CATEGORY_LIMIT),
      ]).catch(softFail('platform:routes/sitemap.xml:categories', { rows: [] as PostCategory[] })),
      db.list<CommunityPost>(POSTS_TABLE, [
        Query.equal('status', 'published'),
        Query.notEqual('categoryId', ''),
        Query.orderDesc('lastActivityAt'),
        Query.select(['$id', 'title', 'categoryId', 'lastActivityAt', 'publishedAt']),
        Query.limit(SITEMAP_TOPIC_LIMIT),
      ]).catch(softFail('platform:routes/sitemap.xml:topics', { rows: [] as CommunityPost[] })),
    ])
    content.discussions = {
      categories: categories.rows.map(row => ({ id: row.$id, slug: row.slug })),
      topics: topics.rows.map(row => ({
        id: row.$id,
        categoryId: row.categoryId,
        title: row.title,
        lastmod: row.lastActivityAt ?? row.publishedAt,
      })),
    }
  }

  if (planAllows(tenant, 'courses')) {
    const courses = await db.list<CourseRow>(COURSES_TABLE, [
      Query.equal('status', 'published'),
      Query.orderDesc('$createdAt'),
      Query.select(['$id', 'slug', '$updatedAt']),
      Query.limit(SITEMAP_COURSE_LIMIT),
    ]).catch(softFail('platform:routes/sitemap.xml:courses', { rows: [] as CourseRow[] }))
    content.courses = courses.rows.map(row => ({ slug: row.slug, lastmod: row.$updatedAt }))
  }

  if (planAllows(tenant, 'events')) {
    const events = await db.list<EventRow>(EVENTS_TABLE, [
      Query.equal('status', 'published'),
      Query.isNull('redactedAt'),
      Query.greaterThanEqual('startAt', new Date().toISOString()),
      Query.orderAsc('startAt'),
      Query.select(['$id', '$updatedAt']),
      Query.limit(SITEMAP_EVENT_LIMIT),
    ]).catch(softFail('platform:routes/sitemap.xml:events', { rows: [] as EventRow[] }))
    content.events = events.rows.map(row => ({ id: row.$id, lastmod: row.$updatedAt }))
  }

  return content
}

export default defineEventHandler(async (event) => {
  if (event.context.controlCenter === true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!communityContentIsPublic(useTenant(event))) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const tenant = useTenant(event)
  const entries = tenantSitemapEntries({
    pageSlugs: await publishedSlugs(event),
    feed: planAllows(tenant, 'posts'),
    primaryLocale: tenant?.primaryLocale,
    ...await communityContent(event, tenant),
  })

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  // Öffentlich + user-agnostisch (nur veröffentlichte Seiten, keine Session-
  // Daten). Kein Microcache im Prozess: der müsste nach tenantCacheScope
  // geschlüsselt sein, spart bei Crawler-Verkehr praktisch nichts und würde
  // eine gerade veröffentlichte Seite verzögert zeigen. HTTP-Caches
  // schlüsseln nach voller URL (inkl. Host) — kein Weg von Kunde A zu B.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return tenantSitemapXml(tenantRequestOrigin(event), entries)
})
