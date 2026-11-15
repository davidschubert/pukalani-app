import { AppwriteException, Query, type TablesDB } from 'node-appwrite'
import { inviteCodeErasure } from '../../shared/communityTeam'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../shared/types/inviteCode'
import { INVITE_REQUESTS_TABLE, type InviteRequestRow } from '../../shared/types/inviteRequest'

/**
 * Aufräumen erledigter Anfragen (control-017).
 *
 * Eine Anfrage ist eine E-Mail-Adresse von jemandem, der etwas wollte — also
 * ein personenbezogenes Datum ohne Vertrag. Es darf nicht liegen bleiben, „bis
 * jemand aufräumt": abgelehnte Anfragen verschwinden nach 30 Tagen, eingelöste
 * nach 90 (so lange ist der Trichter noch auswertbar, danach reicht die
 * Community selbst als Beleg).
 *
 * NICHT gelöscht wird, was noch offen ist (`new`, `assigned`, `deferred`) —
 * dort wartet jemand auf eine Antwort.
 *
 * DIE ADRESSE AM CODE GEHT MIT (SEC-026, 2026-11-15): `assignCode` hat sie bei
 * der Zuweisung an den Code geschrieben — `boundEmail` und, bei einem neuen
 * Code, das Etikett „Anfrage <adresse>". Ohne diesen Schritt stand sie nach
 * dem Löschen der Anfrage für immer in der Code-Liste des Betreibers. Geleert
 * wird mit DERSELBEN puren Regel wie bei der Kontolöschung
 * (`inviteCodeErasure`); der Code selbst bleibt, er ist ein Platz im Vorrat.
 * REIHENFOLGE: erst der Code, dann die Anfrage. Scheitert der Code, bleibt die
 * Anfrage stehen — sie ist der einzige Merker, welche Adresse an welchem Code
 * hängt, und der nächste Lauf versucht es wieder.
 */
export const PRUNE_AFTER_DAYS = { declined: 30, redeemed: 90 } as const

/** PURE (unit-getestet): Ist diese Zeile fällig? */
export function shouldPruneRequest(
  row: Pick<InviteRequestRow, 'status' | 'redeemedAt'> & { $updatedAt?: string },
  now: number,
): boolean {
  const status = row.status || 'new'
  if (status !== 'declined' && status !== 'redeemed') return false
  const days = PRUNE_AFTER_DAYS[status]
  // Bezugspunkt ist die letzte Änderung — bei „eingelöst" also der Moment, in
  // dem die Community entstand.
  const stamp = row.redeemedAt || row.$updatedAt
  if (!stamp) return false
  const parsed = Date.parse(stamp)
  if (!Number.isFinite(parsed)) return false
  return now - parsed >= days * 24 * 60 * 60 * 1000
}

export interface PruneResult {
  checked: number
  deleted: number
  /** Codes, an denen die Adresse einer gelöschten Anfrage stand und die geleert wurden. */
  codesCleared: number
}

/**
 * Die Codes EINER Anfrage — über beide Verweise, die `assignCode` setzt:
 * `invite_requests.inviteCodeId` (Anfrage → Code) und `invite_codes.requestId`
 * (Code → Anfrage). Beide, weil ein Code aus dem Vorrat ersetzt oder eine
 * Anfrage ohne Rückschreiben geblieben sein kann; doppelte fallen über die Id
 * zusammen. Ein 404 am Verweis heißt „Code gibt es nicht mehr", kein Fehler.
 */
async function codesOfRequest(tablesDB: TablesDB, databaseId: string, request: InviteRequestRow): Promise<InviteCodeRow[]> {
  const byId = new Map<string, InviteCodeRow>()
  if (request.inviteCodeId) {
    try {
      const code = await tablesDB.getRow<InviteCodeRow>({ databaseId, tableId: INVITE_CODES_TABLE, rowId: request.inviteCodeId })
      byId.set(code.$id, code)
    }
    catch (error) {
      if (!(error instanceof AppwriteException && error.code === 404)) throw error
    }
  }
  const { rows } = await tablesDB.listRows<InviteCodeRow>({
    databaseId,
    tableId: INVITE_CODES_TABLE,
    // Eine Anfrage bekommt genau einen Code; 25 ist das Netz, nicht die Erwartung.
    queries: [Query.equal('requestId', request.$id), Query.limit(25)],
  })
  for (const code of rows) byId.set(code.$id, code)
  return [...byId.values()]
}

/** Leert die Adresse der Anfrage an ihren Codes. Wirft — der Aufrufer lässt die Anfrage dann stehen. */
async function clearRequestAddressOnCodes(tablesDB: TablesDB, databaseId: string, request: InviteRequestRow): Promise<number> {
  let cleared = 0
  for (const code of await codesOfRequest(tablesDB, databaseId, request)) {
    const patch = inviteCodeErasure(code, request.email ?? '')
    if (!patch) continue // schon leer oder ein Code mit anderer Adresse
    await tablesDB.updateRow<InviteCodeRow>({ databaseId, tableId: INVITE_CODES_TABLE, rowId: code.$id, data: patch })
    cleared += 1
  }
  return cleared
}

export async function pruneInviteRequests(now: number = Date.now()): Promise<PruneResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  const { rows } = await admin.tablesDB.listRows<InviteRequestRow>({
    databaseId,
    tableId: INVITE_REQUESTS_TABLE,
    queries: [Query.equal('status', ['declined', 'redeemed']), Query.limit(100)],
  })

  let deleted = 0
  let codesCleared = 0
  for (const row of rows) {
    if (!shouldPruneRequest(row, now)) continue
    try {
      codesCleared += await clearRequestAddressOnCodes(admin.tablesDB, databaseId, row)
    }
    catch (error) {
      logEvent('warn', 'invite.prune_code_failed', {
        requestId: row.$id, message: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    await admin.tablesDB.deleteRow({ databaseId, tableId: INVITE_REQUESTS_TABLE, rowId: row.$id })
      .then(() => { deleted += 1 })
      .catch(error => logEvent('warn', 'invite.prune_failed', {
        requestId: row.$id, message: error instanceof Error ? error.message : String(error),
      }))
  }

  // Eigene Zeile, nur Zahlen: die Zeile des Plugins nennt nur `deleted`.
  if (codesCleared) logEvent('info', 'invite.prune_codes_cleared', { codesCleared, deleted })
  return { checked: rows.length, deleted, codesCleared }
}
