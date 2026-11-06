/**
 * DER KI-DROSSEL-VERTRAG DES BRAND-WIZARDS (Plan §6 / §9b.5) — die Zahlen, die
 * Schlüssel und die Entscheidung, alles pur und ohne Vue, h3 oder Appwrite.
 *
 * ── WARUM DIESE DATEI EXISTIERT ───────────────────────────────────────────
 * Die Drossel ist ein LAUNCH-GATE: solange der einzige Generator der Dev-Stub
 * ist, kostet ein Lauf nichts — mit dem ersten echten Prompt kostet jeder Lauf
 * Geld beim Anbieter. Ein Deckel, der als abgeschriebene Zeichenkette in zwei
 * Routen lebt, ist beim ersten Umbenennen zwei verschiedene Deckel; deshalb
 * sind die Eimer-Schlüssel FUNKTIONEN und die Zahlen KONSTANTEN, genau wie bei
 * der UGC-Übersetzung (`core/shared/ugcTranslations.ts`).
 *
 * ── SECHS FRAGEN, SECHS ZÄHLER ────────────────────────────────────────────
 *  1. „Wie viele laufen JETZT?"    — Burst, je Konto, im Prozess (2).
 *  2. „Wie oft heute AN DIESER Stelle?" — je Brand × Slot-Typ (10).
 *  2b. „Wie viel wurde heute in diesem Branding GEREDET?" — je Brand (40).
 *  2c. „Wie oft hat der SPEZIALIST heute geprüft?" — je Brand (120, Paket 4).
 *  3. „Wie oft heute ÜBERHAUPT?"   — je Konto, über alle Brands (200).
 *  4. „Was kostet das die INSTANZ?" — Gesamtzahl über alle Konten (Default
 *     1000, konfigurierbar).
 * Sie beantworten verschiedene Fragen und dürfen sich deshalb nicht ersetzen:
 * (1) begrenzt das Tempo, (2) das Ausfransen an einer einzigen Frage, (2b) das
 * Ausfransen des GESPRÄCHS, (2c) die Prüf-Aufrufe, die der Mensch gar nicht
 * auslöst, (3) die Rechnung eines Menschen, (4) die Rechnung des Betreibers.
 *
 * Der Spezialist bekommt einen EIGENEN Eimer aus demselben Grund wie das
 * Gespräch: sein Aufruf ist keine Frage des Menschen an ein Feld, sondern eine
 * Folge seiner Bestätigung. Auf dem Gesprächs-Eimer gebucht, verlöre wer viel
 * bestätigt genau dadurch seine Antworten von George.
 *
 * ── WARUM DAS GESPRÄCH EINEN EIGENEN EIMER HAT (P3.2) ─────────────────────
 * Naheliegend wäre, eine Konversations-Reaktion auf den Slot-Eimer der Frage
 * zu buchen, die gerade beantwortet wurde. Das wäre aus drei Gründen falsch:
 *
 *  · ZWECK. Der Slot-Eimer begrenzt ANLÄUFE AN EINEM ENTWURF („zehn Versuche
 *    am Elevator-Pitch sind reichlich"). Eine Antwort im Gespräch ist kein
 *    Anlauf an einem Entwurf — sie ist das INTERVIEW, aus dem der Entwurf
 *    später überhaupt erst entsteht. Beides in einen Zähler zu legen hiesse:
 *    wer ausführlich antwortet, verliert genau dadurch die Entwürfe, für die
 *    er geantwortet hat.
 *  · REICHWEITE. Eine FREIE Frage („was meinst du mit Positionierung?") hat
 *    gar keinen Slot. Der Slot-Eimer hätte für die Hälfte der Fälle keinen
 *    Schlüssel und bräuchte ohnehin einen Rückfall.
 *  · AUSKUNFT. Zwei Kostenarten unter einem Zähler können nicht mehr sagen,
 *    WELCHE aufgebraucht ist — „für dieses Feld hat George genug Anläufe
 *    gemacht" wäre nach einem Gespräch schlicht gelogen.
 *
 * Der Eimer hängt am BRANDING (nicht am Konto): das Gespräch gehört zu EINEM
 * Branding, und wer zwei Marken baut, führt zwei Gespräche. Die Rechnung des
 * MENSCHEN begrenzt weiterhin der Konto-Deckel dahinter.
 *
 * ── DER KILL-SWITCH IST NICHT HIER ────────────────────────────────────────
 * `app_config.brandAiEnabled` (system-038) ist die LAUFZEIT-Klinke und wird in
 * der Route VOR jeder Buchung gelesen (`readBrandAiEnabled`). Ein Deckel von 0
 * wäre der falsche Aus-Schalter — er sähe aus wie ein Ausfall, statt zu sagen,
 * dass George gerade nicht entwirft. Deshalb kennt `resolveBrandAiInstanceCap`
 * keine 0.
 */

// ── Die Zahlen ─────────────────────────────────────────────────────────────

/**
 * Der Deckel des KONTOS, über alle Brands hinweg. Ohne `profileId` im
 * Schlüssel, und das ist der Punkt: wer drei Marken baut, hat trotzdem EINE
 * Rechnung (dieselbe Begründung wie bei `ugcTranslationDayKey`).
 */
export const BRAND_AI_ACCOUNT_DAILY_LIMIT = 200

/**
 * Der Deckel je Brand UND Slot-Typ (`slotId` IST der Typ). Er begrenzt das
 * Ausfransen: zehn Anläufe an einem Elevator-Pitch sind reichlich, der elfte
 * ist kein Entwurf mehr, sondern eine Suche nach dem Zufall.
 */
export const BRAND_AI_SLOT_DAILY_LIMIT = 10

/**
 * Der Deckel des GESPRÄCHS je Branding (P3.2): so viele Berater-Reaktionen auf
 * getippte Antworten und freie Fragen an EINEM Tag.
 *
 * 40 ist aus der Arbeit gerechnet, nicht geschätzt: die neun Bausteine haben
 * zusammen rund vierzig Menschenfragen. Ein voller Durchgang durch das ganze
 * Fundament passt also an einem Tag hinein — wer darüber hinaus in EINEM
 * Branding weiterredet, führt kein Interview mehr. Dahinter greifen unverändert
 * der Konto-Deckel (200) und der Instanz-Deckel.
 */
export const BRAND_AI_TALK_DAILY_LIMIT = 40

/**
 * DER DECKEL DES SPEZIALISTEN je Branding (BW2 Paket 4, Plan §13): so viele
 * Schliess-Aufrufe an EINEM Tag.
 *
 * 120 ist wie die 40 des Gesprächs aus der Arbeit gerechnet: ein vollständiges
 * Fundament hat 68 Sessions, also 68 Aufrufe für einen kompletten Durchlauf.
 * Dazu die neun Kapitel-Abnahmen (je 2) und Luft für Korrekturen, Stufe 2 (je
 * 3) und Wiederholungen — 120 trägt einen ganzen Durchlauf MIT Nacharbeit an
 * einem Tag. Wer darüber hinaus schliesst, wiederholt; und weil der
 * Schliess-Aufruf FAIL-SOFT ist (§7), kostet ihn das Erreichen des Deckels
 * nichts als fehlende Befunde — sein bestätigter Wert steht trotzdem.
 *
 * Der Eimer hängt am BRANDING, nicht am Konto: dieselbe Begründung wie beim
 * Gespräch (wer zwei Marken baut, schliesst zwei Mal 68 Sessions). Dahinter
 * greifen unverändert der Konto-Deckel (200) und der Instanz-Deckel.
 */
export const BRAND_AI_REVIEW_DAILY_LIMIT = 120

/**
 * DIE LESUNG DER VORBILDER je Branding (Brand Design D2b, §2.2 Leitplanke d):
 * DREI Läufe an einem Tag.
 *
 * ── WARUM SO WENIG ────────────────────────────────────────────────────────
 * Ein Lauf schickt bis zu ZWÖLF Bilder an ein multimodales Modell — er ist der
 * teuerste einzelne Aufruf dieses Layers, um eine Grössenordnung teurer als
 * ein Entwurf. Und er ist ein SELTENER Vorgang: der Kunde legt seine Vorbilder
 * ab und lässt sie lesen. Drei decken den Normalfall vollständig — einmal
 * lesen, einmal nach dem Nachlegen, einmal für einen Irrtum — und der vierte
 * Lauf am selben Tag wäre keine neue Erkenntnis, sondern dieselbe Frage.
 *
 * Der Eimer hängt am BRANDING (wie Gespräch und Spezialist): wer zwei Marken
 * baut, hat zwei Moodboards. Die Rechnung des Menschen deckelt weiterhin
 * `brandAiAccountDayKey` (200), die des Betreibers der Instanz-Deckel.
 *
 * §2.2 nennt daneben „12 Bilder je Lauf" — die Zahl steht schon in
 * `brandInspiration.ts` als harte Grenze der ABLAGE und wird hier bewusst
 * nicht wiederholt: mehr als zwölf Bilder kann eine Marke gar nicht haben.
 */
export const BRAND_DESIGN_READING_DAILY_LIMIT = 3

/**
 * WIE OFT EINE MARKE AM TAG KI-ENTWÜRFE DES ZEICHENS ERZEUGEN LÄSST (Brand
 * Design D5c, §2.5 Stufe 3 / §2.12: „Drossel 3 Läufe je Marke und Tag").
 *
 * ── WARUM SO WENIG ────────────────────────────────────────────────────────
 * EIN Lauf sind VIER Bild-Aufrufe an ein Bildmodell — der teuerste Klick
 * dieses Layers, teurer noch als die Vorbilder-Lesung. Und er ist ein Vorgang
 * mit natürlichem Ende: die Entwürfe sind Ideen für die Designer-Arbeit, kein
 * Automat, an dem man dreht, bis das Logo herausfällt. Drei decken den
 * Normalfall (einmal sehen, einmal nach einer Briefing-Korrektur, einmal für
 * einen Irrtum); der vierte Lauf am selben Tag wäre dieselbe Frage.
 *
 * Dieselbe Zahl wie beim Lesungs-Eimer, aber ein EIGENER Eimer: sie zählen
 * zwei verschiedene Rechnungen in zwei verschiedenen Kapiteln, und geteilt
 * nähme das Lesen der Vorbilder dem Zeichen seine Entwürfe.
 */
export const BRAND_DESIGN_DRAFTS_DAILY_LIMIT = 3

/**
 * WAS EIN AUFRUF IM REVIEW-EIMER KOSTET (Plan §13) — nicht jeder gleich viel.
 *
 * Stufe 1 ist der Normalfall und kostet 1. Stufe 2 läuft auf dem TEUREN
 * George-Modell und kostet 3; die Kapitel-Abnahme liest das ganze Dokument
 * gegen ein ganzes Kapitel und kostet 2. Die Gewichte sind grob und sollen es
 * sein: sie bilden die KOSTENVERHÄLTNISSE ab, nicht eine Rechnung — ein Eimer,
 * der Tokens zählte, wäre eine zweite Buchhaltung neben der des Anbieters.
 *
 * `document` (Paket 7, §13) ist der PRÜFBLICK: derselbe Kapitel-Modus, aber
 * über ALLE Kapitel gegen das ganze Dokument. 5 ist die teuerste Zahl in
 * dieser Tabelle, und sie ist verdient — der Aufruf trägt neun Kapitel im
 * Prompt. Er läuft ausschliesslich auf Klick (§16), also bezahlt ihn nie
 * jemand, der ihn nicht bestellt hat.
 */
export const BRAND_AI_REVIEW_WEIGHTS = {
  stage1: 1,
  stage2: 3,
  chapter: 2,
  document: 5,
} as const

export type BrandAiReviewWeight = keyof typeof BRAND_AI_REVIEW_WEIGHTS

/**
 * Höchstens zwei GLEICHZEITIGE Läufe je Konto. Gezählt wird im Prozess — mit
 * derselben bewussten Grenze wie die Generierungs-Sperre in
 * `server/utils/brandGenerators.ts`: bei mehreren Node-Prozessen (pm2-Cluster)
 * zählt jeder für sich, aus 2 würden 2×Worker. Der Schaden bliebe klein (die
 * drei TAGES-Deckel liegen im geteilten Rate-Limit-Store und greifen weiter),
 * und ein prozessübergreifender Burst-Zähler ist der nächste Schritt, sobald
 * `branding` je im Cluster läuft.
 */
export const BRAND_AI_PARALLEL_LIMIT = 2

/**
 * DAS KOSTEN-NETZ DES BETREIBERS: höchstens so viele echte Generierungen je
 * Tag über ALLE Konten. 1000 ist bewusst konservativ gewählt — bei 200 je
 * Konto sind das fünf Konten, die ihr Tageskontingent voll ausschöpfen, und in
 * der Beta-Phase des Wizards gibt es keine fünf solchen Konten. Der Deckel ist
 * kein Produktversprechen, sondern die Reissleine gegen die Rechnung, die
 * niemand kommen sah (ein Skript mit fünfzig Einladungscodes, ein Fehler in
 * einem künftigen Auto-Retry). Er gehört ANGEHOBEN, wenn er echte Nutzung
 * abschneidet — dafür ist er konfigurierbar (`pukalani.brand.aiDailyInstanceCap`).
 */
export const BRAND_AI_INSTANCE_DAILY_DEFAULT = 1000

/**
 * Das Fenster aller drei Tages-Deckel: rollierende 24 Stunden, kein
 * Kalendertag — sonst wäre um Mitternacht schlagartig wieder alles offen.
 */
export const BRAND_AI_DAY_WINDOW_MS = 24 * 60 * 60_000

export interface BrandAiLimits {
  parallel: number
  slotDay: number
  talkDay: number
  reviewDay: number
  readingDay: number
  draftsDay: number
  accountDay: number
  instanceDay: number
}

export const BRAND_AI_LIMITS: BrandAiLimits = {
  parallel: BRAND_AI_PARALLEL_LIMIT,
  slotDay: BRAND_AI_SLOT_DAILY_LIMIT,
  talkDay: BRAND_AI_TALK_DAILY_LIMIT,
  reviewDay: BRAND_AI_REVIEW_DAILY_LIMIT,
  readingDay: BRAND_DESIGN_READING_DAILY_LIMIT,
  draftsDay: BRAND_DESIGN_DRAFTS_DAILY_LIMIT,
  accountDay: BRAND_AI_ACCOUNT_DAILY_LIMIT,
  instanceDay: BRAND_AI_INSTANCE_DAILY_DEFAULT,
}

/**
 * Der Instanz-Deckel aus der App-Konfiguration — oder der Default. Nur eine
 * endliche GANZE Zahl grösser als 0 zählt: ein `0`, ein `-5` oder ein
 * versehentliches `"1000"` würden sonst die KI abschalten, ohne dass irgendwo
 * „aus" stünde. Abschalten geht über `app_config.brandAiEnabled`, und nur dort
 * sagt die Oberfläche auch den richtigen Satz dazu.
 */
export function resolveBrandAiInstanceCap(configured: unknown): number {
  return typeof configured === 'number' && Number.isInteger(configured) && configured > 0
    ? configured
    : BRAND_AI_INSTANCE_DAILY_DEFAULT
}

// ── Die Eimer-Schlüssel ────────────────────────────────────────────────────

/** Alle Generierungen EINES Kontos, über alle Brands und alle Slots. */
export function brandAiAccountDayKey(userId: string): string {
  return `brand-ai-day:${userId}`
}

/**
 * Ein Brand, ein Slot-TYP. `slotId` ist der Typ (`a.pitch`, `b.purpose`) — es
 * gibt je Brand höchstens einen davon, deshalb braucht es hier keinen dritten
 * Bestandteil.
 */
export function brandAiSlotDayKey(profileId: string, slotId: string): string {
  return `brand-ai-slot-day:${profileId}:${slotId}`
}

/**
 * DAS GESPRÄCH EINES BRANDINGS (P3.2) — ohne Slot und ohne Konto im Schlüssel.
 * Ohne Slot, weil eine freie Frage keinen hat; ohne Konto, weil zwei Marken
 * zwei Gespräche sind (die Rechnung des Menschen deckelt `brandAiAccountDayKey`).
 */
export function brandAiTalkDayKey(profileId: string): string {
  return `brand-ai-talk-day:${profileId}`
}

/**
 * DER SPEZIALIST EINES BRANDINGS (Paket 4) — ohne Slot und ohne Konto, aus
 * denselben zwei Gründen wie beim Gespräch.
 *
 * Ohne SLOT, obwohl jeder Schliess-Aufruf zu genau einer Session gehört: der
 * Kapitel-Modus gehört keiner, und ein Deckel „zehn Reviews je Feld" hätte
 * nichts zu begrenzen — ein Feld wird einmal geschlossen, nicht zehnmal
 * entworfen.
 */
export function brandAiReviewDayKey(profileId: string): string {
  return `brand-ai-review-day:${profileId}`
}

/**
 * EIN Eimer für die ganze Instanz — ohne Konto, ohne Brand. Er liegt im
 * geteilten Rate-Limit-Store und ist damit auch über mehrere Prozesse hinweg
 * EIN Deckel (mit Redis; ohne Redis zählt jede Instanz für sich, wie überall).
 */
/**
 * DIE VORBILDER-LESUNG EINES BRANDINGS (D2b) — ohne Slot und ohne Konto, aus
 * denselben zwei Gründen wie beim Gespräch und beim Spezialisten.
 *
 * Ohne SLOT, obwohl der Lauf genau eine Session bedient (`g.reading`): der
 * Slot-Eimer zählt ANLÄUFE AN EINER FRAGE (10/Tag) und wäre hier drei Mal zu
 * gross. Ein eigener Eimer sagt ausserdem im Log die Wahrheit — „zu oft
 * entworfen" an einer Stelle, an der niemand entworfen hat, wäre die falsche
 * Auskunft an den Betreiber.
 */
export function brandDesignReadingDayKey(profileId: string): string {
  return `brand-reading-day:${profileId}`
}

/**
 * DIE KI-ENTWÜRFE EINES BRANDINGS (D5c) — ohne Slot und ohne Konto, aus
 * denselben Gründen wie die Lesung eine Funktion weiter oben.
 *
 * Ohne SLOT, obwohl der Lauf genau eine Session bedient (`j.drafts`): der
 * Slot-Eimer zählt ANLÄUFE AN EINER FRAGE (10/Tag) und wäre hier mehr als
 * dreimal zu gross — für den teuersten Lauf des Layers.
 */
export function brandDesignDraftsDayKey(profileId: string): string {
  return `brand-drafts-day:${profileId}`
}

export function brandAiInstanceDayKey(): string {
  return 'brand-ai-instance-day'
}

// ── Die Ablehnungsgründe ───────────────────────────────────────────────────

/**
 * Sie reisen als `data.code` in der 429 und werden vom zentralen Fehler-Handler
 * (`core/server/error.ts`) als `reason` ins Envelope gehoben. FÜNF Codes statt
 * eines, weil sie dem Menschen VERSCHIEDENE Dinge sagen: „gleich wieder" (busy)
 * ist etwas anderes als „morgen wieder" (Tag), als „nicht an dir" (Instanz) und
 * als „für dieses Feld genug Anläufe" gegenüber „für heute genug geredet".
 */
export const BRAND_AI_BUSY_CODE = 'brand_ai_busy'
export const BRAND_AI_SLOT_LIMIT_CODE = 'brand_ai_slot_limit'
export const BRAND_AI_TALK_LIMIT_CODE = 'brand_ai_talk_limit'
/**
 * Der Deckel des Schliess-Aufrufs (Paket 4). Er hat einen EIGENEN Code, obwohl
 * ihn heute niemand als 429 zu sehen bekommt: der Schliess-Aufruf ist fail-soft
 * und macht aus jeder Ablehnung ein `reviewed: false`. Der Code steht trotzdem
 * hier, weil er im LOG erscheint — und „brand_ai_talk_limit" an einer Stelle,
 * an der niemand geredet hat, wäre die falsche Auskunft an den Betreiber.
 */
export const BRAND_AI_REVIEW_LIMIT_CODE = 'brand_ai_review_limit'
/**
 * Der Deckel der Vorbilder-Lesung (D2b). Er erreicht die Oberfläche WIRKLICH:
 * anders als beim Spezialisten ist der Lauf kein fail-softes Nebenher, sondern
 * das, was der Mensch gerade angeklickt hat — er bekommt eine 429 mit Grund
 * und die Zeile „heute keine Läufe mehr".
 */
export const BRAND_DESIGN_READING_LIMIT_CODE = 'brand_reading_limit'
/**
 * Der Deckel der KI-Entwürfe (D5c). Er erreicht die Oberfläche WIRKLICH — wie
 * der Lesungs-Deckel und aus demselben Grund: der Lauf ist das, was der Mensch
 * gerade angeklickt hat.
 */
export const BRAND_DESIGN_DRAFTS_LIMIT_CODE = 'brand_drafts_limit'
export const BRAND_AI_DAILY_LIMIT_CODE = 'brand_ai_daily_limit'
export const BRAND_AI_INSTANCE_LIMIT_CODE = 'brand_ai_instance_limit'

export type BrandAiRejectionCode =
  | typeof BRAND_AI_BUSY_CODE
  | typeof BRAND_AI_SLOT_LIMIT_CODE
  | typeof BRAND_AI_TALK_LIMIT_CODE
  | typeof BRAND_AI_REVIEW_LIMIT_CODE
  | typeof BRAND_DESIGN_READING_LIMIT_CODE
  | typeof BRAND_DESIGN_DRAFTS_LIMIT_CODE
  | typeof BRAND_AI_DAILY_LIMIT_CODE
  | typeof BRAND_AI_INSTANCE_LIMIT_CODE

const REJECTION_CODES: readonly string[] = [
  BRAND_AI_BUSY_CODE,
  BRAND_AI_SLOT_LIMIT_CODE,
  BRAND_AI_TALK_LIMIT_CODE,
  BRAND_AI_REVIEW_LIMIT_CODE,
  BRAND_DESIGN_READING_LIMIT_CODE,
  BRAND_DESIGN_DRAFTS_LIMIT_CODE,
  BRAND_AI_DAILY_LIMIT_CODE,
  BRAND_AI_INSTANCE_LIMIT_CODE,
]

/** Kam da ein Grund zurück, den wir kennen? (Der Client liest fremde Antworten.) */
export function isBrandAiRejectionCode(value: unknown): value is BrandAiRejectionCode {
  return typeof value === 'string' && REJECTION_CODES.includes(value)
}

/**
 * WELCHER HINWEIS ERSCHEINT — Abbildung Code → i18n-Schlüssel, pur und hier,
 * damit sie ohne Vue prüfbar ist (dasselbe Muster wie
 * `ugcTranslationErrorKey`). `null` heisst „kein Drossel-Grund" — die Seite
 * fällt dann auf ihren bisherigen Text zurück.
 */
export function brandAiRejectionMessageKey(value: unknown): string | null {
  if (!isBrandAiRejectionCode(value)) return null
  if (value === BRAND_AI_BUSY_CODE) return 'brand.workspace.generate.parallelLimit'
  if (value === BRAND_AI_SLOT_LIMIT_CODE) return 'brand.workspace.generate.slotLimit'
  // Der Gesprächs-Deckel liegt im `generate.*`-Knoten, obwohl er das Gespräch
  // betrifft: das ist der EINE Ort für Drossel-Hinweise, und ein zweiter
  // Knoten hiesse, dass diese Abbildung künftig zwei Präfixe kennen muss.
  if (value === BRAND_AI_TALK_LIMIT_CODE) return 'brand.workspace.generate.talkLimit'
  // Er erreicht die Oberfläche heute nicht (fail-soft, s. o.); die Abbildung
  // bleibt trotzdem vollständig — eine Lücke hier wäre ein Nein ohne Satz,
  // sobald irgendwann eine Route den Code doch weiterreicht.
  if (value === BRAND_AI_REVIEW_LIMIT_CODE) return 'brand.workspace.generate.reviewLimit'
  if (value === BRAND_DESIGN_READING_LIMIT_CODE) return 'brand.workspace.generate.readingLimit'
  if (value === BRAND_DESIGN_DRAFTS_LIMIT_CODE) return 'brand.workspace.generate.draftsLimit'
  if (value === BRAND_AI_DAILY_LIMIT_CODE) return 'brand.workspace.generate.dailyLimit'
  return 'brand.workspace.generate.instanceLimit'
}

// ── Die Entscheidung ───────────────────────────────────────────────────────

export interface BrandAiQuotaCounts {
  /** Laufende Generierungen dieses Kontos, EINSCHLIESSLICH der neuen. */
  parallel: number
  /** Zählerstand des Slot-Eimers nach dieser Buchung. */
  slotDay: number
  /**
   * Zählerstand des Gesprächs-Eimers nach dieser Buchung (P3.2).
   *
   * In EINEM Aufruf ist immer nur einer der beiden engen Zähler belegt — ein
   * Entwurf bucht `slotDay`, ein Gesprächszug `talkDay`, der jeweils andere
   * bleibt 0 und kann deshalb nie ein Nein erzeugen.
   */
  talkDay: number
  /**
   * Zählerstand des Spezialisten-Eimers nach dieser Buchung (Paket 4).
   *
   * Er ist der DRITTE enge Zähler, und wie die zwei anderen ist in EINEM
   * Aufruf immer nur einer belegt: ein Entwurf bucht `slotDay`, ein
   * Gesprächszug `talkDay`, ein Schliess-Aufruf `reviewDay`.
   */
  reviewDay: number
  /**
   * Zählerstand des Lesungs-Eimers nach dieser Buchung (Brand Design D2b).
   *
   * Der VIERTE enge Zähler, und wie die drei anderen ist in EINEM Aufruf immer
   * nur einer belegt.
   */
  readingDay: number
  /**
   * Zählerstand des Entwurfs-Eimers nach dieser Buchung (Brand Design D5c).
   *
   * Der FÜNFTE enge Zähler, und wie die vier anderen ist in EINEM Aufruf immer
   * nur einer belegt.
   */
  draftsDay: number
  /** Zählerstand des Konto-Eimers nach dieser Buchung. */
  accountDay: number
  /** Zählerstand des Instanz-Eimers nach dieser Buchung. */
  instanceDay: number
}

/**
 * DER ERSTE VERLETZTE DECKEL — oder `null`, wenn der Lauf laufen darf.
 *
 * ── DIE REIHENFOLGE IST DIE AUSSAGE: ENG VOR WEIT ─────────────────────────
 * Burst → Slot bzw. Gespräch → Konto → Instanz. Der Aufrufer BUCHT in genau dieser Folge und
 * hört beim ersten Nein auf, denn ein `hit` zählt IMMER: stünde der Konto-Eimer
 * vor dem Slot-Eimer, fräse jeder am Slot-Deckel abgewiesene Versuch ein
 * Tageskontingent — wer an einer Frage hängen bleibt, verlöre seinen Tag
 * (dieselbe Sorgfalt wie in `posts/.../translate.post.ts`). Und der Instanz-
 * Deckel steht zuletzt, weil kein Einzelner an seinem eigenen Limit die
 * Rechnung des Betreibers belasten soll.
 *
 * NOCH NICHT GEMESSENE Zähler übergibt der Aufrufer als `0`. Das ist keine
 * Krücke, sondern der Normalfall eines leeren Eimers — und weil jedes Limit
 * mindestens 1 ist, kann eine 0 nie ein Nein erzeugen.
 *
 * `>` statt `>=`, weil `store.hit()` den Zähler EINSCHLIESSLICH dieses Laufs
 * zurückgibt: der 200. Lauf des Tages ist erlaubt, der 201. nicht.
 */
export function decideBrandAiQuota(
  counts: BrandAiQuotaCounts,
  limits: BrandAiLimits = BRAND_AI_LIMITS,
): BrandAiRejectionCode | null {
  if (counts.parallel > limits.parallel) return BRAND_AI_BUSY_CODE
  if (counts.slotDay > limits.slotDay) return BRAND_AI_SLOT_LIMIT_CODE
  if (counts.talkDay > limits.talkDay) return BRAND_AI_TALK_LIMIT_CODE
  if (counts.reviewDay > limits.reviewDay) return BRAND_AI_REVIEW_LIMIT_CODE
  if (counts.readingDay > limits.readingDay) return BRAND_DESIGN_READING_LIMIT_CODE
  if (counts.draftsDay > limits.draftsDay) return BRAND_DESIGN_DRAFTS_LIMIT_CODE
  if (counts.accountDay > limits.accountDay) return BRAND_AI_DAILY_LIMIT_CODE
  if (counts.instanceDay > limits.instanceDay) return BRAND_AI_INSTANCE_LIMIT_CODE
  return null
}

// ── Der Brand-Check: eine EIGENE Art (`check`) ─────────────────────────────

/**
 * WARUM DER CHECK NICHT IN `decideBrandAiQuota` PASST.
 *
 * Alle Deckel oben kennen einen MENSCHEN (`userId`) und meistens ein BRANDING
 * (`profileId`). Der Brand-Check kennt im Normalfall beides nicht: er ist die
 * öffentliche Route ohne Konto (Davids Hybrid-Zugang, 2026-09-05, Plan §5).
 * Was ihn begrenzt, sind andere Fragen — „wie oft von DIESEM Anschluss?" und
 * „was kostet das die INSTANZ?" —, und die Antwort auf die erste ist ein
 * gehashter IP-Stempel, kein Konto.
 *
 * SEIT DEM RANKING-PAKET GIBT ES EINEN DRITTEN ZÄHLER, und er ist die
 * Ausnahme, die die Regel schärft: „neu ermitteln" (`force`) gibt es NUR mit
 * Konto, weil nur dort ein Deckel greifen kann, den man nicht mit einem
 * Router-Neustart abwirft — `BRAND_CHECK_ACCOUNT_DAILY_LIMIT`. Er bucht statt
 * des Anschluss-Eimers, nie zusätzlich.
 *
 * Die Werte trotzdem in DIESER Datei, nicht in einer eigenen: es ist derselbe
 * Vertrag („was ein KI-Aufruf kosten darf"), es ist derselbe Rate-Limit-Store,
 * und ein zweiter Ort für Deckel wäre ein zweiter Ort zum Vergessen.
 *
 * DIE CODES SIND BEWUSST NICHT TEIL VON `BrandAiRejectionCode`: dessen
 * Abbildung (`brandAiRejectionMessageKey`) zeigt in den `brand.workspace.*`-
 * Baum, und das ist die Werkstatt — der Check hat seine eigene Oberfläche und
 * seine eigenen Texte (`brand.check.*`).
 */

/**
 * DREI CHECKS JE ANSCHLUSS UND TAG (Plan §5). Ein Mensch prüft seine eigene
 * Seite, vielleicht die eines Kunden, vielleicht die eines Wettbewerbers —
 * drei. Wer mehr braucht, hat kein Erlebnis, sondern ein Werkzeug gefunden,
 * und dieses Werkzeug bezahlen wir.
 */
export const BRAND_CHECK_IP_DAILY_LIMIT = 3

/**
 * ZWEIHUNDERT CHECKS JE TAG ÜBER ALLE ANSCHLÜSSE. Das ist die Reissleine gegen
 * die Rechnung, die niemand kommen sah — dieselbe Rolle wie
 * `BRAND_AI_INSTANCE_DAILY_DEFAULT`, nur mit einer eigenen Zahl, weil ein
 * Check und ein Entwurf verschieden teuer sind und der Check von JEDEM
 * ausgelöst werden kann.
 *
 * Eigener Eimer (`brand-check-instance-day`) und NICHT der des Wizards: sonst
 * nähme eine Werbe-Welle auf der Startseite den zahlenden Kunden ihre
 * Entwürfe weg.
 */
export const BRAND_CHECK_INSTANCE_DAILY_DEFAULT = 200

/**
 * ZEHN CHECKS JE KONTO UND TAG — der Deckel des „neu ermitteln" (Davids
 * Entscheidung 4 vom 2026-09-05, docs/archiv/BRAND-CHECK-SEITE.md §8.4).
 *
 * ── ER GILT NUR MIT `force` ───────────────────────────────────────────────
 * Ein eingeloggter Mensch, der einfach eine Adresse eintippt, zählt weiter
 * gegen den ANSCHLUSS-Deckel (3/Tag). Das ist kein Versehen: der Konto-Deckel
 * ist der Preis dafür, den Sieben-Tage-Zwischenspeicher zu UMGEHEN — also für
 * genau die Handlung, die einen KI-Aufruf erzwingt, den es sonst nicht gäbe.
 * Andersherum („eingeloggt ⇒ immer Konto-Deckel") wäre die Anmeldung ein
 * Gutschein auf das Dreifache für dieselbe Arbeit, und der Gast-Deckel wäre
 * mit einem Klick auf „Registrieren" ausgehebelt.
 *
 * 10 ist aus der Arbeit gerechnet: eigene Marke plus Vorher/Nachher eines
 * Relaunch plus ein paar Kundenmarken an einem Tag. Wer darüber hinaus neu
 * ermittelt, misst dieselbe Seite und nicht mehr eine andere — und der
 * 7-Tage-Wert steht ihm dabei unverändert kostenlos zur Verfügung.
 */
export const BRAND_CHECK_ACCOUNT_DAILY_LIMIT = 10

/** Alle Checks EINES Anschlusses. Der Schlüssel trägt den HASH, nie die IP. */
export function brandCheckIpDayKey(ipHash: string): string {
  return `brand-check-ip-day:${ipHash}`
}

/**
 * Alle ERZWUNGENEN Checks EINES Kontos, über alle Adressen hinweg (s. o.).
 * Ohne Adresse im Schlüssel: wer drei Marken betreut, hat trotzdem EINE
 * Rechnung (dieselbe Begründung wie bei `brandAiAccountDayKey`).
 */
export function brandCheckAccountDayKey(userId: string): string {
  return `brand-check-account-day:${userId}`
}

/** EIN Eimer für die ganze Instanz — ohne Anschluss, ohne Konto. */
export function brandCheckInstanceDayKey(): string {
  return 'brand-check-instance-day'
}

export const BRAND_CHECK_IP_LIMIT_CODE = 'brand_check_ip_limit'
export const BRAND_CHECK_ACCOUNT_LIMIT_CODE = 'brand_check_account_limit'
export const BRAND_CHECK_INSTANCE_LIMIT_CODE = 'brand_check_instance_limit'

export type BrandCheckRejectionCode =
  | typeof BRAND_CHECK_IP_LIMIT_CODE
  | typeof BRAND_CHECK_ACCOUNT_LIMIT_CODE
  | typeof BRAND_CHECK_INSTANCE_LIMIT_CODE

export interface BrandCheckQuotaCounts {
  /** Zählerstand des Anschluss-Eimers nach dieser Buchung. */
  ipDay: number
  /**
   * Zählerstand des Konto-Eimers nach dieser Buchung. In EINEM Aufruf ist
   * immer nur EINER der beiden engen Zähler belegt (s. `decideBrandCheckMode`);
   * der andere bleibt 0 und kann deshalb nie ein Nein erzeugen.
   */
  accountDay: number
  /** Zählerstand des Instanz-Eimers nach dieser Buchung. */
  instanceDay: number
}

export interface BrandCheckLimits {
  ipDay: number
  accountDay: number
  instanceDay: number
}

export const BRAND_CHECK_LIMITS: BrandCheckLimits = {
  ipDay: BRAND_CHECK_IP_DAILY_LIMIT,
  accountDay: BRAND_CHECK_ACCOUNT_DAILY_LIMIT,
  instanceDay: BRAND_CHECK_INSTANCE_DAILY_DEFAULT,
}

/**
 * ENG VOR WEIT, wie oben: erst der Anschluss bzw. das Konto, dann die Instanz.
 * Wer sein eigenes Kontingent aufgebraucht hat, soll die Rechnung des
 * Betreibers nicht zusätzlich belasten — der Aufrufer bucht in dieser
 * Reihenfolge und hört beim ersten Nein auf.
 *
 * `>` statt `>=`, weil `store.hit()` den Zähler EINSCHLIESSLICH dieses Laufs
 * liefert: der dritte Check des Tages ist erlaubt, der vierte nicht.
 */
export function decideBrandCheckQuota(
  counts: BrandCheckQuotaCounts,
  limits: BrandCheckLimits = BRAND_CHECK_LIMITS,
): BrandCheckRejectionCode | null {
  if (counts.ipDay > limits.ipDay) return BRAND_CHECK_IP_LIMIT_CODE
  if (counts.accountDay > limits.accountDay) return BRAND_CHECK_ACCOUNT_LIMIT_CODE
  if (counts.instanceDay > limits.instanceDay) return BRAND_CHECK_INSTANCE_LIMIT_CODE
  return null
}

/**
 * DIE EINE WEICHE DES CHECKS: darf der Zwischenspeicher übergangen werden, und
 * WELCHER enge Eimer zahlt dafür?
 *
 * Pur und an EINER Stelle, weil sie zwei Dinge gleichzeitig entscheidet, die
 * sonst auseinanderlaufen: „umgehen" ohne „Konto-Eimer" wäre ein kostenloser
 * Weg an jedem Deckel vorbei, „Konto-Eimer" ohne „umgehen" wäre eine Buchung
 * für einen Aufruf, den es nicht gab.
 *
 * ── EIN GAST MIT `force` IST KEIN FEHLER ──────────────────────────────────
 * Er bekommt schlicht den gewöhnlichen Check (Zwischenspeicher gilt,
 * IP-Deckel). Ein 401 wäre die falsche Auskunft: er hat nichts Verbotenes
 * versucht, sondern einen Knopf gedrückt, den es für ihn nicht gibt — und die
 * Antwortform (`cached: true`) sagt ihm genau das.
 *
 * ── DER DRITTE EINGANG: `quota` (BC1) ─────────────────────────────────────
 * Bis hierher waren „Zwischenspeicher umgehen" und „das Konto zahlt" EIN
 * Ereignis: nur `force` konnte den Konto-Eimer wählen. Der Marktvergleich
 * braucht die andere Hälfte — er stösst fehlende Checks fremder Adressen an
 * und will sie AUS DEM KONTINGENT DES MENSCHEN bezahlen, der den Lauf
 * ausgelöst hat, aber er will den Zwischenspeicher ausdrücklich GELTEN lassen
 * (ein Lauf, der jede fremde Startseite neu prüfte, wäre der teuerste Knopf
 * des Produkts). Deshalb ein eigener Eingang statt eines zweiten `force`:
 * `quota: 'account'` sagt „das Konto zahlt", `force` sagt „neu ermitteln", und
 * die zwei sind seitdem unabhängig kombinierbar.
 *
 * OHNE Konto fällt `'account'` auf `'auto'` zurück. Das ist keine Nachsicht,
 * sondern die einzige mögliche Antwort: `brandCheckAccountDayKey('')` wäre ein
 * Eimer, den sich alle Gäste der Welt teilen — also entweder ein Deckel für
 * niemanden oder eine Sperre für alle.
 */
export interface BrandCheckMode {
  /** Den 7-Tage-Zwischenspeicher überspringen (nur mit Konto UND `force`). */
  bypassCache: boolean
  /** Welcher enge Eimer bucht: der Anschluss oder das Konto. Nie beide. */
  quota: 'ip' | 'account'
}

/**
 * `'auto'` = die Weiche entscheidet allein aus `force` (Verhalten der
 * öffentlichen Route). `'account'` = der Aufrufer WILL den Konto-Eimer.
 */
export type BrandCheckQuotaChoice = 'auto' | 'account'

export function decideBrandCheckMode(input: {
  userId: string
  force: boolean
  quota?: BrandCheckQuotaChoice
}): BrandCheckMode {
  const forced = input.force && !!input.userId
  const chosen = input.quota === 'account' && !!input.userId
  return { bypassCache: forced, quota: forced || chosen ? 'account' : 'ip' }
}
