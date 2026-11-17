/**
 * CI-Setup für die BÜHNE (OPS-009): zwei Projekte auf der frischen
 * Wegwerf-Appwrite der CI — `admin` (Control Plane) und `account` (der Pool,
 * alle Communities und alle Konten) — und die zwei `.env`-Dateien, mit denen
 * die Betreiber-App und der Platform-Server gegeneinander laufen.
 *
 *   node scripts/ci/buehne-setup.mjs --endpoint http://localhost:8080/v1
 *
 * Die Projekt-Ids sind NICHT frei wählbar: der Migrations-Runner vergleicht
 * sie mit `appwriteProjects` im `site.manifest.ts` der App (`apps/control`
 * lässt nur `admin` zu, `apps/platform` nur `account`).
 *
 * Danach, je App:
 *   node --env-file=apps/control/.env  scripts/bootstrap.mjs --app control
 *   node --env-file=apps/platform/.env scripts/bootstrap.mjs --app platform
 * dann beide Server starten und `pnpm buehne up`.
 *
 * WAS HIER BEWUSST FEHLT: Schlüssel für Stripe, Ploi, KI und ein Mail-Versand
 * nach draußen. Die Bühne spricht mit keinem Fremddienst. Mails gehen nur an
 * einen lokalen Briefkasten, wenn `--smtp-port` gesetzt ist (sonst ist der
 * Mail-Zweig aus).
 *
 * Geheimnisse (Schlüssel, Naht-Geheimnis) stehen nur in den `.env`-Dateien —
 * nie in der Ausgabe: das Protokoll eines Laufs ist öffentlich.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertTarget } from '../lib/target.mjs'
import { openConsole } from './console-lib.mjs'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const endpoint = arg('endpoint', 'http://localhost:8080/v1').replace(/\/$/, '')
const controlPort = arg('control-port', '3004')
const platformPort = arg('platform-port', '3150')
const controlHost = arg('control-host', 'app.localhost')
const smtpPort = arg('smtp-port', '')
// NUR NACHTS: die Einzel-Instanz `apps/comments` als drittes Projekt. Sie
// entsteht HIER und nicht über `appwrite-setup.mjs`, weil die Console nur
// EINEN Account zulässt (ein zweiter Aufruf scheitert mit 501) — alle drei
// Projekte kommen deshalb aus derselben Console-Sitzung.
const einzelPort = arg('einzel-port', '')

const CONTROL_PROJECT = 'admin'
const POOL_PROJECT = 'account'
// Nicht frei: `apps/comments/site.manifest.ts` lässt `account` und `comments` zu.
const EINZEL_PROJECT = 'comments'

// Wegwerf-Instanz: lokal durch, alles andere nur mit ausdrücklicher
// Bestätigung (OPS-002). Beide Projekte liegen auf demselben Endpunkt.
assertTarget({ script: 'ci/buehne-setup', endpoint, projectId: CONTROL_PROJECT })

// NIE EINE VORHANDENE `.env` ÜBERSCHREIBEN. Auf einem Entwickler-Rechner
// liegen dort die Zugänge der lokalen Instanz; dieses Skript ist für die CI,
// wo es die Dateien noch nicht gibt. Geprüft wird VOR dem ersten Schritt an
// der Console — sonst entstünden Projekt und Schlüssel, bevor der Abbruch kommt.
for (const appDir of ['apps/control', 'apps/platform', ...(einzelPort ? ['apps/comments'] : [])]) {
  if (existsSync(resolve(appDir, '.env'))) {
    console.error(`✗ ${appDir}/.env gibt es schon — dieses Skript schreibt nur auf einer frischen CI-Instanz.`)
    console.error('  Lokal gilt die vorhandene `.env`; die Bühne baut dort `pnpm buehne up` auf.')
    process.exit(1)
  }
}

const consoleSteps = await openConsole(endpoint)
const controlKey = await consoleSteps.provisionProject(CONTROL_PROJECT)
const poolKey = await consoleSteps.provisionProject(POOL_PROJECT)
const einzelKey = einzelPort ? await consoleSteps.provisionProject(EINZEL_PROJECT) : ''

// Das Naht-Geheimnis zwischen Platform-Server und Betreiber-App: je Lauf neu.
const seamSecret = randomBytes(32).toString('hex')

const smtp = smtpPort
  ? [
      'NUXT_SMTP_HOST=localhost',
      `NUXT_SMTP_PORT=${smtpPort}`,
      'NUXT_SMTP_FROM=buehne@example.test',
    ]
  : []

function writeEnv(appDir, lines) {
  const envPath = resolve(appDir, '.env')
  writeFileSync(envPath, [...lines, ''].join('\n'), { mode: 0o600 })
  console.log(`✔ ${envPath} geschrieben (${lines.filter(line => line && !line.startsWith('#')).length} Einträge)`)
}

writeEnv('apps/control', [
  '# Von scripts/ci/buehne-setup.mjs generiert (CI-Wegwerf-Instanz, Bühne)',
  `NUXT_APPWRITE_KEY=${controlKey}`,
  `NUXT_APPWRITE_MIGRATIONS_KEY=${controlKey}`,
  `NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`,
  `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${CONTROL_PROJECT}`,
  'NUXT_PUBLIC_APPWRITE_DATABASE_ID=main',
  'NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars',
  'NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports',
  `NUXT_PUBLIC_APP_URL=http://localhost:${controlPort}`,
  `NUXT_CONTROL_ONBOARDING_SECRET=${seamSecret}`,
  `NUXT_PUBLIC_CONTROL_POOL_PROJECT=${POOL_PROJECT}`,
  ...smtp,
])

writeEnv('apps/platform', [
  '# Von scripts/ci/buehne-setup.mjs generiert (CI-Wegwerf-Instanz, Bühne)',
  `NUXT_APPWRITE_KEY=${poolKey}`,
  `NUXT_APPWRITE_MIGRATIONS_KEY=${poolKey}`,
  `NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`,
  `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${POOL_PROJECT}`,
  'NUXT_PUBLIC_APPWRITE_DATABASE_ID=main',
  'NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars',
  'NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports',
  `NUXT_PUBLIC_APP_URL=http://${controlHost}:${platformPort}`,
  // Control Plane: Quelle der Communities. In der CI derselbe Schlüssel wie
  // die Betreiber-App (auf Production ist dieser eine nur lesend).
  `NUXT_PLATFORM_CONTROL_ENDPOINT=${endpoint}`,
  `NUXT_PLATFORM_CONTROL_PROJECT_ID=${CONTROL_PROJECT}`,
  'NUXT_PLATFORM_CONTROL_DATABASE_ID=main',
  `NUXT_PLATFORM_CONTROL_KEY=${controlKey}`,
  `NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=${controlHost}`,
  `NUXT_ONBOARDING_CONTROL_URL=http://localhost:${controlPort}`,
  `NUXT_ONBOARDING_SERVICE_SECRET=${seamSecret}`,
  ...smtp,
])

// Die Einzel-Instanz: ein Projekt ohne Mandanten, ohne Naht zum Control
// Plane — dieselben Einträge wie in e2e.yml (appwrite-setup.mjs). Mails
// schickt hier nur die Datenbank (Anmelde-Code), an den lokalen Briefkasten.
if (einzelPort) {
  writeEnv('apps/comments', [
    '# Von scripts/ci/buehne-setup.mjs generiert (CI-Wegwerf-Instanz, Einzel-Instanz der Bühne)',
    `NUXT_APPWRITE_KEY=${einzelKey}`,
    `NUXT_APPWRITE_MIGRATIONS_KEY=${einzelKey}`,
    `NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`,
    `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${EINZEL_PROJECT}`,
    'NUXT_PUBLIC_APPWRITE_DATABASE_ID=main',
    'NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars',
    'NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports',
    `NUXT_PUBLIC_APP_URL=http://localhost:${einzelPort}`,
  ])
}

console.log('\nBühnen-Setup fertig — weiter mit bootstrap je App, dann Server starten und `pnpm buehne up`.')
