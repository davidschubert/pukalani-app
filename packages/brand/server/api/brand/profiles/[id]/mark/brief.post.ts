import { BRAND_AI_SLOT_DAILY_LIMIT } from '../../../../../../shared/brandAiLimits'
import { BRAND_MARK_BRIEF_FIELDS } from '../../../../../../shared/brandDesignMark'
import type { BrandMarkBriefResponse } from '../../../../../../shared/types/brand'
import { type BrandAiQuotaMeasurement, bookBrandAiQuota } from '../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../utils/brandEvents'
import { readBrandAiEnabled, retainBrandGeneration } from '../../../../../utils/brandGenerators'
import {
  BRAND_MARK_BRIEF_SLOT_ID,
  brandMarkBriefStubEnabled,
  requireBrandMarkContext,
  runBrandMarkBrief,
  writeBrandMarkBriefSlot,
} from '../../../../../utils/brandMarkBrief'

/**
 * DAS ZEICHEN-BRIEFING ERZEUGEN (Konzept docs/archiv/BRAND-DESIGN.md §2.5
 * Stufe 1, Paket D5a) — EIN Text-Lauf über Foundation, DNA und die schon
 * beschlossenen Kapitel.
 *
 * ── DIE PRÜFREIHENFOLGE: VON BILLIG NACH TEUER ───────────────────────────
 *  1. Zugang, Besitz, Kapitel offen → 404 (`requireBrandMarkContext`).
 *  2. Kill-Switch + Schlüssel → 503 `mark_brief_unavailable`. Geprüft wird
 *     der SCHLÜSSEL, nicht `isAiConfigured`: das Core-Gate `pukalani.ai.enabled`
 *     setzt die branding-App nirgends, und mit ihm antwortete dieser Lauf auf
 *     branding.supply IMMER 503 (Prüf-Befund D2c, hier von Anfang an richtig).
 *  3. Die Drossel → 429 mit `Retry-After` und Grund.
 *  4. Erst dann der Lauf.
 *
 * ── ZWEI ABLEHNUNGEN, ZWEI SPRACHEN ──────────────────────────────────────
 * Ohne bestätigte Foundation-Stelle ist der AUFRUF in Ordnung und der ZUSTAND
 * erlaubt ihn nicht → 409 `mark_brief_no_foundation`. Scheitert der Anbieter
 * oder bleibt ein Feld leer, ist es ein Fehlschlag → 502.
 *
 * ── DER DECKEL IST DER SLOT-DECKEL ───────────────────────────────────────
 * `kind: 'slot'` mit `slotId: 'j.brief'` — 10 Anläufe je Marke, Feld und Tag,
 * genau wie beim DNA-Vorschlag: der Lauf IST der Generator dieses Feldes.
 *
 * ── DAS EREIGNIS TRÄGT KENNZAHLEN, KEINEN INHALT ─────────────────────────
 * `design.mark.brief` mit Feldzahl, Richtung, Modell-Kennung und Dauer. NIE
 * ein Briefing-Feld, NIE der Prompt, NIE eine Foundation-Stelle (Regel 1 im
 * Kopf von `brandEvents.ts`).
 */
export default defineEventHandler(async (event): Promise<BrandMarkBriefResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandMarkContext(event, userId, betaAccount)

  const stub = brandMarkBriefStubEnabled()
  if (!stub) {
    const [aiEnabled, textReady] = await Promise.all([
      readBrandAiEnabled(event),
      resolveAiKey(event).then(key => key.length > 0),
    ])
    if (!aiEnabled || !textReady) {
      logEvent('info', 'brand.mark_brief_unavailable', {
        profileId: profile.$id,
        aiEnabled,
        textReady,
      })
      throw createError({
        status: 503,
        statusText: 'The mark briefing is not available',
        data: { code: 'mark_brief_unavailable' },
      })
    }
  }

  /**
   * DER BURST-PLATZ (Audit-Befund 2026-09-09) — die Sicherung gegen den
   * PARALLELEN Lauf, nicht gegen den häufigen.
   *
   * `brandAiQuota.ts` sagt in seinem Kopf zu, dass die Route
   * `retainBrandGeneration()` VOR der Buchung ruft; bis zu diesem Befund taten
   * das nur der Entwurf und das Gespräch — ausgerechnet die vier neuen Läufe
   * dieses Kapitels standen daneben, obwohl sie die teuersten sind (ein
   * Vision-Zug über zwölf Bilder, vier Bild-Aufrufe in einem Klick). Zwölf
   * gleichzeitig geöffnete Tabs hätten zwölf Läufe bezahlt, während der
   * Tages-Deckel erst hinterher zählt.
   *
   * VOR der Buchung und nicht danach: zwischen Zählen und Belegen lägen sonst
   * mehrere `await`, und in dieser Lücke zählten drei gleichzeitige Anfragen
   * alle dieselbe Null (Begründung im Kopf von `brandAiQuota.ts`).
   *
   * Freigegeben wird im `finally` und damit auf JEDEM Ausgang — Erfolg, 429,
   * Anbieterfehler, Abbruch. Der Platz gehört dem Lauf, nicht seinem Ergebnis.
   */
  const burst = retainBrandGeneration(userId)
  try {
    const measurement: BrandAiQuotaMeasurement = { narrowCount: 0, narrowResetSec: 0 }
    const rejection = await bookBrandAiQuota(
      event,
      { userId, profileId: profile.$id, kind: 'slot', slotId: BRAND_MARK_BRIEF_SLOT_ID },
      measurement,
    )
    if (rejection) {
      logEvent('info', 'brand.mark_brief_throttled', { profileId: profile.$id, code: rejection.code })
      setHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Briefing limit reached',
        data: { code: rejection.code },
      })
    }
    const used = Math.min(measurement.narrowCount, BRAND_AI_SLOT_DAILY_LIMIT)
    const quota = {
      used,
      limit: BRAND_AI_SLOT_DAILY_LIMIT,
      remaining: Math.max(0, BRAND_AI_SLOT_DAILY_LIMIT - used),
    }

    const locale = profile.contentLocale === 'en' ? 'en' : 'de'
    const model = stub ? 'dev-stub' : (await getEffectiveAiConfig(event)).model
    const result = await runBrandMarkBrief(event, profile, stepRows, model)

    if (result.failure || !result.brief) {
      await recordBrandEvent(event, {
        type: 'design.mark.brief',
        profileId: profile.$id,
        userId,
        payload: { fields: 0, failure: result.failure ?? 'incomplete', model },
      })
      if (result.failure === 'no_foundation') {
        throw createError({
          status: 409,
          statusText: 'No confirmed foundation to derive from',
          data: { code: 'mark_brief_no_foundation' },
        })
      }
      throw createError({
        status: 502,
        statusText: 'The mark briefing failed',
        data: { code: 'mark_brief_unavailable' },
      })
    }

    await writeBrandMarkBriefSlot(event, profile, stepRows, result.brief, locale)

    await recordBrandEvent(event, {
      type: 'design.mark.brief',
      profileId: profile.$id,
      userId,
      payload: {
        fields: BRAND_MARK_BRIEF_FIELDS.length,
        model: result.model ?? model,
        ms: result.ms ?? 0,
      },
    })

    return {
      ok: true,
      brief: { ...result.brief },
      model: result.model ?? model,
      quota,
    }
  }
  finally {
    burst.release()
  }
})
