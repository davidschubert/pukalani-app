import { describe, expect, it } from 'vitest'
import type { InsightsChangeNote, InsightsPost } from '../shared/insightsPost'
import {
  INSIGHTS_CHANGE_NOTE_MAX,
  INSIGHTS_CHANGE_NOTES_MAX,
  insightsPostSchema,
  insightsReviewIssues,
  insightsStampChangeNotes,
} from '../shared/insightsPost'
import {
  INSIGHTS_CHANGE_DIGEST_FIELD_MAX,
  INSIGHTS_CHANGE_DIGEST_TOTAL_MAX,
  insightsChangeDigest,
  insightsChangeDigestIsEmpty,
} from '../shared/insightsChangeNote'
import { buildInsightsChangeNotePrompt, insightsChangeNoteSuggestionSchema } from '../shared/insightsPrompts'
import { insightsPublicChangeNotes, toInsightsPublicPost } from '../shared/insightsPublic'
import type { InsightsPostRow } from '../shared/insightsRows'
import { fromInsightsPost, toInsightsPost } from '../shared/insightsRows'

/**
 * DIE ÄNDERUNGSHINWEISE (2026-11-16) — die puren Regeln: wer das Datum setzt,
 * was der Leser sieht, was als Änderung zählt, und dass Prüfregel 4 auch die
 * Hinweis-Texte liest. Die Routen prüft `insightsChangeNoteRoutes.test.ts`.
 */

const NOW = '2026-11-16T12:00:00.000Z'
const OLD = '2026-10-01T08:00:00.000Z'
const OLDER = '2026-09-01T08:00:00.000Z'

function note(at: string, de: string, en = ''): InsightsChangeNote {
  return { at, de, en }
}

function post(overrides: Partial<InsightsPost> = {}): InsightsPost {
  return insightsPostSchema.parse({
    format: 'article',
    slug: 'warum-roester-selbst-roesten',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Warum Röster selbst rösten',
    dekDe: 'Ein Blick in die Rösterei.',
    bodyDe: 'Erster Absatz.\n\nZweiter Absatz mit 1990.\n\nDritter Absatz?',
    publishedAt: OLDER,
    ...overrides,
  })
}

// ── Das Datum gehört dem Server ────────────────────────────────────────────

describe('insightsStampChangeNotes', () => {
  it('ein neuer Hinweis bekommt das Datum des Servers', () => {
    expect(insightsStampChangeNotes([], [note('', 'Zahl korrigiert.')], NOW, true)).toEqual([note(NOW, 'Zahl korrigiert.')])
  })

  it('ein erfundenes oder fremdes Datum zählt als NEU und bekommt `now`', () => {
    const sent = [note('2020-01-01T00:00:00.000Z', 'Rückdatiert.')]
    expect(insightsStampChangeNotes([note(OLD, 'Alt.')], sent, NOW, true)).toEqual([note(NOW, 'Rückdatiert.')])
  })

  it('ein Bestands-Datum bleibt bei einer Textkorrektur stehen', () => {
    const current = [note(OLD, 'Zahl korigiert.')]
    expect(insightsStampChangeNotes(current, [note(OLD, 'Zahl korrigiert.', 'Figure corrected.')], NOW, true))
      .toEqual([note(OLD, 'Zahl korrigiert.', 'Figure corrected.')])
  })

  it('was nicht mehr gesendet wird, ist entfernt', () => {
    const current = [note(OLD, 'Eins.'), note(OLDER, 'Zwei.')]
    expect(insightsStampChangeNotes(current, [note(OLDER, 'Zwei.')], NOW, true)).toEqual([note(OLDER, 'Zwei.')])
  })

  it('ein doppelt gesendetes Bestands-Datum wird nur EINMAL vergeben', () => {
    const current = [note(OLD, 'Eins.')]
    expect(insightsStampChangeNotes(current, [note(OLD, 'Eins.'), note(OLD, 'Kopie.')], NOW, true))
      .toEqual([note(OLD, 'Eins.'), note(NOW, 'Kopie.')])
    // Ohne `allowNew` fällt die Kopie weg statt das alte Datum zu erben.
    expect(insightsStampChangeNotes(current, [note(OLD, 'Eins.'), note(OLD, 'Kopie.')], NOW, false))
      .toEqual([note(OLD, 'Eins.')])
  })

  it('ohne Text in beiden Sprachen fällt ein Hinweis weg — auch ein alter', () => {
    expect(insightsStampChangeNotes([note(OLD, 'Alt.')], [note(OLD, '  ', ' '), note('', '', '')], NOW, true)).toEqual([])
  })

  it('Text wird getrimmt', () => {
    expect(insightsStampChangeNotes([], [note('', '  Zahl korrigiert.  ', ' Fixed. ')], NOW, true))
      .toEqual([note(NOW, 'Zahl korrigiert.', 'Fixed.')])
  })

  it('höchstens INSIGHTS_CHANGE_NOTES_MAX', () => {
    const current = Array.from({ length: INSIGHTS_CHANGE_NOTES_MAX }, (_, index) => note(`2026-01-${String(index + 1).padStart(2, '0')}`, `Nr. ${index}`))
    const stamped = insightsStampChangeNotes(current, [note('', 'Neu.'), ...current], NOW, true)
    expect(stamped).toHaveLength(INSIGHTS_CHANGE_NOTES_MAX)
    expect(stamped[0]).toEqual(note(NOW, 'Neu.'))
  })

  it('`allowNew: false` verwirft neue Hinweise und lässt bestehende stehen', () => {
    const current = [note(OLD, 'Alt.')]
    expect(insightsStampChangeNotes(current, [note('', 'Neu.'), note(OLD, 'Alt.')], NOW, false)).toEqual([note(OLD, 'Alt.')])
  })
})

// ── Was der Leser sieht ────────────────────────────────────────────────────

describe('insightsPublicChangeNotes', () => {
  it('jüngste zuerst, unabhängig von der Reihenfolge der Liste', () => {
    const notes = [note(OLDER, 'Zwei.'), note(NOW, 'Drei.'), note(OLD, 'Eins.')]
    expect(insightsPublicChangeNotes(notes, 'de').map(entry => entry.at)).toEqual([NOW, OLD, OLDER])
  })

  it('Text der Lesersprache, sonst der der anderen; ohne Text entfällt der Hinweis', () => {
    const notes = [note(OLD, 'Nur deutsch.'), note(OLDER, 'Deutsch.', 'English.'), note(NOW, '', '')]
    expect(insightsPublicChangeNotes(notes, 'en')).toEqual([
      { at: OLD, text: 'Nur deutsch.' },
      { at: OLDER, text: 'English.' },
    ])
    expect(insightsPublicChangeNotes(notes, 'de')[1]).toEqual({ at: OLDER, text: 'Deutsch.' })
  })

  it('die öffentliche Abbildung gibt nur Hinweise mit Text hinaus', () => {
    const view = toInsightsPublicPost('p1', post({ changeNotes: [note(OLD, 'Zahl korrigiert.'), note(OLDER, '', '')] }))
    expect(view.changeNotes).toEqual([note(OLD, 'Zahl korrigiert.')])
  })
})

// ── Was als Änderung zählt ─────────────────────────────────────────────────

describe('insightsChangeDigest', () => {
  it('ein Tippfehler im Text ⇒ genau ein Absatz alt und einer neu', () => {
    const current = post()
    const next = post({ bodyDe: current.bodyDe.replace('Zweiter Absatz mit 1990.', 'Zweiter Absatz mit 1991.') })
    const digest = insightsChangeDigest(current, next)
    expect(digest.texts).toEqual([{ field: 'body', locale: 'de', removed: ['Zweiter Absatz mit 1990.'], added: ['Zweiter Absatz mit 1991.'] }])
    expect(insightsChangeDigestIsEmpty(digest)).toBe(false)
  })

  it('verschobene Absätze sind keine Änderung', () => {
    const current = post()
    const next = post({ bodyDe: 'Zweiter Absatz mit 1990.\n\nErster Absatz.\n\nDritter Absatz?' })
    expect(insightsChangeDigestIsEmpty(insightsChangeDigest(current, next))).toBe(true)
  })

  it('nur Notiz, Brief, Hinweise, Themen, Adresse oder Häkchen geändert ⇒ leer', () => {
    const current = post()
    const next = post({
      noteInternal: 'Neu.',
      brief: 'Ein neuer Auftrag.',
      changeNotes: [note('', 'Neu.')],
      topics: ['rebranding'],
      slug: 'andere-adresse',
      translationReviewed: true,
    })
    expect(insightsChangeDigestIsEmpty(insightsChangeDigest(current, next))).toBe(true)
  })

  it('eine Änderung an der UNREDIGIERTEN Zweitfassung zählt nicht — sie steht nicht draussen', () => {
    const current = post({ bodyEn: 'Machine text.' })
    const next = post({ bodyEn: 'Other machine text.' })
    expect(insightsChangeDigestIsEmpty(insightsChangeDigest(current, next))).toBe(true)
    // Gegenprobe: redigiert, also öffentlich ⇒ zählt.
    const reviewed = insightsChangeDigest(post({ bodyEn: 'Text.', translationReviewed: true }), post({ bodyEn: 'Other text.', translationReviewed: true }))
    expect(reviewed.texts.map(text => `${text.field}:${text.locale}`)).toEqual(['body:en'])
  })

  it('Quelle hinzugefügt, entfernt und geändert — mit Herausgeber, Adresse und Zitat', () => {
    const a = { url: 'https://a.example/', publisher: 'A', date: '2026-01-01', kind: 'press' as const, quote: 'Alt.', license: '' }
    const b = { url: 'https://b.example/', publisher: 'B', date: '2026-01-01', kind: 'press' as const, quote: '', license: '' }
    const c = { url: 'https://c.example/', publisher: 'C', date: '2026-01-01', kind: 'press' as const, quote: 'Neu da.', license: '' }
    const digest = insightsChangeDigest(post({ sources: [a, b] }), post({ sources: [c, { ...a, quote: 'Neu.' }] }))
    expect(digest.sources).toEqual([
      { change: 'added', publisher: 'C', url: 'https://c.example/', quote: 'Neu da.' },
      { change: 'changed', publisher: 'A', url: 'https://a.example/', quote: 'Neu.' },
      { change: 'removed', publisher: 'B', url: 'https://b.example/', quote: '' },
    ])
    // Umsortiert ist nicht geändert.
    expect(insightsChangeDigest(post({ sources: [a, b] }), post({ sources: [b, a] })).sources).toEqual([])
  })

  it('Deckel je Feld und Seite und insgesamt', () => {
    const long = 'x'.repeat(2000)
    const many = Array.from({ length: 10 }, (_, index) => `${index}${long}`).join('\n\n')
    const digest = insightsChangeDigest(
      post({ translationReviewed: true }),
      post({ translationReviewed: true, bodyDe: many, bodyEn: many, titleEn: 'T', dekEn: 'D' }),
    )
    for (const text of digest.texts) {
      expect(text.added.join('').length).toBeLessThanOrEqual(INSIGHTS_CHANGE_DIGEST_FIELD_MAX)
    }
    const total = digest.texts.reduce((sum, text) => sum + [...text.removed, ...text.added].join('').length, 0)
    expect(total).toBeLessThanOrEqual(INSIGHTS_CHANGE_DIGEST_TOTAL_MAX)
    expect(total).toBeGreaterThan(0)
  })

  it('Fakten: nur „geändert“ mit Anzahl', () => {
    const fact = { key: 'k', labelDe: 'L', labelEn: 'L', left: 'a', right: 'b', winner: 'tie' as const, sourceIndex: 0 }
    const sources = [{ url: 'https://a.example/', publisher: 'A', date: '2026-01-01', kind: 'press' as const, quote: '', license: '' }]
    const digest = insightsChangeDigest(
      post({ format: 'duel', sources, facts: [fact] }),
      post({ format: 'duel', sources, facts: [fact, { ...fact, key: 'k2' }] }),
    )
    expect(digest.facts).toEqual({ changed: true, count: 2 })
    expect(digest.ranking.changed).toBe(false)
  })
})

// ── Ablage ─────────────────────────────────────────────────────────────────

describe('Zeile ⇄ Vertrag', () => {
  const meta = { $id: 'p1', $createdAt: '', $updatedAt: '', $permissions: [], $sequence: 1, $databaseId: 'main', $tableId: 'insights_posts' }

  it('überlebt die Rundreise', () => {
    const original = post({ changeNotes: [note(OLD, 'Zahl korrigiert.', 'Fixed a figure.')] })
    const row = { ...meta, ...fromInsightsPost(original) } as unknown as InsightsPostRow
    expect(toInsightsPost(row).changeNotes).toEqual(original.changeNotes)
  })

  it('fehlende Spalte ⇒ leere Liste; kaputte Einträge fallen einzeln weg', () => {
    const { changeNotes: _dropped, ...data } = fromInsightsPost(post())
    expect(toInsightsPost({ ...meta, ...data } as unknown as InsightsPostRow).changeNotes).toEqual([])
    const broken = JSON.stringify([{ at: OLD, de: 'Gut.', en: '' }, { at: 5 }, 'kaputt', { at: OLDER, de: 'x'.repeat(INSIGHTS_CHANGE_NOTE_MAX + 1) }])
    expect(toInsightsPost({ ...meta, ...data, changeNotes: broken } as unknown as InsightsPostRow).changeNotes)
      .toEqual([note(OLD, 'Gut.')])
    expect(toInsightsPost({ ...meta, ...data, changeNotes: 'kein json' } as unknown as InsightsPostRow).changeNotes).toEqual([])
  })
})

// ── Prüfregel 4 ────────────────────────────────────────────────────────────

describe('Prüfregel 4 liest die Hinweis-Texte', () => {
  const flagText = (text: string) => (text.includes('billig') ? ['disparagement'] : [])

  it('trifft einen Hinweis — in beiden Sprachen, mit seiner Stelle', () => {
    const issues = insightsReviewIssues(post({ changeNotes: [note(OLD, 'Gut.'), note(OLD, 'Ok.', 'billig')] }), { flagText })
    expect(issues).toContainEqual({ code: 'disparagement', at: { kind: 'changeNote', index: 1 }, detail: 'disparagement' })
  })

  it('Gegenprobe: ein sauberer Hinweis ergibt nichts', () => {
    const issues = insightsReviewIssues(post({ changeNotes: [note(OLD, 'Zahl korrigiert.')] }), { flagText })
    expect(issues.filter(issue => issue.at?.kind === 'changeNote')).toEqual([])
  })
})

// ── Prompt und Antwort ─────────────────────────────────────────────────────

describe('Hinweis-Prompt und Antwort', () => {
  const digest = insightsChangeDigest(post(), post({ bodyDe: post().bodyDe.replace('1990', '1991') }))

  it('führt kein gerades Anführungszeichen nach einem deutschen vor (Massstab: check:prompt-quotes)', () => {
    const prompt = buildInsightsChangeNotePrompt(digest)
    expect(/„[^“"\n]{0,120}"/.test(prompt)).toBe(false)
    expect(prompt).toContain('Zweiter Absatz mit 1991.')
    expect(prompt).toContain('Corrected the 2024 revenue figure')
  })

  it('klemmt statt abzulehnen: zu lang gekürzt, fehlende Sprache leer, kein Objekt ⇒ beide leer', () => {
    const long = 'a'.repeat(INSIGHTS_CHANGE_NOTE_MAX + 50)
    expect(insightsChangeNoteSuggestionSchema.parse({ de: long, en: 5 })).toEqual({ de: 'a'.repeat(INSIGHTS_CHANGE_NOTE_MAX), en: '' })
    expect(insightsChangeNoteSuggestionSchema.parse({ de: 'Zeile\neins.' })).toEqual({ de: 'Zeile eins.', en: '' })
    expect(insightsChangeNoteSuggestionSchema.parse('kein Objekt')).toEqual({ de: '', en: '' })
  })
})
