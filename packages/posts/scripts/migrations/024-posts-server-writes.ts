/**
 * Migration posts-024: `community_posts` schreibt nur noch der Server (SEC-002,
 * GA1 P13 — Davids Entscheidung 2026-11-12: „künftig schreibt nur noch unser
 * Server; zuerst Beiträge und Kommentare, dann der Rest").
 *
 * ── Was diese Migration setzt ───────────────────────────────────────────
 * Aus den Rechten der TABELLE fällt jedes Schreib-Recht. Beiträge legt seit
 * Etappe 1 der Server mit dem Admin-Client an, nach seinen Prüfungen; ändern
 * und löschen laufen über die Routen, die den Autor selbst prüfen. Name,
 * Zeilen-Rechte-Schalter und „aktiv" werden gelesen und unverändert
 * zurückgeschrieben (`scripts/migrations-lib/tableWriteRights.mts`).
 * Die Rechte einzelner ZEILEN fasst sie nicht an: Leserechte bleiben (Realtime
 * hängt daran); alte Schreibrechte an Zeilen nimmt der Aufräum-Lauf
 * `scripts/ops/strip-row-write-rights.mjs`.
 *
 * Diese Migration BESITZT das Tabellenrecht von `community_posts`; ältere
 * Migrationen setzen es nicht mehr (ein voller Lauf stellte es sonst zurück).
 *
 * ⚠️ REIHENFOLGE — UMGEKEHRT ZUR ÜBLICHEN REGEL: ERST der Code-Stand der
 * Etappe 1 auf ALLEN Seiten live, DANN diese Migration. Alter Code +
 * genommenes Recht = jedes Anlegen scheitert. Der Code seit Etappe 1 läuft
 * mit beiden Zuständen.
 *
 * RÜCKWEG (ein Befehl, setzt genau dieses Recht wieder):
 *   packages/posts/scripts/rollback/024-server-writes.rollback.ts
 *
 *   pnpm migrate --app <app> --only posts-024
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

console.log(`Migration posts-024 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

console.log(describeOutcome('community_posts', await dropAccountWriteRight(tablesDB, databaseId, 'community_posts'), 'genommen'))

console.log('✔ Migration posts-024 fertig')
