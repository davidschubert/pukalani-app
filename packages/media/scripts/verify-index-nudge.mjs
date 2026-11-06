/**
 * F19-Beweis am lebenden Appwrite: überlebt `indexStep` mit `tableCacheNudge`
 * einen VERGIFTETEN Metadaten-Cache?
 *
 * Das Rennen selbst ist lokal kaum zu treffen (Fenster im Millisekundenbereich
 * auf einer unbelasteten Maschine). Der vergiftete ZUSTAND lässt sich aber
 * exakt herstellen: der Cache-Eintrag des Collection-Dokuments wird in Redis
 * auf 'processing' zurückgedreht — genau das, was ein Leser im Fenster nach dem
 * purge zurückschreibt. Aus diesem Zustand führt kein Wiederhol-Vorrat heraus;
 * der Anstoß muss es tun.
 *
 * GEGENPROBE eingebaut: derselbe Ablauf OHNE Anstoß muss scheitern. Ohne sie
 * wäre der Beweis wertlos — er wäre auch dann grün, wenn der Anstoß gar nichts
 * bewirkt oder die Vergiftung nicht greift.
 *
 * SEIT APPWRITE 2.4 (#14104, 2026-10-24 gegen 2.6.1 bewiesen) ist das Rennen
 * UPSTREAM geschlossen: steht die Spalte im gecachten Collection-Dokument
 * nicht auf 'available', liest der Index-Endpunkt das Attribut-Dokument selbst
 * nach („the attribute document itself is authoritative"). Die Gegenprobe
 * dreht sich dort um: der vergiftete Cache darf den Index NICHT mehr
 * aufhalten — ginge er wieder nicht durch, wäre das eine Regression upstream,
 * und genau die soll hier auffallen. Der Anstoß bleibt (Gürtel UND
 * Hosenträger für ältere Instanzen) und darf weiterhin nichts verstellen.
 *
 * Braucht die lokale Docker-Appwrite: die Vergiftung läuft als PHP IM
 * Appwrite-API-Container (`docker exec`), weil Appwrite seit 2.3 igbinary in
 * Redis schreibt — nur dort gibt es den Codec, und der Container kennt die
 * Redis-Verbindung (`_APP_REDIS_*`). JSON-Einträge werden weiterhin
 * verstanden. Container per APPWRITE_API_CONTAINER (Default
 * `appwrite`; in der CI `docker compose ps -q appwrite`).
 *
 *   node --env-file=apps/comments/.env packages/media/scripts/verify-index-nudge.mjs
 */
import { execFileSync } from 'node:child_process'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../scripts/migrations-lib/indexRetry.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
const apiContainer = process.env.APPWRITE_API_CONTAINER || 'appwrite'

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — über --env-file aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
/** Appwrite ≥ 2.4 prüft den Live-Status des Attributs nach (#14104). */
async function liestLiveStatusNach() {
  const { version } = await (await fetch(`${endpoint}/health/version`)).json()
  const [major, minor] = String(version).split('.').map(Number)
  return { version, nach: major > 2 || (major === 2 && minor >= 4) }
}
const { indexStep } = createIndexSteps(tablesDB, databaseId)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function warteAufSpalte(tableId, key) {
  for (let i = 0; i < 40; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId, queries: [Query.limit(200)] })
    if (columns.find(c => c.key === key)?.status === 'available') return true
    await sleep(200)
  }
  return false
}

/**
 * Dreht die Spalte im gecachten Collection-Dokument auf 'processing' zurück.
 *
 * Läuft als PHP im API-Container (Skript über stdin, Argumente hinter `--`).
 * ALLE Treffer prüfen, nicht den ersten (2026-09-08, zweimal in der CI rot
 * seit der Wegwerf-Appwrite auf 2.0.0): seit 2.0 liegen je Tabelle MEHRERE
 * Cache-Einträge unter `*collection*<tableId>*`, und nicht jeder trägt die
 * Spaltenliste — welcher zuerst kommt, entscheidet der SCAN-Zufall. Appwrite
 * 2.0 nennt die Liste im Cache-Dokument teils `columns` — beides gilt.
 * 2026-10-24 in der CI rot (2.6.1, „Vergiftung wirkt nicht"): seit 2.3
 * schreibt Appwrites App-Cache igbinary statt JSON und packt das Dokument in
 * einen Umschlag (`data.document` neben `collectionEpoch`/`field`); die
 * Metadaten der Datenbank-Bibliothek liegen weiter als JSON daneben. Codec
 * und Umschlag werden je Feld erkannt und beim Zurückschreiben beibehalten;
 * die Spalte darf `key` oder `$id` heißen.
 */
const PHP_VERGIFTE = String.raw`<?php
[, $tableId, $spalte] = $argv;
$r = new Redis();
$r->connect(getenv('_APP_REDIS_HOST') ?: 'redis', (int) (getenv('_APP_REDIS_PORT') ?: 6379));
$pass = (string) getenv('_APP_REDIS_PASS');
if ($pass !== '') { $user = (string) getenv('_APP_REDIS_USER'); $r->auth($user !== '' ? [$user, $pass] : $pass); }
$r->setOption(Redis::OPT_SCAN, Redis::SCAN_RETRY);
$it = null;
while ($keys = $r->scan($it, "*collection*{$tableId}*", 200)) {
  foreach ($keys as $key) {
    foreach ($r->hGetAll($key) as $feld => $raw) {
      $codec = 'igbinary';
      $eintrag = @igbinary_unserialize($raw);
      if (!is_array($eintrag)) { $codec = 'json'; $eintrag = json_decode($raw, true); }
      if (!is_array($eintrag)) continue;
      // Seit 2.3 liegt das Dokument unter data.document (Umschlag mit
      // collectionEpoch/field), davor direkt unter data — beides gilt.
      $innen = isset($eintrag['data']['document']) && is_array($eintrag['data']['document']);
      $doc = $innen ? $eintrag['data']['document'] : $eintrag['data'];
      $liste = $doc['attributes'] ?? $doc['columns'] ?? null;
      if (!is_array($liste)) continue;
      $pfad = isset($doc['attributes']) ? 'attributes' : 'columns';
      $getroffen = false;
      foreach ($liste as $i => $a) {
        if (($a['key'] ?? $a['$id'] ?? null) === $spalte) { $liste[$i]['status'] = 'processing'; $getroffen = true; }
      }
      if (!$getroffen) continue;
      if ($innen) { $eintrag['data']['document'][$pfad] = $liste; } else { $eintrag['data'][$pfad] = $liste; }
      $r->hSet($key, $feld, $codec === 'igbinary' ? igbinary_serialize($eintrag) : json_encode($eintrag));
      echo "vergiftet ($codec) $key/$feld\n";
      exit(0);
    }
  }
}
echo "kein Cache-Eintrag mit Spalte $spalte\n";
exit(1);
`

function vergifte(tableId, spalte) {
  try {
    const out = execFileSync('docker', ['exec', '-i', apiContainer, 'php', '--', tableId, spalte],
      { input: PHP_VERGIFTE, encoding: 'utf8' }).trim()
    console.log(`    (${out})`)
    return out.startsWith('vergiftet')
  }
  catch (error) {
    console.log(`    (${(error.stdout || error.message || '').toString().trim()})`)
    return false
  }
}

const tableId = `f19_nudge_${Date.now().toString(36)}`

try {
  const { version, nach } = await liestLiveStatusNach()
  console.log(`\nF19 — Index-Anstoß gegen ${endpoint} (Appwrite ${version}${nach ? ', prüft Live-Status nach' : ''})\nWegwerf-Tabelle ${tableId}\n`)
  await tablesDB.createTable({ databaseId, tableId, name: 'F19 Anstoß-Beweis', rowSecurity: true })

  console.log(nach
    ? '1. Gegenprobe: OHNE Anstoß darf der vergiftete Cache den Index NICHT mehr aufhalten (≥ 2.4)'
    : '1. Gegenprobe: OHNE Anstoß muss es scheitern')
  await tablesDB.createVarcharColumn({ databaseId, tableId, key: 'ohne', size: 36, required: false, xdefault: '' })
  check('Spalte "ohne" verfügbar', await warteAufSpalte(tableId, 'ohne'))
  await tablesDB.getTable({ databaseId, tableId })
  check('Cache vergiftet', vergifte(tableId, 'ohne'))
  // Der Anstoß lässt sich seit der Fabrik nicht mehr WEGLASSEN. Für die
  // Gegenprobe wird das ALTE Verhalten deshalb von Hand nachgestellt: NUR
  // warten, nie schreiben — genau das taten die 61 Migrationen ohne Anstoß.
  // Kurzer Vorrat genügt: aus dem vergifteten Zustand führt keiner heraus (in
  // der CI liefen 23 Versuche über 2,5 min ins Leere).
  let ohneFehler = null
  for (let versuch = 1; versuch <= 8; versuch++) {
    try {
      await tablesDB.createIndex({
        databaseId, tableId, key: 'idx_ohne', type: TablesDBIndexType.Key, columns: ['ohne'],
      })
      ohneFehler = null
      break
    }
    catch (error) {
      ohneFehler = error
      console.log(`… ohne Anstoß: Versuch ${versuch}/8 — ${error?.type ?? error?.message}`)
      await sleep(2000)
    }
  }
  if (nach) {
    check('ohne Anstoß: Index kommt trotz vergiftetem Cache durch (Live-Status, #14104)', ohneFehler === null,
      ohneFehler ? `${ohneFehler?.type ?? ohneFehler?.message} — Regression upstream?` : '')
  }
  else {
    check('ohne Anstoß: Index scheitert (Vorrat läuft leer)', ohneFehler !== null,
      ohneFehler ? '' : 'ging unerwartet durch — Vergiftung wirkt nicht?')
  }

  console.log('\n2. MIT Anstoß muss derselbe Zustand überlebt werden')
  await tablesDB.createVarcharColumn({ databaseId, tableId, key: 'mit', size: 36, required: false, xdefault: '' })
  check('Spalte "mit" verfügbar', await warteAufSpalte(tableId, 'mit'))
  await tablesDB.getTable({ databaseId, tableId })
  check('Cache vergiftet', vergifte(tableId, 'mit'))

  const start = Date.now()
  let mitOk = true
  try {
    await indexStep(`Index ${tableId}.idx_mit`, {
      tableId, key: 'idx_mit', type: TablesDBIndexType.Key, columns: ['mit'],
    })
  }
  catch (error) { mitOk = false; console.log(`    (${error?.message})`) }
  const dauer = ((Date.now() - start) / 1000).toFixed(1)
  check(`mit Anstoß: Index kommt durch (${dauer}s)`, mitOk)

  const { indexes } = await tablesDB.listIndexes({ databaseId, tableId })
  check('Index steht wirklich in der Tabelle', indexes.some(i => i.key === 'idx_mit'),
    indexes.map(i => i.key).join(',') || '(keiner)')

  console.log('\n3. Der Anstoß darf nichts verstellen')
  const danach = await tablesDB.getTable({ databaseId, tableId })
  check('rowSecurity ist noch an', danach.rowSecurity === true, String(danach.rowSecurity))
  check('Tabelle ist noch aktiviert', danach.enabled === true, String(danach.enabled))
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error?.message ?? error}`)
}
finally {
  await tablesDB.deleteTable({ databaseId, tableId }).catch(() => {})
  console.log(`\nWegwerf-Tabelle entfernt.\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
