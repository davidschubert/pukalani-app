/**
 * Wächter gegen ÖFFENTLICHE IPv4-ADRESSEN im Repo (SEC-011).
 *
 * Warum es das gibt: dieses Repo ist öffentlich. Eine Internet-Adresse, die zu
 * einem Menschen oder zu einem Dritten gehört, ist ein personenbezogenes Datum
 * — und sie rutscht leicht hinein, wenn ein Beweis wörtlich aus einem Log in
 * die Doku wandert. Weder Typecheck noch Lint noch Tests sehen das.
 *
 * Die Regel: in Doku, Tests und Beispielen stehen Adressen aus den
 * DOKUMENTATIONS-BEREICHEN (203.0.113.0/24, 198.51.100.0/24, 192.0.2.0/24).
 * Jede andere öffentliche IPv4 braucht einen Eintrag in ALLOWED — mit Grund.
 * Reservierte Bereiche (privat, Loopback, Link-Local, CGNAT, Multicast,
 * Dokumentation) sind immer erlaubt.
 *
 * Geprüft werden die versionierten Dateien UND die noch nicht versionierten,
 * nicht ignorierten — damit der Wächter lokal schon VOR dem ersten `git add`
 * anschlägt.
 *
 *   node scripts/check-public-ips.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Öffentliche Adressen, die hier stehen DÜRFEN — jede mit Grund. */
const ALLOWED = new Map([
  // Eigene Server: stehen gewollt in Runbooks und Kundenanleitungen (DNS-Ziel).
  ['49.13.211.173', 'app-prod — DNS-Ziel in Kundenanleitungen und Runbooks'],
  ['188.245.61.155', 'appwrite-prod — Runbooks'],
  // Öffentliche Infrastruktur, die jeder kennt.
  ['8.8.8.8', 'öffentlicher DNS-Resolver (Beispiel in Tests und Prüfskripten)'],
  ['1.1.1.1', 'öffentlicher DNS-Resolver (Beispiel in Tests)'],
  ['9.9.9.9', 'öffentlicher DNS-Resolver (zweite Adresse im Standort-Prüfskript)'],
  ['93.184.216.34', 'frühere Adresse von example.com (Test-Stellvertreter)'],
  ['147.185.161.77', 'öffentlich dokumentiertes DNS-Ziel eines Wettbewerbers (Archiv-Benchmark)'],
  // Grenzwerte in Tests der Adress-Prüfung: bewusst knapp NEBEN einem
  // reservierten Bereich oder erkennbar erfunden.
  ['1.2.3.4', 'erfundene Beispiel-Adresse in Tests'],
  ['2.2.2.2', 'erfundene Beispiel-Adresse in Tests'],
  ['3.3.3.3', 'erfundene Beispiel-Adresse in Tests'],
  ['9.9.9.1', 'erfundene Beispiel-Adresse in Tests'],
  ['9.9.9.2', 'erfundene Beispiel-Adresse in Tests'],
  ['9.9.9.3', 'erfundene Beispiel-Adresse in Tests'],
  ['100.63.255.255', 'Grenzwert unter dem CGNAT-Bereich (Test der Adress-Prüfung)'],
  ['100.128.0.1', 'Grenzwert über dem CGNAT-Bereich (Test der Adress-Prüfung)'],
  ['172.15.255.255', 'Grenzwert unter dem privaten Bereich (Test der Adress-Prüfung)'],
  ['172.32.0.1', 'Grenzwert über dem privaten Bereich (Test der Adress-Prüfung)'],
])

/** Dateien, die nicht geprüft werden (erzeugt, keine Prosa, keine Beweise). */
const SKIP_FILES = new Set(['pnpm-lock.yaml'])

/** Endungen, die in diesem Repo Text sind — nur sie werden geprüft. */
const TEXT_EXTENSIONS = new Set([
  'ts', 'mts', 'cts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'vue',
  'json', 'jsonc', 'json5', 'md', 'mdc', 'yml', 'yaml', 'css', 'scss',
  'html', 'sh', 'toml', 'txt', 'svg', 'xml', 'conf', 'example',
])

/**
 * Vier Zahlen mit Punkten, NICHT als Teil einer längeren Zahlenkette (eine
 * fünfstellige Versionsnummer `1.2.3.4.5` ist keine Adresse) und nicht direkt
 * hinter einem Buchstaben oder Bindestrich (`v1.2.3.4`, `chrome-1.2.3.4`).
 */
const IPV4 = /(?<![\w.-])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w.-]|\.\d)/g

/** Reservierte Bereiche — nie eine Adresse eines Menschen oder Dritten. */
function isReserved([a, b, c]) {
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

function gitList(args) {
  const out = execFileSync('git', ['ls-files', '-z', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\u0000').filter(Boolean)
}

function isChecked(path) {
  if (SKIP_FILES.has(path)) return false
  return TEXT_EXTENSIONS.has(extname(path).slice(1).toLowerCase())
}

const files = [...new Set([...gitList([]), ...gitList(['--others', '--exclude-standard'])])].filter(isChecked)

const findings = []
for (const file of files) {
  const abs = join(ROOT, file)
  if (!existsSync(abs) || !statSync(abs).isFile()) continue
  const lines = readFileSync(abs, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(IPV4)) {
      const octets = match.slice(1, 5).map(Number)
      if (octets.some(octet => octet > 255)) continue
      // Führende Nullen: keine gewöhnliche Schreibweise einer Adresse (meist Versionen).
      if (match.slice(1, 5).some(part => part.length > 1 && part.startsWith('0'))) continue
      if (isReserved(octets) || ALLOWED.has(match[0])) continue
      findings.push({ file, line: index + 1, address: match[0] })
    }
  })
}

if (findings.length > 0) {
  console.error(`✗ check:public-ips — ${findings.length} öffentliche IPv4-Adresse(n) ohne Erlaubnis:\n`)
  for (const finding of findings) console.error(`  ${finding.file}:${finding.line}  ${finding.address}`)
  console.error('\nDas Repo ist öffentlich. Ersetze die Adresse durch eine aus dem Dokumentations-Bereich')
  console.error('(203.0.113.x, 198.51.100.x, 192.0.2.x). Nur wenn sie wirklich hier stehen muss')
  console.error('(eigener Server, öffentliche Infrastruktur): Eintrag mit Grund in ALLOWED,')
  console.error('scripts/check-public-ips.mjs.')
  process.exit(1)
}

console.log(`✓ check:public-ips — ${files.length} Dateien geprüft, keine öffentliche IPv4 außerhalb der Erlaubnisliste.`)
