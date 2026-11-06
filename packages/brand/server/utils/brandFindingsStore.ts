import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { ID, Query } from 'node-appwrite'
import {
  type BrandFinding,
  type BrandFindingKind,
  type BrandFindingStatus,
  brandFindingKey,
} from '../../shared/brandFindings'
import type { BrandStepKey } from '../../shared/slotRegistry'
import type { BrandFindingView } from '../../shared/types/brand'
import { brandDb, isAppwriteNotFound, toBrandStepKey } from './brandStore'

/**
 * DIE BEFUND-ZEILEN (`brand_findings`, Migration brand-014) — lesen,
 * schreiben, entscheiden.
 *
 * ── FAIL-SOFT BEIM LESEN, LAUT BEIM ENTSCHEIDEN ───────────────────────────
 * Jeder LESER hier verzeiht eine fehlende Tabelle und jeden Lesefehler und
 * liefert dann eine leere Liste. Das ist keine Bequemlichkeit, sondern die
 * Fortsetzung von §7: Befunde sind eine ZUGABE. Eine Abnahme-Seite, die nicht
 * mehr lädt, weil die Befund-Tabelle klemmt, hätte einen Menschen für ein
 * Feature ausgesperrt, das es vorgestern noch nicht gab — und ein Deploy vor
 * der Migration wäre ein Totalausfall statt einer stillen Rückkehr zum
 * Verhalten von Paket 3.
 *
 * Die ENTSCHEIDUNG (`annehmen`/`ablehnen`) ist das Gegenteil: sie ist eine
 * Handlung des Menschen, und ein verschlucktes „hat nicht geklappt" wäre ein
 * Chip, der nach dem Neuladen wieder dasteht. Sie wirft.
 *
 * ── DEDUP: GLEICHE ART, GLEICHE FELDER, NOCH OFFEN ────────────────────────
 * Ein Schliess-Aufruf läuft je Session, aber dieselbe Session wird korrigiert,
 * neu bestätigt und wieder geschlossen — und der Kapitel-Modus läuft bei jedem
 * Öffnen der Abnahme-Seite. Ohne Deduplizierung stünde derselbe Konflikt nach
 * drei Blicken dreimal da. Der Schlüssel ist `brandFindingKey` (Art + sortierte
 * Feld-Ids, PUR und getestet); der TEXT zählt bewusst nicht mit, weil ein
 * Modell ihn jedes Mal etwas anders formuliert.
 *
 * ERLEDIGTE ZÄHLEN NICHT MIT: wer einen Konflikt mit Grund abgelehnt hat, soll
 * ihn nicht beim nächsten Blick zurückbekommen — aber wer ihn ANGENOMMEN und
 * dann doch nichts geändert hat, bekommt ihn ebenso wenig zurück. Beides ist
 * dieselbe Entscheidung: „darüber ist gesprochen". Nur ein OFFENER Befund
 * blockiert eine zweite Zeile.
 *
 * ── DER ADMIN-CLIENT IST HIER DIE EINZIGE GRENZE ──────────────────────────
 * Wie überall in diesem Silo-Layer: `brand_findings` ist server-only
 * (`permissions: []`), und die Grenze zwischen zwei Konten ist
 * `assertBrandOwnerAccess` in der Route. Jede Funktion hier bekommt deshalb
 * eine `profileId`, die die Route bereits als die des Aufrufers belegt hat —
 * und filtert IMMER darauf, auch wenn sie zusätzlich nach Id sucht.
 */

export const BRAND_FINDINGS_TABLE = 'brand_findings'

/**
 * Wie viele Zeilen ein Leser höchstens holt. 200 ist reichlich: ein
 * vollständiges Fundament hat 68 Sessions, und ein Branding mit mehr als 200
 * Befunden hat ein anderes Problem als eine abgeschnittene Liste. Ein
 * explizites Limit MUSS trotzdem stehen (Repo-Regel: nie das Default-25 erben).
 */
export const BRAND_FINDINGS_LIMIT = 200

export type BrandFindingRow = Models.Row & {
  profileId: string
  stepKey: string
  kind: string
  /** JSON-Array der beteiligten Feld-Ids. */
  slots: string
  why: string
  suggestion?: string
  status?: string
  sourceSession: string
  dismissReason?: string
  resolvedAt?: string | null
  mentionedAt?: string | null
}

function parseSlots(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  }
  catch {
    // Eine unlesbare Zeile darf die Liste nicht kosten — sie steht dann ohne
    // Verweise da und ist damit ein Hinweis statt eines Absturzes.
    return []
  }
}

function toKind(value: string): BrandFindingKind {
  // Der Rückfall bleibt `conflict` und wird BEWUSST nicht zu „unbekannt": eine
  // Zeile mit kaputter Art ist im Zweifel die strengste, nicht die
  // harmloseste — sie steht dann sichtbar da, statt still zu verschwinden.
  return value === 'affected' || value === 'gap' || value === 'market' ? value : 'conflict'
}

function toStatus(value: string | undefined): BrandFindingStatus {
  return value === 'accepted' || value === 'dismissed' ? value : 'open'
}

/** Die Form, die nach draussen geht — fehlende Felder werden '' bzw. `null`. */
export function toBrandFindingView(row: BrandFindingRow): BrandFindingView {
  return {
    id: row.$id,
    kind: toKind(row.kind),
    status: toStatus(row.status),
    slots: parseSlots(row.slots),
    why: row.why,
    suggestion: row.suggestion ?? '',
    // Ein unbekannter Kapitel-Schlüssel (Altbestand) fällt auf `context`
    // zurück — die Zeile bleibt lesbar, und die Kapitel-Sperre rechnet
    // ohnehin über die SLOTS, nicht über diesen Stempel.
    stepKey: toBrandStepKey(row.stepKey) ?? 'context',
    sourceSession: row.sourceSession,
    dismissReason: row.dismissReason ?? '',
    createdAt: row.$createdAt,
    resolvedAt: row.resolvedAt ?? null,
    mentionedAt: row.mentionedAt ?? null,
  }
}

/**
 * Die Befunde EINES Brandings, optional auf einen Status gefiltert. FAIL-SOFT
 * (s. Kopf): jeder Fehler ergibt eine leere Liste plus eine Warnzeile ohne
 * Inhalt (Log-Regel §6).
 */
export async function listBrandFindings(
  event: H3Event,
  profileId: string,
  status?: BrandFindingStatus,
): Promise<BrandFindingRow[]> {
  try {
    const { tablesDB, databaseId } = brandDb(event)
    const res = await tablesDB.listRows<BrandFindingRow>({
      databaseId,
      tableId: BRAND_FINDINGS_TABLE,
      queries: [
        Query.equal('profileId', profileId),
        ...(status ? [Query.equal('status', status)] : []),
        Query.limit(BRAND_FINDINGS_LIMIT),
      ],
    })
    return res.rows
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.findings_read_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return []
  }
}

/** Eine einzelne Zeile — und der Beleg, dass sie zu DIESEM Branding gehört. */
export async function loadBrandFinding(
  event: H3Event,
  profileId: string,
  findingId: string,
): Promise<BrandFindingRow> {
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandFindingRow
  try {
    row = await tablesDB.getRow<BrandFindingRow>({
      databaseId, tableId: BRAND_FINDINGS_TABLE, rowId: findingId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw toH3Error(error, 'Brand finding could not be loaded')
  }
  // Eine FREMDE Zeile antwortet wie eine fehlende (404) — dieselbe Regel wie
  // `loadOwnedProfile`: ein Unterschied wäre die Bestätigung, dass es die Id
  // gibt.
  if (row.profileId !== profileId) throw createError({ status: 404, statusText: 'Not Found' })
  return row
}

/**
 * WO EIN BEFUND HERKOMMT — fest oder je Befund gerechnet (Paket 7).
 *
 * Der Schliess-Aufruf und der Kapitel-Blick haben EINE Quelle: die Session
 * bzw. das Kapitel, in dem sie liefen. Der PRÜFBLICK (§10) hat keine — er
 * läuft über die ganze Foundation, und seine Befunde gehören dorthin, wo ihre
 * Felder wohnen. Deshalb darf der Aufrufer statt eines Wertes eine Rechnung
 * hereingeben; ein Vorgabe-Kapitel für alle wäre ein Stempel, der neun Mal
 * falsch ist.
 */
export type BrandFindingAnchor<T> = T | ((finding: BrandFinding) => T)

function anchor<T>(value: BrandFindingAnchor<T>, finding: BrandFinding): T {
  return typeof value === 'function' ? (value as (f: BrandFinding) => T)(finding) : value
}

export interface BrandFindingWriteRequest {
  profileId: string
  /** Das Kapitel der QUELL-Session — die Kapitel-Sperre der Abnahme. */
  stepKey: BrandFindingAnchor<BrandStepKey>
  /** Die Session, deren Schliess-Aufruf die Befunde erzeugt hat. */
  sourceSession: BrandFindingAnchor<string>
  findings: readonly BrandFinding[]
}

/**
 * DIE NEUEN BEFUNDE SCHREIBEN — dedupliziert gegen die OFFENEN, die es schon
 * gibt (s. Kopf).
 *
 * FAIL-SOFT wie das Lesen: ein Befund, der nicht geschrieben werden kann, ist
 * ein verlorener Hinweis — kein Grund, eine Bestätigung zu verwerfen, die der
 * Mensch längst gegeben hat. Der Rückgabewert sagt, WAS wirklich entstanden
 * ist; die Route legt es der Antwort bei, statt es zu behaupten.
 *
 * KEIN `upsertRow` (CLAUDE.md, D6-Falle) und auch kein „erst suchen, dann
 * schreiben" mit Zeilen-Id: die Id ist `ID.unique()`, weil zwei Befunde
 * derselben Art über dieselben Felder aus VERSCHIEDENEN Sessions stammen
 * dürfen — die Deduplizierung ist eine fachliche Frage über den offenen
 * Bestand, keine über einen Schlüssel.
 */
export async function writeBrandFindings(
  event: H3Event,
  request: BrandFindingWriteRequest,
): Promise<BrandFindingRow[]> {
  if (!request.findings.length) return []

  // Dedupliziert gegen OFFENE und ABGELEHNTE Befunde (2026-09-08, live
  // erwischt beim Kailua-Durchlauf): ein mit Grund abgelehnter Konflikt kam
  // beim nächsten Kapitel-Blick als neue offene Zeile wieder — derselbe Streit
  // über dieselben Felder, und das Kapitel liess sich nie abnehmen. Ein
  // abgelehnter Befund ist eine ENTSCHEIDUNG des Menschen; der Prüfblick darf
  // sie nicht durch Wiederholung überstimmen. Angenommene Befunde bleiben
  // draussen: ihre Korrektur ändert das Feld, und ein NEUER Konflikt danach ist
  // ein echter neuer Hinweis.
  const existing = await listBrandFindings(event, request.profileId)
  const seen = new Set(existing
    .filter(row => toStatus(row.status) !== 'accepted')
    .map(row => brandFindingKey({ kind: toKind(row.kind), slots: parseSlots(row.slots) })))

  const written: BrandFindingRow[] = []
  const { tablesDB, databaseId } = brandDb(event)
  for (const finding of request.findings) {
    const key = brandFindingKey(finding)
    if (seen.has(key)) continue
    seen.add(key)
    const stepKey = anchor(request.stepKey, finding)
    try {
      const row = await tablesDB.createRow<BrandFindingRow>({
        databaseId,
        tableId: BRAND_FINDINGS_TABLE,
        rowId: ID.unique(),
        data: {
          profileId: request.profileId,
          stepKey,
          kind: finding.kind,
          slots: JSON.stringify([...finding.slots]),
          why: finding.why,
          suggestion: finding.suggestion ?? '',
          status: 'open',
          sourceSession: anchor(request.sourceSession, finding),
          dismissReason: '',
          resolvedAt: null,
          mentionedAt: null,
        },
      })
      written.push(row)
    }
    catch (error) {
      logEvent('warn', 'brand.finding_write_failed', {
        stepKey,
        kind: finding.kind,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return written
}

/**
 * ENTSCHIEDEN (§8) — `accepted` oder `dismissed`, mit Zeitstempel. Sie WIRFT
 * (s. Kopf): das ist die Handlung eines Menschen.
 */
export async function decideBrandFinding(
  event: H3Event,
  row: BrandFindingRow,
  status: 'accepted' | 'dismissed',
  dismissReason: string,
): Promise<BrandFindingRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.updateRow<BrandFindingRow>({
      databaseId,
      tableId: BRAND_FINDINGS_TABLE,
      rowId: row.$id,
      data: {
        status,
        dismissReason: status === 'dismissed' ? dismissReason : '',
        resolvedAt: new Date().toISOString(),
      },
    })
  }
  catch (error) {
    throw toH3Error(error, 'Brand finding could not be updated')
  }
}

/**
 * GEORGE HAT IHN AUSGESPROCHEN (§8: „George formuliert ihn EINMAL").
 *
 * FAIL-SOFT und bewusst so: scheitert der Stempel, wiederholt George den
 * Hinweis irgendwann — lästig, aber harmlos. Den ZUG dafür zu verwerfen wäre
 * der teurere Tausch.
 */
export async function markBrandFindingsMentioned(
  event: H3Event,
  findingIds: readonly string[],
): Promise<void> {
  if (!findingIds.length) return
  const { tablesDB, databaseId } = brandDb(event)
  const now = new Date().toISOString()
  for (const rowId of findingIds) {
    try {
      await tablesDB.updateRow({
        databaseId, tableId: BRAND_FINDINGS_TABLE, rowId, data: { mentionedAt: now },
      })
    }
    catch (error) {
      logEvent('warn', 'brand.finding_mention_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * DIE OFFENEN BEFUNDE EINER ART WEGRÄUMEN — der Weg, auf dem ein NEUER
 * Bericht seine Vorgänger ablöst (MV1 M3, additiv für den market-Layer).
 *
 * ── WARUM „ERSETZEN" UND NICHT „DAZULEGEN" ────────────────────────────────
 * Ein Markt-Befund ist die Aussage EINES Berichtsstandes: „euer Satz klingt
 * wie zwei andere im Feld — nach dem Abrufstand von heute". Kommt ein neuer
 * Bericht (weil ein eigenes Feld korrigiert wurde oder eine Website sich
 * geändert hat), ist die alte Aussage nicht falsch geworden, sondern
 * ÜBERHOLT — und zwei Chips am selben Feld, die dasselbe mit verschiedenen
 * Zahlen sagen, sind für den Menschen davor nicht auflösbar. Bei den
 * `conflict`-Befunden stellt sich die Frage nicht: dort greift die
 * Deduplizierung über `brandFindingKey`, weil derselbe Konflikt auch derselbe
 * Schlüssel ist. Ein Markt-Befund an demselben Feld hat denselben Schlüssel,
 * aber einen anderen INHALT — die Deduplizierung liesse also ausgerechnet die
 * NEUE, aktuelle Fassung fallen.
 *
 * ── ENTSCHIEDENE BLEIBEN ──────────────────────────────────────────────────
 * Gelöscht wird nur `status: 'open'`. Ein angenommener oder mit Grund
 * abgelehnter Befund ist eine ENTSCHEIDUNG eines Menschen und damit ein
 * Protokoll — es zu löschen hiesse, die Spur seiner Arbeit zu tilgen, und der
 * nächste Prüfblick fände „nie gesehen" statt „schon entschieden".
 *
 * ── GEFILTERT WIRD IM CODE, NICHT IN DER ABFRAGE ──────────────────────────
 * `brand_findings` hat Indizes auf `(profileId, status)` und
 * `(profileId, stepKey)` — auf `kind` KEINEN, und Appwrite verlangt für jede
 * Filter-Spalte einen. Die Art hier in die Abfrage zu schreiben, hiesse also
 * entweder eine Migration für ein Zusatzprodukt oder einen Lauf, der mit
 * „Index nicht gefunden" endet. Die indizierte Hälfte holt der Server, die
 * andere rechnet er — bei höchstens 200 Zeilen je Branding ist das keine
 * Frage der Kosten.
 *
 * FAIL-SOFT wie das Lesen: ein Bericht, der an einer Aufräum-Zeile scheitert,
 * hätte gerechnet und trotzdem nichts geliefert.
 */
export async function purgeOpenBrandFindingsOfKind(
  event: H3Event,
  profileId: string,
  kind: BrandFindingKind,
): Promise<number> {
  let removed = 0
  try {
    const { tablesDB, databaseId } = brandDb(event)
    const res = await tablesDB.listRows<BrandFindingRow>({
      databaseId,
      tableId: BRAND_FINDINGS_TABLE,
      queries: [
        Query.equal('profileId', profileId),
        Query.equal('status', 'open'),
        Query.limit(BRAND_FINDINGS_LIMIT),
      ],
    })
    for (const row of res.rows.filter(entry => toKind(entry.kind) === kind)) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId: BRAND_FINDINGS_TABLE, rowId: row.$id })
        removed++
      }
      catch (error) {
        if (!isAppwriteNotFound(error)) throw error
      }
    }
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.findings_purge_failed', {
        kind,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return removed
}

/**
 * DIE BEFUNDE EINES KAPITELS WEGRÄUMEN — „Nochmal von vorn" (§5a).
 *
 * ── WARUM SIE MITGEHEN ────────────────────────────────────────────────────
 * Der Restart löscht die Werte des Kapitels, seine Notizen und seine Abnahmen.
 * Ein Befund ist das Ergebnis desselben Schliess-Aufrufs, der die Notizen
 * geschrieben hat — er hinge danach an Feldern, die es nicht mehr gibt, und
 * ein OFFENER Konflikt daran sperrte die Abnahme eines Kapitels, das gerade
 * leer ist. Der Schnappschuss (`step.restarted`) bewahrt den Stand für den
 * Betreiber; für den Kunden heisst „von vorn" auch hier von vorn.
 *
 * GELÖSCHT werden nur Zeilen, deren QUELLE in diesem Kapitel liegt
 * (`stepKey`): ein Konflikt, den Kapitel D gemeldet hat und der zufällig ein
 * Feld aus C nennt, gehört D — dort steht der Wert noch, der ihn ausgelöst hat.
 *
 * FAIL-SOFT: ein Restart, der an einer Aufräum-Zeile scheitert, hätte gelöscht
 * und trotzdem 500 geantwortet — die schlechteste aller Antworten.
 */
export async function purgeBrandStepFindings(
  event: H3Event,
  profileId: string,
  stepKey: BrandStepKey,
): Promise<number> {
  let removed = 0
  try {
    const { tablesDB, databaseId } = brandDb(event)
    const res = await tablesDB.listRows<BrandFindingRow>({
      databaseId,
      tableId: BRAND_FINDINGS_TABLE,
      queries: [
        Query.equal('profileId', profileId),
        Query.equal('stepKey', stepKey),
        Query.limit(BRAND_FINDINGS_LIMIT),
      ],
    })
    for (const row of res.rows) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId: BRAND_FINDINGS_TABLE, rowId: row.$id })
        removed++
      }
      catch (error) {
        if (!isAppwriteNotFound(error)) throw error
      }
    }
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.findings_purge_failed', {
        stepKey,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return removed
}
