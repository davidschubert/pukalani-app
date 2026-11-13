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
 * Teil B — WELCHE APP HAT DIE PRÜFUNG AN? Jede App mit Anmeldung muss sie an
 * haben; die Apps, die in Stufe 1 noch aus sind, stehen begründet in
 * `STAGE2_PENDING`. Stufe 2 leert diese Liste und dreht den Core-Default.
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

/** Muss an sein — ohne Ausnahme. */
const MUST_BE_ON = ['comments', 'control', 'platform', '_template'] as const

/**
 * ÜBERGANGSLISTE STUFE 2: Apps, in denen die Prüfung in Stufe 1 noch aus ist.
 * Stufe 2 leert diese Liste und dreht den Core-Default. `accounts` hält fest,
 * ob die App Konten hat (erkennt der Test am admin-Layer im `extends`).
 */
const STAGE2_PENDING: Record<string, { accounts: boolean, reason: string }> = {
  marketing: {
    accounts: false,
    reason: 'Ohne Konten (Anmeldung liegt auf account.pukalani.app); Stufe 2 schaltet mit dem Core-Default ein.',
  },
  help: {
    accounts: false,
    reason: 'Ohne Konten und ohne eigene schreibende Routen; Stufe 2 schaltet mit dem Core-Default ein.',
  },
  portfolio: {
    accounts: true,
    reason: 'Silo mit Dashboard; Formular /api/intro-call und SSR-Aufrufe werden vor Stufe 2 geprüft.',
  },
  branding: {
    accounts: true,
    reason: 'Silo mit Konten; /invite rief beim SSR schreibend (seit SEC-004 nur im Browser), Rest vor Stufe 2 prüfen.',
  },
  photos: {
    accounts: true,
    reason: 'Silo mit Dashboard; Formular /api/contact wird vor Stufe 2 geprüft.',
  },
}

const apps = topDirs('apps').filter(name => existsSync(resolve(REPO, 'apps', name, 'nuxt.config.ts')))

function checkIsOn(app: string): boolean {
  const path = resolve(REPO, 'apps', app, 'app/app.config.ts')
  if (!existsSync(path)) return false
  return /\bcsrfOriginCheck\s*:\s*true\b/.test(stripComments(readFileSync(path, 'utf8')))
}

function hasAccounts(app: string): boolean {
  const config = stripComments(readFileSync(resolve(REPO, 'apps', app, 'nuxt.config.ts'), 'utf8'))
  return /['"]\.\.\/\.\.\/packages\/admin['"]/.test(config)
}

describe('Teil B — Herkunftsprüfung je App', () => {
  it('findet die Apps', () => {
    expect(apps.length).toBeGreaterThanOrEqual(9)
    for (const app of [...MUST_BE_ON, ...Object.keys(STAGE2_PENDING)]) expect(apps, app).toContain(app)
  })

  it.each(MUST_BE_ON)('%s hat die Prüfung an', (app) => {
    expect(checkIsOn(app)).toBe(true)
  })

  it.each(apps)('%s: an, oder begründet auf der Übergangsliste', (app) => {
    const pending = STAGE2_PENDING[app]
    if (!pending) {
      expect(checkIsOn(app), `${app}: Prüfung einschalten (security.csrfOriginCheck: true)`).toBe(true)
      return
    }
    expect(pending.reason.length).toBeGreaterThan(20)
    expect(hasAccounts(app), `${app}: Konten-Angabe der Übergangsliste stimmt nicht mehr`).toBe(pending.accounts)
    // Eingeschaltet? Dann gehört die App von der Liste.
    expect(checkIsOn(app), `${app} ist schon an — aus STAGE2_PENDING streichen`).toBe(false)
  })

  it('jede App mit Konten, die nicht auf der Übergangsliste steht, hat die Prüfung an', () => {
    const missing = apps.filter(app => hasAccounts(app) && !STAGE2_PENDING[app] && !checkIsOn(app))
    expect(missing).toEqual([])
  })
})
