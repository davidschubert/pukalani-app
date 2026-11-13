import { AppwriteException, Query } from 'node-appwrite'
import { reactionToggleSchema } from '../../../../schemas/reaction'
import { allowedReactionsFor, loadReactionSummary, resolveReactionTarget } from '../../../../server/utils/reactions'
import { DISCUSSION_REACTIONS_TABLE, type DiscussionReaction, type ReactionToggleResponse } from '../../../../shared/types/post'

/**
 * EINE EMOJI-REAKTION UMSCHALTEN (F57 Mechanik 1, Davids Entscheidung
 * 2026-08-10).
 *
 * `POST /api/posts/discussions/reactions` — an/aus je (Ziel, Mensch, Emoji).
 * MEHRERE VERSCHIEDENE Emojis pro Mensch und Beitrag sind ausdruecklich
 * erlaubt, dasselbe zweimal nicht: nochmal klicken nimmt zurueck
 * (Slack-/Discourse-Muster). Durchgesetzt wird das nicht von dieser Route,
 * sondern vom Unique-Index (targetId, userId, reaction) — der haelt auch beim
 * Doppelklick-Rennen.
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
 * `upvotesGiven`/`upvotesReceived`. Konzept Teil 4 Punkt 3: Abzeichen zaehlen
 * weiterhin ausschliesslich Upvotes; die einzige Ausnahme ist
 * `first-reaction`, und die haengt an der ersten ABGEGEBENEN Reaktion. Wer hier
 * eine Empfaenger-Meldung ergaenzt, macht aus Reaktionen eine zweite
 * Like-Quelle und hebt Davids Entscheidung 4 auf.
 */

/** Wie viele Umschaltungen ein Mensch je Community und Minute machen darf. */
const REACTION_LIMIT = 60
const REACTION_WINDOW_MS = 60_000

export default defineEventHandler(async (event): Promise<ReactionToggleResponse> => {
  requirePlanProduct(event, 'posts')

  // SEC-030: ein Pool-Konto ist auf jedem Community-Host angemeldet — wer hier
  // mitmacht, muss dazugehören. Offene Registrierung: dieser Schritt IST der
  // Beitritt (A5); geschlossen oder entzogen: 403 `not_a_member`. 401 ohne Konto.
  const user = await requireCommunityParticipant(event)

  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const { targetType, targetId, reaction } = await readValidatedBody(event, reactionToggleSchema.parse)

  /**
   * DIE ZWEITE HAELFTE DER ERLAUBNISLISTE.
   *
   * Das Schema prueft gegen die REGISTRY (gibt es dieses Emoji ueberhaupt),
   * hier gegen die KONFIGURATION dieser App (ist es hier freigeschaltet). Beide
   * Fragen sind noetig: ein gekuerzter Satz waere sonst eine reine
   * Anzeige-Empfehlung, an der ein direkter Aufruf vorbeischreibt.
   */
  const allowed = allowedReactionsFor()
  if (!allowed.includes(reaction)) {
    throw createError({
      status: 400,
      statusText: 'Reaction not allowed',
      data: { code: 'reaction_not_allowed' },
    })
  }

  // Belegt die Mandanten-Zugehoerigkeit UND dass das Ziel ein Thema ist.
  await resolveReactionTarget(event, targetType, targetId)

  // Drossel: ein Mensch, eine Community, ein Fenster. Fail-open wie ueberall —
  // ein toter Redis darf das Reagieren nicht abschalten.
  //
  // SIE IST NICHT MEHR DIE ERSTE (AU2, 2026-08-15): `05.rate-limit.ts` deckelt
  // die Route jetzt zusaetzlich je IP (Bucket `posts:reactions`, ebenfalls
  // 60/min) — und zwar BEVOR `resolveReactionTarget` oben eine fremde Zeile
  // ueber die Operator-Klinke liest. Diese Drossel hier bleibt die feinere
  // (Mensch + Community statt IP) und im Normalfall die wirksame; die dort
  // faengt den Ansturm ab, der sonst je abgewiesenem Versuch einen
  // Appwrite-Abruf kostet.
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}reactions:${communityId}:${user.$id}`, REACTION_WINDOW_MS)
  if (state.count > REACTION_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many reactions' })
  }

  const db = tenantDb(event)

  const existing = await db.find<DiscussionReaction>(DISCUSSION_REACTIONS_TABLE, [
    Query.equal('targetId', targetId),
    Query.equal('userId', user.$id),
    Query.equal('reaction', reaction),
  ])

  let delta = 0
  if (existing) {
    await db.remove(DISCUSSION_REACTIONS_TABLE, existing.$id)
    delta = -1
  }
  else {
    try {
      await db.create<DiscussionReaction>(DISCUSSION_REACTIONS_TABLE, {
        targetType,
        targetId,
        userId: user.$id,
        reaction,
      }, {
        /**
         * Das Publikum des BEITRAGS, nicht ein eigenes: eine Reaktion ist so
         * oeffentlich wie das, worauf sie sich bezieht. C18 stuft `public` auf
         * Mitglieder herunter, wenn die Community das so eingestellt hat —
         * deshalb steht hier die ABSICHT und keine Verzweigung.
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
  const reactions = await loadReactionSummary(event, [targetId], user.$id, allowed)

  return { targetId, reactions: reactions[targetId] ?? [] }
})
