---
paths:
  - "packages/*/server/plugins/**"
  - "apps/*/server/plugins/**"
  - "packages/core/server/utils/timedJob.ts"
  - "packages/core/server/utils/rowRetention.ts"
  - "packages/core/shared/rowRetention.ts"
  - "ops/timed-jobs.conf"
  - "**/*Retention*"
  - "**/*retention*/**"
  - "**/*Sweep*"
  - "**/app.config.ts"
---

## Läufe im Takt: Zeit-Lauf und Fristen-Lauf

Lange Arbeit einer ANFRAGE (Lauf-Sperre, 202, Abfragen): `lange-laeufe.md`.
Der Alarm, der diese Läufe liest: `ops-waechter.md`.

- ZEIT-LAUF (Sweep, Aufräumer im Takt) NUR über `defineTimedJob()`
  (`core/server/utils/timedJob.ts`, OPS-011) — nie eigenes `setInterval` in
  einem Server-Plugin (Wächter `core/tests/timedJobGuard.test.ts`). Die Hilfe schreibt je Takt `job.run`; der
  Alarm liest daran „überfällig" und „gescheitert". Neuer Lauf ⇒ Kennung in
  `ops/timed-jobs.conf` für jede App, in der er fährt.
- FRISTEN-LAUF (löscht nach einer Frist; EL1/KE3/RU1) NUR auf dem Gerüst
  `core/shared/rowRetention.ts` + `core/server/utils/rowRetention.ts`:
  Schalter `off | count | apply`, Vorgabe `off`. LIVE GEHT ER MIT `count`
  (liest mit der Auswahl von `apply`, schreibt nichts, meldet `retention.run`);
  `apply` setzt je App eine Zeile in deren `app.config.ts`, mit Davids Ja zur
  gezählten Zahl. Regel je Zeile pur im Layer der Tabelle (Test mit gestellter
  Uhr), Hand-Route zählt ohne Angabe nur. Ein Lauf, der an einem Schalter
  hängt, der schon auf `apply` steht, bekommt für Neues einen EIGENEN Schalter.
  Fristen und Läufe: `docs/referenz/EXPORT-UND-LOESCHUNG.md`.
