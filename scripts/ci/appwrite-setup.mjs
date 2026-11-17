/**
 * CI-Setup für eine FRISCHE Appwrite-Instanz (Idee 4): erledigt die sonst
 * interaktiven Console-Schritte per REST — Account (erster User, Whitelist
 * ROOT), Organisation, Projekt mit fester ID, API-Key mit allen Scopes,
 * Web-Platform — und schreibt die App-.env. Danach übernimmt
 * `pnpm --filter <app> bootstrap --seed` (das eine Skript scripts/bootstrap.mjs:
 * Frische-Prüfung, DB, Buckets, Migrationen, Demo-Daten).
 *
 *   node scripts/ci/appwrite-setup.mjs \
 *     --endpoint http://localhost:8080/v1 --app apps/comments
 *
 * Idempotent genug für Wiederholungsläufe gegen dieselbe Instanz (409 → weiter,
 * Login statt Signup); gedacht aber für Wegwerf-Instanzen (CI). Die
 * Console-Schritte selbst stehen in `console-lib.mjs` — dieselben nutzt
 * `buehne-setup.mjs` für die zwei Projekte der Bühne. Der nächtliche
 * Bühnen-Lauf (`buehne.yml`) ruft dieses Skript NACH `buehne-setup.mjs` als
 * drittes Projekt auf derselben Instanz auf (Einzel-Instanz, `--app-url`).
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertTarget } from '../lib/target.mjs'
import { openConsole } from './console-lib.mjs'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const endpoint = (arg('endpoint', 'http://localhost:8080/v1')).replace(/\/$/, '')
const appDir = arg('app', 'apps/comments')
const projectId = arg('project', 'comments')
// e2e.yml fährt die App auf 3001; der nächtliche Bühnen-Lauf nennt seinen Port.
const appUrl = arg('app-url', 'http://localhost:3001')

// Gedacht für Wegwerf-Instanzen: die CI ruft mit http://localhost:8080/v1 auf
// (.github/workflows/e2e.yml). Alles andere braucht
// PUKALANI_TARGET_CONFIRM=<Projekt-Id> (OPS-002).
assertTarget({ script: 'ci/appwrite-setup', endpoint, projectId })

const consoleSteps = await openConsole(endpoint)
const apiKey = await consoleSteps.provisionProject(projectId)

// App-.env schreiben (Format wie .env.example; SMTP bewusst leer)
{
  const envPath = resolve(appDir, '.env')
  const lines = [
    '# Von scripts/ci/appwrite-setup.mjs generiert (CI-Wegwerf-Instanz)',
    `NUXT_APPWRITE_KEY=${apiKey}`,
    `NUXT_APPWRITE_MIGRATIONS_KEY=${apiKey}`,
    `NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`,
    `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}`,
    `NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`,
    `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars`,
    `NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports`,
    `NUXT_PUBLIC_APP_URL=${appUrl}`,
    '',
  ]
  writeFileSync(envPath, lines.join('\n'))
  console.log(`✔ ${envPath} geschrieben`)
}

console.log('\nSetup fertig — weiter mit: pnpm --filter <app> bootstrap [--seed]')
