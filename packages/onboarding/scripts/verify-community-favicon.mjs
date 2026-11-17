/**
 * Beweis für den Community-Favicon-Upload (Davids Zuschnitt vom 2026-08-18):
 * eine Community lädt ein eigenes PNG-Favicon hoch, es erscheint im Tab und als
 * App-Icon; ohne Upload bleibt das generierte Initial-SVG.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane (Plumbing aus verify-site-branding.mjs). Eine Community
 * anlegen, auf dem Community-Host prüfen:
 *   - Owner-Upload eines gültigen 64×64-PNG → 201 mit `updatedAt`
 *   - Viewer (Mitglied ohne branding.manage) → 403
 *   - Gast (ohne Session) → 401
 *   - JPEG als PNG deklariert → 415
 *   - 600×600 (über MAX_FAVICON_DIM) → 400, code 'favicon_dimensions'
 *   - > 1 MB → 413
 *   - danach trägt das SSR-HTML PNG-Icon-Links mit dem Upload-Key UND KEIN
 *     `favicon.svg` mehr; `/icon/<key>.png` liefert PNG-Bytes
 *   - DELETE → SSR-HTML trägt wieder den generierten Key und `favicon.svg`
 * Mit Gegenproben (Beweis-Regel 2026-08-18): jede Ablehnung wird durch einen
 * passenden Erfolg begleitet, damit ein still-grüner Test auffällt.
 *
 * Setzt am Ende alles zurück und räumt jede angelegte Zeile + Datei weg.
 *
 * VORAUSSETZUNG — zwei laufende Dev-Server (eigene Ports, damit parallele
 * Sessions sich nicht in die Quere kommen), volle Dienst-Kette aus dem Worktree:
 *   pnpm --filter control exec nuxi dev --port 3155
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3155 \
 *     pnpm --filter platform exec nuxi dev --port 3154
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-community-favicon.mjs
 *
 * system-037 (Bucket `favicons`) muss auf dem Pool gelaufen sein
 * (`pnpm migrate --app platform --layer system`).
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { Client, ID, Storage } from 'node-appwrite'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createProbeAccount,
  createProbeCommunity,
  login as loginOn,
  runStamp,
  waitForHost as waitForHostOn,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3154)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const script = 'verify-community-favicon'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const poolStorage = new Storage(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const cleanup = createCleanup({ pool, control, controlDatabaseId: databaseId })
const runId = runStamp()
/** Hochgeladene Favicons (fileId = communityId) — die Datei räumt dieses Skript selbst. */
const favicons = []

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

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, accept, rawBody, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (body ? Buffer.from(JSON.stringify(body)) : null)
    const type = contentType ?? (body ? 'application/json' : null)
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
        ...(payload ? { 'content-type': type, 'content-length': payload.length } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const text = buf.toString('utf8')
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML/Binär */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text, buffer: buf, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Seiten-SSR wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
function page(host, path, cookie) {
  return call(host, path, { cookie, accept: 'text/html' })
}

/** Multipart-Body mit einem Datei-Feld `file` — von Hand, damit node:http reicht. */
function multipart(fileBuffer, filename, mimeType) {
  const boundary = `----pukalani${ID.unique()}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n`
    + `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return {
    body: Buffer.concat([head, fileBuffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

// ── Minimales, aber echtes PNG bauen (Signatur + IHDR + IDAT + IEND) ──────────
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function makePng(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 2 // Farbtyp RGB
  // Bildzeilen: je Zeile ein Filter-Byte + width*3 Farbbytes (grau).
  const raw = Buffer.alloc(height * (1 + width * 3), 0x80)
  for (let y = 0; y < height; y++) raw[y * (1 + width * 3)] = 0
  const idat = deflateSync(raw)
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Attribut-Wert aus dem <html>-Kopf ziehen — hier: alle <link>-Zeilen. */
function faviconLinks(html) {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? html
  return [...head.matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
}
function hasSvgFavicon(html) {
  return faviconLinks(html).some(link => /rel="icon"/.test(link) && /favicon\.svg/.test(link))
}
/** Der /icon/<key>.png-Schlüssel aus einem apple-touch-icon- oder icon-PNG-Link. */
function iconKeys(html) {
  return [...html.matchAll(/\/icon\/([0-9a-z]{5,12})\.png/gi)].map(m => m[1])
}

/** Probe-Konto. Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse. */
async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `favicon-${tag}`, stamp: runId, name: `Favicon ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

const login = (host, account) => loginOn(call, host, account)

async function createCommunity(cookie, slug, name) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control, databaseId, slug, name, cleanup,
    bodyOverrides: { description: 'Favicon-Beweis.', vibe: 'fresh' },
  })
  favicons.push(created.communityId)
  return { communityId: created.communityId, host: created.host }
}

const waitForHost = host => waitForHostOn(call, host)

/** SSR pollen, bis der Upload-Key im Kopf steht (Microcache ≤30 s). */
async function waitForUploadedIcon(host, cookie, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const res = await page(host, '/', cookie)
    if (!hasSvgFavicon(res.text) && iconKeys(res.text).length > 0) {
      return { ok: true, ms: Date.now() - started, html: res.text }
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  const last = await page(host, '/', cookie)
  return { ok: false, ms: Date.now() - started, html: last.text }
}

/** SSR pollen, bis das generierte SVG-Favicon zurück ist. */
async function waitForGeneratedIcon(host, cookie, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const res = await page(host, '/', cookie)
    if (hasSvgFavicon(res.text)) return { ok: true, ms: Date.now() - started, html: res.text }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  const last = await page(host, '/', cookie)
  return { ok: false, ms: Date.now() - started, html: last.text }
}

/** Ein Mitglied MIT niedriger Rolle (viewer) anlegen — hat kein branding.manage. */
async function addViewer(communityId, viewerAccount) {
  const row = await addStageMember(control, databaseId, {
    communityId, projectId: poolProject, userId: viewerAccount.userId, role: 'viewer', status: 'active', email: viewerAccount.email,
  })
  cleanup.track('member', row.$id)
}

try {
  console.log(`\nFavicon-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const viewer = await createPoolUser('viewer')
  const ownerControlCookie = await login(CONTROL_HOST, owner)

  console.log('1. Community anlegen und antworten lassen')
  const site = await createCommunity(ownerControlCookie, `favicon-a-${runId}`, 'Favicon Kunde A')
  check('Community angelegt', !!site.host, JSON.stringify(site))
  const themes = await waitForHost(site.host)
  check('Host antwortet', !!themes)

  const ownerCookie = await login(site.host, owner)
  await addViewer(site.communityId, viewer)
  const viewerCookie = await login(site.host, viewer)

  console.log('\n2. Vor dem Upload trägt der Kopf das generierte SVG-Favicon')
  const before = await page(site.host, '/', ownerCookie)
  check('SSR trägt favicon.svg (generierter Zustand)', hasSvgFavicon(before.text))

  console.log('\n3. Ablehnungen — jede mit einem Gegen-Erfolg daneben')
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  const jpegPart = multipart(jpeg, 'logo.png', 'image/png')
  const jpegRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', cookie: ownerCookie, rawBody: jpegPart.body, contentType: jpegPart.contentType,
  })
  check('JPEG als PNG deklariert → 415', jpegRes.status === 415, `Status ${jpegRes.status}`)

  const big = makePng(64, 64)
  const bigPadded = Buffer.concat([big, Buffer.alloc(1_000_001 - big.length, 0)])
  const bigPart = multipart(bigPadded, 'logo.png', 'image/png')
  const bigRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', cookie: ownerCookie, rawBody: bigPart.body, contentType: bigPart.contentType,
  })
  check('> 1 MB → 413', bigRes.status === 413, `Status ${bigRes.status}`)

  const oversize = makePng(600, 600)
  const oversizePart = multipart(oversize, 'logo.png', 'image/png')
  const oversizeRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', cookie: ownerCookie, rawBody: oversizePart.body, contentType: oversizePart.contentType,
  })
  check('600×600 → 400 mit code favicon_dimensions',
    oversizeRes.status === 400 && (oversizeRes.json?.reason === 'favicon_dimensions'),
    `Status ${oversizeRes.status} ${oversizeRes.text.slice(0, 160)}`)

  const validPng = makePng(64, 64)
  const guestPart = multipart(validPng, 'logo.png', 'image/png')
  const guestRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', rawBody: guestPart.body, contentType: guestPart.contentType,
  })
  check('Gast (ohne Session) → 401', guestRes.status === 401, `Status ${guestRes.status}`)

  const viewerPart = multipart(validPng, 'logo.png', 'image/png')
  const viewerRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', cookie: viewerCookie, rawBody: viewerPart.body, contentType: viewerPart.contentType,
  })
  check('Viewer (ohne branding.manage) → 403', viewerRes.status === 403, `Status ${viewerRes.status}`)

  console.log('\n4. Owner lädt ein gültiges 64×64-PNG hoch → 201')
  const okPart = multipart(validPng, 'logo.png', 'image/png')
  const okRes = await call(site.host, '/api/community/branding/favicon', {
    method: 'POST', cookie: ownerCookie, rawBody: okPart.body, contentType: okPart.contentType,
  })
  check('Upload → 201 mit updatedAt',
    okRes.status === 201 && typeof okRes.json?.updatedAt === 'string' && okRes.json?.ok === true,
    `Status ${okRes.status} ${okRes.text.slice(0, 160)}`)

  console.log('\n5. Nach dem Upload: SSR trägt den Upload-Key, KEIN favicon.svg mehr')
  const live = await waitForUploadedIcon(site.host, ownerCookie)
  check(`SSR ohne favicon.svg + mit PNG-Icon-Key (nach ${Math.round(live.ms / 1000)} s)`, live.ok,
    `svg=${hasSvgFavicon(live.html)} keys=${iconKeys(live.html).join(',')}`)
  const key = iconKeys(live.html)[0]
  check('ein Icon-Key steht im Kopf', !!key, String(key))

  console.log('\n6. /icon/<key>.png liefert PNG-Bytes')
  const iconRes = await call(site.host, `/icon/${key}.png?size=180`, { cookie: ownerCookie })
  const isPng = iconRes.buffer.length >= 8
    && iconRes.buffer[0] === 0x89 && iconRes.buffer[1] === 0x50
    && iconRes.buffer[2] === 0x4e && iconRes.buffer[3] === 0x47
  check('Icon-Route antwortet 200 mit PNG-Signatur', iconRes.status === 200 && isPng,
    `Status ${iconRes.status} len ${iconRes.buffer.length}`)

  console.log('\n7. DELETE → SSR trägt wieder den generierten Zustand (favicon.svg)')
  const del = await call(site.host, '/api/community/branding/favicon', { method: 'DELETE', cookie: ownerCookie })
  check('DELETE → 200 ok', del.status === 200 && del.json?.ok === true, `Status ${del.status}`)
  const gen = await waitForGeneratedIcon(site.host, ownerCookie)
  check(`SSR trägt wieder favicon.svg (nach ${Math.round(gen.ms / 1000)} s)`, gen.ok,
    `svg=${hasSvgFavicon(gen.html)}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n8. Aufräumen')
  for (const id of favicons) await poolStorage.deleteFile({ bucketId: 'favicons', fileId: id }).catch(() => {})
  const { deleted, leftovers } = await cleanup.run()
  // Nachzählen: auch die Datei muss weg sein (404), nicht nur „gelöscht" heißen.
  for (const id of favicons) {
    if (await poolStorage.getFile({ bucketId: 'favicons', fileId: id }).then(() => true, error => error?.code !== 404)) leftovers.push(`favicon:${id}`)
  }
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Community, Mitglieds-Zeilen, Code, Zeilen der Community) + Favicon-Datei`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
