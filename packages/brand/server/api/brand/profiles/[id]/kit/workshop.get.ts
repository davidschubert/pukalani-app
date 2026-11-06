import type { BrandKitWorkshopResponse } from '../../../../../../shared/types/brandKit'
import { loadBrandKitContext } from '../../../../../utils/brandKit'
import { buildBrandKitWorkshop } from '../../../../../utils/brandKitWorkshop'

/**
 * DIE PUREN QUELLEN DER WERKSTATT-KAPITEL
 * (`GET /api/brand/profiles/:id/kit/workshop`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.9, Paket K5).
 *
 * EINE Route für alle vier puren Quellen dieses Pakets — die Begründung steht
 * im Kopf von `server/utils/brandKitWorkshop.ts` (Kurzform von `brand.md`,
 * `a.facts`, Kontakt-Vorlagen, Pressekit-Vorschau).
 *
 * ── SIE IST EINE EIGENTÜMER-AUSKUNFT, KEINE DATEI ────────────────────────
 * `loadBrandKitContext` ist dieselbe Tür wie beim Manifest und bei jeder
 * Kit-Datei: fremdes oder erfundenes Branding ⇒ 404 (Datentür), ohne
 * Freischaltung ⇒ 403 `derivation_locked` (die Werkstatt soll die Schranke
 * ZEIGEN können). Neu ist an dieser Route KEINE Grenze — nur ein Leser.
 *
 * ── `private, no-store` IST HIER SCHÄRFER ALS BEIM MANIFEST ──────────────
 * Diese Antwort trägt die Einträge von `a.facts`, und die sind `internal`:
 * sie reisen in KEINE Kit-Datei, in keinen Share-Schnappschuss und in keine
 * Publikation (§2.12 Nr. 2). Ein Zwischenspeicher wäre die einzige Stelle im
 * ganzen Produkt, an der sie ausserhalb der Datenbank lägen.
 *
 * ── SIE ZÄHLT AUF KEINEN EIMER ───────────────────────────────────────────
 * Kein KI-Aufruf (§2.11) und keine teure Rechnung — der `kitDay`-Eimer zählt
 * DATEIEN, weil die Zip-Bildung die einzige teure Rechnung ist. Eine
 * Werkstatt-Auskunft ist die Seite, nicht die Datei; zählte sie mit,
 * verbrauchte schon das Öffnen eines Kapitels das Kontingent.
 */
export default defineEventHandler(async (event): Promise<BrandKitWorkshopResponse> => {
  const context = await loadBrandKitContext(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return buildBrandKitWorkshop(event, context)
})
