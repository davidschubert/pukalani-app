import { ID, Query } from 'node-appwrite'
import { createBrandWaitlistSchema } from '../../../schemas/brandWaitlist'
import type { BrandWaitlistResponse } from '../../../shared/types/brand'
import { BRAND_WAITLIST_TABLE, type BrandWaitlistRow, brandDb } from '../../utils/brandStore'
import {
  brandWaitlistTokenExpiry,
  createBrandWaitlistToken,
  hashBrandWaitlistToken,
  maskBrandWaitlistEmail,
  sendBrandWaitlistConfirmMail,
} from '../../utils/brandWaitlist'

/**
 * „FRÜHZUGANG ANFRAGEN" — die DRITTE öffentliche Route des Layers (neben der
 * Code-Prüfung und dem token-geschützten Share-GET), und die einzige, die
 * ohne jeden Beweis SCHREIBT.
 *
 * ── WARUM SIE ÖFFENTLICH SEIN MUSS ────────────────────────────────────────
 * Sie ist die Antwort auf die geschlossene Beta: wer keinen Einladungscode hat,
 * hatte bisher keinen Weg, etwas zu hinterlassen. `requireBrandAccess` davor
 * wäre ein Zirkel — die Route existiert für genau die Menschen, die das Gate
 * nicht passieren.
 *
 * ── DOUBLE-OPT-IN: DIE ZEILE ZÄHLT ERST NACH DEM KLICK ────────────────────
 * (Davids Entscheidung: „sonst spammen die mir das Fach voll".) Diese Route
 * schreibt `status: 'pending'` und schickt einen Bestätigungs-Link an die
 * ADRESSE; gemeldet wird dem Betreiber erst in `waitlist/confirm.post.ts`.
 * Eine fremde Adresse einzutragen kostet damit nichts mehr als eine Mail, die
 * beim Falschen ankommt und ignoriert wird.
 *
 * DREI FÄLLE, ZWEI ANTWORTEN:
 *  · neu ⇒ Zeile anlegen, Mail, `mail_sent`
 *  · unbestätigt (jeder Status ausser 'confirmed') ⇒ NEUEN Token setzen (der
 *    alte verfällt damit), Mail erneut, ebenfalls `mail_sent`
 *  · bestätigt ⇒ NICHTS schreiben, KEINE Mail, `already_confirmed`
 * Dass „neu" und „lag schon da" dieselbe Antwort geben, ist Absicht: der
 * Unterschied wäre eine Auskunft über eine Adresse, die der Fragende womöglich
 * gar nicht besitzt. `already_confirmed` verrät nichts Weiteres — wer bestätigt
 * ist, hat diese Adresse nachweislich selbst in der Hand gehabt.
 *
 * ── DIE MAIL IST HIER NICHT FAIL-SOFT ─────────────────────────────────────
 * Anders als die Betreiber-Meldung: ohne zugestellte Mail gibt es keinen Link,
 * und ohne Link kann niemand bestätigen. Ein 200 wäre dann ein Versprechen auf
 * etwas, das nie kommt. Die Route antwortet 503 `waitlist_mail_failed` und
 * LÄSST DIE ZEILE STEHEN — sie ist `pending`, also unschädlich, und der nächste
 * Versuch derselben Adresse legt einen frischen Link nach. Ein fehlender Mailer
 * ist derselbe Fall (`sendMail` gibt dort still `false` zurück).
 *
 * ── VIER SICHERUNGEN STATT EINES GATES ────────────────────────────────────
 * (1) Die DROSSEL in `packages/core/server/middleware/05.rate-limit.ts`
 *     (`brand:waitlist`, 5/min je IP, seit dem Opt-in inklusive `/confirm`) —
 *     sie zählt VOR jedem Appwrite-Ruf.
 * (2) Der HONIGTOPF `hp`: gefüllt ⇒ dieselbe 200-Antwort wie sonst, nur ohne
 *     Zeile und ohne Mail. Ein 400 oder eine andere Antwortform wäre eine
 *     Rückmeldung an den Bot, an der er seinen Schreiber verbessert.
 * (3) Der UNIQUE-Index auf `emailLower` (brand-012): auch wenn zwei Anfragen
 *     gleichzeitig ankommen, entsteht höchstens eine Zeile.
 * (4) Das Schema deckelt JEDES Feld — eine offene Schreibroute ohne Längen ist
 *     ein Speicher-Angebot.
 *
 * ── PERSONENBEZOGENE DATEN OHNE KONTO — BEKANNTE GRENZE ───────────────────
 * Eine Zeile trägt eine Adresse und optional Name/Firma, aber keine `userId`;
 * sie entsteht, bevor es ein Konto gibt. `registerUserDataContributor`
 * (core-Vertrag für GDPR-Export und -Löschung) greift deshalb NICHT — er hängt
 * an einer userId, die es hier nicht gibt. Löschung auf Zuruf ist heute ein
 * Handgriff in der Appwrite-Konsole (Zeile über `emailLower`).
 * UNBESTÄTIGTE ZEILEN BLEIBEN LIEGEN: es gibt bewusst KEINEN Sweep, der
 * `pending` nach Fristablauf wegräumt — das wäre ein zweiter Schreibweg auf
 * eine Tabelle, die heute niemand beobachtet, und der Nutzen (ein paar tote
 * Zeilen weniger) steht in keinem Verhältnis. Wer die Liste aufräumen will,
 * tut es von Hand; wer den Sweep nachrüstet, erbt diese Notiz.
 *
 * ── DIE ADRESSE STEHT NIE IM LOG, DER TOKEN ERST RECHT NICHT ──────────────
 * Weder im Erfolgs- noch im Fehlerfall. Das Log sagt `source`, `locale` und den
 * Zustand; im Ausfall-Fall zusätzlich die MASKIERTE Adresse (`x***@domain`,
 * dieselbe Form wie in `core/server/utils/mailer.ts`) — genug, um einer Meldung
 * „ich komme nicht rein" nachzugehen, ohne eine Empfängerliste ins Log zu
 * schreiben. Der rohe Token existiert genau zweimal: in dieser Funktion und in
 * der Mail.
 */
export default defineEventHandler(async (event): Promise<BrandWaitlistResponse> => {
  const body = await readValidatedBody(event, createBrandWaitlistSchema().parse)

  // Der Honigtopf. Die Antwort ist ununterscheidbar von der echten — nur dass
  // nichts geschrieben und niemand benachrichtigt wird.
  if (body.hp) {
    logEvent('info', 'brand.waitlist_honeypot', { source: body.source, locale: body.locale })
    return { ok: true, state: 'mail_sent' }
  }

  const { tablesDB, databaseId } = brandDb(event)

  const token = createBrandWaitlistToken()
  const tokenHash = hashBrandWaitlistToken(token)
  const tokenExpiresAt = brandWaitlistTokenExpiry()

  try {
    // Erst nachsehen: eine zweite Anfrage derselben Person soll die erste NICHT
    // überschreiben — dort steht womöglich schon eine Betreiber-Notiz oder ein
    // `status: 'invited'`. Der UNIQUE-Index bleibt die Garantie darunter, diese
    // Abfrage ist nur der freundliche Weg dorthin.
    const existing = await tablesDB.listRows<BrandWaitlistRow>({
      databaseId,
      tableId: BRAND_WAITLIST_TABLE,
      queries: [Query.equal('emailLower', body.email), Query.limit(1)],
    })
    const row = existing.rows[0]

    if (row?.status === 'confirmed') {
      logEvent('info', 'brand.waitlist_joined', {
        source: body.source,
        locale: body.locale,
        state: 'already_confirmed',
      })
      return { ok: true, state: 'already_confirmed' }
    }

    if (row) {
      // NUR die Token-Felder. Name, Firma, Website und `status` bleiben, wie sie
      // stehen — die erste Anfrage ist die ausführlichere gewesen, und ein
      // 'invited' oder 'declined' des Betreibers darf ein Formular nicht
      // zurücksetzen. Die Sprache der MAIL kommt ohnehin aus diesem Rumpf.
      await tablesDB.updateRow({
        databaseId,
        tableId: BRAND_WAITLIST_TABLE,
        rowId: row.$id,
        data: { tokenHash, tokenExpiresAt },
      })
    }
    else {
      await tablesDB.createRow({
        databaseId,
        tableId: BRAND_WAITLIST_TABLE,
        rowId: ID.unique(),
        data: {
          // `email` ist vom Schema schon getrimmt und kleingeschrieben — der
          // Vergleichswert und die Anrede sind hier also derselbe String. Beide
          // Spalten stehen trotzdem EXPLIZIT (CLAUDE.md: `createRow` verlangt
          // jede Spalte), damit ein späterer Wechsel zur Original-Schreibweise
          // eine Entscheidung an dieser Stelle ist und kein stiller Default.
          emailLower: body.email,
          email: body.email,
          name: body.name,
          company: body.company,
          website: body.website,
          locale: body.locale,
          source: body.source,
          status: 'pending',
          note: '',
          tokenHash,
          tokenExpiresAt,
          confirmedAt: '',
        },
      })
    }
  }
  catch (error) {
    // Fehlende Tabelle/Spalte (Migration nicht gelaufen) oder eine kranke
    // Appwrite — beides ist für den Menschen davor dasselbe: „gerade nicht
    // möglich". `code` reist über den zentralen Handler als `reason` ins
    // Envelope, damit das Formular „später nochmal" sagen kann statt „ungültige
    // Eingabe".
    logEvent('warn', 'brand.waitlist_unavailable', {
      source: body.source,
      locale: body.locale,
      email: maskBrandWaitlistEmail(body.email),
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 503,
      statusText: 'Waitlist unavailable',
      data: { code: 'waitlist_unavailable' },
    })
  }

  // Die Mail steht AUSSERHALB des `try` — ein SMTP-Fehler ist kein Ablage-
  // Fehler und bekommt deshalb seinen eigenen `code` (s. Kopf).
  const sent = await sendBrandWaitlistConfirmMail(event, {
    to: body.email,
    token,
    locale: body.locale,
  })
  if (!sent) {
    logEvent('warn', 'brand.waitlist_mail_failed', {
      source: body.source,
      locale: body.locale,
      email: maskBrandWaitlistEmail(body.email),
    })
    throw createError({
      status: 503,
      statusText: 'Waitlist mail failed',
      data: { code: 'waitlist_mail_failed' },
    })
  }

  logEvent('info', 'brand.waitlist_joined', {
    source: body.source,
    locale: body.locale,
    state: 'mail_sent',
  })
  return { ok: true, state: 'mail_sent' }
})
