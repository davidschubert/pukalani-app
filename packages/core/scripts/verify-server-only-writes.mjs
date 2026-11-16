#!/usr/bin/env node
/**
 * „Der Server schreibt" — LIVE-Beweis an der Datenbank (SEC-002, GA1 P13).
 *
 * Prüft je Inhalts-Tabelle, was die DATENBANK einem angemeldeten Konto
 * erlaubt, wenn es sie direkt anspricht (also ohne unsere Routen):
 *   (a) ANLEGEN  — erwartet: abgelehnt (401), sobald das Tabellenrecht fehlt;
 *   (b) ÄNDERN und LÖSCHEN einer Zeile, wie der Server sie heute anlegt (nur
 *       Leserechte) — erwartet: abgelehnt (401);
 *   (c) BESTAND  — wie viele Zeilen noch ein Schreibrecht für ein Konto tragen.
 * Dazu die Gegenprobe: dieselbe Zeile ist für das Konto LESBAR (das Leserecht
 * bleibt, Realtime hängt daran).
 *
 * NUR LOKAL: das Skript legt ein Wegwerf-Konto und Probe-Zeilen an. Gegen
 * einen entfernten Endpunkt bricht es ab — dort werden die Rechte der
 * Tabellen nur zurückgelesen (`pnpm ops:schema-parity` bzw. von Hand).
 *
 * Aus packages/core (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-server-only-writes.mjs
 *   … --expect-closed community_posts,comments   # diese Tabellen MÜSSEN zu sein (sonst Exit 1)
 *   … --expect-closed all                        # alle Tabellen der Liste
 *   … --expect-clean  community_posts,comments   # zusätzlich: Bestand ohne Schreibrechte
 *
 * Ohne `--expect-closed` berichtet es nur (Exit 0), damit es VOR und NACH
 * jeder Etappe laufen kann. Idempotent und selbst-aufräumend (auch im
 * Fehlerfall): Probe-Zeilen, Sitzung und Konto werden wieder gelöscht.
 *
 * Schlüssel: `NUXT_APPWRITE_KEY` (users.write, rows.*) und, falls vorhanden,
 * `NUXT_APPWRITE_MIGRATIONS_KEY` (columns.read). KEIN SCHLÜSSEL WIRD AUSGEGEBEN.
 */
import { assertTarget, isLocalEndpoint } from '../../../scripts/lib/target.mjs'

/** Die Inhalts-Tabellen, die Konten früher direkt beschreiben durften. */
const TABLES = [
  'community_posts', 'comments',
  'post_votes', 'comment_votes', 'discussion_reactions', 'comment_reactions', 'event_votes', 'discussion_links',
  'reports',
]

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const runtimeKey = process.env.NUXT_APPWRITE_KEY
const schemaKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? runtimeKey
if (!endpoint || !projectId || !databaseId || !runtimeKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
  process.exit(2)
}
if (!isLocalEndpoint(endpoint)) {
  console.error('✗ Dieses Skript legt ein Konto und Probe-Zeilen an und läuft nur gegen eine lokale Appwrite.')
  process.exit(2)
}
assertTarget({ endpoint, projectId })

function listArg(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return []
  const value = process.argv[index + 1] ?? ''
  return value === 'all' ? [...TABLES] : value.split(',').map(s => s.trim()).filter(Boolean)
}
const expectClosed = new Set(listArg('--expect-closed'))
const expectClean = new Set(listArg('--expect-clean'))
for (const name of [...expectClosed, ...expectClean]) {
  if (!TABLES.includes(name)) { console.error(`✗ Unbekannte Tabelle: ${name}`); process.exit(2) }
}

async function call(method, path, { key, session, body, queries } = {}) {
  const url = new URL(endpoint + path)
  for (const query of queries ?? []) url.searchParams.append('queries[]', JSON.stringify(query))
  const headers = { 'X-Appwrite-Project': projectId, 'Content-Type': 'application/json' }
  if (key) headers['X-Appwrite-Key'] = key
  if (session) headers['X-Appwrite-Session'] = session
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await res.json() }
  catch { /* 204 ohne Rumpf */ }
  return { status: res.status, json }
}

const STRING_TYPES = ['string', 'varchar', 'text', 'mediumtext', 'longtext']
const RUN = `p13probe${Date.now().toString(36)}`
const cleanup = [] // () => Promise
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}
const note = text => console.log(`· ${text}`)

/** Pflichtspalten einer Tabelle mit einem gültigen Probe-Wert füllen. */
async function probeData(table, userId, tag) {
  const { status, json } = await call('GET', `/tablesdb/${databaseId}/tables/${table}/columns`, {
    key: schemaKey, queries: [{ method: 'limit', values: [100] }],
  })
  if (status !== 200) return null
  const data = {}
  for (const column of json.columns ?? []) {
    const plainText = STRING_TYPES.includes(column.type) && !column.format && !column.array
    // Pflichtspalten immer; dazu jede schlichte Text-Spalte — manche Tabellen
    // haben keine Pflichtspalte, und eine Zeile ganz ohne Daten lehnt Appwrite ab.
    if (!column.required && !plainText) continue
    if (column.format === 'enum') data[column.key] = column.elements?.[0]
    // Appwrite 2.x nennt Text-Spalten `varchar`/`text`/`mediumtext`/`longtext`, ältere `string`.
    else if (STRING_TYPES.includes(column.type)) {
      const value = /(^|[a-z])(userId|authorId|reporterId)$/i.test(column.key) ? userId : `${tag}${RUN}`
      data[column.key] = column.size ? value.slice(0, column.size) : value
    }
    else if (column.type === 'integer' || column.type === 'double') data[column.key] = Math.min(Math.max(0, column.min ?? 0), column.max ?? 0)
    else if (column.type === 'boolean') data[column.key] = false
    else if (column.type === 'datetime') data[column.key] = new Date().toISOString()
  }
  return data
}

async function countWriteRights(table) {
  let total = 0, writable = 0, cursor
  for (;;) {
    const queries = [{ method: 'limit', values: [500] }, { method: 'select', values: ['$id', '$permissions'] }]
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] })
    const { status, json } = await call('GET', `/tablesdb/${databaseId}/tables/${table}/rows`, { key: runtimeKey, queries })
    if (status !== 200) return null
    for (const row of json.rows) {
      total++
      if ((row.$permissions ?? []).some(p => /^(update|delete|write)\(/.test(p))) writable++
    }
    if (json.rows.length < 500) break
    cursor = json.rows.at(-1).$id
  }
  return { total, writable }
}

try {
  console.log(`Der Server schreibt — Probe gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  // ── Wegwerf-Konto und Sitzung (über den Schlüssel: unabhängig davon, welche
  //    Anmelde-Wege das Projekt Clients erlaubt) ─────────────────────────────
  const user = await call('POST', '/users', {
    key: runtimeKey,
    body: { userId: 'unique()', email: `${RUN}@example.test`, password: `${RUN}-Aa1!-${Math.random().toString(36).slice(2)}`, name: 'P13 Probe' },
  })
  if (user.status !== 201) throw new Error(`Probe-Konto ließ sich nicht anlegen (HTTP ${user.status} ${user.json?.type ?? ''})`)
  const userId = user.json.$id
  cleanup.push(() => call('DELETE', `/users/${userId}`, { key: runtimeKey }))
  const sessionRes = await call('POST', `/users/${userId}/sessions`, { key: runtimeKey })
  if (sessionRes.status !== 201 || !sessionRes.json?.secret) throw new Error(`Sitzung ließ sich nicht anlegen (HTTP ${sessionRes.status})`)
  const session = sessionRes.json.secret
  const me = await call('GET', '/account', { session })
  check('Probe-Konto ist direkt bei der Datenbank angemeldet (ohne Schlüssel)', me.status === 200 && me.json?.$id === userId, `(HTTP ${me.status})`)

  const tablesRes = await call('GET', `/tablesdb/${databaseId}/tables`, { key: schemaKey, queries: [{ method: 'limit', values: [200] }] })
  const present = new Map((tablesRes.json?.tables ?? []).map(t => [t.$id, t]))

  const summary = []
  for (const table of TABLES) {
    const meta = present.get(table)
    if (tablesRes.status === 200 && !meta) { note(`${table}: gibt es in diesem Projekt nicht`); continue }
    // Zwei verschiedene Wertesätze: die Tabellen tragen Unique-Indizes.
    const data = await probeData(table, userId, 'a')
    const seedData = await probeData(table, userId, 'b')
    if (!data || !seedData) { check(`${table}: Spalten lesbar`, false, '(Schlüssel ohne columns.read?)'); continue }

    // (a) direkt ANLEGEN als Konto
    const direct = await call('POST', `/tablesdb/${databaseId}/tables/${table}/rows`, {
      session, body: { rowId: 'unique()', data, permissions: [`read("user:${userId}")`] },
    })
    if (direct.status === 201) cleanup.push(() => call('DELETE', `/tablesdb/${databaseId}/tables/${table}/rows/${direct.json.$id}`, { key: runtimeKey }))
    // 401 = die Rechteprüfung lehnt ab. 201 oder 400 = sie hat bestanden (bei 400 nur die Daten nicht).
    const closed = direct.status === 401
    const open = direct.status === 201 || direct.status === 400
    if (expectClosed.has(table)) check(`${table}: direkt anlegen wird abgelehnt`, closed, `(HTTP ${direct.status})`)
    else if (!closed && !open) check(`${table}: direkt anlegen — eindeutige Antwort`, false, `(HTTP ${direct.status} ${direct.json?.type ?? ''})`)
    else note(`${table}: direkt anlegen ${closed ? 'wird abgelehnt (401)' : `ist möglich (HTTP ${direct.status})`}`)

    // (b) eine Zeile, wie der Server sie anlegt (nur Leserecht): lesen ja, ändern und löschen nein
    const seeded = await call('POST', `/tablesdb/${databaseId}/tables/${table}/rows`, {
      key: runtimeKey, body: { rowId: 'unique()', data: seedData, permissions: [`read("user:${userId}")`] },
    })
    if (seeded.status !== 201) {
      check(`${table}: Probe-Zeile über den Server anlegen`, false, `(HTTP ${seeded.status} ${seeded.json?.type ?? ''} ${seeded.json?.message ?? ''})`)
    }
    else {
      const rowPath = `/tablesdb/${databaseId}/tables/${table}/rows/${seeded.json.$id}`
      cleanup.push(() => call('DELETE', rowPath, { key: runtimeKey }))
      const read = await call('GET', rowPath, { session })
      check(`${table}: Gegenprobe — die eigene Zeile bleibt lesbar`, read.status === 200, `(HTTP ${read.status})`)
      // Mit GEÄNDERTEN Werten: ein Schreibvorgang ohne Änderung prüft bei
      // Appwrite nur das Leserecht und käme deshalb immer durch.
      const patch = await call('PATCH', rowPath, { session, body: { data: await probeData(table, userId, 'c') } })
      check(`${table}: direkt ändern wird abgelehnt`, patch.status === 401, `(HTTP ${patch.status})`)
      const perms = await call('PATCH', rowPath, { session, body: { permissions: [`read("user:${userId}")`, `update("user:${userId}")`] } })
      check(`${table}: sich selbst ein Schreibrecht geben wird abgelehnt`, perms.status === 401, `(HTTP ${perms.status})`)
      const remove = await call('DELETE', rowPath, { session })
      check(`${table}: direkt löschen wird abgelehnt`, remove.status === 401, `(HTTP ${remove.status})`)
    }

    // (c) Bestand
    const counted = await countWriteRights(table)
    if (!counted) check(`${table}: Bestand zählbar`, false)
    else if (expectClean.has(table)) check(`${table}: keine Zeile trägt ein Schreibrecht für ein Konto`, counted.writable === 0, `(${counted.writable} von ${counted.total})`)
    else note(`${table}: Bestand ${counted.total} Zeilen, davon ${counted.writable} mit Schreibrecht eines Kontos`)

    summary.push({ table, tabellenrecht: (meta?.$permissions ?? []).join(' ') || '(keins)', anlegen: closed ? 'zu' : 'offen', bestandMitSchreibrecht: counted?.writable ?? '?' })
  }

  console.log('\nÜbersicht:')
  for (const row of summary) console.log(`  ${row.table.padEnd(22)} Tabellenrecht: ${String(row.tabellenrecht).padEnd(18)} anlegen: ${row.anlegen.padEnd(6)} Bestand mit Schreibrecht: ${row.bestandMitSchreibrecht}`)
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  for (const step of cleanup.reverse()) await step().catch(() => {})
  console.log(`\n${passed} ✔ / ${failed} ✗ — Probe-Zeilen und Probe-Konto entfernt.`)
  process.exit(failed ? 1 : 0)
}
