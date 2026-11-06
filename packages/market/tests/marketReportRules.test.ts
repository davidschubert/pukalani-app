import { describe, expect, it } from 'vitest'
import type { MarketCompetitor, MarketProfile, MarketProfileField } from '../shared/marketProfile'
import { MARKET_FIELDS, MARKET_OWN_ID } from '../shared/marketProfile'
import {
  MARKET_CONVENTION_MIN_SHARE,
  citationIsGrounded,
  conventionMeetsQuota,
  marketFieldSpeakers,
  marketMatrixRows,
  marketRevisionEntries,
} from '../shared/marketReportRules'

/**
 * DIE REGELN DES VERGLEICHS (Plan §2.3 Nr. 4–5, MV1 M3).
 *
 * Sie sind der Teil, der ENTSCHEIDET, während das Modell nur vorschlägt: die
 * Matrix, die Quote, die Belegprüfung und der Stand-Schlüssel. Jede Prüfung
 * hier hat ihre Gegenprobe — eine Belegprüfung, die alles durchlässt, wäre von
 * einer, die alles fängt, nicht zu unterscheiden.
 */

function field(fieldId: string, value: string, quote?: string): MarketProfileField {
  return {
    fieldId: fieldId as MarketProfileField['fieldId'],
    value,
    source: 'website',
    ...(quote
      ? {
          evidence: {
            quote,
            sourceUrl: 'https://beispiel.example/',
            fetchedAt: '2026-09-05',
            confidence: 'stated' as const,
          },
          frequency: { pages: 2, of: 6 },
        }
      : {}),
  }
}

const OWN: MarketProfileField[] = [
  { fieldId: 'pitch', value: 'Wir rösten in kleinen Mengen.', source: 'foundation' },
  { fieldId: 'tagline', value: '', source: 'foundation' },
]

const COMPETITORS: MarketCompetitor[] = [
  { id: 'c-eins', name: 'Eins', url: 'https://eins.example/', status: 'fetched' },
  { id: 'c-zwei', name: 'Zwei', url: 'https://zwei.example/', status: 'fetched' },
  { id: 'c-drei', name: 'Drei', url: 'https://drei.example/', status: 'excluded' },
]

const PROFILES: MarketProfile[] = [
  { competitorId: 'c-eins', fields: [field('pitch', 'Klein geröstet.', 'Wir rösten klein und oft.')] },
  { competitorId: 'c-zwei', fields: [field('pitch', 'Direkt vom Hof.', 'Direkt vom Hof, jede Woche.')] },
  { competitorId: 'c-drei', fields: [field('pitch', 'Sollte nie erscheinen.', 'Nie.')] },
]

describe('marketMatrixRows', () => {
  it('hat eine Zeile je Marktprofil-Feld — auch für die leeren', () => {
    const rows = marketMatrixRows(OWN, COMPETITORS, PROFILES)
    expect(rows).toHaveLength(MARKET_FIELDS.length)
    expect(rows.map(row => row.fieldId)).toEqual(MARKET_FIELDS.map(definition => definition.id))
  })

  it('setzt die eigene Marke in die ERSTE Spalte', () => {
    const rows = marketMatrixRows(OWN, COMPETITORS, PROFILES)
    for (const row of rows) expect(row.cells[0]?.competitorId).toBe(MARKET_OWN_ID)
  })

  it('nimmt jede Zelle WÖRTLICH aus dem Marktprofil', () => {
    const pitch = marketMatrixRows(OWN, COMPETITORS, PROFILES)
      .find(row => row.fieldId === 'pitch')
    expect(pitch?.cells.find(cell => cell.competitorId === 'c-eins')?.value).toBe('Klein geröstet.')
    expect(pitch?.cells.find(cell => cell.competitorId === 'c-eins')?.evidence?.quote)
      .toBe('Wir rösten klein und oft.')
    expect(pitch?.cells[0]?.value).toBe('Wir rösten in kleinen Mengen.')
  })

  it('unterscheidet die DREI Gründe, aus denen eine Zelle leer ist', () => {
    const rows = marketMatrixRows(OWN, COMPETITORS, PROFILES)
    const tagline = rows.find(row => row.fieldId === 'tagline')
    // Bei uns nicht bestätigt (§2.4) …
    expect(tagline?.cells[0]?.empty).toBe('own')
    // … die Marke sagt öffentlich nichts …
    expect(tagline?.cells.find(cell => cell.competitorId === 'c-eins')?.empty).toBe('field')
    // … und bei dieser durften wir gar nicht nachsehen.
    expect(tagline?.cells.find(cell => cell.competitorId === 'c-drei')?.empty).toBe('excluded')
  })

  it('zeigt von einem AUSGESCHLOSSENEN Kandidaten nichts, auch wenn Daten dastehen', () => {
    // Das ist keine Kosmetik: ein Ausschluss ist eine Willenserklärung des
    // Betreibers (§2.9 Nr. 1), und alte Zeilen dürfen sie nicht aushebeln.
    const pitch = marketMatrixRows(OWN, COMPETITORS, PROFILES).find(row => row.fieldId === 'pitch')
    expect(pitch?.cells.find(cell => cell.competitorId === 'c-drei')?.value).toBe('')
  })
})

describe('conventionMeetsQuota', () => {
  it('hält die 60-Prozent-Schwelle', () => {
    expect(MARKET_CONVENTION_MIN_SHARE).toBe(0.6)
    expect(conventionMeetsQuota(3, 5)).toBe(true) // 60 %
    expect(conventionMeetsQuota(2, 4)).toBe(false) // 50 %
    expect(conventionMeetsQuota(3, 3)).toBe(true)
  })

  it('lässt eine EINZELNE Marke nie als Konvention durch', () => {
    // 1 von 1 sind 100 % und trotzdem keine Konvention: „alle sagen das" ist
    // über eine einzige Stimme keine Aussage.
    expect(conventionMeetsQuota(1, 1)).toBe(false)
  })

  it('verwirft unmögliche Zahlen, statt sie zu retten', () => {
    expect(conventionMeetsQuota(4, 3)).toBe(false)
    expect(conventionMeetsQuota(0, 3)).toBe(false)
    expect(conventionMeetsQuota(2, 0)).toBe(false)
  })
})

describe('marketFieldSpeakers', () => {
  it('zählt nur, wer in diesem Feld ETWAS SAGT', () => {
    // Zwei Kandidaten mit Wert; der dritte ist ausgeschlossen.
    expect(marketFieldSpeakers('pitch', OWN, COMPETITORS, PROFILES, false)).toBe(2)
  })

  it('zählt die eigene Marke NUR bei einer Konvention mit', () => {
    expect(marketFieldSpeakers('pitch', OWN, COMPETITORS, PROFILES, true)).toBe(3)
  })

  it('zählt ein leeres eigenes Feld auch bei `includeOwn` nicht', () => {
    expect(marketFieldSpeakers('tagline', OWN, COMPETITORS, PROFILES, true)).toBe(0)
  })
})

describe('citationIsGrounded', () => {
  const fields = [field('pitch', 'Klein geröstet.', 'Wir rösten klein und oft, nie in Mengen.')]

  it('nimmt das gespeicherte Zitat', () => {
    expect(citationIsGrounded('Wir rösten klein und oft, nie in Mengen.', fields, 'pitch')).toBe(true)
  })

  it('nimmt eine KÜRZUNG des gespeicherten Zitats', () => {
    // Ein Modell zitiert oft den Kern eines längeren Satzes.
    expect(citationIsGrounded('Wir rösten klein und oft', fields, 'pitch')).toBe(true)
  })

  it('GEGENPROBE: eine Erweiterung ist kein Beleg', () => {
    expect(citationIsGrounded('Wir rösten klein und oft, und liefern selbst.', fields, 'pitch'))
      .toBe(false)
  })

  it('GEGENPROBE: ein erfundener Satz ist kein Beleg', () => {
    expect(citationIsGrounded('Diesen Satz gibt es nicht.', fields, 'pitch')).toBe(false)
  })

  it('GEGENPROBE: das richtige Zitat im FALSCHEN Feld zählt nicht', () => {
    expect(citationIsGrounded('Wir rösten klein und oft', fields, 'tagline')).toBe(false)
  })

  it('GEGENPROBE: ein Schnipsel unter zwölf Zeichen belegt nichts', () => {
    // „oft" stünde in jedem zweiten Satz und wäre damit ein Freifahrtschein.
    expect(citationIsGrounded('oft', fields, 'pitch')).toBe(false)
  })
})

describe('marketRevisionEntries', () => {
  const base = {
    own: OWN,
    candidates: [
      { id: 'b', sourceKind: 'website', sourceRef: '', url: 'https://b.example/', inputHash: 'h-b' },
      { id: 'a', sourceKind: 'website', sourceRef: '', url: 'https://a.example/', inputHash: 'h-a' },
    ],
    libraryVersion: 'lib-1',
  }

  it('ist REIHENFOLGE-UNABHÄNGIG gegenüber der Kandidatenliste', () => {
    const gedreht = { ...base, candidates: [...base.candidates].reverse() }
    expect(marketRevisionEntries(base)).toEqual(marketRevisionEntries(gedreht))
  })

  it('bewegt sich, wenn ein EIGENES Feld sich ändert (stale nach Korrektur)', () => {
    const korrigiert = {
      ...base,
      own: [{ ...OWN[0]!, value: 'Wir rösten mittwochs.' }, OWN[1]!],
    }
    expect(marketRevisionEntries(korrigiert)).not.toEqual(marketRevisionEntries(base))
  })

  it('bewegt sich, wenn ein Kandidat einen NEUEN Abrufstand hat', () => {
    const neuGelesen = {
      ...base,
      candidates: [{ ...base.candidates[0]!, inputHash: 'h-neu' }, base.candidates[1]!],
    }
    expect(marketRevisionEntries(neuGelesen)).not.toEqual(marketRevisionEntries(base))
  })

  it('bewegt sich, wenn ein Kandidat dazukommt oder wegfällt', () => {
    const einer = { ...base, candidates: [base.candidates[0]!] }
    expect(marketRevisionEntries(einer)).not.toEqual(marketRevisionEntries(base))
  })

  it('bewegt sich mit der Bibliotheks-Fassung', () => {
    expect(marketRevisionEntries({ ...base, libraryVersion: 'lib-2' }))
      .not.toEqual(marketRevisionEntries(base))
  })

  it('bleibt STABIL, wenn sich nichts Beteiligtes ändert', () => {
    expect(marketRevisionEntries(base)).toEqual(marketRevisionEntries({ ...base }))
  })

  it('führt jedes der zehn eigenen Felder — auch die leeren', () => {
    // „Feld fehlt" und „Feld ist leer" müssen denselben Schlüssel ergeben wie
    // sie ihn hätten, wenn beides dasselbe wäre; ein nachgetragener Wert muss
    // ihn dagegen bewegen. Das geht nur, wenn ALLE Felder eingehen.
    const entries = marketRevisionEntries(base)
    for (const definition of MARKET_FIELDS) {
      expect(entries.some(entry => entry.slotId === `own:${definition.id}`)).toBe(true)
    }
  })
})
