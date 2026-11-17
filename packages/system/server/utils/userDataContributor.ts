import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * GDPR-Contributor des system-Layers (Vertrag: core/server/utils/userData.ts)
 * — der erste Server-Code in diesem Layer (bisher reiner Schema-Owner).
 *
 * notifications: Export als Empfänger; Löschung als Empfänger UND als
 * Verursacher (per senderId, Migration system-008 — Alt-Rows ohne senderId
 * sind die akzeptierte E8-Lücke: nur der Empfänger kann sie lesen, sie
 * sterben mit dessen Löschung).
 *
 * audit_logs: PSEUDONYMISIERUNG statt Löschung (Art. 17 (3) e — Audit-
 * Integrität): actorName/ip/metadata.name leeren, actorId + Struktur
 * bleiben (nach users.delete keinem Menschen mehr zuordenbar); targetName
 * für Logs, die auf den User zeigen, ebenfalls leeren. Plan §4.6.
 * `actorId`/`targetId` bleiben dabei als PSEUDONYMES Protokoll stehen, bis
 * der Fristen-Lauf des Core den Eintrag 12 Monate nach dem Schreiben löscht
 * (`core/server/utils/auditLogRetention.ts`, EL1 c).
 * Seit SEC-026 (2026-11-15) steht das Protokoll auch in der AUSKUNFT
 * (`auditLog`): als Handelnde mit Aktion, Ziel-Art, Zeit und IP; als Ziel nur
 * Aktion und Zeit — Name und IP des handelnden Betreibers sind ein Datum über
 * jemand anders.
 *
 * activities (Migration 014): Export + Hard-Delete als Verursacher (per
 * actorId, idx_actor) — Feed-Einträge sind reine Verhaltens-Daten, es gibt
 * keinen Empfänger. Die Auskunft trägt seit SEC-026 auch `actorName` und
 * `metadata` (dort steht der eigene Text-Ausschnitt der Person).
 *
 * instance_secrets (Migration system-036): nur `updatedBy` — wer einen
 * Instanz-Schlüssel zuletzt gesetzt hat — wird auf '' geleert, die Zeile
 * bleibt (sie IST die Konfiguration). Gelesen werden AUSSCHLIESSLICH `$id`
 * und `updatedBy` (`Query.select`): die Werte sind Geheimnisse und gehören in
 * keine Auskunft, kein Log und nicht einmal in den Speicher dieses Pfads. Die
 * Tabelle gibt es nicht auf jeder Instanz (`listAllRowsIfTableExists`);
 * gefiltert wird im Code, so hängt nichts an der Abfragbarkeit der Spalte. Query degradiert auf leere Menge, solange die Table
 * auf einer Instanz noch nicht existiert (Migration ausstehend).
 *
 * LESEFEHLER SIND FEHLER (SEC-026, Teil 2): „degradiert" heisst seither GENAU
 * „die Tabelle fehlt" (`listAllRowsIfTableExists`, Appwrite-404 für die
 * Tabelle). Vorher stand dort `.catch(() => [])` — ein 500 wurde zu „keine
 * Zeilen", die Löschung meldete Erfolg, das Konto verschwand und der Name
 * blieb, ohne dass ein zweiter Lauf ihn noch finden konnte.
 *
 * community_handles (Migration 029) + account_handles (Migration 031, AH-7):
 * Export + Hard-Delete, über ALLE Communities (der Mensch kann im Alt-Bestand
 * in mehreren einen Namen haben) und über beide Status — auch die
 * 'former'-Zeilen, denn ein früherer Name ist genauso ein personenbezogenes
 * Datum wie der aktuelle.
 *
 * BEIDE Tabellen, und das ist kein Übergangszustand: seit AH-7 (2026-08-11)
 * ist `account_handles` die Wahrheit, `community_handles` bleibt als
 * Alt-Bestand LESBAR (alte Erwähnungen lösen darüber auf). Ein Name in der
 * einen Tabelle ist genau so personenbezogen wie in der anderen — wer nur die
 * neue räumte, liesse `@davidschubert` in der alten stehen.
 *
 * DAS GIBT DEN NAMEN WIEDER FREI, und das ist eine bewusste Abwägung gegen
 * Davids Entscheidung 4 („der alte Handle bleibt gesperrt"). Diese Sperre
 * schützt vor Verwechslung nach einer UMBENENNUNG; hier wird das Konto
 * gelöscht. Die Alternative wäre ein Grabstein, der `davidschubert` für immer
 * aufbewahrt — also genau die personenbezogene Zeichenkette, die zu löschen
 * war, und `deleteUserCompletely` löscht das Konto nur bei VOLL-Erfolg.
 * Der Rest-Fall ist klein und harmlos: eine alte Erwähnung löst danach auf
 * NIEMANDEN mehr auf und wird deshalb gar nicht erst hervorgehoben
 * (splitMentions ist fail-closed) — sie bleibt gewöhnlicher Text.
 */

type NotificationRow = Models.Row & { recipientId: string, type: string, title: string, body: string, link: string, read: boolean }
type AuditRow = Models.Row & { actorId: string, actorName: string, action: string, targetId: string, targetName: string, metadata: string, ip: string }
type AuditExportRow = AuditRow & { targetType: string }
/** Nur was `Query.select` lädt — nie der Wert des Geheimnisses. */
type SecretOwnerRow = Models.Row & { updatedBy?: string }
type ActivityRow = Models.Row & { actorId: string, actorName: string, type: string, objectType: string, objectId: string, link: string, metadata: string, visibility: string }
type HandleRow = Models.Row & { communityId: string, userId: string, handle: string, handleLower: string, status: string, changedAt: string }
type AccountHandleRow = Models.Row & { userId: string, handle: string, handleLower: string, status: string, changedAt: string }

const NOTIFICATIONS = 'notifications'
const AUDIT_LOGS = 'audit_logs'
const ACTIVITIES = 'activities'
const HANDLES = 'community_handles'
const ACCOUNT_HANDLES = 'account_handles'
const INSTANCE_SECRETS = 'instance_secrets'
/**
 * Nachweise einer Zustimmung (system-041, SEC-008): Auskunft mit Art, Fassung,
 * Zeitpunkt und Weg; bei der Kontolöschung fallen die Zeilen — ohne Konto
 * belegen sie nichts mehr. Die Tabelle gibt es erst nach der Migration
 * (`listAllRowsIfTableExists`).
 */
const CONSENT_RECORDS = 'consent_records'
type ConsentRow = Models.Row & { userId: string, kind: string, version: string, acceptedAt: string, way: string, source: string }

interface SystemUserDataExport {
  notifications: Array<{ type: string, title: string, body: string, link: string, read: boolean, createdAt: string }>
  activities: Array<{ type: string, actorName: string, objectType: string, objectId: string, link: string, metadata: string, createdAt: string }>
  /** Audit-Protokoll: als Handelnde vollständig, als Ziel ohne Daten des Handelnden. */
  auditLog: {
    asActor: Array<{ action: string, targetType: string, ip: string, createdAt: string }>
    asTarget: Array<{ action: string, createdAt: string }>
  }
  /** Wie viele Instanz-Schlüssel diese Person zuletzt gesetzt hat — nie die Werte. */
  instanceSecretsUpdated: number
  /** Alt-Bestand je Community (system-029). */
  handles: Array<{ communityId: string, handle: string, status: string, changedAt: string, createdAt: string }>
  /** Der konto-weite Name (system-031, AH-7) — aktiv und früher. */
  accountHandles: Array<{ handle: string, status: string, changedAt: string, createdAt: string }>
  consents: Array<{ kind: string, version: string, acceptedAt: string, way: string, source: string }>
}

/** Die `$id`s der Instanz-Schlüssel, die diese Person zuletzt gesetzt hat. */
async function listSecretsUpdatedBy(event: H3Event, userId: string): Promise<string[]> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const rows = await listAllRowsIfTableExists<SecretOwnerRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    INSTANCE_SECRETS,
    [Query.select(['$id', 'updatedBy'])],
  )
  return rows.filter(row => row.updatedBy === userId).map(row => row.$id)
}

export async function systemExportUserData(event: H3Event, userId: string): Promise<SystemUserDataExport> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const received = await listAllRows<NotificationRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    NOTIFICATIONS,
    [Query.equal('recipientId', userId)],
  )
  // Leer NUR, solange die Tabelle fehlt (Migration 014) — jeder andere
  // Lesefehler bricht den Export ab, statt ihn unvollständig zu liefern.
  const activities = await listAllRowsIfTableExists<ActivityRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    ACTIVITIES,
    [Query.equal('actorId', userId)],
  )
  // Dasselbe für Migration 029 …
  const handles = await listAllRowsIfTableExists<HandleRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    HANDLES,
    [Query.equal('userId', userId)],
  )
  // … und Migration 031.
  const accountHandles = await listAllRowsIfTableExists<AccountHandleRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    ACCOUNT_HANDLES,
    [Query.equal('userId', userId)],
  )
  // Audit-Protokoll vollständig (listAllRows wirft statt zu kappen). Die
  // Tabelle gehört dem system-Layer und existiert überall, wo er läuft.
  const auditAsActor = await listAllRows<AuditExportRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    AUDIT_LOGS,
    [Query.equal('actorId', userId), Query.orderAsc('$createdAt')],
  )
  const auditAsTarget = await listAllRows<AuditExportRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    AUDIT_LOGS,
    [Query.equal('targetId', userId), Query.equal('targetType', 'user'), Query.orderAsc('$createdAt')],
  )
  const secrets = await listSecretsUpdatedBy(event, userId)
  const consents = await listAllRowsIfTableExists<ConsentRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    CONSENT_RECORDS,
    [Query.equal('userId', userId)],
  )

  return {
    notifications: received.map(r => ({
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.read,
      createdAt: r.$createdAt,
    })),
    activities: activities.map(r => ({
      type: r.type,
      actorName: r.actorName,
      objectType: r.objectType,
      objectId: r.objectId,
      link: r.link,
      metadata: r.metadata,
      createdAt: r.$createdAt,
    })),
    auditLog: {
      asActor: auditAsActor.map(r => ({ action: r.action, targetType: r.targetType, ip: r.ip, createdAt: r.$createdAt })),
      asTarget: auditAsTarget.map(r => ({ action: r.action, createdAt: r.$createdAt })),
    },
    instanceSecretsUpdated: secrets.length,
    // Beide Status — ein FRÜHERER Name gehört genauso in die Auskunft.
    handles: handles.map(r => ({
      communityId: r.communityId,
      handle: r.handle,
      status: r.status,
      changedAt: r.changedAt,
      createdAt: r.$createdAt,
    })),
    accountHandles: accountHandles.map(r => ({
      handle: r.handle,
      status: r.status,
      changedAt: r.changedAt,
      createdAt: r.$createdAt,
    })),
    consents: consents.map(r => ({
      kind: r.kind,
      version: r.version ?? '',
      acceptedAt: r.acceptedAt,
      way: r.way,
      source: r.source ?? '',
    })),
  }
}

/**
 * Personenbezogene Felder aus dem metadata-JSON einer Audit-Zeile entfernen.
 *
 * `name`: `self_deleted` trug sonst den Klarnamen.
 * `email`: kam am 2026-08-02 dazu (Audit-Befund, GDPR). `user.created` legte
 * die Adresse des ANGELEGTEN Kontos dauerhaft ab; die Route tut das nicht mehr,
 * aber Bestands-Zeilen tragen sie noch — und ohne diesen Griff überlebte die
 * Adresse `deleteUserCompletely` als Klartext.
 *
 * Bewusst eine feste Feldliste und kein Heuristik-Scan: was pseudonymisiert
 * wird, muss man nachlesen können. Ein NEUES personenbezogenes metadata-Feld
 * gehört hier hinein — oder besser gar nicht erst ins Protokoll.
 */
const PERSONAL_METADATA_FIELDS = ['name', 'email'] as const

export function stripPersonalMetadata(metadata: string): string {
  if (!metadata) return ''
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    if (!PERSONAL_METADATA_FIELDS.some(field => field in parsed)) return metadata
    // Neu aufbauen statt löschen: die Feldnamen kommen aus einer Konstanten,
    // aber `delete obj[variable]` ist im Projekt per ESLint verboten (und die
    // Reihenfolge der verbleibenden Schlüssel bleibt so nachweislich erhalten —
    // daran hängt der Idempotenz-Vergleich mit dem alten String).
    const kept = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !(PERSONAL_METADATA_FIELDS as readonly string[]).includes(key)),
    )
    return Object.keys(kept).length ? JSON.stringify(kept) : ''
  }
  catch {
    // kein valides JSON → sicherheitshalber komplett leeren
    return ''
  }
}

export async function systemDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // Notifications als Empfänger → Hard-Delete. STRIKT: ein Fehler hier muss
  // die Löschung stoppen (deleteUserCompletely gated users.delete auf
  // Voll-Erfolg — ein geschluckter Fehler würde Erfolg melden, obwohl
  // Empfänger-Rows überleben).
  const received = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS, [Query.equal('recipientId', userId)])
  // Notifications als Verursacher → Hard-Delete. Ebenfalls STRIKT (SEC-026,
  // Teil 2): hier stand `.catch(() => [])` mit der Begründung, vor Migration
  // 008 fehle die senderId-Spalte. Dieselbe Zeile schluckte aber auch jeden
  // 500 — und 008 läuft längst überall. Eine Instanz OHNE die Spalte soll die
  // Löschung laut anhalten, nicht still die Hälfte überspringen.
  const sent = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS, [Query.equal('senderId', userId)])
  const notificationRows = new Map<string, NotificationRow>()
  for (const row of [...received, ...sent]) notificationRows.set(row.$id, row)
  for (const row of notificationRows.values()) {
    await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS, rowId: row.$id })
    deleted++
  }

  // Activity-Feed-Einträge als Verursacher → Hard-Delete. Der LIST-Query
  // degradiert NUR bei fehlender Tabelle (vor Migration 014 → leere Menge);
  // jeder andere Lesefehler und jeder Delete-Fehler stoppt die Löschung.
  const activities = await listAllRowsIfTableExists<ActivityRow>(tablesDB, databaseId, ACTIVITIES, [Query.equal('actorId', userId)])
  for (const row of activities) {
    await tablesDB.deleteRow({ databaseId, tableId: ACTIVITIES, rowId: row.$id })
    deleted++
  }

  // Handles über ALLE Communities und BEIDE Status → Hard-Delete (Begründung
  // und die bewusst hingenommene Folge stehen im Kopf dieser Datei). Der
  // LIST-Query degradiert nur bei fehlender Tabelle (vor Migration 029); alles
  // andere bleibt strikt, sonst meldete die Löschung Erfolg, während der Name
  // überlebt.
  const handles = await listAllRowsIfTableExists<HandleRow>(tablesDB, databaseId, HANDLES, [Query.equal('userId', userId)])
  for (const row of handles) {
    await tablesDB.deleteRow({ databaseId, tableId: HANDLES, rowId: row.$id })
    deleted++
  }

  // Dasselbe für das konto-weite Register (AH-7). Ohne diesen Griff überlebte
  // der Name die Löschung — und zwar der EINE, den der Mensch überall trug.
  const accountHandles = await listAllRowsIfTableExists<AccountHandleRow>(tablesDB, databaseId, ACCOUNT_HANDLES, [Query.equal('userId', userId)])
  for (const row of accountHandles) {
    await tablesDB.deleteRow({ databaseId, tableId: ACCOUNT_HANDLES, rowId: row.$id })
    deleted++
  }

  // Audit-Logs: Actor-Pseudonymisierung (Name, IP, personenbezogene metadata)
  const asActor = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('actorId', userId)])
  for (const row of asActor) {
    const nextMetadata = stripPersonalMetadata(row.metadata)
    if (row.actorName === '' && row.ip === '' && nextMetadata === row.metadata) continue // idempotent: schon sauber
    await tablesDB.updateRow({
      databaseId,
      tableId: AUDIT_LOGS,
      rowId: row.$id,
      data: { actorName: '', ip: '', metadata: nextMetadata },
    })
    anonymized++
  }

  // Audit-Logs, die auf den User ZEIGEN: targetName + personenbezogene metadata.
  //
  // Die metadata-Hälfte kam am 2026-08-02 dazu (Audit-Befund, GDPR): `user.created`
  // legte die E-MAIL des angelegten Kontos ab — und die steht in der Zeile des
  // ANLEGENDEN Admins, nicht in einer eigenen. Der Actor-Zweig oben griff sie
  // deshalb nie; sie überlebte die Löschung als Klartext. Die Route speichert
  // sie nicht mehr, dieser Griff räumt den Bestand.
  const asTarget = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('targetId', userId)])
  for (const row of asTarget) {
    const nextMetadata = stripPersonalMetadata(row.metadata)
    if (row.targetName === '' && nextMetadata === row.metadata) continue // idempotent
    await tablesDB.updateRow({ databaseId, tableId: AUDIT_LOGS, rowId: row.$id, data: { targetName: '', metadata: nextMetadata } })
    anonymized++
  }

  // Instanz-Schlüssel: nur den Verweis auf das Konto leeren (Kopf der Datei).
  // Kein Wert wird gelesen, geschrieben oder geloggt.
  for (const rowId of await listSecretsUpdatedBy(event, userId)) {
    await tablesDB.updateRow({ databaseId, tableId: INSTANCE_SECRETS, rowId, data: { updatedBy: '' } })
    anonymized++
  }

  // Nachweise der Zustimmung (SEC-008): gehören zum Konto und fallen mit ihm.
  // Lesefehler sind Fehler; nur die fehlende Tabelle (vor system-041) heißt „nichts da".
  const consents = await listAllRowsIfTableExists<ConsentRow>(tablesDB, databaseId, CONSENT_RECORDS, [Query.equal('userId', userId)])
  for (const row of consents) {
    await tablesDB.deleteRow({ databaseId, tableId: CONSENT_RECORDS, rowId: row.$id })
    deleted++
  }

  return { deleted, anonymized }
}
