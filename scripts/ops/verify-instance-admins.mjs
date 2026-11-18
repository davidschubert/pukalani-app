#!/usr/bin/env node
/**
 * Aussperr-Wächter: meldet eine Instanz, die KEIN Admin-Konto mehr hat.
 *
 *   node scripts/ops/verify-instance-admins.mjs            # dieser Rechner
 *   node scripts/ops/verify-instance-admins.mjs --ssh      # der Server
 *   node scripts/ops/verify-instance-admins.mjs --ssh --strict   # CI: Fund = rot
 *
 * WARUM (Davids Einwand 2026-08-23): „Registrierung aus" ist nur so lange
 * harmlos, wie es noch jemanden gibt, der sie wieder anschalten kann. Ohne
 * Admin-Konto ist das Dashboard für niemanden mehr bedienbar — und wenn
 * zusätzlich die Registrierung zu ist, kommt auf der Site überhaupt niemand
 * mehr hinein.
 *
 * ── WARUM DAS NICHT IN DER ROUTE STEHT ────────────────────────────────────
 * Die naheliegende Stelle wäre `PATCH /api/admin/config`: „verweigere
 * `registrationEnabled: false`, wenn es keinen Admin gibt". Diese Prüfung
 * könnte nie zuschlagen. `system.manage` hängt am Label `admin`
 * (core/shared/authz.ts), wer die Einstellung ändern darf, IST also Admin —
 * die Zahl ist an dieser Stelle immer ≥ 1. Ein Zweig, der nie läuft, ist
 * keine Sicherung, sondern eine Behauptung; dieses Repo hatte so einen schon
 * (`last_admin` lief monatelang ins Leere, weil sein Code nie ankam).
 *
 * Der gefährliche Zustand entsteht ANDERSWO: in der Appwrite-Console (Label
 * entfernt, Konto gelöscht), in einem Migrations- oder Wartungsskript, oder
 * bei einer frisch aufgesetzten Instanz, der die Label-Vergabe noch fehlt.
 * Auf dem Schreibweg IM Produkt ist die Regel bereits gesichert
 * (`assertNotLastAdmin` in packages/admin/server/utils/admins.ts). Dieser
 * Wächter deckt den Rest ab — er fragt nicht, WIE es dazu kam, sondern ob es
 * so ist.
 *
 * ── WAS ROT MACHT UND WAS NICHT ───────────────────────────────────────────
 * ROT: kein Konto mit Label `admin`. Dann ist das Dashboard verwaist.
 * NICHT ROT: „Registrierung aus bei genau einem Admin" — das ist der
 * NORMALFALL auf einer Ein-Personen-Instanz (Betreiber-Konsole, Silo) und
 * ausdrücklich gewollt. Ein Wächter, der den gewollten Zustand anmahnt, wird
 * weggeklickt.
 *
 * WERTE ERSCHEINEN NIRGENDS: der Schlüssel wird nur als Kopfzeile benutzt,
 * ausgegeben werden Projekt, Kontenzahl und Zustand.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STRIKT = process.argv.includes('--strict')
const SERVER_ORDNER = '/home/ploi'

/**
 * `--ssh`: auf dem Server laufen lassen (die Schlüssel bleiben dort). Seit
 * CI1 a (2026-11-18) über das Tor-Wort `instance-admins`
 * (ops/app-watch-gate.sh): das Ausliefern legt diese Datei unter
 * /home/ploi/<site>/ops/ ab, das Tor startet sie mit `--dir /home/ploi`.
 * Vorher kopierte sie sich per scp selbst hinüber. Der Import des Tor-Wegs
 * steht HIER drin: auf dem Server liegt die Datei allein.
 */
if (process.argv.includes('--ssh')) {
  const { APP_SERVER, GATE_NOT_CHECKED, GATE_REJECTED, gateSshArgs } = await import('./app-watch-gate.mjs')
  const args = STRIKT ? ['instance-admins', 'strict'] : ['instance-admins']
  const lauf = spawnSync('ssh', gateSshArgs(APP_SERVER, ...args), { stdio: 'inherit' })
  if (lauf.error) {
    console.error(`ssh fehlgeschlagen — ${lauf.error.message}`)
    process.exit(2)
  }
  // 0 ruhig, 1 Fund (mit --strict); alles andere heißt „nicht geprüft" —
  // Exit 2, nie „alles gut".
  if (lauf.status === 0 || lauf.status === 1) process.exit(lauf.status)
  const grund = lauf.status === GATE_NOT_CHECKED
    ? 'ein Stück fehlt auf dem Server'
    : lauf.status === GATE_REJECTED ? 'das Tor lehnt ab' : `Exit ${lauf.status ?? '?'}`
  console.error(`Nicht geprüft — ${grund}. docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, „Das Wächter-Tor".`)
  process.exit(2)
}

const argDir = process.argv.indexOf('--dir')
const ORDNER = argDir !== -1 && process.argv[argDir + 1] ? process.argv[argDir + 1] : SERVER_ORDNER

/** Site-Verzeichnisse mit `.env` — eine Ebene tief, mehr braucht es nicht. */
function sites(wurzel) {
  let eintraege
  try { eintraege = readdirSync(wurzel, { withFileTypes: true }) }
  catch { return [] }
  const out = []
  for (const e of eintraege) {
    if (!e.isDirectory()) continue
    const pfad = join(wurzel, e.name, '.env')
    let inhalt
    try { inhalt = readFileSync(pfad, 'utf8') }
    catch { continue }
    const feld = k => (inhalt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').replace(/^["']|["']$/g, '').trim()
    const projekt = feld('NUXT_PUBLIC_APPWRITE_PROJECT_ID')
    const key = feld('NUXT_APPWRITE_KEY')
    const endpunkt = feld('NUXT_PUBLIC_APPWRITE_ENDPOINT')
    const datenbank = feld('NUXT_PUBLIC_APPWRITE_DATABASE_ID')
    if (projekt && key && endpunkt) out.push({ site: e.name, projekt, key, endpunkt, datenbank })
  }
  return out.sort((a, b) => a.site.localeCompare(b.site))
}

async function hole(s, pfad) {
  const r = await fetch(`${s.endpunkt}${pfad}`, {
    headers: { 'x-appwrite-project': s.projekt, 'x-appwrite-key': s.key },
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const gefunden = sites(ORDNER)
if (!gefunden.length) {
  console.log(`Keine Site mit Appwrite-Zugang unter ${ORDNER} — nichts zu prüfen.`)
  process.exit(0)
}

console.log(`Aussperr-Wächter — ${gefunden.length} Instanz(en) unter ${ORDNER}\n`)

const verwaist = []
let geprueft = 0
for (const s of gefunden) {
  let zeile
  try {
    const limit = encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))
    const nutzer = await hole(s, `/users?queries[]=${limit}`)
    const admins = nutzer.users.filter(u => (u.labels || []).includes('admin')).length

    // Die Registrierung ist nur ZUSATZ-Information: sie entscheidet, wie
    // schlimm ein fehlender Admin ist, aber nicht, OB es ein Fund ist.
    let reg = '?'
    if (s.datenbank) {
      try {
        const cfg = await hole(s, `/tablesdb/${s.datenbank}/tables/app_config/rows/global`)
        reg = cfg.registrationEnabled ? 'offen' : 'zu'
      }
      catch { reg = '—' }
    }

    const zeichen = admins === 0 ? '✖' : '✔'
    zeile = `${zeichen} ${s.site.padEnd(26)} ${s.projekt.padEnd(11)} Konten ${String(nutzer.total).padStart(4)} · Admins ${admins} · Registrierung ${reg}`
    geprueft++
    if (admins === 0) verwaist.push({ ...s, reg })
  }
  catch (fehler) {
    // Nicht erreichbar ist KEIN Fund: sonst macht ein Netz-Aussetzer den
    // Wächter rot und er wird nach der dritten Fehlmeldung ignoriert.
    zeile = `? ${s.site.padEnd(26)} ${s.projekt.padEnd(11)} nicht abfragbar (${(fehler && fehler.message) || fehler})`
  }
  console.log(zeile)
}

const unklar = gefunden.length - geprueft

console.log()
if (!verwaist.length) {
  // Zahlen statt Zusicherung: „alles gut" über eine Instanz, die gar nicht
  // geantwortet hat, wäre eine Behauptung — und genau die Sorte, die einen
  // Wächter wertlos macht.
  console.log(`${geprueft} von ${gefunden.length} Instanz(en) geprüft — jede hat mindestens ein Admin-Konto.`)
  if (unklar) console.log(`${unklar} nicht abfragbar — darüber sagt dieser Lauf NICHTS.`)
  process.exit(0)
}

console.log(`${verwaist.length} Instanz(en) OHNE Admin-Konto:\n`)
for (const v of verwaist) {
  const dazu = v.reg === 'zu'
    ? 'die Registrierung ist zusätzlich zu, dort kommt also niemand mehr hinein'
    : 'das Dashboard ist damit für niemanden bedienbar'
  console.log(`  ${v.site} (Projekt ${v.projekt}) — ${dazu}`)
}
console.log(`
Kur: in der Appwrite-Console dem gewünschten Konto das Label \`admin\` geben
(Auth → Users → Labels). Das ist der Weg, der IMMER offen bleibt — er hängt
nicht am Dashboard und deshalb auch nicht daran, dass es gerade niemand
bedienen kann.
`)

if (STRIKT) {
  console.error(`::error::${verwaist.length} Instanz(en) ohne Admin-Konto.`)
  process.exit(1)
}
process.exit(0)
