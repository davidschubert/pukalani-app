---
paths:
  - "docs/**"
  - "README.md"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-11-08 (Token-Hygiene, SH1 e): lädt
     automatisch, sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen
     (cat/sed) diese Datei bewusst per Read öffnen. Wortlaut unverändert. -->

## Doku-Ordnung (seit 2026-07-28) — Karte: docs/README.md
Vier Sorten, jede mit genau EINEM Zuhause. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte; sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.
- **Steuerung** `docs/` — **docs/OPEN-ITEMS.md ist DIE EINE offene-Punkte-
  Liste** und enthält seit 2026-07-30 (Davids Regel) **NUR noch Offenes**:
  EINE Tabelle „Jetzt dran — in dieser Reihenfolge" mit den Spalten
  # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details,
  darunter „Geparkt / wartet" und ein Anhang „Notizen". Jeder Eintrag max.
  3 gerenderte Zeilen; die Tiefe lebt im verlinkten Plan, nicht in der Liste.
  **Erledigtes zieht SOFORT und FINAL nach `docs/OPEN-ITEMS-COMPLETE.md`** —
  das ist das Lern-Gedächtnis (vollständiger Eintrag + Datum + eine fette
  Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging), ausdrücklich KEINE
  Arbeitsliste. Offene Punkte gehören AUSSCHLIESSLICH in OPEN-ITEMS.md, NIE in
  ein Plan-Dokument und NIE in eine zweite Liste (am 2026-07-28 gab es kurz
  `OFFENE-TASKS.md` daneben — genau die Doppelpflege, die das verhindert).
  Dazu CONCEPT.md (Architektur A1–A14), GOALS.md, DECISION-LOG.md.
- **Referenz** `docs/referenz/` — wie ist X gebaut (RBAC, Themes, Embed,
  Auth-Forms, Moderation, Pool/Silo-Blueprint, Produkt-Bilanz, Manifest-
  Strategie, Produktvertrag, Changelog-Workflow). Lebt mit dem Code.
- **Runbooks** `docs/runbooks/` — Betriebs-Anleitungen (Deployment, Stripe
  Go-Live + Testmodus, Control-Cutover, Key-Swap). Die Häkchen dort sind ECHT
  und werden pro Durchlauf abgehakt.
- **Archiv** `docs/archiv/` (+ `archiv/audits/`) — ausgeführte Pläne und
  Audits. Wertvoll als Begründung und Rezept, aber KEINE Arbeitsliste:
  offene Kästchen sind bewusst zu Aufzählungen entschärft.
- `docs/plans/` enthält nur, was NOCH NICHT gebaut ist. Sobald ein Plan
  ausgeführt ist: Datei nach `archiv/`, Reste nach OPEN-ITEMS.md.
- `docs/content/` = interne Doku-SITE (admin.pukalani.app/docs),
  `apps/help/content/` = Kunden-Hilfe (help.pukalani.app) — beides Produkt,
  kein Planungsdokument.
- **Arbeitsablauf je Vorhaben** (Davids Workflow 2026-08-28): Strategie
  (inkl. Analyse/Konkurrenz) → Konzeption → Prototyp (echte Nuxt-UI-
  Komponenten) → Freigabe → Umsetzung → Audit → Testing → finale Freigabe
  → Deployment → Changelog/Docs — Details: docs/referenz/WORKFLOW.md.
