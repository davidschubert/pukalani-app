import { createHash } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { encodeNotificationWhen } from '../../../core/shared/notificationWhen'
import type { NotifyInput, NotifyResult } from '../../../core/server/utils/notify'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import type { EventReminderJobMode } from '../../shared/eventReminderJob'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow } from '../../shared/types/event'

/** Vorlauf der Erinnerung (Entscheidung David, EVENTS-V2 §8.2: 24 h) */
const REMINDER_LEAD_MS = 24 * 3600_000

/**
 * Erinnerung 24 h vor dem Beginn: published-Termine, die innerhalb der
 * nächsten 24 h starten und noch nicht erinnert wurden, lösen eine
 * Benachrichtigung an alle Zusager aus (Core-Vertrag notify()).
 *
 * DER WEG ist seit OPS-003 (2026-11-16) der Zeit-Lauf `event-reminders`
 * (`sweepAllEventReminders` unten), stündlich über ALLE Communities. Bis
 * BE-018 (2026-11-17) stieß zusätzlich JEDER Aufruf der Termin-Liste einen
 * Lauf an, auch von Gästen — das ist entfernt. `sweepEventReminders` bedient
 * nur noch die Route `reminder-sweep` (eine Community, durch die Datentür).
 *
 * „GENAU EINMAL" je (Termin, Empfänger, Beginn) macht die feste Zeilen-Id der
 * Benachrichtigung (`eventReminderRowId`, `notify({ rowId })`): ein zweiter
 * Versuch läuft in Appwrites 409 — keine Zeile, keine Mail. Der Merker
 * `remindersSentAt` steht deshalb erst NACH den Benachrichtigungen und nur,
 * wenn keine an einer Störung scheiterte; sonst holt der nächste Takt die
 * Fehlenden nach. Bis BE-018 stand er ZUERST — ein abgebrochener Versand
 * kostete den Rest seine Erinnerung.
 *
 * WER HANDELT (F17): KEIN `actor` — ein Sweep. Geschrieben wird nur ein
 * Versand-Merker auf fremden Zeilen. Weder tritt der Aufrufer dadurch der
 * Community bei (A5), noch soll eine Zahlungssperre die Erinnerung an einen
 * Termin verschlucken, den die Zusager längst im Kalender haben.
 */
export async function sweepEventReminders(event: H3Event): Promise<void> {
  // Reiht sich ein, statt bei „besetzt" still zurückzukehren: das Überspringen
  // brauchte nur der Anstoß beim Lesen (eine Liste sollte nicht warten). Ein
  // Fehler bleibt best-effort — die Route antwortet wie bisher.
  await inReminderQueue(() => doSweep(event)).catch(() => {})
}

/**
 * EINE WARTESCHLANGE IM PROZESS für beide Auslöser (Route `reminder-sweep`,
 * Zeit-Lauf `event-reminders`): ein Sweep nach dem anderen, und der spätere
 * liest erst, wenn der frühere seine Merker gesetzt hat. Seit BE-018 schützt
 * die feste Zeilen-Id ohnehin vor Doppeln; die Schlange spart die Arbeit
 * (Zusagen lesen, 409 kassieren) und hält die Zähler ehrlich.
 *
 * WARUM KEINE LAUF-SPERRE MIT EIGENER TABELLE (`core/shared/runLease.ts`):
 * sie bräuchte im Pool-Projekt eine neue Tabelle samt Migration, und decken
 * würde sie nur das Fenster von Sekunden, in dem beim Neuladen der alte und
 * der neue Prozess beide leben. Innerhalb eines Prozesses ist diese Kette die
 * Sperre; zwischen Prozessen ist es die feste Zeilen-Id je Erinnerung, und
 * `firstRunMs` des Zeit-Laufs legt dessen ersten Takt weit hinter das Ende
 * des alten Prozesses. Single-Instanz-Annahme wie bei allen Sweeps hier.
 */
let reminderQueue: Promise<unknown> = Promise.resolve()

function inReminderQueue<T>(work: () => Promise<T>): Promise<T> {
  const run = reminderQueue.then(work, work)
  // Die Kette selbst darf nie abgelehnt sein, sonst übersprängen spätere
  // Glieder ihre Arbeit — der Fehler gehört dem Aufrufer, nicht der Kette.
  reminderQueue = run.catch(() => {})
  return run
}

/**
 * Feste Zeilen-Id der Erinnerung je (Termin, Empfänger, Beginn) — der
 * Idempotenz-Schlüssel für `notify()` (Muster `pastDueNoticeRowId`, onboarding).
 * Der BEGINN gehört hinein, damit ein verschobener Termin erneut erinnern KANN.
 * `evrem-` + 30 Hex = 36 Zeichen: Appwrites Grenze, nur erlaubte Zeichen,
 * Anfang ein Buchstabe. Liegt hier und nicht in `shared/`, weil nur der
 * Server sie braucht und `node:crypto` nicht in den Browser gehört.
 */
export function eventReminderRowId(eventId: string, userId: string, startAt: string): string {
  const digest = createHash('sha256').update(`${eventId}|${userId}|${startAt}`).digest('hex')
  return `evrem-${digest.slice(0, 30)}`
}

/** Was die Arbeit je Termin von ihrer Umgebung braucht — Admin-Client oder Datentür. */
interface ReminderPort {
  /** Alle Zusagen (`going`) des Termins. */
  listGoing: (eventId: string) => Promise<EventRsvpRow[]>
  /** Den Versand-Merker setzen. */
  markSent: (eventId: string, at: string) => Promise<void>
  /** Eine Erinnerung schreiben (Ablage-Felder kennt nur der Aufrufer). */
  notify: (input: Omit<NotifyInput, 'scope' | 'communityId'>) => Promise<NotifyResult>
}

interface ReminderOutcome {
  recipients: number
  reminded: number
  errors: number
}

/**
 * DIE ARBEIT JE TERMIN, EINMAL für beide Wege: Zusagen lesen ⇒ je Zusage eine
 * Erinnerung mit fester Zeilen-Id ⇒ Merker, wenn niemand an einer STÖRUNG
 * scheiterte (`created: false` ohne `duplicate` und ohne `skipped`, oder ein
 * Wurf). Eine Dublette ist kein Fehler und kein `reminded` — die Erinnerung
 * steht schon da; ebenso eine Zusage, deren Konto inzwischen aus der Community
 * entfernt ist (`skipped`, MM1 b). Ein Lesefehler lässt den Termin für den nächsten Takt liegen.
 */
async function remindEvent(row: EventRow, port: ReminderPort, nowIso: string, dryRun: boolean): Promise<ReminderOutcome> {
  const outcome: ReminderOutcome = { recipients: 0, reminded: 0, errors: 0 }
  let rsvps: EventRsvpRow[]
  try {
    rsvps = await port.listGoing(row.$id)
  }
  catch {
    outcome.errors++
    return outcome
  }
  outcome.recipients = rsvps.length
  if (dryRun) return outcome

  // Rohwert statt fertigem Text (BE-018): Zeitpunkt + Zone DES TERMINS. Zone
  // und Sprache wählt erst, wer liest — Glocke und Mail (core/shared/notificationWhen.ts).
  const body = encodeNotificationWhen(row.startAt, row.timezone)
  let failed = 0
  for (const rsvp of rsvps) {
    try {
      const sent = await port.notify({
        recipientId: rsvp.userId,
        type: 'reminder',
        title: row.title,
        body,
        link: `/events/${row.$id}`,
        rowId: eventReminderRowId(row.$id, rsvp.userId, row.startAt),
      })
      if (sent.created) outcome.reminded++
      // Bewusst nicht geschrieben (Empfänger aus der Community entfernt, MM1 b)
      // ist wie die Dublette KEINE Störung — sonst bliebe der Termin fällig
      // und der Lauf fragte jede Stunde wieder.
      else if (!sent.duplicate && !sent.skipped) failed++
    }
    catch {
      failed++
    }
  }
  outcome.errors += failed
  if (failed > 0) return outcome

  try {
    await port.markSent(row.$id, nowIso)
  }
  catch {
    // Ohne Merker bleibt der Termin fällig; der nächste Takt läuft für jede
    // Zusage in die Dublette — keine zweite Erinnerung, nur Arbeit.
    outcome.errors++
  }
  return outcome
}

async function doSweep(event: H3Event): Promise<void> {
  // Datentür als Operator: der Aufruf sweept die fälligen Termine SEINES
  // Mandanten — list scopet, update belegt die Zugehörigkeit. Die Suche der
  // Zusagen je Termin bleibt eventId-gebunden (eventId ist mandantenbelegt).
  const db = tenantDb(event, { as: 'operator' })
  const now = Date.now()

  const due = await db.list<EventRow>(EVENTS_TABLE, [
    Query.equal('status', 'published'),
    Query.greaterThan('startAt', new Date(now).toISOString()),
    Query.lessThanEqual('startAt', new Date(now + REMINDER_LEAD_MS).toISOString()),
    Query.isNull('remindersSentAt'),
    Query.limit(10),
  ])

  const port: ReminderPort = {
    listGoing: eventId => listAllScopedRsvps(db, eventId),
    markSent: async (eventId, at) => { await db.update(EVENTS_TABLE, eventId, { remindersSentAt: at }) },
    // scope 'tenant' (C15): die Route läuft im Request eines Mandanten-Hosts —
    // die Erinnerung gehört in DESSEN Glocke, ihr Link gilt auch nur dort.
    notify: input => notify(event, { ...input, scope: 'tenant' }),
  }
  for (const row of due.rows) await remindEvent(row, port, new Date(now).toISOString(), false)
}

/** Alle going-RSVPs eines Events — cursor-paginiert DURCH die Tür (Ersatz
 *  für listAllRows, das den rohen Client bräuchte). */
async function listAllScopedRsvps(db: TenantDb, eventId: string): Promise<EventRsvpRow[]> {
  const all: EventRsvpRow[] = []
  let cursor: string | null = null
  while (true) {
    const queries = [
      Query.equal('eventId', eventId),
      Query.equal('status', 'going'),
      Query.limit(100),
      ...(cursor === null ? [] : [Query.cursorAfter(cursor)]),
    ]
    const rows: EventRsvpRow[] = (await db.list<EventRsvpRow>(EVENT_RSVPS_TABLE, queries)).rows
    all.push(...rows)
    if (rows.length < 100) return all
    cursor = rows.at(-1)!.$id
  }
}

// ── DER ZEIT-LAUF ÜBER ALLE COMMUNITIES (OPS-003, seit 2026-11-16) ──────────

/**
 * So viele fällige Termine fasst EIN Lauf höchstens an. Ein Lauf liest alle
 * Zusagen jedes Termins und schreibt je Zusage eine Benachrichtigung (bei
 * `instant` auch eine Mail) — ohne Deckel wüchse ein einzelner Takt mit der
 * Zahl der Communities ins Unbegrenzte und überlappte den nächsten. 200 liegt
 * weit über dem, was heute in 24 h ansteht; der Rest kommt im nächsten Takt
 * (der Termin bleibt fällig, bis er beginnt), und `dueEvents === 200` im Log
 * zeigt, dass der Deckel gegriffen hat.
 */
export const EVENT_REMINDER_RUN_CAP = 200

/** Seitengröße beim Lesen der fälligen Termine. */
const DUE_PAGE = 100

export interface EventReminderSweepResult {
  /** Verschiedene Communities mit mindestens einem fälligen Termin (Silo: das eine Projekt). */
  communities: number
  /** Fällige Termine, die dieser Lauf angefasst hat (höchstens EVENT_REMINDER_RUN_CAP). */
  dueEvents: number
  /** Zusagen (`going`) dieser Termine — wer eine Erinnerung bekommt bzw. bekäme. */
  recipients: number
  /** Tatsächlich geschriebene Erinnerungen; im Zähl-Modus immer 0. */
  reminded: number
  /** Fehler je Termin oder Empfänger — sie halten den Lauf nicht an. */
  errors: number
}

/** Eine Termin-Zeile mit Mandanten-Stempel (Pool: `communities.tenantId`, Silo: fehlt). */
type StampedEventRow = EventRow & { communityId?: string | null }

function tenancyEnabled(): boolean {
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  return appConfig.pukalani?.tenancy?.enabled === true
}

/**
 * Alle Communities in einem Lauf, OHNE Request — Muster Digest-Sweep
 * (core/server/utils/emailDigest.ts).
 *
 * AUSSERHALB DER DATENTÜR, BEWUSST: ein Sweep ist per Definition
 * mandantenübergreifend (tenant-isolation, „AUSSERHALB der Tür erlaubt").
 * Er liegt deshalb in `server/utils`, wo der Admin-Client hingehört, und
 * nicht im Plugin — der richtige Ort statt einer `eslint-disable`-Zeile
 * (dieselbe Wahl wie bei den Sweeps in comments, market und brand).
 *
 * DER MANDANT KOMMT AUS DER ZEILE: im Pool trägt jede Termin-Zeile den
 * Stempel, den die Datentür beim Anlegen setzt (`communityId` =
 * `communities.tenantId`, `scopeRowFor`). Genau diesen Wert erwartet
 * `notify()` als `communityId` — die Erinnerung landet in der Glocke IHRER
 * Community, nicht in der „unbekannt"-Ablage. Im Silo (Mandanten-Auflösung
 * aus) gibt es keinen Stempel, das Projekt IST die Grenze; `notify()` legt
 * dann ab wie beim bisherigen Sweep.
 *
 * Die Arbeit je Termin ist `remindEvent` oben (dieselbe wie beim Route-Weg):
 * Zusagen lesen, benachrichtigen, Merker zuletzt. `dryRun` liest nur und
 * schreibt nichts.
 *
 * Ein Lesefehler der Termin-Liste wirft (der Zeit-Lauf meldet `failed`);
 * Fehler bei EINEM Termin oder Empfänger werden gezählt.
 */
export function sweepAllEventReminders(options: { dryRun: boolean }): Promise<EventReminderSweepResult> {
  return inReminderQueue(() => sweepAll(options.dryRun))
}

async function sweepAll(dryRun: boolean): Promise<EventReminderSweepResult> {
  const result: EventReminderSweepResult = { communities: 0, dueEvents: 0, recipients: 0, reminded: 0, errors: 0 }
  const config = useRuntimeConfig()
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient()
  const pooled = tenancyEnabled()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Erst die ganze Liste (bis zum Deckel), dann die Arbeit: der Merker
  // nimmt bearbeitete Termine aus dem Filter, und ein Cursor über eine
  // schrumpfende Menge ist keine Grundlage, auf die man sich verlässt.
  const due: StampedEventRow[] = []
  let cursor: string | null = null
  while (due.length < EVENT_REMINDER_RUN_CAP) {
    const rows: StampedEventRow[] = (await tablesDB.listRows<StampedEventRow>({
      databaseId,
      tableId: EVENTS_TABLE,
      queries: [
        Query.equal('status', 'published'),
        Query.greaterThan('startAt', new Date(now).toISOString()),
        Query.lessThanEqual('startAt', new Date(now + REMINDER_LEAD_MS).toISOString()),
        Query.isNull('remindersSentAt'),
        Query.orderAsc('startAt'),
        Query.limit(Math.min(DUE_PAGE, EVENT_REMINDER_RUN_CAP - due.length)),
        ...(cursor === null ? [] : [Query.cursorAfter(cursor)]),
      ],
    })).rows
    due.push(...rows)
    if (rows.length < DUE_PAGE) break
    cursor = rows.at(-1)!.$id
  }
  due.splice(EVENT_REMINDER_RUN_CAP)

  result.dueEvents = due.length
  result.communities = new Set(due.map(row => row.communityId || '')).size

  for (const row of due) {
    const communityId = row.communityId || ''
    // Im Pool ohne Stempel wüsste niemand, in WESSEN Glocke die Erinnerung
    // gehört — `notify()` legte sie fail-open in jede Glocke des Empfängers,
    // mit einem Link, der auf keinem Host gilt. Die Datentür stempelt jede
    // neue Zeile; so eine Zeile ist ein Datenfehler und wird gezählt, nicht
    // geraten. Kein Merker: sie fällt mit ihrem Beginn von selbst aus dem Fenster.
    if (pooled && !communityId) {
      result.errors++
      continue
    }

    const outcome = await remindEvent(row, {
      listGoing: eventId => listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [
        Query.equal('eventId', eventId),
        Query.equal('status', 'going'),
      ]),
      markSent: async (eventId, at) => {
        await tablesDB.updateRow({ databaseId, tableId: EVENTS_TABLE, rowId: eventId, data: { remindersSentAt: at } })
      },
      // scope 'tenant' (C15) mit dem Stempel DER ZEILE: ohne Request kennt
      // notify() keinen Mandanten. Im Silo bleibt der Wert leer, dann gilt
      // dieselbe Ablage wie beim Route-Weg.
      notify: input => notify(undefined, { ...input, scope: 'tenant', ...(communityId ? { communityId } : {}) }),
    }, nowIso, dryRun)
    result.recipients += outcome.recipients
    result.reminded += outcome.reminded
    result.errors += outcome.errors
  }
  return result
}

/**
 * EIN TAKT des Zeit-Laufs `event-reminders` (das Plugin ruft nur diese
 * Funktion). Abgeschaltetes Produkt (Not-Aus in app_config, Entitlement) ⇒
 * `'skipped'`: wer das Produkt abschaltet, will auch keine Erinnerungen mehr
 * aus dem Hintergrund. Geprüft wird je Takt und nicht vor dem Anmelden, weil
 * der Schalter sich zur Laufzeit ändert und das Manifest in einem eigenen
 * Plugin registriert wird, das nicht sicher vorher läuft.
 *
 * Im Zähl-Modus GENAU EINE Zeile `events.reminder_count` je Takt, auch bei
 * lauter Nullen — die Zahlen sind der Vergleich mit dem alten Zeitplan. Nur
 * Zahlen: keine Titel, keine Ids, keine Adressen.
 */
export async function runEventReminderJob(mode: EventReminderJobMode): Promise<'skipped' | undefined> {
  if (!await isProductEnabled(undefined, 'events')) return 'skipped'
  const result = await sweepAllEventReminders({ dryRun: mode === 'count' })
  const counts = {
    communities: result.communities,
    dueEvents: result.dueEvents,
    recipients: result.recipients,
    reminded: result.reminded,
    errors: result.errors,
  }
  if (mode === 'count') {
    logEvent('info', 'events.reminder_count', counts)
  }
  else if (result.reminded || result.errors) {
    // Im Versand-Modus still bei „nichts zu tun" — die `job.run`-Zeile
    // belegt den Takt schon.
    logEvent('info', 'events.reminders_sent', counts)
  }
  return undefined
}
