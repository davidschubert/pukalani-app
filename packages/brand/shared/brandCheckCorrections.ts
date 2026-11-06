/**
 * DIE REGELN DER KORREKTURVORSCHLÄGE (docs/archiv/BRAND-CHECK-SEITE.md §3b,
 * Davids Idee „wie Google Business Profile") — pur, ohne h3, ohne Appwrite.
 *
 * Wer im Ranking einen Fehler sieht, schlägt eine Korrektur vor; der Betreiber
 * nimmt an oder lehnt mit Begründung ab. Die Routen setzen diese Regeln durch,
 * die Seite kennt sie (Knöpfe aus- statt eingrauen), der Test nagelt sie fest —
 * dieselbe Arbeitsteilung wie bei `shared/brandWaitlistAdmin.ts`.
 *
 * ── WARUM NICHT DER `tickets`-LAYER ───────────────────────────────────────
 * Er läuft auf `branding` gar nicht (die App zieht themes/admin/brand/core/
 * system) und brächte für EIN Feld vier Tabellen und ein Produkt mit. §3b sagt
 * es ausdrücklich: schlank im brand-Layer.
 *
 * ── EIN FELD, UND DAS IST HEUTE DIE GANZE FLÄCHE ──────────────────────────
 * `industry` ist das einzige Feld, das ein Fremder sinnvoll korrigieren kann:
 * es ist ein MODELL-Vorschlag über einen fremden Auftritt. Der Score ist eine
 * Rechnung (den korrigiert man nicht, man widerspricht ihm), der Host kommt
 * aus der Adresse. Die Liste steht trotzdem als Liste da — ein zweites Feld
 * soll ein Eintrag sein und keine Umstellung.
 */

export const BRAND_CHECK_CORRECTION_FIELDS = ['industry'] as const
export type BrandCheckCorrectionField = typeof BRAND_CHECK_CORRECTION_FIELDS[number]

export function isBrandCheckCorrectionField(value: unknown): value is BrandCheckCorrectionField {
  return typeof value === 'string'
    && (BRAND_CHECK_CORRECTION_FIELDS as readonly string[]).includes(value)
}

/**
 * DREI ZUSTÄNDE, EINE SPALTE.
 *
 *   open      — eingegangen, wartet auf den Betreiber. DAS ist die Arbeitsliste.
 *   accepted  — angenommen; der Wert steht seither in `brand_checks.<field>`.
 *   declined  — abgelehnt, mit Begründung in `decisionNote`.
 *
 * Unbekanntes ⇒ `open`: eine Zeile, die niemand einordnen kann, gehört auf die
 * Liste der Ungeklärten und nicht ins Nichts (dieselbe Entscheidung wie bei
 * `normalizeBrandWaitlistStatus`).
 */
export const BRAND_CHECK_CORRECTION_STATUSES = ['open', 'accepted', 'declined'] as const
export type BrandCheckCorrectionStatus = typeof BRAND_CHECK_CORRECTION_STATUSES[number]

export const BRAND_CHECK_CORRECTION_FILTERS = [...BRAND_CHECK_CORRECTION_STATUSES, 'all'] as const
export type BrandCheckCorrectionFilter = typeof BRAND_CHECK_CORRECTION_FILTERS[number]

/** Der Standard-Filter der Betreiber-Liste: das, was noch zu tun ist. */
export const BRAND_CHECK_CORRECTION_DEFAULT_FILTER: BrandCheckCorrectionFilter = 'open'

export function normalizeBrandCheckCorrectionStatus(
  value: string | undefined | null,
): BrandCheckCorrectionStatus {
  const trimmed = (value ?? '').trim()
  return (BRAND_CHECK_CORRECTION_STATUSES as readonly string[]).includes(trimmed)
    ? trimmed as BrandCheckCorrectionStatus
    : 'open'
}

/**
 * WELCHE Spaltenwerte ein Filter meint. `all` gibt `null` zurück: „kein
 * Filter" ist etwas anderes als „alle Werte aufzählen" — nur so sieht der
 * Betreiber auch eine Zeile mit einem Wert, den dieses Modul nicht kennt.
 */
export function brandCheckCorrectionStatusValues(
  filter: BrandCheckCorrectionFilter,
): string[] | null {
  return filter === 'all' ? null : [filter]
}

export type BrandCheckCorrectionDecision =
  | { action: 'apply' }
  | { action: 'noop' }
  | { action: 'refuse', code: 'already_decided' }

/**
 * DARF DIESE ZEILE JETZT ENTSCHIEDEN WERDEN?
 *
 *  · `open`             ⇒ `apply`  — der Normalfall.
 *  · schon SO entschieden ⇒ `noop` — ein Doppelklick ist kein Fehler; er ist
 *    genau so ausgegangen, wie der Betreiber es wollte (dieselbe Nachsicht wie
 *    beim zweiten Ablehnen einer Warteliste-Zeile).
 *  · ANDERS entschieden ⇒ `refuse` — eine Annahme in eine Ablehnung zu drehen
 *    wäre stillschweigend das Zurücknehmen eines Schreibvorgangs in
 *    `brand_checks`, den diese Route gar nicht mehr kennt. Wer wirklich
 *    umentscheiden will, korrigiert das Feld über die Betreiber-Route
 *    (`PATCH /api/brand/admin/checks/<id>` ist der Nachbar dafür) — sichtbar
 *    und nicht als Nebenwirkung.
 */
export function decideBrandCheckCorrection(
  current: BrandCheckCorrectionStatus,
  target: 'accepted' | 'declined',
): BrandCheckCorrectionDecision {
  if (current === 'open') return { action: 'apply' }
  if (current === target) return { action: 'noop' }
  return { action: 'refuse', code: 'already_decided' }
}

// ── Die Drossel des öffentlichen Weges ─────────────────────────────────────

/**
 * DREI VORSCHLÄGE JE ANSCHLUSS UND STUNDE (§3b).
 *
 * Der Eimer in `05.rate-limit.ts` zählt je MINUTE — das ist das einzige
 * Fenster, das die Middleware kennt, und es fängt den Sekundentakt. Die
 * STUNDE fängt das Fluten über den Tag, und die kann nur die Route selbst
 * zählen. Beide sind nötig und meinen Verschiedenes: die Minute schützt den
 * Server, die Stunde die Arbeitsliste des Betreibers.
 *
 * Gezählt wird auf denselben Tages-Stempel wie beim Check (`brandCheckIpHash`,
 * sha256 aus IP und täglich wechselndem Salz) — die rohe IP steht auch hier
 * nirgends.
 */
export const BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT = 3
export const BRAND_CHECK_CORRECTION_WINDOW_MS = 60 * 60_000
export const BRAND_CHECK_CORRECTION_LIMIT_CODE = 'brand_correction_limit'

export function brandCheckCorrectionIpHourKey(ipHash: string): string {
  return `brand-correction-ip-hour:${ipHash}`
}

/**
 * `>` statt `>=`, weil `store.hit()` den Zähler EINSCHLIESSLICH dieses
 * Vorschlags liefert: der dritte in einer Stunde ist erlaubt, der vierte nicht.
 */
export function decideBrandCheckCorrectionQuota(
  count: number,
  limit: number = BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT,
): typeof BRAND_CHECK_CORRECTION_LIMIT_CODE | null {
  return count > limit ? BRAND_CHECK_CORRECTION_LIMIT_CODE : null
}
