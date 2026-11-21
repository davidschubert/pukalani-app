# BP1 — Einzelheiten

> Einzelheiten zum offenen Punkt **BP1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**BP1 — Betreiber-Dashboard und gemeldete Nachrichten: Reste (aus dem Gesamtaudit, Paket P16).**
Erledigt am 2026-11-17 (COMPLETE „N06"): die Speicher-Seite löscht nur noch
Profilbilder, Produkt-Schalter und Theme-Einstellungen überschreiben einander
nicht mehr, das Beweis-Skript der Nachrichten läuft gegen den lokalen Spiegel.

- **(a) Klick auf der echten Seite.** Als Betreiber im Dashboard unter
  „Personen": die Liste exportieren (kommt als Datei), nach mehr als zehn
  Minuten noch einmal — dann erscheint „Zur Sicherheit neu anmelden", und nach
  der Anmeldung geht es auf derselben Seite weiter. Lokal belegt, auf
  Production noch nicht geklickt. Dazu einmal ein Konto öffnen: die Karte
  „Aktivität" zeigt jetzt Einträge.
- **(b) Zähler des Protokolls.** Der tägliche Kontroll-Lauf berichtet
  `protokoll ausfaelle` je App und wird ab 3 in 25 Stunden rot. Die Schwelle
  ist gesetzt, nicht gemessen: nach einer Woche die berichteten Zahlen ansehen
  (zusammen mit WA1).
- **(d) Kleinigkeiten.** Der Zeitpunkt der Erledigung einer Meldung ist das
  `$updatedAt` ihrer Zeile: ein späterer Schreibvorgang an einer erledigten
  Meldung lässt die 90 Tage neu beginnen. Eine eigene Spalte machte es genau,
  braucht aber eine Migration auf Production. Empfehlung: erst bauen, wenn
  eine Route erledigte Meldungen beschreibt (heute hält der Fehler Daten nur
  länger, nie kürzer). David hat am 2026-11-18 so entschieden: warten. Der Lösch-Lauf liest je Takt höchstens 2.000 gemeldete
  Nachrichten. Die Schreib-Kette für `app_config` gilt je Prozess. Betreiber-Routen sind weiter an keinen Host
  gebunden — das gehört zum Pukalani-Konto (PK1).
