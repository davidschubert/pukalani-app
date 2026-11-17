# F3 / AH-6 — Das comments-Silo zieht in den Pool

**Stand: 2026-08-11 · Status: PLAN, zur Abnahme durch David. Nichts davon ist
gebaut.** Steuerung: [OPEN-ITEMS.md](../OPEN-ITEMS.md) Punkt 10 · Horizont:
[ACCOUNT-HORIZONT.md](../plans/ACCOUNT-HORIZONT.md) Abschnitt AH-6 · Vorlauf, dessen
Rezept hier wiederverwendet wird: [ACCOUNT-CUTOVER.md](ACCOUNT-CUTOVER.md)
(AH-1, gefahren am 2026-08-11).

Dieses Dokument ist der **Plan**. Es enthält bewusst keine abhakbaren Kästchen
— die entstehen erst beim Bau als eigenes Runbook unter `docs/runbooks/`,
nach dem Muster der beiden gefahrenen Cutover. Wo eine Zahl fehlt, steht
**„vor Phase N messen"** statt einer Schätzung: die Mengen liegen in einer
Produktions-Instanz, an die dieser Plan bewusst nicht gerührt hat.

---

## 0 · Kurzfassung

`comments.pukalani.app` wird eine **Pool-Community im Projekt `account`**,
bedient von `apps/platform` — kein eigenes Appwrite-Projekt, keine eigene
ploi-Site, kein eigenes Deployment mehr. **`apps/comments` bleibt als CODE
bestehen** (Muster `photos`: App ohne Deployment), weil die gesamte CI-E2E an
dieser App hängt und weil sie die Silo-Gegenform für die Grenzbeweise liefert.

Der teuerste und einzige wirklich riskante Teil ist die **Nutzer-Zusammen-
führung**: Appwrite-Konten sind strikt pro Projekt, und jede Zeile im Silo
zeigt auf eine `comments`-User-Id, die es im `account`-Projekt nicht gibt.
Der Plan schlägt vor, die **Ids zu BEHALTEN** statt umzuschreiben — dann ist
das Remapping die Ausnahme (E-Mail-Kollision) statt die Regel.

Danach existieren genau zwei Auth-Welten: **account** (alle Menschen) und
**control/admin** (Betreiber). `portfolio` bleibt als Davids eigenes Silo
unberührt — das ist ausdrücklich **nicht** Teil von F3.

---

## 1 · Ist-Stand: was `comments` heute ist

### 1.1 Eigenes Appwrite-Projekt

- Projekt-Id `comments`, Datenbank `main`, Session-Cookie `a_session_comments`.
- **Eigene Nutzer.** Kein Konto dieses Projekts ist dasselbe Konto wie in
  `account` — auch bei identischer E-Mail nicht (Appwrite kennt kein
  projektübergreifendes Auth; Faktenlage geprüft und festgehalten in
  ACCOUNT-HORIZONT.md).
- Zwei Schlüssel (Runtime + Migrations), Envs auf dem Server unter
  `/home/ploi/comments.pukalani.app/.env`.
- `apps/comments/.env.production` ist die Instanz-Konfiguration, mit der
  `pnpm ops:schema-parity` die Instanz in seine Liste aufnimmt
  (`scripts/ops/verify-schema-parity.mjs:55`).

### 1.2 Die Tabellen

Die App montiert **vierzehn Layer** (`apps/comments/nuxt.config.ts`), die
Instanz trägt also nicht nur die vier Tabellen des `comments`-Layers, sondern
das volle Schema aller montierten Layer. Der `comments`-Layer selbst:

| Table | Besonderheit | Migrationen |
| --- | --- | --- |
| `comments` | `rowSecurity: true`, **kein** Table-`read(any)` (008 hat es entfernt) — Lesen steuern die Rows | 002–008, 011, 013, 016–018 |
| `comment_votes` | Table-`read(users)` entfernt (007: Voting ist nicht anonym, wenn jeder alle Stimmen listen kann) | 002, 007, 009, 014, 016, 017 |
| `embed_sites` | `rowSecurity: false`, `permissions: []` — Zugriff NUR über Routen; Unique seit 015 `(communityId, host)` | 012, 015–017 |
| `guest_authors` | `rowSecurity: false`, Table-Read nur `label:admin` / `label:moderator`; **tote Tabelle** (F18, s. § 4.4) | 013, 016, 017 |

Wichtig für die Migration: **die Tabellen sind bereits pool-fähig.** Migration
`comments-016` hat `communityId` auf allen vieren angelegt, `017` hat den
Übergangs-Stempel `tenantId` samt Indizes final gedroppt. Es fehlt also kein
Schema — es fehlen nur die WERTE (§ 4.2).

Ebenso pool-fähig ist der Code: in `packages/comments/server/**` gibt es
**keinen einzigen rohen `tablesDB`-Zugriff**; alles läuft über `tenantDb()`,
und `comments` steht in der ESLint-Sperrliste der gepoolten Layer
(`eslint.config.mjs`). Die Produkt-Bilanz weist den Layer mit 16/17 Routen
über die Datentür aus, und `packages/comments/scripts/verify-pool-isolation.mjs`
läuft in jedem CI-Lauf.

**Ausnahme, die man kennen muss:** zwei Routen liegen in der APP und damit
außerhalb des ESLint-Scopes und ohne Mandanten-Scope —
`apps/comments/server/api/stats.get.ts` (öffentliche Landing-Statistik,
Microcache) und `apps/comments/server/api/events/[id]/checkout.post.ts`
(Stripe-Checkout für bezahlte Event-Tickets, A14-Komposition events+billing).
Beide sterben mit dem Deployment (§ 2.4).

### 1.3 Hosts, TLS, Betrieb

- **ploi-Site 389772**, NodeJS, Port **3001**, pm2-Prozess
  `commentspukalaniapp`, Release-Slot `/home/ploi/releases/comments/`,
  Ecosystem `ops/ecosystem-comments.config.cjs`, ploi-Health-Check auf
  `https://comments.pukalani.app/api/health`.
- **Eigene Let's-Encrypt-Lineage** `comments.pukalani.app` (nachgemessen am
  2026-07-30; die Lineage-Falle betrifft nur Apex+Wildcard, nicht diesen
  Host). Eintrag im TLS-Wächter: `scripts/ops/verify-tls.mjs`, Notiz
  „Silo-Kunde".
- Env-Pflichtliste in `scripts/ops/verify-site-env.mjs` unter
  `comments.pukalani.app` — darunter **`NUXT_ONBOARDING_CONTROL_URL` +
  `NUXT_ONBOARDING_SERVICE_SECRET`** (die Silo-Naht ins Control Plane für
  eigene Domains, control-036) und `NUXT_ANALYTICS_STATS_API_KEY`
  (eigene Plausible-Site).
- **`.github/workflows/deploy.yml` benutzt diesen Host als Referenz:** Zeile
  157 liest die live ausgelieferte Build-SHA von
  `https://comments.pukalani.app/api/health` und bildet daraus die Diff-Basis
  für „Deploy nötig?". Der Host steht zusätzlich in vier `for app in …`-
  Schleifen sowie in den Tabellen `SITE[]`/`SLOT[]`.

### 1.4 Konfiguration (`apps/comments/app/app.config.ts`)

```ts
comments: {
  autoHideReports: 3,
  embed: {
    enabled: true,
    allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
    guests: true,
  },
},
```

Dazu: `auth.otp` + `auth.embedSession` an, `security.csrfOriginCheck` an
(Pflicht wegen embedSession), `observability` an, `ai.enabled` an,
`billing.enabled` an (Stripe im TESTMODUS, Preise `free`/`pro`),
`analytics` mit eigener Plausible-Script-Id, `seo.originFromRequest: true`,
`admin.instanceTabs: true`. **`pukalani.tenancy` fehlt vollständig** — das
Gate ist aus, die App ist per Definition Single-Tenant.

### 1.5 Die drei Rollen, die den Host heute rechtfertigen

Festgehalten als Entscheidung am 2026-08-04 (DECISION-LOG, Silo-Strategie):

1. **E2E-Anker** — `.github/workflows/e2e.yml` fährt die gesamte Suite gegen
   `apps/comments`.
2. **Embed-Produkt** für fremde Seiten.
3. **Lebender Beweis der Studio-/Enterprise-Form** und **Gegenform für
   Grenzbeweise** (Silo `read("users")` gegen Pool-`read(label:…)` — Presence-
   und Handle-Beweise brauchen BEIDE Formen).

Rolle 1 und 3 hängen am **Code** `apps/comments`, nicht am Deployment
(§ 6 belegt das Zeile für Zeile). Rolle 2 hängt am Produkt, und das ist im
Pool seit F37 vorhanden (§ 5). Genau diese Aufteilung ist die Grundlage der
Empfehlung.

---

## 2 · Zielbild und Empfehlung

### 2.1 Option A — Pool-Community, App bleibt als Code *(Empfehlung)*

`comments.pukalani.app` wird eine gewöhnliche Community im Projekt `account`,
aufgelöst über den bestehenden Wildcard-Host der Site `platform`. Es gibt
danach: keine ploi-Site 389772, kein pm2 `commentspukalaniapp`, kein
Appwrite-Projekt `comments` im Betrieb (eingefroren wie `pool`), keine
comments-Zeile in `verify-site-env`, `verify-schema-parity` und `deploy.yml`.

`apps/comments` bleibt vollständig im Repo — nach dem Muster von
`apps/photos` („App existiert, nie ausgerollt"): sie behält ihre 14 Layer,
ihre `bootstrap.ts`/`seed-demo.ts`, ihre sechs Playwright-Specs und bleibt
das Ziel der CI-E2E gegen die Wegwerf-Appwrite.

**Was das gewinnt**

- Ein Konten-Pool: die Menschen von comments.pukalani.app sind ab dann
  Pukalani-IDs und können jeder anderen Community beitreten. Das ist der
  eigentliche Zweck des Account-Horizonts.
- Eine Instanz weniger für Migrationen, Schema-Parity, Env-Drift (F44), TLS
  und Deploy — genau die Kosten, die die Silo-Regel vom 2026-08-04 benennt.
- Zwei Service-Secrets weniger im Umlauf (`NUXT_ONBOARDING_SERVICE_SECRET` auf
  einem öffentlichen Kunden-Host).
- comments wird zum lebenden Beweis, dass ein Silo IN den Pool umziehen kann —
  der Rückweg des Enterprise-Angebots, den bisher niemand gefahren ist.

**Was das kostet (ehrlich)**

- Die eigene Landingpage (`apps/comments/app/pages/index.vue`, Live-Presence +
  `/api/stats`) verschwindet; der Host zeigt die Standard-Community-Startseite.
- `billing` und `domains` sind in `apps/platform` **nicht** montiert. Bezahlte
  Event-Tickets über den App-eigenen Stripe-Checkout gibt es im Pool nicht
  (Geldfluss 2 ist F7/Connect und ungebaut); eigene Kundendomains gibt es im
  Pool zwar, aber über den `onboarding`-Weg und ab Plan Pro.
- Gast-Kommentare im Embed sind im Pool ein **App-weiter** Schalter, kein
  Community-Schalter (§ 5.3).
- Rolle 3 („Silo lebt") verliert ihren PRODUKTIVEN Beleg. Der Code-Beweis
  bleibt (E2E + `apps/portfolio` ist weiterhin ein echtes Silo), aber die
  Aussage „wir betreiben eine Enterprise-Instanz" stimmt danach nur noch für
  `portfolio`.

### 2.2 Option B — eigenes Deployment gegen das `account`-Projekt

Deployment-Isolation ohne Projekt-Isolation: die ploi-Site bleibt, `apps/comments`
wird deployt, spricht aber das `account`-Projekt an.

Klingt nach dem billigen Mittelweg und ist es nicht. Sobald die App in ein
GETEILTES Projekt schreibt, MUSS sie mandantenfähig laufen — sonst schreibt
sie Zeilen ohne `communityId` neben die Pool-Zeilen, und `rowBelongsToTenant`
(fail-closed) macht sie für jeden Pool-Leser unsichtbar, während der
Silo-Code sie ungefiltert liest. Man müsste also `pukalani.tenancy` in
`apps/comments` einschalten, den tenants-Resolver, den Control-Plane-Lesekey,
die Datentür-Semantik und die Label-Vergabe mitnehmen — und hätte am Ende
`apps/platform` nachgebaut, auf einem zweiten Port, mit zweiter Env und
zweitem Deploy.

Der einzige echte Vorteil: die eigene Landingpage und der `billing`-Layer
blieben. Beides ist billiger anders zu haben (§ 9, Entscheidungen 8 und 9).

### 2.3 Option C — alles lassen

Kostet nichts und ist deshalb der ehrliche Rückfall. Der Preis: der
Account-Horizont bleibt unvollendet — es gibt weiter drei Auth-Welten
(account, control, comments), und ein Mensch mit einem Konto auf
comments.pukalani.app hat auf `account.pukalani.app` keins. Solange comments
Bestandskunden hat, ist das eine dauerhafte Erklärungs-Schuld.

### 2.4 Empfehlung

**Option A.** Sie erfüllt als einzige das Ziel des Horizonts, die Kosten sind
benennbar und klein, und der einzige harte Blocker (E2E-Anker) fällt weg,
sobald man Deployment und Code trennt — was die Silo-Regel vom 2026-08-04
ohnehin als Leitsatz formuliert: *„Isolation im CODE und im DEPLOYMENT sind
zwei Entscheidungen."* F3 ist die erste Gelegenheit, diesen Satz auch
rückwärts anzuwenden.

---

## 3 · Die harte Nuss: Nutzer-Zusammenführung

### 3.1 Der Kern des Problems

Jede Zeile im comments-Projekt zeigt an mindestens einer Stelle auf eine
User-Id dieses Projekts:

- **Spaltenwerte.** Gefunden über alle Layer-Migrationen: `userId` (17
  Spalten), `authorId` (4), `authorUserId` (2), `actorId` (2), `senderId`,
  `recipientId`, `organizerId`, `reporterId`, `resolvedBy`, `updatedBy`,
  `createdBy`, `runtimeUserId` (2 — betrifft `app_secrets`, nicht Menschen).
- **Row-Permissions.** `update("user:<id>")` / `delete("user:<id>")` stehen als
  STRING in `$permissions` jeder Zeile mit Besitzer (`tenantRowPermissionsFor`,
  Option `ownerUserId`).
- **Datei-Permissions** in den Buckets (`avatars`, `media`, `event-covers`,
  `ticket-files`, `gdpr-exports`).
- **Register:** `account_handles.userId`, `community_handles.userId`,
  `member_counters`, `user_badges`.

Ein Umschreiben all dessen ist machbar, aber jede vergessene Stelle ist ein
stiller Datenfehler: ein Beitrag ohne Autor, eine Zeile, die ihr Besitzer
nicht mehr bearbeiten darf, eine Benachrichtigung im Nichts.

### 3.2 Die Regel, die den Aufwand halbiert: Ids BEHALTEN

Appwrites Users-API nimmt beim Anlegen eine **explizite `userId`** entgegen
(`users.create` und die Hash-Varianten `createBcryptUser`/`createArgon2User`/…).
Ein Konto kann im Zielprojekt also dieselbe `$id` bekommen, die es im
Quellprojekt hatte.

**Folge: für jedes Konto ohne Kollision ist das Remapping ein No-Op.** Keine
Spalte, keine Permission, keine Datei muss angefasst werden. Genau so hat
AH-1 die Rows samt `$permissions` unverändert kopiert.

Es bleiben zwei Kollisionsfälle:

1. **Id-Kollision** — dieselbe `$id` existiert schon in `account`. Bei
   `ID.unique()`-Ids praktisch ausgeschlossen, aber **nicht** annehmen:
   Phase 1 zieht beide Id-Mengen und schneidet sie. Trifft es doch zu, ist
   das ein normaler Remapping-Fall.
2. **E-Mail-Kollision** — die Adresse existiert schon in `account`. Appwrite
   lehnt die Anlage ab (409). Hier greift die Zusammenführungs-Regel.

### 3.3 Zusammenführungs-Regel bei gleicher E-Mail

> **Dieselbe E-Mail ist DANN dieselbe Person, wenn BEIDE Konten
> `emailVerification === true` tragen. Sonst nicht — dann entscheidet David
> den Einzelfall.**

**Warum das die sichere Annahme ist, belegbar aus diesem Code:** In diesem
Projekt beweist das Verifikations-Flag Postfach-Kontrolle, nicht bloß
Tipparbeit. Der Code-Login setzt es (`packages/core/server/api/auth/otp/verify.post.ts`
rechnet den Erst-Beitritt bewusst VOR der Session aus, „der Login kippt
emailVerification auf true"), und der Passwort-Weg verifiziert über den
Bestätigungslink. Zwei bewiesene Kontrollen desselben Postfachs zu
verschiedenen Zeitpunkten sind das stärkste Argument für „dieselbe Person",
das eine E-Mail-Adresse überhaupt tragen kann.

**Warum fail-closed bei unverifiziert:** ein unverifiziertes Konto belegt
nichts. Es kann ein Tippfehler sein, eine fremde Adresse, ein abgebrochener
Signup. Zwei Konten zu verschmelzen ist **unumkehrbar** — die Inhalte des
einen erscheinen danach unter der Identität des anderen. Ein 500 beim
Migrieren ist ein Wiederholungsversuch; eine falsche Verschmelzung ist ein
Datenschutzvorfall. (Dieselbe Abwägung wie bei `isNameReservedInDb`.)

**Was beim Verschmelzen geschieht**

- Das **`account`-Konto gewinnt**: sein Passwort, seine `prefs`, sein
  `account_handles`-Eintrag bleiben. Es ist die Identität, mit der der Mensch
  sich heute schon anmeldet.
- Für das comments-Konto wird **kein** neues Konto angelegt. Seine alte Id
  landet in der Mapping-Tabelle und zeigt auf die `account`-Id.
- Der Anzeigename des comments-Kontos wird NICHT übernommen (er stünde sonst
  plötzlich über fremden Beiträgen). Abweichungen kommen auf die
  Einzelfall-Liste.

### 3.4 Passwort-Hashes

Vor Phase 1 zu klären, wie schon vor AH-1: **welche Hash-Verfahren die
Bestandskonten der comments-Instanz tragen** und ob die 1.9.6 den passenden
Endpunkt hat (`createBcryptUser`, `createArgon2User`, `createScryptUser`, …).
Bei AH-1 war die Antwort trivial, weil beide Konten OTP-only waren; hier ist
sie offen. Konten ohne Passwort (OTP-only, erkennbar an fehlendem
`passwordUpdate`) brauchen gar nichts — sie melden sich mit einem Code an.

### 3.5 Die Mapping-Tabelle

Eine JSON-Datei `{ "<alteId>": "<neueId>" }`, erzeugt in Phase „Nutzer",
**bevor** irgendeine Row kopiert wird. Eigenschaften, die nicht verhandelbar
sind:

- **Sie enthält Personenbezug** (sie verkettet zwei Konten). Sie gehört in den
  Secrets-Ordner neben die Migrations-Envs, **nie** ins Repo, und wird nach
  der Beobachtungszeit gelöscht.
- **Sie ist der Idempotenz-Anker.** Jeder Wiederanlauf liest sie zuerst; ein
  Konto, das dort steht, wird nicht erneut angelegt. Ohne sie ist ein
  abgebrochener Lauf nicht fortsetzbar.
- Sie enthält **auch die Identitäts-Einträge** (`id -> id`). Ein Skript, das
  nur die Ausnahmen kennt, muss raten, ob ein fehlender Eintrag „unverändert"
  oder „noch nicht gelaufen" heißt.

### 3.6 Labels und Mitgliedschaft (A5)

Die Labels der comments-Instanz werden **nicht kopiert**. Sie bedeuten dort
etwas anderes: `label:admin` / `label:moderator` sind INSTANZ-Rollen des
Silos. Im Pool wäre ein `label:admin` eine offene Tür zu jeder fremden
Community — `grantCommunityLabel` verweigert solche Labels ausdrücklich.

Stattdessen bekommt jedes migrierte Konto:

1. eine Zeile in **`community_members`** der neuen Community (das ist die
   Wahrheit seit A5; ein Label ohne Zeile ist der Zustand, den A5 abgeschafft
   hat), mit einer Rolle, die aus dem alten Instanz-Label abgeleitet wird —
   Vorschlag: `label:admin` ⇒ `admin`, `label:moderator` ⇒ `moderator`, sonst
   `viewer`; genau EIN Konto wird `owner` (§ 9, Entscheidung 3);
2. das Site-Label **`Role.label(<communities.$id>)`** über
   `grantCommunityLabel` — oder gar nicht, denn
   `core/server/middleware/06.community-label.ts` vergibt es beim ersten
   Besuch selbst und idempotent. **Empfehlung: trotzdem im Skript vergeben.**
   Ohne Label sieht ein Mitglied beim allerersten Seitenaufruf für den Bruchteil
   des Requests, in dem die Middleware noch nicht geschrieben hat, eine leere
   Community — das ist genau die Sorte Fehler, die wie ein Datenverlust aussieht.

### 3.7 Handles (AH-7)

Im comments-Projekt liegen **beide** Register: `community_handles`
(system-029) und `account_handles` (system-031, global eindeutig auf
`handleLower`). Beide wandern, und die Kollisionsregel ist bereits
entschieden — es ist dieselbe wie bei der AH-7-Übernahme:

- **`account_handles`:** ist `handleLower` im Zielprojekt schon vergeben,
  bekommt der Zuziehende **KEINEN** Eintrag und wählt beim nächsten Öffnen von
  `/profile` selbst. Kein `@david2`. Der Grund steht in AH-7: eine automatische
  Umbenennung präsentiert einem Menschen einen Namen, den er nie gewählt hat.
- **`community_handles`:** wandert vollständig mit — inklusive der
  Historien-Zeilen (`status: 'former'`). Sie sind der Lese-Fallback der
  Auflösungs-Kette; ohne sie zeigen alte Erwähnungen in alten comments-
  Beiträgen ins Leere.
- Der **Preis ist derselbe, den AH-7 schon benennt** und der hier ein zweites
  Mal fällig wird: gehörte `@name` in der comments-Community historisch
  jemand anderem als dem globalen Gewinner, zeigt ein Alt-Beitrag nach dem
  Umzug auf den Gewinner. Klein gehalten, weil die comments-Community
  überschaubar ist — messen in Phase 1.

---

## 4 · Daten-Migration

### 4.1 Reihenfolge

1. **Community-Row im Control Plane** (§ 7.1) — erst danach existieren die
   zwei Schlüssel, die alles andere braucht.
2. **Nutzer** (§ 3) — Row-Permissions zeigen auf User-Ids; eine Zeile, deren
   `read("user:…")` ins Leere zeigt, ist unsichtbar. Dieselbe Reihenfolge-Regel
   wie in AH-1.
3. **Rows** tabellenweise, mit `Query.limit`-Paginierung.
4. **Buckets + Dateien.**
5. **Register** (`community_members`, Labels, Handles).

### 4.2 Der Stempel — und die Falle mit den zwei Schlüsseln

**Eine Community hat ZWEI Schlüssel, und sie werden an verschiedenen Stellen
gebraucht. Das ist die teuerste Einzelheit dieses ganzen Plans.**

| Wofür | Welcher Wert | Beleg |
| --- | --- | --- |
| Spalte `communityId` in jeder Datenzeile | `communities.**tenantId**` (`t-…`) | `scopeRowFor()` in `packages/core/server/utils/tenant.ts:38` — *„die SPALTE heißt communityId; der Kontext-WERT bleibt tenant.tenantId"* |
| `Role.label(...)`, `read("label:…")` | `communities.**$id**` | `tenantRowPermissionsFor` in `packages/core/server/utils/tenantRowPermissions.ts` — *„Label-Schlüssel = die communityId (= tenants.\$id) … Label und Filter identifizieren denselben Tenant über verschiedene Schlüssel"* |
| `notifications.communityId` | `communities.tenantId` (`t-…`) | CLAUDE.md, C15/F43 |
| `community_members`, `community_branding` (rowId) | `communities.$id` | CLAUDE.md, A5 / D6 |

Ein Skript, das hier einen Wert verwechselt, erzeugt keinen Fehler — es
erzeugt Zeilen, die `rowBelongsToTenant` fail-closed als FREMD einstuft. Die
Migration liefe grün durch, und die Community wäre danach leer. Deshalb:

- Die zwei Werte werden im Skript als **zwei verschieden benannte Konstanten**
  geführt (`communityRowId` und `communityScopeValue`), nie als eine Variable
  „communityId".
- Die Serien-Probe (§ 8.2) liest nach dem Lauf **eine echte Zeile über den
  echten Kundenpfad** (SSR auf comments.pukalani.app), nicht über den
  Admin-Client. Nur dieser Weg fährt durch Filter UND Permissions.

### 4.3 Row-Permissions umschreiben

Der Silo kennt zwei Muster, die im Pool anders aussehen:

| Silo heute | Pool danach | Warum |
| --- | --- | --- |
| `read(any)` auf öffentlichen Kommentaren (008) | **bleibt `read(any)`** — sofern die Community `audience: 'public'` ist | `tenantReadRolesFor` gibt bei `read:'public'` + öffentlicher Community genau `Role.any()` zurück |
| `read(users)` für mitglieder-interne Zeilen | **`read(label:<communities.$id>)`** | im Silo ist das Projekt die Grenze, im Pool das Label |
| `read(label:'admin')` / `read(label:'moderator')` (Moderations-Zeilen, z. B. `reports`) | **`read(label:mod<communities.$id>)`** | `communityModeratorLabel()`; ein globales Betreiber-Label wäre im Pool eine offene Tür |
| `update/delete(user:<id>)` | **unverändert**, wenn die User-Id behalten wurde (§ 3.2) | sonst über die Mapping-Tabelle |

Das Umschreiben ist **rein mechanisch und pure rechenbar** — es gehört als
Funktion mit Unit-Tests ins Skript, nicht als `replace()` in einer Schleife.
Gegenprobe: `packages/control/scripts/verify-audience-flip.mjs` liest mit einem
echten GAST-Client an unserem Code vorbei und beantwortet die einzige Frage,
die zählt („sieht ein Fremder das, was er sehen soll — und nur das").

### 4.4 `guest_authors` — der Sonderfall

**Empfehlung: NICHT migrieren.** Die Tabelle ist seit F18 (2026-08-02) tot:
die Erhebung ist ersatzlos gefallen, weil sie im ganzen Repo **keine einzige
Lese-Stelle** hatte — keine Moderationsansicht, keinen Export, kein Skript.
`guestAuthorPrune.ts` räumt die Alt-Zeilen nach 90 Tagen ab.

Diese Zeilen enthalten E-Mail-Adressen und IP-Hashes von Menschen ohne Konto.
Sie in ein NEUES Projekt zu kopieren hieße, personenbezogene Daten ohne Zweck
und ohne Lese-Stelle in einen neuen Verarbeitungskontext zu tragen — genau
das Muster, das EMBED.md § F18 als „unter DSGVO das schlechteste" benennt.
Sie bleiben im eingefrorenen Projekt und sterben mit ihm.

Die **Kommentare** der Gäste bleiben selbstverständlich erhalten: sie tragen
`authorKind: 'guest'`, `authorId: ''` und den frei gewählten Anzeigenamen in
der `comments`-Zeile selbst — von `guest_authors` hängt nichts davon ab.

Vor Phase 3 zu messen: wie viele Zeilen dort überhaupt noch stehen. Ist die
Antwort 0, entfällt die Entscheidung.

### 4.5 Buckets und Dateien

`avatars`, `media`, `event-covers`, `ticket-files`, `gdpr-exports` — kopiert
mit ihren Permissions, Ids beibehalten. Zwei Lektionen aus AH-1 gelten
unverändert: `getFileDownload` des Server-SDK liefert keinen Buffer-tauglichen
Typ (**Kopie per REST**), und `avatars` + `gdpr-exports` werden von **keinem**
Migrations-Script angelegt (offener Krümel aus AH-1) — sie müssen im Zielprojekt
existieren, bevor kopiert wird.

Zieht die Community in ein Projekt, das die Buckets bereits hat, ist das
unkritisch: Dateien tragen eigene Ids, es gibt keine Namenskollision.

---

## 5 · Embed

### 5.1 Was heute wirkt

Es gibt zwei Quellen für `frame-ancestors`, kombiniert in
`packages/comments/server/plugins/embed-frame.ts`:

- **statisch** aus der App-Config (`allowedOrigins`) — im comments-Silo stehen
  dort **ausschließlich** `http://localhost:*` und `http://127.0.0.1:*`, also
  Dev- und E2E-Fälle. Keine Produktions-Domain.
- **dynamisch** aus der Tabelle **`embed_sites`**, gepflegt im Dashboard unter
  `/dashboard/embed`. Gelesen über `listEmbedSites()` mit
  `tenantDb(event, { as: 'operator' })`.

**Die echten Einbetter stehen also in der Datenbank, nicht in der Config.**
Wer heute einbettet, steht damit in keiner Datei dieses Repos und ist aus dem
Code **nicht** beantwortbar. → **Vor Phase 1 messen:** `embed_sites` der
comments-Instanz auslesen (Host, Label, targetTypes, active) und die Liste in
das Bau-Runbook eintragen. Sie ist zugleich die Empfänger-Liste für die
Wartungs-Mail und die Prüfliste nach dem Cutover.

### 5.2 Was pool-seitig schon existiert

Mehr, als man erwarten würde — und das ist die gute Nachricht dieses
Abschnitts:

- `embed_sites` trägt `communityId` seit **comments-015/016**; die Datentür
  scopet Liste, Anlage und Löschung. Der Unique-Index ist bereits
  `(communityId, host)`.
- `apps/platform/app/app.config.ts` schaltet das Widget **seit F37
  (2026-08-02, Davids Entscheidung) im Pool an**, samt `auth.embedSession` und
  `security.csrfOriginCheck`. Der dortige Kommentar hält fest, warum die
  CSRF-Härtung F32 den Embed-Fluss nicht trifft (er läuft same-origin gegen
  den Community-Host).
- Die Pflege macht der **Owner** über die Capability `community.embed`
  (vorher `system.manage` — ein Instanz-Label, das kein Kunde je trägt).

**Es gibt hier also keine Baulücke.** Die `embed_sites`-Zeilen wandern wie
jede andere Tabelle (§ 4.2), und der Owner der neuen Community sieht sie
danach unter `/dashboard/embed`.

### 5.3 Die eine echte Baulücke: Gast-Kommentare

`pukalani.comments.embed.guests` ist im Silo **an** und im Pool **bewusst
aus**. Und es ist ein **Bau-Schalter der ganzen App**, kein Schalter je
Community. Es gibt drei Wege, keiner ist gratis:

1. **Verlust akzeptieren** *(Empfehlung, § 9 Entscheidung 5)* — im Widget
   kommentieren danach nur Angemeldete. Der Login-Popup-Weg (E2, CHIPS) bleibt
   vollständig erhalten. Kosten: eine Fähigkeit, die heute live ist, fällt weg.
2. **Pool-weit anschalten** — betrifft dann JEDE Kunden-Community. Das ist
   eine Produktentscheidung mit Missbrauchs-, Moderations- und Quota-Folgen
   für Fremde und gehört nicht als Nebenwirkung einer Migration entschieden.
3. **Schalter je Community bauen** — technisch sauber (er gehört neben die
   `embed_sites`-Verwaltung), aber ein eigenes Paket: Feld, Route, UI,
   Rate-Limit-Betrachtung, Quota. Klar außerhalb von F3.

### 5.4 Der Widget-Host wechselt nicht

Für die Einbetter ändert sich **nichts**: `comments.pukalani.app` bleibt die
Widget-Domain, `embed.js` liegt weiter unter derselben URL (`packages/comments/public/embed.js`,
im Pool ausgeliefert von `apps/platform`). Weder das Script-Tag noch die
Web-Component noch die `data-target-id`-Konvention muss jemand anfassen.

Was sich ändert und geprüft gehört: das **partitionierte Session-Cookie**
heißt nach dem Projektwechsel `a_session_account` statt `a_session_comments`.
Angemeldete Widget-Nutzer sind damit einmalig abgemeldet — dieselbe einmalige
Abmeldung wie bei AH-1, nur an einer Stelle mehr sichtbar.

---

## 6 · Der E2E-Anker

**Belegte Behauptung: der Prod-Rückbau berührt die CI-E2E in keiner Zeile —
solange `apps/comments` als Code bestehen bleibt.**

`.github/workflows/e2e.yml` fährt vollständig gegen eine **Wegwerf-Instanz**:

| Schritt | Bezug |
| --- | --- |
| Stack starten | `docker compose` aus `ci/appwrite/`, Endpunkt `http://localhost:8080/v1` |
| Console-Setup | `scripts/ci/appwrite-setup.mjs --endpoint http://localhost:8080/v1 --app apps/comments` — legt Account, Team `ci-org`, Projekt, Key, Web-Platform `localhost` an und **schreibt `apps/comments/.env`** |
| Bootstrap + Seed | `pnpm --filter comments run bootstrap --seed` |
| 6 Live-Beweise | alle mit `--env-file=apps/comments/.env` |
| Playwright | `pnpm --filter comments exec playwright test`, `baseURL` = `PW_BASE_URL ?? http://localhost:3001`, `webServer.command: 'pnpm dev'` |

**Kein Schritt nennt `comments.pukalani.app`. Kein Schritt nennt das
Produktions-Projekt.** Die verwendete `.env` wird je Lauf neu erzeugt und ist
eine andere Datei als `apps/comments/.env.production` (die nur
`verify-schema-parity` liest).

### 6.1 Was sich trotzdem ändern muss

1. **`verify-schema-parity`**: `apps/comments/.env.production` verschwindet mit
   der Instanz. Der Eintrag `{ name: 'comments', … }` in `INSTANCES` fällt
   raus. Das Skript überspringt fehlende Dateien zwar sauber (Muster `photos`),
   aber ein Wächter, der dauerhaft „übersprungen" meldet, wird weggelesen.
2. **`verify-site-env`**: der `comments.pukalani.app`-Block fällt raus.
3. **`verify-tls.mjs`**: der Eintrag **bleibt**, aber die Notiz wechselt von
   „Silo-Kunde" auf „Pool-Community, von der Wildcard gedeckt". **Das Skript
   wird davon nicht rot**: es prüft SAN-Deckung und Restlaufzeit, nicht die
   Herkunfts-Lineage — und `*.pukalani.app` deckt `comments.pukalani.app` als
   Ein-Label-Name ab (`sanCovers`). Nach dem Stilllegen der Site liefert nginx
   dem Host den Default-vHost mit dem Wildcard aus, genau wie es der
   `help.pukalani.app`-Eintrag seit 2026-07-27 dokumentiert.
4. **`deploy.yml`**: die Diff-Basis (Zeile 157) liest die Prod-SHA von
   `comments.pukalani.app/api/health`. Der Aufruf funktioniert nach dem Umzug
   WEITER — `/api/health` ist host-frei (`00.tenant.ts` lässt genau diesen Pfad
   und `/_i18n/` vor der Mandanten-Auflösung durch) —, meldet dann aber die
   Build-SHA von `platform`. Das ist nicht falsch (ein Deploy, ein SHA), aber
   der Host bedeutet danach etwas anderes als der Kommentar behauptet.
   **Empfehlung: vor dem Rückbau auf `platform.pukalani.app` umstellen.** Das
   ist zugleich Hygiene für den eskalierten `gate:success/deploy:skipped`-Krümel.
5. **Die App-Schleifen in `deploy.yml`** (`for app in comments portfolio …`,
   `SITE[]`, `SLOT[]`): `comments` fällt raus. Danach baut die CI eine App
   weniger — spart Zeit und beseitigt einen der drei Kandidaten des
   OOM-/Starvation-Befunds vom Drei-App-Build.

### 6.2 Was die Gegenform betrifft

`apps/comments` bleibt eine **Single-Tenant-App ohne `pukalani.tenancy`**. Die
Beweise, die die Silo-Form brauchen (`read("users")` gegen
`read(label:<communityId>)` in `verify-presence-boundary`, `accountHandleAudience`,
`tenantRowPermissionsFor`), laufen unverändert weiter. Die Gegenform ist damit
im Code erhalten; verloren geht nur der PRODUKTIVE Silo-Beleg (§ 2.1), und
`apps/portfolio` trägt ihn ohnehin weiter.

---

## 7 · Cutover-Reihenfolge, je Schritt mit Rückweg

Grundprinzip aus AH-1, das hier genauso gilt: **der Rückweg ist die Env, nicht
der Code.** Und: was nach dem Schnitt in die neue Instanz geschrieben wird,
heilt keine Rücknahme — die Entscheidung gehört in die erste Stunde.

### Phase 0 · Messen (ohne Wirkung nach außen) — Aufwand **S**

Konten (gesamt / OTP-only / mit Passwort + Hash-Verfahren) · E-Mail-Schnitt-
menge mit `account` (getrennt nach beidseitig verifiziert / nicht) ·
Id-Schnittmenge · Rows je Tabelle · Dateien je Bucket · `embed_sites`-Zeilen ·
`guest_authors`-Restzeilen · Handle-Kollisionen gegen `account_handles` ·
Instanz-Labels (wer ist admin/moderator) · bezahlte Event-Tickets und
`billing_subscriptions` (Testmodus?) · aktive eigene Domain (control-036)?
Dazu `pnpm ops:site-env` als Bestandsaufnahme der Env-Schlüssel.

*Rückweg: entfällt (nur Lesen).*

### Phase 1 · Die Community anlegen — Aufwand **S**, aber mit einer Hürde

`comments` steht in **`RESERVED_SUBDOMAINS`** (`packages/control/schemas/tenant.ts`)
— und zwar auf der Zod-Ebene, die auch den **Betreiber-Weg** prüft:
`createTenantCreateSchema` refined `host` gegen `isReservedHost`. Zusätzlich
schlägt die Route in der Betreiber-Zusatzliste `reserved_names` (control-027)
nach. **`POST /api/control/tenants` weist `comments.pukalani.app` also ab.**
Das ist der Unterschied zu AH-5: `freelancer` stand nie auf einer Liste.

Zwei Wege, § 9 Entscheidung 2:

- **(a) Einmal-Skript** *(Empfehlung)* — legt die `communities`-Row mit dem
  Admin-Client direkt an, mit exakt der Feldmenge aus
  `packages/control/server/api/control/tenants/index.post.ts` (die Route
  schreibt bewusst ALLE Spalten explizit; das Skript übernimmt diese Liste und
  wird von einem Test gegen sie gehalten). Kein Deploy, und der Name ist
  keine Sekunde ungeschützt.
- **(b) Listen-Fenster** — `comments` aus beiden Listen nehmen, control
  deployen, anlegen, zurücknehmen, erneut deployen. Zwei Deploys an einer
  Sicherheitsliste, und AH-5 hat gezeigt, wie so eine Streichung am selben
  Abend zurückgenommen werden muss. Nur als Rückfall.

**`comments` bleibt danach dauerhaft auf der Sperrliste** — dieselbe Logik wie
bei `account`: der Name ist jetzt zusätzlich VERGEBEN, nicht statt gesperrt.
Der Kommentar in `tenant.ts` bekommt eine Zeile dazu.

Weiter in dieser Phase: Plan setzen (§ 9 Entscheidung 3), `audience` und
`openRegistration` (Entscheidung 7), Branding (`theme`/`variant`/`neutral`) aus
der alten Instanz übernehmen.

*Rückweg: `communities.status = 'disabled'` oder Row löschen. Solange kein
DNS/Env angefasst ist, merkt niemand etwas — comments.pukalani.app wird noch
von der eigenen Site bedient, die Wildcard-Site sieht den Host gar nicht.*

### Phase 2 · Schema-Gleichstand prüfen — Aufwand **S**

Das `account`-Projekt trägt bereits alle Layer, die `platform` montiert.
`apps/comments` montiert zwei mehr: **`billing`** und **`domains`**. `domains`
hat keine eigenen Tabellen (Pool-Fassung lebt in `onboarding`); `billing`
bringt `billing_customers`, `billing_subscriptions`, `stripe_settings` mit.
Werden diese Daten nicht übernommen (§ 9 Entscheidung 9), muss auch kein
Schema nachgezogen werden. `pnpm ops:schema-parity` läuft danach zur Kontrolle.

*Rückweg: additive Migrationen; ein zu viel angelegtes Feld schadet nicht.*

### Phase 3 · Nutzer — Aufwand **M**

§ 3, in dieser Reihenfolge: Id-Schnitt prüfen → Mapping-Tabelle schreiben →
Konten anlegen (Id behalten, Hash mitnehmen, `prefs` mitnehmen,
`emailVerification` mitnehmen) → Einzelfall-Liste an David → nach Freigabe die
Verschmelzungen eintragen.

*Rückweg: die angelegten Konten löschen. Sauber, solange noch keine Rows
existieren und noch niemand sich damit angemeldet hat.*

### Phase 4 · Rows, Dateien, Register — Aufwand **L**

Tabellenweise mit Paginierung, Ids behalten, `communityId` stempeln
(**`communities.tenantId`!**), Permissions umschreiben (§ 4.3), Mapping
anwenden. `guest_authors` bleibt zurück. Danach `community_members`, Labels,
Handles.

*Rückweg: alle Zeilen mit diesem `communityId` löschen — der Filter, der die
Community isoliert, ist zugleich der saubere Löschfilter. Das ist der letzte
Punkt, an dem der Rückweg noch billig ist.*

### Phase 5 · Delta + Schnitt — Aufwand **S**, aber das eigentliche Fenster

Zweiter Lauf für alles, was seit Phase 3/4 dazugekommen ist (AH-1 maß hier
0 / 0). Dann in dieser Reihenfolge:

1. **ploi-Site 389772 stilllegen** (Site deaktivieren oder nginx-Block
   entfernen) → der Host fällt in die Wildcard-Site `platform`.
2. **pm2** `commentspukalaniapp` stoppen und aus `pm2 save` entfernen; sonst
   holt `@reboot pm2 resurrect` ihn zurück und der tote Prozess belegt Port
   3001 (dieselbe Falle, die beim Control-Cutover `portfolio` erwischt hat).
3. `node scripts/ops/verify-tls.mjs` — muss GRÜN bleiben (§ 6.1 Punkt 3).
4. Serien-Probe (§ 8.2).

**DNS: nichts zu tun.** `comments.pukalani.app` zeigt schon auf dieselbe IP;
die Wildcard `*.pukalani.app` bedient den Host, sobald der exakte
`server_name` verschwunden ist. **TLS: NICHTS anfordern** — die Lineage-Falle
gilt unverändert; die Wildcard deckt den Host, und ein neuer Antrag auf der
falschen Site kostet 40 Minuten Ausfall für alle Kunden.

*Rückweg (teuer, aber vollständig): ploi-Site wieder aktivieren, pm2 starten.
Die alte Instanz hat weitergelebt und ist unverändert. Verloren ist nur, was
in der Zwischenzeit im Pool geschrieben wurde.*

### Phase 6 · Weiterleitungen und SEO — Aufwand **S**

Es gibt **keine** URL-Umleitung: derselbe Host, dieselben Pfade. Zu prüfen
sind nur die Stellen, an denen sich der Aufbau ändert:

- Die eigene Startseite fällt weg (§ 9 Entscheidung 8). `/` liefert die
  Community-Startseite. **Kein 301** — die URL bleibt gültig.
- `useLocaleSeoHead()` + `pukalani.seo.originFromRequest` sind in beiden Apps
  gesetzt; canonical/hreflang/og:url zeigen weiter auf den Community-Host.
- `og:image`: der Pool erzeugt je Community `/og/<key>.png` (Gate
  `pukalani.seo.tenantOgImage`) — sieht anders aus als vorher, ist aber gültig.
- Interne Doku + `apps/help`-Inhalte, die comments als Silo-Beispiel nennen.

*Rückweg: Textänderungen, jederzeit umkehrbar.*

### Phase 7 · CI und Wächter aufräumen — Aufwand **S**

`deploy.yml` (Diff-Basis auf `platform`, `comments` aus vier Schleifen und
zwei Tabellen), `verify-site-env`, `verify-schema-parity`, `verify-tls`-Notiz,
`ops/ecosystem-comments.config.cjs` löschen. `scripts/migrate.mjs` und
`check-manifests` bleiben unverändert — `apps/comments` existiert weiter und
soll weiter migrierbar sein (E2E!).

*Rückweg: Revert. Reiner Repo-Zustand.*

### Phase 8 · Secrets und Envs — Aufwand **S**

Server-`.env` von `comments.pukalani.app` **löschen, nicht überschreiben**.
Die beiden Appwrite-Keys des Projekts `comments` **widerrufen** —
insbesondere `NUXT_ONBOARDING_SERVICE_SECRET`, das Service-Geheimnis ins
Control Plane, das damit von einem öffentlichen Kunden-Host verschwindet.
Stripe-Keys der Instanz widerrufen. Plausible: entscheiden, ob die eigene Site
bleibt oder der Host in den Sammel-Filter wandert.

*Rückweg: keiner — deshalb erst nach der Beobachtungszeit.*

### Phase 9 · Projekt einfrieren, Menschen informieren — Aufwand **S**

Projekt `comments` bleibt **eingefroren, nicht gelöscht** (wie `pool` seit
AH-1). Beobachtungszeit vorschlagen: 14 Tage.

**Wartungs-Mail — Davids Regel, unverhandelbar: OHNE LINK.** Eine Mail, die
kurz nach einer Änderung zum Anmelden auffordert, ist formal von Phishing
nicht zu unterscheiden; der Name gehört genannt, nicht verlinkt. Inhalt:
„Du wurdest einmalig abgemeldet, bitte melde dich auf comments.pukalani.app
neu an. Dein Konto gilt jetzt auch für andere Pukalani-Communities."
Empfänger: die migrierten Konten **plus** die Betreiber der Seiten aus
`embed_sites` (§ 5.1) — für sie ändert sich nichts, aber ihre eingeloggten
Leser sind abgemeldet, und das sollen sie vorher wissen. `example.com`-Konten
ausnehmen (Resend blockt mit 550, AH-1-Lektion).

---

## 8 · Mengengerüst, Aufwand, Verifikation

### 8.1 Aufwand je Phase

| Phase | Was | Aufwand |
| --- | --- | --- |
| 0 | Messen | S |
| 1 | Community anlegen (inkl. Reserved-Hürde) | S |
| 2 | Schema-Gleichstand | S |
| 3 | Nutzer + Mapping + Einzelfälle | **M** |
| 4 | Rows, Dateien, Register | **L** |
| 5 | Delta + Schnitt (das Fenster) | S |
| 6 | SEO/Text | S |
| 7 | CI/Wächter | S |
| 8 | Secrets/Envs | S |
| 9 | Einfrieren + Mail | S |

Gesamt: **L bis XL**, in einem Stück fahrbar, wenn Phase 0–4 vorbereitet
sind. Das eigentliche Ausfall-Fenster (Phase 5) ist Minuten, nicht Stunden —
sofern Phase 4 vorher grün gelaufen ist.

**Mengen: alle vor Phase 1 zu messen.** Dieser Plan trägt bewusst keine
geschätzten Zahlen. Zum Vergleich, was bei AH-1 herauskam: 2 Nutzer, 87 Rows
über 37 Tabellen, 6 Buckets, 3 Dateien. Die comments-Instanz ist die älteste
lebende Instanz des Projekts und wird deutlich mehr tragen — wie viel mehr,
sagt nur die Messung.

### 8.2 Verifikations-Liste

**Serien-Probe** (drei Läufe hintereinander, wie bei AH-1/AH-3):

1. `https://comments.pukalani.app/` → 200, Community-Startseite mit Namen im
   SSR-HTML.
2. Ein bekannter alter Kommentar-Thread ist **als Gast** sichtbar (der Weg,
   der Filter UND Permissions durchläuft).
3. Anmeldung mit einem migrierten Bestandskonto (Passwort ODER Code).
4. Dasselbe Konto sieht unter `account.pukalani.app/communities` **zwei**
   Communities, wenn es vorher in beiden Welten existierte.
5. `/dashboard/embed` zeigt die migrierten `embed_sites`-Zeilen.
6. Das Widget auf einer der registrierten Fremdseiten lädt und zeigt die
   alten Kommentare (die Frame-Ancestors-CSP kommt aus der Registry).
7. Realtime: ein neuer Kommentar erscheint ohne Reload (Web-Platform
   `*.pukalani.app` deckt den Host — F45-Falle).
8. Ein FREMDER Mandanten-Host (`demo.pukalani.app`) sieht **keinen**
   comments-Inhalt, und umgekehrt.
9. Eine Benachrichtigung landet in der richtigen Glocke (C15-Stempel).

**Skripte**

- `node scripts/ops/verify-tls.mjs` — muss grün bleiben (§ 6.1).
- `pnpm ops:schema-parity` — nach dem Entfernen des comments-Eintrags.
- `pnpm ops:site-env` — keine Pflicht-Variable fehlt, comments-Block weg.
- `packages/comments/scripts/verify-pool-isolation.mjs` und
  `packages/control/scripts/verify-audience-flip.mjs` — gegen die
  **Ziel**-Instanz gefahren, nicht nur in CI.
- `packages/onboarding/scripts/verify-site-authz.mjs` (Abschnitt 10 deckt die
  A5-Beitritts-Auslöser ab) und `verify-control-host`.
- `packages/core/scripts/verify-presence-boundary.mjs` — die Presence-Grenze
  gilt jetzt auch für diese Community.
- Voller CI-Lauf (`e2e.yml`) **nach** dem Repo-Aufräumen aus Phase 7 — er ist
  der Beweis, dass der E2E-Anker den Rückbau überlebt hat.

### 8.3 Bewusst NICHT Teil von F3

- **`portfolio` bleibt ein Silo.** Eigenes Projekt, eigene Nutzer, eigene
  ploi-Site, eigene TLS-Lineage samt Kundendomain `pukalani.studio`. Es ist
  Davids eigene Site und ab jetzt der einzige produktive Silo-Beleg.
- **`control` / `admin`** — eigener Cutover (AH-4), eigene Auth-Welt, bleibt.
- **`photos`** — bleibt App ohne Deployment.
- **Ein Schalter „Gast-Kommentare" je Community** (§ 5.3, Weg 3).
- **Bezahlte Event-Tickets im Pool** — das ist F7/Connect.
- **Ein Selbstbedienungs-Weg „Silo → Pool"** als Produkt. Dieser Umzug ist
  eine einmalige Betreiber-Aktion; ihn zu einem Knopf zu machen wäre ein
  eigenes Projekt und ohne zweiten Fall nicht zu rechtfertigen.

---

## 9 · Offene Entscheidungen für David

Jede mit einer Empfehlung als erster Option (Regel aus OPEN-ITEMS § „So
arbeiten wir"). Antworten wandern nach der Abnahme sofort hierher, ins
DECISION-LOG und in die OPEN-ITEMS-Zeile.

1. **Zielbild.** *(Empfehlung: Option A — Pool-Community, `apps/comments`
   bleibt als Code.)* Alternativen: B (eigenes Deployment gegen `account` —
   baut faktisch `platform` nach), C (alles lassen — Horizont bleibt
   unvollendet).

2. **Anlege-Weg für den reservierten Host.** *(Empfehlung: Einmal-Skript mit
   Admin-Client, Feldliste an `tenants/index.post.ts` genagelt.)* Alternative:
   `comments` kurz aus beiden Sperrlisten nehmen + zwei control-Deploys.

3. **Plan und Owner der neuen Community.** *(Empfehlung: Plan `pro`, kein
   Stripe-Abo, `trialEndsAt` weit in der Zukunft; Owner = Davids Konto.)*
   Begründung: `pro` ist die einzige Stufe, auf der alle heute montierten
   Produkte sichtbar bleiben (events/courses sind pro-Gates), und ohne Abo
   griffe sonst die M13-Sperre und machte die Community nur-lesend.
   Alternative: `personal` (kostet events + courses).

4. **Zusammenführung bei gleicher E-Mail, aber nicht beidseitig verifiziert.**
   *(Empfehlung: fail-closed — nicht automatisch verschmelzen, Liste an David,
   Einzelentscheidung.)* Alternative: E-Mail-Gleichheit genügt (schneller,
   unumkehrbar falsch, wenn es doch zwei Menschen sind).

5. **Gast-Kommentare im Embed.** *(Empfehlung: Verlust akzeptieren — im Pool
   kommentieren im Widget nur Angemeldete.)* Alternativen: pool-weit
   anschalten (betrifft alle Kunden) · Schalter je Community bauen (eigenes
   Paket, nicht F3).

6. **`guest_authors`.** *(Empfehlung: nicht migrieren, im eingefrorenen
   Projekt zurücklassen.)* Alternative: mitnehmen — trüge PII ohne Lese-Stelle
   in ein neues Projekt.

7. **Öffentlichkeit und Registrierung der neuen Community.**
   *(Empfehlung: `audience: 'public'` + `openRegistration: true` — das ist das
   heutige Verhalten des Silos, und alles andere wäre eine unangekündigte
   Verschärfung für Bestandsleser.)* Alternative: `members` (Kommentare
   verschwinden für Gäste — bräche das Embed-Produkt).

8. **Die eigene Startseite.** *(Empfehlung: fallenlassen; der Host zeigt die
   Standard-Community-Startseite.)* Alternative: als Community-Startseite im
   `pages`-Layer nachbauen (S–M, aber genau die App-Seite-verdeckt-Layer-Seite,
   die die Produkt-Bilanz als Drift zählt).

9. **`billing`-Daten und bezahlte Event-Tickets.** *(Empfehlung: erst messen —
   ist alles Stripe-TESTMODUS, ersatzlos fallenlassen und im Runbook
   protokollieren.)* Alternative bei echten Daten: die Migration anhalten und
   F7/Connect abwarten. Diese Antwort kann erst nach Phase 0 fallen.

10. **Zeitfenster.** Wie bei AH-1 abzustimmen. Der Ausfall ist auf Phase 5
    beschränkt (Minuten), die einmalige Abmeldung betrifft alle Konten des
    Hosts einschließlich der im Widget angemeldeten Leser.

---

## 10 · Die drei Stellen, an denen dieser Umzug am ehesten schiefgeht

Zum Schluss und ohne Beschönigung — das hier gehört beim Bau an die Wand:

1. **Die zwei Community-Schlüssel** (§ 4.2). `communityId` als SPALTE trägt
   `communities.tenantId`, als LABEL `communities.$id`. Eine Verwechslung
   läuft fehlerfrei durch und liefert eine leere Community.
2. **Die Reihenfolge Nutzer-vor-Rows.** Row-Permissions sind Strings mit
   User-Ids darin. Wer Rows zuerst kopiert, erzeugt unsichtbare Zeilen, und
   „unsichtbar" sieht aus wie „verloren".
3. **Der Rückweg wird mit jeder Minute teurer.** Ab dem Moment, in dem
   comments.pukalani.app aus dem Pool bedient wird, entstehen dort Zeilen, die
   keine Rücknahme mitnimmt. Die Abbruch-Entscheidung gehört in die erste
   Stunde — dieselbe Regel, die schon im Account-Cutover steht.
