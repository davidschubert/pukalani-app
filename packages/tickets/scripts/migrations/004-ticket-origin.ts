/**
 * Migration tickets-004 (SEC-038): Spalte `tickets.origin` — die HERKUNFT des
 * Ticket-Textes (`operator` | `staff` | `feedback` | `dependency`, '' =
 * unbekannt; Regeln in packages/tickets/shared/ticketOrigin.ts).
 *
 * WARUM: ob ein Runner-Auftrag aus einem Ticket als „geprüft" gilt, rechnete
 * bisher der Browser aus `feedbackId === ''` — und beim Kopieren wird
 * `feedbackId` geleert. Jetzt bestimmt es der Server aus dieser Spalte, die
 * jeder Schreibweg serverseitig setzt und die beim Kopieren mitreist.
 *
 * BEWUSST KEIN BACKFILL und KEIN INDEX: bestehende Zeilen bleiben '' (=
 * unbekannt = gilt als NICHT geprüft). Eine nachträgliche Einstufung wäre eine
 * Behauptung über Text, dessen Ursprung niemand mehr belegen kann; wer ein
 * Altticket als Betreiber-Auftrag fahren will, legt es neu an. Gefragt wird die
 * Spalte nur je Zeile, nie per Query.
 *
 * Zeilenbudget: varchar(16) kostet in utf8mb4 64 Byte — die `tickets`-Tabelle
 * ist mit `description` (10000) knapp, aber das passt (Lektion tickets-003).
 *
 * ZERSTÖRT NICHTS und ist WIEDERHOLBAR: legt nur die eine Spalte an, eine
 * vorhandene wird übersprungen (409 bzw. Vorab-Blick auf die Spaltenliste).
 *
 *   pnpm migrate --app <app> --layer tickets
 */
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration tickets-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const ticketCols = await existingColumnKeys('tickets')
await columnStep('Column tickets.origin', 'origin', ticketCols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: 'tickets', key: 'origin', size: 16, required: false, xdefault: '',
}))

// Erst fertig melden, wenn die Spalte beschreibbar ist — der nächste Deploy
// schreibt `origin` an jedem Anlege-Weg.
await waitForColumns('tickets')

console.log('✔ Migration tickets-004 fertig')
