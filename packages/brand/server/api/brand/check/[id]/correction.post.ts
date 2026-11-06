import { ID } from 'node-appwrite'
import { createBrandCheckCorrectionSchema } from '../../../../../schemas/brandCheck'
import type { BrandCheckCorrectionResponse } from '../../../../../shared/types/brand'
import { bookBrandCorrectionQuota, brandCheckIpHash } from '../../../../utils/brandAiQuota'
import { hasOpenBrandCheckCorrection } from '../../../../utils/brandCheckAdmin'
import {
  BRAND_CHECKS_TABLE,
  BRAND_CHECK_CORRECTIONS_TABLE,
  type BrandCheckRow,
  brandDb,
  isAppwriteNotFound,
} from '../../../../utils/brandStore'

/**
 * „DA STIMMT ETWAS NICHT" — der Korrekturvorschlag zu einem Check
 * (docs/archiv/BRAND-CHECK-SEITE.md §3b, Davids Idee „wie Google Business
 * Profile").
 *
 * Die zweite öffentliche SCHREIB-Route des Layers nach der Warteliste, und wie
 * diese ohne jeden Beweis davor. Sie muss es sein: sie existiert für die
 * Betreiber der geprüften Auftritte, und die haben hier kein Konto — ein Gate
 * davor wäre derselbe Zirkel wie bei der Warteliste. Sie ist zugleich die
 * Gegenseite des Rankings: eine öffentliche Bewertung Dritter ist zulässig,
 * wenn der Betroffene sich wehren kann (§3 „Recht"), und „wehren" heisst
 * KOSTENLOS und ohne Anmeldung.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ────────────────────────────────────────
 *  1. Honigtopf — gefüllt ⇒ dieselbe 200-Antwort, ohne dass etwas entsteht.
 *  2. Die STUNDEN-Drossel je Anschluss (3, §3b) — VOR jedem Appwrite-Ruf. Ein
 *     Deckel, der erst nach der Arbeit greift, ist keiner. Der Minuten-Eimer
 *     `brand:correction` aus `05.rate-limit.ts` liegt noch davor.
 *  3. Gibt es den Check überhaupt, und ist er sichtbar?
 *  4. Steht zu diesem Feld schon ein OFFENER Vorschlag? ⇒ 409.
 *  5. Erst dann schreiben.
 *
 * ── EIN AUSGEBLENDETER CHECK IST EIN 404, WIE ÜBERALL ─────────────────────
 * Dieselbe Antwort wie beim Ergebnis-GET. Alles andere widerspräche sich
 * selbst: ein Check, den der Betreiber auf Wunsch entfernt hat, kann keine
 * Korrekturen mehr brauchen.
 *
 * ── WAS DIE ANTWORT NICHT SAGT ────────────────────────────────────────────
 * Nichts über den heutigen Wert und nichts über die Entscheidung. Der
 * Vorschlag ist eingegangen — mehr weiss der Absender in diesem Moment auch
 * wirklich nicht, und eine Rückmeldung „stimmt schon" wäre eine Auskunft über
 * eine fremde Marke an jeden, der sie abfragt.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Geloggt werden Check-Id und Feld — nie die Adresse des Melders, nie seine
 * Begründung, nie die rohe IP.
 */
export default defineEventHandler(async (event): Promise<BrandCheckCorrectionResponse> => {
  const body = await readValidatedBody(event, createBrandCheckCorrectionSchema().parse)

  // (1) Der Honigtopf. Ununterscheidbar vom Erfolg.
  if (body.hp) {
    logEvent('info', 'brand.check_correction_honeypot', { field: body.field })
    return { ok: true }
  }

  const checkId = getRouterParam(event, 'id') ?? ''
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(checkId)) {
    throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
  }

  // (2) Die Stunden-Drossel. VOR dem ersten Appwrite-Ruf.
  const ipHash = brandCheckIpHash(event)
  const rejection = await bookBrandCorrectionQuota(event, ipHash)
  if (rejection) {
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    logEvent('info', 'brand.check_correction_throttled', { code: rejection.code })
    throw createError({
      status: 429,
      statusText: 'Correction limit reached',
      data: { code: rejection.code },
    })
  }

  const { tablesDB, databaseId } = brandDb(event)

  // (3) Gibt es den Check, und ist er sichtbar?
  let check: BrandCheckRow
  try {
    check = await tablesDB.getRow<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: checkId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
    }
    logEvent('warn', 'brand.check_correction_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Correction unavailable',
      data: { code: 'correction_unavailable' },
    })
  }
  if (check.hidden === true) {
    throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
  }

  // (4) Eine Dublette gehört nicht in die Arbeitsliste des Betreibers.
  if (await hasOpenBrandCheckCorrection(event, check.$id, body.field)) {
    throw createError({
      status: 409,
      statusText: 'Correction already open',
      data: { code: 'correction_open' },
    })
  }

  // (5) Schreiben. JEDE Spalte explizit (CLAUDE.md) — eine neue Spalte soll
  // eine Entscheidung an dieser Stelle sein, kein stiller Default.
  try {
    await tablesDB.createRow({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      rowId: ID.unique(),
      data: {
        checkId: check.$id,
        field: body.field,
        proposed: body.proposed,
        reason: body.reason,
        reporterEmail: body.email,
        status: 'open',
        decisionNote: '',
        decidedAt: null,
        ipHash,
      },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.check_correction_unavailable', {
      checkId: check.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Correction unavailable',
      data: { code: 'correction_unavailable' },
    })
  }

  logEvent('info', 'brand.check_correction_received', {
    checkId: check.$id,
    field: body.field,
    // Der VORGESCHLAGENE Wert ist eine Katalog-Id und kein freier Text — er
    // darf ins Log, und ohne ihn liesse sich später nicht sehen, ob das Modell
    // eine Branche systematisch verwechselt.
    proposed: body.proposed,
  })

  return { ok: true }
})
