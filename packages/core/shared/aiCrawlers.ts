/**
 * WAS KI-CRAWLER DÜRFEN — die EINE Regel für jede robots.txt (Q11, GEO-001,
 * Davids Entscheidung B2 vom 2026-11-21, DECISION-LOG).
 *
 * Drei Arten von Site, eine Zeile je Art in `AI_CRAWLER_POLICY`:
 *   - `own`       unsere eigenen Seiten (pukalani.app, Hilfe, Studio,
 *                 branding.supply, Kundenbereich, Konsole): Suche, Antworten
 *                 UND Training erlaubt — wir wollen genannt werden.
 *   - `community` eine öffentliche Kunden-Community: Suche und Antworten ja,
 *                 Training NEIN. Dort stehen Texte der Mitglieder, nicht unsere.
 *   - `closed`    eine geschlossene Community (C18): niemand, wie für alle
 *                 anderen Crawler auch (`Disallow: /`).
 *
 * DER SPÄTERE SCHALTER JE COMMUNITY (offen in OPEN-ITEMS) ändert genau einen
 * Wert: `aiCrawlerPolicy('community', { training: true })`. Die Route liest
 * ihn dann aus der Community; Liste, Aufbau und Prüfung bleiben, wie sie sind.
 *
 * WER ZU WELCHER GRUPPE GEHÖRT, steht in `AI_CRAWLERS` — nachgelesen am
 * 2026-11-21 in der Dokumentation der Anbieter (Adresse je Eintrag). Wer
 * nicht in der Liste steht, folgt der allgemeinen Regel `User-agent: *`
 * (Bytespider etwa: der Anbieter dokumentiert ihn nicht). Bewusst NICHT in der
 * Liste: `Googlebot` (die KI-Übersichten der Google-Suche hängen an ihm, nicht
 * an Google-Extended — ihn zu sperren hieße, die Suche zu verlassen).
 *
 * EHRLICHKEIT: robots.txt und `Content-Signal` sind BITTEN, keine Sperre.
 * Mehrere Abrufer, die ein Mensch auslöst (ChatGPT-User, Perplexity-User,
 * meta-externalfetcher, Amzn-User), schreiben selbst, dass sie die Datei nicht
 * immer beachten. Was nicht gelesen werden darf, schützen die Rechte an den
 * Zeilen, nicht diese Datei.
 *
 * Rein und ohne Nuxt-Abhängigkeit: die robots-Routen aller Apps, ihre Tests
 * UND der tägliche Blick `scripts/ops/verify-delivery.mjs` lesen dieselbe
 * Datei — deshalb nur Typen, die Node ohne Übersetzer versteht.
 */

/** Wofür ein Crawler Seiten abruft. */
export type AiCrawlerPurpose = 'searchAnswers' | 'training'

/** Die Arten von Site, für die B2 eine Antwort gibt. */
export type CrawlerSiteKind = 'own' | 'community' | 'closed'

export interface AiCrawlerPolicy {
  /** Suchindex eines KI-Produkts und Abruf, wenn jemand fragt. */
  searchAnswers: boolean
  /** Inhalte zum Trainieren von Modellen sammeln. */
  training: boolean
}

export const AI_CRAWLER_POLICY: Readonly<Record<CrawlerSiteKind, Readonly<AiCrawlerPolicy>>> = {
  own: { searchAnswers: true, training: true },
  community: { searchAnswers: true, training: false },
  closed: { searchAnswers: false, training: false },
}

/** Die Regel einer Art — `override` trägt die Wahl des Owners (KC1: `training` je Community, Vorgabe nein). */
export function aiCrawlerPolicy(kind: CrawlerSiteKind, override: Partial<AiCrawlerPolicy> = {}): AiCrawlerPolicy {
  return { ...AI_CRAWLER_POLICY[kind], ...override }
}

export interface AiCrawler {
  /** Der Name in `User-agent:`. */
  agent: string
  purpose: AiCrawlerPurpose
  /** Dokumentation des Anbieters, gelesen am 2026-11-21. */
  source: string
}

const OPENAI = 'https://developers.openai.com/api/docs/bots'
const ANTHROPIC = 'https://support.claude.com/en/articles/8896518'
const GOOGLE = 'https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers'
const APPLE = 'https://support.apple.com/en-us/119829'
const PERPLEXITY = 'https://docs.perplexity.ai/guides/bots'
const META = 'https://developers.facebook.com/docs/sharing/webmasters/web-crawlers'
const AMAZON = 'https://developer.amazon.com/amazonbot'

/**
 * Reihenfolge: erst nach Zweck, darin nach Anbieter. Zwei Grenzfälle, beide
 * so eingeordnet, wie der Anbieter den NAMEN anbietet:
 *   - `Google-Extended` ist kein Crawler, sondern ein Schalter für Training
 *     UND für die Antworten von Gemini aus Suchinhalten — Google trennt das
 *     nicht. Er steht bei Training; eine Community verliert damit auch die
 *     Gemini-Antworten, nicht aber die Google-Suche.
 *   - `Applebot` speist Spotlight, Siri und Safari und kann laut Apple auch
 *     ins Training gehen; abwählen lässt sich das Training nur über den
 *     Schalter `Applebot-Extended`. Deshalb: Applebot bei Suche, der Schalter
 *     bei Training.
 *   - `Amazonbot` kann laut Amazon Modelle trainieren; für Suche und Antworten
 *     nennt Amazon eigene Namen. Er steht deshalb bei Training.
 */
export const AI_CRAWLERS: readonly AiCrawler[] = [
  { agent: 'OAI-SearchBot', purpose: 'searchAnswers', source: OPENAI },
  { agent: 'ChatGPT-User', purpose: 'searchAnswers', source: OPENAI },
  { agent: 'Claude-SearchBot', purpose: 'searchAnswers', source: ANTHROPIC },
  { agent: 'Claude-User', purpose: 'searchAnswers', source: ANTHROPIC },
  { agent: 'PerplexityBot', purpose: 'searchAnswers', source: PERPLEXITY },
  { agent: 'Perplexity-User', purpose: 'searchAnswers', source: PERPLEXITY },
  { agent: 'Applebot', purpose: 'searchAnswers', source: APPLE },
  { agent: 'meta-externalfetcher', purpose: 'searchAnswers', source: META },
  { agent: 'Amzn-SearchBot', purpose: 'searchAnswers', source: AMAZON },
  { agent: 'Amzn-User', purpose: 'searchAnswers', source: AMAZON },
  { agent: 'MistralAI-User', purpose: 'searchAnswers', source: 'https://docs.mistral.ai/robots' },
  { agent: 'DuckAssistBot', purpose: 'searchAnswers', source: 'https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot' },
  { agent: 'GPTBot', purpose: 'training', source: OPENAI },
  { agent: 'ClaudeBot', purpose: 'training', source: ANTHROPIC },
  { agent: 'Google-Extended', purpose: 'training', source: GOOGLE },
  { agent: 'Applebot-Extended', purpose: 'training', source: APPLE },
  { agent: 'CCBot', purpose: 'training', source: 'https://commoncrawl.org/ccbot' },
  { agent: 'meta-externalagent', purpose: 'training', source: META },
  { agent: 'Amazonbot', purpose: 'training', source: AMAZON },
]

/**
 * Die Zeile der Content-Signals (https://contentsignals.org, eine Konvention
 * von Cloudflare, kein Standard): `search` = Suchindex mit Link und kurzem
 * Auszug, `ai-input` = Antworten aus der Seite, `ai-train` = Training.
 */
export function contentSignalLine(policy: AiCrawlerPolicy): string {
  const yes = (value: boolean) => (value ? 'yes' : 'no')
  return `Content-Signal: search=${yes(policy.searchAnswers)}, ai-input=${yes(policy.searchAnswers)}, ai-train=${yes(policy.training)}`
}

export interface RobotsTxtInput {
  policy: AiCrawlerPolicy
  /** Die Regeln der allgemeinen Gruppe, z. B. `['Allow: /', 'Disallow: /api/']`. */
  rules: readonly string[]
  /** Absolute Adresse der Sitemap; fehlt = keine Zeile. */
  sitemap?: string | null
  /** Kommentarzeilen am Anfang, ohne `#`. */
  comments?: readonly string[]
}

const BLOCK_ALL = ['Disallow: /'] as const

function group(agents: readonly string[], rules: readonly string[]): string[] {
  return [...agents.map(agent => `User-agent: ${agent}`), ...rules]
}

/**
 * Die ganze robots.txt. Ein Crawler mit eigener Gruppe liest NUR diese Gruppe
 * (RFC 9309, 2.2.1) — eine erlaubte KI-Gruppe trägt deshalb dieselben Regeln
 * wie `*`, sonst stünden ihr `/api/` und `/dashboard/` plötzlich offen. Eine
 * nicht erlaubte Gruppe trägt `Disallow: /`.
 */
export function buildRobotsTxt(input: RobotsTxtInput): string {
  const agentsFor = (purpose: AiCrawlerPurpose) => AI_CRAWLERS.filter(crawler => crawler.purpose === purpose).map(crawler => crawler.agent)
  const rulesFor = (allowed: boolean) => (allowed ? input.rules : BLOCK_ALL)
  const lines: string[] = [
    ...(input.comments ?? []).map(comment => `# ${comment}`),
    '# AI crawlers: one rule for all Pukalani sites. A request, not a lock.',
    '',
    ...group(['*'], [contentSignalLine(input.policy), ...input.rules]),
    '',
    `# AI search and answers: ${input.policy.searchAnswers ? 'allowed' : 'not allowed'}`,
    ...group(agentsFor('searchAnswers'), rulesFor(input.policy.searchAnswers)),
    '',
    `# AI training: ${input.policy.training ? 'allowed' : 'not allowed'}`,
    ...group(agentsFor('training'), rulesFor(input.policy.training)),
    '',
  ]
  if (input.sitemap) lines.push(`Sitemap: ${input.sitemap}`, '')
  return lines.join('\n')
}

/** Eine Gruppe einer gelesenen robots.txt: ihre Namen und Regeln. */
export interface RobotsGroup {
  agents: string[]
  rules: string[]
}

/**
 * Liest die Gruppen einer robots.txt (RFC 9309: aufeinanderfolgende
 * `User-agent`-Zeilen bilden eine Gruppe, die folgenden Regeln gehören ihr).
 * Kommentare und Leerzeilen fallen weg; `Sitemap` gehört keiner Gruppe.
 */
export function parseRobotsGroups(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let collectingAgents = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const key = match[1]!.toLowerCase()
    const value = match[2]!.trim()
    if (key === 'sitemap') continue
    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      collectingAgents = true
      continue
    }
    collectingAgents = false
    if (current) current.rules.push(`${match[1]!.toLowerCase()}: ${value}`)
  }
  return groups
}

const isAccessRule = (rule: string) => rule.startsWith('allow:') || rule.startsWith('disallow:')

/**
 * Sagt die robots.txt dasselbe wie die Entscheidung? Leere Liste = ja.
 * Geprüft: die Content-Signals-Zeile der allgemeinen Gruppe; jeder Name aus
 * `AI_CRAWLERS` steht in genau einer Gruppe; eine erlaubte Gruppe hat genau
 * die Zugriffsregeln von `*`, eine nicht erlaubte genau `Disallow: /`.
 */
export function aiCrawlerRobotsProblems(body: string, policy: AiCrawlerPolicy): string[] {
  const groups = parseRobotsGroups(body)
  const star = groups.find(entry => entry.agents.includes('*'))
  if (!star) return ['keine Gruppe für User-agent: *']
  const problems: string[] = []
  const signal = contentSignalLine(policy).toLowerCase().replace(/\s+/g, ' ')
  if (!star.rules.some(rule => rule.replace(/\s+/g, ' ') === signal)) problems.push(`Content-Signal ist nicht „${contentSignalLine(policy).slice('Content-Signal: '.length)}"`)
  const starRules = star.rules.filter(isAccessRule)
  for (const crawler of AI_CRAWLERS) {
    const name = crawler.agent.toLowerCase()
    const own = groups.filter(entry => entry.agents.includes(name))
    if (own.length !== 1) {
      problems.push(`${crawler.agent}: ${own.length === 0 ? 'keine eigene Gruppe' : 'mehr als eine Gruppe'}`)
      continue
    }
    const allowed = policy[crawler.purpose]
    const expected = allowed ? starRules : BLOCK_ALL.map(rule => rule.toLowerCase())
    const actual = own[0]!.rules.filter(isAccessRule)
    if (actual.join('\n') !== expected.join('\n')) problems.push(`${crawler.agent}: ${allowed ? 'nicht dieselben Regeln wie *' : 'nicht Disallow: /'}`)
  }
  return problems
}
