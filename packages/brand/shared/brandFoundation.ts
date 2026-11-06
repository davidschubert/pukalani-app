import { brandRampDark } from './brandDesign'
import {
  brandColorRoleLabel,
  brandColorRoleNote,
  brandContrastLevelLabel,
  brandContrastPairLabel,
  brandRatioText,
} from './brandDesignColor'
import {
  BRAND_MARK_BRIEF_FIELDS,
  BRAND_MARK_MIN_WIDTH_MM,
  BRAND_MARK_MIN_WIDTH_PX,
  BRAND_MARK_MONOGRAM_MIN_PX,
  brandMarkClearSpaceText,
  brandMarkInitial,
  brandMarkVariantsText,
} from './brandDesignMark'
import {
  BRAND_TYPE_BODY_REM,
  BRAND_TYPE_DEFAULT_RULES,
  brandTypeRulesFromLines,
  brandTypeScaleRatio,
} from './brandDesignType'
import { BRAND_MARK_KINDS, brandTermById, brandTermLabel } from './brandDesignVocab'
import { type BrandDirection, brandDirectionById, BRAND_DIRECTIONS_VERSION } from './brandDirections'
import { brandFontPair } from './brandFontPairs'
import { brandLicenseNote, brandLicenseRows } from './brandKitLicenses'
/*
 * SEIT K5 LIEST DAS BOOK ÜBER DIESELBEN HELFER, DIE DIE WERKSTATT SCHREIBT
 * (§2.18 Zeile K5, „gemeinsame Slot-Format-Helfer für Schreiber UND K4-Leser").
 * Bis K4 stand die Zerlegung der drei Kit-Werte HIER — als einzige Meinung
 * darüber, wie ein Muster, eine Leitplanken-Gruppe und ein Kontakt aussehen.
 * Sie war richtig und trotzdem gefährlich: der Schreiber, der sie hätte
 * bedienen müssen, gab es noch nicht.
 */
import {
  parseBrandGuardrails,
  parseBrandNamePatterns,
  parseBrandPressContact,
  parseBrandPromptTemplates,
} from './brandKitSlots'
import { BRAND_AI_REVIEWS, BRAND_AI_SCOPES, BRAND_NAME_TYPES, type BrandKitTerm } from './brandKitVocab'
import { brandListEntries } from './brandSessions'
import { isBrandSlotShareable } from './brandSharing'
import { type BrandSlotValueView, brandSlotValueView } from './brandSlotFormat'
import {
  BRAND_TOKEN_BODY_WEIGHT,
  BRAND_TOKEN_TYPE_STEPS,
  brandTokenAccentLiftFor,
  brandTokenContrastFor,
  brandTokenRoleHex,
} from './brandTokens'
import { type BrandPathKind, type BrandStepKey, type BrandTeamKind, slotById } from './slotRegistry'
import type { BrandDesignPreset, BrandDesignSnapshotPreset, BrandRampShade } from './types/brand'

/**
 * DER RENDERER DER BRAND FOUNDATION (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.1/§2.2, Paket G1).
 *
 * EINE Quelle, EIN Renderer, ZWEI Ansichten: `/brand/:id/foundation` (privat,
 * Live-Werte) und `/brand/share/:token` (öffentlich, eingefrorener Snapshot)
 * rufen DIESE Funktion. Ein Unterschied zwischen beiden Ansichten ist damit
 * ein Testfall und kein Zufall — deshalb ist die Eingabe wörtlich die Form des
 * `BrandShareSnapshot` und nicht eine bequemere.
 *
 * PUR wie `brandDocument.ts`: kein Appwrite, kein H3, kein i18n. Alles, was
 * ÜBERSETZT werden muss, reist als SCHLÜSSEL (`labelKey`, `titleKey`,
 * `columnKeys`) oder als stabile Id (`element`, `optionIds`) — nie als
 * deutscher Satz. Der Grund ist nicht Reinheit, sondern eine Tatsache des
 * Produkts: die Inhaltssprache der Marke und die Sprache des Handbuchs sind
 * verschieden (die Tagline steht auf Englisch, die Kapitelüberschrift auf
 * Deutsch), und nur die Oberfläche kennt die zweite.
 *
 * ── WAS HIER NIE ERSCHEINT (§2.3/§2.8) ────────────────────────────────────
 * Gefiltert wird nach der REGISTRY, nicht nach dem Inhalt der Eingabe:
 * `isBrandSlotShareable` (= `sessionTravels`, öffentlich UND Festlegung) ist
 * das EINE Tor, durch das jeder Wert muss, bevor irgendein Block ihn sieht.
 * Das ist die Hälfte des Doppelnetzes aus §2.8 — die andere sitzt beim
 * SCHREIBEN in `share.post.ts`. Beide Netze sind nötig, weil jeder heute
 * bestehende Snapshot ALLE bestätigten Werte enthält, Wettbewerber-Namen und
 * Beschwerden eingeschlossen: ein Renderer, der dem Snapshot glaubte, zeigte
 * sie beim ersten Aufruf eines alten Links.
 *
 * ── DIE FORM IST DER ABGENOMMENE KLICKDUMMY ───────────────────────────────
 * Block-Arten und Feldnamen folgen `.playground/app/utils/demoFoundation.ts`
 * (Phase 3, von David gesehen), damit Paket G2 die Komponente `FdChapter.vue`
 * übernehmen kann statt sie nachzubauen. VIER bewusste Abweichungen, jede mit
 * Grund:
 *  1. `label`/`title`/`note` heissen `labelKey`/`titleKey`/`noteKey` — s. o.
 *  2. Der gesperrte Block trägt nur seine Id (`element`); Überschrift, Satz
 *     und Produktname stehen im Locale-Katalog unter
 *     `brand.foundation.visual.<element>`. Fünf deutsche Sätze im Renderer
 *     wären fünf Sätze, die auf der englischen Seite deutsch blieben.
 *  3. NEU ist die Art `choice`: Archetyp und Architektur-Modell sind
 *     GESPEICHERTE Ids (`sage`, `branded-house`). Sie als Text aufzulösen
 *     hiesse, sie in der INHALTSsprache der Marke aufzulösen — der Leser
 *     liest aber in seiner eigenen. Also reisen die Ids, und die Oberfläche
 *     löst sie auf (`brandChoiceDisplayLabel` bzw. `brand.choice.*`).
 *  4. Die gewählte RICHTUNG ist eine eigene Art `direction` statt dreier
 *     Text-Blöcke (Paket G4). Der Dummy schrieb Name, Begründung und
 *     Schriftpaar als fertige Sätze; hier reisen Schlüssel und Familien-Namen,
 *     und die Farbwelt reist als Verlauf — die Oberfläche baut daraus den
 *     Streifen, den der Dummy als Bild hatte.
 *
 * ── WAS NICHT PARSBAR IST, WIRD NICHT VERWORFEN ───────────────────────────
 * Ein Wert kann formfremd sein (ein Mensch hat im Textfeld nachgebessert, ein
 * Bestandswert stammt aus der Zeit vor der Formregel — s. Kopf von
 * `brandSlotFormat.ts`). Dann steht er als `text`-Block da. Ein Handbuch, das
 * eine bestätigte Festlegung verschweigt, weil ihr ein Bindestrich fehlt,
 * wäre schlimmer als eines mit einer ungeordneten Zeile.
 *
 * ── DIE EINE STELLE, AN DER HIER SÄTZE STEHEN (Paket K4, BK1 §2.5) ────────
 * Die drei ANWENDUNGS-Kapitel (`zeichen-`, `farbe-`, `typografie-anwendung`)
 * rechnen Regeln AUS DEM PRESET: den Schutzraum-Satz, die Varianten-Zeile, die
 * Regel „nie Text auf …". Diese Sätze stehen in der INHALTSSPRACHE DER MARKE
 * (`input.contentLocale`) und nicht in der des Lesers — genau wie
 * `mark.brief`, `type.rules` und `imagery.dodont`, die schon im Preset so
 * liegen und hier nur zitiert werden. Die Regel des Kopfes bleibt also
 * wörtlich gültig: was den RAHMEN beschreibt (Kapitelname, Beschriftung,
 * Spaltenkopf), reist als Schlüssel; was die MARKE sagt, steht in ihrer
 * Sprache da. Die zwei Sprachen stehen dafür im Code (`text(locale, de, en)`,
 * dieselbe Auflösung wie in `brandKitLicenses.ts` und `brandContext.ts`) —
 * ein i18n-Modul wäre hier sogar falsch: es antwortete in der Sprache des
 * Browsers, und eine deutsche Marke bekäme im englischen Browser eine
 * englische Farbregel zwischen ihren deutschen Sätzen.
 */

// ── Die Blöcke ──────────────────────────────────────────────────────────────

/** Die fünf Elemente der visuellen Schranke (§2.5) — Ids, keine Texte. */
export const BRAND_FOUNDATION_VISUAL_ELEMENTS = ['logo', 'color', 'typography', 'imagery', 'motion'] as const
export type BrandFoundationVisualElement = (typeof BRAND_FOUNDATION_VISUAL_ELEMENTS)[number]

/**
 * DIE THEMEN HINTER DER SCHRANKE DER ANWENDUNGS-KAPITEL (Paket K4, §2.5) —
 * Ids, keine Texte, wie bei den fünf Elementen darüber.
 *
 * Eine EIGENE Liste und keine Erweiterung von
 * `BRAND_FOUNDATION_VISUAL_ELEMENTS`: die fünf Elemente sind die Abschnitte
 * von Kapitel 10 (eine Fläche, ein Produkt — Brand Design), diese sieben sind
 * das, was das Regelwerk verspricht (drei Flächen, ein anderes Produkt — Book
 * & Kit). Eine gemeinsame Liste hiesse, dass eine Zeile aus dem einen Kapitel
 * versehentlich im anderen stehen kann.
 *
 * Texte im Katalog unter `brand.foundation.usage.<topic>.title` / `.text`.
 */
export const BRAND_FOUNDATION_USAGE_TOPICS = [
  'markClearspace',
  'markVariants',
  'markDonts',
  'colorRoles',
  'colorContrast',
  'typeScale',
  'typeLicense',
] as const
export type BrandFoundationUsageTopic = (typeof BRAND_FOUNDATION_USAGE_TOPICS)[number]

/**
 * WARUM EIN ANWENDUNGS-KAPITEL ZU IST (§2.5, Spalten 4 und 5 der Tabelle).
 *
 * `derivation` = die Ableitung ist für diese Marke nicht freigeschaltet („Book
 * & Kit ist Teil der Ableitung"), `design` = sie IST frei, aber es gibt kein
 * Preset („kommt mit Brand Design"). Zwei Gründe, zwei Sätze, zwei CTAs — ein
 * blosses `locked` zwänge die Oberfläche zu raten, und sie riete falsch: die
 * häufigste Lage ist „freigeschaltet, Design fehlt noch".
 */
export type BrandFoundationLockReason = 'derivation' | 'design'

/**
 * DIE FÜNF ABSCHNITTE DES VOLLEN KAPITELS 10 (Brand Design D8, §2.8).
 *
 * Sie sind SPRUNGMARKEN und deshalb so unveränderlich wie eine Kapitel-Id: das
 * Inhaltsverzeichnis der Leseansicht listet sie als Unterpunkte, und ein
 * verschickter Tieflink (`…/foundation#visuell-farbwelt`) darf nicht ins Leere
 * zeigen. Der Anker ist `visuell-<id>`; die Überschrift steht als
 * `brand.foundation.design.<id>` im Katalog — sie ist Rahmen, nicht
 * Marken-Inhalt, und folgt der Sprache des LESERS.
 *
 * Die Reihenfolge ist die der Kapitel in der Werkstatt (Farbwelt · Typografie ·
 * Zeichen · Bildsprache · Bewegung) — wer das Handbuch liest, liest es in
 * derselben Ordnung, in der es entstanden ist. Die DNA hat bewusst KEINEN
 * eigenen Abschnitt: sie ist die Herleitung, nicht das Ergebnis, und stünde als
 * zehn Vokabular-Zeilen zwischen fünf Vitrinen.
 */
export const BRAND_FOUNDATION_DESIGN_SECTIONS = [
  'farbwelt',
  'typografie',
  'zeichen',
  'bildsprache',
  'bewegung',
] as const
export type BrandFoundationDesignSection = (typeof BRAND_FOUNDATION_DESIGN_SECTIONS)[number]

/**
 * DAS PRESET, WIE ES IN DEN RENDERER KOMMT — beide Fassungen passen hinein.
 *
 * Der private Aufrufer reicht ein `BrandDesignPreset` herein (MIT den Ids der
 * behaltenen Entwürfe), die Share-Seite ein `BrandDesignSnapshotPreset` (OHNE
 * sie). `keptDrafts` ist deshalb optional — und der Renderer macht daraus eine
 * ZAHL (s. `design`-Block): eine Entwurfs-Id hat in einem Handbuch-Block nichts
 * verloren, auch nicht im privaten. Das ist die dritte Masche des Netzes aus
 * §1.11 b, neben Snapshot-Typ und Schreibweg.
 */
export type BrandFoundationDesignInput =
  | BrandDesignPreset
  | BrandDesignSnapshotPreset

/** Ein Block ist die kleinste Darstellungs-Einheit eines Kapitels. */
export type BrandFoundationBlock =
  /** EIN Leitsatz, gross gesetzt (Pitch, Purpose, Tagline, Zeile für die Wand). */
  | { kind: 'lead', text: string, labelKey?: string }
  /**
   * Fliesstext mit optionaler Beschriftung.
   *
   * `markdown` steht NUR an einem Wert, dessen Slot in der Registry
   * `kind: 'richtext'` trägt — heute genau `e.manifesto` (Paket G2). Die
   * Oberfläche schickt einen so markierten Absatz durch den Subset-Parser aus
   * `core/shared/markdown.ts` (vnode-Ausgabe, kein `v-html`, sichere Ziele),
   * jeden anderen als wörtlichen Text. Das Flag ist die einzige Stelle, an der
   * die Herkunft eines Absatzes noch ablesbar ist: nach dem Bauen sind alle
   * Blöcke gleich, und ein Renderer, der ALLES als Markdown läse, machte aus
   * dem Sternchen in einer Tagline eine Kursivierung.
   */
  | { kind: 'text', text: string, labelKey?: string, markdown?: true }
  /** Aufzählung. */
  | { kind: 'list', labelKey?: string, items: string[] }
  /** Karten: Zielgruppen-Segmente, Werte, Boilerplates, Kernbotschaften. */
  | { kind: 'cards', labelKey?: string, items: { title: string, text: string, note?: string }[] }
  /**
   * Ton-Wörter als Chips — je Wort EINE Stimmprobe darunter (§2.2 Kapitel 6).
   * `sample` ist LEER, wo es keine gibt: eine erfundene Probe wäre eine
   * Behauptung darüber, wie die Marke klingt.
   */
  | { kind: 'chips', labelKey?: string, items: { word: string, sample: string }[] }
  /**
   * Do & Don't als Paare (§2.4). Bei ungleich langen Seiten bleibt die andere
   * Hälfte LEER — ein Paar zu erfinden hiesse, der Marke ein Wort in den Mund
   * zu legen, das sie nie gesagt hat.
   */
  | { kind: 'dodont', labelKey?: string, pairs: { doText: string, dontText: string }[] }
  /** Tabelle — die Spaltenköpfe sind Schlüssel, die Zellen sind Markenwerte. */
  | { kind: 'table', labelKey?: string, columnKeys: string[], rows: string[][] }
  /** Gespeicherte Auswahl-Ids (Archetyp, Architektur-Modell) — s. Kopf Nr. 3. */
  | { kind: 'choice', labelKey?: string, slotId: string, optionIds: string[] }
  /**
   * NUMMERIERTE REGELN mit optionalem Gegenbeispiel (Paket K4, §2.5).
   *
   * Nummeriert, weil man sie ZITIERT — „Regel 3" ist im Team eine Adresse
   * (dieselbe Setzung wie im abgenommenen Klickdummy). Das `dont` steht UNTER
   * der Regel und nicht daneben: es ist ihre Begründung, kein zweiter Wert.
   *
   * ZWEI BESCHRIFTUNGEN, ZWEI HERKÜNFTE: `labelKey` ist der RAHMEN
   * („Leitplanken") und reist als Schlüssel; `label` ist eine Überschrift, die
   * die MARKE selbst geschrieben hat (die Gruppen von `n.guardrails`) und
   * steht deshalb wörtlich da — genau wie `cards[].title`. Stehen beide,
   * setzt die Oberfläche sie hintereinander.
   */
  | { kind: 'rules', labelKey?: string, label?: string, items: { text: string, dont?: string }[] }
  /**
   * EINE KOPIERBARE VORLAGE (§2.3 `n.prompts`) — sie wird nicht gelesen,
   * sondern übernommen.
   *
   * `title` ist der Name, den die Marke der Vorlage gegeben hat (Inhalt),
   * `labelKey` das Rahmenwort darüber (Sprache des Lesers). Der Text behält
   * seine Zeilenumbrüche; die Oberfläche setzt ihn in Mono und hängt den
   * Kopieren-Knopf daneben.
   */
  | { kind: 'prompt', labelKey: string, title: string, text: string }
  /**
   * DIE ANSPRECHPERSON DES PRESSEKITS (§2.4 `p.contact`) — Name, Rolle,
   * E-Mail. Drei Felder statt eines Textblocks, weil ein Empfänger genau
   * diese drei sucht und die Oberfläche die Adresse verlinkbar machen können
   * muss.
   */
  | { kind: 'contact', name: string, role: string, email: string }
  /** Die sichtbare Schranke (§2.5) — Texte im Katalog, hier nur die Id. */
  | { kind: 'locked', element: BrandFoundationVisualElement }
  /**
   * DIE SCHRANKE DER ANWENDUNGS-KAPITEL (Paket K4, §2.5) — dieselbe Idee wie
   * `locked`, andere Liste und anderes Produkt (s.
   * `BRAND_FOUNDATION_USAGE_TOPICS`).
   */
  | { kind: 'lockedUsage', topic: BrandFoundationUsageTopic }
  /**
   * DIE GEWÄHLTE RICHTUNG (Paket G4, §2.5) — Kapitel 10, VOR der Schranke.
   *
   * Sie trägt nur Ids und Schlüssel: `directionId` ist der gespeicherte Wert
   * (`result.direction`, zugleich `presetId` im Snapshot), Name und Begründung
   * lösen sich in der Sprache des LESERS auf, die Schriften sind Familien-
   * Namen und CSS-Stacks aus dem Katalog (keine Übersetzung — eine Schrift
   * heisst überall gleich).
   *
   * Das Kapitel bleibt trotzdem `locked`: gewählt ist eine RICHTUNG, gebaut
   * wird sie in Brand Design (§11 d).
   */
  | {
    kind: 'direction'
    directionId: string
    nameKey: string
    reasonKey: string
    fonts: { heading: string, body: string }
    gradient: readonly [string, string, string]
  }
  /**
   * Farbrampe der gewählten Richtung — drei Swatches, TIEF zuerst (Grund vor
   * Fläche). `roleKey` ist ein i18n-Schlüssel und kein Farbname: die drei
   * Rollen beschreiben, WOFÜR die Farbe da ist, und das steht in der Sprache
   * des Lesers. Der Hex-Wert steht daneben, weil ihn jemand abschreibt.
   *
   * Bis G4 erzeugte diese Art niemand (G1 legte sie mit `name`/`role` als
   * Texten an, weil der Klickdummy sie so hatte); mit dem ersten echten
   * Erzeuger sind daraus Schlüssel geworden.
   */
  | { kind: 'swatches', labelKey?: string, items: { hex: string, roleKey: string }[] }
  /**
   * DAS VOLLE KAPITEL 10 (Brand Design D8, §2.8) — EIN Block, keine sechs.
   *
   * ── WARUM EIN BLOCK UND NICHT SECHS BLOCK-ARTEN ──────────────────────────
   * Kapitel 10 ist nach Brand Design kein Text mehr, sondern eine VITRINE:
   * Farbflächen, Schriftproben, SVG-Setzungen, eine Token-Tabelle. Sechs neue
   * Block-Arten hier würden den Renderer der elf anderen Kapitel für dieses
   * eine umbauen — dieselbe Begründung, mit der der abgenommene Prototyp
   * `FdDesignChapter` neben `FdChapter` stellte. Der Block trägt das PRESET,
   * die Oberfläche zeichnet daraus.
   *
   * ── ER TRÄGT NIE EINE ENTWURFS-ID ────────────────────────────────────────
   * `keptDrafts` ist eine ZAHL. Kapitel 10 nennt die behaltenen KI-Entwürfe
   * (§1.11 b: „n behaltene Entwürfe — privat"), zeigt sie aber nicht und
   * verlinkt sie nicht: sie liegen hinter einer Besitzer-Route mit
   * `no-store`, und eine Id in einem Block, der auch als Snapshot eingefroren
   * wird, wäre der erste Schritt aus dieser Zusage heraus.
   *
   * `title` ist der Markenname für die Wortmarke im Board — er steht schon in
   * `BrandFoundationInput.title`, hier aber noch einmal, weil ein Block für
   * sich allein renderbar sein muss (das Ergebnis-Board `/brand/:id/design`
   * hat kein Kapitel um sich herum).
   */
  | {
    kind: 'design'
    preset: BrandDesignSnapshotPreset
    title: string
    keptDrafts: number
  }
  /**
   * Der FESTE Rahmen der KI-Regeln (§2.4): „Schreibt in diesem Ton · Vermeidet
   * · Steht für" — gefüllt aus vorhandenen Werten. Keine Generierung, kein
   * Cache; das Kapitel ist so aktuell wie die Werte darüber.
   */
  | { kind: 'aiRules', tone: string[], avoid: string[], stands: string[] }

// ── Die Kapitel ─────────────────────────────────────────────────────────────

/**
 * DIE REIHENFOLGE DER KAPITEL (§2.2) — die Id ist zugleich die Sprungmarke
 * (`#stimme`), und die trägt auch im geteilten Link (§1.5). Sie sind deshalb
 * so unveränderlich wie eine Slot-Id: ein verschickter Tieflink darf nicht
 * ins Leere zeigen.
 */
/*
 * SEIT K0 STEHEN FÜNF ANKER MEHR DARIN (Konzept BRAND-BOOK-KIT.md §2.5) —
 * ADDITIV und an ihrem endgültigen Platz: `nomenklatur` hinter `architektur`,
 * die drei Anwendungs-Kapitel hinter `visuell`, `pressekit` vor `ki-texte`.
 * `ki-texte` bleibt, wo und wie es heisst (§2.20 Nr. 6: der Anker ist ein
 * Vertrag, nur sein TITEL wird nach Abnahme von `aiguide` zu „AI-Guidelines").
 *
 * IN K0 BAUT DER RENDERER FÜR SIE NOCH KEINE BLÖCKE — ein Kapitel ohne Blöcke
 * wird ohnehin gefiltert (s. `buildBrandFoundation`), es erscheint also
 * nirgends. Die Ids stehen trotzdem schon hier, weil sie der VERTRAG sind:
 * Reihenfolge und Sprungmarken werden einmal festgelegt, nicht in dem Paket,
 * das zufällig als erstes einen Block dafür schreibt (K4).
 */
export const BRAND_FOUNDATION_CHAPTER_IDS = [
  'story',
  'kontext',
  'purpose',
  'positionierung',
  'architektur',
  'nomenklatur',
  'werte',
  'stimme',
  'manifest',
  'messaging',
  'name',
  'visuell',
  'zeichen-anwendung',
  'farbe-anwendung',
  'typografie-anwendung',
  'pressekit',
  'ki-texte',
] as const
export type BrandFoundationChapterId = (typeof BRAND_FOUNDATION_CHAPTER_IDS)[number]

export interface BrandFoundationChapter {
  readonly id: BrandFoundationChapterId
  /** Stabile Sprungmarke — heute identisch mit der Id (s. o.). */
  readonly anchor: string
  readonly titleKey: string
  /**
   * `locked` = die Schranke (§2.5). `pending` erzeugt G1 NICHT: ob ein Kapitel
   * abgenommen ist, weiss nur die private Ansicht (der Snapshot enthält
   * ohnehin nur Bestätigtes) — sie darf den Zustand setzen, der Renderer
   * kennt die Frage nicht.
   */
  readonly state: 'done' | 'pending' | 'locked'
  /**
   * NUR an einem `locked`-Kapitel der Schicht 3 (Paket K4) — Kapitel 10 hat
   * seinen Grund im Block (`locked`) und braucht keinen zweiten.
   */
  readonly lockReason?: BrandFoundationLockReason
  readonly blocks: readonly BrandFoundationBlock[]
}

export interface BrandFoundationView {
  readonly chapters: readonly BrandFoundationChapter[]
}

/**
 * WELCHES KAPITEL DER WERKSTATT FÜLLT WELCHES KAPITEL DES HANDBUCHS (G2).
 *
 * Die private Ansicht darf sagen „noch nicht abgenommen" (§2.6) — dafür muss
 * sie ein Handbuch-Kapitel auf die Kapitel zurückrechnen, in denen abgenommen
 * WIRD. Der Renderer selbst kann das nicht: er kennt die Abnahme nicht (s.
 * `state` oben), und nach dem Bauen steht an keinem Block mehr, aus welcher
 * Session er kam.
 *
 * GEPFLEGT, nicht gerechnet: eine Ableitung aus den Slot-Ids im Renderer wäre
 * eine zweite Wahrheit, die bei jedem neuen Block still veraltet. Der Test
 * nagelt dafür fest, dass JEDE Kapitel-Id einen Eintrag hat und jeder Eintrag
 * ein echtes Kapitel nennt.
 *
 * ZWEI LEERE EINTRÄGE, beide mit Grund: `story` hängt am Profil (Georges
 * Synthese, sie wird nicht abgenommen), und `visuell` ist die Schranke — sie
 * kann nicht offen sein, weil es dort nichts zu bestätigen gibt.
 */
export const BRAND_FOUNDATION_SOURCE_STEPS: Readonly<
  Record<BrandFoundationChapterId, readonly BrandStepKey[]>
> = {
  story: [],
  kontext: ['context'],
  purpose: ['pvm'],
  positionierung: ['pvm'],
  architektur: ['architecture'],
  // Schicht 3 (K0): die Nomenklatur wird im Kapitel `nomenclature` abgenommen —
  // sie liegt nur auf dem B2-Weg (§2.20 Nr. 4), und ein Kapitel, das nicht auf
  // dem Weg liegt, zählt hier ohnehin nicht als offen (s. Kopf).
  nomenklatur: ['nomenclature'],
  werte: ['values'],
  /**
   * NUR `archetype` (Davids Entscheidung 2026-09-09, Befund 12).
   *
   * Bis hierher stand hier `['archetype', 'verbal']`, weil der WORT-LEITFADEN
   * (`ep.vocabulary`, die Do-&-Don't-Seite) im Stimme-Kapitel gerendert wurde.
   * In der Leseansicht hiess das: wer den Archetyp abgenommen hatte, las
   * trotzdem „noch nicht abgenommen" an „Persönlichkeit & Stimme" — und der
   * Vermerk sprang in ein Kapitel, das mit Archetyp, Ziel-Gefühl, Ton-Wörtern
   * und Stimmproben nichts zu tun hat. Der Leitfaden ist mit demselben Schritt
   * ins MESSAGING-Kapitel gewandert (s. `messagingBlocks`), also wartet die
   * Stimme auch nicht mehr auf ihn.
   */
  stimme: ['archetype'],
  manifest: ['manifesto'],
  messaging: ['verbal'],
  name: ['naming'],
  visuell: [],
  /*
   * DIE DREI ANWENDUNGS-KAPITEL zeigen dasselbe Preset wie `visuell`, nur eine
   * Zoomstufe tiefer (§2.5: Kapitel 10 ist die Vitrine, die Anwendung das
   * Regelwerk). Sie nennen trotzdem ihr EIGENES Quell-Kapitel und nicht wie
   * `visuell` gar keines: dort ist die Schranke, an der nichts zu bestätigen
   * ist — hier weiss man genau, welches Werkstatt-Kapitel die Regeln füllt,
   * und der Vermerk „noch nicht abgenommen" springt dann auch dorthin.
   */
  'zeichen-anwendung': ['mark'],
  'farbe-anwendung': ['color'],
  'typografie-anwendung': ['type'],
  pressekit: ['presskit'],
  /*
   * Der KI-Rahmen ist eine Zusammenfassung dreier Kapitel — solange eines
   * davon offen ist, kann sich sein Inhalt noch ändern. SEIT K4 steht
   * `aiguide` daneben (§2.5): das Kapitel rendert jetzt die Guidelines statt
   * des festen Rahmens, sobald sie bestätigt sind — also darf es auch auf sie
   * warten. Es steht ZULETZT, weil `brandFoundationPendingStep` das ERSTE
   * offene Quell-Kapitel als Sprungziel nimmt: wer den Rahmen noch nicht
   * stehen hat, soll dorthin und nicht in eine Schicht, die er erst danach
   * betritt.
   */
  'ki-texte': ['values', 'archetype', 'verbal', 'aiguide'],
}

/**
 * DAS ERSTE QUELL-KAPITEL, DAS NOCH NICHT ABGENOMMEN IST — `null`, wenn alle
 * stehen. Es ist zugleich das Sprungziel des Vermerks „Zur Abnahme" (§2.6).
 *
 * Übergeben werden die Kapitel DIESES Brandings; ein Quell-Kapitel, das nicht
 * darin vorkommt, liegt nicht auf dem Weg (übersprungenes Naming) und zählt
 * deshalb NICHT als offen — seine Werte fehlen dem Renderer ohnehin, das
 * Handbuch-Kapitel entfällt dann ganz.
 */
export function brandFoundationPendingStep(
  chapterId: BrandFoundationChapterId,
  steps: readonly { readonly stepKey: BrandStepKey, readonly accepted: boolean }[],
): BrandStepKey | null {
  for (const stepKey of BRAND_FOUNDATION_SOURCE_STEPS[chapterId]) {
    const step = steps.find(candidate => candidate.stepKey === stepKey)
    if (step && !step.accepted) return stepKey
  }
  return null
}

/**
 * Die Eingabe ist die Form des `BrandShareSnapshot` (shared/types/brand.ts) —
 * ein Snapshot passt ohne Umformung hinein, die private Ansicht baut dieselbe
 * Form aus den Live-Werten.
 */
export interface BrandFoundationInput {
  readonly title: string
  readonly contentLocale: string
  /** Georges Synthese; `null`/leer ⇒ Kapitel 0 entfällt (nichts wird erzeugt). */
  readonly story: string | null
  readonly chapters: readonly {
    readonly stepKey: BrandStepKey
    readonly slots: readonly { readonly slotId: string, readonly value: string }[]
  }[]
  /**
   * Die beiden Weichen reisen mit, WEIL sie zur Marke gehören — gelesen wird
   * heute keine von beiden: kein Kapitel formuliert je nach Pfad anders. Sie
   * stehen hier, damit ein Kapitel, das das später täte, die Signatur nicht
   * ändern muss.
   */
  readonly pathKind?: BrandPathKind
  readonly team?: BrandTeamKind
  /**
   * DIE GEWÄHLTE RICHTUNG (Paket G4) — additiv, `undefined` heisst „keine".
   *
   * ── WOHER SIE KOMMT, UND WARUM SIE NICHT IN `chapters` STEHT ────────────
   * Die WAHRHEIT ist der bestätigte Slot-Wert `result.direction`. Er reist
   * aber nicht als gewöhnlicher Wert: `result.direction` ist
   * `audience: 'internal'` (Registry), fällt also durch das eine Tor
   * (`travellingValues`) — und das ist Absicht, denn Kapitel 10 rendert ihn
   * GESONDERT als Farbwelt und Schriftpaar, nicht als Textzeile in einer
   * Liste. Die Route bzw. die Share-Seite reicht ihn deshalb hier herein.
   *
   * `version` ist eine ZEICHENKETTE, weil sie aus dem Snapshot kommt
   * (`presetVersion`), und der ist ein JSON-Abbild von Spalten. Passt sie
   * nicht zu `BRAND_DIRECTIONS_VERSION` — oder ist die Id unbekannt —, rendert
   * das Kapitel, als wäre nichts gewählt: lieber die ehrliche Schranke als
   * eine Farbwelt, die inzwischen eine andere ist als die, die jemand
   * verschickt hat.
   */
  readonly direction?: { readonly id: string, readonly version: string }
  /**
   * DAS ERGEBNIS VON BRAND DESIGN (Paket D8, §2.8) — additiv, `undefined`
   * heisst „Schicht 2 ist für diese Marke nicht (fertig) gelaufen".
   *
   * Steht es, wird Kapitel 10 VOLL und `done`: die Schranke fällt, die
   * gewählte Richtung tritt zurück (sie war die Ansage, das Preset ist die
   * Ausführung). Steht es nicht, bleibt alles wie in G4 — Richtung plus
   * Schranke.
   *
   * Es kommt wie die Richtung von AUSSEN und nicht aus `chapters`: die
   * Slot-Werte der sechs Design-Kapitel sind `audience: 'internal'` bzw. Ids
   * eines Vokabulars und fielen durch das eine Tor. Gerechnet wird es aus
   * genau diesen Werten — `brandDesignPresetFromSlots` (privat) bzw. der
   * eingefrorene Snapshot (`BrandShareSnapshot.design`).
   */
  readonly design?: BrandFoundationDesignInput
  /**
   * IST DIE ABLEITUNG FÜR DIESE MARKE FREIGESCHALTET? (Paket K4, §2.5/§2.8)
   *
   * Drei Werte, nicht zwei — und der dritte ist der Punkt:
   *  · `true`  ⇒ die drei Anwendungs-Kapitel stehen. MIT Preset voll, ohne
   *              Preset als Schranke mit dem Grund `design`.
   *  · `false` ⇒ sie stehen als Schranke mit dem Grund `derivation`
   *              („Book & Kit ist Teil der Ableitung").
   *  · fehlt   ⇒ SIE STEHEN GAR NICHT — der Aufrufer weiss es nicht.
   *
   * Der dritte Fall ist der SNAPSHOT (`/brand/share/:token`): ein
   * eingefrorenes Abbild trägt keine Aussage über den heutigen Zustand des
   * Kontos, sondern nur über den damaligen INHALT. Eine Schranke daraus zu
   * bauen hiesse, in das Handbuch einer fremden Marke drei Kapitel Werbung zu
   * setzen, deren Aussage der Leser nicht nachprüfen kann. Die Share-Seite
   * reicht deshalb `true` NUR mit eingefrorenem Preset herein (dann sind die
   * Kapitel voll und wahr) und sonst gar nichts.
   *
   * Gerechnet wird die Freischaltung hier NICHT: `resolveDerivationAccess`
   * (Beta ODER Feld) ist die eine Regel dafür, und sie braucht Kontowissen,
   * das ein purer Renderer nicht hat — dieselbe Arbeitsteilung wie bei
   * `direction` und `design`.
   */
  readonly derivationUnlocked?: boolean
}

// ── Schlüssel-Konventionen ──────────────────────────────────────────────────

const LABEL = 'brand.foundation.label'
const COLUMN = 'brand.foundation.column'

function chapterTitleKey(id: BrandFoundationChapterId): string {
  return `brand.foundation.chapter.${id}`
}

// ── Werte lesen ─────────────────────────────────────────────────────────────

/**
 * DAS EINE TOR. Nur reisefähige, nicht leere Werte kommen dahinter — jeder
 * Block-Bauer unten sieht ausschliesslich diese Karte, und keiner von ihnen
 * kann die Frage „darf das hier stehen?" noch einmal falsch beantworten.
 *
 * Der stepKey der Eingabe wird bewusst NICHT geprüft: welchem Kapitel ein
 * Wert gehört, sagt die Registry (`slotById`), nicht die Zeile, in der er
 * eingefroren wurde.
 */
function travellingValues(input: BrandFoundationInput): Map<string, string> {
  const values = new Map<string, string>()
  for (const chapter of input.chapters) {
    for (const slot of chapter.slots) {
      if (!isBrandSlotShareable(slot.slotId)) continue
      const value = slot.value.trim()
      if (value.length === 0) continue
      values.set(slot.slotId, value)
    }
  }
  return values
}

/** Die Lese-Form eines Wertes nach seiner Art — `null`, wenn es ihn nicht gibt. */
function viewOf(values: Map<string, string>, slotId: string): BrandSlotValueView | null {
  const value = values.get(slotId)
  if (value === undefined) return null
  const kind = slotById(slotId)?.schema.kind ?? 'text'
  return brandSlotValueView(kind, value)
}

/** Der rohe Wert — für alles, was als ein Stück Text stehen bleibt. */
function textOf(values: Map<string, string>, slotId: string): string | null {
  return values.get(slotId) ?? null
}

/**
 * Führendes Aufzählungszeichen weg. Dieselbe Zeichenmenge wie
 * `stripListMarker` in `brandSessions.ts` — die ist dort nicht exportiert, und
 * ein Export nur für diesen Fall zöge eine zweite öffentliche Zusage nach
 * sich.
 */
const LIST_MARKER = /^(?:[-–—*•·]\s+|\d{1,2}[.)]\s+)/u

/**
 * EINTRÄGE EINER SATZ-LISTE (gelebte Beispiele, Definitionen, Stimmproben,
 * Namen): eine ZEILE ist ein Eintrag, mehr nicht.
 *
 * Bewusst NICHT `brandListEntries`: das schneidet eine EINZELNE Zeile
 * zusätzlich an Kommas — richtig für „Geduld, Klarheit und Ruhe", falsch für
 * „im März haben wir ein Angebot abgelehnt, und zwar öffentlich". Hier zählt
 * die zweite Sorte.
 */
function sentenceEntries(view: BrandSlotValueView | null): string[] {
  if (!view) return []
  if (view.kind === 'list') return view.items.filter(item => item.length > 0)
  if (view.kind === 'blocks') return view.blocks.map(block => block.body).filter(body => body.length > 0)
  return view.text
    .split('\n')
    .map(line => line.trim().replace(LIST_MARKER, '').trim())
    .filter(line => line.length > 0)
}

/**
 * EINTRÄGE EINER WORT-LISTE (Werte, Ton-Wörter): hier ist die tolerante
 * Lesart des Layers richtig — „Geduld, Unbestechlichkeit und Klarheit" in
 * EINE Zeile getippt sind drei Werte, und genau so tippt ein Mensch in ein
 * Chips-Feld (s. Kopf von `brandListEntries`).
 */
function wordEntries(view: BrandSlotValueView | null, raw: string | null): string[] {
  if (view?.kind === 'list') return view.items.filter(item => item.length > 0)
  return raw ? brandListEntries(raw) : []
}

/** „Wort — Bedeutung" auseinandernehmen. `null`, wenn die Zeile kein Paar ist. */
function splitLabelled(entry: string): { label: string, body: string } | null {
  const match = entry.match(/^(.{1,60}?)\s*(?:—|–|:|\s-\s)\s*(.+)$/su)
  if (!match) return null
  const label = match[1]!.trim()
  const body = match[2]!.trim()
  if (label.length === 0 || body.length === 0) return null
  return { label, body }
}

/** Vergleichsform eines Wertwortes — Gross/Klein und Schlusspunkt zählen nicht. */
function comparable(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?]+$/u, '')
}

// ── Der Wort-Leitfaden (§2.4) ───────────────────────────────────────────────

interface VocabularySides {
  use: string[]
  avoid: string[]
  /** Zeilen ohne Seiten-Marke — sie gehen nie verloren (s. Kopf). */
  rest: string[]
}

/**
 * Die beiden Seiten des Wort-Leitfadens. Die Form steht in der Session-Regel
 * von `d.vocabulary`/`ep.vocabulary`: „- use: <Wort>" bzw. „- avoid: <Wort>",
 * auf Deutsch „- benutzen:" / „- meiden:".
 *
 * BEIDE Sessions tragen BEIDE Seiten — `ep.vocabulary` ist die aus
 * `d.vocabulary` abgeleitete Alltagsfassung. Die Zuordnung „ep = Do, d =
 * Don't" aus dem Konzept beschreibt die WIRKUNG, nicht das Speicherformat;
 * gelesen wird deshalb, was dasteht.
 */
const VOCABULARY_USE = /^(?:use|benutzen|nutzen|verwenden)\s*:\s*/iu
const VOCABULARY_AVOID = /^(?:avoid|meiden|vermeiden|nie|never)\s*:\s*/iu

function vocabularySides(view: BrandSlotValueView | null): VocabularySides {
  const sides: VocabularySides = { use: [], avoid: [], rest: [] }
  for (const entry of sentenceEntries(view)) {
    if (VOCABULARY_USE.test(entry)) sides.use.push(entry.replace(VOCABULARY_USE, '').trim())
    else if (VOCABULARY_AVOID.test(entry)) sides.avoid.push(entry.replace(VOCABULARY_AVOID, '').trim())
    else sides.rest.push(entry)
  }
  return sides
}

/**
 * DIE MEIDEN-SEITE EINES WORT-LEITFADENS, aus dem ROHEN Wert — der EINE Leser
 * dafür (K5).
 *
 * Sie steht hier und nicht beim Aufrufer, weil die FORM hier steht: die zwei
 * Regeln oben kennen beide Sprachen und beide Schreibweisen. Nikas Prüfung
 * (`n.guardrails`: „kein Tabu-Wort in den Ton-Parametern") braucht genau diese
 * Liste, und eine zweite Zerlegung im Server-Plugin wäre eine zweite Meinung
 * darüber, was ein Tabu ist — mit dem Ergebnis, dass die Prüfung Wörter
 * durchliesse, die im Handbuch als verboten stehen.
 */
export function brandVocabularyAvoidWords(value: string): string[] {
  if (!value.trim()) return []
  return vocabularySides(brandSlotValueView('list', value)).avoid
}

/** Zweite Liste anhängen, ohne Dubletten — der Leitfaden leitet aus dem Tabu ab. */
function mergeWords(first: readonly string[], second: readonly string[]): string[] {
  const seen = new Set(first.map(comparable))
  const merged = [...first]
  for (const word of second) {
    if (seen.has(comparable(word))) continue
    seen.add(comparable(word))
    merged.push(word)
  }
  return merged
}

// ── Kleine Block-Bauer ──────────────────────────────────────────────────────

function leadBlock(text: string | null, labelKey: string): BrandFoundationBlock[] {
  return text ? [{ kind: 'lead', text, labelKey }] : []
}

function textBlock(text: string | null, labelKey: string): BrandFoundationBlock[] {
  return text ? [{ kind: 'text', text, labelKey }] : []
}

/**
 * Beschriftete Blöcke werden Karten (Zielgruppen, Boilerplates,
 * Kernbotschaften). Hält der Wert die Form nicht ein, steht er als EIN
 * Textblock da — nie gar nicht.
 */
function blocksAsCards(
  view: BrandSlotValueView | null,
  labelKey: string,
): BrandFoundationBlock[] {
  if (!view) return []
  if (view.kind === 'text') return textBlock(view.text, labelKey)
  if (view.kind === 'list') return [{ kind: 'list', labelKey, items: view.items }]
  return [{
    kind: 'cards',
    labelKey,
    items: view.blocks.map(block => ({ title: block.label, text: block.body })),
  }]
}

/** Dieselbe Form als Tabelle (Namens-Prüfung, Kriterien). */
function blocksAsTable(
  view: BrandSlotValueView | null,
  labelKey: string,
  columnKeys: readonly string[],
): BrandFoundationBlock[] {
  if (!view) return []
  if (view.kind === 'text') return textBlock(view.text, labelKey)
  if (view.kind === 'list') return [{ kind: 'list', labelKey, items: view.items }]
  return [{
    kind: 'table',
    labelKey,
    columnKeys: [...columnKeys],
    rows: view.blocks.map(block => [block.label, block.body]),
  }]
}

/** Auswahl-Ids eines Slots — leer, wenn der Wert fehlt (s. Kopf Nr. 3). */
function choiceBlock(
  values: Map<string, string>,
  labelKey: string,
  slotIds: readonly string[],
): BrandFoundationBlock[] {
  const primary = slotIds[0]
  if (primary === undefined) return []
  const optionIds = slotIds.map(slotId => values.get(slotId)).filter((value): value is string => Boolean(value))
  if (optionIds.length === 0) return []
  return [{ kind: 'choice', labelKey, slotId: primary, optionIds }]
}

// ── Die Kapitel-Bauer ───────────────────────────────────────────────────────

/**
 * Kapitel 0 — die Brand Story. Der erste Absatz trägt als Leitsatz, der Rest
 * ist Fliesstext; ohne Story entfällt das Kapitel (§2.2: „kein Erzeugen beim
 * Lesen").
 */
function storyBlocks(story: string | null): BrandFoundationBlock[] {
  const paragraphs = (story ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
  if (paragraphs.length === 0) return []
  const [first, ...rest] = paragraphs
  return [
    { kind: 'lead', text: first! },
    ...rest.map((text): BrandFoundationBlock => ({ kind: 'text', text })),
  ]
}

/** Kapitel 5 — je Wert Definition und gelebtes Beispiel (§2.2). */
function valueBlocks(values: Map<string, string>): BrandFoundationBlock[] {
  const chosen = wordEntries(viewOf(values, 'c.final'), textOf(values, 'c.final'))
  const definitions = sentenceEntries(viewOf(values, 'c.definitions'))
  const examples = sentenceEntries(viewOf(values, 'c.livedExamples'))

  const byWord = (entries: readonly string[]): Map<string, string> => {
    const map = new Map<string, string>()
    for (const entry of entries) {
      const pair = splitLabelled(entry)
      if (pair) map.set(comparable(pair.label), pair.body)
    }
    return map
  }
  const definitionOf = byWord(definitions)
  const exampleOf = byWord(examples)
  const usedDefinitions = new Set<string>()
  const usedExamples = new Set<string>()

  const cards = chosen.map((word) => {
    const key = comparable(word)
    const definition = definitionOf.get(key)
    const example = exampleOf.get(key)
    if (definition !== undefined) usedDefinitions.add(key)
    if (example !== undefined) usedExamples.add(key)
    return { title: word, text: definition ?? '', ...(example ? { note: example } : {}) }
  })

  const blocks: BrandFoundationBlock[] = []
  if (cards.length > 0) blocks.push({ kind: 'cards', labelKey: `${LABEL}.values`, items: cards })

  // WAS SICH NICHT ZUORDNEN LIESS, BLEIBT SICHTBAR: eine Definition zu einem
  // Wort, das nicht in der Endauswahl steht (oder eine Zeile ohne Bindestrich),
  // ist eine bestätigte Festlegung — sie verschwindet nicht, nur weil die
  // Zuordnung nicht aufging.
  const leftover = (entries: readonly string[], used: Set<string>): string[] =>
    entries.filter((entry) => {
      const pair = splitLabelled(entry)
      return !pair || !used.has(comparable(pair.label))
    })

  const restDefinitions = cards.length > 0 ? leftover(definitions, usedDefinitions) : definitions
  const restExamples = cards.length > 0 ? leftover(examples, usedExamples) : examples
  if (restDefinitions.length > 0) {
    blocks.push({ kind: 'list', labelKey: `${LABEL}.definitions`, items: restDefinitions })
  }
  if (restExamples.length > 0) {
    blocks.push({ kind: 'list', labelKey: `${LABEL}.livedExamples`, items: restExamples })
  }

  blocks.push(...textBlock(textOf(values, 'c.conflictRule'), `${LABEL}.conflictRule`))
  blocks.push(...textBlock(textOf(values, 'c.teamFilter'), `${LABEL}.teamFilter`))
  return blocks
}

/**
 * Kapitel 6 — Archetyp, Ziel-Gefühl, Ton-Wörter mit Probe (§2.2).
 *
 * DER WORT-LEITFADEN STEHT SEIT DEM 2026-09-09 IM MESSAGING-KAPITEL (Befund
 * 12, Davids Entscheidung): Do & Don't sind der Wortschatz, mit dem die Marke
 * SCHREIBT — sie gehören zu Tagline, Boilerplates und Kernbotschaften. Solange
 * sie hier standen, hing das Stimme-Kapitel an zwei Werkstatt-Kapiteln und
 * blieb offen, obwohl der Archetyp längst abgenommen war.
 */
function voiceBlocks(values: Map<string, string>): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  blocks.push(...choiceBlock(values, `${LABEL}.archetype`, ['d.primary', 'd.secondary']))
  blocks.push(...textBlock(textOf(values, 'd.emotion'), `${LABEL}.emotion`))

  const toneWords = wordEntries(viewOf(values, 'd.toneWords'), textOf(values, 'd.toneWords'))
  const samples = sentenceEntries(viewOf(values, 'd.voiceSamples'))
  if (toneWords.length > 0) {
    blocks.push({
      kind: 'chips',
      labelKey: `${LABEL}.toneWords`,
      items: toneWords.map((word, index) => ({ word, sample: samples[index] ?? '' })),
    })
  }
  // Mehr Proben als Ton-Wörter: die übrigen stehen für sich. Eine Probe ist
  // ein bestätigter Satz der Marke — sie fällt nicht weg, weil die Chip-Reihe
  // kürzer ist.
  const restSamples = toneWords.length > 0 ? samples.slice(toneWords.length) : samples
  if (restSamples.length > 0) {
    blocks.push({ kind: 'list', labelKey: `${LABEL}.voiceSamples`, items: restSamples })
  }
  return blocks
}

/**
 * DER WORT-LEITFADEN (§2.4) — Do & Don't als Paare, dazu die Zeilen ohne
 * Seiten-Marke.
 *
 * Eigene Funktion seit Befund 12: er hat das Kapitel gewechselt (Stimme →
 * Messaging), und ein Umzug ist leichter zu lesen, wenn dabei kein Code
 * umgeschrieben wird. Bei ungleich langen Seiten bleibt die andere Hälfte LEER
 * — ein erfundenes Paar legte der Marke ein Wort in den Mund.
 */
function vocabularyBlocks(guide: VocabularySides): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  const pairCount = Math.max(guide.use.length, guide.avoid.length)
  if (pairCount > 0) {
    blocks.push({
      kind: 'dodont',
      labelKey: `${LABEL}.doDont`,
      pairs: Array.from({ length: pairCount }, (_unused, index) => ({
        doText: guide.use[index] ?? '',
        dontText: guide.avoid[index] ?? '',
      })),
    })
  }
  if (guide.rest.length > 0) {
    blocks.push({ kind: 'list', labelKey: `${LABEL}.vocabulary`, items: guide.rest })
  }
  return blocks
}

/** Kapitel 9 — Top drei und die Prüf-Tabelle (§2.2). */
function nameBlocks(values: Map<string, string>): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  const decision = viewOf(values, 'f.decision')
  if (decision) {
    if (decision.kind === 'blocks') {
      blocks.push(...blocksAsTable(decision, `${LABEL}.nameDecision`, [`${COLUMN}.name`, `${COLUMN}.note`]))
    }
    else {
      const names = sentenceEntries(decision)
      // Die Reihenfolge IST die Aussage („Erstwahl zuerst", Session-Ziel von
      // `f.decision`) — deshalb eine Tabelle mit Rang und nicht eine Liste.
      if (names.length > 0) {
        blocks.push({
          kind: 'table',
          labelKey: `${LABEL}.nameDecision`,
          columnKeys: [`${COLUMN}.rank`, `${COLUMN}.name`],
          rows: names.map((name, index) => [String(index + 1), name]),
        })
      }
    }
  }
  blocks.push(...blocksAsTable(
    viewOf(values, 'f.checks'),
    `${LABEL}.nameChecks`,
    [`${COLUMN}.name`, `${COLUMN}.check`],
  ))
  blocks.push(...blocksAsTable(
    viewOf(values, 'f.criteria'),
    `${LABEL}.nameCriteria`,
    [`${COLUMN}.name`, `${COLUMN}.criteria`],
  ))
  return blocks
}

/**
 * Kapitel 8 — Tagline, Boilerplates, Kernbotschaften und seit Befund 12 der
 * WORT-LEITFADEN (§2.2/§2.4).
 *
 * Er steht NACH den Kernbotschaften und VOR dem verbalen Erkennungszeichen:
 * erst was die Marke sagt, dann mit welchen Wörtern sie es sagt.
 */
function messagingBlocks(values: Map<string, string>, guide: VocabularySides): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  const taglines = sentenceEntries(viewOf(values, 'ep.taglines'))
  if (taglines.length === 1) blocks.push({ kind: 'lead', text: taglines[0]!, labelKey: `${LABEL}.tagline` })
  else if (taglines.length > 1) blocks.push({ kind: 'list', labelKey: `${LABEL}.tagline`, items: taglines })

  blocks.push(...blocksAsCards(viewOf(values, 'ep.boilerplates'), `${LABEL}.boilerplates`))
  blocks.push(...blocksAsCards(viewOf(values, 'ep.keyMessages'), `${LABEL}.keyMessages`))
  blocks.push(...vocabularyBlocks(guide))
  blocks.push(...textBlock(textOf(values, 'ep.distinctiveAsset'), `${LABEL}.distinctiveAsset`))
  return blocks
}

/** Kapitel 7 — Manifest als Fliesstext, Zeile für die Wand hervorgehoben. */
function manifestoBlocks(values: Map<string, string>): BrandFoundationBlock[] {
  const manifesto = textOf(values, 'e.manifesto')
  const blocks: BrandFoundationBlock[] = (manifesto ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    // `e.manifesto` ist der EINZIGE `richtext`-Slot der Registry (s. Flag am
    // `text`-Block) — nur seine Absätze reisen als Markdown.
    .map((text): BrandFoundationBlock => ({ kind: 'text', text, markdown: true }))
  blocks.push(...leadBlock(textOf(values, 'e.anchorLine'), `${LABEL}.anchorLine`))
  blocks.push(...textBlock(textOf(values, 'e.composition'), `${LABEL}.composition`))
  return blocks
}

/**
 * DIE GEWÄHLTE RICHTUNG AUFLÖSEN — `null` bei unbekannter Id ODER fremder
 * Fassung (s. `BrandFoundationInput.direction`). Beides ist derselbe Fall:
 * „ich weiss nicht, was hier gemeint war", und darauf gibt es genau eine
 * ehrliche Antwort — die Schranke ohne Richtung.
 */
function resolveDirection(input: BrandFoundationInput): BrandDirection | null {
  const chosen = input.direction
  if (!chosen || chosen.version !== String(BRAND_DIRECTIONS_VERSION)) return null
  return brandDirectionById(chosen.id)
}

/**
 * Kapitel 10 — die Schranke. Sie steht IMMER (§2.5), auch ohne einen Wert;
 * MIT gewählter Richtung stehen ihre Farbwelt und ihr Schriftpaar DAVOR
 * (Paket G4). Die fünf gesperrten Elemente bleiben in beiden Fällen: die
 * Ausarbeitung entsteht in Brand Design, gewählt ist nur die Welt.
 *
 * DIE SWATCHES LAUFEN RÜCKWÄRTS durch den Verlauf (tief → mittel → hell): der
 * Verlauf ist von hell nach tief sortiert, die ROLLEN beginnen aber beim
 * Grund. Wer das „aufräumt", vertauscht Grundfarbe und Fläche.
 */
function visualBlocks(
  direction: BrandDirection | null,
  design: BrandFoundationDesignInput | undefined,
  title: string,
): BrandFoundationBlock[] {
  /**
   * MIT PRESET IST DAS KAPITEL EIN ANDERES (Paket D8, §2.8).
   *
   * Nicht „Richtung, Schranke UND Ergebnis": die Richtung war die Ansage vor
   * dem Bauen, das Preset ist das Gebaute. Beides untereinander zu setzen
   * hiesse, dem Leser zwei Farbwelten zu zeigen und ihn raten zu lassen,
   * welche gilt. Und die fünf gesperrten Elemente sind schlicht nicht mehr
   * wahr — sie sind genau das, was jetzt darüber steht.
   */
  if (design) {
    const mark = design.mark as BrandDesignSnapshotPreset['mark'] & { keptDrafts?: readonly string[] }
    const { keptDrafts = [], ...markWithoutDrafts } = mark
    return [{
      kind: 'design',
      // Der Block trägt IMMER die Snapshot-Fassung (ohne Entwurfs-Ids), egal
      // welche Fassung hereinkam — s. Kopf der Block-Art.
      preset: { ...design, mark: markWithoutDrafts },
      title,
      keptDrafts: keptDrafts.length,
    }]
  }

  const locked = BRAND_FOUNDATION_VISUAL_ELEMENTS
    .map((element): BrandFoundationBlock => ({ kind: 'locked', element }))
  if (!direction) return locked

  const [light, mid, deep] = direction.gradient
  return [
    {
      kind: 'direction',
      directionId: direction.id,
      nameKey: direction.nameKey,
      reasonKey: direction.reasonKey,
      fonts: { heading: direction.fonts.heading.family, body: direction.fonts.body.family },
      gradient: [light, mid, deep],
    },
    {
      kind: 'swatches',
      labelKey: 'brand.foundation.direction.colors',
      items: [
        { hex: deep, roleKey: direction.roles[0] },
        { hex: mid, roleKey: direction.roles[1] },
        { hex: light, roleKey: direction.roles[2] },
      ],
    },
    ...locked,
  ]
}

// ── Schicht 3: die fünf neuen Kapitel (Paket K4, BK1 §2.5) ──────────────────

/**
 * DIE ZWEI SPRACHEN IM CODE — für die Sätze, die die MARKE spricht (s. Kopf,
 * „Die eine Stelle, an der hier Sätze stehen"). Wörtlich dieselbe Auflösung
 * wie in `brandKitLicenses.ts`, `brandContext.ts` und `brandDesignVocab.ts`.
 */
function isDe(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

function text(locale: string, de: string, en: string): string {
  return isDe(locale) ? de : en
}

/** Eine Zahl in der Sprache der Marke — Komma im Deutschen, wie `brandRatioText`. */
function num(value: number, locale: string): string {
  const raw = Number.isInteger(value) ? String(value) : String(value)
  return isDe(locale) ? raw.replace('.', ',') : raw
}

/**
 * EIN KATALOG-WERT ALS LESEFASSUNG — TOLERANT gegen Id UND Label.
 *
 * `m.types` speichert Ids (`product`), `m.patterns` bekommt seine Block-
 * Überschriften aus einem Lauf und kann dort das LABEL tragen („Produkt").
 * Beides derselbe Typ; wer nur die Id kennte, schriebe in die Tabelle
 * „Produkt" und in die Chips daneben `product`. Unbekanntes bleibt, wie es
 * kam — ein Wert, den der Katalog nicht kennt, ist trotzdem eine bestätigte
 * Festlegung (s. Kopf, „Was nicht parsbar ist, wird nicht verworfen").
 */
function kitTermLabel(terms: readonly BrandKitTerm[], value: string, locale: string): string {
  const needle = value.trim().toLowerCase()
  const term = terms.find(entry => entry.id.toLowerCase() === needle
    || entry.de.toLowerCase() === needle
    || entry.en.toLowerCase() === needle)
  return term ? text(locale, term.de, term.en) : value.trim()
}

/** Die Hinweiszeile eines Katalog-Wertes — '' bei unbekanntem Wert. */
function kitTermNote(terms: readonly BrandKitTerm[], value: string, locale: string): string {
  const needle = value.trim().toLowerCase()
  const term = terms.find(entry => entry.id.toLowerCase() === needle
    || entry.de.toLowerCase() === needle
    || entry.en.toLowerCase() === needle)
  return term ? text(locale, term.noteDe, term.noteEn) : ''
}

/**
 * EIN ABSATZ ALS REGEL-EINTRÄGE. Zeilen zuerst, dann Mittelpunkte, zuletzt
 * Sätze — in dieser Reihenfolge, weil jede Stufe gröber ist als die davor:
 * wer seine No-Gos untereinander geschrieben hat, bekommt genau seine Zeilen;
 * wer sie in einen Absatz getippt hat, bekommt Sätze statt eines Blocks.
 */
function ruleEntries(value: string): string[] {
  const lines = value.split('\n').map(line => line.trim().replace(LIST_MARKER, '').trim()).filter(Boolean)
  if (lines.length > 1) return lines
  const single = lines[0] ?? ''
  if (single.length === 0) return []
  const dotted = single.split(' · ').map(part => part.trim()).filter(Boolean)
  if (dotted.length > 1) return dotted
  const sentences = single.split(/(?<=[.!?])\s+/u).map(part => part.trim()).filter(Boolean)
  return sentences.length > 0 ? sentences : [single]
}

/** Kapitel „Nomenklatur" (§2.5, nach `architektur`) — entfällt ohne Werte. */
function nomenclatureBlocks(values: Map<string, string>, locale: string): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []

  const types = wordEntries(viewOf(values, 'm.types'), textOf(values, 'm.types'))
  if (types.length > 0) {
    // Chips OHNE Stimmprobe: die Hinweiszeile des Katalogs erklärt UNSER
    // Vokabular („Was ihr herstellt oder verkauft") und nicht diese Marke —
    // im Handbuch wäre sie Produkt-Text zwischen Marken-Text.
    blocks.push({
      kind: 'chips',
      labelKey: `${LABEL}.nameTypes`,
      items: types.map(id => ({ word: kitTermLabel(BRAND_NAME_TYPES, id, locale), sample: '' })),
    })
  }

  const patterns = viewOf(values, 'm.patterns')
  /*
   * JE TYP EIN MUSTER MIT BEISPIEL UND HERKUNFT (§2.2) — zerlegt von
   * `parseBrandNamePatterns` (K5), das die zwei Schreibweisen kennt: Teile
   * auf ZEILEN oder in einer Zeile durch ` · ` getrennt. Beides gibt es
   * wirklich — der kanonische Schreiber zieht auf eine Zeile zusammen, ein
   * Mensch im Bühnen-Editor tippt untereinander.
   *
   * DIE HERKUNFT BEKOMMT SEIT K5 EINE EIGENE SPALTE und steht nicht mehr
   * hinter dem Beispiel: „Kona Februar 2026" und „aus dem Architektur-Modell
   * ‚eine Marke'" sind zwei verschiedene Auskünfte. In einer Zelle gemischt
   * kann man weder die Namen überfliegen noch die Begründungen. Werte aus der
   * Zeit davor tragen nur zwei Teile — die Spalte bleibt dann leer, wie das
   * Beispiel es immer schon durfte (ein erfundenes wäre ein Name, den die
   * Marke nie vergeben hat).
   */
  const patternRows = parseBrandNamePatterns(textOf(values, 'm.patterns') ?? '')
  if (patternRows.length > 0) {
    blocks.push({
      kind: 'table',
      labelKey: `${LABEL}.namePatterns`,
      columnKeys: [`${COLUMN}.nameType`, `${COLUMN}.pattern`, `${COLUMN}.example`, `${COLUMN}.source`],
      rows: patternRows.map(row => [
        kitTermLabel(BRAND_NAME_TYPES, row.type, locale),
        row.pattern,
        row.example,
        row.source,
      ]),
    })
  }
  else if (patterns) {
    blocks.push(...blocksAsCards(patterns, `${LABEL}.namePatterns`))
  }

  const rules = sentenceEntries(viewOf(values, 'm.rules'))
  if (rules.length > 0) {
    blocks.push({ kind: 'rules', labelKey: `${LABEL}.nameRules`, items: rules.map(entry => ({ text: entry })) })
  }
  return blocks
}

/**
 * EIN FELD DES ZEICHEN-BRIEFINGS aus den Preset-Zeilen — gelesen nach
 * POSITION, nicht nach Beschriftung (dieselbe Arbeitsteilung wie
 * `parseBrandMarkBriefSlotValue`: die Überschriften stehen in der
 * Inhaltssprache der Marke).
 *
 * '' sobald die Zeilenzahl nicht stimmt: dann trägt der Aufrufer ALLE Zeilen
 * als Liste nach, statt an der dritten Position etwas Falsches zu behaupten.
 */
function markBriefField(lines: readonly string[], field: string): string {
  if (lines.length !== BRAND_MARK_BRIEF_FIELDS.length) return ''
  const index = BRAND_MARK_BRIEF_FIELDS.findIndex(entry => entry.id === field)
  const line = lines[index]
  if (line === undefined) return ''
  const colon = line.indexOf(':')
  return (colon >= 0 ? line.slice(colon + 1) : line).trim()
}

/**
 * Kapitel „Zeichen-Anwendung" (§2.5) — das Regelwerk zum Zeichen, eine
 * Zoomstufe unter der Vitrine von Kapitel 10.
 *
 * Der Schutzraum-Satz kommt aus `brandMarkClearSpaceText` und nicht aus dem
 * Briefing-Feld, obwohl dort dasselbe steht: das Feld ist ein GESPEICHERTER
 * Wert von damals, die Funktion ist die Regel von heute (`BRAND_MARK_MIN_*`).
 * Weichen sie ab, gilt die Regel — und die Tabelle daneben zeigt dieselben
 * drei Zahlen zum Abschreiben.
 */
function markUsageBlocks(
  design: BrandFoundationDesignInput,
  title: string,
  locale: string,
): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  const kind = brandTermById(BRAND_MARK_KINDS, design.mark.kind)
  if (kind) blocks.push({ kind: 'text', text: brandTermLabel(kind, locale), labelKey: `${LABEL}.markKind` })

  const lines = design.mark.brief
  const written = ['character', 'formLanguage', 'places']
    .map(field => markBriefField(lines, field))
    .filter(entry => entry.length > 0)
  const briefItems = written.length > 0 ? written : lines.filter(line => line.trim().length > 0)
  if (briefItems.length > 0) {
    blocks.push({ kind: 'list', labelKey: `${LABEL}.markBrief`, items: briefItems })
  }

  blocks.push({
    kind: 'text',
    text: brandMarkClearSpaceText(brandMarkInitial(title), locale),
    labelKey: `${LABEL}.markClearSpace`,
  })
  blocks.push({
    kind: 'table',
    labelKey: `${LABEL}.markMinSizes`,
    columnKeys: [`${COLUMN}.usage`, `${COLUMN}.minSize`],
    rows: [
      [text(locale, 'Wortmarke am Bildschirm', 'Wordmark on screen'), `${BRAND_MARK_MIN_WIDTH_PX} px`],
      [text(locale, 'Wortmarke im Druck', 'Wordmark in print'), `${BRAND_MARK_MIN_WIDTH_MM} mm`],
      [text(locale, 'Monogramm', 'Monogram'), `${BRAND_MARK_MONOGRAM_MIN_PX} px`],
    ],
  })
  blocks.push({ kind: 'text', text: brandMarkVariantsText(locale), labelKey: `${LABEL}.markVariants` })

  const noGos = ruleEntries(markBriefField(lines, 'noGos'))
  if (noGos.length > 0) {
    blocks.push({ kind: 'rules', labelKey: `${LABEL}.markDonts`, items: noGos.map(entry => ({ text: entry })) })
  }
  return blocks
}

/** Die Farben eines Presets in der Form, die `brandTokenRoleHex` erwartet. */
function presetColors(design: BrandFoundationDesignInput): {
  rampLight: BrandDesignSnapshotPreset['color']['rampLight']
  rampDark: BrandDesignSnapshotPreset['color']['rampDark']
  neutral: BrandDesignSnapshotPreset['color']['neutral']
  accent: string
} {
  return {
    rampLight: design.color.rampLight,
    rampDark: design.color.rampDark,
    neutral: design.color.neutral,
    accent: design.color.accent,
  }
}

/** „4,8:1 · AA" — das Urteil einer Messung in der Sprache der Marke. */
function verdictText(ratio: number, level: string, locale: string): string {
  return `${brandRatioText(ratio, locale)} · ${brandContrastLevelLabel(level, locale)}`
}

/**
 * Kapitel „Farb-Anwendung" (§2.5) — Rollen je Modus, Kontrast-Paare mit
 * Urteil, die Regeln aus den Durchfallern und der gehobene Dunkelmodus-Akzent.
 *
 * Die dunklen Hex-Werte kommen aus `brandTokenRoleHex` (K2) und werden hier
 * NICHT nachgerechnet: dieselbe Spiegelung, die `tokens.json` schreibt (§2.20
 * Nr. 1) — eine zweite Regel hier hiesse, dass Handbuch und Datei
 * verschiedene Farben nennen können.
 */
function colorUsageBlocks(
  design: BrandFoundationDesignInput,
  locale: string,
): BrandFoundationBlock[] {
  const snapshot = design as BrandDesignSnapshotPreset
  const colors = presetColors(design)
  const blocks: BrandFoundationBlock[] = []

  const roleTable = (scheme: 'light' | 'dark'): BrandFoundationBlock | null => {
    const rows = design.color.roles
      .map((role) => {
        const hex = brandTokenRoleHex(role.source, scheme, colors)
        if (!hex) return null
        const contrast = brandTokenContrastFor(snapshot, scheme, hex)
        return [
          brandColorRoleLabel(role.id, locale),
          hex,
          contrast ? verdictText(contrast.ratio, contrast.level, locale) : '—',
          brandColorRoleNote(role.id, locale),
        ]
      })
      .filter((row): row is string[] => row !== null)
    if (rows.length === 0) return null
    return {
      kind: 'table',
      labelKey: scheme === 'light' ? `${LABEL}.colorRolesLight` : `${LABEL}.colorRolesDark`,
      columnKeys: [`${COLUMN}.role`, `${COLUMN}.hex`, `${COLUMN}.contrast`, `${COLUMN}.usage`],
      rows,
    }
  }
  const light = roleTable('light')
  if (light) blocks.push(light)
  const dark = roleTable('dark')
  if (dark) blocks.push(dark)

  /*
   * DER GEHOBENE AKZENT (§2.20 Nr. 7) — mit BELEG, nicht als Behauptung.
   * Zwei Zeilen: was gemessen wurde und worauf der Alias jetzt zeigt. Die
   * Rechnung ist die des Token-Modells (`brandTokenAccentLiftFor`), damit im
   * Handbuch dieselbe Stufe steht wie in `tokens.json`.
   */
  const lift = brandTokenAccentLiftFor(snapshot)
  const accentRamp = brandRampDark(design.color.accent)
  const liftedHex = lift && accentRamp ? accentRamp[lift.lifted.shade as BrandRampShade] : ''
  if (lift && liftedHex) {
    blocks.push({
      kind: 'table',
      labelKey: `${LABEL}.accentLift`,
      columnKeys: [`${COLUMN}.accent`, `${COLUMN}.ground`, `${COLUMN}.contrast`],
      rows: [
        [design.color.accent, lift.ground, verdictText(lift.measured.ratio, lift.measured.level, locale)],
        [`${liftedHex} (${lift.lifted.shade})`, lift.ground, verdictText(lift.lifted.ratio, lift.lifted.level, locale)],
      ],
    })
  }

  if (design.color.contrastPairs.length > 0) {
    blocks.push({
      kind: 'table',
      labelKey: `${LABEL}.contrastPairs`,
      columnKeys: [`${COLUMN}.pair`, `${COLUMN}.ratio`, `${COLUMN}.verdict`],
      rows: design.color.contrastPairs.map(pair => [
        brandContrastPairLabel(pair.id, locale),
        brandRatioText(pair.ratio, locale),
        brandContrastLevelLabel(pair.level, locale),
      ]),
    })
  }

  /*
   * DIE REGEL „NIE TEXT AUF …" ENTSTEHT AUS DEN DURCHFALLERN und wird nicht
   * geschrieben: was hier steht, ist gemessen. Fällt kein Paar durch, steht
   * hier NICHTS — eine erfundene Verbots-Liste wäre eine Regel ohne Anlass.
   */
  const failing = design.color.contrastPairs.filter(pair => pair.level === 'fail' || pair.level === 'AA18')
  if (failing.length > 0) {
    blocks.push({
      kind: 'rules',
      labelKey: `${LABEL}.colorRules`,
      items: failing.map((pair) => {
        const label = brandContrastPairLabel(pair.id, locale)
        const measured = verdictText(pair.ratio, pair.level, locale)
        return pair.level === 'fail'
          ? {
              text: text(
                locale,
                `Nie Text auf ${pair.background} — das Paar „${label}" bleibt unter AA (${measured}).`,
                `Never set text on ${pair.background} — the pair "${label}" stays below AA (${measured}).`,
              ),
              dont: `${pair.foreground} auf ${pair.background}`,
            }
          : {
              text: text(
                locale,
                `Auf ${pair.background} nur grosse Schrift — „${label}" reicht nur für Überschriften (${measured}).`,
                `On ${pair.background} use large type only — "${label}" is enough for headings (${measured}).`,
              ),
            }
      }),
    })
  }
  return blocks
}

/**
 * Kapitel „Typografie-Anwendung" (§2.5) — Paar, Grössen-Leiter, Regeln,
 * Lizenz.
 *
 * Die Leiter ist DIE VON K2 (`BRAND_TOKEN_TYPE_STEPS` + `ratio ** rung`) und
 * wird hier nicht neu erfunden: die Zahlen im Handbuch sind Zeichen für
 * Zeichen die aus `tokens.json`. Der Prototyp hatte sie von Hand (42/32/24 px)
 * — richtig für EINE Marke, falsch für jede zweite (K2-„Gelernt").
 */
function typeUsageBlocks(
  design: BrandFoundationDesignInput,
  locale: string,
): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []
  const pair = brandFontPair(design.type.pair)
  const ratio = brandTypeScaleRatio(design.type.scale)
  const rules = brandTypeRulesFromLines(design.type.rules) ?? BRAND_TYPE_DEFAULT_RULES

  if (pair) {
    blocks.push({
      kind: 'text',
      labelKey: `${LABEL}.typePair`,
      text: text(
        locale,
        `${pair.headingFamily} für Überschriften, ${pair.bodyFamily} für Fließtext — `
        + `Größen-Leiter 1 : ${num(Math.round(ratio * 10) / 10, locale)} über ${BRAND_TYPE_BODY_REM} rem Fließtext.`,
        `${pair.headingFamily} for headings, ${pair.bodyFamily} for body copy — `
        + `size ladder 1 : ${num(Math.round(ratio * 10) / 10, locale)} over ${BRAND_TYPE_BODY_REM} rem body text.`,
      ),
    })
  }

  blocks.push({
    kind: 'table',
    labelKey: `${LABEL}.typeScale`,
    columnKeys: [
      `${COLUMN}.step`,
      `${COLUMN}.size`,
      `${COLUMN}.lineHeight`,
      `${COLUMN}.weight`,
      `${COLUMN}.font`,
      `${COLUMN}.usage`,
    ],
    rows: BRAND_TOKEN_TYPE_STEPS.map((step) => {
      const rem = Math.round(BRAND_TYPE_BODY_REM * ratio ** step.rung * 1000) / 1000
      const weight = step.face === 'heading' ? rules.headingWeight : (step.bodyWeight ?? BRAND_TOKEN_BODY_WEIGHT)
      const family = step.face === 'heading' ? pair?.headingFamily : pair?.bodyFamily
      return [
        step.id,
        `${num(rem, locale)} rem`,
        num(step.lineHeight, locale),
        String(weight),
        family ?? '',
        text(locale, step.usageDe, step.usageEn),
      ]
    }),
  })

  const ruleLines = design.type.rules.map(line => line.trim()).filter(Boolean)
  if (ruleLines.length > 0) {
    blocks.push({ kind: 'rules', labelKey: `${LABEL}.typeRules`, items: ruleLines.map(line => ({ text: line })) })
  }

  const licenses = brandLicenseRows(design as BrandDesignSnapshotPreset, locale)
  if (licenses.length > 0) {
    blocks.push({
      kind: 'text',
      labelKey: `${LABEL}.typeLicense`,
      text: `${licenses.map(row => `${row.family} (${row.spdx}, ${row.source})`).join(' · ')} — ${brandLicenseNote(locale)}`,
    })
  }
  return blocks
}

/**
 * DER PRESSE-KONTAKT AUS DEM SLOT-WERT — tolerant gegen beide Formen.
 *
 * `p.contact` ist `structured` (drei beschriftete Blöcke), aber der Wert ist
 * von Hand änderbar, und ein Mensch tippt drei Zeilen. Gelesen wird deshalb,
 * was dasteht: die E-Mail ist der Eintrag mit dem `@`, der erste Rest ist der
 * Name, der zweite die Rolle. `null` heisst „daraus wird kein Kontakt" — der
 * Aufrufer stellt den Wert dann als Text hin, statt ihn zu verlieren.
 */
function contactBlock(value: string | null): { name: string, role: string, email: string } | null {
  // Die Regel selbst steht seit K5 beim SCHREIBER (`brandKitSlots.ts`) — sie
  // ist der Leser zu `formatBrandPressContact`, und die zwei gehören
  // nebeneinander. Hier bleibt nur die Aufrufstelle.
  return value === null ? null : parseBrandPressContact(value)
}

/**
 * Kapitel „Pressekit" (§2.5, vor `ki-texte`) — NICHTS Neues, nur
 * zusammengestellt.
 *
 * Es steht erst, wenn ein Mensch etwas dafür gesagt hat (`p.facts` oder
 * `p.contact`): Tagline und Boilerplates allein wären das Messaging-Kapitel
 * ein zweites Mal.
 *
 * `p.facts` ist die EINE Quelle der Fakten — NIE `a.facts` (§2.4). Das steht
 * hier als Satz und nicht nur als Weglassung, weil der Renderer `a.facts`
 * ohnehin nicht sieht (`sensitivity: 'internal'`, das eine Tor) und ein
 * künftiger Leser sonst glauben könnte, hier fehle etwas.
 */
function presskitBlocks(
  values: Map<string, string>,
  design: BrandFoundationDesignInput | undefined,
  locale: string,
): BrandFoundationBlock[] {
  if (!values.has('p.facts') && !values.has('p.contact')) return []
  const blocks: BrandFoundationBlock[] = []

  const taglines = sentenceEntries(viewOf(values, 'ep.taglines'))
  if (taglines.length > 0) blocks.push({ kind: 'lead', text: taglines[0]!, labelKey: `${LABEL}.tagline` })
  blocks.push(...blocksAsCards(viewOf(values, 'ep.boilerplates'), `${LABEL}.boilerplates`))

  const facts = sentenceEntries(viewOf(values, 'p.facts'))
  if (facts.length > 0) blocks.push({ kind: 'list', labelKey: `${LABEL}.pressFacts`, items: facts })

  const contactValue = textOf(values, 'p.contact')
  const contact = contactBlock(contactValue)
  if (contact) blocks.push({ kind: 'contact', ...contact })
  else if (contactValue !== null) blocks.push(...textBlock(contactValue, `${LABEL}.pressContact`))

  if (design) {
    const kind = brandTermById(BRAND_MARK_KINDS, design.mark.kind)
    blocks.push({
      kind: 'text',
      labelKey: `${LABEL}.pressMark`,
      text: `${kind ? `${brandTermLabel(kind, locale)} — ` : ''}${brandMarkVariantsText(locale)}`,
    })
  }
  return blocks
}

/**
 * DIE AI-GUIDELINES (§2.3/§2.5) — sie treten NEBEN den festen Drei-Zeilen-
 * Rahmen, nicht an seine Stelle: der Rahmen ist die kostenlose Fassung und
 * bleibt wahr, die Guidelines sind die Ausarbeitung darüber.
 *
 * Leeres Ergebnis heisst „`aiguide` ist nicht abgenommen" — dann heisst das
 * Kapitel weiter „Regeln für KI-Texte" (§2.20 Nr. 6).
 */
function aiGuidelineBlocks(values: Map<string, string>, locale: string): BrandFoundationBlock[] {
  const blocks: BrandFoundationBlock[] = []

  const scope = textOf(values, 'n.scope')
  if (scope) {
    const note = kitTermNote(BRAND_AI_SCOPES, scope, locale)
    blocks.push({
      kind: 'text',
      labelKey: `${LABEL}.aiScope`,
      text: `${kitTermLabel(BRAND_AI_SCOPES, scope, locale)}${note ? ` — ${note}` : ''}`,
    })
  }
  const review = textOf(values, 'n.review')
  if (review) {
    const note = kitTermNote(BRAND_AI_REVIEWS, review, locale)
    blocks.push({
      kind: 'text',
      labelKey: `${LABEL}.aiReview`,
      text: `${kitTermLabel(BRAND_AI_REVIEWS, review, locale)}${note ? ` — ${note}` : ''}`,
    })
  }

  // Die vier Gruppen kommen seit K5 aus DEMSELBEN Leser, den Nikas Prüfung
  // benutzt (`parseBrandGuardrails`) — sonst könnte ein Entwurf die Invariante
  // bestehen und im Handbuch trotzdem anders zerfallen.
  const guardrailGroups = parseBrandGuardrails(textOf(values, 'n.guardrails') ?? '')
  if (guardrailGroups.length > 0) {
    for (const group of guardrailGroups) {
      blocks.push({
        kind: 'rules',
        labelKey: `${LABEL}.aiGuardrails`,
        label: group.label,
        items: group.lines.map(entry => ({ text: entry })),
      })
    }
  }
  else {
    const items = sentenceEntries(viewOf(values, 'n.guardrails'))
    if (items.length > 0) {
      blocks.push({ kind: 'rules', labelKey: `${LABEL}.aiGuardrails`, items: items.map(entry => ({ text: entry })) })
    }
  }

  const templates = parseBrandPromptTemplates(textOf(values, 'n.prompts') ?? '')
  if (templates.length > 0) {
    for (const template of templates) {
      blocks.push({ kind: 'prompt', labelKey: `${LABEL}.aiPrompt`, title: template.title, text: template.body })
    }
  }
  else {
    // Formfremd: die Vorlagen sind trotzdem bestätigte Werte (s. Kopf).
    blocks.push(...textBlock(textOf(values, 'n.prompts'), `${LABEL}.aiPrompt`))
  }
  return blocks
}

/** Welche Schranken-Themen ein Anwendungs-Kapitel zeigt (§2.5). */
const USAGE_TOPICS: Readonly<Record<string, readonly BrandFoundationUsageTopic[]>> = {
  'zeichen-anwendung': ['markClearspace', 'markVariants', 'markDonts'],
  'farbe-anwendung': ['colorRoles', 'colorContrast'],
  'typografie-anwendung': ['typeScale', 'typeLicense'],
}

function lockedUsageBlocks(chapterId: BrandFoundationChapterId): BrandFoundationBlock[] {
  return (USAGE_TOPICS[chapterId] ?? []).map((topic): BrandFoundationBlock => ({ kind: 'lockedUsage', topic }))
}

// ── Die Regel ───────────────────────────────────────────────────────────────

/**
 * DIE FOUNDATION AUS BESTÄTIGTEN WERTEN (§2.2).
 *
 * Ein Kapitel ohne einen einzigen Block entfällt OHNE LÜCKE — die
 * Markenarchitektur eines Brandings ohne Untermarken, das Namens-Kapitel einer
 * Marke, die ihren Namen behält. Zwei Ausnahmen, beide begründet: Kapitel 10
 * steht immer (die Schranke IST der Inhalt), und Kapitel 11 steht, sobald es
 * eine seiner Quellen gibt.
 */
export function buildBrandFoundation(input: BrandFoundationInput): BrandFoundationView {
  const values = travellingValues(input)
  const guide = ((): VocabularySides => {
    const everyday = vocabularySides(viewOf(values, 'ep.vocabulary'))
    const source = vocabularySides(viewOf(values, 'd.vocabulary'))
    return {
      use: mergeWords(everyday.use, source.use),
      avoid: mergeWords(everyday.avoid, source.avoid),
      rest: mergeWords(everyday.rest, source.rest),
    }
  })()
  const toneWords = wordEntries(viewOf(values, 'd.toneWords'), textOf(values, 'd.toneWords'))
  const brandValues = wordEntries(viewOf(values, 'c.final'), textOf(values, 'c.final'))

  // Das Kapitel steht, sobald es EINE seiner Quellen gibt (§2.2 Kapitel 11) —
  // gefragt wird nach dem SLOT, nicht nach dem Parse-Ergebnis: ein Wort-
  // Leitfaden ohne Seiten-Marken ist trotzdem eine Festlegung, und ein Rahmen
  // mit zwei von drei Zeilen ist brauchbarer als gar keiner.
  const hasAiSource = ['d.toneWords', 'd.vocabulary', 'ep.vocabulary', 'c.final']
    .some(slotId => values.has(slotId))
  const aiRules: BrandFoundationBlock[] = hasAiSource
    ? [{ kind: 'aiRules', tone: toneWords, avoid: guide.avoid, stands: brandValues }]
    : []

  /*
   * DIE GUIDELINES ENTSCHEIDEN ÜBER DEN TITEL VON KAPITEL 11 (§2.20 Nr. 6):
   * mit ihnen heisst es „AI-Guidelines", ohne sie weiter „Regeln für
   * KI-Texte". Die Id und damit die SPRUNGMARKE bleibt `ki-texte` — ein
   * verschickter Tieflink darf nicht ins Leere zeigen (§2.17).
   */
  const guidelines = aiGuidelineBlocks(values, input.contentLocale)

  /*
   * DIE DREI ANWENDUNGS-KAPITEL (§2.5) — drei Zustände, eine Weiche.
   * `undefined` heisst „der Aufrufer weiss es nicht" und lässt sie ganz weg
   * (s. `BrandFoundationInput.derivationUnlocked`).
   */
  const usageChapter = (
    id: BrandFoundationChapterId,
    blocks: () => BrandFoundationBlock[],
  ): { id: BrandFoundationChapterId, blocks: BrandFoundationBlock[], state?: 'locked', lockReason?: BrandFoundationLockReason } => {
    if (input.derivationUnlocked === undefined) return { id, blocks: [] }
    if (!input.derivationUnlocked) {
      return { id, blocks: lockedUsageBlocks(id), state: 'locked', lockReason: 'derivation' }
    }
    if (!input.design) return { id, blocks: lockedUsageBlocks(id), state: 'locked', lockReason: 'design' }
    return { id, blocks: blocks() }
  }

  const draft: {
    id: BrandFoundationChapterId
    blocks: BrandFoundationBlock[]
    state?: 'locked'
    lockReason?: BrandFoundationLockReason
    titleKey?: string
  }[] = [
    { id: 'story', blocks: storyBlocks(input.story) },
    {
      id: 'kontext',
      blocks: [
        ...leadBlock(textOf(values, 'a.pitch'), `${LABEL}.pitch`),
        ...textBlock(textOf(values, 'a.category'), `${LABEL}.category`),
        ...blocksAsCards(viewOf(values, 'a.audienceSketch'), `${LABEL}.audience`),
      ],
    },
    {
      id: 'purpose',
      blocks: [
        ...leadBlock(textOf(values, 'b.purpose'), `${LABEL}.purpose`),
        ...textBlock(textOf(values, 'b.vision'), `${LABEL}.vision`),
        ...textBlock(textOf(values, 'b.mission'), `${LABEL}.mission`),
      ],
    },
    {
      id: 'positionierung',
      blocks: [
        ...textBlock(textOf(values, 'b.positioningCategory'), `${LABEL}.positioningCategory`),
        ...leadBlock(textOf(values, 'b.positioningFirstChoice'), `${LABEL}.firstChoice`),
      ],
    },
    {
      id: 'architektur',
      blocks: [
        ...choiceBlock(values, `${LABEL}.model`, ['b2.model']),
        ...textBlock(textOf(values, 'b2.rule'), `${LABEL}.namingRule`),
      ],
    },
    // Nur auf dem B2-Weg (§2.20 Nr. 4): ohne Markenarchitektur läuft
    // `nomenclature` nicht, es gibt keine Werte, und das Kapitel entfällt
    // OHNE LÜCKE — wie `architektur` selbst.
    { id: 'nomenklatur', blocks: nomenclatureBlocks(values, input.contentLocale) },
    { id: 'werte', blocks: valueBlocks(values) },
    { id: 'stimme', blocks: voiceBlocks(values) },
    { id: 'manifest', blocks: manifestoBlocks(values) },
    { id: 'messaging', blocks: messagingBlocks(values, guide) },
    { id: 'name', blocks: nameBlocks(values) },
    {
      id: 'visuell',
      blocks: visualBlocks(resolveDirection(input), input.design, input.title),
      // MIT PRESET IST DAS KAPITEL ABGENOMMEN, nicht gesperrt: das Preset
      // entsteht erst, wenn alle sechs Kapitel der Schicht abgenommen sind
      // (`loadBrandDesignPreset`) — der Zustand ist also kein Anzeige-Trick,
      // sondern die Tatsache dahinter.
      ...(input.design ? {} : { state: 'locked' as const }),
    },
    usageChapter('zeichen-anwendung', () => markUsageBlocks(input.design!, input.title, input.contentLocale)),
    usageChapter('farbe-anwendung', () => colorUsageBlocks(input.design!, input.contentLocale)),
    usageChapter('typografie-anwendung', () => typeUsageBlocks(input.design!, input.contentLocale)),
    { id: 'pressekit', blocks: presskitBlocks(values, input.design, input.contentLocale) },
    {
      id: 'ki-texte',
      blocks: [...aiRules, ...guidelines],
      ...(guidelines.length > 0 ? { titleKey: 'brand.foundation.chapter.aiGuidelines' } : {}),
    },
  ]

  return {
    chapters: draft
      .filter(chapter => chapter.blocks.length > 0)
      .map(chapter => ({
        id: chapter.id,
        anchor: chapter.id,
        titleKey: chapter.titleKey ?? chapterTitleKey(chapter.id),
        state: chapter.state ?? 'done',
        ...(chapter.lockReason ? { lockReason: chapter.lockReason } : {}),
        blocks: chapter.blocks,
      })),
  }
}
