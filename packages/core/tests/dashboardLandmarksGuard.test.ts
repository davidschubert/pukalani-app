import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: AUFBAU DES DASHBOARDS FÜR TASTATUR UND VORLESEPROGRAMM (UX-006,
 * UX-010; Q09).
 *
 * Drei Zusagen, die weder Typecheck noch Lint sehen:
 *
 *  1. GENAU EIN HAUPTBEREICH. `main` setzt das Layout `dashboard` um den
 *     Seiten-Slot. Eine Seite, die dieses Layout trägt, darf deshalb kein
 *     eigenes `<main>` oder `role="main"` mitbringen — sonst wären es zwei.
 *  2. DER UMSCHALTER DER SEITENLEISTE SAGT SEINEN ZUSTAND. Eingebunden wird
 *     `CoreSidebarCollapse` (setzt `aria-expanded`), nie der nackte
 *     `UDashboardSidebarCollapse` der Bibliothek.
 *  3. DAS LAYOUT TRÄGT SPRUNGLINK UND `main` — und der Sprunglink steht VOR
 *     der Seitenleiste, sonst ist er nicht der erste Tab-Schritt.
 *
 * Im Browser prüft dasselbe `apps/comments/e2e/dashboard-landmarks.spec.ts`.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground', 'dist'])
const LAYOUT = 'packages/admin/app/layouts/dashboard.vue'
const WRAPPER = 'packages/core/app/components/core/SidebarCollapse.vue'

function vueFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) vueFiles(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

function appDirs(): string[] {
  const dirs: string[] = []
  for (const group of ['packages', 'apps']) {
    const root = join(REPO, group)
    for (const name of readdirSync(root)) dirs.push(join(root, name, 'app'))
  }
  return dirs
}

const files = appDirs().flatMap(dir => vueFiles(dir)).map(full => ({
  file: relative(REPO, full),
  // Kommentare zählen nicht: sie nennen die Bausteine beim Namen.
  source: readFileSync(full, 'utf8').replace(/<!--[\s\S]*?-->/g, ''),
}))

/** Der Template-Teil einer Datei ohne den Skript-Block. */
function templateOf(source: string): string {
  return source.replace(/<script[\s\S]*?<\/script>/g, '')
}

describe('Wächter: Aufbau des Dashboards', () => {
  it('findet überhaupt Seiten mit dem Layout `dashboard` (sonst prüft der Wächter nichts)', () => {
    const pages = files.filter(f => /layout:\s*['"]dashboard['"]/.test(f.source))
    expect(pages.length).toBeGreaterThan(50)
  })

  it('keine Seite mit dem Layout `dashboard` bringt ein eigenes `main` mit', () => {
    const offenders = files
      .filter(f => /layout:\s*['"]dashboard['"]/.test(f.source))
      .filter(f => /<main[\s>]|role=["']main["']|<UMain[\s>/]/.test(templateOf(f.source)))
      .map(f => f.file)
    expect(offenders).toEqual([])
  })

  it('der Umschalter der Seitenleiste wird nur über `CoreSidebarCollapse` eingebunden', () => {
    const offenders = files
      .filter(f => f.file !== WRAPPER)
      .filter(f => /<UDashboardSidebarCollapse[\s/>]/.test(templateOf(f.source)))
      .map(f => f.file)
    expect(offenders).toEqual([])
    const wrapper = files.find(f => f.file === WRAPPER)
    expect(wrapper?.source).toMatch(/<UDashboardSidebarCollapse[^>]*:aria-expanded="!sidebarCollapsed"/)
  })

  it('das Layout trägt den Sprunglink vor der Seitenleiste und genau ein `main` um den Slot', () => {
    const layout = templateOf(files.find(f => f.file === LAYOUT)!.source)
    const skip = layout.indexOf('data-testid="skip-to-content"')
    const sidebar = layout.indexOf('<UDashboardSidebar')
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(sidebar)
    expect(layout.match(/<main[\s>]/g)).toHaveLength(1)
    expect(layout).toMatch(/<main[^>]*id="dashboard-main"[^>]*tabindex="-1"[\s\S]*?<slot \/>\s*<\/CoreDashboardToggleState>\s*<\/main>/)
  })

  it('der Schubladen-Knopf bekommt seinen Zustand zentral: die Hülle umschließt den Slot (Q09-Rest)', () => {
    const layout = templateOf(files.find(f => f.file === LAYOUT)!.source)
    expect(layout).toMatch(/<CoreDashboardToggleState>\s*<slot \/>\s*<\/CoreDashboardToggleState>/)
    const hull = files.find(f => f.file === 'packages/core/app/components/core/DashboardToggleState.vue')
    expect(hull?.source).toMatch(/dashboardNavbar: \{ toggle: \{ 'aria-expanded': sidebarOpen\?\.value === true \} \}/)
    // Eine Seite, die `toggle` selbst setzt, überginge die Vorgabe.
    const own = files
      .filter(f => /<UDashboardNavbar[^>]*\s:?toggle[=\s>]/.test(templateOf(f.source)))
      .map(f => f.file)
    expect(own).toEqual([])
  })
})
