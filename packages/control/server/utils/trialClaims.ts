import { createHash } from 'node:crypto'
import { AppwriteException } from 'node-appwrite'
import type { H3Event } from 'h3'
import { isAppwriteTableMissing } from '../../../core/server/utils/listAllRows'
import {
  TRIAL_CLAIMS_TABLE,
  type TrialClaimOutcome,
  type TrialClaimRow,
  type TrialClaimSource,
} from '../../shared/types/trialClaim'

/**
 * DIE TESTPHASE GIBT ES EINMAL JE KONTO (BE-015, Davids Entscheidung
 * 2026-11-16).
 *
 * Die Person ist das Konto im Runtime-Projekt (Projekt + Konto-Id), nicht die
 * Community: wer schon eine Testphase hatte, bekommt keine zweite — auch nicht
 * über eine weitere Community, auch nicht, nachdem die erste stillgelegt ist.
 *
 * WIE: EINE Zeile je Konto in `trial_claims` (control-039) mit FESTER Id. Das
 * Anlegen IST die Vergabe — 201 ⇒ jetzt vergeben, 409 ⇒ gab es schon. Kein
 * „erst lesen, dann schreiben": zwei gleichzeitige Anlagen desselben Kontos
 * bekommen genau eine Testphase, auch ohne die Sperre aus controlLock.ts.
 *
 * FEHLT DIE TABELLE (Migration noch nicht gefahren, der Deploy kann vor oder
 * nach ihr live gehen), gilt das alte Verhalten: `unavailable`, und der
 * Aufrufer schreibt eine Fehler-Zeile. JEDER ANDERE Fehler wirft — eine Regel,
 * die nicht prüfen kann, vergibt nicht auf Verdacht.
 */

/** Die feste Zeilen-Id: 'tc' + 32 Hex-Zeichen aus sha256(projekt:konto) — 34 Zeichen, [a-z0-9]. */
export function trialClaimRowId(projectId: string, userId: string): string {
  return `tc${createHash('sha256').update(`${projectId}:${userId}`, 'utf8').digest('hex').slice(0, 32)}`
}

function isConflict(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409
}

/** „Diese Zeile gibt es nicht" — nur ein 404 mit der Art einer fehlenden ZEILE. */
function isRowMissing(error: unknown): boolean {
  if (!(error instanceof AppwriteException) || error.code !== 404) return false
  return error.type === 'row_not_found' || error.type === 'document_not_found'
}

export interface TrialClaimAccount {
  projectId: string
  userId: string
}

function claimsTable(event: H3Event) {
  return {
    tablesDB: createAdminClient(event).tablesDB,
    databaseId: useRuntimeConfig(event).public.appwriteDatabaseId,
  }
}

/**
 * Die Testphase für dieses Konto vergeben — oder feststellen, dass es sie
 * schon gab. `communityId` ist die (vorab erzeugte) Id der Community, die
 * gleich angelegt wird.
 */
export async function claimTrial(
  event: H3Event,
  account: TrialClaimAccount,
  communityId: string,
  now: number = Date.now(),
  source: TrialClaimSource = 'onboarding',
): Promise<TrialClaimOutcome> {
  if (!communityId) throw new Error('claimTrial: communityId fehlt')
  const { tablesDB, databaseId } = claimsTable(event)
  try {
    await tablesDB.createRow<TrialClaimRow>({
      databaseId,
      tableId: TRIAL_CLAIMS_TABLE,
      rowId: trialClaimRowId(account.projectId, account.userId),
      data: {
        runtimeProjectId: account.projectId,
        runtimeUserId: account.userId,
        communityId,
        source,
        claimedAt: new Date(now).toISOString(),
      },
    })
    return 'granted'
  }
  catch (error) {
    if (isConflict(error)) return 'used'
    if (isAppwriteTableMissing(error)) return 'unavailable'
    throw error
  }
}

/**
 * Eine eben vergebene Testphase zurücknehmen (die Anlage der Community ist
 * danach gescheitert). Wirft nicht: ein Fehler wird gezählt
 * (`onboarding.trial_claim_release_failed`), der eigentliche Fehler der Anlage
 * geht beim Aufrufer weiter.
 */
export async function releaseTrialClaim(event: H3Event, account: TrialClaimAccount, communityId: string): Promise<void> {
  const { tablesDB, databaseId } = claimsTable(event)
  try {
    await tablesDB.deleteRow({
      databaseId,
      tableId: TRIAL_CLAIMS_TABLE,
      rowId: trialClaimRowId(account.projectId, account.userId),
    })
  }
  catch (error) {
    if (isRowMissing(error)) return
    logEvent('error', 'onboarding.trial_claim_release_failed', {
      communityId,
      runtimeUserId: account.userId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Die Zeile dieses Kontos lesen. `null` heißt „keine Testphase vergeben" —
 * auch, wenn die Tabelle noch fehlt (dann kann es keine geben). Jeder andere
 * Lesefehler wirft (Auskunft, Löschung und Vorab-Prüfung brechen dann ab statt
 * „nichts da" zu melden).
 */
export async function readTrialClaim(event: H3Event, account: TrialClaimAccount): Promise<TrialClaimRow | null> {
  const { tablesDB, databaseId } = claimsTable(event)
  try {
    return await tablesDB.getRow<TrialClaimRow>({
      databaseId,
      tableId: TRIAL_CLAIMS_TABLE,
      rowId: trialClaimRowId(account.projectId, account.userId),
    })
  }
  catch (error) {
    if (isRowMissing(error) || isAppwriteTableMissing(error)) return null
    throw error
  }
}

/** DSGVO-Löschung: die Zeile dieses Kontos entfernen. `true` = gelöscht. */
export async function deleteTrialClaim(event: H3Event, account: TrialClaimAccount): Promise<boolean> {
  const { tablesDB, databaseId } = claimsTable(event)
  try {
    await tablesDB.deleteRow({
      databaseId,
      tableId: TRIAL_CLAIMS_TABLE,
      rowId: trialClaimRowId(account.projectId, account.userId),
    })
    return true
  }
  catch (error) {
    if (isRowMissing(error) || isAppwriteTableMissing(error)) return false
    throw error
  }
}
