/**
 * Beweis: serverseitig erzeugte Appwrite-Sessions tragen die CLIENT-IP
 * (x-forwarded-for aus forwardClientContext), nicht die Server-IP.
 *
 * 1. Signup MIT X-Forwarded-For: 8.8.8.8  → Session.ip = 8.8.8.8, Land USA
 * 2. Gegenprobe: Login OHNE Header        → Session.ip = Loopback, Land leer
 *
 * ── TEIL 3 (2026-08-22): STADT + REGION AUS DER LOKALEN MMDB ───────────────
 * Nur wenn `GEO_MMDB` auf eine DB-IP-City-Lite-Datei zeigt UND der Dev-Server
 * mit demselben Pfad in `NUXT_GEO_CITY_DB_PATH` läuft:
 *
 *   GEO_MMDB=~/Developer/geodb/dbip-city-lite.mmdb \
 *   NUXT_GEO_CITY_DB_PATH=$GEO_MMDB pnpm --filter platform exec nuxi dev …
 *
 * Geprüft wird UNSERE KETTE, nicht die Qualität der Vendor-Daten: der
 * Erwartungswert kommt aus einem ZWEITEN, unabhängigen Zugriff auf dieselbe
 * Datei (direkter `mmdb-lib`-Read hier im Skript) — nie aus der Antwort, die
 * geprüft wird. Ohne Cookie `i18n_redirected` ist die Request-Sprache
 * Englisch, also muss `names.en` herauskommen.
 *
 * Seit 2026-08-23 reisen auch die KOORDINATEN durch dieselbe Kette (Karte im
 * Sitzungs-Dialog) — geprüft wird beides gleich: vorhanden UND deckungsgleich
 * mit dem Direkt-Read.
 *
 * Gegenprobe bleibt die Loopback-Session: private IP ⇒ city und region leer,
 * latitude und longitude `null`.
 * Ohne `GEO_MMDB` werden diese Prüfungen übersprungen (mit Meldung), damit der
 * Beweis auf einer Maschine ohne die 124-MB-Datei weiter läuft.
 *
 * node:http über ::1 (Nitro hört auf [::1], Vite-HMR auf 0.0.0.0 — 127.0.0.1
 * liefert 426), Host-Header app.localhost (Kontroll-Host der Dev-Config).
 *
 * VORAUSSETZUNG neben Dev-Server (platform, PLATFORM_PORT) + lokaler Appwrite:
 * der Appwrite-TRAEFIK muss dem XFF des Aufrufers vertrauen
 * (docker-compose.override.yml: forwardedHeaders.trustedIPs, seit 2026-08-22).
 * Ohne das ersetzt Traefik den Header durch die Peer-IP und die zwei
 * 8.8.8.8-Prüfungen fallen — das ist dann die Testumgebung, nicht der Code.
 */
import { request } from 'node:http'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const HOST = 'app.localhost'
let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

function call(method, path, { headers = {}, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1', port: PORT, path, method,
      headers: {
        host: HOST,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function sessionCookie(res) {
  const raw = res.headers['set-cookie'] || []
  const hit = raw.find(c => c.startsWith('a_session_'))
  return hit ? hit.split(';')[0] : null
}

const email = `session-ip-${Date.now()}@example.com`
const password = 'Beweis-Passwort-1234!'

console.log(`\nSession-IP-Beweis gegen ::1:${PORT} (Host ${HOST})\n`)

console.log('1. Signup MIT X-Forwarded-For: 8.8.8.8')
const signup = await call('POST', '/api/auth/signup', {
  headers: { 'x-forwarded-for': '8.8.8.8' },
  body: { name: 'Session IP Beweis', email, password },
})
check('Signup → 2xx', signup.status >= 200 && signup.status < 300, `Status ${signup.status}: ${signup.body.slice(0, 200)}`)
const cookie1 = sessionCookie(signup)
check('Session-Cookie gesetzt', Boolean(cookie1))

const list1 = await call('GET', '/api/auth/sessions', { cookie: cookie1 })
check('Sessions-Liste → 200', list1.status === 200, `Status ${list1.status}`)
const sessions1 = list1.status === 200 ? JSON.parse(list1.body).sessions : []
const current1 = sessions1.find(s => s.current)
check('aktuelle Session vorhanden', Boolean(current1))
check('Session.ip = 8.8.8.8 (weitergereichte Client-IP)', current1?.ip === '8.8.8.8', `ip=${current1?.ip}`)
check('Land aufgelöst (USA)', current1?.countryCode === 'us', `countryCode=${current1?.countryCode}, countryName=${current1?.countryName}`)
check('Gerät aus dem Browser-UA (nicht Node-SDK)', /chrome/i.test(current1?.clientName || ''), `clientName=${current1?.clientName}`)

console.log('\n2. Gegenprobe: Login OHNE X-Forwarded-For')
const login = await call('POST', '/api/auth/login', { body: { email, password } })
check('Login → 2xx', login.status >= 200 && login.status < 300, `Status ${login.status}: ${login.body.slice(0, 200)}`)
const cookie2 = sessionCookie(login)
const list2 = await call('GET', '/api/auth/sessions', { cookie: cookie2 })
const sessions2 = list2.status === 200 ? JSON.parse(list2.body).sessions : []
const current2 = sessions2.find(s => s.current)
check('aktuelle Session vorhanden', Boolean(current2))
check('Session.ip = Loopback (NICHT 8.8.8.8 — Wert kam wirklich aus dem Header)',
  Boolean(current2) && current2.ip !== '8.8.8.8', `ip=${current2?.ip}`)
check('Land leer (private IP nicht auflösbar)', (current2?.countryName ?? '') === '', `countryName=${current2?.countryName}`)

console.log('\n3. Stadt + Region aus der lokalen MMDB')
const geoDbPath = (process.env.GEO_MMDB || '').replace(/^~(?=\/)/, homedir())
if (!geoDbPath) {
  console.log('  — übersprungen: GEO_MMDB nicht gesetzt (Pfad zur dbip-city-lite.mmdb).')
  console.log('    Der Dev-Server braucht denselben Pfad in NUXT_GEO_CITY_DB_PATH.')
}
else {
  // UNABHÄNGIGER Pfad: eigener Leser, eigene Datei-Öffnung. Der Erwartungswert
  // darf NIE aus der Antwort stammen, die geprüft wird — sonst ist die Prüfung
  // eine Tautologie und immer grün.
  const { Reader } = await import('mmdb-lib')
  const reader = new Reader(readFileSync(geoDbPath))
  /** Was die Datei selbst sagt — englische Namen, weil das Skript kein
   *  i18n_redirected-Cookie schickt und die Route dann auf 'en' fällt. */
  const expected = (ip) => {
    const hit = reader.get(ip)
    return {
      city: hit?.city?.names?.en ?? '',
      region: hit?.subdivisions?.[0]?.names?.en ?? '',
      // Koordinaten reisen seit 2026-08-23 mit (Karte im Sitzungs-Dialog) und
      // sind Zahlen, nicht Strings — `null` heißt „unbekannt".
      latitude: typeof hit?.location?.latitude === 'number' ? hit.location.latitude : null,
      longitude: typeof hit?.location?.longitude === 'number' ? hit.location.longitude : null,
    }
  }

  const wantGoogle = expected('8.8.8.8')
  check('Direkt-Read 8.8.8.8 liefert überhaupt eine Stadt (sonst taugt die Datei nicht als Maßstab)',
    Boolean(wantGoogle.city), `city=${wantGoogle.city}`)
  check('Route: city der 8.8.8.8-Session = Direkt-Read', current1?.city === wantGoogle.city,
    `route=${current1?.city}, datei=${wantGoogle.city}`)
  check('Route: region der 8.8.8.8-Session = Direkt-Read', current1?.region === wantGoogle.region,
    `route=${current1?.region}, datei=${wantGoogle.region}`)

  // Zweite Adresse, damit nicht ein einzelner Zufallstreffer den Beweis trägt.
  // 9.9.9.9 (öffentlicher DNS-Resolver) hat in der City-Lite belastbare
  // Stadt-Daten und liegt in einer anderen Stadt als 8.8.8.8; der Direkt-Read
  // prüft das trotzdem, statt es zu behaupten. Bewusst eine Adresse öffentlicher
  // Infrastruktur — nie die eines Menschen (`pnpm check:public-ips`).
  const secondIp = '9.9.9.9'
  const wantSecond = expected(secondIp)
  check(`Direkt-Read ${secondIp} liefert eine Stadt`, Boolean(wantSecond.city), `city=${wantSecond.city}`)

  const login3 = await call('POST', '/api/auth/login', {
    headers: { 'x-forwarded-for': secondIp },
    body: { email, password },
  })
  const cookie3 = sessionCookie(login3)
  const list3 = await call('GET', '/api/auth/sessions', { cookie: cookie3 })
  const sessions3 = list3.status === 200 ? JSON.parse(list3.body).sessions : []
  const current3 = sessions3.find(s => s.current)
  check(`Session mit ${secondIp} vorhanden`, current3?.ip === secondIp, `ip=${current3?.ip}`)
  check(`Route: city = Direkt-Read (${wantSecond.city})`, current3?.city === wantSecond.city,
    `route=${current3?.city}, datei=${wantSecond.city}`)
  check(`Route: region = Direkt-Read (${wantSecond.region})`, current3?.region === wantSecond.region,
    `route=${current3?.region}, datei=${wantSecond.region}`)

  // Koordinaten: erst überhaupt vorhanden (sonst hat die Kette sie verloren),
  // dann deckungsgleich mit dem unabhängigen Direkt-Read. `typeof` gehört
  // dazu — ein durchgereichter String sähe im Vergleich mit `===` rot aus,
  // aber ein `null` gegen `null` wäre sonst still grün.
  check(`Direkt-Read ${secondIp} liefert Koordinaten`,
    typeof wantSecond.latitude === 'number' && typeof wantSecond.longitude === 'number',
    `lat=${wantSecond.latitude}, lon=${wantSecond.longitude}`)
  check('Route: Session trägt latitude/longitude als Zahlen',
    typeof current3?.latitude === 'number' && typeof current3?.longitude === 'number',
    `lat=${current3?.latitude} (${typeof current3?.latitude}), lon=${current3?.longitude} (${typeof current3?.longitude})`)
  check(`Route: latitude = Direkt-Read (${wantSecond.latitude})`, current3?.latitude === wantSecond.latitude,
    `route=${current3?.latitude}, datei=${wantSecond.latitude}`)
  check(`Route: longitude = Direkt-Read (${wantSecond.longitude})`, current3?.longitude === wantSecond.longitude,
    `route=${current3?.longitude}, datei=${wantSecond.longitude}`)

  // Gegenprobe: die Loopback-Session darf KEINE Ortsangabe tragen. Ohne sie
  // wäre nicht auszuschließen, dass die Route irgendetwas zurückgibt.
  check('Gegenprobe Loopback: city leer', (current2?.city ?? '') === '', `city=${current2?.city}`)
  check('Gegenprobe Loopback: region leer', (current2?.region ?? '') === '', `region=${current2?.region}`)
  check('Gegenprobe Loopback: latitude null', current2?.latitude === null, `latitude=${current2?.latitude}`)
  check('Gegenprobe Loopback: longitude null', current2?.longitude === null, `longitude=${current2?.longitude}`)
}

console.log(`\n${pass} ✔ / ${fail} ✗\n`)
process.exit(fail ? 1 : 0)
