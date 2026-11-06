import type { H3Event } from 'h3'
import { displayNameProblem, textContainsLink } from '../../../core/shared/displayName'
import { Query } from 'node-appwrite'
import type { BrandIntroCallInput, BrandIntroLocale } from '../../schemas/brandIntroCall'
import {
  type BrandIntroFilter,
  type BrandIntroStatus,
  BRAND_INTRO_STATUSES,
  brandIntroStatusValues,
  normalizeBrandIntroStatus,
} from '../../shared/brandIntroCall'
import type { BrandIntroRequestItem } from '../../shared/types/brand'
import {
  BRAND_INTRO_REQUESTS_TABLE,
  BRAND_PROFILES_TABLE,
  type BrandIntroRequestRow,
  type BrandProfileRow,
  brandDb,
  isAppwriteNotFound,
} from './brandStore'

/**
 * DER UNTERBAU DES ERSTGESPRÄCHS (BS1 Paket Z0) — die zwei Mails, die eine
 * Datentür und die Betreiber-Sicht, an EINER Stelle. Die Routen bleiben damit
 * lesbar als das, was sie sind.
 *
 * ── ZWEI MAILS, ZWEI ZWECKE, ZWEI FEHLERBEDEUTUNGEN ───────────────────────
 *  · Die BETREIBER-Mail ist der Weg, auf dem ein Mensch die Anfrage bemerkt.
 *    Ihre Adresse steht in `pukalani.brand.introCallNotify`; LEER heisst
 *    „keine Mail" — dieselbe Entscheidung und derselbe Default wie beim
 *    `waitlistNotify` daneben (ein erfundener Standard-Empfänger wäre eine
 *    Zustellung ins Nichts, die wie eine Zustellung aussieht).
 *  · Die BESTÄTIGUNG an den Absender ist eine Quittung, kein Marketing: sie
 *    wiederholt, was er geschrieben hat, und sagt, was als Nächstes passiert.
 *    Kein Link auf ein Angebot, keine Preise, kein „übrigens".
 *
 * BEIDE SIND FAIL-SOFT und geben `false` statt zu werfen. Die Route entscheidet
 * daraus ihre Antwort — und zwar so, dass die ZEILE zählt (s. Kopf der Route).
 *
 * ── DIE TEXTE STEHEN HIER UND NICHT IN i18n ───────────────────────────────
 * Dieselbe Aufteilung wie in `brandWaitlist.ts` und im Portfolio-Erstgespräch:
 * Mail-Texte einer Server-Route sind keine Oberflächen-Strings. `useI18n()`
 * gibt es serverseitig nicht, und den i18n-Apparat für zwei Absätze in eine
 * Nitro-Route zu ziehen wäre teuer. Die zwei Sprachen stehen deshalb als PAAR
 * im Code — sichtbar nebeneinander, damit keine beim Ändern vergessen wird.
 */

/**
 * Maskiert eine Adresse fürs Log (`x***@domain`) — dieselbe Form wie in
 * `core/server/utils/mailer.ts` und in `brandWaitlist.ts`. Genug, um einer
 * Meldung „meine Anfrage kam nie an" nachzugehen, ohne eine Empfängerliste ins
 * Log zu schreiben.
 */
export function maskBrandIntroEmail(email: string): string {
  return email.replace(/(.).*(@.*)/, '$1***$2')
}

export interface BrandIntroMailInput {
  name: string
  email: string
  company: string
  message: string
  phone: string
  locale: BrandIntroLocale
  source: string
  /** Nur gesetzt, wenn die Datentür ihn bestätigt hat (s. u.). */
  profileId: string
}

/** Der Rumpf, wie ihn die Mail-Bauer brauchen — aus dem geprüften Eingang. */
export function toBrandIntroMailInput(
  body: BrandIntroCallInput,
  profileId: string,
): BrandIntroMailInput {
  return {
    name: body.name,
    email: body.email,
    company: body.company,
    message: body.message,
    phone: body.phone,
    locale: body.locale,
    source: body.source,
    profileId,
  }
}

/**
 * DIE MELDUNG AN DEN BETREIBER. Kein Empfänger konfiguriert ⇒ `false` ohne
 * Aufwand: das ist kein Fehler, sondern der Default.
 */
export async function notifyBrandIntroOperator(
  event: H3Event,
  entry: BrandIntroMailInput,
): Promise<boolean> {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { introCallNotify?: string } } }
  const to = (appConfig.pukalani?.brand?.introCallNotify ?? '').trim()
  if (!to) return false

  const lines = [
    `Name:     ${entry.name}`,
    `E-Mail:   ${entry.email}`,
    `Telefon:  ${entry.phone || '—'}`,
    `Marke:    ${entry.company || '—'}`,
    `Sprache:  ${entry.locale}`,
    `Seite:    ${entry.source || '—'}`,
    `Branding: ${entry.profileId || '—'}`,
  ]

  return await sendMail(event, {
    to,
    subject: `Erstgespräch-Anfrage: ${entry.name}${entry.company ? ` (${entry.company})` : ''}`,
    text: [
      'Jemand möchte ein Erstgespräch über branding.supply.',
      '',
      lines.join('\n'),
      '',
      'Anliegen:',
      entry.message,
      '',
    ].join('\n'),
  }).catch(() => false)
}

/**
 * DIE QUITTUNG AN DEN ABSENDER.
 *
 * Sie zitiert das Anliegen zurück — das ist der ganze Trick einer guten
 * Bestätigung: der Absender sieht, dass wirklich ANGEKOMMEN ist, was er
 * getippt hat, und hat es zugleich in seinem eigenen Postfach stehen.
 *
 * KEINE Antwort-Frist in Stunden. Wir sind einer; eine Frist, die niemand
 * einhält, ist teurer als keine.
 */
export async function sendBrandIntroConfirmMail(
  event: H3Event,
  entry: BrandIntroMailInput,
): Promise<boolean> {
  /**
   * KEIN RELAIS (Vorfall 2026-10-27, Resend-Spam über die Registrierung):
   * diese Mail geht an eine Adresse, die der ABSENDER eintippt — mit seinem
   * Namen im Gruß und seinem Text im Zitat ist sie dieselbe Spam-Maschine
   * wie die Verifizierungs-Mail dort. Ein Name mit Link oder Adresse fällt
   * aus dem Gruß (dieselbe Regel wie am Konto, core/shared/displayName.ts),
   * ein Anliegen mit Link wird nicht zitiert, sondern nur bestätigt. Für
   * echte Absender ändert sich nichts: ein Mensch schreibt seinen Namen ohne
   * URL, und wer in seiner Anfrage eine Website nennt, bekommt die Quittung
   * trotzdem — nur ohne das Zitat.
   */
  const salutationName = displayNameProblem(entry.name) === null ? entry.name : ''
  const quote = !textContainsLink(entry.message)

  const de = [
    salutationName ? `Hallo ${salutationName},` : 'Hallo,',
    '',
    'danke — eure Anfrage für ein Erstgespräch ist bei uns angekommen. Wir',
    'melden uns bei euch mit ein paar Terminvorschlägen.',
    '',
    ...(quote ? ['Das habt ihr uns geschrieben:', entry.message] : ['Eure Nachricht liegt uns vor.']),
    '',
    'Wenn etwas fehlt, antwortet einfach auf diese Mail.',
    '',
    'Pukalani Studio · branding.supply',
  ].join('\n')

  const en = [
    salutationName ? `Hi ${salutationName},` : 'Hi,',
    '',
    'thanks — your request for an intro call has reached us. We will come back',
    'to you with a few suggested times.',
    '',
    ...(quote ? ['Here is what you wrote:', entry.message] : ['We have your message on file.']),
    '',
    'If anything is missing, just reply to this email.',
    '',
    'Pukalani Studio · branding.supply',
  ].join('\n')

  return await sendMail(event, {
    to: entry.email,
    subject: entry.locale === 'de'
      ? 'Eure Anfrage für ein Erstgespräch'
      : 'Your request for an intro call',
    text: entry.locale === 'de' ? de : en,
  }).catch(() => false)
}

/**
 * DIE DATENTÜR DER HERKUNFT — gehört die mitgeschickte `profileId` DIESEM
 * Konto?
 *
 * ── WARUM ÜBERHAUPT GEPRÜFT WIRD ──────────────────────────────────────────
 * `profileId` reist über die Adresszeile (`?profileId=…`) und ist damit eine
 * Eingabe wie jede andere. Ungeprüft übernommen stünde in der Anfrage eines
 * Fremden die Branding-Id eines anderen Kunden — der Betreiber öffnete beim
 * Lesen ein Branding, das mit dieser Anfrage nichts zu tun hat, und die Zeile
 * behauptete eine Verbindung, die es nie gab. Das ist kein Datenleck (die
 * Zeile ist server-only), aber eine falsche Tatsache in der Ablage, und die
 * ist teuer genug: nach ihr wird gehandelt.
 *
 * ── VERWERFEN, NICHT ABLEHNEN ─────────────────────────────────────────────
 * Passt sie nicht, gibt diese Funktion `''` zurück und die Anfrage geht OHNE
 * Bezug durch. Ein 403 wäre hier gleich zweimal falsch: er unterschiede
 * „unbekannt" von „fremd" (also eine Auskunft über fremde Ids) und er kostete
 * eine echte Anfrage, deren Link einfach veraltet ist.
 *
 * ── OHNE ANMELDUNG GIBT ES KEINE HERKUNFT ─────────────────────────────────
 * `userId` leer ⇒ `''`, ohne Appwrite überhaupt zu fragen. Ein Gast kann kein
 * Branding besitzen; ihn danach zu fragen wäre eine Abfrage mit feststehender
 * Antwort.
 */
export async function resolveBrandIntroProfileId(
  event: H3Event,
  input: { profileId: string, userId: string },
): Promise<string> {
  if (!input.profileId || !input.userId) return ''

  try {
    const { tablesDB, databaseId } = brandDb(event)
    const profile = await tablesDB.getRow<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      rowId: input.profileId,
    })
    // Dieselbe Frage wie `assertBrandOwnerAccess`, nur ohne zu werfen. Der
    // `ownerType` wird POSITIV geprüft: einen zweiten Typ (Team) gibt es in
    // diesem Layer heute nicht, und wenn er kommt, soll er hier nicht
    // stillschweigend durchrutschen.
    return profile.ownerType === 'user' && profile.ownerId === input.userId ? profile.$id : ''
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return ''
    // Eine kranke Appwrite darf die Anfrage nicht kosten — sie ist der Zweck
    // der Route, die Herkunft nur ihre Fussnote.
    logEvent('warn', 'brand.intro_profile_lookup_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return ''
  }
}

/* ── DIE BETREIBER-SICHT ──────────────────────────────────────────────────
 *
 * Ab hier dieselbe Fläche wie `brandWaitlistAdmin.ts`, mit denselben
 * Begründungen: `users.manage` als Gate (wer über den Beta-Zugang entscheidet,
 * bearbeitet auch die Gesprächsanfragen — eine eigene Capability wäre eine
 * Rolle, die es hier nicht gibt), Admin-Client als Zugriff (die Tabelle trägt
 * `permissions: []`, es gibt keine Session, die dort lesen könnte), und die
 * Route als Grenze — die Seiten-Middleware ist UX, nicht Autorität.
 */

export function requireBrandIntroOperator(event: H3Event) {
  return requirePermission(event, 'users.manage')
}

/**
 * Die Zeile, wie sie nach draussen geht. Sie enthält BEWUSST alles, auch die
 * Nachricht: anders als bei der Warteliste (wo `tokenHash` unterdrückt wird)
 * gibt es hier kein Geheimnis in der Zeile — und der Betreiber muss das
 * Anliegen lesen können, sonst ist die Liste nutzlos.
 */
export function toBrandIntroRequestItem(row: BrandIntroRequestRow): BrandIntroRequestItem {
  return {
    id: row.$id,
    name: row.name ?? '',
    email: row.email || row.emailLower,
    company: row.company ?? '',
    message: row.message ?? '',
    phone: row.phone ?? '',
    locale: row.locale || 'en',
    source: row.source ?? '',
    profileId: row.profileId ?? '',
    userId: row.userId ?? '',
    status: normalizeBrandIntroStatus(row.status),
    note: row.note ?? '',
    createdAt: row.$createdAt,
  }
}

/**
 * EINE SEITE DER LISTE. Neueste zuerst — eine Anfragenliste liest man von
 * oben, und `$createdAt` ist der einzige Zeitpunkt, den jede Zeile trägt.
 *
 * `Query.limit()` ist PFLICHT (sonst 25 stille Zeilen); der Cursor ist die
 * Zeilen-Id der letzten gelieferten Zeile.
 */
export async function listBrandIntroRows(
  event: H3Event,
  input: { filter: BrandIntroFilter, limit: number, cursor?: string },
): Promise<{ rows: BrandIntroRequestRow[], total: number }> {
  const { tablesDB, databaseId } = brandDb(event)
  const values = brandIntroStatusValues(input.filter)

  const res = await tablesDB.listRows<BrandIntroRequestRow>({
    databaseId,
    tableId: BRAND_INTRO_REQUESTS_TABLE,
    queries: [
      ...(values ? [Query.equal('status', values)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(input.limit),
      ...(input.cursor ? [Query.cursorAfter(input.cursor)] : []),
    ],
  })
  return { rows: res.rows, total: res.total }
}

/**
 * DIE DREI ZÄHLER DER KOPFZEILE — unabhängig vom Filter, sonst wäre die
 * Kopfzeile eine Funktion der gerade gewählten Ansicht.
 *
 * FAIL-SOFT: schlägt eine Zählung fehl, steht dort `0` statt eines Fehlers.
 * Die Kopfzeile ist eine Auskunft; die Liste darunter würde für eine kaputte
 * Zahl nicht ausfallen.
 */
export async function countBrandIntroStatuses(
  event: H3Event,
): Promise<Record<BrandIntroStatus, number>> {
  const { tablesDB, databaseId } = brandDb(event)

  const entries = await Promise.all(BRAND_INTRO_STATUSES.map(async (status) => {
    try {
      const res = await tablesDB.listRows<BrandIntroRequestRow>({
        databaseId,
        tableId: BRAND_INTRO_REQUESTS_TABLE,
        queries: [Query.equal('status', [status]), Query.limit(1)],
      })
      return [status, res.total] as const
    }
    catch {
      return [status, 0] as const
    }
  }))

  return Object.fromEntries(entries) as Record<BrandIntroStatus, number>
}

/**
 * EINE ZEILE ÜBER IHRE ID — oder ein 404. Der 404 ist hier keine Tarnung,
 * sondern die Wahrheit: wer bis hierher kommt, hat `users.manage` und darf
 * wissen, dass es diese Zeile nicht (mehr) gibt.
 */
export async function loadBrandIntroRow(event: H3Event, id: string): Promise<BrandIntroRequestRow> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandIntroRequestRow>({
      databaseId,
      tableId: BRAND_INTRO_REQUESTS_TABLE,
      rowId: id,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({
        status: 404,
        statusText: 'Intro request not found',
        data: { code: 'not_found' },
      })
    }
    throw brandIntroUnavailable(error, { rowId: id })
  }
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die öffentliche Route. */
export function brandIntroUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.intro_call_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Intro requests unavailable',
    data: { code: 'intro_call_unavailable' },
  })
}

/** Die Zeilen-Id aus dem Pfad — fehlt sie, ist die Route falsch aufgerufen. */
export function requireBrandIntroId(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  return id
}
