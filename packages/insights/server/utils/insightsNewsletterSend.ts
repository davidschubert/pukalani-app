import type { H3Event } from 'h3'
import { ID, Query } from 'node-appwrite'
import type { InsightsNewsletterLocale, InsightsSendState } from '../../shared/insightsNewsletter'
import {
  INSIGHTS_NEWSLETTER_BATCH,
  insightsNewsletterIsRecipient,
  insightsNewsletterLocaleOf,
} from '../../shared/insightsNewsletter'
import type { InsightsPost, InsightsPostHead } from '../../shared/insightsPost'
import { insightsIsPublic, insightsPublicKopf } from '../../shared/insightsPost'
import { insightsFormatIsPublic, insightsPublicHref } from '../../shared/insightsPublic'
import type { InsightsSendRow, InsightsSubscriberRow } from '../../shared/insightsRows'
import { INSIGHTS_SENDS_TABLE, INSIGHTS_SUBSCRIBERS_TABLE, toInsightsBrand, toInsightsPost } from '../../shared/insightsRows'
import type { InsightsNewsletterSendState } from '../../shared/types/insightsApi'

/**
 * DER STAPEL-VERSAND (BI1 I5b) — und die ganze Datei ist eine Antwort auf
 * EINEN Satz:
 *
 *   Stirbt der Vorgang nach 300 von 500 Mails und jemand drückt erneut,
 *   bekämen 300 Menschen die Mail ZWEIMAL.
 *
 * Eine Mail ist draussen, sobald sie draussen ist. Es gibt kein Zurückziehen,
 * keine Korrektur und keine Entschuldigung, die so gut wäre wie das Nicht-
 * Passieren. Deshalb ist der Versand hier NICHT eine Schleife über eine Liste,
 * sondern ein fortsetzbarer Vorgang mit einem Stand in der Ablage:
 *
 *  1. Die Sende-Zeile entsteht VOR der ersten Mail (`insights_sends`,
 *     Migration insights-008). `postId` ist UNIQUE — zwei offene Reiter können
 *     nicht zwei Versände desselben Beitrags starten; der zweite bekommt den
 *     409 des Index und läuft in `resume`.
 *  2. Empfänger werden nach `$id` AUFSTEIGEND gelesen, höchstens
 *     `INSIGHTS_NEWSLETTER_BATCH` (50) je Aufruf. Aufsteigend und nicht
 *     absteigend, weil nur so ein Cursor eine Grenze ist: alles bis `cursor`
 *     ist bedient, alles danach nicht.
 *  3. `cursor` trägt die `$id` des zuletzt bedienten Empfängers und wird nach
 *     JEDEM Stapel geschrieben. Fortsetzen heisst
 *     `Query.greaterThan('$id', cursor)`.
 *
 * ── DER CURSOR RÜCKT AUCH BEI EINEM FEHLSCHLAG VOR ──────────────────────
 * Eine einzelne Mail, die SMTP ablehnt (Adresse tot, Postfach voll), zählt in
 * `failed`, bricht den Lauf NICHT ab — und der Cursor geht trotzdem weiter.
 * Anders herum hinge der ganze Versand an einer kaputten Adresse: jeder
 * Fortsetzungs-Versuch stiess auf dieselbe Zeile, und niemand dahinter bekäme
 * je seine Mail. Der Preis ist benannt: diese eine Adresse bekommt für DIESE
 * Ausgabe nichts mehr. Das ist die richtige Richtung — ein Fehlschlag kostet
 * eine Mail, ein Nicht-Vorrücken kostet alle.
 *
 * ── FEHLT DER MAILER GANZ, BRICHT DER LAUF AB ───────────────────────────
 * `sendMail` gibt bei fehlendem SMTP still `false` zurück, ohne zu werfen
 * (F44). Das ist KEIN Adress-Problem, sondern eines des Servers, und es
 * betrifft jede weitere Zeile gleich. Der Lauf geht deshalb sofort auf
 * `state: 'failed'`, der Cursor bleibt stehen, und ein Druck auf den Knopf
 * nach dem Richten der Konfiguration setzt genau dort fort. Liefe er weiter,
 * stünde der Cursor am Ende der Liste, der Zustand auf `done` — und niemand
 * hätte je eine Mail bekommen.
 *
 * ── KEIN `tenantDb` ─────────────────────────────────────────────────────
 * Wörtlich der Kopf von `insightsStore.ts`: `branding` ist ein Silo, die
 * Tabellen tragen kein `communityId`, der ESLint-Backstop gilt den GEPOOLTEN
 * Layern. Die Grenze ist `insights.manage` an den zwei Routen.
 *
 * ── IM LOG STEHEN ZAHLEN UND EINE BEITRAGS-ID, NIE EINE ADRESSE ─────────
 * `insights.newsletter_send_started` · `_batch` · `_finished` · `_failed`.
 */

// ── 1. Hat dieser Beitrag überhaupt eine Adresse? ──────────────────────────

export interface InsightsSendTarget {
  post: InsightsPost
  /** Der Pfad OHNE Sprach-Präfix — `''`, wenn es keinen gibt. */
  href: string
  /** `''` heisst „kann verschickt werden". */
  blocked: '' | 'not_public' | 'no_public_address'
}

/**
 * WAS VERSCHICKT WERDEN DARF — und die Prüfung ist nicht „ist der Zustand
 * published?", sondern „FÜHRT DER LINK IRGENDWOHIN?".
 *
 * Drei Dinge müssen stimmen, und jedes einzelne hat schon einmal eine Liste
 * ins Leere geschickt:
 *  1. `state` ist `published` oder `updated` (`insightsIsPublic`). Ein Entwurf
 *     hat keine öffentliche Adresse; die Route antwortet dafür 409
 *     `not_public`.
 *  2. Das FORMAT ist freigeschaltet (`pukalani.insights.publicFormats`,
 *     Layer-Default nur `article`). Ein freigegebenes Duell ist heute auf der
 *     Seite ein 404 — eine Mail darauf wäre fünfhundert Klicks in eine
 *     Fehlerseite. Dieselbe Prüfung, die die öffentliche Liste anstellt
 *     (`insightsPostIsVisible`).
 *  3. Es gibt einen PFAD. Ein Markenprofil hat die Adresse seiner MARKE
 *     (`insightsPublicHref` gibt sonst `''`) — ist die Marken-Zeile gelöscht,
 *     führt der Beitrag nirgendwohin. Wörtlich die Regel der öffentlichen
 *     Liste: „ein Eintrag, der ins Leere führt, ist schlimmer als einer, der
 *     fehlt."
 *
 * Punkt 2 und 3 laufen in denselben Grund (`no_public_address`): für den
 * Menschen am Knopf ist es dieselbe Auskunft — „dieser Beitrag hat draussen
 * keine Seite" — und der nächste Handgriff steht in beiden Fällen woanders
 * (Config bzw. Marken-Zeile), nicht in diesem Panel.
 */
export async function resolveInsightsSendTarget(event: H3Event, id: string): Promise<InsightsSendTarget> {
  const row = await loadInsightsPostRow(event, id)
  const post = toInsightsPost(row)

  if (!insightsIsPublic(post)) return { post, href: '', blocked: 'not_public' }

  if (!insightsFormatIsPublic(post.format, insightsPublicFormats())) {
    return { post, href: '', blocked: 'no_public_address' }
  }

  // Nur das Markenprofil braucht eine zweite Abfrage — bei den drei anderen
  // Formaten steht die Adresse am Beitrag selbst.
  let brandSlug = ''
  if (post.format === 'profile') {
    const brandId = post.brandRefs[0]?.brandId ?? ''
    if (brandId) {
      try {
        const brand = await loadInsightsBrandRow(event, brandId)
        brandSlug = toInsightsBrand(brand).slug
      }
      catch {
        // Die Marken-Zeile ist weg — dann hat der Beitrag keine Adresse, und
        // genau das ist die Antwort. Ein 404 für den Menschen am Knopf wäre
        // eine Fehlermeldung über eine fremde Zeile.
        brandSlug = ''
      }
    }
  }

  const href = insightsPublicHref(post.format, post.slug, brandSlug)
  return { post, href, blocked: href ? '' : 'no_public_address' }
}

/** Der Betreff, den dieser Versand bekäme — der Titel der GRUNDFASSUNG. Jeder
 *  Empfänger bekommt den Titel SEINER Fassung; die Vorschau zeigt die, die
 *  jeder bekommt, der keine zweite hat. */
export function insightsSendSubjectPreview(post: InsightsPostHead): string {
  return insightsPublicKopf(post, post.baseLocale).title
}

// ── 2. Die Sende-Zeile ─────────────────────────────────────────────────────

/** „Dieser Beitrag ist schon raus." — 409, der Kern der Regel „ein Beitrag,
 *  eine Mail" (Davids Entscheidung 2026-10-27). */
export function insightsSendAlreadySent() {
  return createError({
    status: 409,
    statusText: 'Newsletter already sent',
    data: { code: 'already_sent' },
  })
}

/**
 * DIE SENDE-ZEILE EINES BEITRAGS, oder `null`.
 *
 * Gelesen über den Unique-Index `uq_post_id` — dieselbe Abfrage, die den
 * zweiten Versand verhindert. Fehlt die TABELLE (Migration nicht gefahren),
 * ist das ein Ablage-Fehler und kein „es gibt keinen Versand": ein
 * stillschweigendes `null` hiesse hier „fang an" und schickte Mails, deren
 * Fortschritt niemand speichern kann.
 */
export async function loadInsightsSendRow(event: H3Event, postId: string): Promise<InsightsSendRow | null> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const res = await tablesDB.listRows<InsightsSendRow>({
      databaseId,
      tableId: INSIGHTS_SENDS_TABLE,
      queries: [Query.equal('postId', postId), Query.limit(1)],
    })
    return res.rows[0] ?? null
  }
  catch (error) {
    throw insightsStorageError(error, `loadInsightsSendRow ${postId}`)
  }
}

/** Die Zeile, wie die Oberfläche sie sieht — OHNE `cursor`: das ist die
 *  Zeilen-Id eines Abonnenten und gehört in keine Antwort. */
export function toInsightsNewsletterSendState(row: InsightsSendRow): InsightsNewsletterSendState {
  return {
    state: (row.state ?? 'running') as InsightsSendState,
    subject: row.subject ?? '',
    intro: row.intro ?? '',
    locale: row.locale ?? 'en',
    recipients: Math.max(0, Math.round(row.recipients ?? 0)),
    sent: Math.max(0, Math.round(row.sent ?? 0)),
    failed: Math.max(0, Math.round(row.failed ?? 0)),
    startedAt: row.startedAt ?? '',
    finishedAt: row.finishedAt ?? '',
  }
}

// ── 3. Die Empfänger ───────────────────────────────────────────────────────

/**
 * Wie viele Seiten die Zählung höchstens liest — 100 × 100 = 10.000 Zeilen.
 *
 * Ein Deckel, nicht eine Erwartung: die Liste geht auf absehbare Zeit in die
 * Hunderte. Er steht hier, damit eine Zählung nicht endlos laufen kann, wenn
 * eine Abfrage einmal nicht vorankommt (etwa weil `$id` doch nicht streng
 * wächst) — eine Schleife ohne Deckel in einer Route ist ein hängender
 * Request.
 */
const COUNT_PAGES_MAX = 100
const COUNT_PAGE_SIZE = 100

/**
 * WIE VIELE MENSCHEN BEKOMMEN DIESE AUSGABE — GEZÄHLT, nicht geraten.
 *
 * Die Zahl steht auf dem Knopf („geht an N Menschen"), und sie ist das
 * Einzige, was der Mensch vor dem Drücken über die Folgen weiss. Deshalb
 * NICHT `total` aus einer Appwrite-Antwort: `total` zählt, was die ABFRAGE
 * trifft, und die Abfrage kann die dritte Bedingung aus
 * `insightsNewsletterIsRecipient` („steht da noch eine Adresse?") nicht
 * ausdrücken. Die Zählung blättert deshalb durch und wendet die REINE Regel
 * an — dieselbe, die der Versand gleich darauf anwendet. Zwei Zahlen aus zwei
 * Rechnungen wären ein Knopf, der etwas anderes verspricht als er tut.
 *
 * `after` erlaubt dasselbe ab einem Cursor („wie viele stehen noch aus?").
 */
export async function countInsightsNewsletterRecipients(
  event: H3Event,
  after = '',
): Promise<number> {
  const { tablesDB, databaseId } = insightsDb(event)
  let cursor = after
  let count = 0
  try {
    for (let page = 0; page < COUNT_PAGES_MAX; page++) {
      const res = await tablesDB.listRows<InsightsSubscriberRow>({
        databaseId,
        tableId: INSIGHTS_SUBSCRIBERS_TABLE,
        queries: [
          Query.notEqual('confirmedAt', ''),
          Query.equal('unsubscribedAt', ''),
          Query.orderAsc('$id'),
          ...(cursor ? [Query.greaterThan('$id', cursor)] : []),
          Query.limit(COUNT_PAGE_SIZE),
        ],
      })
      for (const row of res.rows) {
        if (insightsNewsletterIsRecipient(row)) count++
      }
      if (res.rows.length < COUNT_PAGE_SIZE) return count
      cursor = res.rows[res.rows.length - 1]?.$id ?? ''
      if (!cursor) return count
    }
    return count
  }
  catch (error) {
    throw insightsStorageError(error, 'countInsightsNewsletterRecipients')
  }
}

// ── 4. Ein Stapel ──────────────────────────────────────────────────────────

export interface InsightsNewsletterBatchInput {
  /** Die Zeilen-Id des Beitrags — Schlüssel der Sende-Zeile. */
  postId: string
  /** Der Beitrags-Kopf (Titel, Vorspann, Grundsprache, Redigier-Häkchen). */
  post: InsightsPostHead
  /** Der Pfad des Beitrags OHNE Sprach-Präfix (`insightsPublicHref`). */
  href: string
  /** Die eigenen zwei, drei Sätze — aus der Sende-Zeile, nicht vom Aufrufer. */
  intro: string
  /** Die Sende-Zeile, auf der dieser Stapel aufsetzt. */
  row: InsightsSendRow
}

export interface InsightsNewsletterBatchResult {
  /** Wie viele Mails DIESER Stapel verschickt hat. */
  sent: number
  /** Wie viele DIESER Stapel nicht zustellen konnte. */
  failed: number
  /** Ist die Liste durch? */
  done: boolean
  /** Der Lauf ist am SERVER gescheitert (kein Mailer) — nicht an einer Adresse. */
  aborted: boolean
  /**
   * Der fortgeschriebene Cursor. Er bleibt SERVER-INTERN (die Antwort der
   * Route trägt ihn nicht, s. `InsightsNewsletterSendState`) — die Route
   * braucht ihn nur, um „wie viele stehen noch aus?" zu zählen, ohne die
   * gerade geschriebene Zeile ein zweites Mal zu lesen.
   */
  cursor: string
  /** Die fortgeschriebene Zeile, wie die Oberfläche sie sieht. */
  state: InsightsNewsletterSendState
}

/**
 * EINEN STAPEL ABARBEITEN — höchstens fünfzig Mails, dann wird geschrieben.
 *
 * Die Reihenfolge innerhalb der Funktion ist der Schutz:
 *  1. Empfänger hinter dem Cursor holen (aufsteigend, Deckel 50).
 *  2. Je Zeile: pure Regel prüfen, Mail bauen, Mail schicken, Cursor auf diese
 *     Zeile setzen. Der Cursor rückt in JEDEM Fall vor, in dem die Zeile
 *     ANGESEHEN wurde — auch bei einem Fehlschlag und auch bei einer Zeile,
 *     die die Regel aussortiert (sonst stiess der nächste Stapel wieder auf
 *     sie und käme nie vorwärts).
 *  3. Nach dem Stapel EINMAL schreiben. Ein Schreibvorgang je Mail wäre
 *     fünfhundert Appwrite-Rufe für eine Zahl, die niemand zwischen zwei Mails
 *     liest; EINER je Stapel begrenzt den Schaden eines Abbruchs auf fünfzig.
 *
 * `done` kommt aus der ROHEN Zeilenzahl (`rows.length < BATCH`), nicht aus
 * `sent + failed`: ein Stapel, in dem die reine Regel alle fünfzig Zeilen
 * aussortiert, hat nichts verschickt und ist trotzdem nicht fertig.
 */
export async function runInsightsNewsletterBatch(
  event: H3Event,
  input: InsightsNewsletterBatchInput,
): Promise<InsightsNewsletterBatchResult> {
  const { tablesDB, databaseId } = insightsDb(event)
  const startCursor = input.row.cursor ?? ''

  let rows: InsightsSubscriberRow[]
  try {
    const res = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [
        Query.notEqual('confirmedAt', ''),
        Query.equal('unsubscribedAt', ''),
        Query.orderAsc('$id'),
        ...(startCursor ? [Query.greaterThan('$id', startCursor)] : []),
        Query.limit(INSIGHTS_NEWSLETTER_BATCH),
      ],
    })
    rows = res.rows
  }
  catch (error) {
    throw insightsStorageError(error, `runInsightsNewsletterBatch ${input.postId}`)
  }

  let cursor = startCursor
  let sent = 0
  let failed = 0
  let aborted = false

  for (const subscriber of rows) {
    if (!insightsNewsletterIsRecipient(subscriber)) {
      // Angesehen und übersprungen — der Cursor geht trotzdem weiter (s. Kopf).
      cursor = subscriber.$id
      continue
    }
    const outcome = await sendInsightsNewsletterIssueMail(event, {
      to: subscriber.email ?? '',
      subscriberId: subscriber.$id,
      post: input.post,
      intro: input.intro,
      href: input.href,
      locale: insightsNewsletterLocaleOf(subscriber.locale),
    })
    if (outcome === 'no_mailer') {
      // Der Server, nicht die Adresse. Cursor NICHT vorrücken — diese Zeile ist
      // unberührt und muss beim Fortsetzen wieder dran sein.
      aborted = true
      break
    }
    if (outcome === 'sent') sent++
    else failed++
    cursor = subscriber.$id
  }

  const done = !aborted && rows.length < INSIGHTS_NEWSLETTER_BATCH
  const now = new Date().toISOString()
  const state: InsightsSendState = aborted ? 'failed' : (done ? 'done' : 'running')

  const nextSent = Math.max(0, Math.round(input.row.sent ?? 0)) + sent
  const nextFailed = Math.max(0, Math.round(input.row.failed ?? 0)) + failed

  let saved: InsightsSendRow
  try {
    // JEDE Spalte dieses Vorgangs explizit (CLAUDE.md). `subject`, `intro`,
    // `locale`, `recipients` und `startedAt` bleiben, wie der Start sie
    // gesetzt hat — sie beschreiben die AUSGABE, nicht diesen Stapel.
    saved = await tablesDB.updateRow<InsightsSendRow>({
      databaseId,
      tableId: INSIGHTS_SENDS_TABLE,
      rowId: input.row.$id,
      data: {
        cursor,
        sent: nextSent,
        failed: nextFailed,
        state,
        // Nur ein ABGESCHLOSSENER Lauf trägt einen Endzeitpunkt. Ein
        // abgebrochener bekommt keinen: er ist nicht fertig, er wartet.
        finishedAt: done ? now : '',
      },
    })
  }
  catch (error) {
    throw insightsStorageError(error, `runInsightsNewsletterBatch save ${input.postId}`)
  }

  logEvent(aborted ? 'warn' : 'info', aborted ? 'insights.newsletter_send_failed' : 'insights.newsletter_send_batch', {
    postId: input.postId,
    batch: rows.length,
    sent,
    failed,
    totalSent: nextSent,
    totalFailed: nextFailed,
    done,
  })
  if (done) {
    logEvent('info', 'insights.newsletter_send_finished', {
      postId: input.postId,
      recipients: Math.max(0, Math.round(input.row.recipients ?? 0)),
      sent: nextSent,
      failed: nextFailed,
    })
  }

  return { sent, failed, done, aborted, cursor, state: toInsightsNewsletterSendState(saved) }
}

// ── 5. Der Start ───────────────────────────────────────────────────────────

export interface InsightsNewsletterStartInput {
  postId: string
  subject: string
  intro: string
  /** Die GRUNDSPRACHE des Beitrags — nicht die Sprache der Mails. */
  locale: InsightsNewsletterLocale
  /** Die gezählte Empfängerzahl (s. `countInsightsNewsletterRecipients`). */
  recipients: number
}

/**
 * DIE SENDE-ZEILE ANLEGEN — VOR der ersten Mail, und das ist die ganze
 * Reihenfolge-Entscheidung.
 *
 * Erst schreiben, dann schicken: stirbt der Prozess zwischen den beiden
 * Schritten, steht eine Zeile mit `cursor: ''` und `sent: 0` — der nächste
 * Druck setzt bei null fort und schickt nichts doppelt. Umgekehrt (erst
 * schicken, dann die Zeile) wäre jeder Absturz vor dem Schreiben ein
 * vollständiger Versand, von dem niemand etwas weiss.
 *
 * Ein 409 aus dem Unique-Index `uq_post_id` ist das RENNEN zweier offener
 * Reiter. Er wird NICHT verschluckt: der Aufrufer liest die Zeile neu und
 * entscheidet erneut (`decideInsightsSendStart`) — ein „dann leg eben keine
 * an und schick trotzdem" wäre ein zweiter Versand ohne Fortschrittsstand.
 */
export async function createInsightsSendRow(
  event: H3Event,
  input: InsightsNewsletterStartInput,
): Promise<InsightsSendRow> {
  const { tablesDB, databaseId } = insightsDb(event)
  try {
    const row = await tablesDB.createRow<InsightsSendRow>({
      databaseId,
      tableId: INSIGHTS_SENDS_TABLE,
      rowId: ID.unique(),
      data: {
        postId: input.postId,
        subject: input.subject.slice(0, 200),
        intro: input.intro,
        locale: input.locale,
        state: 'running',
        cursor: '',
        recipients: input.recipients,
        sent: 0,
        failed: 0,
        startedAt: new Date().toISOString(),
        finishedAt: '',
      },
    })
    logEvent('info', 'insights.newsletter_send_started', {
      postId: input.postId,
      recipients: input.recipients,
      locale: input.locale,
    })
    return row
  }
  catch (error) {
    if (isInsightsRowConflict(error)) throw error
    throw insightsStorageError(error, `createInsightsSendRow ${input.postId}`)
  }
}
