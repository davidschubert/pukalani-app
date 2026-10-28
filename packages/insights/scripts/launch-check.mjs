/**
 * DIE PURE HÄLFTE DES LAUNCH-SEEDS (BI1 I6) — aus Inhalt wird eine Zeile, und
 * die Zeile wird VOR dem Schreiben geprüft. Ohne Datenbank, ohne Env: so lesen
 * Seed (`seed-launch.mjs`) und Test (`tests/launchContent.test.ts`) dieselben
 * Funktionen, statt dieselbe Regel zweimal abzuschreiben.
 *
 * ── WARUM DER NAMENSFILTER HIER NACHGEBAUT IST ──────────────────────────
 * Das Server-Gate baut seinen Filter in `server/utils/insightsReview.ts`
 * (`insightsFlagText`). Die Datei ist eine Nitro-Datei — sie importiert den
 * brand-Vertrag samt SSRF-festem Abruf und läuft ausserhalb von Nitro nicht.
 * `launchFlagText` unten ist deshalb dieselbe Rechnung in zwölf Zeilen:
 * Kandidaten = jede NICHT entfernte Marken-Zeile, die der Beitrag NICHT
 * verweist (`brandRefs` + Ranking-Plätze); die verwiesenen sind `ownTexts`
 * (Name + Homepage). Weicht das Gate einmal ab, merkt es der Beweis-Lauf
 * (`POST …/state {to:'review'}`), nicht der Leser.
 *
 * ── WAS DIE VORAB-PRÜFUNG NICHT KANN ────────────────────────────────────
 * Den Beleg-Abruf: `insightsReviewIssues` bekommt hier KEINE Quelltexte. Ob
 * ein Zitat wörtlich auf der Seite steht, sagt erst das Server-Gate beim
 * Übergang nach `review` (bzw. der Knopf „Beleg prüfen" je Quelle).
 */
import { createDisparagementGuard } from '../../core/shared/disparagementGuard.ts'
import {
  insightsBrandSchema,
  insightsDuelSlug,
  insightsMethodologyLinked,
  insightsPostSchema,
  insightsReadingMinutes,
  insightsReviewIssues,
} from '../shared/insightsPost.ts'

/**
 * Die Felder, die Server und Redaktion an einem BESTEHENDEN Entwurf führen —
 * der Seed lässt sie stehen (`INSIGHTS_SERVER_OWNED_FIELDS` ohne
 * `readingMinutes`, das rechnet jedes Speichern neu, plus der Brief und
 * `translationReviewed`: beides sind Aussagen eines Menschen, die ein zweiter
 * Seed-Lauf nicht zurücksetzen darf).
 */
export const LAUNCH_KEPT_POST_FIELDS = [
  'state',
  'publishedAt',
  'reviewedAt',
  'reviewedBy',
  'translatedAt',
  'translationModel',
  'translationPromptVersion',
  'translationReviewed',
  'draftModel',
  'draftPromptVersion',
  'brief',
  'briefModel',
  'briefPromptVersion',
  'briefVideoId',
  'slugHistory',
]

/** Dasselbe für die Marke (`INSIGHTS_BRAND_SERVER_OWNED_FIELDS` + die zwei Verweise). */
export const LAUNCH_KEPT_BRAND_FIELDS = ['slugHistory', 'removedAt', 'removalReason', 'claimedBy', 'checkId', 'publicationId']

/**
 * Inhalt → `InsightsBrand` (geparst). `relations` kommen als fertige Ids
 * herein — die Auflösung Slug → Id ist Sache des Aufrufers.
 */
export function launchBrandFromContent(content, { relations = [], existing = null } = {}) {
  const fields = { ...content }
  // Die Slugs sind Inhalt, nicht Spalte — die Ids kommen als `relations`.
  delete fields.relationSlugs
  const brand = {
    slugHistory: [],
    checkId: '',
    publicationId: '',
    removedAt: '',
    removalReason: '',
    claimedBy: '',
    ...fields,
    relations,
    state: 'draft',
  }
  if (existing) {
    for (const key of LAUNCH_KEPT_BRAND_FIELDS) brand[key] = existing[key]
    brand.state = existing.state
  }
  return insightsBrandSchema.parse(brand)
}

/**
 * Inhalt → `InsightsPost` (geparst, `readingMinutes` aus der Grundfassung wie
 * im PATCH-Handler).
 *
 * `brandOf(slug)` liefert `{ id, libraryKey }` der Marken-Zeile. `ranking`
 * sind die FERTIGEN Plätze (mit Score, Check-Id und Rang) — fehlen sie, gilt
 * die Inhalts-Reihenfolge mit Score 0 (so prüft der Test ohne Datenbank).
 */
export function launchPostFromContent(content, { brandOf, rankingEntries = null, asOf = '', noteInternal = null, existing = null }) {
  if (content.format === 'duel') {
    const expected = insightsDuelSlug(content.brandSlugs[0] ?? '', content.brandSlugs[1] ?? '')
    if (content.slug !== expected) throw new Error(`Duell-Slug muss ${expected} heissen, nicht ${content.slug}`)
  }

  let ranking = null
  if (content.ranking) {
    const entries = rankingEntries ?? content.ranking.entries.map((entry, index) => ({
      rank: index + 1,
      brandId: brandOf(entry.brandSlug).id,
      checkId: '',
      score: 0,
      reasonDe: entry.reasonDe,
      reasonEn: entry.reasonEn,
      removed: false,
    }))
    ranking = { issue: content.ranking.issue, asOf, entries }
  }

  const bodyBase = content.baseLocale === 'de' ? content.bodyDe : content.bodyEn
  const post = {
    format: content.format,
    slug: content.slug,
    slugHistory: [],
    state: 'draft',
    baseLocale: content.baseLocale,
    titleDe: content.titleDe,
    titleEn: content.titleEn,
    dekDe: content.dekDe,
    dekEn: content.dekEn,
    bodyDe: content.bodyDe,
    bodyEn: content.bodyEn,
    translatedAt: '',
    translationModel: '',
    translationPromptVersion: '',
    translationReviewed: false,
    topics: content.topics,
    sources: content.sources,
    brandRefs: content.brandSlugs.map((slug) => {
      const brand = brandOf(slug)
      return { brandId: brand.id, checkId: '', libraryKey: brand.libraryKey ?? '', publicationId: '' }
    }),
    facts: content.facts,
    ranking,
    readingMinutes: insightsReadingMinutes(bodyBase),
    publishedAt: '',
    reviewedAt: '',
    reviewedBy: '',
    noteInternal: noteInternal ?? content.noteInternal,
    brief: '',
    briefModel: '',
    briefPromptVersion: '',
    briefVideoId: '',
    draftModel: '',
    draftPromptVersion: '',
  }
  if (existing) {
    for (const key of LAUNCH_KEPT_POST_FIELDS) post[key] = existing[key]
  }
  return insightsPostSchema.parse(post)
}

/**
 * Der Namens- und Herabsetzungsfilter, wie ihn das Server-Gate baut (s. Kopf).
 * `brandRows`: `{ id, name, homepage, state }` — ALLE Marken-Zeilen, die es
 * gibt bzw. nach dem Lauf geben wird.
 */
export function launchFlagText(post, brandRows) {
  const referenced = new Set(post.brandRefs.map(ref => ref.brandId))
  for (const entry of post.ranking?.entries ?? []) {
    if (entry.brandId) referenced.add(entry.brandId)
  }
  const candidates = []
  const ownTexts = []
  for (const row of brandRows) {
    if (row.state === 'removed') continue
    if (referenced.has(row.id)) {
      ownTexts.push(row.name)
      if (row.homepage) ownTexts.push(row.homepage)
      continue
    }
    candidates.push({ name: row.name, url: row.homepage || undefined })
  }
  const guard = createDisparagementGuard(candidates, { ownTexts })
  return (text) => {
    const reason = guard.check(text)
    return reason ? [reason] : []
  }
}

/** Die Vorab-Prüfung: alle sechs Regeln ausser dem Beleg-Abruf. */
export function launchPostIssues(post, brandRows) {
  return insightsReviewIssues(post, {
    knownBrandIds: brandRows.filter(row => row.state !== 'removed').map(row => row.id),
    methodologyLinked: insightsMethodologyLinked(post),
    flagText: launchFlagText(post, brandRows),
  })
}

/**
 * WELCHER SATZ KLEMMT? — für die Ausgabe eines Treffers. Das Gate meldet nur
 * „Text Nr. n"; bei einem Fliesstext von tausend Wörtern ist das keine Stelle.
 */
export function launchFlaggedSentences(post, brandRows) {
  const flag = launchFlagText(post, brandRows)
  const texts = [post.titleDe, post.titleEn, post.dekDe, post.dekEn, post.bodyDe, post.bodyEn]
  const hits = []
  for (const text of texts) {
    for (const sentence of text.split(/(?<=[.!?:])\s+|\n+/)) {
      if (sentence.trim() && flag(sentence).length) hits.push(sentence.trim())
    }
  }
  return hits
}
