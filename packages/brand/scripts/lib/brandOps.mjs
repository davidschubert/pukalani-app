import { Client, Query, TablesDB, Users } from 'node-appwrite'
import { assertTarget } from '../../../../scripts/lib/target.mjs'

/**
 * DAS GETEILTE STÜCK DER DREI BETREIBER-SKRIPTE (`brand:invite`,
 * `brand:revoke`, `brand:access`) — Plan §3e: „Operator-Werkzeug Phase 1 als
 * SKRIPTE (keine Admin-UI nötig)".
 *
 * ── EINE ENV-KONVENTION, DIESELBE WIE BEI DEN MIGRATIONEN ─────────────────
 * Aufgerufen wird mit `--env-file=apps/branding/.env` (bis zum Rückbau am
 * 2026-08-31: `apps/portfolio/.env` — der Wizard hat seit dem Umzug ein eigenes
 * Appwrite-Projekt, und ein Betreiber-Skript auf der falschen Instanz ist genau
 * die Panne, vor der der nächste Absatz warnt); gelesen werden genau
 * die vier Variablen, die auch der Migrations-Runner liest. Kein eigener
 * Env-Dialekt, kein zweiter Pfad, den jemand pflegen müsste.
 *
 * ── DAS ZIEL WIRD IMMER GENANNT, BEVOR ETWAS PASSIERT ─────────────────────
 * `announceTarget()` druckt Endpoint UND Projekt-Id vor jeder Schreibaktion.
 * Der Grund steht in der Erfahrung dieses Repos (CLAUDE.md, Migrations-Absatz):
 * bei mehreren Instanzen ist die häufigste Betriebs-Panne nicht der falsche
 * Befehl, sondern der richtige Befehl auf der falschen Instanz. Eine Zeile, die
 * man lesen MUSS, bevor der Code über die Konsole geht, kostet nichts.
 *
 * ── DER RUNTIME-SCHLÜSSEL REICHT ──────────────────────────────────────────
 * Diese Skripte schreiben ROWS, keine Tabellen — `NUXT_APPWRITE_KEY` genügt.
 * Der Migrations-Schlüssel wird trotzdem akzeptiert (er kann mehr), damit
 * niemand für einen Widerruf die .env umbauen muss.
 */

export function readBrandOpsEnv() {
  const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
  const apiKey = process.env.NUXT_APPWRITE_KEY ?? process.env.NUXT_APPWRITE_MIGRATIONS_KEY

  if (!endpoint || !projectId || !databaseId || !apiKey) {
    console.error('✗ Env unvollständig. Aufruf über den Wrapper:')
    console.error('    pnpm brand:invite <e-mail>   (liest apps/branding/.env)')
    process.exit(1)
  }
  // Ziel-Prüfung (OPS-002): lokal durch, sonst PUKALANI_TARGET_CONFIRM=<Projekt-Id>.
  // Hier und nicht in den drei Skripten — jedes holt seinen Client über diese Funktion.
  assertTarget({ script: 'brand-ops', endpoint, projectId })

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  return {
    endpoint,
    projectId,
    databaseId,
    tablesDB: new TablesDB(client),
    users: new Users(client),
  }
}

/** Die Zeile, die vor jeder Schreibaktion stehen muss (s. Kopf). */
export function announceTarget(env, action) {
  console.log(`→ ${action}`)
  console.log(`  Instanz : ${env.endpoint}`)
  console.log(`  Projekt : ${env.projectId}`)
  console.log(`  Database: ${env.databaseId}`)
}

export const BRAND_TABLES = {
  profiles: 'brand_profiles',
  shares: 'brand_shares',
  invites: 'brand_invites',
  access: 'brand_access',
}

export const APP_CONFIG_TABLE = 'app_config'
export const APP_CONFIG_ROW = 'global'

/**
 * Das Konto zu einer Adresse. `null` = kein Konto — das ist KEIN Fehler: ein
 * Code darf an eine Adresse gehen, die noch kein Konto hat (genau dafür gibt es
 * die Naht zum Signup).
 */
export async function findUserByEmail(env, email) {
  const { users: found } = await env.users.list({
    queries: [Query.equal('email', email.toLowerCase()), Query.limit(1)],
  })
  return found[0] ?? null
}

/** Alle Zeilen einer Abfrage (Cursor) — die Skripte dürfen nichts übersehen. */
export async function listAll(env, tableId, filters) {
  const rows = []
  let cursor
  for (;;) {
    const res = await env.tablesDB.listRows({
      databaseId: env.databaseId,
      tableId,
      queries: [...filters, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    rows.push(...res.rows)
    if (res.rows.length < 100) return rows
    cursor = res.rows.at(-1).$id
  }
}

/** Ein 404 heisst „gibt es nicht" — bei Skripten oft der Normalfall. */
export function isNotFound(error) {
  return typeof error === 'object' && error !== null && error.code === 404
}
