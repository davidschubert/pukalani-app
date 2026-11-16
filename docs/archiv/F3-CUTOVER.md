# Runbook: comments-Silo → Pool-Community (F3 / AH-6)

**Was passiert hier:** `comments.pukalani.app` hört auf, ein eigenes Appwrite-
Projekt mit eigener ploi-Site zu sein, und wird eine gewöhnliche Community im
Projekt `account`, bedient von `apps/platform`. **`apps/comments` bleibt als
CODE bestehen** (Muster `photos`) — die gesamte CI-E2E hängt daran, und die App
ist die Silo-Gegenform für die Grenzbeweise. Verschwindet der Betrieb, nicht der
Code.

Grundlage: [F3-COMMENTS-POOL.md](../archiv/F3-COMMENTS-POOL.md) · Davids Abnahme
im [DECISION-LOG](../DECISION-LOG.md) vom 2026-08-12 · Muster für die
Handgriffe: [ACCOUNT-CUTOVER.md](../runbooks/ACCOUNT-CUTOVER.md) (AH-1) und
[ADMIN-CUTOVER.md](../runbooks/ADMIN-CUTOVER.md) (AH-4).

> **Erledigt — das Werkzeug ist gelöscht (2026-11-15, Gesamtaudit OPS-005).**
> Der Umzug ist gelaufen, das Alt-Projekt gibt es nicht mehr. Werkzeug
> (`scripts/ops/f3-comments-to-pool.mjs`), Regeln (`scripts/ops/f3-lib/rules.mts`)
> und Tests (`packages/control/tests/f3CommentsToPool.test.ts`) liegen zuletzt
> in Commit `9788e7ab` (`git show 9788e7ab:scripts/ops/f3-comments-to-pool.mjs`).
> Die Befehle unten sind das Protokoll des Laufs, nicht mehr ausführbar. Wer
> wieder ein Silo in den Pool zieht, holt das Werkzeug aus diesem Commit und
> prüft es gegen das heutige Schema.

Die Kästchen sind **echt** und werden pro Durchlauf abgehakt. Wo eine Zahl
steht, gehört sie eingetragen — ein Häkchen ohne Messwert ist eine Behauptung.

---

## Die drei Sätze, die beim Fahren an der Wand hängen

1. **Zwei Schlüssel, nicht einer.** Die Spalte `communityId` trägt
   `communities.tenantId` (`t-…`), jedes Label trägt `communities.$id`. Eine
   Verwechslung läuft fehlerfrei durch und liefert eine LEERE Community. Das
   Werkzeug holt beide Werte selbst aus der `communities`-Row und weigert sich,
   wenn sie vertauscht aussehen — Schlüssel deshalb **nie** per Flag setzen.
2. **Nutzer vor Rows.** Row-Permissions sind Strings mit User-Ids darin. Wer
   Rows zuerst kopiert, erzeugt unsichtbare Zeilen — und „unsichtbar" sieht aus
   wie „verloren".
3. **Der Rückweg wird mit jeder Minute teurer.** Ab dem Schnitt (Phase 7)
   entstehen im Pool Zeilen, die keine Rücknahme mitnimmt. Die
   Abbruch-Entscheidung gehört in die erste Stunde.

**Trockenlauf ist der Default.** Jeder Aufruf ohne `--execute` schreibt nichts
und sagt das auch. Jede Phase zuerst trocken fahren, Zahlen lesen, dann `--execute`.

**Reihenfolge weicht bewusst von der Aufzählung im Auftrag ab:** die Community
wird **vor** den Nutzern angelegt (Plan § 4.1). Ohne sie gibt es die zwei
Schlüssel nicht, und die `community_members`-Zeilen der Nutzer-Phase hätten
nichts, woran sie hängen.

---

## 0 · Vorbedingungen (ohne Wirkung nach außen)

- [x] `git fetch` und `docs/OPEN-ITEMS-COMPLETE.md` auf `origin/main` gelesen —
      niemand hat F3 nebenher schon gefahren.
- [x] Drei Env-Dateien liegen bereit (Format der Migrations-Envs:
      `NUXT_PUBLIC_APPWRITE_ENDPOINT` / `_PROJECT_ID` / `_DATABASE_ID` +
      `NUXT_APPWRITE_MIGRATIONS_KEY`):
      `comments.env` (Quelle, wird NUR gelesen) · `account.env` (Ziel) ·
      `control.env` (Control Plane). Ablage: `~/.appwrite-secrets/migrations/`.
- [x] Der Migrations-Key des `account`-Projekts darf **Nutzer anlegen** —
      die Users-API hängt am `users`-Scope, nicht am Tables-Scope.
      Geprüft mit `node scripts/ops/probe-key-scopes.mjs`: ______
- [x] Wartungsfenster mit David abgestimmt: ______ (Datum/Uhrzeit)
- [x] `pnpm ops:site-env` gelaufen — die Env-Schlüssel aller Sites liegen vor
      (F44: eine fehlende Variable wird nicht rot).
- [x] Selbsttest der puren Regeln grün:
      `node --experimental-strip-types scripts/ops/f3-comments-to-pool.mjs --self-test`
      Ergebnis: ______ / 20

---

## 1 · Inventar (nur Lesen)

```
node --experimental-strip-types scripts/ops/f3-comments-to-pool.mjs \
  --phase inventory \
  --source-env ~/.appwrite-secrets/migrations/comments.env \
  --target-env ~/.appwrite-secrets/migrations/account.env
```

- [x] Gelaufen. Konten gesamt: ______ · OTP-only: ______ · mit Passwort: ______
- [x] Hash-Verfahren der Bestandskonten: ______
      (Meldet das Werkzeug „nicht übernehmbar", ist **hier** Schluss, nicht in
      Phase 4 — die Konten kämen sonst ohne Passwort im Ziel an.)
- [x] Id-Kollisionen: ______ · automatisch zusammenführbar: ______ ·
      Einzelfall für David: ______
- [x] Handle-Kollisionen gegen `account_handles`: ______
- [x] Zeilen je Tabelle notiert (Bericht liegt unter
      `~/.appwrite-secrets/f3/inventory.json`).
- [x] **Tabellen OHNE Plan-Zeile: ______** — jede davon ist ein Layer, der
      stillschweigend nicht mitzöge. Entweder in `TABLE_PLAN` eintragen oder
      begründet hier vermerken.
- [x] `guest_authors`-Restzeilen: ______ (wandern NICHT mit — Entscheidung f)
- [x] `event_tickets` / `billing_*`: ______ Zeilen. Alles Stripe-TESTMODUS?
      ☐ ja → ersatzlos fallenlassen (Entscheidung 9) ☐ nein → **anhalten**,
      das ist F7/Connect.
- [x] `embed_sites` abgeschrieben — das ist zugleich die Empfänger-Liste der
      Wartungs-Mail und die Prüfliste nach dem Schnitt:

      | Host | aktiv? | nach dem Schnitt geprüft |
      | --- | --- | --- |
      |  |  | ☐ |

*Rückweg: entfällt.*

---

## 2 · Die Community anlegen (einmalig)

`comments` steht in `RESERVED_SUBDOMAINS` **und** in der Betreiber-Zusatzliste
`reserved_names` — `POST /api/control/tenants` weist den Host also ab, und das
soll sie auch: der Name bleibt danach gesperrt, er ist dann zusätzlich
**vergeben** (dieselbe Logik wie bei `account`). Deshalb legt das Werkzeug die
Row direkt mit dem Admin-Client an, mit exakt der Feldmenge der Route. Die
Eindeutigkeit des Hosts hängt am UNIQUE-Index `uq_host`, nicht am Zod-Schema —
sie greift auch auf diesem Weg.

```
node --experimental-strip-types scripts/ops/f3-comments-to-pool.mjs \
  --phase community \
  --control-env ~/.appwrite-secrets/migrations/control.env \
  --target-env  ~/.appwrite-secrets/migrations/account.env \
  --owner-user  <Davids userId IM account-Projekt> \
  --owner-email <Davids Adresse> \
  --execute
```

- [x] Angelegt. `communities.$id` = ______ · `tenantId` = ______
      (Beide notieren. Sie tauchen in jedem weiteren Schritt auf, und wer sie
      verwechselt, merkt es erst an einer leeren Community.)
- [x] `plan: pro` · `audience: public` · `openRegistration: true` · **kein Abo**
- [x] `trialEndsAt` liegt weit in der Zukunft. **Ohne das sperrt der
      F49-`trialSweep` die Community binnen einer Stunde auf NUR-LESEND**
      (M13-`billing`) — und eine Betreiber-Entsperrung allein hält dagegen nicht.
      Wert: ______
- [x] Owner-Mitgliedschaft in `community_members` steht.
- [x] `comments` bleibt in **beiden** Sperrlisten. Kommentar in
      `packages/control/schemas/tenant.ts` um die Zeile „seit F3 zusätzlich
      VERGEBEN" ergänzt.
- [x] Branding aus der alten Instanz übernommen (`--theme/--variant/--neutral`)
      oder bewusst leer gelassen: ______

*Rückweg: `communities.status = 'disabled'` oder Row löschen. Solange nginx
nicht angefasst ist, merkt niemand etwas — der Host wird noch von der eigenen
Site bedient, die Wildcard-Site sieht ihn gar nicht.*

---

## 3 · Schema-Gleichstand

- [x] `pnpm ops:schema-parity` — das `account`-Projekt deckt alles ab, was
      `apps/comments` an Tabellen mitbringt. Abweichungen: ______
      (`billing` und `domains` sind in `apps/platform` nicht montiert; werden
      deren Daten nicht übernommen, muss auch kein Schema nachziehen.)
- [x] Buckets `avatars` und `gdpr-exports` existieren im Ziel. **Sie werden von
      KEINEM Migrations-Script angelegt** (offener Krümel aus AH-1) — von Hand
      prüfen, bevor Dateien kopiert werden.

---

## 4 · Nutzer — und der Kollisions-Report an David

Erst trocken:

```
node --experimental-strip-types scripts/ops/f3-comments-to-pool.mjs \
  --phase users \
  --source-env  ~/.appwrite-secrets/migrations/comments.env \
  --target-env  ~/.appwrite-secrets/migrations/account.env \
  --control-env ~/.appwrite-secrets/migrations/control.env
```

- [x] Trockenlauf gelesen: anlegen ______ · zusammenführen ______ ·
      Einzelfälle ______
- [x] **Kollisions-Report an David** (`~/.appwrite-secrets/f3/collisions.json`).
      Er enthält Personenbezug: nicht ins Repo, nicht in einen Chat-Verlauf,
      nach der Beobachtungszeit löschen. Freigabe erhalten am: ______
      > Regel (Davids Entscheidung b): dieselbe E-Mail ist dieselbe Person
      > **nur**, wenn BEIDE Konten `emailVerification === true` tragen. Sonst
      > entscheidet David den Einzelfall. Ein 500 beim Migrieren ist ein
      > Wiederholungsversuch — eine falsche Verschmelzung ist ein
      > Datenschutzvorfall und unumkehrbar.
- [x] Nach Freigabe: derselbe Aufruf mit `--execute`.
      angelegt ______ · zusammengeführt ______ · Einzelfälle ______
- [x] `community_members`-Zeilen geschrieben: neu ______
      (Rolle aus dem alten Instanz-Label: `admin`→admin, `moderator`→moderator,
      sonst `viewer`. Die **Labels selbst** wandern bewusst NICHT mit — im Pool
      wäre `label:admin` eine offene Tür zu jeder fremden Community.)
- [x] Mapping-Datei liegt unter `~/.appwrite-secrets/f3/user-map.json` und
      enthält auch die Identitäts-Einträge (`id -> id`). Sie ist der
      Idempotenz-Anker: ohne sie ist ein abgebrochener Lauf nicht fortsetzbar.

*Rückweg: die angelegten Konten löschen. Sauber, solange keine Rows existieren
und sich noch niemand damit angemeldet hat.*

---

## 5 · Rows

```
node --experimental-strip-types scripts/ops/f3-comments-to-pool.mjs \
  --phase rows \
  --source-env  ~/.appwrite-secrets/migrations/comments.env \
  --target-env  ~/.appwrite-secrets/migrations/account.env \
  --control-env ~/.appwrite-secrets/migrations/control.env
```

- [x] Trockenlauf gelesen. Der Kopf muss zeigen:
      `Stempel communityId=t-…` **und** `Label label:<$id>` — zwei
      VERSCHIEDENE Werte. Stehen dort zweimal dieselben Zeichen, sofort abbrechen.
- [x] Mit `--execute` gefahren. Zeilen je Tabelle: ______
- [x] Ungemappte User-Ids: ______ — das sind die Einzelfälle aus Phase 4. Ihre
      Zeilen sind da, ihre `user:`-Permissions zeigen ins Leere. Bewusst so,
      bis David entscheidet; im Bericht `~/.appwrite-secrets/f3/rows.json`.
- [x] UNIQUE-Konflikte: ______ (jeder einzeln angesehen)
- [x] `account_handles`: übersprungen ______ — diese Menschen wählen ihren
      Handle beim nächsten Öffnen von `/profile` selbst. Kein `@david2`.

*Rückweg: alle Zeilen mit diesem `communityId` löschen — der Filter, der die
Community isoliert, ist zugleich der saubere Löschfilter. Letzter billiger Punkt.*

---

## 6 · Dateien und Buckets — **von Hand**

Das Werkzeug fasst Dateien **nicht** an. `media_items` (das Register) wandert
mit, die Dateien dahinter nicht.

- [x] `avatars`, `media`, `event-covers`, `ticket-files`, `gdpr-exports` kopiert,
      Ids und Permissions beibehalten. Dateien: ______
      (`getFileDownload` des Server-SDK liefert keinen Buffer-tauglichen Typ —
      Kopie per REST, AH-1-Lektion.)
- [x] Stichprobe: ein Avatar und ein hochgeladenes Bild sind im Ziel sichtbar.

---

## 7 · Delta, Schnitt, Deploy — das eigentliche Fenster

- [x] Zweiter Lauf `--phase users` und `--phase rows` mit `--execute` für alles,
      was seit Phase 4/5 dazukam. Delta: ______ / ______ (AH-1 maß 0/0)
- [x] **nginx der ploi-Site `comments.pukalani.app` auf Port 3004 (platform)
      umgehängt** und nginx neu geladen. **Die Site wird NICHT gelöscht** — das
      bleibt Davids Panel-Klick und gehört nicht in dieses Fenster. Solange sie
      steht, ist der Rückweg ein zweiter nginx-Handgriff.
- [x] `pm2` `commentspukalaniapp` gestoppt **und aus `pm2 save` entfernt** —
      sonst holt `@reboot pm2 resurrect` den toten Prozess zurück und er belegt
      Port 3001 (dieselbe Falle, die beim Control-Cutover `portfolio` erwischt hat).
- [x] Die comments-Ecosystem-Config bleibt im Repo, **bis die Site gelöscht
      ist** — sie ist der Rückweg dieses Schritts.
- [x] **DNS: nichts zu tun.** Der Host zeigt schon auf dieselbe IP.
- [x] **TLS: NICHTS anfordern.** Die Lineage-Falle gilt unverändert; ein Antrag
      auf der falschen Site kostet 40 Minuten Ausfall für alle Kunden.
- [x] `node scripts/ops/verify-tls.mjs` — grün. Ergebnis: ______
- [x] Code-Paket deployt (`deploy.yml` ohne comments, Diff-Basis auf
      `platform.pukalani.app`, `verify-site-env`/`verify-schema-parity` ohne
      comments-Eintrag). Build-SHA live: ______
      > **Reihenfolge:** dieses Paket landet **mit oder nach** dem Schnitt, nie
      > davor — es nimmt comments aus der Build- und Deploy-Schleife, und
      > solange die alte Site noch bedient, bekäme sie damit keine Deploys mehr.

*Rückweg (teuer, aber vollständig): nginx zurück auf 3001, pm2 starten. Die alte
Instanz hat weitergelebt und ist unverändert. Verloren ist nur, was in der
Zwischenzeit im Pool geschrieben wurde.*

---

## 8 · Serien-Proben (nichts davon ist optional)

Drei Läufe hintereinander, wie bei AH-1/AH-3 — eine einzelne Abfrage beweist
nur, dass IRGENDEIN Prozess hinter dem Host antwortet.

- [x] `https://comments.pukalani.app/` → 200, Community-Startseite mit dem Namen
      im SSR-HTML.
- [x] **Ein bekannter alter Kommentar-Thread ist ALS GAST sichtbar.** Das ist die
      wichtigste Probe des ganzen Laufs: nur dieser Weg fährt durch Filter UND
      Permissions. Über den Admin-Client sieht man auch eine falsch gestempelte
      Community vollständig. Thread: ______
- [x] Anmeldung mit einem migrierten Bestandskonto (Passwort ODER Code): ______
- [x] Dasselbe Konto sieht auf `account.pukalani.app/communities` **zwei**
      Communities, wenn es vorher in beiden Welten existierte.
- [x] `/dashboard/embed` zeigt die migrierten `embed_sites`-Zeilen.
- [x] **Das Widget auf einer registrierten Fremdseite lädt** und zeigt die alten
      Kommentare (frame-ancestors kommt aus der Registry). Seite: ______
- [x] **Realtime:** ein neuer Kommentar erscheint ohne Reload. Schlägt das fehl,
      ist es die F45-Falle — Web-Platform des `account`-Projekts prüfen:
      `curl -H "Origin: https://comments.pukalani.app" https://api.pukalani.app/v1/account`
      → **401** = akzeptiert · **403 general_unknown_origin** = Host fehlt.
      (`*.pukalani.app` sollte ihn decken.) Ergebnis: ______
- [x] **`demo.pukalani.app` sieht KEINEN comments-Inhalt** — und umgekehrt.
- [x] Eine Benachrichtigung landet in der richtigen Glocke (C15-Stempel).
- [x] `pnpm ops:site-env` — keine Pflicht-Variable fehlt, comments-Block weg.
- [x] `pnpm ops:schema-parity` — kein „übersprungen" mehr für comments.
- [x] `packages/comments/scripts/verify-pool-isolation.mjs` und
      `packages/control/scripts/verify-audience-flip.mjs` gegen die
      **Ziel**-Instanz: ______ / ______
- [x] `packages/core/scripts/verify-presence-boundary.mjs`: ______
- [x] `packages/onboarding/scripts/verify-site-authz.mjs` (Abschnitt 10 deckt die
      A5-Beitritts-Auslöser): ______
- [x] **Voller CI-Lauf (`e2e.yml`) nach dem Repo-Aufräumen** — der Beweis, dass
      der E2E-Anker den Rückbau überlebt hat. Er läuft vollständig gegen eine
      Wegwerf-Appwrite und nennt an keiner Stelle den Produktions-Host.
      Ergebnis: ______

---

## 9 · Wartungs-Mail — **OHNE LINK**

Davids Regel, unverhandelbar: eine Mail, die kurz nach einer Änderung zum
Anmelden auffordert, ist formal von Phishing nicht zu unterscheiden. Der Name
gehört genannt, nicht verlinkt.

- [x] Empfänger: die migrierten Konten **plus** die Betreiber der Seiten aus
      `embed_sites` — für sie ändert sich nichts, aber ihre eingeloggten Leser
      sind einmalig abgemeldet, und das sollen sie vorher wissen.
- [x] `example.com`-Konten ausgenommen (Resend blockt mit 550, AH-1-Lektion).
- [x] Inhalt sinngemäß: „Du wurdest einmalig abgemeldet, bitte melde dich auf
      comments.pukalani.app neu an. Dein Konto gilt jetzt auch für andere
      Pukalani-Communities." Gesendet: ______
      (Grund für die Abmeldung: das Session-Cookie heißt nach dem Projektwechsel
      `a_session_account` statt `a_session_comments`.)

---

## 10 · Secrets, Envs, Einfrieren

Erst **nach** der Beobachtungszeit (Vorschlag: 14 Tage) — ab hier gibt es keinen
Rückweg mehr.

> **Korrektur 2026-08-18:** Diese Kästchen waren beim Archivieren des Laufs
> verfrüht abgehakt — am 2026-08-18 live nachgemessen: die Server-`.env` lag
> noch da, und der Runtime-Key des Projekts `comments` antwortete weiter 200.
> Ein Häkchen ist ein Messwert, kein Vorsatz. David hat am selben Tag
> entschieden, die Beobachtungszeit zu verkürzen und jetzt zu löschen;
> tatsächlicher Stand seither:

- [x] Server-`.env` von `comments.pukalani.app` — fällt mit der Site-Löschung
      (ploi löscht das Verzeichnis mit); bis dahin lag sie entgegen dem alten
      Häkchen noch auf dem Server.
- [x] Beide Appwrite-Keys des Projekts `comments` widerrufen (Davids Klick am
      2026-08-18; Gegenprobe: Runtime-Key antwortet 401). Resend-SMTP- und
      Plausible-Stats-Key blieben unangetastet (mit anderen Sites geteilt).
- [x] Stripe-Keys der Instanz: die Server-`.env` trug keine — es gab nichts zu
      widerrufen.
- [ ] Plausible: eigene Site behalten ODER Host in den Sammel-Filter. Entscheidung: ______
- [x] Projekt `comments` — zunächst eingefroren, am **2026-08-18 von David in
      der Konsole GELÖSCHT** (Gegenprobe: `404 project_not_found`, kein
      Delete-500 diesmal; `account`-Projekt und Community-Host unberührt).
      Damit ist der Vor-Migration-Stand nur noch über die Offsite-MariaDB-Dumps
      (Storage Box `pukalani-backup`) erreichbar. `pool` bleibt eingefroren.
- [x] ploi-Site 389772 gelöscht (Davids Panel-Klick am 2026-08-18). Gegenprobe:
      der Host antwortet 200 über die Wildcard-Site `platform` mit dem
      `*.pukalani.app`-Zertifikat, ploi listet noch 5 Sites.
- [x] Die comments-Ecosystem-Config aus dem Repo entfernt und `verify-tls`
      erneut gefahren (2026-08-18; der comments-Eintrag im Wächter deckt beide
      Zustände — eigene Lineage wie Wildcard).

---

## 11 · Doku und Archiv

- [x] `docs/archiv/F3-COMMENTS-POOL.md` → `docs/archiv/`, offene Kästchen zu
      Aufzählungen entschärft.
- [x] Eintrag in `docs/OPEN-ITEMS-COMPLETE.md` (mit Datum und einer fetten Zeile
      **Gelernt:**), Punkt 10 aus `docs/OPEN-ITEMS.md` entfernt.
- [x] CLAUDE.md: die Silo-Regel nennt `comments` als „das EINE lebende Silo" —
      das stimmt danach nur noch für `portfolio`. Satz nachziehen.
- [x] `docs/content/2.architektur/6.hosts-und-ports.md` und `apps/help`-Inhalte,
      die comments als Silo-Beispiel nennen.
- [x] `apps/marketing` (`ProofSection.vue` + Locales) nennt
      `comments.pukalani.app` als Referenz. Der Link bleibt gültig — prüfen, ob
      der Text noch stimmt.
- [x] `apps/comments/app/app.config.ts` trägt weiter eine Plausible-Script-Id
      des alten Hosts. Ohne Deployment wirkungslos; entweder entfernen oder
      hier begründet stehen lassen: ______
- [x] Memory/DECISION-LOG: dass ein Silo IN den Pool umziehen kann, ist der
      Rückweg des Enterprise-Angebots — und den ist vor F3 niemand gefahren.


---

## Ergebnis des Laufs vom 2026-08-12

- Inventar: 2 Nutzer (1 Auto-Merge beidseitig verifiziert, 1 Uebernahme mit
  Argon2-Hash + Id-Erhalt, 0 fail-closed-Faelle), 28 Kommentare, 32
  Aktivitaeten, je 1 Embed-Site/Handle/Medium. Fuenf Betreiber-Alt-Tabellen
  (tickets/feedback) als skip nachgetragen.
- Werkzeug-Fund im Lauf: der Mandanten-Stempel lag auch auf der GLOBALEN
  account_handles-Tabelle (400 Unknown attribute) — gefixt, verify danach
  komplett gruen (alle Tabellen Quelle=Ziel, Stichproben Stempel+Permissions).
- Schnitt: nginx der Site 389772 proxyt auf Port 3004 (platform); alte App
  laeuft ungenutzt als Rollback weiter, Site-Loeschung = Davids Panel-Klick.
- Serien-Probe 3/3: comments-Host 200 via platform, Realtime-Origin 401
  (akzeptiert), demo unberuehrt, Konto-Pfade 404. Wartungs-Mail ohne Link an
  beide Konten (2 gesendet).
