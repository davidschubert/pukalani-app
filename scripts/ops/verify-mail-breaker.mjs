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
 * bei Resend selbst (`GET /emails`, seitenweise bis vor das Fenster) und wird
 * rot, wenn in 24 Stunden mehr als MAIL_DAY_ALARM Mails gingen — unterhalb des
 * Limits (100/Tag), damit der Alarm VOR Resends eigener Mail kommt, und
 * oberhalb jedes normalen Tages (Stand 2026-10: 234 Mails in 15 Tagen).
 * Ohne `RESEND_API_KEY` wird der Blick übersprungen und ist GRÜN — er zählt
 * dann nicht als Befund, weil das Fehlen eines Schlüssels kein Vorfall ist;
 * dass er läuft, beweist nur das CI-Log („Resend: n Mails in 24 h").
 *
 * BLICK 3 — WAS WURDE AUS DEN MAILS? (läuft mit `--resend`, MZ1 2026-11-06,
 * Plan docs/plans/MAIL-ZUSTELLBARKEIT.md): dieselbe Liste trägt je Mail
 * `last_event`. Gezählt werden `bounced` und `complained` im selben
 * 24-h-Fenster. Das ist das, woran ein Mail-Anbieter den ABSENDER misst —
 * steigt die Quote, drosselt oder sperrt Resend uns, und dann kommt auch
 * keine Verifizierungs-Mail mehr an. KEIN Missbrauchs-Melder: gegen das
 * Fenster des Oktober-Vorfalls gemessen (`--resend-hours 400`) standen bei
 * 234 Mails nur 2 Bounces und 0 Beschwerden — die Opfer-Adressen waren
 * echt und nahmen an. Missbrauch sieht Blick 2 (Menge) und Blick 1.
 * Resend sperrt abgeprallte Adressen selbst
 * (Suppression List, teamweit) — wir bauen keine eigene Sperrliste, wir
 * wollen es nur SEHEN. Schwellen (Davids Entscheidung 2026-11-06): rot ab
 * 3 Bounces ODER 1 Beschwerde in 24 h. Gemessen am 2026-11-06: `last_event`
 * liefert wirklich `bounced`; `to` kann „Name <adresse>" enthalten (beim
 * Vorfall stand dort der Spamtext). Ins Log kommt deshalb nur die
 * Empfänger-DOMAIN, nie Adresse oder Name — das Repo ist öffentlich.
 * Ein Lauf ohne Bounces liest die Liste, die Blick 2 ohnehin holt: kein
 * zusätzlicher API-Aufruf.
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
/** Blick 2: ab so vielen Mails in 24 h ist es kein normaler Tag mehr. */
const MAIL_DAY_ALARM = Number(arg('--alarm')) || 80
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
  return wert !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Nur die Domain des ersten Empfängers — `to` kann „Name <adresse>" sein. */
function empfaengerDomain(mail) {
  const roh = Array.isArray(mail?.to) ? String(mail.to[0] ?? '') : String(mail?.to ?? '')
  const treffer = /@([^\s<>@]+)/.exec(roh)
  return treffer ? treffer[1].toLowerCase() : '?'
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

// ── BLICK 2: Resend zählt selbst ─────────────────────────────────────────
if (process.argv.includes('--resend')) {
  const key = process.env.RESEND_API_KEY
  console.log(`\nMail-Wächter, Blick 2 — Resend, Mails der letzten ${RESEND_HOURS} h (Alarm ab ${MAIL_DAY_ALARM})\n`)
  if (!key) {
    console.log('… übersprungen: RESEND_API_KEY fehlt (Klickliste: docs/runbooks/PRODUKTIONS-ALARM.md).')
  }
  else {
    const seit = Date.now() - RESEND_HOURS * 3_600_000
    let anzahl = 0
    /** Blick 3: Domains der abgeprallten bzw. als Spam gemeldeten Mails. */
    const bounces = []
    const beschwerden = []
    let after
    let fertig = false
    for (let seite = 0; seite < 20 && !fertig; seite++) {
      const url = new URL('https://api.resend.com/emails')
      url.searchParams.set('limit', '100')
      if (after) url.searchParams.set('after', after)
      let r
      try {
        r = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) })
      }
      catch (fehler) {
        console.error(`Resend nicht erreichbar — ${fehler?.message || fehler}`)
        process.exit(2)
      }
      if (!r.ok) {
        console.error(`Resend antwortet HTTP ${r.status} — Schlüssel ohne Leserecht oder widerrufen? (Klickliste im Runbook)`)
        process.exit(2)
      }
      const json = await r.json()
      const daten = Array.isArray(json?.data) ? json.data : []
      for (const mail of daten) {
        if (Date.parse(mail.created_at) < seit) { fertig = true; break }
        anzahl++
        if (mail.last_event === 'bounced') bounces.push(empfaengerDomain(mail))
        else if (mail.last_event === 'complained') beschwerden.push(empfaengerDomain(mail))
      }
      if (!json?.has_more || !daten.length) fertig = true
      after = daten.at(-1)?.id
    }
    if (anzahl >= MAIL_DAY_ALARM) {
      befund = true
      console.log(`✗ Resend: ${anzahl} Mails in ${RESEND_HOURS} h — das ist kein normaler Tag (Tageslimit 100).`)
    }
    else {
      console.log(`✔ Resend: ${anzahl} Mails in ${RESEND_HOURS} h.`)
    }

    // ── BLICK 3: Bounces und Spam-Beschwerden ──────────────────────────────
    console.log(`\nMail-Wächter, Blick 3 — Bounces (Alarm ab ${BOUNCE_ALARM}) und Spam-Beschwerden (Alarm ab ${COMPLAINT_ALARM}) in ${RESEND_HOURS} h\n`)
    for (const [name, liste, schwelle] of [['Bounces', bounces, BOUNCE_ALARM], ['Spam-Beschwerden', beschwerden, COMPLAINT_ALARM]]) {
      const domains = [...new Set(liste)].slice(0, 10).join(', ')
      if (liste.length >= schwelle) {
        befund = true
        console.log(`✗ ${name}: ${liste.length}${domains ? ` (Domains: ${domains})` : ''}`)
      }
      else {
        console.log(`✔ ${name}: ${liste.length}${domains ? ` (Domains: ${domains})` : ''}`)
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
