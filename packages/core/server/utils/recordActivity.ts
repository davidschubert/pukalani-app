import { Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/** Table-Id des Activity-Streams (Schema: system-Migration 014). */
const ACTIVITIES_TABLE = 'activities'

/** Obergrenze der metadata-Spalte (Migration 014) — größere Payloads werden verworfen. */
const METADATA_MAX = 2000

export interface ActivityInput {
  /** Verursacher (User-$id) — GDPR-Löschung findet Einträge hierüber. */
  actorId: string
  /** Klarname zum Anzeigezeitpunkt (Snapshot, wie comments.authorName). */
  actorName: string
  /**
   * Ereignis-Typ, z. B. 'comment.created' — der Konsument (packages/activity)
   * übersetzt via i18n-Key `activity.types.<type>`. KEINE fertigen Sätze
   * speichern (Locale-Wechsel wirkt so rückwirkend, bewusste Abweichung
   * von notify()).
   */
  type: string
  /** Art des betroffenen Objekts, z. B. 'comment' */
  objectType: string
  /** $id des betroffenen Objekts */
  objectId: string
  /** Interner Ziel-Link (wird beim Rendern gegen Open-Redirect geguardet) */
  link: string
  /**
   * Kleine, JSON-serialisierbare Zusatzdaten für den i18n-Text (z. B.
   * { snippet: '…' }). Kein Freitext-Dump — die Spalte ist bewusst klein.
   */
  metadata?: Record<string, unknown>
}

/**
 * Schreibt einen Eintrag in den Activity-Feed (`activities`, system-Eigentum).
 * Best-effort: wirft NIE — ein fehlgeschlagener Feed-Eintrag darf den
 * auslösenden Request (z. B. das Erstellen eines Kommentars) nicht scheitern
 * lassen. Produkt-Layer rufen diesen Vertrag auf, statt selbst auf die Tabelle
 * zuzugreifen (kein Cross-Layer-String-Coupling, CONCEPT A14) — die UI-Welt
 * dazu liefert packages/activity.
 *
 * Sichtbarkeit: v1 immer 'members' (read für Role.users() im Silo, im Pool für
 * die Mitglieder DIESER Site). Der Spaltenwert 'public' ist im Schema
 * vorgesehen, wird aber bewusst NICHT verdrahtet (v2).
 *
 * DATENTÜR (C1b): `create` stempelt communityId (angelegt als tenantId in
 * system-021, umbenannt mit system-025/026 — der Kommentar hinkte bis
 * 2026-08-02 hinterher) und setzt die
 * Row-Permissions über tenantRowPermissions — im Pool Role.label(communityId) statt
 * Role.users(), sonst bekäme jedes eingeloggte Pool-Mitglied die Feed-Einträge
 * ALLER Communities (auch über Realtime, das genau an diesen Row-Rechten
 * hängt). `as:'operator'` ist fachlich nötig: `activities` trägt keine
 * Table-Permissions, geschrieben wird ausschließlich hier, server-seitig.
 *
 * WER HANDELT (F17): KEIN `actor` — und das ist die Absicht, obwohl der Feed
 * die Handlung eines Menschen protokolliert. Der Eintrag ist die SPUR einer
 * Handlung, die eine Zeile vorher schon durch die Sperre und den
 * Beitritts-Auslöser gegangen ist; ihn ein zweites Mal daran zu messen, hieße
 * nur, dass eine gesperrte oder gerade beitretende Community Löcher in ihrem
 * eigenen Protokoll bekommt. Aufrufer sind außerdem nicht nur Routen, sondern
 * auch Sweeps (publishDuePosts), wo gar niemand handelt.
 */
export async function recordActivity(event: H3Event, input: ActivityInput): Promise<void> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : ''
    // Zu große Payloads verwerfen statt abschneiden (abgeschnittenes JSON
    // wäre unparsebar) — der Feed-Eintrag bleibt ohne Zusatzdaten nutzbar.
    const safeMetadata = metadata.length > METADATA_MAX ? '' : metadata

    await tenantDb(event, { as: 'operator' }).create(ACTIVITIES_TABLE, {
      actorId: input.actorId,
      actorName: input.actorName,
      type: input.type,
      objectType: input.objectType,
      objectId: input.objectId,
      link: input.link,
      metadata: safeMetadata,
      visibility: 'members',
    }, {
      // 'members' = Role.users() im Silo, Role.label(communityId) im Pool.
      // Verwaltet (gelöscht) wird server-seitig via Admin-Client
      // (activity.manage-Route bzw. GDPR) — deshalb kein ownerUserId.
      read: 'members',
    })
  }
  catch {
    // best-effort — der auslösende Vorgang ist bereits passiert
  }
}

/**
 * Entfernt alle Feed-Einträge zu einem Objekt — das Gegenstück zu
 * recordActivity() für Moderations-/Lösch-Cascades: wegmoderierte Inhalte
 * dürfen nicht als metadata-Snippet im Activity-Feed weiterleben. Braucht
 * den Composite-Index idx_object (system-017). Best-effort wie
 * recordActivity, aber LAUT — ein liegengebliebener Eintrag ist ein
 * Inhalts-Leak, kein Kosmetikproblem. Ein späteres Restore erzeugt bewusst
 * KEINEN neuen Eintrag (der Feed ist ein Ereignis-Log, kein Index).
 *
 * BEWUSST OHNE MANDANTEN-FILTER (C1b) — die eine Ausnahme in dieser Datei:
 * gelöscht wird ausschließlich über `objectId`, und das ist eine GLOBAL
 * eindeutige Appwrite-Row-Id (dieselbe Begründung wie bei den Row-Id-basierten
 * Unique-Indizes, CLAUDE.md). Zwei Mandanten können denselben objectId gar
 * nicht tragen; der Filter könnte also nichts Fremdes schützen, würde aber
 * genau das verhindern, wofür die Funktion da ist: BESTANDS-Einträge ohne
 * tenantId (vor system-021 geschrieben) würden von ihrer eigenen Aufräumung
 * nicht mehr gefunden — wegmoderierter Inhalt bliebe als metadata-Snippet im
 * Feed stehen. Fail-closed wäre hier das Leck.
 *
 * BIS ZUR LEEREN SEITE (SEC-032, 2026-11-15): vorher hörte die Schleife nach
 * 10 × 25 Zeilen STILL auf — „pro Objekt nur eine Handvoll" war eine
 * Annahme, und ein Rest wäre ein Snippet im Feed, von dem niemand erfährt.
 * Jetzt wird gelesen, bis nichts mehr kommt (immer die ERSTE Seite: was
 * gelöscht ist, fällt aus der Ergebnismenge, ein Cursor zeigte ins Leere).
 * Der Deckel ist nur noch ein Notanker gegen eine Endlosschleife und LOGGT,
 * wenn er greift. Rückgabe ist die Zahl der entfernten Einträge, für Tests
 * und Aufrufer, die zählen wollen — werfen tut die Funktion weiterhin nicht:
 * das Löschen eines eigenen Kommentars darf nicht am Feed scheitern.
 */
const ACTIVITY_PAGE = 100
const ACTIVITY_HARD_CAP = 10_000

export async function removeActivitiesForObject(
  event: H3Event,
  input: { objectType: string, objectId: string },
): Promise<number> {
  let removed = 0
  try {
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const { tablesDB } = createAdminClient(event)
    while (removed < ACTIVITY_HARD_CAP) {
      const res = await tablesDB.listRows({
        databaseId,
        tableId: ACTIVITIES_TABLE,
        queries: [
          Query.equal('objectType', input.objectType),
          Query.equal('objectId', input.objectId),
          Query.limit(ACTIVITY_PAGE),
        ],
      })
      if (res.rows.length === 0) return removed
      await Promise.all(res.rows.map(row => tablesDB.deleteRow({
        databaseId,
        tableId: ACTIVITIES_TABLE,
        rowId: row.$id,
      })))
      removed += res.rows.length
      if (res.rows.length < ACTIVITY_PAGE) return removed
    }
    console.error(`[core] Activity-Cleanup für ${input.objectType} ${input.objectId} am Notanker (${ACTIVITY_HARD_CAP}) abgebrochen — weitere Einträge können im Feed sichtbar bleiben`)
  }
  catch (error) {
    console.error(`[core] Activity-Cleanup für ${input.objectType} ${input.objectId} fehlgeschlagen — Einträge können im Feed sichtbar bleiben:`, error)
  }
  return removed
}

/**
 * Zieht den Text-Schnappschuss (`metadata.snippet`) aller Feed-Einträge eines
 * Objekts nach — das Gegenstück zu `removeActivitiesForObject` für die
 * BEARBEITUNG (SEC-032, 2026-11-15). Der Eintrag ist ein Schnappschuss vom
 * Zeitpunkt des Schreibens; ohne diesen Schritt stand der ALTE Text im Feed
 * weiter da, auch nachdem ihn sein Autor geändert hatte — und gerade die
 * Korrektur eines versehentlich geteilten Satzes soll dort ankommen.
 *
 * Gleiche Bauart wie die Nachbarin: Lookup über `idx_object`, Admin-Client,
 * ohne Mandanten-Filter (gleiche Begründung). Nur Einträge, die schon einen
 * Schnappschuss tragen, werden angefasst — ein Eintrag ohne bekommt keinen
 * neuen (was dort steht, entscheidet `recordActivity`, nicht die
 * Bearbeitung). Best-effort mit Log-Zeile, Rückgabe = geänderte Einträge.
 */
export async function updateActivitySnippetForObject(
  event: H3Event,
  objectType: string,
  objectId: string,
  snippet: string,
): Promise<number> {
  let updated = 0
  try {
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const { tablesDB } = createAdminClient(event)
    let cursor: string | undefined
    let seen = 0
    while (seen < ACTIVITY_HARD_CAP) {
      const res = await tablesDB.listRows<Models.Row & { metadata?: string }>({
        databaseId,
        tableId: ACTIVITIES_TABLE,
        queries: [
          Query.equal('objectType', objectType),
          Query.equal('objectId', objectId),
          Query.limit(ACTIVITY_PAGE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      })
      for (const row of res.rows) {
        const metadata = parseMetadata(row.metadata)
        if (!metadata || typeof metadata.snippet !== 'string' || metadata.snippet === snippet) continue
        const next = JSON.stringify({ ...metadata, snippet })
        // Zu groß ⇒ ohne Zusatzdaten, wie beim Schreiben: lieber kein
        // Schnappschuss als der alte.
        await tablesDB.updateRow({
          databaseId,
          tableId: ACTIVITIES_TABLE,
          rowId: row.$id,
          data: { metadata: next.length > METADATA_MAX ? '' : next },
        })
        updated++
      }
      seen += res.rows.length
      if (res.rows.length < ACTIVITY_PAGE) return updated
      cursor = res.rows.at(-1)!.$id
    }
    console.error(`[core] Snippet-Nachzug für ${objectType} ${objectId} am Notanker (${ACTIVITY_HARD_CAP}) abgebrochen — ältere Einträge können den alten Text zeigen`)
  }
  catch (error) {
    console.error(`[core] Snippet-Nachzug für ${objectType} ${objectId} fehlgeschlagen — der Feed kann den alten Text zeigen:`, error)
  }
  return updated
}

/** metadata-JSON fail-soft lesen — kaputtes oder leeres JSON ist „kein Objekt". */
function parseMetadata(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

/** Zählerstände, die einen Meilenstein-Eintrag auslösen. */
export const MILESTONE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const

/**
 * Meilenstein in den Feed („Die Community hat 100 Mitglieder!") — Actor ist
 * 'system' (kein User; die GDPR-Löschung per actorId trifft ihn nie, die UI
 * rendert ein Konfetti-Icon statt Avatar). Best-effort wie recordActivity.
 * Race-Fenster akzeptiert (v1): zwei zeitgleiche Trigger könnten denselben
 * Meilenstein doppelt melden — objectId hält ihn für spätere Dedupe fest.
 */
export async function maybeRecordMilestone(
  event: H3Event,
  input: { type: 'milestone.members' | 'milestone.comments' | 'milestone.posts', count: number, link?: string },
): Promise<void> {
  if (!(MILESTONE_STEPS as readonly number[]).includes(input.count)) return
  await recordActivity(event, {
    actorId: 'system',
    actorName: '',
    type: input.type,
    objectType: 'milestone',
    objectId: `${input.type}:${input.count}`,
    link: input.link ?? '/',
    metadata: { count: input.count },
  })
}
