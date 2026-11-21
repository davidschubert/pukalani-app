import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FOREIGN_ICON_HOST,
  HOSTS,
  ICON_PROBE_PATH,
  adviceFor,
  checkAiCrawlers,
  checkCompressed,
  checkForeignIcons,
  checkOgResponse,
  checkOgTag,
  checkRobots,
  checkSitemap,
  firstScriptPath,
  iconProbeDelivered,
  ogImages,
  robotsSitemaps,
  // @ts-expect-error — reines .mjs ohne Typen (Betriebs-Skript)
} from '../../../scripts/ops/verify-delivery.mjs'
// @ts-expect-error — reines .mjs ohne Typen (Betriebs-Skript)
import { HOSTS as HEADER_HOSTS } from '../../../scripts/ops/verify-security-headers.mjs'
import { aiCrawlerPolicy, buildRobotsTxt } from '../shared/aiCrawlers'

/**
 * Der tägliche Blick „Kommt beim Browser an, was die App erzeugt?" (PERF-001,
 * SEO-001, SEO-005, FE-002). Hier wird die Bewertung an gestellten Antworten
 * geprüft — je Prüfung mit Gegenprobe, denn ein Blick, der nie rot wird, ist
 * keiner — und dass Workflow und Host-Liste zusammenpassen.
 */
const REPO = join(__dirname, '..', '..', '..')
const text = { 'content-type': 'text/plain; charset=utf-8' }
const site = { host: 'example.test', page: '/', sitemap: true, ogImage: true }

describe('1 · gepackt', () => {
  it('br und gzip bestehen', () => {
    expect(checkCompressed({ status: 200, headers: { 'content-encoding': 'br' } })).toEqual([])
    expect(checkCompressed({ status: 200, headers: { 'content-encoding': 'gzip' } })).toEqual([])
  })

  it('GEGENPROBE: ohne content-encoding, mit 404 oder ohne Antwort ist es ein Befund', () => {
    expect(checkCompressed({ status: 200, headers: {} })).toHaveLength(1)
    expect(checkCompressed({ status: 404, headers: { 'content-encoding': 'br' } })).toHaveLength(1)
    expect(checkCompressed(null)).toHaveLength(1)
  })

  it('findet das erste Skript der Seite', () => {
    expect(firstScriptPath('<link rel="modulepreload" href="/_nuxt/Ab_c-1.js"><script src="/_nuxt/x.js">')).toBe('/_nuxt/Ab_c-1.js')
    expect(firstScriptPath('<p>ohne Skript</p>')).toBeNull()
  })
})

describe('5 · ki (Q11)', () => {
  const rules = ['Allow: /', 'Disallow: /api/']
  const community = buildRobotsTxt({ policy: aiCrawlerPolicy('community'), rules })

  it('eine robots.txt nach der Regel ihrer Art besteht', () => {
    expect(checkAiCrawlers({ ...site, ai: 'community' }, { status: 200, headers: text, body: community })).toEqual([])
  })

  it('GEGENPROBE: die Community-Datei auf einem eigenen Host und die alte Datei ohne KI-Gruppen sind Befunde', () => {
    expect(checkAiCrawlers({ ...site, ai: 'own' }, { status: 200, headers: text, body: community })).toContain('ki: GPTBot: nicht dieselben Regeln wie *')
    const old = 'User-agent: *\nAllow: /\nDisallow: /api/\n'
    expect(checkAiCrawlers({ ...site, ai: 'community' }, { status: 200, headers: text, body: old }).length).toBeGreaterThan(1)
    expect(adviceFor(['ki: x'])).toContain('aiCrawlers.ts')
  })

  it('ohne Art oder ohne 200 keine doppelte Meldung', () => {
    expect(checkAiCrawlers(site, { status: 200, headers: text, body: 'x' })).toEqual([])
    expect(checkAiCrawlers({ ...site, ai: 'own' }, { status: 404, headers: text, body: '' })).toEqual([])
  })

  it('jeder Host nennt seine Art; Communities sind community, alle anderen own', () => {
    for (const entry of HOSTS as Array<{ host: string, ai?: string }>) {
      expect(entry.ai, entry.host).toBe(entry.host === 'demo.pukalani.app' ? 'community' : 'own')
    }
  })
})

describe('2 · robots', () => {
  const good = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://example.test/sitemap.xml\n'

  it('Regeln und Sitemap auf dem eigenen Host bestehen', () => {
    expect(checkRobots(site, { status: 200, headers: text, body: good })).toEqual({
      problems: [],
      sitemap: 'https://example.test/sitemap.xml',
    })
  })

  it('GEGENPROBE: ein Kommentarblock ohne Regel und ohne Sitemap — so stand es auf der Landing', () => {
    const body = '# As a condition of accessing this website, you agree to the content signals below.\n# User-agent: *\n# Allow: /\n'
    const result = checkRobots(site, { status: 200, headers: text, body })
    expect(result.problems).toHaveLength(2)
    expect(result.sitemap).toBeNull()
  })

  it('GEGENPROBE: 404, HTML statt Text, Sitemap auf fremdem Host', () => {
    expect(checkRobots(site, { status: 404, headers: text, body: '' }).problems).toHaveLength(1)
    expect(checkRobots(site, { status: 200, headers: { 'content-type': 'text/html' }, body: good }).problems).toEqual(['robots: /robots.txt ist kein Text'])
    expect(checkRobots(site, { status: 200, headers: text, body: good.replace('example.test', 'other.test') }).problems).toEqual(['robots: /robots.txt nennt keine Sitemap auf dem eigenen Host'])
  })

  it('ein Host ohne Sitemap schuldet nur Regeln', () => {
    const closed = { ...site, sitemap: false }
    expect(checkRobots(closed, { status: 200, headers: text, body: 'User-agent: *\nDisallow: /\n' }).problems).toEqual([])
    expect(checkRobots(closed, { status: 200, headers: text, body: 'User-agent: *\n' }).problems).toHaveLength(1)
  })

  it('liest Sitemap-Zeilen in jeder Schreibweise', () => {
    expect(robotsSitemaps('sitemap: https://a.test/s.xml\r\nSITEMAP:https://a.test/t.xml')).toEqual(['https://a.test/s.xml', 'https://a.test/t.xml'])
  })

  it('die Sitemap muss 200 und XML sein', () => {
    expect(checkSitemap({ status: 200, headers: { 'content-type': 'application/xml' }, body: '<urlset xmlns="x"></urlset>' })).toEqual([])
    expect(checkSitemap({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>' })).toHaveLength(1)
    expect(checkSitemap({ status: 404, headers: {}, body: '' })).toHaveLength(1)
  })
})

describe('3 · vorschau', () => {
  it('genau ein og:image mit absoluter https-Adresse besteht — Reihenfolge der Attribute egal', () => {
    expect(checkOgTag('<meta property="og:image" content="https://example.test/og/a.png">').problems).toEqual([])
    expect(ogImages('<meta content="https://example.test/a.png?x=1&amp;y=2" property="og:image">')).toEqual(['https://example.test/a.png?x=1&y=2'])
  })

  it('og:image:width und og:image:alt zählen nicht als Bild', () => {
    expect(ogImages('<meta property="og:image:width" content="1200"><meta property="og:image:alt" content="x">')).toEqual([])
  })

  it('GEGENPROBE: keines, zwei, relativ oder http ist ein Befund', () => {
    expect(checkOgTag('<meta property="og:title" content="x">').problems).toHaveLength(1)
    expect(checkOgTag('<meta property="og:image" content="https://a.test/1.png"><meta property="og:image" content="https://a.test/2.png">').problems).toHaveLength(1)
    expect(checkOgTag('<meta property="og:image" content="/og/a.png">').problems).toHaveLength(1)
    expect(checkOgTag('<meta property="og:image" content="http://a.test/a.png">').problems).toHaveLength(1)
  })

  it('das Bild muss 200 und PNG, JPEG oder WebP sein — kein SVG', () => {
    expect(checkOgResponse({ status: 200, headers: { 'content-type': 'image/png' } })).toEqual([])
    expect(checkOgResponse({ status: 200, headers: { 'content-type': 'image/jpeg' } })).toEqual([])
    expect(checkOgResponse({ status: 200, headers: { 'content-type': 'image/svg+xml' } })).toHaveLength(1)
    expect(checkOgResponse({ status: 404, headers: {} })).toHaveLength(1)
  })
})

describe('4 · symbole', () => {
  const delivered = { status: 200, body: '{"prefix":"mdi","icons":{"home":{"body":"<path/>"}},"width":24,"height":24}' }

  it('die Route lehnt ein fremdes Paket ab, die Seite nennt den Dienst nicht', () => {
    expect(checkForeignIcons('<html><span class="iconify i-ph:x"></span></html>', { status: 404, body: '' })).toEqual([])
  })

  it('eine VORGEHALTENE Ablehnung kommt mit Status 200 zurück — sie ist trotzdem eine Ablehnung', () => {
    // So antwortet die Route beim zweiten Abruf derselben Adresse (gemessen).
    const cached = { status: 200, body: '{"message":"","statusCode":404}' }
    expect(iconProbeDelivered(cached)).toBe(false)
    expect(checkForeignIcons('<html></html>', cached)).toEqual([])
    expect(checkForeignIcons('<html></html>', { status: 200, body: '{"prefix":"mdi","icons":{},"not_found":["home"]}' })).toEqual([])
  })

  it('GEGENPROBE: eine Antwort MIT Symbol heißt, die App hat beim fremden Dienst nachgefragt', () => {
    expect(iconProbeDelivered(delivered)).toBe(true)
    expect(checkForeignIcons('<html></html>', delivered)).toEqual(['symbole: die App reicht fehlende Symbole an den fremden Dienst weiter'])
  })

  it('GEGENPROBE: der Name im HTML, eine 5xx oder keine Antwort', () => {
    expect(checkForeignIcons(`<link href="https://${FOREIGN_ICON_HOST}">`, { status: 404, body: '' })).toHaveLength(1)
    expect(checkForeignIcons('<html></html>', { status: 502, body: '' })).toHaveLength(1)
    expect(checkForeignIcons('<html></html>', null)).toHaveLength(1)
  })

  it('das Probe-Paket ist in keiner App installiert (sonst antwortete die Route immer 200)', () => {
    const prefix = /_nuxt_icon\/([a-z0-9-]+)\.json/.exec(ICON_PROBE_PATH)?.[1]
    expect(prefix).toBeTruthy()
    expect(readFileSync(join(REPO, 'pnpm-lock.yaml'), 'utf8')).not.toContain(`@iconify-json/${prefix}@`)
  })
})

describe('Bindung an Hosts und Workflow', () => {
  it('jeder Host mit einer Seite aus dem Kopfzeilen-Blick ist auch hier, mit derselben Seite', () => {
    const expected = (HEADER_HOSTS as Array<{ host: string, page: string | null }>).filter(entry => entry.page !== null)
    const here = new Map((HOSTS as Array<{ host: string, page: string }>).map(entry => [entry.host, entry.page]))
    for (const entry of expected) {
      expect(here.get(entry.host), `${entry.host} fehlt in verify-delivery`).toBe(entry.page)
    }
    expect(here.size).toBe(expected.length)
  })

  it('der Workflow fährt den Blick im täglichen Teil, mit Befund-Datei, Modus und Probealarm', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/production-watch.yml'), 'utf8')
    expect(workflow).toContain('run: node scripts/ops/verify-delivery.mjs')
    expect(workflow).toMatch(/PUKALANI_DELIVERY_MODE: (count|alarm)\n/)
    expect(workflow).toContain('PUKALANI_DELIVERY_DRILL: ${{ inputs.delivery_drill && \'1\' || \'0\' }}')
    expect(workflow).toMatch(/delivery_drill:\n\s+description:/)
  })

  it('zu jeder Sorte Befund steht im Alarm, was zu tun ist', () => {
    const advice = adviceFor(['gepackt: x', 'robots: y', 'vorschau: z', 'symbole: w'])
    for (const word of ['„gepackt"', '„robots"', '„vorschau"', '„symbole"', 'PRODUKTIONS-ALARM.md']) {
      expect(advice).toContain(word)
    }
    expect(adviceFor(['robots: y'])).not.toContain('„gepackt"')
  })
})
