import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { brandCheckDocumentUrlKey } from '../../shared/brandCheck'
import { BRAND_CHECKS_TABLE, type BrandCheckRow, brandDb, isAppwriteNotFound } from './brandStore'

/**
 * DAS LÖSCHEN EINES KONTOS ODER EINER MARKE ERREICHT DIE PRÜFERGEBNISSE
 * (SEC-015, Migration brand-026).
 *
 * Davids Entscheidung (2026-11-12 und 2026-11-15): nach dem Löschen eines
 * Kontos oder einer Marke sind deren Checks SOFORT für alle unsichtbar und
 * werden nach 90 Tagen von einem geplanten Lauf endgültig abgeräumt. Bis dahin
 * kann nur der Betreiber sie von Hand zurückholen (`erasedAt` in der Konsole
 * leeren — einen Knopf dafür gibt es bewusst nicht). Nach den 90 Tagen werden
 * private Ergebnisse (Dokument-Checks) gelöscht; Ergebnisse über öffentliche
 * Websites bleiben, OHNE jeden Bezug zur Person.
 *
 * ── ZWEI SCHRITTE, ZWEI ZEITPUNKTE ────────────────────────────────────────
 * (1) `markBrandChecksErased` läuft IM Löschvorgang (GDPR-Contributor und
 *     Löschroute einer Marke) und setzt nur den Zeitpunkt. Ab da antwortet
 *     jeder Leser so, als gäbe es die Zeile nicht (`brandCheckRankingFacts`
 *     liefert `erased`, die Leser fragen es ab).
 * (2) Der STÜNDLICHE LAUF — `brandCheckErasureRun.ts`, Takt in
 *     `server/plugins/brand-check-erasure.ts`, Schalter
 *     `pukalani.brand.checkErasure` — liest die Zeilen mit `erasedAt` älter
 *     als die Frist (Index `idx_erased`), fragt für jede
 *     `decideBrandCheckPurge` und führt aus: `'delete'` ⇒ erst die
 *     Korrekturvorschläge des Checks, dann `deleteRow`; `'anonymize'` ⇒
 *     `updateRow` mit `brandCheckAnonymizedData()`; `'keep'` ⇒ nichts. Die
 *     Regel steht hier und pur, damit der Lauf nur noch Zeilen holen und
 *     Antworten ausführen muss.
 *
 * ── WARUM NICHT SOFORT LÖSCHEN ────────────────────────────────────────────
 * Ein Konto ist schnell gelöscht und nicht wiederherstellbar; ein Check über
 * eine öffentliche Website ist zugleich die Auskunft für jeden anderen, der
 * dieselbe Adresse prüft. Die Frist gibt dem Betreiber Zeit für einen Irrtum,
 * die Unsichtbarkeit nimmt der Person sofort, was sie gelöscht haben wollte.
 *
 * ── WARUM `hidden` UNBERÜHRT BLEIBT ───────────────────────────────────────
 * `hidden` ist der Beleg des BETREIBERS (brand-017). Er überlebt die
 * Anonymisierung: eine ausgeblendete Website-Zeile bleibt ausgeblendet, nur
 * ohne Person. Ein Dokument-Check wird nach der Frist dagegen auch dann
 * gelöscht, wenn er ausgeblendet ist — er urteilt über eine nicht
 * veröffentlichte Marke und zitiert sie wörtlich, und die Marke gibt es nicht
 * mehr. Die Entscheidung der Person wiegt dort schwerer als der Beleg.
 */

export const BRAND_CHECK_ERASURE_RETENTION_DAYS = 90

const RETENTION_MS = BRAND_CHECK_ERASURE_RETENTION_DAYS * 24 * 60 * 60 * 1000

export type BrandCheckPurgeDecision = 'keep' | 'delete' | 'anonymize'

/**
 * WAS DER STÜNDLICHE LAUF MIT EINER ZEILE TUT — pur, als Tabelle getestet.
 *
 * Ein unlesbarer Zeitpunkt heisst `'keep'`: im Zweifel bleibt die Zeile
 * unsichtbar stehen, statt auf einen Verdacht hin gelöscht zu werden — der
 * Betreiber sieht sie in seiner Liste mit dem Wert, wie er dasteht.
 */
export function decideBrandCheckPurge(
  row: Pick<BrandCheckRow, 'erasedAt' | 'source'>,
  now: Date,
): BrandCheckPurgeDecision {
  if (!row.erasedAt) return 'keep'
  const erasedAt = Date.parse(row.erasedAt)
  if (Number.isNaN(erasedAt)) return 'keep'
  if (now.getTime() - erasedAt < RETENTION_MS) return 'keep'
  return row.source === 'document' ? 'delete' : 'anonymize'
}

/**
 * DIE ANONYMISIERUNG EINES WEBSITE-CHECKS — danach ist die Zeile wieder ein
 * gewöhnlicher Gast-Check: kein Konto, keine Marke, kein Tages-Stempel, keine
 * Zustimmung zum Ranking (die gab die Person, und die Person ist weg).
 * `erasedAt: null` macht ihn wieder sichtbar — als Auskunft über eine
 * öffentliche Website, nicht mehr über jemanden. `hidden` fehlt mit Absicht
 * (s. Kopf).
 */
export function brandCheckAnonymizedData(): {
  userId: ''
  profileId: ''
  ipHash: ''
  rankingOptIn: false
  erasedAt: null
} {
  return { userId: '', profileId: '', ipHash: '', rankingOptIn: false, erasedAt: null }
}

/**
 * DIE CHECKS EINES KONTOS UND/ODER EINER MARKE — auf den drei Wegen, die im
 * Kopf von `markBrandChecksErased` stehen. Streng wie dort: nur eine fehlende
 * Tabelle ist leer, jeder andere Lesefehler wirft.
 */
async function listTargetChecks(
  event: H3Event,
  target: { userId?: string, profileId?: string },
): Promise<Map<string, BrandCheckRow>> {
  const filters: string[][] = []
  if (target.userId) filters.push([Query.equal('userId', target.userId)])
  if (target.profileId) {
    filters.push([Query.equal('profileId', target.profileId)])
    filters.push([Query.equal('urlKey', brandCheckDocumentUrlKey(target.profileId))])
  }
  const rows = new Map<string, BrandCheckRow>()
  if (!filters.length) return rows

  const { tablesDB, databaseId } = brandDb(event)
  for (const filter of filters) {
    for (const row of await listAllRowsIfTableExists<BrandCheckRow>(tablesDB, databaseId, BRAND_CHECKS_TABLE, filter)) {
      rows.set(row.$id, row)
    }
  }
  return rows
}

/**
 * MARKIERT DIE CHECKS EINES KONTOS UND/ODER EINER MARKE ALS GELÖSCHT —
 * Rückgabe: wie viele Zeilen jetzt NEU markiert wurden.
 *
 * Gefunden wird auf drei Wegen, weil ein Check auf drei Wegen zu jemandem
 * gehört: `userId` (wer ihn ausgelöst hat — auch die Website-Checks fremder
 * Auftritte aus dem Marktvergleich), `profileId` (die Marke, der er
 * zugeordnet ist) und der Dokument-Schlüssel `doc:<profileId>` (ein
 * Dokument-Check, auch falls seine `profileId`-Spalte leer ist).
 *
 * EINE LEERE KENNUNG TRIFFT NICHTS: `userId: ''` ist der Normalfall jedes
 * Gast-Checks — ein Filter darauf markierte alle fremden Ergebnisse.
 *
 * Ein schon gesetzter Zeitpunkt wird NIE verschoben: die 90 Tage beginnen beim
 * ERSTEN Löschen, ein zweiter Lauf findet nichts mehr zu tun (idempotent).
 *
 * STRENG: Lesen über `listAllRowsIfTableExists` — leer NUR bei fehlender
 * Tabelle, jeder andere Lesefehler wirft. Ein Schreibfehler wirft ebenfalls.
 * Ein Löschvorgang, der hier scheitert, muss abbrechen: sonst blieben die
 * Ergebnisse sichtbar, während die Löschung Erfolg meldet.
 */
export async function markBrandChecksErased(
  event: H3Event,
  target: { userId?: string, profileId?: string },
  now: Date = new Date(),
): Promise<number> {
  const rows = await listTargetChecks(event, target)
  if (!rows.size) return 0
  const { tablesDB, databaseId } = brandDb(event)

  const erasedAt = now.toISOString()
  let marked = 0
  for (const row of rows.values()) {
    if (row.erasedAt) continue
    try {
      await tablesDB.updateRow({ databaseId, tableId: BRAND_CHECKS_TABLE, rowId: row.$id, data: { erasedAt } })
      marked++
    }
    catch (error) {
      // Zwischen Lesen und Schreiben verschwunden ⇒ nichts mehr zu verbergen.
      if (!isAppwriteNotFound(error)) throw error
    }
  }
  return marked
}

/**
 * DIE CHECKS EINER ZURÜCKGEHOLTEN MARKE WIEDER ZEIGEN (WH1) — Rückgabe: wie
 * viele Zeilen wieder sichtbar sind.
 *
 * NUR DIE, DIE DIESES LÖSCHEN VERSTECKT HAT: `erasedAt` des Checks gleich
 * dem Zeitpunkt der Marke (`brand_profiles.erasedAt`; das Löschen schreibt
 * beide mit DERSELBEN Uhrzeit, `trashBrandProfile`). Ein Check, den ein
 * anderes Löschen früher versteckt hat, bleibt versteckt — dessen Frist läuft
 * weiter. Verglichen wird der Zeitpunkt, nicht der Text: Appwrite schreibt
 * `+00:00`, wo wir `Z` geschickt haben.
 *
 * Die Frist prüft der Aufrufer VORHER (`brandProfileTrashState`): nach 90
 * Tagen hat der Lauf der Prüfergebnisse Website-Checks schon anonymisiert,
 * und ein anonymisierter Check trägt keine Marke mehr, die ihn zurückholen
 * könnte.
 *
 * STRENG wie das Markieren: ein Lese- oder Schreibfehler wirft, die Marke
 * bleibt dann im Papierkorb, und ein zweiter Versuch ist gefahrlos.
 */
export async function unmarkBrandChecksErased(
  event: H3Event,
  profileId: string,
  erasedAt: string,
): Promise<number> {
  const at = Date.parse(erasedAt)
  if (!profileId || !Number.isFinite(at)) return 0
  const rows = await listTargetChecks(event, { profileId })
  const { tablesDB, databaseId } = brandDb(event)
  let restored = 0
  for (const row of rows.values()) {
    if (!row.erasedAt || Date.parse(row.erasedAt) !== at) continue
    try {
      await tablesDB.updateRow({ databaseId, tableId: BRAND_CHECKS_TABLE, rowId: row.$id, data: { erasedAt: null } })
      restored++
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) throw error
    }
  }
  return restored
}
