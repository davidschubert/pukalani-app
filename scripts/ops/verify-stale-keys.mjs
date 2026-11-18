#!/usr/bin/env node
/**
 * Zugangs-Wächter: findet Schlüssel und Env-Dateien, deren Projekt es NICHT
 * MEHR GIBT — die also nur noch Angriffsfläche sind und keine Aufgabe haben.
 *
 *   node scripts/ops/verify-stale-keys.mjs            # dieser Rechner
 *   node scripts/ops/verify-stale-keys.mjs --dir ~/x  # anderer Ordner
 *   node scripts/ops/verify-stale-keys.mjs --ssh      # der Server
 *   node scripts/ops/verify-stale-keys.mjs --ssh --strict   # CI: Fund = rot
 *
 * WARUM ES DAS GIBT (2026-08-19): an EINEM Tag tauchten Zugänge zu längst
 * gelöschten Projekten an DREI Orten auf — `/home/ploi/.env-backups/` auf dem
 * Server (fünf Dateien, darunter derselbe Stripe-Schlüssel wie in der
 * Produktion), vier `.key`-Dateien im lokalen Geheimnis-Ordner und eine
 * eingefrorene `.env`-Sicherung. Alle drei entstanden als verantwortungsvoller
 * Zwischenschritt eines Umzugs (`studio`→`control`→`admin`, `pool`→`account`)
 * und wurden genau dadurch zum Problem: Wochen später kannte sie niemand mehr.
 * Ein Umzug benennt Dinge um; die Schlüssel dazu bleiben liegen, wo sie
 * gebraucht wurden.
 *
 * ── DIE EINE REGEL, DIE DIESES SKRIPT DURCHSETZT ──────────────────────────
 * NUR **404** BEWEIST „TOT". Ein 404 heisst: dieses Projekt existiert auf der
 * Instanz nicht mehr — und das ist unabhängig davon, welche Rechte der
 * Schlüssel hat. Ein **401** beweist dagegen GAR NICHTS: es kann „ungültig"
 * heissen, aber genauso „gültig, nur nicht für den Bereich, den du gefragt
 * hast".
 *
 * Das ist kein theoretischer Unterschied. Beim ersten Durchgang meldete eine
 * naive Probe `migrations/account.env` und `migrations/admin.env` als tot,
 * weil sie gegen `/v1/users` lief — die Schlüssel tragen aber bewusst nur
 * `databases/tables/columns/indexes`. Ein Aufräumen auf dieser Grundlage hätte
 * zwei täglich gebrauchte Schlüssel vernichtet.
 *
 * ── UND DEN BEREICH RÄT MAN AUCH NICHT AM NAMEN AB ────────────────────────
 * Der zweite Anlauf schloss vom Variablen-NAMEN auf den Umfang
 * (`NUXT_APPWRITE_MIGRATIONS_KEY` ⇒ Tabellen, sonst Nutzer) und lag wieder
 * daneben: `migrations/account.env` liegt im Ordner `migrations/`, hält seinen
 * Schlüssel aber unter `NUXT_APPWRITE_KEY`. Ein Name ist eine Absicht, kein
 * Befund — dieselbe Falle wie bei den Naht-Richtungen, die man aus Env-Namen
 * statt aus den montierten Layern gelesen hatte.
 *
 * Deshalb wird GAR NICHT geraten: jeder Schlüssel wird gegen BEIDE Bereiche
 * gehalten und die Antworten werden verrechnet — irgendein 404 heisst tot
 * (das Projekt fehlt, unabhängig von Rechten), irgendein 200 heisst lebt, und
 * erst wenn beide Bereiche mauern, steht „unklar" da. Das kostet einen
 * zweiten Aufruf und erspart die ganze Ratekette.
 *
 * ── ES LÖSCHT BEWUSST NICHTS ──────────────────────────────────────────────
 * Eine Löschung ist unumkehrbar, dieses Skript kennt aber nur die halbe
 * Wahrheit: es sieht, dass ein Projekt weg ist, nicht, ob die Datei daneben
 * noch etwas enthält, das es nirgends sonst gibt. Diese zweite Frage gehört
 * an einen Menschen. Der Bericht nennt darum den Handgriff (`shred -u` bzw.
 * `rm -P`), führt ihn aber nie aus.
 *
 * ── `--ssh`: DERSELBE TEST AUF DEM SERVER ─────────────────────────────────
 * Dort liegen nicht nur Reste, sondern die AKTIVEN `.env` der Sites — und auch
 * die können auf ein totes Projekt zeigen. Genau das war E1b:
 * `apps/platform/.env.production` verwies nach dem Account-Cutover noch auf
 * `pool`, das der Cutover eingefroren hatte. Ein ✖ auf einer LEBENDEN Site ist
 * deshalb kein Aufräum-Hinweis, sondern ein Betriebs-Alarm.
 *
 * Das Skript läuft dafür AUF dem Server (das Ausliefern legt es dort ab, das
 * Wächter-Tor startet es; bis 2026-11-18 kopierte es sich selbst hinüber) — die
 * Schlüssel verlassen ihn nie, zurück kommt nur der Bericht (Dateiname,
 * Projekt, Status). Dieselbe Zusage wie bei `verify-site-env.mjs`, nur mit dem
 * Unterschied, dass hier tatsächlich geprüft werden muss, ob ein Schlüssel
 * WIRKT — und das geht nicht, ohne ihn zu benutzen.
 *
 * WERTE ERSCHEINEN NIRGENDS. Gelesen wird der Schlüssel nur, um ihn als
 * Kopfzeile zu schicken; ausgegeben werden Dateiname, Projekt und Status.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

const ENDPUNKT = process.env.PUKALANI_APPWRITE_ENDPOINT || 'https://api.pukalani.app/v1'
const argDir = process.argv.indexOf('--dir')
const ORDNER = argDir !== -1 && process.argv[argDir + 1]
  ? process.argv[argDir + 1].replace(/^~/, homedir())
  : join(homedir(), '.appwrite-secrets')

/**
 * `--strict` macht aus der Inventur ein Tor: ein Zugang auf ein GELÖSCHTES
 * Projekt beendet den Lauf mit 1. Bewusst NUR dieser Fall — „unklar" bleibt
 * grün, sonst wäre ein Netz-Aussetzer ein Alarm und der Wächter würde nach
 * der dritten Fehlmeldung ignoriert.
 */
const STRIKT = process.argv.includes('--strict')

/**
 * `--ssh`: auf dem Server laufen lassen. Geprüft wird am Ort, damit kein
 * Schlüssel über die Leitung zurückkommt — zurück kommt nur der Bericht.
 *
 * Seit CI1 a (2026-11-18) kopiert sich das Skript NICHT mehr hinüber: das
 * Ausliefern legt es unter /home/ploi/<site>/ops/ ab, und das Tor-Wort
 * `stale-keys` (ops/app-watch-gate.sh) startet es dort mit `--dir /home/ploi`.
 * Der Import des Tor-Wegs steht deshalb HIER drin und nicht oben: auf dem
 * Server liegt diese Datei allein, ohne ihre Nachbarn.
 */
if (process.argv.includes('--ssh')) {
  const { APP_SERVER, GATE_NOT_CHECKED, GATE_REJECTED, gateSshArgs } = await import('./app-watch-gate.mjs')
  const args = STRIKT ? ['stale-keys', 'strict'] : ['stale-keys']
  const lauf = spawnSync('ssh', gateSshArgs(APP_SERVER, ...args), { stdio: 'inherit' })

  // spawnSync meldet einen START-Fehler in `error`, nicht in `status` — das
  // zuerst prüfen, sonst liest man `null` als Erfolg.
  if (lauf.error) {
    console.error(`ssh fehlgeschlagen — ${lauf.error.message}`)
    process.exit(2)
  }
  // Die Ferne entscheidet über den Ausgang: 0 ruhig, 1 Fund (mit --strict).
  // Alles andere heißt „nicht geprüft" (ssh kaputt, Tor fehlt oder lehnt ab,
  // das Skript liegt dort noch nicht) — Exit 2, nie „alles gut".
  if (lauf.status === 0 || lauf.status === 1) process.exit(lauf.status)
  const grund = lauf.status === GATE_NOT_CHECKED
    ? 'ein Stück fehlt auf dem Server'
    : lauf.status === GATE_REJECTED ? 'das Tor lehnt ab' : `Exit ${lauf.status ?? '?'}`
  console.error(`Nicht geprüft — ${grund}. docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, „Das Wächter-Tor".`)
  process.exit(2)
}

/**
 * Ordner, die nie einen Zugang enthalten, aber Zehntausende Dateien — ohne
 * diese Liste läuft `--ssh` in den `node_modules` unter `releases` fest.
 * (Kein Glob-Stern im Kommentar: die Folge Stern-Schrägstrich beendet ihn.)
 */
const UEBERSPRINGEN = new Set(['node_modules', '.git', '.pnpm', 'dist', '.output', '.nuxt', 'img'])
/** Tiefe reicht für `/home/ploi/<site>/.env` und `~/.appwrite-secrets/<x>/y`. */
const MAX_TIEFE = 3

/** Alle Dateien unterhalb von `wurzel`, flach ausgerollt. */
function dateien(wurzel) {
  const out = []
  const lauf = (d, tiefe) => {
    if (tiefe > MAX_TIEFE) return
    let eintraege
    try { eintraege = readdirSync(d, { withFileTypes: true }) }
    catch { return }
    for (const e of eintraege) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (!UEBERSPRINGEN.has(e.name)) lauf(p, tiefe + 1)
      }
      else if (e.isFile()) out.push(p)
    }
  }
  lauf(wurzel, 0)
  return out.sort()
}

/**
 * Kommt diese Datei überhaupt als Zugang in Frage? EINE Stelle entscheidet das,
 * damit die Prüfung und die Abdeckungs-Meldung unten nie auseinanderlaufen —
 * sonst zählt der Bericht Dateien als „nicht prüfbar", die nie gemeint waren
 * (README, Migrations-Skripte), und die Zahl wird wertlos.
 *
 * Vorlagen fliegen ausdrücklich raus: heute stehen dort leere Werte und sie
 * fielen ohnehin durch, aber füllt sie jemand mit einem Beispiel-Projekt,
 * meldete der Wächter einen Fehlalarm „tot" für etwas, das nie ein Zugang war.
 */
function istKandidat(pfad) {
  const name = pfad.split('/').pop()
  if (/\.(json|png|jpe?g|log|md|mjs|mts|ts|cjs|sh|yml|yaml)$/i.test(name)) return false
  if (/(example|sample|template)$/i.test(name)) return false
  return true
}

/**
 * Was steckt in dieser Datei? Zwei Formen, beide im Bestand:
 *  - eine `.env` mit NUXT_PUBLIC_APPWRITE_PROJECT_ID + NUXT_APPWRITE_*KEY
 *  - eine nackte `<projekt>-<art>.key` (Name trägt das Projekt)
 * Alles andere (JSON-Dumps, Bilder, Skripte) ist kein Zugang und fällt raus.
 */
function zugangAus(pfad) {
  if (!istKandidat(pfad)) return null
  const name = pfad.split('/').pop()

  let inhalt = ''
  try { inhalt = readFileSync(pfad, 'utf8') }
  catch { return null }

  const feld = (k) => (inhalt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').replace(/^["']|["']$/g, '').trim()
  const projekt = feld('NUXT_PUBLIC_APPWRITE_PROJECT_ID')
  const datenbank = feld('NUXT_PUBLIC_APPWRITE_DATABASE_ID')
  const migrationsKey = feld('NUXT_APPWRITE_MIGRATIONS_KEY')
  const laufzeitKey = feld('NUXT_APPWRITE_KEY')

  if (projekt && (migrationsKey || laufzeitKey)) {
    // `art` ist reine ANZEIGE — welchen Bereich der Schlüssel wirklich hat,
    // wird gemessen, nicht aus diesem Feld geschlossen (s. Kopf).
    return migrationsKey
      ? { pfad, projekt, datenbank, schluessel: migrationsKey, art: 'migrations' }
      : { pfad, projekt, datenbank, schluessel: laufzeitKey, art: 'runtime' }
  }

  // Nackte Schlüsseldatei: `<projekt>-<art>.key`
  const m = name.match(/^([a-z0-9-]+?)-(runtime|migrations)\.key$/)
  if (m && /^[A-Za-z0-9_.-]{20,}$/.test(inhalt.trim())) {
    return { pfad, projekt: m[1], datenbank: '', schluessel: inhalt.trim(), art: m[2] }
  }
  return null
}

/**
 * Hält den Schlüssel gegen BEIDE Bereiche und verrechnet die Antworten
 * (Begründung im Kopf: der Umfang ist weder am Datei- noch am Variablen-Namen
 * ablesbar). Kurzschluss beim ersten eindeutigen Ergebnis — ein 404 oder 200
 * beantwortet die Frage schon, dann kostet es keinen zweiten Aufruf.
 */
async function pruefen(z) {
  const limit = encodeURIComponent(JSON.stringify({ method: 'limit', values: [1] }))
  const bereiche = [
    ['Nutzer', `${ENDPUNKT}/users?queries[]=${limit}`],
    ...(z.datenbank ? [['Tabellen', `${ENDPUNKT}/tablesdb/${z.datenbank}/tables?queries[]=${limit}`]] : []),
  ]

  const gesehen = []
  for (const [bereich, url] of bereiche) {
    let status
    try {
      const r = await fetch(url, {
        headers: { 'x-appwrite-project': z.projekt, 'x-appwrite-key': z.schluessel },
        signal: AbortSignal.timeout(20_000),
      })
      status = r.status
    }
    catch (fehler) {
      gesehen.push(`${bereich}: nicht erreichbar (${(fehler && fehler.message) || fehler})`)
      continue
    }
    // 404 = das PROJEKT fehlt. Das gilt unabhängig vom Rechteumfang und ist
    // damit das einzige Ergebnis, das „tot" beweisen darf.
    if (status === 404) return { lage: 'tot', text: 'Projekt existiert nicht mehr' }
    if (status === 200) return { lage: 'lebt', text: `gültig (Bereich ${bereich})` }
    gesehen.push(`${bereich}: HTTP ${status}`)
  }
  return { lage: 'unklar', text: `kein Bereich antwortete — ${gesehen.join(', ')}` }
}

const alle = dateien(ORDNER)
const gefunden = alle.map(zugangAus).filter(Boolean)
/**
 * Dateien, die WIE ein Zugang aussehen (nennen ein Projekt), aber keinen
 * benutzbaren Schlüssel tragen. Sie werden nicht geprüft — das ist richtig,
 * darf aber nicht unsichtbar bleiben: eine Abdeckung, die man nicht sieht,
 * liest sich wie „alles geprüft". `pukalani.app/.env` ist so ein Fall (die
 * Marketing-Site nennt ihr Projekt, braucht aber bewusst keinen Schlüssel).
 */
const ohneSchluessel = alle.filter((pfad) => {
  if (!istKandidat(pfad) || zugangAus(pfad)) return false
  try { return /^NUXT_PUBLIC_APPWRITE_PROJECT_ID=.+$/m.test(readFileSync(pfad, 'utf8')) }
  catch { return false }
})

if (!gefunden.length) {
  console.log(`Keine Zugangs-Dateien unter ${ORDNER} — nichts zu prüfen.`)
  process.exit(0)
}

console.log(`Zugangs-Wächter — ${gefunden.length} prüfbare(r) Zugang/Zugänge von ${alle.length} Dateien unter ${ORDNER}, Instanz ${ENDPUNKT}\n`)

const ergebnisse = []
for (const z of gefunden) {
  const e = await pruefen(z)
  ergebnisse.push({ ...z, ...e })
  const zeichen = e.lage === 'tot' ? '✖' : e.lage === 'lebt' ? '✔' : '?'
  const kurz = relative(ORDNER, z.pfad)
  console.log(`${zeichen} ${kurz.padEnd(46)} ${z.projekt.padEnd(12)} ${z.art.padEnd(10)} ${e.text}`)
}

const tot = ergebnisse.filter(e => e.lage === 'tot')
const unklar = ergebnisse.filter(e => e.lage === 'unklar')

console.log()
if (tot.length) {
  console.log(`${tot.length} Zugang/Zugänge zeigen auf ein GELÖSCHTES Projekt:\n`)
  for (const e of tot) console.log(`  ${relative(ORDNER, e.pfad)}  (Projekt ${e.projekt})`)
  console.log(`
Vor dem Löschen die zweite Frage beantworten, die dieses Skript NICHT kann:
steht in der Datei ein Wert, den es nirgends sonst gibt? Jeden Schlüssel gegen
die lebende .env halten — identisch oder Altwert heisst, es geht nichts
verloren. Danach überschreibend löschen, nicht nur aushängen:

  rm -P <datei>      # macOS
  shred -u <datei>   # Linux
`)
}
else {
  console.log('Kein Zugang zeigt auf ein gelöschtes Projekt.')
}

if (unklar.length) {
  console.log(`${unklar.length} unklar — das ist KEIN Befund und KEIN Löschgrund (siehe Kopf).`)
}

if (ohneSchluessel.length) {
  console.log(`\n${ohneSchluessel.length} Datei(en) nennen ein Projekt, tragen aber keinen Schlüssel — nicht prüfbar:`)
  for (const pfad of ohneSchluessel) console.log(`  ${relative(ORDNER, pfad)}`)
  console.log('  (erwartet z. B. bei Sites ohne Appwrite-Zugriff — hier steht es, damit die Abdeckung sichtbar bleibt)')
}

// Ohne `--strict` immer 0: von Hand aufgerufen ist das eine Inventur, und ein
// roter Ausgang für „ich habe etwas gefunden" wäre da nur im Weg. Mit
// `--strict` (der geplante Lauf) ist ein toter Zugang ein Befund und muss
// auffallen — grün darf er dann nicht mehr sein.
if (STRIKT && tot.length) {
  console.error(`\n::error::${tot.length} Zugang/Zugänge zeigen auf ein gelöschtes Projekt.`)
  process.exit(1)
}
process.exit(0)
