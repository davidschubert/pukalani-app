import { createBrandAnalyzeSchema } from '../../../../../schemas/brandProfile'
import {
  BRAND_ANALYZE_ACCOUNT_DAILY_LIMIT,
  BRAND_ANALYZE_DAILY_LIMIT_CODE,
  BRAND_ANALYZE_DAY_WINDOW_MS,
  brandAnalyzeDayKey,
  brandAnalyzeQuotaExceeded,
} from '../../../../../shared/brandAnalyzeLimits'
import { BRAND_WEBSITE_URL_MAX } from '../../../../../shared/brandStartCard'
import { composeSiteAnalysis } from '../../../../../shared/brandSiteAnalysis'
import type { BrandSiteAnalyzeResponse } from '../../../../../shared/types/brand'
import {
  loadOwnedProfile,
  requireProfileIdParam,
  touchProfile,
} from '../../../../utils/brandStore'
import { BrandSiteFetchError, fetchBrandSite } from '../../../../utils/brandSiteFetch'

/**
 * „ICH LESE SIE, DAMIT DU DICH NICHT WIEDERHOLEN MUSST" (P2.3) — die Route,
 * die dieses Versprechen der Startkarte einlöst.
 *
 * `POST /api/brand/profiles/:id/analyze` liest die Website EINMAL, zieht den
 * Text heraus und legt ihn am Profil ab. Von da an ist er Georges Material für
 * `a.toneAnalysis`, `a.competitors` und `a.pitch` — er reist über
 * `BrandGeneratorContext.siteAnalysis` in den Prompt, klar als Quelle
 * gekennzeichnet und ausdrücklich NICHT als Anweisung (Prompt-Injection-Grenze,
 * Plan §9b).
 *
 * ── SIE LÄUFT NICHT VON SELBST, UND DAS IST DER PUNKT ─────────────────────
 * Die ANLAGE stösst nichts an (sie soll schnell sein), und ein Zeitplan liest
 * hier gar nichts. Gelesen wird auf KNOPFDRUCK, mit einer Bestätigung davor —
 * „URL-Analyse SICHTBAR, nicht heimlich" (Plan §3d). Was der Server tut, muss
 * jemand ausgelöst haben und danach benennen können.
 *
 * ── DREI TORE, IN DIESER REIHENFOLGE ──────────────────────────────────────
 *  1. `requireBrandAccess` — die Datentür der geschlossenen Beta (404).
 *  2. `loadOwnedProfile` — fremdes oder fehlendes Profil antworten identisch.
 *  3. Der TAGES-Deckel je Konto (20, `shared/brandAnalyzeLimits.ts`). Er zählt
 *     VOR dem Abruf: ein Deckel, der erst nach der ausgehenden Verbindung
 *     greift, hat den Server schon losgeschickt. Davor liegt zusätzlich der
 *     IP-Eimer `brand:analyze` (3/min) in `05.rate-limit.ts`.
 *
 * ── DIE FEHLER SIND NEUTRAL, DAS LOG IST ES NICHT ─────────────────────────
 * Nach draussen gehen fünf grobe Codes (`no_url` · `blocked_target` ·
 * `not_html` · `too_large` · `fetch_failed`). Feiner darf es nicht werden:
 * „Verbindung abgelehnt" gegen „Zeitüberschreitung" gegen „das ist eine
 * private Adresse" macht aus dieser Route einen Portscanner mit Anmeldung. Ins
 * LOG geht der HOST (den hat der Aufrufer selbst genannt) — nie der Pfad, nie
 * der gelesene Text (Log-Regel §6).
 *
 * ── WAS NICHT GESPEICHERT WIRD ────────────────────────────────────────────
 * Das rohe HTML. Es verlässt `fetchBrandSite()` gar nicht erst — dort wird
 * extrahiert, und zurück kommt schon der fertige Text (Plan §9b: „Rohmaterial
 * nach Extraktion früh gelöscht").
 *
 * ── WARUM DIESER WEG KEINE `robots.txt` LIEST — UND DER CHECK SCHON ───────
 * Seit BS1 R2b (Davids Entscheidung 2026-09-08) holt der Brand-Check vor jedem
 * Abruf `robots.txt` und prüft den TDM-Nutzungsvorbehalt
 * (`server/utils/brandCheckFetch.ts`, eigener Absender `PukalaniBrandCheck`).
 * DIESE Route bleibt bewusst, wie sie war, und der Unterschied ist nicht
 * Bequemlichkeit, sondern die Begründung: hier trägt ein eingeloggter
 * Betreiber die Adresse SEINER EIGENEN Website ein und drückt selbst auf den
 * Knopf. `robots.txt` regelt, was Crawler und Suchmaschinen bei einem fremden
 * Auftritt tun dürfen — nicht, was ein Werkzeug darf, das sein Besitzer auf
 * sein eigenes Haus richtet. Beim Check dagegen kann die Adresse von JEDEM
 * stammen, und dort trägt die Begründung nicht (Faktenblatt §4c).
 *
 * Wer diesen Weg eines Tages für FREMDE Adressen öffnet (etwa als Recherche
 * über einen Wettbewerber), öffnet damit auch diese Frage — dann gehört er auf
 * `fetchBrandSiteForCheck` umgestellt, nicht mit einem Häkchen versehen.
 */
export default defineEventHandler(async (event): Promise<BrandSiteAnalyzeResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  // EIN LEERER RUMPF IST DER NORMALFALL: der Knopf schickt nichts mit, gelesen
  // wird die Adresse der Startkarte. `readBody` wirft bei leerem Rumpf je nach
  // Content-Type — ein 400 dafür wäre die falsche Antwort auf „lies meine
  // Website".
  const raw = await readBody(event).catch(() => ({}))
  const parsed = createBrandAnalyzeSchema().safeParse(raw ?? {})
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid analyze payload', data: { code: 'invalid_body' } })
  }

  // Der Rumpf schlägt die Startkarte, die Startkarte schlägt nichts.
  const target = (parsed.data.url ?? profile.websiteUrl ?? '').trim()
  if (!target) {
    throw createError({
      status: 400,
      statusText: 'No website address to analyse',
      data: { code: 'no_url' },
    })
  }

  // ── Der Tages-Deckel je Konto ────────────────────────────────────────────
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}${brandAnalyzeDayKey(userId)}`, BRAND_ANALYZE_DAY_WINDOW_MS)
  if (brandAnalyzeQuotaExceeded(state.count, BRAND_ANALYZE_ACCOUNT_DAILY_LIMIT)) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({
      status: 429,
      statusText: 'Site analysis limit reached',
      data: { code: BRAND_ANALYZE_DAILY_LIMIT_CODE },
    })
  }

  const started = Date.now()
  let result: Awaited<ReturnType<typeof fetchBrandSite>>
  try {
    result = await fetchBrandSite(target)
  }
  catch (error) {
    const code = error instanceof BrandSiteFetchError ? error.code : 'fetch_failed'
    logEvent('info', 'brand.site_analysis_failed', {
      profileId,
      code,
      // Der HOST, nie der Pfad und nie die Antwort. Ohne ihn wäre ein Bericht
      // („bei mir geht es nicht") nicht nachvollziehbar; mit dem Pfad stünde
      // eine private Adresse im Log.
      host: hostOf(target),
      ms: Date.now() - started,
    })
    throw createError({
      // Was am ZIEL liegt, ist ein 400: der Mensch hat eine Adresse genannt,
      // hinter der keine lesbare Website steht. Nur „wir kamen nicht dran" ist
      // ein 502 — dort ist nichts falsch benannt, es hat nur nicht geklappt.
      status: code === 'fetch_failed' ? 502 : 400,
      statusText: 'Website could not be analysed',
      data: { code },
    })
  }

  const analysis = composeSiteAnalysis(result.content)
  const analyzedAt = new Date().toISOString()

  // Speichern über denselben Weg wie jede andere Profil-Änderung: das Lesen ist
  // eine HANDLUNG des Menschen, `lastActivityAt` darf sich also bewegen (anders
  // als beim No-op-Speichern eines Formulars).
  await touchProfile(event, profileId, {
    siteAnalysis: analysis,
    siteAnalyzedAt: analyzedAt,
    // Die ANGEFRAGTE Adresse, nicht die, bei der wir nach den Weiterleitungen
    // gelandet sind. Sie ist der Massstab für „veraltet", und der vergleicht
    // sich mit der `websiteUrl` der Startkarte: `https://example.com` landet
    // regelmässig auf `https://example.com/` oder `https://www.example.com/`,
    // und mit dem Endpunkt als Massstab wäre JEDER Zwischenspeicher sofort
    // veraltet. Wo wir wirklich waren, steht im Log.
    siteAnalysisUrl: target.slice(0, BRAND_WEBSITE_URL_MAX),
  })

  logEvent('info', 'brand.site_analysis_completed', {
    profileId,
    host: result.finalHost,
    chars: analysis.length,
    ms: Date.now() - started,
  })

  return {
    analyzed: true,
    title: result.content.title,
    description: result.content.description,
    textLength: analysis.length,
    analyzedAt,
  }
})

/** Nur der Host — und nur, wenn sich die Eingabe überhaupt als URL lesen lässt. */
function hostOf(value: string): string {
  try {
    return new URL(value).host
  }
  catch {
    return ''
  }
}
