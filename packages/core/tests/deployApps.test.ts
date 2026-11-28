import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * OPS-007 (2026-11-15): `ops/apps.conf` ist DIE EINE Liste der ausgelieferten
 * Apps. Das Ausliefern (`.github/workflows/deploy.yml`) und der Rückweg
 * (`ops/rollback.sh`) lesen beide dieselbe Datei.
 *
 * Warum ein Test: der Rückweg stand als Satz im Runbook und nannte drei
 * Monate lang einen Prozess, den es nicht mehr gab — niemand merkt das, bis
 * man ihn braucht. Hier wird rot, wer eine Site umbenennt und nur die halbe
 * Kette nachzieht: Liste, Ecosystem-Datei (Prozessname, Verzeichnisse),
 * Workflow, Health-Wächter.
 */
const REPO = join(__dirname, '..', '..', '..')
const read = (...parts: string[]) => readFileSync(join(REPO, ...parts), 'utf8')

const apps = read('ops', 'apps.conf')
  .split('\n')
  .map(line => line.replace(/#.*/, '').trim())
  .filter(Boolean)
  .map((line) => {
    const fields = line.split(/\s+/)
    return { fields, app: fields[0] ?? '', site: fields[1] ?? '' }
  })

describe('ops/apps.conf — die eine App-Liste', () => {
  it('hat je Zeile genau App und Site, nur aus harmlosen Zeichen', () => {
    expect(apps.length).toBeGreaterThan(0)
    for (const { fields, app, site } of apps) {
      expect(fields).toHaveLength(2)
      expect(app).toMatch(/^[a-z0-9-]+$/)
      expect(site).toMatch(/^[a-z0-9.-]+$/)
    }
  })

  it('nennt keine App und keine Site doppelt', () => {
    expect(new Set(apps.map(a => a.app)).size).toBe(apps.length)
    expect(new Set(apps.map(a => a.site)).size).toBe(apps.length)
  })

  it.each(apps)('$app: Ordner, Ecosystem-Datei, Prozessname und Verzeichnisse passen zur Liste', ({ app, site }) => {
    expect(existsSync(join(REPO, 'apps', app, 'nuxt.config.ts'))).toBe(true)
    const ecosystem = read('ops', `ecosystem-${app}.config.cjs`)
    // Der Prozess heißt wie die Site ohne Punkte — so leiten ihn deploy.yml
    // und rollback.sh ab, und so muss er in der Ecosystem-Datei stehen.
    expect(ecosystem).toContain(`name: '${site.replaceAll('.', '')}'`)
    expect(ecosystem).toContain(`const ENV_FILE = '/home/ploi/${site}/.env'`)
    expect(ecosystem).toContain(`const CURRENT = '/home/ploi/releases/${app}/current'`)
  })

  // WA1 c (2026-11-28): jede Ecosystem-Datei nennt eine Speichergrenze, und
  // keine liegt unter 512 MB. Ein zu knapper Wert hat schon einmal eine Seite
  // im Kreis neu gestartet; gemessen wurden 263 bis 563 MB je Prozess.
  it.each(apps)('$app: Speichergrenze gesetzt und nicht zu knapp', ({ app }) => {
    const ecosystem = read('ops', `ecosystem-${app}.config.cjs`)
    const limit = ecosystem.match(/^\s*max_memory_restart: '(\d+)M',$/m)
    expect(limit, `ops/ecosystem-${app}.config.cjs ohne max_memory_restart in MB`).not.toBeNull()
    expect(Number(limit?.[1])).toBeGreaterThanOrEqual(512)
  })

  it('kennt jede Ecosystem-Datei unter ops/', () => {
    const files = readdirSync(join(REPO, 'ops')).filter(file => /^ecosystem-.+\.config\.cjs$/.test(file))
    expect(files.sort()).toEqual(apps.map(a => `ecosystem-${a.app}.config.cjs`).sort())
  })
})

describe('die Leser der Liste', () => {
  const deploy = read('.github', 'workflows', 'deploy.yml')

  it('deploy.yml liest ops/apps.conf und führt keine zweite Liste', () => {
    expect(deploy).toContain('ops/apps.conf')
    // Die frühere Workflow-Variable mit den sechs Paaren und das Feld SLOT.
    expect(deploy).not.toMatch(/^\s*APP_HOSTS:\s*['"]/m)
    expect(deploy).not.toContain('declare -A SLOT')
    for (const { site } of apps) {
      const code = deploy.split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
      expect(code).not.toContain(`=${site}`)
    }
  })

  // OPS-005 (2026-11-15): bis dahin kopierte der Deploy den GANZEN Ordner ops/
  // in jede Site — samt Backup-, Wiederherstellungs- und Rückweg-Skript, die
  // auf dem App-Server nie laufen. Der Server braucht je Site die
  // Ecosystem-Datei, pm2-heal.sh (auf beide verlässt sich `ops/app-release.sh`),
  // das Zähl-Skript des Produktions-Wächters (OPS-011), die zwei nur lesenden
  // Vergleichs-Skripte samt Listen und die Umlauf-Einstellung des
  // Zugriffs-Logs (OPS-003) — und seit CI1 a (2026-11-18) zwei Prüf-Skripte
  // des täglichen Wächters, die sich vorher selbst hinüberkopierten.
  it('deploy.yml schickt je Site genau die Dateien der Liste — über das feste Skript', () => {
    const listOf = (name: string) => new RegExp(`^  ${name}: '([^']+)'$`, 'm').exec(deploy)?.[1]?.split(' ') ?? []
    expect(listOf('OPS_FILES')).toEqual([
      'pm2-heal.sh',
      'app-watch-counts.mjs',
      'nginx-check.mjs',
      'nginx-sites.conf',
      'cron-check.sh',
      'cron.conf',
      'logrotate-admin-access.conf',
    ])
    expect(listOf('WATCH_FILES')).toEqual(['verify-stale-keys.mjs', 'verify-instance-admins.mjs'])
    for (const name of listOf('OPS_FILES')) expect(existsSync(join(REPO, 'ops', name)), name).toBe(true)
    for (const name of listOf('WATCH_FILES')) expect(existsSync(join(REPO, 'scripts', 'ops', name)), name).toBe(true)
    const code = deploy.split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
    expect(code).toContain('"ecosystem-$app.config.cjs" $OPS_FILES')
    // CI1 b (2026-11-18): keine freien Befehle mehr. Was auf dem Server
    // geschieht, steht in `ops/app-release.sh`; der Workflow schickt Worte.
    expect(code).not.toMatch(/\brsync\b/)
    expect(code).not.toContain('pm2 startOrReload')
    expect(code).not.toContain('pm2 save')
    expect(code).not.toMatch(/\bln -s/)
    for (const word of ['fonts-get', 'fonts-put', 'release-put', 'ops-put', 'activate', 'prune']) {
      expect(code, word).toContain(`$RELEASE_SCRIPT ${word}`)
    }
    // Jeder ssh-Aufruf an den Server ist ein Wort des Skripts — bis auf die
    // eine Probe, die abgelehnt werden MUSS.
    const calls = code.split('\n').filter(line => /\bssh prod\b/.test(line))
    const free = calls.filter(line => !line.includes('"$RELEASE_SCRIPT '))
    expect(free.map(line => line.trim())).toEqual(['out=$(ssh prod \'echo frei\' </dev/null 2>/dev/null) || code=$?'])
    // Der Rückweg trägt die Handgriffe nicht selbst: er schickt dieselbe Datei.
    const rollback = read('ops', 'rollback.sh')
    expect(rollback).toContain('app-release.sh')
    expect(rollback).not.toContain('startOrReload')
    const release = read('ops', 'app-release.sh')
    expect(release).toContain('/ops/ecosystem-$APP.config.cjs')
    expect(release).toContain('/ops/pm2-heal.sh')
  })

  it('rollback.sh liest ops/apps.conf und nennt selbst keine Site', () => {
    const rollback = read('ops', 'rollback.sh')
    expect(rollback).toContain('apps.conf')
    const code = rollback.split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
    for (const { site } of apps) expect(code).not.toContain(site)
  })

  it('der Health-Wächter fragt jede ausgelieferte Site', () => {
    const health = read('scripts', 'ops', 'verify-health.mjs')
    for (const { site } of apps) expect(health).toContain(`host: '${site}'`)
  })

  it('jeder Host des Health-Wächters steht auch im TLS-Wächter (OPS-012)', () => {
    // Zwei Host-Listen von Hand, an nichts gebunden: ein Host, dessen Antwort
    // geprüft wird, dessen Zertifikat aber niemand ansieht, läuft still ab
    // (Oktober 2026: api.pukalani.app, acht Tage). Die Richtung ist bewusst
    // einseitig — der TLS-Wächter beobachtet zusätzlich Altnamen und
    // Weiterleitungen, die keine App mehr beantwortet.
    const hostsOf = (file: string) => [...read('scripts', 'ops', file)
      .split('\n').filter(line => !/^\s*(\/\/|\*)/.test(line)).join('\n')
      .matchAll(/\{\s*host:\s*'([^']+)'/g)].map(match => match[1]!)
    const tls = new Set(hostsOf('verify-tls.mjs'))
    // `.invalid` ist der Platzhalter des Probealarms, kein Host.
    const health = hostsOf('verify-health.mjs').filter(host => !host.endsWith('.invalid'))
    expect(health.length).toBeGreaterThanOrEqual(8)
    expect(health.filter(host => !tls.has(host)), 'im Health-Wächter, fehlt in HOSTS von scripts/ops/verify-tls.mjs').toEqual([])
  })
})
