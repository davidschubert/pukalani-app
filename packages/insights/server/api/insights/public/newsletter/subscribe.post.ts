import { ID, Query } from 'node-appwrite'
import {
  INSIGHTS_NEWSLETTER_DAY_WINDOW_MS,
  INSIGHTS_NEWSLETTER_HOUR_WINDOW_MS,
  createInsightsNewsletterSubscribeSchema,
  decideInsightsNewsletterQuota,
  insightsNewsletterDayKey,
  insightsNewsletterHourKey,
  insightsNewsletterTokenExpiry,
} from '../../../../../shared/insightsNewsletter'
import type { InsightsSubscriberRow } from '../../../../../shared/insightsRows'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../../../../../shared/insightsRows'
import type { InsightsNewsletterSubscribeResponse } from '../../../../../shared/types/insightsApi'

/**
 * „SCHREIBT MIR, WENN ETWAS NEUES DA IST" — der Eintrag in den Newsletter
 * (BI1 I5a, Plan §9.3a; Bauart: `POST /api/brand/waitlist` mit seinem
 * Double-Opt-in, Drossel nach dem Muster des Korrekturweges).
 *
 * ── DER RIEGEL ZUERST, UND ZWAR ALS 404 ─────────────────────────────────
 * `pukalani.insights.newsletter.enabled` ist Layer-Default `false`, weil die
 * Rechtstexte Entwurf sind (BS1 R2/R3) — „erst Text, dann Schalter". Zu heisst
 * hier NICHT 403 und nicht „Produkt aus", sondern derselbe neutrale 404 wie
 * eine unbekannte Adresse (`insightsPublicMissing`): die Seite rendert das
 * Formular ohnehin nicht, und ein eigener Grund verriete nur, dass es diesen
 * Weg gibt. Der Riegel schliesst an BEIDEN Türen, wie bei I3.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ──────────────────────────────────────
 *  1. Honigtopf — gefüllt ⇒ dieselbe 200-Antwort, ohne Zeile und ohne Mail.
 *  2. Stunde UND Tag je Anschluss (3/Std, 10/Tag — dieselben Zahlen und
 *     dieselbe Bauart wie der Korrekturweg), VOR jedem Appwrite-Ruf und vor
 *     jeder Mail. Ein Deckel, der erst nach der Arbeit greift, ist keiner —
 *     und diese Route verschickt eine Mail an eine FREI WÄHLBARE Adresse,
 *     ist also ungedrosselt ein Mail-Bombing-Werkzeug (die Lehre aus
 *     `POST /api/auth/signup`). Der Minuten-Eimer `insights:newsletter` aus
 *     `05.rate-limit.ts` liegt noch davor.
 *  3. Zeile anlegen oder auffrischen (vier Fälle, s. u.).
 *  4. Bestätigungs-Mail. Schlägt sie fehl ⇒ 503, Zeile bleibt unbestätigt.
 *
 * ── VIER FÄLLE, EINE ANTWORT ────────────────────────────────────────────
 *  · UNBEKANNT ⇒ neue Zeile, Token, Frist, Mail.
 *  · BEKANNT UND UNBESTÄTIGT ⇒ NEUER Token, neue Frist, Mail. KEINE zweite
 *    Zeile: der Unique-Index auf `emailLower` ist die Wahrheit, die
 *    Vorab-Abfrage nur der freundliche Weg dorthin — ein 409 aus einem Rennen
 *    wird deshalb sauber abgefangen und als Erfolg beantwortet (es gibt dann
 *    eine Zeile, und mehr wollte der Mensch nicht).
 *  · BEKANNT UND BESTÄTIGT ⇒ GAR NICHTS. Keine Mail, keine Änderung, und
 *    dieselbe 200 wie bei Erfolg. Jede andere Antwort wäre die Auskunft „diese
 *    Adresse steht auf unserer Liste" — an jemanden, der sie vielleicht nicht
 *    besitzt. (Hier weicht die Route BEWUSST von der Warteliste ab, die
 *    `already_confirmed` zurückgibt: die ist ein Betreiber-Vorgang ohne
 *    öffentliche Seite, dieses Formular steht auf jeder Artikel-Seite.)
 *  · ABGEMELDET ⇒ wie unbekannt: frischer Token, frische Frist, `confirmedAt`
 *    und `unsubscribedAt` werden GELEERT, die Frist der Aufbewahrung
 *    (`retentionAt`) genullt. Wer sich neu einträgt, willigt neu ein; die alte
 *    Abmeldung ist damit kein Bann, sondern Geschichte.
 *
 * ── DIE MAIL IST HIER NICHT FAIL-SOFT ───────────────────────────────────
 * Ohne zugestellte Mail gibt es keinen Link, und ohne Link keine Bestätigung.
 * Ein 200 wäre ein Versprechen auf etwas, das nie kommt. Die Route antwortet
 * 503 `newsletter_mail_failed` und LÄSST DIE ZEILE STEHEN — sie ist
 * unbestätigt, also unschädlich (und der Sweep räumt sie nach 30 Tagen weg),
 * und der nächste Versuch legt einen frischen Link nach. Ein FEHLENDER Mailer
 * ist derselbe Fall: `sendMail` gibt dort still `false` zurück, ohne zu
 * werfen — die Falle, an der ein `.catch` allein vorbeiliefe.
 *
 * ── DIE ADRESSE STEHT NIE IM LOG, DER TOKEN ERST RECHT NICHT ────────────
 * Das Log sagt `source`, `locale` und den Ausgang; nur im Ausfall-Fall die
 * MASKIERTE Adresse (`x***@domain`) — genug, um einer Meldung „ich bekomme
 * keine Mail" nachzugehen, ohne eine Empfängerliste ins Log zu schreiben.
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterSubscribeResponse> => {
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const body = await readValidatedBody(event, createInsightsNewsletterSubscribeSchema().parse)

  // (1) Der Honigtopf. Ununterscheidbar vom Erfolg.
  if (body.hp) {
    logEvent('info', 'insights.newsletter_honeypot', { source: body.source, locale: body.locale })
    return { ok: true }
  }

  // (2) Stunde und Tag. BEIDE Eimer zählen, auch wenn der erste schon reicht:
  // ein Tages-Eimer, der nur bei freier Stunde hochzählt, wäre nach einer
  // gesperrten Stunde wieder leer — und damit kein Tages-Eimer.
  const ipHash = insightsIpHash(event)
  const { store, prefix } = useRateLimitStore(event)
  const hour = await store.hit(`${prefix}${insightsNewsletterHourKey(ipHash)}`, INSIGHTS_NEWSLETTER_HOUR_WINDOW_MS)
  const day = await store.hit(`${prefix}${insightsNewsletterDayKey(ipHash)}`, INSIGHTS_NEWSLETTER_DAY_WINDOW_MS)
  const quota = decideInsightsNewsletterQuota(hour.count, day.count)
  if (quota) {
    const resetInMs = quota === 'rate_limited_hour' ? hour.resetInMs : day.resetInMs
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(resetInMs / 1000)))
    logEvent('info', 'insights.newsletter_throttled', { code: quota })
    throw createError({ status: 429, statusText: 'Newsletter limit reached', data: { code: quota } })
  }

  const { tablesDB, databaseId } = insightsDb(event)

  const token = createInsightsNewsletterToken()
  const tokenHash = hashInsightsNewsletterToken(token)
  const tokenExpiresAt = insightsNewsletterTokenExpiry()

  let rowId = ''
  try {
    // Erst nachsehen — und zwar über denselben Unique-Index, der die Dublette
    // ohnehin verhindert.
    const existing = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [Query.equal('emailLower', body.email), Query.limit(1)],
    })
    const row = existing.rows[0]

    if (row?.confirmedAt && !row.unsubscribedAt) {
      // Schon drauf. Nichts schreiben, nichts schicken, dieselbe Antwort
      // (s. Kopf) — der Log-Eintrag ist die einzige Stelle, an der der
      // Unterschied überhaupt auftaucht, und er liegt bei uns.
      logEvent('info', 'insights.newsletter_signup', {
        source: body.source,
        locale: body.locale,
        state: 'already_confirmed',
      })
      return { ok: true }
    }

    if (row) {
      // NUR die Felder dieses Vorgangs. `source` bleibt, wie er steht: der
      // ERSTE Eintrag sagt, welche Seite den Leser gebracht hat, und genau das
      // ist die Zahl aus §9.7 — ein zweiter Versuch von einer anderen Seite
      // darf sie nicht überschreiben.
      await tablesDB.updateRow({
        databaseId,
        tableId: INSIGHTS_SUBSCRIBERS_TABLE,
        rowId: row.$id,
        data: {
          // Die Original-Schreibweise wird nachgezogen: wer sich beim zweiten
          // Mal anders schreibt, soll so angeschrieben werden.
          email: body.email,
          locale: body.locale,
          tokenHash,
          tokenExpiresAt,
          // Eine ABGEMELDETE Zeile wird zur wartenden (s. Kopf). Für eine
          // unbestätigte sind beide Felder schon leer — derselbe Schreibvorgang
          // deckt beide Fälle, und ein `if` darüber wären zwei Wege zu
          // demselben Zustand.
          confirmedAt: '',
          unsubscribedAt: '',
          retentionAt: null,
          ipHash,
        },
      })
      rowId = row.$id
    }
    else {
      const created = await tablesDB.createRow<InsightsSubscriberRow>({
        databaseId,
        tableId: INSIGHTS_SUBSCRIBERS_TABLE,
        rowId: ID.unique(),
        // JEDE Spalte explizit (CLAUDE.md): eine neue Spalte soll eine
        // Entscheidung an dieser Stelle sein und kein stiller Default.
        data: {
          emailLower: body.email,
          email: body.email,
          locale: body.locale,
          tokenHash,
          tokenExpiresAt,
          confirmedAt: '',
          unsubscribedAt: '',
          source: body.source,
          ipHash,
          retentionAt: null,
        },
      })
      rowId = created.$id
    }
  }
  catch (error) {
    // 409 = das Rennen gegen eine gleichzeitige Anfrage derselben Adresse. Es
    // gibt dann eine Zeile mit einem gültigen Link, und das war der Wunsch:
    // dieselbe 200 wie sonst, nur ohne zweite Mail.
    if (isInsightsRowConflict(error)) {
      logEvent('info', 'insights.newsletter_signup', {
        source: body.source,
        locale: body.locale,
        state: 'raced',
      })
      return { ok: true }
    }
    logEvent('warn', 'insights.newsletter_unavailable', {
      source: body.source,
      locale: body.locale,
      email: maskInsightsNewsletterEmail(body.email),
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw insightsStorageError(error, 'insightsNewsletterSubscribe')
  }

  // Die Mail steht AUSSERHALB des `try` — ein SMTP-Fehler ist kein
  // Ablage-Fehler und bekommt deshalb seinen eigenen Code (s. Kopf).
  const sent = await sendInsightsNewsletterConfirmMail(event, {
    to: body.email,
    token,
    rowId,
    locale: body.locale,
  })
  if (!sent) {
    logEvent('warn', 'insights.newsletter_mail_failed', {
      source: body.source,
      locale: body.locale,
      email: maskInsightsNewsletterEmail(body.email),
    })
    throw createError({
      status: 503,
      statusText: 'Newsletter mail failed',
      data: { code: 'newsletter_mail_failed' },
    })
  }

  logEvent('info', 'insights.newsletter_signup', {
    source: body.source,
    locale: body.locale,
    state: 'mail_sent',
  })
  return { ok: true }
})
