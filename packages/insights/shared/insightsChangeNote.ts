import type { InsightsLocale, InsightsPost } from './insightsPost'
import { INSIGHTS_LOCALES } from './insightsPost'

/**
 * WAS SICH GEÄNDERT HAT — knapp, als DATEN, für den Vorschlag eines
 * Änderungshinweises (2026-11-16).
 *
 * ── WARUM NICHT EINFACH BEIDE FASSUNGEN AN DAS MODELL ────────────────────
 * Ein Artikel hat bis zu zwei Fassungen à mehreren tausend Wörtern. Beide
 * Stände ganz zu schicken hiesse, für einen Satz von 160 Zeichen zwei Artikel
 * zu bezahlen — und dem Modell die Suche nach dem Unterschied zu überlassen,
 * die man hier deterministisch rechnen kann. Es bekommt deshalb nur die
 * ABSÄTZE, die entfallen oder dazugekommen sind, je Seite gedeckelt.
 *
 * ── WAS NICHT ZÄHLT ──────────────────────────────────────────────────────
 * Eine Änderung, die der LESER nicht sieht, braucht keinen Hinweis: die
 * Hinweise selbst, die interne Notiz, der Brief, das Häkchen „Übersetzung
 * redigiert", die Themen, die Adresse und die Marken-Verweise. Eine
 * Sprachfassung zählt nur, wenn sie öffentlich ist oder wird (Grundfassung
 * oder redigiert) — eine unredigierte Maschinenfassung steht nicht draussen
 * (§3.2), und ein Hinweis auf ihre Änderung wäre ein Hinweis auf nichts.
 *
 * Ist der Unterschied leer, gibt es nichts zu beschreiben — die Route lehnt
 * dann VOR dem bezahlten Lauf ab (`no_change`).
 */

/** Je geändertem Textfeld und Seite (entfallen/neu) höchstens so viele Zeichen. */
export const INSIGHTS_CHANGE_DIGEST_FIELD_MAX = 2500
/** Alle Absätze zusammen höchstens so viele Zeichen. */
export const INSIGHTS_CHANGE_DIGEST_TOTAL_MAX = 8000
/** Höchstens so viele Quellen-Änderungen. */
export const INSIGHTS_CHANGE_DIGEST_SOURCES_MAX = 20

/** Was der Unterschied ansieht — der volle Beitrag und die Formular-Eingabe erfüllen es. */
export type InsightsChangeDigestInput = Pick<
  InsightsPost,
  | 'baseLocale' | 'translationReviewed'
  | 'titleDe' | 'titleEn' | 'dekDe' | 'dekEn' | 'bodyDe' | 'bodyEn'
  | 'sources' | 'facts' | 'ranking'
>

export type InsightsChangeDigestField = 'title' | 'dek' | 'body'

export interface InsightsChangeDigestText {
  field: InsightsChangeDigestField
  locale: InsightsLocale
  /** Absätze, die im öffentlichen Stand stehen und im Formular nicht mehr. */
  removed: string[]
  /** Absätze, die neu im Formular stehen. */
  added: string[]
}

export interface InsightsChangeDigestSource {
  change: 'added' | 'removed' | 'changed'
  publisher: string
  url: string
  quote: string
}

export interface InsightsChangeDigest {
  texts: InsightsChangeDigestText[]
  sources: InsightsChangeDigestSource[]
  /** Duell-Zeilen geändert? `count` = Anzahl im Formular. */
  facts: { changed: boolean, count: number }
  /** Ranking-Plätze geändert? `count` = Anzahl im Formular. */
  ranking: { changed: boolean, count: number }
}

const FIELD_KEYS: Readonly<Record<InsightsChangeDigestField, Record<InsightsLocale, 'titleDe' | 'titleEn' | 'dekDe' | 'dekEn' | 'bodyDe' | 'bodyEn'>>> = {
  title: { de: 'titleDe', en: 'titleEn' },
  dek: { de: 'dekDe', en: 'dekEn' },
  body: { de: 'bodyDe', en: 'bodyEn' },
}

/** Eine Fassung ist öffentlich, wenn sie die Grundfassung IST oder redigiert wurde. */
function localeIsPublic(post: InsightsChangeDigestInput, locale: InsightsLocale): boolean {
  return post.baseLocale === locale || post.translationReviewed
}

/** Absätze: an Leerzeilen getrennt, getrimmt, leere fallen weg. */
function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
}

/**
 * Die MENGEN-Differenz der Absätze, mit Vielfachheit: steht derselbe Absatz
 * zweimal da und einmal weniger, ist genau einer entfallen. Verschobene
 * Absätze sind keine Änderung.
 */
function multisetMinus(left: readonly string[], right: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const entry of right) counts.set(entry, (counts.get(entry) ?? 0) + 1)
  const rest: string[] = []
  for (const entry of left) {
    const count = counts.get(entry) ?? 0
    if (count > 0) counts.set(entry, count - 1)
    else rest.push(entry)
  }
  return rest
}

/** Absätze in ein Zeichen-Budget legen; der letzte wird gekürzt statt verworfen. */
function capParagraphs(paragraphs: readonly string[], budget: { total: number }): string[] {
  const kept: string[] = []
  let field = INSIGHTS_CHANGE_DIGEST_FIELD_MAX
  for (const paragraph of paragraphs) {
    const room = Math.min(field, budget.total)
    if (room <= 0) break
    const text = paragraph.length > room ? `${paragraph.slice(0, Math.max(0, room - 1))}…` : paragraph
    kept.push(text)
    field -= text.length
    budget.total -= text.length
  }
  return kept
}

function sourceKey(source: InsightsPost['sources'][number]): string {
  return JSON.stringify([source.url, source.publisher, source.date, source.kind, source.quote, source.license])
}

/** Dieselbe Mengen-Differenz wie `multisetMinus`, über den Inhalt der Quellen. */
function sourcesMinus(
  left: InsightsPost['sources'],
  right: InsightsPost['sources'],
): InsightsPost['sources'] {
  const counts = new Map<string, number>()
  for (const source of right) counts.set(sourceKey(source), (counts.get(sourceKey(source)) ?? 0) + 1)
  return left.filter((source) => {
    const key = sourceKey(source)
    const count = counts.get(key) ?? 0
    if (count === 0) return true
    counts.set(key, count - 1)
    return false
  })
}

function digestSources(current: InsightsChangeDigestInput, next: InsightsChangeDigestInput): InsightsChangeDigestSource[] {
  // Erst die wörtlich gleichen herausnehmen (umsortiert ist nicht geändert),
  // dann über die Adresse paaren: gleiche Adresse, anderer Inhalt ⇒ geändert.
  const removed = sourcesMinus(current.sources, next.sources)
  const added = sourcesMinus(next.sources, current.sources)

  const changes: InsightsChangeDigestSource[] = []
  const stillRemoved = [...removed]
  for (const source of added) {
    const twin = stillRemoved.findIndex(old => old.url === source.url)
    if (twin >= 0) {
      stillRemoved.splice(twin, 1)
      changes.push({ change: 'changed', publisher: source.publisher, url: source.url, quote: source.quote })
    }
    else {
      changes.push({ change: 'added', publisher: source.publisher, url: source.url, quote: source.quote })
    }
  }
  for (const source of stillRemoved) {
    changes.push({ change: 'removed', publisher: source.publisher, url: source.url, quote: source.quote })
  }
  return changes.slice(0, INSIGHTS_CHANGE_DIGEST_SOURCES_MAX)
}

/**
 * DER UNTERSCHIED zwischen dem öffentlichen Stand (`current`) und dem
 * ungespeicherten Formular (`next`).
 */
export function insightsChangeDigest(current: InsightsChangeDigestInput, next: InsightsChangeDigestInput): InsightsChangeDigest {
  const budget = { total: INSIGHTS_CHANGE_DIGEST_TOTAL_MAX }
  const texts: InsightsChangeDigestText[] = []
  for (const field of ['title', 'dek', 'body'] as const) {
    for (const locale of INSIGHTS_LOCALES) {
      if (!localeIsPublic(current, locale) && !localeIsPublic(next, locale)) continue
      const key = FIELD_KEYS[field][locale]
      // Ein Feld, das vorher nicht öffentlich war, hatte für den Leser keinen
      // alten Stand; eines, das es nicht mehr ist, keinen neuen.
      const before = localeIsPublic(current, locale) ? current[key] : ''
      const after = localeIsPublic(next, locale) ? next[key] : ''
      if (before === after) continue
      const oldParts = field === 'body' ? paragraphsOf(before) : [before.trim()].filter(Boolean)
      const newParts = field === 'body' ? paragraphsOf(after) : [after.trim()].filter(Boolean)
      const removed = multisetMinus(oldParts, newParts)
      const added = multisetMinus(newParts, oldParts)
      // Nur Leerraum geändert ⇒ keine Änderung, die jemand sieht.
      if (removed.length === 0 && added.length === 0) continue
      texts.push({ field, locale, removed: capParagraphs(removed, budget), added: capParagraphs(added, budget) })
    }
  }

  const factsChanged = JSON.stringify(current.facts) !== JSON.stringify(next.facts)
  const rankingChanged = JSON.stringify(current.ranking) !== JSON.stringify(next.ranking)

  return {
    texts,
    sources: digestSources(current, next),
    facts: { changed: factsChanged, count: next.facts.length },
    ranking: { changed: rankingChanged, count: next.ranking?.entries.length ?? 0 },
  }
}

/** Gibt es überhaupt etwas, das ein Hinweis beschreiben könnte? */
export function insightsChangeDigestIsEmpty(digest: InsightsChangeDigest): boolean {
  return digest.texts.length === 0
    && digest.sources.length === 0
    && !digest.facts.changed
    && !digest.ranking.changed
}
