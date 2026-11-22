import {
  brandKitContentDisposition,
  brandKitDownloadName,
  brandKitFile,
  brandKitReadableName,
} from '../../../../../shared/brandKitFiles'
import { BRAND_KIT_EXAMPLE_CACHE_CONTROL, brandKitExample } from '../../../../utils/brandKitExample'

/**
 * EINE DATEI DES ÖFFENTLICHEN BEISPIEL-KITS
 * (`GET /api/brand/example/kit/:file`, Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.9, Paket K7).
 *
 * Öffentlich und ohne Anmeldung: Kailua Coffee Co. ist das Beispiel-Branding
 * auf der Anatomie `/discover/kailua-coffee-co`. Der Inhalt kommt aus
 * denselben Erzeugern wie das Kit einer echten Marke
 * (`server/utils/brandKitExample.ts`).
 *
 * `:file` ist — wie bei der Marken-Route — eine Wahl aus der Registry, kein
 * Pfad: unbekannt ⇒ 404. Eine Datei, die das Beispiel nicht hat, ebenfalls
 * 404 (hier gibt es keine Schranke, die ein 409 erklären müsste).
 *
 * `inline` statt `attachment`: wer auf der Anatomie „brand.md" anklickt, soll
 * die Datei SEHEN können; der Dateiname reist trotzdem mit.
 */
export default defineEventHandler((event): string => {
  const file = brandKitFile(getRouterParam(event, 'file') ?? '')
  if (!file) throw createError({ status: 404, statusText: 'Not Found' })

  const example = brandKitExample()
  const content = example.files.get(file.id)
  if (content === undefined) throw createError({ status: 404, statusText: 'Not Found' })

  setHeader(event, 'Content-Type', file.mime)
  setHeader(event, 'Content-Disposition', brandKitContentDisposition(
    brandKitDownloadName(file, example.slug, example.stand),
    brandKitReadableName(file, example.title, example.stand),
  ).replace(/^attachment/, 'inline'))
  setHeader(event, 'Cache-Control', BRAND_KIT_EXAMPLE_CACHE_CONTROL)
  return content
})
