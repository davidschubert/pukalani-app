import { describe, expect, it } from 'vitest'
import type { BrandSiteContent, BrandSiteSignals } from '../shared/brandSiteAnalysis'
import { extractSiteSignals } from '../shared/brandSiteAnalysis'
import {
  BRAND_CHECK_EVIDENCE_MAX,
  BRAND_CHECK_MEASURED_IDS,
  measureBrandCheck,
} from '../server/utils/brandCheckMeasure'

/**
 * DIE SECHZEHN GERECHNETEN KRITERIEN — je mindestens ein 0- und ein 2-Fall.
 *
 * Warum das mehr ist als Fleissarbeit: die gerechnete Hälfte des Checks ist
 * das, was „fundiert statt gefühlt" trägt. Eine verrutschte Schwelle fällt
 * nirgends auf — sie erzeugt plausible Zahlen, nur die falschen.
 */

const EMPTY_SIGNALS: BrandSiteSignals = {
  title: '',
  titleCount: 0,
  metaDescription: '',
  metaDescriptionCount: 0,
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  hasFavicon: false,
  themeColor: '',
  colorScheme: '',
  hasPrefersColorScheme: false,
  viewport: '',
  htmlLang: '',
  headings: [],
  canonical: '',
  jsonLdTypes: [],
  ctaTexts: [],
  imageAlts: [],
  doubleSpaceCount: 0,
  mojibakeCount: 0,
  doubleEscapedCount: 0,
}

const EMPTY_CONTENT: BrandSiteContent = { title: '', description: '', text: '' }

/** Genug deutscher Text, damit die Sprachprobe (c4) überhaupt antwortet. */
const GERMAN_TEXT = ('Wir rösten Kaffee und wir liefern ihn an Menschen die ihn nicht nur trinken '
  + 'sondern auch verstehen wollen. Der Ursprung ist eine Farm und der Weg dorthin ist kurz. '
  + 'Das ist nicht kompliziert aber es ist auch nicht selbstverständlich und deshalb sagen wir '
  + 'es hier. Mit jeder Lieferung kommt eine Karte mit und auf ihr steht wer geerntet hat. ').repeat(2)

const ENGLISH_TEXT = ('We roast coffee and we ship it to people who want to understand the cup '
  + 'in front of them. The origin is a farm and the way from there to your kitchen is short. '
  + 'That is not complicated but it is also not a given and this is why we say it here. With '
  + 'every delivery you get a card that names the people who picked it. ').repeat(2)

function measure(
  signals: Partial<BrandSiteSignals> = {},
  content: Partial<BrandSiteContent> = {},
  extra: { finalUrl?: string, httpsUpgraded?: boolean } = {},
) {
  return measureBrandCheck({
    signals: { ...EMPTY_SIGNALS, ...signals },
    content: { ...EMPTY_CONTENT, ...content },
    finalUrl: extra.finalUrl ?? 'https://kailua.coffee/',
    httpsUpgraded: extra.httpsUpgraded ?? false,
  })
}

describe('measureBrandCheck · Vollständigkeit', () => {
  it('liefert GENAU die gerechneten Kriterien des Katalogs — keins mehr, keins weniger', () => {
    const result = measure()
    expect(Object.keys(result).sort()).toEqual([...BRAND_CHECK_MEASURED_IDS].sort())
  })

  it('klemmt jeden Beleg auf 160 Zeichen', () => {
    const result = measure({ viewport: 'x'.repeat(500) })
    for (const entry of Object.values(result)) {
      expect(entry.evidence.length).toBeLessThanOrEqual(BRAND_CHECK_EVIDENCE_MAX)
    }
  })
})

describe('B1 · Favicon + og:image', () => {
  it('keins von beiden ⇒ 0', () => {
    expect(measure().b1!.score).toBe(0)
  })
  it('eins ⇒ 1', () => {
    expect(measure({ hasFavicon: true }).b1!.score).toBe(1)
  })
  it('beide ⇒ 2', () => {
    expect(measure({ hasFavicon: true, ogImage: 'https://x/og.png' }).b1!.score).toBe(2)
  })
})

describe('B2 · Überschriften-Hierarchie', () => {
  it('kein h1 ⇒ 0', () => {
    expect(measure({ headings: [{ level: 2, text: 'Angebot' }] }).b2!.score).toBe(0)
  })
  it('zwei h1 ⇒ 0', () => {
    expect(measure({ headings: [
      { level: 1, text: 'Eins' },
      { level: 1, text: 'Zwei' },
    ] }).b2!.score).toBe(0)
  })
  it('ein h1, aber ein Sprung auf h3 ⇒ 1', () => {
    expect(measure({ headings: [
      { level: 1, text: 'Kailua' },
      { level: 3, text: 'Sorten' },
    ] }).b2!.score).toBe(1)
  })
  it('ein h1 zuoberst, h2 darunter ⇒ 2', () => {
    expect(measure({ headings: [
      { level: 1, text: 'Kailua' },
      { level: 2, text: 'Sorten' },
      { level: 3, text: 'Filter' },
      { level: 2, text: 'Ursprung' },
    ] }).b2!.score).toBe(2)
  })
})

describe('B4 · Farb-/Theme-Meta', () => {
  it('nichts gesetzt ⇒ 0', () => {
    expect(measure().b4!.score).toBe(0)
  })
  it('beide gesetzt ⇒ 2', () => {
    expect(measure({ themeColor: '#0a7', colorScheme: 'light dark' }).b4!.score).toBe(2)
  })
})

describe('C2 · title / og:title / h1', () => {
  it('nur eine der drei Beschriftungen ⇒ 0', () => {
    expect(measure({ title: 'Kailua Coffee' }).c2!.score).toBe(0)
  })
  it('sie widersprechen sich ⇒ 0', () => {
    expect(measure({
      title: 'Kailua Coffee Rösterei',
      headings: [{ level: 1, text: 'Ferienwohnungen auf Maui' }],
    }).c2!.score).toBe(0)
  })
  it('deckungsgleich ⇒ 2', () => {
    expect(measure({
      title: 'Kailua Coffee — Rösterei auf Oahu',
      ogTitle: 'Kailua Coffee Rösterei',
      headings: [{ level: 1, text: 'Kailua Coffee' }],
    }).c2!.score).toBe(2)
  })
})

describe('C4 · Sprache deklariert und konsistent', () => {
  it('kein lang-Attribut ⇒ 0', () => {
    expect(measure({}, { text: GERMAN_TEXT }).c4!.score).toBe(0)
  })
  it('lang widerspricht dem Text ⇒ 0', () => {
    expect(measure({ htmlLang: 'en' }, { text: GERMAN_TEXT }).c4!.score).toBe(0)
  })
  it('lang passt zum Text ⇒ 2', () => {
    expect(measure({ htmlLang: 'de-DE' }, { text: GERMAN_TEXT }).c4!.score).toBe(2)
    expect(measure({ htmlLang: 'en' }, { text: ENGLISH_TEXT }).c4!.score).toBe(2)
  })
  it('eine Sprache, die wir nicht prüfen können ⇒ NICHT bewertbar', () => {
    expect(measure({ htmlLang: 'fr' }, { text: GERMAN_TEXT }).c4!.score).toBeNull()
  })
  it('zu wenig Text ⇒ NICHT bewertbar (statt einer geratenen 0)', () => {
    expect(measure({ htmlLang: 'de' }, { text: 'Bald mehr.' }).c4!.score).toBeNull()
  })
})

describe('D1 · Handlungsaufforderung', () => {
  it('keine Links oder Knöpfe oben ⇒ 0', () => {
    expect(measure().d1!.score).toBe(0)
  })
  it('nur Beschriftungen ohne Verb ⇒ 1', () => {
    expect(measure({ ctaTexts: ['Impressum', 'Über uns'] }).d1!.score).toBe(1)
  })
  it('eine Beschriftung mit Verb ⇒ 2, und sie steht im Beleg', () => {
    const result = measure({ ctaTexts: ['Impressum', 'Jetzt bestellen'] }).d1!
    expect(result.score).toBe(2)
    expect(result.evidence).toContain('Jetzt bestellen')
  })
})

describe('D3 · Auffindbarkeit (title/description)', () => {
  it('beides fehlt ⇒ 0', () => {
    expect(measure().d3!.score).toBe(0)
  })
  it('nur der Titel liegt im Fenster ⇒ 1', () => {
    expect(measure({ title: 'K'.repeat(45) }).d3!.score).toBe(1)
  })
  it('beides im Fenster ⇒ 2', () => {
    expect(measure({ title: 'K'.repeat(45), metaDescription: 'D'.repeat(120) }).d3!.score).toBe(2)
  })
  it('ein zu langer Titel zählt NICHT als richtig', () => {
    expect(measure({ title: 'K'.repeat(90) }).d3!.score).toBe(0)
  })
})

describe('D4 · GEO-Readiness (JSON-LD)', () => {
  it('kein JSON-LD ⇒ 0', () => {
    expect(measure().d4!.score).toBe(0)
  })
  it('JSON-LD, aber weder Organization noch WebSite ⇒ 1', () => {
    expect(measure({ jsonLdTypes: ['breadcrumblist'] }).d4!.score).toBe(1)
  })
  it('Organization ⇒ 2', () => {
    expect(measure({ jsonLdTypes: ['organization', 'breadcrumblist'] }).d4!.score).toBe(2)
  })
})

describe('E5 · Fachjargon-Dichte', () => {
  it('zu wenig Text ⇒ NICHT bewertbar', () => {
    expect(measure({}, { text: 'Kaffee aus Kailua.' }).e5!.score).toBeNull()
  })
  it('kurze Wörter ⇒ 2', () => {
    expect(measure({}, { text: GERMAN_TEXT }).e5!.score).toBe(2)
  })
  it('lauter Bandwurmwörter ⇒ 0', () => {
    const text = Array.from({ length: 30 }, () => 'Kundenzufriedenheitsanalyse').join(' ')
    expect(measure({}, { text }).e5!.score).toBe(0)
  })
})

describe('G1 · Mobile-Viewport', () => {
  it('fehlt ⇒ 0', () => {
    expect(measure().g1!.score).toBe(0)
  })
  it('gesetzt ⇒ 2 (kein Zwischenwert)', () => {
    expect(measure({ viewport: 'width=device-width, initial-scale=1' }).g1!.score).toBe(2)
  })
})

describe('G2 · Dunkelmodus-Bereitschaft', () => {
  it('nichts ⇒ 0', () => {
    expect(measure().g2!.score).toBe(0)
  })
  it('nur prefers-color-scheme ⇒ 1', () => {
    expect(measure({ hasPrefersColorScheme: true }).g2!.score).toBe(1)
  })
  it('beides ⇒ 2', () => {
    expect(measure({ colorScheme: 'light dark', hasPrefersColorScheme: true }).g2!.score).toBe(2)
  })
})

describe('G4 · Soziale Vorschau', () => {
  it('nichts ⇒ 0', () => {
    expect(measure().g4!.score).toBe(0)
  })
  it('zwei von dreien ⇒ 1', () => {
    expect(measure({ ogTitle: 'K', ogDescription: 'D' }).g4!.score).toBe(1)
  })
  it('alle drei ⇒ 2', () => {
    expect(measure({ ogTitle: 'K', ogDescription: 'D', ogImage: 'https://x/og.png' }).g4!.score).toBe(2)
  })
})

describe('H1 · Rechtschreibung / Zeichensetzung', () => {
  it('keine Funde ⇒ 2', () => {
    expect(measure().h1!.score).toBe(2)
  })
  it('zwei Funde ⇒ 1', () => {
    expect(measure({ doubleSpaceCount: 1, mojibakeCount: 1 }).h1!.score).toBe(1)
  })
  it('drei Funde ⇒ 0', () => {
    expect(measure({ doubleSpaceCount: 1, mojibakeCount: 1, doubleEscapedCount: 1 }).h1!.score).toBe(0)
  })
})

describe('H2 · Platzhalter-Text', () => {
  it('nichts gefunden ⇒ 2', () => {
    expect(measure({}, { text: GERMAN_TEXT }).h2!.score).toBe(2)
  })
  it('Lorem ipsum ⇒ 0', () => {
    expect(measure({}, { text: 'Unsere Werte: Lorem ipsum dolor sit amet.' }).h2!.score).toBe(0)
  })
  it('ein einzelnes TODO ⇒ 0', () => {
    expect(measure({}, { text: 'Impressum TODO nachtragen' }).h2!.score).toBe(0)
  })
  it('„lorem" als gewöhnliches Wort ist KEIN Fund (Gegenprobe)', () => {
    expect(measure({}, { text: 'Der Ort heisst Lorem und liegt am Fluss.' }).h2!.score).toBe(2)
  })
})

describe('H3 · HTTPS', () => {
  it('nur http ⇒ 0', () => {
    expect(measure({}, {}, { finalUrl: 'http://kailua.coffee/' }).h3!.score).toBe(0)
  })
  it('https ⇒ 2', () => {
    expect(measure().h3!.score).toBe(2)
  })
  it('den beobachteten Sprung nennt der Beleg — den unbeobachteten NICHT', () => {
    expect(measure({}, {}, { httpsUpgraded: true }).h3!.evidence).toContain('observed')
    expect(measure().h3!.evidence).not.toContain('observed')
  })
})

describe('H5 · Meta-Hygiene', () => {
  it('kein Titel, keine Beschreibung, kein canonical ⇒ 0', () => {
    expect(measure().h5!.score).toBe(0)
  })
  it('doppelter Titel zählt NICHT als sauber', () => {
    expect(measure({ titleCount: 2, metaDescriptionCount: 1, canonical: 'https://x/' }).h5!.score).toBe(1)
  })
  it('einmal Titel, einmal Beschreibung, canonical gesetzt ⇒ 2', () => {
    expect(measure({ titleCount: 1, metaDescriptionCount: 1, canonical: 'https://x/' }).h5!.score).toBe(2)
  })
})

describe('extractSiteSignals · die drei Handwerks-Zähler', () => {
  it('zählt doppelte Leerzeichen im TEXT, nicht die Einrückung des Quelltexts', () => {
    const pretty = '<body>\n    <p>\n      Kaffee aus Kailua\n    </p>\n  </body>'
    expect(extractSiteSignals(pretty).doubleSpaceCount).toBe(0)

    const typo = '<body><p>Kaffee  aus Kailua</p></body>'
    expect(extractSiteSignals(typo).doubleSpaceCount).toBe(1)
  })

  it('erkennt falsch dekodierte Umlaute', () => {
    expect(extractSiteSignals('<p>RÃ¶sterei</p>').mojibakeCount).toBe(1)
    expect(extractSiteSignals('<p>Rösterei</p>').mojibakeCount).toBe(0)
  })

  it('erkennt doppelt maskierte Entities — ein einfaches &amp; ist KEIN Fund', () => {
    expect(extractSiteSignals('<p>Kaffee &amp;amp; Kuchen</p>').doubleEscapedCount).toBe(1)
    expect(extractSiteSignals('<p>Kaffee &amp; Kuchen</p>').doubleEscapedCount).toBe(0)
  })

  it('liest Kopfdaten, Überschriften und die Handlungsaufforderung oben', () => {
    const html = `<!doctype html><html lang="de"><head>
      <title>Kailua Coffee</title>
      <meta name="description" content="Rösterei auf Oahu">
      <meta property="og:image" content="https://kailua.coffee/og.png">
      <meta name="viewport" content="width=device-width">
      <link rel="icon" href="/favicon.ico">
      <link rel="canonical" href="https://kailua.coffee/">
      <style>@media (prefers-color-scheme: dark) { body { color: #fff } }</style>
      <script type="application/ld+json">{"@type":"Organization","name":"Kailua"}</script>
      </head><body>
      <h1>Kailua Coffee</h1>
      <a href="/shop">Jetzt bestellen</a>
      <img src="/farm.jpg" alt="Die Farm im Morgenlicht">
      <h2>Sorten</h2>
      </body></html>`
    const signals = extractSiteSignals(html)

    expect(signals.title).toBe('Kailua Coffee')
    expect(signals.titleCount).toBe(1)
    expect(signals.metaDescription).toBe('Rösterei auf Oahu')
    expect(signals.metaDescriptionCount).toBe(1)
    expect(signals.ogImage).toBe('https://kailua.coffee/og.png')
    expect(signals.hasFavicon).toBe(true)
    expect(signals.canonical).toBe('https://kailua.coffee/')
    expect(signals.viewport).toBe('width=device-width')
    expect(signals.hasPrefersColorScheme).toBe(true)
    expect(signals.htmlLang).toBe('de')
    expect(signals.jsonLdTypes).toEqual(['organization'])
    expect(signals.headings).toEqual([
      { level: 1, text: 'Kailua Coffee' },
      { level: 2, text: 'Sorten' },
    ])
    expect(signals.ctaTexts).toContain('Jetzt bestellen')
    expect(signals.imageAlts).toContain('Die Farm im Morgenlicht')
  })

  it('lässt ein `<title>` aus einem SVG nicht als zweiten Titel zählen', () => {
    const html = '<head><title>Kailua</title></head><body><svg><title>Logo</title></svg></body>'
    expect(extractSiteSignals(html).titleCount).toBe(1)
  })
})
