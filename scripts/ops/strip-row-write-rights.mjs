#!/usr/bin/env node
/**
 * AUFRÄUM-LAUF: Schreibrechte von Konten an vorhandenen ZEILEN nehmen
 * (SEC-002, GA1 P13 — Schritt 3 je Etappe).
 *
 * Bis zum Umbau bekam jede Zeile `update`/`delete` für ihr Konto. Seit der
 * Server schreibt, vergibt er sie nicht mehr; dieser Lauf nimmt sie vom
 * Bestand. LESERECHTE BLEIBEN UNBERÜHRT (Realtime hängt daran), die Daten der
 * Zeile ebenfalls.
 *
 *   node --experimental-strip-types --env-file=apps/platform/.env \
 *     scripts/ops/strip-row-write-rights.mjs --table comments              # NUR ZÄHLEN
 *   … --table community_posts,comments --apply                             # schreiben
 *   pnpm ops:strip-row-write-rights -- --table comments                    (Umgebung vorher laden)
 *
 * REIHENFOLGE: erst der Code der Etappe auf allen Seiten live, dann die
 * Rechte-Migration der Tabelle, DANN dieser Lauf. Er nimmt nur Tabellen an,
 * die in `scripts/lib/server-written-tables.mjs` stehen — für jede andere
 * schriebe das Programm noch mit der Sitzung des Kontos und bräuchte die
 * Rechte.
 *
 * ERST ZÄHLEN, DANN SCHREIBEN: ohne `--apply` ändert der Lauf nichts und nennt
 * nur Zahlen. Mit `--apply` arbeitet er in Stapeln, ist wiederholbar (eine
 * Zeile ohne Schreibrecht wird nicht angefasst) und zählt am Ende nach.
 *
 * LAUF-SPERRE (dieselbe wie GA1 P18, `packages/core/shared/runLease.ts`): vor
 * dem Schreiben legt der Lauf in `system_runs` (system-040) eine Zeile mit
 * fester Id aus (Art, Tabelle, laufende Nummer) an. Ein zweiter Lauf zur
 * selben Zeit bekommt 409 und bricht ab. Bleibt der Herzschlag 120 s aus
 * (Abbruch), gilt der Lauf als beendet und der nächste darf starten.
 *
 * PROTOKOLL NUR AUS ZAHLEN: keine Inhalte, keine Konto-Ids, keine Zeilen-Ids.
 *
 * NEBENWIRKUNG: jede geänderte Zeile löst ein Realtime-Ereignis „geändert"
 * aus und bekommt ein neues `$updatedAt`. Inhalte ändern sich nicht.
 *
 * UMGEBUNG: `NUXT_PUBLIC_APPWRITE_ENDPOINT`, `…_PROJECT_ID`, `…_DATABASE_ID`,
 * Schlüssel `NUXT_APPWRITE_MIGRATIONS_KEY`, sonst `NUXT_APPWRITE_KEY`
 * (rows.read, rows.write). DER SCHLÜSSEL WIRD NIE AUSGEGEBEN. Gegen einen
 * entfernten Endpunkt verlangt die Ziel-Prüfung `PUKALANI_TARGET_CONFIRM=<Projekt>`.
 *
 * Exit: 0 = fertig (bzw. gezählt), 1 = Zeilen ließen sich nicht ändern oder
 * tragen danach noch ein Schreibrecht, 2 = Aufruf-, Verbindungs- oder
 * Sperr-Fehler (auch: ein anderer Lauf ist aktiv).
 */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { assertTarget } from '../lib/target.mjs'
import { SERVER_WRITTEN_TABLES } from '../lib/server-written-tables.mjs'
import { RUN_LEASE_STALL_MS, clampRunLeaseDetail, runLeaseStartable, runLeaseState } from '../../packages/core/shared/runLease.ts'

const WRITE_RIGHT = /^(update|delete|write|create)\(/
const RUNS_TABLE = 'system_runs'
const SCOPE = 'strip-row-rights'

/** PUR (getestet): die Rechte einer Zeile ohne Schreibrechte; Leserechte in ihrer Reihenfolge. */
export function withoutRowWriteRights(permissions) {
  return (Array.isArray(permissions) ? permissions : []).filter(permission => !WRITE_RIGHT.test(permission))
}

/** PUR (getestet): trägt die Zeile ein Schreibrecht? */
export function hasRowWriteRight(permissions) {
  return (Array.isArray(permissions) ? permissions : []).some(permission => WRITE_RIGHT.test(permission))
}

/** PUR (getestet): dieselben Rechte, unabhängig von der Reihenfolge. */
export function samePermissions(a, b) {
  const left = [...(Array.isArray(a) ? a : [])].sort()
  const right = [...(Array.isArray(b) ? b : [])].sort()
  return left.length === right.length && left.every((permission, index) => permission === right[index])
}

/** PUR (getestet): dieselbe Id-Formel wie `runLeaseRowId` im Server. */
export function leaseRowId(scope, subject, seq) {
  return `r${createHash('sha256').update(`${scope}|${subject}|${seq}`).digest('hex').slice(0, 31)}`
}

/** PUR (getestet): Aufruf lesen. */
export function parseArgs(argv, known = SERVER_WRITTEN_TABLES.map(entry => entry.table)) {
  const args = { tables: [], apply: false, batch: 25, errors: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--table') args.tables = String(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    else if (arg === '--batch') args.batch = Number(argv[++i])
    else if (arg !== '--') args.errors.push(`Unbekanntes Argument: ${arg}`)
  }
  if (args.tables.length === 0) args.errors.push('`--table <name>[,<name>]` fehlt.')
  for (const table of args.tables) {
    if (!known.includes(table)) args.errors.push(`Tabelle „${table}" steht nicht in scripts/lib/server-written-tables.mjs — ihr Code schreibt noch nicht über den Server.`)
  }
  if (!Number.isInteger(args.batch) || args.batch < 1 || args.batch > 100) args.errors.push('`--batch` muss zwischen 1 und 100 liegen.')
  return args
}

class RunError extends Error {}

function makeApi({ endpoint, project, key }) {
  return async function api(method, path, { body, queries } = {}) {
    const url = new URL(endpoint + path)
    for (const query of queries ?? []) url.searchParams.append('queries[]', JSON.stringify(query))
    let res
    try {
      res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
        body: body ? JSON.stringify(body) : undefined,
      })
    }
    catch (error) {
      throw new RunError(`${endpoint} nicht erreichbar (${error?.cause?.code || error?.message || error})`)
    }
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json }
  }
}

async function eachRow(api, databaseId, table, visit) {
  let cursor
  for (;;) {
    const queries = [{ method: 'limit', values: [100] }, { method: 'select', values: ['$id', '$permissions'] }]
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] })
    const { status, json } = await api('GET', `/tablesdb/${databaseId}/tables/${table}/rows`, { queries })
    if (status === 404) return 'missing'
    if (status !== 200) throw new RunError(`${table}: Zeilen nicht lesbar (HTTP ${status}${json?.type ? ` ${json.type}` : ''})`)
    for (const row of json.rows) await visit(row)
    if (json.rows.length < 100) return 'ok'
    cursor = json.rows.at(-1).$id
  }
}

async function count(api, databaseId, table) {
  const result = { total: 0, writable: 0, update: 0, delete: 0 }
  const state = await eachRow(api, databaseId, table, (row) => {
    result.total++
    const permissions = row.$permissions ?? []
    if (hasRowWriteRight(permissions)) result.writable++
    if (permissions.some(p => p.startsWith('update('))) result.update++
    if (permissions.some(p => p.startsWith('delete('))) result.delete++
  })
  return state === 'missing' ? null : result
}

async function acquireLease(api, databaseId, table) {
  const latest = await api('GET', `/tablesdb/${databaseId}/tables/${RUNS_TABLE}/rows`, { queries: [
    { method: 'equal', attribute: 'scope', values: [SCOPE] },
    { method: 'equal', attribute: 'subject', values: [table] },
    { method: 'orderDesc', attribute: 'seq' },
    { method: 'limit', values: [1] },
  ] })
  if (latest.status === 404) throw new RunError(`Tabelle ${RUNS_TABLE} fehlt in diesem Projekt — erst Migration system-040 fahren.`)
  if (latest.status !== 200) throw new RunError(`Lauf-Sperre nicht prüfbar (HTTP ${latest.status}${latest.json?.type ? ` ${latest.json.type}` : ''})`)
  const previous = latest.json.rows[0] ?? null
  const state = runLeaseState(previous ? { heartbeatAt: previous.heartbeatAt ?? '', finishedAt: previous.finishedAt ?? '', outcome: previous.outcome ?? '' } : null, Date.now(), RUN_LEASE_STALL_MS)
  if (!runLeaseStartable(state)) throw new RunError(`${table}: ein anderer Aufräum-Lauf ist gerade aktiv (Lauf-Sperre). Später noch einmal.`)
  const seq = (previous?.seq ?? 0) + 1
  const at = new Date().toISOString()
  const created = await api('POST', `/tablesdb/${databaseId}/tables/${RUNS_TABLE}/rows`, { body: {
    rowId: leaseRowId(SCOPE, table, seq),
    data: { scope: SCOPE, subject: table, seq, startedAt: at, heartbeatAt: at, detail: clampRunLeaseDetail({ changed: 0 }) },
    permissions: [],
  } })
  if (created.status === 409) throw new RunError(`${table}: ein anderer Aufräum-Lauf hat im selben Augenblick begonnen (Lauf-Sperre).`)
  if (created.status !== 201) throw new RunError(`Lauf-Sperre nicht anlegbar (HTTP ${created.status}${created.json?.type ? ` ${created.json.type}` : ''})`)
  return { id: created.json.$id, seq, previousState: state }
}

async function touchLease(api, databaseId, lease, data) {
  await api('PATCH', `/tablesdb/${databaseId}/tables/${RUNS_TABLE}/rows/${lease.id}`, { body: { data } })
}

async function strip(api, databaseId, table, batch) {
  const lease = await acquireLease(api, databaseId, table)
  if (lease.previousState === 'stalled') console.log(`  · ${table}: der vorige Lauf wurde nicht beendet (Herzschlag über 120 s alt) — dieser Lauf übernimmt`)
  const result = { seen: 0, changed: 0, clean: 0, failed: 0 }
  let lastBeat = Date.now()
  let outcome = 'done'
  try {
    // Erst sammeln, dann schreiben: beim Blättern per Cursor soll sich die Liste nicht bewegen.
    const todo = []
    await eachRow(api, databaseId, table, (row) => {
      result.seen++
      if (hasRowWriteRight(row.$permissions ?? [])) todo.push({ id: row.$id, permissions: withoutRowWriteRights(row.$permissions) })
      else result.clean++
    })
    for (let start = 0; start < todo.length; start += batch) {
      for (const row of todo.slice(start, start + batch)) {
        const res = await api('PATCH', `/tablesdb/${databaseId}/tables/${table}/rows/${row.id}`, { body: { permissions: row.permissions } })
        // Zurückgelesen wird die Antwort: kein Schreibrecht mehr UND genau die Leserechte von vorher.
        if (res.status === 200 && samePermissions(res.json?.$permissions, row.permissions)) result.changed++
        else result.failed++
      }
      console.log(`  · ${table}: Stapel ${Math.floor(start / batch) + 1} — ${Math.min(start + batch, todo.length)} von ${todo.length} bearbeitet, ${result.failed} gescheitert`)
      if (Date.now() - lastBeat > 10_000) {
        await touchLease(api, databaseId, lease, { heartbeatAt: new Date().toISOString(), detail: clampRunLeaseDetail(result) })
        lastBeat = Date.now()
      }
    }
    if (result.failed > 0) outcome = 'rows_failed'
  }
  catch (error) {
    outcome = 'aborted'
    throw error
  }
  finally {
    const at = new Date().toISOString()
    await touchLease(api, databaseId, lease, { heartbeatAt: at, finishedAt: at, outcome, detail: clampRunLeaseDetail(result) }).catch(() => {})
  }
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.errors.length) {
    for (const error of args.errors) console.error(`✗ ${error}`)
    process.exit(2)
  }
  const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const project = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
  const key = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
  if (!endpoint || !project || !databaseId || !key) {
    console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
    process.exit(2)
  }
  assertTarget({ endpoint, projectId: project })
  const api = makeApi({ endpoint, project, key })

  console.log(`Schreibrechte an Zeilen — ${args.apply ? 'SCHREIBEN' : 'nur zählen'} — ${endpoint} / Projekt ${project} / DB ${databaseId}`)
  let failed = false
  for (const table of args.tables) {
    const before = await count(api, databaseId, table)
    if (!before) { console.log(`↷ ${table}: gibt es in diesem Projekt nicht`); continue }
    console.log(`${table}: ${before.total} Zeilen, davon ${before.writable} mit Schreibrecht eines Kontos (update ${before.update}, delete ${before.delete})`)
    if (!args.apply || before.writable === 0) continue
    const result = await strip(api, databaseId, table, args.batch)
    const after = await count(api, databaseId, table)
    console.log(`${result.failed === 0 && after?.writable === 0 ? '✔' : '✗'} ${table}: ${result.changed} geändert, ${result.clean} waren schon sauber, ${result.failed} gescheitert — nachgezählt: ${after?.writable ?? '?'} mit Schreibrecht von ${after?.total ?? '?'}`)
    if (result.failed > 0 || (after?.writable ?? 1) > 0) failed = true
  }
  if (!args.apply) console.log('Nichts geändert (ohne --apply).')
  process.exit(failed ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`✗ ${error instanceof RunError ? error.message : (error?.stack ?? error)}`)
    process.exit(2)
  })
}
