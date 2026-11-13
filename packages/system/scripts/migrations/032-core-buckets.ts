/**
 * Migration system-032: Storage-Buckets `avatars` + `gdpr-exports`.
 *
 * AH-1-Krümel (2026-08-12): beim account-Cutover zeigte sich, dass beide
 * Buckets im Pool nur VON HAND existierten — kein Migrations-Script legte sie
 * an (fonts/media/event-covers/ticket-files schon). Eine frische Instanz hätte
 * damit weder Profilbilder noch GDPR-Snapshots speichern können, und beides
 * sind CORE-Fähigkeiten (profile.put.ts bzw. userDataOrchestration.ts), die
 * auf jeder Instanz laufen — deshalb liegt die Migration im system-Layer.
 *
 * Die Einstellungen sind am 2026-08-12 aus der Prod-Instanz `account`
 * abgelesen. Beide Buckets: fileSecurity (Rechte je Datei — ein GDPR-Snapshot
 * gehört genau einem Konto, ein Avatar seinem Besitzer), Encryption+Antivirus
 * an, und KEINE Bucket-Rechte (`permissions: []`): geschrieben wird nur vom
 * Server. `avatars` entsteht im Zielzustand von system-039 (5 MiB,
 * Endungsliste); `gdpr-exports` mit 30 MB ohne Endungsliste.
 *
 * Bei 409 wird NUR übersprungen: der Runner fährt bei jedem Lauf ALLE
 * Migrationen erneut, ein Nachziehen hier stellte den Bucket jedes Mal auf
 * diesen alten Stand zurück. Den Zustand BESTEHENDER `avatars`-Buckets besitzt
 * system-039.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     packages/system/scripts/migrations/032-core-buckets.ts
 *
 * Benötigte Key-Scopes: buckets.* (Migrations-Key). Idempotent (409 → skip).
 */
import { Client, Storage } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const storage = new Storage(client)

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

console.log(`Migration system-032 gegen ${endpoint} / Projekt ${projectId}`)

/**
 * `avatars` — NEUANLAGE im Zielzustand (Werte wie system-039, die sie aus
 * core/shared/avatarImage.ts spiegelt). Ab 2026-08-17 trug der Bucket hier
 * `create("users")`, weil die Upload-Route damals mit dem Session-Client
 * schrieb; seit system-039 schreibt sie mit dem Admin-Client, und der Bucket
 * trägt kein Recht.
 * Datei-Rechte setzt die Route je Datei (read(any) + update/delete(user)).
 */
await step(`Bucket 'avatars'`, () => storage.createBucket({
  bucketId: 'avatars',
  name: 'avatars',
  permissions: [],
  fileSecurity: true,
  maximumFileSize: 5 * 1024 * 1024,
  allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  encryption: true,
  antivirus: true,
}))

await step(`Bucket 'gdpr-exports'`, () => storage.createBucket({
  bucketId: 'gdpr-exports',
  name: 'gdpr-exports',
  permissions: [],
  fileSecurity: true,
  maximumFileSize: 30_000_000,
  encryption: true,
  antivirus: true,
}))

console.log('Migration system-032 abgeschlossen.')
