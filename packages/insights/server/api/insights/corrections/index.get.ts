import { z } from 'zod'
import type { InsightsCorrectionStatus } from '../../../../shared/insightsCorrection'
import { INSIGHTS_CORRECTION_STATUSES } from '../../../../shared/insightsCorrection'
import { toInsightsCorrectionListItem, toInsightsPost } from '../../../../shared/insightsRows'
import type { InsightsCorrectionsListResponse } from '../../../../shared/types/insightsApi'

/**
 * DIE ARBEITSLISTE DER KORREKTURVORSCHLÄGE (`insights.manage`, §9.3/§9.4).
 *
 * ── DIE KONTAKT-ADRESSE VERLÄSST DEN SERVER NICHT ────────────────────────
 * Nur `hasContact`. Begründung am Typ `InsightsCorrectionListItem`; die
 * Auslassung passiert im MAPPER und nicht hier, damit ein Vitest sie zeigen
 * kann.
 *
 * ── DAS ZIEL BEKOMMT EINEN NAMEN, IN ZWEI ABFRAGEN ───────────────────────
 * Ein Vorschlag zeigt auf eine Zeilen-Id. „brand-68f1…" ist für die Redaktion
 * keine Auskunft — sie muss wissen, WORÜBER jemand schreibt, bevor sie
 * entscheidet. Aufgelöst wird GEBÜNDELT (eine Liste je Tabelle, beide
 * ohnehin auf 200 gedeckelt) statt je Zeile: eine Liste mit fünfzig Zeilen
 * darf nicht fünfzig Fragen stellen. Findet sich die Id nicht, bleibt das
 * Feld leer und die Seite zeigt die Id — ein gelöschter Beitrag ist eine
 * Auskunft, kein Fehler.
 *
 * ── DER FILTER SIEBT, DIE ZÄHLER ZÄHLEN ALLES ────────────────────────────
 * Sonst stünde „0 offen" in der Kopfzeile, sobald man die abgelehnten
 * anschaut. Beides aus EINER Abfrage (s. `listInsightsCorrectionRows`), damit
 * Zahlen und Zeilen garantiert aus demselben Stand kommen.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT
 * `insights.manage` — dieselbe Rechnung wie bei der Redaktionsliste.
 */
const querySchema = z.object({
  // Fehlend UND leer heissen beide „alle": eine Query-Zeichenkette kommt oft
  // als `?status=` an (eine Oberfläche, die ihren Filter zurücksetzt), und ein
  // 400 dafür wäre ein Fehler für eine Ansicht, die es gibt.
  status: z.union([z.enum(INSIGHTS_CORRECTION_STATUSES), z.literal('')]).optional(),
})

export default defineEventHandler(async (event): Promise<InsightsCorrectionsListResponse> => {
  requirePermission(event, 'insights.manage')

  const query = await getValidatedQuery(event, querySchema.parse)
  const rows = await listInsightsCorrectionRows(event, INSIGHTS_CORRECTIONS_LIMIT)

  // ERST abbilden, DANN fragen: `targetKind` ist in der Spalte ein varchar
  // und wird im Mapper auf die zwei bekannten Werte gezogen (fail-soft). Wer
  // die rohe Spalte für die Zuordnung nähme, suchte für eine kaputte Zeile in
  // der falschen Tabelle.
  const items = rows.map(row => toInsightsCorrectionListItem(row))

  // Die Zähler stehen VOR dem Filter — sie sind eine Aussage über die Liste,
  // nicht über die Ansicht.
  const counts = Object.fromEntries(
    INSIGHTS_CORRECTION_STATUSES.map(status => [status, 0]),
  ) as Record<InsightsCorrectionStatus, number>
  for (const item of items) counts[item.status] += 1

  const labels = new Map<string, string>()
  if (items.some(item => item.targetKind === 'brand')) {
    for (const brandRow of await listInsightsBrandRows(event, INSIGHTS_BRANDS_LIMIT)) {
      labels.set(`brand:${brandRow.$id}`, brandRow.name)
    }
  }
  if (items.some(item => item.targetKind === 'post')) {
    for (const postRow of await listInsightsPostRows(event, INSIGHTS_POSTS_LIMIT)) {
      const post = toInsightsPost(postRow)
      // Der Titel der GRUNDFASSUNG — sie ist die redigierte und damit die, die
      // es sicher gibt (die zweite Fassung kann leer sein).
      labels.set(`post:${postRow.$id}`, (post.baseLocale === 'de' ? post.titleDe : post.titleEn) || post.slug)
    }
  }

  return {
    items: items
      .map(item => ({ ...item, targetLabel: labels.get(`${item.targetKind}:${item.targetId}`) ?? '' }))
      .filter(item => !query.status || item.status === query.status),
    counts,
  }
})
