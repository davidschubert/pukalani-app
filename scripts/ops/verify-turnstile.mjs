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
 *
 * SEIT 2026-11-16 TÄGLICH IM PRODUKTIONS-WÄCHTER (OPS-012): dort darf ein
 * einzelner Aussetzer kein Alarm sein. Eine Antwort, die nichts ENTSCHEIDET
 * (Site nicht erreichbar, 503 von Cloudflare, etwas Unerwartetes — etwa
 * während eines Auslieferns), bekommt nach 20 Sekunden genau einen zweiten
 * Versuch. „Aus" und „halb konfiguriert" sind eindeutig und werden sofort
 * gemeldet. `PUKALANI_FINDINGS_FILE`: bekommt je rotem Befund eine Zeile mit
 * dem, was zu tun ist (der Alarm-Job schreibt sie ins Issue).
 */
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Eine Site je pm2-Prozess — Hosts derselben App teilen die Env. */
const SITES = [
  { host: 'account.pukalani.app', site: 'platform', note: 'Pool-App (Kundenbereich; demo + alle Mandanten-Hosts teilen die Env)' },
  { host: 'admin.pukalani.app', site: 'control', note: 'Betreiber-Konsole (ploi-Site admin.pukalani.app)' },
  { host: 'pukalani.studio', site: 'portfolio', note: 'Studio-Site' },
  { host: 'branding.supply', site: 'branding', note: 'Brand-Wizard' },
]

const PROBE_EMAIL = 'turnstile-probe@example.com'
const TIMEOUT_MS = 15_000

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

const RETRY_AFTER_MS = 20_000

/**
 * Deutet die zwei Antworten einer Site. `conclusive: false` heißt: diese
 * Antwort sagt nichts über die Konfiguration — noch einmal fragen.
 * @returns {{ ok: boolean, conclusive: boolean, line: string, failure?: string }}
 */
export function classifyTurnstile({ host, site, note }, server, widget) {
  const pad = `${site.padEnd(10)} ${host.padEnd(22)}`
  if (!server || !widget) {
    return { ok: false, conclusive: false, line: `✗ ${site.padEnd(10)} ${host} nicht erreichbar`, failure: `${site}: ${host} nicht erreichbar` }
  }
  const armed = server.status === 403 && server.reason === 'bot_check_required'
  const unavailable = server.status === 503 && server.reason === 'bot_check_unavailable'
  const off = server.status === 200 && server.ok === true

  if (armed && widget.widget) {
    return { ok: true, conclusive: true, line: `✔ ${pad} 403 bot_check_required · Widget im HTML — ${note}` }
  }
  if (armed && !widget.widget) {
    // Eine Seite, die gerade nicht 200 antwortet, trägt auch kein Widget — das entscheidet nichts.
    return {
      ok: false,
      conclusive: widget.status === 200,
      line: `✗ ${pad} 403, aber kein Widget — Site-Key fehlt`,
      failure: `${site}: Server prüft (403), aber /forgot-password trägt KEIN Widget (${widget.status}) — NUXT_PUBLIC_TURNSTILE_SITE_KEY fehlt oder pm2 nicht neu geladen. Gäste sind ausgesperrt.`,
    }
  }
  if (off) {
    const half = widget.widget ? ' (Widget da, Secret fehlt — Hürde nur zum Anschauen)' : ''
    return { ok: false, conclusive: true, line: `✗ ${pad} AUS — 200 ohne Token${half}`, failure: `${site}: Turnstile AUS — POST /api/auth/recovery antwortet 200 ohne Token${half}` }
  }
  if (unavailable) {
    return { ok: false, conclusive: false, line: `✗ ${pad} 503 bot_check_unavailable`, failure: `${site}: Cloudflare siteverify nicht erreichbar (503 bot_check_unavailable, fail-closed) — Log der Site: auth.turnstile_unavailable` }
  }
  return { ok: false, conclusive: false, line: `✗ ${pad} unerwartet: ${server.status} ${server.reason ?? ''}`, failure: `${site}: unerwartete Antwort ${server.status} (reason ${server.reason ?? '—'}), Seite ${widget.status}` }
}

async function inspect(entry) {
  try {
    const [server, widget] = await Promise.all([probeServer(entry.host), probeWidget(entry.host)])
    return classifyTurnstile(entry, server, widget)
  }
  catch {
    return classifyTurnstile(entry, null, null)
  }
}

async function main() {
  const only = process.argv[2]
  const sites = only ? SITES.filter(s => s.host === only || s.site === only) : SITES
  if (sites.length === 0) {
    console.error(`Keine Site "${only}". Bekannt: ${SITES.map(s => `${s.site} (${s.host})`).join(', ')}`)
    process.exit(2)
  }

  const failures = []
  for (const entry of sites) {
    let result = await inspect(entry)
    if (!result.ok && !result.conclusive) {
      console.log(`… ${entry.site.padEnd(10)} ${entry.host} — keine eindeutige Antwort, zweiter Versuch in ${RETRY_AFTER_MS / 1000} s`)
      await new Promise(done => setTimeout(done, RETRY_AFTER_MS))
      result = await inspect(entry)
    }
    console.log(result.line)
    if (!result.ok) failures.push(result.failure)
  }

  if (failures.length) {
    console.error(`\n✗ ${failures.length} Site(s) ohne scharfen Bot-Beweis:`)
    for (const f of failures) console.error(`  · ${f}`)
    console.error('\nRezept: docs/runbooks/DEPLOYMENT.md, Abschnitt Turnstile — beide Variablen in')
    console.error('die Site-.env (ploi → Site → Environment), dann pm2 mit --update-env neu laden;')
    console.error('ein Deploy ohne App-Änderung lädt NICHT neu. Startwarnung bei halber')
    console.error('Konfiguration: auth.turnstile_misconfigured_at_boot im pm2-Log der Site.')
    if (process.env.PUKALANI_FINDINGS_FILE) {
      for (const f of failures) {
        appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `Bot-Prüfung: ${f.slice(0, 300)} Zu tun: beide Turnstile-Variablen in der Server-Datei der Site prüfen und den Prozess neu laden (Runbook DEPLOYMENT.md, Abschnitt Turnstile).\n`)
      }
    }
    process.exit(1)
  }
  console.log('\n✔ Turnstile ist auf allen Sites scharf (Server prüft, Widget wird ausgeliefert).')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
