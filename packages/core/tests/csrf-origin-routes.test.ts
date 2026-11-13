import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSRF_ORIGINLESS_CALLERS } from '../shared/csrfOriginExempt'

/**
 * WÄCHTER ZUR HERKUNFTSPRÜFUNG (SEC-004).
 *
 * Teil A — WER SCHREIBT OHNE BROWSER-HERKUNFT? Die Herkunftsprüfung lässt
 * Anfragen ohne `Origin` und ohne `Sec-Fetch-Site` durch (Server, Daemons).
 * Das ist nur harmlos, solange jede so gerufene Route einen EIGENEN Ausweis
 * verlangt statt eines Cookies. Dieser Test zählt die schreibenden Routen-
 * Dateien selbst, ordnet sie über die Erkennungsmerkmale aus
 * `CSRF_ORIGINLESS_CALLERS` einer Klasse zu und vergleicht mit der hier
 * festgehaltenen Erwartung. Eine neue Route mit eigenem Ausweis, die in keiner
 * Klasse steht, wird rot — ebenso eine verschwundene.
 *
 * Teil B — KEIN SCHALTER: die Prüfung gilt seit Stufe 2 in jeder App. Die
 * Middleware liest keine App-Config, und keine `app.config.ts` darf den
 * früheren Schlüssel `csrfOriginCheck` wieder einführen.
 *
 * Gesucht wird im Quelltext OHNE Kommentare.
 */

const REPO = resolve(import.meta.dirname, '../../..')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

function topDirs(top: 'packages' | 'apps'): string[] {
  return readdirSync(resolve(REPO, top), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
}

// ── Teil A ──────────────────────────────────────────────────────────────────

/** Schreibend = Methoden-Endung POST/PUT/PATCH/DELETE ODER gar keine Methoden-Endung (nimmt jede Methode an). */
const READ_ONLY = /\.(get|head|options)\.ts$/
const WRITE = /\.(post|put|patch|delete)\.ts$/

const routeFiles = (['packages', 'apps'] as const).flatMap(top =>
  topDirs(top).flatMap(name => ['api', 'routes'].flatMap(sub =>
    walk(resolve(REPO, top, name, 'server', sub)))))
  .filter(path => path.endsWith('.ts') && !READ_ONLY.test(path))
  .map(path => ({ path: relative(REPO, path), code: stripComments(readFileSync(path, 'utf8')) }))

function classify(code: string): string | null {
  const hits = CSRF_ORIGINLESS_CALLERS.filter(c => c.markers.every(m => code.includes(m)))
  if (hits.length > 1) return `MEHRDEUTIG:${hits.map(h => h.id).join('+')}`
  return hits[0]?.id ?? null
}

/**
 * VERDACHT AUF EIGENEN AUSWEIS: Merkmale, an denen man eine Route erkennt,
 * die sich NICHT (nur) per Cookie ausweist. Trifft eines davon und die Route
 * steht in keiner Klasse, ist sie neu und unbegründet ⇒ rot.
 */
const CREDENTIAL_SUSPECT: RegExp[] = [
  /get(?:Request)?Header\(\s*event\s*,\s*['"`]authorization['"`]/i,
  /['"`]x-[a-z-]*(?:secret|key|token|signature)['"`]/i,
  /['"`][a-z-]*-signature['"`]/i,
  /\bseamSecret(?:Matches|sFor)\(/,
  /\btimingSafeEqual\(/,
  /\bconstructEvent\(/,
]

/** Routen-Dateien OHNE Methoden-Endung, die heute gefunden werden (nur Lesen trotz „jede Methode"). */
const METHODLESS_EXPECTED = [
  'apps/help/server/api/health.ts',
  'apps/marketing/server/api/health.ts',
  'packages/core/server/api/health.ts',
]

/** Erwartete Anzahl je Klasse. Ändert sich eine Zahl, gehört die Begründung in den Commit. */
const EXPECTED_COUNTS: Record<string, number> = {
  'onboarding-seam': 52,
  'control-seam': 1,
  'runner-bearer': 6,
  'stripe-webhook': 1,
  'resend-webhook': 1,
  'events-sweep': 1,
}

/** Namentlich: alles, was NICHT zur Onboarding-Naht gehört. */
const EXPECTED_NON_SEAM: Record<string, string> = {
  'packages/domains/server/api/site/domain/settle.post.ts': 'control-seam',
  'packages/runner/server/api/runner/runs/claim.post.ts': 'runner-bearer',
  'packages/runner/server/api/runner/runners/heartbeat.post.ts': 'runner-bearer',
  'packages/runner/server/api/runner/runs/[id]/events.post.ts': 'runner-bearer',
  'packages/runner/server/api/runner/runs/[id]/finish.post.ts': 'runner-bearer',
  'packages/runner/server/api/runner/runs/[id]/session-end.post.ts': 'runner-bearer',
  'packages/runner/server/api/runner/runs/[id]/transcript.post.ts': 'runner-bearer',
  'packages/billing/server/api/stripe/webhook.post.ts': 'stripe-webhook',
  'packages/core/server/api/mail/resend-webhook.post.ts': 'resend-webhook',
  'packages/events/server/api/events/reminder-sweep.post.ts': 'events-sweep',
}

/** Der Ausweis-Aufruf je Klasse — asynchrone Gates MIT `await`. */
const GATE_CALL: Record<string, RegExp> = {
  'onboarding-seam': /await\s+requireOnboardingCaller\(\s*event\s*\)/,
  'control-seam': /await\s+requireControlCaller\(\s*event\s*\)/,
  'runner-bearer': /await\s+requireRunner\(\s*event\s*\)/,
  'stripe-webhook': /getHeader\(\s*event\s*,\s*['"]stripe-signature['"]\s*\)[\s\S]*constructEvent\(/,
  'resend-webhook': /checkResendSignature\(\s*\{[\s\S]*svix-signature/,
  'events-sweep': /seamSecretMatches\(\s*getHeader\(\s*event\s*,\s*['"]x-sweep-key['"]\s*\)/,
}

const writeRoutes = routeFiles.filter(r => WRITE.test(r.path))
const classified = writeRoutes.map(r => ({ ...r, cls: classify(r.code) }))

describe('Teil A — Wächter-Selbsttest', () => {
  it('findet überhaupt schreibende Routen (kein grüner Wächter ohne Treffer)', () => {
    expect(writeRoutes.length).toBeGreaterThan(200)
    expect(classified.filter(r => r.cls).length).toBeGreaterThan(50)
  })

  it('ein auskommentierter Ausweis zählt nicht', () => {
    expect(classify(stripComments('// await requireOnboardingCaller(event)\n'))).toBeNull()
    expect(classify(stripComments('/* requireRunner(event) */'))).toBeNull()
  })

  it('der Verdacht greift auf typische Ausweise', () => {
    const suspect = (s: string) => CREDENTIAL_SUSPECT.some(r => r.test(s))
    expect(suspect(`getHeader(event, 'authorization')`)).toBe(true)
    expect(suspect(`getHeader(event, 'x-partner-secret')`)).toBe(true)
    expect(suspect(`const sig = getHeader(event, 'acme-signature')`)).toBe(true)
    expect(suspect(`await requireUser(event)`)).toBe(false)
  })

  it('Routen-Dateien ohne Methoden-Endung sind bekannt', () => {
    const methodless = routeFiles.filter(r => !WRITE.test(r.path)).map(r => r.path).sort()
    expect(methodless).toEqual([...METHODLESS_EXPECTED].sort())
  })
})

describe('Teil A — Bestand der origin-losen Aufrufer', () => {
  it('keine Route passt auf zwei Klassen', () => {
    expect(classified.filter(r => r.cls?.startsWith('MEHRDEUTIG')).map(r => `${r.path} ${r.cls}`)).toEqual([])
  })

  it('Anzahl je Klasse wie festgehalten', () => {
    const counts: Record<string, number> = {}
    for (const r of classified) if (r.cls) counts[r.cls] = (counts[r.cls] ?? 0) + 1
    expect(counts).toEqual(EXPECTED_COUNTS)
  })

  it('die Routen außerhalb der Onboarding-Naht namentlich', () => {
    const actual = Object.fromEntries(classified
      .filter(r => r.cls && r.cls !== 'onboarding-seam')
      .map(r => [r.path, r.cls]))
    expect(actual).toEqual(EXPECTED_NON_SEAM)
  })

  it('jede Klasse der Bestandsliste kommt im Code vor (keine tote Begründung)', () => {
    for (const c of CSRF_ORIGINLESS_CALLERS) {
      expect(classified.some(r => r.cls === c.id), c.id).toBe(true)
    }
  })

  it('keine Route mit eigenem Ausweis außerhalb der Bestandsliste', () => {
    const unknown = classified
      .filter(r => !r.cls && CREDENTIAL_SUSPECT.some(re => re.test(r.code)))
      .map(r => r.path)
    expect(unknown, 'neue Route mit eigenem Ausweis: Klasse in CSRF_ORIGINLESS_CALLERS ergänzen '
      + '(shared/csrfOriginExempt.ts) und hier die Erwartung nachziehen').toEqual([])
  })
})

describe('Teil A — jede Route ruft ihren Ausweis wirklich auf', () => {
  it.each(classified.filter(r => r.cls).map(r => [r.path, r.cls!] as const))('%s (%s)', (path, cls) => {
    const code = classified.find(r => r.path === path)!.code
    expect(GATE_CALL[cls], `kein Aufruf-Muster für ${cls}`).toBeDefined()
    expect(GATE_CALL[cls]!.test(code), `${path}: Ausweis ${cls} wird nicht (abgewartet) aufgerufen`).toBe(true)
  })
})

// ── Teil B ──────────────────────────────────────────────────────────────────

const FORBIDDEN_KEY = /\bcsrfOriginCheck\b/

/** Alle `app.config.ts` unter `apps/*` und `packages/*` (im Ordner `app/` und im Paket-Wurzelordner). */
const appConfigs = (['packages', 'apps'] as const).flatMap(top =>
  topDirs(top).flatMap(name => ['app/app.config.ts', 'app.config.ts']
    .map(file => resolve(REPO, top, name, file))
    .filter(path => existsSync(path))))

describe('Teil B — Herkunftsprüfung überall an, kein Schalter', () => {
  it('die Middleware hat kein Config-Gate (weder `csrfOriginCheck` noch `useAppConfig`)', () => {
    const code = stripComments(readFileSync(
      resolve(REPO, 'packages/core/server/middleware/03.csrf-origin.ts'), 'utf8'))
    expect(code).not.toMatch(FORBIDDEN_KEY)
    expect(code).not.toMatch(/\buseAppConfig\b/)
    // Selbsttest: die Middleware ruft die Regel wirklich auf.
    expect(code).toMatch(/csrfOriginVerdict\(/)
  })

  it('findet die App-Configs (kein grüner Wächter ohne Treffer)', () => {
    expect(appConfigs.length).toBeGreaterThanOrEqual(10)
    expect(appConfigs.some(p => p.endsWith('packages/core/app/app.config.ts'))).toBe(true)
  })

  it('keine app.config.ts führt den Schlüssel `csrfOriginCheck` (ein Aus-Schalter wird rot)', () => {
    const offenders = appConfigs
      .filter(path => FORBIDDEN_KEY.test(stripComments(readFileSync(path, 'utf8'))))
      .map(path => relative(REPO, path))
    expect(offenders, 'Ausnahmen nur als Route mit Grund in core/shared/csrfOriginExempt.ts').toEqual([])
  })
})
