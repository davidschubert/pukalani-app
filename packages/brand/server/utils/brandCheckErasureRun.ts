import { Query } from 'node-appwrite'
import { BRAND_CHECK_ERASURE_MODES, type BrandCheckErasureMode } from '../../shared/brandCheckErasureMode'
import {
  BRAND_CHECK_ERASURE_RETENTION_DAYS,
  brandCheckAnonymizedData,
  decideBrandCheckPurge,
} from './brandCheckErasure'
import {
  BRAND_CHECK_CORRECTIONS_TABLE,
  BRAND_CHECKS_TABLE,
  type BrandCheckCorrectionRow,
  type BrandCheckRow,
  isAppwriteNotFound,
} from './brandStore'

/**
 * DER STÜNDLICHE LÖSCH-LAUF DER PRÜFERGEBNISSE (SEC-015, SEC-026) — Schritt
 * (2) aus dem Kopf von `brandCheckErasure.ts`. Die Regel je Zeile ist dort
 * pur (`decideBrandCheckPurge`); hier lebt nur das Blättern und Ausführen.
 *
 * WAS ER TUT, IN ZWEI TEILEN:
 *  A. GELÖSCHTE CHECKS: Zeilen in `brand_checks`, deren `erasedAt` älter als
 *     90 Tage ist (Index `idx_erased`, älteste zuerst). Dokument-Check ⇒
 *     erst die Korrekturvorschläge, die auf ihn zeigen (`checkId`), dann die
 *     Zeile selbst löschen — andersherum hinge die Adresse eines Absenders an
 *     einer Zeile, die keiner mehr findet. Website-Check ⇒ anonymisieren
 *     (`brandCheckAnonymizedData()`): danach ein gewöhnlicher Gast-Check,
 *     wieder sichtbar, ohne Person.
 *  B. ABSENDER-ADRESSEN: Korrekturvorschläge, die vor mehr als 90 Tagen
 *     ANGELEGT wurden und noch `reporterEmail` oder `ipHash` tragen ⇒ beide
 *     auf `''`. Der Vorschlag selbst (Grund, Vorschlag, Status) bleibt als
 *     Beleg des Betreibers stehen.
 *
 * WAS ER NIE TUT:
 *  - eine Zeile OHNE `erasedAt` anfassen — die Abfrage verlangt den Wert, und
 *    `decideBrandCheckPurge` antwortet für eine solche Zeile `'keep'`. Ein
 *    alter Check ist kein gelöschter Check.
 *  - `hidden` ändern: der Beleg des Betreibers überlebt die Anonymisierung
 *    (Begründung im Kopf von `brandCheckErasure.ts`).
 *  - einen Website-Check löschen: die Auskunft über eine öffentliche Adresse
 *    bleibt, nur die Person verschwindet.
 *  - etwas zurückholen. Wiederherstellen innerhalb der 90 Tage heisst:
 *    `erasedAt` an der Zeile in der Appwrite-Konsole leeren. Einen Knopf
 *    dafür gibt es bewusst nicht — die Löschung war der Wunsch der Person,
 *    das Zurückholen ist eine Ausnahme mit Begründung, keine Routine.
 *
 * WIEDERHOLBAR: was gelöscht oder anonymisiert ist, passt in Teil A nicht mehr
 * auf die Abfrage (`erasedAt` ist weg oder die Zeile); in Teil B kostet eine
 * schon geleerte Zeile keinen Schreibvorgang. Der zweite Lauf direkt danach
 * findet nichts zu tun.
 *
 * KOSTEN JE LAUF: an einem gewöhnlichen Tag zwei `listRows` mit leerer Antwort
 * (Teil A über einen Index, Teil B über `$createdAt`). Höchstens 500
 * Änderungen je Teil und Lauf (`truncated`, der nächste Lauf macht weiter);
 * je gelöschtem Dokument-Check eine zusätzliche Abfrage nach seinen
 * Vorschlägen.
 *
 * VORSICHT, WEIL NICHT UMKEHRBAR: Probelauf (`dry-run`) mit genau derselben
 * Auswahl, der nur zählt — dieselben Zähler, keine Schreibvorgänge. EINE
 * Log-Zeile mit Zahlen je Lauf, keine Ids, keine Adressen.
 *
 * VERDRAHTET in `server/plugins/brand-check-erasure.ts` (Takt) und
 * `server/api/brand/admin/check-erasure/run.post.ts` (Handlauf für Betreiber).
 */

/**
 * DIE FRIST FÜR DIE ABSENDER-ADRESSE EINES KORREKTURVORSCHLAGS — dieselben 90
 * Tage wie für gelöschte Checks, gezählt ab dem ANLEGEN der Zeile.
 *
 * Ab dem Anlegen und nicht ab der Entscheidung, weil die Adresse nur für eine
 * Rückfrage da ist und es keinen verlässlichen zweiten Zeitpunkt gibt: ein
 * Vorschlag, den niemand entscheidet, hätte sonst gar keine Frist, und
 * `decidedAt` fehlt allen offenen Zeilen. Wer nach 90 Tagen noch nicht
 * zurückgefragt hat, fragt nicht mehr zurück.
 */
export const BRAND_CHECK_CORRECTION_ADDRESS_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** Seitengröße beim Blättern — explizit, Appwrites Vorgabe ist 25. */
const PAGE_SIZE = 100
/** Höchstens so viele Änderungen je Teil und Lauf (im Probelauf: gezählt). */
const MAX_CHANGES = 500
/**
 * Höchstens so viele Zeilen je Teil betrachten. Nötig für Teil B: eine schon
 * geleerte alte Zeile passt weiter auf die Abfrage (gefiltert wird im Code),
 * der Lauf muss sie also überblättern — begrenzt, damit er endlich bleibt.
 */
const MAX_CONSIDERED = 5000

export interface BrandCheckErasureResult {
  mode: 'dry-run' | 'apply'
  /** Checks über der Frist, die Teil A betrachtet hat. */
  candidates: number
  /** Gelöschte Dokument-Checks (im Probelauf: würden gelöscht). */
  deleted: number
  /** Anonymisierte Website-Checks (im Probelauf: würden anonymisiert). */
  anonymized: number
  /** Korrekturvorschläge, die mit ihrem Dokument-Check gelöscht wurden. */
  correctionsRemoved: number
  /** Korrekturvorschläge, deren Absender-Angaben geleert wurden (Teil B). */
  correctionAddresses: number
  /** Einzelne Schreibvorgänge, die scheiterten — der Lauf machte weiter. */
  failed: number
  /** Ein Deckel griff; der nächste Lauf macht weiter. */
  truncated: boolean
}

/** Einen Schalterwert auflösen — Unbekanntes heisst `off` und wird als ungültig gemeldet. */
export function resolveBrandCheckErasureMode(value: unknown): { mode: BrandCheckErasureMode, invalid: boolean } {
  if (value === undefined || value === null) return { mode: 'off', invalid: false }
  if (typeof value === 'string' && (BRAND_CHECK_ERASURE_MODES as readonly string[]).includes(value)) {
    return { mode: value as BrandCheckErasureMode, invalid: false }
  }
  return { mode: 'off', invalid: true }
}

/** Die Fehlerzeile zu einem ungültigen Wert kommt EINMAL je Prozess, nicht je Aufruf. */
let invalidReported = false

/** Der wirksame Schalter dieser App (`pukalani.brand.checkErasure`). */
export function brandCheckErasureMode(): BrandCheckErasureMode {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { checkErasure?: unknown } } }
  const raw = appConfig.pukalani?.brand?.checkErasure
  const { mode, invalid } = resolveBrandCheckErasureMode(raw)
  if (invalid && !invalidReported) {
    invalidReported = true
    logEvent('error', 'brand.check_erasure_invalid_mode', { value: String(raw) })
  }
  return mode
}

/** `gone` = passt nicht mehr auf die Abfrage, `kept` = steht noch darin, `stop` = Deckel. */
type VisitOutcome = 'gone' | 'kept' | 'stop'

/**
 * Blättert eine nach einer Spalte aufsteigend sortierte Abfrage ab, ohne im
 * Modus `apply` etwas zu überspringen — dieselbe Regel wie `walkPages` im
 * Aufräum-Lauf des Runners: der Cursor zeigt immer auf den LETZTEN Eintrag der
 * Seite, der STEHEN GEBLIEBEN ist (`cursorAfter` verlangt, dass es den
 * Cursor-Eintrag noch gibt). Ein Lesefehler wirft — ein Lauf, der nicht lesen
 * kann, darf nicht wie „nichts zu tun" aussehen.
 */
async function walk<T extends { $id: string }>(
  list: (after: string | null) => Promise<T[]>,
  visit: (row: T) => Promise<VisitOutcome>,
): Promise<{ truncated: boolean }> {
  let cursor: string | null = null
  let considered = 0
  for (;;) {
    const page = await list(cursor)
    if (page.length === 0) return { truncated: false }
    let lastKept: string | null = null
    for (const row of page) {
      if (considered >= MAX_CONSIDERED) return { truncated: true }
      considered++
      const outcome = await visit(row)
      if (outcome === 'stop') return { truncated: true }
      if (outcome === 'kept') lastKept = row.$id
    }
    if (lastKept !== null) cursor = lastKept
    if (page.length < PAGE_SIZE) return { truncated: false }
  }
}

/** Schreiben; ein 404 heisst „schon weg" und gilt als Erfolg. `false` = gescheitert. */
async function attempt(write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write()
    return true
  }
  catch (error) {
    return isAppwriteNotFound(error)
  }
}

/** Reentranz-Sperre (Single-Instanz-Annahme, wie bei den anderen Läufen). */
let running = false

/**
 * EIN LAUF. `null`, wenn gerade einer läuft. Ein Lesefehler wirft (und wird
 * gemeldet); ein einzelner Schreibfehler zählt als `failed`, der Lauf macht
 * weiter.
 *
 * Ohne `H3Event`, wie `brandEventsSweep.ts`: ein Takt bedient keinen Request,
 * der Admin-Client wird ohne Event gebaut.
 */
export async function runBrandCheckErasure(
  mode: 'dry-run' | 'apply',
  opts: { now?: Date } = {},
): Promise<BrandCheckErasureResult | null> {
  if (running) {
    logEvent('warn', 'brand.check_erasure_busy', {})
    return null
  }
  running = true
  try {
    const result = await sweep(mode, opts.now ?? new Date())

    const touched = result.candidates + result.deleted + result.anonymized
      + result.correctionsRemoved + result.correctionAddresses + result.failed
    // Im Probelauf IMMER: genau diese Zahlen soll der Betreiber im Prozess-Log
    // lesen, bevor jemand auf `apply` stellt — auch eine Null ist dann eine
    // Auskunft. Im echten Lauf nur, wenn etwas geschah.
    if (mode === 'dry-run' || touched > 0 || result.truncated) {
      logEvent('info', 'brand.check_erasure', { ...result })
    }
    if (result.failed > 0) {
      logEvent('error', 'brand.check_erasure_incomplete', { failed: result.failed })
    }
    return result
  }
  catch (error) {
    logEvent('error', 'brand.check_erasure_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
  finally {
    running = false
  }
}

async function sweep(mode: 'dry-run' | 'apply', now: Date): Promise<BrandCheckErasureResult> {
  const { tablesDB } = createAdminClient()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const apply = mode === 'apply'
  const result: BrandCheckErasureResult = {
    mode,
    candidates: 0,
    deleted: 0,
    anonymized: 0,
    correctionsRemoved: 0,
    correctionAddresses: 0,
    failed: 0,
    truncated: false,
  }

  // ── Teil A: gelöschte Checks über der Frist ─────────────────────────────
  const erasedCutoff = new Date(now.getTime() - BRAND_CHECK_ERASURE_RETENTION_DAYS * DAY_MS).toISOString()
  const partA = await walk<BrandCheckRow>(
    async after => (await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [
        Query.lessThan('erasedAt', erasedCutoff),
        Query.orderAsc('erasedAt'),
        Query.limit(PAGE_SIZE),
        ...(after ? [Query.cursorAfter(after)] : []),
      ],
    })).rows,
    async (row) => {
      // Die pure Regel bleibt als Netz HINTER der Abfrage stehen: `'keep'`
      // dürfte hier nicht vorkommen und wird nicht gezählt.
      const decision = decideBrandCheckPurge(row, now)
      if (decision === 'keep') return 'kept'
      if (result.candidates >= MAX_CHANGES) return 'stop'
      result.candidates++

      if (decision === 'anonymize') {
        if (!apply) {
          result.anonymized++
          return 'kept'
        }
        const ok = await attempt(() => tablesDB.updateRow<BrandCheckRow>({
          databaseId,
          tableId: BRAND_CHECKS_TABLE,
          rowId: row.$id,
          data: brandCheckAnonymizedData(),
        }))
        if (!ok) {
          result.failed++
          return 'kept'
        }
        result.anonymized++
        return 'gone'
      }

      // 'delete': ERST die Vorschläge, dann der Check.
      const linked = await listAllRows<BrandCheckCorrectionRow>(
        tablesDB,
        databaseId,
        BRAND_CHECK_CORRECTIONS_TABLE,
        [Query.equal('checkId', row.$id)],
      )
      if (!apply) {
        result.correctionsRemoved += linked.length
        result.deleted++
        return 'kept'
      }
      let correctionFailed = false
      for (const entry of linked) {
        const ok = await attempt(() => tablesDB.deleteRow({
          databaseId,
          tableId: BRAND_CHECK_CORRECTIONS_TABLE,
          rowId: entry.$id,
        }))
        if (ok) result.correctionsRemoved++
        else {
          result.failed++
          correctionFailed = true
        }
      }
      // Ein Vorschlag blieb stehen ⇒ der Check auch: der nächste Lauf findet
      // beide wieder und versucht es erneut.
      if (correctionFailed) return 'kept'
      const ok = await attempt(() => tablesDB.deleteRow({ databaseId, tableId: BRAND_CHECKS_TABLE, rowId: row.$id }))
      if (!ok) {
        result.failed++
        return 'kept'
      }
      result.deleted++
      return 'gone'
    },
  )
  if (partA.truncated) result.truncated = true

  // ── Teil B: Absender-Angaben alter Korrekturvorschläge ──────────────────
  // Gelesen über `$createdAt`, die zwei Spalten werden im Code geprüft. Eine
  // geleerte Zeile passt weiter auf die Abfrage — deshalb liefert jeder Besuch
  // `'kept'`, und der Cursor rückt über die ganze Seite vor.
  const addressCutoff = new Date(now.getTime() - BRAND_CHECK_CORRECTION_ADDRESS_RETENTION_DAYS * DAY_MS).toISOString()
  let addressChanges = 0
  const partB = await walk<BrandCheckCorrectionRow>(
    async after => (await tablesDB.listRows<BrandCheckCorrectionRow>({
      databaseId,
      tableId: BRAND_CHECK_CORRECTIONS_TABLE,
      queries: [
        Query.lessThan('$createdAt', addressCutoff),
        Query.orderAsc('$createdAt'),
        Query.limit(PAGE_SIZE),
        ...(after ? [Query.cursorAfter(after)] : []),
      ],
    })).rows,
    async (row) => {
      if (!row.reporterEmail && !row.ipHash) return 'kept'
      if (addressChanges >= MAX_CHANGES) return 'stop'
      addressChanges++
      if (!apply) {
        result.correctionAddresses++
        return 'kept'
      }
      const ok = await attempt(() => tablesDB.updateRow<BrandCheckCorrectionRow>({
        databaseId,
        tableId: BRAND_CHECK_CORRECTIONS_TABLE,
        rowId: row.$id,
        data: { reporterEmail: '', ipHash: '' },
      }))
      if (ok) result.correctionAddresses++
      else result.failed++
      return 'kept'
    },
  )
  if (partB.truncated) result.truncated = true

  return result
}
