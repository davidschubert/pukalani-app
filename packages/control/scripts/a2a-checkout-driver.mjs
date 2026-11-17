#!/usr/bin/env node
/**
 * Treiber für den Stripe-Testmodus-Durchlauf (Proben 2–5 aus
 * docs/runbooks/STRIPE-TEST-WALKTHROUGH.md) — lokal UND gegen ein entferntes
 * Ziel, je nachdem, wohin die zwei Env-Dateien zeigen.
 *
 * Kommandos:
 *   provision  → Probe-Konto (Projekt der Platform-App, heute `account`),
 *                Einladungs-Code und Community über den ECHTEN Weg des
 *                Wizards anlegen: Anmeldung auf dem Kontroll-Host, dann
 *                `POST /api/onboarding/site` (die Platform-App ruft dafür
 *                selbst die Service-Naht des Control Plane). Danach Anmeldung
 *                als Owner auf dem Host der Community.
 *   authz      → Probe 2: `GET /api/community/billing/trial` als Owner (200)
 *                und ohne Anmeldung (abgelehnt).
 *   checkout   → `POST /api/community/billing/checkout` als Owner → Adresse
 *                der Stripe-Bezahlseite. Argumente: [personal|pro] [monthly|yearly].
 *   portal     → `POST /api/community/billing/portal` als Owner → Portal-Adresse.
 *   status     → die `communities`-Zeile (Projekt des Control Plane, heute
 *                `admin`) kompakt ausgeben.
 *   cleanup    → alles löschen, was `provision` angelegt hat, und nachzählen.
 *                Kunde und Abo im Stripe-Testkonto bleiben stehen.
 *
 * Er benutzt die echten Wege (Anmeldung, Routen, Naht, Webhook). An der App
 * vorbei entstehen nur: das Probe-Konto, der Einladungs-Code (das täte sonst
 * der Betreiber im Dashboard) — und LOKAL der Host der Community, der von
 * `<slug>.pukalani.app` auf `<slug>.localhost` umgehängt wird, damit der
 * Rücksprung von Stripe nicht bei Production landet.
 *
 * WOHER DIE ZUGÄNGE KOMMEN: aus zwei Env-Dateien, nie aus dem Repo und nie von
 * der Kommandozeile.
 *   --env-platform <datei>  (Standard apps/platform/.env): Endpunkt, Projekt
 *                           und Schlüssel der Platform-App
 *   --env-control <datei>   (Standard apps/control/.env): Endpunkt, Projekt,
 *                           Datenbank und Schlüssel des Control Plane
 * Das Ziel wird vor dem ersten Aufruf geprüft (scripts/lib/target.mjs): ein
 * lokaler Endpunkt geht durch, jeder andere braucht
 * `PUKALANI_TARGET_CONFIRM=<Projekt-Id>` — und beide Dateien müssen auf
 * dasselbe Ziel zeigen (beide lokal oder beide entfernt).
 *
 * WIE DIE APP ERREICHT WIRD:
 *   lokal     `--platform-port <port>` — der Platform-Server auf diesem
 *             Rechner; der Host der Community reist als Host-Kopfzeile.
 *   entfernt  ohne Port: `https://<host>`.
 *   --control-host <host>   Kontroll-Host für Anmeldung und Wizard-Route
 *             (Standard: erster Eintrag von NUXT_PUBLIC_TENANCY_CONTROL_HOSTS
 *             aus der Platform-Env-Datei).
 *
 * Der Stand eines Laufs (Host, Ids, Adresse und Passwort des Probe-Kontos,
 * Sitzungs-Cookie) steht in `.buehne/a2a-checkout.json` (Modus 600, nicht im
 * Repo). Die Konsole zeigt davon nur Host und Ids.
 *
 * Aufruf (lokal, beide Dev-Server laufen — Rezept im Runbook):
 *   node packages/control/scripts/a2a-checkout-driver.mjs provision --platform-port 3026
 *   node packages/control/scripts/a2a-checkout-driver.mjs authz
 *   node packages/control/scripts/a2a-checkout-driver.mjs checkout personal monthly
 *   node packages/control/scripts/a2a-checkout-driver.mjs status
 *   node packages/control/scripts/a2a-checkout-driver.mjs portal
 *   node packages/control/scripts/a2a-checkout-driver.mjs cleanup
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { assertTarget, isLocalEndpoint } from '../../../scripts/lib/target.mjs'
import {
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  login,
  Q,
  readEnvFile,
  runStamp,
  waitForHost,
} from '../../../scripts/lib/probe-stage.mjs'

const SCRIPT = 'a2a-checkout-driver'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const COMMANDS = ['provision', 'authz', 'checkout', 'portal', 'status', 'cleanup']
const PLANS = ['personal', 'pro']
const INTERVALS = ['monthly', 'yearly']

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'env-platform': { type: 'string', default: 'apps/platform/.env' },
    'env-control': { type: 'string', default: 'apps/control/.env' },
    'platform-port': { type: 'string' },
    'control-host': { type: 'string' },
    'state': { type: 'string', default: '.buehne/a2a-checkout.json' },
  },
})
const [command, ...args] = positionals
const STATE_FILE = resolve(ROOT, opts.state)

function fail(message) {
  console.error(`✗ ${SCRIPT}: ${message}`)
  process.exit(1)
}

if (!COMMANDS.includes(command)) fail(`Kommando: ${COMMANDS.join(' | ')}`)

// ── Umgebung und Ziel ───────────────────────────────────────────────────────

function loadTarget() {
  const platformPath = resolve(ROOT, opts['env-platform'])
  const controlPath = resolve(ROOT, opts['env-control'])
  if (!existsSync(platformPath)) fail(`Env-Datei fehlt: ${opts['env-platform']}`)
  if (!existsSync(controlPath)) fail(`Env-Datei fehlt: ${opts['env-control']}`)
  const platformEnv = readEnvFile(platformPath)
  const controlEnv = readEnvFile(controlPath)

  const poolEndpoint = platformEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const poolProject = platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const poolDatabaseId = platformEnv.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
  const poolKey = platformEnv.NUXT_APPWRITE_KEY
  const controlEndpoint = controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const controlProject = controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const controlDatabaseId = controlEnv.NUXT_PUBLIC_APPWRITE_DATABASE_ID
  // Aufräumen liest das Schema des Control Plane (`tables.read`) — das hat
  // der Migrations-Schlüssel; ohne ihn bleibt der Laufzeit-Schlüssel.
  const controlKey = controlEnv.NUXT_APPWRITE_MIGRATIONS_KEY || controlEnv.NUXT_APPWRITE_KEY
  if (!poolEndpoint || !poolProject || !poolKey) fail(`${opts['env-platform']}: Endpunkt, Projekt oder Schlüssel fehlt.`)
  if (!controlEndpoint || !controlProject || !controlDatabaseId || !controlKey) fail(`${opts['env-control']}: Endpunkt, Projekt, Datenbank oder Schlüssel fehlt.`)

  const expectedPool = controlEnv.NUXT_PUBLIC_CONTROL_POOL_PROJECT
  if (expectedPool && expectedPool !== poolProject) {
    fail(`Das Control Plane erwartet das Projekt „${expectedPool}", ${opts['env-platform']} zeigt auf „${poolProject}".`)
  }
  const local = isLocalEndpoint(poolEndpoint)
  if (local !== isLocalEndpoint(controlEndpoint)) {
    fail('Die zwei Env-Dateien zeigen auf verschiedene Ziele (eine lokal, eine entfernt) — beide müssen zum selben Ziel gehören.')
  }
  if (!local && !expectedPool) {
    fail(`${opts['env-control']}: NUXT_PUBLIC_CONTROL_POOL_PROJECT fehlt — gegen ein entferntes Ziel muss das Control Plane das Projekt der Platform-App selbst nennen.`)
  }

  // Ziel-Prüfung vor dem ersten Client (OPS-002). Entfernt nennt
  // PUKALANI_TARGET_CONFIRM EIN Projekt — geprüft wird damit das Control
  // Plane (dort liegen Community und Abo); das Projekt der Platform-App gehört
  // zum selben Ziel und ist oben gegen die Erwartung des Control Plane gehalten.
  assertTarget({ script: SCRIPT, endpoint: controlEndpoint, projectId: controlProject })
  const confirmed = local ? undefined : true
  assertTarget({ script: SCRIPT, endpoint: poolEndpoint, projectId: poolProject, confirmed, quiet: true })

  const controlHosts = String(platformEnv.NUXT_PUBLIC_TENANCY_CONTROL_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean)
  return {
    local,
    poolEndpoint, poolProject, poolDatabaseId, poolKey,
    controlEndpoint, controlProject, controlDatabaseId, controlKey,
    defaultControlHost: controlHosts[0] ?? '',
  }
}

/** Clients erst hier — `appwriteRest` prüft das Ziel selbst noch einmal. */
function loadClients(target) {
  const control = appwriteRest({ endpoint: target.controlEndpoint, projectId: target.controlProject, key: target.controlKey, script: SCRIPT })
  const pool = poolClient(target)
  return { control, pool }
}

/**
 * Der Client für das Projekt der Platform-App. Entfernt trägt
 * `PUKALANI_TARGET_CONFIRM` die Projekt-Id des Control Plane — für diesen
 * einen Client wird sie deshalb kurz auf das (oben geprüfte) zweite Projekt
 * gestellt und danach zurück.
 */
function poolClient(target) {
  const before = process.env.PUKALANI_TARGET_CONFIRM
  if (!target.local) process.env.PUKALANI_TARGET_CONFIRM = target.poolProject
  try {
    return appwriteRest({ endpoint: target.poolEndpoint, projectId: target.poolProject, key: target.poolKey, script: SCRIPT })
  }
  finally {
    if (before === undefined) delete process.env.PUKALANI_TARGET_CONFIRM
    else process.env.PUKALANI_TARGET_CONFIRM = before
  }
}

// ── HTTP gegen die App ──────────────────────────────────────────────────────

/** Entferntes Ziel: `https://<host>`; gleiche Form wie `createHttpCaller`. */
function createHttpsCaller() {
  /** @type {import('../../../scripts/lib/probe-stage.mjs').HttpCall} */
  return async function call(host, path, { method = 'GET', body, cookie, accept, headers = {} } = {}) {
    const res = await fetch(`https://${host}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(accept ? { accept } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) }
    catch { /* HTML-Seite */ }
    return { status: res.status, headers: Object.fromEntries(res.headers), json, text, setCookie: res.headers.getSetCookie() }
  }
}

function createCaller(target, platformPort) {
  if (!target.local) {
    if (platformPort) fail('`--platform-port` gilt nur für ein lokales Ziel; die Env-Dateien zeigen auf ein entferntes.')
    return createHttpsCaller()
  }
  const port = Number(platformPort)
  if (!Number.isInteger(port) || port <= 0) fail('Lokales Ziel: `--platform-port <port>` des laufenden Platform-Servers fehlt.')
  return createHttpCaller({ port }).call
}

// ── Stand ───────────────────────────────────────────────────────────────────

function readState() {
  if (!existsSync(STATE_FILE)) fail(`Kein Stand unter ${opts.state} — zuerst \`provision\` fahren.`)
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true, mode: 0o700 })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  chmodSync(STATE_FILE, 0o600)
}

/** Der Stand muss zum Ziel der Env-Dateien gehören — sonst träfe ein Kommando das falsche. */
function stateFor(target) {
  const state = readState()
  if (state.controlEndpoint !== target.controlEndpoint || state.controlProject !== target.controlProject) {
    fail(`Der Stand unter ${opts.state} gehört zu einem anderen Ziel (${state.controlProject} @ ${state.controlEndpoint}).`)
  }
  return state
}

/** Für alles außer `cleanup`: ein abgebrochenes `provision` hat weder Host noch Anmeldung. */
function completeStateFor(target) {
  const state = stateFor(target)
  if (!state.host || !state.cookie) fail(`Der Lauf unter ${opts.state} ist unvollständig (\`provision\` brach ab) — erst \`cleanup\`, dann neu.`)
  return state
}

// ── Kommandos ───────────────────────────────────────────────────────────────

async function provision(target) {
  if (existsSync(STATE_FILE)) fail(`Unter ${opts.state} steht noch ein Lauf — erst \`cleanup\`.`)
  const controlHost = opts['control-host'] ?? target.defaultControlHost
  if (!controlHost) fail('Kontroll-Host unbekannt: `--control-host <host>` angeben (oder NUXT_PUBLIC_TENANCY_CONTROL_HOSTS in der Platform-Env-Datei).')
  const call = createCaller(target, opts['platform-port'])
  const { control, pool } = loadClients(target)

  const stamp = runStamp()
  const slug = `a2a-probe-${stamp}`
  const state = {
    createdAt: new Date().toISOString(),
    controlEndpoint: target.controlEndpoint,
    controlProject: target.controlProject,
    poolProject: target.poolProject,
    platformPort: target.local ? Number(opts['platform-port']) : null,
    controlHost,
    slug,
    tracked: {},
  }
  const cleanup = createCleanup({ pool, control, poolDatabaseId: target.poolDatabaseId, controlDatabaseId: target.controlDatabaseId })
  // Nach JEDEM Schritt sichern: bricht der Lauf ab, findet `cleanup` trotzdem alles.
  const save = () => {
    state.tracked = Object.fromEntries([...cleanup.tracked].map(([kind, ids]) => [kind, [...ids]]))
    writeState(state)
  }

  const account = await createProbeAccount(pool, { tag: 'a2a', stamp, name: 'A2a Durchlauf' })
  cleanup.track('account', account.userId)
  Object.assign(state, { userId: account.userId, email: account.email, password: account.password })
  save()

  try {
    const controlCookie = await login(call, controlHost, account)
    const community = await createProbeCommunity({
      call, controlHost, cookie: controlCookie, control,
      databaseId: target.controlDatabaseId, slug, name: `A2a Probe ${stamp}`, cleanup,
    })
    Object.assign(state, { communityId: community.communityId, tenantId: community.tenantId ?? '', host: community.host })
    save()

    if (target.local) {
      // Den fremden Namen erreicht hier niemand, und der Rücksprung von Stripe
      // soll nicht bei Production landen.
      state.host = `${slug}.localhost`
      await control.updateRow(target.controlDatabaseId, 'communities', community.communityId, { host: state.host })
      save()
    }
    if (!await waitForHost(call, state.host)) throw new Error(`Der Host ${state.host} wird nach 45 s nicht aufgelöst.`)
    state.cookie = await login(call, state.host, account)
    save()
  }
  catch (error) {
    save()
    fail(`${error instanceof Error ? error.message : String(error)} — Angelegtes steht im Stand, \`cleanup\` räumt es weg.`)
  }

  console.log(JSON.stringify({ host: state.host, communityId: state.communityId, userId: state.userId, email: state.email, stand: opts.state }, null, 2))
}

/** Aufruf als Owner der Probe-Community; der Port kommt aus dem Stand. */
function ownerCaller(target, state) {
  return createCaller(target, opts['platform-port'] ?? (state.platformPort ? String(state.platformPort) : undefined))
}

async function ownerPost(target, path, payload) {
  const state = completeStateFor(target)
  const call = ownerCaller(target, state)
  const res = await call(state.host, path, { method: 'POST', cookie: state.cookie, body: payload ?? {} })
  console.log(res.status, res.text.slice(0, 500))
  if (res.status !== 200) process.exitCode = 1
}

async function authz(target) {
  const state = completeStateFor(target)
  const call = ownerCaller(target, state)
  const owner = await call(state.host, '/api/community/billing/trial', { cookie: state.cookie })
  const guest = await call(state.host, '/api/community/billing/trial')
  console.log(`als Owner       GET /api/community/billing/trial → ${owner.status}`)
  console.log(`ohne Anmeldung GET /api/community/billing/trial → ${guest.status}`)
  if (owner.status !== 200 || ![401, 403, 404].includes(guest.status)) process.exitCode = 1
}

async function status(target) {
  const state = completeStateFor(target)
  const { control } = loadClients(target)
  const { rows } = await control.listRows(target.controlDatabaseId, 'communities', [Q.equal('host', state.host), Q.limit(1)])
  if (!rows.length) {
    console.log('keine Zeile für', state.host)
    process.exitCode = 1
    return
  }
  const r = rows[0]
  console.log(JSON.stringify({
    id: r.$id, host: r.host, plan: r.plan, billingStatus: r.billingStatus ?? '',
    stripeCustomerId: r.stripeCustomerId ?? '', stripeSubscriptionId: r.stripeSubscriptionId ?? '',
    trialEndsAt: r.trialEndsAt ?? null, pastDueSince: r.pastDueSince ?? null,
    suspension: r.suspension ?? '', suspensionReason: (r.suspensionReason ?? '').slice(0, 120),
  }, null, 2))
}

async function cleanupRun(target) {
  const state = stateFor(target)
  const { control, pool } = loadClients(target)
  const cleanup = createCleanup({ pool, control, poolDatabaseId: target.poolDatabaseId, controlDatabaseId: target.controlDatabaseId })
  for (const [kind, ids] of Object.entries(state.tracked ?? {})) {
    for (const id of ids) cleanup.track(kind, id)
  }
  const { deleted, leftovers } = await cleanup.run()
  console.log('gelöscht:', JSON.stringify(deleted))
  if (leftovers.length) {
    console.error(`✗ übrig: ${leftovers.join(', ')} — der Stand bleibt stehen.`)
    process.exitCode = 1
    return
  }
  rmSync(STATE_FILE)
  console.log('✔ nichts übrig. Kunde und Abo im Stripe-Testkonto bleiben stehen (dort bei Bedarf kündigen).')
}

const target = loadTarget()
if (command === 'provision') await provision(target)
else if (command === 'authz') await authz(target)
else if (command === 'checkout') {
  const plan = args[0] ?? 'personal'
  const interval = args[1] ?? 'monthly'
  if (!PLANS.includes(plan) || !INTERVALS.includes(interval)) fail(`checkout [${PLANS.join('|')}] [${INTERVALS.join('|')}]`)
  await ownerPost(target, '/api/community/billing/checkout', { plan, interval })
}
else if (command === 'portal') await ownerPost(target, '/api/community/billing/portal')
else if (command === 'status') await status(target)
else if (command === 'cleanup') await cleanupRun(target)
