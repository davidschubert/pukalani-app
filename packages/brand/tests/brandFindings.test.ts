import { describe, expect, it } from 'vitest'
import { createBrandSessionReviewSchema, brandFindingIsUsable } from '../schemas/brandReview'
import {
  BRAND_FINDING_KINDS,
  BRAND_REVIEW_FINDINGS_MAX,
  BRAND_REVIEW_FINDING_KINDS,
  BRAND_REVIEW_LIST_MAX,
  blockingFindingSlots,
  brandFindingKey,
  needsStageTwo,
} from '../shared/brandFindings'
import { pickNextSession } from '../shared/brandJourney'
import type { BrandSessionState } from '../shared/brandJourney'
import type { BrandSlotStateFacts } from '../shared/slotRegistry'

/**
 * DIE REINEN REGELN DES SPEZIALISTEN (BW2 Paket 4, Plan §4/§7/§8).
 *
 * Hier läuft kein Modell und keine Route: geprüft wird, was OHNE Anbieter
 * entscheidbar ist — die Dedup-Regel, die Entscheidung über den teuren zweiten
 * Aufruf, die Sperre der Abnahme, die adaptive Wahl und vor allem das, was das
 * Zod-Schema VERWIRFT. Genau dieser letzte Punkt ist der teuerste, wenn er
 * fehlt: ein Konflikt mit einer erfundenen Feld-Id wäre ein Chip mit totem
 * Link UND eine Sperre, die niemand auflösen kann.
 */

describe('brandFindingKey — dieselbe Sache ist derselbe Schlüssel', () => {
  it('ignoriert die Reihenfolge der Felder', () => {
    expect(brandFindingKey({ kind: 'conflict', slots: ['b.purpose', 'c.conflictRule'] }))
      .toBe(brandFindingKey({ kind: 'conflict', slots: ['c.conflictRule', 'b.purpose'] }))
  })

  it('unterscheidet die Arten', () => {
    expect(brandFindingKey({ kind: 'conflict', slots: ['a.pitch'] }))
      .not.toBe(brandFindingKey({ kind: 'gap', slots: ['a.pitch'] }))
  })

  it('GEGENPROBE: andere Felder, anderer Schlüssel', () => {
    expect(brandFindingKey({ kind: 'conflict', slots: ['b.purpose', 'c.final'] }))
      .not.toBe(brandFindingKey({ kind: 'conflict', slots: ['b.purpose', 'c.conflictRule'] }))
  })
})

describe('needsStageTwo — der teure Blick nur, wo er etwas kostet', () => {
  it('läuft bei einem Konflikt', () => {
    expect(needsStageTwo([{ kind: 'conflict' }])).toBe(true)
  })

  it('läuft bei einem betroffenen Feld', () => {
    expect(needsStageTwo([{ kind: 'gap' }, { kind: 'affected' }])).toBe(true)
  })

  it('läuft NICHT bei einer blossen Lücke — sie kostet niemanden etwas', () => {
    expect(needsStageTwo([{ kind: 'gap' }, { kind: 'gap' }])).toBe(false)
  })

  it('läuft NICHT ohne Befunde — der Normalfall', () => {
    expect(needsStageTwo([])).toBe(false)
  })
})

describe('blockingFindingSlots — was ein Kapitel sperrt (§5a Schritt 3)', () => {
  const rows = [
    { kind: 'conflict' as const, status: 'open' as const, slots: ['b.purpose', 'c.conflictRule'] },
    { kind: 'gap' as const, status: 'open' as const, slots: ['c.final'] },
    { kind: 'conflict' as const, status: 'dismissed' as const, slots: ['c.definitions', 'a.pitch'] },
  ]

  it('nennt das Feld DIESES Kapitels, an dem ein offener Konflikt hängt', () => {
    expect(blockingFindingSlots(rows, ['c.conflictRule', 'c.final', 'c.definitions']))
      .toEqual(['c.conflictRule'])
  })

  it('sperrt AUCH das andere Kapitel — ein Konflikt verbindet zwei', () => {
    expect(blockingFindingSlots(rows, ['b.purpose'])).toEqual(['b.purpose'])
  })

  it('GEGENPROBE: eine Lücke sperrt nicht, ein entschiedener Konflikt auch nicht', () => {
    expect(blockingFindingSlots(rows, ['c.final', 'c.definitions'])).toEqual([])
  })
})

describe('pickNextSession — adaptiv, aber nie ausserhalb der Registry (§6)', () => {
  /** Kapitel C: alles bestätigt bis auf `c.livedExamples` und `c.conflictRule`. */
  const slots: Record<string, BrandSlotStateFacts> = {
    'c.discovery1': { hasValue: true, confirmed: true },
    'c.discovery2': { hasValue: true, confirmed: true },
    'c.discovery3': { hasValue: true, confirmed: true },
    'c.candidates': { hasValue: true, confirmed: true },
    'c.final': { hasValue: true, confirmed: true },
    'c.definitions': { hasValue: true, confirmed: true },
  }
  const sessions: Record<string, BrandSessionState> = {
    'c.livedExamples': 'open',
    'c.conflictRule': 'open',
    'c.teamFilter': 'open',
    'b.purpose': 'open',
    'c.final': 'done',
    'd.hypothesis': 'locked',
  }

  it('folgt dem Vorschlag, wenn er eine OFFENE Session dieses Kapitels ist', () => {
    expect(pickNextSession('values', { slots, sessions }, 'c.conflictRule'))
      .toEqual({ stepKey: 'values', sessionKey: 'c.conflictRule' })
  })

  it('ohne Vorschlag gilt die Grundfassung (Registry-Reihenfolge)', () => {
    expect(pickNextSession('values', { slots, sessions }, null))
      .toEqual({ stepKey: 'values', sessionKey: 'c.livedExamples' })
  })

  it('GEGENPROBE: ein Vorschlag aus einem FREMDEN Kapitel fällt durch', () => {
    expect(pickNextSession('values', { slots, sessions }, 'b.purpose'))
      .toEqual({ stepKey: 'values', sessionKey: 'c.livedExamples' })
  })

  it('GEGENPROBE: eine GESPERRTE Session fällt durch', () => {
    expect(pickNextSession('archetype', { slots, sessions }, 'd.hypothesis')?.sessionKey)
      .not.toBe('d.hypothesis')
  })

  it('GEGENPROBE: eine ERLEDIGTE Session fällt durch', () => {
    expect(pickNextSession('values', { slots, sessions }, 'c.final'))
      .toEqual({ stepKey: 'values', sessionKey: 'c.livedExamples' })
  })

  it('GEGENPROBE: eine erfundene Id fällt durch', () => {
    expect(pickNextSession('values', { slots, sessions }, 'c.erfunden'))
      .toEqual({ stepKey: 'values', sessionKey: 'c.livedExamples' })
  })
})

describe('brandFindingIsUsable — die Zahl zwei ist nicht verhandelbar', () => {
  it('ein Konflikt braucht GENAU zwei bekannte Felder', () => {
    expect(brandFindingIsUsable({ kind: 'conflict', slots: ['b.purpose', 'c.final'] })).toBe(true)
  })

  it('GEGENPROBE: ein Konflikt mit EINEM Feld ist keiner', () => {
    expect(brandFindingIsUsable({ kind: 'conflict', slots: ['b.purpose'] })).toBe(false)
  })

  it('GEGENPROBE: zweimal dasselbe Feld ist kein Widerspruch', () => {
    expect(brandFindingIsUsable({ kind: 'conflict', slots: ['b.purpose', 'b.purpose'] })).toBe(false)
  })

  it('GEGENPROBE: ein unbekanntes Feld fällt durch', () => {
    expect(brandFindingIsUsable({ kind: 'conflict', slots: ['b.purpose', 'b.erfunden'] })).toBe(false)
    expect(brandFindingIsUsable({ kind: 'gap', slots: ['x.gibtEsNicht'] })).toBe(false)
  })

  it('eine Lücke braucht genau EIN Feld', () => {
    expect(brandFindingIsUsable({ kind: 'gap', slots: ['c.final'] })).toBe(true)
    expect(brandFindingIsUsable({ kind: 'gap', slots: ['c.final', 'b.purpose'] })).toBe(false)
  })
})

describe('createBrandSessionReviewSchema — der Umschlag ist streng, die Befunde einzeln', () => {
  const parse = (raw: unknown) => createBrandSessionReviewSchema('session').safeParse(raw)

  const good = {
    goalReached: false,
    missing: ['nennt keinen Moment'],
    notes: ['Sie erzählen gern über den Vater.'],
    findings: [{ kind: 'conflict', slots: ['b.purpose', 'c.final'], why: 'reibt sich' }],
    nextSession: 'c.conflictRule',
  }

  it('nimmt eine gültige Antwort an', () => {
    const result = parse(good)
    expect(result.success).toBe(true)
    expect(result.success && result.data.findings).toHaveLength(1)
    expect(result.success && result.data.goalReached).toBe(false)
    expect(result.success && result.data.nextSession).toBe('c.conflictRule')
  })

  it('VERWIRFT den einzelnen ungültigen Befund und behält die guten', () => {
    const result = parse({
      ...good,
      findings: [
        { kind: 'conflict', slots: ['b.purpose', 'c.final'], why: 'reibt sich' },
        // einer statt zwei
        { kind: 'conflict', slots: ['b.purpose'], why: 'halb' },
        // unbekanntes Feld
        { kind: 'gap', slots: ['b.erfunden'], why: 'fehlt' },
        // kaputte Form
        { kind: 'unfug', slots: ['b.purpose'], why: 'was' },
      ],
    })
    expect(result.success).toBe(true)
    expect(result.success && result.data.findings.map(f => f.slots)).toEqual([['b.purpose', 'c.final']])
  })

  it('dedupliziert innerhalb EINER Antwort', () => {
    const result = parse({
      ...good,
      findings: [
        { kind: 'conflict', slots: ['b.purpose', 'c.final'], why: 'so' },
        { kind: 'conflict', slots: ['c.final', 'b.purpose'], why: 'anders formuliert' },
      ],
    })
    expect(result.success && result.data.findings).toHaveLength(1)
  })

  it('deckelt Listen und Befunde', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      kind: 'gap',
      slots: [['a.pitch', 'a.origin', 'a.oneThing', 'a.challenge', 'a.complaints',
        'b.purpose', 'b.vision', 'b.mission', 'c.final'][index]],
      why: `Lücke ${index}`,
    }))
    const result = parse({ ...good, missing: ['a', 'b', 'c', 'd'], notes: ['1', '2', '3', '4'], findings: many })
    expect(result.success && result.data.missing).toHaveLength(BRAND_REVIEW_LIST_MAX)
    expect(result.success && result.data.notes).toHaveLength(BRAND_REVIEW_LIST_MAX)
    expect(result.success && result.data.findings).toHaveLength(BRAND_REVIEW_FINDINGS_MAX)
  })

  it('GEGENPROBE: ein kaputter UMSCHLAG scheitert ganz (⇒ fail-soft in der Route)', () => {
    expect(parse({ notes: 'kein Array' }).success).toBe(false)
    expect(parse('gar kein Objekt').success).toBe(false)
    expect(parse({ goalReached: 'ja' }).success).toBe(false)
  })

  it('`affected` gibt es NUR im correct-Modus', () => {
    const withAffected = { ...good, affected: ['c.final', 'c.final', ' b.purpose '] }
    const session = createBrandSessionReviewSchema('session').safeParse(withAffected)
    expect(session.success && 'affected' in session.data).toBe(false)

    const correct = createBrandSessionReviewSchema('correct').safeParse(withAffected)
    expect(correct.success && correct.data.affected).toEqual(['c.final', 'b.purpose'])
  })

  it('ein leerer `nextSession`-String ist `null`', () => {
    const result = parse({ ...good, nextSession: '  ' })
    expect(result.success && result.data.nextSession).toBeNull()
  })
})

/**
 * DIE ART `market` (MV1 M3) — sie ist ein HINWEIS, kein Zwang.
 *
 * Der Plan sagt es zweimal (§2.3 Nr. 4, §2.7): Markt-Befunde „erscheinen als
 * Chips an den eigenen Feldern wie Konflikte, sperren aber NICHTS". Weil das
 * eine Zusage über eine ABWESENHEIT ist, braucht sie einen eigenen Wächter:
 * ein zusätzliches `||` in `blockingFindingSlots` fiele sonst niemandem auf —
 * bis ein Kunde vor einer Abnahme steht, die er nicht öffnen kann.
 */
describe('market-Befunde sperren nichts', () => {
  const slots = ['b.positioningFirstChoice', 'a.pitch']

  it('ist eine bekannte Art', () => {
    expect(BRAND_FINDING_KINDS).toContain('market')
  })

  it('steht NICHT in der Menge, die der Spezialist antworten darf', () => {
    // Sonst könnte ein Schliess-Aufruf einen „Markt-Befund" behaupten, ohne je
    // einen Markt gesehen zu haben.
    expect(BRAND_REVIEW_FINDING_KINDS).not.toContain('market')
  })

  it('sperrt die Abnahme nicht — auch nicht offen', () => {
    expect(blockingFindingSlots(
      [{ kind: 'market', status: 'open', slots: ['b.positioningFirstChoice'] }],
      slots,
    )).toEqual([])
  })

  it('GEGENPROBE: ein offener `conflict` an DENSELBEN Feldern sperrt sehr wohl', () => {
    expect(blockingFindingSlots(
      [{ kind: 'conflict', status: 'open', slots: ['b.positioningFirstChoice', 'a.pitch'] }],
      slots,
    )).toEqual(['b.positioningFirstChoice', 'a.pitch'])
  })

  it('löst auch keine zweite Stufe aus — er entsteht gar nicht im Schliessen', () => {
    expect(needsStageTwo([{ kind: 'market' }])).toBe(false)
    // GEGENPROBE: die zwei Arten, die etwas kosten, tun es.
    expect(needsStageTwo([{ kind: 'conflict' }])).toBe(true)
  })

  it('dedupliziert wie jede andere Art — Art plus sortierte Felder', () => {
    expect(brandFindingKey({ kind: 'market', slots: ['a.pitch'] }))
      .toBe(brandFindingKey({ kind: 'market', slots: ['a.pitch'] }))
    expect(brandFindingKey({ kind: 'market', slots: ['a.pitch'] }))
      .not.toBe(brandFindingKey({ kind: 'gap', slots: ['a.pitch'] }))
  })
})
