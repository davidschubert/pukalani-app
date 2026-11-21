---
paths:
  - "packages/core/server/utils/ai*.ts"
  - "packages/core/shared/ai*.ts"
  - "packages/brand/server/utils/brandProviderRouting.ts"
  - "packages/brand/server/plugins/ai-kill-switch.ts"
  - "packages/brand/shared/brandTruncatedField.ts"
  - "packages/brand/server/api/brand/profiles/*/steps/**"
  - "packages/admin/server/api/admin/config.patch.ts"
  - "packages/tickets/server/**"
  - "packages/brand/server/utils/**"
  - "packages/market/server/utils/**"
  - "packages/insights/server/**"
  - "packages/pages/server/utils/pageTranslateRun.ts"
  - "packages/pages/server/api/pages/index.get.ts"
  - "packages/comments/server/api/admin/comments/index.get.ts"
  - "packages/comments/server/api/comments/*.patch.ts"
  - "packages/comments/server/utils/commentTombstone.ts"
  - "packages/posts/server/api/posts/*.patch.ts"
  - "packages/posts/server/api/posts/moderation.get.ts"
  - "packages/posts/server/api/posts/categories/manage.get.ts"
  - "packages/posts/server/utils/postsUserData.ts"
  - "packages/events/server/api/events/*.patch.ts"
  - "packages/events/server/utils/eventRedaction.ts"
  - "packages/courses/server/api/courses/*/index.patch.ts"
  - "packages/courses/server/api/lessons/*.patch.ts"
  - "packages/*/server/api/**/assist.post.ts"
  - "packages/*/server/api/**/translate.post.ts"
  - "packages/core/shared/ugcTranslations.ts"
  - "packages/core/app/composables/useUgcTranslation.ts"
  - "scripts/check-ai-routing.mjs"
  - "scripts/ops/ai-model-endpoints.mjs"
  - "scripts/ops/verify-ai-models.mjs"
---

## KI: Transport, Bindung, Riegel, UGC-Übersetzung
Lange Läufe (Lauf-Sperre, `202`, Rückbuchung): `lange-laeufe.md`.

- EIN TRANSPORT: `aiComplete()`/`aiCompleteJson()` (`core/server/utils/aiComplete.ts`)
  für OpenAI-kompatible APIs (Basis OpenRouter). Die Transport-Dateien IST die
  Liste `TRANSPORT_FILES` in `scripts/check-ai-routing.mjs`. Gate `pukalani.ai`
  (enabled/model/baseUrl, Core-Default aus). SCHLÜSSEL: zuerst die Ablage
  `instance_secrets` (Konsole, verschlüsselt), dann `NUXT_AI_KEY`
  (`resolveAiKey`). Gates und Antwort-Klemmung macht der Konsument; Bindung und
  Protokoll der Transport.
- MODELL-KETTE: `getEffectiveAiConfig` = `app_config.aiModel` (system-016) >
  `pukalani.ai`; die volle Kette `app_config.ticketsAiModel` > `app_config.aiModel`
  > `pukalani.tickets.ai` > `pukalani.ai` steht in `getEffectiveTicketsAiConfig`
  (`tickets/server/utils/ticketTriage.ts`).
- AUSKUNFT „KI NUTZBAR?": `await isAiConfigured(event)` (async, Gate UND
  Schlüssel). Ein vergessenes `await` ist KEIN Typfehler, sondern ein offenes
  Gate (ein Promise ist truthy). Moderations-Assist (`assist.post.ts` in
  comments und posts) ist nur Rat — der Mensch entscheidet.
- BINDUNG ALS VOREINSTELLUNG (SEC-005, Davids Entscheidung): ALLE Transporte
  senden `zdr: true`, `data_collection: 'deny'`, `allow_fallbacks: false` fest;
  keine Aufrufstelle kann das abschalten. Der TEXT-Weg (`aiComplete*`,
  `aiCompleteStream`) setzt den Ort selbst: `AI_TEXT_PROVIDER_ROUTING`
  (`core/shared/aiProviderRouting.ts`, die EINE Quelle; `BRAND_PROVIDER_ROUTING`
  ist dieselbe Konstante) — eine neue Text-Aufrufstelle gibt NICHTS mit. Bild,
  Vision, Video: `providerRouting.only` PFLICHT, fehlt/leer ⇒ 500
  `AI routing invalid`. Von `providerRouting` wirkt nur `only`, nur als
  BENANNTE Konstante. Wächter `pnpm check:ai-routing` (läuft mit
  `lint:scripts`): rot bei losem Objekt, unbekannter Konstante, Ort außerhalb
  der EU ohne eingetragene Ausnahme (nur Bild-Erzeugen) und `chat/completions`
  am Transport vorbei. Neue Konstante ⇒ in `ROUTING_CONSTANTS` des Wächters.
- KEIN ENDPUNKT ⇒ LAUT, KEIN MODELLWECHSEL: 404 des Vermittlers ⇒ 503
  `data.code: 'ai_endpoint_unavailable'`. Den Hinweis zeigt der zentrale Leser
  (`core/app/plugins/community-suspended-notice.client.ts`); lokale
  „fehlgeschlagen"-Meldungen schweigen dann (`isAiEndpointUnavailable`). Ein
  STREAM und ein LAUF IM HINTERGRUND erreichen den Leser nicht und zeigen
  denselben Satz selbst (Fehler-Frame bzw. kurzer Code an der Lauf-Zeile).
- DER ORT IST EINE BEDINGUNG AN DIE MODELLWAHL: ein Modell ohne die zwei
  EU-Endpunkte (auch ein per Konsole eingetragenes) läuft gar nicht.
  `pnpm ops:ai-models` prüft die konfigurierten Slugs samt `ticketsAiModel`.
  SPEICHERN PRÜFT (KI1 c): `packages/admin/server/api/admin/config.patch.ts` und
  `packages/tickets/server/api/tickets/settings.patch.ts` rufen für ein NEUES Modell `checkAiModelEndpoints`
  (`core/server/utils/aiModelCheck.ts`, Deutung `core/shared/aiModelEndpoints.ts`,
  per Test an den Wächter gebunden) ⇒ 422 `ai_model_no_eu_endpoint` /
  `ai_model_unknown`, nichts gespeichert. Nicht prüfbar (Frist, Ausfall, anderer
  Vermittler) ⇒ gespeichert mit `aiModelCheck: 'unverified'` und Warnung; ein
  Ausfall blockiert das Speichern nie. Eine weitere Route, die ein Modell
  speichert, ruft dieselbe Hilfe; eine Auswahlliste bietet nur Modelle mit
  EU-Endpunkt.
- ZWEI ENDPUNKT-LISTEN: die EU-Endpunkte stehen nur in der Liste der
  Europa-Adresse (`eu.openrouter.ai`). Wächter und Speicher-Prüfung lesen BEIDE;
  ein Ort zählt, sobald er in einer steht, „kein Ort" gilt nur, wenn beide
  lesbar waren. Die Europa-Adresse wird nur GELESEN — kein Transport ruft dort
  ein Modell (anderer Tarif, eigene Entscheidung). Ein anderer Vermittler kennt
  den `provider`-Block nicht und müsste eigens gebaut werden.
- ROTER MODELL-WÄCHTER ≠ AUFRUFE SCHEITERN: erst messen (ein gebundener Aufruf
  oder die KI-Ausfälle der App), dann ein Modell tauschen.
- ANBIETER-LISTE JE TRANSPORT (BE-004): brand, market, insights geben eine
  Konstante aus `packages/brand/server/utils/brandProviderRouting.ts` mit: Text
  ⇒ `BRAND_PROVIDER_ROUTING`; `aiVision`/`aiVideo` ⇒
  `BRAND_PROVIDER_ROUTING_VERTEX_EU`; `aiImage` ⇒
  `BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL` (Bildmodell ohne EU-Endpunkt — Davids
  Entscheidung). Eine Liste ohne passenden Endpunkt ist ein TOTER Weg (404),
  kein langsamer. Netze: `packages/brand/tests/brandAiCallSites.test.ts` (neue
  Aufrufstelle dort mitzählen), `scripts/ops/ai-model-endpoints.mjs` (per Test
  an die Konstanten gebunden). WER DEN ORT ÄNDERT, ändert drei Texte mit:
  `brand.mark.drafts.notice.*` (Davids Wortlaut; der Hinweis steht für ALLE
  Besucher VOR dem Auslösen), den Datenschutztext
  `apps/branding/scripts/legalPrivacyInterim.ts` (auf Production eigens
  einspielen) und `brandImageModelLabel`.
- PROTOKOLL NUR MIT KENNUNGEN (SEC-017): kein Transport loggt Antworttext,
  Fehlerrumpf oder ein rohes Fehlerobjekt (ein `SyntaxError` aus `res.json()`
  zitiert die Antwort). Jede Zeile aus `aiLogLine` (`core/server/utils/aiLog.ts`):
  nur Zahlen und kurze Kennungen (Status, `tag`, Modell, `ms`, `finish`,
  `chars`, Tokens, `run`, `gen`), alles andere wird `?`; einen Schalter für den
  Rumpf gibt es bewusst nicht. Konsumenten loggen `message` = fester
  `statusText` des Transports — wer dort Neues wirft, hält ihn fest.
- EIN RIEGEL VOR JEDEM BEZAHLTEN AUFRUF (BE-006, Davids Entscheidung): ein Layer
  meldet seinen Abschalter per Nitro-Plugin an (`registerAiKillSwitch`,
  `core/server/utils/aiKillSwitch.ts`); jeder Transport fragt vor dem Senden
  `assertAiSwitchedOn` ⇒ 503 `ai_disabled`, kein `fetch`. brand meldet
  `app_config.brandAiEnabled` (`brand/server/plugins/ai-kill-switch.ts`) — das
  stoppt jeden Modell-Aufruf der App. Fail-closed, einmal je Anfrage gelesen;
  ohne Layer kein Riegel. Die frühen Abfragen der Routen BLEIBEN; wer VOR einer
  Buchung fragen muss, ruft `aiSwitchedOn(event)` (öffentlicher und
  Dokument-Check: nach dem Zwischenspeicher, vor `bookBrandCheckQuota`; 503
  `check_paused` mit eigenem Satz). Netz:
  `core/tests/aiKillSwitchCoverage.test.ts` (Riegel VOR `fetch`). Review-Läufe
  belegen einen Parallel-Platz (`runStage`).
- ABGESCHNITTEN HEISST GEKENNZEICHNET, NICHT VERWORFEN (BE-007): auch der
  Stream liest `finish_reason`. Bei `length` bleibt der bezahlte Text; Zeile und
  Abschluss-Frame tragen `parts.truncated: true`,
  `brand.generation_completed`/`brand.converse_completed` nennen `finishReason`,
  die Oberfläche zeigt einen Hinweis. „Noch einmal erzeugen" nur am letzten
  ENTWURFS-Zug; ein Gesprächs-Zug bekommt nur den Satz (Wiederholen schickte die
  Antwort doppelt). Eine Rückfrage der Nachprüfung ist nie abgeschnitten.
  FELD-KENNZEICHEN (KI1 d, `brand/shared/brandTruncatedField.ts`): gilt, solange
  der letzte Entwurfs-Zug abgeschnitten war UND das Feld noch dessen Text trägt
  — der Erzeugen-Weg schreibt Feld und Historie mit DERSELBEN Zeit; wer ihn
  umbaut, hält beide gleich (Test). `max_tokens` bleibt großzügig, nie senken.

## UGC-Übersetzung (Davids Entscheidungen)
- KNOPF STATT AUTOMATIK; Gate = das INHALTS-Produkt (bewusst NICHT `ai`); nur
  MITGLIEDER (MM1, Regel in `tenant-isolation.md`). Fünf Inhaltsarten (posts,
  comments samt Umfrage-Optionen, events, courses, lessons): Spalte
  `translations` (MEDIUMTEXT) je Zeile; pure Regel `core/shared/ugcTranslations.ts`
  (KEINE gespeicherte Ausgangssprache), Composable `useUgcTranslation`.
- NICHT „VEREINFACHEN": (1) Cache-Treffer VOR jeder Drossel. (2)
  `translatedPollOptions` nur bei EXAKT gleicher Länge — die Stimme hängt am
  Index. (3) Lesen über die Session-Klinke, Cache-Schreiben mit
  `actor: 'operator'` (kein M13, kein A5-Beitritt); AUSNAHME Kurse und Lektionen
  (SEC-029): lesen über die Operator-Klinke. Die Mitgliedschafts-Wache steht in
  ALLEN fünf Routen vor dem ersten Datenbankzugriff und vor dem Cache-Treffer.
  (4) Übersetzen zeigt nie mehr als Lesen: die Lesson-Route trägt alle
  Vorprüfungen ihrer GET-Route; Event-Schwärzung und JEDES Löschen leeren
  `translations` (SEC-032) — eine neue Spalte mit Inhalt braucht einen Eintrag
  in jedem Lösch-Weg (`docs/referenz/EXPORT-UND-LOESCHUNG.md`). (5) Echte
  Bearbeitung leert, No-op-Speichern nicht. (6) SCHON IN DER ZIELSPRACHE: das
  Modell antwortet `{"same": true}`, die Route cacht die Grundfassung wörtlich;
  erkannt wird das im Browser (`ugcTranslationIsOriginal`; die UI zeigt einen
  Hinweis statt des Umschalters), bewusst KEIN Flag
  in der Antwort (spätere Leser lesen nur die Spalte).
- DROSSELN: 10 je 10 min je Konto und Community in der Route; Tages-Deckel je
  Konto über alle Arten (`ugcTranslationDayKey`, `TRANSLATE_DAILY_LIMIT`);
  IP-Buckets in `core/server/middleware/05.rate-limit.ts`.
- SCHLÜSSEL AUF PLATFORM: `pnpm ops:site-env` verlangt dort
  `NUXT_INSTANCE_SECRETS_KEY` (Schlüssel über die Konsole), bewusst NICHT
  `NUXT_AI_KEY`. Beweis: `packages/core/scripts/verify-ugc-translation.mjs`
  (Dev-Server, lokale Appwrite, Schlüssel; bezahlt echte KI-Aufrufe).
