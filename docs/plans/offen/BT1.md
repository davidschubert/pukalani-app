# BT1 — Einzelheiten

> Einzelheiten zum offenen Punkt **BT1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**BT1 — Tests über den echten Kundenpfad: Nacharbeiten (aus dem Gesamtaudit, Paket P27).**
Erledigt am 2026-11-17 (COMPLETE „N09"): der dritte Server im nächtlichen
Lauf (zwölf Skripte der Einzel-Instanz), Rollen-Tests für `onboarding`,
`control`, `core`, `admin`, `tickets`, `runner`, `domains` und `billing`, die
zwei Skripte mit dem Programm-Fehler, die Probe-Hosts der Isolations-Tests
und die Tabellen in `docs/referenz/LIVE-BEWEISE.md`.
Erledigt am 2026-11-18 (COMPLETE „N14"): Rollen-Tests für `pages`,
`apps/control` und die drei Einzelrouten, drei der vier Stellen aus (e), das
Tages-Fenster für `verify-trust-perks` und die Spur im Rückweg-Test.
Erledigt am 2026-11-27 (COMPLETE „BT1 (a) drei Skripte"): `verify-geo-cities`,
`verify-notification-mail-links` und `verify-composer-editor` laufen mit; ein
Nacht-Alarm schließt nur noch ein grüner Nacht-Lauf.

- **(a) Skripte, die noch von Hand laufen (8 von 87).** Seit dem 2026-11-27
  laufen 79 von 87 von selbst (`docs/referenz/LIVE-BEWEISE.md`). Offen:
  - **Die fünf E2E-Dateien von `apps/portfolio`** und
    **`verify-business-confirmation`** brauchen einen fünften Server mit
    eigenem Projekt `portfolio`. Das Skript selbst ist seit dem 2026-11-19
    nachgezogen (lokal 27 von 27, COMPLETE „N17"). Empfehlung: nach demselben
    Muster wie der vierte Server bauen (`--portfolio-port` im Setup, Start nur
    nachts, die Dateien über `pnpm buehne e2e`), aber erst nach der
    Entscheidung in (c) — der nächtliche Lauf dauert schon rund 32 Minuten
    (seit dem 2026-11-27 rund zwei Minuten mehr: `verify-composer-editor`).
  - Zwei Skripte der Einzel-Instanz brauchen eigens eingestellte Server
    (`verify-silo-domain`, `verify-domain-settle`), `verify-custom-domain`
    eine Betreiber-App im Trockenlauf und echte öffentliche DNS-Einträge.
    Bewusst von Hand bleiben vier mit Fremddiensten oder fremden Dateien
    (`verify-brand-context`, `verify-ugc-translation`: bezahlte KI;
    `verify-brand-tokens`: Werkzeug aus dem Netz; `verify-session-ip`:
    Standort-Datenbank im Binärformat, die sich ohne neues Paket nicht als
    Auszug schreiben lässt).
  - `verify-brand-sessions` hat einen Zweig für einen Server OHNE gestellte
    Antworten (vier Prüfungen „ohne Modell ⇒ 503"). Er ist nach dem Umbau
    nicht gelaufen; die Bühne überspringt ihn mit Grund.
- **(b) Rollen-Tests: erledigt, der Bestand ist leer**
  (`support/routeRoleBacklog.ts`, vorher 85 Routen). Abgebaut am 2026-11-18:
  insights, brand und market (COMPLETE „N13"), `pages`, `apps/control` und die
  drei Einzelrouten in `apps/comments`, `apps/photos`, `apps/portfolio`
  (COMPLETE „N14"; die drei Apps haben seitdem eine eigene Test-Einrichtung).
  Jeder Layer steht in `ZERO_BACKLOG_LAYERS`; eine neue Route ohne Test ist
  rot.
- **(c) Bühnen-Lauf als Pflicht: im Dezember neu entscheiden.** Entschieden
  am 2026-11-17 (DECISION-LOG): Der Lauf „Bühne (Kundenpfad)" bleibt vorerst
  ein Hinweis — er hält weder das Zusammenführen noch das Ausliefern auf und
  öffnet auf `main` und nachts ein Issue, wenn er rot ist. Ab dem 2026-12-01
  nachsehen: Wie oft war er rot, und wie oft lag es am Skript statt am
  Programm? Danach David erneut fragen. Ebenfalls entschieden: GitHub
  erzwingt nicht, dass ein Zweig vor dem Zusammenführen aktuell ist; die
  Sitzungen testen selbst gegen den neuesten Stand (CLAUDE.md, Abschnitt Git).
  Der nächtliche Lauf dauert rund 32 Minuten (gemessen am 2026-11-19 mit 67
  Skripten: 31 min 35 s; davor mit 64 Skripten 29 min 37 s und 31 min 28 s;
  mit drei Servern rund 23, mit zweien 16).
  **Zwischenstand für die Entscheidung (gezählt am 2026-11-25):** Nacht-Läufe
  18.–20.11. grün, 21.–24.11. viermal rot — alle vier lagen am SKRIPT, keiner
  am Programm: 21.11. neue Browser-Test-Datei ungeprüft auf `main` (f),
  22.11. zwei Zeitüberschreitungen beim Laden einer Seite
  (`verify-trial-notice`, `verify-handles-mentions`), 23./24.11. zwei
  Isolations-Skripte (courses, events) nach PK1 E1c nicht auf die Anmeldung
  je Host umgestellt (behoben am 2026-11-25).
  **Nachgezählt am 2026-11-27:** auch 25.11. und 26.11. rot, wieder nicht am
  Programm-Kern: 25.11. `verify-handles-mentions` an
  `waitForLoadState('networkidle')` (dieselbe Wackel-Stelle wie in (d));
  26.11. `verify-brand-sessions` Abschnitt 26–27: die Werkstatt-Seite zeigt
  den markierten Vorschlag zwei- bzw. viermal statt einmal — fällt zeitlich
  mit dem Umbau der Werkstatt-Seite zusammen (WS1); ob Seite oder Skript
  falsch ist, entscheidet, wer WS1 baut. Damit seit dem 18.11.: 3 Nächte
  grün, 6 rot; von den 6 lagen 5 sicher am Skript bzw. am Lauf, eine (26.11.)
  ist offen. Dabei gefunden: ein grüner KURZER Lauf auf `main` schloss am
  26.11. das Alarm-Issue #614, obwohl das rote Nacht-Skript darin gar nicht
  lief — behoben (Label `buehne-alarm-nacht`, COMPLETE „BT1 (a) drei
  Skripte"). Am Pull Request und auf `main`
  (Modus ohne Browser-Tests): seit dem 20.11. 229 + 142 grün, 3 rot (alle am
  21.11.), der Rest abgebrochen. Rohzählung: `gh run list --workflow
  buehne.yml --limit 400`.
- **(d) Kleinigkeiten.** `verify-custom-domain` braucht eine Betreiber-App im
  Trockenlauf mit eigenem Namens-Server und kennt die Freigabe durch den
  Betreiber noch nicht. Der Test `packages/core/tests/rollbackScript.test.ts`
  scheiterte am 2026-11-17 einmal in der CI mit Exit 141; die Ursache ist
  nicht gefunden (das verdächtige Muster ließ sich in je 3.000 Läufen auf
  macOS und Linux nicht nachstellen, das Skript ist seitdem umgebaut). Seit
  dem 2026-11-18 hält der Test bei einem Fehlschlag die Spur des Skripts
  fest — wird er wieder rot, steht die Zeile da (COMPLETE „N14").
  Wackelig im Nacht-Lauf: `verify-handles-mentions` (und am 22.11.
  `verify-trial-notice`) scheitern ab und zu an
  `page.waitForLoadState('networkidle')` (30 s) — mit offener Live-Verbindung
  wird das Netz nie ganz still. Besser auf ein Element der Seite warten.
- **(e) erledigt am 2026-11-22** (COMPLETE „BT1 (e)"): Übersicht und
  Statistik einer Pool-Community sieht über den Not-Zugang nur der Betreiber.
- **(f) Reste aus dem roten Nacht-Lauf vom 2026-11-21** (COMPLETE „N21": ein
  Beweis-Skript ließ beide Probe-Communities ohne Plan zurück; behoben, und
  der Läufer prüft seitdem nach jedem Skript den Soll-Stand der Bühne).
  Offen geblieben:
  - **Die Browser-Tests der Bühne laufen nur nachts.** Eine neue oder
    geänderte Datei dort (`E2E_AUF_DER_BUEHNE` in `scripts/buehne/e2e.mjs`)
    zeigt sich am Pull Request nicht — so kam `narrow-screens-pool.spec.ts`
    ungeprüft nach `main` und war in ihrer ersten Nacht rot. Zwei Wege:
    (1) der Lauf am Pull Request fährt die Browser-Tests mit, wenn der Zweig
    eine dieser Dateien, `apps/comments/e2e/support/`, `scripts/buehne/` oder
    das Community-Layout berührt (kostet dort Chromium und rund zwei Minuten);
    (2) nur eine Regel: wer dort etwas ändert, startet den Nacht-Lauf einmal
    von Hand auf dem Zweig (`gh workflow run buehne.yml --ref <zweig> -f
    lauf=nacht`, rund 30 Minuten, öffnet kein Alarm-Issue). Empfehlung: (1),
    zusammen mit der Entscheidung in (c).
  - **Der Soll-Stand umfasst fünf Felder** (Status, Plan, Publikum,
    Registrierung, Sperre — `scripts/buehne/baseline.mjs`). Testphase
    (`trialEndsAt`), Zahlungsstand (`billingStatus`, `pastDueSince`) und die
    eigene Domain an der Zeile prüft er nicht; ein Skript, das dort etwas
    stehen lässt, fiele weiter erst später auf. Erweitern, sobald ein Skript
    diese Felder an den zwei geteilten Communities anfasst (heute nehmen die
    Skripte dafür eigene Communities).
  - **Die Spalte `plan` im Control Plane hat als Vorgabe noch den Altnamen
    `free`** (control-013). Eine geleerte Spalte wird damit `free`; das
    Programm liest das als `basic` (`normalizeTenantPlan`), es ist also kein
    Fehler, aber im Protokoll und in der Datenbank steht ein Name, den es
    sonst nicht mehr gibt. Vorgabe mit einer kleinen Migration auf `basic`
    ziehen.
  - **Warnungen der Betreiber-App im Bühnen-Lauf** (im Protokoll des roten
    Laufs gesehen, nicht nachgestellt): die Symbol-Sammlungen `simple-icons`
    und `vscode-icons` seien lokal nicht da, einzelne `lucide`-Symbole ließen
    sich nicht laden. Ansehen, welche Seite sie verlangt und ob sie im
    gebauten Stand ebenfalls fehlen (`pnpm check:icons` sieht es nicht).
  - **Der erste geplante Nacht-Lauf auf `main` mit der neuen Prüfung** ist
    der vom 2026-11-22. Auf dem Zweig war derselbe Lauf grün (67 von 67,
    Browser-Tests 3 von 3). Zu tun ist nur etwas, wenn er rot ist — dann
    öffnet er das Alarm-Issue von selbst; „Bühne verändert: …" in der
    Tabelle nennt das Skript.
- **(g) Seitenlauf gegen Abweichungen: zwei Dashboards fehlen.** Seit dem
  2026-11-21 (COMPLETE „Q15") lädt ein Browser-Test jede Seite der
  Dashboard-Seitenleiste frisch vom Server und wird rot, wenn die Konsole eine
  Abweichung zwischen Server- und Browser-Fassung meldet — für die
  Einzel-Instanz im Pflicht-Lauf (`apps/comments/e2e/dashboard-landmarks.spec.ts`)
  und für den Pool nachts auf der Bühne (`dashboard-hydration-pool.spec.ts`).
  Nicht dabei: die Dashboards der Betreiber-App (`packages/control`) und von
  branding.supply (`packages/brand`, `packages/insights`). Dort haben sieben
  Seiten dasselbe Muster gehabt (Abruf nur im Browser, die Vorlage verzweigt
  auf „lädt") und am 2026-11-21 dieselbe Korrektur bekommen
  (`isFetchLoading`), ABER OHNE MESSUNG im Browser: `requests`, `abuse`,
  `market-signal` (control), `intro-calls`, `waitlist`, `brand-unlocks`
  (brand), `insights/radar` (insights). Zu tun: denselben Lauf
  (`apps/comments/e2e/support/hydration.ts`) in die E2E-Datei der Betreiber-App
  aufnehmen (braucht dort ein Betreiber-Konto) und für branding.supply
  ergänzen, sobald dessen Server in den Browser-Tests steht (hängt an (a)).
  Außerdem läuft der Test nur gegen den Dev-Server; der Production-Build ist
  einmal von Hand gemessen.
