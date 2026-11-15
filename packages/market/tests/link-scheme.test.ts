import { describe, expect, it } from 'vitest'
import { marketLibraryDraftSchema, marketLibraryEntrySchema, marketLibraryFieldSchema } from '../shared/marketLibrary'
import { marketEvidenceSchema } from '../shared/types/market'

/** SEC-021: Quell-Adressen der Bibliothek und der Belege nehmen nur http(s) an. */
const field = { fieldId: 'pitch', value: 'Etwas.', sourceUrl: 'https://x.example' }
const entry = {
  key: 'demo-x',
  status: 'verified',
  name: 'X',
  homepage: 'https://x.example',
  category: '',
  verifiedAt: '2026-09-05',
  verifiedBy: 'jemand',
  fields: [field],
}
const draft = {
  ...entry,
  status: 'draft',
  verifiedAt: null,
  verifiedBy: null,
  computed: { at: '2026-09-05T10:00:00.000Z', mode: 'stub', tool: 'test', pages: ['https://x.example/'] },
}
const evidence = { quote: 'Zitat', sourceUrl: 'https://x.example', fetchedAt: '2026-09-05', confidence: 'stated' }

const OTHER_SCHEMES = ['javascript:void(0)', 'data:text/plain,x', 'ftp://x.example']

describe('marketLibraryFieldSchema.sourceUrl', () => {
  it('http(s) angenommen', () => {
    expect(marketLibraryFieldSchema.safeParse(field).success).toBe(true)
    expect(marketLibraryFieldSchema.safeParse({ ...field, sourceUrl: 'http://x.example' }).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(marketLibraryFieldSchema.safeParse({ ...field, sourceUrl: value }).success).toBe(false)
  })
})

describe('marketLibraryEntrySchema.homepage', () => {
  it('http(s) angenommen', () => {
    expect(marketLibraryEntrySchema.safeParse(entry).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(marketLibraryEntrySchema.safeParse({ ...entry, homepage: value }).success).toBe(false)
  })
})

describe('marketLibraryDraftSchema.computed.pages', () => {
  it('http(s) angenommen, leere Liste bleibt erlaubt', () => {
    expect(marketLibraryDraftSchema.safeParse(draft).success).toBe(true)
    expect(marketLibraryDraftSchema.safeParse({ ...draft, computed: { ...draft.computed, pages: [] } }).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(marketLibraryDraftSchema.safeParse({ ...draft, computed: { ...draft.computed, pages: [value] } }).success).toBe(false)
  })
})

describe('marketEvidenceSchema.sourceUrl', () => {
  it('http(s) angenommen', () => {
    expect(marketEvidenceSchema.safeParse(evidence).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(marketEvidenceSchema.safeParse({ ...evidence, sourceUrl: value }).success).toBe(false)
  })
})
