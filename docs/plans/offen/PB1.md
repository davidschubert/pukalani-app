# PB1 — Einzelheiten

> Einzelheiten zum offenen Punkt **PB1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**PB1 — Profilbild-Ablage: Nacharbeiten (aus dem Gesamtaudit, Paket P01).**
Abgeglichen am 2026-11-13 mit dieser Liste, den Audit-Paketen und den laufenden
Sitzungen: an keinem der Punkte unten wird gerade gearbeitet. Schon woanders
eingeplant und deshalb NICHT hier: der Wächter für Rechte an TABELLEN (Paket
P13, „Schreiben nur noch über den Server") und hochgeladene Bilder, die
ohne gespeichertes Profil liegen bleiben (KE3, gebaut am 2026-11-17 — COMPLETE „N04"). Beim Abgleich erledigt: der echte
Upload auf `account.pukalani.app` ist gemessen (COMPLETE „GA1 P01", Beweis h),
und die 9 in der CI übersprungenen E2E-Tests sind die neun Themes aus
`apps/comments/e2e/themes-visual.spec.ts`, die mit Absicht nur lokal laufen.

- **(a) Upload auf den drei anderen Seiten.** Die Upload-Route schreibt seit
  P01 mit dem Laufzeit-Schlüssel der jeweiligen Site. Gemessen ist das im
  Projekt `account`. Auf `admin.pukalani.app`, `portfolio.pukalani.app` und
  `branding.supply` je einmal ein Profilbild hochladen (wo die Seite eines
  anbietet). Scheitert es, fehlt dem Schlüssel dort das Schreibrecht für
  Dateien ([APPWRITE-KEYS.md](../../runbooks/APPWRITE-KEYS.md)).
- **(c) Erledigt am 2026-11-18 (COMPLETE „N15").** Ein voller Lauf des
  Migrations-Runners legt nichts mehr an, was eine spätere Migration wieder
  entfernt. Die alten Migrationen tragen dafür eine Wache; ein Test hält
  fest, dass jede neue Stelle dieser Art sie auch trägt.
