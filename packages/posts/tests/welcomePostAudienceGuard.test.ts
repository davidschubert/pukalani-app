import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: DER WILLKOMMENS-BEITRAG DARF `read(any)` TRAGEN — SOLANGE JEDE
 * COMMUNITY ÖFFENTLICH ANGELEGT WIRD.
 *
 * `seedWelcomePost.ts` gibt dem Willkommens-Beitrag fest
 * `Permission.read(Role.any())`. Richtig ist das nur, weil (a) beide
 * Anlege-Wege einer Community fest `audience: 'public'` schreiben und (b)
 * gesät wird nur bei einer ECHTEN Neuanlage (`!result.reused` in
 * `site.post.ts`) — eine schon bestehende, inzwischen vielleicht geschlossene
 * Community bekommt nie nachträglich einen offenen Beitrag.
 *
 * Wird eine Community je „nur für Mitglieder" angelegt (oder auf einem Weg
 * gesät, der eine bestehende trifft), wird dieser Test rot. Dann muss der
 * Willkommens-Beitrag das Publikum der Community bekommen
 * (`withPublishedRead`, core) statt des festen `read(any)`.
 *
 * Quelltext-Prüfung statt Import: die drei Dateien gehören anderen Layern
 * (A14), gelesen wird nur ihr Text.
 */
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const read = (path: string) => readFileSync(`${repoRoot}${path}`, 'utf8')

const CREATE_PATHS = [
  'packages/control/server/utils/onboardingProvision.ts',
  'packages/control/server/api/control/tenants/index.post.ts',
] as const

describe('Willkommens-Beitrag: jede neue Community ist öffentlich', () => {
  for (const path of CREATE_PATHS) {
    it(`${path} legt mit audience: 'public' an — und mit keinem anderen Publikum`, () => {
      const assignments = [...read(path).matchAll(/\baudience:\s*([^,\n}]+)/g)].map(m => m[1]!.trim())
      expect(assignments.length).toBeGreaterThan(0)
      expect(assignments.every(value => value === `'public'`)).toBe(true)
    })
  }
})

describe('Willkommens-Beitrag: gesät wird nur bei einer echten Neuanlage', () => {
  const source = read('packages/onboarding/server/api/onboarding/site.post.ts')

  it('genau EIN Aufruf von seedCommunityFirstContent', () => {
    expect(source.match(/seedCommunityFirstContent\(/g) ?? []).toHaveLength(1)
  })

  it('der Aufruf steht innerhalb des `if (!result.reused)`-Blocks', () => {
    const open = source.indexOf('  if (!result.reused) {\n')
    expect(open).toBeGreaterThan(-1)
    // Der Block endet an der ersten schließenden Klammer auf derselben Einrückung.
    const close = source.indexOf('\n  }\n', open)
    expect(close).toBeGreaterThan(open)
    const call = source.indexOf('seedCommunityFirstContent(')
    expect(call).toBeGreaterThan(open)
    expect(call).toBeLessThan(close)
  })
})
