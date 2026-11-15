#!/usr/bin/env node
/**
 * Bootstrap: bringt eine FRISCHE Appwrite-Instanz einer App von 0 auf
 * lauffähig — EIN Skript für alle Apps (BE-026; vorher lag es byte-gleich
 * fünfmal unter apps/<app>/scripts/bootstrap.ts).
 *
 *   node --env-file=apps/<app>/.env scripts/bootstrap.mjs --app <name> [--seed] [--force] [--check]
 *   pnpm --filter <name> bootstrap [--seed]        (das Skript der App ruft genau das)
 *
 *   --app    Pflicht: Ordner unter apps/ mit package.json. Ziel der Migrationen
 *            (scripts/migrate.mjs --app <name>) und Herkunft des Paketnamens
 *            für den Seed (kann abweichen, z. B. _template ↔ app-template).
 *   --seed   danach `pnpm --filter <paketname> seed`, wenn die App ein
 *            seed-Skript hat (Vorlage: apps/comments/scripts/seed-demo.ts).
 *   --force  Frische-Prüfung überspringen (laute Warnzeile).
 *   --check  NUR die Frische-Prüfung, nichts schreiben. Exit 0 = frisch oder
 *            erzwungen, Exit 1 sonst.
 *
 * VORAUSSETZUNG (manuell, weil interaktiv — oder scripts/create-site.mjs bzw.
 * in der CI scripts/ci/appwrite-setup.mjs):
 *   1. Appwrite-Instanz läuft, Console erreichbar.
 *   2. Account + Projekt + API-Key angelegt.
 *   3. apps/<app>/.env gesetzt: NUXT_PUBLIC_APPWRITE_{ENDPOINT,PROJECT_ID,
 *      DATABASE_ID,AVATARS_BUCKET} + NUXT_APPWRITE_KEY.
 *
 * DANN, in dieser Reihenfolge:
 *   0. WACHE (vor jedem Schreibzugriff): GET /tablesdb/<db>/tables. Nur ein
 *      positiver Befund „leer" (404 database_not_found oder 200 mit total 0)
 *      lässt weiter; befüllt ⇒ Abbruch mit Hinweis auf `pnpm migrate`; jede
 *      andere Antwort und jeder Netzfehler ⇒ Abbruch („kann nicht prüfen").
 *      Regel: scripts/bootstrap-lib/freshness.mjs.
 *   1. Datenbank (DATABASE_ID) anlegen (409 ⇒ übersprungen)
 *   2. Buckets `avatars` (Werte wie system-032) und `gdpr-exports`
 *   3. Web-Plattform localhost (best-effort — braucht ggf. die Console)
 *   4. alle Migrationen der App über den zentralen Runner
 *   5. optional (--seed): Demo-Daten
 *
 * Warum die Wache: Bootstrap legt Buckets und die Plattform `localhost` an und
 * fährt den kompletten Migrations-Satz. Auf einer bestehenden Instanz ist das
 * nicht der vorgesehene Weg (dort `pnpm migrate --app <name>`, der die Layer
 * idempotent nachzieht) — und wer gegen die falsche .env zielt, soll das VOR
 * dem ersten Schreibzugriff erfahren, nicht danach.
 *
 * Bewusst ohne node-appwrite: im Wurzel-`scripts/` ist es nicht auflösbar;
 * alles läuft per `fetch` gegen die REST-API.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decideFreshness } from './bootstrap-lib/freshness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const USAGE = 'Nutzung: node --env-file=apps/<app>/.env scripts/bootstrap.mjs --app <name> [--seed] [--force] [--check]'

/**
 * @param {string[]} argv
 * @returns {{ app: string | null, seed: boolean, force: boolean, check: boolean }}
 */
function parseArgs(argv) {
  const args = { app: /** @type {string | null} */ (null), seed: false, force: false, check: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--app') {
      const value = argv[i + 1]
      args.app = value && !value.startsWith('--') ? value : null
      if (args.app) i++
    }
    else if (arg?.startsWith('--app=')) args.app = arg.slice('--app='.length) || null
    else if (arg === '--seed') args.seed = true
    else if (arg === '--force') args.force = true
    else if (arg === '--check') args.check = true
    else {
      console.error(`✗ Unbekanntes Argument: ${arg}\n  ${USAGE}`)
      process.exit(1)
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (!args.app) {
  console.error(`✗ --app fehlt.\n  ${USAGE}`)
  process.exit(1)
}
if (!/^[\w-]+$/.test(args.app) || !existsSync(join(ROOT, 'apps', args.app, 'package.json'))) {
  console.error(`✗ --app ${args.app}: kein Ordner apps/${args.app} mit package.json.\n  ${USAGE}`)
  process.exit(1)
}

const APP_NAME = args.app
const APP_DIR = join(ROOT, 'apps', APP_NAME)
/** @type {{ name: string, scripts?: Record<string, string> }} */
const APP_PKG = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, '')
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
const bucketId = process.env.NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET || 'avatars'
const gdprBucket = process.env.NUXT_PUBLIC_APPWRITE_GDPR_BUCKET || 'gdpr-exports'
const apiKey = process.env.NUXT_APPWRITE_KEY || process.env.NUXT_APPWRITE_MIGRATIONS_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error(`✗ Fehlende Env-Vars (NUXT_PUBLIC_APPWRITE_ENDPOINT, NUXT_PUBLIC_APPWRITE_PROJECT_ID, NUXT_APPWRITE_KEY) — mit --env-file=apps/${APP_NAME}/.env aufrufen.`)
  process.exit(1)
}

/**
 * @param {string} path
 * @param {string} [method]
 * @param {unknown} [body]
 * @returns {Promise<{ status: number, json: Record<string, unknown> }>}
 */
async function api(path, method = 'GET', body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'X-Appwrite-Project': String(projectId), 'X-Appwrite-Key': String(apiKey), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const json = /** @type {Record<string, unknown>} */ (await res.json().catch(() => ({})))
  return { status: res.status, json }
}

/** @param {number} status */
function ok(status) {
  return status >= 200 && status < 300
}

/**
 * Die Wache: EINE lesende Anfrage, Urteil aus der reinen Funktion.
 * @returns {Promise<import('./bootstrap-lib/freshness.mjs').FreshnessDecision>}
 */
async function checkFreshness() {
  if (args.force) return decideFreshness({ status: null, body: null, force: true, app: APP_NAME })
  try {
    const res = await fetch(`${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables`, {
      headers: { 'X-Appwrite-Project': String(projectId), 'X-Appwrite-Key': String(apiKey) },
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    }
    catch {
      body = null
    }
    return decideFreshness({ status: res.status, body, force: false, app: APP_NAME })
  }
  catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : ''
    const message = error instanceof Error ? `${error.message}${cause}` : String(error)
    return decideFreshness({ status: null, body: null, networkError: message, force: false, app: APP_NAME })
  }
}

console.log(`Bootstrap apps/${APP_NAME} gegen ${endpoint} / Projekt ${projectId} / Datenbank ${databaseId}`
  + `${args.seed ? ' · --seed' : ''}${args.force ? ' · --force' : ''}${args.check ? ' · --check' : ''}\n`)

// 0) Wache — VOR jedem Schreibzugriff
{
  const decision = await checkFreshness()
  if (decision.proceed) console.log(decision.message)
  else console.error(decision.message)
  if (decision.verdict === 'forced') console.warn('⚠ Weiter OHNE Frische-Prüfung.')
  if (!decision.proceed) process.exit(1)
  if (args.check) {
    console.log('\n--check: nur geprüft, nichts geschrieben.')
    process.exit(0)
  }
}

// 1) Datenbank
{
  const { status, json } = await api('/databases', 'POST', { databaseId, name: databaseId })
  if (ok(status)) console.log(`✔ Datenbank '${databaseId}' angelegt`)
  else if (status === 409) console.log(`↷ Datenbank '${databaseId}' existiert bereits`)
  else {
    console.error(`✗ Datenbank fehlgeschlagen (${status}): ${json.message}`)
    process.exit(1)
  }
}

// 2) Avatars-Bucket — dieselben Werte wie die Migration system-032
// (packages/system/scripts/migrations/032-core-buckets.ts): Verschlüsselung
// und Virenprüfung an. Läuft sie danach, sieht sie 409 und überspringt.
{
  const { status, json } = await api('/storage/buckets', 'POST', {
    bucketId, name: 'avatars',
    // Keine Bucket-Rechte: jede Datei trägt ihre Rechte selbst (fileSecurity),
    // geschrieben wird nur vom Server nach seinen Prüfungen (SEC-001).
    permissions: [],
    fileSecurity: true, enabled: true,
    maximumFileSize: 5 * 1024 * 1024,
    allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    compression: 'none', encryption: true, antivirus: true,
  })
  if (ok(status)) console.log(`✔ Bucket '${bucketId}' angelegt`)
  else if (status === 409) console.log(`↷ Bucket '${bucketId}' existiert bereits`)
  else console.warn(`⚠ Bucket fehlgeschlagen (${status}): ${json.message}`)
}

// 2b) GDPR-Exports-Bucket (Pre-Delete-Snapshots; nur Server-Key schreibt,
// Downloads laufen über Admin-Routen mit requirePermission)
{
  const { status, json } = await api('/storage/buckets', 'POST', {
    bucketId: gdprBucket, name: 'gdpr-exports',
    permissions: [], // keine Bucket-weiten Rechte — File-Permissions read(label:admin)
    fileSecurity: true, enabled: true,
    maximumFileSize: 25 * 1024 * 1024, // unter dem 30-MB-Default-Limit der Instanz
    allowedFileExtensions: ['json'],
    compression: 'none', encryption: true, antivirus: false,
  })
  if (ok(status)) console.log(`✔ Bucket '${gdprBucket}' angelegt`)
  else if (status === 409) console.log(`↷ Bucket '${gdprBucket}' existiert bereits`)
  else console.warn(`⚠ GDPR-Bucket fehlgeschlagen (${status}): ${json.message}`)
}

// 3) Web-Platform (best-effort — Projekt-Management-Scope; ggf. in der Console anlegen)
{
  const { status } = await api(`/projects/${projectId}/platforms`, 'POST', {
    type: 'web', name: 'localhost', hostname: 'localhost',
  })
  if (ok(status)) console.log('✔ Web-Platform localhost angelegt')
  else if (status === 409) console.log('↷ Web-Platform existiert bereits')
  else console.warn(`⚠ Web-Platform nicht per API anlegbar (${status}) — optional, ggf. in der Console: Overview → Add platform → Web → hostname localhost`)
}

// 4) Migrationen — zentraler Runner, explizit gegen DIESE App (nie die falsche
// Instanz; die Layer-Skripte selbst sind idempotent).
console.log('\n— Migrationen —')
{
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(ROOT, 'scripts', 'migrate.mjs'), '--app', APP_NAME], { stdio: 'inherit', cwd: ROOT })
  if (result.status !== 0) {
    console.error(`✗ Migrationen fehlgeschlagen (Exit ${result.status ?? result.signal})`)
    process.exit(1)
  }
}

// 5) Optional: Seed — nur wenn die App ein seed-Skript mitbringt
if (args.seed) {
  if (APP_PKG.scripts?.seed) {
    console.log('\n— Demo-Seed —')
    const result = spawnSync('pnpm', ['--filter', APP_PKG.name, 'seed'], { stdio: 'inherit', cwd: ROOT })
    if (result.status !== 0) {
      console.error(`✗ Seed fehlgeschlagen (Exit ${result.status ?? result.signal})`)
      process.exit(1)
    }
  }
  else {
    console.warn(`⚠ --seed übersprungen: ${APP_NAME} hat kein seed-Skript in der package.json`)
  }
}

console.log(`\n✔ Bootstrap fertig. App starten mit: pnpm --filter ${APP_PKG.name} dev`)
