/**
 * DAS FRISTEN-BUCH DER LANGSAMEN ROUTEN (Wächter `routeDeadlineBudget.test.ts`,
 * Stand 2026-11-17).
 *
 * Jede Route, die einen langsamen Baustein erreicht (ein KI-Modell, eine fremde
 * Website, YouTube), steht hier GENAU EINMAL — mit einer von vier Bauformen:
 *
 *  - `inline`:   rechnet in der Anfrage; die Summe ihrer eigenen Fristen
 *                (Σ ms × times) bleibt unter der Wartezeit des Webservers
 *                (60 s, auf den Wegen in `LONG_PROXY_ROUTES` 180 s).
 *  - `detached`: antwortet `202` und rechnet mit `runDetached()` hinter der
 *                Antwort (Lauf-Sperre, `core/server/utils/runLease.ts`).
 *  - `stream`:   ein Stream, der alle 15 s ein Lebenszeichen schreibt
 *                (`startBrandStreamHeartbeat`).
 *  - `over`:     BEKANNTER BESTAND über der Wartezeit, mit Grund. Diese Liste
 *                darf nur schrumpfen — der Test hält ihre Größe fest.
 *
 * WIE GEZÄHLT WIRD: jede Frist, die die Route im ungünstigsten Fall
 * nacheinander abwartet, einmal; parallel gestartete Aufrufe
 * (`Promise.all`) zählen einmal. Die KI-Transporte des Core wiederholen
 * nicht (keine zweite Runde in `aiComplete.ts` & Co.); eine Aufrufstelle
 * ohne eigene `timeoutMs` bekommt die Vorgabe des Transports.
 *
 * EINE FRIST NENNT IHRE QUELLE: `constant` + `file` — der Test liest den Wert
 * der EXPORTIERTEN Konstante aus dem Quelltext (Lesen statt Importieren: der
 * Core hängt nie von einem Produkt-Layer ab, auch nicht in Tests). Wo die
 * Frist ein Literal in der Route ist oder in einer Datei steht, die gerade
 * eine andere Arbeit umbaut, steht `ms` mit `hand` (die Datei, in der die
 * Zahl stehen muss — der Test prüft, dass sie dort noch steht).
 */

export interface DeadlineFromConstant {
  readonly constant: string
  /** Pfad relativ zum Repo. */
  readonly file: string
  readonly times: number
  readonly what: string
}

export interface DeadlineByHand {
  /** Zahl von Hand — die Datei in `hand` muss sie (als Literal) enthalten. */
  readonly ms: number
  readonly hand: string
  readonly times: number
  readonly what: string
}

export type Deadline = DeadlineFromConstant | DeadlineByHand

export type RouteDeadlineEntry =
  | { readonly form: 'inline', readonly deadlines: readonly Deadline[] }
  | { readonly form: 'over', readonly deadlines: readonly Deadline[], readonly reason: string }
  /** `via`: Hilfe, in der `runDetached(` steht, wenn nicht in der Route selbst. */
  | { readonly form: 'detached', readonly via?: string }
  /** `via`: Hilfe, die das Lebenszeichen startet, wenn nicht die Route selbst. */
  | { readonly form: 'stream', readonly via?: string }

/** Die Wartezeit des Webservers (`proxy_read_timeout`), überall. */
export const PROXY_READ_TIMEOUT_MS = 60_000

/** Die Ausnahme auf branding.supply für die Wege in `LONG_PROXY_ROUTES`. */
export const LONG_PROXY_READ_TIMEOUT_MS = 180_000

/**
 * Der nginx-Block mit 180 s auf branding.supply — wörtlich aus
 * `docs/runbooks/BRANDING-SUPPLY-SETUP.md` § 7 (die vhost-Konfiguration liegt
 * nur in ploi). Der Test prüft, dass das Runbook ihn noch nennt und dass jeder
 * Weg in `LONG_PROXY_ROUTES` von ihm getroffen wird.
 */
export const LONG_PROXY_LOCATION = String.raw`^/api/insights/(posts/[^/]+/(draft|translate)|watchlist/[^/]+/brief)$`

/** Wege mit der 180-s-Frist (nur insights, nur branding.supply) — mit Grund. */
export const LONG_PROXY_ROUTES: Readonly<Record<string, string>> = {
  'packages/insights/server/api/insights/posts/[id]/draft.post.ts':
    'Artikel-Entwurf aus Brief und Quellen: ein langer Text-Lauf, seit BI3 unter dem 180-s-Block.',
  'packages/insights/server/api/insights/posts/[id]/translate.post.ts':
    'Übersetzung eines ganzen Artikels: ein langer Text-Lauf, seit BI3 unter dem 180-s-Block.',
}

const AI_COMPLETE = { constant: 'AI_COMPLETE_TIMEOUT_MS', file: 'packages/core/server/utils/aiComplete.ts' } as const
const AI_MODEL_CHECK = { constant: 'AI_MODEL_CHECK_TIMEOUT_MS', file: 'packages/core/server/utils/aiModelCheck.ts' } as const
const BRAND_SITE = { constant: 'BRAND_SITE_ANALYSIS_TIMEOUT_MS', file: 'packages/brand/shared/brandSiteAnalysis.ts' } as const
const BRAND_CRAWL = { constant: 'BRAND_CRAWL_TIMEOUT_MS', file: 'packages/brand/server/utils/brandSiteCrawl.ts' } as const
const BRAND_REVIEW_INLINE = { constant: 'BRAND_REVIEW_INLINE_BUDGET_MS', file: 'packages/brand/server/utils/brandReview.ts' } as const
const INSIGHTS_GATE = { constant: 'INSIGHTS_GATE_FETCH_BUDGET_MS', file: 'packages/insights/server/utils/insightsReview.ts' } as const

/** Eine Aufrufstelle ohne eigene `timeoutMs` an `aiCompleteJson` & Co. */
const oneTextCall = (what: string): RouteDeadlineEntry => ({
  form: 'inline',
  deadlines: [{ ...AI_COMPLETE, times: 1, what }],
})

/**
 * `fetchBrandSiteForCheck`: robots.txt, danach (nur wenn robots es erlaubt)
 * tdmrep.json, je mit der Crawl-Frist, dann die Seite selbst mit der
 * Analyse-Frist (eine Frist über alle Umleitungen).
 */
const SITE_FOR_CHECK: readonly Deadline[] = [
  { ...BRAND_CRAWL, times: 2, what: 'robots.txt und .well-known/tdmrep.json (nacheinander)' },
  { ...BRAND_SITE, times: 1, what: 'die Seite selbst, eine Frist über alle Umleitungen' },
]

export const ROUTE_DEADLINES: Readonly<Record<string, RouteDeadlineEntry>> = {
  // ── admin ─────────────────────────────────────────────────────────────────
  'packages/admin/server/api/admin/config.patch.ts': {
    form: 'inline',
    deadlines: [{ ...AI_MODEL_CHECK, times: 1, what: 'Modell-Endpunkte beim Anbieter nachschlagen (nur bei neuem Modell)' }],
  },

  // ── brand ─────────────────────────────────────────────────────────────────
  // Öffentlicher Brand-Check (LL1 b): Lauf-Sperre, 202, der Lauf rechnet in
  // `startBrandRun`. Ein Treffer im Zwischenspeicher antwortet weiter sofort mit 200.
  'packages/brand/server/api/brand/check.post.ts': {
    form: 'detached',
    via: 'packages/brand/server/utils/brandRun.ts',
  },
  'packages/brand/server/api/brand/profiles/[id]/analyze.post.ts': {
    form: 'inline',
    deadlines: [{ ...BRAND_SITE, times: 1, what: 'die eingereichte Seite lesen, eine Frist über alle Umleitungen' }],
  },
  // Fundament-Check (LL1 b): Lauf-Sperre, 202, der Lauf rechnet in `startBrandRun`.
  // Ein Treffer im Zwischenspeicher antwortet weiter sofort mit 200.
  'packages/brand/server/api/brand/profiles/[id]/check.post.ts': {
    form: 'detached',
    via: 'packages/brand/server/utils/brandRun.ts',
  },
  'packages/brand/server/api/brand/profiles/[id]/dna/propose.post.ts': {
    form: 'inline',
    deadlines: [{ constant: 'BRAND_DNA_TIMEOUT_MS', file: 'packages/brand/server/utils/brandDnaProposal.ts', times: 1, what: 'der DNA-Vorschlag (ein Text-Lauf)' }],
  },
  // Vorbilder lesen (LL1 b): Lauf-Sperre, 202, der Lauf rechnet in `startBrandRun`.
  'packages/brand/server/api/brand/profiles/[id]/inspiration/read.post.ts': {
    form: 'detached',
    via: 'packages/brand/server/utils/brandRun.ts',
  },
  'packages/brand/server/api/brand/profiles/[id]/mark/brief.post.ts': {
    form: 'inline',
    deadlines: [{ constant: 'BRAND_MARK_BRIEF_TIMEOUT_MS', file: 'packages/brand/server/utils/brandMarkBrief.ts', times: 1, what: 'der Zeichen-Brief (ein Text-Lauf)' }],
  },
  // Zeichen-Entwürfe (LL1 b): Lauf-Sperre, 202, der Lauf rechnet in `startBrandRun`.
  'packages/brand/server/api/brand/profiles/[id]/mark/drafts/index.post.ts': {
    form: 'detached',
    via: 'packages/brand/server/utils/brandRun.ts',
  },
  // Dokument-Prüfung (LL1 d): Lauf-Sperre, 202, der Lauf rechnet in `startBrandRun`.
  // Derselbe Stand schon geprüft ⇒ weiter sofort 200, ohne Lauf.
  'packages/brand/server/api/brand/profiles/[id]/review.post.ts': {
    form: 'detached',
    via: 'packages/brand/server/utils/brandRun.ts',
  },
  'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/converse.post.ts': { form: 'stream' },
  'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/generate.post.ts': { form: 'stream' },
  // Kapitel-Prüfung und Schliessen (LL1 d): EIN Zeitdeckel über beide Stufen —
  // Stufe 2 bekommt nur den Rest oder läuft nicht, dann gilt Stufe 1
  // (`reviewedBy: 'stage1'`, ein ehrliches Teil-Ergebnis).
  'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/review.post.ts': {
    form: 'inline',
    deadlines: [{ ...BRAND_REVIEW_INLINE, times: 1, what: 'Kapitel-Prüfung: ein Deckel über beide Stufen (Stufe 2 nur mit dem Rest)' }],
  },
  'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/close.post.ts': {
    form: 'inline',
    deadlines: [{ ...BRAND_REVIEW_INLINE, times: 1, what: 'Sitzungs-Prüfung beim Schliessen: ein Deckel über beide Stufen (Stufe 2 nur mit dem Rest)' }],
  },

  // ── comments ──────────────────────────────────────────────────────────────
  'packages/comments/server/api/admin/comments/[id]/assist.post.ts': oneTextCall('Moderations-Hilfe (ein Text-Lauf)'),
  'packages/comments/server/api/comments/[id]/translate.post.ts': oneTextCall('Übersetzung eines Kommentars'),

  // ── courses ───────────────────────────────────────────────────────────────
  'packages/courses/server/api/courses/[slug]/translate.post.ts': oneTextCall('Übersetzung eines Kurses'),
  'packages/courses/server/api/lessons/[id]/translate.post.ts': oneTextCall('Übersetzung einer Lektion'),

  // ── events ────────────────────────────────────────────────────────────────
  'packages/events/server/api/events/[id]/translate.post.ts': oneTextCall('Übersetzung eines Events'),

  // ── insights ──────────────────────────────────────────────────────────────
  'packages/insights/server/api/insights/brands/[id].patch.ts': {
    form: 'inline',
    deadlines: [{ ...INSIGHTS_GATE, times: 1, what: 'Belege der Quellen nacheinander lesen — EIN Zeitdeckel über alle (höchstens 20)' }],
  },
  'packages/insights/server/api/insights/channels/resolve.post.ts': {
    form: 'inline',
    deadlines: [{
      constant: 'INSIGHTS_CHANNEL_FETCH_TIMEOUT_MS',
      file: 'packages/insights/server/utils/insightsChannelsAdmin.ts',
      times: 2,
      what: 'YouTube: der Kanal, dann sein letztes Video (nacheinander)',
    }],
  },
  'packages/insights/server/api/insights/posts/[id]/change-note.post.ts': {
    form: 'inline',
    deadlines: [{ ms: 60_000, hand: 'packages/insights/server/api/insights/posts/[id]/change-note.post.ts', times: 1, what: 'die Änderungs-Notiz (ein Text-Lauf, Frist als Literal in der Route)' }],
  },
  'packages/insights/server/api/insights/posts/[id]/draft.post.ts': {
    form: 'inline',
    deadlines: [{ ms: 120_000, hand: 'packages/insights/server/api/insights/posts/[id]/draft.post.ts', times: 1, what: 'der Artikel-Entwurf (ein Text-Lauf, Frist als Literal in der Route)' }],
  },
  'packages/insights/server/api/insights/posts/[id]/evidence.post.ts': {
    form: 'inline',
    deadlines: SITE_FOR_CHECK,
  },
  'packages/insights/server/api/insights/posts/[id]/state.post.ts': {
    form: 'inline',
    deadlines: [{ ...INSIGHTS_GATE, times: 1, what: 'Belege der Quellen nacheinander lesen — EIN Zeitdeckel über alle (höchstens 20)' }],
  },
  'packages/insights/server/api/insights/posts/[id]/translate.post.ts': {
    form: 'inline',
    deadlines: [{ ms: 120_000, hand: 'packages/insights/server/api/insights/posts/[id]/translate.post.ts', times: 1, what: 'die Übersetzung des Artikels (ein Text-Lauf, Frist als Literal in der Route)' }],
  },
  'packages/insights/server/api/insights/posts/[id].patch.ts': {
    form: 'inline',
    deadlines: [{ ...INSIGHTS_GATE, times: 1, what: 'nur neue Belege lesen, nacheinander — EIN Zeitdeckel über alle (höchstens 20)' }],
  },
  'packages/insights/server/api/insights/radar/run.post.ts': { form: 'detached' },
  'packages/insights/server/api/insights/watchlist/[videoId]/brief.post.ts': { form: 'detached' },
  'packages/insights/server/api/insights/watchlist/index.post.ts': {
    form: 'inline',
    deadlines: [{
      constant: 'INSIGHTS_WATCH_FETCH_TIMEOUT_MS',
      file: 'packages/insights/server/utils/insightsWatchlistAdmin.ts',
      times: 2,
      what: 'YouTube: das Video, dann sein Kanal (nacheinander)',
    }],
  },

  // ── market ────────────────────────────────────────────────────────────────
  // Marktbericht (LL1 d): Lauf-Sperre in `market_runs` (Art `report`), 202, der
  // Lauf rechnet in `runMarketReport`. Ein wiederverwendeter Bericht antwortet
  // weiter sofort mit 200.
  'packages/market/server/api/market/profiles/[id]/report.post.ts': { form: 'detached' },
  'packages/market/server/api/market/profiles/[id]/run.post.ts': { form: 'detached' },

  // ── pages ─────────────────────────────────────────────────────────────────
  'packages/pages/server/api/pages/translate.post.ts': {
    form: 'over',
    deadlines: [{ ms: 120_000, hand: 'packages/pages/server/api/pages/translate.post.ts', times: 1, what: 'die Übersetzung einer Seite (ein Text-Lauf, Frist als Literal in der Route)' }],
    reason: 'Übersetzung einer ganzen CMS-Seite: ein Text-Lauf mit 120 s Frist in der Anfrage, '
      + 'ohne den 180-s-Block (der gilt nur auf branding.supply für insights).',
  },

  // ── posts ─────────────────────────────────────────────────────────────────
  'packages/posts/server/api/posts/[id]/assist.post.ts': oneTextCall('Moderations-Hilfe (ein Text-Lauf)'),
  'packages/posts/server/api/posts/[id]/translate.post.ts': oneTextCall('Übersetzung eines Beitrags'),
  'packages/posts/server/api/posts/categories/translate.post.ts': oneTextCall('Übersetzung einer Kategorie'),

  // ── tickets ───────────────────────────────────────────────────────────────
  'packages/tickets/server/api/tickets/[id]/triage.post.ts': oneTextCall('Einschätzung eines Tickets (ein Text-Lauf)'),
  'packages/tickets/server/api/tickets/settings.patch.ts': {
    form: 'inline',
    deadlines: [{ ...AI_MODEL_CHECK, times: 1, what: 'Modell-Endpunkte beim Anbieter nachschlagen (nur bei neuem Modell)' }],
  },
}
