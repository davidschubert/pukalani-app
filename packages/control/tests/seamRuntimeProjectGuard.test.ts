import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * EIN PROJEKT AUS DEM BODY WIRD GEPRÜFT, NICHT GEGLAUBT (SEC-027, 2026-11-15).
 *
 * Die Service-Naht kennt zwei Arten, das Runtime-Projekt eines Aufrufs zu
 * belegen: ein Appwrite-JWT, das das Control Plane selbst gegen das Projekt
 * prüft (`verifyRuntimeIdentity`, `requireSiteDomainCaller`), oder — bei den
 * DSGVO-Routen, die bewusst OHNE JWT laufen — `assertOnboardingRuntimeProject`,
 * das den genannten Wert gegen das EINE Pool-Projekt hält. Eine Route, die
 * nur das Service-Secret prüft und das Projekt dann aus dem Body übernimmt,
 * vertraut dem Aufrufer eine Angabe an, die ihn zum Zugriff auf ein FREMDES
 * Runtime-Projekt macht. F33 (2026-08-02) schloss das an den Mitglieder-
 * Routen; die beiden Feedback-Routen hatten dieselbe Form und fielen erst im
 * Audit auf. Kein Typ und kein Einzeltest einer Route sieht das — deshalb
 * zählt dieser Wächter die Routen selbst: eine NEUE Route dieser Form wird
 * hier rot.
 *
 * Gelesen wird der Quelltext, nicht ausgeführt. Der Wächter sagt nur, DASS
 * eine Prüfung im Quelltext steht; dass sie greift, zeigt
 * `feedbackSeamProject.test.ts` am echten Handler.
 */

const apiRoot = fileURLToPath(new URL('../server/api/control', import.meta.url))
const gateSource = readFileSync(fileURLToPath(new URL('../server/utils/siteDomainGate.ts', import.meta.url)), 'utf8')

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return tsFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

/** Helfer, die ein JWT gegen das Projekt prüfen — jeder hier mit Beleg unten. */
const JWT_GATES = ['verifyRuntimeIdentity(', 'requireSiteDomainCaller(']

/**
 * AUSNAHMEN — nur mit Grund. Pfad relativ zu `server/api/control`.
 */
const EXCEPTIONS: Record<string, string> = {
  // Eine SILO-App fragt hier nach ihrer EIGENEN Adresse, bei jedem Request und
  // ohne Nutzer (also ohne JWT). Das Projekt ist hier gerade NICHT das
  // Pool-Projekt, und die Antwort enthält nur öffentliche Tatsachen
  // (Hostnamen und ihre Stufe, die ohnehin im DNS stehen) — Begründung im
  // Kopf der Route.
  'site/domain/host.post.ts': 'Silo fragt öffentliche Adresse, Projekt ist nie das Pool-Projekt',
}

/** Liest die Route `projectId`/`runtimeProjectId` aus ihrem validierten Body? */
function readsProjectFromBody(source: string): boolean {
  const named = [...source.matchAll(/const (\w+) = await readValidatedBody\(/g)].map(match => match[1]!)
  if (named.some(name => new RegExp(`\\b${name}\\.(?:runtimeProjectId|projectId)\\b`).test(source))) return true
  return /const \{[^}]*\b(?:runtimeProjectId|projectId)\b[^}]*\} = await readValidatedBody\(/.test(source)
}

const routes = tsFiles(apiRoot)
  .map(path => ({ file: path.slice(apiRoot.length + 1), source: readFileSync(path, 'utf8') }))
  .filter(({ source }) => source.includes('await requireOnboardingCaller('))

const projectFromBody = routes.filter(({ source }) =>
  readsProjectFromBody(source) && !JWT_GATES.some(gate => source.includes(gate)))

describe('Service-Naht: ein Projekt aus dem Body wird geprüft', () => {
  it('findet die Naht-Routen und die betroffenen überhaupt', () => {
    // Ein Wächter, der nichts findet, ist grün und wertlos.
    expect(routes.length).toBeGreaterThan(40)
    // Mindestens die vier DSGVO-Routen (Mitglieder + Feedback) müssen es sein.
    expect(projectFromBody.length).toBeGreaterThanOrEqual(4)
  })

  it.each(projectFromBody.map(route => route.file))('%s ruft assertOnboardingRuntimeProject', (file) => {
    if (EXCEPTIONS[file]) return
    const source = projectFromBody.find(route => route.file === file)!.source
    expect(source).toContain('assertOnboardingRuntimeProject(')
  })

  it('jede Ausnahme gibt es noch, und sie wäre ohne Eintrag ein Befund', () => {
    for (const file of Object.keys(EXCEPTIONS)) {
      expect(projectFromBody.map(route => route.file), file).toContain(file)
    }
  })

  it('die JWT-Helfer prüfen wirklich ein JWT', () => {
    // Sonst wäre die Liste oben eine Behauptung, die sich der Wächter selbst
    // glaubt. `verifyRuntimeIdentity` steht in onboardingService.ts.
    expect(gateSource).toMatch(/export async function requireSiteDomainCaller[\s\S]*?verifyIdentityAgainst\(/)
  })
})
