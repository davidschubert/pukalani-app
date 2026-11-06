import { brandDesignDefaultsFromDna, brandMotionTransitions } from './brandDesign'
import type { BrandSceneMotion } from './brandDesignScene'
import {
  BRAND_LOGO_MOTION_OPTIONS,
  BRAND_MOTION_STAGGER_MS,
  BRAND_MOTION_TOKENS,
  BRAND_TEMPO_OPTIONS,
  type BrandTempoOption,
} from './brandDesignVocab'
import { brandSlotValueView, formatBrandSlotList, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE BEWEGUNG — die REGELN von Kapitel 6, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.7, Paket D7).
 *
 * ── VIER SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ───────────────────
 * `l.tempo` ist die EINE Entscheidung; `l.transitions` rechnet daraus den
 * Token-Satz, `l.logo` fragt, ob das Zeichen mitmacht, und `l.rules` schreibt
 * auf, was aus beidem folgt. Getrennt lägen Schreiber und Leser derselben Form
 * in vier Dateien (dieselbe Begründung wie `brandDesignColor.ts` in D3,
 * `brandDesignType.ts` in D4, `brandDesignMark.ts` in D5 und
 * `brandDesignImagery.ts` in D6).
 *
 * ── DIE ZAHLEN STEHEN HIER NICHT ──────────────────────────────────────────
 * Grunddauer und Easing je Tempo gehören dem VOKABULAR
 * (`BRAND_TEMPO_OPTIONS`), die Faktoren dem Token-Satz (`BRAND_MOTION_TOKENS`),
 * und die RECHNUNG steht in `brandMotionTransitions()` (D0, `brandDesign.ts`) —
 * genau der Funktion, die `buildBrandDesign()` ins Preset schreibt. Diese Datei
 * rechnet die Dauern deshalb NICHT selbst nach: zwei Rechenwege für dieselbe
 * Tabelle wären zwei Wahrheiten, und die Zahl auf dem Bildschirm ist genau die,
 * die Produkt 03 später als Token ausliefert (dieselbe Zusage wie bei der
 * Kontrast-Matrix in D3).
 *
 * ── KEIN MODELL, KEIN LAUF (wie D6) ───────────────────────────────────────
 * Alle vier Sessions tragen `generator: 'none'`. Ein Tempo ist eine WAHL, die
 * Übergänge sind eine RECHNUNG, und die Bewegungs-Regeln folgen aus beidem —
 * ein Entwurfs-Knopf schriebe hier Prosa in Felder, die vier Tokens und sechs
 * prüfbare Sätze halten. §1.4 gilt doppelt: Bewegung sind REGELN.
 *
 * ── „WENIGER BEWEGUNG" IST DIE ZWEITE HÄLFTE DER REGEL, KEIN SONDERFALL ───
 * Deshalb steht der `prefers-reduced-motion`-Satz IMMER in der Liste — er wird
 * nicht aus einer Wahl abgeleitet und lässt sich nicht abwählen. Und er sagt
 * „Endzustand sofort", nicht „langsamer": eine halb so schnelle
 * Ersatz-Animation ist derselbe Fehler mit halber Dauer (Anti-Muster von
 * `l.rules` in `sessionContent.ts`).
 *
 * DIESE DATEI IST PUR: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

function isGerman(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/** Zweisprachiger Satz — dieselbe Form wie überall im Layer. */
export interface BrandMotionText {
  readonly de: string
  readonly en: string
}

function textOf(entry: BrandMotionText, locale: string): string {
  return isGerman(locale) ? entry.de : entry.en
}

// ── Das Tempo (`l.tempo`) ──────────────────────────────────────────────────

export function isBrandTempo(tempoId: string): boolean {
  return BRAND_TEMPO_OPTIONS.some(option => option.id === tempoId)
}

/** Das Tempo zu einer Id — mit dem Rückfall des Katalogs (nie `undefined`). */
export function brandTempoOrFirst(tempoId: string): BrandTempoOption {
  return BRAND_TEMPO_OPTIONS.find(option => option.id === tempoId) ?? BRAND_TEMPO_OPTIONS[0]!
}

export function isBrandLogoMotion(optionId: string): boolean {
  return BRAND_LOGO_MOTION_OPTIONS.some(option => option.id === optionId)
}

export interface BrandMotionDefaults {
  /** Id aus `BRAND_TEMPO_OPTIONS`. */
  tempo: string
  /** Id aus `BRAND_LOGO_MOTION_OPTIONS`. */
  logo: string
}

/**
 * DAS KAPITEL BELEGT SICH SELBST VOR (H5: „jede Session muss als BESTÄTIGUNG
 * durchlaufbar sein").
 *
 * Beide Werte kommen aus `brandDesignDefaultsFromDna()` (D0) — dieselbe
 * Tabelle, die Produkt 03 lesen wird: die DNA-Dimension „Bewegungs-Charakter"
 * entscheidet BEIDES (`TEMPO_BY_MOTION`, `LOGO_MOTION_BY_MOTION`). Eine zweite
 * Zuordnung hier wäre eine zweite Meinung darüber, was „federnd" für ein Tempo
 * heisst (dieselbe Regel wie in D6).
 *
 * Ohne DNA gilt das RUHIGE Tempo und ein stillstehendes Zeichen: das ist der
 * Fall, der nichts behauptet und keine zusätzliche Datei verlangt.
 */
export function brandMotionDefaults(
  dna: Readonly<Record<string, string>> | undefined,
): BrandMotionDefaults {
  const fromDna = brandDesignDefaultsFromDna(dna)
  const tempo = fromDna.tempo ?? ''
  const logo = fromDna.logoMotion ?? ''
  return {
    tempo: isBrandTempo(tempo) ? tempo : BRAND_TEMPO_OPTIONS[0]!.id,
    logo: isBrandLogoMotion(logo) ? logo : BRAND_LOGO_MOTION_OPTIONS[0]!.id,
  }
}

// ── Die Übergänge (`l.transitions`) ────────────────────────────────────────

/**
 * DER NAME EINES TOKENS — `motion.fast`, in JEDER Sprache gleich.
 *
 * Es ist eine Kennung im Gestaltungssystem und kein Anzeigetext: ein
 * übersetztes „bewegung.schnell" stünde später in keinem CSS, in keinem
 * Tailwind-Theme und in keiner Figma-Variablen (dieselbe Begründung wie bei
 * `BRAND_DODONT_DO_LABEL` in D6).
 */
export function brandMotionTokenLabel(tokenId: string): string {
  return `motion.${tokenId}`
}

/**
 * WOFÜR JEDES TOKEN DA IST — wörtlich aus dem freigegebenen Prototyp
 * (`.playground/app/utils/demoDesign.ts`, `DS_MOTION_TOKENS`).
 *
 * Der Zweck ist der GANZE Wert dieser Tabelle: drei Zahlen ohne Zuordnung sind
 * eine Einstellung, drei Zahlen mit Zuordnung sind eine Regel, an die sich zwei
 * Entwicklerinnen halten können, ohne miteinander zu sprechen.
 */
export const BRAND_MOTION_TOKEN_USAGE: Readonly<Record<string, BrandMotionText>> = {
  fast: {
    de: 'Hover, Fokus, kleine Zustände.',
    en: 'Hover, focus, small state changes.',
  },
  base: {
    de: 'Karten, Einblendungen, Menüs.',
    en: 'Cards, reveals, menus.',
  },
  slow: {
    de: 'Seitenwechsel, große Flächen.',
    en: 'Page changes, large surfaces.',
  },
  stagger: {
    de: 'Versatz zwischen Geschwistern (Listen, Karten).',
    en: 'Offset between siblings (lists, cards).',
  },
}

export interface BrandMotionToken {
  /** `fast` · `base` · `slow` · `stagger`. */
  readonly id: string
  /** `motion.fast` — der Name im Gestaltungssystem. */
  readonly label: string
  readonly durationMs: number
  readonly easing: string
  readonly usage: string
}

/**
 * DIE VIER TOKENS EINES TEMPOS — drei Dauern und der Versatz.
 *
 * Die Zahlen kommen aus `brandMotionTransitions()` (D0), nicht aus einer
 * eigenen Multiplikation (s. Kopf). Ein unbekanntes Tempo ergibt eine LEERE
 * Liste: eine Tabelle aus Notwerten wäre eine Auskunft über nichts.
 */
export function brandMotionTokens(tempoId: string, locale: string): BrandMotionToken[] {
  return brandMotionTransitions(tempoId).map(token => ({
    id: token.id,
    label: brandMotionTokenLabel(token.id),
    durationMs: token.durationMs,
    easing: token.easing,
    usage: BRAND_MOTION_TOKEN_USAGE[token.id]
      ? textOf(BRAND_MOTION_TOKEN_USAGE[token.id]!, locale)
      : '',
  }))
}

/**
 * WOFÜR EIN TOKEN DA IST — der Zweck OHNE das Tempo (Brand Design D8).
 *
 * Kapitel 10 und das Ergebnis-Board lesen ihre Dauern aus dem PRESET (dort
 * stehen sie eingefroren) und brauchen von hier nur noch den Zweck. Sie über
 * `brandMotionTokens(tempo, locale)` zu holen hiesse, die Zahlen ein zweites
 * Mal zu rechnen — und ein eingefrorener Snapshot zeigte dann die Zahlen von
 * heute unter den Werten von damals.
 *
 * Leer bei unbekanntem Token: eine erfundene Zweckzeile wäre eine Regel, die
 * niemand aufgeschrieben hat.
 */
export function brandMotionTokenUsage(tokenId: string, locale: string): string {
  const usage = BRAND_MOTION_TOKEN_USAGE[tokenId]
  return usage ? textOf(usage, locale) : ''
}

/** Die Dauer EINES Tokens in ms — 0, wenn es das Token hier nicht gibt. */
export function brandMotionDuration(tempoId: string, tokenId: string): number {
  return brandMotionTransitions(tempoId).find(token => token.id === tokenId)?.durationMs ?? 0
}

/**
 * DIE WERTE, MIT DENEN DIE SZENE SPIELT (`BwDesignScene`, §2.9).
 *
 * Sie sind DIESELBEN wie in der Tabelle darüber: `duration` ist `motion.base`,
 * `stagger` der Versatz. Eine Vorschau, die schneller liefe als ihr eigener
 * Token-Satz, wäre die Lüge, um deren Vermeidung dieses Kapitel sich dreht.
 */
export function brandMotionScene(tempoId: string): BrandSceneMotion {
  const tempo = brandTempoOrFirst(tempoId)
  return {
    duration: brandMotionDuration(tempo.id, 'base') || tempo.base,
    easing: tempo.easing,
    stagger: BRAND_MOTION_STAGGER_MS,
  }
}

/** „240 ms" — ganze Millisekunden, in beiden Sprachen gleich geschrieben. */
export function brandMotionDurationText(durationMs: number): string {
  return `${Math.round(durationMs)} ms`
}

// ── Der Slot-Wert von `l.transitions` ──────────────────────────────────────
//
// VIER BLÖCKE, beschriftet mit dem TOKEN-NAMEN (`motion.fast`) — anders als in
// D4 und D6, wo die Beschriftung in der Inhaltssprache steht. Der Grund ist der
// Zweck des Wertes: er ist eine Übergabe an die Umsetzung, und `motion.fast`
// ist dort der Schlüssel. Gelesen wird trotzdem nach POSITION, wie überall.
//
// ' · ' trennt Dauer, Easing und Zweck; keiner der drei kann es enthalten (eine
// Zahl mit „ms", eine `cubic-bezier`-Kurve, ein Satz ohne Mittelpunkt).

const TRANSITION_PART_SEPARATOR = ' · '

export function brandMotionTransitionsSlotValue(tempoId: string, locale: string): string {
  return formatBrandSlotStructured(brandMotionTokens(tempoId, locale).map(token => ({
    label: token.label,
    body: [brandMotionDurationText(token.durationMs), token.easing, token.usage]
      .filter(part => part.length > 0)
      .join(TRANSITION_PART_SEPARATOR),
  })))
}

/**
 * DER WEG ZURÜCK — `null`, sobald die Form nicht stimmt (fail-soft wie überall).
 *
 * Gelesen werden Name, Dauer und Easing; der ZWECK wird durchgereicht, aber
 * nicht geprüft: er ist ein Satz, den jemand nachbessern darf, ohne dass der
 * Token-Satz dadurch unlesbar wird (dieselbe Arbeitsteilung wie beim Namen des
 * Bild-Prinzips in D6).
 */
export function parseBrandMotionTransitionsSlotValue(value: string): BrandMotionToken[] | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length === 0) return null

  const tokens: BrandMotionToken[] = []
  for (const block of view.blocks) {
    const label = block.label.trim()
    if (!label.startsWith('motion.')) return null
    const parts = block.body.split('·').map(part => part.trim())
    const durationMs = Number.parseInt((parts[0] ?? '').replace('ms', '').trim(), 10)
    const easing = parts[1] ?? ''
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !easing) return null
    tokens.push({
      id: label.slice('motion.'.length),
      label,
      durationMs,
      easing,
      usage: parts.slice(2).join(TRANSITION_PART_SEPARATOR).trim(),
    })
  }
  return tokens
}

/**
 * DAS TEMPO ZURÜCK AUS SEINEN TOKENS — welches Tempo erzeugt genau diesen Satz?
 *
 * Sie ist der Rückweg der DERIVATION und beantwortet die einzige Frage, die ein
 * späterer Leser an `l.transitions` hat: „aus welcher Entscheidung ist das
 * entstanden?". Verglichen werden ALLE Dauern und das Easing — zwei Tempos
 * unterscheiden sich in jeder Zeile, und ein Vergleich nur der Grunddauer
 * hielte einen von Hand korrigierten Wert für unversehrt.
 */
export function brandMotionTempoFromTransitions(value: string): string | null {
  const tokens = parseBrandMotionTransitionsSlotValue(value)
  if (!tokens) return null
  for (const option of BRAND_TEMPO_OPTIONS) {
    const expected = brandMotionTransitions(option.id)
    if (expected.length !== tokens.length) continue
    const same = expected.every((token, index) =>
      tokens[index]!.id === token.id
      && tokens[index]!.durationMs === token.durationMs
      && tokens[index]!.easing === token.easing)
    if (same) return option.id
  }
  return null
}

// ── Das kinetische Zeichen (`l.logo`) ──────────────────────────────────────

/**
 * DIE DAUER DES AUFBAUS, wenn das Zeichen sich bewegt — 800 ms, wörtlich aus
 * dem Prototyp.
 *
 * Sie hängt BEWUSST nicht am Tempo: das Tempo regelt Übergänge in der
 * Anwendung, ein Zeichen-Aufbau ist ein Vorspann und läuft genau einmal. Wer
 * ihn an `motion.slow` hängte, bekäme bei „knapp" eine 192-ms-Zuckung, die
 * niemand als Aufbau erkennt.
 */
export const BRAND_LOGO_MOTION_BUILD_MS = 800

// ── Die Bewegungs-Regeln (`l.rules`) ───────────────────────────────────────

/**
 * DIE ZWEI SÄTZE, DIE IMMER GELTEN — wörtlich aus dem freigegebenen Prototyp
 * (`DS_MOTION_RULES`).
 *
 * Sie hängen an keiner Wahl: „Bewegung erklärt einen Zusammenhang" ist der
 * Zweck von Bewegung überhaupt, und die Zwei-Eigenschaften-Regel ist das, was
 * eine Umsetzung prüfbar macht („Every rule can be checked on a real page",
 * `sessionContent.ts`).
 */
const RULE_PURPOSE: BrandMotionText = {
  de: 'Bewegung erklärt einen Zusammenhang oder sie entfällt — Dekoration bewegt sich nie.',
  en: 'Movement explains a relationship or it does not happen — decoration never moves.',
}

const RULE_PROPERTIES: BrandMotionText = {
  de: 'Nur zwei Eigenschaften gleichzeitig: Deckkraft und eine Verschiebung. '
    + 'Keine Rotation, keine Skalierung von Text.',
  en: 'Only two properties at a time: opacity and one shift. No rotation, no scaling of type.',
}

/**
 * DER SATZ ZUM GEWÄHLTEN TEMPO — er sagt, was die Kurve DARF und was nicht.
 *
 * „Nie federn" beim ruhigen Tempo ist die wichtigste Zeile dieser Tabelle: die
 * ruhige Kurve (`cubic-bezier(0.22, 0.61, 0.36, 1)`) läuft aus, die lebendige
 * (`0.34, 1.4, 0.64, 1`) schwingt über — wer beides mischt, hat zwei Tempos in
 * einer Marke, und genau das nennt `l.tempo` als Anti-Muster („Two tempos
 * depending on the context").
 */
const RULE_BY_TEMPO: Readonly<Record<string, BrandMotionText>> = {
  calm: {
    de: 'Kein Überschwingen: die Kurve läuft aus, sie federt nie — das ruhige Tempo lebt vom Ausklang.',
    en: 'No overshoot: the curve eases out, it never springs back — the calm tempo lives from the settle.',
  },
  lively: {
    de: 'Das leichte Überschwingen gilt für Flächen und Knöpfe — nie für Text und nie für das Zeichen.',
    en: 'The slight overshoot applies to surfaces and buttons — never to type and never to the mark.',
  },
  snappy: {
    de: 'Kein Anlauf und kein Ausklang: die Bewegung ist so kurz, dass sie nur den Zusammenhang zeigt.',
    en: 'No run-up and no settle: the movement is short enough to show the relationship and nothing else.',
  },
}

/**
 * DER SATZ ZUM ZEICHEN. Ein „Nein" ist eine ENTSCHEIDUNG und wird als solche
 * aufgeschrieben — nicht als Auslassung (Qualitätsmerkmal von `l.logo`).
 */
const RULE_BY_LOGO: Readonly<Record<string, BrandMotionText>> = {
  no: {
    de: 'Das Zeichen steht still — auch im Vorspann eines Videos. Es gibt keine bewegte Fassung, '
      + 'die jemand pflegen müsste.',
    en: 'The mark stands still — in a video intro as well. There is no animated version anybody has to '
      + 'maintain.',
  },
  yes: {
    de: 'Das Zeichen baut sich an genau einer Stelle auf — Vorspann und Ladefläche, {build}, danach '
      + 'steht es. Dafür gibt es eine eigene Datei und eine Fassung ohne Bewegung.',
    en: 'The mark builds once and only in one place — intro and loading screen, {build}, then it stands. '
      + 'It needs its own file and a version without movement.',
  },
}

/**
 * DER DECKEL — die längste erlaubte Dauer ist `motion.slow` DIESES Tempos.
 *
 * Er ist gerechnet und nicht gesetzt: ein fester Deckel („nichts über 400 ms")
 * wäre beim knappen Tempo doppelt so gross wie der langsamste eigene Token und
 * damit eine Erlaubnis, die dem Tempo widerspricht.
 */
const RULE_CAP: BrandMotionText = {
  de: 'Nichts läuft länger als {cap} — das ist motion.slow. Wer mehr braucht, hat eine Animation '
    + 'und keinen Übergang.',
  en: 'Nothing runs longer than {cap} — that is motion.slow. Anything longer is an animation, not a '
    + 'transition.',
}

/**
 * DIE ZWEITE HÄLFTE JEDER REGEL (s. Kopf) — sie steht IMMER da und lässt sich
 * nicht abwählen.
 */
const RULE_REDUCED: BrandMotionText = {
  de: 'Bei „weniger Bewegung" im Betriebssystem steht der Endzustand sofort — keine langsamere '
    + 'Ersatz-Animation, kein Ausblenden „light".',
  en: 'With "reduced motion" set in the operating system the end state simply stands — no slower '
    + 'replacement animation, no "light" fade.',
}

/**
 * DIE SECHS ZEILEN — Zweck, Eigenschaften, Tempo, Zeichen, Deckel, Reduktion.
 *
 * SECHS und nicht mehr: `l.rules` nennt „a rule that says ‚use animation
 * sparingly'" und eine Liste, „die niemand zweimal liest", als Anti-Muster.
 * Jede dieser Zeilen lässt sich an einer echten Seite nachprüfen — die
 * Reihenfolge ist die der Entscheidungen im Kapitel.
 */
export function brandMotionRules(tempoId: string, logoId: string, locale: string): string[] {
  const tempo = brandTempoOrFirst(tempoId)
  const cap = brandMotionDurationText(brandMotionDuration(tempo.id, 'slow'))
  const logoRule = RULE_BY_LOGO[isBrandLogoMotion(logoId) ? logoId : BRAND_LOGO_MOTION_OPTIONS[0]!.id]!
  return [
    textOf(RULE_PURPOSE, locale),
    textOf(RULE_PROPERTIES, locale),
    textOf(RULE_BY_TEMPO[tempo.id] ?? RULE_BY_TEMPO.calm!, locale),
    textOf(logoRule, locale).replace('{build}', brandMotionDurationText(BRAND_LOGO_MOTION_BUILD_MS)),
    textOf(RULE_CAP, locale).replace('{cap}', cap),
    textOf(RULE_REDUCED, locale),
  ]
}

export function brandMotionRulesSlotValue(rules: readonly string[]): string {
  return formatBrandSlotList(rules)
}

/**
 * DER WEG ZURÜCK — `null`, wenn dort keine Liste steht.
 *
 * Der Inhalt der Zeilen wird NICHT geprüft: die Regeln sind der einzige Wert
 * dieses Kapitels, den ein Mensch von Hand nachbessern darf und soll (`l.rules`
 * ist `stage-edit`). Ein Rückweg, der auf den Katalog-Wortlaut bestünde, machte
 * jede Verbesserung zu einem Formfehler.
 */
export function parseBrandMotionRulesSlotValue(value: string): string[] | null {
  const view = brandSlotValueView('list', value)
  if (view.kind !== 'list' || view.items.length === 0) return null
  const items = view.items.map(item => item.trim()).filter(item => item.length > 0)
  return items.length > 0 ? items : null
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * HÄLT DER KATALOG SEINE ZUSAGEN? Nimmt beliebige Listen, damit der Beweis
 * mutierte Fassungen vorlegen kann — eine Prüfung, die nur die richtigen Listen
 * kennt, ist immer grün (dieselbe Regel wie `validateBrandTypeRules` in D4 und
 * `validateBrandImageryRules` in D6).
 */
export function validateBrandMotionRules(
  tempos: readonly BrandTempoOption[] = BRAND_TEMPO_OPTIONS,
  tokens: readonly { readonly id: string, readonly factor: number }[] = BRAND_MOTION_TOKENS,
  staggerMs: number = BRAND_MOTION_STAGGER_MS,
): readonly string[] {
  const problems: string[] = []

  const ids = new Set<string>()
  for (const tempo of tempos) {
    if (ids.has(tempo.id)) problems.push(`doppelte Tempo-Id: ${tempo.id}`)
    ids.add(tempo.id)
    if (!tempo.de.trim() || !tempo.en.trim()) problems.push(`${tempo.id}: Label unvollständig`)
    // 80…400 ms: darunter sieht niemand einen Übergang, darüber wartet man auf
    // die Oberfläche (die drei Werte des Katalogs sind 240/180/120).
    if (tempo.base < 80 || tempo.base > 400) {
      problems.push(`${tempo.id}: Grunddauer ausserhalb 80…400 ms (${tempo.base})`)
    }
    if (!/^cubic-bezier\(/.test(tempo.easing)) {
      problems.push(`${tempo.id}: Easing ist keine cubic-bezier-Kurve (${tempo.easing})`)
    }
    // JEDES Tempo braucht seinen eigenen Satz — sonst stünde in der Liste die
    // Kurven-Regel eines fremden Tempos.
    if (!RULE_BY_TEMPO[tempo.id]) problems.push(`Tempo ohne eigene Regel: ${tempo.id}`)
  }

  const tokenIds = new Set<string>()
  for (const token of tokens) {
    if (tokenIds.has(token.id)) problems.push(`doppeltes Token: ${token.id}`)
    tokenIds.add(token.id)
    if (token.factor <= 0 || token.factor > 3) {
      problems.push(`Faktor ausserhalb 0…3: ${token.id} = ${token.factor}`)
    }
    if (!BRAND_MOTION_TOKEN_USAGE[token.id]) problems.push(`Token ohne Zweck: ${token.id}`)
  }
  for (const required of ['fast', 'base', 'slow']) {
    if (!tokenIds.has(required)) problems.push(`Pflicht-Token fehlt: ${required}`)
  }
  if (!BRAND_MOTION_TOKEN_USAGE.stagger) problems.push('der Versatz hat keinen Zweck')
  if (staggerMs <= 0 || staggerMs > 200) {
    problems.push(`Versatz ausserhalb 0…200 ms (${staggerMs})`)
  }

  for (const option of BRAND_LOGO_MOTION_OPTIONS) {
    if (!RULE_BY_LOGO[option.id]) problems.push(`Zeichen-Option ohne Regel: ${option.id}`)
  }

  /**
   * DIE VORBELEGUNG MUSS FÜR JEDEN DNA-WERT EINEN GÜLTIGEN VORSCHLAG ERGEBEN.
   * Sonst fiele das Kapitel für eine Marke still auf den Katalog-Anfang zurück
   * und nennte ihn „Aus eurer DNA" — dieselbe Falle, die D3 an den Boards
   * gefunden hat.
   */
  for (const value of ['calmMotion', 'springy', 'precise', 'none', 'playfulMotion']) {
    const defaults = brandMotionDefaults({ motion: value })
    if (!ids.has(defaults.tempo)) {
      problems.push(`Bewegungs-Charakter "${value}" schlägt ein unbekanntes Tempo vor: ${defaults.tempo}`)
    }
    if (!isBrandLogoMotion(defaults.logo)) {
      problems.push(`Bewegungs-Charakter "${value}" schlägt eine unbekannte Zeichen-Antwort vor: ${defaults.logo}`)
    }
  }

  return problems
}
