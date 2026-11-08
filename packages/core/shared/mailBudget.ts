/**
 * DAS TAGESBUDGET DES MAILERS — DIE REINEN REGELN (RS1 a).
 *
 * ── WARUM ES DAS GIBT (Davids Entscheidung 2026-11-08) ───────────────────
 * Unser Resend-Tarif ist der FREIE: 100 Mails am Tag, und zwar für ALLES
 * zusammen — Anmelde-OTP, Verifizierung, Benachrichtigungen UND den
 * Insights-Newsletter. Gemessen am 2026-11-08: 243 Mails im Monat, also rund
 * acht am Tag für Konten; eine Newsletter-Ausgabe kostet EINE Mail je
 * bestätigtem Abonnenten, auf EINEN Tag gebündelt. Ab etwa 85 Empfängern ist
 * die Tagesgrenze erreicht — und was danach scheitert, ist nicht nur die
 * Ausgabe, sondern JEDE weitere Mail des Tages: niemand kann sich mehr
 * anmelden oder seine Adresse bestätigen. Der teure Teil ist die verlorene
 * Anmeldung, nicht die verlorene Ausgabe.
 *
 * Davids Wahl war deshalb „frei bleiben UND bremsen" statt „Tarif anheben":
 * die Liste stand bei null, der Riegel hält das Anmelde-Formular zu, und
 * 20 $/Monat für eine leere Liste wären bezahlte Vorsorge gegen ein Problem,
 * das erst in Monaten auftritt. Die Bremse hilft dagegen dauerhaft.
 *
 * ── SIE SCHALTET SICH SELBST AB (kein Rückbau beim Tarifwechsel) ─────────
 * `GET /usage` liefert bei einem Tarif OHNE Tagesgrenze `daily.limit: null`
 * (so wie heute schon `broadcasts`). Genau dann sagt `readResendDailyRemaining`
 * `'unlimited'`, und `decideMailBatch` lässt JEDEN Stapel durch. Wer auf Pro
 * wechselt, muss hier also nichts ausbauen und nichts umstellen — die Bremse
 * wird von sich aus wirkungslos. Das ist der Grund, warum die Grenze aus der
 * ANTWORT kommt und nicht als feste 100 im Code steht (dieselbe Begründung
 * wie in `scripts/ops/verify-mail-breaker.mjs`).
 *
 * ── OHNE SCHLÜSSEL WIRD NICHT GESENDET (fail-closed, mit Grund) ──────────
 * Kein `NUXT_RESEND_API_KEY` ⇒ wir können das Budget nicht sehen ⇒ `'hold'`
 * mit Grund `budget_unknown`. Das ist die BEGRÜNDETE Umkehrung der
 * Hausregel „eine Mail wird nie verworfen" (D5, Benachrichtigungs-Links):
 * dort geht es um EINE Mail an EINEN Menschen, hier um fünfzig auf einmal,
 * die das Anmelde-Budget mitnehmen. Eine Bremse, die ohne Schlüssel still
 * durchlässt, wäre keine Bremse, sondern ein gutes Gefühl — und der
 * Newsletter-Riegel ist ohnehin zu, es geht also heute keine Ausgabe
 * verloren. Der Grund steht in der Antwort, der Fix ist eine Env-Zeile
 * (docs/runbooks/RESEND-WEBHOOK.md § 5).
 *
 * ── DER SCHLÜSSEL KANN NICHT NUR-LESEND SEIN (gemessen 2026-11-08) ───────
 * Resend kennt genau zwei Rechte-Stufen: `full_access` und `sending_access`.
 * Ein `sending_access`-Schlüssel antwortet auf `GET /usage` mit 401
 * `restricted_api_key` („This API key is restricted to only send emails") —
 * probiert, nicht vermutet. Die Bremse braucht also `full_access`, und das
 * ist der Grund für einen EIGENEN Schlüssel (`pukalani-budget-read`) statt
 * des SMTP-Werts: so kann der SENDE-Schlüssel später auf `sending_access`
 * verengt werden, ohne die Bremse mitzureißen. Dass heute auch der
 * SMTP-Schlüssel `full_access` hat, ist ein offener Punkt in OPEN-ITEMS,
 * keine Rechtfertigung.
 *
 * ── WAS HIER STEHT UND WAS NICHT ────────────────────────────────────────
 * Hier stehen nur Regeln: das Lesen der Antwort, die Rücklage und die
 * Entscheidung. Jede hat eine Gegenprobe (`packages/core/tests/
 * mailBudget.test.ts`). Der Netzzugriff liegt in
 * `server/utils/mailBudget.ts` — er braucht `fetch` und einen Schlüssel und
 * hat im Browser-Bündel nichts zu suchen.
 */

// ── 1. Die Rücklage ────────────────────────────────────────────────────────

/**
 * WIE VIELE MAILS DEM TAG FÜR KONTEN FREIGEHALTEN WERDEN.
 *
 * Zwanzig, bei gemessenen acht. Die Zahl ist bewusst mehr als der Durchschnitt
 * und bewusst keine Konfiguration: sie schützt den Weg, auf dem sich jemand
 * ANMELDET, und wer eine Ausgabe verschickt, soll nicht zwischen „reicht
 * schon" und „sicher" wählen müssen. Der Newsletter ist das, was warten kann
 * — eine Anmeldung, die heute scheitert, kommt nicht morgen wieder.
 *
 * Zu ändern ist es eine Zeile hier, mit einem Satz Begründung daneben.
 */
export const MAIL_BUDGET_ACCOUNT_RESERVE = 20

// ── 2. Die Antwort von `GET /usage` lesen ──────────────────────────────────

/**
 * Wie viele Mails der Tag noch trägt.
 *  · eine Zahl ≥ 0 — so viele sind frei
 *  · `'unlimited'` — der Tarif hat keine Tagesgrenze (`daily.limit: null`)
 *  · `null` — unbekannt (kein Schlüssel, Netzfehler, unlesbare Antwort)
 */
export type MailDailyRemaining = number | 'unlimited' | null

/** Nur die Felder, die wir lesen — Resend schickt mehr. */
interface ResendUsageShape {
  emails?: {
    daily?: {
      used?: unknown
      limit?: unknown
    }
  }
}

const endlicheZahl = (wert: unknown): number | null =>
  typeof wert === 'number' && Number.isFinite(wert) ? wert : null

/**
 * DIE TAGES-ANTWORT VON RESEND IN EINE ZAHL.
 *
 * `{ emails: { daily: { used, limit } } }`. Drei Fälle mit Absicht:
 *  · `limit` ist `null` ⇒ `'unlimited'` (Tarif ohne Tagesgrenze, s. Kopf).
 *  · `limit` und `used` sind Zahlen ⇒ `limit - used`, nie unter 0 (Resend
 *    darf durchaus mehr gezählt haben als die Grenze — ein negativer Rest
 *    wäre für jede Rechnung danach eine Falle).
 *  · alles andere ⇒ `null`. Eine unlesbare Antwort ist NICHT „alles frei":
 *    sie ist unbekannt, und unbekannt bremst (s. Kopf).
 */
export function readResendDailyRemaining(payload: unknown): MailDailyRemaining {
  if (!payload || typeof payload !== 'object') return null
  const daily = (payload as ResendUsageShape).emails?.daily
  if (!daily || typeof daily !== 'object') return null
  // `limit: null` ist die ZUSAGE „keine Tagesgrenze", nicht ein fehlender Wert.
  if (daily.limit === null) return 'unlimited'
  const limit = endlicheZahl(daily.limit)
  const used = endlicheZahl(daily.used)
  if (limit === null || used === null) return null
  return Math.max(0, Math.round(limit) - Math.round(used))
}

// ── 3. Die Entscheidung ────────────────────────────────────────────────────

/** Warum ein Stapel nicht (oder nicht ganz) laufen darf. */
export type MailBudgetCode = 'ok' | 'budget_unknown' | 'budget_exhausted'

export interface MailBatchVerdict {
  /** Darf überhaupt etwas raus? */
  go: boolean
  /**
   * Wie viele Mails dieser Stapel höchstens verschicken darf. Bei `go: false`
   * immer 0; sonst mindestens 1 und höchstens das gewünschte `batchSize`.
   */
  allowed: number
  /** `'ok'` bei `go`, sonst der Grund — er reist als `reason` zum Client. */
  code: MailBudgetCode
}

export interface MailBatchInput {
  /** Was `mailDailyRemaining()` gesehen hat. */
  remaining: MailDailyRemaining
  /** Wie groß der Stapel ohne Bremse wäre (Insights: 50). */
  batchSize: number
  /** Was dem Tag für Konten bleiben soll. Default: die Rücklage oben. */
  reserve?: number
}

/**
 * DARF DIESER STAPEL RAUS — UND WIE GROSS?
 *
 * Die Rechnung ist `rest - rücklage`, gedeckelt auf die gewünschte Stapel-
 * größe. Drei Ausgänge:
 *  · `'unlimited'` ⇒ voller Stapel, die Bremse ist beim bezahlten Tarif
 *    wirkungslos (s. Kopf).
 *  · `null` ⇒ `budget_unknown`, nichts raus (fail-closed, s. Kopf).
 *  · eine Zahl ⇒ so viele wie über der Rücklage liegen. Bleibt davon nichts,
 *    ist es `budget_exhausted`.
 *
 * EIN TEIL-STAPEL IST KEIN FEHLER, sondern der Normalfall an einem engen Tag:
 * dreißig freie Mails verschicken dreißig Ausgaben, der Cursor steht danach
 * mitten in der Liste, und morgen drückt die Redaktion denselben Knopf noch
 * einmal. Der Versand ist genau dafür gebaut (Stapel + Cursor, BI1 I5b) —
 * ein „alles oder nichts" hätte an einem solchen Tag gar nichts verschickt.
 */
export function decideMailBatch(input: MailBatchInput): MailBatchVerdict {
  const batchSize = Math.max(0, Math.round(input.batchSize))
  if (batchSize === 0) return { go: false, allowed: 0, code: 'budget_exhausted' }

  if (input.remaining === 'unlimited') return { go: true, allowed: batchSize, code: 'ok' }
  if (input.remaining === null) return { go: false, allowed: 0, code: 'budget_unknown' }

  const reserve = Math.max(0, Math.round(input.reserve ?? MAIL_BUDGET_ACCOUNT_RESERVE))
  const frei = Math.max(0, Math.round(input.remaining) - reserve)
  if (frei <= 0) return { go: false, allowed: 0, code: 'budget_exhausted' }
  return { go: true, allowed: Math.min(batchSize, frei), code: 'ok' }
}
