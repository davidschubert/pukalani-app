import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_PUBLICATION_DEFAULT_FILTER,
  BRAND_PUBLICATION_FILTERS,
  BRAND_PUBLICATION_FILTER_STATUSES,
  BRAND_PUBLICATION_REPORT_FILTERS,
  BRAND_PUBLICATION_REPORT_HOUR_LIMIT,
  BRAND_PUBLICATION_STATUSES,
  brandPublicationDeclineOutcome,
  brandPublicationFeatureLosers,
  brandPublicationFilterCount,
  brandPublicationPendingDeclined,
  brandPublicationReportStatusValues,
  brandPublicationStatusValues,
  decideBrandPublication,
  decideBrandPublicationReportQuota,
  normalizeBrandPublicationReportStatus,
} from '../shared/brandPublication'

/**
 * DIE REGELN DER MODERATION (docs/plans/DISCOVER-BRANDS.md §4.4, Paket D3).
 *
 * Vier Zusagen, die man später nicht versehentlich verschieben darf:
 *  1. EINE Brand of the Day — und die Ablösung fasst die neue Zeile nie an.
 *  2. Eine Ablehnung nimmt einer öffentlichen Marke NICHT die Öffentlichkeit;
 *     abgelehnt wurde die Aktualisierung.
 *  3. Ausblenden ist umkehrbar — aber nur durch den Betreiber.
 *  4. Die drei Reiter decken zusammen ALLE fünf Zustände ab: es gibt keine
 *     Zeile, die von der Betreiber-Seite aus unerreichbar wäre.
 */

describe('brandPublicationFeatureLosers — genau eine, letzte gewinnt', () => {
  it('räumt jede ANDERE featured Zeile ab', () => {
    expect(brandPublicationFeatureLosers(['a', 'b', 'c'], 'b', true)).toEqual(['a', 'c'])
  })

  it('fasst die ZIEL-Zeile nie an — auch nicht, wenn sie schon featured war', () => {
    // Sonst löschte die Route den Stempel, den sie im selben Zug setzt, und ein
    // Fehlschlag dazwischen liesse GAR KEINE Brand of the Day zurück.
    expect(brandPublicationFeatureLosers(['b'], 'b', true)).toEqual([])
  })

  it('beim ENTFERNEN gibt es nichts abzulösen', () => {
    expect(brandPublicationFeatureLosers(['a', 'b'], 'b', false)).toEqual([])
  })

  it('Dubletten und leere Ids fallen weg', () => {
    expect(brandPublicationFeatureLosers(['a', 'a', '', 'b'], 'b', true)).toEqual(['a'])
  })
})

describe('brandPublicationDeclineOutcome — ablehnen mit und ohne alten Stand', () => {
  it('OHNE freigegebenen Stand: die Zeile wird `declined`', () => {
    expect(brandPublicationDeclineOutcome(false)).toEqual({
      next: 'declined',
      keepsPublicStand: false,
    })
  })

  it('MIT freigegebenem Stand: sie BLEIBT `published`', () => {
    // Abgelehnt wurde die AKTUALISIERUNG, nicht die Marke — sie deswegen aus
    // der Galerie zu nehmen wäre eine Strafe für einen Verbesserungsversuch,
    // und der geteilte Link stürbe an einem Vorgang, der ihn nicht betraf.
    expect(brandPublicationDeclineOutcome(true)).toEqual({
      next: 'published',
      keepsPublicStand: true,
    })
  })

  it('die Vorfrage bleibt dieselbe: abgelehnt wird NUR aus `pending`', () => {
    expect(decideBrandPublication('pending', 'decline')).toEqual({ action: 'apply', next: 'declined' })
    for (const status of ['published', 'declined', 'hidden', 'withdrawn', null] as const) {
      expect(decideBrandPublication(status, 'decline').action).toBe('refuse')
    }
  })
})

describe('brandPublicationPendingDeclined — woran der Kunde den Fall erkennt', () => {
  it('`published` + Begründung heisst „Aktualisierung abgelehnt"', () => {
    expect(brandPublicationPendingDeclined('published', 'Fremdes Logo.')).toBe(true)
  })

  it('ohne Begründung nicht — und Leerzeichen sind keine Begründung', () => {
    expect(brandPublicationPendingDeclined('published', '')).toBe(false)
    expect(brandPublicationPendingDeclined('published', '   ')).toBe(false)
  })

  it('bei JEDEM anderen Zustand nicht — dort gehört die Notiz zur MARKE', () => {
    for (const status of ['none', 'pending', 'declined', 'hidden', 'withdrawn'] as const) {
      expect(brandPublicationPendingDeclined(status, 'Fremdes Logo.')).toBe(false)
    }
  })
})

describe('unhide — der Weg zurück gehört dem Betreiber', () => {
  it('`hidden` → `published`, ohne neue Freigabe', () => {
    expect(decideBrandPublication('hidden', 'unhide')).toEqual({ action: 'apply', next: 'published' })
  })

  it('und aus keinem anderen Zustand', () => {
    for (const status of ['pending', 'published', 'declined', 'withdrawn', null] as const) {
      expect(decideBrandPublication(status, 'unhide').action).toBe('refuse')
    }
  })

  it('der Kunde kommt weiterhin nicht aus `hidden` heraus', () => {
    expect(decideBrandPublication('hidden', 'submit').action).toBe('refuse')
    expect(decideBrandPublication('hidden', 'withdraw').action).toBe('refuse')
  })
})

describe('Die Reiter der Betreiber-Liste', () => {
  it('DECKEN ZUSAMMEN ALLE FÜNF ZUSTÄNDE AB', () => {
    // Die eigentliche Zusage: es gibt keine Zeile, die von dieser Seite aus
    // unerreichbar wäre. Ein sechster Zustand ohne Reiter fiele hier auf.
    const covered = new Set(
      BRAND_PUBLICATION_FILTERS
        .filter(filter => filter !== 'all')
        .flatMap(filter => BRAND_PUBLICATION_FILTER_STATUSES[filter] ?? []),
    )
    expect([...covered].sort()).toEqual([...BRAND_PUBLICATION_STATUSES].sort())
  })

  it('KEIN Zustand steht in zwei Reitern', () => {
    const all = BRAND_PUBLICATION_FILTERS
      .filter(filter => filter !== 'all')
      .flatMap(filter => BRAND_PUBLICATION_FILTER_STATUSES[filter] ?? [])
    expect(all.length).toBe(new Set(all).size)
  })

  it('`all` filtert nicht — das ist die Form, die `Query.equal` braucht', () => {
    expect(brandPublicationStatusValues('all')).toBeNull()
    expect(brandPublicationStatusValues('live')).toEqual(['published', 'hidden'])
    expect(brandPublicationStatusValues('closed')).toEqual(['declined', 'withdrawn'])
  })

  it('der Vorgabewert ist die ARBEITSLISTE', () => {
    expect(BRAND_PUBLICATION_DEFAULT_FILTER).toBe('pending')
  })

  it('die Zahl am Reiter summiert die Zustände dahinter', () => {
    const counts = { pending: 3, published: 4, hidden: 1, declined: 2, withdrawn: 5 }
    expect(brandPublicationFilterCount('pending', counts)).toBe(3)
    expect(brandPublicationFilterCount('live', counts)).toBe(5)
    expect(brandPublicationFilterCount('closed', counts)).toBe(7)
    expect(brandPublicationFilterCount('all', counts)).toBe(15)
  })

  it('fehlende Zähler sind 0, nicht NaN', () => {
    expect(brandPublicationFilterCount('live', {})).toBe(0)
  })
})

describe('Meldungen: Zustand und Deckel', () => {
  it('FAIL-CLOSED auf `open` — Unbekanntes wartet auf den Betreiber', () => {
    expect(normalizeBrandPublicationReportStatus('done')).toBe('done')
    expect(normalizeBrandPublicationReportStatus('erledigt')).toBe('open')
    expect(normalizeBrandPublicationReportStatus(undefined)).toBe('open')
  })

  it('die drei Filter liefern die Form, die `Query.equal` braucht', () => {
    expect(BRAND_PUBLICATION_REPORT_FILTERS).toEqual(['open', 'done', 'all'])
    expect(brandPublicationReportStatusValues('open')).toEqual(['open'])
    expect(brandPublicationReportStatusValues('all')).toBeNull()
  })

  it('die dritte Meldung der Stunde geht noch, die vierte nicht', () => {
    // `>` statt `>=`, weil `store.hit()` diese Meldung schon mitzählt.
    expect(decideBrandPublicationReportQuota(BRAND_PUBLICATION_REPORT_HOUR_LIMIT)).toBeNull()
    expect(decideBrandPublicationReportQuota(BRAND_PUBLICATION_REPORT_HOUR_LIMIT + 1))
      .toBe('report_limit')
  })
})

// ── Der Katalog ─────────────────────────────────────────────────────────────

/**
 * vue-i18n gibt bei fehlender Übersetzung den SCHLÜSSEL aus — kein Fehler,
 * keine Warnung, kein roter Build (vier Tage `legal.imprint` im Fuss von
 * comments.pukalani.app). Dieser Test nennt die Schlüssel der Betreiber-Seite
 * und des Melde-Formulars NAMENTLICH.
 */
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

describe('Moderation: i18n-Katalog', () => {
  it('jeder Reiter und jeder Zustand hat ein Wort, in beiden Sprachen', () => {
    expect(gapsFor([
      ...BRAND_PUBLICATION_FILTERS
        .filter(filter => filter !== 'all')
        .map(filter => `brand.discoverAdmin.tab.${filter}`),
      'brand.discoverAdmin.tab.reports',
      ...BRAND_PUBLICATION_STATUSES.map(status => `brand.discoverAdmin.status.${status}`),
      // Die Meldungen haben EIGENE Wörter: der erste Anlauf borgte sich die
      // Reiter-Beschriftungen, und im Status stand dann wörtlich „Meldungen"
      // bzw. „Abgelehnt & zurückgezogen" (in der Sichtprüfung aufgefallen).
      'brand.discoverAdmin.reportStatus.open',
      'brand.discoverAdmin.reportStatus.done',
    ])).toEqual([])
  })

  it('die Betreiber-Seite ist vollständig beschriftet', () => {
    expect(gapsFor([
      'brand.admin.discover.nav',
      'brand.discoverAdmin.title',
      'brand.discoverAdmin.subtitle',
      'brand.discoverAdmin.refresh',
      'brand.discoverAdmin.more',
      'brand.discoverAdmin.shown',
      'brand.discoverAdmin.actionFailed',
      'brand.discoverAdmin.owner',
      'brand.discoverAdmin.ownerUnknown',
      'brand.discoverAdmin.reporterAnonymous',
      'brand.discoverAdmin.col.brand',
      'brand.discoverAdmin.col.submitted',
      'brand.discoverAdmin.col.published',
      'brand.discoverAdmin.col.score',
      'brand.discoverAdmin.col.reports',
      'brand.discoverAdmin.col.featured',
      'brand.discoverAdmin.col.example',
      'brand.discoverAdmin.col.status',
      'brand.discoverAdmin.col.reason',
      'brand.discoverAdmin.col.received',
      'brand.discoverAdmin.score.website',
      'brand.discoverAdmin.score.document',
      'brand.discoverAdmin.score.none',
      'brand.discoverAdmin.action.preview',
      'brand.discoverAdmin.action.approve',
      'brand.discoverAdmin.action.decline',
      'brand.discoverAdmin.action.hide',
      'brand.discoverAdmin.action.unhide',
      'brand.discoverAdmin.action.resolve',
      'brand.discoverAdmin.declineTitle',
      'brand.discoverAdmin.declineText',
      'brand.discoverAdmin.declineUpdateText',
      'brand.discoverAdmin.hideTitle',
      'brand.discoverAdmin.hideText',
      'brand.discoverAdmin.noteLabel',
      'brand.discoverAdmin.noteHint',
      'brand.discoverAdmin.notePlaceholder',
      'brand.discoverAdmin.approved',
      'brand.discoverAdmin.declined',
      'brand.discoverAdmin.declinedKept',
      'brand.discoverAdmin.hiddenToast',
      'brand.discoverAdmin.unhiddenToast',
      'brand.discoverAdmin.featuredOn',
      'brand.discoverAdmin.featuredReplaced',
      'brand.discoverAdmin.featuredOff',
      'brand.discoverAdmin.exampleOn',
      'brand.discoverAdmin.exampleOff',
      'brand.discoverAdmin.reportResolved',
      'brand.discoverAdmin.emptyTitle',
      'brand.discoverAdmin.empty',
      'brand.discoverAdmin.reportsEmptyTitle',
      'brand.discoverAdmin.reportsEmpty',
    ])).toEqual([])
  })

  it('jeder Fehlercode, den die Seite kennt, hat einen Satz', () => {
    // Der Rückfall auf `generic` macht ein Loch unsichtbar — deshalb stehen
    // die Codes hier namentlich (Muster: `notificationBellTexts.test.ts`).
    expect(gapsFor([
      'already_decided',
      'publication_state',
      'not_published',
      'publication_not_found',
      'not_found',
      'publication_admin_unavailable',
      'generic',
    ].map(code => `brand.discoverAdmin.error.${code}`))).toEqual([])
  })

  it('das Melde-Formular ist vollständig beschriftet', () => {
    expect(gapsFor([
      'brand.discoverReport.trigger',
      'brand.discoverReport.title',
      'brand.discoverReport.lead',
      'brand.discoverReport.reasonLabel',
      'brand.discoverReport.reasonHint',
      'brand.discoverReport.reasonPlaceholder',
      'brand.discoverReport.counter',
      'brand.discoverReport.emailLabel',
      'brand.discoverReport.emailHint',
      'brand.discoverReport.emailPlaceholder',
      'brand.discoverReport.submit',
      'brand.discoverReport.cancel',
      'brand.discoverReport.thanks',
      ...['reportOpen', 'rateLimited', 'notFound', 'tooShort', 'unavailable', 'generic']
        .map(key => `brand.discoverReport.errors.${key}`),
    ])).toEqual([])
  })

  it('und die Pille „Aktualisierung abgelehnt" in der Leseansicht', () => {
    expect(gapsFor(['brand.publication.state.updateDeclined'])).toEqual([])
  })

  it('GEGENPROBE: ein erfundener Schlüssel fehlt sehr wohl', () => {
    expect(gapsFor(['brand.discoverAdmin.gibtsnicht']).length).toBe(1)
  })
})
