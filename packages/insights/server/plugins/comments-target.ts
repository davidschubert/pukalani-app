import { INSIGHTS_COMMENT_TARGET } from '../../shared/insightsComments'
import { toInsightsPost } from '../../shared/insightsRows'
import { insightsPostIsVisible } from '../../shared/insightsPublic'
import { loadInsightsPostRow } from '../utils/insightsPostsAdmin'
import { insightsPublicFormats, insightsPublicMissing } from '../utils/insightsPublic'

/**
 * „DARF UNTER DIESEM BEITRAG KOMMENTIERT WERDEN?" (BI2 K7, 2026-11-09)
 *
 * Der Vertrag gehört core (`registerContentWriteGuard`), die ANTWORT dem
 * Layer, dem der Inhalt gehört — dasselbe Muster wie der `post`-Wächter des
 * posts-Layers. `comments` kennt `insights` nicht und soll es nicht kennen.
 *
 * ── DIE REGEL IST DIE DER SICHTBARKEIT, NICHT EINE ZWEITE ──────────────────
 * Geschrieben werden darf genau dort, wo auch GELESEN werden darf:
 * `insightsPostIsVisible` = freigegebener Zustand UND freigeschaltetes Format.
 * Damit fällt die Begrenzung „nur unter ARTIKELN" ohne eine eigene Zeile vom
 * Himmel: `pukalani.insights.publicFormats` steht auf `['article']`, also sind
 * Markenprofil, Duell und Ranking für Leser 404 — und für Schreiber auch.
 * Legt David den Riegel nach der Anwaltsantwort um, wandert das Kommentieren
 * von selbst mit, und niemand muss sich an eine zweite Liste erinnern.
 *
 * Ein ENTWURF ist damit ebenfalls zu. Das ist der Fall, der ohne Wächter
 * gefährlich wäre: `assertContentWritable` lässt einen NICHT angemeldeten
 * Zieltyp durch (fail-open, mit Begründung im Kopf von `contentWritable.ts`),
 * und der Gast-Weg schreibt über die Operator-Klinke. Ohne diese Datei könnte
 * ein Fremder also an eine unveröffentlichte Redaktionsfassung schreiben,
 * deren Existenz er nur erraten müsste.
 *
 * ── EINE FEHLENDE ZEILE IST HIER EIN NEIN ──────────────────────────────────
 * Der `post`-Wächter erlaubt bei 404 („es gibt nichts zu verbieten"). Hier ist
 * die Antwort umgekehrt: `loadInsightsPostRow` wirft dann selbst sein 404, und
 * das bleibt stehen. Ein Kommentar an einer Beitrags-Id, die es nicht gibt,
 * ist in dieser Redaktion kein Grenzfall, sondern Müll — und weil der
 * Gast-Weg ohne Sitzung schreibt, wäre „erlaubt" eine offene Tür für
 * erratene Ids. Alles andere (Netz, Rechte, Zeitüberschreitung) reicht
 * `loadInsightsPostRow` als 503 durch; ein Wächter, der bei Störung
 * durchwinkt, ist kein Wächter.
 *
 * Nach außen ist beides DASSELBE 404 mit DEMSELBEN Grund
 * (`insightsPublicMissing`, `post_not_found`): ein eigener Grund je Fall
 * verriete, dass der Beitrag existiert und nur nicht heraus darf — genau die
 * Auskunft, die §6 des Plans über eine fremde Marke vermeiden will.
 */
export default defineNitroPlugin(() => {
  registerContentWriteGuard(INSIGHTS_COMMENT_TARGET, async (event, target) => {
    const row = await loadInsightsPostRow(event, target.targetId)
    if (insightsPostIsVisible(toInsightsPost(row), insightsPublicFormats())) return

    throw insightsPublicMissing()
  })
})
