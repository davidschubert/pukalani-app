import { ID } from 'node-appwrite'
import { createBrandPublicationReportSchema } from '../../../../schemas/brandPublication'
import { BRAND_PUBLICATION_REPORT_OPEN_CODE } from '../../../../shared/brandPublication'
import type { BrandPublicationReportResponse } from '../../../../shared/types/brand'
import { brandCheckIpHash } from '../../../utils/brandAiQuota'
import {
  BRAND_PUBLICATION_REPORTS_TABLE,
  bookBrandPublicationReportQuota,
  brandPublicationAdminUnavailable,
  bumpBrandPublicationReportCount,
  findPublishedBrandPublicationBySlug,
  hasOpenBrandPublicationReport,
} from '../../../utils/brandPublications'
import { brandDb } from '../../../utils/brandStore'

/**
 * „HIER STIMMT ETWAS NICHT" — die öffentliche Meldung zu einer Marke in der
 * Galerie (docs/plans/DISCOVER-BRANDS.md §3.4, §6).
 *
 * Die dritte öffentliche SCHREIB-Route dieses Layers nach der Warteliste und
 * dem Korrekturvorschlag, und wie diese ohne jeden Beweis davor. Sie muss es
 * sein: gemeldet wird von jemandem, der eine FREMDE Marke sieht, und der hat
 * hier kein Konto. Sie ist zugleich die Gegenseite der Veröffentlichung —
 * öffentlich zeigen dürfen wir nur, was auch beanstandet werden kann.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ────────────────────────────────────────
 *  1. Honigtopf — gefüllt ⇒ dieselbe 200-Antwort, ohne dass etwas entsteht.
 *  2. Die STUNDEN-Drossel je Anschluss (3, §6) — VOR jedem Appwrite-Ruf. Ein
 *     Deckel, der erst nach der Arbeit greift, ist keiner. Der Minuten-Eimer
 *     `brand:report` aus `05.rate-limit.ts` liegt noch davor.
 *  3. Gibt es diese Adresse überhaupt, und steht sie ÖFFENTLICH?
 *  4. Hat derselbe Anschluss dazu schon etwas Offenes gemeldet? ⇒ 409.
 *  5. Erst dann schreiben — und den Zähler an der Marke hochziehen.
 *
 * ── WAS NICHT ÖFFENTLICH STEHT, IST EIN 404 ───────────────────────────────
 * `pending`, `declined`, `hidden`, `withdrawn` und ein unbekannter Slug
 * antworten gleich. Alles andere verriete, dass es diese Marke gibt — und wer
 * sie nicht sehen kann, hat nichts zu beanstanden.
 *
 * ── WAS DIE ANTWORT NICHT SAGT ────────────────────────────────────────────
 * Nichts über den Zustand der Marke, nichts über frühere Meldungen. „Ist
 * eingegangen" ist alles, was der Absender in diesem Moment wirklich weiss.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Slug und Codes — nie die Begründung, nie die Adresse des Melders, nie die
 * rohe IP.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationReportResponse> => {
  const body = await readValidatedBody(event, createBrandPublicationReportSchema().parse)

  // (1) Der Honigtopf. Ununterscheidbar vom Erfolg.
  if (body.hp) {
    logEvent('info', 'brand.publication_report_honeypot', {})
    return { ok: true }
  }

  const slug = getRouterParam(event, 'slug') ?? ''
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    throw createError({
      status: 404,
      statusText: 'Publication not found',
      data: { code: 'publication_not_found' },
    })
  }

  // (2) Die Stunden-Drossel. VOR dem ersten Appwrite-Ruf.
  const ipHash = brandCheckIpHash(event)
  const rejection = await bookBrandPublicationReportQuota(event, ipHash)
  if (rejection) {
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    logEvent('info', 'brand.publication_report_throttled', { code: rejection.code })
    throw createError({
      status: 429,
      statusText: 'Report limit reached',
      data: { code: rejection.code },
    })
  }

  // (3) Gibt es die Adresse, und steht sie öffentlich?
  const publication = await findPublishedBrandPublicationBySlug(event, slug)
  if (!publication) {
    throw createError({
      status: 404,
      statusText: 'Publication not found',
      data: { code: 'publication_not_found' },
    })
  }

  // (4) Eine Dublette gehört nicht in die Arbeitsliste des Betreibers.
  if (await hasOpenBrandPublicationReport(event, publication.$id, ipHash)) {
    throw createError({
      status: 409,
      statusText: 'Report already open',
      data: { code: BRAND_PUBLICATION_REPORT_OPEN_CODE },
    })
  }

  // (5) Schreiben. JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll
  // eine Entscheidung an dieser Stelle sein, kein stiller Default.
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.createRow({
      databaseId,
      tableId: BRAND_PUBLICATION_REPORTS_TABLE,
      rowId: ID.unique(),
      data: {
        publicationId: publication.$id,
        reason: body.reason,
        reporterEmail: body.email,
        status: 'open',
        ipHash,
        decidedAt: null,
      },
    })
  }
  catch (error) {
    throw brandPublicationAdminUnavailable(error, { slug, stage: 'report' })
  }

  // Die WAHRHEIT sind die Zeilen; `reportCount` ist die Anzeige daneben und
  // deshalb fail-soft (Begründung an der Funktion).
  await bumpBrandPublicationReportCount(event, publication)

  logEvent('info', 'brand.publication_report_received', { slug })

  return { ok: true }
})
