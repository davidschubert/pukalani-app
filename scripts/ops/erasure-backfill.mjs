#!/usr/bin/env node
/**
 * ALTBESTAND: was vor GA1 P14 „gelöscht" wurde und trotzdem noch Inhalt trägt.
 *
 *   node --env-file=<env-datei> scripts/ops/erasure-backfill.mjs            # nur zählen
 *   node --env-file=<env-datei> scripts/ops/erasure-backfill.mjs --apply    # schreiben
 *   … --only comments,posts                                                 # einzelne Regeln
 *   … --only notification-excerpts                                          # EL1 (d): alte Textauszüge in Meldungen
 *
 * WARUM ES DAS GIBT: seit P14 leert der Code beim Löschen wirklich (Text,
 * Übersetzungen, Vorschau, Ausschnitt im Verlauf). Was DAVOR gelöscht wurde,
 * steht noch so in der Datenbank, wie der alte Code es hinterließ: ein
 * Kommentar mit `status: 'deleted'` und vollem Text, ein Grabstein mit
 * Übersetzungen, ein Verlaufs-Eintrag zu einem gelöschten Beitrag. Dieses
 * Skript bringt den Bestand auf den Stand, den der neue Code schreibt — mit
 * denselben Feldwerten (Quelle je Regel genannt).
 *
 * ZWEI STUFEN, IMMER IN DIESER REIHENFOLGE: ohne `--apply` wird nur gelesen
 * und gezählt. Erst mit den Zahlen entscheidet ein Mensch über `--apply`.
 * Gegen eine Instanz, die nicht lokal ist, verlangt `--apply` zusätzlich
 * `PUKALANI_TARGET_CONFIRM=<Projekt-Id>` (die geteilte Ziel-Prüfung,
 * `scripts/lib/target.mjs`) — ein versehentliches `--apply` mit der falschen
 * Env-Datei schreibt so nichts.
 *
 * WIEDERHOLBAR: jede Regel findet nur Zeilen, die noch nicht im Zielzustand
 * sind; ein zweiter Lauf zählt 0.
 *
 * DAS PROTOKOLL NENNT NUR ZAHLEN — keine Texte, keine Namen, keine Adressen,
 * keine Zeilen-Ids. Gelesen wird der Inhalt nur, um „leer oder nicht" zu
 * entscheiden.
 *
 * WAS ES NICHT TUT: es löscht keine Konten, fasst keine aktiven Inhalte an und
 * entscheidet nichts, was der Code nicht auch entscheidet. Zwei Dinge zählt es
 * nur, weil ein stündlicher Lauf sie erledigt: abgelaufene Kopien gelöschter
 * Konten (`gdpr-exports`, 30 Tage) und Adressen an alten Korrektur-Meldungen
 * (`brand_check_corrections`, 90 Tage).
 *
 * Eine Regel, deren Tabelle es auf der Instanz nicht gibt, meldet „Tabelle
 * fehlt" und zählt nicht — die Layer sind je Instanz verschieden.
 */
import { assertTarget } from '../lib/target.mjs'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=<env-datei>')
  process.exit(1)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const onlyAt = args.indexOf('--only')
const ONLY = onlyAt >= 0 ? new Set((args[onlyAt + 1] || '').split(',').filter(Boolean)) : null

// Nur `--apply` schreibt: der Zähl-Lauf darf überall hin, das Schreiben nur
// lokal oder mit PUKALANI_TARGET_CONFIRM=<Projekt-Id> (OPS-002).
if (APPLY) assertTarget({ script: 'erasure-backfill --apply', endpoint, projectId })

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const headers = { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey, 'Content-Type': 'application/json' }

class MissingTable extends Error {}
class MissingScope extends Error {}

const queryString = queries => queries.map(q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&')
const q = {
  equal: (attribute, values) => ({ method: 'equal', attribute, values: [].concat(values) }),
  lessThan: (attribute, value) => ({ method: 'lessThan', attribute, values: [value] }),
  orderAsc: attribute => ({ method: 'orderAsc', attribute }),
  orderDesc: attribute => ({ method: 'orderDesc', attribute }),
  limit: n => ({ method: 'limit', values: [n] }),
  cursorAfter: id => ({ method: 'cursorAfter', values: [id] }),
}

async function api(method, path, body) {
  const res = await fetch(`${endpoint}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (res.status === 204) return null
  const json = await res.json().catch(() => ({}))
  if (res.ok) return json
  const error = new Error(`HTTP ${res.status} ${json.type || ''}`.trim())
  error.status = res.status
  error.type = json.type || ''
  throw error
}

const rowsPath = table => `/tablesdb/${databaseId}/tables/${table}/rows`

/** Alle Zeilen einer Abfrage, in Seiten zu 100. Fehlende Tabelle ⇒ MissingTable. */
async function listAll(table, queries = []) {
  const rows = []
  let cursor = null
  for (;;) {
    const page = [...queries, q.limit(100), ...(cursor ? [q.cursorAfter(cursor)] : [])]
    let res
    try {
      res = await api('GET', `${rowsPath(table)}?${queryString(page)}`)
    }
    catch (error) {
      if (error.status === 404 && (error.type === 'table_not_found' || error.type === 'collection_not_found')) throw new MissingTable(table)
      if (error.status === 401) throw new MissingScope(table)
      throw error
    }
    rows.push(...res.rows)
    if (res.rows.length < 100) return rows
    cursor = res.rows.at(-1).$id
    if (rows.length >= 50_000) throw new Error(`${table}: mehr als 50.000 Zeilen — Abbruch statt stillem Abschneiden`)
  }
}

/** Zeile lesen; `null` nur bei „gibt es nicht". */
async function getRow(table, id) {
  try {
    return await api('GET', `${rowsPath(table)}/${encodeURIComponent(id)}`)
  }
  catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

const patchRow = (table, id, data, permissions) =>
  api('PATCH', `${rowsPath(table)}/${encodeURIComponent(id)}`, { data, ...(permissions ? { permissions } : {}) })
const deleteRow = (table, id) => api('DELETE', `${rowsPath(table)}/${encodeURIComponent(id)}`)

const filled = value => !(value === null || value === undefined || value === '' || value === '{}' || value === '[]')

/** Gibt es dieses Konto noch? `null` = der Schlüssel darf Konten nicht lesen. */
let usersScope = true
const userCache = new Map()
async function userExists(id) {
  if (!usersScope) return null
  if (userCache.has(id)) return userCache.get(id)
  try {
    await api('GET', `/users/${encodeURIComponent(id)}`)
    userCache.set(id, true)
    return true
  }
  catch (error) {
    if (error.status === 404 && error.type === 'user_not_found') {
      userCache.set(id, false)
      return false
    }
    if (error.status === 401) {
      usersScope = false
      return null
    }
    throw error
  }
}

/** EL1 (d): Typen aus `comments`, deren Meldung einen Auszug trägt. */
const NOTIFICATION_EXCERPT_TYPES = ['reply', 'mention', 'reply.guest']
/** Die feste Id seit dem 2026-11-15 (`commentNotificationRowId`). */
const NOTIFICATION_FIXED_ID = /^cmn[0-9a-f]{32}$/
/** Zwei Tage Luft nach dem Ausliefern der festen Id — davor ist „Bestand". */
const NOTIFICATION_EXCERPT_CUTOFF = '2026-11-17T00:00:00.000Z'

/**
 * JEDE REGEL: `find()` liefert die Zeilen, die NICHT im Zielzustand sind, als
 * `{ scanned, hits: [{ fix }] }` — `fix` schreibt genau diese eine Zeile.
 * `countOnly` heißt: dieses Skript schreibt hier nie (ein Lauf tut es).
 */
const RULES = [
  {
    key: 'comments',
    label: 'Gelöschte Kommentare, die noch Text, Namen, Konto-Id oder Übersetzung tragen',
    // Zielzustand: COMMENT_TOMBSTONE_DATA + commentTombstonePermissions
    // (packages/comments/server/utils/commentTombstone.ts).
    async find() {
      const rows = await listAll('comments', [q.equal('status', 'deleted')])
      const hits = rows
        .filter(row => filled(row.content) || filled(row.authorName) || filled(row.authorId) || filled(row.translations)
          || row.$permissions.some(p => /^(update|delete)\("user:/.test(p)))
        .map(row => ({
          fix: () => patchRow('comments', row.$id,
            { content: '', authorName: '', authorId: '', editedAt: null, translations: '' },
            row.$permissions.filter(p => !/^(update|delete)\("user:/.test(p))),
        }))
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'posts',
    label: 'Grabsteine von Beiträgen gelöschter Konten mit Konto-Id, Umfrage-Optionen oder Übersetzung',
    // Zielzustand: der Grabstein aus postsUserData.ts. Erkannt am geleerten
    // Namen — ein selbst gelöschter Beitrag eines bestehenden Kontos behält
    // ihn und bleibt (nur der Autor liest ihn noch).
    async find() {
      const rows = await listAll('community_posts', [q.equal('status', 'deleted')])
      const hits = rows
        .filter(row => !filled(row.authorName) && (filled(row.authorId) || filled(row.pollOptions) || filled(row.translations) || filled(row.title) || filled(row.body)))
        .map(row => ({
          fix: () => patchRow('community_posts', row.$id, { title: null, body: '', authorId: '', pollOptions: null, translations: '' }),
        }))
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'activities',
    label: 'Verlaufs-Einträge zu gelöschten Kommentaren und Beiträgen',
    // Zielzustand: kein Eintrag (removeActivitiesForObject im Lösch-Weg).
    async find() {
      const hits = []
      let scanned = 0
      for (const [objectType, table] of [['comment', 'comments'], ['post', 'community_posts']]) {
        const rows = await listAll('activities', [q.equal('objectType', objectType)])
        scanned += rows.length
        const status = new Map()
        for (const row of rows) {
          if (!status.has(row.objectId)) {
            const object = await getRow(table, row.objectId).catch((error) => {
              if (error.status === 404) return null
              throw error
            })
            status.set(row.objectId, object ? object.status : 'missing')
          }
          const state = status.get(row.objectId)
          if (state === 'deleted' || state === 'missing') hits.push({ fix: () => deleteRow('activities', row.$id) })
        }
      }
      return { scanned, hits }
    },
  },
  {
    key: 'conversations',
    label: 'Unterhaltungen, deren Vorschau nicht zur letzten verbleibenden Nachricht passt',
    // Zielzustand: messagePreview() der jüngsten verbleibenden Nachricht
    // (packages/messages/shared/conversations.ts), sonst leer.
    async find() {
      // MESSAGE_PREVIEW_LENGTH aus packages/messages/shared/types/message.ts —
      // ein Test hält die Zahl hier gegen die Konstante dort.
      const PREVIEW = 160
      const preview = (body) => {
        const flat = String(body ?? '').replace(/\s+/g, ' ').trim()
        return flat.length <= PREVIEW ? flat : `${flat.slice(0, PREVIEW - 1)}…`
      }
      const rows = await listAll('conversations')
      const hits = []
      for (const row of rows) {
        if (!filled(row.lastMessagePreview)) continue
        const newest = await api('GET', `${rowsPath('messages')}?${queryString([q.equal('conversationId', row.$id), q.orderDesc('$createdAt'), q.limit(1)])}`)
        const expected = newest.rows[0] ? preview(newest.rows[0].body) : ''
        if (row.lastMessagePreview !== expected) hits.push({ fix: () => patchRow('conversations', row.$id, { lastMessagePreview: expected }) })
      }
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'events',
    label: 'Abgesagte Termine gelöschter Konten, die noch Text, Ort, Link oder Konto-Id tragen',
    // Zielzustand: EVENT_REDACTED_FIELDS + organizerId '' + redactedAt
    // (packages/events/server/utils/eventRedaction.ts, eventsUserData.ts).
    // Erkannt am geleerten Namen bei Status „abgesagt": so hinterließ der alte
    // Code genau die Termine gelöschter Konten.
    async find() {
      const rows = await listAll('events', [q.equal('status', 'cancelled')])
      const hits = []
      for (const row of rows) {
        if (filled(row.organizerName)) continue
        const rest = filled(row.title) || filled(row.description) || filled(row.location) || filled(row.address) || filled(row.locationNotes)
          || filled(row.url) || filled(row.replayUrl) || filled(row.coverFileId) || filled(row.translations) || filled(row.organizerId)
        if (!rest) continue
        hits.push({
          fix: async () => {
            if (filled(row.coverFileId)) {
              await api('DELETE', `/storage/buckets/event-covers/files/${encodeURIComponent(row.coverFileId)}`).catch((error) => {
                if (error.status !== 404) throw error
              })
            }
            await patchRow('events', row.$id, {
              title: '', description: '', location: null, address: null, locationNotes: null, url: null, replayUrl: null,
              coverFileId: null, translations: '', organizerId: '', redactedAt: row.redactedAt || new Date().toISOString(),
            })
          },
        })
      }
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'courses',
    label: 'Kurse mit geleertem Namen, aber noch gesetzter Konto-Id',
    // Zielzustand: authorId '' (coursesUserData.ts).
    async find() {
      const rows = await listAll('courses')
      const hits = rows.filter(row => !filled(row.authorName) && filled(row.authorId))
        .map(row => ({ fix: () => patchRow('courses', row.$id, { authorId: '' }) }))
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'invited-by',
    label: 'Zähler anderer Mitglieder, die auf ein gelöschtes Konto als Einladende(n) zeigen',
    // Zielzustand: invitedBy '' (postsUserData.ts). Braucht das Recht, Konten
    // zu lesen — ohne es bleibt die Regel „nicht prüfbar".
    async find() {
      const rows = (await listAll('member_counters')).filter(row => filled(row.invitedBy))
      const hits = []
      let unknown = 0
      for (const row of rows) {
        const exists = await userExists(row.invitedBy)
        if (exists === null) unknown++
        else if (!exists) hits.push({ fix: () => patchRow('member_counters', row.$id, { invitedBy: '' }) })
      }
      return { scanned: rows.length, hits, unknown }
    },
  },
  {
    key: 'brand-checks',
    label: 'Prüfergebnisse, deren Marke es nicht mehr gibt (noch nicht als versteckt markiert)',
    // Zielzustand: erasedAt gesetzt (packages/brand/server/utils/brandCheckErasure.ts);
    // der stündliche Lauf räumt 90 Tage später.
    async find() {
      const rows = (await listAll('brand_checks')).filter(row => !filled(row.erasedAt))
      const profiles = new Map()
      const hits = []
      for (const row of rows) {
        const profileId = filled(row.profileId) ? row.profileId : (String(row.urlKey || '').startsWith('doc:') ? String(row.urlKey).slice(4) : '')
        if (!profileId) continue
        if (!profiles.has(profileId)) profiles.set(profileId, Boolean(await getRow('brand_profiles', profileId)))
        if (!profiles.get(profileId)) hits.push({ fix: () => patchRow('brand_checks', row.$id, { erasedAt: new Date().toISOString() }) })
      }
      return { scanned: rows.length, hits }
    },
  },
  {
    key: 'brand-check-users',
    label: 'Prüfergebnisse mit der Konto-Id eines gelöschten Kontos (noch nicht als versteckt markiert)',
    async find() {
      const rows = (await listAll('brand_checks')).filter(row => !filled(row.erasedAt) && filled(row.userId))
      const hits = []
      let unknown = 0
      for (const row of rows) {
        const exists = await userExists(row.userId)
        if (exists === null) unknown++
        else if (!exists) hits.push({ fix: () => patchRow('brand_checks', row.$id, { erasedAt: new Date().toISOString() }) })
      }
      return { scanned: rows.length, hits, unknown }
    },
  },
  {
    key: 'brand-corrections',
    label: 'Korrektur-Meldungen älter als 90 Tage, die noch eine Adresse tragen',
    countOnly: 'erledigt der stündliche Lauf der branding-App, sobald er auf „apply" steht',
    async find() {
      const rows = await listAll('brand_check_corrections', [q.lessThan('$createdAt', new Date(now - 90 * DAY).toISOString())])
      return { scanned: rows.length, hits: rows.filter(row => filled(row.reporterEmail) || filled(row.ipHash)).map(() => ({})) }
    },
  },
  {
    key: 'invite-codes',
    label: 'Einladungscodes mit Adresse, deren Zugangs-Anfrage es nicht mehr gibt',
    // Zielzustand: inviteCodeErasure (packages/control/shared/communityTeam.ts) —
    // Feld leer, Adresse aus der Beschriftung.
    async find() {
      const rows = (await listAll('invite_codes')).filter(row => filled(row.boundEmail))
      const hits = []
      let unknown = 0
      for (const row of rows) {
        if (!filled(row.requestId)) {
          unknown++
          continue
        }
        if (await getRow('invite_requests', row.requestId)) continue
        const address = String(row.boundEmail).trim().toLowerCase()
        const label = String(row.label ?? '')
        const cleaned = label.toLowerCase().includes(address)
          ? label.replace(new RegExp(address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').replace(/[<>()[\]]/g, ' ').replace(/\s+/g, ' ').replace(/[\s:,;–-]+$/, '').trim()
          : label
        hits.push({ fix: () => patchRow('invite_codes', row.$id, { boundEmail: '', ...(cleaned !== label ? { label: cleaned } : {}) }) })
      }
      return { scanned: rows.length, hits, unknown }
    },
  },
  {
    key: 'gdpr-exports',
    label: 'Kopien gelöschter Konten, die älter als 30 Tage sind',
    countOnly: 'erledigt der stündliche Lauf jeder App mit eingetragenem Bucket',
    async find() {
      const bucket = process.env.NUXT_PUBLIC_APPWRITE_GDPR_BUCKET || 'gdpr-exports'
      let res
      try {
        res = await api('GET', `/storage/buckets/${bucket}/files?${queryString([q.orderAsc('$createdAt'), q.limit(100)])}`)
      }
      catch (error) {
        if (error.status === 404) throw new MissingTable(`Bucket ${bucket}`)
        if (error.status === 401) throw new MissingScope(`Bucket ${bucket}`)
        throw error
      }
      const expired = res.files.filter(file => Date.parse(file.$createdAt) < now - 30 * DAY)
      return { scanned: res.total, hits: expired.map(() => ({})) }
    },
  },
  {
    key: 'notification-excerpts',
    label: 'Meldungen zu Antworten und Erwähnungen von vor dem 2026-11-15, die noch einen Textauszug tragen',
    // EL1 (d). Seit dem 2026-11-15 entsteht jede dieser Meldungen unter einer
    // FESTEN Id (`cmn` + 32 Hex-Zeichen, commentNotificationRowId) und fällt
    // mit ihrem Kommentar (removeObjectNotifications). Der Bestand davor
    // trägt eine zufällige Id und lässt sich keinem Kommentar zuordnen — sein
    // Auszug bliebe stehen, auch wenn der Kommentar längst gelöscht ist.
    // Zielzustand: derselbe Eintrag ohne Auszug (`body: ''`); Absender, Typ
    // und Link bleiben, die Glocke zeigt weiter „X hat geantwortet".
    // Erkannt wird an der ID, nicht am Text. Eine Zeile mit zufälliger Id, die
    // NACH dem Stichtag entstand, kennt dieses Skript nicht: sie bleibt und
    // zählt als „nicht prüfbar". `post.mention` trug von Anfang an eine feste
    // Id und gehört nicht dazu.
    async find() {
      const rows = await listAll('notifications', [q.equal('type', NOTIFICATION_EXCERPT_TYPES)])
      const old = rows.filter(row => filled(row.body) && !NOTIFICATION_FIXED_ID.test(row.$id))
      const hits = old
        .filter(row => row.$createdAt < NOTIFICATION_EXCERPT_CUTOFF)
        .map(row => ({ fix: () => patchRow('notifications', row.$id, { body: '' }) }))
      return { scanned: rows.length, hits, unknown: old.length - hits.length }
    },
  },
]

// Ein unbekannter Name hinter `--only` lief früher still durch: keine Regel,
// keine Zeile, Exit 0 — und sah aus wie „nichts zu tun" (2026-11-18 so
// erwischt, mit einem Checkout, der die Regel noch nicht kannte).
if (ONLY) {
  const unknown = [...ONLY].filter(key => !RULES.some(rule => rule.key === key))
  if (unknown.length) {
    console.error(`✗ --only nennt unbekannte Regeln: ${unknown.join(', ')}. Bekannt: ${RULES.map(rule => rule.key).join(', ')}`)
    process.exit(2)
  }
}

console.log(`Altbestand ${APPLY ? 'AUFRÄUMEN' : 'zählen (nur lesen)'} · ${endpoint} · Projekt ${projectId} · ${new Date().toISOString()}`)

let exit = 0
for (const rule of RULES) {
  if (ONLY && !ONLY.has(rule.key)) continue
  let found
  try {
    found = await rule.find()
  }
  catch (error) {
    if (error instanceof MissingTable) {
      console.log(`– ${rule.key}: Tabelle fehlt auf dieser Instanz (${error.message})`)
      continue
    }
    if (error instanceof MissingScope) {
      console.log(`? ${rule.key}: der Schlüssel darf hier nicht lesen (${error.message}) — nicht geprüft`)
      continue
    }
    console.log(`✗ ${rule.key}: Lesen gescheitert (${error.message})`)
    exit = 1
    continue
  }

  const unknown = found.unknown ? ` · nicht prüfbar ${found.unknown}` : ''
  if (!APPLY || rule.countOnly) {
    console.log(`${found.hits.length ? '•' : '✔'} ${rule.key}: gelesen ${found.scanned} · zu ändern ${found.hits.length}${unknown}${rule.countOnly && found.hits.length ? ` (${rule.countOnly})` : ''}`)
    console.log(`    ${rule.label}`)
    continue
  }

  let changed = 0
  let failed = 0
  for (const hit of found.hits) {
    try {
      await hit.fix()
      changed++
    }
    catch {
      failed++
    }
  }
  if (failed) exit = 1
  console.log(`${failed ? '✗' : '✔'} ${rule.key}: gelesen ${found.scanned} · zu ändern ${found.hits.length} · geändert ${changed} · fehlgeschlagen ${failed}${unknown}`)
  console.log(`    ${rule.label}`)
}

if (!usersScope) console.log('Hinweis: der Schlüssel darf keine Konten lesen — Regeln, die prüfen, ob ein Konto noch besteht, sind „nicht prüfbar".')
process.exit(exit)
