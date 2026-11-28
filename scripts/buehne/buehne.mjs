#!/usr/bin/env node
/**
 * Die Bühne: zwei feste Probe-Communities mit Konten je Rolle (OPS-009, GA1 P27).
 *
 * Elf Beweis-Skripte setzen `kunde-a.localhost` und `kunde-b.localhost`
 * voraus, die nichts im Repo anlegte. Die Bühne baut sie auf, sagt den
 * Skripten über `env`, wo sie stehen, und baut sie restlos wieder ab.
 *
 *   pnpm buehne up     [--platform-port 3150] [--control-host app.localhost] [--suffix <wort>]
 *   pnpm buehne status
 *   pnpm buehne env    # Zeilen NAME=wert für ein Beweis-Skript, ohne Geheimnisse
 *   pnpm buehne smoke  # Rauchtest gegen den laufenden Platform-Server
 *   pnpm buehne down
 *   pnpm buehne run    --lauf <buehne|nacht> | --only <teil> [--liste] [--control-port 3004] [--einzel-port 3001] [--branding-port 3016] [--portfolio-port 3005]
 *   pnpm buehne e2e    [--control-port 3004] [--portfolio-port 3005]  # die Browser-Tests gegen die Bühne
 *
 * `run` fährt die Beweis-Skripte laut Einteilung `scripts/buehne/beweise.mjs`
 * gegen die stehende Bühne — Einzelheiten im Kopf von `scripts/buehne/run.mjs`.
 * `e2e` fährt die Browser-Tests, die die Bühne brauchen (übersprungen ⇒ rot) —
 * Einzelheiten im Kopf von `scripts/buehne/e2e.mjs`.
 *
 * Weitere Optionen: `--env-platform <datei>` (Standard apps/platform/.env,
 * daraus Endpunkt, Pool-Projekt und Pool-Schlüssel) und `--env-control <datei>`
 * (Standard apps/control/.env, daraus Control Plane und Schlüssel). Die Werte
 * werden nie ausgegeben.
 *
 * WAS `up` ANLEGT: Community A (Plan pro, öffentlich, Registrierung zu) mit
 * den Konten owner, admin, moderator, editor, member (Rolle viewer), removed
 * (Zeile `removed`, ohne Label), stranger (weder Zeile noch Label) und
 * operator (globales Label `admin`, keine Zeile); Community B (Plan pro,
 * öffentlich, Registrierung offen) mit owner und member. Jedes Mitglied trägt
 * seine `community_members`-Zeile UND das Community-Label am Konto — wie die
 * Laufzeit es täte. Zeilen-Ids und tenantIds tragen einen Lauf-Stempel.
 *
 * Der Stand steht in `.buehne/state.json` (Modus 600, nicht im Repo): Hosts,
 * Ids, je Rolle Adresse und Passwort. Die Konsole zeigt nur Namen, Rollen und
 * Zahlen. Nur gegen einen lokalen Endpunkt, es sei denn
 * `PUKALANI_TARGET_CONFIRM` ist gesetzt (scripts/lib/target.mjs).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { assertTarget } from '../lib/target.mjs'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createProbeAccount,
  findColumns,
  isNotFound,
  PERSON_COLUMNS,
  Q,
  readEnvFile,
  runStamp,
  seedStageCommunity,
  setAccountLabels,
  STAMP_COLUMNS,
  sweepRows,
} from '../lib/probe-stage.mjs'
import { e2eCommand } from './e2e.mjs'
import { runCommand } from './run.mjs'
import { runSmoke } from './smoke.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATE_DIR = join(ROOT, '.buehne')
const STATE_FILE = join(STATE_DIR, 'state.json')

/** Wer auf welcher Bühne steht. `role: null` = keine Mitglieds-Zeile. */
const CAST = {
  a: [
    { key: 'owner', role: 'owner' },
    { key: 'admin', role: 'admin' },
    { key: 'moderator', role: 'moderator' },
    { key: 'editor', role: 'editor' },
    { key: 'member', role: 'viewer' },
    { key: 'removed', role: 'viewer', status: 'removed' },
    { key: 'stranger', role: null },
    { key: 'operator', role: null, labels: ['admin'] },
  ],
  b: [
    { key: 'owner', role: 'owner' },
    { key: 'member', role: 'viewer' },
  ],
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'platform-port': { type: 'string' },
    'control-host': { type: 'string' },
    'suffix': { type: 'string' },
    'env-platform': { type: 'string', default: 'apps/platform/.env' },
    'env-control': { type: 'string', default: 'apps/control/.env' },
    // nur für `run`
    'lauf': { type: 'string' },
    'only': { type: 'string', multiple: true },
    'liste': { type: 'boolean', default: false },
    'control-port': { type: 'string' },
    'einzel-port': { type: 'string' },
    'env-einzel': { type: 'string', default: 'apps/comments/.env' },
    'branding-port': { type: 'string' },
    'env-branding': { type: 'string', default: 'apps/branding/.env' },
    // `run` und `e2e`: die Studio-Site (BT1 a)
    'portfolio-port': { type: 'string' },
    'env-portfolio': { type: 'string', default: 'apps/portfolio/.env' },
  },
})
const command = positionals[0]

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

// ── Umgebung ────────────────────────────────────────────────────────────────

function loadClients() {
  const platformPath = resolve(ROOT, opts['env-platform'])
  const controlPath = resolve(ROOT, opts['env-control'])
  if (!existsSync(platformPath)) fail(`Env-Datei fehlt: ${opts['env-platform']}`)
  if (!existsSync(controlPath)) fail(`Env-Datei fehlt: ${opts['env-control']}`)
  const platformEnv = readEnvFile(platformPath)
  const controlEnv = readEnvFile(controlPath)

  const poolEndpoint = platformEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const poolProject = platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const poolDatabaseId = platformEnv.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
  const controlEndpoint = controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const controlProject = controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const controlDatabaseId = controlEnv.NUXT_PUBLIC_APPWRITE_DATABASE_ID
  // Das Schema des Control Plane zu lesen (Aufräumen über alle Tabellen)
  // braucht `tables.read` — das hat der Migrations-Schlüssel.
  const controlKey = controlEnv.NUXT_APPWRITE_MIGRATIONS_KEY || controlEnv.NUXT_APPWRITE_KEY
  const poolKey = platformEnv.NUXT_APPWRITE_KEY
  if (!poolEndpoint || !poolProject || !poolKey) fail(`${opts['env-platform']}: Endpunkt, Projekt oder Schlüssel fehlt.`)
  if (!controlEndpoint || !controlProject || !controlDatabaseId || !controlKey) fail(`${opts['env-control']}: Endpunkt, Projekt, Datenbank oder Schlüssel fehlt.`)
  const expectedPool = controlEnv.NUXT_PUBLIC_CONTROL_POOL_PROJECT
  if (expectedPool && expectedPool !== poolProject) {
    fail(`Das Control Plane erwartet das Pool-Projekt „${expectedPool}", ${opts['env-platform']} zeigt auf „${poolProject}".`)
  }

  // Ziel-Prüfung vor dem ersten Client (OPS-002); `appwriteRest` prüft noch einmal.
  assertTarget({ script: 'buehne', endpoint: poolEndpoint, projectId: poolProject })
  assertTarget({ script: 'buehne', endpoint: controlEndpoint, projectId: controlProject })

  const pool = appwriteRest({ endpoint: poolEndpoint, projectId: poolProject, key: poolKey, script: 'buehne' })
  const control = appwriteRest({ endpoint: controlEndpoint, projectId: controlProject, key: controlKey, script: 'buehne' })
  return { pool, control, poolProject, poolDatabaseId, controlDatabaseId }
}

// ── Stand-Datei ─────────────────────────────────────────────────────────────

function readState() {
  if (!existsSync(STATE_FILE)) return null
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  chmodSync(STATE_FILE, 0o600)
}

/** Alle Kennungen aus dem Stand, für Abbau und Nachzählen. */
function stateIds(state) {
  const sites = Object.values(state.communities ?? {})
  return {
    communities: sites.map(site => site.communityId),
    tenants: sites.map(site => site.tenantId),
    hosts: sites.map(site => site.host),
    accounts: sites.flatMap(site => Object.values(site.accounts ?? {}).map(account => account.userId)),
    members: sites.flatMap(site => site.memberRowIds ?? []),
  }
}

// ── up ──────────────────────────────────────────────────────────────────────

async function up() {
  const existing = readState()
  if (existing) fail(`Es steht schon eine Bühne (${STATE_FILE.replace(`${ROOT}/`, '')}, Stempel ${existing.stamp}). Erst \`pnpm buehne down\`.`)

  const suffix = opts.suffix ?? ''
  if (suffix && !/^[a-z0-9]{1,20}$/.test(suffix)) fail('--suffix: nur Kleinbuchstaben und Ziffern, höchstens 20 Zeichen.')
  const host = letter => `kunde-${letter}${suffix ? `-${suffix}` : ''}.localhost`
  const platformPort = Number(opts['platform-port'] ?? 3150)
  const controlHost = opts['control-host'] ?? 'app.localhost'

  const { pool, control, poolProject, poolDatabaseId, controlDatabaseId } = loadClients()

  // Ein Host, den es schon gibt, gehört nicht zu dieser Bühne (es steht ja keine) — nichts ändern.
  const taken = await control.listRows(controlDatabaseId, 'communities', [Q.equal('host', [host('a'), host('b')]), Q.select(['$id', 'host']), Q.limit(5)])
  if (taken.total > 0) {
    fail(`Der Host ${taken.rows.map(row => row.host).join(', ')} ist schon vergeben und gehört nicht zu dieser Bühne. Eine eigene Bühne daneben: --suffix <wort>.`)
  }

  const stamp = runStamp()
  const state = {
    stamp,
    createdAt: new Date().toISOString(),
    platformPort,
    controlHost,
    poolProject,
    poolDatabaseId,
    controlDatabaseId,
    complete: false,
    communities: {},
  }
  // Der Stand wird nach JEDEM Schritt geschrieben: bricht `up` mittendrin ab,
  // findet `down` trotzdem alles, was schon steht.
  writeState(state)

  const plan = {
    a: { name: 'Bühne A', openRegistration: false },
    b: { name: 'Bühne B', openRegistration: true },
  }
  try {
    for (const letter of ['a', 'b']) {
      const site = {
        communityId: `buehne${letter}${stamp}`,
        tenantId: `t-buehne-${letter}-${stamp}`,
        host: host(letter),
        name: plan[letter].name,
        plan: 'pro',
        audience: 'public',
        openRegistration: plan[letter].openRegistration,
        accounts: {},
        memberRowIds: [],
      }
      await seedStageCommunity(control, controlDatabaseId, {
        rowId: site.communityId, name: site.name, host: site.host, projectId: poolProject,
        tenantId: site.tenantId, plan: site.plan, audience: site.audience, openRegistration: site.openRegistration,
      })
      state.communities[letter] = site
      writeState(state)

      for (const member of CAST[letter]) {
        const account = await createProbeAccount(pool, {
          tag: `buehne-${letter}-${member.key}`, stamp, name: `${site.name} ${member.key}`,
        })
        site.accounts[member.key] = { ...account, role: member.role, status: member.status ?? (member.role ? 'active' : null) }
        writeState(state)
        if (member.role) {
          const row = await addStageMember(control, controlDatabaseId, {
            communityId: site.communityId, projectId: poolProject, userId: account.userId,
            role: member.role, status: member.status ?? 'active', email: account.email,
          })
          site.memberRowIds.push(row.$id)
          writeState(state)
        }
        // Label wie die Laufzeit: jedes Mitglied MIT Zugang trägt die Community;
        // eine entfernte Person nicht, der Betreiber nur sein globales Label.
        const labels = [...(member.labels ?? []), ...(member.role && !member.status ? [site.communityId] : [])]
        if (labels.length) await setAccountLabels(pool, account.userId, labels)
      }
    }
  }
  catch (error) {
    console.error(`✗ Aufbau abgebrochen: ${error instanceof Error ? error.message : String(error)}`)
    console.error('  Was schon steht, ist in der Stand-Datei — `pnpm buehne down` räumt es ab.')
    process.exit(1)
  }
  state.complete = true
  writeState(state)

  console.log(`✔ Bühne steht (Stempel ${stamp}, Platform-Port ${platformPort}, Kontroll-Host ${controlHost})`)
  for (const [letter, site] of Object.entries(state.communities)) {
    const roles = Object.entries(site.accounts).map(([key, account]) => `${key}${account.role && account.role !== key ? `(${account.role}${account.status === 'removed' ? ', entfernt' : ''})` : ''}`)
    console.log(`  ${letter.toUpperCase()}: ${site.host} · Registrierung ${site.openRegistration ? 'offen' : 'zu'} · ${roles.length} Konten: ${roles.join(', ')} · ${site.memberRowIds.length} Mitglieds-Zeilen`)
  }
  console.log(`  Stand: ${STATE_FILE.replace(`${ROOT}/`, '')} (Modus 600)`)
}

// ── down ────────────────────────────────────────────────────────────────────

async function down() {
  const state = readState()
  if (!state) {
    console.log('Keine Bühne laut Stand-Datei — nichts zu tun.')
    return
  }
  const { pool, control, poolDatabaseId, controlDatabaseId } = loadClients()
  const ids = stateIds(state)
  const before = await census(pool, control, state, { poolDatabaseId, controlDatabaseId })

  const cleanup = createCleanup({ pool, control, poolDatabaseId, controlDatabaseId })
  for (const id of ids.accounts) cleanup.track('account', id)
  for (const id of ids.members) cleanup.track('member', id)
  for (const id of ids.communities) cleanup.track('community', id)
  for (const id of ids.tenants) cleanup.track('tenant', id)
  const { deleted, leftovers } = await cleanup.run()

  const after = await census(pool, control, state, { poolDatabaseId, controlDatabaseId })
  console.log(`Bühne ${state.stamp} abgebaut:`)
  const rows = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const width = Math.max(...rows.map(row => row.length), 10)
  console.log(`  ${'Art'.padEnd(width)}  vorher  gelöscht  übrig`)
  for (const row of rows) {
    console.log(`  ${row.padEnd(width)}  ${String(before[row] ?? 0).padStart(6)}  ${String((before[row] ?? 0) - (after[row] ?? 0)).padStart(8)}  ${String(after[row] ?? 0).padStart(5)}`)
  }
  const deletedTotal = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  Löschvorgänge laut Register: ${deletedTotal} (${Object.entries(deleted).map(([key, n]) => `${key} ${n}`).join(', ') || '—'})`)
  const restTotal = Object.values(after).reduce((sum, n) => sum + n, 0)
  if (leftovers.length || restTotal) {
    console.error(`✗ Übrig: ${[...leftovers, ...Object.entries(after).filter(([, n]) => n).map(([key, n]) => `${key}=${n}`)].join(', ')} — Stand-Datei bleibt.`)
    process.exit(1)
  }
  rmSync(STATE_FILE)
  console.log('✔ nichts übrig, Stand-Datei gelöscht')
}

/**
 * Zählt, was von der Bühne in der Instanz steht — über die Kennungen aus dem
 * Stand UND über die Stempel-/Personen-Spalten aller Tabellen.
 */
async function census(pool, control, state, { poolDatabaseId, controlDatabaseId }) {
  const ids = stateIds(state)
  const exists = async (fn) => {
    try {
      await fn()
      return 1
    }
    catch (error) {
      if (isNotFound(error)) return 0
      throw error
    }
  }
  let accounts = 0
  for (const id of ids.accounts) accounts += await exists(() => pool.get(`/users/${id}`))
  const byHost = ids.hosts.length
    ? (await control.listRows(controlDatabaseId, 'communities', [Q.equal('host', ids.hosts), Q.select(['$id']), Q.limit(10)])).total
    : 0
  const members = ids.communities.length
    ? (await control.listRows(controlDatabaseId, 'community_members', [Q.equal('communityId', ids.communities), Q.select(['$id']), Q.limit(1)])).total
    : 0
  const stampTargets = await findColumns(pool, poolDatabaseId, STAMP_COLUMNS) ?? []
  const personTargets = await findColumns(pool, poolDatabaseId, PERSON_COLUMNS) ?? []
  const stamped = await sweepRows(pool, poolDatabaseId, stampTargets, [...ids.tenants, ...ids.communities])
  const personal = await sweepRows(pool, poolDatabaseId, personTargets, ids.accounts)
  const controlPersonal = await sweepRows(control, controlDatabaseId, (await findColumns(control, controlDatabaseId, PERSON_COLUMNS)) ?? [], ids.accounts)
  /** @type {Record<string, number>} */
  const out = {
    'Konten (Pool)': accounts,
    'Communities (Host)': byHost,
    'Mitglieds-Zeilen': members,
  }
  for (const [key, n] of Object.entries(stamped)) out[`Pool ${key} (Stempel)`] = n
  for (const [key, n] of Object.entries(personal)) out[`Pool ${key} (Konto)`] = n
  for (const [key, n] of Object.entries(controlPersonal)) if (key !== 'community_members.runtimeUserId') out[`Control ${key} (Konto)`] = n
  return out
}

// ── status / env / smoke ────────────────────────────────────────────────────

async function status() {
  const state = readState()
  if (!state) {
    console.log('Keine Bühne laut Stand-Datei.')
    return
  }
  const { pool, control, poolDatabaseId, controlDatabaseId } = loadClients()
  const ids = stateIds(state)
  console.log(`Bühne ${state.stamp} (angelegt ${state.createdAt}${state.complete ? '' : ', UNVOLLSTÄNDIG'}) · Platform-Port ${state.platformPort} · Kontroll-Host ${state.controlHost}`)
  for (const [letter, site] of Object.entries(state.communities)) {
    console.log(`  ${letter.toUpperCase()}: ${site.host} · Konten ${Object.keys(site.accounts).join(', ')}`)
  }
  const counts = await census(pool, control, state, { poolDatabaseId, controlDatabaseId })
  console.log('  laut Stand-Datei / in der Instanz:')
  console.log(`    Konten ${ids.accounts.length} / ${counts['Konten (Pool)']} · Communities ${ids.communities.length} / ${counts['Communities (Host)']} · Mitglieds-Zeilen ${ids.members.length} / ${counts['Mitglieds-Zeilen']}`)
  const extra = Object.entries(counts).filter(([key]) => key.startsWith('Pool ') || key.startsWith('Control '))
  console.log(`    weitere Zeilen der Bühne: ${extra.map(([key, n]) => `${key} ${n}`).join(', ') || 'keine'}`)
}

/**
 * Die Zeilen, die ein Beweis-Skript über die Bühne wissen muss — ohne Geheimnisse.
 *
 * @returns {Record<string, string>}
 */
function stageEnvLines(state) {
  const { a, b } = state.communities
  const port = opts['platform-port'] ?? state.platformPort
  const lines = {
    PLATFORM_PORT: port,
    CONTROL_HOST: opts['control-host'] ?? state.controlHost,
    // Dieselben zwei Hosts unter allen Namen, die die Beweis-Skripte lesen.
    TENANT_A_HOST: a.host,
    TENANT_B_HOST: b.host,
    TENANT_HOST_A: a.host,
    TENANT_HOST_B: b.host,
    TENANT_HOST: a.host,
    OTHER_TENANT_HOST: a.host,
    TENANT_ID_A: a.tenantId,
    TENANT_ID_B: b.tenantId,
    BUEHNE_COMMUNITY_A: a.communityId,
    BUEHNE_COMMUNITY_B: b.communityId,
    BUEHNE_STATE: STATE_FILE,
  }
  return Object.fromEntries(Object.entries(lines).map(([key, value]) => [key, String(value)]))
}

function env() {
  const state = readState()
  if (!state) fail('Keine Bühne laut Stand-Datei — erst `pnpm buehne up`.')
  for (const [key, value] of Object.entries(stageEnvLines(state))) console.log(`${key}=${value}`)
}

async function run() {
  const state = readState()
  const code = await runCommand({ root: ROOT, opts, state, stageEnv: state?.complete ? stageEnvLines(state) : null })
  process.exit(code)
}

async function e2e() {
  process.exit(await e2eCommand({ root: ROOT, opts, state: readState() }))
}

async function smoke() {
  const state = readState()
  if (!state?.complete) fail('Keine vollständige Bühne laut Stand-Datei — erst `pnpm buehne up`.')
  const clients = loadClients()
  const result = await runSmoke({
    state,
    platformPort: Number(opts['platform-port'] ?? state.platformPort),
    controlHost: opts['control-host'] ?? state.controlHost,
    ...clients,
  })
  process.exit(result.fail === 0 ? 0 : 1)
}

const COMMANDS = { up, down, status, env, smoke, run, e2e }
if (!COMMANDS[command]) {
  console.error('Aufruf: node scripts/buehne/buehne.mjs <up|status|env|smoke|run|e2e|down> [--platform-port N] [--control-host H] [--suffix W] [--env-platform D] [--env-control D]')
  process.exit(2)
}
await COMMANDS[command]()
