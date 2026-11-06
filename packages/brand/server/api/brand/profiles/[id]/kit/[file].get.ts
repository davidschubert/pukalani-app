import {
  brandKitAvailability,
  brandKitContentDisposition,
  brandKitDownloadName,
  brandKitFile,
  brandKitFileErrorCode,
  brandKitReadableName,
} from '../../../../../../shared/brandKitFiles'
import { brandKitFileContent, loadBrandKitContext } from '../../../../../utils/brandKit'
import { bookBrandKitDownload } from '../../../../../utils/brandKitQuota'
import { recordBrandEvent } from '../../../../../utils/brandEvents'

/**
 * EINE DATEI DES KITS (`GET /api/brand/profiles/:id/kit/:file`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.9/§2.11/§2.12/§2.13, Paket K2).
 *
 * ── `:file` IST EINE WAHL AUS EINER LISTE, KEIN PFAD (§2.12 Nr. 4) ───────
 * Der Parameter wird in der Registry GESUCHT (`brandKitFile`). Er wird nie zu
 * einem Dateinamen zusammengesetzt, nie an ein Verzeichnis gehängt, nie
 * ausgegeben. Unbekannt ⇒ 404, wie ein Pfad, den es nicht gibt.
 *
 * ── VIER ANTWORTEN, IN DIESER REIHENFOLGE ────────────────────────────────
 *  1. 404 — kein Zugang, fremde Marke, unbekannte Datei.
 *  2. 403 `derivation_locked` — die Ableitung ist nicht freigeschaltet (K1).
 *  3. 429 `brand_kit_limit` — 60 Abrufe je Marke und Tag sind erreicht.
 *  4. 409 `kit_file_design_missing` / `kit_file_not_built_yet` — die Datei
 *     gäbe es, aber ihre
 *     Voraussetzung fehlt (`design_missing`: Schicht 2 steht nicht;
 *     `not_built_yet`: das Paket, das sie baut, kommt noch).
 *
 * Der Deckel steht VOR der Rechnung und HINTER der Schranke: eine 429 an einer
 * gesperrten Marke verriete, dass es an dieser Stelle etwas zu holen gibt.
 *
 * ── DIE DATEI WIRD NICHT ZWISCHENGESPEICHERT ─────────────────────────────
 * `private, no-store` (§2.9). Sie ist bei jedem Abruf neu gerechnet, sie trägt
 * die Marke im Namen, und ein geteilter Zwischenspeicher (Proxy, CDN) hätte
 * hier nichts zu suchen.
 *
 * ── DAS EREIGNIS TRÄGT DIE DATEI-ID, NICHT DEN DATEINAMEN ────────────────
 * Der Dateiname enthält den Markennamen; der Funnel trägt keinen Inhalt
 * (`brandEvents.ts` Regel 1).
 */
export default defineEventHandler(async (event): Promise<string> => {
  const file = brandKitFile(getRouterParam(event, 'file') ?? '')
  if (!file) throw createError({ status: 404, statusText: 'Not Found' })

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

  const availability = brandKitAvailability(file, !!context.preset)
  if (!availability.available) {
    throw createError({
      status: 409,
      statusText: 'Kit file is not available yet',
      data: { code: brandKitFileErrorCode(availability.reason) },
    })
  }

  const content = brandKitFileContent(file, context)
  if (content === null) {
    // Der Erzeuger hat trotz grüner Verfügbarkeit nichts geliefert — das ist
    // ein Fehler in der Registry, kein Zustand der Marke. 409 mit demselben
    // Code bleibt trotzdem die richtige Antwort für den Client.
    throw createError({
      status: 409,
      statusText: 'Kit file is not available yet',
      data: { code: brandKitFileErrorCode('not_built_yet') },
    })
  }

  const asciiName = brandKitDownloadName(file, context.slug, context.stand)
  setHeader(event, 'Content-Type', file.mime)
  setHeader(event, 'Content-Disposition', brandKitContentDisposition(
    asciiName,
    brandKitReadableName(file, context.profile.title ?? '', context.stand),
  ))
  setHeader(event, 'Cache-Control', 'private, no-store')

  await recordBrandEvent(event, {
    type: 'kit.downloaded',
    profileId: context.profile.$id,
    userId: context.userId,
    payload: { file: file.id, design: !!context.preset },
  })

  return content
})
