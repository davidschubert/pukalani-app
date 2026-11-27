/**
 * DER EINMALIGE ABMELDE-LAUF (PK1-EIN, Schritt C;
 * `docs/runbooks/PK1-EINSCHALTEN.md` § 3 Schritt C, Plan
 * `docs/plans/PUKALANI-KONTO-E1.md` § 6 Punkt 4).
 *
 *   PUKALANI_TARGET_CONFIRM=<projekt-id> node scripts/ops/end-copied-sessions.mjs \
 *     --env <env-datei des Projekts account> \
 *     [--before <ISO-Zeit>] [--users <id,id,…>] \
 *     [--apply --expect <zahl>]
 *
 * WARUM: vor dem Schalter `write` bekam jede Seite beim Host-Wechsel eine
 * KOPIE des Sitzungs-Geheimnisses als Klartext-Cookie. Auf `*.pukalani.app`
 * gilt Klartext auch im Modus `write` weiter — diese Kopien leben also, bis
 * ihre Sitzung endet (ein Jahr). Der Lauf beendet die Sitzungen; danach
 * meldet sich jede betroffene Person einmal neu an (Davids Entscheidung
 * „Einmalige Abmeldung aller"). Kein Datenverlust.
 *
 * WAS ER TUT: liest jedes Konto des Projekts und dessen Sitzungen. Gezählt
 * und — nur mit `--apply` — beendet werden die Sitzungen, die VOR der
 * Stichzeit `--before` entstanden sind (`users.deleteSession`, je Sitzung).
 * Ohne `--before` ist die Stichzeit der Beginn dieses Laufs, also „alle".
 * Eine frühere Stichzeit (der Zeitpunkt, an dem `write` auf allen Apps
 * stand) trifft genau die Sitzungen, die kopiert worden sein KÖNNEN, und
 * lässt alle späteren Anmeldungen stehen — die tragen schon eine Karte.
 *
 * ABLAUF, wie ein Fristen-Lauf (`.claude/rules/zeit-laeufe.md`):
 *   1. ZÄHLEN (Standard, schreibt nichts): Konten, Sitzungen, davon vor der
 *      Stichzeit, nach Anmelde-Weg; am Ende der genaue Befehl für Schritt 2.
 *   2. ANWENDEN nur mit `--apply --expect <gezählte Zahl>` und Davids Ja zu
 *      genau dieser Zahl. Der Lauf zählt vorher NEU; liegt die neue Zahl über
 *      `--expect`, bricht er ab, ohne etwas zu löschen (eine Stichzeit in der
 *      Vergangenheit kann nur schrumpfen — mehr heißt: anderes Projekt,
 *      andere Stichzeit, Tippfehler). `--apply` ohne `--before` gibt es nicht:
 *      die Stichzeit muss dieselbe sein wie beim Zählen.
 *
 * ZIEL-PRÜFUNG (OPS-002) in BEIDEN Modi: schon das Zählen liest Sitzungen
 * (Adressen, Geräte) — gegen einen fremden Endpunkt nur mit
 * `PUKALANI_TARGET_CONFIRM=<projekt-id>`.
 *
 * `--users` grenzt auf die genannten Konten ein (für Beweise mit
 * Wegwerf-Konten auf der lokalen Appwrite, die ein Spiegel von Production
 * ist — dort hätten andere Sitzungen sonst mit dem Lauf zu tun).
 *
 * Die Ausgabe nennt keine Adressen und keine Namen, nur Zahlen und Ids.
 * Exit 0 = Lauf sauber · 1 = Konfiguration/API · 2 = Zahl passt nicht.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertTarget } from '../lib/target.mjs'

const PAGE = 100

// ── Regel (pur, getestet in packages/core/tests/endCopiedSessions.test.ts) ────

/**
 * Welche Sitzungen eines Kontos fallen? Die vor der Stichzeit (streng
 * kleiner); ein unlesbares Datum zählt mit (lieber einmal neu anmelden als
 * eine Kopie stehen lassen).
 */
export function sessionsBefore(sessions, beforeMs) {
  return sessions.filter((session) => {
    const created = Date.parse(session.$createdAt)
    return !Number.isFinite(created) || created < beforeMs
  })
}

/** Zusammenfassung über alle Konten — die Zahl, zu der David Ja sagt. */
export function summarize(accounts, beforeMs) {
  const byProvider = {}
  let sessionsTotal = 0
  let targeted = 0
  let accountsTargeted = 0
  let maxPerAccount = 0
  for (const account of accounts) {
    sessionsTotal += account.sessions.length
    const hit = sessionsBefore(account.sessions, beforeMs)
    if (hit.length > 0) accountsTargeted += 1
    targeted += hit.length
    maxPerAccount = Math.max(maxPerAccount, hit.length)
    for (const session of hit) {
      const key = session.provider || 'unbekannt'
      byProvider[key] = (byProvider[key] ?? 0) + 1
    }
  }
  return { accounts: accounts.length, accountsTargeted, sessionsTotal, targeted, maxPerAccount, byProvider }
}

/** Darf `--apply` mit dieser neu gezählten Zahl löschen? */
export function applyAllowed(recounted, expected) {
  return Number.isInteger(expected) && expected >= 0 && recounted <= expected
}

// ── Argumente + Env ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { args.values[key] = next; i++ }
    else args.flags.add(key)
  }
  return args
}

function parseEnvFile(path) {
  const env = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function loadInstance(path) {
  if (!path) throw new Error('Env-Pfad fehlt (--env <env-datei des Projekts account>)')
  const expanded = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  if (!existsSync(expanded)) throw new Error(`${expanded} gibt es nicht`)
  const env = parseEnvFile(expanded)
  const cfg = {
    endpoint: (env.NUXT_PUBLIC_APPWRITE_ENDPOINT ?? '').replace(/\/$/, ''),
    project: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
    key: env.NUXT_APPWRITE_KEY || env.NUXT_APPWRITE_MIGRATIONS_KEY,
  }
  for (const field of ['endpoint', 'project', 'key']) {
    if (!cfg[field]) throw new Error(`${expanded} — ${field} fehlt`)
  }
  cfg.api = async (apiPath, method = 'GET') => {
    const res = await fetch(`${cfg.endpoint}${apiPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': cfg.project,
        'X-Appwrite-Key': cfg.key,
      },
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(`${method} ${apiPath.replace(/\?.*$/, '')} → ${res.status} ${json.message ?? ''}`.trim())
      error.status = res.status
      throw error
    }
    return json
  }
  return cfg
}

// ── Lesen ────────────────────────────────────────────────────────────────────

async function listUserIds(cfg, only) {
  if (only) return only
  const ids = []
  let cursor = null
  for (;;) {
    const queries = [
      { method: 'orderAsc', attribute: '$createdAt', values: [] },
      { method: 'limit', values: [PAGE] },
    ]
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] })
    const qs = queries.map(q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&')
    const page = await cfg.api(`/users?${qs}`)
    ids.push(...page.users.map(user => user.$id))
    if (page.users.length < PAGE) break
    cursor = page.users.at(-1).$id
  }
  return ids
}

async function readAccounts(cfg, only) {
  const ids = await listUserIds(cfg, only)
  const accounts = []
  for (const userId of ids) {
    const list = await cfg.api(`/users/${encodeURIComponent(userId)}/sessions?total=false`)
    accounts.push({ userId, sessions: list.sessions ?? [] })
  }
  return accounts
}

function printSummary(summary, beforeIso) {
  console.log(`  Konten gelesen:                 ${summary.accounts}`)
  console.log(`  Sitzungen insgesamt:            ${summary.sessionsTotal}`)
  console.log(`  davon vor ${beforeIso}: ${summary.targeted}  (in ${summary.accountsTargeted} Konten, höchstens ${summary.maxPerAccount} je Konto)`)
  const providers = Object.entries(summary.byProvider).sort((a, b) => b[1] - a[1])
  if (providers.length > 0) {
    console.log(`  nach Anmelde-Weg:               ${providers.map(([name, n]) => `${name} ${n}`).join(' · ')}`)
  }
}

// ── Lauf ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apply = args.flags.has('apply')
  const startedAt = new Date()

  if (apply && !args.values.before) throw new Error('--apply braucht --before mit DERSELBEN Stichzeit wie beim Zählen')
  const beforeIso = args.values.before ?? startedAt.toISOString()
  const beforeMs = Date.parse(beforeIso)
  if (!Number.isFinite(beforeMs)) throw new Error(`--before erwartet eine ISO-Zeit (z. B. 2026-11-24T12:00:00Z), nicht „${beforeIso}"`)
  if (beforeMs > startedAt.getTime()) throw new Error('--before liegt in der Zukunft — die Zahl könnte bis zum Anwenden wachsen')

  const expected = args.values.expect === undefined ? undefined : Number(args.values.expect)
  if (apply && !Number.isInteger(expected)) throw new Error('--apply braucht --expect <gezählte Zahl> (Davids Ja gilt genau dieser Zahl)')

  const only = args.values.users ? args.values.users.split(',').map(id => id.trim()).filter(Boolean) : null
  if (only && only.length === 0) throw new Error('--users ist leer')

  const cfg = loadInstance(args.values.env)
  // Vor dem ersten Lesen: schon das Zählen liest Sitzungen mit Adressen.
  assertTarget({ script: `end-copied-sessions${apply ? ' --apply' : ''}`, endpoint: cfg.endpoint, projectId: cfg.project })

  console.log(`Projekt ${cfg.project} @ ${cfg.endpoint} · Stichzeit ${beforeIso}${only ? ` · nur ${only.length} Konto/Konten (--users)` : ''} · ${apply ? 'ANWENDEN' : 'ZÄHLEN (schreibt nichts)'}\n`)

  const accounts = await readAccounts(cfg, only)
  const summary = summarize(accounts, beforeMs)
  printSummary(summary, beforeIso)

  if (!apply) {
    const usersArg = only ? ` --users ${only.join(',')}` : ''
    console.log(`\nZählen — nichts beendet. Mit Davids Ja zu ${summary.targeted} Sitzungen:`)
    console.log(`  node scripts/ops/end-copied-sessions.mjs --env <dieselbe Datei> --before ${beforeIso}${usersArg} --apply --expect ${summary.targeted}`)
    console.log('Danach meldet sich jede betroffene Person einmal neu an (Kein Datenverlust).')
    return
  }

  if (!applyAllowed(summary.targeted, expected)) {
    console.error(`\nABBRUCH: neu gezählt ${summary.targeted}, erwartet höchstens ${expected} — nichts beendet. Neu zählen und die Zahl neu bestätigen lassen.`)
    process.exitCode = 2
    return
  }

  let ended = 0
  let gone = 0
  for (const account of accounts) {
    for (const session of sessionsBefore(account.sessions, beforeMs)) {
      try {
        await cfg.api(`/users/${encodeURIComponent(account.userId)}/sessions/${encodeURIComponent(session.$id)}`, 'DELETE')
        ended += 1
      }
      catch (error) {
        // 404: schon weg (abgemeldet oder abgelaufen, seit gezählt wurde).
        if (error.status === 404) gone += 1
        else throw new Error(`${error.message} — nach ${ended} beendeten Sitzungen abgebrochen; erneut zählen und fortsetzen`, { cause: error })
      }
    }
  }
  console.log(`\n${ended} Sitzungen beendet, ${gone} waren schon weg.`)

  // Nachzählen: vor der Stichzeit darf nichts mehr stehen.
  const after = summarize(await readAccounts(cfg, only), beforeMs)
  console.log(`Nachgezählt: ${after.targeted} Sitzungen vor der Stichzeit übrig, ${after.sessionsTotal} insgesamt.`)
  if (after.targeted > 0) process.exitCode = 2
}

// Nur als Programm laufen, nicht beim Import im Test.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`\nFEHLER: ${error.message}`)
    process.exit(1)
  })
}
