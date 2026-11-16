/**
 * RÜCKWEG zu Migration posts-024: setzt das Anlege-Recht für Konten an
 * der Tabelle `community_posts` wieder (SEC-002, GA1 P13).
 *
 * NUR FÜR DEN NOTFALL und nur mit Davids Ja: wenn nach posts-024 ein
 * Schreibweg scheitert, der noch mit der Sitzung des Kontos anlegt. Liegt
 * BEWUSST NICHT im Ordner `migrations/` — der Runner führe ihn sonst bei
 * jedem vollen Lauf aus und nähme die Migration damit zurück.
 *
 * Ein Befehl, direkt gestartet (aus `packages/posts`, dort löst
 * `node-appwrite` auf). Lokal:
 *   node --experimental-strip-types --env-file=../../apps/<app>/.env scripts/rollback/024-server-writes.rollback.ts
 * Production (die Ziel-Prüfung verlangt das gemeinte Projekt):
 *   PUKALANI_TARGET_CONFIRM=<projekt> node --experimental-strip-types \
 *     --env-file=$HOME/.appwrite-secrets/migrations/<projekt>.env scripts/rollback/024-server-writes.rollback.ts
 *
 * Idempotent; Name, Zeilen-Rechte-Schalter und „aktiv" bleiben unverändert.
 * Danach setzt ein erneuter Lauf von posts-024 den Zielzustand wieder.
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'
import { restoreAccountCreateRight, describeOutcome } from '../../../../scripts/migrations-lib/tableWriteRights.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

console.log(`RÜCKWEG posts-024 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

console.log(describeOutcome('community_posts', await restoreAccountCreateRight(tablesDB, databaseId, 'community_posts'), 'gesetzt'))

console.log('✔ Rückweg posts-024 fertig')
