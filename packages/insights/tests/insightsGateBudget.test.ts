import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InsightsPost, InsightsSource } from '../shared/insightsPost'

/**
 * DIE GESAMTFRIST DES GATES (GA1 P18, BE-008).
 *
 * `POST posts/<id>/state` ruft über `insightsPublicationGate` bis zu zwanzig
 * Quellen nacheinander ab (je bis 30 s). Reisst der Webserver nach 60 s die
 * Verbindung, sah die Redaktion einen Fehler — und der Beitrag wurde im
 * Hintergrund trotzdem veröffentlicht. Geprüft wird:
 *
 *  1. Ein Abruf, der bei Fristende noch läuft, wird NICHT weiter abgewartet:
 *     die Funktion kehrt zur Frist zurück, seine spätere Ablehnung ist
 *     gefangen (sonst schlüge Vitest mit „unhandled rejection" an).
 *  2. Jede in der Frist nicht gelesene Quelle zählt wie eine nicht lesbare:
 *     das Gate besteht NICHT (fail-closed), und `sourcesTimedOut` sagt es.
 *  3. Nach der Frist beginnt kein weiterer Abruf.
 *  4. GEGENPROBE: lesbare Quellen in der Frist ⇒ das Gate besteht.
 *
 * Keine echte Wartezeit: Frist 1 über Vitests falsche Uhr, Frist 3 über die
 * injizierte Uhr.
 */

type Page = { kind: 'text', text: string } | { kind: 'hang' }

const fetchState = vi.hoisted(() => ({
  pages: {} as Record<string, { kind: 'text', text: string } | { kind: 'hang' }>,
  calls: [] as string[],
  /** Die Ablehnung eines hängenden Abrufs — ausgelöst NACH der Frist. */
  rejectHanging: [] as ((error: Error) => void)[],
}))

vi.mock('../server/contracts/brandContract', () => {
  class BrandSiteBlockedError extends Error {
    reason: 'robots' | 'tdm'
    constructor(reason: 'robots' | 'tdm') {
      super(reason)
      this.reason = reason
    }
  }
  return {
    BrandSiteBlockedError,
    fetchBrandSiteForCheck: async (url: string) => {
      fetchState.calls.push(url)
      const page = fetchState.pages[url]
      if (!page) throw new Error('fetch failed')
      if (page.kind === 'hang') {
        return await new Promise((_resolve, reject) => { fetchState.rejectHanging.push(reject) })
      }
      return { content: { title: '', description: '', text: page.text } }
    },
  }
})

vi.stubGlobal('insightsKnownBrandIds', () => [])

const review = await import('../server/utils/insightsReview')

const URL_A = 'https://a.example/about'
const URL_B = 'https://b.example/press'

function sourceA(): InsightsSource {
  return { url: URL_A, publisher: 'A GmbH', date: '2026-01-10', kind: 'brand-site', quote: 'Wir rösten seit 1990 selbst.', license: '' }
}

function sourceB(): InsightsSource {
  return { url: URL_B, publisher: 'B Presse', date: '2026-02-01', kind: 'press', quote: 'Die Marke wächst um zehn Prozent.', license: '' }
}

const BODY_DE = [
  'Die Antwort steht vorn.',
  '',
  '## Warum rösten Marken selbst?',
  '',
  'Ein Absatz über das Rösten.',
  '',
  '## Was heisst das für euch?',
  '',
  'Ein zweiter Absatz.',
  '',
  'Was meint ihr dazu?',
].join('\n')

function articlePost(): InsightsPost {
  return {
    format: 'article',
    slug: 'warum-roester-selbst-roesten',
    slugHistory: [],
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Warum Röster selbst rösten',
    titleEn: '',
    dekDe: 'Ein Blick in die Rösterei.',
    dekEn: '',
    bodyDe: BODY_DE,
    bodyEn: '',
    translatedAt: '',
    translationModel: '',
    translationPromptVersion: '',
    translationReviewed: false,
    topics: [],
    sources: [sourceA(), sourceB()],
    brandRefs: [],
    facts: [],
    ranking: null,
    readingMinutes: 1,
    publishedAt: '2026-11-01T08:00:00.000Z',
    reviewedAt: '2026-11-01T07:00:00.000Z',
    reviewedBy: 'user-1',
    noteInternal: '',
    brief: '',
    briefModel: '',
    briefPromptVersion: '',
    briefVideoId: '',
    draftModel: '',
    draftPromptVersion: '',
  }
}

const readable: Record<string, Page> = {
  [URL_A]: { kind: 'text', text: 'Wir rösten seit 1990 selbst. Mehr auf der Seite.' },
  [URL_B]: { kind: 'text', text: 'Die Marke wächst um zehn Prozent.' },
}

beforeEach(() => {
  fetchState.pages = { ...readable }
  fetchState.calls = []
  fetchState.rejectHanging = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('die Gesamtfrist der Quellen-Abrufe', () => {
  it('liegt unter der Frist des Webservers', () => {
    expect(review.INSIGHTS_GATE_FETCH_BUDGET_MS).toBe(45_000)
    expect(review.INSIGHTS_GATE_FETCH_BUDGET_MS).toBeLessThan(60_000)
  })

  it('ein hängender Abruf wird zur Frist verlassen — das Gate besteht NICHT, nichts wird freigegeben', async () => {
    vi.useFakeTimers()
    fetchState.pages[URL_A] = { kind: 'hang' }

    let settled = false
    const verdictPromise = review.insightsPublicationGate({ next: articlePost(), brandRows: [] })
      .finally(() => { settled = true })

    await vi.advanceTimersByTimeAsync(review.INSIGHTS_GATE_FETCH_BUDGET_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const verdict = await verdictPromise

    expect(verdict.passed).toBe(false)
    expect('clearance' in verdict).toBe(false)
    // A lief in die Frist, B wurde danach gar nicht mehr begonnen.
    expect(verdict.sourcesTimedOut).toBe(2)
    expect(fetchState.calls).toEqual([URL_A])
    expect(verdict.issues.filter(issue => issue.code === 'quote_not_grounded')).toHaveLength(2)

    // Der Abruf läuft im Hintergrund aus und scheitert — gefangen.
    fetchState.rejectHanging.forEach(reject => reject(new Error('socket hang up')))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('nach der Frist (injizierte Uhr) beginnt kein weiterer Abruf; die offene Quelle zählt als nicht belegt', async () => {
    let clock = 0
    const now = () => {
      const at = clock
      clock += 30_000
      return at
    }
    // Start 0 ⇒ Frist 45 s. Vor A: 30 s (noch Zeit), vor B: 60 s (vorbei).
    const result = await review.insightsSourceTexts([sourceA(), sourceB()], { now })

    expect(fetchState.calls).toEqual([URL_A])
    expect(result.timedOut).toBe(1)
    expect(result.texts[URL_A]).toContain('Wir rösten seit 1990 selbst.')
    expect(result.texts[URL_B]).toBe('')
  })

  it('GEGENPROBE: lesbare Quellen in der Frist ⇒ das Gate besteht, nichts zählt als verspätet', async () => {
    const verdict = await review.insightsPublicationGate({ next: articlePost(), brandRows: [] })
    expect(verdict.passed).toBe(true)
    expect(verdict.sourcesTimedOut).toBe(0)
    expect(fetchState.calls).toEqual([URL_A, URL_B])
  })
})
