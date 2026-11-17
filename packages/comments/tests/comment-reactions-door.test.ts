import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { USER_COUNTER_KINDS } from '../../core/server/utils/userCounterEvents'

/**
 * DIE ANTWORT-REAKTIONS-ROUTE AN DER QUELLE FESTGENAGELT (F57, Davids
 * Entscheidung 2026-08-13).
 *
 * ── WARUM STRUKTURELL UND NICHT LIVE ──────────────────────────────────────
 * Zwei der wichtigsten Zusagen lassen sich auf der Dev-Instanz nicht ueber
 * HTTP zeigen: `reddit-comments` ist EIN-mandantig, es gibt dort weder eine
 * fremde noch eine zahlungs-gesperrte Community. Beide Zusagen haengen aber
 * an EINER Zeile — der Tuerklinke, mit der geschrieben wird:
 *
 *   const writer = tenantDb(event, { as: 'operator', actor: 'member' })
 *
 * Seit SEC-002 (GA1 P13) schreibt der Server (`as: 'operator'`); WER handelt,
 * sagt `actor: 'member'`, und daran und nur daran haengen M13 (die Sperre
 * friert Inhalte ein) und A5 (wer schreibt, wird Mitglied). Wer den Actor
 * weglaesst oder auf `'operator'` stellt, meldet die Reaktion still von
 * beidem ab, und NICHTS wuerde rot: die Route funktioniert danach besser als
 * vorher. Genau solche Umstellungen hat dieses Repo schon einmal bezahlt
 * (Audit-Befund C1c: fuenf zugesagte Inhaltsarten, EINE tatsaechlich gesperrt).
 *
 * ── UND DIE BADGE-NEUTRALITAET, VON DER ANDEREN SEITE ─────────────────────
 * `packages/posts/tests/reactions.test.ts` prueft den KATALOG (nur
 * `first-reaction` weiss von Reaktionen). Hier steht die Gegenprobe am
 * SCHREIBWEG der ANTWORTEN: die Route darf keinen Upvote-Zaehler und keine
 * Inhalts-Abzeichen melden — und sie darf die Kommentar-Zeile nicht anfassen,
 * sonst waere eine Reaktion doch wieder eine Stimme.
 */

function withoutComments(url: URL): string {
  return readFileSync(fileURLToPath(url), 'utf8')
    // Der Rumpf ohne Kommentare — sonst zaehlt eine Begruendung als Aufruf.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const code = withoutComments(new URL('../server/api/comments/[id]/reactions.post.ts', import.meta.url))
const utils = withoutComments(new URL('../server/utils/commentReactions.ts', import.meta.url))
const listRoute = withoutComments(new URL('../server/api/comments/index.get.ts', import.meta.url))

describe('die Antwort-Reaktions-Route schreibt ueber den Server, gehandelt hat das Mitglied', () => {
  it('liest ueber die Mitglieder-Klinke, schreibt ueber den Server als Mitglied', () => {
    // Gelesen wird, wie das Konto liest; geschrieben ueber die Operator-Klinke
    // mit `actor: 'member'` (SEC-002) — nicht mit der Betreiber-Rolle.
    expect(code).toContain('const db = tenantDb(event)')
    expect(code).toContain(`const writer = tenantDb(event, { as: 'operator', actor: 'member' })`)
  })

  it('jeder Schreibvorgang geht ueber `writer`, keiner als Betreiber', () => {
    /**
     * Die Gegenprobe zur Zeile darueber: die Mitglieder-Klinke `db` schreibt
     * nicht (sie ist der Session-Client), und `actor: 'operator'` kommt in
     * dieser Datei nicht vor — das Ziel-Nachschlagen mit der Operator-Klinke
     * lebt bewusst in `server/utils/commentReactions.ts` (fremde Zeile, nur Feststellung, kein Schreiben).
     */
    expect(code).not.toMatch(/\bdb\.(create|update|remove|increment|decrement|updatePermissions)\b/)
    expect(code).toMatch(/\bwriter\.create\b/)
    expect(code).toMatch(/\bwriter\.remove\b/)
    expect(code).not.toContain(`actor: 'operator'`)
    // Nur Leserechte an der neuen Zeile (SEC-002).
    expect(code).not.toContain('ownerUserId')
  })

  it('haengt an derselben Schreib-Sperre wie jede andere Kommentar-Aktion', () => {
    // Wartungsmodus UND „Kommentare aus" — beides steckt in dieser einen
    // Zusicherung, und sie ist der Grund, warum hier kein eigenes
    // `maintenanceMode` steht.
    expect(code).toContain('assertCommentsWritable(event)')
  })

  it('haelt die Erlaubnisliste fail-closed', () => {
    // Erst das Schema (Registry), dann die App-Konfiguration — eine der
    // beiden allein waere eine Anzeige-Empfehlung.
    expect(code).toContain('reactionToggleSchema.parse')
    expect(code).toContain('allowedCommentReactionsFor()')
    expect(code).toContain('allowed.includes(reaction)')
  })

  it('nimmt das Ziel aus dem PFAD, nicht aus dem Rumpf', () => {
    // Zwei Wahrheiten fuer dasselbe Ziel waeren eine Frage, die man in jeder
    // Route neu beantworten muss — und einmal falsch beantwortet, schreibt ein
    // durchgereichter Rumpf an einen fremden Kommentar.
    expect(code).toContain(`getRouterParam(event, 'id')`)
  })
})

describe('das Ziel wird geprueft, bevor irgendetwas entsteht', () => {
  it('loest ueber die Operator-Klinke auf (fremde Zeile, nur Feststellung)', () => {
    expect(utils).toContain(`tenantDb(event, { as: 'operator' })`)
  })

  it('weist ausgeblendete und geloeschte Kommentare ab', () => {
    expect(utils).toContain(`target.status !== 'active'`)
    expect(utils).toContain('reaction_target_not_reactable')
  })

  it('laesst INTERNE Diskussionen draussen (operatorTargets)', () => {
    /**
     * Die wichtigste Ablehnung dieser Datei. Kommentare an einem
     * Operator-Ziel (heute 'ticket') tragen bewusst KEIN `read(any)`. Eine
     * Reaktion darauf bekaeme ueber `read: 'public'` das gewoehnliche
     * Inhalts-Publikum und waere damit LESBARER als das, worauf sie sich
     * bezieht — sie verriete Existenz und Reagierende eines internen
     * Kommentars. Wer diese Pruefung entfernt, oeffnet genau das.
     */
    // Seit KK1 über die EINE Funktion, die auch das Leserecht eines Kommentars
    // entscheidet (`commentReadPermissions.ts`) — keine zweite Liste.
    expect(utils).toContain('isOperatorCommentTarget(target.targetType)')
    expect(utils).toContain('reaction_target_not_public')
  })
})

describe('BADGE-NEUTRAL am Schreibweg — die Gegenprobe zum Katalog', () => {
  it('meldet AUSSCHLIESSLICH den eigenen Reaktions-Zaehler', () => {
    expect(code).toContain(`kind: 'reactionsGiven'`)
    // Je einmal genannt: eine Reaktion bewegt EINEN Menschen, nicht zwei.
    expect(code.match(/recordUserCounterEvents/g)?.length).toBe(1)
  })

  it('bucht in DIESELBE Zaehler-Art wie die Themen — nicht in eine eigene', () => {
    /**
     * `first-reaction` ist EIN Abzeichen fuer die erste Reaktion, egal ob sie
     * an einem Thema oder an einer Antwort abgegeben wurde. Getragen wird das
     * nicht von einer Absprache, sondern davon, dass beide Routen dieselbe
     * Art des CORE-Vertrags nennen — eine layer-eigene Art (`commentReactions`
     * o. ae.) waere ein zweiter Zaehler und damit ein zweites Abzeichen.
     * Geprueft wird gegen den Vertrag selbst, nicht gegen die posts-Datei:
     * dieser Layer darf jenen nicht kennen (A14).
     */
    expect(USER_COUNTER_KINDS).toContain('reactionsGiven')
    expect(USER_COUNTER_KINDS).not.toContain('reactionsReceived')
  })

  it('ruehrt keinen Upvote-Zaehler an', () => {
    expect(code).not.toContain('upvotesGiven')
    expect(code).not.toContain('upvotesReceived')
  })

  it('meldet keine Inhalts-Abzeichen (kein zweiter „Like"-Weg)', () => {
    /**
     * `reportContentUpvotes` ist der Weg, ueber den „Nice/Good/Great Reply"
     * entsteht. Stuende er hier, waere eine Reaktion eine Stimme — und Davids
     * Entscheidung 4 („Like = Upvote") haette eine zweite Quelle.
     */
    expect(code).not.toContain('reportContentUpvotes')
  })

  it('schreibt nichts an die Kommentar-Zeile zurueck', () => {
    // Kein Recount, kein `score`, kein `upvotes` — die Reaktion lebt in ihrer
    // eigenen Tabelle, und die Vote-Zaehler des Kommentars bleiben unberuehrt.
    expect(code).not.toContain('COMMENTS_TABLE')
    expect(code).not.toContain('score')
    expect(code).not.toContain('serializePerComment')
  })
})

describe('gelesen wird MIT der Liste, nicht ueber eine eigene Route', () => {
  it('liest ueber die MITGLIEDER-Klinke, damit die Row-Permissions entscheiden', () => {
    // Mit der Operator-Klinke waere die Sichtbarkeit handgeschriebene Logik
    // statt einer Berechtigung — dort entsteht das erste Leck.
    expect(utils).toContain('const db = tenantDb(event)')
  })

  it('haengt die Chips an die Kommentar-Liste', () => {
    /**
     * Der Grund fuer diesen Test ist die N+1-Frage: die Chips reisen mit
     * `GET /api/comments`, weil die Zeilen dort ohnehin gerade gelesen wurden.
     * Wer daraus wieder eine eigene Abfrage je Leiste macht, baut bei 25
     * Antworten 25 Anfragen — und merkt es nicht, weil alles funktioniert.
     */
    expect(listRoute).toContain('loadCommentReactionSummary(')
    expect(listRoute).toContain('reactionsAllowed')
  })

  it('holt die Helfer EXPLIZIT — Auto-Import ist ueber Layer hinweg flach', () => {
    /**
     * BEIM BAU LIVE ERWISCHT, und es waere sonst niemandem aufgefallen.
     * `posts/server/utils/reactions.ts` hatte gleichnamige Helfer
     * (`loadReactionSummary`, `allowedReactionsFor`, `resolveReactionTarget`).
     * Nitros Auto-Import ist ueber ALLE Layer FLACH: bei Gleichstand gewinnt
     * EINER, und hier gewann posts. Die Kommentar-Liste haette damit still
     * `discussion_reactions` gelesen und den Emoji-Satz der THEMEN angewendet
     * — kein Fehler, kein roter Test, nur eine `WARN Duplicated imports`-Zeile
     * im Dev-Log.
     *
     * Zwei Sicherungen, absichtlich beide: eindeutige NAMEN (die Kollision
     * kann gar nicht mehr entstehen) und der EXPLIZITE Import (die Herkunft
     * steht in der Datei, nicht in einer Aufloesungs-Reihenfolge).
     */
    expect(listRoute).toContain(`from '../../utils/commentReactions'`)
    expect(listRoute).not.toContain('loadReactionSummary(')
    expect(listRoute).not.toContain('allowedReactionsFor(')
  })

  it('stapelt die Ziel-Ids, statt sie zu kappen', () => {
    // `Query.equal` nimmt hoechstens 100 Werte. Ein Unterbaum kann groesser
    // sein als eine Seite — ohne Stapelung fehlten die Leisten ab der 101.
    // Antwort, und zwar lautlos.
    expect(utils).toContain('REACTION_ID_CHUNK')
  })

  it('zwingt zum Lesen KEINE Anmeldung auf', () => {
    // Wer die Antwort sieht, sieht auch, wie darauf reagiert wurde. Ohne
    // Konto gibt es lediglich kein `mine`.
    expect(listRoute).toContain(`user?.$id ?? null`)
  })
})
