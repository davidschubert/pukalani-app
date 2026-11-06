/**
 * DIE REGELN DER VERÖFFENTLICHUNG (docs/plans/DISCOVER-BRANDS.md §3, §4.3, §5,
 * Davids Entscheidung §9.1 „Freigabe VOR Veröffentlichung") — pur, ohne h3,
 * ohne Appwrite, ohne Vue.
 *
 * Drei Fragen leben hier, und nur hier:
 *  1. WIE HEISST DIE ADRESSE? (`brandPublicationSlug`)
 *  2. DARF ÜBERHAUPT EINGEREICHT WERDEN? (`brandPublicationCanSubmit`)
 *  3. WELCHER ZUSTAND FOLGT AUF WELCHE HANDLUNG? (`decideBrandPublication`)
 *
 * Die Routen setzen sie durch, die Leseansicht kennt sie (Knöpfe zeigen statt
 * verstecken), die Tests nageln sie fest — dieselbe Arbeitsteilung wie bei
 * `shared/brandCheckCorrections.ts` und `shared/brandWaitlistAdmin.ts`.
 *
 * ── WARUM DIE ZUSTANDSREGEL SCHON DIE BETREIBER-HANDLUNGEN KENNT ──────────
 * Freigeben, Ablehnen und Ausblenden gehören dem Paket D3 und haben hier noch
 * keine Route. Die REGEL steht trotzdem vollständig da: eine Zustandsmaschine,
 * die nur die halben Übergänge kennt, ist keine — sie wäre eine Liste von
 * Sonderfällen, und die zweite Hälfte würde später an einer anderen Stelle
 * entschieden. Der Preis ist eine ungenutzte Handlung, der Gewinn ist, dass
 * „was darf jetzt passieren?" genau einmal beantwortet wird.
 */

/**
 * DIE FÜNF ZUSTÄNDE EINER VERÖFFENTLICHUNG (§3.4).
 *
 *   pending   — eingereicht, wartet auf die Freigabe des Betreibers.
 *   published — freigegeben, öffentlich und indexierbar.
 *   declined  — abgelehnt, mit Begründung (der Kunde sieht sie).
 *   hidden    — vom Betreiber nachträglich ausgeblendet.
 *   withdrawn — vom Kunden zurückgezogen.
 */
export const BRAND_PUBLICATION_STATUSES = [
  'pending',
  'published',
  'declined',
  'hidden',
  'withdrawn',
] as const

export type BrandPublicationStatus = typeof BRAND_PUBLICATION_STATUSES[number]

/**
 * Der Zustand, wie ihn die OBERFLÄCHE kennt — die fünf plus „noch nie
 * eingereicht".
 *
 * `'none'` ist bewusst ein Wert und kein `null`: die Leseansicht und die Karte
 * stellen genau EINE Frage („in welchem Zustand ist diese Marke?"), und ein
 * `null` daneben zwänge jeden Leser zu zweien. Ein SPALTEN-Wert ist `'none'`
 * nie — die Zeile entsteht erst mit dem Einreichen.
 */
export type BrandPublicationViewStatus = BrandPublicationStatus | 'none'

/**
 * Der gelesene Spaltenwert — FAIL-CLOSED auf `pending`.
 *
 * Ein unbekannter Wert ist ein Datenfehler, und die einzige Antwort darauf,
 * die nichts kaputt macht, ist „das schaut sich der Betreiber an". `published`
 * darf NIE aus einem Rateschritt entstehen: das wäre eine Veröffentlichung,
 * die niemand freigegeben hat (dieselbe Haltung wie bei `marketVisibility`,
 * nur mit dem anderen sicheren Ende).
 */
export function normalizeBrandPublicationStatus(value: string | null | undefined): BrandPublicationStatus {
  const trimmed = (value ?? '').trim()
  return (BRAND_PUBLICATION_STATUSES as readonly string[]).includes(trimmed)
    ? trimmed as BrandPublicationStatus
    : 'pending'
}

/** Öffentlich sichtbar ist genau EIN Zustand — die Galerie (D2) fragt so. */
export function brandPublicationIsPublic(status: BrandPublicationViewStatus): boolean {
  return status === 'published'
}

// ── 1 · Die Adresse ─────────────────────────────────────────────────────────

/**
 * Der Adress-Deckel. 80 Zeichen tragen jeden echten Markennamen; alles darüber
 * ist keine Adresse mehr, sondern ein Satz.
 */
export const BRAND_PUBLICATION_SLUG_MAX = 80

/** Der Pfad-Präfix der Anatomie-Seite (§9 Nr. 2). EINE Stelle, drei Leser. */
export const BRAND_PUBLICATION_PATH_PREFIX = '/discover/'

/**
 * Umlaute und ß werden AUSGESCHRIEBEN, nicht abgeschnitten: „Grünmühle" wird
 * `gruenmuehle` und nicht `grnmhle`. Sie stehen vor der Diakritika-Entfernung,
 * weil `NFD` aus `ü` sonst ein nacktes `u` machte — und „Müller" heisst im
 * Deutschen nicht „Muller".
 */
const UMLAUTS: Readonly<Record<string, string>> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss',
}

/**
 * DIE ADRESSE AUS DEM TITEL — klein, ASCII, mit Bindestrichen.
 *
 * ── DER RÜCKFALL BRAUCHT DIE PROFIL-ID ────────────────────────────────────
 * Ein Titel aus lauter Zeichen, die hier wegfallen (Emoji, chinesische
 * Schrift, „···"), ergäbe eine LEERE Adresse — und eine leere Adresse wäre
 * `/discover/`, also die Galerie selbst. Deshalb `brand-<6 Zeichen der Id>`:
 * eindeutig, kurz, und es sagt ehrlich, dass hier kein Name stand.
 *
 * ── ES WIRD NICHT AUF WORTGRENZEN GEKÜRZT ─────────────────────────────────
 * Ein hart abgeschnittenes Wort ist hässlich, ein an der Wortgrenze
 * abgeschnittener Name ist FALSCH („Nordsee Fischräucherei" → `nordsee`).
 * Gekürzt wird auf 80 Zeichen, danach fallen Rand-Bindestriche weg.
 */
export function brandPublicationSlug(title: string, profileId = ''): string {
  const mapped = [...(title ?? '')].map(char => UMLAUTS[char] ?? char).join('')
  const ascii = mapped
    .normalize('NFD')
    // Diakritika (é → e); die Klasse ist bewusst ein Bereich und keine Liste.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const slug = trimHyphens(ascii.replace(/[^a-z0-9]+/g, '-')).slice(0, BRAND_PUBLICATION_SLUG_MAX)
  const cleaned = trimHyphens(slug)
  if (cleaned) return cleaned

  const suffix = trimHyphens((profileId ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 6)
  return suffix ? `brand-${suffix}` : 'brand'
}

function trimHyphens(value: string): string {
  return value.replace(/-{2,}/g, '-').replace(/^-+/, '').replace(/-+$/, '')
}

/**
 * DIE KANDIDATEN BEI EINER KOLLISION: `name`, `name-2`, `name-3`, …
 *
 * Der Zähler beginnt bei 1 = der blanke Name (es gibt kein `name-1`; die erste
 * Marke dieses Namens ist nicht „die erste von mehreren", sie ist die einzige).
 * Der Deckel bleibt: bei einem Namen, der die 80 schon ausschöpft, weicht das
 * ENDE dem Suffix — sonst wären zwei Kandidaten nach dem Abschneiden derselbe
 * Text und die „Kollisionsauflösung" löste nichts auf.
 */
export function brandPublicationSlugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base
  const suffix = `-${attempt}`
  const room = BRAND_PUBLICATION_SLUG_MAX - suffix.length
  return `${trimHyphens(base.slice(0, room))}${suffix}`
}

/** Die Adresse, unter der die Anatomie steht (D2). */
export function brandPublicationPath(slug: string): string {
  return `${BRAND_PUBLICATION_PATH_PREFIX}${slug}`
}

// ── 2 · Die Voraussetzungen ─────────────────────────────────────────────────

/**
 * DIE KAPITEL, DIE ABGENOMMEN SEIN MÜSSEN (§3.3): A (`context`) und B (`pvm`).
 *
 * Ohne sie ist die Anatomie leer — sie zeigt Purpose, Vision, Mission und die
 * Herkunft, und beides kommt aus genau diesen zwei Bausteinen. Dieselbe
 * „Behauptungs"-Logik wie die Marktvergleich-Sperre: wer nichts festgelegt
 * hat, hat nichts zu zeigen.
 */
export const BRAND_PUBLICATION_REQUIRED_STEPS = ['context', 'pvm'] as const

/** Der Slot, der den Archetyp trägt (§3.3 „Archetyp gesetzt"). */
export const BRAND_PUBLICATION_ARCHETYPE_SLOT = 'd.primary'

/**
 * WAS FEHLT — als Codes, nicht als Sätze.
 *
 * Sie reisen im 409 (`data.code` → `reason`, plus die Liste) und werden erst
 * in der Oberfläche zu Text (`brand.publication.blocker.<code>`). Ein Server,
 * der fertige Sätze schickt, kann sie nicht übersetzen und nicht umformulieren.
 */
export const BRAND_PUBLICATION_BLOCKERS = [
  'title_missing',
  'context_open',
  'pvm_open',
  'archetype_missing',
] as const

export type BrandPublicationBlocker = typeof BRAND_PUBLICATION_BLOCKERS[number]

/** Kapitel → Grund. Eine Karte statt vier `if` (und die einzige Stelle dafür). */
const STEP_BLOCKERS: Readonly<Record<string, BrandPublicationBlocker>> = {
  context: 'context_open',
  pvm: 'pvm_open',
}

export interface BrandPublicationSubmitFacts {
  /** Der Titel der Marke, roh — hier wird getrimmt. */
  title: string
  /** Die Baustein-Schlüssel, die ABGENOMMEN sind (`state === 'done'`). */
  acceptedStepKeys: readonly string[]
  /** Ist `d.primary` bestätigt? */
  archetypeConfirmed: boolean
}

export interface BrandPublicationSubmitDecision {
  allowed: boolean
  /** Leer, wenn erlaubt. Sonst in der Reihenfolge, in der man sie abarbeitet. */
  blockers: BrandPublicationBlocker[]
}

/**
 * DARF DIESE MARKE EINGEREICHT WERDEN? (§3.3)
 *
 * ALLE Gründe auf einmal, nie nur der erste: der Dialog zeigt eine Liste, und
 * ein Mensch, der drei Dinge nachholen muss, soll das in einem Zug erfahren
 * und nicht in drei Anläufen.
 */
export function brandPublicationCanSubmit(
  facts: BrandPublicationSubmitFacts,
): BrandPublicationSubmitDecision {
  const blockers: BrandPublicationBlocker[] = []
  if (!facts.title.trim()) blockers.push('title_missing')
  for (const stepKey of BRAND_PUBLICATION_REQUIRED_STEPS) {
    if (!facts.acceptedStepKeys.includes(stepKey)) blockers.push(STEP_BLOCKERS[stepKey]!)
  }
  if (!facts.archetypeConfirmed) blockers.push('archetype_missing')
  return { allowed: blockers.length === 0, blockers }
}

/** Der Fehlercode des 409, wenn die Voraussetzungen fehlen (§4.3). */
export const BRAND_PUBLICATION_NOT_READY = 'publication_not_ready'

// ── 3 · Die Zustandsmaschine ────────────────────────────────────────────────

/**
 * DIE SECHS HANDLUNGEN. `submit`/`withdraw` gehören dem KUNDEN,
 * `approve`/`decline`/`hide`/`unhide` dem BETREIBER (D3).
 */
export const BRAND_PUBLICATION_ACTIONS = [
  'submit',
  'withdraw',
  'approve',
  'decline',
  'hide',
  'unhide',
] as const
export type BrandPublicationAction = typeof BRAND_PUBLICATION_ACTIONS[number]

export type BrandPublicationTransition =
  | { action: 'apply', next: BrandPublicationStatus }
  | { action: 'refuse', code: 'publication_state' }

/**
 * WAS DARF JETZT PASSIEREN? — `null` heisst „es gibt noch keine Zeile".
 *
 * ┌────────────┬──────────────────────────────────────────────────────────┐
 * │ submit     │ (keine) · declined · withdrawn · published → pending      │
 * │ withdraw   │ pending · published · declined            → withdrawn     │
 * │ approve    │ pending                                    → published    │
 * │ decline    │ pending                                    → declined *   │
 * │ hide       │ published                                  → hidden       │
 * │ unhide     │ hidden                                     → published    │
 * └────────────┴──────────────────────────────────────────────────────────┘
 *
 * (*) `decline` hat einen zweiten Halbsatz, wenn schon ein FREIGEGEBENER Stand
 * draussen steht — dann bleibt die Zeile `published`. Das entscheidet
 * `brandPublicationDeclineOutcome()` unten; diese Funktion beantwortet nur die
 * Vorfrage „darf jetzt überhaupt abgelehnt werden?".
 *
 * ── `unhide` IST DIE HAND DES BETREIBERS, NICHT DIE DES KUNDEN ────────────
 * `hidden` bleibt für den Kunden eine Sackgasse (s. unten) — genau deshalb
 * braucht der Betreiber einen Weg zurück, sonst wäre jede Ausblendung
 * endgültig und die einzige Korrektur eines Fehlgriffs bestünde darin, den
 * Kunden neu einreichen zu lassen (was er nicht kann). Zurück geht es OHNE
 * neue Freigabe: der Stand war schon einmal freigegeben, und ihn ein zweites
 * Mal zu prüfen prüfte nichts Neues.
 *
 * ── „ERNEUT EINREICHEN" AUS `published` IST DER INTERESSANTE FALL ─────────
 * Er setzt den Zustand auf `pending` zurück, und trotzdem BLEIBT die Marke
 * öffentlich, bis der Betreiber entschieden hat (§3.4: „bis dahin bleibt der
 * freigegebene alte Stand öffentlich"). Das ist kein Widerspruch, sondern die
 * Arbeitsteilung zwischen Zustand und Inhalt: der Zustand sagt, WORÜBER gerade
 * entschieden wird, die zwei Snapshot-Spalten sagen, WAS zu sehen ist —
 * `snapshot` ist der öffentliche Stand, `pendingSnapshot` der eingereichte.
 * Die Freigabe kopiert `pendingSnapshot` → `snapshot`. Ein einzelnes Feld
 * könnte beides nicht: der neue Stand überschriebe den freigegebenen, und die
 * Öffentlichkeit sähe während der Prüfung genau das, was noch niemand geprüft
 * hat.
 *
 * ── `hidden` IST EINE SACKGASSE, UND ZWAR ABSICHTLICH ─────────────────────
 * Ausblenden ist die Antwort des Betreibers auf einen Rechtsverstoss oder eine
 * Meldung (§3.4/§4.4). Dürfte der Kunde daraus neu einreichen, wäre der
 * Entzug ein Knopfdruck weit weg von seiner Aufhebung — dieselbe Trennung wie
 * zwischen `rankingOptIn` und `hidden` beim Brand-Check (brand-017): zwei
 * Flags, weil es zwei verschiedene Menschen sind. Der Weg zurück führt über
 * den Betreiber, nicht über die Selbstbedienung.
 */
export function decideBrandPublication(
  status: BrandPublicationStatus | null,
  action: BrandPublicationAction,
): BrandPublicationTransition {
  const refuse: BrandPublicationTransition = { action: 'refuse', code: 'publication_state' }
  switch (action) {
    case 'submit':
      return status === null || status === 'declined' || status === 'withdrawn' || status === 'published'
        ? { action: 'apply', next: 'pending' }
        : refuse
    case 'withdraw':
      return status === 'pending' || status === 'published' || status === 'declined'
        ? { action: 'apply', next: 'withdrawn' }
        : refuse
    case 'approve':
      return status === 'pending' ? { action: 'apply', next: 'published' } : refuse
    case 'decline':
      return status === 'pending' ? { action: 'apply', next: 'declined' } : refuse
    case 'hide':
      return status === 'published' ? { action: 'apply', next: 'hidden' } : refuse
    case 'unhide':
      return status === 'hidden' ? { action: 'apply', next: 'published' } : refuse
  }
}

/**
 * ABGELEHNT — ABER WAS PASSIERT MIT DEM STAND, DER SCHON DRAUSSEN STEHT?
 *
 * Zwei Fälle, und sie sind wirklich verschieden:
 *
 *  · OHNE freigegebenen Stand (Erst-Einreichung) ⇒ `declined`. Es gibt nichts
 *    zu schützen; der Kunde sieht die Begründung und reicht erneut ein.
 *  · MIT freigegebenem Stand (§3.4 „bis dahin bleibt der freigegebene alte
 *    Stand öffentlich") ⇒ die Zeile BLEIBT `published`. Abgelehnt wurde die
 *    AKTUALISIERUNG, nicht die Marke — sie deswegen aus der Galerie zu nehmen
 *    wäre eine Strafe für einen Verbesserungsversuch, und der geteilte Link
 *    stürbe an einem Vorgang, der ihn gar nicht betraf.
 *
 * Der `pendingSnapshot` wird in BEIDEN Fällen geleert (er ist entschieden) und
 * die `decisionNote` gesetzt. Daraus folgt die Regel, an der die Oberfläche
 * den zweiten Fall ERKENNT, ohne dass es dafür eine Spalte gäbe:
 *
 *   `published` + nicht-leere `decisionNote`  ⇔  „Aktualisierung abgelehnt".
 *
 * Sie trägt nur, wenn die anderen Übergänge die Notiz sauber hinterlassen:
 * `approve` LEERT sie (die Ablehnung von gestern ist erledigt), `unhide`
 * ebenso (die Ausblende-Begründung ist mit dem Einblenden gegenstandslos),
 * `hide` setzt sie zusammen mit `status: 'hidden'`. Alle vier Routen tun das,
 * `brandPublicationPendingDeclined()` unten liest es — und der Test nagelt
 * beides zusammen fest.
 */
export interface BrandPublicationDeclineOutcome {
  /** Der Zustand, den die Zeile danach trägt. */
  next: BrandPublicationStatus
  /** Bleibt der zuvor freigegebene Stand öffentlich? */
  keepsPublicStand: boolean
}

export function brandPublicationDeclineOutcome(hasPublicStand: boolean): BrandPublicationDeclineOutcome {
  return hasPublicStand
    ? { next: 'published', keepsPublicStand: true }
    : { next: 'declined', keepsPublicStand: false }
}

/**
 * „AKTUALISIERUNG ABGELEHNT" — die Lesung der Regel von oben.
 *
 * Bewusst BERECHNET und nicht gespeichert: es ist dieselbe Tatsache aus zwei
 * Feldern, und ein drittes Feld daneben wäre das, das eines Tages nicht
 * mitgeführt wird (dieselbe Begründung wie bei `pendingUpdate`). Es spart
 * ausserdem eine Migration auf einer Tabelle, die schon steht.
 */
export function brandPublicationPendingDeclined(
  status: BrandPublicationViewStatus,
  decisionNote: string,
): boolean {
  return status === 'published' && decisionNote.trim().length > 0
}

// ── 5 · Brand of the Day: genau EINE, letzte gewinnt ────────────────────────

/**
 * WELCHE ZEILEN VERLIEREN IHR `featuredAt`, wenn eine neue gesetzt wird?
 * (Davids Entscheidung 6, §9.)
 *
 * Die Regel steht hier und nicht in der Route, weil sie eine AUSSAGE ist und
 * keine Datenbank-Bewegung: „nach dieser Handlung trägt höchstens eine Zeile
 * ein `featuredAt`". Die Route führt die Liste aus, dieser Test beweist sie.
 *
 * ── DIE ZIEL-ZEILE STEHT NIE IN DER ANTWORT ───────────────────────────────
 * Auch dann nicht, wenn sie schon featured WAR. Sonst löschte die Route erst
 * den Stempel, den sie im selben Zug setzt — und ein Fehlschlag dazwischen
 * liesse gar keine Brand of the Day zurück. Beim ENTFERNEN (`featured: false`)
 * gibt es nichts abzulösen: dort räumt die Route genau ihre eigene Zeile.
 */
export function brandPublicationFeatureLosers(
  currentlyFeaturedIds: readonly string[],
  targetId: string,
  featured: boolean,
): string[] {
  if (!featured) return []
  return [...new Set(currentlyFeaturedIds)].filter(id => id && id !== targetId)
}

// ── 6 · Die Meldungen (§3.4 „öffentliches Melden", §6) ──────────────────────

/** `open` = wartet auf den Betreiber, `done` = erledigt. Mehr braucht es nicht. */
export const BRAND_PUBLICATION_REPORT_STATUSES = ['open', 'done'] as const
export type BrandPublicationReportStatus = typeof BRAND_PUBLICATION_REPORT_STATUSES[number]

/** Die Reiter der Betreiber-Liste — die zwei Zustände plus „alles". */
export const BRAND_PUBLICATION_REPORT_FILTERS = ['open', 'done', 'all'] as const
export type BrandPublicationReportFilter = typeof BRAND_PUBLICATION_REPORT_FILTERS[number]
export const BRAND_PUBLICATION_REPORT_DEFAULT_FILTER: BrandPublicationReportFilter = 'open'

export function normalizeBrandPublicationReportStatus(
  value: string | null | undefined,
): BrandPublicationReportStatus {
  return (value ?? '').trim() === 'done' ? 'done' : 'open'
}

/** `null` heisst „nicht filtern" — genau die Form, die `Query.equal` braucht. */
export function brandPublicationReportStatusValues(
  filter: BrandPublicationReportFilter,
): BrandPublicationReportStatus[] | null {
  return filter === 'all' ? null : [filter]
}

/**
 * DER GRUND IST PFLICHT, anders als beim Korrekturvorschlag.
 *
 * Dort sagt schon die AUSWAHL („Branche X statt Y"), worum es geht; hier gibt
 * es nichts ausser dem Satz. Eine Meldung ohne Begründung wäre für den
 * Betreiber ein Zeiger auf eine Seite und die Aufforderung, selbst zu suchen —
 * und die Untergrenze von zehn Zeichen hält „test" und „!!!" heraus.
 */
export const BRAND_PUBLICATION_REPORT_REASON_MIN = 10
export const BRAND_PUBLICATION_REPORT_REASON_MAX = 300
export const BRAND_PUBLICATION_REPORT_EMAIL_MAX = 254

/** Der Deckel der Betreiber-Begründung = die Spaltengrösse aus brand-020. */
export const BRAND_PUBLICATION_NOTE_MAX = 300

/**
 * DREI MELDUNGEN JE ANSCHLUSS UND STUNDE (§6).
 *
 * Wie bei den Korrekturvorschlägen: der Minuten-Eimer `brand:report` in
 * `05.rate-limit.ts` schützt den Server, diese Stunde die Arbeitsliste des
 * Betreibers. Und wie dort ist die Zahl aus dem Gebrauch abgeleitet — wer
 * mehr als drei Marken pro Stunde beanstandet, meldet nicht, sondern flutet.
 */
export const BRAND_PUBLICATION_REPORT_HOUR_LIMIT = 3
export const BRAND_PUBLICATION_REPORT_WINDOW_MS = 60 * 60_000
export const BRAND_PUBLICATION_REPORT_LIMIT_CODE = 'report_limit'
/** Eine offene Meldung derselben IP zur selben Marke ⇒ 409, keine Dublette. */
export const BRAND_PUBLICATION_REPORT_OPEN_CODE = 'report_open'

export function brandPublicationReportHourKey(ipHash: string): string {
  return `brand-publication-report-hour:${ipHash}`
}

/** `>` statt `>=` — `store.hit()` zählt diese Meldung schon mit. */
export function decideBrandPublicationReportQuota(
  count: number,
  limit: number = BRAND_PUBLICATION_REPORT_HOUR_LIMIT,
): typeof BRAND_PUBLICATION_REPORT_LIMIT_CODE | null {
  return count > limit ? BRAND_PUBLICATION_REPORT_LIMIT_CODE : null
}

// ── 7 · Die Reiter der Betreiber-Liste ──────────────────────────────────────

/**
 * DIE REITER DER BETREIBER-LISTE (§4.4) — und zwar DREI FRAGEN, nicht fünf
 * Zustände.
 *
 *   pending — was will veröffentlicht werden?
 *   live    — was steht draussen? (`published` UND `hidden`)
 *   closed  — was ist erledigt?   (`declined` UND `withdrawn`)
 *
 * ── WARUM NICHT EIN REITER JE ZUSTAND ─────────────────────────────────────
 * Weil der Betreiber nicht in Zuständen arbeitet, sondern in Stapeln. `hidden`
 * gehört zu dem, was einmal draussen stand (die Seite dämpft es und bietet
 * „Wieder einblenden" an) — ein eigener Reiter dafür wäre eine Liste, die man
 * nur nach einem Fehlgriff öffnet und die deshalb nie jemand öffnet. Und
 * `withdrawn` ist der Zwilling von `declined`: beides ist entschieden, nur von
 * verschiedenen Menschen.
 *
 * Die drei plus `all` decken zusammen ALLE fünf Zustände ab — es gibt keine
 * Zeile, die von dieser Seite aus unerreichbar wäre. Genau das ist die Zusage,
 * die `BRAND_PUBLICATION_FILTER_STATUSES` unten mit ihrer Vollständigkeit
 * einlöst und die der Test nachrechnet.
 *
 * Der Vorgabewert ist `pending`: das ist die ARBEITSLISTE. Wer die Seite
 * öffnet, soll sehen, was noch zu entscheiden ist (dieselbe Entscheidung wie
 * bei den Korrekturen).
 */
export const BRAND_PUBLICATION_FILTERS = ['pending', 'live', 'closed', 'all'] as const
export type BrandPublicationFilter = typeof BRAND_PUBLICATION_FILTERS[number]
export const BRAND_PUBLICATION_DEFAULT_FILTER: BrandPublicationFilter = 'pending'

/** `null` heisst „nicht filtern" — genau die Form, die `Query.equal` braucht. */
export const BRAND_PUBLICATION_FILTER_STATUSES: Readonly<
  Record<BrandPublicationFilter, readonly BrandPublicationStatus[] | null>
> = {
  pending: ['pending'],
  live: ['published', 'hidden'],
  closed: ['declined', 'withdrawn'],
  all: null,
}

export function brandPublicationStatusValues(
  filter: BrandPublicationFilter,
): BrandPublicationStatus[] | null {
  const values = BRAND_PUBLICATION_FILTER_STATUSES[filter]
  return values ? [...values] : null
}

/**
 * DIE ZAHL AM REITER, aus den Zählern je Zustand.
 *
 * Sie wird gerechnet und nicht abgefragt: die Route zählt die fünf Zustände
 * (das ist die Wahrheit), die Reiter fassen sie zusammen. Eine vierte
 * Zähl-Abfrage für „live" wäre eine zweite Quelle für dieselbe Zahl — und die
 * eine, die eines Tages nicht mitgeführt wird.
 */
export function brandPublicationFilterCount(
  filter: BrandPublicationFilter,
  counts: Readonly<Record<string, number>>,
): number {
  const values = BRAND_PUBLICATION_FILTER_STATUSES[filter] ?? BRAND_PUBLICATION_STATUSES
  return values.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
}

/**
 * BLEIBT DER ALTE STAND ÖFFENTLICH? — die zweite Hälfte des Falls oben.
 *
 * Sie steht als eigene Funktion da, weil zwei Stellen sie brauchen: die Route
 * (sie darf `snapshot` dann NICHT überschreiben) und die Oberfläche (sie sagt
 * „öffentlich · ein neuer Stand wartet auf Freigabe" statt bloss „wartet").
 */
export function brandPublicationKeepsPublicStand(
  previous: BrandPublicationStatus | null,
  action: BrandPublicationAction,
): boolean {
  return action === 'submit' && previous === 'published'
}

/**
 * IST DIESE ZEILE SICHTBAR? — die Lese-Seite der Regel oben (`brandPublicationIsPublic` oben sagt nur, ob ein ZUSTAND öffentlich ist — Featured fragt so) (2026-09-08,
 * live erwischt: Krume & Gold verschwand aus Galerie und Anatomie, sobald ein
 * neuer Stand eingereicht war).
 *
 * `published` ist öffentlich. `pending` ist es NUR dann, wenn ein alter,
 * freigegebener Stand in `snapshot` liegt — das ist genau der Fall „neuer
 * Stand wartet, der alte bleibt sichtbar". Ein erstes Einreichen hat kein
 * `snapshot` und ist unsichtbar; abgelehnt, ausgeblendet, zurückgezogen sind
 * es immer. Galerie und Anatomie fragen NUR hier — nicht am Status allein.
 */
export function brandPublicationIsVisible(row: { status?: string | null, snapshot?: string | null }): boolean {
  // Bewusst NICHT über `normalizeBrandPublicationStatus`: die macht aus einem
  // unbekannten Wert `pending` (fail-closed für den Betreiber) — hier hiesse
  // das „sichtbar, falls ein Stand da ist", und ein Datenfehler darf nie
  // veröffentlichen.
  const status = (row.status ?? '').trim()
  if (status === 'published') return true
  return status === 'pending' && typeof row.snapshot === 'string' && row.snapshot.length > 0
}

// ── 4 · Der Tages-Deckel ────────────────────────────────────────────────────

/**
 * ZEHN EINREICHUNGEN JE KONTO UND TAG (§6).
 *
 * Der Eimer `brand:publish` in `05.rate-limit.ts` zählt je MINUTE und je IP —
 * das ist das einzige Fenster, das die Middleware kennt. Der TAG und das KONTO
 * gehören hierher: ein Mensch veröffentlicht seine Marke einmal und aktualisiert
 * den Stand gelegentlich; wer zehnmal am Tag einreicht, füllt die Warteschlange
 * des Betreibers. Beide sind nötig und meinen Verschiedenes — die Minute
 * schützt den Server, der Tag die Arbeitsliste (dieselbe Begründung wie bei den
 * Korrekturvorschlägen).
 */
export const BRAND_PUBLICATION_DAY_LIMIT = 10
export const BRAND_PUBLICATION_DAY_WINDOW_MS = 24 * 60 * 60_000
export const BRAND_PUBLICATION_LIMIT_CODE = 'publication_limit'

export function brandPublicationDayKey(userId: string): string {
  return `brand-publication-day:${userId}`
}

/**
 * `>` statt `>=`, weil `store.hit()` den Zähler EINSCHLIESSLICH dieser
 * Einreichung liefert: die zehnte ist erlaubt, die elfte nicht.
 */
export function decideBrandPublicationQuota(
  count: number,
  limit: number = BRAND_PUBLICATION_DAY_LIMIT,
): typeof BRAND_PUBLICATION_LIMIT_CODE | null {
  return count > limit ? BRAND_PUBLICATION_LIMIT_CODE : null
}
