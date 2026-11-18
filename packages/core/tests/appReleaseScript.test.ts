import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * CI1 (b) / RW1 (c), 2026-11-18: `ops/app-release.sh` trägt die Handgriffe
 * des Auslieferns — Stand empfangen, Verweis umlegen, Prozess neu laden,
 * aufräumen. Auf dem Server ist es der FESTE BEFEHL des Ausliefer-Schlüssels
 * (Tor-Modus: der gewünschte Befehl kommt in `SSH_ORIGINAL_COMMAND`), der
 * Rückweg `ops/rollback.sh` schickt dieselbe Datei über die Standard-Eingabe
 * (dafür: `rollbackScript.test.ts`).
 *
 * Hier läuft es gegen eine ATTRAPPE im Tor-Modus:
 *
 *   <wurzel>/ops/apps.conf                  die App-Liste auf dem Server
 *   <wurzel>/releases/help/<commit>/…       die Stände, `current` der Verweis
 *   <wurzel>/help.pukalani.app/ops/…        Ecosystem-Datei + der ECHTE pm2-heal.sh
 *   bin/pm2                                 Stellvertreter
 *
 * Was dieser Test NICHT sieht: zwei Läufe zur selben Zeit und ein Abbruch
 * mitten im Empfangen (braucht `flock` und echte Prozesse — dafür
 * `ops/app-release-attrappe.sh` in einem Linux-Container) und sshd selbst.
 */
const REPO = join(__dirname, '..', '..', '..')
const SCRIPT = join(REPO, 'ops', 'app-release.sh')
const INSTALLED = '/home/ploi/ops/app-release.sh'

const OLD = `abc1234${'0'.repeat(33)}`
const LIVE = `def5678${'1'.repeat(33)}`
const NEXT = `7777777${'3'.repeat(33)}`

let dir: string
let root: string
let state: string

const releases = () => join(root, 'releases', 'help')
const current = () => readlinkSync(join(releases(), 'current')).split('/').pop()
const pm2Calls = () => (existsSync(join(state, 'log')) ? readFileSync(join(state, 'log'), 'utf8') : '')
  .split('\n').filter(line => line.startsWith('pm2 '))

function release(sha: string, minutesAgo: number, marker = sha) {
  const base = join(releases(), sha)
  mkdirSync(join(base, 'server'), { recursive: true })
  writeFileSync(join(base, 'server', 'index.mjs'), `// ${marker}\n`)
  const when = new Date(Date.now() - minutesAgo * 60_000)
  utimesSync(base, when, when)
}

/** Ein Aufruf, wie sshd ihn unter dem festen Befehl macht: ohne Parameter, der Wunsch in der Umgebung. */
function gate(command: string, input?: Buffer | string) {
  const result = spawnSync('bash', [SCRIPT], {
    input,
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      SSH_ORIGINAL_COMMAND: command,
      APP_RELEASE_ROOT: root,
      APP_RELEASE_LOCK_WAIT: '5',
      STUB_DIR: state,
      STUB_ROOT: root,
    },
  })
  const stdout = result.stdout ?? Buffer.alloc(0)
  return { code: result.status, out: `${stdout.toString('utf8')}${(result.stderr ?? '').toString()}`, stdout }
}

/** Ein tar aus einem Wegwerf-Ordner, optional zstd-gepackt. `files`: Pfad → Inhalt (`null` = Verzeichnis). */
function archive(files: Record<string, string | null>, zstd = false) {
  const stage = mkdtempSync(join(dir, 'pack-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(stage, path)
    if (content === null) { mkdirSync(target, { recursive: true }); continue }
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  const top = readdirSync(stage)
  const tar = spawnSync('tar', ['-C', stage, '-cf', '-', ...top])
  expect(tar.status).toBe(0)
  if (!zstd) return tar.stdout
  const packed = spawnSync('zstd', ['-q', '-c'], { input: tar.stdout })
  expect(packed.status).toBe(0)
  return packed.stdout
}

const outputOf = (marker: string) => archive({ '.output/server/index.mjs': `// ${marker}\n`, '.output/public/a.txt': 'a' }, true)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-release-'))
  root = join(dir, 'server')
  state = join(dir, 'state')
  mkdirSync(join(dir, 'bin'))
  mkdirSync(state)
  mkdirSync(join(root, 'ops'), { recursive: true })
  writeFileSync(join(root, 'ops', 'apps.conf'), '# App  Site\nhelp   help.pukalani.app\ncontrol admin.pukalani.app # Betreiber\n')
  mkdirSync(join(root, 'help.pukalani.app', 'ops'), { recursive: true })
  writeFileSync(join(root, 'help.pukalani.app', 'ops', 'ecosystem-help.config.cjs'), 'module.exports = {}\n')
  copyFileSync(join(REPO, 'ops', 'pm2-heal.sh'), join(root, 'help.pukalani.app', 'ops', 'pm2-heal.sh'))
  release(OLD, 30)
  release(LIVE, 1)
  symlinkSync(join(releases(), LIVE), join(releases(), 'current'))

  const pm2 = join(dir, 'bin', 'pm2')
  writeFileSync(pm2, [
    '#!/usr/bin/env bash',
    'echo "pm2 $*" >> "$STUB_DIR/log"',
    'case "$1" in',
    '  jlist) echo "[]" ;;',
    '  describe) exit 1 ;;',
    '  startOrReload) if [ -f "$STUB_DIR/pm2-fail" ]; then echo "│ tabelle │"; echo "Error: Script not found"; exit 1; fi ;;',
    'esac',
    '',
  ].join('\n'))
  chmodSync(pm2, 0o755)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/app-release.sh — das Tor', () => {
  it.each([
    ['eine freie Shell-Zeile', 'cat /etc/passwd'],
    ['rsync', 'rsync --server -logDtprze.iLsfxCIvu . /home/ploi/releases/help/'],
    ['scp', 'scp -t /tmp/x'],
    ['ein leerer Wunsch', ' '],
  ])('lehnt %s ab', (_label, command) => {
    const { code, out } = gate(command)
    expect(code).toBe(64)
    expect(out).toContain('Abgelehnt')
    expect(pm2Calls()).toEqual([])
  })

  it.each([
    ['ein Semikolon', `activate help ${OLD}; id`],
    ['eine Ersetzung', 'activate help $(id)'],
    ['eine Pipe', `list help | cat`],
    ['Anführungszeichen', `activate "help" ${OLD}`],
  ])('lehnt %s ab, bevor ein Wort gelesen wird', (_label, command) => {
    const { code, out } = gate(command)
    expect(code).toBe(64)
    expect(out).toContain('unerlaubte Zeichen')
    expect(current()).toBe(LIVE)
  })

  it('lässt den Aufrufer weder Site noch Wurzel wählen', () => {
    for (const command of [`activate help ${OLD} --site help.pukalani.app`, `list help --root /tmp`]) {
      const { code, out } = gate(command)
      expect(code).toBe(64)
      expect(out).toContain('nicht erlaubt')
    }
    expect(current()).toBe(LIVE)
  })

  it('kennt nur Apps aus der Liste auf dem Server', () => {
    for (const command of [`release-put fremd ${NEXT}`, 'list fremd', 'prune fremd', `activate fremd ${OLD}`, 'ops-put fremd']) {
      const { code, out } = gate(command, outputOf('x'))
      expect(code, command).toBe(2)
      expect(out).toContain('Unbekannte App')
    }
    expect(existsSync(join(root, 'releases', 'fremd'))).toBe(false)
  })

  it('nimmt den eigenen Pfad als erstes Wort an (so ruft der Workflow es auf)', () => {
    const { code, out } = gate(`${INSTALLED} list help`)
    expect(code).toBe(0)
    expect(out).toContain(`current ${LIVE}`)
    expect(out).toMatch(new RegExp(`release ${OLD} \\d+ 1`))
  })
})

describe('ops/app-release.sh — einen Stand empfangen', () => {
  it('legt einen neuen Stand vollständig an seinen Platz und fasst den Verweis nicht an', () => {
    const { code, out } = gate(`release-put help ${NEXT}`, outputOf('neu'))
    expect(out).toContain(`empfangen: help ${NEXT}`)
    expect(code).toBe(0)
    expect(readFileSync(join(releases(), NEXT, 'server', 'index.mjs'), 'utf8')).toBe('// neu\n')
    expect(existsSync(join(releases(), NEXT, 'public', 'a.txt'))).toBe(true)
    expect(current()).toBe(LIVE)
    expect(readdirSync(releases()).filter(name => name.startsWith('.incoming-'))).toEqual([])
  })

  // RW1 (c): ein manueller Start mit dem Commit, der gerade live ist.
  it('überschreibt den aktiven Stand NICHT', () => {
    const before = lstatSync(join(releases(), LIVE, 'server', 'index.mjs')).ino
    const { code, out } = gate(`release-put help ${LIVE}`, outputOf('anderer Inhalt'))
    expect(code).toBe(0)
    expect(out).toContain('nicht überschrieben')
    expect(readFileSync(join(releases(), LIVE, 'server', 'index.mjs'), 'utf8')).toBe(`// ${LIVE}\n`)
    expect(lstatSync(join(releases(), LIVE, 'server', 'index.mjs')).ino).toBe(before)
  })

  it('ersetzt einen liegenden, nicht aktiven Stand als Ganzes', () => {
    writeFileSync(join(releases(), OLD, 'rest-von-frueher.txt'), 'x')
    const { code } = gate(`release-put help ${OLD}`, outputOf('frisch'))
    expect(code).toBe(0)
    expect(readFileSync(join(releases(), OLD, 'server', 'index.mjs'), 'utf8')).toBe('// frisch\n')
    expect(existsSync(join(releases(), OLD, 'rest-von-frueher.txt'))).toBe(false)
    expect(readdirSync(releases()).filter(name => name.startsWith('.'))).toEqual(['.lock'].filter(() => existsSync(join(releases(), '.lock'))))
  })

  it.each([
    ['ein abgeschnittenes Archiv', () => outputOf('halb').subarray(0, 40)],
    ['etwas, das kein Archiv ist', () => Buffer.from('kein archiv')],
    ['ein Archiv ohne server/index.mjs', () => archive({ '.output/public/a.txt': 'a' }, true)],
    ['eine leere Eingabe', () => Buffer.alloc(0)],
  ])('verwirft %s und lässt nichts liegen', (_label, make) => {
    const { code, out } = gate(`release-put help ${NEXT}`, make())
    expect(code).toBe(3)
    expect(out).toContain('nichts geändert')
    expect(existsSync(join(releases(), NEXT))).toBe(false)
    expect(readdirSync(releases()).filter(name => name.startsWith('.incoming-'))).toEqual([])
    expect(current()).toBe(LIVE)
  })

  it.each([
    ['ein Kürzel', OLD.slice(0, 12)],
    ['einen Pfad', '../current'],
    ['den Namen des Verweises', 'current'],
  ])('nimmt %s nicht als Commit', (_label, sha) => {
    const { code } = gate(`release-put help ${sha}`, outputOf('x'))
    expect(code).toBe(3)
    expect(current()).toBe(LIVE)
  })
})

describe('ops/app-release.sh — umstellen', () => {
  it('legt den Verweis um, heilt, lädt den Prozess der Site neu und sichert', () => {
    const { code, out } = gate(`activate help ${OLD}`)
    expect(out).toContain(`umgestellt: help von ${LIVE} auf ${OLD}`)
    expect(code).toBe(0)
    expect(current()).toBe(OLD)
    const calls = pm2Calls()
    expect(calls.some(c => c.startsWith('pm2 startOrReload') && c.endsWith('/help.pukalani.app/ops/ecosystem-help.config.cjs --update-env'))).toBe(true)
    expect(calls).toContain('pm2 save')
    // Der Heiler lief VOR dem Neuladen (er fragt pm2 nach dem Prozess).
    expect(calls.findIndex(c => c === 'pm2 jlist')).toBeLessThan(calls.findIndex(c => c.startsWith('pm2 startOrReload')))
    expect(existsSync(join(root, 'help.pukalani.app', 'public'))).toBe(true)
  })

  it('legt den Verweis zurück, wenn der Neustart scheitert, und zeigt keine pm2-Tabelle', () => {
    writeFileSync(join(state, 'pm2-fail'), '')
    const { code, out } = gate(`activate help ${OLD}`)
    expect(code).toBe(5)
    expect(out).toContain('Neustart ist gescheitert')
    expect(out).toContain('Script not found')
    expect(out).not.toContain('│')
    expect(current()).toBe(LIVE)
  })

  it('bricht vor jedem Handgriff ab, wenn der Stand fehlt oder unvollständig ist', () => {
    rmSync(join(releases(), OLD, 'server', 'index.mjs'))
    for (const sha of [OLD, NEXT]) {
      const { code, out } = gate(`activate help ${sha}`)
      expect(code).toBe(3)
      expect(out).toContain('nichts geändert')
    }
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })

  it('bricht ab, wenn der Site die Ecosystem-Datei fehlt', () => {
    rmSync(join(root, 'help.pukalani.app', 'ops', 'ecosystem-help.config.cjs'))
    const { code } = gate(`activate help ${OLD}`)
    expect(code).toBe(4)
    expect(current()).toBe(LIVE)
    expect(pm2Calls()).toEqual([])
  })

  it('empfangen und umstellen ergeben zusammen ein Ausliefern', () => {
    expect(gate(`release-put help ${NEXT}`, outputOf('neu')).code).toBe(0)
    expect(gate(`activate help ${NEXT}`).code).toBe(0)
    expect(current()).toBe(NEXT)
    // … und der Weg zurück auf den Stand davor.
    expect(gate(`activate help ${LIVE}`).code).toBe(0)
    expect(current()).toBe(LIVE)
  })
})

describe('ops/app-release.sh — aufräumen', () => {
  it('behält die vier neuesten Stände und IMMER den aktiven', () => {
    // Der aktive Stand ist hier der ÄLTESTE (nach einem Rückweg).
    const extra = ['1', '2', '3', '4', '5'].map(n => `${n.repeat(7)}${'a'.repeat(33)}`)
    extra.forEach((sha, index) => release(sha, 10 + index))
    rmSync(join(releases(), 'current'))
    symlinkSync(join(releases(), OLD), join(releases(), 'current'))
    mkdirSync(join(releases(), 'kein-stand'))

    const { code, out } = gate('prune help')
    expect(code).toBe(0)
    // Sieben Stände: LIVE (1 min) und extra[0..2] sind die vier neuesten, OLD ist aktiv.
    expect(out).toContain('2 alte Stände entfernt')
    const left = readdirSync(releases()).filter(name => /^[0-9a-f]{40}$/.test(name)).sort()
    expect(left).toEqual([LIVE, extra[0], extra[1], extra[2], OLD].sort())
    expect(existsSync(join(releases(), 'kein-stand'))).toBe(true)
    expect(current()).toBe(OLD)
  })
})

describe('ops/app-release.sh — die Dateien der Site', () => {
  const opsDir = () => join(root, 'help.pukalani.app', 'ops')

  it('nimmt die Ecosystem-Datei der App und Namen von der Liste', () => {
    const { code, out } = gate('ops-put help', archive({
      'ecosystem-help.config.cjs': 'module.exports = { neu: true }\n',
      'pm2-heal.sh': '#!/usr/bin/env bash\nexit 0\n',
      'cron.conf': '# liste\n',
    }))
    expect(out).toContain('empfangen: 3 Dateien für help')
    expect(code).toBe(0)
    expect(readFileSync(join(opsDir(), 'ecosystem-help.config.cjs'), 'utf8')).toContain('neu: true')
    expect(lstatSync(join(opsDir(), 'pm2-heal.sh')).mode & 0o111).not.toBe(0)
    expect(lstatSync(join(opsDir(), 'cron.conf')).mode & 0o111).toBe(0)
  })

  it.each([
    ['eine Datei, die nicht auf der Liste steht', { 'pm2-heal.sh': 'x', 'fremd.sh': 'x' }],
    ['die Ecosystem-Datei einer ANDEREN App', { 'ecosystem-control.config.cjs': 'x' }],
    ['ein Verzeichnis', { 'pm2-heal.sh': 'x', 'unterordner': null }],
    ['eine Punkt-Datei', { '.bashrc': 'x' }],
  ] as [string, Record<string, string | null>][])('verwirft die ganze Lieferung bei %s', (_label, files) => {
    const before = readFileSync(join(opsDir(), 'pm2-heal.sh'), 'utf8')
    const { code, out } = gate('ops-put help', archive(files))
    expect(code).toBe(3)
    expect(out).toContain('nichts geändert')
    expect(readFileSync(join(opsDir(), 'pm2-heal.sh'), 'utf8')).toBe(before)
    expect(readdirSync(join(root, 'help.pukalani.app')).filter(name => name.startsWith('.ops-incoming'))).toEqual([])
  })

  it('verwirft einen Verweis statt einer Datei', () => {
    const stage = mkdtempSync(join(dir, 'link-'))
    symlinkSync('/etc/passwd', join(stage, 'pm2-heal.sh'))
    const tar = spawnSync('tar', ['-C', stage, '-cf', '-', 'pm2-heal.sh'])
    const { code } = gate('ops-put help', tar.stdout)
    expect(code).toBe(3)
    expect(lstatSync(join(opsDir(), 'pm2-heal.sh')).isSymbolicLink()).toBe(false)
  })

  it('führt genau die Liste, die der Workflow schickt', () => {
    // Was `deliver` in deploy.yml für `ops-put` einpackt, muss das Skript
    // annehmen — sonst scheitert das Ausliefern erst auf dem Server.
    const script = readFileSync(SCRIPT, 'utf8')
    const allowed = /OPS_FILES="([^"]+)"/.exec(script)?.[1]?.split(/\s+/) ?? []
    const deploy = readFileSync(join(REPO, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const listOf = (name: string) => new RegExp(`${name}:\\s*'([^']+)'`).exec(deploy)?.[1]?.split(/\s+/) ?? []
    const sent = [...listOf('OPS_FILES'), ...listOf('WATCH_FILES')]
    expect(listOf('OPS_FILES').length).toBeGreaterThan(0)
    expect(listOf('WATCH_FILES').length).toBeGreaterThan(0)
    expect(sent.filter(name => !allowed.includes(name)), 'im Workflow, fehlt in OPS_FILES von ops/app-release.sh').toEqual([])
    expect(allowed.filter(name => !sent.includes(name)), 'auf der Liste des Skripts, wird aber nie geschickt').toEqual([])
    for (const name of allowed) {
      const source = existsSync(join(REPO, 'ops', name)) || existsSync(join(REPO, 'scripts', 'ops', name))
      expect(source, `${name} steht auf der Liste, liegt aber weder unter ops/ noch unter scripts/ops/`).toBe(true)
    }
  })
})

describe('ops/app-release.sh — Font-Cache', () => {
  const cache = () => join(root, 'fonts-cache')

  it('ergänzt Schrift-Dateien nur und erneuert die Metadaten', () => {
    mkdirSync(join(cache(), 'meta'), { recursive: true })
    writeFileSync(join(cache(), 'gut.woff2'), 'gut')
    writeFileSync(join(cache(), 'meta', 'a-data.json'), 'alt')
    const { code } = gate('fonts-put', archive({
      'fonts/gut.woff2': 'vom Runner',
      'fonts/neu.woff2': 'neu',
      'fonts/meta/a-data.json': 'frisch',
    }))
    expect(code).toBe(0)
    expect(readFileSync(join(cache(), 'gut.woff2'), 'utf8')).toBe('gut')
    expect(readFileSync(join(cache(), 'neu.woff2'), 'utf8')).toBe('neu')
    expect(readFileSync(join(cache(), 'meta', 'a-data.json'), 'utf8')).toBe('frisch')
  })

  it('gibt den Cache als tar aus — auch wenn es noch keinen gibt', () => {
    const empty = gate('fonts-get')
    expect(empty.code).toBe(0)
    mkdirSync(join(cache(), 'meta'), { recursive: true })
    writeFileSync(join(cache(), 'meta', 'a-data.json'), 'x')
    const { code, stdout } = gate('fonts-get')
    expect(code).toBe(0)
    const names = spawnSync('tar', ['-tf', '-'], { input: stdout }).stdout.toString()
    expect(names).toContain('meta/a-data.json')
  })
})
