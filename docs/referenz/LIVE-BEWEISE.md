# Live-Beweise (`verify-*.mjs`) — was es gibt und was davon in CI läuft

Diese Datei ist eine ÜBERSICHT, keine Arbeitsliste — Offenes gehört nach
`docs/OPEN-ITEMS.md`. Sie hat zwei Teile: die **Einordnung** (was ein Beweis
braucht, die Bühne, wie man von Hand startet) ist von Hand geschrieben und
nennt bewusst KEINE Zahlen und keine Auswahl von Skripten mehr — beides
veraltete (die Gruppen-Tabellen vom 2026-08-02 standen bis zum 2026-11-17
hier); die **vollständige Liste** am Ende samt der Zahl je Lauf wird aus
`scripts/buehne/beweise.mjs` und den Köpfen der Skripte ERZEUGT
(`pnpm live-beweise`), und `pnpm check:live-beweise` wird im Lint-Lauf rot,
wenn sie nicht zum Repo passt.

Ein Live-Beweis ist ein Skript, das eine Zusage gegen die ECHTE Instanz prüft:
Schema, Row-Permissions, Autorisierung. Unit-Tests können das grundsätzlich
nicht — ein gemockter Row-Store hat kein Schema und nimmt jeden Feldnamen an.
Genau daran ist der Geldpfad wochenlang unbemerkt gestorben
(`verify-paid-ticket`, Befund 2026-08-02).

Der Wert eines Beweises hängt daran, dass er LÄUFT. Bis zum 2026-08-02 lief in
CI genau einer; alles andere prüfte, wer zufällig daran dachte. Das war F30.

## Was ein Beweis braucht — vier Läufe

Was ein Beweis braucht, entscheidet, wo er laufen kann. Jedes Skript steht in
genau einem Lauf (`lauf` in `scripts/buehne/beweise.mjs`); welches wo steht,
zeigt die erzeugte Liste am Ende in der Spalte „Läuft", die Zahl je Lauf ihre
erste Zeile.

| Lauf | Braucht | Wo es läuft |
| --- | --- | --- |
| **E2E** (`e2e`) | nur die migrierte Wegwerf-Appwrite | `.github/workflows/e2e.yml`, je Skript ein EIGENER Schritt mit sprechendem Namen — ein roter Lauf zeigt am Schritt, welche Zusage gebrochen ist |
| **Bühne, jeder Lauf** (`buehne`) | Betreiber-App und Platform-Server, zwei Probe-Communities mit Konten je Rolle, Mailpit | `.github/workflows/buehne.yml` bei jedem Pull Request und auf `main`; zusammen wenige Minuten |
| **Bühne, nachts** (`nacht`) | dasselbe; dazu Skripte ab rund 45 s oder mit Wartezeiten, und — nur nachts gestartet — die Einzel-Instanz `apps/comments` als dritter Server (`env: 'einzel'`) und branding.supply (`apps/branding`) als vierter (`env: 'branding'`, mit gestellten Antworten statt echter KI) | `buehne.yml` im nächtlichen Lauf (`lauf=nacht`) |
| **von Hand** (`hand`) | etwas, das die Bühne nicht stellt: echte KI, eine fremde Website, eigens eingestellte Server, ein zweiter Server, den die Bühne nicht hat — jedes mit GRUND in der Liste | nur, wenn jemand es startet |

Zwei Dinge, die man beim Lesen von `e2e.yml` wissen muss:

- **`verify-presence-boundary` läuft dort nur zur Hälfte.** „Akt 2" (der Weg
  durch Middleware + Heartbeat) braucht einen Platform-Dev-Server und wird
  sauber übersprungen. Der Schritt setzt `PLATFORM_PORT` deshalb auf einen
  toten Port: das Überspringen ist eine ENTSCHEIDUNG und hängt nicht davon ab,
  dass zufällig nichts auf 3006 lauscht.
- **`verify-index-nudge` fragt `docker compose` nach dem Redis-Container**,
  statt den Namen `<projekt>-<dienst>-<n>` nachzubauen. Ein geratener Name wäre
  eine stille Kopplung; wäre er falsch, sähe das wie ein Produktfehler aus und
  würde jeden Deploy blockieren (die E2E ist ein Deploy-Gate).

## Die Bühne (seit 2026-11-17)

Nicht dreizehn einzelne Probleme, sondern EINES: es gab weder lokal noch in
der CI Probe-Communities. Jede Sitzung schrieb sich `kunde-a`/`kunde-b` von
Hand in die lokale Instanz, und 22 Skripte legten sich ihre Community mit je
eigenem, kopiertem Rumpf an. Seit OPS-009 gibt es dafür zwei Dinge:

**1. Die gemeinsame Hilfe `scripts/lib/probe-stage.mjs`.** EINE Stelle für
alles, was Beweis-Skripte brauchen: der Rumpf für `POST /api/onboarding/site`
(`probeSiteBody`), HTTP mit Host-Kopfzeile (`createHttpCaller`), Probe-Konten
(`createProbeAccount`, immer `@example.test`, Passwort je Lauf erzeugt),
Anmelden, Einladungs-Code, Community über die echte Route
(`createProbeCommunity`), auf den Host warten und ein Aufräum-Register, das
nach dem Löschen NACHZÄHLT (`createCleanup`). Sie spricht Appwrite per
`fetch` an, weil `node-appwrite` im Wurzel-`scripts/` nicht auflösbar ist.
Der Test `packages/onboarding/tests/probeSiteBody.test.ts` hält den Rumpf
gegen das echte Schema und den echten Handler — ein neues Pflichtfeld macht
DIESEN Test rot, nicht erst den nächsten Live-Lauf. Der Wächter
`packages/core/tests/proofScriptStageHelper.test.ts` verlangt, dass kein
Skript den Rumpf wieder selbst baut.

**2. Die Bühne `pnpm buehne <up|status|env|smoke|down>`**
(`scripts/buehne/buehne.mjs`). `up` legt zwei Communities direkt im Control
Plane an (`kunde-a.localhost`: Registrierung zu; `kunde-b.localhost`:
Registrierung offen; beide Plan `pro`, öffentlich) und im Pool-Projekt Konten
je Rolle: für A Owner, Admin, Moderator, Editor, Mitglied, ein entferntes
Konto, ein fremdes Konto und einen Betreiber; für B Owner und Mitglied. Der
Stand steht in `.buehne/state.json` (nicht im Repo, Modus 600). `env` nennt
einem Skript die Hosts und Ports, `smoke` prüft die Rollen über echte Routen,
`down` löscht alles — auch jede Zeile, die mit dem Stempel der Bühne oder an
einem ihrer Konten entstanden ist — und zählt nach (übrig ⇒ Exit 1).

**Lokal** (die Instanz ist ein Spiegel mit echten Daten — die Bühne schreibt
nur eigene, gestempelte Zeilen und liest nichts Fremdes):

```bash
# `.env` für apps/platform und apps/control liegen im Worktree (aus dem
# Haupt-Checkout kopiert); beide Server aus DEMSELBEN Checkout, eigene Ports:
(cd apps/control  && pnpm exec nuxi dev --port 3254)
(cd apps/platform && NUXT_ONBOARDING_CONTROL_URL=http://localhost:3254 pnpm exec nuxi dev --port 3250)
pnpm buehne up --platform-port 3250 --suffix meinlauf   # --suffix: eigene Hostnamen je Sitzung
pnpm buehne smoke
pnpm buehne env                                         # Hosts/Ports für ein Skript
pnpm buehne down                                        # Tabelle „gelöscht / übrig"
```

`--suffix` gehört auf einem geteilten Rechner immer dazu: `host` ist im
Control Plane eindeutig, zwei Sitzungen mit `kunde-a.localhost` stünden sich
im Weg. Steht ein Host schon und gehört nicht zur eigenen Bühne, bricht `up`
ab und ändert nichts.

**In der CI** (`.github/workflows/buehne.yml`, läuft neben den
Pflicht-Prüfungen, kein Tor fürs Ausliefern): `scripts/ci/buehne-setup.mjs`
legt auf der Wegwerf-Appwrite die Projekte `admin` und `account` an (die Ids
sind nicht frei: der Migrations-Runner vergleicht sie mit `appwriteProjects`
im `site.manifest.ts`) und schreibt beide `.env` samt Naht-Geheimnis; dann
`bootstrap` je App, beide Server, `pnpm buehne up`, die Beweise je als
eigener Schritt, `down` mit Nachzählen. NACHTS (seit 2026-11-17) kommt ein
drittes Projekt dazu: `comments` mit `apps/comments` als Einzel-Instanz
(`buehne-setup.mjs --einzel-port`, `bootstrap --seed`, Port 3001) und
Playwrights Chromium für die zwei Skripte mit Browser. An Pull Requests und
auf `main` steht sie nicht.

**Was die Bühne NICHT beweist:** Production hat die direkten Anmelde-Wege der
Datenbank aus, lokal und in der CI sind sie an. Die Server laufen als
Entwicklungs-Server ohne Webserver davor. In der CI ist die Datenbank leer,
lokal ist sie ein Spiegel. Kein Fremddienst spricht mit (kein Stripe, keine
KI, kein Mail-Versand nach draußen).

**Was von selbst läuft:** die Einteilung steht in
`scripts/buehne/beweise.mjs`, eine Zeile je Skript; die erzeugte Liste unten
zeigt sie in der Spalte „Läuft" und nennt in ihrer ersten Zeile die Zahl je
Lauf. Der Läufer:

```bash
pnpm buehne run --liste --lauf nacht          # was liefe
pnpm buehne run --lauf buehne                 # die kurzen (so fährt sie die CI)
pnpm buehne run --lauf nacht                  # kurz + lang (nächtlicher Lauf)
pnpm buehne run --only verify-site-authz      # ein Skript, egal welche Klasse
# lokal mit eigenen Ports: --control-port 3254 (der Platform-Port steht im Stand)
# mit Einzel-Instanz:      --einzel-port 3268  (apps/comments aus DEMSELBEN Checkout)
# mit branding.supply:     --branding-port 3016 (apps/branding, Start-Zeile unten)
```

**Der Soll-Stand der Bühne** (seit 2026-11-21, `scripts/buehne/baseline.mjs`):
die zwei Probe-Communities sind geteilt — jedes Skript und jeder Browser-Test
verlässt sich auf das, was `up` zusagt (aktiv, Plan `pro`, öffentlich,
Registrierung zu bzw. offen, keine Sperre). Ein Skript darf diese Felder
ändern und stellt sie am Ende auf den vorgefundenen Wert zurück. Der Läufer
prüft das nach jedem Skript: eine Abweichung macht dieses Skript rot („Bühne
verändert: B plan free statt pro"), auch wenn alle seine Prüfungen bestanden
haben; danach stellt der Läufer die Felder zurück und wartet 31 s, bis der
Platform-Server den Stand neu gelesen hat. `pnpm buehne e2e` prüft dasselbe
einmal vor den Browser-Tests und stellt zurück, ohne rot zu werden. Anlass war
der nächtliche Lauf vom 2026-11-21: ein Skript ließ beide Communities ohne
Plan zurück, und rot wurde 40 Skripte später ein Browser-Test, dem die
Menüpunkte „Feed", „Discussions" und „Events" fehlten.

**Die Einzel-Instanz im Läufer:** ein Skript mit `env: 'einzel'` und
`braucht: [..., 'einzel']` bekommt `apps/comments/.env` (`--env-einzel`),
`EINZEL_URL` und `EINZEL_PORT`. Ohne `--einzel-port` meldet der Läufer es als
„übersprungen" (zählt nicht als rot). Diese Skripte legen ihre Konten,
Kategorien und Beiträge selbst an und räumen über `createEinzelCleanup`
(`probe-stage.mjs`) mit Nachzählen auf — die alten Aufräum-Blöcke ließen
Namen (`account_handles`), Zähler, Abzeichen, Benachrichtigungen,
Aktivitäten und Protokoll-Zeilen der Wegwerf-Konten liegen. Lokal ist die
Einzel-Instanz das Spiegel-Projekt `account` (dieselbe Datenbank wie der
Pool) — dort nichts fahren, was für ALLE Konten etwas anstößt.

**branding.supply im Läufer (seit 2026-11-18):** ein Skript mit
`env: 'branding'` und `braucht: [..., 'branding']` bekommt
`apps/branding/.env` (`--env-branding`), `BRANDING_PORT`, `BRANDING_HOST` und
`BRANDING_URL`. Ohne `--branding-port` ist es „übersprungen". Der Server
läuft dafür mit GESTELLTEN ANTWORTEN — so startet ihn der nächtliche Lauf,
und so startet man ihn lokal (frischer Prozess: die Tages-Deckel des
Marktvergleichs zählen je Prozess):

```bash
BRAND_DEV_STUB_CHECK=1 BRAND_DEV_STUB_REVIEW=1 BRAND_DEV_STUB_VISION=1 \
BRAND_DEV_STUB_DNA=1 BRAND_DEV_STUB_MARK=1 BRAND_DEV_STUB_IMAGE=1 \
MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
pnpm --filter branding exec nuxi dev --port 3016
```

Die Schalter ersetzen jeden KI-Aufruf durch eine feste Antwort (sie wirken
nur außerhalb von Production) und erlauben dem Abruf fremder Websites nur
den eigenen Rechner — die Skripte liefern ihre Probe-Seiten selbst aus. Kein
Skript mit `env: 'branding'` ruft eine echte KI, Stripe oder eine fremde
Website. Drei Dinge, die beim Einzug gemessen wurden: (1) die Skripte legen
Konten mit dem LAUFZEIT-Schlüssel an (der Migrations-Schlüssel darf das
nicht) und halten deren Zustimmung über die echte Route fest
(`confirmProbeConsent` — die App lehnt sonst jede schreibende Route ab);
(2) der Läufer ZÄHLT NACH: vor und nach jedem dieser Skripte die Zeilen jeder
Tabelle und die Konten des Projekts, mehr als vorher ist rot („Zeilen übrig:
brand_steps +3"); (3) Zeilen, die die App selbst anlegt (Kapitel, Ereignisse,
Lauf-Zeilen, der Brand-Check eines Mitbewerbers), räumt das Skript über
`removeProbeRows` nach Spalte ab, nicht über eine feste Liste.

**Die Design-Vorlage der drei Design-Skripte (seit 2026-11-19):**
`verify-brand-kit`, `verify-brand-design` und `verify-brand-sessions`
schreiben einen fertigen DNA-Mix direkt in die Ablage. Er steht an EINER
Stelle, `packages/brand/scripts/lib/designProbe.mjs`, und der Test
`packages/brand/tests/designProbeTemplate.test.ts` hält ihn gegen den
Wortschatz der App (die App muss ihn lesen und Zeichen für Zeichen wieder so
schreiben). Vorher trug jedes Skript eine Kopie; als ein Etikett der App
umformuliert wurde, las die App die Vorlage nicht mehr, es entstand kein
fertiges Design, und rund fünfzig Prüfungen wurden rot, ohne dass am Produkt
etwas falsch war. `verify-brand-sessions` meldet außerdem, was es am
laufenden Server NICHT prüfen kann: vier Prüfungen gelten nur für einen
Server ohne gestellte Antworten („ohne Modell ⇒ 503") — am Server der Bühne
stehen sie als `○ übersprungen` mit Grund da und zählen nicht mit.

Er gibt jedem Skript die richtige Env-Datei, die Hosts der Bühne und eine
EIGENE Aufrufer-Adresse (`scripts/buehne/client-address.mjs` hängt
`x-forwarded-for` an, wie es auf Production der Webserver tut) — ohne die
laufen alle Skripte in dieselben Bremsen. Rot auf `main` oder nachts öffnet
das Issue `buehne-alarm` (docs/runbooks/PRODUKTIONS-ALARM.md, Abschnitt 1b).

**Von Hand bleiben** (Stand 2026-11-27, acht von 87; der Grund steht je
Skript in der Liste): zwei Skripte der Einzel-Instanz, die sie EIGENS
eingestellt brauchen (`verify-silo-domain`: Trockenlauf-Betreiber-App, Naht,
portfolio gegen eine tote Naht; `verify-domain-settle`: beschnittener
Schlüssel); `verify-business-confirmation` (braucht branding.supply UND die
Studio-Site nebeneinander, jede mit eigenem Projekt — die Bühne hat keinen
Server der Studio-Site; das Skript selbst ist seit dem 2026-11-19 nachgezogen
und liest das Projekt der Gegenprobe aus `PLAIN_ENV_FILE`);
`verify-custom-domain` (Trockenlauf-Betreiber-App mit eigenem Namens-Server,
dazu echte öffentliche DNS-Einträge); die mit Fremddiensten oder Dateien, die
nicht im Repo liegen (`verify-brand-context` und `verify-ugc-translation`:
bezahlte KI; `verify-brand-tokens`: Werkzeug aus dem Netz;
`verify-session-ip`: Standort-Datenbank im Binärformat).

Seit dem 2026-11-27 (BT1 a) laufen mit: `verify-geo-cities` (der Orts-Auszug
`scripts/buehne/fixtures/geo-cities.tsv`, acht Orte mit derselben
Spalten-Ordnung wie das GeoNames-Verzeichnis; `scripts/ci/buehne-setup.mjs`
trägt ihn als `NUXT_GEO_CITIES_PATH` ein, das Skript liest dieselbe Datei
unabhängig), `verify-notification-mail-links` (sein Sammel-Lauf ist derselbe,
den jeder Server mit Mail-Zugang zwei Minuten nach dem Start selbst anstößt —
Mails gehen auf der Bühne nur in den lokalen Briefkasten) und nachts
`verify-composer-editor` (Einzel-Instanz, Chromium; ein Neuversuch für den
Kaltstart, bei dem Vite Tiptap erst beim ersten Fokus bündelt).

## Beweise von Hand laufen lassen

Die Aufruf-Zeile steht bei jedem Skript IM KOPF der Datei — sie ist die
verlässliche Quelle, nicht diese Tabelle. Zwei wiederkehrende Fallen:

- **Aus dem PAKET-Ordner starten** (`cd packages/<layer>`), sonst löst
  `node-appwrite` nicht auf.
- **Vor jedem Beweis prüfen, WELCHER Dev-Server auf dem Port liegt.**
  `lsof -nP -iTCP -sTCP:LISTEN` und dann das `cwd` des Prozesses ansehen: bei
  der Arbeit an F30 lag auf :3001 `apps/control` statt `apps/comments`, und der
  Beweis meldete daraufhin einen Produktfehler, den es nicht gab.

## Alle Beweis-Skripte (erzeugt)

Quelle ist der erste Absatz im Kopf jedes Skripts (`verify-*.mjs`,
`acceptance-*.mjs` unter `packages/*/scripts` und `apps/*/scripts`). Wer ein
Skript anlegt, umbenennt, löscht oder seinen Kopf ändert, fährt
`pnpm live-beweise` und committet diese Datei mit. Die Wächter gegen
Production (`scripts/ops/verify-*.mjs`) stehen nicht hier, sondern in
`docs/runbooks/PRODUKTIONS-ALARM.md`.

<!-- ERZEUGT:ANFANG — nicht von Hand ändern, `pnpm live-beweise` schreibt diesen Abschnitt -->

87 Beweis-Skripte im Repo: 6 E2E-Lauf, 36 Bühne (jeder Lauf), 37 Bühne (nachts), 8 von Hand (Einteilung: `scripts/buehne/beweise.mjs`, Läufer: `pnpm buehne run`).

| Skript | Beweist (erster Absatz seines Kopfes) | Läuft |
| --- | --- | --- |
| `packages/activity/scripts/verify-pool-isolation.mjs` | activity im Pool — LIVE-DB-Isolationsbeweis + BESTANDS-MESSUNG (Muster: comments/posts/events/courses `verify-pool-isolation.mjs`). Fällig geworden mit dem Umzug von `activity` nach apps/platform (2026-08-02). | Bühne (jeder Lauf) |
| `packages/brand/scripts/verify-brand-check-robots.mjs` | Beweis für BS1 R2b — der Brand-Check respektiert `robots.txt` und den TDM-Nutzungsvorbehalt (Davids Entscheidung 2026-09-08). | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-context.mjs` | H5 — TAUGT `brand.md` ALS SYSTEM-PROMPT? (Konzept docs/plans/BRAND-BOOK-KIT.md §2.13, Paket K3.) | von Hand: Braucht einen echten KI-Aufruf bei einem fremden Anbieter, der Geld kostet. |
| `packages/brand/scripts/verify-brand-design.mjs` | DER PRODUKT-BEWEIS DER SCHICHT 2 „BRAND DESIGN" (Konzept docs/archiv/BRAND-DESIGN.md §2.18, Paket D9) — EIN Lauf von der gesperrten Schicht bis zum geteilten Abbild. | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-events-sweep.mjs` | Beweis für BS1 R1b — die 24-Monats-Frist der Funnel-Ereignisse (`brand_events`) hat ab jetzt eine MECHANIK, nicht nur einen Kommentar im Kopf von `007-brand-events.ts`. | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-intro-call.mjs` | Beweis für BS1 Paket Z0 „Erstgespräch-Seite im brand-Layer" (Plan docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §7 Zeile Z0) — gegen einen ECHTEN Server, weil keine pure Funktion und kein Route-Test mit gefälschter… | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-kit.mjs` | DER BEWEIS DER FREISCHALTUNG „ABLEITUNG" (Konzept docs/plans/BRAND-BOOK-KIT.md §2.8/§2.9, Paket K1) — EIN Lauf von der gesperrten Schicht 3 über die Betreiber-Handlung bis zur Rücknahme, und derselbe Weg noch einmal für… | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-sessions.mjs` | Beweis für BW2 Paket 3a — „Gespräch je Session" gegen einen echten Server. | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-share.mjs` | Beweis für Paket G3 „Teilen sichtbar" (Konzept docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §5, Zeile G3) — gegen einen echten Server, weil keine pure Funktion belegen kann, was an Route, Ablage und Kopfzeilen hängt: | Bühne (nachts), branding.supply |
| `packages/brand/scripts/verify-brand-tokens.mjs` | DER FREMDE LESER (Konzept docs/plans/BRAND-BOOK-KIT.md §2.18 Zeile K2: „Style-Dictionary-v5-Probelauf im Skript"). | von Hand: Lädt beim Lauf ein Werkzeug aus dem Netz, und das soll kein automatischer Lauf tun. |
| `packages/brand/scripts/verify-workshop-hydration.mjs` | WERKSTATT: SERVER-FASSUNG GEGEN BROWSER-FASSUNG — der Prüfweg vor jedem weiteren WS1-Schnitt (2026-11-25). | Bühne (nachts), branding.supply |
| `packages/comments/scripts/verify-comment-reactions.mjs` | EMOJI-REAKTIONEN AUF ANTWORTEN — der Beweis (F57, Davids Entscheidung 2026-08-13 „Ja, nachbauen"). | Bühne (nachts), Einzel-Instanz |
| `packages/comments/scripts/verify-embed-boundary.mjs` | Beweis für F37 — DAS WIDGET IM POOL: Berechtigung + Mandantengrenze. | Bühne (jeder Lauf) |
| `packages/comments/scripts/verify-pool-isolation.mjs` | H3-Pool-Isolation — LIVE-DB-Beweis (repeatable). Ergänzt den pure-logic- Beweis (der Spike s5-pool-silo, Ergebnis in docs/archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md) um einen echten Appwrite-Roundtrip: seedet Rows für ZWE… | E2E-Lauf |
| `packages/control/scripts/verify-account-bell.mjs` | Beweis für die Glocke im Kundenbereich (C17). | Bühne (jeder Lauf) |
| `packages/control/scripts/verify-audience-flip.mjs` | C18 — SICHTBARKEIT JE COMMUNITY, LIVE-BEWEIS in BEIDE Richtungen. | E2E-Lauf |
| `packages/control/scripts/verify-invite-requests.mjs` | Beweis für die Einladungs-Warteschlange (control-017). | Bühne (jeder Lauf) |
| `packages/control/scripts/verify-invite-stock.mjs` | Beweis für Vorrat + Zuweisung MIT echter Betreiber-Session (control-017). | Bühne (jeder Lauf) |
| `packages/control/scripts/verify-onboarding.mjs` | Beweis für O2 — die Provisionierungs-Route des Control Plane. | Bühne (jeder Lauf) |
| `packages/control/scripts/verify-silo-domain.mjs` | Beweis: eigene Domains für SILO-Apps (control-036, 2026-08-07). | von Hand: Braucht drei eigens eingestellte Server: die Betreiber-App im Trockenlauf mit eigenem Namens-Server, die Einzel-Instanz mit Naht zum Control Plane und portfolio gegen eine tote Naht — der nächtliche Lauf startet keinen davon so. |
| `packages/core/scripts/verify-business-confirmation.mjs` | BEWEIS FÜR BS1 R1c — DIE UNTERNEHMER-BESTÄTIGUNG IST EINE TATSACHE AM KONTO, KEINE FORMULARVALIDIERUNG (Davids Entscheidung vom 2026-09-08: branding.supply nimmt nur Unternehmen und Selbstständige auf, B2B). | von Hand: Braucht ZWEI Apps nebeneinander (branding.supply und die Studio-Site, jede mit eigenem Projekt), und die Bühne hat keinen Server der Studio-Site. Das Skript selbst ist seit dem 2026-11-19 nachgezogen (27 von 27 lokal) — es kann einziehen, sobald die Studio-Site auf der Bühne steht. |
| `packages/core/scripts/verify-geo-cities.mjs` | Beweis: der Orts-Picker im Profil — Suche, Länder-Filter und der Standort am KONTO (Mitglieder-Karte, Etappe 1). | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-handle-search-boundary.mjs` | Beweis: die Handle-Grenze einer Community hält — beim LESEN und beim NEHMEN. | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-mfa.mjs` | Beweis für den Zweitfaktor (U15 Teil 4). | Bühne (nachts), Einzel-Instanz |
| `packages/core/scripts/verify-notification-mail-links.mjs` | Beweis: Benachrichtigungs-MAILS verlinken auf den Host DER COMMUNITY (D5). | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-otp-availability.mjs` | Beweis für F37 — DER PASSWORTLOSE LOGIN ENDET NIE IN EINER SACKGASSE. | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-presence-away-priority.mjs` | BEWEIS: „sichtbar schlägt away (fremder Mandant)" — die Vorfahrts-Regel vom 2026-08-18 (packages/core/shared/presencePriority.ts). | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-presence-boundary.mjs` | A4 — DIE PRESENCE-GRENZE, in BEIDE Richtungen bewiesen. | E2E-Lauf |
| `packages/core/scripts/verify-rate-limits.mjs` | Beweis für die Drossel-Grenzen des Sicherheits-Pakets vom 2026-08-02. | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-server-only-writes.mjs` | „Der Server schreibt" — LIVE-Beweis an der Datenbank (SEC-002, GA1 P13). | Bühne (jeder Lauf) |
| `packages/core/scripts/verify-session-ip.mjs` | Beweis: serverseitig erzeugte Appwrite-Sessions tragen die CLIENT-IP (x-forwarded-for aus forwardClientContext), nicht die Server-IP. | von Hand: Braucht die Standort-Datenbank (DB-IP im Binärformat, nicht im Repo; einen kleinen Auszug kann man ohne neues Paket nicht schreiben) und eine geänderte Proxy-Einstellung der Datenbank, die die Bühne nicht setzt. |
| `packages/core/scripts/verify-site-card.mjs` | BEWEIS: DIE EINTRITTSKARTE JE SEITE IM MODUS `write` (PK1 E1c; Plan `docs/plans/PUKALANI-KONTO-E1.md`, § 9 „Auf der Bühne"). | Bühne (nachts) |
| `packages/core/scripts/verify-timezone.mjs` | Beweis für die Konto-Zeitzone (U15 Teil 5). | Bühne (nachts), Einzel-Instanz |
| `packages/core/scripts/verify-ugc-translation.mjs` | Beweis: KI-Übersetzung für User-Content (Davids Entscheidungen 2026-08-17 — Beiträge + Kommentare · Knopf statt Automatik · Inhalts-Produkt als Gate · nur Eingeloggte, gedrosselt · EIN Übersetzungs-Cache je Zeile, posts… | von Hand: Braucht einen echten KI-Aufruf bei einem fremden Anbieter, der Geld kostet. |
| `packages/courses/scripts/verify-manage-entrypoints.mjs` | F58-Beweis: Die Kurs-Verwaltung ist AUS DEM PRODUKT HERAUS erreichbar. | Bühne (nachts), Einzel-Instanz |
| `packages/courses/scripts/verify-pool-isolation.mjs` | courses im Pool — LIVE-Isolationsbeweis über die ECHTE API (Muster events/verify-pool-isolation + events/verify-site-authz, zusammengelegt). | Bühne (nachts) |
| `packages/courses/scripts/verify-silo-unchanged.mjs` | Silo-Gegenprobe: Kurse verhalten sich in apps/comments UNVERÄNDERT. | Bühne (nachts), Einzel-Instanz |
| `packages/domains/scripts/verify-domain-settle.mjs` | Beweis: der LETZTE Schritt einer Silo-Freischaltung (F54-1, 2026-08-08). | von Hand: Braucht eine zweite Einzel-Instanz mit absichtlich beschnittenem Schlüssel und eigener Naht; die Einzel-Instanz des nächtlichen Laufs hat den vollen Schlüssel. |
| `packages/events/scripts/verify-manage-entrypoints.mjs` | F58-Beweis: Die Termin-Verwaltung ist AUS DEM PRODUKT HERAUS erreichbar. | Bühne (nachts), Einzel-Instanz |
| `packages/events/scripts/verify-paid-ticket.mjs` | DER GELDPFAD, gegen die ECHTE Instanz — Ticket ausstellen, wiederfinden, zusagen dürfen. | E2E-Lauf |
| `packages/events/scripts/verify-pool-isolation.mjs` | events im Pool — LIVE-Isolationsbeweis über die ECHTE API (Muster comments/posts verify-pool-isolation + onboarding/verify-site-authz). | Bühne (nachts) |
| `packages/events/scripts/verify-site-authz.mjs` | N5a — Events-Verwaltung gehört dem Site-Owner, nicht dem globalen Label. | Bühne (jeder Lauf) |
| `packages/market/scripts/verify-market-fetch.mjs` | Beweis für MV1 M2 — „Abruf + Extraktion" gegen eine ECHTE Route, eine echte Ablage und echte (erfundene) Websites. | Bühne (nachts), branding.supply |
| `packages/market/scripts/verify-market-report.mjs` | Beweis für MV1 M3 — „Vergleich + Befunde" gegen eine ECHTE Route, eine echte Ablage, echte (erfundene) Websites und den echten Befund-Speicher des brand-Layers. | Bühne (nachts), branding.supply |
| `packages/market/scripts/verify-market-retention.mjs` | Beweis für MV1 M5 — „Betrieb": die 24-Stunden-Frist, die Vertraulichkeit der Markt-Daten, die freiwillige Bewertung und die Erklärseite des Bots — gegen ECHTE Routen, echte SSR-Seiten und die echte Ablage. | Bühne (nachts), branding.supply |
| `packages/market/scripts/verify-market-ui.mjs` | Beweis für MV1 M4 — „Oberfläche": die Seite „Markt", der Quellen-Wähler, das Opt-in fremder Marken, die Rolle `self` und der Eintrag in der Werkstatt-Leiste, gegen ECHTE Routen, echte SSR-Seiten und die echte Ablage. | Bühne (nachts), branding.supply |
| `packages/media/scripts/verify-index-nudge.mjs` | F19-Beweis am lebenden Appwrite: überlebt `indexStep` mit `tableCacheNudge` einen VERGIFTETEN Metadaten-Cache? | E2E-Lauf |
| `packages/media/scripts/verify-pool-isolation.mjs` | media im Pool — LIVE-DB-Isolationsbeweis (Muster: comments/posts/events/ courses `verify-pool-isolation.mjs`). Fällig geworden mit dem Umzug von `media` nach apps/platform (2026-08-02). | Bühne (jeder Lauf) |
| `packages/messages/scripts/verify-messages.mjs` | BEWEIS: private Nachrichten (Stufe 1) — gegen eine ECHTE Appwrite. | Bühne (jeder Lauf) |
| `packages/moderation/scripts/verify-report-boundary.mjs` | MODERATIONS-AUDIT BEFUND 1 — DIE GRENZE EINER MELDUNG, in beide Richtungen bewiesen, und zwar auf der REALTIME-EBENE (nicht nur an der Route). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/acceptance-onboarding.mjs` | Abnahme des Self-Service-Onboardings (SAAS-ROADMAP #1, Definition of Done): | Bühne (nachts) |
| `packages/onboarding/scripts/verify-account-events.mjs` | Beweis für den Abschnitt „Konto und Sicherheit" auf `/profile/activity` (Davids Entscheidung 2026-11-13). | Bühne (nachts) |
| `packages/onboarding/scripts/verify-community-export.mjs` | Beweis für U20 — das Community-Bündel (GET /api/community/export). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-community-favicon.mjs` | Beweis für den Community-Favicon-Upload (Davids Zuschnitt vom 2026-08-18): eine Community lädt ein eigenes PNG-Favicon hoch, es erscheint im Tab und als App-Icon; ohne Upload bleibt das generierte Initial-SVG. | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-community-suspension.mjs` | Beweis für M13 — der Sperr-/Missbrauchspfad (Davids Entscheidungen 2026-08-02). | Bühne (nachts) |
| `packages/onboarding/scripts/verify-control-exit.mjs` | Beweis für den F50-Nachtrag — die zwei Switcher-Ausgänge kommen EINGELOGGT an. | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-control-host.mjs` | Beweis für O3 — die Trennung der zwei Welten DESSELBEN Deployments. | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-custom-domain.mjs` | Beweis: eigene Domains je Community (control-035, Davids Entscheidungen vom 2026-08-07). | von Hand: Braucht eine Betreiber-App im Trockenlauf mit eigenem Namens-Server (NUXT_CUSTOM_DOMAIN_DRY_RUN, NUXT_CUSTOM_DOMAIN_DNS_SERVERS), die die Bühne nicht startet, misst in Abschnitt 5 gegen echte öffentliche DNS-Einträge (Weiterleitung an 1.1.1.1, ein Fremddienst) und kennt die Freigabe durch den Betreiber (BE-014) noch nicht. |
| `packages/onboarding/scripts/verify-dashboard-access.mjs` | Beweis für N1 — Site-Rollen öffnen das Kunden-Dashboard (Pool-Audit 2026-07-27, wichtigster offener Befund). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-member-invites.mjs` | Beweis für F57 Mechanik 2 — EINLADUNGEN DURCH MITGLIEDER. | Bühne (nachts) |
| `packages/onboarding/scripts/verify-members-map.mjs` | Beweis für die MITGLIEDER-KARTE (Etappe 2, 2026-08-23). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-my-overview.mjs` | Beweis für F12 — die Kunden-Übersicht auf `account.*`. | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-past-due-notice.mjs` | Beweis: DIE ZAHLUNGSWARNUNG EINES COMMUNITY-ABOS KOMMT BEIM OWNER AN (Davids Entscheidung vom 2026-08-03 — sie gehört in die COMMUNITY-Glocke). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-profile-signal.mjs` | Beweis für U19 — die Karte „Hilf uns, Pukalani zu schärfen" UND ihr Leser. | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-removed-notifications.mjs` | Beweis: EINE ENTFERNTE PERSON BEKOMMT AUS DER COMMUNITY NICHTS MEHR (MM1 b). | Bühne (jeder Lauf) |
| `packages/onboarding/scripts/verify-site-authz.mjs` | Beweis für O5 — Branding pro Mandant + Autorisierung je Community. | Bühne (nachts) |
| `packages/onboarding/scripts/verify-site-branding.mjs` | Beweis für Entscheidung 12 (David, 2026-07-28) — SITE-OWNER wählen Theme + Variante ihrer Community selbst. Seit dem 2026-07-29 (Davids Entscheidung, Rest von OPEN-ITEMS B5) gehört die NEUTRAL-PALETTE (`data-neutral`, c… | Bühne (nachts) |
| `packages/onboarding/scripts/verify-trial-notice.mjs` | Beweis für M13 — der Hinweis auf die ablaufende Testphase. | Bühne (nachts) |
| `packages/pages/scripts/verify-community-navigation.mjs` | Beweis für U15 Teil 1 (Davids Zuschnitt vom 2026-08-13) — DER OWNER STELLT SEIN ÖFFENTLICHES MENÜ SELBST ZUSAMMEN: ausblenden · umordnen · umbenennen · eigene Links (auf CMS-Seiten dieser Community und auf externe https… | Bühne (nachts) |
| `packages/pages/scripts/verify-community-redirects.mjs` | Beweis für U15 Teil 3 (Davids Entscheidung vom 2026-08-13) — DER OWNER LEGT SEINE WEITERLEITUNGEN SELBST AN: alte Adresse ⇒ neue Adresse. | Bühne (jeder Lauf) |
| `packages/pages/scripts/verify-community-seo.mjs` | Beweis für U15 Teil 2 (Davids Zuschnitt vom 2026-08-13) — DER OWNER STELLT SEINEN SUCHEINTRAG SELBST EIN: eigene Beschreibung der Startseite · noindex-Schalter · Vorschau. | Bühne (jeder Lauf) |
| `packages/pages/scripts/verify-page-languages.mjs` | Beweis für F60 (Davids Entscheidungen vom 2026-09-10) — MEHRSPRACHIGE BETREIBER-SEITEN: der Fallback zeigt und sagt, was er zeigt. | Bühne (jeder Lauf) |
| `packages/posts/scripts/verify-composer-editor.mjs` | „SCHREIBFLÄCHE AUF UEditor" — der Beweis (2026-08-04). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-handles-mentions.mjs` | „HANDLES (@name) UND ERWÄHNUNGEN" — der Beweis (2026-08-04). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-like-limit.mjs` | DAS TAGES-LIMIT FUER LIKES — der Beweis (F57 Mechanik 3, 2026-08-14). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-mention-menu.mjs` | „NAMENSVERVOLLSTÄNDIGUNG BEIM TIPPEN" — der Beweis (2026-08-05). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-new-topic-entry.mjs` | „THEMA ERÖFFNEN AUS DISCUSSIONS HERAUS" — der Beweis (2026-08-04). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-pool-isolation.mjs` | posts im Pool — LIVE-DB-Isolationsbeweis (Muster: comments/scripts/ verify-pool-isolation.mjs). Seedet Feed-Rows, Score-Votes und Poll-Stimmen für ZWEI Tenants und prüft, dass die tenantId-Filterung der Datentür auf DB-… | E2E-Lauf |
| `packages/posts/scripts/verify-reactions.mjs` | EMOJI-REAKTIONEN — der Beweis (F57 Mechanik 1, 2026-08-13). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-topic-links.mjs` | THEMEN-VERLINKUNG MIT RUECKVERWEIS — der Beweis (F57, letzte Mechanik, 2026-08-14). | Bühne (nachts), Einzel-Instanz |
| `packages/posts/scripts/verify-trust-levels.mjs` | BEWEIS: die Vertrauensstufen (F1 Teilpaket 3) — gegen eine ECHTE Appwrite. | Bühne (jeder Lauf) |
| `packages/posts/scripts/verify-trust-perks.mjs` | WAS EINE VERTRAUENSSTUFE EINBRINGT — der Beweis (F57-Stufen, 2026-08-14). | Bühne (nachts) |
| `packages/runner/scripts/verify-runner-boundary.mjs` | Beweis: die RUNNER-NAHT des AI-Runners hält — docs/archiv/AI-RUNNER.md § 5. | Bühne (jeder Lauf) |
| `apps/control/scripts/verify-docs-access.mjs` | Beweis für den internen /docs-Bereich (admin.pukalani.app/docs). | Bühne (jeder Lauf) |
| `apps/control/scripts/verify-run-prompt.mjs` | Beweis: den Auftragstext eines Runner-Laufs baut der Server (RU1 b). | Bühne (jeder Lauf) |
| `apps/platform/scripts/verify-community-search-pages.mjs` | COMMUNITY-SEITEN FÜR DIE SUCHE (Q10 — SEO-003, SEO-004, SEO-007; SU1). | Bühne (jeder Lauf) |
| `apps/platform/scripts/verify-og-image.mjs` | Beweis für das Vorschaubild je Community (og:image, OPEN-ITEMS B2). | Bühne (jeder Lauf) |

<!-- ERZEUGT:ENDE -->
