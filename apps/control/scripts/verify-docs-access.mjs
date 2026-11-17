#!/usr/bin/env node
/**
 * Beweis für den internen /docs-Bereich (admin.pukalani.app/docs).
 *
 * Prüft BEIDE Türen, weil eine allein nichts wert ist:
 *  - die Seiten `/docs/**`
 *  - die von @nuxt/content angemeldeten Routen `/__nuxt_content/**`
 *    (`sql_dump.txt` = die komplette Doku als SQL-Dump, `query` = freie Abfrage)
 *
 * Gast darf NICHTS sehen (Login-Redirect bzw. 401), ein Betreiber mit
 * `dashboard.access` sieht Startseite UND Unterseite gerendert.
 *
 * Aufruf (Dev-Server oder `node .output/server/index.mjs` muss laufen):
 *
 *   node --env-file=apps/control/.env apps/control/scripts/verify-docs-access.mjs
 *   PROBE_BASE=http://localhost:3147 node --env-file=… …            # anderer Port
 *   … --keep                                                        # Testkonto behalten
 *
 * Das Skript legt einen WEGWERF-Betreiber an (Label `admin`, Adresse und
 * Passwort je Lauf neu), meldet sich über die echte App-Route /api/auth/login
 * an und löscht das Konto am Ende wieder — und zählt nach, dass es weg ist.
 */
import '../../../scripts/lib/assert-target.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePassword, probeEmail, runStamp } from '../../../scripts/lib/probe-stage.mjs'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3004'
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const COLLECTION = 'internalDocs'

if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Fehlende Env-Vars — mit --env-file=apps/control/.env aufrufen.')
  process.exit(1)
}

const STAMP = runStamp()
const EMAIL = probeEmail('docs-verify', STAMP)
const PASSWORD = generatePassword()
const USER_ID = `docsverify${STAMP}`

/**
 * Die Abschnitts-Titel der Doku, gelesen aus dem REPO (`docs/content/<n>.<abschnitt>/.navigation.yml`)
 * — nicht aus der geprüften Antwort und nicht von Hand abgeschrieben (die
 * Handliste hieß nach einem Massen-Umbenennen „Produkte", der Abschnitt heißt
 * „Features").
 */
const CONTENT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../docs/content')
const SECTION_TITLES = readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map((entry) => {
    try {
      return readFileSync(join(CONTENT_DIR, entry.name, '.navigation.yml'), 'utf8').match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? null
    }
    catch { return null }
  })
  .filter(Boolean)

async function appwrite(path, method = 'GET', body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const results = []
function check(name, pass, detail) {
  results.push(pass)
  console.log(`${pass ? '✔' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── Wegwerf-Betreiber ───────────────────────────────────────────────────────
const created = await appwrite('/users', 'POST', { userId: USER_ID, email: EMAIL, password: PASSWORD, name: 'Docs Verify' })
if (created.status >= 300) {
  console.error('✗ User-Anlage fehlgeschlagen', created.status, created.json)
  process.exit(1)
}
const labeled = await appwrite(`/users/${USER_ID}/labels`, 'PUT', { labels: ['admin'] })
if (labeled.status >= 300) {
  console.error('✗ Label-Vergabe fehlgeschlagen', labeled.status, labeled.json)
  process.exit(1)
}

// ── Gast ────────────────────────────────────────────────────────────────────
const guestPage = await fetch(`${BASE}/docs`, { redirect: 'manual' })
const guestPageBody = await guestPage.text()
check('Gast: /docs → Redirect zum Login',
  guestPage.status === 302 && (guestPage.headers.get('location') ?? '').startsWith('/login'),
  `${guestPage.status} → ${guestPage.headers.get('location')}`)
check('Gast: /docs liefert keinerlei Doku-Inhalt', !/Monorepo, dokumentiert|Dev-Port/i.test(guestPageBody))

const guestDe = await fetch(`${BASE}/de/docs`, { redirect: 'manual' })
check('Gast: /de/docs → Login MIT Locale-Prefix',
  guestDe.status === 302 && (guestDe.headers.get('location') ?? '').startsWith('/de/login'),
  `${guestDe.status} → ${guestDe.headers.get('location')}`)

const guestDump = await fetch(`${BASE}/__nuxt_content/${COLLECTION}/sql_dump.txt`)
const guestDumpBody = await guestDump.text()
check('Gast: sql_dump.txt → 401, kein SQL',
  guestDump.status === 401 && !/CREATE TABLE|INSERT INTO/i.test(guestDumpBody),
  `status ${guestDump.status}`)

const guestQuery = await fetch(`${BASE}/__nuxt_content/${COLLECTION}/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: `SELECT * FROM _content_${COLLECTION}` }),
})
check('Gast: content-query → 401', guestQuery.status === 401, `status ${guestQuery.status}`)

// ── Betreiber ───────────────────────────────────────────────────────────────
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const cookie = (login.headers.getSetCookie?.() ?? [])
  .map(c => c.split(';')[0])
  .find(c => c.startsWith('a_session_'))
check('Betreiber: Login über /api/auth/login', login.status === 200 && !!cookie, `status ${login.status}`)

if (cookie) {
  const authed = path => fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' })

  const home = await authed('/docs')
  const homeHtml = await home.text()
  check('Betreiber: /docs → 200', home.status === 200, `status ${home.status}`)
  check('Betreiber: /docs rendert docs/content/index.md',
    /Monorepo, dokumentiert|Was dich hier erwartet/i.test(homeHtml), `${homeHtml.length} Bytes`)
  // Die Abschnitte sind auf der Startseite zugeklappt (nur der aktive Zweig
  // rendert Links), deshalb auf die Abschnitts-TITEL prüfen, nicht auf hrefs.
  check('Betreiber: Seitenleiste zeigt die Content-Navigation (alle Abschnitte aus docs/content)',
    SECTION_TITLES.length >= 3 && SECTION_TITLES.every(section => homeHtml.includes(section)),
    `fehlt: ${SECTION_TITLES.filter(section => !homeHtml.includes(section)).join(', ') || '—'}`)

  const sub = await authed('/docs/architektur/hosts-und-ports')
  const subHtml = await sub.text()
  check('Betreiber: Unterseite (Hosts & Ports) → 200', sub.status === 200, `status ${sub.status}`)
  check('Betreiber: Unterseite rendert den Markdown-Text',
    /Dev-Port/i.test(subHtml) && /pukalani\.app/.test(subHtml), `${subHtml.length} Bytes`)

  const dump = await authed(`/__nuxt_content/${COLLECTION}/sql_dump.txt`)
  check('Betreiber: sql_dump.txt erreichbar (Client-DB funktioniert)', dump.status === 200, `status ${dump.status}`)
}

// ── Aufräumen ───────────────────────────────────────────────────────────────
if (!process.argv.includes('--keep')) {
  await appwrite(`/users/${USER_ID}`, 'DELETE')
  // Nachzählen: das Konto muss weg sein (404), nicht nur „gelöscht" heißen.
  const after = await appwrite(`/users/${USER_ID}`)
  check('aufgeräumt — Wegwerf-Betreiber nachgezählt weg', after.status === 404, `status ${after.status}`)
}

const failed = results.filter(ok => !ok).length
console.log(`\n${results.length - failed}/${results.length} Prüfungen grün`)
process.exit(failed ? 1 : 0)
