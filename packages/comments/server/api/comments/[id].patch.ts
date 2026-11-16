import { commentUpdateSchema } from '../../../schemas/comment'
import { commentSnippet } from '../../../shared/commentSnippet'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

/**
 * Eigenen Kommentar bearbeiten.
 *
 * WER DARF, PRÜFT DIESE ROUTE SELBST (SEC-002, GA1 P13): bis hierher schrieb
 * sie mit der Sitzung des Kontos, und Appwrites Zeilen-Recht war die Prüfung
 * „ist das der Autor?". Jetzt schreibt der Server (Admin-Client) — der Vergleich
 * `authorId === Konto` VOR dem Schreiben ist damit die einzige Grenze.
 */
export default defineEventHandler(async (event) => {
  // SEC-030: nur Mitglieder dieser Community (ein Pool-Konto ist auf jedem
  // Community-Host angemeldet). Bewusst KEIN Beitritt — den eigenen Kommentar zu bearbeiten macht
  // niemanden zum Mitglied. 401 ohne Konto, 403 `not_a_member` für Fremde.
  const user = await requireCommunityMembership(event)

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  await assertCommentsWritable(event)

  const { content } = await readValidatedBody(event, commentUpdateSchema.parse)
  // Gelesen wird über die Mitglieder-Klinke: was das Konto nicht lesen darf,
  // gibt es für diese Route nicht (404).
  const db = tenantDb(event)

  // Status prüfen: nur aktive/gemeldete Kommentare sind editierbar. Ohne diese
  // Sperre könnte der Autor per direktem Call den Inhalt eines ausgeblendeten
  // (hidden) oder soft-gelöschten (deleted) Kommentars überschreiben — die UI
  // versteckt „Bearbeiten" dort nur clientseitig.
  // `get` der Tür belegt zugleich die Mandanten-Zugehörigkeit.
  const existing = await db.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (existing.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not editable' })
  }
  // NUR DER AUTOR. Gast-Kommentare und Grabsteine tragen eine leere
  // `authorId` — sie gehören niemandem, der hier angemeldet sein könnte.
  if (!existing.authorId || existing.authorId !== user.$id) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  /**
   * F1: hat sich der INHALT wirklich geändert?
   *
   * Die Antwort steuert NUR den mitschreibenden Zähler, NICHT `editedAt` —
   * dort bleibt das Verhalten dieser Route unverändert (jedes Speichern setzt
   * den Zeitstempel; anders als beim Beitrag schickt dieses Formular auch nur
   * das eine Feld, es gibt hier also keinen Kategorie-Wechsel, der sich als
   * Bearbeitung tarnen könnte). Für das Abzeichen „Editor" ist der Unterschied
   * trotzdem wichtig: zweimal „Speichern" ohne Änderung ist EINE Bearbeitung,
   * und ohne diese Frage wäre das Abzeichen mit zwei folgenlosen Klicks zu
   * haben.
   */
  const contentEdited = existing.content !== content

  try {
    // Sparse Update über den Server; `actor: 'member'`: gehandelt hat der
    // Autor, die Inhalts-Sperre (M13) gilt.
    // editedAt markiert die echte Bearbeitung (≠ $updatedAt, das auch Votes bumpen).
    const updated = await tenantDb(event, { as: 'operator', actor: 'member' }).update<Comment>(
      COMMENTS_TABLE,
      commentId,
      {
        content,
        editedAt: new Date().toISOString(),
        // Der Übersetzungs-Cache (comments-020) gilt für den ALTEN Text — eine
        // stehengelassene Fassung wäre eine stille Lüge in einer anderen
        // Sprache. Nur bei ECHTER Änderung, anders als `editedAt` darüber:
        // zweimal „Speichern" ohne Änderung soll keine bezahlte Übersetzung
        // wegwerfen.
        ...(contentEdited ? { translations: '' } : {}),
      },
      'Comment not found',
    )

    /**
     * MITSCHREIBENDER ZÄHLER (F1) — Grundlage des Abzeichens „Editor".
     *
     * NUR EIGENE INHALTE, und das ist hier eine Eigenschaft der Route: sie
     * lässt ausschließlich den Autor schreiben (ein fremder Versuch endet
     * oben im 403). Eine Moderation, die einen fremden
     * Kommentar anfasst, kommt hier gar nicht vorbei — und dürfte auch nicht
     * zählen: das Abzeichen belohnt, den EIGENEN Text besser zu machen.
     */
    if (contentEdited) {
      await recordUserCounterEvents(event, [{ userId: user.$id, kind: 'edits', delta: 1 }])
      /**
       * Der Feed-Eintrag trägt einen SCHNAPPSCHUSS des Textes (SEC-032,
       * 2026-11-15) — er folgt der Bearbeitung, unter derselben Bedingung,
       * unter der eine Zeile höher der Übersetzungs-Cache fällt. Sonst stünde
       * ein korrigierter Satz im Feed weiter in seiner alten Fassung.
       * Best-effort im Core-Vertrag (wirft nie, loggt).
       */
      await updateActivitySnippetForObject(event, 'comment', commentId, commentSnippet(content))
    }

    return updated
  }
  catch (error) {
    throw toH3Error(error, 'Comment could not be updated')
  }
})
