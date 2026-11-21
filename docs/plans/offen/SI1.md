# SI1 — Einzelheiten

> Einzelheiten zum offenen Punkt **SI1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**SI1 — Sicherungen: Reste (aus dem Gesamtaudit, Paket P06).**
Gebaut am 2026-11-17 (COMPLETE „N06"): der stündliche Label-Abgleich findet
auch aktive Mitgliedschaften in stillgelegten Communities und das
Moderations-Label nach einer Herabstufung; seine Ops-Route ist gebremst.

- **(a) Klick-Probe auf Live.** Geprüft ist lokal. Auf einer Community: eine
  Einladung an eine Test-Adresse schicken und den Link aus einem
  Webmail-Fenster öffnen (die Seite muss die Einladung zeigen). Ein Test-Konto
  entfernen und sehen, dass die Liste „entfernt" zeigt und kein Hinweis auf
  einen offenen Lese-Zugang kommt.
- **(b) Bekannte Grenzen des Abgleichs (bewertet am 2026-11-18, COMPLETE
  „N14").** Findet der Lauf eine aktive Zeile in einer stillgelegten
  Community, nimmt er das Label; die Zeile im Control Plane bleibt `active`.
  **Im selben Lauf lässt sich das nicht sauber nachziehen:** der Lauf gehört
  der Platform-App, und die liest das Control Plane mit Absicht nur.
  **Woran man solche Zeilen erkennt:** `disabledCandidates` im Log der
  Platform-App (`community_label.reconcile`) steht über 0, bis die Zeilen von
  Hand auf `removed` stehen (`disabledStale` fällt nach dem ersten Entzug auf
  0 — Runbook und Kommentar nannten bis dahin die falsche Zahl).
  **Empfehlung, wenn es von selbst gehen soll:** ein eigener stündlicher Lauf
  in der Betreiber-App (sie darf im Control Plane schreiben), der genau diese
  Zeilen auf `removed` stellt — zuerst nur zählend, scharf erst mit Davids Ja
  zur Zahl. Dazu gehört eine Zeile in `ops/timed-jobs.conf`; deshalb erst,
  wenn der Umbau des Ausliefer-Wegs fertig ist. Im lokalen Spiegel waren es
  drei Zeilen.
  Weiter offen und klein: eine Herabstufung, die älter ist als 26 Stunden und
  in der Zeit keinen Lauf sah, heilt erst der nächste Besuch. Die zwei neuen
  Listen haben einen Deckel von 1.000 Zeilen ohne Lesestelle (steht im Log,
  wenn er greift). Die Lesestelle der entfernten Zeilen lebt nur im Prozess —
  das zählt erst ab 1.000 entfernten Zeilen. Die Reihenfolge je Konto gilt nur
  innerhalb eines Prozesses; der Schreiber liest nach und wiederholt, einen
  Entzug holt der Lauf nach. Ein ganzer Lauf gegen eine Bühne mit
  stillgelegter Community steht noch aus.
  Runbook: [LABEL-ABGLEICH.md](../../runbooks/LABEL-ABGLEICH.md).
