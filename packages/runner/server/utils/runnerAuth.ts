import type { H3Event } from 'h3'
import { createHash, timingSafeEqual } from 'node:crypto'
import { RUNNERS_TABLE, type RunnerRow } from '../../shared/types/runner'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * Die Runner-Naht: Bearer-Secret statt Session (docs/archiv/AI-RUNNER.md § 5).
 *
 * TOKEN-FORMAT `<runnerRowId>.<secret>`. Die Row-Id VOR dem Punkt ist kein
 * Schmuck: ohne sie müsste der Server jede Runner-Zeile laden und gegen jeden
 * Hash rechnen — ein Scan bei jedem Poll, der mit jedem registrierten Rechner
 * teurer wird. Die Id ist kein Geheimnis (sie steht im Board), das Secret
 * dahinter ist es.
 *
 * DAS SECRET DARF NIRGENDWO AUFTAUCHEN: nicht im Log, nicht in einer
 * Fehlermeldung, nicht als Query-Parameter (§ 5 — Query-Strings landen in
 * nginx-Logs, in Referrern und in der Shell-History). Deshalb liest diese
 * Datei ausschliesslich den `Authorization`-Header.
 */

/** SHA-256 als Hex — genau das Format, das `runners.secretHash` (64) fasst. */
export function hashRunnerSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * EIN Fehlerbild für JEDEN Fehlweg — kein Header, kaputtes Format, unbekannte
 * Id, stillgelegter Runner, falsches Secret.
 *
 * Der Grund ist ein Orakel-Argument: „Runner existiert nicht" ≠ „Secret
 * falsch" verrät einem Fremden, welche Row-Ids echt sind, und „stillgelegt" ≠
 * „falsches Secret" verrät ihm, dass er das richtige Secret hat. Beides ist
 * hier billig zu vermeiden, weil es niemanden gibt, dem die Unterscheidung
 * helfen würde: der einzige legitime Aufrufer ist ein Programm mit einer
 * Konfigurationsdatei.
 */
function unauthorized() {
  return createError({ status: 401, statusText: 'Unauthorized' })
}

/**
 * Der Aufrufer, oder 401. Gibt die Runner-Zeile zurück.
 *
 * STEMPELT BEWUSST KEIN `lastSeenAt`: das macht nur `runners/heartbeat`.
 * Sonst schriebe jeder Claim-Poll — also alle paar Sekunden, rund um die Uhr —
 * eine Appwrite-Zeile, nur damit ein Feld sich um zwei Sekunden bewegt.
 */
export async function requireRunner(event: H3Event): Promise<RunnerRow> {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) throw unauthorized()

  const separator = match[1]!.indexOf('.')
  if (separator <= 0) throw unauthorized()
  const runnerId = match[1]!.slice(0, separator)
  const secret = match[1]!.slice(separator + 1)
  if (!runnerId || !secret || runnerId.length > 36) throw unauthorized()

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const runner = await tablesDB.getRow<RunnerRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RUNNERS_TABLE,
    rowId: runnerId,
  }).catch(softFail('runner:utils/runnerAuth:getRow', null))
  if (!runner) throw unauthorized()

  // Stillgelegt ist der Aus-Schalter (§ 4) — er muss VOR dem Vergleich
  // greifen, sonst wäre die Antwortzeit ein Orakel für „Secret stimmt".
  if (runner.status !== 'active') throw unauthorized()

  const expected = Buffer.from(runner.secretHash, 'utf8')
  const actual = Buffer.from(hashRunnerSecret(secret), 'utf8')
  // `timingSafeEqual` WIRFT bei ungleicher Länge (statt false zu liefern) —
  // die Prüfung davor ist deshalb Pflicht, nicht Vorsicht. Sie verrät nichts:
  // die Länge eines Hex-SHA-256 ist immer 64, ungleich wird sie nur, wenn die
  // Spalte leer/verstümmelt ist.
  if (expected.length !== actual.length) throw unauthorized()
  if (!timingSafeEqual(expected, actual)) throw unauthorized()

  return runner
}

/**
 * Gehört dieser Lauf dem Aufrufer? (§ 5: „Ein Runner darf nur Läufe bewegen,
 * die auf IHN geclaimt sind.") Der Vergleich ist das Netz unter dem
 * In-Prozess-Mutex des Claims — er hält auch dann, wenn die Konsole eines
 * Tages mehr-instanzig läuft.
 */
export function requireOwnRun(runnerId: string, runRunnerId: string) {
  if (!runRunnerId || runRunnerId !== runnerId) {
    throw createError({ status: 403, statusText: 'Forbidden', data: { code: 'not_your_run' } })
  }
}
