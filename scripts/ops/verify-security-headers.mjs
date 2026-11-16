#!/usr/bin/env node
/**
 * Täglicher Blick „Schutz-Kopfzeilen auf jedem Host genau einmal?" (SEC-006,
 * 2026-11-16).
 *
 * WARUM ES IHN GIBT: bis dahin setzte jeder Webserver die Schutz-Kopfzeilen
 * von Hand — zwei Hosts hatten drei davon, sechs keine, HSTS keiner. Seitdem
 * setzt die App sie für jede Antwort gleich
 * (packages/core/server/plugins/security-headers.ts). Was ein Test im Repo
 * NICHT sehen kann, ist der Weg dahinter: ein Webserver, der eine Kopfzeile
 * (wieder) selbst setzt — dann kommt sie doppelt —, oder eine App, die sie
 * nach einem Umbau nicht mehr sendet. Beides sieht man nur an der echten
 * Antwort. Dateien (`/_nuxt/*`) liefert außerdem nur der Build über Nitro aus;
 * im Dev-Server der E2E-Suite tragen sie die Kopfzeilen nicht.
 *
 * WAS GEPRÜFT WIRD, je Host an drei Antworten (eine Seite, `/api/health`, das
 * erste Skript unter `/_nuxt/` aus dem HTML der Seite):
 *   · `x-content-type-options`, `referrer-policy`, `permissions-policy`,
 *     `strict-transport-security`: jede GENAU EINMAL (roh gezählt — `fetch`
 *     fasst doppelte Kopfzeilen zusammen und sähe einen Doppelten nie)
 *   · HSTS mit einer Dauer von mindestens einem Tag
 *   · KEIN `x-powered-by`, KEIN `x-frame-options`, KEIN `x-xss-protection`
 *     (die drei setzte früher der Webserver bzw. Nuxt; das Einbetten regelt
 *     allein `frame-ancestors`)
 *   · die Seite trägt genau eine `content-security-policy` mit `frame-ancestors`
 *
 * EINE DATEI AUS EINEM ZWISCHENSPEICHER SAGT NICHTS AUS (gemessen 2026-11-16
 * an pukalani.app, dem einen Host hinter Cloudflare): `/_nuxt/*` ist ein Jahr
 * lang cachebar, und Cloudflare liefert eine unveränderte Datei mit den
 * Kopfzeilen aus, die sie beim ERSTEN Abruf hatte — also noch mit denen des
 * alten Webservers, bis die Datei sich ändert. Trägt die Antwort
 * `cf-cache-status: HIT`, wird die Datei deshalb nicht bewertet (die Seite
 * und `/api/health` desselben Hosts schon: sie werden nicht zwischengespeichert).
 *
 * Braucht weder ssh noch ein Secret; liest nur öffentliche Antworten.
 * Ein Host, der gerade nicht oder mit 5xx antwortet, sagt hier NICHTS aus
 * (zweiter Versuch nach 20 s, dann „keine Aussage", nicht rot) — Erreichbarkeit
 * meldet der Halbstunden-Blick (`verify-health.mjs`), nicht dieser.
 *
 *   node scripts/ops/verify-security-headers.mjs [host]
 *
 * Exit: 0 grün · 1 rot · 2 Aufruf
 */
import { appendFileSync } from 'node:fs'
import https from 'node:https'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Je Host die Seite, die ohne Anmeldung 200 antwortet. `platform` beantwortet
 * nur `/api/health` (jede Seite dort ist 404 — der Host ist kein Mandant).
 */
export const HOSTS = [
  { host: 'pukalani.app', page: '/' },
  { host: 'platform.pukalani.app', page: null },
  { host: 'account.pukalani.app', page: '/login' },
  { host: 'demo.pukalani.app', page: '/' },
  { host: 'admin.pukalani.app', page: '/login' },
  { host: 'pukalani.studio', page: '/' },
  { host: 'branding.supply', page: '/' },
  { host: 'help.pukalani.app', page: '/' },
]

export const ONCE = ['x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']
export const NEVER = ['x-powered-by', 'x-frame-options', 'x-xss-protection']
export const MIN_HSTS_SECONDS = 86400
const TIMEOUT_MS = 15_000
const RETRY_AFTER_MS = 20_000

/** Roh-Kopfzeilen (`[name, wert, name, wert, …]`) → Werte je Name, klein geschrieben. */
export function headerValues(rawHeaders) {
  const map = new Map()
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const name = String(rawHeaders[i]).toLowerCase()
    map.set(name, [...(map.get(name) ?? []), String(rawHeaders[i + 1])])
  }
  return map
}

/**
 * Bewertet EINE Antwort. `kind`: 'page' | 'api' | 'file'.
 * Gibt die Befunde als kurze Wörter zurück (leer = in Ordnung).
 */
export function classifyResponse(kind, rawHeaders) {
  const values = headerValues(rawHeaders)
  const problems = []
  for (const name of ONCE) {
    // Ein Proxy darf zwei gleichnamige Zeilen zu „a, b" zusammenziehen — auch das ist doppelt.
    const list = (values.get(name) ?? []).flatMap(value => (name === 'permissions-policy' ? [value] : value.split(',').map(part => part.trim())))
    if (list.length === 0) problems.push(`${name} fehlt`)
    else if (list.length > 1) problems.push(`${name} kommt ${list.length}-mal`)
  }
  const hsts = (values.get('strict-transport-security') ?? [])[0] ?? ''
  const maxAge = /(?:^|;\s*)max-age=(\d+)/i.exec(hsts)
  if (hsts && (!maxAge || Number(maxAge[1]) < MIN_HSTS_SECONDS)) problems.push('strict-transport-security ohne gültige Dauer')
  if ((values.get('x-content-type-options') ?? [])[0] && !/^nosniff\b/i.test(values.get('x-content-type-options')[0])) problems.push('x-content-type-options ist nicht nosniff')
  for (const name of NEVER) {
    if (values.has(name)) problems.push(`${name} wird gesendet`)
  }
  if (kind === 'page') {
    const csp = values.get('content-security-policy') ?? []
    if (csp.length !== 1 || !/frame-ancestors /.test(csp[0])) problems.push('content-security-policy mit frame-ancestors fehlt oder kommt mehrfach')
  }
  return problems
}

/** Kam die Antwort aus dem Zwischenspeicher eines vorgeschalteten Netzes? */
export function servedFromSharedCache(rawHeaders) {
  const status = (headerValues(rawHeaders).get('cf-cache-status') ?? [])[0] ?? ''
  return /^(HIT|STALE|REVALIDATED|UPDATING)$/i.test(status.trim())
}

function get(host, path) {
  return new Promise((done) => {
    const request = https.get({ host, path, headers: { 'user-agent': 'pukalani-verify-security-headers' }, timeout: TIMEOUT_MS }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size <= 600_000) chunks.push(chunk)
      })
      res.on('end', () => done({ status: res.statusCode ?? 0, rawHeaders: res.rawHeaders, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => done(null))
  })
}

async function inspect(entry) {
  const targets = []
  let asset = null
  if (entry.page) {
    const page = await get(entry.host, entry.page)
    if (!page || page.status !== 200) return { conclusive: false, problems: [] }
    targets.push({ kind: 'page', path: entry.page, rawHeaders: page.rawHeaders })
    asset = /(?:src|href)="(\/_nuxt\/[A-Za-z0-9_./-]+\.js)"/.exec(page.body)?.[1] ?? null
  }
  const api = await get(entry.host, '/api/health')
  if (!api || api.status !== 200) return { conclusive: false, problems: [] }
  targets.push({ kind: 'api', path: '/api/health', rawHeaders: api.rawHeaders })
  if (asset) {
    const file = await get(entry.host, asset)
    if (!file || file.status !== 200) return { conclusive: false, problems: [] }
    if (!servedFromSharedCache(file.rawHeaders)) targets.push({ kind: 'file', path: '/_nuxt/…', rawHeaders: file.rawHeaders })
  }
  const problems = targets.flatMap(target => classifyResponse(target.kind, target.rawHeaders).map(problem => `${target.path}: ${problem}`))
  return { conclusive: true, problems, checked: targets.length }
}

async function main() {
  const only = process.argv[2]
  const hosts = only ? HOSTS.filter(entry => entry.host === only) : HOSTS
  if (hosts.length === 0) {
    console.error(`Kein Host "${only}". Bekannt: ${HOSTS.map(entry => entry.host).join(', ')}`)
    process.exit(2)
  }
  console.log('Schutz-Kopfzeilen auf jedem Host genau einmal?\n')
  const failures = []
  for (const entry of hosts) {
    let result = await inspect(entry)
    if (!result.conclusive) {
      await new Promise(done => setTimeout(done, RETRY_AFTER_MS))
      result = await inspect(entry)
    }
    if (!result.conclusive) {
      console.log(`… ${entry.host.padEnd(24)} keine Aussage (antwortet nicht mit 200) — Erreichbarkeit meldet der Health-Blick`)
      continue
    }
    if (result.problems.length === 0) {
      console.log(`✔ ${entry.host.padEnd(24)} ${result.checked} Antworten, jede Kopfzeile genau einmal`)
      continue
    }
    console.log(`✗ ${entry.host.padEnd(24)} ${result.problems.join(' · ')}`)
    failures.push(`${entry.host}: ${result.problems.join(' · ')}`)
  }
  if (!failures.length) {
    console.log('\n✔ Nichts Rotes.')
    return
  }
  console.error(`\n✗ ${failures.length} Host(s) mit fehlenden oder doppelten Schutz-Kopfzeilen.`)
  if (process.env.PUKALANI_FINDINGS_FILE) {
    for (const failure of failures) {
      appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `Schutz-Kopfzeilen: ${failure.slice(0, 300)} Zu tun: „kommt 2-mal" oder „wird gesendet" heißt, der Webserver setzt die Kopfzeile selbst (add_header in der nginx-Datei der Site entfernen, reload); „fehlt" heißt, die App sendet sie nicht (letzten Stand prüfen). Runbook PRODUKTIONS-ALARM.md, Abschnitt „Schutz-Kopfzeilen".\n`)
    }
  }
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
