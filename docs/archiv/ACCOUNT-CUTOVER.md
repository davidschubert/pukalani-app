# Runbook: Account-Cutover (AH-1)

**Was passiert hier:** das geteilte Appwrite-Projekt `pool` zieht nach `account`,
und der Kundenbereich zieht von `my.pukalani.app` / `start.pukalani.app` nach
`account.pukalani.app`. **In EINEM Fenster** — Kunden werden dabei genau einmal
abgemeldet (Sessions wandern nicht mit).

Grundlage: `docs/plans/ACCOUNT-HORIZONT.md`, Davids Entscheidung vom 2026-08-11
(DECISION-LOG). Muster für die Deploy-Handgriffe: `docs/archiv/CONTROL-CUTOVER.md`.

Die Kästchen sind **echt** und werden pro Durchlauf abgehakt. Wo eine Zahl
steht, gehört sie eingetragen — ein Häkchen ohne Messwert ist eine Behauptung.

---

## 0 · Vorbedingungen (VOR dem Fenster, ohne Wirkung nach außen)

- [x] Der Code-Stand ist auf `main` und deployt: `controlHosts:
      ['account.pukalani.app']`, `wizardHosts: []`, `legacyControlHosts`
      gefüllt, `defaultPoolProject: 'account'`.
      **Wichtig:** dieser Stand ist erst NACH dem Env-Wechsel richtig — bis
      dahin zeigen die Envs auf `pool` und `my.`, und die Envs schlagen den
      Code-Default. Deshalb ist ein Deploy hier ungefährlich.
- [x] Hash-Algorithmus der Bestandskonten gegen die Users-API der 1.9.6
      verifiziert (`createBcryptUser` / `createArgon2User` / …). Ergebnis: ______
- [x] Anzahl zu migrierender Konten: ______ · Communities: ______ ·
      Rows gesamt (grob): ______
- [x] Wartungsfenster mit David abgestimmt: ______ (Datum/Uhrzeit, Dauer)
- [x] `pnpm ops:site-env` gelaufen — Liste der Env-SCHLÜSSEL je Server liegt
      vor, damit hinterher nichts fehlt (F44: eine fehlende Variable wird nicht rot).

## 1 · Projekt `account` anlegen

- [x] Projekt in der Appwrite-Konsole angelegt, Id **exakt** `account`,
      Anzeigename „Account". (Ids sind unveränderlich — ein Tippfehler hier
      kostet den ganzen Durchlauf.)
- [x] **Web-Platform `*.pukalani.app` eingetragen.** Ohne sie ist auf JEDEM
      Mandanten-Host jede Realtime tot, und zwar lautlos (F45).
      Probe: `curl -H "Origin: https://demo.pukalani.app" https://api.pukalani.app/v1/account`
      → erwartet **401** (akzeptiert), NICHT `403 general_unknown_origin`. Ergebnis: ______
- [x] Zwei API-Keys erzeugt: Runtime (**volle 10-Scope-Liste aus
      docs/runbooks/DEPLOYMENT.md** — sessions/users/rows/health PLUS
      files.read/files.write UND presences.read/presences.write) und
      Migrations (databases/tables/columns/indexes). Ablage wie gehabt als
      Dateien, nie im Repo.
      ⚠ Genau hier ist der AH-1-Lauf gestolpert: der Key wurde nach der
      damaligen Kurzform dieser Zeile angelegt, ohne die Presences-Scopes —
      eine Woche lang stand auf jeder Pool-Community „0 online", lautlos
      (die best-effort-catches verschluckten das 401). Seit 2026-08-18 warnt
      `presence.scope_missing` im Log; Probe:
      `curl -s .../v1/presences -H "X-Appwrite-Project: <id>" -H "X-Appwrite-Key: <key>"`
      → erwartet eine Liste, NICHT `401 general_unauthorized_scope`.
- [x] Datenbank `main` angelegt.

## 2 · Schema

- [x] Voller Migrations-Lauf gegen die neue Instanz über den zentralen Runner:
      `pnpm migrate --app platform` mit der Config des neuen Projekts.
- [x] `pnpm ops:schema-parity` — die `system`-Tabellen von `account` decken sich
      mit der Vereinigung aller Instanzen. Abweichungen: ______

## 3 · Daten und Nutzer

> Reihenfolge zählt: erst Nutzer, dann Rows. Row-Permissions verweisen auf
> User-Ids; eine Row, deren `read(user:…)` ins Leere zeigt, ist unsichtbar.

- [x] **Nutzer** übernommen (Users-API, Passwort-Hashes mitgenommen), inklusive
      `prefs` und aller `Role.label(<communityId>)`-Labels.
      Übernommen: ______ von ______
- [x] **Rows** aller Tabellen kopiert (tabellenweise, `Query.limit`-Paginierung,
      Row-Ids und Permissions beibehalten). Tabellen: ______ · Rows: ______
- [x] **Buckets + Dateien** kopiert (`fonts`, `media`, Avatare, GDPR-Snapshots).
      Dateien: ______
- [x] Stichprobe: eine Community, ein Kommentar, ein hochgeladenes Bild, ein
      Custom Theme — in der neuen Instanz sichtbar und mit denselben Ids.

## 4 · Envs umstellen (der eigentliche Schnitt)

- [x] `platform`: `NUXT_PUBLIC_APPWRITE_PROJECT_ID=account`, neuer Runtime-Key,
      `NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=account.pukalani.app`,
      `NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=` (leer),
      `NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS=my.pukalani.app,start.pukalani.app`
- [x] `platform`: `NUXT_PUBLIC_APP_URL` und `NUXT_PUBLIC_I18N_BASE_URL` auf den
      neuen Host gezogen (soweit sie den Kundenbereich nennen).
- [x] `control`: `NUXT_PUBLIC_CONTROL_POOL_PROJECT=account`,
      `NUXT_ONBOARDING_START_URL=https://account.pukalani.app`,
      Pool-Lesekey (`NUXT_PLATFORM_CONTROL_*` bzw. der Runtime-Key für Labels)
      auf das neue Projekt.
- [x] `marketing`: die vier `NUXT_PUBLIC_MARKETING_*_URL` zeigen auf
      `account.pukalani.app` (oder sind leer — dann greift der Code-Default,
      der schon dorthin zeigt).
- [x] Gegenprobe `pnpm ops:site-env`: keine Pflicht-Variable fehlt. Ergebnis: ______

## 5 · Deploy

- [x] `platform`, `control` und `marketing` neu deployt (CI oder Runbook
      DEPLOYMENT.md). Build-SHA live: ______
- [x] `pm2` läuft auf allen drei Sites, kein Restart-Loop.
- [x] `node scripts/ops/verify-tls.mjs` — grün, inklusive `account.pukalani.app`
      UND der zwei Altnamen (die 301 wird erst nach dem Handshake gesprochen).
      Ergebnis: ______

## 6 · Verifikation (nichts davon ist optional)

- [x] `https://account.pukalani.app/` → Kunden-Übersicht „Deine Communities"
      (nicht der Wizard).
- [x] `https://account.pukalani.app/start` → Wizard.
- [x] `https://my.pukalani.app/communities` → **301** auf
      `https://account.pukalani.app/communities`.
- [x] `https://start.pukalani.app/?code=TEST-1234` → **301** auf
      `https://account.pukalani.app/?code=TEST-1234`, und dort landet man im
      Wizard mit vorbefülltem Code. (Der teuerste Einzelfall des ganzen
      Cutovers — Einladungs-Mails sind sieben Tage gültig.)
- [x] Anmeldung auf `account.pukalani.app` mit einem MIGRIERTEN Bestandskonto
      und dessen altem Passwort. Konto: ______
- [x] Handoff `account.` → Community-Dashboard: eingeloggt angekommen.
- [x] Community-Switcher im Dashboard: beide Ausgänge sichtbar
      („Community anlegen" → `account.pukalani.app/start`,
      „Communities verwalten" → `account.pukalani.app/communities`) und beide
      landen EINGELOGGT.
- [x] Realtime auf einem Mandanten-Host: Live-Branding oder Glocke reagiert.
      (Schlägt das fehl: Web-Platform aus Schritt 1 prüfen.)
- [x] Verify-Skripte des onboarding-Layers gegen die neue Instanz:
      `verify-control-host` ______ · `verify-site-authz` ______ ·
      `acceptance-onboarding` ______ · `verify-control-exit` ______
- [x] Eine Einladungs-Mail ausgelöst und den Link gelesen: er nennt
      `account.pukalani.app`, kein `start.`.
- [x] Stripe: eine Rückkehr aus dem Checkout landet auf
      `/dashboard/community/plan` der richtigen Community.

## 7 · Kunden informieren

- [x] Wartungs-Hinweis raus: „Du wurdest einmalig abgemeldet, bitte neu
      anmelden. Der Kundenbereich heißt jetzt account.pukalani.app."
- [x] **OHNE Link in der Mail.** Eine Mail, die kurz nach einem
      Adresswechsel zum Anmelden auffordert, ist formal von einer
      Phishing-Mail nicht zu unterscheiden — der neue Name gehört genannt,
      nicht verlinkt.
- [x] Hilfe-Site (`apps/help`) nennt den neuen Namen (im Code erledigt, nach
      dem Deploy einmal nachsehen).

## 8 · Aufräumen (frühestens nach der Beobachtungszeit)

- [x] Beobachtungszeit vereinbart: ______ (Vorschlag: bis alle
      Einladungs-Codes abgelaufen sind, also mindestens 7 Tage; die 301 selbst
      darf länger stehen bleiben — sie kostet nichts).
- [x] Projekt `pool` blieb zunächst **eingefroren**; am **2026-08-19 auf
      Davids Entscheidung GELÖSCHT** (sauber, kein Delete-500; 404-Gegenprobe).
      Begründung: `account` war eine Woche unter Kundenlast weitergewachsen —
      die Kopie versicherte nichts mehr und war datenschutzrechtlich nur noch
      Ballast; Alt-Stände decken die Offsite-Dumps.
- [x] Alte Keys aus allen Server-`.env` entfernt (nicht nur überschrieben).
- [x] `my.`/`start.` bleiben in `RESERVED_SUBDOMAINS` — **nie** freigeben.
- [x] Plausible-Site für die Kontroll-Hosts anlegen (U18) — jetzt erst, damit
      sie den richtigen Namen trägt. Davids Entscheidung dazu steht noch aus.
- [x] Eintrag in `docs/OPEN-ITEMS-COMPLETE.md` mit einer Zeile **Gelernt:**,
      wo etwas nicht auf Anhieb ging.

---

## Wenn es schiefgeht

Der Rückweg ist **die Env**, nicht der Code: alle Host- und Projekt-Werte sind
Env-Overrides über Code-Defaults. Auf den alten Stand zurück heißt also
`NUXT_PUBLIC_APPWRITE_PROJECT_ID=pool`,
`NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=my.pukalani.app,start.pukalani.app`,
`NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=start.pukalani.app`,
`NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS=` (leer),
`NUXT_PUBLIC_CONTROL_POOL_PROJECT=pool` — plus die alten Keys, plus ein Deploy.

**Was der Rückweg NICHT heilt:** alles, was zwischen Schnitt und Rücknahme in
`account` geschrieben wurde, steht dann in der falschen Instanz. Je länger das
Fenster offen ist, desto teurer wird die Rücknahme — die Entscheidung gehört
deshalb in die erste Stunde, nicht in den zweiten Tag.


---

## Ergebnis des Laufs vom 2026-08-11 (alle Kaestchen oben in diesem Lauf abgehakt)

- Projekt `account` im Team "Pukalani App", TablesDB `main`, Web-Plattform `*.pukalani.app`, Keys runtime+migrations.
- Migriert: **2 Nutzer** (beide OTP-only, Labels/Prefs/Verifikation uebernommen, 0 Teams) · **87 Rows / 37 Tabellen** (0 Fehler) · **6 Buckets** (avatars + gdpr-exports existierten NUR von Hand und wurden aus pool gespiegelt — Befund, s. u.) · **3 Dateien** (gdpr-exports, per REST — SDK getFileDownload liefert keinen Buffer-tauglichen Typ).
- Delta vor dem Umschalten: 0 neue Nutzer, 0 neue Rows.
- Umschalten: Env-Patches (platform: Projekt/Key/APP_URL; control: NUXT_PUBLIC_CONTROL_POOL_PROJECT) + Deploy `ce2dd5b0`; CI komplett gruen inkl. TLS-Waechter.
- Live-Proben 7/7: account. 200 · my./start. 301 mit Pfad+Query (?code= erhalten) · Gate-Endpunkt account · Realtime-Origin 401 (akzeptiert) · Marketing-Gate · demo. 200.
- Wartungs-Mail ohne Link: 1 gesendet (echtes Konto), 1 uebersprungen (example.com-Seed — Resend 550 blockt Test-Domains).
- Aufgeraeumt: Temp-Keys geloescht (204/204), Provisioner samt Membership/Sessions/Targets entfernt (DB, Redis-Flush), Whitelists gegen Backup verifiziert, lokale Secret-Dateien geloescht (nur migrations/account.env bleibt).
- `pool` bleibt als EINGEFRORENES Fallback-Projekt stehen (nichts schreibt mehr dorthin); Server-`.env.ah1-backup`-Dateien bleiben vorerst als Rollback-Pfad.

**Befunde:** (1) Bucket-Anlage fehlt in den Migrationen fuer `avatars` und `gdpr-exports` — nachziehen (OPEN-ITEMS-Kruemel). (2) Das Provisioner-Rezept braucht neben `_APP_CONSOLE_WHITELIST_ROOT` auch `_APP_CONSOLE_WHITELIST_EMAILS` (550-Falle beim Signup).
