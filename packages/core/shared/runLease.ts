/**
 * DIE LAUF-SPERRE (run lease) — der pure Teil: Zustand, Fristen, Detail-Feld
 * (GA1 P18, Fundament für BE-008 und BE-010).
 *
 * ── WOZU ────────────────────────────────────────────────────────────────
 * Ein langer Lauf (ein Marktvergleich, ein Newsletter-Stapel) darf je Gegen-
 * stand nur EINMAL gleichzeitig laufen. Zwei gleichzeitige Starts kosten im
 * besten Fall doppelt Geld und im schlechtesten doppelte Mails. Die Sperre
 * muss deshalb auch dann halten, wenn zwei Anfragen in DERSELBEN Millisekunde
 * kommen — und sie muss sich von selbst lösen, wenn der Prozess, der den Lauf
 * hält, stirbt (Deploy, pm2-Reload, Absturz).
 *
 * ── WARUM EINE ZEILE JE LAUF UND KEIN STEMPEL ────────────────────────────
 * Appwrite kennt kein bedingtes Update. „Erst lesen, dann einen Stempel
 * schreiben" hält zwei gleichzeitige Starts NICHT auf: beide lesen „frei",
 * beide schreiben, beide laufen. Die einzige Operation, die bei Appwrite
 * wirklich ausschließt, ist `createRow` mit einer FESTEN Zeilen-Id — der
 * zweite Versuch endet mit 409. Darum ist jeder Lauf EINE Zeile in einer
 * Lauf-Tabelle seines Layers, mit einer Id, die sich aus (scope, subject,
 * seq) rechnet:
 *  - `scope`   = die Art des Laufs (`run`, `newsletter`, …),
 *  - `subject` = woran er hängt (Profil-Id, Sende-Zeilen-Id, …),
 *  - `seq`     = die fortlaufende Nummer je (scope, subject).
 * Zwei Starter, die denselben Vorgänger sehen, rechnen dieselbe Id für
 * `seq + 1` — genau einer gewinnt das Anlegen, der andere bekommt 409 und
 * lehnt ab. Das gilt auch beim ÜBERNEHMEN eines abgestorbenen Laufs: beide
 * rechnen dieselbe Nachfolger-Id.
 *
 * ── DER ZUSTAND IST GERECHNET, NIE GESPEICHERT ───────────────────────────
 * Vorbild ist `insightsBriefState` (packages/insights/shared/
 * insightsWatchlist.ts): eine Spalte `state` wäre eine zweite Wahrheit
 * neben den Zeitpunkten, und genau die bliebe nach einem Absturz auf
 * „läuft" stehen. Gerechnet wird gegen die SERVER-Uhr:
 *  - keine Zeile                            ⇒ `none`
 *  - `finishedAt` gesetzt                   ⇒ `done` (outcome `done`), sonst `failed`
 *  - Herzschlag jünger als `stallMs`        ⇒ `running`
 *  - Herzschlag älter (oder unlesbar)       ⇒ `stalled`
 * Solange der Lauf lebt, schreibt ein Timer im Prozess alle
 * `RUN_LEASE_HEARTBEAT_MS` den Herzschlag neu. Stirbt der Prozess, bleibt er
 * stehen, und nach `RUN_LEASE_STALL_MS` ist der Lauf wieder startbar — ohne
 * Aufräumer, ohne Sweep.
 *
 * Ein UNLESBARER Herzschlag zählt als `stalled`, nie als `running`: eine
 * kaputte Zeile darf einen Gegenstand nicht für immer sperren. (Anders als
 * bei `insightsBriefState`, wo eine Buchung in der Zukunft als „läuft" gilt —
 * dort kostet ein zweiter Lauf Geld ohne Grenze; hier ist die Frist kurz, und
 * ein neuer Lauf setzt seine eigene Zeile.) Ein Herzschlag in der ZUKUNFT
 * (schiefe Uhr) zählt als `running` — er ist lesbar und frisch.
 *
 * Der Server-Teil (Store, Anlegen, Herzschlag-Timer) steht in
 * `core/server/utils/runLease.ts`; die Tabellen legt die Fabrik
 * `scripts/migrations-lib/runLeaseTable.mts` an.
 */

/** Die fünf Zustände — die Reihenfolge ist die des Lebenslaufs. */
export const RUN_LEASE_STATES = ['none', 'running', 'stalled', 'failed', 'done'] as const
export type RunLeaseState = (typeof RUN_LEASE_STATES)[number]

/**
 * Takt des Herzschlags. Sechsmal kürzer als die Frist: ein einzelner
 * verlorener Schreibvorgang (Netz, Appwrite-Neustart) lässt einen lebenden
 * Lauf noch lange nicht abgestorben aussehen.
 */
export const RUN_LEASE_HEARTBEAT_MS = 20_000

/**
 * Ab wann ein Lauf ohne Herzschlag als abgebrochen gilt. Zwei Minuten sind
 * kurz genug, dass ein Mensch nach einem Deploy nicht lange vor einem
 * gesperrten Knopf steht, und lang genug für sechs verpasste Schläge.
 */
export const RUN_LEASE_STALL_MS = 120_000

/** Wie oft eine Oberfläche einen laufenden Lauf nachfragt. */
export const RUN_LEASE_POLL_MS = 5_000

/** Der fachliche Ablehnungsgrund (`data.code` ⇒ `reason` im Envelope). */
export const RUN_LEASE_BUSY_CODE = 'run_running'

/** Größe der Spalte `detail` (varchar) — die Migration legt genau so viel an. */
export const RUN_LEASE_DETAIL_MAX = 4000

/** Größe der Spalte `outcome` (varchar). */
export const RUN_LEASE_OUTCOME_MAX = 32

/**
 * Eine Lauf-Zeile, wie der Zustand sie liest. Leere Strings statt `null`:
 * „nicht gesetzt" hat genau eine Schreibweise.
 */
export interface RunLeaseSnapshot {
  seq: number
  startedAt: string
  heartbeatAt: string
  finishedAt: string
  outcome: string
  detail: string
}

/** Der Zustand eines Laufs gegen die Server-Uhr (s. Kopf). */
export function runLeaseState(
  lease: Pick<RunLeaseSnapshot, 'heartbeatAt' | 'finishedAt' | 'outcome'> | null,
  nowMs: number,
  stallMs: number = RUN_LEASE_STALL_MS,
): RunLeaseState {
  if (!lease) return 'none'
  if (lease.finishedAt) return lease.outcome === 'done' ? 'done' : 'failed'
  const beatMs = lease.heartbeatAt ? Date.parse(lease.heartbeatAt) : Number.NaN
  if (Number.isNaN(beatMs)) return 'stalled'
  return nowMs - beatMs < stallMs ? 'running' : 'stalled'
}

/** Darf ein neuer Lauf starten? Alles außer `running`. */
export function runLeaseStartable(state: RunLeaseState): boolean {
  return state !== 'running'
}

/**
 * Das Detail-Feld als JSON — oder `''`, wenn es nicht in die Spalte passt.
 *
 * Lieber KEIN Detail als ein abgelehnter Schreibvorgang: ein zu langer Wert
 * ließe Appwrite das ganze Update ablehnen, und dann bliebe auch der
 * Herzschlag oder das Ende ungeschrieben — das Detail ist Beiwerk, der
 * Zeitpunkt ist die Sperre.
 */
export function clampRunLeaseDetail(value: unknown): string {
  if (value === undefined) return ''
  let json: string | undefined
  try {
    json = JSON.stringify(value)
  }
  catch {
    return ''
  }
  if (typeof json !== 'string') return ''
  return json.length > RUN_LEASE_DETAIL_MAX ? '' : json
}

/** Das Detail-Feld zurück als Objekt; leer, kaputt oder kein Objekt ⇒ `{}`. */
export function parseRunLeaseDetail(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}
