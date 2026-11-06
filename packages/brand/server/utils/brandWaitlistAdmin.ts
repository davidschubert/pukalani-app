import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import {
  type BrandWaitlistFilter,
  type BrandWaitlistStatus,
  BRAND_WAITLIST_STATUSES,
  brandWaitlistStatusValues,
  normalizeBrandWaitlistStatus,
} from '../../shared/brandWaitlistAdmin'
import type { BrandWaitlistAdminItem } from '../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, type BrandWaitlistRow, brandDb, isAppwriteNotFound } from './brandStore'

/**
 * DER LESE-UNTERBAU DER BETREIBER-WARTELISTE — geteilt von der Liste, dem
 * CSV-Export und den drei Aktions-Routen.
 *
 * ── DAS GATE: `users.manage`, UND ZWAR MIT GRUND ──────────────────────────
 * Die Warteliste entscheidet, WER ein Konto in dieser Beta bekommt — das ist
 * dieselbe Frage wie auf /dashboard/users, nur einen Schritt früher. Die
 * Alternative wäre `sites.manage` gewesen (so gatet das Control Plane seine
 * Anfragen-Seite), aber Sites gibt es hier keine: `branding` ist ein Silo ohne
 * Mandanten, und eine Capability, die im Namen etwas anderes verspricht als sie
 * schützt, ist beim nächsten Audit ein Befund. Beide sind ohnehin nur im
 * admin-Wildcard (`ROLE_CAPABILITIES.moderator` trägt keine von beiden) — es
 * geht also nicht darum, den Kreis zu ändern, sondern ihn richtig zu benennen.
 *
 * ── DIE ROUTE IST DIE GRENZE, DIE SEITE NUR DIE SICHT ─────────────────────
 * `requirePermission` wirft 401 ohne Session und 403 ohne Capability. Die
 * Seiten-Middleware (`['auth', 'admin']` + `requiredCapability`) macht dasselbe
 * noch einmal — sie ist UX, nicht Autorität.
 *
 * ── KEIN `requireBrandAccess` ─────────────────────────────────────────────
 * Das Beta-Gate der Kunden-Fläche ist hier FALSCH: der Betreiber hat vielleicht
 * gar kein `brand_access` (er baut die Beta, er nimmt nicht an ihr teil). Ein
 * 404 aus dem Kunden-Gate wäre für ihn ein Rätsel und für einen Fremden kein
 * Gewinn — das Betreiber-Dashboard ist ohnehin nur mit Label erreichbar.
 *
 * ── SERVER-ONLY HEISST ADMIN-CLIENT ───────────────────────────────────────
 * `brand_waitlist` trägt `permissions: []` (brand-012) — es gibt keine Session,
 * die dort lesen könnte. Der Zugriff läuft deshalb über `brandDb(event)`
 * (Admin-Client), und die EINZIGE Grenze davor ist das Gate oben. Der
 * ESLint-Backstop gegen rohes `.tablesDB` gilt den GEPOOLTEN Layern; `brand`
 * ist ein Silo-Layer ohne `communityId` (s. Kopf von `brandStore.ts`).
 */
export function requireBrandWaitlistOperator(event: H3Event) {
  return requirePermission(event, 'users.manage')
}

/**
 * Die Zeile, wie sie nach draußen geht. `tokenHash`/`tokenExpiresAt` werden
 * hier NICHT durchgereicht — die Auslassung ist der ganze Zweck dieser
 * Funktion (Begründung am Typ in `shared/types/brand.ts`), und weil jede Route
 * durch sie hindurch muss, kann sie keine einzelne vergessen.
 */
export function toBrandWaitlistAdminItem(row: BrandWaitlistRow): BrandWaitlistAdminItem {
  return {
    id: row.$id,
    email: row.email || row.emailLower,
    name: row.name ?? '',
    company: row.company ?? '',
    website: row.website ?? '',
    locale: row.locale || 'en',
    source: row.source ?? '',
    status: normalizeBrandWaitlistStatus(row.status),
    note: row.note ?? '',
    createdAt: row.$createdAt,
    confirmedAt: row.confirmedAt ?? '',
  }
}

/**
 * EINE SEITE DER LISTE. Neueste zuerst — eine Warteliste liest man von oben,
 * und `$createdAt` ist der einzige Zeitpunkt, den JEDE Zeile trägt
 * (`confirmedAt` ist bei `pending` leer).
 *
 * `Query.limit()` ist PFLICHT (sonst 25 stille Zeilen); der Cursor ist die
 * Zeilen-Id der letzten gelieferten Zeile.
 */
export async function listBrandWaitlistRows(
  event: H3Event,
  input: { filter: BrandWaitlistFilter, limit: number, cursor?: string },
): Promise<{ rows: BrandWaitlistRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  const values = brandWaitlistStatusValues(input.filter)

  const res = await tablesDB.listRows<BrandWaitlistRow>({
    databaseId,
    tableId: BRAND_WAITLIST_TABLE,
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
 * DIE VIER ZÄHLER DER KOPFZEILE.
 *
 * Vier Abfragen mit `Query.limit(1)`: gelesen wird nur `total`, die Zeilen
 * selbst interessieren nicht. Das ist billiger als es aussieht (Appwrite zählt
 * über den Index) und ehrlicher als die Alternative — die geladene SEITE zu
 * zählen ergäbe „50 bestätigte", sobald 50 die Seitengröße ist.
 *
 * FAIL-SOFT: schlägt eine Zählung fehl, steht dort `0` statt eines Fehlers. Die
 * Kopfzeile ist eine Auskunft, keine Arbeitsgrundlage — die Liste darunter
 * würde für eine kaputte Zahl nicht ausfallen.
 */
export async function countBrandWaitlistStatuses(
  event: H3Event,
): Promise<Record<BrandWaitlistStatus, number>> {
  const { tablesDB, databaseId } = brandDb(event)

  const entries = await Promise.all(BRAND_WAITLIST_STATUSES.map(async (status) => {
    try {
      const res = await tablesDB.listRows<BrandWaitlistRow>({
        databaseId,
        tableId: BRAND_WAITLIST_TABLE,
        queries: [Query.equal('status', brandWaitlistStatusValues(status) ?? [status]), Query.limit(1)],
      })
      return [status, res.total] as const
    }
    catch {
      return [status, 0] as const
    }
  }))

  return Object.fromEntries(entries) as Record<BrandWaitlistStatus, number>
}

/**
 * EINE ZEILE ÜBER IHRE ID — oder ein 404.
 *
 * Der 404 ist hier keine Tarnung, sondern die Wahrheit: wer bis hierher kommt,
 * hat `users.manage` und darf wissen, dass es diese Zeile nicht (mehr) gibt.
 * Ein Ausfall der Ablage ist ein ANDERER Fall und bekommt seinen eigenen
 * Code — sonst sucht der Betreiber nach einer Zeile, die noch da ist.
 */
export async function loadBrandWaitlistRow(event: H3Event, id: string): Promise<BrandWaitlistRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandWaitlistRow>({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({
        status: 404,
        statusText: 'Waitlist entry not found',
        data: { code: 'not_found' },
      })
    }
    throw brandWaitlistUnavailable(error, { rowId: id })
  }
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die öffentlichen Routen. */
export function brandWaitlistUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.waitlist_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Waitlist unavailable',
    data: { code: 'waitlist_unavailable' },
  })
}

/** Die Zeilen-Id aus dem Pfad — fehlt sie, ist die Route falsch aufgerufen. */
export function requireBrandWaitlistId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  return id
}
