/**
 * DER ROBOTS-PARSER BEIDER AUSSEN-ABRUFE — Marktvergleich UND Brand-Check
 * (Plan §2.9 Nr. 1: „`robots.txt` wird geholt und respektiert"; BS1 R2b).
 *
 * ── WARUM ER SEIT R2b IM brand-LAYER LIEGT ────────────────────────────────
 * Gebaut wurde er für den Marktvergleich und lag deshalb in
 * `packages/market/shared/marketRobots.ts`. Seit R2b (Davids Entscheidung
 * 2026-09-08) achtet auch der EINSEITEN-Abruf des Brand-Checks `robots.txt` —
 * und `brand` darf `market` nicht kennen (CONCEPT.md A14, die Richtung ist
 * einseitig). Eine Kopie im brand-Layer wären ZWEI Wahrheiten darüber, wen wir
 * anfassen dürfen, und die laufen auseinander: die schwächere gewinnt dann
 * genau dort, wo es zählt. Also ist die Regel hierher gezogen; `market`
 * importiert sie über eine dünne Hülle unter dem alten Namen weiter.
 *
 * ── WARUM EIN EIGENER UND KEINE ABHÄNGIGKEIT ──────────────────────────────
 * Was wir brauchen, ist eine Frage: „darf DIESER Absender diesen Pfad lesen?"
 * Dafür reichen `User-agent`, `Allow`, `Disallow` und die `*`-Platzhalter —
 * das ist eine Seite Code mit Gegenproben. Eine Bibliothek dafür wäre eine
 * weitere Fassung im Baum (`check:single-copy`) für eine Antwort, die wir
 * vollständig verstehen müssen: sie entscheidet, ob wir einen fremden Server
 * anfassen.
 *
 * ── DER ABSENDER IST EIN ARGUMENT, KEINE KONSTANTE ────────────────────────
 * Es gibt heute ZWEI: `PukalaniMarketBot` (Marktvergleich, mehrere Seiten) und
 * `PukalaniBrandCheck` (Brand-Check, eine Seite). Ein Betreiber darf den einen
 * aussperren und den anderen zulassen — deshalb reist das Token durch jeden
 * Aufruf, statt hier zu stehen.
 *
 * ── DIE REGELN, DIE HIER GELTEN (REP, RFC 9309) ───────────────────────────
 *  1. Eine GRUPPE beginnt mit einer oder mehreren `User-agent`-Zeilen und
 *     trägt danach ihre Regeln. Aufeinanderfolgende `User-agent`-Zeilen
 *     gehören ZUSAMMEN zur selben Gruppe.
 *  2. Gilt eine Gruppe für unseren NAMEN, gilt die `*`-Gruppe nicht mehr —
 *     der spezifischere Absender gewinnt, und zwar vollständig.
 *  3. Innerhalb der geltenden Gruppe gewinnt die LÄNGSTE passende Regel; bei
 *     gleicher Länge gewinnt `Allow` (RFC 9309 §2.2.2).
 *  4. Ein leeres `Disallow:` ist eine ERLAUBNIS für alles — die übliche Form
 *     von „nichts ist gesperrt".
 *
 * ── FAIL-CLOSED, ABER NUR WO ES ETWAS ZU SCHLIESSEN GIBT ──────────────────
 * KEINE `robots.txt` heisst ERLAUBT: das ist die Bedeutung im Web, und alles
 * andere machte beide Abrufe für den Normalfall unbenutzbar. Eine VORHANDENE,
 * aber unverständliche Zeile wird übersprungen — nicht die ganze Datei
 * verworfen, sonst hebt ein Tippfehler ein Verbot auf.
 */

/** Eine Regel: Präfix und ob sie erlaubt. */
interface RobotsRule {
  readonly allow: boolean
  readonly path: string
}

interface RobotsGroup {
  readonly agents: string[]
  readonly rules: RobotsRule[]
}

export interface BrandRobots {
  /** Die Gruppen in Dateireihenfolge — für Tests und Diagnose. */
  readonly groups: readonly RobotsGroup[]
  /** Es gab eine Datei (auch eine leere). `false` = keine, also alles erlaubt. */
  readonly present: boolean
}

/** Eine Datei ohne jede Regel — die Antwort auf „es gibt keine robots.txt". */
export const BRAND_ROBOTS_ABSENT: BrandRobots = { groups: [], present: false }

/**
 * Die Datei in Gruppen zerlegen. Kommentare (`#`) fallen weg, unbekannte
 * Felder (`Crawl-delay`, `Sitemap`, `Host`) werden ignoriert — `Sitemap` liest
 * der Abruf getrennt (`sitemapUrlsFromRobots` nebenan), weil es kein
 * Gruppen-Feld ist.
 */
export function parseBrandRobots(text: string): BrandRobots {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  /** Stand die vorige Zeile ebenfalls auf `User-agent`? (Regel 1 im Kopf.) */
  let agentRun = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? ''
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (field === 'user-agent') {
      if (!current || !agentRun) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      agentRun = true
      continue
    }

    agentRun = false
    if (field !== 'allow' && field !== 'disallow') continue
    // Eine Regel ohne Gruppe hat keinen Adressaten und gilt für niemanden.
    if (!current) continue
    current.rules.push({ allow: field === 'allow', path: value })
  }

  return { groups, present: true }
}

/**
 * DIE GELTENDE GRUPPE für einen Absender — sein eigener Name schlägt `*`.
 *
 * Verglichen wird als PRÄFIX und kleingeschrieben, wie es das REP vorsieht:
 * `User-agent: PukalaniBrand` adressiert auch `PukalaniBrandCheck/1.0`. Bei
 * mehreren Treffern gewinnt der LÄNGSTE Name — wer uns genauer benennt, meint
 * uns eher.
 */
function groupFor(robots: BrandRobots, agent: string): RobotsGroup | null {
  const needle = agent.toLowerCase()
  let best: { group: RobotsGroup, length: number } | null = null
  let wildcard: RobotsGroup | null = null

  for (const group of robots.groups) {
    for (const candidate of group.agents) {
      if (candidate === '*') {
        wildcard ??= group
        continue
      }
      if (!candidate || !needle.startsWith(candidate)) continue
      if (!best || candidate.length > best.length) best = { group, length: candidate.length }
    }
  }

  return best?.group ?? wildcard
}

/**
 * Passt eine Regel auf diesen Pfad? Unterstützt `*` (beliebige Folge) und `$`
 * (Ende) — beides ist heute überall üblich, auch wenn das ursprüngliche REP
 * es nicht kannte.
 */
function ruleMatches(rule: string, path: string): boolean {
  if (!rule) return false
  if (!rule.includes('*') && !rule.endsWith('$')) return path.startsWith(rule)

  const anchored = rule.endsWith('$')
  const body = anchored ? rule.slice(0, -1) : rule
  const pattern = body
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\S]*')
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path)
}

/**
 * WIE LANG IST DIE REGEL, DIE HIER GREIFT? Der `*` zählt als ein Zeichen —
 * dieselbe Zählweise wie RFC 9309 §2.2.2, und sie entscheidet, ob ein
 * `Allow: /about` ein `Disallow: /` schlägt (es tut es: sechs gegen eins).
 */
function ruleLength(rule: string): number {
  return rule.replace(/\$$/, '').length
}

/**
 * DARF DIESER ABSENDER DIESEN PFAD LESEN?
 *
 * `path` ist der Pfad MIT führendem Schrägstrich, ohne Schema und Host, mit
 * Query, falls vorhanden — das ist, was `robots.txt` vergleicht.
 */
export function brandRobotsAllows(robots: BrandRobots, agent: string, path: string): boolean {
  // Keine Datei ⇒ keine Einschränkung (s. Kopf).
  if (!robots.present) return true
  const group = groupFor(robots, agent)
  if (!group) return true

  let decision: { allow: boolean, length: number } | null = null
  for (const rule of group.rules) {
    // Ein LEERES `Disallow:` erlaubt alles (Regel 4 im Kopf) und ist keine
    // Regel, die man vergleichen könnte — es ist die Abwesenheit einer.
    if (!rule.path) continue
    if (!ruleMatches(rule.path, path)) continue
    const length = ruleLength(rule.path)
    if (!decision || length > decision.length || (length === decision.length && rule.allow)) {
      decision = { allow: rule.allow, length }
    }
  }

  return decision ? decision.allow : true
}
