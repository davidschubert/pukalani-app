import { z } from 'zod'

/**
 * DIE DTCG-FORM ALS PRÜFBARE ZUSAGE (Konzept docs/plans/BRAND-BOOK-KIT.md
 * §2.6/§2.18 Zeile K2) — das Schema ist der BEWEIS, nicht die Tür.
 *
 * ── ES LÄUFT NICHT ZUR LAUFZEIT ──────────────────────────────────────────
 * `tokens.json` ist unsere eigene Ausgabe: sie kommt nicht von einem Kunden,
 * nicht von einem Modell und nicht aus einer Tabelle. Sie bei jedem Download
 * zu validieren hieße, für einen Fehler zu bezahlen, den wir in der CI sehen
 * wollen — und der Kunde bekäme im Ernstfall eine 500 statt einer Datei, in
 * der ein Feld fehlt. Deshalb: geprüft wird im Test (und im
 * `verify-brand-tokens.mjs`-Lauf), nicht im Handler.
 *
 * ── ES PRÜFT DIE NORM, NICHT UNSERE WERTE ────────────────────────────────
 * Was hier steht, ist das, was ein FREMDES Werkzeug erwartet (Figma, Style
 * Dictionary 5): `$type`/`$value` an jedem Token, Farben mit `colorSpace`,
 * `components` (drei Zahlen 0–1) und `hex`, Maße mit `px`/`rem`, Dauern mit
 * `ms`, Easing als vier Zahlen, Aliasse in geschweiften Klammern. Ob unsere
 * Rampe elf Stufen hat, prüft `brandDesign.test.ts`; ob die Datei LESBAR ist,
 * prüft dieses Schema.
 *
 * `.catchall`/`passthrough` an den Gruppen ist Absicht: DTCG-Gruppen dürfen
 * beliebige Kinder haben, und ein Schema, das unsere heutigen Namen fest
 * verdrahtet, wäre beim ersten neuen Token rot, ohne dass etwas kaputt ist.
 */

const hex = z.string().regex(/^#[0-9a-f]{6}$/, 'Hex in Kleinbuchstaben mit sechs Stellen')

/** Ein Alias: `{color.brand.600}` — Pfad aus Segmenten, keine Leerzeichen. */
const alias = z.string().regex(/^\{[a-z0-9-]+(\.[a-z0-9-]+)*\}$/i, 'Alias der Form {gruppe.token}')

const colorValue = z.object({
  colorSpace: z.literal('srgb'),
  components: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
  hex,
})

const dimensionValue = z.object({
  value: z.number(),
  unit: z.union([z.literal('px'), z.literal('rem')]),
})

const durationValue = z.object({
  value: z.number().nonnegative(),
  unit: z.literal('ms'),
})

const contrastExtension = z.object({
  pair: z.string().min(1),
  ratio: z.number().positive(),
  level: z.union([z.literal('AAA'), z.literal('AA'), z.literal('AA18'), z.literal('fail')]),
})

const colorToken = z.object({
  $type: z.literal('color'),
  $value: z.union([colorValue, alias]),
  $description: z.string().optional(),
  $extensions: z.object({
    'supply.branding/contrast': contrastExtension.optional(),
  }).optional(),
})

const rampGroup = z.object({ $description: z.string().min(1) }).catchall(z.union([z.string(), colorToken]))

const fontFamilyToken = z.object({
  $type: z.literal('fontFamily'),
  $value: z.array(z.string().min(1)).min(1),
  $description: z.string().optional(),
})

const fontWeightToken = z.object({
  $type: z.literal('fontWeight'),
  $value: z.number().int().min(1).max(1000),
  $description: z.string().optional(),
})

const dimensionToken = z.object({
  $type: z.literal('dimension'),
  $value: dimensionValue,
  $description: z.string().optional(),
  $extensions: z.record(z.string(), z.unknown()).optional(),
})

const durationToken = z.object({
  $type: z.literal('duration'),
  $value: durationValue,
  $description: z.string().optional(),
})

const cubicBezierToken = z.object({
  $type: z.literal('cubicBezier'),
  $value: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  $description: z.string().optional(),
})

const typographyToken = z.object({
  $type: z.literal('typography'),
  $value: z.object({
    fontFamily: z.union([alias, z.string().min(1), z.array(z.string().min(1))]),
    fontSize: dimensionValue,
    fontWeight: z.number().int().min(1).max(1000),
    lineHeight: z.number().positive(),
    letterSpacing: dimensionValue.optional(),
  }),
  $description: z.string().optional(),
  $extensions: z.record(z.string(), z.unknown()).optional(),
})

/** Die ganze Datei — s. Kopf: Gruppen bleiben offen, Tokens nicht. */
export const brandTokensSchema = z.object({
  $description: z.string().min(1),
  $extensions: z.object({
    'supply.branding/meta': z.object({
      formatVersion: z.number().int().positive(),
      stand: z.string(),
      generator: z.string().min(1),
      presetVersion: z.number().int().positive(),
    }),
  }),
  color: z.object({
    'brand': rampGroup,
    'brand-dark': rampGroup,
    'neutral': rampGroup,
    'accent': colorToken,
    'accent-dark': rampGroup,
    'light': rampGroup,
    'dark': rampGroup,
  }),
  font: z.object({
    heading: fontFamilyToken,
    body: fontFamilyToken,
    mono: fontFamilyToken,
    weight: z.object({ heading: fontWeightToken, body: fontWeightToken }),
  }),
  type: z.object({
    scale: z.object({ $description: z.string().min(1) })
      .catchall(z.union([z.string(), typographyToken, dimensionToken])),
  }),
  radius: z.object({ mark: dimensionToken }),
  motion: z.object({
    duration: z.object({ $description: z.string().min(1) })
      .catchall(z.union([z.string(), durationToken])),
    easing: z.object({ $description: z.string().min(1) })
      .catchall(z.union([z.string(), cubicBezierToken])),
  }),
})
