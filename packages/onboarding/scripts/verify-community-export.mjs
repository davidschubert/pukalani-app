/**
 * Beweis für U20 — das Community-Bündel (GET /api/community/export).
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server: Community
 * per Wizard-Route anlegen → Inhalte säen → als Owner exportieren. Geprüft
 * werden vier Behauptungen, die das Produkt macht:
 *
 *   1. ES IST EINE DATEI. Status 200, `content-disposition: attachment`, ein
 *      `.json`-Name, `cache-control: no-store` (die Antwort hängt an der
 *      Session — kein Zwischenspeicher darf sie weiterreichen).
 *   2. ES IST VOLLSTÄNDIG. Der gesäte Kommentar und der gesäte Beitrag stehen
 *      drin, und JEDER registrierte Layer hat ein Kapitel — auch der leere.
 *      Ein Bündel, dem ein Kapitel stillschweigend fehlt, sieht vollständig
 *      aus und ist falsch.
 *   3. ES TRÄGT KEINE PII (der eigentliche Zweck dieses Beweises, Davids
 *      Zuschnitt vom 2026-08-12). Geprüft MIT GEGENPROBE: erst muss das
 *      gepflanzte gewöhnliche Mitglied nachweislich MITGEZÄHLT sein — sonst
 *      beweist seine Abwesenheit in der Team-Liste gar nichts, dann ist es
 *      einfach nicht da. Danach: seine Adresse steht nicht im Text, seine
 *      Appwrite-Id auch nicht, und im ganzen Bündel gibt es keinen Schlüssel
 *      `email`/`authorId`/`organizerId`/`userId`/`runtimeUserId`.
 *   4. ES IST OWNER-SACHE. Ein Fremder und ein gewöhnliches MITGLIED (viewer,
 *      also jemand MIT Zugang, aber ohne `community.export`) bekommen 403.
 *      Und die Bremse greift: 2 Läufe je Fenster und IP, der dritte 429.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-community-export.mjs
 *
 * POOL_KEY ist der Runtime-Schlüssel des POOL-Projekts (apps/platform/.env,
 * NUXT_APPWRITE_KEY) — dieselbe Herkunft wie bei verify-site-authz.mjs und
 * seed-local-tester.mjs. Die `--env-file` liefert nur das Control Plane.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolClient = new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey)
const poolUsers = new Users(poolClient)
const poolDb = new TablesDB(poolClient)

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [], comments: [], posts: [] }

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

/**
 * Eine eigene „Client-IP" je Akteur. Der Export ist mit 2 Läufen je Minute und
 * IP die schärfste Bremse des Hauses (`community:export`) — teilten sich Owner,
 * Fremder, Mitglied und der Drossel-Abschnitt den ::1-Eimer, meldete der Beweis
 * 429 statt der geprüften Antwort und sähe wie ein Produktfehler aus.
 *
 * Dass das lokal überhaupt geht, ist KEIN Loch, sondern die dokumentierte
 * Grenze: ohne vorgelagerten nginx gibt es keine angehängte echte IP, also ist
 * das letzte X-Forwarded-For-Segment das des Clients (core/server/utils/clientIp.ts).
 */
const RUN_IP = `203.0.113.${1 + Math.floor(Math.random() * 250)}`
/**
 * Der BLOCK wechselt je Lauf, die Endziffer trennt die Akteure. Ohne den
 * wechselnden Block wäre ein zweiter Lauf innerhalb derselben Minute rot: der
 * Drossel-Abschnitt räumt seinen Eimer absichtlich leer, und der nächste Lauf
 * bekäme dort 429 statt der geprüften Antwort — ein Fehlalarm, der wie ein
 * Produktfehler aussieht.
 */
const IP_BLOCK = 1 + Math.floor(Math.random() * 250)
const ip = suffix => `198.51.${IP_BLOCK}.${suffix}`

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, clientIp } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Fehlerseite */ }
        resolve({
          status: res.statusCode,
          json,
          text,
          headers: res.headers,
          setCookie: res.headers['set-cookie'] ?? [],
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createPoolUser(tag) {
  const email = `u20-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `U20 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password, name: `U20 ${tag}` }
}

/** Anmelden auf einem beliebigen Host → dessen Session-Cookie. */
async function login(account, host = CONTROL_HOST, clientIp) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
    clientIp,
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-U20TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'U20-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

/**
 * Jeden Schlüssel im Bündel besuchen und die verbotenen einsammeln — mit PFAD,
 * damit ein Fehlschlag sagt, WO das Leck sitzt, statt nur DASS es eins gibt.
 */
const FORBIDDEN_KEYS = ['email', 'authorId', 'organizerId', 'userId', 'runtimeUserId']
function forbiddenKeyPaths(value, path = '$') {
  if (Array.isArray(value)) return value.flatMap((item, i) => forbiddenKeyPaths(item, `${path}[${i}]`))
  if (value === null || typeof value !== 'object') return []
  const hits = []
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push(`${path}.${key}`)
    hits.push(...forbiddenKeyPaths(child, `${path}.${key}`))
  }
  return hits
}

try {
  console.log(`\nU20-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  console.log('1. Aufbau: Konten, Community, Sitzung auf dem Community-Host')
  const owner = await createPoolUser('owner')
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse —
  // nur der Gründer, die übrigen Konten bleiben, wie der Beweis sie braucht.
  await poolUsers.updateEmailVerification({ userId: owner.userId, emailVerification: true })
  const member = await createPoolUser('member')
  const stranger = await createPoolUser('stranger')
  const code = await issueCode()
  const ownerCookie = await login(owner)
  const slug = `u20-${Date.now().toString(36)}`

  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: ownerCookie,
    body: probeSiteBody({
      name: 'U20 Exportprobe',
      slug,
      description: 'Wir prüfen, ob das Bündel vollständig ist und niemanden verrät.',
      vibe: 'elegant',
      inviteCode: code,
    }),
  })
  check('Community angelegt', created.status === 200 && !!created.json?.communityId,
    `${created.status} ${created.text.slice(0, 200)}`)
  const communityId = created.json?.communityId
  const host = created.json?.host
  if (communityId) cleanup.tenants.push(communityId)

  const ownerMembers = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', communityId ?? 'x'), Query.limit(10)],
  })
  cleanup.members.push(...ownerMembers.rows.map(row => row.$id))

  const themes = await waitForHost(host)
  check('Community-Host antwortet', !!themes, 'Host wurde nicht aufgelöst')

  // Session-Cookies sind host-only: die Anmeldung auf app.* gilt auf der
  // Subdomain nicht. Der Handoff ist die Brücke — und er trägt nur Team-Rollen,
  // deshalb steht er hier nur dem Owner zur Verfügung.
  const handoff = await call(CONTROL_HOST, '/api/onboarding/handoff', {
    method: 'POST', cookie: ownerCookie, body: { communityId }, clientIp: RUN_IP,
  })
  check('Kontroll-Host siegelt ein Token', handoff.status === 200 && !!handoff.json?.token, `Status ${handoff.status}`)
  const exchange = await call(host, `/api/auth/site-session?token=${encodeURIComponent(handoff.json?.token ?? '')}&to=%2F`, { clientIp: RUN_IP })
  const ownerSite = exchange.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  check('Owner ist auf dem Community-Host eingeloggt', !!ownerSite, `Status ${exchange.status}`)

  console.log('\n2. Inhalte säen (direkt im Pool-Projekt, an den Produkt-Routen vorbei)')
  /**
   * WARUM DIREKT IN DIE TABELLEN und nicht über /api/comments und /api/posts:
   * das Bündel muss beweisbar sein, EGAL welche Produkte der Plan dieser
   * frischen Community freischaltet (`posts` verlangt mindestens „personal",
   * requirePlanProduct antwortet sonst 404 wie eine Datentür). Ein Beweis, der
   * am Plan-Gate hängt, misst das Gate und nicht den Export.
   *
   * DER MANDANTEN-STEMPEL IST `communities.tenantId` (`t-…`), NICHT `$id`:
   * die Datentür filtert mit `tenant.tenantId` (core/server/utils/tenant.ts),
   * und die Route trägt `communities.$id` als `communityId` im Kontext. Wer die
   * beiden verwechselt, sät in einen Mandanten, den es nicht gibt — der Export
   * liefert dann völlig zu Recht nichts, und der Beweis sucht den Fehler im
   * Produkt.
   */
  const communityRow = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId })
  const tenantId = communityRow.tenantId
  check('Mandanten-Stempel gefunden (communities.tenantId, „t-…")',
    typeof tenantId === 'string' && tenantId.startsWith('t-'), String(tenantId))

  const stamp = Date.now()
  const commentContent = `u20-kommentar-${stamp} — dieser Satz muss im Bündel stehen.`
  const commentAuthorName = `U20 Autorin ${stamp}`
  const commentRow = await poolDb.createRow({
    databaseId: poolDatabaseId, tableId: 'comments', rowId: ID.unique(),
    data: {
      communityId: tenantId,
      targetId: `u20-target-${stamp}`,
      targetType: 'verify',
      targetUrl: null,
      content: commentContent,
      authorId: member.userId,
      authorName: commentAuthorName,
      authorKind: 'user',
      parentId: null,
      rootId: null,
      depth: 0,
      editedAt: null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      status: 'active',
    },
  })
  cleanup.comments.push(commentRow.$id)
  check('Kommentar gesät', !!commentRow.$id, JSON.stringify(commentRow).slice(0, 160))

  const postTitle = `U20 Beitrag ${stamp}`
  const postBody = `u20-beitragstext-${stamp} — auch dieser Satz muss im Bündel stehen.`
  const postRow = await poolDb.createRow({
    databaseId: poolDatabaseId, tableId: 'community_posts', rowId: ID.unique(),
    data: {
      communityId: tenantId,
      type: 'post',
      title: postTitle,
      body: postBody,
      authorId: member.userId,
      authorName: commentAuthorName,
      status: 'published',
      scheduledAt: null,
      publishedAt: new Date().toISOString(),
      pollOptions: null,
      pollEndsAt: null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      categoryId: '',
      lastActivityAt: new Date().toISOString(),
      pinned: false,
      closed: false,
      solved: false,
      editedAt: null,
    },
  })
  cleanup.posts.push(postRow.$id)
  check('Beitrag gesät', !!postRow.$id, JSON.stringify(postRow).slice(0, 160))

  console.log('\n3. Ein gewöhnliches Mitglied pflanzen (die Gegenprobe zur PII-Grenze)')
  // Es muss ein ECHTES Mitglied mit Zugang sein (status 'active'), sonst zählt
  // der Export es zu Recht nicht mit — und die Abwesenheit unten wäre trivial.
  const probeEmail = `pii-probe-${stamp}@example.test`
  const memberRow = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId,
      runtimeProjectId: poolProject,
      runtimeUserId: member.userId,
      role: 'viewer',
      status: 'active',
      email: probeEmail,
    },
  })
  cleanup.members.push(memberRow.$id)
  check('gewöhnliches Mitglied (viewer, aktiv) angelegt', memberRow.status === 'active', JSON.stringify(memberRow.role))

  console.log('\n4. Der Export')
  const exported = await call(host, '/api/community/export', { cookie: ownerSite, clientIp: ip(11) })
  check('Owner → 200', exported.status === 200, `Status ${exported.status} ${exported.text.slice(0, 200)}`)
  const disposition = String(exported.headers['content-disposition'] ?? '')
  check('kommt als DATEI (content-disposition: attachment; …)', disposition.includes('attachment;'), disposition)
  check('… und heißt .json', disposition.includes('.json'), disposition)
  check('cache-control: no-store (die Antwort hängt an der Session)',
    String(exported.headers['cache-control'] ?? '').includes('no-store'),
    String(exported.headers['cache-control'] ?? ''))

  const bundle = exported.json ?? {}
  check('Format-Marke 1', bundle.format === 1, JSON.stringify(bundle.format))
  check('das Bündel nennt DIESE Community', bundle.community?.id === communityId,
    `${bundle.community?.id} ≠ ${communityId}`)
  check('… und sagt, was es bewusst weglässt (omitted)',
    Array.isArray(bundle.omitted) && bundle.omitted.includes('member-emails'),
    JSON.stringify(bundle.omitted))

  const comments = bundle.data?.comments?.comments ?? []
  check('der gesäte Kommentar steht drin',
    comments.some(c => c.content === commentContent),
    `${comments.length} Kommentare im Bündel`)
  const posts = bundle.data?.posts?.posts ?? []
  check('der gesäte Beitrag steht drin',
    posts.some(p => p.title === postTitle),
    `${posts.length} Beiträge im Bündel`)

  // Auch die LEEREN Kapitel müssen dastehen: sie sind die Aussage „dieser Layer
  // hat nichts", und die unterscheidet sich von „dieser Layer wurde vergessen".
  for (const layer of ['pages', 'events', 'courses']) {
    check(`Kapitel „${layer}" existiert (auch leer)`,
      Object.prototype.hasOwnProperty.call(bundle.data ?? {}, layer),
      Object.keys(bundle.data ?? {}).join(', '))
  }
  const team = bundle.data?.community?.team ?? []
  check('das Team steht drin, mit dem Owner darin',
    team.some(entry => entry.role === 'owner'), JSON.stringify(team).slice(0, 200))

  console.log('\n5. Die PII-Grenze (erst die Gegenprobe, dann die Abwesenheit)')
  /**
   * OHNE DIESE ZWEI ZEILEN IST DER GANZE ABSCHNITT WERTLOS. Eine Adresse, die
   * nicht im Text steht, beweist nur dann etwas, wenn die Person überhaupt in
   * der Rechnung vorkommt — sonst prüft man die Abwesenheit von jemandem, den
   * das Bündel gar nicht kennt.
   */
  const counts = bundle.data?.community?.memberCounts ?? {}
  const counted = counts.members >= 1 && counts.total > counts.team
  check('GEGENPROBE: das gepflanzte Mitglied IST mitgezählt (anonym)',
    counted, JSON.stringify(counts))
  if (!counted) {
    console.log('    ⚠ Ohne diese Gegenprobe sagen die folgenden Prüfungen NICHTS aus:')
    console.log('      ein Mitglied, das nicht gezählt wird, kann auch nicht auslaufen.')
  }

  check('die Adresse des Mitglieds steht NICHT im Bündel',
    !exported.text.includes(probeEmail), probeEmail)
  check('seine Appwrite-Id steht NICHT im Bündel',
    !exported.text.includes(member.userId), member.userId)
  check('… und keine Team-Zeile für ihn (Name)',
    !team.some(entry => entry.name === member.name), JSON.stringify(team).slice(0, 200))
  check('… auch nicht als überzähliger Eintrag (team.length === memberCounts.team)',
    team.length === counts.team, `${team.length} ≠ ${counts.team}`)

  const leaks = forbiddenKeyPaths(bundle)
  check(`kein Schlüssel ${FORBIDDEN_KEYS.join('/')} — nirgends im Bündel`,
    leaks.length === 0, leaks.slice(0, 12).join(' · '))

  console.log('\n6. Wer darf: Fremder und gewöhnliches Mitglied bleiben draußen')
  // BEIDE melden sich DIREKT auf dem Community-Host an: der Handoff siegelt nur
  // für Team-Rollen (sealCommunityHandoff), ein viewer käme so gar nicht hinein
  // — und der Fremde erst recht nicht.
  const strangerSite = await login(stranger, host, ip(31))
  const strangerExport = await call(host, '/api/community/export', { cookie: strangerSite, clientIp: ip(32) })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerExport.status === 403,
    `Status ${strangerExport.status} ${strangerExport.text.slice(0, 160)}`)

  const memberSite = await login(member, host, ip(41))
  const memberExport = await call(host, '/api/community/export', { cookie: memberSite, clientIp: ip(42) })
  check('Mitglied OHNE community.export (viewer) → 403', memberExport.status === 403,
    `Status ${memberExport.status} ${memberExport.text.slice(0, 160)}`)

  const guestExport = await call(host, '/api/community/export', { clientIp: ip(51) })
  check('Gast ohne Session → 401', guestExport.status === 401, `Status ${guestExport.status}`)

  console.log('\n7. Die Drossel (community:export, 2 je Fenster und IP)')
  const throttleIp = ip(61)
  const first = await call(host, '/api/community/export', { cookie: ownerSite, clientIp: throttleIp })
  const second = await call(host, '/api/community/export', { cookie: ownerSite, clientIp: throttleIp })
  const third = await call(host, '/api/community/export', { cookie: ownerSite, clientIp: throttleIp })
  check('1. Lauf kommt durch', first.status !== 429, `Status ${first.status}`)
  check('2. Lauf kommt durch', second.status !== 429, `Status ${second.status}`)
  check('3. Lauf → 429', third.status === 429, `Status ${third.status} ${third.text.slice(0, 160)}`)
  check('… mit Retry-After', !!third.headers['retry-after'], JSON.stringify(third.headers['retry-after']))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n8. Aufräumen')
  for (const id of cleanup.comments) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'comments', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.posts) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'community_posts', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
