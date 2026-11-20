#!/usr/bin/env node
// Vergleichs-Skript für die Webserver-Einstellungen auf dem App-Server
// (OPS-003, 2026-11-16).
//
// WOZU: die nginx-Dateien der Sites liegen nur auf dem Server und sind von
// Hand gewachsen. Zwei Sites reichten monatelang die Adresse des Aufrufers
// nicht an die App weiter, zwei setzten Schutz-Kopfzeilen, vier nicht — und
// niemand verglich. Die Vorlagen stehen jetzt im Repo (ops/nginx/); dieses
// Skript prüft täglich, ob jede Site auf dem Server ihre PFLICHT-ZEILEN trägt.
//
// ES VERGLEICHT NICHT ZEICHENGLEICH. Ploi schreibt die Dateien bei manchen
// Handgriffen neu (Zertifikat, Alias, Weiterleitung): andere Einrückung,
// `include /etc/nginx/ssl/…` statt `ssl_certificate`, ein zweiter
// `server_name`. Ein Zeichenvergleich wäre dann jedes Mal rot, obwohl nichts
// fehlt — und ein Blick, der zu oft rot ist, wird überlesen. Geprüft wird
// deshalb die BEDEUTUNG: die Datei wird in Anweisungen und Blöcke zerlegt, und
// je Block wird gefragt, ob die Pflicht-Zeilen da sind.
//
// DAS PROTOKOLL DES AUFRUFERS IST ÖFFENTLICH (GitHub Actions). Wie beim
// Zähl-Skript (app-watch-counts.mjs) und beim Tor auf dem Appwrite-Server gilt:
// gefiltert wird, wo die Ausgabe entsteht. Dieses Skript gibt aus:
//   · die Namen der Sites aus der Liste nginx-sites.conf (stehen im Repo)
//   · die Namen der Regeln aus RULES unten (stehen im Repo)
//   · Zahlen und die Wörter passt / fehlt / zuviel
// und NIE: eine Zeile aus einer nginx-Datei, einen Pfad, einen Zertifikats-
// namen, eine Kundendomain (nur ihre laufende Nummer; die Namen zeigt `--namen`,
// und das nur für den Aufruf von Hand).
// Es liest nur: die Dateien unter /etc/nginx (für `ploi` lesbar, kein sudo).
//
// WIE ES AUF DEN SERVER KOMMT: der Deploy legt es mit nginx-sites.conf neben
// die Ecosystem-Datei (/home/ploi/<site>/ops/, .github/workflows/deploy.yml).
//
// DIE REGELN (jede mit Grund; Vorlagen: ops/nginx/*.conf.template)
//   Je Block, der an die App weiterreicht (`proxy_pass`):
//   host                    `proxy_set_header Host $host` — die App bedient
//                           mehrere Namen; ohne die Zeile sieht sie `localhost`.
//   client-adresse-real-ip  `proxy_set_header X-Real-IP $remote_addr`
//   client-adresse-xff      `proxy_set_header X-Forwarded-For
//                           $proxy_add_x_forwarded_for` — ohne sie reicht nginx
//                           eine vom Aufrufer GESENDETE Kopfzeile unverändert
//                           durch, und die Bremsen je Adresse zählen, was der
//                           Aufrufer will (SEC-039).
//   protokoll               `proxy_set_header X-Forwarded-Proto $scheme`
//   frist                   `proxy_read_timeout` steht ausdrücklich da: 60s in
//                           `location /`, in einem eigenen Block für lange
//                           Routen höchstens 180s. Die App baut auf diese Frist
//                           (BE-008); steht sie nicht da, gilt ein Standard,
//                           den ein nginx-Update ändern kann.
//   port                    das Ziel ist der Port aus nginx-sites.conf — eine
//                           Site, die auf den Port der Nachbar-App zeigt,
//                           liefert deren Seiten unter dem eigenen Namen aus.
//   Je Server-Block mit einem solchen Block:
//   feste-namen             `server_name` nennt Namen, nicht `_`, und der Block
//                           ist nicht `default_server`. Daran hängt, dass ein
//                           fremder Host-Name die App nie erreicht (SEC-010).
//   punkt-dateien           `location ~ /\.(?!well-known).* { deny all; }`
//   zugriffs-log            `access_log off` — oder, wo die Liste `an` sagt,
//                           ein eigenes Log im Format `pukalani_kurz` (ohne
//                           Query, ohne Referrer). Ohne eigene Zeile greift das
//                           globale Log des Servers mit 52 Tagen Aufbewahrung.
//   schutz-kopfzeilen       KEIN `add_header` für eine Schutz-Kopfzeile: die
//                           setzt seit SEC-006 die App für alle Antworten
//                           gleich; im Webserver käme sie doppelt (`zuviel`).
//   eigene-robots           KEIN eigener Block für `/robots.txt` (Ploi legt ihn
//                           bei einer neuen Site an): er beantwortet die
//                           Anfrage im Webserver mit „nicht gefunden", und die
//                           robots.txt der App kommt bei niemandem an (`zuviel`).
//   Für den Server:
//   auffangblock            ein `default_server`, der mit 444 antwortet —
//                           unbekannte Namen enden dort, nicht in einer App.
//   site-datei / proxy-block  die Site aus der Liste gibt es und sie reicht weiter.
//   Eine Datei in sites-enabled, die NICHT in der Liste steht, wird gezählt
//   (`unbekannt`): eine neu von Hand angelegte Site gehört in die Liste.
//
// AUFRUF
//   node nginx-check.mjs                 (auf dem Server)
//   node nginx-check.mjs --namen         (von Hand: nennt Kundendomains und unbekannte Dateien)
//   node nginx-check.mjs --root <ordner> --sites <datei>   (Tests, Attrappe)
//
// Exit: 0 verglichen (das Ergebnis steht in den Zeilen) · 5 Ordner oder Liste
//       nicht lesbar · 64 Aufruf nicht erlaubt
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERSION = 1

export const RULES = [
  'site-datei',
  'proxy-block',
  'host',
  'client-adresse-real-ip',
  'client-adresse-xff',
  'protokoll',
  'frist',
  'port',
  'feste-namen',
  'punkt-dateien',
  'zugriffs-log',
  'schutz-kopfzeilen',
  'eigene-robots',
  'auffangblock',
]

/** Kopfzeilen, die seit SEC-006 die App setzt — im Webserver wären sie doppelt. */
const APP_OWNED_HEADERS = new Set([
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'x-xss-protection',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
  'content-security-policy-report-only',
])

const SITE_PATTERN = /^[a-z0-9][a-z0-9.-]{2,80}$/
const ROOT_LOCATION_MAX_SECONDS = 60
const LONG_ROUTE_MAX_SECONDS = 180
const ACCESS_LOG_FORMAT = 'pukalani_kurz'
/** Im Format des eigenen Logs darf nichts stehen, was Query oder Herkunft trägt. */
const LOG_FORMAT_FORBIDDEN = ['$request', '$request_uri', '$args', '$query_string', '$http_referer', '$http_cookie', '$http_authorization']

// ── nginx-Datei zerlegen ────────────────────────────────────────────────────

/**
 * Zerlegt den Text in Wörter und die drei Trennzeichen `;`, `{`, `}`.
 * Kommentare (`#` bis Zeilenende) fallen weg, Anführungszeichen halten ein
 * Wort zusammen und werden abgestreift. Ein `{` mitten in einem Wort (Regex
 * mit `{2}`) verlangt nginx selbst in Anführungszeichen — hier genauso.
 */
export function tokenize(text) {
  const tokens = []
  let word = ''
  let hasWord = false
  let i = 0
  const flush = () => {
    if (hasWord) tokens.push({ type: 'word', value: word })
    word = ''
    hasWord = false
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === '#' && !hasWord) {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '"' || ch === '\'') {
      hasWord = true
      i++
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\' && i + 1 < text.length) {
          word += text[i] + text[i + 1]
          i += 2
          continue
        }
        word += text[i]
        i++
      }
      i++
      continue
    }
    if (ch === ';' || ch === '{' || ch === '}') {
      flush()
      tokens.push({ type: ch })
      i++
      continue
    }
    if (/\s/.test(ch)) {
      flush()
      i++
      continue
    }
    if (ch === '\\' && i + 1 < text.length) {
      word += ch + text[i + 1]
      hasWord = true
      i += 2
      continue
    }
    word += ch
    hasWord = true
    i++
  }
  flush()
  return tokens
}

/** Baut aus den Wörtern einen Baum: `{ name, args, children? }`. */
export function parse(text) {
  const tokens = tokenize(text)
  let at = 0
  const block = () => {
    const nodes = []
    let words = []
    while (at < tokens.length) {
      const token = tokens[at++]
      if (token.type === 'word') {
        words.push(token.value)
      }
      else if (token.type === ';') {
        if (words.length) nodes.push({ name: words[0], args: words.slice(1) })
        words = []
      }
      else if (token.type === '{') {
        const children = block()
        nodes.push({ name: words[0] ?? '', args: words.slice(1), children })
        words = []
      }
      else {
        return nodes
      }
    }
    return nodes
  }
  return block()
}

// ── Fragen an den Baum ──────────────────────────────────────────────────────

function directives(nodes, name) {
  return nodes.filter(node => node.name === name)
}

function has(nodes, name, ...args) {
  return directives(nodes, name).some(node => args.every((arg, index) => node.args[index] === arg))
}

/** Alle Blöcke `location`, auch verschachtelt. */
function locationsOf(nodes) {
  const found = []
  for (const node of nodes) {
    if (node.name === 'location' && node.children) {
      found.push(node)
      found.push(...locationsOf(node.children))
    }
  }
  return found
}

function proxiedLocations(server) {
  return locationsOf(server.children).filter(location => directives(location.children, 'proxy_pass').length > 0)
}

/** Alle `server`-Blöcke einer Datei, die an eine App weiterreichen. */
function appServers(tree) {
  return directives(tree, 'server').filter(server => server.children && proxiedLocations(server).length > 0)
}

function seconds(value) {
  const hit = /^(\d{1,5})(s|m)?$/.exec(value ?? '')
  if (!hit) return null
  return Number(hit[1]) * (hit[2] === 'm' ? 60 : 1)
}

function proxyPort(location) {
  const target = directives(location.children, 'proxy_pass')[0]?.args[0] ?? ''
  const hit = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})\/?$/.exec(target)
  return hit ? Number(hit[1]) : null
}

function isRootLocation(location) {
  return location.args.length === 1 && location.args[0] === '/'
}

function addHeaderNames(nodes) {
  const names = []
  for (const node of nodes) {
    if (node.name === 'add_header' && node.args[0]) names.push(node.args[0].toLowerCase())
    if (node.children) names.push(...addHeaderNames(node.children))
  }
  return names
}

function logFormatOk(tree) {
  const format = directives(tree, 'log_format').find(node => node.args[0] === ACCESS_LOG_FORMAT)
  if (!format) return false
  const body = format.args.slice(1).join(' ')
  // `$request_method` ist erlaubt, `$request` (die ganze Zeile samt Query) nicht.
  const variables = body.match(/\$[a-z_]+/g) ?? []
  return variables.length > 0 && !variables.some(variable => LOG_FORMAT_FORBIDDEN.includes(variable))
}

/**
 * Prüft EINEN Server-Block mit Weiterleitung an die App.
 * Gibt die Namen der verletzten Regeln zurück: `missing` und `extra`.
 */
export function checkAppServer(server, { port, accessLog, tree }) {
  const missing = new Set()
  const extra = new Set()

  for (const location of proxiedLocations(server)) {
    const body = location.children
    if (!has(body, 'proxy_set_header', 'Host', '$host')) missing.add('host')
    if (!has(body, 'proxy_set_header', 'X-Real-IP', '$remote_addr')) missing.add('client-adresse-real-ip')
    if (!has(body, 'proxy_set_header', 'X-Forwarded-For', '$proxy_add_x_forwarded_for')) missing.add('client-adresse-xff')
    if (!has(body, 'proxy_set_header', 'X-Forwarded-Proto', '$scheme')) missing.add('protokoll')
    const timeout = seconds(directives(body, 'proxy_read_timeout')[0]?.args[0])
    const allowed = isRootLocation(location) ? ROOT_LOCATION_MAX_SECONDS : LONG_ROUTE_MAX_SECONDS
    if (timeout === null || timeout < 1 || timeout > allowed) missing.add('frist')
    if (proxyPort(location) !== port) missing.add('port')
  }

  const names = directives(server.children, 'server_name').flatMap(node => node.args)
  const isDefault = directives(server.children, 'listen').some(node => node.args.includes('default_server'))
  if (names.length === 0 || names.includes('_') || names.includes('') || isDefault) missing.add('feste-namen')

  const dotFiles = locationsOf(server.children).some(location =>
    location.args.join(' ') === '~ /\\.(?!well-known).*' && has(location.children, 'deny', 'all'))
  if (!dotFiles) missing.add('punkt-dateien')

  const logs = directives(server.children, 'access_log')
  if (accessLog === 'an') {
    const own = logs.length === 1 && logs[0].args[0] !== 'off' && logs[0].args[1] === ACCESS_LOG_FORMAT
    if (!own || !logFormatOk(tree)) missing.add('zugriffs-log')
  }
  else if (!(logs.length === 1 && logs[0].args[0] === 'off')) {
    missing.add('zugriffs-log')
  }

  if (addHeaderNames(server.children).some(name => APP_OWNED_HEADERS.has(name))) extra.add('schutz-kopfzeilen')

  // Ein eigener Block für /robots.txt beantwortet die Anfrage im Webserver —
  // die Datei der App kommt dann bei niemandem an (SEO-001).
  const ownRobots = locationsOf(server.children).some(location =>
    location.args[location.args.length - 1] === '/robots.txt' && directives(location.children, 'proxy_pass').length === 0)
  if (ownRobots) extra.add('eigene-robots')

  return { missing: [...missing], extra: [...extra] }
}

// ── Liste der Sites ─────────────────────────────────────────────────────────

/** `nginx-sites.conf`: je Zeile `<site> <art> <port> <zugriffs-log an|aus>`. */
export function parseSites(text) {
  const sites = []
  const problems = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) return
    const hit = /^([a-z0-9.-]+)\s+(pool|einzel|lange-routen)\s+(\d{4,5})\s+(an|aus)$/.exec(line)
    if (!hit || !SITE_PATTERN.test(hit[1])) {
      problems.push(index + 1)
      return
    }
    sites.push({ site: hit[1], kind: hit[2], port: Number(hit[3]), accessLog: hit[4] })
  })
  return { sites, problems }
}

// ── Der Vergleich ───────────────────────────────────────────────────────────

function readTree(file) {
  try {
    return parse(readFileSync(file, 'utf8'))
  }
  catch {
    return null
  }
}

function listFiles(dir) {
  try {
    return readdirSync(dir).filter(name => !name.startsWith('.')).sort().map(name => join(dir, name))
      .filter(file => statSync(file).isFile())
  }
  catch {
    return []
  }
}

function orderRules(names) {
  return RULES.filter(rule => names.includes(rule))
}

/**
 * Vergleicht den Ordner `root` (auf dem Server: /etc/nginx) mit der Liste.
 * Gibt die Zeilen der Ausgabe zurück — in fester Form, ohne Text aus den Dateien.
 */
export function compare({ root, sites, withNames = false }) {
  const lines = [`nginx version=${VERSION} sites=${sites.length}`]
  const enabledDir = join(root, 'sites-enabled')

  for (const entry of sites) {
    const file = join(enabledDir, entry.site)
    const tree = existsSync(file) ? readTree(file) : null
    if (!tree) {
      lines.push(`nginx site=${entry.site} ergebnis=fehlt regel=site-datei`)
      continue
    }
    const servers = appServers(tree)
    if (servers.length === 0) {
      lines.push(`nginx site=${entry.site} ergebnis=fehlt regel=proxy-block`)
      continue
    }
    const missing = new Set()
    const extra = new Set()
    for (const server of servers) {
      const result = checkAppServer(server, { port: entry.port, accessLog: entry.accessLog, tree })
      result.missing.forEach(rule => missing.add(rule))
      result.extra.forEach(rule => extra.add(rule))
    }
    if (missing.size === 0 && extra.size === 0) lines.push(`nginx site=${entry.site} ergebnis=passt`)
    for (const rule of orderRules([...missing])) lines.push(`nginx site=${entry.site} ergebnis=fehlt regel=${rule}`)
    for (const rule of orderRules([...extra])) lines.push(`nginx site=${entry.site} ergebnis=zuviel regel=${rule}`)
  }

  // Kundendomains und andere Dateien, die Ploi je Site daneben legt
  // (/etc/nginx/ploi/<site>/before|after/*): dieselben Regeln, der Port ist der
  // der Site, das Zugriffs-Log ist aus. Ihre Namen sind Namen von Kunden.
  let tenantCount = 0
  let tenantOk = 0
  for (const entry of sites) {
    for (const part of ['before', 'after']) {
      for (const file of listFiles(join(root, 'ploi', entry.site, part))) {
        const tree = readTree(file)
        const servers = tree ? appServers(tree) : []
        if (servers.length === 0) continue
        tenantCount++
        const missing = new Set()
        const extra = new Set()
        for (const server of servers) {
          const result = checkAppServer(server, { port: entry.port, accessLog: 'aus', tree })
          result.missing.forEach(rule => missing.add(rule))
          result.extra.forEach(rule => extra.add(rule))
        }
        if (missing.size === 0 && extra.size === 0) {
          tenantOk++
          continue
        }
        const label = withNames ? ` name=${file.split('/').pop()}` : ''
        for (const rule of orderRules([...missing])) lines.push(`nginx kundendomain nr=${tenantCount} ergebnis=fehlt regel=${rule}${label}`)
        for (const rule of orderRules([...extra])) lines.push(`nginx kundendomain nr=${tenantCount} ergebnis=zuviel regel=${rule}${label}`)
      }
    }
  }
  lines.push(`nginx kundendomains anzahl=${tenantCount} passt=${tenantOk}`)

  // Auffangblock und unbekannte Dateien.
  const known = new Set(sites.map(entry => entry.site))
  let catchAll = false
  const unknown = []
  for (const file of listFiles(enabledDir)) {
    const name = file.split('/').pop()
    if (known.has(name)) continue
    const tree = readTree(file)
    const servers = tree ? directives(tree, 'server').filter(server => server.children) : []
    const isCatchAll = servers.length > 0 && servers.every(server =>
      directives(server.children, 'listen').some(node => node.args.includes('default_server'))
      && has(server.children, 'return', '444')
      && locationsOf(server.children).length === 0)
    if (isCatchAll) catchAll = true
    else unknown.push(name)
  }
  lines.push(`nginx auffangblock ergebnis=${catchAll ? 'passt' : 'fehlt'}`)
  lines.push(`nginx unbekannt anzahl=${unknown.length}${withNames && unknown.length ? ` namen=${unknown.join(',')}` : ''}`)
  lines.push('nginx fertig')
  return lines
}

function main() {
  const args = process.argv.slice(2)
  const value = (flag) => {
    const at = args.indexOf(flag)
    return at >= 0 ? args[at + 1] : undefined
  }
  const allowed = new Set(['--namen', '--root', '--sites'])
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) {
      console.log('Aufruf: nginx-check.mjs [--namen] [--root <ordner>] [--sites <datei>]')
      process.exit(64)
    }
    if (args[i] !== '--namen') i++
  }
  const root = value('--root') ?? '/etc/nginx'
  const sitesFile = value('--sites') ?? join(dirname(fileURLToPath(import.meta.url)), 'nginx-sites.conf')
  let parsed
  try {
    parsed = parseSites(readFileSync(sitesFile, 'utf8'))
  }
  catch {
    console.log('nginx liste=nicht-lesbar')
    process.exit(5)
  }
  if (parsed.problems.length || parsed.sites.length === 0 || !existsSync(join(root, 'sites-enabled'))) {
    console.log('nginx liste=nicht-lesbar')
    process.exit(5)
  }
  for (const line of compare({ root, sites: parsed.sites, withNames: args.includes('--namen') })) console.log(line)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
