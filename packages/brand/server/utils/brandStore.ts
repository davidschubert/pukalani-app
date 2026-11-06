import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { AppwriteException, Query } from 'node-appwrite'
import type {
  BrandGenerationsView,
  BrandProfileSummary,
  BrandSiteAnalysisView,
  BrandSlotView,
  BrandStartCard,
  BrandStepSummary,
  BrandStoryView,
} from '../../shared/types/brand'
import { BRAND_INDUSTRY_UNKNOWN } from '../../shared/brandIndustries'
import { siteAnalysisIsStale } from '../../shared/brandSiteAnalysis'
import { resolveDerivationAccess } from '../../shared/brandDerivation'
import {
  type BrandConfidence,
  type BrandJourneyStep,
  type BrandProfileFacts,
  type BrandSessionState,
  type BrandStepFacts,
  type BrandStoredStepState,
  canEnterBrandStep,
  resolveBrandJourney,
  resolveSessionStates,
} from '../../shared/brandJourney'
import {
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  BRAND_STEP_SLOTS_MAX_LENGTH,
  type BrandSlot,
  type BrandSlotStateFacts,
  type BrandStepKey,
  isBrandDesignStep,
  isBrandKitStep,
  slotById,
} from '../../shared/slotRegistry'
import { computeSourcesHash } from '../../shared/brandSessions'

/**
 * DER LESE-/SCHREIB-UNTERBAU DER `/api/brand/**`-ROUTEN — alles, was mehr als
 * eine Route braucht, steht EINMAL hier.
 *
 * ── KEIN `tenantDb`, UND DAS IST KEINE ABKÜRZUNG ──────────────────────────
 * `brand` ist ein SILO-Layer auf der Single-Tenant-Instanz `branding`; seine
 * Tabellen tragen kein `communityId`, und der ESLint-Backstop gegen rohes
 * `.tablesDB` gilt den GEPOOLTEN Layern. Die Grenze zwischen zwei Konten ist
 * hier `assertBrandOwnerAccess` — sie ist die EINZIGE, weil alle
 * `brand_*`-Tabellen server-only sind (Permissions `[]`, `rowSecurity: false`).
 * Deshalb gilt für jede Route dieselbe Reihenfolge: `requireBrandAccess` →
 * Zeile laden → `assertBrandOwnerAccess` → erst dann wirken.
 *
 * ── ZEILEN-IDS DER BAUSTEINE SIND ABLEITBAR ───────────────────────────────
 * `brand_steps` hat einen UNIQUE-Index auf (profileId, stepKey) — die Zeile ist
 * also ohnehin eindeutig. Wir vergeben ihre Id zusätzlich DETERMINISTISCH
 * (`<profileId>_<stepKey>`, beides aus unserem eigenen Vorrat, zusammen ≤ 33
 * Zeichen): das macht aus „such die Zeile" ein `getRow`, und aus dem Anlegen
 * der neun Zeilen eine idempotente Handlung (ein zweiter Lauf läuft in 409
 * statt Dubletten zu bauen). Der LESER fällt trotzdem auf die Abfrage zurück
 * (`loadStepRow`) — eine Zeile aus einem späteren Import oder von Hand hat
 * diese Id nicht, und ein Leser, der sie dann nicht findet, wäre ein stiller
 * Datenverlust.
 */

export const BRAND_PROFILES_TABLE = 'brand_profiles'
export const BRAND_STEPS_TABLE = 'brand_steps'
export const BRAND_MESSAGES_TABLE = 'brand_messages'
export const BRAND_SHARES_TABLE = 'brand_shares'
export const BRAND_INVITES_TABLE = 'brand_invites'
export const BRAND_EVENTS_TABLE = 'brand_events'
export const BRAND_WAITLIST_TABLE = 'brand_waitlist'
/**
 * Der kostenlose Aussen-Check (brand-016). Er gehört zu KEINEM Profil und zu
 * keinem Konto — die einzige `brand_*`-Tabelle ohne `createdByUserId`, weil
 * die Route ohne Anmeldung läuft (Davids Hybrid-Zugang, Plan §5).
 */
export const BRAND_CHECKS_TABLE = 'brand_checks'
/**
 * Die Korrekturvorschläge zum Ranking (brand-017, Plan §3b). Eigene Tabelle
 * und keine Spalte an `brand_checks`: ein Vorschlag hat einen eigenen STATUS,
 * einen eigenen Absender und es kann mehrere je Check geben.
 */
export const BRAND_CHECK_CORRECTIONS_TABLE = 'brand_check_corrections'
/**
 * DIE ERSTGESPRÄCH-ANFRAGEN (brand-021, BS1 Paket Z0). Wie `brand_waitlist`
 * eine Tabelle, in die jemand OHNE Konto schreibt — anders als sie trägt eine
 * Zeile hier aber optional eine `userId` und eine `profileId`, weil der Weg
 * aus der Werkstatt der wahrscheinlichere ist. Beides ist `''`, wenn die
 * Anfrage von der öffentlichen Seite kommt.
 */
export const BRAND_INTRO_REQUESTS_TABLE = 'brand_intro_requests'

export type BrandProfileRow = Models.Row & {
  createdByUserId: string
  ownerType: string
  ownerId: string
  title?: string
  contentLocale: string
  pathKind: string
  relaunchScope?: string | null
  hasName: boolean
  team: string
  subBrands?: string
  /**
   * Der Chip „Name auf den Prüfstand?" (Katalog §2.2). Optional getypt, weil
   * die Spalte mit brand-008 additiv dazukam — ein Deploy vor der Migration
   * liest `undefined`, und das ist genau der Default `false`.
   */
  namingOpted?: boolean
  /**
   * Die STARTKARTE (Content-Spec §2.1). Alle vier optional getypt, weil die
   * Spalten mit brand-009 additiv dazukamen — eine Zeile von vorher liest
   * `undefined`, und `profileStartCard()` macht daraus dasselbe '' wie ein
   * unbeantwortetes Feld.
   */
  websiteUrl?: string
  industry?: string
  about?: string
  audience?: string
  /**
   * DER ZWISCHENSPEICHER DER URL-ANALYSE (P2.3, Migration brand-010). Alle drei
   * optional getypt, weil sie additiv dazukamen — und `siteAnalysis` ist
   * MEDIUMTEXT, hat also KEINEN Vorgabewert (MariaDB erlaubt auf TEXT-Spalten
   * keinen): eine Zeile von vor der Migration liest dort `undefined`, und erst
   * `profileSiteAnalysisText()` macht daraus das '' , mit dem jeder Leser
   * rechnet.
   */
  siteAnalysis?: string | null
  siteAnalyzedAt?: string
  siteAnalysisUrl?: string
  /**
   * DAS OPT-IN „diese Marke darf im Marktvergleich anderer Kunden als Kandidat
   * erscheinen" (Migration brand-019, MV1 M4). Optional getypt, weil die
   * Spalte ADDITIV dazukam — eine Zeile von vorher liest `undefined`, und das
   * ist genau der Default `private`. Gelesen und geschrieben wird sie
   * ausschliesslich über `brandMarketVisibility.ts`; die FAIL-CLOSED-Regel
   * steht dort (`brandMarketVisibilityOf`).
   */
  marketVisibility?: string
  /**
   * DIE FREISCHALTUNG VON BRAND DESIGN (Konzept §2.10, Migration brand-022).
   * Optional getypt, weil sie ADDITIV dazukam — `undefined` ist genau der
   * Default „gesperrt"; `profileFacts()` macht daraus das `null`, mit dem die
   * pure Regel rechnet.
   */
  designUnlockedAt?: string | null
  /**
   * WER FREIGESCHALTET HAT (brand-022) — die Betreiber-Id, nicht der Name.
   * Sie steht NEBEN dem Ereignis `design.unlocked` und nicht statt seiner:
   * das Ereignis ist die Geschichte, diese Spalte der ZUSTAND, den die
   * Betreiber-Liste je Zeile zeigt, ohne den Funnel zu durchsuchen. Sie wird
   * mit `designUnlockedAt` zusammen gesetzt UND zusammen geleert — eine Id
   * ohne Datum wäre die Behauptung einer Freischaltung, die es nicht gibt.
   */
  designUnlockedBy?: string | null
  /**
   * DIE FREISCHALTUNG DER ABLEITUNG (Book & Kit + Marktvergleich, Konzept
   * BRAND-BOOK-KIT.md §2.8) — die Spalte kommt mit Migration **brand-025**
   * (Paket K1). Sie steht hier schon, damit `profileFacts()` sie lesen KANN;
   * bis zur Migration fehlt sie in jeder Zeile, und `undefined` ist genau der
   * Default „nicht freigeschaltet". Der Leser läuft also bewusst ohne sie —
   * sonst wäre der Code vor der Migration nicht deploybar (D1-Lehre:
   * Migration VOR Code, aber der Code darf nicht darauf bestehen).
   */
  derivationUnlockedAt?: string | null
  /**
   * WOHER die Freischaltung kommt (`'operator' | 'purchase'`, brand-025) und
   * WER sie gesetzt hat (Betreiber-Id bzw. ab BS1 Z1 die Stripe-Event-Id).
   * Beide optional getypt aus demselben Grund wie das Datum darüber; sie
   * stehen NEBEN dem Ereignis `derivation.unlocked`, nicht statt seiner (die
   * Begründung steht bei `designUnlockedBy` und gilt hier wörtlich).
   */
  derivationUnlockedVia?: string | null
  derivationUnlockedBy?: string | null
  /**
   * DAS OPT-IN „diese Marke darf als öffentliche Seite in der Galerie stehen"
   * (Migration brand-020, Discover D1). EIGENE Spalte neben `marketVisibility`
   * und nicht dieselbe: eine Zustimmung gilt nur für das, wofür sie gegeben
   * wurde, und „indexierbar im offenen Netz" ist der grössere Satz (Kopf von
   * brand-020). Optional getypt, weil sie ADDITIV dazukam — `undefined` ist
   * genau der Default `private`.
   */
  publicationVisibility?: string
  progressPct: number
  currentStepKey?: string
  lastActivityAt: string
  storyBody?: string | null
  storyMeta?: string | null
  designPresetId?: string
  designPresetVersion?: string
}

export type BrandStepRow = Models.Row & {
  profileId: string
  stepKey: string
  state: BrandStoredStepState
  slots: string
  generations: string
  inputHash?: string
  revision: number
  confidence?: BrandConfidence | null
  startedAt?: string | null
  completedAt?: string | null
  /**
   * DER VERLAUFS-SCHNITT nach „Nochmal von vorn" (brand-013, §5a). Die
   * Nachrichten bleiben stehen (Retention brand-003), aber der Verlauf lädt
   * nur noch Züge DANACH — George beginnt ohne das alte Gedächtnis, sonst
   * wäre „von vorn" eine Lüge. `null`/fehlend = nie neu begonnen.
   */
  restartedAt?: string | null
  activeSeconds: number
}

export type BrandMessageRow = Models.Row & {
  profileId: string
  stepKey: string
  /**
   * DIE SESSION, in der dieser Zug entstand (brand-011, BW2 Paket 3a).
   *
   * OPTIONAL getypt, weil die Spalte ADDITIV dazukam: eine Zeile von vor der
   * Migration liest `undefined`, und der einzige Leser macht daraus dasselbe
   * '' wie die Spalten-Vorgabe — der Kapitel-Verlauf aus der Zeit vor BW2.
   */
  sessionKey?: string
  role: string
  body: string
  parts?: string | null
  generationId?: string | null
}

export type BrandShareRow = Models.Row & {
  profileId: string
  tokenHash: string
  snapshot: string
  publishedAt: string
  expiresAt: string
  revokedAt?: string | null
}

/**
 * Die Warteliste (brand-012). Sie hängt an KEINEM Profil und an keinem Konto —
 * die Zeile entsteht, bevor es beides gibt; ihre Identität ist `emailLower`
 * (UNIQUE).
 *
 * `status` IST SEIT DEM DOUBLE-OPT-IN (brand-015) LOGIK, nicht mehr nur
 * Anzeige: 'pending' | 'confirmed' | 'invited' | 'declined'. Genau EIN Wert
 * wird gelesen — 'confirmed' heisst „die Adresse hat sich selbst bestätigt";
 * alles andere heisst „noch nicht", einschliesslich des Altwerts 'new' aus der
 * Zeit davor (in Produktion existiert keine solche Zeile, die Tabelle war
 * leer). 'invited'/'declined' bleiben Betreiber-Notizen ohne Code dahinter —
 * der Übergang zur Einladung läuft über `brand_invites`, nicht über dieses Feld.
 *
 * Die drei Token-Felder kamen ADDITIV dazu und sind deshalb optional getypt:
 * eine Zeile von vor der Migration liest `undefined`, und jeder Leser hier
 * rechnet damit (`brandWaitlistTokenExpired` behandelt „fehlt" wie „abgelaufen").
 * `tokenHash: ''` ist der NORMALFALL einer bestätigten Zeile — der Hash wird
 * beim Bestätigen gelöscht, damit ein weitergeleiteter Link tot ist.
 */
export type BrandWaitlistRow = Models.Row & {
  emailLower: string
  email: string
  name: string
  company: string
  website: string
  locale: string
  source: string
  status: string
  note: string
  tokenHash?: string
  tokenExpiresAt?: string
  confirmedAt?: string
}

/**
 * EINE ERSTGESPRÄCH-ANFRAGE (brand-021).
 *
 * `emailLower` steht NEBEN `email` aus demselben Grund wie in der Warteliste:
 * verglichen wird technisch (klein), angeschrieben wird so, wie jemand sich
 * selbst geschrieben hat. Anders als dort trägt der Vergleichswert hier KEINEN
 * Unique-Index — zwei Anfragen derselben Person sind zwei verschiedene
 * Anliegen, kein Duplikat. Er ist der Lesepfad der GDPR-Löschung
 * (`brandUserData.ts`) und sonst nichts.
 *
 * `userId` und `profileId` sind `''`, wenn die Anfrage von der öffentlichen
 * Seite kommt. `profileId` steht nur da, wenn die Datentür der Route sie
 * bestätigt hat — eine fremde Id wird verworfen, nicht gespeichert.
 */
export type BrandIntroRequestRow = Models.Row & {
  name: string
  email: string
  emailLower: string
  company: string
  message: string
  phone: string
  locale: string
  source: string
  profileId: string
  userId: string
  status: string
  note: string
}

/**
 * EIN GESPEICHERTER BRAND-CHECK (brand-016).
 *
 * `categories`, `criteria` und `findings` sind JSON-Zeichenketten, keine
 * Objekte: Appwrite kennt kein JSON-Feld, und drei Spalten je Kriterium wären
 * hundertzwanzig Spalten. Wer sie liest, parst sie — die Route tut das an
 * genau einer Stelle.
 *
 * KEIN SEITENTEXT (Plan §5): `textHash` ist alles, was von der gelesenen Seite
 * bleibt. Er beantwortet später „hat sich dort überhaupt etwas geändert?",
 * ohne dass wir fremde Inhalte aufbewahren.
 */
export type BrandCheckRow = Models.Row & {
  urlKey: string
  url: string
  host: string
  locale: string
  score: number
  band: string
  scoreVersion: string
  promptVersion: string
  model: string
  categories: string
  criteria: string
  findings: string
  textHash: string
  ipHash: string
  /**
   * DIE SECHS SPALTEN DES RANKINGS (brand-017, Plan §3/§5/§8) — alle OPTIONAL
   * getypt, weil sie ADDITIV dazukamen: eine Zeile aus der Zeit davor liest
   * `undefined`, und jeder Leser hier macht daraus denselben Wert wie die
   * Spalten-Vorgabe (`brandCheckRankingFacts`). Das ist dasselbe Muster wie
   * bei `namingOpted` und der Startkarte am Profil.
   *
   * `industry` ist ein VARCHAR und kein Enum — dieselbe Entscheidung wie bei
   * `brand_waitlist.status`: die Wahrheit über die erlaubten Werte steht in
   * `shared/brandIndustries.ts`, und eine siebzehnte Branche soll ein Eintrag
   * in einer Datei sein und keine Migration auf einer laufenden Instanz.
   *
   * `rankingOptIn` ist das Häkchen des PRÜFERS (Davids Entscheidung 1),
   * `hidden` der Entfernen-Weg des BETREIBERS (§3 „Recht"). Zwei Flags, weil
   * es zwei verschiedene Menschen sind: ein ausgeblendeter Check darf nicht
   * dadurch zurückkommen, dass jemand das Häkchen erneut setzt.
   *
   * `source` trennt Website- von Dokument-Checks (§5b) — beide haben eine
   * Zahl, aber sie messen nicht dasselbe und dürfen deshalb nie in einer
   * Spalte verglichen werden.
   */
  industry?: string
  rankingOptIn?: boolean
  hidden?: boolean
  userId?: string
  profileId?: string
  source?: string
}

/**
 * EIN KORREKTURVORSCHLAG (brand-017, Plan §3b).
 *
 * `reporterEmail` ist FREIWILLIG und der einzige Personenbezug neben dem
 * `ipHash` — sie steht in der Zeile, damit der Betreiber zurückfragen kann,
 * und sie geht deshalb NUR an die Betreiber-Liste, nie an eine öffentliche
 * Antwort.
 */
export type BrandCheckCorrectionRow = Models.Row & {
  checkId: string
  field: string
  proposed: string
  reason: string
  reporterEmail: string
  status: string
  decisionNote: string
  decidedAt?: string | null
  ipHash: string
}

/**
 * DIE RANKING-TATSACHEN EINER ZEILE — die EINE Stelle, an der aus `undefined`
 * ein Wert wird (dieselbe Rolle wie `profileStartCard` für die Startkarte).
 *
 * Ohne sie stünde in der Ranking-Antwort einer Bestands-Zeile `undefined` als
 * Branche, und `rankingOptIn` wäre dort weder wahr noch falsch, sondern
 * nichts — und `!undefined` ist zwar zufällig richtig, aber niemand hätte es
 * entschieden.
 */
export interface BrandCheckRankingFacts {
  industry: string
  rankingOptIn: boolean
  hidden: boolean
  userId: string
  profileId: string
  source: string
}

export function brandCheckRankingFacts(row: BrandCheckRow): BrandCheckRankingFacts {
  return {
    industry: row.industry || BRAND_INDUSTRY_UNKNOWN,
    rankingOptIn: row.rankingOptIn === true,
    hidden: row.hidden === true,
    userId: row.userId ?? '',
    profileId: row.profileId ?? '',
    source: row.source || 'website',
  }
}

/** Der Admin-Client + die Database-Id des Requests — EIN Aufruf statt zwei. */
export function brandDb(event: H3Event) {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)
  return { tablesDB, databaseId }
}

export function isAppwriteNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

/** Deterministische Zeilen-Id eines Bausteins (s. Kopf). */
export function brandStepRowId(profileId: string, stepKey: string): string {
  return `${profileId}_${stepKey}`
}

/** Ein bekannter Baustein-Schlüssel — oder `null`. Nie geraten. */
export function toBrandStepKey(value: string | undefined): BrandStepKey | null {
  return (BRAND_STEP_KEYS as readonly string[]).includes(value ?? '')
    ? value as BrandStepKey
    : null
}

// ── Slots ───────────────────────────────────────────────────────────────────

/** Die gespeicherte Form EINES Slots (Schema-Anhang §2, Versions-Vertrag). */
export interface BrandSlotRecord {
  firstDraft?: string | null
  latestDraft?: string | null
  confirmed?: string | null
  confidence?: BrandConfidence | null
  updatedAt?: string | null
  /**
   * DER FORTSCHRITT EINER SAMMEL-SESSION (BW2 Paket 3a): Teil-Id → Antwort,
   * additiv in derselben JSON-Spalte (Plan §12: „kein Schema-Schritt").
   *
   * Nur `collect`-Sessions haben ihn (heute `a.facts`). Er ist ein
   * ZWISCHENSTAND, kein Wert: der Wert entsteht erst, wenn alle Teile
   * beantwortet sind, und steht dann wie jeder andere in `latestDraft`.
   * Deshalb steht er auch NICHT in `sameSlot` (Autosave-No-op-Regel) — er
   * wird ausschliesslich von der Konversations-Route geschrieben.
   */
  collected?: Record<string, string>
  /**
   * DER STAND DER QUELLEN BEIM BESTÄTIGEN (§9, seit Paket 3b verdrahtet).
   * Fehlt er, gilt die Session als AKTUELL — Bestand wird nie bernstein.
   */
  sourcesHash?: string
  /** Im Kapitel-Zusammenhang abgenommen (§5a). Fällt mit jeder Wert-Änderung. */
  accepted?: boolean
  /**
   * DER BESTÄTIGTE WORTLAUT VOR EINER KORREKTUR (§9, Paket 6) — gesetzt vom
   * Autosave-PATCH, sobald „Korrigieren" ein Feld mit bestätigten Abhängigen
   * öffnet, und von der Schliess-Route wieder gelöscht, sobald sie ihn benutzt
   * hat.
   *
   * Er ist die EINZIGE Spur, an der die spätere Eingrenzung erkennt, dass sie
   * eine Korrektur vor sich hat und nicht eine erste Bestätigung — und der
   * alte Wortlaut ist zugleich die Hälfte ihrer Eingabe („was hat sich
   * geändert"). Der Versions-Vertrag kann ihn nicht liefern: `firstDraft`/
   * `latestDraft`/`confirmed` sind drei Rollen, kein Verlauf.
   *
   * Ohne Abhängige wird er NICHT gesetzt: dort gibt es nichts einzugrenzen.
   */
  previousValue?: string
  /** Auf später vertagt (§3a `answers.allowDefer`) — je Session, nicht je Teil. */
  deferred?: boolean
  /**
   * DIE NOTIZ DES SCHLIESS-AUFRUFS (§4) — 0–3 kurze Sätze in der
   * Inhaltssprache, als EIN Text mit Zeilenumbrüchen.
   *
   * Warum ein String und keine Liste: sie wird gelesen (Abnahme-Seite,
   * Kapitel-Notizen im nächsten Prompt), nie einzeln adressiert — und eine
   * Liste in einer gedeckelten JSON-Spalte kostet Klammern ohne Gegenwert.
   * GESCHRIEBEN wird sie seit Paket 4; der Restart-Schutz zählt sie schon
   * seit 3b.
   *
   * Der Ablehnungs-Grund eines Befunds (§8) landet ebenfalls hier — er ist
   * genau das: etwas Gelerntes, das in kein Feld passt.
   */
  notes?: string
  /**
   * DAS URTEIL DES SPEZIALISTEN (§7). `goalReached: false` sperrt NICHTS — es
   * ist der Stoff für Georges „hat mitgelesen"-Block und für den Prüfblick.
   */
  review?: {
    goalReached?: boolean
    missing?: string[]
    reviewedBy?: string
    at?: string
  }
  /**
   * DER SCHLIESS-AUFRUF IST GELAUFEN (§7). FEHLT er, ist er fail-soft
   * ausgefallen — und genau diese Sessions holt der Prüfblick (§10) nach. Ein
   * gespeichertes `false` gibt es deshalb nicht: „nicht da" heisst „nicht
   * gelaufen", und ein drittes Wort dafür wäre eines zu viel.
   */
  reviewed?: boolean
  /**
   * DER VORSCHLAG DES SPEZIALISTEN für die nächste Session (§6). Er wird beim
   * Antworten GEPRÜFT (`pickNextSession`) und nicht beim Speichern: zwischen
   * Schreiben und nächstem Lesen kann die vorgeschlagene Session längst
   * bestätigt sein.
   */
  nextSession?: string
  /**
   * GEORGE HAT AUSGESPROCHEN, WAS DEM SPEZIALISTEN FEHLTE (§7: „George sagt im
   * nächsten Zug EINMAL, was fehlt"). Ohne diese Marke stünde derselbe Satz in
   * jedem Zug der nächsten Session — aus einem Hinweis würde eine Mahnung.
   */
  briefDelivered?: boolean
}

/**
 * Der gelesene Zwischenstand einer Sammel-Session — kaputte oder fremde
 * Formen ergeben ein LEERES Objekt statt einer Ausnahme (dieselbe
 * Nachsicht wie `parseSlotRecords`: ein unlesbarer Zwischenstand darf die
 * Session nicht unbedienbar machen, der nächste Zug schreibt ihn neu).
 */
export function parseCollectedParts(record: BrandSlotRecord | undefined): Record<string, string> {
  const raw = record?.collected
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [part, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[part] = value
  }
  return out
}

/**
 * `slots` ist eine JSON-Spalte. Kaputtes JSON, ein Array oder `null` ergeben
 * ein LEERES Objekt statt einer Ausnahme: eine unlesbare Spalte darf den
 * Wizard nicht unbedienbar machen — der nächste Autosave schreibt sie neu.
 * Unbekannte Slot-Ids bleiben im gelesenen Objekt (Bestandsdaten sollen
 * lesbar bleiben), gefiltert wird erst beim Hinausgeben.
 */
export function parseSlotRecords(raw: string | null | undefined): Record<string, BrandSlotRecord> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, BrandSlotRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = value as BrandSlotRecord
      }
    }
    return out
  }
  catch {
    return {}
  }
}

/** Die Form, die nach draußen geht — fehlende Felder werden `null`, nie `undefined`. */
export function toSlotView(record: BrandSlotRecord | undefined): BrandSlotView {
  return {
    firstDraft: record?.firstDraft ?? null,
    latestDraft: record?.latestDraft ?? null,
    confirmed: record?.confirmed ?? null,
    confidence: record?.confidence ?? null,
    updatedAt: record?.updatedAt ?? null,
  }
}

/**
 * DER GELTENDE WERT EINES SLOTS auf der SERVER-Seite: bestätigt schlägt
 * Entwurf, letzter Entwurf schlägt ersten. Dieselbe Rangfolge wie
 * `brandSlotDisplayValue` im Client (`shared/brandAutosaveDiff.ts`) — die
 * arbeitet aber auf der HINAUSGEGEBENEN Form (`BrandSlotView`, alles `null`),
 * hier steht die GESPEICHERTE (Felder können fehlen). Ein gemeinsamer Helfer
 * müsste beide Formen kennen und wäre an keiner von beiden mehr ehrlich.
 */
export function brandSlotStoredValue(record: BrandSlotRecord | undefined): string {
  return record?.confirmed || record?.latestDraft || record?.firstDraft || ''
}

/**
 * HAT DER MENSCH DIESEM SLOT ZUGESTIMMT? — die eine Frage hinter der
 * Bestätigungs-Sperre (Davids Entscheidung 2026-09-02: ein bestätigter Slot
 * ist zu, bis „Korrigieren" ihn öffnet).
 *
 * Sie wird an DREI Stellen gestellt (Autosave-Route, Generate-Route,
 * `toSlotFacts`) und darf überall dasselbe heissen: `confirmed` trägt den
 * bestätigten TEXT, nicht ein Flag — eine leere Zeichenkette ist deshalb
 * „nicht bestätigt" und nicht „bestätigt mit nichts".
 */
export function brandSlotRecordConfirmed(record: BrandSlotRecord | undefined): boolean {
  return typeof record?.confirmed === 'string' && record.confirmed.length > 0
}

/**
 * DEAKTIVIERTE UND UNBEKANNTE SLOTS FLIEGEN BEIM HINAUSGEBEN NICHT RAUS.
 * Ein Leser muss alte Daten anzeigen können (Migrationsvertrag) — geschrieben
 * werden dürfen sie trotzdem nicht, das verhindert das Schema.
 */
export function toSlotViews(records: Record<string, BrandSlotRecord>): Record<string, BrandSlotView> {
  const out: Record<string, BrandSlotView> = {}
  for (const [slotId, record] of Object.entries(records)) out[slotId] = toSlotView(record)
  return out
}

/**
 * Die Brücke zur puren Zustandsmaschine: aus dem VERSIONS-Vertrag wird das
 * schmale Faktenpaar, mit dem `resolveBrandJourney`/`stepProgress` rechnen.
 *
 * `hasValue` = es liegt ein Entwurf vor (der Balken bewegt sich schon),
 * `confirmed` = der Mensch hat zugestimmt (erst das schliesst einen Baustein
 * ab). Genau diese zwei Fragen trennt `stepProgress` bewusst.
 *
 * `hasValue` folgt der ANZEIGE-Rangfolge (`brandSlotDisplayValue`:
 * latestDraft ?? firstDraft ?? confirmed) — nicht „gab es je einen Entwurf".
 * Ein GELEERTES Feld (latestDraft `''`) zählte sonst über den
 * firstDraft-Fallback weiter als gefüllt, und der Gesamtfortschritt zeigte je
 * Seite verschiedene Zahlen: die Journey (Server) sagte 20/59, die
 * Live-Rechnung des offenen Bausteins (Client, aus dem Sichtbaren) 19/59 —
 * live erwischt 2026-09-03 an `b.mission` (firstDraft 1 Zeichen,
 * latestDraft geleert).
 */
export function toSlotFacts(records: Record<string, BrandSlotRecord>): Record<string, BrandSlotStateFacts> {
  const facts: Record<string, BrandSlotStateFacts> = {}
  for (const [slotId, record] of Object.entries(records)) {
    const displayed = record.latestDraft ?? record.firstDraft ?? record.confirmed ?? ''
    facts[slotId] = {
      hasValue: displayed.length > 0,
      confirmed: brandSlotRecordConfirmed(record),
      /**
       * DER WERT REIST SEIT PAKET 3b MIT — und zwar in der SERVER-Rangfolge
       * (`brandSlotStoredValue`: bestätigt schlägt Entwurf), nicht in der
       * Anzeige-Rangfolge daneben. Er muss es: `computeSourcesHash` rechnet
       * über genau diesen Wert, und ein Leser ohne Wert bekäme für jede
       * bestätigte Session einen anderen Hash als der Schreiber — jedes Feld
       * stünde nach dem ersten Deploy auf `stale`.
       *
       * DIE INVARIANTEN SIND DAMIT NICHT SCHARF (Paket-1-Befund a): sie laufen
       * ausschliesslich in `transitionBrandStep(…, 'confirmSlot')`, und diese
       * Handlung ruft heute KEINE Route — bestätigt wird im Autosave-PATCH, der
       * den Wert direkt schreibt. Wer `confirmSlot` verdrahtet, schaltet damit
       * auch `c.final count 3–5` scharf und muss vorher prüfen, dass der
       * Chips-Editor Listen als `- eintrag`-Zeilen speichert (heute tut er das
       * nicht: die Antwort geht als getippter Fliesstext in den Slot).
       */
      value: brandSlotStoredValue(record),
      ...(record.sourcesHash ? { sourcesHash: record.sourcesHash } : {}),
      ...(record.accepted ? { accepted: true } : {}),
      ...(record.deferred ? { deferred: true } : {}),
    }
  }
  return facts
}

/**
 * DER GESTEMPELTE QUELLEN-HASH einer Session (§9) — sha256 über die kanonische
 * Zeichenkette aus `shared/brandSessions.ts`, genau wie der `inputHash` einer
 * Generation (`brandGenerationInputHash`). `node:crypto` bleibt dabei auf der
 * Serverseite: die Zeichenkette gehört `shared/`, das Hashen nicht.
 */
export function brandSourcesHash(
  config: BrandSlot,
  slotFacts: Readonly<Record<string, BrandSlotStateFacts | undefined>>,
): string {
  return createHash('sha256').update(computeSourcesHash(config, slotFacts)).digest('hex')
}

/**
 * DER SESSION-ZUSTAND AUF DER SERVERSEITE — dieselbe pure Regel, aber mit dem
 * Stempler, der die Werte auch GESCHRIEBEN hat.
 *
 * ── DIESER WRAPPER IST DIE SICHERUNG, NICHT DIE BEQUEMLICHKEIT ───────────
 * `resolveSessionStates` vergleicht den GESPEICHERTEN `sourcesHash` mit einem
 * frisch gerechneten. Gespeichert wird sha256 (`brandSourcesHash`), gerechnet
 * würde ohne Zutun die kanonische Zeichenkette — der Vergleich schlüge dann
 * IMMER fehl und jede bestätigte Session stünde auf `stale`. Genau das ist
 * eine Sicherung, die in die Schnittstelle gehört und nicht in die Disziplin:
 * jede Route ruft diesen Wrapper, keine ruft die pure Regel mit Vorgabe.
 */
export function resolveBrandSessionStates(
  profile: BrandProfileFacts,
  stepFacts: readonly BrandStepFacts[],
): Readonly<Record<string, BrandSessionState>> {
  return resolveSessionStates(profile, stepFacts, brandSourcesHash)
}

/**
 * ALLE SLOT-STÄNDE EINES BRANDINGS, QUER ÜBER DIE NEUN BAUSTEIN-ZEILEN (P3.1).
 *
 * ── WOZU ──────────────────────────────────────────────────────────────────
 * Die Registry lässt einen Slot ausdrücklich von Slots ANDERER Bausteine
 * abhängen (`b.purpose` ← `a.pitch`, `c.candidates` ← `a.origin` …). Die
 * Generate-Route las bis P3.1 nur die Zeile ihres eigenen Bausteins — jede
 * fremde Abhängigkeit kam damit leer bei George an, der inputHash war blind für
 * sie, und das Bereitschafts-Gate bildete diese Grenze ehrlich mit ab.
 *
 * ── ES KOSTET KEINE EINZIGE ZUSÄTZLICHE ABFRAGE ───────────────────────────
 * Und das ist der Grund, warum diese Funktion Zeilen entgegennimmt statt selbst
 * zu laden: `loadBrandStepContext` holt für die Journey ohnehin ALLE Zeilen mit
 * EINEM `listRows` (`loadStepRows`, Limit 9). Ein „Fremd-Step-Lader" mit
 * Request-Cache wäre eine zweite Ladewegs-Wahrheit neben einer Liste, die schon
 * im Speicher liegt — und `b.mission` mit fünf Quellen aus zwei Bausteinen
 * bezahlte sie mit N Rundreisen für Daten, die er längst hat.
 *
 * ── EINE ZEILE TRÄGT NUR DIE SLOTS IHRES EIGENEN BAUSTEINS ────────────────
 * Wessen Zuhause die Registry kennt, wird nur aus der Zeile SEINES Bausteins
 * übernommen; alles andere wäre ein Wettlauf, den die Lese-Reihenfolge
 * entscheidet (ein Slot, der durch einen Kopierfehler in zwei Zeilen steht,
 * hätte sonst zwei Wahrheiten). Slot-Ids, die die Registry NICHT kennt
 * (Altbestand, deaktivierte Ids), werden übernommen wie gelesen — der
 * Migrationsvertrag verlangt, dass sie lesbar bleiben.
 */
export function mergeStepSlotRecords(rows: readonly BrandStepRow[]): Record<string, BrandSlotRecord> {
  const merged: Record<string, BrandSlotRecord> = {}
  for (const row of rows) {
    const rowStepKey = toBrandStepKey(row.stepKey)
    for (const [slotId, record] of Object.entries(parseSlotRecords(row.slots))) {
      const home = slotById(slotId)?.stepId
      if (home && rowStepKey && home !== rowStepKey) continue
      merged[slotId] = record
    }
  }
  return merged
}

export function serializeSlotRecords(records: Record<string, BrandSlotRecord>): string {
  const json = JSON.stringify(records)
  if (json.length > BRAND_STEP_SLOTS_MAX_LENGTH) {
    // Der Deckel steht im Schema-Anhang §2 und wird hier erzwungen, weil er
    // erst NACH dem Zusammenführen entscheidbar ist: jeder einzelne Slot kann
    // unter seinem Limit liegen und die Summe trotzdem darüber.
    throw createError({
      status: 413,
      statusText: 'Step payload too large',
      data: { code: 'slots_too_large' },
    })
  }
  return json
}

/** Generations-METADATEN — Inhalte stehen dort ohnehin nicht (Log-Regel §6). */
export function parseGenerations(raw: string | null | undefined): BrandGenerationsView {
  const empty: BrandGenerationsView = { items: [], count: 0 }
  if (!raw) return empty
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
    const record = parsed as { items?: unknown, count?: unknown }
    return {
      items: Array.isArray(record.items) ? record.items as BrandGenerationsView['items'] : [],
      count: typeof record.count === 'number' ? record.count : 0,
    }
  }
  catch {
    return empty
  }
}

export const BRAND_EMPTY_GENERATIONS = '{"items":[],"count":0}'

// ── Profil ──────────────────────────────────────────────────────────────────

/**
 * DIE WEICHEN-TATSACHEN DES PROFILS, so wie die pure Regel sie erwartet.
 *
 * ── WARUM `betaAccount` EIN PFLICHT-ARGUMENT IST (K1) ────────────────────
 * Seit Schicht 3 hängt eine der Tatsachen NICHT mehr allein an der Zeile: „ist
 * die Ableitung offen?" ist Feld ODER Beta-Konto (§2.8). Die Beta-Zulassung
 * gehört dem KONTO, nicht der Marke — sie kann hier also gar nicht abgelesen
 * werden, und sie hier nachzuschlagen wäre der zweite Leser der Beta-Wahrheit,
 * den §2.17 ausdrücklich verbietet.
 *
 * Ein Vorgabewert `false` wäre bequem und falsch: er verstünde sich als „nein"
 * und würde einem Beta-Konto still die dritte Schicht wegnehmen, ohne dass
 * irgendwo etwas rot wird. Das PFLICHT-Argument zwingt jede Aufrufstelle, die
 * Frage zu beantworten — dieselbe Leitplanke wie beim `scope` von `notify()`
 * (CLAUDE.md, C15): der Typfehler ersetzt hier den Wächter, den es für diese
 * Klasse Fehler sonst nicht gibt.
 *
 * DREI ANTWORTEN KOMMEN VOR:
 *   · `access.betaAccount` — jede Eigentümer-Route (der Wert aus dem Gate).
 *   · ein Wert aus `loadBrandBetaAccounts` — die Betreiber-Liste über FREMDE
 *     Marken (dort zählt der Eigentümer, nicht der Betreiber).
 *   · `false` — Rechnungen, die keine Person haben (Sweeps, Snapshot-Bau,
 *     Prüf-Rechnungen). Jede solche Stelle sagt an Ort und Stelle, warum.
 */
export function profileFacts(row: BrandProfileRow, betaAccount: boolean): BrandProfileFacts {
  return {
    pathKind: row.pathKind === 'relaunch' ? 'relaunch' : 'new',
    relaunchScope: row.relaunchScope === 'refine' || row.relaunchScope === 'recut' ? row.relaunchScope : null,
    hasName: !!row.hasName,
    team: row.team === 'team' ? 'team' : 'solo',
    subBrands: row.subBrands === 'yes' || row.subBrands === 'no' ? row.subBrands : 'unknown',
    namingOpted: row.namingOpted === true,
    // BRAND DESIGN, SCHICHT 2 (Konzept §2.10, Migration brand-022): eine
    // Zeile aus der Zeit davor liest `undefined`, und das ist genau der
    // Default „nicht freigeschaltet". Der Leser läuft bewusst weiter ohne die
    // Spalte — sonst wäre der Code vor der Migration nicht deploybar.
    designUnlockedAt: row.designUnlockedAt ?? null,
    // BRAND BOOK & KIT, SCHICHT 3 (Konzept §2.8, Migration brand-025, K1):
    // Beta-Konto ODER Feld — die pure Regel legt beides zusammen, die Journey
    // bekommt nur ihr ERGEBNIS und nie die Einzelteile. Eine Zeile aus der Zeit
    // vor brand-025 liest `undefined`, und das ist genau der Default „nicht
    // freigeschaltet" (fail-soft; der Code muss vor der Migration deploybar
    // bleiben, D1-Lehre).
    derivationUnlocked: resolveDerivationAccess({
      betaAccount,
      unlockedAt: row.derivationUnlockedAt,
      via: row.derivationUnlockedVia,
    }).unlocked,
  }
}

/**
 * Die Startkarte einer Zeile — EINE Stelle, an der aus `undefined` ein ''
 * wird. Ohne sie stünde in Georges Prompt für eine Bestands-Zeile das Wort
 * „undefined", und das ist die einzige Auskunft, die schlimmer ist als keine.
 */
export function profileStartCard(row: BrandProfileRow): BrandStartCard {
  return {
    websiteUrl: row.websiteUrl ?? '',
    industry: row.industry ?? '',
    about: row.about ?? '',
    audience: row.audience ?? '',
  }
}

/**
 * DER GELESENE WEBSITE-TEXT — die EINE Stelle, an der aus `undefined` ein ''
 * wird (dieselbe Rolle wie `profileStartCard`, und aus demselben Grund: eine
 * MEDIUMTEXT-Spalte ohne Default liest sich auf Bestands-Zeilen als
 * `undefined`, und „undefined" in Georges Prompt wäre schlimmer als nichts).
 *
 * Er geht NIE nach draussen — nur in `BrandGeneratorContext.siteAnalysis`.
 */
export function profileSiteAnalysisText(row: BrandProfileRow): string {
  return row.siteAnalysis ?? ''
}

/** Die Metadaten des Zwischenspeichers für die Antwort — ohne den Text selbst. */
export function profileSiteAnalysis(row: BrandProfileRow): BrandSiteAnalysisView {
  const url = row.siteAnalysisUrl ?? ''
  return {
    url,
    analyzedAt: row.siteAnalyzedAt ?? '',
    textLength: profileSiteAnalysisText(row).length,
    stale: siteAnalysisIsStale(url, row.websiteUrl ?? ''),
  }
}

export function toProfileSummary(
  row: BrandProfileRow,
  hasActiveShare: boolean,
  betaAccount: boolean,
): BrandProfileSummary {
  const facts = profileFacts(row, betaAccount)
  return {
    id: row.$id,
    title: row.title ?? '',
    contentLocale: row.contentLocale,
    ownerType: row.ownerType === 'community' ? 'community' : 'user',
    ownerId: row.ownerId,
    pathKind: facts.pathKind,
    relaunchScope: facts.relaunchScope ?? null,
    hasName: facts.hasName,
    namingOpted: facts.namingOpted === true,
    team: facts.team,
    subBrands: facts.subBrands,
    startCard: profileStartCard(row),
    siteAnalysis: profileSiteAnalysis(row),
    progressPct: row.progressPct ?? 0,
    currentStepKey: row.currentStepKey ?? '',
    lastActivityAt: row.lastActivityAt,
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
    hasActiveShare,
    // Der ZEITPUNKT, nicht bloss ein Ja/Nein (Brand Design D1): das Rail und
    // Kapitel 10 sagen „freigeschaltet am …", und ein Boolean könnte das nicht
    // — es hätte ein zweites Feld daneben verlangt, das dasselbe noch einmal
    // behauptet. Wer nur die Frage stellt, fragt `Boolean(...)`.
    designUnlockedAt: facts.designUnlockedAt ?? null,
    /**
     * DIE ABLEITUNG ALS JA/NEIN, anders als die Zeile darüber (K1, §2.8): sie
     * hat DREI Quellen, und nur zwei davon sind Spalten dieser Zeile. Ein
     * Zeitstempel hier wäre die halbe Wahrheit — er fehlte ausgerechnet dem
     * Beta-Konto, das gar keinen hat. Wer das DATUM braucht (Betreiber-Liste),
     * liest die Spalte; wer die FRAGE stellt, liest dieses Feld.
     */
    derivationUnlocked: facts.derivationUnlocked === true,
  }
}

/**
 * Die Brand Story mit ihren Metadaten. `storyMeta` ist eine kleine JSON-Spalte
 * ({ inputHash, generatedAt, editedByUser }); kaputtes JSON ergibt die leere
 * Form, weil eine unlesbare Nebenangabe die Story selbst nicht kosten darf.
 *
 * VERALTET ist ABGELEITET und wird deshalb NICHT hier entschieden: die Frage
 * lautet „passt `inputHash` noch zum heutigen Slot-Stand?", und die kann erst
 * beantworten, wer die Slots kennt (Schema-Anhang §2 — kein `stale`-Flag).
 */
export function toStoryView(row: BrandProfileRow): BrandStoryView {
  const fallback: BrandStoryView = {
    body: row.storyBody ?? '',
    generatedAt: null,
    editedByUser: false,
    inputHash: '',
  }
  if (!row.storyMeta) return fallback
  try {
    const parsed: unknown = JSON.parse(row.storyMeta)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    const meta = parsed as { inputHash?: unknown, generatedAt?: unknown, editedByUser?: unknown }
    return {
      body: fallback.body,
      generatedAt: typeof meta.generatedAt === 'string' ? meta.generatedAt : null,
      editedByUser: meta.editedByUser === true,
      inputHash: typeof meta.inputHash === 'string' ? meta.inputHash : '',
    }
  }
  catch {
    return fallback
  }
}

/**
 * Profil laden UND den Besitz belegen — in dieser Reihenfolge, an EINER Stelle.
 * Eine fehlende Zeile und eine fremde Zeile antworten identisch (404): ein
 * Unterschied wäre die Bestätigung, dass es die Id gibt.
 */
export async function loadOwnedProfile(
  event: H3Event,
  userId: string,
  profileId: string,
): Promise<BrandProfileRow> {
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandProfileRow
  try {
    row = await tablesDB.getRow<BrandProfileRow>({
      databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw toH3Error(error, 'Brand profile could not be loaded')
  }
  assertBrandOwnerAccess(event, row, userId)
  return row
}

/**
 * DIE BRANDINGS EINES KONTOS — nur ihre Ids.
 *
 * Ergänzt für den Vertrag zum market-Layer (MV1 M1): dessen GDPR-Contributor
 * und seine Kaskade müssen wissen, welche `profileId`s einem Konto gehören,
 * ohne `brand_profiles` selbst abzufragen. Eine fremde Tabelle direkt zu
 * lesen wäre genau die implizite Kopplung, die CONCEPT A14 verbietet — und
 * die zweite Wahrheit über Besitz, sobald die Regel hier sich ändert.
 *
 * Nur `ownerType: 'user'`: der community-Zweig ist in Phase 1 tot geschaltet
 * (`assertBrandOwnerAccess`), und ein Konto ist nicht Eigentümer eines
 * Community-Brandings. Fehlt die Tabelle (Instanz ohne brand-Migration),
 * gibt es nichts — ein GDPR-Lauf darf daran nicht scheitern.
 */
export async function listOwnedBrandProfileIds(event: H3Event, userId: string): Promise<string[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const rows = await listAllRows<BrandProfileRow>(tablesDB, databaseId, BRAND_PROFILES_TABLE, [
      Query.equal('ownerType', 'user'),
      Query.equal('ownerId', userId),
    ])
    return rows.map(row => row.$id)
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw error
  }
}

/** Ein Branding des Kontos, so wie eine AUSWAHLLISTE es braucht (MV1 M4). */
export interface BrandOwnedProfileHit {
  id: string
  title: string
  /** Die Branche aus der Startkarte — Zweitzeile im Wähler, sonst leer. */
  industry: string
}

/**
 * DIE BRANDINGS EINES KONTOS MIT TITEL UND BRANCHE.
 *
 * ── WARUM NEBEN `listOwnedBrandProfileIds` ────────────────────────────────
 * Die Funktion darüber liefert bewusst nur Ids: ihr Aufrufer ist der
 * GDPR-Contributor, und der braucht keine Beschriftung. Der Quellen-Wähler
 * des Marktvergleichs (§7.2 Nr. 2) braucht genau die: eine Auswahlliste aus
 * Ids ist keine. Sie um zwei Felder zu ERWEITERN hiesse, dem Löschpfad Daten
 * mitzugeben, die er nicht braucht — zwei Fragen, zwei Antworten.
 *
 * `ownerType: 'user'` wie dort: der community-Zweig ist in Phase 1 tot
 * geschaltet. Fehlt die Tabelle, gibt es nichts.
 */
export async function listBrandProfilesForOwner(
  event: H3Event,
  userId: string,
): Promise<BrandOwnedProfileHit[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const rows = await listAllRows<BrandProfileRow>(tablesDB, databaseId, BRAND_PROFILES_TABLE, [
      Query.equal('ownerType', 'user'),
      Query.equal('ownerId', userId),
      Query.orderDesc('lastActivityAt'),
    ])
    return rows.map(row => ({
      id: row.$id,
      title: row.title ?? '',
      industry: row.industry ?? '',
    }))
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw error
  }
}

/** Die Profil-Id aus dem Pfad — vorhanden und plausibel, sonst 404. */
export function requireProfileIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!id || id.length > 64) throw createError({ status: 404, statusText: 'Not Found' })
  return id
}

// ── Bausteine ───────────────────────────────────────────────────────────────

export async function loadStepRows(event: H3Event, profileId: string): Promise<BrandStepRow[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandStepRow>({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      // Neun Bausteine, mehr kann es nicht geben — das Limit steht trotzdem
      // explizit da (Repo-Regel: nie das Default-25 erben).
      queries: [Query.equal('profileId', profileId), Query.limit(BRAND_STEP_KEYS.length)],
    })
    return res.rows
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw toH3Error(error, 'Brand steps could not be loaded')
  }
}

/** Erst die abgeleitete Id, dann die Abfrage (s. Kopf). `null` = gibt es nicht. */
export async function loadStepRow(
  event: H3Event,
  profileId: string,
  stepKey: BrandStepKey,
): Promise<BrandStepRow | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<BrandStepRow>({
      databaseId, tableId: BRAND_STEPS_TABLE, rowId: brandStepRowId(profileId, stepKey),
    })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand step could not be loaded')
  }
  const rows = await loadStepRows(event, profileId)
  return rows.find(row => row.stepKey === stepKey) ?? null
}

/** Die gelesenen Zeilen als Fakten für `resolveBrandJourney`. */
export function toStepFacts(rows: readonly BrandStepRow[]): BrandStepFacts[] {
  const facts: BrandStepFacts[] = []
  for (const row of rows) {
    const stepKey = toBrandStepKey(row.stepKey)
    if (!stepKey) continue
    facts.push({
      stepKey,
      state: row.state,
      confidence: row.confidence ?? null,
      slots: toSlotFacts(parseSlotRecords(row.slots)),
    })
  }
  return facts
}

export function toStepSummary(row: BrandStepRow, stepKey: BrandStepKey): BrandStepSummary {
  return {
    stepKey,
    storedState: row.state,
    revision: row.revision ?? 0,
    confidence: row.confidence ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    activeSeconds: row.activeSeconds ?? 0,
  }
}

/**
 * DER GEMEINSAME EINSTIEG DER DREI BAUSTEIN-ROUTEN (lesen, speichern,
 * abschliessen): Profil laden, Besitz belegen, Baustein-Schlüssel prüfen,
 * Journey rechnen, Eintritt entscheiden — in dieser Reihenfolge und EINMAL.
 *
 * Stünde diese Kette in jeder Route, wäre sie dreimal da und irgendwann
 * zweimal richtig. Die Reihenfolge ist dabei nicht kosmetisch: der Besitz wird
 * belegt, BEVOR überhaupt eine Baustein-Zeile gelesen wird, und der Eintritt
 * entschieden, bevor irgendetwas wirkt.
 *
 * ABGEWIESEN WIRD MIT 403 UND EINEM `code` — nicht mit 404: dass es dieses
 * Profil gibt, weiss der Aufrufer an dieser Stelle bereits (es gehört ihm), es
 * gibt also nichts mehr zu verbergen. Verborgen bleibt nur, was NICHT ihm
 * gehört, und das hat `assertBrandOwnerAccess` schon eine Zeile vorher mit 404
 * beantwortet.
 */
export interface BrandStepContext {
  profile: BrandProfileRow
  stepKey: BrandStepKey
  stepRow: BrandStepRow
  stepRows: BrandStepRow[]
  journey: readonly BrandJourneyStep[]
  /**
   * DIE BETA-TATSACHE DES AUFRUFERS (K1) — sie reist im Kontext mit, damit
   * jede Rechnung DAHINTER (Abnahme, Session-Zustände, ein zweites
   * `resolveBrandJourney`) dieselbe Antwort auf „ist die Ableitung offen?"
   * bekommt wie der Eintritts-Beschluss davor. Ohne sie müsste jede dieser
   * Rechnungen sie erneut anfordern — und die erste, die es vergisst, sperrt
   * einem Beta-Konto still die dritte Schicht.
   */
  betaAccount: boolean
}

export async function loadBrandStepContext(
  event: H3Event,
  userId: string,
  betaAccount: boolean,
): Promise<BrandStepContext> {
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const stepKey = toBrandStepKey(getRouterParam(event, 'stepKey'))
  if (!stepKey) throw createError({ status: 404, statusText: 'Not Found' })

  const stepRows = await loadStepRows(event, profileId)
  const journey = resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(stepRows))

  const entry = canEnterBrandStep(journey, stepKey)
  if (!entry.allowed) {
    throw createError({
      status: 403,
      statusText: 'Brand step is not available',
      data: { code: entry.reason ?? 'locked' },
    })
  }

  const stepRow = stepRows.find(row => row.stepKey === stepKey)
  // Kein `createRow`-Nachzügler hier: die neun Zeilen entstehen bei der Anlage
  // (index.post.ts). Fehlt eine, ist die Zeile verlorengegangen — das ist ein
  // Datenfehler und keine Gelegenheit, still eine neue anzulegen und damit den
  // Verlust zu verdecken.
  if (!stepRow) throw createError({ status: 404, statusText: 'Not Found' })

  return { profile, stepKey, stepRow, stepRows, journey, betaAccount }
}

// ── Fortschritt am Profil (DENORM-Cache) ────────────────────────────────────

export interface BrandProfileProgress {
  progressPct: number
  currentStepKey: string
}

/**
 * DER CACHE FÜR DIE KARTEN, aus der Journey gerechnet — nie aus dem Client.
 *
 * Gezählt wird über ALLE Bausteine, die auf dem Weg liegen: übersprungene
 * zählen weder oben noch unten (sonst könnte ein Profil mit abgewähltem Naming
 * nie 100 % erreichen). „Gerade dran" ist der erste aktive Baustein, sonst der
 * erste offene — steht nichts mehr offen, bleibt der letzte auf dem Weg.
 */
export function resolveProfileProgress(journey: readonly BrandJourneyStep[]): BrandProfileProgress {
  let total = 0
  let filled = 0
  let current = ''
  let lastOnPath = ''

  for (const step of journey) {
    if (step.state === 'skipped') continue
    // BRAND DESIGN ZÄHLT HIER NICHT MIT — ENTSCHIEDEN (D1), NICHT VERTAGT.
    //
    // Der Cache füttert die Marken-Karte und die Zeile „Schritt 3 von 9" —
    // beides Aussagen über die FOUNDATION. Zählte Schicht 2 mit, fiele der
    // Prozentwert jedes fertigen Brandings im Deploy-Moment von 100 auf rund
    // 70, ohne dass sich an der Marke etwas geändert hätte, und
    // `currentStepKey` rutschte hinter `result` — womit der „Euer
    // Branding"-Einstieg auf `/dashboard/brands` lautlos aufginge (Audit C4).
    //
    // Schicht 2 hat ihren EIGENEN Fortschritt, und zwar dort, wo sie stattfindet:
    // im Rail-Fuss der Werkstatt („Brand Design 0/6", Prototyp Screen 8). Zwei
    // Zahlen für zwei Produkte sind ehrlicher als eine gemischte, die weder die
    // Foundation noch das Design beschreibt — und die Marken-Karte bleibt die
    // Karte der Foundation.
    if (isBrandDesignStep(step.stepKey)) continue
    // UND SCHICHT 3 GENAUSO WENIG (K0, dieselbe Begründung). Ohne
    // Freischaltung stehen ihre Kapitel ohnehin auf `skipped` und fielen schon
    // oben heraus; die Klemme hier gilt dem Tag DANACH: eine freigeschaltete
    // Marke soll nicht im Freischalt-Moment von 100 % auf 80 % fallen, ohne
    // dass sich an ihrer Foundation etwas geändert hätte.
    if (isBrandKitStep(step.stepKey)) continue
    lastOnPath = step.stepKey
    total += step.progress.requiredTotal
    filled += step.progress.requiredFilled
    if (!current && (step.state === 'active' || step.state === 'open')) current = step.stepKey
  }

  return {
    progressPct: total === 0 ? 100 : Math.round((filled / total) * 100),
    currentStepKey: current || lastOnPath,
  }
}

/**
 * Profil-Kopf nachziehen. FAIL-SOFT ist hier bewusst NICHT die Regel: der Cache
 * ist zwar nie Autorität, aber ein Autosave, dessen Karte danach falsch steht,
 * sieht für den Menschen wie Datenverlust aus. Wirft also weiter.
 */
export async function touchProfile(
  event: H3Event,
  profileId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  await tablesDB.updateRow({
    databaseId,
    tableId: BRAND_PROFILES_TABLE,
    rowId: profileId,
    data: { ...data, lastActivityAt: new Date().toISOString() },
  })
}

// ── Veröffentlichungen ──────────────────────────────────────────────────────

/**
 * „Geteilt" ist ABGELEITET (Audit 5/6): eine Zeile ohne `revokedAt`, deren
 * `expiresAt` in der Zukunft liegt. Es gibt bewusst kein `visibility`-Feld, das
 * damit auseinanderlaufen könnte.
 */
export async function listActiveShares(event: H3Event, profileId: string): Promise<BrandShareRow[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandShareRow>({
      databaseId,
      tableId: BRAND_SHARES_TABLE,
      queries: [
        Query.equal('profileId', profileId),
        Query.isNull('revokedAt'),
        Query.greaterThan('expiresAt', new Date().toISOString()),
        Query.limit(25),
      ],
    })
    return res.rows
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw toH3Error(error, 'Brand shares could not be loaded')
  }
}

/**
 * `hasActiveShare` für VIELE Profile in EINER Abfrage — die Liste „Meine
 * Brandings" darf nicht je Karte eine Frage stellen (N+1). Leere Eingabe ⇒
 * leere Antwort ohne Roundtrip.
 */
export async function activeShareProfileIds(
  event: H3Event,
  profileIds: readonly string[],
): Promise<Set<string>> {
  if (!profileIds.length) return new Set()
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandShareRow>({
      databaseId,
      tableId: BRAND_SHARES_TABLE,
      queries: [
        Query.equal('profileId', [...profileIds]),
        Query.isNull('revokedAt'),
        Query.greaterThan('expiresAt', new Date().toISOString()),
        Query.limit(100),
      ],
    })
    return new Set(res.rows.map(row => row.profileId))
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return new Set()
    // Eine unbeantwortbare Nebenfrage darf die Liste nicht kosten: „geteilt"
    // ist eine ANZEIGE, kein Recht. Fail-soft, aber sichtbar im Log.
    logEvent('warn', 'brand.active_shares_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return new Set()
  }
}

/** Nur die BESTÄTIGTEN Werte eines Bausteins — Entwürfe gehören nie in einen Snapshot. */
export function confirmedSlotValues(row: BrandStepRow): { slotId: string, value: string }[] {
  const records = parseSlotRecords(row.slots)
  const out: { slotId: string, value: string }[] = []
  for (const slot of Object.keys(records)) {
    const confirmed = records[slot]?.confirmed
    if (typeof confirmed === 'string' && confirmed.length > 0) out.push({ slotId: slot, value: confirmed })
  }
  // Registry-Reihenfolge statt Objekt-Reihenfolge: ein Kapitel soll überall
  // gleich aussehen, auch wenn die Slots in anderer Folge gefüllt wurden.
  return out.sort((a, b) => slotOrder(a.slotId) - slotOrder(b.slotId))
}

/**
 * Die Katalog-Reihenfolge — EINMAL aus der Registry gebaut, nicht als zweite
 * Liste gepflegt. `BRAND_SLOTS` ist bereits in Baustein- und Katalog-Ordnung
 * (Kopf von `slotRegistry.ts`), der Index daraus ist also genau die Ordnung,
 * in der ein Kapitel gelesen werden soll. Unbekannte Ids (Bestandsdaten eines
 * älteren Katalogs) wandern ans Ende, statt zu verschwinden.
 */
const BRAND_SLOT_ORDER = new Map<string, number>(
  BRAND_SLOTS.map((slot, index) => [slot.id, index]),
)

function slotOrder(slotId: string): number {
  return BRAND_SLOT_ORDER.get(slotId) ?? Number.MAX_SAFE_INTEGER
}
