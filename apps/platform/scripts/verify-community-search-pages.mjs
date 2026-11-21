#!/usr/bin/env node
/**
 * COMMUNITY-SEITEN FÜR DIE SUCHE (Q10 — SEO-003, SEO-004, SEO-007).
 *
 * Geprüft wird das AUSGELIEFERTE HTML, ohne JavaScript und ohne Anmeldung —
 * genau das, was eine Suchmaschine liest. Unit-Tests halten die Regeln
 * (core/tests/seoCanonicalLocale, seoRobots; apps/platform/tests/tenantSitemap);
 * dass eine Seite sie auch WIRKLICH im Kopf trägt, sieht nur ein Abruf.
 *
 * Was hier steht:
 *   1. Je Seitenart (Diskussion, Kurs, Termin): eine Beschreibung, genau ein
 *      `h1`, genau ein `canonical`.
 *   2. Die Sitemap nennt die öffentlichen Inhalte — und die nicht öffentlichen
 *      NICHT (Gegenproben: Entwurf eines Kurses, Entwurf eines Termins,
 *      gelöschtes Thema, die Inhalte der ANDEREN Community).
 *   3. Konto-Seiten und der Kontroll-Host tragen `noindex`, und die
 *      `robots.txt` lässt sie lesen. Gegenprobe: eine Inhaltsseite trägt keines.
 *   4. Hauptsprache (Davids Entscheidung B1): ohne Wahl ist die Adresse ohne
 *      Vorsatz maßgeblich; nach der Wahl „Deutsch" zeigen BEIDE Sprach-Adressen
 *      eines Beitrags auf die deutsche, und die Sitemap nennt nur diese.
 *      Gegenprobe: die Übersicht behält ihre zwei verknüpften Adressen.
 *
 * Start: `pnpm buehne run --only verify-community-search-pages`
 * (Bühne: `pnpm buehne up`, Platform- und Control-Server aus demselben Checkout).
 *
 * WAS ES NICHT BEWEIST: die Server laufen als Entwicklungs-Server ohne
 * Webserver davor; ob Production dieselben Köpfe ausliefert, zeigt ein Abruf
 * dort (docs/OPEN-ITEMS-COMPLETE.md, Q10).
 */
import '../../../scripts/lib/assert-target.mjs'
import { readFileSync } from 'node:fs'
import { appwriteRest, createCleanup, createHttpCaller, login } from '../../../scripts/lib/probe-stage.mjs'
import { parseRobotsGroups } from '../../../packages/core/shared/aiCrawlers.ts'

const SCRIPT = 'verify-community-search-pages'
const PORT = Number(process.env.PLATFORM_PORT)
const HOST = process.env.TENANT_B_HOST
const OTHER_HOST = process.env.TENANT_A_HOST
const CONTROL_HOST = process.env.CONTROL_HOST
const COMMUNITY_ID = process.env.BUEHNE_COMMUNITY_B
const STATE_FILE = process.env.BUEHNE_STATE

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const poolDatabaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const poolKey = process.env.NUXT_APPWRITE_KEY
const controlEndpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
const controlProject = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
const controlDatabaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
const controlKey = process.env.NUXT_PLATFORM_CONTROL_KEY

if (!PORT || !HOST || !OTHER_HOST || !CONTROL_HOST || !COMMUNITY_ID || !STATE_FILE
  || !endpoint || !poolProject || !poolDatabaseId || !poolKey
  || !controlEndpoint || !controlProject || !controlDatabaseId || !controlKey) {
  console.error(`✗ Umgebung unvollständig — über \`pnpm buehne run --only ${SCRIPT}\` starten.`)
  process.exit(1)
}

const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script: SCRIPT })
const control = appwriteRest({ endpoint: controlEndpoint, projectId: controlProject, key: controlKey, script: SCRIPT })
const cleanup = createCleanup({ pool, control, poolDatabaseId, controlDatabaseId })
const { call, page } = createHttpCaller({ port: PORT })

const stage = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const owner = stage.communities.b.accounts.owner
const otherOwner = stage.communities.a.accounts.owner

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

// ── Den Kopf lesen, wie ihn ein Crawler liest ───────────────────────────────

// Der Läufer ruft mit der Host-Kopfzeile OHNE Port — genau so baut die App ihre Adressen.
const ORIGIN = `http://${HOST}`

function attribute(tag, name) {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? ''
}

function head(html) {
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0])
  const metas = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => match[0])
  return {
    descriptions: metas.filter(tag => attribute(tag, 'name') === 'description').map(tag => attribute(tag, 'content')),
    robots: metas.filter(tag => attribute(tag, 'name') === 'robots').map(tag => attribute(tag, 'content')),
    ogUrl: metas.filter(tag => attribute(tag, 'property') === 'og:url').map(tag => attribute(tag, 'content')),
    canonicals: links.filter(tag => attribute(tag, 'rel') === 'canonical').map(tag => attribute(tag, 'href')),
    hreflangs: links.filter(tag => attribute(tag, 'hreflang')).map(tag => attribute(tag, 'hreflang')),
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => match[1].replace(/<[^>]+>/g, '').trim()),
  }
}

async function readHead(path, host = HOST) {
  const res = await page(host, path)
  return { status: res.status, ...head(res.text) }
}

async function sitemapLocs() {
  const res = await call(HOST, '/sitemap.xml')
  return { status: res.status, text: res.text, locs: [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]) }
}

/** Eine Seitenart: Beschreibung, genau ein h1, genau ein canonical. */
async function checkPageKind(label, path, { descriptionContains, h1Contains }) {
  const seen = await readHead(path)
  check(`${label}: antwortet 200`, seen.status === 200, `Status ${seen.status}`)
  check(`${label}: genau eine Beschreibung mit dem Anfang des Inhalts`,
    seen.descriptions.length === 1 && seen.descriptions[0].includes(descriptionContains),
    JSON.stringify(seen.descriptions))
  check(`${label}: genau ein h1 mit dem Titel`, seen.h1.length === 1 && seen.h1[0].includes(h1Contains), JSON.stringify(seen.h1))
  check(`${label}: genau ein canonical`, seen.canonicals.length === 1, JSON.stringify(seen.canonicals))
  check(`${label}: kein noindex (Gegenprobe zu den Konto-Seiten)`, seen.robots.length === 0, JSON.stringify(seen.robots))
  return seen
}

async function waitFor(label, probe, timeoutMs = 75_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await probe()) return true
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  console.log(`  ✗ Zeitgrenze: ${label}`)
  return false
}

// ── Inhalte über die echten Routen anlegen ──────────────────────────────────

async function create(host, cookie, path, body, table) {
  const res = await call(host, path, { method: 'POST', cookie, body })
  const id = res.json?.$id ?? res.json?.post?.$id ?? res.json?.course?.$id ?? res.json?.event?.$id
  if (res.status >= 300 || !id) throw new Error(`POST ${path} auf ${host} → ${res.status}: ${res.text.slice(0, 200)}`)
  cleanup.track('poolRow', `${table}/${id}`)
  return { id, json: res.json }
}

const inAWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString()

async function main() {
  const stamp = Date.now().toString(36)
  console.log(`\nCommunity-Seiten für die Suche gegen ${ORIGIN}, Port ${PORT} (Kontroll-Host ${CONTROL_HOST})\n`)

  const cookie = await login(call, HOST, owner)
  const otherCookie = await login(call, OTHER_HOST, otherOwner)

  // Das Profil der Bühnen-Community merken — Schritt 4 schreibt die
  // Hauptsprache hinein, das Aufräumen stellt die Zeile wieder her.
  const before = await control.getRow(controlDatabaseId, 'communities', COMMUNITY_ID)
  restoreProfile = () => control.updateRow(controlDatabaseId, 'communities', COMMUNITY_ID, { profile: before.profile ?? '', name: before.name })

  console.log('0. Inhalte anlegen (Owner der Community, echte Routen)')
  const slug = `q10-${stamp}`
  const category = await create(HOST, cookie, '/api/posts/categories', { name: `Praxis ${stamp}`, slug, description: 'Beweis-Kategorie.' }, 'post_categories')
  const topicText = `Der Morgen beginnt mit zehn ruhigen Minuten ${stamp}.`
  const topic = await create(HOST, cookie, '/api/posts', { type: 'post', title: `Zehn Minuten ${stamp}`, body: `${topicText}\n\nZweiter Absatz.`, categoryId: category.id }, 'posts')
  const gone = await create(HOST, cookie, '/api/posts', { type: 'post', title: `Gelöschtes Thema ${stamp}`, body: 'Wird gleich gelöscht.', categoryId: category.id }, 'posts')
  const removed = await call(HOST, `/api/posts/${gone.id}`, { method: 'DELETE', cookie })
  check('Vorbereitung: zweites Thema gelöscht', removed.status < 300, `Status ${removed.status}`)

  const courseText = `In sieben Tagen zur eigenen Morgenroutine ${stamp}.`
  await create(HOST, cookie, '/api/courses', { title: `Morgenroutine ${stamp}`, slug: `kurs-${slug}`, description: courseText, access: 'members', status: 'published' }, 'courses')
  await create(HOST, cookie, '/api/courses', { title: `Entwurf ${stamp}`, slug: `entwurf-${slug}`, description: 'Noch nicht öffentlich.', access: 'members', status: 'draft' }, 'courses')

  const eventText = `Wir treffen uns zum gemeinsamen Start in den Tag ${stamp}.`
  const event = await create(HOST, cookie, '/api/events', { title: `Morgenrunde ${stamp}`, description: eventText, startAt: inAWeek(), status: 'published' }, 'events')
  const draftEvent = await create(HOST, cookie, '/api/events', { title: `Termin-Entwurf ${stamp}`, description: 'Noch nicht öffentlich.', startAt: inAWeek(), status: 'draft' }, 'events')

  // Die ANDERE Community bekommt eigene Inhalte — sie dürfen hier nie auftauchen.
  const otherCourse = await create(OTHER_HOST, otherCookie, '/api/courses', { title: `Fremder Kurs ${stamp}`, slug: `fremd-${slug}`, description: 'Gehört der anderen Community.', access: 'members', status: 'published' }, 'courses')
  const otherEvent = await create(OTHER_HOST, otherCookie, '/api/events', { title: `Fremder Termin ${stamp}`, description: 'Gehört der anderen Community.', startAt: inAWeek(), status: 'published' }, 'events')

  const topicPath = `/discussions/${slug}/${topic.id}/zehn-minuten-${stamp}`
  const coursePath = `/courses/kurs-${slug}`
  const eventPath = `/events/${event.id}`

  console.log('\n1. Je Seitenart: Beschreibung, genau ein h1, genau ein canonical')
  const topicHead = await checkPageKind('Diskussion', topicPath, { descriptionContains: topicText, h1Contains: `Zehn Minuten ${stamp}` })
  const courseHead = await checkPageKind('Kurs', coursePath, { descriptionContains: courseText, h1Contains: `Morgenroutine ${stamp}` })
  const eventHead = await checkPageKind('Termin', eventPath, { descriptionContains: eventText, h1Contains: `Morgenrunde ${stamp}` })
  for (const [label, path] of [['Übersicht Kurse', '/courses'], ['Übersicht Termine', '/events']]) {
    const seen = await readHead(path)
    check(`${label}: eine Beschreibung, ein h1, ein canonical`,
      seen.descriptions.length === 1 && seen.descriptions[0].length > 10 && seen.h1.length === 1 && seen.canonicals.length === 1,
      JSON.stringify({ d: seen.descriptions, h1: seen.h1, c: seen.canonicals }))
  }

  console.log('\n2. Ohne gewählte Hauptsprache: die Adresse ohne Vorsatz ist maßgeblich')
  check('Diskussion (englische Adresse): canonical zeigt auf sich selbst', topicHead.canonicals[0] === `${ORIGIN}${topicPath}`, topicHead.canonicals[0])
  check('Diskussion: meldet keine Sprachfassungen mehr', topicHead.hreflangs.length === 0, JSON.stringify(topicHead.hreflangs))
  const topicDe = await readHead(`/de${topicPath}`)
  check('Diskussion (deutsche Adresse): 200, genau ein canonical — auf die Adresse ohne Vorsatz',
    topicDe.status === 200 && topicDe.canonicals.length === 1 && topicDe.canonicals[0] === `${ORIGIN}${topicPath}`,
    JSON.stringify(topicDe.canonicals))
  check('Diskussion (deutsche Adresse): og:url nennt dieselbe Adresse', topicDe.ogUrl.length === 1 && topicDe.ogUrl[0] === `${ORIGIN}${topicPath}`, JSON.stringify(topicDe.ogUrl))
  check('Kurs und Termin: canonical auf die Adresse ohne Vorsatz',
    courseHead.canonicals[0] === `${ORIGIN}${coursePath}` && eventHead.canonicals[0] === `${ORIGIN}${eventPath}`,
    JSON.stringify([courseHead.canonicals, eventHead.canonicals]))
  const overview = await readHead('/de/discussions')
  check('Gegenprobe Übersicht: canonical auf der EIGENEN Adresse, Sprachfassungen bleiben',
    overview.canonicals[0] === `${ORIGIN}/de/discussions` && overview.hreflangs.includes('en') && overview.hreflangs.includes('de'),
    JSON.stringify({ c: overview.canonicals, h: overview.hreflangs }))

  console.log('\n3. Sitemap: öffentliche Inhalte ja, nicht öffentliche nein')
  let map = await sitemapLocs()
  check('Sitemap antwortet 200', map.status === 200, `Status ${map.status}`)
  const once = url => map.locs.filter(loc => loc === url).length === 1
  check('nennt die Diskussion genau einmal', once(`${ORIGIN}${topicPath}`), map.locs.filter(loc => loc.includes(topic.id)).join(' '))
  check('nennt die Kategorie (beide Sprach-Adressen)', once(`${ORIGIN}/discussions/${slug}`) && once(`${ORIGIN}/de/discussions/${slug}`))
  check('nennt den Kurs genau einmal', once(`${ORIGIN}${coursePath}`))
  check('nennt den Termin genau einmal', once(`${ORIGIN}${eventPath}`))
  check('nennt die Übersichten', once(`${ORIGIN}/discussions`) && once(`${ORIGIN}/courses`) && once(`${ORIGIN}/events`))
  check('Gegenprobe: das gelöschte Thema fehlt', !map.text.includes(gone.id))
  check('Gegenprobe: der Kurs-Entwurf fehlt', !map.text.includes(`entwurf-${slug}`))
  check('Gegenprobe: der Termin-Entwurf fehlt', !map.text.includes(draftEvent.id))
  check('Gegenprobe: Kurs und Termin der ANDEREN Community fehlen', !map.text.includes(`fremd-${slug}`) && !map.text.includes(otherEvent.id) && !map.text.includes(otherCourse.id))
  check('Gegenprobe: keine Konto- oder Dashboard-Adresse', !/\/(login|register|dashboard|settings)\b/.test(map.locs.join('\n')))

  console.log('\n4. Konto-Seiten und Kontroll-Host: noindex, und die robots.txt lässt es lesen')
  for (const path of ['/login', '/de/login', '/login/code', '/register', '/forgot-password', '/reset-password', '/verify']) {
    const seen = await readHead(path)
    // /login/code und /register leiten je nach Einstellung der Community um —
    // geprüft wird, was als Seite ankommt.
    if (seen.status !== 200) {
      check(`${path}: keine Seite (Status ${seen.status}) — nichts zu indexieren`, seen.status >= 300 && seen.status < 400)
      continue
    }
    check(`${path}: genau ein robots-Tag mit noindex`, seen.robots.length === 1 && /\bnoindex\b/.test(seen.robots[0]), JSON.stringify(seen.robots))
  }
  const robots = await call(HOST, '/robots.txt')
  // Seit Q11 trägt die robots.txt eigene KI-Gruppen: die Training-Gruppe einer
  // Community sagt `Disallow: /` (Davids Entscheidung B2). Gefragt wird deshalb
  // je GRUPPE: `*` und die Such-Gruppe dürfen die Konto-Seiten nicht sperren.
  const blocksAccountPages = group => (group?.rules ?? []).some(rule => /^disallow: \/(login|register)?$/.test(rule))
  const groups = robots.status === 200 ? parseRobotsGroups(robots.text) : []
  const groupOf = agent => groups.find(entry => entry.agents.includes(agent))
  check('robots.txt der Community sperrt die Konto-Seiten nicht (Gruppe * und KI-Suche)',
    robots.status === 200 && Boolean(groupOf('*')) && !blocksAccountPages(groupOf('*')) && !blocksAccountPages(groupOf('oai-searchbot')), robots.text)
  check('Gegenprobe: die Training-Gruppe der Community sperrt alles (B2)', robots.status === 200 && blocksAccountPages(groupOf('gptbot')), robots.text)
  const controlLogin = await readHead('/login', CONTROL_HOST)
  check('Kontroll-Host /login: noindex', controlLogin.status === 200 && controlLogin.robots.length === 1 && /\bnoindex\b/.test(controlLogin.robots[0]), JSON.stringify(controlLogin.robots))
  const controlRobots = await call(CONTROL_HOST, '/robots.txt')
  check('Kontroll-Host robots.txt: nicht mehr ganz gesperrt (sonst liest niemand das noindex)',
    controlRobots.status === 200 && /^User-agent: \*$/m.test(controlRobots.text) && !/^Disallow: \/$/m.test(controlRobots.text), controlRobots.text)

  console.log('\n5. Der Owner wählt „Deutsch" als Hauptsprache')
  const profile = await call(HOST, '/api/community/profile', { cookie })
  check('Profil: noch keine eigene Wahl', profile.status === 200 && (profile.json?.locale ?? '') === '', JSON.stringify(profile.json))
  const saved = await call(HOST, '/api/community/profile', {
    method: 'PATCH', cookie,
    body: { name: profile.json?.name ?? before.name, description: profile.json?.description ?? '', locale: 'de' },
  })
  check('PATCH /api/community/profile mit locale → 200, Antwort nennt „de"', saved.status === 200 && saved.json?.locale === 'de', `Status ${saved.status} ${saved.text.slice(0, 160)}`)
  const rejected = await call(HOST, '/api/community/profile', { method: 'PATCH', cookie, body: { name: before.name, locale: 'fr' } })
  check('Gegenprobe: eine unbekannte Sprache wird abgelehnt (400)', rejected.status === 400, `Status ${rejected.status}`)
  const guest = await call(HOST, '/api/community/profile', { method: 'PATCH', body: { name: before.name, locale: 'en' } })
  check('Gegenprobe: ohne Anmeldung keine Änderung (401)', guest.status === 401, `Status ${guest.status}`)

  // Der Mandanten-Kontext wird bis zu 30 s gehalten — warten, bis die Wahl ankommt.
  const arrived = await waitFor('die Hauptsprache kommt im Kopf an', async () => (await readHead(topicPath)).canonicals[0] === `${ORIGIN}/de${topicPath}`)
  check('Diskussion (englische Adresse): canonical zeigt jetzt auf die deutsche', arrived)
  const afterEn = await readHead(topicPath)
  const afterDe = await readHead(`/de${topicPath}`)
  check('beide Adressen: genau ein canonical, dasselbe',
    afterEn.canonicals.length === 1 && afterDe.canonicals.length === 1 && afterDe.canonicals[0] === `${ORIGIN}/de${topicPath}`,
    JSON.stringify([afterEn.canonicals, afterDe.canonicals]))
  check('beide Adressen: keine Sprachfassung gemeldet', afterEn.hreflangs.length === 0 && afterDe.hreflangs.length === 0, JSON.stringify([afterEn.hreflangs, afterDe.hreflangs]))
  check('die englische Adresse antwortet weiter 200 (kein Bruch, keine Umleitung)', afterEn.status === 200, `Status ${afterEn.status}`)
  const courseAfter = await readHead(coursePath)
  const eventAfter = await readHead(eventPath)
  check('Kurs und Termin: canonical auf die deutsche Adresse',
    courseAfter.canonicals[0] === `${ORIGIN}/de${coursePath}` && eventAfter.canonicals[0] === `${ORIGIN}/de${eventPath}`,
    JSON.stringify([courseAfter.canonicals, eventAfter.canonicals]))
  const overviewAfter = await readHead('/discussions')
  check('Gegenprobe Übersicht: unverändert eigene Adresse und Sprachfassungen',
    overviewAfter.canonicals[0] === `${ORIGIN}/discussions` && overviewAfter.hreflangs.includes('de'), JSON.stringify(overviewAfter.canonicals))

  // Die Sitemap wird beim Client eine Stunde gehalten, der Server baut sie je Abruf neu.
  map = await sitemapLocs()
  check('Sitemap: die Diskussion steht unter der deutschen Adresse — und nur dort',
    map.locs.includes(`${ORIGIN}/de${topicPath}`) && !map.locs.includes(`${ORIGIN}${topicPath}`),
    map.locs.filter(loc => loc.includes(topic.id)).join(' '))
  check('Sitemap: Kurs und Termin ebenso',
    map.locs.includes(`${ORIGIN}/de${coursePath}`) && !map.locs.includes(`${ORIGIN}${coursePath}`)
    && map.locs.includes(`${ORIGIN}/de${eventPath}`) && !map.locs.includes(`${ORIGIN}${eventPath}`))
}

let restoreProfile = null
let crashed = false
try {
  await main()
}
catch (error) {
  crashed = true
  console.error(`✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  if (restoreProfile) {
    await restoreProfile().catch((error) => {
      fail++
      console.log(`  ✗ Profil der Bühnen-Community nicht wiederhergestellt — ${error instanceof Error ? error.message : String(error)}`)
    })
  }
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
