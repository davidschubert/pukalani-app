import { AppwriteException, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { evidenceStillProtected } from '../../shared/messageReport'
import { messagePreview, otherParticipant } from '../../shared/conversations'
import {
  CONVERSATIONS_TABLE,
  CONVERSATION_MEMBERS_TABLE,
  MESSAGES_TABLE,
  MESSAGE_BLOCKS_TABLE,
  type Conversation,
  type ConversationMember,
  type MessageBlock,
  type PrivateMessage,
} from '../../shared/types/message'

/**
 * GDPR-CONTRIBUTOR DES messages-LAYERS (Konzept § 6, Vertrag
 * `core/server/utils/userData.ts`).
 *
 * BEWUSST AUSSERHALB DER DATENTÜR: GDPR ist user-zentriert und per Definition
 * mandantenübergreifend — die Daten eines Menschen müssen über ALLE
 * Communities exportiert und gelöscht werden (CLAUDE.md, Ausnahmenliste).
 * Dieselbe Bauart wie `postsUserData.ts` und `comments/…/userDataContributor.ts`.
 *
 * ── EINE NACHRICHT GEHÖRT ZWEI MENSCHEN ──────────────────────────────────
 * Das ist die ganze Schwierigkeit dieses Abschnitts, und beide Hälften sind
 * entschieden:
 *
 * EXPORT = Möglichkeit (B): der VOLLSTÄNDIGE Verlauf aller Konversationen, an
 * denen die Person beteiligt ist, mit dem Gegenüber reduziert auf Anzeigename
 * und User-Id. Die Leitplanke dahinter: *exportiert wird, was die Person im
 * Produkt ohnehin sehen kann.* Ein eingehender Text ist auch ihr Datum — er
 * ist an sie gerichtet —, und ein Export, der ihn weglässt, erfüllt Art. 15
 * eher formal als tatsächlich. NICHT exportiert wird, was im Produkt nicht
 * sichtbar ist (E-Mail-Adresse, Vertrauensstufe, Zähler des Gegenübers).
 *
 * LÖSCHUNG = Möglichkeit (B): eigene Nachrichten HART löschen, die des
 * Gegenübers bleiben. Das Argument, mit dem `comments` Grabsteine baut, gilt
 * hier NICHT — eine Konversation ist eine flache Liste, keine Baumstruktur; es
 * gibt nichts, was zerreißt. Ein Grabstein machte den Verlauf zur Reihe von
 * Löchern und hinterließe eine dauerhafte Spur der Gesprächsführung des
 * Löschenden. Die ganze Konversation zu löschen (Möglichkeit C) ist
 * ABGELEHNT: das nähme dem Gegenüber seine eigenen Texte, ohne sein Zutun.
 *
 * ── DIE EINE BEFRISTETE AUSNAHME ─────────────────────────────────────────
 * Ein EINGEFRORENER BELEG (§ 2.2) überlebt die Löschung 90 Tage ab der
 * Meldung — Art. 17 Abs. 3 DSGVO nimmt die Geltendmachung von
 * Rechtsansprüchen vom Löschrecht aus, und der Beleg ist die Grundlage einer
 * womöglich verhängten Sperre. Dieselbe Begründung und dieselbe Frist wie bei
 * `abuse_reports.reporterEmail` (Davids Entscheidung vom 2026-08-02).
 *
 * Als Kriterium dient `reportedAt`, NICHT „ist die Meldung noch offen": das
 * Einfrieren passiert ausschließlich durch eine Meldung (Eskalations-Handler),
 * ein frischer Beleg gehört also per Konstruktion zu einer. Die Offenheit
 * zusätzlich zu prüfen verlangte einen mandanten-gescopten Blick in `reports`
 * — und genau den hat ein Lauf, der über alle Communities geht, nicht. Die
 * Frist ist die Grenze, nicht die Wartung.
 *
 * ── IDEMPOTENT ───────────────────────────────────────────────────────────
 * Der Vertrag verlangt es ausdrücklich: ein Re-Run nach Teilfehler findet
 * Restdaten oder nichts und endet erfolgreich. Bereits geleerte Nachrichten
 * werden übersprungen, bereits gelöschte Zeilen sind schlicht nicht mehr da.
 *
 * ── LESEN IST STRENG (SEC-026, Teil 2) ───────────────────────────────────
 * Jeder Lesevorgang hier trug ein `catch` auf leer bzw. `null`: ein 500 auf
 * `messages` hiess „dieser Mensch hat nie geschrieben", die Löschung meldete
 * Erfolg, das Konto verschwand — und die Nachrichten blieben, ohne dass ein
 * zweiter Lauf sie über das Konto noch fand. Die Tabellen gehören zum Layer
 * und existieren, wo er läuft: ein Lesefehler ist ein Fehler.
 */

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

function admin(event: H3Event) {
  const config = useRuntimeConfig(event)
  return { tablesDB: createAdminClient(event).tablesDB, databaseId: config.public.appwriteDatabaseId }
}

/* ── Export ──────────────────────────────────────────────────────────────── */

export async function messagesExportUserData(event: H3Event, userId: string) {
  const { tablesDB, databaseId } = admin(event)

  // ÜBER DIE MITGLIEDS-ZEILEN, nicht über die Teilnehmer-Spalte: die ist eine
  // Array-Spalte und in Appwrite nicht abfragbar (Kopf von
  // shared/types/message.ts). Dieselbe Einschränkung, derselbe Weg wie im
  // Posteingang.
  const memberships = await listAllRowsIfTableExists<ConversationMember>(tablesDB, databaseId, CONVERSATION_MEMBERS_TABLE, [
    Query.equal('userId', userId),
  ])

  const blocks = await listAllRowsIfTableExists<MessageBlock>(tablesDB, databaseId, MESSAGE_BLOCKS_TABLE, [
    Query.equal('blockerId', userId),
  ])

  const exported = []
  const partnerIds: string[] = []
  const rawConversations: { conversation: Conversation, messages: PrivateMessage[] }[] = []

  for (const membership of memberships) {
    // Eine Mitglieds-Zeile ohne Konversation (404) ist ein verwaister Rest,
    // kein Inhalt — sie fehlt im Export. Jeder andere Fehler bricht ab.
    const conversation = await tablesDB.getRow<Conversation>({
      databaseId, tableId: CONVERSATIONS_TABLE, rowId: membership.conversationId,
    }).catch((error: unknown) => {
      if (isNotFound(error)) return null
      throw error
    })
    if (!conversation) continue

    const messages = await listAllRowsIfTableExists<PrivateMessage>(tablesDB, databaseId, MESSAGES_TABLE, [
      Query.equal('conversationId', conversation.$id),
    ])

    rawConversations.push({ conversation, messages })
    partnerIds.push(otherParticipant(conversation.participants ?? [], userId))
  }

  // Die Namen des Gegenübers in EINEM gebündelten Aufruf — nie einer je
  // Konversation (`resolveUserNames` ist genau dafür gebaut).
  const names = await resolveUserNames(event, partnerIds.filter(Boolean))

  for (const { conversation, messages } of rawConversations) {
    const partnerId = otherParticipant(conversation.participants ?? [], userId)
    exported.push({
      // Das Gegenüber auf das reduziert, was im Produkt sichtbar ist —
      // dieselbe Linie wie bei der redigierten Team-Liste der About-Seite.
      partnerId,
      partnerName: names.get(partnerId) ?? '',
      startedByMe: conversation.starterId === userId,
      startedAt: conversation.$createdAt,
      lastMessageAt: conversation.lastMessageAt,
      messages: messages
        .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
        .map(message => ({
          mine: message.authorId === userId,
          body: message.body,
          sentAt: message.$createdAt,
          readAt: message.readAt,
        })),
    })
  }

  return {
    conversations: exported,
    // Die eigenen Sperren sind eine Entscheidung dieses Menschen und damit
    // sein Datum. Wer IHN gesperrt hat, steht bewusst NICHT hier — das wäre
    // die Auskunft, die § 2.3 ausschließt.
    blocks: blocks.map(row => ({ blockedId: row.blockedId, scope: row.scope, createdAt: row.$createdAt })),
  }
}

/* ── Löschung ────────────────────────────────────────────────────────────── */

export async function messagesDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const { tablesDB, databaseId } = admin(event)
  const now = new Date()
  let deleted = 0
  let anonymized = 0

  /**
   * Eigene Sperren: Hard-Delete in BEIDE Richtungen.
   *
   * Die selbst gesetzten sind Verhaltens-Daten dieses Menschen. Die GEGEN ihn
   * gesetzten fallen ebenfalls — sie sind ohne sein Konto gegenstandslos, und
   * eine Zeile, die auf eine gelöschte Person zeigt, ist genau die
   * Kontaktspur, an der `guest_authors` gescheitert ist.
   */
  for (const column of ['blockerId', 'blockedId'] as const) {
    const rows = await listAllRowsIfTableExists<MessageBlock>(tablesDB, databaseId, MESSAGE_BLOCKS_TABLE, [
      Query.equal(column, userId),
    ])
    for (const row of rows) {
      await tablesDB.deleteRow({ databaseId, tableId: MESSAGE_BLOCKS_TABLE, rowId: row.$id })
      deleted++
    }
  }

  /**
   * Eigene Nachrichten. Der Regelfall ist der harte Löschvorgang; die
   * Ausnahme ist der geschützte Beleg (siehe Kopf).
   */
  const mine = await listAllRowsIfTableExists<PrivateMessage>(tablesDB, databaseId, MESSAGES_TABLE, [
    Query.equal('authorId', userId),
  ])

  const touchedConversations = new Set<string>()
  for (const message of mine) {
    touchedConversations.add(message.conversationId)

    if (evidenceStillProtected(message.reportedAt ?? '', now)) {
      // Der BELEG bleibt, der lebende Text geht. `reportedBody` ist die
      // Grundlage einer laufenden Moderation; `body` ist es nicht — er wäre
      // nur die zweite Kopie desselben Satzes. Idempotent: ein zweiter Lauf
      // findet `body` bereits leer.
      if (message.body !== '') {
        await tablesDB.updateRow({
          databaseId, tableId: MESSAGES_TABLE, rowId: message.$id, data: { body: '' },
        })
      }
      anonymized++
      continue
    }

    await tablesDB.deleteRow({ databaseId, tableId: MESSAGES_TABLE, rowId: message.$id })
    deleted++
  }

  /**
   * Die eigenen Mitglieds-Zeilen fallen immer: sie tragen nur Zähler über
   * diesen Menschen und sind ohne ihn gegenstandslos. Ihr Verschwinden nimmt
   * ihm zugleich den Posteingang, den er ohnehin nicht mehr öffnen wird.
   */
  const memberships = await listAllRowsIfTableExists<ConversationMember>(tablesDB, databaseId, CONVERSATION_MEMBERS_TABLE, [
    Query.equal('userId', userId),
  ])
  for (const membership of memberships) {
    touchedConversations.add(membership.conversationId)
    await tablesDB.deleteRow({ databaseId, tableId: CONVERSATION_MEMBERS_TABLE, rowId: membership.$id })
    deleted++
  }

  /**
   * Die Konversation verschwindet, sobald keine Nachricht mehr darin steht —
   * genau Davids Formulierung. Steht noch eine des Gegenübers, BLEIBT sie:
   * sie ist dessen Erinnerung, und die Oberfläche zeigt dort „Dieses Konto
   * wurde gelöscht" (der Name löst nicht mehr auf).
   *
   * Die Rest-Abfrage ist STRENG: hier stand ein `catch` auf `null`, und ein
   * Lesefehler hiess „überspringen" — die leere Konversation blieb liegen,
   * während die Löschung Erfolg meldete.
   *
   * Die Löschungen dieses Abschnitts sammeln ihre Fehler, statt beim ersten
   * abzubrechen: ein 404 ist „schon weg" und damit Erfolg; jeder andere Fehler
   * wird gezählt, die übrigen (idempotenten) Aufräum-Schritte laufen zu Ende,
   * und am Schluss wirft EIN Fehler. Er nennt nur Anzahlen — keine Ids und
   * keinen Text, denn die Meldung landet im Log der Orchestrierung. Ein
   * zweiter Lauf räumt den Rest ab (das Konto bleibt bis dahin gesperrt).
   */
  let cleanupFailures = 0
  async function removeQuietly(tableId: string, rowId: string): Promise<void> {
    try {
      await tablesDB.deleteRow({ databaseId, tableId, rowId })
      deleted++
    }
    catch (error) {
      if (!isNotFound(error)) cleanupFailures++
    }
  }

  /**
   * DIE VORSCHAU IST EINE KOPIE DES LETZTEN TEXTES (SEC-032, 2026-11-15 —
   * „… Vorschauen werden wirklich geleert"). `appendMessage` schreibt sie aus
   * der jeweils letzten Nachricht in die Konversation — bleibt die
   * Konversation stehen, weil das Gegenüber auch geschrieben hat, stand dort
   * oft genau der Satz der gelöschten Person.
   *
   * Neu berechnet aus der neuesten VERBLEIBENDEN Nachricht, mit DERSELBEN
   * Funktion wie beim Schreiben (`messagePreview`), dazu `lastMessageAt`.
   * Ist die neueste verbleibende ein geschützter Beleg dieses Menschen, ist
   * ihr `body` oben schon geleert — die Vorschau wird dann leer, nicht der
   * Beleg-Text (`reportedBody` liest hier niemand).
   *
   * Nicht nachgeführt: `lastMessageAt` in den Mitglieds-Zeilen des
   * Gegenübers (Sortier-Spiegel des Posteingangs) — ein Zeitpunkt, kein Text.
   *
   * Idempotent: nur schreiben, was sich ändert. Fehler zählen wie die
   * Aufräum-Löschungen (404 = Konversation schon weg = Erfolg), der Lauf
   * meldet sich am Ende als unvollständig und ist wiederholbar.
   */
  async function refreshConversationPreview(conversationId: string, newest: PrivateMessage): Promise<void> {
    try {
      const conversation = await tablesDB.getRow<Conversation>({ databaseId, tableId: CONVERSATIONS_TABLE, rowId: conversationId })
      const preview = messagePreview(newest.body ?? '')
      const data: Partial<Pick<Conversation, 'lastMessagePreview' | 'lastMessageAt'>> = {}
      if ((conversation.lastMessagePreview ?? '') !== preview) data.lastMessagePreview = preview
      if ((conversation.lastMessageAt ?? '') !== newest.$createdAt) data.lastMessageAt = newest.$createdAt
      if (Object.keys(data).length === 0) return
      // Nicht in `anonymized` gezählt: die Zeile gehört der Konversation, nicht
      // diesem Menschen — gezählt wird, was über IHN gespeichert war.
      await tablesDB.updateRow({ databaseId, tableId: CONVERSATIONS_TABLE, rowId: conversationId, data })
    }
    catch (error) {
      if (!isNotFound(error)) cleanupFailures++
    }
  }

  for (const conversationId of touchedConversations) {
    // Die NEUESTE verbleibende Nachricht — sie beantwortet beide Fragen:
    // „bleibt die Konversation?" und „was zeigt ihre Vorschau jetzt?".
    const rest = await tablesDB.listRows<PrivateMessage>({
      databaseId, tableId: MESSAGES_TABLE,
      queries: [Query.equal('conversationId', conversationId), Query.orderDesc('$createdAt'), Query.limit(1)],
    })
    const newest = rest.rows[0]
    if (rest.total > 0 && newest) {
      await refreshConversationPreview(conversationId, newest)
      continue
    }

    // Auch die verbliebenen Mitglieds-Zeilen gehen mit — eine Zeile ohne
    // Konversation wäre ein Eintrag im Posteingang, der ins Leere führt.
    const orphans = await listAllRowsIfTableExists<ConversationMember>(tablesDB, databaseId, CONVERSATION_MEMBERS_TABLE, [
      Query.equal('conversationId', conversationId),
    ])
    for (const orphan of orphans) {
      await removeQuietly(CONVERSATION_MEMBERS_TABLE, orphan.$id)
    }

    // Idempotent: ein zweiter Lauf findet sie nicht mehr (404 = Erfolg).
    await removeQuietly(CONVERSATIONS_TABLE, conversationId)
  }

  if (cleanupFailures > 0) {
    throw new Error(`messages: ${cleanupFailures} Aufräum-Löschung(en) fehlgeschlagen, ${deleted} Zeile(n) entfernt — erneut ausführen`)
  }

  return { deleted, anonymized }
}
