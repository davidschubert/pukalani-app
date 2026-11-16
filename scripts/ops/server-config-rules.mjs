/**
 * Regeln für den täglichen Blick „Server-Einstellungen wie in der Vorlage?"
 * (OPS-003, 2026-11-16) — pure, ohne ssh, damit sie sich testen lassen.
 *
 * Auf den Servern laufen zwei feste, nur lesende Skripte (ops/nginx-check.mjs,
 * ops/cron-check.sh). Sie geben Zeilen in fester Form aus; hier werden sie
 * gelesen und bewertet. WAS NICHT IN DIE FORM PASST, WIRD NICHT GELESEN — und
 * macht den Blick rot („antwortet nicht in der erwarteten Form"), statt dass
 * eine fremde Zeile ins öffentliche Protokoll des Laufs wandert.
 *
 * Rot ist nur, was jemand TUN muss: eine Pflicht-Zeile fehlt, eine
 * Schutz-Kopfzeile steht (wieder) im Webserver, eine Site oder ein Zeitplan
 * ist unbekannt, ein erwarteter Zeitplan fehlt. Ein Handgriff in Ploi
 * (Zertifikat, Alias) ändert die Datei, aber nicht diese Antworten.
 */

/** Dieselbe Liste wie in ops/nginx-check.mjs (ein Test hält beide zusammen). */
export const NGINX_RULES = [
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
  'auffangblock',
]

export const NGINX_CHECK_VERSION = 1
export const SERVERS = ['app-prod', 'appwrite-prod']
const RUNBOOK = 'Runbook PRODUKTIONS-ALARM.md, Abschnitt „Server-Einstellungen".'

const SITE_LINE = /^nginx site=([a-z0-9][a-z0-9.-]{2,80}) ergebnis=(passt|fehlt|zuviel)(?: regel=([a-z-]{2,40}))?$/
const TENANT_LINE = /^nginx kundendomain nr=(\d{1,4}) ergebnis=(fehlt|zuviel) regel=([a-z-]{2,40})$/
const CRON_LINE = /^cron server=(app-prod|appwrite-prod) quelle=(benutzer|system) erwartet=(\d{1,3}) gefunden=(\d{1,3}) fehlt=([a-z0-9,-]{1,255}) unbekannt=(\d{1,3}) doppelt=(\d{1,3})$/

/** Liest die Ausgabe von ops/nginx-check.mjs. Unbekannte Zeilen zählen als Störung. */
export function parseNginxOutput(text) {
  const result = { version: null, listed: null, sites: new Map(), tenants: null, tenantProblems: [], catchAll: null, unknown: null, complete: false, stray: 0 }
  if (typeof text !== 'string') return { problem: 'keine-antwort' }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let hit
    if ((hit = /^nginx version=(\d{1,3}) sites=(\d{1,3})$/.exec(line))) {
      result.version = Number(hit[1])
      result.listed = Number(hit[2])
    }
    else if ((hit = SITE_LINE.exec(line))) {
      const entry = result.sites.get(hit[1]) ?? { ok: false, missing: [], extra: [] }
      if (hit[2] === 'passt' && !hit[3]) entry.ok = true
      else if (hit[3] && NGINX_RULES.includes(hit[3])) (hit[2] === 'fehlt' ? entry.missing : entry.extra).push(hit[3])
      else result.stray++
      result.sites.set(hit[1], entry)
    }
    else if ((hit = TENANT_LINE.exec(line))) {
      if (NGINX_RULES.includes(hit[3])) result.tenantProblems.push({ nr: Number(hit[1]), kind: hit[2], rule: hit[3] })
      else result.stray++
    }
    else if ((hit = /^nginx kundendomains anzahl=(\d{1,4}) passt=(\d{1,4})$/.exec(line))) {
      result.tenants = { count: Number(hit[1]), ok: Number(hit[2]) }
    }
    else if ((hit = /^nginx auffangblock ergebnis=(passt|fehlt)$/.exec(line))) {
      result.catchAll = hit[1] === 'passt'
    }
    else if ((hit = /^nginx unbekannt anzahl=(\d{1,4})$/.exec(line))) {
      result.unknown = Number(hit[1])
    }
    else if (line === 'nginx fertig') {
      result.complete = true
    }
    else {
      result.stray++
    }
  }
  if (!result.complete || result.version === null) return { problem: 'unvollstaendig' }
  if (result.version !== NGINX_CHECK_VERSION) return { problem: 'version' }
  if (result.stray > 0 || result.tenants === null || result.catchAll === null || result.unknown === null) return { problem: 'form' }
  return result
}

/** Liest die Ausgabe von ops/cron-check.sh für EINEN Server (zwei Zeilen: benutzer, system). */
export function parseCronOutput(text, server) {
  if (typeof text !== 'string') return { problem: 'keine-antwort' }
  const sources = new Map()
  let stray = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const hit = CRON_LINE.exec(line)
    if (!hit || hit[1] !== server) {
      stray++
      continue
    }
    const missing = hit[5] === '-' ? [] : hit[5].split(',').filter(Boolean)
    sources.set(hit[2], { expected: Number(hit[3]), found: Number(hit[4]), missing, unknown: Number(hit[6]), double: Number(hit[7]) })
  }
  if (stray > 0) return { problem: 'form' }
  if (!sources.has('benutzer') || !sources.has('system')) return { problem: 'unvollstaendig' }
  return { sources }
}

const RULE_WORDS = {
  'site-datei': 'die Datei der Site fehlt auf dem Server',
  'proxy-block': 'die Site reicht nicht an die App weiter',
  'host': 'die Zeile, die den Namen der Seite an die App weiterreicht, fehlt',
  'client-adresse-real-ip': 'die Zeile X-Real-IP fehlt (die App sieht die Adresse des Aufrufers nicht)',
  'client-adresse-xff': 'die Zeile X-Forwarded-For fehlt (der Aufrufer kann seine Adresse selbst bestimmen)',
  'protokoll': 'die Zeile X-Forwarded-Proto fehlt',
  'frist': 'die Frist proxy_read_timeout fehlt oder ist länger als erlaubt (60s, lange Routen 180s)',
  'port': 'die Site zeigt nicht auf den Port aus ops/nginx-sites.conf',
  'feste-namen': 'server_name nennt keine festen Namen (oder der Block ist default_server)',
  'punkt-dateien': 'die Sperre für Dateien mit Punkt am Anfang fehlt',
  'zugriffs-log': 'das Zugriffs-Log ist nicht so eingestellt wie in ops/nginx-sites.conf',
  'schutz-kopfzeilen': 'der Webserver setzt eine Schutz-Kopfzeile selbst (add_header) — die sendet die App, hier käme sie doppelt; Zeile entfernen',
}

function sentenceForSite(site, kind, rule) {
  const what = RULE_WORDS[rule] ?? `Regel „${rule}"`
  const todo = kind === 'zuviel'
    ? 'nginx danach neu laden (reload, nie restart).'
    : 'Aus der Vorlage ops/nginx/ nachtragen, nginx neu laden (reload, nie restart).'
  return `Webserver-Einstellung ${site}: ${what}. ${todo} ${RUNBOOK}`
}

/** Bewertet den Webserver-Vergleich. `expectedSites` = Namen aus ops/nginx-sites.conf. */
export function evaluateNginx(parsed, expectedSites) {
  if (parsed.problem) {
    return [`Server-Einstellungen: das Prüf-Skript für den Webserver auf dem App-Server antwortet nicht in der erwarteten Form (${parsed.problem}). Ist es ausgeliefert (ops/nginx-check.mjs neben der Ecosystem-Datei) und passt die Version? ${RUNBOOK}`]
  }
  const red = []
  for (const site of expectedSites) {
    const entry = parsed.sites.get(site)
    if (!entry) {
      red.push(`Webserver-Einstellung ${site}: das Prüf-Skript nennt die Site nicht — die Liste auf dem Server ist älter als die im Repo (einmal ausliefern). ${RUNBOOK}`)
      continue
    }
    for (const rule of entry.missing) red.push(sentenceForSite(site, 'fehlt', rule))
    for (const rule of entry.extra) red.push(sentenceForSite(site, 'zuviel', rule))
    if (!entry.ok && entry.missing.length === 0 && entry.extra.length === 0) {
      red.push(`Webserver-Einstellung ${site}: kein Ergebnis. ${RUNBOOK}`)
    }
  }
  for (const problem of parsed.tenantProblems) {
    red.push(sentenceForSite(`einer Kundendomain (Nr. ${problem.nr}; den Namen zeigt auf dem Server \`node nginx-check.mjs --namen\`)`, problem.kind, problem.rule))
  }
  if (parsed.tenants.count !== parsed.tenants.ok && parsed.tenantProblems.length === 0) {
    red.push(`Webserver-Einstellung: ${parsed.tenants.count - parsed.tenants.ok} Kundendomain(s) ohne Ergebnis. ${RUNBOOK}`)
  }
  if (!parsed.catchAll) {
    red.push(`Webserver: der Auffangblock fehlt (unbekannte Namen müssen mit 444 enden, nicht in einer App). ${RUNBOOK}`)
  }
  if (parsed.unknown > 0) {
    red.push(`Webserver: ${parsed.unknown} Site-Datei(en) auf dem App-Server, die ops/nginx-sites.conf nicht kennt — eintragen (neue Site: docs/runbooks/NEUE-SITE.md) oder auf dem Server entfernen. Namen: \`node nginx-check.mjs --namen\`. ${RUNBOOK}`)
  }
  return red
}

/** Bewertet den Zeitplan-Vergleich eines Servers. */
export function evaluateCron(parsed, server) {
  if (parsed.problem) {
    return [`Server-Einstellungen: das Prüf-Skript für die Zeitpläne auf ${server} antwortet nicht in der erwarteten Form (${parsed.problem}). ${server === 'appwrite-prod' ? 'Kennt das Tor das Wort `cron-status`, liegen cron-check.sh und cron.conf in ~/ops/?' : 'Ist es ausgeliefert (ops/cron-check.sh neben der Ecosystem-Datei)?'} ${RUNBOOK}`]
  }
  const red = []
  for (const [source, entry] of parsed.sources) {
    const where = source === 'benutzer' ? 'crontab von ploi (`crontab -l`)' : '/etc/crontab (Ploi → Cronjobs)'
    for (const id of entry.missing) {
      red.push(`Zeitplan „${id}" fehlt auf ${server} — ${where}. Wieder anlegen wie in ops/cron.conf, oder dort streichen, wenn er wegfallen soll. ${RUNBOOK}`)
    }
    if (entry.unknown > 0) {
      red.push(`${entry.unknown} unbekannte(r) Zeitplan auf ${server} — ${where}. Auf dem Server ansehen; in ops/cron.conf eintragen oder entfernen. ${RUNBOOK}`)
    }
    if (entry.double > 0) {
      red.push(`${entry.double} Zeitplan/Zeitpläne stehen auf ${server} doppelt — ${where}. Den zweiten Eintrag entfernen. ${RUNBOOK}`)
    }
  }
  return red
}

/** Eine Zeile je Quelle für das Protokoll des Laufs (nur Zahlen und Namen aus dem Repo). */
export function summaryLines({ nginx, cron }) {
  const lines = []
  if (nginx.problem) lines.push(`  Webserver (app-prod): keine lesbare Antwort (${nginx.problem})`)
  else {
    const ok = [...nginx.sites.values()].filter(entry => entry.ok).length
    lines.push(`  Webserver (app-prod): ${ok} von ${nginx.sites.size} Sites tragen alle Pflicht-Zeilen · Kundendomains ${nginx.tenants.ok} von ${nginx.tenants.count} · unbekannte Dateien ${nginx.unknown}`)
  }
  for (const [server, parsed] of cron) {
    if (parsed.problem) {
      lines.push(`  Zeitpläne (${server}): keine lesbare Antwort (${parsed.problem})`)
      continue
    }
    for (const [source, entry] of parsed.sources) {
      lines.push(`  Zeitpläne (${server}, ${source}): ${entry.found} von ${entry.expected} da · unbekannt ${entry.unknown} · doppelt ${entry.double}`)
    }
  }
  return lines
}

/** Probealarm: täuscht EINE fehlende Pflicht-Zeile vor — auf dem Server fehlt nichts. */
export function drillNginx(parsed, site) {
  if (parsed.problem) return parsed
  const sites = new Map(parsed.sites)
  sites.set(site, { ok: false, missing: ['client-adresse-xff'], extra: [] })
  return { ...parsed, sites }
}
