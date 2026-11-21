# Runbook: Appwrite-Projekt `control` → `admin` (AH-4c)

> **Nach dem Cutover:** die Schlüssel des Alt-Projekts liegen jetzt an mehreren
> Orten und zeigen ins Leere. Aufräumen nach
> [ZUGAENGE-AUFRAEUMEN.md](../runbooks/ZUGAENGE-AUFRAEUMEN.md) (`pnpm ops:stale-keys`).

**Was passiert hier:** das Appwrite-Projekt der Betreiber-Konsole zieht von
`control` nach `admin` um — neues Projekt (Ids sind unveränderlich, ein
„Umbenennen" gibt es nicht), alle Daten und Nutzer mit, danach Env-Schnitt.
Der Betreiber wird dabei genau einmal abgemeldet (Cookie wechselt von
`a_session_control` auf `a_session_admin`).

**Davids Entscheidung 2026-08-18** (DECISION-LOG; strukturierte Frage, gegen
die Empfehlung „nur Anzeige-Name" — der Gewinn ist Konsistenz der Namenswelt,
kein Kunde sieht die Projekt-Id). Vorlage: [ACCOUNT-CUTOVER.md](ACCOUNT-CUTOVER.md)
(AH-1, pool→account — dasselbe Muster, kleinerer Datenbestand).

> **Erledigt — das Werkzeug ist gelöscht (2026-11-15, Gesamtaudit OPS-005).**
> `scripts/ops/ah4c-project-transfer.mjs`, `scripts/ops/ah4c-lib/` und der Test
> `packages/control/tests/ah4cProjectTransfer.test.ts` liegen zuletzt in Commit
> `9788e7ab` (`git show 9788e7ab:scripts/ops/ah4c-project-transfer.mjs`). Die
> Schritte unten sind das Protokoll des Umzugs, nicht mehr ausführbar.

**Die eine Stelle, an der es Kunden treffen kann:** die platform-App löst
JEDEN Mandanten-Host über dieses Projekt auf (`NUXT_PLATFORM_CONTROL_*`,
Read-only-Key). Ein toter oder falscher Verweis dort hat beim
studio-Aufräumen schon einmal alle Tenant-Hosts mit 500 gelegt. Deshalb:
Wartungsfenster, Env-Schnitt als EIN Handgriff je Site, Serien-Proben.

Die Kästchen sind **echt** und werden pro Durchlauf abgehakt. Wo eine Zahl
steht, gehört sie eingetragen — ein Häkchen ohne Messwert ist eine Behauptung.

---

## Inventar (Momentwerte! — vor dem Fenster FRISCH messen)

Stand 2026-08-18: **41 Tabellen · ~248 Rows · 5 Buckets** (nur `runner-files`
trägt Dateien: 4; die übrigen vier sind leer) · **1 Nutzer (OTP-only, ohne
Passwort-Hash) · 0 Teams**. Die Row-Zahl ist ein MOMENTWERT: `run_events` ist
zwischen zwei Messungen am selben Tag von 35 auf 104 gewachsen — der
AI-Runner schreibt laufend. Deshalb zählt für Phase 3 nur die Messung NACH
dem Runner-Stopp; Werkzeug: `--phase inventory`.

---

## 0 · Vorbedingungen (VOR dem Fenster, ohne Wirkung nach außen)

- [x] **Transfer-Werkzeug bereit** (2026-08-18):
      `scripts/ops/ah4c-project-transfer.mjs` + pure Regeln in
      `scripts/ops/ah4c-lib/rules.mts` (nutzt `hashPlanFor` aus f3-lib).
      Selbsttest 30/30 · vitest 54/54
      (`packages/control/tests/ah4cProjectTransfer.test.ts`) · Inventar-Lauf
      read-only bewiesen (schreibt im Trockenlauf wirklich nichts).
      Phasen: inventory → users (inkl. Teams) → rows → files → verify;
      Delta-Semantik: vorhandene, abweichende Rows werden mit `--execute`
      aktualisiert.
- [x] **Quell-Key** (2026-08-18): Transfer-Key auf `control` angelegt und
      grün geprobt (tables/users/teams/files je 200), Ablage
      `~/.appwrite-secrets/ah4c-transfer-control.env`. Befund: der
      BESTEHENDE Key in `migrations/control.env` konnte ohnehin schon 10
      von 11 Lese-Scopes (F42-Muster „breiter Schlüssel") — nach AH-4c
      gehören BEIDE widerrufen bzw. verengt (Schritt 6).
      Schlüssel-Ablage-Falle aus diesem Lauf: beim `pbpaste`-Rezept muss das
      SECRET der LETZTE Kopiervorgang sein — wer den Befehl selbst kopiert,
      trägt den Befehlstext als Key ein (zweimal passiert; die Befehle
      prüfen seither das `standard_`-Präfix).
- [x] **Ziel-Keys** (2026-08-18): Migrations-Key des neuen Projekts um
      `users.read/write`, `teams.read/write`, `files.read/write` ergänzt
      (ohne sie stirbt Phase users/files beim ersten Schreibversuch) und
      grün geprobt; Ablage `~/.appwrite-secrets/migrations/admin.env`.
      Runtime-Key grün inkl. Presences- und `/health`-Probe; Ablage
      `~/.appwrite-secrets/admin-runtime.key` (kommt beim Env-Schnitt in
      die Site-`.env`).
- [x] Nutzer-/Team-/Datei-Zahlen: Users **1** · Teams **0** · Dateien nur
      `runner-files` (4), übrige Buckets leer (2026-08-18).
- [x] Hash-Verfahren geprüft: das eine Konto ist OTP-only, kein Hash —
      Übernahme als `users.create` ohne Passwort (Betreiber-Konto per H2
      bewusst passwortlos).
- [x] **AI-Runner pausiert** (12:37 UTC, `launchctl bootout`; ein laufender
      Auftrag wurde als Fehlschlag beendet — einkalkuliert). Erkenntnis: der
      Runner spricht NUR HTTP mit der Konsole und authentifiziert über seine
      `runners`-Zeile — die wandert mit, KEINE Config-Änderung nötig.
- [x] Env-Stände beider Sites als `.ah4c-backup` gesichert
      (`~/.appwrite-secrets/ah4c/backups/`); dabei NEBENBEFUND: die
      platform-Env trug eine korrupte Zeile (`NUXT_AI_KEY` ohne Zeilenumbruch
      an `NUXT_ANALYTICS_STATS_API_KEY` angehängt — Analytics-Statistik war
      seit dem A0-Fix tot) — beim Schnitt mitgeheilt.
- [x] Wartungsfenster: Davids „jetzt", 2026-08-18 ~12:35–12:50 UTC —
      tatsächliche Dauer ~15 min.
- [x] Stripe: Testmodus bestätigt (sk_test in der Site-Env,
      `stripe_settings` leer) — Webhook-Teil risikoarm; Testereignis nach dem
      Fenster steht bei David (Schritt 5).

## 1 · Projekt `admin` anlegen (Konsolen-Klicks: David — oder Wegwerf-Provisioner)

- [x] Projekt angelegt (David, 2026-08-18), Id exakt `admin`.
- [x] Web-Platform `admin.pukalani.app` eingetragen — Origin-Probe **401**
      (akzeptiert; F45-Falle damit ausgeschlossen).
- [x] Zwei API-Keys erzeugt und geprobt (Details in Schritt 0 „Ziel-Keys" —
      inkl. der nachgetragenen users/teams/files-Scopes am Migrations-Key).
- [x] TablesDB `main` per API angelegt (fehlte nach der Projekt-Anlage).

## 2 · Schema (✅ VOR dem Fenster erledigt, 2026-08-18 — das Ziel ist leer und unbenutzt)

- [x] Projekt-Grundlagen von David angelegt und per Probe bestätigt: Id
      `admin`, Web-Platform `admin.pukalani.app` (Origin-Probe 401 =
      akzeptiert), drei Keys grün (Transfer-Key liest alles; Runtime-Key
      besteht die Presences-Probe UND `/health` — Achtung: `/health/version`
      ist konsolen-intern und antwortet JEDEM Server-Key 401, nicht als
      fehlenden Scope deuten). TablesDB `main` per API angelegt.
- [x] Voller Migrations-Lauf über den zentralen Runner (Layer-Satz =
      control-Manifest ∩ LAYER_ORDER + system, explizit übergeben — bei
      `--env-file` OHNE `--app` greift der Manifest-Filter nicht und es
      migrierten ALLE Layer):
      `pnpm migrate --env-file ~/.appwrite-secrets/migrations/admin.env
      --layer system --layer billing --layer pages --layer tickets
      --layer runner --layer control --layer admin` — alle grün.
      **Diese Form gibt es seit 2026-11-16 nicht mehr (GA1 P21):** der Runner
      verlangt die App und gegen Production `--prod`, und er vergleicht das
      Projekt der Env-Datei mit dem Manifest der App. Heute hieße derselbe Lauf
      `pnpm migrate --app control --env ~/.appwrite-secrets/migrations/admin.env --prod`
      (erst mit `--dry-run` statt `--prod` ansehen).
- [x] Alle 41 Quell-Tabellen existieren im Ziel; alle 5 Buckets ebenfalls —
      die AH-1-Bucket-Lücke ist von den heutigen Migrationen selbst
      geschlossen (Werkzeug-Inventar Quelle↔Ziel).
- [x] **Ziel-SEEDS geprüft** (Migrationen seeden Rows — beim 1:1-Umzug sind
      das potenzielle Duplikate): `app_config`/`app_secrets` (je Id `global`)
      und `community_plans` (Plan-Key-Ids) sind deterministisch — die
      Delta-Semantik der rows-Phase ERSETZT sie durch die Quelle. Nur
      `ticket_lists` seedet mit Zufalls-Ids: die 6 Ziel-Seeds sind gelöscht
      (6×204, Ziel steht auf 0). Bei einem WIEDERHOLTEN Schema-Lauf diesen
      Punkt erneut prüfen.

## 3 · Daten und Nutzer (✅ 2026-08-18, ~12:38–12:43 UTC — Runner pausiert)

> Reihenfolge zählt: erst Nutzer, dann Rows — Row-Permissions verweisen auf
> User-Ids; eine Row mit `read(user:…)` ins Leere ist unsichtbar.

- [x] **Nutzer** übernommen: **1 von 1** (OTP-only, Id erhalten).
- [x] **Teams**: 0 vorhanden, 0 übernommen (Zweig lief mit).
- [x] **Rows**: **249 von 249** (frisch nach Runner-Stopp gemessen) —
      244 angelegt, 1 Seed aktualisiert, 4 Seeds byte-identisch.
- [x] **Dateien**: **4 von 4** (runner-files; übrige Buckets leer), per REST.
- [x] `--phase verify` grün: Zählstände 41/41 Tabellen deckungsgleich,
      10 Row-Stichproben deep-equal inkl. Permissions, 2 Datei-Stichproben
      per Byte-Länge.

## 4 · Env-Schnitt (✅ 2026-08-18 ~12:44 UTC — Muster Datei-runter→patchen→scp-hoch)

- [x] **admin-Site**: `NUXT_PUBLIC_APPWRITE_PROJECT_ID=admin` + neuer
      Runtime-Key; alles andere unverändert (Diff auf Schlüssel-NAMEN geprüft:
      exakt 2 Zeilen).
- [x] **platform-Site**: `NUXT_PLATFORM_CONTROL_PROJECT_ID=admin` +
      **INTERIM der admin-Runtime-Key** statt eines dedizierten
      rows.read-Keys — bewusst dasselbe Muster wie beim control-Cutover
      („gleiche Vertrauenszone, TODO read-only"); der dedizierte Key steht in
      Schritt 6. NEBENBEI GEHEILT: die korrupte
      `NUXT_ANALYTICS_STATS_API_KEY`-Zeile (angehängtes `NUXT_AI_KEY` ohne
      Zeilenumbruch — Analytics war seitdem tot).
- [x] Delta: **3 Rows** (2× `websites` — Intervall-Sweep der Alt-App, 1×
      `tickets` — SIGTERM-Fehlschlagbericht des Runners), GEZIELT per PATCH
      nachgezogen statt eines vollen rows-Laufs — der hätte inzwischen im
      Ziel gewachsene Werte (runners.lastSeenAt) rückwärts überschrieben.
      MERKE für künftige Läufe: nach dem Schnitt ist die rows-Phase nicht
      mehr idempotent-sicher, weil das Ziel lebt.
- [x] `pm2 startOrReload --update-env` beider Sites (admin 12:44:0x, platform
      direkt danach); Backups unter `~/.appwrite-secrets/ah4c/backups/`.
- [x] Gegenprobe `pnpm ops:site-env`: grün bis auf den VORBESTAND
      `NUXT_TICKETS_AI_KEY` fehlt auf control (war vor dem Schnitt schon so —
      Davids OpenRouter-Key, eigener Punkt). Der Wächter fing dabei korrekt
      die stale `migrations/control.env` → eingefroren als
      `control.env.ah4c-eingefroren`, Wächter-Mapping auf `admin.env`
      umgestellt.

## 5 · Verifikation (nichts davon ist optional, dreimal statt einmal)

- (ohne Haken) Betreiber-Login auf `admin.pukalani.app` (OTP) — neues Cookie
      `a_session_admin`, Dashboard vollständig (Communities-Liste = 8 Rows).
- [x] Mandanten-Auflösung über das NEUE Projekt: `demo.pukalani.app`,
      `comments.pukalani.app` UND `freelancer.supply` (Kundendomain) → je
      200; Health beider Sites 3× in Folge ok. (DIE Risiko-Stelle — grün.)
- (ohne Haken) Realtime in der Konsole lebt: Glocke/Live-Theme reagiert (sonst
      Web-Platform aus Schritt 1 prüfen, F45).
- [x] Presence-Probe gegen den neuen Runtime-Key: Liste, kein 401
      (AH-1-Stolperstein ausgeschlossen).
- (ohne Haken) Stripe-Testereignis an `https://admin.pukalani.app/api/stripe/webhook`
      → 200 (URL unverändert, aber der Handler liest jetzt aus `admin`).
- [x] AI-Runner neu gestartet (12:44:06, KEINE Config-Änderung nötig — er
      spricht HTTP mit der Konsole, seine `runners`-Zeile wanderte mit) —
      Heartbeat `lastSeenAt` landet im Projekt `admin` (12:44:07): der
      authentifizierte Schreibpfad Konsole→admin ist damit Ende-zu-Ende
      bewiesen.
- (ohne Haken) `packages/control/scripts/verify-onboarding.mjs` und
      `packages/onboarding/scripts/verify-control-exit.mjs`: ______ / ______
- (ohne Haken) Eine Community anlegen/ändern über den Wizard-Weg (Service-Naht
      platform→control schreibt jetzt in `admin`).

## 6 · Aufräumen (Schlüssel-Teil am 2026-08-18 vorgezogen — Davids Auftrag „Keys entfernen, Rechte anpassen")

- [x] **Projekt `control`: `migrations-prod` GELÖSCHT** (Konsolen-UI über
      Davids Chrome-Session; Probe 401). Befund dabei: einen separaten
      Transfer-Key gab es nie — Davids „Transfer-Key" war das Secret des
      bestehenden `migrations-prod`, den „Scopes ergänzt" per Select-all auf
      84 Scopes gehoben hatte. Eine Löschung erledigte damit Transfer-Widerruf
      UND den F42-Breitkey. Es bleiben GENAU die zwei Rückweg-Keys:
      `nuxt-ssr-prod` (Probe 200) und `platform read-only` (alt).
- [x] **Projekt `admin`: beide Keys von 84 Scopes verengt** (auch hier hatte
      „Select all" alles angehakt): Runtime auf die bewährte 10er-Liste
      (von controls `nuxt-ssr-prod` abgelesen, inkl. health.read) — Gegenprobe
      users/presences/health/rows je 200, `tables.list` 401; Migrations auf
      die 12er-Liste — Gegenprobe tables/buckets/rows 200, users/teams/files
      je 401 (die Transfer-Sonderscopes sind wieder weg).
- [x] **Dedizierter `platform read-only (tenants/site_members)`-Key im Projekt
      `admin` angelegt** (nur rows.read; Probe rows 200 / users 401) und in
      der platform-Env eingesetzt — das Interim „Runtime-Key als Naht-Key" ist
      beendet. Mandanten-Hosts nach dem Reload 3×200 (demo, comments,
      freelancer.supply).
- [x] **`app_secrets` geprüft — Rotation NICHT nötig:** die Tabelle trägt das
      signierte Entitlements-Dokument (system-020); der private
      Signierschlüssel (`NUXT_ENTITLEMENTS_PRIVATE_KEY`) lebt in der Site-Env
      und ist nie umgezogen. Es wanderte kein Geheimnis, nur ein signiertes
      Dokument.
- [x] Lokale Arbeitsdateien mit totem/überholtem Key entfernt; es bleiben:
      `migrations/admin.env`, `admin-runtime.key`,
      `ah4c/platform-readonly-admin.key.env`, `ah4c/backups/*` (Rückweg),
      `migrations/control.env.ah4c-eingefroren`.

### Rest nach der Beobachtungszeit (VORGEZOGEN auf 2026-08-19 — Davids Entscheidung, Beobachtung nach ~1 Tag störungsfreiem Betrieb beendet)

- [x] Beobachtungszeit: von David am 2026-08-19 bewusst verkürzt (Transfer
      tief verifiziert, ein Tag echte Last, Konsole/Runner/Mandanten-Hosts
      störungsfrei). Der LANGSAME Rückweg bleibt: das eingefrorene Projekt
      samt Daten existiert weiter — im Notfall neue Keys anlegen + Envs
      tauschen (~20 min statt 5).
- [x] Beide Rückweg-Keys GELÖSCHT (2026-08-19, Konsolen-UI; Gegenprobe je
      401). Noch am selben Tag hat David auch das PROJEKT gelöscht (sauber,
      kein Delete-500; 404-Gegenprobe, Konsole/Hosts unberührt) — der letzte
      Rückweg sind seither die Offsite-Dumps, wie bei `pool`.
- [x] Backups gelöscht: `~/.appwrite-secrets/ah4c/backups/` +
      `migrations/control.env.ah4c-eingefroren` + die tote
      `migrations/comments.env` (Projekt seit 2026-08-18 gelöscht);
      `pool.env` bleibt (AH-1-Rückweg). Auf den Servern lag kein Alt-Key
      mehr (Env-Schnitt hatte sie ersetzt).
- [x] `migrations/admin.env` ist die einzige Konsolen-Migrations-Env
      (Wächter-Mapping seit dem Schnitt umgestellt).
- [x] Doku nachgezogen (bereits am 2026-08-18): CLAUDE.md, DEPLOYMENT.md,
      hosts-und-ports, Memory — die Namenswelt sagt überall dasselbe; nur
      Ordner `apps/control`, Paketname und Release-Slot bleiben als
      Code-Anker (Davids geprüfte Ausnahme: `admin` ist als Layer-Name
      packages/admin vergeben).
- [x] Eintrag in `docs/OPEN-ITEMS-COMPLETE.md` mit **Gelernt:**-Zeile
      (2026-08-19) — AH-4c ist damit KOMPLETT geschlossen.

---

## Wenn es schiefgeht

Der Rückweg ist **die Env**: `NUXT_PUBLIC_APPWRITE_PROJECT_ID=control` +
alte Keys auf der admin-Site, `NUXT_PLATFORM_CONTROL_PROJECT_ID=control` +
alter Read-only-Key auf platform, Reload — das alte Projekt ist bis zum
Aufräumen unangetastet. **Was der Rückweg nicht heilt:** alles, was zwischen
Schnitt und Rücknahme in `admin` geschrieben wurde (Tickets, Runs,
Audit-Log, neue Communities). Die Entscheidung gehört in die erste Stunde.
