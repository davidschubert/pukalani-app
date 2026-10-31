/**
 * RANKING „Die zehn Marken mit dem stärksten Auftritt", Ausgabe 1 (BI1 I6,
 * Format `ranking`, §2.4, §11 Frage 7).
 *
 * ── DIE REIHENFOLGE STEHT HIER NICHT ────────────────────────────────────
 * Die Plätze kommen ausschliesslich aus dem Brand Score (§2.4
 * „Datenquelle: ausschliesslich Brand-Check-Scores"). Diese Datei nennt nur
 * WELCHE Marken auf die Liste gehören und WARUM; Score, Check-Id und Platz
 * rechnet `seed-launch.mjs` aus `brand_checks`. `entries` steht hier in der
 * Reihenfolge, die bei Gleichstand gilt.
 *
 * Stufe 1 belegt vier Plätze — genau die vier handgeprüften Marken der
 * Bibliothek (§9.8). Die Begründungen zitieren je die Eigenaussage auf der
 * Startseite; die Quelle steht in `sources` an derselben Stelle wie die Marke
 * in `entries`.
 */
import { site, URL } from './sources.mjs'

const bodyDe = `## Methodik

Die Reihenfolge dieser Liste ergibt sich ausschließlich aus dem Brand Score, den der Brand-Check für die öffentliche Website jeder Marke berechnet – dieselbe Zahl, die auch im Markenprofil steht. Wie er entsteht, welche acht Kategorien er misst und wie sie gewichtet sind, steht in der [Methodik](/brand-check/methodik).

## Stand und Ausgabe

Die Liste ist eingefroren: Sie zeigt die Scores zum angegebenen Stand und rechnet sich nicht still neu. Eine Auffrischung erscheint als neue Ausgabe; diese hier bleibt mit Hinweis stehen. Wünscht eine Marke, nicht aufgeführt zu werden, nehmen wir ihren Platz heraus und markieren die Lücke – die übrigen Plätze rücken nicht nach.

## Warum diese Marken

Auf die Liste kommen Marken, deren Auftritt wir redaktionell geprüft haben: mit Zitat, Quelle und Prüfdatum. Je Platz steht ein Satz, der begründet, was den Auftritt ausmacht. Die Zahl dahinter kommt nie von uns, sondern immer aus dem Brand-Check.`

const bodyEn = `## Methodology

The order of this list comes solely from the Brand Score that the Brand Check calculates for each brand’s public website – the same number shown on the brand profile. How it is calculated, which eight categories it measures and how they are weighted is explained in our [methodology](/brand-check/methodik).

## Status and issue

The list is frozen: it shows the scores as of the stated date and never quietly recalculates. A refresh appears as a new issue; this one stays online with a note. If a brand asks not to be listed, we remove its place and mark the gap – the remaining places do not move up.

## Why these brands

The list includes brands whose presence we have reviewed editorially: with quote, source and review date. Each place carries one sentence explaining what defines the presence. The number behind it never comes from us but always from the Brand Check.`

export const strongestPresenceRanking = {
  format: 'ranking',
  slug: 'staerkster-auftritt-ausgabe-1',
  baseLocale: 'de',
  titleDe: 'Die zehn Marken mit dem stärksten Auftritt',
  titleEn: 'The ten brands with the strongest presence',
  dekDe: 'Ausgabe 1: unsere redaktionelle Liste, gereiht nach Brand Score – jede Zahl aus dem Brand-Check der öffentlichen Website, jeder Platz mit einem Satz Begründung.',
  dekEn: 'Issue 1: our editorial list, ranked by Brand Score – every number from the Brand Check of the public website, every place with one sentence of reasoning.',
  bodyDe,
  bodyEn,
  topics: ['brand-analysis'],
  sources: [
    /* 0 */ site(URL.nikeHome, 'Nike, Inc.', 'Nike. Just Do It.'),
    /* 1 */ site(URL.appleHome, 'Apple Inc.', 'Discover the innovative world of Apple'),
    /* 2 */ site(URL.anthropicCompany, 'Anthropic PBC', 'Anthropic is an AI safety and research company'),
    /* 3 */ site(URL.theBarnHome, 'THE BARN Coffee Roasters', 'Freshly Roasted Coffee to your door'),
  ],
  brandSlugs: [],
  facts: [],
  ranking: {
    issue: 1,
    // `asOf` setzt der Seed auf den Tag des Laufs — der Stand IST der Tag,
    // an dem die Scores gelesen wurden.
    entries: [
      {
        brandSlug: 'nike',
        reasonDe: 'Name, Zeichen und Slogan erzählen seit Jahrzehnten dieselbe Geschichte – bis in den Titel der Startseite: „Nike. Just Do It.“',
        reasonEn: 'Name, mark and slogan have told the same story for decades – right up to the homepage title: “Nike. Just Do It.”',
      },
      {
        brandSlug: 'apple',
        reasonDe: 'Die Startseite lädt mit einem einzigen Satz ein – „Discover the innovative world of Apple“ – und verbindet Anspruch und Angebot in einem Zug.',
        reasonEn: 'The homepage opens with a single invitation – “Discover the innovative world of Apple” – joining ambition and offer in one line.',
      },
      {
        brandSlug: 'anthropic',
        reasonDe: 'Die Positionierung passt in einen Satz und steht genau so auf der eigenen Seite: „Anthropic is an AI safety and research company“.',
        reasonEn: 'The positioning fits into one sentence and appears exactly so on its own site: “Anthropic is an AI safety and research company”.',
      },
      {
        brandSlug: 'the-barn',
        reasonDe: 'Ein Versprechen, das man schmecken kann: „Freshly Roasted Coffee to your door“ – konkret, nah und ohne Umweg.',
        reasonEn: 'A promise you can taste: “Freshly Roasted Coffee to your door” – concrete, close and without detours.',
      },
    ],
  },
  noteInternal: 'Stufe 1: vier Plätze belegt, 5–10 folgen in Stufe 2 — vor der Freigabe vervollständigen',
}
