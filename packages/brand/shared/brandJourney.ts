/**
 * DIE ZUSTANDSMASCHINE DES BRAND-WIZARDS — welcher Baustein ist offen, wer
 * darf hinein, was macht ein Klick daraus (Plan §3e „Serverseitige
 * Zustandsmaschine", Audit 5).
 *
 * PURE, ohne Appwrite und ohne H3 — Muster `resolveThemeSelection`. Der
 * Grund steht im Plan: „die UI erzwingt NICHTS allein". Dieselben Regeln
 * laufen im Browser (Fortschrittsleiste, gesperrte Kapitel) und auf dem
 * Server (jede `/api/brand/**`-Route), und sie sind ohne laufende Instanz
 * prüfbar. Was der Server damit verhindert: kein Überspringen gesperrter
 * Kapitel · kein Bestätigen unvollständiger Pflicht-Slots · keine
 * Manipulation von Fortschritt/Konfidenz über den Client · kein Generieren
 * für nicht freigeschaltete Steps · keine widersprüchlichen optionalen Pfade.
 *
 * ── FÜNF ZUSTÄNDE, EINER MEHR ALS IM SCHEMA ───────────────────────────────
 * `brand_steps.state` kennt vier gespeicherte Werte (locked/open/active/done,
 * Schema-Anhang §2). Hier kommt `skipped` dazu — und zwar NUR als ERGEBNIS,
 * nie als gespeicherter Wert: ob ein Baustein zum Weg gehört, entscheidet die
 * WEICHE auf dem Profil, nicht eine Spalte auf der Zeile. Stünde es in der
 * Zeile, gäbe es zwei Wahrheiten, die auseinanderlaufen können — und der
 * §3e-Vertrag „entfallene Daten werden INAKTIV, nie gelöscht" lebt genau
 * davon, dass die Zeile mit ihren Slots unangetastet liegen bleibt, während
 * die Weiche sie überspringt. Wer Naming später wieder aktiviert, findet
 * seinen Stand vor.
 *
 * ── ZWEI WEICHEN GATEN EINEN BAUSTEIN ─────────────────────────────────────
 * `architecture` läuft nur bei `subBrands === 'yes'` (W4, entschieden am Ende
 * von B). `'unknown'` ist NICHT dasselbe wie `'no'`: der Baustein ist dann
 * nicht abgewählt, sondern unbeantwortet (`junction_undecided`) — die Route
 * holt die Antwort am Ende von B ein, die pure Regel blockiert deswegen aber
 * nicht den ganzen Weg.
 *
 * `naming` läuft, wenn die Marke keinen Namen hat (W2) ODER beim
 * **Neuschnitt** ausdrücklich geöffnet wurde (`relaunchScope: 'recut'` UND
 * `namingOpted`, Katalog §2.2: „Chip, Default nein"). Der **Feinschliff**
 * friert W2 auf „Name vorhanden" ein und hat diese Öffnung bewusst nicht.
 * Ein `relaunchScope` auf dem Gründer-Pfad wird IGNORIERT statt geglaubt
 * (fail-closed gegen widersprüchliche Tatsachen) — ein `hasName: false`
 * öffnet Naming dagegen immer, auch beim Feinschliff: eine namenlose Marke
 * ohne Naming-Baustein wäre eine Sackgasse, und eine Sackgasse ist schlimmer
 * als eine überflüssige Frage.
 *
 * Die Weiche W3 (Solo/Team) gatet KEINEN Baustein — sie tauscht Fassungen und
 * schaltet den optionalen Slot `c.teamFilter` frei (Registry). Sie steht hier
 * trotzdem als Weiche, weil `applyJunctionChange` alle vier an EINER Stelle
 * beantworten soll; ihr Ergebnis ist dann eben „nichts ändert sich am Weg".
 *
 * ── EIN GESPEICHERTES `done` WIRD NICHT NEU BERECHNET ─────────────────────
 * `resolveBrandJourney` LIEST den gespeicherten Zustand und legt nur die
 * Weichen und die Freischaltung darüber. Es rechnet insbesondere ein `done`
 * NICHT gegen die heutige Registry nach — das ist der Migrationsvertrag §3e:
 * „Bestands-Brands gelten weiter als vollständig, der neue Slot erscheint als
 * offen". Ein neu hinzugekommener Pflicht-Slot taucht deshalb in
 * `missingRequired` auf, wirft den Baustein aber nicht zurück.
 * Die STRENGE Prüfung sitzt auf dem Schreibweg: `transitionBrandStep(…,
 * 'complete')` verlangt jeden Pflicht-Slot bestätigt UND eine gesetzte
 * Konfidenz. Lesen ist nachsichtig, Schreiben ist streng — die Umkehrung
 * hiesse, dass ein Katalog-Update Bestandskunden ihren Abschluss nimmt.
 *
 * ── ZURÜCK IST IMMER ERLAUBT ──────────────────────────────────────────────
 * Regel §3b.2: „vorwärts nur sequenziell, jeder ABGESCHLOSSENE Baustein
 * klickbar und änderbar". `canEnterBrandStep` lässt deshalb jeden `done`
 * hinein, auch wenn davor etwas wieder offen ist. Und `reopen` PROPAGIERT
 * NICHT: es markiert nur diesen einen Baustein. Was dadurch weiter unten
 * veraltet, sagt der inputHash (Schema-Anhang §2: „veraltet" ist ABGELEITET,
 * kein Flag) — würde `reopen` alles Nachgelagerte zurücksetzen, verlöre der
 * Mensch für eine Kommakorrektur sein halbes Ergebnis.
 */

import { ASKABLE_SESSION_KINDS } from './brandSessionGroups'
import { computeSourcesHash, evaluateInvariants } from './brandSessions'
import {
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandPathKind,
  type BrandSessionConfig,
  type BrandSessionKind,
  type BrandSlotEditor,
  type BrandSlotStateFacts,
  type BrandStepKey,
  type BrandStepProgress,
  confirmableRequiredSlotsForStep,
  isBrandDesignStep,
  isBrandKitStep,
  slotById,
  slotIsConfirmable,
  slotIsFilled,
  slotLabelKeyFor,
  slotsForStep,
  stepProgress,
} from './slotRegistry'

/**
 * Die GESPEICHERTEN Konfidenz-Werte (§3b.8, `brand_steps.confidence`).
 *
 * `restart` steht hier NUR NOCH FÜR BESTANDSZEILEN. Seit BW2 §5a ist „Nochmal
 * von vorn" keine Selbstauskunft mehr, sondern eine HANDLUNG (`restart`) mit
 * Schnappschuss, getipptem Wort und Impact-Ack — es als Konfidenz zu speichern
 * hiesse, dass eine Zeile gleichzeitig „abgeschlossen" und „von vorn" sagt.
 * Der Wert bleibt im Array, damit eine Bestandszeile weiter lesbar ist
 * (Migrationsvertrag §3e); GESETZT werden darf er nicht mehr.
 */
export const BRAND_CONFIDENCE_VALUES = ['fits', 'almost', 'restart'] as const
export type BrandConfidence = (typeof BRAND_CONFIDENCE_VALUES)[number]

/**
 * Die zwei Werte, die die Finale Abnahme noch SETZT — „Passt" und „Fast".
 * `setConfidence` prüft gegen diese Liste, nicht gegen die gespeicherte:
  * Lesen bleibt nachsichtig, Schreiben wird streng (s. Kopf).
 */
export const BRAND_SETTABLE_CONFIDENCE_VALUES = ['fits', 'almost'] as const
export type BrandSettableConfidence = (typeof BRAND_SETTABLE_CONFIDENCE_VALUES)[number]

/** Vier gespeicherte Zustände + `skipped` als reines Ergebnis (s. Kopf). */
export type BrandStepState = 'locked' | 'open' | 'active' | 'done' | 'skipped'

/** Der gespeicherte Zustand einer `brand_steps`-Zeile (ohne `skipped`). */
export type BrandStoredStepState = Exclude<BrandStepState, 'skipped'>

/** Weichen-Tatsachen vom Profil (Schema-Anhang §1). */
export interface BrandProfileFacts {
  /** W1 */
  pathKind: BrandPathKind
  /** Rebrand-Verzweigung, nur bei `pathKind: 'relaunch'` gültig. */
  relaunchScope?: 'refine' | 'recut' | null
  /** W2 */
  hasName: boolean
  /** W3 — tauscht Fassungen, gatet keinen Baustein. */
  team: 'solo' | 'team'
  /** W4 — `'unknown'` bis zum Ende von B. */
  subBrands: 'unknown' | 'yes' | 'no'
  /**
   * Der Chip „Name auf den Prüfstand?" (Katalog §2.2, Default nein). Öffnet
   * Naming beim Neuschnitt trotz vorhandenem Namen.
   */
  namingOpted?: boolean
  /**
   * DIE FREISCHALTUNG VON BRAND DESIGN (Konzept §2.10) — ein Zeitstempel oder
   * `null`. Sie ist eine BETREIBER-Handlung, nichts, was der Kunde setzen
   * kann, und sie steht am Profil, nicht an einer Zeile: die Schicht wird als
   * GANZES freigeschaltet.
   *
   * OPTIONAL getypt und Default `null`, weil die Spalte ADDITIV dazukam
   * (Migration **brand-022**; das Konzept nennt noch „brand-020", die Nummer
   * ist inzwischen von den Publications belegt — die Dateinamen entscheiden).
   * Der Leser läuft also auch OHNE die Spalte, und ohne sie ist Schicht 2
   * gesperrt: das ist genau der Zustand, den jede Bestands-Marke hat.
   */
  designUnlockedAt?: string | null
  /**
   * DIE FREISCHALTUNG DER ABLEITUNG (Konzept BRAND-BOOK-KIT.md §2.8) — Schicht
   * 3 (Brand Book & Kit) und die Lieferseite hängen daran.
   *
   * EIN BOOLEAN und kein Zeitstempel, anders als bei Brand Design: die
   * Freischaltung hat DREI Quellen (Beta-Konto mit `brand_access`,
   * Betreiber-Knopf, später der Stripe-Webhook), und nur eine davon ist eine
   * Spalte. Die pure Regel `resolveDerivationAccess` (K1) legt sie zusammen;
   * hier steht ausschliesslich ihr Ergebnis — sonst gäbe es zwei Stellen, die
   * dieselbe Frage beantworten, und die Journey kennte nur die halbe Wahrheit.
   *
   * OPTIONAL getypt und Default `false`, weil die Spalte ADDITIV dazukommt
   * (Migration **brand-025**, Paket K1). Bis dahin liest `profileFacts()`
   * nichts und Schicht 3 liegt nicht auf dem Weg — genau der Zustand, den jede
   * Bestands-Marke hat.
   */
  derivationUnlocked?: boolean
}

/** Der gelesene Stand EINER `brand_steps`-Zeile. */
export interface BrandStepFacts {
  stepKey: BrandStepKey
  state: BrandStoredStepState
  confidence?: BrandConfidence | null
  slots?: Readonly<Record<string, BrandSlotStateFacts | undefined>>
}

/** Warum ein Baustein so dasteht — für Log, Test und den Hinweis in der Leiste. */
export type BrandStepStateReason =
  /** Erster Baustein des Weges. */
  | 'entry'
  /** Vorgänger fertig. */
  | 'unlocked'
  | 'in_progress'
  | 'completed'
  /** Vorgänger noch nicht fertig. */
  | 'awaiting_previous'
  /** Weiche abgewählt. */
  | 'junction_off'
  /** Weiche noch unbeantwortet (nur `subBrands: 'unknown'`). */
  | 'junction_undecided'
  /**
   * SCHICHT 2 IST NICHT FREIGESCHALTET (Konzept §2.10) — eigener Grund neben
   * `awaiting_previous`, weil er etwas ANDERES sagt: nicht „arbeite den
   * Vorgänger ab", sondern „dieses Produkt ist für diese Marke noch nicht
   * geöffnet". Die Leiste erklärt es entsprechend anders, und ein Log, das
   * beide Fälle `awaiting_previous` nennte, könnte sie nie auseinanderhalten.
   */
  | 'design_locked'
  /**
   * SCHICHT 3 IST NICHT FREIGESCHALTET (Konzept BRAND-BOOK-KIT.md §2.8) —
   * derselbe Gedanke wie `design_locked`, aber ein ANDERER Zustand: Brand Book
   * & Kit liegt ohne Freischaltung gar nicht erst AUF DEM WEG (`skipped`),
   * statt gesperrt darauf zu stehen.
   *
   * Der Unterschied ist die D0-Lehre: ein `locked`-Kapitel zählt in jeder
   * Fortschritts-Formel mit, die es nicht ausdrücklich ausklammert — Schicht 2
   * brauchte dafür vier Klemmen und einen Klick-Beweis, um den fünften Leser
   * zu finden. Ein Kapitel, das nicht auf dem Weg liegt, fällt überall
   * gleichzeitig heraus, weil `skipped` schon überall behandelt wird.
   */
  | 'derivation_locked'

export interface BrandJourneyStep {
  stepKey: BrandStepKey
  state: BrandStepState
  reason: BrandStepStateReason
  /** Hängt dieser Baustein an einer Weiche? (architecture, naming) */
  optional: boolean
  progress: BrandStepProgress
  /** Pflicht-Slots ohne Bestätigung, in Registry-Reihenfolge. */
  missingRequired: readonly string[]
  confidence: BrandConfidence | null
}

/**
 * Die weichen-abhängigen Bausteine. `nomenclature` steht seit K0 dabei: sie
 * erbt die Weiche W4 von `architecture` (§2.20 Nr. 4) und ist damit genauso
 * optional wie ihr Vorbild — die Leiste soll sie auch so beschriften.
 */
const OPTIONAL_STEPS: readonly BrandStepKey[] = ['architecture', 'naming', 'nomenclature']

interface StepInclusion {
  included: boolean
  reason: 'junction_off' | 'junction_undecided' | 'derivation_locked' | null
}

/**
 * Gehört `naming` zum Weg? (s. Kopf „Zwei Weichen") — eigene Funktion, weil
 * dieselbe Frage an drei Stellen gestellt wird: Journey, Weichen-Wechsel und
 * (später) die Route, die den Chip anbietet.
 */
export function brandNamingIncluded(profile: BrandProfileFacts): boolean {
  if (!profile.hasName) return true
  if (profile.pathKind !== 'relaunch') return false
  return profile.relaunchScope === 'recut' && profile.namingOpted === true
}

function includeStep(profile: BrandProfileFacts, stepKey: BrandStepKey): StepInclusion {
  if (stepKey === 'architecture') {
    if (profile.subBrands === 'yes') return { included: true, reason: null }
    if (profile.subBrands === 'unknown') return { included: false, reason: 'junction_undecided' }
    return { included: false, reason: 'junction_off' }
  }
  if (stepKey === 'naming') {
    return brandNamingIncluded(profile)
      ? { included: true, reason: null }
      : { included: false, reason: 'junction_off' }
  }
  // ── SCHICHT 3 LIEGT NUR AUF DEM WEG, WENN DIE ABLEITUNG OFFEN IST ────────
  // (Konzept BRAND-BOOK-KIT.md §2.8, K0). NICHT „gesperrt" wie Schicht 2,
  // sondern gar nicht erst auf dem Weg — s. `derivation_locked`.
  if (isBrandKitStep(stepKey)) {
    if (!profile.derivationUnlocked) return { included: false, reason: 'derivation_locked' }
    // NOMENKLATUR NUR AUF DEM B2-WEG (§2.20 Nr. 4): sie ist der Ausbau der
    // Markenarchitektur, und ohne Untermarken gibt es kein Muster, das zu
    // bestätigen wäre. Sie erbt deshalb WÖRTLICH die Weiche von `architecture`
    // — inklusive `junction_undecided`, solange W4 unbeantwortet ist. Solo-
    // Marken bekommen ihre Schreibweisen in `n.guardrails`.
    if (stepKey === 'nomenclature') return includeStep(profile, 'architecture')
    return { included: true, reason: null }
  }
  return { included: true, reason: null }
}

/** Die Bausteine, die dieses Profil tatsächlich durchläuft — in Reihenfolge. */
export function includedBrandSteps(profile: BrandProfileFacts): readonly BrandStepKey[] {
  return BRAND_STEP_KEYS.filter(stepKey => includeStep(profile, stepKey).included)
}

/**
 * DIE VORBEDINGUNG DES ABSCHLUSSES — eine Rechnung, zwei Leser.
 *
 * ── WARUM SIE EXPORTIERT IST ──────────────────────────────────────────────
 * Der Server verlangt zum Abschluss BESTÄTIGTE Pflicht-Slots
 * (`transitionBrandStep(…, 'complete')`). Der Browser fragte bis zum
 * 2026-09-02 etwas ANDERES, um die Konfidenz-Weiche zu zeigen: „gibt es noch
 * eine offene FRAGE?" (`resolveNextQuestion === null`). Das sind zwei
 * verschiedene Fragen — `resolveNextQuestion` sieht nur Frage- und
 * Auswahl-Slots und lässt schon einen ENTWURF gelten (`slotIsFilled`), während
 * der Abschluss jeden Pflicht-Slot BESTÄTIGT sehen will, den Entwurfs-Slot der
 * Bühne (`stage-edit`) eingeschlossen.
 *
 * Davids Live-Durchlauf hat den Unterschied sichtbar gemacht: im Baustein
 * `pvm` stand „Passt dieses Kapitel?" mit den drei Optionen, während Mission
 * noch unbestätigt war — „die fragen sind noch nicht einmal alle abgeschlossen
 * … das dürfte an der stelle ja noch überhaupt nicht gefragt werden". Eine
 * Weiche, die vor ihrer eigenen Bedingung erscheint, verspricht einen
 * Abschluss, den die Route danach mit `required_slots_missing` abweist.
 *
 * Deshalb steht die Rechnung GENAU HIER und wird an beiden Enden gelesen: die
 * Route entscheidet damit, der Chat zeigt damit die Weiche — und ein Test
 * nagelt beide aneinander. Eine zweite Formel im Markup wäre exakt der Fehler,
 * den dieser Export beendet.
 *
 * `slotsReady` ist die halbe Abschlussregel: die KONFIDENZ fehlt hier bewusst,
 * denn sie ist das, was die Weiche EINSAMMELT — sie zur Vorbedingung ihrer
 * eigenen Anzeige zu machen, wäre ein Knopf, der sich selbst versteckt.
 */
export interface BrandStepCompletion {
  /** Alle Pflicht-Slots bestätigt — die Bedingung, unter der abgeschlossen wird. */
  slotsReady: boolean
  /** Pflicht-Slots ohne Bestätigung, in Registry-Reihenfolge. */
  missingRequired: readonly string[]
  /** Bestätigte Pflicht-Slots … */
  confirmed: number
  /** … von wie vielen. Zusammen der Zähler des ruhigen Hinweises. */
  total: number
}

export function brandStepCompletion(
  stepKey: BrandStepKey,
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
): BrandStepCompletion {
  // BESTÄTIGBAR ist Bedingung (Audit A4): `d.pairs` ist Pflicht, aber ohne
  // Instrument — als Teil der Vorbedingung machte er `archetype` unschliessbar.
  // Die Regel steht in der Registry, damit Bühne und Route dieselbe Menge
  // meinen (s. `slotIsConfirmable`).
  const required = confirmableRequiredSlotsForStep(stepKey)
  const missingRequired = required.filter(slot => !slots[slot.id]?.confirmed).map(slot => slot.id)
  return {
    slotsReady: missingRequired.length === 0,
    missingRequired,
    confirmed: required.length - missingRequired.length,
    total: required.length,
  }
}

/**
 * DIE ZWEITE HÄLFTE DER ABSCHLUSS-BEDINGUNG — die FINALE ABNAHME (Plan §5a).
 *
 * ── ZWEI RECHNUNGEN, WEIL ES ZWEI FRAGEN SIND ─────────────────────────────
 * `brandStepCompletion` beantwortet „ist in den Sessions alles GESAGT?"
 * (jeder Pflicht-Slot bestätigt). Diese hier beantwortet „ist es im
 * Zusammenhang des Kapitels auch GELESEN?" — und das sind drei zusätzliche
 * Glieder, die David am 2026-09-04 festgelegt hat:
 *
 *   1. jede zählende Session ist ABGENOMMEN (`accepted`),
 *   2. keine davon ist VERALTET (`stale`, s. `resolveSessionStates`),
 *   3. an keinem Feld des Kapitels hängt ein offener KONFLIKT-Befund.
 *
 * ── `openConflicts` IST EIN PARAMETER UND KEINE ABFRAGE ───────────────────
 * Die Befunde (`brand_findings`) kommen erst mit Paket 4. Diese Rechnung
 * bleibt PUR und bekommt die Slot-Ids mit offenem Konflikt gereicht; die
 * Routen reichen heute `[]` durch. Der Haken ist damit da, der Inhalt kommt
 * später — und keine pure Regel muss dafür je eine Tabelle kennen.
 *
 * ── WER ZÄHLT ────────────────────────────────────────────────────────────
 * Jede PFLICHT-Session, die ein Mensch überhaupt bestätigen kann
 * (`slotIsConfirmable` — derselbe Nenner wie Balken und Abschluss), PLUS jede
 * OPTIONALE Session, die einen bestätigten Wert trägt. §5a sagt es so herum:
 * „die Pflicht-Sessions zählen, optionale ohne Wert nicht" — eine optionale
 * Session MIT Wert steht mit Knopf auf der Seite, also gehört sie in den
 * Zähler, sonst zeigte die Seite eine Handlung ohne Wirkung.
 *
 * ── LESEN BLEIBT NACHSICHTIG ─────────────────────────────────────────────
 * Diese Bedingung gilt beim SCHREIBEN von `complete`. Ein Kapitel, das schon
 * `done` ist und dessen Slots aus der Zeit vor BW2 gar kein `accepted`
 * kennen, bleibt `done` — `resolveBrandJourney` rechnet es nicht nach
 * (Migrationsvertrag §3e, s. Kopf). Sonst nähme ein Deploy jedem fertigen
 * Branding neun abgeschlossene Kapitel weg.
 */
export type BrandAcceptanceBlockerReason =
  /** Kein bestätigter Wert — die Session ist noch nicht besprochen. */
  | 'unconfirmed'
  /** Bestätigt, aber auf der Abnahme-Seite noch nicht angenommen. */
  | 'unaccepted'
  /** Bestätigt, aber die Quellen haben sich seither bewegt. */
  | 'stale'
  /** Ein offener Konflikt-Befund hängt an diesem Feld (Paket 4). */
  | 'conflict'
  /** Auf später vertagt — eine Pflicht-Session kann so nicht abgenommen werden. */
  | 'deferred'

export interface BrandAcceptanceBlocker {
  slotId: string
  reason: BrandAcceptanceBlockerReason
}

export interface BrandStepAcceptance {
  /** Nichts mehr offen — erst dann darf „Passt dieses Kapitel?" erscheinen. */
  ready: boolean
  /** Abgenommene zählende Sessions … */
  accepted: number
  /** … von wie vielen. Zusammen der Zähler „7 von 10 abgenommen". */
  total: number
  /** Was im Weg steht, in Registry-Reihenfolge. Leer ⇔ `ready`. */
  blockers: readonly BrandAcceptanceBlocker[]
}

export function brandStepAcceptance(
  stepKey: BrandStepKey,
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  sessionStates: Readonly<Record<string, BrandSessionState | undefined>> = {},
  openConflicts: readonly string[] = [],
): BrandStepAcceptance {
  const conflicted = new Set(openConflicts)
  const blockers: BrandAcceptanceBlocker[] = []
  let accepted = 0
  let total = 0

  for (const session of slotsForStep(stepKey)) {
    if (conflicted.has(session.id)) blockers.push({ slotId: session.id, reason: 'conflict' })
    if (!slotIsConfirmable(session)) continue
    const facts = slots[session.id]
    // Optional UND leer: steht grau mit Beispiel auf der Seite und zählt nicht.
    if (!session.required && !facts?.confirmed) continue

    total++
    if (facts?.accepted) accepted++

    if (facts?.deferred) blockers.push({ slotId: session.id, reason: 'deferred' })
    else if (!facts?.confirmed) blockers.push({ slotId: session.id, reason: 'unconfirmed' })
    else if (sessionStates[session.id] === 'stale') blockers.push({ slotId: session.id, reason: 'stale' })
    else if (!facts.accepted) blockers.push({ slotId: session.id, reason: 'unaccepted' })
  }

  return { ready: blockers.length === 0, accepted, total, blockers }
}

/**
 * IST DIESE EINE SESSION ABNEHMBAR? (Davids Befund 10, 2026-09-09)
 *
 * ── DIE REGEL IST DIE DES EINZELNEN KNOPFES, WÖRTLICH ─────────────────────
 * Bestätigt und noch nicht abgenommen — mehr fragt `BwSessionBlock` nicht, und
 * mehr fragt `acceptSlot` in `transitionBrandStep` auch nicht. „Alle abnehmen"
 * darf keine EIGENE Regel haben: ein Sammel-Knopf, der eine Zeile überspringt,
 * die der Einzel-Knopf annimmt (oder umgekehrt), wäre für den Menschen ein
 * Zufall — und für die Route ein zweiter Ort, an dem dasselbe entschieden wird.
 *
 * VERALTET (`stale`) und VERTAGT sperren die Abnahme deshalb ausdrücklich
 * NICHT: sie sperren die FINALE Abnahme (s. `blockers` oben), und der Weg
 * daraus ist „Gilt weiter" bzw. das Gespräch — nicht ein Häkchen, das man nicht
 * setzen darf.
 */
export function brandSessionAcceptable(
  facts: Pick<BrandSlotStateFacts, 'confirmed' | 'accepted'> | undefined,
): boolean {
  return Boolean(facts?.confirmed) && facts?.accepted !== true
}

/**
 * WELCHE SESSIONS EINES KAPITELS „ALLE ABNEHMEN" ANFASST — in
 * Registry-Reihenfolge, damit die Ergebnis-Liste dieselbe Ordnung hat wie die
 * Seite.
 *
 * Nicht-bestätigbare Sessions (der Paarvergleich) fallen heraus: sie haben
 * keinen Haken, können also auch nicht mitgenommen werden. Optionale MIT Wert
 * sind dabei — sie stehen mit Knopf auf der Seite (§5a Schritt 1), und ein
 * „alle" das eine sichtbare Zeile stehen lässt, ist keins.
 */
export function brandAcceptableSessions(
  stepKey: BrandStepKey,
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
): string[] {
  return slotsForStep(stepKey)
    .filter(session => slotIsConfirmable(session) && brandSessionAcceptable(slots[session.id]))
    .map(session => session.id)
}

/**
 * DIE GEORDNETE STEP-LISTE mit Zustand und Begründung.
 *
 * Sequenziell: ein Baustein wird `open`, wenn der Vorgänger `done` ist. Ein
 * ÜBERSPRUNGENER Baustein reicht das Weiterkommen durch — er ist kein
 * Hindernis, sondern gar nicht auf dem Weg.
 *
 * Ein gespeichertes `done` wird nie herabgestuft (s. Kopf): steht ein früherer
 * Baustein wieder offen, bleibt der spätere trotzdem fertig. `reopen`
 * propagiert nicht, und deshalb darf die Anzeige es auch nicht tun.
 */
export function resolveBrandJourney(
  profile: BrandProfileFacts,
  stepFacts: readonly BrandStepFacts[] = [],
): readonly BrandJourneyStep[] {
  const factsByStep = new Map(stepFacts.map(facts => [facts.stepKey, facts]))
  let previousDone = true
  let firstOnPath = true

  /**
   * DIE ZWEI BEDINGUNGEN VON SCHICHT 2 (Konzept §2.1): die Foundation hat ihr
   * Ergebnis-Kapitel abgeschlossen UND die Marke ist freigeschaltet. Beides,
   * nicht eines von beidem — eine freigeschaltete Marke mit halber Foundation
   * hätte nichts, woraus Frida ableiten könnte, und eine fertige Foundation
   * ohne Freischaltung ist der Normalfall jeder Bestands-Marke.
   */
  const foundationDone = factsByStep.get('result')?.state === 'done'
  const designOpen = Boolean(profile.designUnlockedAt) && foundationDone

  /**
   * SCHICHT 3 REIHT SICH NICHT HINTER SCHICHT 2 EIN (§1.11 d: „Brand Design
   * ist KEINE Voraussetzung"). Die Kette `previousDone` läuft von oben nach
   * unten durch — ohne diesen Schnitt stünden die drei Kit-Kapitel bei einer
   * freigeschalteten Marke OHNE Brand Design auf `awaiting_previous`, weil das
   * gesperrte `motion` die Kette gerissen hat. Der Einstieg von Schicht 3 ist
   * dieselbe Bedingung wie der von Schicht 2: die Foundation hat ihr
   * Ergebnis-Kapitel abgeschlossen (§2.1).
   */
  let enteredKitLayer = false

  return BRAND_STEP_KEYS.map((stepKey): BrandJourneyStep => {
    const inclusion = includeStep(profile, stepKey)
    const facts = factsByStep.get(stepKey)
    const slots = facts?.slots ?? {}
    const base = {
      stepKey,
      optional: OPTIONAL_STEPS.includes(stepKey),
      progress: stepProgress(stepKey, slots),
      missingRequired: brandStepCompletion(stepKey, slots).missingRequired,
      confidence: facts?.confidence ?? null,
    }

    if (!inclusion.included) {
      // Daten bleiben liegen (§3e) — der Weg geht daran vorbei, ohne zu stocken.
      return { ...base, state: 'skipped', reason: inclusion.reason ?? 'junction_off' }
    }

    // ── SCHICHT 2 VOR ALLEM ANDEREN ────────────────────────────────────────
    // Die Sperre steht VOR dem gespeicherten `done`, und das ist kein
    // Widerspruch zu „ein `done` wird nie herabgestuft": jene Regel schützt
    // ERARBEITETES gegen einen Weichen-Wechsel. Hier geht es um ein Produkt,
    // das für diese Marke (noch) nicht geöffnet ist — wäre die Reihenfolge
    // umgekehrt, könnte eine zurückgenommene Freischaltung eine offene Tür
    // hinterlassen. `previousDone` fällt mit, damit die folgenden
    // Design-Kapitel nicht plötzlich als „offen" gelten.
    if (isBrandDesignStep(stepKey) && !designOpen) {
      previousDone = false
      firstOnPath = false
      return { ...base, state: 'locked', reason: 'design_locked' }
    }

    if (isBrandKitStep(stepKey) && !enteredKitLayer) {
      enteredKitLayer = true
      previousDone = foundationDone
    }

    const stored = facts?.state ?? 'open'
    const wasFirst = firstOnPath
    firstOnPath = false

    if (stored === 'done') {
      // Die Sperre hängt IMMER nur am unmittelbaren Vorgänger, nie an der
      // ganzen Kette: wird ein früherer Baustein wieder geöffnet (`reopen`),
      // bleibt dieser hier fertig UND der nächste offen. Alles andere hiesse,
      // dass eine Kommakorrektur in „Kontext" den halben Weg zusperrt —
      // genau das, was „reopen propagiert nicht" ausschliesst.
      previousDone = true
      return { ...base, state: 'done', reason: 'completed' }
    }
    if (!previousDone) {
      return { ...base, state: 'locked', reason: 'awaiting_previous' }
    }
    previousDone = false
    if (stored === 'active') return { ...base, state: 'active', reason: 'in_progress' }
    return { ...base, state: 'open', reason: wasFirst ? 'entry' : 'unlocked' }
  })
}

/**
 * `design_locked` steht NEBEN `locked` und nicht darin (Brand Design D1): die
 * zwei sagen etwas anderes. „Gesperrt" heisst „arbeite den Vorgänger ab" —
 * eine Aufforderung, die der Mensch selbst erfüllen kann. „Brand Design ist
 * nicht freigeschaltet" heisst „dieses Produkt ist für diese Marke noch nicht
 * geöffnet", und daran ändert kein Klick etwas; dort gehört ein anderer Satz
 * hin (die Werkstatt zeigte sonst „Schließ das Kapitel davor ab" für ein
 * Kapitel, vor dem gar nichts fehlt).
 */
export type BrandStepEntryDenial =
  | 'unknown_step' | 'locked' | 'skipped' | 'design_locked' | 'derivation_locked'

export interface BrandStepEntryDecision {
  allowed: boolean
  reason: BrandStepEntryDenial | null
}

/**
 * DARF DIESER BAUSTEIN GEÖFFNET WERDEN? Vorwärts nur in `open`/`active`,
 * zurück in `done` IMMER (Regel §3b.2). Ein übersprungener Baustein ist
 * NICHT erreichbar — er wird über die Weiche geöffnet
 * (`applyJunctionChange`), nicht über die Adresszeile.
 */
export function canEnterBrandStep(
  journey: readonly BrandJourneyStep[],
  stepKey: string,
): BrandStepEntryDecision {
  const step = journey.find(entry => entry.stepKey === stepKey)
  if (!step) return { allowed: false, reason: 'unknown_step' }
  if (step.state === 'locked') {
    // Der GRUND reist mit (s. `BrandStepEntryDenial`) — die Route hängt ihn als
    // `data.code` an ihr 403, und die Werkstatt macht daraus den richtigen Satz.
    return { allowed: false, reason: step.reason === 'design_locked' ? 'design_locked' : 'locked' }
  }
  // ÜBERSPRUNGEN HAT SEIT K0 ZWEI GRÜNDE, und sie sagen etwas anderes: eine
  // abgewählte Weiche („dieses Kapitel gehört nicht zu eurem Weg") und die
  // fehlende Freischaltung der Ableitung („dieses Produkt ist für diese Marke
  // noch nicht geöffnet"). Derselbe Zuschnitt wie bei `design_locked` — der
  // Grund reist mit, die Oberfläche macht daraus den richtigen Satz.
  if (step.state === 'skipped') {
    return { allowed: false, reason: step.reason === 'derivation_locked' ? 'derivation_locked' : 'skipped' }
  }
  return { allowed: true, reason: null }
}

export type BrandStepAction =
  | { kind: 'start' }
  | { kind: 'confirmSlot', slotId: string }
  /** Im Kapitel-Zusammenhang gelesen und angenommen (Plan §5a). */
  | { kind: 'acceptSlot', slotId: string }
  /** Auf später vertagt — nur wo die Session es erlaubt (`answers.allowDefer`). */
  | { kind: 'deferSlot', slotId: string, deferred: boolean }
  | { kind: 'setConfidence', confidence: BrandConfidence }
  | { kind: 'complete', openConflicts?: readonly string[], sessionStates?: Readonly<Record<string, BrandSessionState | undefined>> }
  | { kind: 'reopen' }
  /** „Nochmal von vorn" — der EINZIGE löschende Weg (Plan §5a). */
  | { kind: 'restart' }

export type BrandTransitionErrorCode =
  | 'step_locked'
  | 'step_skipped'
  | 'not_started'
  | 'already_done'
  | 'not_done'
  | 'unknown_slot'
  | 'slot_foreign'
  | 'invalid_confidence'
  | 'required_slots_missing'
  | 'confidence_missing'
  /**
   * Eine deterministische Prüfung des Session-Vertrags ist gerissen (BW2 §3a
   * Nr. 6) — z. B. weniger als drei Werte in `c.final`. Die Route macht daraus
   * ein `data.code` wie `required_slots_missing`.
   */
  | 'invariant_violated'
  /** Abgenommen wird nur, was bestätigt ist (§5a: erst sagen, dann lesen). */
  | 'not_confirmed'
  /** Ein bestätigter Wert wird nicht vertagt — er ist ja da. */
  | 'already_confirmed'
  /** Diese Session kennt kein Vertagen (`answers.allowDefer` ist aus). */
  | 'defer_not_allowed'
  /** Die drei neuen Glieder der Abnahme sind nicht erfüllt (§5a Schritt 3). */
  | 'acceptance_incomplete'

export type BrandStepTransition =
  | { ok: true, step: BrandStepFacts, changed: boolean }
  | {
    ok: false
    code: BrandTransitionErrorCode
    missing?: readonly string[]
    blockers?: readonly BrandAcceptanceBlocker[]
  }

/**
 * Ein Baustein, der gerade bearbeitet werden darf, ist `active`. Alles andere
 * bekommt hier seinen eigenen Ablehnungsgrund — die Route macht daraus ein
 * `data.code` (createError-Regel), nie eine Ausnahme: eine Ablehnung ist ein
 * ERGEBNIS dieser Regel, kein Programmfehler.
 */
function requireActive(step: BrandStepFacts): BrandTransitionErrorCode | null {
  switch (step.state) {
    case 'active': return null
    case 'open': return 'not_started'
    case 'locked': return 'step_locked'
    case 'done': return 'already_done'
  }
}

/**
 * DER SCHREIBWEG. Nimmt den gelesenen Stand und eine Handlung, gibt den neuen
 * Stand ODER ein Fehler-Objekt zurück (keine Exception). Mutiert nichts.
 *
 * `changed: false` sagt „richtig, aber nichts zu tun" — die Route schreibt
 * dann nicht (No-op-Regel des Schema-Anhangs §2: Speichern ohne Änderung
 * erhöht keine `revision`).
 *
 * Ein `skipped` kann hier nie ankommen: `BrandStepFacts.state` ist der
 * GESPEICHERTE Zustand, und `skipped` ist nur ein Ergebnis (s. Kopf). Die
 * Route prüft die Weiche mit `canEnterBrandStep`, bevor sie hierher kommt.
 */
export function transitionBrandStep(step: BrandStepFacts, action: BrandStepAction): BrandStepTransition {
  switch (action.kind) {
    case 'start': {
      if (step.state === 'locked') return { ok: false, code: 'step_locked' }
      if (step.state === 'done') return { ok: false, code: 'already_done' }
      if (step.state === 'active') return { ok: true, step, changed: false }
      return { ok: true, step: { ...step, state: 'active' }, changed: true }
    }

    case 'confirmSlot': {
      const denial = requireActive(step)
      if (denial) return { ok: false, code: denial }
      const slot = slotById(action.slotId)
      if (!slot || slot.deactivated) return { ok: false, code: 'unknown_slot' }
      if (slot.stepId !== step.stepKey) return { ok: false, code: 'slot_foreign' }
      const previous = step.slots?.[slot.id]
      if (previous?.confirmed) return { ok: true, step, changed: false }
      /**
       * DIE INVARIANTEN DES SESSION-VERTRAGS (BW2 §3a Nr. 6) — was ein Test
       * prüfen kann, wird nicht der KI überlassen.
       *
       * Sie laufen NUR, wenn der Aufrufer den WERT mitgibt (`facts.value` ist
       * optional, s. `BrandSlotStateFacts`). Ohne Wert wird nichts geprüft:
       * eine Sperre, die zuschlägt, weil eine Aufrufstelle etwas nicht
       * mitreicht, hielte einen Menschen von seinem eigenen Feld fern, und dem
       * 409 sähe niemand an, dass er ein Verdrahtungsfehler ist.
       */
      const verdict = evaluateInvariants(slot, previous?.value, step.slots ?? {})
      if (!verdict.ok) return { ok: false, code: verdict.code }
      return {
        ok: true,
        changed: true,
        step: {
          ...step,
          slots: { ...step.slots, [slot.id]: { ...previous, hasValue: true, confirmed: true } },
        },
      }
    }

    case 'setConfidence': {
      /* Davids Entscheidung 2026-09-02: die Konfidenz ist auch bei einem
       * ABGESCHLOSSENEN Kapitel änderbar — sie ist eine Selbstauskunft,
       * kein Inhalt, und der starre Weg lief im UI in ein klebendes 400
       * („Not saved", Feinschliff-2-Befund). Gesperrt/nicht begonnen
       * bleibt zu. */
      const denial = step.state === 'done' ? null : requireActive(step)
      if (denial) return { ok: false, code: denial }
      // Die Konfidenz kommt vom Client — sie wird geprüft, nicht geglaubt.
      // Und geprüft wird gegen die SETZBARE Liste: `restart` ist seit §5a eine
      // Handlung und keine Selbstauskunft mehr (s. BRAND_CONFIDENCE_VALUES).
      if (!(BRAND_SETTABLE_CONFIDENCE_VALUES as readonly string[]).includes(action.confidence)) {
        return { ok: false, code: 'invalid_confidence' }
      }
      if (step.confidence === action.confidence) return { ok: true, step, changed: false }
      return { ok: true, step: { ...step, confidence: action.confidence }, changed: true }
    }

    case 'complete': {
      const denial = requireActive(step)
      if (denial) return { ok: false, code: denial }
      // DIESELBE Rechnung, die im Browser über die Weiche entscheidet — nicht
      // eine zweite Formel mit demselben Ergebnis (s. `brandStepCompletion`).
      const completion = brandStepCompletion(step.stepKey, step.slots ?? {})
      if (!completion.slotsReady) {
        return { ok: false, code: 'required_slots_missing', missing: completion.missingRequired }
      }
      // … und darüber die DREI NEUEN GLIEDER der Finalen Abnahme (§5a): jede
      // zählende Session abgenommen, keine veraltet, kein offener Konflikt.
      const acceptance = brandStepAcceptance(
        step.stepKey,
        step.slots ?? {},
        action.sessionStates ?? {},
        action.openConflicts ?? [],
      )
      if (!acceptance.ready) {
        return {
          ok: false,
          code: 'acceptance_incomplete',
          blockers: acceptance.blockers,
          // Die Liste in derselben Form wie bei `required_slots_missing` —
          // die Oberfläche markiert damit genau die Zeilen, die im Weg stehen.
          missing: acceptance.blockers.map(blocker => blocker.slotId),
        }
      }
      if (!step.confidence) return { ok: false, code: 'confidence_missing' }
      return { ok: true, step: { ...step, state: 'done' }, changed: true }
    }

    case 'reopen': {
      if (step.state !== 'done') return { ok: false, code: 'not_done' }
      // Slots UND Konfidenz bleiben stehen: `reopen` ist die LEISE
      // Vertiefungsrunde (§3b.8), kein Löschknopf — der Löschknopf heisst seit
      // §5a `restart` und steht darunter. Und `reopen` propagiert nicht nach
      // unten (s. Kopf).
      return { ok: true, step: { ...step, state: 'active' }, changed: true }
    }

    case 'acceptSlot': {
      /* Wie `setConfidence`: auch ein ABGESCHLOSSENES Kapitel darf abgenommen
       * werden. Nach einer Korrektur verliert die geänderte Zeile ihr
       * `accepted` (der Server nimmt es beim Schreiben des Werts) — sie danach
       * nur über `reopen` wieder annehmen zu lassen, machte aus einer
       * Kommakorrektur einen Kapitel-Neustart. */
      const denial = step.state === 'done' ? null : requireActive(step)
      if (denial) return { ok: false, code: denial }
      const slot = slotById(action.slotId)
      if (!slot || slot.deactivated) return { ok: false, code: 'unknown_slot' }
      if (slot.stepId !== step.stepKey) return { ok: false, code: 'slot_foreign' }
      const previous = step.slots?.[slot.id]
      // ERST SAGEN, DANN LESEN: ohne bestätigten Wert gäbe es nichts, dem man
      // im Zusammenhang zustimmen könnte — die Seite verlinkt dann in die
      // Session, statt einen Haken anzubieten (§5a Schritt 2).
      if (!previous?.confirmed) return { ok: false, code: 'not_confirmed' }
      if (previous.accepted) return { ok: true, step, changed: false }
      return {
        ok: true,
        changed: true,
        step: {
          ...step,
          // Abnehmen hebt ein Vertagen auf: beides gleichzeitig hiesse „gelesen
          // und trotzdem offen", und das ist keine Aussage.
          slots: { ...step.slots, [slot.id]: { ...previous, accepted: true, deferred: false } },
        },
      }
    }

    case 'deferSlot': {
      const denial = step.state === 'done' ? null : requireActive(step)
      if (denial) return { ok: false, code: denial }
      const slot = slotById(action.slotId)
      if (!slot || slot.deactivated) return { ok: false, code: 'unknown_slot' }
      if (slot.stepId !== step.stepKey) return { ok: false, code: 'slot_foreign' }
      // Die ERLAUBNIS steht in der Session-Config und nirgends sonst — eine
      // zweite Liste hier liefe ihr davon.
      if (!slot.answers.allowDefer) return { ok: false, code: 'defer_not_allowed' }
      const previous = step.slots?.[slot.id]
      // Ein bestätigter Wert IST da; ihn zu vertagen wäre eine Aussage über
      // etwas, das schon entschieden ist.
      if (previous?.confirmed) return { ok: false, code: 'already_confirmed' }
      if (Boolean(previous?.deferred) === action.deferred) return { ok: true, step, changed: false }
      return {
        ok: true,
        changed: true,
        step: {
          ...step,
          slots: { ...step.slots, [slot.id]: { ...previous, deferred: action.deferred } },
        },
      }
    }

    case 'restart': {
      /* NUR von einem Kapitel aus, das dem Menschen gehört: `done` (die
       * Abnahme-Seite eines abgeschlossenen Kapitels) oder `active` (die
       * Abnahme-Seite vor dem Abschluss). `open` hat noch nichts, was man
       * verlieren könnte, `locked` gehört nicht ihm. */
      const denial = step.state === 'done' ? null : requireActive(step)
      if (denial) return { ok: false, code: denial }
      // DIE GELEERTE ZEILE, als EINE Handlung der Maschine — nicht als
      // Aufräumen in der Route (§5a). Der Schnappschuss, `restartedAt` und das
      // Schreiben gehören der Route; WAS übrig bleibt, entscheidet sich hier.
      return {
        ok: true,
        changed: true,
        step: { stepKey: step.stepKey, state: 'active', confidence: null, slots: {} },
      }
    }
  }
}

export interface BrandNextQuestion {
  slotId: string
  /**
   * Der Schlüssel, den ein `t()` schreiben darf — gerechnet mit
   * `slotLabelKeyFor`, also MIT Pfad und Weiche (s. `nextQuestionKeys`).
   */
  questionKey: string
  helpKey: string | null
  type: 'question' | 'choice'
  editor: BrandSlotEditor
}

/**
 * DIE WEICHEN, DIE DEN SCHLÜSSEL ENTSCHEIDEN — und warum sie hier ein eigenes
 * Argument sind (2026-09-09).
 *
 * `questionKey` war bis heute der BASIS-Schlüssel `brand.q.<id>`, also genau
 * der, den der Katalog seit der Anrede-Runde für 49 Sessions NICHT mehr führt
 * (dort stehen `.solo`/`.team` als Kinder). Gerendert hat ihn niemand — aber
 * ein Feld, das einen rohen Schlüssel LIEFERT, ist die stille Zusage, dass man
 * ihn rendern darf, und vue-i18n schreibt bei einem Fehlgriff wortlos
 * `brand.q.f.nameType` in die Oberfläche. Also folgt er derselben Regel wie
 * Bühne, Log, Abnahme und Prompt-Aufbau: `slotLabelKeyFor`.
 *
 * Das Argument ist OPTIONAL, anders als bei `brandSlotPromptLabel`: die
 * Aufrufstellen dieser Rechnung sind nicht alle Routen mit Profil in der Hand
 * (Tests und künftige Leser rufen sie über die reine Registry-Reihenfolge).
 * Der Rückfall ist die Solo-Fassung des Gründer-Pfads — beide Fassungen
 * EXISTIEREN im Katalog, ein Default kann hier also keinen rohen Schlüssel
 * erzeugen; das nagelt `brandJourney.test.ts` fest.
 *
 * `BrandProfileFacts` passt strukturell hinein — Route und Bühne reichen
 * schlicht das durch, was sie ohnehin haben.
 */
export type BrandNextQuestionFacts = Pick<BrandProfileFacts, 'pathKind' | 'team'>

const DEFAULT_NEXT_QUESTION_FACTS: BrandNextQuestionFacts = { pathKind: 'new', team: 'solo' }

/**
 * WAS FRAGT GEORGE ALS NÄCHSTES? — Grundfassung: der erste offene
 * Pflicht-Slot vom Typ Frage oder Auswahl, in Registry-Reihenfolge.
 *
 * Ableitungen und Bühnen-Entwürfe stehen bewusst NICHT drin: die entwirft
 * George von sich aus, sie sind keine Frage an den Menschen.
 *
 * Die ADAPTIVE Wahl („die nächste Frage nach höchstem Informationswert",
 * §3b) kommt später und ersetzt genau diesen Rumpf — sie liefert denselben
 * Rückgabetyp, damit die Aufrufstellen (Chat-Zug, Prompt-Aufbau,
 * Fortschritts-Hinweis) unverändert bleiben. `null` heisst „nichts mehr zu
 * fragen": dann fehlt zum Abschluss höchstens noch die Konfidenz.
 */
export function resolveNextQuestion(
  stepKey: BrandStepKey,
  slotStates: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  facts: BrandNextQuestionFacts = DEFAULT_NEXT_QUESTION_FACTS,
): BrandNextQuestion | null {
  const next = resolveNextSession(stepKey, slotStates, facts)
  if (!next) return null
  // `kind` ist die EINZIGE Zugabe der Session-Fassung — sie fällt hier raus,
  // damit der Rückgabewert Feld für Feld der von P1b bleibt (die Aufrufstellen
  // vergleichen ihn ganz).
  const { kind: _kind, ...question } = next
  return question
}

/**
 * DIE SESSION-FASSUNG DERSELBEN FRAGE (BW2 §6) — Grundfassung, wie oben: die
 * erste offene Pflicht-Session in Registry-Reihenfolge.
 *
 * Die Menge ist identisch mit der von P1b: `ask`/`collect` sind die Sessions
 * vom Typ `question`, `choose` die vom Typ `choice` — die Abbildung
 * (`sessionKindFor`) ist bijektiv auf diesen beiden Mengen, `a.facts`
 * eingeschlossen. Deshalb kann `resolveNextQuestion` hierauf delegieren, ohne
 * dass sich ihr Verhalten ändert; die bestehenden Tests beweisen es.
 *
 * Die ADAPTIVE Wahl (der Spezialist nennt beim Schliessen die Session mit dem
 * höchsten Informationswert, §6) kommt mit Paket 4 und ersetzt genau diesen
 * Rumpf. Sie liefert denselben Rückgabetyp und wird gegen die Registry
 * geprüft — „Reihenfolge gehört der Registry" gilt weiter, beweglich ist nur
 * die Reihenfolge INNERHALB der offenen Menge.
 */
export interface BrandNextSession extends BrandNextQuestion {
  kind: BrandSessionKind
}

/**
 * DIE FRAGBAREN ARBEITSFORMEN — sie stehen seit dem Gruppen-Umbau
 * (2026-09-09) in `brandSessionGroups.ts`, weil die Kapitel-Leiste und die
 * Finale Abnahme DIESELBE Menge brauchen: was George stellt, steht in der
 * Frage-Gruppe, alles andere unter dem Trenner „Daraus abgeleitet". Zwei
 * gepflegte Listen liefen genau an dem Tag auseinander, an dem jemand eine
 * neue Arbeitsform erfindet.
 */
const ASKABLE_KINDS: readonly BrandSessionKind[] = ASKABLE_SESSION_KINDS

export function resolveNextSession(
  stepKey: BrandStepKey,
  slotStates: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  facts: BrandNextQuestionFacts = DEFAULT_NEXT_QUESTION_FACTS,
): BrandNextSession | null {
  const next = slotsForStep(stepKey).find(session =>
    session.required
    && ASKABLE_KINDS.includes(session.kind)
    && !slotIsFilled(slotStates[session.id])
    // NUR ERREICHBARE FRAGEN (Brand-Design-D2c-Prüfbefund, 2026-09-08): eine
    // Frage, deren Quellen noch nicht bestätigt sind, ist `locked` — und wer
    // sie trotzdem stellt, stellt sie ins Leere. Im Kapitel `dna` war das der
    // Stillstand: nach dem Karten-Klick auf die Weiche (`g.source`, Entwurf,
    // noch nicht bestätigt) galt sie als gefüllt, die nächste Frage war die
    // gesperrte Board-Wahl (`g.board`, wartet auf `g.boards`) — die Bühne
    // zeigte deren leeres Options-Modul, und der Bestätigen-Knopf der Weiche
    // (er erscheint erst, wenn KEINE Frage mehr offen ist) kam nie. In der
    // Foundation stehen offene Fragen fast immer ohne Quellen, dort fiel es
    // nicht auf. Dieselbe Erreichbarkeits-Regel wie `resolveSessionStates`.
    && session.inputs.slots.every(inputId => inputSatisfied(inputId, slotStates)),
  )
  if (!next) return null
  return {
    slotId: next.id,
    // NICHT `next.questionKey` (der Basis-Schlüssel): dieselbe Regel wie
    // überall sonst, s. `BrandNextQuestionFacts`.
    questionKey: slotLabelKeyFor(next, facts.pathKind, facts.team),
    helpKey: next.helpKey,
    type: next.type as 'question' | 'choice',
    editor: next.editor,
    kind: next.kind,
  }
}

/**
 * DER ZUSTAND JEDER EINZELNEN SESSION (BW2 §5) — abgeleitet, keine neue Spalte.
 *
 * `locked`  solange eine Eingabe aus `inputs.slots` unbestätigt ist
 * `open`    alle Eingaben bestätigt, eigener Wert noch nicht
 * `done`    Wert bestätigt und `sourcesHash` aktuell
 * `stale`   Wert bestätigt, aber die Quellen haben sich seither bewegt
 *
 * `active` (die EINE Session, die der Mensch gerade offen hat) fehlt hier
 * absichtlich: das ist ein Client-Zustand aus Route und `brand_messages`,
 * keine Rechnung über gespeicherten Fakten. Wer ihn hier ableitete, hätte zwei
 * Wahrheiten darüber, wo jemand gerade steht.
 *
 * ── DREI REGELN, DIE MAN NICHT „VEREINFACHEN" DARF ────────────────────────
 * 1. BESTÄTIGT SCHLÄGT GESPERRT. Ein bestätigter Wert, dessen Quelle jemand
 *    später wieder geöffnet hat, wird `done`/`stale` — nie `locked`. Das ist
 *    der Migrationsvertrag §3e in dieser Ebene: ein gespeichertes `done` darf
 *    die Ableitung ANZEIGEN, aber nie herabstufen.
 * 2. OHNE GESPEICHERTEN HASH NIE `stale`. Jedes Bestands-Branding hat keinen;
 *    ein Deploy, der alle 68 Felder bernstein färbt, nimmt einem fertigen
 *    Kunden sein Ergebnis.
 * 3. SESSIONS EINES ÜBERSPRUNGENEN KAPITELS SIND `locked`. Die Weiche
 *    entscheidet, ob sie zum Weg gehören — nicht ihr Fortschritt (§3e: die
 *    Daten bleiben liegen, der Weg geht daran vorbei).
 */
export type BrandSessionState = 'locked' | 'open' | 'done' | 'stale'

/**
 * DIE SLOT-FAKTEN ALLER KAPITEL IN EINER KARTE.
 *
 * Eine Session liest ausdrücklich über Kapitelgrenzen (`b.purpose` ←
 * `a.pitch`), also muss jede Rechnung darüber das auch — sonst stünde die
 * halbe Registry für immer auf `locked` und jeder `sourcesHash` rechnete mit
 * leeren Quellen. Sie steht als EIGENE Funktion da, weil GENAU DIESE
 * Zusammenlegung an zwei Enden gebraucht wird: hier beim Ableiten der
 * Zustände und auf dem Schreibweg beim Stempeln des Hashes. Zwei
 * Zusammenlegungen hiessen zwei Hashes für denselben Stand — und die
 * Abweichung sähe man erst an einem Feld, das sich für veraltet hält.
 */
export function mergeBrandSlotFacts(
  stepFacts: readonly BrandStepFacts[],
): Record<string, BrandSlotStateFacts | undefined> {
  const slots: Record<string, BrandSlotStateFacts | undefined> = {}
  for (const facts of stepFacts) {
    for (const [slotId, state] of Object.entries(facts.slots ?? {})) slots[slotId] = state
  }
  return slots
}

/**
 * WIE AUS DEN QUELL-WERTEN EIN GESPEICHERTER STEMPEL WIRD.
 *
 * ── WARUM DAS EIN PARAMETER IST UND KEINE FESTE ZEILE ─────────────────────
 * Die kanonische Zeichenkette (`computeSourcesHash`) gehört `shared/`, das
 * HASHEN nicht: `node:crypto` läge im Client-Bündel. Der Server stempelt
 * deshalb sha256 darüber (`brandSourcesHash`) — und genau denselben Weg muss
 * diese Rechnung gehen, sonst vergleicht sie einen Hash mit einer
 * Zeichenkette und meldet JEDE bestätigte Session als veraltet. Der Vorgabe-
 * Wert ist die reine Zeichenkette, damit ein Test ohne Krypto auskommt; die
 * Routen reichen den Server-Stempler durch (`resolveBrandSessionStates`).
 */
export type BrandSourcesHasher = (
  config: BrandSessionConfig,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
) => string

/**
 * IST DIESE QUELLE ERFÜLLT? — normalerweise „ist sie bestätigt".
 *
 * ── EIN INSTRUMENT IST DURCHSICHTIG (Brand-Design-D2b-Befund, 2026-09-08 am
 *    Klick-Beweis gefunden) ───────────────────────────────────────────────
 * Ein `special`-Slot ist ein INSTRUMENT, keine Entscheidung
 * (`slotIsConfirmable() === false`): die Werkstatt hat für ihn gar keinen
 * Übernehmen-Knopf, und der Speicher schreibt ihm bewusst nie ein `confirmed`
 * — bei den Vorbildern (`g.inspiration`, D2a) wäre das der Weg, über
 * `confirmedSlotValues` ins Dokument zu reisen. Wartete eine Session auf diese
 * Bestätigung, stünde sie für IMMER auf `locked`. Genau das passierte
 * `g.reading`: der Lauf lief (die Route prüft das KAPITEL, nicht die Session),
 * und sein Ergebnis konnte niemand abnehmen.
 *
 * Deshalb wird ein Instrument nicht ÜBERSPRUNGEN, sondern DURCHGEREICHT: es
 * gibt seine eigenen Quellen weiter. `g.reading` wartet damit auf das, worauf
 * `g.inspiration` wartet — die bestätigte Weiche `g.source` —, und nicht auf
 * eine Zustimmung, die es nicht geben kann.
 *
 * Die Quelle bleibt in `inputs.slots`, und das ist der Punkt: der
 * `sourcesHash` rechnet weiter über sie, eine bestätigte Lesung wird also
 * VERALTET, sobald sich die Vorbilder ändern — und der Impact-Hinweis
 * („fliesst später in N Felder ein") behält seine Kette.
 *
 * `seen` bricht einen versehentlichen Zyklus ab, statt hängen zu bleiben
 * (dieselbe Vorsicht wie in `dependencyClosure`).
 */
/**
 * QUELLEN, DIE NUR AUF EINEM WEG ZÄHLEN (Brand Design D2c, Konzept §2.2).
 *
 * ── DAS PROBLEM, DAS SIE LÖST ────────────────────────────────────────────
 * `g.dna` schöpft aus der Lesung der Vorbilder (`g.reading`). Auf dem Weg
 * „Frida schlägt vor" (`g.source` = `foundation`) gibt es aber keine Vorbilder
 * und deshalb nie eine Lesung — `g.dna` stünde dort für IMMER auf `locked`,
 * und das halbe Kapitel wäre unerreichbar. Genau dieselbe Falle wie bei
 * `g.reading` selbst (s. `inputSatisfied`), nur eine Ebene höher.
 *
 * ── WARUM EINE TABELLE UND KEIN NEUER SESSION-ZUSTAND ────────────────────
 * §2.1 sagt es ausdrücklich: an der Zustandsmaschine ändert Schicht 2 NICHTS.
 * Ein `skipped` je Session wäre ein vierter Zustand, den Rail, Fortschritt,
 * Abschluss-Formel und Abnahme alle kennen müssten — für eine Auskunft, die
 * schon in einem bestätigten Feld steht. Die Bedingung liest deshalb den
 * WEICHEN-Wert und sonst nichts.
 *
 * ── DREI FÄLLE, UND DER DRITTE IST DER WICHTIGE ──────────────────────────
 *  · Weiche steht auf `inspiration` ⇒ die Quelle zählt wie jede andere.
 *  · Weiche steht auf `foundation`  ⇒ die Quelle entfällt (erfüllt).
 *  · Weiche ist NOCH NICHT bestätigt ⇒ die Quelle zählt. Das ist kein
 *    Nebeneffekt, sondern die richtige Antwort: solange niemand gesagt hat,
 *    woher die Richtung kommt, ist der Vorschlag nicht an der Reihe.
 *
 * ── GELESEN WIRD DER BESTÄTIGTE WERT, NICHT DER ENTWURF ──────────────────
 * `BrandSlotStateFacts` trägt `confirmed` (Flag) und `value` (bestätigt ODER
 * Entwurf, `brandSlotStoredValue`). Beide zusammen sind hier Pflicht: ein
 * angeklickter, aber nicht übernommener Weg darf ein halbes Kapitel nicht
 * aufschliessen. Die Rechnung läuft ausschliesslich auf dem SERVER
 * (`resolveBrandSessionStates` über `toSlotFacts`), wo `value` immer gefüllt
 * ist — der Browser baut seine Tatsachen ohne Wert und ruft sie nicht auf.
 */
const CONDITIONAL_INPUTS: Readonly<Record<string, {
  readonly switchSlot: string
  /** Nur bei diesen bestätigten Werten zählt die Quelle. */
  readonly countsWhen: readonly string[]
}>> = {
  'g.reading': { switchSlot: 'g.source', countsWhen: ['inspiration'] },
}

/**
 * Zählt diese Quelle auf dem Weg, den der Mensch gewählt hat? Ohne Eintrag in
 * der Tabelle: immer.
 */
export function conditionalInputCounts(
  inputId: string,
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
): boolean {
  const condition = CONDITIONAL_INPUTS[inputId]
  if (!condition) return true
  const facts = slots[condition.switchSlot]
  if (!facts?.confirmed) return true
  const chosen = (facts.value ?? '').trim()
  if (!chosen) return true
  return condition.countsWhen.includes(chosen)
}

function inputSatisfied(
  inputId: string,
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
  seen: Set<string> = new Set(),
): boolean {
  if (seen.has(inputId)) return true
  seen.add(inputId)
  // Eine Quelle, die auf diesem Weg gar nicht vorkommt, blockiert nicht.
  if (!conditionalInputCounts(inputId, slots)) return true
  const input = slotById(inputId)
  if (input && !slotIsConfirmable(input)) {
    return input.inputs.slots.every(sourceId => inputSatisfied(sourceId, slots, seen))
  }
  return Boolean(slots[inputId]?.confirmed)
}

export function resolveSessionStates(
  profile: BrandProfileFacts,
  stepFacts: readonly BrandStepFacts[] = [],
  sourcesHash: BrandSourcesHasher = computeSourcesHash,
): Readonly<Record<string, BrandSessionState>> {
  const included = new Set(includedBrandSteps(profile))
  const slots = mergeBrandSlotFacts(stepFacts)

  const states: Record<string, BrandSessionState> = {}
  for (const session of BRAND_SLOTS) {
    if (session.deactivated) continue
    const own = slots[session.id]

    if (own?.confirmed) {
      const stored = own.sourcesHash
      states[session.id] = stored !== undefined && stored !== sourcesHash(session, slots)
        ? 'stale'
        : 'done'
      continue
    }
    if (!included.has(session.stepId)) {
      states[session.id] = 'locked'
      continue
    }
    const inputsReady = session.inputs.slots.every(inputId => inputSatisfied(inputId, slots))
    states[session.id] = inputsReady ? 'open' : 'locked'
  }
  return states
}

/**
 * WOHIN ES NACH DIESEM ZUG WEITERGEHT (Auto-Weiter, Plan §5) — Kapitel und
 * Session der nächsten offenen Pflicht-Session.
 *
 * ── ODER DIE FINALE ABNAHME ──────────────────────────────────────────────
 * Steht keine Frage mehr offen UND ist jeder Pflicht-Slot bestätigt, zeigt der
 * Wegweiser nicht ins Leere, sondern auf die Abnahme-Seite des Kapitels
 * (`{ acceptance: true }`, Fables Produktentscheidung zu 3a-Frage 4,
 * 2026-09-04). Vorher war `null` an dieser Stelle zweideutig: „nichts mehr zu
 * fragen" und „hier ist Schluss" sahen für den Client gleich aus, und die
 * Abnahme-Seite war nur über die Seitenleiste erreichbar.
 *
 * `null` heisst jetzt genau eine Sache: in diesem Kapitel ist keine Frage
 * offen, aber es fehlt noch ein bestätigter Pflicht-Wert (ein Entwurf auf der
 * Bühne etwa) — der Mensch bleibt, wo er ist.
 */
export type BrandNextSessionRef =
  | { stepKey: BrandStepKey, sessionKey: string }
  | { stepKey: BrandStepKey, acceptance: true }

/**
 * DIE NÄCHSTE UNBESTÄTIGTE SESSION — der Wegweiser zählt anders als die Frage
 * (Testlauf-Befund E, 2026-09-09).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * `resolveNextSession` überspringt jede Session, in der schon ein WERT steht
 * (`slotIsFilled` — Entwurf ODER Bestätigung). Für „was frage ich als
 * Nächstes?" ist das richtig: eine Frage mit Antwort stellt man nicht noch
 * einmal. Für „wohin geht es weiter?" ist es falsch. Im Live-Test hiess der
 * Knopf nach dem Abschluss von Kundenstimmen „Weiter zu Größtes Hindernis",
 * während Kritik & Beschwerden und Das Eine in der Leiste offen standen — sie
 * trugen einen (irrtümlich hineingeschriebenen) Wert und galten damit als
 * erledigt. Ein unbestätigter Wert ist OFFEN, nicht fertig; erledigt ist erst,
 * was bestätigt ist.
 *
 * ── WAS ÜBERSPRUNGEN WIRD ─────────────────────────────────────────────────
 * Bestätigt (die Arbeit ist getan), vertagt („darauf komme ich zurück" — der
 * Auto-Weiter überspringt sie einmal, §3a) und unerreichbar (eine Session,
 * deren Quellen noch nicht stehen, wäre ein Gespräch ohne Grundlage). Die
 * Menge bleibt die der FRAGBAREN Arbeitsformen: Ableitungen entwirft George
 * von sich aus, sie sind kein Ziel für „weiter".
 */
export function resolveNextOpenSession(
  stepKey: BrandStepKey,
  slotStates: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
): string | null {
  return slotsForStep(stepKey).find(session =>
    session.required
    && ASKABLE_KINDS.includes(session.kind)
    && !slotStates[session.id]?.confirmed
    && !slotStates[session.id]?.deferred
    && session.inputs.slots.every(inputId => inputSatisfied(inputId, slotStates)),
  )?.id ?? null
}

export function resolveNextStop(
  stepKey: BrandStepKey,
  slotStates: Readonly<Record<string, BrandSlotStateFacts | undefined>> = {},
  sessionStates: Readonly<Record<string, BrandSessionState | undefined>> = {},
): BrandNextSessionRef | null {
  const queued = nextStaleSession(stepKey, sessionStates)
  if (queued) return { stepKey, sessionKey: queued }
  const upcoming = resolveNextOpenSession(stepKey, slotStates)
  if (upcoming) return { stepKey, sessionKey: upcoming }
  return brandStepCompletion(stepKey, slotStates).slotsReady ? { stepKey, acceptance: true } : null
}

/** Was der Abschlusszug über eine Session wissen muss, um sie zu nennen. */
export interface BrandSkipFacts {
  /** Bestätigt — der Mensch hat sie schon beantwortet und abgeschlossen. */
  confirmed: boolean
  /** Auf später vertagt („darauf komme ich zurück"). */
  deferred: boolean
}

/**
 * WAS ZWISCHEN HIER UND DEM ZIEL ÜBERSPRUNGEN WIRD (Davids Entscheidung
 * 2026-09-09, Session-Abschluss).
 *
 * ── WOZU ──────────────────────────────────────────────────────────────────
 * Der Weiter-Knopf zeigt nicht auf die Session, die in der Leiste als NÄCHSTE
 * steht, sondern auf die nächste OFFENE (`resolveNextStop`). Für den Menschen
 * sieht das aus wie ein Sprung: „warum überspringt er Kundenstimmen?". George
 * bekommt die übergangenen Sessions deshalb in den Auftrag und spricht sie aus
 * („Kundenstimmen hast du schon beantwortet, weiter mit Kritik & Beschwerden").
 *
 * ── DREI ENTSCHEIDUNGEN ───────────────────────────────────────────────────
 * 1. NUR VORWÄRTS. Liegt das Ziel VOR der eben geschlossenen Session (die
 *    Warteschlange „neu besprechen" greift zuerst, §9), wird nichts
 *    übersprungen — es wird zurückgesprungen, und dafür hat der Auftrag den
 *    Grund der Veraltung.
 * 2. NUR BESTÄTIGTES UND VERTAGTES. Eine GESPERRTE Session ist nicht „schon
 *    erledigt", sondern „noch nicht dran"; George dürfte über sie nicht sagen,
 *    der Mensch habe sie beantwortet — das wäre schlicht falsch. Sie fällt
 *    deshalb still weg, obwohl `resolveNextStop` sie ebenfalls überspringt.
 * 3. OHNE ZIEL BIS ANS ENDE. Zeigt der Wegweiser auf die Finale Abnahme (oder
 *    nirgendwohin), ist „zwischen hier und dort" der REST des Kapitels.
 *
 * PUR wie alles hier: sie nimmt Tatsachen entgegen und gibt Slot-Ids zurück —
 * die Beschriftungen macht der Aufrufer (der Server kennt die Inhaltssprache).
 */
export function skippedSessionsBetween(
  stepKey: BrandStepKey,
  fromSessionId: string,
  target: BrandNextSessionRef | null,
  facts: Readonly<Record<string, BrandSkipFacts | undefined>>,
): string[] {
  const order = slotsForStep(stepKey)
  const start = order.findIndex(session => session.id === fromSessionId)
  if (start < 0) return []

  const targetKey = target && 'sessionKey' in target ? target.sessionKey : ''
  const stop = targetKey ? order.findIndex(session => session.id === targetKey) : order.length
  // Ziel VOR der geschlossenen Session (oder unbekannt) ⇒ nichts dazwischen.
  if (targetKey && stop <= start) return []

  const skipped: string[] = []
  for (const session of order.slice(start + 1, stop < 0 ? order.length : stop)) {
    const fact = facts[session.id]
    if (fact?.confirmed || fact?.deferred) skipped.push(session.id)
  }
  return skipped
}

/**
 * DIE WARTESCHLANGE „NEU BESPRECHEN" (§9, Paket 6) — die erste VERALTETE
 * Session dieses Kapitels in Registry-Reihenfolge.
 *
 * ── WARUM SIE VOR DEN OFFENEN KOMMT ──────────────────────────────────────
 * Eine `stale`-Session trägt einen bestätigten Wert, der auf einer Grundlage
 * steht, die es so nicht mehr gibt. Wer daran vorbei erst die nächsten
 * offenen Felder beantwortet, baut auf demselben Sand weiter — und muss die
 * neuen Antworten hinterher ein zweites Mal ansehen. Der Plan sagt es in
 * einem Satz: „Auto-Weiter bedient sie vor den offenen Sessions."
 *
 * ── OHNE ZUSTÄNDE ÄNDERT SICH NICHTS ─────────────────────────────────────
 * `sessionStates` ist optional und leer der Vorgabewert: eine Aufrufstelle,
 * die die Zustände nicht kennt (sie sind eine Rechnung über ALLE Kapitel),
 * bekommt wörtlich das Verhalten von vor Paket 6. Das ist Absicht — eine
 * halbe Warteschlange aus halben Daten wäre schlimmer als keine.
 */
function nextStaleSession(
  stepKey: BrandStepKey,
  sessionStates: Readonly<Record<string, BrandSessionState | undefined>>,
): string | null {
  return slotsForStep(stepKey).find(session => sessionStates[session.id] === 'stale')?.id ?? null
}

/**
 * DIE ZUSTÄNDE, aus denen der Wegweiser rechnet — beide, weil er zwei
 * verschiedene Fragen stellt.
 *
 * `slots` beantwortet „was steht schon?" (die Grundfassung `resolveNextStop`),
 * `sessions` beantwortet „ist der VORSCHLAG überhaupt betretbar?" — und das
 * ist eine Rechnung über ALLE Kapitel (`resolveSessionStates`), weil eine
 * Session über Kapitelgrenzen liest. Zusammengelegt wären es zwei Antworten
 * aus einer Karte, die nur eine der beiden Fragen kennt.
 */
export interface BrandNextSessionStates {
  slots: Readonly<Record<string, BrandSlotStateFacts | undefined>>
  sessions: Readonly<Record<string, BrandSessionState | undefined>>
}

/**
 * DIE ADAPTIVE NÄCHSTE SESSION (BW2 §6, Paket 4) — der Vorschlag des
 * Spezialisten, GEPRÜFT gegen die Registry.
 *
 * ── „REIHENFOLGE GEHÖRT DER REGISTRY" GILT WEITER ────────────────────────
 * Beweglich ist ausschliesslich die Reihenfolge INNERHALB der offenen Menge.
 * Vier Bedingungen muss ein Vorschlag erfüllen, sonst gilt die Grundfassung:
 * er muss eine bekannte, nicht deaktivierte Session sein, er muss zu DIESEM
 * Kapitel gehören, und ihr Zustand muss `open` sein.
 *
 * `open` ist dabei die einzige richtige Bedingung, und die drei anderen
 * Zustände sagen warum: `locked` heisst „ihre Eingaben stehen noch nicht" —
 * George dorthin zu schicken wäre ein Gespräch ohne Grundlage. `done` und
 * `stale` heissen „hier steht ein bestätigter Wert" — das ist eine
 * Korrektur (§9, Paket 6) und nicht der nächste Schritt.
 *
 * Ohne Vorschlag oder mit einem, der durchfällt, antwortet `resolveNextStop`
 * wie bisher — inklusive des Sprungs auf die Finale Abnahme am Kapitelende.
 * Ein Modell kann den Weg damit UMORDNEN, aber nie verlassen.
 */
export function pickNextSession(
  stepKey: BrandStepKey,
  states: BrandNextSessionStates,
  suggestion: string | null | undefined,
): BrandNextSessionRef | null {
  // DIE WARTESCHLANGE SCHLÄGT DEN VORSCHLAG (§9, Paket 6): der Spezialist
  // wählt unter den OFFENEN Sessions, die Warteschlange räumt auf, was durch
  // eine Korrektur unsicher geworden ist. Ein Vorschlag, der daran vorbeiführt,
  // schiebt Arbeit vor sich her, die der Mensch gerade selbst ausgelöst hat.
  const queued = nextStaleSession(stepKey, states.sessions)
  if (queued) return { stepKey, sessionKey: queued }

  const proposed = suggestion ? slotById(suggestion) : undefined
  if (
    proposed
    && !proposed.deactivated
    && proposed.stepId === stepKey
    && states.sessions[proposed.id] === 'open'
  ) {
    return { stepKey, sessionKey: proposed.id }
  }
  return resolveNextStop(stepKey, states.slots, states.sessions)
}

export type BrandJunctionChange =
  | { junction: 'subBrands', value: BrandProfileFacts['subBrands'] }
  | { junction: 'hasName', value: boolean }
  | { junction: 'namingOpted', value: boolean }
  | { junction: 'relaunchScope', value: BrandProfileFacts['relaunchScope'] }
  | { junction: 'team', value: BrandProfileFacts['team'] }

export interface BrandJunctionEffect {
  /** Das Profil NACH der Änderung. */
  profile: BrandProfileFacts
  /** Bausteine, die neu auf dem Weg liegen (waren `skipped`). */
  activated: readonly BrandStepKey[]
  /** Bausteine, die vom Weg verschwinden. Ihre Daten bleiben INAKTIV (§3e). */
  deactivated: readonly BrandStepKey[]
  changed: boolean
}

/**
 * EINE WEICHE UMLEGEN — als reine Abbildung: altes Profil + Änderung ⇒ neues
 * Profil plus die Liste der Bausteine, die dadurch auf oder vom Weg gehen.
 *
 * Diese Funktion LÖSCHT NICHTS und schreibt nichts; das ist Aufgabe der
 * Route, und ihre Aufgabe ist dort ausdrücklich, NICHT zu löschen (§3e:
 * „entfallene Daten werden INAKTIV, nie gelöscht — wer Naming später wieder
 * aktiviert, findet seinen Stand vor"). Die `deactivated`-Liste ist deshalb
 * eine Ansage an die Oberfläche, keine Aufräumliste.
 *
 * `team` steht mit in der Liste, obwohl es keinen Baustein bewegt (s. Kopf):
 * eine Weiche, die man an einer anderen Stelle beantworten müsste, würde
 * irgendwann an beiden Stellen anders behandelt.
 */
export function applyJunctionChange(
  profile: BrandProfileFacts,
  change: BrandJunctionChange,
): BrandJunctionEffect {
  const before = new Set(includedBrandSteps(profile))
  const next: BrandProfileFacts = { ...profile, [change.junction]: change.value }
  const after = new Set(includedBrandSteps(next))

  const activated = BRAND_STEP_KEYS.filter(stepKey => after.has(stepKey) && !before.has(stepKey))
  const deactivated = BRAND_STEP_KEYS.filter(stepKey => before.has(stepKey) && !after.has(stepKey))

  return {
    profile: next,
    activated,
    deactivated,
    changed: profile[change.junction] !== change.value,
  }
}

/**
 * WOHIN NACH DER ANLAGE (Kailua-Befund 6, 2026-09-08) — das erste Kapitel, das
 * ein frisch angelegtes Branding betreten darf.
 *
 * ── WARUM ES DIESE REGEL GIBT ────────────────────────────────────────────
 * Seit Davids Entscheidung legen ZWEI Oberflächen an (das Modal auf
 * `/dashboard/brands` und die Seite `/dashboard/brands/new`), und beide müssen
 * danach an derselben Stelle landen. Zwei Kopien derselben drei Zeilen wären
 * zwei Meinungen über „das erste Kapitel" — und die Abweichung merkte man erst,
 * wenn ein Weg in einem gesperrten Baustein endet.
 *
 * ── DIE RANGFOLGE ────────────────────────────────────────────────────────
 * `open`/`active` zuerst (der Weg, den die Journey selbst vorschlägt), sonst
 * der erste Baustein, der überhaupt auf dem Weg liegt — ein `skipped` ist keine
 * Adresse, die Route antwortet dort 403. Der Rückfall `context` ist die
 * Notbremse für eine Antwort ohne Journey: er ist immer der erste Baustein und
 * nie übersprungen.
 */
export function firstOpenBrandStep(journey: readonly BrandJourneyStep[]): BrandStepKey {
  return journey.find(step => step.state === 'open' || step.state === 'active')?.stepKey
    ?? journey.find(step => step.state !== 'skipped')?.stepKey
    ?? 'context'
}
