/**
 * Migration brand-027: `brand_runs` — DIE LAUF-SPERRE DES MARKENBERATERS.
 *
 * Nacharbeit LL1 (b), 2026-11-17. Gemeinsame Regeln wie brand-001…026
 * (server-only `permissions: []` / `rowSecurity: false`, kein `communityId`,
 * Indizes nur über `createIndexSteps`); sie läuft ausschliesslich auf der
 * `branding`-Instanz.
 *
 * ── WOZU ────────────────────────────────────────────────────────────────
 * Vier Wege des Markenberaters rechneten bis hierher in der Anfrage:
 * Zeichen-Entwürfe, Vorbilder lesen, Fundament-Check und der öffentliche
 * Brand-Check. Ihre eigenen Fristen liegen über der Wartezeit des Webservers
 * — der Mensch sah dann einen Fehler, obwohl der Lauf gelang, und ein zweiter
 * Klick bezahlte doppelt. Künftig antwortet der Start sofort (`202`) und der
 * Lauf rechnet hinter der Antwort weiter; die Seite fragt den Stand ab.
 *
 * Jeder Lauf ist EINE Zeile hier, mit fester Id aus (scope, subject, seq) —
 * die einzige Operation, die bei Appwrite wirklich ausschliesst, ist
 * `createRow` mit einer festen Id (zweiter Versuch ⇒ 409). Begründung im
 * Ganzen: Kopf von `packages/core/shared/runLease.ts`.
 *
 * ── EINE TABELLE FÜR ALLE VIER WEGE ──────────────────────────────────────
 * `scope` nennt den Weg, `subject` den Gegenstand:
 *  - `drafts`    — Zeichen-Entwürfe,   subject = Profil-Id
 *  - `reading`   — Vorbilder lesen,    subject = Profil-Id
 *  - `doc-check` — Fundament-Check,    subject = Profil-Id
 *  - `check`     — öffentlicher Check, subject = Hash der geprüften Adresse
 * Die drei Wege mit Profil-Id hängen an einer Marke und verschwinden mit ihr
 * (Löschen der Marke, Löschen des Kontos). Die Zeilen nennen niemanden: nur
 * Zeitpunkte, Ausgang und Zählerstände.
 *
 * Das Schema steht EINMAL in `scripts/migrations-lib/runLeaseTable.mts`
 * (dieselbe Fabrik legt `market_runs` und `insights_runs` an); dort auch das
 * Zeilenbudget.
 *
 * Zerstört nichts, legt nur an, und ist wiederholbar (409 → skip,
 * vorhandene Spalten werden übersprungen). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { ensureRunLeaseTable } from '../../../../scripts/migrations-lib/runLeaseTable.mts'

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

console.log(`Migration brand-027 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await ensureRunLeaseTable({
  tablesDB,
  databaseId,
  tableId: 'brand_runs',
  name: 'Brand Runs',
  sdk: { Query, TablesDBIndexType },
})

console.log('✔ Migration brand-027 fertig')
