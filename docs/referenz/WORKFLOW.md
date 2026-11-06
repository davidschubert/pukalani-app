# Arbeitsablauf je Vorhaben (Davids Workflow, 2026-08-28)

So setzen wir Projekte und größere Aufgaben um — von der Idee bis zum
dokumentierten Deploy. Der Ablauf ist beim Brand-Wizard entstanden und
gilt als Vorlage für alles Weitere. Er ergänzt die bestehenden Regeln
(CLAUDE.md, Doku-Ordnung), er ersetzt sie nicht.

## Die Phasen

1. **Strategie** — Wo kommen wir her, wo stehen wir, wo wollen wir hin?
   Beinhaltet ausdrücklich die ANALYSE: Bestandsaufnahme, Markt- und
   **Konkurrenzanalyse**, Zielgruppen, vorhandenes Material (beim
   Brand-Wizard: die 7 Formulare + Internetrecherche Soll/Ist).
2. **Konzeption** — Idee, Inhalt, Design-Richtung und technische
   Konzeption als EIN Plan-Dokument in `docs/plans/` mit expliziten
   Verträgen (Datenmodell, Sicherheit, Messung, UI/UX, Frontend/API).
   Entscheidungen fallen HIER, nicht während der Implementierung —
   offene Punkte werden als strukturierte Fragen mit Optionen und
   Empfehlung gestellt.
3. **Prototyp** — klickbarer Dummy auf Basis **echter Nuxt-UI-
   Komponenten** im minimalen Layer-Gerüst, mit echtem Inhalt (nie
   Lorem) und je EINEM Screen pro Interaktionstyp. Iteration direkt am
   lebenden Objekt: Claude baut, David korrigiert.
4. **Prototyp-Freigabe** — David nimmt Design und Bedienung ab. Eine
   separate „Überführung ins finale Design" gibt es bewusst NICHT: der
   Prototyp IST die Komponenten-Vorlage („nichts wird zweimal gebaut"),
   die Umsetzung übernimmt ihn, statt ihn nachzubauen.
5. **Technische Umsetzung** — in abnehmbaren Arbeitspaketen (P-Schnitte)
   mit klaren Gates; Schema-/Vertrags-Anhänge VOR dem Bau zur Durchsicht.
   Kern-Regeln aus CLAUDE.md gelten immer (Datentür, Migrations-Runner,
   eigene Commits für Core-Änderungen, erst `main` prüfen).
6. **Audit & Prüfung** — externes/zweites Augenpaar auf Code-Ebene;
   Befunde werden VERIFIZIERT (nicht geglaubt) und als Verträge
   eingearbeitet. Audits sind außerdem schon in Phase 2 erwünscht —
   jede Phasen-Grenze ist ein Audit-Gate, nicht nur diese Stufe.
7. **Testing & Korrekturschleifen** — automatisierte BEWEISE zuerst
   (verify-Skripte mit Gegenproben, Unit auf pure Regeln, Playwright für
   Verhalten), dann manuelle Durchgänge; Korrekturen zurück in 5.
8. **Audit & Prüfung (zweite Runde)** — nach den Korrekturen; prüft
   auch, dass die Beweise die Verträge wirklich abdecken.
9. **Finale Freigabe** — Davids Go auf Basis grüner Beweise + eigener
   Prüfung (beim Brand-Wizard zusätzlich: Usability-Test).
10. **Deployment** — nach Betriebs-Checkliste, nie als Einzelschritt:
    **Migration VOR Code-Deploy** → ggf. deaktivierter Deploy →
    Smoke-Test → Freischaltung; Rollback-Weg benannt. Prod-Beweis ist
    IMMER der Live-Build-SHA (`/api/health`), nie das CI-Grün allein.
11. **Changelog & Docs** — Changelog-Eintrag, Doku-Site/Hilfe wo
    betroffen, README-Status; **Erledigtes zieht sofort nach
    OPEN-ITEMS-COMPLETE.md um — mit einer „Gelernt:"-Zeile**, wenn etwas
    nicht auf Anhieb ging. Danach Wächter/Monitoring bestätigen.

## Drei Grundsätze quer über alle Phasen

- **Beweise statt Behauptungen:** jede Zusage hat ein Skript, eine
  Messung oder einen Screenshot — mit Gegenprobe (fail-soft-Pfade sind
  sonst immer grün).
- **Freigaben sind explizit:** kein Phasenwechsel ohne das ausgesprochene
  Go; Entscheidungen gegen eine Empfehlung werden festgehalten (Wer,
  Wann, Warum → DECISION-LOG bzw. Plan).
- **Gelerntes wird notiert, nicht wiederholt:** Fallen und Erkenntnisse
  wandern in COMPLETE/Referenz/Memory, damit die nächste Umsetzung sie
  geerbt hat.

## Sitzungsführung je Phase (seit 2026-09-09)

Jede Runde einer Session sendet den ganzen bisherigen Kontext neu; das
Nutzungslimit ist über alle Modelle geteilt. Deshalb gehört zur Arbeit an
jeder Phase auch die Frage, WELCHE Session sie trägt und WER darin denkt.
Die Regeln im Einzelnen (mit Begründung und Messwerten) stehen in
[SESSION-HYGIENE.md](SESSION-HYGIENE.md); hier nur die Zuordnung:

- **Phasen 1–2 (Strategie, Konzeption):** Recherche und Bestandsaufnahme an
  Explore/audit-scout (Haiku/Sonnet, laden CLAUDE.md nicht), nur die
  Schlussfolgerung zurück. Die Konzeption endet mit Commit — der Bau startet
  in einer NEUEN Session, nicht im Verlauf der Planung.
- **Phase 3 (Prototyp-Iteration):** David sammelt Befunde und schickt sie als
  EINE nummerierte Liste; ein falscher Weg wird per `/rewind` (Doppel-Esc)
  zurückgenommen und der Auftrag korrigiert gestellt, statt eine Korrektur
  nachzuschieben. Claude baut Änderungen gebündelt, nicht Stück für Stück.
- **Phase 5 (Umsetzung):** Opus baut mit vollständigem, selbständigem Auftrag
  (Pfade, Ursache, Ziel, Gate-Liste, „kein Commit"); Fable prüft im
  Hauptloop. Ein Paket = eine Session; falsches Ergebnis eines Sub-Agenten =
  neu spawnen mit korrigiertem Auftrag, nicht nachsteuern.
- **Phasen 6–8 (Audit, Testing):** audit-scout (Haiku) vor audit-worker
  (Opus); Testläufe mit großer Ausgabe im Sub-Agenten, Playwright mit
  `--reporter=dot`; Beweise als Zahlen und `read_page`, Screenshots nur zum
  Schluss.
- **Phasen 9–11 (Freigabe, Deploy, Docs):** Wartezeiten (CI, Deploy) sind
  keine Runden — kein Polling im Minutentakt, kein Loop ohne Zweck. Der
  Abschluss (COMPLETE-Eintrag, Push, Live-SHA) beendet die Session; das
  nächste Vorhaben startet über die Karte.
- **Quer über alle Phasen:** `/effort` nach Aufgabe, `/context` einmal je
  Session, `/usage` einmal je Woche; Compaction nur vor einer Pause und mit
  Fokus; MCP-Server ohne Repo-Bezug aus.
