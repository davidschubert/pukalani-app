# CW1 — Einzelheiten

> Einzelheiten zum offenen Punkt **CW1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**CW1 — Wackler in CI und Ausliefern (beobachtet von der Gruppe N13 am 2026-11-18).**
An diesem Tag führten drei Gruppen gleichzeitig zusammen. Drei Beobachtungen,
jede mit Fundstelle; keine ist ein Fehler im Programm, alle kosten Zeit. (Ein
vierter Wackler, ein Test des Ausliefer-Skripts, steht mit dem, was dagegen
getan ist, unter [MG1](MG1.md).)

- **(a) Sieben E2E-Läufe, in denen der Test-Server nicht startete.**
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
- **(c) Dichte Merges schieben das Ausliefern vor sich her.** Ein laufender
  Lauf wird nie abgebrochen, aber es wartet immer nur EINER: jeder weitere
  Merge verdrängt den wartenden Lauf, und ein roter Test auf `main` hält
  alles auf: drei Merges der Gruppe N13 waren erst nach 28, 32 und 40 Minuten
  live. Empfehlung für Tage mit mehreren Gruppen: Merges bündeln. Verloren
  geht dabei nichts — der nächste Lauf liefert alles seit dem ältesten
  lebenden Build aus.
- **(d) Eine App ohne Antwort: ein älterer Commit wird trotzdem
  ausgeliefert.** Seit dem 2026-11-21 überspringt der Schritt „Deploy nötig?"
  einen Commit, den `main` überholt hat (COMPLETE „N20"). Eine Lücke bleibt:
  meldet eine App keinen Build (502, Zeitüberschreitung), liefert der Lauf
  wie bisher sicherheitshalber aus — auch dann, wenn sein Commit älter ist
  als die Spitze von `main`. Das braucht zwei Dinge zugleich (eine tote App
  und eine neu gestartete Prüfung auf einem älteren Commit). Möglicher Weg:
  in diesem Fall nur ausliefern, wenn der Commit die Spitze von `main` ist,
  sonst mit Warnung überspringen. Ein neuer Fall in
  `packages/core/tests/deployDecision.test.ts` gehört dazu.
- **(e) Die zwei Sperren sind noch in keinem echten Lauf gesehen.** Geprüft
  sind sie nur im Test. Beim nächsten Lauf, der „Überholt" meldet: im
  Protokoll des Schritts „Deploy nötig?" nachlesen, ob die Meldung stimmt,
  und den Live-Build mit der Spitze von `main` vergleichen. Kein Bauen, nur
  Hinsehen.
