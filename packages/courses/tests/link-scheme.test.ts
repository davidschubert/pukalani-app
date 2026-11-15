import { describe, expect, it } from 'vitest'
import { createLessonEditSchema, createLessonSchema } from '../schemas/course'

/** SEC-021: das Lektions-Video nimmt nur http(s) an, leer/null bleibt wie bisher. */
const base = { title: 'L1', content: 'Inhalt' }

describe.each([
  ['createLessonSchema', createLessonSchema()],
  ['createLessonEditSchema', createLessonEditSchema()],
] as const)('%s — videoUrl nur mit http(s)', (_name, schema) => {
  it('http(s) angenommen', () => {
    expect(schema.safeParse({ ...base, videoUrl: 'https://example.com/v' }).success).toBe(true)
    expect(schema.safeParse({ ...base, videoUrl: 'http://example.com/v' }).success).toBe(true)
  })

  it('anderes Schema abgelehnt', () => {
    expect(schema.safeParse({ ...base, videoUrl: 'javascript:void(0)' }).success).toBe(false)
    expect(schema.safeParse({ ...base, videoUrl: 'data:text/plain,x' }).success).toBe(false)
    expect(schema.safeParse({ ...base, videoUrl: 'ftp://example.com/v' }).success).toBe(false)
  })

  it('leer (null/fehlend) bleibt erlaubt', () => {
    expect(schema.safeParse({ ...base, videoUrl: null }).success).toBe(true)
    expect(schema.safeParse(base).success).toBe(true)
  })
})
