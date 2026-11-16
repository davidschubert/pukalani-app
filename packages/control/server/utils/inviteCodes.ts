import { createHash, randomInt } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { INVITE_CODES_TABLE, evaluateInviteCode, type InviteCodeRow, type InviteCodeVerdict } from '../../shared/types/inviteCode'

/**
 * Einladungs-Codes: Suche + Einlösung (control-016).
 *
 * Gespeichert wird nur der sha256-Hash. Codes werden vor dem Hashen
 * normalisiert (trim + Großschreibung), damit „pukalani-2026-abcd" und
 * „PUKA-2026-ABCD" derselbe Code sind — abgetippte Codes verschluckt man
 * sonst an der Groß-/Kleinschreibung.
 */

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex')
}

/**
 * Einen neuen Code-Klartext erzeugen. Verwechslungsfreies Alphabet (kein 0/O,
 * kein 1/I/L) — Codes werden abgetippt und am Telefon vorgelesen; randomInt
 * (CSPRNG), weil der Code das Zugangsgeheimnis IST.
 *
 * Hier und nicht in der Route, weil zwei Wege ihn brauchen: der Betreiber, der
 * einen Code ausstellt, und die Zuweisung aus der Warteschlange.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function issueCodeValue(): string {
  const block = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `PUKA-${block(4)}-${block(4)}`
}

export async function findInviteCode(event: H3Event, code: string): Promise<InviteCodeRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    queries: [Query.equal('codeHash', hashInviteCode(code)), Query.limit(1)],
  })
  return rows[0] ?? null
}

export interface InviteCheck extends InviteCodeVerdict {
  row: InviteCodeRow | null
}

/** Nicht-verbrauchende Prüfung (Wizard-Eintritt). `email` entscheidet über
 *  gebundene Codes (control-017) — ohne sie gilt ein gebundener Code als
 *  ungültig, nie als frei. `emailVerified` muss für gebundene Codes `true`
 *  sein (Audit 2026-08-02): eine Adresse ohne Bestätigung ist eine Behauptung,
 *  und der Pool lässt jeden eine beliebige behaupten. */
export async function checkInviteCode(
  event: H3Event,
  code: string,
  now: number = Date.now(),
  email?: string,
  emailVerified?: boolean,
): Promise<InviteCheck> {
  const row = await findInviteCode(event, code)
  return { ...evaluateInviteCode(row, now, email, emailVerified), row }
}

/**
 * EINE EINLÖSUNG RESERVIEREN — VOR der Anlage, atomar (BE-013).
 *
 * `incrementRowColumn` mit `max = maxUses` zählt in der Datenbank selbst hoch
 * und lehnt ab, wenn der Wert die Grenze überschritte (Appwrite 400
 * `column_limit_exceeded`; lokal gegen 2.7.1 gemessen: von zehn gleichzeitigen
 * Aufrufen mit `max: 1` genau einer durch). Vorher stand hier ein
 * „lesen, plus eins, schreiben" NACH der Anlage — zwei gleichzeitige
 * Einlösungen desselben Codes kamen beide durch, und die Grenze des Codes war
 * keine. `maxUses: 0` heißt „ohne Grenze" (`evaluateInviteCode`): dann wird
 * nur gezählt.
 *
 * `exhausted` ist die Antwort für einen erschöpften Code. Jeder ANDERE Fehler
 * (Netz, 5xx) wird ein 503 — die Community entsteht dann nicht, denn ohne
 * Reservierung ist nicht belegt, dass der Code noch gilt.
 */
export async function reserveInviteCodeUse(event: H3Event, row: InviteCodeRow): Promise<'reserved' | 'exhausted'> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  try {
    await admin.tablesDB.incrementRowColumn({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INVITE_CODES_TABLE,
      rowId: row.$id,
      column: 'uses',
      value: 1,
      ...(row.maxUses > 0 ? { max: row.maxUses } : {}),
    })
    return 'reserved'
  }
  catch (error) {
    if (isColumnLimitExceeded(error)) return 'exhausted'
    logEvent('error', 'onboarding.invite_reserve_failed', {
      inviteCodeId: row.$id,
      message: error instanceof Error ? error.message : String(error),
    })
    throw createError({ status: 503, statusText: 'Invite code unavailable', data: { code: 'invite_unavailable' } })
  }
}

function isColumnLimitExceeded(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { type?: unknown }).type === 'column_limit_exceeded'
}

/**
 * Eine reservierte Einlösung zurückgeben — wenn die Anlage scheitert oder ein
 * Retry die schon vorhandene eigene Community wiederfindet (`reused`): ein
 * Wiederholen darf keine zweite Einlösung kosten. `min: 0`, damit der Zähler
 * nie unter null fällt. Wirft NIE: der Aufrufer meldet gerade das eigentliche
 * Ergebnis (oder den eigentlichen Fehler), und das soll ankommen. Ein
 * Fehlschlag ist eine zählbare Zeile — der Code gilt dann einmal weniger.
 */
export async function releaseInviteCodeUse(event: H3Event, row: InviteCodeRow, reason: 'provision_failed' | 'reused'): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  try {
    await admin.tablesDB.decrementRowColumn({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INVITE_CODES_TABLE,
      rowId: row.$id,
      column: 'uses',
      value: 1,
      min: 0,
    })
  }
  catch (error) {
    logEvent('error', 'onboarding.invite_release_failed', {
      inviteCodeId: row.$id,
      reason,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
