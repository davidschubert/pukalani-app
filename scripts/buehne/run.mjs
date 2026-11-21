/**
 * Der Läufer der Bühne: fährt Beweis-Skripte laut Einteilung (OPS-009, GA1 P27, Etappe 3).
 *
 *   pnpm buehne run --liste --lauf nacht         # zeigt nur, was liefe
 *   pnpm buehne run --lauf buehne                # alle Einträge mit lauf „buehne"
 *   pnpm buehne run --lauf nacht                 # „buehne" UND „nacht"
 *   pnpm buehne run --only verify-community-seo  # genau die passenden (auch „hand")
 *
 * Weitere Optionen: `--control-port N` (Betreiber-App, Standard 3004),
 * `--platform-port N` (Standard: aus dem Stand der Bühne), `--control-host H`,
 * `--env-platform` / `--env-control` (wie bei den übrigen Befehlen),
 * `--einzel-port N` und `--env-einzel <datei>` (Standard apps/comments/.env),
 * `--branding-port N` und `--env-branding <datei>` (Standard apps/branding/.env).
 *
 * DIE EINZEL-INSTANZ (`apps/comments`, eigenes Projekt, ohne Mandanten) steht
 * nur, wenn `--einzel-port` gesetzt ist — in der CI nur im nächtlichen Lauf.
 * Ohne sie meldet der Läufer jedes Skript mit `braucht: ['einzel']` als
 * „übersprungen" (zählt nicht als rot). Mit ihr bekommt es die Env-Datei der
 * Einzel-Instanz und `EINZEL_URL` / `EINZEL_PORT`; antwortet ihr
 * `/api/health` nicht, sind diese Skripte rot — dann fehlt der Server, den der
 * Aufruf versprochen hat.
 *
 * BRANDING.SUPPLY (`apps/branding`, eigenes Projekt `branding`) steht nur, wenn
 * `--branding-port` gesetzt ist — in der CI nur im nächtlichen Lauf. Dieselbe
 * Regel: ohne sie „übersprungen", mit ihr die Env-Datei der App und
 * `BRANDING_PORT` / `BRANDING_HOST` / `BRANDING_URL`; antwortet ihr
 * `/api/health` nicht, sind ihre Skripte rot. DER SERVER MUSS MIT GESTELLTEN
 * ANTWORTEN LAUFEN (`BRAND_DEV_STUB_*`, `MARKET_DEV_STUB`,
 * `BRAND_SITE_FETCH_ALLOW_LOOPBACK` — die Zeile steht in `buehne.yml` und in
 * `docs/referenz/LIVE-BEWEISE.md`): kein Skript der Einteilung ruft eine
 * echte KI, Stripe oder eine fremde Website.
 *
 * NACHZÄHLEN BEI BRANDING.SUPPLY: vor und nach jedem Skript mit
 * `env: 'branding'` zählt der Läufer die Zeilen JEDER Tabelle und die Konten
 * des Projekts. Ist danach irgendwo mehr da als vorher, ist das Skript rot
 * („Zeilen übrig: brand_steps +3") — auch wenn alle seine Prüfungen bestanden
 * haben. So gilt „räumt auf und zählt nach" für diese Skripte an EINER Stelle
 * statt in jedem einzeln (gemessen beim Einzug: drei von acht ließen Zeilen
 * liegen, die die App selbst angelegt hatte). Kann der Schlüssel das Schema
 * nicht lesen, entfällt das Nachzählen mit einer Zeile.
 *
 * DER SOLL-STAND DER BÜHNE (`baseline.mjs`, seit 2026-11-21): nach JEDEM
 * Skript liest der Läufer die zwei Zeilen der Probe-Communities und
 * vergleicht Status, Plan, Publikum, Registrierung und Sperre mit dem, was
 * `pnpm buehne up` zugesagt hat. Eine Abweichung macht DIESES Skript rot
 * („Bühne verändert: B plan (leer) statt pro") — auch wenn alle seine
 * Prüfungen bestanden haben. Danach stellt der Läufer die Felder zurück und
 * wartet 31 s (so lange hält der Platform-Server eine Auflösung fest), damit
 * das nächste Skript wieder die zugesagte Bühne sieht. Anlass: ein Skript
 * ließ beide Communities ohne Plan zurück, und rot wurde 40 Skripte später
 * ein Browser-Test, dem Menüpunkte fehlten. Vor dem ersten Skript wird
 * einmal geprüft und zurückgestellt, ohne Rot — was dort abweicht, stammt
 * von einem früheren (abgebrochenen) Lauf.
 *
 * JE SKRIPT: Arbeitsverzeichnis ist der Paket-Ordner (dort löst
 * `node-appwrite` auf), gestartet wird
 * `node [--experimental-strip-types] --import <client-address.mjs> scripts/<name>.mjs`.
 * Die Umgebung setzt sich zusammen aus: der Env-Datei laut Einteilung
 * (`platform` | `control` | `keine`), den Zeilen von `pnpm buehne env`, den
 * gemeinsamen Werten (Pool-Schlüssel und -Projekt, Adressen von Betreiber-App
 * und Mailpit), einer eigenen Aufrufer-Adresse (`client-address.mjs`) und den
 * `vars` des Eintrags.
 *
 * Die Skripte laufen NACHEINANDER: sie teilen sich Server und Probe-
 * Communities. Ein Fehlschlag hält die übrigen nicht auf; am Ende steht eine
 * Tabelle (in GitHub zusätzlich in der Zusammenfassung des Laufs), und der
 * Exit-Code ist 1, sobald eines fehlschlug.
 *
 * GEHEIMNISSE: die Ausgabe der Skripte geht ungefiltert durch (die Skripte
 * geben keine Schlüssel aus — vor dem Einhängen geprüft). Der Läufer selbst
 * nennt nur Namen von Variablen, nie ihre Werte.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkStageBaseline, RESOLVER_SETTLE_MS } from './baseline.mjs'
import { BEWEISE, OPTIONALE_DIENSTE } from './beweise.mjs'
import { appwriteRest, AppwriteRestError, Q, readEnvFile } from '../lib/probe-stage.mjs'
import { assertTarget } from '../lib/target.mjs'

/** Standard-Zeitgrenze, wenn ein Eintrag keine Dauer kennt. */
const DEFAULT_TIMEOUT_S = 300
/** Untergrenze der Zeitgrenze — ein Kaltstart der Server kostet Sekunden. */
const MIN_TIMEOUT_S = 60
/** So viele letzte Zeilen werden bei einem Fehlschlag noch einmal gezeigt. */
const TAIL_LINES = 40

/** Wie ein Dienst, der nicht in jedem Lauf steht, in der Tabelle heißt. */
const SERVICE_NAMES = { einzel: 'Einzel-Instanz', branding: 'branding.supply' }

/** Importiert ein Skript eine `.ts`-Datei? Dann braucht Node `--experimental-strip-types`. */
const IMPORTS_TS = /(?:\bfrom\s*|\bimport\s*\(\s*)['"][^'"]+\.ts['"]/

/**
 * Welche Einträge laufen? Rein, für den Selbsttest.
 *
 * @param {import('./beweise.mjs').Beweis[]} beweise
 * @param {{ lauf?: string, only?: string[] }} options
 */
export function selectProofs(beweise, { lauf, only = [] }) {
  if (only.length) return beweise.filter(entry => only.some(part => entry.skript.includes(part)))
  if (lauf === 'buehne') return beweise.filter(entry => entry.lauf === 'buehne')
  if (lauf === 'nacht') return beweise.filter(entry => entry.lauf === 'buehne' || entry.lauf === 'nacht')
  return []
}

/**
 * Welche nicht immer laufenden Dienste fehlen einem Eintrag? Leer = er darf
 * laufen. Rein, für den Selbsttest.
 *
 * @param {import('./beweise.mjs').Beweis} entry
 * @param {string[]} available die optionalen Dienste, die in diesem Lauf stehen
 * @returns {string[]}
 */
export function missingServices(entry, available) {
  return (entry.braucht ?? []).filter(dienst => OPTIONALE_DIENSTE.includes(dienst) && !available.includes(dienst))
}

/** Zeitgrenze in Sekunden: dreimal die gemessene Dauer, mindestens 60 s. */
export function timeoutSeconds(entry) {
  if (typeof entry.dauer !== 'number') return DEFAULT_TIMEOUT_S
  return Math.max(MIN_TIMEOUT_S, Math.ceil(entry.dauer * 3))
}

/**
 * Die Schlusszeile vieler Skripte („✔ 20 bestanden, 0 fehlgeschlagen",
 * „✔ 64/64 Prüfungen bestanden") ist keine eigene Prüfung.
 */
const SUMMARY_LINE = /^[✔✗]\s*\d+(?:\/\d+)?\s+(?:von\s+\d+\s+)?(?:Prüfungen\s+)?bestanden/

/**
 * Zählt bestandene und fehlgeschlagene Prüfungen: Zeilen, die (nach
 * Einrückung) mit ✔ bzw. ✗ beginnen — ohne die Schlusszeile.
 *
 * @param {string[]} lines
 */
export function countMarks(lines) {
  let pass = 0
  let fail = 0
  for (const line of lines) {
    const start = line.trimStart()
    if (SUMMARY_LINE.test(start)) continue
    if (start.startsWith('✔')) pass++
    else if (start.startsWith('✗')) fail++
  }
  return { pass, fail }
}

/**
 * Tabellen, die beim Nachzählen nicht zählen — je Eintrag ein Grund.
 * `system_runs`: Sperr-Zeilen der Zeit-Läufe des Servers; sie entstehen und
 * fallen im Takt, unabhängig vom Skript.
 */
export const CENSUS_IGNORE = ['system_runs']

/**
 * Wo ist nach einem Skript MEHR da als vorher? Rein, für den Selbsttest.
 * Weniger ist kein Befund (ein Skript darf aufräumen, ein Lauf des Servers
 * auch).
 *
 * @param {Record<string, number>} before
 * @param {Record<string, number>} after
 * @returns {string[]} z. B. `['brand_steps +3', 'Konten +1']`
 */
export function censusGrowth(before, after, ignore = CENSUS_IGNORE) {
  return Object.keys(after)
    .filter(name => !ignore.includes(name) && after[name] > (before[name] ?? 0))
    .sort()
    .map(name => `${name} +${after[name] - (before[name] ?? 0)}`)
}

/**
 * Zeilen je Tabelle und Konten eines Projekts. `null`, wenn der Schlüssel das
 * Schema nicht lesen darf (dann wird nicht nachgezählt).
 *
 * @returns {Promise<Record<string, number> | null>}
 */
async function projectCensus({ schema, data, databaseId }) {
  let tables
  try {
    tables = (await schema.listTables(databaseId)).tables.map(table => table.$id)
  }
  catch (error) {
    if (error instanceof AppwriteRestError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
  /** @type {Record<string, number>} */
  const counts = {}
  for (const tableId of tables) counts[tableId] = (await data.listRows(databaseId, tableId, [Q.limit(1)])).total
  counts.Konten = (await data.get('/users', [Q.limit(1)])).total
  return counts
}

/** Eine eigene private Adresse je Skript: `10.27.<lauf>.<nr>`. */
function clientAddress(runByte, index) {
  return `10.27.${runByte}.${(index % 254) + 1}`
}

/**
 * Die gemeinsamen Werte, die jedes Skript bekommt — ohne Env-Datei.
 *
 * @param {{ stageEnv: Record<string, string>, platformEnv: Record<string, string>, poolDatabaseId: string, controlPort: number, controlHost: string }} input
 */
function sharedEnv({ stageEnv, platformEnv, poolDatabaseId, controlPort, controlHost }) {
  const controlUrl = `http://localhost:${controlPort}`
  return {
    ...stageEnv,
    POOL_KEY: platformEnv.NUXT_APPWRITE_KEY ?? '',
    NUXT_PUBLIC_CONTROL_POOL_PROJECT: platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID ?? '',
    POOL_DATABASE_ID: poolDatabaseId,
    CONTROL_HOST: controlHost,
    CONTROL_PORT: String(controlPort),
    CONTROL_URL: controlUrl,
    NUXT_ONBOARDING_CONTROL_URL: controlUrl,
    STUDIO_URL: controlUrl,
    RUNNER_VERIFY_BASE: controlUrl,
    PROBE_BASE: controlUrl,
    MAILPIT_URL: process.env.MAILPIT_URL || 'http://localhost:8025',
    NUXT_PUBLIC_TENANCY_CONTROL_HOSTS: controlHost,
  }
}

/**
 * Ein Skript fahren. Gibt seine Ausgabe live weiter und hebt alle Zeilen auf.
 *
 * @returns {Promise<{ code: number | null, timedOut: boolean, lines: string[], seconds: number }>}
 */
function runOne({ cwd, args, env, timeoutS }) {
  return new Promise((resolvePromise) => {
    const started = Date.now()
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    /** @type {string[]} */
    const lines = []
    const rest = { out: '', err: '' }
    const take = (key, stream) => (chunk) => {
      const text = rest[key] + chunk.toString('utf8')
      const parts = text.split('\n')
      rest[key] = parts.pop() ?? ''
      lines.push(...parts)
      stream.write(chunk)
    }
    child.stdout.on('data', take('out', process.stdout))
    child.stderr.on('data', take('err', process.stderr))

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, timeoutS * 1000)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (rest.out) lines.push(rest.out)
      if (rest.err) lines.push(rest.err)
      resolvePromise({ code, timedOut, lines, seconds: Math.round((Date.now() - started) / 1000) })
    })
  })
}

/** Name eines Skripts in der Tabelle: `<paket>/<datei>`. */
const shortName = path => `${path.split('/')[1]}/${path.split('/').at(-1)}`

/**
 * @param {{
 *   root: string,
 *   opts: Record<string, string | string[] | boolean | undefined>,
 *   state: any,
 *   stageEnv: Record<string, string> | null,
 * }} input
 * @returns {Promise<number>} Exit-Code
 */
export async function runCommand({ root, opts, state, stageEnv }) {
  const only = /** @type {string[]} */ (opts.only ?? [])
  const lauf = /** @type {string | undefined} */ (opts.lauf)
  if (lauf && lauf !== 'buehne' && lauf !== 'nacht') {
    console.error(`✗ --lauf kennt nur „buehne" und „nacht" (nicht „${lauf}").`)
    return 2
  }
  if (!lauf && !only.length) {
    console.error('✗ Aufruf: pnpm buehne run --lauf <buehne|nacht> | --only <teil des pfads> [--liste] [--control-port N]')
    return 2
  }
  const selected = selectProofs(BEWEISE, { lauf, only })
  if (!selected.length) {
    console.error(`✗ Keine Einträge in scripts/buehne/beweise.mjs passen zu ${only.length ? `--only ${only.join(', ')}` : `--lauf ${lauf}`}.`)
    return 2
  }

  if (opts.liste) {
    console.log(`${selected.length} Skript(e) würden laufen (${only.length ? `--only ${only.join(', ')}` : `--lauf ${lauf}`}):`)
    const width = Math.max(...selected.map(entry => entry.skript.length))
    for (const entry of selected) {
      const meta = entry.lauf === 'hand'
        ? `hand — ${entry.grund}`
        : `${entry.lauf.padEnd(6)} env ${(entry.env ?? '—').padEnd(8)} ~${entry.dauer ?? '?'} s (Grenze ${timeoutSeconds(entry)} s)  braucht ${(entry.braucht ?? []).join(', ') || '—'}`
      console.log(`  ${entry.skript.padEnd(width)}  ${meta}`)
    }
    return 0
  }

  if (!state?.complete || !stageEnv) {
    console.error('✗ Keine vollständige Bühne laut Stand-Datei — erst `pnpm buehne up`.')
    return 1
  }
  const platformPath = resolve(root, String(opts['env-platform']))
  const controlPath = resolve(root, String(opts['env-control']))
  for (const path of [platformPath, controlPath]) {
    if (!existsSync(path)) {
      console.error(`✗ Env-Datei fehlt: ${path.replace(`${root}/`, '')}`)
      return 1
    }
  }
  const platformEnv = readEnvFile(platformPath)
  const controlEnv = readEnvFile(controlPath)
  // Der Läufer reicht Schlüssel an die Skripte weiter — vorher sein Ziel
  // prüfen (OPS-002): lokal durch, entfernt nur mit Bestätigung.
  assertTarget({ script: 'buehne run', endpoint: platformEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID })
  assertTarget({ script: 'buehne run', endpoint: controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID })

  // Die Einzel-Instanz: nur mit Port. Ohne ihn werden ihre Skripte übersprungen.
  const einzelPort = opts['einzel-port'] ? Number(opts['einzel-port']) : null
  /** @type {Record<string, string>} */
  let einzelEnv = {}
  if (einzelPort) {
    const einzelPath = resolve(root, String(opts['env-einzel'] ?? 'apps/comments/.env'))
    if (!existsSync(einzelPath)) {
      console.error(`✗ --einzel-port ist gesetzt, aber die Env-Datei fehlt: ${einzelPath.replace(`${root}/`, '')}`)
      return 1
    }
    einzelEnv = readEnvFile(einzelPath)
    assertTarget({ script: 'buehne run', endpoint: einzelEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: einzelEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID })
    einzelEnv = {
      ...einzelEnv,
      EINZEL_PORT: String(einzelPort),
      EINZEL_URL: `http://localhost:${einzelPort}`,
      // Manche Skripte lesen die Datei selbst (statt `--env-file`).
      EINZEL_ENV_FILE: einzelPath,
    }
  }
  // branding.supply: dieselbe Regel wie bei der Einzel-Instanz.
  const brandingPort = opts['branding-port'] ? Number(opts['branding-port']) : null
  /** @type {Record<string, string>} */
  let brandingEnv = {}
  if (brandingPort) {
    const brandingPath = resolve(root, String(opts['env-branding'] ?? 'apps/branding/.env'))
    if (!existsSync(brandingPath)) {
      console.error(`✗ --branding-port ist gesetzt, aber die Env-Datei fehlt: ${brandingPath.replace(`${root}/`, '')}`)
      return 1
    }
    brandingEnv = readEnvFile(brandingPath)
    assertTarget({ script: 'buehne run', endpoint: brandingEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: brandingEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID })
    brandingEnv = {
      ...brandingEnv,
      BRANDING_PORT: String(brandingPort),
      BRANDING_HOST: 'localhost',
      BRANDING_URL: `http://localhost:${brandingPort}`,
      BRANDING_ENV_FILE: brandingPath,
    }
  }
  const available = [...(einzelPort ? ['einzel'] : []), ...(brandingPort ? ['branding'] : [])]
  // Zwei Zugänge fürs Nachzählen bei branding.supply: das Schema liest der
  // Migrations-Schlüssel (lokal darf der Laufzeit-Schlüssel das nicht), Zeilen
  // und Konten der Laufzeit-Schlüssel. In der CI ist es derselbe.
  const brandingCensus = brandingPort
    ? {
        schema: appwriteRest({ endpoint: brandingEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: brandingEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID, key: brandingEnv.NUXT_APPWRITE_MIGRATIONS_KEY || brandingEnv.NUXT_APPWRITE_KEY, script: 'buehne run' }),
        data: appwriteRest({ endpoint: brandingEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: brandingEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID, key: brandingEnv.NUXT_APPWRITE_KEY || brandingEnv.NUXT_APPWRITE_MIGRATIONS_KEY, script: 'buehne run' }),
        databaseId: brandingEnv.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main',
      }
    : null
  const controlPort = Number(opts['control-port'] ?? 3004)
  const controlHost = stageEnv.CONTROL_HOST
  const shared = sharedEnv({ stageEnv, platformEnv, poolDatabaseId: state.poolDatabaseId, controlPort, controlHost })
  // Der Schlüssel des Control Plane MIT Schreibrecht (die Laufzeit der
  // Betreiber-App) — der eigene der Platform-App darf nur lesen.
  const controlWriteKey = controlEnv.NUXT_APPWRITE_KEY || controlEnv.NUXT_APPWRITE_MIGRATIONS_KEY || ''
  const envFiles = {
    platform: { ...platformEnv, NUXT_PLATFORM_CONTROL_KEY: controlWriteKey },
    control: controlEnv,
    einzel: einzelEnv,
    branding: brandingEnv,
    keine: {},
  }

  const inActions = Boolean(process.env.GITHUB_ACTIONS)
  const runByte = 1 + Math.floor(Math.random() * 254)
  const started = Date.now()

  // Der Soll-Stand der Bühne (s. Kopf): derselbe Schlüssel mit Schreibrecht,
  // den auch die Skripte bekommen.
  const stageControl = appwriteRest({
    endpoint: controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT,
    projectId: controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
    key: controlWriteKey,
    script: 'buehne run',
  })
  const stageCheck = () => checkStageBaseline({ control: stageControl, databaseId: state.controlDatabaseId, state })
  const settle = () => new Promise(done => setTimeout(done, RESOLVER_SETTLE_MS))
  const opening = await stageCheck()
  if (opening.unreadable.length) console.log(`… Soll-Stand der Bühne nicht lesbar (${opening.unreadable.join(', ')}) — die Prüfung je Skript läuft trotzdem.`)
  if (opening.drift.length) {
    console.log(`… Die Bühne stand vor dem ersten Skript nicht im Soll-Stand (${opening.drift.join(', ')}) — zurückgestellt, ${RESOLVER_SETTLE_MS / 1000} s Wartezeit.`)
    if (opening.repaired) await settle()
  }
  /** @type {Array<{ skript: string, ok: boolean, skipped?: boolean, result: string, pass: number, fail: number, seconds: number }>} */
  const results = []

  console.log(`Läufer: ${selected.length} Skript(e) · Platform-Port ${stageEnv.PLATFORM_PORT} · Betreiber-App ${shared.CONTROL_URL} · Kontroll-Host ${controlHost} · Einzel-Instanz ${einzelPort ? `http://localhost:${einzelPort}` : 'keine'} · branding.supply ${brandingPort ? `http://localhost:${brandingPort}` : 'keine'}`)
  for (const [index, entry] of selected.entries()) {
    const missing = missingServices(entry, available)
    if (missing.length) {
      const result = `übersprungen (${missing.map(dienst => SERVICE_NAMES[dienst] ?? dienst).join(', ')} fehlt)`
      results.push({ skript: entry.skript, ok: true, skipped: true, result, pass: 0, fail: 0, seconds: 0 })
      console.log(`↷ ${shortName(entry.skript)}: ${result}`)
      continue
    }
    const [group, pkg] = entry.skript.split('/')
    const cwd = join(root, group, pkg)
    const relative = entry.skript.split('/').slice(2).join('/')
    const source = readFileSync(join(root, entry.skript), 'utf8')
    const args = [
      ...(IMPORTS_TS.test(source) ? ['--experimental-strip-types', '--no-warnings=ExperimentalWarning'] : []),
      '--import', join(root, 'scripts/buehne/client-address.mjs'),
      relative,
    ]
    const env = {
      ...process.env,
      ...envFiles[entry.env ?? 'keine'],
      ...shared,
      BUEHNE_CLIENT_ADDRESS: clientAddress(runByte, index),
      ...(entry.vars ?? {}),
    }
    const timeoutS = timeoutSeconds(entry)
    const title = `${shortName(entry.skript)} (${index + 1}/${selected.length})`
    console.log(inActions ? `::group::${title}` : `\n── ${title} ${'─'.repeat(Math.max(3, 66 - title.length))}`)
    const counting = entry.env === 'branding' && brandingCensus
    const before = counting ? await projectCensus(brandingCensus) : null
    const run = await runOne({ cwd, args, env, timeoutS })
    // Nachzählen (s. Kopf): was nach dem Skript MEHR da ist als vorher.
    const leftovers = before ? censusGrowth(before, (await projectCensus(brandingCensus)) ?? before) : []
    if (counting && !before) console.log('… Nachzählen entfällt: der Schlüssel darf das Schema dieses Projekts nicht lesen.')
    if (leftovers.length) run.lines.push(`✗ Zeilen übrig nach dem Lauf: ${leftovers.join(', ')}`)
    // Soll-Stand der Bühne (s. Kopf): was das Skript verändert hinterlässt.
    const stage = await stageCheck()
    if (stage.unreadable.length) console.log(`… Soll-Stand der Bühne nicht lesbar (${stage.unreadable.join(', ')}).`)
    if (stage.drift.length) {
      const line = `✗ Bühne verändert hinterlassen: ${stage.drift.join(', ')}${stage.repaired ? ` — zurückgestellt, ${RESOLVER_SETTLE_MS / 1000} s Wartezeit` : ''}`
      run.lines.push(line)
      console.log(line)
      if (stage.repaired) await settle()
    }
    if (inActions) console.log('::endgroup::')
    const { pass, fail } = countMarks(run.lines)
    const passed = !run.timedOut && run.code === 0
    const ok = passed && leftovers.length === 0 && stage.drift.length === 0
    const result = run.timedOut
      ? `Zeitgrenze (${timeoutS} s)`
      : !passed ? `fehlgeschlagen (Exit ${run.code ?? '—'})`
          : leftovers.length ? `Zeilen übrig: ${leftovers.join(', ')}`
            : stage.drift.length ? `Bühne verändert: ${stage.drift.join(', ')}` : 'bestanden'
    results.push({ skript: entry.skript, ok, result, pass, fail, seconds: run.seconds })
    if (!ok) {
      // Außerhalb der Gruppe, damit der Fehler ohne Aufklappen zu sehen ist.
      console.log(`${inActions ? '::error::' : '✗ '}${shortName(entry.skript)}: ${result} — die letzten ${Math.min(TAIL_LINES, run.lines.length)} Zeilen:`)
      for (const line of run.lines.slice(-TAIL_LINES)) console.log(`  │ ${line}`)
    }
    else if (!inActions) {
      console.log(`✔ ${shortName(entry.skript)}: bestanden in ${run.seconds} s`)
    }
  }

  const total = Math.round((Date.now() - started) / 1000)
  const failed = results.filter(row => !row.ok).length
  const skipped = results.filter(row => row.skipped).length
  const skippedNote = skipped ? ` · ${skipped} übersprungen` : ''
  const nameWidth = Math.max(6, ...results.map(row => row.skript.length))
  const resultWidth = Math.max(8, ...results.map(row => row.result.length))
  console.log(`\n${'Skript'.padEnd(nameWidth)}  ${'Ergebnis'.padEnd(resultWidth)}  ✔ / ✗     Dauer`)
  for (const row of results) {
    console.log(`${row.skript.padEnd(nameWidth)}  ${row.result.padEnd(resultWidth)}  ${`${row.pass} / ${row.fail}`.padEnd(8)}  ${String(row.seconds).padStart(4)} s`)
  }
  console.log(`\n${failed ? '✗' : '✔'} ${results.length - failed - skipped} von ${results.length - skipped} bestanden${skippedNote} · gesamt ${total} s`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      `### Beweise auf der Bühne (${only.length ? `--only ${only.join(', ')}` : `--lauf ${lauf}`})`,
      '',
      `${results.length - failed - skipped} von ${results.length - skipped} bestanden${skippedNote} · gesamt ${total} s`,
      '',
      '| Skript | Ergebnis | ✔ / ✗ | Dauer |',
      '| --- | --- | --- | --- |',
      ...results.map(row => `| \`${row.skript}\` | ${row.skipped ? '↷' : row.ok ? '✔' : '✗'} ${row.result} | ${row.pass} / ${row.fail} | ${row.seconds} s |`),
      '',
    ].join('\n')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
  }
  return failed ? 1 : 0
}
