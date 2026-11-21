# SV1 — Einzelheiten

> Einzelheiten zum offenen Punkt **SV1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**SV1 — Schreiben nur über den Server: Reste (aus dem Gesamtaudit, Paket P13).**
Erledigt am 2026-11-17 (COMPLETE „N07"): der tägliche Blick von außen auf die
Anmelde-Wege der vier Projekte. Erledigt am 2026-11-18 (COMPLETE „N11"): der
Schalter „JWT" ist in allen vier Projekten aus. Die lokale Datenbank und die
der CI haben alle Schalter AN — Tests laufen dort unter anderen Bedingungen
als Production.

- **(a) Eine Klick-Probe** (KR1, „Anmeldung per Code und neue Community"). Auf den echten Seiten ist am
  2026-11-16 gezeigt: Beitrag, Kommentar und Stimme anlegen, ändern und
  löschen und die Glocke als gelesen markieren (über die Routen der Seite, in
  Davids angemeldetem Browser, als Owner); die Anmeldung per Code auf
  `admin.pukalani.app` (David) und die Anmeldung mit Passwort auf
  `demo.pukalani.app`. Nicht auf den echten Seiten gezeigt: die Anmeldung per
  Code im Projekt der Communities und auf branding.supply, das Kästchen der
  Betreiber-Bedingungen im Assistenten (nur lokal geklickt), Reaktionen und
  Meldungen, und das Schreiben als Mitglied ohne Rolle (lokal je Rolle
  geprüft). Antwortet eine Anmeldeseite mit „hier gerade nicht verfügbar":
  Schalter „Email OTP" im Projekt wieder einschalten
  ([ANMELDE-REGELN.md](../../runbooks/ANMELDE-REGELN.md)) und hier melden.
- **(c) Das direkte Lesen.** Ein Konto liest direkt bei der Datenbank weiter
  jede Zeile, für die es ein Leserecht trägt, und immer die ganze Zeile. Das
  hängt an der Live-Verbindung und gehört zum Pukalani-Konto
  ([PUKALANI-KONTO.md](../../plans/PUKALANI-KONTO.md), § 9, Punkt 1).
- **(d) Kleinigkeiten.** Die Nachfrage nach der Zustimmung gibt es nur, wo
  eine App Bedingungen hat (branding.supply, Betreiber-Seite); die Communities
  bekommen sie mit den AGB aus A1. Für Konten von vor dem 2026-11-18 wird der
  alte Vermerk einmal übernommen und als übernommen gekennzeichnet; ein Konto
  ohne Vermerk wird gefragt. Die sechs unbenutzten Alt-Tabellen im Projekt
  `portfolio` sind verschlossen, aber noch da (der Migrations-Runner fährt
  ihre Layer dort nicht; löschen wäre ein eigener Schritt mit Davids Ja).
  Anwesenheit und Datei-Ablagen sind nach der neuen Grundregel („der Server
  schreibt") noch nicht bewertet. Die Rückwege der Rechte-Migrationen liegen
  unter `packages/<layer>/scripts/rollback/` und sind nur lokal geprobt.
