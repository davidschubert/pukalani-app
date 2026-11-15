import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
    'out=""; show=0; prev=""',
    'for a in "$@"; do',
    '  [ "$prev" = "--output" ] && out="$a"',
    '  [ "$a" = "--show-keys" ] && show=1',
    '  prev="$a"',
    'done',
    'last="${@: -1}"',
    'if [ "$show" = 1 ]; then echo "fpr:::::::::$(tr -d "\\n" < "$last"):"; exit 0; fi',
    // base64 statt eines Zeichen-Werkzeugs: der Eingang ist binär (gzip), und
    // `rev` bricht unter Linux an Bytes ab, die kein gültiges Zeichen sind.
    '{ echo "GPG-STELLVERTRETER"; base64 < "$last"; } > "$out"',
  ].join('\n'))
  const realRsync = spawnSync('bash', ['-c', 'command -v rsync'], { encoding: 'utf8' }).stdout.trim()
  stub('rsync', `echo "rsync $*" >> "$STUB_DIR/rsync.log"\nexec ${realRsync} "$@"`)
  stub('ssh', 'exit 255')
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

  it('lehnt weiterhin jedes andere Wort ab und nennt die vier erlaubten', () => {
    const result = spawnSync('bash', [GATE, 'cat /etc/passwd'], { encoding: 'utf8' })
    expect(result.status).toBe(64)
    expect(result.stdout).toContain('probe, renew, reset-account, backup-status')
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
