import type {
  MarketAiView,
  MarketCandidateSource,
  MarketClaimList,
  MarketCompetitor,
  MarketFinding,
  MarketProfile,
  MarketProfileField,
  MarketRunStep,
  MarketSourceOption,
} from '../marketProfile'
import type { MarketPaywallState } from '../marketPaywall'
import type { MarketMatrixRow } from '../marketReportRules'
import type { MarketRunDetailPhase } from '../marketRun'
import type { RunLeaseState } from '../../../core/shared/runLease'

/**
 * DIE ANTWORT-TYPEN DER `/api/market`-ROUTEN (MV1 M2).
 *
 * ── WARUM SIE ÜBERHAUPT EXISTIEREN ────────────────────────────────────────
 * Nitros Routen-Typisierung ist in diesem Repo AUS (CLAUDE.md, Davids
 * Entscheidung 2026-08-14): `$fetch('/api/x')` liefert `unknown`, und jeder
 * gebundene Aufruf nennt seinen Antworttyp SELBST. Diese Datei ist die
 * gemeinsame Wahrheit für beide Enden — Handler-Annotation UND Aufrufstelle.
 *
 * Sie liegt in `shared/types/`, weil der Server sie sonst nicht sieht
 * (Repo-Regel: Domain-Typen nie in `app/types/`).
 */

/** Die Kandidatenliste eines Brandings. */
export interface MarketCompetitorListResponse {
  competitors: MarketCompetitor[]
  /** Wie viele es höchstens sein dürfen (§2.9 Nr. 8) — die UI zeigt „3 von 5". */
  max: number
}

/** Anlegen und Ändern antworten mit dem GESPEICHERTEN Stand, nie mit dem Body. */
export interface MarketCompetitorResponse {
  competitor: MarketCompetitor
}

export interface MarketCompetitorDeleteResponse {
  removed: boolean
}

/**
 * Der Stand eines Brandings: Kandidaten, ihre Marktprofile und die getrennt
 * gehaltene KI-Aussensicht (§7.5 a — nie mit `profiles` vermischt).
 */
export interface MarketOverviewResponse {
  competitors: MarketCompetitor[]
  profiles: MarketProfile[]
  aiViews: MarketAiView[]
  /** Ist die KI zur Laufzeit an? (`app_config.brandAiEnabled`, Kill-Switch.) */
  aiEnabled: boolean
  /**
   * IST DAS PRODUKT FÜR DIESES BRANDING FREIGESCHALTET? (§2.4 — Kapitel B
   * abgenommen.) Die Seite braucht die Auskunft, weil sie den GESPERRTEN
   * Zustand freundlich erklären soll statt 404 zu antworten: es ist der
   * eigene Kunde, und ihm fehlt nur ein Schritt (MV1 M4).
   */
  unlocked: boolean
  /** WELCHES Kapitel das ist — damit die Seite den Link nicht raten muss. */
  unlockStepKey: string
  /** Die bezahlte Schranke (§1.9) — beide Zustände, s. `shared/marketPaywall.ts`. */
  paywall: MarketPaywallState
  /** Höchstzahl WETTBEWERBER (§2.9 Nr. 8); `self` zählt nicht mit. */
  max: number
  /** Das Opt-in dieses Brandings (§7.2 Nr. 4) — der Schalter in „Stand". */
  marketVisibility: 'private' | 'shared'
  /**
   * Der jüngste Lauf (GA1 P18). `state: 'none'` auch dann, wenn die
   * Lauf-Tabelle nicht lesbar war — die Seite bleibt ohne Lauf-Stand ladbar.
   */
  run: MarketRunView
}

/**
 * DIE WÄHLBAREN EINTRÄGE EINER NICHT-WEBSITE-QUELLE (§7.2 Nr. 2–4, MV1 M4).
 *
 * Eine eigene Route statt eines Feldes an der Übersicht: die Liste hängt an
 * einer SUCHE (`q`) und an einer Quelle, sie ändert sich beim Tippen, und sie
 * kostet je Quelle eine andere Abfrage. In der Übersicht mitzuliefern hiesse,
 * bei jedem Seitenaufbau drei Listen zu holen, von denen der Kunde meistens
 * keine öffnet.
 */
export interface MarketCandidateOptionsResponse {
  source: MarketCandidateSource
  options: MarketSourceOption[]
}

/** Die Antwort des Opt-in-Schalters — der GESPEICHERTE Stand, nie der Wunsch. */
export interface MarketVisibilityResponse {
  marketVisibility: 'private' | 'shared'
}

/**
 * DER JÜNGSTE LAUF EINES BRANDINGS, wie die Übersicht ihn meldet (GA1 P18,
 * BE-008). Der Zustand ist gegen die SERVER-Uhr gerechnet
 * (`core/shared/runLease.ts`); die Schritte tragen die Namen aus den
 * Kandidaten-Zeilen (das gespeicherte Detail kennt nur Kennungen).
 */
export interface MarketRunView {
  state: RunLeaseState
  startedAt: string
  finishedAt: string
  /** Wie viele Kandidaten der Lauf hat, und wie viele er schon gelesen hat. */
  total: number
  done: number
  phase: MarketRunDetailPhase
  /** War die KI beim Start an? `false` ⇒ „KI ist aus" nach dem Lauf. */
  aiEnabled: boolean
  /** Hat der Lauf mit etwas anderem als `done` geendet? */
  failed: boolean
  steps: MarketRunStep[]
}

/**
 * DIE ANTWORT AUF „MARKT VERGLEICHEN" (seit GA1 P18 ein 202).
 *
 * Bis P18 rechnete die Route alles in EINER Anfrage und antwortete mit
 * Schritten und Bericht. Seither antwortet sie, sobald der Lauf gesperrt und
 * gebucht ist; Fortschritt und Ergebnis liest die Seite über die Übersicht
 * (`MarketOverviewResponse.run`) und den Bericht (`GET /report`).
 */
export interface MarketRunResponse {
  /** `false`, wenn es nichts zu tun gab (keine Kandidaten) — dann ohne Lauf. */
  ran: boolean
  /** War die KI beim Start an? */
  aiEnabled: boolean
  /** Der eben gestartete Lauf (`state: 'running'`), sonst `null`. */
  run: MarketRunView | null
}

/**
 * DER BERICHT, WIE ER DEN SERVER VERLÄSST (MV1 M3).
 *
 * Er trägt genau die Formen, die die Prototyp-Komponenten erwarten
 * (`MkComparisonTable` baut aus `own`/`competitors`/`profiles`, `MkClaimList`
 * aus `claims`, `MkFindingChip` aus `findings`) — plus die SERVERSEITIG
 * gebaute Matrix, damit die Gegenüberstellung nachrechenbar ist und nicht nur
 * nachgebaut.
 */
export interface MarketReportView {
  createdAt: string
  revisionKey: string
  own: MarketProfileField[]
  competitors: MarketCompetitor[]
  profiles: MarketProfile[]
  matrix: MarketMatrixRow[]
  claims: MarketClaimList[]
  findings: MarketFinding[]
  aiViews: MarketAiView[]
  /** Die eigenen Felder, die bei uns noch nicht bestätigt sind (Plan §2.4). */
  missingOwnFields: string[]
}

export interface MarketReportResponse {
  report: MarketReportView | null
  /**
   * Passt der gespeicherte Bericht noch zum aktuellen Stand? `true` heisst
   * „überholt" — ein ANZEIGE-Wort, kein Löschen (Plan §2.4).
   */
  stale: boolean
  /** Kam er aus der Ablage statt aus einem Modell-Aufruf (§2.3 Nr. 5)? */
  reused: boolean
  aiEnabled: boolean
}

// ── Die freiwillige Bewertung (§2.10, MV1 M5) ──────────────────────────────

/**
 * DIE ANTWORT AUF „WAR DER VERGLEICH BRAUCHBAR?" (Plan §2.10: „eine
 * freiwillige Frage nach dem ersten Bericht").
 *
 * `counted: false` heisst „gab es schon" und ist KEIN Fehler: die Frage wird
 * je Branding genau einmal gezählt, und ein zweiter Klick (anderer Browser,
 * geleerter `localStorage`, zwei offene Tabs) soll dieselbe freundliche
 * Antwort bekommen wie der erste. Die Oberfläche bedankt sich in beiden
 * Fällen — ein „das haben Sie schon" wäre eine Belehrung für eine Gefälligkeit.
 */
export interface MarketRatingResponse {
  counted: boolean
}
