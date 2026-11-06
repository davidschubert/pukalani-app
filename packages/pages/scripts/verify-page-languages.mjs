/**
 * Beweis für F60 (Davids Entscheidungen vom 2026-09-10) — MEHRSPRACHIGE
 * BETREIBER-SEITEN: der Fallback zeigt und sagt, was er zeigt.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane: Community anlegen, eine Seite NUR auf Deutsch
 * schreiben, veröffentlichen, und dann auf dem Community-Host messen.
 * GEMESSEN WIRD IM SSR-HTML — eine Zusage im Kopf, die im ausgelieferten HTML
 * nicht steht, ist keine; Suchmaschinen und Vorleseprogramme sehen genau
 * dieses HTML.
 *
 *   1. nur DE: die öffentliche Route liefert die deutsche Fassung, auch wenn
 *      Englisch gewünscht war (Rechtstexte bleiben erreichbar) — und sie sagt
 *      in `availableLocales`, was es wirklich gibt
 *   2. der englische Pfad trägt den HINWEIS und markiert den Text als `de`
 *   3. der englische Pfad behauptet KEIN `hreflang="en"` und kein
 *      `og:locale:alternate` auf Englisch mehr (`x-default` bleibt bewusst —
 *      es ist keine Sprachzusage, sondern der Rückfall, den die Seite zeigt)
 *   4. der deutsche Pfad zeigt KEINEN Hinweis (dort stimmt die Sprache)
 *   5. Gegenprobe innerhalb derselben Seite: die englische Fassung dazu ⇒
 *      Hinweis weg, beide Alternates zurück
 *   6. Gegenprobe „Entwurf zählt nicht": die englische Fassung auf Entwurf ⇒
 *      Hinweis wieder da, `hreflang="en"` wieder weg
 *   7. Gegenprobe „kein Übersprung": eine ZWEITE Seite mit beiden Sprachen
 *      behält ihre Alternates, obwohl die erste nur eine hat
 *   8. die Startseite der Community behält ihre Alternates (nichts leckt)
 *   9. der Übersetzen-Endpunkt: ohne Anmeldung dicht, mit Anmeldung entweder
 *      ein Vorschlag oder eine ehrliche Absage — er SPEICHERT nie
 *  10. der Deckel (12.000 Zeichen) greift VOR dem Anbieter
 *  11. die Verwaltungsliste meldet, ob der Knopf erscheinen darf
 *
 * Räumt am Ende jede angelegte Zeile weg.
 *
 * VORAUSSETZUNG — zwei Dev-Server AUS DEM WORKTREE (eigene Ports; `exec nuxi
 * dev`, weil `dev -- --port` den Port nicht durchreicht):
 *   pnpm --filter control exec nuxi dev --port 3020
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3020 \
 *     pnpm --filter platform exec nuxi dev --port 3021
 *
 *   PLATFORM_PORT=3021 POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/pages/scripts/verify-page-languages.mjs
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3021)
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
const cleanup = { users: [], codes: [], tenants: [], members: [], pages: [] }
/**
 * DIE POOL-SEITIGE ID DER COMMUNITY — nicht dieselbe wie die Control-Zeile.
 *
 * Sie steht auf jeder `pages`-Zeile (`t-…`) und wird gebraucht, um am Ende
 * AUCH die vom Onboarding GESEEDETEN Seiten (home, imprint, privacy,
 * guidelines) wegzuräumen. Die alten Beweis-Skripte löschen nur, was sie
 * selbst geschrieben haben — deshalb liegen in der lokalen Dev-Datenbank
 * Hunderte Seiten-Zeilen zu Communities, die es längst nicht mehr gibt.
 */
let poolCommunityId = ''

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, accept } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) } catch { /* HTML */ }
        resolve({ status: res.statusCode, text, json, setCookie: res.headers['set-cookie'] || [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const page = (host, path) => call(host, path, { accept: 'text/html' }).then(r => r.text)

/**
 * Alle hreflang-Werte aus dem SSR-Kopf.
 *
 * nuxt-i18n schreibt je Sprache ZWEI Einträge (`de` und `de-DE`, aus `code`
 * und `language`) plus `x-default`. Die erste Fassung dieses Beweises erwartete
 * nur `["de"]` und war rot, obwohl der Code stimmte — die Erwartung war der
 * Fehler, nicht die Messung.
 */
function alternates(html) {
  return [...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)]
    .map(tag => tag[0].match(/hreflang="([^"]+)"/)?.[1])
    .filter(Boolean)
    .sort()
}
const hasNotice = html => html.includes('data-page-language-notice')

/** Die `og:locale:alternate`-Angaben — der core-Filter räumt sie mit ab. */
function ogAlternates(html) {
  return [...html.matchAll(/<meta[^>]+property="og:locale:alternate"[^>]*>/g)]
    .map(tag => tag[0].match(/content="([^"]+)"/)?.[1])
    .filter(Boolean)
    .sort()
}

async function createPoolUser(tag) {
  const email = `f60-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `F60 ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode(tag) {
  const code = `PUKA-F60${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId,
    tableId: 'invite_codes',
    rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'F60-Beweis',
      maxUses: 0,
      uses: 0,
      expiresAt: null,
      status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(cookie, slug, name) {
  const code = await issueCode(slug.slice(-4).toUpperCase())
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'F60-Beweis: der Fallback sagt, was er zeigt.',
      vibe: 'fresh',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (created.status !== 200 || !created.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(created.json.communityId)
  const members = await control.listRows({
    databaseId,
    tableId: 'community_members',
    queries: [Query.equal('communityId', created.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: created.json.communityId, host: created.json.host }
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

const savePage = (host, cookie, body) => call(host, '/api/pages', { method: 'PUT', cookie, body })

try {
  console.log(`\nF60-Beweis (mehrsprachige Betreiber-Seiten) gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const controlCookie = await login(CONTROL_HOST, owner)
  const stamp = Date.now().toString(36)

  console.log('0. Community anlegen')
  const site = await createCommunity(controlCookie, `f60-${stamp}`, 'F60 Beweis')
  const up = await waitForHost(site.host)
  check(`Community ${site.host} antwortet`, up)
  const cookie = await login(site.host, owner)

  const SLUG = 'imprint'
  const BOTH = 'about-both'

  console.log('\n1. Eine Seite NUR auf Deutsch, veröffentlicht')
  const de = await savePage(site.host, cookie, {
    slug: SLUG, locale: 'de', title: 'Impressum', body: '## Angaben\n\nMusterstraße 1', status: 'published',
  })
  check(`gespeichert (${de.status})`, de.status === 200)
  if (de.json?.$id) cleanup.pages.push(de.json.$id)
  // Die gespeicherte Zeile trägt die Pool-Id der Community — die einzige
  // Stelle, an der wir sie ohne zweite Abfrage bekommen.
  if (de.json?.communityId) poolCommunityId = de.json.communityId

  const askedDe = await call(site.host, `/api/pages/public/${SLUG}?locale=de`)
  check('locale=de liefert die deutsche Fassung', askedDe.json?.locale === 'de', String(askedDe.json?.locale))
  const askedEn = await call(site.host, `/api/pages/public/${SLUG}?locale=en`)
  check('locale=en liefert die deutsche Fassung (der Rechtstext bleibt erreichbar)',
    askedEn.status === 200 && askedEn.json?.locale === 'de', `${askedEn.status} ${askedEn.json?.locale}`)
  check('availableLocales sagt die Wahrheit: nur de',
    JSON.stringify(askedEn.json?.availableLocales) === '["de"]', JSON.stringify(askedEn.json?.availableLocales))

  console.log('\n2.–4. Was im SSR-HTML steht')
  const enHtml = await page(site.host, `/${SLUG}`)
  check('englischer Pfad: der HINWEIS steht da', hasNotice(enHtml))
  check('englischer Pfad: der Text ist als deutsch markiert (lang="de")',
    /<h1[^>]+lang="de"/.test(enHtml) && /<div lang="de">/.test(enHtml))
  check('englischer Pfad: KEIN hreflang="en"/"en-US" mehr, aber de bleibt',
    JSON.stringify(alternates(enHtml)) === '["de","de-DE","x-default"]', JSON.stringify(alternates(enHtml)))
  // `x-default` BLEIBT bewusst stehen: es ist keine Sprachfassung, sondern die
  // Ansage „nimm diese, wenn keine passt" — und genau den Rückfall zeigt die
  // Seite ja. Die Begründung gehört dem core-Filter (`seoAlternates.ts`).
  check('englischer Pfad: x-default bleibt (es ist keine Sprachzusage)',
    alternates(enHtml).includes('x-default'))
  check('englischer Pfad: auch og:locale:alternate nennt Englisch nicht mehr',
    !ogAlternates(enHtml).some(v => v.toLowerCase().startsWith('en')), JSON.stringify(ogAlternates(enHtml)))
  check('kein roher i18n-Schlüssel im HTML', !enHtml.includes('pages.public.otherLanguage'))

  const deHtml = await page(site.host, `/de/${SLUG}`)
  check('deutscher Pfad: KEIN Hinweis (dort stimmt die Sprache)', !hasNotice(deHtml))
  check('deutscher Pfad: ebenfalls nur die deutschen Alternates',
    JSON.stringify(alternates(deHtml)) === '["de","de-DE","x-default"]', JSON.stringify(alternates(deHtml)))

  console.log('\n5. Gegenprobe: die englische Fassung dazu')
  const en = await savePage(site.host, cookie, {
    slug: SLUG, locale: 'en', title: 'Imprint', body: '## Details\n\nSample Street 1', status: 'published',
  })
  if (en.json?.$id) cleanup.pages.push(en.json.$id)
  const enHtml2 = await page(site.host, `/${SLUG}`)
  check('Hinweis ist weg', !hasNotice(enHtml2))
  check('alle Alternates sind zurück (inkl. x-default)',
    JSON.stringify(alternates(enHtml2)) === '["de","de-DE","en","en-US","x-default"]', JSON.stringify(alternates(enHtml2)))

  console.log('\n6. Gegenprobe: ein ENTWURF zählt nicht als Fassung')
  await savePage(site.host, cookie, {
    slug: SLUG, locale: 'en', title: 'Imprint', body: '## Details\n\nSample Street 1', status: 'draft',
  })
  const enHtml3 = await page(site.host, `/${SLUG}`)
  check('Hinweis ist wieder da', hasNotice(enHtml3))
  check('hreflang="en" ist wieder weg',
    JSON.stringify(alternates(enHtml3)) === '["de","de-DE","x-default"]', JSON.stringify(alternates(enHtml3)))

  console.log('\n7.–8. Gegenprobe: nichts leckt auf andere Seiten')
  const b1 = await savePage(site.host, cookie, { slug: BOTH, locale: 'de', title: 'Über uns', body: 'Hallo', status: 'published' })
  const b2 = await savePage(site.host, cookie, { slug: BOTH, locale: 'en', title: 'About us', body: 'Hello', status: 'published' })
  if (b1.json?.$id) cleanup.pages.push(b1.json.$id)
  if (b2.json?.$id) cleanup.pages.push(b2.json.$id)
  const bothHtml = await page(site.host, `/${BOTH}`)
  check('zweisprachige Seite behält alle Alternates, obwohl die Nachbarseite nur eine Sprache hat',
    JSON.stringify(alternates(bothHtml)) === '["de","de-DE","en","en-US","x-default"]', JSON.stringify(alternates(bothHtml)))
  const homeHtml = await page(site.host, '/')
  check('Startseite behält ihre Alternates',
    alternates(homeHtml).includes('en') && alternates(homeHtml).includes('de'), JSON.stringify(alternates(homeHtml)))

  console.log('\n9.–11. Der KI-Vorschlag')
  const anon = await call(site.host, '/api/pages/translate', {
    method: 'POST', body: { locale: 'en', title: 'Impressum', body: 'Text' },
  })
  check(`ohne Anmeldung dicht (${anon.status})`, [401, 403, 404].includes(anon.status))

  const list = await call(site.host, '/api/pages', { cookie })
  check(`Verwaltungsliste meldet aiTranslate (${list.json?.aiTranslate})`, typeof list.json?.aiTranslate === 'boolean')

  /**
   * DER DECKEL LIEGT HINTER DER KLINKE, und das ist Absicht: ohne hinterlegten
   * Schlüssel antwortet die Route 503, bevor sie den Körper überhaupt liest
   * (billigste Prüfung zuerst, wie beim Kategorie-Vorschlag). Der Deckel ist
   * also nur messbar, wenn KI konfiguriert ist — sonst wird hier die Klinke
   * gemessen, und das steht dann auch da.
   */
  const aiOn = list.json?.aiTranslate === true
  const tooLong = await call(site.host, '/api/pages/translate', {
    method: 'POST', cookie, body: { locale: 'en', title: 'Impressum', body: 'x'.repeat(12_001) },
  })
  check(aiOn
    ? `Deckel greift vor dem Anbieter (${tooLong.status})`
    : `ohne KI-Schlüssel schließt die Klinke vor dem Deckel (${tooLong.status})`,
  aiOn ? tooLong.status === 400 : [402, 404, 503].includes(tooLong.status), tooLong.text.slice(0, 120))

  const suggest = await call(site.host, '/api/pages/translate', {
    method: 'POST', cookie, body: { locale: 'en', title: 'Impressum', body: '## Angaben\n\nMusterstraße 1' },
  })
  if (suggest.status === 200) {
    check(`Vorschlag kam (Modell ${suggest.json?.model})`, !!suggest.json?.title)
    const after = await call(site.host, `/api/pages/public/${SLUG}?locale=en`)
    check('… und er wurde NICHT gespeichert (die Seite ist unverändert deutsch)',
      after.json?.locale === 'de' && JSON.stringify(after.json?.availableLocales) === '["de"]')
  }
  else {
    check(`ehrliche Absage statt halbem Ergebnis (${suggest.status})`, [402, 404, 503].includes(suggest.status),
      suggest.text.slice(0, 160))
  }
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error?.message ?? error}`)
}
finally {
  console.log('\nAufräumen …')
  for (const id of cleanup.pages) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'pages', rowId: id }).catch(() => {})
  }
  // … und die GESEEDETEN dazu (Begründung oben bei `poolCommunityId`).
  if (poolCommunityId) {
    const seeded = await poolDb.listRows({
      databaseId: poolDatabaseId,
      tableId: 'pages',
      queries: [Query.equal('communityId', poolCommunityId), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of seeded.rows) {
      await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: 'pages', rowId: row.$id }).catch(() => {})
    }
    console.log(`  ✔ ${seeded.rows.length} geseedete Seiten-Zeilen entfernt`)
  }
  for (const id of cleanup.members) {
    await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.tenants) {
    await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.codes) {
    await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await poolUsers.delete({ userId: id }).catch(() => {})
  }
  // Sichtbar machen, was übrig bleibt: die erste Fassung dieses Skripts löschte
  // aus `tenants` (die Tabelle heisst `communities`), der 404 fiel in ein
  // `catch` — zwei Test-Communities blieben stehen, und nichts sagte es.
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Communities: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail}\n`)
  process.exit(fail === 0 ? 0 : 1)
}
