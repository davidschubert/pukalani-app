# Runbook: Appwrite-Schlüssel im Betreiber-Projekt `admin`

> **Namen (nachgezogen 2026-11-21):** Das Projekt der Betreiber-Konsole hieß bis
> zum 2026-08-18 `control` und heißt seitdem `admin`; das Alt-Projekt ist am
> 2026-08-19 gelöscht, das Server-Verzeichnis heißt `/home/ploi/admin.pukalani.app/`.
> Die Messung unten ist vom 2026-08-03 und nennt die Namen von damals — das
> ist Geschichte, kein Handgriff. Die Handgriffe (Abschnitte „Ein
> Migrations-Schlüssel“ und „Nachmessen“) nennen den heutigen Namen. Die
> lokalen Dateien unter `~/.appwrite-secrets/` behalten ihre Namen
> (`control.env`, `control-*.key`).

**Anlass (F42, 2026-08-03):** In der Console lag ein Schlüssel mit **84 Scopes**
namens „Claude Code" — praktisch Vollzugriff auf das Betreiber-Projekt. Die
Frage „wird der noch gebraucht?" war nicht zu beantworten, weil niemand sagen
konnte, welcher der herumliegenden Schlüssel welcher ist: die Console zeigt
Name und Scope-Zahl, eine `.env` zeigt nur einen Wert. Also gemessen.

## Was gemessen wurde (2026-08-03, Namen von damals)

Alle vier Schlüssel, die ein laufendes System benutzt — Werte haben dabei ihren
Ort nie verlassen, gemessen wurde nur, worauf sie antworten:

| Schlüssel | liegt in | darf | darf NICHT |
| --- | --- | --- | --- |
| Laufzeit `control` | `/home/ploi/control.pukalani.app/.env` (`NUXT_APPWRITE_KEY`; heute `/home/ploi/admin.pukalani.app/.env`) | `users` | databases · buckets · functions · teams · locale · health |
| Cross-Projekt-Leser | `/home/ploi/platform.pukalani.app/.env` (`NUXT_PLATFORM_CONTROL_KEY`) | **nur** `rows.read` (communities) | databases · users · buckets · functions · health |
| Migrationen `control` | `~/.appwrite-secrets/migrations/control.env` | `databases` · `buckets` | users · teams · functions · topics · locale |
| Migrationen (Kopie) | `~/.appwrite-secrets/control-migrations.key` | `databases` · `buckets` | dito |

**Ergebnis: keiner davon ist der 84-Scope-Schlüssel.** Jeder legitime Nutzer hat
einen Zweck-Schlüssel mit ein bis zwei Diensten. Dazu kommt: die GitHub-Actions
haben **gar keinen** Appwrite-Schlüssel (`gh secret list` — nur ploi-Webhooks
und der Deploy-SSH-Key; die E2E-CI baut sich eine Wegwerf-Instanz selbst), und
die einzige lokale Datei mit Prod-`control`-Zugang außerhalb von
`~/.appwrite-secrets` war `apps/control/.env.production` — die ist am
2026-08-02 gelöscht worden (sie zeigte auf das abgeschaltete Projekt `studio`).

**Damit hat „Claude Code" keinen Verbraucher.** Der Zeitpunkt passt: zuletzt
benutzt rund um den Control-Cutover (2026-07-26/27), als Migrationen und
Provisionierung von Hand liefen.

## Empfehlung: löschen, nicht eindampfen

Eindampfen hieße, einen Schlüssel zu behalten, dessen Zweck niemand benennen
kann — und der nächste Blick in die Console stellt dieselbe Frage noch einmal.
Wird doch etwas gebraucht, ist der Ersatz zwei Minuten Arbeit (unten), und
dann trägt er einen Namen, der seinen Zweck sagt.

**Console → Projekt `control` (damals; heute `admin`) → Overview → API Keys → „Claude Code" → Delete.**

> ✅ **Am 2026-08-03 erledigt** (David, händisch). Nachgeprüft: alle fünf Hosts
> antworten `ok`, der demo-Mandant lädt (das ist der Cross-Projekt-Leser bei der
> Arbeit), ein unbekannter Host antwortet weiterhin 404, und beide
> `control`-Schlüssel messen unverändert 2 bzw. 1 von 10 Lese-Scopes.

Wenn nach so einer Löschung etwas klemmt, sagt der Fehler, welcher Dienst fehlt
— dann den passenden Zweck-Schlüssel neu anlegen statt den großen
wiederherzustellen.

## Ein Migrations-Schlüssel für das Projekt `admin`, falls neu

Name: `control-migrations`. Scopes — nur diese, hergeleitet aus dem, was die
Migrationen dieser Instanz wirklich tun:

- **Databases** read + write — `createTable`, `updateTable`, `deleteTable`
- **Tables/Collections**, **Columns/Attributes**, **Indexes** read + write —
  jede Migration legt Spalten an und pollt sie auf `available`
- **Rows/Documents** read + write — Seeds und Backfills (`createRow`,
  `updateRow`)
- **Buckets** + **Files** read + write — die Layer `system` und `tickets` legen
  auf dieser Instanz Buckets an bzw. ziehen Datei-Rechte nach

**Nicht** ankreuzen: Users, Teams, Functions, Messaging, Sites, Health, Locale,
Avatars, Migrations. Der Laufzeit-Schlüssel deckt Users ab, alles andere
benutzt hier niemand.

## Nachmessen

```bash
node scripts/ops/probe-key-scopes.mjs ~/.appwrite-secrets/migrations/control.env
node scripts/ops/probe-key-scopes.mjs --key-file ~/.appwrite-secrets/control-runtime.key \
  --endpoint https://api.pukalani.app/v1 --project admin
```

Das Skript stellt nur GET-Anfragen und gibt den Schlüssel nie aus. `401` heißt
„Scope fehlt", alles andere heißt „Scope da" — auch `400` und `404`, denn beide
setzen voraus, dass die Autorisierung schon durch war. Es misst deshalb nur die
LESE-Hälfte je Dienst: für „eng oder allmächtig?" reicht das, für ein Audit auf
Feld-Ebene nicht.

## Stand der Zweck-Schlüssel (2026-11-18)

Gilt für alle vier Projekte (`account`, `admin`, `portfolio`, `branding`):

| Schlüssel | Wozu | Rechte |
| --- | --- | --- |
| Migrationen (je Projekt einer; Ablage `~/.appwrite-secrets/migrations/<projekt>.env`) | Migrations-Runner, Zähl- und Aufräum-Skripte von Hand | Datenbank lesen und schreiben, Buckets lesen und schreiben, Dateilisten LESEN (`files.read`, in drei Projekten ergänzt am 2026-11-18 — Dateien schreiben oder löschen darf er weiter nicht) |
| `watch-schema-readonly` (je Projekt einer; nur als Secret in der GitHub-Umgebung `production-watch`) | täglicher Wächter: Schema-Blick und Anmelde-Regeln | `tables.read`, `columns.read`, `project.policies.read` (das dritte seit dem 2026-11-18). Kein Ablaufdatum — entschieden am 2026-11-18: die Schlüssel lesen keine Inhalte, ein jährlicher Tausch brächte mehr Fehlalarm als Schutz |

In jeder der vier Env-Dateien steht der Migrations-Schlüssel unter
`NUXT_APPWRITE_MIGRATIONS_KEY` UND unter `NUXT_APPWRITE_KEY` (derselbe Wert):
der erste Name ist der, den die Migrationen erwarten (sonst warnt jede
„Fallback"), der zweite bleibt für ältere Skripte, die nur ihn lesen.

Nachmessen, ob ein Schlüssel Dateilisten lesen darf: ein GET auf
`/storage/buckets/<bucket>/files` mit dem Schlüssel — 200 heißt ja, 401 nein
(`probe-key-scopes.mjs` misst diesen Scope nicht).

## Regel

Ein Schlüssel gehört zu **einer** Aufgabe und trägt deren Namen. Wer beim
Anlegen „alles ankreuzen" wählt, spart fünf Minuten und hinterlässt eine Frage,
die Monate später niemand mehr beantworten kann — genau das war F42.
