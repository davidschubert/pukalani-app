/**
 * DAS WERKZEUG DER KURATIERTEN BIBLIOTHEK (Plan §7.2 Nr. 3, MV1 M6).
 *
 * Es rechnet Bibliotheks-Einträge VOR. Es erzeugt sie nicht — in die
 * Bibliothek kommt ein Eintrag erst, wenn ein MENSCH seine Zitate am Original
 * geprüft hat (`docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md`). Was hier
 * herauskommt, heisst deshalb ENTWURF, trägt `status: 'draft'` und fällt
 * durch das Bibliotheks-Schema.
 *
 * ── DIE FÜNF MODI ─────────────────────────────────────────────────────────
 *
 *   --check                 Trockenlauf: DÜRFEN wir diese Marke überhaupt
 *                           auswerten? Höchstens DREI Anfragen je Host, keine
 *                           Unterseite, kein gespeicherter Rohtext. Ergebnis:
 *                           Tabelle + `shared/library/feasibility.<datum>.json`.
 *                           Dazu das ALTER der ausgelieferten Einträge (90
 *                           Tage, s. unten) — als Warnung, nicht als Tor.
 *   --stale [--now TT]      NUR die überfälligen Einträge, und ein Exit-Code:
 *                           1, wenn welche da sind, sonst 0. Für einen Cron
 *                           oder einen Wächter-Lauf, der nicht mitlesen kann.
 *                           `--now JJJJ-MM-TT` verschiebt den Stichtag — so
 *                           lässt sich die Warnung vorführen, solange nichts
 *                           überfällig ist.
 *   --compute --stub        Voller Lauf über die ECHTE Pipeline, aber gegen
 *                           die erfundenen Demo-Websites des Playgrounds und
 *                           mit `MARKET_DEV_STUB=1`. Beweist, dass das
 *                           Werkzeug fertige Entwürfe erzeugt — ohne einen
 *                           einzigen bezahlten Aufruf.
 *   --compute               Der echte Lauf über die Kandidaten aus
 *                           `shared/library/candidates.json`. Verlangt
 *                           ausdrücklich `MARKET_LIBRARY_ALLOW_PAID=1` und
 *                           druckt vorher eine Kostenschätzung.
 *   --promote <schlüssel>   Übernimmt einen VON HAND GEPRÜFTEN Entwurf nach
 *                           `shared/library/index.ts`.
 *
 * ── WARUM ES KEINE EIGENE ROUTE UND KEINE EIGENE PIPELINE HAT ─────────────
 * Der Abruf, die Sperrliste, der PII-Filter, der Beleg-Riegel und die
 * Häufigkeits-Rechnung liegen im market-Layer und laufen dort in einem
 * Nitro-Kontext (`useRuntimeConfig`, `useAppConfig`, Appwrite-Ablage). Ein
 * Werkzeug, das sie NACHBAUT, wäre eine zweite Pipeline mit einer zweiten
 * Beweislast — und ausgerechnet für die Einträge, die wir öffentlich unter
 * fremdem Markennamen zeigen wollen.
 *
 * Also benutzt dieses Werkzeug den KUNDENWEG: es legt ein Wegwerf-Konto und
 * ein Wegwerf-Branding an, trägt die Marken als Kandidaten ein, ruft
 * `POST /api/market/profiles/:id/run` und liest die fertigen Marktprofile
 * zurück. Genau der Weg, den auch ein Kunde geht — inklusive robots, TDM,
 * Sperrliste, Beleg-Riegel und Drossel. Eine Betreiber-Route
 * `/api/market/ops/library-compute` wäre eine dauerhafte Produktionsfläche
 * für einen Handgriff, den es eine Handvoll Mal gibt; der Sweep-Knopf aus M5
 * hat seinen Platz, weil ihn der BETRIEB braucht, nicht die Redaktion.
 *
 * ── DIE 90-TAGE-REGEL, UND WARUM SIE `--check` NICHT ROT MACHT ────────────
 * Das Runbook sagt seit jeher „Nichts älter als 90 Tage" (Schritt 4). Seit
 * 2026-09-06 steht die Regel als pure Funktion im Code
 * (`shared/marketLibraryAge.ts`), und dieses Werkzeug zeigt sie an: `--check`
 * druckt je ausgeliefertem Eintrag sein Alter und markiert die überfälligen.
 *
 * ÜBERFÄLLIGE MACHEN `--check` TROTZDEM NICHT ROT (Exit 0). `--check` ist der
 * Trockenlauf VOR einer Handprüfung — er läuft, wenn ein Mensch ohnehin am
 * Terminal sitzt und liest. Ein Tor an dieser Stelle bestrafte den, der gerade
 * arbeitet, für einen Eintrag, mit dem er nichts zu tun hat, und stünde
 * ausserdem zwischen ihm und der Antwort, die er gesucht hat („darf ich diese
 * neue Marke auswerten?"). Die WARNUNG ist hier der Wächter.
 *
 * Wer ein Tor braucht — eine geplante Aufgabe, eine CI-Stufe —, nimmt
 * `--stale`: derselbe Befund, aber als Exit-Code, weil niemand mitliest.
 *
 * ── WAS DAS WERKZEUG NIE TUT ──────────────────────────────────────────────
 *  · Es setzt `status: 'verified'`, `verifiedAt` oder `verifiedBy` NICHT.
 *    Ein Werkzeug, das sein eigenes Prüfsiegel vergibt, prüft nichts.
 *  · Es schreibt im Trockenlauf KEINEN Rohtext auf die Platte — nur die
 *    Antwort auf „erlaubt / verboten / vorbehalten".
 *  · Es holt im Trockenlauf keine Unterseite und keine Datei ausserhalb der
 *    drei erlaubten Adressen.
 *  · Es startet ohne `MARKET_LIBRARY_ALLOW_PAID=1` keinen bezahlten Lauf.
 *
 * ── VORBEDINGUNGEN DER `--compute`-MODI ───────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`- und `market_*`-Tabellen und ein
 * Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md, „Worktree-
 * Beweise"):
 *
 *   MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/market/scripts/market-library-compute.mjs --compute --stub
 *
 * `--check`, `--stale` und `--promote` brauchen weder Server noch Appwrite.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// DIE REGELN KOMMEN AUS DEM PRODUKT, NICHT AUS DIESER DATEI.
// Node 22 entfernt TypeScript-Typen beim Laden; die Module hier sind pur und
// IMPORTFREI, also laufen sie unverändert — Nodes ESM-Auflösung kennt die
// erweiterungslosen Pfade des Nuxt-Baums nicht, ein Modul mit eigenen Importen
// wäre von hier aus unerreichbar. Genau darum liegt die 90-Tage-Regel in
// `shared/marketLibraryAge.ts` und nicht in `marketLibrary.ts` (das zod zieht);
// die App importiert sie trotzdem von dort, denn `marketLibrary.ts` reicht sie
// weiter. Eine JS-Kopie des robots-Parsers oder der Alters-Rechnung wäre je
// eine zweite Wahrheit über eine Frage, an der etwas hängt — ob wir einen
// fremden Server anfassen dürfen, und ob ein Eintrag noch gilt.
import { MARKET_ROBOTS_ABSENT, marketRobotsAllows, parseMarketRobots } from '../shared/marketRobots.ts'
import {
  MARKET_MAX_CHARS_PER_PAGE,
  MARKET_MAX_CHARS_PER_RUN,
  MARKET_MAX_PAGES,
  marketTdmReserved,
} from '../shared/marketCrawlRules.ts'
import { extractMetaDirectives, sitemapUrlsFromRobots } from '../../brand/shared/brandSiteCrawlParse.ts'
import { MARKET_COMPETITORS_MAX } from '../shared/marketProfile.ts'
import {
  MARKET_LIBRARY_MAX_AGE_DAYS,
  marketLibraryEntryAge,
  marketLibraryEntryIsStale,
} from '../shared/marketLibraryAge.ts'
import { MARKET_LIBRARY_ENTRIES, MARKET_LIBRARY_VERSION } from '../shared/library/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIBRARY_DIR = resolve(HERE, '../shared/library')
const DRAFTS_DIR = join(LIBRARY_DIR, 'drafts')
const INDEX_FILE = join(LIBRARY_DIR, 'index.ts')
const CANDIDATES_FILE = join(LIBRARY_DIR, 'candidates.json')

/**
 * DER ABSENDER. Wörtlich derselbe wie in
 * `packages/brand/server/utils/brandSiteCrawl.ts` — wer uns in seiner
 * robots.txt etwas verbietet, verbietet es EINEM Namen, und ein Trockenlauf
 * unter einem anderen Namen umginge genau diese Zusage.
 */
const USER_AGENT = 'PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)'

/**
 * DAS ANFRAGE-BUDGET DES TROCKENLAUFS — DREI je Host, und keine mehr.
 *
 * Ausgegeben wird es in der Reihenfolge der RECHTLICHEN Fragen:
 *   1. `robots.txt`               — dürfen wir überhaupt?
 *   2. `/.well-known/tdmrep.json` — steht ein Nutzungsvorbehalt da?
 *   3. Startseite                 — Vorbehalt als Kopfzeile oder Meta?
 *
 * `sitemap.xml` beantwortet die robots.txt mit ihrer `Sitemap:`-Zeile GRATIS
 * (keine zusätzliche Anfrage). `llms.txt` bleibt im Trockenlauf UNGEPRÜFT:
 * eine vierte Anfrage wäre eine Anfrage mehr, als dieser Lauf verantworten
 * kann, und die Frage „was gäbe es zu holen?" ist erst dran, wenn „dürfen
 * wir?" mit ja beantwortet ist. Der echte Lauf holt sie ohnehin (§7.4).
 *
 * Ist der Host in seiner robots.txt gegen uns, endet der Lauf nach der ERSTEN
 * Anfrage — ein Verbot beantwortet auch die zwei folgenden Fragen.
 */
const CHECK_MAX_REQUESTS = 3
const CHECK_TIMEOUT_MS = 10_000

/**
 * DIE KOSTENSCHÄTZUNG (Anzeige vor `--compute`, keine Abrechnung).
 *
 * Modell: `anthropic/claude-haiku-4.5` — die Stufe-1-Wahl des Wizards und der
 * Default der Extraktion (`pukalani.brand.ai.reviewModel`,
 * `server/utils/marketAi.ts`). Die Preise sind der Stand vom 2026-09-05 in
 * US-Dollar je Million Token und stehen hier als ZAHL, damit die Schätzung
 * nachrechenbar ist — sie sind KEINE Zusage des Anbieters und gehören vor
 * jedem grösseren Lauf nachgesehen.
 */
const PRICE_INPUT_PER_MTOK = 1.0
const PRICE_OUTPUT_PER_MTOK = 5.0
/** Grobe Umrechnung Zeichen → Token. Für eine Schätzung genau genug. */
const CHARS_PER_TOKEN = 4
/** Was der Extraktions-Prompt selbst wiegt (Anweisung + Feld-Beschreibung). */
const PROMPT_OVERHEAD_TOKENS = 1_500
/** Was die Antwort wiegt: zehn Felder mit Wert, Zitat und Adresse. */
const COMPLETION_TOKENS = 1_200

// ── Kleinkram ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const has = flag => args.includes(flag)
const valueOf = (flag) => {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1] : undefined
}

/**
 * Das ORTSDATUM, nicht das UTC-Datum: der Dateiname steht neben Commits und
 * Plan-Einträgen, die alle nach der Uhr des Menschen benannt sind. Nach
 * Mitternacht UTC wäre ein Bericht sonst einen Tag in der Zukunft datiert.
 */
function today() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/** Spalten auf feste Breite — die Tabelle soll im Terminal lesbar sein. */
function pad(text, width) {
  const value = String(text ?? '')
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length)
}

async function readCandidates() {
  const raw = await readFile(CANDIDATES_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  const brands = []
  for (const pair of parsed.pairs ?? []) {
    for (const brand of pair.brands ?? []) {
      brands.push({ ...brand, pair: pair.pair, category: pair.category })
    }
  }
  if (!brands.length) fail('candidates.json enthält keine Marken')
  return brands
}

// ── Modus 1: der Trockenlauf ────────────────────────────────────────────────

/**
 * EINE Anfrage mit unserem Absender, Zeitgrenze und OHNE Weiterleitungs-
 * Überraschung: die Ziel-Adresse wird mitgeschrieben, damit die Tabelle sagen
 * kann, wenn ein Host anderswo landet — dort gilt eine ANDERE robots.txt, und
 * das ist eine Nacharbeit für den Menschen, keine Sache des Skripts.
 */
async function probe(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, 'accept': '*/*' },
    })
    const headers = {}
    for (const [key, value] of response.headers) headers[key.toLowerCase()] = value
    // Der Rumpf wird GELESEN, aber nie abgelegt: aus ihm entstehen nur
    // Ja/Nein-Antworten (Vorbehalt, Sitemap-Zeile). §1.7 Nr. 4 gilt auch für
    // ein Werkzeug, das nur nachsieht.
    const body = response.ok ? await response.text() : ''
    return { ok: response.ok, status: response.status, headers, body, finalUrl: response.url }
  }
  catch (error) {
    return { ok: false, status: 0, headers: {}, body: '', finalUrl: url, error: String(error?.message ?? error) }
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * DIE MACHBARKEIT EINER MARKE. Drei Anfragen, ein Urteil, kein Inhalt.
 */
async function checkBrand(brand) {
  const origin = new URL(brand.homepage).origin
  const result = {
    key: brand.key,
    name: brand.name,
    homepage: brand.homepage,
    origin,
    pair: brand.pair,
    category: brand.category,
    country: brand.country,
    requests: 0,
    robots: 'unbekannt',
    robotsDetail: '',
    tdm: 'ungeprüft',
    tdmForm: '',
    sitemap: 'ungeprüft',
    llms: 'ungeprüft (Budget)',
    finalOrigin: '',
    verdict: 'fehler',
  }

  // ── 1 · robots.txt ────────────────────────────────────────────────────────
  const robotsResponse = await probe(`${origin}/robots.txt`)
  result.requests++
  let robots = MARKET_ROBOTS_ABSENT
  if (robotsResponse.ok && robotsResponse.body) {
    robots = parseMarketRobots(robotsResponse.body)
    result.robots = marketRobotsAllows(robots, USER_AGENT, '/') ? 'erlaubt' : 'verboten'
    const sitemaps = sitemapUrlsFromRobots(robotsResponse.body)
    result.sitemap = sitemaps.length ? `${sitemaps.length}× in robots.txt` : 'nicht in robots.txt'
  }
  else if (robotsResponse.status === 404 || robotsResponse.status === 410) {
    // KEINE robots.txt heisst im Web ERLAUBT (RFC 9309, s. `marketRobots.ts`).
    result.robots = 'keine (⇒ erlaubt)'
    result.sitemap = 'nicht in robots.txt'
  }
  else if (robotsResponse.status === 401 || robotsResponse.status === 403) {
    // DIE BOT-ABWEHR IST AUCH EIN NEIN. Wer unserem Absender schon die
    // robots.txt verweigert, sagt damit deutlicher als jede Regel, dass er
    // keine Maschine auf seiner Seite will — fail-closed, keine zweite
    // Anfrage, und kein Ausweichen auf einen anderen Absender.
    result.robots = `Bot-Abwehr (${robotsResponse.status})`
    result.verdict = 'bot-abwehr'
    return result
  }
  else {
    result.robots = `nicht lesbar (${robotsResponse.status || '?'})`
    result.robotsDetail = robotsResponse.error ?? ''
    result.verdict = 'fehler'
    return result
  }

  if (result.robots === 'verboten') {
    // EIN VERBOT WIRD SOFORT RESPEKTIERT: keine zweite Anfrage an diesen Host.
    result.verdict = 'robots-verbot'
    return result
  }

  // ── 2 · /.well-known/tdmrep.json ─────────────────────────────────────────
  let tdmrepJson
  if (marketRobotsAllows(robots, USER_AGENT, '/.well-known/tdmrep.json') && result.requests < CHECK_MAX_REQUESTS) {
    const tdmrep = await probe(`${origin}/.well-known/tdmrep.json`)
    result.requests++
    if (tdmrep.ok && tdmrep.body.trim()) tdmrepJson = tdmrep.body
  }

  // ── 3 · Startseite (Kopfzeile + Meta) ────────────────────────────────────
  let meta = { robots: [], tdmReservation: [] }
  let homeHeaders = {}
  if (result.requests < CHECK_MAX_REQUESTS) {
    const home = await probe(brand.homepage)
    result.requests++
    if (!home.ok) {
      result.verdict = 'fehler'
      result.robotsDetail = `Startseite ${home.status || home.error || '?'}`
      return result
    }
    homeHeaders = home.headers
    meta = extractMetaDirectives(home.body)
    const landedOn = new URL(home.finalUrl).origin
    if (landedOn !== origin) result.finalOrigin = landedOn
  }

  const reserved = marketTdmReserved({
    headers: homeHeaders,
    metaRobots: meta.robots,
    metaTdm: meta.tdmReservation,
    tdmrepJson,
    path: '/',
  })
  if (reserved) {
    result.tdm = 'Vorbehalt'
    result.tdmForm = [
      homeHeaders['tdm-reservation'] ? 'Kopfzeile' : '',
      meta.tdmReservation.length ? 'Meta tdm-reservation' : '',
      meta.robots.some(value => ['noai', 'noimageai', 'notrain', 'noml'].includes(value)) ? 'Meta robots noai' : '',
      tdmrepJson ? 'tdmrep.json' : '',
    ].filter(Boolean).join(' + ')
    result.verdict = 'tdm-vorbehalt'
    return result
  }

  result.tdm = 'kein Vorbehalt'
  result.verdict = result.finalOrigin ? 'erlaubt (Ursprung prüfen)' : 'erlaubt'
  return result
}

async function runCheck() {
  const all = await readCandidates()
  const only = valueOf('--only')
  const brands = only ? all.filter(brand => only.split(',').includes(brand.key)) : all
  if (!brands.length) fail('Keine Marke gewählt (--only <schlüssel>,… prüft die Schreibweise)')
  console.log(`\nTROCKENLAUF · ${brands.length} Marken · höchstens ${CHECK_MAX_REQUESTS} Anfragen je Host`)
  console.log(`Absender: ${USER_AGENT}\n`)

  const rows = []
  for (const brand of brands) {
    const row = await checkBrand(brand)
    rows.push(row)
    console.log(`  ${pad(row.name, 24)} ${pad(row.verdict, 26)} ${row.requests} Anfrage(n)`)
  }

  console.log(`\n${pad('Marke', 24)} ${pad('robots (unser Agent)', 22)} ${pad('TDM', 16)} ${pad('sitemap', 20)} ${pad('llms.txt', 24)} Urteil`)
  console.log('─'.repeat(130))
  for (const row of rows) {
    console.log(`${pad(row.name, 24)} ${pad(row.robots, 22)} ${pad(row.tdm, 16)} ${pad(row.sitemap, 20)} ${pad(row.llms, 24)} ${row.verdict}`)
  }

  const allowed = rows.filter(row => row.verdict.startsWith('erlaubt'))
  console.log(`\n${allowed.length} von ${rows.length} Marken sind auswertbar.`)
  if (allowed.length < rows.length) {
    console.log('Die übrigen bleiben draussen — das ist das Produkt, nicht ein Fehler des Werkzeugs.')
  }

  // Die 90-Tage-Regel — WARNUNG, nicht Tor: `--check` bleibt grün, auch wenn
  // ein Eintrag überfällig ist (Begründung im Kopf dieser Datei).
  printLibraryAges(stichtag())

  const file = join(LIBRARY_DIR, `feasibility.${today()}.json`)
  await writeFile(file, `${JSON.stringify({
    checkedAt: new Date().toISOString(),
    userAgent: USER_AGENT,
    maxRequestsPerHost: CHECK_MAX_REQUESTS,
    note: 'Trockenlauf der Machbarkeit (MV1 M6). Kein Seiteninhalt gespeichert, keine Unterseite abgerufen. `llms.txt` bleibt ungeprüft, weil das Anfrage-Budget den rechtlichen Fragen gehört.',
    rows,
  }, null, 2)}\n`, 'utf8')
  console.log(`\nBericht: ${file}`)
  return rows
}

// ── Der Wächter der 90-Tage-Regel ───────────────────────────────────────────

/**
 * DAS ALTER DER AUSGELIEFERTEN EINTRÄGE.
 *
 * Gelesen wird die ROHE Liste (`MARKET_LIBRARY_ENTRIES`), nicht die
 * schema-geprüfte `marketLibrary()`. Zwei Gründe: die geprüfte Fassung ist
 * fail-closed und wäre bei einer kaputten Datei LEER — ausgerechnet der
 * Wächter schwiege dann —, und sie hängt an zod, das dieses Werkzeug nicht
 * laden kann (Kopf von `shared/marketLibraryAge.ts`). Ein Eintrag ohne
 * lesbares Prüfdatum gilt hier als überfällig, genau wie in der Regel.
 *
 * `--only` wirkt hier ABSICHTLICH nicht: die Auswahl gehört zur Frage „welche
 * Marke prüfe ich gerade?", das Alter der Bibliothek ist eine Frage an die
 * Bibliothek als Ganzes.
 */
function libraryAges(now) {
  return MARKET_LIBRARY_ENTRIES.map((entry) => {
    const age = marketLibraryEntryAge(entry, now)
    return {
      key: String(entry.key ?? '(ohne Schlüssel)'),
      name: String(entry.name ?? ''),
      verifiedAt: String(entry.verifiedAt ?? ''),
      age,
      stale: marketLibraryEntryIsStale(entry, now),
    }
  })
}

/**
 * DER STICHTAG — normalerweise jetzt, mit `--now 2027-01-01` ein anderer.
 *
 * Nicht Kosmetik, sondern die einzige Art, die WARNUNG selbst vorzuführen:
 * heute ist nichts überfällig, und ein Wächter, den man nie hat rot werden
 * sehen, ist ein Wächter auf Zuruf. Die Regel nimmt `now` ohnehin als
 * Parameter (`shared/marketLibraryAge.ts`); hier steht nur, wer ihn füllt.
 */
function stichtag() {
  const raw = valueOf('--now')
  if (!raw) return new Date()
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) fail(`--now ist kein Datum (${raw}) — erwartet JJJJ-MM-TT`)
  return parsed
}

/**
 * „vor 112 Tagen" / „heute" / „ohne lesbares Prüfdatum".
 *
 * GEZÄHLT WIRD IN UTC-TAGEN — anders als der Dateiname des Trockenlaufs
 * (`today()`, bewusst Ortsdatum). Ein Eintrag von „heute" kann hier deshalb am
 * späten Abend einer westlichen Zeitzone schon „vor 1 Tag" heissen. Das ist
 * gewollt: die Regel gilt gleich für Werkzeug, Route und Oberfläche, und dort
 * MUSS sie UTC sein (SSR und Browser stünden sonst an der Tagesgrenze auf zwei
 * Antworten). Bei einer Frist von 90 Tagen kostet der eine Tag nichts.
 */
function ageText(row) {
  if (row.age === null) return 'ohne lesbares Prüfdatum'
  if (row.age === 0) return 'heute geprüft'
  if (row.age < 0) return `Prüfdatum ${Math.abs(row.age)} Tag(e) in der ZUKUNFT`
  return `geprüft vor ${row.age} Tag(en)`
}

/**
 * DIE ANZEIGE FÜR `--check` — eine WARNUNG, kein Tor (Begründung im Kopf).
 * Gibt die überfälligen Zeilen zurück, damit `--stale` dieselbe Rechnung
 * benutzt und nicht eine zweite daneben.
 */
function printLibraryAges(now, { onlyStale = false } = {}) {
  const rows = libraryAges(now)
  console.log(`\nALTER DER BIBLIOTHEK (${MARKET_LIBRARY_VERSION}) · Regel: nichts älter als ${MARKET_LIBRARY_MAX_AGE_DAYS} Tage`)
  if (!rows.length) {
    console.log('  (keine Einträge)')
    return []
  }
  if (!onlyStale) {
    for (const row of rows) {
      const mark = row.stale ? '⚠' : '·'
      console.log(`  ${mark} ${pad(row.key, 24)} ${pad(row.verifiedAt || '—', 12)} ${ageText(row)}`)
    }
  }
  const stale = rows.filter(row => row.stale)
  if (stale.length) {
    console.log(`\n${stale.length} Eintrag/Einträge sind überfällig — neu rechnen und von Hand prüfen:`)
    for (const row of stale) {
      console.log(`  ⚠ ${row.key}: ${ageText(row)} — neu rechnen: --compute --only ${row.key}`)
    }
    console.log('  (Steht der Schlüssel nicht in candidates.json, gehört er zuerst dorthin.)')
    console.log('  Danach: Handprüfung (Runbook Schritt 4), --promote, Fassung steigt.')
  }
  else {
    console.log(`\nNichts überfällig (${rows.length} Eintrag/Einträge geprüft).`)
  }
  return stale
}

/**
 * MODUS `--stale`: derselbe Befund, aber als EXIT-CODE.
 *
 * Für eine geplante Aufgabe oder eine CI-Stufe, die keinen Menschen am
 * Terminal hat. Es gibt dafür heute noch keinen Zeitplan — den Wächter
 * einzurichten ist ein eigener Handgriff (docs/OPEN-ITEMS.md); dieses Werkzeug
 * ist die Stelle, an der er andocken kann, ohne dass jemand die Rechnung ein
 * zweites Mal schreibt.
 */
function runStale() {
  const stale = printLibraryAges(stichtag(), { onlyStale: true })
  if (stale.length) process.exit(1)
}

// ── Modus 2/3: rechnen ──────────────────────────────────────────────────────

/**
 * DIE KOSTENSCHÄTZUNG JE MARKE. Sie steht VOR dem Abbruch, damit die Zahl
 * auch dann zu sehen ist, wenn niemand die Erlaubnis erteilt hat — eine
 * Freigabe ohne Betrag wäre keine.
 */
function estimate(brandCount) {
  // Je Marke ein eigener Lauf ⇒ der Lauf-Deckel gilt je Marke.
  const charsPerBrand = Math.min(MARKET_MAX_PAGES * MARKET_MAX_CHARS_PER_PAGE, MARKET_MAX_CHARS_PER_RUN)
  const inputTokens = Math.round(charsPerBrand / CHARS_PER_TOKEN) + PROMPT_OVERHEAD_TOKENS
  const perBrand = (inputTokens / 1e6) * PRICE_INPUT_PER_MTOK + (COMPLETION_TOKENS / 1e6) * PRICE_OUTPUT_PER_MTOK
  return {
    charsPerBrand,
    inputTokens,
    outputTokens: COMPLETION_TOKENS,
    perBrandUsd: perBrand,
    totalUsd: perBrand * brandCount,
  }
}

function printEstimate(brandCount) {
  const cost = estimate(brandCount)
  console.log('\nKOSTENSCHÄTZUNG (Anzeige, keine Abrechnung)')
  console.log(`  Modell (Default der Extraktion):  anthropic/claude-haiku-4.5`)
  console.log(`  Preise (Stand 2026-09-05):        $${PRICE_INPUT_PER_MTOK}/M ein · $${PRICE_OUTPUT_PER_MTOK}/M aus`)
  console.log(`  Zeichen je Marke (Deckel):        ${cost.charsPerBrand.toLocaleString('de-DE')}`)
  console.log(`  Token je Marke:                   ~${cost.inputTokens.toLocaleString('de-DE')} ein · ~${cost.outputTokens.toLocaleString('de-DE')} aus`)
  console.log(`  Je Marke:                         ~$${cost.perBrandUsd.toFixed(3)}`)
  console.log(`  ${brandCount} Marken:${' '.repeat(Math.max(1, 34 - String(brandCount).length - 8))}~$${cost.totalUsd.toFixed(2)}`)
  console.log('  Ohne KI-Aussensicht (§7.5, Default LEER). Sie käme mit 2–3 weiteren Aufrufen je Marke dazu.')
}

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'

/**
 * Nitro hört auf `[::1]`, und Node's `fetch` verwirft einen eigenen
 * Host-Header (CLAUDE.md, „Beweise"). Deshalb node:http über ::1.
 */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolveCall, rejectCall) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolveCall({ status: res.statusCode, json, text })
      })
    })
    req.on('error', rejectCall)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * DIE DEMO-WEBSITES DES PLAYGROUNDS — dieselben, mit denen
 * `verify-market-fetch.mjs` arbeitet. `kona-trading` sperrt uns in seiner
 * robots.txt aus und ist deshalb ABSICHTLICH dabei: ein Stub-Lauf, der nur
 * gelingende Fälle kennt, bewiese nicht, dass das Werkzeug einen
 * ausgeschlossenen Kandidaten OHNE Entwurf lässt.
 */
const STUB_SITES = [
  { slug: 'upcountry-roast', key: 'demo-upcountry-roast', name: 'Upcountry Roast', category: 'Kaffeerösterei' },
  { slug: 'pacificbean', key: 'demo-pacificbean', name: 'Pacific Bean', category: 'Kaffeerösterei' },
  { slug: 'island-grind', key: 'demo-island-grind', name: 'Island Grind', category: 'Kaffeerösterei' },
  { slug: 'kona-trading', key: 'demo-kona-trading', name: 'Kona Trading', category: 'Grosshandel' },
]

const DEMO_ROOT = resolve(HERE, '../.playground/public/demo-sites')
const demoServers = []

/** EIN Server je Demo-Site — robots/sitemap/llms gelten je URSPRUNG. */
async function startDemoSite(slug) {
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
    const candidates = relative === '/' || relative === ''
      ? ['index.html']
      : [relative.slice(1), `${relative.slice(1)}.html`]
    for (const candidate of candidates) {
      try {
        const body = await readFile(join(DEMO_ROOT, slug, candidate))
        const type = candidate.endsWith('.xml')
          ? 'application/xml'
          : candidate.endsWith('.txt') || candidate.endsWith('.json')
            ? 'text/plain; charset=utf-8'
            : 'text/html; charset=utf-8'
        const text = candidate.endsWith('.xml')
          ? body.toString('utf8').replace(new RegExp(`https://${slug}\\.example`, 'g'), origin)
          : body
        res.writeHead(200, { 'content-type': type })
        res.end(text)
        return
      }
      catch { /* nächster Kandidat */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  await new Promise(listening => server.listen(0, '127.0.0.1', listening))
  origin = `http://127.0.0.1:${server.address().port}`
  demoServers.push(server)
  return origin
}

/**
 * EIN MARKTPROFIL WIRD ZU EINEM ENTWURF.
 *
 * Übernommen wird NUR, was einen Beleg trägt: die Bibliothek verlangt je Feld
 * eine Quell-Adresse, und ein Feld ohne Beleg wäre genau die
 * unbelegte Zusammenfassung, die §1.4 dem Produkt verbietet. `source` fällt
 * weg — `marketLibraryFields()` setzt `source: 'library'` beim Lesen selbst.
 *
 * `frequency` REIST SEIT M6b MIT (§7.6). Sie ist eine MESSUNG dieses Laufs
 * („auf 2 von 3 gelesenen Seiten"), und sie hier wegzuwerfen hiess, eine
 * bereits gezählte Zahl zu verlieren, die die Oberfläche in jeder anderen
 * Quelle zeigt. Die Handprüfung sieht sie damit ebenfalls — sie gehört zu dem,
 * was ein Mensch beglaubigt. Was das Werkzeug NICHT tut: sie erfinden. Ein
 * Feld ohne gemessene Häufigkeit bekommt keine.
 */
function toDraft(brand, profile, mode) {
  const fields = []
  for (const field of profile.fields ?? []) {
    if (!field.value || !field.evidence?.sourceUrl) continue
    const draftField = {
      fieldId: field.fieldId,
      value: field.value,
      sourceUrl: field.evidence.sourceUrl,
      confidence: field.evidence.confidence ?? 'stated',
    }
    if (field.items?.length) draftField.items = field.items
    if (field.evidence.quote) draftField.quote = field.evidence.quote
    // Nur wenn wirklich gezählt wurde — `of: 0` hiesse „keine Seite gelesen"
    // und wäre keine Messung, sondern eine Null in einer Zelle.
    if (field.frequency && Number(field.frequency.of) > 0) {
      draftField.frequency = { pages: Number(field.frequency.pages), of: Number(field.frequency.of) }
    }
    fields.push(draftField)
  }
  return {
    key: brand.key,
    status: 'draft',
    name: brand.name,
    homepage: brand.homepage,
    category: brand.category ?? '',
    verifiedAt: null,
    verifiedBy: null,
    fields,
    computed: {
      at: new Date().toISOString(),
      mode,
      tool: 'packages/market/scripts/market-library-compute.mjs',
      pages: [...new Set(fields.map(field => field.sourceUrl))].slice(0, MARKET_MAX_PAGES),
    },
  }
}

async function runCompute({ stub }) {
  const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
  const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
  const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
  const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    fail('Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  }

  // Die Kandidaten dieses Laufs.
  let brands
  if (stub) {
    brands = []
    for (const site of STUB_SITES) {
      const origin = await startDemoSite(site.slug)
      brands.push({ key: site.key, name: site.name, category: site.category, homepage: `${origin}/` })
    }
  }
  else {
    const all = await readCandidates()
    const only = valueOf('--only')
    brands = only ? all.filter(brand => only.split(',').includes(brand.key)) : all
    if (!brands.length) fail('Keine Marke gewählt (--only <schlüssel>,… prüft die Schreibweise)')

    printEstimate(brands.length)
    if (process.env.MARKET_LIBRARY_ALLOW_PAID !== '1') {
      console.log('\n✗ ABGEBROCHEN — ein echter Lauf kostet Geld und braucht ein ausdrückliches Ja.')
      console.log('  Wiederholen mit: MARKET_LIBRARY_ALLOW_PAID=1 …')
      console.log('  Davids Freigabe steht noch aus (Plan §5, M6).')
      process.exit(2)
    }
  }

  const { Client, ID, TablesDB, Users } = await import('node-appwrite')
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  const tablesDB = new TablesDB(client)
  const users = new Users(client)
  const cleanup = { users: [], profiles: [], access: [] }
  const drafts = []
  const skipped = []

  try {
    const stamp = Date.now()
    const user = await users.create({
      userId: ID.unique(),
      email: `mv1-m6-${stamp}@example.test`,
      password: `Pw-${ID.unique()}`,
      name: 'MV1-M6-Bibliothek',
    })
    cleanup.users.push(user.$id)
    await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
    const access = await tablesDB.createRow({
      databaseId,
      tableId: 'brand_access',
      rowId: ID.unique(),
      data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
    })
    cleanup.access.push(access.$id)
    const session = await users.createSession({ userId: user.$id })
    const cookie = `a_session_${projectId}=${encodeURIComponent(session.secret)}`

    // FÜNF KANDIDATEN JE BRANDING (`MARKET_COMPETITORS_MAX`) — die Grenze ist
    // die des Produkts, und ein Werkzeug, das sie umginge, liefe an einer
    // Zusage vorbei, die für Kunden gilt.
    for (let start = 0; start < brands.length; start += MARKET_COMPETITORS_MAX) {
      const group = brands.slice(start, start + MARKET_COMPETITORS_MAX)
      const created = await call('/api/brand/profiles', {
        method: 'POST',
        cookie,
        body: {
          title: `Bibliothek ${start / MARKET_COMPETITORS_MAX + 1}`,
          contentLocale: 'de',
          pathKind: 'new',
          hasName: true,
          team: 'solo',
          industry: 'Redaktion',
          about: 'Wegwerf-Branding des Bibliotheks-Werkzeugs.',
          audience: 'Niemand — dieses Branding wird nach dem Lauf gelöscht.',
        },
      })
      const profileId = created.json?.profile?.id ?? created.json?.id
      if (!profileId) fail(`Kein Branding angelegt (${created.status}): ${created.text.slice(0, 200)}`)
      cleanup.profiles.push(profileId)
      // Kapitel B abnehmen — das Werkzeug führt keinen Wizard.
      await tablesDB.updateRow({
        databaseId, tableId: 'brand_steps', rowId: `${profileId}_pvm`, data: { state: 'done' },
      })

      const base = `/api/market/profiles/${profileId}`
      const byCompetitor = new Map()
      for (const brand of group) {
        const added = await call(`${base}/competitors`, {
          method: 'POST', cookie, body: { name: brand.name, url: brand.homepage },
        })
        if (added.status !== 200) {
          skipped.push({ key: brand.key, reason: `competitors ${added.status} ${added.json?.reason ?? ''}` })
          continue
        }
        byCompetitor.set(added.json.competitor.id, brand)
      }

      console.log(`\nLauf über ${byCompetitor.size} Marke(n) …`)
      const run = await call(`${base}/run`, { method: 'POST', cookie })
      if (run.status !== 200) fail(`Lauf abgelehnt (${run.status} ${run.json?.reason ?? ''})`)
      console.log(`  extrahiert: ${run.json.extracted} · wiederverwendet: ${run.json.reused}`)

      const overview = await call(base, { cookie })
      if (overview.status !== 200) fail(`Stand nicht lesbar (${overview.status})`)

      for (const competitor of overview.json.competitors ?? []) {
        const brand = byCompetitor.get(competitor.id)
        if (!brand) continue
        if (competitor.status !== 'fetched') {
          skipped.push({ key: brand.key, reason: `${competitor.status}${competitor.excludedReason ? `/${competitor.excludedReason}` : ''}` })
          continue
        }
        const profile = (overview.json.profiles ?? []).find(row => row.competitorId === competitor.id)
        if (!profile) {
          skipped.push({ key: brand.key, reason: 'kein Marktprofil' })
          continue
        }
        const draft = toDraft(brand, profile, stub ? 'stub' : 'paid')
        if (!draft.fields.length) {
          skipped.push({ key: brand.key, reason: 'kein belegtes Feld' })
          continue
        }
        drafts.push(draft)
      }
    }

    await mkdir(DRAFTS_DIR, { recursive: true })
    for (const draft of drafts) {
      await writeFile(join(DRAFTS_DIR, `${draft.key}.json`), `${JSON.stringify(draft, null, 2)}\n`, 'utf8')
    }

    console.log(`\n${drafts.length} Entwurf/Entwürfe geschrieben nach shared/library/drafts/:`)
    for (const draft of drafts) console.log(`  ✔ ${draft.key} — ${draft.fields.length} belegte Felder`)
    if (skipped.length) {
      console.log(`\n${skipped.length} Marke(n) ohne Entwurf — das ist der Riegel, nicht ein Fehler:`)
      for (const entry of skipped) console.log(`  – ${entry.key}: ${entry.reason}`)
    }
    console.log('\nAlle Entwürfe tragen status: "draft" und fallen durch das Bibliotheks-Schema.')
    console.log('Weiter im Runbook: docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md')
  }
  finally {
    // Das Wegwerf-Konto ist wegzuwerfen. Die Kaskade des brand-Layers räumt
    // die market-Zeilen mit dem Branding weg (`server/plugins/brand-cascade.ts`).
    for (const id of cleanup.profiles) {
      try { await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }) }
      catch { /* schon weg */ }
    }
    for (const id of cleanup.access) {
      try { await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }) }
      catch { /* schon weg */ }
    }
    for (const id of cleanup.users) {
      try { await users.delete({ userId: id }) }
      catch { /* schon weg */ }
    }
    for (const server of demoServers) {
      server.closeAllConnections?.()
      server.close()
    }
  }
}

// ── Modus 4: übernehmen ─────────────────────────────────────────────────────

/**
 * EIN JAVASCRIPT-LITERAL AUS EINEM ENTWURF.
 *
 * Von Hand und nicht per `JSON.stringify` + Ersetzungen: ein Zitat mit einem
 * Apostroph (`We're`) hätte die Datei sonst zerrissen, und zwar erst beim
 * nächsten Build. Wer fremde Zitate in Quelltext schreibt, muss sie
 * maskieren — das ist keine Kosmetik.
 */
function toTsLiteral(value, depth) {
  const pad0 = '  '.repeat(depth)
  const pad1 = '  '.repeat(depth + 1)
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const items = value.map(item => `${pad1}${toTsLiteral(item, depth + 1)}`)
    return `[\n${items.join(',\n')},\n${pad0}]`
  }
  const lines = Object.entries(value).map(([key, item]) => `${pad1}${key}: ${toTsLiteral(item, depth + 1)}`)
  return `{\n${lines.join(',\n')},\n${pad0}}`
}

/**
 * DIE FASSUNG HEBEN — seit M6b MASCHINELL, nicht mehr als Merkzettel.
 *
 * `MARKET_LIBRARY_VERSION` geht in `market_reports.revisionKey` ein: wer einen
 * Eintrag ändert und die Zahl stehen lässt, hinterlässt gespeicherte Berichte,
 * die sich für aktuell halten, obwohl sich ihre Grundlage bewegt hat. Bis M6b
 * druckte das Werkzeug dazu eine ERINNERUNG — und eine Erinnerung ist genau
 * die Sorte Sicherung, die beim ersten echten Durchgang vergessen wird (der
 * erste war der 2026-09-06). Sicherungen gehören in die Schnittstelle, nicht
 * in die Disziplin (dieselbe Lehre wie bei `createIndexSteps`, CLAUDE.md).
 *
 * Kann die Zahl nicht gelesen werden, bricht die Übernahme ab, statt still
 * weiterzulaufen: eine unlesbare Fassung ist ein Fall für einen Menschen.
 *
 * WER MEHRERE EINTRÄGE IN EINEM COMMIT übernimmt, hebt sie damit mehrfach.
 * Das ist nicht falsch (jede Übernahme IST eine inhaltliche Änderung), aber
 * unnötig — am Ende genügt EINE Fassung je Commit; sie darf von Hand wieder
 * zusammengezogen werden, solange sie höher ist als die vorherige.
 */
function bumpLibraryVersion(source) {
  const pattern = /(export const MARKET_LIBRARY_VERSION = ')([^']*)(')/
  const found = source.match(pattern)
  if (!found) fail('MARKET_LIBRARY_VERSION steht nicht in index.ts — bitte von Hand heben')
  const [, , current] = found
  const parts = current.match(/^(.*?)(\d+)$/)
  if (!parts) {
    fail(`MARKET_LIBRARY_VERSION ist '${current}' und endet nicht auf einer Zahl — bitte von Hand heben`)
  }
  const next = `${parts[1]}${Number(parts[2]) + 1}`
  return { source: source.replace(pattern, `$1${next}$3`), from: current, to: next }
}

/**
 * EINEN GEPRÜFTEN ENTWURF IN DIE BIBLIOTHEK SCHREIBEN.
 *
 * ── DAS TOR IST DIE HANDPRÜFUNG, NICHT DIE MECHANIK ──────────────────────
 * Das Werkzeug verlangt, dass im Entwurf `status: 'verified'`, `verifiedAt`
 * und `verifiedBy` STEHEN — gesetzt von dem Menschen, der die Zitate gegen
 * die Quelle gehalten hat (Runbook). Es setzt sie NICHT selbst; genau darum
 * gibt es das Feld.
 *
 * ── GEPRÜFT WIRD MIT DEM EINEN SCHEMA, NICHT MIT EINER KOPIE ─────────────
 * Nach dem Schreiben läuft `vitest run tests/marketLibrary.test.ts` — der
 * Test, der die ausgelieferte Datei ohnehin gegen `marketLibrarySchema` hält.
 * Fällt er, wird die Datei ZURÜCKGESETZT. Eine zweite Prüfung in JavaScript
 * daneben wäre ein zweites Schema, das beim nächsten Feld auseinanderläuft —
 * und ausgerechnet hier ist das Schema die Zusage.
 */
async function runPromote(key) {
  if (!key) fail('--promote braucht einen Schlüssel (z. B. --promote adidas)')
  const file = join(DRAFTS_DIR, `${key}.json`)
  let draft
  try { draft = JSON.parse(await readFile(file, 'utf8')) }
  catch { fail(`Kein Entwurf unter ${file}`) }

  if (draft.status !== 'verified') {
    fail(`Entwurf ${key} steht auf status: "${draft.status}". Erst die Handprüfung (Runbook), dann übernehmen.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.verifiedAt ?? ''))) fail(`verifiedAt fehlt oder ist kein Datum (${key})`)
  if (String(draft.verifiedBy ?? '').trim().length < 2) fail(`verifiedBy fehlt (${key})`)

  const before = await readFile(INDEX_FILE, 'utf8')
  if (before.includes(`key: '${draft.key}'`)) fail(`${draft.key} steht schon in index.ts — erst dort entfernen`)

  // `computed` bleibt draussen: in der Bibliothek steht, wer GEPRÜFT hat,
  // nicht wer gerechnet hat.
  const entry = { ...draft }
  delete entry.computed
  const literal = toTsLiteral(entry, 1)
  // KEIN führendes Komma: der letzte Eintrag der Liste trägt schon eines
  // (Trailing-Comma-Stil des Repos). Ein zweites erzeugte ein LOCH im Array —
  // die Bibliothek fiele fail-closed auf leer zurück, und zwar lautlos
  // (2026-09-05 beim Bau genau so erwischt, gefunden vom Schema-Test).
  const withEntry = before.replace(/\n\]\n?$/, `\n${literal},\n]\n`)
  if (withEntry === before) fail('index.ts endet nicht auf einer Liste — bitte von Hand übernehmen')
  const bumped = bumpLibraryVersion(withEntry)
  await writeFile(INDEX_FILE, bumped.source, 'utf8')

  console.log(`\n${draft.key} nach index.ts geschrieben, Fassung ${bumped.from} → ${bumped.to}. Prüfe das Schema …`)
  const test = spawnSync('npx', ['vitest', 'run', 'tests/marketLibrary.test.ts'], {
    cwd: resolve(HERE, '..'), stdio: 'inherit', shell: false,
  })
  if (test.error || test.status !== 0) {
    await writeFile(INDEX_FILE, before, 'utf8')
    fail('Das Schema hat den Eintrag abgelehnt — index.ts ist zurückgesetzt.')
  }
  console.log(`\n✔ Übernommen, Fassung steht auf ${bumped.to}. Entwurf aus drafts/ löschen und committen (Runbook Schritt 5).`)
}

// ── Einstieg ────────────────────────────────────────────────────────────────

async function listDrafts() {
  try { return (await readdir(DRAFTS_DIR)).filter(name => name.endsWith('.json')) }
  catch { return [] }
}

if (has('--check')) {
  await runCheck()
}
else if (has('--stale')) {
  runStale()
}
else if (has('--compute')) {
  await runCompute({ stub: has('--stub') })
}
else if (has('--promote')) {
  await runPromote(valueOf('--promote'))
}
else {
  const drafts = await listDrafts()
  console.log(`
DAS WERKZEUG DER KURATIERTEN BIBLIOTHEK (MV1 M6)

  --check [--only a,b]    Machbarkeit je Marke (Trockenlauf, ≤ ${CHECK_MAX_REQUESTS} Anfragen je Host)
                          + Alter der Bibliothek (Warnung, bleibt grün)
  --stale [--now TT]      Nur die überfälligen Einträge (> ${MARKET_LIBRARY_MAX_AGE_DAYS} Tage), Exit 1 wenn welche
  --compute --stub        Rechnen gegen die Demo-Websites, ohne bezahlten Aufruf
  --compute [--only a,b]  Echter Lauf — braucht MARKET_LIBRARY_ALLOW_PAID=1
  --promote <schlüssel>   Geprüften Entwurf nach shared/library/index.ts übernehmen

  Entwürfe zurzeit: ${drafts.length ? drafts.join(', ') : '(keine)'}
  Runbook: docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md
`)
}
