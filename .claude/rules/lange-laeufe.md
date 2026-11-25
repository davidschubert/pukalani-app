---
paths:
  - "packages/core/shared/runLease.ts"
  - "packages/core/server/utils/runLease.ts"
  - "packages/core/app/composables/useRunPolling.ts"
  - "scripts/migrations-lib/runLeaseTable.mts"
  - "packages/core/tests/routeDeadlineBudget.test.ts"
  - "packages/core/tests/support/routeDeadlines.ts"
  - "packages/brand/server/utils/brandRun.ts"
  - "packages/brand/shared/brandRun.ts"
  - "packages/brand/server/utils/brandAiQuota.ts"
  - "packages/brand/server/utils/brandStreamHeartbeat.ts"
  - "packages/brand/server/utils/brandCheckRunToken.ts"
  - "packages/brand/server/utils/brandReview.ts"
  - "packages/brand/server/api/**"
  - "packages/market/server/**"
  - "packages/insights/server/**"
  - "packages/pages/server/api/pages/translate.post.ts"
  - "packages/pages/server/utils/pageTranslateRun.ts"
  - "packages/pages/server/api/pages/translate/**"
---

## Lange Läufe: Lauf-Sperre statt langer Anfrage (BE-008/BE-010)
KI-Transport und Bindung: `ki.md`. Bewusst offene Grenzen:
`docs/referenz/LANGE-LAEUFE-GRENZEN.md`.

- LANGE ARBEIT GEHÖRT NICHT IN DIE ANFRAGE (Davids Entscheidung „antwortet
  sofort und rechnet im Hintergrund; ein zweiter Klick startet keinen zweiten
  Lauf"): der Webserver wartet 60 s (`proxy_read_timeout`, wird NICHT
  angehoben), Node rechnet danach weiter — der Mensch sieht einen Fehler und
  klickt noch einmal. Eine Route, deren Dauer an fremden Servern, einem Modell
  oder einer Liste hängt: alles Kostenlose prüfen, LAUF-SPERRE nehmen, buchen,
  `202`, weiter mit `runDetached()`; die Seite fragt ab (`useRunPolling`, ruht
  bei verstecktem Reiter). EINE Hilfe: `core/shared/runLease.ts` +
  `core/server/utils/runLease.ts`.
- DIE SPERRE IST EINE ZEILE MIT FESTER KENNUNG (Art, Gegenstand, laufende
  Nummer) in der Lauf-Tabelle des Layers (`<layer>_runs`, Fabrik
  `scripts/migrations-lib/runLeaseTable.mts`). Appwrite kennt kein bedingtes
  Schreiben: „erst lesen, dann Stempel setzen" hält zwei gleichzeitige Klicks
  nicht auf, das Anlegen derselben Kennung schon. Zweiter Aufruf ⇒ 409
  `reason: run_running`, die Seite zeigt einen ruhigen Hinweis, keinen Fehler.
- REIHENFOLGE: erst Sperre, dann Kontingent (sonst bucht ein Doppelklick
  zweimal); lehnt das Kontingent ab ⇒ `dropRunLease`. Ein Stand, mit dem unter
  der Sperre weitergearbeitet wird (Cursor), wird NACH dem Nehmen neu gelesen.
- EINE SPERRE HÄNGT NIE: Herzschlag alle `RUN_LEASE_HEARTBEAT_MS`; bleibt er
  `RUN_LEASE_STALL_MS` aus, gilt der Lauf als abgebrochen — GERECHNET gegen die
  Server-Uhr (`runLeaseState`), nie gespeichert, kein Aufräumer. Den Vorgänger
  beim Start nicht löschen (ein verspäteter Starter legte die Kennung sonst
  noch einmal an).
- KONTINGENT NACH ABBRUCH: der Lauf vermerkt `paid`, BEVOR sein erster
  bezahlter Schritt beginnt; ohne Vermerk erbt der nächste Start die Buchung,
  mit Vermerk bleibt sie gebucht.
- `detail` DER LAUF-ZEILE: nur Zahlen und Kennungen (`RUN_LEASE_DETAIL_MAX`),
  nie Namen oder Adressen.
- ZEITDECKEL IN DER ANFRAGE ist die kleinere Lösung und nur erlaubt, wo ein
  Teil-Ergebnis ehrlich ist; Prüfregeln bleiben dabei streng (nicht gelesen =
  nicht belegt = nicht veröffentlicht). Kapitel-Prüfung und Schließen einer
  Sitzung haben EINEN Deckel über beide Stufen (`BRAND_REVIEW_INLINE_BUDGET_MS`,
  Stufe 2 nur mit Rest ≥ `BRAND_REVIEW_STAGE2_MIN_MS`, `brand/server/utils/brandReview.ts`)
  — erlaubt, weil `reviewedBy: 'stage1'` ein ehrlicher Ausgang ist.
- EIN HINTERGRUND-LAUF SCHREIBT GEGEN DEN STAND VON JETZT: was er am Ende
  schreibt (Kapitel-Zeile, Platz unter dem Deckel, „gibt es die Marke noch?"),
  liest er unmittelbar davor neu — sonst überschreibt er, was der Mensch
  währenddessen gespeichert hat.
- JEDE ABFRAGE DER SEITE HAT EINE FRIST (`BRAND_RUN_POLL_TIMEOUT_MS`):
  `useRunPolling` überlappt nicht, eine hängende Abfrage hielte es an.
- EIN STREAM, DER STILL SEIN KANN, SENDET EIN LEBENSZEICHEN (der Webserver
  trennt nach 60 s Stille): SSE-Kommentarzeile im Takt
  `BRAND_STREAM_HEARTBEAT_MS` über `startBrandStreamHeartbeat`
  (`brand/server/utils/brandStreamHeartbeat.ts`); der Leser nimmt nur
  `data:`-Zeilen. Ein neuer Stream ruft dieselbe Hilfe.

### Die Läufe heute (Muster für neue)
- RADAR (LL1): Knopf und nächtlicher Lauf nehmen dieselbe Sperre in
  `insights_runs` (Art `radar`, ein Gegenstand je Instanz); läuft schon einer ⇒
  Takt `skipped`, Knopf 409; ohne Lauf-Tabelle nur der Merker im Prozess.
  `GET /api/insights/radar` liefert den Lauf-Stand.
- VIDEO-BRIEF (BI3): Art `brief`, Gegenstand = Fundstück, Sperre nach den
  kostenlosen Vorprüfungen, Zeile danach neu lesen; 409 der Sperre ⇒
  `brief_running`. Die Stempel an der Zeile sind nur Anzeige.
- MARKENBERATER (N10): `drafts`, `reading`, `doc-check` in `brand_runs`
  (Gegenstand = Marke) über `startBrandRun` (`brand/server/utils/brandRun.ts`:
  Herzschlag, ein Ende an der Zeile, Abschluss für Rückbuchung und
  Burst-Platz). Ausgang `done` oder das kurze Fehler-Wort; die lesende Route
  liefert den Lauf-Stand VOR dem Ergebnis.
- DOKUMENT-PRÜFUNG (`doc-review`): schreibt nach jeder nachgeholten Sitzung,
  liest die Kapitel-Zeile davor neu, markiert kein Feld als geprüft, dessen
  bestätigter Wert sich seit dem Lesen geändert hat; „für diesen Stand schon
  geprüft" steht als Schlüssel am letzten fertigen Lauf, nie im Prozess.
- ÖFFENTLICHER BRAND-CHECK (N13, Art `check`, ohne Konto): Gegenstand = Hash
  aus Adresse UND Besucher; der Start gibt ein Kennzeichen zurück, abgefragt
  über `GET /api/brand/check/runs/<kennzeichen>` (404 für alles andere,
  `brand/server/utils/brandCheckRunToken.ts`). Zweiter Start desselben
  Besuchers ⇒ dieselbe `202` mit dem laufenden Kennzeichen, kein 409; der
  Browser merkt sich den offenen Lauf über ein Neuladen.
- MARKTBERICHT (`market_runs`, Art `report`): Bericht und Vergleich schließen
  sich auf demselben Branding aus (409 `comparison_running` /
  `report_running`), geprüft NACH dem Nehmen der eigenen Sperre.
- CMS-SEITE ÜBERSETZEN (LL1 d, `POST /api/pages/translate`): `pages_runs`, Art
  `translate`, Gegenstand = Hash aus Mandant und Adresse, Zugriff über die
  Datentür; der Vorschlag liegt an der Lauf-Zeile (`result`), bis der Editor ihn
  über `GET /api/pages/translate/:slug` abholt — nie in der Seiten-Zeile.
- WÄCHTER: `core/tests/routeDeadlineBudget.test.ts` findet jede Route, die ein
  Modell, eine fremde Website oder YouTube erreicht, und verlangt einen Eintrag
  in `core/tests/support/routeDeadlines.ts`: `inline` (Summe der Fristen ≤ 60 s,
  180 s nur auf den Wegen des nginx-Blocks), `detached`, `stream` oder `over`
  (Bestand mit Grund, darf nur schrumpfen).
- BEWEISE: `packages/core/tests/runLease.test.ts`,
  `packages/market/tests/marketRunRoute.test.ts`,
  `packages/market/tests/marketReportRunRoute.test.ts`,
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
  `packages/brand/tests/brandReviewBudget.test.ts`.

### Kein Ergebnis, kein sichtbarer Verbrauch (BE-004)
- Endet ein Entwurfs-Lauf ohne abgelegtes Bild oder die Lesung der Vorbilder
  ohne Ergebnis, bucht der Lauf den Marken-Tageszähler zurück
  (`refundBrandAiQuota`); Konto- und Instanz-Deckel bleiben gebucht
  (Missbrauchsnetz). Ein Teil-Erfolg ist ein Lauf.
- MUSTER für weitere Läufe dieser Art: in `settle` zurückbuchen, wenn nichts
  geschrieben wurde und der Herzschlag nicht verloren ging; den abgebrochenen
  Vorgänger (auch mit selbst geschriebenem `lease_lost`) holt der nächste Start
  nach (`brandRunOwesRefund`: erst der Vermerk, dann die Rückbuchung); die Zahl
  des Geschriebenen SOFORT an die Lauf-Zeile (`progress()`, bei Entwürfen nach
  jedem Bild), sonst bucht ein Nachfolger für einen Lauf mit Ergebnis zurück.
- Ein Lauf mit verlorenem Herzschlag schreibt am Ende KEIN Detail
  (`startBrandRun` — sonst überschriebe er den Vermerk des Nachfolgers und es
  würde doppelt zurückgebucht); die Ansicht rechnet eine geschuldete
  Rückbuchung schon ein (`toBrandRunView`).
