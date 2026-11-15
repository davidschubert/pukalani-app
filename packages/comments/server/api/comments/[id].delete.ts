import { AppwriteException } from 'node-appwrite'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'
import { COMMENT_TOMBSTONE_DATA, commentTombstonePermissions, toPublicCommentRow } from '../../utils/commentTombstone'
import { commentNotificationCommunityId, removeCommentNotifications } from '../../utils/commentNotifications'

/**
 * Soft-Delete (Spec): die Row bleibt erhalten — Antworten darunter bleiben
 * erreichbar, die UI zeigt einen "[gelöscht]"-Platzhalter.
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
export default defineEventHandler(async (event) => {
  // SEC-030: nur Mitglieder dieser Community (ein Pool-Konto ist auf jedem
  // Community-Host angemeldet). Bewusst KEIN Beitritt — den eigenen Kommentar zu löschen macht
  // niemanden zum Mitglied. 401 ohne Konto, 403 `not_a_member` für Fremde.
  await requireCommunityMembership(event)

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
   * SCHRITT 1 — DATEN über die Mitglieder-Klinke. Die Row-Security lässt nur
   * den Autor schreiben: gelingt dieser Schreibvorgang, IST die Urheberschaft
   * belegt (ein Fremder endet unten im 403, ohne dass etwas geschrieben
   * wurde). Status und Leeren in EINEM Schreibvorgang, damit kein Zustand
   * „gelöscht, aber Text noch da" entsteht, den Realtime ausliefern könnte.
   */
  let tombstone: Comment
  try {
    tombstone = await db.update<Comment>(COMMENTS_TABLE, commentId, { ...COMMENT_TOMBSTONE_DATA }, 'Comment not found')
  }
  catch (error) {
    // Row-Security-401 (nicht der Autor) → 403; echte 5xx nicht als 403 tarnen.
    if (error instanceof AppwriteException && error.code === 401) {
      throw createError({ status: 403, statusText: 'Forbidden' })
    }
    throw toH3Error(error, 'Comment could not be deleted')
  }

  /**
   * SCHRITT 2 — RECHTE über die Operator-Klinke: die `update`/`delete`-Rechte
   * des Autors fallen, das Lese-Publikum bleibt. Die Session kann das nicht
   * zuverlässig selbst: Appwrite lässt ein Konto nur Rollen vergeben, die es
   * selbst trägt, und das Publikum einer Zeile (ein Community-Label, bei
   * Betreiber-Zielen `label:admin`/`label:moderator`) gehört nicht immer dazu.
   * Erst NACH Schritt 1 — der Admin-Client umgeht die Row-Security, die
   * Urheberschaft muss also schon belegt sein. `actor: 'member'`: gehandelt
   * hat der Autor, die Inhalts-Sperre (M13) gilt (Muster posts/[id].delete).
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
    const ops = tenantDb(event, { as: 'operator', actor: 'member' })
    const withdraw = () => ops.updatePermissions<Comment>(COMMENTS_TABLE, commentId, permissions, 'Comment not found')
    await withdraw()
      .catch(() => withdraw())
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

  return toPublicCommentRow(tombstone)
})
