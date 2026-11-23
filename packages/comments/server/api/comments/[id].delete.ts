import { COMMENTS_TABLE, type Comment, type DeletedCommentResponse } from '../../../shared/types/comment'
import { COMMENT_TOMBSTONE_DATA, commentTombstonePermissions, toPublicCommentRow } from '../../utils/commentTombstone'
import { commentNotificationCommunityId, removeCommentNotifications } from '../../utils/commentNotifications'
import { softFailWith } from '../../../../core/server/utils/softFail'
import { pruneDeletedComment } from '../../utils/commentPrune'

/**
 * Soft-Delete (Spec): MIT Antworten bleibt die Row erhalten — Antworten
 * darunter bleiben erreichbar, die UI zeigt einen "[gelöscht]"-Platzhalter.
 * OHNE Antworten fällt sie danach ganz (KC2, `utils/commentPrune.ts`).
 *
 * WIRKLICH GELEERT (SEC-032, 2026-11-15 — Davids Entscheidung „Gelöschte
 * Kommentare, Übersetzungen und Vorschauen werden wirklich geleert"): bis
 * hierher schrieb diese Route nur `status: 'deleted'`. Text, Name, Konto-Id
 * und Übersetzungs-Cache blieben in der Zeile — direkt bei Appwrite und über
 * Realtime lesbar für jeden, der den Kommentar vorher lesen durfte. Jetzt
 * schreibt sie DENSELBEN Grabstein wie die Kontolöschung
 * (`utils/commentTombstone.ts`).
 *
 * WER BRAUCHT `authorId` NACH DEM LÖSCHEN? Geprüft, bevor sie geleert wird:
 * die Zähler (`user-counters.ts`, „Antworten", „erhaltene Upvotes") zählen
 * nur `status: 'active'`; „meine Aktivität" (`commentsAccountActivity.ts`)
 * lässt `deleted` aus; Stimmen, Reaktionen und Übersetzen lehnen einen nicht
 * aktiven Kommentar ab; die Moderation lehnt `deleted` ab (status.patch,
 * bulk). Die Konto-Id hat also nach dem Löschen keinen Leser mehr — und eine
 * Kontolöschung findet einen schon geleerten Kommentar nicht mehr, muss es
 * aber auch nicht: es gibt nichts mehr zu leeren.
 */
export default defineEventHandler(async (event): Promise<DeletedCommentResponse> => {
  // SEC-030: nur Mitglieder dieser Community (ein Pool-Konto ist auf jedem
  // Community-Host angemeldet). Bewusst KEIN Beitritt — den eigenen Kommentar zu löschen macht
  // niemanden zum Mitglied. 401 ohne Konto, 403 `not_a_member` für Fremde.
  const user = await requireCommunityMembership(event)

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  // Löschen bleibt bei deaktivierten Kommentaren erlaubt — nur Wartung friert es ein
  await assertNotMaintenance(event)

  const db = tenantDb(event)

  // Status-Guard (Parität zum Patch): nur AKTIVE Kommentare sind löschbar.
  // Ohne die Sperre könnte der Autor einen vom Moderator ausgeblendeten
  // Kommentar per hidden→deleted wieder sichtbar machen — der Listen-Filter
  // lässt deleted (als „[gelöscht]"-Platzhalter) durch, hidden nicht, und der
  // kaskadiert versteckte Subtree würde wieder erreichbar.
  // `get` der Tür belegt zugleich die Mandanten-Zugehörigkeit.
  const existing = await db.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (existing.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not deletable' })
  }

  /**
   * NUR DER AUTOR — GEPRÜFT VON DIESER ROUTE (SEC-002, GA1 P13). Bis hierher
   * schrieb Schritt 1 mit der Sitzung des Kontos, und Appwrites Zeilen-Recht
   * war der Beleg der Urheberschaft. Jetzt schreibt der Server; der Vergleich
   * hier, VOR dem ersten Schreibvorgang, ist die einzige Grenze. Gast-
   * Kommentare tragen eine leere `authorId` und lassen sich nicht selbst
   * löschen.
   */
  if (!existing.authorId || existing.authorId !== user.$id) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  // `actor: 'member'`: gehandelt hat der Autor, die Inhalts-Sperre (M13) gilt
  // (Muster posts/[id].delete).
  const ops = tenantDb(event, { as: 'operator', actor: 'member' })

  /**
   * SCHRITT 1 — DATEN. Status und Leeren in EINEM Schreibvorgang, damit kein
   * Zustand „gelöscht, aber Text noch da" entsteht, den Realtime ausliefern
   * könnte.
   */
  let tombstone: Comment
  try {
    tombstone = await ops.update<Comment>(COMMENTS_TABLE, commentId, { ...COMMENT_TOMBSTONE_DATA }, 'Comment not found')
  }
  catch (error) {
    throw toH3Error(error, 'Comment could not be deleted')
  }

  /**
   * SCHRITT 2 — RECHTE: trägt die Zeile noch `update`/`delete` für den Autor
   * (Bestand aus der Zeit vor SEC-002), fallen sie hier; das Lese-Publikum
   * bleibt. Neue Zeilen tragen diese Rechte nicht mehr, der Schritt entfällt
   * für sie von selbst.
   *
   * BEST EFFORT MIT RETRY UND LOG-ZEILE (wie Phase 2 des Ausblendens): der
   * Text ist in Schritt 1 schon weg. Ein Fehler hier ließe dem Autor nur das
   * Recht, in seinen eigenen, leeren Grabstein per Roh-REST zu schreiben —
   * die Liste zeigt von einem gelöschten Kommentar ohnehin nur den
   * Platzhalter. Ein 500 an dieser Stelle hätte dagegen alles schlechter
   * gemacht: der nächste Versuch endet am 409 oben, der Nutzer sähe einen
   * Fehler für ein Löschen, das geschehen ist.
   */
  const permissions = commentTombstonePermissions(tombstone.$permissions, existing.authorId)
  if (permissions.length !== tombstone.$permissions.length) {
    const withdraw = () => ops.updatePermissions<Comment>(COMMENTS_TABLE, commentId, permissions, 'Comment not found')
    await withdraw()
      .catch(softFailWith('comments:api/comments/[id].delete:withdraw', () => withdraw()))
      .then((row) => { tombstone = row })
      .catch((error) => {
        console.error(`[comments] Rechte-Entzug am gelöschten Kommentar ${commentId} fehlgeschlagen — der Autor behält Schreibrecht auf den leeren Grabstein:`, error)
      })
  }

  /**
   * Der Feed-Eintrag trägt einen eigenen Schnappschuss des Textes
   * (`metadata.snippet`, index.post.ts) — ohne diesen Schritt stünde der
   * gelöschte Satz dort weiter. Best-effort im Core-Vertrag (wirft nie, loggt).
   */
  await removeActivitiesForObject(event, { objectType: 'comment', objectId: commentId })

  /**
   * Dasselbe für die Glocken anderer Menschen: `reply`/`mention` tragen denselben
   * Auszug. Sie entstehen seit SEC-032 unter einer festen Id aus Kommentar und
   * Empfänger und sind darüber sicher zuzuordnen (utils/commentNotifications.ts;
   * Meldungen von davor bleiben, siehe dort). Die Konto-Id kommt aus `existing`
   * — der Grabstein hat sie schon geleert. Kein `parentAuthorId`: Gast-
   * Kommentare lassen sich nicht selbst löschen. Wirft nie, loggt.
   */
  await removeCommentNotifications(event, {
    commentId,
    communityId: commentNotificationCommunityId(event),
    authorId: existing.authorId,
  })

  /**
   * OHNE ANTWORTEN GANZ WEG (KC2, `utils/commentPrune.ts`): hängt nichts am
   * Grabstein, fällt die Zeile — und ein gelöschter Eltern-Kommentar, der
   * dadurch kinderlos wird, gleich mit. Erst NACH Feed und Glocke oben, damit
   * deren Aufräumen den Kommentar noch findet. `removedIds` sagt dem Browser,
   * was er aus der Liste nimmt; leer = der Platzhalter bleibt (mit Antworten).
   */
  const removedIds = await pruneDeletedComment(event, tombstone)

  return { ...toPublicCommentRow(tombstone), removedIds }
})
