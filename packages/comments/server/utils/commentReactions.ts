import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  type ReactionKey,
  type ReactionSummary,
  aggregateReactions,
  allowedReactions,
} from '../../../core/shared/reactions'
import { COMMENT_REACTIONS_TABLE, COMMENTS_TABLE, type Comment, type CommentReaction } from '../../shared/types/comment'
import { isOperatorCommentTarget } from './commentReadPermissions'

/**
 * DIE SERVER-SEITE DER ANTWORT-REAKTIONEN (F57, Davids Entscheidung
 * 2026-08-13) — alles, was sich die Lese- und die Schreib-Route teilen.
 *
 * Der Zuschnitt ist absichtlich der Zwilling von
 * `packages/posts/server/utils/reactions.ts`: dieselben Grenzen, dieselben
 * Klinken, dieselben Begruendungen. Was sich unterscheidet, ist die Tabelle
 * und das, was ein gueltiges Ziel ausmacht — und genau das steht unten.
 */

/**
 * Wie viele Ziel-Ids in EINE Abfrage passen.
 *
 * Keine Politik, sondern Appwrite: `Query.equal` nimmt hoechstens 100 Werte.
 * Dieselbe Stapelung fahren die eigenen Stimmen in `index.get.ts` — ein
 * Unterbaum kann groesser sein als eine Seite.
 */
const REACTION_ID_CHUNK = 100

/**
 * Wie viele Reaktions-ZEILEN eine gebuendelte Abfrage je Stapel einsammelt.
 *
 * EHRLICH GESAGT EINE DECKELUNG, KEINE VOLLSTAENDIGKEIT: darueber hinaus
 * zaehlt die Leiste zu niedrig. Dieselbe bewusste Abwaegung wie bei den Themen
 * — die Alternativen waeren eine Abfrage je Emoji und Ziel (bei 25 Antworten
 * 200 Abfragen) oder denormalisierte Zaehler-Spalten auf der Kommentar-Zeile
 * mit allen Konsistenz-Schreibwegen, die `upvotes`/`score` hier schon haben.
 * Wird die Grenze real erreicht, sind die Spalten der naechste Schritt —
 * nicht ein groesseres Fenster.
 */
const REACTION_BUNDLE_LIMIT = 1000

/**
 * Der in DIESER App erlaubte Satz — App-Config kuerzt, erweitert nie.
 *
 * EIGENER SCHALTER, NICHT DER DER THEMEN: `pukalani.comments.reactions` neben
 * `pukalani.discussions.reactions`. Zwei Produkte, zwei Entscheidungen — eine
 * Community darf die Leiste unter den Antworten kuerzen, ohne die an den
 * Themen anzufassen, und eine Silo-App ohne Discussions hat den anderen
 * Schluessel gar nicht.
 *
 * OHNE `event`, weil `useAppConfig()` in Nitro keines nimmt: die `app.config`
 * ist zur Bauzeit gemergt und damit fuer alle Requests dieselbe. Nicht zu
 * verwechseln mit `getAppConfig(event)` — das ist die Zeile in der Datenbank
 * (Wartungsmodus, Kommentare an/aus) und sehr wohl request-abhaengig.
 */
export function allowedCommentReactionsFor(): ReactionKey[] {
  const appConfig = useAppConfig() as {
    pukalani?: { comments?: { reactions?: string[] } }
  }
  return allowedReactions(appConfig.pukalani?.comments?.reactions)
}

/**
 * DAS ZIEL AUFLOESEN — und damit die Mandanten-Grenze belegen.
 *
 * Ueber die OPERATOR-Klinke, wie beim Stimmen (`vote.post.ts`): gelesen wird
 * eine FREMDE Zeile, um eine Tatsache ueber sie festzustellen. Die Datentuer
 * ist dabei die Grenze — ein Kommentar aus einer anderen Community ergibt 404,
 * nicht 403, genau wie ueberall sonst.
 *
 * DREI ABLEHNUNGEN, jede mit ihrem Grund:
 *  - unbekannt/fremder Mandant ⇒ 404 (die Datentuer)
 *  - nicht `active` (ausgeblendet oder soft-geloescht) ⇒ 409. Dieselbe Regel
 *    wie beim Stimmen und aus demselben Grund: sonst liessen sich Reaktionen
 *    an einen `[geloescht]`-Platzhalter haengen, den die Moderation gerade
 *    aus dem Verkehr gezogen hat. Die UI blockt das nur clientseitig.
 *  - OPERATOR-ZIEL ⇒ 409 `reaction_target_not_public`. Das ist die Stelle, an
 *    der interne Diskussionen draussen bleiben, und sie ist NICHT kosmetisch:
 *    Kommentare an `pukalani.comments.operatorTargets` (heute 'ticket') sind
 *    bewusst NICHT `read(any)` — sie tragen Label-Permissions fuer
 *    admin/moderator. Eine Reaktion darauf bekaeme ueber `read: 'public'` das
 *    gewoehnliche Inhalts-Publikum und waere damit die eine Zeile, die verraet,
 *    dass es diesen internen Kommentar gibt und wer darauf reagiert hat. Die
 *    Reaktions-Zeile waere also LESBARER als das, worauf sie sich bezieht —
 *    genau die Umkehrung, die C18 an anderer Stelle bereits einmal einsammeln
 *    musste. Das Gegenstueck bei den Themen ist der Feed-Ausschluss
 *    (`reaction_target_not_topic`).
 *
 * KEINE PRUEFUNG AUF `authorKind`: auf einen GAST-Kommentar darf man reagieren.
 * Er ist sichtbarer Inhalt wie jeder andere, und die Reaktion gehoert dem, der
 * sie gibt — nicht dem, der den Kommentar geschrieben hat. Umgekehrt gilt das
 * nicht: ein Gast kann selbst nicht reagieren (401 in der Route), weil eine
 * Reaktion ein Konto braucht.
 */
export async function resolveCommentReactionTarget(event: H3Event, targetId: string): Promise<Comment> {
  const ops = tenantDb(event, { as: 'operator' })
  const target = await ops.get<Comment>(COMMENTS_TABLE, targetId, 'Comment not found')

  if (target.status !== 'active') {
    throw createError({
      status: 409,
      statusText: 'Comment not reactable',
      data: { code: 'reaction_target_not_reactable' },
    })
  }

  // EINE Liste der Betreiber-Ziele (KK1): dieselbe Funktion wie beim Leserecht.
  if (isOperatorCommentTarget(target.targetType)) {
    throw createError({
      status: 409,
      statusText: 'Comment is not public',
      data: { code: 'reaction_target_not_public' },
    })
  }
  return target
}

/**
 * DIE GEBUENDELTE LESEABFRAGE — Reaktionen ALLER sichtbaren Antworten.
 *
 * ── SIE HAT KEINE EIGENE ROUTE, UND DAS IST DER ENTWURF ───────────────────
 * Aufgerufen wird sie aus `GET /api/comments`, das seine Zeilen ohnehin
 * gerade gelesen hat — die Chips reisen mit der Liste, genau wie `myVotes`
 * und `myReports`. Damit kostet die Emoji-Leiste NULL zusaetzliche Anfragen
 * statt einer gebuendelten, und ein Kommentar, der waehrend der Sitzung per
 * Realtime hereinkommt, braucht auch keine: er ist neu, er HAT keine
 * Reaktionen, und ein leerer Chip-Satz ist die richtige Antwort.
 * (Die Themen-Seite hat dafuer eine eigene Route — dort gibt es keine Liste,
 * an die man sich haengen koennte.)
 *
 * ── WARUM DIE MITGLIEDER-KLINKE UND NICHT DER OPERATOR ────────────────────
 * Weil die Row-Permissions hier genau die richtige Antwort geben und mein Code
 * sie nicht nachbauen muss: die Zeilen tragen das Publikum ihres Kommentars
 * (`read: 'public'`, von C18 auf Mitglieder heruntergestuft, wenn die Community
 * das so will). Ein Gast auf einer oeffentlichen Community sieht die Zahlen,
 * derselbe Gast auf einer mitglieder-privaten sieht sie nicht — ohne eine
 * einzige Verzweigung. Mit der Operator-Klinke waere die Sichtbarkeit meine
 * Erfindung, und die erste falsche Verzweigung waere ein Leck.
 *
 * Gelesen wird NIE geschrieben: keine Sperre (M13), kein Beitritt (A5).
 */
export async function loadCommentReactionSummary(
  event: H3Event,
  targetIds: readonly string[],
  viewerId: string | null,
  allowed: readonly ReactionKey[],
): Promise<ReactionSummary> {
  const ids = [...new Set(targetIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const db = tenantDb(event)
  const rows: CommentReaction[] = []

  // Gestapelt, weil `Query.equal` hoechstens 100 Werte nimmt und ein
  // Unterbaum groesser sein kann als eine Seite — dieselbe Schleife wie bei
  // den eigenen Stimmen in `index.get.ts`.
  for (let i = 0; i < ids.length; i += REACTION_ID_CHUNK) {
    const batch = ids.slice(i, i + REACTION_ID_CHUNK)
    const page = await db.list<CommentReaction>(COMMENT_REACTIONS_TABLE, [
      Query.equal('targetId', batch),
      Query.limit(REACTION_BUNDLE_LIMIT),
    ])
    rows.push(...page.rows)
  }

  return aggregateReactions(rows, viewerId, allowed)
}
