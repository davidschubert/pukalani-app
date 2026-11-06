import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_ACCOUNT_DAILY_LIMIT,
  BRAND_CHECK_ACCOUNT_LIMIT_CODE,
  BRAND_CHECK_INSTANCE_LIMIT_CODE,
  BRAND_CHECK_IP_DAILY_LIMIT,
  BRAND_CHECK_IP_LIMIT_CODE,
  brandCheckAccountDayKey,
  brandCheckIpDayKey,
  decideBrandCheckMode,
  decideBrandCheckQuota,
} from '../shared/brandAiLimits'
import {
  BRAND_CHECK_CORRECTION_DEFAULT_FILTER,
  BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT,
  BRAND_CHECK_CORRECTION_LIMIT_CODE,
  brandCheckCorrectionStatusValues,
  decideBrandCheckCorrection,
  decideBrandCheckCorrectionQuota,
  isBrandCheckCorrectionField,
  normalizeBrandCheckCorrectionStatus,
} from '../shared/brandCheckCorrections'
import {
  createBrandCheckCorrectionDeclineSchema,
  createBrandCheckCorrectionSchema,
  createBrandCheckHiddenSchema,
  createBrandCheckRankingQuerySchema,
  createBrandCheckSchema,
} from '../schemas/brandCheck'

/**
 * DIE REGELN HINTER DEN NEUEN ROUTEN — pur, ohne Ablage.
 *
 * Vier Aussagen, die man nicht an einer Route festmachen kann, weil sie
 * ENTSCHEIDUNGEN sind und keine Abläufe:
 *
 *  1. „Neu ermitteln" gibt es nur mit Konto, und es zahlt vom KONTO-Deckel —
 *     nie zusätzlich vom Anschluss-Deckel.
 *  2. Ein Doppelklick auf „annehmen" ist kein Fehler; eine Annahme in eine
 *     Ablehnung zu drehen schon.
 *  3. Der Vorschlag wird gegen den KATALOG gemessen, nicht nur gedeckelt.
 *  4. Alles aus einer Adresszeile wird gezogen, nicht mit einem 400 bestraft.
 */

describe('decideBrandCheckMode', () => {
  it('Gast ohne force ⇒ Zwischenspeicher gilt, Anschluss zahlt', () => {
    expect(decideBrandCheckMode({ userId: '', force: false }))
      .toEqual({ bypassCache: false, quota: 'ip' })
  })

  it('Gast MIT force ⇒ genauso: force ohne Konto wirkt nicht', () => {
    // Kein 401: er hat nichts Verbotenes versucht, sondern einen Knopf
    // gedrückt, den es für ihn nicht gibt.
    expect(decideBrandCheckMode({ userId: '', force: true }))
      .toEqual({ bypassCache: false, quota: 'ip' })
  })

  it('eingeloggt OHNE force ⇒ weiterhin der Anschluss-Deckel', () => {
    // Sonst wäre die Anmeldung ein Gutschein auf das Dreifache für dieselbe
    // Arbeit, und der Gast-Deckel wäre mit einem Klick ausgehebelt.
    expect(decideBrandCheckMode({ userId: 'u1', force: false }))
      .toEqual({ bypassCache: false, quota: 'ip' })
  })

  it('eingeloggt MIT force ⇒ Zwischenspeicher weg, Konto zahlt', () => {
    expect(decideBrandCheckMode({ userId: 'u1', force: true }))
      .toEqual({ bypassCache: true, quota: 'account' })
  })

  /**
   * DER DRITTE EINGANG (BC1): „das Konto zahlt" OHNE „neu ermitteln".
   *
   * Der Marktvergleich stösst fehlende Checks fremder Adressen an und will sie
   * aus dem Kontingent des Menschen bezahlen, der den Lauf ausgelöst hat — aber
   * er will den Zwischenspeicher ausdrücklich GELTEN lassen. Vor BC1 hingen
   * beide Dinge an `force` und liessen sich nicht trennen.
   */
  it('`quota: account` zahlt vom Konto, lässt den Zwischenspeicher aber gelten', () => {
    expect(decideBrandCheckMode({ userId: 'u1', force: false, quota: 'account' }))
      .toEqual({ bypassCache: false, quota: 'account' })
  })

  it('`quota: account` OHNE Konto fällt auf den Anschluss zurück', () => {
    // Ein Konto-Eimer ohne Konto wäre `brand-check-account-day:` — ein Eimer,
    // den sich alle Gäste der Welt teilen, also entweder ein Deckel für
    // niemanden oder eine Sperre für alle.
    expect(decideBrandCheckMode({ userId: '', force: false, quota: 'account' }))
      .toEqual({ bypassCache: false, quota: 'ip' })
  })

  it('`quota: auto` ist das bisherige Verhalten — und der Default', () => {
    expect(decideBrandCheckMode({ userId: 'u1', force: false, quota: 'auto' }))
      .toEqual(decideBrandCheckMode({ userId: 'u1', force: false }))
    expect(decideBrandCheckMode({ userId: 'u1', force: true, quota: 'auto' }))
      .toEqual({ bypassCache: true, quota: 'account' })
  })

  it('force UND `quota: account` schliessen sich nicht aus', () => {
    expect(decideBrandCheckMode({ userId: 'u1', force: true, quota: 'account' }))
      .toEqual({ bypassCache: true, quota: 'account' })
  })
})

describe('decideBrandCheckQuota · der Konto-Deckel', () => {
  it('lässt den zehnten durch und weist den elften ab', () => {
    expect(decideBrandCheckQuota({ ipDay: 0, accountDay: BRAND_CHECK_ACCOUNT_DAILY_LIMIT, instanceDay: 1 }))
      .toBeNull()
    expect(decideBrandCheckQuota({
      ipDay: 0,
      accountDay: BRAND_CHECK_ACCOUNT_DAILY_LIMIT + 1,
      instanceDay: 1,
    })).toBe(BRAND_CHECK_ACCOUNT_LIMIT_CODE)
  })

  it('der ungebuchte Zähler bleibt 0 und kann nie ein Nein erzeugen', () => {
    // In EINEM Aufruf ist immer nur einer der engen Eimer belegt.
    expect(decideBrandCheckQuota({ ipDay: 0, accountDay: 0, instanceDay: 0 })).toBeNull()
    expect(decideBrandCheckQuota({
      ipDay: BRAND_CHECK_IP_DAILY_LIMIT + 1,
      accountDay: 0,
      instanceDay: 0,
    })).toBe(BRAND_CHECK_IP_LIMIT_CODE)
  })

  it('eng vor weit: der Anschluss schlägt die Instanz', () => {
    expect(decideBrandCheckQuota({
      ipDay: BRAND_CHECK_IP_DAILY_LIMIT + 1,
      accountDay: 0,
      instanceDay: 9_999,
    })).toBe(BRAND_CHECK_IP_LIMIT_CODE)
    expect(decideBrandCheckQuota({ ipDay: 1, accountDay: 0, instanceDay: 9_999 }))
      .toBe(BRAND_CHECK_INSTANCE_LIMIT_CODE)
  })

  it('die zwei engen Eimer haben verschiedene Schlüssel', () => {
    expect(brandCheckAccountDayKey('u1')).not.toBe(brandCheckIpDayKey('u1'))
    expect(brandCheckAccountDayKey('u1')).toContain('u1')
  })
})

describe('decideBrandCheckCorrection', () => {
  it('offen ⇒ entscheiden', () => {
    expect(decideBrandCheckCorrection('open', 'accepted')).toEqual({ action: 'apply' })
    expect(decideBrandCheckCorrection('open', 'declined')).toEqual({ action: 'apply' })
  })

  it('derselbe Beschluss noch einmal ⇒ nichts tun, kein Fehler', () => {
    expect(decideBrandCheckCorrection('accepted', 'accepted')).toEqual({ action: 'noop' })
    expect(decideBrandCheckCorrection('declined', 'declined')).toEqual({ action: 'noop' })
  })

  it('umdrehen ⇒ Absage: eine stille Umkehr wäre ein unsichtbarer Schreibvorgang', () => {
    expect(decideBrandCheckCorrection('accepted', 'declined'))
      .toEqual({ action: 'refuse', code: 'already_decided' })
    expect(decideBrandCheckCorrection('declined', 'accepted'))
      .toEqual({ action: 'refuse', code: 'already_decided' })
  })
})

describe('brandCheckCorrections · Zustände und Filter', () => {
  it('Unbekanntes wird `open` — es gehört auf die Liste der Ungeklärten', () => {
    expect(normalizeBrandCheckCorrectionStatus('bearbeitet')).toBe('open')
    expect(normalizeBrandCheckCorrectionStatus('')).toBe('open')
    expect(normalizeBrandCheckCorrectionStatus(null)).toBe('open')
    expect(normalizeBrandCheckCorrectionStatus('accepted')).toBe('accepted')
  })

  it('`all` ist KEIN Filter — nur so sieht der Betreiber auch fremde Werte', () => {
    expect(brandCheckCorrectionStatusValues('all')).toBeNull()
    expect(brandCheckCorrectionStatusValues('open')).toEqual(['open'])
  })

  it('der Standard-Filter ist die Arbeitsliste', () => {
    expect(BRAND_CHECK_CORRECTION_DEFAULT_FILTER).toBe('open')
  })

  it('heute ist genau EIN Feld korrigierbar', () => {
    expect(isBrandCheckCorrectionField('industry')).toBe(true)
    expect(isBrandCheckCorrectionField('score')).toBe(false)
    expect(isBrandCheckCorrectionField('ipHash')).toBe(false)
  })

  it('drei Vorschläge je Stunde sind erlaubt, der vierte nicht', () => {
    expect(decideBrandCheckCorrectionQuota(BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT)).toBeNull()
    expect(decideBrandCheckCorrectionQuota(BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT + 1))
      .toBe(BRAND_CHECK_CORRECTION_LIMIT_CODE)
  })
})

describe('createBrandCheckSchema · die neuen Felder', () => {
  const parse = (input: Record<string, unknown>) =>
    createBrandCheckSchema().parse({ url: 'kailua.coffee', ...input })

  it('ohne Angabe: kein Häkchen, kein force, keine Brand', () => {
    const body = parse({})
    expect(body.rankingOptIn).toBe(false)
    expect(body.force).toBe(false)
    expect(body.profileId).toBe('')
  })

  it('nimmt die drei Felder an', () => {
    const body = parse({ rankingOptIn: true, force: true, profileId: 'p-1_2' })
    expect(body).toMatchObject({ rankingOptIn: true, force: true, profileId: 'p-1_2' })
  })

  it('weist eine Profil-Id ab, die keine sein kann', () => {
    expect(() => parse({ profileId: 'p/1' })).toThrow()
    expect(() => parse({ profileId: 'x'.repeat(65) })).toThrow()
  })

  it('bleibt streng: ein unbekanntes Feld ist ein 400', () => {
    expect(() => parse({ hidden: true })).toThrow()
  })
})

describe('createBrandCheckRankingQuerySchema', () => {
  const parse = (input: Record<string, unknown>) =>
    createBrandCheckRankingQuerySchema().parse(input)

  it('leere Abfrage ⇒ kein Filter, Standard-Sortierung, Seite 1', () => {
    expect(parse({})).toEqual({ industry: '', band: '', sort: 'score', page: 1 })
  })

  it('nimmt gültige Werte, auch grossgeschrieben', () => {
    expect(parse({ industry: 'Agency', band: 'STRONG', sort: 'consistency', page: '3' }))
      .toEqual({ industry: 'agency', band: 'strong', sort: 'consistency', page: 3 })
  })

  it('zieht Unbekanntes, statt einen 400 zu werfen', () => {
    expect(parse({ industry: 'agentur', band: 'super', sort: 'quatsch', page: 'x' }))
      .toEqual({ industry: '', band: '', sort: 'score', page: 1 })
  })

  it('lässt Fremdes in der Adresszeile stehen (utm, Cache-Brecher)', () => {
    expect(() => parse({ utm_source: 'newsletter', _: '17' })).not.toThrow()
  })
})

describe('createBrandCheckCorrectionSchema', () => {
  const parse = (input: Record<string, unknown>) =>
    createBrandCheckCorrectionSchema().parse({ field: 'industry', proposed: 'agency', ...input })

  it('nimmt einen Katalog-Wert und macht aus Fehlendem leere Zeichenketten', () => {
    expect(parse({})).toMatchObject({ field: 'industry', proposed: 'agency', reason: '', email: '' })
  })

  it('misst den Vorschlag gegen den KATALOG, nicht nur seine Länge', () => {
    expect(() => parse({ proposed: 'Agentur & Beratung' })).toThrow()
    expect(() => parse({ proposed: 'x'.repeat(100) })).toThrow()
    // Gross geschrieben ist derselbe Wert — der Mensch hat die Frage beantwortet.
    expect(parse({ proposed: 'CRAFT' }).proposed).toBe('craft')
  })

  it('erlaubt `unknown` als Vorschlag — „das steht da nicht" ist ein Befund', () => {
    expect(parse({ proposed: 'unknown' }).proposed).toBe('unknown')
  })

  it('kennt nur die Felder aus dem Katalog', () => {
    expect(() => createBrandCheckCorrectionSchema().parse({ field: 'score', proposed: '99' })).toThrow()
  })

  it('die Adresse ist freiwillig — aber eine ANGEGEBENE muss eine sein', () => {
    expect(parse({ email: '' }).email).toBe('')
    expect(parse({ email: ' Mail@Example.COM ' }).email).toBe('mail@example.com')
    expect(() => parse({ email: 'keine-adresse' })).toThrow()
  })

  it('deckelt die Begründung auf die Spaltengrösse', () => {
    expect(() => parse({ reason: 'x'.repeat(301) })).toThrow()
    expect(parse({ reason: 'x'.repeat(300) }).reason).toHaveLength(300)
  })

  it('lässt den Honigtopf durch, statt dem Bot mit einem 400 zu antworten', () => {
    expect(parse({ hp: 'ausgefüllt' }).hp).toBe('ausgefüllt')
    expect(() => parse({ irgendwas: 1 })).toThrow()
  })
})

describe('createBrandCheckCorrectionDeclineSchema / createBrandCheckHiddenSchema', () => {
  it('die Begründung darf leer sein', () => {
    expect(createBrandCheckCorrectionDeclineSchema().parse({}).decisionNote).toBe('')
    expect(() => createBrandCheckCorrectionDeclineSchema().parse({ decisionNote: 'x'.repeat(301) }))
      .toThrow()
  })

  it('`hidden` hat KEINEN Default — aus- und einblenden sind zwei Handlungen', () => {
    expect(() => createBrandCheckHiddenSchema().parse({})).toThrow()
    expect(createBrandCheckHiddenSchema().parse({ hidden: true })).toEqual({ hidden: true })
    expect(createBrandCheckHiddenSchema().parse({ hidden: false })).toEqual({ hidden: false })
  })

  it('kein zweites Feld im Rumpf — `industry` läuft nur über den Vorschlag-Weg', () => {
    expect(() => createBrandCheckHiddenSchema().parse({ hidden: true, industry: 'agency' })).toThrow()
  })
})
