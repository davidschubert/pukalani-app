import {
  brandKitContentDisposition,
  brandKitFileErrorCode,
  brandKitStandStamp,
} from '../../../../../../../shared/brandKitFiles'
import {
  BRAND_KIT_MARK_MIME,
  brandKitMarkFile,
  brandKitMarkReadableName,
} from '../../../../../../../shared/brandKitMarks'
import { loadBrandKitContext } from '../../../../../../utils/brandKit'
import { bookBrandKitDownload } from '../../../../../../utils/brandKitQuota'
import { recordBrandEvent } from '../../../../../../utils/brandEvents'

/**
 * EIN ZEICHEN DES KITS (`GET /api/brand/profiles/:id/kit/marks/:name`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.9/§2.12, Paket K6).
 *
 * ── WARUM SIE NEBEN `kit/:file` STEHT UND NICHT DARIN ────────────────────
 * `kit/:file` wählt aus einer GESCHLOSSENEN Registry mit festen Dateinamen;
 * die Zeichen sind eine je Setzung gerechnete MENGE (acht mit Preset, keine
 * ohne). Beides in einen Parameter zu legen hiesse, in derselben Route einmal
 * in einer Konstante und einmal in einem Rechenergebnis zu suchen — und
 * spätestens der erste Schrägstrich im Parameter (`marks/x.svg`) macht aus der
 * Wahl wieder einen Pfad. Nitro trennt die beiden Tiefen selbst:
 * `kit/marks/x.svg` erreicht `[file]` gar nicht (Gegenprobe im Test).
 *
 * ── DIESELBEN VIER ANTWORTEN, IN DERSELBEN REIHENFOLGE ───────────────────
 *  1. 404 — kein Zugang, fremde Marke, unbekannter Name.
 *  2. 403 `derivation_locked` — die Ableitung ist nicht freigeschaltet.
 *  3. 429 `brand_kit_limit` — 60 Abrufe je Marke und Tag.
 *  4. 409 `kit_file_design_missing` — es gibt kein Preset,
 *     also gibt es keine Setzung.
 *
 * Ein Unterschied zu `kit/:file` ist unvermeidlich: dort entscheidet die
 * Registry VOR dem Laden über 404, hier kann sie es nicht — welche Namen es
 * gibt, weiss erst das Preset. Der Name wird deshalb NACH dem Kontext in der
 * gerechneten Liste GESUCHT, und auch hier nie zusammengesetzt: kein Pfad,
 * kein `..`, keine Endung aus der Eingabe (§2.12 Nr. 4).
 *
 * ── OHNE PRESET IST DAS 409, NICHT 404 ───────────────────────────────────
 * Die Unterscheidung ist die Auskunft: 404 heisst „diesen Namen gibt es
 * nicht", 409 `kit_file_design_missing` heisst „es gäbe ihn, euch fehlt Schicht 2".
 * Deshalb wird die leere Liste ZUERST gefragt und erst danach der Name.
 */
export default defineEventHandler(async (event): Promise<string> => {
  const name = getRouterParam(event, 'name') ?? ''

  const context = await loadBrandKitContext(event)

  const rejection = await bookBrandKitDownload(event, context.profile.$id)
  if (rejection) {
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Too many kit downloads',
      data: { code: rejection.code },
    })
  }

  if (context.marks.length === 0) {
    throw createError({
      status: 409,
      statusText: 'Kit file is not available yet',
      data: { code: brandKitFileErrorCode('design_missing') },
    })
  }

  const mark = brandKitMarkFile(context.marks, name)
  if (!mark) throw createError({ status: 404, statusText: 'Not Found' })

  setHeader(event, 'Content-Type', BRAND_KIT_MARK_MIME)
  setHeader(event, 'Content-Disposition', brandKitContentDisposition(
    mark.filename,
    brandKitMarkReadableName(mark, context.profile.title ?? '', brandKitStandStamp(context.stand)),
  ))
  setHeader(event, 'Cache-Control', 'private, no-store')

  await recordBrandEvent(event, {
    type: 'kit.downloaded',
    profileId: context.profile.$id,
    userId: context.userId,
    // Die ID, nie der Dateiname: der trägt den Markennamen, der Funnel keinen
    // Inhalt (`brandEvents.ts` Regel 1). `marks/<slug>-…` wäre genau das —
    // deshalb steht hier die SETZUNG, nicht der Name.
    payload: { file: `marks/${mark.setting}-${mark.variant}.svg`, design: true },
  })

  return mark.svg
})
