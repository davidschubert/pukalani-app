/**
 * DER SCHRIFTPAAR-KATALOG VON BRAND DESIGN (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.4, Paket D0).
 *
 * Sechs kuratierte Paare: die fünf aus docs/referenz/THEMES-CONCEPT-V2.md §3.5
 * plus das eine Paar des G4-Richtungs-Katalogs (`contrast`, Sora + Inter), das
 * dort kein Gegenstück hat. Übernommen aus dem freigegebenen Prototyp
 * (`.playground/app/utils/demoDesign.ts`, `DS_FONT_PAIRS`) — Ids und Stacks
 * wörtlich, damit der echte Bau dieselben Schriften zeigt wie der Dummy.
 *
 * ── DIE FALLE, DIE DIESER KATALOG NICHT ALLEIN LÖST (§2.17) ───────────────
 * `@nuxt/fonts` self-hostet nur, was der BUILD im CSS sieht. Eine Familie, die
 * hier steht und in keiner CSS-Datei der App deklariert ist, fällt in der
 * Vorschau STILL auf den Systemstack zurück — die Seite sähe dann aus wie G4
 * („eine Richtung, kein Rendering-Beweis"), obwohl sie genau das Gegenteil
 * beweisen soll. Kein Fehler, keine Warnung, kein roter Build.
 *
 * Deshalb steht neben dem Katalog `BRAND_DECLARED_FONT_FAMILIES`: die Liste
 * der Familien, die DEKLARIERT SIND, und seit D4 daneben
 * `BRAND_DECLARED_FONT_WEIGHTS` — welche SCHNITTE je Familie deklariert sind.
 * Beide spiegeln das LAYER-CSS `app/assets/css/brand-fonts.css` — es hängt
 * über `nuxt.config.ts` im `css`-Array und gilt damit für jede App, die den
 * brand-Layer erbt, heute `apps/branding`.
 *
 * **SEIT D4 IST DAS CSS DIE QUELLE, NICHT MEHR NUR DAS VORBILD:** der Test in
 * `tests/brandFontPairs.test.ts` LIEST die Datei und hält beide Listen
 * wörtlich an ihr fest (Familie und Schnitt). Von Hand gepflegt bleiben die
 * Listen trotzdem — sie müssen ohne Dateisystem lesbar sein (Browser, Prompt,
 * Preset). Neu ist, dass ein Auseinanderlaufen jetzt ROT wird, statt nur
 * gegen eine zweite handgepflegte Liste zu prüfen.
 *
 * WARUM DIE SCHNITTE ZÄHLEN (D4): die Typografie-Bühne lässt das
 * Überschriften-Gewicht stellen. Ein Schnitt, den es nicht gibt, malt der
 * Browser SELBST (synthetic bold/light) — die Konturen werden aufgeblasen
 * oder ausgedünnt, und beurteilt würde eine Schrift, die es nicht gibt. PT
 * Sans und PT Serif haben genau zwei Schnitte; das ist keine Nachlässigkeit,
 * sondern ihr Lieferumfang.
 *
 * ── DIESE DATEI IST PUR ───────────────────────────────────────────────────
 * Kein i18n, kein H3, kein Appwrite, keine Layer-Importe. Die Namen sind
 * EIGENNAMEN von Schriften und laufen deshalb nicht über i18n (dieselbe Regel
 * wie bei den Theme-Namen, CLAUDE.md); die Beschreibungs-Zeile steht
 * zweisprachig daneben.
 *
 * D1: Inhalte sind Davids Gate — die Notizen sind aus dem Prototyp übernommen
 * und nicht gegengelesen.
 */

/**
 * DIE LIZENZ EINER SCHRIFTFAMILIE (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6,
 * Paket K2) — SPDX-Kennung und die Quelle, bei der die Dateien liegen.
 *
 * ── WARUM SIE AM KATALOG HÄNGT UND NICHT AN EINER LISTE DANEBEN ──────────
 * `LICENSES.md` im Kit nennt genau die Familien, die diese Marke benutzt. Eine
 * zweite Tabelle „Familie → Lizenz" neben dem Katalog wäre die Stelle, an der
 * ein neues Paar still ohne Lizenz-Zeile ankäme — und eine fehlende Lizenz ist
 * die eine Auskunft in diesem Bündel, die jemanden in Schwierigkeiten bringt.
 * `validateBrandFontPairs` verlangt deshalb beide Felder je Paar.
 *
 * ── KEINE SCHRIFTDATEIEN IM BÜNDEL ───────────────────────────────────────
 * Die OFL erlaubt die Weitergabe; wir machen es trotzdem nicht (§2.6): eine
 * mitgelieferte Datei ist eine zweite Fassung, die irgendwann von der Quelle
 * abweicht, und sie macht aus einem 40-KB-Bündel ein 4-MB-Bündel. `source` ist
 * deshalb keine Zierde, sondern der Bezugsweg.
 */
export interface BrandFontLicense {
  /** SPDX-Kennung, z. B. `OFL-1.1` — maschinenlesbar, nicht der Lizenztext. */
  readonly spdx: string
  /** Wo die Dateien liegen (Spezimen-Seite, nicht ein Download-Link). */
  readonly source: string
}

export interface BrandFontPair {
  /** Stabile Id — sie steht in `i.pair` und im Preset. Nie umbenennen. */
  readonly id: string
  readonly nameDe: string
  readonly nameEn: string
  /** Familienname, wie ihn ein Mensch liest — er steht auf der Karte. */
  readonly headingFamily: string
  /** Vollständiger CSS-Stack inklusive Rückfall. */
  readonly headingStack: string
  readonly bodyFamily: string
  readonly bodyStack: string
  /** Lizenz und Quelle der ÜBERSCHRIFTEN-Familie (K2, §2.6). */
  readonly headingLicense: BrandFontLicense
  /** Lizenz und Quelle der FLIESSTEXT-Familie — bei `humanist` dieselbe. */
  readonly bodyLicense: BrandFontLicense
  /** Ein Satz, was dieses Paar tut — und was es kostet. */
  readonly noteDe: string
  readonly noteEn: string
}

/**
 * DIE SIEBEN FAMILIEN DES KATALOGS UND IHRE LIZENZ (Recherche 2026-09-09).
 *
 * Alle sieben liegen bei Google Fonts unter der SIL Open Font License 1.1 —
 * die Quelle ist die SPEZIMEN-Seite, weil dort der Lizenztext, die Schnitte
 * und der Download an einer Stelle stehen. Sie steht als Tabelle DANEBEN und
 * nicht sechsmal im Katalog: `humanist` benutzt eine Familie zweimal, und
 * `Sora`/`Inter` kommen in zwei Paaren vor — dieselbe Familie mit zwei
 * Lizenz-Zeilen wäre die erste Stelle, an der sie auseinanderlaufen.
 */
const FONT_LICENSES: Readonly<Record<string, BrandFontLicense>> = {
  'Source Serif 4': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Source+Serif+4' },
  'Source Sans 3': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Source+Sans+3' },
  'Inter': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Inter' },
  'Nunito Sans': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Nunito+Sans' },
  'Sora': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/Sora' },
  'PT Sans': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/PT+Sans' },
  'PT Serif': { spdx: 'OFL-1.1', source: 'https://fonts.google.com/specimen/PT+Serif' },
}

/**
 * Die Lizenz einer Familie — `undefined`, wenn sie nicht im Katalog steht.
 * Der Aufrufer entscheidet: `LICENSES.md` lässt die Zeile lieber weg, als
 * eine Lizenz zu behaupten, die niemand geprüft hat.
 */
export function brandFontLicense(family: string): BrandFontLicense | undefined {
  return FONT_LICENSES[family]
}

/** Kurz, weil sie sechsmal im Katalog steht. */
function license(family: string): BrandFontLicense {
  // Ein Paar mit einer Familie ausserhalb der Tabelle gibt es nicht — und
  // fiele es je aus, wäre ein leeres SPDX die ehrliche Auskunft, die der
  // Wächter `validateBrandFontPairs` sofort rot macht.
  return FONT_LICENSES[family] ?? { spdx: '', source: '' }
}

export const BRAND_FONT_PAIRS: readonly BrandFontPair[] = [
  {
    id: 'editorial',
    nameDe: 'Redaktionell',
    nameEn: 'Editorial',
    headingFamily: 'Source Serif 4',
    headingStack: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    bodyFamily: 'Source Sans 3',
    bodyStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('Source Serif 4'),
    bodyLicense: license('Source Sans 3'),
    noteDe: 'Serif oben, Grotesk unten — die Buch-Anmutung, die zu „fundiert" gehört.',
    noteEn: 'Serif above, sans below — the book-like feel that belongs to "well-founded".',
  },
  {
    id: 'humanist',
    nameDe: 'Humanistisch',
    nameEn: 'Humanist',
    headingFamily: 'Source Sans 3',
    headingStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Source Sans 3',
    bodyStack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('Source Sans 3'),
    bodyLicense: license('Source Sans 3'),
    noteDe: 'Eine Familie, zwei Rollen: ruhig, unaufdringlich, überall lesbar.',
    noteEn: 'One family, two roles: quiet, unobtrusive, readable everywhere.',
  },
  {
    id: 'inter',
    nameDe: 'Neutral',
    nameEn: 'Neutral',
    headingFamily: 'Inter',
    headingStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Inter',
    bodyStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('Inter'),
    bodyLicense: license('Inter'),
    noteDe: 'Die Arbeitsschrift des Netzes — sagt nichts über die Marke, stört aber auch nie.',
    noteEn: 'The working typeface of the web — it says nothing about you, and never gets in the way.',
  },
  {
    id: 'geometric',
    nameDe: 'Geometrisch',
    nameEn: 'Geometric',
    headingFamily: 'Sora',
    headingStack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Nunito Sans',
    bodyStack: "'Nunito Sans', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('Sora'),
    bodyLicense: license('Nunito Sans'),
    noteDe: 'Konstruierte Formen — moderner, aber weiter weg vom Handwerk.',
    noteEn: 'Constructed shapes — more modern, but further from the craft.',
  },
  {
    id: 'classic',
    nameDe: 'Klassisch',
    nameEn: 'Classic',
    headingFamily: 'PT Serif',
    headingStack: "'PT Serif', Georgia, 'Times New Roman', serif",
    bodyFamily: 'PT Sans',
    bodyStack: "'PT Sans', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('PT Serif'),
    bodyLicense: license('PT Sans'),
    noteDe: 'Amtlich-solide: gut für Institutionen, etwas streng für kleine Marken.',
    noteEn: 'Officially solid: good for institutions, a little stern for small brands.',
  },
  {
    id: 'contrast',
    nameDe: 'Kontrastreich',
    nameEn: 'High contrast',
    headingFamily: 'Sora',
    headingStack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
    bodyFamily: 'Inter',
    bodyStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    headingLicense: license('Sora'),
    bodyLicense: license('Inter'),
    noteDe: 'Aus dem Richtungs-Katalog („Mutig & Kontrastreich") — laut, aber wach.',
    noteEn: 'From the directions catalogue ("bold and high-contrast") — loud, but awake.',
  },
]

/**
 * DIE MONO-ROLLE IST FIX (Themes-Regel „maximal drei Schriften"): sie ist
 * keine dritte Marke, sondern eine Rolle — Herkunftsangaben, Preise, Code.
 * Deshalb steht sie NEBEN dem Katalog und nicht als Feld je Paar.
 */
export const BRAND_MONO_STACK = "'Geist Mono', ui-monospace, SFMono-Regular, monospace"

/**
 * Die Familie der Mono-Rolle als NAME — sie zählt bei der Drei-Schriften-Regel
 * mit (`brandTypeFamilies`, D4) und darf deshalb nicht aus dem Stack geraten
 * werden. Sie steht bewusst NICHT in `BRAND_DECLARED_FONT_FAMILIES`:
 * deklariert wird sie schon woanders — in `app/assets/css/brand.css` als
 * `--bw-font-mono`, der Mono der WERKSTATT selbst. Eine zweite Deklaration
 * derselben Familie in `brand-fonts.css` wäre eine zweite Wahrheit über
 * dieselbe Datei; die Liste dort trägt genau die Familien der PAARE.
 */
export const BRAND_MONO_FAMILY = 'Geist Mono'

/**
 * DIE LIZENZ DER MONO-ROLLE (K2) — sie steht neben dem Stack, aus demselben
 * Grund wie der Stack selbst: die Rolle ist eine Setzung und kein Feld eines
 * Paares, aber sie liegt in JEDEM Kit und braucht deshalb ihre Zeile in
 * `LICENSES.md`. Geist Mono kommt von Vercel und steht unter der SIL Open
 * Font License 1.1; die Quelle ist die Seite des Herausgebers, weil dort die
 * Familie samt Lizenz liegt (Recherche 2026-09-09).
 */
export const BRAND_MONO_LICENSE: BrandFontLicense = {
  spdx: 'OFL-1.1',
  source: 'https://vercel.com/font',
}

/**
 * DIE FAMILIEN, DIE WIRKLICH GELADEN WERDEN.
 *
 * Von Hand gepflegt (s. Kopf), aber seit D4 gegen die QUELLE geprüft: der
 * Test liest `app/assets/css/brand-fonts.css` und vergleicht wörtlich. Wer
 * ein Paar in den Katalog legt, trägt seine Familien HIER ein UND deklariert
 * sie dort — sonst zeigt die Vorschau still den Systemstack.
 */
export const BRAND_DECLARED_FONT_FAMILIES: readonly string[] = [
  'Inter',
  'Source Sans 3',
  'Source Serif 4',
  'Nunito Sans',
  'Sora',
  'PT Sans',
  'PT Serif',
]

/**
 * WELCHE SCHNITTE JE FAMILIE DEKLARIERT SIND (D4).
 *
 * Dieselbe Datei, dieselbe Pflege, dieselbe Prüfung wie die Familien-Liste —
 * nur eine Ebene genauer. Sie ist die Antwort auf „darf ich Gewicht 500 an
 * dieser Überschrift einstellen?": steht der Schnitt nicht hier, malt ihn der
 * Browser selbst, und die Bühne sagt es (`brandTypeWeightWarning`).
 *
 * PT Sans und PT Serif haben genau 400 und 700 — das ist ihr Lieferumfang bei
 * Google Fonts und nicht eine Lücke in dieser Liste.
 */
export const BRAND_DECLARED_FONT_WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  'Inter': [300, 400, 500, 600, 700],
  'Source Sans 3': [300, 400, 500, 600, 700],
  'Source Serif 4': [300, 400, 500, 600, 700],
  'Nunito Sans': [300, 400, 500, 600, 700],
  'Sora': [300, 400, 500, 600, 700],
  'PT Sans': [400, 700],
  'PT Serif': [400, 700],
}

const PAIRS_BY_ID = new Map(BRAND_FONT_PAIRS.map(pair => [pair.id, pair]))

/** `undefined` = kein Paar dieser Id — der Aufrufer entscheidet über den Rückfall. */
export function brandFontPair(id: string): BrandFontPair | undefined {
  return PAIRS_BY_ID.get(id)
}

/** Beide Familien eines Paares, ohne Doppelung (`humanist` nutzt eine für beides). */
export function brandFontPairFamilies(pair: BrandFontPair): readonly string[] {
  return [...new Set([pair.headingFamily, pair.bodyFamily])]
}

/**
 * DIE INVARIANTEN DES KATALOGS als prüfbare Funktion — keine doppelte Id, kein
 * leeres Feld, jede Familie im eigenen Stack genannt und in
 * `BRAND_DECLARED_FONT_FAMILIES` deklariert (§2.17). Nimmt beliebige Listen,
 * damit der Beweis mutierte Fassungen vorlegen kann.
 */
export function validateBrandFontPairs(
  pairs: readonly BrandFontPair[] = BRAND_FONT_PAIRS,
  declared: readonly string[] = BRAND_DECLARED_FONT_FAMILIES,
): readonly string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const declaredSet = new Set(declared)

  for (const pair of pairs) {
    if (seen.has(pair.id)) problems.push(`doppelte Paar-Id: ${pair.id}`)
    seen.add(pair.id)
    if (!pair.nameDe.trim() || !pair.nameEn.trim()) problems.push(`${pair.id}: Name unvollständig`)
    if (!pair.noteDe.trim() || !pair.noteEn.trim()) problems.push(`${pair.id}: Notiz unvollständig`)
    for (const [family, stack, role] of [
      [pair.headingFamily, pair.headingStack, 'heading'] as const,
      [pair.bodyFamily, pair.bodyStack, 'body'] as const,
    ]) {
      if (!family.trim()) {
        problems.push(`${pair.id}: ${role} ohne Familie`)
        continue
      }
      // Der Stack muss mit seiner eigenen Familie ANFANGEN — ein Stack, in dem
      // sie fehlt, lädt sie nie, egal was der Katalog behauptet.
      if (!stack.includes(family)) {
        problems.push(`${pair.id}: ${role}-Stack nennt "${family}" nicht`)
      }
      if (!declaredSet.has(family)) {
        problems.push(`${pair.id}: "${family}" ist nicht deklariert (§2.17 — die Vorschau fiele still zurück)`)
      }
    }
    // K2 (§2.6): OHNE LIZENZ KEIN KIT. `LICENSES.md` nennt die Familien dieser
    // Marke mit Lizenz und Bezugsweg — ein leeres Feld hier wäre im Bündel
    // eine Schrift, die jemand ohne Auskunft weiterverwendet.
    for (const [entry, role] of [
      [pair.headingLicense, 'heading'] as const,
      [pair.bodyLicense, 'body'] as const,
    ]) {
      if (!entry || !entry.spdx.trim()) problems.push(`${pair.id}: ${role} ohne Lizenz (SPDX)`)
      if (!entry || !entry.source.trim()) problems.push(`${pair.id}: ${role} ohne Lizenz-Quelle`)
    }
  }
  return problems
}
