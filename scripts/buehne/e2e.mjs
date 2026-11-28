/**
 * Browser-Tests auf der Bühne (OPS-009, BT1 a): E2E-Dateien, die den Pool oder
 * die Betreiber-App brauchen, gegen die stehende Bühne.
 *
 *   pnpm buehne e2e [--control-port 3004] [--platform-port N] [--portfolio-port 3005]
 *
 * WELCHE DATEIEN, steht in `E2E_AUF_DER_BUEHNE` unten:
 *   - `apps/comments/e2e/community-removed.spec.ts` — die entfernte Person der
 *     Community A sieht nur noch die Hinweisseite (Pool, Platform-Server);
 *   - `apps/comments/e2e/narrow-screens-pool.spec.ts` — Handy und Tablet:
 *     eigene Menüpunkte, Unterpunkte und der Feedback-Knopf (Q01, Community B);
 *   - `apps/comments/e2e/dashboard-hydration-pool.spec.ts` — jede Seite der
 *     Dashboard-Seitenleiste, frisch geladen, ohne Abweichung zwischen Server-
 *     und Browser-Fassung (Q15, Community B; die Mitglieder-Verwaltung gibt es
 *     nur im Pool);
 *   - `apps/comments/e2e/list-states-pool.spec.ts` — Mitglieder und
 *     Vertrauensstufen zeigen bei gestörtem Abruf „Fehler" mit funktionierendem
 *     „Noch einmal versuchen" und bei leerer Antwort „leer" (Q14, Community B);
 *   - `apps/control/e2e/smoke.spec.ts` — die eine E2E-Datei der Betreiber-App;
 *   - die sechs E2E-Dateien der Studio-Site (`apps/portfolio/e2e/`, seit
 *     2026-11-28) — nur mit `--portfolio-port` (in der CI nachts der fünfte
 *     Server). Ohne den Port sagt eine Zeile, dass sie nicht liefen; die
 *     übrigen Dateien brauchen ihn nicht.
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
 * DER SOLL-STAND DER BÜHNE (`baseline.mjs`, seit 2026-11-21): die Dateien
 * verlassen sich auf das, was `pnpm buehne up` zusagt — die Schmale-Fenster-
 * Datei etwa auf Plan `pro` in Community B, sonst fehlen im Menü alle
 * Produkte ab `personal`. Vor dem ersten Test liest dieser Befehl deshalb
 * beide Communities; weicht etwas ab (ein Beweis-Skript davor hat es so
 * hinterlassen), stellt er es zurück, sagt es in einer Zeile und wartet, bis
 * der Platform-Server den Stand neu gelesen hat. Rot wird davon hier nichts:
 * den Verursacher nennt der Läufer (`pnpm buehne run`), der nach jedem Skript
 * dasselbe prüft. Fehlt die Env-Datei der Betreiber-App, entfällt die Prüfung
 * mit einer Zeile.
 *
 * GEHEIMNISSE: der Pool-Schlüssel geht nur über die Umgebung an Playwright;
 * ausgegeben werden nur Namen von Variablen.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { appwriteRest, readEnvFile } from '../lib/probe-stage.mjs'
import { assertTarget } from '../lib/target.mjs'
import { checkStageBaseline, RESOLVER_SETTLE_MS } from './baseline.mjs'

/**
 * @typedef {{ app: 'comments' | 'control' | 'portfolio', datei: string, server: 'platform' | 'control' | 'portfolio' }} E2eDatei
 */

/** @type {E2eDatei[]} */
export const E2E_AUF_DER_BUEHNE = [
  { app: 'comments', datei: 'e2e/community-removed.spec.ts', server: 'platform' },
  { app: 'comments', datei: 'e2e/narrow-screens-pool.spec.ts', server: 'platform' },
  { app: 'comments', datei: 'e2e/dashboard-hydration-pool.spec.ts', server: 'platform' },
  { app: 'comments', datei: 'e2e/list-states-pool.spec.ts', server: 'platform' },
  { app: 'control', datei: 'e2e/smoke.spec.ts', server: 'control' },
  // Die Studio-Site (BT1 a): öffentliche Seiten ohne Anmeldung, ihr eigenes Projekt.
  { app: 'portfolio', datei: 'e2e/smoke.spec.ts', server: 'portfolio' },
  { app: 'portfolio', datei: 'e2e/pages.spec.ts', server: 'portfolio' },
  { app: 'portfolio', datei: 'e2e/wizard.spec.ts', server: 'portfolio' },
  { app: 'portfolio', datei: 'e2e/redirects.spec.ts', server: 'portfolio' },
  { app: 'portfolio', datei: 'e2e/seo-routes.spec.ts', server: 'portfolio' },
  { app: 'portfolio', datei: 'e2e/realtime-guest.spec.ts', server: 'portfolio' },
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
 *   portfolioPort?: number | string | null,
 *   clientAddress?: string,
 * }} input
 * @returns {{ comments: Record<string, string>, control: Record<string, string>, portfolio?: Record<string, string> }}
 */
export function e2eEnv({ state, platformEnv, platformPort, controlPort, portfolioPort, clientAddress }) {
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
  const b = state.communities?.b
  const ownerB = b?.accounts?.owner?.userId
  if (!b?.host || !ownerB) throw new Error('Der Stand der Bühne hat keine Community B mit einem Owner.')
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
      // Schmale Fenster (Q01): der Owner der Community B setzt eigene
      // Menüpunkte über die echte Route und stellt sie danach zurück.
      PW_POOL_URL_B: `http://${b.host}:${platformPort ?? state.platformPort}`,
      PW_POOL_OWNER_B_USER_ID: ownerB,
      // Eine eigene Aufrufer-Adresse je Lauf: die Kontakt-Route bremst je
      // Adresse (5 je Stunde) — ohne sie war der sechste Lauf rot.
      ...(clientAddress ? { PW_CLIENT_ADDRESS: clientAddress } : {}),
    },
    control: {
      PW_EXTERNAL_SERVER: '1',
      PW_BASE_URL: `http://localhost:${controlPort}`,
    },
    // Ohne Port steht die Studio-Site nicht — ihre Dateien laufen dann nicht.
    ...(portfolioPort
      ? { portfolio: { PW_EXTERNAL_SERVER: '1', PW_BASE_URL: `http://localhost:${portfolioPort}` } }
      : {}),
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
  const portfolioPort = opts['portfolio-port'] ? Number(opts['portfolio-port']) : null
  /** @type {Record<string, Record<string, string>>} */
  let envs
  try {
    envs = e2eEnv({ state, platformEnv, platformPort, controlPort, portfolioPort, clientAddress: randomClientAddress() })
  }
  catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }

  // Die Server müssen stehen — sonst misst Playwright nur „nicht erreichbar".
  const health = {
    'Platform-Server': `http://localhost:${platformPort}/api/health`,
    'Betreiber-App': `http://localhost:${controlPort}/api/health`,
    ...(portfolioPort ? { 'Studio-Site': `http://localhost:${portfolioPort}/api/health` } : {}),
  }
  for (const [name, url] of Object.entries(health)) {
    if (!(await answers(url))) {
      console.error(`✗ ${name} antwortet nicht (${url}).`)
      return 1
    }
  }
  const files = E2E_AUF_DER_BUEHNE.filter(entry => entry.server !== 'portfolio' || portfolioPort)
  const notRun = E2E_AUF_DER_BUEHNE.length - files.length
  if (notRun) console.log(`… ${notRun} Datei(en) der Studio-Site laufen nicht: ohne \`--portfolio-port\` steht ihr Server nicht.`)

  // Der Soll-Stand der Bühne (s. Kopf): zurückstellen, bevor ein Test misst.
  const controlPath = resolve(root, String(opts['env-control'] ?? 'apps/control/.env'))
  if (!existsSync(controlPath) || !state.controlDatabaseId) {
    console.log('… Soll-Stand der Bühne nicht geprüft: die Env-Datei der Betreiber-App fehlt.')
  }
  else {
    const controlEnv = readEnvFile(controlPath)
    const stage = await checkStageBaseline({
      control: appwriteRest({
        endpoint: controlEnv.NUXT_PUBLIC_APPWRITE_ENDPOINT,
        projectId: controlEnv.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
        key: controlEnv.NUXT_APPWRITE_KEY || controlEnv.NUXT_APPWRITE_MIGRATIONS_KEY || '',
        script: 'buehne e2e',
      }),
      databaseId: state.controlDatabaseId,
      state,
    })
    if (stage.unreadable.length) console.log(`… Soll-Stand der Bühne nicht lesbar (${stage.unreadable.join(', ')}).`)
    if (stage.drift.length) {
      console.log(`… Die Bühne stand nicht im Soll-Stand (${stage.drift.join(', ')})${stage.repaired ? ` — zurückgestellt, ${RESOLVER_SETTLE_MS / 1000} s Wartezeit` : ''}. Den Verursacher nennt \`pnpm buehne run\`.`)
      if (stage.repaired) await new Promise(done => setTimeout(done, RESOLVER_SETTLE_MS))
    }
  }

  const inActions = Boolean(process.env.GITHUB_ACTIONS)
  const scratch = mkdtempSync(join(tmpdir(), 'buehne-e2e-'))
  /** @type {Array<{ datei: string, ok: boolean, result: string, counts: string, seconds: number, problems: string[] }>} */
  const results = []
  try {
    for (const [index, entry] of files.entries()) {
      const path = `apps/${entry.app}/${entry.datei}`
      const reportFile = join(scratch, `${entry.app}.json`)
      const env = { ...process.env, ...envs[entry.app], PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile }
      const title = `${path} (${index + 1}/${files.length})`
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
