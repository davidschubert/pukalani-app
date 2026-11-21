import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AI_CRAWLER_POLICY,
  AI_CRAWLERS,
  aiCrawlerPolicy,
  aiCrawlerRobotsProblems,
  buildRobotsTxt,
  contentSignalLine,
  parseRobotsGroups,
} from '../shared/aiCrawlers'

/**
 * Was KI-Crawler dürfen (Q11, Davids Entscheidung B2 vom 2026-11-21): die eine
 * Regel, ihr Aufbau als robots.txt und die Prüfung, die auch der tägliche
 * Blick (`scripts/ops/verify-delivery.mjs`) benutzt — je Art mit Gegenprobe.
 */
const REPO = join(__dirname, '..', '..', '..')
const RULES = ['Allow: /', 'Disallow: /api/', 'Disallow: /dashboard/']

describe('die Entscheidung B2', () => {
  it('eigene Seiten: alles; Communities: Suche und Antworten, kein Training; geschlossen: nichts', () => {
    expect(AI_CRAWLER_POLICY.own).toEqual({ searchAnswers: true, training: true })
    expect(AI_CRAWLER_POLICY.community).toEqual({ searchAnswers: true, training: false })
    expect(AI_CRAWLER_POLICY.closed).toEqual({ searchAnswers: false, training: false })
  })

  it('der spätere Owner-Schalter ändert genau einen Wert', () => {
    expect(aiCrawlerPolicy('community', { training: true })).toEqual({ searchAnswers: true, training: true })
    // Die Tabelle selbst bleibt unberührt.
    expect(AI_CRAWLER_POLICY.community.training).toBe(false)
  })

  it('jeder Crawler hat genau einen Zweck, eine Quelle beim Anbieter und steht nur einmal da', () => {
    const names = AI_CRAWLERS.map(crawler => crawler.agent.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const crawler of AI_CRAWLERS) expect(crawler.source).toMatch(/^https:\/\//)
    // Googlebot trägt die Google-Suche samt ihrer KI-Übersichten — nie auf die Liste.
    expect(names).not.toContain('googlebot')
    expect(AI_CRAWLERS.filter(crawler => crawler.purpose === 'training').length).toBeGreaterThan(0)
    expect(AI_CRAWLERS.filter(crawler => crawler.purpose === 'searchAnswers').length).toBeGreaterThan(0)
  })
})

describe('robots.txt je Art', () => {
  for (const kind of ['own', 'community', 'closed'] as const) {
    it(`${kind}: die gebaute Datei besteht die Prüfung`, () => {
      const policy = aiCrawlerPolicy(kind)
      const body = buildRobotsTxt({ policy, rules: kind === 'closed' ? ['Disallow: /'] : RULES, sitemap: 'https://x.test/sitemap.xml' })
      expect(aiCrawlerRobotsProblems(body, policy)).toEqual([])
    })
  }

  it('Community: Training-Crawler bekommen Disallow: /, Such-Crawler dieselben Regeln wie *', () => {
    const groups = parseRobotsGroups(buildRobotsTxt({ policy: aiCrawlerPolicy('community'), rules: RULES }))
    const of = (agent: string) => groups.find(group => group.agents.includes(agent.toLowerCase()))!
    expect(of('GPTBot').rules).toEqual(['disallow: /'])
    expect(of('Google-Extended').rules).toEqual(['disallow: /'])
    expect(of('OAI-SearchBot').rules).toEqual(['allow: /', 'disallow: /api/', 'disallow: /dashboard/'])
    expect(of('*').rules).toContain('content-signal: search=yes, ai-input=yes, ai-train=no')
  })

  it('eigene Seite: die KI-Gruppen erben die Sperren von * (sonst stünde /api/ offen)', () => {
    const groups = parseRobotsGroups(buildRobotsTxt({ policy: aiCrawlerPolicy('own'), rules: RULES }))
    for (const group of groups) expect(group.rules.filter(rule => rule.startsWith('disallow:'))).toEqual(['disallow: /api/', 'disallow: /dashboard/'])
  })

  it('Content-Signal folgt der Regel', () => {
    expect(contentSignalLine(aiCrawlerPolicy('own'))).toBe('Content-Signal: search=yes, ai-input=yes, ai-train=yes')
    expect(contentSignalLine(aiCrawlerPolicy('closed'))).toBe('Content-Signal: search=no, ai-input=no, ai-train=no')
  })
})

describe('GEGENPROBEN: die Prüfung wird rot', () => {
  const own = buildRobotsTxt({ policy: aiCrawlerPolicy('own'), rules: RULES })
  const community = buildRobotsTxt({ policy: aiCrawlerPolicy('community'), rules: RULES })

  it('eine Datei ohne KI-Gruppen (der Stand vor Q11)', () => {
    const problems = aiCrawlerRobotsProblems(['User-agent: *', ...RULES].join('\n'), aiCrawlerPolicy('community'))
    expect(problems.some(problem => problem.startsWith('Content-Signal'))).toBe(true)
    expect(problems.some(problem => problem.startsWith('GPTBot: keine eigene Gruppe'))).toBe(true)
  })

  it('eine Community, die Training erlaubt, und eine eigene Seite, die es sperrt', () => {
    expect(aiCrawlerRobotsProblems(own, aiCrawlerPolicy('community'))).toContain('GPTBot: nicht Disallow: /')
    expect(aiCrawlerRobotsProblems(community, aiCrawlerPolicy('own'))).toContain('GPTBot: nicht dieselben Regeln wie *')
  })

  it('ein Such-Crawler mit leerem Disallow (alles offen, auch /api/)', () => {
    const broken = community.replace('User-agent: OAI-SearchBot', 'User-agent: OAI-SearchBot\nDisallow:\n\nUser-agent: X-Placeholder')
    expect(aiCrawlerRobotsProblems(broken, aiCrawlerPolicy('community'))).toContain('OAI-SearchBot: nicht dieselben Regeln wie *')
  })

  it('ein Name in zwei Gruppen und eine Datei ohne *', () => {
    expect(aiCrawlerRobotsProblems(`${community}\nUser-agent: GPTBot\nAllow: /\n`, aiCrawlerPolicy('community'))).toContain('GPTBot: mehr als eine Gruppe')
    expect(aiCrawlerRobotsProblems('User-agent: GPTBot\nDisallow: /\n', aiCrawlerPolicy('community'))).toEqual(['keine Gruppe für User-agent: *'])
  })
})

describe('jede robots-Route liest aus der einen Quelle', () => {
  /**
   * Eine robots-Route baut ihre Datei mit `buildRobotsTxt()` — selbst oder über
   * eine Hilfe der App (`*RobotsTxt()` in `server/utils/`). Eine neue Route,
   * die ihren Text von Hand schreibt, sagt über KI-Crawler nichts und ist rot.
   */
  const apps = readdirSync(join(REPO, 'apps')).filter(app => existsSync(join(REPO, 'apps', app, 'server', 'routes', 'robots.txt.get.ts')))

  it('die bekannten Apps haben eine robots-Route', () => {
    expect(apps).toEqual(expect.arrayContaining(['branding', 'control', 'help', 'marketing', 'platform', 'portfolio']))
  })

  for (const app of apps) {
    it(app, () => {
      const route = readFileSync(join(REPO, 'apps', app, 'server', 'routes', 'robots.txt.get.ts'), 'utf8')
      if (route.includes('buildRobotsTxt(')) return
      const helpers = [...route.matchAll(/import \{([^}]+)\} from '\.\.\/utils\/(\w+)'/g)]
      const used = helpers.flatMap(([, names, file]) => names!.split(',').map(name => name.trim()).filter(name => /RobotsTxt$/.test(name)).map(name => ({ name, file: file! })))
      expect(used.length, 'die Route nutzt weder buildRobotsTxt noch eine *RobotsTxt-Hilfe').toBeGreaterThan(0)
      for (const { name, file } of used) {
        const source = readFileSync(join(REPO, 'apps', app, 'server', 'utils', `${file}.ts`), 'utf8')
        const body = source.slice(source.indexOf(`export function ${name}(`))
        const end = body.indexOf('\n}\n')
        expect(body.slice(0, end), `${name} baut nicht mit buildRobotsTxt`).toContain('buildRobotsTxt(')
      }
    })
  }
})
