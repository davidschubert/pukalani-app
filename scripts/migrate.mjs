#!/usr/bin/env node
/**
 * Zentraler Migrations-Runner — löst die frühere Pinnung aller Layer-Migrations
 * auf apps/comments/.env. Jede App hat ihre EIGENE Appwrite-Instanz;
 * der Runner macht explizit, GEGEN WELCHE davon migriert wird — und PRÜFT es
 * seit OPS-002 (GA1 P21), bevor er etwas schreibt.
 *
 *   pnpm migrate --app <app>                         # alle Layer der App gegen apps/<app>/.env
 *   pnpm migrate --app <app> --layer comments        # nur ein Layer (muss die App nutzen)
 *   pnpm migrate --app <app> --only brand-026        # genau diese Migration(en), wiederholbar
 *   pnpm migrate --app <app> --dry-run               # nur zeigen, was liefe — nichts schreiben
 *   pnpm migrate --app <app> --env <pfad> --prod     # Prod-Env-Datei (Production)
 *   node scripts/migrate.mjs --app <app> --env-file <pfad> --prod   # dasselbe, direkt
 *
 * `--env` ist der Alias für `--env-file`: pnpm 10 (≥ 10.29) schluckt
 * `--env-file` selbst und endet mit Exit 9, bevor der Runner startet.
 *
 * ZIEL-PRÜFUNG (OPS-002 — Davids Entscheidung: „Skripte, die in eine Datenbank
 * schreiben, prüfen vorher, ob es die richtige ist"). Vorfall 2026-08-31: ein
 * Lauf mit der falschen Env-Datei legte 18 fremde Tabellen im Projekt
 * `branding` an; die Sicherung war das Tippen des richtigen Dateinamens.
 * Seitdem gilt, in dieser Reihenfolge, und jeder Punkt bricht mit Exit 1 ab:
 *   1. Ein App-Kontext ist PFLICHT. `--env-file` OHNE `--app` war bis P21
 *      „bewusst ungefiltert" (für CI/Wellen gedacht, benutzt hat es keiner) —
 *      diese Tür ist zu: ohne App kein Manifest, ohne Manifest keine Prüfung.
 *      Gibt es GENAU EINE App unter apps/ (Template zählt nicht), wird sie
 *      ohne --app genommen.
 *   2. `apps/<app>/site.manifest.ts` muss laden UND dem Zod-Schema genügen.
 *      Früher hieß „nicht ladbar": Warnung und ALLE Layer migrieren — also im
 *      Fehlerfall am meisten.
 *   3. Die Projekt-Id der Env-Datei muss in `appwriteProjects` des Manifests
 *      stehen (die Meldung nennt beide Ids) — auch lokal, auch im Probelauf.
 *   4. Ein NICHT lokaler Endpunkt braucht `--prod`; `--prod` mit lokalem
 *      Endpunkt ist genauso ein Abbruch (Aufruf und Ziel passen nicht).
 *   5. `--layer`/`--only` dürfen nur `system` oder Produkte der App nennen.
 * Erst dann schreibt der Runner eine Zeile „App · Projekt · Endpunkt" und
 * startet die Migrationen — jede mit `PUKALANI_TARGET_CONFIRM=<geprüfte
 * Projekt-Id>` in der Umgebung. Ohne diese Variable bricht eine Migration
 * gegen einen entfernten Endpunkt selbst ab (`scripts/lib/assert-target.mjs`):
 * wer am Runner vorbei `node --env-file=… 026-x.ts` startet, kommt lokal
 * weiter, gegen Production nicht mehr. Dafür gibt es `--only`: Production-
 * Migrationen gibt David einzeln frei, und ein voller Lauf fährt jede
 * Migration erneut.
 *
 * Endpunkt und Projekt-Id liest der Runner SELBST aus der Env-Datei (nur
 * diese zwei Schlüssel, nie einen Wert sonst). Dieselben zwei Werte setzt er
 * den Migrationen ausdrücklich in die Umgebung: Nodes `--env-file`
 * überschreibt KEINE Variable, die der Elternprozess schon hat — eine im
 * Terminal exportierte Projekt-Id hätte sonst das geprüfte Ziel überstimmt.
 *
 * Regel und Bibliothek: `scripts/lib/target.mjs`; die reine Planungs-Logik
 * (Manifest, Layer, --only, Ziel-Entscheidung): `scripts/lib/migrate-plan.mjs`.
 *
 * WELLEN-MODUS (H3-4.2, Blueprint L5) — Silo-Schema-Updates in drei Wellen
 * (internal → canary → stable), Pool migriert separat genau einmal:
 *
 *   pnpm migrate --wave internal --control-env /pfad/control.env [--layer …] [--prod] [--dry-run]
 *
 * --control-env zeigt auf die CONTROL-PLANE-Instanz (control); daraus kommen
 * die Silo-Projekte der Welle (tenants.wave, '' = stable) — nur gelesen. Je
 * Projekt braucht es eine Migrations-Env-Datei
 * ~/.appwrite-secrets/migrations/<projectId>.env (Format wie jede App-.env:
 * NUXT_PUBLIC_APPWRITE_* + Migrations-Key; --keys-dir überschreibt den
 * Ordner). Jede Datei muss GENAU auf ihr Projekt zeigen, ein entfernter
 * Endpunkt braucht --prod. Fehlt eine Datei oder stimmt eine nicht, bricht der
 * Lauf ab BEVOR irgendein Projekt migriert wird (fail-loud statt halber Welle).
 * Ablauf eines Schema-Rollouts: additive Migration (Code n-1 verträgt Schema n)
 * → wave internal → verifizieren → canary → stable → Code-Deploy → Aufräum-
 * Migration später (Details: docs/runbooks/DEPLOYMENT.md).
 *
 * Layer-Reihenfolge: Fundament zuerst (system → comments → moderation → admin);
 * innerhalb eines Layers laufen die Scripts lexikografisch nach Dateiname
 * (deterministisch; Nummern-Präfixe eindeutig halten). Die Scripts selbst
 * bleiben idempotent (409 → skip) — der Runner ist nur der Dispatcher.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIRM_ENV } from './lib/target.mjs'
import { decideRunTarget, ENDPOINT_KEY, loadSiteManifest, planMigrations, PROJECT_KEY, readTargetFromEnvFile } from './lib/migrate-plan.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WAVES = ['internal', 'canary', 'stable']
// Fundament zuerst — admin liest z. B. Tables, die system/comments anlegen.
// `feedback` steht seit E10 NICHT mehr hier: der Layer besitzt keine Tables
// mehr, das zentrale Kunden-Feedback liegt im Control Plane (control-032).
// `brand` steht bei den Produkt-Layern: seine sieben brand_*-Tabellen hängen
// an keiner anderen (kein communityId, kein Fremdschlüssel in ein anderes
// Produkt) — es läuft ausschliesslich auf `branding` (branding.supply; bis zum
// Rückbau 2026-08-31 war das `portfolio`), und die zwei Laufzeit-Flags, die es
// liest, gehören `system` und laufen davor.
// (check-manifests.mjs liest diese Zeile per Regex — Form beibehalten.)
const LAYER_ORDER = ['system', 'comments', 'posts', 'events', 'media', 'billing', 'pages', 'courses', 'tickets', 'brand', 'market', 'insights', 'runner', 'moderation', 'analytics', 'messages', 'control', 'admin']

const USAGE = `Nutzung:
  pnpm migrate --app <app> [--env <pfad>] [--layer <layer>]… [--only <layer>-<NNN>]… [--prod] [--dry-run]
  node scripts/migrate.mjs --app <app> [--env-file <pfad>] …   (direkt; --env-file = --env)
  pnpm migrate --wave <${WAVES.join('|')}> --control-env <pfad> [--keys-dir <ordner>] [--layer <layer>]… [--only <layer>-<NNN>]… [--prod] [--dry-run]

  --app <app>        Pflicht (außer es gibt genau eine App) — bestimmt Manifest, Layer und erlaubte Projekte
  --env, --env-file  Env-Datei statt apps/<app>/.env (z. B. ~/.appwrite-secrets/migrations/<projekt>.env)
  --layer <layer>    nur diesen Layer (system oder ein Produkt der App), wiederholbar
  --only <l>-<NNN>   genau diese Migration (z. B. brand-026), wiederholbar; nicht mit --layer
  --prod             Pflicht für jeden NICHT lokalen Endpunkt; mit lokalem Endpunkt ein Abbruch
  --dry-run          alle Prüfungen, dann nur auflisten — schreibt nichts, braucht kein --prod`

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { app: null, envFile: null, layers: [], only: [], wave: null, controlEnv: null, keysDir: null, prod: false, dryRun: false }
  const value = (i, flag) => {
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) fail(`${flag} braucht einen Wert.\n${USAGE}`)
    return next
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--app') args.app = value(i++, flag)
    else if (flag === '--env-file' || flag === '--env') args.envFile = value(i++, flag)
    else if (flag === '--layer') args.layers.push(value(i++, flag))
    else if (flag === '--only') args.only.push(value(i++, flag))
    else if (flag === '--wave') args.wave = value(i++, flag)
    else if (flag === '--control-env') args.controlEnv = value(i++, flag)
    else if (flag === '--keys-dir') args.keysDir = value(i++, flag)
    else if (flag === '--prod') args.prod = true
    else if (flag === '--dry-run') args.dryRun = true
    else fail(`Unbekanntes Argument: ${flag}\n${USAGE}`)
  }
  return args
}

function listApps() {
  return readdirSync(join(ROOT, 'apps'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map(entry => entry.name)
}

function resolveApp(args) {
  if (args.app) {
    if (!existsSync(join(ROOT, 'apps', args.app))) fail(`apps/${args.app} existiert nicht — bekannt: ${listApps().join(', ')}`)
    return args.app
  }
  // `--env-file` OHNE `--app` war bis P21 „bewusst ungefiltert" — seitdem
  // ist die App Pflicht: sie liefert Manifest, Layer und erlaubte Projekte.
  if (args.envFile) fail(`--env/--env-file ohne --app — die App nennen, damit Manifest und erlaubte Projekte geprüft werden:\n  pnpm migrate --app <app> --env ${args.envFile}`)
  const apps = listApps()
  if (apps.length === 1) return apps[0]
  fail(`Mehrere Apps gefunden (${apps.join(', ')}) — Ziel-Instanz explizit angeben:\n  pnpm migrate --app <app>`)
}

function resolveEnvFile(args, app) {
  if (args.envFile) {
    const abs = resolve(process.cwd(), args.envFile)
    if (!existsSync(abs)) fail(`Env-Datei nicht gefunden: ${abs}`)
    return abs
  }
  const abs = join(ROOT, 'apps', app, '.env')
  if (!existsSync(abs)) fail(`apps/${app}/.env existiert nicht — App-Name prüfen oder .env aus .env.example anlegen.`)
  return abs
}

/** Der genaue Aufruf mit --prod — für die Meldung bei entferntem Ziel. */
function prodCall(args, envFile) {
  const parts = ['node scripts/migrate.mjs', `--app ${args.app ?? '<app>'}`, `--env-file ${envFile}`]
  for (const layer of args.layers) parts.push(`--layer ${layer}`)
  for (const spec of args.only) parts.push(`--only ${spec}`)
  parts.push('--prod')
  return parts.join(' ')
}

function targetFailure(decision, args, envFile, target) {
  if (decision.reason === 'remote_unconfirmed') {
    return `Der Endpunkt ist nicht lokal: ${target.endpoint} (Projekt „${target.projectId}"). Migrationen dorthin brauchen --prod — genau so:\n  ${prodCall(args, envFile)}\n  (erst ansehen: dasselbe mit --dry-run statt --prod)`
  }
  return decision.message
}

function rel(file) {
  return relative(ROOT, file)
}

function printPlan(plan) {
  for (const layer of plan.layers) {
    const files = plan.files.filter(entry => entry.layer === layer)
    if (files.length === 0) continue
    console.log(`▸ ${layer} (${files.length} Migrationen)`)
    for (const entry of files) console.log(`    ${rel(entry.file)}`)
  }
  if (plan.files.length === 0) console.log('(keine Migrationsdateien)')
}

/**
 * @param {string} envFile
 * @param {{ layer: string, file: string }[]} files
 * @param {{ endpoint: string, projectId: string }} target  GEPRÜFTES Ziel
 */
function runMigrations(envFile, files, target) {
  // Die zwei geprüften Werte ausdrücklich setzen: `--env-file` überschreibt
  // keine Variable, die schon in der Umgebung steht.
  const env = {
    ...process.env,
    [ENDPOINT_KEY]: target.endpoint,
    [PROJECT_KEY]: target.projectId,
    [CONFIRM_ENV]: target.projectId,
  }
  let currentLayer = null
  for (const { layer, file } of files) {
    if (layer !== currentLayer) {
      currentLayer = layer
      console.log(`▸ ${layer} (${files.filter(entry => entry.layer === layer).length} Migrationen)`)
    }
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', `--env-file=${envFile}`, file],
      { stdio: 'inherit', cwd: join(ROOT, 'packages', layer), env },
    )
    if (result.error) fail(`Migration nicht startbar: ${rel(file)} (${result.error.message})`)
    if (result.status !== 0) {
      console.error(`\n✗ Migration fehlgeschlagen: ${rel(file)}`)
      process.exit(result.status ?? 1)
    }
  }
}

/** Einzel-Lauf gegen EINE App (der Normalfall). */
async function runApp(args) {
  const app = resolveApp(args)
  const envFile = resolveEnvFile(args, app)
  args.app = app

  const loaded = await loadSiteManifest(ROOT, app)
  if (!loaded.ok) fail(loaded.message)
  const { manifest } = loaded

  const { endpoint, projectId } = readTargetFromEnvFile(envFile)
  const decision = decideRunTarget({ endpoint, projectId, allowedProjects: manifest.appwriteProjects, prod: args.prod, dryRun: args.dryRun })
  if (!decision.ok) fail(targetFailure(decision, args, envFile, { endpoint, projectId }))

  const plan = planMigrations({ root: ROOT, layerOrder: LAYER_ORDER, manifest, layers: args.layers, only: args.only })
  if (!plan.ok) fail(plan.message)

  if (args.dryRun) {
    console.log(`PROBELAUF — App: ${app}`)
    console.log(`  Projekt:   ${projectId}`)
    console.log(`  Endpunkt:  ${endpoint} (${decision.local ? 'lokal' : 'NICHT lokal'})`)
    console.log(`  Env-Datei: ${envFile}`)
    console.log(`  Layer:     ${plan.layers.join(', ') || '(keine)'}`)
    if (plan.skipped.length > 0) console.log(`  Nicht im Site-Manifest: ${plan.skipped.join(', ')}`)
    console.log(`  Dateien in Ausführungsreihenfolge (${plan.files.length}):\n`)
    printPlan(plan)
    console.log('\n✔ Probelauf — nichts geschrieben, kein Migrationsprozess gestartet.')
    if (!decision.local && !args.prod) console.log(`  Der echte Lauf gegen diesen entfernten Endpunkt braucht --prod:\n  ${prodCall(args, envFile)}`)
    return
  }

  console.log(`Migrationen · App ${app} · Projekt „${projectId}" · ${endpoint}${decision.local ? '' : ' (PRODUCTION, --prod)'}\n`)
  if (plan.skipped.length > 0) console.log(`↷ Nicht im Site-Manifest — übersprungen: ${plan.skipped.join(', ')}\n`)
  runMigrations(envFile, plan.files, { endpoint, projectId })
  console.log('\n✔ Alle Migrationen abgeschlossen.')
}

/** Wellen-Modus: Silo-Projekte der Welle übers Control Plane auflösen und
 *  nacheinander migrieren. Fehlende oder falsch zeigende Env-Dateien brechen
 *  VOR dem ersten Projekt ab — keine halbe Welle. */
function runWave(args) {
  if (args.app || args.envFile) fail('--wave verträgt sich nicht mit --app/--env/--env-file (Pool/Einzel-Instanz separat migrieren).')
  if (!WAVES.includes(args.wave)) fail(`Unbekannte Welle '${args.wave}' — erwartet: ${WAVES.join(' | ')}`)
  if (!args.controlEnv) fail('--control-env fehlt (Env-Datei der Control-Plane-Instanz) — nie raten, gegen welches Register aufgelöst wird.')
  const controlEnv = resolve(process.cwd(), args.controlEnv)
  if (!existsSync(controlEnv)) fail(`Control-Env nicht gefunden: ${controlEnv}`)

  // Ohne App gibt es kein Manifest: erlaubt ist jeder bekannte Layer, die
  // Ziel-Prüfung läuft je Projekt gegen seine eigene Id.
  const plan = planMigrations({ root: ROOT, layerOrder: LAYER_ORDER, manifest: null, layers: args.layers, only: args.only })
  if (!plan.ok) fail(plan.message)

  // Das Register wird nur GELESEN. Mit --prod bestätigt der Aufruf auch das
  // Control-Plane-Projekt, falls das Leseskript selbst prüft.
  const control = readTargetFromEnvFile(controlEnv)
  const listEnv = { ...process.env }
  if (control.endpoint) listEnv[ENDPOINT_KEY] = control.endpoint
  if (control.projectId) listEnv[PROJECT_KEY] = control.projectId
  if (args.prod && control.projectId) listEnv[CONFIRM_ENV] = control.projectId
  const list = spawnSync(
    process.execPath,
    ['--experimental-strip-types', `--env-file=${controlEnv}`, join(ROOT, 'packages', 'control', 'scripts', 'list-silo-tenants.ts'), args.wave],
    // cwd war bis 2026-07-29 `packages/studio` — der Layer heißt seit dem
    // Cutover `control`, das Verzeichnis existierte nicht mehr, und spawnSync
    // kam über ENOENT nicht hinaus: JEDE Wellen-Migration brach ab, bevor sie
    // etwas tat. Der Layer trägt seine Abhängigkeiten selbst.
    { cwd: join(ROOT, 'packages', 'control'), encoding: 'utf8', env: listEnv },
  )
  // `error` VOR `status` prüfen: ein fehlgeschlagener SPAWN hat weder Status
  // noch stderr — genau daran war der Fehler oben unsichtbar („✗ Silo-Tenants
  // konnten nicht gelistet werden." ohne Grund, drei Wochen lang).
  if (list.error) fail(`Silo-Tenants konnten nicht gelistet werden: ${list.error.message}`)
  if (list.status !== 0) {
    console.error(list.stderr || '✗ Silo-Tenants konnten nicht gelistet werden (kein stderr).')
    process.exit(list.status ?? 1)
  }
  const projects = JSON.parse(list.stdout.trim().split('\n').at(-1))
  if (projects.length === 0) {
    console.log(`✔ Welle '${args.wave}': keine Silo-Projekte im Register — nichts zu migrieren.`)
    return
  }

  const keysDir = args.keysDir
    ? resolve(process.cwd(), args.keysDir)
    : join(homedir(), '.appwrite-secrets', 'migrations')
  const missing = projects.filter(projectId => !existsSync(join(keysDir, `${projectId}.env`)))
  if (missing.length > 0) {
    fail(`Migrations-Env fehlt für: ${missing.join(', ')}\n  Erwartet: ${keysDir}/<projectId>.env (NUXT_PUBLIC_APPWRITE_* + NUXT_APPWRITE_MIGRATIONS_KEY).`)
  }

  // ALLE Ziele prüfen, bevor das erste Projekt migriert wird.
  const targets = []
  const problems = []
  for (const projectId of projects) {
    const envFile = join(keysDir, `${projectId}.env`)
    const target = readTargetFromEnvFile(envFile)
    const decision = decideRunTarget({ ...target, allowedProjects: [projectId], prod: args.prod, dryRun: args.dryRun })
    if (!decision.ok) {
      problems.push(`${projectId}.env: ${decision.reason === 'remote_unconfirmed' ? `Endpunkt ${target.endpoint} ist nicht lokal — Wellen gegen Production brauchen --prod.` : decision.message}`)
    }
    else {
      targets.push({ projectId, envFile, endpoint: target.endpoint, local: decision.local })
    }
  }
  if (problems.length > 0) fail(`Ziel-Prüfung der Welle '${args.wave}' fehlgeschlagen — KEIN Projekt migriert:\n  ${problems.join('\n  ')}`)

  if (args.dryRun) {
    console.log(`PROBELAUF — Welle '${args.wave}': ${targets.length} Silo-Projekt(e)`)
    for (const target of targets) console.log(`  ${target.projectId} · ${target.endpoint} (${target.local ? 'lokal' : 'NICHT lokal'}) · ${target.envFile}`)
    console.log(`  Dateien je Projekt in Ausführungsreihenfolge (${plan.files.length}):\n`)
    printPlan(plan)
    console.log('\n✔ Probelauf — nichts geschrieben, kein Migrationsprozess gestartet.')
    if (!args.prod && targets.some(target => !target.local)) console.log('  Der echte Lauf gegen entfernte Endpunkte braucht --prod.')
    return
  }

  console.log(`Welle '${args.wave}': ${targets.length} Silo-Projekt(e) — ${targets.map(target => target.projectId).join(', ')}\n`)
  for (const target of targets) {
    console.log(`Migrationen · Welle ${args.wave} · Projekt „${target.projectId}" · ${target.endpoint}${target.local ? '' : ' (PRODUCTION, --prod)'}\n`)
    runMigrations(target.envFile, plan.files, target)
  }
  console.log('\n✔ Alle Migrationen abgeschlossen.')
}

const args = parseArgs(process.argv.slice(2))
if (args.wave) runWave(args)
else await runApp(args)
