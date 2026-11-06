#!/usr/bin/env node
/**
 * Hat jede Instanz die Tabellen, die dort existieren SOLLEN — und dieselben
 * Spalten, wo sich zwei Instanzen eine Tabelle teilen?
 *
 *   node scripts/ops/verify-schema-parity.mjs
 *
 * WARUM ES DAS GIBT (E5 → AU4): der `system`-Layer läuft auf JEDER Instanz mit,
 * und eine neue `system`-Migration muss überall gefahren werden. Die erste
 * Fassung (E5) prüfte deshalb NUR die `system`-Tabellen und verglich sie gegen
 * die VEREINIGUNG aller Instanzen. Das hat eine ganze Fehlerklasse übersehen:
 *
 *   Eine Tabelle, die auf ALLEN Instanzen fehlt (oder auf allen bis auf die,
 *   die sie ohnehin nicht braucht), fällt gegen die Vereinigung NIE auf — die
 *   Vereinigung kennt sie dann selbst nicht.
 *
 * Genau das ist am 2026-08-15 aufgeflogen (AU4): die `changelog`-Tabelle
 * (admin-Layer) wurde nach dem control-Cutover monatelang nicht in `control`
 * angelegt. Der Betreiber-Changelog blieb still leer, `changelog.get.ts`
 * verschluckte den 404 fail-soft, und der Wächter schwieg — weil `changelog`
 * keine `system`-Tabelle ist und der Union-Vergleich eine überall-fehlende
 * Tabelle nicht sehen kann.
 *
 * DER FIX: ein KURATIERTES SOLL PRO INSTANZ statt einer einzelnen system-Liste
 * gegen die Union. Für jede ausgerollte Instanz steht unten, welche Tabellen
 * dort existieren SOLLEN — unabhängig davon, was gerade live ist. Fehlt eine
 * Soll-Tabelle, ist es ein Fehler (auch wenn sie nirgends existiert).
 *
 * Philosophie wie schon bei `SYSTEM_TABLES`: die Soll-Listen sind GEPFLEGT,
 * nicht zur Laufzeit aus den Migrations-Dateien geparst. Die Dateien legen auch
 * Tabellen an, die später wieder verschwinden (Umbenennungen, Rückbauten) —
 * ein Wächter, der solche Altlasten anmahnt, wird weggelesen. Neue Tabelle ⇒
 * hier im passenden Layer-Block eintragen (Details bei jedem Block).
 *
 * DREI ARTEN VON BEFUND:
 *   • Soll-Tabelle FEHLT       → FATAL (exit 1). Der Kern-Fix (changelog-Lücke).
 *   • Spalte fehlt (Parität)   → FATAL (exit 1). Wie E5: eine Tabelle, die auf
 *                                mehreren Instanzen im GLEICHKLANG läuft, muss
 *                                dieselben Spalten tragen — sonst hing dort eine
 *                                Migration zurück. Der SCOPE ist bewusst eng,
 *                                siehe PARITY_TABLES weiter unten.
 *   • Ist-Tabelle NICHT im Soll → WARNUNG (nicht-fatal). Fängt neue, noch nicht
 *                                eingetragene Tabellen UND tote Alt-Tabellen
 *                                (portfolio schleppt sechs davon). Nicht fatal,
 *                                sonst wäre der Lauf wegen Legacy-Cruft dauerhaft
 *                                rot und „wird weggelesen".
 *
 * Schlüssel werden nie ausgegeben; gelesen werden nur Schema-Metadaten.
 * Exit 0 = alle Soll-Tabellen da + Spalten deckungsgleich (Warnungen erlaubt) ·
 * Exit 1 = irgendwo fehlt eine Soll-Tabelle oder eine Spalte ·
 * Exit 2 = weniger als zwei Instanzen lesbar (ohne Vergleich wertlos).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/* ────────────────────────────────────────────────────────────────────────────
 * LAYER-BLÖCKE — benannte Konstanten, aus denen sich die Instanz-Solls weiter
 * unten zusammensetzen. So trägt man eine neue Tabelle GENAU EINMAL ein (in
 * ihren Layer-Block) und sie gilt überall, wo der Block eingesetzt wird.
 *
 * LAYER→INSTANZ-KARTE (aus den `extends` der ausgerollten Apps):
 *   platform/account : themes admin blueprint comments posts events media
 *                      feedback courses activity messages moderation pages
 *                      onboarding analytics core system
 *   control          : themes admin control feedback billing tickets pages
 *                      core system
 *   portfolio        : themes admin analytics domains pages core system
 *                      — ABER Legacy-Silo: die Schema-Historie reicht weiter
 *                        zurück als diese Layer-Liste, portfolio trägt Tabellen
 *                        aus comments/posts/events/courses/tickets/moderation/
 *                        media/billing (teils nur als Teilmengen). Deshalb wird
 *                        sein Soll unten EXPLIZIT gepflegt, nicht rein aus
 *                        Blöcken komponiert.
 *   branding         : themes admin brand market pages core system
 *                      (Dashboard seit 2026-09-03, Marktvergleich seit
 *                       2026-09-05, Rechtsseiten seit 2026-09-07)
 *   photos           : themes admin media core system (noch nicht ausgerollt)
 *
 * GRUNDWAHRHEIT der Kuratierung: `account` und `control` sind gesund — ihr
 * Live-Stand IST ihr Soll (Stand AU4, 2026-08-16). Wirft eine dieser beiden
 * „TABELLE FEHLT", ist die Soll-Liste hier falsch, nicht die Instanz.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `system`-Layer — läuft auf JEDER Instanz mit (Pool, Control Plane, jede
 * Einzel-Instanz). Neue system-Tabelle ⇒ hier eintragen.
 */
const SYSTEM_TABLES = [
  'account_handles',
  'activities',
  'app_config',
  'app_secrets',
  'audit_logs',
  'community_branding',
  'community_handles',
  // system-036 (Instanz-Geheimnisse, KI-Schlüssel je Deployment) — fehlte in
  // der Soll-Liste und stand als „unbekannt"-Warnung auf account+control.
  'instance_secrets',
  'community_navigation',
  'community_redirects',
  'community_seo',
  'custom_fonts',
  'custom_themes',
  'notifications',
]

/** `admin`-Layer — der Betreiber-Changelog. Auf ALLEN ausgerollten Instanzen. */
const ADMIN_TABLES = ['changelog']

/** `pages`-Layer — CMS-Rechtstexte. account + control + portfolio + branding. */
const PAGES_TABLES = ['pages']

/** `analytics`-Layer — Plausible-Einstellungen. account + portfolio. */
const ANALYTICS_TABLES = ['analytics_settings']

/** `billing`-Layer — Stripe-Kunden/Abos/Einstellungen. account + control. */
const BILLING_TABLES = ['billing_customers', 'billing_subscriptions', 'stripe_settings']

/**
 * `feedback`-Layer (Kunden-Feedback/Early-Access) — die Tabellen liegen in
 * control-Migrationen, laufen aber auf account + control. Eigener Block, weil
 * die Instanz-Zugehörigkeit von den übrigen Control-Tabellen abweicht.
 */
const CUSTOMER_FEEDBACK_TABLES = [
  'customer_feedback',
  'customer_feedback_comments',
  'customer_feedback_mutes',
  'customer_feedback_votes',
]

/**
 * Control-Plane-Datenmodell (Communities, Team, Kataloge, Provisionierung) —
 * angelegt von den `control-NNN`-Migrationen, gefahren auf account + control.
 * `entitlements`/`provisioning_jobs` stehen hier, weil sie dem Control Plane
 * gehören — sie tauchen zwar ALT-BESTÄNDIG auch in portfolio auf, das wird dort
 * aber explizit gelistet (siehe portfolio-Soll), nicht über diesen Block.
 */
const CONTROL_TABLES = [
  'abuse_reports',
  'communities',
  'community_invites',
  'community_members',
  'community_plans',
  'entitlements',
  'invite_codes',
  'invite_requests',
  'product_catalog',
  'provisioning_jobs',
  'reserved_names',
  'websites',
]

/** `comments`-Layer — Kommentare + Reaktionen/Votes + Embed + Gast-Autoren. */
const COMMENTS_TABLES = [
  'comment_reactions',
  'comment_votes',
  'comments',
  'embed_sites',
  'guest_authors',
]

/** `posts`-Layer — Feed-Beiträge, Votes/Umfragen, Kategorien, Diskussionen. */
const POSTS_TABLES = [
  'community_posts',
  'discussion_links',
  'discussion_reactions',
  'member_counters',
  'poll_votes',
  'post_categories',
  'post_views',
  'post_votes',
  'user_badges',
]

/** `events`-Layer — Termine + Zu-/Absagen + Tickets + Votes. */
const EVENTS_TABLES = ['events', 'event_rsvps', 'event_tickets', 'event_votes']

/** `courses`-Layer — Kurse + Einschreibungen + Lektionen + Fortschritt. */
const COURSES_TABLES = ['courses', 'enrollments', 'lessons', 'lesson_progress']

/** `messages`-Layer — private Nachrichten + Blöcke + Einstellungen + Threads. */
const MESSAGES_TABLES = [
  'conversation_members',
  'conversations',
  'message_blocks',
  'message_settings',
  'messages',
]

/** `media`-Layer — Medienbibliothek. account + portfolio (+ photos künftig). */
const MEDIA_TABLES = ['media_items']

/** `moderation`-Layer — Meldungen. account + portfolio. */
const MODERATION_TABLES = ['reports']

/** `tickets`-Layer — Tickets + Anhänge + Listen + Beobachter. */
const TICKETS_TABLES = ['tickets', 'ticket_files', 'ticket_lists', 'ticket_watchers']

/**
 * `runner`-Layer — der AI-Runner (docs/plans/AI-RUNNER.md), angelegt von
 * `runner-001`. NUR `control`: das ist ein Betreiber-Werkzeug, es läuft
 * ausschließlich in `apps/control` und gehört auf keine Kunden-Instanz.
 *
 * Solange `runner-001` auf `control` noch nicht gefahren ist, meldet dieser
 * Lauf hier drei fehlende Tabellen — das ist genau der Zweck der kuratierten
 * Soll-Liste (die Migration muss VOR dem Code-Deploy laufen) und kein Fehler
 * der Liste. Kur: `pnpm migrate --app control --layer runner`.
 */
const RUNNER_TABLES = ['runners', 'runs', 'run_events']

/* ────────────────────────────────────────────────────────────────────────────
 * INSTANZ-SOLLS — je Instanz die Vereinigung ihrer Layer-Blöcke.
 * ──────────────────────────────────────────────────────────────────────────── */

/** account (apps/platform) = der Pool. Trägt das komplette Datenmodell. */
const ACCOUNT_SOLL = [
  ...SYSTEM_TABLES,
  ...ADMIN_TABLES,
  ...PAGES_TABLES,
  ...ANALYTICS_TABLES,
  ...BILLING_TABLES,
  ...CUSTOMER_FEEDBACK_TABLES,
  ...CONTROL_TABLES,
  ...COMMENTS_TABLES,
  ...POSTS_TABLES,
  ...EVENTS_TABLES,
  ...COURSES_TABLES,
  ...MESSAGES_TABLES,
  ...MEDIA_TABLES,
  ...MODERATION_TABLES,
  ...TICKETS_TABLES,
]

/** control (apps/control) = die Betreiber-Konsole + Control Plane. */
const CONTROL_SOLL = [
  ...SYSTEM_TABLES,
  ...ADMIN_TABLES,
  ...PAGES_TABLES,
  ...BILLING_TABLES,
  ...CUSTOMER_FEEDBACK_TABLES,
  ...CONTROL_TABLES,
  ...RUNNER_TABLES,
  /**
   * Mit E10 (2026-07-30) sind feedback UND tickets in apps/control
   * eingezogen — die Soll-Liste hat den Umzug nicht mitgemacht, und genau
   * deshalb blieb UNBEMERKT, dass die tickets-Migrationen auf Prod-control
   * NIE gefahren waren: das Aufgaben-Board war dort seit dem Einzug kaputt
   * (Befund 2026-08-18, beim ersten echten AI-Runner-Lauf). Kuratiert heißt
   * gepflegt: neuer Layer in einer Site ⇒ HIER nachziehen.
   */
  ...TICKETS_TABLES,
]

/**
 * portfolio (apps/portfolio) = Davids eigene Silo-Site, das einzige verbliebene
 * Silo-DEPLOYMENT. LEGACY: das Schema wuchs vor dem Pool-Umbau und enthält nur
 * TEILMENGEN mehrerer Layer — deshalb explizit statt aus vollen Blöcken:
 *   • billing OHNE `stripe_settings` (nie angelegt)
 *   • comments nur `comments` + `comment_votes`
 *   • posts nur `community_posts` + `post_votes` + `poll_votes`
 *   • control nur `entitlements` + `provisioning_jobs`
 * Volle Blöcke, die portfolio teilt: courses, events, tickets, media, moderation.
 * `brand` stand hier bis zum 2026-08-31 und ist mit dem Umzug des Wizards nach
 * `branding` wieder raus (Begründung am BRAND_TABLES-Block).
 * Neue portfolio-Tabelle ⇒ hier eintragen.
 *
 * NICHT im Soll und daher als WARNUNG erwartet — sechs TOTE Alt-Tabellen, die
 * anderswo längst umbenannt/entfernt sind (sites→websites,
 * feature_catalog→product_catalog, workspaces/feedback raus):
 *   sites · workspaces · workspace_invites · workspace_members ·
 *   feature_catalog · feedback
 */
/**
 * brand (packages/brand) — der Brand-Wizard. Die acht Tabellen laufen
 * AUSSCHLIESSLICH auf `branding` (branding.supply) und stehen deshalb NUR im
 * BRANDING_SOLL: sie gehören nicht in die instanzweite Spalten-Parität (die
 * vergleicht nur system+admin+pages+analytics, s. u.).
 * Schema: docs/plans/BRAND-WIZARD-SCHEMA.md.
 *
 * BIS 2026-08-31 STANDEN SIE IM PORTFOLIO_SOLL — das war der P1b-Zwischenstand
 * („eine Site, eine Login-Welt"). Mit Davids Kehrtwende
 * (docs/plans/BRANDING-SUPPLY-INFRA.md) bekommt der Wizard ein eigenes
 * Appwrite-Projekt; angelegt wurde in `portfolio` nie eine brand_*-Tabelle
 * (Plan §0: „Prod-Appwrite: KEINE brand_*-Tabellen irgendwo — bewusst
 * gewartet"), der Umzug hier hinterlässt also weder eine Lücke noch eine
 * Warnung.
 */
const BRAND_TABLES = [
  'brand_profiles',
  'brand_steps',
  'brand_messages',
  'brand_shares',
  'brand_invites',
  'brand_access',
  'brand_events',
  // brand-011: die Warteliste der geschlossenen Beta („Frühzugang anfragen").
  'brand_waitlist',
  // brand-014: die Befunde des Spezialisten (BW2 §4) — Konflikte, betroffene
  // Felder und Lücken. Eigene Tabelle, weil sie einen STATUS haben und
  // kapitelübergreifend sind.
  'brand_findings',
  // brand-016: der kostenlose Aussen-Check (docs/plans/BRAND-CHECK.md). Die
  // einzige brand_*-Tabelle ohne Konto — sie ist zugleich der 7-Tage-
  // Zwischenspeicher, der die KI-Kosten der öffentlichen Route deckelt.
  'brand_checks',
  // brand-017: die Korrekturvorschläge zum öffentlichen Ranking
  // (docs/plans/BRAND-CHECK-SEITE.md §3b). Ebenfalls ohne Konto — ein
  // Vorschlag hat einen eigenen Status, einen freiwilligen Absender und es
  // kann mehrere je Check geben; deshalb eine Tabelle und keine Spalte.
  'brand_check_corrections',
  // brand-020: die öffentliche Markengalerie (docs/plans/DISCOVER-BRANDS.md
  // §5). EINE Zeile je Branding (rowId = profileId) mit dem eingefrorenen
  // Stand, dem Steckbrief der Galerie und dem Freigabe-Zustand.
  'brand_publications',
  // brand-020: die Meldungen zu einer veröffentlichten Marke. Eigene Tabelle
  // aus demselben Grund wie `brand_check_corrections`: eigener Status, eigener
  // (freiwilliger) Absender, mehrere je Veröffentlichung möglich.
  'brand_publication_reports',
  // brand-021: die Erstgespräch-Anfragen (BS1 Z0,
  // docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §7 Zeile Z0). Der
  // Gesprächs-Einstieg von branding.supply — wie `brand_waitlist` eine
  // Tabelle, in die jemand OHNE Konto schreibt, aber mit optionaler `userId`
  // und optionalem Branding-Bezug.
  'brand_intro_requests',
  // brand-024: die Vorbilder des Kunden (docs/plans/BRAND-DESIGN.md §2.2
  // Schritt 2). EINE Zeile je Bild, Zeilen-Id = Datei-Id im Bucket
  // `brand-inspiration`; an ihr hängt ab D2b auch die Lesung des
  // Vision-Modells. Sie steht hier, damit eine fehlende Migration auffällt,
  // BEVOR der erste Kunde auf „Screenshots hinzufügen" klickt.
  'brand_inspiration',
  // brand-023: die KI-Entwürfe des Zeichens (docs/plans/BRAND-DESIGN.md §2.5
  // Stufe 3). EINE Zeile je Entwurf, Zeilen-Id = Datei-Id im Bucket
  // `brand-drafts`; sie trägt die HERKUNFT (Modell, Prompt-Hash) und das
  // `kept` des Menschen. Sie steht hier aus demselben Grund wie die Zeile
  // darüber: eine fehlende Migration soll auffallen, BEVOR der erste Kunde auf
  // „Entwürfe erzeugen" klickt — der Lauf antwortete sonst 503.
  'brand_mark_drafts',
]

/**
 * market (packages/market) — der Marktvergleich (MV1 M1, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §2.6, Schema-Anhang B). Wie die
 * brand_*-Tabellen laufen die drei AUSSCHLIESSLICH auf `branding` und stehen
 * deshalb NUR im BRANDING_SOLL — nicht in der instanzweiten Spalten-Parität.
 *
 * Sie hängen an `brand_profiles.$id` (Spalte `profileId`) und fallen mit dem
 * Branding: die Kaskade läuft über `registerBrandProfileCascade`
 * (packages/brand/server/utils/brandProfileCascade.ts), der GDPR-Contributor
 * des Layers über die Brandings des Kontos. Wer die Tabellen hier einträgt,
 * ohne `pnpm migrate --app branding --layer market` zu fahren, bekommt genau
 * das gemeldet — das ist die Absicht.
 */
const MARKET_TABLES = [
  // market-001: die Kandidaten (Adresse, Status, Rohtext mit 24-h-Frist,
  // Quelle nach §7.2, Adresse des Brand-Check-Ergebnisses nach §7.3).
  'market_competitors',
  // market-002: das Marktprofil je Kandidat — die zehn Aussen-Felder mit
  // Beleg (§2.2), die KI-Aussensicht getrennt daneben (§7.5).
  'market_profiles',
  // market-003: der Bericht je Stand — Gegenüberstellung, Konventionen,
  // Überschneidungen, freie Stellen; `revisionKey` ist der Kostendeckel.
  'market_reports',
]

/**
 * insights (packages/insights) — der redaktionelle Bereich Brand Insights
 * (BI1 I1, Plan docs/plans/BRAND-INSIGHTS.md §9.3). Wie die brand_*- und die
 * market_*-Tabellen laufen die drei AUSSCHLIESSLICH auf `branding` und stehen
 * deshalb NUR im BRANDING_SOLL — nicht in der instanzweiten Spalten-Parität.
 *
 * Sie hängen an KEINEM Branding: der Layer schreibt über FREMDE Marken, nicht
 * über Kunden. Es gibt daher auch keine Profil-Kaskade; der GDPR-Contributor
 * des Layers geht über die Kontakt-Adresse eines Korrekturvorschlags und über
 * die zwei Betreiber-Stempel `reviewedBy`/`claimedBy`.
 *
 * Wer die Tabellen hier einträgt, ohne `pnpm migrate --app branding --layer
 * insights` zu fahren, bekommt genau das gemeldet — das ist die Absicht.
 */
const INSIGHTS_TABLES = [
  // insights-001: der Beitrag — alle vier Formate in einer Zeile (Profil,
  // Duell, Artikel, Ranking), beide Sprachfassungen nebeneinander,
  // `translationReviewed` als Riegel vor der unredigierten Maschinenfassung.
  'insights_posts',
  // insights-002: die Marken-Entität einer FREMDEN Marke — Zeichen, Historie
  // und Beziehungen je mit Beleg, `state: 'removed'` als protokollierter
  // Notausgang. Bewusst NICHT `brand_publications` (§9.3: andere
  // Rechtsgrundlage, anderer Notausgang, anderer Inhalt).
  'insights_brands',
  // insights-003: Korrekturvorschlag UND Entfernen-Wunsch in einer Tabelle.
  // `contactEmail`/`ipHash` werden nach 12 Monaten geleert (`retentionAt` +
  // Sweep), die Entscheidungs-Zeile selbst bleibt als Nachweis.
  'insights_corrections',
  // insights-004: der Themenradar (§9.6) — je Video NUR die öffentlichen
  // Zahlen der YouTube Data API plus unsere Opportunity-Zahl. Kurzlebig: der
  // tägliche Lauf überschreibt je `videoId`, das 30-Tage-Netz löscht, was er
  // nicht mehr erreicht (Policies III.E.4). KEINE Kommentar-Texte, KEINE
  // Nutzernamen — dafür gibt es hier keine Spalte.
  'insights_topics',
  // insights-005: die kuratierte Kanalliste (BI2 K3) — das Gegenteil von
  // `insights_topics`: dort fremde Zahlen, täglich neu und nach 30 Tagen weg;
  // hier eine redaktionelle Entscheidung, die bleibt, bis ein Mensch sie
  // ändert. Bis BI2 stand sie in `apps/branding/app/app.config.ts`.
  'insights_channels',

  // insights-006: die Newsletter-Liste (I5a, §9.3a) — eigene Liste, eigenes
  // Double-Opt-in, KEIN Import aus `brand_waitlist` (eine Zustimmung gilt nur
  // für das, wofür sie gegeben wurde). `emailLower` ist unique, zwei Sweep-
  // Regeln räumen auf: unbestätigte Zeilen werden nach 30 Tagen GELÖSCHT (es
  // gab nie eine Einwilligung), abgemeldete nach 12 Monaten GELEERT (die Zeile
  // ist der Nachweis). Der Riegel davor ist eine Config-Zeile, kein Schema.
  'insights_subscribers',

  // insights-007: die eigene Video-Liste (BI2 K4) — die einzige Tabelle des
  // Layers, in der ein Teil der Zeile BLEIBT und ein anderer abläuft: Urteil,
  // Notiz, Cluster und `addedAt` gehören dem Menschen, die Zahlen der API
  // werden täglich überschrieben. `available: false` heisst „Video weg, Zahlen
  // geleert, Zeile steht" — im Radar ginge in diesem Fall die ganze Zeile.
  'insights_watchlist',

  // insights-008: das Protokoll eines Versands (I5b) — die Zeile ZÄHLT und
  // nennt niemanden (`recipients`/`sent`/`failed`, dazu ein `cursor` auf eine
  // Abonnenten-Zeile). `uq_post_id` ist die Sicherung gegen den zweiten
  // Versand: ein Beitrag, eine Mail. Sie entsteht VOR der ersten Mail, damit
  // ein abgebrochener Lauf fortgesetzt statt wiederholt wird.
  'insights_sends',
]

const PORTFOLIO_SOLL = [
  ...SYSTEM_TABLES,
  ...ADMIN_TABLES,
  ...PAGES_TABLES,
  ...ANALYTICS_TABLES,
  ...COURSES_TABLES,
  ...EVENTS_TABLES,
  ...MEDIA_TABLES,
  ...MODERATION_TABLES,
  ...TICKETS_TABLES,
  // Legacy-Teilmengen (siehe oben):
  'billing_customers',
  'billing_subscriptions',
  'comments',
  'comment_votes',
  'community_posts',
  'post_votes',
  'poll_votes',
  'entitlements',
  'provisioning_jobs',
  // Erstgespräch-Wizard (live seit 2026-08-22): keine pnpm-migrate-Migration,
  // sondern apps/portfolio/scripts/ensure-intro-requests.mjs — deshalb fehlte
  // der Eintrag hier (die Soll-Liste ist gepflegt, nicht geparst).
  'intro_requests',
]

/**
 * branding (apps/branding) = branding.supply, das neue Zuhause des
 * Brand-Wizards (docs/plans/BRANDING-SUPPLY-INFRA.md §3). Layer laut
 * Site-Manifest: themes + admin + brand + market (+ core/system als
 * Fundament) — deshalb steht hier der system-Block plus die brand_*- und die
 * market_*-Tabellen. `themes` besitzt keine eigenen Tabellen (die
 * custom_themes/custom_fonts gehören `system`).
 *
 * NOCH NICHT AUSGEROLLT (Plan §6 Schritt 1–4 stehen aus): der Eintrag trägt
 * `ausgerollt: false` und WARNT deshalb nur, wenn die Env-Datei fehlt —
 * dasselbe Verhalten, das `photos` seit jeher hat. Ein harter Fehler wäre hier
 * falsch: ein Lauf, der wegen einer noch nicht gebauten Instanz dauerhaft rot
 * steht, wird weggelesen — genau die Fehlerklasse, gegen die dieses Skript
 * geschrieben ist. Beim Launch das Flag auf true drehen; die Env-Datei allein
 * macht den Eintrag schon vorher scharf, sobald sie existiert.
 */
// Seit 2026-09-03 MIT admin (Davids Dashboard-Entscheidung): die
// changelog-Tabelle gehört auf die branding-Instanz, sobald
// `pnpm migrate --app branding` die admin-Migrationen gefahren hat.
// Seit MV1 M1 (2026-09-05) zusätzlich mit `market`: der Marktvergleich ist
// ein eigener Produkt-Layer im Site-Manifest dieser App.
// Seit BI1 I1 (2026-09-09) zusätzlich mit `insights`: der redaktionelle
// Bereich (Plan docs/plans/BRAND-INSIGHTS.md §9.1) ist ein eigener
// Produkt-Layer im Site-Manifest dieser App; seine drei Tabellen gehören auf
// die branding-Instanz (Migration VOR dem Code-Deploy, Gate ist Davids Ja).
// Seit BS1 R1 (2026-09-07) zusätzlich mit `pages`: Impressum, Datenschutz und
// AGB leben als CMS-Zeilen (Davids Entscheidung zu Frage 1 des Plans
// docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md). Die sechs
// pages-Migrationen gehören damit auf die branding-Instanz — Migration VOR
// dem Code-Deploy (§2.3 des Plans).
const BRANDING_SOLL = [...SYSTEM_TABLES, ...ADMIN_TABLES, ...BRAND_TABLES, ...MARKET_TABLES, ...INSIGHTS_TABLES, ...PAGES_TABLES]

/**
 * photos (apps/photos) = themes admin media core system. NICHT ausgerollt
 * (keine `.env.production`) — wird zur Laufzeit übersprungen, aber das Soll
 * steht schon für den Tag der Ausrollung.
 */
const PHOTOS_SOLL = [...SYSTEM_TABLES, ...ADMIN_TABLES, ...MEDIA_TABLES]

/* ────────────────────────────────────────────────────────────────────────────
 * SPALTEN-PARITÄT — bewusst ENGER SCOPE als „jede Tabelle auf ≥2 Instanzen".
 *
 * Die naheliegende Regel „vergleiche die Spalten JEDER Tabelle, die auf mehr als
 * einer Instanz steht" ist FALSCH — sie meldet massenhaft Scheinbefunde, weil
 * dieselbe Tabelle auf zwei Instanzen NICHT heißt, dass beide sie im Gleichklang
 * pflegen. Am 2026-08-16 gemessen: 29 Spalten-„Funde", ALLE erklärbar und KEINER
 * ein echter Rückstand:
 *
 *   1. LEGACY-SILO (portfolio): seine Produkt-Tabellen sind Single-Tenant und
 *      tragen die Mandanten-Spalten des Pools (`communityId`, `authorKind`)
 *      NICHT — plus alte Namen aus der Zeit vor dem feature→product-Umzug
 *      (`entitlementFeature` statt `entitlementProduct`, `featureKey` statt
 *      `productKey`). Das ist Architektur, kein Fehler.
 *   2. CONTROL-PLANE-EINHEIMISCHE Tabellen (`communities` & Co.): sie leben
 *      AUSSCHLIESSLICH im Control-Plane-Projekt — Migration control-037 sagt es
 *      im eigenen Kopf wörtlich („gehört NICHT auf jede Instanz gefahren"). Auf
 *      dem Pool liegen sie nur als EINGEFRORENE Alt-Schatten; `account` trägt
 *      z. B. jede communities-Spalte AUSSER `memberInvitesEnabled` (control-037,
 *      die jüngste) — kein Rückstand, sondern Absicht.
 *
 * Spalten-Parität ist nur dort AUSSAGEKRÄFTIG, wo eine Tabelle auf jeder Instanz
 * vom SELBEN Migrations-Lauf im Gleichklang gepflegt wird. Das sind die Layer,
 * die JEDE ausgerollte Instanz identisch fährt (die Schnittmenge der Manifeste):
 * `system` (läuft überall — der ganze Grund für E5), `admin` (changelog),
 * `pages` und `analytics` (analytics_settings, account+portfolio). Für genau
 * DIESE Tabellen ist eine fehlende Spalte ein echter, behebbarer Rückstand.
 *
 * NICHT hier: alles aus den Produkt-Layern (comments/posts/events/…, nur der
 * Pool fährt sie), dem Control-Datenmodell und billing/feedback (nur die Control
 * Plane fährt sie) — dort gibt es keinen Gleichklang zu prüfen. Neue Tabelle in
 * einem Layer, den MEHRERE Instanzen identisch fahren ⇒ ihren Block hier
 * aufnehmen. Verglichen wird je Tabelle gegen die Vereinigung genau der
 * Instanzen, die sie PRÄSENT haben (≥2, sonst nichts zu vergleichen).
 * ──────────────────────────────────────────────────────────────────────────── */
const PARITY_TABLES = [...SYSTEM_TABLES, ...ADMIN_TABLES, ...PAGES_TABLES, ...ANALYTICS_TABLES]

/**
 * Jede Instanz mit ihrer Env-Datei, ihrem Soll und dem Flag `ausgerollt`.
 *
 * `ausgerollt: true` heisst: die Instanz LÄUFT in Produktion — fehlt ihre
 * Env-Datei, ist das ein FEHLER, keine Notiz (Davids Entscheidung 2026-08-31).
 * Genau so ist die Betreiber-Konsole nach dem AH-4c-Rename (control.env →
 * admin.env, docs/runbooks/ADMIN-PROJEKT-CUTOVER.md) still aus der Prüfung
 * gefallen: „übersprungen" war nur eine Warnzeile, der Lauf blieb grün —
 * die Klasse „Konfiguration falsch, aber nichts wird rot", gegen die dieser
 * Wächter geschrieben ist. Er läuft manuell auf dem Mac, auf dem die
 * Env-Dateien liegen (NICHT in der CI) — ein harter Fehler kostet hier also
 * kein Dauerrot.
 *
 * `ausgerollt: false` (photos; branding bis zum Launch): App existiert im
 * Repo, aber kein pm2-Prozess, keine ploi-Site — fehlende Env bleibt eine
 * sichtbare Übersprungen-Zeile, das Soll steht für den Tag der Ausrollung.
 * Beim Launch das Flag mitdrehen.
 *
 * `comments` ist seit F3 (2026-08-12) keine eigene Instanz mehr, sondern eine
 * Pool-Community im `account`-Projekt — der Eintrag ist RAUS.
 */
const INSTANCES = [
  { name: 'account', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/account.env'), soll: ACCOUNT_SOLL },
  // Seit AH-4c heisst das Konsolen-Projekt `admin` und seine Migrations-Env
  // liegt als admin.env — der alte Zeiger auf control.env liess den Waechter
  // die Betreiber-Konsole STILL ueberspringen (Instanz fehlt = Warnzeile, aber
  // gruen; 2026-09-01 beim branding-Umzug erwischt). Der NAME bleibt
  // `control` (Ordner/Slot-Konvention), nur die DATEI zeigt auf admin.env.
  { name: 'control', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/admin.env'), soll: CONTROL_SOLL },
  // Seit 2026-08-31 nach der Migrations-Konvention (Umzug mit dem
  // Ausgerollt-Flag, Davids Entscheidung): die alte
  // apps/portfolio/.env.production lag im REPO-BAUM und fehlte damit in jedem
  // Worktree — portfolio wäre dort immer „übersprungen" gewesen, mit dem Flag
  // sogar fälschlich rot.
  { name: 'portfolio', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/portfolio.env'), soll: PORTFOLIO_SOLL },
  /**
   * `branding` folgt der Migrations-KONVENTION (~/.appwrite-secrets/migrations/),
   * nicht dem portfolio-Muster mit `.env.production` im Repo-Baum — so steht es
   * im Infra-Plan §3, und so liegen auch account und control. Bis die Datei
   * existiert, meldet der Lauf „übersprungen" statt zu scheitern (Begründung am
   * BRANDING_SOLL).
   */
  { name: 'branding', ausgerollt: false, env: join(homedir(), '.appwrite-secrets/migrations/branding.env'), soll: BRANDING_SOLL },
  { name: 'photos', ausgerollt: false, env: 'apps/photos/.env.production', soll: PHOTOS_SOLL },
]

function parseEnvFile(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

const limitQuery = (n) => `queries%5B%5D=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [n] }))}`

/** Ist-Menge ALLER Tabellen einer Instanz — EINE Abfrage statt je Tabelle eine. */
async function listTables(cfg) {
  const url = `${cfg.endpoint}/tablesdb/${cfg.databaseId}/tables?${limitQuery(200)}`
  const res = await fetch(url, {
    headers: { 'X-Appwrite-Project': cfg.project, 'X-Appwrite-Key': cfg.key },
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`tables: HTTP ${res.status}`)
  const body = await res.json()
  return new Set((body.tables ?? []).map(t => t.$id))
}

/** Spaltenschlüssel EINER Tabelle. `null`, falls die Tabelle fehlt (404). */
async function columnsOf(cfg, table) {
  const url = `${cfg.endpoint}/tablesdb/${cfg.databaseId}/tables/${table}/columns?${limitQuery(500)}`
  const res = await fetch(url, {
    headers: { 'X-Appwrite-Project': cfg.project, 'X-Appwrite-Key': cfg.key },
    signal: AbortSignal.timeout(25_000),
  })
  if (res.status === 404) return null // Tabelle fehlt ganz
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`)
  const body = await res.json()
  return new Set((body.columns ?? []).map(c => c.key))
}

// ── Instanzen einlesen und ihre Ist-Tabellen holen ──────────────────────────
const found = []
let envErrors = 0
for (const instance of INSTANCES) {
  if (!existsSync(instance.env)) {
    if (instance.ausgerollt) {
      envErrors++
      console.log(`✖  ${instance.name.padEnd(10)} AUSGEROLLT, aber ${instance.env} fehlt — Instanz bleibt ungeprüft`)
    } else {
      console.log(`·  ${instance.name.padEnd(10)} übersprungen — ${instance.env} gibt es nicht (nicht ausgerollt)`)
    }
    continue
  }
  const env = parseEnvFile(instance.env)
  const cfg = {
    endpoint: env.NUXT_PUBLIC_APPWRITE_ENDPOINT,
    project: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
    databaseId: env.NUXT_PUBLIC_APPWRITE_DATABASE_ID,
    key: env.NUXT_APPWRITE_MIGRATIONS_KEY || env.NUXT_APPWRITE_KEY,
  }
  if (!cfg.endpoint || !cfg.project || !cfg.key || !cfg.databaseId) {
    if (instance.ausgerollt) envErrors++
    console.log(`✖  ${instance.name.padEnd(10)} Env unvollständig — übersprungen`)
    continue
  }
  const present = await listTables(cfg)
  found.push({ name: instance.name, cfg, soll: instance.soll, present })
}

if (found.length < 2) {
  console.error('\n✗ Weniger als zwei Instanzen lesbar — ohne Vergleich ist die Aussage wertlos.')
  process.exit(2)
}

// ── (b) Präsenz: fehlt eine Soll-Tabelle? (FATAL) ───────────────────────────
// ── (d) Drift-Netz: eine Ist-Tabelle ohne Soll-Eintrag? (WARNUNG) ───────────
let missingTables = 0
let warnings = 0
for (const inst of found) {
  const sollSet = new Set(inst.soll)
  const missing = inst.soll.filter(t => !inst.present.has(t)).sort()
  const unknown = [...inst.present].filter(t => !sollSet.has(t)).sort()

  if (missing.length === 0 && unknown.length === 0) {
    console.log(`✔  ${inst.name.padEnd(10)} alle ${inst.soll.length} Soll-Tabellen da, keine unbekannten`)
  } else if (missing.length === 0) {
    console.log(`✔  ${inst.name.padEnd(10)} alle ${inst.soll.length} Soll-Tabellen da`)
  }
  if (missing.length) {
    missingTables += missing.length
    console.log(`✖  ${inst.name.padEnd(10)} TABELLE FEHLT: ${missing.join(', ')}`)
  }
  if (unknown.length) {
    warnings += unknown.length
    console.log(`⚠  ${inst.name.padEnd(10)} Alt-/unbekannte Tabelle (Soll-Liste veraltet?): ${unknown.join(', ')}`)
  }
}

// ── (c) Spalten-Parität: NUR über PARITY_TABLES (Begründung dort). Je Tabelle
//        gegen die Vereinigung genau der Instanzen, die sie präsent haben;
//        <2 Instanzen ⇒ nichts zu vergleichen. ────────────────────────────────
let missingColumns = 0
const columnFindings = [] // { instance, table, missing[] }
for (const table of [...PARITY_TABLES].sort()) {
  const insts = found.filter(inst => inst.present.has(table))
  if (insts.length < 2) continue
  const colsByInstance = new Map()
  for (const inst of insts) colsByInstance.set(inst.name, await columnsOf(inst.cfg, table))
  const union = new Set()
  for (const cols of colsByInstance.values()) for (const c of cols ?? []) union.add(c)
  for (const inst of insts) {
    const cols = colsByInstance.get(inst.name)
    const missing = [...union].filter(c => !(cols ?? new Set()).has(c)).sort()
    if (missing.length) {
      missingColumns += missing.length
      columnFindings.push({ instance: inst.name, table, missing })
    }
  }
}

if (columnFindings.length) {
  console.log('\nSpalten-Parität — es fehlt:')
  for (const f of columnFindings.sort((a, b) => a.instance.localeCompare(b.instance) || a.table.localeCompare(b.table))) {
    console.log(`✖  ${f.instance.padEnd(10)} ${f.table}: ${f.missing.join(', ')}`)
  }
} else {
  console.log('\nSpalten-Parität: alle geteilten Tabellen deckungsgleich.')
}

// ── Fazit ────────────────────────────────────────────────────────────────────
if (warnings > 0) {
  console.log(`\n${warnings} unbekannte/Alt-Tabelle(n) gemeldet (nicht fatal — Soll-Liste prüfen oder Cruft).`)
}
if (envErrors > 0) {
  console.log(
    `\n${envErrors} ausgerollte Instanz(en) ohne lesbare Env-Datei — sie wurden NICHT geprüft. `
    + 'Datei unter ~/.appwrite-secrets/migrations/ wiederherstellen (Ablage: Runbooks/Memory), erst dann ist der Lauf eine Aussage.',
  )
}
if (missingTables > 0 || missingColumns > 0 || envErrors > 0) {
  if (missingTables > 0 || missingColumns > 0) {
    console.log(
      `\n${missingTables} fehlende Tabelle(n), ${missingColumns} fehlende Spalte(n). `
      + 'Nachfahren mit:  pnpm migrate --app <app>  (ggf. --layer <layer>)',
    )
  }
  process.exit(1)
}
console.log('\nJede Instanz trägt ihr volles Soll; geteilte Tabellen sind spaltengleich.')
