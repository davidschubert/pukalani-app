/**
 * DIE FORM DES KITS — DTCG-TOKENS, DATEI-REGISTRY UND DIE ZWEI ANTWORTEN
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6/§2.9, Paket K2).
 *
 * ── WARUM DIE TYPEN HIER STEHEN UND NICHT IN `brand.ts` ───────────────────
 * `shared/types/brand.ts` trägt die Wahrheit über MARKE und DESIGN (Preset,
 * Journey, Sessions) — sie wird von jeder Seite und fast jeder Route gelesen.
 * Das Kit ist eine AUSLIEFERUNG davon: eine Datei-Form, ein Manifest und zwei
 * Routen. Eine eigene Datei hält die 2 300 Zeilen daneben frei von einem
 * Format, das nur zwei Erzeuger und zwei Leser hat — und sie macht sichtbar,
 * dass K3 (Brand Context) und K6 (Bündel) hier andocken, nicht dort.
 *
 * ── DIE DTCG-FORM IST DIE NORM, NICHT UNSERE ─────────────────────────────
 * Alles unterhalb von `BrandTokenFile` folgt dem Design Tokens Format Module
 * 2025.10 (designtokens.org, erste stabile Fassung; Anhang A des Konzepts):
 * `$type`/`$value`/`$description`/`$extensions`, Farben als Objekt mit
 * `colorSpace`/`components`/`hex`, Maße und Dauern als Objekt mit `unit`,
 * Easing als vier Zahlen, Aliasse als `{gruppe.token}`. Wo wir etwas sagen
 * wollen, das die Norm nicht kennt (Kontrast-Belege, die Prozent-Rundung des
 * Zeichens, unsere Fassung), steht es unter `$extensions` mit dem Präfix
 * `supply.branding/` — genau dafür ist das Feld da, und ein Fremdfeld neben
 * `$value` würde jeden Importeur (Figma, Style Dictionary) stolpern lassen.
 *
 * ── GRUPPEN MIT FREIEN NAMEN TRAGEN EINE INDEX-SIGNATUR ──────────────────
 * Rollen, Skalen-Stufen und Bewegungs-Tokens heißen so, wie die Marke sie
 * nennt — ihre Gruppen haben deshalb `[name: string]` neben `$description`,
 * und der Wert-Typ schließt `string` ein, weil `$description` selbst ein
 * String ist. Wer eine solche Gruppe liest, überspringt Schlüssel mit `$` und
 * prüft mit `typeof` — beides steht in `brandTokensCss.ts` genau einmal.
 *
 * DIESE DATEI IST PUR: nur Typen, kein Code, kein i18n, kein H3. Alle Importe
 * sind TYP-Importe (`BrandDesignSnapshotPreset`, `BrandStepState`,
 * `BrandKitStepKey`) — sie werden beim Übersetzen gelöscht und machen aus der
 * Datei kein Modul mit Verhalten.
 */

import type { BrandDesignSnapshotPreset } from './brand'
import type { BrandStepState } from '../brandJourney'
import type { BrandKitStepKey } from '../slotRegistry'

// ── DTCG-Werte ─────────────────────────────────────────────────────────────

/**
 * Eine Farbe nach 2025.10: Farbraum, Kanäle 0–1 und der Hex als RÜCKFALL.
 * Der Hex ist keine Doppelung, sondern der von Style Dictionary 5.4
 * dokumentierte Weg für Werkzeuge, die den Farbraum (noch) nicht lesen
 * (§2.17).
 */
export interface BrandTokenColorValue {
  colorSpace: 'srgb'
  /** Rot, Grün, Blau als 0–1, auf vier Nachkommastellen gerundet. */
  components: [number, number, number]
  hex: string
}

/** Ein Maß — die Norm kennt genau diese zwei Einheiten. */
export interface BrandTokenDimensionValue {
  value: number
  unit: 'px' | 'rem'
}

/** Eine Dauer — Millisekunden, wie das Preset sie führt. */
export interface BrandTokenDurationValue {
  value: number
  unit: 'ms'
}

/** Vier Zahlen, wie in CSS: x1, y1, x2, y2. */
export type BrandTokenCubicBezierValue = [number, number, number, number]

/**
 * Der Typografie-Verbund. `fontFamily` ist hier ein ALIAS (`{font.heading}`),
 * damit ein Schriftwechsel eine Stelle ist und nicht sechs.
 */
export interface BrandTokenTypographyValue {
  fontFamily: string
  fontSize: BrandTokenDimensionValue
  fontWeight: number
  lineHeight: number
  letterSpacing?: BrandTokenDimensionValue
}

// ── Unsere Erweiterungen (`$extensions`) ───────────────────────────────────

/** Der Schlüssel unter `$extensions` — EIN Präfix für alles Eigene. */
export const BRAND_TOKEN_EXTENSION_META = 'supply.branding/meta'
export const BRAND_TOKEN_EXTENSION_CONTRAST = 'supply.branding/contrast'
export const BRAND_TOKEN_EXTENSION_MARK = 'supply.branding/mark'
export const BRAND_TOKEN_EXTENSION_TYPE = 'supply.branding/type'
/**
 * DER GEHOBENE DUNKELMODUS-AKZENT (Davids Entscheidung §2.20 Nr. 7, 2026-09-09).
 *
 * Kailuas Akzent (#2f4a3a) erreicht auf der dunklen Fläche 1,8:1. Statt die
 * Markenfarbe wörtlich zu lassen und nur „unter AA" zu zeigen, bekommt
 * `color.dark.accent` einen eigenen Alias auf die erste Stufe der
 * Akzent-Rampe, die AA erreicht — und das GEMESSENE Urteil des Originals
 * bleibt hier als Beleg stehen. Der Leser sieht beides: was die Marke
 * wollte, und warum das Token davon abweicht.
 */
export const BRAND_TOKEN_EXTENSION_ACCENT_LIFT = 'supply.branding/accent-lift'

/** Beleg der Hebung: das Original, der Grund, die gewählte Stufe. */
export interface BrandTokenAccentLift {
  /** Der Alias des Originals — `{color.accent}`. */
  from: string
  /** Die dunkle Fläche, gegen die gemessen wurde (Hex). */
  ground: string
  /** Das Urteil des ORIGINALS auf dieser Fläche — der Grund der Hebung. */
  measured: { ratio: number, level: 'AAA' | 'AA' | 'AA18' | 'fail' }
  /** Die gewählte Stufe der Akzent-Rampe und ihr Urteil. */
  lifted: { shade: number, ratio: number, level: 'AAA' | 'AA' | 'AA18' | 'fail' }
}

/** Der Kopf der Datei: unsere Fassung, der Stand, wer sie gebaut hat. */
export interface BrandTokenMeta {
  /** Fassung UNSERES Aufbaus (nicht die der Norm). */
  formatVersion: number
  /** ISO-Stempel des jüngsten beteiligten Kapitels (`brandDesignStand`). */
  stand: string
  generator: string
  /** Die Fassung des Preset-Formats, aus dem gerechnet wurde. */
  presetVersion: number
}

/**
 * DER KONTRAST-BELEG EINER ROLLE — ein Verweis auf eines der sechs GEPRÜFTEN
 * Paare des Presets, nie eine eigene Messung.
 *
 * Er steht als Erweiterung und nicht als Token, weil ein Verhältnis kein Wert
 * ist, den jemand einsetzt (§2.6: „sie sind Beleg, kein Token"). Rollen, die
 * in keinem der sechs Paare vorkommen, bekommen KEINEN Beleg — ein erfundener
 * wäre schlimmer als keiner.
 */
export interface BrandTokenContrast {
  /** Id aus `preset.color.contrastPairs`. */
  pair: string
  ratio: number
  level: 'AAA' | 'AA' | 'AA18' | 'fail'
}

// ── DTCG-Tokens ────────────────────────────────────────────────────────────

export interface BrandColorToken {
  $type: 'color'
  $value: BrandTokenColorValue
  $description?: string
}

/** Eine Rolle: ein ALIAS in eine Rampe, plus ihr Beleg. */
export interface BrandColorAliasToken {
  $type: 'color'
  /** `{color.brand.600}` — ein Verweis, kein Wert. */
  $value: string
  $description?: string
  $extensions?: {
    [BRAND_TOKEN_EXTENSION_CONTRAST]?: BrandTokenContrast
    [BRAND_TOKEN_EXTENSION_ACCENT_LIFT]?: BrandTokenAccentLift
  }
}

export interface BrandFontFamilyToken {
  $type: 'fontFamily'
  /** Der vollständige Stack, erste Familie zuerst. */
  $value: string[]
  $description?: string
}

export interface BrandFontWeightToken {
  $type: 'fontWeight'
  $value: number
  $description?: string
}

export interface BrandDimensionToken {
  $type: 'dimension'
  $value: BrandTokenDimensionValue
  $description?: string
  $extensions?: { [BRAND_TOKEN_EXTENSION_MARK]?: { radiusPercent: number, referenceTileRem: number } }
}

export interface BrandDurationToken {
  $type: 'duration'
  $value: BrandTokenDurationValue
  $description?: string
}

export interface BrandCubicBezierToken {
  $type: 'cubicBezier'
  $value: BrandTokenCubicBezierValue
  $description?: string
}

export interface BrandTypographyToken {
  $type: 'typography'
  $value: BrandTokenTypographyValue
  $description?: string
  $extensions?: { [BRAND_TOKEN_EXTENSION_TYPE]?: { uppercase: boolean } }
}

// ── DTCG-Gruppen ───────────────────────────────────────────────────────────

/** Eine Rampe: elf Stufen, benannt wie die Themes-Engine sie nennt. */
export interface BrandRampTokenGroup {
  $description: string
  [shade: string]: string | BrandColorToken
}

/** Die Rollen eines Modus — freie Namen, deshalb die Index-Signatur (s. Kopf). */
export interface BrandColorRoleTokenGroup {
  $description: string
  [roleId: string]: string | BrandColorAliasToken
}

/** Die Größen-Leiter: je Stufe ein Verbund UND ein Einzel-Maß (`h1-size`). */
export interface BrandTypeScaleTokenGroup {
  $description: string
  [stepId: string]: string | BrandTypographyToken | BrandDimensionToken
}

export interface BrandDurationTokenGroup {
  $description: string
  [tokenId: string]: string | BrandDurationToken
}

export interface BrandEasingTokenGroup {
  $description: string
  [easingId: string]: string | BrandCubicBezierToken
}

// ── Die Datei ──────────────────────────────────────────────────────────────

/**
 * `tokens.json` — EINE Datei, Hell und Dunkel als GESCHWISTER-GRUPPEN
 * (Entscheidung §2.20 Nr. 1). Die Norm kennt keine Modi; Figma bildet die
 * Gruppen auf zwei Modi ab, Style Dictionary auf zwei Sets.
 */
export interface BrandTokenFile {
  $description: string
  $extensions: { [BRAND_TOKEN_EXTENSION_META]: BrandTokenMeta }
  color: {
    brand: BrandRampTokenGroup
    'brand-dark': BrandRampTokenGroup
    neutral: BrandRampTokenGroup
    accent: BrandColorToken
    /** Die Rampe des Akzents für den dunklen Modus — Ziel der Hebung (§2.20 Nr. 7). */
    'accent-dark': BrandRampTokenGroup
    light: BrandColorRoleTokenGroup
    dark: BrandColorRoleTokenGroup
  }
  font: {
    heading: BrandFontFamilyToken
    body: BrandFontFamilyToken
    mono: BrandFontFamilyToken
    weight: {
      heading: BrandFontWeightToken
      body: BrandFontWeightToken
    }
  }
  type: { scale: BrandTypeScaleTokenGroup }
  radius: { mark: BrandDimensionToken }
  motion: {
    duration: BrandDurationTokenGroup
    easing: BrandEasingTokenGroup
  }
}

/** Was `buildBrandTokens` außer dem Preset braucht — Marke, Stand, Sprache. */
export interface BrandTokenMetaInput {
  title: string
  /** ISO-Stempel, wie ihn `brandDesignStand` liefert; '' ist erlaubt. */
  stand: string
  /** Sprache der `$description`-Texte; Token-NAMEN sind sprachneutral (§2.17). */
  locale: string
}

// ── Die Registry und die zwei Antworten (§2.9) ────────────────────────────

/** Die geschlossene Liste der Kit-Dateien — s. `shared/brandKitFiles.ts`. */
export type BrandKitFileId =
  | 'tokens.json'
  | 'tokens.css'
  | 'licenses.md'
  | 'brand.md'
  | 'brand.json'
  | 'readme.md'

export interface BrandKitFile {
  id: BrandKitFileId
  /** Dateiname OHNE Marken-Stamm — den setzt die Route aus Slug und Stand. */
  filename: string
  mime: string
  /** Braucht sie das Design-Preset? Ohne Preset ⇒ 409 `kit_file_unavailable`. */
  needsDesign: boolean
}

/** Warum eine Datei (noch) nicht abrufbar ist. */
export type BrandKitFileReason = 'design_missing' | 'not_built_yet'

/**
 * Der Grund, wie er den Client ERREICHT: als `code` in `error.data`, den der
 * zentrale Handler als `reason` ins Envelope hebt. Ein zusätzliches Feld
 * neben `code` käme nie an — Begründung bei `brandKitFileErrorCode`.
 */
export type BrandKitFileErrorCode = 'kit_file_design_missing' | 'kit_file_not_built_yet'

export interface BrandKitManifestFile {
  id: BrandKitFileId
  /** Der Dateiname, den der Download trägt (mit Slug und Stand). */
  filename: string
  available: boolean
  reason?: BrandKitFileReason
  /** Größe in Bytes — nur bei `available`, gerechnet wie der Download selbst. */
  bytes?: number
}

/**
 * EINE ZEICHEN-DATEI (`marks/*.svg`, §2.6, Paket K6).
 *
 * Sie steht NICHT in `BRAND_KIT_FILES`: das ist eine geschlossene Liste mit
 * festen Dateinamen, und die Zeichen sind eine je Setzung wechselnde MENGE
 * (vier Varianten mal zwei Setzungen, sobald es ein Preset gibt; ohne Preset
 * keine). Ein Registry-Eintrag „mehrere Dateien" wäre ein Eintrag, für den
 * die Regeln der Registry nicht gelten.
 */
export interface BrandKitMarkFile {
  /** `marks/<slug>-<setzung>-<variante>.svg` — der Pfad IM BÜNDEL. */
  id: string
  /** Derselbe Name ohne `marks/` — er ist der Router-Parameter der Route. */
  filename: string
  /** Id aus `BRAND_MARK_SETTINGS` (`wordmark` | `monogram`). */
  setting: string
  /** Id aus `BRAND_MARK_VARIANTS` (`primary` | `inverted` | `mono` | `icon`). */
  variant: string
  /**
   * Ist das die als primär geführte Setzung (`j.pick`)?
   *
   * OPTIONAL und heute nie gesetzt: der Slot steht nicht im Snapshot-Preset,
   * und ein geratenes „Primär" wäre eine Aussage über eine Entscheidung, die
   * der Erzeuger nicht kennt (s. Kopf von `shared/brandKitMarks.ts`).
   */
  primary?: boolean
  /** Der SVG-Quelltext, mit `<title>` und `role="img"`. */
  svg: string
}

/**
 * EINE ZEICHEN-DATEI IM MANIFEST — mit dem SVG, und das ist Absicht.
 *
 * Die Registry-Dateien nennt das Manifest nur (Name, Grösse); die Zeichen
 * trägt es MIT. Der Grund ist der Tages-Eimer: die Lieferseite zeigt acht
 * Kacheln, und holte sie jede einzeln über die Zeichen-Route, kostete EIN
 * Seitenaufruf acht der sechzig Abrufe — nach sechs Besuchen stünde ein Mensch
 * an einer Schranke, die gegen ein Skript gedacht ist und nie gegen ihn
 * (§2.11). Der Server zahlt dafür nichts: die Setzungen stehen ohnehin schon
 * im Kontext, sie werden nur mitgeschickt.
 *
 * Der DOWNLOAD läuft trotzdem über die Route — geladen wird, was ausgeliefert
 * wird, mit `Content-Disposition` und Eimer-Treffer.
 */
export interface BrandKitManifestMark {
  id: string
  filename: string
  setting: string
  variant: string
  primary?: boolean
  bytes: number
  /** Der SVG-Quelltext — dieselbe Zeichenkette, die die Route ausliefert. */
  svg: string
}

/**
 * DAS BÜNDEL IM MANIFEST — Name, Gewicht und was fehlt. OHNE `bytes`.
 *
 * Die Größe fehlt mit Absicht (§2.11): das Bündel ist die EINZIGE teure
 * Rechnung des Produkts, und das Manifest ist die Seite, nicht die Datei —
 * stünde die Zahl darin, packte jeder Seitenaufruf das ganze Zip, nur um eine
 * Zahl neben einen Knopf zu schreiben. Die Seite zeigt deshalb den
 * Dateinamen; die Bytes sieht der Browser beim Laden.
 */
export interface BrandKitManifestBundle {
  /** `<slug>-brand-kit-<stand>.zip`. */
  filename: string
  /** Immer `true`: das Bündel gibt es auch ohne Preset — dann eben kleiner. */
  available: true
  /** Wie viele Treffer der Abruf auf den Tages-Eimer bucht. */
  weight: number
  /**
   * Wie viele Kacheln der Lieferseite heute leer bleiben — die nicht
   * verfügbaren Registry-Dateien plus die Zeichen als EINE Einheit.
   */
  missing: number
}

/** Der Zustand eines der drei Kit-Kapitel — dieselbe Rechnung wie die Journey. */
export interface BrandKitManifestChapter {
  stepKey: BrandKitStepKey
  state: BrandStepState
}

export interface BrandKitManifest {
  profileId: string
  title: string
  /**
   * ISO-Stempel des jüngsten BETEILIGTEN Kapitels (Foundation, Design und
   * Kit) — er steht in jedem Dateinamen und in jeder Datei. K6 hat ihn von
   * `brandDesignStand` auf `brandKitStand` umgestellt: eine Marke ohne Preset
   * trug sonst gar keinen Stand, obwohl `brand.md` sich mit jedem
   * Foundation-Kapitel ändert.
   */
  stand: string
  /** Der Stand der Foundation allein — für die Auskunft auf der Lieferseite. */
  foundationStand: string
  /** Der Stand der sechs Design-Kapitel allein; '' ohne Preset. */
  designStand: string
  designReady: boolean
  /** Inhaltssprache der Marke — die Dateien sind in IHR geschrieben. */
  contentLocale: string
  files: BrandKitManifestFile[]
  /** Leer ohne Preset. */
  marks: BrandKitManifestMark[]
  bundle: BrandKitManifestBundle
  chapters: BrandKitManifestChapter[]
}

// ── Der Brand Context (§2.6, Paket K3) ────────────────────────────────────

/** Was die zwei Context-Erzeuger ausser der Ansicht brauchen. */
export interface BrandContextInput {
  title: string
  /** Inhaltssprache der Marke — die Datei ist in IHR geschrieben. */
  locale: string
  /** ISO-Stempel; die Datei zeigt daraus das Datum, '' bleibt leer. */
  stand: string
}

/**
 * EIN BLOCK IN `brand.json` — dieselben Arten wie in der Leseansicht, ohne
 * die vier des Kapitels 10 (`locked`, `direction`, `swatches`, `design`).
 *
 * Beschriftungen reisen als SCHLÜSSEL (`labelKey`, `columnKeys`) und nicht als
 * Sätze: die Datei ist maschinenlesbar, und ein Bezeichner überlebt eine
 * Textrunde (Begründung im Kopf von `shared/brandContext.ts`).
 */
export type BrandContextJsonBlock =
  | { kind: 'lead' | 'text', labelKey?: string, text: string }
  | { kind: 'list', labelKey?: string, items: string[] }
  | { kind: 'cards', labelKey?: string, items: { title: string, text: string, note?: string }[] }
  | { kind: 'chips', labelKey?: string, items: { word: string, sample: string }[] }
  | { kind: 'dodont', labelKey?: string, pairs: { doText: string, dontText: string }[] }
  | { kind: 'table', labelKey?: string, columnKeys: string[], rows: string[][] }
  | { kind: 'choice', labelKey?: string, slotId: string, optionIds: string[] }
  /**
   * SEIT K4 (§2.5): `label` ist eine Überschrift, die die MARKE geschrieben
   * hat (die Gruppen von `n.guardrails`) — sie steht wörtlich da, während
   * `labelKey` wie überall der Rahmen ist.
   */
  | { kind: 'rules', labelKey?: string, label?: string, items: { text: string, dont?: string }[] }
  /** Eine kopierbare Vorlage (§2.3 `n.prompts`) — `title` ist Marken-Inhalt. */
  | { kind: 'prompt', labelKey: string, title: string, text: string }
  /** Die Ansprechperson des Pressekits (§2.4 `p.contact`). */
  | { kind: 'contact', name: string, role: string, email: string }
  | { kind: 'aiRules', tone: string[], avoid: string[], stands: string[] }

export interface BrandContextJsonChapter {
  /** Kapitel-Id der Leseansicht — zugleich die Sprungmarke im Book. */
  id: string
  anchor: string
  /** i18n-Schlüssel der Überschrift; aufgelöst wird sie beim LESER. */
  titleKey: string
  blocks: BrandContextJsonBlock[]
}

/**
 * `brand.json` — `schemaVersion` ist die Fassung UNSERES Aufbaus.
 *
 * `design` ist `null`, solange Schicht 2 nicht steht, und sonst das
 * SNAPSHOT-Preset: `BrandDesignSnapshotPreset` kennt `mark.keptDrafts` nicht,
 * die behaltenen KI-Entwürfe können also nicht mitreisen (§1.11 b).
 */
export interface BrandContextJson {
  schemaVersion: 1
  brand: { title: string, locale: string, stand: string }
  foundation: {
    /** Georges Synthese als Text; '' wenn es sie nicht gibt. */
    story: string
    chapters: BrandContextJsonChapter[]
  }
  /** Nur auf dem B2-Weg (§2.20 Nr. 4). */
  nomenclature?: BrandContextJsonChapter
  aiGuidelines?: BrandContextJsonChapter
  presskit?: BrandContextJsonChapter
  design: BrandDesignSnapshotPreset | null
}

// ── `README.md` (§2.6, Paket K3) ──────────────────────────────────────────

/** Eine Zeile der README — dieselbe Auskunft wie im Manifest der Route. */
export interface BrandKitReadmeFile {
  id: BrandKitFileId
  /** Der Dateiname IM BÜNDEL (`tokens.json`), nicht der des Downloads. */
  filename: string
  available: boolean
  reason?: BrandKitFileReason
}

/** Was die README über dieses Bündel weiss. */
export interface BrandKitReadmeManifest {
  title: string
  stand: string
  files: readonly BrandKitReadmeFile[]
  /**
   * Wie viele `marks/*.svg` im Bündel liegen — 0 ohne Preset (K6).
   *
   * Eine ZAHL und keine Liste: die README nennt den Ordner, nicht acht
   * Dateinamen, die sich mit jeder Katalog-Erweiterung ändern.
   */
  marks: number
}

// ── Die Werkstatt-Quellen der dritten Schicht (§2.9, Paket K5) ────────────

/**
 * EINE VORLAGE FÜR DEN PRESSE-KONTAKT (§2.20 Nr. 3).
 *
 * Sie FÜLLT das Formular vor; gespeichert wird immer der bestätigte TEXT
 * (`p.contact`), nie ein Verweis — die Konto-Daten dürfen sich später ändern,
 * ohne das Pressekit still mitzuändern.
 *
 * EINE TELEFONNUMMER GIBT ES HIER NICHT, obwohl die Erstgespräch-Anfrage eine
 * trägt: sie reist nicht (§2.4, Anti-Muster der Session). Das Feld fehlt im
 * Vertrag, damit es auch kein künftiger Aufrufer durchreichen kann.
 */
export interface BrandKitContactTemplate {
  /** `account` = Konto-Inhaber · `intro` = Erstgespräch-Anfrage dieser Marke. */
  id: 'account' | 'intro'
  name: string
  role: string
  email: string
}

/** Eine der drei puren Prompt-Vorlagen (`n.prompts`). */
export interface BrandKitWorkshopPrompt {
  id: string
  title: string
  body: string
}

/**
 * WAS DIE WERKSTATT DER DRITTEN SCHICHT VOM SERVER BRAUCHT — EINE Antwort für
 * alle vier puren Quellen (§2.9, K5).
 *
 * Sie ist eine EIGENTÜMER-Auskunft (`private, no-store`): `facts` sind die
 * Einträge von `a.facts`, und die sind `internal`. Sie erreichen den Browser
 * NUR über diesen Pfad, nie über Share, Publikation oder eine Export-Datei.
 */
export interface BrandKitWorkshopResponse {
  /** Die Inhaltssprache der Marke — in ihr stehen alle Texte hier. */
  locale: string
  /** Die Architektur-Regel (`b2.rule`) für die Vorbefüllung von `m.rules`; '' ohne. */
  architectureRule: string
  /** Die Einträge von `a.facts`, zur Freigabe je Eintrag. Leer heisst „keine". */
  facts: string[]
  /** Die drei Vorlagen, PUR gerechnet (§2.11: null KI-Aufrufe). */
  prompts: BrandKitWorkshopPrompt[]
  /** Vorhandene Ansprechpartner-Daten als wählbare Vorlage; kann leer sein. */
  contactTemplates: BrandKitContactTemplate[]
  /** Die Pressekit-Vorschau als fertiger `structured`-Wert für `p.summary`. */
  summary: string
}
