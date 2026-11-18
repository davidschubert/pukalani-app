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
  // auf dem App-Server nie laufen. Der Server braucht je Site genau drei
  // Dateien: die Ecosystem-Datei, pm2-heal.sh (auf beide verlässt sich
  // `ops/rollback.sh`) und seit OPS-011 (2026-11-16) das Zähl-Skript des
  // Produktions-Wächters, das nur liest und nur Zahlen ausgibt.
  it('deploy.yml kopiert nur Ecosystem-Datei, pm2-heal.sh, Zähl-Skript und die Vergleichs-Skripte auf den Server', () => {
    const code = deploy.split('\n').filter(line => !/^\s*#/.test(line))
    const toSiteOps = code.filter(line => /\brsync\b/.test(line) && line.includes('/ops/'))
    expect(toSiteOps).toHaveLength(1)
    const sources = toSiteOps[0]!.trim().split(/\s+/).filter(word => /^"?ops\//.test(word)).map(word => word.replace(/"/g, ''))
    expect(sources).toEqual([
      'ops/ecosystem-$app.config.cjs',
      'ops/pm2-heal.sh',
      'ops/app-watch-counts.mjs',
      // OPS-003 (2026-11-16): die zwei nur lesenden Vergleichs-Skripte samt Listen
      // und die Umlauf-Einstellung des Zugriffs-Logs der Betreiber-Seite.
      'ops/nginx-check.mjs',
      'ops/nginx-sites.conf',
      'ops/cron-check.sh',
      'ops/cron.conf',
      'ops/logrotate-admin-access.conf',
    ])
    expect(toSiteOps[0]).not.toContain('--delete')
    // Was der Server beim Ausliefern ausführt, sind die ersten zwei.
    expect(deploy).toContain('bash /home/ploi/$site/ops/pm2-heal.sh')
    expect(deploy).toContain('pm2 startOrReload /home/ploi/$site/ops/ecosystem-$app.config.cjs')
    // Der Rückweg trägt die Handgriffe nicht mehr selbst (CI1 b, 2026-11-18):
    // er schickt `ops/app-release.sh`, und DORT stehen dieselben zwei Dateien.
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
