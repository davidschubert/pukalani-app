import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — reines .mjs ohne Typen (Betriebs-Skript)
import { RULES } from '../../../ops/nginx-check.mjs'
// @ts-expect-error — reines .mjs ohne Typen (Betriebs-Skript)
import { NGINX_RULES, evaluateCron, evaluateNginx, parseCronOutput, parseNginxOutput } from '../../../scripts/ops/server-config-rules.mjs'

/**
 * OPS-003 (2026-11-16): Webserver-Einstellungen und Zeitpläne stehen als
 * Vorlage im Repo, und ein täglicher Blick vergleicht sie mit dem Server.
 * Hier laufen die ECHTEN Skripte gegen Attrappen:
 *
 *   ops/nginx-check.mjs   gegen einen Ordner wie /etc/nginx, gefüllt aus den
 *                         Vorlagen (ops/nginx/) — und gegen eine Fassung, wie
 *                         Ploi sie nach einem Handgriff hinterlässt
 *   ops/cron-check.sh     gegen zwei Dateien statt `crontab -l` und /etc/crontab
 *   das Tor-Wort `cron-status` (ops/appwrite-cert-gate.sh)
 *
 * Zwei Dinge hält der Test fest, die kein Typecheck sieht: der Vergleich wird
 * NICHT rot, wenn Ploi eine Datei umschreibt (sonst überliest man ihn), und
 * KEINE Zeile aus einer nginx-Datei oder einem crontab verlässt den Server
 * (das Protokoll des Wächters ist öffentlich).
 */
// Jeder Test startet echte Prozesse (node, bash mit vielen kleinen Aufrufen) —
// auf einem ausgelasteten CI-Runner reichen die 5 s Standard nicht immer
// (ein Lauf mit vier Skript-Starts brauchte dort 5,3 s).
vi.setConfig({ testTimeout: 30_000 })

const REPO = join(__dirname, '..', '..', '..')
const NGINX_CHECK = join(REPO, 'ops', 'nginx-check.mjs')
const CRON_CHECK = join(REPO, 'ops', 'cron-check.sh')
const GATE = join(REPO, 'ops', 'appwrite-cert-gate.sh')
const VERIFY = join(REPO, 'scripts', 'ops', 'verify-server-config.mjs')
const TEMPLATES = join(REPO, 'ops', 'nginx')

const NGINX_LINE_FORMS = [
  /^nginx version=\d{1,3} sites=\d{1,3}$/,
  /^nginx site=[a-z0-9][a-z0-9.-]{2,80} ergebnis=passt$/,
  /^nginx site=[a-z0-9][a-z0-9.-]{2,80} ergebnis=(fehlt|zuviel) regel=[a-z-]{2,40}$/,
  /^nginx kundendomain nr=\d{1,4} ergebnis=(fehlt|zuviel) regel=[a-z-]{2,40}$/,
  /^nginx kundendomains anzahl=\d{1,4} passt=\d{1,4}$/,
  /^nginx auffangblock ergebnis=(passt|fehlt)$/,
  /^nginx unbekannt anzahl=\d{1,4}$/,
  /^nginx fertig$/,
]
const CRON_LINE_FORM = /^cron server=(app-prod|appwrite-prod) quelle=(benutzer|system) erwartet=\d{1,3} gefunden=\d{1,3} fehlt=[a-z0-9,-]{1,255} unbekannt=\d{1,3} doppelt=\d{1,3}$/

const CATCH_ALL = `server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    return 444;
}
`

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'server-config-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function template(name: string, values: Record<string, string>): string {
  let text = readFileSync(join(TEMPLATES, name), 'utf8')
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{{${key}}}`, value)
  expect(text, `Platzhalter in ${name} nicht gefüllt`).not.toMatch(/\{\{[A-Z_]+\}\}/)
  return text
}

const EINZEL = () => template('einzel-site.conf.template', { SITE: 'einzel.example.org', SERVER_NAMES: 'einzel.example.org', PORT: '3101' })
const LANG = () => template('einzel-site-lange-routen.conf.template', {
  SITE: 'lang.example.org',
  SERVER_NAMES: 'lang.example.org',
  PORT: '3102',
  LANGE_ROUTEN: '^/api/beispiel/(lang|laenger)$',
})
const POOL = () => template('pool-site.conf.template', { SITE: 'pool.example.org', ZONE: 'example.org', PORT: '3103' })
const KUNDE = (domain = 'kunde.example.net') => template('pool-kundendomain.conf.template', { SITE: 'pool.example.org', DOMAIN: domain, PORT: '3103' })

const SITES = `einzel.example.org einzel 3101 aus
lang.example.org lange-routen 3102 aus
pool.example.org pool 3103 aus
`

interface Layout {
  sites?: Record<string, string>
  tenants?: Record<string, string>
  list?: string
  catchAll?: boolean
}

/** Baut einen Ordner wie /etc/nginx und fährt das echte Skript dagegen. */
function nginxCheck(layout: Layout = {}, args: string[] = []) {
  const root = join(dir, 'nginx')
  mkdirSync(join(root, 'sites-enabled'), { recursive: true })
  mkdirSync(join(root, 'ploi', 'pool.example.org', 'before'), { recursive: true })
  const sites = layout.sites ?? { 'einzel.example.org': EINZEL(), 'lang.example.org': LANG(), 'pool.example.org': POOL() }
  for (const [name, text] of Object.entries(sites)) writeFileSync(join(root, 'sites-enabled', name), text)
  if (layout.catchAll !== false) writeFileSync(join(root, 'sites-enabled', '000-catchall'), CATCH_ALL)
  for (const [name, text] of Object.entries(layout.tenants ?? { 'kunde.example.net': KUNDE() })) {
    writeFileSync(join(root, 'ploi', 'pool.example.org', 'before', name), text)
  }
  // Was Ploi neben eine Site legt und NICHT an die App weiterreicht, zählt nicht mit.
  writeFileSync(join(root, 'ploi', 'pool.example.org', 'before', 'ssl-redirect.conf'),
    'server {\n listen 80;\n server_name .pool.example.org;\n return 301 https://$host$request_uri;\n}\n')
  const list = join(dir, 'sites.conf')
  writeFileSync(list, layout.list ?? SITES)
  const result = spawnSync('node', [NGINX_CHECK, '--root', root, '--sites', list, ...args], { encoding: 'utf8' })
  return { code: result.status, out: result.stdout, lines: result.stdout.trim().split('\n') }
}

/**
 * Was Ploi aus einer Datei macht, wenn im Panel ein Zertifikat angefordert,
 * ein Alias ergänzt oder die Datei neu geschrieben wird: Kommentare und
 * Einrückung weg, `include /etc/nginx/ssl/…` durch `listen`/`ssl_certificate`
 * ersetzt, ein zweiter Name, davor ein Port-80-Block.
 */
function ploiRewrite(text: string, site: string): string {
  const body = text
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .replace(`include /etc/nginx/ssl/${site};`, [
      'listen 443 ssl;',
      'listen [::]:443 ssl;',
      'http2 on;',
      `ssl_certificate /etc/letsencrypt/live/${site}-123456/fullchain.pem;`,
      `ssl_certificate_key /etc/letsencrypt/live/${site}-123456/privkey.pem;`,
      'ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;',
    ].join('\n'))
    .replace(/server_name ([^;]+);/, 'server_name $1 alias.example.org;')
  return `server {\n##listen 80;\nserver_name ${site} alias.example.org;\nreturn 301 https://$host$request_uri;\n}\n${body}\n`
}

describe('ops/nginx-check.mjs — die Vorlagen bestehen ihren eigenen Vergleich', () => {
  it('alle drei Site-Arten und die Kundendomain: passt', () => {
    const { code, lines } = nginxCheck()
    expect(code).toBe(0)
    expect(lines).toEqual([
      'nginx version=1 sites=3',
      'nginx site=einzel.example.org ergebnis=passt',
      'nginx site=lang.example.org ergebnis=passt',
      'nginx site=pool.example.org ergebnis=passt',
      'nginx kundendomains anzahl=1 passt=1',
      'nginx auffangblock ergebnis=passt',
      'nginx unbekannt anzahl=0',
      'nginx fertig',
    ])
  })

  it('eine von Ploi umgeschriebene Fassung bleibt grün (kein Fehlalarm nach Zertifikat oder Alias)', () => {
    const { lines } = nginxCheck({
      sites: {
        'einzel.example.org': ploiRewrite(EINZEL(), 'einzel.example.org'),
        'lang.example.org': ploiRewrite(LANG(), 'lang.example.org'),
        'pool.example.org': ploiRewrite(POOL(), 'pool.example.org'),
      },
    })
    expect(lines.filter(line => line.includes('ergebnis='))).toEqual([
      'nginx site=einzel.example.org ergebnis=passt',
      'nginx site=lang.example.org ergebnis=passt',
      'nginx site=pool.example.org ergebnis=passt',
      'nginx auffangblock ergebnis=passt',
    ])
  })

  it('alle Anweisungen in EINER Zeile (so steht es heute auf einer Site): passt', () => {
    const oneLine = EINZEL().replace(/location \/ \{[\s\S]*?\n {4}\}/, match => match.replace(/\s*\n\s*/g, ' '))
    expect(nginxCheck({ sites: { 'einzel.example.org': oneLine }, list: 'einzel.example.org einzel 3101 aus\n' }).lines)
      .toContain('nginx site=einzel.example.org ergebnis=passt')
  })

  it('das Zugriffs-Log-Baustein besteht, wo die Liste `an` sagt', () => {
    const snippet = readFileSync(join(TEMPLATES, 'zugriffs-log.snippet'), 'utf8').replaceAll('{{SITE}}', 'einzel.example.org')
    const format = snippet.split('\n').find(line => line.startsWith('log_format '))!
    const access = snippet.split('\n').find(line => line.trim().startsWith('access_log '))!
    const withLog = `${format}\n${EINZEL().replace('access_log off;', access.trim())}`
    const list = 'einzel.example.org einzel 3101 an\n'
    expect(nginxCheck({ sites: { 'einzel.example.org': withLog }, list }).lines).toContain('nginx site=einzel.example.org ergebnis=passt')
    // … und `aus` in der Datei, wo die Liste `an` sagt, ist eine Abweichung.
    expect(nginxCheck({ sites: { 'einzel.example.org': EINZEL() }, list }).lines)
      .toContain('nginx site=einzel.example.org ergebnis=fehlt regel=zugriffs-log')
    // Ein Format, das die ganze Anfragezeile (samt Query) mitschreibt, besteht nicht.
    const leaky = withLog.replace('"$request_method $uri"', '"$request"')
    expect(nginxCheck({ sites: { 'einzel.example.org': leaky }, list }).lines)
      .toContain('nginx site=einzel.example.org ergebnis=fehlt regel=zugriffs-log')
  })
})

describe('ops/nginx-check.mjs — jede Pflicht-Zeile wird vermisst', () => {
  const only = 'einzel.example.org einzel 3101 aus\n'
  function broken(change: (text: string) => string) {
    return nginxCheck({ sites: { 'einzel.example.org': change(EINZEL()) }, list: only }).lines
      .filter(line => line.startsWith('nginx site='))
  }

  it('X-Forwarded-For fehlt (die Verifikation des Findings)', () => {
    expect(broken(text => text.replace(/^\s*proxy_set_header X-Forwarded-For .*\n/m, '')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=client-adresse-xff'])
  })

  it('X-Forwarded-For reicht nur durch, was der Aufrufer schickt', () => {
    expect(broken(text => text.replace('$proxy_add_x_forwarded_for', '$http_x_forwarded_for')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=client-adresse-xff'])
  })

  it.each([
    ['host', /^\s*proxy_set_header Host .*\n/m],
    ['client-adresse-real-ip', /^\s*proxy_set_header X-Real-IP .*\n/m],
    ['protokoll', /^\s*proxy_set_header X-Forwarded-Proto .*\n/m],
    ['frist', /^\s*proxy_read_timeout .*\n/m],
    ['punkt-dateien', /^\s*location ~ \/\\\.\(\?!well-known\)\.\* \{\n\s*deny all;\n\s*\}\n/m],
    ['zugriffs-log', /^\s*access_log off;\n/m],
  ])('%s', (rule, pattern) => {
    expect(broken(text => text.replace(pattern, ''))).toEqual([`nginx site=einzel.example.org ergebnis=fehlt regel=${rule}`])
  })

  it('eine zu lange Frist in `location /` und der falsche Port', () => {
    expect(broken(text => text.replace('proxy_read_timeout 60s;', 'proxy_read_timeout 600s;')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=frist'])
    expect(broken(text => text.replace('127.0.0.1:3101', '127.0.0.1:3102')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=port'])
  })

  it('lange Routen: 180s geht, 300s nicht — und ihre Kopfzeilen werden nicht aus `location /` geerbt', () => {
    const list = 'lang.example.org lange-routen 3102 aus\n'
    const lines = (text: string) => nginxCheck({ sites: { 'lang.example.org': text }, list }).lines.filter(line => line.startsWith('nginx site='))
    expect(lines(LANG())).toEqual(['nginx site=lang.example.org ergebnis=passt'])
    expect(lines(LANG().replace('proxy_read_timeout 180s;', 'proxy_read_timeout 300s;')))
      .toEqual(['nginx site=lang.example.org ergebnis=fehlt regel=frist'])
    // Nur im ERSTEN Block (dem für die langen Routen) fehlt die Zeile.
    expect(lines(LANG().replace(/^\s*proxy_set_header X-Real-IP .*\n/m, '')))
      .toEqual(['nginx site=lang.example.org ergebnis=fehlt regel=client-adresse-real-ip'])
  })

  it('`server_name _` oder default_server: keine festen Namen', () => {
    expect(broken(text => text.replace('server_name einzel.example.org;', 'server_name _;')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=feste-namen'])
    expect(broken(text => text.replace('charset utf-8;', 'listen 443 ssl default_server;\n    charset utf-8;')))
      .toEqual(['nginx site=einzel.example.org ergebnis=fehlt regel=feste-namen'])
  })

  it('eine Schutz-Kopfzeile im Webserver ist zu viel (die sendet die App)', () => {
    for (const header of ['X-Frame-Options "SAMEORIGIN"', 'X-Content-Type-Options "nosniff"', 'Strict-Transport-Security "max-age=1" always']) {
      expect(broken(text => text.replace('charset utf-8;', `add_header ${header};\n    charset utf-8;`)))
        .toEqual(['nginx site=einzel.example.org ergebnis=zuviel regel=schutz-kopfzeilen'])
    }
    // Eine andere Kopfzeile ist erlaubt.
    expect(broken(text => text.replace('charset utf-8;', 'add_header X-Robots-Tag "noindex";\n    charset utf-8;')))
      .toEqual(['nginx site=einzel.example.org ergebnis=passt'])
  })

  it('die Datei fehlt · die Site reicht nicht weiter', () => {
    expect(nginxCheck({ sites: {}, list: only }).lines).toContain('nginx site=einzel.example.org ergebnis=fehlt regel=site-datei')
    expect(nginxCheck({ sites: { 'einzel.example.org': 'server {\n server_name einzel.example.org;\n return 404;\n}\n' }, list: only }).lines)
      .toContain('nginx site=einzel.example.org ergebnis=fehlt regel=proxy-block')
  })
})

describe('ops/nginx-check.mjs — unbekannte Dateien, Auffangblock, Kundendomains', () => {
  it('eine von Hand angelegte Site, die die Liste nicht kennt, wird gezählt — ohne Namen', () => {
    const sites = { 'einzel.example.org': EINZEL(), 'geheim-neu.example.org': EINZEL().replaceAll('einzel.example.org', 'geheim-neu.example.org') }
    const list = 'einzel.example.org einzel 3101 aus\n'
    const quiet = nginxCheck({ sites, list })
    expect(quiet.lines).toContain('nginx unbekannt anzahl=1')
    expect(quiet.out).not.toContain('geheim-neu')
    // Von Hand, auf dem Server: `--namen` nennt sie.
    expect(nginxCheck({ sites, list }, ['--namen']).out).toContain('namen=geheim-neu.example.org')
  })

  it('ohne Auffangblock: fehlt', () => {
    expect(nginxCheck({ catchAll: false }).lines).toContain('nginx auffangblock ergebnis=fehlt')
  })

  it('eine Kundendomain ohne Pflicht-Zeile: Nummer statt Name', () => {
    const tenants = {
      'gut.example.net': KUNDE('gut.example.net'),
      'kunde-geheim.example.net': KUNDE('kunde-geheim.example.net').replace(/^\s*proxy_set_header X-Forwarded-For .*\n/m, ''),
    }
    const { lines, out } = nginxCheck({ tenants })
    expect(lines).toContain('nginx kundendomains anzahl=2 passt=1')
    expect(lines).toContain('nginx kundendomain nr=2 ergebnis=fehlt regel=client-adresse-xff')
    expect(out).not.toContain('kunde-geheim')
  })

  it('NICHTS aus einer Datei verlässt den Server: jede Zeile hat eine feste Form', () => {
    const marker = 'GEHEIMER-KOMMENTAR-4711'
    const sites = {
      'einzel.example.org': `# ${marker}\n${EINZEL().replace('charset utf-8;', `add_header X-Frame-Options "${marker}";\n    ssl_certificate /etc/${marker}/fullchain.pem;\n    charset utf-8;`)}`,
      'lang.example.org': LANG().replace(/^\s*proxy_set_header Host .*\n/m, ''),
      'pool.example.org': POOL(),
      [`${marker.toLowerCase()}.example.org`]: 'server {\n server_name x;\n}\n',
    }
    const { out, lines } = nginxCheck({ sites })
    expect(out).not.toContain(marker)
    expect(out.toLowerCase()).not.toContain(marker.toLowerCase())
    for (const line of lines) expect(NGINX_LINE_FORMS.some(form => form.test(line)), line).toBe(true)
  })

  it('unlesbare Liste oder fremder Schalter: kein Vergleich', () => {
    expect(nginxCheck({ list: 'einzel.example.org einzel\n' })).toMatchObject({ code: 5, out: 'nginx liste=nicht-lesbar\n' })
    expect(nginxCheck({}, ['--zeige-alles']).code).toBe(64)
  })
})

describe('ops/nginx-sites.conf und ops/nginx-check.mjs — eine Liste, ein Regelsatz', () => {
  it('die Liste nennt genau die Sites aus ops/apps.conf, mit dem Port ihrer Ecosystem-Datei', () => {
    const apps = readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8').split('\n')
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(line => line.split(/\s+/))
    const listed = readFileSync(join(REPO, 'ops', 'nginx-sites.conf'), 'utf8').split('\n')
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(line => line.split(/\s+/))
    expect(listed.map(row => row[0]).sort()).toEqual(apps.map(row => row[1]).sort())
    for (const [app, site] of apps) {
      const port = /PORT:\s*(\d+)/.exec(readFileSync(join(REPO, 'ops', `ecosystem-${app}.config.cjs`), 'utf8'))?.[1]
      expect(listed.find(row => row[0] === site)?.[2], `Port von ${site}`).toBe(port)
    }
  })

  it('Skript auf dem Server und Auswertung im Repo kennen dieselben Regeln', () => {
    expect(RULES).toEqual(NGINX_RULES)
  })

  it('jede Vorlage nennt ihre Pflicht-Zeilen und keine Schutz-Kopfzeile', () => {
    const names = readdirSync(TEMPLATES).filter(name => name.endsWith('.conf.template'))
    expect(names.sort()).toEqual(['einzel-site-lange-routen.conf.template', 'einzel-site.conf.template', 'pool-kundendomain.conf.template', 'pool-site.conf.template'])
    for (const name of names) {
      const text = readFileSync(join(TEMPLATES, name), 'utf8')
      expect(text, name).toContain('PFLICHT')
      // In Kommentaren darf das Wort stehen (als Warnung), als Anweisung nie.
      expect(text.split('\n').filter(line => !line.trim().startsWith('#')).join('\n'), name).not.toMatch(/add_header/)
    }
  })

  it('der Deploy legt Skripte und Listen neben die Ecosystem-Datei', () => {
    const deploy = readFileSync(join(REPO, '.github', 'workflows', 'deploy.yml'), 'utf8')
    for (const file of ['ops/nginx-check.mjs', 'ops/nginx-sites.conf', 'ops/cron-check.sh', 'ops/cron.conf', 'ops/logrotate-admin-access.conf']) {
      expect(deploy, file).toContain(file)
    }
  })
})

// ── Zeitpläne ───────────────────────────────────────────────────────────────

const USER_APPWRITE = `# Kommentar
MAILTO=niemand@example.org
*/5 * * * * APPWRITE_COMPOSE_DIR=/home/ploi/appwrite /home/ploi/ops/realtime-watchdog.sh >> /home/ploi/ops/logs/realtime-watchdog.log 2>&1
30 3 * * * APPWRITE_COMPOSE_DIR=/home/ploi/appwrite BACKUP_DIR=/home/ploi/backup OFFSITE_TARGET=GEHEIMES-ZIEL:pfad /home/ploi/ops/appwrite-backup.sh --run >> /home/ploi/ops/logs/appwrite-backup.log 2>&1
`
const SYSTEM_APPWRITE = `SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# m h dom mon dow user\tcommand
17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly
25 6\t* * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }
47 6\t* * 7\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }
52 6\t1 * *\troot\ttest -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }
23 1 * * * root /snap/bin/certbot renew > /home/ploi/.ploi/certbot-renew.log 2>&1
16 5 * * * root /usr/local/bin/composer self-update > /home/ploi/.ploi/composer-self-update.log 2>&1
0,5,10,15,20,25,30,35,40,45,50,55 * * * * ploi ploi-monitor > /home/ploi/.ploi/scheduled-1.log 2>&1
`

function cronCheck(server: string, user: string, system: string, extraEnv: Record<string, string> = {}) {
  const userFile = join(dir, 'crontab-user')
  const systemFile = join(dir, 'crontab-system')
  writeFileSync(userFile, user)
  writeFileSync(systemFile, system)
  const result = spawnSync('bash', [CRON_CHECK, server], {
    encoding: 'utf8',
    env: { ...process.env, CRON_USER_FILE: userFile, CRON_SYSTEM_FILE: systemFile, ...extraEnv },
  })
  return { code: result.status, out: result.stdout, lines: result.stdout.trim().split('\n') }
}

describe('ops/cron-check.sh — erwartete Zeitpläne da, kein unbekannter dazu', () => {
  it('der Stand des Appwrite-Servers: alles da', () => {
    const { code, lines } = cronCheck('appwrite-prod', USER_APPWRITE, SYSTEM_APPWRITE)
    expect(code).toBe(0)
    expect(lines).toEqual([
      'cron server=appwrite-prod quelle=benutzer erwartet=2 gefunden=2 fehlt=- unbekannt=0 doppelt=0',
      'cron server=appwrite-prod quelle=system erwartet=7 gefunden=7 fehlt=- unbekannt=0 doppelt=0',
    ])
  })

  it('das Backup ohne `--run` zählt nicht als Backup', () => {
    const { lines } = cronCheck('appwrite-prod', USER_APPWRITE.replace(' --run', ''), SYSTEM_APPWRITE)
    expect(lines[0]).toBe('cron server=appwrite-prod quelle=benutzer erwartet=2 gefunden=1 fehlt=appwrite-backup unbekannt=1 doppelt=0')
  })

  it('ein Zeitplan fehlt · einer ist unbekannt · einer steht doppelt · die Uhrzeit ist verstellt', () => {
    const lines = USER_APPWRITE.trim().split('\n')
    expect(cronCheck('appwrite-prod', `${lines.slice(0, 3).join('\n')}\n`, SYSTEM_APPWRITE).lines[0])
      .toContain('gefunden=1 fehlt=appwrite-backup unbekannt=0')
    expect(cronCheck('appwrite-prod', `${USER_APPWRITE}0 * * * * curl -s http://127.0.0.1:3004/irgendwas\n`, SYSTEM_APPWRITE).lines[0])
      .toContain('fehlt=- unbekannt=1 doppelt=0')
    expect(cronCheck('appwrite-prod', `${USER_APPWRITE}${lines[2]}\n`, SYSTEM_APPWRITE).lines[0])
      .toContain('fehlt=- unbekannt=0 doppelt=1')
    expect(cronCheck('appwrite-prod', USER_APPWRITE.replace('30 3 * * *', '30 15 * * *'), SYSTEM_APPWRITE).lines[0])
      .toContain('fehlt=appwrite-backup unbekannt=1')
  })

  it('leerer crontab: beide Einträge fehlen, kein Abbruch', () => {
    expect(cronCheck('appwrite-prod', '', SYSTEM_APPWRITE).lines[0])
      .toBe('cron server=appwrite-prod quelle=benutzer erwartet=2 gefunden=0 fehlt=realtime-watchdog,appwrite-backup unbekannt=0 doppelt=0')
  })

  it('NICHTS aus einem crontab verlässt den Server', () => {
    const { out, lines } = cronCheck('appwrite-prod', `${USER_APPWRITE}5 5 * * * /home/ploi/GEHEIMES-SKRIPT.sh --token=abc\n`, SYSTEM_APPWRITE)
    expect(out).not.toMatch(/GEHEIM|token|example\.org|\/home\/ploi/)
    for (const line of lines) expect(line).toMatch(CRON_LINE_FORM)
  })

  it('die echte Liste ist lesbar und kennt beide Server; ein fremdes Wort wird abgelehnt', () => {
    for (const server of ['app-prod', 'appwrite-prod']) {
      const { code, lines } = cronCheck(server, '', '')
      expect(code).toBe(0)
      expect(lines).toHaveLength(2)
      for (const line of lines) expect(line).toMatch(CRON_LINE_FORM)
    }
    expect(cronCheck('irgendwo', '', '').code).toBe(64)
  })

  it('eine kaputte Liste vergleicht nicht (statt alles für unbekannt zu halten)', () => {
    const conf = join(dir, 'cron.conf')
    writeFileSync(conf, 'appwrite-prod | benutzer | Großbuchstabe | 1 2 3 4 5 | muster\n')
    expect(cronCheck('appwrite-prod', USER_APPWRITE, SYSTEM_APPWRITE, { CRON_CONF: conf })).toMatchObject({ code: 5, out: 'cron liste=nicht-lesbar\n' })
  })
})

describe('ops/appwrite-cert-gate.sh — cron-status', () => {
  function gate(script: string, user = USER_APPWRITE) {
    const userFile = join(dir, 'crontab-user')
    const systemFile = join(dir, 'crontab-system')
    writeFileSync(userFile, user)
    writeFileSync(systemFile, SYSTEM_APPWRITE)
    const result = spawnSync('bash', [GATE, 'cron-status'], {
      encoding: 'utf8',
      env: { ...process.env, CRON_CHECK_SCRIPT: script, CRON_USER_FILE: userFile, CRON_SYSTEM_FILE: systemFile },
    })
    return { code: result.status, out: result.stdout }
  }

  it('reicht genau die zwei Zeilen des Skripts durch', () => {
    const { code, out } = gate(CRON_CHECK)
    expect(code).toBe(0)
    expect(out.trim().split('\n')).toEqual([
      'cron server=appwrite-prod quelle=benutzer erwartet=2 gefunden=2 fehlt=- unbekannt=0 doppelt=0',
      'cron server=appwrite-prod quelle=system erwartet=7 gefunden=7 fehlt=- unbekannt=0 doppelt=0',
    ])
  })

  it('ein ausgetauschtes Skript bringt keine fremde Zeile durchs Tor', () => {
    const fake = join(dir, 'fake.sh')
    writeFileSync(fake, '#!/usr/bin/env bash\necho "MAILTO=geheim@example.org"\necho "cron server=appwrite-prod quelle=benutzer erwartet=2 gefunden=2 fehlt=- unbekannt=0 doppelt=0"\ncat /etc/hostname 2>/dev/null\n')
    chmodSync(fake, 0o755)
    expect(gate(fake)).toEqual({ code: 6, out: 'cron ergebnis=unbekannt\n' })
  })

  it('ohne Skript: unbekannt, Exit 6', () => {
    expect(gate(join(dir, 'gibt-es-nicht.sh'))).toEqual({ code: 6, out: 'cron ergebnis=unbekannt\n' })
  })

  it('das Wort steht in der Liste der erlaubten', () => {
    const result = spawnSync('bash', [GATE, 'cron-status; id'], { encoding: 'utf8' })
    expect(result.status).toBe(64)
    expect(result.stdout).toContain('realtime-status, cron-status')
  })
})

// ── Auswertung im Repo ──────────────────────────────────────────────────────

const GREEN_NGINX = `nginx version=1 sites=2
nginx site=a.example.org ergebnis=passt
nginx site=b.example.org ergebnis=passt
nginx kundendomains anzahl=2 passt=2
nginx auffangblock ergebnis=passt
nginx unbekannt anzahl=0
nginx fertig
`
const GREEN_CRON = `cron server=app-prod quelle=benutzer erwartet=2 gefunden=2 fehlt=- unbekannt=0 doppelt=0
cron server=app-prod quelle=system erwartet=8 gefunden=8 fehlt=- unbekannt=0 doppelt=0
`

describe('scripts/ops/server-config-rules.mjs — rot ist nur, was jemand tun muss', () => {
  const sites = ['a.example.org', 'b.example.org']

  it('alles passt: nichts Rotes', () => {
    expect(evaluateNginx(parseNginxOutput(GREEN_NGINX), sites)).toEqual([])
    expect(evaluateCron(parseCronOutput(GREEN_CRON, 'app-prod'), 'app-prod')).toEqual([])
  })

  it('eine fehlende Pflicht-Zeile nennt Site, Zeile und den Handgriff', () => {
    const text = GREEN_NGINX.replace('nginx site=b.example.org ergebnis=passt', 'nginx site=b.example.org ergebnis=fehlt regel=client-adresse-xff')
    const red = evaluateNginx(parseNginxOutput(text), sites)
    expect(red).toHaveLength(1)
    expect(red[0]).toContain('b.example.org')
    expect(red[0]).toContain('X-Forwarded-For')
    expect(red[0]).toContain('reload')
    expect(red[0]).toContain('PRODUKTIONS-ALARM.md')
  })

  it('Schutz-Kopfzeile im Webserver · unbekannte Site · Auffangblock · Kundendomain', () => {
    const red = evaluateNginx(parseNginxOutput(GREEN_NGINX
      .replace('nginx site=a.example.org ergebnis=passt', 'nginx site=a.example.org ergebnis=zuviel regel=schutz-kopfzeilen')
      .replace('passt=2', 'passt=1\nnginx kundendomain nr=2 ergebnis=fehlt regel=frist')
      .replace('auffangblock ergebnis=passt', 'auffangblock ergebnis=fehlt')
      .replace('unbekannt anzahl=0', 'unbekannt anzahl=1')), sites)
    expect(red).toHaveLength(4)
    expect(red.join('\n')).toMatch(/doppelt[\s\S]*Kundendomain \(Nr\. 2[\s\S]*Auffangblock[\s\S]*nginx-sites\.conf/)
  })

  it('eine Site aus der Liste, die das Skript nicht nennt, ist rot (Liste auf dem Server älter)', () => {
    expect(evaluateNginx(parseNginxOutput(GREEN_NGINX), [...sites, 'c.example.org'])).toHaveLength(1)
  })

  it('eine fremde Zeile, eine abgeschnittene Antwort, eine andere Version: keine Bewertung, aber rot', () => {
    for (const text of [`${GREEN_NGINX}server_name geheim.example.org;\n`, GREEN_NGINX.replace('nginx fertig\n', ''), GREEN_NGINX.replace('version=1', 'version=9'), '', undefined]) {
      const parsed = parseNginxOutput(text)
      expect(parsed.problem).toBeTruthy()
      const red = evaluateNginx(parsed, sites)
      expect(red).toHaveLength(1)
      expect(red[0]).not.toContain('geheim')
    }
    expect(parseCronOutput(`${GREEN_CRON}0 * * * * geheim\n`, 'app-prod').problem).toBe('form')
    expect(parseCronOutput(GREEN_CRON.split('\n')[0], 'app-prod').problem).toBe('unvollstaendig')
    // Die Zeilen eines ANDEREN Servers zählen nicht.
    expect(parseCronOutput(GREEN_CRON, 'appwrite-prod').problem).toBe('form')
  })

  it('Zeitplan fehlt · unbekannt · doppelt', () => {
    const red = evaluateCron(parseCronOutput(GREEN_CRON
      .replace('gefunden=2 fehlt=-', 'gefunden=1 fehlt=pm2-resurrect')
      .replace('gefunden=8 fehlt=- unbekannt=0 doppelt=0', 'gefunden=8 fehlt=- unbekannt=2 doppelt=1'), 'app-prod'), 'app-prod')
    expect(red).toHaveLength(3)
    expect(red[0]).toContain('„pm2-resurrect" fehlt auf app-prod')
    expect(red[1]).toContain('2 unbekannte')
    expect(red[2]).toContain('doppelt')
  })
})

describe('scripts/ops/verify-server-config.mjs — von der Antwort bis zum Exit-Code', () => {
  function verify(files: Record<string, string>, env: Record<string, string> = {}) {
    const from = join(dir, 'antworten')
    mkdirSync(from, { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(join(from, name), text)
    const findings = join(dir, 'befunde.txt')
    const result = spawnSync('node', [VERIFY, '--from-dir', from, '--strict'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '', PUKALANI_FINDINGS_FILE: findings, ...env },
    })
    let written = ''
    try {
      written = readFileSync(findings, 'utf8')
    }
    catch { /* nichts Rotes */ }
    return { code: result.status, out: result.stdout, written }
  }

  /** Eine grüne Antwort für GENAU die Sites der echten Liste. */
  function greenNginx(): string {
    const names = readFileSync(join(REPO, 'ops', 'nginx-sites.conf'), 'utf8').split('\n')
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(line => line.split(/\s+/)[0])
    return [`nginx version=1 sites=${names.length}`, ...names.map(name => `nginx site=${name} ergebnis=passt`),
      'nginx kundendomains anzahl=2 passt=2', 'nginx auffangblock ergebnis=passt', 'nginx unbekannt anzahl=0', 'nginx fertig', ''].join('\n')
  }
  const greenCron = (server: string) => GREEN_CRON.replaceAll('app-prod', server)

  it('grün: Exit 0, nichts in der Befund-Datei', () => {
    const result = verify({ 'nginx.txt': greenNginx(), 'cron-app-prod.txt': greenCron('app-prod'), 'cron-appwrite-prod.txt': greenCron('appwrite-prod') })
    expect(result.code).toBe(0)
    expect(result.out).toContain('Nichts Rotes')
    expect(result.written).toBe('')
  })

  it('ein Server antwortet nicht: rot mit einem Satz', () => {
    const result = verify({ 'nginx.txt': greenNginx(), 'cron-app-prod.txt': greenCron('app-prod') })
    expect(result.code).toBe(1)
    expect(result.written).toContain('cron-status')
  })

  it('Probealarm: rot, obwohl nichts fehlt — und als Probe gekennzeichnet', () => {
    const result = verify(
      { 'nginx.txt': greenNginx(), 'cron-app-prod.txt': greenCron('app-prod'), 'cron-appwrite-prod.txt': greenCron('appwrite-prod') },
      { PUKALANI_CONFIG_DRILL: '1' },
    )
    expect(result.code).toBe(1)
    expect(result.written).toMatch(/^PROBEALARM — Webserver-Einstellung /)
  })
})
