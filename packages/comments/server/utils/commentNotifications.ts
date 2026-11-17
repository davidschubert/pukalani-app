import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * MELDUNGEN MIT AUSZUG — eine feste Id je Kommentar, damit sie wieder gehen
 * können (SEC-032, 2026-11-15 — Davids Entscheidung „Gelöschte Kommentare,
 * Übersetzungen und Vorschauen werden wirklich geleert").
 *
 * `reply`, `mention` und `reply.guest` tragen im `body` den Anfang des
 * Kommentars (`commentSnippet`). Löscht die Autorin ihn oder blendet die
 * Moderation ihn aus, stand dieser Satz bis hierher weiter in FREMDEN Glocken:
 * die Zeilen ließen sich keinem Kommentar zuordnen — der Link zeigt auf die
 * SEITE, die Row-Id war zufällig. Über Absender + Seite + Text zu suchen,
 * träfe nach einer Bearbeitung nicht mehr und bei gleichem Text den falschen.
 *
 * Deshalb entsteht jede dieser Meldungen unter einer FESTEN Row-Id aus
 * (Typ, Community, Kommentar, Empfänger) — dasselbe Muster wie
 * `postMentionNotificationId` im posts-Layer. Nebenwirkung, gewollt: die Id
 * ist zugleich der Idempotenz-Schlüssel von `notify()`. Pro Kommentar und
 * Empfänger gibt es ohnehin höchstens eine Meldung je Typ; ein zweiter
 * Versuch (Retry) wäre ein 409 und damit weder Zeile noch Mail. Eine zweite
 * ANTWORT ist ein anderer Kommentar und damit eine andere Id — „eine Antwort
 * auf denselben Kommentar meldet zweimal" (Kopf von `notify()`) bleibt wahr.
 *
 * Geräumt wird über den Core-Vertrag `removeObjectNotifications`
 * (core/server/utils/notificationCleanup.ts) — dort auch, warum am
 * Admin-Client vorbei und was mit dem Bestand von vor dem 2026-11-15 ist.
 */

/** Die Typen dieses Layers, die einen Auszug tragen. */
export type CommentNotificationType = 'reply' | 'mention' | 'reply.guest'

/** Typen MIT Absender — sie findet die Räumung über `senderId`. */
const SENT_TYPES: ReadonlySet<string> = new Set<CommentNotificationType>(['reply', 'mention'])

export interface CommentNotificationKey {
  /** Ablage-Wert der Community (`commentNotificationCommunityId`), im Silo `''`. */
  communityId: string
  commentId: string
  recipientId: string
  type: string
}

/**
 * Die feste Row-Id. Gehasht, weil vier Werte zusammen länger sind als die 36
 * Zeichen einer Appwrite-Row-Id; der Präfix hält den Anfang frei von
 * Sonderzeichen (3 + 32 = 35 Zeichen, nur `[a-z0-9]`). Der Typ steht IM Hash:
 * Antwort und Erwähnung an dieselbe Person sind zwei Zeilen.
 */
export function commentNotificationRowId(key: CommentNotificationKey): string {
  const digest = createHash('sha256')
    .update(`${key.type}|${key.communityId}|${key.commentId}|${key.recipientId}`)
    .digest('hex')
  return `cmn${digest.slice(0, 32)}`
}

/**
 * Welcher Community-Wert in die Id geht: im Pool der Mandant des Requests,
 * im Silo `''` (die Instanz IST die Community) — dieselbe Zeile wie bei den
 * Erwähnungen in Beiträgen. Schreiben und Räumen fragen beide HIER, damit
 * beide Seiten nachweislich dieselbe Zahl benutzen.
 */
export function commentNotificationCommunityId(event: H3Event): string {
  const tenant = useTenant(event)
  return tenant?.mode === 'pool' ? tenant.tenantId : ''
}

export interface RemoveCommentNotificationsInput {
  commentId: string
  communityId: string
  /** Konto der Autorin; `''` bei einem Gast-Kommentar. */
  authorId: string
  /**
   * Autor des Eltern-Kommentars — nur für `reply.guest` nötig: die Gast-
   * Antwort hat keinen Absender, ihr einziger möglicher Empfänger ist er.
   */
  parentAuthorId?: string | null
}

/**
 * Entfernt die Meldungen EINES Kommentars aus den Glocken anderer Menschen —
 * über den Core-Vertrag `removeObjectNotifications`
 * (core/server/utils/notificationCleanup.ts; dort stehen Suche, Zugriff am
 * Admin-Client vorbei an der Datentür, Bestand und Fehlerverhalten). Hier
 * bleibt das Produktwissen: welche Typen zu einem Kommentar gehören und wie
 * ihre feste Id entsteht.
 *
 *  - MIT Absender (`reply`, `mention`): der Core sucht über `senderId` und
 *    entscheidet über die Id aus `commentNotificationRowId`.
 *  - OHNE Absender (`reply.guest`): der Empfänger ist bekannt (Eltern-Autor),
 *    die Id also berechenbar — direkt löschen, 404 heißt „nichts da".
 *
 * KONTOLÖSCHUNG ruft das NICHT: `reply.guest` hat keinen Absender, aber einen
 * Gast, dessen Konto gelöscht werden könnte, gibt es nicht.
 */
export async function removeCommentNotifications(
  event: H3Event,
  input: RemoveCommentNotificationsInput,
): Promise<number> {
  const rowIdFor = (type: string, recipientId: string) =>
    commentNotificationRowId({ communityId: input.communityId, commentId: input.commentId, recipientId, type })
  return removeObjectNotifications(event, {
    kind: 'comment',
    objectId: input.commentId,
    senderId: input.authorId,
    rowIdFor: (type, recipientId) => (SENT_TYPES.has(type) ? rowIdFor(type, recipientId) : null),
    directRowIds: !input.authorId && input.parentAuthorId ? [rowIdFor('reply.guest', input.parentAuthorId)] : [],
  })
}
