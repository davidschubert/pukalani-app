/**
 * Browser-Tests auf der Bühne (OPS-009, BT1 a): zwei E2E-Dateien, die vorher
 * nur von Hand liefen, gegen die stehende Bühne.
 *
 *   pnpm buehne e2e [--control-port 3004] [--platform-port N]
 *
 * WELCHE DATEIEN, steht in `E2E_AUF_DER_BUEHNE` unten:
 *   - `apps/comments/e2e/community-removed.spec.ts` — die entfernte Person der
 *     Community A sieht nur noch die Hinweisseite (Pool, Platform-Server);
 *   - `apps/control/e2e/smoke.spec.ts` — die eine E2E-Datei der Betreiber-App.
 *
 * Die Variablen kommen aus dem Stand der Bühne (`.buehne/state.json`) und der
 * Env-Datei der Platform-App — dieselbe Herleitung lokal und in der CI. Die
 * Server laufen schon (die Bühne braucht sie); Playwright startet KEINEN
 * eigenen (`PW_EXTERNAL_SERVER=1`, beide `playwright.config.ts` lesen das).
 *
 * STRENG: rot ist, was fehlschlägt, was erst im zweiten Versuch grün wird
 * (`--retries=0`, „flaky" zählt als rot), und was ÜBERSPRUNGEN wird — ein
 * Test, dem eine Variable fehlt, überspringt sich selbst, und ein Schritt, der
 * so leer läuft, sähe sonst grün aus. Die übersprungenen Tests stehen beim
 * Namen in der Ausgabe (Reporter `list` und die eigene Liste am Ende).
 *
 * GEHEIMNISSE: der Pool-Schlüssel geht nur über die Umgebung an Playwright;
 * ausgegeben werden nur Namen von Variablen.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readEnvFile } from '../lib/probe-stage.mjs'
import { assertTarget } from '../lib/target.mjs'

/**
 * @typedef {{ app: 'comments' | 'control', datei: string, server: 'platform' | 'control' }} E2eDatei
 */

/** @type {E2eDatei[]} */
export const E2E_AUF_DER_BUEHNE = [
  { app: 'comments', datei: 'e2e/community-removed.spec.ts', server: 'platform' },
  { app: 'control', datei: 'e2e/smoke.spec.ts', server: 'control' },
]

/** Zeitgrenze je Datei — Playwrights eigene Grenzen greifen vorher; das hier fängt einen hängenden Prozess. */
const GUARD_S = 900

/**
 * Die Umgebung je Datei aus dem Stand der Bühne. Rein, für den Selbsttest.
 *
 * @param {{
 *   state: { platformPort: number | string, poolProject?: string, communities: Record<string, { host: string, accounts: Record<string, { userId: string }> }> },
 *   platformEnv: Record<string, string>,
 *   platformPort?: number | string,
 *   controlPort: number | string,
 *   clientAddress?: string,
 * }} input
 * @returns {Record<E2eDatei['app'], Record<string, string>>}
 */
export function e2eEnv({ state, platformEnv, platformPort, controlPort, clientAddress }) {
  const a = state.communities?.a
  const removed = a?.accounts?.removed?.userId
  if (!a?.host || !removed) throw new Error('Der Stand der Bühne hat keine Community A mit dem entfernten Konto.')
  const endpoint = platformEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const project = platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const key = platformEnv.NUXT_APPWRITE_KEY
  if (!endpoint || !project || !key) throw new Error('Die Env-Datei der Platform-App nennt Endpunkt, Projekt oder Schlüssel nicht.')
  if (state.poolProject && state.poolProject !== project) {
    throw new Error(`Die Bühne steht im Pool-Projekt „${state.poolProject}", die Env-Datei zeigt auf „${project}".`)
  }
  const poolUrl = `http://${a.host}:${platformPort ?? state.platformPort}`
  return {
    comments: {
      PW_EXTERNAL_SERVER: '1',
      PW_BASE_URL: poolUrl,
      PW_POOL_URL: poolUrl,
      PW_POOL_ENDPOINT: endpoint,
      PW_POOL_PROJECT: project,
      PW_POOL_KEY: key,
      PW_POOL_REMOVED_USER_ID: removed,
      // Eine eigene Aufrufer-Adresse je Lauf: die Kontakt-Route bremst je
      // Adresse (5 je Stunde) — ohne sie war der sechste Lauf rot.
      ...(clientAddress ? { PW_CLIENT_ADDRESS: clientAddress } : {}),
    },
    control: {
      PW_EXTERNAL_SERVER: '1',
      PW_BASE_URL: `http://localhost:${controlPort}`,
    },
  }
}

/**
 * Liest den JSON-Bericht von Playwright: was lief, was fehlte. Rein, für den Selbsttest.
 *
 * @param {any} report Inhalt der JSON-Ausgabe (`--reporter=json`)
 * @returns {{ passed: string[], skipped: string[], failed: string[], flaky: string[], problems: string[] }}
 */
export function summarizeReport(report) {
  /** @type {{ passed: string[], skipped: string[], failed: string[], flaky: string[] }} */
  const out = { passed: [], skipped: [], failed: [], flaky: [] }
  const walk = (suite, trail) => {
    const here = suite.title && !suite.title.endsWith('.ts') ? [...trail, suite.title] : trail
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const title = [...here, spec.title].join(' › ')
        if (test.status === 'expected') out.passed.push(title)
        else if (test.status === 'skipped') out.skipped.push(title)
        else if (test.status === 'flaky') out.flaky.push(title)
        else out.failed.push(title)
      }
    }
    for (const child of suite.suites ?? []) walk(child, here)
  }
  for (const suite of report?.suites ?? []) walk(suite, [])

  const problems = []
  for (const error of report?.errors ?? []) problems.push(`Fehler außerhalb der Tests: ${String(error?.message ?? error).split('\n')[0]}`)
  const total = out.passed.length + out.skipped.length + out.failed.length + out.flaky.length
  if (total === 0) problems.push('kein einziger Test gelaufen')
  for (const title of out.failed) problems.push(`fehlgeschlagen: ${title}`)
  for (const title of out.flaky) problems.push(`erst im zweiten Versuch grün: ${title}`)
  for (const title of out.skipped) problems.push(`übersprungen: ${title}`)
  return { ...out, problems }
}

/**
 * Eine private Adresse je Lauf (`10.28.x.y`) — ein anderer Bereich als die
 * der Beweis-Skripte (`10.27.x.y`, run.mjs), damit sich nichts überschneidet.
 */
function randomClientAddress() {
  const byte = () => 1 + Math.floor(Math.random() * 254)
  return `10.28.${byte()}.${byte()}`
}

/** Antwortet ein Server auf `/api/health`? */
async function answers(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    return res.status < 500
  }
  catch {
    return false
  }
}

/** Playwright für eine Datei; die Ausgabe geht live durch. */
function runPlaywright({ cwd, file, env }) {
  return new Promise((resolvePromise) => {
    const started = Date.now()
    const reporters = ['list', 'json', ...(process.env.GITHUB_ACTIONS ? ['github'] : [])].join(',')
    const child = spawn('pnpm', ['exec', 'playwright', 'test', file, `--reporter=${reporters}`, '--retries=0', '--forbid-only'], {
      cwd, env, stdio: ['ignore', 'inherit', 'inherit'],
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000).unref()
    }, GUARD_S * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, timedOut, seconds: Math.round((Date.now() - started) / 1000) })
    })
  })
}

/**
 * @param {{ root: string, opts: Record<string, string | string[] | boolean | undefined>, state: any }} input
 * @returns {Promise<number>} Exit-Code
 */
export async function e2eCommand({ root, opts, state }) {
  if (!state?.complete) {
    console.error('✗ Keine vollständige Bühne laut Stand-Datei — erst `pnpm buehne up`.')
    return 1
  }
  const platformPath = resolve(root, String(opts['env-platform']))
  if (!existsSync(platformPath)) {
    console.error(`✗ Env-Datei fehlt: ${platformPath.replace(`${root}/`, '')}`)
    return 1
  }
  const platformEnv = readEnvFile(platformPath)
  // Der Pool-Schlüssel geht an Playwright — vorher das Ziel prüfen (OPS-002).
  assertTarget({ script: 'buehne e2e', endpoint: platformEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT, projectId: platformEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID })

  const controlPort = Number(opts['control-port'] ?? 3004)
  const platformPort = Number(opts['platform-port'] ?? state.platformPort)
  /** @type {Record<string, Record<string, string>>} */
  let envs
  try {
    envs = e2eEnv({ state, platformEnv, platformPort, controlPort, clientAddress: randomClientAddress() })
  }
  catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  // Beide Server müssen stehen — sonst misst Playwright nur „nicht erreichbar".
  const health = { platform: `http://localhost:${platformPort}/api/health`, control: `http://localhost:${controlPort}/api/health` }
  for (const [name, url] of Object.entries(health)) {
    if (!(await answers(url))) {
      console.error(`✗ ${name === 'platform' ? 'Platform-Server' : 'Betreiber-App'} antwortet nicht (${url}).`)
      return 1
    }
  }

  const inActions = Boolean(process.env.GITHUB_ACTIONS)
  const scratch = mkdtempSync(join(tmpdir(), 'buehne-e2e-'))
  /** @type {Array<{ datei: string, ok: boolean, result: string, counts: string, seconds: number, problems: string[] }>} */
  const results = []
  try {
    for (const [index, entry] of E2E_AUF_DER_BUEHNE.entries()) {
      const path = `apps/${entry.app}/${entry.datei}`
      const reportFile = join(scratch, `${entry.app}.json`)
      const env = { ...process.env, ...envs[entry.app], PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile }
      const title = `${path} (${index + 1}/${E2E_AUF_DER_BUEHNE.length})`
      console.log(inActions ? `::group::${title}` : `\n── ${title} ${'─'.repeat(Math.max(3, 66 - title.length))}`)
      console.log(`  Variablen: ${Object.keys(envs[entry.app]).join(', ')}`)
      const run = await runPlaywright({ cwd: join(root, 'apps', entry.app), file: entry.datei, env })
      if (inActions) console.log('::endgroup::')

      /** @type {ReturnType<typeof summarizeReport>} */
      let summary
      try {
        summary = summarizeReport(JSON.parse(readFileSync(reportFile, 'utf8')))
      }
      catch {
        summary = { passed: [], skipped: [], failed: [], flaky: [], problems: ['kein Bericht von Playwright'] }
      }
      const problems = [...summary.problems]
      if (run.timedOut) problems.unshift(`Zeitgrenze (${GUARD_S} s)`)
      else if (run.code !== 0) problems.unshift(`Playwright endete mit Exit ${run.code ?? '—'}`)
      const ok = problems.length === 0
      const counts = `${summary.passed.length} / ${summary.failed.length + summary.flaky.length} / ${summary.skipped.length}`
      results.push({ datei: path, ok, result: ok ? 'bestanden' : 'rot', counts, seconds: run.seconds, problems })
      if (!ok) {
        console.log(`${inActions ? '::error::' : '✗ '}${path}: ${problems.length} Problem(e)`)
        for (const problem of problems) console.log(`  │ ${problem}`)
      }
      else console.log(`✔ ${path}: ${summary.passed.length} bestanden in ${run.seconds} s`)
    }
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  const failed = results.filter(row => !row.ok).length
  const width = Math.max(5, ...results.map(row => row.datei.length))
  console.log(`\n${'Datei'.padEnd(width)}  Ergebnis   ✔ / ✗ / ↷    Dauer`)
  for (const row of results) console.log(`${row.datei.padEnd(width)}  ${row.result.padEnd(9)}  ${row.counts.padEnd(11)}  ${String(row.seconds).padStart(4)} s`)
  console.log(`\n${failed ? '✗' : '✔'} ${results.length - failed} von ${results.length} Dateien bestanden (übersprungen zählt als rot)`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '### Browser-Tests auf der Bühne',
      '',
      `${results.length - failed} von ${results.length} Dateien bestanden — übersprungen zählt als rot.`,
      '',
      '| Datei | Ergebnis | ✔ / ✗ / ↷ | Dauer |',
      '| --- | --- | --- | --- |',
      ...results.map(row => `| \`${row.datei}\` | ${row.ok ? '✔' : '✗'} ${row.ok ? row.result : row.problems.join('; ')} | ${row.counts} | ${row.seconds} s |`),
      '',
    ].join('\n')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
  }
  return failed ? 1 : 0
}
