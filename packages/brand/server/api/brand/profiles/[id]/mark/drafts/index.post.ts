import { BRAND_DESIGN_DRAFTS_DAILY_LIMIT } from '../../../../../../../shared/brandAiLimits'
import { BRAND_MARK_DRAFTS_PER_RUN } from '../../../../../../../shared/brandMarkDrafts'
import {
  BRAND_RUN_OUTCOMES,
  BRAND_RUN_SCOPES,
  brandRunOwesRefund,
  emptyBrandRunDetail,
  parseBrandRunDetail,
} from '../../../../../../../shared/brandRun'
import type { BrandMarkDraftsRunResponse } from '../../../../../../../shared/types/brand'
import {
  type BrandAiQuotaMeasurement,
  type BrandAiQuotaRequest,
  bookBrandAiQuota,
  refundBrandAiQuota,
} from '../../../../../../utils/brandAiQuota'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'
import { readBrandAiEnabled, retainBrandGeneration } from '../../../../../../utils/brandGenerators'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import {
  brandMarkDraftSources,
  brandMarkDraftTitleFor,
  brandMarkDraftsFree,
  brandMarkDraftsStubEnabled,
  createBrandMarkDraft,
  listBrandMarkDrafts,
  runBrandMarkDrafts,
  syncBrandMarkDraftsSlot,
} from '../../../../../../utils/brandMarkDrafts'
import {
  brandRunProfileExists,
  brandRunStore,
  runningBrandRunView,
  startBrandRun,
} from '../../../../../../utils/brandRun'
import { BRAND_PROFILES_TABLE, loadStepRows } from '../../../../../../utils/brandStore'
import { softFail } from '../../../../../../../../core/server/utils/softFail'

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
 *  4. Fehlt das Briefing? → 409 `drafts_no_brief`, bevor etwas gebucht wird.
 *  5. DIE LAUF-SPERRE (`brand_runs`, Art `drafts`, Gegenstand = die Marke) →
 *     läuft schon ein Lauf, 409 `run_running`, und kein Zähler wird berührt.
 *  6. Die Drossel → 429 mit `Retry-After` und Grund; die Sperre fällt wieder.
 *  7. `202` — der Lauf rechnet hinter der Antwort (s. u.).
 *
 * ── DIE ANTWORT KOMMT SOFORT, DER LAUF RECHNET WEITER (LL1 b, 2026-11-17) ─
 * Vier Bild-Aufrufe können länger brauchen, als der Webserver wartet (60 s).
 * Bis hierher sah der Mensch dann einen Fehler, obwohl die Entwürfe
 * entstanden — und ein zweiter Klick bezahlte vier weitere. Jetzt nimmt die
 * Route die Sperre, bucht, antwortet `202` und rechnet mit Besitzer weiter
 * (`startBrandRun`, Regel „Lange Arbeit gehört nicht in die Anfrage"). Die
 * Werkstatt fragt `GET …/mark/drafts` ab; dort stehen Liste und Lauf-Stand.
 * Die Gründe eines gescheiterten Laufs sind dieselben Wörter wie früher die
 * Fehler-Codes (`drafts_failed`, `drafts_no_brief`) — jetzt als Ausgang an
 * der Lauf-Zeile.
 *
 * ── NACH DEM BEZAHLTEN LAUF WIRD GEKLEMMT, NICHT ABGELEHNT ───────────────
 * Abgelegt wird gegen den Stand der Marke IM AUGENBLICK DES ABLEGENS: hat der
 * Mensch während des Laufs Entwürfe verworfen oder behalten, zählen die
 * Namen von dort weiter, und passt nicht mehr alles unter den Deckel, bleibt
 * der Rest weg. Gibt es die Marke nicht mehr, wird nichts abgelegt.
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
 *
 * ── KEIN ENTWURF ⇒ DER SICHTBARE LAUF ZÄHLT NICHT (Finding BE-004) ────────
 * Endet der Lauf, ohne dass EIN Entwurf abgelegt wurde (`no_images`,
 * `empty_result`, `no_brief`, ein Wurf beim Ablegen vor dem ersten Bild),
 * bucht sein Abschluss (`settle`) den ENGEN Zähler zurück — den, den der
 * Mensch als „Noch X von 3 Läufen heute" sieht — und vermerkt `refunded` an
 * der Lauf-Zeile. Konto- und Instanz-Deckel bleiben gebucht: sie sind das
 * Missbrauchsnetz, sonst wäre ein provozierter Leer-Lauf ein unbegrenzt
 * wiederholbarer Freilauf (Kopf von `brandAiQuota.ts`). Ein TEILERFOLG
 * (1 von 4) ist ein Lauf und bleibt gebucht. Nach einer 429 gibt es nichts
 * zurückzubuchen — dann startet gar kein Lauf.
 *
 * STIRBT DER LAUF MITTENDRIN (Ausliefern, Absturz), kann er selbst nicht
 * mehr zurückbuchen. Der NÄCHSTE Start holt es nach, wenn der abgebrochene
 * Vorgänger gebucht und nichts abgelegt hatte (`brandRunOwesRefund`): erst
 * der Vermerk am Vorgänger, dann die Rückbuchung — so bucht auch nach einer
 * abgelehnten Drossel niemand ein zweites Mal zurück. Damit der Nachfolger
 * „nichts abgelegt" richtig liest, schreibt der Lauf die Zahl seiner Entwürfe
 * nach JEDEM abgelegten Bild an die Zeile (wie die Lesung der Vorbilder) —
 * sonst bekäme ein Lauf, der NACH dem Ablegen stirbt, seinen sichtbaren Lauf
 * zurück, obwohl die Entwürfe da sind.
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

  // (4) OHNE BRIEFING GIBT ES NICHTS ZU ENTWERFEN — und das lässt sich lesen,
  // bevor eine Sperre genommen oder ein Zähler berührt wird. Dem Menschen
  // fehlt ein Schritt; das ist kein Fehler der Instanz (Info-Zeile).
  if (!brandMarkDraftSources(profile, stepRows)) {
    logEvent('info', 'brand.mark_drafts_failed', { profileId: profile.$id, failure: 'no_brief' })
    throw createError({
      status: 409,
      statusText: 'No mark briefing to draft from',
      data: { code: 'drafts_no_brief' },
    })
  }

  // (5) DIE SPERRE — vor Burst-Platz und Buchung. Ein Doppelklick (oder ein
  // zweiter Reiter) bekommt 409 `run_running`, bevor er einen Zähler berührt.
  const store = brandRunStore(event)
  const quotaRequest: BrandAiQuotaRequest = { userId, profileId: profile.$id, kind: 'drafts' }
  const { lease, previous, previousState } = await acquireRunLease(store, {
    scope: BRAND_RUN_SCOPES.drafts,
    subject: profile.$id,
    detail: emptyBrandRunDetail({ limit: BRAND_DESIGN_DRAFTS_DAILY_LIMIT }),
  })

  // DER ABGEBROCHENE VORGÄNGER (s. Kopf): erst vermerken, dann zurückbuchen.
  // Scheitert der Vermerk, wird NICHT zurückgebucht — lieber verliert ein
  // Mensch einmal einen sichtbaren Lauf, als dass derselbe Vorgänger zweimal
  // zurückbucht.
  if (previous && brandRunOwesRefund(previousState, previous.detail, previous.outcome)) {
    try {
      await store.update(previous.$id, {
        detail: JSON.stringify({ ...parseBrandRunDetail(previous.detail), refunded: true }),
      })
      await refundBrandAiQuota(event, quotaRequest)
      logEvent('info', 'brand.mark_drafts_stalled_refunded', { profileId: profile.$id, previousSeq: previous.seq })
    }
    catch (error) {
      logEvent('warn', 'brand.mark_drafts_stalled_refund_failed', {
        profileId: profile.$id,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

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
    rejection = await bookBrandAiQuota(event, quotaRequest, measurement)
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
  const detail = emptyBrandRunDetail({ booked: true, used, limit: BRAND_DESIGN_DRAFTS_DAILY_LIMIT })
  // `booked` SOFORT an die Zeile: erst damit kann ein Nachfolger nach einem
  // Absturz die Rückbuchung nachholen. Fail-soft — der Lauf schreibt es
  // spätestens mit seinem Ende.
  await touchRunLease(store, lease, { detail }).catch(softFail('brand:api/brand/profiles/[id]/mark/drafts/index.post:touchRunLease', undefined))

  const locale = profile.contentLocale === 'en' ? 'en' : 'de'

  startBrandRun({
    label: 'brand-drafts',
    store,
    lease,
    detail,
    work: async ({ lost, progress }) => {
      const model = stub ? 'dev-stub' : (await getEffectiveAiImageConfig(event)).model
      const result = await runBrandMarkDrafts(event, profile, stepRows, model)
      detail.model = result.model ?? model

      if (result.failure || !result.images?.length) {
        const failure = result.failure ?? 'empty_result'
        // EINE Zeile für den Betreiber — Kennzahlen, nie Prompt oder Inhalt.
        // `no_brief` ist KEIN Fehler der Instanz und bleibt eine Info-Zeile.
        logEvent(failure === 'no_brief' ? 'info' : 'error', 'brand.mark_drafts_failed', {
          profileId: profile.$id,
          model,
          failure,
          failedCalls: result.failedCalls ?? 0,
        })
        await recordBrandEvent(event, {
          type: 'design.drafts.run',
          profileId: profile.$id,
          userId,
          // `refunded`: der enge Zähler geht im Abschluss zurück (s. Kopf).
          payload: { images: 0, failure, model, refunded: true },
        })
        return failure === 'no_brief' ? 'drafts_no_brief' : 'drafts_failed'
      }

      // Ohne Herzschlag darf ein anderer Start übernehmen — dann legt DIESER
      // Lauf nichts mehr ab (zwei Läufe füllten den Deckel doppelt).
      if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
      if (!await brandRunProfileExists(event, BRAND_PROFILES_TABLE, profile.$id)) {
        return BRAND_RUN_OUTCOMES.profileGone
      }

      /**
       * NACHEINANDER ABLEGEN, gegen den Stand von JETZT (s. Kopf): der
       * Vorgabe-Name zählt vom Stand der Marke weiter („Entwurf 5"), und vier
       * gleichzeitige Anlagen läsen alle denselben Stand. Was nicht mehr unter
       * den Deckel passt, bleibt weg — geklemmt, nicht abgelehnt.
       */
      const current = await listBrandMarkDrafts(event, profile.$id)
      const room = brandMarkDraftsFree(current)
      for (const [index, image] of result.images.slice(0, room).entries()) {
        try {
          await createBrandMarkDraft(event, {
            profileId: profile.$id,
            bytes: image.bytes,
            extension: image.extension,
            title: brandMarkDraftTitleFor(current, index, locale),
            model: result.model ?? model,
            promptHash: result.promptHash ?? '',
          })
          detail.created += 1
          // SOFORT an die Zeile (LL1 c, 2026-11-20): stirbt der Lauf nach dem
          // Ablegen, sieht der Nachfolger den Entwurf und bucht nicht für
          // einen Lauf mit Ergebnis zurück (`brandRunOwesRefund`). Nach JEDEM
          // Bild, nicht erst nach dem letzten — schon der erste Entwurf macht
          // den Lauf zu einem Lauf. Fail-soft: das Ende schreibt alles.
          await progress()
        }
        catch (error) {
          // Ein Wurf beim Ablegen: was schon liegt, bleibt (Teilerfolg ist
          // ein Lauf); liegt noch nichts, ist es ein Lauf ohne Ergebnis.
          logEvent('error', 'brand.mark_drafts_store_failed', {
            profileId: profile.$id,
            stored: detail.created,
            message: error instanceof Error ? error.message : 'unknown',
          })
          break
        }
      }

      if (detail.created === 0) {
        await recordBrandEvent(event, {
          type: 'design.drafts.run',
          profileId: profile.$id,
          userId,
          payload: { images: 0, failure: 'store_failed', model: result.model ?? model, refunded: true },
        })
        return 'drafts_failed'
      }

      // NEU GELESEN, damit der Slot die Zeilen sieht, die WIRKLICH stehen.
      // Der Slot-Wert nennt nur BEHALTENE Entwürfe — ein frischer Lauf ändert
      // ihn deshalb nicht; der Aufruf zieht aber einen Slot nach, der aus
      // einem früheren Stand hängengeblieben ist (`syncBrandMarkDraftsSlot`).
      //
      // DIE KAPITEL-ZEILE WIRD DAFÜR NEU GELESEN: der Sync schreibt die ganze
      // Slot-Ablage der Zeile zurück. Mit dem Stand vom START überschriebe er
      // alles, was der Mensch während des Laufs im Kapitel gespeichert hat.
      const items = await listBrandMarkDrafts(event, profile.$id)
      await syncBrandMarkDraftsSlot(event, profile, await loadStepRows(event, profile.$id), items)

      await recordBrandEvent(event, {
        type: 'design.drafts.run',
        profileId: profile.$id,
        userId,
        payload: {
          images: detail.created,
          promptHash: result.promptHash ?? '',
          model: result.model ?? model,
          ms: result.ms ?? 0,
        },
      })
      return BRAND_RUN_OUTCOMES.done
    },
    settle: async (outcome) => {
      // Der Platz gehört dem Lauf, nicht seinem Ergebnis — immer freigeben.
      burst.release()
      // Kein einziger Entwurf abgelegt ⇒ den sichtbaren Lauf zurückgeben.
      // Fail-soft in `refundBrandAiQuota` selbst. NICHT nach verlorenem
      // Herzschlag: dann bucht der NÄCHSTE Start für diesen Lauf zurück
      // (`brandRunOwesRefund` — ob er ihn als abgebrochen vorfindet oder mit
      // dem Ende `lease_lost`), sonst ginge es zweimal zurück.
      if (detail.created === 0 && outcome !== BRAND_RUN_OUTCOMES.leaseLost) {
        await refundBrandAiQuota(event, quotaRequest)
        detail.refunded = true
      }
    },
  })

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return { ok: true, run: runningBrandRunView(lease, detail), quota }
})
