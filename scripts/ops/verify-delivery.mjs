#!/usr/bin/env node
/**
 * Täglicher Blick „Kommt beim Browser an, was die App erzeugt?" (PERF-001,
 * SEO-001, SEO-005, FE-002 — 2026-11-20).
 *
 * WARUM ES IHN GIBT: vier Dinge waren monatelang falsch, und nichts wurde rot,
 * weil jeder Test nur prüft, was die App ERZEUGT — nicht, was am Ende
 * ausgeliefert wird:
 *   · Skripte kamen auf fünf von sechs öffentlichen Hosts ungepackt an (die
 *     Grundeinstellung des Webservers kannte ihren Dateityp nicht),
 *   · die robots.txt von pukalani.app beantwortete der Webserver selbst mit
 *     „nicht gefunden", ein Dienst davor setzte einen Text ohne Regeln ein,
 *   · zwei Sites hatten kein Vorschaubild für geteilte Links,
 *   · ein Symbol, das der Server nicht kennt, fragte der Browser bei einem
 *     fremden Dienst an.
 *
 * WAS GEPRÜFT WIRD, je öffentlichem Host, nur lesend von außen:
 *   1. `gepackt`    das erste Skript unter `/_nuxt/` aus dem HTML der Seite
 *                   kommt mit `content-encoding: br` oder `gzip` an
 *   2. `robots`     `/robots.txt` antwortet 200 als Text mit mindestens einer
 *                   Regel (`User-agent:` und `Allow:`/`Disallow:`); wo der Host
 *                   eine Sitemap hat, nennt die Datei sie mit dem EIGENEN
 *                   Host-Namen, und die Sitemap antwortet 200 als XML
 *   3. `vorschau`   die Seite trägt genau ein `og:image` mit absoluter
 *                   Adresse, und die Adresse antwortet 200 mit einem Bild
 *   5. `ki`         (Q11) die robots.txt sagt über KI-Crawler dasselbe wie die
 *                   Entscheidung B2 für die Art des Hosts (`ai` in `HOSTS`):
 *                   Content-Signal-Zeile, jeder Crawler aus
 *                   `packages/core/shared/aiCrawlers.ts` in seiner Gruppe mit
 *                   den Regeln seiner Art
 *   4. `symbole`    das HTML der Seite nennt den fremden Symbol-Dienst nicht,
 *                   und die Symbol-Route der App reicht eine Anfrage für ein
 *                   Paket, das sie nicht hat, NICHT an ihn weiter (sie
 *                   liefert kein Symbol — die Route ist die Stelle, an der
 *                   der Schalter `icon.fallbackToApi` von außen sichtbar ist)
 *
 * WELCHER HOST WAS SCHULDET, steht in `HOSTS`: die Betreiber-Oberfläche hat
 * keine Sitemap und kein Vorschaubild, der Kundenbereich keine Sitemap (seine
 * robots.txt sperrt alles), `platform.pukalani.app` ist kein Mandant und
 * beantwortet nur `/api/health` — der Host fehlt hier deshalb.
 *
 * ERST ZÄHLEN, DANN ALARM (`PUKALANI_DELIVERY_MODE`, im Workflow gesetzt):
 * `count` meldet jeden Befund als Zeile „Nur gezählt" und endet grün; `alarm`
 * endet rot. Ein Blick, der scharf ist, bevor die Hosts ihn bestehen, öffnet
 * jeden Tag ein Alarm-Issue.
 *
 * Braucht weder ssh noch ein Secret. Ein Host, der gerade nicht oder mit 5xx
 * antwortet, sagt hier NICHTS aus (zweiter Versuch nach 20 s, dann „keine
 * Aussage", nicht rot) — Erreichbarkeit meldet der Halbstunden-Blick.
 *
 *   node scripts/ops/verify-delivery.mjs [host]
 *
 * Probealarm: `PUKALANI_DELIVERY_DRILL=1` tut so, als käme das Skript des
 * ersten Hosts ungepackt an (an Production fehlt nichts).
 *
 * Exit: 0 grün (oder nur gezählt) · 1 rot · 2 Aufruf
 */
import { appendFileSync } from 'node:fs'
import https from 'node:https'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aiCrawlerPolicy, aiCrawlerRobotsProblems } from '../../packages/core/shared/aiCrawlers.ts'

/**
 * Je Host die Seite, die ohne Anmeldung 200 antwortet, und was er schuldet.
 * `sitemap: false` = der Host hat keine; `ogImage: false` = die Seite ist
 * keine, die jemand teilt (Anmeldung der Betreiber-Oberfläche).
 */
export const HOSTS = [
  { host: 'pukalani.app', page: '/', sitemap: true, ogImage: true, ai: 'own' },
  { host: 'account.pukalani.app', page: '/login', sitemap: false, ogImage: true, ai: 'own' },
  { host: 'demo.pukalani.app', page: '/', sitemap: true, ogImage: true, ai: 'community' },
  { host: 'admin.pukalani.app', page: '/login', sitemap: false, ogImage: false, ai: 'own' },
  { host: 'pukalani.studio', page: '/', sitemap: true, ogImage: true, ai: 'own' },
  { host: 'branding.supply', page: '/', sitemap: true, ogImage: true, ai: 'own' },
  { host: 'help.pukalani.app', page: '/', sitemap: true, ogImage: true, ai: 'own' },
]

/** Der Name, den keine Seite nennen soll. */
export const FOREIGN_ICON_HOST = 'api.iconify.design'

/**
 * Ein Symbol-Paket, das in KEINER App installiert ist. Die Symbol-Route
 * liefert dafür nichts — oder das Symbol, wenn sie die Anfrage an den fremden
 * Dienst weiterreicht. Wird dieses Paket je installiert, hier ein anderes nennen.
 */
export const ICON_PROBE_PATH = '/api/_nuxt_icon/mdi.json?icons=home'

const TIMEOUT_MS = 15_000
const RETRY_AFTER_MS = 20_000
const USER_AGENT = 'pukalani-verify-delivery'

// ─── Die Regeln, pur ────────────────────────────────────────────────────────

function header(headers, name) {
  const value = headers?.[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** Das erste Skript der Seite (`/_nuxt/….js`) — null, wenn die Seite keines nennt. */
export function firstScriptPath(html) {
  return /(?:src|href)="(\/_nuxt\/[A-Za-z0-9_./-]+\.js)"/.exec(html)?.[1] ?? null
}

/** Prüfung 1. `response`: `{ status, headers }` des Skripts, angefragt mit `Accept-Encoding: br, gzip`. */
export function checkCompressed(response) {
  if (!response || response.status !== 200) return ['gepackt: das Skript antwortet nicht mit 200']
  const encoding = header(response.headers, 'content-encoding').toLowerCase().trim()
  return encoding === 'br' || encoding === 'gzip' ? [] : ['gepackt: das Skript kommt ohne content-encoding an']
}

/** Die Sitemap-Adressen einer robots.txt (Zeilen `Sitemap: …`, Groß/klein egal). */
export function robotsSitemaps(body) {
  return body.split(/\r?\n/)
    .map(line => /^\s*sitemap:\s*(\S+)/i.exec(line)?.[1])
    .filter(Boolean)
}

/**
 * Prüfung 2, erster Teil: die Datei selbst. Gibt Befunde und — wenn verlangt
 * und vorhanden — die Sitemap-Adresse auf dem eigenen Host zurück.
 */
export function checkRobots(entry, response) {
  if (!response || response.status !== 200) return { problems: [`robots: /robots.txt antwortet ${response?.status ?? 'nicht'}`], sitemap: null }
  const problems = []
  if (!/^text\/plain\b/i.test(header(response.headers, 'content-type'))) problems.push('robots: /robots.txt ist kein Text')
  const lines = response.body.split(/\r?\n/).map(line => line.replace(/#.*$/, '').trim())
  const hasAgent = lines.some(line => /^user-agent:\s*\S/i.test(line))
  const hasRule = lines.some(line => /^(allow|disallow):/i.test(line))
  if (!hasAgent || !hasRule) problems.push('robots: /robots.txt enthält keine Regel (User-agent mit Allow oder Disallow)')
  if (!entry.sitemap) return { problems, sitemap: null }
  const own = robotsSitemaps(response.body).find((url) => {
    try {
      return new URL(url).host === entry.host
    }
    catch {
      return false
    }
  })
  if (!own) problems.push('robots: /robots.txt nennt keine Sitemap auf dem eigenen Host')
  return { problems, sitemap: own ?? null }
}

/**
 * Prüfung 5: sagt die robots.txt über KI-Crawler dasselbe wie die Entscheidung
 * B2 für diese Art von Host (`entry.ai`: `own` | `community`)? Die Prüfung
 * selbst steht neben der Regel (`aiCrawlerRobotsProblems`), damit Routen-Tests
 * und dieser Blick dieselbe Frage stellen. Eine robots.txt, die schon in
 * Prüfung 2 durchfällt, zählt hier nicht doppelt.
 */
export function checkAiCrawlers(entry, response) {
  if (!entry.ai || !response || response.status !== 200) return []
  const problems = aiCrawlerRobotsProblems(response.body, aiCrawlerPolicy(entry.ai))
  /**
   * DER OWNER WÄHLT DAS TRAINING (KC1): eine Community darf es im Dashboard
   * erlauben. Die Vorgabe („nein") wird zuerst geprüft; passt sie nicht, ist
   * auch die andere Wahl desselben Owners regelkonform — rot wird nur, was
   * zu KEINER der beiden passt (fehlender Crawler, falsche Suche-Zeile …).
   */
  if (problems.length > 0 && entry.ai === 'community'
    && aiCrawlerRobotsProblems(response.body, aiCrawlerPolicy('community', { training: true })).length === 0) {
    return []
  }
  return problems.map(problem => `ki: ${problem}`)
}

/** Prüfung 2, zweiter Teil: die genannte Sitemap. */
export function checkSitemap(response) {
  if (!response || response.status !== 200) return [`robots: die genannte Sitemap antwortet ${response?.status ?? 'nicht'}`]
  if (!/xml/i.test(header(response.headers, 'content-type')) || !/<(urlset|sitemapindex)\b/.test(response.body)) return ['robots: die genannte Sitemap ist kein XML']
  return []
}

/** Die `og:image`-Adressen im HTML (Reihenfolge der Attribute egal). */
export function ogImages(html) {
  const found = []
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bproperty=["']og:image["']/i.test(tag)) continue
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1]
    if (content !== undefined) found.push(content.replace(/&amp;/g, '&'))
  }
  return found
}

/** Prüfung 3, erster Teil: genau ein Bild, absolute https-Adresse. */
export function checkOgTag(html) {
  const images = ogImages(html)
  if (images.length === 0) return { problems: ['vorschau: die Seite trägt kein og:image'], url: null }
  if (images.length > 1) return { problems: [`vorschau: die Seite trägt ${images.length} og:image`], url: null }
  try {
    const url = new URL(images[0])
    if (url.protocol !== 'https:') return { problems: ['vorschau: og:image ist keine https-Adresse'], url: null }
    return { problems: [], url }
  }
  catch {
    return { problems: ['vorschau: og:image ist keine absolute Adresse'], url: null }
  }
}

/** Prüfung 3, zweiter Teil: die Bild-Adresse antwortet mit einem Bild. */
export function checkOgResponse(response) {
  if (!response || response.status !== 200) return [`vorschau: das Bild antwortet ${response?.status ?? 'nicht'}`]
  const type = header(response.headers, 'content-type')
  // SVG zeigen mehrere Vorschau-Dienste nicht an.
  if (!/^image\/(png|jpeg|webp)\b/i.test(type)) return ['vorschau: das Bild ist weder PNG noch JPEG noch WebP']
  return []
}

/**
 * Hat die Symbol-Route ein Symbol GELIEFERT? Der Status allein sagt es nicht:
 * die Route hält ihre Antworten eine Woche vor, und eine vorgehaltene
 * Ablehnung kommt beim zweiten Abruf mit Status 200 und dem Text
 * `{"statusCode":404}` zurück (gemessen 2026-11-20). Geliefert ist nur eine
 * Antwort, die wirklich Symbole trägt.
 */
export function iconProbeDelivered(probe) {
  if (!probe || probe.status !== 200) return false
  try {
    const data = JSON.parse(probe.body)
    return Boolean(data && typeof data.icons === 'object' && data.icons !== null && Object.keys(data.icons).length > 0)
  }
  catch {
    return false
  }
}

/** Prüfung 4. `probe`: Antwort der Symbol-Route für ein nicht installiertes Paket. */
export function checkForeignIcons(html, probe) {
  const problems = []
  if (html.includes(FOREIGN_ICON_HOST)) problems.push('symbole: die Seite nennt den fremden Symbol-Dienst')
  if (!probe) problems.push('symbole: die Symbol-Route antwortet nicht')
  else if (iconProbeDelivered(probe)) problems.push('symbole: die App reicht fehlende Symbole an den fremden Dienst weiter')
  else if (probe.status >= 500) problems.push(`symbole: die Symbol-Route antwortet ${probe.status}`)
  return problems
}

// ─── Abrufe ─────────────────────────────────────────────────────────────────

function get(url, { acceptEncoding = 'identity', wantBody = true } = {}) {
  return new Promise((done) => {
    const request = https.get(url, { headers: { 'user-agent': USER_AGENT, 'accept-encoding': acceptEncoding }, timeout: TIMEOUT_MS }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (wantBody && size <= 1_500_000) chunks.push(chunk)
      })
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => done(null))
  })
}

async function inspect(entry, { drill = false } = {}) {
  const origin = `https://${entry.host}`
  const page = await get(`${origin}${entry.page}`)
  if (!page || page.status !== 200) return { conclusive: false, problems: [] }
  const problems = []

  const script = firstScriptPath(page.body)
  if (!script) {
    problems.push('gepackt: die Seite nennt kein Skript unter /_nuxt/')
  }
  else {
    const file = await get(`${origin}${script}`, { acceptEncoding: 'br, gzip', wantBody: false })
    if (file && file.status >= 500) return { conclusive: false, problems: [] }
    problems.push(...checkCompressed(drill ? { status: 200, headers: {} } : file))
  }

  const robots = await get(`${origin}/robots.txt`)
  if (robots && robots.status >= 500) return { conclusive: false, problems: [] }
  const robotsResult = checkRobots(entry, robots)
  problems.push(...robotsResult.problems)
  problems.push(...checkAiCrawlers(entry, robots))
  if (robotsResult.sitemap) problems.push(...checkSitemap(await get(robotsResult.sitemap)))

  if (entry.ogImage) {
    const tag = checkOgTag(page.body)
    problems.push(...tag.problems)
    if (tag.url) problems.push(...checkOgResponse(await get(tag.url, { wantBody: false })))
  }

  problems.push(...checkForeignIcons(page.body, await get(`${origin}${ICON_PROBE_PATH}`)))
  return { conclusive: true, problems }
}

/** Was je Sorte Befund zu tun ist — steht im Alarm-Issue hinter dem Befund. */
export function adviceFor(problems) {
  const advice = []
  if (problems.some(p => p.startsWith('gepackt:'))) advice.push('„gepackt": die App legt beim Bauen gepackte Dateien an (`nitro.compressPublicAssets` im Core) — letzten Stand prüfen; steht es dort, entfernt etwas davor die Kopfzeile.')
  if (problems.some(p => p.startsWith('robots:'))) advice.push('„robots": antwortet der Webserver selbst (eigener Block für /robots.txt in der nginx-Datei der Site — entfernen, reload) oder fehlt der App die Route?')
  if (problems.some(p => p.startsWith('ki:'))) advice.push('„ki": die robots.txt weicht von der KI-Crawler-Regel ab (`packages/core/shared/aiCrawlers.ts`, DECISION-LOG 2026-11-21) — baut die Route der App mit `buildRobotsTxt()`, und ist der Stand ausgeliefert? Setzt ein Dienst davor (Cloudflare, „managed robots.txt") eigene Zeilen ein?')
  if (problems.some(p => p.startsWith('vorschau:'))) advice.push('„vorschau": das Bild trägt die `app.vue` der App über `useBrandOgImage()` ein; die Datei liegt unter `public/og/` oder kommt aus einer Route.')
  if (problems.some(p => p.startsWith('symbole:'))) advice.push('„symbole": `icon.fallbackToApi: false` im Core prüfen (`pnpm check:icons`).')
  return `Zu tun: ${advice.join(' ')} Runbook PRODUKTIONS-ALARM.md, Abschnitt „Auslieferung".`
}

async function main() {
  const only = process.argv[2]
  const hosts = only ? HOSTS.filter(entry => entry.host === only) : HOSTS
  if (hosts.length === 0) {
    console.error(`Kein Host "${only}". Bekannt: ${HOSTS.map(entry => entry.host).join(', ')}`)
    process.exit(2)
  }
  const mode = process.env.PUKALANI_DELIVERY_MODE === 'alarm' ? 'alarm' : 'count'
  const drill = process.env.PUKALANI_DELIVERY_DRILL === '1'
  console.log(`Kommt beim Browser an, was die App erzeugt? (gepackt · robots · ki · vorschau · symbole — Modus ${mode === 'alarm' ? 'Alarm' : 'nur zählen'})\n`)
  if (drill) console.log('PROBEALARM: das Skript des ersten Hosts gilt als ungepackt.\n')

  const failures = []
  for (const [index, entry] of hosts.entries()) {
    const options = { drill: drill && index === 0 }
    let result = await inspect(entry, options)
    if (!result.conclusive) {
      await new Promise(done => setTimeout(done, RETRY_AFTER_MS))
      result = await inspect(entry, options)
    }
    if (!result.conclusive) {
      console.log(`… ${entry.host.padEnd(24)} keine Aussage (antwortet nicht mit 200) — Erreichbarkeit meldet der Health-Blick`)
      continue
    }
    if (result.problems.length === 0) {
      const owes = ['gepackt', entry.sitemap ? 'robots mit Sitemap' : 'robots', ...(entry.ai ? [`ki (${entry.ai})`] : []), ...(entry.ogImage ? ['vorschau'] : []), 'symbole']
      console.log(`✔ ${entry.host.padEnd(24)} ${owes.join(' · ')}`)
      continue
    }
    console.log(`${mode === 'alarm' ? '✗' : '○'} ${entry.host.padEnd(24)} ${result.problems.join(' · ')}`)
    failures.push({ host: entry.host, problems: result.problems })
  }

  if (!failures.length) {
    console.log('\n✔ Nichts Rotes.')
    return
  }
  // Der Probealarm ist immer rot — sonst bewiese er im Zähl-Modus nichts.
  if (mode !== 'alarm' && !drill) {
    console.log(`\n○ Nur gezählt: ${failures.length} Host(s) mit Befund. Dieser Blick macht noch nichts rot (PUKALANI_DELIVERY_MODE=count).`)
    return
  }
  console.error(`\n✗ ${failures.length} Host(s), bei denen nicht ankommt, was die App erzeugt.`)
  if (process.env.PUKALANI_FINDINGS_FILE) {
    for (const failure of failures) {
      appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `Auslieferung: ${failure.host}: ${failure.problems.join(' · ').slice(0, 300)} ${adviceFor(failure.problems)}\n`)
    }
  }
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
