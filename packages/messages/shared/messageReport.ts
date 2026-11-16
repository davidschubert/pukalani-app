/**
 * DER EINGEFRORENE BELEG (Konzept § 2.2, Davids Entscheidung 2) — PUR.
 *
 * ── DER GRUNDSATZ ─────────────────────────────────────────────────────────
 * Niemand vom Stab liest proaktiv private Nachrichten. Es gibt keine
 * Moderations-Ansicht „alle Konversationen dieser Community". Lesbar wird
 * GENAU die Nachricht, die jemand meldet — und zwar so, wie sie im Moment der
 * Meldung dastand.
 *
 * ── WARUM EINE KOPIE UND NICHT DIE ZEILE SELBST ───────────────────────────
 * Zwei Gründe, beide aus dem Konzept:
 *  1. BELEGSICHERHEIT. Löscht oder ändert der Absender danach, bleibt die
 *     Meldung nachvollziehbar. Ohne Kopie wäre „ich lösche es schnell" die
 *     wirksamste Verteidigung gegen jede Meldung.
 *  2. DIE GRENZE IST EINE REGEL AN DEN ROUTEN, KEIN PERMISSION-WALL — und
 *     das gehört ausgesprochen. Die Moderation liest über die Operator-Klinke
 *     der Datentür, und die umgeht Row-Permissions ABSICHTLICH. Eine
 *     Permission, die den Moderator aussperrt, wäre für den Admin-Client gar
 *     keine. Der Schutz ist deshalb: ZWEI Routen geben Text heraus (die
 *     Warteschlange und die Einzel-Ansicht), und für beide entscheidet EINE
 *     Funktion hier (`moderatorVisibleBody`): nur die Kopie, nie `body`, und
 *     nur solange eine Meldung OFFEN ist (SEC-033, Davids Entscheidung
 *     2026-11-12). Das Netz darunter ist `scripts/verify-messages.mjs`.
 *
 * ── DIE ERSTE MELDUNG FRIERT EIN, DIE ZWEITE NICHT ────────────────────────
 * Der Eskalations-Handler wird nach JEDER neuen Meldung gerufen. Würde jede
 * den Beleg überschreiben, wäre der Beleg genau das nicht: eine zweite Meldung
 * (Stunden später, Text inzwischen geändert) machte die erste wertlos. Also
 * schreibt nur, wo noch nichts steht.
 */

export interface ReportSnapshotState {
  /** Was heute in `reportedBody` steht ('' = noch nie eingefroren). */
  reportedBody: string
  /** Wann eingefroren wurde ('' = nie). */
  reportedAt: string
}

/** Muss dieser Eskalations-Lauf den Beleg schreiben? */
export function shouldFreezeSnapshot(state: ReportSnapshotState): boolean {
  return state.reportedAt === ''
}

export interface ModeratorBodyState extends ReportSnapshotState {
  /** Offene Meldungen zu dieser Nachricht (in ihrer Community). */
  openReports: number
}

/**
 * Was die Moderation als TEXT bekommt — die EINE Entscheidung für beide
 * Routen (Warteschlange und Einzel-Ansicht).
 *
 * NIE `body`. Steht kein Beleg da, gibt es nichts zu sehen — auch nicht
 * „ersatzweise den aktuellen Text". Genau dieser Ersatz wäre die Hintertür,
 * durch die eine ungemeldete Nachricht herauskäme.
 *
 * NUR BEI OFFENER MELDUNG (SEC-033, Davids Entscheidung 2026-11-12: „Den Text
 * einer gemeldeten privaten Nachricht sieht die Moderation nur, solange die
 * Meldung offen ist."). Nach der Erledigung bleibt die Kopie bis zum Ablauf
 * der Frist gespeichert (s. `evidenceDueForClearing`), herausgegeben wird sie
 * nicht mehr. Das hängt am LESEN, nicht an einem Datenlauf — es gilt damit
 * sofort auch für alle schon erledigten Meldungen. `null` = kein Text.
 */
export function moderatorVisibleBody(state: ModeratorBodyState): string | null {
  if (state.reportedAt === '') return null
  if (!(Number.isFinite(state.openReports) && state.openReports > 0)) return null
  return state.reportedBody
}

/**
 * DIE BEFRISTETE AUSNAHME VOM LÖSCHRECHT (Konzept § 6, Ausnahme 1).
 *
 * Ein eingefrorener Beleg zu einer OFFENEN Meldung überlebt die Konto-Löschung
 * — 90 Tage ab der Meldung. Begründung analog zu Davids Entscheidung vom
 * 2026-08-02 (`abuse_reports.reporterEmail`): der Beleg ist die Grundlage
 * einer womöglich verhängten Sperre, und Art. 17 Abs. 3 DSGVO nimmt die
 * Geltendmachung von Rechtsansprüchen vom Löschrecht aus.
 *
 * NACH der Frist gilt keine Ausnahme mehr — dann fällt der Beleg mit dem Rest.
 *
 * Unabhängig von der Kontolöschung leert der Lösch-Lauf den Beleg 90 Tage
 * nach der letzten ERLEDIGUNG (`evidenceDueForClearing` unten,
 * `server/utils/reportEvidenceSweep.ts`) — dieselbe Zahl, anderer Anker. Er
 * leert `reportedBody` UND `reportedAt`: ohne Beleg kein Merker, eine spätere
 * neue Meldung friert dann neu ein (`shouldFreezeSnapshot`). Eine geleerte
 * Zeile ist hier nicht mehr geschützt (`reportedAt` leer) — richtig so, es
 * gibt nichts mehr zu schützen.
 */
export const REPORT_EVIDENCE_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** Ist der Beleg noch geschützt? (`now` als Argument, damit die Regel pur bleibt.) */
export function evidenceStillProtected(reportedAt: string, now: Date): boolean {
  if (!reportedAt) return false
  const at = Date.parse(reportedAt)
  if (!Number.isFinite(at)) return false
  const ageDays = (now.getTime() - at) / DAY_MS
  return ageDays < REPORT_EVIDENCE_RETENTION_DAYS
}

/**
 * Die wählbaren Melde-Gründe für eine private Nachricht.
 *
 * Bewusst ANDERE als bei einem öffentlichen Beitrag: „Spam" und
 * „unangemessen" gibt es dort auch, „Belästigung" ist hier der Regelfall und
 * steht deshalb vorn. Die Beschriftungen liefert der Konsument lokalisiert
 * (Muster `ReportButton.vue`).
 */
export const MESSAGE_REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'other'] as const
export type MessageReportReason = (typeof MESSAGE_REPORT_REASONS)[number]

/* ── Nach der Erledigung (SEC-033, Davids Entscheidung 2026-11-12) ───────── */

/**
 * Der Stand der Meldungen zu EINER Nachricht in IHRER Community, wie ihn der
 * moderation-Vertrag `reportEvidenceStateForTarget` liefert.
 *
 * KEINE SPALTE FÜR „ERLEDIGT AM" (bewusst keine Migration): der Zeitpunkt der
 * Erledigung ist das `$updatedAt` der erledigten Meldungs-Zeile —
 * `resolveReportsForTarget` ist der letzte, der sie schreibt.
 */
export interface ReportEvidenceReports {
  /** Offene Meldungen (`status = 'open'`). */
  open: number
  /** Nicht offene Meldungen (erledigt). Zurückgezogene sind gelöscht und fehlen hier. */
  closed: number
  /** Spätestes `$updatedAt` der nicht offenen Meldungen; '' = keine. */
  lastClosedAt: string
}

export interface ReportEvidenceState extends ReportSnapshotState, ReportEvidenceReports {}

/**
 * Ist der Beleg FÄLLIG zum Leeren? (`now` als Argument — pur, getestet.)
 *
 *  · nur mit Text (`reportedBody != ''`) und eingefroren (`reportedAt`);
 *  · nie, solange eine Meldung OFFEN ist — auch eine, die nach einer
 *    Erledigung neu aufgeht;
 *  · Beginn der Frist ist die LETZTE Erledigung; gibt es gar keine
 *    Meldungs-Zeile mehr (alle zurückgezogen), zählt `reportedAt`;
 *  · ein unlesbares Datum ist NIE fällig — der Zweifel löscht nicht.
 *
 * Fällig ab GENAU 90 Tagen (`>=`), passend zu `evidenceStillProtected`
 * (geschützt, solange `< 90`).
 *
 * Eine Kopie dieser Regel liest das Zähl-Skript
 * (`packages/messages/scripts/lib/reportEvidenceRule.mjs`); ein Test hält beide gleich.
 */
export function evidenceDueForClearing(state: ReportEvidenceState, now: Date): boolean {
  if (state.reportedBody === '' || state.reportedAt === '') return false
  if (state.open > 0) return false
  const anchor = state.closed > 0 ? state.lastClosedAt : state.reportedAt
  const at = Date.parse(anchor)
  if (!Number.isFinite(at)) return false
  return now.getTime() - at >= REPORT_EVIDENCE_RETENTION_DAYS * DAY_MS
}

/** Der Schalter des Lösch-Laufs (`pukalani.messages.reportEvidenceSweep`). */
export const REPORT_EVIDENCE_SWEEP_MODES = ['off', 'count', 'apply'] as const
export type ReportEvidenceSweepMode = (typeof REPORT_EVIDENCE_SWEEP_MODES)[number]

/** Fehlt er ⇒ `off`; ein unbekannter Wert ⇒ `off` UND `invalid` (nie still „irgendwas"). */
export function resolveReportEvidenceSweepMode(value: unknown): { mode: ReportEvidenceSweepMode, invalid: boolean } {
  if (value === undefined || value === null || value === '') return { mode: 'off', invalid: false }
  if (typeof value === 'string' && (REPORT_EVIDENCE_SWEEP_MODES as readonly string[]).includes(value)) {
    return { mode: value as ReportEvidenceSweepMode, invalid: false }
  }
  return { mode: 'off', invalid: true }
}

/**
 * Schreibt dieser Lauf seine Zahlen-Zeile? Beim ersten Lauf nach dem Start,
 * danach nur, wenn sich „fällig" geändert hat, etwas geleert wurde oder etwas
 * scheiterte — kein stündliches Rauschen.
 */
export function shouldLogEvidenceSweep(
  lastLoggedDue: number | null,
  result: { due: number, cleared: number, failed: number },
): boolean {
  return lastLoggedDue === null || result.due !== lastLoggedDue || result.cleared > 0 || result.failed > 0
}
