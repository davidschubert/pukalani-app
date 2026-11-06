import { z } from 'zod'

/**
 * DIE FORM VON `brand.json` ALS PRÜFBARE ZUSAGE (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.6/§2.18 Zeile K3).
 *
 * ── ES LÄUFT NICHT ZUR LAUFZEIT ──────────────────────────────────────────
 * Wie das Token-Schema (Kopf von `brandTokens.ts`): die Datei ist UNSERE
 * Ausgabe, nicht die Eingabe eines Kunden. Sie bei jedem Download zu
 * validieren hiesse, für einen Fehler zu bezahlen, den wir in der CI sehen
 * wollen. Geprüft wird im Test.
 *
 * ── ZWEI ZUSAGEN, DIE ES HÄRTER PRÜFT ALS DIE TYPEN ──────────────────────
 *  1. `mark` ist STRIKT: ein `keptDrafts` darin wäre eine behaltene
 *     KI-Entwurfs-Id in einer Datei, die der Kunde weitergibt (§1.11 b). Der
 *     Typ verbietet es (`BrandDesignSnapshotPreset` per `Omit`), das Schema
 *     beweist es an der fertigen Datei — und zwar auch dann, wenn jemand das
 *     Preset später über ein `as` hineinreicht.
 *  2. Die Block-Arten sind eine geschlossene Liste OHNE `design`, `locked`,
 *     `direction` und `swatches`. Das Visuelle steht in `design`, und ein
 *     zweites Abbild davon in den Kapiteln wäre die zweite Wahrheit, die
 *     irgendwann auseinanderläuft.
 */

const labelled = { labelKey: z.string().min(1).optional() }

const block = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['lead', 'text']), ...labelled, text: z.string() }),
  z.object({ kind: z.literal('list'), ...labelled, items: z.array(z.string()) }),
  z.object({
    kind: z.literal('cards'),
    ...labelled,
    items: z.array(z.object({
      title: z.string(),
      text: z.string(),
      note: z.string().optional(),
    })),
  }),
  z.object({
    kind: z.literal('chips'),
    ...labelled,
    items: z.array(z.object({ word: z.string(), sample: z.string() })),
  }),
  z.object({
    kind: z.literal('dodont'),
    ...labelled,
    pairs: z.array(z.object({ doText: z.string(), dontText: z.string() })),
  }),
  z.object({
    kind: z.literal('table'),
    ...labelled,
    columnKeys: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    kind: z.literal('choice'),
    ...labelled,
    slotId: z.string().min(1),
    optionIds: z.array(z.string()),
  }),
  /* SEIT K4 (§2.5): Regeln, Vorlagen und die Ansprechperson des Pressekits.
   * `label` und `title` sind MARKEN-Inhalt und deshalb Sätze; jede andere
   * Beschriftung bleibt ein Schlüssel (s. Kopf Nr. 2). */
  z.object({
    kind: z.literal('rules'),
    ...labelled,
    label: z.string().min(1).optional(),
    items: z.array(z.object({ text: z.string(), dont: z.string().optional() })),
  }),
  z.object({
    kind: z.literal('prompt'),
    labelKey: z.string().min(1),
    title: z.string(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('contact'),
    name: z.string(),
    role: z.string(),
    email: z.string(),
  }),
  z.object({
    kind: z.literal('aiRules'),
    tone: z.array(z.string()),
    avoid: z.array(z.string()),
    stands: z.array(z.string()),
  }),
])

const chapter = z.object({
  id: z.string().min(1),
  anchor: z.string().min(1),
  /** Ein SCHLÜSSEL, kein Satz — s. Kopf von `shared/brandContext.ts`. */
  titleKey: z.string().regex(/^brand\./, 'i18n-Schlüssel, keine Übersetzung'),
  blocks: z.array(block).min(1),
})

/** Das Preset, so weit `brand.json` es zusagt — der Rest ist Sache von D8. */
const design = z.object({
  version: z.number().int().positive(),
  dna: z.record(z.string(), z.string()),
  color: z.object({
    base: z.string(),
    accent: z.string(),
    roles: z.array(z.object({ id: z.string(), source: z.string(), hex: z.string() })),
  }).loose(),
  type: z.object({ pair: z.string(), scale: z.string() }).loose(),
  // STRIKT — s. Kopf Nr. 1.
  mark: z.object({
    kind: z.string(),
    brief: z.array(z.string()),
    examples: z.array(z.string()),
  }).strict(),
  imagery: z.object({ principles: z.array(z.string()) }).loose(),
  motion: z.object({ tempo: z.string() }).loose(),
}).loose()

export const brandContextSchema = z.object({
  schemaVersion: z.literal(1),
  brand: z.object({
    title: z.string(),
    locale: z.string().min(2),
    /** Datum oder leer — nie ein halbes ISO-Datum. */
    stand: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  }),
  foundation: z.object({
    story: z.string(),
    chapters: z.array(chapter),
  }),
  nomenclature: chapter.optional(),
  aiGuidelines: chapter.optional(),
  presskit: chapter.optional(),
  design: design.nullable(),
})

export type BrandContextSchema = z.infer<typeof brandContextSchema>
