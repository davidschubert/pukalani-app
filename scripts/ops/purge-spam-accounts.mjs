/**
 * Spam-Konten aus einem Appwrite-Projekt entfernen — Nachlese zum Vorfall vom
 * 2026-10-25/27 (docs/OPEN-ITEMS-COMPLETE.md, „Resend-Spam über die
 * Registrierung").
 *
 *   node scripts/ops/purge-spam-accounts.mjs \
 *     --env ~/.appwrite-secrets/migrations/account.env \
 *     [--since 2026-10-25] [--include-verified] [--execute]
 *
 * WAS PASSIERT IST: ein Angreifer legte über `POST /api/auth/signup` Konten an,
 * deren NAME eine Spam-Nachricht mit Link war und deren E-MAIL einem Opfer
 * gehörte. Appwrite verschickt die Verifizierungs-Mail an „<Name> <E-Mail>" —
 * der Spam stand damit im Empfängerfeld und im Gruß, abgeschickt von
 * noreply@pukalani.app über unser Resend-Konto (209 Mails in einer Nacht).
 *
 * WAS DIESES SKRIPT TUT: es sucht Konten, die ALLE drei Merkmale tragen —
 *   1. der Name enthält einen Link (http(s)://, www. oder ein Domain-Muster
 *      wie `a29.at/…`) — dieselbe Regel, an der die Registrierung seit dem
 *      Vorfall scheitert (packages/core/shared/displayName.ts),
 *   2. die Adresse ist NICHT verifiziert (das Opfer hat den Link nie geklickt),
 *   3. das Konto ist nach `--since` entstanden (Default: 2026-10-25, der
 *      Tag der ersten Probeläufe des Angreifers).
 * Ein Konto, dem eines fehlt, bleibt stehen und wird als „übersprungen"
 * gemeldet. Verifizierte Konten mit Link im Namen könnten ein Mensch mit
 * schlechtem Geschmack sein — die rührt das Skript nur mit
 * `--include-verified` an. (Im Vorfall waren es zwei: die Probekonten des
 * Angreifers vom 2026-10-25, mit denen er die Mail-Kette selbst getestet hat.)
 *
 * SCHREIBT NICHTS, solange `--execute` fehlt: der Trockenlauf druckt die Liste
 * (Id, Datum, Adresse angedeutet, Name gekürzt) als Beweis. Gelöscht wird
 * über `DELETE /v1/users/{id}` (Runtime-Key reicht: users.write) — Appwrite
 * räumt Sessions, Tokens und Prefs des Kontos mit weg. Es gibt KEINE
 * Mitgliedschaften oder Inhalte zu diesen Konten (der Angreifer meldete sich
 * nach jeder Anlage sofort wieder ab), deshalb bewusst kein
 * `deleteUserCompletely`-Umweg über die App.
 *
 * Angesprochen wird die REST-API, nicht das SDK — `scripts/` gehört zu keinem
 * Workspace-Paket (dieselbe Bauform wie ah4c-project-transfer.mjs).
 *
 * Exit 0 = Lauf sauber · Exit 1 = Konfigurations- oder API-Fehler.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PAGE = 100
const DEFAULT_SINCE = '2026-10-25'

// ── Regel ────────────────────────────────────────────────────────────────────

/**
 * Spiegel von `displayNameProblem` (packages/core/shared/displayName.ts) für
 * den Link-Fall. Bewusst nur der LINK-Zweig: ein zu langer Name oder ein `@`
 * allein ist kein Beweis für Spam, ein Link im Anzeigenamen eines
 * unverifizierten Kontos schon.
 */
const LINK_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  // Wort ohne Leerzeichen, das auf `.tld` endet oder `.tld/` fortsetzt —
  // trifft `a29.at/9hdF2k` und `pukalani.app`, nicht „Dr. Müller".
  /\S+\.[a-z]{2,}(?:\/|$|\s)/i,
]

export function nameContainsLink(name) {
  return LINK_PATTERNS.some(re => re.test(name ?? ''))
}

export function isSpamAccount(user, sinceIso, includeVerified = false) {
  return nameContainsLink(user.name)
    && (includeVerified || user.emailVerification === false)
    && user.$createdAt >= sinceIso
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
  if (!path) throw new Error('Env-Pfad fehlt (--env ~/.appwrite-secrets/migrations/<projekt>.env)')
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
  cfg.api = async (path, method = 'GET') => {
    const res = await fetch(`${cfg.endpoint}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': cfg.project,
        'X-Appwrite-Key': cfg.key,
      },
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.message ?? ''}`.trim())
    return json
  }
  return cfg
}

// ── Lauf ─────────────────────────────────────────────────────────────────────

function maskEmail(email) {
  return (email ?? '').replace(/^(.).*(@.*)$/, '$1***$2')
}

async function listUsersSince(cfg, sinceIso) {
  const users = []
  let cursor = null
  for (;;) {
    // Die REST-API nimmt Queries seit Appwrite 1.6 als JSON-Objekte entgegen
    // (das SDK serialisiert `Query.greaterThanEqual(...)` genau so); die alte
    // Zeichenketten-Form `greaterThanEqual("…")` antwortet 400 „Syntax error".
    const queries = [
      { method: 'greaterThanEqual', attribute: '$createdAt', values: [sinceIso] },
      { method: 'orderAsc', attribute: '$createdAt', values: [] },
      { method: 'limit', values: [PAGE] },
    ]
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] })
    const qs = queries.map(q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&')
    const page = await cfg.api(`/users?${qs}`)
    users.push(...page.users)
    if (page.users.length < PAGE) break
    cursor = page.users.at(-1).$id
  }
  return users
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const execute = args.flags.has('execute')
  const includeVerified = args.flags.has('include-verified')
  const since = args.values.since ?? DEFAULT_SINCE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since erwartet YYYY-MM-DD, nicht „${since}"`)
  const sinceIso = `${since}T00:00:00.000Z`
  const cfg = loadInstance(args.values.env)

  console.log(`Projekt ${cfg.project} @ ${cfg.endpoint} · Konten seit ${since} · ${execute ? 'LÖSCHEN' : 'Trockenlauf'}`)
  const candidates = await listUsersSince(cfg, sinceIso)
  const spam = candidates.filter(u => isSpamAccount(u, sinceIso, includeVerified))
  const skipped = candidates.filter(u => nameContainsLink(u.name) && !isSpamAccount(u, sinceIso, includeVerified))

  console.log(`\n${candidates.length} Konten seit ${since}, davon ${spam.length} Spam (Link im Namen${includeVerified ? '' : ', unverifiziert'}), ${skipped.length} mit Link aber übersprungen.\n`)
  for (const u of spam) {
    console.log(`  ${u.$id}  ${u.$createdAt.slice(0, 19)}  ${maskEmail(u.email).padEnd(28)}  ${(u.name ?? '').slice(0, 60)}`)
  }
  for (const u of skipped) {
    console.log(`  ÜBERSPRUNGEN ${u.$id}  verifiziert=${u.emailVerification}  ${maskEmail(u.email)}  ${(u.name ?? '').slice(0, 60)}`)
  }

  if (!execute) {
    console.log(`\nTrockenlauf — nichts gelöscht. Mit --execute werden die ${spam.length} Konten entfernt.`)
    return
  }

  let deleted = 0
  for (const u of spam) {
    await cfg.api(`/users/${u.$id}`, 'DELETE')
    deleted += 1
  }
  console.log(`\n${deleted} Konten gelöscht.`)
}

main().catch((error) => {
  console.error(`\nFEHLER: ${error.message}`)
  process.exit(1)
})
