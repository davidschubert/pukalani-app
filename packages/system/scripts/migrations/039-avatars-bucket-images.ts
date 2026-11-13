/**
 * Migration system-039: der Bucket `avatars` nimmt nur noch, was der Server
 * nach seinen Prüfungen schreibt (SEC-001).
 *
 * ── Die Regel ─────────────────────────────────────────────────────────────
 * Appwrite ist unter eigener Adresse direkt erreichbar. Jedes Recht für
 * `users`, `any` oder ein Label an einer Ablage ist deshalb ein Zugang NEBEN
 * der Route — und die Prüfungen der Route (nur Bild, Inhalt per Magic Bytes,
 * höchstens 5 MiB) gelten dort nicht. Neue und bestehende Ablagen sind darum
 * verschlossen (`permissions: []`), und der Server schreibt mit dem
 * Admin-Client, nachdem seine Prüfungen bestanden sind
 * (core/server/api/storage/[bucket]/index.post.ts). Wächter:
 * `pnpm check:permissions`.
 *
 * ── Was diese Migration setzt ─────────────────────────────────────────────
 *  - `permissions: []` — kein Bucket-Recht mehr (vorher `create("users")`)
 *  - `fileSecurity: true` — jede Datei trägt ihre Rechte selbst: read(any),
 *    update/delete nur für den Besitzer (Lösch-Route und profile.put.ts
 *    löschen weiter mit dem Session-Client über genau dieses Recht)
 *  - `maximumFileSize: 5 MiB` und eine Endungsliste als zweites Netz
 * `name`, `enabled`, `compression`, `encryption`, `antivirus` und
 * `transformations` werden vorher GELESEN und unverändert zurückgeschrieben —
 * `updateBucket` setzt Weggelassenes sonst auf API-Defaults (Muster aus
 * events-009).
 *
 * Die Werte SPIEGELN `AVATAR_MAX_BYTES` und `AVATAR_BUCKET_EXTENSIONS` aus
 * packages/core/shared/avatarImage.ts — Migrations-Skripte importieren nichts
 * aus `core`; ein Test (core/tests/avatarImage.test.ts) liest diese Datei und
 * hält beide Stellen zusammen.
 *
 * Diese Migration BESITZT den Zustand bestehender `avatars`-Buckets; system-032
 * legt den Bucket nur noch an (gleich im Zielzustand) und überspringt bei 409.
 *
 * ⚠️ REIHENFOLGE: ERST der Code-Stand, der mit dem Admin-Client schreibt, DANN
 * diese Migration. Alter Code + geschlossener Bucket = jeder Profilbild-Upload
 * scheitert (der Session-Client hat kein Schreibrecht mehr). Neuer Code
 * funktioniert mit beiden Zuständen.
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren (Pool, Control Plane, jede Einzel-Instanz).
 *
 *   pnpm migrate --app <app> --layer system
 *
 * Benötigte Key-Scopes: buckets.* (Migrations-Key). Idempotent: steht der
 * Bucket schon im Zielzustand, wird nichts geschrieben.
 */
import { Client, Compression, Storage } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const storage = new Storage(client)

const BUCKET_ID = 'avatars'
/** Spiegelt AVATAR_MAX_BYTES (packages/core/shared/avatarImage.ts). */
const MAXIMUM_FILE_SIZE = 5 * 1024 * 1024
/** Spiegelt AVATAR_BUCKET_EXTENSIONS (packages/core/shared/avatarImage.ts). */
const ALLOWED_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Das Bucket-Modell liefert `compression` als String, updateBucket will das Enum. */
function asCompression(value: string): Compression {
  return (Object.values(Compression) as string[]).includes(value) ? value as Compression : Compression.None
}

/** Mengengleichheit — die Reihenfolge der Endungen ist bedeutungslos. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(entry => set.has(entry))
}

console.log(`Migration system-039 gegen ${endpoint} / Projekt ${projectId}`)

const bucket = await storage.getBucket({ bucketId: BUCKET_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!bucket) {
  console.error(`✖ Bucket '${BUCKET_ID}' fehlt — system-032 legt ihn an; diese Migration stellt nur einen bestehenden um.`)
  process.exit(1)
}

const inTarget = bucket.$permissions.length === 0
  && bucket.fileSecurity
  && bucket.maximumFileSize === MAXIMUM_FILE_SIZE
  && sameSet(bucket.allowedFileExtensions, ALLOWED_FILE_EXTENSIONS)

if (inTarget) {
  console.log(`↷ Bucket '${BUCKET_ID}' (bereits im Zielzustand)`)
}
else {
  await storage.updateBucket({
    bucketId: BUCKET_ID,
    name: bucket.name,
    permissions: [],
    fileSecurity: true,
    enabled: bucket.enabled,
    maximumFileSize: MAXIMUM_FILE_SIZE,
    allowedFileExtensions: ALLOWED_FILE_EXTENSIONS,
    compression: asCompression(bucket.compression),
    encryption: bucket.encryption,
    antivirus: bucket.antivirus,
    transformations: bucket.transformations,
  })
  console.log(`✔ Bucket '${BUCKET_ID}': permissions=[], fileSecurity=true, 5 MiB, Endungsliste gesetzt`)
}

console.log('✔ Migration system-039 fertig')
