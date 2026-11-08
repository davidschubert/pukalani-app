import { describe, expect, it } from 'vitest'
import type { InsightsWatchItem } from '../shared/insightsWatchlist'
import {
  INSIGHTS_BRIEF_ERRORS,
  INSIGHTS_BRIEF_POLL_MS,
  INSIGHTS_BRIEF_STALL_MS,
  INSIGHTS_BRIEF_STATES,
  INSIGHTS_BRIEF_TIMEOUT_MS,
  insightsBriefErrorOrNone,
  insightsBriefPending,
  insightsBriefStartable,
  insightsBriefState,
  insightsWatchFromRadar,
} from '../shared/insightsWatchlist'
import { fromInsightsWatchItem, toInsightsWatchItem } from '../shared/insightsRows'
import type { InsightsWatchRow } from '../shared/insightsRows'

/**
 * DER LAUF AN DER ZEILE (BI3, 2026-11-08).
 *
 * Seit BI3 antwortet „Brief aus diesem Video" sofort und rechnet im
 * Hintergrund weiter (nginx gab nach 60 s auf, ein 51-Minuten-Video braucht
 * 65 — gemessen auf Prod am 2026-11-06). Damit hängt an diesen reinen Regeln
 * Geld, und zwar in BEIDE Richtungen:
 *
 *  1. ZU WEIT: eine Zeile, die während eines laufenden Laufs wieder startbar
 *     wirkt, lässt den zweiten Klick ein zweites Mal zahlen.
 *  2. ZU ENG: eine Zeile, die nach einem verwaisten Lauf für immer auf
 *     „läuft" stehen bleibt, ist ein Fundstück, das niemand mehr verarbeiten
 *     kann — ohne dass ein Mensch eine Spalte von Hand räumt.
 *
 * Jede Zusage unten hat deshalb ihre Gegenprobe.
 */

const NOW = Date.parse('2026-11-08T12:00:00.000Z')

function item(overrides: Partial<InsightsWatchItem> = {}): InsightsWatchItem {
  return {
    videoId: 'dQw4w9WgXcQ',
    verdict: 'interesting',
    note: '',
    topic: 'brand-strategy',
    addedAt: '2026-11-01T00:00:00.000Z',
    briefPostId: '',
    briefRunAt: '',
    briefError: '',
    available: true,
    refreshedAt: '',
    title: 'Ein Video',
    channelId: 'UC123',
    channelTitle: 'Ein Kanal',
    channelSubscribers: 1000,
    views: 100,
    likes: 10,
    commentCount: 1,
    publishedAt: '2026-10-01',
    ...overrides,
  }
}

/** Ein Lauf, der vor `ageMs` gebucht wurde. */
function startedAgo(ageMs: number): string {
  return new Date(NOW - ageMs).toISOString()
}

describe('die Stall-Grenze', () => {
  /**
   * DER TEUERSTE FEHLER, DEN DIESE DATEI MACHEN KANN, steht hier als Test.
   *
   * Läge die Grenze UNTERHALB der Zeitgrenze des Transports, gäbe sie die
   * Zeile frei, WÄHREND der erste Lauf noch bezahlt wird — und der zweite
   * Klick zahlte ein zweites Mal. Sie muss echt grösser sein, nicht nur
   * gleich: nach der Zeitgrenze kommt noch das Schreiben (parsen, Adresse
   * suchen, Beitrag anlegen, Zeile nachtragen).
   */
  it('liegt echt über der Zeitgrenze des Video-Laufs', () => {
    expect(INSIGHTS_BRIEF_STALL_MS).toBeGreaterThan(INSIGHTS_BRIEF_TIMEOUT_MS)
  })

  it('nennt die Zeitgrenze, die die Route dem Transport mitgibt', () => {
    expect(INSIGHTS_BRIEF_TIMEOUT_MS).toBe(180_000)
  })

  /** Der Takt muss die Grenze VIELMALS treffen, sonst bemerkt er sie nie. */
  it('wird vom Nachfrage-Takt vielfach getroffen', () => {
    expect(INSIGHTS_BRIEF_POLL_MS).toBeGreaterThan(0)
    expect(INSIGHTS_BRIEF_STALL_MS / INSIGHTS_BRIEF_POLL_MS).toBeGreaterThanOrEqual(10)
  })
})

describe('insightsBriefState', () => {
  it('kennt fünf Zustände und keinen sechsten', () => {
    expect([...INSIGHTS_BRIEF_STATES]).toEqual(['none', 'running', 'stalled', 'failed', 'done'])
  })

  it('„noch keiner": keine Buchung, kein Beitrag, kein Fehler', () => {
    expect(insightsBriefState(item(), NOW)).toBe('none')
  })

  it('„läuft": die Buchung ist frisch', () => {
    expect(insightsBriefState(item({ briefRunAt: startedAgo(30_000) }), NOW)).toBe('running')
  })

  it('„läuft" noch eine Millisekunde vor der Grenze — und danach nicht mehr', () => {
    expect(insightsBriefState(item({ briefRunAt: startedAgo(INSIGHTS_BRIEF_STALL_MS - 1) }), NOW)).toBe('running')
    expect(insightsBriefState(item({ briefRunAt: startedAgo(INSIGHTS_BRIEF_STALL_MS) }), NOW)).toBe('stalled')
  })

  it('„verschollen": die Buchung ist alt und niemand hat etwas geschrieben', () => {
    expect(insightsBriefState(item({ briefRunAt: startedAgo(10 * 60_000) }), NOW)).toBe('stalled')
  })

  it('„gescheitert": der Lauf hat seinen Grund hinterlassen', () => {
    expect(insightsBriefState(item({ briefRunAt: startedAgo(30_000), briefError: 'brief_failed' }), NOW)).toBe('failed')
  })

  /**
   * DER BEITRAG SCHLÄGT ALLES — die K5-Entscheidung „der Verweis überlebt
   * einen Fehlschlag". Ein bezahlter, angelegter Brief zählt mehr als ein
   * Fehler-Vermerk aus einem früheren Versuch.
   */
  it('„fertig" schlägt Fehler und Buchung', () => {
    expect(insightsBriefState(item({
      briefPostId: 'post1',
      briefRunAt: startedAgo(30_000),
      briefError: 'brief_failed',
    }), NOW)).toBe('done')
  })

  /** Fail-safe in die TEURE Richtung: lieber warten als zweimal zahlen. */
  it('eine Buchung in der Zukunft zählt als „läuft"', () => {
    expect(insightsBriefState(item({ briefRunAt: new Date(NOW + 60_000).toISOString() }), NOW)).toBe('running')
  })

  it('eine unlesbare Buchung ist keine Buchung', () => {
    expect(insightsBriefState(item({ briefRunAt: 'irgendwann' }), NOW)).toBe('none')
  })
})

describe('insightsBriefStartable — die Zusage für den zweiten Klick', () => {
  /** DIE GEGENPROBE: laufender Lauf ⇒ kein zweiter (bezahlter) Aufruf. */
  it('verweigert einen zweiten Lauf, solange einer läuft', () => {
    const running = item({ briefRunAt: startedAgo(45_000) })
    expect(insightsBriefState(running, NOW)).toBe('running')
    expect(insightsBriefStartable(insightsBriefState(running, NOW))).toBe(false)
  })

  it('verweigert einen zweiten Lauf, wenn der Brief schon steht', () => {
    expect(insightsBriefStartable(insightsBriefState(item({ briefPostId: 'post1' }), NOW))).toBe(false)
  })

  /** DIE GEGENPROBE: verwaister Lauf ⇒ wieder startbar, ohne Aufräumer. */
  it('lässt einen verwaisten Lauf wieder starten', () => {
    const orphan = item({ briefRunAt: startedAgo(INSIGHTS_BRIEF_STALL_MS + 1) })
    expect(insightsBriefState(orphan, NOW)).toBe('stalled')
    expect(insightsBriefStartable(insightsBriefState(orphan, NOW))).toBe(true)
  })

  it('lässt einen gescheiterten Lauf wieder starten', () => {
    const failed = item({ briefRunAt: startedAgo(60_000), briefError: 'slug_taken' })
    expect(insightsBriefStartable(insightsBriefState(failed, NOW))).toBe(true)
  })

  it('lässt eine unberührte Zeile starten', () => {
    expect(insightsBriefStartable(insightsBriefState(item(), NOW))).toBe(true)
  })

  /**
   * DIESELBE ZEILE, EINE MINUTE SPÄTER — der Übergang, auf den es ankommt:
   * ohne ihn bliebe ein verwaister Lauf für immer gesperrt.
   */
  it('derselbe Lauf ist erst gesperrt und nach der Grenze wieder frei', () => {
    const run = item({ briefRunAt: startedAgo(0) })
    expect(insightsBriefStartable(insightsBriefState(run, NOW))).toBe(false)
    expect(insightsBriefStartable(insightsBriefState(run, NOW + INSIGHTS_BRIEF_STALL_MS))).toBe(true)
  })
})

describe('insightsBriefPending — muss die Liste nachfragen?', () => {
  it('ja, solange eine Zeile läuft', () => {
    expect(insightsBriefPending([item(), item({ briefRunAt: startedAgo(10_000) })], NOW)).toBe(true)
  })

  it('nein, wenn nichts läuft', () => {
    expect(insightsBriefPending([item(), item({ briefPostId: 'post1' })], NOW)).toBe(false)
  })

  /**
   * NEIN BEI EINEM VERSCHOLLENEN LAUF — sonst fragte die Seite bis zum
   * Neuladen nach einer Antwort, die niemand mehr gibt.
   */
  it('nein bei einem verschollenen Lauf', () => {
    expect(insightsBriefPending([item({ briefRunAt: startedAgo(INSIGHTS_BRIEF_STALL_MS) })], NOW)).toBe(false)
  })

  it('nein bei einem gescheiterten Lauf', () => {
    expect(insightsBriefPending([item({ briefRunAt: startedAgo(5_000), briefError: 'brief_failed' })], NOW)).toBe(false)
  })

  it('nein bei einer leeren Liste', () => {
    expect(insightsBriefPending([], NOW)).toBe(false)
  })

  /** Der Takt hört VON SELBST auf, sobald der letzte Lauf durch ist. */
  it('hört auf, wenn der letzte Lauf fertig geworden ist', () => {
    const items = [item({ briefRunAt: startedAgo(10_000) })]
    expect(insightsBriefPending(items, NOW)).toBe(true)
    expect(insightsBriefPending([{ ...items[0]!, briefPostId: 'post1' }], NOW)).toBe(false)
  })
})

describe('insightsBriefErrorOrNone', () => {
  it('nimmt jeden Grund aus dem geschlossenen Satz', () => {
    expect([...INSIGHTS_BRIEF_ERRORS]).toEqual(['brief_failed', 'slug_taken'])
    for (const code of INSIGHTS_BRIEF_ERRORS) {
      expect(insightsBriefErrorOrNone(code)).toBe(code)
    }
  })

  /**
   * FAIL-SOFT AUF LEER und nicht auf `brief_failed`: aus einem unbekannten
   * Wert einen Fehlschlag zu machen wäre eine Behauptung über einen Lauf,
   * den niemand gesehen hat.
   */
  it('macht aus einem unbekannten Wert KEINEN Fehlschlag', () => {
    expect(insightsBriefErrorOrNone('kaputt')).toBe('')
    expect(insightsBriefErrorOrNone(undefined)).toBe('')
    expect(insightsBriefErrorOrNone('  ')).toBe('')
  })
})

describe('die Zeile trägt den Lauf (insights-010)', () => {
  function row(overrides: Partial<InsightsWatchRow> = {}): InsightsWatchRow {
    return {
      $id: 'w1',
      $sequence: 1,
      $tableId: 'insights_watchlist',
      $databaseId: 'main',
      $createdAt: '2026-11-01T00:00:00.000Z',
      $updatedAt: '2026-11-01T00:00:00.000Z',
      $permissions: [],
      videoId: 'dQw4w9WgXcQ',
      verdict: 'interesting',
      note: '',
      topic: 'brand-strategy',
      addedAt: '2026-11-01T00:00:00.000Z',
      available: true,
      refreshedAt: null,
      title: 'Ein Video',
      channelId: 'UC123',
      channelTitle: 'Ein Kanal',
      channelSubscribers: 1000,
      views: 100,
      likes: 10,
      commentCount: 1,
      publishedAt: null,
      ...overrides,
    } as InsightsWatchRow
  }

  /**
   * EINE ZEILE AUS DER ZEIT VOR insights-010 hat keinen Lauf gehabt. Ein
   * geratener Stempel zeigte an ihr für vier Minuten „läuft gerade" — an
   * JEDER Altzeile gleichzeitig.
   */
  it('liest eine Zeile ohne die neuen Spalten als „noch keiner"', () => {
    const read = toInsightsWatchItem(row())
    expect(read.briefRunAt).toBe('')
    expect(read.briefError).toBe('')
    expect(insightsBriefState(read, NOW)).toBe('none')
  })

  it('liest den Lauf und den Grund zurück', () => {
    const read = toInsightsWatchItem(row({
      briefRunAt: startedAgo(20_000),
      briefError: 'brief_failed',
    }))
    expect(read.briefRunAt).toBe(startedAgo(20_000))
    expect(read.briefError).toBe('brief_failed')
  })

  it('wirft einen unbekannten Grund aus der Spalte weg', () => {
    expect(toInsightsWatchItem(row({ briefError: 'etwas-anderes' })).briefError).toBe('')
  })

  /** Leer reist als `null` in die Spalte — wie `addedAt` und `refreshedAt`. */
  it('schreibt einen leeren Lauf als null', () => {
    expect(fromInsightsWatchItem(item()).briefRunAt).toBeNull()
    expect(fromInsightsWatchItem(item({ briefRunAt: startedAgo(0) })).briefRunAt).toBe(startedAgo(0))
  })

  /**
   * HIN UND ZURÜCK OHNE VERLUST — die Regel, an der insights-009 beinahe
   * gescheitert wäre: `fromInsightsWatchItem` schickt JEDE Spalte bei JEDEM
   * Schreibvorgang mit, also muss jede auch gelesen werden.
   */
  it('überlebt den Weg Zeile → Vertrag → Zeile', () => {
    const written = fromInsightsWatchItem(item({
      briefRunAt: startedAgo(0),
      briefError: 'slug_taken',
      briefPostId: 'post1',
    }))
    expect(written.briefError).toBe('slug_taken')
    expect(written.briefPostId).toBe('post1')
    const back = toInsightsWatchItem(row({ ...written } as Partial<InsightsWatchRow>))
    expect(back.briefRunAt).toBe(startedAgo(0))
    expect(back.briefError).toBe('slug_taken')
  })

  /** Ein frisches Fundstück aus dem Radar hat nie einen Lauf gehabt. */
  it('legt ein Fundstück aus dem Radar ohne Lauf an', () => {
    const fresh = insightsWatchFromRadar({
      videoId: 'dQw4w9WgXcQ',
      topic: 'brand-strategy',
      title: 'Ein Video',
      channelId: 'UC123',
      channelTitle: 'Ein Kanal',
      channelSubscribers: 1000,
      views: 100,
      likes: 10,
      commentCount: 1,
      publishedAt: '2026-10-01',
      fetchedAt: '2026-11-01T00:00:00.000Z',
    }, 'interesting', '2026-11-01T00:00:00.000Z')
    expect(fresh.briefRunAt).toBe('')
    expect(fresh.briefError).toBe('')
    expect(insightsBriefState(fresh, NOW)).toBe('none')
  })
})
