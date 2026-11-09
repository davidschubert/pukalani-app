import { INSIGHTS_ARTICLE_COMMENT_TARGET, insightsPostAcceptsComments } from '../../shared/insightsPublic'
import { toInsightsPost } from '../../shared/insightsRows'

/**
 * WER DARF UNTER EINEM BEITRAG KOMMENTIEREN? (BI2 K7, 2026-11-09.)
 *
 * Die Kommentar-Routen nehmen `targetType` + `targetId` vom Aufrufer an — sie
 * wissen nicht, was ein Artikel ist, und sollen es nicht wissen (A14). Ohne
 * diese Regel ginge ein Kommentar an JEDE Id: an einen Entwurf, den noch
 * niemand gesehen hat, an ein Duell, das am Anwalt hängt, an eine erfundene
 * Zeile. Die Frage beantwortet deshalb der Layer, dem der Beitrag gehört,
 * über den Core-Vertrag `registerContentWriteGuard` — dasselbe Muster wie das
 * geschlossene Discussions-Thema im posts-Layer.
 *
 * ANDERS ALS dort sperrt hier auch ein UNBEKANNTER Beitrag: posts lässt eine
 * fehlende Zeile durch (dort ist der Wächter nur für „geschlossen" zuständig),
 * hier ist „gibt es öffentlich nicht" genau der Fall, gegen den die Regel
 * steht. Die Antwort ist in allen Fällen dieselbe neutrale 404 der Leseseite —
 * ein eigener Grund verriete, dass es einen Entwurf unter dieser Id gibt.
 *
 * Diese Datei kennt den comments-Layer NICHT: der Vertrag ist Core, der
 * `targetType` ein Name dieses Layers. In einer App ohne comments wird der
 * Wächter registriert und nie gefragt.
 */
export default defineNitroPlugin(() => {
  registerContentWriteGuard(INSIGHTS_ARTICLE_COMMENT_TARGET, async (event, target) => {
    // Wirft selbst die neutrale 404, wenn es die Zeile nicht gibt; jede andere
    // Störung (Netz, Rechte) geht als 503 durch — ein Wächter, der bei einer
    // Störung durchwinkt, ist keiner.
    const row = await loadInsightsPostRow(event, target.targetId)
    if (!insightsPostAcceptsComments(toInsightsPost(row), insightsPublicFormats())) {
      throw insightsPublicMissing()
    }
  })
})
