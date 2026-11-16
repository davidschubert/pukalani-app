import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import type { EventReminderJobMode } from '../../shared/eventReminderJob'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow } from '../../shared/types/event'

/** Vorlauf der Erinnerung (Entscheidung David, EVENTS-V2 §8.2: 24 h) */
const REMINDER_LEAD_MS = 24 * 3600_000

/**
 * Reminder-Sweep OHNE Cron (Muster publishDuePosts): published-Events, die
 * innerhalb der nächsten 24 h starten und noch nicht erinnert wurden, lösen
 * eine In-App-Notification an alle Zusager aus (Core-Vertrag notify()).
 *
 * Idempotenz: remindersSentAt wird ZUERST gesetzt (dann erst notify) und
 * der Sweep läuft in-memory serialisiert — parallele GETs derselben Instanz
 * erinnern nie doppelt (Cross-Instanz akzeptiert, Muster Rate-Limit/Locks).
 * Best-effort: ein Fehler hier darf den auslösenden GET nie scheitern lassen.
 * Trade-off dokumentiert (EVENTS-V2 §4): besucht niemand die Seite, feuert
 * nichts. Lückenschluss war die scheduled Function auf
 * POST /api/events/reminder-sweep — die bediente aber nur EINE Community.
 * Seit OPS-003 (2026-11-16) geht der Zeit-Lauf `event-reminders`
 * (`sweepAllEventReminders` unten) stündlich ALLE Communities durch.
 *
 * WER HANDELT (F17): KEIN `actor` — ein Sweep. Ausgelöst vom GET eines
 * beliebigen Lesers, geschrieben wird nur ein Versand-Merker auf fremden
 * Zeilen. Weder tritt der Leser dadurch der Community bei (A5), noch soll eine
 * Zahlungssperre die Erinnerung an einen Termin verschlucken, den die Zusager
 * längst im Kalender haben.
 */
export async function sweepEventReminders(event: H3Event): Promise<void> {
  // Läuft schon ein Sweep (beim Lesen ODER der Zeit-Lauf), wartet der GET
  // nicht dahinter: der laufende sieht dieselben fälligen Termine oder der
  // nächste Aufruf holt sie nach. Gleichzeitig lesen dürfen die beiden nie —
  // dafür steht die Warteschlange unten.
  if (reminderQueueBusy()) return
  await inReminderQueue(() => doSweep(event)).catch(() => {})
}

/**
 * EINE WARTESCHLANGE IM PROZESS für alle drei Auslöser (Sweep beim Lesen,
 * Route `reminder-sweep`, Zeit-Lauf `event-reminders`): ein Sweep nach dem
 * anderen, und der spätere liest erst, wenn der frühere seine Merker gesetzt
 * hat. Ohne sie hätten Zeit-Lauf und ein GET denselben Termin gleichzeitig
 * mit leerem `remindersSentAt` gelesen — beide hätten erinnert.
 *
 * WARUM KEINE LAUF-SPERRE MIT EIGENER TABELLE (`core/shared/runLease.ts`):
 * sie bräuchte im Pool-Projekt eine neue Tabelle samt Migration, und decken
 * würde sie nur das Fenster von Sekunden, in dem beim Neuladen der alte und
 * der neue Prozess beide leben. Innerhalb eines Prozesses ist diese Kette die
 * Sperre; zwischen Prozessen ist es der Merker je Termin (er steht VOR jeder
 * Benachrichtigung), und `firstRunMs` des Zeit-Laufs legt dessen ersten Takt
 * weit hinter das Ende des alten Prozesses. Single-Instanz-Annahme wie bei
 * allen Sweeps hier.
 */
let reminderQueue: Promise<unknown> = Promise.resolve()
let reminderQueueDepth = 0

function reminderQueueBusy(): boolean {
  return reminderQueueDepth > 0
}

function inReminderQueue<T>(work: () => Promise<T>): Promise<T> {
  reminderQueueDepth++
  const run = reminderQueue.then(work, work).finally(() => { reminderQueueDepth-- })
  // Die Kette selbst darf nie abgelehnt sein, sonst übersprängen spätere
  // Glieder ihre Arbeit — der Fehler gehört dem Aufrufer, nicht der Kette.
  reminderQueue = run.catch(() => {})
  return run
}

/** Text der Erinnerung — EINE Stelle für beide Sweeps, damit die Glocke gleich aussieht. */
function reminderBody(startAt: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(startAt))
}

async function doSweep(event: H3Event): Promise<void> {
  // Datentür als Operator: jeder GET sweept die fälligen Events SEINES
  // Mandanten (Muster publishDuePosts) — list scopet, update belegt die
  // Zugehörigkeit. Die RSVP-Suche pro Event bleibt eventId-gebunden
  // (eventId ist bereits mandantenbelegt).
  const db = tenantDb(event, { as: 'operator' })
  const now = Date.now()

  const due = await db.list<EventRow>(EVENTS_TABLE, [
    Query.equal('status', 'published'),
    Query.greaterThan('startAt', new Date(now).toISOString()),
    Query.lessThanEqual('startAt', new Date(now + REMINDER_LEAD_MS).toISOString()),
    Query.isNull('remindersSentAt'),
    Query.limit(10),
  ])

  for (const row of due.rows) {
    // Flag ZUERST — schlägt notify danach fehl, lieber eine verpasste
    // Erinnerung als Duplikate bei jedem weiteren GET
    await db.update(EVENTS_TABLE, row.$id, { remindersSentAt: new Date(now).toISOString() })

    const rsvps = await listAllScopedRsvps(db, row.$id)
    for (const rsvp of rsvps) {
      // Typ 'reminder' rendert die Bell als „Erinnerung: {title} beginnt
      // bald"; body = Startzeit als Text (notify speichert bewusst fertigen
      // Text, keine i18n-Keys)
      await notify(event, {
        recipientId: rsvp.userId,
        type: 'reminder',
        title: row.title,
        body: reminderBody(row.startAt),
        link: `/events/${row.$id}`,
        // scope 'tenant' (C15): der Sweep läuft im Request eines Mandanten-
        // Hosts (Muster publishDuePosts) — die Erinnerung gehört in DESSEN
        // Glocke, ihr Link (/events/:id) gilt auch nur dort.
        scope: 'tenant',
      })
    }
  }
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
 * Reihenfolge je Termin: erst die Zusagen lesen (ein Lesefehler lässt den
 * Termin für den nächsten Takt liegen), dann den Merker setzen, erst DANN
 * benachrichtigen — schlägt notify fehl, lieber eine verpasste Erinnerung als
 * eine doppelte. `dryRun` liest nur und schreibt nichts.
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

    let rsvps: EventRsvpRow[]
    try {
      rsvps = await listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [
        Query.equal('eventId', row.$id),
        Query.equal('status', 'going'),
      ])
    }
    catch {
      result.errors++
      continue
    }
    result.recipients += rsvps.length
    if (dryRun) continue

    try {
      await tablesDB.updateRow({
        databaseId,
        tableId: EVENTS_TABLE,
        rowId: row.$id,
        data: { remindersSentAt: new Date(now).toISOString() },
      })
    }
    catch {
      // Ohne Merker keine Erinnerung — sonst käme sie im nächsten Takt noch einmal.
      result.errors++
      continue
    }

    for (const rsvp of rsvps) {
      try {
        const sent = await notify(undefined, {
          recipientId: rsvp.userId,
          type: 'reminder',
          title: row.title,
          body: reminderBody(row.startAt),
          link: `/events/${row.$id}`,
          // scope 'tenant' (C15) mit dem Stempel DER ZEILE: ohne Request
          // kennt notify() keinen Mandanten. Im Silo bleibt der Wert leer,
          // dann gilt dieselbe Ablage wie beim bisherigen Sweep.
          scope: 'tenant',
          ...(communityId ? { communityId } : {}),
        })
        if (sent.created) result.reminded++
        else result.errors++
      }
      catch {
        result.errors++
      }
    }
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
