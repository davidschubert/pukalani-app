#!/usr/bin/env node
/**
 * Täglicher Blick „Läuft auf dem App-Server das Node aus `.nvmrc`?"
 * (2026-11-19).
 *
 * WARUM ES IHN GIBT: `.nvmrc` nennt seit dem 2026-11-18 EINE exakte
 * Node-Version für den eigenen Rechner, die CI und den App-Server (Davids
 * Entscheidung „alle auf dieselbe", docs/DECISION-LOG.md). Lokal und in der CI
 * liest jedes Werkzeug die Datei selbst. Auf dem Server kommt Node aus dem
 * Paket `nodejs` und wird nicht von selbst gehoben — das Repo prüfte und baute
 * wochenlang mit Linie 22, während der Server auf 24 lief, und es fiel nur
 * beim Nachsehen auf. Gebaut wird in der CI, betrieben auf dem Server: nur mit
 * derselben Version beweisen die Prüfungen das, was live läuft.
 *
 * WIE: das Wächter-Tor auf app-prod (ops/app-watch-gate.sh, von Hand
 * eingespielt) kennt das Wort `node-version` und antwortet in fester Form —
 *   program <version>          das Programm, mit dem pm2 startet (/usr/bin/node)
 *   proc <prozess> <version>   je pm2-Prozess einer Site aus der App-Liste
 *   proc <prozess> fehlt       eine Site der Liste ohne pm2-Prozess
 *   fremd <n>                  pm2-Prozesse, die die Liste nicht kennt
 *   pm2 unlesbar               pm2 hat nicht (lesbar) geantwortet
 * (statt einer Version auch `fehlt` oder `unlesbar`). Verglichen wird hier mit
 * dem Inhalt von `.nvmrc`.
 *
 * ROT (mit `--strict`): das Programm oder ein Prozess nennt eine ANDERE
 * Version als `.nvmrc`, oder `.nvmrc` nennt keine exakte Version. Je Befund
 * ein Satz, was zu tun ist (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).
 * KEINE AUSSAGE, KEIN ROT (Exit 2): der Server ist nicht erreichbar, oder sein
 * Tor kennt `node-version` noch nicht (Exit 64 — so antwortet app-prod, bis
 * das Tor aus dem Repo von Hand eingespielt ist). Ein Prozess, der fehlt oder
 * dessen Version nicht lesbar ist, ist eine Warnzeile: ob eine App läuft,
 * melden der Health-Blick und der Blick in die App.
 *
 *   node scripts/ops/verify-node-version.mjs [--strict]
 *   PUKALANI_OPS_SSH       App-Server (Vorgabe wie die anderen Wächter)
 *   PUKALANI_NODE_DRILL=1  Probealarm: tut so, als liefe der Prozess der
 *                          ersten App mit einer anderen Version
 *   PUKALANI_FINDINGS_FILE je rotem Befund eine Zeile (für das Issue)
 *
 * Das Protokoll ist öffentlich: hinaus gehen nur Versionsnummern, Zahlen und
 * Prozess-Namen, die sich aus ops/apps.conf ergeben.
 *
 * Exit: 0 grün (oder rot ohne --strict) · 1 rot mit --strict · 2 keine Aussage
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_SERVER, GATE_REJECTED, gateSshArgs } from './app-watch-gate.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RETRY_DELAY_MS = 15_000
const RUNBOOK = 'docs/runbooks/DEPLOYMENT.md, Abschnitt A4'
const GATE_RUNBOOK = 'docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, „Das Wächter-Tor"'
const SERVER = 'app-prod'

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/
const STATE = '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|fehlt|unlesbar)'
const PROGRAM_LINE = new RegExp(`^program ${STATE}$`)
const PROC_LINE = new RegExp(`^proc ([a-z0-9][a-z0-9-]{0,80}) ${STATE}$`)
const FOREIGN_LINE = /^fremd (\d{1,4})$/

/** Die exakte Version aus `.nvmrc` (pure): `24.22.3` oder `v24.22.3`, sonst `null` — eine Linie (`24`, `lts/*`) ist keine. */
export function readNvmrc(text) {
  const value = String(text ?? '').trim().replace(/^v/, '')
  return VERSION.test(value) ? value : null
}

/** Prozess-Namen aus `ops/apps.conf` (pure): Site ohne Punkte, in der Reihenfolge der Liste. */
export function processNames(appsConf) {
  const names = []
  for (const raw of String(appsConf ?? '').split('\n')) {
    const hit = /^([a-z0-9-]+)\s+([a-z0-9][a-z0-9.-]*)$/.exec(raw.replace(/#.*/, '').trim())
    if (hit) names.push(hit[2].replaceAll('.', ''))
  }
  return names
}

/**
 * Die Zeilen des Tors (pure). Zeilen in anderer Form fallen weg — nichts, was
 * das Tor nicht in fester Form schickt, kommt ins Protokoll.
 */
export function parseNodeVersions(text) {
  const parsed = { program: null, procs: [], foreign: null, pm2Unreadable: false }
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    let hit
    if ((hit = PROGRAM_LINE.exec(line))) parsed.program = hit[1]
    else if ((hit = PROC_LINE.exec(line))) parsed.procs.push({ name: hit[1], version: hit[2] })
    else if ((hit = FOREIGN_LINE.exec(line))) parsed.foreign = Number(hit[1])
    else if (line === 'pm2 unlesbar') parsed.pm2Unreadable = true
  }
  return parsed
}

/**
 * Was der Server geantwortet hat (pure): `{ state: 'ok', ...Zeilen }`,
 * `{ state: 'unknown-word' }` (Exit 64) oder `{ state: 'unreachable', detail }`.
 */
export function answerFrom({ status, stdout }) {
  if (status === GATE_REJECTED) return { state: 'unknown-word' }
  if (status !== 0) return { state: 'unreachable', detail: status === null ? 'keine Antwort' : `Exit ${status}` }
  const parsed = parseNodeVersions(stdout)
  if (parsed.program === null && !parsed.procs.length && !parsed.pm2Unreadable) {
    return { state: 'unreachable', detail: 'Antwort ohne lesbare Zeile' }
  }
  return { state: 'ok', ...parsed }
}

/**
 * Probealarm (pure): der Prozess der ersten App nennt eine Version, die es
 * nicht gibt — auch wenn der Server gerade nicht antwortet oder sein Tor das
 * Wort noch nicht kennt (geprüft wird die Kette, nicht der Server).
 */
export function drillAnswer(answer, names) {
  const base = answer.state === 'ok' ? answer : { state: 'ok', program: null, procs: [], foreign: null, pm2Unreadable: false }
  const first = names[0] ?? 'probealarm'
  return { ...base, procs: [{ name: first, version: '0.0.0' }, ...base.procs.filter(p => p.name !== first)] }
}

/**
 * DER VERGLEICH (pure). `expected`: die Version aus `.nvmrc` (oder `null`),
 * `answer`: aus `answerFrom`, `names`: die Prozess-Namen aus ops/apps.conf.
 * Ergebnis: `lines` fürs Protokoll, `red` (je Befund ein Satz), `notChecked`
 * (Warnzeilen, kein Befund) und `checked` (so viele Versionen wurden wirklich
 * verglichen — 0 heißt „keine Aussage").
 */
export function compareNodeVersions({ expected, answer, names = [] }) {
  const lines = []
  const red = []
  const notChecked = []
  let checked = 0
  if (!expected) {
    red.push('.nvmrc nennt keine exakte Node-Version (erwartet drei Zahlen wie 24.22.3) — ohne sie gibt es nichts zu vergleichen. Die Datei berichtigen (docs/runbooks/DEPLOYMENT.md, Abschnitt A4).')
    return { lines, red, notChecked, checked }
  }
  if (answer.state === 'unknown-word') {
    notChecked.push(`${SERVER}: das Tor kennt das Wort „node-version“ noch nicht — NICHT GEPRÜFT. ops/app-watch-gate.sh aus dem Repo von Hand einspielen (${GATE_RUNBOOK}).`)
    return { lines, red, notChecked, checked }
  }
  if (answer.state !== 'ok') {
    notChecked.push(`${SERVER}: nicht erreichbar (${answer.detail}) — NICHT GEPRÜFT, keine Aussage über die Node-Version dort.`)
    return { lines, red, notChecked, checked }
  }

  const label = 'das Programm /usr/bin/node'
  if (answer.program === null || answer.program === 'fehlt' || answer.program === 'unlesbar') {
    notChecked.push(`${SERVER}: ${label} nennt keine lesbare Version (${answer.program ?? 'keine Zeile'}) — NICHT GEPRÜFT. Auf dem Server nachsehen, mit welchem Programm pm2 startet (${RUNBOOK}).`)
  }
  else if (answer.program !== expected) {
    checked += 1
    red.push(`${SERVER}: ${label} nennt ${answer.program}, .nvmrc verlangt ${expected} — das Paket nodejs auf dem Server auf ${expected} heben und pm2 neu starten, oder .nvmrc per Pull Request angleichen (${RUNBOOK}).`)
    lines.push(`✗ ${'Programm'.padEnd(28)} ${answer.program} statt ${expected}`)
  }
  else {
    checked += 1
    lines.push(`✔ ${'Programm'.padEnd(28)} ${answer.program}`)
  }

  if (answer.pm2Unreadable) {
    notChecked.push(`${SERVER}: pm2 hat nicht lesbar geantwortet — die Prozesse sind NICHT GEPRÜFT.`)
  }
  for (const proc of answer.procs) {
    if (proc.version === 'fehlt') {
      notChecked.push(`${SERVER}: die Site der Liste hat keinen pm2-Prozess ${proc.name} — NICHT GEPRÜFT (ob die App läuft, meldet der Health-Blick).`)
    }
    else if (proc.version === 'unlesbar') {
      notChecked.push(`${SERVER}: der Prozess ${proc.name} nennt keine lesbare Node-Version — NICHT GEPRÜFT.`)
    }
    else if (proc.version !== expected) {
      checked += 1
      red.push(`${SERVER}: der Prozess ${proc.name} läuft mit Node ${proc.version}, .nvmrc verlangt ${expected} — das Paket nodejs auf ${expected} heben und den pm2-Dienst neu starten (pm2 update; ein pm2 reload reicht nicht), oder .nvmrc per Pull Request angleichen (${RUNBOOK}).`)
      lines.push(`✗ ${proc.name.padEnd(28)} ${proc.version} statt ${expected}`)
    }
    else {
      checked += 1
      lines.push(`✔ ${proc.name.padEnd(28)} ${proc.version}`)
    }
  }
  // Eine App der Repo-Liste, die der Server gar nicht nennt (seine Liste ist
  // älter; das meldet der Blick „Liegen auf den Servern die Dateien aus dem Repo?").
  if (!answer.pm2Unreadable) {
    const reported = new Set(answer.procs.map(p => p.name))
    for (const name of names) {
      if (!reported.has(name)) notChecked.push(`${SERVER}: das Tor nennt den Prozess ${name} nicht — NICHT GEPRÜFT (die App-Liste auf dem Server kennt die Site nicht).`)
    }
  }
  if (answer.foreign) lines.push(`· ${answer.foreign} weitere pm2-Prozesse, die ops/apps.conf nicht kennt (nicht verglichen)`)
  return { lines, red, notChecked, checked }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function run(args) {
  const result = spawnSync('ssh', args, { encoding: 'utf8', timeout: 60_000 })
  return { status: result.error ? null : result.status, stdout: result.stdout ?? '' }
}

/** Eine Antwort holen; ein Aussetzer bekommt nach kurzer Pause genau einen zweiten Versuch. */
async function ask(args) {
  let answer = answerFrom(run(args))
  if (answer.state === 'unreachable') {
    await sleep(RETRY_DELAY_MS)
    answer = answerFrom(run(args))
  }
  return answer
}

async function main() {
  const strict = process.argv.includes('--strict')
  const drill = process.env.PUKALANI_NODE_DRILL === '1'
  const findingsFile = process.env.PUKALANI_FINDINGS_FILE

  const expected = readNvmrc(readFileSync(join(REPO, '.nvmrc'), 'utf8'))
  const names = processNames(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))
  // Ohne lesbare `.nvmrc` wird der Server gar nicht erst gefragt.
  let answer = expected ? await ask(gateSshArgs(APP_SERVER, 'node-version')) : { state: 'unreachable', detail: 'nicht gefragt' }
  if (drill) answer = drillAnswer(answer, names)

  console.log(`Läuft auf dem App-Server das Node aus .nvmrc? — verlangt ist ${expected ?? '(keine exakte Version)'}${drill ? '  [PROBEALARM]' : ''}\n`)
  const result = compareNodeVersions({ expected, answer, names })
  const red = result.red.map(line => (drill ? `PROBEALARM — ${line}` : line))
  for (const line of result.lines) console.log(line)
  for (const line of result.notChecked) {
    console.log(process.env.GITHUB_ACTIONS ? `::warning::${line}` : `⚠ ${line}`)
  }
  if (red.length) {
    console.log('')
    for (const line of red) {
      console.log(process.env.GITHUB_ACTIONS ? `::error::${line}` : `✗ ${line}`)
      if (findingsFile) appendFileSync(findingsFile, `${line}\n`)
    }
    if (strict) process.exit(1)
    return
  }
  if (!result.checked) {
    console.log('\nKeine Aussage: es konnte keine Version verglichen werden.')
    process.exit(2)
  }
  console.log(result.notChecked.length ? '\nKein Befund in dem, was geprüft werden konnte.' : `\n✔ Programm und alle Prozesse laufen mit ${expected}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
