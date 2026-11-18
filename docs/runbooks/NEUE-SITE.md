# Runbook: Neue Site auf dem App-Server anlegen

Stand 2026-11-16 (Gesamtaudit, Paket P23, Finding OPS-003).

**Wozu.** Die sechs Sites des App-Servers sind einzeln und von Hand entstanden.
Zwei reichten monatelang die Adresse des Aufrufers nicht an die App weiter,
zwei setzten Schutz-Kopfzeilen, vier nicht. Seitdem gilt: die Webserver-
Einstellung einer Site kommt aus einer **Vorlage im Repo**, und ein täglicher
Blick vergleicht jede Site mit den Pflicht-Zeilen dieser Vorlage.

Dieses Runbook ist der Teil „Webserver und Zeitpläne". Was eine neue App sonst
braucht (Appwrite-Projekt, `.env`, Migrationen, Zertifikat), steht in
[DEPLOYMENT.md](./DEPLOYMENT.md) und für die bestehenden Sites in
[BRANDING-SUPPLY-SETUP.md](./BRANDING-SUPPLY-SETUP.md) und
[CONTROL-CUTOVER.md](../archiv/CONTROL-CUTOVER.md). Eine neue Site ist die Ausnahme:
ein neues Produkt bekommt einen eigenen Layer, aber standardmäßig **keine**
eigene Site (Silo-Regel in `CLAUDE.md`).

## Die Dateien

| Datei | Was sie sagt |
| --- | --- |
| `ops/nginx/einzel-site.conf.template` | eine App, feste Namen (admin, help, pukalani.studio) |
| `ops/nginx/einzel-site-lange-routen.conf.template` | wie oben, dazu ein Block mit längerer Frist (branding.supply) |
| `ops/nginx/pool-site.conf.template` | eine App für viele Communities, Wildcard (platform) |
| `ops/nginx/pool-kundendomain.conf.template` | eigene Domain einer Community (Ploi: Tenant der Pool-Site) |
| `ops/nginx/zugriffs-log.snippet` | Baustein: Zugriffs-Log ohne Query, 14 Tage (nur die Betreiber-Seite) |
| `ops/nginx-sites.conf` | welche Sites es geben soll: Art, Port, Zugriffs-Log an oder aus |
| `ops/cron.conf` | welche Zeitpläne auf welchem Server laufen sollen |

Die **Pflicht-Zeilen** stehen in jeder Vorlage unter einem Kommentar
`PFLICHT (…)`; ihre Begründung steht im Kopf von `ops/nginx-check.mjs`. Alles
andere in der Datei darf Ploi umschreiben (Zertifikat, Alias, Einrückung) —
der Vergleich bleibt dann grün.

**Keine Schutz-Kopfzeilen im Webserver.** `Strict-Transport-Security`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` und die
Regel zum Einbetten sendet die App selbst, für jede Antwort gleich
(`packages/core/server/plugins/security-headers.ts`). Ploi schreibt bei einer
neuen Site drei `add_header`-Zeilen in die Datei — **löschen**, sonst kommen
die Kopfzeilen doppelt, und der tägliche Blick meldet `zuviel`.

## Reihenfolge

1. **Im Repo eintragen** (ein Pull Request, vor dem ersten Handgriff auf dem
   Server): die App in `ops/apps.conf`, die Site mit Art und Port in
   `ops/nginx-sites.conf`, die Ecosystem-Datei `ops/ecosystem-<app>.config.cjs`.
   Der Test `packages/core/tests/serverConfigCheck.test.ts` hält Liste,
   App-Liste und Port zusammen.
2. **Site in Ploi anlegen** (Panel). Ploi erzeugt eine nginx-Datei nach seiner
   eigenen Schablone.
3. **Die Datei durch die Vorlage ersetzen** (Ploi → Site → Manage → NGINX
   configuration): Platzhalter `{{SITE}}`, `{{SERVER_NAMES}}`, `{{PORT}}`
   füllen; die drei `include`-Zeilen von Ploi bleiben. Speichern lässt Ploi
   `nginx -t` fahren; danach **Reload**, nie Restart.
4. **Zertifikat** über Ploi. Für einen Namen unter `*.pukalani.app` KEIN
   eigenes Zertifikat anfordern — die Fallen stehen in
   `.claude/rules/hosts-ops.md` (TLS-Fallen).
5. **Vergleichen**, bevor die Site Verkehr bekommt — auf dem Server:

   ```bash
   node /home/ploi/platform.pukalani.app/ops/nginx-check.mjs --namen
   ```

   Jede Site muss `ergebnis=passt` melden, `unbekannt anzahl=0`. Die neue
   Site kennt das Skript erst, wenn Schritt 1 ausgeliefert ist (die Liste
   liegt neben dem Skript).
6. **Von außen prüfen:** `curl -sI https://<name>/` zeigt jede Schutz-
   Kopfzeile genau einmal; `curl -s https://<name>/api/health` meldet den
   Build.
7. **Einstellungen ins Backup:** ist das Abholen der `.env`-Dateien
   eingerichtet (`APPWRITE-WIEDERHERSTELLUNG.md`, § 6.1), liegt die App-Liste
   dafür als eigene Kopie in `~/ops/apps.conf` auf dem App-Server — der Deploy
   aktualisiert sie nicht. Die neue `ops/apps.conf` dorthin kopieren, sobald
   die `.env` der neuen Site steht; `~/ops/app-env-bundle.sh list` muss die
   Site mit `vorhanden` nennen. Vorher kopiert, endet das nächtliche Backup
   rot im Schritt `app-einstellungen` (die Datenbank ist trotzdem gesichert).

## Kundendomain einer Community

Ploi → Pool-Site → Tenants → Name ergänzen, dann die erzeugte Datei durch
`pool-kundendomain.conf.template` ersetzen (je Name eine Datei, `www.` ist ein
eigener Name). Der tägliche Blick prüft jede dieser Dateien mit, ohne dass sie
in einer Liste stehen muss; er nennt sie im öffentlichen Protokoll nur mit
einer Nummer. Der ganze Weg einer Kundendomain:
[CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md](./CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md).

## Neuer oder entfernter Zeitplan

- **Neu:** erst in `ops/cron.conf` eintragen und ausliefern, dann auf dem
  Server anlegen (Ploi → Cronjobs schreibt nach `/etc/crontab`; ein Eintrag
  von Hand steht im crontab von `ploi`).
- **Entfernt:** erst auf dem Server entfernen, dann aus der Liste.
- In die Liste gehören **keine Werte**: Zuweisungen vor einem Befehl (Ordner,
  Ziel einer Sicherung) lässt das Muster aus.
- Ein Lauf, den die App selbst im Takt fährt, ist KEIN Zeitplan des Servers:
  er meldet sich über `defineTimedJob` an und steht in `ops/timed-jobs.conf`.

## Wenn der tägliche Blick rot wird

[PRODUKTIONS-ALARM.md](./PRODUKTIONS-ALARM.md), Abschnitt
„Server-Einstellungen".
