import { describe, expect, it } from 'vitest'
import {
  createBrandProfileCreateSchema,
  createBrandProfilePatchSchema,
} from '../schemas/brandProfile'
import {
  BRAND_ABOUT_MAX,
  BRAND_AUDIENCE_MAX,
  BRAND_INDUSTRY_MAX,
  BRAND_NEW_DETAILS_FIELDS,
  BRAND_WEBSITE_URL_MAX,
  brandInitialContentLocale,
  brandNewDetailsCopy,
  brandNewDraftBody,
  brandNewDraftComplete,
  brandNewDraftMissing,
  emptyBrandNewDraft,
  isBrandWebsiteUrl,
} from '../shared/brandStartCard'
import { brandIndustrySuggestions } from '../shared/industrySuggestions'

/**
 * DIE STARTKARTE AN DER TÜR (P2.5) — was die Anlage-Route annimmt und was
 * nicht.
 *
 * Die vier SPALTEN sind additiv und tragen '' (brand-009, wegen der
 * Bestands-Zeilen). Die PFLICHT lebt deshalb ausschliesslich hier — fällt sie
 * still weg, entstehen wieder Brandings, aus denen George beim ersten Zug
 * nichts entnehmen kann, und der Fehler zeigt sich erst Wochen später an einem
 * dünnen Entwurf. Genau deshalb steht sie unter Test.
 */

const LOCALES = ['en', 'de']

const startCard = {
  websiteUrl: 'https://kailua.coffee',
  industry: 'Kaffeerösterei',
  about: 'Wir rösten Kaffee in kleinen Mengen auf Maui.',
  audience: 'Cafés und kleine Läden auf der Insel.',
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Kailua Coffee',
    contentLocale: 'de',
    pathKind: 'new',
    hasName: true,
    team: 'solo',
    ...startCard,
    ...overrides,
  }
}

function parseCreate(overrides: Record<string, unknown> = {}) {
  return createBrandProfileCreateSchema(LOCALES).safeParse(createBody(overrides))
}

describe('isBrandWebsiteUrl — eine Adresse oder gar keine', () => {
  it('nimmt http und https', () => {
    expect(isBrandWebsiteUrl('https://kailua.coffee')).toBe(true)
    expect(isBrandWebsiteUrl('http://kailua.coffee/roasting?x=1')).toBe(true)
  })

  it('LEER ist gültig — die URL ist ausdrücklich optional (§2.1)', () => {
    expect(isBrandWebsiteUrl('')).toBe(true)
  })

  it('weist alles ab, was keine vollständige Web-Adresse ist', () => {
    expect(isBrandWebsiteUrl('kailua.coffee')).toBe(false)
    expect(isBrandWebsiteUrl('www.kailua.coffee')).toBe(false)
    expect(isBrandWebsiteUrl('irgendein Text')).toBe(false)
  })

  it('und jedes andere Schema — auch die, die wie eine Adresse aussehen', () => {
    expect(isBrandWebsiteUrl('mailto:hallo@kailua.coffee')).toBe(false)
    expect(isBrandWebsiteUrl('javascript:alert(1)')).toBe(false)
    expect(isBrandWebsiteUrl('ftp://kailua.coffee')).toBe(false)
  })
})

describe('Anlage: die drei inhaltlichen Felder sind PFLICHT', () => {
  it('eine vollständige Karte geht durch — und wird getrimmt', () => {
    const parsed = parseCreate({ industry: '  Kaffeerösterei  ' })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.industry).toBe('Kaffeerösterei')
    expect(parsed.data?.about).toBe(startCard.about)
    expect(parsed.data?.audience).toBe(startCard.audience)
  })

  it.each(['industry', 'about', 'audience'])('ohne %s: abgewiesen', (field) => {
    expect(parseCreate({ [field]: undefined }).success).toBe(false)
  })

  it.each(['industry', 'about', 'audience'])('%s aus lauter Leerzeichen zählt als leer', (field) => {
    expect(parseCreate({ [field]: '   ' }).success).toBe(false)
  })

  it.each([
    ['industry', BRAND_INDUSTRY_MAX],
    ['about', BRAND_ABOUT_MAX],
    ['audience', BRAND_AUDIENCE_MAX],
  ])('%s hält den Spalten-Deckel ein', (field, max) => {
    expect(parseCreate({ [field]: 'x'.repeat(max) }).success).toBe(true)
    expect(parseCreate({ [field]: 'x'.repeat(max + 1) }).success).toBe(false)
  })
})

describe('Anlage: die URL ist freiwillig, aber muss eine sein', () => {
  it('fehlt sie ganz, steht eine leere Zeichenkette in der Zeile — nie undefined', () => {
    const parsed = parseCreate({ websiteUrl: undefined })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.websiteUrl).toBe('')
  })

  it('leer abgeschickt ist ebenfalls in Ordnung', () => {
    expect(parseCreate({ websiteUrl: '' }).success).toBe(true)
    expect(parseCreate({ websiteUrl: '   ' }).data?.websiteUrl).toBe('')
  })

  it('KAPUTT wird abgewiesen, statt still gespeichert zu werden', () => {
    const parsed = parseCreate({ websiteUrl: 'kailua.coffee' })
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('brand.validation.websiteUrl')
  })

  it('und sie hält den Spalten-Deckel ein', () => {
    const long = `https://kailua.coffee/${'x'.repeat(BRAND_WEBSITE_URL_MAX)}`
    expect(parseCreate({ websiteUrl: long }).success).toBe(false)
  })
})

describe('Anlage: die Karte kommt zu den Weichen, sie ersetzt sie nicht', () => {
  it('ein unbekanntes Feld bleibt draußen (strict)', () => {
    expect(parseCreate({ foundedIn: 2019 }).success).toBe(false)
  })

  it('die alten Regeln gelten unverändert', () => {
    expect(parseCreate({ contentLocale: 'fr' }).success).toBe(false)
    expect(parseCreate({ pathKind: 'new', relaunchScope: 'recut' }).success).toBe(false)
  })
})

describe('PATCH: korrigierbar, aber nicht leerbar', () => {
  const patch = createBrandProfilePatchSchema()

  it('nimmt jedes der vier Felder EINZELN entgegen', () => {
    expect(patch.safeParse({ industry: 'Rösterei' }).success).toBe(true)
    expect(patch.safeParse({ about: 'Neu erzählt.' }).success).toBe(true)
    expect(patch.safeParse({ audience: 'Cafés.' }).success).toBe(true)
    expect(patch.safeParse({ websiteUrl: 'https://kailua.coffee' }).success).toBe(true)
  })

  it('die URL DARF geleert werden — sie war nie eine Antwort', () => {
    const parsed = patch.safeParse({ websiteUrl: '' })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.websiteUrl).toBe('')
  })

  it('die drei Pflichtfelder NICHT — weglassen heißt „nicht angefasst"', () => {
    expect(patch.safeParse({ industry: '' }).success).toBe(false)
    expect(patch.safeParse({ about: '   ' }).success).toBe(false)
    expect(patch.safeParse({ audience: '' }).success).toBe(false)
  })

  it('ein leerer Rumpf bleibt abgewiesen', () => {
    expect(patch.safeParse({}).success).toBe(false)
  })

  it('die Inhaltssprache kennt der PATCH weiterhin NICHT', () => {
    expect(patch.safeParse({ contentLocale: 'en' }).success).toBe(false)
  })
})

describe('Branchen-Vorschläge folgen der INHALTSSPRACHE', () => {
  it('deutsche Marke, deutsche Vorschläge — und umgekehrt', () => {
    expect(brandIndustrySuggestions('de')).toContain('Handwerk')
    expect(brandIndustrySuggestions('en')).toContain('Craft & trades')
  })

  it('eine unbekannte Sprache bekommt die Hauptsprache, nie eine leere Liste', () => {
    expect(brandIndustrySuggestions('fr')).toEqual(brandIndustrySuggestions('en'))
    expect(brandIndustrySuggestions('').length).toBeGreaterThan(0)
  })

  it('die Vorschläge passen unter den Spalten-Deckel', () => {
    for (const locale of LOCALES) {
      for (const suggestion of brandIndustrySuggestions(locale)) {
        expect(suggestion.length).toBeLessThanOrEqual(BRAND_INDUSTRY_MAX)
      }
    }
  })
})

/**
 * DIE ANLAGE-REGELN DER STARTKARTE (Testlauf-Befunde H, I und J, 2026-09-09).
 *
 * Drei Befunde aus demselben Modal, und alle drei sind Fragen an eine PURE
 * Regel: Reist der Arbeitstitel mit? Welche Inhaltssprache steht vorne? Und
 * was sagt der abgeschaltete Knopf über sich selbst?
 */
describe('Der Anlage-Entwurf (Startkarte)', () => {
  const draft = {
    ...emptyBrandNewDraft('de'),
    title: 'Morgenlicht Studio',
    industry: 'Kaffeerösterei',
    about: 'Wir rösten Kaffee in kleinen Chargen.',
    audience: 'Cafés und Menschen, die zu Hause gut trinken wollen.',
  }

  /**
   * BEFUND H: „Arbeitstitel geht verloren" — der Rumpf trägt ihn, und zwar
   * getrimmt. Der Test nagelt genau diese Zeile fest: sie ist die einzige
   * Übersetzung vom Formular in die Route, und beide Oberflächen (Modal und
   * Seite) gehen durch sie hindurch.
   */
  it('der Arbeitstitel reist in den Rumpf der Route (H)', () => {
    expect(brandNewDraftBody('new', { ...draft, title: '  Morgenlicht Studio  ' }))
      .toMatchObject({ title: 'Morgenlicht Studio' })
    // Und auf dem Relaunch-Pfad genauso — dort ist es der echte Markenname.
    expect(brandNewDraftBody('relaunch', draft)).toMatchObject({ title: 'Morgenlicht Studio' })
  })

  it('ein leerer Titel bleibt leer — „Neue Marke" darf namenlos starten', () => {
    expect(brandNewDraftBody('new', { ...draft, title: '   ' })).toMatchObject({ title: '' })
  })

  /** BEFUND I: die Vorgabe folgt der Oberfläche, wenn es sie dort gibt. */
  it('die Inhaltssprache folgt der UI-Sprache (I)', () => {
    expect(brandInitialContentLocale('de', ['en', 'de'])).toBe('de')
    expect(brandInitialContentLocale('en', ['en', 'de'])).toBe('en')
  })

  it('… und sonst dem ersten Eintrag der Konfiguration', () => {
    expect(brandInitialContentLocale('fr', ['en', 'de'])).toBe('en')
    expect(brandInitialContentLocale('de', [])).toBe('en')
  })

  /** BEFUND J: der abgeschaltete Knopf nennt, was noch fehlt. */
  it('nennt die offenen Pflichtfelder in Feld-Reihenfolge (J)', () => {
    expect(brandNewDraftMissing(emptyBrandNewDraft('de')))
      .toEqual(['industry', 'about', 'audience'])
    expect(brandNewDraftMissing({ ...draft, about: '' })).toEqual(['about'])
    expect(brandNewDraftMissing(draft)).toEqual([])
  })

  it('eine kaputte Adresse ist ebenfalls „noch offen", eine leere nicht', () => {
    expect(brandNewDraftMissing({ ...draft, websiteUrl: 'mailto:hi@example.com' }))
      .toEqual(['websiteUrl'])
    expect(brandNewDraftMissing({ ...draft, websiteUrl: '' })).toEqual([])
  })

  it('„vollständig" ist genau „nichts mehr offen" — eine Rechnung, zwei Leser', () => {
    for (const candidate of [
      emptyBrandNewDraft('de'),
      { ...draft, industry: '' },
      { ...draft, websiteUrl: 'nope' },
      draft,
    ]) {
      expect(brandNewDraftComplete(candidate)).toBe(brandNewDraftMissing(candidate).length === 0)
    }
  })

  /** Der Rumpf muss durch das SCHEMA gehen — sonst ist der Test eine Meinung. */
  it('der gebaute Rumpf besteht die Anlage-Prüfung', () => {
    const parsed = createBrandProfileCreateSchema(LOCALES).safeParse(brandNewDraftBody('new', draft))
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.title).toBe('Morgenlicht Studio')
  })
})

/**
 * DIE ANLAGE FOLGT DER WEICHE W3 (Dritter Testlauf, Befund 5, 2026-09-10).
 *
 * Die Weiche steht IM SELBEN Formular; die vier Fragen darunter blieben nach
 * dem Umschalten auf „Zwei oder mehr" im Singular stehen.
 */
describe('brandNewDetailsCopy', () => {
  it('gibt je Feld einen eigenen Schlüssel — solo und team verschieden', () => {
    const solo = brandNewDetailsCopy('solo')
    const team = brandNewDetailsCopy('team')
    for (const field of BRAND_NEW_DETAILS_FIELDS) {
      expect(solo[field]).toBe(`brand.new.startCard.${field}.solo`)
      expect(team[field]).toBe(`brand.new.startCard.${field}.team`)
      expect(solo[field]).not.toBe(team[field])
    }
  })

  it('deckt genau die vier Felder der Startkarte ab', () => {
    expect([...BRAND_NEW_DETAILS_FIELDS]).toEqual(['website', 'industry', 'about', 'audience'])
    expect(Object.keys(brandNewDetailsCopy('solo')).sort())
      .toEqual([...BRAND_NEW_DETAILS_FIELDS].sort())
  })

  it('der BASIS-Schlüssel wird nicht mehr geliefert — er stünde sonst roh im Formular', () => {
    for (const key of Object.values(brandNewDetailsCopy('solo'))) {
      expect(key.endsWith('.solo')).toBe(true)
    }
  })
})
