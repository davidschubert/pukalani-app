import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  handleCandidate,
  isValidHandle,
  normalizeHandle,
  suggestHandleBase,
} from '../../shared/handles'
import {
  accountHandlePermissions,
  handleAudienceIncludes,
  handleAudienceWith,
  handleAudienceWithout,
} from '../../shared/accountHandleAudience'
import { ACCOUNT_HANDLES_TABLE, type AccountHandleRow } from '../../shared/types/handle'

/**
 * DER KONTO-WEITE @NAME (AH-7, 2026-08-11) — der EINE Dienst dafür.
 *
 * Davids Entscheidung (DECISION-LOG 2026-08-11, Punkt 11): eine Pukalani-ID,
 * EIN Handle, überall. Die Tabelle `account_handles` (system-031) trägt den
 * eindeutigen Index auf `handleLower` ALLEIN — global, ohne Mandanten-Spalte.
 *
 * ── WARUM HIER KEIN `tenantDb()` STEHT ─────────────────────────────────────
 * Die Datentür scopt JEDEN Zugriff auf eine `communityId` — Filter beim Lesen,
 * Stempel beim Schreiben. Für eine Tabelle OHNE diese Spalte ist das kein
 * Schutz, sondern ein Fehler: der Filter fände nie eine Zeile, und der Stempel
 * schriebe eine Spalte, die es nicht gibt. Ein konto-weites Register ist per
 * Definition mandantenübergreifend — dieselbe Ausnahme, unter der auch die
 * GDPR-Orchestrierung und die Sweeps arbeiten (CLAUDE.md, „AUSSERHALB der Tür
 * erlaubt"). Der ESLint-Backstop gegen rohes `.tablesDB` gilt für
 * `server/api/**` und `server/plugins/**` der GEPOOLTEN Layer; core steht dort
 * bewusst nicht.
 *
 * DIE GRENZE IST DAMIT NICHT WEG, SIE IST NUR WOANDERS: sie sitzt in den
 * Row-Permissions (eine Lese-Rolle je Mitgliedschaft, siehe
 * shared/accountHandleAudience.ts). Zwei Leser nutzen sie unterschiedlich:
 *  - Das Erwähnungs-MENÜ liest mit dem SESSION-Client — Appwrite selbst gibt
 *    nur heraus, was diese Community sehen darf (`search.get.ts`).
 *  - Die AUFLÖSUNG liest mit dem Admin-Client (sie muss auch Zeilen finden,
 *    die niemand sehen darf, um sie dann zu VERWERFEN) und filtert die
 *    Zugehörigkeit hier im Code — `handleAudienceIncludes`.
 *
 * ── UND WARUM DER ADMIN-CLIENT ÜBERHAUPT ──────────────────────────────────
 * Wie schon bei `community_handles`: die Tabelle trägt keine Tabellen-Rechte,
 * ein Browser kann dort nichts anlegen. Der Handle ist eine Zusage des Systems
 * („du bist ab jetzt erwähnbar"), keine Zeile, die man selbst schreiben
 * können soll — sonst liefen Sperrfrist, Zeichensatz und Reservierungsliste
 * ins Leere.
 *
 * ── WAS AH-7 AN H1 ÄNDERT (und was nicht) ─────────────────────────────────
 * H1 (2026-08-05) hat `community_handles` eine Mitglieder-Wache gegeben, weil
 * ein Fremder sonst in JEDER Community einen Namen belegen konnte — `@vorstand`
 * war pool-weit automatisiert wegschnappbar. Diese Wache entfällt hier, und
 * zwar nicht aus Nachlässigkeit: ein Konto kann im globalen Register genau
 * EINEN Namen halten. Der Angriff „500 Communities, 500 Namen" ist damit nicht
 * abgesichert, sondern nicht mehr formulierbar. Erhalten bleibt die andere
 * Hälfte von H1: SICHTBAR wird der Name nur dort, wo der Mensch Mitglied ist.
 */

/** Wie viele Kandidaten (`david`, `david2`, …) probiert die Vergabe? */
const MAX_ASSIGN_ATTEMPTS = 12

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/** Tabelle + Datenbank an einem Ort — jeder Zugriff hier geht darüber. */
function accountHandleDb(event: H3Event | undefined) {
  const { tablesDB } = createAdminClient(event)
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  return { tablesDB, databaseId, tableId: ACCOUNT_HANDLES_TABLE }
}

/** Pool-Kontext des Requests: „geteiltes Projekt?" + „welche Community?". */
function audienceContext(event: H3Event): { pool: boolean, communityId: string } {
  const tenant = useTenant(event)
  const pool = tenant?.mode === 'pool'
  return { pool, communityId: pool ? (tenant?.communityId ?? '') : '' }
}

/**
 * Die AKTIVE Zeile dieses Konts — oder null.
 *
 * Fail-soft: solange system-031 auf einer Instanz nicht gelaufen ist, soll
 * KEINE Seite deswegen 500 werfen; sie zeigt dann nur keinen Namen.
 */
export async function activeAccountHandleRow(event: H3Event, userId: string): Promise<AccountHandleRow | null> {
  if (!userId) return null
  const { tablesDB, databaseId, tableId } = accountHandleDb(event)
  try {
    const { rows } = await tablesDB.listRows<AccountHandleRow>({
      databaseId,
      tableId,
      queries: [Query.equal('userId', userId), Query.equal('status', 'active'), Query.limit(1)],
    })
    return rows[0] ?? null
  }
  catch {
    return null
  }
}

/**
 * „Sorge dafür, dass dieses Konto einen Namen hat" — idempotent, wirft nie.
 *
 * Davids Entscheidung von 2026-08-04 gilt unverändert: automatisch vergeben,
 * niemand wird blockiert, jeder ist ab Tag 1 erwähnbar. Es gibt keinen Zustand
 * „hat noch keinen Handle, muss erst wählen".
 *
 * DIE MECHANIK IST DER UNIQUE-INDEX, nicht ein Vorab-Blick: erst nachsehen und
 * dann schreiben wäre bei zwei gleichzeitigen Anmeldungen ein Rennen mit zwei
 * Gewinnern. Hier wird blind geschrieben, ein 409 heisst „jemand war
 * schneller" — dann kommt der nächste Kandidat dran.
 *
 * `changedAt` bleibt bei der automatischen Vergabe LEER: die 30-Tage-Sperrfrist
 * soll nicht verbraucht sein, bevor der Mensch seinen Namen gesehen hat.
 *
 * Vergibt auf JEDEM Host, auch auf dem Kontroll-Host ohne Community — der Name
 * gehört dem Konto (siehe Kopf). Das PUBLIKUM kommt getrennt dazu, und nur für
 * Mitglieder: `ensureAccountHandleAudience`.
 */
export async function ensureAccountHandle(
  event: H3Event,
  userId: string,
  displayName: string,
): Promise<string | null> {
  if (!userId) return null
  // Ein fremder Mensch bekommt hier nichts vergeben: die Vergabe ist die
  // Nebenwirkung einer eigenen Handlung, nie eine über Dritte.
  if (userId !== event.context.user?.$id) return null

  try {
    const existing = await activeAccountHandleRow(event, userId)
    if (existing) return existing.handle

    const { tablesDB, databaseId, tableId } = accountHandleDb(event)
    // NUR `pool` — die Community des aktuellen Hosts geht die Anlage bewusst
    // nichts mehr an (siehe die Permissions unten).
    const { pool } = audienceContext(event)
    const base = suggestHandleBase(displayName)

    for (let attempt = 1; attempt <= MAX_ASSIGN_ATTEMPTS; attempt++) {
      // Ab dem sechsten Versuch ist die Instanz offensichtlich voller `david`s
      // — dann eine Zufallszahl statt weiter zu zählen, sonst laufen
      // gleichzeitige Anmeldungen immer wieder in dieselbe Reihenfolge.
      const index = attempt <= 5 ? attempt : 100 + Math.floor(Math.random() * 9900)
      const candidate = handleCandidate(base, index)
      if (!isValidHandle(candidate)) continue

      try {
        const row = await tablesDB.createRow<AccountHandleRow>({
          databaseId,
          tableId,
          rowId: 'unique()',
          data: {
            userId,
            handle: candidate,
            handleLower: candidate,
            status: 'active',
            changedAt: '',
          },
          // OHNE Community-Label — auch auf einem Mandanten-Host (Gegenprobe
          // 2026-08-12, Abschnitt 8). Die Vergabe läuft auf JEDEM Host und
          // fragt NICHT nach Mitgliedschaft: `handle.get.ts` gatet erst NACH
          // dem Anlegen. Stünde hier `communityId`, bekäme ein Fremder allein
          // durch das Öffnen seiner Kontoseite auf fremdem Host das Publikum
          // dieser Community — sein Name stünde dort im Erwähnungs-Menü.
          // EINZIGER Schreiber von `read(label:…)` bleibt das
          // mitgliedschafts-gegatete `ensureAccountHandleAudience`.
          permissions: accountHandlePermissions(pool, '', userId),
        })
        return row.handle
      }
      catch (error) {
        // 409 = der eindeutige Index hat gegriffen: Name ist vergeben (auch als
        // FRÜHERER Name eines anderen Menschen). Nächster Kandidat.
        if (hasCode(error, 409)) continue
        throw error
      }
    }
    return null
  }
  catch {
    return null
  }
}

/**
 * „Diese Community darf den Namen sehen" — idempotent, wirft nie.
 *
 * Der Aufrufer prüft die ZUGEHÖRIGKEIT, bevor er das ruft; hier steht nur der
 * Schreibvorgang. Er schreibt NUR, wenn die Rolle wirklich fehlt
 * (`handleAudienceWith` gibt sonst `null`) — die Funktion liegt auf dem heissen
 * Pfad (jeder Beitrag), und eine bedingungslose Aktualisierung wäre eine
 * Schreiblast ohne Wirkung.
 */
export async function ensureAccountHandleAudience(event: H3Event, userId: string): Promise<void> {
  const { pool, communityId } = audienceContext(event)
  if (!pool || !communityId) return

  try {
    const row = await activeAccountHandleRow(event, userId)
    if (!row) return
    const next = handleAudienceWith(row.$permissions, pool, communityId)
    if (!next) return

    const { tablesDB, databaseId, tableId } = accountHandleDb(event)
    await tablesDB.updateRow({ databaseId, tableId, rowId: row.$id, permissions: next })
  }
  catch {
    // Fail-soft: fehlt das Publikum, ist der Mensch im Erwähnungs-MENÜ nicht
    // zu sehen — erwähnbar bleibt er, wer den Namen tippt, trifft ihn. Ein
    // Beitrag darf daran nicht scheitern.
  }
}

/**
 * Das Gegenstück: eine Community verliert den Blick auf den Namen. Gerufen,
 * wenn der Zugang entzogen wird (A5, `revokeCommunityLabel`).
 *
 * ES WIRD NICHTS GELÖSCHT — der Name gehört dem Konto und bleibt ihm. Es
 * verschwindet nur die Sichtbarkeit dort, wo der Mensch nicht mehr dazugehört.
 * Alle Zeilen dieses Kontos, auch die `former`-Zeilen: eine frühere
 * Schreibweise soll in einer fremden Community nicht länger auftauchen als die
 * aktuelle.
 *
 * „ALLE" HEISST SEIT AU2 (2026-08-15) WIRKLICH ALLE. Vorher stand hier ein
 * einzelnes `Query.limit(25)` ohne Schleife: wer öfter als 25-mal umbenannt
 * hatte, behielt in den ÄLTESTEN Zeilen das Lese-Publikum einer Community, aus
 * der er längst entfernt war — genau die Zusage, die der Absatz darüber macht,
 * fiel damit still aus. Der Zuschnitt sah harmlos aus, weil eine Historie
 * langsam wächst (eine Zeile je 30 Tage); ein Entzug, der bei Zeile 26 aufhört,
 * ist trotzdem kein Entzug.
 */

/** Wie viele Zeilen eine Seite trägt. */
const AUDIENCE_PAGE_SIZE = 100
/**
 * Ein hartes Ende für die Schleife (10 000 Zeilen). Es ist nicht der
 * Normalfall, sondern das Netz: diese Funktion ist fail-soft und läuft im
 * Request eines Rollen-Entzugs — sie darf unter keinen Umständen zu einer
 * Endlosschleife werden, falls die Abfrage wider Erwarten immer dieselbe Seite
 * liefert.
 */
const AUDIENCE_MAX_PAGES = 100

export async function revokeAccountHandleAudience(
  // `undefined` = ohne Request (stündlicher Label-Abgleich, SEC-024): der
  // Admin-Client und die Runtime-Config kommen dann aus der App selbst.
  event: H3Event | undefined,
  userId: string,
  communityId: string,
): Promise<void> {
  if (!userId || !communityId) return
  try {
    const { tablesDB, databaseId, tableId } = accountHandleDb(event)

    // Cursor statt Offset: die Schleife SCHREIBT, während sie liest. Die
    // Aktualisierung ändert nur die Permissions — nicht `userId`, nicht die
    // Sortierung —, ein Cursor bleibt dabei gültig, während ein Offset bei
    // jeder Seitengrenze Zeilen überspringen könnte.
    let cursor: string | undefined
    for (let page = 0; page < AUDIENCE_MAX_PAGES; page++) {
      const { rows } = await tablesDB.listRows<AccountHandleRow>({
        databaseId,
        tableId,
        queries: [
          Query.equal('userId', userId),
          Query.limit(AUDIENCE_PAGE_SIZE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      })
      if (rows.length === 0) return

      for (const row of rows) {
        const next = handleAudienceWithout(row.$permissions, communityId)
        if (!next) continue
        await tablesDB.updateRow({ databaseId, tableId, rowId: row.$id, permissions: next })
      }

      // Kürzere Seite als angefragt ⇒ es gibt keine weitere.
      if (rows.length < AUDIENCE_PAGE_SIZE) return
      cursor = rows[rows.length - 1]?.$id
      if (!cursor) return
    }
  }
  catch {
    // Fail-soft wie die Vergabe. Der Entzug des LABELS ist die eigentliche
    // Grenze (A5); dies hier räumt nur die Anzeige nach.
  }
}

/**
 * `handleLower` → `userId` für eine Liste von Kandidaten, aus dem KONTO-
 * Register.
 *
 * FILTERT DEN STATUS BEWUSST NICHT: eine Erwähnung in einem zwei Jahre alten
 * Beitrag trägt den DAMALIGEN Namen und soll weiterhin auf denselben Menschen
 * zeigen (Historien-Zeile). Mit einem `status`-Filter liefe jede Erwähnung von
 * vor einer Umbenennung stillschweigend ins Leere.
 *
 * FILTERT DIE ZUGEHÖRIGKEIT SEHR WOHL: nur wer in DIESER Community ist, kann
 * hier gemeint sein. Ohne diesen Schritt wäre ein Beitrag ein Fernzünder —
 * `@fremder-name` in einer beliebigen Community, und die Benachrichtigung geht
 * an jemanden, der von dieser Community nie gehört hat. Im Pool war das früher
 * unmöglich, weil die Tabelle selbst mandantengebunden war; die Grenze musste
 * beim Umzug ins globale Register also mitgenommen werden.
 */
export async function accountHandleOwners(
  event: H3Event,
  handleLowers: readonly string[],
): Promise<Map<string, string>> {
  if (handleLowers.length === 0) return new Map()

  const { pool, communityId } = audienceContext(event)
  const { tablesDB, databaseId, tableId } = accountHandleDb(event)

  try {
    const { rows } = await tablesDB.listRows<AccountHandleRow>({
      databaseId,
      tableId,
      queries: [Query.equal('handleLower', [...handleLowers]), Query.limit(handleLowers.length)],
    })
    const map = new Map<string, string>()
    for (const row of rows) {
      if (!handleAudienceIncludes(row.$permissions, pool, communityId)) continue
      map.set(row.handleLower, row.userId)
    }
    return map
  }
  catch {
    return new Map()
  }
}

/**
 * Die AKTIVEN Namen VIELER Menschen (Person → Handle) — EINE Abfrage für alle,
 * nie eine je Person (ein Posteingang hat schnell 50 Gegenüber).
 *
 * OHNE Publikums-Filter, und das ist Absicht: gefragt wird hier immer nach
 * Menschen, deren Zeile der Aufrufer ohnehin schon in der Hand hält (der
 * Absender einer Nachricht, der Autor eines Kommentars). Den Namen zu
 * verschweigen, während Name und Avatar danebenstehen, wäre eine Grenze, die
 * nichts schützt.
 */
export async function accountHandlesForUsers(
  event: H3Event,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(userIds.filter(Boolean))]
  if (wanted.length === 0) return new Map()

  const { tablesDB, databaseId, tableId } = accountHandleDb(event)
  const map = new Map<string, string>()
  try {
    // `Query.equal` fasst 100 Werte — in Stapeln, wie bei den Namen.
    for (let i = 0; i < wanted.length; i += 100) {
      const batch = wanted.slice(i, i + 100)
      const { rows } = await tablesDB.listRows<AccountHandleRow>({
        databaseId,
        tableId,
        queries: [Query.equal('userId', batch), Query.equal('status', 'active'), Query.limit(batch.length)],
      })
      for (const row of rows) map.set(row.userId, row.handle)
    }
    return map
  }
  catch {
    return map
  }
}

/**
 * Den Namen wechseln. Die REGELN (Sperrfrist, Zeichensatz, reservierte Namen)
 * prüft die Route — hier steht nur der Schreibvorgang, und der ist unverändert
 * die Umsetzung von Davids Entscheidungen 3+4 vom 2026-08-04:
 *
 *   NEUE Zeile anlegen, ALTE auf 'former' setzen. Die alte wird NICHT gelöscht.
 *
 * Reihenfolge mit Absicht: erst die neue Zeile (sie kann am eindeutigen Index
 * scheitern — dann ist nichts passiert), danach die alte umstellen. Andersherum
 * stünde jemand nach einem Fehlschlag ganz ohne aktiven Namen da.
 *
 * DAS PUBLIKUM ZIEHT MIT: die neue Zeile erbt die Lese-Rollen der alten,
 * sonst verschwände der Mensch mit dem Umbenennen aus jedem Erwähnungs-Menü,
 * bis er irgendwo wieder schreibt.
 *
 * Gibt `null` zurück, wenn der Name inzwischen vergeben ist (409) — die Route
 * macht daraus einen fachlichen Ablehnungsgrund.
 */
export async function changeAccountHandle(
  event: H3Event,
  userId: string,
  nextHandle: string,
): Promise<AccountHandleRow | null> {
  const { tablesDB, databaseId, tableId } = accountHandleDb(event)
  // NUR `pool` — die Umbenennung vergibt kein Publikum mehr, sie erbt (unten).
  const { pool } = audienceContext(event)
  const lower = normalizeHandle(nextHandle)
  const previous = await activeAccountHandleRow(event, userId)

  // Derselbe Name wie bisher: nichts tun und die Sperrfrist nicht verbrauchen.
  if (previous && previous.handleLower === lower) return previous

  // GEERBT, NICHT DAZUVERDIENT (Gegenprobe 2026-08-12, Abschnitt 9).
  // Erben ist richtig: ein legitimes Publikum stammt aus dem
  // mitgliedschafts-gegateten `ensureAccountHandleAudience` und soll das
  // Umbenennen überleben. Das Publikum des AKTUELLEN Hosts hier zusätzlich zu
  // vergeben wäre aber genau dieselbe Lücke wie bei der Anlage: die
  // Umbenennung fragt nicht nach Mitgliedschaft, also könnte sich ein Fremder
  // per Namenswechsel auf fremdem Host in deren Erwähnungs-Menü schreiben.
  // Ist er Mitglied, steht das Label längst in `previous` und reist mit.
  const inherited = previous?.$permissions ?? accountHandlePermissions(pool, '', userId)
  const permissions = [...inherited]

  let created: AccountHandleRow
  try {
    created = await tablesDB.createRow<AccountHandleRow>({
      databaseId,
      tableId,
      rowId: 'unique()',
      data: {
        userId,
        handle: nextHandle.trim().replace(/^@+/, ''),
        handleLower: lower,
        status: 'active',
        changedAt: new Date().toISOString(),
      },
      permissions,
    })
  }
  catch (error) {
    if (hasCode(error, 409)) return null
    throw error
  }

  if (previous) {
    // Fail-soft: bliebe das hier stecken, hätte der Mensch zwei aktive Zeilen.
    // Unschön, aber harmlos — beide lösen auf ihn auf, und
    // `activeAccountHandleRow` nimmt die erste. Der Wechsel selbst ist bereits
    // vollzogen und soll nicht an der Aufräumarbeit scheitern.
    await tablesDB.updateRow({ databaseId, tableId, rowId: previous.$id, data: { status: 'former' } })
      .catch(() => undefined)
  }

  return created
}
