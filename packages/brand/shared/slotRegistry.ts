/**
 * DIE SLOT-REGISTRY — der Code-Vertrag des P0-Slot-Katalogs (Plan §3e,
 * Inhalte aus docs/plans/BRAND-WIZARD-CONTENT-SPEC.md §§3–11).
 *
 * „Navigation, Fortschritt, Validierung, Abhängigkeiten und Prompt-Aufbau
 * entstehen aus DIESER einen Registry — nicht aus fünf getrennten
 * Regelwerken" (Plan §3e). Diese Datei ist PURE: kein Appwrite, kein H3, kein
 * i18n-Import. Sie beschreibt nur, WELCHE Felder es gibt und wie sie
 * zusammenhängen; WAS drinsteht, entscheiden die Routen, und WIE es heisst,
 * entscheiden die Locale-Dateien (P1c).
 *
 * ── SLOT-IDS SIND UNVERÄNDERLICH ──────────────────────────────────────────
 * Eine Slot-Id wird NIE übersetzt und NIE umbenannt (Plan §3e). Sie steht in
 * `brand_steps.slots` als JSON-Schlüssel jeder Zeile jedes Bestands-Brandings
 * — ein Rename wäre eine stille Datenlöschung. Die Ids sind wörtlich die des
 * Katalogs (`a.pitch`, `b.purpose`, `c.conflictRule`, `d.pairs`,
 * `e.statements`, `ep.taglines`, `f.checks` …).
 *
 * ── MIGRATIONSVERTRAG (Plan §3e „Registry- und Daten-Migration") ───────────
 * `REGISTRY_VERSION` steigt, sobald sich der Katalog ändert; die Version wird
 * je Brand/Step mitgeschrieben. Ein Slot, der nicht mehr gebraucht wird, wird
 * `deactivated: true` gesetzt — NIE aus dem Array entfernt: nur so bleiben
 * Bestandsdaten lesbar und ein Rollback auf die Vorversion möglich. Alle
 * Helfer hier überspringen deaktivierte Slots, `slotById` findet sie aber
 * weiterhin (ein Leser muss alte Daten anzeigen können). Neu HINZUKOMMENDE
 * Pflicht-Slots machen Bestands-Brands nicht unvollständig — diese Regel
 * lebt in `brandJourney.ts` (ein gespeichertes `done` wird nicht neu
 * berechnet), nicht hier.
 *
 * ── DIE ZEHN FELDER ───────────────────────────────────────────────────────
 * `id`            stabile Katalog-Id (s. o.)
 * `stepId`        einer der neun stepKeys des Schema-Anhangs §2
 * `type`          der FÜLLWEG (s. u.)
 * `required`      zählt für „Baustein abgeschlossen" (brandJourney)
 * `schema`        deklarativ `{ kind, maxLength }` — echte Zod-Factories
 *                 kommen mit den Routen (P1b). Der Vertrag hier ist bewusst
 *                 schlank: eine Registry, die Zod importiert, wäre auf dem
 *                 Client eine Bibliothek statt einer Tabelle.
 * `dependencies`  Quell-Slots für den inputHash-Vertrag (s. u.)
 * `questionKey`   i18n-Schlüssel-NAME `brand.q.<id>` (s. u.)
 * `helpKey`       `brand.help.<id>` ODER `null` (s. u.)
 * `editor`        womit der Mensch ihn anfasst
 * `generator`     ob und wie George ihn entwirft
 * `maxLength`     Zeichen-Deckel; `schema.maxLength` ist derselbe Wert
 *                 (`defineSession` setzt beide aus EINER Angabe — sie können
 *                 nicht auseinanderlaufen, der Test prüft es trotzdem)
 *
 * ── FÜLLWEGE (`type`) — die Buchstaben des Katalogs §3 ─────────────────────
 * 'question'    = **F** reine Menschenfrage (Provokation)
 * 'derivation'  = **K** George leitet ab, der Mensch bestätigt/korrigiert
 * 'choice'      = **A** Auswahl/Chips
 * 'stage-edit'  = **K→B** George entwirft, redigiert wird auf der BÜHNE
 * 'special'     = eigenes Instrument; genau EINER: `d.pairs`
 *                 (Paarvergleich, Katalog §12). Die Konfidenz-Weiche ist
 *                 KEIN Slot — sie steht als `brand_steps.confidence` je
 *                 Baustein (Schema-Anhang §2) und wird in `brandJourney.ts`
 *                 geprüft; als 68. Slot wäre sie in der Fortschritts-Formel
 *                 doppelt gezählt.
 *
 * `type` und `generator` sind ZWEI ACHSEN, nicht eine: `b.whyStarted` ist
 * eine Menschenfrage (`'question'`) UND auf dem Gründer-Pfad aus `a.origin`
 * ableitbar (`generator: 'derive'`) — der Katalog sagt dort ausdrücklich
 * „entfällt, wenn a.origin es schon trägt". Eine zusammengelegte Achse
 * zwänge dort entweder eine doppelte Frage oder einen fehlenden Entwurf.
 *
 * ── DEPENDENCIES / inputHash ──────────────────────────────────────────────
 * `dependencies` sind die Slot-Ids, aus deren Ständen der inputHash der
 * letzten Generation gebildet wird (Schema-Anhang §2: „veraltet" ist
 * ABGELEITET — inputHash ≠ aktuell, kein Flag). Sie zeigen deshalb IMMER
 * rückwärts: ein Slot darf nur von Slots abhängen, die in diesem Array VOR
 * ihm stehen. Das macht die Reihenfolge des Arrays zur topologischen
 * Ordnung — Zyklen sind damit strukturell unmöglich statt nur getestet
 * (getestet werden sie zusätzlich, inklusive Gegenprobe).
 *
 * Leere `dependencies` heissen NICHT „hängt von nichts ab": die Slots des
 * Bausteins A schöpfen aus der STARTKARTE (URL, Branche, „was macht ihr",
 * „für wen") und die ist kein Slot — sie steht seit brand-009 auf
 * `brand_profiles` (Katalog §2.1: „Mehr erhebt Schritt 0 NICHT") und reist
 * über den Generator-Vertrag (`BrandGeneratorContext.startCard`) zu George,
 * nicht über diese Liste.
 *
 * IM inputHash STEHT SIE HEUTE NICHT (Stand P2.5): der Hash beschreibt den
 * Stand der Quell-SLOTS, und `collectSlotDependencies` ist seine einzige
 * Quelle. Eine geänderte Startkarte macht einen bestehenden Entwurf also
 * nicht „veraltet" — bekannt und bewusst offen, kein Versehen.
 *
 * ── questionKey / helpKey ─────────────────────────────────────────────────
 * Mechanisch `brand.q.<id>` bzw. `brand.help.<id>` — `defineSession` baut sie,
 * damit kein Tippfehler entstehen kann. `helpKey` ist `null`, wo es KEINEN
 * Lehrblock gibt: ein Schlüssel ohne Übersetzung rendert wörtlich sich
 * selbst (der `legal.imprint`-Fuss von comments.pukalani.app stand vier Tage
 * so da). Wo er gesetzt ist, steht dahinter genau ein Lehrblock aus Katalog
 * §13:
 *
 *   teach.pvm              → b.purpose · b.vision · b.mission
 *                            (+ b.positioningCategory: „Was heisst
 *                            Positionierung?", §3b)
 *   teach.values           → c.candidates · c.final
 *   teach.archetypes       → d.pairs · d.primary (+ d.gapReveal: Selbstbild
 *                            gegen Aussenbild braucht einen Satz Erklärung)
 *   teach.manifesto        → e.statements · e.manifesto
 *   teach.naming.types     → f.nameType
 *   teach.naming.why       → f.taste
 *   teach.naming.trademark → f.checks
 *   (B2-Infografik §12.3)  → b2.model
 *
 * ── PFAD-VARIANTEN ────────────────────────────────────────────────────────
 * Die Weiche W1 („Neue Marke" / „Marken-Relaunch") tauscht bei drei Slots
 * die FRAGEFASSUNG, nicht den Slot. Konvention: `pathVariants` markiert,
 * welche Pfade eine eigene Fassung haben, und der Schlüssel bekommt das
 * Suffix — `brand.q.a.origin.new` / `brand.q.a.origin.relaunch`. Ist für
 * einen Pfad keine Variante vermerkt, gilt der Basis-Schlüssel
 * (`d.gapReveal` hat nur `relaunch: true`: dort heisst er
 * „Aussenbild-Check", auf dem Gründer-Pfad bleibt es der Basis-Text).
 * `questionKeyFor()` ist die EINE Stelle, die das rechnet.
 *
 * ── TEAM-VARIANTEN (Paket 2b, Davids Entscheidung 2026-09-04) ─────────────
 * Dieselbe Mechanik für die Weiche W3 (Solo/Team). Sie fing an EINEM Slot an:
 * `c.discovery3` fragt im Team nach der Entscheidungsregel für den Fall, dass
 * der Inhaber nicht im Raum ist (D7 der Content-Spec §6), solo nach dem
 * Verhalten, das niemals geduldet wird (D3). `teamVariant: true` markiert
 * das, und der Schlüssel bekommt IMMER ein Suffix — `brand.q.c.discovery3.solo`
 * bzw. `.team`. IMMER, nicht nur im Team-Fall: ein JSON-Katalog kann unter
 * EINEM Schlüssel nicht gleichzeitig eine Zeichenkette und ein Kind-Objekt
 * halten (dieselbe Grenze wie bei `d.gapReveal`, s. `tests/i18nCatalog.test.ts`),
 * also sind beide Fassungen Kinder.
 *
 * ── DIE ANREDE IST DERSELBE SCHALTER (Davids Entscheidung 2026-09-09) ──────
 * Aus dem einen Slot sind 48 geworden. Grund ist kein neuer Mechanismus,
 * sondern ein Inhalts-Befund: die abgenommenen Fragetexte reden die Marke als
 * MEHRZAHL an („Welche Beschwerden oder Kritik bekommt ihr?"), und auf der
 * Weiche „Nur ich" ist das schlicht falsch. Die Team-Fassung bleibt WÖRTLICH
 * wie abgenommen, die Solo-Fassung sagt dasselbe in der Wizard-Anrede „du".
 * Weil das dieselbe Weiche ist, ist es dasselbe Feld — eine zweite Markierung
 * neben `teamVariant` hiesse zwei Regeln für eine Frage.
 *
 * Pfad- und Team-Variante schliessen sich seither NICHT mehr aus: `a.origin`
 * und `b.whyStarted` fragen auf dem Relaunch-Pfad etwas anderes UND reden die
 * Marke an, also tragen sie beide Achsen (`brand.q.a.origin.relaunch.solo`).
 * Zwei Slots, vier Fassungen — mehr wird es nur mit einem Grund.
 *
 * ── WAS HIER BEWUSST NICHT STEHT ──────────────────────────────────────────
 * Die Weiche W3 (Solo/Team) gatet keinen Step, sondern EINEN Slot
 * (`c.teamFilter`). Slot-Bedingungen INNERHALB eines Bausteins modelliert
 * Phase 1 nicht als Prädikat, sondern über `required: false` — sonst könnte
 * ein Solo-Branding den Baustein „Werte" nie abschliessen. Dasselbe gilt für
 * `a.toneAnalysis` (braucht vorhandene Texte, die eine neue Marke nicht hat)
 * und `result.rating` (ausdrücklich freiwillig, Katalog §11). Ein späteres
 * `appliesWhen` kann das verschärfen; ein zu strenges `required` heute wäre
 * eine Sackgasse im Produkt.
 *
 * ── EIN SLOT IST EINE SESSION (BW2 Paket 1, 2026-09-04) ───────────────────
 * Aus `defineSlot` ist `defineSession` geworden, aus `BrandSlot` die
 * vollständige `BrandSessionConfig` (Plan BRAND-WIZARD-SESSIONS.md §3/§3a):
 * Ziel, Eingaben, Verarbeitung, Antwort-Regeln, Output, Qualität,
 * Anti-Muster, Form, Invarianten, Vertraulichkeit, Umfang. `BrandSlot` bleibt
 * als NAME dieses Typs bestehen — die 33 Leser der Registry sprechen weiter
 * von Slots, und ein Rename quer durch App und Routen wäre Bewegung ohne
 * Aussage. Die Ids ändern sich ohnehin NIE (s. o.).
 *
 * Die alten zehn Felder sind unverändert erhalten und stehen zusätzlich in
 * ihrer Session-Fassung (`type` neben `kind`, `dependencies` neben
 * `inputs.slots`, `schema/editor/generator` neben `output.*`). Das ist keine
 * Doppelung aus Bequemlichkeit, sondern der Migrationsweg: Paket 3–7 stellen
 * die Leser nach und nach um, und bis dahin darf keine der beiden Fassungen
 * lügen — `defineSession` baut BEIDE aus EINER Angabe, sie können nicht
 * auseinanderlaufen, und `validateSlotRegistry` prüft es trotzdem.
 *
 * WO DER INHALT LEBT: `goal` und `processing.rules` sind Prompt-TEXT und
 * stehen in `sessionContent.ts` (eigener Pflege-Rhythmus, Davids Inhalts-Gate
 * in Paket 2). Was hier steht, ist die Struktur.
 */

import type { BrandAdvisorKey } from './brandAdvisors'
import { techniqueForStep } from './brandAdvisors'
import {
  type BrandSessionAnswers,
  type BrandSessionContent,
  type BrandSessionEffort,
  type BrandSessionExamples,
  type BrandSessionForm,
  type BrandSessionKind,
  type BrandSessionLadder,
  type BrandSessionSensitivity,
  type BrandInvariant,
  SESSION_CONTENT,
} from './sessionContent'

export type {
  BrandInvariant,
  BrandInvariantKind,
  BrandSessionAnswers,
  BrandSessionEffort,
  BrandSessionExamples,
  BrandSessionExampleSet,
  BrandSessionForm,
  BrandSessionKind,
  BrandSessionLadder,
  BrandSessionSensitivity,
  BrandSessionSubstance,
} from './sessionContent'

/**
 * SCHICHT 1 — die neun Bausteine der Brand Foundation (Schema-Anhang §2
 * `brand_steps.stepKey`), in Reihenfolge.
 *
 * Eigene Konstante NEBEN `BRAND_STEP_KEYS` seit Brand Design D0, und nicht
 * bloss ein `slice`: mehrere Rechnungen meinen ausdrücklich das FUNDAMENT und
 * nicht „alle Kapitel" — der Fortschritts-Cache am Profil
 * (`resolveProfileProgress`), die Zeile „Schritt 3 von 9" auf der Marken-Karte
 * und die Zusage „`result` steht am Ende" (Audit-Befund C4). Ein `slice(0, 9)`
 * an diesen Stellen wäre eine Zahl, die beim nächsten Kapitel still falsch
 * wird.
 */
export const BRAND_FOUNDATION_STEP_KEYS = [
  'context',
  'pvm',
  'architecture',
  'values',
  'archetype',
  'manifesto',
  'verbal',
  'naming',
  'result',
] as const

/**
 * SCHICHT 2 — die sechs Kapitel von Brand Design (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.1, Paket D0), ADDITIV hinter der Foundation.
 *
 * Die Ids sind so unveränderlich wie die der Foundation: sie stehen in
 * `brand_steps.stepKey` und in der Adresse der Werkstatt (`/brand/:id/dna`).
 * Die UI-Namen (§2.19 Frage 3: Moodboard · Farbwelt · Typografie · Zeichen ·
 * Bildsprache · Bewegung) stehen im Locale-Katalog, nicht hier — `motion`
 * bleibt die Id, „Bewegung" ist ihr deutscher Name.
 */
export const BRAND_DESIGN_STEP_KEYS = [
  'dna',
  'color',
  'type',
  'mark',
  'imagery',
  'motion',
] as const

/**
 * SCHICHT 3 — die drei Kapitel von Brand Book & Kit (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.1–§2.4, Paket K0), ADDITIV hinter Brand
 * Design.
 *
 * Eigene Konstante NEBEN `BRAND_DESIGN_STEP_KEYS` aus derselben Begründung wie
 * dort: mehrere Rechnungen meinen ausdrücklich EINE Schicht (§2.1). Die Ids
 * sind so unveränderlich wie die der Foundation — sie stehen in
 * `brand_steps.stepKey` und in der Adresse der Werkstatt.
 *
 * Die UI-Namen (§2.20 Nr. 6: Nomenklatur · AI-Guidelines · Pressekit) stehen
 * im Locale-Katalog, nicht hier — `presskit` bleibt die Id, „Pressekit" ist
 * ihr deutscher Name.
 */
export const BRAND_KIT_STEP_KEYS = [
  'nomenclature',
  'aiguide',
  'presskit',
] as const

/** Alle Kapitel aller drei Schichten, in Weg-Reihenfolge. */
export const BRAND_STEP_KEYS = [
  ...BRAND_FOUNDATION_STEP_KEYS,
  ...BRAND_DESIGN_STEP_KEYS,
  ...BRAND_KIT_STEP_KEYS,
] as const
export type BrandStepKey = (typeof BRAND_STEP_KEYS)[number]

export type BrandFoundationStepKey = (typeof BRAND_FOUNDATION_STEP_KEYS)[number]
export type BrandDesignStepKey = (typeof BRAND_DESIGN_STEP_KEYS)[number]
export type BrandKitStepKey = (typeof BRAND_KIT_STEP_KEYS)[number]

/**
 * Gehört dieses Kapitel zu Brand Design (Schicht 2)? — die EINE Stelle, die
 * das entscheidet. Ein `startsWith`- oder Index-Vergleich an den Aufrufstellen
 * wäre dieselbe Frage, dreimal beantwortet.
 */
export function isBrandDesignStep(stepKey: string): stepKey is BrandDesignStepKey {
  return (BRAND_DESIGN_STEP_KEYS as readonly string[]).includes(stepKey)
}

/** Dieselbe Frage für Schicht 3 (Brand Book & Kit) — dieselbe Begründung. */
export function isBrandKitStep(stepKey: string): stepKey is BrandKitStepKey {
  return (BRAND_KIT_STEP_KEYS as readonly string[]).includes(stepKey)
}

/** Füllweg des Slots — die Buchstaben F/K/A/B des Katalogs §3, plus `special`. */
export type BrandSlotType = 'question' | 'derivation' | 'choice' | 'stage-edit' | 'special'

/**
 * Womit der Mensch den Slot anfasst. `none` = nur lesen (berechnete Slots).
 *
 * `uploads` und `drafts` kommen mit Brand Design D0 dazu und sind heute NUR
 * eine Deklaration: gebaut werden die zwei Instrumente in D2 (Vorbilder) und
 * D5c (KI-Entwürfe). Bis dahin gilt für sie dasselbe wie für `d.pairs` — sie
 * sind `type: 'special'` und damit nicht bestätigbar (`slotIsConfirmable`),
 * stehen also in keiner Abschluss-Bedingung.
 */
export type BrandSlotEditor =
  | 'chips' | 'text' | 'textarea' | 'stage' | 'cards' | 'none' | 'uploads' | 'drafts'

/** Ob und wie George entwirft. `none` = reine Menschenfrage bzw. reine Auswahl. */
export type BrandSlotGenerator = 'none' | 'derive' | 'draft' | 'candidates'

/**
 * Speicherform. `richtext` = Markdown und NUR für Langtexte (Plan §3e
 * „Editor- & Inhaltsformat": Markdown nur für Manifest/Brand Story, kein HTML
 * als kanonisches Format).
 */
export type BrandSlotSchemaKind = 'text' | 'richtext' | 'choice' | 'list' | 'structured'

export interface BrandSlotSchema {
  kind: BrandSlotSchemaKind
  maxLength: number
}

/** Welche Pfade eine eigene Fragefassung haben (s. Kopf „Pfad-Varianten"). */
export interface BrandSlotPathVariants {
  new?: boolean
  relaunch?: boolean
}

export type BrandPathKind = 'new' | 'relaunch'

/**
 * Die Weiche W3 (Solo/Team). Sie steht neben `BrandPathKind` und nicht in
 * `shared/types/brand.ts`, weil `questionKeyFor` sie braucht und jene Datei
 * AUS dieser hier importiert — die Gegenrichtung wäre ein Zyklus. Dort wird
 * sie weiter re-exportiert, damit jede Aufrufstelle bleibt, wo sie war.
 */
export type BrandTeamKind = 'solo' | 'team'

/**
 * IST DIESER WERT EINE FESTLEGUNG? (BF-Leseansicht §2.3, Paket G1)
 *
 * ── ZWEI FRAGEN, ZWEI FELDER — Muster `as`/`actor` der Datentür ───────────
 * `sensitivity` beantwortet „DARF es reisen?" (Vertraulichkeit). `audience`
 * beantwortet die ANDERE Frage: „ist es eine Festlegung, die ins Handbuch
 * gehört — oder eine Rohantwort, aus der George etwas gemacht hat?"
 *
 * `a.origin` (die Gründungsgeschichte) ist nicht vertraulich und trotzdem
 * kein Guidelines-Inhalt; sie über `sensitivity` zu verschärfen wäre das
 * falsche Werkzeug, weil das auch den Export und die Werkstatt-Anzeige meint
 * — der Eigentümer soll seine eigene Antwort im Arbeits-Dokument sehr wohl
 * sehen. Deshalb ein eigenes Feld statt einer dritten Stufe.
 *
 * `foundation` = steht in der Brand Foundation (Leseansicht, geteilter Link,
 * Druck). `internal` = Material, nie Handbuch-Inhalt.
 *
 * DIE REGEL, DIE BEIDE FELDER VERBINDET (`validateSlotRegistry` prüft sie):
 * `sensitivity !== 'public'` ⇒ `audience: 'internal'`. Ein Feld darf nie
 * gleichzeitig „Festlegung" heissen und „reist nicht" — `audienceFor` klemmt
 * das schon beim Bauen, der Wächter fängt jede von Hand gebaute Fassung.
 */
export type BrandSessionAudience = 'foundation' | 'internal'

/**
 * DER SESSION-VERTRAG (Plan §3 + §3a) — eine deklarative Beschreibung je Feld,
 * PUR (kein i18n, kein H3, kein Appwrite).
 *
 * Die zehn Katalog-Felder von P1b stehen unverändert oben; darunter die
 * Session-Fassung. Beide entstehen aus EINER Angabe (`defineSession`).
 */
export interface BrandSessionConfig {
  readonly id: string
  readonly stepId: BrandStepKey
  readonly type: BrandSlotType
  readonly required: boolean
  readonly schema: BrandSlotSchema
  readonly dependencies: readonly string[]
  readonly questionKey: string
  readonly helpKey: string | null
  readonly editor: BrandSlotEditor
  readonly generator: BrandSlotGenerator
  readonly maxLength: number
  readonly pathVariants?: BrandSlotPathVariants
  /** Eigene Fragefassung je Weiche W3 (Solo/Team) — s. Kopf „Team-Varianten". */
  readonly teamVariant?: true
  /** Eigene BEISPIEL-Antwort je Weiche W3 — s. `exampleKeyFor` (selten). */
  readonly teamExample?: true
  /** Die TEILE einer Sammel-Session mit eigener Fassung je Weiche W3 — s. `partKeyFor`. */
  readonly teamParts?: readonly string[]
  /** Migrationsvertrag: nicht mehr gefragt, aber weiter lesbar. Nie löschen. */
  readonly deactivated?: true

  /** Die Arbeitsform dieser Session — mechanisch aus `type` (s. `sessionKindFor`). */
  readonly kind: BrandSessionKind
  /** ZIEL — ein Satz, was am Ende feststehen muss (Prompt-Text, englisch). */
  readonly goal: string
  /**
   * Die Teile einer `collect`-Session, in Frage-Reihenfolge (Locale-Schlüssel
   * `brand.q.<id>.<part>`). Für jede andere Art leer — `collect` ist der
   * EINZIGE Typ mit Teilen (Plan §3).
   */
  readonly parts: readonly string[]

  /** EINGABEN — was die Session lesen darf. */
  readonly inputs: {
    /** Bestätigte Werte anderer Sessions — dieselbe Liste wie `dependencies`. */
    readonly slots: readonly string[]
    /** Die Nicht-Slot-Quellen (bis BW2 implizit). */
    readonly startCard: boolean
    readonly siteAnalysis: boolean
    /** Notizen früherer Sessions dieses Kapitels mitlesen? (Paket 4) */
    readonly notes: 'chapter' | 'none'
  }

  /** VERARBEITUNG — wie Antworten eingeordnet werden. */
  readonly processing: {
    /** Wörtlich in den Prompt (`sessionInstruction`). */
    readonly rules: readonly string[]
    /** Regeln, die nur auf EINEM Pfad gelten (Weiche W1). */
    readonly pathRules: { readonly new: readonly string[], readonly relaunch: readonly string[] }
    /** Welche Kollegin hinter George steht — aus `techniqueForStep(stepId)`. */
    readonly technique: BrandAdvisorKey
  }

  /** ANTWORT-REGELN — was bei dünn / „weiss nicht" / vertagt passiert. */
  readonly answers: BrandSessionAnswers

  /** OUTPUT — der Feldwert nach Schema, plus die Tiefe des Schliess-Aufrufs. */
  readonly output: {
    readonly schema: BrandSlotSchema
    readonly editor: BrandSlotEditor
    readonly generator: BrandSlotGenerator
    /** Muss der Spezialist beim Schliessen gegen das Dokument prüfen? (Paket 4) */
    readonly review: 'full' | 'light'
  }

  /** 3–5 prüfbare Merkmale eines GUTEN Werts — je eines mit Ja/Nein zu beantworten. */
  readonly quality: readonly string[]
  /** Was der Spezialist zurückweist, je Feld (2–3 konkrete Muster). */
  readonly antiPatterns: readonly string[]
  /**
   * 1–2 erfundene starke Werte je Pfad, FREMDE Branche, JE SPRACHE.
   * Zweisprachig, weil sie nicht nur in den Prompt reisen, sondern auf der
   * Abnahme-Seite (Plan §5a) ein Mensch sie liest — Begründung in
   * `sessionContent.ts`.
   */
  readonly examples: BrandSessionExamples
  /** Die Interviewführung dieser einen Session (leer bei derive/draft/instrument). */
  readonly ladder: BrandSessionLadder
  /** Regeln, die der WERT selbst einhalten muss. */
  readonly form: BrandSessionForm
  /** Deterministische Prüfungen beim Bestätigen (`evaluateInvariants`). */
  readonly invariants: readonly BrandInvariant[]
  /** Was per Share-Link und Export standardmässig NICHT reist. */
  readonly sensitivity: BrandSessionSensitivity
  /** Ob der Wert eine FESTLEGUNG ist (Handbuch) oder Material (s. o.). */
  readonly audience: BrandSessionAudience
  /** Was der Mensch vorher über den Umfang erfährt. */
  readonly effort: BrandSessionEffort
}

/**
 * DER ALTE NAME DESSELBEN TYPS. 33 Leser sprechen von Slots; ein Rename quer
 * durch App, Routen und Tests wäre Bewegung ohne Aussage (s. Kopf).
 */
export type BrandSlot = BrandSessionConfig

/**
 * Fassung des Katalogs. Steigt bei JEDER Änderung an Ids, `required`,
 * `dependencies` oder Limits — sie wird je Brand/Step mitgeschrieben und
 * entscheidet, welcher Upcaster alte Slot-Daten liest (Plan §3e).
 */
export const REGISTRY_VERSION = 1

/** Zeichen-Deckel eines einzelnen Slots (Schema-Anhang §2: „einzelner Slot-Text ≤ 20k"). */
export const BRAND_SLOT_MAX_LENGTH = 20_000

/** Deckel der gesamten `slots`-Spalte EINER Baustein-Zeile (Schema-Anhang §2). */
export const BRAND_STEP_SLOTS_MAX_LENGTH = 200_000

/** Kurztexte, Auswahlen, einzelne Sätze. */
const SHORT = 2_000
/** Listen, Steckbriefe, Bühnen-Dokumente, Manifest. */
const LONG = BRAND_SLOT_MAX_LENGTH

interface BrandSlotDefinition {
  id: string
  stepId: BrandStepKey
  type: BrandSlotType
  required: boolean
  kind: BrandSlotSchemaKind
  maxLength: number
  editor: BrandSlotEditor
  generator: BrandSlotGenerator
  dependencies?: readonly string[]
  /** true ⇒ `helpKey` wird gesetzt (Lehrblock-Zuordnung s. Kopf). */
  help?: boolean
  pathVariants?: BrandSlotPathVariants
  /** Eigene Fragefassung je Weiche W3 (Solo/Team) — s. Kopf „Team-Varianten". */
  teamVariant?: true
  /** Eigene BEISPIEL-Antwort je Weiche W3 — s. `exampleKeyFor` (selten). */
  teamExample?: true
  /** Die TEILE mit eigener Fassung je Weiche W3 — s. `partKeyFor` (nur `collect`). */
  teamParts?: readonly string[]
  deactivated?: true
}

/**
 * DIE ARBEITSFORM AUS DEM FÜLLWEG — mechanisch, ohne gepflegte zweite Liste
 * (Plan §3: „`kind` passt zum `type`-Erbe").
 *
 * EINE Ausnahme, und sie ist die Antwort auf einen offenen Punkt aus BW1:
 * `a.facts` steht im Katalog als `choice` (drei Auswahlfelder), ist aber in
 * Wahrheit eine MEHRTEILIGE Sammlung — Teamgrösse, Alter, Märkte, nacheinander
 * gefragt und zu EINEM strukturierten Wert zusammengelegt (`parts`). Der
 * `type` bleibt trotzdem `choice`: er beschreibt, WOMIT der Mensch antwortet
 * (Chips), und ihn zu ändern zöge REGISTRY_VERSION und die Upcaster mit.
 */
export function sessionKindFor(slot: { id: string, type: BrandSlotType }): BrandSessionKind {
  if (slot.id === 'a.facts') return 'collect'
  switch (slot.type) {
    case 'question': return 'ask'
    case 'choice': return 'choose'
    case 'derivation': return 'derive'
    case 'stage-edit': return 'draft'
    case 'special': return 'instrument'
  }
}

/**
 * DIE VORGABEN JE ARBEITSFORM — Platzhalter aus Paket 1, gepflegt in Paket 2.
 *
 * Sie stehen als TABELLE und nicht 68-mal von Hand: 68 vollständige Datensätze
 * wären 68 Chancen, einen Wert zu vergessen, und ein vergessener Deckel fällt
 * an einem Gespräch auf, das nicht aufhört zu fragen.
 *
 * ── DIE MINUTEN SIND IN PAKET 2b HALBIERT (Davids Entscheidung 2026-09-04) ─
 * Die Summe der alten Schätzungen ergab 154 Min im Basispfad — gegen die
 * Kommunikationslinie „~45 Minuten" (Content-Spec §16). Entschieden ist
 * „halbieren und in Kapitel-Etappen kommunizieren": der Basispfad liegt jetzt
 * bei ~77 Min, der Vollpfad bei ~95 Min, und `tests/slotRegistry.test.ts`
 * nagelt die Spanne fest. `turns` sind NICHT halbiert — sie sind der Deckel
 * der Leiter, nicht die Uhr, und müssen zu `answers.maxProbes` passen
 * (Eröffnung + Nachfragen, ebenfalls geprüft).
 */
const KIND_DEFAULTS: Readonly<Record<BrandSessionKind, {
  answers: BrandSessionAnswers
  effort: BrandSessionEffort
  review: 'full' | 'light'
}>> = {
  ask: {
    answers: { minSubstance: 'medium', maxProbes: 2, allowUnknown: true, allowDefer: false },
    effort: { minutes: 1, turns: 4 },
    review: 'full',
  },
  collect: {
    answers: { minSubstance: 'medium', maxProbes: 2, allowUnknown: true, allowDefer: false },
    effort: { minutes: 3, turns: 6 },
    review: 'full',
  },
  choose: {
    answers: { minSubstance: 'short', maxProbes: 0, allowUnknown: false, allowDefer: false },
    effort: { minutes: 1, turns: 2 },
    // Eine Wahl aus einer GESCHLOSSENEN Menge kann dem Dokument nicht
    // widersprechen, ohne dass es die Menge selbst täte — der teure Blick
    // über alle Kapitel wäre hier bezahlte Gewissheit.
    review: 'light',
  },
  derive: {
    answers: { minSubstance: 'short', maxProbes: 1, allowUnknown: false, allowDefer: false },
    effort: { minutes: 1, turns: 2 },
    review: 'full',
  },
  draft: {
    answers: { minSubstance: 'short', maxProbes: 1, allowUnknown: false, allowDefer: false },
    effort: { minutes: 2, turns: 3 },
    review: 'full',
  },
  instrument: {
    answers: { minSubstance: 'short', maxProbes: 0, allowUnknown: false, allowDefer: false },
    effort: { minutes: 3, turns: 1 },
    review: 'full',
  },
}

/**
 * DER DEFAULT JE FÜLLWEG (§2.3): was George ABLEITET, ENTWIRFT oder was ein
 * Mensch AUSWÄHLT, ist eine Festlegung; was er frei ANTWORTET, ist Material.
 *
 * Die Richtung ist kein Zufall: ein `derivation`/`stage-edit`/`choice`-Wert
 * hat den Weg durch Entwurf und Bestätigung genommen und steht danach als
 * Satz da, den man zitieren kann. Eine `question` ist die Rohantwort, aus der
 * genau das gemacht wurde — sie doppelt zu zeigen, machte aus dem Handbuch
 * ein Protokoll. `special` (heute nur `d.pairs`) ist ein Instrument, sein
 * Wert ist eine Messung.
 */
const AUDIENCE_BY_TYPE: Readonly<Record<BrandSlotType, BrandSessionAudience>> = {
  derivation: 'foundation',
  'stage-edit': 'foundation',
  choice: 'foundation',
  question: 'internal',
  special: 'internal',
}

/**
 * DIE AUSNAHMEN VON DER TYP-REGEL (§2.3) — namentlich, mit Grund.
 *
 * Sie stehen als TABELLE und nicht als 18 Zusätze in den Katalog-Zeilen: die
 * Frage „warum steht das im Handbuch und jenes nicht?" wird an EINER Stelle
 * beantwortet, und wer eine Session hinzufügt, sieht hier, welche Fälle es
 * überhaupt gibt.
 *
 * NICHT AUFGEFÜHRT sind die vier `sensitivity: 'internal'`-Sessions
 * (`a.competitors`, `a.complaints`, `a.challenge`, `a.facts`): sie kommen
 * über die Verbindungsregel in `audienceFor` auf `internal`, und sie hier ein
 * zweites Mal zu nennen hiesse, zwei Stellen gleichzeitig richtig halten zu
 * müssen.
 */
const AUDIENCE_EXCEPTIONS: Readonly<Record<string, BrandSessionAudience>> = {
  // ── Menschenfragen, die trotzdem eine FESTLEGUNG sind ──────────────────
  // Sie beantworten keine Vorfrage, sondern legen etwas fest, das ein Leser
  // anwenden muss: für wen wir erste Wahl sind, was ein Wert konkret heisst,
  // welcher Wert im Konflikt gewinnt, wonach eingestellt wird, welche Wörter
  // wir nie benutzen.
  'b.positioningFirstChoice': 'foundation',
  'c.livedExamples': 'foundation',
  'c.conflictRule': 'foundation',
  'c.teamFilter': 'foundation',
  'd.vocabulary': 'foundation',
  // Das ZIEL-GEFÜHL ist eine Festlegung der Stimme (Konzept §2.2 nennt es
  // als Quelle von Kapitel 6): was der Leser beim Kontakt empfinden soll,
  // muss jeder wissen, der im Namen der Marke schreibt.
  'd.emotion': 'foundation',

  // ── Entwürfe und Auswahlen, die trotzdem MATERIAL sind ─────────────────
  // Rohanalyse der bestehenden Website — eine Beobachtung über das Gestern.
  'a.toneAnalysis': 'internal',
  // Kandidaten sind der Vorrat, aus dem gewählt wurde; die Wahl ist `c.final`
  // bzw. `f.shortlist`/`f.decision`.
  'c.candidates': 'internal',
  'f.candidates': 'internal',
  'f.shortlist': 'internal',
  // Die Namens-ART und der GESCHMACK steuern die Kandidaten; im Handbuch
  // steht der Name, nicht wie man auf ihn gekommen ist.
  'f.nameType': 'internal',
  // Zwischenschritte des Archetyps: Hypothese aus der Aussenansicht und die
  // Abweichung zwischen Selbst- und Aussenbild. Die Festlegung sind
  // `d.primary`/`d.secondary`.
  'd.hypothesis': 'internal',
  'd.gapReveal': 'internal',
  // Baustein des Manifests: die Aussagen-Sammlung ist die Werkbank; im
  // Handbuch stehen das Manifest, die Zeile für die Wand — und die
  // Komposition (Ton/Länge/Verwendung, `e.composition`, per Typ-Regel
  // Festlegung: Konzept §2.2 nennt sie als Quelle von Kapitel 7).
  'e.statements': 'internal',
  // Die RICHTUNG rendert Kapitel 10 gesondert (Paket G4, mit Preset-Tokens),
  // nicht als Wert-Block; die Bewertung ist Betriebs-Rückmeldung.
  'result.direction': 'internal',
  'result.rating': 'internal',

  // ── Brand Design, Schicht 2 (D0) ───────────────────────────────────────
  // Die WEICHE „Habt ihr Vorbilder?" steuert den Weg durch das Kapitel; sie
  // ist keine Festlegung über die Marke, sondern eine Auskunft über diese
  // Sitzung — dasselbe Muster wie `f.nameType`.
  'g.source': 'internal',
  // Der VORRAT, aus dem gewählt wird (`g.board`) — wie `c.candidates` und
  // `f.candidates`. Im Handbuch steht das gewählte Board, nicht die drei.
  'g.boards': 'internal',

  // ── Brand Book & Kit, Schicht 3 (K0) ───────────────────────────────────
  // Der PRESSE-KONTAKT ist eine Menschenfrage und trotzdem eine Festlegung:
  // er steht im Pressekit, in `brand.md` und in jeder Datei, die die Marke
  // weitergibt (§2.4). Er reist BY DESIGN — genau deshalb sagt die Werkstatt
  // es vor der Abnahme laut (`p.contact`, Leiter in `sessionContent.ts`).
  'p.contact': 'foundation',
}

/**
 * Die Zielgruppe EINER Session — Ausnahme vor Typ-Default, und über beidem
 * die Verbindungsregel zu `sensitivity` (s. `BrandSessionAudience`).
 */
function audienceFor(
  definition: Pick<BrandSlotDefinition, 'id' | 'type'>,
  sensitivity: BrandSessionSensitivity,
): BrandSessionAudience {
  if (sensitivity !== 'public') return 'internal'
  return AUDIENCE_EXCEPTIONS[definition.id] ?? AUDIENCE_BY_TYPE[definition.type]
}

/**
 * REIST DIESE SESSION? — die EINE Frage hinter Share-Link, Export und
 * Leseansicht (§2.3/§2.8): öffentlich UND Festlegung.
 *
 * Sie ist eine UND-Verknüpfung und keine Wahl zwischen zwei Feldern: „darf
 * es raus" und „gehört es ins Handbuch" sind verschiedene Fragen, und beide
 * müssen mit Ja beantwortet sein. Deaktivierte Sessions reisen ebenfalls
 * nicht — sie gehören nicht mehr zum Bauplan der Marke, also auch nicht in
 * ihr Abbild.
 */
export function sessionTravels(
  session: Pick<BrandSlot, 'sensitivity' | 'audience' | 'deactivated'>,
): boolean {
  if (session.deactivated) return false
  return session.sensitivity === 'public' && session.audience === 'foundation'
}

const EMPTY_STRINGS: readonly string[] = []
const EMPTY_EXAMPLES: BrandSessionExamples = {
  new: { de: EMPTY_STRINGS, en: EMPTY_STRINGS },
  relaunch: { de: EMPTY_STRINGS, en: EMPTY_STRINGS },
}
const EMPTY_LADDER: BrandSessionLadder = { opening: '', probes: EMPTY_STRINGS, reframes: EMPTY_STRINGS }

/**
 * Baut EINEN Eintrag. Die i18n-Schlüssel und `schema` entstehen aus der Id
 * bzw. aus `kind`/`maxLength` — beides kann deshalb nicht auseinanderlaufen.
 *
 * SEIT BW2 baut sie die volle `BrandSessionConfig`: Struktur aus der Zeile
 * hier, Inhalt aus `SESSION_CONTENT[id]`, alles Übrige aus den Vorgaben je
 * Arbeitsform. Fehlt der Inhalts-Eintrag, bleibt `goal` leer — und genau das
 * lässt `validateSlotRegistry` rot werden, statt eine Session ohne Ziel still
 * durchzulassen.
 */
function defineSession(definition: BrandSlotDefinition): BrandSessionConfig {
  const content: BrandSessionContent | undefined = SESSION_CONTENT[definition.id]
  const kind = sessionKindFor({ id: definition.id, type: definition.type })
  const defaults = KIND_DEFAULTS[kind]
  const dependencies = definition.dependencies ?? []
  const schema: BrandSlotSchema = { kind: definition.kind, maxLength: definition.maxLength }
  const sensitivity: BrandSessionSensitivity = content?.sensitivity ?? 'public'

  return {
    id: definition.id,
    stepId: definition.stepId,
    type: definition.type,
    required: definition.required,
    schema,
    dependencies,
    questionKey: `brand.q.${definition.id}`,
    helpKey: definition.help ? `brand.help.${definition.id}` : null,
    editor: definition.editor,
    generator: definition.generator,
    maxLength: definition.maxLength,
    ...(definition.pathVariants ? { pathVariants: definition.pathVariants } : {}),
    ...(definition.teamVariant ? { teamVariant: definition.teamVariant } : {}),
    ...(definition.teamExample ? { teamExample: definition.teamExample } : {}),
    ...(definition.teamParts ? { teamParts: definition.teamParts } : {}),
    ...(definition.deactivated ? { deactivated: definition.deactivated } : {}),

    kind,
    goal: content?.goal ?? '',
    parts: content?.parts ?? EMPTY_STRINGS,
    inputs: {
      slots: dependencies,
      // Nur Baustein A schöpft aus der Startkarte — seine Slots haben genau
      // deshalb keine `dependencies` (s. Kopf). Ab B sind die ANTWORTEN die
      // primäre Quelle und die Karte nur noch Hintergrund.
      startCard: content?.startCard ?? definition.stepId === 'context',
      siteAnalysis: content?.siteAnalysis ?? false,
      notes: 'chapter',
    },
    processing: {
      rules: content?.rules ?? EMPTY_STRINGS,
      pathRules: {
        new: content?.pathRules?.new ?? EMPTY_STRINGS,
        relaunch: content?.pathRules?.relaunch ?? EMPTY_STRINGS,
      },
      // WIE hier gefragt wird, sagt das Beraterteam und nicht diese Zeile —
      // eine zweite gepflegte Zuordnung liefe irgendwann auseinander.
      technique: techniqueForStep(definition.stepId).key,
    },
    answers: content?.answers ? { ...defaults.answers, ...content.answers } : defaults.answers,
    output: {
      schema,
      editor: definition.editor,
      generator: definition.generator,
      review: defaults.review,
    },
    quality: content?.quality ?? EMPTY_STRINGS,
    antiPatterns: content?.antiPatterns ?? EMPTY_STRINGS,
    examples: content?.examples ?? EMPTY_EXAMPLES,
    ladder: content?.ladder ?? EMPTY_LADDER,
    form: {
      person: 'fromTeam',
      tense: 'any',
      maxWords: null,
      forbidden: EMPTY_STRINGS,
      ...content?.form,
    },
    invariants: content?.invariants ?? [],
    sensitivity,
    // STRUKTUR, nicht Inhalt: `audience` steht bewusst nicht in
    // `sessionContent.ts` (dort lebt der Prompt-Text) — es beschreibt, wo ein
    // Wert HINGEHÖRT, und das entscheidet der Katalog.
    audience: audienceFor(definition, sensitivity),
    effort: content?.effort ?? defaults.effort,
  }
}

/**
 * DER KATALOG. Reihenfolge = Reihenfolge der Bausteine und innerhalb eines
 * Bausteins ERST DIE FRAGEN, DANN DIE ABLEITUNGEN (Davids Entscheidung
 * 2026-09-09, Regel und Wächter in `brandSessionGroups.ts`); sie ist zugleich
 * die topologische Ordnung der `dependencies` (s. Kopf) und die Reihenfolge,
 * in der `resolveNextQuestion` fragt.
 *
 * Wo eine Frage von einer Ableitung DESSELBEN Kapitels schöpft (`c.final` aus
 * `c.candidates`, `f.shortlist` aus `f.candidates`, `h.neutral` aus `h.base`,
 * …), bleibt die Katalog-Reihenfolge stehen: die Trennung wäre dort ein
 * Zyklus. `validateSessionOrder` verlangt für jedes gemischte Kapitel genau
 * diesen Nachweis — ein Kapitel kann nicht still gemischt bleiben.
 */
export const BRAND_SLOTS: readonly BrandSlot[] = [
  // ── A · Kontext (Katalog §4) — 11 Slots ─────────────────────────────────
  // Alle A-Slots ohne `dependencies`: sie schöpfen aus der Startkarte, und
  // die ist kein Slot (s. Kopf).
  //
  // ERST DIE FRAGEN, DANN DIE ABLEITUNGEN (Davids Klick-Test 2026-09-09,
  // s. `brandSessionGroups.ts`): bis dahin standen hier die fünf Ableitungen
  // VOR den sechs Fragen. George springt an ihnen vorbei (`resolveNextSession`
  // fragt nur `ask`/`collect`/`choose`) — im Klick-Test las sich das, als
  // übersprünge die Werkstatt die halbe Leiste.
  // W1 tauscht die Fassung: Ursprungsgeschichte (neu) bzw. R1–R4 (Relaunch, Katalog §2.3).
  defineSession({ id: 'a.origin', stepId: 'context', type: 'question', required: true, kind: 'text', maxLength: LONG, editor: 'textarea', generator: 'none', pathVariants: { new: true, relaunch: true }, teamVariant: true }),
  defineSession({ id: 'a.customerPraise', stepId: 'context', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true, teamExample: true }),
  defineSession({ id: 'a.complaints', stepId: 'context', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'a.oneThing', stepId: 'context', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'a.challenge', stepId: 'context', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'a.facts', stepId: 'context', type: 'choice', required: true, kind: 'structured', maxLength: SHORT, editor: 'chips', generator: 'none', teamVariant: true, teamParts: ['age', 'markets'] }),
  defineSession({ id: 'a.pitch', stepId: 'context', type: 'derivation', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'derive' }),
  defineSession({ id: 'a.category', stepId: 'context', type: 'derivation', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'derive' }),
  defineSession({ id: 'a.competitors', stepId: 'context', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'draft' }),
  defineSession({ id: 'a.audienceSketch', stepId: 'context', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft' }),
  // Nicht Pflicht: eine neue Marke hat keine Texte, die man analysieren könnte.
  defineSession({ id: 'a.toneAnalysis', stepId: 'context', type: 'derivation', required: false, kind: 'text', maxLength: LONG, editor: 'none', generator: 'derive' }),

  // ── B · Purpose · Vision · Mission + Positionierung (Katalog §5) — 10 ───
  // ABWEICHUNG von der Zählung „B: 8": der Katalog führt
  // `b.purpose / b.vision / b.mission` in EINER Tabellenzeile, es sind aber
  // DREI stabile Slot-Ids mit je eigenem Entwurf und eigener Konfidenz
  // (Abdeckungs-Matrix §15, Formular 02 §6/§8/§10 — drei getrennte
  // „Draft + Konfidenz"-Paare). Eine gemeinsame Id wäre im Speicher ein
  // Klumpen, den man nicht einzeln neu entwerfen kann.
  defineSession({ id: 'b.whyStarted', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'derive', dependencies: ['a.origin'], pathVariants: { new: true, relaunch: true }, teamVariant: true }),
  defineSession({ id: 'b.worldLoses', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b.conviction', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b.tenYears', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b.legacy', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b.positioningCategory', stepId: 'pvm', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'derive', help: true, dependencies: ['a.pitch', 'a.category', 'a.competitors'], teamVariant: true }),
  defineSession({ id: 'b.positioningFirstChoice', stepId: 'pvm', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b.purpose', stepId: 'pvm', type: 'stage-edit', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'draft', help: true, dependencies: ['a.pitch', 'b.whyStarted', 'b.worldLoses', 'b.conviction'] }),
  defineSession({ id: 'b.vision', stepId: 'pvm', type: 'stage-edit', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'draft', help: true, dependencies: ['a.oneThing', 'b.tenYears', 'b.legacy'] }),
  defineSession({ id: 'b.mission', stepId: 'pvm', type: 'stage-edit', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'draft', help: true, dependencies: ['a.pitch', 'a.audienceSketch', 'a.oneThing', 'a.customerPraise', 'b.purpose'] }),

  // ── B2 · Markenarchitektur (Katalog §5a, nur bei W4 = ja) — 5 ───────────
  // `required: true` INNERHALB des Bausteins; ob er überhaupt läuft,
  // entscheidet die Weiche in brandJourney.ts.
  defineSession({ id: 'b2.visibility', stepId: 'architecture', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'text', generator: 'none', teamVariant: true }),
  defineSession({ id: 'b2.roleOfMaster', stepId: 'architecture', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'text', generator: 'none' }),
  defineSession({ id: 'b2.namingPattern', stepId: 'architecture', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'text', generator: 'none' }),
  defineSession({ id: 'b2.model', stepId: 'architecture', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'derive', help: true, dependencies: ['a.category', 'b.positioningCategory', 'b2.visibility', 'b2.roleOfMaster', 'b2.namingPattern'], teamVariant: true }),
  defineSession({ id: 'b2.rule', stepId: 'architecture', type: 'stage-edit', required: true, kind: 'text', maxLength: SHORT, editor: 'stage', generator: 'draft', dependencies: ['b2.model', 'b2.namingPattern'] }),

  // ── C · Werte (Katalog §6) — 9 ──────────────────────────────────────────
  // ABWEICHUNG von der Zählung „C: 7": `c.discovery1–3` sind DREI Ids. Die
  // KI wählt drei aus dem Sieben-Pool (§6) — welche, steht im gefüllten
  // Slot; eine gemeinsame Id könnte nicht sagen, welche Frage beantwortet
  // wurde. Dieselbe Auflösung wie bei `e.warmup1/2`.
  defineSession({ id: 'c.discovery1', stepId: 'values', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'c.discovery2', stepId: 'values', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none' }),
  defineSession({ id: 'c.discovery3', stepId: 'values', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true, teamExample: true }),
  defineSession({ id: 'c.candidates', stepId: 'values', type: 'derivation', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'candidates', help: true, dependencies: ['a.origin', 'a.customerPraise', 'a.complaints', 'b.conviction', 'c.discovery1', 'c.discovery2', 'c.discovery3'] }),
  defineSession({ id: 'c.final', stepId: 'values', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'chips', generator: 'none', help: true, dependencies: ['c.candidates'], teamVariant: true }),
  defineSession({ id: 'c.definitions', stepId: 'values', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['c.discovery1', 'c.discovery2', 'c.discovery3', 'c.final'] }),
  defineSession({ id: 'c.livedExamples', stepId: 'values', type: 'question', required: true, kind: 'list', maxLength: LONG, editor: 'textarea', generator: 'none', dependencies: ['c.final'], teamVariant: true }),
  defineSession({ id: 'c.conflictRule', stepId: 'values', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', dependencies: ['c.final'], teamVariant: true }),
  // Nur die Team-Fassung stellt diese Frage (W3) — deshalb nicht Pflicht.
  defineSession({ id: 'c.teamFilter', stepId: 'values', type: 'question', required: false, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', dependencies: ['c.final'], teamVariant: true }),

  // ── D · Archetyp & Stimme (Katalog §7 + §12) — 12 ───────────────────────
  // ABWEICHUNG von der Zählung „D: 11": `d.primary/d.secondary` stehen im
  // Katalog in einer Zeile, sind aber zwei berechnete Werte („Der Weise ·
  // Rest Schöpfer", §12.2) und damit zwei Ids.
  //
  // MENSCHENFRAGEN ZUERST (Davids Entscheidung 2026-09-09): die vier
  // abhängigkeitsfreien Provokationen stehen VOR den fünf Ableitungen — vorher
  // sprang George an d.hypothesis…d.gapReveal vorbei und begann bei der
  // sechsten Zeile der Leiste. Das Kapitel bleibt trotzdem GEMISCHT und
  // bekommt deshalb KEINEN Trenner: `d.voiceSamples`, `d.toneWords` und
  // `d.vocabulary` schöpfen aus `d.primary` und müssen dahinter bleiben.
  defineSession({ id: 'd.party', stepId: 'archetype', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'd.never', stepId: 'archetype', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'd.admired', stepId: 'archetype', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none' }),
  defineSession({ id: 'd.emotion', stepId: 'archetype', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  defineSession({ id: 'd.hypothesis', stepId: 'archetype', type: 'derivation', required: true, kind: 'text', maxLength: SHORT, editor: 'none', generator: 'derive', dependencies: ['a.pitch', 'a.toneAnalysis', 'a.customerPraise'] }),
  defineSession({ id: 'd.pairs', stepId: 'archetype', type: 'special', required: true, kind: 'structured', maxLength: LONG, editor: 'cards', generator: 'none', help: true, dependencies: ['d.hypothesis'], teamVariant: true }),
  defineSession({ id: 'd.primary', stepId: 'archetype', type: 'derivation', required: true, kind: 'choice', maxLength: SHORT, editor: 'none', generator: 'derive', help: true, dependencies: ['d.pairs'] }),
  defineSession({ id: 'd.secondary', stepId: 'archetype', type: 'derivation', required: true, kind: 'choice', maxLength: SHORT, editor: 'none', generator: 'derive', dependencies: ['d.pairs'] }),
  defineSession({ id: 'd.gapReveal', stepId: 'archetype', type: 'derivation', required: true, kind: 'text', maxLength: SHORT, editor: 'none', generator: 'derive', help: true, dependencies: ['d.hypothesis', 'd.primary', 'd.secondary'], pathVariants: { relaunch: true } }),
  defineSession({ id: 'd.voiceSamples', stepId: 'archetype', type: 'choice', required: true, kind: 'list', maxLength: LONG, editor: 'cards', generator: 'draft', dependencies: ['c.final', 'd.primary', 'd.secondary', 'd.party', 'd.emotion'], teamVariant: true }),
  defineSession({ id: 'd.toneWords', stepId: 'archetype', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'chips', generator: 'derive', dependencies: ['a.toneAnalysis', 'd.primary', 'd.emotion'], teamVariant: true }),
  // F→K: der Mensch nennt die NIE-Wörter, George ergänzt Benutzen/Meiden.
  defineSession({ id: 'd.vocabulary', stepId: 'archetype', type: 'question', required: true, kind: 'list', maxLength: LONG, editor: 'textarea', generator: 'derive', dependencies: ['d.primary', 'd.toneWords'], teamVariant: true }),

  // ── E · Manifest (Katalog §8) — 6 ───────────────────────────────────────
  // ABWEICHUNG von der Katalog-Auflistung: `e.compositionTone / e.length /
  // e.usage` sind hier EIN strukturierter Slot `e.composition`. Die drei
  // Chips (Ton, Länge, Verwendung) konfigurieren GEMEINSAM genau eine
  // Komposition und werden nie einzeln neu entworfen; drei Ids hiessen drei
  // inputHash-Quellen für dasselbe Ereignis.
  defineSession({ id: 'e.warmup1', stepId: 'manifesto', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none' }),
  defineSession({ id: 'e.warmup2', stepId: 'manifesto', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', teamVariant: true }),
  // MENSCHENFRAGEN ZUERST (2026-09-09): `e.composition` hängt von nichts ab und
  // steht deshalb VOR dem ersten Entwurf. `e.anchorLine` wählt eine Zeile aus
  // `e.manifesto` und bleibt hinten — das Kapitel bleibt gemischt, ohne Trenner.
  defineSession({ id: 'e.composition', stepId: 'manifesto', type: 'choice', required: true, kind: 'structured', maxLength: SHORT, editor: 'chips', generator: 'none' }),
  defineSession({ id: 'e.statements', stepId: 'manifesto', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'draft', help: true, dependencies: ['b.purpose', 'b.vision', 'b.mission', 'c.final', 'c.definitions', 'd.primary', 'd.toneWords', 'e.warmup1', 'e.warmup2'] }),
  // Der EINE Markdown-Slot (Plan §3e „Editor- & Inhaltsformat").
  defineSession({ id: 'e.manifesto', stepId: 'manifesto', type: 'stage-edit', required: true, kind: 'richtext', maxLength: LONG, editor: 'stage', generator: 'draft', help: true, dependencies: ['d.toneWords', 'e.statements', 'e.composition'] }),
  defineSession({ id: 'e.anchorLine', stepId: 'manifesto', type: 'choice', required: true, kind: 'text', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['e.manifesto'], teamVariant: true }),

  // ── E+ · Verbale Identität (Katalog §9) — 5 ─────────────────────────────
  defineSession({ id: 'ep.taglines', stepId: 'verbal', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'cards', generator: 'candidates', dependencies: ['b.purpose', 'b.positioningFirstChoice', 'c.final', 'd.primary', 'e.anchorLine'] }),
  defineSession({ id: 'ep.distinctiveAsset', stepId: 'verbal', type: 'choice', required: true, kind: 'text', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['e.anchorLine'], teamVariant: true }),
  defineSession({ id: 'ep.boilerplates', stepId: 'verbal', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['a.pitch', 'b.purpose', 'b.vision', 'b.mission', 'b.positioningCategory', 'd.toneWords'] }),
  defineSession({ id: 'ep.keyMessages', stepId: 'verbal', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['a.audienceSketch', 'b.mission', 'c.final', 'd.toneWords'] }),
  defineSession({ id: 'ep.vocabulary', stepId: 'verbal', type: 'derivation', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'derive', dependencies: ['d.toneWords', 'd.vocabulary'] }),

  // ── F · Name (Katalog §10, nur per W2/Neuschnitt) — 8 ───────────────────
  defineSession({ id: 'f.nameType', stepId: 'naming', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'none', help: true, teamVariant: true }),
  defineSession({ id: 'f.taste', stepId: 'naming', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none', help: true }),
  defineSession({ id: 'f.noGos', stepId: 'naming', type: 'question', required: true, kind: 'text', maxLength: SHORT, editor: 'textarea', generator: 'none' }),
  defineSession({ id: 'f.candidates', stepId: 'naming', type: 'derivation', required: true, kind: 'list', maxLength: LONG, editor: 'cards', generator: 'candidates', dependencies: ['a.category', 'a.audienceSketch', 'a.competitors', 'b.purpose', 'c.final', 'd.primary', 'd.emotion', 'f.nameType', 'f.taste', 'f.noGos'] }),
  defineSession({ id: 'f.shortlist', stepId: 'naming', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['f.candidates'] }),
  defineSession({ id: 'f.checks', stepId: 'naming', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'derive', help: true, dependencies: ['f.shortlist'] }),
  defineSession({ id: 'f.criteria', stepId: 'naming', type: 'choice', required: true, kind: 'structured', maxLength: LONG, editor: 'chips', generator: 'none', dependencies: ['f.shortlist', 'f.checks'], teamVariant: true }),
  defineSession({ id: 'f.decision', stepId: 'naming', type: 'choice', required: true, kind: 'structured', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['f.shortlist', 'f.checks', 'f.criteria'], teamVariant: true }),

  // ── Ergebnis (Katalog §11) — 2 ──────────────────────────────────────────
  defineSession({ id: 'result.direction', stepId: 'result', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['d.primary', 'd.toneWords', 'e.anchorLine'], teamVariant: true }),
  // „freiwillige Abschlussfrage" (Katalog §11) — nie Pflicht.
  defineSession({ id: 'result.rating', stepId: 'result', type: 'choice', required: false, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'none' }),

  // ══ SCHICHT 2 · BRAND DESIGN (Konzept §2.2–§2.7, Paket D0) ═══════════════
  // Sie stehen NACH dem Ergebnis, weil sie danach kommen — und weil die
  // Rückwärts-Regel der `dependencies` sonst nicht hielte: jede Design-Session
  // schöpft aus bestätigten Foundation-Werten (Archetyp, Ton-Wörter, Werte,
  // Richtung), nie umgekehrt.
  //
  // ── WAS HIER HEUTE NOCH NICHT STEHT ─────────────────────────────────────
  // Die Instrumente. `g.inspiration` (Vorbilder hochladen) und `j.drafts`
  // (KI-Entwürfe) sind `type: 'special'` wie `d.pairs` — deklariert, aber
  // nicht bedienbar (`slotIsConfirmable`), und deshalb `required: false`:
  // ein Pflicht-Feld ohne Bedienung wäre eine stumme Sackgasse (Audit A4).
  // Gebaut werden sie in D2 bzw. D5c.

  // ── G · Moodboard (§2.2) — 7 ────────────────────────────────────────────
  // `editor: 'cards'` (D2a): die Weiche hat einen GESCHLOSSENEN Vertrag
  // (`brandChoiceOptions.ts`), und `choiceCardsFor` in der Werkstatt verlangt
  // beides — Vertrag UND `cards`. Mit `chips` stand hier ein Textfeld, in das
  // der Mensch die rohe Id `inspiration` hätte tippen müssen.
  defineSession({ id: 'g.source', stepId: 'dna', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', teamVariant: true }),
  // Vorbilder sind FREMDWERKE und bleiben privat (§2.13) — `sensitivity:
  // 'internal'` in `sessionContent.ts`, `audience` folgt daraus.
  defineSession({ id: 'g.inspiration', stepId: 'dna', type: 'special', required: false, kind: 'structured', maxLength: LONG, editor: 'uploads', generator: 'none', dependencies: ['g.source'] }),
  defineSession({ id: 'g.reading', stepId: 'dna', type: 'derivation', required: false, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'derive', dependencies: ['g.inspiration'] }),
  defineSession({ id: 'g.dna', stepId: 'dna', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'derive', dependencies: ['c.final', 'd.primary', 'd.toneWords', 'result.direction', 'g.reading'] }),
  // PURE Regel, kein KI-Aufruf (§2.2): drei Varianten derselben Belegung.
  defineSession({ id: 'g.boards', stepId: 'dna', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'cards', generator: 'none', dependencies: ['g.dna'] }),
  defineSession({ id: 'g.board', stepId: 'dna', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['g.boards'], teamVariant: true }),
  defineSession({ id: 'g.mix', stepId: 'dna', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['g.dna', 'g.board'] }),

  // ── H · Farbwelt (§2.3) — 6 ─────────────────────────────────────────────
  // MENSCHENFRAGEN ZUERST (2026-09-09): hier bewegt sich NICHTS. Die beiden
  // Wahlen des Kapitels (`h.neutral`, `h.accent`) rechnen BEIDE auf `h.base`,
  // einer Ableitung DIESES Kapitels — sie sind damit abhängig und müssen hinter
  // ihr bleiben. Eine abhängigkeitsfreie Menschenfrage hat die Farbwelt nicht,
  // also gibt es nichts nach vorn zu rücken; das Kapitel bleibt gemischt und
  // ohne Trenner.
  // `generator: 'none'` (D3): die drei Kandidaten sind eine DETERMINISTISCHE
  // Rechnung aus Richtung und Farbwelt (`brandBaseCandidates`), kein
  // Modell-Lauf. Mit `candidates` trüge die Bühne einen Entwurfs-Knopf, und der
  // schriebe Prosa in ein Feld, das genau einen Hex-Wert hält.
  defineSession({ id: 'h.base', stepId: 'color', type: 'derivation', required: true, kind: 'text', maxLength: SHORT, editor: 'text', generator: 'none', dependencies: ['g.mix'] }),
  // PUR: die Ramp-Mathematik der Themes-Engine (`buildBrandDesign`), kein Modell.
  defineSession({ id: 'h.ramp', stepId: 'color', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['h.base'] }),
  defineSession({ id: 'h.neutral', stepId: 'color', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['h.base'], teamVariant: true }),
  defineSession({ id: 'h.accent', stepId: 'color', type: 'choice', required: true, kind: 'text', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['h.base'], teamVariant: true }),
  defineSession({ id: 'h.roles', stepId: 'color', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['h.ramp', 'h.neutral', 'h.accent'] }),
  // PUR: Kontrast-Paare mit WCAG-Urteil, gerechnet aus den Hex-Werten.
  defineSession({ id: 'h.contrast', stepId: 'color', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['h.ramp', 'h.roles'] }),

  // ── I · Typografie (§2.4) — 3 ───────────────────────────────────────────
  // `generator: 'none'` FÜR ALLE DREI (D4, dieselbe Begründung wie bei `h.base`
  // in D3): Paar, Hierarchie und Regeln sind eine WAHL bzw. eine Rechnung auf
  // der Werkbank — mit `derive`/`draft` trüge die Bühne einen Entwurfs-Knopf,
  // und der schriebe Prosa in Felder, die eine Katalog-Id, eine zweite
  // Katalog-Id und vier beschriftete Blöcke halten.
  defineSession({ id: 'i.pair', stepId: 'type', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['g.mix'], teamVariant: true }),
  // PUR: die Hierarchie folgt aus DNA „Typografie" und „Komposition".
  defineSession({ id: 'i.scale', stepId: 'type', type: 'derivation', required: true, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['g.mix', 'i.pair'] }),
  defineSession({ id: 'i.rules', stepId: 'type', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'none', dependencies: ['i.pair', 'i.scale'] }),

  // ── J · Zeichen (§2.5, drei Stufen) — 5 ─────────────────────────────────
  defineSession({ id: 'j.kind', stepId: 'mark', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'derive', dependencies: ['g.mix'], teamVariant: true }),
  defineSession({ id: 'j.brief', stepId: 'mark', type: 'stage-edit', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['g.mix', 'h.roles', 'i.pair', 'j.kind'] }),
  // PUR: Wortmarke und Monogramm als SVG aus Schriftpaar und Farbwelt.
  defineSession({ id: 'j.examples', stepId: 'mark', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['h.base', 'i.pair', 'j.kind'] }),
  defineSession({ id: 'j.pick', stepId: 'mark', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['j.examples'], teamVariant: true }),
  // Entwürfe reisen NIE in Snapshot oder Share (§1.11 b) — `internal`.
  defineSession({ id: 'j.drafts', stepId: 'mark', type: 'special', required: false, kind: 'structured', maxLength: LONG, editor: 'drafts', generator: 'none', dependencies: ['j.brief'] }),

  // ── K · Bildsprache (§2.6) — 4 ──────────────────────────────────────────
  // `generator: 'none'` FÜR ALLE VIER (D6, dieselbe Begründung wie bei `h.base`
  // in D3 und dem Typografie-Block darüber): Prinzip, Illustration, Icons und
  // das Do & Don't sind eine WAHL bzw. eine Rechnung auf der Werkbank
  // (`shared/brandDesignImagery.ts`) — mit `derive`/`draft` trüge die Bühne
  // einen Entwurfs-Knopf, und der schriebe Prosa in Felder, die fünf
  // beschriftete Blöcke, zwei Katalog-Ids und sechs geprüfte Paare halten.
  // §1.4 gilt hier doppelt: Bildsprache sind REGELN, kein Modell-Text.
  defineSession({ id: 'k.illustration', stepId: 'imagery', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['g.mix'], teamVariant: true }),
  defineSession({ id: 'k.icons', stepId: 'imagery', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['i.pair'], teamVariant: true }),
  defineSession({ id: 'k.photo', stepId: 'imagery', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'cards', generator: 'none', dependencies: ['g.mix'] }),
  // PUR: vier Achsen des Prinzips plus je ein Paar aus Illustration und Icons.
  defineSession({ id: 'k.dodont', stepId: 'imagery', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'none', dependencies: ['k.photo', 'k.illustration', 'k.icons'] }),

  // ── L · Bewegung (§2.7) — 4 ─────────────────────────────────────────────
  // `generator: 'none'` FÜR ALLE VIER (D7, dieselbe Begründung wie in D4 und
  // D6): das Tempo ist eine WAHL, die Übergänge sind eine RECHNUNG
  // (`brandMotionTransitions`, D0), und die Regeln folgen aus beidem
  // (`shared/brandDesignMotion.ts`). Mit `derive`/`draft` trüge die Bühne einen
  // Entwurfs-Knopf, und der schriebe Prosa in Felder, die eine Katalog-Id, vier
  // Tokens und sechs prüfbare Sätze halten.
  defineSession({ id: 'l.tempo', stepId: 'motion', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['g.mix'], teamVariant: true }),
  defineSession({ id: 'l.logo', stepId: 'motion', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', dependencies: ['j.kind', 'l.tempo'], teamVariant: true }),
  // PUR: Dauern, Easing und Versatz als Token-Satz aus dem Tempo.
  defineSession({ id: 'l.transitions', stepId: 'motion', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['l.tempo'] }),
  defineSession({ id: 'l.rules', stepId: 'motion', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'none', dependencies: ['l.tempo', 'l.transitions', 'l.logo'] }),

  // ══ SCHICHT 3 · BRAND BOOK & KIT (Konzept §2.2–§2.4, Paket K0) ═══════════
  // Sie stehen NACH Brand Design, weil sie danach kommen — und weil die
  // Rückwärts-Regel der `dependencies` es verlangt: jede Session hier schöpft
  // aus bestätigten Werten der Schichten davor, nie umgekehrt.
  //
  // ── HIER ENTSTEHT NICHTS NEUES ──────────────────────────────────────────
  // §1.11 a: „Book & Kit = kuratieren/exportieren". Zwei Sessions entwerfen
  // (`m.patterns`, `n.guardrails`), alles andere wählt aus einem Katalog,
  // bestätigt eine Herleitung oder rechnet PUR zusammen (`n.prompts`,
  // `p.summary` — null KI-Aufrufe, §2.11).
  //
  // ── WAS HIER HEUTE NOCH NICHT STEHT ─────────────────────────────────────
  // Die Kataloge als Auswahl-VERTRÄGE (`brandChoiceOptions.ts`): `m.types`,
  // `n.scope` und `n.review` haben ihre geschlossenen Mengen in
  // `brandKitVocab.ts`, aber noch keinen Vertrag — den bekommen sie mit K5,
  // zusammen mit den Karten. Dasselbe Verhältnis wie bei Schicht 2, wo die
  // Verträge erst mit D2a/D3 dazukamen.

  // ── M · Nomenklatur (§2.2, Otto) — 3 ────────────────────────────────────
  // MEHRFACHWAHL aus `BRAND_NAME_TYPES`; `kind: 'list'`, weil mehrere Ids im
  // Feld stehen — eine `choice` hielte genau eine.
  defineSession({ id: 'm.types', stepId: 'nomenclature', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'chips', generator: 'none', teamVariant: true }),
  defineSession({ id: 'm.patterns', stepId: 'nomenclature', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['b2.model', 'b2.rule', 'f.decision', 'd.toneWords', 'm.types'] }),
  defineSession({ id: 'm.rules', stepId: 'nomenclature', type: 'stage-edit', required: true, kind: 'list', maxLength: LONG, editor: 'stage', generator: 'none', dependencies: ['m.patterns'] }),

  // ── N · AI-Guidelines (§2.3, Nika) — 4 ──────────────────────────────────
  defineSession({ id: 'n.scope', stepId: 'aiguide', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none', teamVariant: true }),
  defineSession({ id: 'n.review', stepId: 'aiguide', type: 'choice', required: true, kind: 'choice', maxLength: SHORT, editor: 'cards', generator: 'none' }),
  // `m.rules` steht als Quelle drin und ist trotzdem OPTIONAL erreichbar: ohne
  // Markenarchitektur läuft `nomenclature` nicht (§2.20 Nr. 4), und dann
  // stehen die Schreibweisen HIER — genau dafür ist die Abhängigkeit da.
  defineSession({ id: 'n.guardrails', stepId: 'aiguide', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'stage', generator: 'draft', dependencies: ['c.final', 'd.toneWords', 'd.voiceSamples', 'd.vocabulary', 'ep.vocabulary', 'm.rules'] }),
  // PUR (§2.11): drei Vorlagen, aus Werten und Leitplanken gerechnet — kein
  // Modell-Lauf, deshalb `generator: 'none'` und `editor: 'none'`.
  defineSession({ id: 'n.prompts', stepId: 'aiguide', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['d.primary', 'd.toneWords', 'd.voiceSamples', 'n.guardrails'] }),

  // ── P · Pressekit (§2.4, George) — 3 ────────────────────────────────────
  //
  // ── DIE EINE AUSNAHME DER REISE-REGEL, UND WARUM SIE KEINE IST ──────────
  // `p.facts` schöpft aus `a.facts` — der EINZIGEN Quelle dieser Schicht, die
  // `sensitivity: 'internal'` trägt — und ist selbst `public`/`foundation`
  // (§2.10). Das ist keine Durchreichung, sondern eine bewusste AUSWAHL: der
  // Wert dieser Session ist ein NEUER Wert, den ein Mensch Eintrag für Eintrag
  // freigegeben hat (Voreinstellung: keiner). `a.facts` bleibt unverändert
  // intern und reist nie — die Reise-Regel gilt also weiter wörtlich, sie wird
  // nur nicht auf einen Wert angewandt, den es vorher nicht gab.
  // `validateSlotRegistry` lässt das durch (es prüft `sensitivity` GEGEN
  // `audience`, nicht gegen die Quellen); `tests/brandKitRegistry.test.ts`
  // nagelt fest, dass es bei GENAU dieser einen Session bleibt.
  defineSession({ id: 'p.facts', stepId: 'presskit', type: 'choice', required: true, kind: 'list', maxLength: SHORT, editor: 'chips', generator: 'none', dependencies: ['a.facts'] }),
  // OPTIONAL (§2.19 Nr. 3): ein Pressekit ohne Ansprechperson ist ärmer, aber
  // kein halbes — ein `required: true` hielte das Kapitel für jede Marke auf,
  // die die Zuständigkeit erst klären muss.
  defineSession({ id: 'p.contact', stepId: 'presskit', type: 'question', required: false, kind: 'structured', maxLength: SHORT, editor: 'text', generator: 'none', teamVariant: true }),
  // PUR (§2.11): die Vorschau ist eine Zusammenstellung, kein Entwurf.
  defineSession({ id: 'p.summary', stepId: 'presskit', type: 'derivation', required: true, kind: 'structured', maxLength: LONG, editor: 'none', generator: 'none', dependencies: ['ep.taglines', 'ep.boilerplates', 'p.facts', 'p.contact'] }),
]

const SLOTS_BY_ID = new Map<string, BrandSlot>(BRAND_SLOTS.map(slot => [slot.id, slot]))

/** Findet AUCH deaktivierte Slots — ein Leser muss Altdaten anzeigen können. */
export function slotById(slotId: string): BrandSlot | undefined {
  return SLOTS_BY_ID.get(slotId)
}

/** Alle aktiven Slots eines Bausteins, in Katalog-Reihenfolge. */
export function slotsForStep(stepKey: BrandStepKey): readonly BrandSlot[] {
  return BRAND_SLOTS.filter(slot => slot.stepId === stepKey && !slot.deactivated)
}

/** Die Pflicht-Slots eines Bausteins — die Menge, die der Katalog verlangt. */
export function requiredSlotsForStep(stepKey: BrandStepKey): readonly BrandSlot[] {
  return slotsForStep(stepKey).filter(slot => slot.required)
}

/**
 * KANN EIN MENSCH DIESEN SLOT ÜBERHAUPT BESTÄTIGEN?
 *
 * ── WARUM ES DIESE FRAGE GEBEN MUSS (Audit-Befund A4, 2026-09-02) ─────────
 * Der Katalog beschreibt den SOLL-Zustand, die Werkstatt das GEBAUTE. Genau
 * ein Slot fällt heute auseinander: `d.pairs` (Katalog §12, `type: 'special'`)
 * ist ein eigenes Instrument — der Paarvergleich — und das gibt es noch nicht
 * (P4). Er trägt weder Feld noch Bestätigung, `brandSlotControls` sagt das
 * ausdrücklich. `brandStepCompletion` zählte ihn trotzdem als Pflicht: im
 * Baustein `archetype` konnte `slotsReady` deshalb NIE wahr werden, die
 * Konfidenz-Weiche erschien nie, und der Baustein war eine stumme Sackgasse —
 * im Browser wie in der Route, die dieselbe Rechnung liest.
 *
 * DIE ANTWORT IST EINE REGEL, KEIN `required: false` IM KATALOG. Der Katalog
 * bleibt wahr (der Paarvergleich IST eine Pflicht-Entscheidung); was das Gate
 * verlangen darf, ist die Teilmenge, die ein Mensch auch bedienen kann.
 * Bekommt `d.pairs` sein Instrument, wechselt er den `type` und steht ohne
 * weiteres Zutun wieder im Gate — ein `required`-Wechsel im Katalog hätte
 * dagegen REGISTRY_VERSION und die Upcaster mitgezogen.
 *
 * Die BEDIEN-Rechnung liest dieselbe Regel (`brandSlotControls`, Eingabe
 * `confirmable`): Abschluss-Menge und Bedien-Menge meinen damit dasselbe.
 */
export function slotIsConfirmable(slot: BrandSlot): boolean {
  return slot.type !== 'special'
}

/** Der Nenner beider Fortschritts-Formeln: Pflicht UND bestätigbar. */
export function confirmableRequiredSlotsForStep(stepKey: BrandStepKey): readonly BrandSlot[] {
  return requiredSlotsForStep(stepKey).filter(slotIsConfirmable)
}

/**
 * Alle Slots, aus denen dieser Slot (transitiv) schöpft — die Menge, über die
 * der inputHash gebildet wird. Ohne den Slot selbst, in stabiler
 * Katalog-Reihenfolge.
 *
 * Terminiert auch bei einem versehentlich eingebauten Zyklus (`seen`-Menge),
 * statt in die Endlosschleife zu laufen; die Registry-Invarianten schliessen
 * Zyklen zusätzlich strukturell aus (s. Kopf) — aber ein Helfer, der bei
 * fehlerhaften Daten hängt, wäre ein Ausfall statt eines roten Tests. Genau
 * dafür ist `slots` überschreibbar: der Beweis kann ihm eine zyklische Liste
 * vorlegen, ohne die echte Registry zu beschädigen.
 */
export function dependencyClosure(slotId: string, slots: readonly BrandSlot[] = BRAND_SLOTS): readonly string[] {
  const lookup = slots === BRAND_SLOTS ? SLOTS_BY_ID : new Map(slots.map(slot => [slot.id, slot]))
  const seen = new Set<string>()
  const walk = (id: string): void => {
    for (const dependencyId of lookup.get(id)?.dependencies ?? []) {
      if (seen.has(dependencyId)) continue
      seen.add(dependencyId)
      walk(dependencyId)
    }
  }
  walk(slotId)
  return slots.filter(slot => seen.has(slot.id)).map(slot => slot.id)
}

/** Die erlaubten Minuten-Stufen (Plan §3a Nr. 8) — als Liste, nicht als Union-Cast. */
const BRAND_EFFORT_MINUTES: readonly number[] = [1, 2, 3, 5, 10]

/**
 * Die Felder einer Session, die ein MENSCH zu sehen bekommt — Info-Modal und
 * Abnahme-Seite (Plan §5a). `processing.rules` steht bewusst NICHT darin: die
 * liest nur das Modell, und die Formeln dort tragen Platzhalter in spitzen
 * Klammern.
 */
function humanReadableTexts(slot: BrandSlot): readonly (readonly [string, readonly string[]])[] {
  return [
    ['goal', [slot.goal]],
    ['quality', slot.quality],
    ['antiPatterns', slot.antiPatterns],
    ['ladder', [slot.ladder.opening, ...slot.ladder.probes, ...slot.ladder.reframes]],
    ['examples', [
      ...slot.examples.new.de, ...slot.examples.new.en,
      ...slot.examples.relaunch.de, ...slot.examples.relaunch.en,
    ]],
  ]
}

/**
 * DIE INVARIANTEN DES KATALOGS als prüfbare Funktion (statt als Prosa im
 * Test): sie nimmt eine BELIEBIGE Slot-Liste, damit der Beweis mutierte
 * Fassungen vorlegen kann — eine Prüfung, die nur die richtige Registry
 * kennt, ist immer grün und beweist nichts.
 *
 * Gibt die Befunde als Zeilen zurück, leeres Array = in Ordnung.
 */
export function validateSlotRegistry(slots: readonly BrandSlot[] = BRAND_SLOTS): readonly string[] {
  const problems: string[] = []
  const seenIds = new Set<string>()
  const position = new Map<string, number>()
  const perStepLength = new Map<BrandStepKey, number>()

  slots.forEach((slot, index) => {
    if (seenIds.has(slot.id)) problems.push(`doppelte Slot-Id: ${slot.id}`)
    seenIds.add(slot.id)
    position.set(slot.id, index)
  })

  slots.forEach((slot, index) => {
    if (!(BRAND_STEP_KEYS as readonly string[]).includes(slot.stepId)) {
      problems.push(`${slot.id}: unbekannter stepId "${slot.stepId}"`)
    }
    if (slot.questionKey !== `brand.q.${slot.id}`) {
      problems.push(`${slot.id}: questionKey folgt nicht brand.q.<id>`)
    }
    if (slot.helpKey !== null && slot.helpKey !== `brand.help.${slot.id}`) {
      problems.push(`${slot.id}: helpKey folgt nicht brand.help.<id>`)
    }
    if (slot.schema.maxLength !== slot.maxLength || slot.maxLength <= 0) {
      problems.push(`${slot.id}: schema.maxLength und maxLength laufen auseinander`)
    }
    if (slot.maxLength > BRAND_SLOT_MAX_LENGTH) {
      problems.push(`${slot.id}: maxLength ${slot.maxLength} > ${BRAND_SLOT_MAX_LENGTH} (Schema-Anhang §2)`)
    }
    if (!slot.deactivated) {
      perStepLength.set(slot.stepId, (perStepLength.get(slot.stepId) ?? 0) + slot.maxLength)
    }
    for (const dependencyId of slot.dependencies) {
      const dependencyIndex = position.get(dependencyId)
      if (dependencyIndex === undefined) {
        problems.push(`${slot.id}: Abhängigkeit "${dependencyId}" existiert nicht`)
        continue
      }
      // Rückwärts-Regel: sie ist zugleich die Zyklen-Freiheit (s. Kopf).
      if (dependencyIndex >= index) {
        problems.push(`${slot.id}: Abhängigkeit "${dependencyId}" steht nicht VOR dem Slot`)
      }
    }

    // ── Der Session-Vertrag (BW2 §3/§3a) ───────────────────────────────────
    if (slot.goal.trim().length === 0) {
      problems.push(`${slot.id}: leeres goal — jede Session braucht ein Ziel`)
    }
    if (slot.kind !== sessionKindFor(slot)) {
      problems.push(`${slot.id}: kind "${slot.kind}" passt nicht zum type "${slot.type}"`)
    }
    // `collect` ist der EINZIGE Typ mit Teilen (Plan §3).
    if (slot.kind === 'collect' && slot.parts.length === 0) {
      problems.push(`${slot.id}: kind "collect" ohne parts`)
    }
    if (slot.kind !== 'collect' && slot.parts.length > 0) {
      problems.push(`${slot.id}: parts sind nur bei kind "collect" erlaubt`)
    }
    if (slot.inputs.slots !== slot.dependencies) {
      problems.push(`${slot.id}: inputs.slots und dependencies sind nicht dieselbe Liste`)
    }
    if (slot.output.schema.kind !== slot.schema.kind || slot.output.schema.maxLength !== slot.maxLength) {
      problems.push(`${slot.id}: output.schema und schema laufen auseinander`)
    }
    if (slot.output.editor !== slot.editor || slot.output.generator !== slot.generator) {
      problems.push(`${slot.id}: output.editor/generator laufen auseinander`)
    }
    // ── Der INHALT der Session (BW2 Paket 2) ───────────────────────────────
    // Die Zahlen stehen im Plan §3a: „3–5 Qualitätskriterien, 2–3 Anti-Muster".
    // Sie sind hier eine SPANNE und keine Untergrenze, weil beides schadet: ein
    // Kriterium zu wenig macht `goalReached` zur Stimmung, zehn machen aus dem
    // Prompt eine Prüfliste, die das Modell überfliegt.
    if (slot.quality.length < 3 || slot.quality.length > 5) {
      problems.push(`${slot.id}: ${slot.quality.length} Qualitätsmerkmale — verlangt sind 3 bis 5`)
    }
    if (slot.antiPatterns.length < 2) {
      problems.push(`${slot.id}: weniger als zwei Anti-Muster`)
    }
    // Die Leiter ist die INTERVIEWFÜHRUNG — sie gehört zu den Sessions, in denen
    // ein Mensch gefragt wird, und zu keiner anderen. Eine Eröffnung an einer
    // Ableitung wäre eine Anweisung, die nie jemand ausführt.
    const asksSomeone = slot.kind === 'ask' || slot.kind === 'collect' || slot.kind === 'choose'
    if (asksSomeone && slot.ladder.opening.trim().length === 0) {
      problems.push(`${slot.id}: kind "${slot.kind}" ohne Eröffnung in der Leiter`)
    }
    if (!asksSomeone && slot.ladder.opening.trim().length > 0) {
      problems.push(`${slot.id}: kind "${slot.kind}" braucht keine Leiter — hier fragt niemand`)
    }
    // BEISPIELE SIND PFLICHT, WO GEORGE ETWAS HINLEGT (Plan §3a Nr. 3 + §5a):
    // ein Entwurf ohne Formvorbild fällt auf den Durchschnitt des Modells
    // zurück, und die Abnahme-Seite hätte an genau diesen Zeilen nichts zu
    // zeigen. Beide Pfade, beide Sprachen — ein Beispiel, das nur eine Sprache
    // hat, fehlt der Hälfte der Kundschaft.
    const drafts = slot.kind === 'derive' || slot.kind === 'draft' || slot.generator === 'candidates'
    if (drafts && !slot.deactivated) {
      for (const pathKind of ['new', 'relaunch'] as const) {
        for (const locale of ['de', 'en'] as const) {
          if (slot.examples[pathKind][locale].length === 0) {
            problems.push(`${slot.id}: kein Beispiel für Pfad "${pathKind}" in "${locale}"`)
          }
        }
      }
    }
    if (!BRAND_EFFORT_MINUTES.includes(slot.effort.minutes) || slot.effort.turns <= 0) {
      problems.push(`${slot.id}: unbrauchbarer Umfang (${slot.effort.minutes} min, ${slot.effort.turns} Züge)`)
    }
    // DIE LEITER UND IHR DECKEL DÜRFEN SICH NICHT WIDERSPRECHEN (Paket 2b,
    // Audit Teil 3 Nr. 1). Bei `maxProbes: 0` ist jede aufgeschriebene
    // Nachfrage tot — der alte Stand schrieb 14-mal die beste Frage der
    // Session auf und verbot sie im selben Atemzug.
    if (slot.answers.maxProbes < slot.ladder.probes.length) {
      problems.push(
        `${slot.id}: ${slot.ladder.probes.length} Nachfragen in der Leiter, `
        + `aber maxProbes ${slot.answers.maxProbes}`,
      )
    }
    // Und der Zug-Deckel muss die Leiter tragen: Eröffnung plus Nachfragen.
    // NUR bei `ask` und `choose`: bei `collect` zählen die Züge die TEILE
    // (a.facts fragt drei Zahlen nacheinander), bei `instrument` ist das ganze
    // Werkzeug EIN Zug — dort bedeutet die Zahl etwas anderes.
    const countsProbeTurns = slot.kind === 'ask' || slot.kind === 'choose'
    if (countsProbeTurns && slot.effort.turns < 1 + slot.answers.maxProbes) {
      problems.push(
        `${slot.id}: ${slot.effort.turns} Züge tragen keine Eröffnung `
        + `plus ${slot.answers.maxProbes} Nachfragen`,
      )
    }
    // WAS NICHT REISEN DARF, IST AUCH KEINE FESTLEGUNG (§2.3). `audienceFor`
    // klemmt das beim Bauen; hier steht der Wächter für jede Fassung, die
    // NICHT durch `defineSession` gegangen ist — ein von Hand gepatchter Slot,
    // ein künftiger Upcaster, ein Test mit eigener Liste. Ohne ihn wäre die
    // Zusage „intern reist nicht" eine Eigenschaft genau EINER Funktion.
    if (slot.sensitivity !== 'public' && slot.audience !== 'internal') {
      problems.push(`${slot.id}: sensitivity "${slot.sensitivity}" verlangt audience "internal"`)
    }
    // VIER FASSUNGEN SIND SEIT DEM 2026-09-09 ERLAUBT — und zwar nur, weil sie
    // an zwei Slots (`a.origin`, `b.whyStarted`) unvermeidlich sind: der
    // Relaunch-Wortlaut redet die Marke an („woran man euch erkennt"), und für
    // „Nur ich" ist das falsch (Davids Entscheidung, DECISION-LOG 2026-09-09).
    // Der alte Wächter verbot die Kombination mit dem Argument „vier Texte
    // liest niemand mehr gegen"; das Argument bleibt richtig, taugt aber nicht
    // als Verbot, wenn die Frage selbst zwei Achsen hat. Was BLEIBT, ist die
    // Kopplung: ein eigenes Beispiel je Weiche gibt es nur, wo auch die Frage
    // eine eigene Fassung hat — sonst zeigte `exampleKeyFor` auf ein Kind
    // unter einem Schlüssel, den `questionKeyFor` als Zeichenkette liest.
    if (slot.teamExample && !slot.teamVariant) {
      problems.push(`${slot.id}: teamExample ohne teamVariant`)
    }
    // DIESELBE KOPPLUNG EINE EBENE TIEFER (`partKeyFor`, 2026-09-09): ein Teil
    // mit eigener Fassung je Weiche muss ein Teil DIESER Session sein — sonst
    // zeigte der Schlüssel auf ein Kind unter einem Namen, den niemand fragt,
    // und die echte Frage bliebe still einsprachig. `teamVariant` gehört dazu,
    // weil es dieselbe Weiche ist: eine Session, deren Klammer-Frage die Anrede
    // NICHT dreht, drehte sie dann nur in der Hälfte ihrer Teile.
    for (const part of slot.teamParts ?? []) {
      if (!slot.parts.includes(part)) problems.push(`${slot.id}: teamParts nennt "${part}" — kein Teil`)
    }
    if (slot.teamParts?.length && !slot.teamVariant) {
      problems.push(`${slot.id}: teamParts ohne teamVariant`)
    }
    // SPITZE KLAMMERN NUR IN DEN VERARBEITUNGSREGELN (die Formeln brauchen ihre
    // Platzhalter, „We exist so that <who> …"). Alles andere hier liest ein
    // MENSCH — im Info-Modal der Session und auf der Abnahme-Seite —, und dort
    // ist eine spitze Klammer entweder HTML oder ein Rest aus einer Schablone.
    for (const [label, texts] of humanReadableTexts(slot)) {
      for (const text of texts) {
        if (/[<>]/.test(text)) problems.push(`${slot.id}: spitze Klammern in ${label}`)
      }
    }

    // Eine Invariante darf nur auf einen Slot zeigen, der VOR ihr steht —
    // sonst prüfte sie beim Bestätigen gegen einen Wert, den es noch gar
    // nicht geben kann.
    for (const invariant of slot.invariants) {
      if (invariant.of === undefined) continue
      const sourceIndex = position.get(invariant.of)
      if (sourceIndex === undefined) {
        problems.push(`${slot.id}: Invariante zeigt auf unbekannten Slot "${invariant.of}"`)
        continue
      }
      if (sourceIndex >= index) {
        problems.push(`${slot.id}: Invariante zeigt auf "${invariant.of}", der nicht VOR dem Slot steht`)
      }
    }
  })

  // Ein verwaister Inhalts-Eintrag ist ein Tippfehler in einer Id — und
  // stünde sonst als „Ziel, das nie gelesen wird" auf Dauer in der Datei.
  if (slots === BRAND_SLOTS) {
    for (const contentId of Object.keys(SESSION_CONTENT)) {
      if (!seenIds.has(contentId)) {
        problems.push(`sessionContent kennt "${contentId}", die Registry nicht`)
      }
    }
  }

  for (const stepKey of BRAND_STEP_KEYS) {
    if (!slots.some(slot => slot.stepId === stepKey && !slot.deactivated)) {
      problems.push(`Baustein "${stepKey}" hat keinen aktiven Slot`)
    }
    const stepLength = perStepLength.get(stepKey) ?? 0
    if (stepLength > BRAND_STEP_SLOTS_MAX_LENGTH) {
      problems.push(`Baustein "${stepKey}": Summe maxLength ${stepLength} > ${BRAND_STEP_SLOTS_MAX_LENGTH}`)
    }
  }

  return problems
}

/**
 * Der Stand EINES Slots, so weit die Fortschritts-Rechnung ihn braucht
 * (Vollform in `brand_steps.slots`, Schema-Anhang §2).
 */
export interface BrandSlotStateFacts {
  /** Ein Wert liegt vor — Georges Entwurf zählt schon. */
  hasValue?: boolean
  /** Der Mensch hat ihn bestätigt. */
  confirmed?: boolean
  /**
   * DER GELTENDE WERT — nur dort gesetzt, wo jemand ihn braucht (BW2 Paket 1).
   *
   * Er ist OPTIONAL und bleibt es: `toSlotFacts` füllt ihn heute nicht, und
   * alle Bestands-Aufrufer reichen weiter nur die zwei Flags. Die Folge ist
   * ausdrücklich FAIL-OPEN — ohne Wert prüft `evaluateInvariants` nichts und
   * `computeSourcesHash` rechnet mit leeren Zeichenketten. Das ist richtig
   * herum: eine Invariante, die mangels Wert zuschlägt, hielte einen Menschen
   * von seinem eigenen Feld fern, weil eine Aufrufstelle etwas nicht mitgibt.
   * Verdrahtet wird der Wert mit Paket 6 (`sourcesHash` beim Bestätigen).
   */
  value?: string
  /**
   * DER STAND DER QUELLEN BEIM BESTÄTIGEN (`computeSourcesHash`, seit Paket 3b
   * verdrahtet — vorgezogen aus Paket 6, weil „Nochmal von vorn" ohne ihn
   * nachgelagerte Felder nicht als veraltet zeigen könnte).
   *
   * FEHLT er, gilt die Session als AKTUELL und nie als veraltet — das ist der
   * Migrationsvertrag §3e in einer Zeile: jedes Bestands-Branding hat ihn
   * nicht, und ein Deploy, der alle 68 Felder bernstein färbt, nimmt einem
   * fertigen Kunden sein Ergebnis.
   */
  sourcesHash?: string
  /**
   * IM ZUSAMMENHANG DES KAPITELS GELESEN UND FÜR GUT BEFUNDEN (Plan §5a).
   *
   * Ein ZWEITER Zustand neben `confirmed`, bewusst: `confirmed` heisst „in der
   * Session so gesagt", `accepted` heisst „auf der Abnahme-Seite neben allem
   * anderen gelesen und angenommen". Er fällt automatisch weg, sobald sich der
   * WERT ändert — und zwar durch den SERVER, nie durch die Oberfläche.
   */
  accepted?: boolean
  /**
   * AUF SPÄTER VERTAGT (Plan §3a, `answers.allowDefer`). JE SESSION, nicht je
   * Teil: ein vertagter `collect` behält seinen Zwischenstand (Fable,
   * 2026-09-04). Vertagen ist kein Wert — es sagt nur, dass hier gerade nichts
   * entschieden wird.
   */
  deferred?: boolean
}

export interface BrandStepProgress {
  requiredTotal: number
  requiredFilled: number
  /** Ganzzahlige Prozent (0–100) — die Form von `brand_profiles.progressPct`. */
  pct: number
}

/**
 * DIE EHRLICHE FORTSCHRITTS-FORMEL (Plan §3b): gefüllte Pflicht-Slots ÷
 * Pflicht-Slots — nicht „Frage 12 von 40".
 *
 * GEFÜLLT ist schon der ENTWURF (`hasValue`), nicht erst die Bestätigung:
 * der Balken soll sich bewegen, wenn George etwas hinlegt. Der ABSCHLUSS
 * eines Bausteins verlangt dagegen `confirmed` (`transitionBrandStep`) — das
 * sind bewusst zwei verschiedene Fragen, und wer sie zusammenzieht, macht
 * entweder den Fortschritt träge oder den Abschluss zu billig.
 *
 * Deaktivierte Slots zählen weder oben noch unten (Migrationsvertrag), und
 * seit A4 auch kein Slot, den niemand bedienen kann (`slotIsConfirmable`):
 * ein Nenner, der sich nicht bewegen lässt, hielte den Balken für immer unter
 * 100 % — dieselbe Menge wie beim Abschluss, damit Balken und Weiche nicht
 * zwei verschiedene Dinge behaupten.
 */
export function stepProgress(
  stepKey: BrandStepKey,
  slotStates: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
): BrandStepProgress {
  const required = confirmableRequiredSlotsForStep(stepKey)
  const requiredFilled = required.filter(slot => slotIsFilled(slotStates[slot.id])).length
  // Ein Baustein ohne Pflicht-Slots ist fertig, sobald man ihn betritt —
  // 0/0 als 0 % anzuzeigen wäre eine Sackgasse im Balken.
  const pct = required.length === 0 ? 100 : Math.round((requiredFilled / required.length) * 100)
  return { requiredTotal: required.length, requiredFilled, pct }
}

/** Gefüllt = Entwurf ODER Bestätigung (s. `stepProgress`). */
export function slotIsFilled(state: BrandSlotStateFacts | undefined): boolean {
  return Boolean(state && (state.hasValue || state.confirmed))
}

/**
 * Der i18n-Schlüssel der FRAGE für einen Pfad — und, wo es eine Team-Fassung
 * gibt, für die Weiche W3. Ohne Variante der Basis-Schlüssel, sonst mit
 * Suffix: die eine Stelle, die die Konventionen `brand.q.<id>.<pfad>` und
 * `brand.q.<id>.<solo|team>` kennt (s. Kopf).
 *
 * ── ERST DER PFAD, DANN DIE WEICHE (2026-09-09) ───────────────────────────
 * Ein Slot darf seit Davids Entscheidung BEIDE Achsen tragen, und dann ist der
 * Schlüssel `brand.q.<id>.<pfad>.<solo|team>` — die Reihenfolge steht hier
 * EINMAL und nirgends sonst. Sie ist nicht beliebig: der Pfad wählt, WELCHE
 * Frage gestellt wird (Gründung gegen Relaunch), die Weiche nur, WIE sie
 * angeredet wird. Die gröbere Unterscheidung gehört nach oben, sonst stünden
 * dieselben zwei Fragen unter `solo` und unter `team` doppelt im Katalog.
 *
 * `team` ist OPTIONAL und fällt auf `'solo'` zurück: eine Aufrufstelle, die
 * die Weiche nicht kennt, bekommt die Fassung für den Einzelnen — nie einen
 * Schlüssel, den der Katalog nicht führt.
 */
export function questionKeyFor(
  slot: BrandSlot,
  pathKind: BrandPathKind,
  team: BrandTeamKind = 'solo',
): string {
  const base = slot.pathVariants?.[pathKind] ? `${slot.questionKey}.${pathKind}` : slot.questionKey
  return slot.teamVariant ? `${base}.${team === 'team' ? 'team' : 'solo'}` : base
}

/**
 * DER SCHLÜSSEL, MIT DEM EIN FELD BESCHRIFTET WIRD — die Bühne, das Log, die
 * Abnahme und jeder Befund-Chip lösen ihn über dieselbe Regel auf.
 *
 * ── WARUM NICHT EINFACH `questionKeyFor` ──────────────────────────────────
 * Weil `d.gapReveal` eine Variante ANMELDET, die der Katalog nicht führt:
 * `pathVariants: { relaunch: true }` war als eigener Relaunch-Wortlaut
 * gedacht, geschrieben wurde er nie (Begründung in `tests/i18nCatalog.test.ts`).
 * Für eine ABLEITUNG fällt das nicht auf — sie wird nie gefragt, und die
 * Oberfläche beschriftet sie mit dem Basis-Schlüssel. Genau diese Ausnahme
 * stand bis 2026-09-09 dreimal im Code (Bühne, `useBrandFieldLabel`,
 * `BwAcceptance`) — als Aufzählung der Typen `question`/`choice`, und die
 * hielt exakt so lange, bis `d.pairs` (Typ `special`) eine Solo-Fassung bekam.
 *
 * DIE REGEL IST DESHALB NICHT MEHR DER TYP, SONDERN DIE ANMELDUNG: wer eine
 * Team-Fassung führt, wird über sie beschriftet; sonst gilt weiter der alte
 * Weg über den gefragten Typ. Ein Slot ohne jede Variante bekommt in beiden
 * Fällen denselben Basis-Schlüssel — die Regel ändert für ihn nichts.
 */
export function slotLabelKeyFor(
  slot: BrandSlot,
  pathKind: BrandPathKind,
  team: BrandTeamKind = 'solo',
): string {
  if (slot.teamVariant) return questionKeyFor(slot, pathKind, team)
  return slot.type === 'question' || slot.type === 'choice'
    ? questionKeyFor(slot, pathKind, team)
    : slot.questionKey
}

/**
 * Der i18n-Schlüssel der BEISPIEL-ANTWORT einer Menschenfrage — dieselben
 * Konventionen wie `questionKeyFor`, nur unter `brand.example.<id>`. Sie
 * steht GRAU im Antwortfeld des Berater-Chats (Platzhalter, nie ein Wert):
 * eine Mustervorlage senkt die Hürde vor der leeren Zeile, ohne etwas zu
 * beantworten. Nur `type: 'question'` wird so gefragt; Auswahl-Slots haben
 * Chips statt Freitext und darum keinen Beispiel-Schlüssel.
 *
 * DIE TEAM-FASSUNG GEHÖRT MIT DAZU (Paket 8, Rest aus 2b): `c.discovery3`
 * fragt solo und im Team etwas ANDERES (D3 gegen D7). Ein Beispiel zur
 * falschen Frage ist schlimmer als gar keines — es lenkt die Antwort in die
 * Irre. Vorher kannte diese Funktion nur die Pfad-Weiche, also stand unter
 * „Wie soll dein Team entscheiden, wenn du nicht im Raum bist?" das
 * Solo-Beispiel („Dass jemand Kollegen vor Kunden schlecht macht."). `team`
 * ist wie bei `questionKeyFor` optional und fällt auf `'solo'` zurück.
 *
 * ── SIE HÄNGT AN `teamExample`, NICHT AN `teamVariant` (2026-09-09) ────────
 * Seit der Anrede-Runde tragen 48 Fragen eine Solo-Fassung — die FRAGE spricht
 * George, und er redet solo mit „du" und im Team mit „ihr". Das BEISPIEL
 * spricht der NUTZER („Wir gewinnen kaum Neukunden …"), und diese Stimme
 * ändert sich durch die Weiche nicht. Hinge das Beispiel an `teamVariant`,
 * stünde derselbe Satz 48-mal doppelt im Katalog, und beim ersten Nachziehen
 * würde eine der beiden Hälften vergessen. Eigenes Feld also, gesetzt an genau
 * den zwei Stellen, wo sich das Beispiel WIRKLICH unterscheidet: `c.discovery3`
 * (andere Frage) und `a.customerPraise` (der Kunde sagt „bei euch"/„bei dir").
 */
export function exampleKeyFor(
  slot: BrandSlot,
  pathKind: BrandPathKind,
  team: BrandTeamKind = 'solo',
): string {
  const root = `brand.example.${slot.id}`
  const base = slot.pathVariants?.[pathKind] ? `${root}.${pathKind}` : root
  return slot.teamExample ? `${base}.${team === 'team' ? 'team' : 'solo'}` : base
}

/**
 * DER i18n-SCHLÜSSEL EINES TEILS einer `collect`-Session — die dritte
 * Konvention neben `brand.q.<id>` und `brand.example.<id>`.
 *
 * ── WARUM NICHT `brand.q.<id>.<teil>` ─────────────────────────────────────
 * Weil ein verschachtelter JSON-Katalog unter EINEM Schlüssel nicht
 * gleichzeitig eine Zeichenkette und ein Kind-Objekt halten kann — dieselbe
 * Grenze, an der schon `d.gapReveal` steht (s. `tests/i18nCatalog.test.ts`).
 * `brand.q.a.facts` IST heute die Frage („Ein paar schnelle Zahlen: …"), die
 * die Werkstatt als Feld-Etikett und als Frage rendert; sie in ein Objekt zu
 * verwandeln, hiesse, an dieser Stelle wörtlich `brand.q.a.facts` in die
 * Oberfläche zu schreiben.
 *
 * Also ein eigener Namensraum, wie bei den Beispielantworten auch. Die Frage
 * bleibt die KLAMMER über den Teilen („ein paar schnelle Zahlen"), die Teile
 * sind die drei Einzelfragen, die Paket 3 nacheinander stellt.
 *
 * ── DIE TEILE KENNEN DIE WEICHE W3 (2026-09-09) ───────────────────────────
 * Die Klammer-Frage sprach seit der Anrede-Runde beide Fassungen, die drei
 * TEILE nicht — im Solo-Gespräch stand also wörtlich „Seit wann gibt es
 * euch?" und „Wo verkauft ihr wirklich?" mitten in einem Chat, der sonst
 * durchgehend „du" sagt. Dieselbe Weiche, dieselbe Mechanik wie bei
 * `questionKeyFor`: der Schlüssel bekommt ein Suffix, und beide Fassungen
 * sind KINDER (ein JSON-Katalog kann unter EINEM Schlüssel nicht gleichzeitig
 * Text und Kind-Objekt halten).
 *
 * ANGEMELDET WIRD JE TEIL, nicht je Session (`teamParts`): `teamSize` fragt
 * „Wie viele Leute arbeiten mit — feste und freie zusammen?" und ist damit auf
 * beiden Seiten der Weiche wörtlich richtig. Trüge die SESSION die Marke,
 * stünde derselbe Satz doppelt im Katalog, und beim ersten Nachziehen wäre
 * eine der beiden Hälften vergessen — dieselbe Begründung wie bei
 * `teamExample` gegenüber `teamVariant`, eine Ebene tiefer.
 *
 * `team` ist wie dort OPTIONAL und fällt auf `'solo'` zurück; ein Teil ohne
 * Anmeldung bekommt IMMER den Basis-Schlüssel — nie einen, den der Katalog
 * nicht führt.
 */
export function partKeyFor(slot: BrandSlot, part: string, team: BrandTeamKind = 'solo'): string {
  const base = `brand.part.${slot.id}.${part}`
  if (!slot.teamParts?.includes(part)) return base
  return `${base}.${team === 'team' ? 'team' : 'solo'}`
}

/**
 * DIE KURZE BESCHRIFTUNG EINES TEILS — `brand.partLabel.<id>.<part>` (Paket 3a).
 *
 * `partKeyFor` liefert die FRAGE („Wie viele Leute arbeiten mit — feste und
 * freie zusammen?"); der zusammengelegte Wert einer Sammel-Session braucht
 * daneben ein ETIKETT („Team"). Zwei Schlüssel und nicht einer, weil beides
 * gleichzeitig gebraucht wird: die Frage im Chat, das Etikett im gespeicherten
 * Wert — und der ist ein `structured`-Wert aus beschrifteten Blöcken
 * (`brandSlotFormat.ts`), den ein Mensch später im Dokument liest.
 *
 * Er steht in der INHALTSSPRACHE der Marke, nicht in der Sprache der Seite:
 * der Wert gehört dem Dokument, nicht der Oberfläche.
 */
export function partLabelKeyFor(slot: BrandSlot, part: string): string {
  return `brand.partLabel.${slot.id}.${part}`
}
