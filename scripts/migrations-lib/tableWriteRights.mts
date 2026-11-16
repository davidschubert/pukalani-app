/**
 * TABELLENRECHT „KONTEN DÜRFEN ANLEGEN" SETZEN ODER NEHMEN — EINE Hilfe für
 * die Migrationen, die eine Tabelle auf „nur der Server schreibt" umstellen
 * (SEC-002, GA1 P13), und für ihren Rückweg.
 *
 * ── WARUM EINE HILFE UND NICHT `updateTable` IN JEDER MIGRATION ───────────
 * `updateTable` SETZT, was man ihm gibt — und was man weglässt, fällt auf den
 * API-Default (dieselbe Falle wie `updateBucket`, system-039). Diese Hilfe
 * LIEST die Tabelle, ändert an der Rechte-Liste nur das eine Recht und
 * schreibt Name, Zeilen-Rechte-Schalter und „aktiv" unverändert zurück. Steht
 * die Tabelle schon im Zielzustand, schreibt sie nichts.
 *
 * ── WAS „NEHMEN" HEISST ───────────────────────────────────────────────
 * Aus den Tabellenrechten fällt jedes SCHREIB-Recht (`create`, `update`,
 * `delete`, `write`), egal für wen. Lese-Rechte der Tabelle bleiben stehen.
 * Die Rechte einzelner ZEILEN fasst diese Hilfe nicht an.
 *
 * ── REIHENFOLGE (umgekehrt zur üblichen Regel!) ──────────────────────────
 * ERST der Code-Stand, der über den Server schreibt, auf ALLEN Seiten live —
 * DANN das Recht nehmen. Alter Code + genommenes Recht = jedes Anlegen
 * scheitert. Der Code seit der jeweiligen Etappe läuft mit beiden Zuständen.
 *
 * Das SDK kommt vom Aufrufer (Node löst `node-appwrite` relativ zur
 * importierenden Datei auf — Begründung in `runLeaseTable.mts`).
 */
import type { TablesDB } from 'node-appwrite'

const WRITE_RIGHT = /^(create|update|delete|write)\(/
const ACCOUNT_CREATE = 'create("users")'

export type TableRightOutcome = 'changed' | 'unchanged' | 'missing'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** PUR (getestet): die Rechte-Liste ohne Schreib-Rechte. */
export function withoutWriteRights(permissions: readonly string[]): string[] {
  return permissions.filter(permission => !WRITE_RIGHT.test(permission))
}

/** PUR (getestet): die Rechte-Liste mit dem Anlege-Recht für Konten (Rückweg). */
export function withAccountCreateRight(permissions: readonly string[]): string[] {
  return permissions.includes(ACCOUNT_CREATE) ? [...permissions] : [...permissions, ACCOUNT_CREATE]
}

async function rewrite(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
  next: (current: readonly string[]) => string[],
): Promise<TableRightOutcome> {
  let table
  try {
    table = await tablesDB.getTable({ databaseId, tableId })
  }
  catch (error) {
    // Nicht jede Instanz trägt jede Tabelle (Bestands-Silo ohne Reaktionen).
    if (hasCode(error, 404)) return 'missing'
    throw error
  }
  const current = table.$permissions ?? []
  const permissions = next(current)
  if (permissions.length === current.length && permissions.every(p => current.includes(p))) return 'unchanged'
  await tablesDB.updateTable({
    databaseId,
    tableId,
    name: table.name,
    permissions,
    rowSecurity: table.rowSecurity,
    enabled: table.enabled,
  })
  // Zurücklesen: der Beweis steht in der Datenbank, nicht in der Antwort.
  const after = await tablesDB.getTable({ databaseId, tableId })
  const got = after.$permissions ?? []
  if (got.length !== permissions.length || !permissions.every(p => got.includes(p))) {
    throw new Error(`${tableId}: Rechte nach dem Schreiben nicht wie erwartet (${got.length} statt ${permissions.length})`)
  }
  if (after.rowSecurity !== table.rowSecurity || after.enabled !== table.enabled || after.name !== table.name) {
    throw new Error(`${tableId}: Name, Zeilen-Rechte-Schalter oder „aktiv" haben sich mitgeändert`)
  }
  return 'changed'
}

/** Das Schreib-Recht der Konten an der Tabelle NEHMEN. Idempotent. */
export function dropAccountWriteRight(tablesDB: TablesDB, databaseId: string, tableId: string): Promise<TableRightOutcome> {
  return rewrite(tablesDB, databaseId, tableId, withoutWriteRights)
}

/** RÜCKWEG: das Anlege-Recht der Konten wieder SETZEN. Idempotent. */
export function restoreAccountCreateRight(tablesDB: TablesDB, databaseId: string, tableId: string): Promise<TableRightOutcome> {
  return rewrite(tablesDB, databaseId, tableId, withAccountCreateRight)
}

/** Eine Zeile Protokoll je Tabelle — gleich für Migration und Rückweg. */
export function describeOutcome(tableId: string, outcome: TableRightOutcome, verb: 'genommen' | 'gesetzt'): string {
  if (outcome === 'missing') return `↷ ${tableId}: gibt es in diesem Projekt nicht — nichts zu tun`
  if (outcome === 'unchanged') return `↷ ${tableId}: steht schon im Zielzustand`
  return `✔ ${tableId}: Schreib-Recht der Konten an der Tabelle ${verb} (zurückgelesen)`
}
