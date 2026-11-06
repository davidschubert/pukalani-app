import { Query } from 'node-appwrite'
import { createBrandWaitlistConfirmSchema } from '../../../../schemas/brandWaitlist'
import type { BrandWaitlistConfirmResponse } from '../../../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, type BrandWaitlistRow, brandDb } from '../../../utils/brandStore'
import {
  brandWaitlistTokenExpired,
  hashBrandWaitlistToken,
  notifyBrandWaitlistOperator,
} from '../../../utils/brandWaitlist'

/**
 * DER KLICK AUS DER MAIL — die zweite Hälfte des Double-Opt-in.
 *
 * Der Token IST der Beweis; ein Konto braucht es nicht (die Warteliste ist für
 * Menschen da, die keines haben). Dieselbe Ausnahme vom Zugangs-Gate wie beim
 * öffentlichen Share-GET, und aus demselben Grund.
 *
 * ── DIE REIHENFOLGE ───────────────────────────────────────────────────────
 * hashen → Zeile über `tokenHash` suchen (`idx_token_hash`, brand-015) → Frist
 * prüfen → stempeln → ERST DANACH den Betreiber melden. Die Meldung steht
 * zuletzt und ist fail-soft: die Bestätigung ist zu diesem Zeitpunkt bereits
 * geschrieben, und ein SMTP-Aussetzer darf sie nicht zurücknehmen — der Mensch
 * müsste sonst ein zweites Mal klicken, mit einem Link, den der erste Versuch
 * gerade gelöscht hat.
 *
 * ── DER HASH WIRD BEIM STEMPELN GELÖSCHT ──────────────────────────────────
 * `tokenHash: ''` und `tokenExpiresAt: ''`. Zwei Wirkungen, beide gewollt:
 * ein weitergeleiteter Link ist danach tot (er findet nichts mehr), und die
 * Zeile trägt kein Geheimnis mehr mit sich herum, das sie nicht braucht.
 * Deshalb ist der zweite Klick auf denselben Link ein 400 `token_invalid` und
 * nicht `already_confirmed` — der defensive Zweig unten greift nur für Zeilen,
 * die auf anderem Weg Hash UND Status 'confirmed' tragen.
 *
 * Das leere `''` ist dabei kein Suchtreffer-Risiko: das Schema verlangt
 * mindestens 32 Zeichen im Rumpf, und sha256 liefert immer 64 — der Wert `''`
 * kann als Abfrage nie entstehen.
 *
 * ── DREI ANTWORTEN, DREI STATUS ───────────────────────────────────────────
 *  · 400 `token_invalid` — unbekannt (falsch, schon benutzt, Zeile gelöscht).
 *  · 410 `token_expired` — die 24 Stunden sind um. Die Zeile bleibt `pending`
 *    stehen; ein neuer Eintrag auf `/api/brand/waitlist` legt einen frischen
 *    Link nach. Ein eigener Status statt eines 400, damit die Seite den einen
 *    Satz sagen kann, der hier hilft: „trag dich noch einmal ein".
 *  · 503 `waitlist_unavailable` — die Ablage antwortet nicht (dieselbe Sprache
 *    wie beim Eintragen).
 * Neutralität wie beim Einladungs-Code braucht es hier NICHT: wer den Token
 * hat, hat die Mail, und die ging an genau diese Adresse. Geraten wird ein
 * 256-Bit-Token ohnehin nicht; die Drossel (`brand:waitlist`, 5/min je IP —
 * seit dem Opt-in EIN Eimer für beide Routen, denn es ist EIN Vorgang) macht
 * den Versuch zusätzlich teuer.
 *
 * ── BESTANDS-STATUS `new` ─────────────────────────────────────────────────
 * Vor dem Opt-in schrieb die Route `status: 'new'`. In Produktion gibt es keine
 * solche Zeile (die Tabelle war leer), aber der Code behandelt sie wie
 * `pending`: alles ausser 'confirmed' ist „noch nicht bestätigt", und ein
 * Sonderfall, den niemand auslöst, wäre ein Sonderfall, den niemand testet.
 *
 * ── DER TOKEN STEHT NIE IM LOG ────────────────────────────────────────────
 * Auch nicht gekürzt, auch nicht im Fehlerfall — dieselbe Regel wie beim
 * Share-Token. Geloggt wird die Zeilen-Id und der Ausgang, sonst nichts.
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistConfirmResponse> => {
  const body = await readValidatedBody(event, createBrandWaitlistConfirmSchema().parse)
  const tokenHash = hashBrandWaitlistToken(body.token)

  const { tablesDB, databaseId } = brandDb(event)

  let row: BrandWaitlistRow | undefined
  try {
    const res = await tablesDB.listRows<BrandWaitlistRow>({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      // `idx_token_hash` ist bewusst NICHT unique ('' steht auf jeder
      // bestätigten Zeile) — der Wert selbst ist es: 32 Zufalls-Bytes.
      queries: [Query.equal('tokenHash', tokenHash), Query.limit(1)],
    })
    row = res.rows[0]
  }
  catch (error) {
    logEvent('warn', 'brand.waitlist_unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Waitlist unavailable',
      data: { code: 'waitlist_unavailable' },
    })
  }

  if (!row) {
    logEvent('info', 'brand.waitlist_token_invalid', {})
    throw createError({
      status: 400,
      statusText: 'Waitlist token is invalid',
      data: { code: 'token_invalid' },
    })
  }

  // Defensiv (s. Kopf): normalerweise unerreichbar, weil das Stempeln den Hash
  // löscht. Steht der Status trotzdem auf 'confirmed', ist „schon bestätigt"
  // die ehrliche Auskunft — und ein zweites Stempeln wäre eine Änderung ohne
  // Anlass.
  if (row.status === 'confirmed') {
    return { ok: true, state: 'already_confirmed' }
  }

  if (brandWaitlistTokenExpired(row.tokenExpiresAt)) {
    logEvent('info', 'brand.waitlist_token_expired', { rowId: row.$id })
    throw createError({
      status: 410,
      statusText: 'Waitlist token has expired',
      data: { code: 'token_expired' },
    })
  }

  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      rowId: row.$id,
      data: {
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
        tokenHash: '',
        tokenExpiresAt: '',
      },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.waitlist_unavailable', {
      rowId: row.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Waitlist unavailable',
      data: { code: 'waitlist_unavailable' },
    })
  }

  // Erst jetzt erfährt der Betreiber von dieser Anfrage — das ist der ganze
  // Sinn des Opt-in. Fail-soft (s. Kopf).
  await notifyBrandWaitlistOperator(event, {
    email: row.email,
    name: row.name,
    company: row.company,
    website: row.website,
    locale: row.locale,
    source: row.source,
  })

  logEvent('info', 'brand.waitlist_confirmed', {
    source: row.source,
    locale: row.locale,
  })
  return { ok: true, state: 'confirmed' }
})
