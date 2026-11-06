import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import {
  BRAND_CHECK_CORRECTION_STATUSES,
  type BrandCheckCorrectionFilter,
  type BrandCheckCorrectionStatus,
  brandCheckCorrectionStatusValues,
  normalizeBrandCheckCorrectionStatus,
} from '../../shared/brandCheckCorrections'
import type { BrandCheckCorrection } from '../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  BRAND_CHECK_CORRECTIONS_TABLE,
  type BrandCheckCorrectionRow,
  type BrandCheckRow,
  brandDb,
  isAppwriteNotFound,
} from './brandStore'

/**
 * DER LESE-/SCHREIB-UNTERBAU DER BETREIBER-FLÄCHE DES BRAND-CHECKS —
 * geteilt von der Korrektur-Liste, den zwei Entscheidungs-Routen und dem
 * Ausblenden eines Checks.
 *
 * ── DAS GATE: `users.manage`, DASSELBE WIE BEI DER WARTELISTE ─────────────
 * Und aus demselben Grund (ausgeschrieben im Kopf von
 * `brandWaitlistAdmin.ts`): `sites.manage` verspräche etwas, das es auf einer
 * Single-Tenant-Instanz nicht gibt, und beide liegen ohnehin nur im
 * admin-Wildcard. Wer die Warteliste entscheidet, entscheidet auch, was im
 * öffentlichen Ranking über fremde Marken steht — es ist derselbe Kreis.
 *
 * ── KEIN `requireBrandAccess` ─────────────────────────────────────────────
 * Das Beta-Gate der Kunden-Fläche wäre hier falsch: der Betreiber hat
 * vielleicht gar keine `brand_access`-Zeile (er baut die Beta, er nimmt nicht
 * an ihr teil).
 *
 * ── SERVER-ONLY HEISST ADMIN-CLIENT ───────────────────────────────────────
 * `brand_checks` und `brand_check_corrections` tragen `permissions: []` — es
 * gibt keine Session, die dort lesen könnte. Der Zugriff läuft über
 * `brandDb(event)`, und die EINZIGE Grenze davor ist das Gate oben.
 */
export function requireBrandCheckOperator(event: H3Event) {
  return requirePermission(event, 'users.manage')
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die öffentlichen Routen. */
export function brandCheckAdminUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.check_admin_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Check administration unavailable',
    data: { code: 'check_admin_unavailable' },
  })
}

/** Die Zeilen-Id aus dem Pfad — fehlt sie, ist die Route falsch aufgerufen. */
export function requireBrandCheckRouteId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || id.length > 64) throw createError({ status: 400, statusText: 'Missing id' })
  return id
}

/**
 * EINE CHECK-ZEILE ÜBER IHRE ID — oder ein 404.
 *
 * Der 404 ist hier keine Tarnung: wer bis hierher kommt, hat `users.manage`
 * und darf wissen, dass es diese Zeile nicht (mehr) gibt. Ein AUSGEBLENDETER
 * Check kommt trotzdem zurück — der Betreiber muss ihn wieder einblenden
 * können, sonst wäre `hidden` eine Einbahnstrasse.
 */
export async function loadBrandCheckRow(event: H3Event, id: string): Promise<BrandCheckRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } })
    }
    throw brandCheckAdminUnavailable(error, { rowId: id })
  }
}

export async function loadBrandCheckCorrectionRow(
  event: H3Event,
  id: string,
): Promise<BrandCheckCorrectionRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandCheckCorrectionRow>({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Correction not found', data: { code: 'not_found' } })
    }
    throw brandCheckAdminUnavailable(error, { rowId: id })
  }
}

/**
 * GIBT ES ZU DIESEM CHECK UND DIESEM FELD SCHON EINEN OFFENEN VORSCHLAG?
 *
 * Die Frage, die den 409 der öffentlichen Route trägt (§3b). Sie fragt
 * ausdrücklich nach OFFEN und nicht nach „irgendeinem": ein abgelehnter
 * Vorschlag darf einen neuen nicht auf ewig sperren — vielleicht war der erste
 * schlecht begründet, vielleicht hat sich die Seite geändert.
 *
 * FAIL-SOFT ist hier FALSCH: könnte die Frage nicht beantwortet werden und
 * schriebe die Route trotzdem, entstünden bei jedem Klick neue Dubletten in
 * der Arbeitsliste des Betreibers. Ein Lesefehler wirft deshalb.
 */
export async function hasOpenBrandCheckCorrection(
  event: H3Event,
  checkId: string,
  field: string,
): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandCheckCorrectionRow>({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      queries: [
        Query.equal('checkId', checkId),
        Query.equal('field', field),
        Query.equal('status', 'open'),
        Query.limit(1),
      ],
    })
    return res.rows.length > 0
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return false
    throw brandCheckAdminUnavailable(error, { checkId, field, stage: 'duplicate' })
  }
}

/**
 * EINE SEITE DER BETREIBER-LISTE. Neueste zuerst — eine Arbeitsliste liest man
 * von oben, und `$createdAt` ist der einzige Zeitpunkt, den JEDE Zeile trägt
 * (`decidedAt` ist bei `open` leer).
 */
export async function listBrandCheckCorrectionRows(
  event: H3Event,
  input: { filter: BrandCheckCorrectionFilter, limit: number, cursor?: string },
): Promise<{ rows: BrandCheckCorrectionRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  const values = brandCheckCorrectionStatusValues(input.filter)

  const res = await tablesDB.listRows<BrandCheckCorrectionRow>({
    databaseId,
    tableId: BRAND_CHECK_CORRECTIONS_TABLE,
    queries: [
      ...(values ? [Query.equal('status', values)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(input.limit),
      ...(input.cursor ? [Query.cursorAfter(input.cursor)] : []),
    ],
  })
  return { rows: res.rows, total: res.total }
}

/**
 * DIE DREI ZÄHLER DER KOPFZEILE — unabhängig vom gewählten Filter, sonst wäre
 * sie eine Funktion der gerade gewählten Ansicht („0 offen", weil man die
 * abgelehnten anschaut) statt eine Aussage über die Liste.
 *
 * FAIL-SOFT: schlägt eine Zählung fehl, steht dort `0`. Die Kopfzeile ist eine
 * Auskunft, keine Arbeitsgrundlage — die Liste darunter würde für eine kaputte
 * Zahl nicht ausfallen (dieselbe Entscheidung wie bei der Warteliste).
 */
export async function countBrandCheckCorrections(
  event: H3Event,
): Promise<Record<BrandCheckCorrectionStatus, number>> {
  const { tablesDB, databaseId } = brandDb(event)

  const entries = await Promise.all(BRAND_CHECK_CORRECTION_STATUSES.map(async (status) => {
    try {
      const res = await tablesDB.listRows<BrandCheckCorrectionRow>({
        databaseId,
        tableId: BRAND_CHECK_CORRECTIONS_TABLE,
        queries: [Query.equal('status', status), Query.limit(1)],
      })
      return [status, res.total] as const
    }
    catch {
      return [status, 0] as const
    }
  }))

  return Object.fromEntries(entries) as Record<BrandCheckCorrectionStatus, number>
}

/**
 * DIE HEUTIGEN WERTE DER BETROFFENEN CHECKS — für VIELE Zeilen in EINER
 * Abfrage.
 *
 * Ohne sie stellte die Liste je Zeile eine Frage (N+1 über eine Fläche, die
 * fünfzig Zeilen zeigt). Die Liste braucht sie, weil ein Vorschlag ohne den
 * IST-Wert nicht entscheidbar ist: „schlägt `agency` vor" sagt nichts, solange
 * dort vielleicht schon `agency` steht.
 *
 * FAIL-SOFT: was sich nicht lesen lässt, bleibt leer. Ein gelöschter oder
 * unlesbarer Check darf die Arbeitsliste nicht kosten — der Betreiber sieht
 * dann einen Vorschlag ohne IST-Wert und kann ihn ablehnen.
 */
export async function loadBrandCheckSummaries(
  event: H3Event,
  checkIds: readonly string[],
): Promise<Map<string, BrandCheckRow>> {
  const unique = [...new Set(checkIds.filter(Boolean))]
  if (!unique.length) return new Map()

  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      // Der Deckel ist die Seitengrösse der Liste (100) — mehr Ids kann sie
      // gar nicht mitbringen. Explizit, weil `Query.limit()` hier Pflicht ist.
      queries: [Query.equal('$id', unique), Query.limit(100)],
    })
    return new Map(res.rows.map(row => [row.$id, row]))
  }
  catch (error) {
    logEvent('warn', 'brand.check_admin_summaries_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return new Map()
  }
}

/**
 * Die Zeile, wie sie nach draussen geht. `ipHash` wird hier NICHT
 * durchgereicht — die Auslassung ist der halbe Zweck dieser Funktion
 * (Begründung am Typ in `shared/types/brand.ts`), und weil jede Route durch
 * sie hindurch muss, kann sie keine einzelne vergessen.
 */
export function toBrandCheckCorrection(
  row: BrandCheckCorrectionRow,
  check: BrandCheckRow | undefined,
): BrandCheckCorrection {
  const field = row.field || 'industry'
  return {
    id: row.$id,
    checkId: row.checkId,
    host: check?.host ?? '',
    field,
    current: currentFieldValue(check, field),
    proposed: row.proposed ?? '',
    reason: row.reason ?? '',
    reporterEmail: row.reporterEmail ?? '',
    status: normalizeBrandCheckCorrectionStatus(row.status),
    decisionNote: row.decisionNote ?? '',
    decidedAt: row.decidedAt ?? '',
    createdAt: row.$createdAt,
  }
}

/**
 * DER HEUTIGE WERT EINES KORRIGIERBAREN FELDES.
 *
 * Bewusst eine ausdrückliche Verzweigung und kein `check[field]`: ein
 * indizierter Zugriff auf eine Zeichenkette aus der DATENBANK gäbe jedem, der
 * je ein `field` hineinschreiben kann, Lesezugriff auf jede Spalte —
 * einschliesslich `ipHash`. Ein zweites korrigierbares Feld ist damit eine
 * Zeile hier, und das ist die richtige Stelle, um darüber nachzudenken.
 */
function currentFieldValue(check: BrandCheckRow | undefined, field: string): string {
  if (!check) return ''
  return field === 'industry' ? (check.industry ?? '') : ''
}
