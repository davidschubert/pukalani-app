import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Das tägliche Backup des Docker-Servers (`ops/docker-apps-backup.sh`), seine
 * Liste (`ops/docker-apps.conf`) und der Helfer fürs Zurückspielen von
 * ClickHouse (`ops/docker-apps-restore-clickhouse.sh`).
 *
 * Der eigentliche Beweis lief mit echtem docker, Postgres, ClickHouse, SQLite
 * und gpg auf dem Server und in Wegwerf-Containern (Protokoll im Runbook
 * docs/runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md). Hier steht das Netz, das in
 * JEDEM Testlauf mitläuft — mit Stellvertretern:
 *
 *   bin/docker    antwortet wie `docker compose config|ps|exec` für zwei
 *                 kleine Compose-Ordner (alpha: Postgres, ClickHouse, Dateien;
 *                 beta: SQLite)
 *   bin/sqlite3   `.backup` kopiert, die Abfragen antworten fest
 *   bin/gpg       „verschlüsselt" mit Kopfzeile und base64 und nennt als
 *                 Fingerabdruck den Inhalt der Schlüssel-Datei
 *   bin/rsync     schreibt seine Schalter mit und ruft das echte rsync
 *   bin/ssh       scheitert immer
 *
 * Geprüft werden die Zusagen, die still brechen würden: nichts liegt im
 * Klartext, nichts wird still ausgelassen (Ordner, Dienst, eingebundene
 * Datei), ein Fehler gleicht nichts ab und lässt Früheres liegen, kein
 * `--delete` am Abgleich, die Aufbewahrung hält Unter- und Obergrenze.
 */
// Jeder Test startet das Skript ein- bis zweimal als eigenen Prozess; die 5 s
// Standardfrist reichen dafür auf einem langsamen Runner nicht.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const REPO = join(__dirname, '..', '..', '..')
const BACKUP = join(REPO, 'ops', 'docker-apps-backup.sh')
const RESTORE = join(REPO, 'ops', 'docker-apps-restore-clickhouse.sh')
const REPO_CONF = join(REPO, 'ops', 'docker-apps.conf')
const FPR = 'B'.repeat(40)
const MARKER = 'nur-in-der-env-datei'

let dir: string
let apps: string
let backupDir: string
let box: string
let stubDir: string
let conf: string

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
      APPS_DIR: apps,
      BACKUP_DIR: backupDir,
      OFFSITE_TARGET: box,
      BACKUP_PUBLIC_KEY: join(dir, 'key.pub'),
      BACKUP_KEY_FINGERPRINT: FPR,
      BACKUP_APPS_CONF: conf,
      MIN_FREE_MB: '1',
      ...env,
    },
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const runs = (root: string) => (existsSync(join(root, 'runs')) ? readdirSync(join(root, 'runs')).sort() : [])
const state = () => Object.fromEntries(readFileSync(join(backupDir, 'state', 'last-run'), 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const rsyncCalls = () => (existsSync(join(stubDir, 'rsync.log')) ? readFileSync(join(stubDir, 'rsync.log'), 'utf8') : '')
const flag = (name: string, content = '1') => writeFileSync(join(stubDir, name), content)
const stampDaysAgo = (days: number, n = 0) => `${new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)}-0330${String(n).padStart(2, '0')}`
const nextSecond = () => spawnSync('sleep', ['1.1'])

const tableCounts = (n: number) => Array.from({ length: n }, (_, i) => `app|public.t${i}|${i + 1}`).join('\n') + '\n'

function composeFolder(name: string, config: object, files: Record<string, string>) {
  const folder = join(apps, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(folder, 'config.json'), JSON.stringify(config))
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(folder, file, '..'), { recursive: true })
    writeFileSync(join(folder, file), content)
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'docker-apps-backup-'))
  apps = join(dir, 'apps')
  backupDir = join(dir, 'backup')
  box = join(dir, 'box')
  stubDir = join(dir, 'stub')
  conf = join(dir, 'apps.conf')
  for (const d of ['bin', 'tmp', 'stub', 'stub/storage', 'box']) mkdirSync(join(dir, d), { recursive: true })
  writeFileSync(join(dir, 'key.pub'), `${FPR}\n`)
  writeFileSync(join(stubDir, 'storage', 'bild.png'), 'bild')

  // `@DIR@` wird vom Stellvertreter durch den Ordner ersetzt, in dem er
  // aufgerufen wird — so, wie `docker compose config` volle Pfade nennt.
  composeFolder('alpha', {
    name: 'alpha',
    services: {
      db: { image: 'postgres:16-alpine' },
      events: { image: 'clickhouse:24', volumes: [{ type: 'bind', source: '@DIR@/extra.conf', target: '/etc/extra.conf' }] },
      app: { image: 'app:1' },
      cache: { image: 'redis:alpine' },
    },
  }, { '.env': `WERT=${MARKER}\n`, 'extra.conf': 'x=1\n' })
  composeFolder('beta', {
    name: 'beta',
    services: { short: { image: 'short:5', volumes: [{ type: 'bind', source: '@DIR@/data', target: '/data' }] } },
  }, { '.env': '', 'data/db.sqlite': 'SQLite format 3 — Stellvertreter' })
  writeFileSync(conf, [
    '# Liste für den Test',
    'alpha einstellungen alpha - .env docker-compose.yml extra.conf',
    'alpha postgres      alpha db',
    'alpha clickhouse    alpha events',
    'alpha dateien       alpha app /srv/files',
    'alpha ohne          alpha - cache',
    'beta einstellungen beta - .env docker-compose.yml',
    'beta sqlite        beta short data/db.sqlite',
    '',
  ].join('\n'))

  flag('pg-counts.txt', tableCounts(20))
  flag('dump.sql', `${Array.from({ length: 19 }, (_, i) => `CREATE TABLE public.t${i} (id int);`).join('\n')}\nCREATE UNLOGGED TABLE public.t19 (id int);\n--\n-- PostgreSQL database cluster dump complete\n--\n`)
  flag('ch-tables.tsv', 'web\tevents\tMergeTree\nweb\tnames\tMergeTree\nweb\tnames_dict\tDictionary\n')

  stub('docker', [
    '[ "$1" = compose ] || { echo "docker-Stellvertreter kennt das nicht: $*" >&2; exit 97; }',
    'case "$2" in',
    '  config) sed "s#@DIR@#$PWD#g" config.json ;;',
    '  ps) [ -f "$STUB_DIR/down-$4" ] || echo "id-$4" ;;',
    '  exec)',
    '    case "$5" in',
    '      sh)',
    '        case "$7" in',
    '          *pg_dumpall*)',
    '            if [ -f "$STUB_DIR/dump-fail" ]; then exit 3; fi',
    '            if [ -f "$STUB_DIR/dump-cut" ]; then head -c 120 "$STUB_DIR/dump.sql"; else cat "$STUB_DIR/dump.sql"; fi ;;',
    '          *)',
    '            query="$(cat)"',
    '            case "$query" in',
    '              *pg_database*) printf "app\\npostgres\\n" ;;',
    '              *gexec*) [ "$9" != app ] || cat "$STUB_DIR/pg-counts.txt" ;;',
    '              *pg_tables*) if [ "$9" = app ]; then wc -l < "$STUB_DIR/pg-counts.txt" | tr -d " "; else echo 0; fi ;;',
    '            esac ;;',
    '        esac ;;',
    '      clickhouse-client)',
    '        case "$7" in',
    '          *system.tables*) cat "$STUB_DIR/ch-tables.tsv" ;;',
    '          "SHOW CREATE"*) echo "CREATE TABLE stellvertreter (id UInt8) ENGINE = MergeTree ORDER BY id" ;;',
    '          "SELECT count()"*) echo 7 ;;',
    '          *"FORMAT Native") printf "native-bytes" ;;',
    '        esac ;;',
    '      tar) tar czf - -C "$STUB_DIR/storage" . ;;',
    '      *) echo "docker-Stellvertreter kennt das nicht: $*" >&2; exit 97 ;;',
    '    esac ;;',
    '  *) echo "docker-Stellvertreter kennt das nicht: $*" >&2; exit 97 ;;',
    'esac',
  ].join('\n'))
  stub('sqlite3', [
    'last="${@: -1}"',
    'case "$last" in',
    '  .backup*) src="$2"; dest="${last#*\\\'}"; dest="${dest%\\\'}"; cp "$src" "$dest" ;;',
    '  *integrity_check*) if [ -f "$STUB_DIR/sqlite-kaputt" ]; then echo "row 3 missing from index"; else echo ok; fi ;;',
    '  *sqlite_master*) printf "links\\nvisits\\n" ;;',
    '  *count*) echo 3 ;;',
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
    // base64 statt eines Zeichen-Werkzeugs: der Eingang ist binär (gzip).
    '{ echo "GPG-STELLVERTRETER"; base64 < "$last"; } > "$out"',
  ].join('\n'))
  const realRsync = spawnSync('bash', ['-c', 'command -v rsync'], { encoding: 'utf8' }).stdout.trim()
  stub('rsync', `echo "rsync $*" >> "$STUB_DIR/rsync.log"\nexec ${realRsync} "$@"`)
  stub('ssh', 'exit 255')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/docker-apps-backup.sh', () => {
  it('ist gültiges bash, ebenso der Helfer fürs Zurückspielen', () => {
    for (const file of [BACKUP, RESTORE]) expect(spawnSync('bash', ['-n', file]).status).toBe(0)
  })

  it('lehnt unbekannte Angaben ab (Exit 2)', () => {
    expect(run(['--los']).code).toBe(2)
    expect(run(['--run', 'x']).code).toBe(2)
  })

  it('zeigt ohne Angabe nur die Vorschau und ändert nichts', () => {
    const result = run([])
    expect(result.code).toBe(0)
    expect(result.out).toContain('es wird NICHTS geändert')
    expect(result.out).toContain('alpha-postgres')
    expect(result.out).toContain('beta-sqlite')
    expect(existsSync(backupDir)).toBe(false)
    expect(runs(box)).toEqual([])
  })

  it('legt einen Lauf ab: alles verschlüsselt, Prüfsummen stimmen, außer Haus dasselbe', () => {
    const result = run(['--run'])
    expect(result.out).toContain('Außer Haus angekommen und Prüfsummen gleich')
    expect(result.code).toBe(0)
    const [stamp] = runs(backupDir)
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/)
    const folder = join(backupDir, 'runs', stamp!)
    expect(readdirSync(folder).sort()).toEqual([
      'SHA256SUMS',
      'alpha-clickhouse.tar.gz.gpg',
      'alpha-dateien.tar.gz.gpg',
      'alpha-einstellungen.tar.gz.gpg',
      'alpha-postgres.sql.gz.gpg',
      'backup.meta',
      'beta-einstellungen.tar.gz.gpg',
      'beta-sqlite.gz.gpg',
      'counts.tsv.gpg',
    ])
    for (const file of readdirSync(folder).filter(f => f.endsWith('.gpg'))) {
      expect(readFileSync(join(folder, file), 'utf8').startsWith('GPG-STELLVERTRETER\n')).toBe(true)
    }
    // Kein Klartext bleibt liegen: kein Arbeitsordner, und der Wert aus der
    // .env steht in keiner Datei unter dem Backup-Ordner.
    expect(readdirSync(backupDir).sort()).toEqual(['runs', 'state'])
    expect(spawnSync('grep', ['-rl', MARKER, backupDir, box]).stdout.toString()).toBe('')
    expect(spawnSync('bash', ['-c', `cd '${folder}' && (sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS)`]).status).toBe(0)
    expect(readdirSync(join(box, 'runs', stamp!)).sort()).toEqual(readdirSync(folder).sort())

    const meta = readFileSync(join(folder, 'backup.meta'), 'utf8')
    expect(meta).toContain('artifacts=6')
    expect(meta).toContain('alpha.postgres.tables=20')
    expect(meta).toContain('alpha.postgres.image=postgres:16-alpine')
    expect(meta).toContain('alpha.clickhouse.tables=3')
    // Zwei Tabellen mit Daten zu je 7 Zeilen; das Wörterbuch zählt nicht mit.
    expect(meta).toContain('alpha.clickhouse.rows=14')
    expect(meta).toContain('beta.sqlite.rows=6')
    expect(meta).not.toContain(MARKER)
    expect(state().last_result).toBe('ok')
    expect(run(['--status']).out).toContain('Letzter guter Lauf')
  })

  it('gleicht nie mit einem Schalter ab, der Löschungen überträgt', () => {
    expect(run(['--run']).code).toBe(0)
    expect(rsyncCalls()).toContain('rsync -a')
    expect(rsyncCalls()).not.toMatch(/--del/)
    expect(readFileSync(BACKUP, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')).not.toMatch(/--del/)
  })

  describe('nichts wird still ausgelassen', () => {
    const refused = (needle: string) => {
      const result = run(['--run'])
      expect(result.out).toContain(needle)
      expect(result.code).toBe(1)
      expect(runs(backupDir)).toEqual([])
      expect(runs(box)).toEqual([])
      expect(state().last_result).toBe('fehler')
      expect(state().last_step).toBe('vorpruefung')
    }

    it('ein Compose-Ordner, den die Liste nicht kennt, bricht den Lauf ab', () => {
      composeFolder('gamma', { name: 'gamma', services: { web: {} } }, { '.env': '' })
      refused('Der Compose-Ordner „gamma“')
    })

    it('ein Dienst, den die Liste nicht kennt, bricht den Lauf ab', () => {
      writeFileSync(conf, readFileSync(conf, 'utf8').replace('alpha ohne          alpha - cache\n', ''))
      refused('Der Dienst „cache“ im Ordner „alpha“')
    })

    it('eine eingebundene Datei, die nicht in den Einstellungen steht, bricht den Lauf ab', () => {
      writeFileSync(conf, readFileSync(conf, 'utf8').replace(' extra.conf', ''))
      refused('bindet „extra.conf“ aus seinem Ordner ein')
    })

    it('eine Zeile ohne .env in den Einstellungen bricht den Lauf ab', () => {
      writeFileSync(conf, readFileSync(conf, 'utf8').replace('beta - .env docker-compose.yml', 'beta - docker-compose.yml'))
      refused('keine .env')
    })

    it('ein Dienst, der nicht läuft, bricht den Lauf ab', () => {
      flag('down-db')
      refused('Der Dienst „db“ im Ordner „alpha“ läuft nicht')
    })

    it('ein falscher Schlüssel verschlüsselt nichts', () => {
      writeFileSync(join(dir, 'key.pub'), `${'C'.repeat(40)}\n`)
      refused('Falscher Schlüssel')
    })

    it('die Liste im Repo gibt jedem Ordner Einstellungen mit .env und Compose-Datei', () => {
      const lines = readFileSync(REPO_CONF, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/))
      const folders = [...new Set(lines.map(l => l[2]))]
      expect(folders.length).toBeGreaterThan(0)
      for (const folder of folders) {
        const settings = lines.find(l => l[2] === folder && l[1] === 'einstellungen')
        expect(settings, `Einstellungen für ${folder}`).toBeDefined()
        expect(settings).toContain('.env')
        expect(settings).toContain('docker-compose.yml')
      }
      for (const line of lines) expect(['postgres', 'clickhouse', 'sqlite', 'dateien', 'einstellungen', 'ohne']).toContain(line[1])
    })
  })

  describe('ein Fehler lässt Früheres liegen und gleicht nichts ab', () => {
    it('ein abgeschnittener Dump endet rot im Schritt des Dienstes', () => {
      expect(run(['--run']).code).toBe(0)
      const before = runs(backupDir)
      nextSecond()
      flag('dump-cut')
      const result = run(['--run'])
      expect(result.code).toBe(1)
      expect(result.out).toContain('der Dump ist unvollständig')
      expect(runs(backupDir)).toEqual(before)
      expect(runs(box)).toEqual(before)
      expect(state().last_step).toBe('alpha-postgres')
      expect(state().last_ok_stamp).toBe(before[0])
      expect(readdirSync(backupDir).sort()).toEqual(['runs', 'state'])
    })

    it('ein scheiternder Dump gilt nicht als leerer, guter Dump', () => {
      flag('dump-fail')
      expect(run(['--run']).code).toBe(1)
      expect(runs(backupDir)).toEqual([])
    })

    it('eine SQLite-Kopie, die die Prüfung nicht besteht, wird nicht abgelegt', () => {
      flag('sqlite-kaputt')
      const result = run(['--run'])
      expect(result.code).toBe(1)
      expect(result.out).toContain('besteht die Prüfung nicht')
      expect(state().last_step).toBe('beta-sqlite')
      expect(runs(box)).toEqual([])
    })

    it('eine Zählung, die nicht jede Tabelle trifft, bricht ab', () => {
      flag('dump.sql', 'CREATE TABLE public.t0 (id int);\n-- PostgreSQL database cluster dump complete\n')
      const result = run(['--run'])
      expect(result.code).toBe(1)
      expect(result.out).toContain('der Dump enthält 1 Tabellen, die Datenbank hat 20')
    })

    it('deutlich weniger Tabellen als beim letzten guten Lauf brauchen ein ausdrückliches Ja', () => {
      expect(run(['--run']).code).toBe(0)
      nextSecond()
      flag('pg-counts.txt', tableCounts(5))
      const refusedRun = run(['--run'])
      expect(refusedRun.code).toBe(1)
      expect(refusedRun.out).toContain('nur noch 5 Tabellen')
      expect(runs(backupDir)).toHaveLength(1)
      nextSecond()
      expect(run(['--run'], { BACKUP_ACCEPT_SHRINK: '1' }).code).toBe(0)
      expect(runs(backupDir)).toHaveLength(2)
    })

    it('ist die Ablage außer Haus nicht erreichbar, bleibt der Lauf lokal und der Stand rot', () => {
      const result = run(['--run'], { OFFSITE_TARGET: 'box-alias:backups/docker-apps' })
      expect(result.code).toBe(1)
      expect(state().last_step).toBe('abgleich')
      expect(runs(backupDir)).toHaveLength(1)
    })
  })

  it('räumt nur nach dem Namen auf, mit Unter- und Obergrenze', () => {
    const old = Array.from({ length: 9 }, (_, i) => stampDaysAgo(40, i))
    for (const root of [backupDir, box]) {
      for (const name of [...old, 'nicht-anfassen']) mkdirSync(join(root, 'runs', name), { recursive: true })
    }
    expect(run(['--run']).code).toBe(0)
    // Zehn Läufe mit Zeitstempel je Seite. Lokal bleiben mindestens drei, auf
    // der Box mindestens sieben; je Lauf gehen höchstens fünf.
    expect(runs(backupDir).filter(n => /^\d{4}-/.test(n))).toHaveLength(5)
    expect(runs(box).filter(n => /^\d{4}-/.test(n))).toHaveLength(7)
    expect(runs(backupDir)).toContain('nicht-anfassen')
    expect(runs(box)).toContain('nicht-anfassen')
    // Gelöscht werden die ältesten zuerst.
    expect(runs(box)).not.toContain(old[0])
    expect(runs(box)).toContain(old[8])
  })
})

describe('ops/docker-apps-restore-clickhouse.sh', () => {
  function restoreSetup(existing: string) {
    const archive = join(dir, 'ch')
    for (const d of ['schema', 'data']) mkdirSync(join(archive, d), { recursive: true })
    writeFileSync(join(archive, 'tables.tsv'), 'web\tevents\tMergeTree\nweb\tnames\tMergeTree\nweb\tnames_dict\tDictionary\nweb\tsumme\tMaterializedView\n')
    writeFileSync(join(archive, 'schema', 'web.events.sql'), "CREATE TABLE web.events (c String ALIAS dictGet('web.names_dict', 'name', id))\n")
    writeFileSync(join(archive, 'schema', 'web.names.sql'), 'CREATE TABLE web.names (id UInt8)\n')
    writeFileSync(join(archive, 'schema', 'web.names_dict.sql'), 'CREATE DICTIONARY web.names_dict\n')
    writeFileSync(join(archive, 'schema', 'web.summe.sql'), 'CREATE MATERIALIZED VIEW web.summe\n')
    writeFileSync(join(archive, 'data', 'web.events.native'), 'e')
    writeFileSync(join(archive, 'data', 'web.names.native'), 'n')
    stub('chclient', [
      'case "$1" in',
      '  --multiquery) echo "bau $(head -n 1 | cut -d" " -f1-4)" >> "$STUB_DIR/ch.log" ;;',
      '  -q)',
      '    case "$2" in',
      '      "SELECT 1") echo 1 ;;',
      `      *system.tables*) echo ${existing} ;;`,
      '      "SELECT count()"*) echo 4 ;;',
      '      INSERT*) cat > /dev/null; echo "daten $(echo "$2" | cut -d" " -f3)" >> "$STUB_DIR/ch.log" ;;',
      '      *) echo "abfrage $2" >> "$STUB_DIR/ch.log" ;;',
      '    esac ;;',
      'esac',
    ].join('\n'))
    return spawnSync('bash', [RESTORE, archive], { encoding: 'utf8', env: { ...process.env, STUB_DIR: stubDir, CLICKHOUSE_CLIENT: join(dir, 'bin', 'chclient') } })
  }

  it('hält die Reihenfolge: Wörterbücher, Tabellen, Daten ohne dictGet zuerst, Sichten zuletzt', () => {
    const result = restoreSetup('0')
    expect(result.status).toBe(0)
    expect(readFileSync(join(stubDir, 'ch.log'), 'utf8').trim().split('\n')).toEqual([
      'abfrage CREATE DATABASE IF NOT EXISTS `web`',
      'bau CREATE DICTIONARY web.names_dict',
      'bau CREATE TABLE web.events (c',
      'bau CREATE TABLE web.names (id',
      'daten `web`.`names`',
      'daten `web`.`events`',
      'bau CREATE MATERIALIZED VIEW web.summe',
    ])
    expect(result.stdout).toBe('web.events\t4\nweb.names\t4\n')
  })

  it('überschreibt nichts: stehen schon Tabellen da, geschieht kein Handgriff', () => {
    const result = restoreSetup('3')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('stehen schon 3 Tabellen')
    expect(existsSync(join(stubDir, 'ch.log'))).toBe(false)
  })
})
