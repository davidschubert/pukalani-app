import { BRAND_AI_SLOT_DAILY_LIMIT } from '../../../../../../shared/brandAiLimits'
import { brandDnaSlotValue } from '../../../../../../shared/brandDesignDna'
import type { BrandDnaProposeResponse } from '../../../../../../shared/types/brand'
import { type BrandAiQuotaMeasurement, bookBrandAiQuota } from '../../../../../utils/brandAiQuota'
import {
  BRAND_DNA_SLOT_ID,
  brandDnaPromptReadings,
  brandDnaStubEnabled,
  runBrandDnaProposal,
  writeBrandDnaSlot,
} from '../../../../../utils/brandDnaProposal'
import { recordBrandEvent } from '../../../../../utils/brandEvents'
import { readBrandAiEnabled, retainBrandGeneration } from '../../../../../utils/brandGenerators'
import {
  listBrandInspiration,
  requireBrandInspirationContext,
} from '../../../../../utils/brandInspirationStore'

/**
 * DEN DNA-VORSCHLAG RECHNEN (Konzept docs/archiv/BRAND-DESIGN.md §2.2 Schritt
 * 4, Paket D2c) — EIN Text-Lauf über die Foundation dieser Marke.
 *
 * ── DIE PRÜFREIHENFOLGE: VON BILLIG NACH TEUER ───────────────────────────
 *  1. Zugang, Besitz, Kapitel offen → 404 (`requireBrandInspirationContext`,
 *     die Datentür dieser Fläche — sie verrät nicht, ob es die Marke gibt).
 *     Ihr NAME kommt von D2a, ihre Prüfung ist die des KAPITELS `dna`, und
 *     `g.dna` liegt in genau dieser Kapitel-Zeile: sie ist hier richtig, eine
 *     zweite Datentür daneben wäre eine zweite Wahrheit.
 *  2. Kill-Switch + KI-Verfügbarkeit → 503 `dna_unavailable`. Geprüft wird die
 *     TEXT-KI (`isAiConfigured`), nicht die Vision der Lesung: dieser Lauf
 *     liest Sätze, keine Bilder — eine Instanz ohne Vision-Modell kann den
 *     Vorschlag sehr wohl rechnen (genau das ist der Weg „Frida schlägt vor").
 *  3. Die Drossel → 429 mit `Retry-After` und Grund.
 *  4. Erst dann der Lauf.
 *
 * ── ZWEI ABLEHNUNGEN, ZWEI SPRACHEN ──────────────────────────────────────
 * Ohne bestätigte Foundation-Stelle ist der AUFRUF in Ordnung und der ZUSTAND
 * erlaubt ihn nicht → 409 `dna_no_foundation`, dieselbe Sprache wie
 * `reading_no_images` bei der Lesung. Scheitert der Anbieter oder bleibt eine
 * Dimension offen, ist es ein Fehlschlag → 502 `dna_unavailable`.
 *
 * ── DER ERSATZ BUCHT MIT, ANDERS ALS DER ENTWURFS-STUB ───────────────────
 * Dieselbe Entscheidung wie bei der Lesung, aus demselben Grund: der Deckel
 * ist Teil des PRODUKTS — die Antwort nennt das Rest-Kontingent, die Werkstatt
 * schreibt es unter den Knopf. Ein Ersatz, der ihn umginge, liesse genau die
 * Zusage unbewiesen, die der Beweis prüfen soll.
 *
 * ── DER DECKEL IST DER SLOT-DECKEL ───────────────────────────────────────
 * `kind: 'slot'` mit `slotId: 'g.dna'` — 10 Anläufe je Marke, Feld und Tag
 * (`BRAND_AI_SLOT_DAILY_LIMIT`). Der Vorschlag IST der Generator dieses
 * Feldes; ein eigener Eimer daneben wäre ein zweiter Deckel auf derselben
 * Frage, und wer zehnmal neu vorschlagen lässt, hätte je nach Knopf ein
 * anderes Kontingent.
 *
 * ── DAS EREIGNIS TRÄGT KENNZAHLEN, KEINEN INHALT ─────────────────────────
 * `design.dna.run` mit Zeilenzahl, Zahl der `both`-Zeilen, ob mit Vorbildern,
 * Modell-Kennung und Dauer. NIE eine Begründung, NIE der Prompt, NIE eine
 * Foundation-Stelle (Regel 1 im Kopf von `brandEvents.ts`).
 */
export default defineEventHandler(async (event): Promise<BrandDnaProposeResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)

  const stub = brandDnaStubEnabled()
  if (!stub) {
    // DER SCHLÜSSEL, NICHT DAS CORE-GATE (Prüf-Befund D2c, 2026-09-08):
    // `isAiConfigured` verlangt `pukalani.ai.enabled`, und das setzt die
    // branding-App nirgends — der Layer hat seinen eigenen Kill-Switch
    // (`brandAiEnabled`, eine Zeile drüber) und seine Generatoren fragen nur
    // nach dem Schlüssel (`resolveAiKey`, wie `generate.post.ts`). Mit dem
    // Core-Gate antwortete dieser Lauf auf branding.supply IMMER 503.
    const [aiEnabled, textReady] = await Promise.all([
      readBrandAiEnabled(event),
      resolveAiKey(event).then(key => key.length > 0),
    ])
    if (!aiEnabled || !textReady) {
      logEvent('info', 'brand.dna_unavailable', {
        profileId: profile.$id,
        aiEnabled,
        textReady,
      })
      throw createError({
        status: 503,
        statusText: 'The DNA proposal is not available',
        data: { code: 'dna_unavailable' },
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
      { userId, profileId: profile.$id, kind: 'slot', slotId: BRAND_DNA_SLOT_ID },
      measurement,
    )
    if (rejection) {
      logEvent('info', 'brand.dna_throttled', { profileId: profile.$id, code: rejection.code })
      setHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Proposal limit reached',
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
    // Die Vorbilder sind OPTIONAL: ohne sie läuft der Weg „Frida schlägt vor"
    // vollständig weiter (Leitplanke „Stufe 1+2 pur"), nur ohne Belege.
    const entries = await listBrandInspiration(event, profile.$id)
    const readings = brandDnaPromptReadings(entries, locale)

    const model = stub ? 'dev-stub' : (await getEffectiveAiConfig(event)).model
    const result = await runBrandDnaProposal(event, profile, stepRows, readings, model)

    if (result.failure || !result.entries) {
      await recordBrandEvent(event, {
        type: 'design.dna.run',
        profileId: profile.$id,
        userId,
        payload: {
          lines: 0,
          withInspiration: readings.length > 0,
          failure: result.failure ?? 'incomplete',
          model,
        },
      })
      if (result.failure === 'no_foundation') {
        throw createError({
          status: 409,
          statusText: 'No confirmed foundation to derive from',
          data: { code: 'dna_no_foundation' },
        })
      }
      throw createError({
        status: 502,
        statusText: 'The DNA proposal failed',
        data: { code: 'dna_unavailable' },
      })
    }

    await writeBrandDnaSlot(event, profile, stepRows, brandDnaSlotValue(result.entries, locale))

    const both = result.entries.filter(entry => entry.origin === 'both').length
    await recordBrandEvent(event, {
      type: 'design.dna.run',
      profileId: profile.$id,
      userId,
      payload: {
        lines: result.entries.length,
        both,
        withInspiration: result.hasInspiration ?? false,
        model: result.model ?? model,
        ms: result.ms ?? 0,
      },
    })

    return {
      ok: true,
      entries: result.entries.map(entry => ({
        dimension: entry.dimension,
        value: entry.value,
        origin: entry.origin,
        reason: entry.reason,
        ...(entry.inspirationReason ? { inspirationReason: entry.inspirationReason } : {}),
      })),
      hasInspiration: result.hasInspiration ?? false,
      model: result.model ?? model,
      quota,
    }
  }
  finally {
    burst.release()
  }
})
