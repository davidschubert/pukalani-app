/**
 * Gemeinsame Hilfe für Beweis-Skripte und die Bühne (OPS-009, GA1 P27).
 *
 * WARUM ES DAS GIBT: 22 Beweis-Skripte legten sich ihre Probe-Community über
 * `POST /api/onboarding/site` selbst an — jedes mit einem wortgleich kopierten
 * Rumpf und eigenen Kopien von `call()`, `login()`, Konto- und Code-Anlage.
 * Ein neues Pflichtfeld an der Route brach sie alle auf einmal, und kein Test
 * merkte es. Jetzt gibt es EINEN Rumpf (`probeSiteBody`), den ein Unit-Test
 * gegen das echte Schema und die echte Route hält
 * (`packages/onboarding/tests/probeSiteBody.test.ts`), und EINE Stelle für
 * das Handwerk drumherum.
 *
 * Bewusst ohne Abhängigkeiten: das Wurzel-`node_modules` kennt `node-appwrite`
 * nicht. Appwrite wird deshalb per `fetch` über REST angesprochen; jeder
 * Client prüft vorher sein Ziel (`assertTarget`, scripts/lib/target.mjs —
 * lokal durch, entfernt nur mit Bestätigung).
 *
 * Diese Datei bildet KEINE Regel der App nach: sie legt Zeilen an, die die
 * App liest, und fragt die App über ihre echten Routen.
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { assertTarget } from './target.mjs'

/** Probe-Adressen landen IMMER unter dieser Domain (RFC 2606, nie zustellbar). */
export const PROBE_EMAIL_DOMAIN = 'example.test'

// ── Der eine Rumpf ──────────────────────────────────────────────────────────

/**
 * DER Rumpf für `POST /api/onboarding/site`, wie ihn der Wizard schickt.
 *
 * `overrides` ersetzt Felder; ein Feld mit dem Wert `undefined` fällt ganz weg
 * (für Skripte, die absichtlich unvollständige oder ältere Rümpfe schicken).
 *
 * @param {{ name: string, slug: string, inviteCode?: string } & Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
export function probeSiteBody({ name, slug, inviteCode, ...overrides }) {
  /** @type {Record<string, unknown>} */
  const body = {
    // Betreiber-Bedingungen: Pflicht, wo die App sie einschaltet (apps/platform).
    operatorTerms: true,
    name,
    slug,
    purpose: 'new',
    memberRange: 'to100',
    category: 'club',
    goal: 'discussion',
    description: 'Probe-Community eines Beweis-Skripts.',
    vibe: 'fresh',
    inviteCode,
    locale: 'de',
    ...overrides,
  }
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }
  return body
}

// ── Kleine reine Bausteine ──────────────────────────────────────────────────

/**
 * Einfacher Parser für `.env`-Dateien: `NAME=wert`, Kommentare und Leerzeilen
 * fallen weg, umschließende Anführungszeichen ebenso. Gibt nie etwas aus.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2]
    const quoted = value.match(/^(['"])(.*)\1$/)
    if (quoted) value = quoted[2]
    else value = value.replace(/\s+#.*$/, '')
    out[match[1]] = value
  }
  return out
}

/** @param {string} path */
export function readEnvFile(path) {
  return parseEnvFile(readFileSync(path, 'utf8'))
}

/** Hash eines Einladungs-Codes, wie das Control Plane ihn speichert (sha256 des großgeschriebenen Codes). */
export function inviteCodeHash(code) {
  return createHash('sha256').update(String(code).toUpperCase(), 'utf8').digest('hex')
}

/** Ein frischer Einladungs-Code im erlaubten Format (6–64 Zeichen, A–Z, 0–9, Bindestrich). */
export function generateInviteCode(tag = 'PROBE') {
  const clean = String(tag).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PROBE'
  return `PUKA-${clean}-${randomBytes(4).toString('hex').toUpperCase()}`
}

/** Je Aufruf ein neues, zufälliges Passwort — nie ein festes im Quelltext. */
export function generatePassword() {
  return `Pr-${randomBytes(18).toString('base64url')}-9`
}

/** Probe-Adresse `<tag>-<stamp>@example.test` (Kleinbuchstaben, nur erlaubte Zeichen). */
export function probeEmail(tag, stamp) {
  const local = `${tag}-${stamp}`.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
  return `${local}@${PROBE_EMAIL_DOMAIN}`
}

/** Lauf-Stempel: kurz, alphanumerisch (taugt für Zeilen-Ids UND Labels). */
export function runStamp() {
  return `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ── HTTP gegen die App ──────────────────────────────────────────────────────

/**
 * @typedef {{ status: number, headers: import('node:http').IncomingHttpHeaders, json: any, text: string, setCookie: string[] }} HttpResult
 * @typedef {(host: string, path: string, options?: { method?: string, body?: unknown, cookie?: string, accept?: string, headers?: Record<string, string> }) => Promise<HttpResult>} HttpCall
 */

/**
 * `node:http` statt `fetch`, weil `fetch` einen eigenen Host-Header verwirft;
 * `::1`, weil Nitro dort hört.
 *
 * @param {{ port: number, address?: string }} options
 * @returns {{ call: HttpCall, page: (host: string, path: string, cookie?: string) => Promise<HttpResult> }}
 */
export function createHttpCaller({ port, address = '::1' }) {
  /** @type {HttpCall} */
  function call(host, path, { method = 'GET', body, cookie, accept, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body)
      const req = request({
        host: address,
        port,
        path,
        method,
        headers: {
          host,
          ...(accept ? { accept } : {}),
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
      }, (res) => {
        let text = ''
        res.on('data', chunk => text += chunk)
        res.on('end', () => {
          let json = null
          try { json = JSON.parse(text) }
          catch { /* HTML-Seite */ }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json, text, setCookie: res.headers['set-cookie'] ?? [] })
        })
      })
      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  }
  /** Seiten-SSR wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
  const page = (host, path, cookie) => call(host, path, { cookie, accept: 'text/html' })
  return { call, page }
}

/**
 * Anmelden auf einem Host ⇒ Session-Cookie `a_session_<projekt>=…` für DIESEN Host.
 *
 * @param {HttpCall} call
 * @param {string} host
 * @param {{ email: string, password: string }} account
 */
export async function login(call, host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Anmeldung auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(cookie => cookie.startsWith('a_session_'))
  if (!raw) throw new Error(`Kein Session-Cookie von ${host}`)
  return raw.split(';')[0]
}

/**
 * Die Zustimmung eines Probe-Kontos festhalten (SEC-008, seit 2026-11-16) —
 * über die ECHTE Route `POST /api/auth/consent` (Weg `prompt`), so wie der
 * Browser nach der Nachfrage. Eine App mit AGB-Pflicht lehnt sonst jede
 * schreibende Route eines Kontos ab (403 `consent_required`): ein Konto, das
 * ein Skript direkt anlegt, hat an der Registrierung vorbei nie zugestimmt.
 * Ein Konto mit Betreiber-Rolle ist ausgenommen; der Aufruf schadet dort nicht.
 *
 * @param {{ port: number, host?: string, cookie: string }} options
 */
export async function confirmProbeConsent({ port, host = 'localhost', cookie }) {
  const { call } = createHttpCaller({ port })
  const res = await call(host, '/api/auth/consent', { method: 'POST', cookie, body: { terms: true, business: true } })
  if (res.status !== 200) throw new Error(`Zustimmung des Probe-Kontos nicht festgehalten (${res.status}): ${res.text.slice(0, 160)}`)
  if (Array.isArray(res.json?.missing) && res.json.missing.length) throw new Error(`Zustimmung des Probe-Kontos unvollständig: ${res.json.missing.join(', ')}`)
}

/**
 * Zeilen einer Tabelle löschen, die EINEN Wert in EINER Spalte tragen
 * (`userId` eines Probe-Kontos, `profileId` eines Probe-Brandings, `host`
 * eines Probe-Servers) und — mit `since` — frühestens ab diesem Zeitpunkt
 * entstanden sind. Für Zeilen, die nicht das Skript, sondern die App anlegt:
 * wer nur das Konto oder die Haupt-Zeile löscht, lässt sie sonst liegen, und
 * eine feste Liste im Skript veraltet mit jedem neuen Kapitel. Gibt die Zahl
 * der gelöschten Zeilen zurück; eine Tabelle, die es in dieser App nicht
 * gibt, ist 0.
 *
 * @param {{ tablesDB: { listRows: Function, deleteRow: Function }, databaseId: string, tableId: string, column: string, value: string, since?: string }} options
 */
export async function removeProbeRows({ tablesDB, databaseId, tableId, column, value, since }) {
  const filters = [Q.equal(column, [value]), ...(since ? [{ method: 'greaterThanEqual', attribute: '$createdAt', values: [since] }] : []), Q.limit(100)]
  let removed = 0
  for (;;) {
    let rows
    try {
      ({ rows } = await tablesDB.listRows({ databaseId, tableId, queries: filters.map(query => JSON.stringify(query)) }))
    }
    catch (error) {
      // node-appwrite meldet den Status als `code`, die REST-Hilfe hier als `status`.
      if (isNotFound(error) || error?.code === 404) return removed
      throw error
    }
    if (!rows.length) return removed
    for (const row of rows) await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id })
    removed += rows.length
  }
}

/** Die Zeilen EINES Probe-Kontos aus einer Tabelle löschen (Spalte `userId`). */
export function removeProbeRowsOfUser({ tablesDB, databaseId, tableId, userId }) {
  return removeProbeRows({ tablesDB, databaseId, tableId, column: 'userId', value: userId })
}

/**
 * Die Zustimmungs-Zeilen eines Probe-Kontos wieder löschen (`consent_records`,
 * angelegt von `confirmProbeConsent`) — nur die Lösch-Route der App nähme sie
 * sonst mit.
 *
 * @param {{ tablesDB: { listRows: Function, deleteRow: Function }, databaseId: string, userId: string }} options
 */
export function removeProbeConsent({ tablesDB, databaseId, userId }) {
  return removeProbeRowsOfUser({ tablesDB, databaseId, tableId: 'consent_records', userId })
}

/**
 * Wartet, bis der Host aufgelöst wird (`/api/themes` antwortet 200) — keine
 * feste Wartezeit. Der Resolver merkt sich auch „unbekannt" 30 s.
 *
 * @param {HttpCall} call
 * @param {string} host
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 */
export async function waitForHost(call, host, { timeoutMs = 45_000, intervalMs = 1000 } = {}) {
  const until = Date.now() + timeoutMs
  for (;;) {
    const res = await call(host, '/api/themes').catch(() => null)
    if (res?.status === 200) return true
    if (Date.now() >= until) return false
    await sleep(intervalMs)
  }
}

/**
 * Wartet auf die erste fehlerfreie SEITE und gibt die letzte Antwort zurück.
 *
 * Warum neben `waitForHost`: der fragt eine API-Route. Die erste gerenderte
 * Seite eines frisch gestarteten Servers kann trotzdem noch mit 500 kommen
 * (CW1 a, 2026-11-18: zweimal in der CI, der zweite Lauf war je grün). Ein
 * Skript, das als Erstes eine Seite prüft, holt sie deshalb über diese Hilfe.
 *
 * Die Hilfe verschluckt nichts: sie gibt IMMER die letzte Antwort zurück, auch
 * nach Ablauf der Frist — bleibt die Seite kaputt, wird die Prüfung danach
 * mit genau dieser Antwort rot.
 *
 * @template {{ status?: number }} T
 * @param {() => Promise<T>} load holt die Seite
 * @param {{ isReady?: (res: T) => boolean, timeoutMs?: number, intervalMs?: number }} [options]
 *   `isReady`: ohne Angabe „der Server antwortet ohne Serverfehler" (Status unter 500)
 * @returns {Promise<T | null>} `null` nur, wenn bis zum Schluss keine Antwort kam
 */
export async function waitForPage(load, { isReady = res => typeof res?.status === 'number' && res.status < 500, timeoutMs = 60_000, intervalMs = 1500 } = {}) {
  const until = Date.now() + timeoutMs
  for (;;) {
    const res = await load().catch(() => null)
    if (res && isReady(res)) return res
    if (Date.now() >= until) return res
    await sleep(intervalMs)
  }
}

// ── Appwrite über REST ──────────────────────────────────────────────────────

/** Abfrage-Bausteine im JSON-Format der REST-Schnittstelle. */
export const Q = {
  equal: (attribute, values) => ({ method: 'equal', attribute, values: Array.isArray(values) ? values : [values] }),
  startsWith: (attribute, value) => ({ method: 'startsWith', attribute, values: [value] }),
  limit: n => ({ method: 'limit', values: [n] }),
  select: attributes => ({ method: 'select', values: attributes }),
}

/** Fehler einer Appwrite-Antwort: Status und `type`, nie der Schlüssel. */
export class AppwriteRestError extends Error {
  constructor(status, type, message) {
    super(`Appwrite ${status}${type ? ` ${type}` : ''}: ${message}`)
    this.status = status
    this.type = type
  }
}

/**
 * Kleiner REST-Client für EIN Projekt. Prüft beim Anlegen das Ziel
 * (`assertTarget` — lokal durch, sonst nur mit `PUKALANI_TARGET_CONFIRM`).
 *
 * @param {{ endpoint: string, projectId: string, key: string, script?: string }} options
 */
export function appwriteRest({ endpoint, projectId, key, script = 'probe-stage' }) {
  if (!key) throw new Error(`Schlüssel für das Projekt „${projectId}" fehlt.`)
  assertTarget({ script, endpoint, projectId })
  const base = String(endpoint).replace(/\/+$/, '')

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, queries?: object[] }} [options]
   */
  async function send(method, path, { body, queries } = {}) {
    const qs = (queries ?? []).map(query => `queries[]=${encodeURIComponent(JSON.stringify(query))}`).join('&')
    const res = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        'x-appwrite-project': projectId,
        'x-appwrite-key': key,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null }
    catch { /* leerer Rumpf bei 204 */ }
    if (!res.ok) throw new AppwriteRestError(res.status, json?.type ?? '', json?.message ?? text.slice(0, 160))
    return json
  }

  const rowsPath = (databaseId, tableId) => `/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/rows`

  return {
    projectId,
    get: (path, queries) => send('GET', path, { queries }),
    post: (path, body) => send('POST', path, { body }),
    put: (path, body) => send('PUT', path, { body }),
    patch: (path, body) => send('PATCH', path, { body }),
    delete: path => send('DELETE', path),
    /** @returns {Promise<{ total: number, rows: any[] }>} */
    listRows: (databaseId, tableId, queries = [Q.limit(25)]) => send('GET', rowsPath(databaseId, tableId), { queries }),
    getRow: (databaseId, tableId, rowId) => send('GET', `${rowsPath(databaseId, tableId)}/${encodeURIComponent(rowId)}`),
    createRow: (databaseId, tableId, rowId, data) => send('POST', rowsPath(databaseId, tableId), { body: { rowId, data } }),
    updateRow: (databaseId, tableId, rowId, data) => send('PATCH', `${rowsPath(databaseId, tableId)}/${encodeURIComponent(rowId)}`, { body: { data } }),
    deleteRow: (databaseId, tableId, rowId) => send('DELETE', `${rowsPath(databaseId, tableId)}/${encodeURIComponent(rowId)}`),
    /** @returns {Promise<{ total: number, tables: any[] }>} */
    listTables: databaseId => send('GET', `/tablesdb/${encodeURIComponent(databaseId)}/tables`, { queries: [Q.limit(100)] }),
  }
}

/** @typedef {ReturnType<typeof appwriteRest>} AppwriteRest */

/** 404 heißt „schon weg" — beim Aufräumen kein Fehler. */
export function isNotFound(error) {
  return error instanceof AppwriteRestError && error.status === 404
}

// ── Konten ──────────────────────────────────────────────────────────────────

/**
 * Probe-Konto im Pool-Projekt. Adresse IMMER `…@example.test`, Passwort je
 * Aufruf zufällig. Das Ergebnis enthält das Passwort — nie ausgeben.
 *
 * @param {AppwriteRest} pool
 * @param {{ tag: string, stamp?: string, name?: string, labels?: string[], verified?: boolean }} options
 * @returns {Promise<{ userId: string, email: string, password: string }>}
 */
export async function createProbeAccount(pool, { tag, stamp = runStamp(), name, labels = [], verified = true }) {
  const email = probeEmail(tag, stamp)
  const password = generatePassword()
  const user = await pool.post('/users', { userId: 'unique()', email, password, name: name ?? `Probe ${tag}` })
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse.
  if (verified) await pool.patch(`/users/${user.$id}/verification`, { emailVerification: true })
  if (labels.length) await pool.put(`/users/${user.$id}/labels`, { labels })
  return { userId: user.$id, email, password }
}

/** Labels eines Kontos setzen (ganze Liste). */
export async function setAccountLabels(pool, userId, labels) {
  await pool.put(`/users/${userId}/labels`, { labels })
}

/** Konto löschen; „schon weg" zählt als gelöscht. */
export async function deleteProbeAccount(pool, userId) {
  try {
    await pool.delete(`/users/${userId}`)
    return true
  }
  catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

// ── Control Plane ───────────────────────────────────────────────────────────

/**
 * Einladungs-Code als Zeile in `invite_codes` (unbegrenzt nutzbar, aktiv).
 *
 * @param {AppwriteRest} control
 * @param {string} databaseId
 * @param {string} [tag]
 * @returns {Promise<{ code: string, rowId: string }>}
 */
export async function issueInviteCode(control, databaseId, tag = 'PROBE') {
  const code = generateInviteCode(tag)
  const row = await control.createRow(databaseId, 'invite_codes', 'unique()', {
    codeHash: inviteCodeHash(code), label: `Probe ${tag}`, maxUses: 0, uses: 0, expiresAt: null, status: 'active',
  })
  return { code, rowId: row.$id }
}

/**
 * Community über die ECHTE Route anlegen (`POST /api/onboarding/site` mit
 * `probeSiteBody`). Mit `cleanup` wird alles Angelegte sofort registriert —
 * auch dann, wenn die Route ablehnt.
 *
 * @param {{
 *   call: HttpCall, controlHost: string, cookie: string,
 *   control: AppwriteRest, databaseId: string,
 *   slug: string, name: string, bodyOverrides?: Record<string, unknown>,
 *   cleanup?: ReturnType<typeof createCleanup>,
 * }} options
 * @returns {Promise<{ communityId: string, host: string, tenantId: string, memberRowIds: string[], inviteCodeRowId: string, response: HttpResult }>}
 */
export async function createProbeCommunity({ call, controlHost, cookie, control, databaseId, slug, name, bodyOverrides = {}, cleanup }) {
  const { code, rowId: inviteCodeRowId } = await issueInviteCode(control, databaseId, slug.slice(0, 8))
  cleanup?.track('inviteCode', inviteCodeRowId)
  const response = await call(controlHost, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: probeSiteBody({ name, slug, inviteCode: code, ...bodyOverrides }),
  })
  if (response.status !== 200 || !response.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${response.status}): ${response.text.slice(0, 200)}`)
  }
  const { communityId, host, tenantId } = response.json
  cleanup?.track('community', communityId)
  if (tenantId) cleanup?.track('tenant', tenantId)
  const members = await control.listRows(databaseId, 'community_members', [Q.equal('communityId', communityId), Q.limit(25)])
  const memberRowIds = members.rows.map(row => row.$id)
  for (const id of memberRowIds) cleanup?.track('member', id)
  return { communityId, host, tenantId, memberRowIds, inviteCodeRowId, response }
}

/**
 * Community DIREKT als Zeile im Control Plane (für feste `.localhost`-Hosts).
 * Die Zeilen-Id ist zugleich das Label am Konto — alphanumerisch, OHNE Bindestrich.
 *
 * @param {AppwriteRest} control
 * @param {string} databaseId
 * @param {{ rowId: string, name: string, host: string, projectId: string, tenantId: string, plan?: string, audience?: string, openRegistration?: boolean }} input
 */
export async function seedStageCommunity(control, databaseId, { rowId, name, host, projectId, tenantId, plan = 'pro', audience = 'public', openRegistration = true }) {
  if (!/^[a-zA-Z0-9]+$/.test(rowId)) throw new Error(`Zeilen-Id „${rowId}" muss alphanumerisch sein (sie ist zugleich das Label am Konto).`)
  return control.createRow(databaseId, 'communities', rowId, {
    name, host, mode: 'pool', projectId, tenantId, status: 'active', plan, audience, openRegistration,
  })
}

/**
 * Mitglieds-Zeile in `community_members` (wie eine Einladung sie hinterließe).
 *
 * @param {AppwriteRest} control
 * @param {string} databaseId
 * @param {{ communityId: string, projectId: string, userId: string, role: string, status?: string, email?: string }} input
 */
export async function addStageMember(control, databaseId, { communityId, projectId, userId, role, status = 'active', email }) {
  return control.createRow(databaseId, 'community_members', 'unique()', {
    communityId, runtimeProjectId: projectId, runtimeUserId: userId, role, status, ...(email ? { email } : {}),
  })
}

// ── Aufräumen nach Spalten ──────────────────────────────────────────────────

/** Spalten, die eine Zeile einer Community zuordnen (im Pool trägt `communityId` die tenantId). */
export const STAMP_COLUMNS = ['communityId', 'tenantId']
/** Spalten, die eine Zeile einem Konto zuordnen. */
export const PERSON_COLUMNS = ['userId', 'authorId', 'actorId', 'recipientId', 'runtimeUserId', 'authorUserId']

/**
 * Je Tabelle die Spalten aus `columns`, die es dort gibt. Ohne Leserecht auf
 * das Schema ⇒ `null` (der Aufrufer entscheidet, ob das ein Fehler ist).
 *
 * @param {AppwriteRest} client
 * @param {string} databaseId
 * @param {string[]} columns
 * @returns {Promise<Array<{ tableId: string, column: string }> | null>}
 */
export async function findColumns(client, databaseId, columns) {
  let list
  try {
    list = await client.listTables(databaseId)
  }
  catch (error) {
    if (error instanceof AppwriteRestError && error.status === 401) return null
    throw error
  }
  return list.tables.flatMap(table => (table.columns ?? [])
    .filter(column => columns.includes(column.key))
    .map(column => ({ tableId: table.$id, column: column.key })))
}

/**
 * Zählt (und löscht mit `remove: true`) alle Zeilen, deren Spalte einen der
 * Werte trägt. Gibt je `tabelle.spalte` die Zahl zurück.
 *
 * @param {AppwriteRest} client
 * @param {string} databaseId
 * @param {Array<{ tableId: string, column: string }>} targets
 * @param {string[]} values
 * @param {{ remove?: boolean }} [options]
 * @returns {Promise<Record<string, number>>}
 */
export async function sweepRows(client, databaseId, targets, values, { remove = false } = {}) {
  /** @type {Record<string, number>} */
  const counts = {}
  if (!values.length) return counts
  for (const { tableId, column } of targets) {
    let n = 0
    for (let round = 0; round < 50; round++) {
      const page = await client.listRows(databaseId, tableId, [Q.equal(column, values), Q.select(['$id']), Q.limit(100)])
      if (!remove) {
        n = page.total
        break
      }
      if (!page.rows.length) break
      for (const row of page.rows) {
        try {
          await client.deleteRow(databaseId, tableId, row.$id)
          n++
        }
        catch (error) {
          if (!isNotFound(error)) throw error
        }
      }
    }
    if (n) counts[`${tableId}.${column}`] = n
  }
  return counts
}

// ── Aufräum-Register ────────────────────────────────────────────────────────

/**
 * Register für alles, was ein Lauf anlegt. `run()` löscht in sicherer
 * Reihenfolge, zählt DANACH nach und gibt `{ deleted, leftovers }` zurück.
 *
 * Arten: `account` (Pool-Konto; dazu Zeilen, die über eine Personen-Spalte an
 * ihm hängen), `member`, `community`, `inviteCode` (Zeilen im Control Plane),
 * `tenant` (alle Pool-Zeilen mit diesem Stempel), `poolRow`
 * (`tabelle/zeile` im Pool).
 *
 * Ohne `control` (`null`, die Einzel-Instanz hat kein Control Plane) fallen
 * die Schritte im Control Plane weg; `member`, `community` und `inviteCode`
 * sind dann nicht erlaubt.
 *
 * `poolSchema` (optional): ein zweiter Zugang NUR zum Lesen des Schemas. Ein
 * Laufzeit-Schlüssel ohne `tables.read` sieht keine Spalten — dann fände der
 * Lauf keine Zeile, die an einem Konto hängt, löschte nur das Konto und
 * zählte „nichts übrig" (gemessen am 2026-11-19 im lokalen Spiegel). Mit
 * `schemaReadable()` fragt ein Skript vorher, ob das Nachzählen trägt.
 *
 * @param {{ pool: AppwriteRest, control: AppwriteRest | null, poolDatabaseId?: string, controlDatabaseId?: string, poolSchema?: AppwriteRest }} clients
 */
export function createCleanup({ pool, control, poolDatabaseId = 'main', controlDatabaseId = '', poolSchema = pool }) {
  /** @type {Map<string, Set<string>>} */
  const tracked = new Map()

  /** @param {'account'|'member'|'community'|'inviteCode'|'tenant'|'poolRow'} kind @param {string} id */
  function track(kind, id) {
    if (!id) return
    if (!control && ['member', 'community', 'inviteCode'].includes(kind)) {
      throw new Error(`Aufräum-Register ohne Control Plane kennt „${kind}" nicht.`)
    }
    if (!tracked.has(kind)) tracked.set(kind, new Set())
    tracked.get(kind).add(id)
  }
  const ids = kind => [...(tracked.get(kind) ?? [])]

  async function deleteControl(table, id) {
    try {
      await control.deleteRow(controlDatabaseId, table, id)
      return 1
    }
    catch (error) {
      if (isNotFound(error)) return 0
      throw error
    }
  }

  async function run() {
    /** @type {Record<string, number>} */
    const deleted = {}
    const add = (key, n) => { if (n) deleted[key] = (deleted[key] ?? 0) + n }

    const accounts = ids('account')
    const stamps = [...ids('tenant'), ...ids('community')]
    const poolStamp = await findColumns(poolSchema, poolDatabaseId, STAMP_COLUMNS) ?? []
    const poolPerson = await findColumns(poolSchema, poolDatabaseId, PERSON_COLUMNS) ?? []
    // Das Schema des Control Plane zu lesen braucht `tables.read`; fehlt es,
    // bleiben die zwei Tabellen, in denen ein Lauf sicher Spuren hinterlässt.
    const controlPerson = !control
      ? []
      : (await findColumns(control, controlDatabaseId, PERSON_COLUMNS))
        ?? [{ tableId: 'trial_claims', column: 'runtimeUserId' }, { tableId: 'community_members', column: 'runtimeUserId' }]
    const controlStamp = !control
      ? []
      : (await findColumns(control, controlDatabaseId, STAMP_COLUMNS))
        ?? [{ tableId: 'community_members', column: 'communityId' }]

    for (const [key, n] of Object.entries(await sweepRows(pool, poolDatabaseId, poolStamp, stamps, { remove: true }))) add(`pool:${key}`, n)
    for (const [key, n] of Object.entries(await sweepRows(pool, poolDatabaseId, poolPerson, accounts, { remove: true }))) add(`pool:${key}`, n)
    for (const entry of ids('poolRow')) {
      const [table, id] = entry.split('/')
      try {
        await pool.deleteRow(poolDatabaseId, table, id)
        add(`pool:${table}`, 1)
      }
      catch (error) {
        if (!isNotFound(error)) throw error
      }
    }
    for (const id of ids('member')) add('control:community_members', await deleteControl('community_members', id))
    for (const [key, n] of Object.entries(await sweepRows(control, controlDatabaseId, controlPerson, accounts, { remove: true }))) add(`control:${key}`, n)
    // Zeilen, die an einer Community dieses Laufs hängen — die Community-Zeile
    // selbst ausgenommen, die fällt unten über ihre Kennung.
    const controlStampRest = controlStamp.filter(target => target.tableId !== 'communities')
    for (const [key, n] of Object.entries(await sweepRows(control, controlDatabaseId, controlStampRest, stamps, { remove: true }))) add(`control:${key}`, n)
    for (const id of ids('community')) add('control:communities', await deleteControl('communities', id))
    for (const id of ids('inviteCode')) add('control:invite_codes', await deleteControl('invite_codes', id))
    for (const id of accounts) add('pool:users', await deleteProbeAccount(pool, id) ? 1 : 0)

    // NACHZÄHLEN — nicht dem eigenen Löschen glauben.
    /** @type {string[]} */
    const leftovers = []
    const stillThere = async (fn) => {
      try {
        await fn()
        return true
      }
      catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    }
    for (const id of accounts) if (await stillThere(() => pool.get(`/users/${id}`))) leftovers.push(`account:${id}`)
    for (const id of ids('member')) if (await stillThere(() => control.getRow(controlDatabaseId, 'community_members', id))) leftovers.push(`member:${id}`)
    for (const id of ids('community')) if (await stillThere(() => control.getRow(controlDatabaseId, 'communities', id))) leftovers.push(`community:${id}`)
    for (const id of ids('inviteCode')) if (await stillThere(() => control.getRow(controlDatabaseId, 'invite_codes', id))) leftovers.push(`inviteCode:${id}`)
    for (const entry of ids('poolRow')) {
      const [table, id] = entry.split('/')
      if (await stillThere(() => pool.getRow(poolDatabaseId, table, id))) leftovers.push(`poolRow:${entry}`)
    }
    for (const [key, n] of Object.entries(await sweepRows(pool, poolDatabaseId, [...poolStamp, ...poolPerson], [...stamps, ...accounts]))) leftovers.push(`pool:${key}=${n}`)
    for (const [key, n] of Object.entries(await sweepRows(control, controlDatabaseId, controlPerson, accounts))) leftovers.push(`control:${key}=${n}`)
    for (const [key, n] of Object.entries(await sweepRows(control, controlDatabaseId, controlStamp, stamps))) leftovers.push(`control:${key}=${n}`)

    return { deleted, leftovers }
  }

  /** Sieht dieser Lauf die Spalten des Projekts? Ohne sie zählt `run()` Zeilen an Konten nicht nach. */
  const schemaReadable = async () => (await findColumns(poolSchema, poolDatabaseId, PERSON_COLUMNS)) !== null

  return { track, run, tracked, schemaReadable }
}

// ── Einzel-Instanz ──────────────────────────────────────────────────────────

/**
 * Aufräum-Register für ein Skript gegen die EINZEL-INSTANZ (`apps/comments`:
 * ein Projekt, kein Control Plane), aus der Umgebung des Skripts
 * (`--env-file=…/apps/comments/.env` oder der Läufer). Dieselbe Zählung wie
 * `createCleanup`: registriert werden Konten (`account`) und einzelne Zeilen
 * (`poolRow`, `tabelle/zeile`); `run()` löscht auch die Zeilen, die über eine
 * Personen-Spalte an einem registrierten Konto hängen, und zählt danach nach.
 * Zurück kommt außerdem der REST-Client des Projekts (`pool`).
 *
 * @param {{ script: string, env?: Record<string, string | undefined> }} options
 */
export function createEinzelCleanup({ script, env = process.env }) {
  const pool = appwriteRest({
    endpoint: env.NUXT_PUBLIC_APPWRITE_ENDPOINT ?? '',
    projectId: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID ?? '',
    key: env.NUXT_APPWRITE_KEY ?? '',
    script,
  })
  // Das Schema liest der Migrations-Schlüssel, wenn die Umgebung einen nennt
  // (der Laufzeit-Schlüssel darf es nicht überall) — geschrieben und gelöscht
  // wird weiter mit dem Laufzeit-Schlüssel.
  const poolSchema = env.NUXT_APPWRITE_MIGRATIONS_KEY
    ? appwriteRest({
        endpoint: env.NUXT_PUBLIC_APPWRITE_ENDPOINT ?? '',
        projectId: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID ?? '',
        key: env.NUXT_APPWRITE_MIGRATIONS_KEY,
        script,
      })
    : pool
  // `pool` mit zurück: dasselbe Projekt, z. B. für `createProbeAccount`.
  return { ...createCleanup({ pool, control: null, poolDatabaseId: env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main', poolSchema }), pool }
}

/** Adresse der Einzel-Instanz: Argument, sonst `EINZEL_URL` (Läufer), sonst der alte Standard des Skripts. */
export function einzelBaseUrl(fallback) {
  return process.argv[2] || process.env.EINZEL_URL || fallback
}
