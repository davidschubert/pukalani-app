# Archiv: erledigte Betriebs-Skripte

Hier liegen Skripte, die **einmal auf Production gelaufen und damit erledigt**
sind. Sie sind das wörtliche Protokoll dessen, was dort passiert ist, und die
Vorlage für das nächste Skript derselben Sorte. **Von hier aus wird nichts
ausgeführt.**

| Skript | Was es getan hat | Gelaufen | Runbook |
| --- | --- | --- | --- |
| `appwrite-upgrade-2.6.sh` | Appwrite 2.0.0 → 2.6.1 auf appwrite-prod | 2026-10-24 | [APPWRITE-2-6-UPGRADE.md](../../runbooks/APPWRITE-2-6-UPGRADE.md) |
| `appwrite-upgrade-2.6.2.sh` | Appwrite 2.6.1 → 2.6.2 | 2026-10-27 | [APPWRITE-2-6-UPGRADE.md](../../runbooks/APPWRITE-2-6-UPGRADE.md) |
| `appwrite-upgrade-2.7.1.sh` | Appwrite 2.6.2 → 2.7.1 | 2026-11-06 | [APPWRITE-2-7-UPGRADE.md](../../runbooks/APPWRITE-2-7-UPGRADE.md) |
| `appwrite-upgrade-2.7.3.sh` | Appwrite 2.7.1 → 2.7.3 | 2026-11-18 | [APPWRITE-2-7-UPGRADE.md](../../runbooks/APPWRITE-2-7-UPGRADE.md) |
| `appwrite-aw28-drop-smtp-keepalive-patch.sh` | nahm den SMTP-KeepAlive-Patch aus der Override (AW28) | 2026-11-08 | [APPWRITE-2-7-UPGRADE.md](../../runbooks/APPWRITE-2-7-UPGRADE.md) |

Die Pfade in den Köpfen der Skripte (`ops/…`) sind der Stand von damals und
bewusst nicht angepasst.

## Die Regel (seit 2026-11-15, Gesamtaudit OPS-005)

- **`ops/` und `scripts/ops/` enthalten nur, was heute läuft** oder für den
  Betrieb gebraucht wird (Ausliefern, Rückweg, Backup, Wächter). Der Deploy
  kopiert aus `ops/` nur die Ecosystem-Datei der jeweiligen App und
  `pm2-heal.sh` auf den App-Server.
- **Ein einmaliges Skript zieht um, sobald es auf Production gelaufen ist:**
  - Ist es klein und die Vorlage für das nächste Mal (Appwrite-Upgrades), kommt
    es hierher, und das Runbook verlinkt es hier.
  - Ist es ein großes Umzugs-Werkzeug mit Schreibzugriff auf Production, das
    niemand ein zweites Mal fahren soll, wird es **gelöscht**, samt seinen
    Tests. Das Runbook nennt dann den letzten Commit, in dem es liegt
    (`git show <commit>:<pfad>`).
- Ein neues Upgrade-Skript entsteht als Kopie des letzten von hier, liegt für
  die Dauer des Upgrades unter `ops/` und zieht nach dem Lauf hierher.

Gelöscht statt archiviert (Stand 2026-11-15, letzter Commit mit den Dateien:
`9788e7ab`): `scripts/ops/ah4c-project-transfer.mjs` mit `ah4c-lib/`
(Runbook [ADMIN-PROJEKT-CUTOVER.md](../ADMIN-PROJEKT-CUTOVER.md)),
`scripts/ops/f3-comments-to-pool.mjs` mit `f3-lib/`
(Runbook [F3-CUTOVER.md](../F3-CUTOVER.md)),
`scripts/ops/repair-runtime-project.mjs`,
`scripts/ops/cleanup-portfolio-legacy-tables.mjs` und der Ordner `spikes/`.
