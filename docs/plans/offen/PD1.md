# PD1 — Einzelheiten

> Einzelheiten zum offenen Punkt **PD1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**PD1 — Plan, Testphase und eigene Domain: Reste (aus dem Gesamtaudit, Paket P15).**
Gebaut am 2026-11-17 (COMPLETE „N06"): die zwei Alt-Pläne im Kasten „Pläne &
Limits" haben Namen, und der letzte Schritt des Wizards zeigt bei einer
unbestätigten Adresse den Kasten mit „Mail erneut senden".

- **(a) Stripe-Endpunkt neu anlegen.** Der vorhandene Endpunkt (Testbetrieb)
  sendet in der Standard-Version des Stripe-Kontos; die feste Version bekommt
  ein Endpunkt nur beim Anlegen. Davids Entscheidung vom 2026-11-17: beim
  Wechsel auf echtes Geld (A2) — dort wird der Endpunkt für den echten Betrieb
  ohnehin über `admin.pukalani.app` → Stripe neu angelegt und bekommt die
  Version von selbst; die Karte zeigt, ob sie stimmt. Danach können die zwei
  Stellen fallen, die beide Formen eines Ereignisses lesen
  (`current_period_end`, Abo-Verweis der Rechnung).
- **(b) Klicks auf den echten Seiten.** Lokal belegt, auf Production nicht
  geklickt: der Wizard mit einem Konto, das seine Testphase schon hatte
  („Ohne Testphase"); der Schalter „freigegeben" in der Betreiber-Tabelle; die
  Domain-Seite eines Owners ohne Freigabe. Neu dazu: der Wizard mit einem
  Konto ohne bestätigte Adresse (Kasten und Knopf erscheinen).
- **(c) Drei Grundsatzfragen, je mit Empfehlung.**
  (1) Der Hinweis zur Domain steht in der Glocke unter „Zahlungsproblem" (Art
  `billing`). Empfehlung: so lassen, bis der erste echte Fall zeigt, dass der
  Titel verwirrt; eine eigene Art kostet einen Text je Sprache im Core.
  (2) Beitritt und Annahme einer Einladung sind unter gleichzeitigen Anfragen
  nicht geprüft. Empfehlung: die Sperre `team` nehmen (`withControlLock`),
  sobald Beitritte in Zahl kommen; doppelte Zeilen verhindert heute schon der
  Unique-Index. (3) Die Kontolöschung im Control Plane nimmt die Team-Sperre
  nicht. Empfehlung: beim nächsten Griff an die Kontolöschung mitnehmen.
- **(c) Kleinigkeiten.** Der Schonfrist-Lauf ist seit 2026-11-17 scharf
  (Runbook: [EIGENE-DOMAIN-FREIGABE.md](../../runbooks/EIGENE-DOMAIN-FREIGABE.md));
  die erste echte Frist und die ersten echten Hinweis-Mails stehen noch aus —
  beim ersten Fall die Mail im Postfach ansehen. Ein Eintrag im Zustand
  „Fehler", der schon einmal einen Nachweis hatte, verfällt nie. Die eigene
  Domain der Einzel-Sites (`websites`) behält die alte Regel: jeder Eintrag
  blockiert, auch ohne Nachweis. Der Schalter „freigegeben" kann fallen,
  sobald das Pukalani-Konto je Seite eine eigene Sitzung ausstellt (Etappe E1).
