import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — reines .mjs ohne Typen (Betriebs-Skript)
import { HOSTS, MIN_HSTS_SECONDS, classifyResponse, headerValues, servedFromSharedCache } from '../../../scripts/ops/verify-security-headers.mjs'
import { HSTS_MAX_AGE_SECONDS, baseSecurityHeaders } from '../shared/securityHeaders'

/**
 * SEC-006 (2026-11-16): der tägliche Blick zählt die Schutz-Kopfzeilen an den
 * ECHTEN Antworten — roh, weil `fetch` zwei gleichnamige Zeilen zusammenfasst.
 * Hier wird die Bewertung an gestellten Roh-Kopfzeilen geprüft, und dass der
 * Blick dieselben Kopfzeilen erwartet, die die App wirklich setzt.
 */
const REPO = join(__dirname, '..', '..', '..')

/** Was die App für einen fremden Host setzt, als Roh-Liste wie von `node:https`. */
function appHeaders(extra: Array<[string, string]> = []): string[] {
  const base = Object.entries(baseSecurityHeaders('example.org')) as Array<[string, string]>
  return [...base, ...extra].flatMap(([name, value]) => [name, value])
}
const PAGE: Array<[string, string]> = [['content-security-policy', `frame-ancestors 'self'`]]

describe('scripts/ops/verify-security-headers.mjs — Bewertung einer Antwort', () => {
  it('was die App setzt, besteht: Seite, API und Datei', () => {
    expect(classifyResponse('page', appHeaders(PAGE))).toEqual([])
    expect(classifyResponse('api', appHeaders())).toEqual([])
    expect(classifyResponse('file', appHeaders())).toEqual([])
  })

  it('der Blick erwartet genau die Kopfzeilen, die die App setzt — und die Dauer der ersten Stufe reicht', () => {
    expect(Object.keys(baseSecurityHeaders('example.org')).sort()).toEqual(['permissions-policy', 'referrer-policy', 'strict-transport-security', 'x-content-type-options'])
    expect(HSTS_MAX_AGE_SECONDS).not.toBeNull()
    expect(HSTS_MAX_AGE_SECONDS!).toBeGreaterThanOrEqual(MIN_HSTS_SECONDS)
  })

  it('ein Webserver, der nosniff daneben setzt: doppelt — als zweite Zeile wie als „a, b"', () => {
    expect(classifyResponse('api', appHeaders([['X-Content-Type-Options', 'nosniff']]))).toEqual(['x-content-type-options kommt 2-mal'])
    const merged = appHeaders().map(value => (value === 'nosniff' ? 'nosniff, nosniff' : value))
    expect(classifyResponse('api', merged)).toEqual(['x-content-type-options kommt 2-mal'])
  })

  it('die Kopfzeilen der alten Webserver-Vorlage und von Nuxt sind zu viel', () => {
    expect(classifyResponse('api', appHeaders([['X-Frame-Options', 'SAMEORIGIN'], ['X-XSS-Protection', '1; mode=block'], ['x-powered-by', 'Nuxt']])))
      .toEqual(['x-powered-by wird gesendet', 'x-frame-options wird gesendet', 'x-xss-protection wird gesendet'])
  })

  it('eine fehlende Kopfzeile, HSTS ohne oder mit zu kurzer Dauer', () => {
    const without = (name: string) => {
      const raw = appHeaders()
      const at = raw.indexOf(name)
      return [...raw.slice(0, at), ...raw.slice(at + 2)]
    }
    expect(classifyResponse('api', without('strict-transport-security'))).toEqual(['strict-transport-security fehlt'])
    expect(classifyResponse('api', without('referrer-policy'))).toEqual(['referrer-policy fehlt'])
    const short = appHeaders().map(value => (value.startsWith('max-age=') ? 'max-age=300' : value))
    expect(classifyResponse('api', short)).toEqual(['strict-transport-security ohne gültige Dauer'])
  })

  it('die Seite braucht genau eine frame-ancestors-Regel; die API nicht', () => {
    expect(classifyResponse('page', appHeaders())).toEqual(['content-security-policy mit frame-ancestors fehlt oder kommt mehrfach'])
    expect(classifyResponse('page', appHeaders([...PAGE, ...PAGE]))).toEqual(['content-security-policy mit frame-ancestors fehlt oder kommt mehrfach'])
  })

  it('die Permissions-Policy enthält Kommas — sie zählt trotzdem als EINE', () => {
    expect(headerValues(appHeaders()).get('permissions-policy')).toEqual(['camera=(), microphone=(), geolocation=()'])
    expect(classifyResponse('api', appHeaders())).toEqual([])
  })
})

describe('scripts/ops/verify-security-headers.mjs — eine Datei aus dem Zwischenspeicher sagt nichts aus', () => {
  it('Cloudflare liefert eine unveränderte Datei mit ihren ALTEN Kopfzeilen — sie wird nicht bewertet', () => {
    expect(servedFromSharedCache(['cf-cache-status', 'HIT', 'age', '3797'])).toBe(true)
    expect(servedFromSharedCache(['CF-Cache-Status', 'REVALIDATED'])).toBe(true)
    // Frisch vom Ursprung geholt oder gar nicht hinter einem solchen Netz: wird bewertet.
    expect(servedFromSharedCache(['cf-cache-status', 'MISS'])).toBe(false)
    expect(servedFromSharedCache(['cf-cache-status', 'DYNAMIC'])).toBe(false)
    expect(servedFromSharedCache(appHeaders())).toBe(false)
  })
})

describe('Produktions-Wächter — die zwei neuen Blicke hängen am Workflow', () => {
  const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')

  it('jeder ausgerollte Host steht in der Liste des Kopfzeilen-Blicks', () => {
    const health = readFileSync(join(REPO, 'scripts', 'ops', 'verify-health.mjs'), 'utf8')
    for (const { host } of HOSTS as Array<{ host: string }>) expect(health, host).toContain(`host: '${host}'`)
    const apps = readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8').split('\n')
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(line => line.split(/\s+/)[1]!)
    const listed = (HOSTS as Array<{ host: string }>).map(entry => entry.host)
    // portfolio.pukalani.app leitet auf pukalani.studio um — geprüft wird der Name, der antwortet.
    for (const site of apps.filter(name => name !== 'portfolio.pukalani.app')) expect(listed, site).toContain(site)
    expect(listed).toContain('pukalani.studio')
  })

  it('beide Schritte laufen täglich, auch wenn ein Schritt davor rot war, und schreiben ihren Satz', () => {
    for (const command of ['node scripts/ops/verify-server-config.mjs --ssh --strict', 'node scripts/ops/verify-security-headers.mjs']) {
      const at = workflow.indexOf(`run: ${command}`)
      expect(at, command).toBeGreaterThan(0)
      const step = workflow.slice(workflow.lastIndexOf('- name:', at), at)
      expect(step, command).toContain('if: always()')
      expect(step, command).toContain('PUKALANI_FINDINGS_FILE')
    }
  })

  it('der Probe-Schalter erreicht den Blick und zählt als Probe im Alarm-Job', () => {
    expect(workflow).toContain('config_drill:')
    expect(workflow).toContain(`PUKALANI_CONFIG_DRILL: \${{ inputs.config_drill && '1' || '0' }}`)
    expect(workflow).toMatch(/DRILL: \$\{\{ \([^)]*inputs\.config_drill[^)]*\) && '1' \|\| '0' \}\}/)
  })

  it('das Tor kennt das Wort, das der Blick auf dem Appwrite-Server schickt', () => {
    const verify = readFileSync(join(REPO, 'scripts', 'ops', 'verify-server-config.mjs'), 'utf8')
    const gate = readFileSync(join(REPO, 'ops', 'appwrite-cert-gate.sh'), 'utf8')
    expect(verify).toContain(`'cron-status'`)
    expect(gate).toMatch(/^\s*cron-status\)/m)
  })
})
