#!/usr/bin/env node
/**
 * TURNSTILE-WÄCHTER: ist der Bot-Beweis an den Mail-Routen auf JEDER Site
 * wirklich scharf? (TS1, Vorfall „Resend-Spam über die Registrierung" 2026-10-27)
 *
 *   node scripts/ops/verify-turnstile.mjs                 # alle Sites
 *   node scripts/ops/verify-turnstile.mjs branding.supply # eine Site
 *   pnpm ops:turnstile
 *
 * WARUM ES DAS GIBT: Der Schalter SIND die zwei Env-Variablen
 * (NUXT_TURNSTILE_SECRET + NUXT_PUBLIC_TURNSTILE_SITE_KEY, shared/turnstile.ts).
 * Fehlen sie, läuft alles wie vor dem Vorfall — die Seiten antworten, die
 * Formulare gehen, nur die Hürde ist nicht da. Das sieht von außen aus wie
 * „alles gut" (dieselbe blinde Stelle wie F44: eine fehlende Variable wird
 * nicht rot). Und pm2 liest die Site-`.env` NUR beim `startOrReload
 * --update-env`: Variablen im ploi-Panel eintragen reicht nicht, bis jemand
 * neu lädt. Dieses Skript fragt deshalb die Sites selbst, nicht die Dateien.
 *
 * ZWEI BEWEISE JE SITE, beide ohne Browser und ohne Nebenwirkung:
 *   1. Server: `POST /api/auth/recovery` OHNE Token muss 403 mit
 *      `reason: bot_check_required` antworten. Die Route prüft den Token VOR
 *      `createRecovery`; ist Turnstile AUS, antwortet sie `{ ok: true }` —
 *      für eine UNBEKANNTE Adresse ohne Mail und ohne Konto (Appwrite findet
 *      niemanden, die Route schluckt das bewusst: keine Enumeration). Darum
 *      recovery und nicht signup: signup würde im AUS-Fall ein Konto anlegen
 *      und eine Mail auslösen. Ein Aufruf je Site liegt weit unter dem
 *      Stundenfenster der Mail-Routen (20 je IP).
 *   2. Client: `GET /forgot-password` muss das Widget tragen (`data-turnstile`
 *      im SSR-HTML — die Komponente rendert ohne Site-Key NICHTS). Das beweist,
 *      dass der ÖFFENTLICHE Schlüssel die App erreicht hat; ohne ihn sperrt
 *      ein Secret allein jeden Gast aus (server/utils/turnstile.ts).
 *
 * Exit 0 = überall scharf · Exit 1 = mindestens eine Site ohne Hürde oder
 * halb konfiguriert. 503 `bot_check_unavailable` heißt: Cloudflare ist von
 * dieser Site aus gerade nicht erreichbar (fail-closed, kein Konfigurations-
 * fehler) — wird gemeldet, zählt aber als Befund, bis es wieder geht.
 */

/** Eine Site je pm2-Prozess — Hosts derselben App teilen die Env. */
const SITES = [
  { host: 'account.pukalani.app', site: 'platform', note: 'Pool-App (Kundenbereich; demo + alle Mandanten-Hosts teilen die Env)' },
  { host: 'admin.pukalani.app', site: 'control', note: 'Betreiber-Konsole (ploi-Site admin.pukalani.app)' },
  { host: 'pukalani.studio', site: 'portfolio', note: 'Studio-Site' },
  { host: 'branding.supply', site: 'branding', note: 'Brand-Wizard' },
]

const PROBE_EMAIL = 'turnstile-probe@example.com'
const TIMEOUT_MS = 15_000

const only = process.argv[2]
const sites = only ? SITES.filter(s => s.host === only || s.site === only) : SITES
if (sites.length === 0) {
  console.error(`Keine Site "${only}". Bekannt: ${SITES.map(s => `${s.site} (${s.host})`).join(', ')}`)
  process.exit(2)
}

async function probeServer(host) {
  const res = await fetch(`https://${host}/api/auth/recovery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'pukalani-verify-turnstile' },
    body: JSON.stringify({ email: PROBE_EMAIL }),
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {
    // kein JSON — unten als Befund mit Status
  }
  return { status: res.status, reason: json?.reason ?? null, ok: json?.ok ?? null }
}

async function probeWidget(host) {
  const res = await fetch(`https://${host}/forgot-password`, {
    headers: { 'user-agent': 'pukalani-verify-turnstile', 'accept': 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const html = await res.text()
  return { status: res.status, widget: html.includes('data-turnstile') }
}

const failures = []
for (const { host, site, note } of sites) {
  let server
  let widget
  try {
    [server, widget] = await Promise.all([probeServer(host), probeWidget(host)])
  }
  catch (error) {
    failures.push(`${site}: ${host} nicht erreichbar — ${(error && error.message) || error}`)
    console.log(`✗ ${site.padEnd(10)} ${host} nicht erreichbar`)
    continue
  }

  const armed = server.status === 403 && server.reason === 'bot_check_required'
  const unavailable = server.status === 503 && server.reason === 'bot_check_unavailable'
  const off = server.status === 200 && server.ok === true

  if (armed && widget.widget) {
    console.log(`✔ ${site.padEnd(10)} ${host.padEnd(22)} 403 bot_check_required · Widget im HTML — ${note}`)
    continue
  }
  if (armed && !widget.widget) {
    failures.push(`${site}: Server prüft (403), aber /forgot-password trägt KEIN Widget (${widget.status}) — NUXT_PUBLIC_TURNSTILE_SITE_KEY fehlt oder pm2 nicht neu geladen; so ist JEDER Gast ausgesperrt`)
    console.log(`✗ ${site.padEnd(10)} ${host.padEnd(22)} 403, aber kein Widget — Site-Key fehlt`)
    continue
  }
  if (off) {
    const half = widget.widget ? ' (Widget da, Secret fehlt — Hürde nur zum Anschauen)' : ''
    failures.push(`${site}: Turnstile AUS — POST /api/auth/recovery antwortet 200 ohne Token${half}`)
    console.log(`✗ ${site.padEnd(10)} ${host.padEnd(22)} AUS — 200 ohne Token${half}`)
    continue
  }
  if (unavailable) {
    failures.push(`${site}: Cloudflare siteverify nicht erreichbar (503 bot_check_unavailable, fail-closed) — Log der Site: auth.turnstile_unavailable`)
    console.log(`✗ ${site.padEnd(10)} ${host.padEnd(22)} 503 bot_check_unavailable`)
    continue
  }
  failures.push(`${site}: unerwartete Antwort ${server.status} (reason ${server.reason ?? '—'}), Seite ${widget.status}`)
  console.log(`✗ ${site.padEnd(10)} ${host.padEnd(22)} unerwartet: ${server.status} ${server.reason ?? ''}`)
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} Site(s) ohne scharfen Bot-Beweis:`)
  for (const f of failures) console.error(`  · ${f}`)
  console.error('\nRezept: docs/runbooks/DEPLOYMENT.md, Abschnitt Turnstile — beide Variablen in')
  console.error('die Site-.env (ploi → Site → Environment), dann pm2 mit --update-env neu laden;')
  console.error('ein Deploy ohne App-Änderung lädt NICHT neu. Startwarnung bei halber')
  console.error('Konfiguration: auth.turnstile_misconfigured_at_boot im pm2-Log der Site.')
  process.exit(1)
}
console.log('\n✔ Turnstile ist auf allen Sites scharf (Server prüft, Widget wird ausgeliefert).')
