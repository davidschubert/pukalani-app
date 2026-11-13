import type { Models } from 'node-appwrite'
import type { ReactionCount, ReactionKey, ReactionSummary } from '../../../core/shared/reactions'
import type { VoteCounts } from '../../../core/shared/voteCounts'

export const COMMENTS_TABLE = 'comments'
export const VOTES_TABLE = 'comment_votes'
/**
 * Emoji-Reaktionen auf ANTWORTEN (F57, comments-019).
 *
 * Eine EIGENE Tabelle neben `discussion_reactions` (posts) — nicht aus
 * Verdopplungslust, sondern weil `comments` in jedem `extends` VOR `posts`
 * steht und ein Griff dorthin die A14-Umkehr waere. Dasselbe Verhaeltnis wie
 * `comment_votes` zu `post_votes`. Geteilt wird die REGEL
 * (`core/shared/reactions.ts`), nie die Tabelle. Begruendung ausfuehrlich im
 * Kopf der Migration.
 */
export const COMMENT_REACTIONS_TABLE = 'comment_reactions'
/**
 * Kontaktdaten der Gast-Kommentatoren (operator-read, comments-013).
 *
 * SEIT F18 (2026-08-02) NUR NOCH BESTAND: es schreibt niemand mehr hinein, der
 * einzige verbleibende Konsument ist `guestAuthorPrune.ts`, der die Alt-Zeilen
 * nach 90 Tagen abräumt. Die Tabelle bleibt vorerst stehen (ein Drop ist
 * unumkehrbar und gehört in eine eigene Entscheidung); wer hier wieder etwas
 * anlegen will, braucht zuerst eine Lese-Stelle und einen Zweck.
 */
export const GUEST_AUTHORS_TABLE = 'guest_authors'

/** Maximale Antwort-Tiefe (0 = Top-Level). Tiefere Antworten werden abgelehnt. */
export const MAX_COMMENT_DEPTH = 8

/**
 * Längengrenze eines Kommentartextes.
 *
 * Stand bis 2026-08-17 zweimal als nackte `10_000` im Zod-Schema und wurde mit
 * der Übersetzungs-Route zur dritten Stelle, die dieselbe Zahl klemmen muss
 * (eine KI-Antwort ist eine Behauptung und wird beschnitten, bevor sie in die
 * Spalte geht). Drei Literale für eine Grenze sind zwei zu viel — Muster
 * `MAX_POST_BODY` im posts-Layer.
 */
export const MAX_COMMENT_CONTENT = 10_000

/**
 * Sichtbarkeits-Status (Soft-Delete + Moderation):
 * active → normal · hidden → von Moderation ausgeblendet ·
 * deleted → Soft-Delete ([gelöscht]-Platzhalter).
 * Melden läuft über den Moderation-Layer (reports-Tabelle), NICHT über den Status.
 */
export type CommentStatus = 'active' | 'hidden' | 'deleted'

export type SortMode = 'top' | 'new' | 'trending' | 'discussed'

export interface Comment extends Models.Row {
  /** Flexible Anbindung: Kommentare hängen an beliebigen Objekten */
  targetId: string
  targetType: string
  content: string
  authorId: string
  authorName: string
  /**
   * Herkunft des Autors: 'user' (Appwrite-Account, Default/Bestand) oder
   * 'guest' (Embed-Gast ohne Account — Migration comments-013). Gast-Rows haben
   * authorId '' und keine Vote-/Edit-Permissions. Seit F18 ist `authorName` das
   * EINZIGE, was von einem Gast gespeichert wird — es gibt keine zweite Zeile
   * mit E-Mail und IP-Hash mehr (siehe GUEST_AUTHORS_TABLE oben).
   */
  authorKind?: 'user' | 'guest'
  /**
   * Avatar-URL des Autors — KEINE DB-Spalte, sondern beim Lesen aus den
   * Account-prefs angereichert (immer aktuell). Bei Realtime-Events fremder
   * User fehlt sie → UserAvatar fällt auf Initialen zurück, bis neu geladen wird.
   */
  authorAvatarUrl?: string
  /**
   * „Ehemaliges Mitglied" (N9, Davids Entscheidung 1 vom 2026-07-29) — KEINE
   * DB-Spalte, sondern beim Lesen gebündelt angereichert (resolveFormerMembers,
   * core): der Autor hat diese Community verlassen bzw. wurde entfernt, sein
   * Beitrag bleibt mit Namen stehen. Wie authorAvatarUrl fehlt das Feld bei
   * Realtime-Events, bis neu geladen wird — das Zeichen erscheint dann später,
   * es verschwindet nie falsch.
   */
  authorFormerMember?: boolean
  /**
   * Der @-Name des Autors (ohne @) — KEINE DB-Spalte, gebündelt angereichert
   * wie Avatar und „ehemaliges Mitglied". Er trägt die Autoren-Aktionen der
   * Kopfzeile (F56, `CoreAuthorActions`): „dieser Person schreiben" braucht
   * eine Adresse. Gäste haben keine (authorId ''), und bei Realtime-Events
   * fehlt das Feld wie die Geschwister nebenan, bis neu geladen wird — die
   * Aktion erscheint dann später, sie erscheint nie falsch.
   */
  authorHandle?: string
  parentId: string | null
  /** Interner Pfad der Seite, auf der der Kommentar lebt — für die Reply-Notification (null = unbekannt → '/') */
  targetUrl: string | null
  /** $id des Top-Level-Vorfahren (null = Top-Level) — ermöglicht Subtree-Queries */
  rootId: string | null
  /** Verschachtelungstiefe (0 = Top-Level) — Basis für das maxDepth-Limit */
  depth: number
  /** Gesetzt beim Bearbeiten → echter „bearbeitet"-Indikator (≠ $updatedAt, das Votes/Moderation bumpen) */
  editedAt: string | null
  /** Denormalisierte Zähler — server-autoritativ via AdminClient gepflegt */
  upvotes: number
  downvotes: number
  score: number
  status: CommentStatus
  /**
   * ÜBERSETZUNGEN DES TEXTES als JSON, Sprachcode → Fassung — `''`/fehlend =
   * nichts übersetzt (Migration comments-020).
   *
   * OPTIONAL im Typ, anders als die Pflichtfelder daneben: sie fehlt bei jeder
   * Zeile aus der Zeit vor der Migration, und eine Anlegestelle hat hier nichts
   * zu entscheiden — ein frischer Kommentar ist nie übersetzt. Gelesen wird sie
   * AUSSCHLIESSLICH über `core/shared/ugcTranslations.ts` (pur, fail-soft) und
   * aufgelöst im Browser.
   *
   * Der Inhalt ist ein CACHE, kein Inhalt des Autors: `[id].patch.ts` leert ihn,
   * sobald sich der Text wirklich ändert.
   */
  translations?: string
  /**
   * KEIN `tenantId` mehr (F29, 2026-08-02): die Spalte ist mit comments-017
   * gefallen, der Mandant heißt überall `communityId` (E8-3). Das Feld stand
   * hier noch als toter Rest — gelesen oder geschrieben wurde es nirgends, und
   * genau diese Drift zwischen Typ und Schema hat im events-Layer den Geldpfad
   * gebrochen (ein `tenantId` im Schreib-Objekt ⇒ 400 row_invalid_structure).
   * Die `communityId` steht bewusst NICHT im Typ: sie gehört der Datentür, die
   * sie stempelt und filtert — Produkt-Code liest sie nicht.
   */
}

export interface CommentVote extends Models.Row {
  commentId: string
  userId: string
  /** 1 = Upvote, -1 = Downvote */
  value: number
}

export type VoteValue = 1 | -1

/** GET /api/comments Response: Rows + eigene Votes als separate Map */
export interface CommentListResponse {
  /** Alle nicht-hidden Kommentare des Targets — Pagination-Sentinel (rows enthalten auch deleted-Platzhalter) */
  total: number
  /** Nur status=active — die EINE Anzeige-Zahl (Überschrift + Landingpage-Stats zählen identisch) */
  activeTotal: number
  /** Anzahl Top-Level-Threads — Basis der Pagination (eine Seite = N Threads + Subtrees) */
  topLevelTotal: number
  rows: Comment[]
  myVotes: Record<string, VoteValue>
  /** IDs der Kommentare, die der eingeloggte User offen gemeldet hat (Moderation-Layer) */
  myReports: string[]
  /**
   * Emoji-Reaktionen dieser Kommentare (F57) — Kommentar-Id → Chips.
   *
   * Sie reisen MIT der Liste statt über eine eigene Route, wie `myVotes` und
   * `myReports` daneben: die Zeilen sind beim Lesen ohnehin bekannt, und ein
   * Kommentar, der später per Realtime hereinkommt, hat naturgemäß noch keine
   * Reaktionen — ein fehlender Eintrag heißt hier also „keine", nicht
   * „ungeladen".
   */
  reactions: ReactionSummary
  /** Der in DIESER App freigeschaltete Satz — die Leiste baut ihr „+"-Menü daraus. */
  reactionsAllowed: ReactionKey[]
}

/**
 * POST /:id/vote Response: frischer Zähler-Stand + eigener Vote (null = entfernt).
 *
 * NUR die Zähler (SEC-031, 2026-11-13): bis dahin stand hier der ganze
 * Kommentar — gelesen über die Operator-Klinke, also auch für Kommentare, die
 * das Konto nicht lesen darf. Der Store übernimmt die Zähler in seine Zeile.
 */
export interface VoteResponse {
  comment: VoteCounts
  myVote: VoteValue | null
}

/**
 * EINE abgegebene Emoji-Reaktion auf eine Antwort (F57, Migration comments-019).
 *
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür, die sie
 * stempelt und filtert (dasselbe Muster wie bei `Comment` und `CommentVote`).
 * `reaction` trägt den SCHLÜSSEL aus `core/shared/reactions.ts`, nie das
 * Zeichen selbst (Begründung dort).
 *
 * Das Feld heißt `targetId` und nicht `commentId`, obwohl es hier immer eine
 * Kommentar-Id ist: die pure Aggregation (`aggregateReactions`) liest genau
 * diesen Namen, und sie ist für beide Produkte dieselbe. Ein eigener
 * Spaltenname hier hieße, die Zeilen vor jedem Zählen umzuschreiben.
 */
export interface CommentReaction extends Models.Row {
  /** Row-Id des Kommentars (global eindeutig, deshalb trägt sie den Unique-Index). */
  targetId: string
  userId: string
  /** Schlüssel aus `REACTION_KEYS`, z. B. 'tada'. */
  reaction: string
}

/**
 * Antwort von `POST /api/comments/:id/translate` — die Fassung in EINER
 * Sprache.
 *
 * `cached` sagt, ob dafür gerade ein KI-Aufruf bezahlt wurde (`false`) oder ob
 * die Fassung schon auf der Zeile lag (`true`). Es steht hier, weil die
 * Oberfläche daran den Unterschied zwischen „sofort da" und „hat eben gerechnet"
 * zeigen kann — und weil ein Beweis-Skript ohne dieses Feld nicht prüfen
 * könnte, dass ein zweiter Klick nichts mehr kostet.
 */
export interface CommentTranslateResponse {
  locale: string
  body: string
  cached: boolean
}

/** POST /api/comments/:id/reactions: der neue Stand GENAU dieses Kommentars. */
export interface CommentReactionToggleResponse {
  targetId: string
  reactions: ReactionCount[]
}

/** Baumknoten für die rekursive Darstellung */
export interface CommentNode {
  comment: Comment
  children: CommentNode[]
}
