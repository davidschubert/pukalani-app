import { Query } from 'node-appwrite'
import { SORT_MODES } from '../../../schemas/comment'
import { hotness } from '../../../shared/sort'
/**
 * AUSDRÜCKLICH IMPORTIERT, NICHT AUTO-IMPORTIERT (F57, beim Bau live
 * erwischt). Nitros Auto-Import ist über ALLE Layer FLACH: `posts` hat in
 * `server/utils/reactions.ts` gleichnamige Helfer, und bei einer Kollision
 * gewinnt einer — hier gewann posts. Die Liste hätte damit still
 * `discussion_reactions` gelesen und den Emoji-Satz der THEMEN angewendet;
 * sichtbar war das nur als `WARN Duplicated imports` in einem Dev-Log.
 * Deshalb tragen die Helfer dieses Layers seither eindeutige Namen UND
 * werden hier explizit geholt — der Import ist die Zusicherung, der Name die
 * Vorsichtsmaßnahme.
 */
import { allowedCommentReactionsFor, loadCommentReactionSummary } from '../../utils/commentReactions'
import { toPublicCommentRow } from '../../utils/commentTombstone'
import {
  COMMENTS_TABLE,
  VOTES_TABLE,
  type Comment,
  type CommentVote,
  type CommentListResponse,
  type SortMode,
  type VoteValue,
} from '../../../shared/types/comment'

const PAGE_SIZE = 25
// Trending/Meistdiskutiert lassen sich nicht als Appwrite-Query ausdrücken →
// server-seitige Sortierung über ein begrenztes Fenster der NEUESTEN Threads.
const WINDOW_CAP = 200
// Antwort-Zählung (Meistdiskutiert): schlanke rootId-Sammlung übers Fenster
const COUNT_PAGE = 500
const COUNT_HARD_CAP = 5_000
// Antworten je geladener Thread-Seite (komplette Subtrees) werden per Cursor
// VOLLSTÄNDIG eingesammelt; die Seitengröße ist nur die Batch-Größe. Die harte
// Obergrenze ist ein Notanker gegen entgleisende Pagination — wird sie erreicht,
// loggen wir den Verlust, statt still zu kappen.
const REPLY_PAGE = 500
const REPLY_HARD_CAP = 10_000

// Gast-Microcache (Idee 3): Seite 1 pro Target+Sort für wenige Sekunden —
// fängt Lastspitzen ab (Embed/Landingpage: bis zu 4 Appwrite-Queries pro
// Request). NUR für Gäste (myVotes/myReports leer → keine User-Daten im
// Cache); Realtime bleibt unberührt (Events mergen client-seitig).
const GUEST_TTL_MS = 10_000
const guestCache = createMicrocache<CommentListResponse>(GUEST_TTL_MS)

/**
 * Kommentare eines Targets — paginiert über TOP-LEVEL-Threads, jeder mit seinem
 * kompletten Subtree (rootId-Index). So sind Antworten nie verwaist (ihr
 * Eltern-Thread ist immer mitgeladen). hidden wird ausgefiltert; deleted bleibt
 * drin (Soft-Delete → "[gelöscht]"-Platzhalter). myVotes/myReports des
 * eingeloggten Users kommen aus gebündelten Queries (kein N+1).
 */
export default defineEventHandler(async (event): Promise<CommentListResponse> => {
  const query = getQuery(event)
  const targetId = String(query.targetId ?? '')
  const targetType = String(query.targetType ?? '')
  if (!targetId || !targetType) {
    throw createError({ status: 400, statusText: 'targetId and targetType are required' })
  }

  const sort = SORT_MODES.includes(query.sort as SortMode) ? query.sort as SortMode : 'new'
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const isGuest = !event.context.user
  // Tenant gehört in den Key: ohne ihn serviert der Gast-Cache Kunde B die
  // Seite von Kunde A (Cross-Tenant-Leak — im Platform-E2E real gefangen).
  // Single-Tenant-Betrieb: Tenant null → konstantes Präfix, Verhalten wie bisher.
  const tenant = useTenant(event)
  const tenantKey = tenant?.mode === 'pool' ? tenant.tenantId : 'single'
  const cacheKey = `${tenantKey}:${targetType}:${targetId}:${sort}`
  if (isGuest && page === 1) {
    const cached = guestCache.get(cacheKey)
    if (cached) return cached
  }

  // Alle Abfragen dieser Route gehen durch die mandantensichere Tür — der
  // Filter kommt von dort, nicht aus baseFilters (siehe CLAUDE.md).
  const db = tenantDb(event)

  // Fenster-Sorts: erst die neuesten WINDOW_CAP Threads holen, in-memory
  // ranken, dann slicen (sonst würde nur EINE $createdAt-Seite umsortiert)
  const windowed = sort === 'trending' || sort === 'discussed'
  const offset = (page - 1) * PAGE_SIZE

  // Die fachlichen Filter. Den Mandanten hängt die Tür an — deshalb steht er
  // hier NICHT mehr, und deshalb kann ihn hier auch niemand vergessen.
  const baseFilters = [
    Query.equal('targetId', targetId),
    Query.equal('targetType', targetType),
    Query.notEqual('status', 'hidden'),
  ]

  // Stabiler Sekundär-Sort: ohne Tiebreaker können Zeilen mit gleichem score
  // (viele bei 0) über Seitengrenzen doppeln oder fehlen.
  const order = sort === 'top'
    ? [Query.orderDesc('score'), Query.orderDesc('$createdAt')]
    : [Query.orderDesc('$createdAt')]

  // 1) Top-Level-Threads paginieren (parentId null)
  const topRes = await db.list<Comment>(COMMENTS_TABLE, [
    ...baseFilters,
    Query.isNull('parentId'),
    ...order,
    Query.limit(windowed ? WINDOW_CAP : PAGE_SIZE),
    Query.offset(windowed ? 0 : offset),
  ])

  let ranked = topRes.rows
  if (sort === 'trending') {
    // Zeit-Zerfall (HN-Gravity): frisch + Zuspruch schlägt alt + Bestand
    const now = Date.now()
    ranked = [...topRes.rows].sort((a, b) => hotness(b, now) - hotness(a, now))
  }
  else if (sort === 'discussed') {
    // Meistdiskutiert: Antworten je Thread übers Fenster zählen — schlanke
    // rootId-Sammlung (Query.select), chunked (Query.equal max 100 Werte)
    const counts = new Map<string, number>()
    const rootIds = topRes.rows.map(row => row.$id)
    for (let i = 0; i < rootIds.length; i += 100) {
      const chunk = rootIds.slice(i, i + 100)
      let cursor: string | undefined
      let collected = 0
      while (collected < COUNT_HARD_CAP) {
        const res = await db.list<Comment>(COMMENTS_TABLE, [
          ...baseFilters,
          Query.equal('rootId', chunk),
          Query.select(['$id', 'rootId']),
          Query.limit(COUNT_PAGE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ])
        for (const row of res.rows) {
          if (row.rootId) counts.set(row.rootId, (counts.get(row.rootId) ?? 0) + 1)
        }
        collected += res.rows.length
        if (res.rows.length < COUNT_PAGE) break
        cursor = res.rows.at(-1)!.$id
      }
    }
    ranked = [...topRes.rows].sort((a, b) =>
      (counts.get(b.$id) ?? 0) - (counts.get(a.$id) ?? 0)
      || Date.parse(b.$createdAt) - Date.parse(a.$createdAt))
  }

  const topLevel = windowed ? ranked.slice(offset, offset + PAGE_SIZE) : topRes.rows
  const topLevelTotal = windowed ? Math.min(topRes.total, WINDOW_CAP) : topRes.total

  // 2) Komplette Subtrees der geladenen Threads (rootId-Index) — keine Waisen.
  // Cursor-Pagination bis zur Erschöpfung statt eines einzelnen 500er-Fensters.
  const replies: Comment[] = []
  if (topLevel.length > 0) {
    const rootIds = topLevel.map(t => t.$id)
    let cursor: string | undefined
    while (replies.length < REPLY_HARD_CAP) {
      const repRes = await db.list<Comment>(COMMENTS_TABLE, [
        ...baseFilters,
        Query.equal('rootId', rootIds),
        Query.limit(REPLY_PAGE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ])
      replies.push(...repRes.rows)
      if (repRes.rows.length < REPLY_PAGE) break
      cursor = repRes.rows.at(-1)!.$id
    }
    if (replies.length >= REPLY_HARD_CAP) {
      console.warn(`[comments] Antworten an REPLY_HARD_CAP (${REPLY_HARD_CAP}) gekappt — target ${targetType}:${targetId}`)
    }
  }

  // 3) Zwei Zähler: total (nicht-hidden, inkl. deleted-Platzhalter) bleibt der
  // Pagination-Sentinel; activeTotal (nur active) ist die Anzeige-Zahl — ein
  // gelöschter Kommentar zählt nirgends mehr als Kommentar.
  const [total, activeTotal] = await Promise.all([
    db.count(COMMENTS_TABLE, baseFilters),
    db.count(COMMENTS_TABLE, [
      Query.equal('targetId', targetId),
      Query.equal('targetType', targetType),
      Query.equal('status', ['active']),
    ]),
  ])

  // Soft-gelöschte bleiben als Thread-Platzhalter in der Antwort, aber Inhalt/
  // Autor werden SERVER-seitig geblankt — der „[gelöscht]"-Text der UI wäre
  // sonst reine Kosmetik (Original-Content per direktem Aufruf DIESER Route
  // weiter lesbar). Die Zeile selbst leert das nicht — das tut seit SEC-032
  // erst das Löschen in der Datenbank (unten).
  //
  // SEC-032 (2026-11-15): über eine FELDAUSWAHL statt `{ ...row, content: '' }`
  // — die Kopie trug den Übersetzungs-Cache und `$permissions` (darin der
  // Autor) mit. Seit demselben Tag ist ein neu gelöschter Kommentar auch in
  // der Datenbank leer; die Auswahl hier deckt den BESTAND davor ab und jede
  // künftige Spalte. `$permissions` fällt für JEDE Zeile dieser öffentlichen
  // Antwort (Begründung an `toPublicCommentRow`).
  const combined = [...topLevel, ...replies].map(toPublicCommentRow)

  // Avatar-URLs der Autoren aus den Account-prefs anreichern (gebündelt, immer aktuell)
  const authorIds = combined.filter(row => row.authorId).map(row => row.authorId)
  const avatars = await resolveAvatars(event, authorIds)

  /**
   * „Ehemaliges Mitglied" (N9): welche dieser Autoren wurden aus DIESER
   * Community entfernt? EINE gebündelte Abfrage über den Ehemaligen-Vertrag
   * (core), pro Nutzer 60 s gecacht — und fail-soft: ohne Mandanten-Kontext,
   * ohne Resolver oder bei einem Lesefehler kommt ein leeres Set zurück und die
   * Liste sieht aus wie vorher.
   *
   * WARUM AUCH FÜR GÄSTE (bewusst, nicht aus Versehen): Davids Begründung für
   * das Zeichen ist der LESER — er soll verstehen, warum diese Person nicht mehr
   * antwortet. Ein Zeichen, das nur Angemeldete sehen, erklärt genau dem
   * niemandem etwas. Bezahlbar ist das, weil (a) die Frage negativ gestellt ist
   * und Entfernungen selten sind, (b) der Cache pro AUTOR greift (ein Thread
   * fragt seine Autoren einmal pro Minute, nicht pro Aufruf), und (c) Seite 1
   * für Gäste ohnehin im Microcache liegt.
   */
  const formerMembers = await resolveFormerMembers(event, authorIds)
  /**
   * Die @-Namen derselben Autoren (F56) — EINE gebündelte Abfrage je Seite,
   * dieselbe Regel wie oben: `authorIds` enthält Gäste gar nicht erst
   * (authorId ''), und wer keinen Namen hat, fehlt in der Map und bekommt
   * keine Aktion neben seinen Namen.
   */
  const handles = await resolveUserHandles(event, authorIds)
  const rows = combined.map(row => ({
    ...row,
    authorAvatarUrl: avatars.get(row.authorId),
    ...(handles.has(row.authorId) ? { authorHandle: handles.get(row.authorId) } : {}),
    ...(formerMembers.has(row.authorId) ? { authorFormerMember: true } : {}),
  }))

  const myVotes: Record<string, VoteValue> = {}
  let myReports: string[] = []
  const user = event.context.user

  if (user && rows.length > 0) {
    const ids = rows.map(row => row.$id)
    // Query.equal ist auf 100 Werte begrenzt → in Batches (Subtrees können groß sein)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      // Stimmen tragen seit comments-014 selbst eine tenantId — dadurch geht
      // auch diese Tabelle durch die Tür und bleibt keine Ausnahme.
      const votes = await db.list<CommentVote>(VOTES_TABLE, [
        Query.equal('userId', user.$id),
        Query.equal('commentId', batch),
        Query.limit(batch.length),
      ])
      for (const vote of votes.rows) {
        myVotes[vote.commentId] = vote.value === 1 ? 1 : -1
      }
    }

    // Eigene offene Meldungen — über den expliziten Moderation-Vertrag (chunked),
    // nicht über direkten Zugriff auf dessen `reports`-Tabelle (Layer-Grenze A14).
    const reported = await myOpenReportTargetIds(event, 'comment', ids, user.$id)
    myReports = [...reported]
  }

  /**
   * DIE EMOJI-REAKTIONEN REISEN MIT DER LISTE (F57, Davids Entscheidung
   * 2026-08-13) — wie `myVotes` und `myReports` daneben, und aus demselben
   * Grund: die Zeilen sind gerade gelesen, ihre Ids stehen hier, und eine
   * zweite Runde durch Nitro, Middleware und Datentür würde für dieselbe
   * Antwort noch einmal bezahlt. Bei 25 Antworten sind das 0 zusätzliche
   * Anfragen statt 25 — und statt einer gebündelten Nachfrage.
   *
   * `reactionsAllowed` kommt mit, weil die Leiste ihr „+"-Menü aus dem in
   * DIESER App freigeschalteten Satz baut, nie aus der Registry. Ohne dieses
   * Feld wäre eine gekürzte Konfiguration eine reine Server-Angelegenheit und
   * die Oberfläche böte Emojis an, die 400 bekommen.
   *
   * FÜR GÄSTE MITGELIEFERT (und damit im Microcache): die Zahlen sieht jeder,
   * der die Antwort sieht — `mine` ist dort überall `false`, weil es ohne
   * Konto keine eigene Reaktion gibt. Der Cache macht sie bis zu 10 s alt,
   * dieselbe Frist, die für die Kommentare selbst schon gilt.
   */
  const reactionsAllowed = allowedCommentReactionsFor()
  const reactions = await loadCommentReactionSummary(
    event,
    rows.map(row => row.$id),
    user?.$id ?? null,
    reactionsAllowed,
  )

  const response = { total, activeTotal, topLevelTotal, rows, myVotes, myReports, reactions, reactionsAllowed }
  if (isGuest && page === 1) {
    guestCache.set(cacheKey, response)
  }
  return response
})
