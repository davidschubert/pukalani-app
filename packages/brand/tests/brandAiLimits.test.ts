import { describe, expect, it } from 'vitest'
import {
  BRAND_AI_ACCOUNT_DAILY_LIMIT,
  BRAND_AI_BUSY_CODE,
  BRAND_AI_DAILY_LIMIT_CODE,
  BRAND_AI_INSTANCE_DAILY_DEFAULT,
  BRAND_AI_INSTANCE_LIMIT_CODE,
  BRAND_AI_LIMITS,
  BRAND_AI_PARALLEL_LIMIT,
  BRAND_AI_SLOT_DAILY_LIMIT,
  BRAND_AI_SLOT_LIMIT_CODE,
  BRAND_AI_REVIEW_DAILY_LIMIT,
  BRAND_AI_TALK_DAILY_LIMIT,
  BRAND_AI_TALK_LIMIT_CODE,
  BRAND_DESIGN_DRAFTS_DAILY_LIMIT,
  BRAND_DESIGN_DRAFTS_LIMIT_CODE,
  BRAND_DESIGN_READING_DAILY_LIMIT,
  BRAND_DESIGN_READING_LIMIT_CODE,
  type BrandAiQuotaCounts,
  brandAiAccountDayKey,
  brandAiInstanceDayKey,
  brandAiRejectionMessageKey,
  brandAiSlotDayKey,
  brandAiTalkDayKey,
  brandDesignReadingDayKey,
  decideBrandAiQuota,
  isBrandAiRejectionCode,
  resolveBrandAiInstanceCap,
} from '../shared/brandAiLimits'

/**
 * DER KI-DROSSEL-VERTRAG, DURCHGERECHNET.
 *
 * Vier Aussagen, die man sonst glauben müsste:
 *  1. Die GRENZE liegt genau dort, wo sie behauptet wird — der 200. Lauf geht,
 *     der 201. nicht. Ein `>=` statt `>` verschöbe jeden Deckel um eins.
 *  2. Die REIHENFOLGE ist eng vor weit. Sie ist die ganze Sorgfalt der
 *     Buchung: nur so verbraucht ein enger Deckel nicht die weiteren.
 *  3. Der Instanz-Deckel lässt sich nicht versehentlich AUSSCHALTEN — eine 0
 *     oder ein `"1000"` fällt auf den Default zurück.
 *  4. Die Schlüssel unterscheiden, was verschieden ist, und teilen, was
 *     zusammengehört (ein Konto = ein Eimer über alle Brands).
 */

/**
 * ALLE Zähler auf 0. `talkDay` steht hier neben `slotDay`, obwohl in EINEM
 * echten Aufruf immer nur einer von beiden belegt ist (P3.2) — die Entscheidung
 * muss trotzdem beide sehen können, sonst könnte sie nicht sagen, welcher
 * Deckel gefallen ist.
 */
const zero: BrandAiQuotaCounts = {
  parallel: 0, slotDay: 0, talkDay: 0, reviewDay: 0, readingDay: 0, draftsDay: 0, accountDay: 0, instanceDay: 0,
}

describe('Die Zahlen des Vertrags (Plan §6)', () => {
  it('stehen so da, wie der Plan sie zusagt', () => {
    expect(BRAND_AI_ACCOUNT_DAILY_LIMIT).toBe(200)
    expect(BRAND_AI_SLOT_DAILY_LIMIT).toBe(10)
    expect(BRAND_AI_TALK_DAILY_LIMIT).toBe(40)
    expect(BRAND_AI_PARALLEL_LIMIT).toBe(2)
    expect(BRAND_AI_INSTANCE_DAILY_DEFAULT).toBe(1000)
    expect(BRAND_AI_REVIEW_DAILY_LIMIT).toBe(120)
    // Brand Design D2b: der Vision-Lauf über die Vorbilder (§2.2 Leitplanke d).
    expect(BRAND_DESIGN_READING_DAILY_LIMIT).toBe(3)
    // Brand Design D5c: der Bildlauf des Zeichens (§2.5 Stufe 3).
    expect(BRAND_DESIGN_DRAFTS_DAILY_LIMIT).toBe(3)
    expect(BRAND_AI_LIMITS).toEqual({
      parallel: 2,
      slotDay: 10,
      talkDay: 40,
      reviewDay: 120,
      readingDay: 3,
      draftsDay: 3,
      accountDay: 200,
      instanceDay: 1000,
    })
  })
})

describe('decideBrandAiQuota', () => {
  it('lässt einen Lauf durch, solange nichts überschritten ist', () => {
    expect(decideBrandAiQuota(zero)).toBeNull()
    expect(decideBrandAiQuota({
      parallel: 2, slotDay: 10, talkDay: 40, reviewDay: 120, readingDay: 3, draftsDay: 3, accountDay: 200, instanceDay: 1000,
    })).toBeNull()
  })

  it('DER LETZTE ERLAUBTE LAUF GEHT, der nächste nicht (je Deckel)', () => {
    expect(decideBrandAiQuota({ ...zero, parallel: 2 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, parallel: 3 })).toBe(BRAND_AI_BUSY_CODE)

    expect(decideBrandAiQuota({ ...zero, slotDay: 10 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, slotDay: 11 })).toBe(BRAND_AI_SLOT_LIMIT_CODE)

    expect(decideBrandAiQuota({ ...zero, talkDay: 40 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, talkDay: 41 })).toBe(BRAND_AI_TALK_LIMIT_CODE)

    expect(decideBrandAiQuota({ ...zero, readingDay: 3 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, readingDay: 4 })).toBe(BRAND_DESIGN_READING_LIMIT_CODE)

    expect(decideBrandAiQuota({ ...zero, draftsDay: 3 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, draftsDay: 4 })).toBe(BRAND_DESIGN_DRAFTS_LIMIT_CODE)

    expect(decideBrandAiQuota({ ...zero, accountDay: 200 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, accountDay: 201 })).toBe(BRAND_AI_DAILY_LIMIT_CODE)

    expect(decideBrandAiQuota({ ...zero, instanceDay: 1000 })).toBeNull()
    expect(decideBrandAiQuota({ ...zero, instanceDay: 1001 })).toBe(BRAND_AI_INSTANCE_LIMIT_CODE)
  })

  it('ENG VOR WEIT: sind mehrere verletzt, gewinnt der engere', () => {
    const all = { parallel: 9, slotDay: 99, talkDay: 99, accountDay: 999, instanceDay: 9999 }
    expect(decideBrandAiQuota(all)).toBe(BRAND_AI_BUSY_CODE)
    expect(decideBrandAiQuota({ ...all, parallel: 0 })).toBe(BRAND_AI_SLOT_LIMIT_CODE)
    expect(decideBrandAiQuota({ ...all, parallel: 0, slotDay: 0 })).toBe(BRAND_AI_TALK_LIMIT_CODE)
    expect(decideBrandAiQuota({ ...all, parallel: 0, slotDay: 0, talkDay: 0 })).toBe(BRAND_AI_DAILY_LIMIT_CODE)
    expect(decideBrandAiQuota({ ...all, parallel: 0, slotDay: 0, talkDay: 0, accountDay: 0 }))
      .toBe(BRAND_AI_INSTANCE_LIMIT_CODE)
  })

  it('NOCH NICHT GEMESSEN (0) erzeugt nie ein Nein', () => {
    // Genau so bucht die Route: erst der Slot-Eimer, die anderen stehen noch
    // auf 0. Eine 0, die ablehnte, machte jede Generierung unmöglich.
    expect(decideBrandAiQuota({ ...zero, parallel: 1, slotDay: 3 })).toBeNull()
  })

  it('nimmt eigene Limits an — der Instanz-Deckel ist konfigurierbar', () => {
    const limits = { ...BRAND_AI_LIMITS, instanceDay: 5 }
    expect(decideBrandAiQuota({ ...zero, instanceDay: 5 }, limits)).toBeNull()
    expect(decideBrandAiQuota({ ...zero, instanceDay: 6 }, limits)).toBe(BRAND_AI_INSTANCE_LIMIT_CODE)
  })
})

describe('resolveBrandAiInstanceCap', () => {
  it('nimmt eine ganze Zahl grösser 0', () => {
    expect(resolveBrandAiInstanceCap(2500)).toBe(2500)
    expect(resolveBrandAiInstanceCap(1)).toBe(1)
  })

  it('LÄSST SICH NICHT AUSSCHALTEN — alles Unbrauchbare fällt auf den Default', () => {
    for (const value of [0, -5, 12.5, Number.NaN, Number.POSITIVE_INFINITY, '1000', null, undefined, {}]) {
      expect(resolveBrandAiInstanceCap(value)).toBe(BRAND_AI_INSTANCE_DAILY_DEFAULT)
    }
  })
})

describe('Die Eimer-Schlüssel', () => {
  it('geben dem KONTO einen Eimer über alle Brands', () => {
    expect(brandAiAccountDayKey('u1')).toBe('brand-ai-day:u1')
    expect(brandAiAccountDayKey('u1')).not.toContain('p1')
  })

  it('GEBEN DEM GESPRÄCH EINEN EIGENEN — je Branding, ohne Slot und ohne Konto', () => {
    expect(brandAiTalkDayKey('p1')).toBe('brand-ai-talk-day:p1')
    expect(brandAiTalkDayKey('p1')).not.toBe(brandAiTalkDayKey('p2'))
    // Der Punkt der ganzen Entscheidung: reden und entwerfen zählen GETRENNT.
    expect(brandAiTalkDayKey('p1')).not.toBe(brandAiSlotDayKey('p1', 'a.pitch'))
  })

  it('trennen Brand UND Slot-Typ', () => {
    expect(brandAiSlotDayKey('p1', 'a.pitch')).toBe('brand-ai-slot-day:p1:a.pitch')
    expect(brandAiSlotDayKey('p1', 'a.pitch')).not.toBe(brandAiSlotDayKey('p1', 'b.purpose'))
    expect(brandAiSlotDayKey('p1', 'a.pitch')).not.toBe(brandAiSlotDayKey('p2', 'a.pitch'))
  })

  it('trennen die LESUNG vom Entwurf desselben Brandings (D2b)', () => {
    expect(brandDesignReadingDayKey('p1')).toBe('brand-reading-day:p1')
    expect(brandDesignReadingDayKey('p1')).not.toBe(brandDesignReadingDayKey('p2'))
    expect(brandDesignReadingDayKey('p1')).not.toBe(brandAiSlotDayKey('p1', 'g.reading'))
  })

  it('geben der INSTANZ genau einen — ohne Konto, ohne Brand', () => {
    expect(brandAiInstanceDayKey()).toBe('brand-ai-instance-day')
  })

  it('kollidieren nicht miteinander', () => {
    const keys = [
      brandAiAccountDayKey('x'),
      brandAiSlotDayKey('x', 'y'),
      brandAiTalkDayKey('x'),
      brandDesignReadingDayKey('x'),
      brandAiInstanceDayKey(),
    ]
    expect(new Set(keys).size).toBe(5)
  })
})

describe('Die Ablehnungsgründe', () => {
  it('erkennt genau die fünf eigenen Codes', () => {
    for (const code of [
      BRAND_AI_BUSY_CODE,
      BRAND_AI_SLOT_LIMIT_CODE,
      BRAND_AI_TALK_LIMIT_CODE,
      BRAND_AI_DAILY_LIMIT_CODE,
      BRAND_AI_INSTANCE_LIMIT_CODE,
    ]) {
      expect(isBrandAiRejectionCode(code)).toBe(true)
    }
    // Fremdes bleibt draussen: der Client liest hier eine Antwort, die auch von
    // einem Proxy oder einem älteren Server kommen kann.
    for (const value of ['ai_disabled', 'translation_daily_limit', '', 42, null, undefined]) {
      expect(isBrandAiRejectionCode(value)).toBe(false)
    }
  })

  it('bildet jeden Code auf einen EIGENEN Text ab', () => {
    const keys = [
      brandAiRejectionMessageKey(BRAND_AI_BUSY_CODE),
      brandAiRejectionMessageKey(BRAND_AI_SLOT_LIMIT_CODE),
      brandAiRejectionMessageKey(BRAND_AI_TALK_LIMIT_CODE),
      brandAiRejectionMessageKey(BRAND_AI_DAILY_LIMIT_CODE),
      brandAiRejectionMessageKey(BRAND_AI_INSTANCE_LIMIT_CODE),
    ]
    expect(new Set(keys).size).toBe(5)
    for (const key of keys) expect(key).toMatch(/^brand\.workspace\.generate\./)
  })

  it('sagt bei allem anderen `null` — die Seite behält ihren Text', () => {
    expect(brandAiRejectionMessageKey('provider_error')).toBeNull()
    expect(brandAiRejectionMessageKey(undefined)).toBeNull()
  })
})
