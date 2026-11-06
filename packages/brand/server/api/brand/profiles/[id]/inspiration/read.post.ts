import { BRAND_DESIGN_READING_DAILY_LIMIT } from '../../../../../../shared/brandAiLimits'
import { BRAND_INSPIRATION_MAX } from '../../../../../../shared/brandInspiration'
import {
  type BrandReadingSummary,
  brandReadingSlotValue,
  brandReadingState,
  parseBrandReadingSlotValue,
} from '../../../../../../shared/brandReading'
import type { BrandInspirationReadResponse } from '../../../../../../shared/types/brand'
import { type BrandAiQuotaMeasurement, bookBrandAiQuota } from '../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../utils/brandEvents'
import { readBrandAiEnabled, retainBrandGeneration } from '../../../../../utils/brandGenerators'
import {
  brandReadingRunLine,
  brandReadingSlotLabels,
  brandReadingStubEnabled,
  runBrandInspirationReading,
  storeBrandReadings,
  writeBrandReadingSlot,
} from '../../../../../utils/brandInspirationReading'
import {
  listBrandInspiration,
  requireBrandInspirationContext,
} from '../../../../../utils/brandInspirationStore'

/**
 * DIE VORBILDER LESEN (Konzept docs/archiv/BRAND-DESIGN.md §2.2 Schritt 3,
 * Paket D2b) — EIN Lauf über alle Bilder dieser Marke.
 *
 * ── DIE PRÜFREIHENFOLGE: VON BILLIG NACH TEUER ───────────────────────────
 *  1. Zugang, Besitz, Kapitel offen → 404 (`requireBrandInspirationContext`,
 *     die Datentür dieses Layers — sie verrät nicht, ob es die Marke gibt).
 *  2. Gibt es überhaupt Bilder? → 409 `reading_no_images`. 409 und nicht 400:
 *     der Aufruf ist in Ordnung, der ZUSTAND erlaubt ihn nicht — dieselbe
 *     Sprache wie beim Zwölfer-Deckel des Uploads.
 *  3. Kann diese Instanz überhaupt Bilder lesen? → 503 `vision_unavailable`.
 *     KEIN Fehler im Sinne von „kaputt": das Kapitel läuft ohne Lesung
 *     vollständig weiter (Leitplanke „Stufe 1+2 pur"), die Werkstatt sagt
 *     einen ruhigen Satz, und `g.reading` ist `required: false`.
 *  4. Die Drossel → 429 mit `Retry-After` und Grund.
 *  5. Erst dann der Lauf.
 *
 * ── DER ERSATZ BUCHT MIT, ANDERS ALS DER ENTWURFS-STUB ───────────────────
 * `bookBrandAiQuota` sagt in seinem Kopf, dass der Dev-Stub nicht bucht („er
 * ruft keinen Anbieter"). Hier ist es umgekehrt, und mit Absicht: der Deckel
 * ist Teil des PRODUKTS — die Antwort nennt das Rest-Kontingent, die Werkstatt
 * schreibt es unter den Knopf. Ein Ersatz, der ihn umginge, liesse genau die
 * Zusage unbewiesen, die der Beweis prüfen soll. Der Preis ist gering: ohne
 * Redis lebt der Eimer im Prozess und beginnt mit dem Dev-Server neu.
 *
 * ── DAS EREIGNIS TRÄGT KENNZAHLEN, KEINEN INHALT ─────────────────────────
 * `design.reading.run` mit Bildzahl, gelesenen Zeilen, Urteils-Verteilung,
 * Modell-Kennung und Dauer. NIE ein Bild, NIE der Prompt, NIE eine Begründung
 * (Regel 1 im Kopf von `brandEvents.ts`).
 */
export default defineEventHandler(async (event): Promise<BrandInspirationReadResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)

  const entries = await listBrandInspiration(event, profile.$id)
  if (entries.length === 0) {
    throw createError({
      status: 409,
      statusText: 'No inspiration images to read',
      data: { code: 'reading_no_images' },
    })
  }

  /**
   * ZWEI SCHALTER, ZWEI FRAGEN: `brandAiEnabled` ist der Kill-Switch DIESES
   * Layers (kostet die Instanz Geld?), `isAiVisionConfigured` sagt, ob
   * überhaupt ein Vision-Modell eingetragen ist (`pukalani.ai.visionModel`,
   * Core-Default leer). Beide führen zur selben ruhigen Antwort, weil der
   * Mensch denselben Satz braucht — der Betreiber sieht den Unterschied im
   * Log.
   */
  const stub = brandReadingStubEnabled()
  if (!stub) {
    const [aiEnabled, visionReady] = await Promise.all([
      readBrandAiEnabled(event),
      isAiVisionConfigured(event),
    ])
    if (!aiEnabled || !visionReady) {
      logEvent('info', 'brand.reading_vision_unavailable', {
        profileId: profile.$id,
        aiEnabled,
        visionReady,
      })
      throw createError({
        status: 503,
        statusText: 'Reading reference images is not available',
        data: { code: 'vision_unavailable' },
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
      { userId, profileId: profile.$id, kind: 'reading' },
      measurement,
    )
    if (rejection) {
      logEvent('info', 'brand.reading_throttled', { profileId: profile.$id, code: rejection.code })
      setHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Reading limit reached',
        data: { code: rejection.code },
      })
    }
    const used = Math.min(measurement.narrowCount, BRAND_DESIGN_READING_DAILY_LIMIT)
    const quota = {
      used,
      limit: BRAND_DESIGN_READING_DAILY_LIMIT,
      remaining: Math.max(0, BRAND_DESIGN_READING_DAILY_LIMIT - used),
    }

    const model = stub ? 'dev-stub' : (await getEffectiveAiVisionConfig(event)).model
    const result = await runBrandInspirationReading(event, profile, stepRows, entries, model)

    if (result.failure || !result.readings || !result.summary) {
      await recordBrandEvent(event, {
        type: 'design.reading.run',
        profileId: profile.$id,
        userId,
        payload: { images: entries.length, read: 0, failure: result.failure ?? 'empty_result', model },
      })
      /**
       * ZU GROSS IST KEIN FEHLSCHLAG (Audit-Befund 2026-09-09): der Aufruf ist
       * in Ordnung, die Bilder passen nur nicht in EINEN Zug — dieselbe
       * Sprache wie `reading_no_images`, nur mit dem Status, der genau das
       * sagt. Ein 502 behauptete stattdessen, der Anbieter habe versagt, und
       * schickte die Diagnose in die falsche Richtung.
       */
      if (result.failure === 'too_large') {
        throw createError({
          status: 413,
          statusText: 'The reference images are too large for one run',
          data: { code: 'reading_too_large' },
        })
      }
      throw createError({
        status: 502,
        statusText: 'Reading the reference images failed',
        data: { code: 'reading_unavailable' },
      })
    }

    const written = await storeBrandReadings(event, result.readings)

    const locale = profile.contentLocale === 'en' ? 'en' : 'de'
    const summary: BrandReadingSummary = result.summary
    const at = new Date().toISOString()
    const runLine = brandReadingRunLine(at, written, result.model ?? model, locale)
    const slotValue = brandReadingSlotValue(summary, runLine, brandReadingSlotLabels(locale))
    await writeBrandReadingSlot(event, profile, stepRows, slotValue)

    // NEU GELESEN, damit die Antwort die Zeilen zeigt, die WIRKLICH stehen —
    // nicht die, die geschrieben werden sollten (ein Bild kann während des Laufs
    // entfernt worden sein).
    const items = await listBrandInspiration(event, profile.$id)

    const verdicts = { fits: 0, tension: 0, off: 0 }
    for (const item of items) {
      if (item.reading) verdicts[item.reading.verdict] += 1
    }

    await recordBrandEvent(event, {
      type: 'design.reading.run',
      profileId: profile.$id,
      userId,
      payload: {
        images: entries.length,
        read: written,
        missing: result.missing?.length ?? 0,
        ...verdicts,
        model: result.model ?? model,
        ms: result.ms ?? 0,
      },
    })

    const view = parseBrandReadingSlotValue(slotValue)
    return {
      ok: true,
      items,
      max: BRAND_INSPIRATION_MAX,
      reading: {
        state: brandReadingState(items),
        summary: {
          keeps: [...(view?.keeps ?? summary.keeps)],
          improves: [...(view?.improves ?? summary.improves)],
        },
        runLine,
      },
      quota,
    }
  }
  finally {
    burst.release()
  }
})
