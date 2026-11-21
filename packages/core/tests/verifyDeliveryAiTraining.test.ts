import { describe, expect, it } from 'vitest'
import { aiCrawlerPolicy, buildRobotsTxt } from '../shared/aiCrawlers'
import { checkAiCrawlers } from '../../../scripts/ops/verify-delivery.mjs'

/**
 * DER TÄGLICHE BLICK UND DIE WAHL DES OWNERS (KC1). `verify-delivery.mjs`
 * kennt die Vorgabe „Training nein" und darf nicht rot werden, wenn eine
 * Community das Training erlaubt. Gegenprobe: eine robots.txt, die zu KEINER
 * Wahl passt, bleibt rot; für eine eigene Seite (`own`) gibt es keine Wahl.
 */

const robots = (training: boolean, searchAnswers = true) =>
  ({ status: 200, body: buildRobotsTxt({ policy: { searchAnswers, training }, rules: ['Allow: /'], sitemap: null }) })

describe('checkAiCrawlers für eine Community', () => {
  const community = { ai: 'community' }

  it('Vorgabe (Training nein) ist grün', () => {
    expect(checkAiCrawlers(community, robots(false))).toEqual([])
  })

  it('Wahl des Owners (Training ja) ist ebenfalls grün', () => {
    expect(checkAiCrawlers(community, robots(true))).toEqual([])
  })

  it('Gegenprobe: Suche gesperrt passt zu keiner Wahl ⇒ rot', () => {
    expect(checkAiCrawlers(community, robots(false, false)).length).toBeGreaterThan(0)
  })

  it('Gegenprobe: eigene Seite mit Training nein bleibt rot (dort gibt es keine Wahl)', () => {
    expect(aiCrawlerPolicy('own').training).toBe(true)
    expect(checkAiCrawlers({ ai: 'own' }, robots(false)).length).toBeGreaterThan(0)
  })
})
