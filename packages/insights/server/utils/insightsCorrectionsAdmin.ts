import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import type { InsightsCorrectionRow } from '../../shared/insightsRows'
import { INSIGHTS_CORRECTIONS_TABLE } from '../../shared/insightsRows'

/**
 * DER ABLAGE-ZUGRIFF AUF DIE KORREKTURVORSCHLÄGE (BI1 I2-Rest, §9.3/§9.4).
 *
 * ── WARUM EINE EIGENE DATEI NEBEN `insightsPostsAdmin.ts` ────────────────
 * Dieselbe Trennung, die schon im Vertrag gilt (`insightsCorrection.ts` neben
 * `insightsPost.ts`): ein Korrekturvorschlag kommt von DRAUSSEN und trägt als
 * einziges Datum dieses Layers einen Personenbezug. Wer wissen will, wo diese
 * Zeilen gelesen und geschrieben werden, soll dafür EINE Datei aufschlagen
 * und nicht dreihundert Zeilen Redaktions-Ablage mitlesen müssen.
 *
 * ── DER SWEEP LIEGT WEITER NEBENAN ───────────────────────────────────────
 * `insightsCorrectionsSweep.ts` räumt dieselbe Tabelle, hat aber einen
 * anderen Auslöser (ein Intervall statt eines Requests) und ein anderes
 * Interesse (zwei Felder leeren, nichts lesen). Zusammenzulegen hiesse, einem
 * eventlosen Sweep die Request-Helfer dieser Datei in die Hand zu geben.
 *
 * ── FEHLER VERLASSEN DIESE DATEI OHNE APPWRITE-DETAILS ───────────────────
 * `insightsStorageError` (aus `insightsPostsAdmin.ts`, per Auto-Import) macht
 * daraus ein 503 mit einem Satz. Ein durchgereichter `AppwriteException`
 * verriete Tabellennamen und Spalten.
 */

/** „Diesen Vorschlag gibt es nicht." — 404 mit eigenem Grund. */
export function insightsCorrectionMissing() {
  return createError({
    status: 404,
    statusText: 'Correction not found',
    data: { code: 'correction_not_found' },
  })
}

/**
 * ALLE VORSCHLÄGE, NEUESTE ZUERST — UNGEFILTERT.
 *
 * ── WARUM DIE ROUTE FILTERT UND NICHT DIESE ABFRAGE ──────────────────────
 * Weil die ZÄHLER über alle Zustände gehen müssen (sonst stünde „0 offen"
 * neben der Ansicht der abgelehnten). Zwei Abfragen — eine gefilterte Liste
 * plus drei Zählungen — wären vier Rundreisen für eine Liste, die ohnehin auf
 * `INSIGHTS_CORRECTIONS_LIMIT` (200) gedeckelt ist. Bei diesem Deckel ist
 * „alles holen, im Speicher filtern und zählen" die billigere UND die
 * ehrlichere Rechnung: die Zähler stammen dann garantiert aus demselben
 * Stand wie die Zeilen.
 *
 * Ab dem Tag, an dem 200 nicht mehr reichen, gehört hier ein Cursor hin —
 * dann aber MIT eigenen Zähl-Abfragen, wie in `brand_check_corrections`.
 */
export async function listInsightsCorrectionRows(event: H3Event, limit: number): Promise<InsightsCorrectionRow[]> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsCorrectionRow>({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      queries: [Query.orderDesc('$createdAt'), Query.limit(limit)],
    })
    return res.rows
  }
  catch (error) {
    throw insightsStorageError(error, 'listInsightsCorrectionRows')
  }
}

export async function loadInsightsCorrectionRow(event: H3Event, id: string): Promise<InsightsCorrectionRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.getRow<InsightsCorrectionRow>({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsCorrectionMissing()
    throw insightsStorageError(error, `loadInsightsCorrectionRow ${id}`)
  }
}

/**
 * DIE ENTSCHEIDUNG SCHREIBEN — und NUR sie.
 *
 * Bewusst KEIN `fromInsightsCorrection`: das schriebe die ganze Zeile zurück,
 * also auch `contactEmail`, `field`, `proposed` und `reason` — Felder, die
 * ein Mensch von draussen eingereicht hat und die der Betreiber nicht ändert.
 * Ein Vollschreiben würde ausserdem eine Zeile, die der Retention-Sweep
 * zwischenzeitlich geleert hat, aus einem alten Stand wieder auffüllen: die
 * gelöschte Adresse stünde danach wieder da. Drei Felder, mehr nicht.
 */
export async function saveInsightsCorrectionDecision(
  event: H3Event,
  id: string,
  decision: { status: 'accepted' | 'declined', decisionNote: string, decidedAt: string },
): Promise<InsightsCorrectionRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    return await tablesDB.updateRow<InsightsCorrectionRow>({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      rowId: id,
      data: {
        status: decision.status,
        decisionNote: decision.decisionNote,
        decidedAt: decision.decidedAt,
      },
    })
  }
  catch (error) {
    if (isInsightsRowMissing(error)) throw insightsCorrectionMissing()
    throw insightsStorageError(error, `saveInsightsCorrectionDecision ${id}`)
  }
}
