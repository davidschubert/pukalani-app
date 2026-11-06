import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEMO_AI_VIEWS,
  DEMO_CLAIMS,
  DEMO_COMPETITORS,
  DEMO_OLD_SITE_PROFILE,
  DEMO_PROFILES,
  DEMO_SOURCE_OPTIONS,
  demoHref,
} from '../.playground/app/utils/demoMarket'
import type { MarketEvidence } from '../shared/marketProfile'

/**
 * DER HALLUZINATIONS-RIEGEL IM KLEINEN (Plan §2.2: `evidence ⊂ rawText`).
 *
 * Im Produkt prüft der Server deterministisch, dass jedes Zitat WÖRTLICH im
 * abgerufenen Text vorkommt — sonst wird das Feld verworfen. Der Prototyp hat
 * keinen Server, aber dieselbe Pflicht: seine Belege zeigen auf die drei
 * erfundenen Demo-Websites, und wer dort einen Satz ändert, ohne die
 * Demo-Daten mitzuziehen, baut genau die Lüge ein, die das Produkt nie
 * erzählen darf.
 *
 * DIE GEGENPROBE steht im Test selbst: ein erfundenes Zitat muss durchfallen.
 * Ohne sie wäre nicht zu unterscheiden, ob die Prüfung greift oder ob sie nur
 * nichts findet.
 */
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.playground/public')

/** Das rohe HTML der Seite, auf die ein Beleg zeigt. */
function pageText(sourceUrl: string): string {
  return readFileSync(join(PUBLIC_DIR, demoHref(sourceUrl)), 'utf8')
}

const allEvidence: MarketEvidence[] = [
  ...DEMO_PROFILES.flatMap(profile => profile.fields.flatMap(field => (field.evidence ? [field.evidence] : []))),
  ...DEMO_CLAIMS.flatMap(list => list.entries.flatMap(entry => (entry.citations ?? []).map(c => c.evidence))),
  // M0b: die eigene ALTE Website ist ein Kandidat wie jeder andere (§7.2
  // Nr. 2) — also gilt für sie dieselbe Belegpflicht.
  ...DEMO_OLD_SITE_PROFILE.flatMap(field => (field.evidence ? [field.evidence] : [])),
]

describe('Belege der Demo-Daten', () => {
  it('hat überhaupt Belege zu prüfen', () => {
    expect(allEvidence.length).toBeGreaterThan(15)
  })

  it('jedes Zitat steht wörtlich auf der Seite, auf die es zeigt', () => {
    for (const evidence of allEvidence) {
      expect(pageText(evidence.sourceUrl), `${evidence.sourceUrl}: ${evidence.quote}`)
        .toContain(evidence.quote)
    }
  })

  it('Gegenprobe: ein erfundenes Zitat fällt durch', () => {
    expect(pageText('https://upcountry-roast.example')).not.toContain('We roast exclusively at night.')
  })

  it('hält die Zitatschranke ein (≤ 200 Zeichen)', () => {
    for (const evidence of allEvidence) expect(evidence.quote.length).toBeLessThanOrEqual(200)
  })

  it('nennt nur erfundene .example-Adressen', () => {
    for (const evidence of allEvidence) expect(evidence.sourceUrl).toMatch(/^https:\/\/[a-z-]+\.example(\/[a-z]+)?$/)
  })

  it('belegt auch die alte eigene Website (Relaunch-Fall, §7.2 Nr. 2)', () => {
    const old = DEMO_OLD_SITE_PROFILE.flatMap(field => (field.evidence ? [field.evidence] : []))
    expect(old.length).toBeGreaterThan(4)
    for (const evidence of old) {
      expect(evidence.sourceUrl).toMatch(/^https:\/\/kailua-coffee\.example/)
      expect(pageText(evidence.sourceUrl)).toContain(evidence.quote)
    }
  })

  it('Gegenprobe: die alte Website sagt NICHT, was die neue Foundation sagt', () => {
    // Genau dieser Unterschied ist der Ertrag des fünften Screens — fiele er
    // weg, wäre die Liste „was die Website noch nicht sagt" immer leer.
    expect(pageText('https://kailua-coffee.example')).not.toContain('Every bag has an address.')
  })
})

/**
 * DIE HÄUFIGKEIT IST EINE ZAHL ÜBER SEITEN, DIE ES GEBEN MUSS (Plan §7.4).
 *
 * Sie ist im Prototyp genauso verführerisch wie ein erfundenes Zitat: „auf 4
 * von 6 Seiten" liest sich gut, auch wenn die Demo-Website nur zwei Seiten
 * hat. Deshalb wird `of` gegen die WIRKLICH gelesenen Seiten geprüft.
 */
describe('Häufigkeit der Demo-Daten', () => {
  it('kein Feld behauptet mehr Seiten, als gelesen wurden', () => {
    for (const profile of DEMO_PROFILES) {
      const pages = DEMO_COMPETITORS.find(c => c.id === profile.competitorId)?.pagesRead?.length ?? 0
      for (const field of profile.fields) {
        if (!field.frequency) continue
        expect(field.frequency.of, profile.competitorId).toBe(pages)
        expect(field.frequency.pages).toBeGreaterThan(0)
        expect(field.frequency.pages).toBeLessThanOrEqual(field.frequency.of)
      }
    }
  })

  it('jede gelesene Seite liegt wirklich im Playground', () => {
    for (const competitor of DEMO_COMPETITORS) {
      for (const page of competitor.pagesRead ?? []) expect(pageText(page).length).toBeGreaterThan(100)
    }
  })
})

/**
 * DIE BIBLIOTHEK NENNT REALE MARKEN — UND DARF IHNEN NICHTS IN DEN MUND
 * LEGEN (Plan §7.2 Nr. 3, §2.9 Nr. 5).
 *
 * Das ist die einzige Stelle des Prototyps, an der echte Namen stehen. Ein
 * erfundenes Zitat darunter wäre eine Falschbehauptung über einen Dritten,
 * und ein Screenshot davon wandert weiter, als man denkt (Plan §4). Der Test
 * hält deshalb fest: Namen ja, Marktprofil nein.
 */
describe('Bibliothek bekannter Marken', () => {
  const library = DEMO_SOURCE_OPTIONS.library ?? []

  it('führt Davids drei Paare und drei kleinere Beispiele', () => {
    const labels = library.map(entry => entry.label)
    for (const name of ['adidas', 'Nike', 'Anthropic', 'OpenAI', 'Meta', 'Apple']) {
      expect(labels).toContain(name)
    }
    expect(library.length).toBeGreaterThanOrEqual(9)
  })

  it('trägt zu keiner Bibliotheks-Marke ein Marktprofil oder ein Zitat', () => {
    const known = new Set(library.map(entry => entry.id))
    for (const profile of DEMO_PROFILES) expect(known.has(profile.competitorId)).toBe(false)
    for (const view of DEMO_AI_VIEWS) expect(known.has(view.competitorId)).toBe(false)
    // Und auch keine Adresse: ohne Abruf gibt es nichts zu verlinken.
    for (const entry of library) expect(entry.url).toBeUndefined()
  })
})

/**
 * DIE KI-AUSSENSICHT HAT KEINEN BELEG UND EINEN KONSENS (Plan §7.5 a/b).
 */
describe('KI-Aussensicht der Demo-Daten', () => {
  it('übernimmt nur, worin sich mindestens zwei Modelle einig waren', () => {
    for (const view of DEMO_AI_VIEWS) {
      for (const statement of view.statements) {
        expect(statement.agree).toBeGreaterThanOrEqual(2)
        expect(statement.agree).toBeLessThanOrEqual(statement.asked)
        expect(statement.value.length).toBeGreaterThan(0)
      }
    }
  })

  it('bleibt von den belegten Profilen getrennt', () => {
    // Gegenprobe zur Vermischung: eine KI-Aussage darf nirgends als
    // Profil-Feld auftauchen, sonst stünde sie mit Beleg-Anspruch da.
    const websiteValues = new Set(DEMO_PROFILES.flatMap(p => p.fields.map(f => f.value)).filter(Boolean))
    for (const view of DEMO_AI_VIEWS) {
      for (const statement of view.statements) expect(websiteValues.has(statement.value)).toBe(false)
    }
  })
})
