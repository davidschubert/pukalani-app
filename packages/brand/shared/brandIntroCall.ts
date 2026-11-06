/**
 * DIE DREI ZUSTÄNDE EINER ERSTGESPRÄCH-ANFRAGE — pur, damit Route, Seite und
 * Test dieselbe Wahrheit lesen (BS1 Paket Z0).
 *
 * ── WARUM NUR DREI ────────────────────────────────────────────────────────
 * `new` (liegt da) · `contacted` (ich habe geantwortet) · `closed` (erledigt,
 * egal wie). Ein vierter Zustand für „Termin steht" oder „abgesagt" wäre eine
 * Vertriebs-Software; hier geht es darum, dass keine Anfrage untergeht. Der
 * Ausgang eines Gesprächs steht in der Notiz, nicht in einer Spalte.
 *
 * ── VARCHAR STATT ENUM IN DER SPALTE ──────────────────────────────────────
 * Dieselbe Entscheidung wie bei `brand_waitlist.status` (brand-012) und
 * `brand_checks` (brand-016/017): ein vierter Fall soll eine Zeile Code kosten
 * und keine Migration. Die Wahrheit über die erlaubten Werte steht deshalb
 * HIER, und `normalizeBrandIntroStatus` ist die Stelle, an der ein unbekannter
 * Wert aus der Ablage wieder zu einem bekannten wird.
 *
 * FAIL-SAFE AUF `new`: eine Zeile mit kaputtem Zustand ist eine Anfrage, die
 * NICHT bearbeitet ist — sie in der Arbeitsliste zu zeigen ist der Fehler, den
 * man leicht bemerkt; sie als `closed` zu verstecken der, den niemand bemerkt.
 */

export const BRAND_INTRO_STATUSES = ['new', 'contacted', 'closed'] as const

export type BrandIntroStatus = typeof BRAND_INTRO_STATUSES[number]

/** Die Liste plus „alle" — der Filter der Betreiber-Seite. */
export type BrandIntroFilter = BrandIntroStatus | 'all'

export function normalizeBrandIntroStatus(value: string | undefined): BrandIntroStatus {
  return (BRAND_INTRO_STATUSES as readonly string[]).includes(value ?? '')
    ? value as BrandIntroStatus
    : 'new'
}

/**
 * Die Werte, gegen die gefiltert wird — `null` heisst „nicht filtern".
 *
 * `null` und nicht „alle drei aufzählen": eine Zeile mit einem unbekannten
 * Zustand (von Hand in der Konsole gesetzt) fiele aus einer Aufzählung heraus
 * und wäre in KEINER Ansicht sichtbar, auch nicht in „alle". Genau das darf
 * eine Ansicht namens „alle" nicht tun.
 */
export function brandIntroStatusValues(filter: BrandIntroFilter): string[] | null {
  return filter === 'all' ? null : [filter]
}
