# Runbook: Prod-Appwrite lokal spiegeln

**Anlass (2026-11-09):** Die lokale OrbStack-Appwrite war veraltet. Für BI2 K7
wurde sie geleert und hatte danach nur noch `branding`; die Keys in den übrigen
`apps/*/.env` waren ungültig. Davids Wunsch: „production zu local komplett
spiegeln". Werkzeug: `scripts/ops/appwrite-mirror-prod-to-local.mjs`.

## Davids Entscheidungen (2026-11-09)

| Frage | Entscheidung |
| --- | --- |
| Weg | **MariaDB-Dump über ssh** + lokal derselbe `_APP_OPENSSL_KEY_V1` (nicht Appwrites Migrations-API) |
| Projekte | **alle vier**: `account`, `admin`, `portfolio`, `branding` |
| Nutzer | **1:1 mit Passwort-Hashes** (jeder meldet sich lokal mit seinem Prod-Passwort an) |
| Dateien | **ja, alle Buckets** (Volumes uploads, functions, builds, sites) |

Warum Dump statt Migrations-API: der Dump ist 1:1 (IDs, Rechte, Teams, Labels,
Projekt-Einstellungen, MFA) in EINER Transaktion und braucht auf Prod nur
Lesezugriff. Die Migrations-API hätte einen neuen Key auf Prod gebraucht
(= Schreibzugriff), läuft Ressource für Ressource und lässt Projekt-
Einstellungen weg.

## Freigabe

**Jeder Lauf liest Prod (ssh `ploi@188.245.61.155`) und braucht Davids Ja.**
Prod wird nie beschrieben. Das Skript schickt nur SELECT, `mariadb-dump`,
`printenv` und ein read-only gemountetes `tar` dorthin; `prodSql()` lehnt
schreibende SQL-Befehle ab.

## Ablauf

```bash
source ~/.nvm/nvm.sh && nvm use 22
node scripts/ops/appwrite-mirror-prod-to-local.mjs --phase all --yes
```

Dauer etwa zwei Minuten (Stand 2026-11-09: DB 538 MB roh, Dump 20 MB gz,
Dateien 8,5 MB). Die Phasen lassen sich einzeln wiederholen
(`--phase fetch|restore|post|verify`, auch mit Komma); `--run <ordner>` nimmt
einen älteren Abzug.

- [ ] Davids Ja zum lesenden Prod-Zugriff
- [ ] Keine Dev-Server gegen die lokale Appwrite offen
      (`lsof -nP -iTCP -sTCP:LISTEN | grep node`) und keine andere Sitzung
      mitten in einem lokalen Beweis (der Lauf ersetzt ALLES lokal)
- [ ] Lauf mit `--phase all --yes`
- [ ] `verify` endet mit „0 ungeklärt" und sechs ✓-Zeilen
- [ ] Haupt-Checkout-`.env` in den Worktree kopieren, falls dort gearbeitet wird

### Was jede Phase tut

1. **fetch** (Prod lesen): prüft gleiche Appwrite-Version (sonst Abbruch),
   zählt jede Daten-Tabelle, macht `mariadb-dump --single-transaction` der
   Schema `appwrite` und tar der vier Volumes. Ablage:
   `~/Developer/orbstack/appwrite-maria/backups/prod-mirror/<zeitstempel>/`
   (Ordner 700, Dateien 600). **Nur die letzten zwei Abzüge bleiben**: sie
   enthalten echte Nutzerdaten.
2. **restore** (lokal überschreiben, nur mit `--yes`): sichert lokale DB und
   `.env` in `<lauf>/local-before/`, stoppt alles außer mariadb/redis/
   clickhouse/traefik, ersetzt Schema und Volumes, setzt
   `_APP_OPENSSL_KEY_V1` auf den Prod-Wert (frisch per ssh gelesen, nie
   ausgegeben, steht danach nur in der lokalen Appwrite-`.env`), leert
   Redis und startet mit `docker compose up -d` (ein `restart` würde die
   alte Env behalten).
3. **post** (lokale Zugänge): legt den Spiegel-Bot an, macht für jeden Prod-
   Key einen lokalen Zwilling, legt die Platform `localhost` an, leert die
   versiegelten Geheimnisse und schreibt `apps/*/.env` im Haupt-Checkout.
4. **verify**: zählt lokal mit derselben Abfrage wie auf Prod und erklärt jede
   Abweichung. Danach holt es pro App mit deren neuem Key die Nutzerzahl über
   die API und vergleicht sie mit Prod.

## Was lokal BEWUSST anders ist als Prod

| Was | Warum |
| --- | --- |
| **Sessions leer** (alle Projekte + Console) | „1:1 mit Hashes" heißt Anmelden mit eigenem Passwort, nicht übernommene Prod-Anmeldungen |
| **Domain-Regel + Zertifikat `api.pukalani.app` gelöscht** | sonst versucht der lokale Wartungs-Task eine Let's-Encrypt-Erneuerung für die Prod-Domain |
| **Keys: lokale Zwillinge `local:<name>`, Prod-Keys gelöscht** | Die `.env` auf dem Mac halten nie einen Wert, der auch auf Prod gilt. Die Scopes sind identisch |
| **Web-Platform `localhost`** in jedem Projekt | ohne sie verweigert Appwrite den Browser-Aufrufen (Realtime, CORS) den Ursprung |
| **`instance_secrets` + `stripe_settings` geleert** | Sie sind mit dem PROD-Umschlag (`NUXT_INSTANCE_SECRETS_KEY` / `NUXT_BILLING_SETTINGS_KEY`) versiegelt, den der Mac bewusst nicht bekommt. Live-Stripe- und KI-Keys bleiben so zu; leer fällt der Code auf die lokale Env zurück, statt bei jedem Lesen „undecryptable" zu protokollieren |
| **Spiegel-Bot** in der Organisation | s. u. |

Mailversand bleibt lokal: Appwrite schickt an Mailpit (`_APP_SMTP_HOST=
host.docker.internal:1025`), die Apps an `NUXT_SMTP_HOST=localhost`. Kein
Prod-Projekt hat eigenes SMTP, Webhooks, Functions, Schedules oder Messaging-
Provider (Stand 2026-11-09 gemessen). Kommt so etwas auf Prod dazu, muss
`restore` es lokal abschalten: es liefe sonst mit Prod-Zielen los.

## Console-Zugang

- **David**: sein **Prod-Console-Login** gilt lokal 1:1 (gleiche Hashes,
  gleiches MFA-Geheimnis).
- **Spiegel-Bot**: Appwrite ≥ 2.2 erlaubt self-hosted nur EINE Organisation,
  ein neues Console-Konto kommt also an nichts heran. `post` legt deshalb ein
  Konto an und setzt es per SQL als Owner in die Organisation (Zeile in
  `_console_memberships` + sechs `_perms`-Zeilen, `secret` von der Owner-
  Mitgliedschaft übernommen, danach Redis leeren). Zugang:
  `~/.appwrite-secrets/local-console.env`. Der Bot wird bei jedem Lauf neu
  angelegt.

## Welche App an welchem Projekt

| App | Projekt | zusätzlich |
| --- | --- | --- |
| platform | `account` | `NUXT_PLATFORM_CONTROL_*` → `admin` mit dem Lese-Key |
| comments | `account` | |
| control | `admin` | `NUXT_PUBLIC_CONTROL_POOL_PROJECT=account` |
| portfolio, marketing | `portfolio` | |
| branding | `branding` | |
| photos, help | – | kein Prod-Projekt; `photos/.env` bleibt ungültig |

Geschrieben werden nur Endpoint, Projekt, Datenbank und die Keys. Alles andere
in der `.env` bleibt stehen (Stripe-Test, Turnstile-Test, SMTP → Mailpit). Die
vorherigen Dateien liegen in `<lauf>/apps-env-before/`.

## Mandanten-Hosts lokal

Die Communities tragen ihre Prod-Hosts (`demo.pukalani.app`, …). Lokal ruft man
sie über den Host-Header auf:
`curl -H "Host: demo.pukalani.app" http://localhost:3006/`.

## Zurück zum Stand vor dem Lauf

```bash
cd ~/Developer/orbstack/appwrite-maria/appwrite
RUN=~/Developer/orbstack/appwrite-maria/backups/prod-mirror/<zeitstempel>
cp "$RUN/local-before/appwrite.env" .env
docker compose stop appwrite appwrite-realtime appwrite-worker appwrite-task-scheduler appwrite-task-maintenance appwrite-task-interval
docker exec -i appwrite-mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD"' <<< 'DROP DATABASE appwrite; CREATE DATABASE appwrite DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;'
gunzip -c "$RUN/local-before/appwrite.sql.gz" | docker exec -i appwrite-mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" appwrite'
docker exec appwrite-redis redis-cli FLUSHALL && docker compose up -d
```

Volumes und App-`.env` haben keine Sicherung vor dem ersten Lauf. Die App-`.env`
liegen in `$RUN/apps-env-before/`.

## Fallen

- **Gleiche Appwrite-Version ist Pflicht.** `fetch` bricht sonst ab: ein
  Dump trägt das Schema seiner Version.
- **`mariadb -N` ohne `-r` verdoppelt Backslashes.** JSON-Spalten wie
  `_permissions` (`team:…\/owner`) kämen beim Zurückschreiben verfälscht an.
  Beide SQL-Helfer laufen deshalb mit `-r`.
- **Console-Aufrufe ohne `X-Appwrite-Mode: admin`.** 2.7.1 antwortet sonst
  400 „Admin mode is not allowed for console project".
- **Die Apps-`.env` liegen im HAUPT-Checkout.** Ein Worktree braucht Kopien
  (danach dort wieder löschen); branding/comments brauchen dort zusätzlich
  den shiki-Symlink (Memory „worktree-branding-shiki-falle").
- **K7 und andere Stände, die nur lokal existierten, sind nach dem Lauf weg.**
  Gesichert sind sie in `<lauf>/local-before/`. Was nur lokal gebaut wird,
  braucht danach `pnpm migrate --app <app>` gegen die lokale Instanz.

## Durchläufe

- **2026-11-09, 22:30 UTC** (erster Lauf): 454 Daten-Tabellen, 439
  zählgleich, 15 Abweichungen, alle erklärt; sechs Apps mit HTTP 200 und
  derselben Nutzerzahl wie Prod (account 34, admin/portfolio/branding je 1).
  Verschlüsselte Buckets (avatars, gdpr-exports) liefern lokal byte-genau.
  Sechs Dev-Server mit `ok: true` und ohne Server-Fehler im Log.
  `demo.pukalani.app` zeigt lokal (Host-Header gegen platform) denselben
  Seitentext wie Prod.
- **2026-11-09, 22:50 UTC** (zweiter Lauf, Wiederholbarkeit): 1:15 min,
  dasselbe Ergebnis (0 ungeklärt, 6/6 ✓). Er bringt K7s `commentsEnabled`
  mit, das auf Prod um 22:38 UTC eingeschaltet wurde. Ein neuer Prod-Stand
  braucht also nur einen neuen Lauf.
