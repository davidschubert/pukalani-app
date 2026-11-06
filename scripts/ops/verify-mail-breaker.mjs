#!/usr/bin/env node
/**
 * Mail-Wächter: drei Blicke auf dieselbe Frage — „verschickt unsere
 * Produktion gerade Mails, die kein Mensch ausgelöst hat?"
 *
 *   node scripts/ops/verify-mail-breaker.mjs --ssh            # Blick 1 (Server-Log)
 *   node scripts/ops/verify-mail-breaker.mjs --ssh --strict   # CI: Fund = rot
 *   RESEND_API_KEY=… node scripts/ops/verify-mail-breaker.mjs --resend   # Blick 2 + 3
 *   RESEND_API_KEY=… node scripts/ops/verify-mail-breaker.mjs --resend --bounce-alarm 0   # Probealarm
 *
 * WARUM ES DAS GIBT (Vorfall 2026-10-25/27): ein Angreifer missbrauchte
 * `POST /api/auth/signup` als Mail-Relais (Name = Spamtext, E-Mail = Opfer);
 * Appwrite verschickte 209 Verifizierungs-Mails über Resend. Bemerkt wurde es
 * NUR, weil Resend das Tageslimit (100/Tag) per Mail an David meldete — kein
 * Wächter von uns hat etwas gesehen. Seitdem gibt es die Notbremse je
 * Mail-Route (60/Stunde über alle IPs, `core/server/middleware/05.rate-limit.ts`):
 * greift sie, schreibt die App EINE Zeile `auth.mail_route_breaker` ins Log —
 * und ein Log, das niemand liest, ist genau die stille Lücke dieser Datei.
 *
 * BLICK 1 — NOTBREMSE AUSGELÖST? (`--ssh`): liest auf dem App-Server die
 * pm2-Fehlerlogs (die App loggt `warn` nach stderr) und zählt die
 * Notbremsen-Zeilen der letzten 25 Stunden (eine Stunde Überlappung zum
 * täglichen Takt). Über ssh läuft nur `grep` auf die EVENT-Zeile; zurück
 * kommen Zeitpunkt und Route, nie ein Request-Inhalt — die Zeile selbst
 * enthält bewusst keinen (logEvent, PII-Regel).
 *
 * BLICK 2 — WIE VIELE MAILS GINGEN WIRKLICH RAUS? (`--resend`): die Notbremse
 * sieht nur, was ÜBER unsere Routen läuft, und erst ab 61 je Stunde — ein
 * Angreifer mit 50 je Stunde bleibt darunter und erschöpft Resends Tageslimit
 * trotzdem in zwei Stunden. Und Appwrites eigene Mails (Verifizierung,
 * Recovery) laufen an unserem Log komplett vorbei. Deshalb zählt dieser Blick
 * bei Resend selbst und wird rot ab 80 % der TAGESGRENZE des Tarifs — VOR
 * Resends eigener Limit-Mail und oberhalb jedes normalen Tages (Stand
 * 2026-10: 234 Mails in 15 Tagen). Die Grenze kommt seit RS1 c (2026-11-06)
 * aus der Antwort statt fest 100: ein Tarifwechsel zieht die Schwelle mit.
 * Ohne `RESEND_API_KEY` wird der Blick übersprungen und ist GRÜN — er zählt
 * dann nicht als Befund, weil das Fehlen eines Schlüssels kein Vorfall ist;
 * dass er läuft, beweist nur das CI-Log („Resend: n Mails in 24 h").
 *
 * ZWEI AUFRUFE STATT BLÄTTERN (RS1 c, gemessen 2026-11-06 gegen das echte
 * Konto, Schlüssel mit vollem Zugriff — beide Endpunkte brauchen ihn):
 *  · `GET /usage` ⇒ `{ object:'usage', emails: { daily: { used, limit, sent,
 *    received, resets_at }, monthly: { used, limit, sent, received,
 *    resets_at } }, contacts, segments, broadcasts, ai_credits,
 *    automation_runs, domains, rate_limit }`. ACHTUNG: `daily` ist der
 *    UTC-KALENDERTAG (`resets_at` = 23:59:59.999Z), kein gleitendes Fenster —
 *    um 04:17 UTC (der Takt in production-watch.yml) sähe `daily.used` nur
 *    vier Stunden. Von `/usage` nehmen wir deshalb die GRENZE (`daily.limit`,
 *    frei = 100; ein Tarif ohne Tagesgrenze gäbe vermutlich `null` wie heute
 *    bei `broadcasts` ⇒ Rückfall auf feste 80) und `daily.used` als zweite,
 *    frischere Zahl.
 *  · `GET /emails/metrics?start_date&end_date&metrics=sent,bounced,complained`
 *    ⇒ `{ object:'metrics', start_date, end_date, metrics, dimensions,
 *    granularity, totals: { sent, bounced, complained } }` — das Fenster ist
 *    FREI wählbar (ISO, echt so zurückgemeldet), also bleibt es gleitend
 *    24 h. Ohne `metrics=` kommen 22 Kennzahlen (u. a. `bounced_transient`/
 *    `_permanent`, `delivery_rate`); `period` gibt es NICHT (422). Gegenprobe
 *    gegen den Oktober-Vorfall (2026-10-24…28): `sent 236, bounced 2,
 *    complained 0` — dieselben Zahlen, die das Blättern über `/emails`
 *    damals lieferte (234 zugestellt + 2 Bounces).
 * Vorher waren es bis zu 20 Seiten `GET /emails` und eine feste Grenze.
 *
 * BLICK 3 — WAS WURDE AUS DEN MAILS? (läuft mit `--resend`, MZ1 2026-11-06,
 * Plan docs/archiv/MAIL-ZUSTELLBARKEIT.md): `bounced` und `complained` aus
 * denselben Metriken, im selben Fenster. Das ist das, woran ein Mail-Anbieter
 * den ABSENDER misst — steigt die Quote, drosselt oder sperrt Resend uns, und
 * dann kommt auch keine Verifizierungs-Mail mehr an. KEIN Missbrauchs-Melder:
 * im Fenster des Oktober-Vorfalls standen bei 236 Mails nur 2 Bounces und 0
 * Beschwerden — die Opfer-Adressen waren echt und nahmen an. Missbrauch sieht
 * Blick 2 (Menge) und Blick 1. Resend sperrt abgeprallte Adressen selbst
 * (Suppression List, teamweit) — wir bauen keine eigene Sperrliste, wir
 * wollen es nur SEHEN. Schwellen (Davids Entscheidung 2026-11-06): rot ab
 * 3 Bounces ODER 1 Beschwerde in 24 h. Die Metriken kennen keine Empfänger;
 * NUR wenn es etwas zu zeigen gibt, liest der Wächter eine Seite `GET /emails`
 * (`last_event`) für die Empfänger-DOMAINS. `to` kann „Name <adresse>"
 * enthalten (beim Vorfall stand dort der Spamtext) — ins Log kommt nur die
 * Domain, nie Adresse oder Name: das Repo ist öffentlich.
 *
 * Exit 0 = ruhig · Exit 1 (nur mit --strict) = Notbremse gegriffen ODER
 * Resend-Zähler bzw. Bounce-/Beschwerde-Zähler über der Schwelle · Exit 2 = ssh/Netz kaputt (bleibt in der
 * CI absichtlich KEIN Alarm-Grund — s. Kopf von production-watch.yml).
 */
import { spawnSync } from 'node:child_process'

const STRIKT = process.argv.includes('--strict')
const SERVER = process.env.PUKALANI_OPS_SSH || 'ploi@49.13.211.173'
/** Fenster für Blick 1 — der tägliche Takt plus eine Stunde Überlappung. */
const HOURS = Number(arg('--hours')) || 25
/** Event-Name, nach dem im Log gesucht wird. Überschreibbar NUR für den
 *  Probelauf (`--pattern community.seo_read_failed --hours 999`), damit der
 *  rote Pfad ohne echten Angriff beweisbar ist. */
const PATTERN = arg('--pattern') || 'auth.mail_route_breaker'
/** Blick 2: ab diesem ANTEIL der Tagesgrenze (aus `GET /usage`) ist es kein
 *  normaler Tag mehr — 80 % von 100 = 80, die Schwelle vor dem Umbau. Mit
 *  `--alarm N` eine feste Zahl statt des Anteils (Probelauf). */
const MAIL_DAY_ANTEIL = 0.8
const MAIL_DAY_ALARM_FEST = zahl(arg('--alarm'))
/** Blick 3: ab so vielen Bounces / Beschwerden in 24 h ⇒ rot. `0` ist
 *  erlaubt (Probealarm: jeder Lauf rot) — deshalb `??` statt `||`. */
const BOUNCE_ALARM = zahl(arg('--bounce-alarm')) ?? 3
const COMPLAINT_ALARM = zahl(arg('--complaint-alarm')) ?? 1
/** Fenster für Blick 2 + 3. Überschreibbar NUR für den Beweis gegen einen
 *  vergangenen Vorfall (`--resend-hours 400`); die Schwelle von Blick 2 ist
 *  auf 24 h geeicht und wird bei einem längeren Fenster nicht umgerechnet. */
const RESEND_HOURS = zahl(arg('--resend-hours')) || 24

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : undefined
}

/** Nicht-negative Ganzzahl oder `undefined` (fehlend/kaputt ⇒ Default). */
function zahl(wert) {
  const n = Number(wert)
  return wert !== undefined && wert !== null && Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Nur die Domain des ersten Empfängers — `to` kann „Name <adresse>" sein. */
function empfaengerDomain(mail) {
  const roh = Array.isArray(mail?.to) ? String(mail.to[0] ?? '') : String(mail?.to ?? '')
  const treffer = /@([^\s<>@]+)/.exec(roh)
  return treffer ? treffer[1].toLowerCase() : '?'
}

/** Ein GET gegen die Resend-API. Netz- oder HTTP-Fehler ⇒ Exit 2 (kaputter
 *  Weg, kein Befund — s. Kopf). */
async function resendGet(key, url) {
  let r
  try {
    r = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) })
  }
  catch (fehler) {
    console.error(`Resend nicht erreichbar — ${fehler?.message || fehler}`)
    process.exit(2)
  }
  if (!r.ok) {
    console.error(`Resend antwortet HTTP ${r.status} auf ${url.pathname} — Schlüssel ohne vollen Zugriff oder widerrufen? (Klickliste im Runbook)`)
    process.exit(2)
  }
  return r.json()
}

/**
 * Blick 3, nur zur Diagnose: die Empfänger-DOMAINS der abgeprallten bzw. als
 * Spam gemeldeten Mails. `/emails/metrics` kennt keine Empfänger (Dimensionen
 * nur period/domain/email/broadcast — `domain` ist UNSERE Absender-Domain,
 * `email` hiesse Adressen), also EINE Seite `GET /emails` (die letzten 100).
 * Best effort: scheitert der Abruf, fehlen nur die Domains, die Farbe steht.
 */
async function auffaelligeDomains(key, seit) {
  const ergebnis = { bounced: [], complained: [] }
  try {
    const r = await fetch('https://api.resend.com/emails?limit=100', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return ergebnis
    const json = await r.json()
    for (const mail of Array.isArray(json?.data) ? json.data : []) {
      if (Date.parse(mail.created_at) < seit) break
      if (mail.last_event === 'bounced' || mail.last_event === 'complained') ergebnis[mail.last_event].push(empfaengerDomain(mail))
    }
  }
  catch {
    // Diagnose, kein Befund.
  }
  return ergebnis
}

let befund = false

// ── BLICK 1: Notbremse im Server-Log ─────────────────────────────────────
if (process.argv.includes('--ssh')) {
  const seit = new Date(Date.now() - HOURS * 3_600_000).toISOString()
  // ISO-Zeitstempel vergleichen sich als Zeichenketten korrekt; `-F` sucht
  // die Event-Zeile wörtlich. Dateien fehlen (frische Instanz) → leer, kein
  // Fehler. Die Zeile wird auf time/event/route gekürzt, mehr enthält sie
  // ohnehin nicht — aber so bleibt es auch bei einer künftigen Erweiterung
  // des Log-Events bei dieser Zusage.
  const fern = [
    `grep -h -F '"event":"${PATTERN}"' ~/.pm2/logs/*-error*.log 2>/dev/null`,
    `| awk -F'"time":"' -v seit='${seit}' '{ split($2, t, "\\""); if (t[1] >= seit) print }'`,
    `| sed -E 's/.*"time":"([^"]*)".*"event":"([^"]*)".*("route":"[^"]*")?.*/\\1 \\2 \\3/'`,
    `| sort | tail -200`,
  ].join(' ')
  const lauf = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SERVER, fern], { encoding: 'utf8' })
  if (lauf.error || (lauf.status !== 0 && lauf.status !== 1)) {
    // grep liefert 1 bei „nichts gefunden" — das ist der Normalfall. Alles
    // andere ist ein kaputter Weg, kein Befund.
    console.error(`ssh fehlgeschlagen — ${lauf.error?.message || `Exit ${lauf.status}`}\n${lauf.stderr || ''}`)
    process.exit(2)
  }
  const zeilen = lauf.stdout.split('\n').map(z => z.trim()).filter(Boolean)
  console.log(`Mail-Wächter, Blick 1 — Notbremse (${PATTERN}) in den letzten ${HOURS} h auf ${SERVER}\n`)
  if (zeilen.length) {
    befund = true
    console.log(`✗ ${zeilen.length} Mal ausgelöst:`)
    for (const z of zeilen.slice(-20)) console.log(`  · ${z}`)
    if (zeilen.length > 20) console.log(`  … und ${zeilen.length - 20} weitere`)
  }
  else {
    console.log('✔ Notbremse hat nicht gegriffen.')
  }
}

// ── BLICK 2 + 3: Resend zählt selbst ─────────────────────────────────────
if (process.argv.includes('--resend')) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log(`\nMail-Wächter, Blick 2 — Resend, Mails der letzten ${RESEND_HOURS} h\n`)
    console.log('… übersprungen: RESEND_API_KEY fehlt (Klickliste: docs/runbooks/PRODUKTIONS-ALARM.md).')
  }
  else {
    const bis = new Date()
    const von = new Date(bis.getTime() - RESEND_HOURS * 3_600_000)
    const metricsUrl = new URL('https://api.resend.com/emails/metrics')
    metricsUrl.searchParams.set('start_date', von.toISOString())
    metricsUrl.searchParams.set('end_date', bis.toISOString())
    metricsUrl.searchParams.set('metrics', 'sent,bounced,complained')
    const [usage, metrics] = await Promise.all([
      resendGet(key, new URL('https://api.resend.com/usage')),
      resendGet(key, metricsUrl),
    ])

    const tag = usage?.emails?.daily ?? {}
    const monat = usage?.emails?.monthly ?? {}
    const tagesGrenze = zahl(tag.limit)
    const alarm = MAIL_DAY_ALARM_FEST ?? (tagesGrenze ? Math.floor(tagesGrenze * MAIL_DAY_ANTEIL) : 80)
    const gesendet = zahl(metrics?.totals?.sent)
    const heute = zahl(tag.used)
    if (gesendet === undefined || heute === undefined) {
      // Eine Antwort ohne die gemessenen Felder ist ein kaputter Weg (Resend
      // hat das Format geändert), kein ruhiger Tag — sonst wäre der Wächter
      // ab diesem Tag still grün.
      console.error('Resend-Antwort ohne `totals.sent` bzw. `emails.daily.used` — Format geändert? Kopf dieser Datei.')
      process.exit(2)
    }

    console.log(`\nMail-Wächter, Blick 2 — Resend, Mails der letzten ${RESEND_HOURS} h (Alarm ab ${alarm}${tagesGrenze ? ` = ${Math.round(MAIL_DAY_ANTEIL * 100)} % der Tagesgrenze ${tagesGrenze}` : ', Tarif ohne Tagesgrenze'})\n`)
    const monatText = zahl(monat.used) !== undefined ? ` · Monat ${monat.used}/${monat.limit ?? '∞'}` : ''
    const heuteText = `heute (UTC) ${heute}/${tagesGrenze ?? '∞'}${monatText}`
    if (gesendet >= alarm || heute >= alarm) {
      befund = true
      console.log(`✗ Resend: ${gesendet} Mails in ${RESEND_HOURS} h, ${heuteText} — das ist kein normaler Tag.`)
    }
    else {
      console.log(`✔ Resend: ${gesendet} Mails in ${RESEND_HOURS} h, ${heuteText}.`)
    }

    // ── BLICK 3: Bounces und Spam-Beschwerden ──────────────────────────────
    const bounces = zahl(metrics?.totals?.bounced) ?? 0
    const beschwerden = zahl(metrics?.totals?.complained) ?? 0
    console.log(`\nMail-Wächter, Blick 3 — Bounces (Alarm ab ${BOUNCE_ALARM}) und Spam-Beschwerden (Alarm ab ${COMPLAINT_ALARM}) in ${RESEND_HOURS} h\n`)
    // Die Domains nur, wenn es etwas zu zeigen gibt — die Zahlen oben reichen
    // für die Farbe, die Domains sind Diagnose (s. Kopf, „BLICK 3").
    const domains = bounces + beschwerden > 0 ? await auffaelligeDomains(key, von.getTime()) : { bounced: [], complained: [] }
    for (const [name, anzahl, schwelle, liste] of [
      ['Bounces', bounces, BOUNCE_ALARM, domains.bounced],
      ['Spam-Beschwerden', beschwerden, COMPLAINT_ALARM, domains.complained],
    ]) {
      const text = liste.length ? ` (Domains: ${[...new Set(liste)].slice(0, 10).join(', ')})` : ''
      if (anzahl >= schwelle) {
        befund = true
        console.log(`✗ ${name}: ${anzahl}${text}`)
      }
      else {
        console.log(`✔ ${name}: ${anzahl}${text}`)
      }
    }
  }
}

if (!process.argv.includes('--ssh') && !process.argv.includes('--resend')) {
  console.error('Nichts zu tun — `--ssh` (Server-Log) und/oder `--resend` (Resend-Zähler) angeben.')
  process.exit(2)
}

if (befund) {
  console.error('\n✗ Verdacht auf Mail-Missbrauch. Diagnose-Rezept (Resend → To-Spalte, Appwrite-Tokens,')
  console.error('audit_logs mit echter IP) und Aufräumen (`scripts/ops/purge-spam-accounts.mjs`):')
  console.error('docs/runbooks/PRODUKTIONS-ALARM.md, Abschnitt „Wenn ein Alarm kommt".')
  process.exit(STRIKT ? 1 : 0)
}
console.log('\n✔ Mail-Versand unauffällig.')
