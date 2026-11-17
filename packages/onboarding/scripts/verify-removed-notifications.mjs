/**
 * Beweis: EINE ENTFERNTE PERSON BEKOMMT AUS DER COMMUNITY NICHTS MEHR (MM1 b).
 *
 * Wem ein Admin den Zugang entzogen hat, der sieht auf dem Host nur noch die
 * Hinweisseite. Offen war, ob die Community ihn trotzdem weiter ERREICHT:
 * eine Antwort auf einen alten Kommentar schreibt eine Glocken-Zeile und, je
 * nach Einstellung, eine Mail mit einem Auszug des neuen Textes.
 *
 * Fährt den echten Kundenpfad gegen die Bühne (`pnpm buehne up`):
 *
 *   1. Ein eigenes Probe-Konto wird Mitglied von Community A (Zeile + Label),
 *      stellt „Mail sofort" ein und schreibt einen Kommentar.
 *   2. GEGENPROBE, solange es Mitglied ist: ein anderes Mitglied antwortet ⇒
 *      genau eine Glocken-Zeile und genau eine Mail. (Ohne sie wäre „nichts
 *      angekommen" auch dann grün, wenn Glocke oder Mailpit gar nicht laufen.)
 *   3. Der Owner entfernt das Konto über die echte Route.
 *   4. Dasselbe Mitglied antwortet noch einmal auf denselben Kommentar ⇒ die
 *      Antwort entsteht (201), aber KEINE neue Glocken-Zeile und KEINE neue
 *      Mail an das entfernte Konto.
 *   5. SCHON LÄNGER ENTFERNT: Schritt 4 beantwortet der Server aus seiner
 *      frischen Notiz „gerade entzogen". Für ein Konto, das die Bühne schon
 *      beim Aufbau als entfernt angelegt hat, gibt es keine Notiz — dort
 *      entscheidet die Abfrage im Control Plane über den Stempel der
 *      Community. Dafür bekommt ein Kommentar dieses Kontos eine Antwort
 *      (der Kommentar entsteht als Kopie der Zeile aus Schritt 1 direkt in
 *      der Tabelle: schreiben darf ein entferntes Konto nicht mehr). Gegenprobe
 *      mit demselben Handgriff für ein Mitglied der Bühne.
 *
 * Erwartungswerte stehen ausgeschrieben (eine Zeile, eine Mail, danach
 * unverändert) und kommen nie aus der geprüften Antwort.
 *
 * NICHT GEPRÜFT: die tägliche Sammel-Mail (der Lauf ginge lokal über alle
 * gespiegelten Konten) und die Termin-Erinnerung — beide belegen Tests am
 * echten Code (`packages/core/tests/notifyFormerMember.test.ts`,
 * `packages/events/tests/`).
 *
 *   pnpm buehne up --suffix <wort> --platform-port <port>
 *   pnpm buehne run --only verify-removed-notifications --control-port <port>
 */
import '../../../scripts/lib/assert-target.mjs'
import { readFileSync } from 'node:fs'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  login,
  Q,
  setAccountLabels,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const HOST = process.env.TENANT_A_HOST
const COMMUNITY_ID = process.env.BUEHNE_COMMUNITY_A
const STATE_FILE = process.env.BUEHNE_STATE

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const controlDatabaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || 'main'

if (!HOST || !COMMUNITY_ID || !STATE_FILE || !endpoint || !controlProject || !controlDatabaseId || !controlKey || !poolProject || !poolKey) {
  console.error('✗ Umgebung unvollständig — über `pnpm buehne run --only verify-removed-notifications` starten.')
  process.exit(1)
}

const SCRIPT = 'verify-removed-notifications'
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script: SCRIPT })
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script: SCRIPT })
const cleanup = createCleanup({ pool, control, poolDatabaseId, controlDatabaseId })
const { call } = createHttpCaller({ port: PORT })

const stage = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const cast = stage.communities.a.accounts

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Antworten schreibt ein Konto der BÜHNE — sie hängen an keinem Konto dieses Laufs und brauchen ihren eigenen Eintrag. */
function trackReply(res) {
  if (res.json?.$id) cleanup.track('poolRow', `comments/${res.json.$id}`)
}

/** Glocken-Zeilen eines Kontos (direkt aus der Tabelle — die Route ist für Entfernte zu). */
async function bellRows(userId) {
  const res = await pool.listRows(poolDatabaseId, 'notifications', [Q.equal('recipientId', userId), Q.limit(100)])
  return res.rows
}

/** Mails an EINE Adresse. */
async function mailsTo(address) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`)
  if (!res.ok) throw new Error(`Mailpit antwortet ${res.status}`)
  return (await res.json()).messages ?? []
}

/** Die Mail geht nach der Antwort der Route raus — kurz nachfassen statt fest warten. */
async function waitFor(read, wanted, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  let value = await read()
  while (value !== wanted && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, 400))
    value = await read()
  }
  return value
}

async function main() {
  console.log(`Entfernte Person und Benachrichtigungen — ${HOST}`)

  // ── 1. Ein Mitglied mit einem Kommentar ───────────────────────────────────
  const person = await createProbeAccount(pool, { tag: 'removed-bell', name: 'Probe Entfernt' })
  cleanup.track('account', person.userId)
  const memberRow = await addStageMember(control, controlDatabaseId, {
    communityId: COMMUNITY_ID, projectId: poolProject, userId: person.userId, role: 'viewer', email: person.email,
  })
  cleanup.track('member', memberRow.$id)
  await setAccountLabels(pool, person.userId, [COMMUNITY_ID])
  await pool.patch(`/users/${person.userId}/prefs`, { prefs: { emailNotifications: 'instant', emailLocale: 'de' } })

  const personCookie = await login(call, HOST, person)
  const memberCookie = await login(call, HOST, cast.member)
  const ownerCookie = await login(call, HOST, cast.owner)

  const target = { targetType: 'page', targetId: `probe-removed-bell-${stage.stamp}-${Date.now()}` }
  const own = await call(HOST, '/api/comments', {
    method: 'POST', cookie: personCookie, body: { ...target, content: 'Mein Kommentar, solange ich Mitglied bin.' },
  })
  check('das Probe-Konto schreibt als Mitglied einen Kommentar (201)', own.status === 201, `Status ${own.status} ${own.text.slice(0, 120)}`)
  const parentId = own.json?.$id
  if (!parentId) throw new Error('Ohne Ausgangs-Kommentar ist nichts zu prüfen.')

  // ── 2. Gegenprobe: als Mitglied kommt die Antwort an ──────────────────────
  const firstReply = await call(HOST, '/api/comments', {
    method: 'POST', cookie: memberCookie, body: { ...target, parentId, content: 'Antwort eins — der Empfänger ist noch Mitglied.' },
  })
  check('ein anderes Mitglied antwortet (201)', firstReply.status === 201, `Status ${firstReply.status}`)
  trackReply(firstReply)
  const bellBefore = await waitFor(async () => (await bellRows(person.userId)).length, 1)
  check('Gegenprobe: genau EINE Glocken-Zeile für das Mitglied', bellBefore === 1, `gefunden ${bellBefore}`)
  const mailBefore = await waitFor(async () => (await mailsTo(person.email)).length, 1)
  check('Gegenprobe: genau EINE Mail an das Mitglied', mailBefore === 1, `gefunden ${mailBefore}`)

  // ── 3. Zugang entziehen, über die echte Route ─────────────────────────────
  const removal = await call(HOST, `/api/community/members/${memberRow.$id}`, { method: 'DELETE', cookie: ownerCookie })
  check('der Owner entfernt das Konto (200)', removal.status === 200, `Status ${removal.status} ${removal.text.slice(0, 120)}`)
  const locked = await call(HOST, '/api/comments?targetType=page&targetId=x', { cookie: personCookie })
  check('das entfernte Konto bekommt auf dem Host nur noch 403 community_removed', locked.status === 403 && locked.json?.reason === 'community_removed', `Status ${locked.status} ${locked.json?.reason ?? ''}`)

  // ── 4. Dieselbe Antwort noch einmal ───────────────────────────────────────
  const secondReply = await call(HOST, '/api/comments', {
    method: 'POST', cookie: memberCookie, body: { ...target, parentId, content: 'Antwort zwei — der Empfänger ist entfernt.' },
  })
  check('die Antwort selbst entsteht weiter (201)', secondReply.status === 201, `Status ${secondReply.status}`)
  trackReply(secondReply)
  // Länger warten als in der Gegenprobe gebraucht wurde: „nichts gekommen"
  // darf nicht nur heißen „noch nicht gekommen".
  await new Promise(resolve => setTimeout(resolve, 4000))
  const bellAfter = (await bellRows(person.userId)).length
  check('KEINE neue Glocken-Zeile für das entfernte Konto', bellAfter === 1, `jetzt ${bellAfter} statt 1`)
  const mailAfter = (await mailsTo(person.email)).length
  check('KEINE neue Mail an das entfernte Konto', mailAfter === 1, `jetzt ${mailAfter} statt 1`)

  // ── 5. Schon länger entfernt: ohne frische Notiz, über das Control Plane ──
  const original = await pool.getRow(poolDatabaseId, 'comments', parentId)
  const data = Object.fromEntries(Object.entries(original).filter(([key]) => !key.startsWith('$')))
  /** Ein Kommentar „von" einem Konto der Bühne — Kopie der echten Zeile, nur der Autor ist ein anderer. */
  async function commentBy(account, content) {
    // Mit den Leserechten der echten Zeile: ohne sie fände die Route den
    // Eltern-Kommentar nicht (gelesen wird wie das antwortende Konto liest).
    const row = await pool.post(`/tablesdb/${poolDatabaseId}/tables/comments/rows`, {
      rowId: 'unique()',
      data: { ...data, authorId: account.userId, content },
      permissions: original.$permissions,
    })
    cleanup.track('poolRow', `comments/${row.$id}`)
    return row.$id
  }
  const bellCount = async account => (await bellRows(account.userId)).length

  const editorBefore = await bellCount(cast.editor)
  const removedBefore = await bellCount(cast.removed)
  // Was diese Probe den Konten der Bühne in die Glocke legt, räumt sie auch weg.
  const bellIdsBefore = new Set([...await bellRows(cast.editor.userId), ...await bellRows(cast.removed.userId)].map(row => row.$id))
  const byEditor = await commentBy(cast.editor, 'Kommentar eines Mitglieds der Bühne.')
  const byRemoved = await commentBy(cast.removed, 'Kommentar eines schon länger entfernten Kontos.')

  const toEditor = await call(HOST, '/api/comments', {
    method: 'POST', cookie: memberCookie, body: { ...target, parentId: byEditor, content: 'Antwort an das Mitglied.' },
  })
  const toRemoved = await call(HOST, '/api/comments', {
    method: 'POST', cookie: memberCookie, body: { ...target, parentId: byRemoved, content: 'Antwort an das entfernte Konto.' },
  })
  check('beide Antworten entstehen (201)', toEditor.status === 201 && toRemoved.status === 201, `Status ${toEditor.status} / ${toRemoved.status}`)
  trackReply(toEditor)
  trackReply(toRemoved)
  const editorAfter = await waitFor(() => bellCount(cast.editor), editorBefore + 1)
  check('Gegenprobe: das Mitglied der Bühne bekommt genau EINE neue Glocken-Zeile', editorAfter === editorBefore + 1, `${editorBefore} → ${editorAfter}`)
  await new Promise(resolve => setTimeout(resolve, 2000))
  const removedAfter = await bellCount(cast.removed)
  check('das schon länger entfernte Konto bekommt KEINE Glocken-Zeile', removedAfter === removedBefore, `${removedBefore} → ${removedAfter}`)
  for (const row of [...await bellRows(cast.editor.userId), ...await bellRows(cast.removed.userId)]) {
    if (!bellIdsBefore.has(row.$id)) cleanup.track('poolRow', `notifications/${row.$id}`)
  }
}

let crashed = false
try {
  await main()
}
catch (error) {
  crashed = true
  console.error(`✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  const { leftovers } = await cleanup.run()
  if (leftovers.length) {
    fail++
    console.log(`  ✗ Aufräumen: ${leftovers.length} Zeile(n) übrig — ${leftovers.join(', ')}`)
  }
  else {
    console.log('  ✔ aufgeräumt und nachgezählt')
  }
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
process.exit(fail > 0 || crashed ? 1 : 0)
