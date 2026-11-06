/**
 * DIE ANTWORT-TYPEN VON `/api/brand/**` — an BEIDEN Enden verlangt.
 *
 * Nitros Routen-Typisierung ist im Repo AUS (CLAUDE.md, TS2589-Strukturfix):
 * `$fetch('/api/brand/…')` liefert `unknown`. Jede Route annotiert deshalb
 * ihren Rückgabetyp aus dieser Datei, und jede Aufrufstelle nennt ihn erneut
 * (`$fetch<BrandProfileListResponse>(…)`). Diese Datei ist der Ort, an dem
 * beide Enden sich treffen — sie ist PURE (keine Appwrite-Typen, kein H3), weil
 * sie im Browser genauso gelesen wird wie im Server.
 *
 * DIE SPEICHERFORM STEHT NICHT HIER. `brand_steps.slots` ist eine
 * MEDIUMTEXT-JSON-Spalte; ihr Inhalt reist als `BrandSlotView` nach draußen —
 * dieselben Felder, aber als GELESENE Form: der Server normalisiert (fehlende
 * Felder werden `null`, unbekannte Slot-Ids fliegen raus), damit der Client nie
 * raten muss, ob ein Feld fehlt oder leer ist.
 *
 * WAS BEWUSST NICHT NACH DRAUSSEN GEHT: Generations-INHALTE (nur Metadaten,
 * Schema-Anhang §2), rohe Share-Token (genau EINMAL, in der Antwort des
 * Veröffentlichens) und der Grund einer Zugangs-Ablehnung (die Routen
 * antworten 404 — Datentür).
 */

import type { BrandDerivationGrant } from '../brandDerivation'
import type { BrandFoundationView } from '../brandFoundation'
import type { BrandGenerationOutcome } from '../brandGeneration'
import type { BrandInspirationEntry } from '../brandInspiration'
import type { BrandMarkDraftEntry } from '../brandMarkDrafts'
import type { BrandReadingState } from '../brandReading'
import type { BrandPublicationBlocker, BrandPublicationViewStatus } from '../brandPublication'
import type { BrandWaitlistStatus } from '../brandWaitlistAdmin'
import type {
  BrandFinding,
  BrandFindingKind,
  BrandFindingStatus,
  BrandReviewStage,
} from '../brandFindings'
import type {
  BrandAcceptanceBlocker,
  BrandConfidence,
  BrandJourneyStep,
  BrandNextSessionRef,
  BrandSessionState,
  BrandStepAcceptance,
  BrandStepState,
  BrandStoredStepState,
} from '../brandJourney'
import type {
  BrandPathKind,
  BrandSessionEffort,
  BrandSessionKind,
  BrandSessionSensitivity,
  BrandStepKey,
  BrandStepProgress,
} from '../slotRegistry'

/** Wem ein Profil gehört (Phase 1 aktiviert nur `user`). */
export type BrandOwnerTypeValue = 'user' | 'community'

/** Die Weiche W4 — `unknown` ist ein echter Zustand, kein fehlender Wert. */
export type BrandSubBrands = 'unknown' | 'yes' | 'no'

/** Die Weiche W3 — deklariert neben `BrandPathKind` in der Registry (s. dort). */
export type { BrandTeamKind } from '../slotRegistry'

/** Rebrand-Verzweigung; `null` auf dem Gründer-Pfad. */
export type BrandRelaunchScope = 'refine' | 'recut'

/**
 * DIE STARTKARTE (Content-Spec §2.1) — die vier Angaben aus Schritt 0, und
 * ausdrücklich nicht mehr („Mehr erhebt Schritt 0 NICHT").
 *
 * Sie ist KEIN Slot: sie steht am Profil (`brand_profiles`, Migration
 * brand-009), nicht in `brand_steps.slots`. Genau deshalb haben die Slots des
 * Bausteins A in der Registry keine `dependencies` — sie schöpfen aus dieser
 * Karte, und die reist über den Generator-Vertrag mit, nicht über die
 * Abhängigkeitsliste.
 *
 * ALLE VIER FELDER SIND ZEICHENKETTEN, NIE `null` oder `undefined`: '' heisst
 * „nicht beantwortet". Eine Bestands-Zeile von vor brand-009 liest genau das,
 * und ein Leser muss nicht zwischen drei Arten von „leer" unterscheiden.
 */
export interface BrandStartCard {
  /** Optional (§2.1) — leer oder eine http(s)-Adresse. */
  websiteUrl: string
  industry: string
  /** „Was ihr macht" — zwei bis drei Sätze. */
  about: string
  /** „Für wen" — ein Satz. */
  audience: string
}

/**
 * WAS VON DER URL-ANALYSE NACH DRAUSSEN GEHT (P2.3) — drei Angaben ÜBER den
 * Fund, nie der Fund selbst.
 *
 * Der gelesene Text bleibt am Server (`brand_profiles.siteAnalysis`): der
 * Client braucht ihn nicht — er zeigt „gelesen am …" und einen Knopf. Ihn
 * mitzuschicken hiesse, 20.000 Zeichen fremden Text in jede Profil-Antwort zu
 * legen, samt allem, was auf dieser fremden Seite stand.
 *
 * `analyzedAt` ist '' , solange nie gelesen wurde — dieselbe Konvention wie in
 * der Startkarte: '' heisst „nicht beantwortet", nicht `null`.
 */
export interface BrandSiteAnalysisView {
  /** Welche Adresse der Zwischenspeicher beschreibt ('' = keiner da). */
  url: string
  /** ISO-Zeitpunkt des Lesens, '' = nie. */
  analyzedAt: string
  /** Wie viel Text dabei herauskam — die einzige Auskunft über den Umfang. */
  textLength: number
  /** Die Startkarte nennt heute eine ANDERE Adresse (`siteAnalysisIsStale`). */
  stale: boolean
}

/**
 * Der KOPF eines Brandings, so wie ihn Liste und Detailseite brauchen.
 * `progressPct`/`currentStepKey` sind DENORM-Cache (Schema-Anhang §1) — die
 * Autorität sind die Slots, und die Journey rechnet sie im Detail neu.
 */
export interface BrandProfileSummary {
  id: string
  title: string
  contentLocale: string
  ownerType: BrandOwnerTypeValue
  ownerId: string
  pathKind: BrandPathKind
  relaunchScope: BrandRelaunchScope | null
  hasName: boolean
  namingOpted: boolean
  team: BrandTeamKind
  subBrands: BrandSubBrands
  /** Schritt 0 (§2.1). Owner-Daten — der öffentliche Share-Blick sieht sie nie. */
  startCard: BrandStartCard
  /** Stand der URL-Analyse (P2.3) — Metadaten, nie der gelesene Text. */
  siteAnalysis: BrandSiteAnalysisView
  progressPct: number
  currentStepKey: string
  lastActivityAt: string
  createdAt: string
  updatedAt: string
  /** Abgeleitet aus `brand_shares` — es gibt bewusst kein `visibility`-Feld. */
  hasActiveShare: boolean
  /**
   * SEIT WANN BRAND DESIGN FÜR DIESE MARKE OFFEN IST (Konzept §2.10, D1) —
   * `null` heisst gesperrt. Der ZEITPUNKT und kein Ja/Nein: Rail und Kapitel
   * 10 sagen „freigeschaltet am …", und wer nur die Frage stellt, fragt
   * `Boolean(...)`. Es ist nur die HÄLFTE der Bedingung: die Journey öffnet
   * Schicht 2 erst, wenn zusätzlich `result` abgeschlossen ist — wer wissen
   * will, ob ein Kapitel betretbar ist, fragt sie und nicht dieses Feld.
   */
  designUnlockedAt: string | null
  /**
   * IST DIE ABLEITUNG FÜR DIESE MARKE OFFEN? (Konzept
   * docs/plans/BRAND-BOOK-KIT.md §2.8, Paket K1) — Brand Book & Kit UND der
   * Marktvergleich hängen daran.
   *
   * EIN JA/NEIN und kein Zeitstempel, anders als bei `designUnlockedAt`: die
   * Freischaltung hat drei Quellen (Beta-Konto, Betreiber-Knopf, ab BS1 Z1 der
   * Stripe-Webhook), und nur zwei davon schreiben ein Datum. Was hier steht,
   * ist das ERGEBNIS der puren Regel `resolveDerivationAccess` — nie eine
   * ihrer Zutaten.
   *
   * Es ist wie beim Design nur die HÄLFTE der Bedingung: ob ein Kapitel der
   * dritten Schicht betretbar ist, sagt die Journey (dort muss zusätzlich
   * `result` abgeschlossen sein), nicht dieses Feld.
   */
  derivationUnlocked: boolean
}

export interface BrandProfileListResponse {
  profiles: BrandProfileSummary[]
}

/** Die Brand Story am Profil. `stale` ist ABGELEITET, kein gespeichertes Flag. */
export interface BrandStoryView {
  body: string
  generatedAt: string | null
  editedByUser: boolean
  inputHash: string
}

/** Kurzform einer `brand_steps`-Zeile für die Detailantwort. */
export interface BrandStepSummary {
  stepKey: BrandStepKey
  /** Der GESPEICHERTE Zustand. Was gilt, sagt `journey` (dort auch `skipped`). */
  storedState: BrandStoredStepState
  revision: number
  confidence: BrandConfidence | null
  startedAt: string | null
  completedAt: string | null
  activeSeconds: number
}

export interface BrandProfileDetailResponse {
  profile: BrandProfileSummary
  story: BrandStoryView
  /** Die Zustandsmaschine, serverseitig gerechnet (`resolveBrandJourney`). */
  journey: BrandJourneyStep[]
  steps: BrandStepSummary[]
}

/**
 * Nach einer WEICHEN-Änderung: dieselbe Detail-Antwort plus die Bausteine, die
 * dadurch auf oder vom Weg gehen. Die Oberfläche braucht das, um zu sagen „das
 * Kapitel Naming ist jetzt dabei" — die Daten der abgewählten bleiben liegen
 * (§3e), `deactivated` ist also eine ANSAGE, keine Aufräumliste.
 */
export interface BrandProfilePatchResponse extends BrandProfileDetailResponse {
  activated: BrandStepKey[]
  deactivated: BrandStepKey[]
}

/**
 * Antwort der URL-Analyse (`POST /api/brand/profiles/:id/analyze`).
 *
 * DER VOLLTEXT FEHLT HIER ABSICHTLICH: er ist Georges Material, nicht das des
 * Browsers. Was der Mensch sehen soll, ist der BELEG, dass gelesen wurde —
 * Titel und Beschreibung sagen ihm in einer Zeile, ob die richtige Seite
 * erwischt wurde, und `textLength` sagt, ob überhaupt etwas dranstand.
 */
export interface BrandSiteAnalyzeResponse {
  analyzed: true
  title: string
  description: string
  textLength: number
  analyzedAt: string
}

export interface BrandProfileDeleteResponse {
  deleted: true
  /** Was die Kaskade wirklich entfernt hat — für Log und Beweis. */
  removed: { steps: number, messages: number, shares: number, events: number, findings: number }
}

/**
 * Der VERSIONS-VERTRAG eines Slots (Audit 2): erster Entwurf, letzter Entwurf
 * und die bestätigte Fassung stehen NEBENEINANDER — aus ihnen entstehen die
 * zwei beschlossenen Übernahmequoten. Ein einzelnes draft/final könnte sie
 * nach einer Regeneration nicht mehr rechnen.
 */
export interface BrandSlotView {
  firstDraft: string | null
  latestDraft: string | null
  confirmed: string | null
  confidence: BrandConfidence | null
  updatedAt: string | null
}

/** Metadaten EINER Generierung — nie ihr Inhalt (Log-Regel Plan §6). */
export interface BrandGenerationMeta {
  generationId: string
  /** Für WELCHEN Slot — ohne ihn wäre die Historie eines Bausteins nicht auftrennbar. */
  slotId: string
  schemaVersion: number
  promptVersion: string
  model: string
  provider: string
  locale: string
  inputHash: string
  createdAt: string
  /** §3e-Idempotenzschlüssel des Auslösers, sofern einer mitkam. */
  idempotencyKey?: string
  /**
   * `'question'`, wenn dieser Lauf NACHGEFRAGT statt entworfen hat (george-a-4).
   * Fehlt bei jedem Eintrag von vorher und bei jedem Entwurf — der Leser liest
   * „fehlt" als `'draft'`, sonst hätte ein Bestands-Eintrag rückwirkend eine
   * Aussage, die niemand getroffen hat.
   */
  outcome?: BrandGenerationOutcome
}

/**
 * DER GESPEICHERTE EINTRAG — Metadaten PLUS Entwurf.
 *
 * Der Schema-Anhang §2 listet unter `generations` nur Metadaten; der Anhang sagt
 * an derselben Stelle aber auch, die Historie „bewahrt Zwischenstände", und das
 * können Metadaten nicht leisten: `model` und `inputHash` bringen keine Fassung
 * zurück. Deshalb trägt der Eintrag den erzeugten TEXT — die letzten zehn
 * behalten ihn, ältere fliegen raus (`packBrandGenerations`), und beim
 * Spalten-Deckel werden die ÄLTESTEN Entwürfe zuerst geleert.
 *
 * Das widerspricht der Log-Regel NICHT: die verbietet Inhalt in LOGS und in
 * `brand_events`, nicht in der Zeile, deren Inhalt es ohnehin ist (derselbe Text
 * steht als `latestDraft` im Slot nebenan).
 */
export interface BrandGenerationEntry extends BrandGenerationMeta {
  /** Fehlt bei Einträgen, deren Entwurf dem Spalten-Deckel gewichen ist. */
  draft?: string
}

export interface BrandGenerationsView {
  /** Die letzten ~10 Generierungen — in der Detailantwort OHNE `draft`. */
  items: BrandGenerationEntry[]
  /** Gesamtzahl — auch die, die aus `items` herausgefallen sind. */
  count: number
}

/**
 * Antwort der Fassungs-Wiederherstellung: dieselben Einträge, aber MIT `draft`
 * — plus der `firstDraft` des Slots als „Erste Fassung". Sie hat keinen
 * Generations-Eintrag (sie kann auch vom Menschen stammen) und reist deshalb
 * als eigenes Feld.
 */
export interface BrandGenerationVersionsResponse {
  slotId: string
  items: BrandGenerationEntry[]
  count: number
  firstDraft: string | null
  latestDraft: string | null
}

/**
 * WOHIN DIESES FELD SPÄTER FLIESST (Plan §3a, „mechanisch, ohne Text") — die
 * transitive Hülle aus `sessionsAffectedBy`, auf zwei Zahlen und die Kapitel
 * eingedampft.
 *
 * Die LISTE der berührten Felder steht bewusst NICHT drin: sie wäre bis zu 29
 * Ids lang, der Mensch bekommt „fliesst später in Mission, Manifest und
 * Taglines" zu lesen, und wer die Einzelfelder braucht (der Impact-Hinweis,
 * Paket 6), rechnet dieselbe pure Funktion im Browser.
 */
export interface BrandSessionAffects {
  /** Wie viele bestätigbare Sessions daran hängen — 0 heisst „nichts". */
  count: number
  /** In welchen Kapiteln, in Registry-Reihenfolge. */
  steps: BrandStepKey[]
}

/**
 * DER STAND EINER SESSION, wie ihn die Werkstatt liest (Plan §5).
 *
 * `accepted` und `deferred` sind in Paket 3a IMMER `undefined`: die
 * Abnahme-Seite und das Vertagen sind Paket 3b, und ein hier erfundenes
 * `false` behauptete eine Entscheidung, die niemand getroffen hat. Sie stehen
 * trotzdem schon im Vertrag, damit die Oberfläche (3c) gegen die endgültige
 * Form gebaut wird.
 */
export interface BrandSessionView {
  state: BrandSessionState
  /** Die Arbeitsform (`ask`/`collect`/`choose`/`derive`/`draft`/`instrument`). */
  kind: BrandSessionKind
  /** Was der Mensch vorher über den Umfang erfährt („~3 Min"). */
  effort: BrandSessionEffort
  /** Was per Share-Link und Export standardmässig nicht reist. */
  sensitivity: BrandSessionSensitivity
  affects: BrandSessionAffects
  /**
   * Im Kapitel-Zusammenhang abgenommen (§5a). IMMER gesetzt, auch als `false`:
   * ein fehlendes Feld hiesse für den Leser „unbekannt", und die Abnahme-Seite
   * hat keinen dritten Zustand.
   */
  accepted: boolean
  /** Auf später vertagt (§3a `answers.allowDefer`). Ebenfalls immer gesetzt. */
  deferred: boolean
  /**
   * Der Schliess-Aufruf ist gelaufen (§7). `false` heisst „fail-soft
   * ausgefallen" — der Prüfblick (§10) holt genau diese Sessions nach.
   */
  reviewed: boolean
  /**
   * Die Notizen des Schliess-Aufrufs (§4), als EIN Text mit Zeilenumbrüchen.
   * NUR wo es welche gibt — ein leeres Feld an 67 Sessions wäre Rauschen.
   */
  notes?: string
  /**
   * Was der Spezialist am Ziel vermisst hat (§7). Er reist mit, weil Paket 5
   * ihn im Log zeigt; SPERREN tut er nichts.
   */
  missing?: string[]
  /** Der Fortschritt einer Sammel-Session: Teil-Id → Antwort. */
  collected?: Record<string, string>
}

export interface BrandStepDetailResponse {
  profileId: string
  stepKey: BrandStepKey
  storedState: BrandStoredStepState
  revision: number
  confidence: BrandConfidence | null
  inputHash: string
  startedAt: string | null
  completedAt: string | null
  /** Wann dieses Kapitel zuletzt neu begonnen wurde (brand-013) — `null` = nie. */
  restartedAt: string | null
  activeSeconds: number
  slots: Record<string, BrandSlotView>
  /**
   * Der Session-Zustand ALLER Sessions dieses Kapitels — abgeleitet, keine
   * gespeicherte Spalte (`resolveSessionStates`). Gerechnet wird über die
   * Fakten ALLER Kapitel, weil eine Session über Kapitelgrenzen liest.
   */
  sessions: Record<string, BrandSessionView>
  /**
   * DIE OFFENEN BEFUNDE, an denen ein Feld DIESES Kapitels beteiligt ist (§8).
   *
   * Sie reisen mit der Werkstatt mit, damit Paket 5 nur noch rendert: die
   * Chips im Log und an der Bühne lesen dieselbe Liste, die auch die
   * Abnahme-Seite je Block filtert. Leer, solange nichts gefunden wurde — und
   * ebenso, wenn die Befund-Tabelle gerade nicht lesbar ist (fail-soft).
   */
  findings: BrandFindingView[]
  generations: BrandGenerationsView
  progress: BrandStepProgress
  missingRequired: string[]
  /**
   * BESTÄTIGTE WERTE AUS FREMDEN KAPITELN, die die BÜHNE dieses Kapitels
   * braucht (Paket G4).
   *
   * Der Browser lädt immer nur EIN Kapitel (`slots` trägt genau dessen
   * Sessions). Das Ergebnis-Kapitel rechnet seine drei Richtungs-Vorschläge
   * aber aus den beiden Archetypen, und die wohnen in `archetype` — ohne diese
   * Karte stünde dort entweder gar nichts oder eine zweite Abfrage.
   *
   * ES REIST NUR, WAS EINE BÜHNE NAMENTLICH BRAUCHT (heute: `d.primary` und
   * `d.secondary` für `result`, s. `BRAND_STAGE_SOURCE_SLOTS`) — nicht „alle
   * Abhängigkeiten": eine Antwort, die den halben Wertevorrat mitschickt, wäre
   * ein zweiter Weg an der Datentür vorbei, sobald jemand sie irgendwo anders
   * ausliest. Leer, wo eine Bühne nichts braucht.
   */
  sourceValues: Record<string, string>
}

/** Antwort des Autosave — die NORMALISIERTE Serverfassung, nicht das Echo. */
export interface BrandStepSaveResponse {
  revision: number
  slots: Record<string, BrandSlotView>
}

/**
 * Der Rumpf eines 409 (`error.data.reason === 'revision_conflict'`): die
 * AKTUELLE Serverfassung reist mit, damit die UI „Serverfassung laden" anbieten
 * kann, ohne einen zweiten Abruf zu machen (Autosave-Regel §3e: bei 409 NIE
 * automatisch überschreiben).
 */
export interface BrandStepConflictData {
  code: 'revision_conflict'
  revision: number
  slots: Record<string, BrandSlotView>
}

export interface BrandStepCompleteResponse {
  stepKey: BrandStepKey
  storedState: BrandStoredStepState
  journey: BrandJourneyStep[]
  progressPct: number
  currentStepKey: string
}

/**
 * DIE FINALE ABNAHME EINES KAPITELS (Plan §5a) — was die Seite zeigt, in
 * Registry-Reihenfolge und ohne einen einzigen Text, den die Oberfläche selbst
 * erfinden müsste.
 *
 * ── WARUM SO VIEL IN EINER ANTWORT ───────────────────────────────────────
 * Die Seite stellt je Session DREI Dinge nebeneinander (Bereich · Beispiel ·
 * eigene Eingabe) und darüber einen Zähler. Käme das aus drei Abrufen, zeigte
 * sie beim Blättern drei Stände desselben Kapitels — und die Frage „Passt
 * dieses Kapitel?" hinge an einer Zahl aus einem vierten. Ein Abruf, ein
 * Stand, eine Entscheidung.
 *
 * ── SCHLÜSSEL STATT TEXT, ABER BEISPIELE ALS TEXT ────────────────────────
 * `labelKey`/`questionKey`/`exampleKey` sind i18n-Schlüssel: WIE etwas heisst,
 * entscheiden die Locale-Dateien, nicht der Server. Das `example` dagegen ist
 * INHALT aus der Registry (`sessionContent.ts`, Davids Gate) und steht dort in
 * beiden Sprachen — die Oberfläche wählt, der Server schickt beide, weil er
 * die Anzeigesprache des Browsers nicht besser kennt als der Browser selbst.
 */
export interface BrandAcceptanceExample {
  de: string[]
  en: string[]
}

export interface BrandAcceptanceSessionView {
  slotId: string
  kind: BrandSessionKind
  required: boolean
  state: BrandSessionState
  /** Es gibt einen bestätigten Wert (`confirmed` trägt den Text, nicht ein Flag). */
  confirmed: boolean
  accepted: boolean
  deferred: boolean
  /** Kennt diese Session ein Vertagen? (`answers.allowDefer`) */
  allowDefer: boolean
  /** Der bestätigte Wert, VOLLSTÄNDIG — die Seite kürzt nicht (§5a Schritt 1). */
  value: string
  /** Die Notiz des Schliess-Aufrufs (§4) — plus die Gründe abgelehnter Befunde. */
  notes: string
  /** OFFENE Befunde, an denen dieses Feld beteiligt ist (§8, Chips in Paket 5). */
  findings: BrandFindingView[]
  /** `brand.labels.<id>` — kann fehlen; dann gilt `questionKey` (wie in der Werkstatt). */
  labelKey: string
  /** Die Frage in ihrer Pfad-/Team-Fassung — der Rückfall der Beschriftung. */
  questionKey: string
  /** `brand.example.<id>` — nur bei Menschenfragen, sonst `null`. */
  exampleKey: string | null
  /** Das erfundene Vorbild aus einer FREMDEN Branche, je Sprache. */
  example: BrandAcceptanceExample
  affects: BrandSessionAffects
}

export interface BrandStepAcceptanceResponse {
  stepKey: BrandStepKey
  storedState: BrandStoredStepState
  revision: number
  confidence: BrandConfidence | null
  restartedAt: string | null
  /** Registry-Reihenfolge — die Reihenfolge der Blöcke auf der Seite. */
  sessions: BrandAcceptanceSessionView[]
  acceptance: BrandStepAcceptance
}

/** Antwort von „Abnehmen" und „Vertagen" — der neue Stand DIESER Session. */
export interface BrandSessionAcceptResponse {
  stepKey: BrandStepKey
  sessionKey: string
  revision: number
  accepted: boolean
  deferred: boolean
  acceptance: BrandStepAcceptance
  /** Auto-Weiter: die nächste Session oder die Finale Abnahme. */
  next: BrandNextSessionRef | null
}

/**
 * ANTWORT VON „ALLE ABNEHMEN" (Davids Befund 10, 2026-09-09) — der neue Stand
 * des KAPITELS, nicht der einer Zeile.
 *
 * ── EINE ANTWORT, ZWEI LISTEN ────────────────────────────────────────────
 * `accepted` sind die Zeilen, die jetzt ein Häkchen tragen; `failed` die, die
 * es nicht bekamen, je mit ihrem Grund aus der Zustandsmaschine. Ein Sammel-
 * Knopf, der nur „hat geklappt" meldet, verschweigt genau den Fall, für den er
 * gebaut wurde — elf Zeilen, von denen eine klemmt.
 *
 * ALLES ODER NICHTS gibt es hier bewusst nicht: die Zeilen sind unabhängig
 * voneinander, und eine einzige unbestätigte dürfte nicht zehn Abnahmen
 * zurücknehmen. Geschrieben wird trotzdem EINMAL (eine Zeile, eine Fassung) —
 * s. `acceptAllBrandSessions`.
 */
export interface BrandStepAcceptAllResponse {
  stepKey: BrandStepKey
  revision: number
  /** Slot-Ids in Registry-Reihenfolge, die JETZT abgenommen sind. */
  accepted: string[]
  /** Was liegen blieb — `code` ist der Ablehnungsgrund der Zustandsmaschine. */
  failed: { slotId: string, code: string }[]
  acceptance: BrandStepAcceptance
  /** Auto-Weiter: dieselbe Auskunft wie beim einzelnen Abnehmen. */
  next: BrandNextSessionRef | null
}

/**
 * WAS „NOCHMAL VON VORN" KOSTET (§5a Schritt 1) — der Inhalt des Schutz-Layers.
 *
 * `ack` ist der Hash über GENAU diese Hülle. Der Restart trägt ihn zurück; der
 * Server rechnet neu und weist ohne passenden Wert mit 409 ab — dieselbe
 * Mechanik wie der `impactAck` der Korrektur-Regel (§9). Die Oberfläche
 * erzwingt es damit nie allein.
 */
export interface BrandRestartImpactResponse {
  stepKey: BrandStepKey
  revision: number
  /** Was in DIESEM Kapitel verloren geht — Zahlen, keine Texte. */
  chapter: {
    values: number
    notes: number
    accepted: number
  }
  /** Bestätigte Felder SPÄTERER Kapitel, die daran hängen. */
  downstream: {
    byStep: Partial<Record<BrandStepKey, string[]>>
    count: number
  }
  ack: string
}

// ── Die Korrektur-Regel (BW2 Paket 6, Plan §9) ────────────────────────────

/**
 * WAS DIE KORREKTUR EINES FELDES BERÜHRT (§9 Schritt 1) — die Antwort auf
 * `GET …/sessions/:id/impact`, OHNE KI und ohne einen Schreibvorgang.
 *
 * ── NUR BESTÄTIGTE FELDER ────────────────────────────────────────────────
 * Die Hülle zählt, was schon entschieden ist (`confirmedDependents`). Was
 * ohnehin noch besprochen wird, ist kein Verlust — und eine Warnung, die 29
 * Felder nennt, von denen 26 leer sind, wird beim zweiten Mal weggeklickt.
 *
 * ── `direct` UND `transitive` ÜBERLAPPEN SICH ────────────────────────────
 * Wie bei `sessionsAffectedBy`: `direct` ist die Teilmenge derer, die
 * unmittelbar aus diesem Feld schöpfen, `transitive` ist die ganze Hülle.
 * `count` ist ihre Länge — die Zahl im Satz „berührt {count} bestätigte
 * Felder in {steps} Kapiteln".
 *
 * `ack` bindet Feld, `revision` und die sortierte Hülle zusammen; der PATCH
 * trägt ihn als `impactAck` zurück, und ohne ihn antwortet der Server 409
 * `impact_unacknowledged` (Muster `restart_unacknowledged`).
 */
export interface BrandSessionImpactResponse {
  slotId: string
  stepKey: BrandStepKey
  revision: number
  /** Bestätigte Felder, die UNMITTELBAR aus diesem schöpfen. */
  direct: string[]
  /** Die ganze bestätigte Hülle, in Registry-Reihenfolge. */
  transitive: string[]
  /** Dieselbe Hülle je Kapitel — leere Kapitel kommen nicht vor. */
  byStep: Partial<Record<BrandStepKey, string[]>>
  count: number
  ack: string
}

/** Der Rumpf eines 409 `restart_unacknowledged` — die Hülle reist mit. */
export interface BrandRestartConflictData {
  code: 'restart_unacknowledged'
  impact: BrandRestartImpactResponse
}

export interface BrandStepRestartResponse {
  stepKey: BrandStepKey
  storedState: BrandStoredStepState
  revision: number
  restartedAt: string
  /** Die erste Session des Kapitels — George eröffnet sie. */
  next: BrandNextSessionRef | null
  progressPct: number
  currentStepKey: string
}

// ── Der Spezialist beim Schliessen (BW2 Paket 4, Plan §4/§7/§8) ────────────

/**
 * WAS DER SPEZIALIST GEANTWORTET HAT (§7, wörtlich).
 *
 * Sie ist das Ergebnis EINES Aufrufs, nicht der gespeicherte Stand: was davon
 * an der Session hängen bleibt, sind `goalReached`, `missing` und die Notizen
 * (`slots[id].review` bzw. `.notes`); die Befunde ziehen in ihre eigene
 * Tabelle um, weil sie einen Status haben und kapitelübergreifend sind.
 *
 * `goalReached: false` SPERRT NICHTS (§7): die Bestätigung des Menschen gilt.
 * George sagt im nächsten Zug einmal, was fehlt, und bietet an nachzulegen.
 */
export interface BrandSessionReview {
  goalReached: boolean
  /** Was fehlt, wenn nicht (max. 3). */
  missing: string[]
  /** 0–3 Notizen in der Inhaltssprache. */
  notes: string[]
  findings: BrandFinding[]
  /** Vorschlag für die nächste offene Session — ungeprüft, `pickNextSession` entscheidet. */
  nextSession: string | null
  /** Nur im `correct`-Modus (Paket 6): welche veralteten Felder wirklich getroffen sind. */
  affected?: string[]
}

/** Eine gespeicherte Befund-Zeile, wie die Oberfläche sie liest (Paket 5 rendert sie). */
export interface BrandFindingView {
  id: string
  kind: BrandFindingKind
  status: BrandFindingStatus
  /** Beteiligte Felder — bei `conflict` genau zwei. */
  slots: string[]
  why: string
  suggestion: string
  /** Das Kapitel der Quell-Session — die Kapitel-Sperre der Abnahme. */
  stepKey: BrandStepKey
  /** Die Session, deren Schliess-Aufruf ihn erzeugt hat. */
  sourceSession: string
  dismissReason: string
  createdAt: string
  resolvedAt: string | null
  /** Wann George ihn im Gespräch ausgesprochen hat — `null` = noch nie (§8). */
  mentionedAt: string | null
}

export interface BrandFindingsResponse {
  findings: BrandFindingView[]
}

/**
 * DIE ANTWORT DES SCHLIESS-AUFRUFS.
 *
 * `reviewed: false` heisst fail-soft (§7): der Wert steht, aber es gibt keine
 * Befunde und keine Notizen — der Prüfblick (§10, Paket 7) holt genau diese
 * Sessions nach. `review` trägt dann die leere Form, nie `null`: ein Leser,
 * der zwischen „nichts gefunden" und „nicht gelaufen" unterscheiden will,
 * liest `reviewed`, und ein zweiter Weg dafür wäre einer zu viel.
 */
export interface BrandSessionCloseResponse {
  stepKey: BrandStepKey
  sessionKey: string
  review: BrandSessionReview
  /** Die OFFENEN Befunde, an denen ein Feld dieses Kapitels beteiligt ist. */
  findings: BrandFindingView[]
  /** Auto-Weiter: der geprüfte Vorschlag, sonst die Grundfassung. */
  next: BrandNextSessionRef | null
  revision: number
  reviewed: boolean
  /** Welche Stufe die Befunde geschrieben hat — `null`, wenn keine lief. */
  reviewedBy: BrandReviewStage | null
  /**
   * NUR NACH EINER KORREKTUR (§9, `correct`-Modus): wie die mechanisch
   * veralteten Felder aufgeteilt wurden.
   *
   * `restamped` sind die, für die der Server den Quell-Hash neu gesetzt hat —
   * sie sind wieder `done`. `affected` bleiben `stale` und haben je einen
   * Befund bekommen. Fehlt das Feld ganz, war es eine gewöhnliche
   * Bestätigung; `affected` gleich der ganzen Hülle heisst fail-closed (kein
   * Urteil, also bleibt alles zum Ansehen stehen).
   */
  correction?: {
    affected: string[]
    restamped: string[]
  }
}

// ── Das Dokument und der Prüfblick (BW2 Paket 7, Plan §10) ────────────────

/**
 * EIN KAPITEL IM DOKUMENT — dieselbe Form wie auf der Finalen Abnahme, nur
 * neunmal.
 *
 * ── WARUM DIESELBEN `sessions` WIE IN DER KAPITEL-ABNAHME ────────────────
 * Das Dokument IST die Finale Abnahme der Ebene 1 (§10: „dieselbe Seite wie
 * §5a, nur über alle Kapitel"). Eine eigene, schlankere Zeilenform hätte
 * zwangsläufig eine zweite Antwort auf „was steht in diesem Feld" — und
 * spätestens beim ersten veralteten Wert liefen die beiden Seiten
 * auseinander. Das Beispiel reist trotzdem mit: die Oberfläche entscheidet, ob
 * sie es zeigt (im Dokument nicht — dort steht die Marke, nicht die Lehre).
 *
 * ÜBERSPRUNGENE Kapitel stehen gar nicht erst drin (§10): das Dokument ist
 * das, was diese Marke ist, nicht das, was sie hätte sein können.
 */
export interface BrandDocumentChapter {
  stepKey: BrandStepKey
  /** Der GELTENDE Zustand aus `resolveBrandJourney` (ohne `skipped`, s. o.). */
  state: BrandStepState
  /** Der GESPEICHERTE Zustand der Zeile — die Abnahme-Seite liest ihn so. */
  storedState: BrandStoredStepState
  /** Für „Gilt weiter" und jede andere Handlung an einer Zeile dieses Kapitels. */
  revision: number
  restartedAt: string | null
  acceptance: BrandStepAcceptance
  sessions: BrandAcceptanceSessionView[]
}

/**
 * WAS DER PRÜFBLICK VORFINDET (§10 „Nachholung aller Sessions mit
 * `reviewed: false`").
 *
 * `unreviewed` sind die bestätigten Sessions OHNE Urteil — fail-soft
 * ausgefallene Schliess-Aufrufe (§7). Sie stehen in REGISTRY-Reihenfolge, weil
 * der Deckel die ersten zehn nimmt und die frühen Felder die sind, an denen
 * der Rest hängt.
 *
 * `lastRunAt`/`lastRunRevisionKey` fehlen, solange in DIESEM Prozess kein
 * Prüfblick lief (s. `claimBrandDocumentReview` — der Merker ist bewusst
 * prozess-lokal). Sie sind eine Auskunft, keine Zusage: der Knopf bleibt
 * klickbar, und der Server entscheidet beim Klick.
 */
export interface BrandDocumentReviewState {
  unreviewed: string[]
  lastRunAt?: string
  lastRunRevisionKey?: string
}

export interface BrandDocumentResponse {
  profileId: string
  title: string
  /** Die Kapitel des WEGES, in Registry-Reihenfolge. */
  chapters: BrandDocumentChapter[]
  /** ALLE offenen Befunde des Brandings — kapitelübergreifend, wie die Tabelle. */
  findings: BrandFindingView[]
  review: BrandDocumentReviewState
  /**
   * DAS ERGEBNIS VON BRAND DESIGN (Paket D8, §2.8) — `null`, solange es keines
   * gibt.
   *
   * Das Arbeits-Dokument bekommt damit denselben Abschnitt „Visuelle
   * Identität" wie die Leseansicht, gerendert aus demselben Preset. Was es
   * NICHT bekommt, sind die sechs Design-Kapitel als sechs Abnahme-Abschnitte:
   * abgenommen wird in der Werkstatt, und ihre Werte sind Vokabular-Ids, Hex
   * und gerechnete Tabellen — sechs Blöcke mit `snappy` und `#4a3123` darin
   * wären eine Abnahme-Liste, die niemand lesen kann.
   */
  design: BrandDesignSnapshotPreset | null
  /** ISO-Datum des Standes wie `BrandFoundationResponse.designStand`. */
  designStand: string
  /**
   * WIE VIELE KI-ENTWÜRFE BEHALTEN WURDEN — eine ZAHL, nie eine Id (§1.11 b).
   *
   * Sie steht neben `design` und nicht darin: `BrandDesignSnapshotPreset` lässt
   * `keptDrafts` bewusst nicht zu, damit kein Schreiber sie versehentlich
   * mitschickt. Der Hinweis „n behaltene Entwürfe — privat" gehört trotzdem in
   * BEIDE privaten Ansichten; stünde er nur in der einen, hinge eine
   * Leitplanke an der Wahl der Seite.
   */
  designKeptDrafts: number
}

/**
 * DER ABNAHME-STAND EINES WERKSTATT-KAPITELS, wie ihn die Leseansicht braucht
 * (Konzept BF-Leseansicht §2.6, Paket G2).
 *
 * Bewusst WENIGER als `BrandDocumentChapter`: die Foundation zeigt keine
 * Sessions, keine Notizen, keine Befunde — sie braucht von einem Kapitel genau
 * zwei Auskünfte, „ist es abgenommen" und „wie weit ist es". Die volle
 * Dokument-Zeile mitzuschicken hiesse, Rohantworten in eine Antwort zu legen,
 * die sie nie zeigt.
 */
export interface BrandFoundationStepState {
  stepKey: BrandStepKey
  /** Der GESPEICHERTE Zustand — `done` heisst „Finale Abnahme gelaufen". */
  storedState: BrandStoredStepState
  /** Derselbe Zähler wie im Dokument („7 von 11 abgenommen"). */
  acceptance: { accepted: number, total: number }
}

/**
 * DIE PRIVATE LESEANSICHT (`GET /api/brand/profiles/:id/foundation`).
 *
 * `view` ist das Ergebnis von `buildBrandFoundation` — dieselbe reine Regel,
 * die später die Share-Seite auf dem eingefrorenen Snapshot fährt (§2.1). Die
 * Route rechnet daran nichts nach: sie legt die LIVE-Werte in dieselbe Form,
 * die ein Snapshot hat, und reicht sie hinein.
 *
 * `chapters` und `accepted` stehen DANEBEN und nicht darin, weil der Renderer
 * die Abnahme bewusst nicht kennt (Kopf von `brandFoundation.ts`): sie sind
 * die Auskunft der PRIVATEN Ansicht — der eine Zähler der Seite und der
 * Vermerk „noch nicht abgenommen" (§2.6). Der Share-Snapshot trägt sie nie.
 *
 * `accepted.total` zählt die Kapitel des WEGES (ohne übersprungene), nicht die
 * Kapitel des Handbuchs: abgenommen wird in der Werkstatt, und ein Zähler über
 * Handbuch-Kapitel behauptete eine Abnahme, die es dort nicht gibt.
 */
export interface BrandFoundationResponse {
  profileId: string
  title: string
  /** Die Sprache der MARKENWERTE — nicht die des Handbuchs (§2.6). */
  contentLocale: string
  view: BrandFoundationView
  chapters: BrandFoundationStepState[]
  accepted: { chapters: number, total: number }
  /**
   * DER STAND DES VOLLEN KAPITELS 10 (Brand Design D8) — ISO-Datum, leer, wenn
   * es kein Preset gibt.
   *
   * Es ist der Zeitpunkt, an dem zuletzt an einem der sechs Design-Kapitel
   * geschrieben wurde (`$updatedAt` der Zeilen), NICHT `lastActivityAt` des
   * Profils: ein Board mit dem Datum eines Tippfehlers in der Tagline wäre eine
   * Auskunft über etwas anderes. Formatiert wird es in der Sprache des Lesers.
   */
  designStand?: string
}

/**
 * DAS ERGEBNIS-BOARD ALS EIGENE ANSICHT (`GET /api/brand/profiles/:id/design`,
 * Brand Design D8, §2.8).
 *
 * ── WARUM EINE EIGENE ROUTE UND NICHT DIE FOUNDATION ─────────────────────
 * Die Board-Seite liest EIN Preset und sonst nichts. Über die Foundation-Route
 * zu gehen hiesse, für eine Fläche das ganze Handbuch zu bauen (zwölf Kapitel,
 * Abnahme-Zustände, ein `foundation.viewed` im Funnel) — und die Seite hinge an
 * einer Antwort, deren grösserer Teil sie nichts angeht.
 *
 * `preset: null` ist der ehrliche Normalfall, solange die Schicht läuft; `done`
 * und `total` sagen, wie weit sie ist, damit die Sperr-Fläche nicht raten muss.
 */
export interface BrandDesignResponse {
  profileId: string
  title: string
  contentLocale: string
  /** `null`, solange nicht alle sechs Kapitel abgenommen sind. */
  preset: BrandDesignPreset | null
  /** Wie viele der sechs Kapitel stehen. */
  done: number
  total: number
  /** ISO-Datum wie `BrandFoundationResponse.designStand`; leer = keines. */
  stand: string
}

/**
 * DIE ANTWORT DES PRÜFBLICKS (§10) — er läuft NUR auf Klick (§16), nie von
 * selbst.
 *
 * `ran: false` heisst „derselbe Dokument-Stand wurde in diesem Prozess schon
 * geprüft": kein Aufruf, kein Geld, und trotzdem die volle Auskunft (die
 * Befunde kommen aus der Tabelle, `caughtUp` aus dem gemerkten Lauf). Das ist
 * dieselbe Arbeitsteilung wie beim Kapitel-Blick: der Riegel spart den Aufruf,
 * nicht die Antwort.
 *
 * `stillUnreviewed` ist der Rest hinter dem Deckel (`BRAND_DOCUMENT_CATCHUP_MAX`)
 * — er verschwindet nicht, er wartet auf den nächsten Klick.
 */
export interface BrandDocumentReviewResponse {
  ran: boolean
  /** Sessions, deren Urteil dieser Lauf nachgeholt hat. */
  caughtUp: string[]
  /** Sessions, die ungeprüft bleiben — Deckel oder fail-soft ausgefallen. */
  stillUnreviewed: string[]
  /** ALLE offenen Befunde nach diesem Lauf. */
  findings: BrandFindingView[]
  /** Wer den DOKUMENT-Blick geschrieben hat — `null`, wenn keine Stufe durchkam. */
  reviewedBy: BrandReviewStage | null
  /**
   * Der Stand, für den dieser Lauf gilt (Idempotenz-Schlüssel, §10) — und zwar
   * der NACH der Nachholung: sie schreibt (`reviewed`, Notizen) und bewegt
   * damit die `revision` der berührten Kapitel. Der nächste Klick rechnet
   * genau diesen Schlüssel, und nur so hält der Riegel gegen den Doppelklick.
   */
  revisionKey: string
}

/** Die Antwort des KAPITEL-Modus (§5a) — nur Befunde, kein Urteil, kein Wegweiser. */
export interface BrandStepReviewResponse {
  stepKey: BrandStepKey
  revision: number
  reviewed: boolean
  reviewedBy: BrandReviewStage | null
  findings: BrandFindingView[]
}

/** Die Antwort auf „annehmen"/„ablehnen" (§8). */
export interface BrandFindingDecisionResponse {
  finding: BrandFindingView
  /**
   * Die neue Fassung der QUELL-Kapitel-Zeile, wenn der Ablehnungs-Grund als
   * Notiz dort gelandet ist — sonst die unveränderte. Die Abnahme-Seite führt
   * ihre `revision` selbst und muss sie übernehmen.
   */
  revision: number
}

/** Der Rumpf eines 400 `acceptance_incomplete` (`complete`). */
export interface BrandAcceptanceConflictData {
  code: 'acceptance_incomplete'
  blockers: BrandAcceptanceBlocker[]
  missing: string[]
}

export interface BrandMessageView {
  id: string
  stepKey: string
  /**
   * DIE SESSION, IN DER DIESER ZUG ENTSTAND (brand-011). `''` heisst
   * „Kapitel-Verlauf aus der Zeit vor BW2" — und ist damit ein Wert, keine
   * Lücke: solche Zeilen zählen zum Verlauf der ERSTEN Session ihres Kapitels.
   */
  sessionKey: string
  role: 'george' | 'user' | 'system'
  body: string
  parts: unknown
  generationId: string | null
  createdAt: string
}

export interface BrandMessagesResponse {
  messages: BrandMessageView[]
  /** Weiterreichen als `?cursor=` — `null` heißt „Ende". */
  cursor: string | null
  hasMore: boolean
}

/**
 * DIE EINE NICHT-STRÖMENDE ANTWORT DER KONVERSATIONS-ROUTE (P3.2).
 *
 * `conversed: false` heisst „es kommt kein Zug" — mehr sagt sie bewusst nicht.
 * Dahinter stehen drei Fälle, die für die Oberfläche denselben Handgriff haben
 * (nämlich keinen): der KI-Kill-Switch ist aus, der Zug wurde schon einmal
 * geschickt, oder im Baustein läuft gerade ein anderer Zug. In allen dreien
 * verhält sich die Werkstatt exakt wie vor P3.2.
 *
 * Der Client erkennt sie am `Content-Type`: kein `text/event-stream`, also kein
 * Strom. Ein Fehler wäre die falsche Form — hier ist nichts schiefgegangen.
 */
export interface BrandConverseSkippedResponse {
  conversed: false
  /**
   * NUR beim Eröffnungszug (Paket 3a): diese Session hat ihren ersten Zug
   * schon. Der Client ruft die Eröffnung bei JEDEM Öffnen — ohne dieses
   * „schon passiert" bekäme eine Session bei jedem Blick einen neuen ersten
   * Satz, und der Eimer bezahlte ihn.
   *
   * Es steht NEBEN `conversed: false` und ersetzt es nicht: für die Werkstatt
   * ist beides derselbe Handgriff (keiner), und ein zweiter Antwort-Typ
   * zwänge sie, zwei Formen zu unterscheiden, die dasselbe bedeuten.
   */
  skipped?: true
}

/**
 * WOHIN ES DANACH WEITERGEHT (Auto-Weiter, Plan §5) — die nächste offene
 * Pflicht-Session ODER, am Kapitelende, die Finale Abnahme.
 *
 * Der Typ und die Rechnung dazu (`resolveNextStop`) stehen in
 * `shared/brandJourney.ts`: er ist eine Aussage der ZUSTANDSMASCHINE und
 * gehört dorthin, wo sie lebt. Hier steht nur der Name, unter dem ihn die
 * Antwort-Typen kennen — die Warteschlange „neu besprechen" (`stale`) füllt
 * dasselbe Feld später mit Paket 6.
 */
export type { BrandNextSessionRef } from '../brandJourney'

/** Jede Antwort der Konversations-Route, die KEIN Strom ist. */
export type BrandConverseResponse = BrandConverseSkippedResponse

/** NEUTRAL: dieselbe Form für falsch, abgelaufen, widerrufen, verbraucht. */
export interface BrandInviteCheckResponse {
  valid: boolean
}

/**
 * DIE WARTELISTE — bewusst NICHT neutral, und das ist kein Widerspruch zu den
 * zwei Antworten darüber.
 *
 * Der Einladungs-Code ist ein GEHEIMNIS: jede Auskunft über ihn hilft dem, der
 * rät. Hier steht die EIGENE Adresse im Rumpf — sie ist kein Geheimnis vor dem,
 * der sie gerade eingetippt hat. Über FREMDE Adressen sagt die Antwort nichts,
 * was ein Rater nicht selbst herausfände — die Drossel (`brand:waitlist`,
 * 5/min) ist die Grenze, nicht die Sprachlosigkeit.
 *
 * ── ZWEI ZUSTÄNDE, UND `duplicate` IST KEINER DAVON MEHR ──────────────────
 * Seit dem Double-Opt-in zählt eine Zeile erst nach dem Klick im Postfach; die
 * Frage „stand die Adresse schon da?" hat für das Formular damit aufgehört,
 * eine Frage zu sein. Was es wissen muss, ist, WAS ALS NÄCHSTES PASSIERT:
 *  · `mail_sent` — im Postfach liegt ein Bestätigungs-Link (neue Adresse ODER
 *    eine unbestätigte, die einen frischen Link bekommt: für den Menschen davor
 *    ist beides derselbe Satz, und genau deshalb ist es auch dieselbe Antwort —
 *    ein Unterschied wäre ein Enumerations-Leck).
 *  · `already_confirmed` — diese Adresse ist bestätigt, es geht KEINE Mail mehr
 *    raus. Das darf sie erfahren: sie hat sich gerade selbst eingetippt.
 *
 * `ok` ist immer `true`: die Route antwortet 200 oder wirft (400 bei kaputtem
 * Rumpf, 503 bei defekter Ablage oder ausgefallener Mail). Ein `ok: false` gäbe
 * es nie.
 */
export interface BrandWaitlistResponse {
  ok: true
  state: 'mail_sent' | 'already_confirmed'
}

/**
 * DER KLICK AUS DER MAIL. Auch hier keine Neutralität nötig: wer den Token hat,
 * hat die Mail — und die ging an genau diese Adresse.
 *
 * `already_confirmed` ist der DEFENSIVE Zweig: das Bestätigen löscht den Hash
 * aus der Zeile, ein zweiter Klick auf denselben Link findet also gar nichts
 * mehr und endet in 400. Der Zustand steht trotzdem im Vertrag, weil die Zeile
 * auf einem anderen Weg (Betreiber-Hand, künftiger Import) mit Hash UND Status
 * 'confirmed' dastehen könnte — dann ist „schon bestätigt" die ehrliche
 * Auskunft und kein Fehler.
 *
 * Abgewiesen wird mit einem Status, nicht mit einem dritten Wort: 400
 * `token_invalid` (unbekannt), 410 `token_expired` (Frist vorbei — die Zeile
 * bleibt `pending`, ein neuer Eintrag erneuert den Link).
 */
export interface BrandWaitlistConfirmResponse {
  ok: true
  state: 'confirmed' | 'already_confirmed'
}

/** Ebenso neutral — `false` sagt nie, WORAN es lag. */
export interface BrandInviteRedeemResponse {
  redeemed: boolean
}

/**
 * DIE WARTELISTE, WIE DER BETREIBER SIE SIEHT (`/api/brand/admin/waitlist`).
 *
 * ── WAS HIER FEHLT, FEHLT ABSICHTLICH ─────────────────────────────────────
 * `tokenHash` und `tokenExpiresAt` verlassen den Server NIE. Sie sind das
 * Geheimnis des Double-Opt-in; ein Betreiber-Dashboard, das sie mitliefert,
 * legte den Bestätigungs-Link jeder offenen Anfrage in ein Browser-Fenster —
 * und in jedes Fehler-Protokoll, das die Antwort mitschneidet. Was der
 * Betreiber daran ablesen wollte („ist der Link noch gültig?"), sagt ihm der
 * Status.
 *
 * `status` ist hier ENG getypt, obwohl die Spalte ein varchar ist: der Server
 * rechnet jede Zeile durch `normalizeBrandWaitlistStatus`, der Client bekommt
 * also nie einen Wert, für den er keinen Zweig hat (`brandWaitlistAdmin.ts`).
 */
export interface BrandWaitlistAdminItem {
  id: string
  email: string
  name: string
  company: string
  website: string
  locale: string
  source: string
  status: BrandWaitlistStatus
  note: string
  createdAt: string
  confirmedAt: string
}

/**
 * `counts` zählt IMMER alle vier Zustände, unabhängig vom Filter — sonst wäre
 * die Kopfzeile eine Funktion der Ansicht („0 wartend", weil man gerade
 * `invited` anschaut) statt eine Aussage über die Liste.
 *
 * `nextCursor` ist die Zeilen-Id der letzten gelieferten Zeile oder `''`
 * (= es gibt nichts mehr). Leerer String statt `null`, weil der Wert
 * unverändert als Query-Parameter zurückreist.
 */
export interface BrandWaitlistAdminListResponse {
  items: BrandWaitlistAdminItem[]
  total: number
  nextCursor: string
  counts: Record<BrandWaitlistStatus, number>
}

/** Code erzeugt, Mail zugestellt, Status gestempelt — in dieser Reihenfolge. */
export interface BrandWaitlistInviteResponse {
  ok: true
  status: 'invited'
}

export interface BrandWaitlistDeclineResponse {
  ok: true
  status: 'declined'
}

/** Die Notiz gehört dem Betreiber — die Route bestätigt nur, dass sie steht. */
export interface BrandWaitlistNoteResponse {
  ok: true
}

// ── Brand Design: das Preset (docs/archiv/BRAND-DESIGN.md §2.8, Paket D0) ────

/**
 * DIE ELF STUFEN EINER RAMPE — dieselben wie in der Themes-Engine.
 *
 * Sie stehen hier NOCH EINMAL und nicht als Import: der A14-Vertrag erlaubt
 * GENAU EINE Stelle, die relativ nach `packages/themes` greift, und das ist
 * `shared/brandDesign.ts` (die reine Ramp-Mathematik). Eine zweite Datei mit
 * demselben Import wäre eine zweite Grenzüberschreitung für einen Typ.
 *
 * DIE ZWEI LISTEN KÖNNEN TROTZDEM NICHT AUSEINANDERLAUFEN, und zwar zur
 * ÜBERSETZUNGSZEIT: `buildBrandDesign` weist das Ergebnis von `generateRamp`
 * (`Record<Shade, string>`) einer `BrandRamp` zu. Fehlte hier eine Stufe oder
 * käme dort eine dazu, wäre das ein Typfehler — kein Test, der es vielleicht
 * bemerkt. `tests/brandDesign.test.ts` zählt sie zusätzlich.
 */
export const BRAND_RAMP_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type BrandRampShade = (typeof BRAND_RAMP_SHADES)[number]
export type BrandRamp = Readonly<Record<BrandRampShade, string>>

/** Ein geprüftes Text/Grund-Paar mit seinem WCAG-Urteil (§2.3 `h.contrast`). */
export interface BrandContrastPair {
  /** Stabile Id des Paares — sie steht im Preset und in der Matrix. */
  id: string
  /** In welcher Welt geprüft wurde. */
  scheme: 'light' | 'dark'
  /** Vordergrund und Hintergrund als Hex — die WERTE, nicht ihre Herkunft. */
  foreground: string
  background: string
  ratio: number
  level: 'AAA' | 'AA' | 'AA18' | 'fail'
}

/** Eine Farb-Rolle des Systems (§2.3 `h.roles`). */
export interface BrandColorRole {
  id: string
  /** Woraus die Rolle gefüllt wird (Rampen-Stufe, Akzent, Papier). */
  source: string
  /** Der aufgelöste Hex — damit Produkt 03 Tokens daraus machen kann. */
  hex: string
}

/**
 * DAS ERGEBNIS VON BRAND DESIGN (§2.8) — gebaut von der PUREN Regel
 * `buildBrandDesign(values)` aus den bestätigten Slot-Werten.
 *
 * DIESELBE WAHRHEIT WIE BEI `buildBrandFoundation`, KEIN SPIEGEL: es gibt
 * keine zweite Ablage, aus der das Preset gelesen würde — es entsteht bei
 * jedem Aufruf neu aus den Werten, und ein eingefrorenes Abbild davon steht
 * nur im Snapshot (§2.8), wo es eingefroren GEHÖRT.
 */
export interface BrandDesignPreset {
  /**
   * Fassung des PRESET-FORMATS (nicht die der Registry). Sie steigt, wenn sich
   * die FORM ändert — ein alter Snapshot bleibt dadurch lesbar.
   */
  version: number
  /** Die bestätigte Visual DNA: alle zehn Dimensionen (`brandDesignVocab.ts`). */
  dna: Readonly<Record<string, string>>
  color: {
    /** Die eine Basisfarbe, aus der alles gerechnet ist. */
    base: string
    rampLight: BrandRamp
    rampDark: BrandRamp
    neutral: BrandRamp
    accent: string
    roles: BrandColorRole[]
    contrastPairs: BrandContrastPair[]
  }
  type: {
    /** Id aus `BRAND_FONT_PAIRS`. */
    pair: string
    /** Id aus `BRAND_TYPE_SCALES`. */
    scale: string
    /** Die Schrift-Regeln als Zeilen (`i.rules`). */
    rules: string[]
  }
  mark: {
    /** Id aus `BRAND_MARK_KINDS`. */
    kind: string
    /** Das Briefing als Zeilen (`j.brief`). */
    brief: string[]
    /** Die gesetzten Beispiele als SVG-Quelltext (`j.examples`, D5b). */
    examples: string[]
    /**
     * Referenzen auf BEHALTENE KI-Entwürfe (`j.drafts`).
     *
     * Sie stehen im Preset der WERKSTATT und fallen im Snapshot heraus
     * (§1.11 b) — deshalb ist das Feld im v2-Zweig des Snapshots
     * ausdrücklich weggelassen (`BrandDesignSnapshotPreset`), nicht bloss
     * leer gelassen: ein leeres Array wäre eine Zusage, die jeder Schreiber
     * einzeln einhalten müsste.
     */
    keptDrafts: string[]
  }
  imagery: {
    /** Die Bild-Prinzipien (`k.photo`). */
    principles: string[]
    /** Id aus `BRAND_ILLUSTRATION_OPTIONS`. */
    illustration: string
    /** Id aus `BRAND_ICON_OPTIONS`. */
    icons: string
    dodont: { doText: string, dontText: string }[]
  }
  motion: {
    /** Id aus `BRAND_TEMPO_OPTIONS`. */
    tempo: string
    /** Die Übergangs-Tokens in ms, plus der Versatz. */
    transitions: { id: string, durationMs: number, easing: string }[]
    /** Bewegt sich das Zeichen? Id aus `BRAND_LOGO_MOTION_OPTIONS`. */
    logo: string
    rules: string[]
  }
}

/**
 * DIE EINGABE VON `buildBrandDesign` — die BESTÄTIGTEN Slot-Werte der sechs
 * Kapitel, in der Form, in der sie gespeichert sind.
 *
 * Sie ist eine eigene Form und nicht `Record<string, string>`: die Regel muss
 * an jedem Feld sehen können, welche ART Wert dort steht (eine Hex-Farbe, eine
 * Id aus einem Vokabular, eine Liste von Zeilen). Alles ist OPTIONAL — ein
 * unvollständiger Stand ist der Normalfall, solange die Schicht läuft, und
 * `buildBrandDesign` antwortet darauf mit `null` statt mit einem halben Preset.
 */
export interface BrandDesignValues {
  /** `g.mix` — die bestätigte DNA, alle zehn Dimensionen. */
  dna?: Readonly<Record<string, string>>
  /** `h.base` — Hex. */
  base?: string
  /** `h.neutral` — Id aus `BRAND_NEUTRAL_OPTIONS`. */
  neutral?: string
  /** `h.accent` — Hex. */
  accent?: string
  /** `h.roles` — Rolle plus Quelle; den Hex löst die Regel auf. */
  roles?: readonly { readonly id: string, readonly source: string, readonly hex?: string }[]
  /** `i.pair` / `i.scale` / `i.rules`. */
  pair?: string
  scale?: string
  typeRules?: readonly string[]
  /** `j.kind` / `j.brief` / `j.examples` / `j.drafts`. */
  markKind?: string
  markBrief?: readonly string[]
  markExamples?: readonly string[]
  keptDrafts?: readonly string[]
  /** `k.photo` / `k.illustration` / `k.icons` / `k.dodont`. */
  imageryPrinciples?: readonly string[]
  illustration?: string
  icons?: string
  dodont?: readonly { readonly doText: string, readonly dontText: string }[]
  /** `l.tempo` / `l.logo` / `l.rules`. */
  tempo?: string
  logoMotion?: string
  motionRules?: readonly string[]
}

/** Der eingefrorene Inhalt einer Veröffentlichung (nie Chats/Entwürfe). */
export interface BrandShareChapter {
  stepKey: BrandStepKey
  slots: { slotId: string, value: string }[]
}

/**
 * DAS PRESET IM SNAPSHOT — dasselbe wie in der Werkstatt, OHNE die behaltenen
 * KI-Entwürfe.
 *
 * `Omit` statt eines eigenen Typs: so kann das Feld nicht versehentlich
 * wieder mitwandern, wenn jemand das Preset erweitert — und ein Schreiber, der
 * `keptDrafts` setzen will, bekommt einen Typfehler statt eines stillen Lecks
 * (§1.11 b: Entwürfe reisen nie in Snapshot oder Share).
 */
export interface BrandDesignSnapshotPreset extends Omit<BrandDesignPreset, 'mark'> {
  mark: Omit<BrandDesignPreset['mark'], 'keptDrafts'>
}

/**
 * DER SNAPSHOT — v1 heute, v2 mit Brand Design (§2.8).
 *
 * `schemaVersion` ist eine Zahl und bleibt es; `design` ist OPTIONAL, weil ein
 * v1-Snapshot es nie hatte und weil auch eine v2-Marke ohne freigeschaltetes
 * Brand Design keines hat. Der Renderer liest BEIDE Fassungen (BF1-Konzept
 * §2.7) — er fragt nach dem FELD, nicht nach der Zahl.
 *
 * D0 legt nur den TYP an: GESCHRIEBEN wird weiter v1 (`brandSnapshot.ts`),
 * Renderer und Schreiber kommen mit **D8**. Der Typ steht trotzdem schon hier,
 * damit die Kapitel dazwischen ihre Werte gegen die Zielform bauen statt gegen
 * eine Vermutung.
 */
export interface BrandShareSnapshot {
  schemaVersion: number
  title: string
  contentLocale: string
  story: string
  chapters: BrandShareChapter[]
  presetId: string
  presetVersion: string
  /** Nur ab `schemaVersion: 2` und nur mit abgeschlossener Schicht 2 (D8). */
  design?: BrandDesignSnapshotPreset
}

/** Der rohe Token steht GENAU EINMAL hier — danach nur noch sein Hash. */
export interface BrandSharePublishResponse {
  shareId: string
  token: string
  publishedAt: string
  expiresAt: string
}

export interface BrandShareRevokeResponse {
  revoked: number
}

/**
 * DER ZUSTAND DES TEILENS (Paket G3) — die Frage, die der Dialog beim Öffnen
 * stellt: „gibt es gerade einen Link?"
 *
 * `active: null` heisst „keiner" (widerrufen, abgelaufen oder nie erzeugt);
 * die drei Fälle sind hier bewusst NICHT unterscheidbar, weil der Mensch
 * dieselbe Antwort braucht — einen neuen Link.
 *
 * DER TOKEN STEHT NICHT DARIN, und das ist keine Auslassung: er existiert
 * genau einmal, in der Antwort des Veröffentlichens (`BrandSharePublish
 * Response`), danach nur noch als Hash. Eine Statusroute, die ihn nachreichen
 * könnte, machte aus einem Geheimnis eine Abfrage.
 */
export interface BrandShareStatusResponse {
  active: null | {
    shareId: string
    publishedAt: string
    expiresAt: string
  }
}

export interface BrandShareViewResponse {
  snapshot: BrandShareSnapshot
  publishedAt: string
  expiresAt: string
}

// ── Veröffentlichen (docs/plans/DISCOVER-BRANDS.md §4.3) ────────────────────

/**
 * DER ZUSTAND EINER VERÖFFENTLICHUNG, wie ihn Leseansicht und Brands-Karte
 * brauchen — und NICHTS darüber hinaus.
 *
 * Kein Snapshot (den zeigt die öffentliche Anatomie, D2), keine Meldungen,
 * kein `featuredAt`: die Kuration des Betreibers ist keine Auskunft an den
 * Kunden. `decisionNote` steht sehr wohl darin — sie ist für ihn geschrieben
 * (§3.4).
 *
 * `status: 'none'` heisst „noch nie eingereicht". Es ist ein WERT und kein
 * `null`, weil die Oberfläche genau eine Frage stellt (Begründung in
 * `shared/brandPublication.ts`).
 */
export interface BrandPublicationState {
  status: BrandPublicationViewStatus
  /** Leer, solange es keine Zeile gibt. */
  slug: string
  /** `/discover/<slug>` — die künftige bzw. geltende Adresse. */
  path: string
  submittedAt: string
  publishedAt: string
  decidedAt: string
  decisionNote: string
  /**
   * Öffentlich UND ein neuer Stand wartet auf die Freigabe (§3.4). Zwei
   * Tatsachen in einem Feld, damit die Oberfläche nicht dieselbe Rechnung
   * zum zweiten Mal anstellt.
   */
  pendingUpdate: boolean
  /**
   * „AKTUALISIERUNG ABGELEHNT" (§3.4, Paket D3) — die Marke steht weiter
   * öffentlich, der EINGEREICHTE Stand wurde aber abgelehnt.
   *
   * Ein eigenes Feld und nicht bloss `decisionNote`, weil die Oberfläche sonst
   * dieselbe Rechnung ein zweites Mal anstellen müsste: bei `status:
   * 'declined'` gehört die Notiz zur MARKE („nicht veröffentlicht, weil …"),
   * bei `status: 'published'` gehört sie zur AKTUALISIERUNG („draussen steht
   * weiter der alte Stand, weil …"). Zwei verschiedene Sätze für den Kunden,
   * und die Unterscheidung gehört an die Stelle, die die Regel kennt.
   *
   * `null` heisst „es liegt keine abgelehnte Aktualisierung vor".
   */
  pendingDecision: { note: string, at: string } | null
}

/**
 * Antwort aller drei Publication-Routen: der Zustand UND die Frage „darf
 * überhaupt eingereicht werden?".
 *
 * Die zweite steht mit darin, weil der Dialog sie VOR dem Klick beantworten
 * muss und ihre Eingaben (bestätigter Archetyp, abgenommene Kapitel) auf der
 * Seite nur über Umwege zu haben wären. Der 409 der POST-Route bleibt die
 * Durchsetzung — der Fehler-Envelope trägt nur den `reason`, nie diese Liste.
 */
export interface BrandPublicationResponse {
  publication: BrandPublicationState
  readiness: {
    allowed: boolean
    blockers: BrandPublicationBlocker[]
  }
}

/**
 * DIE ABSAGE „so noch nicht" (§3.3). Sie reist als `data` im 409; der zentrale
 * Handler hebt `code` als `reason` ins Envelope, die Liste liest der Dialog
 * über `error.data.blockers`.
 */
export interface BrandPublicationNotReadyData {
  code: 'publication_not_ready'
  blockers: BrandPublicationBlocker[]
}

// ── Moderation (docs/plans/DISCOVER-BRANDS.md §4.4, Paket D3) ───────────────

/**
 * EINE ZEILE DER BETREIBER-LISTE.
 *
 * ── WAS HIER NICHT DRINSTEHT, IST DER HALBE ZWECK ─────────────────────────
 * Kein Snapshot (die Vorschau ist ein LINK auf die Anatomie, nicht ein Abbild
 * in einer Tabellenzeile), kein `pendingSnapshot`, kein `ipHash`. Und keine
 * E-MAIL des Eigentümers: die Warteliste zeigt eine Adresse, weil die Adresse
 * dort der Eintrag IST; eine Veröffentlichung trägt keine, und sie über die
 * Users-API nachzuschlagen hiesse, für eine Randspalte je Zeile eine Abfrage
 * zu stellen (fünfzig Zeilen, fünfzig Fragen) und dabei eine Mailadresse in
 * ein Browser-Fenster zu holen, die für die Entscheidung nichts beiträgt. Was
 * bleibt, ist die KONTO-ID — sie genügt, um in der Konsole nachzusehen, und
 * sie sagt zuverlässig, ob zwei Einreichungen von derselben Person kommen.
 */
export interface BrandPublicationAdminItem {
  /** = die Profil-Id (rowId der Veröffentlichung). */
  id: string
  title: string
  slug: string
  path: string
  status: BrandPublicationViewStatus
  submittedAt: string
  publishedAt: string
  decidedAt: string
  decisionNote: string
  /** '' = niemand hinterlegt (alte Zeile). Nie eine Mailadresse (s. oben). */
  ownerId: string
  /**
   * DIE ZAHL UND WAS SIE MISST (Entscheidung 3/5): der Website-Score, sonst
   * die Fundament-Reife. Beide klar beschriftet — sie messen nicht dasselbe
   * und dürfen nie in einer Spalte verglichen werden.
   */
  score: number | null
  scoreSource: 'website' | 'document' | ''
  checkId: string
  reportCount: number
  featured: boolean
  example: boolean
  industry: string
  archetype: string
  locale: string
}

export interface BrandPublicationAdminListResponse {
  items: BrandPublicationAdminItem[]
  total: number
  nextCursor: string
  /** Je Zustand, UNABHÄNGIG vom gewählten Filter (sonst zählte die Ansicht sich selbst). */
  counts: Record<string, number>
}

/** Die Antwort jeder Entscheidungs-Route — der neue Zustand, mehr nicht. */
export interface BrandPublicationAdminDecisionResponse {
  ok: true
  status: BrandPublicationStatusValue
  /** Bleibt der alte, freigegebene Stand öffentlich? (nur beim Ablehnen) */
  keepsPublicStand: boolean
}

/** Der Spaltenwert — die fünf Zustände, ohne das `'none'` der Oberfläche. */
export type BrandPublicationStatusValue = Exclude<BrandPublicationViewStatus, 'none'>

/** Die Antwort der zwei Schalter (Brand of the Day, Beispiel-Badge). */
export interface BrandPublicationFlagResponse {
  ok: true
  featured: boolean
  example: boolean
  /**
   * Die Zeile, die ihr `featuredAt` an diese hier verloren hat — '' wenn es
   * keine gab. Die Seite sagt damit „X hat Y abgelöst" statt bloss „gesetzt";
   * ohne diese Auskunft sähe der Betreiber die Ablösung erst beim nächsten
   * Laden der Liste und hielte sie womöglich für einen Fehler.
   */
  replacedId: string
}

/**
 * EINE MELDUNG, wie sie der Betreiber sieht.
 *
 * `ipHash` wird NICHT durchgereicht — die Auslassung ist der halbe Zweck von
 * `toBrandPublicationReport()`, und weil jede Route durch sie hindurch muss,
 * kann sie keine einzelne vergessen (dasselbe Muster wie bei den Korrekturen).
 * `reporterEmail` geht sehr wohl hinaus: sie ist der Rückfrage-Weg, und sie
 * erreicht ausschliesslich diese Betreiber-Liste.
 */
export interface BrandPublicationReport {
  id: string
  publicationId: string
  /** Titel und Adresse der gemeldeten Marke — '' wenn die Zeile fort ist. */
  title: string
  slug: string
  path: string
  reason: string
  reporterEmail: string
  status: 'open' | 'done'
  decidedAt: string
  createdAt: string
}

export interface BrandPublicationReportListResponse {
  items: BrandPublicationReport[]
  total: number
  nextCursor: string
  counts: Record<string, number>
}

export interface BrandPublicationReportResolveResponse {
  ok: true
  status: 'open' | 'done'
  /** `false` = war schon erledigt; zweimal erledigen ist kein Fehler. */
  changed: boolean
}

/**
 * DIE ANTWORT AUF EINE ÖFFENTLICHE MELDUNG — bewusst nur `ok`.
 *
 * Nichts über den Zustand der Marke, nichts über frühere Meldungen: „ist
 * eingegangen" ist alles, was der Absender in diesem Moment wirklich weiss,
 * und jede weitere Auskunft wäre eine über eine fremde Marke an jeden, der sie
 * abfragt (dieselbe Zurückhaltung wie beim Korrekturvorschlag).
 */
export interface BrandPublicationReportResponse {
  ok: true
}

// ── Brand-Check (docs/archiv/BRAND-CHECK.md) ────────────────────────────────

/**
 * DER VERTRAG DES KOSTENLOSEN AUSSEN-CHECKS. Er ist FEST, weil Client und
 * Server ihn gleichzeitig gebaut haben — und weil das Ergebnis unter
 * `/brand-check/<id>` teilbar ist: ein geänderter Vertrag hiesse ein
 * geteilter Link, der nichts mehr anzeigt.
 */

/**
 * DIE ANTWORT DES ANSTOSSES — bewusst NUR eine Id, nie das Ergebnis.
 *
 * Der Client springt danach auf `/brand-check/<id>` und holt es dort. So ist
 * das Ergebnis von der ersten Sekunde an eine ADRESSE (teilbar, nachladbar,
 * bookmarkfähig) und nicht der Inhalt einer Antwort, die es nur einmal gibt.
 *
 * `cached: true` heisst „dieselbe Adresse wurde in den letzten sieben Tagen
 * schon geprüft" — es ist KEIN Fehler, sondern der Kostendeckel des Plans
 * (§2 „Reproduzierbarkeit"). Der HONIGTOPF antwortet ebenfalls `cached: true`,
 * dann aber mit leerer `id`: ein Bot bekommt dieselbe Form wie ein Mensch,
 * ohne dass etwas entsteht.
 */
export interface BrandCheckStartResponse {
  ok: true
  id: string
  cached: boolean
}

/**
 * EIN KRITERIUM, WIE ES DER LESER SIEHT.
 *
 * `score: null` heisst „nicht bewertbar" (nicht „null Punkte") — das Kriterium
 * fällt aus der Normalisierung und erscheint als Schloss. `evidence` ist der
 * BELEG: ein Messwert-Satz bei den gerechneten Kriterien, ein Zitat von der
 * Seite bei den beurteilten. `note` ist der eine Satz des Modells dazu und
 * bleibt bei gerechneten Kriterien leer.
 *
 * Titel und „nächster Schritt" stehen NICHT hier: sie sind i18n
 * (`brand.check.criteria.<id>.title|next`) und wechseln mit der Sprache des
 * Lesers, nicht mit der Sprache der geprüften Seite.
 */
export interface BrandCheckCriterionResult {
  id: string
  category: string
  kind: 'measured' | 'judged'
  score: 0 | 1 | 2 | null
  evidence: string
  note: string
}

/**
 * EINE KATEGORIE. `raw` ist die Rohsumme (0–10) der BEWERTBAREN Kriterien,
 * `assessable` sagt, wie viele das waren, `points` ist der aufs Gewicht
 * normalisierte Beitrag. `locked: true` (assessable 0) heisst: die Kategorie
 * zählt weder im Zähler noch im Nenner des Gesamtwerts.
 */
export interface BrandCheckCategoryResult {
  key: string
  weight: number
  raw: number
  assessable: number
  points: number
  locked: boolean
}

/** Ein Befund trägt seinen eigenen Beleg mit — der Client muss nichts suchen. */
export interface BrandCheckFinding {
  criterionId: string
  evidence: string
}

/**
 * DAS GESPEICHERTE ERGEBNIS. `locale` ist die Sprache, in der GEFRAGT wurde;
 * die Belege sprechen dagegen die Sprache der geprüften Seite (Plan §2) — ein
 * Zitat zu übersetzen wäre kein Zitat mehr.
 *
 * `scoreVersion` steht mit in der Zeile, damit ein alter Wert nicht behauptet,
 * nach der heutigen Rechnung entstanden zu sein.
 */
export interface BrandCheckResult {
  id: string
  url: string
  host: string
  locale: 'de' | 'en'
  createdAt: string
  score: number
  band: string
  scoreVersion: string
  /**
   * 'website' | 'document' (§5b). Er steht hier, weil die Ergebnis-Seite
   * dieselbe ist und trotzdem etwas anderes über dem Score sagen muss: bei
   * einem Dokument-Check gibt es KEINE geprüfte Adresse, und `url`/`host`
   * tragen dort die leere Zeichenkette bzw. den Markennamen. Eine Zeile aus
   * der Zeit vor brand-017 liest sich als 'website' — das war sie auch.
   */
  source: string
  /**
   * Branchen-Id aus dem Katalog (`BRAND_INDUSTRIES`, 'unknown' vor brand-017
   * oder wenn das Modell sie nicht zuordnen konnte). Die Ergebnis-Seite zeigt
   * sie neben „Branche stimmt nicht?" — ein Korrekturvorschlag ohne den
   * heutigen Wert wäre ein Vorschlag ins Blaue.
   */
  industry: string
  categories: BrandCheckCategoryResult[]
  criteria: BrandCheckCriterionResult[]
  findings: BrandCheckFinding[]
  /**
   * DER UNMITTELBARE VORGÄNGER derselben Adresse — die Grundlage der Zeile
   * „↑ +7 seit dem 12. August" (§10 „Score = Urteil … mit Delta zum Vorgänger").
   *
   * `null` heisst „es gibt keinen": der erste Check dieser Adresse, ein
   * Vorgänger, der ausgeblendet wurde (dann sagen wir NICHTS, statt weiter
   * zurückzugreifen — ein Delta gegen einen entfernten Eintrag wäre eine
   * Aussage über etwas, das nicht mehr gezeigt werden darf), oder eine Ablage,
   * die gerade nicht antwortet. Eine Nebenangabe darf die Seite nie kosten.
   */
  previous: BrandCheckPrevious | null
  /**
   * DER PLATZ IM RANKING — nur für Checks, die dort überhaupt erscheinen
   * (Häkchen gesetzt, nicht ausgeblendet, Wert über 0). `null` für alle
   * anderen: eine Platzierung zu nennen, die auf der Ranking-Seite niemand
   * findet, wäre eine erfundene Zahl.
   */
  rank: BrandCheckRank | null
}

/** Schmal mit Absicht: mehr als Zahl, Band und Datum braucht eine Delta-Pille nicht. */
export interface BrandCheckPrevious {
  id: string
  score: number
  band: string
  createdAt: string
}

/**
 * `position` ist 1-basiert, `total` die Zahl der Auftritte im Lesefenster des
 * Rankings (`BRAND_CHECK_RANKING_SCAN_LIMIT`) — dieselbe Zahl, die die
 * Ranking-Seite oben nennt, damit „Platz 3 von 12" an beiden Stellen dasselbe
 * bedeutet.
 */
export interface BrandCheckRank {
  position: number
  total: number
}

// ── Ranking, Korrekturen, Betreiber-Fläche (BRAND-CHECK-SEITE §3/§3b/§7) ────

/**
 * EINE ZEILE DES RANKINGS. Bewusst SCHMAL: Host, Zahl, Band, Branche, Quelle,
 * Datum und die acht Kategorie-Werte — mehr braucht eine Tabelle nicht, und
 * jedes zusätzliche Feld wäre eine weitere Aussage über eine FREMDE Marke auf
 * einer öffentlichen, indexierbaren Seite (§3 „Recht").
 *
 * Was hier NICHT steht und in `BrandCheckResult` schon: die vollständige
 * Adresse (nur der Host), die vierzig Kriterien mit ihren Zitaten und die drei
 * Befunde. Wer sie sehen will, öffnet die Ergebnis-Seite — dort steht auch der
 * Weg, den Eintrag entfernen zu lassen.
 *
 * `categories[].score` ist der auf 0–100 normierte Wert DIESER Kategorie, und
 * `null` heisst „nicht bewertbar" — nicht „null Punkte". Eine Bestenliste je
 * Kategorie sortiert solche Zeilen deshalb ans Ende und nicht nach unten
 * (`sortBrandCheckRankingItems`).
 */
export interface BrandCheckRankingItem {
  id: string
  host: string
  score: number
  band: string
  industry: string
  /** 'website' | 'document' — zwei Zahlen, die nicht dasselbe messen (§5b). */
  source: string
  createdAt: string
  categories: { id: string, score: number | null }[]
}

/**
 * `total` ist die Zahl der Auftritte NACH Filter und NACH der Auswahl „je
 * Adresse der jüngste" — also genau das, was die Seitenleiste zählen soll, und
 * nicht die Zeilenzahl der Tabelle. Sie ist durch das Lesefenster gedeckelt
 * (`BRAND_CHECK_RANKING_SCAN_LIMIT`); die Begründung steht dort.
 */
export interface BrandCheckRankingResponse {
  items: BrandCheckRankingItem[]
  total: number
  page: number
  pageSize: number
}

/** Der Vorschlag ist angekommen — mehr sagt die öffentliche Antwort nicht. */
export interface BrandCheckCorrectionResponse {
  ok: true
}

/**
 * EIN KORREKTURVORSCHLAG, WIE IHN DER BETREIBER SIEHT.
 *
 * `reporterEmail` steht hier und NUR hier (die Liste ist `users.manage`);
 * `ipHash` steht auch hier nicht — er ist ein pseudonymer Personenbezug und
 * gehört dem Deckel, nicht der Ansicht. `host` und `current` reisen mit, damit
 * die Liste ohne einen zweiten Abruf je Zeile entscheidbar ist.
 */
export interface BrandCheckCorrection {
  id: string
  checkId: string
  host: string
  field: string
  /** Der heutige Wert des Feldes im Check — leer, wenn der Check fehlt. */
  current: string
  proposed: string
  reason: string
  reporterEmail: string
  status: string
  decisionNote: string
  decidedAt: string
  createdAt: string
}

export interface BrandCheckCorrectionListResponse {
  items: BrandCheckCorrection[]
  total: number
  /** Leer = keine weitere Seite (dieselbe Regel wie in der Warteliste). */
  nextCursor: string
  counts: Record<string, number>
}

/** Angenommen bzw. abgelehnt — `changed: false` heisst „war schon so". */
export interface BrandCheckCorrectionDecisionResponse {
  ok: true
  status: 'accepted' | 'declined'
  changed: boolean
}

/** Der Entfernen-Weg des Betreibers (§3 „Recht", §7). */
export interface BrandCheckHiddenResponse {
  ok: true
  hidden: boolean
}

// ── Meine Brands & Scores (BRAND-CHECK-SEITE §5 / §5b) ─────────────────────

/**
 * EIN EINTRAG IM VERLAUF EINER BRAND.
 *
 * Schmal wie eine Ranking-Zeile und aus demselben Grund NICHT dieselbe: hier
 * steht kein `host` und keine `industry` (die Brand kennt der Leser, es ist
 * seine eigene), dafür die QUELLE — Website und Fundament laufen in einer
 * Liste nebeneinander und müssen unterscheidbar bleiben, weil ihre Zahlen
 * nicht dasselbe messen (§5b).
 *
 * `categories[].score` ist auf 0–100 normiert (`brandCheckCategoryScores`);
 * `null` heisst „nicht bewertbar", nicht „null Punkte".
 */
export interface BrandCheckHistoryItem {
  id: string
  /** 'website' | 'document'. */
  source: string
  score: number
  band: string
  createdAt: string
  categories: { id: string, score: number | null }[]
}

/**
 * EINE ZEILE DER GEGENÜBERSTELLUNG. `delta: null` heisst „kein Vergleich
 * möglich" und ist etwas anderes als `delta: 0` („gemessen und gleich") — die
 * Begründung steht in `shared/brandCheckHistory.ts`.
 */
export interface BrandCheckDiffCategory {
  id: string
  latest: number | null
  previous: number | null
  delta: number | null
  trend: 'up' | 'down' | 'same' | 'new'
}

/** Zwei Checks DERSELBEN Quelle, nebeneinandergelegt. */
export interface BrandCheckDiff {
  latestId: string
  previousId: string
  latestAt: string
  previousAt: string
  source: string
  latestScore: number
  previousScore: number
  delta: number
  categories: BrandCheckDiffCategory[]
}

/**
 * `diff` ist `null`, solange es keinen Vorgänger derselben Quelle gibt — der
 * Normalfall beim ersten Check einer Brand. Die Seite lässt den Abschnitt dann
 * weg, statt eine Tabelle aus Strichen zu zeigen.
 */
export interface BrandCheckHistoryResponse {
  items: BrandCheckHistoryItem[]
  diff: BrandCheckDiff | null
}

/** Der jüngste Stand EINER Quelle — für die Karten der Übersicht. */
export interface BrandProfileScoreEntry {
  checkId: string
  score: number
  band: string
  createdAt: string
}

/**
 * Die zwei Zahlen EINER Brand. Getrennt und nicht zu einer verrechnet: eine
 * Brand kann eine starke Website und ein leeres Fundament haben (oder
 * umgekehrt), und ein Mittelwert daraus wäre eine Zahl, die niemand erklären
 * kann. `null` heisst „dafür gibt es noch keinen Check".
 */
export interface BrandProfileScores {
  profileId: string
  /**
   * DIE DREI STAMMFELDER STEHEN HIER MIT, WEIL SIE NICHTS KOSTEN (P6c).
   *
   * `scores.get.ts` LIEST die `brand_profiles`-Zeilen ohnehin — ohne sie wüsste
   * es nicht, welche Brands diesem Konto gehören. Titel, Adresse und Branche
   * mitzugeben kostet also keine zusätzliche Abfrage, erspart der Liste
   * `/dashboard/brand-scores` aber die zweite Rundreise zu
   * `GET /api/brand/profiles` — und damit den Zustand, in dem eine Zeile ihre
   * Zahl schon hat und ihren Namen noch nicht.
   *
   * Es ist bewusst KEINE zweite Wahrheit über das Profil: es sind drei
   * Anzeige-Felder, keine Bearbeitungsfläche. Wer ein Branding ändert, tut das
   * über `PATCH /api/brand/profiles/:id`, und die Karten-Übersicht liest
   * weiterhin die volle `BrandProfileSummary`.
   */
  title: string
  websiteUrl: string
  industry: string
  website: BrandProfileScoreEntry | null
  document: BrandProfileScoreEntry | null
  /**
   * DER VERÖFFENTLICHUNGS-ZUSTAND FÜR DIE KARTE (Discover D1, §4.3).
   *
   * `null` heisst „nie eingereicht". Er reist in DIESER Antwort mit und nicht
   * in einer eigenen Route, aus demselben Grund wie die drei Stammfelder
   * darüber: die Übersicht fragt einmal für ALLE Karten, und eine Abfrage je
   * Karte wäre das N+1, das `activeShareProfileIds` schon einmal verhindert hat.
   *
   * Nur Zustand, Adresse und das Datum — die BEGRÜNDUNG einer Ablehnung steht
   * in der Leseansicht, nicht auf einer Kachel neben elf anderen.
   */
  publication: {
    status: BrandPublicationViewStatus
    slug: string
    /** Leer, solange nichts freigegeben wurde. */
    publishedAt: string
  } | null
}

export interface BrandProfileScoresResponse {
  items: BrandProfileScores[]
}

// ── Discover Brands (docs/plans/DISCOVER-BRANDS.md §4.1/§4.2, Paket D2) ──────

/**
 * WELCHE MESSUNG EINE ZAHL IST (Entscheidung 5): der Auftritt („Brand Score")
 * oder das Dokument („Fundament-Reife"). Es sind dieselben zwei Quellen, die
 * `brand_checks.source` kennt — hier ohne den Umweg über die Check-Typen, weil
 * die Galerie sonst die halbe Check-Welt mitschleppte.
 */
export type BrandDiscoverScoreKind = 'website' | 'document'

export interface BrandDiscoverScore {
  kind: BrandDiscoverScoreKind
  value: number
  /** Das Band der Zahl ('strong', …) — die Kachel schreibt es unter den Ring. */
  band: string
}

/**
 * Die ZWEITE Zahl, wenn eine Marke beide hat. Ohne `band`: sie steht als kleine
 * Zeile da und nicht als Urteil, und ein zweites Band neben dem ersten wäre die
 * Einladung, sie zu vergleichen — zwei verschiedene Messungen.
 */
export interface BrandDiscoverSecondary {
  kind: BrandDiscoverScoreKind
  value: number
}

/**
 * EINE KACHEL — und zugleich der STECKBRIEF der Anatomie (§4.2).
 *
 * Bewusst EIN Typ für beide: der Steckbrief nennt genau die Felder, die auch
 * die Kachel trägt (Branche · Weiche · Archetyp · Sprache · Veröffentlicht),
 * und zwei Typen mit denselben Feldern wären zwei Stellen, an denen ein neues
 * Feld nachgetragen werden müsste.
 *
 * WAS NICHT DRINSTEHT: die Profil-Id (die Adresse ist der Slug), der Snapshot
 * (er wird server-seitig zum Fundament gerechnet), `featuredAt`, `reportCount`,
 * `decisionNote` — Kuration und Moderation sind keine Auskunft an die
 * Öffentlichkeit. `featured` steht als BOOLEAN da, weil die Galerie den
 * Aufmacher markieren muss, nicht weil jemand das Datum braucht.
 */
export interface BrandDiscoverItem {
  slug: string
  title: string
  /** `new` oder `relaunch` — die Weiche, als Facette und als Badge. */
  pathKind: string
  /** Normalisierte Katalog-Id oder `unknown` (§4.1). */
  industry: string
  /** Archetyp-Ids (`d.primary`/`d.secondary`); '' heisst „nicht gesetzt". */
  archetype: string
  archetypeSecondary: string
  paletteId: string
  /** Die Inhaltssprache der Marke — nicht die des Lesers. */
  locale: string
  publishedAt: string
  /** Das redaktionelle Beispiel-Branding trägt sein Etikett offen (§9.4). */
  example: boolean
  featured: boolean
  score: BrandDiscoverScore | null
  secondary: BrandDiscoverSecondary | null
}

export interface BrandDiscoverListResponse {
  items: BrandDiscoverItem[]
  /** Einträge im Fenster nach dem Filtern — nicht die Zeilen der Tabelle. */
  total: number
  page: number
  pageSize: number
  /** Brand of the Day: genau eine, die letzte gewinnt (Entscheidung 6). */
  featured: BrandDiscoverItem | null
  /**
   * Ohne Kuration blättert der Aufmacher die drei NEUESTEN (Entscheidung 6).
   * Er ist auch dann gefüllt, wenn `featured` steht — die Seite entscheidet,
   * was sie zeigt, und eine Antwort mit einem Feld, das je nach anderem Feld
   * fehlt, zwänge sie zu zwei Abfragen.
   */
  spotlight: BrandDiscoverItem[]
}

/**
 * Der GRUND als Id, nie als Satz — die Kachel schreibt ihn in ihrer Sprache.
 *
 * DREI GRÜNDE, IN DIESER STÄRKE (D4): Archetyp · Farbwelt · Branche. Die
 * Reihenfolge ist die Aussagekraft, nicht der Zufall — „gleicher Archetyp"
 * beschreibt die HALTUNG einer Marke, „gleiche Farbwelt" ihr Aussehen,
 * „gleiche Branche" nur ihr Umfeld. Wer in mehreren Töpfen steht, erscheint
 * einmal, mit dem stärksten (s. `similarDiscoverEntries`).
 */
export interface BrandDiscoverSimilar {
  slug: string
  title: string
  paletteId: string
  reason: 'archetype' | 'palette' | 'industry'
}

/** Der Markenabdruck der Anatomie — der Check, der beim Einreichen galt. */
export interface BrandDiscoverCheck {
  id: string
  score: number
  band: string
  categories: { id: string, score: number | null }[]
}

export interface BrandDiscoverEntryResponse {
  /**
   * Nur in der Betreiber-Vorschau (`?preview=1`, users.manage): die Antwort
   * zeigt den EINGEREICHTEN Stand einer wartenden Marke und ist `noindex`.
   */
  preview?: boolean
  publication: BrandDiscoverItem
  /**
   * Das Fundament, SERVER-SEITIG aus dem eingefrorenen Snapshot gerechnet
   * (`buildBrandFoundation`) — derselbe Renderer wie die Leseansicht und der
   * geteilte Link. Der ROHE Snapshot verlässt den Server nicht: er trägt
   * Slot-Ids und Kapitel, die niemand ausserhalb braucht, und was einmal in
   * einer Antwort steht, steht in jedem Cache.
   */
  foundation: BrandFoundationView
  check: BrandDiscoverCheck | null
  similar: BrandDiscoverSimilar[]
}

/* ── ERSTGESPRÄCH (BS1 Paket Z0) ─────────────────────────────────────────── */

/**
 * DIE ANTWORT DER ÖFFENTLICHEN ANFRAGE-ROUTE.
 *
 * `ok` ist immer `true`: die Route antwortet 200 oder wirft (400 bei kaputtem
 * Rumpf, 422 wenn zu schnell abgeschickt, 429 aus der Drossel, 503 wenn WEDER
 * Zeile NOCH Mail durchkamen). Ein `ok: false` gäbe es nie.
 *
 * `stored` und `mailed` sagen, welcher der beiden entkoppelten Zustellwege
 * geklappt hat. Sie stehen in der Antwort, weil das Formular sonst nicht
 * ehrlich sein könnte: ohne Bestätigungs-Mail („schaut in euer Postfach") wäre
 * der Erfolgstext ein Versprechen auf etwas, das nicht kommt. Sie verraten
 * nichts — dass eine Anfrage abgelegt wurde, weiss der Absender ohnehin, weil
 * er sie gerade abgeschickt hat.
 */
export interface BrandIntroCallResponse {
  ok: true
  stored: boolean
  mailed: boolean
}

/** Eine Anfrage in der Betreiber-Liste. */
export interface BrandIntroRequestItem {
  id: string
  name: string
  email: string
  company: string
  message: string
  phone: string
  locale: string
  source: string
  /** Leer, wenn die Anfrage von der öffentlichen Seite kam. */
  profileId: string
  userId: string
  status: string
  note: string
  createdAt: string
}

export interface BrandIntroListResponse {
  items: BrandIntroRequestItem[]
  total: number
  /** Leer heisst „letzte Seite" (s. Begründung in der Warteliste). */
  nextCursor: string
  counts: Record<string, number>
}

/** Die Antwort auf eine Änderung — die ganze Zeile, damit die Liste nicht neu lädt. */
export interface BrandIntroPatchResponse {
  ok: true
  item: BrandIntroRequestItem
}

/**
 * EINE ZEILE DER BETREIBER-LISTE „BRAND DESIGN" (Konzept §2.10, Paket D1).
 *
 * Sie trägt genau das, was für die EINE Entscheidung nötig ist: darf diese
 * Marke Schicht 2 bekommen, und hat sie sie schon? Kein Snapshot, keine Slots,
 * kein Inhalt — die Betreiber-Liste ist eine Arbeitsliste, kein Einblick in
 * fremde Markenarbeit.
 */
export interface BrandDesignUnlockItem {
  id: string
  title: string
  pathKind: BrandPathKind
  contentLocale: string
  /** Der Cache-Wert der FOUNDATION (Schicht 2 zählt dort bewusst nicht mit). */
  progressPct: number
  /** Ist `result` abgeschlossen? Ohne das bleibt Schicht 2 zu — auch nach dem Klick. */
  foundationDone: boolean
  /** `null` = gesperrt. Der Zeitpunkt, weil die Liste „seit …" sagt. */
  designUnlockedAt: string | null
  /** Betreiber-Id, leer wenn gesperrt. Kein Name — die Liste ist kein Personenverzeichnis. */
  designUnlockedBy: string
  createdAt: string
}

export interface BrandDesignUnlockListResponse {
  items: BrandDesignUnlockItem[]
  total: number
  /** Leer heisst „letzte Seite" (s. Begründung in der Warteliste). */
  nextCursor: string
}

/** Die Antwort beider Entscheidungs-Routen — die ganze Zeile, damit die Liste nicht neu lädt. */
export interface BrandDesignUnlockResponse {
  ok: true
  item: BrandDesignUnlockItem
}

/**
 * EINE ZEILE DER BETREIBER-SEITE „FREISCHALTUNGEN" (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.20 Nr. 5, Paket K1) — BEIDE Schranken einer
 * Marke nebeneinander: Brand Design (Schicht 2) und die Ableitung (Book & Kit
 * + Marktvergleich).
 *
 * ── WARUM SIE DIE DESIGN-ZEILE ERWEITERT UND NICHT DANEBEN STEHT ─────────
 * Die Seite ist EINE Tabelle mit zwei Spalten (Davids Entscheidung §2.20
 * Nr. 5): „zwei Listen untereinander hätten dieselbe Marke zweimal gezeigt und
 * die Frage ‚was hat die eigentlich?' nie beantwortet." Beide Zustände stehen
 * in DERSELBEN `brand_profiles`-Zeile — sie zweimal zu holen wäre derselbe
 * Lesevorgang doppelt. Die schmale `BrandDesignUnlockItem` bleibt daneben
 * bestehen: sie ist die Antwort der Design-Liste, die ihren eigenen Beweis hat
 * (`verify-brand-sessions.mjs`).
 */
export interface BrandUnlockItem extends BrandDesignUnlockItem {
  /** `null` = kein FELD. Ein Beta-Konto ist trotzdem frei — s. `derivationGrant`. */
  derivationUnlockedAt: string | null
  /** Betreiber-Id bzw. Stripe-Event-Id; leer, wenn kein Feld gesetzt ist. */
  derivationUnlockedBy: string
  /**
   * DAS ERGEBNIS DER PUREN REGEL (`resolveDerivationAccess`) — nicht die
   * Spalte. `'beta'` heisst „das KONTO des Eigentümers ist ein Beta-Konto,
   * ganz ohne Feld"; `'none'` heisst „gesperrt". Der Chip nennt die Herkunft
   * immer: „frei" ohne „warum" wäre in einem Streitfall keine Auskunft.
   */
  derivationGrant: BrandDerivationGrant
}

export interface BrandUnlockListResponse {
  items: BrandUnlockItem[]
  total: number
  /** Leer heisst „letzte Seite" (s. Begründung in der Warteliste). */
  nextCursor: string
}

/** Die Antwort beider Ableitungs-Routen — die ganze Zeile, damit die Liste nicht neu lädt. */
export interface BrandUnlockResponse {
  ok: true
  item: BrandUnlockItem
}

/**
 * DIE VORBILDER (Konzept §2.2 Schritt 2, Paket D2a) — die Antworten der vier
 * Routen unter `/api/brand/profiles/:id/inspiration`.
 *
 * Sie tragen NIE einen Bild-Inhalt und nie eine Bucket-Adresse: das Bild holt
 * die Werkstatt einzeln über `…/inspiration/:id/image`, und nur der Besitzer
 * bekommt es (§2.13). Ein Feld `url` hier wäre der kürzeste Weg zu genau dem
 * Leck, das die eigene Ausliefer-Route verhindert.
 */
export interface BrandInspirationItemsResponse {
  items: BrandInspirationEntry[]
  /** Wie viele noch gehen — die Werkstatt schreibt daraus „n von 12". */
  max: number
}

/** Anlegen und Ändern antworten mit der GANZEN Liste, damit die Karte nicht nachlädt. */
export interface BrandInspirationWriteResponse extends BrandInspirationItemsResponse {
  ok: true
  /** Der gerade angelegte bzw. geänderte Eintrag — `null` beim Entfernen. */
  item: BrandInspirationEntry | null
}

/**
 * DAS FAZIT DES LETZTEN LAUFS (D2b) — es steht im Slot-Wert von `g.reading`,
 * nicht in der Tabelle, und wird für die Werkstatt daraus zurückgelesen.
 *
 * `state` ist GERECHNET (`brandReadingState`), nicht gespeichert: ein zweiter
 * Stempel könnte von den Bildern abweichen, und die Frage „passt die Lesung
 * noch zu dem, was da liegt" hat genau eine richtige Antwort — die aus den
 * Zeilen. Der Client rechnet dieselbe Regel nach jedem Upload selbst nach.
 */
export interface BrandInspirationReadingView {
  state: BrandReadingState
  summary: { keeps: string[], improves: string[] }
  /** Zeit, Anzahl und Modell des letzten Laufs — fertiger Satz, kein Datensatz. */
  runLine: string
}

export interface BrandInspirationListResponse extends BrandInspirationItemsResponse {
  reading: BrandInspirationReadingView
}

/**
 * DIE ANTWORT EINES LAUFS (`POST …/inspiration/read`, D2b) — dieselbe Liste
 * wie beim GET, plus das REST-KONTINGENT: der Mensch soll unter dem Knopf
 * sehen, wie oft er heute noch lesen lassen kann, ohne es zählen zu müssen.
 */
export interface BrandInspirationReadResponse extends BrandInspirationListResponse {
  ok: true
  quota: { used: number, limit: number, remaining: number }
}

/**
 * DIE ANTWORT DES DNA-VORSCHLAGS (`POST …/dna/propose`, Brand Design D2c,
 * §2.2 Schritt 4).
 *
 * ── WARUM SIE DIE ZEILEN MITSCHICKT UND NICHT NUR „ok" ───────────────────
 * Der Lauf schreibt den Slot-Wert SERVER-seitig (wie die Lesung, D2b). Die
 * Werkstatt könnte ihn danach aus dem nachgeladenen Baustein zurücklesen —
 * und tut es auch —, aber sie soll den Vorschlag ZEIGEN können, bevor der
 * zweite Ruf zurück ist. Die Zeilen hier sind dieselben, die im Slot-Wert
 * stehen; sie sind eine Abkürzung, keine zweite Wahrheit.
 *
 * `hasInspiration` sagt, ob der Lauf mit Vorbildern gerechnet hat — die
 * Oberfläche blendet den Herkunfts-Chip und den Vorbild-Satz danach aus, statt
 * auf jeder Zeile „Aus eurer Foundation" zu wiederholen, wo es gar keine
 * zweite Quelle gibt.
 */
export interface BrandDnaProposeResponse {
  ok: true
  entries: {
    dimension: string
    value: string
    origin: string
    reason: string
    inspirationReason?: string
  }[]
  hasInspiration: boolean
  /** Modell-Kennung ohne Schlüssel — sie steht unter dem Vorschlag. */
  model: string
  quota: { used: number, limit: number, remaining: number }
}

/**
 * DIE ANTWORT DES ZEICHEN-BRIEFINGS (`POST …/mark/brief`, Brand Design D5a,
 * §2.5 Stufe 1).
 *
 * Wie beim DNA-Vorschlag (D2c) schreibt der Lauf den Slot-Wert SERVER-seitig;
 * die sechs Felder hier sind eine Abkürzung, damit die Bühne das Briefing
 * zeigen kann, bevor der Nachlade-Ruf zurück ist — keine zweite Wahrheit.
 *
 * ZWEI der sechs Felder hat kein Modell geschrieben (Schutzraum, Varianten):
 * sie sind gerechnet. Die Antwort unterscheidet sie NICHT, weil der Leser sie
 * nicht unterscheiden muss — welches Feld woher kommt, sagt
 * `BRAND_MARK_BRIEF_FIELDS.written`.
 */
export interface BrandMarkBriefResponse {
  ok: true
  brief: {
    character: string
    formLanguage: string
    clearSpace: string
    variants: string
    noGos: string
    places: string
  }
  /** Modell-Kennung ohne Schlüssel — sie steht unter dem Briefing. */
  model: string
  quota: { used: number, limit: number, remaining: number }
}

/**
 * DIE KI-ENTWÜRFE DES ZEICHENS (`…/mark/drafts`, Brand Design D5c,
 * §2.5 Stufe 3).
 *
 * ── JEDE ANTWORT TRÄGT DIE GANZE LISTE ────────────────────────────────────
 * Wie bei den Vorbildern (D2a) und aus demselben Grund: die Werkstatt hält
 * keine eigene Liste, die sie fortschreibt. Ein Lauf legt vier Zeilen an, ein
 * „Behalten" ändert eine, ein Entfernen nimmt eine weg — und jedes Mal ist die
 * Antwort der ganze Stand. Zwei Zählungen (hier und im Browser) wären
 * spätestens nach dem ersten Entfernen zwei verschiedene.
 *
 * KEIN BILD und KEINE Bucket-Adresse: das Bild holt die Ausliefer-Route
 * einzeln, und zwar nur für den Besitzer (§2.13).
 */
export interface BrandMarkDraftsListResponse {
  items: BrandMarkDraftEntry[]
  /** Der Deckel je Marke — die Werkstatt schreibt „n von 12" darunter. */
  max: number
}

/**
 * DIE ANTWORT EINES LAUFS (`POST …/mark/drafts`).
 *
 * `created` ist die Zahl der WIRKLICH entstandenen Entwürfe und kann kleiner
 * als vier sein: Teilerfolg ist Erfolg (Kopf von
 * `server/utils/brandMarkDrafts.ts`). Das REST-KONTINGENT steht darin, weil der
 * Mensch unter dem Knopf sehen soll, wie oft er heute noch erzeugen kann, ohne
 * es zählen zu müssen.
 */
export interface BrandMarkDraftsRunResponse extends BrandMarkDraftsListResponse {
  ok: true
  created: number
  /** Modell-Kennung ohne Schlüssel — sie steht auf jeder Karte. */
  model: string
  quota: { used: number, limit: number, remaining: number }
}

/** Die Antwort von `PATCH`/`DELETE` — `item` ist beim Entfernen `null`. */
export interface BrandMarkDraftWriteResponse extends BrandMarkDraftsListResponse {
  ok: true
  item: BrandMarkDraftEntry | null
}
