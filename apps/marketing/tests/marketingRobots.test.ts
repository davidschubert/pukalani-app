/**
 * robots.txt VON pukalani.app — pur geprüft, ohne Server (Muster:
 * apps/help/tests/helpSitemap.test.ts). Zweiter Teil: derselbe Text besteht
 * die tägliche Prüfung `checkRobots` aus `scripts/ops/verify-delivery.mjs`
 * (nur die Funktion, das Skript zielt auf Production und läuft hier nicht).
 */
import { describe, expect, it } from 'vitest'
import { checkRobots, HOSTS } from '../../../scripts/ops/verify-delivery.mjs'
import { marketingRobotsTxt } from '../server/utils/marketingRoutes'

describe('marketing: robots.txt', () => {
  const body = marketingRobotsTxt('https://pukalani.app/')
  const lines = body.split('\n')

  it('lädt ein, sperrt /api/ und /cdn-cgi/ und nennt die Sitemap absolut', () => {
    expect(lines).toContain('User-agent: *')
    expect(lines).toContain('Allow: /')
    expect(lines).toContain('Disallow: /api/')
    expect(lines).toContain('Disallow: /cdn-cgi/')
    expect(lines).toContain('Sitemap: https://pukalani.app/sitemap.xml')
  })

  it('besteht die tägliche Liefer-Prüfung für pukalani.app', () => {
    const entry = HOSTS.find((host: { host: string }) => host.host === 'pukalani.app')
    expect(entry).toBeDefined()
    const result = checkRobots(entry, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body })
    expect(result.problems).toEqual([])
    expect(result.sitemap).toBe('https://pukalani.app/sitemap.xml')
  })

  it('GEGENPROBE: eine Sitemap auf fremdem Host fällt bei derselben Prüfung durch', () => {
    const entry = HOSTS.find((host: { host: string }) => host.host === 'pukalani.app')
    const foreign = marketingRobotsTxt('https://example.test')
    const result = checkRobots(entry, { status: 200, headers: { 'content-type': 'text/plain' }, body: foreign })
    expect(result.problems).toContain('robots: /robots.txt nennt keine Sitemap auf dem eigenen Host')
  })
})
