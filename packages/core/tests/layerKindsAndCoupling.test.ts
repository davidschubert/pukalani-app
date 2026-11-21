/**
 * DIE EINORDNUNG DER LAYER UND IHRE ABHÄNGIGKEITEN ÜBER AUTO-IMPORT (Q18,
 * ARC-003/ARC-008) — die Leser hinter `pnpm check:manifests`, Prüfung 11 und 12.
 */
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — reines JS-Modul ohne Typen (scripts/ liegt in keiner tsconfig)
import { kindFromManifestSource, readLayerKinds } from '../../../scripts/lib/layer-kinds.mjs'
// @ts-expect-error — reines JS-Modul ohne Typen
import { componentName, couplingProblems, usedNames } from '../../../scripts/lib/autoimport-coupling.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

describe('Layer-Einordnung: eine Quelle (kind im Manifest)', () => {
  it('liest genau eine Zeile fester Form und wirft sonst', () => {
    expect(kindFromManifestSource(`export default {\n  key: 'x',\n  kind: 'seam',\n}\n`, 'x')).toBe('seam')
    expect(() => kindFromManifestSource(`export default { kind: 'seam' }`, 'x')).toThrow(/GENAU EINE/)
    expect(() => kindFromManifestSource(`  kind: 'seam',\n  kind: 'product',\n`, 'x')).toThrow(/GENAU EINE/)
    expect(() => kindFromManifestSource(`  kind: 'feature',\n`, 'x')).toThrow(/gibt es nicht/)
  })

  it('Davids Entscheidung R1: admin, billing, themes sind Fundament Stufe 2; Stufe 1 ist core + system', () => {
    const { base, foundation } = readLayerKinds(ROOT) as { base: string[], foundation: string[] }
    expect(base).toEqual(['core', 'system'])
    expect(foundation).toEqual(expect.arrayContaining(['admin', 'billing', 'themes']))
  })
})

describe('Abhängigkeiten über Auto-Import', () => {
  it('Komponenten-Namen folgen Nuxts Präfix-Regel', () => {
    expect(componentName('CommentSection.vue')).toBe('CommentSection')
    expect(componentName('core/EmptyState.vue')).toBe('CoreEmptyState')
    expect(componentName('dashboard/DashboardUserMenu.vue')).toBe('DashboardUserMenu')
  })

  it('zählt Aufrufe und Tags, nicht Parameter, Eigenschaften, Importe oder Zeichenketten', () => {
    const names = usedNames([
      `import { importedHelper } from './x'`,
      `export function replaceGrants(siteProjectId: string) { return query('siteProjectId', { siteProjectId }) }`,
      `const local = recordAudit(event, 'x') // registerFeedbackBackend`,
      `const text = 'useModerationPresence'`,
      `obj.memberAccess()`,
      `<CommentSection`,
      `  :target-id="id" />`,
    ].join('\n'))
    expect([...names]).toEqual(expect.arrayContaining(['recordAudit', 'CommentSection']))
    for (const absent of ['importedHelper', 'siteProjectId', 'registerFeedbackBackend', 'useModerationPresence', 'memberAccess']) {
      expect(names.has(absent), absent).toBe(false)
    }
  })

  const real = async () => {
    const { kindOf } = readLayerKinds(ROOT) as { kindOf: Record<string, string> }
    const requiresOf: Record<string, string[]> = {}
    for (const layer of Object.keys(kindOf)) {
      const manifest = (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'packages', layer, 'product.manifest.ts')).href)).default as { requires?: string[] }
      requiresOf[layer] = manifest.requires ?? []
    }
    return { kindOf, requiresOf }
  }

  it('der heutige Stand ist sauber', async () => {
    const { kindOf, requiresOf } = await real()
    expect(couplingProblems({ root: ROOT, kindOf, requiresOf })).toEqual([])
  }, 30_000)

  it('Gegenprobe aus Session 8: ohne `comments` in insights.requires ist es rot', async () => {
    const { kindOf, requiresOf } = await real()
    requiresOf.insights = requiresOf.insights!.filter(req => req !== 'comments')
    expect(couplingProblems({ root: ROOT, kindOf, requiresOf }).join('\n')).toMatch(/packages\/insights: nutzt per Auto-Import aus „comments" — CommentSection/)
  }, 30_000)

  it('Gegenprobe: ein Fundament-Layer, der ein Produkt verlangt, ist rot', async () => {
    const { kindOf, requiresOf } = await real()
    requiresOf.admin = [...requiresOf.admin!, 'posts']
    expect(couplingProblems({ root: ROOT, kindOf, requiresOf }).join('\n')).toMatch(/packages\/admin\/product\.manifest\.ts: requires „posts" — ein Fundament-Layer/)
  }, 30_000)
})
