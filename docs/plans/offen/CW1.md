# CW1 — Einzelheiten

> Einzelheiten zum offenen Punkt **CW1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**CW1 — Wackler in CI und Ausliefern (beobachtet von der Gruppe N13 am 2026-11-18).**
An diesem Tag führten drei Gruppen gleichzeitig zusammen. Drei Beobachtungen,
jede mit Fundstelle; keine ist ein Fehler im Programm, alle kosten Zeit. (Ein
vierter Wackler, ein Test des Ausliefer-Skripts, steht mit dem, was dagegen
getan ist, in OPEN-ITEMS-COMPLETE unter „MG1“.)

- **(a) Erledigt am 2026-11-24 (COMPLETE „CW1 (a)(d)").** Sieben E2E-Läufe, in denen der Test-Server nicht startete.**
  Gemessen am 2026-11-18 aus 56 Läufen: in 49 grünen stand der Server nach
  20 bis 39 Sekunden, in 7 roten gar nicht (volle 120 Sekunden, alle am
  2026-11-18 zwischen 07:54 und 08:38 UTC, auf Zweigen von drei Gruppen) —
  dazwischen liegt kein Lauf. Die Frist ist deshalb NICHT angehoben. Die
  Ursache ist offen; seit dem 2026-11-18 steht in der CI die Ausgabe des
  Dev-Servers im Job-Log, beim nächsten Hänger also der Grund. Die zwei
  Beweis-Skripte der Bühne warten seitdem auf die erste fehlerfreie Seite
  (COMPLETE „N15"); ob das ihre zwei roten Läufe geheilt hätte, ist nicht
  belegt.
- **(b) Erledigt am 2026-11-18 (Davids Entscheidung, COMPLETE „N15").** Die
  Pflicht-Prüfung `secrets` liest je Pull Request nur noch den eigenen Zweig.
  Alle Zweige liest einmal am Tag `secrets-watch.yml` und meldet einen Fund
  als Issue `geheimnis-alarm`. Vor dem ersten Push eines Zweigs weiter lokal
  prüfen: `gitleaks git --no-banner --redact --exit-code 1
  --log-opts="origin/main..HEAD" .`
- **(c) Erledigt am 2026-11-28 (COMPLETE „CW1 (c)(e)").** Jeder Deploy-Lauf
  liefert jetzt den neuesten grünen Commit von `main` aus, nicht nur seinen
  Auslöser. Gemessen seit dem 2026-11-24: Merges mit App-Änderung waren nach
  12 bis 26 Minuten live (Median 18).
- **(e) Erledigt am 2026-11-28 (COMPLETE „CW1 (c)(e)").** Vom 2026-11-21 bis
  zum 2026-11-28 meldete kein Deploy-Lauf „Überholt"; alle sechs Apps liefen
  am 2026-11-28 auf der Spitze von `main`. Die Sperren bleiben nur im Test
  gesehen.
- **(f) Statistik-Seite: einmal eine Abweichung zwischen Server und
  Browser.** Gemessen am 2026-11-24: seit dem 2026-11-18 liefen 104
  E2E-Läufe auf `main`, einer war rot (2026-11-21, Commit `121276a3`):
  `dashboard-landmarks.spec.ts` meldete auf `/dashboard/community/statistics`
  „Hydration node mismatch" (Server zeichnete einen Kommentar, der Browser
  erwartete ein Fragment, am Element mit `aria-busy`). Die zwei anderen roten
  Läufe lagen auf Zweigen und waren echte Fehler dieser Zweige. Die Seite
  fragt ihre Zahlen erst nach dem Einhängen (`onMounted`); woher der
  Unterschied kommt, ist nicht belegt. Nicht stumm schalten; beim nächsten
  roten Lauf mit diesem Fall die volle Meldung lesen.
