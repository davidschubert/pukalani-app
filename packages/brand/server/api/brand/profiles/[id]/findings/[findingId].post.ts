import type { H3Event } from 'h3'
import { createBrandFindingDecisionSchema } from '../../../../../../schemas/brandReview'
import { BRAND_FINDING_REASON_MAX } from '../../../../../../shared/brandFindings'
import { slotById } from '../../../../../../shared/slotRegistry'
import type { BrandFindingDecisionResponse } from '../../../../../../shared/types/brand'
import {
  decideBrandFinding,
  loadBrandFinding,
  toBrandFindingView,
} from '../../../../../utils/brandFindingsStore'
import {
  BRAND_STEPS_TABLE,
  type BrandSlotRecord,
  brandDb,
  loadOwnedProfile,
  loadStepRow,
  parseSlotRecords,
  requireProfileIdParam,
  serializeSlotRecords,
  toBrandStepKey,
} from '../../../../../utils/brandStore'

/**
 * EINEN BEFUND ENTSCHEIDEN (BW2 Paket 4, Plan §8) — annehmen oder ablehnen.
 *
 * ── ZWEI AUSGÄNGE, ZWEI BEDEUTUNGEN ──────────────────────────────────────
 * `accepted` heisst „stimmt, da muss ich ran" — und zieht die Korrektur eines
 * der beiden Felder nach sich (§9, Paket 6). Der Befund ist damit erledigt,
 * ohne dass hier ein Wert angefasst würde: die Korrektur ist eine eigene
 * Handlung mit eigenem Impact-Hinweis, und sie hier mitzuerledigen hiesse,
 * einen bestätigten Wert ohne Ansage zu öffnen.
 *
 * `dismissed` heisst „ich habe entschieden, dass es passt". Es VERLANGT einen
 * Grund (Schema, ≥ 3 Zeichen), und dieser Grund landet als NOTIZ an der
 * Quell-Session — das ist der ganze Punkt: eine Ablehnung ohne Spur wäre für
 * den nächsten Blick (Prüfblick §10, oder ein Mensch in vier Wochen) nicht von
 * „nie gesehen" zu unterscheiden, und derselbe Befund käme wieder.
 *
 * ── BEIDE ÖFFNEN DIE ABNAHME ─────────────────────────────────────────────
 * Ein OFFENER `conflict` sperrt die Finale Abnahme (§5a Schritt 3); jede der
 * zwei Entscheidungen beendet das. Genau so ist es gemeint: „wer weiterzieht,
 * hat seinen Konflikt entschieden" — nicht „hat ihn behoben".
 *
 * ── DIE NOTIZ IST FAIL-SOFT, DIE ENTSCHEIDUNG NICHT ──────────────────────
 * Scheitert das Schreiben der Notiz, ist der Befund trotzdem entschieden — der
 * Mensch hat geklickt, und ein Chip, der nach dem Neuladen wieder dasteht,
 * wäre die schlechtere Auskunft als eine fehlende Randnotiz. Scheitert die
 * ENTSCHEIDUNG, wirft die Route (s. `decideBrandFinding`).
 */
export default defineEventHandler(async (event): Promise<BrandFindingDecisionResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const findingId = getRouterParam(event, 'findingId')
  if (!findingId || findingId.length > 64) throw createError({ status: 404, statusText: 'Not Found' })

  const body = await readValidatedBody(event, createBrandFindingDecisionSchema().parse)
  const row = await loadBrandFinding(event, profile.$id, findingId)

  if (row.status === 'accepted' || row.status === 'dismissed') {
    // Schon entschieden — ein zweiter Klick ist kein Fehler des Menschen,
    // sondern ein veralteter Bildschirm (dieselbe Familie wie
    // `revision_conflict`).
    throw createError({
      status: 409,
      statusText: 'Finding is already decided',
      data: { code: 'already_decided' },
    })
  }

  const reason = (body.dismissReason ?? '').slice(0, BRAND_FINDING_REASON_MAX)
  const decided = await decideBrandFinding(event, row, body.status, reason)

  const revision = body.status === 'dismissed' && reason
    ? await appendDismissNote(event, profile.$id, row.sourceSession, reason)
    : null

  const view = toBrandFindingView(decided)

  /**
   * DAS EREIGNIS TRÄGT DEN NAMEN SEINER ART (MV1 M3, Plan §2.10:
   * `market.finding_accepted/dismissed`).
   *
   * Ein Befund weiss selbst, aus welchem Produkt er stammt (`kind`) — der
   * Marktvergleich braucht deshalb keine zweite Entscheidungs-Route, nur diese
   * eine Zeile. Gezählt werden ART und KAPITEL, nie ein Text: `why`,
   * `suggestion` und der Ablehnungsgrund sind Kundeninhalt (Log-Regel).
   */
  logEvent('info', view.kind === 'market' ? `market.finding_${body.status}` : `brand.finding_${body.status}`, {
    kind: view.kind,
    stepKey: view.stepKey,
  })

  return { finding: view, revision: revision ?? 0 }
})

/**
 * DEN GRUND ALS NOTIZ AN DIE QUELL-SESSION HÄNGEN (§8, „mit Grund, eine Zeile,
 * landet in den Notizen").
 *
 * Er wird ANGEHÄNGT und ersetzt nichts: die Notizen des Schliess-Aufrufs sind
 * das Gedächtnis der Session, und eine Ablehnung ist eine EIGENE Erkenntnis
 * daneben („wir wissen, dass sich das reibt, und es ist Absicht"). Der Deckel
 * der JSON-Spalte greift beim Serialisieren (`serializeSlotRecords`, 413).
 *
 * Gibt die neue `revision` der Kapitel-Zeile zurück — die Abnahme-Seite führt
 * ihre eigene und muss sie übernehmen, sonst läuft ihr nächstes „Abnehmen" in
 * einen 409.
 */
async function appendDismissNote(
  event: H3Event,
  profileId: string,
  sourceSession: string,
  reason: string,
): Promise<number | null> {
  const stepKey = toBrandStepKey(slotById(sourceSession)?.stepId)
  if (!stepKey) return null

  try {
    const row = await loadStepRow(event, profileId, stepKey)
    if (!row) return null

    const records = parseSlotRecords(row.slots)
    const before = records[sourceSession]
    const existing = (before?.notes ?? '').trim()
    const next: BrandSlotRecord = {
      ...before,
      notes: existing ? `${existing}\n${reason}` : reason,
      updatedAt: new Date().toISOString(),
    }

    const revision = (row.revision ?? 0) + 1
    const { tablesDB, databaseId } = brandDb(event)
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      rowId: row.$id,
      data: {
        slots: serializeSlotRecords({ ...records, [sourceSession]: next }),
        revision,
      },
    })
    return revision
  }
  catch (error) {
    // Fail-soft (s. Kopf): der Befund ist entschieden, die Randnotiz fehlt.
    logEvent('warn', 'brand.finding_note_failed', {
      stepKey,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
