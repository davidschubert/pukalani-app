import { AppwriteException, Query } from 'node-appwrite'
import { reactionToggleSchema } from '../../../../schemas/reaction'
import { allowedCommentReactionsFor, loadCommentReactionSummary, resolveCommentReactionTarget } from '../../../utils/commentReactions'
import { COMMENT_REACTIONS_TABLE, type CommentReaction, type CommentReactionToggleResponse } from '../../../../shared/types/comment'

/**
 * EINE EMOJI-REAKTION AUF EINE ANTWORT UMSCHALTEN (F57, Davids Entscheidung
 * 2026-08-13 „Ja, nachbauen").
 *
 * `POST /api/comments/:id/reactions` — an/aus je (Kommentar, Mensch, Emoji).
 * MEHRERE VERSCHIEDENE Emojis pro Mensch und Kommentar sind ausdruecklich
 * erlaubt, dasselbe zweimal nicht: nochmal klicken nimmt zurueck
 * (Slack-/Discourse-Muster). Durchgesetzt wird das nicht von dieser Route,
 * sondern vom Unique-Index (targetId, userId, reaction) — der haelt auch beim
 * Doppelklick-Rennen.
 *
 * Das Ziel steht im PFAD, wie bei `/vote` — nicht im Rumpf. Zwei Wahrheiten
 * fuer dasselbe Ziel sind eine Frage, die man in jeder Route neu beantworten
 * muss.
 *
 * ── DIE REAKTION IST INHALT, ALSO GILT ALLES, WAS FUER INHALT GILT ────────
 * Geschrieben wird ueber die MITGLIEDER-Klinke (`tenantDb(event)`, Actor
 * `member` per Default). Damit greifen ohne ein einziges eigenes `if`:
 *  - **M13**: in einer wegen Zahlung gesperrten Community ist Reagieren zu
 *    (403 `community_suspended`) — die Sperre friert Inhalte ein, und eine
 *    Reaktion ist einer.
 *  - **A5**: die erste eigene Reaktion macht zum Mitglied (`contribution`),
 *    genau wie der erste Kommentar.
 * Das ZIEL wird dagegen ueber die Operator-Klinke gelesen (fremde Zeile, nur
 * Feststellung) — dieselbe Zwei-Tueren-Aufteilung wie beim Stimmen.
 *
 * ── BADGE-NEUTRAL, UND ZWAR NACHPRUEFBAR ──────────────────────────────────
 * Gemeldet wird AUSSCHLIESSLICH `reactionsGiven` fuer den Handelnden. Kein
 * `reportContentUpvotes`, kein Zaehler fuer den AUTOR, nichts an
 * `upvotesGiven`/`upvotesReceived`, und KEIN Schreibvorgang auf die
 * Kommentar-Zeile (kein Recount, kein `score`). Konzept Teil 4 Punkt 3:
 * Abzeichen zaehlen weiterhin ausschliesslich Upvotes; die einzige Ausnahme
 * ist `first-reaction`, und die haengt an der ersten ABGEGEBENEN Reaktion.
 * Wer hier eine Empfaenger-Meldung ergaenzt, macht aus Reaktionen eine zweite
 * Like-Quelle und hebt Davids Entscheidung 4 auf.
 *
 * DERSELBE ZAEHLER WIE AN DEN THEMEN, und das ist Absicht: `reactionsGiven`
 * ist eine Art im CORE-Vertrag (`recordUserCounterEvents`), keine Spalte, die
 * ein Layer besitzt. Wer zuerst auf ein Thema reagiert und danach auf eine
 * Antwort, bekommt `first-reaction` trotzdem genau einmal — die Schwelle ist
 * 1 und das Abzeichen `once`. In einer App ohne posts-Layer ist die Autoritaet
 * unbesetzt und die Meldung verpufft folgenlos; das ist der ganze Preis dafuer,
 * dass dieser Layer nichts von Abzeichen wissen muss (A14).
 */

/** Wie viele Umschaltungen ein Mensch je Community und Minute machen darf. */
const REACTION_LIMIT = 60
const REACTION_WINDOW_MS = 60_000

export default defineEventHandler(async (event): Promise<CommentReactionToggleResponse> => {
  // SEC-030: ein Pool-Konto ist auf jedem Community-Host angemeldet — wer hier
  // mitmacht, muss dazugehören. Offene Registrierung: dieser Schritt IST der
  // Beitritt (A5); geschlossen oder entzogen: 403 `not_a_member`. 401 ohne Konto.
  const user = await requireCommunityParticipant(event)

  const targetId = getRouterParam(event, 'id')
  if (!targetId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  /**
   * Wartungsmodus UND „Kommentare aus" — dieselbe Klammer wie um jede andere
   * schreibende Kommentar-Aktion. Eine Community, die das Kommentieren
   * abgeschaltet hat, will keine Emoji-Leiste, die weiterlaeuft.
   */
  await assertCommentsWritable(event)

  const { reaction } = await readValidatedBody(event, reactionToggleSchema.parse)

  /**
   * DIE ZWEITE HAELFTE DER ERLAUBNISLISTE.
   *
   * Das Schema prueft gegen die REGISTRY (gibt es dieses Emoji ueberhaupt),
   * hier gegen die KONFIGURATION dieser App (ist es hier freigeschaltet). Beide
   * Fragen sind noetig: ein gekuerzter Satz waere sonst eine reine
   * Anzeige-Empfehlung, an der ein direkter Aufruf vorbeischreibt.
   */
  const allowed = allowedCommentReactionsFor()
  if (!allowed.includes(reaction)) {
    throw createError({
      status: 400,
      statusText: 'Reaction not allowed',
      data: { code: 'reaction_not_allowed' },
    })
  }

  // Belegt die Mandanten-Zugehoerigkeit UND dass der Kommentar sichtbar ist.
  await resolveCommentReactionTarget(event, targetId)

  // Drossel: ein Mensch, eine Community, ein Fenster. Fail-open wie ueberall —
  // ein toter Redis darf das Reagieren nicht abschalten. EIGENER Eimer neben
  // dem der Themen-Reaktionen: wer eine Diskussion durchliest und dabei Themen
  // UND Antworten mit Emojis versieht, soll sich nicht selbst aussperren.
  //
  // SIE IST NICHT MEHR DIE ERSTE (AU2, 2026-08-15): `05.rate-limit.ts` deckelt
  // die Route jetzt zusaetzlich je IP (Bucket `comments:reactions`, ebenfalls
  // 60/min) — und zwar BEVOR `resolveCommentReactionTarget` oben eine fremde
  // Zeile ueber die Operator-Klinke liest. Diese Drossel hier bleibt die
  // feinere (Mensch + Community statt IP) und im Normalfall die wirksame; die
  // dort faengt den Ansturm ab, der sonst je abgewiesenem Versuch einen
  // Appwrite-Abruf kostet.
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}comment-reactions:${communityId}:${user.$id}`, REACTION_WINDOW_MS)
  if (state.count > REACTION_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many reactions' })
  }

  const db = tenantDb(event)

  const existing = await db.find<CommentReaction>(COMMENT_REACTIONS_TABLE, [
    Query.equal('targetId', targetId),
    Query.equal('userId', user.$id),
    Query.equal('reaction', reaction),
  ])

  let delta = 0
  if (existing) {
    await db.remove(COMMENT_REACTIONS_TABLE, existing.$id)
    delta = -1
  }
  else {
    try {
      await db.create<CommentReaction>(COMMENT_REACTIONS_TABLE, {
        targetId,
        userId: user.$id,
        reaction,
      }, {
        /**
         * Das Publikum des KOMMENTARS, nicht ein eigenes: eine Reaktion ist so
         * oeffentlich wie das, worauf sie sich bezieht. C18 stuft `public` auf
         * Mitglieder herunter, wenn die Community das so eingestellt hat —
         * deshalb steht hier die ABSICHT und keine Verzweigung. Der eine Fall,
         * in dem das nicht reichen wuerde (interne Ticket-Diskussionen), ist
         * oben in `resolveCommentReactionTarget` schon abgewiesen.
         */
        read: 'public',
        ownerUserId: user.$id,
      })
      delta = 1
    }
    catch (error) {
      // Doppelklick-Rennen: der Unique-Index laesst nur einen durch. Der Stand
      // wird unten ohnehin autoritativ neu gelesen — also kein Fehler nach
      // aussen, aber auch KEINE Zaehler-Meldung (es ist nichts entstanden).
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not react' })
      }
    }
  }

  /**
   * MITSCHREIBENDER ZAEHLER (F1) — nur der Gebende, nur diese eine Art.
   *
   * Zurueckgenommen wird mitgezaehlt (`-1`), damit der Zaehler nicht nach oben
   * driftet. Fuer `first-reaction` (Schwelle 1, einmalig) aendert das nichts:
   * ein einmal verliehenes Abzeichen wird nie eingezogen.
   */
  if (delta !== 0) {
    await recordUserCounterEvents(event, [
      { userId: user.$id, kind: 'reactionsGiven', delta },
    ])
  }

  // Autoritativ neu gelesen statt optimistisch gerechnet: zwischen Klick und
  // Antwort koennen fremde Reaktionen dazugekommen sein.
  const reactions = await loadCommentReactionSummary(event, [targetId], user.$id, allowed)

  return { targetId, reactions: reactions[targetId] ?? [] }
})
