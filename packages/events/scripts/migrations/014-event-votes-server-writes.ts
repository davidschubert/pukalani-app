/**
 * Migration events-014: `event_votes` schreibt nur noch der Server
 * (SEC-002, GA1 P13 — Davids Entscheidung 2026-11-12: „künftig schreibt nur
 * noch unser Server").
 *
 * ── Was diese Migration setzt ───────────────────────────────────────────
 * Aus den Rechten der TABELLEN fällt jedes Schreib-Recht. Stimmen auf Termine legt seit
 * Etappe 2/3 der Server mit dem Admin-Client an, nach seinen Prüfungen; die
 * eigene Zeile findet jede Route über das angemeldete Konto. Name,
 * Zeilen-Rechte-Schalter und „aktiv" werden gelesen und unverändert
 * zurückgeschrieben (`scripts/migrations-lib/tableWriteRights.mts`). Die
 * Rechte einzelner ZEILEN fasst sie nicht an: Leserechte bleiben; alte
 * Schreibrechte an Zeilen nimmt `scripts/ops/strip-row-write-rights.mjs`.
 * Eine Tabelle, die es in einem Projekt nicht gibt, wird übersprungen.
 *
 * Diese Migration BESITZT das Tabellenrecht dieser Tabellen; ältere
 * Migrationen setzen es nicht mehr.
 *
 * ⚠️ REIHENFOLGE — UMGEKEHRT ZUR ÜBLICHEN REGEL: ERST der Code-Stand der
 * Etappe 2/3 auf ALLEN Seiten live, DANN diese Migration. Alter Code +
 * genommenes Recht = jedes Anlegen scheitert. Der Code seit Etappe 2/3 läuft
 * mit beiden Zuständen.
 *
 * RÜCKWEG (ein Befehl, setzt genau dieses Recht wieder):
 *   packages/events/scripts/rollback/014-server-writes.rollback.ts
 *
 *   pnpm migrate --app <app> --only events-014
 *
 * Benötigte Key-Scopes: tables.* (Migrations-Key). Idempotent.
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'
import { dropAccountWriteRight, describeOutcome } from '../../../../scripts/migrations-lib/tableWriteRights.mts'

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

console.log(`Migration events-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

console.log(describeOutcome('event_votes', await dropAccountWriteRight(tablesDB, databaseId, 'event_votes'), 'genommen'))

console.log('✔ Migration events-014 fertig')
