/**
 * DIE REGELN DER BETREIBER-WARTELISTE — pur, ohne H3, ohne Appwrite.
 *
 * Die Routen setzen sie durch, die Seite kennt sie (Knöpfe aus- statt
 * eingrauen), der Test nagelt sie fest. Dieselbe Arbeitsteilung wie bei
 * `shared/brandInvite.ts` (Entscheidung pur, Nachschlagen im Server-Util) und
 * bei `communityTeam.ts` im control-Layer.
 *
 * ── VIER ZUSTÄNDE, EINE SPALTE ────────────────────────────────────────────
 * `brand_waitlist.status` ist ein varchar (brand-012: „eine Betreiber-Notiz ist
 * keine Migration wert"), kein Enum. Die WAHRHEIT über die erlaubten Werte
 * steht deshalb hier:
 *
 *   pending   — eingetragen, aber noch nicht per Mail bestätigt (Double-Opt-in).
 *   confirmed — bestätigt. DAS ist die Arbeitsliste des Betreibers.
 *   invited   — ein Beta-Code ist raus (Mail zugestellt, sonst gäbe es ihn nicht).
 *   declined  — abgelehnt. Die Zeile bleibt stehen, damit dieselbe Adresse nicht
 *               beim nächsten Formular wieder auf der Arbeitsliste landet.
 *
 * ── `new` IST BESTAND, KEIN FÜNFTER ZUSTAND ───────────────────────────────
 * Vor dem Opt-in (brand-015) schrieb die Route `status: 'new'`, und die
 * Spalten-VORGABE der Migration lautet bis heute so. In Produktion gibt es
 * keine solche Zeile (die Tabelle war leer), aber eine von Hand angelegte
 * hätte sie — deshalb rechnet `normalizeBrandWaitlistStatus` sie auf `pending`
 * um, statt einen Sonderfall zu bauen, den niemand testet. Dieselbe
 * Entscheidung wie im Kopf von `waitlist/confirm.post.ts`.
 *
 * Unbekanntes ⇒ ebenfalls `pending`: eine Zeile, die niemand einordnen kann,
 * gehört auf die Liste der Ungeklärten und nicht ins Nichts.
 */

export const BRAND_WAITLIST_STATUSES = ['pending', 'confirmed', 'invited', 'declined'] as const
export type BrandWaitlistStatus = typeof BRAND_WAITLIST_STATUSES[number]

/** Die Filter der Seite: die vier Zustände plus „alle". */
export const BRAND_WAITLIST_FILTERS = [...BRAND_WAITLIST_STATUSES, 'all'] as const
export type BrandWaitlistFilter = typeof BRAND_WAITLIST_FILTERS[number]

/**
 * Der Standard-Filter der Seite UND der Routen: `confirmed`.
 *
 * Er ist die Arbeitsliste — wer bestätigt hat, wartet auf eine Entscheidung.
 * `pending` gehört niemandem (der Mensch hat noch nicht geklickt), `invited`
 * und `declined` sind erledigt.
 */
export const BRAND_WAITLIST_DEFAULT_FILTER: BrandWaitlistFilter = 'confirmed'

/** Der gespeicherte Alt-Wert, den es in Produktion nie gab (s. Kopf). */
const LEGACY_PENDING = 'new'

export function normalizeBrandWaitlistStatus(value: string | undefined | null): BrandWaitlistStatus {
  const trimmed = (value ?? '').trim()
  if ((BRAND_WAITLIST_STATUSES as readonly string[]).includes(trimmed)) return trimmed as BrandWaitlistStatus
  return 'pending'
}

export function isBrandWaitlistFilter(value: unknown): value is BrandWaitlistFilter {
  return typeof value === 'string' && (BRAND_WAITLIST_FILTERS as readonly string[]).includes(value)
}

/**
 * WELCHE Spaltenwerte ein Filter meint — die Abfrage der Route, nicht die
 * Anzeige. `pending` fasst den Alt-Wert mit ein (`Query.equal` nimmt ein Array
 * und verodert es), sonst fiele eine Bestands-Zeile aus JEDER Ansicht heraus.
 * `all` gibt `null` zurück: „kein Filter" ist etwas anderes als „alle Werte
 * aufzählen" — nur so sieht der Betreiber auch eine Zeile mit einem Wert, den
 * dieses Modul nicht kennt.
 */
export function brandWaitlistStatusValues(filter: BrandWaitlistFilter): string[] | null {
  if (filter === 'all') return null
  if (filter === 'pending') return ['pending', LEGACY_PENDING]
  return [filter]
}

export type BrandWaitlistInviteRefusal = 'not_confirmed' | 'already_invited'

/**
 * DARF DIESE ZEILE EINEN CODE BEKOMMEN?
 *
 * Nur `confirmed`. Die beiden Absagen sind BEWUSST verschieden, obwohl beide
 * 409 werden: „noch nicht bestätigt" ist ein Warten, „schon eingeladen" ist ein
 * Doppelklick — die Seite sagt dazu zwei verschiedene Sätze, und der Betreiber
 * muss nicht raten, welcher zutrifft.
 *
 * Ein zweiter Code für dieselbe Adresse ist damit über diese Fläche nicht
 * möglich. Das ist Absicht und keine Härte: das Skript `pnpm brand:invite`
 * bleibt der Weg für den Nachschlag (es meldet offene Einladungen und widerruft
 * bewusst keine) — die Warteliste ist die ERSTE Einladung, nicht die
 * Code-Verwaltung.
 */
export function decideBrandWaitlistInvite(
  status: BrandWaitlistStatus,
): { ok: true } | { ok: false, code: BrandWaitlistInviteRefusal } {
  if (status === 'invited') return { ok: false, code: 'already_invited' }
  if (status !== 'confirmed') return { ok: false, code: 'not_confirmed' }
  return { ok: true }
}

/**
 * DARF DIESE ZEILE ABGELEHNT WERDEN?
 *
 * Aus `pending` und `confirmed` ja; aus `invited` nein — dort ist ein Code
 * draußen, und ein „abgelehnt" daneben wäre eine Behauptung, die der Mensch mit
 * dem Code widerlegt (er kommt trotzdem rein). Wer eine Einladung wirklich
 * zurücknehmen will, widerruft den CODE (`pnpm brand:revoke`); das ist eine
 * andere Handlung als eine Notiz in der Liste.
 *
 * `declined` ⇒ `noop`: ein zweites Ablehnen ändert nichts und ist kein Fehler.
 */
export function decideBrandWaitlistDecline(
  status: BrandWaitlistStatus,
): { action: 'decline' | 'noop' } | { action: 'refuse', code: 'already_invited' } {
  if (status === 'invited') return { action: 'refuse', code: 'already_invited' }
  if (status === 'declined') return { action: 'noop' }
  return { action: 'decline' }
}
