import { brandKitBundleName, brandKitBundleReadableName, brandKitContentDisposition } from '../../../../shared/brandKitFiles'
import { BRAND_KIT_EXAMPLE_CACHE_CONTROL, brandKitExample } from '../../../utils/brandKitExample'

/**
 * DAS BÜNDEL DES ÖFFENTLICHEN BEISPIEL-KITS
 * (`GET /api/brand/example/kit.zip`, Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.9, Paket K7) — alle Dateien des Beispiels plus `marks/*.svg` und
 * `README.md`, byte-gleich bei jedem Abruf (fester Stand, s.
 * `shared/examples/kailuaCoffeeKit.ts`).
 *
 * Kein 413-Deckel wie bei einer Marke: der Inhalt ist eine Konstante im Code;
 * wüchse er über den Deckel, finge es der Test `brandKitExample.test.ts` ab.
 */
export default defineEventHandler((event): Buffer => {
  const example = brandKitExample()
  const zip = Buffer.from(example.zip)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', brandKitContentDisposition(
    brandKitBundleName(example.slug, example.stand),
    brandKitBundleReadableName(example.title, example.stand),
  ))
  setHeader(event, 'Content-Length', zip.byteLength)
  setHeader(event, 'Cache-Control', BRAND_KIT_EXAMPLE_CACHE_CONTROL)
  return zip
})
