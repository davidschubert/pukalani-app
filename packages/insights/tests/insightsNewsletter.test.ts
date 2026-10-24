import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_NEWSLETTER_DAY_LIMIT,
  INSIGHTS_NEWSLETTER_FORBIDDEN_CADENCE_WORDS,
  INSIGHTS_NEWSLETTER_HOUR_LIMIT,
  INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS,
  INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS,
  INSIGHTS_NEWSLETTER_SOURCE_MAX,
  createInsightsNewsletterSubscribeSchema,
  createInsightsNewsletterTokenSchema,
  decideInsightsNewsletterQuota,
  decideInsightsNewsletterUnsubscribe,
  insightsNewsletterAnonymizedEmail,
  insightsNewsletterConfirmMailCopy,
  insightsNewsletterIsAnonymized,
  insightsNewsletterPendingPurgeDue,
  insightsNewsletterPiiSweepDue,
  insightsNewsletterRetentionAt,
  insightsNewsletterTokenExpired,
  insightsNewsletterTokenExpiry,
} from '../shared/insightsNewsletter'
import { insightsNewsletterEnabled } from '../shared/insightsPublic'
import {
  insightsNewsletterUnsubToken,
  readInsightsNewsletterUnsubToken,
} from '../server/utils/insightsNewsletter'

/**
 * DER NEWSLETTER VON BRAND INSIGHTS (BI1 I5a, Plan §9.3a).
 *
 * Geprüft werden die Zusagen, die kein Typ hält — jede mit ihrer Gegenprobe,
 * weil eine Regel ohne Gegenprobe immer grün ist:
 *
 *  1. DER RIEGEL IST FAIL-CLOSED — nur echtes `true` öffnet.
 *  2. DAS VERSPRECHEN HAT KEINEN TAKT (Davids Entscheidung 2026-10-24): weder
 *     in den Mail-Texten noch in den Locale-Werten steht „wöchentlich",
 *     „jede Woche" oder „weekly".
 *  3. JEDE MAIL TRÄGT DEN ABMELDE-LINK — auch die Bestätigungs-Mail.
 *  4. DIE ADRESSE WIRD NORMALISIERT, nicht nur geprüft (Lesepfad des
 *     Unique-Index UND des GDPR-Contributors).
 *  5. EIN LANGER SLUG KOSTET KEINEN EINTRAG: `source` wird gekürzt, nicht
 *     abgelehnt.
 *  6. DER ABGELEITETE ABMELDE-TOKEN gilt nur mit richtiger Signatur — und ist
 *     aus der Zeile allein wieder herstellbar (das ist der ganze Grund für
 *     die Ableitung).
 *  7. DIE ZWEI SWEEP-REGELN greifen auf verschiedene Zeilen und fassen eine
 *     bestätigte, aktive Zeile NIE an.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const de = JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')) as Record<string, unknown>
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8')) as Record<string, unknown>

/** Alle Zeichenketten unterhalb eines Schlüssels — flach, egal wie tief. */
function stringsUnder(source: Record<string, unknown>, path: string[]): string[] {
  let node: unknown = source
  for (const key of path) {
    node = (node as Record<string, unknown> | undefined)?.[key]
  }
  const found: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') found.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(node)
  return found
}

const DAY_MS = 24 * 60 * 60 * 1000

describe('insightsNewsletterEnabled — der Riegel', () => {
  it('öffnet NUR bei echtem true', () => {
    expect(insightsNewsletterEnabled(true)).toBe(true)
  })

  it('bleibt bei allem anderen zu (fail-closed)', () => {
    for (const raw of [false, undefined, null, 0, 1, 'true', 'yes', [], {}, 'false']) {
      expect(insightsNewsletterEnabled(raw)).toBe(false)
    }
  })
})

describe('Das Versprechen hat keinen Takt', () => {
  it('nennt in beiden Mail-Fassungen keinen Takt', () => {
    for (const locale of ['de', 'en'] as const) {
      const copy = insightsNewsletterConfirmMailCopy(locale, {
        confirmUrl: 'https://branding.supply/newsletter/confirm?token=t',
        unsubscribeUrl: 'https://branding.supply/newsletter/unsubscribe?token=u',
      })
      const haystack = `${copy.subject}\n${copy.text}`.toLowerCase()
      for (const word of INSIGHTS_NEWSLETTER_FORBIDDEN_CADENCE_WORDS) {
        expect(haystack).not.toContain(word)
      }
    }
  })

  it('nennt in keiner Locale-Zeile einen Takt', () => {
    for (const source of [de, en]) {
      const values = stringsUnder(source, ['insights', 'newsletter'])
      // Gegenprobe gegen den leeren Durchlauf: ohne Schlüssel wäre dieser
      // Test tautologisch grün.
      expect(values.length).toBeGreaterThan(20)
      for (const value of values) {
        for (const word of INSIGHTS_NEWSLETTER_FORBIDDEN_CADENCE_WORDS) {
          expect(value.toLowerCase()).not.toContain(word)
        }
      }
    }
  })

  it('sagt dafür, WANN geschrieben wird — in beiden Sprachen', () => {
    expect(insightsNewsletterConfirmMailCopy('de', { confirmUrl: 'c', unsubscribeUrl: 'u' }).text)
      .toContain('wenn ein neues Stück erscheint')
    expect(insightsNewsletterConfirmMailCopy('en', { confirmUrl: 'c', unsubscribeUrl: 'u' }).text)
      .toContain('when a new piece is out')
  })

  it('trägt in JEDER Mail beide Links — auch die Bestätigungs-Mail', () => {
    for (const locale of ['de', 'en'] as const) {
      const copy = insightsNewsletterConfirmMailCopy(locale, {
        confirmUrl: 'https://branding.supply/newsletter/confirm?token=abc',
        unsubscribeUrl: 'https://branding.supply/newsletter/unsubscribe?token=xyz',
      })
      expect(copy.text).toContain('/newsletter/confirm?token=abc')
      expect(copy.text).toContain('/newsletter/unsubscribe?token=xyz')
      // Kein HTML, keine spitzen Klammern (die Mail geht als reiner Text raus).
      expect(copy.text).not.toMatch(/[<>]/)
    }
  })
})

describe('createInsightsNewsletterSubscribeSchema', () => {
  it('trimmt und schreibt die Adresse klein — sie ist der Lesepfad', () => {
    const parsed = createInsightsNewsletterSubscribeSchema().parse({ email: '  Aloha@Example.COM ' })
    expect(parsed.email).toBe('aloha@example.com')
    expect(parsed.locale).toBe('en')
    expect(parsed.source).toBe('')
  })

  it('lehnt eine kaputte Adresse ab', () => {
    expect(createInsightsNewsletterSubscribeSchema().safeParse({ email: 'kein-mail' }).success).toBe(false)
    expect(createInsightsNewsletterSubscribeSchema().safeParse({ email: '' }).success).toBe(false)
  })

  it('erlaubt den Honigtopf (sonst verriete ein 400 die Falle)', () => {
    const parsed = createInsightsNewsletterSubscribeSchema().parse({ email: 'a@b.de', hp: 'bot' })
    expect(parsed.hp).toBe('bot')
  })

  it('weist ein unbekanntes Feld ab (.strict)', () => {
    const result = createInsightsNewsletterSubscribeSchema().safeParse({ email: 'a@b.de', confirmedAt: 'jetzt' })
    expect(result.success).toBe(false)
  })

  it('KÜRZT eine zu lange Quelle statt den Eintrag abzulehnen', () => {
    const longSlug = `post:${'a'.repeat(160)}`
    const parsed = createInsightsNewsletterSubscribeSchema().parse({ email: 'a@b.de', source: longSlug })
    expect(parsed.source).toHaveLength(INSIGHTS_NEWSLETTER_SOURCE_MAX)
    expect(parsed.source.startsWith('post:')).toBe(true)
  })

  it('nimmt nur die zwei Sprachen', () => {
    expect(createInsightsNewsletterSubscribeSchema().parse({ email: 'a@b.de', locale: 'de' }).locale).toBe('de')
    expect(createInsightsNewsletterSubscribeSchema().safeParse({ email: 'a@b.de', locale: 'fr' }).success).toBe(false)
  })
})

describe('createInsightsNewsletterTokenSchema', () => {
  it('nimmt einen echten Token', () => {
    expect(createInsightsNewsletterTokenSchema().parse({ token: 'a'.repeat(64) }).token).toHaveLength(64)
    // Der abgeleitete Abmelde-Token trägt einen Punkt — er muss durch.
    expect(createInsightsNewsletterTokenSchema()
      .safeParse({ token: `${'r'.repeat(20)}.${'b'.repeat(32)}` }).success).toBe(true)
  })

  it('lehnt zu kurz, zu lang und fremde Zeichen ab', () => {
    const schema = createInsightsNewsletterTokenSchema()
    expect(schema.safeParse({ token: 'abc' }).success).toBe(false)
    expect(schema.safeParse({ token: 'a'.repeat(400) }).success).toBe(false)
    expect(schema.safeParse({ token: `${'a'.repeat(40)} oder 1=1` }).success).toBe(false)
  })
})

describe('Die Frist des Bestätigungs-Links', () => {
  it('liegt 24 Stunden in der Zukunft', () => {
    const now = new Date('2026-10-24T10:00:00.000Z')
    expect(insightsNewsletterTokenExpiry(now)).toBe('2026-10-25T10:00:00.000Z')
  })

  it('gilt ohne lesbares Datum als abgelaufen (fail-closed)', () => {
    expect(insightsNewsletterTokenExpired('', new Date())).toBe(true)
    expect(insightsNewsletterTokenExpired(undefined, new Date())).toBe(true)
    expect(insightsNewsletterTokenExpired('morgen', new Date())).toBe(true)
  })

  it('gilt in der Zukunft NICHT als abgelaufen (Gegenprobe)', () => {
    const now = new Date('2026-10-24T10:00:00.000Z')
    expect(insightsNewsletterTokenExpired(insightsNewsletterTokenExpiry(now), now)).toBe(false)
  })
})

describe('decideInsightsNewsletterQuota', () => {
  it('lässt den dritten Eintrag einer Stunde durch und bremst den vierten', () => {
    expect(decideInsightsNewsletterQuota(INSIGHTS_NEWSLETTER_HOUR_LIMIT, 1)).toBeNull()
    expect(decideInsightsNewsletterQuota(INSIGHTS_NEWSLETTER_HOUR_LIMIT + 1, 1)).toBe('rate_limited_hour')
  })

  it('bremst den Tag auch bei freier Stunde', () => {
    expect(decideInsightsNewsletterQuota(1, INSIGHTS_NEWSLETTER_DAY_LIMIT)).toBeNull()
    expect(decideInsightsNewsletterQuota(1, INSIGHTS_NEWSLETTER_DAY_LIMIT + 1)).toBe('rate_limited_day')
  })

  it('lässt bei Gleichstand die STUNDE gewinnen (die kürzere Auskunft)', () => {
    expect(decideInsightsNewsletterQuota(99, 99)).toBe('rate_limited_hour')
  })
})

describe('Der abgeleitete Abmelde-Token', () => {
  const secret = 'geheim-und-nur-hier'

  it('findet seine Zeile wieder — aus der Zeile allein gebildet', () => {
    const token = insightsNewsletterUnsubToken('row-1', secret)
    expect(readInsightsNewsletterUnsubToken(token, secret)).toBe('row-1')
  })

  it('gilt NICHT mit falscher Signatur, falschem Geheimnis oder ohne Form', () => {
    const token = insightsNewsletterUnsubToken('row-1', secret)
    expect(readInsightsNewsletterUnsubToken(token, 'anderes-geheimnis')).toBeNull()
    expect(readInsightsNewsletterUnsubToken(`${token}x`, secret)).toBeNull()
    expect(readInsightsNewsletterUnsubToken('row-1', secret)).toBeNull()
    expect(readInsightsNewsletterUnsubToken('.abc', secret)).toBeNull()
    // Die Zeilen-Id einer FREMDEN Zeile mit der Signatur dieser hier.
    const signature = token.slice(token.lastIndexOf('.') + 1)
    expect(readInsightsNewsletterUnsubToken(`row-2.${signature}`, secret)).toBeNull()
  })

  it('passt in das Token-Schema der Route', () => {
    const token = insightsNewsletterUnsubToken('65f0c2a1b2c3d4e5f6a7', secret)
    expect(createInsightsNewsletterTokenSchema().safeParse({ token }).success).toBe(true)
  })
})

describe('decideInsightsNewsletterUnsubscribe', () => {
  it('löscht eine NIE bestätigte Zeile — es gab keine Einwilligung', () => {
    expect(decideInsightsNewsletterUnsubscribe({ confirmedAt: '', unsubscribedAt: '' })).toBe('delete')
  })

  it('stempelt eine bestätigte Zeile — sie ist der Nachweis', () => {
    expect(decideInsightsNewsletterUnsubscribe({ confirmedAt: '2026-10-01T00:00:00.000Z', unsubscribedAt: '' }))
      .toBe('mark')
  })

  it('tut beim zweiten Klick nichts (idempotent)', () => {
    expect(decideInsightsNewsletterUnsubscribe({
      confirmedAt: '2026-10-01T00:00:00.000Z',
      unsubscribedAt: '2026-10-02T00:00:00.000Z',
    })).toBe('noop')
  })
})

describe('Die Aufbewahrungs-Frist', () => {
  it('liegt 12 Monate (365 Tage) nach dem Abmelden', () => {
    const from = new Date('2026-10-24T10:00:00.000Z')
    expect(insightsNewsletterRetentionAt(from).getTime() - from.getTime())
      .toBe(INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS * DAY_MS)
  })

  it('kennt den Platzhalter, der an die Stelle der Adresse tritt', () => {
    expect(insightsNewsletterAnonymizedEmail('row-9')).toBe('removed:row-9')
    expect(insightsNewsletterIsAnonymized('removed:row-9')).toBe(true)
    expect(insightsNewsletterIsAnonymized('aloha@example.com')).toBe(false)
    expect(insightsNewsletterIsAnonymized('')).toBe(false)
  })
})

describe('Sweep-Regel 1 — unbestätigte Zeilen werden gelöscht', () => {
  const now = new Date('2026-10-24T10:00:00.000Z')
  const overdue = new Date(now.getTime() - (INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS + 1) * DAY_MS).toISOString()
  const fresh = new Date(now.getTime() - 1 * DAY_MS).toISOString()

  it('greift, wenn der Link mehr als 30 Tage her ist', () => {
    expect(insightsNewsletterPendingPurgeDue({ confirmedAt: '', unsubscribedAt: '', tokenExpiresAt: overdue }, now))
      .toBe(true)
  })

  it('greift NICHT bei einem frisch abgelaufenen Link (Gegenprobe)', () => {
    expect(insightsNewsletterPendingPurgeDue({ confirmedAt: '', unsubscribedAt: '', tokenExpiresAt: fresh }, now))
      .toBe(false)
  })

  it('fasst eine BESTÄTIGTE Zeile nie an — auch nicht mit altem Token', () => {
    expect(insightsNewsletterPendingPurgeDue({
      confirmedAt: '2026-01-01T00:00:00.000Z',
      unsubscribedAt: '',
      tokenExpiresAt: overdue,
    }, now)).toBe(false)
  })

  it('lässt eine abgemeldete Zeile der zweiten Regel', () => {
    expect(insightsNewsletterPendingPurgeDue({
      confirmedAt: '',
      unsubscribedAt: '2026-02-01T00:00:00.000Z',
      tokenExpiresAt: overdue,
    }, now)).toBe(false)
  })

  it('löscht NICHT, was es nicht beurteilen kann', () => {
    expect(insightsNewsletterPendingPurgeDue({ confirmedAt: '', unsubscribedAt: '', tokenExpiresAt: '' }, now))
      .toBe(false)
    expect(insightsNewsletterPendingPurgeDue({ confirmedAt: '', unsubscribedAt: '', tokenExpiresAt: 'bald' }, now))
      .toBe(false)
  })
})

describe('Sweep-Regel 2 — abgemeldete Zeilen werden geleert', () => {
  const now = new Date('2026-10-24T10:00:00.000Z')
  const row = {
    email: 'aloha@example.com',
    emailLower: 'aloha@example.com',
    ipHash: 'abc',
    unsubscribedAt: '2025-10-01T00:00:00.000Z',
  }

  it('greift genau auf dem Stichtag', () => {
    expect(insightsNewsletterPiiSweepDue({ ...row, retentionAt: now.toISOString() }, now)).toBe(true)
  })

  it('greift NICHT, solange die Frist läuft (Gegenprobe)', () => {
    expect(insightsNewsletterPiiSweepDue({ ...row, retentionAt: '2027-01-01T00:00:00.000Z' }, now)).toBe(false)
  })

  it('fasst eine aktive Zeile nie an — auch mit abgelaufener Frist', () => {
    expect(insightsNewsletterPiiSweepDue({
      ...row,
      unsubscribedAt: '',
      retentionAt: '2020-01-01T00:00:00.000Z',
    }, now)).toBe(false)
  })

  it('greift bei fehlender oder kaputter Frist nicht', () => {
    expect(insightsNewsletterPiiSweepDue({ ...row, retentionAt: null }, now)).toBe(false)
    expect(insightsNewsletterPiiSweepDue({ ...row, retentionAt: 'irgendwann' }, now)).toBe(false)
  })

  it('sieht eine SCHON geleerte Zeile nicht als Arbeit (Platzhalter zählt nicht)', () => {
    expect(insightsNewsletterPiiSweepDue({
      email: '',
      emailLower: insightsNewsletterAnonymizedEmail('row-9'),
      ipHash: '',
      unsubscribedAt: '2025-10-01T00:00:00.000Z',
      retentionAt: now.toISOString(),
    }, now)).toBe(false)
  })

  it('greift noch, solange EIN personenbezogenes Feld steht', () => {
    expect(insightsNewsletterPiiSweepDue({
      email: '',
      emailLower: insightsNewsletterAnonymizedEmail('row-9'),
      ipHash: 'noch-da',
      unsubscribedAt: '2025-10-01T00:00:00.000Z',
      retentionAt: now.toISOString(),
    }, now)).toBe(true)
  })
})
