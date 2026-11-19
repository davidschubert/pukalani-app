import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GATE_NOT_CHECKED, GATE_REJECTED, WATCH_GATE, gateSshArgs } from '../../../scripts/ops/app-watch-gate.mjs'
import { answerFrom as answerFromNode } from '../../../scripts/ops/verify-node-version.mjs'
import { SERVER_FILES, answerFrom, compareSums, parseSums } from '../../../scripts/ops/verify-server-scripts.mjs'
import { ENV_STATE_AWK } from '../../../scripts/ops/verify-site-env.mjs'

/**
 * CI1 (a) und (c), 2026-11-18: `ops/app-watch-gate.sh` ist auf app-prod das
 * Tor des Wächter-Schlüssels. Die sechs Prüf-Skripte schicken nur noch seine
 * festen Worte; `sums` meldet die von Hand eingespielten Dateien, und
 * `scripts/ops/verify-server-scripts.mjs` vergleicht sie mit dem Repo.
 *
 * Hier läuft das Tor gegen eine ATTRAPPE im Tor-Modus (der Wunsch in
 * `SSH_ORIGINAL_COMMAND`, wie unter dem festen Befehl):
 *
 *   <wurzel>/ops/apps.conf                    die App-Liste auf dem Server
 *   <wurzel>/<site>/.env                      mit einem erkennbaren Geheimnis
 *   <wurzel>/platform.pukalani.app/ops/…      Stellvertreter der Prüf-Skripte
 *   <wurzel>/.pm2/logs/…-error-0.log          pm2-Fehlerlog
 *
 * Was dieser Test NICHT sieht: sshd selbst, scp und rsync gegen einen echten
 * Server — dafür `ops/app-watch-gate-attrappe.sh` (Wegwerf-Container).
 */
const REPO = join(__dirname, '..', '..', '..')
const GATE = join(REPO, 'ops', 'app-watch-gate.sh')
const CERT_GATE = join(REPO, 'ops', 'appwrite-cert-gate.sh')
const MARKER = 'GEHEIM-WERT-7f3a9c'

let dir: string
let root: string

/** Ein Aufruf wie unter dem festen Befehl: der Wunsch in der Umgebung, mit dem Pfad des Tors davor. */
function gate(command: string, env: Record<string, string> = {}) {
  const result = spawnSync('bash', [GATE], {
    encoding: 'utf8',
    env: { ...process.env, APP_WATCH_ROOT: root, SSH_ORIGINAL_COMMAND: command, ...env },
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout }
}
const word = (line: string, env: Record<string, string> = {}) => gate(`${WATCH_GATE} ${line}`, env)

/** Ein Stellvertreter, der seine Angaben ausgibt und mit STUB_EXIT endet. */
function stub(path: string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, path.endsWith('.sh')
    ? '#!/usr/bin/env bash\necho "stub $(basename "$0") $*"\nexit "${STUB_EXIT:-0}"\n'
    : 'console.log(`stub ${process.argv[1].split("/").pop()} ${process.argv.slice(2).join(" ")}`)\nprocess.exit(Number(process.env.STUB_EXIT || 0))\n')
}

/** Stellvertreter für pm2 (`jlist` gibt den Text aus) und für das Programm, mit dem pm2 startet. */
function nodeWorld(jlist: string | null, program: string | null = 'v24.22.3') {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const env: Record<string, string> = { PATH: `${bin}:${process.env.PATH}`, APP_WATCH_NODE: join(bin, 'server-node') }
  if (jlist !== null) {
    writeFileSync(join(dir, 'jlist.txt'), jlist)
    writeFileSync(join(bin, 'pm2'), `#!/usr/bin/env bash\n[ "$1" = jlist ] && cat "${join(dir, 'jlist.txt')}"\nexit 0\n`, { mode: 0o755 })
  }
  else {
    writeFileSync(join(bin, 'pm2'), '#!/usr/bin/env bash\necho "kaputt" >&2\nexit 1\n', { mode: 0o755 })
  }
  if (program !== null) writeFileSync(env.APP_WATCH_NODE, `#!/usr/bin/env bash\necho "${program}"\n`, { mode: 0o755 })
  return env
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-watch-gate-'))
  root = join(dir, 'server')
  mkdirSync(join(root, 'ops'), { recursive: true })
  writeFileSync(join(root, 'ops', 'apps.conf'), '# App  Site\nhelp      help.pukalani.app\nplatform  platform.pukalani.app # Pool\n')
  mkdirSync(join(root, 'platform.pukalani.app'), { recursive: true })
  writeFileSync(join(root, 'platform.pukalani.app', '.env'), [
    `NUXT_APPWRITE_KEY=${MARKER}`,
    'NUXT_SMTP_PASS=',
    `  NUXT_SMTP_USER = "${MARKER}"  `,
    'NUXT_PUBLIC_APPWRITE_PROJECT_ID=account',
    '# Kommentar',
    '',
  ].join('\n'))
  for (const name of ['verify-stale-keys.mjs', 'verify-instance-admins.mjs', 'app-watch-counts.mjs', 'nginx-check.mjs', 'cron-check.sh']) {
    stub(join(root, 'platform.pukalani.app', 'ops', name))
  }
  stub(join(root, 'help.pukalani.app', 'ops', 'app-watch-counts.mjs'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ops/app-watch-gate.sh — was abgelehnt wird', () => {
  it.each([
    ['eine freie Befehlszeile', 'echo frei'],
    ['eine Shell-Zeile', 'cat /home/ploi/platform.pukalani.app/.env'],
    ['scp', 'scp -t /tmp/pukalani-stale-keys.mjs'],
    ['rsync', 'rsync --server -logDtprze.iLsfxCIvu . /home/ploi/x/'],
    ['ein leerer Wunsch', ' '],
    ['der Pfad allein', WATCH_GATE],
    ['ein fremdes Skript mit gleichem Pfad-Ende', '/tmp/app-watch-gate.sh.x sums'],
  ])('lehnt %s ab (Exit 64, „Abgelehnt: erlaubt sind …")', (_label, command) => {
    const { code, out } = gate(command)
    expect(code).toBe(GATE_REJECTED)
    expect(out).toMatch(/^Abgelehnt: erlaubt sind site-env, site-project, stale-keys, instance-admins, mail-breaker, app-signals, nginx-check, cron-check, sums, node-version\.\n$/)
  })

  it.each([
    ['ein Semikolon', 'sums; id'],
    ['eine Ersetzung', 'site-env $(id)'],
    ['eine Pipe', 'sums | cat'],
    ['Anführungszeichen', 'site-env "platform.pukalani.app"'],
    ['eine Umleitung', 'sums > /tmp/x'],
    ['ein Stern', 'site-env *'],
  ])('lehnt %s ab, bevor ein Wort gelesen wird', (_label, command) => {
    const { code, out } = word(command)
    expect(code).toBe(GATE_REJECTED)
    expect(out).toBe('Abgelehnt: unerlaubte Zeichen im Befehl.\n')
  })

  it.each([
    ['eine Site außerhalb der Liste', 'site-env fremd.example.org', 'steht nicht in der App-Liste'],
    ['ein Pfad statt einer Site', 'site-env ../ops', 'ungültige Site'],
    ['eine App außerhalb der Liste', 'app-signals fremd 25', 'steht nicht in der App-Liste'],
    ['eine Site statt einer App', 'app-signals platform.pukalani.app 25', 'ungültiger App-Name'],
    ['Stunden, die keine Zahl sind', 'app-signals help 25h', 'keine Zahl'],
    ['einen Zeitpunkt in falscher Form', 'mail-breaker 2026-11-18', 'Form'],
    ['ein Ereignis in falscher Form', 'mail-breaker 2026-11-18T04:17:00.000Z ../x', 'Ereignis'],
    ['eine fremde Angabe bei stale-keys', 'stale-keys --strict', 'nimmt nur'],
    ['eine Wurzel vom Aufrufer', 'stale-keys --dir /tmp', 'falsche Zahl'],
    ['zu viele Angaben', 'sums all', 'falsche Zahl'],
    ['eine Angabe bei node-version', 'node-version /usr/local/bin/node', 'falsche Zahl'],
    ['fehlende Angaben', 'site-project', 'falsche Zahl'],
  ])('lehnt %s ab', (_label, line, reason) => {
    const { code, out } = word(line)
    expect(code).toBe(GATE_REJECTED)
    expect(out).toMatch(/^Abgelehnt: /)
    expect(out).toContain(reason)
    expect(out).not.toContain('stub ')
  })
})

describe('ops/app-watch-gate.sh — die Worte', () => {
  it('site-env: Namen und „leer/nicht leer", nie ein Wert', () => {
    const { code, stdout } = word('site-env platform.pukalani.app')
    expect(code).toBe(0)
    expect(stdout).toBe('NUXT_APPWRITE_KEY=1\nNUXT_SMTP_PASS=0\nNUXT_SMTP_USER=1\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=1\n')
    expect(stdout).not.toContain(MARKER)
  })

  it('site-env: dasselbe Programm wie ENV_STATE_AWK im Prüf-Skript, wortgleich und mit gleichem Ergebnis', () => {
    expect(readFileSync(GATE, 'utf8')).toContain(`ENV_STATE_AWK='${ENV_STATE_AWK}'`)
    const local = spawnSync('awk', [ENV_STATE_AWK, join(root, 'platform.pukalani.app', '.env')], { encoding: 'utf8' }).stdout
    expect(word('site-env platform.pukalani.app').stdout).toBe(local)
  })

  it('site-env und site-project: ohne .env die feste Marke', () => {
    expect(word('site-env help.pukalani.app')).toMatchObject({ code: 0, stdout: '__NO_ENV_FILE__\n' })
    expect(word('site-project help.pukalani.app')).toMatchObject({ code: 0, stdout: '__NO_ENV_FILE__\n' })
  })

  it('site-project: nur die öffentliche Projekt-Id, ohne Anführungszeichen', () => {
    expect(word('site-project platform.pukalani.app')).toMatchObject({ code: 0, stdout: 'account\n' })
    writeFileSync(join(root, 'platform.pukalani.app', '.env'), `NUXT_APPWRITE_KEY=${MARKER}\nNUXT_PUBLIC_APPWRITE_PROJECT_ID="branding"\r\nNUXT_PUBLIC_APPWRITE_PROJECT_ID=zweite\n`)
    expect(word('site-project platform.pukalani.app')).toMatchObject({ code: 0, stdout: 'branding\n' })
  })

  it('site-project: ein Wert, der keine Projekt-Id ist, kommt nicht hinaus', () => {
    writeFileSync(join(root, 'platform.pukalani.app', '.env'), `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${MARKER} mit Leerzeichen\n`)
    const { code, stdout } = word('site-project platform.pukalani.app')
    expect(code).toBe(0)
    expect(stdout).toBe('__INVALID__\n')
    writeFileSync(join(root, 'platform.pukalani.app', '.env'), `NUXT_APPWRITE_KEY=${MARKER}\n`)
    expect(word('site-project platform.pukalani.app')).toMatchObject({ code: 0, stdout: '' })
  })

  it.each(['stale-keys', 'instance-admins'])('%s: das ausgelieferte Prüf-Skript über die Wurzel, mit und ohne strict', (name) => {
    expect(word(name)).toMatchObject({ code: 0, stdout: `stub verify-${name}.mjs --dir ${root}\n` })
    expect(word(`${name} strict`)).toMatchObject({ code: 0, stdout: `stub verify-${name}.mjs --dir ${root} --strict\n` })
  })

  it.each(['stale-keys', 'instance-admins'])('%s: reicht den Exit-Code durch (1 = Fund)', (name) => {
    expect(word(`${name} strict`, { STUB_EXIT: '1' }).code).toBe(1)
  })

  it('stale-keys: steht platform nicht in der Liste, die erste Site', () => {
    writeFileSync(join(root, 'ops', 'apps.conf'), 'help help.pukalani.app\n')
    stub(join(root, 'help.pukalani.app', 'ops', 'verify-stale-keys.mjs'))
    expect(word('stale-keys')).toMatchObject({ code: 0, stdout: `stub verify-stale-keys.mjs --dir ${root}\n` })
  })

  it.each(['stale-keys', 'instance-admins', 'nginx-check', 'cron-check'])('%s: fehlt das Skript auf dem Server, „nicht geprüft" mit Exit 6', (name) => {
    rmSync(join(root, 'platform.pukalani.app', 'ops'), { recursive: true })
    const { code, out } = word(name)
    expect(code).toBe(GATE_NOT_CHECKED)
    expect(out).toMatch(/^Nicht geprüft: .* liegt auf dem Server nicht unter <site>\/ops/)
  })

  it('ohne App-Liste auf dem Server: „nicht geprüft" mit Exit 6', () => {
    rmSync(join(root, 'ops', 'apps.conf'))
    for (const line of ['stale-keys', 'site-env platform.pukalani.app', 'app-signals help 25', 'nginx-check']) {
      const { code, out } = word(line)
      expect(code, line).toBe(GATE_NOT_CHECKED)
      expect(out).toContain('App-Liste fehlt')
    }
  })

  it('app-signals: das Zähl-Skript der Site dieser App, Prozess ohne Punkte', () => {
    expect(word('app-signals help 25')).toMatchObject({ code: 0, stdout: 'stub app-watch-counts.mjs helppukalaniapp 25\n' })
    expect(word('app-signals platform 025')).toMatchObject({ code: 0, stdout: 'stub app-watch-counts.mjs platformpukalaniapp 25\n' })
    expect(word('app-signals help 25', { STUB_EXIT: '5' }).code).toBe(5)
  })

  it('nginx-check und cron-check: die festen Skripte, Exit-Code durchgereicht', () => {
    expect(word('nginx-check')).toMatchObject({ code: 0, stdout: 'stub nginx-check.mjs \n' })
    expect(word('cron-check')).toMatchObject({ code: 0, stdout: 'stub cron-check.sh app-prod\n' })
    expect(word('cron-check', { STUB_EXIT: '3' }).code).toBe(3)
  })

  it('mail-breaker: nur „Zeitpunkt Ereignis" seit dem Zeitpunkt, nie der Rest der Zeile', () => {
    const logs = join(root, '.pm2', 'logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'platformpukalaniapp-error-0.log'), [
      `{"level":"warn","time":"2026-11-17T01:00:00.000Z","event":"auth.mail_route_breaker","route":"/api/auth/signup","x":"${MARKER}"}`,
      `{"level":"warn","time":"2026-11-18T03:00:00.000Z","event":"auth.mail_route_breaker","route":"/api/auth/signup","x":"${MARKER}"}`,
      `{"level":"warn","time":"2026-11-18T03:30:00.000Z","event":"community.seo_read_failed","x":"${MARKER}"}`,
      // Zeitpunkt NACH dem Ereignis: würde ungekürzt durchrutschen — das Tor lässt sie weg.
      `{"event":"auth.mail_route_breaker","x":"${MARKER}","time":"2026-11-18T03:40:00.000Z"}`,
      'kaputte Zeile "event":"auth.mail_route_breaker"',
      '',
    ].join('\n'))
    writeFileSync(join(logs, 'adminpukalaniapp-out-0.log'), `{"time":"2026-11-18T03:50:00.000Z","event":"auth.mail_route_breaker","x":"${MARKER}"}\n`)
    const normal = word('mail-breaker 2026-11-18T00:00:00.000Z')
    expect(normal).toMatchObject({ code: 0, stdout: '2026-11-18T03:00:00.000Z auth.mail_route_breaker\n' })
    const drill = word('mail-breaker 2026-11-01T00:00:00.000Z community.seo_read_failed')
    expect(drill).toMatchObject({ code: 0, stdout: '2026-11-18T03:30:00.000Z community.seo_read_failed\n' })
    expect(`${normal.out}${drill.out}`).not.toContain(MARKER)
  })

  it('mail-breaker: ohne Log-Dateien leer und Exit 0 (der Normalfall)', () => {
    expect(word('mail-breaker 2026-11-18T00:00:00.000Z')).toMatchObject({ code: 0, stdout: '' })
  })

  it('sums: je Datei eine Zeile in fester Form', () => {
    writeFileSync(join(root, 'ops', 'app-release.sh'), 'echo eins\n')
    const { code, stdout } = word('sums')
    expect(code).toBe(0)
    const hash = (text: string) => createHash('sha256').update(text).digest('hex')
    expect(stdout).toBe([
      `sum app-release.sh ${hash('echo eins\n')}`,
      'sum app-watch-gate.sh fehlt',
      `sum apps.conf ${hash(readFileSync(join(root, 'ops', 'apps.conf'), 'utf8'))}`,
      'sum app-env-bundle.sh fehlt',
      'sum appwrite-backup.pub.asc fehlt',
      '',
    ].join('\n'))
  })

  describe('node-version', () => {
    const proc = (name: string, version: unknown, extra: Record<string, unknown> = {}) => ({ name, pm2_env: { status: 'online', node_version: version, pm_cwd: `/home/ploi/${MARKER}`, ...extra } })

    it('das Programm und je Prozess der Liste die Version — Fremde nur als Zahl, nie ein Name oder Pfad', () => {
      const env = nodeWorld(`[PM2] Spawning PM2 daemon with pm2_home=/home/ploi/.pm2\n${JSON.stringify([
        proc('platformpukalaniapp', '24.22.3'),
        proc(`${MARKER}-logrotate`, '24.22.3'),
        proc('helppukalaniapp', '24.11.0'),
        proc('platformpukalaniapp', '24.22.3'),
      ])}\n`)
      const { code, stdout, out } = word('node-version', env)
      expect(code).toBe(0)
      expect(stdout).toBe([
        'program 24.22.3',
        'proc platformpukalaniapp 24.22.3',
        'proc helppukalaniapp 24.11.0',
        'proc platformpukalaniapp 24.22.3',
        'fremd 1',
        '',
      ].join('\n'))
      expect(out).not.toContain(MARKER)
    })

    it('eine Site ohne Prozess heißt „fehlt", eine Version in fremder Form „unlesbar"', () => {
      const env = nodeWorld(JSON.stringify([proc('helppukalaniapp', `24.22.3 ${MARKER}`), proc('adminpukalaniapp', 24)]), `v24.22.3-${MARKER}`)
      const { code, stdout, out } = word('node-version', env)
      expect(code).toBe(0)
      expect(stdout).toBe('program unlesbar\nproc helppukalaniapp unlesbar\nproc platformpukalaniapp fehlt\nfremd 1\n')
      expect(out).not.toContain(MARKER)
    })

    it('ohne Programm und ohne Antwort von pm2: feste Marken, Exit 0', () => {
      expect(word('node-version', nodeWorld(null, null))).toMatchObject({ code: 0, stdout: 'program fehlt\npm2 unlesbar\n' })
      expect(word('node-version', nodeWorld(`kein JSON ${MARKER}`))).toMatchObject({ code: 0, stdout: 'program 24.22.3\npm2 unlesbar\n' })
      expect(word('node-version', nodeWorld('[]'))).toMatchObject({ code: 0, stdout: 'program 24.22.3\nproc helppukalaniapp fehlt\nproc platformpukalaniapp fehlt\nfremd 0\n' })
    })

    it('ohne Vorgabe fragt das Tor /usr/bin/node — das Programm, mit dem pm2 startet', () => {
      expect(readFileSync(GATE, 'utf8')).toContain('NODE_BIN="${APP_WATCH_NODE:-/usr/bin/node}"')
    })

    it('jede Zeile des Tors liest das Prüf-Skript, und nur diese', () => {
      const env = nodeWorld(JSON.stringify([proc('platformpukalaniapp', '24.22.3'), proc('fremd', '1.2.3')]))
      const answer = answerFromNode({ status: 0, stdout: word('node-version', env).stdout })
      expect(answer).toEqual({ state: 'ok', program: '24.22.3', procs: [{ name: 'platformpukalaniapp', version: '24.22.3' }, { name: 'helppukalaniapp', version: 'fehlt' }], foreign: 1, pm2Unreadable: false })
    })
  })

  it('ohne festen Befehl (freier Schlüssel): dieselbe Zeile als Parameter liefert dasselbe', () => {
    const viaShell = spawnSync('bash', [GATE, 'site-env', 'platform.pukalani.app'], { encoding: 'utf8', env: { ...process.env, APP_WATCH_ROOT: root, SSH_ORIGINAL_COMMAND: '' } })
    expect(viaShell.status).toBe(0)
    expect(viaShell.stdout).toBe(word('site-env platform.pukalani.app').stdout)
    const free = spawnSync('bash', [GATE, 'echo', 'frei'], { encoding: 'utf8', env: { ...process.env, APP_WATCH_ROOT: root, SSH_ORIGINAL_COMMAND: '' } })
    expect(free.status).toBe(GATE_REJECTED)
  })

  it('kein Wort legt etwas an', () => {
    // Mit Stellvertreter für pm2: ein echtes `pm2 jlist` auf dem eigenen Rechner würde dessen Dienst starten.
    const env = nodeWorld('[]')
    const before = spawnSync('find', [root], { encoding: 'utf8' }).stdout
    for (const line of ['sums', 'node-version', 'site-env platform.pukalani.app', 'stale-keys strict', 'mail-breaker 2026-11-18T00:00:00.000Z', 'echo frei', 'scp -t /home/ploi/x']) word(line, env)
    expect(spawnSync('find', [root], { encoding: 'utf8' }).stdout).toBe(before)
  })
})

describe('ops/appwrite-cert-gate.sh — sums', () => {
  it('meldet das Tor selbst und die Dateien unter ~/ops in fester Form', () => {
    const ops = join(dir, 'aw-ops')
    mkdirSync(ops)
    writeFileSync(join(ops, 'cron.conf'), 'liste\n')
    const result = spawnSync('bash', [CERT_GATE, 'sums'], { encoding: 'utf8', env: { ...process.env, SUMS_SELF: CERT_GATE, SUMS_OPS_DIR: ops } })
    expect(result.status).toBe(0)
    const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
    expect(result.stdout).toBe([
      `sum pukalani-cert-gate.sh ${sha(CERT_GATE)}`,
      'sum cron-check.sh fehlt',
      `sum cron.conf ${sha(join(ops, 'cron.conf'))}`,
      'sum realtime-watchdog.sh fehlt',
      'sum appwrite-backup.sh fehlt',
      'sum appwrite-volumes.conf fehlt',
      'sum appwrite-backup.pub.asc fehlt',
      '',
    ].join('\n'))
  })

  it('nennt sums unter den erlaubten Worten', () => {
    const result = spawnSync('bash', [CERT_GATE, 'sums; id'], { encoding: 'utf8' })
    expect(result.status).toBe(64)
    expect(result.stdout).toContain('cron-status, sums.')
  })
})

describe('scripts/ops/verify-server-scripts.mjs — der Vergleich', () => {
  const repoSums = new Map(SERVER_FILES.map(f => [f.repo, createHash('sha256').update(f.repo).digest('hex')]))
  const answerFor = (server: string, change: (name: string, sum: string) => string | null = (_n, s) => s) => {
    const lines = SERVER_FILES.filter(f => f.server === server).map((f) => {
      const sum = change(f.name, repoSums.get(f.repo) as string)
      return sum === null ? '' : `sum ${f.name} ${sum}`
    })
    return answerFrom({ status: 0, stdout: `${lines.join('\n')}\n` })
  }

  it('alles wie im Repo: grün, keine Warnung', () => {
    const result = compareSums({ answers: new Map([['app-prod', answerFor('app-prod')], ['appwrite-prod', answerFor('appwrite-prod')]]), repoSums })
    expect(result.red).toEqual([])
    expect(result.notChecked).toEqual([])
    expect(result.lines).toHaveLength(SERVER_FILES.length)
  })

  it('eine abweichende Summe ist rot, mit Handgriff', () => {
    const changed = answerFor('appwrite-prod', (name, sum) => (name === 'cron.conf' ? 'a'.repeat(64) : sum))
    const { red } = compareSums({ answers: new Map([['app-prod', answerFor('app-prod')], ['appwrite-prod', changed]]), repoSums })
    expect(red).toHaveLength(1)
    expect(red[0]).toMatch(/^appwrite-prod: cron\.conf weicht von ops\/cron\.conf ab — neu einspielen \(docs\/runbooks\/CI-SCHLUESSEL-TAUSCHEN\.md/)
  })

  it('eine fehlende Datei ist rot', () => {
    const missing = answerFor('app-prod', (name, sum) => (name === 'app-watch-gate.sh' ? 'fehlt' : sum))
    const { red } = compareSums({ answers: new Map([['app-prod', missing], ['appwrite-prod', answerFor('appwrite-prod')]]), repoSums })
    expect(red).toEqual([expect.stringMatching(/^app-prod: app-watch-gate\.sh fehlt auf dem Server — ops\/app-watch-gate\.sh von Hand einspielen/)])
  })

  it('eine Datei, die das Tor nicht meldet, ist rot', () => {
    const short = answerFor('app-prod', (name, sum) => (name === 'apps.conf' ? null : sum))
    const { red } = compareSums({ answers: new Map([['app-prod', short], ['appwrite-prod', answerFor('appwrite-prod')]]), repoSums })
    expect(red).toEqual([expect.stringContaining('das Tor meldet apps.conf nicht')])
  })

  it('„Wort unbekannt" (Exit 64) und „nicht erreichbar" sind nicht rot, aber sichtbar', () => {
    const answers = new Map([
      ['app-prod', answerFrom({ status: 255, stdout: '' })],
      ['appwrite-prod', answerFrom({ status: 64, stdout: 'Abgelehnt: erlaubt sind probe, …\n' })],
    ])
    const { red, notChecked, lines } = compareSums({ answers, repoSums })
    expect(red).toEqual([])
    expect(lines).toEqual([])
    expect(notChecked).toEqual([
      expect.stringMatching(/^app-prod: nicht erreichbar \(Exit 255\) — NICHT GEPRÜFT/),
      expect.stringMatching(/^appwrite-prod: das Tor kennt das Wort „sums“ noch nicht — NICHT GEPRÜFT/),
    ])
  })

  it('eine Antwort ohne lesbare Zeile ist keine Aussage', () => {
    expect(answerFrom({ status: 0, stdout: 'irgendwas\nsum x y\n' })).toEqual({ state: 'unreachable', detail: 'Antwort ohne lesbare Zeile' })
    expect(parseSums(`sum a.sh ${'b'.repeat(64)}\nsum c fehlt\nsum ../x fehlt\nsum d ${'B'.repeat(64)}\n`)).toEqual(new Map([['a.sh', 'b'.repeat(64)], ['c', 'fehlt']]))
  })
})

describe('Tor, Zuordnung und Prüf-Skripte gehören zusammen', () => {
  const gateList = (source: string) => /^SUM_FILES='([^']+)'$/m.exec(source)?.[1].split(' ') ?? []

  it('die Zuordnung nennt genau die Dateien, die die beiden Tore melden', () => {
    expect(SERVER_FILES.filter(f => f.server === 'app-prod').map(f => f.name)).toEqual(gateList(readFileSync(GATE, 'utf8')))
    expect(SERVER_FILES.filter(f => f.server === 'appwrite-prod').map(f => f.name)).toEqual(['pukalani-cert-gate.sh', ...gateList(readFileSync(CERT_GATE, 'utf8'))])
    for (const file of SERVER_FILES) expect(existsSync(join(REPO, file.repo)), file.repo).toBe(true)
  })

  it('die Prüf-Skripte schicken nur Tor-Worte — kein scp, keine freie Zeile', () => {
    const scripts = ['verify-site-env', 'verify-stale-keys', 'verify-instance-admins', 'verify-mail-breaker', 'verify-app-signals', 'verify-server-config', 'verify-node-version']
    const gateWords = /^ {2}([a-z-]+(?:\|[a-z-]+)*)\)$/m
    const allowed = new Set(readFileSync(GATE, 'utf8').split('\n').filter(l => gateWords.test(l)).flatMap(l => l.trim().slice(0, -1).split('|')))
    for (const name of scripts) {
      const source = readFileSync(join(REPO, 'scripts', 'ops', `${name}.mjs`), 'utf8')
      expect(source, name).not.toMatch(/'scp'/)
      expect(source, name).not.toMatch(/\/home\/ploi\/\$\{/)
      expect(source, name).toContain('gateSshArgs(')
      for (const hit of source.matchAll(/gateSshArgs\([^,]+, '([a-z-]+)'/g)) expect(allowed.has(hit[1]), `${name}: ${hit[1]}`).toBe(true)
      for (const hit of source.matchAll(/(?:\['([a-z-]+)', 'strict'\]|appServer, \['([a-z-]+)'\])/g)) {
        const sent = hit[1] ?? hit[2]
        expect(allowed.has(sent), `${name}: ${sent}`).toBe(true)
      }
    }
  })

  it('die beiden Skripte, die auf dem Server laufen, laden den Tor-Weg erst im ssh-Zweig', () => {
    for (const name of ['verify-stale-keys', 'verify-instance-admins']) {
      const source = readFileSync(join(REPO, 'scripts', 'ops', `${name}.mjs`), 'utf8')
      expect(source, name).not.toMatch(/^import .*app-watch-gate/m)
      expect(source, name).toContain('await import(\'./app-watch-gate.mjs\')')
    }
    // … und das Ausliefern legt sie dorthin, wo das Tor sie sucht.
    expect(readFileSync(join(REPO, 'ops', 'app-release.sh'), 'utf8')).toMatch(/OPS_FILES="[^"]*verify-stale-keys\.mjs verify-instance-admins\.mjs/)
  })

  it('die Befehlszeile: der Pfad des Tors, dann Wort und Angaben', () => {
    expect(gateSshArgs('ploi@host', 'app-signals', 'help', '25').slice(-2)).toEqual(['ploi@host', '/home/ploi/ops/app-watch-gate.sh app-signals help 25'])
  })

  it('der Workflow fährt den Vergleich und den Hinweis zum Schlüssel', () => {
    const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')
    expect(workflow).toContain('run: node scripts/ops/verify-server-scripts.mjs --strict')
    expect(workflow).toContain('- name: Ist der Wächter-Schlüssel beschränkt?')
    expect(workflow).toMatch(/^# {1,2}16\. VON HAND EINGESPIELTE DATEIEN/m)
  })

  it('der Workflow fährt den Blick auf die Node-Version: Exit 2 ist eine Warnung, mit eigenem Probealarm', () => {
    const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')
    expect(workflow).toContain('node scripts/ops/verify-node-version.mjs --strict || code=$?')
    expect(workflow).toMatch(/^# {1,2}18\. NODE-VERSION DES APP-SERVERS/m)
    expect(workflow).toContain('node_drill:')
    expect(workflow).toContain(`PUKALANI_NODE_DRILL: \${{ inputs.node_drill && '1' || '0' }}`)
    expect(workflow).toMatch(/DRILL: \$\{\{ \([^)]*inputs\.node_drill[^)]*\) && '1' \|\| '0' \}\}/)
  })

  it('das Tor ist ausführbar und für bash 3.2 geschrieben (keine assoziativen Felder)', () => {
    const source = readFileSync(GATE, 'utf8')
    expect(source).not.toMatch(/declare -A|mapfile|readarray|\$\{[a-zA-Z_]+,,\}/)
    expect(spawnSync('bash', ['-n', GATE]).status).toBe(0)
    expect(statSync(GATE).mode & 0o111).toBe(0o111)
    expect(readdirSync(join(REPO, 'ops'))).toContain('app-watch-gate-attrappe.sh')
  })
})
