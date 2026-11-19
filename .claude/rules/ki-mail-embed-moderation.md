---
paths:
  - "packages/core/server/utils/**"
  - "packages/moderation/**"
  - "packages/comments/**"
  - "packages/tickets/**"
  - "packages/posts/**"
  - "packages/core/shared/ugcTranslations.ts"
  - "packages/core/shared/notification*"
  - "packages/core/shared/runLease.ts"
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
  Meldungen schweigen dann (`isAiEndpointUnavailable`). Der Leser sieht nur,
  was an `$fetch` vorbeikommt: ein STREAM und ein LAUF IM HINTERGRUND zeigen
  denselben Satz selbst (KI1 d, 2026-11-17 — Markenberater über den
  Fehler-Frame des Stroms, Marktvergleich über den kurzen Code an der
  Lauf-Zeile). Preis: der Orts-Pin
  kostet rund 10 %, und er ist eine Bedingung an die MODELLWAHL — ein Modell
  ohne die zwei Endpunkte (auch ein per Konsole eingetragenes
  `app_config.aiModel`) läuft nicht langsamer, sondern gar nicht;
  `pnpm ops:ai-models` prüft die konfigurierten Slugs alle 30 Minuten
  (bis 2026-11-19 täglich, KM1 a), seit P17 auch
  `ticketsAiModel`. SEIT KI1 c (2026-11-17) PRÜFT AUCH DAS SPEICHERN: beide
  Routen, die ein Modell aus der Oberfläche annehmen (`admin/config.patch.ts`,
  `tickets/settings.patch.ts`), rufen für ein NEUES Modell
  `checkAiModelEndpoints` (`core/server/utils/aiModelCheck.ts`, Deutung pur in
  `core/shared/aiModelEndpoints.ts` — dieselbe öffentliche Auskunft wie der
  Wächter, per Test an ihn gebunden): kein Europa-Endpunkt oder unbekannt ⇒
  422 `ai_model_no_eu_endpoint` / `ai_model_unknown`, nichts gespeichert;
  ZWEI LISTEN (seit 2026-11-18): der Vermittler führt die Europa-Endpunkte
  mit Aufpreis nur noch in der Endpunkt-Liste seiner Europa-Adresse
  (`eu.openrouter.ai`), nicht mehr in der weltweiten — dieselben Namen, und
  ein Aufruf über die weltweite Adresse erreicht sie weiter, sobald
  `provider.only` sie nennt (gemessen: 200 zum Europa-Preis). Wächter und
  Speicher-Prüfung lesen deshalb BEIDE Listen, ein Ort zählt, sobald er in
  einer steht, und „kein Ort" ist nur eine Aussage, wenn beide lesbar waren.
  Die Europa-Adresse wird nur GELESEN; kein Transport ruft dort ein Modell
  (das wäre ein anderer Tarif des Vermittlers und eine eigene Entscheidung).
  EIN ROTER MODELL-WÄCHTER HEISST NICHT „AUFRUFE SCHEITERN": erst messen
  (ein gebundener Aufruf, oder die KI-Ausfälle im täglichen Blick in die
  App), dann ein Modell tauschen;
  nicht prüfbar (Frist 5 s, Ausfall, anderer Vermittler) ⇒ gespeichert mit
  `aiModelCheck: 'unverified'` und Warnung — ein Ausfall des Vermittlers
  blockiert das Speichern nie. Eine weitere Route, die ein Modell speichert,
  ruft dieselbe Hilfe; eine Auswahlliste bietet nur Modelle mit
  Europa-Endpunkt an. Die Basis-Adresse ist OpenRouter; ein anderer Vermittler
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
- EIN RIEGEL VOR JEDEM BEZAHLTEN AUFRUF (BE-006, seit 2026-11-15 — Davids
  Entscheidung „Der Abschalter für KI-Kosten erreicht auch den öffentlichen
  Check und die Prüf-Läufe"): ein Layer meldet seinen Abschalter per
  Nitro-Plugin beim Core an (`registerAiKillSwitch`,
  `core/server/utils/aiKillSwitch.ts`), und ALLE fünf Transporte fragen den
  Riegel vor dem Senden (`assertAiSwitchedOn` ⇒ 503 `ai_disabled`, kein
  `fetch`). brand meldet `app_config.brandAiEnabled` an
  (`brand/server/plugins/ai-kill-switch.ts`) — auf branding.supply stoppt der
  Schalter damit JEDEN Modell-Aufruf, auch die Core-Konsumenten und jede
  künftige Route. Fail-closed (ein Schalter, der wirft, heißt „aus"), gelesen
  je Anfrage einmal; eine App ohne den Layer hat kein Register und keinen
  Riegel. Die frühen Abfragen der Routen BLEIBEN (schönere Antwort, nichts
  gebucht): wer VOR einer Buchung fragen muss, ruft `aiSwitchedOn(event)`
  selbst — so tun es der öffentliche Check und der Dokument-Check (nach dem
  Zwischenspeicher, vor `bookBrandCheckQuota`; 503 `check_paused` mit eigenem
  Satz, weil „in ein paar Minuten noch einmal" bei einem Abschalter nicht
  stimmt). Netz: `core/tests/aiKillSwitchCoverage.test.ts` hält am Quelltext
  fest, dass jeder Transport den Riegel VOR seinem `fetch` ruft; dass niemand
  am Transport vorbei ruft, hält `check:ai-routing`. Review-Läufe belegen seit
  demselben Tag einen Parallel-Platz wie alle anderen Wege (`runStage`).
- ABGESCHNITTEN HEISST GEKENNZEICHNET, NICHT VERWORFEN (BE-007, seit
  2026-11-15): auch der Stream-Weg liest `finish_reason`
  (`AiCompleteStreamResult.finishReason`). Reißt ein Berater-Zug die
  Token-Decke (`length`), bleibt der bezahlte Text stehen; die Zeile in
  `brand_messages` trägt `parts.truncated: true`, das Abschluss-Frame
  ebenso, und `brand.generation_completed`/`brand.converse_completed` nennen
  `finishReason`. Die Oberfläche zeigt unter der Blase einen Hinweis; „Noch
  einmal erzeugen" gibt es nur am letzten ENTWURFS-Zug (vorhandener
  Erzeugen-Weg), ein Gesprächs-Zug bekommt den Satz „schreib einfach noch
  einmal" — ihn zu wiederholen schickte die Antwort des Menschen doppelt.
  Eine Rückfrage der Nachprüfung ist nie „abgeschnitten" (sie schreibt der
  Server). AUCH DER FELDWERT TRÄGT EIN KENNZEICHEN (KI1 d, seit 2026-11-18) —
  als Anzeige, ohne neue Spalte: ein Feld ist gekennzeichnet, solange der
  letzte Entwurfs-Zug zu ihm abgeschnitten war UND das Feld noch dessen Text
  trägt (`brand/shared/brandTruncatedField.ts`). Woran „noch dessen Text"
  hängt: der Erzeugen-Weg schreibt Feld und Historien-Eintrag mit DERSELBEN
  Zeit; jedes spätere Schreiben (tippen, ältere Fassung, bestätigen) bewegt
  die Zeit des Felds, und das Kennzeichen fällt. Wer den Erzeugen-Weg
  umbaut, hält die zwei Zeitstempel gleich (ein Test bindet sie).
  `max_tokens` bleibt großzügig und wird nicht gesenkt.
- LANGE ARBEIT GEHÖRT NICHT IN DIE ANFRAGE (BE-008/BE-010, seit 2026-11-16 —
  Davids Entscheidung „antwortet sofort und rechnet im Hintergrund; ein
  zweiter Klick startet keinen zweiten Lauf"): der Webserver wartet 60 s
  (`proxy_read_timeout`; die Frist wird NICHT angehoben, Davids Richtung vom
  2026-11-08), der Node-Prozess rechnet danach weiter — der Mensch sieht einen
  Fehler, obwohl der Lauf gelingt, und drückt noch einmal. Eine Route, deren
  Dauer an fremden Servern, einem Modell oder einer Liste hängt, prüft deshalb
  alles, was nichts kostet, nimmt die LAUF-SPERRE, bucht, antwortet `202` und
  rechnet mit `runDetached()` weiter; die Seite fragt den Stand ab
  (`useRunPolling`, ruht bei verstecktem Reiter). EINE Hilfe für alle:
  `core/shared/runLease.ts` + `core/server/utils/runLease.ts`. Die Sperre ist
  eine ZEILE MIT FESTER KENNUNG aus (Art, Gegenstand, laufende Nummer) in der
  Lauf-Tabelle des Layers (`market_runs`, `insights_runs`, `brand_runs`; Fabrik
  `scripts/migrations-lib/runLeaseTable.mts`): Appwrite kennt kein bedingtes
  Schreiben, „erst lesen, dann Stempel setzen" hält zwei Klicks im selben
  Augenblick nicht auf — das Anlegen derselben Kennung schon (lokal gemessen:
  von zehn gleichzeitigen genau eine, neun 409). Der zweite Aufruf bekommt 409
  `reason: run_running`, die Seite zeigt dafür einen ruhigen Hinweis, keinen
  Fehler. REIHENFOLGE: erst Sperre, dann Kontingent (sonst bucht ein
  Doppelklick zweimal); lehnt das Kontingent ab, fällt die Sperre wieder
  (`dropRunLease`). Wer unter der Sperre mit einem Stand weiterarbeitet
  (Cursor des Newsletters), liest ihn NACH dem Nehmen der Sperre neu. EINE
  SPERRE HÄNGT NIE: der laufende Prozess schreibt alle 20 s einen Herzschlag;
  bleibt er 120 s aus (Ausliefern, Absturz), gilt der Lauf als abgebrochen —
  GERECHNET gegen die Server-Uhr (`runLeaseState`), nie gespeichert, kein
  Aufräumer. Der Vorgänger wird beim Start nicht gelöscht (ein verspäteter
  Starter legte die freie Kennung sonst noch einmal an). KONTINGENT nach
  einem Abbruch: der Lauf vermerkt `paid`, BEVOR sein erster bezahlter Schritt
  beginnt; ein abgebrochener Lauf ohne den Vermerk vererbt seine Buchung an
  den nächsten Start, einer mit Vermerk bleibt gebucht. Im `detail` der
  Lauf-Zeile stehen nur Zahlen und Kennungen (4.000 Zeichen), nie Namen oder
  Adressen. Ein ZEITDECKEL in der Anfrage (Prüfregeln 45 s, Newsletter-Stapel
  40 s) ist die kleinere Lösung und nur dort erlaubt, wo ein Teil-Ergebnis
  ehrlich ist; die Prüfregeln bleiben dabei streng (nicht gelesen = nicht
  belegt = nicht veröffentlicht). SEIT LL1 (2026-11-17) GEHEN AUCH DER
  RADAR-KNOPF UND DER VIDEO-BRIEF DIESEN WEG: der Radar-Knopf (vorher ein
  Zeitdeckel von 30 s) nimmt die Sperre in `insights_runs` (Art `radar`, ein
  fester Gegenstand je Instanz), antwortet `202`, und `GET
  /api/insights/radar` liefert den Lauf-Stand; seit LL1 c nimmt auch der
  nächtliche Radar-Lauf dieselbe Sperre (läuft schon einer ⇒ Takt
  `skipped`, der Knopf bekommt währenddessen 409; ohne Lauf-Tabelle wie
  früher nur der Merker im Prozess), und die Seite zeigt die Zahlen des
  letzten Laufs aus der Lauf-Zeile. Der
  Video-Brief (BI3, das Vorbild) hielt seinen Start an der eigenen Zeile fest
  — „erst lesen, dann Stempel"; jetzt nimmt er die Sperre (Art `brief`,
  Gegenstand = das Fundstück) nach den kostenlosen Vorprüfungen, liest die
  Zeile danach neu und gibt den 409 der Sperre als gewohnten `brief_running`
  weiter; die Stempel sind nur noch Anzeige. EIN STREAM, DER STILL SEIN KANN,
  SENDET EIN LEBENSZEICHEN: der Webserver trennt nach 60 s Stille, deshalb
  schreiben die zwei Streams des Markenberaters alle 15 s eine
  SSE-Kommentarzeile (`startBrandStreamHeartbeat`,
  `brand/server/utils/brandStreamHeartbeat.ts`); der Leser im Browser nimmt
  nur `data:`-Zeilen. Ein neuer Stream ruft dieselbe Hilfe. SEIT N10 (2026-11-18)
  RECHNEN AUCH DREI WEGE DES MARKENBERATERS HINTER DER ANTWORT:
  Zeichen-Entwürfe, Vorbilder lesen und Fundament-Check nehmen die Sperre in
  `brand_runs` (brand-027; Arten `drafts`, `reading`, `doc-check`, Gegenstand
  = die Marke), antworten `202`, und EIN Stück fährt den Lauf
  (`startBrandRun`, `brand/server/utils/brandRun.ts`: Herzschlag, ein Ende,
  das immer an der Zeile steht, Abschluss für Rückbuchung und Burst-Platz).
  Der Ausgang ist `done` oder dasselbe kurze Wort, das früher der Fehler-Code
  der Anfrage war; die lesende Route liefert den Lauf-Stand mit und liest ihn
  VOR dem Ergebnis. ZWEI REGELN AUS DEM UMBAU: (1) ein Lauf im Hintergrund
  schreibt gegen den Stand von JETZT — was er am Ende schreibt, liest er
  unmittelbar davor neu (die Kapitel-Zeile, den Platz unter dem Deckel, „gibt
  es die Marke noch?"); mit dem Stand vom Start überschriebe er, was der
  Mensch während des Laufs gespeichert hat. (2) Das Nachfragen der Seite hat
  eine Frist je Abfrage (`BRAND_RUN_POLL_TIMEOUT_MS`): `useRunPolling`
  überlappt nicht, eine hängende Abfrage hielte es sonst an. SEIT N13
  (2026-11-18) AUCH DER ÖFFENTLICHE BRAND-CHECK (Art `check`) — er läuft
  OHNE KONTO, deshalb zwei Dinge anders: der Gegenstand der Sperre ist ein
  Schlüssel-Hash aus Adresse UND Besucher (Konto, sonst Tages-Stempel des
  Anschlusses), und der Start gibt ein KENNZEICHEN zurück, mit dem die Seite
  den Stand abfragt (`GET /api/brand/check/runs/<kennzeichen>`, 404 für alles
  andere; `brand/server/utils/brandCheckRunToken.ts`). Ein zweiter Start
  desselben Besuchers ist dort kein 409, sondern dieselbe `202` mit dem
  Kennzeichen des laufenden Laufs; ein Fremder trifft die Sperre nie. Der
  Browser merkt sich den einen offenen Lauf und nimmt ihn nach einem Neuladen
  wieder auf. Ebenfalls seit N13: der MARKTBERICHT (`market_runs`, Art
  `report`; Bericht und Vergleich schließen sich auf demselben Branding
  gegenseitig aus — 409 `comparison_running` bzw. `report_running`, geprüft
  NACH dem Nehmen der eigenen Sperre) und die DOKUMENT-PRÜFUNG des
  Markenberaters (`brand_runs`, Art `doc-review`): sie schreibt nach JEDER
  nachgeholten Sitzung, liest die Kapitel-Zeile davor neu und markiert ein
  Feld nicht als geprüft, dessen bestätigter Wert sich seit dem Lesen geändert
  hat; „für diesen Stand schon geprüft" steht als Schlüssel am letzten
  fertigen Lauf, nicht mehr im Prozess. ZEITDECKEL STATT LAUF: Kapitel-Prüfung
  und Schließen einer Sitzung rechnen weiter in der Anfrage, aber mit EINEM
  Deckel über beide Stufen (`BRAND_REVIEW_INLINE_BUDGET_MS`, 50 s; Stufe 2
  bekommt nur den Rest und läuft unter 10 s Rest gar nicht) — erlaubt, weil
  ein Ergebnis nur aus Stufe 1 schon immer ein ehrlicher Ausgang ist
  (`reviewedBy: 'stage1'`). SEIT LL1 d (2026-11-18) AUCH DIE ÜBERSETZUNG
  EINER GANZEN CMS-SEITE (`POST /api/pages/translate`): Sperre in der
  Lauf-Tabelle `pages_runs` (pages-007, Art `translate`, Gegenstand = Hash aus
  Mandant und Adresse der Seite, Zugriff über die Datentür), der Vorschlag
  liegt an der Lauf-Zeile (`result`), bis der Editor ihn über `GET
  /api/pages/translate/:slug` abholt — nie in der Seiten-Zeile; der Bestand
  `over` des Wächters ist damit leer. WÄCHTER (seit 2026-11-17):
  `core/tests/routeDeadlineBudget.test.ts` findet jede Route, die ein
  KI-Modell, eine fremde Website oder YouTube erreicht, und verlangt einen
  Eintrag in `core/tests/support/routeDeadlines.ts` — `inline` mit der Summe
  ihrer Fristen bis 60 s (180 s nur auf den Wegen des nginx-Blocks),
  `detached`, `stream` oder `over` (Bestand mit Grund, darf nur schrumpfen).
  Beweise: `packages/core/tests/runLease.test.ts`,
  `packages/market/tests/marketRunRoute.test.ts`,
  `packages/insights/tests/insightsNewsletterSendRoutes.test.ts`,
  `packages/insights/tests/insightsRadarRunRoute.test.ts`,
  `packages/insights/tests/insightsRadarTimedLease.test.ts`,
  `packages/insights/tests/insightsBriefLease.test.ts`,
  `packages/brand/tests/brandStreamHeartbeat.test.ts`,
  `packages/brand/tests/brandMarkDraftsRunRoute.test.ts`,
  `packages/brand/tests/brandReadingRunRoute.test.ts`,
  `packages/brand/tests/brandDocumentCheckRoute.test.ts`,
  `packages/brand/tests/brandCheckRoutes.test.ts`,
  `packages/brand/tests/brandDocumentRoutes.test.ts`,
  `packages/brand/tests/brandReviewBudget.test.ts`,
  `packages/market/tests/marketReportRunRoute.test.ts`.
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
  die drei Konstanten gebunden, `pnpm ops:ai-models` läuft alle 30 Minuten im
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
  Gate = das jeweilige INHALTS-Produkt (bewusst NICHT 'ai'), seit 2026-11-17
  nur MITGLIEDER der Community (MM1; Regel in tenant-isolation.md).
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
  Übersetzungs-Routen lesen über die Operator-Klinke; die Mitgliedschafts-Wache
  steht in ALLEN fünf Routen VOR dem ersten Datenbankzugriff und vor dem
  Cache-Treffer; (4) Übersetzen
  zeigt nie mehr als Lesen — die Lesson-Route trägt ALLE Vorprüfungen ihrer
  GET-Route, die Event-Schwärzung LEERT den Cache mit, ebenso jedes LÖSCHEN (SEC-032,
  2026-11-15: der Platzhalter eines gelöschten Kommentars, der Grabstein eines
  Beitrags und der geschwärzte Termin eines gelöschten Kontos tragen keine
  `translations` mehr — eine neue Spalte mit Inhalt braucht einen Eintrag in
  JEDEM Lösch-Weg, docs/referenz/EXPORT-UND-LOESCHUNG.md); (5) echte Bearbeitung
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
- EIN ZEITPUNKT IN EINER BENACHRICHTIGUNG IST EIN ROHWERT (BE-018, seit
  2026-11-17 — Davids Entscheidung): `notifications.body` trägt für eine
  Uhrzeit nie fertigen Text, sondern `encodeNotificationWhen(zeitpunkt, zone)`
  (`core/shared/notificationWhen.ts`). Formatiert wird beim LESEN: die Glocke
  in Sprache und Zone des Lesers, Sofort- und Sammel-Mail in der Sprache des
  Empfängers und in SEINER Zone, wenn er eine gewählt hat (`prefs.timezone`),
  sonst in der Zone des Termins, sonst UTC (`notificationWhenMailZone`). Das
  Zonen-Kürzel steht IMMER dabei — ein Server weiß nicht, wo der Empfänger
  sitzt, und eine Uhrzeit ohne Zone ist dann für die meisten falsch (vorher:
  `de-DE` und Server-Zeit für alle). Alte Zeilen mit fertigem Text bleiben,
  wie sie sind. ERINNERN IST JE EMPFÄNGER GENAU EINMAL: `notify({ rowId })`
  mit fester Kennung aus Termin, Empfänger und Beginn
  (`eventReminderRowId`), der Merker am Termin kommt NACH dem Versand und nur
  ohne Störung — ein späterer Takt holt die Fehlenden nach, die anderen
  laufen in die Dublette (keine Zeile, keine Mail). Der Lauf hängt am
  stündlichen Zeit-Lauf `event-reminders`, kein Seitenaufruf stößt ihn an.
  VERSCHOBEN NACH DER ERINNERUNG ⇒ NOCH EINMAL (KK1, Davids Entscheidung
  2026-11-17): ändert `PATCH /api/events/:id` den Beginn eines schon
  erinnerten Termins, fällt der Merker (`rescheduleClearsReminder`,
  `events/shared/eventReschedule.ts` — verglichen wird der Zeitpunkt, das
  Formular schickt den Beginn immer mit); die neue Erinnerung trägt die neue
  Uhrzeit und eine neue Kennung, für die alte Uhrzeit bleibt es bei einer.
- ÖFFENTLICHES FORMULAR, DAS EINE MAIL AUSLÖST (SEC-018, seit 2026-11-15 —
  Davids Entscheidung): drei Dinge, immer zusammen. (1) BOT-PRÜFUNG:
  `requireTurnstile(event, aktion, body.turnstileToken)` nach dem Honigtopf
  und vor Datenbank und Mail; die Aktion steht in `TURNSTILE_ACTIONS`
  (`core/shared/turnstile.ts`), das Formular zeigt `AuthTurnstileWidget` mit
  derselben Aktion und setzt es nach jedem Fehlschlag zurück (Muster:
  `comments/app/components/GuestCommentForm.vue`). Ohne Schlüssel ein No-op —
  aber JEDER Einstieg in dieselbe Route braucht das Widget, sonst lehnt der
  Server dort ab, sobald die Schlüssel gesetzt sind. (2) GRENZE JE EMPFÄNGER:
  `allowRecipientMail(event, bereich, adresse)`
  (`core/server/utils/recipientMailLimit.ts`) vor der Mail an die
  EINGETRAGENE Adresse — drei je Adresse, Bereich und 24 h, gezählt im
  Bremsen-Speicher, im Schlüssel nur ein Hash. `false` ⇒ keine Mail, KEIN
  neuer Link (sonst entwertet ein Fremder den aus der letzten echten Mail),
  und die Antwort bleibt wortgleich zum Erfolg (sie verrät nicht, ob eine
  Adresse bekannt ist). Derselbe Baustein steht seit 2026-11-17 (AB1 e) an
  den ANMELDE-MAILS, mit eigener Zahl: Code- und Reset-Mails 5 je Adresse und
  Stunde (`AUTH_MAIL_RECIPIENT_LIMIT`, Bereiche `auth:otp` und
  `auth:recovery`). Eine Antwort, die Werte trägt (Code-Anforderung: `userId`),
  bleibt über der Grenze auch in den WERTEN gleich. Die Mail „E-Mail
  bestätigen" (`POST /api/auth/verification`, Bereich `auth:verification`)
  zählt genauso, sagt die Grenze aber OFFEN (429 `rate_limited`): gefragt hat
  das angemeldete Konto nach seiner eigenen Adresse. (3) KEIN FREIER TEXT DES ABSENDERS in einer Mail an
  eine frei eingetragene Adresse: der Name läuft durch `displayNameProblem`,
  eine Nachricht wird nicht zitiert. Heute so: Erstgespräch und Warteliste
  (brand), Newsletter-Anmeldung (insights, nur die Grenze), Erstgespräch
  (portfolio) und Kontakt (photos, beide nur die Bot-Prüfung — sie mailen nur
  an den Betreiber). Die Meldung an
  den BETREIBER hat keine eigene Grenze (feste Adresse; davor stehen
  Bot-Prüfung und die Drossel je Leitung).
- ABMELDE-LINKS DES NEWSLETTERS (SEC-020, seit 2026-11-15): signiert mit
  `NUXT_INSIGHTS_NEWSLETTER_SECRET` (nur `branding`); beim Wechsel wandert der
  alte Wert nach `…_PREVIOUS` und prüft weiter. Links aus der Zeit davor
  (signiert mit dem API-Schlüssel) gelten ohne Frist (Davids Entscheidung).
  Ohne das Geheimnis signiert die App wie bisher — die Seite startet auch
  ohne den Wert. Ein Geheimnis NIE für einen zweiten Zweck wiederverwenden:
  ein Tausch entwertet sonst still etwas Drittes. Ein Link, den kein
  Schlüssel bestätigt, antwortet 400 `unsubscribe_link_invalid`, und die
  Seite sagt „nicht abgemeldet" — eine stille 200 ist für „schon erledigt"
  richtig und für „entwertet" falsch. Runbook:
  docs/runbooks/NEWSLETTER-ABMELDE-LINKS.md.
- Embed (Read-only-MVP, docs/referenz/EMBED.md): Gate pukalani.comments.embed
  (enabled/allowedOrigins, Default aus) → /embed-Seite + public/embed.js.
  frame-ancestors via core-Registry registerEmbeddableRoute (Default 'self'
  auf ALLEN SSR-Seiten); die Herkunftsprüfung (Middleware
  `03.csrf-origin.ts`) schützt die partitionierten E2-Cookies — seit SEC-004
  in jeder App an, ohne Schalter (hosts-ops.md, „HERKUNFTSPRÜFUNG").
  Transparenter Hintergrund NUR bei theme=auto. localhost:PORT↔PORT ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
  LOKALE EINBETTER (`http://localhost:*`, `http://127.0.0.1:*`) stehen in
  KEINER `app.config.ts` (BE-023, seit 2026-11-15): der Layer hängt sie selbst
  an (`comments/server/utils/embedStaticOrigins.ts`), nur im Dev-Server
  (`import.meta.dev`, auch die E2E-Suite) oder mit
  `NUXT_COMMENTS_EMBED_LOCAL_ORIGINS=true` — die Variable auf keinem Server
  setzen. Ein Produktions-Build liefert sie nicht mehr aus.
- Moderation: Zweiphasen-Hide + Cascade gehören dem comments-Layer
  (commentModeration.ts) — admin-Routen + Auto-Hide teilen sie. Eskalation:
  registerReportEscalationHandler (moderation zählt, Owner reagiert);
  comments blendet ab pukalani.comments.autoHideReports offenen Meldungen aus
  (0 = aus; Meldungen bleiben offen). resolveReportsForTarget/
  openReportsForTarget sind die moderation-Verträge für Resolve/Assist/Bulk.
  ZURÜCKZIEHEN NUR, SOLANGE OFFEN (BE-020, seit 2026-11-17): die Rücknahme
  der eigenen Meldung sucht nur offene; für eine erledigte antwortet sie 409
  `report_resolved`, die Entscheidung bleibt im Verlauf. LESERECHT EINES
  KOMMENTARS AUS EINER FUNKTION (`comments/server/utils/commentReadPermissions.ts`):
  Anlegen und BEIDE Wege des Wiederherstellens fragen sie — ein Kommentar an
  einem Betreiber-Ziel (`pukalani.comments.operatorTargets`) trägt nur die
  Betreiber-Leserechte und bekommt nie das Publikum der Community. Wer einen
  weiteren Weg baut, der Kommentar-Leserechte setzt, ruft dieselbe Funktion.
  GEMELDETE PRIVATE NACHRICHTEN (SEC-033, Davids Entscheidung 2026-11-12):
  Text nur, solange eine Meldung OFFEN ist — Liste und Einzel-Ansicht fragen
  dieselbe Funktion (`moderatorVisibleBody` mit der offenen Zahl, gebündelt
  über `openReportCountsForTargets`), jede Einsicht steht entprellt im
  Betreiber-Protokoll (`recordAuditView`, core). 90 Tage nach der letzten
  Erledigung leert ein Lauf den eingefrorenen Beleg (`reportedBody` und
  `reportedAt`); das Gespräch selbst und die Meldung bleiben (Schalter
  `pukalani.messages.reportEvidenceSweep` off/count/apply, Stand je Nachricht
  nur in ihrer Community über `reportEvidenceStateForTarget`);
  docs/referenz/EXPORT-UND-LOESCHUNG.md.
- Microcache: createMicrocache() (core) NUR für user-agnostische GETs —
  Gast-Kommentare Seite 1 (10s), öffentlicher Changelog (Write-invalidiert),
  App-/api/stats (10s, nur ohne Mandant — mit Mandant 404, BE-023). NIE Antworten mit Session-Daten cachen; kein
  SSR-Seiten-SWR (Session-State steckt im HTML).
