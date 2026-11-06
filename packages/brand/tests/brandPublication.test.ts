import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_PUBLICATION_ACTIONS,
  BRAND_PUBLICATION_BLOCKERS,
  BRAND_PUBLICATION_SLUG_MAX,
  BRAND_PUBLICATION_STATUSES,
  type BrandPublicationStatus,
  brandPublicationCanSubmit,
  brandPublicationIsPublic,
  brandPublicationIsVisible,
  brandPublicationKeepsPublicStand,
  brandPublicationPath,
  brandPublicationSlug,
  brandPublicationSlugCandidate,
  decideBrandPublication,
  decideBrandPublicationQuota,
  normalizeBrandPublicationStatus,
} from '../shared/brandPublication'
import { BRAND_PALETTES, brandPaletteId, brandPaletteName } from '../shared/brandPalette'

/**
 * DIE REGELN DER VERÖFFENTLICHUNG (docs/plans/DISCOVER-BRANDS.md §3/§4.3,
 * Paket D1).
 *
 * Was hier festgenagelt wird, sind drei Zusagen, die man später nicht
 * versehentlich verschieben darf:
 *  1. Die ADRESSE ist stabil und ASCII — sie steht in geteilten Links.
 *  2. Die VORAUSSETZUNGEN nennen ALLE fehlenden Gründe, nicht den ersten.
 *  3. Die ZUSTANDSMASCHINE ist vollständig: jede erlaubte UND jede verbotene
 *     Kombination steht unten, damit „was darf jetzt passieren?" nie zur
 *     Auslegungssache wird.
 */

describe('brandPublicationSlug', () => {
  it('macht aus einem Titel eine kleine ASCII-Adresse', () => {
    expect(brandPublicationSlug('Kailua Coffee Co.', 'p1')).toBe('kailua-coffee-co')
  })

  it('schreibt Umlaute und ß AUS, statt sie wegzuwerfen', () => {
    // „Grnmhle" wäre kein Name mehr, sondern ein Tippfehler.
    expect(brandPublicationSlug('Grünmühle & Söhne', 'p1')).toBe('gruenmuehle-soehne')
    expect(brandPublicationSlug('Straßenlicht', 'p1')).toBe('strassenlicht')
    expect(brandPublicationSlug('ÄÖÜ Werkstatt', 'p1')).toBe('aeoeue-werkstatt')
  })

  it('entfernt Diakritika anderer Sprachen', () => {
    expect(brandPublicationSlug('Café Crème', 'p1')).toBe('cafe-creme')
  })

  it('lässt weder führende noch doppelte noch schliessende Bindestriche stehen', () => {
    expect(brandPublicationSlug('  ***Nord — See***  ', 'p1')).toBe('nord-see')
  })

  it('deckelt auf 80 Zeichen und endet nie auf einem Bindestrich', () => {
    const slug = brandPublicationSlug('a'.repeat(60) + ' ' + 'b'.repeat(60), 'p1')
    expect(slug.length).toBe(BRAND_PUBLICATION_SLUG_MAX)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('RÜCKFALL: ein Titel ohne verwertbare Zeichen wird `brand-<6 Zeichen der Id>`', () => {
    // Ohne Rückfall wäre die Adresse `/discover/`, also die Galerie selbst.
    expect(brandPublicationSlug('🎈🎈🎈', '68bd1f2a3c4d5e6f')).toBe('brand-68bd1f')
    expect(brandPublicationSlug('', '68bd1f2a3c4d5e6f')).toBe('brand-68bd1f')
    expect(brandPublicationSlug('···', '')).toBe('brand')
  })

  it('KOLLISION: der erste behält den Namen, danach -2, -3', () => {
    expect(brandPublicationSlugCandidate('kailua', 1)).toBe('kailua')
    expect(brandPublicationSlugCandidate('kailua', 2)).toBe('kailua-2')
    expect(brandPublicationSlugCandidate('kailua', 3)).toBe('kailua-3')
  })

  it('KOLLISION bei voller Länge: das Ende weicht dem Suffix', () => {
    const base = 'a'.repeat(BRAND_PUBLICATION_SLUG_MAX)
    const second = brandPublicationSlugCandidate(base, 2)
    expect(second.length).toBe(BRAND_PUBLICATION_SLUG_MAX)
    expect(second.endsWith('-2')).toBe(true)
    // Ohne das Kürzen wären beide Kandidaten nach dem Abschneiden derselbe Text
    // und die „Auflösung" löste nichts auf.
    expect(second).not.toBe(base)
  })

  it('die Adresse trägt das Discover-Präfix', () => {
    expect(brandPublicationPath('kailua-coffee-co')).toBe('/discover/kailua-coffee-co')
  })
})

describe('brandPublicationCanSubmit', () => {
  const ready = {
    title: 'Kailua Coffee Co.',
    acceptedStepKeys: ['context', 'pvm', 'archetype'],
    archetypeConfirmed: true,
  }

  it('vollständig ⇒ erlaubt, ohne Gründe', () => {
    expect(brandPublicationCanSubmit(ready)).toEqual({ allowed: true, blockers: [] })
  })

  it('ohne Titel: `title_missing` (auch bei reinen Leerzeichen)', () => {
    expect(brandPublicationCanSubmit({ ...ready, title: '   ' }).blockers).toEqual(['title_missing'])
  })

  it('Kapitel A offen: `context_open`', () => {
    expect(brandPublicationCanSubmit({ ...ready, acceptedStepKeys: ['pvm'] }).blockers)
      .toEqual(['context_open'])
  })

  it('Kapitel B offen: `pvm_open`', () => {
    expect(brandPublicationCanSubmit({ ...ready, acceptedStepKeys: ['context'] }).blockers)
      .toEqual(['pvm_open'])
  })

  it('kein bestätigter Archetyp: `archetype_missing`', () => {
    expect(brandPublicationCanSubmit({ ...ready, archetypeConfirmed: false }).blockers)
      .toEqual(['archetype_missing'])
  })

  it('nennt ALLE Gründe auf einmal — nicht nur den ersten', () => {
    // Ein Mensch, der drei Dinge nachholen muss, soll das in einem Zug
    // erfahren und nicht in drei Anläufen.
    const decision = brandPublicationCanSubmit({ title: '', acceptedStepKeys: [], archetypeConfirmed: false })
    expect(decision.allowed).toBe(false)
    expect(decision.blockers).toEqual([...BRAND_PUBLICATION_BLOCKERS])
  })
})

describe('decideBrandPublication', () => {
  /** Alle Ausgangszustände inklusive „es gibt noch keine Zeile". */
  const STATES: (BrandPublicationStatus | null)[] = [null, ...BRAND_PUBLICATION_STATUSES]

  /** Die WAHRHEITSTAFEL — was NICHT hier steht, ist verboten. */
  const ALLOWED: Record<string, (BrandPublicationStatus | null)[]> = {
    submit: [null, 'declined', 'withdrawn', 'published'],
    withdraw: ['pending', 'published', 'declined'],
    approve: ['pending'],
    decline: ['pending'],
    hide: ['published'],
    // `unhide` ist die Hand des BETREIBERS (D3): `hidden` bleibt für den
    // Kunden eine Sackgasse, sonst wäre der Entzug einen Knopfdruck von
    // seiner Aufhebung entfernt.
    unhide: ['hidden'],
  }

  const NEXT: Record<string, BrandPublicationStatus> = {
    submit: 'pending',
    withdraw: 'withdrawn',
    approve: 'published',
    decline: 'declined',
    hide: 'hidden',
    unhide: 'published',
  }

  it('jede erlaubte Kombination führt in genau EINEN Folgezustand', () => {
    for (const action of BRAND_PUBLICATION_ACTIONS) {
      for (const status of ALLOWED[action]!) {
        expect(decideBrandPublication(status, action)).toEqual({
          action: 'apply',
          next: NEXT[action],
        })
      }
    }
  })

  it('jede ANDERE Kombination wird abgelehnt — vollständig durchgezählt', () => {
    for (const action of BRAND_PUBLICATION_ACTIONS) {
      for (const status of STATES) {
        if (ALLOWED[action]!.includes(status)) continue
        expect(decideBrandPublication(status, action)).toEqual({
          action: 'refuse',
          code: 'publication_state',
        })
      }
    }
  })

  it('AUSGEBLENDET ist eine Sackgasse: kein Einreichen, kein Zurückziehen', () => {
    // Der Weg zurück führt über den Betreiber, nicht über die Selbstbedienung.
    expect(decideBrandPublication('hidden', 'submit').action).toBe('refuse')
    expect(decideBrandPublication('hidden', 'withdraw').action).toBe('refuse')
  })

  it('„erneut einreichen" aus `published` lässt den alten Stand öffentlich', () => {
    expect(decideBrandPublication('published', 'submit')).toEqual({ action: 'apply', next: 'pending' })
    expect(brandPublicationKeepsPublicStand('published', 'submit')).toBe(true)
    // Und NUR dort: eine erste Einreichung hat nichts, was öffentlich bleiben
    // könnte, und ein Zurückziehen soll nichts stehen lassen.
    expect(brandPublicationKeepsPublicStand(null, 'submit')).toBe(false)
    expect(brandPublicationKeepsPublicStand('declined', 'submit')).toBe(false)
    expect(brandPublicationKeepsPublicStand('published', 'withdraw')).toBe(false)
  })
})

describe('normalizeBrandPublicationStatus', () => {
  it('kennt die fünf Zustände', () => {
    for (const status of BRAND_PUBLICATION_STATUSES) {
      expect(normalizeBrandPublicationStatus(status)).toBe(status)
    }
  })

  it('FAIL-CLOSED: Unbekanntes, Leeres und Fehlendes werden `pending` — nie `published`', () => {
    for (const value of ['', '   ', 'live', undefined, null]) {
      expect(normalizeBrandPublicationStatus(value)).toBe('pending')
    }
  })

  it('öffentlich ist GENAU ein Zustand', () => {
    expect(brandPublicationIsPublic('published')).toBe(true)
    for (const status of ['pending', 'declined', 'hidden', 'withdrawn', 'none'] as const) {
      expect(brandPublicationIsPublic(status)).toBe(false)
    }
  })
})

describe('Tages-Deckel', () => {
  it('die zehnte Einreichung ist erlaubt, die elfte nicht', () => {
    expect(decideBrandPublicationQuota(10)).toBeNull()
    expect(decideBrandPublicationQuota(11)).toBe('publication_limit')
  })
})

describe('Farbwelt-Katalog (Entscheidung 8)', () => {
  it('jede Welt hat eine stabile Id und einen Namen in beiden Sprachen', () => {
    expect(BRAND_PALETTES).toHaveLength(12)
    expect(new Set(BRAND_PALETTES.map(p => p.id)).size).toBe(BRAND_PALETTES.length)
    for (const palette of BRAND_PALETTES) {
      expect(palette.id).toMatch(/^[a-z][a-z0-9]*$/)
      expect(palette.name.de.length).toBeGreaterThan(0)
      expect(palette.name.en.length).toBeGreaterThan(0)
    }
  })

  it('die Id folgt derselben Rechnung wie der Dreiklang — und bleibt stabil', () => {
    const id = brandPaletteId('68bd1f2a3c4d5e6f')
    expect(brandPaletteId('68bd1f2a3c4d5e6f')).toBe(id)
    expect(BRAND_PALETTES.map(p => p.id)).toContain(id)
  })

  it('der Name kommt in der Sprache des Lesers — unbekannte Id ergibt LEER', () => {
    expect(brandPaletteName('terracotta', 'de')).toBe('Terrakotta')
    expect(brandPaletteName('petrol', 'en')).toBe('Teal')
    // Nie die Id als Text: `palette.gibtsnicht` in einer Galerie wäre ein
    // roher Schlüssel für Google.
    expect(brandPaletteName('gibtsnicht', 'de')).toBe('')
  })
})

// ── Der i18n-Katalog (dieselbe Falle wie beim Ranking) ─────────────────────

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const LOCALES = ['de', 'en'] as const

function flatten(node: unknown, prefix: string, into: Set<string>): Set<string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, into)
    else into.add(path)
  }
  return into
}

const catalogs = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    flatten(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')), '', new Set<string>()),
  ]),
) as Record<(typeof LOCALES)[number], Set<string>>

function gapsFor(keys: readonly string[]): string[] {
  return keys
    .map(key => ({ key, missing: LOCALES.filter(locale => !catalogs[locale].has(key)) }))
    .filter(entry => entry.missing.length)
    .map(entry => `${entry.key} fehlt in ${entry.missing.join(', ')}`)
}

describe('Veröffentlichen: i18n-Katalog', () => {
  it('jeder Grund aus der Liste hat einen Satz, in beiden Sprachen', () => {
    // vue-i18n gibt bei einem fehlenden Schlüssel den SCHLÜSSEL aus: im Dialog
    // stünde dann wörtlich `brand.publication.blocker.pvm_open`.
    expect(gapsFor(BRAND_PUBLICATION_BLOCKERS.map(code => `brand.publication.blocker.${code}`))).toEqual([])
  })

  it('jeder Zustand, den die Karte meldet, hat eine Zeile', () => {
    expect(gapsFor([
      'brand.publication.card.public',
      'brand.publication.card.publicSince',
      'brand.publication.card.pending',
      'brand.publication.card.declined',
      'brand.publication.card.hidden',
    ])).toEqual([])
  })

  it('der Dialog und der Kopf sind vollständig beschriftet', () => {
    expect(gapsFor([
      'brand.publication.button',
      'brand.publication.title',
      'brand.publication.intro',
      'brand.publication.consent',
      'brand.publication.submit',
      'brand.publication.cancel',
      'brand.publication.close',
      'brand.publication.hidden',
      'brand.publication.addressHint',
      'brand.publication.summary.title',
      'brand.publication.summary.address',
      'brand.publication.summary.scoreEmpty',
      'brand.publication.state.pending',
      'brand.publication.state.pendingAddress',
      'brand.publication.state.pendingUpdate',
      'brand.publication.state.public',
      'brand.publication.state.publicSince',
      'brand.publication.state.update',
      'brand.publication.state.withdraw',
      'brand.publication.state.declined',
      'brand.publication.state.resubmit',
      'brand.publication.state.hidden',
      'brand.publication.state.hiddenHint',
      'brand.publication.notReady',
      'brand.publication.limited',
      'brand.publication.failed',
      'brand.foundation.share.native',
    ])).toEqual([])
  })

  it('GEGENPROBE: ein erfundener Schlüssel fehlt sehr wohl', () => {
    expect(gapsFor(['brand.publication.gibtsnicht']).length).toBe(1)
  })
})

describe('brandPublicationIsVisible — die Lese-Seite von „alter Stand bleibt öffentlich"', () => {
  it('published ist öffentlich; pending nur MIT altem Stand', () => {
    expect(brandPublicationIsVisible({ status: 'published', snapshot: '' })).toBe(true)
    expect(brandPublicationIsVisible({ status: 'pending', snapshot: '{"chapters":[]}' })).toBe(true)
    expect(brandPublicationIsVisible({ status: 'pending', snapshot: '' })).toBe(false)
    expect(brandPublicationIsVisible({ status: 'pending' })).toBe(false)
  })

  it('abgelehnt, ausgeblendet, zurückgezogen sind nie öffentlich — auch mit altem Stand', () => {
    for (const status of ['declined', 'hidden', 'withdrawn', 'kaputt', null]) {
      expect(brandPublicationIsVisible({ status, snapshot: '{"chapters":[]}' })).toBe(false)
    }
  })
})
