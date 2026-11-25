---
paths:
  - "docs/**"
  - "README.md"
---

## Doku-Ordnung — Karte: `docs/README.md`
Vier Sorten, jede mit genau EINEM Zuhause. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte und trägt sie in die Karte ein
(`pnpm check:doc-links` hält Verweise, Karte und Plan-Status).
- **Steuerung** `docs/` — **`docs/OPEN-ITEMS.md` ist DIE EINE offene-Punkte-
  Liste** und enthält NUR Offenes (Davids Regel): sechs Abschnitte nach
  Produkt — Community-App · branding.supply · Studio · Pukalani-Konto ·
  Projekt & Kern (Betrieb, Core, Tests, Recht übergreifend; KR1) · Bugs
  (tritt heute auf). Spalten # | Was | Prio | Aufwand | Wer (David/Session/
  Termin) | Bereich (Betrieb/Recht/Geld/Feature/Test/Aufräumen) | Braucht
  David? | Details / Wartet auf. Ein Punkt steht GENAU EINMAL (Hauptprodukt
  oder Kern), andere Abschnitte nennen nur das Kürzel als Verweis.
  Bewusst Zurückgestelltes steht im Anhang. Jeder Eintrag hat ein
  KÜRZEL und höchstens 3 gerenderte Zeilen; die Tiefe lebt im verlinkten Plan
  oder je Kürzel in `docs/plans/offen/<Kürzel>.md`, nicht in der Liste.
  **Erledigtes zieht SOFORT und FINAL nach `docs/OPEN-ITEMS-COMPLETE.md`** —
  das ist das Lern-Gedächtnis (vollständiger Eintrag + Datum + eine fette
  Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging), ausdrücklich KEINE
  Arbeitsliste. Offene Punkte gehören AUSSCHLIESSLICH in OPEN-ITEMS.md, NIE in
  ein Plan-Dokument und NIE in eine zweite Liste.
  Dazu `docs/CONCEPT.md` (Architektur, Abschnitte A1 ff.), `docs/GOALS.md`,
  `docs/DECISION-LOG.md`.
- **Referenz** `docs/referenz/` — wie ist X gebaut (RBAC, Themes, Embed,
  Auth-Forms, Moderation, Produkt-Bilanz, Manifest-Strategie, Produktvertrag,
  Changelog-Workflow, …). Lebt mit dem Code.
- **Runbooks** `docs/runbooks/` — Betriebs-Anleitungen, die heute gelten
  (Deployment, Stripe Go-Live + Testmodus, Wiederherstellung, Alarm, …). Die
  Häkchen dort sind ECHT und werden pro Durchlauf abgehakt. Eine erledigte
  Umzugs-Anleitung zieht ins Archiv.
- **Archiv** `docs/archiv/` (+ `docs/archiv/audits/`) — ausgeführte Pläne,
  erledigte Umzüge und Audits. Wertvoll als Begründung und Rezept, aber KEINE
  Arbeitsliste: offene Kästchen sind zu Aufzählungen entschärft (der Wächter
  macht ein offenes Kästchen dort rot), Pfade von damals bleiben stehen.
  `docs/archiv/skripte/` (OPS-005): einmalige Betriebs-Skripte, die auf
  Production gelaufen sind. `ops/` und `scripts/ops/` enthalten nur, was
  heute läuft; große Umzugs-Werkzeuge mit Schreibzugriff auf Production werden
  nach dem Lauf GELÖSCHT (samt Tests), das Runbook nennt den letzten Commit.
  Regel: `docs/archiv/skripte/README.md`.
- `docs/plans/` enthält nur, was NOCH NICHT (ganz) gebaut ist. JEDER Plan
  trägt oben die Zeile `> **Plan-Status (JJJJ-MM-TT):** …` (nicht gebaut |
  teils gebaut — offen: … | Unterlage zu … | gebaut). Sobald ein Plan
  ausgeführt ist: Datei nach `docs/archiv/`, Verweise nachziehen, Reste nach
  OPEN-ITEMS.md.
- `docs/content/` = interne Doku-SITE (admin.pukalani.app/docs),
  `apps/help/content/` = Kunden-Hilfe (help.pukalani.app) — beides Produkt,
  kein Planungsdokument.
- **Arbeitsablauf je Vorhaben** (Davids Workflow): Strategie (inkl.
  Analyse/Konkurrenz) → Konzeption → Prototyp (echte Nuxt-UI-Komponenten) →
  Freigabe → Umsetzung → Audit → Testing → finale Freigabe → Deployment →
  Changelog/Docs — Details: `docs/referenz/WORKFLOW.md`.
- **Regelwerk** (`CLAUDE.md`, `.claude/rules/`): eine Regel sagt, was gilt und
  woran man es prüft. Herleitung, Datum, Messwert und Vorfall gehören in den
  Eintrag von OPEN-ITEMS-COMPLETE; die Regel nennt dessen Kürzel. Deckel und
  Pfad-Prüfung: `pnpm check:rules`.
