import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsCorrectionTargetKind } from '../../../../shared/insightsCorrection'
import {
  INSIGHTS_CORRECTION_DAY_WINDOW_MS,
  INSIGHTS_CORRECTION_HOUR_WINDOW_MS,
  createInsightsCorrectionSubmitSchema,
  decideInsightsCorrectionQuota,
  insightsCorrectionDayKey,
  insightsCorrectionHourKey,
  insightsCorrectionRetentionAt,
} from '../../../../shared/insightsCorrection'
import { insightsPostIsVisible } from '../../../../shared/insightsPublic'
import type { InsightsBrandRow, InsightsCorrectionRow, InsightsPostRow } from '../../../../shared/insightsRows'
import {
  INSIGHTS_BRANDS_TABLE,
  INSIGHTS_CORRECTIONS_TABLE,
  INSIGHTS_POSTS_TABLE,
  fromInsightsCorrection,
  toInsightsBrand,
  toInsightsPost,
} from '../../../../shared/insightsRows'
import type { InsightsCorrectionSubmitResponse } from '../../../../shared/types/insightsApi'

/**
 * „HIER STIMMT ETWAS NICHT" — der öffentliche Korrektur- und Entfernungsweg
 * (§9.5, Entscheidung 11; Bauart: `discover/[slug]/report.post.ts`).
 *
 * ── SIE IST DIE GEGENSEITE DES GANZEN PRODUKTS ──────────────────────────
 * Wir schreiben über FREMDE Marken. Wer widersprechen will, hat hier kein
 * Konto — also gibt es kein Gate, keinen Code, keine Anmeldung. Genau danach
 * fragt Anwaltsfrage 3 („funktioniert der Korrekturweg?"), und ein Weg, der
 * eine Registrierung kostet, funktioniert nicht.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ──────────────────────────────────────
 *  1. Honigtopf — gefüllt ⇒ dieselbe 200-Antwort, ohne dass etwas entsteht.
 *  2. Stunde UND Tag je Anschluss — VOR jedem Appwrite-Ruf. Ein Deckel, der
 *     erst nach der Arbeit greift, ist keiner. Der Minuten-Eimer
 *     `insights:correction` aus `05.rate-limit.ts` liegt noch davor.
 *  3. Gibt es das Ziel, und steht es ÖFFENTLICH? (Riegel eingeschlossen)
 *  4. Hat derselbe Anschluss dazu schon etwas Offenes geschickt? ⇒ 409.
 *  5. Erst dann schreiben — mit gerechneter Aufbewahrungsfrist.
 *
 * ── WAS NICHT ÖFFENTLICH STEHT, IST EIN 404 ─────────────────────────────
 * Entwurf, gesperrtes Format, unbekannte Adresse: EINE Antwort. Alles andere
 * verriete, dass es diese Seite gibt — und wer sie nicht sehen kann, hat
 * nichts zu beanstanden.
 *
 * EINE ENTFERNTE Marke ist bewusst KEIN gültiges Ziel: sie ist schon weg, und
 * die Zeile wäre Arbeit ohne Gegenstand.
 *
 * ── LOG-REGEL ───────────────────────────────────────────────────────────
 * Nur Codes und Arten — nie die Begründung, nie der Vorschlag, nie die Adresse
 * des Absenders, nie die rohe IP. Kein Double-Opt-in: die Adresse ist
 * freiwillig und dient der Rückfrage, nicht einem Verteiler.
 */
export default defineEventHandler(async (event): Promise<InsightsCorrectionSubmitResponse> => {
  const body = await readValidatedBody(event, createInsightsCorrectionSubmitSchema().parse)

  // (1) Der Honigtopf. Ununterscheidbar vom Erfolg.
  if (body.hp) {
    logEvent('info', 'insights.correction_honeypot', {})
    return { ok: true }
  }

  // (2) Stunde und Tag. BEIDE Eimer werden gezählt, auch wenn der erste schon
  // reicht: ein Tages-Eimer, der nur bei freier Stunde hochzählt, wäre nach
  // einer gesperrten Stunde wieder leer — und damit kein Tages-Eimer.
  const ipHash = insightsIpHash(event)
  const { store, prefix } = useRateLimitStore(event)
  const hour = await store.hit(`${prefix}${insightsCorrectionHourKey(ipHash)}`, INSIGHTS_CORRECTION_HOUR_WINDOW_MS)
  const day = await store.hit(`${prefix}${insightsCorrectionDayKey(ipHash)}`, INSIGHTS_CORRECTION_DAY_WINDOW_MS)
  const code = decideInsightsCorrectionQuota(hour.count, day.count)
  if (code) {
    const resetInMs = code === 'rate_limited_hour' ? hour.resetInMs : day.resetInMs
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(resetInMs / 1000)))
    logEvent('info', 'insights.correction_throttled', { code })
    throw createError({ status: 429, statusText: 'Correction limit reached', data: { code } })
  }

  // (3) Ziel prüfen.
  if (!await targetIsPublic(event, body.targetKind, body.targetId)) {
    throw createError({ status: 404, statusText: 'Not found', data: { code: 'target_not_found' } })
  }

  // (4) Eine Dublette gehört nicht in die Arbeitsliste der Redaktion.
  if (await hasOpenInsightsCorrection(event, body.targetKind, body.targetId, ipHash)) {
    throw createError({ status: 409, statusText: 'Correction already open', data: { code: 'correction_open' } })
  }

  // (5) Schreiben. JEDE Spalte explizit (CLAUDE.md) — und die Frist GERECHNET,
  // nicht geerbt: sie steht als Datum in der Zeile, damit sie dort ablesbar ist
  // und ein späterer Wechsel der Frist nicht rückwirkend verlängert (§9.3).
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    await tablesDB.createRow({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      rowId: ID.unique(),
      data: {
        ...fromInsightsCorrection({
          targetKind: body.targetKind,
          targetId: body.targetId,
          kind: body.kind,
          // Ein Entfernungs-Wunsch schlägt keinen Wert vor, er nennt einen
          // Grund — Feld und Vorschlag fallen dort weg, statt als Leerzeilen
          // in der Arbeitsliste zu stehen.
          field: body.kind === 'removal' ? '' : body.field,
          proposed: body.kind === 'removal' ? '' : body.proposed,
          reason: body.reason,
          contactEmail: body.contactEmail,
          status: 'open',
          decisionNote: '',
        }),
        ipHash,
        decidedAt: null,
        retentionAt: insightsCorrectionRetentionAt(new Date()).toISOString(),
      },
    })
  }
  catch (error) {
    throw insightsStorageError(error, 'createInsightsCorrection')
  }

  logEvent('info', 'insights.correction_received', { targetKind: body.targetKind, kind: body.kind })
  return { ok: true }
})

/**
 * IST DAS ZIEL ÖFFENTLICH SICHTBAR?
 *
 * Gefragt wird mit denselben Regeln wie an den Leseseiten — inklusive Riegel.
 * Ein Vorschlag zu einem Markenprofil, das (noch) nicht live ist, wäre eine
 * Zeile über eine Behauptung, die niemand lesen kann.
 */
async function targetIsPublic(event: H3Event, kind: InsightsCorrectionTargetKind, id: string): Promise<boolean> {
  const allowed = insightsPublicFormats()
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    if (kind === 'post') {
      const row = await tablesDB.getRow<InsightsPostRow>({
        databaseId,
        tableId: INSIGHTS_POSTS_TABLE,
        rowId: id,
      })
      return insightsPostIsVisible(toInsightsPost(row), allowed)
    }
    const row = await tablesDB.getRow<InsightsBrandRow>({
      databaseId,
      tableId: INSIGHTS_BRANDS_TABLE,
      rowId: id,
    })
    // NUR `published`: eine entfernte Marke ist schon weg (s. Kopf).
    return allowed.includes('profile') && toInsightsBrand(row).state === 'published'
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return false
    throw insightsStorageError(error, `targetIsPublic ${kind}`)
  }
}

/**
 * HAT DIESER ANSCHLUSS ZU DIESEM ZIEL SCHON ETWAS OFFENES GESCHICKT?
 *
 * ── DER `ipHash` STEHT NICHT IN DER ABFRAGE, SONDERN IM VERGLEICH ───────
 * `insights_corrections` hat Indizes auf `status` und auf
 * (`targetKind`, `targetId`) — auf `ipHash` NICHT (Migration insights-003).
 * Gefiltert wird deshalb über die Indizes, die es gibt, und der Stempel wird
 * auf den wenigen offenen Zeilen dieses Ziels verglichen. Eine Abfrage über
 * eine Spalte ohne Index wäre ein Scan (und je nach Appwrite-Stand ein
 * Fehler); einen Index nur für diesen Vergleich anzulegen hiesse, eine
 * Migration für eine Prüfung über höchstens ein paar Dutzend Zeilen zu fahren.
 *
 * Sie fragt nach OFFEN und nicht nach „irgendetwas": eine entschiedene
 * Korrektur darf eine neue nicht auf ewig sperren — vielleicht ist der Fehler
 * zurückgekehrt.
 *
 * FAIL-SOFT wäre hier FALSCH: könnte die Frage nicht beantwortet werden und
 * schriebe die Route trotzdem, entstünden bei jedem Klick Dubletten in der
 * Arbeitsliste. Ein Lesefehler wirft deshalb — mit EINER Ausnahme, der
 * fehlenden Tabelle: dort gibt es sicher nichts Offenes.
 */
const OPEN_LOOKUP_LIMIT = 50

async function hasOpenInsightsCorrection(
  event: H3Event,
  targetKind: InsightsCorrectionTargetKind,
  targetId: string,
  ipHash: string,
): Promise<boolean> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsCorrectionRow>({
      databaseId,
      tableId: INSIGHTS_CORRECTIONS_TABLE,
      queries: [
        Query.equal('targetKind', targetKind),
        Query.equal('targetId', targetId),
        Query.equal('status', 'open'),
        Query.limit(OPEN_LOOKUP_LIMIT),
      ],
    })
    return res.rows.some(row => row.ipHash === ipHash)
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return false
    throw insightsStorageError(error, 'hasOpenInsightsCorrection')
  }
}
