/**
 * Beweis: der Orts-Picker im Profil — Suche, Länder-Filter und der Standort
 * am KONTO (Mitglieder-Karte, Etappe 1).
 *
 * 1. Suche liefert Pukalani mit Label, Flaggen-Code und Koordinaten
 * 2. Einwohner-Ranking: „berl" ⇒ Berlin/DE, nicht Berlin/New Hampshire
 * 3. Diakritika: „zurich" findet Zürich
 * 4. Länder-Filter: „berlin" + country=us ⇒ Berlin in den USA
 * 5. Länderliste enthält 'us' und 'de'
 * 6. Ohne Sitzung: 401 (kein anonymer Suchindex)
 * 7. PUT /api/auth/profile mit location ⇒ die drei prefs stehen in /me
 * 8. location: null ⇒ die drei Schlüssel sind WEG (nicht '')
 *
 * ── WOHER DIE ERWARTUNGSWERTE KOMMEN ──────────────────────────────────────
 * Aus einem ZWEITEN, unabhängigen Zugriff auf dieselbe TSV (direkter Read hier
 * im Skript) — NIE aus der Antwort, die geprüft wird: eine Prüfung, die ihren
 * Maßstab aus dem Prüfling zieht, ist eine Tautologie und immer grün. Geprüft
 * wird UNSERE KETTE (Route, Ranking, prefs), nicht die Qualität der
 * GeoNames-Daten.
 *
 * ── WELCHE DATEI ───────────────────────────────────────────────────────────
 * Dieselbe, die der Server liest: `NUXT_GEO_CITIES_PATH` aus der Env-Datei der
 * App (der Läufer gibt dem Skript `apps/platform/.env` mit), `GEO_CITIES`
 * überschreibt. Auf der Bühne der CI ist das der kleine Auszug
 * `scripts/buehne/fixtures/geo-cities.tsv` (acht Orte, nach Einwohnern
 * sortiert; `scripts/ci/buehne-setup.mjs` trägt ihn ein) — das volle
 * GeoNames-Verzeichnis liegt nicht im Repo (BT1 a). Lokal nimmt der Server
 * das, was in der eigenen `.env` steht. Ohne Pfad werden 1–5 als
 * „übersprungen" gemeldet, nicht gezählt.
 *
 * ── DAS KONTO ─────────────────────────────────────────────────────────────
 * Ein Wegwerf-Konto `…@example.test` im Pool, direkt angelegt (bestätigt),
 * angemeldet über die echte Route auf dem Kontroll-Host; die Zustimmung über
 * die echte Route (sonst 403 `consent_required` beim Speichern). Im `finally`
 * räumt `createCleanup` Konto und alle Zeilen daran ab und ZÄHLT NACH.
 *
 * Auf der Bühne: `pnpm buehne run --only verify-geo-cities`. Von Hand:
 *   PLATFORM_PORT=3036 node --env-file=apps/platform/.env \
 *     packages/core/scripts/verify-geo-cities.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  appwriteRest,
  confirmProbeConsent,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  login,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3036)
/** Kontroll-Host der Platform-App (dort steht die Route in controlApiPrefixes). */
const HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/platform/.env aufrufen.')
  process.exit(1)
}

let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

const { call: rawCall } = createHttpCaller({ port: PORT })
/** Kurzform: immer gegen den Kontroll-Host. */
const call = (method, path, { body, cookie } = {}) => rawCall(HOST, path, { method, body, cookie })

const pool = appwriteRest({ endpoint, projectId, key: apiKey, script: 'verify-geo-cities' })
const migrationsKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY
const cleanup = createCleanup({
  pool,
  control: null,
  poolDatabaseId: databaseId,
  poolSchema: migrationsKey ? appwriteRest({ endpoint, projectId, key: migrationsKey, script: 'verify-geo-cities' }) : pool,
})

console.log(`\nOrts-Picker-Beweis gegen ::1:${PORT} (Host ${HOST})\n`)

try {
  console.log('0. Wegwerf-Konto anlegen und anmelden')
  const account = await createProbeAccount(pool, { tag: 'geo-cities', stamp: runStamp(), name: 'Geo Beweis' })
  cleanup.track('account', account.userId)
  const cookie = await login(rawCall, HOST, account)
  check('Session-Cookie gesetzt', Boolean(cookie))
  await confirmProbeConsent({ port: PORT, host: HOST, cookie })
  check('Zustimmung über die echte Route festgehalten', true)

  console.log('\n1.–5. Suche, Ranking, Diakritika, Länder-Filter, Länderliste')
  const tsvPath = (process.env.GEO_CITIES || process.env.NUXT_GEO_CITIES_PATH || '').replace(/^~(?=\/)/, homedir())
  if (!tsvPath) {
    console.log('  ○ übersprungen: kein Orts-Verzeichnis (NUXT_GEO_CITIES_PATH in der Env-Datei der App, oder GEO_CITIES) — 1–5 zählen nicht mit.')
  }
  else {
    /**
     * UNABHÄNGIGER Pfad: eigener Read, eigenes Parsen — bewusst NICHT über
     * shared/geoCities.ts. Ein Beweis, der die Funktion benutzt, die er prüft,
     * bestätigt nur sich selbst.
     */
    const rows = readFileSync(tsvPath, 'utf8').split('\n').filter(Boolean).map((line) => {
      const [name, ascii, region, cc, lat, lon] = line.split('\t')
      return { name, ascii, region, cc: (cc || '').toLowerCase(), lat: Number(lat), lon: Number(lon) }
    })
    const strip = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    /** Erster Datei-Treffer (= einwohnerstärkster), der mit dem Begriff beginnt. */
    const firstPrefix = (needle, cc = '') => rows.find(r =>
      (!cc || r.cc === cc) && (strip(r.name).startsWith(needle) || strip(r.ascii).startsWith(needle)))
    const label = r => (r.region ? `${r.name}, ${r.region}` : r.name)

    const search = async (q, country) => {
      const query = `q=${encodeURIComponent(q)}${country ? `&country=${country}` : ''}`
      const res = await call('GET', `/api/geo/cities?${query}`, { cookie })
      return { status: res.status, cities: res.json?.cities ?? [] }
    }

    // 1. Pukalani — Label, Ländercode, Koordinaten, alles gegen den Direkt-Read.
    const wantPukalani = firstPrefix('puka')
    check('Direkt-Read: „puka" findet in der Datei überhaupt einen Ort', Boolean(wantPukalani), `${wantPukalani?.name}`)
    check('Direkt-Read: es ist Pukalani, Hawaii', wantPukalani && label(wantPukalani) === 'Pukalani, Hawaii', `datei=${wantPukalani && label(wantPukalani)}`)
    const puka = await search('puka')
    check('Route → 200', puka.status === 200, `Status ${puka.status}`)
    check('Route: erster Treffer = Direkt-Read (Label)', puka.cities[0]?.label === (wantPukalani && label(wantPukalani)),
      `route=${puka.cities[0]?.label}, datei=${wantPukalani && label(wantPukalani)}`)
    check('Route: countryCode klein („us", für das Flaggen-Symbol)', puka.cities[0]?.countryCode === wantPukalani?.cc,
      `route=${puka.cities[0]?.countryCode}, datei=${wantPukalani?.cc}`)
    check('Route: lat/lon sind ZAHLEN', typeof puka.cities[0]?.lat === 'number' && typeof puka.cities[0]?.lon === 'number',
      `lat=${puka.cities[0]?.lat} (${typeof puka.cities[0]?.lat})`)
    check('Route: lat = Direkt-Read', puka.cities[0]?.lat === wantPukalani?.lat, `route=${puka.cities[0]?.lat}, datei=${wantPukalani?.lat}`)
    check('Route: lon = Direkt-Read', puka.cities[0]?.lon === wantPukalani?.lon, `route=${puka.cities[0]?.lon}, datei=${wantPukalani?.lon}`)
    check('Route: höchstens acht Vorschläge', puka.cities.length > 0 && puka.cities.length <= 8, `${puka.cities.length}`)

    // 2. Einwohner-Ranking.
    const wantBerlin = firstPrefix('berl')
    check('Direkt-Read: „berl" führt auf Berlin/DE (Datei ist nach Einwohnern sortiert)',
      wantBerlin?.cc === 'de', `datei=${wantBerlin && label(wantBerlin)} (${wantBerlin?.cc})`)
    const berl = await search('berl')
    check('Route: erster Treffer = Direkt-Read', berl.cities[0]?.label === (wantBerlin && label(wantBerlin)),
      `route=${berl.cities[0]?.label}, datei=${wantBerlin && label(wantBerlin)}`)
    check('Route: das ist Berlin in DE', berl.cities[0]?.countryCode === 'de', `cc=${berl.cities[0]?.countryCode}`)

    // 3. Diakritika — „zurich" muss „Zürich" finden.
    const wantZurich = firstPrefix('zurich')
    check('Direkt-Read: „zurich" findet einen Ort mit Umlaut', wantZurich?.name?.includes('ü') === true, `datei=${wantZurich?.name}`)
    const zurich = await search('zurich')
    check('Route: erster Treffer = Direkt-Read (Zürich)', zurich.cities[0]?.label === (wantZurich && label(wantZurich)),
      `route=${zurich.cities[0]?.label}, datei=${wantZurich && label(wantZurich)}`)

    // 4. Länder-Filter — dieselbe Eingabe, anderes Land.
    const wantBerlinUs = firstPrefix('berlin', 'us')
    check('Direkt-Read: es gibt ein Berlin in den USA', Boolean(wantBerlinUs), `datei=${wantBerlinUs && label(wantBerlinUs)}`)
    const berlinUs = await search('berlin', 'us')
    check('Route mit country=us: erster Treffer = Direkt-Read', berlinUs.cities[0]?.label === (wantBerlinUs && label(wantBerlinUs)),
      `route=${berlinUs.cities[0]?.label}, datei=${wantBerlinUs && label(wantBerlinUs)}`)
    check('Route mit country=us: JEDER Treffer liegt in den USA',
      berlinUs.cities.length > 0 && berlinUs.cities.every(c => c.countryCode === 'us'),
      `codes=${berlinUs.cities.map(c => c.countryCode).join(',')}`)
    check('Gegenprobe: der Filter ändert wirklich etwas (nicht dasselbe wie ohne)',
      berlinUs.cities[0]?.label !== (await search('berlin')).cities[0]?.label,
      `mit=${berlinUs.cities[0]?.label}`)

    // 5. Länderliste.
    const countriesRes = await call('GET', '/api/geo/countries', { cookie })
    const countries = countriesRes.json?.countries ?? []
    check('Länderliste → 200', countriesRes.status === 200, `Status ${countriesRes.status}`)
    check('Länderliste enthält „us" und „de"', countries.includes('us') && countries.includes('de'), `${countries.length} Codes`)
    check('Länderliste ist klein geschrieben und alphabetisch',
      countries.every(c => c === c.toLowerCase()) && [...countries].sort().join() === countries.join())
  }

  console.log('\n6. Gegenprobe: ohne Sitzung')
  const anonymous = await call('GET', '/api/geo/cities?q=puka')
  check('Suche ohne Cookie → 401', anonymous.status === 401, `Status ${anonymous.status}`)
  const anonymousCountries = await call('GET', '/api/geo/countries')
  check('Länderliste ohne Cookie → 401', anonymousCountries.status === 401, `Status ${anonymousCountries.status}`)

  console.log('\n7. Standort speichern')
  const saved = await call('PUT', '/api/auth/profile', {
    cookie,
    body: {
      name: 'Geo Beweis',
      location: { label: 'Pukalani, Hawaii', lat: 20.83667, lon: -156.33667 },
    },
  })
  check('PUT /api/auth/profile → 2xx', saved.status >= 200 && saved.status < 300, `Status ${saved.status}: ${saved.text.slice(0, 200)}`)
  const afterSave = (await call('GET', '/api/auth/me', { cookie })).json
  // `/api/auth/me` liefert den User-Datensatz SELBST, nicht `{ user }`.
  const prefsAfterSave = afterSave?.prefs ?? {}
  check('prefs.locationLabel steht in /me', prefsAfterSave.locationLabel === 'Pukalani, Hawaii', `${prefsAfterSave.locationLabel}`)
  check('prefs.locationLat ist eine Zahl', prefsAfterSave.locationLat === 20.83667, `${prefsAfterSave.locationLat} (${typeof prefsAfterSave.locationLat})`)
  check('prefs.locationLon ist eine Zahl', prefsAfterSave.locationLon === -156.33667, `${prefsAfterSave.locationLon} (${typeof prefsAfterSave.locationLon})`)

  console.log('\n8. Standort löschen')
  const cleared = await call('PUT', '/api/auth/profile', { cookie, body: { name: 'Geo Beweis', location: null } })
  check('PUT mit location: null → 2xx', cleared.status >= 200 && cleared.status < 300, `Status ${cleared.status}: ${cleared.text.slice(0, 200)}`)
  const afterClear = (await call('GET', '/api/auth/me', { cookie })).json
  const prefsAfterClear = afterClear?.prefs ?? {}
  // WEG heißt weg — nicht '' und nicht 0: „nicht angegeben" ist die ABWESENHEIT
  // des Schlüssels, danach fragt readProfileLocation.
  check('locationLabel ist WEG (nicht leer)', !('locationLabel' in prefsAfterClear), `${JSON.stringify(prefsAfterClear.locationLabel)}`)
  check('locationLat ist WEG', !('locationLat' in prefsAfterClear), `${JSON.stringify(prefsAfterClear.locationLat)}`)
  check('locationLon ist WEG', !('locationLon' in prefsAfterClear), `${JSON.stringify(prefsAfterClear.locationLon)}`)
  // Gegenprobe: das Löschen darf nicht die ÜBRIGEN prefs mitnehmen.
  check('Gegenprobe: bio hat das Löschen überlebt (prefs-Spread hält)', 'bio' in prefsAfterClear, `${JSON.stringify(Object.keys(prefsAfterClear))}`)
}
catch (error) {
  fail++
  console.log(`  ✗ Lauf abgebrochen — ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\nAufräumen')
  try {
    const { deleted, leftovers } = await cleanup.run()
    console.log(`  gelöscht: ${JSON.stringify(deleted)}`)
    check('nichts übrig (nachgezählt)', leftovers.length === 0, leftovers.join(', '))
  }
  catch (error) {
    check('Aufräumen ohne Fehler', false, error instanceof Error ? error.message : String(error))
  }
}

console.log(`\n${pass} ✔ / ${fail} ✗\n`)
process.exit(fail ? 1 : 0)
