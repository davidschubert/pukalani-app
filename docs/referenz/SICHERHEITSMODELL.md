# Sicherheitsmodell — die Schutzschichten auf einer Seite

Stand: 2026-11-21. Diese Seite ist eine **Karte**: sie nennt, welche Schichten es
gibt und wo sie im Code und im Regelwerk stehen. Die Regeln selbst stehen in
`CLAUDE.md` und `.claude/rules/`; hier steht nichts, was dort nicht auch steht.

| Schicht | Was sie sichert | Code | Regel / Doku |
| --- | --- | --- | --- |
| Host und Herkunft | nur bekannte Hosts; Schreiben nur von eigener Herkunft | `packages/core/server/middleware/00.host-header.ts`, `03.csrf-origin.ts` | `.claude/rules/hosts-ops.md` |
| Anmeldung und Rollen | Sitzung, Rollen je Community, Betreiber-Rechte | `packages/core/server/middleware/02.auth.ts`, `07.community-role.ts` | `.claude/rules/appwrite.md`, `docs/referenz/RBAC-CONCEPT.md`, `docs/runbooks/ANMELDE-REGELN.md` |
| Bremsen | Rate-Limits je Route und Aufrufer | `packages/core/server/middleware/05.rate-limit.ts` | `.claude/rules/appwrite.md` (Bremsen) |
| Zustimmung | AGB-Pflicht vor schreibenden Aufrufen | `packages/core/server/middleware/07.consent-required.ts` | `.claude/rules/appwrite.md` (Zustimmung) |
| Mandanten-Trennung | jede Community sieht nur ihre Zeilen | `packages/core/server/utils/tenantDb.ts` | `.claude/rules/tenant-isolation.md` |
| Der Server schreibt | keine Tabelle trägt ein Schreibrecht für Konten | `scripts/lib/server-written-tables.mjs` | `CLAUDE.md` („DER SERVER SCHREIBT") |
| Produkt-Schalter | abschaltbare Produkte, Notabschaltung | `packages/core/server/middleware/04.product-gate.ts`, `server/utils/productGates.ts` | `.claude/rules/plans-products.md`, `docs/referenz/MULTI-SITE-PLATFORM-STRATEGIE.md` |
| Betreiber-Protokoll | Spur für Betreiber-Handlungen und Herausgaben | `packages/core/server/utils/auditLog.ts` | `CLAUDE.md` („BETREIBER-PROTOKOLL") |
| Personendaten | Export und Löschung je Layer | `scripts/lib/user-data-duty.mjs` | `docs/referenz/EXPORT-UND-LOESCHUNG.md` |
| Fehler und lange Läufe | keine stillen Fehler; Lauf-Sperre | `server/utils/softFail.ts`, `server/utils/runLease.ts` | `CLAUDE.md`, `.claude/rules/lange-laeufe.md` |
| Schlüssel und Zugänge | Schlüssel-Pflege und Rotation | — | `docs/runbooks/APPWRITE-KEYS.md`, `docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md`, `docs/runbooks/ZUGAENGE-AUFRAEUMEN.md` |
| Server und Auslieferung | Vorlagen, Schutz-Kopfzeilen, Rückweg | — | `.claude/rules/ops-server.md`, `.claude/rules/ops-ausliefern.md`, `docs/runbooks/DEPLOYMENT.md` |
| Wächter und Alarm | tägliche Kontrolle, Alarmweg | `.github/workflows/production-watch.yml` | `.claude/rules/ops-waechter.md`, `docs/runbooks/PRODUKTIONS-ALARM.md` |
| Vorfall | was bei Verdacht zu tun ist | — | `docs/runbooks/SICHERHEITSVORFALL.md` |

Pfade ohne Voranstellung liegen unter `packages/core/`, sofern die Spalte nichts
anderes nennt.
