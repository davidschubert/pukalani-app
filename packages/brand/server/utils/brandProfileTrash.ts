import type { H3Event } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import type { ActiveRowRetentionMode, RowRetentionMode, RowRetentionResult } from '../../../core/shared/rowRetention'
import { retentionCutoffIso } from '../../../core/shared/rowRetention'
import {
  BRAND_PROFILE_TRASH_DAYS,
  BRAND_PROFILE_TRASH_JOB,
  brandProfilePurgeAt,
  brandProfileTrashDaysLeft,
  brandProfileTrashState,
  decideBrandProfileTrash,
  isBrandProfileErased,
} from '../../shared/brandProfileTrash'
import type { BrandProfileTrashItem } from '../../shared/types/brand'
import { markBrandChecksErased, unmarkBrandChecksErased } from './brandCheckErasure'
import { BRAND_FINDINGS_TABLE } from './brandFindingsStore'
import { purgeBrandInspiration } from './brandInspirationStore'
import { purgeBrandMarkDrafts } from './brandMarkDrafts'
import { BrandProfileCascadeError, runBrandProfileCascades } from './brandProfileCascade'
import { purgeBrandRuns } from './brandRun'
import {
  BRAND_PUBLICATIONS_TABLE,
  BRAND_PUBLICATION_REPORTS_TABLE,
  type BrandPublicationRow,
  brandPublicationStatusOf,
} from './brandPublications'
import {
  BRAND_EVENTS_TABLE,
  BRAND_MESSAGES_TABLE,
  BRAND_PROFILES_TABLE,
  BRAND_SHARES_TABLE,
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  brandDb,
  isAppwriteNotFound,
} from './brandStore'

/**
 * DER PAPIERKORB DER MARKEN (WH1, Davids Entscheidung 2026-11-15) — die
 * Server-Hälfte. Die Regel „aktiv / im Papierkorb / fällig" steht pur in
 * `shared/brandProfileTrash.ts`, der Plan in `docs/plans/WIEDERHERSTELLUNG.md`.
 *
 * ── VIER WEGE ─────────────────────────────────────────────────────────────
 *   trashBrandProfile    — „Marke löschen": versteckt sofort, löscht nichts
 *                          am Inhalt (DELETE /api/brand/profiles/[id]).
 *   restoreBrandProfile  — „Zurückholen" (POST …/[id]/restore).
 *   purgeBrandProfile    — die Kaskade von früher, wörtlich: „jetzt endgültig"
 *                          (DELETE …/[id]/purge) und der stündliche Lauf.
 *   runBrandProfileTrash — der Lauf nach 90 Tagen (Gerüst `rowRetention`,
 *                          Schalter `pukalani.brand.profileTrash`, Vorgabe
 *                          `off`, Takt `server/plugins/brand-profile-trash.ts`).
 *
 * ── WAS DIE KONTOLÖSCHUNG TUT ─────────────────────────────────────────────
 * `brandDeleteUserData` liest die Marken eines Kontos OHNE den Filter
 * „nicht gelöscht" und löscht auch die im Papierkorb sofort; die Auskunft
 * nennt sie weiter. Ein Test hält das (`brandUserDataStrict.test.ts`).
 */

// ── Löschen = verstecken ────────────────────────────────────────────────────

export interface BrandProfileTrashOutcome {
  erasedAt: string
  purgeAt: string
  checksErased: number
  shares: number
  publicationWithdrawn: boolean
}

/** Die eine Antwort, wenn ein Schritt des Versteckens scheitert. */
function trashIncomplete(): Error {
  return createError({
    status: 502,
    statusText: 'Brand profile could not be deleted completely',
    data: { code: 'profile_delete_incomplete' },
  })
}

/**
 * „MARKE LÖSCHEN" — die Marke verschwindet sofort aus jedem Weg, Inhalt bleibt.
 *
 * ── DIE REIHENFOLGE ───────────────────────────────────────────────────────
 * 1. Prüfergebnisse verstecken (wie bisher ZUERST): scheitert es, ist nichts
 *    geschehen und die Antwort 502 — ein „gelöscht" mit weiter sichtbaren
 *    Ergebnissen wäre die falsche Meldung.
 * 2. Der Zeitpunkt an der Marke. Ab hier gilt sie überall als nicht
 *    vorhanden (`loadOwnedProfile` und die Leser daneben).
 * 3. Geteilte Links WEG (nicht nur widerrufen): sie enden sofort und kommen
 *    beim Zurückholen nicht wieder (Davids Entscheidung) — ihr Schnappschuss
 *    wäre sonst ein Text, den niemand mehr erreicht.
 * 4. Die Veröffentlichung zurückziehen, wenn sie draussen steht oder wartet;
 *    die Adresse in der Galerie bleibt reserviert, die Zeile bleibt. Eine vom
 *    Betreiber ausgeblendete (`hidden`) bleibt, wie sie ist: sie ist sein
 *    Beleg und nicht öffentlich.
 * Scheitert 3 oder 4, steht die Marke schon im Papierkorb; derselbe Knopf
 * versucht es erneut (die Route nimmt auch eine schon gelöschte Marke an), und
 * der Zeitpunkt wird dabei NIE verschoben — die 90 Tage beginnen beim ersten
 * Löschen.
 *
 * DERSELBE ZEITPUNKT an Marke und Prüfergebnissen: daran erkennt das
 * Zurückholen genau die Ergebnisse, die DIESES Löschen versteckt hat.
 */
export async function trashBrandProfile(
  event: H3Event,
  profile: BrandProfileRow,
  now: Date = new Date(),
): Promise<BrandProfileTrashOutcome> {
  const profileId = profile.$id
  const existing = isBrandProfileErased(profile) ? Date.parse(profile.erasedAt ?? '') : Number.NaN
  const at = Number.isFinite(existing) ? new Date(existing) : now
  const erasedAt = at.toISOString()
  const { tablesDB, databaseId } = brandDb(event)

  let checksErased: number
  try {
    checksErased = await markBrandChecksErased(event, { profileId }, at)
  }
  catch (error) {
    logEvent('warn', 'brand.profile_checks_erase_failed', {
      profileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw trashIncomplete()
  }

  if (!isBrandProfileErased(profile)) {
    try {
      await tablesDB.updateRow({ databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId, data: { erasedAt } })
    }
    catch (error) {
      throw toH3Error(error, 'Brand profile could not be deleted')
    }
  }

  let shares: number
  let publicationWithdrawn: boolean
  try {
    shares = await purgeProfileRows(event, BRAND_SHARES_TABLE, 'profileId', profileId)
    publicationWithdrawn = await withdrawPublicationForTrash(event, profileId)
  }
  catch (error) {
    logEvent('warn', 'brand.profile_trash_incomplete', {
      profileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw trashIncomplete()
  }

  return {
    erasedAt,
    purgeAt: brandProfilePurgeAt(erasedAt) ?? erasedAt,
    checksErased,
    shares,
    publicationWithdrawn,
  }
}

/**
 * Zieht eine Veröffentlichung zurück, die draussen steht, wartet oder
 * abgelehnt wurde — dieselben drei Ausgänge wie der Knopf „Zurückziehen"
 * (`withdraw` in `shared/brandPublication.ts`). Beide Schnappschüsse werden
 * geleert. `true`, wenn etwas zurückgezogen wurde.
 */
async function withdrawPublicationForTrash(event: H3Event, profileId: string): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandPublicationRow
  try {
    row = await tablesDB.getRow<BrandPublicationRow>({ databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return false
    throw error
  }
  const status = brandPublicationStatusOf(row)
  if (status !== 'pending' && status !== 'published' && status !== 'declined') return false
  await tablesDB.updateRow({
    databaseId,
    tableId: BRAND_PUBLICATIONS_TABLE,
    rowId: profileId,
    data: { status: 'withdrawn', snapshot: '', pendingSnapshot: '', updatedAt: new Date().toISOString() },
  })
  await tablesDB.updateRow({
    databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId, data: { publicationVisibility: 'private' },
  })
  return true
}

// ── Zurückholen ─────────────────────────────────────────────────────────────

/**
 * „ZURÜCKHOLEN" — nur solange die Frist läuft (`trashed`). Ist sie um
 * (`due`), antwortet die Route 409 `trash_expired`: dann hat der Lauf der
 * Prüfergebnisse womöglich schon anonymisiert, und eine halbe Marke soll
 * nicht zurückkommen.
 *
 * ERST die Prüfergebnisse, DANN das Kennzeichen: scheitert das Erste, bleibt
 * die Marke im Papierkorb und ein zweiter Versuch ist gefahrlos. Geteilte
 * Links und die Veröffentlichung kommen NICHT zurück (Davids Entscheidung);
 * wer sie wieder zeigen will, veröffentlicht neu und durchläuft die Freigabe.
 */
export async function restoreBrandProfile(
  event: H3Event,
  profile: BrandProfileRow,
  now: Date = new Date(),
): Promise<{ checksRestored: number }> {
  if (brandProfileTrashState(profile, now) !== 'trashed') {
    throw createError({
      status: 409,
      statusText: 'Brand profile can no longer be restored',
      data: { code: 'trash_expired' },
    })
  }
  const { tablesDB, databaseId } = brandDb(event)
  let checksRestored: number
  try {
    checksRestored = await unmarkBrandChecksErased(event, profile.$id, profile.erasedAt ?? '')
    await tablesDB.updateRow({
      databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profile.$id, data: { erasedAt: null },
    })
  }
  catch (error) {
    throw toH3Error(error, 'Brand profile could not be restored')
  }
  return { checksRestored }
}

// ── Die Liste „Gelöschte Marken" ────────────────────────────────────────────

/**
 * Die Marken eines Kontos im Papierkorb, jüngstes Löschen zuerst. Fällige
 * (`due`) stehen NICHT darin: zurückholen geht nicht mehr, und der Lauf holt
 * sie beim nächsten Takt ab. Fehlt die Tabelle, gibt es nichts.
 */
export async function listTrashedBrandProfiles(
  event: H3Event,
  userId: string,
  now: Date = new Date(),
): Promise<BrandProfileTrashItem[]> {
  const { tablesDB, databaseId } = brandDb(event)
  let rows: BrandProfileRow[]
  try {
    rows = await listAllRows<BrandProfileRow>(tablesDB, databaseId, BRAND_PROFILES_TABLE, [
      Query.equal('ownerType', 'user'),
      Query.equal('ownerId', userId),
      Query.isNotNull('erasedAt'),
      Query.orderDesc('erasedAt'),
    ])
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw toH3Error(error, 'Deleted brand profiles could not be loaded')
  }
  return rows
    .filter(row => brandProfileTrashState(row, now) === 'trashed')
    .map(row => ({
      id: row.$id,
      title: row.title ?? '',
      erasedAt: row.erasedAt ?? '',
      purgeAt: brandProfilePurgeAt(row.erasedAt) ?? '',
      daysLeft: brandProfileTrashDaysLeft(row.erasedAt, now),
    }))
}

// ── Endgültig löschen ───────────────────────────────────────────────────────

async function purgeProfileRows(event: H3Event, tableId: string, field: string, value: string): Promise<number> {
  const { tablesDB, databaseId } = brandDb(event)
  let rows: Models.Row[]
  try {
    rows = await listAllRows<Models.Row>(tablesDB, databaseId, tableId, [Query.equal(field, value)])
  }
  catch (error) {
    // Tabelle fehlt (Deploy vor der Migration) ⇒ es gibt nichts zu löschen.
    if (isAppwriteNotFound(error)) return 0
    throw toH3Error(error, 'Brand profile could not be deleted')
  }
  let removed = 0
  for (const row of rows) {
    try {
      await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id })
      removed++
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
    }
  }
  return removed
}

/**
 * EINE MARKE ENDGÜLTIG LÖSCHEN — die Kaskade aus Schema-Anhang §7, die bis
 * WH1 die Lösch-Route sofort fuhr, wörtlich in dieser Reihenfolge:
 * Prüfergebnisse markieren → steps → messages → shares → events → findings →
 * Meldungen der Veröffentlichung → Vorbilder (Zeilen UND Dateien) →
 * KI-Entwürfe (Zeilen UND Dateien) → Läufe → Veröffentlichung → Mitläufer
 * anderer Layer → Kopf.
 *
 * ── KINDER ZUERST, UND ZWAR AUS EINEM BETRIEBLICHEN GRUND ─────────────────
 * Appwrite kennt keine Transaktion und kein ON DELETE CASCADE. Bricht der Lauf
 * in der Mitte ab, bleibt mit dem Kopf zuletzt ein Profil mit halbem Inhalt
 * stehen — im Papierkorb versteckt, und der nächste Lauf versucht es wieder.
 * Andersherum bliebe Inhalt ohne Kopf liegen, den keine Route mehr erreicht.
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────────
 * Jede Löschung verzeiht ein 404. Ein scheiternder Mitläufer (SEC-026, Teil 2)
 * hält den Kopf fest: `BrandProfileCascadeError` ⇒ 502
 * `profile_delete_incomplete`.
 *
 * Die Prüfergebnisse werden hier nicht gelöscht, sondern (noch einmal)
 * markiert: ihr eigener Lauf räumt sie 90 Tage nach dem ERSTEN Markieren ab
 * (`brandCheckErasure.ts`). Ein schon gesetzter Zeitpunkt bleibt stehen.
 */
export async function purgeBrandProfile(event: H3Event, profileId: string): Promise<Record<string, number>> {
  const { tablesDB, databaseId } = brandDb(event)

  let checksErased: number
  try {
    checksErased = await markBrandChecksErased(event, { profileId })
  }
  catch (error) {
    logEvent('warn', 'brand.profile_checks_erase_failed', {
      profileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw trashIncomplete()
  }

  const steps = await purgeProfileRows(event, BRAND_STEPS_TABLE, 'profileId', profileId)
  const messages = await purgeProfileRows(event, BRAND_MESSAGES_TABLE, 'profileId', profileId)
  const shares = await purgeProfileRows(event, BRAND_SHARES_TABLE, 'profileId', profileId)
  const events = await purgeProfileRows(event, BRAND_EVENTS_TABLE, 'profileId', profileId)
  // Die Befunde des Spezialisten (brand-014).
  const findings = await purgeProfileRows(event, BRAND_FINDINGS_TABLE, 'profileId', profileId)
  // Die Meldungen zeigen mit `publicationId` (= Profil-Id) auf die
  // Veröffentlichung (brand-020).
  const publicationReports = await purgeProfileRows(event, BRAND_PUBLICATION_REPORTS_TABLE, 'publicationId', profileId)
  // Vorbilder und KI-Entwürfe: an jeder Zeile hängt eine Datei (§2.13).
  const inspiration = await purgeBrandInspiration(event, profileId)
  const markDrafts = await purgeBrandMarkDrafts(event, profileId)
  // Die Läufe (brand-027) hängen über `subject` an der Marke.
  let runs: number
  try {
    runs = await purgeBrandRuns(event, profileId)
  }
  catch (error) {
    throw toH3Error(error, 'Brand profile could not be deleted')
  }
  // Die Veröffentlichung trägt die Profil-Id als ihre eigene Zeilen-Id.
  let publications = 0
  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId })
    publications = 1
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
  }
  // Die Mitläufer ANDERER Layer (MV1 M1) — nach den eigenen Kindern, vor dem
  // Kopf. Scheitert einer, BLEIBT DAS PROFIL (SEC-026, Teil 2).
  let cascades: Record<string, number>
  try {
    cascades = await runBrandProfileCascades(event, profileId)
  }
  catch (error) {
    if (!(error instanceof BrandProfileCascadeError)) throw toH3Error(error, 'Brand profile could not be deleted')
    throw trashIncomplete()
  }

  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
  }

  // Das Löschen selbst schreibt KEIN brand_event: dessen Zeilen sind gerade
  // Teil der Kaskade gewesen — ein Ereignis über ein gelöschtes Profil wäre
  // der einzige Rest, der bliebe.
  const removed = {
    steps, messages, shares, events, findings, publications, publicationReports,
    inspiration, markDrafts, runs, checksErased, ...cascades,
  }
  logEvent('info', 'brand.profile_deleted', { profileId, ...removed })
  return removed
}

// ── Der Lauf nach 90 Tagen ──────────────────────────────────────────────────

/** Der wirksame Schalter dieser App (`pukalani.brand.profileTrash`). */
export function brandProfileTrashMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { profileTrash?: unknown } } }
  return retentionModeOf(BRAND_PROFILE_TRASH_JOB, appConfig.pukalani?.brand?.profileTrash)
}

/**
 * EIN EREIGNIS OHNE ANFRAGE — für den Takt.
 *
 * Die Kaskade (`purgeBrandProfile`) und die Mitläufer anderer Layer nehmen ein
 * `H3Event`, weil sie sonst immer aus einer Anfrage laufen; sie brauchen
 * daraus nur den Admin-Client (`createAdminClient(event)`) und die
 * Laufzeit-Konfiguration. Ein Takt hat keine Anfrage. Statt jede dieser
 * Funktionen (auch im market-Layer) auf „mit oder ohne Event" umzubauen,
 * bekommt der Takt ein Ereignis ohne Kopfzeilen, ohne Sitzung und ohne
 * Mandant: `createAdminClient` fällt damit auf das Projekt der `.env` zurück —
 * auf branding.supply das einzige. Die Laufzeit-Konfiguration ist die
 * geteilte (`useRuntimeConfig()` ohne Event).
 */
export function brandDetachedEvent(): H3Event {
  const req = new IncomingMessage(new Socket())
  const event = createEvent(req, new ServerResponse(req))
  event.context.nitro = { errors: [], runtimeConfig: useRuntimeConfig(), appConfig: useAppConfig() }
  return event
}

/**
 * EIN LAUF. `null`, wenn gerade einer läuft (Takt und Hand-Route teilen sich
 * die Sperre). Liest nur Marken, die seit mehr als 90 Tagen gelöscht sind
 * (Index `idx_erased`), älteste zuerst; die Entscheidung je Zeile trifft die
 * pure Regel. In `count` schreibt er nichts.
 *
 * WAS ER NIE TUT: eine Marke ohne `erasedAt` anfassen, eine mit unlesbarem
 * Zeitpunkt löschen, Ids oder Titel ins Protokoll schreiben (nur Zahlen; die
 * Kaskade selbst schreibt `brand.profile_deleted` mit der Profil-Id, wie die
 * Lösch-Route es immer tat).
 */
export async function runBrandProfileTrash(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date, event?: H3Event } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const event = opts.event ?? brandDetachedEvent()
  const { tablesDB, databaseId } = brandDb(event)
  const cutoff = retentionCutoffIso(now, BRAND_PROFILE_TRASH_DAYS)
  return runRetentionJob<BrandProfileRow>(BRAND_PROFILE_TRASH_JOB, mode, {
    listPage: async ({ after, limit }) => {
      const page = await tablesDB.listRows<BrandProfileRow>({
        databaseId,
        tableId: BRAND_PROFILES_TABLE,
        queries: [
          Query.isNotNull('erasedAt'),
          Query.lessThan('erasedAt', cutoff),
          Query.orderAsc('erasedAt'),
          Query.orderAsc('$id'),
          Query.limit(limit),
          ...(after ? [Query.cursorAfter(after)] : []),
        ],
        total: false,
      })
      return page.rows
    },
    decide: decideBrandProfileTrash,
    remove: async (row) => {
      // Ein letzter Blick: zwischen Lesen und Löschen zurückgeholt ⇒ bleibt.
      const fresh = await tablesDB.getRow<BrandProfileRow>({ databaseId, tableId: BRAND_PROFILES_TABLE, rowId: row.$id })
      if (decideBrandProfileTrash(fresh, now) === null) return 'kept'
      await purgeBrandProfile(event, row.$id)
    },
    isGone: isRetentionRowGone,
  }, { now })
}
