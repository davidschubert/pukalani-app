#!/usr/bin/env node
/**
 * PROD → LOCAL: die ganze Prod-Appwrite (api.pukalani.app) als Spiegel in die
 * lokale OrbStack-Appwrite (Davids Entscheidungen 2026-11-09, Runbook
 * docs/runbooks/APPWRITE-PROD-SPIEGEL.md — dort stehen Begründung, Ablauf und
 * Fallen; dieser Kopf sagt nur, was das Werkzeug tut).
 *
 *   node scripts/ops/appwrite-mirror-prod-to-local.mjs --phase all --yes
 *
 * PHASEN (einzeln wiederholbar, `--run <ordner>` nimmt einen älteren Abzug):
 *   fetch    Prod NUR LESEN: Zeilen-Zählung, mariadb-dump --single-transaction
 *            der Schema `appwrite`, Volumes uploads/functions/builds/sites als tar.
 *   restore  Lokal ÜBERSCHREIBEN (braucht --yes): Sicherung der lokalen DB +
 *            .env, Dienste stoppen, Schema ersetzen, Volumes ersetzen,
 *            `_APP_OPENSSL_KEY_V1` = Prod-Wert (frisch per ssh gelesen, nie
 *            ausgegeben), Sessions/Domain-Regeln leeren, Redis leeren, starten.
 *   post     Lokale Zugänge: Spiegel-Bot als Console-Owner, je Prod-Key ein
 *            LOKALER Zwilling (gleiche Scopes) und der Prod-Key gelöscht,
 *            Web-Platform `localhost`, versiegelte App-Geheimnisse geleert,
 *            apps/*\/.env im Haupt-Checkout umgeschrieben.
 *   verify   Zeilen-Zählung lokal gegen Prod + Nutzerzahl je Projekt per API.
 *
 * Prod wird an KEINER Stelle beschrieben: jeder ssh-Aufruf ist ein SELECT,
 * ein mariadb-dump, ein printenv oder ein read-only gemountetes tar.
 */
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── Konfiguration ───────────────────────────────────────────────────────────
const HOME = os.homedir()
const PROD_SSH = process.env.MIRROR_PROD_SSH ?? 'ploi@188.245.61.155'
const LOCAL_DIR = process.env.MIRROR_LOCAL_DIR ?? path.join(HOME, 'Developer/orbstack/appwrite-maria/appwrite')
const BACKUP_ROOT = process.env.MIRROR_BACKUP_ROOT ?? path.join(HOME, 'Developer/orbstack/appwrite-maria/backups/prod-mirror')
const CONSOLE_ENV = path.join(HOME, '.appwrite-secrets/local-console.env')
const LOCAL_ENDPOINT = 'http://localhost/v1'
const VOLUMES = ['uploads', 'functions', 'builds', 'sites']
// Dienste, die beim Einspielen laufen BLEIBEN (alles andere wird gestoppt).
const KEEP_RUNNING = new Set(['mariadb', 'redis', 'clickhouse', 'traefik'])
// Wie viele Abzüge im BACKUP_ROOT bleiben (jeder enthält Prod-Nutzerdaten).
const KEEP_RUNS = 2

/**
 * Welche App gegen welches gespiegelte Projekt läuft — und welcher Key
 * (nach Art, s. keyKind) in welche Variable gehört. `photos` und `help`
 * fehlen bewusst: es gibt kein Prod-Projekt für sie.
 */
const APPS = {
  platform: { project: 'account', extra: { NUXT_PLATFORM_CONTROL_ENDPOINT: LOCAL_ENDPOINT, NUXT_PLATFORM_CONTROL_PROJECT_ID: 'admin', NUXT_PLATFORM_CONTROL_KEY: { project: 'admin', kind: 'readonly' } } },
  comments: { project: 'account' },
  control: { project: 'admin', extra: { NUXT_PUBLIC_CONTROL_POOL_PROJECT: 'account' } },
  portfolio: { project: 'portfolio' },
  marketing: { project: 'portfolio' },
  branding: { project: 'branding' },
}

// ── Argumente ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const phase = arg('--phase') ?? 'all'
const yes = args.includes('--yes')
const PHASES = phase === 'all' ? ['fetch', 'restore', 'post', 'verify'] : phase.split(',')

const log = (...m) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m)
const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1) }

// ── Shell-Helfer ────────────────────────────────────────────────────────────
function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts })
}
/** Befehl, dessen stdout in eine Datei fließt (Dump/tar), ohne den Puffer zu sprengen. */
function shToFile(cmd, argv, file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file, { mode: 0o600 })
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += d })
    p.stdout.pipe(out)
    p.on('close', code => out.close(() => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-500)}`))))
  })
}
/** Datei → stdin eines Befehls (Einspielen). */
function shFromFile(cmd, argv, file, { gunzip = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += d })
    p.stdout.on('data', () => {})
    p.stdin.on('error', e => reject(new Error(`${cmd} stdin: ${e.message} ${err.slice(-500)}`)))
    const src = fs.createReadStream(file)
    if (gunzip) {
      const z = spawn('gunzip', ['-c'], { stdio: ['pipe', 'pipe', 'inherit'] })
      src.pipe(z.stdin); z.stdout.pipe(p.stdin)
    }
    else src.pipe(p.stdin)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-500)}`)))
  })
}

// -r (raw): ohne ihn verdoppelt der Batch-Modus jeden Backslash — JSON-Spalten
// wie `_permissions` (`team:…\/owner`) kämen beim Zurückschreiben verfälscht an.
const PROD_MARIADB = `docker exec -i appwrite-mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r appwrite'`
/** SQL gegen Prod — NUR lesende Statements übergeben. */
function prodSql(sql) {
  if (/\b(insert|update|delete|drop|alter|create|truncate|replace|grant)\b/i.test(sql)) die('prodSql: nur lesende Statements erlaubt')
  return sh('ssh', ['-o', 'BatchMode=yes', PROD_SSH, PROD_MARIADB], { input: sql })
}
function localSql(sql) {
  return sh('docker', ['exec', '-i', 'appwrite-mariadb', 'sh', '-c', 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r appwrite'], { input: sql })
}
const rows = out => out.trim() ? out.trim().split('\n').map(l => l.split('\t')) : []
const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Zählt JEDE Daten-Tabelle (ohne *_perms) — Prod und lokal mit derselben Abfrage. */
function countAll(runSql) {
  const tables = rows(runSql(`SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema='appwrite' AND TABLE_NAME NOT LIKE '%\\_perms' ORDER BY 1;`)).map(r => r[0])
  const counts = {}
  for (let i = 0; i < tables.length; i += 200) {
    const chunk = tables.slice(i, i + 200)
    const sql = chunk.map(t => `SELECT ${q(t)}, COUNT(*) FROM \`${t}\``).join(' UNION ALL ') + ';'
    for (const [t, n] of rows(runSql(sql))) counts[t] = Number(n)
  }
  return counts
}

// ── Lauf-Ordner ─────────────────────────────────────────────────────────────
function runDir() {
  const given = arg('--run')
  if (given) return path.resolve(given)
  if (PHASES.includes('fetch')) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const dir = path.join(BACKUP_ROOT, stamp)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.chmodSync(BACKUP_ROOT, 0o700)
    return dir
  }
  const runs = fs.existsSync(BACKUP_ROOT) ? fs.readdirSync(BACKUP_ROOT).filter(d => fs.existsSync(path.join(BACKUP_ROOT, d, 'meta.json'))).sort() : []
  if (!runs.length) die('kein Abzug gefunden — erst --phase fetch')
  return path.join(BACKUP_ROOT, runs.at(-1))
}
const RUN = runDir()
const metaFile = path.join(RUN, 'meta.json')
const readMeta = () => JSON.parse(fs.readFileSync(metaFile, 'utf8'))
const writeMeta = m => fs.writeFileSync(metaFile, JSON.stringify(m, null, 2), { mode: 0o600 })

// ── Phase fetch (Prod lesen) ────────────────────────────────────────────────
async function fetchPhase() {
  log(`fetch → ${RUN}`)
  const prodVersion = sh('ssh', ['-o', 'BatchMode=yes', PROD_SSH, 'docker exec appwrite printenv _APP_VERSION']).trim()
  const localVersion = sh('docker', ['exec', 'appwrite', 'printenv', '_APP_VERSION']).trim()
  log(`Appwrite prod ${prodVersion} · lokal ${localVersion}`)
  if (prodVersion !== localVersion) die('Versionen unterschiedlich — erst lokal auf die Prod-Version heben (Schema-Unterschiede!)')

  const projects = rows(prodSql(`SELECT _id, _uid FROM _console_projects ORDER BY _id;`)).map(([id, uid]) => ({ internalId: id, id: uid }))
  log(`Prod-Projekte: ${projects.map(p => `${p.id}(${p.internalId})`).join(', ')}`)

  // Zählung UNMITTELBAR vor dem Dump: was danach abweicht, sind Schreibvorgänge
  // dazwischen (Sessions, Statistik) — oder ein echter Fehler.
  log('Prod: Zeilen zählen …')
  const counts = countAll(prodSql)

  log('Prod: mariadb-dump (single-transaction) …')
  const dumpFile = path.join(RUN, 'appwrite.sql.gz')
  await shToFile('ssh', ['-o', 'BatchMode=yes', PROD_SSH,
    `docker exec appwrite-mariadb sh -c 'exec mariadb-dump --single-transaction --quick --hex-blob --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" appwrite' | gzip -6`], dumpFile)
  const tail = sh('sh', ['-c', `gunzip -c ${JSON.stringify(dumpFile)} | tail -c 200`])
  if (!tail.includes('Dump completed')) die('Dump unvollständig (kein "Dump completed" am Ende)')
  log(`Dump ok: ${(fs.statSync(dumpFile).size / 1048576).toFixed(1)} MB gz`)

  for (const v of VOLUMES) {
    const file = path.join(RUN, `volume-${v}.tar.gz`)
    await shToFile('ssh', ['-o', 'BatchMode=yes', PROD_SSH,
      `docker run --rm -v appwrite_appwrite-${v}:/d:ro alpine tar czf - -C /d .`], file)
    log(`Volume ${v}: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`)
  }

  writeMeta({ createdAt: new Date().toISOString(), prodVersion, projects, counts })

  // Rotation: alte Abzüge enthalten Prod-Nutzerdaten — nur KEEP_RUNS behalten.
  const runs = fs.readdirSync(BACKUP_ROOT).filter(d => fs.existsSync(path.join(BACKUP_ROOT, d, 'meta.json'))).sort()
  for (const old of runs.slice(0, -KEEP_RUNS)) {
    fs.rmSync(path.join(BACKUP_ROOT, old), { recursive: true, force: true })
    log(`alter Abzug gelöscht: ${old}`)
  }
}

// ── Phase restore (lokal überschreiben) ─────────────────────────────────────
async function waitForHealth(seconds = 240) {
  for (let i = 0; i < seconds / 3; i++) {
    try {
      const r = await fetch(`${LOCAL_ENDPOINT}/health/version`)
      if (r.ok) return (await r.json()).version
    }
    catch {
      // Container fährt noch hoch — Verbindung abgelehnt ist hier der Normalfall.
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  die('lokale Appwrite antwortet nicht auf /v1/health/version')
}

function setEnvLine(file, key, value) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const i = lines.findIndex(l => l.startsWith(`${key}=`))
  if (i >= 0) lines[i] = `${key}=${value}`
  else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${key}=${value}`)
  fs.writeFileSync(file, lines.join('\n'))
}

async function restorePhase() {
  if (!yes) die('restore überschreibt die GANZE lokale Appwrite — nur mit --yes')
  const meta = readMeta()
  log(`restore ← ${RUN} (Prod-Stand ${meta.createdAt})`)

  // 1) Sicherung des lokalen Ist-Stands (DB + .env) in den Lauf-Ordner.
  const safety = path.join(RUN, 'local-before')
  fs.mkdirSync(safety, { recursive: true, mode: 0o700 })
  await shToFile('sh', ['-c', `docker exec appwrite-mariadb sh -c 'exec mariadb-dump --single-transaction --quick --hex-blob -uroot -p"$MYSQL_ROOT_PASSWORD" appwrite' | gzip -6`], path.join(safety, 'appwrite.sql.gz'))
  fs.copyFileSync(path.join(LOCAL_DIR, '.env'), path.join(safety, 'appwrite.env'))
  fs.chmodSync(path.join(safety, 'appwrite.env'), 0o600)
  log(`lokale Sicherung: ${safety}`)

  // 2) Prod-Schlüssel frisch lesen (nie auf Platte außer in der lokalen .env).
  const key = sh('ssh', ['-o', 'BatchMode=yes', PROD_SSH, 'docker exec appwrite printenv _APP_OPENSSL_KEY_V1']).trim()
  if (!/^[A-Za-z0-9+/=_-]{32,}$/.test(key)) die('Prod-_APP_OPENSSL_KEY_V1 hat ein unerwartetes Format — Abbruch, nichts geändert')

  // 3) Dienste stoppen (DB, Redis, ClickHouse, Traefik laufen weiter).
  const services = sh('docker', ['compose', 'config', '--services'], { cwd: LOCAL_DIR }).trim().split('\n').filter(s => !KEEP_RUNNING.has(s))
  log(`stoppe: ${services.join(' ')}`)
  sh('docker', ['compose', 'stop', ...services], { cwd: LOCAL_DIR })

  // 4) Schema ersetzen.
  log('Schema appwrite ersetzen …')
  sh('docker', ['exec', '-i', 'appwrite-mariadb', 'sh', '-c', 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD"'],
    { input: 'DROP DATABASE IF EXISTS appwrite; CREATE DATABASE appwrite DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;' })
  await shFromFile('docker', ['exec', '-i', 'appwrite-mariadb', 'sh', '-c', 'exec mariadb --max-allowed-packet=1G -uroot -p"$MYSQL_ROOT_PASSWORD" appwrite'],
    path.join(RUN, 'appwrite.sql.gz'), { gunzip: true })
  log('Dump eingespielt')

  // 5) Volumes ersetzen.
  for (const v of VOLUMES) {
    await shFromFile('docker', ['run', '--rm', '-i', '-v', `appwrite_appwrite-${v}:/d`, 'alpine', 'sh', '-c', 'find /d -mindepth 1 -delete && tar xzf - -C /d'],
      path.join(RUN, `volume-${v}.tar.gz`))
    log(`Volume ${v} ersetzt`)
  }

  // 6) Lokal entschärfen: was nur auf Prod Sinn hat oder dort weiterleben soll.
  //    - Sessions: Davids Wahl „1:1 mit Hashes" heißt Anmelden mit dem eigenen
  //      Passwort, NICHT übernommene Prod-Anmeldungen.
  //    - Domain-Regeln/Zertifikate (api.pukalani.app): sonst versucht der
  //      lokale Wartungs-Task eine Let's-Encrypt-Erneuerung für die Prod-Domain.
  const sessionTables = rows(localSql(`SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema='appwrite' AND TABLE_NAME REGEXP '^_([0-9]+|console)_sessions(_perms)?$';`)).map(r => r[0])
  const ruleTables = ['_console_rules', '_console_rules_perms', '_console_certificates', '_console_certificates_perms']
  localSql([...sessionTables, ...ruleTables].map(t => `DELETE FROM \`${t}\`;`).join('\n'))
  log(`geleert: ${sessionTables.length} Session-Tabellen, Domain-Regeln, Zertifikate`)

  // 7) Schlüssel setzen, Cache leeren, starten (up -d erzeugt die Container mit
  //    der neuen Env neu — ein restart würde die alte behalten).
  setEnvLine(path.join(LOCAL_DIR, '.env'), '_APP_OPENSSL_KEY_V1', `"${key}"`)
  log('lokale .env: _APP_OPENSSL_KEY_V1 = Prod-Wert')
  sh('docker', ['exec', 'appwrite-redis', 'redis-cli', 'FLUSHALL'])
  sh('docker', ['compose', 'up', '-d'], { cwd: LOCAL_DIR })
  log(`lokale Appwrite oben: ${await waitForHealth()}`)
}

// ── Phase post (lokale Zugänge) ─────────────────────────────────────────────
function consoleClient() {
  let cookie = ''
  return async function call(method, p, body, headers = {}) {
    const r = await fetch(LOCAL_ENDPOINT + p, {
      method,
      headers: { 'content-type': 'application/json', 'x-appwrite-project': 'console', ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const sc = r.headers.getSetCookie?.() ?? []
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ')
    const text = await r.text()
    let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
    if (!r.ok && r.status !== 404 && r.status !== 409) throw new Error(`${method} ${p} → ${r.status} ${json.message ?? text.slice(0, 200)}`)
    return { status: r.status, json }
  }
}
/** Art eines Keys aus seinem NAMEN (Prod-Namen: runtime/Runtime/nuxt-ssr-prod, migrations/Migrations/migrations-prod, platform read-only …). */
const keyKind = name => /read-only/i.test(name) ? 'readonly' : /migrat/i.test(name) ? 'migrations' : 'runtime'
const uid20 = () => crypto.randomBytes(10).toString('hex')

async function postPhase() {
  const meta = readMeta()
  const call = consoleClient()

  // 1) Spiegel-Bot: ein eigenes Console-Konto, per SQL als Owner in die (einzige)
  //    Organisation gesetzt. Davids Prod-Console-Login funktioniert lokal 1:1;
  //    der Bot ist nur dafür da, dass dieses Skript ohne Davids Passwort Keys
  //    anlegen kann. Appwrite ≥ 2.2 erlaubt self-hosted nur EINE Organisation.
  const botEmail = `mirror-bot-${Date.now()}@example.test`
  const botPass = crypto.randomBytes(18).toString('base64url')
  const signup = await call('POST', '/account', { userId: 'unique()', email: botEmail, password: botPass, name: 'Prod-Spiegel-Bot (lokal)' })
  const botId = signup.json.$id
  const [[botInternal]] = rows(localSql(`SELECT _id FROM _console_users WHERE _uid=${q(botId)};`))
  const [[teamInternal, teamId]] = rows(localSql(`SELECT _id, _uid FROM _console_teams ORDER BY _id LIMIT 1;`))
  const [[secret]] = rows(localSql(`SELECT secret FROM _console_memberships WHERE teamInternalId=${q(teamInternal)} ORDER BY _id LIMIT 1;`))
  const mId = uid20()
  const perms = [['read', `user:${botId}`], ['read', `team:${teamId}`], ['update', `user:${botId}`], ['update', `team:${teamId}/owner`], ['delete', `user:${botId}`], ['delete', `team:${teamId}/owner`]]
  const permJson = JSON.stringify(perms.map(([t, r]) => `${t}("${r}")`))
  const now = new Date().toISOString().replace('T', ' ').slice(0, 23)
  localSql(`
    INSERT INTO _console_memberships (_uid,_createdAt,_updatedAt,_permissions,userInternalId,userId,teamInternalId,teamId,roles,invited,joined,confirm,secret,search)
    VALUES (${q(mId)},${q(now)},${q(now)},${q(permJson)},${q(botInternal)},${q(botId)},${q(teamInternal)},${q(teamId)},'["owner"]',${q(now)},${q(now)},1,${q(secret)},${q(`${mId} ${botId}`)});
    ${perms.map(([t, r]) => `INSERT INTO _console_memberships_perms (_type,_permission,_document) VALUES (${q(t)},${q(r)},${q(mId)});`).join('\n')}
    UPDATE _console_teams SET total = total + 1 WHERE _id=${q(teamInternal)};`)
  sh('docker', ['exec', 'appwrite-redis', 'redis-cli', 'FLUSHALL'])
  await call('POST', '/account/sessions/email', { email: botEmail, password: botPass })
  log(`Spiegel-Bot ${botEmail} ist Owner der Organisation`)

  // Zugang festhalten (ersetzt den toten Stand von vor dem Spiegel).
  fs.writeFileSync(CONSOLE_ENV, [
    `# LOKALE OrbStack-Appwrite (http://localhost/console) — seit dem Prod-Spiegel ${meta.createdAt.slice(0, 10)}.`,
    '# David meldet sich mit seinem PROD-Console-Login an (1:1 gespiegelt).',
    '# Dieses Konto ist der Spiegel-Bot (Owner per SQL), angelegt von scripts/ops/appwrite-mirror-prod-to-local.mjs.',
    `CONSOLE_EMAIL=${botEmail}`,
    `CONSOLE_PASS=${botPass}`,
    '',
  ].join('\n'), { mode: 0o600 })

  // 2) Je Projekt: lokale Key-Zwillinge, Prod-Keys weg, Web-Platform localhost.
  const keys = {} // project → kind → secret
  for (const { id } of meta.projects) {
    keys[id] = {}
    const list = (await call('GET', `/projects/${id}/keys`)).json.keys ?? []
    for (const k of list) {
      if (k.name.startsWith('local:')) continue
      const created = await call('POST', `/projects/${id}/keys`, { keyId: 'unique()', name: `local:${k.name}`, scopes: k.scopes })
      keys[id][keyKind(k.name)] = created.json.secret
      await call('DELETE', `/projects/${id}/keys/${k.$id}`)
      log(`${id}: Key „${k.name}" → lokaler Zwilling (${k.scopes.length} Scopes), Prod-Key lokal gelöscht`)
    }
    const platforms = (await call('GET', `/projects/${id}/platforms`)).json.platforms ?? []
    if (!platforms.some(p => p.hostname === 'localhost')) {
      await call('POST', `/projects/${id}/platforms`, { platformId: 'unique()', type: 'web', name: 'localhost (Spiegel)', hostname: 'localhost' })
      log(`${id}: Web-Platform localhost angelegt`)
    }
  }

  // 3) Versiegelte App-Geheimnisse leeren: instance_secrets/stripe_settings sind
  //    mit dem PROD-Umschlag (NUXT_INSTANCE_SECRETS_KEY / NUXT_BILLING_SETTINGS_KEY)
  //    verschlüsselt, den der Mac bewusst NICHT bekommt. Liegen bleiben hieße:
  //    jeder Lesezugriff protokolliert „undecryptable"; leer fällt der Code auf
  //    die lokale Env zurück (DB schlägt Env — nur wenn die DB etwas hat).
  for (const { id } of meta.projects) {
    const key = keys[id].runtime
    if (!key) continue
    for (const table of ['instance_secrets', 'stripe_settings']) {
      const h = { 'x-appwrite-project': id, 'x-appwrite-key': key }
      const list = await call('GET', `/tablesdb/main/tables/${table}/rows?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}`, undefined, h)
      if (list.status === 404) continue
      for (const row of list.json.rows ?? []) await call('DELETE', `/tablesdb/main/tables/${table}/rows/${row.$id}`, undefined, h)
      if (list.json.rows?.length) log(`${id}: ${table} geleert (${list.json.rows.length} versiegelte Zeilen)`)
    }
  }

  // 4) apps/*/.env im HAUPT-Checkout (die Worktrees kopieren von dort).
  const mainRoot = path.dirname(path.resolve(sh('git', ['rev-parse', '--git-common-dir']).trim()))
  const envBackup = path.join(RUN, 'apps-env-before')
  fs.mkdirSync(envBackup, { recursive: true, mode: 0o700 })
  for (const [app, cfg] of Object.entries(APPS)) {
    const file = path.join(mainRoot, 'apps', app, '.env')
    if (!fs.existsSync(file)) { log(`apps/${app}/.env fehlt — übersprungen`); continue }
    fs.copyFileSync(file, path.join(envBackup, `${app}.env`))
    const k = keys[cfg.project]
    if (!k?.runtime || !k?.migrations) die(`Projekt ${cfg.project}: Runtime- oder Migrations-Key fehlt`)
    const set = {
      NUXT_PUBLIC_APPWRITE_ENDPOINT: LOCAL_ENDPOINT,
      NUXT_PUBLIC_APPWRITE_PROJECT_ID: cfg.project,
      NUXT_PUBLIC_APPWRITE_DATABASE_ID: 'main',
      NUXT_APPWRITE_KEY: k.runtime,
      NUXT_APPWRITE_MIGRATIONS_KEY: k.migrations,
    }
    for (const [name, v] of Object.entries(cfg.extra ?? {})) set[name] = typeof v === 'string' ? v : keys[v.project][v.kind]
    for (const [name, v] of Object.entries(set)) {
      if (!v) die(`apps/${app}: kein Wert für ${name}`)
      setEnvLine(file, name, v)
    }
    log(`apps/${app}/.env → Projekt ${cfg.project} (${Object.keys(set).length} Variablen)`)
  }
}

// ── Phase verify ────────────────────────────────────────────────────────────
/** Warum eine Tabelle abweichen DARF — alles andere ist ein Befund. */
function explain(t, sealed) {
  if (sealed.has(t)) return 'versiegelte App-Geheimnisse geleert (gewollt)'
  if (/^_([0-9]+|console)_sessions$/.test(t) || /^_console_(rules|certificates)$/.test(t)) return 'geleert (gewollt)'
  if (/^_console_(keys|platforms|users|memberships|teams|targets)$/.test(t)) return 'Bot, Key-Zwillinge, localhost-Platform (gewollt)'
  if (/^_([0-9]+|console)_(audit|stats|cache|realtime|presenceLogs|abuse|schedules)$/.test(t)) return 'flüchtig (Protokoll/Statistik)'
  return null
}

async function verifyPhase() {
  const meta = readMeta()
  const local = countAll(localSql)
  const all = Object.keys(meta.counts)
  // Die physischen Tabellen von instance_secrets/stripe_settings heißen
  // `_<projekt>_database_<db>_collection_<intern>` — aufgelöst über die
  // Metadaten-Tabelle `_<projekt>_database_<db>` (Spalte _uid = Table-Id).
  const sealed = new Set()
  const dbTables = rows(localSql(`SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema='appwrite' AND TABLE_NAME REGEXP '^_[0-9]+_database_[0-9]+$';`)).map(r => r[0])
  for (const dt of dbTables) {
    for (const [id] of rows(localSql(`SELECT _id FROM \`${dt}\` WHERE _uid IN ('instance_secrets','stripe_settings');`))) sealed.add(`${dt}_collection_${id}`)
  }
  const diffs = all.filter(t => local[t] !== meta.counts[t])
  const unexplained = diffs.filter(t => !explain(t, sealed))
  log(`Tabellen: ${all.length} auf Prod, ${all.length - diffs.length} zählgleich, ${diffs.length} abweichend, davon ${unexplained.length} ungeklärt`)
  for (const t of diffs) console.log(`  ${t}: prod ${meta.counts[t]} · lokal ${local[t] ?? 'FEHLT'} — ${explain(t, sealed) ?? 'PRÜFEN (Schreibzugriff zwischen Zählung und Dump? sonst Fehler)'}`)
  if (unexplained.length) process.exitCode = 1

  // Nutzer je Projekt per API mit dem LOKALEN Runtime-Key jeder App-.env.
  const mainRoot = path.dirname(path.resolve(sh('git', ['rev-parse', '--git-common-dir']).trim()))
  for (const [app, cfg] of Object.entries(APPS)) {
    const file = path.join(mainRoot, 'apps', app, '.env')
    if (!fs.existsSync(file)) continue
    const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
    const r = await fetch(`${LOCAL_ENDPOINT}/users?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [1] }))}`, { headers: { 'x-appwrite-project': env.NUXT_PUBLIC_APPWRITE_PROJECT_ID, 'x-appwrite-key': env.NUXT_APPWRITE_KEY } })
    const j = await r.json()
    const internal = meta.projects.find(p => p.id === cfg.project)?.internalId
    const prodUsers = meta.counts[`_${internal}_users`]
    const ok = r.ok && j.total === prodUsers
    console.log(`  ${ok ? '✓' : '✗'} apps/${app} → ${cfg.project}: HTTP ${r.status}, Nutzer lokal ${j.total ?? j.message} · Prod ${prodUsers}`)
    if (!ok) process.exitCode = 1
  }
}

// ── Ablauf ──────────────────────────────────────────────────────────────────
for (const p of PHASES) {
  if (p === 'fetch') await fetchPhase()
  else if (p === 'restore') await restorePhase()
  else if (p === 'post') await postPhase()
  else if (p === 'verify') await verifyPhase()
  else die(`unbekannte Phase ${p}`)
}
log('fertig')
