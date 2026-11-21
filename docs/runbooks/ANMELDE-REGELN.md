# Anmelde-Regeln in Appwrite (P29)

Appwrite bringt Regeln für Passwörter, Adressen und Sitzungen mit. Sie sind je
**Projekt** eingestellt und standen bisher nur in der Konsole. Seit P29
(2026-11-13) steht das Soll im Repo und wird per Skript geprüft und gesetzt.

## Was gilt

Die EINE Soll-Liste steht in `scripts/ops/appwrite-auth-policies.mjs`:

| Regel | Soll | Wirkung |
| --- | --- | --- |
| `password-dictionary` | an | Die 10.000 häufigsten Passwörter werden abgelehnt. |
| `password-personal-data` | an | Das Passwort darf Name, Adresse und Telefonnummer nicht enthalten. |
| `password-strength` | mindestens 8 Zeichen | Zeichenregeln setzt Appwrite nicht; die prüft unser Formular. |
| `password-history` | 5 | Die letzten fünf Passwörter sind gesperrt. |
| `password-pwned` | an, lehnt beim Setzen ab | Passwörter aus bekannten Datenlecks werden bei Registrierung, Änderung und Zurücksetzen abgelehnt. Die Anmeldung selbst bleibt offen. |
| `deny-disposable-email` | an | Wegwerf-Adressen können kein Konto anlegen. |
| `session-alert` | an | Mail an das Konto bei einer neuen Anmeldung mit Passwort. |

Bewusst **nicht** gesetzt: Alias-Adressen (`name+x@…`) und Gratis-Anbieter
bleiben erlaubt, Passkeys sind offen (eigene Entscheidung).

Gemessen am 2026-11-13 auf einer Wegwerf-Instanz (2.7.1): Die Regeln greifen
auch, wenn unser Server mit API-Schlüssel anlegt und ändert.

## Prüfen und setzen

```bash
node --env-file=<env-datei> scripts/ops/appwrite-auth-policies.mjs
```

Ohne Zusatz wird nur geprüft: je Regel „stimmt“ oder „weicht ab“, Exit 1 bei
einer Abweichung. Mit `--apply` setzt das Skript nur die abweichenden Regeln
und liest sie zurück.

- **Schlüssel:** braucht die Scopes `policies.read` und `policies.write`. Das
  Skript nimmt `APPWRITE_POLICIES_KEY`, sonst `NUXT_APPWRITE_MIGRATIONS_KEY`,
  sonst `NUXT_APPWRITE_KEY`. Ein 401 heißt: dem Schlüssel fehlt der Scope.
  Am 2026-11-13 hatte lokal kein Entwicklungs-Schlüssel diese Scopes.
- **Täglich auf Production (seit 2026-11-18):** der Produktions-Wächter ruft
  dasselbe Skript mit `--ci` für alle vier Projekte, nur lesend (Blick 15 in
  `production-watch.yml`). Er nimmt die vier Schlüssel des Schema-Blicks
  (`watch-schema-readonly`, je Projekt einer); sie tragen dafür zusätzlich
  das Leserecht `project.policies.read` — so heißt der Scope in der
  Verwaltung. Rot bei einer Abweichung und wenn der Blick nicht lesen kann.
  Einen Schlüssel, der die Regeln SETZEN darf, gibt es weiter nicht: gesetzt
  wird in der Verwaltung, danach meldet der Blick, ob es zum Soll passt.
- **Je Projekt einzeln:** `account`, `admin`, `branding`, `portfolio`. Auf
  Production nur mit Davids Ja.
- **CI:** `e2e.yml` setzt die Regeln nach dem Seed, die Suite läuft darunter.
- **Falle `@example.com`:** Appwrites Liste der Wegwerf-Adressen enthält
  `example.com`. Test-Konten nehmen deshalb `@example.test` (in der CI am
  2026-11-13 so erwischt). Mehrere Beweis-Skripte legen noch Konten mit
  `@example.com` an (`verify-mfa`, `verify-session-ip`, `verify-geo-cities`,
  `verify-turnstile`, die brand-Skripte `invite`/`revoke`); gegen ein Projekt
  mit eingeschalteter Regel scheitern sie, bis sie umgestellt sind.

## Stand auf Production

Seit dem 2026-11-15 sind die Regeln in allen vier Projekten (`account`,
`admin`, `branding`, `portfolio`) eingeschaltet. Gesetzt wurden sie in der
Konsole (Auth → Policies → Passwords, Emails, Sessions), weil es noch keinen
Schlüssel mit `policies`-Recht gibt; vorher und nachher gegen die Soll-Liste
gelesen. Wer dort etwas ändert, ändert zuerst das Soll im Skript.

- Der Abgleich mit Datenlecks lehnt seit dem 2026-11-18 wirklich ab: die
  Server-Variable ist gesetzt (Abschnitt „Abgleich mit Datenlecks").
- Die Anmelde-Mail ist auf Production noch nicht angesehen (Sprache, Adresse).
- Beweis-Skripte mit `@example.com`-Konten scheitern jetzt auch gegen
  Production-Projekte.

## Anmelde-Wege für Aufrufe ohne Schlüssel (SEC-007, seit 2026-11-16)

Appwrite bietet Kontoanlage und Anmeldung auch direkt an, an unserer
Registrierung vorbei. Je Projekt lässt sich das abschalten: Verwaltung → Auth →
Settings → **Auth methods**.

| Schalter | Soll | Warum |
| --- | --- | --- |
| Email/Password, Magic URL, Email OTP, Anonymous, Phone, Team Invites | **aus** | Kein Konto und keine Anmeldung an unseren Prüfungen vorbei. Unser Server ruft mit API-Schlüssel und ist davon nicht betroffen. |
| JWT | **aus** (seit 2026-11-18) | Der Schalter trifft nur EINEN Aufruf: `account.createJWT` ohne Schlüssel (in Appwrite 2.7.1 nachgelesen, `auth.type` = `jwt`). Den ruft unser Code nie — jedes Token entsteht über `users.createJWT` mit Schlüssel (`core/server/api/auth/realtime-token.get.ts`, `core/server/utils/controlService.ts`). Ein Token zu BENUTZEN (Live-Verbindung, Naht zum Control Plane) hängt nicht am Schalter. |
| Passkey | aus | wird nicht angeboten. |

**Stand:** alle vier Production-Projekte umgestellt am 2026-11-16
(`portfolio` als Probe, danach `branding`, `admin`, `account`; Davids
Entscheidung) und je Projekt von außen geprüft. Der Schalter „JWT" folgte am
2026-11-18 in allen vier Projekten. Geprüft in `admin` und `account` mit
einer angemeldeten Sitzung, vorher und nachher: das Token der Seite meldet
sich bei der Datenbank an (200), die Live-Verbindung erkennt das Konto, die
Naht zum Control Plane antwortet; ein neues Token direkt bei der Datenbank zu
holen, endet jetzt in `501 user_auth_method_unsupported` (vorher 403). Von
außen ohne Anmeldung ist dieser Schalter nicht prüfbar (ein Gast bekommt in
beiden Stellungen 401). Die lokale Datenbank und die
der CI haben die Schalter an. Seit dem 2026-11-17 prüft der tägliche Wächter
die vier Projekte von außen (`scripts/ops/verify-auth-methods.mjs`, Blick 14
in `production-watch.yml`): je Projekt derselbe Aufruf wie unten, rot bei
„offen". Was noch fehlt (Klick-Probe der Anmeldung per Code):
[OPEN-ITEMS](../OPEN-ITEMS.md), Punkt SV1.

**Prüfen von außen, ohne ein Konto anzulegen** (erfundene Zugangsdaten):

```bash
curl -s -X POST https://api.pukalani.app/v1/account/sessions/email -H 'Content-Type: application/json' -H 'X-Appwrite-Project: <projekt>' -d '{"email":"gibt-es-nicht@example.test","password":"00000000"}'
```

`501 user_auth_method_unsupported` heißt zu, `401 user_invalid_credentials`
heißt offen. Dasselbe für alle vier Projekte: `pnpm ops:auth-methods`. Von
den sechs Schaltern ist von außen nur „Email/Password" ohne Nebenwirkung
prüfbar — die anderen würden bei offenem Weg ein Konto anlegen oder eine Mail
schicken. Über unsere Seite muss dieselbe Anmeldung weiter „Invalid
credentials" antworten (dann erreicht der Server Appwrite mit Schlüssel).

**Vor dem Umstellen eines Projekts:** jeder Aufruf unseres Servers, den die
Schalter treffen, läuft über den Admin-Client. Das hält der Test
`packages/core/tests/authMethodCalls.test.ts`; der Anmelde-Code lief bis zum
2026-11-16 ohne Schlüssel und wäre ausgefallen.

**Was die Schalter nicht schließen:** die Anmeldung über Google. Dort spricht
der Browser Appwrite direkt an. Ein so entstandenes Konto hat keine
festgehaltene Zustimmung und wird beim ersten Besuch einmal gefragt
(`.claude/rules/appwrite.md`, „ZUSTIMMUNG").

**Zurück:** dieselben Schalter wieder einschalten; wirkt sofort.

## Abgleich mit Datenlecks

`password-pwned` lehnt nur ab, wenn der Appwrite-Server einen Dienst kennt:
`_APP_PWNED_PASSWORDS_DSN=hibp://localhost` in der `.env` der Appwrite-Instanz
(Standard ist `none://localhost`, dann gilt jedes Passwort als sauber).
Appwrite schickt nur die ersten fünf Zeichen des SHA-1-Hashes an
Have I Been Pwned. Ist der Dienst nicht erreichbar, scheitert das Setzen eines
Passworts mit 503 (`password_check_unavailable`), es wird nicht durchgewunken.

**Auf Production gesetzt am 2026-11-18** (Davids Ja): eine Zeile in der `.env`
im Compose-Ordner des Appwrite-Servers, danach nur den Dienst `appwrite` neu
angelegt (`docker compose up -d --no-deps appwrite`; die Compose-Datei reicht
die Variable nur an diesen Dienst). Gemessen: 3 Sekunden ohne Antwort, danach
alle acht Hosts `ok`. Die Fassung davor liegt als `.env.vorher-n11-…` daneben.
**Zurück:** die Zeile wieder auf `none://localhost` stellen (oder die Kopie
zurücklegen) und denselben Befehl noch einmal. **Nachsehen:**
`docker exec appwrite printenv _APP_PWNED_PASSWORDS_DSN`. Geprüft ist der
Stand am Server (Variable im Dienst, der Prüf-Dienst antwortet von dort);
NICHT geprüft ist eine echte Ablehnung auf einer Seite — dafür einmal ein
Passwort aus einem bekannten Leck bei einer Registrierung versuchen
([OPEN-ITEMS](../OPEN-ITEMS.md), Klick-Runde KR1).

## Was die App daraus macht

- `packages/core/shared/passwordPolicy.ts` übersetzt Appwrites Ablehnung in
  einen fachlichen Grund (`password_breached`, `password_personal_data`,
  `password_recently_used`, `email_not_allowed`); Registrierung,
  Passwort-Änderung und Zurücksetzen zeigen dafür je einen Satz.
- Die Wörterbuch-Ablehnung hat bei Appwrite keinen eigenen Fehlertyp
  (`general_argument_invalid`). Sie bekommt deshalb keinen eigenen Satz.

## Bekanntes Gerät

Die Konto-Pause (10 Fehlversuche in 15 Minuten, `.claude/rules/appwrite.md`)
zählt über alle Adressen. Damit ein Fremder den Besitzer nicht aussperrt, setzt
der Server nach einer vollständigen Anmeldung das Cookie `pk_known_device`
(`packages/core/server/utils/knownDevice.ts`, 180 Tage, signiert, ohne lesbare
Adresse). Ein Browser mit gültigem Merkzeichen zählt in einem eigenen Topf mit
demselben Deckel.

- Der Signatur-Schlüssel ist aus `NUXT_APPWRITE_KEY` abgeleitet. Nach einer
  Rotation dieses Schlüssels sind alle Merkzeichen ungültig; die Browser zählen
  dann wieder im gemeinsamen Topf, bis sie sich einmal angemeldet haben.
- Das Cookie ist technisch notwendig. Die Datenschutz-Vorlagen sprechen noch
  von einem einzigen Cookie (`packages/pages/shared/legalTemplates.ts`).

## Notfall

Zwei Knöpfe in der Appwrite-Konsole unter **Auth → Settings → Security
actions**, je Projekt:

- **Alle abmelden:** beendet jede Sitzung sofort, auch offene
  Realtime-Verbindungen. Anmelden geht direkt wieder.
- **Alle Passwörter zurücksetzen:** jedes bisherige Passwort wird abgelehnt,
  bis das Konto über „Passwort zurücksetzen“ ein neues setzt. Sitzungen
  bleiben bestehen, deshalb bei einem Vorfall beide Knöpfe drücken.

## Anmelde-Mails: Vorlagen je Projekt (Q06)

Bestätigung, Passwort, Anmelde-Code und Hinweis auf eine neue Anmeldung
verschickt Appwrite selbst. Ihre Texte stehen als Dateien in
`scripts/ops/appwrite-mail/templates/` (je Art und Sprache, Marke und
du/ihr setzt das Skript je Projekt ein). Eingespielt wird je Projekt:

```bash
node --env-file=<datei> scripts/ops/appwrite-mail-templates.mjs
```

Ohne Schalter ist das ein Trockenlauf (je Vorlage alt → neu). Schreiben nur mit
`--apply --backup <datei.json>`, gegen Production zusätzlich
`PUKALANI_TARGET_CONFIRM=<projekt>`; zurück mit `--restore <datei.json>`.
Appwrite nimmt eigene Vorlagen nur an, wenn das Projekt eine eigene
SMTP-Einstellung hat (Settings → SMTP). Lokal stellt
`--smtp-local host.docker.internal:1025` sie auf Mailpit (`--smtp-local off`
schaltet zurück). Schlüssel: `templates.read`, `templates.write`, dazu
`project.read` für die SMTP-Zeile und lokal `project.write`. Stand auf
Production: [Q06](../plans/offen/Q06.md).
