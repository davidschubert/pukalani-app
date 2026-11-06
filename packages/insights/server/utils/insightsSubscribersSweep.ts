import { Query } from 'node-appwrite'
import type { InsightsSubscriberRow } from '../../shared/insightsRows'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../../shared/insightsRows'
import {
  insightsNewsletterAnonymizedEmail,
  insightsNewsletterPendingPurgeDue,
  insightsNewsletterPiiSweepDue,
} from '../../shared/insightsNewsletter'

/**
 * DER FRISTEN-SWEEP DER NEWSLETTER-LISTE (BI1 I5a; Muster:
 * `insightsCorrectionsSweep.ts`, und davor `brandEventsSweep.ts`).
 *
 * ── ZWEI REGELN, WEIL ES ZWEI VERSCHIEDENE ZEILEN SIND ──────────────────
 *
 * 1. UNBESTÄTIGT und die Token-Frist liegt mehr als 30 Tage zurück ⇒ die GANZE
 *    ZEILE WIRD GELÖSCHT. Für diese Adresse gab es NIE eine Einwilligung, es
 *    gibt also nichts aufzubewahren. Das ist der bewusste Unterschied zu
 *    `insights_corrections`, wo die Zeile der NACHWEIS eines Vorgangs ist und
 *    deshalb bleibt: hier ist sie der Rest eines Vorgangs, der nie zustande
 *    kam. (Die Warteliste im brand-Layer lässt solche Zeilen liegen und sagt
 *    das in brand-015 auch so — dort sind es eine Handvoll in einer Liste, die
 *    ein Mensch liest. Ein Newsletter-Formular auf JEDER Artikel-Seite
 *    sammelt dagegen stetig unbestätigte Adressen, und eine Adresse ohne
 *    Einwilligung aufzubewahren braucht einen Grund, den es nicht gibt.)
 *
 * 2. ABGEMELDET und `retentionAt` erreicht ⇒ `email`, `emailLower` und
 *    `ipHash` werden GELEERT, die Zeile bleibt als Nachweis „hat eingewilligt
 *    und sich abgemeldet". Frist: EINE Konstante
 *    (`INSIGHTS_NEWSLETTER_PII_RETENTION_DAYS`), wie bei den Korrekturen.
 *
 * BESTÄTIGTE, AKTIVE ZEILEN FASST DER SWEEP NIE AN. Sie sind der Zweck der
 * Liste; ein Sweep, der sie altern lässt, wäre eine Abmeldung, die niemand
 * erklärt hat.
 *
 * ── `retentionAt` GEHT BEIM LEEREN MIT (die Lehre aus I1) ───────────────
 * Es wird auf `null` gesetzt — nicht aus Ordnungsliebe, sondern weil der
 * Lesepfad `retentionAt <= now` sonst JEDE schon geleerte Zeile bei jedem Lauf
 * erneut liefert. Mit `SWEEP_BATCH` = 200 und `orderAsc(retentionAt)` hiesse
 * das: sobald 200 geleerte Zeilen existieren, füllen sie den Stapel allein,
 * und jede NEU fällige Zeile dahinter würde nie mehr erreicht. Genau dieser
 * Fehler steht in OPEN-ITEMS-COMPLETE unter „BI1 I1". Die pure Regel
 * (`insightsNewsletterPiiSweepDue`) bleibt als zweites Netz, aber sie sieht
 * nur, was die Abfrage ihr zeigt. Dieselbe Nullung macht der
 * GDPR-Contributor.
 *
 * ── DIE ERSTE REGEL FRAGT ÜBER `confirmedAt`, NICHT ÜBER EIN DATUM ──────
 * Es gibt keinen Index über `tokenExpiresAt` (die Spalte ist varchar und wird
 * geleert, s. Migrationskopf), wohl aber `idx_confirmed_at`. Gefragt wird
 * deshalb „wer hat nicht bestätigt?" (`confirmedAt` = '') und ÄLTESTE ZUERST
 * (`orderAsc($createdAt)`); die 30-Tage-Rechnung macht die pure Regel auf den
 * geholten Zeilen. Der Stapel arbeitet sich damit garantiert vorwärts: die
 * ältesten sind die einzigen, die fällig sein können — ist die erste Zeile
 * nicht fällig, ist keine fällig.
 *
 * ── OHNE `H3Event`, UND DAS IST EINE DOKUMENTIERTE AUSNAHME ─────────────
 * Ein Sweep bedient keinen Request (CLAUDE.md nennt Sweeps ausdrücklich als
 * erlaubt ausserhalb der Datentür). Er liegt deshalb in `server/utils` und
 * nicht in `server/plugins` — wörtlich die Wahl von `insightsCorrectionsSweep`.
 * Die vier Nitro-Auto-Imports sind über `deps` überschreibbar, damit ein Test
 * beide Regeln MIT Gegenprobe zeigen kann, ohne eine Appwrite zu brauchen
 * (Muster: `insightsRadarSweep.ts`).
 *
 * ── LOGZEILEN OHNE INHALT ───────────────────────────────────────────────
 * `insights.subscribers_swept` trägt ZAHLEN. Keine Adresse, keine Quelle — die
 * Felder, die dieser Sweep gerade leert, gehören nicht in ein Log, das sie
 * überlebt. Die Zeilen-Id im FEHLER-Fall ist die Ausnahme: sie ist die einzige
 * Angabe, mit der ein Betreiber eine hängende Zeile wiederfindet.
 */

/**
 * Wie viele Zeilen ein Lauf je Regel höchstens anfasst.
 *
 * Explizit, weil Appwrites Vorgabe 25 ist und eine Liste, die still bei 25
 * endet, wie ein leeres Ende aussieht. 200 ist reichlich für eine Liste, die
 * in Monaten altert; was übrig bleibt, nimmt der nächste Lauf — der Filter ist
 * das Datum, und das rückt nicht weg.
 */
const SWEEP_BATCH = 200

/** NUR die Methoden, die dieser Lauf benutzt (Begründung: Radar-Sweep). */
interface TablesDbLike {
  listRows: <T>(args: { databaseId: string, tableId: string, queries?: string[] }) => Promise<{ rows: T[], total: number }>
  updateRow: (args: { databaseId: string, tableId: string, rowId: string, data: Record<string, unknown> }) => Promise<unknown>
  deleteRow: (args: { databaseId: string, tableId: string, rowId: string }) => Promise<unknown>
}

export interface InsightsSubscribersSweepDeps {
  /** Vorgabe: `createAdminClient().tablesDB`. */
  tablesDB?: TablesDbLike
  /** Vorgabe: `useRuntimeConfig().public.appwriteDatabaseId`. */
  databaseId?: string
  /** Vorgabe: `logEvent`. */
  log?: (level: 'info' | 'warn', name: string, data: Record<string, unknown>) => void
}

export interface InsightsSubscribersSweepResult {
  /** Wie viele unbestätigte Zeilen die erste Abfrage geliefert hat. */
  checkedPending: number
  /** Wie viele davon gelöscht wurden (Regel 1). */
  deleted: number
  /** Wie viele abgemeldete Zeilen die zweite Abfrage geliefert hat. */
  checkedUnsubscribed: number
  /** Wie viele davon geleert wurden (Regel 2). */
  cleared: number
  /** Wie viele Schreibversuche fehlgeschlagen sind — fail-soft, aber gezählt. */
  errors: number
}

let sweepRunning = false

/**
 * Einen Durchgang fahren. `now` ist ein Argument, damit der Takt keine zweite
 * Zeitquelle hat und ein Test die Uhr stellen kann.
 */
export async function runInsightsSubscribersSweep(
  now: Date = new Date(),
  deps: InsightsSubscribersSweepDeps = {},
): Promise<InsightsSubscribersSweepResult> {
  const result: InsightsSubscribersSweepResult = {
    checkedPending: 0,
    deleted: 0,
    checkedUnsubscribed: 0,
    cleared: 0,
    errors: 0,
  }
  if (sweepRunning) return result
  sweepRunning = true

  const log = deps.log ?? ((level, name, data) => logEvent(level, name, data))

  try {
    const tablesDB = deps.tablesDB ?? (createAdminClient().tablesDB as unknown as TablesDbLike)
    const databaseId = deps.databaseId ?? useRuntimeConfig().public.appwriteDatabaseId

    // ── Regel 1: unbestätigte Zeilen, deren Link 30 Tage her ist ──────────
    const pending = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [
        Query.equal('confirmedAt', ''),
        // Älteste zuerst: nur sie können fällig sein (s. Kopf).
        Query.orderAsc('$createdAt'),
        Query.limit(SWEEP_BATCH),
      ],
      // FAIL-SOFT UND STILL: auf einer Instanz OHNE insights-006 gibt es die
      // Tabelle nicht, und der Layer kann trotzdem einkompiliert sein (der
      // Playground ist genau so). Ein täglicher Fehler-Stapel wäre dort kein
      // Hinweis, sondern Rauschen.
    }).catch(() => null)

    if (pending) {
      result.checkedPending = pending.rows.length
      for (const row of pending.rows) {
        if (!insightsNewsletterPendingPurgeDue(row, now)) continue
        try {
          await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_SUBSCRIBERS_TABLE, rowId: row.$id })
          result.deleted += 1
        }
        catch (error) {
          result.errors += 1
          log('warn', 'insights.subscribers_sweep_failed', {
            rowId: row.$id,
            rule: 'pending',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    // ── Regel 2: abgemeldete Zeilen, deren 12 Monate um sind ──────────────
    const expired = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [
        Query.lessThanEqual('retentionAt', now.toISOString()),
        Query.orderAsc('retentionAt'),
        Query.limit(SWEEP_BATCH),
      ],
    }).catch(() => null)

    if (expired) {
      result.checkedUnsubscribed = expired.rows.length
      for (const row of expired.rows) {
        // Die pure Regel bleibt als Netz HINTER der Abfrage — und sie ist
        // zugleich der Grund, warum eine schon geleerte Zeile keinen zweiten
        // Schreibvorgang bekommt.
        if (!insightsNewsletterPiiSweepDue(row, now)) continue
        try {
          await tablesDB.updateRow({
            databaseId,
            tableId: INSIGHTS_SUBSCRIBERS_TABLE,
            rowId: row.$id,
            // `retentionAt` geht MIT auf null (s. Kopf) — sonst bleibt die
            // geleerte Zeile fällig und füllt jeden Stapel. `emailLower`
            // bekommt den PLATZHALTER und nicht '': die Spalte trägt den
            // Unique-Index, und zwei leere Werte wären ein 409 ab der zweiten
            // Zeile (s. `insightsNewsletterAnonymizedEmail`).
            data: {
              email: '',
              emailLower: insightsNewsletterAnonymizedEmail(row.$id),
              ipHash: '',
              retentionAt: null,
            },
          })
          result.cleared += 1
        }
        catch (error) {
          result.errors += 1
          log('warn', 'insights.subscribers_sweep_failed', {
            rowId: row.$id,
            rule: 'retention',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return result
  }
  finally {
    sweepRunning = false
  }
}
