import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  BRAND_SCORE_BANDS,
  BRAND_SCORE_BAND_RANGES,
  brandCheckCriteriaOf,
  brandScoreBand,
} from '../shared/brandCheck'
import { brandTdmReserved } from '../shared/brandTdm'
import {
  BRAND_CHECK_BOT_TOKEN,
  BRAND_CHECK_USER_AGENT,
  BRAND_SITE_USER_AGENT,
} from '../server/utils/brandSiteFetch'

/**
 * DIE METHODIK-SEITE IST EINE ÖFFENTLICHE ZUSAGE ÜBER DIE EIGENE RECHNUNG
 * (`app/pages/brand-check/methodik.vue`, BS1 R2a — Faktenblatt §4c verweist
 * zweimal auf sie).
 *
 * ── WAS HIER GENAGELT WIRD, UND WARUM GERADE DAS ──────────────────────────
 * Eine falsche Zahl auf dieser Seite ist etwas anderes als ein Tippfehler:
 * sie ist eine öffentliche Falschaussage darüber, wie wir fremde Marken
 * bewerten — und sie fällt niemandem auf, weil die Seite trotzdem rendert.
 * Drei Sorten Fehler kann man mechanisch ausschliessen:
 *
 *  1. ABGETIPPTE ZAHLEN. Die Seite muss ihre Zahlen aus dem Katalog rechnen
 *     (`BRAND_CHECK_CRITERIA.length`, `…CATEGORIES`, die Gewichte, die
 *     Bandgrenzen), und die Locale-Texte müssen Platzhalter tragen statt
 *     Ziffern. Ein 41. Kriterium soll die Seite mitnehmen, ohne dass jemand
 *     eine Übersetzung anfasst.
 *  2. FEHLENDE SCHLÜSSEL. vue-i18n gibt bei einem Loch den SCHLÜSSEL aus —
 *     auf einer indexierbaren Seite stünde dann `brand.checkMethod.what.body`
 *     im Text und im JSON-LD (dieselbe Falle, die
 *     `brandCheckPageCatalog.test.ts` für die Startseite fängt).
 *  3. EIN ABSENDER, DER NICHT MEHR STIMMT. `BRAND_CHECK_USER_AGENT` lebt in
 *     `server/utils/` und ist für eine Seite unerreichbar; die Zeichenkette
 *     steht deshalb als Literal im Markup. Ein Test darf `server/` lesen und
 *     hält beide aneinander — sonst nennt die Seite einen Namen, der in
 *     keinem fremden Zugriffsprotokoll auftaucht.
 *
 * Dazu die Invariante, die die Seite erst möglich gemacht hat: die
 * Band-TABELLE und `brandScoreBand()` sind dieselbe Wahrheit.
 */

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', 'i18n', 'locales')
const pageSource = readFileSync(join(here, '..', 'app', 'pages', 'brand-check', 'methodik.vue'), 'utf8')
const tabsSource = readFileSync(join(here, '..', 'app', 'components', 'BwBrandCheckTabs.vue'), 'utf8')

const LOCALES = ['de', 'en'] as const
type Locale = (typeof LOCALES)[number]

function flatten(node: unknown, prefix: string, into: Map<string, string>): Map<string, string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, into)
    else into.set(path, String(value))
  }
  return into
}

const catalogs = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    flatten(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')), '', new Map<string, string>()),
  ]),
) as Record<Locale, Map<string, string>>

function missingIn(key: string): string[] {
  return LOCALES.filter(locale => !catalogs[locale].has(key))
}

function expectKeys(keys: readonly string[]) {
  const gaps = keys.flatMap((key) => {
    const missing = missingIn(key)
    return missing.length ? [`${key} fehlt in ${missing.join(', ')}`] : []
  })
  expect(gaps).toEqual([])
}

describe('Bandtabelle und Rechnung sind dieselbe Wahrheit', () => {
  it('brandScoreBand() liest die Tabelle — jede Grenze und der Wert darunter', () => {
    for (const [index, range] of BRAND_SCORE_BAND_RANGES.entries()) {
      expect(brandScoreBand(range.min), `min ${range.min}`).toBe(range.band)
      // Ein Punkt unter der Grenze gehört dem SCHWÄCHEREN Nachbarn — beim
      // letzten Band gibt es keinen, dort ist 0 die Untergrenze.
      const weaker = BRAND_SCORE_BAND_RANGES[index + 1]
      if (weaker) expect(brandScoreBand(range.min - 1), `min-1 ${range.min}`).toBe(weaker.band)
    }
    expect(brandScoreBand(100)).toBe('exceptional')
    expect(brandScoreBand(0)).toBe('poor')
  })

  it('die Tabelle fällt streng und deckt 0 bis 100 lückenlos ab', () => {
    const mins = BRAND_SCORE_BAND_RANGES.map(range => range.min)
    expect(mins).toEqual([...mins].sort((a, b) => b - a))
    expect(new Set(mins).size).toBe(mins.length)
    expect(mins.at(-1)).toBe(0)
    for (let score = 0; score <= 100; score += 1) {
      expect(BRAND_SCORE_BANDS).toContain(brandScoreBand(score))
    }
  })

  it('die Filterliste des Rankings trägt dieselben Bänder in derselben Ordnung', () => {
    expect(BRAND_SCORE_BANDS).toEqual(BRAND_SCORE_BAND_RANGES.map(range => range.band))
  })
})

describe('Methodik-Seite: die Zahlen kommen aus dem Katalog', () => {
  it('rechnet Kriterien-, Kategorien- und Gewichtszahl, statt sie zu nennen', () => {
    expect(pageSource).toContain('BRAND_CHECK_CRITERIA.length')
    expect(pageSource).toContain('BRAND_CHECK_CATEGORIES.length')
    expect(pageSource).toContain('BRAND_SCORE_BAND_RANGES')
    // Der gerechnete/beurteilte Anteil und die Gewichtssumme sind ABLEITUNGEN
    // aus demselben Katalog — sonst stünde „16 von 40" als Literal da.
    expect(pageSource).toMatch(/kind === 'measured'/)
    expect(pageSource).toMatch(/reduce\(\(sum, category\) => sum \+ category\.weight, 0\)/)
    expect(pageSource).toContain('BRAND_SITE_ANALYSIS_MAX_TEXT')
    expect(pageSource).toContain('BRAND_CHECK_CACHE_MS')
    expect(pageSource).toContain('BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT')
  })

  it('die Locale-Texte tragen Platzhalter, keine Ziffern', () => {
    // Genau die Sätze, in denen eine Zahl vorkommt. Jeder muss seinen
    // Platzhalter tragen — und keiner darf die heutige Ziffer enthalten.
    const numeric: Record<string, readonly string[]> = {
      'brand.checkMethod.seoDescription': ['{criteria}', '{categories}'],
      'brand.checkMethod.reads.l1': ['{chars}'],
      'brand.checkMethod.judge.body': ['{criteria}', '{categories}', '{total}'],
      'brand.checkMethod.judge.criteriaCount': ['{count}'],
      'brand.checkMethod.judge.weight': ['{weight}', '{total}'],
      'brand.checkMethod.judge.splitBody': ['{measured}', '{judged}', '{criteria}'],
      'brand.checkMethod.judge.varianceBody': ['{days}'],
      'brand.checkMethod.maturity.labelBody': ['{measured}'],
      'brand.checkMethod.public.correctionLimit': ['{limit}'],
      'brand.checkMethod.what.bandFrom': ['{min}'],
      'brand.checkMethod.what.bandUnder': ['{max}'],
    }
    const gaps: string[] = []
    for (const [key, placeholders] of Object.entries(numeric)) {
      for (const locale of LOCALES) {
        const message = catalogs[locale].get(key)
        if (message === undefined) {
          gaps.push(`${key} fehlt in ${locale}`)
          continue
        }
        for (const placeholder of placeholders) {
          if (!message.includes(placeholder)) gaps.push(`${key} (${locale}) ohne ${placeholder}`)
        }
      }
    }
    expect(gaps).toEqual([])

    // Die heutigen Werte stehen NIRGENDS wörtlich in diesen Sätzen: 40
    // Kriterien, 8 Kategorien, 16 gerechnet, 24 beurteilt, 100 Punkte.
    const forbidden = [
      String(BRAND_CHECK_CRITERIA.length),
      String(BRAND_CHECK_CATEGORIES.length),
      String(BRAND_CHECK_CRITERIA.filter(criterion => criterion.kind === 'measured').length),
    ]
    const literals: string[] = []
    for (const key of Object.keys(numeric)) {
      for (const locale of LOCALES) {
        const message = catalogs[locale].get(key) ?? ''
        for (const value of forbidden) {
          if (new RegExp(`(?<!\\{)\\b${value}\\b`).test(message)) literals.push(`${key} (${locale}) nennt ${value}`)
        }
      }
    }
    expect(literals).toEqual([])
  })

  it('GEGENPROBE: ohne Platzhalter wäre der Satz eine abgetippte Zahl', () => {
    // Ein Satz OHNE `{criteria}` würde von derselben Prüfung gefangen — der
    // Nachweis, dass die Regel oben nicht leerläuft.
    const broken = '40 Kriterien in acht Kategorien.'
    expect(broken.includes('{criteria}')).toBe(false)
    expect(new RegExp(`(?<!\\{)\\b${BRAND_CHECK_CRITERIA.length}\\b`).test(broken)).toBe(true)
  })
})

describe('Methodik-Seite: der i18n-Katalog ist vollständig', () => {
  it('trägt Kopf, SEO und die sieben Abschnitte in beiden Sprachen', () => {
    expectKeys([
      'brand.checkMethod.seoTitle',
      'brand.checkMethod.seoDescription',
      'brand.checkMethod.eyebrow',
      'brand.checkMethod.title',
      'brand.checkMethod.lead',
      'brand.checkMethod.updated',
      'brand.checkMethod.what.title',
      'brand.checkMethod.what.body',
      'brand.checkMethod.what.opinion',
      'brand.checkMethod.what.notTitle',
      'brand.checkMethod.what.bandsTitle',
      'brand.checkMethod.what.bandsLead',
      'brand.checkMethod.reads.title',
      'brand.checkMethod.reads.body',
      'brand.checkMethod.reads.skipsTitle',
      'brand.checkMethod.reads.keepsTitle',
      'brand.checkMethod.reads.keepsBody',
      'brand.checkMethod.reads.agentTitle',
      'brand.checkMethod.reads.robotsTitle',
      'brand.checkMethod.reads.robotsBody',
      // BS1 R2b: die drei Wege zum Aussperren und die benannte Grenze.
      'brand.checkMethod.reads.blockTitle',
      'brand.checkMethod.reads.blockBody',
      'brand.checkMethod.reads.tdmTitle',
      'brand.checkMethod.reads.tdmBody',
      'brand.checkMethod.reads.doubt',
      'brand.checkMethod.reads.blockContact',
      'brand.checkMethod.reads.limitTitle',
      'brand.checkMethod.reads.limitBody',
      ...['header', 'meta', 'robotsMeta', 'tdmrep'].map(key => `brand.checkMethod.reads.form.${key}`),
      'brand.checkMethod.reads.botLink',
      'brand.checkMethod.judge.title',
      'brand.checkMethod.judge.splitTitle',
      'brand.checkMethod.judge.modelTitle',
      'brand.checkMethod.judge.modelBody',
      'brand.checkMethod.judge.varianceTitle',
      'brand.checkMethod.judge.nullTitle',
      'brand.checkMethod.judge.nullBody',
      'brand.checkMethod.maturity.title',
      'brand.checkMethod.maturity.body',
      'brand.checkMethod.maturity.note',
      'brand.checkMethod.public.title',
      'brand.checkMethod.public.privateTitle',
      'brand.checkMethod.public.privateBody',
      'brand.checkMethod.public.linkTitle',
      'brand.checkMethod.public.linkBody',
      'brand.checkMethod.public.ownerTitle',
      'brand.checkMethod.public.ownerBody',
      'brand.checkMethod.public.correctionTitle',
      'brand.checkMethod.public.correctionBody',
      'brand.checkMethod.public.removalTitle',
      'brand.checkMethod.public.removalBody',
      'brand.checkMethod.public.contactTitle',
      'brand.checkMethod.public.contactBody',
      'brand.checkMethod.public.imprint',
      'brand.checkMethod.limits.title',
      'brand.checkMethod.back.check',
      'brand.checkMethod.back.ranking',
      // Der Reiter, über den ALLE vier Brand-Check-Ansichten hierher zeigen.
      'brand.checkPage.tabs.method',
    ])
  })

  it('trägt je Kategorie einen Satz — und die Namen kommen aus dem BESTEHENDEN Katalog', () => {
    expectKeys(BRAND_CHECK_CATEGORIES.flatMap(category => [
      `brand.checkMethod.judge.categories.${category.key}`,
      // NICHT dupliziert: die Überschrift ist dieselbe wie auf der
      // Ergebnisseite und im Ranking.
      `brand.check.categories.${category.key}`,
    ]))
    expect(pageSource).toContain('brand.check.categories.')

    // Genau acht Sätze — ein neunter im Katalog ohne Kategorie fiele sonst
    // nicht auf, ein fehlender achter ebenso wenig.
    for (const locale of LOCALES) {
      const written = [...catalogs[locale].keys()]
        .filter(key => key.startsWith('brand.checkMethod.judge.categories.'))
      expect(written, locale).toHaveLength(BRAND_CHECK_CATEGORIES.length)
    }
  })

  it('trägt die Aufzählungen vollständig — vier gelesen, vier nicht, vier Nicht-Aussagen, fünf Grenzen', () => {
    expectKeys([
      ...['l1', 'l2', 'l3', 'l4'].map(key => `brand.checkMethod.reads.${key}`),
      ...['s1', 's2', 's3', 's4'].map(key => `brand.checkMethod.reads.${key}`),
      ...['not1', 'not2', 'not3', 'not4'].map(key => `brand.checkMethod.what.${key}`),
      ...['l1', 'l2', 'l3', 'l4', 'l5'].flatMap(key => [
        `brand.checkMethod.limits.${key}Title`,
        `brand.checkMethod.limits.${key}Body`,
      ]),
    ])
  })

  it('GEGENPROBE: ein fünfter Eintrag der Leseliste gibt es nicht', () => {
    expect(missingIn('brand.checkMethod.reads.l5').length).toBeGreaterThan(0)
  })

  it('trägt je Band eine Beschriftung (aus dem BESTEHENDEN Katalog)', () => {
    expectKeys(BRAND_SCORE_BAND_RANGES.map(range => `brand.check.bands.${range.band}`))
    expect(pageSource).toContain('brand.check.bands.')
  })
})

describe('Methodik-Seite: die Zusagen, die man nicht brechen darf', () => {
  it('nennt den Absender wörtlich so, wie er auf fremden Servern ankommt', () => {
    expect(pageSource).toContain(BRAND_CHECK_USER_AGENT)
  })

  it('die +-Adresse des Absenders zeigt auf DIESE Seite — sonst ist sie eine Floskel', () => {
    expect(BRAND_CHECK_USER_AGENT).toContain('/brand-check/methodik')
  })

  it('GEGENPROBE: der Absender des WIZARDS steht hier nicht — er liest anders', () => {
    expect(pageSource).not.toContain(BRAND_SITE_USER_AGENT)
    expect(BRAND_CHECK_USER_AGENT).not.toBe(BRAND_SITE_USER_AGENT)
  })

  it('sagt zu, dass robots.txt und Nutzungsvorbehalt geachtet werden (BS1 R2b)', () => {
    for (const locale of LOCALES) {
      const body = catalogs[locale].get('brand.checkMethod.reads.robotsBody') ?? ''
      expect(body, locale).toContain('robots.txt')
      // Die Zusage ist wertlos ohne den zweiten Halbsatz: was passiert, wenn
      // eines von beidem nein sagt.
      expect(body.length, locale).toBeGreaterThan(120)
    }
  })

  it('nennt die Grenze der Zusage, statt sie zu verschweigen', () => {
    for (const locale of LOCALES) {
      const body = catalogs[locale].get('brand.checkMethod.reads.limitBody') ?? ''
      expect(body, locale).toContain('robots.txt')
    }
  })

  it('zeigt die Aussperr-Zeile mit dem TOKEN, den der Server wirklich prüft', () => {
    // Der Absender heisst `PukalaniBrandCheck/1.0 (…)`, das robots-Token ist
    // sein kleingeschriebener Präfix. Eine Zeile mit einem anderen Namen wäre
    // eine Anleitung, die nicht wirkt.
    expect(pageSource).toContain('User-agent: PukalaniBrandCheck')
    expect(BRAND_CHECK_USER_AGENT.toLowerCase().startsWith(BRAND_CHECK_BOT_TOKEN)).toBe(true)
  })

  it('zeigt alle vier Formen des Vorbehalts — genau die, die der Server prüft', () => {
    for (const snippet of ['TDM-Reservation: 1', 'tdm-reservation', 'noai', 'tdmrep.json']) {
      expect(pageSource, snippet).toContain(snippet)
    }
    expect(brandTdmReserved({ headers: { 'tdm-reservation': '1' } })).toBe(true)
    expect(brandTdmReserved({ metaTdm: ['1'] })).toBe(true)
    expect(brandTdmReserved({ metaRobots: ['noai'] })).toBe(true)
    expect(brandTdmReserved({ tdmrepJson: '[{ "location": "/", "tdm-reservation": 1 }]', path: '/' })).toBe(true)
    // GEGENPROBE: ohne Vorbehalt bleibt es beim Nein zum Nein.
    expect(brandTdmReserved({ metaRobots: ['index', 'follow'] })).toBe(false)
  })

  it('ist indexierbar — kein robots-Kopf, anders als die Ergebnisseite', () => {
    // Gesucht ist die ANWEISUNG, nicht das Wort: der Seitenkopf erklärt in
    // Prosa, warum hier keine steht.
    expect(pageSource).not.toMatch(/robots:\s*['"`]/)
    // Gegenprobe am Nachbarn: die Ergebnisseite trägt sie sehr wohl.
    const resultPage = readFileSync(join(here, '..', 'app', 'pages', 'brand-check', '[id].vue'), 'utf8')
    expect(resultPage).toMatch(/robots:\s*['"`]noindex/)
  })

  it('hängt an keinem Produkt-Gate und verlangt keine Anmeldung', () => {
    expect(pageSource).not.toContain('middleware')
    expect(pageSource).not.toContain('requirePlanProduct')
    expect(pageSource).not.toMatch(/productKey|auth: true/)
  })

  it('der Reiter „Methodik" zeigt auf die gebaute Adresse', () => {
    expect(tabsSource).toContain('/brand-check/methodik')
    expect(tabsSource).toContain("key: 'method'")
  })

  it('Startseite, Ranking und Ergebnisseite verlinken sie ausserdem im Lesefluss', () => {
    const pagesDir = join(here, '..', 'app', 'pages', 'brand-check')
    for (const file of ['index.vue', 'ranking.vue', '[id].vue']) {
      const source = readFileSync(join(pagesDir, file), 'utf8')
      expect(source, file).toContain("'/brand-check/methodik'")
    }
  })
})

describe('Methodik-Seite: Kriterienzahl je Kategorie', () => {
  it('jede Kategorie meldet ihre EIGENE Zahl aus dem Katalog', () => {
    expect(pageSource).toContain('brandCheckCriteriaOf(category.key).length')
    for (const category of BRAND_CHECK_CATEGORIES) {
      expect(brandCheckCriteriaOf(category.key).length, category.key).toBeGreaterThan(0)
    }
    expect(
      BRAND_CHECK_CATEGORIES.reduce((sum, category) => sum + brandCheckCriteriaOf(category.key).length, 0),
    ).toBe(BRAND_CHECK_CRITERIA.length)
  })
})
