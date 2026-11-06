---
paths:
  - "packages/core/server/utils/**"
  - "packages/moderation/**"
  - "packages/comments/**"
  - "packages/tickets/**"
  - "packages/posts/**"
  - "packages/core/shared/ugcTranslations.ts"
  - "packages/core/shared/notification*"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## KI, E-Mail, Embed, Moderation (Core-Bausteine seit 2026-07-09/10)
- KI: aiComplete()/aiCompleteJson() (core/server/utils/aiComplete.ts) = EIN
  Transport für OpenAI-kompatible APIs (Default OpenRouter). Gate pukalani.ai
  (enabled/model/baseUrl, Core-Default aus) + server-only NUXT_AI_KEY;
  Transport ist policy-frei — Gates + Antwort-Klemmung beim Konsumenten.
  Laufzeit-Override-Kette: app_config.ticketsAiModel > app_config.aiModel
  (system-016, Admin-Config-Seite, getEffectiveAiConfig) > pukalani.tickets.ai >
  pukalani.ai. Konsumenten: Ticket-Triage, Moderations-Assist (Kommentare
  /api/admin/comments/:id/assist + Posts /api/posts/:id/assist — advisory,
  Mensch entscheidet; UI-Flag isAiAvailable()).
- UGC-ÜBERSETZUNG (2026-08-18, Davids Entscheidungen): Knopf statt Automatik,
  Gate = das jeweilige INHALTS-Produkt (bewusst NICHT 'ai'), nur Eingeloggte.
  Alle fünf Inhaltsarten (posts, comments inkl. Umfrage-Optionen, events,
  courses+lessons): `translations`-MEDIUMTEXT-Spalte je Zeile (posts-023,
  comments-020, events-013, courses-007), pure Regel
  `core/shared/ugcTranslations.ts` (Browser-Auflösung wie categoryI18n, KEINE
  gespeicherte Ausgangssprache), Composable `useUgcTranslation`. Regeln, die
  man nicht „vereinfachen" darf: (1) Cache-Treffer VOR jeder Drossel (was
  nichts kostet, kostet kein Kontingent); (2) `translatedPollOptions` nimmt
  nur ein Array EXAKT gleicher Länge — die Stimme hängt am Index; (3) Lesen
  über die Session-Klinke (Row-Permissions = Sichtbarkeit), Cache-Schreiben
  als operator/actor:'operator' (kein M13, kein A5-Beitritt); (4) Übersetzen
  zeigt nie mehr als Lesen — die Lesson-Route trägt ALLE Vorprüfungen ihrer
  GET-Route, die Event-Schwärzung LEERT den Cache mit; (5) echte Bearbeitung
  leert, No-op-Speichern nicht; (6) SCHON IN DER ZIELSPRACHE (2026-08-21,
  Davids Entscheidung): das Modell antwortet `{"same": true}` statt eines
  teuren Echos, die Route cacht die GRUNDFASSUNG wörtlich (zweiter Klick =
  Cache-Treffer), erkannt wird der Fall client-seitig per Gleichheits-Vergleich
  (`ugcTranslationIsOriginal`) — bewusst KEIN Flag in der Antwort, weil spätere
  Leser den Cache aus der Spalte aufschlagen und nie eine Route rufen; die UI
  zeigt einen Hinweis statt des Umschalters. Drosseln: 10/10 min je
  Mensch+Community, geteilter Tages-Eimer `ugcTranslationDayKey` (100/24 h,
  EIN Deckel über alle Arten), IP-Buckets in 05.rate-limit.ts. `NUXT_AI_KEY`
  ist auf platform Pflicht (ops:site-env). Beweis: `packages/core/scripts/
  verify-ugc-translation.mjs` (35/35, braucht Dev-Server + lokale Appwrite +
  Key, bezahlt echte KI-Aufrufe).
- E-Mail: sendMail() (core mailer.ts, nodemailer, NUXT_SMTP_* — leerer Host =
  aus, lokal Mailpit localhost:1025). notify() hat einen Opt-in-E-Mail-Zweig:
  prefs.emailNotifications off|instant|digest (Default off, Settings →
  Benachrichtigungen; Mail-Sprache = prefs.emailLocale). Digest-Sweep:
  Kandidaten aus UNGELESENEN notifications-Rows (kein User-Scan), max 1
  Mail/Tag (prefs.emailDigestLastAt, merge!), Intervall-Plugin 30 min +
  POST /api/notifications/run-digest (system.manage).
- Embed (Read-only-MVP, docs/referenz/EMBED.md): Gate pukalani.comments.embed
  (enabled/allowedOrigins, Default aus) → /embed-Seite + public/embed.js.
  frame-ancestors via core-Registry registerEmbeddableRoute (Default 'self'
  auf ALLEN SSR-Seiten); csrf-origin.ts-Middleware (pukalani.security.
  csrfOriginCheck) wird PFLICHT, sobald E2-Partitioned-Cookies kommen.
  Transparenter Hintergrund NUR bei theme=auto. localhost:PORT↔PORT ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
- Moderation: Zweiphasen-Hide + Cascade gehören dem comments-Layer
  (commentModeration.ts) — admin-Routen + Auto-Hide teilen sie. Eskalation:
  registerReportEscalationHandler (moderation zählt, Owner reagiert);
  comments blendet ab pukalani.comments.autoHideReports offenen Meldungen aus
  (0 = aus; Meldungen bleiben offen). resolveReportsForTarget/
  openReportsForTarget sind die moderation-Verträge für Resolve/Assist/Bulk.
- Microcache: createMicrocache() (core) NUR für user-agnostische GETs —
  Gast-Kommentare Seite 1 (10s), öffentlicher Changelog (Write-invalidiert),
  App-/api/stats (60s). NIE Antworten mit Session-Daten cachen; kein
  SSR-Seiten-SWR (Session-State steckt im HTML).
