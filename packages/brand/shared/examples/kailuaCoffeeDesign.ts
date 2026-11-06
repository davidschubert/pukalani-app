import { brandNeutralSource, buildBrandDesign } from '../brandDesign'
import { brandColorRoles } from '../brandDesignColor'
import {
  brandImageryDoDont,
  brandImageryPrincipleLines,
} from '../brandDesignImagery'
import {
  brandMarkBriefLines,
  brandMarkDerivedBriefFields,
  brandMarkInitial,
  brandMarkSpec,
} from '../brandDesignMark'
import { brandMotionRules } from '../brandDesignMotion'
import { brandSceneColors } from '../brandDesignScene'
import { BRAND_TYPE_DEFAULT_RULES, brandTypeRuleLines } from '../brandDesignType'
import { brandDesignSnapshotPreset } from '../brandDesignValues'
import { brandMarkExampleSvgs } from '../brandMarkSvg'
import type { BrandDesignSnapshotPreset, BrandDesignValues } from '../types/brand'

/**
 * DIE VISUELLE IDENTITÄT DER BEISPIEL-MARKE „KAILUA COFFEE CO." (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Paket D8).
 *
 * ── WARUM SIE GERECHNET UND NICHT ABGESCHRIEBEN IST ──────────────────────
 * Die Werte unten sind ENTSCHEIDUNGEN (Basisfarbe Roast, Akzent Palm,
 * Schriftpaar „Redaktionell", Prinzip „Nah am Handwerk", Tempo „Ruhig" —
 * wörtlich die des abgenommenen Prototyps). Alles darüber — Rampen,
 * Kontrast-Matrix, Rollen, Regel-Zeilen, die acht SVG-Setzungen — entsteht aus
 * DERSELBEN Maschine, die auch eine echte Marke rechnet (`buildBrandDesign`).
 *
 * Ein von Hand hingeschriebenes Preset wäre die Sorte Beispiel, die nach dem
 * ersten Katalog-Schritt etwas zeigt, das das Produkt nicht mehr liefert — und
 * niemand merkt es, weil auf dieser Seite kein Test klickt. So kann es das
 * nicht: ändert sich die Ramp-Mathematik, ändert sich das Beispiel mit.
 *
 * ── ES IST EIN SNAPSHOT, ALSO OHNE ENTWÜRFE ──────────────────────────────
 * `brandDesignSnapshotPreset` nimmt die behaltenen KI-Entwürfe heraus — hier
 * gibt es ohnehin keine, aber der Weg ist derselbe wie beim Teilen (§1.11 b):
 * die öffentliche Beispiel-Seite zeigt GENAU das, was ein Empfänger eines
 * geteilten Links sieht.
 *
 * ── DIE INHALTSSPRACHE IST DEUTSCH ───────────────────────────────────────
 * Wie beim Rest des Beispiels (`kailuaCoffee.ts`): die Marke spricht deutsch,
 * also stehen die Regel-Zeilen und das Briefing auf Deutsch. Der RAHMEN
 * (Abschnitts-Überschriften) folgt weiterhin der Sprache des Lesers, weil er
 * aus i18n-Schlüsseln kommt.
 */

const LOCALE = 'de'
const TITLE = 'Kailua Coffee Co.'

/** Roast · Palm — dieselben zwei Farben wie im Klickdummy. */
const BASE = '#4a3123'
const ACCENT = '#2f4a3a'
const NEUTRAL = 'warm'
const PAIR = 'editorial'
const MARK_KIND = 'word'
const PRINCIPLE = 'closeup'
const ILLUSTRATION = 'line'
const ICONS = 'regular'
const TEMPO = 'calm'
const LOGO_MOTION = 'no'

/** Die zehn Dimensionen der Visual DNA — die Richtung „Warm & Editorial". */
const DNA: Readonly<Record<string, string>> = {
  style: 'editorial',
  era: 'craft',
  form: 'soft',
  typography: 'bookish',
  color: 'earthy',
  imagery: 'craftClose',
  composition: 'calm',
  materiality: 'paper',
  motion: 'calmMotion',
  mood: 'warm',
}

/**
 * Das Briefing: vier geschriebene Felder (im Produkt schreibt sie der
 * Briefing-Lauf), zwei gerechnete. Die gerechneten kommen aus derselben
 * Funktion wie im Kapitel — Maße erfindet auch ein Beispiel nicht.
 */
const BRIEF = {
  character: 'Ruhig, handwerklich, ohne Nostalgie-Kostüm. Das Zeichen soll aussehen, als hätte es '
    + 'jemand gesetzt, der den Kaffee selbst röstet — nicht als hätte es eine Agentur „entwickelt".',
  formLanguage: 'Weich gerundete Ecken, offene Punzen, keine harten Kanten. Der Name trägt allein; '
    + 'wenn ein Bildteil dazukommt, dann als Fläche, nie als Illustration einer Bohne.',
  noGos: 'Keine Kaffeebohne, keine Tasse mit Dampfschwaden, kein Berg. Keine Verläufe, kein Schatten, '
    + 'keine zweite Marken-Farbe im Zeichen.',
  places: 'Tüte, Tafel neben der Theke, Tassenboden, Website-Kopf, Instagram-Profilbild.',
  ...brandMarkDerivedBriefFields(brandMarkInitial(TITLE), LOCALE),
}

const COLORS = brandSceneColors(BASE, ACCENT, brandNeutralSource(NEUTRAL, BASE))

const VALUES: BrandDesignValues = {
  dna: DNA,
  base: BASE,
  neutral: NEUTRAL,
  accent: ACCENT,
  roles: brandColorRoles(BASE, ACCENT, NEUTRAL) ?? [],
  pair: PAIR,
  scale: 'calm',
  typeRules: brandTypeRuleLines(BRAND_TYPE_DEFAULT_RULES, LOCALE),
  markKind: MARK_KIND,
  markBrief: brandMarkBriefLines(BRIEF, LOCALE),
  markExamples: brandMarkExampleSvgs(brandMarkSpec({
    title: TITLE,
    pairId: PAIR,
    kind: MARK_KIND,
    dna: DNA,
    colors: COLORS,
    headingWeight: BRAND_TYPE_DEFAULT_RULES.headingWeight,
    headingTracking: BRAND_TYPE_DEFAULT_RULES.headingTracking,
    headingUppercase: BRAND_TYPE_DEFAULT_RULES.headingUppercase,
  })),
  imageryPrinciples: brandImageryPrincipleLines(PRINCIPLE, LOCALE),
  illustration: ILLUSTRATION,
  icons: ICONS,
  dodont: brandImageryDoDont(PRINCIPLE, ILLUSTRATION, ICONS, LOCALE),
  tempo: TEMPO,
  logoMotion: LOGO_MOTION,
  motionRules: brandMotionRules(TEMPO, LOGO_MOTION, LOCALE),
}

/**
 * `null` kann hier nicht herauskommen (alle tragenden Werte stehen oben) — der
 * Typ sagt es trotzdem, also fällt das Beispiel im Zweifel WEG statt halb zu
 * rendern. Der Test nagelt fest, dass es da ist.
 */
const PRESET = buildBrandDesign(VALUES)

export const KAILUA_COFFEE_DESIGN: BrandDesignSnapshotPreset | undefined
  = PRESET ? brandDesignSnapshotPreset(PRESET) : undefined
