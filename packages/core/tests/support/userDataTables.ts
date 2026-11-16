/**
 * DIE LISTE: jede Tabelle und jede Ablage, und was Export und Löschung eines
 * Kontos mit ihr tun (GA1 P14, SEC-015/SEC-026).
 *
 * WARUM ES SIE GIBT: der Vertrag `registerUserDataContributor` sagt nur, DASS
 * ein Layer einen Beitrag liefert — nicht, ob der Beitrag alle Tabellen des
 * Layers kennt. Drei `brand`-Tabellen fehlten monatelang, weil sie nach dem
 * Beitrag entstanden; die Adresse am Einladungscode wanderte in eine zweite
 * Tabelle, die die Löschung nie gesehen hat. Seit dieser Liste braucht jede
 * Tabelle eine ENTSCHEIDUNG, und `user-data-coverage.test.ts` wird rot, wenn
 * eine neue Tabelle ohne Eintrag dazukommt oder ein Eintrag auf eine Datei
 * zeigt, die die Tabelle gar nicht anfasst.
 *
 * WOHER DIE TABELLEN KOMMEN: aus den gepflegten Soll-Listen in
 * `scripts/ops/verify-schema-parity.mjs` (dort trägt man eine neue Tabelle
 * ohnehin ein). Die Listen aus den Migrationen selbst zu erzeugen ist ein
 * späteres Paket (P20) — bis dahin gilt: neue Tabelle ⇒ dort UND hier.
 *
 * DREI ANTWORTEN je Richtung (Export, Löschung):
 *  - eine DATEI: dort wird die Tabelle für das Konto gelesen bzw. geleert. Der
 *    Test prüft, dass die Datei die Tabelle nennt (wörtlich oder über ihre
 *    Konstante) — nicht, dass sie es richtig tut; das belegen die Tests der
 *    Layer.
 *  - `skip('Grund')`: bewusst ausgenommen, mit einem Satz, der einem
 *    Außenstehenden erklärt, warum.
 *  - `NONE`: die Tabelle hat kein Feld mit Bezug zu einer Person.
 *
 * Wer eine Spalte mit Personenbezug an eine Tabelle hängt, die hier `NONE`
 * trägt, ändert den Eintrag mit.
 */

export interface Skip { skip: string }
export type Direction = string | Skip
export interface TableCoverage { export: Direction, erase: Direction }
export type Coverage = TableCoverage | 'none'

export const NONE = 'none' as const
export const skip = (reason: string): Skip => ({ skip: reason })

const SYSTEM = 'packages/system/server/utils/userDataContributor.ts'
const BILLING = 'packages/billing/server/utils/billingUserData.ts'
const FEEDBACK = 'packages/control/server/utils/customerFeedback.ts'
const COMMUNITY = 'packages/control/server/utils/communityErasure.ts'
const OPERATOR = 'packages/control/server/utils/controlOperatorUserData.ts'
const COMMENTS = 'packages/comments/server/utils/userDataContributor.ts'
const POSTS = 'packages/posts/server/utils/postsUserData.ts'
const EVENTS = 'packages/events/server/utils/eventsUserData.ts'
const COURSES = 'packages/courses/server/utils/coursesUserData.ts'
const MESSAGES = 'packages/messages/server/utils/messagesUserData.ts'
const MODERATION = 'packages/moderation/server/utils/userDataContributor.ts'
const TICKETS = 'packages/tickets/server/utils/ticketsUserData.ts'
const RUNNER = 'packages/runner/server/utils/runnerUserData.ts'
const BRAND = 'packages/brand/server/utils/brandUserData.ts'
const MARKET = 'packages/market/server/utils/marketUserData.ts'
const INSIGHTS = 'packages/insights/server/utils/insightsUserData.ts'
const PORTFOLIO_INTRO = 'apps/portfolio/server/utils/introRequestsUserData.ts'

const both = (file: string): TableCoverage => ({ export: file, erase: file })

/** Tabellen, die keine Soll-Liste des Paritäts-Skripts als `*_TABLES` führt. */
export const EXTRA_TABLES = ['intro_requests'] as const

export const USER_DATA_TABLES: Record<string, Coverage> = {
  // ── system (läuft auf jeder Instanz) ────────────────────────────────────
  account_handles: both(SYSTEM),
  activities: both(SYSTEM),
  // Name, IP und Zusatzangaben werden geleert; die Konto-Id bleibt als
  // Nachweis, wer wann was getan hat (ohne Frist — offener Punkt).
  audit_logs: both(SYSTEM),
  community_handles: both(SYSTEM),
  instance_secrets: both(SYSTEM),
  notifications: both(SYSTEM),
  app_config: NONE,
  app_secrets: NONE,
  community_branding: NONE,
  community_navigation: NONE,
  community_redirects: NONE,
  community_seo: NONE,
  custom_fonts: NONE,
  custom_themes: NONE,

  // ── admin, pages, analytics, media ──────────────────────────────────────
  changelog: NONE,
  pages: NONE,
  analytics_settings: NONE,
  media_items: NONE,

  // ── billing ─────────────────────────────────────────────────────────────
  billing_customers: both(BILLING),
  billing_subscriptions: both(BILLING),
  stripe_settings: both(BILLING),

  // ── Control Plane (erreicht über die Naht aus onboarding und feedback) ──
  customer_feedback: both(FEEDBACK),
  customer_feedback_comments: both(FEEDBACK),
  customer_feedback_votes: both(FEEDBACK),
  customer_feedback_mutes: both(OPERATOR),
  abuse_reports: {
    export: COMMUNITY,
    // Die Adresse eines Melders bleibt bis zu 90 Tage nach der Meldung und
    // fällt dann dem Lauf `abuseReportPrune` zu (Entscheidung 2026-11-12);
    // die Spalte des bearbeitenden Betreibers leert der Betreiber-Beitrag.
    erase: OPERATOR,
  },
  communities: {
    export: skip('Vertragsdaten der Community (Name, Abo), kein Feld des Kontos; die Mitgliedschaft steht im Export'),
    erase: skip('Vertrags- und Abrechnungsdaten mit Aufbewahrungspflicht; die Community gehört nicht dem einzelnen Konto'),
  },
  community_invites: both(COMMUNITY),
  community_members: both(COMMUNITY),
  invite_codes: both(COMMUNITY),
  invite_requests: both(COMMUNITY),
  provisioning_jobs: both(OPERATOR),
  community_plans: NONE,
  entitlements: NONE,
  product_catalog: NONE,
  reserved_names: NONE,
  websites: NONE,

  // ── comments ────────────────────────────────────────────────────────────
  comments: both(COMMENTS),
  comment_votes: both(COMMENTS),
  comment_reactions: both(COMMENTS),
  guest_authors: {
    export: skip('Kontaktdaten von Gästen ohne Konto; ein Konto ist darüber nicht auffindbar'),
    erase: skip('kein Konto-Schlüssel; der stündliche Lauf guestAuthorPrune löscht nach 90 Tagen'),
  },
  embed_sites: NONE,

  // ── posts ───────────────────────────────────────────────────────────────
  community_posts: both(POSTS),
  discussion_reactions: both(POSTS),
  member_counters: both(POSTS),
  poll_votes: both(POSTS),
  post_votes: both(POSTS),
  user_badges: both(POSTS),
  discussion_links: NONE,
  post_categories: NONE,
  post_views: NONE,

  // ── events ──────────────────────────────────────────────────────────────
  events: both(EVENTS),
  event_rsvps: both(EVENTS),
  event_tickets: both(EVENTS),
  event_votes: both(EVENTS),

  // ── courses ─────────────────────────────────────────────────────────────
  courses: both(COURSES),
  enrollments: both(COURSES),
  lesson_progress: both(COURSES),
  lessons: NONE,

  // ── messages ────────────────────────────────────────────────────────────
  conversations: both(MESSAGES),
  conversation_members: both(MESSAGES),
  message_blocks: both(MESSAGES),
  messages: both(MESSAGES),
  message_settings: NONE,

  // ── moderation ──────────────────────────────────────────────────────────
  reports: both(MODERATION),

  // ── tickets (Betreiber-Konsole) ─────────────────────────────────────────
  tickets: both(TICKETS),
  ticket_files: both(TICKETS),
  ticket_watchers: both(TICKETS),
  ticket_lists: NONE,

  // ── runner (Betreiber-Konsole) ──────────────────────────────────────────
  runs: both(RUNNER),
  run_events: {
    export: skip('Ablauf-Meldungen eines Laufs ohne Konto-Feld; der Lauf selbst steht im Export'),
    erase: skip('kein Konto-Feld; der Aufräum-Lauf des Runners löscht nach 90 Tagen'),
  },
  runners: NONE,

  // ── brand (branding.supply) ─────────────────────────────────────────────
  brand_profiles: both(BRAND),
  brand_steps: both(BRAND),
  brand_messages: both(BRAND),
  brand_shares: both(BRAND),
  brand_invites: both(BRAND),
  brand_access: both(BRAND),
  brand_events: both(BRAND),
  brand_findings: both(BRAND),
  brand_publications: both(BRAND),
  brand_publication_reports: both(BRAND),
  brand_intro_requests: both(BRAND),
  brand_waitlist: both(BRAND),
  brand_check_corrections: both(BRAND),
  // Löschen heißt hier: sofort versteckt, nach 90 Tagen endgültig
  // (`brandCheckErasure.ts`).
  brand_checks: { export: BRAND, erase: 'packages/brand/server/utils/brandCheckErasure.ts' },
  brand_inspiration: { export: 'packages/brand/server/utils/brandInspirationStore.ts', erase: 'packages/brand/server/utils/brandInspirationStore.ts' },
  brand_mark_drafts: { export: 'packages/brand/server/utils/brandMarkDrafts.ts', erase: 'packages/brand/server/utils/brandMarkDrafts.ts' },

  // ── market (hängt an der Marke; gelöscht über die Kaskade) ──────────────
  market_competitors: { export: MARKET, erase: 'packages/market/server/utils/marketStore.ts' },
  market_profiles: { export: MARKET, erase: 'packages/market/server/utils/marketStore.ts' },
  market_reports: { export: MARKET, erase: 'packages/market/server/utils/marketStore.ts' },
  // Die Lauf-Sperre (GA1 P18): nur Zeitpunkte, Ausgang und Zählerstände —
  // hängt aber an der Marke und geht mit ihr (Kaskade über `subject`).
  market_runs: { export: MARKET, erase: 'packages/market/server/utils/marketStore.ts' },

  // ── insights ────────────────────────────────────────────────────────────
  insights_posts: both(INSIGHTS),
  insights_brands: both(INSIGHTS),
  insights_corrections: both(INSIGHTS),
  insights_subscribers: both(INSIGHTS),
  insights_topics: NONE,
  insights_channels: NONE,
  insights_watchlist: NONE,
  insights_sends: NONE,
  // Die Lauf-Sperre des Versands (GA1 P18): Zeitpunkte, Ausgang und
  // Zählerstände eines Stapels, `subject` ist eine Sende-Zeile — niemand
  // ist darin genannt.
  insights_runs: NONE,

  // ── pukalani.studio ─────────────────────────────────────────────────────
  intro_requests: both(PORTFOLIO_INTRO),
}

/**
 * ABLAGEN. `needle` ist die Zeichenfolge, an der der Test die Datei erkennt
 * (Bucket-Id oder der Name der Funktion, die die Dateien löscht).
 */
export interface BucketCoverage { export: Direction, erase: Direction, needle?: string }

export const USER_DATA_BUCKETS: Record<string, BucketCoverage | 'none'> = {
  'avatars': {
    export: skip('das Bild selbst steht nicht im Export; der Verweis darauf steht in den Konto-Angaben'),
    erase: 'packages/core/server/utils/userDataOrchestration.ts',
    needle: 'deleteAvatarFilesOf',
  },
  'gdpr-exports': {
    export: skip('ist selbst die Kopie der Daten eines gelöschten Kontos'),
    erase: skip('bleibt 30 Tage für den Betreiber lesbar; ein stündlicher Lauf löscht danach'),
  },
  'ticket-files': {
    export: 'packages/tickets/server/utils/ticketsUserData.ts',
    erase: skip('Anhänge sind Arbeitsmaterial des Boards; geleert wird, wer sie hochgeladen hat'),
    needle: 'TICKET_FILES_TABLE',
  },
  'runner-files': {
    export: skip('Protokolle und Anhänge der Läufe; der Auftragstext steht im Export des Runners'),
    erase: skip('Arbeitsmaterial der Betreiber-Konsole; Protokolle löscht der Aufräum-Lauf nach 30 Tagen'),
  },
  'brand-inspiration': {
    export: skip('im Export stehen die Angaben zu den Bildern, nicht die Bilder selbst'),
    erase: 'packages/brand/server/utils/brandInspirationStore.ts',
    needle: 'purgeBrandInspiration',
  },
  'brand-drafts': {
    export: skip('im Export stehen die Angaben zu den Entwürfen, nicht die Bilder selbst'),
    erase: 'packages/brand/server/utils/brandMarkDrafts.ts',
    needle: 'purgeBrandMarkDrafts',
  },
  'event-covers': {
    export: skip('das Titelbild steht nicht im Export; der Termin mit seinen Angaben schon'),
    erase: 'packages/events/server/utils/eventsUserData.ts',
    needle: 'redactEventContent',
  },
  'media': NONE,
  'fonts': NONE,
  'favicons': NONE,
}
