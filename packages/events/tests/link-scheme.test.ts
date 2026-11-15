import { describe, expect, it } from 'vitest'
import { createEventEditSchema, createEventSchema } from '../schemas/event'
import { buildEventIcs } from '../server/utils/ics'

/** SEC-021: Event-Links nehmen nur http(s) an, leer/null bleibt wie bisher. */
const base = {
  title: 'Community-Treffen',
  description: 'Wir treffen uns.',
  startAt: '2026-08-01T18:00:00.000Z',
}

describe.each([
  ['createEventSchema', createEventSchema()],
  ['createEventEditSchema', createEventEditSchema()],
] as const)('%s — Links nur mit http(s)', (_name, schema) => {
  it.each(['url', 'replayUrl'] as const)('%s: http(s) angenommen', (field) => {
    expect(schema.safeParse({ ...base, [field]: 'https://example.com/a' }).success).toBe(true)
    expect(schema.safeParse({ ...base, [field]: 'http://example.com/a' }).success).toBe(true)
  })

  it.each(['url', 'replayUrl'] as const)('%s: anderes Schema abgelehnt', (field) => {
    expect(schema.safeParse({ ...base, [field]: 'javascript:void(0)' }).success).toBe(false)
    expect(schema.safeParse({ ...base, [field]: 'data:text/plain,x' }).success).toBe(false)
    expect(schema.safeParse({ ...base, [field]: 'ftp://example.com' }).success).toBe(false)
  })

  it.each(['url', 'replayUrl'] as const)('%s: leer (null/fehlend) bleibt erlaubt', (field) => {
    expect(schema.safeParse({ ...base, [field]: null }).success).toBe(true)
    expect(schema.safeParse(base).success).toBe(true)
  })
})

describe('buildEventIcs — der Link kommt nur mit http(s) in die Kalenderdatei', () => {
  const row = {
    $id: 'evt1',
    $updatedAt: '2026-07-07T10:00:00.000+00:00',
    title: 'Treffen',
    description: '',
    startAt: '2026-08-01T18:00:00.000+00:00',
    endAt: null,
    location: null,
    status: 'published' as const,
  }

  it('übernimmt eine http(s)-Adresse', () => {
    expect(buildEventIcs({ ...row, url: 'https://example.com/fest' })).toContain('URL:https://example.com/fest')
  })

  it('lässt einen gespeicherten Altwert mit anderem Schema weg', () => {
    expect(buildEventIcs({ ...row, url: 'ftp://example.com/fest' })).not.toContain('URL:')
    expect(buildEventIcs({ ...row, url: 'javascript:void(0)' })).not.toContain('URL:')
  })
})
