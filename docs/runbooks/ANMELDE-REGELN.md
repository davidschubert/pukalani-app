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
- **Je Projekt einzeln:** `account`, `admin`, `branding`, `portfolio`. Auf
  Production nur mit Davids Ja.
- **CI:** `e2e.yml` setzt die Regeln nach dem Seed, die Suite läuft darunter.

## Abgleich mit Datenlecks

`password-pwned` lehnt nur ab, wenn der Appwrite-Server einen Dienst kennt:
`_APP_PWNED_PASSWORDS_DSN=hibp://localhost` in der `.env` der Appwrite-Instanz
(Standard ist `none://localhost`, dann gilt jedes Passwort als sauber).
Appwrite schickt nur die ersten fünf Zeichen des SHA-1-Hashes an
Have I Been Pwned. Ist der Dienst nicht erreichbar, scheitert das Setzen eines
Passworts mit 503 (`password_check_unavailable`), es wird nicht durchgewunken.

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
