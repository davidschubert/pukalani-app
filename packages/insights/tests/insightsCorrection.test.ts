import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_CORRECTION_PII_RETENTION_DAYS,
  createInsightsCorrectionSubmitSchema,
  decideInsightsCorrectionQuota,
  insightsCorrectionDayKey,
  insightsCorrectionDecisionAllowed,
  insightsCorrectionHourKey,
  insightsCorrectionRetentionAt,
  insightsCorrectionSchema,
  insightsCorrectionSweepDue,
} from '../shared/insightsCorrection'

/**
 * DER KORREKTURWEG (Plan §9.3) — die Regeln, an denen später eine
 * Auskunftspflicht und eine Aufbewahrungsfrist hängen.
 *
 * JEDE REGEL HAT HIER EINE GEGENPROBE. Eine Prüfung, die nur den guten Fall
 * kennt, ist bei einer Frist wertlos: sie bliebe grün, wenn der Sweep gar
 * nichts täte.
 */

/** Die kleinste gültige Zeile — jeder Test ändert genau ein Feld daran. */
function baseCorrection(): Record<string, unknown> {
  return {
    targetKind: 'brand',
    targetId: 'brand-1',
    kind: 'correction',
    field: 'industry',
    proposed: 'gastronomy',
    reason: 'Die Marke ist ein Röster, kein Händler.',
  }
}

describe('insightsCorrectionSchema', () => {
  it('nimmt einen vollständigen Korrekturvorschlag an', () => {
    const parsed = insightsCorrectionSchema.parse(baseCorrection())
    expect(parsed.status).toBe('open')
    expect(parsed.contactEmail).toBe('')
    expect(parsed.decisionNote).toBe('')
  })

  it('schreibt die Kontakt-Adresse KLEIN — sie ist der GDPR-Lesepfad', () => {
    const parsed = insightsCorrectionSchema.parse({
      ...baseCorrection(),
      contactEmail: '  Max.Muster@Example.COM ',
    })
    expect(parsed.contactEmail).toBe('max.muster@example.com')
  })

  it('lässt eine LEERE Adresse zu — der Weg ist freiwillig', () => {
    expect(insightsCorrectionSchema.parse({ ...baseCorrection(), contactEmail: '' }).contactEmail).toBe('')
  })

  it('GEGENPROBE: eine angegebene Adresse muss eine sein', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), contactEmail: 'kein-at-zeichen' }).success).toBe(false)
  })

  it('GEGENPROBE: ein zu langes Zitat im Vorschlag fällt (300 Zeichen)', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), proposed: 'x'.repeat(301) }).success).toBe(false)
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), proposed: 'x'.repeat(300) }).success).toBe(true)
  })

  it('GEGENPROBE: ein zu langer Feldname fällt (32 Zeichen)', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), field: 'x'.repeat(33) }).success).toBe(false)
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), field: 'x'.repeat(32) }).success).toBe(true)
  })

  it('GEGENPROBE: ein zu langer Grund fällt (300 Zeichen)', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), reason: 'x'.repeat(301) }).success).toBe(false)
  })

  it('ein Entfernungs-Wunsch OHNE Begründung fällt', () => {
    const removal = { ...baseCorrection(), kind: 'removal', proposed: '', reason: '' }
    expect(insightsCorrectionSchema.safeParse(removal).success).toBe(false)
    expect(insightsCorrectionSchema.safeParse({ ...removal, reason: 'Wir wollen nicht genannt werden.' }).success).toBe(true)
  })

  it('eine Ablehnung OHNE Notiz fällt, eine Annahme ohne Notiz nicht', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), status: 'declined' }).success).toBe(false)
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), status: 'accepted' }).success).toBe(true)
  })

  it('GEGENPROBE: unbekannte Zielart und unbekannter Status fallen', () => {
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), targetKind: 'comment' }).success).toBe(false)
    expect(insightsCorrectionSchema.safeParse({ ...baseCorrection(), status: 'pending' }).success).toBe(false)
  })
})

describe('insightsCorrectionRetentionAt', () => {
  it('legt die Frist 365 Tage nach die Anlage', () => {
    const created = new Date('2026-01-01T00:00:00.000Z')
    expect(insightsCorrectionRetentionAt(created).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(INSIGHTS_CORRECTION_PII_RETENTION_DAYS).toBe(365)
  })
})

describe('insightsCorrectionSweepDue', () => {
  const now = new Date('2027-01-01T00:00:00.000Z')

  it('eine überfällige Zeile mit Adresse ist fällig', () => {
    expect(insightsCorrectionSweepDue({ retentionAt: '2026-12-31T00:00:00.000Z', contactEmail: 'a@b.de' }, now)).toBe(true)
  })

  it('EXAKT auf dem Stichtag ist fällig — die Sekunde gehört der Löschung', () => {
    expect(insightsCorrectionSweepDue({ retentionAt: now.toISOString(), contactEmail: 'a@b.de' }, now)).toBe(true)
  })

  it('GEGENPROBE: eine Sekunde zu früh ist NICHT fällig', () => {
    expect(insightsCorrectionSweepDue({ retentionAt: '2027-01-01T00:00:01.000Z', contactEmail: 'a@b.de' }, now)).toBe(false)
  })

  it('GEGENPROBE: ohne lesbares Datum wird NICHT geleert — die Zeile ist ein Nachweis', () => {
    expect(insightsCorrectionSweepDue({ contactEmail: 'a@b.de' }, now)).toBe(false)
    expect(insightsCorrectionSweepDue({ retentionAt: 'irgendwann', contactEmail: 'a@b.de' }, now)).toBe(false)
  })

  it('GEGENPROBE: eine schon geleerte Zeile bekommt keinen zweiten Schreibvorgang', () => {
    expect(insightsCorrectionSweepDue({ retentionAt: '2020-01-01T00:00:00.000Z', contactEmail: '', ipHash: '' }, now)).toBe(false)
    // Der `ipHash` allein reicht: er ist derselbe Personenbezug, nur schwächer.
    expect(insightsCorrectionSweepDue({ retentionAt: '2020-01-01T00:00:00.000Z', contactEmail: '', ipHash: 'abc' }, now)).toBe(true)
  })
})

/**
 * DIE ENTSCHEIDUNG DES BETREIBERS (BI1 I2-Rest, §9.4).
 *
 * Zwei Sperren, und beide brauchen ihre Gegenprobe: eine Regel, die nur den
 * grünen Weg kennt, bliebe grün, wenn sie gar nichts sperrte — und was hier
 * hängt, ist der NACHWEIS, dass der Korrekturweg funktioniert (Anwaltsfrage 3).
 */
describe('insightsCorrectionDecisionAllowed', () => {
  it('offen → angenommen: ja, auch ohne Notiz (die Änderung ist die Begründung)', () => {
    expect(insightsCorrectionDecisionAllowed('open', 'accepted', '')).toEqual({ ok: true })
  })

  it('offen → abgelehnt MIT Notiz: ja', () => {
    expect(insightsCorrectionDecisionAllowed('open', 'declined', 'Der Beleg nennt 1999.')).toEqual({ ok: true })
  })

  it('GEGENPROBE: offen → abgelehnt OHNE Notiz: nein', () => {
    expect(insightsCorrectionDecisionAllowed('open', 'declined', '')).toEqual({ ok: false, code: 'note_required' })
  })

  it('GEGENPROBE: Leerzeichen sind keine Begründung', () => {
    expect(insightsCorrectionDecisionAllowed('open', 'declined', '   ')).toEqual({ ok: false, code: 'note_required' })
  })

  it('GEGENPROBE: angenommen → abgelehnt: nein, eine Entscheidung wird nicht gedreht', () => {
    expect(insightsCorrectionDecisionAllowed('accepted', 'declined', 'Doch nicht.')).toEqual({ ok: false, code: 'already_decided' })
  })

  it('GEGENPROBE: DASSELBE ein zweites Mal ist auch nein — kein wanderndes `decidedAt`', () => {
    expect(insightsCorrectionDecisionAllowed('accepted', 'accepted', '')).toEqual({ ok: false, code: 'already_decided' })
    expect(insightsCorrectionDecisionAllowed('declined', 'declined', 'Nochmal.')).toEqual({ ok: false, code: 'already_decided' })
  })

  it('GEGENPROBE: die fehlende Notiz wird gar nicht mehr gefragt, wenn schon entschieden ist', () => {
    // Die Reihenfolge der zwei Sperren ist eine Aussage: „schon entschieden"
    // ist der ältere und der härtere Grund — sonst hörte der Betreiber
    // „bitte begründen" für eine Zeile, die er ohnehin nicht mehr ändern darf.
    expect(insightsCorrectionDecisionAllowed('declined', 'declined', '')).toEqual({ ok: false, code: 'already_decided' })
  })
})

// ── Der öffentliche Weg (BI1 I3, §9.5) ─────────────────────────────────────

describe('createInsightsCorrectionSubmitSchema', () => {
  const base = {
    targetKind: 'brand' as const,
    targetId: 'row-123_ab-CD',
    kind: 'correction' as const,
    field: 'foundedYear',
    proposed: '1987',
    reason: '',
    contactEmail: '',
  }

  it('nimmt einen gewöhnlichen Vorschlag an', () => {
    const parsed = createInsightsCorrectionSubmitSchema().safeParse(base)
    expect(parsed.success).toBe(true)
  })

  it('erlaubt den Honigtopf — er reist IMMER mit (.strict())', () => {
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, hp: '' }).success).toBe(true)
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, hp: 'bot' }).success).toBe(true)
  })

  it('lehnt einen UNBEKANNTEN Schlüssel ab (.strict())', () => {
    const parsed = createInsightsCorrectionSubmitSchema().safeParse({ ...base, status: 'accepted' })
    expect(parsed.success).toBe(false)
  })

  it('ein Entfernungs-Wunsch OHNE Begründung geht nicht', () => {
    const parsed = createInsightsCorrectionSubmitSchema().safeParse({ ...base, kind: 'removal', reason: '' })
    expect(parsed.success).toBe(false)
    // GEGENPROBE: mit Begründung geht er.
    const ok = createInsightsCorrectionSubmitSchema().safeParse({
      ...base,
      kind: 'removal',
      reason: 'Wir möchten nicht genannt werden.',
    })
    expect(ok.success).toBe(true)
  })

  it('prüft die Form der Ziel-Id', () => {
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, targetId: 'mit leer' }).success).toBe(false)
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, targetId: '' }).success).toBe(false)
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, targetId: 'a'.repeat(65) }).success).toBe(false)
  })

  it('schreibt eine angegebene Adresse KLEIN, leer bleibt gültig', () => {
    const parsed = createInsightsCorrectionSubmitSchema().safeParse({ ...base, contactEmail: 'Max@Example.COM' })
    expect(parsed.success && parsed.data.contactEmail).toBe('max@example.com')
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, contactEmail: '' }).success).toBe(true)
    expect(createInsightsCorrectionSubmitSchema().safeParse({ ...base, contactEmail: 'keine-adresse' }).success).toBe(false)
  })
})

describe('decideInsightsCorrectionQuota', () => {
  it('der DRITTE Vorschlag einer Stunde geht durch, der vierte nicht', () => {
    expect(decideInsightsCorrectionQuota(3, 3)).toBeNull()
    expect(decideInsightsCorrectionQuota(4, 4)).toBe('rate_limited_hour')
  })

  it('der ZEHNTE am Tag geht durch, der elfte nicht', () => {
    expect(decideInsightsCorrectionQuota(1, 10)).toBeNull()
    expect(decideInsightsCorrectionQuota(1, 11)).toBe('rate_limited_day')
  })

  it('bei Gleichstand gewinnt die STUNDE — sie ist der engere Deckel', () => {
    expect(decideInsightsCorrectionQuota(4, 11)).toBe('rate_limited_hour')
  })

  it('die Eimer haben EIGENE Namensräume — nie die des brand-Layers', () => {
    expect(insightsCorrectionHourKey('abc')).toBe('insights:correction:h:abc')
    expect(insightsCorrectionDayKey('abc')).toBe('insights:correction:d:abc')
  })
})
