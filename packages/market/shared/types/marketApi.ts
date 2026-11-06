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
 * Das Ergebnis EINES Laufs (§2.11 Nr. 2). Der VERGLEICH steht seit MV1 M3
 * darin, aber nur AUF ANSAGE (`withReport`, Default aus) — Begründung im Kopf
 * von `run.post.ts`.
 */
export interface MarketRunResponse {
  /** `false`, wenn es nichts zu tun gab (alle Kandidaten schon aktuell). */
  ran: boolean
  /** Je Kandidat der erreichte Stand — auch für die, die nichts zu tun hatten. */
  steps: MarketRunStep[]
  /**
   * Wurde extrahiert? `false` heisst: der Abruf lief, die Auswertung nicht
   * (Kill-Switch oder kein Schlüssel, §2.8 „die Seite meldet: KI ist aus").
   */
  aiEnabled: boolean
  /** Wie viele Kandidaten ein NEUES Marktprofil bekommen haben. */
  extracted: number
  /** Wie viele Kandidaten ihr vorhandenes Profil behalten haben (Idempotenz). */
  reused: number
  /**
   * Der Bericht, falls der Lauf mit `withReport` gerufen wurde (MV1 M3). Ohne
   * das Flag steht hier `null` — der Beweis von M2 prüft genau diese Form
   * weiter, und ein automatisch angehängter Bericht hätte ihn geändert.
   */
  report?: MarketReportView | null
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
