import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { AppwriteException, Query } from 'node-appwrite'
import {
  type BrandAccessRowFacts,
  brandAccountIsBeta,
  decideBrandAccess,
  normalizeBrandAdmissionMode,
} from '../../shared/brandAccess'

/**
 * DAS ZUGANGS-GATE DES BRAND-WIZARDS — auf JEDER privaten `/api/brand/**`-Route
 * (Plan §6 „Zugang"), nie nur in der UI. Ausnahmen sind AUSSCHLIESSLICH die
 * Invite-Prüfung/-Einlösung vor dem Login und der token-geschützte Share-GET;
 * beide kommen mit P1b und rufen dieses Gate bewusst NICHT.
 *
 * ABGEWIESEN WIRD MIT 404, NICHT MIT 403 (Datentür-Muster): ein 403 verriete,
 * dass es hinter dem Pfad etwas gibt, und machte die geschlossene Beta
 * enumerierbar. Der GRUND bleibt in `decideBrandAccess` und im Log.
 *
 * KEIN `tenantDb` HIER: `brand` ist ein SILO-Layer (er läuft auf `branding`,
 * einer Single-Tenant-Instanz), seine Tabellen tragen kein `communityId`, und
 * der ESLint-Backstop gegen rohes `.tablesDB` gilt nur den gepoolten Layern.
 * Der Admin-Client ist hier richtig und nötig: alle `brand_*`-Tabellen sind
 * SERVER-ONLY (Tabellen- und Row-Permissions `[]`, Muster des favicons-Buckets)
 * — es gibt gar keinen Session-Pfad zu ihnen, und genau das ist der Punkt:
 * `user:<id>`-Row-Permissions wären ein Weg an diesem Gate vorbei (etwa nach
 * einem Beta-Widerruf).
 */

export const BRAND_ACCESS_TABLE = 'brand_access'

export interface BrandAccessContext {
  /** Konto, das die Route bedienen darf. Ab hier gilt `assertBrandOwnerAccess`. */
  userId: string
  /**
   * IST DAS EIN BETA-KONTO? (BS1 §9 Entscheidung 6 „dauerhaft frei", Konzept
   * BRAND-BOOK-KIT.md §2.8/§2.17, Paket K1).
   *
   * Sie steht HIER, weil das Gate die `brand_access`-Zeile ohnehin liest — die
   * Frage kostet also keine zusätzliche Abfrage. Und sie steht hier, damit die
   * pure Regel `resolveDerivationAccess` sie ÜBERGEBEN bekommt statt sie selbst
   * zu ermitteln (§2.17: „ein zweiter Leser der Beta-Wahrheit wäre ein Leck").
   *
   * ACHTUNG, SIE GILT DEM AUFRUFER: für eine FREMDE Marke (Betreiber-Liste)
   * ist sie die falsche Auskunft — dort zählt die Beta-Zulassung des
   * EIGENTÜMERS, und die holt `loadBrandBetaAccounts` gebündelt.
   */
  betaAccount: boolean
}

type BrandAccessRow = Models.Row & BrandAccessRowFacts & { userId: string }

/**
 * `null` = keine Zeile (auch: Tabelle gibt es noch nicht, weil die P1b-
 * Migration nicht lief). `undefined` = die Frage liess sich nicht beantworten.
 *
 * Der Unterschied ist NICHT kosmetisch: „keine Zeile" ist im Modus 'open' ein
 * gültiger Zustand (jedes verifizierte Konto darf), „nicht lesbar" ist keiner —
 * bei einem Lesefehler wüssten wir nicht, ob dort ein `revokedAt` steht, und
 * ein Entzug darf sich nicht durch einen erzwungenen Fehler aufheben lassen.
 * Deshalb: Lesefehler ⇒ Abweisung (fail-closed).
 */
async function readBrandAccessRow(event: H3Event, userId: string): Promise<BrandAccessRow | null | undefined> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const res = await tablesDB.listRows<BrandAccessRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: BRAND_ACCESS_TABLE,
      // `uq_user` ist UNIQUE — mehr als eine Zeile kann es nicht geben. Das
      // Limit steht trotzdem explizit da (Repo-Regel: nie das Default-25).
      queries: [Query.equal('userId', userId), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    // Tabelle existiert noch nicht (404) ⇒ wie „keine Zeile". Das ist der
    // Zustand VOR der P1b-Migration und darf den Betreiber im Modus 'open'
    // nicht aussperren.
    if (error instanceof AppwriteException && error.code === 404) return null
    return undefined
  }
}

/**
 * Aufnahme-Modus der Instanz. Gelesen wird die app_config-Zeile DIREKT statt
 * über `getAppConfig()`: dessen Rückgabe ist eine feste Form, und ein
 * `brand`-Feld darin hiesse, dass der Core den Layer kennt (Plan §6: „der Core
 * darf `brand` nicht kennen"). Gleiches Muster wie `app_config.ticketsAiModel`
 * im tickets-Layer.
 *
 * Defensiv: fehlende Spalte (Deploy vor system-038), fehlende Zeile oder
 * Lesefehler ⇒ 'closed'. Ein nicht lesbarer Modus darf die Beta nicht öffnen.
 */
export async function readBrandAdmissionMode(event: H3Event) {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<Models.Row & { brandAdmissionMode?: string }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    return normalizeBrandAdmissionMode(row.brandAdmissionMode)
  }
  catch {
    return normalizeBrandAdmissionMode(undefined)
  }
}

export async function requireBrandAccess(event: H3Event): Promise<BrandAccessContext> {
  const user = event.context.user ?? null
  const userId = user?.$id ?? null

  // Ohne Session ist die Antwort schon fest — kein Appwrite-Roundtrip dafür.
  if (!userId) throw createError({ status: 404, statusText: 'Not Found' })

  const [admissionMode, accessRow] = await Promise.all([
    readBrandAdmissionMode(event),
    readBrandAccessRow(event, userId),
  ])
  if (accessRow === undefined) throw createError({ status: 404, statusText: 'Not Found' })

  const decision = decideBrandAccess({
    admissionMode,
    userId,
    emailVerified: !!user?.emailVerification,
    accessRow,
  })
  if (!decision.allowed) throw createError({ status: 404, statusText: 'Not Found' })

  return { userId, betaAccount: brandAccountIsBeta(accessRow) }
}

/**
 * DIE BETA-ZULASSUNG VIELER KONTEN AUF EINMAL — EINE Abfrage, nicht eine je
 * Zeile (Konzept docs/plans/BRAND-BOOK-KIT.md §2.8, Paket K1).
 *
 * Gebraucht wird sie an genau einer Stelle: der Betreiber-Liste
 * `/dashboard/brand-unlocks`. Sie zeigt FREMDE Marken, und ob deren Ableitung
 * offen ist, hängt an der Beta-Zulassung ihres EIGENTÜMERS — nicht an der des
 * Betreibers, der die Liste öffnet. Dasselbe Muster wie
 * `loadBrandFoundationDone`: eine Liste mit fünfzig Marken darf nicht fünfzig
 * Fragen stellen.
 *
 * Es ist KEIN zweiter Begriff von „Beta": entschieden wird auch hier mit
 * `brandAccountIsBeta` (shared/brandAccess.ts) — nur der Zuschnitt der Abfrage
 * ist ein anderer.
 *
 * FAIL-SOFT: geht sie schief, gilt kein Konto als Beta-Konto. Das ist die
 * sichere Richtung — die Liste zeigt dann „gesperrt", wo vielleicht „frei · via
 * beta" stünde, und der Betreiber kann immer noch von Hand freischalten. Die
 * Gegenrichtung hätte eine Freischaltung behauptet, die es nicht gibt.
 */
export async function loadBrandBetaAccounts(
  event: H3Event,
  userIds: readonly string[],
): Promise<Set<string>> {
  const beta = new Set<string>()
  const unique = [...new Set(userIds.filter(id => id.length > 0))]
  if (unique.length === 0) return beta
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const res = await tablesDB.listRows<BrandAccessRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: BRAND_ACCESS_TABLE,
      // `uq_user` ist UNIQUE — je Konto höchstens eine Zeile, das Limit ist
      // deshalb exakt und nicht geraten (Repo-Regel: nie das Default-25).
      queries: [Query.equal('userId', unique), Query.limit(unique.length)],
    })
    for (const row of res.rows) {
      if (brandAccountIsBeta(row)) beta.add(row.userId)
    }
  }
  catch (error) {
    logEvent('warn', 'brand.beta_lookup_failed', {
      count: unique.length,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
  return beta
}
