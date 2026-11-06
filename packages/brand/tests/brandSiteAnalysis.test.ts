import { describe, expect, it } from 'vitest'
import {
  BRAND_SITE_ANALYSIS_MAX_BYTES,
  BRAND_SITE_ANALYSIS_MAX_REDIRECTS,
  BRAND_SITE_ANALYSIS_MAX_TEXT,
  BRAND_SITE_ANALYSIS_PROMPT_MAX,
  allIpsAllowed,
  analyzableUrl,
  composeSiteAnalysis,
  contentTypeIsHtml,
  exceedsByteBudget,
  extractSiteContent,
  ipIsForbidden,
  isRedirectStatus,
  redirectBudgetLeft,
  redirectTarget,
  siteAnalysisIsStale,
} from '../shared/brandSiteAnalysis'

/**
 * DER SSRF-VERTRAG DER URL-ANALYSE — der einzige Ort, an dem er nachprüfbar ist.
 *
 * WARUM SO VIELE FÄLLE: die gefährlichen Adressen sind genau die, die im Alltag
 * nie vorkommen. `169.254.169.254` ist die Metadaten-Adresse jeder grossen
 * Cloud (dort liegen Zugangsdaten), `::ffff:127.0.0.1` ist dieselbe Loopback in
 * v6-Kleidung, `0.0.0.0` ist auf Linux ebenfalls „hier", und ein
 * `Location:`-Kopf springt an jeder Prüfung vorbei, die nur die EINGEREICHTE
 * Adresse ansieht. Ein Schutz, der 90 % dieser Fälle kennt, ist kein Schutz —
 * ein einziges Loch genügt.
 *
 * KEIN EINZIGER NETZ-AUFRUF: alles hier sind Zeichenketten. Der Transport
 * (`server/utils/brandSiteFetch.ts`) hat keine eigene Meinung mehr; er ruft
 * genau diese Funktionen, und zwar vor UND nach dem Verbinden.
 */

describe('analyzableUrl — Schema und Port', () => {
  it.each([
    'https://example.com',
    'https://example.com/pfad?q=1',
    'http://example.com',
    'https://example.com:443/',
    'http://example.com:80/',
    'https://sub.example.co.uk/über-uns',
  ])('erlaubt %s', (value) => {
    expect(analyzableUrl(value)).not.toBeNull()
  })

  it.each([
    ['ftp://example.com', 'fremdes Schema'],
    ['javascript:alert(1)', 'kein Netzwerk-Schema, aber ein beliebtes'],
    ['data:text/html,hi', 'trägt seinen Inhalt selbst'],
    ['file:///etc/passwd', 'lokale Datei'],
    ['gopher://example.com/1', 'kann fremde Protokolle sprechen'],
    ['//example.com', 'ohne Schema gar keine URL'],
    ['example.com', 'blosser Name'],
    ['', 'leer'],
    ['   ', 'nur Leerzeichen'],
    ['https://example.com:8080/', 'Nicht-Standard-Port'],
    ['http://example.com:6379/', 'Redis'],
    ['https://user:pass@example.com/', 'Zugangsdaten in der Adresse'],
  ])('weist %s ab (%s)', (value) => {
    expect(analyzableUrl(value)).toBeNull()
  })
})

describe('ipIsForbidden — IPv4', () => {
  it.each([
    ['127.0.0.1', 'Loopback'],
    ['127.1.2.3', 'die ganze /8'],
    ['0.0.0.0', 'auf Linux dasselbe wie localhost'],
    ['10.0.0.1', 'RFC1918'],
    ['172.16.0.1', 'RFC1918 Untergrenze'],
    ['172.31.255.254', 'RFC1918 Obergrenze'],
    ['192.168.1.1', 'RFC1918'],
    ['169.254.1.1', 'Link-Local'],
    ['169.254.169.254', 'Cloud-Metadaten — der Klassiker'],
    ['100.64.0.1', 'Carrier-NAT'],
    ['198.18.0.1', 'Benchmark-Netz'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['198.51.100.7', 'TEST-NET-2'],
    ['203.0.113.7', 'TEST-NET-3'],
    ['224.0.0.1', 'Multicast'],
    ['255.255.255.255', 'Broadcast'],
    ['0177.0.0.1', 'oktale Schreibweise — für uns unlesbar, also verboten'],
    ['not-an-ip', 'unlesbar ⇒ fail-closed'],
    ['', 'leer ⇒ fail-closed'],
  ])('verbietet %s (%s)', (ip) => {
    expect(ipIsForbidden(ip)).toBe(true)
  })

  it.each([
    ['93.184.216.34', 'öffentlich'],
    ['8.8.8.8', 'öffentlich'],
    ['172.15.255.255', 'knapp UNTER dem RFC1918-Block'],
    ['172.32.0.1', 'knapp ÜBER dem RFC1918-Block'],
    ['100.63.255.255', 'knapp unter CGNAT'],
    ['100.128.0.1', 'knapp über CGNAT'],
    ['1.1.1.1', 'öffentlich'],
  ])('erlaubt %s (%s)', (ip) => {
    expect(ipIsForbidden(ip)).toBe(false)
  })
})

describe('ipIsForbidden — IPv6', () => {
  it.each([
    ['::1', 'Loopback'],
    ['::', 'unspezifiziert'],
    ['fe80::1', 'Link-Local'],
    ['fe80::abcd:1234:5678:9abc', 'Link-Local, ausgeschrieben'],
    ['fc00::1', 'ULA'],
    ['fd12:3456:789a::1', 'ULA (fd..)'],
    ['ff02::1', 'Multicast'],
    ['2001:db8::1', 'Doku-Präfix'],
    ['::ffff:127.0.0.1', 'v4-mapped Loopback — die Falle'],
    ['::ffff:169.254.169.254', 'v4-mapped Cloud-Metadaten'],
    ['::ffff:10.0.0.1', 'v4-mapped RFC1918'],
    ['64:ff9b::127.0.0.1', 'NAT64 auf Loopback'],
    ['fe80::1%eth0', 'Zonen-Index gehört nicht in eine Zieladresse'],
    ['gg::1', 'unlesbar ⇒ fail-closed'],
  ])('verbietet %s (%s)', (ip) => {
    expect(ipIsForbidden(ip)).toBe(true)
  })

  it.each([
    ['2606:4700:4700::1111', 'öffentlich (Cloudflare)'],
    ['2a00:1450:4001:80e::200e', 'öffentlich (Google)'],
    ['::ffff:93.184.216.34', 'v4-mapped, aber öffentlich'],
  ])('erlaubt %s (%s)', (ip) => {
    expect(ipIsForbidden(ip)).toBe(false)
  })
})

describe('allIpsAllowed — eine verbotene genügt', () => {
  it('lässt eine Liste nur durch, wenn JEDE Adresse erlaubt ist', () => {
    expect(allIpsAllowed(['93.184.216.34', '2606:4700::1111'])).toBe(true)
    // Der Angriff heisst „ein Name, zwei A-Records": ohne diese Regel gewönne
    // jeder zweite Verbindungsversuch.
    expect(allIpsAllowed(['93.184.216.34', '127.0.0.1'])).toBe(false)
  })

  it('sagt bei LEERER Liste Nein — nichts aufgelöst ist kein Freibrief', () => {
    expect(allIpsAllowed([])).toBe(false)
  })
})

describe('Weiterleitungen', () => {
  const base = new URL('https://example.com/start')

  it('erkennt die fünf Weiterleitungs-Status', () => {
    for (const status of [301, 302, 303, 307, 308]) expect(isRedirectStatus(status)).toBe(true)
    for (const status of [200, 204, 304, 404, 500]) expect(isRedirectStatus(status)).toBe(false)
  })

  it('zählt höchstens drei Sprünge', () => {
    expect(BRAND_SITE_ANALYSIS_MAX_REDIRECTS).toBe(3)
    expect(redirectBudgetLeft(0)).toBe(true)
    expect(redirectBudgetLeft(2)).toBe(true)
    expect(redirectBudgetLeft(3)).toBe(false)
  })

  it('löst relative Ziele auf', () => {
    expect(redirectTarget('/ueber-uns', base)?.toString()).toBe('https://example.com/ueber-uns')
    expect(redirectTarget('https://www.example.com/', base)?.toString()).toBe('https://www.example.com/')
  })

  it('prüft das SPRUNGZIEL wie eine neue Eingabe', () => {
    // Genau hier rutschen Prüfungen durch, die nur die eingereichte Adresse
    // ansehen: der Angreifer besitzt example.com und antwortet mit einem
    // Location-Kopf auf die Metadaten-Adresse.
    expect(redirectTarget('http://169.254.169.254/latest/meta-data/', base)).not.toBeNull()
    expect(ipIsForbidden(redirectTarget('http://169.254.169.254/', base)!.hostname)).toBe(true)
    expect(redirectTarget('file:///etc/passwd', base)).toBeNull()
    expect(redirectTarget('http://example.com:9200/', base)).toBeNull()
    expect(redirectTarget(undefined, base)).toBeNull()
    expect(redirectTarget('', base)).toBeNull()
  })
})

describe('Content-Type und Grösse', () => {
  it('lässt nur HTML durch', () => {
    expect(contentTypeIsHtml('text/html')).toBe(true)
    expect(contentTypeIsHtml('text/html; charset=utf-8')).toBe(true)
    expect(contentTypeIsHtml('application/xhtml+xml')).toBe(true)
    expect(contentTypeIsHtml('application/pdf')).toBe(false)
    expect(contentTypeIsHtml('image/png')).toBe(false)
    expect(contentTypeIsHtml('application/octet-stream')).toBe(false)
    // Fehlender Header ⇒ Nein. Strenger als ein Browser, und hier richtig.
    expect(contentTypeIsHtml(undefined)).toBe(false)
    expect(contentTypeIsHtml('')).toBe(false)
  })

  it('deckelt bei zwei Megabyte — roh wie entpackt', () => {
    expect(BRAND_SITE_ANALYSIS_MAX_BYTES).toBe(2_000_000)
    expect(exceedsByteBudget(BRAND_SITE_ANALYSIS_MAX_BYTES)).toBe(false)
    expect(exceedsByteBudget(BRAND_SITE_ANALYSIS_MAX_BYTES + 1)).toBe(true)
    expect(exceedsByteBudget(0)).toBe(false)
  })
})

describe('Text-Extraktion', () => {
  it('holt Titel und Meta-Beschreibung', () => {
    const html = `<html><head><title>Kailua Coffee &amp; Co.</title>
      <meta name="description" content="Kaffee aus Kailua &mdash; frisch geröstet">
      </head><body><p>Hallo</p></body></html>`
    const content = extractSiteContent(html)
    expect(content.title).toBe('Kailua Coffee & Co.')
    // `&mdash;` steht nicht in der kleinen Namensliste des Core-Dekodierers und
    // bleibt deshalb sichtbarer Text — die sichere Richtung (lieber anzeigen
    // als raten), dokumentiert in core/shared/markdown.ts.
    expect(content.description).toContain('Kaffee aus Kailua')
  })

  it('nimmt og:description nur, wenn es keine echte Beschreibung gibt', () => {
    const nurOg = extractSiteContent('<meta property="og:description" content="Aus dem OG-Feld">')
    expect(nurOg.description).toBe('Aus dem OG-Feld')
    const beide = extractSiteContent(
      '<meta name="description" content="Echt"><meta property="og:description" content="OG">',
    )
    expect(beide.description).toBe('Echt')
  })

  it('wirft script, style, noscript und template samt Inhalt weg', () => {
    const html = `<body><script>var geheim = "token123"</script>
      <style>.a{color:red}</style>
      <noscript>Bitte JavaScript</noscript>
      <template><p>Vorlage</p></template>
      <p>Sichtbarer Text</p></body>`
    const { text } = extractSiteContent(html)
    expect(text).toContain('Sichtbarer Text')
    expect(text).not.toContain('token123')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('Vorlage')
  })

  it('trennt Blöcke, statt Wörter zusammenzukleben', () => {
    const { text } = extractSiteContent('<body><p>Impressum</p><p>Kontakt</p></body>')
    expect(text).not.toContain('ImpressumKontakt')
    expect(text).toContain('Impressum')
    expect(text).toContain('Kontakt')
  })

  it('entfernt Kommentare — dort stehen oft ganze alte Seitenfassungen', () => {
    const { text } = extractSiteContent('<body><!-- alte Preisliste 2019 --><p>Neu</p></body>')
    expect(text).not.toContain('Preisliste')
    expect(text).toBe('Neu')
  })

  it('macht aus HTML nie ausführbares Zeug — es bleibt Text', () => {
    const { text } = extractSiteContent('<body><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></body>')
    // Dekodiert wird das WÖRTLICH — gerendert wird es nirgends: es landet in
    // einer Spalte und in einem Prompt, der es als Daten kennzeichnet.
    expect(text).toBe('<script>alert(1)</script>')
  })

  it('klemmt den Text auf den Speicher-Deckel', () => {
    const { text } = extractSiteContent(`<body><p>${'a'.repeat(BRAND_SITE_ANALYSIS_MAX_TEXT + 5_000)}</p></body>`)
    expect(text.length).toBe(BRAND_SITE_ANALYSIS_MAX_TEXT)
  })

  it('kommt mit einer leeren Seite klar', () => {
    expect(extractSiteContent('')).toEqual({ title: '', description: '', text: '' })
  })
})

describe('composeSiteAnalysis', () => {
  it('beschriftet, was da ist — und lässt weg, was fehlt', () => {
    const full = composeSiteAnalysis({ title: 'T', description: 'D', text: 'Inhalt' })
    expect(full).toContain('[title]')
    expect(full).toContain('[description]')
    expect(full).toContain('[page text]')

    const bare = composeSiteAnalysis({ title: '', description: '', text: 'Nur Text' })
    expect(bare).not.toContain('[title]')
    expect(bare).toBe('[page text]\nNur Text')
    expect(composeSiteAnalysis({ title: '', description: '', text: '' })).toBe('')
  })

  it('hält den Speicher-Deckel ein, und der Prompt-Deckel liegt darunter', () => {
    const long = composeSiteAnalysis({ title: 'T', description: '', text: 'x'.repeat(BRAND_SITE_ANALYSIS_MAX_TEXT) })
    expect(long.length).toBeLessThanOrEqual(BRAND_SITE_ANALYSIS_MAX_TEXT)
    expect(BRAND_SITE_ANALYSIS_PROMPT_MAX).toBeLessThan(BRAND_SITE_ANALYSIS_MAX_TEXT)
  })
})

describe('siteAnalysisIsStale', () => {
  it('vergleicht Adressen, nicht Zeiten', () => {
    expect(siteAnalysisIsStale('https://a.example', 'https://a.example')).toBe(false)
    expect(siteAnalysisIsStale('https://a.example', 'https://b.example')).toBe(true)
  })

  it('nennt nichts veraltet, was es gar nicht gibt', () => {
    expect(siteAnalysisIsStale('', 'https://a.example')).toBe(false)
    // Adresse gelöscht = „ich will nichts mehr gelesen haben", keine Warnung.
    expect(siteAnalysisIsStale('https://a.example', '')).toBe(false)
  })
})
