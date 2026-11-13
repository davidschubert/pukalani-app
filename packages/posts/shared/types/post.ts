import type { Models } from 'node-appwrite'
import type { BadgeFacts, BadgeGroup } from '../badges'
import type { ReactionCount, ReactionKey, ReactionSummary } from '../../../core/shared/reactions'
import type { VoteCounts } from '../../../core/shared/voteCounts'
import type { TrustLevelProgress } from '../trustLevels'
import type { CategoryOrderEntry } from '../categoryOrder'

export const POSTS_TABLE = 'community_posts'
export const POLL_VOTES_TABLE = 'poll_votes'
export const POST_VOTES_TABLE = 'post_votes'
/** F1 Stufe 1: die vom Admin gepflegte Kategorien-Struktur der Discussions. */
export const POST_CATEGORIES_TABLE = 'post_categories'
/**
 * F1 Stufe 2: die Aufruf-Zähler der Topics — EINE eigene Tabelle, EINE Zeile je
 * Beitrag (`rowId = postId`).
 *
 * WARUM NICHT EINE SPALTE AUF DER BEITRAGS-ZEILE (die naheliegende Lösung, und
 * die falsche): jeder Aufruf durch einen beliebigen Gast würde dann
 *  - `$updatedAt` des Beitrags bewegen — und damit genau die Aktivitäts-Rechnung
 *    zerstören, die Stufe 2 eine Datei weiter oben gerade in Ordnung gebracht
 *    hat (`lastActivityAt` gäbe es dann umsonst),
 *  - ein Realtime-Ereignis auf der Beitrags-Zeile veröffentlichen. Jeder
 *    Feed-Abonnent bekäme Ereignisse durch bloßes ANSCHAUEN — Aufregung ohne
 *    Neuigkeit, auf Kosten jedes offenen Fensters.
 * Eine eigene Zeile ist beides nicht: sie hat keine Leser im Client (keine
 * Row-Permissions, siehe Migration posts-010) und damit auch keine
 * Realtime-Relevanz.
 */
export const POST_VIEWS_TABLE = 'post_views'
/** F1 Stufe 4: verliehene Abzeichen, EINE Zeile je (Community, Nutzer, Abzeichen). */
export const USER_BADGES_TABLE = 'user_badges'
/**
 * F1 (gemeinsames Paket): die MITSCHREIBENDEN Zähler, EINE Zeile je
 * (Community, Nutzer).
 *
 * WARUM SIE DEM posts-LAYER GEHÖRT, obwohl auch `comments` hineinmeldet: sie
 * ist Discussions-Infrastruktur, und Discussions ist dieser Layer. Core besitzt
 * keine Tabellen (A14), `comments` darf `posts` nicht kennen — also gibt es
 * dazwischen einen Core-Vertrag (`registerUserCounterRecorder`), und die
 * Tabelle liegt bei dem Layer, der sie auch auswertet (Abzeichen, später Trust
 * Levels).
 */
export const MEMBER_COUNTERS_TABLE = 'member_counters'
/**
 * F57 Mechanik 1: die abgegebenen Emoji-Reaktionen, EINE Zeile je
 * (Ziel, Mensch, Reaktion) — Migration posts-017.
 *
 * DER UNIQUE-INDEX BRAUCHT KEINE `communityId` (Pool-Regel, und hier ist die
 * Ausnahme die richtige): sein erster Schluessel ist `targetId`, also eine
 * Appwrite-Row-Id — die ist global eindeutig, da kann kein Mandant mit einem
 * anderen kollidieren. Dieselbe Ueberlegung wie bei (courseId, userId); nur
 * mandanten-RELATIVE Schluessel wie Host oder Slug brauchen die Spalte im
 * Index. Gestempelt und gefiltert wird `communityId` trotzdem an jeder Stelle
 * — sie ist die Datentuer, nicht die Eindeutigkeit.
 */
export const DISCUSSION_REACTIONS_TABLE = 'discussion_reactions'
/**
 * F57 letzte Mechanik: der RÜCKVERWEIS-INDEX der Themen-Verlinkung, EINE Zeile
 * je (Quelle, Ziel) — Migration posts-020.
 *
 * KEINE zweite Wahrheit: welche Verweise ein Beitrag TRÄGT, steht in seinem
 * Text (`shared/topicLinks.ts`) und wird von dort gelesen. Diese Tabelle
 * beantwortet allein die Gegenrichtung — „wer zeigt auf mich?" —, die aus dem
 * Text eines fremden Beitrags nicht zu erfahren ist, ohne alle zu lesen.
 *
 * Der Unique-Index braucht wie bei den Reaktionen KEINE `communityId`: beide
 * Schlüssel sind Appwrite-Row-Ids und damit global eindeutig.
 */
export const DISCUSSION_LINKS_TABLE = 'discussion_links'

export const POST_TYPES = ['post', 'poll', 'question'] as const
export type PostType = (typeof POST_TYPES)[number]

/** scheduled = geplant (nur Autor sichtbar) · hidden = Moderation · deleted = Autor-Soft-Delete */
export type PostStatus = 'scheduled' | 'published' | 'hidden' | 'deleted'

export const MAX_POLL_OPTIONS = 6
export const MAX_POLL_OPTION_LENGTH = 100
export const MAX_POST_BODY = 10_000
export const MAX_POST_TITLE = 200

/**
 * Obergrenze der Kategorien je Community.
 *
 * 100 ist keine Produkt-Entscheidung, sondern die Grenze von `Query.equal`
 * (100 Werte) und die Zahl der Count-Abfragen, die die Kategorien-Ansicht
 * höchstens auslöst. Eine Community mit mehr als hundert Kategorien hat kein
 * Struktur-, sondern ein Ordnungsproblem — und würde es hier bemerken.
 *
 * Steht hier und nicht mehr in `server/utils/discussions.ts`, seit auch das
 * Zod-Schema der Reihenfolge sie braucht: ein Schema darf nicht in den
 * Server-Unterbau greifen.
 */
export const MAX_CATEGORIES = 100

/** Obergrenze der Positionszahl — die Reihenfolge ist eine Handvoll
 *  Kategorien, keine Sortier-Engine. */
export const MAX_CATEGORY_SORT_ORDER = 9999

export const MAX_CATEGORY_NAME = 80
export const MAX_CATEGORY_SLUG = 64
export const MAX_CATEGORY_DESCRIPTION = 500

export interface CommunityPost extends Models.Row {
  type: PostType
  /** optional — Fragen/Polls tragen die Frage oft nur im body */
  title: string | null
  /** Markdown-Subset (core shared/markdown.ts), niemals Raw-HTML */
  body: string
  authorId: string
  authorName: string
  status: PostStatus
  scheduledAt: string | null
  publishedAt: string | null
  /** JSON-Array der Optionstexte (max 6) — nur bei type 'poll' */
  pollOptions: string | null
  pollEndsAt: string | null
  /** denormalisiert, schreibt NUR der Server (Recount, Migration 003) */
  upvotes: number
  downvotes: number
  score: number
  /**
   * F1 Stufe 1: Row-Id der Kategorie ODER '' (keine).
   *
   * BEWUSST NICHT optional getippt, obwohl die Spalte additiv und leer-fähig
   * ist: `tenantDb().create<CommunityPost>` verlangt alle Nicht-`Models.Row`-
   * Felder VOLLSTÄNDIG (RowDataCreate). Ein `?` hier hätte bedeutet, dass jede
   * künftige Anlegestelle die Kategorie stillschweigend weglassen kann —
   * derselbe Grund, aus dem `createRow<TenantRow>` im Control Plane alle
   * Spalten erzwingt.
   *
   * '' statt null: die Spalte ist ein Varchar mit Default '' (Bestandszeilen
   * tragen genau das), und ein zweiter „leer"-Wert daneben wäre eine
   * Fallunterscheidung, die niemand gewinnt.
   */
  categoryId: string
  /**
   * F1 Stufe 2: WANN war an diesem Beitrag zuletzt etwas los — Veröffentlichung
   * oder eine ANTWORT darunter (Core-Vertrag `notifyContentActivity`, Migration
   * posts-009).
   *
   * WARUM ES DIESE SPALTE GIBT statt weiter `$updatedAt` zu lesen: `$updatedAt`
   * bewegt sich bei jeder STIMME (score.post.ts schreibt upvotes/downvotes/score
   * auf die Zeile) und bei keiner ANTWORT (die liegt im comments-Layer). Die
   * Spalte „Aktivität" zeigte damit genau das Falsche.
   *
   * `null` heißt „noch nie" — geplante Beiträge (`status: 'scheduled'`) tragen
   * es bis zur Veröffentlichung, Bestand von vor der Migration ebenfalls, bis
   * der Backfill ihn erreicht. Lesen deshalb NIE roh, sondern über
   * `topicActivityAt()` (shared/discussionActivity.ts).
   *
   * SCHREIBEN darf das ausschließlich der Server: der Handler in
   * server/plugins/content-activity.ts (Operator-Klinke) und die
   * Veröffentlichungs-Pfade. Es gibt keine Route, die den Wert aus einem Body
   * übernimmt — sonst könnte sich ein Beitrag nach oben schreiben.
   */
  lastActivityAt: string | null
  /**
   * F1 Stufe 3: die drei Zustände eines Themas (Migration posts-011).
   *
   * ORTHOGONAL zu `status`, nicht Teil davon — ein geschlossenes Thema ist
   * weiterhin veröffentlicht, ein angeheftetes kann zugleich gelöst sein. Die
   * ausführliche Begründung (inklusive der live geprüften Tatsache, dass
   * `status` nur ein varchar ist und die Alternative technisch möglich WÄRE)
   * steht im Kopf der Migration.
   *
   * PFLICHT im Typ, obwohl die Spalten additiv mit Default `false` angelegt
   * sind — dieselbe Entscheidung wie bei `categoryId` (posts-008): so muss
   * JEDE künftige Anlegestelle sie hinschreiben, statt sie stillschweigend
   * wegzulassen. Folge: die Migration MUSS vor dem Deploy laufen.
   *
   * `pinned` = steht in der Liste oben · `closed` = nimmt keine neuen
   * Kommentare mehr an (durchgesetzt über den Core-Vertrag
   * `assertContentWritable`) · `solved` = die Frage ist beantwortet.
   */
  pinned: boolean
  closed: boolean
  solved: boolean
  /**
   * F1: WANN wurde der INHALT dieses Beitrags zuletzt bearbeitet (Migration
   * posts-014) — `null` heißt „nie", nicht „unbekannt".
   *
   * AUSDRÜCKLICH NICHT `$updatedAt`, und das ist derselbe Grund wie bei
   * `lastActivityAt`: `$updatedAt` bewegt sich bei jeder Stimme (score.post.ts
   * schreibt die Zähler auf die Zeile), bei jedem Anheften und bei jedem
   * Umkategorisieren. Ein „bearbeitet" daraus stünde an Themen, an deren Text
   * nie jemand war — genau die Sorte Hinweis, die man nach drei Tagen nicht
   * mehr glaubt. `comments.editedAt` (Migration comments-005) macht es seit
   * jeher so; hier wird die Schuld nachgeholt.
   *
   * GESETZT WIRD ES NUR VOM AUTOR-PFAD (`[id].patch.ts`) und nur, wenn Titel
   * oder Text sich WIRKLICH geändert haben — die Regel dafür ist pur und
   * getestet (`shared/postEdit.ts`). Zustands-Änderungen (anheften, schließen,
   * gelöst) laufen über `state.patch.ts` und rühren die Spalte nicht an.
   *
   * PFLICHT im Typ, obwohl die Spalte additiv und leer-fähig ist — dieselbe
   * Entscheidung wie bei `categoryId` und den drei Zuständen: so muss jede
   * künftige Anlegestelle sich entscheiden. Folge: die Migration MUSS vor dem
   * Deploy laufen.
   */
  editedAt: string | null
  /**
   * ÜBERSETZUNGEN VON TITEL UND TEXT als JSON, Sprachcode → Fassung —
   * `''`/fehlend = nichts übersetzt (Migration posts-023).
   *
   * OPTIONAL im Typ, und das ist bewusst die GEGENENTSCHEIDUNG zu `categoryId`,
   * `pinned` und `editedAt` darüber: dort erzwingt die Pflicht, dass jede
   * Anlegestelle sich entscheidet. Hier gibt es nichts zu entscheiden — ein
   * frischer Beitrag ist nie übersetzt, und ein `translations: ''` in jedem
   * `create` wäre Zeremonie ohne Aussage. Sie fehlt zudem bei jeder Zeile aus
   * der Zeit vor der Migration.
   *
   * Gelesen wird sie AUSSCHLIESSLICH über `core/shared/ugcTranslations.ts`
   * (pur, fail-soft) und aufgelöst im Browser. Der Inhalt ist ein CACHE, kein
   * Inhalt des Autors: `[id].patch.ts` leert ihn, sobald sich Titel oder Text
   * wirklich ändern.
   */
  translations?: string
}

/**
 * Eine Discussions-Kategorie. Struktur ist ADMIN-Sache (Davids Vorgabe,
 * Konzept Teil 1) — Mitglieder eröffnen Topics darin, legen aber keine
 * Kategorien an.
 */
export interface PostCategory extends Models.Row {
  name: string
  /** URL-Segment. NACH DER ANLAGE FEST — die Kategorie-SEITE
   *  (/discussions/<slug>) ist der eine Link, der sich nicht über eine Id
   *  selbst heilen kann (pages-Muster „Später nicht änderbar"). */
  slug: string
  description: string
  sortOrder: number
  /** false = aus der öffentlichen Auswahl genommen, Bestand bleibt lesbar. */
  active: boolean
  /**
   * Name/Beschreibung je Sprache als JSON ('' = nichts übersetzt, dann gilt
   * überall die Grundfassung oben). Gelesen wird sie NUR über
   * `shared/categoryI18n.ts` — dort steht auch, warum die ADRESSE bewusst
   * nicht mitübersetzt wird. Fehlt bei Zeilen aus der Zeit vor posts-022.
   */
  translations: string
}

/**
 * Aufruf-Zähler EINES Topics (F1 Stufe 2). `$id` IST die Beitrags-Id — das
 * macht den Zähler ohne Nachschlagen adressierbar und den gepufferten
 * Schreibvorgang idempotent (anlegen ODER hochzählen, nie beides).
 */
export interface PostViewCounter extends Models.Row {
  postId: string
  count: number
}

export type PostVoteValue = 1 | -1

export interface PostVote extends Models.Row {
  postId: string
  userId: string
  value: PostVoteValue
}

/**
 * Antwort von `POST /api/posts/:id/score`: NUR die Zähler und die eigene
 * Stimme (SEC-031, 2026-11-13). Bis dahin stand hier der ganze Beitrag —
 * gelesen über die Operator-Klinke, also an den Row-Permissions vorbei. Die
 * Oberfläche übernimmt die Zähler in ihren Beitrag (`PostVoteButtons`).
 */
export interface PostVoteResponse {
  post: VoteCounts
  myVote: PostVoteValue | null
}

export interface PollVote extends Models.Row {
  postId: string
  userId: string
  optionIndex: number
}

/** Poll-Zustand, wie ihn der GET je Post anreichert */
export interface PollState {
  options: string[]
  /** Stimmen je Option — nur gefüllt, wenn results true */
  counts: number[]
  totalVotes: number
  /** eigene Stimme (Options-Index) oder null */
  myVote: number | null
  /** Ergebnisse sichtbar? (eigene Stimme abgegeben ODER Poll beendet) */
  results: boolean
  /** Poll beendet (pollEndsAt erreicht)? */
  ended: boolean
}

export interface FeedPost extends CommunityPost {
  authorAvatarUrl?: string
  /**
   * Der @-Name des Autors (ohne @), gebündelt aufgelöst wie der Avatar —
   * KEINE Spalte. Er trägt die Autoren-Aktionen der Kopfzeile (F56,
   * `CoreAuthorActions`): „dieser Person schreiben" braucht eine Adresse,
   * und die einzige, die dieses Produkt kennt, ist der Handle. Fehlt er
   * (Konto ohne Namen, Gast), bleibt die Zeile wie bisher.
   */
  authorHandle?: string
  poll?: PollState
  /** eigener Up-/Downvote auf den Post (nicht die Poll-Stimme) */
  myPostVote?: PostVoteValue | null
  /**
   * Die im Text genannten @handles, die es in dieser Community WIRKLICH gibt
   * (klein). Nur diese hebt `MarkdownContent` hervor — was hier fehlt, bleibt
   * gewöhnlicher Text. Vom Server aufgelöst, gebündelt für die ganze Seite.
   */
  mentions?: string[]
  /**
   * Die im Text genannten Themen-Verweise (`#<id>-<deko>`), aufgelöst und
   * fertig für `MarkdownContent` (F57). Was hier fehlt — gelöscht, verborgen,
   * fremde Community, erfundene Id —, bleibt gewöhnlicher Text.
   */
  topicLinks?: TopicLink[]
}

export interface PostListResponse {
  rows: FeedPost[]
  nextCursor: string | null
}

/**
 * Advisory-Antwort des KI-Moderations-Assists (POST /api/posts/:id/assist).
 * Bewusst lokal definiert (gleiche Shape wie admin ModerationAssist) statt
 * Cross-Package-Import — Layer bleiben entkoppelt, wie bei ModeratedComment.
 */
export interface PostModerationAssist {
  /** 'hide' = Ausblenden empfohlen · 'dismiss' = Beitrag ok, Meldungen verwerfen */
  action: 'hide' | 'dismiss'
  /** Schwere des Verstoßes 1 (harmlos) – 5 (gravierend) */
  severity: number
  /** 2-3 Sätze Begründung (Deutsch) */
  assessment: string
  /** Verwendetes Model (Transparenz im UI/Debugging) */
  model: string
}

export interface PostModerationResponse {
  rows: CommunityPost[]
  reportCounts: Record<string, number>
  /**
   * `prefs.avatarUrl` je Autor-Id — NICHT an der Zeile, weil dort nichts
   * steht: `community_posts` trägt den Namen denormalisiert, das Bild lebt in
   * den Account-prefs und wird je Liste gebündelt aufgelöst (`resolveAvatars`).
   * Fehlt ein Eintrag, zeigt die Tabelle Initialen.
   */
  avatarUrls: Record<string, string>
  /** true = KI-Assist nutzbar (pukalani.ai an + NUXT_AI_KEY gesetzt) → UI zeigt den Button */
  aiAssist: boolean
}

/**
 * „Meine Beiträge" (GET /api/posts/mine) — die Fläche der Capability
 * `posts.write` (C16). Bewusst dieselbe Shape wie die Moderations-Antwort,
 * nur ohne Meldungen und KI: ein Editor verwaltet seine eigenen Beiträge,
 * er moderiert nicht.
 */
export interface PostMineResponse {
  rows: CommunityPost[]
}

/**
 * EINE Zeile der Topics-Tabelle (F1 Stufe 1).
 *
 * BEWUSST NICHT `FeedPost`: die Übersicht zeigt Titel, Kategorie, Autor,
 * Stimmen und Zeit — der `body` (bis 10.000 Zeichen) hat dort nichts verloren,
 * und Umfrage-Zustände kosten pro Zeile mehrere Count-Abfragen. Die Detailseite
 * holt sich den vollen Beitrag.
 */
export interface DiscussionTopic {
  $id: string
  title: string
  /** Abgeleiteter Slug — der Client baut damit den kanonischen Link, ohne die
   *  Ableitungsregel ein zweites Mal zu kennen. */
  slug: string
  /** Kanonischer Pfad OHNE Locale-Prefix (localePath() setzt ihn). */
  path: string
  authorId: string
  authorName: string
  authorAvatarUrl?: string
  categoryId: string
  categoryName: string
  /**
   * Derselbe Name je Sprache ('de' → 'Allgemein'), nur wo übersetzt.
   *
   * Die Themen-Liste zeigt den Kategorie-Namen, holt aber keine Kategorien —
   * ohne diese Karte müsste sie es tun (ein zweiter Abruf je Liste) oder in
   * einer Sprache den falschen Namen zeigen. Nur NAMEN, keine Beschreibungen:
   * die stehen in keiner Liste, und die Antwort soll klein bleiben.
   */
  categoryNames?: Record<string, string>
  categorySlug: string
  score: number
  publishedAt: string | null
  /**
   * Spalte „Aktivität". QUELLE seit Stufe 2: `community_posts.lastActivityAt`
   * mit der Rückfall-Kette aus `topicActivityAt()` — also Veröffentlichung ODER
   * letzte Antwort, und ausdrücklich NICHT `$updatedAt` (das bewegte jede
   * Stimme mit und keine Antwort).
   */
  lastActivityAt: string
  /**
   * Spalte „Aufrufe" (F1 Stufe 2) — Aggregat aus `post_views`, NICHT von der
   * Beitrags-Zeile (Begründung bei POST_VIEWS_TABLE).
   *
   * `0` ist hier eine ECHTE Aussage („noch nie aufgerufen") und kein
   * Platzhalter: die Zahl kommt aus derselben Antwort wie die Zeile, ist also
   * immer geprüft. Deshalb zeigt die Tabelle sie als Null — anders als die
   * Antwort-Anzahl, die die Komposition nachlädt und bis dahin als „—" führt.
   *
   * BIS ZU EINER MINUTE ALT: die Zähler werden gepuffert geschrieben
   * (server/utils/topicViews.ts). Für ein Aggregat ist das die richtige
   * Abwägung — der Preis exakter Zahlen wäre ein Datenbank-Schreibvorgang je
   * Seitenaufruf eines Unangemeldeten, auf einem geteilten Pool.
   */
  views: number
  /**
   * F1 Stufe 3: die Zustände, als Abzeichen in der Themen-Spalte. Sie stehen
   * hier, weil die Liste sie ZEIGT und danach FILTERT — beides ginge sonst nur
   * über einen zweiten Abruf je Zeile.
   */
  pinned: boolean
  closed: boolean
  solved: boolean
}

export interface DiscussionListResponse {
  rows: DiscussionTopic[]
  nextCursor: string | null
}

/** Detailansicht: der volle Beitrag plus seine Kategorie (für Kopfzeile/Canonical). */
export interface DiscussionTopicResponse {
  post: FeedPost
  category: PostCategory
  /** Kanonischer Pfad — der Server rechnet ihn, der Client vergleicht nur. */
  path: string
  slug: string
}

/** Kategorie samt Anzahl ihrer Topics (Kategorien-Ansicht + Dashboard). */
export interface CategoryWithCount {
  category: PostCategory
  topicCount: number
}

export interface CategoryListResponse {
  rows: CategoryWithCount[]
}

/** Dasselbe für die VERWALTUNG, plus die Frage, ob der KI-Knopf erscheinen darf. */
export interface CategoryManageResponse extends CategoryListResponse {
  aiTranslate: boolean
}

/**
 * Antwort auf das Speichern der Reihenfolge: die GANZE Ordnung, nicht nur die
 * geschriebenen Zeilen. Die Oberfläche übernimmt daraus ihren Stand (Muster
 * `PATCH /api/pages/navigation`), statt ihn sich aus dem eigenen Entwurf
 * zusammenzureimen — dann steht dort auch nach einem Zug, den der Server
 * anders vergeben hat, dasselbe wie in der Datenbank.
 */
export interface CategoryOrderResponse {
  order: CategoryOrderEntry[]
}

/**
 * Antwort von `POST /api/posts/:id/translate` — die Fassung EINES Beitrags in
 * EINER Sprache.
 *
 * `title` ist `null`, wenn das Original keinen hat (Fragen und Umfragen tragen
 * ihn oft nur im Text) — nie `''`: die Oberfläche soll „kein Titel" nicht von
 * „leerer Titel" unterscheiden müssen.
 *
 * `cached` sagt, ob dafür gerade ein KI-Aufruf bezahlt wurde (`false`) oder ob
 * die Fassung schon auf der Zeile lag (`true`) — die Oberfläche kann daran den
 * Unterschied zwischen „sofort da" und „hat eben gerechnet" zeigen, und ein
 * Beweis-Skript ohne dieses Feld könnte nicht prüfen, dass ein zweiter Klick
 * nichts mehr kostet.
 */
export interface PostTranslateResponse {
  locale: string
  title: string | null
  body: string
  /**
   * Die übersetzten Umfrage-Optionen in der Reihenfolge des Originals — `null`
   * bei allem, was keine Umfrage ist, bei Bestands-Caches von vor dem
   * 2026-08-18 UND immer dann, wenn die Antwort der KI die Anzahl der Optionen
   * verfehlt hat (`translatedPollOptions`).
   *
   * `null` heißt IMMER „nimm die Originale", nie „keine Optionen". Die Anzeige
   * prüft die Anzahl trotzdem ein zweites Mal: zwischen Übersetzung und
   * Darstellung kann der Autor seine Umfrage geändert haben.
   */
  options: string[] | null
  cached: boolean
}

/** Vorschlag der KI für EINE Zielsprache — advisory, der Mensch speichert. */
export interface CategoryTranslateResponse {
  locale: string
  name: string
  description: string
  /** Welches Modell geantwortet hat — dieselbe Offenlegung wie beim Moderations-Assist. */
  model: string
}

/**
 * Die Zahlen der About-Seite (F1 Stufe 2) — AUSSCHLIESSLICH das, was aus
 * `community_posts` belegbar ist.
 *
 * Drei Kennzahlen aus Davids Katalog fehlen hier bewusst (aktive Nutzer,
 * Likes gesamt, Gründungsdatum). Welche Quelle ihnen jeweils fehlt und was sie
 * kosten würden, steht vollständig im Kopf von
 * server/api/posts/discussions/about.get.ts — sie sind weggelassen, nicht
 * vergessen. Die vierte („Beitritte") ist seit F1/2026-08-04 da, aber OPTIONAL:
 * sie kommt aus dem Control Plane und fehlt, wo es keine Naht dorthin gibt.
 */
export interface DiscussionAboutResponse {
  /** Veröffentlichte Beiträge MIT Kategorie. */
  topicsTotal: number
  /** Davon in den letzten 7 Tagen (rollierendes Fenster). */
  topicsLast7Days: number
  /** Veröffentlichte Beiträge seit UTC-Mitternacht — der GANZE Strom, mit und
   *  ohne Kategorie (Davids Entscheidung 2: eine Community hat EINEN Ort). */
  postsToday: number
  /** Sichtbare Kategorien. */
  categories: number
  /**
   * Beitritte der letzten 7 Tage (`community_members` im Control Plane).
   *
   * OPTIONAL und NIEMALS 0 als Ersatz: fehlt das Feld, war die Zahl nicht zu
   * ermitteln (App ohne Control-Plane-Naht, Lesefehler — oder ein Gast in einer
   * geschlossenen Community). Die Oberfläche zeigt die Kachel dann gar nicht.
   */
  signupsLast7Days?: number
}

/**
 * Seitenleiste (Davids Entscheidung 7): meine letzten Kategorien, sonst die
 * größten. `source` sagt der Oberfläche, welche Überschrift stimmt — ein
 * „Deine Kategorien" über den fünf größten wäre eine Lüge.
 */
export interface DiscussionSidebarResponse {
  rows: PostCategory[]
  source: 'mine' | 'largest'
}

/**
 * EIN verliehenes Abzeichen (F1 Stufe 4, Migration posts-012).
 *
 * Kein `awardedAt`-Feld: `$createdAt` IST der Zeitpunkt der Verleihung, und
 * eine zweite Spalte daneben wäre eine zweite Wahrheit über dasselbe. Die
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür.
 */
/** Antwort der gebündelten Leseroute: Ziel-Id → Chips, plus der erlaubte Satz. */
export interface ReactionsResponse {
  reactions: ReactionSummary
  /** Was diese App zulässt — die UI baut ihr „+"-Menü daraus, nie aus der Registry. */
  allowed: ReactionKey[]
}

/** Antwort des Umschaltens: der neue Stand GENAU dieses Ziels. */
export interface ReactionToggleResponse {
  targetId: string
  reactions: ReactionCount[]
}

/**
 * EINE abgegebene Emoji-Reaktion (F57, Migration posts-017).
 *
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür (Muster
 * `UserBadge`, `MemberCounters`). `reaction` trägt den SCHLÜSSEL aus
 * `shared/reactions.ts`, nie das Zeichen selbst (Begründung dort).
 */
export interface DiscussionReaction extends Models.Row {
  /** Art des Ziels — heute ausschließlich 'post'. Siehe `REACTION_TARGET_TYPES`. */
  targetType: string
  /** Row-Id des Ziels (global eindeutig, deshalb trägt sie den Unique-Index). */
  targetId: string
  userId: string
  /** Schlüssel aus `REACTION_KEYS`, z. B. 'tada'. */
  reaction: string
}

/**
 * EIN Rückverweis-Eintrag (F57, Migration posts-020).
 *
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür (Muster
 * `DiscussionReaction`, `UserBadge`). Es gibt auch KEIN `authorId`: die Zeile
 * trägt damit nichts Personenbezogenes und braucht keinen GDPR-Beitrag
 * (Begründung im Kopf der Migration).
 */
export interface DiscussionLink extends Models.Row {
  /** Row-Id des Beitrags, der den Verweis SCHREIBT. */
  sourceId: string
  /** Row-Id des Themas, auf das er ZEIGT. */
  targetId: string
}

/**
 * Ein im Beitragstext aufgelöster Themen-Verweis — die Form, die
 * `MarkdownContent` erwartet (`core/shared/contentLinks.ts`).
 *
 * `token` ist WÖRTLICH die Schreibweise aus dem Text, `label` der HEUTIGE
 * Titel des Ziels. Dass beide auseinanderfallen dürfen, ist Absicht: wer sein
 * Thema umbenennt, ändert damit die Anzeige in jedem fremden Beitrag, der
 * darauf zeigt — ein eingefrorener Linktext täte das nicht.
 */
export interface TopicLink {
  token: string
  href: string
  label: string
}

/** Ein Thema, das auf das gerade gezeigte verweist („Verlinkt von …"). */
export interface TopicBacklink {
  $id: string
  title: string
  path: string
}

/** Antwort von GET /api/posts/discussions/backlinks. */
export interface TopicBacklinksResponse {
  backlinks: TopicBacklink[]
}

/** Ein Treffer der Themen-Suche im Editor-Menü (GET .../link-search). */
export interface TopicLinkSuggestion {
  /** Der einzufügende Token, fertig gebildet (`#<id>-<deko>`). */
  id: string
  /** Was im Menü steht — der Titel des Themas. */
  label: string
}

export interface UserBadge extends Models.Row {
  userId: string
  badgeKey: string
  /**
   * WOFÜR es verliehen wurde (F1 Teilpaket 2, Migration posts-015) — und damit
   * das, was eine zweite Verleihung von einer Wiederholung unterscheidet:
   * Row-Id des Inhalts (Posting-Gruppe) · Nummer des Mitgliedsjahres
   * (Jahrestag) · `''` bei einmaligen Abzeichen UND bei jeder Bestandszeile aus
   * der Zeit davor.
   *
   * Der Unique-Index (communityId, userId, badgeKey, qualifier) ist die ganze
   * Mechanik: verliehen wird blind, ein 409 heißt „dafür hat er es schon".
   */
  qualifier: string
}

/**
 * DIE MITSCHREIBENDEN ZÄHLER EINES MENSCHEN in EINER Community (F1, Migration
 * posts-013).
 *
 * Alle Zahlen sind ADDITIV geführt: sie werden beim Schreiben hoch- und beim
 * Zurücknehmen heruntergezählt, nie neu berechnet. Ausnahme ist der EINE
 * Startvorgang (`seeded`), der sie aus den Aggregaten setzt.
 *
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür (Muster
 * `UserBadge`).
 */
export interface MemberCounters extends Models.Row {
  userId: string
  /** Eigenständige, veröffentlichte Beiträge. */
  topicsCreated: number
  /** Geschriebene Antworten (Kommentare). */
  repliesCreated: number
  /** Selbst vergebene Aufstimmen. */
  upvotesGiven: number
  /** Auf eigene Inhalte erhaltene Aufstimmen. */
  upvotesReceived: number
  /** Bearbeitungen EIGENER Inhalte. */
  edits: number
  /**
   * Selbst ABGEGEBENE Emoji-Reaktionen (F57, Migration posts-017).
   *
   * Es gibt bewusst kein Gegenstück `reactionsReceived`: Reaktionen sind
   * badge-neutral (Konzept Teil 4 Punkt 3), erhaltene werden nirgends gezählt.
   * Der einzige Verbraucher ist das Abzeichen `first-reaction`.
   */
  reactionsGiven: number
  /**
   * Gesetzte Themen-Verweise (F57, Migration posts-020) — der Zähler hinter
   * „First Link".
   *
   * Gezählt werden NEU angelegte Rückverweis-Zeilen, nicht Tokens im Text:
   * wer denselben Verweis beim Bearbeiten stehen lässt, zählt nicht erneut,
   * und ein Verweis auf ein nicht existierendes Thema zählt nie. Startet für
   * alle bei 0 und wird NIE geeicht (kein `authorId` an der Zeile — siehe
   * Migration).
   */
  linksMade: number
  /**
   * Wurden die Startwerte schon aus den Aggregaten gesetzt?
   *
   * DIE ZEILE ALLEIN REICHT ALS ANTWORT NICHT, und das ist der Grund für dieses
   * Feld: die Zeile entsteht beim ERSTEN Ereignis — das kann eine einzige
   * vergebene Stimme sein, auch bei jemandem, der vorher 500 vergeben hat. Ohne
   * die Unterscheidung „existiert" gegen „geeicht" stünde dort dann eine 1, und
   * ein längst verdientes Abzeichen wäre verloren.
   */
  seeded: boolean
  /**
   * Die ERARBEITETE Vertrauensstufe 0–3 (F1 Teilpaket 3, Migration posts-016).
   *
   * Wird ausschließlich nach OBEN geschrieben (`raisedTrustLevel`) — kein
   * Abstieg, Davids Entscheidung. Eine 4 steht hier nie: die kommt aus
   * `trustLevelLeader`. Bestandszeilen tragen NULL und werden beim Lesen zu 0
   * (`normalizeTrustLevel`); das ist die Wahrheit, nicht ein Loch — für sie
   * wurde die Stufe schlicht noch nie gerechnet.
   */
  trustLevel: number
  /**
   * Die von Hand ernannte Stufe 4 („Leader") — gesetzt und zurückgenommen vom
   * Owner (`posts.appoint`), nie von einer Rechnung.
   *
   * Getrennt von `trustLevel`, damit ein Entzug genau eine Entscheidung
   * zurücknimmt und nicht nebenbei die erarbeitete Stufe löscht (vollständige
   * Begründung im Kopf von Migration posts-016).
   */
  trustLevelLeader: boolean
  /**
   * DER TAGESSTAND DES LIKE-LIMITS (F57 Mechanik 3, Migration posts-019) —
   * `likeDay` + `likesToday` gehören zusammen und sind nur zusammen wahr.
   *
   * `likeDay` ist der UTC-Kalendertag (`YYYY-MM-DD`, `''` = noch nie gestimmt),
   * `likesToday` die Anzahl der an JENEM Tag vergebenen Aufstimmen. Der
   * Tageswechsel ist deshalb kein Sweep, sondern ein Vergleich beim nächsten
   * Like: steht dort ein anderer Tag, ist der alte Stand bedeutungslos und wird
   * überschrieben. Ein nächtlicher Lauf, der Millionen Zeilen auf 0 setzt,
   * wäre Arbeit für Zeilen, die an dem Tag ohnehin niemand anfasst.
   */
  likeDay: string
  likesToday: number
  /**
   * An WIE VIELEN Tagen das Limit erreicht wurde — der Zähler hinter „Out of
   * Love" / „Higher Love" / „Crazy in Love" (1 / 5 / 20 Tage).
   *
   * Rein mitschreibend wie `edits` und `invitesAccepted`: er wird nie geeicht,
   * weil es kein Aggregat gibt, aus dem sich vergangene Tage ableiten ließen.
   */
  likeLimitDays: number
  /**
   * Der Tag, für den `likeLimitDays` zuletzt hochgezählt wurde (F57-Stufen,
   * Migration posts-021) — `''` = noch nie.
   *
   * DIE ZUSAGE „GENAU EINMAL JE TAG" HÄNGT SEIT DER STAFFEL AN DIESER SPALTE:
   * das Limit ist an einem Tag nicht mehr fest, weil ein Aufstieg mitten am
   * Tag passieren kann (siehe `booksLikeLimitDay`). Die Gleichheit
   * `likesToday === limit` allein trifft dann zweimal.
   */
  likeLimitDay: string
  /**
   * WER DIESEN MENSCHEN EINGELADEN HAT (F57-Stufen, Migration posts-021) —
   * `''` = niemand (selbst gekommen, oder Einladung von vor diesem Paket).
   *
   * Die Runtime-Ablage einer Tatsache, deren Wahrheit im CONTROL PLANE steht
   * (`community_invites.invitedBy`): hinterlegt EINMAL bei der Annahme, danach
   * nie wieder angefasst. Sie macht den Aufstiegs-Hook zu einer reinen
   * Runtime-Sache — ohne sie müsste jeder Stufen-Aufstieg über die Projekt-
   * grenze fragen, wer den Aufsteiger hergeholt hat.
   *
   * NUR WENN LEER wird geschrieben: die erste Einladung gewinnt. Wer entfernt
   * und später erneut eingeladen wird, zählt weiter für den, der ihn zuerst
   * geholt hat — sonst wäre eine zweite Einladung ein Weg, eine bestehende
   * Zuordnung umzuschreiben.
   */
  invitedBy: string
  /**
   * Wie viele EINGELADENE dieses Menschen Stufe 1 bzw. Stufe 2 erreicht haben
   * (F57-Stufen) — die Zähler hinter `campaigner` (3) und `champion` (5).
   *
   * Gebucht beim Aufstieg des EINGELADENEN, nicht bei einer eigenen Handlung.
   * Rein mitschreibend, nie geeicht.
   */
  inviteesBasic: number
  inviteesMember: number
}

/**
 * Ein Mensch in der Stufen-Verwaltung des Owners (F1 Teilpaket 3).
 *
 * Bewusst KEINE E-Mail: die Fläche beantwortet „wer bekommt Stufe 4", nicht
 * „wer ist hier angemeldet" — dieselbe Zurückhaltung wie bei der redigierten
 * Team-Sicht der About-Seite.
 */
export interface TrustLevelMember {
  userId: string
  /** Anzeigename aus dem Konto — leer, wenn er nicht aufzulösen war. */
  name: string
  /**
   * `prefs.avatarUrl` aus dem Konto; '' = keins hinterlegt oder nicht
   * auflösbar. Kommt aus DERSELBEN Abfrage wie der Name (`resolveUserCards`)
   * — die Zeilen hier führen nur Ids, deshalb ist beides ein Lookup und nicht
   * eine denormalisierte Spalte.
   */
  avatarUrl: string
  /** Die WIRKENDE Stufe (erarbeitet oder ernannt). */
  level: number
  /** Die erarbeitete Stufe allein — sichtbar, damit ein Entzug erklärbar ist. */
  earnedLevel: number
  leader: boolean
  /** Eröffnete Themen plus geschriebene Antworten. */
  contentCreated: number
  upvotesGiven: number
  upvotesReceived: number
  /** Wann zuletzt an dieser Zeile etwas passiert ist (ISO). */
  updatedAt: string
}

export interface TrustLevelMembersResponse {
  /** Die aktuell Ernannten — vollständig, sie sind wenige. */
  leaders: TrustLevelMember[]
  /** Die zuletzt aktiven Mitglieder mit Zählern (gedeckelt, s. `truncated`). */
  members: TrustLevelMember[]
  /** Gab es mehr, als die Seite zeigt? Dann hilft nur die Suche. */
  truncated: boolean
}

/** Ein Eintrag der Abzeichen-Galerie: Katalog-Zeile plus eigener Stand. */
export interface DiscussionBadge {
  key: string
  group: BadgeGroup
  earned: boolean
  /**
   * Wann ZULETZT verliehen (ISO) — `null`, solange unverdient.
   *
   * Zuletzt und nicht zuerst: bei einem mehrfach verliehenen Abzeichen ist der
   * jüngste Verdienst die Neuigkeit, und die Galerie sagt „verliehen vor …".
   */
  awardedAt: string | null
  /** Wie oft verliehen (F1 Teilpaket 2) — 0, solange unverdient. */
  count: number
}

export interface DiscussionBadgesResponse {
  /** IMMER der volle Katalog, auch für Gäste: die Galerie zeigt, was es hier
   *  zu holen gibt, nicht nur das schon Erreichte. */
  rows: DiscussionBadge[]
  /**
   * Die gemessenen Zahlen — `null` für Gäste (es gibt niemanden zu messen).
   * Sie stehen in der Antwort, damit die Galerie den Fortschritt zeigen kann
   * („20 von 100"), ohne die Zählung ein zweites Mal anzustoßen.
   */
  facts: BadgeFacts | null
  /**
   * Die WIRKENDE Vertrauensstufe 0–4 (F1 Teilpaket 3) — 0 für Gäste.
   *
   * Sie steht NEBEN `facts.trustLevel` (dieselbe Zahl) und nicht nur darin,
   * weil `facts` für Gäste null ist und der Stufen-Abschnitt der Galerie auch
   * dort etwas zeigen können soll: die Stufen sind eine Auskunft darüber, was
   * es hier zu erreichen gibt.
   */
  trustLevel: number
  /**
   * Der Weg zur nächsten erarbeitbaren Stufe — `null`, wenn es keinen gibt
   * (Stufe 3 erreicht, Ernennung, oder Gast).
   */
  trustProgress: TrustLevelProgress | null
  /**
   * DAS TAGES-LIMIT FÜR ZUSTIMMUNGEN, so wie es für DIESEN Menschen gilt
   * (F57-Stufen) — und was die nächste Stufe daran ändert.
   *
   * ES STEHT HIER, WEIL DIE STUFE SONST ETWAS VERSPRICHT, WAS NIEMAND SIEHT:
   * „mehr Tages-Likes" ist keine Aussage, „100 statt 75 am Tag" ist eine. Die
   * Zahlen kommen aus der Staffel-Config und werden NIE in einen
   * Übersetzungs-Text geschrieben — sonst stünde nach der ersten Änderung der
   * Config eine Zusage in der Oberfläche, die das Produkt nicht mehr hält.
   *
   * `next` ist `null`, wenn es keine nächste Stufe gibt ODER wenn sie am
   * Kontingent nichts ändert (TL0 → TL1). Eine Zeile „ab Stufe 1: genauso
   * viele" wäre Lärm.
   *
   * `0` heißt: es gibt kein Limit (Mechanik aus). Die Galerie sagt dann gar
   * nichts — ein „unbegrenzt" wäre eine Zusage, die eine Config-Änderung
   * still zurücknimmt.
   */
  likeLimit: { current: number, next: { level: number, limit: number } | null }
}
