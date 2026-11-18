import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { decrypt, HAS_GPG, makeKey, stopAgent, type ThrowawayKey } from './support/throwawayGpg'

/**
 * OPS-001 (2026-11-15): das nächtliche Backup der Appwrite-Instanz
 * (`ops/appwrite-backup.sh`) und das Wort `backup-status` im Tor-Skript.
 *
 * Der eigentliche Beweis läuft mit echtem docker, echter MariaDB und echtem
 * gpg in `ops/appwrite-backup-attrappe.sh` (von Hand, nach jeder Änderung an
 * den Skripten). Hier steht das Netz, das in JEDEM Testlauf mitläuft — ohne
 * docker und ohne gpg, mit Stellvertretern für beide:
 *
 *   bin/docker   antwortet wie `docker compose config|ps|exec`, `volume
 *                inspect` und `run … tar` für einen kleinen Stack
 *   bin/gpg      „verschlüsselt" durch Kopieren mit Kopfzeile und nennt als
 *                Fingerabdruck den Inhalt der Schlüssel-Datei
 *   bin/rsync    schreibt seine Schalter mit und ruft das echte rsync
 *   bin/ssh      scheitert immer (die Ablage außer Haus ist „nicht erreichbar")
 *
 * Geprüft werden die Zusagen, die still brechen würden: nichts wird im
 * Klartext abgelegt, ein Fehler gleicht nichts ab und lässt Früheres liegen,
 * kein `--delete` am Abgleich, die Aufbewahrung hält Unter- und Obergrenze.
 */
// Jeder Test startet das Skript ein- bis dreimal als eigenen Prozess (je rund
// eine Sekunde, dazu eine Sekunde Abstand, weil der Name eines Laufs die
// Sekunde trägt). Die 5 s Standardfrist reichen dafür auf einem langsamen
// Runner nicht — der erste Lauf auf `main` endete genau so.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const REPO = join(__dirname, '..', '..', '..')
const BACKUP = join(REPO, 'ops', 'appwrite-backup.sh')
const GATE = join(REPO, 'ops', 'appwrite-cert-gate.sh')
const CONF = join(REPO, 'ops', 'appwrite-volumes.conf')
const PUBKEY = join(REPO, 'ops', 'appwrite-backup.pub.asc')
const FPR = 'A'.repeat(40)

let dir: string
let compose: string
let backupDir: string
let box: string
let stubDir: string

function stub(name: string, body: string) {
  const file = join(dir, 'bin', name)
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(file, 0o755)
}

function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('bash', [BACKUP, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      TMPDIR: join(dir, 'tmp'),
      STUB_DIR: stubDir,
      APPWRITE_COMPOSE_DIR: compose,
      BACKUP_DIR: backupDir,
      OFFSITE_TARGET: box,
      BACKUP_PUBLIC_KEY: join(dir, 'key.pub'),
      BACKUP_KEY_FINGERPRINT: FPR,
      BACKUP_VOLUMES_CONF: CONF,
      MIN_FREE_MB: '1',
      ...env,
    },
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const runs = (root: string) => (existsSync(join(root, 'runs')) ? readdirSync(join(root, 'runs')).sort() : [])
const state = () => Object.fromEntries(readFileSync(join(backupDir, 'state', 'last-run'), 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const rsyncCalls = () => (existsSync(join(stubDir, 'rsync.log')) ? readFileSync(join(stubDir, 'rsync.log'), 'utf8') : '')
/** Zeitstempel eines Laufs vor `days` Tagen, in der Form des Skripts. */
const stampDaysAgo = (days: number) => `${new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)}-033000`
/** Zwei Läufe brauchen zwei Namen — der Name trägt die Sekunde. */
const nextSecond = () => spawnSync('sleep', ['1.1'])

const VOLUMES: Record<string, string> = {
  'appwrite-uploads': 'appwrite_appwrite-uploads',
  'appwrite-functions': 'appwrite_appwrite-functions',
  'appwrite-sites': 'appwrite_appwrite-sites',
  'appwrite-builds': 'appwrite-builds',
  'appwrite-certificates': 'appwrite_appwrite-certificates',
  'appwrite-config': 'appwrite_appwrite-config',
  'appwrite-mariadb': 'appwrite_appwrite-mariadb',
  'appwrite-redis': 'appwrite_appwrite-redis',
}

function writeComposeConfig(volumes = VOLUMES, binds = ['patches/logging.xml']) {
  writeFileSync(join(stubDir, 'config.json'), JSON.stringify({
    name: 'appwrite',
    services: {
      appwrite: {
        image: 'appwrite/appwrite:9.9.9',
        volumes: binds.map(b => ({ type: 'bind', source: join(compose, b), target: `/x/${b}` })),
      },
    },
    volumes: Object.fromEntries(Object.entries(volumes).map(([key, name]) => [key, { name }])),
  }))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'appwrite-backup-'))
  compose = join(dir, 'appwrite')
  backupDir = join(dir, 'backup')
  box = join(dir, 'box')
  stubDir = join(dir, 'stub')
  for (const d of ['bin', 'tmp', 'box', 'stub', 'appwrite/patches']) mkdirSync(join(dir, d), { recursive: true })

  writeFileSync(join(compose, '.env'), '_APP_OPENSSL_KEY_V1=KLARTEXT-MARKER-ENV\n_APP_DB_ROOT_PASS=x\n')
  writeFileSync(join(compose, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(compose, 'patches', 'logging.xml'), '<x/>\n')
  writeFileSync(join(dir, 'key.pub'), `${FPR}\n`)
  writeComposeConfig()

  for (const name of Object.values(VOLUMES)) mkdirSync(join(stubDir, 'volumes', name), { recursive: true })
  writeFileSync(join(stubDir, 'volumes', 'appwrite_appwrite-uploads', 'datei.txt'), 'KLARTEXT-MARKER-DATEI\n')
  writeFileSync(join(stubDir, 'volumes', 'appwrite-builds', 'echt.txt'), 'echt\n')
  writeFileSync(join(stubDir, 'tables.tsv'), 'appwrite\t_1_users\nappwrite\t_console_projects\nappwrite\t_1_messages\n')
  writeFileSync(join(stubDir, 'counts.tsv'), 'appwrite\t_1_users\t34\nappwrite\t_console_projects\t2\nappwrite\t_1_messages\t200\n')
  writeFileSync(join(stubDir, 'dump.sql'), [
    'CREATE TABLE `_1_users` (x int);',
    'CREATE TABLE `_console_projects` (x int);',
    'CREATE TABLE `_1_messages` (x int);',
    `INSERT INTO \`_1_messages\` VALUES ('${'KLARTEXT-MARKER-DB '.repeat(200)}');`,
    '-- Dump completed on 2026-11-15  3:30:09',
    '',
  ].join('\n'))

  stub('docker', [
    'last="${@: -1}"',
    'case "$1 $2" in',
    '  "compose config") cat "$STUB_DIR/config.json" ;;',
    '  "compose ps") [ -f "$STUB_DIR/db-down" ] || echo abc123 ;;',
    '  "compose exec")',
    '    case "$last" in',
    '      *mariadb-dump*)',
    '        if [ -f "$STUB_DIR/dump-fail" ]; then exit 3; fi',
    '        if [ -f "$STUB_DIR/dump-cut" ]; then head -c 120 "$STUB_DIR/dump.sql"; else cat "$STUB_DIR/dump.sql"; fi ;;',
    '      *)',
    '        query="$(cat)"',
    '        case "$query" in',
    '          *information_schema.schemata*) echo appwrite ;;',
    '          *information_schema.tables*) cat "$STUB_DIR/tables.tsv" ;;',
    '          *COUNT*) cat "$STUB_DIR/counts.tsv" ;;',
    '        esac ;;',
    '    esac ;;',
    '  "volume inspect") [ -d "$STUB_DIR/volumes/$3" ] ;;',
    '  "run --rm") name="${4%%:*}"; tar czf - -C "$STUB_DIR/volumes/$name" . ;;',
    '  *) echo "docker-Stellvertreter kennt das nicht: $*" >&2; exit 97 ;;',
    'esac',
  ].join('\n'))
  stub('gpg', [
    'out=""; show=0; listonly=0; prev=""',
    'for a in "$@"; do',
    '  [ "$prev" = "--output" ] && out="$a"',
    '  [ "$a" = "--show-keys" ] && show=1',
    '  [ "$a" = "--list-only" ] && listonly=1',
    '  prev="$a"',
    'done',
    'last="${@: -1}"',
    // Fingerabdruck = Inhalt der Schlüssel-Datei; der Unterschlüssel zum
    // Verschlüsseln trägt dessen letzte 16 Zeichen als Kennung.
    'if [ "$show" = 1 ]; then fpr="$(tr -d "\\n" < "$last")"; echo "pub:u:255:22:${fpr: -16}:0::::::scESC:"; echo "fpr:::::::::$fpr:"; echo "sub:u:255:18:${fpr: -16}:0::::::e:"; exit 0; fi',
    // Empfänger nennen wie `--status-fd 1 --list-only --decrypt`: ein
    // Stellvertreter-Bündel beginnt mit „BUENDEL-FUER <kennung>".
    'if [ "$listonly" = 1 ]; then',
    '  first="$(head -c 200 "$last" | head -n 1)"',
    '  case "$first" in "BUENDEL-FUER "*) echo "[GNUPG:] ENC_TO ${first#BUENDEL-FUER } 18 0" ;; *) echo "[GNUPG:] NODATA 1" ;; esac',
    '  exit 2',
    'fi',
    // base64 statt eines Zeichen-Werkzeugs: der Eingang ist binär (gzip), und
    // `rev` bricht unter Linux an Bytes ab, die kein gültiges Zeichen sind.
    '{ echo "GPG-STELLVERTRETER"; base64 < "$last"; } > "$out"',
  ].join('\n'))
  const realRsync = spawnSync('bash', ['-c', 'command -v rsync'], { encoding: 'utf8' }).stdout.trim()
  stub('rsync', `echo "rsync $*" >> "$STUB_DIR/rsync.log"\nexec ${realRsync} "$@"`)
  stub('ssh', 'exit 255')
  // Stellvertreter für ops/app-env-bundle.sh auf dem App-Server (BU1 b).
  writeFileSync(join(stubDir, 'quelle-id'), FPR.slice(-16))
  writeFileSync(join(stubDir, 'quelle-list'), 'a.example.test vorhanden\nb.example.test vorhanden\n')
  stub('quelle', [
    'case "$1" in',
    '  list) cat "$STUB_DIR/quelle-list" ;;',
    '  bundle)',
    '    if [ -f "$STUB_DIR/quelle-fail" ]; then echo "app-env-bundle: ✗ Die .env von b.example.test ist fehlt" >&2; exit 1; fi',
    '    if [ -f "$STUB_DIR/quelle-leer" ]; then exit 0; fi',
    '    if [ -f "$STUB_DIR/quelle-kaputt" ]; then echo "kein OpenPGP"; exit 0; fi',
    '    echo "BUENDEL-FUER $(cat "$STUB_DIR/quelle-id")"; echo "verschluesselt-$RANDOM" ;;',
    '  *) exit 2 ;;',
    'esac',
  ].join('\n'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/appwrite-backup.sh — zeigt zuerst nur', () => {
  it('ändert ohne Angabe nichts und nennt die echten Volume-Namen', () => {
    const { code, out } = run([])
    expect(code).toBe(0)
    expect(out).toContain('es wird NICHTS geändert')
    expect(out).toMatch(/appwrite-builds {2}← {2}appwrite-builds\n/)
    expect(out).toContain('appwrite-uploads  ←  appwrite_appwrite-uploads')
    expect(out).not.toContain('appwrite-redis  ←')
    expect(existsSync(backupDir)).toBe(false)
    expect(runs(box)).toEqual([])
  })

  it('lehnt einen unbekannten Schalter ab', () => {
    expect(run(['--apply']).code).toBe(2)
    expect(existsSync(backupDir)).toBe(false)
  })
})

describe('ops/appwrite-backup.sh — ein Lauf', () => {
  it('legt alles verschlüsselt ab, lokal und außer Haus gleich, und meldet ok', () => {
    const { code, out } = run(['--run'])
    expect(out).toContain('Backup fertig')
    expect(code).toBe(0)
    const [stamp] = runs(backupDir)
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/)
    const files = readdirSync(join(backupDir, 'runs', stamp)).sort()
    expect(files).toEqual([
      'SHA256SUMS', 'backup.meta', 'config.tar.gz.gpg', 'counts.tsv.gpg', 'db.sql.gz.gpg',
      'volume-appwrite-builds.tar.gz.gpg', 'volume-appwrite-certificates.tar.gz.gpg', 'volume-appwrite-config.tar.gz.gpg',
      'volume-appwrite-functions.tar.gz.gpg', 'volume-appwrite-sites.tar.gz.gpg', 'volume-appwrite-uploads.tar.gz.gpg',
    ])
    expect(readdirSync(join(box, 'runs', stamp)).sort()).toEqual(files)
    for (const file of files) {
      expect(readFileSync(join(box, 'runs', stamp, file))).toEqual(readFileSync(join(backupDir, 'runs', stamp, file)))
    }
    // Jede Nutzdatei ging durch gpg; der Arbeitsordner mit dem Klartext ist weg.
    for (const file of files.filter(f => f.endsWith('.gpg'))) {
      expect(readFileSync(join(backupDir, 'runs', stamp, file), 'utf8').startsWith('GPG-STELLVERTRETER')).toBe(true)
    }
    expect(readdirSync(backupDir).sort()).toEqual(['runs', 'state'])
    const meta = readFileSync(join(backupDir, 'runs', stamp, 'backup.meta'), 'utf8')
    expect(meta).toContain('tables=3\n')
    expect(meta).toContain('rows=236\n')
    expect(meta).toContain('appwrite_image=appwrite/appwrite:9.9.9\n')
    expect(meta).toContain(`compose_dir=${compose}\n`)
    expect(meta).toContain(`key_fingerprint=${FPR}\n`)
    expect(meta).not.toContain('KLARTEXT')
    expect(state()).toMatchObject({ last_result: 'ok', last_step: 'fertig', last_ok_stamp: stamp, last_ok_files: '11' })
  })

  it('gleicht NIE mit --delete ab', () => {
    run(['--run'])
    expect(rsyncCalls()).toContain('rsync ')
    expect(rsyncCalls()).not.toContain('--delete')
    expect(readFileSync(BACKUP, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')).not.toMatch(/rsync[^\n]*--delete/)
  })

  it('eine lokale Löschung schlägt nicht auf die Ablage außer Haus durch', () => {
    run(['--run'])
    const [first] = runs(backupDir)
    rmSync(join(backupDir, 'runs', first), { recursive: true })
    nextSecond()
    expect(run(['--run']).code).toBe(0)
    expect(runs(box)).toContain(first)
    expect(runs(box)).toHaveLength(2)
  })
})

describe('ops/appwrite-backup.sh — ein Fehler gleicht nichts ab und lässt Früheres liegen', () => {
  let first: string
  let before: string

  const boxDigest = () => createHash('sha256').update(runs(box).map(r => readdirSync(join(box, 'runs', r)).sort().map(f => `${r}/${f}:${readFileSync(join(box, 'runs', r, f)).toString('base64')}`).join('|')).join('||')).digest('hex')

  beforeEach(() => {
    expect(run(['--run']).code).toBe(0)
    first = runs(backupDir)[0]
    before = boxDigest()
    nextSecond()
  })

  function expectUntouched(step: string) {
    expect(runs(backupDir)).toEqual([first])
    expect(runs(box)).toEqual([first])
    expect(boxDigest()).toBe(before)
    expect(readdirSync(backupDir).sort()).toEqual(['runs', 'state'])
    expect(state()).toMatchObject({ last_result: 'fehler', last_step: step, last_ok_stamp: first })
  }

  it('abgeschnittener Dump (Exit 0, Schlusszeile fehlt)', () => {
    writeFileSync(join(stubDir, 'dump-cut'), '')
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('Dump ist unvollständig')
    expectUntouched('dump')
  })

  it('Dump scheitert mit Fehler-Exit', () => {
    writeFileSync(join(stubDir, 'dump-fail'), '')
    expect(run(['--run']).code).toBe(1)
    expectUntouched('dump')
  })

  it('Dump enthält weniger Tabellen als die Datenbank', () => {
    writeFileSync(join(stubDir, 'tables.tsv'), Array.from({ length: 9 }, (_, i) => `appwrite\tt${i}`).join('\n') + '\n')
    writeFileSync(join(stubDir, 'counts.tsv'), Array.from({ length: 9 }, (_, i) => `appwrite\tt${i}\t1`).join('\n') + '\n')
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('Der Dump enthält 3 Tabellen, die Datenbank hat 9')
    expectUntouched('dump')
  })

  it('falscher öffentlicher Schlüssel', () => {
    writeFileSync(join(dir, 'key.pub'), `${'B'.repeat(40)}\n`)
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('Falscher Schlüssel')
    expectUntouched('vorpruefung')
  })

  it('Volume in der Compose-Datei, das die Liste nicht kennt', () => {
    writeComposeConfig({ ...VOLUMES, 'appwrite-neu': 'appwrite_appwrite-neu' })
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('„appwrite-neu“')
    expectUntouched('vorpruefung')
  })

  it('Volume aus der Liste, das es nicht gibt', () => {
    rmSync(join(stubDir, 'volumes', 'appwrite_appwrite-functions'), { recursive: true })
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('gibt es nicht')
    expectUntouched('vorpruefung')
  })

  it('.env ohne den Schlüssel, mit dem Appwrite verschlüsselt', () => {
    writeFileSync(join(compose, '.env'), '_APP_DB_ROOT_PASS=x\n')
    expect(run(['--run']).code).toBe(1)
    expectUntouched('vorpruefung')
  })

  it('eingebundene Datei, die nicht im Archiv der Einstellungen stünde', () => {
    writeFileSync(join(compose, 'extra.xml'), '<x/>\n')
    writeComposeConfig(VOLUMES, ['patches/logging.xml', 'extra.xml'])
    const { code, out } = run(['--run'])
    expect(code).toBe(1)
    expect(out).toContain('„extra.xml“')
    expectUntouched('vorpruefung')
  })

  it('Datenbank läuft nicht', () => {
    writeFileSync(join(stubDir, 'db-down'), '')
    expect(run(['--run']).code).toBe(1)
    expectUntouched('vorpruefung')
  })

  it('Tabellen stark geschrumpft — und einmal bewusst angenommen', () => {
    writeFileSync(join(stubDir, 'tables.tsv'), 'appwrite\t_1_users\n')
    writeFileSync(join(stubDir, 'counts.tsv'), 'appwrite\t_1_users\t34\n')
    const refused = run(['--run'])
    expect(refused.code).toBe(1)
    expect(refused.out).toContain('Nur noch 1 Tabellen')
    expectUntouched('zaehlen')
    nextSecond()
    const accepted = run(['--run'], { BACKUP_ACCEPT_SHRINK: '1' })
    expect(accepted.code).toBe(0)
    expect(runs(box)).toHaveLength(2)
  })

  it('Ablage außer Haus nicht erreichbar: der Lauf bleibt lokal und wird später nachgereicht', () => {
    const { code, out } = run(['--run'], { OFFSITE_TARGET: 'box.invalid:backups/appwrite' })
    expect(code).toBe(1)
    expect(out).toContain('Abgleich mit der Ablage außer Haus ist gescheitert')
    expect(runs(backupDir)).toHaveLength(2)
    expect(runs(box)).toEqual([first])
    expect(boxDigest()).toBe(before)
    expect(state()).toMatchObject({ last_result: 'fehler', last_step: 'abgleich', last_ok_stamp: first })
    nextSecond()
    expect(run(['--run']).code).toBe(0)
    expect(runs(box)).toHaveLength(3)
    expect(state().last_result).toBe('ok')
  })

  it('zweiter Lauf zur selben Zeit: der zweite tut nichts', () => {
    mkdirSync(join(backupDir, 'state', 'lock'))
    const { code, out } = run(['--run'])
    expect(code).toBe(3)
    expect(out).toContain('Ein anderer Lauf ist unterwegs')
    expect(existsSync(join(backupDir, 'state', 'lock'))).toBe(true)
    expect(state().last_result).toBe('ok')
  })
})

// ── App-Einstellungen (BU1 b, 2026-11-18) ───────────────────────────────────
// Das Bündel der .env-Dateien vom App-Server (ops/app-env-bundle.sh). Ein
// Ausfall darf das Backup der Datenbank NICHT verhindern: der Lauf fährt ganz
// durch und endet erst danach rot im Schritt `app-einstellungen`.

const DB_FILES = [
  'SHA256SUMS', 'backup.meta', 'config.tar.gz.gpg', 'counts.tsv.gpg', 'db.sql.gz.gpg',
  'volume-appwrite-builds.tar.gz.gpg', 'volume-appwrite-certificates.tar.gz.gpg', 'volume-appwrite-config.tar.gz.gpg',
  'volume-appwrite-functions.tar.gz.gpg', 'volume-appwrite-sites.tar.gz.gpg', 'volume-appwrite-uploads.tar.gz.gpg',
]
const meta = (root: string, stamp: string) => readFileSync(join(root, 'runs', stamp, 'backup.meta'), 'utf8')
const source = () => join(dir, 'bin', 'quelle')

describe('ops/appwrite-backup.sh — App-Einstellungen', () => {
  it('nicht eingerichtet: kein Bündel, app_env=aus, Vorschau sagt es', () => {
    expect(run([]).out).toContain('App-Einstellungen: nicht eingerichtet')
    expect(run(['--run']).code).toBe(0)
    const [stamp] = runs(backupDir)
    expect(readdirSync(join(backupDir, 'runs', stamp)).sort()).toEqual(DB_FILES)
    expect(meta(backupDir, stamp)).toContain('app_env=aus\n')
    expect(meta(backupDir, stamp)).not.toContain('app_env_bytes')
  })

  it('eingerichtet: das Bündel liegt im Lauf, lokal und außer Haus, in den Prüfsummen, app_env=ok', () => {
    const { code, out } = run(['--run'], { APP_ENV_SOURCE: source() })
    expect(out).toContain('Backup fertig')
    expect(code).toBe(0)
    const [stamp] = runs(backupDir)
    const files = readdirSync(join(backupDir, 'runs', stamp)).sort()
    expect(files).toEqual([...DB_FILES.slice(0, 1), 'app-env.tar.gz.gpg', ...DB_FILES.slice(1)])
    expect(readFileSync(join(box, 'runs', stamp, 'app-env.tar.gz.gpg'))).toEqual(readFileSync(join(backupDir, 'runs', stamp, 'app-env.tar.gz.gpg')))
    expect(readFileSync(join(box, 'runs', stamp, 'SHA256SUMS'), 'utf8')).toContain(' app-env.tar.gz.gpg\n')
    const bytes = readFileSync(join(backupDir, 'runs', stamp, 'app-env.tar.gz.gpg')).length
    expect(meta(backupDir, stamp)).toContain(`app_env=ok\napp_env_bytes=${bytes}\n`)
    expect(state()).toMatchObject({ last_result: 'ok', last_step: 'fertig', last_ok_files: '12' })
  })

  it('Vorschau: Sites in Zahlen, ein ssh-Ziel nur als <ssh-ziel>', () => {
    expect(run([], { APP_ENV_SOURCE: source() }).out).toContain('2 Sites, alle vorhanden')
    writeFileSync(join(stubDir, 'quelle-list'), 'a.example.test vorhanden\nb.example.test fehlt\n')
    expect(run([], { APP_ENV_SOURCE: source() }).out).toContain('2 Sites, nur 1 vorhanden')
    const remote = run([], { APP_ENV_SOURCE: 'app-server-alias' })
    expect(remote.code).toBe(0)
    expect(remote.out).toContain('App-Einstellungen: <ssh-ziel> — NICHT erreichbar')
    expect(remote.out).not.toContain('app-server-alias')
    expect(existsSync(backupDir)).toBe(false)
  })

  const failures: Array<[string, () => void, string, Record<string, string>?]> = [
    ['die Quelle scheitert (eine .env fehlt)', () => writeFileSync(join(stubDir, 'quelle-fail'), ''), 'liefert kein Bündel'],
    ['das Bündel ist leer', () => writeFileSync(join(stubDir, 'quelle-leer'), ''), 'das Bündel ist leer'],
    ['das Bündel ist kein OpenPGP-Paket', () => writeFileSync(join(stubDir, 'quelle-kaputt'), ''), 'kein für einen Schlüssel verschlüsseltes OpenPGP-Paket'],
    ['das Bündel ist für einen fremden Schlüssel', () => writeFileSync(join(stubDir, 'quelle-id'), 'C'.repeat(16)), 'fremden Schlüssel'],
    ['der App-Server ist nicht erreichbar', () => {}, 'liefert kein Bündel', { APP_ENV_SOURCE: 'app-server-alias' }],
  ]
  for (const [what, arrange, reason, env] of failures) {
    it(`${what}: die Datenbank ist trotzdem ganz gesichert, der Lauf endet rot in „app-einstellungen“`, () => {
      expect(run(['--run']).code).toBe(0)
      const first = runs(backupDir)[0]
      nextSecond()
      arrange()
      const { code, out } = run(['--run'], { APP_ENV_SOURCE: source(), ...env })
      expect(code).toBe(1)
      expect(out).toContain(reason)
      expect(out).toContain('Das Backup der Datenbank ist vollständig und liegt lokal und auf der Ablage außer Haus')
      expect(out).toContain('es fehlen die Einstellungen der Apps')
      // Der Lauf liegt vollständig lokal UND auf der Box, mit stimmigen Prüfsummen.
      const second = runs(backupDir).find(r => r !== first)!
      expect(runs(box)).toEqual([first, second].sort())
      expect(readdirSync(join(backupDir, 'runs', second)).sort()).toEqual(DB_FILES)
      expect(readdirSync(join(box, 'runs', second)).sort()).toEqual(DB_FILES)
      expect(spawnSync('bash', ['-c', `cd '${join(box, 'runs', second)}' && (sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS)`]).status).toBe(0)
      expect(meta(box, second)).toContain('app_env=fehlt\n')
      expect(state()).toMatchObject({ last_result: 'fehler', last_step: 'app-einstellungen', last_ok_stamp: first })
      expect(readdirSync(backupDir).sort()).toEqual(['runs', 'state'])
      // Ein wiederhergestellter Zugang macht den nächsten Lauf wieder grün.
      for (const f of ['quelle-fail', 'quelle-leer', 'quelle-kaputt']) rmSync(join(stubDir, f), { force: true })
      writeFileSync(join(stubDir, 'quelle-id'), FPR.slice(-16))
      nextSecond()
      expect(run(['--run'], { APP_ENV_SOURCE: source() }).code).toBe(0)
      expect(state().last_result).toBe('ok')
    })
  }

  it('ohne Ablage außer Haus sagt die Meldung „liegt lokal“', () => {
    writeFileSync(join(stubDir, 'quelle-fail'), '')
    const { code, out } = run(['--run'], { APP_ENV_SOURCE: source(), OFFSITE_TARGET: '' })
    expect(code).toBe(1)
    expect(out).toContain('Das Backup der Datenbank ist vollständig und liegt lokal (Lauf')
    expect(state()).toMatchObject({ last_result: 'fehler', last_step: 'app-einstellungen' })
  })
})

describe('ops/appwrite-backup.sh — App-Einstellungen: Reihenfolge im Skript', () => {
  const script = readFileSync(BACKUP, 'utf8')
  const code = script.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')
  const at = (needle: string, from = 0) => code.indexOf(needle, from)

  it('der Schritt steht vor dem Zählen und dem Dump — und sein Ausfall wird erst nach der Aufbewahrung gemeldet', () => {
    const fetchStep = at(`STEP='app-einstellungen'`)
    const lateStep = at(`STEP='app-einstellungen'`, fetchStep + 1)
    expect(fetchStep).toBeGreaterThan(0)
    expect(fetchStep).toBeLessThan(at(`STEP='zaehlen'`))
    expect(fetchStep).toBeLessThan(at(`STEP='dump'`))
    expect(lateStep).toBeGreaterThan(at(`STEP='aufbewahrung'`))
    expect(lateStep).toBeLessThan(at(`STEP='fertig'`))
    // Zwischen den beiden Stellen ruft nichts `die` wegen des Bündels.
    expect(code.slice(fetchStep, at(`STEP='zaehlen'`))).not.toMatch(/\bdie\b/)
  })

  it('das Holen läuft als Bedingung (sonst bräche errexit das Datenbank-Backup ab), mit Frist und ohne --delete', () => {
    expect(code).toMatch(/if app_env_fetch "\$PARTIAL\/app-env\.tar\.gz\.gpg"; then/)
    expect(code).toContain('timeout "$APP_ENV_TIMEOUT"')
    expect(code).toMatch(/ssh \$SSH_OPTS "\$APP_ENV_SOURCE" "\$1" <\/dev\/null/)
    expect(code).not.toMatch(/rsync[^\n]*--delete/)
  })
})

describe.skipIf(!HAS_GPG)('ops/appwrite-backup.sh — App-Einstellungen mit echtem gpg', () => {
  let keys: string
  let right: ThrowawayKey
  let foreign: ThrowawayKey

  beforeAll(() => {
    keys = mkdtempSync(join(tmpdir(), 'appwrite-backup-keys-'))
    right = makeKey(keys, 'richtig')
    foreign = makeKey(keys, 'fremd')
  })
  afterAll(() => {
    stopAgent(right)
    stopAgent(foreign)
    rmSync(keys, { recursive: true, force: true })
  })

  const sites = ['a.example.test', 'b.example.test']
  function realRun(env: Record<string, string>) {
    rmSync(join(dir, 'bin', 'gpg'))
    const appBase = join(dir, 'app-server')
    writeFileSync(join(dir, 'apps.conf'), sites.map(s => `x ${s}`).join('\n') + '\n')
    for (const s of sites) {
      mkdirSync(join(appBase, s), { recursive: true })
      writeFileSync(join(appBase, s, '.env'), `NUXT_GEHEIM=KLARTEXT-MARKER-APP-${s}\n`)
    }
    return run(['--run'], {
      BACKUP_PUBLIC_KEY: right.pub,
      BACKUP_KEY_FINGERPRINT: right.fingerprint,
      APP_ENV_SOURCE: join(REPO, 'ops', 'app-env-bundle.sh'),
      APP_ENV_APPS_CONF: join(dir, 'apps.conf'),
      APP_ENV_BASE: appBase,
      ...env,
    })
  }

  it('das echte Bündel besteht die Prüfung und öffnet sich mit dem privaten Schlüssel', () => {
    const { code, out } = realRun({})
    expect(out).toContain('verschlüsselt für unseren Schlüssel')
    expect(code).toBe(0)
    const [stamp] = runs(box)
    expect(meta(box, stamp)).toContain('app_env=ok\n')
    decrypt(right, join(box, 'runs', stamp, 'app-env.tar.gz.gpg'), join(dir, 'app-env.tar.gz'))
    const listed = spawnSync('tar', ['tzf', join(dir, 'app-env.tar.gz')], { encoding: 'utf8' }).stdout.trim().split('\n').sort()
    expect(listed).toEqual(sites.map(s => `${s}/.env`))
    expect(spawnSync('grep', ['-rl', 'KLARTEXT-MARKER', backupDir, box]).stdout.toString()).toBe('')
  })

  it('ein Bündel für einen fremden Schlüssel wird erkannt — die Datenbank liegt trotzdem auf der Box', () => {
    const wrapper = join(dir, 'bin', 'fremd-quelle')
    writeFileSync(wrapper, `#!/usr/bin/env bash\nBACKUP_PUBLIC_KEY='${foreign.pub}' BACKUP_KEY_FINGERPRINT='${foreign.fingerprint}' exec bash '${join(REPO, 'ops', 'app-env-bundle.sh')}' "$@"\n`)
    chmodSync(wrapper, 0o755)
    const { code, out } = realRun({ APP_ENV_SOURCE: wrapper })
    expect(out).toContain('fremden Schlüssel')
    expect(code).toBe(1)
    const [stamp] = runs(box)
    expect(readdirSync(join(box, 'runs', stamp)).sort()).toEqual(DB_FILES)
    expect(state()).toMatchObject({ last_result: 'fehler', last_step: 'app-einstellungen' })
  })
})

describe('ops/appwrite-backup.sh — Aufbewahrung außer Haus', () => {
  const seed = (name: string) => {
    mkdirSync(join(box, 'runs', name), { recursive: true })
    writeFileSync(join(box, 'runs', name, 'x'), 'x')
  }

  it('löscht nur Läufe, die alt genug sind, vom ältesten her, höchstens fünf je Lauf', () => {
    const old = [48, 47, 46, 45, 44, 43, 42, 41, 40].map(stampDaysAgo)
    const recent = [6, 5, 4, 3, 2, 1].map(stampDaysAgo)
    for (const name of [...old, ...recent, 'nicht-von-uns', '2020-01-01-0330']) seed(name)
    writeFileSync(join(box, 'db-2026-11-15-0330.sql.gz'), 'flach abgelegte Alt-Datei')
    expect(run(['--run']).code).toBe(0)
    const left = runs(box)
    expect(old.filter(name => left.includes(name))).toEqual(old.slice(5))
    for (const name of [...recent, 'nicht-von-uns', '2020-01-01-0330']) expect(left).toContain(name)
    expect(existsSync(join(box, 'db-2026-11-15-0330.sql.gz'))).toBe(true)
  })

  it('löscht nichts, solange weniger Läufe da sind als die Untergrenze', () => {
    const old = [45, 44, 43].map(stampDaysAgo)
    for (const name of old) seed(name)
    expect(run(['--run']).code).toBe(0)
    for (const name of old) expect(runs(box)).toContain(name)
  })

  it('weigert sich, wenn die Ablage außer Haus kürzer halten soll als der Server', () => {
    const { code, out } = run(['--run'], { OFFSITE_RETENTION_DAYS: '7' })
    expect(code).toBe(1)
    expect(out).toContain('kleiner als RETENTION_DAYS')
    expect(runs(box)).toEqual([])
  })
})

describe('ops/appwrite-cert-gate.sh — backup-status', () => {
  const gate = (content: string | null) => {
    const file = join(dir, 'last-run')
    if (content !== null) writeFileSync(file, content)
    const result = spawnSync('bash', [GATE, 'backup-status'], { encoding: 'utf8', env: { ...process.env, BACKUP_STATE_FILE: file } })
    return { code: result.status, out: `${result.stdout}${result.stderr}` }
  }
  const now = () => Math.floor(Date.now() / 1000)

  it('gibt nach einem guten Lauf genau eine Zeile aus Wörtern und Zahlen aus', () => {
    const { code, out } = gate(`last_result=ok\nlast_step=fertig\nlast_ok_epoch=${now() - 5 * 3600 - 60}\nlast_ok_stamp=2026-11-15-033000\nlast_ok_bytes=31457280\nlast_ok_files=11\n`)
    expect(code).toBe(0)
    expect(out).toBe('backup ergebnis=ok schritt=fertig alter_stunden=5 groesse_mb=30 dateien=11\n')
  })

  it('nennt einen gescheiterten Lauf samt Schritt und dem Alter des letzten guten', () => {
    const { code, out } = gate(`last_result=fehler\nlast_step=abgleich\nlast_ok_epoch=${now() - 30 * 3600}\nlast_ok_bytes=1048576\nlast_ok_files=11\n`)
    expect(code).toBe(0)
    expect(out).toBe('backup ergebnis=fehler schritt=abgleich alter_stunden=30 groesse_mb=1 dateien=11\n')
  })

  it('meldet „nie", wenn es noch keinen guten Lauf gab', () => {
    const { out } = gate('last_result=fehler\nlast_step=vorpruefung\n')
    expect(out).toBe('backup ergebnis=fehler schritt=vorpruefung alter_stunden=nie groesse_mb=0 dateien=0\n')
  })

  it('reicht nichts durch, was nicht wie ein Wort oder eine Zahl aussieht', () => {
    const hostile = gate('last_result=ok; rm -rf /\nlast_step=$(id)\nlast_ok_epoch=abc\n')
    expect(hostile.code).toBe(6)
    expect(hostile.out).toBe('backup ergebnis=unbekannt\n')
    const path = gate('last_result=ok\nlast_step=/home/ploi/geheim\nlast_ok_epoch=1\n')
    expect(path.code).toBe(6)
    expect(path.out).toBe('backup ergebnis=unbekannt\n')
  })

  it('endet mit Exit 6, wenn es keine Stand-Datei gibt', () => {
    const { code, out } = gate(null)
    expect(code).toBe(6)
    expect(out).toBe('backup ergebnis=unbekannt\n')
  })

  it('lehnt weiterhin jedes andere Wort ab und nennt die fünf erlaubten', () => {
    const result = spawnSync('bash', [GATE, 'cat /etc/passwd'], { encoding: 'utf8' })
    expect(result.status).toBe(64)
    expect(result.stdout).toContain('probe, renew, reset-account, backup-status, realtime-status')
  })
})

describe('Backup — eine Liste, ein Schlüssel', () => {
  const conf = readFileSync(CONF, 'utf8').split('\n').filter(l => l.trim() && !l.trimStart().startsWith('#')).map(l => l.trim().split(/\s+/))

  it('jede Zeile der Volume-Liste hat drei Felder mit ja oder nein', () => {
    expect(conf.length).toBeGreaterThan(8)
    for (const [key, backup, mirror, ...rest] of conf) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
      expect(['ja', 'nein']).toContain(backup)
      expect(['ja', 'nein']).toContain(mirror)
      expect(rest).toEqual([])
    }
    expect(new Set(conf.map(l => l[0])).size).toBe(conf.length)
  })

  it('was der Spiegel holt, ist auch im Backup — und die Datenbank kommt nie als Volume', () => {
    for (const [key, backup, mirror] of conf) {
      if (mirror === 'ja') expect(backup, key).toBe('ja')
    }
    expect(conf.find(l => l[0] === 'appwrite-mariadb')?.[1]).toBe('nein')
    expect(conf.find(l => l[0] === 'appwrite-uploads')?.[1]).toBe('ja')
  })

  it('das Spiegel-Skript liest dieselbe Liste und führt keine eigene', () => {
    const mirror = readFileSync(join(REPO, 'scripts', 'ops', 'appwrite-mirror-prod-to-local.mjs'), 'utf8')
    expect(mirror).toContain('appwrite-volumes.conf')
    expect(mirror).not.toMatch(/VOLUMES\s*=\s*\[/)
  })

  it('der Fingerabdruck im Skript ist der des Schlüssels im Repo', () => {
    // OpenPGP v4: SHA-1 über 0x99, die Länge (zwei Bytes) und den Körper des
    // ersten Pakets (öffentlicher Schlüssel). Ohne gpg gerechnet, damit der
    // Test überall läuft.
    const armored = readFileSync(PUBKEY, 'utf8')
    expect(armored).toContain('BEGIN PGP PUBLIC KEY BLOCK')
    expect(armored).not.toContain('PRIVATE')
    const base64 = armored.split('\n').filter(l => l && !l.startsWith('-----') && !l.includes(':') && !l.startsWith('=')).join('')
    const bytes = Buffer.from(base64, 'base64')
    const first = bytes[0]
    let offset: number
    let length: number
    if ((first & 0x40) === 0) {
      const lengthType = first & 0x03
      expect((first & 0x3C) >> 2).toBe(6)
      length = lengthType === 0 ? bytes[1] : lengthType === 1 ? bytes.readUInt16BE(1) : bytes.readUInt32BE(1)
      offset = lengthType === 0 ? 2 : lengthType === 1 ? 3 : 5
    }
    else {
      expect(first & 0x3F).toBe(6)
      if (bytes[1] < 192) { length = bytes[1]; offset = 2 }
      else if (bytes[1] < 224) { length = ((bytes[1] - 192) << 8) + bytes[2] + 192; offset = 3 }
      else { length = bytes.readUInt32BE(2); offset = 6 }
    }
    const body = bytes.subarray(offset, offset + length)
    const fingerprint = createHash('sha1').update(Buffer.from([0x99, length >> 8, length & 0xFF])).update(body).digest('hex').toUpperCase()
    const script = readFileSync(BACKUP, 'utf8')
    expect(script).toContain(`DEFAULT_FINGERPRINT='${fingerprint}'`)
  })

  it('der Wächter fragt das Tor nur mit Wörtern, die es kennt', () => {
    const gateSource = readFileSync(GATE, 'utf8')
    const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')
    const sent = [...workflow.matchAll(/ssh appwrite-prod ([a-z-]+)/g)].map(m => m[1])
    expect(sent.length).toBeGreaterThan(0)
    for (const word of new Set(sent)) expect(gateSource).toMatch(new RegExp(`^  ${word}\\)$`, 'm'))
  })
})
