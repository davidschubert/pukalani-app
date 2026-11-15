import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * OPS-002 (GA1 P21, 2026-11-15): „Skripte, die in eine Datenbank schreiben,
 * prüfen zuerst, ob es die richtige ist." (Davids Entscheidung.)
 *
 * Die EINE Prüfung steht in `scripts/lib/target.mjs` (Regel und Begründung
 * dort). Dieser Wächter sorgt dafür, dass kein Skript mit einem Schlüssel an
 * ihr vorbeiläuft — auch keins, das erst morgen geschrieben wird:
 *
 *  1. Jede Datei unter `scripts/`, `packages/*\/scripts/`, `apps/*\/scripts/`,
 *     die einen Schlüssel in die Hand nimmt (Heuristik `HOLDS_KEY`), ruft die
 *     Prüfung — als Import-Zeile oder als Aufruf — oder steht in `EXEMPT`,
 *     MIT Grund.
 *  2. Eine Ausnahme, deren Datei es nicht mehr gibt oder die keinen Schlüssel
 *     mehr hält, ist ebenfalls rot: sonst verrottet die Liste.
 *  3. Jede Migration `packages/*\/scripts/migrations/NNN-*.ts` trägt die
 *     Import-Zeile als ERSTEN Import (Module laufen in Import-Reihenfolge —
 *     die Prüfung muss vor dem ersten Client stehen).
 *
 * Kein Netz, keine Umgebung: gelesen wird nur der Dateiinhalt.
 */
const REPO = join(__dirname, '..', '..', '..')

/** Woran ein Skript erkennbar ist, das einen Schlüssel hält. */
const HOLDS_KEY = [
  /NUXT_APPWRITE_KEY/,
  /NUXT_APPWRITE_MIGRATIONS_KEY/,
  /POOL_KEY/,
  /NUXT_PLATFORM_CONTROL_KEY/,
  /X-Appwrite-Key/i,
  /\.setKey\(/,
  /STRIPE_KEY/,
  /APPWRITE_CONSOLE_PASSWORD/,
  /APPWRITE_POLICIES_KEY/,
  /\.appwrite-secrets/,
]

/** Woran ein Skript erkennbar ist, das die Prüfung ruft. */
const CALLS_CHECK = [
  /scripts\/lib\/assert-target\.mjs['"]/,
  /\bassertTarget\(/,
  /\bcheckTarget\(/,
  /\bcheckStripeTarget\(/,
  /\bisLocalEndpoint\(/,
  // Der Runner: `checkTarget` plus `--prod`/`--dry-run` (scripts/lib/migrate-plan.mjs).
  /\bdecideRunTarget\(/,
]

/**
 * Ausnahmen: Skripte mit Schlüssel, die NICHT schreiben, oder deren einziges
 * mögliches Ziel fest eingebaut ist. Jede Zeile nennt den Grund — eine
 * Ausnahme ohne Grund ist keine.
 */
const EXEMPT: Record<string, string> = {
  'packages/comments/scripts/migrations/verify-schema.ts': 'liest nur Spalten und Indizes (listColumns/listIndexes)',
  'packages/control/scripts/list-silo-keys.ts': 'liest nur, welche Variablen in den Migrations-Env-Dateien stehen',
  'packages/control/scripts/list-silo-tenants.ts': 'liest nur die tenants-Tabelle des Control Plane (Helfer des Wellen-Runners)',
  'packages/feedback/scripts/backup-feedback.mjs': 'liest das alte Silo-Feedback und schreibt nur eine lokale Sicherungsdatei',
  'scripts/ops/appwrite-mirror-prod-to-local.mjs': 'schreibt nur an den fest eingebauten lokalen Endpunkt; Production wird per ssh-SELECT gelesen',
  'scripts/ops/probe-key-scopes.mjs': 'nur GET — fragt ab, was ein Schlüssel darf',
  'scripts/ops/verify-instance-admins.mjs': 'Wächter, liest nur (Admin-Konten zählen)',
  'scripts/ops/verify-health.mjs': 'Wächter, fragt nur öffentliche /api/health-Adressen ab — kein Schlüssel; der Hinweistext nennt lediglich den Ablageort der Migrations-Envs',
  'scripts/ops/verify-schema-parity.mjs': 'Wächter, liest nur das Schema jeder Instanz',
  'scripts/ops/verify-site-env.mjs': 'Wächter, liest per ssh nur Variablennamen und die Projekt-Id',
  'scripts/ops/verify-stale-keys.mjs': 'Wächter, findet tote Schlüssel und liest dafür nur',
}

const SCRIPT_FILE = /\.(?:mjs|cjs|js|mts|ts|sh)$/
const MIGRATION_FILE = /^\d{3}-.+\.ts$/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return SCRIPT_FILE.test(name) ? [path] : []
  })
}

const subDirs = (root: string, sub: string) =>
  existsSync(join(REPO, root))
    ? readdirSync(join(REPO, root), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(REPO, root, entry.name, sub))
    : []

const rel = (path: string) => relative(REPO, path).split(sep).join('/')

const allScripts = [
  ...walk(join(REPO, 'scripts')),
  ...subDirs('packages', 'scripts').flatMap(walk),
  ...subDirs('apps', 'scripts').flatMap(walk),
].map(rel).sort()

const isMigration = (path: string) =>
  /^packages\/[^/]+\/scripts\/migrations\/[^/]+$/.test(path) && MIGRATION_FILE.test(path.split('/').pop()!)

const read = (path: string) => readFileSync(join(REPO, path), 'utf8')
const holdsKey = (source: string) => HOLDS_KEY.some(re => re.test(source))
const callsCheck = (source: string) => CALLS_CHECK.some(re => re.test(source))

const HOW_TO = [
  'Jedes Skript mit Schlüssel prüft vor dem ersten Schreibzugriff sein Ziel (OPS-002, scripts/lib/target.mjs).',
  'So geht es:',
  '  • Umgebung kommt über `node --env-file=…` ⇒ EINE Zeile als ersten Import:',
  '      import \'<relativer Pfad>/scripts/lib/assert-target.mjs\'',
  '  • Endpunkt/Projekt kommen aus einer eigenen Env-Datei, einem Schalter oder sind fest eingebaut ⇒',
  '      import { assertTarget } from \'<relativer Pfad>/scripts/lib/target.mjs\'',
  '      assertTarget({ script: \'<name>\', endpoint, projectId })   // vor dem ersten Client',
  '  • Das Skript liest nur oder sein einziges Ziel ist fest ⇒ Eintrag in EXEMPT',
  '    (packages/core/tests/scriptTargetGuard.test.ts) MIT Grund.',
].join('\n')

describe('Ziel-Prüfung vor dem Schreiben (OPS-002)', () => {
  it('findet überhaupt Skripte (der Wächter sieht hin)', () => {
    expect(allScripts.length).toBeGreaterThan(100)
    expect(allScripts.filter(isMigration).length).toBeGreaterThan(200)
  })

  it('jedes Skript mit Schlüssel ruft die Prüfung oder steht mit Grund in EXEMPT', () => {
    const missing = allScripts
      .filter(path => !isMigration(path) && !(path in EXEMPT))
      .filter((path) => {
        const source = read(path)
        return holdsKey(source) && !callsCheck(source)
      })
    expect(missing, `Ohne Ziel-Prüfung:\n  ${missing.join('\n  ')}\n\n${HOW_TO}`).toEqual([])
  })

  it('jede Ausnahme hat einen Grund, ihre Datei existiert und hält noch einen Schlüssel', () => {
    const stale = Object.entries(EXEMPT).flatMap(([path, reason]) => {
      if (!reason.trim()) return [`${path}: Ausnahme ohne Grund`]
      if (!existsSync(join(REPO, path))) return [`${path}: Datei gibt es nicht mehr — Eintrag löschen`]
      const source = read(path)
      if (!holdsKey(source)) return [`${path}: hält keinen Schlüssel mehr — Eintrag löschen`]
      if (callsCheck(source)) return [`${path}: ruft die Prüfung inzwischen selbst — Eintrag löschen`]
      return []
    })
    expect(stale, `Veraltete Ausnahmen in EXEMPT:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('jede Migration trägt die Prüfung als ersten Import', () => {
    const LINE = 'import \'../../../../scripts/lib/assert-target.mjs\''
    const wrong = allScripts.filter(isMigration).flatMap((path) => {
      const lines = read(path).split('\n')
      const imports = lines.filter(line => /^\s*import[\s{'"*]/.test(line))
      if (imports[0] !== LINE) return [`${path}: erster Import ist ${imports[0] ? `„${imports[0]}"` : 'keiner'}`]
      if (imports.filter(line => line === LINE).length !== 1) return [`${path}: Prüf-Zeile mehrfach`]
      return []
    })
    expect(wrong, `Migrationen ohne Prüfung vorn:\n  ${wrong.join('\n  ')}\n\nErste Import-Zeile jeder Migration:\n  import '../../../../scripts/lib/assert-target.mjs'`).toEqual([])
  })

  it('Runner und create-site prüfen ihr Ziel', () => {
    const migrate = read('scripts/migrate.mjs')
    expect(migrate, 'scripts/migrate.mjs importiert ./lib/target.mjs').toMatch(/from ['"]\.\/lib\/target\.mjs['"]/)
    // Der Runner entscheidet über `decideRunTarget` (scripts/lib/migrate-plan.mjs):
    // das ist `checkTarget` plus seine Regeln zu `--prod` und `--dry-run`. Beide
    // Enden werden festgehalten — der Aufruf im Runner (Einzel-Lauf UND Welle)
    // und dass die Entscheidung wirklich auf `checkTarget` steht.
    expect(migrate.match(/\bdecideRunTarget\(/g)?.length ?? 0, 'scripts/migrate.mjs ruft decideRunTarget( im Einzel-Lauf und in der Welle').toBeGreaterThanOrEqual(2)
    expect(migrate, 'scripts/migrate.mjs reicht die geprüfte Projekt-Id an die Migrationen weiter').toMatch(/\[CONFIRM_ENV\]: target\.projectId/)
    expect(read('scripts/lib/migrate-plan.mjs'), 'decideRunTarget steht auf checkTarget(').toMatch(/\bcheckTarget\(/)
    expect(read('scripts/create-site.mjs'), 'scripts/create-site.mjs ruft assertTarget(').toMatch(/\bassertTarget\(/)
  })
})
