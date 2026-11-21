#!/usr/bin/env node
/**
 * Hat jede Instanz die Tabellen, die dort existieren SOLLEN — und in den
 * Tabellen ihrer Layer genau die Spalten, die die Migrationen anlegen?
 *
 *   node --experimental-strip-types scripts/ops/verify-schema-parity.mjs        # am Mac (pnpm ops:schema-parity)
 *   node --experimental-strip-types scripts/ops/verify-schema-parity.mjs --ci   # im täglichen Produktions-Wächter
 *
 * ZWEI WEGE ZUM SCHLÜSSEL (OPS-008, seit 2026-11-16):
 *   • am Mac wie bisher aus ~/.appwrite-secrets/migrations/<name>.env;
 *   • mit `--ci` aus der Umgebung: je Projekt EIN Schlüssel, der nur
 *     `tables.read` und `columns.read` hat (`SCHEMA_WATCH_KEY_ACCOUNT`,
 *     `…_ADMIN`, `…_PORTFOLIO`, `…_BRANDING`; GitHub-Umgebung
 *     `production-watch`). Endpunkt, Projekt-Id und Database-Id sind
 *     öffentliche Angaben und stehen unten. Fehlt ein Schlüssel, ist der Lauf
 *     ROT — ein Wächter ohne Schlüssel hätte sonst jeden Tag grün gemeldet,
 *     ohne etwas zu sehen. Das Protokoll in der CI ist ÖFFENTLICH: mit `--ci`
 *     nennt der Lauf nur, was ohnehin im Repo steht (Soll-Tabellen, Layer und
 *     Migrationsnummern), und ZÄHLT, was nur auf Production existiert
 *     (unbekannte Tabellen, abweichende Spalten).
 *
 * DAZU DIE PROBEN JE LAYER (OPS-008): jedes `product.manifest.ts` nennt unter
 * `schema.probe` die Tabelle/Spalte, die nach seiner jüngsten ablesbaren
 * Migration existieren muss. `/api/health` jeder App prüft dieselben Proben
 * mit ihrem Laufzeit-Schlüssel und meldet öffentlich nur „ok/behind". Dieser
 * Lauf prüft sie über die Spaltenliste und NENNT die fehlende Migration
 * (`brand-026`) — das ist die Antwort auf „welche fehlt?", wenn der
 * Halbstunden-Wächter „Datenbank passt nicht zum Programm" meldet.
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
 * SPALTEN GENAU (MG1 c, seit 2026-11-18): das Spalten-Soll ist NICHT
 * gepflegt, sondern kommt aus den Migrations-Dateien
 * (`scripts/lib/migration-inventory.mjs`) — und nur für die Layer, die die
 * App der Instanz laut `site.manifest.ts` nutzt (`allowedLayersOf` aus
 * `scripts/lib/migrate-plan.mjs` über der `LAYER_ORDER` aus
 * `scripts/migrate.mjs`, dieselbe Auswahl wie beim Migrations-Runner; die
 * Liste wird wie in `check-manifests.mjs` aus dem Quelltext gelesen, weil
 * `migrate.mjs` beim Import losliefe). So stört weder der Altbestand in `portfolio` noch
 * der eingefrorene Schatten (`communities`, `tickets`) in `account`: deren
 * Layer nutzt die App dort nicht, sie haben kein Spalten-Soll. Gezählt am
 * 2026-11-18 in den vier Projekten: auf die genutzten Layer beschränkt weicht
 * keine Spalte ab. Was bewusst NICHT verglichen wird (unlesbare Migrationen,
 * Tabellen aus ensure-Skripten, Appwrites `$`-Felder) und warum: Kopf von
 * `scripts/lib/schema-columns.mjs`; ein ausgelassener Layer steht als
 * ⚠-Zeile in der Ausgabe.
 *
 * DIE ALTE SPALTEN-PARITÄT ENTFÄLLT (`PARITY_TABLES`, Instanz gegen
 * Instanz für system/admin/pages/analytics): jede dieser Tabellen gehört
 * einem Layer, den JEDE Instanz, die sie trägt, auch nutzt — der
 * Soll-Vergleich deckt sie also vollständig ab, und schärfer: die Parität sah
 * eine Spalte nicht, die auf ALLEN Instanzen fehlte (dieselbe Lücke wie AU4
 * bei den Tabellen), und keine zusätzliche.
 *
 * FÜNF ARTEN VON BEFUND:
 *   • Soll-Tabelle FEHLT       → FATAL (exit 1). Der Kern-Fix (changelog-Lücke).
 *   • Spalte FEHLT             → FATAL (exit 1). Eine Migration des Layers lief
 *                                hier nicht (Name steht im Repo, auch mit --ci).
 *   • Spalte OHNE SOLL         → FATAL (exit 1). Von Hand angelegt oder eine
 *                                Migration fehlt im Repo. Mit --ci nur Tabelle
 *                                und ANZAHL (der Name ist nur Production bekannt).
 *   • Probe eines Layers fehlt → FATAL (exit 1), nennt die Migration.
 *   • Ist-Tabelle NICHT im Soll → WARNUNG (nicht-fatal). Fängt neue, noch nicht
 *                                eingetragene Tabellen UND tote Alt-Tabellen
 *                                (portfolio schleppt sechs davon). Nicht fatal,
 *                                sonst wäre der Lauf wegen Legacy-Cruft dauerhaft
 *                                rot und „wird weggelesen".
 *
 * Schlüssel werden nie ausgegeben; gelesen werden nur Schema-Metadaten.
 * Exit 0 = alle Soll-Tabellen da + Spalten wie im Soll (Warnungen erlaubt) ·
 * Exit 1 = irgendwo fehlt eine Soll-Tabelle, eine Spalte oder eine Probe, eine
 *          Spalte steht ohne Soll da, oder eine ausgerollte Instanz war nicht
 *          lesbar ·
 * Exit 2 = keine Instanz lesbar.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { allowedLayersOf } from '../lib/migrate-plan.mjs'
import { layerInventory } from '../lib/migration-inventory.mjs'
import { columnReport, columnSoll, compareColumns, readLayerOrder } from '../lib/schema-columns.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** `--ci`: Schlüssel aus der Umgebung, Protokoll ohne Namen, die nur Production kennt. */
const CI = process.argv.includes('--ci')
/** Öffentliche Angaben der Production-Projekte (stehen in jedem `NUXT_PUBLIC_*`). */
const PROD_ENDPOINT = 'https://api.pukalani.app/v1'
const PROD_DATABASE_ID = 'main'

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
  // system-040 (Lauf-Sperre für Skript-Läufe) und system-041 (Nachweise der Zustimmung, SEC-008)
  'system_runs',
  'consent_records',
  'community_navigation',
  'community_redirects',
  'community_seo',
  'custom_fonts',
  'custom_themes',
  'notifications',
]

/** `admin`-Layer — der Betreiber-Changelog. Auf ALLEN ausgerollten Instanzen. */
const ADMIN_TABLES = ['changelog']

/**
 * `pages`-Layer — CMS-Rechtstexte. account + control + portfolio + branding.
 * pages-007: `pages_runs`, die Lauf-Sperre der Seiten-Übersetzung (LL1 d) —
 * ohne sie antwortet der Übersetzen-Knopf 503 (`run_lease_unavailable`).
 */
const PAGES_TABLES = ['pages', 'pages_runs']

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
 * `runner`-Layer — der AI-Runner (docs/archiv/AI-RUNNER.md), angelegt von
 * `runner-001`. NUR `control`: das ist ein Betreiber-Werkzeug, es läuft
 * ausschließlich in `apps/control` und gehört auf keine Kunden-Instanz.
 *
 * Solange `runner-001` auf `control` noch nicht gefahren ist, meldet dieser
 * Lauf hier drei fehlende Tabellen — das ist genau der Zweck der kuratierten
 * Soll-Liste (die Migration muss VOR dem Code-Deploy laufen) und kein Fehler
 * der Liste. Kur: `pnpm migrate --app control --layer runner`.
 */
const RUNNER_TABLES = ['runners', 'runs', 'run_events']

/**
 * Control-Plane-Tabellen, die NUR auf `control` (Projekt `admin`) laufen —
 * anders als `CONTROL_TABLES`, die auch auf account liegen. `trial_claims`
 * (control-039, BE-015): die Testphase je Konto vergibt ausschließlich das
 * Control Plane; auf dem Pool gibt es keinen Schreiber und keinen Leser.
 */
const CONTROL_ONLY_TABLES = ['trial_claims']

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
  ...CONTROL_ONLY_TABLES,
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
 * BRANDING_SOLL; ihre Spalten prüft der Soll-Vergleich nur dort (Layer
 * `brand` steht nur im Manifest von `apps/branding`).
 * Schema: docs/archiv/BRAND-WIZARD-SCHEMA.md.
 *
 * BIS 2026-08-31 STANDEN SIE IM PORTFOLIO_SOLL — das war der P1b-Zwischenstand
 * („eine Site, eine Login-Welt"). Mit Davids Kehrtwende
 * (docs/archiv/BRANDING-SUPPLY-INFRA.md) bekommt der Wizard ein eigenes
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
  // brand-016: der kostenlose Aussen-Check (docs/archiv/BRAND-CHECK.md). Die
  // einzige brand_*-Tabelle ohne Konto — sie ist zugleich der 7-Tage-
  // Zwischenspeicher, der die KI-Kosten der öffentlichen Route deckelt.
  'brand_checks',
  // brand-017: die Korrekturvorschläge zum öffentlichen Ranking
  // (docs/archiv/BRAND-CHECK-SEITE.md §3b). Ebenfalls ohne Konto — ein
  // Vorschlag hat einen eigenen Status, einen freiwilligen Absender und es
  // kann mehrere je Check geben; deshalb eine Tabelle und keine Spalte.
  'brand_check_corrections',
  // brand-020: die öffentliche Markengalerie (docs/archiv/DISCOVER-BRANDS.md
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
  // brand-024: die Vorbilder des Kunden (docs/archiv/BRAND-DESIGN.md §2.2
  // Schritt 2). EINE Zeile je Bild, Zeilen-Id = Datei-Id im Bucket
  // `brand-inspiration`; an ihr hängt ab D2b auch die Lesung des
  // Vision-Modells. Sie steht hier, damit eine fehlende Migration auffällt,
  // BEVOR der erste Kunde auf „Screenshots hinzufügen" klickt.
  'brand_inspiration',
  // brand-023: die KI-Entwürfe des Zeichens (docs/archiv/BRAND-DESIGN.md §2.5
  // Stufe 3). EINE Zeile je Entwurf, Zeilen-Id = Datei-Id im Bucket
  // `brand-drafts`; sie trägt die HERKUNFT (Modell, Prompt-Hash) und das
  // `kept` des Menschen. Sie steht hier aus demselben Grund wie die Zeile
  // darüber: eine fehlende Migration soll auffallen, BEVOR der erste Kunde auf
  // „Entwürfe erzeugen" klickt — der Lauf antwortete sonst 503.
  'brand_mark_drafts',
  // brand-027: die Lauf-Sperre des Markenberaters (LL1 b) — dieselbe Form wie
  // `market_runs` (Fabrik `scripts/migrations-lib/runLeaseTable.mts`). Eine
  // Zeile je Lauf der vier langen Wege (Entwürfe, Lesung, Fundament-Check,
  // öffentlicher Check); ohne sie antwortet jeder Start 503.
  'brand_runs',
]

/**
 * market (packages/market) — der Marktvergleich (MV1 M1, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §2.6, Schema-Anhang B). Wie die
 * brand_*-Tabellen laufen die drei AUSSCHLIESSLICH auf `branding` und stehen
 * deshalb NUR im BRANDING_SOLL — ihre Spalten prüft der Soll-Vergleich nur dort.
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
  // market-005: die Lauf-Sperre (GA1 P18) — eine Zeile je Lauf, feste Id aus
  // (scope, subject, seq); der Zustand wird aus dem Herzschlag gerechnet.
  'market_runs',
]

/**
 * insights (packages/insights) — der redaktionelle Bereich Brand Insights
 * (BI1 I1, Plan docs/plans/BRAND-INSIGHTS.md §9.3). Wie die brand_*- und die
 * market_*-Tabellen laufen die drei AUSSCHLIESSLICH auf `branding` und stehen
 * deshalb NUR im BRANDING_SOLL — ihre Spalten prüft der Soll-Vergleich nur dort.
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

  // insights-012: die Lauf-Sperre des Versands (GA1 P18) — dieselbe Form wie
  // `market_runs` (Fabrik `scripts/migrations-lib/runLeaseTable.mts`).
  'insights_runs',
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
 * Brand-Wizards (docs/archiv/BRANDING-SUPPLY-INFRA.md §3). Layer laut
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
// Seit BI2 K7 (2026-11-09) zusätzlich mit `comments` UND `moderation`: unter
// den öffentlichen Insights-Artikeln darf kommentiert werden (Davids
// Entscheidung „wie geplant: comments montieren"). `moderation` steht dabei,
// weil das Kommentar-Manifest es in `requires` nennt. Die 24 Migrationen
// (comments-002…020, moderation-001…004) gehören damit auf die
// branding-Instanz — Migration VOR dem Code-Deploy, Gate ist Davids Ja.
const BRANDING_SOLL = [...SYSTEM_TABLES, ...ADMIN_TABLES, ...BRAND_TABLES, ...MARKET_TABLES, ...INSIGHTS_TABLES, ...PAGES_TABLES, ...COMMENTS_TABLES, ...MODERATION_TABLES]

/**
 * photos (apps/photos) = themes admin media core system. NICHT ausgerollt
 * (keine `.env.production`) — wird zur Laufzeit übersprungen, aber das Soll
 * steht schon für den Tag der Ausrollung.
 */
const PHOTOS_SOLL = [...SYSTEM_TABLES, ...ADMIN_TABLES, ...MEDIA_TABLES]

/* ────────────────────────────────────────────────────────────────────────────
 * SPALTEN — kein gepflegtes Soll mehr, sondern die Migrationen der Layer, die
 * die App nutzt (Kopf dieser Datei, MG1 c). Die frühere Instanz-gegen-Instanz-
 * Parität (`PARITY_TABLES` = system+admin+pages+analytics) war bewusst eng,
 * weil ein Vergleich ALLER geteilten Tabellen am 2026-08-16 29 Schein-Funde
 * lieferte — alle in Tabellen, deren Layer die Instanz gar nicht fährt
 * (Legacy-Silo `portfolio` ohne Mandanten-Spalten, eingefrorene
 * Control-Plane-Schatten in `account`, z. B. `communities` ohne
 * `memberInvitesEnabled` aus control-037). Genau diese Tabellen lässt der
 * Soll-Vergleich je App weg; die vier Paritäts-Layer nutzt jede Instanz, die
 * ihre Tabellen trägt, sie sind also vollständig darin enthalten.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Jede Instanz mit ihrer Env-Datei, ihrem Soll und dem Flag `ausgerollt`.
 *
 * `ausgerollt: true` heisst: die Instanz LÄUFT in Produktion — fehlt ihre
 * Env-Datei, ist das ein FEHLER, keine Notiz (Davids Entscheidung 2026-08-31).
 * Genau so ist die Betreiber-Konsole nach dem AH-4c-Rename (control.env →
 * admin.env, docs/archiv/ADMIN-PROJEKT-CUTOVER.md) still aus der Prüfung
 * gefallen: „übersprungen" war nur eine Warnzeile, der Lauf blieb grün —
 * die Klasse „Konfiguration falsch, aber nichts wird rot", gegen die dieser
 * Wächter geschrieben ist. Er läuft manuell auf dem Mac, auf dem die
 * Env-Dateien liegen (NICHT in der CI) — ein harter Fehler kostet hier also
 * kein Dauerrot.
 *
 * `ausgerollt: false` (photos): App existiert im
 * Repo, aber kein pm2-Prozess, keine ploi-Site — fehlende Env bleibt eine
 * sichtbare Übersprungen-Zeile, das Soll steht für den Tag der Ausrollung.
 * Beim Launch das Flag mitdrehen. (`branding` stand bis 2026-11-16 noch auf
 * `false`, obwohl branding.supply seit dem 2026-09-01 live ist — eine fehlende
 * Datei wäre dort nur „übersprungen" gewesen.)
 *
 * `app` = die App, deren Manifest sagt, welche Layer hier laufen (Proben je
 * Layer); `project` + `ciKey` = der Weg mit `--ci`.
 *
 * `comments` ist seit F3 (2026-08-12) keine eigene Instanz mehr, sondern eine
 * Pool-Community im `account`-Projekt — der Eintrag ist RAUS.
 */
const INSTANCES = [
  { name: 'account', app: 'platform', project: 'account', ciKey: 'SCHEMA_WATCH_KEY_ACCOUNT', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/account.env'), soll: ACCOUNT_SOLL },
  // Seit AH-4c heisst das Konsolen-Projekt `admin` und seine Migrations-Env
  // liegt als admin.env — der alte Zeiger auf control.env liess den Waechter
  // die Betreiber-Konsole STILL ueberspringen (Instanz fehlt = Warnzeile, aber
  // gruen; 2026-09-01 beim branding-Umzug erwischt). Der NAME bleibt
  // `control` (Ordner/Slot-Konvention), nur die DATEI zeigt auf admin.env.
  { name: 'control', app: 'control', project: 'admin', ciKey: 'SCHEMA_WATCH_KEY_ADMIN', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/admin.env'), soll: CONTROL_SOLL },
  // Seit 2026-08-31 nach der Migrations-Konvention (Umzug mit dem
  // Ausgerollt-Flag, Davids Entscheidung): die alte
  // apps/portfolio/.env.production lag im REPO-BAUM und fehlte damit in jedem
  // Worktree — portfolio wäre dort immer „übersprungen" gewesen, mit dem Flag
  // sogar fälschlich rot.
  { name: 'portfolio', app: 'portfolio', project: 'portfolio', ciKey: 'SCHEMA_WATCH_KEY_PORTFOLIO', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/portfolio.env'), soll: PORTFOLIO_SOLL },
  /**
   * `branding` folgt der Migrations-KONVENTION (~/.appwrite-secrets/migrations/),
   * nicht dem portfolio-Muster mit `.env.production` im Repo-Baum — so steht es
   * im Infra-Plan §3, und so liegen auch account und control. Bis die Datei
   * existiert, meldet der Lauf „übersprungen" statt zu scheitern (Begründung am
   * BRANDING_SOLL).
   */
  { name: 'branding', app: 'branding', project: 'branding', ciKey: 'SCHEMA_WATCH_KEY_BRANDING', ausgerollt: true, env: join(homedir(), '.appwrite-secrets/migrations/branding.env'), soll: BRANDING_SOLL },
  { name: 'photos', app: 'photos', ausgerollt: false, env: 'apps/photos/.env.production', soll: PHOTOS_SOLL },
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
  if (CI) {
    // Schlüssel aus der Umgebung des Wächters — nie aus einer Datei.
    if (!instance.ausgerollt) {
      console.log(`·  ${instance.name.padEnd(10)} übersprungen — nicht ausgerollt`)
      continue
    }
    const key = process.env[instance.ciKey] || ''
    if (!key) {
      envErrors++
      console.log(`✖  ${instance.name.padEnd(10)} Schlüssel ${instance.ciKey} fehlt in der Umgebung — Instanz bleibt ungeprüft`)
      continue
    }
    const cfg = { endpoint: PROD_ENDPOINT, project: instance.project, databaseId: PROD_DATABASE_ID, key }
    try {
      const present = await listTables(cfg)
      found.push({ name: instance.name, app: instance.app, cfg, soll: instance.soll, present })
    }
    catch (fehler) {
      // Nur die Kurzform (z. B. „tables: HTTP 401") — nie die Antwort selbst.
      envErrors++
      console.log(`✖  ${instance.name.padEnd(10)} nicht lesbar (${String(fehler?.message ?? fehler).slice(0, 40)}) — Schlüssel ${instance.ciKey} abgelaufen oder ohne tables.read?`)
    }
    continue
  }
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
  found.push({ name: instance.name, app: instance.app, cfg, soll: instance.soll, present })
}

// Seit MG1 c vergleicht jede Instanz gegen ihr eigenes Soll — eine lesbare
// Instanz ist schon eine Aussage (bis dahin hieß es „weniger als zwei").
// Fehlt eine ausgerollte, ist der Lauf über `envErrors` ohnehin rot.
if (found.length === 0) {
  console.error('\n✗ Keine Instanz lesbar — der Lauf hat nichts gesehen.')
  process.exit(2)
}

/** Spalten einer Tabelle je Instanz nur EINMAL holen (Spalten-Vergleich und Proben). */
async function cachedColumns(inst, table) {
  inst.columns ??= new Map()
  if (!inst.columns.has(table)) inst.columns.set(table, await columnsOf(inst.cfg, table))
  return inst.columns.get(table)
}
const loadManifest = async rel => (await import(pathToFileURL(join(ROOT, rel)).href)).default

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
    console.log(`⚠  ${inst.name.padEnd(10)} Alt-/unbekannte Tabelle (Soll-Liste veraltet?): ${CI ? `${unknown.length} Stück — Namen am Mac: pnpm ops:schema-parity` : unknown.join(', ')}`)
  }
}

// ── (c) Spalten je Tabelle: Soll aus den Migrationen der Layer, die die App
//        nutzt (Kopf dieser Datei und scripts/lib/schema-columns.mjs). ───────
let columnFindings = 0
let columnErrors = 0
let columnWarnings = 0
const LAYER_ORDER = readLayerOrder(readFileSync(join(ROOT, 'scripts', 'migrate.mjs'), 'utf8'))
console.log('\nSpalten je Tabelle (Soll aus den Migrationen der Layer, die die App nutzt):')
for (const inst of found) {
  let layers
  try {
    if (LAYER_ORDER.length === 0) throw new Error('LAYER_ORDER in scripts/migrate.mjs nicht gefunden')
    layers = allowedLayersOf(LAYER_ORDER, await loadManifest(`apps/${inst.app}/site.manifest.ts`))
  }
  catch (fehler) {
    columnErrors++
    console.log(`✖  ${inst.name.padEnd(10)} Layer der App nicht bestimmbar (${String(fehler?.message ?? fehler).slice(0, 80)}) — Spalten ungeprüft`)
    continue
  }
  const soll = columnSoll(layers.map(layer => ({ layer, inventory: layerInventory(ROOT, layer) })))
  const ist = new Map()
  for (const table of soll.tables.keys()) {
    ist.set(table, inst.present.has(table) ? await cachedColumns(inst, table) : null)
  }
  const result = compareColumns(soll.tables, ist)
  // Eine fehlende Tabelle, die auch im gepflegten Soll steht, meldet (b) schon.
  const curated = new Set(inst.soll)
  result.missingTables = result.missingTables.filter(({ table }) => !curated.has(table))
  const report = columnReport(inst.name, soll, result, { ci: CI })
  for (const line of report.lines) console.log(line)
  columnFindings += report.fatal
  columnWarnings += soll.skipped.length
}

// ── (e) Proben je Layer: ist die jüngste ablesbare Migration gelaufen? (FATAL) ──
// Dieselben Proben, die `/api/health` jeder App prüft (product.manifest.ts →
// `schema.probe`), hier über die Spaltenliste — und mit NAMEN der Migration.
// Layer und Nummer stehen im Repo; Tabellen- und Spaltennamen der Probe auch.
let missingProbes = 0
let probeErrors = 0
console.log('\nProben je Layer (jüngste ablesbare Migration):')
for (const inst of found) {
  let probes
  try {
    const site = await loadManifest(`apps/${inst.app}/site.manifest.ts`)
    probes = []
    for (const layer of ['system', ...site.products]) {
      const manifest = await loadManifest(`packages/${layer}/product.manifest.ts`)
      if (manifest.schema) probes.push({ name: `${layer}-${manifest.schema.probe.migration}`, ...manifest.schema.probe })
    }
  }
  catch (fehler) {
    probeErrors++
    console.log(`✖  ${inst.name.padEnd(10)} Manifeste nicht ladbar (${String(fehler?.message ?? fehler).slice(0, 80)}) — mit \`node --experimental-strip-types\` aufrufen`)
    continue
  }
  const missing = []
  for (const probe of probes) {
    const columns = await cachedColumns(inst, probe.table)
    if (columns === null || (probe.column && !columns.has(probe.column))) missing.push(probe.name)
  }
  if (missing.length === 0) {
    console.log(`✔  ${inst.name.padEnd(10)} alle ${probes.length} Proben da`)
  }
  else {
    missingProbes += missing.length
    console.log(`✖  ${inst.name.padEnd(10)} MIGRATION FEHLT: ${missing.join(', ')}`)
  }
}

if (warnings > 0) {
  console.log(`\n${warnings} unbekannte/Alt-Tabelle(n) gemeldet (nicht fatal — Soll-Liste prüfen oder Cruft).`)
}
if (envErrors > 0) {
  console.log(
    `\n${envErrors} ausgerollte Instanz(en) ohne lesbare Env-Datei — sie wurden NICHT geprüft. `
    + 'Datei unter ~/.appwrite-secrets/migrations/ wiederherstellen (Ablage: Runbooks/Memory), erst dann ist der Lauf eine Aussage.',
  )
}
if (missingProbes > 0) {
  console.log(
    `\n${missingProbes} Probe(n) fehlen — das Programm erwartet eine Migration, die hier nicht gelaufen ist. `
    + 'Nachholen (nach Davids Ja, erst mit --dry-run statt --prod ansehen):\n'
    + '  pnpm migrate --app <app> --env ~/.appwrite-secrets/migrations/<projekt>.env --only <layer>-<NNN> --prod',
  )
}
if (columnWarnings > 0) {
  console.log(`\n${columnWarnings} Stelle(n) beim Spalten-Vergleich ausgelassen (⚠-Zeilen oben; Grund steht dort).`)
}
if (columnFindings > 0) {
  console.log(
    `\n${columnFindings} Spalten-Befund(e). SPALTE FEHLT ⇒ die Migration des genannten Layers ist hier nicht gelaufen: `
    + 'nachholen wie bei einer fehlenden Probe. SPALTE OHNE SOLL ⇒ keine Migration legt sie an (von Hand angelegt?): '
    + 'am Mac `pnpm ops:schema-parity` nennt den Namen; dann Migration schreiben oder Spalte entfernen (nach Davids Ja). '
    + 'Runbook: docs/runbooks/PRODUKTIONS-ALARM.md, „Datenbank passt nicht zum Programm".',
  )
}
if (missingTables > 0 || columnFindings > 0 || columnErrors > 0 || envErrors > 0 || missingProbes > 0 || probeErrors > 0) {
  if (missingTables > 0) {
    console.log(
      `\n${missingTables} fehlende Tabelle(n). `
      + 'Nachfahren mit:  pnpm migrate --app <app> --env <env-datei> --prod  (ggf. --layer <layer> oder --only <layer>-<NNN>)',
    )
  }
  process.exit(1)
}
console.log('\nJede Instanz trägt ihr volles Soll; die Tabellen ihrer Layer haben genau die Spalten der Migrationen.')
