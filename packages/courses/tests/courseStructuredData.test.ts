import { describe, expect, it } from 'vitest'
import { courseStructuredData } from '../shared/courseStructuredData'

/**
 * Strukturierte Daten der Community-Seiten (SU1, SEO-003). Erwartungen stehen
 * AUSGESCHRIEBEN (Beweis-Regel 1); jede Seitenart hat ihre Gegenprobe.
 */
describe('Kurs: Course', () => {
  const base = {
    url: 'https://demo.example.test/courses/morgenroutine',
    title: 'Morgenroutine in 7 Tagen',
    description: 'Sieben kurze Lektionen für den Start in den Tag.',
    authorName: 'Mia',
    providerName: 'Demo Community',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    inLanguage: 'en',
  }

  it('trägt Titel, Beschreibung, Autor und die Community als Anbieter', () => {
    expect(courseStructuredData(base)).toEqual({
      '@type': 'Course',
      'url': 'https://demo.example.test/courses/morgenroutine',
      'name': 'Morgenroutine in 7 Tagen',
      'description': 'Sieben kurze Lektionen für den Start in den Tag.',
      'author': { '@type': 'Person', 'name': 'Mia' },
      'provider': { '@type': 'Organization', 'name': 'Demo Community', 'url': 'https://demo.example.test' },
      'dateCreated': '2026-11-01T10:00:00.000Z',
      'dateModified': '2026-11-02T10:00:00.000Z',
      'inLanguage': 'en',
    })
  })

  it('Gegenprobe: ohne Titel keine Daten; ohne Beschreibung steht der Titel', () => {
    expect(courseStructuredData({ ...base, title: ' ' })).toBeNull()
    expect(courseStructuredData({ ...base, description: '' })!.description).toBe('Morgenroutine in 7 Tagen')
  })
})
