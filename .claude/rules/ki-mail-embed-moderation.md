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
  Gates + Antwort-Klemmung beim Konsumenten — die Datenschutz-Bindung und das
  Protokoll trägt seit P17 der Transport selbst (nächster Punkt).
  Laufzeit-Override-Kette: app_config.ticketsAiModel > app_config.aiModel
  (system-016, Admin-Config-Seite, getEffectiveAiConfig) > pukalani.tickets.ai >
  pukalani.ai. Konsumenten: Ticket-Triage, Moderations-Assist (Kommentare
  /api/admin/comments/:id/assist + Posts /api/posts/:id/assist — advisory,
  Mensch entscheidet; UI-Flag isAiAvailable()).
- BINDUNG ALS VOREINSTELLUNG (SEC-005, seit 2026-11-15 — Davids Entscheidung
  „‚keine Speicherung, Europa' gilt für jeden KI-Aufruf von selbst"): ALLE
  fünf Transporte senden `zdr: true`, `data_collection: 'deny'` und
  `allow_fallbacks: false` FEST — keine Aufrufstelle kann sie abschalten. Der
  TEXT-Weg (`aiComplete*`, `aiCompleteStream`) setzt dazu ohne Angabe den Ort
  selbst: die zwei EU-Endpunkte aus `core/shared/aiProviderRouting.ts`
  (`AI_TEXT_PROVIDER_ROUTING`, die EINE Quelle; `BRAND_PROVIDER_ROUTING` ist
  dieselbe Konstante). Eine neue Text-Aufrufstelle gibt also NICHTS mit. Bild,
  Vision und Video haben keinen gemeinsamen Ort (je Modell verschieden): dort
  ist `providerRouting.only` PFLICHT, fehlt es oder ist es leer, geht nichts
  raus (500 `AI routing invalid`). Von `providerRouting` wirkt nur noch `only`,
  und das nur als BENANNTE Konstante: `pnpm check:ai-routing` (läuft mit
  `lint:scripts`) listet jede Aufrufstelle mit Transport, Bindung und Orten und
  wird rot bei einem losen Objekt, einer unbekannten Konstante, einem Ort
  außerhalb der EU ohne eingetragene Ausnahme (heute genau eine:
  Bild-Erzeugen, s. u.) und bei jedem `chat/completions` am Transport vorbei.
  Neue Konstante ⇒ in `ROUTING_CONSTANTS` des Wächters eintragen. KEIN
  ENDPUNKT UNTER DER BINDUNG SCHEITERT LAUT: antwortet der Vermittler 404,
  wirft der Transport 503 mit `data.code: 'ai_endpoint_unavailable'` — kein
  Wechsel auf ein anderes Modell. Den Hinweis dazu zeigt der eine zentrale
  Leser (`community-suspended-notice.client.ts`); lokale „fehlgeschlagen"-
  Meldungen schweigen dann (`isAiEndpointUnavailable`). Preis: der Orts-Pin
  kostet rund 10 %, und er ist eine Bedingung an die MODELLWAHL — ein Modell
  ohne die zwei Endpunkte (auch ein per Konsole eingetragenes
  `app_config.aiModel`) läuft nicht langsamer, sondern gar nicht;
  `pnpm ops:ai-models` prüft die konfigurierten Slugs täglich, seit P17 auch
  `ticketsAiModel`. Die Basis-Adresse ist OpenRouter; ein anderer Vermittler
  kennt den `provider`-Block nicht und müsste eigens gebaut werden.
- PROTOKOLL NUR MIT KENNUNGEN (SEC-017, seit 2026-11-15): kein Transport
  schreibt Antworttext, Fehlerrumpf des Anbieters oder ein rohes Fehlerobjekt
  ins Log (ein `SyntaxError` aus `res.json()` zitiert die Antwort). Jede Zeile
  kommt aus `aiLogLine` (`core/server/utils/aiLog.ts`): feste Art, dazu nur
  Zahlen und kurze Kennungen — Status, `tag` (`error.code`/`type` des
  Anbieters), Modell, `ms`, `finish`, `chars`, Tokens, `run` (Kennung je
  Aufruf) und `gen` (Generation-Id des Vermittlers). Alles andere wird zu `?`.
  Einen Schalter, der den Rumpf wieder einschaltet, gibt es bewusst nicht.
  Konsumenten loggen weiter `message` des geworfenen Fehlers — das ist der
  feste `statusText` des Transports. Wer dort etwas Neues wirft, hält ihn fest.
- ANBIETER-LISTE JE TRANSPORT (BE-004, seit 2026-11-14): die Aufrufe von
  brand, market und insights geben eine von DREI Konstanten mit
  (`packages/brand/server/utils/brandProviderRouting.ts`), alle mit `zdr`,
  `dataCollection: 'deny'`, `allowFallbacks: false`: TEXT (`aiComplete*`) ⇒
  `BRAND_PROVIDER_ROUTING` (zwei EU-Endpunkte); Bild- und Videolesen
  (`aiVision`, `aiVideo`) ⇒ `…_VERTEX_EU`; Bild-ERZEUGEN (`aiImage`) ⇒
  `…_VERTEX_GLOBAL` (`google-vertex/global` — das Bildmodell hat keinen
  EU-Endpunkt; Davids Entscheidung 2026-11-13 „ohne festen Ort, wie bisher").
  Eine Liste ohne passenden Endpunkt ist kein langsamer, sondern ein TOTER Weg
  (404 beim Vermittler): AI1 gab der Basis einen Ort, der Bild-Aufruf erbte ihn
  still, und jeder Lauf der Zeichen-Entwürfe wäre gescheitert, ohne dass
  irgendetwas rot wurde. Drei Netze: (1)
  `packages/brand/tests/brandAiCallSites.test.ts` hält je Aufrufstelle
  Transport und Konstante gegeneinander (neue Aufrufstelle ⇒ dort mitzählen);
  (2) die Wächter-Tabelle `scripts/ops/ai-model-endpoints.mjs` ist per Test an
  die drei Konstanten gebunden, `pnpm ops:ai-models` läuft täglich im
  Produktions-Wächter; (3) WER DEN ORT ÄNDERT, ändert drei Texte mit: den
  Hinweis vor dem Knopf (`brand.mark.drafts.notice.*`, steht für ALLE
  Besucher vor dem Auslösen — Davids Wortlaut), den Datenschutztext
  (`apps/branding/scripts/legalPrivacyInterim.ts`, liegt auf Production als
  Zeile und wird eigens eingespielt) und den Anzeigenamen
  (`brandImageModelLabel`). KEIN ERGEBNIS, KEIN SICHTBARER VERBRAUCH: endet
  ein Entwurfs-Lauf ohne ein abgelegtes Bild, bucht die Route den
  Marken-Tageszähler zurück (`refundBrandAiQuota`); Konto- und Instanz-Deckel
  bleiben gebucht (Missbrauchsnetz). Ein Teil-Erfolg ist ein Lauf.
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
  als operator/actor:'operator' (kein M13, kein A5-Beitritt) — AUSNAHME Kurse
  und Lektionen (SEC-029, 2026-11-13): ihre Zeilen tragen kein Leserecht, beide
  Übersetzungs-Routen lesen über die Operator-Klinke und stellen
  `requireCourseMember` VOR den ersten Datenbankzugriff; (4) Übersetzen
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
  auf ALLEN SSR-Seiten); die Herkunftsprüfung (Middleware
  `03.csrf-origin.ts`) schützt die partitionierten E2-Cookies — seit SEC-004
  in jeder App an, ohne Schalter (hosts-ops.md, „HERKUNFTSPRÜFUNG").
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
