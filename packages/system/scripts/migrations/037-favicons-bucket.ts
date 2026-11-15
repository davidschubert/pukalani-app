/**
 * Migration system-037: Storage-Bucket `favicons` — das eigene Favicon EINER
 * Community, so wie ihr Owner es hochgeladen hat (Community-Favicon-Upload,
 * Davids Zuschnitt vom 2026-08-18).
 *
 * EINE Datei je Community, fileId = `communities.$id` (= `useSiteId()`). Wie bei
 * `community_seo` (system-034) liegt die WAHRHEIT damit im Runtime-Projekt und
 * braucht keine `communities`-Spalte und keinen Spiegel: Existenz + `$updatedAt`
 * der Datei ersetzen jede Referenz — und `$updatedAt` ist zugleich der
 * Cache-Brecher für die immutable Icon-URL (`uploadedBrandIconKey`).
 * Geschrieben ausschließlich server-seitig (packages/onboarding/server/api/
 * community/branding/favicon.post.ts) hinter `requireCommunityPermission(event,
 * 'branding.manage')`; gelesen server-seitig beim Ausliefern
 * (apps/platform/server/routes/icon/[key].get.ts, 30 s Microcache).
 *
 * ── WARUM `permissions: []` (kein Client-Recht) ────────────────────────────
 * Dieselbe Least-Privilege-Entscheidung wie bei `community_seo` (system-034):
 * kein Besucher, kein Mitglied und kein Owner spricht den Bucket direkt an. Die
 * AUSLIEFERUNG läuft durch die Route `/icon/<key>.png`, die den Admin-Client
 * benutzt und dabei mittig zuschneidet und auf 180/512 skaliert. Ein Lese-Recht
 * am Bucket wäre die Tür, um die rohe Datei je Community-Id abzurufen und den
 * Bucket AUFZÄHLBAR zu machen — ein Komfort, den heute niemand braucht.
 * `fileSecurity: false`, weil es je Datei keine unterschiedlichen Leser gibt:
 * eine Community, ein Server, keine Row-Permissions.
 *
 * ── WARUM fileId = communityId ─────────────────────────────────────────────
 * Genau EINE Datei je Community, und die Community-Id ist ihr natürlicher
 * Schlüssel — dieselbe Wahl wie die rowId bei `community_seo`. So ist „hat diese
 * Community ein Favicon?" EIN `getFile`, kein Query, und „ersetzen" ist
 * deterministisch: `deleteFile` (404 tolerieren) → `createFile` mit derselben
 * Id (Appwrite kann den Datei-INHALT nicht updaten, nur ersetzen).
 *
 * `maximumFileSize: 1_000_000` spiegelt `MAX_FAVICON_BYTES`
 * (core/shared/communityFavicon.ts) — die Route prüft VORHER und meldet 413,
 * der Bucket ist das Netz. Encryption + Antivirus an wie bei den anderen
 * Buckets (system-032). KEINE Extension-Liste: der MIME-Typ wäre Client-Input,
 * die PNG-Magic-Bytes prüft die Route (`isPngMagic`).
 *
 * KEIN indexStep und kein Table — ein Bucket hat keine Spalten und keine
 * Indizes; der `ops:schema-parity`-Lauf prüft nur Tabellen, ein Bucket bleibt
 * dort unkritisch (der Lauf trotzdem als Routine, weil `system` überall läuft).
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren (Pool, Control Plane, jede Einzel-Instanz).
 *
 *   pnpm migrate --app <app> --layer system
 *
 * Benötigte Key-Scopes: buckets.* (Migrations-Key). Idempotent (409 → skip).
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Storage } from 'node-appwrite'

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

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration system-037 gegen ${endpoint} / Projekt ${projectId}`)

/**
 * `permissions: []` UND `fileSecurity: false` — s. Kopf. Der 409-Zweig zieht
 * einen BESTEHENDEN Bucket auf denselben Stand nach, damit eine Instanz, auf
 * der der Bucket einmal von Hand mit anderen Rechten entstand, geheilt wird
 * (Lehre aus system-032: `createBucket` überspringt bei 409, die Permissions
 * heilt das nie — der Beweis eines Rechte-Fixes ist der Nach-Zug, nie die
 * Commit-Meldung).
 */
const faviconsSettings = {
  name: 'favicons',
  permissions: [],
  fileSecurity: false,
  maximumFileSize: 1_000_000,
  encryption: true,
  antivirus: true,
}
try {
  await storage.createBucket({ bucketId: 'favicons', ...faviconsSettings })
  console.log(`✔ Bucket 'favicons'`)
}
catch (error) {
  if (!hasCode(error, 409)) throw error
  await storage.updateBucket({ bucketId: 'favicons', enabled: true, ...faviconsSettings })
  console.log(`↷ Bucket 'favicons' (existierte — Einstellungen nachgezogen)`)
}

console.log('✔ Migration system-037 fertig')
