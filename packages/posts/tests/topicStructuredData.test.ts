import { describe, expect, it } from 'vitest'
import { jsonLdScript } from '../../core/app/utils/jsonLd'
import { topicStructuredData } from '../shared/topicStructuredData'

/**
 * Strukturierte Daten der Community-Seiten (SU1, SEO-003). Erwartungen stehen
 * AUSGESCHRIEBEN (Beweis-Regel 1); jede Seitenart hat ihre Gegenprobe.
 */
describe('Diskussion: DiscussionForumPosting', () => {
  const base = {
    url: 'https://demo.example.test/de/discussions/praxis/p1/zehn-minuten',
    title: 'Zehn Minuten',
    body: '**Jeden** Tag zehn Minuten. Mehr nicht.',
    authorName: 'Mia',
    publishedAt: '2026-11-20T10:00:00.000+00:00',
    createdAt: '2026-11-19T10:00:00.000+00:00',
    lastActivityAt: '2026-11-21T08:00:00.000+00:00',
    categoryName: 'Praxis',
    inLanguage: 'de',
  }

  it('trägt genau die sichtbaren Angaben', () => {
    expect(topicStructuredData(base)).toEqual({
      '@type': 'DiscussionForumPosting',
      'url': 'https://demo.example.test/de/discussions/praxis/p1/zehn-minuten',
      'mainEntityOfPage': 'https://demo.example.test/de/discussions/praxis/p1/zehn-minuten',
      'headline': 'Zehn Minuten',
      'text': 'Jeden Tag zehn Minuten. Mehr nicht.',
      'author': { '@type': 'Person', 'name': 'Mia' },
      'datePublished': '2026-11-20T10:00:00.000Z',
      'dateModified': '2026-11-21T08:00:00.000Z',
      'articleSection': 'Praxis',
      'inLanguage': 'de',
    })
  })

  it('Gegenprobe: ohne Text (geschwärzt, reine Umfrage) keine Daten', () => {
    expect(topicStructuredData({ ...base, body: '' })).toBeNull()
  })

  it('ohne Titel kein headline, ohne Autorname kein author', () => {
    const graph = topicStructuredData({ ...base, title: null, authorName: '' })!
    expect(graph).not.toHaveProperty('headline')
    expect(graph).not.toHaveProperty('author')
  })
})

describe('Ausgabe', () => {
  it('ein Titel mit </script> schließt den Block nicht', () => {
    const graph = topicStructuredData({
      url: 'https://x.test/t', title: '</script><script>alert(1)</script>', body: 'Text', authorName: 'Mia',
      publishedAt: null, createdAt: null, lastActivityAt: null, categoryName: null, inLanguage: 'en',
    })
    expect(jsonLdScript(graph).innerHTML).not.toContain('</script>')
  })
})
