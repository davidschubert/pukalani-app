import { BRAND_DESIGN_DRAFTS_DAILY_LIMIT } from '../../../../../../../shared/brandAiLimits'
import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFTS_PER_RUN,
} from '../../../../../../../shared/brandMarkDrafts'
import type { BrandMarkDraftsRunResponse } from '../../../../../../../shared/types/brand'
import { type BrandAiQuotaMeasurement, bookBrandAiQuota } from '../../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'
import { readBrandAiEnabled, retainBrandGeneration } from '../../../../../../utils/brandGenerators'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import {
  brandMarkDraftTitleFor,
  brandMarkDraftsFree,
  brandMarkDraftsStubEnabled,
  createBrandMarkDraft,
  listBrandMarkDrafts,
  runBrandMarkDrafts,
  syncBrandMarkDraftsSlot,
} from '../../../../../../utils/brandMarkDrafts'

/**
 * DIE KI-ENTWÜRFE ERZEUGEN (Konzept docs/archiv/BRAND-DESIGN.md §2.5 Stufe 3,
 * Davids Entscheidung §1.11 b, Paket D5c) — EIN Lauf, vier Bilder.
 *
 * ── DIE PRÜFREIHENFOLGE: VON BILLIG NACH TEUER ───────────────────────────
 *  1. Zugang, Besitz, Kapitel offen → 404 (`requireBrandMarkContext`, die
 *     Datentür dieses Layers — sie verrät nicht, ob es die Marke gibt).
 *  2. Ist noch Platz? → 409 `drafts_limit_reached`. 409 und nicht 400: der
 *     Aufruf ist in Ordnung, der ZUSTAND erlaubt ihn nicht (dieselbe Sprache
 *     wie beim Zwölfer-Deckel der Vorbilder).
 *  3. Kann diese Instanz überhaupt Bilder erzeugen? → 503 `image_unavailable`.
 *     KEIN Fehler im Sinne von „kaputt": das Kapitel läuft ohne Stufe 3
 *     vollständig weiter (§2.19 Frage 1: „bis dahin Stufe 3 hinter dem
 *     Config-Gate aus — das Kapitel funktioniert ohne sie"), die Werkstatt
 *     sagt einen ruhigen Satz, und `j.drafts` ist `required: false`.
 *  4. Die Drossel → 429 mit `Retry-After` und Grund.
 *  5. Erst dann der Lauf.
 *
 * ── ZWEI SCHALTER, ZWEI FRAGEN ───────────────────────────────────────────
 * `brandAiEnabled` ist der Kill-Switch DIESES Layers (kostet die Instanz
 * Geld?), `isAiImageConfigured` sagt, ob überhaupt ein Bild-Modell eingetragen
 * ist (`pukalani.ai.imageModel`, Core-Default leer). Beide führen zur selben
 * ruhigen Antwort, weil der Mensch denselben Satz braucht — der Betreiber
 * sieht den Unterschied im Log.
 *
 * ── DER ERSATZ BUCHT MIT, ANDERS ALS DER ENTWURFS-STUB ───────────────────
 * Wörtlich dieselbe Entscheidung wie bei der Vorbilder-Lesung (D2b): der
 * Deckel ist Teil des PRODUKTS — die Antwort nennt das Rest-Kontingent, die
 * Werkstatt schreibt es unter den Knopf. Ein Ersatz, der ihn umginge, liesse
 * genau die Zusage unbewiesen, die der Beweis prüfen soll.
 *
 * ── DAS EREIGNIS TRÄGT KENNZAHLEN, KEINEN INHALT ─────────────────────────
 * `design.drafts.run` mit Bildzahl, Modell-Kennung, Prompt-Hash und Dauer. NIE
 * ein Bild, NIE der Prompt, NIE ein Briefing-Feld (Regel 1 im Kopf von
 * `brandEvents.ts`). Der HASH darf mit: er ist die Herkunfts-Auskunft, die
 * auch auf der Karte steht.
 */
export default defineEventHandler(async (event): Promise<BrandMarkDraftsRunResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandMarkContext(event, userId, betaAccount)

  const before = await listBrandMarkDrafts(event, profile.$id)
  if (brandMarkDraftsFree(before) < BRAND_MARK_DRAFTS_PER_RUN) {
    throw createError({
      status: 409,
      statusText: 'No room for more drafts',
      data: { code: 'drafts_limit_reached' },
    })
  }

  const stub = brandMarkDraftsStubEnabled()
  if (!stub) {
    const [aiEnabled, imageReady] = await Promise.all([
      readBrandAiEnabled(event),
      isAiImageConfigured(event),
    ])
    if (!aiEnabled || !imageReady) {
      logEvent('info', 'brand.mark_drafts_image_unavailable', {
        profileId: profile.$id,
        aiEnabled,
        imageReady,
      })
      throw createError({
        status: 503,
        statusText: 'Generating drafts is not available',
        data: { code: 'image_unavailable' },
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
      { userId, profileId: profile.$id, kind: 'drafts' },
      measurement,
    )
    if (rejection) {
      logEvent('info', 'brand.mark_drafts_throttled', { profileId: profile.$id, code: rejection.code })
      setHeader(event, 'Retry-After', rejection.retryAfterSec)
      throw createError({
        status: 429,
        statusText: 'Draft limit reached',
        data: { code: rejection.code },
      })
    }
    const used = Math.min(measurement.narrowCount, BRAND_DESIGN_DRAFTS_DAILY_LIMIT)
    const quota = {
      used,
      limit: BRAND_DESIGN_DRAFTS_DAILY_LIMIT,
      remaining: Math.max(0, BRAND_DESIGN_DRAFTS_DAILY_LIMIT - used),
    }

    const locale = profile.contentLocale === 'en' ? 'en' : 'de'
    const model = stub ? 'dev-stub' : (await getEffectiveAiImageConfig(event)).model
    const result = await runBrandMarkDrafts(event, profile, stepRows, model)

    if (result.failure || !result.images?.length) {
      await recordBrandEvent(event, {
        type: 'design.drafts.run',
        profileId: profile.$id,
        userId,
        payload: { images: 0, failure: result.failure ?? 'empty_result', model },
      })
      if (result.failure === 'no_brief') {
        throw createError({
          status: 409,
          statusText: 'No mark briefing to draft from',
          data: { code: 'drafts_no_brief' },
        })
      }
      throw createError({
        status: 502,
        statusText: 'Generating drafts failed',
        data: { code: 'drafts_failed' },
      })
    }

    /**
     * NACHEINANDER ABLEGEN, nicht parallel: der Vorgabe-Name zählt vom Stand der
     * Marke weiter („Entwurf 5"), und vier gleichzeitige Anlagen läsen alle
     * denselben Stand. Es sind vier Dateien, keine vierhundert.
     */
    let created = 0
    for (const [index, image] of result.images.entries()) {
      await createBrandMarkDraft(event, {
        profileId: profile.$id,
        bytes: image.bytes,
        extension: image.extension,
        title: brandMarkDraftTitleFor(before, index, locale),
        model: result.model ?? model,
        promptHash: result.promptHash ?? '',
      })
      created += 1
    }

    // NEU GELESEN, damit die Antwort die Zeilen zeigt, die WIRKLICH stehen.
    const items = await listBrandMarkDrafts(event, profile.$id)
    // Der Slot-Wert nennt nur BEHALTENE Entwürfe — ein frischer Lauf ändert ihn
    // deshalb nicht. Der Aufruf steht trotzdem hier: er zieht einen Slot nach,
    // der aus einem früheren Stand hängengeblieben ist, und er ist ein No-op,
    // wenn es nichts zu ändern gibt (s. `syncBrandMarkDraftsSlot`).
    await syncBrandMarkDraftsSlot(event, profile, stepRows, items)

    await recordBrandEvent(event, {
      type: 'design.drafts.run',
      profileId: profile.$id,
      userId,
      payload: {
        images: created,
        promptHash: result.promptHash ?? '',
        model: result.model ?? model,
        ms: result.ms ?? 0,
      },
    })

    return {
      ok: true,
      items,
      max: BRAND_MARK_DRAFTS_MAX,
      created,
      model: result.model ?? model,
      quota,
    }
  }
  finally {
    burst.release()
  }
})
