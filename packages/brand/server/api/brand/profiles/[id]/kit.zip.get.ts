import {
  brandKitBundleName,
  brandKitBundleReadableName,
  brandKitContentDisposition,
} from '../../../../../shared/brandKitFiles'
import {
  BRAND_KIT_ZIP_MAX_BYTES,
  BRAND_KIT_ZIP_WEIGHT,
  decideBrandKitZipSize,
} from '../../../../../shared/brandKitLimits'
import { brandKitZipRawBytes, buildBrandKitZip } from '../../../../../shared/brandKitZip'
import { brandKitZipEntries, loadBrandKitContext } from '../../../../utils/brandKit'
import { bookBrandKitDownload } from '../../../../utils/brandKitQuota'
import { recordBrandEvent } from '../../../../utils/brandEvents'

/**
 * DAS BÜNDEL (`GET /api/brand/profiles/:id/kit.zip`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.9/§2.11/§2.12, Paket K6).
 *
 * ── ES IST DIE EINZIGE TEURE RECHNUNG DIESES PRODUKTS ────────────────────
 * Jede andere Route rechnet Zeichenketten; diese packt sie zusätzlich. Genau
 * deshalb zählt sie FÜNFFACH auf den Tages-Eimer (`BRAND_KIT_ZIP_WEIGHT`) und
 * genau deshalb hat sie einen DECKEL. Beides steht VOR dem Packen: wer erst
 * baut und dann fragt, hat schon bezahlt.
 *
 * ── DER DECKEL WIRD ZWEIMAL GEFRAGT, UND DAS IST ABSICHT (§2.6) ──────────
 * Einmal auf die UNKOMPRIMIERTE Summe (bevor gepackt wird — das ist der
 * Schutz) und einmal auf das FERTIGE Zip (danach — das ist die Zusage über
 * die Antwort). Die zweite Frage kann heute nicht anders ausgehen als die
 * erste, weil Deflate nie vergrössert; sie steht trotzdem da, weil die Zusage
 * „diese Route liefert nie mehr als 5 MB aus" sonst von einer Eigenschaft des
 * Packers abhinge. Die ENTSCHEIDUNG selbst ist pur
 * (`decideBrandKitZipSize`) — so ist der 413-Zweig mit einem kleinen Deckel
 * prüfbar, ohne dass es irgendwo einen Env-Schalter gibt.
 *
 * ── ES GIBT KEINE GESPEICHERTE FASSUNG ───────────────────────────────────
 * `private, no-store`, bei jedem Abruf neu gepackt, byte-gleich bei gleichem
 * Stand (Begründung im Kopf von `shared/brandKitZip.ts`). Ohne Preset fehlen
 * Tokens, Zeichen und Lizenzen — die README im Bündel nennt das ausdrücklich,
 * statt ein volles Kit zu behaupten.
 *
 * ── DER NAME DER ROUTE ───────────────────────────────────────────────────
 * Die Datei heisst `kit.zip.get.ts`: Nitro nimmt `.get` als Methode und den
 * Rest — Punkt inklusive — als Pfad. Die Adresse ist damit die des Konzepts
 * (§2.9), und sie endet auf `.zip`, was jedem Browser und jedem `curl -O` den
 * richtigen Dateinamen gibt, auch wenn ein Proxy den `Content-Disposition`
 * verschluckt.
 */
export default defineEventHandler(async (event): Promise<Buffer> => {
  const context = await loadBrandKitContext(event)

  const rejection = await bookBrandKitDownload(event, context.profile.$id, BRAND_KIT_ZIP_WEIGHT)
  if (rejection) {
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Too many kit downloads',
      data: { code: rejection.code },
    })
  }

  const entries = brandKitZipEntries(context)

  const rawTooLarge = decideBrandKitZipSize(brandKitZipRawBytes(entries), BRAND_KIT_ZIP_MAX_BYTES)
  if (rawTooLarge) throw brandKitTooLarge(rawTooLarge)

  const zip = Buffer.from(buildBrandKitZip(entries, context.stand))

  const zipTooLarge = decideBrandKitZipSize(zip.byteLength, BRAND_KIT_ZIP_MAX_BYTES)
  if (zipTooLarge) throw brandKitTooLarge(zipTooLarge)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', brandKitContentDisposition(
    brandKitBundleName(context.slug, context.stand),
    brandKitBundleReadableName(context.profile.title ?? '', context.stand),
  ))
  setHeader(event, 'Content-Length', zip.byteLength)
  setHeader(event, 'Cache-Control', 'private, no-store')

  await recordBrandEvent(event, {
    type: 'kit.downloaded',
    profileId: context.profile.$id,
    userId: context.userId,
    payload: { file: 'kit.zip', design: !!context.preset },
  })

  return zip
})

function brandKitTooLarge(code: string): Error {
  return createError({
    status: 413,
    statusText: 'Kit bundle too large',
    data: { code },
  })
}
