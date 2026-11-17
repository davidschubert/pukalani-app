import { BRAND_DESIGN_READING_DAILY_LIMIT } from '../../../../../../shared/brandAiLimits'
import {
  type BrandReadingSummary,
  brandReadingSlotValue,
} from '../../../../../../shared/brandReading'
import { BRAND_RUN_OUTCOMES, BRAND_RUN_SCOPES, emptyBrandRunDetail } from '../../../../../../shared/brandRun'
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
import {
  brandRunProfileExists,
  brandRunStore,
  runningBrandRunView,
  startBrandRun,
} from '../../../../../utils/brandRun'
import { BRAND_PROFILES_TABLE, loadStepRows } from '../../../../../utils/brandStore'

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
 *  4. DIE LAUF-SPERRE (`brand_runs`, Art `reading`, Gegenstand = die Marke) →
 *     läuft schon ein Lauf, 409 `run_running`, und kein Zähler wird berührt.
 *  5. Die Drossel → 429 mit `Retry-After` und Grund; die Sperre fällt wieder.
 *  6. `202` — der Lauf rechnet hinter der Antwort (s. u.).
 *
 * ── DIE ANTWORT KOMMT SOFORT, DER LAUF RECHNET WEITER (LL1 b, 2026-11-17) ─
 * Ein Vision-Zug über zwölf Bilder kann länger brauchen, als der Webserver
 * wartet (60 s). Bis hierher sah der Mensch dann einen Fehler, obwohl die
 * Lesung entstand — und ein zweiter Klick bezahlte sie noch einmal. Jetzt
 * nimmt die Route die Sperre, bucht, antwortet `202` und rechnet mit Besitzer
 * weiter (`startBrandRun`, Regel „Lange Arbeit gehört nicht in die Anfrage").
 * Die Werkstatt fragt `GET …/inspiration` ab; dort stehen Liste, Fazit und
 * Lauf-Stand. Die Gründe eines gescheiterten Laufs sind dieselben Wörter wie
 * früher die Fehler-Codes (`reading_unavailable`, `reading_too_large`) —
 * jetzt als Ausgang an der Lauf-Zeile.
 *
 * ── GESCHRIEBEN WIRD GEGEN DEN STAND VON JETZT ───────────────────────────
 * Die Lesung schreibt den Slot `g.reading` in die Kapitel-Zeile — und damit
 * deren ganze Slot-Ablage. Die Zeile wird dafür unmittelbar davor NEU
 * gelesen: mit dem Stand vom Start überschriebe ein Lauf im Hintergrund, was
 * der Mensch inzwischen im Kapitel gespeichert hat. Ein Bild, das während
 * des Laufs entfernt wurde, ist eine Lesung weniger, kein Fehler; gibt es
 * die Marke nicht mehr, wird nichts geschrieben.
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

  // (4) DIE SPERRE — vor Burst-Platz und Buchung. Ein Doppelklick (oder ein
  // zweiter Reiter) bekommt 409 `run_running`, bevor er einen Zähler berührt.
  const store = brandRunStore(event)
  const { lease } = await acquireRunLease(store, {
    scope: BRAND_RUN_SCOPES.reading,
    subject: profile.$id,
    detail: emptyBrandRunDetail({ limit: BRAND_DESIGN_READING_DAILY_LIMIT }),
  })

  /**
   * DER BURST-PLATZ (Audit-Befund 2026-09-09) — die Sicherung gegen den
   * PARALLELEN Lauf über MEHRERE Marken eines Kontos (je Marke hält die
   * Sperre darüber). VOR der Buchung und ohne `await` dazwischen: sonst
   * zählten gleichzeitige Anfragen alle dieselbe Null (Kopf von
   * `brandAiQuota.ts`). Der Platz gehört dem LAUF: freigegeben wird er in
   * dessen Abschluss — oder hier, wenn gar keiner startet.
   */
  const burst = retainBrandGeneration(userId)
  const measurement: BrandAiQuotaMeasurement = { narrowCount: 0, narrowResetSec: 0 }
  let rejection: Awaited<ReturnType<typeof bookBrandAiQuota>>
  try {
    rejection = await bookBrandAiQuota(
      event,
      { userId, profileId: profile.$id, kind: 'reading' },
      measurement,
    )
  }
  catch (error) {
    // Der Zähler war nicht erreichbar — dann läuft auch nichts, und die
    // Sperre darf den Knopf nicht zwei Minuten lang festhalten.
    burst.release()
    await dropRunLease(store, lease)
    throw error
  }
  if (rejection) {
    burst.release()
    await dropRunLease(store, lease)
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
  const detail = emptyBrandRunDetail({ booked: true, used, limit: BRAND_DESIGN_READING_DAILY_LIMIT })
  // Fail-soft — der Lauf schreibt das Detail spätestens mit seinem Ende.
  await touchRunLease(store, lease, { detail }).catch(() => {})

  startBrandRun({
    label: 'brand-reading',
    store,
    lease,
    detail,
    work: async ({ lost }) => {
      const model = stub ? 'dev-stub' : (await getEffectiveAiVisionConfig(event)).model
      const result = await runBrandInspirationReading(event, profile, stepRows, entries, model)
      detail.model = result.model ?? model

      if (result.failure || !result.readings || !result.summary) {
        await recordBrandEvent(event, {
          type: 'design.reading.run',
          profileId: profile.$id,
          userId,
          payload: { images: entries.length, read: 0, failure: result.failure ?? 'empty_result', model },
        })
        /**
         * ZU GROSS IST KEIN FEHLSCHLAG DES ANBIETERS (Audit-Befund 2026-09-09):
         * die Bilder passen nur nicht in EINEN Zug. Der eigene Grund schickt
         * die Diagnose in die richtige Richtung — die Werkstatt sagt dazu
         * ihren eigenen Satz.
         */
        return result.failure === 'too_large' ? 'reading_too_large' : 'reading_unavailable'
      }

      // Ohne Herzschlag darf ein anderer Start übernehmen — dann schreibt
      // DIESER Lauf nichts mehr (zwei Lesungen überschrieben einander).
      if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
      if (!await brandRunProfileExists(event, BRAND_PROFILES_TABLE, profile.$id)) {
        return BRAND_RUN_OUTCOMES.profileGone
      }

      const written = await storeBrandReadings(event, result.readings)
      detail.created = written

      const locale = profile.contentLocale === 'en' ? 'en' : 'de'
      const summary: BrandReadingSummary = result.summary
      const at = new Date().toISOString()
      const runLine = brandReadingRunLine(at, written, result.model ?? model, locale)
      const slotValue = brandReadingSlotValue(summary, runLine, brandReadingSlotLabels(locale))
      // DIE KAPITEL-ZEILE VON JETZT (s. Kopf) — nicht `stepRows` vom Start.
      await writeBrandReadingSlot(event, profile, await loadStepRows(event, profile.$id), slotValue)

      // NEU GELESEN, damit das Ereignis die Zeilen zählt, die WIRKLICH stehen
      // (ein Bild kann während des Laufs entfernt worden sein).
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
      return BRAND_RUN_OUTCOMES.done
    },
    // Der Platz gehört dem Lauf, nicht seinem Ergebnis — immer freigeben.
    settle: () => burst.release(),
  })

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return { ok: true, run: runningBrandRunView(lease, detail), quota }
})
