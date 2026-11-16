import { AppwriteException, ID, Permission, Query, Role } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import type { H3Event } from 'h3'
import { createSessionClient } from '../lib/appwrite'
import type { UserDataAudience, UserDataExportContext } from './userData'

/**
 * GDPR-Orchestrierung (Plan: docs/archiv/GDPR-DELETE-AND-EXPORT.md §4.3).
 *
 * `exportUserCompletely` sammelt Account + Sessions (Core-Domäne) und die
 * Daten aller registrierten UserDataContributors — vollständig, paginiert.
 *
 * `deleteUserCompletely` löscht „best effort mit hartem Abschlusskriterium":
 * Snapshot → Sperren → Audit → Contributors (sequenziell, isoliert) →
 * Core-Cleanups (Avatar, Presence) → `users.delete()` NUR bei Voll-Erfolg.
 * Ein Teilfehler hinterlässt einen GESPERRTEN Account + actionablen Report;
 * alle Schritte sind idempotent → gefahrloser Re-Run räumt den Rest ab.
 */

export interface UserDataExport {
  exportedAt: string
  account: ReturnType<typeof mapExportAccount>
  sessions: ReturnType<typeof mapExportSessions>
  /**
   * Nur im Selbst-Export (`via: 'session'`): die Sitzungsliste war nicht
   * lesbar, `sessions` ist deshalb leer, OHNE dass es keine gäbe. Der Export
   * bleibt dort nachsichtig (ein Wackler soll die Auskunft nicht verhindern),
   * sagt es aber — ein leerer Abschnitt sähe sonst aus wie „keine Sitzungen".
   * Im Admin-Pfad gibt es das Feld nicht: dort bricht der Fehler ab.
   */
  sessionsUnavailable?: true
  data: Record<string, unknown>
}

export interface ContributorRunResult {
  id: string
  ok: boolean
  deleted: number
  anonymized: number
  /**
   * Rohe Fehlermeldung des Layers — regelmäßig eine `AppwriteException`
   * (Tabellen-Ids, interne Formulierungen). SERVERSEITIGE Diagnose: dieses
   * Feld gehört ins Log, NIE in eine HTTP-Antwort (Audit-Befund S8, CLAUDE.md
   * „keine Appwrite-Fehlerdetails an Clients leaken").
   *
   * DAS GANZE ERGEBNIS BLEIBT SERVERSEITIG. Hier stand bis zum 2026-08-02 ein
   * `publicContributorResults()`, das die Liste für einen Client entschärfte —
   * es hatte genau einen Aufrufer (die Admin-Löschroute), und der hängte sie an
   * einen 500er, aus dem der zentrale Fehler-Handler ausschließlich `data.code`
   * herausholt. Sie kam also nie an. Die Route sagt jetzt in EINEM Grund, was
   * zu tun ist (`deletion_incomplete`); WELCHE Layer offen sind, steht
   * strukturiert im Log (`gdpr.delete_incomplete`) — dort, wo man es beim
   * Nachfassen ohnehin liest.
   */
  error?: string
}

export interface DeleteUserResult {
  ok: boolean
  /** fileId des Pre-Delete-Snapshots (falls Bucket konfiguriert) */
  exportFileId?: string
  results: ContributorRunResult[]
}

/**
 * Ist das Appwrites „dieses Konto gibt es nicht"? Nur ein `AppwriteException`
 * mit 404 UND der Art `user_not_found`. Ein 404 ohne Art zählt nicht: so
 * antwortet der Proxy vor Appwrite, wenn der Dienst dahinter fehlt.
 *
 * Für jeden, der aus `users.get` „Konto schon weg" schliesst (SEC-026,
 * Nachtrag): vorher stand dort `.catch(() => null)`, und JEDER Fehler — ein
 * 500, ein Netz-Wackler — galt als „weg". Im Orchestrator hiess das: kein
 * Snapshot, keine Sperre, aber die Contributors löschten trotzdem; in den
 * Layern: Einladungen und Anfragen unter der Adresse blieben still stehen.
 */
export function isAppwriteUserMissing(error: unknown): boolean {
  if (!(error instanceof AppwriteException) || error.code !== 404) return false
  return error.type === 'user_not_found'
}

/** Aufbewahrungsfrist der Snapshots (Plan §4.8; durchgesetzt stündlich, SEC-009) */
export const GDPR_EXPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** `via` → Empfänger (pur): `session` ⇒ die Person selbst, `admin` ⇒ der Betreiber. */
export function exportAudience(via: 'session' | 'admin'): UserDataAudience {
  return via === 'session' ? 'self' : 'operator'
}

export async function exportUserCompletely(
  event: H3Event,
  userId: string,
  opts: { via: 'session' | 'admin' },
): Promise<UserDataExport> {
  const admin = createAdminClient(event)

  // Account immer über die Users-API (voller Datensatz); im Session-Pfad ist
  // der Context-User der Fallback für einen einzelnen Blip.
  const account = await admin.users.get({ userId })
    .catch(() => (opts.via === 'session' ? event.context.user : null))
  if (!account) {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  // Sitzungen: im ADMIN-Pfad streng — er liefert den Snapshot vor der
  // Löschung und den Betreiber-Export, und beide müssen vollständig sein (ein
  // leerer Abschnitt wäre eine Auskunft, die nicht stimmt). Im SELBST-Export
  // bleibt der Rückfall auf leer, aber gekennzeichnet (`sessionsUnavailable`).
  let sessions: Models.Session[]
  let sessionsUnavailable = false
  if (opts.via === 'session') {
    try {
      sessions = (await createSessionClient(event).account.listSessions()).sessions
    }
    catch {
      sessions = []
      sessionsUnavailable = true
    }
  }
  else {
    sessions = (await admin.users.listSessions({ userId })).sessions
  }

  // Empfänger des Exports (SEC-034): der Selbst-Export geht an die Person,
  // jeder Admin-Pfad — der Betreiber-Export UND die Kopie vor einer
  // Löschung — an den Betreiber. Die Beiträge entscheiden daran, was sie
  // herausgeben (messages: keine Nachrichtentexte an den Betreiber).
  const context: UserDataExportContext = { audience: exportAudience(opts.via) }
  const data: Record<string, unknown> = {}
  for (const contributor of listUserDataContributors()) {
    // Export MUSS vollständig sein — ein werfender Contributor bricht ab
    // (halbe Exporte wären schlimmer als ein klarer Fehler).
    data[contributor.id] = await contributor.exportUserData(event, userId, context)
  }

  return {
    exportedAt: new Date().toISOString(),
    account: mapExportAccount(account),
    sessions: mapExportSessions(sessions),
    ...(sessionsUnavailable ? { sessionsUnavailable: true as const } : {}),
    data,
  }
}

/** Snapshot in den gdpr-exports-Bucket schreiben; wirft bei Fehlern (Abbruchkriterium). */
async function writeSnapshot(event: H3Event, userId: string, payload: UserDataExport): Promise<string | undefined> {
  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) return undefined // Bucket nicht konfiguriert → Löschung ohne Snapshot

  const admin = createAdminClient(event)
  const filename = `gdpr-export-${userId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const file = await admin.storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(Buffer.from(JSON.stringify(payload, null, 2)), filename),
    // Zweitverteidigung — die eigentliche Autorität sind die Admin-Routen
    // (requirePermission users.manage); der Browser hat ohnehin keine SDK-Session.
    permissions: [Permission.read(Role.label('admin'))],
  })

  // Zusätzliches Netz: abgelaufene Alt-Snapshots gleich mit abräumen. Die
  // Frist GARANTIERT der stündliche Lauf (plugins/gdpr-export-prune.ts,
  // SEC-009) — ein Fehler hier darf die Löschung deshalb nicht aufhalten.
  await cleanupExpiredGdprExports(event).catch(() => {})

  return file.$id
}

/** Zähler eines Aufräum-Laufs über den gdpr-exports-Bucket. */
export interface GdprExportPruneResult {
  /** Gelesene Dateien (bis einschließlich der ersten noch nicht abgelaufenen). */
  scanned: number
  /** Davon älter als die Aufbewahrungsfrist. */
  expired: number
  /** Wirklich entfernt (ein 404 beim Löschen zählt mit: schon weg). */
  removed: number
  /** Löschen gescheitert — bleibt liegen, der nächste Lauf versucht es erneut. */
  failed: number
}

export interface GdprExportPruneOptions {
  /** Nur zählen, nichts löschen (Handroute, Standard dort). */
  dryRun?: boolean
  /** Bezugszeitpunkt für die Frist — nur für Tests. */
  now?: Date
}

const GDPR_EXPORT_PAGE_SIZE = 100
/**
 * Harte Obergrenze an Seiten je Lauf (= 5.000 Dateien). Ein Bucket, der in
 * einer Stunde mehr abgelaufene Kopien ansammelt, ist kein Normalbetrieb; der
 * Lauf hört dann mit einer Zeile auf und der nächste macht weiter, statt einen
 * Prozess unbegrenzt zu beschäftigen.
 */
const GDPR_EXPORT_MAX_PAGES = 50

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 404
}

/**
 * Alle Snapshots älter als die Aufbewahrungsfrist löschen (SEC-009). Läuft
 * OHNE Request (stündliches Plugin) und mit (Admin-Route) — Konfiguration und
 * Admin-Client sind ohne Event dieselben wie beim Digest-Sweep.
 *
 * Gelesen wird ÄLTESTES ZUERST, seitenweise per Cursor. Weil die Liste
 * aufsteigend nach `$createdAt` sortiert ist, ist hinter der ersten noch
 * gültigen Datei jede weitere ebenfalls jünger — dort endet der Lauf, ohne
 * den Rest des Buckets zu lesen.
 *
 * Fehler: eine scheiternde LISTE wirft (dann weiß der Lauf nichts); ein
 * scheiterndes LÖSCHEN wird gezählt (`failed`) und der Rest trotzdem
 * abgeräumt — weder verschluckt noch als Abbruch.
 */
export async function pruneExpiredGdprExports(
  event?: H3Event,
  opts: GdprExportPruneOptions = {},
): Promise<GdprExportPruneResult> {
  const result: GdprExportPruneResult = { scanned: 0, expired: 0, removed: 0, failed: 0 }
  const bucketId = useRuntimeConfig(event).public.appwriteGdprBucket
  if (!bucketId) return result

  const admin = createAdminClient(event)
  const cutoff = (opts.now ?? new Date()).getTime() - GDPR_EXPORT_RETENTION_MS
  // Cursor = die letzte Datei, die NOCH DA ist (Probelauf oder gescheitertes
  // Löschen). Eine gelöschte Datei als Cursor kennt Appwrite nicht mehr, und
  // ohne Cursor liest die nächste Seite wieder von vorn — dort stehen dann
  // nur noch die liegengebliebenen, die sonst doppelt gezählt würden.
  let cursor: string | undefined

  for (let page = 0; page < GDPR_EXPORT_MAX_PAGES; page++) {
    const queries = [Query.orderAsc('$createdAt'), Query.limit(GDPR_EXPORT_PAGE_SIZE)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const { files } = await admin.storage.listFiles({ bucketId, queries })

    for (const file of files) {
      result.scanned++
      if (Date.parse(file.$createdAt) >= cutoff) return result
      result.expired++
      if (opts.dryRun) {
        cursor = file.$id
        continue
      }
      try {
        await admin.storage.deleteFile({ bucketId, fileId: file.$id })
        result.removed++
      }
      catch (error) {
        if (isNotFound(error)) {
          result.removed++
        }
        else {
          result.failed++
          cursor = file.$id
        }
      }
    }

    if (files.length < GDPR_EXPORT_PAGE_SIZE) return result
  }

  logEvent('warn', 'gdpr.exports_prune_page_cap', { pages: GDPR_EXPORT_MAX_PAGES, ...result })
  return result
}

/**
 * Dünne Hülle für die zwei bisherigen Aufrufer (Snapshot schreiben, Admin-
 * Liste öffnen). Sie bleiben als zusätzliches Netz; die Frist garantiert der
 * stündliche Lauf.
 */
export async function cleanupExpiredGdprExports(event: H3Event): Promise<number> {
  return (await pruneExpiredGdprExports(event)).removed
}

let gdprExportPruneRunning = false

/**
 * Der Lauf mit Riegel (Plugin und Handroute). Ein zweiter Start, während einer
 * läuft, liefert `null` — zwei Läufe im selben Prozess würden dieselben
 * Dateien doppelt löschen und doppelt zählen.
 *
 * Log: eine Zeile nur, wenn etwas abgelaufen war oder scheiterte — ein
 * stündliches „0" macht das Log unlesbar (Regel wie beim Gast-Aufräumen).
 * Gescheitertes Löschen bekommt eine EIGENE error-Zeile, damit ein Ausfall im
 * Log auffällt und nicht in einer info-Zeile untergeht.
 */
export async function runGdprExportPrune(opts: GdprExportPruneOptions = {}): Promise<GdprExportPruneResult | null> {
  if (gdprExportPruneRunning) {
    logEvent('warn', 'gdpr.exports_prune_busy', {})
    return null
  }
  gdprExportPruneRunning = true
  try {
    const result = await pruneExpiredGdprExports(undefined, opts)
    const counts = { scanned: result.scanned, expired: result.expired, removed: result.removed, failed: result.failed }
    if (result.expired > 0 || result.failed > 0) logEvent('info', 'gdpr.exports_pruned', counts)
    if (result.failed > 0) logEvent('error', 'gdpr.exports_prune_incomplete', counts)
    return result
  }
  catch (error) {
    logEvent('error', 'gdpr.exports_prune_failed', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
  finally {
    gdprExportPruneRunning = false
  }
}

export async function deleteUserCompletely(
  event: H3Event,
  userId: string,
  opts: { actor: 'self' | 'admin' },
): Promise<DeleteUserResult> {
  const admin = createAdminClient(event)

  // (0) Existiert der Auth-User noch? 404 → Orphan-Cleanup-Modus (Re-Run,
  // defensiv): Snapshot/Sperren/Audit überspringen, nur noch aufräumen.
  // NUR das 404: jeder andere Fehler bricht hier ab, VOR allem Zerstörerischen.
  // Bis SEC-026 (Nachtrag) schaltete jeder Wackler in den Orphan-Modus — die
  // Contributors löschten dann ohne Snapshot und ohne Sperre.
  const user = await admin.users.get({ userId }).catch((error: unknown) => {
    if (isAppwriteUserMissing(error)) return null
    throw error
  })

  let exportFileId: string | undefined
  if (user) {
    // (1) SNAPSHOT — Fehler hier = Abbruch (ohne Snapshot keine Löschung).
    // Die Kopie liest der BETREIBER (30 Tage im Bucket) — sie ist deshalb ein
    // Betreiber-Export ohne Nachrichtentexte (SEC-034, Davids Ja 2026-11-16).
    const snapshot = await exportUserCompletely(event, userId, { via: 'admin' })
    exportFileId = await writeSnapshot(event, userId, snapshot)

    // (2) SPERREN — der User kann während des Cleanups nichts Neues erzeugen;
    // ein Teilfehler hinterlässt einen gesperrten (handlungsunfähigen) Account.
    // STRIKT: ohne erfolgreichen Block keine destruktiven Schritte — sonst
    // könnte ein Teilfehler einen UNgesperrten, halb bereinigten Account
    // hinterlassen. Re-Run nach Fehler ist gefahrlos (alles idempotent).
    await admin.users.updateStatus({ userId, status: false })
    // Session-Kill bleibt best effort: der Block macht bestehende Sessions
    // ohnehin handlungsunfähig.
    await admin.users.deleteSessions({ userId }).catch(() => {})

    // (3) AUDIT — OHNE Klarnamen (der steht im Snapshot, nicht im Log)
    if (opts.actor === 'self') {
      await logAuthEvent(event, 'user.self_deleted', { userId, name: '' })
    }
    // admin-Pfad: recordAudit macht die Route (admin-Layer-Util, core kennt ihn nicht)
  }

  // (4) CONTRIBUTORS — sequenziell, isoliert; ein kaputter Layer blockiert
  // nicht das Aufräumen der anderen.
  const results: ContributorRunResult[] = []
  for (const contributor of listUserDataContributors()) {
    try {
      const result = await contributor.deleteUserData(event, userId)
      results.push({ id: contributor.id, ok: true, ...result })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Diagnose SOFORT und strukturiert ins Log (S8): sie ist das, was den
      // Re-Run leitet — und sie verlässt den Server nicht mehr über die
      // Antwort. Ohne diese Zeile hinge sie allein an der Route, die das
      // Ergebnis gerade auswertet.
      logEvent('error', 'gdpr.contributor_failed', { contributor: contributor.id, userId, message })
      results.push({ id: contributor.id, ok: false, deleted: 0, anonymized: 0, error: message })
    }
  }

  // (5) CORE-EIGENE CLEANUPS (einzeln best effort; 404 = schon weg = Erfolg;
  // entscheiden NICHT über allOk/users.delete).
  // Avatar (BE-001): ALLE Dateien des Kontos im Avatar-Bucket, nicht nur die
  // aus prefs.avatarUrl — jeder Upload legt eine neue Datei an, ungespeicherte
  // bleiben sonst liegen. Die Suche nach Rechten braucht nur die userId und
  // läuft deshalb auch im Re-Run, wenn das Konto schon weg ist (dann fehlt nur
  // avatarId). Ein Fehlschlag ist nicht mehr still, sondern eine Log-Zeile.
  const config = useRuntimeConfig(event)
  const avatarsBucket = config.public.appwriteAvatarsBucket
  const prefs = user?.prefs as { avatarUrl?: string } | undefined
  const avatarId = avatarFileId(prefs?.avatarUrl, avatarsBucket)
  const avatarCleanup = await deleteAvatarFilesOf(admin.storage, avatarsBucket, userId, [avatarId])
  if (avatarCleanup.failed > 0) {
    logEvent('error', 'gdpr.avatar_cleanup_failed', { userId, failed: avatarCleanup.failed, deleted: avatarCleanup.deleted })
  }
  await admin.presences.delete({ presenceId: userId }).catch(() => {})

  // (6) FINALISIEREN — users.delete NUR bei Voll-Erfolg (hartes Abschlusskriterium)
  const allOk = results.every(r => r.ok)
  if (allOk && user) {
    await admin.users.delete({ userId })
  }

  return { ok: allOk, exportFileId, results }
}
