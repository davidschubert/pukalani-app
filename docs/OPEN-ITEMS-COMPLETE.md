# Erledigte Punkte (Archiv)


Das ist das **finale Archiv der erledigten offenen Punkte** — jeder Eintrag
steht hier vollständig, mit Begründung, Beweis und Datum, damit später
nachlesbar bleibt, warum etwas so gebaut wurde. **Es ist KEINE Arbeitsliste:**
was noch aussteht, steht ausschließlich in [OPEN-ITEMS.md](OPEN-ITEMS.md)
(Regel von David, 2026-07-30 — Erledigtes zieht sofort hierher um).

Diese Datei darf ausführlich sein: sie ist unser **Lern-Gedächtnis**. Wo etwas
nicht auf Anhieb funktionierte, steht am Ende des Eintrags eine Zeile
**Gelernt:** — was schiefging, warum, und welche Regel daraus wurde. Wer eine
ähnliche Aufgabe anfängt, liest zuerst diese Zeilen.

> **Zu den `F`-Nummern — sie sind ZWEIMAL vergeben worden** (festgestellt beim
> Gegenlesen am 2026-08-02, nicht rückwirkend umnummeriert):
>
> - **`F1`–`F19` hier im Archiv** sind Befund-Nummern aus den Audits ab dem
>   2026-07-31 (`F1` = leere Fehler-Beschreibungen, `F2` = doppelter
>   i18n-Schlüssel, `F3` = Kontolöschung im Control Plane …).
> - **`F1`, `F2`, `F3`, `F7`, `F15` in OPEN-ITEMS.md** sind etwas ganz anderes:
>   geparkte Produkt-Punkte, die beim Aufräumen der Liste am 2026-07-31 (Commit
>   `e7602015`) neu durchnummeriert wurden — `F1` heißt dort „Discussions als
>   eigenes Produkt".
>
> Umnummeriert wird **nicht**: beide Nummernkreise stehen in Commit-Meldungen
> und in Querverweisen, ein nachträglicher Umbau machte die unlesbar. Wer eine
> `F`-Nummer nachschlägt, prüft also zuerst, aus WELCHER Liste sie stammt.
> Ab `F20` ist die Nummerierung wieder eindeutig.

---

### Resend-Spam über die Registrierung: der Anzeigename war ein Mail-Relais ✅ 2026-10-27

**Ausgangslage:** Resend meldete am 2026-10-26 das Tageslimit; im Dashboard
standen Verifizierungs-Mails „Account Verification for Account" von
noreply@pukalani.app an Empfänger wie „Etsy User! Your item has been
successfully sold through our marketplace. https://a29.at/9hdF2k
<opfer@gmail.com>". Hergang (aus `_10_users`, `_10_tokens` und dem
App-Audit `audit_logs` des Projekts `account` rekonstruiert): ein Skript
rief `POST /api/auth/signup` der Pool-App im 20-s-Takt auf — `name` = der
Spamtext, `email` = eine fremde Adresse — und meldete sich danach per
`POST /api/auth/logout` wieder ab. Appwrite setzt den Namen in Kopf und Gruß
der Verifizierungs-Mail, unser Resend-Konto war damit ein Spam-Relais: 15
Probeläufe am 2026-10-25 (drei IPs, darunter ein verifiziertes Testkonto und
ein Versuch über `PUT /api/auth/profile` + `POST /api/auth/verification`),
209 Mails in der Nacht zum 2026-10-27 von einer IP (138.124.33.231). Der
Takt lag knapp unter unserem Limit von 5/min je IP — das einzige Fenster
der Middleware war eine Minute. Appwrites eigene Abuse-Limits greifen für
Admin-Key-Aufrufe nicht (der Kommentar in `05.rate-limit.ts` stimmt).

**Gebaut (Core, zwei Pakete + Aufräumen):**
1. **Anzeigename ist kein Nachrichtenfeld** — pure Regel
   `packages/core/shared/displayName.ts` (`displayNameProblem`: Link/Domain,
   `@`, Steuer- und Bidi-Zeichen, mehr als 80 Zeichen), EINE Zod-Fabrik
   `displayNameField()` in `schemas/auth.ts` für Registrierung, OTP-
   Registrierung UND Profil (`schemas/profile.ts` — der zweite Hebel aus den
   Probeläufen). Beweis `tests/displayName.test.ts`.
2. **Mail-Routen haben ein Stundenfenster und eine Notbremse** — für die vier
   Routen in `ALWAYS_LIMITED` (signup, otp, recovery, verification) zusätzlich
   20 je Stunde und IP und 60 je Stunde über ALLE IPs je Route
   (`auth.mail_route_breaker` einmal je Fenster im Log). Beweis
   `tests/rateLimitMailRoutes.test.ts`: die 21. Registrierung im 20-s-Takt
   bekommt 429, die 61. über 60 IPs ebenfalls.
3. **Cloudflare Turnstile als Bot-Beweis** an signup/otp/recovery
   (`server/utils/turnstile.ts`, `TurnstileWidget.vue`, Gate = beide Env-
   Variablen gesetzt, fail-closed bei Cloudflare-Ausfall). Ohne Schlüssel
   exakt das Verhalten von vorher; scharf schalten ist `TS1` in OPEN-ITEMS
   (Davids Cloudflare-Login). Rezept: `docs/runbooks/DEPLOYMENT.md`.
4. **Aufräumen** `scripts/ops/purge-spam-accounts.mjs` (Trockenlauf-Default,
   `--execute`, `--include-verified` für die zwei Testkonten des Angreifers;
   läuft auf app-prod mit der Site-`.env`, weil der Migrations-Key kein
   `users.read` hat).

**Bewusst nicht gebaut:** Honeypot-Feld und „unter 4 Sekunden abgelehnt" —
der Angreifer sprach die API direkt an, mit 20 s Abstand; beides träfe nur
Formular-Bots und kostete echte Nutzer. Eine strenge Same-Origin-Pflicht an
den Mail-Routen (Anfragen ohne `Origin`/`Sec-Fetch-Site` abweisen) ebenfalls
nicht: der Header ist frei setzbar, die bestehende `csrfOriginCheck`-
Middleware weist Browser-Cross-Site schon ab, und die Verify-Skripte rufen
die Routen ohne Browser.

**Gelernt:** (1) Jede Route, die eine Mail mit NUTZERTEXT auslöst, braucht
drei Dinge: eine Textregel (kein Link, keine Adresse), ein Fenster länger
als eine Minute und einen Deckel über alle IPs — ein Limit je IP allein wird
mit Adressrotation oder Geduld umgangen, und eine Minute ist für einen
Mail-Versand kein Fenster. (2) Die Nuxt-Seite ist bei 200ern blind
(`access_log off` je ploi-Site, pm2-out leer); die Wahrheit steht in der
Appwrite-Datenbank — `_<projekt>_tokens` trägt IP und User-Agent des
AUSLÖSERS (hier unser eigener Server mit dem Node-SDK, also der Weg über
unsere Route), das App-Audit `audit_logs` die IP des Menschen dahinter.
(3) Resends „To"-Spalte zeigt den Anzeigenamen — wer dort Text sieht, der
nicht wie ein Name aussieht, sucht den Namen, nicht die Adresse.

**Ausgangslage (prod, api.pukalani.app, Appwrite 2.6.1, beim Mail-/Standort-
Beweis nach dem Upgrade gefunden):** Davids Konto hat `mfa=1` mit
verifiziertem TOTP-Authenticator. Nach dem richtigen E-Mail-Code legte
`otp/verify.post.ts` die Session an (`factors: ["email"]`) und antwortete nur
`{ ok: true }`; Appwrite beantwortet auf dieser Session jeden Konto-Aufruf mit
`user_more_factors_required`, `/api/auth/me` sagt 401, der SSR-Guard hält den
Nutzer für abgemeldet und leitet auf `/de/login` — nach KORREKTEM Code wieder
das Login, ohne ein Wort. Kein Zusammenhang mit dem Upgrade: der Code-Weg
hatte nie eine MFA-Weiche, nur der Passwort-Login (`login.post.ts`, U15 Teil
4). Google kam durch, weil Appwrite `["email","oauth2"]` als zwei Faktoren
zählt.

**Gebaut (Core):** (1) `secondFactorPending(probe)` in `shared/mfa.ts` ist
jetzt DIE EINE Weiche — `login.post.ts` und `otp/verify.post.ts` rufen
dieselbe Funktion mit `account.get()` auf der frischen Session; Appwrite wird
GEFRAGT, nicht nachgerechnet. (2) `otp/verify` antwortet
`OtpVerifyResponse { ok, mfaRequired }` (`shared/types/auth-responses.ts`,
Handler-Annotation + `$fetch<OtpVerifyResponse>` — Nitro-Routentypen sind
aus) und protokolliert bei fehlendem Faktor noch KEIN `user.login`; die
Beitritts-Kette (A5/BS1) bleibt hinter der Weiche. (3) `OtpLoginForm.vue`
zeigt `AuthMfaChallengeForm`, der Erfolgspfad liegt einmal in `finishLogin()`
(wie im Passwort-Formular), „Abbrechen" führt zum E-Mail-Schritt zurück (der
Code ist mit der Session verbraucht). (4) Die Challenge-Route schrieb fest
`password+<mode>` ins Protokoll; jetzt `mfaLoginMethod(session.factors, mode)`
⇒ `otp+totp` bzw. `password+totp`. `register/code` rendert dasselbe
`AuthOtpLoginForm` gegen dieselbe Route (einziger Aufrufer) — mit erledigt.
Keine neuen Nutzertexte: die Challenge-Maske ist faktor-neutral formuliert.

**Beweis:** Unit (`tests/mfa.test.ts`, 7 neue Fälle: Probe wirft
`user_more_factors_required` ⇒ true, gelingt ⇒ false, Netz/500/null ⇒ false,
Probe genau einmal; Protokollname) — 1652 Core-Tests, Lint, Typecheck,
`check:i18n-keys` grün. HTTP (`scripts/verify-mfa.mjs`, neuer Abschnitt 10,
gegen den Worktree-Server :3021 + lokale Appwrite 2.6.1 + Mailpit): Code über
`/api/auth/otp` anfordern, Code aus der ECHTEN Mail (Mailpit-API), einlösen ⇒
`200 {mfaRequired:true}` + Cookie, `/me` 401, Challenge mit App-Code 200,
`/me` 200; Gegenprobe Konto ohne MFA ⇒ `mfaRequired:false` und sofort drin —
**48/48**; mit der alten Route (HEAD-Fassung eingespielt) **46/48**, rot genau
an der fehlenden Antwort. Klick-Beweis im Browser auf `/de/login/code` mit
einem frisch angelegten TOTP-Konto: Code-Eingabe ⇒ Zwei-Faktor-Maske ⇒
App-Code ⇒ Startseite mit Toast „Erfolgreich angemeldet", `/api/auth/me` 200.
Audit-Protokoll des Laufs: `otp+totp` (vorher stand dort auch für den Code-Weg
`password+totp`).

**Gelernt (drei Stück):** (1) **Eine Weiche, die in EINER Route lebt, ist
keine Weiche, sondern eine Ausnahme.** Die MFA-Prüfung stand seit U15 nur im
Passwort-Login; jeder weitere Weg, der eine Session anlegt (Code, später
OAuth, Magic-Link), musste sie selbst wissen — und der Code-Weg wusste sie
nicht. Jetzt steht sie in `shared/mfa.ts`, und ein neuer Session-Anleger ruft
sie oder fällt beim nächsten Lesen auf. (2) **Ein Server-Token ist KEIN
E-Mail-Code.** Die erste Fassung des Beweises kürzte den Postweg über
`users.createToken` ab — das Geheimnis ist Hex, unsere Route verlangt sechs
Ziffern, 400. Der Beweis geht seither den Weg des Menschen (Route → Mail →
Route); Mailpit macht das lokal möglich (`MAILPIT_URL`, Default :8025).
(3) **Ein TOTP-Code, der an Sekunde 52 berechnet wird, ist beim Klick schon
tot.** Der erste Klick-Versuch scheiterte an der Fenstergrenze, nicht am Code
— für Klick-Beweise den Code am Fensteranfang (`epoch % 30 < 12`) berechnen
und sofort eintragen. Nebenbei: die Worktree-Falle „`@shikijs/engine-
oniguruma` nicht verlinkt ⇒ jede Route 500" trifft auch `apps/comments`,
nicht nur `branding` (Symlink + Neustart, Memory).


### Die Host-Wache zählte Ziffern, statt den Port zu rechnen ✅ 2026-10-24

**Ausgangslage:** `00.host-header.ts` + `shared/requestHost.ts` schlossen den
Prod-Befund vom 2026-08-09 (`Host: evil.tld"><x>` ⇒ `TypeError: Invalid URL`
in `getRequestURL()` ⇒ **500 auf jeder Route jeder App**). Beim Nachfassen fiel
eine Lücke DERSELBEN Fehlerklasse auf: die Regex erlaubte `(:\d{1,5})?` —
fünf Ziffern sehen gültig aus, ein Port über **65535** ist aber keiner, und
`new URL()` wirft darauf. `pukalani.studio:99999` kam also durch die Wache und
ließ den Verbraucher eine Middleware später werfen.

**Behoben** mit `portIsBuildable()` (rechnen statt zählen) in
`packages/core/shared/requestHost.ts`; die vier Portfälle stehen jetzt auch in
der Gegenprobe-Schleife „deckt sich mit new URL()". Ohne den Fix sind 6 der 58
Tests rot.

**Beweis in drei Stufen.** (1) Unit: 6 rot ⇒ 58/58 grün; 1650 core-Tests, 19
Pakete, Lint, Typecheck grün. (2) Prod-Build portfolio, vorher/nachher am
SELBEN Build (Port-Prüfung im `.output` neutralisiert): `Host: …:99999` vorher
**500** auf `/`, `/de`, `/gibtsnicht`, `/api/health` mit 11 Stacktraces,
nachher **400** mit 0 — gesunder Verkehr identisch (`/`=200, `/de`=200,
`/de/`=301, `/gibtsnicht`=404, `robots.txt`/`sitemap.xml`=200, `:65535`=200,
`[::1]`=200). (3) **Live** (Build 79cdcdbc auf allen drei Hosts):
`X-Forwarded-Host: <host>:99999` vorher **500**, nachher **400** mit
`statusMessage: "Invalid host header"` — gesunde Proxy-Ketten (`a.tld,
pukalani.studio`) weiter 200.

**Gelernt (zwei Stück):** (1) **Eine Zeichen-Erlaubnisliste kann keine
ZAHLENgrenze ausdrücken.** Die Datei nennt `new URL()` ausdrücklich als
Maßstab, und genau an der einen Stelle, wo der Parser rechnet statt zu lesen,
wich die Regex ab. Wo eine Prüfung einen fremden Parser nachbaut, gehört die
Gegenprobe GEGEN diesen Parser in die Tests — sie stand sogar schon da, nur
ohne einen Port in ihrer Fallliste, und war damit grün über einem Loch.
(2) **nginx versteckt den `Host`-Vektor und war fast ein falsches Entwarnen.**
Live antwortete `Host: …:99999` schon vorher 400 — aber von **nginx selbst**
(`server: nginx`, HTML-Seite), das kaputte Host-Header gar nicht erst
durchlässt. Wer nur so misst, hält jede App-Wache für überflüssig. Erreichbar
war die Lücke über `X-Forwarded-Host`: diesen Header prüft nginx NICHT, und
@nuxtjs/i18n wie Nitros Fehler-Handler lesen ihn BEVORZUGT
(`xForwardedHost: true`). Der App-Beweis läuft deshalb über den Header, den
der Proxy nicht anfasst — und unterscheidet am `content-type` bzw. am Rumpf,
WER geantwortet hat.

---

### AW262: Appwrite 2.6.2 (Security-Release) auf dev und prod — Brotli CVE-2026-111497 geschlossen ✅ 2026-10-27

Anlass: 2.6.2 erschien am 2026-10-24 fünf Stunden nach dem Prod-Sprung auf
2.6.1 — `appwrite/base` 2.2.7 mit `brotli-libs` 1.2.1-r0 (Out-of-bounds-Write
im Decoder; Appwrites ausgehender HTTP-Client dekodiert `br`), dazu Härtung an
Keys/Realtime/Storage, neu `_APP_MEMORY_LIMIT` (512M), `_APP_JOBS_SECRET` darf
nicht leer sein, **kein Schema**. CI seit 2026-10-27 (Cloud-Sitzung), dev und
prod am selben Tag von Davids Terminal (Auftrag „erst dev, dann prod").

Beweise: dev (OrbStack, 20:51–20:56 UTC) Werkzeug 23,1 s, `migrate` 1,6 s,
`health/version` 2.6.2, Brotli 1.2.1-r0, PHP 8.5.12, keepAlive 367 `false`,
`doctor` 🟢 jobs, Health/DB/Cache/Storage/Time `pass`, Mail-OTP über Mailpit
`success`, `pnpm -r test` 27 Pakete / 7644 grün, Playwright `apps/comments`
16/16. Prod (`ops/appwrite-upgrade-2.6.2.sh` per ssh, 21:09–21:12 UTC):
Dump 22,4 MB / 870 Tabellen, Werkzeug 28,1 s, `migrate` 19,6 s (253 „already
exists", 0 Fehler), **Aufruf bis Beweise 81 s**; danach 0 Worker-/Realtime-
Fehler, 0 API-5xx, elf Hosts `ok:true` (www 301), SSR 200, Realtime 101
(`--http1.1`), `verify-tls` 6/6, `schema-parity` 69/42/41/42, Health je
Projekt `pass`. Mail-Beweis nach Leerlauf (2026-10-28 00:39 UTC): Probe-Nutzer
per Gast-OTP-Token an `delivered@resend.dev`, Worker `mail.template otp ·
mail.status success` in 1,67 s, Nutzer per Runtime-Key der Site wieder gelöscht
(204, Gegenprobe 404).
Runbook: [APPWRITE-2-6-UPGRADE.md](runbooks/APPWRITE-2-6-UPGRADE.md).

**Gelernt:** (1) `migrate` ist nach einem Patch-Release NICHT „nichts zu tun":
V25 läuft idempotent erneut durch und schreibt hunderte gelbe „already
exists"-Zeilen — die Zahl zählen, auf 0 echte Fehler prüfen, nicht erschrecken.
(2) Zwei Beweis-Zeilen des vorbereiteten Skripts bewiesen nichts: `apk info -v
PAKET` druckt die Beschreibung (richtig: `apk info -v | grep ^brotli-libs`),
und `php -r 'echo ini_get("memory_limit")'` zeigt die CLI-ini (128M), weil
Appwrite den Wert per `ini_set` in `app/init.php` setzt — Beweis ist die Env im
Container. Ein Beweis, der auf dev das Falsche zeigt, wird auf dev repariert,
bevor prod läuft. (3) Backticks in einer doppelt gequoteten `echo`-Zeile sind
Befehls-Substitution — die „Erklärung" `\`apk info -v <pkg>\`` warf auf prod
einen Syntaxfehler ins Log (harmlos, aber hässlich). (4) Der HAUPT-Checkout
hat ein veraltetes `node_modules` (`vitest` in brand, `mmdb-lib` in core
fehlen ⇒ jede Dev-Route 500): Beweise im frisch installierten Worktree fahren,
Dev-Server vor Playwright selbst starten. (5) Die Migrations-Keys haben
keinen `users.*`-Scope; der Mail-Beweis per Probe-Nutzer läuft mit dem
RUNTIME-Key der Site auf dem App-Server (per `ssh`, Key bleibt dort), die
`userId` selbst gewählt, Adresse `delivered@resend.dev`.

---

### AW22: Appwrite 2.6.1 auf dev, CI und prod — PHP 8.5.12 gegen die PHP-RCE, der 2.2-Sprung mit drin ✅ 2026-10-24

Anlass: das PHP-Notfall-Release vom 2026-10-21 (CVE-2026-109618/-109619,
unauthentifizierte RCE in den Web-SAPIs). Die Ploi-Server waren am 2026-10-23
gepatcht, appwrite-prod lief noch auf 2.0.0 mit PHP 8.5.9; der Sprung auf 2.2
(AW22) wartete seit 2026-09-14 auf ein Fenster. Appwrite 2.6.1 (gleicher Tag)
bringt PHP 8.5.12 und nennt sich selbst „precautionary" (Swoole, kein FPM) —
Ziel wurde deshalb 2.6.1 statt 2.2, ein Fenster für alles (DECISION-LOG
2026-10-23). Reihenfolge wie immer: Release-Notes 2.3–2.6.1 → dev → Runbook →
CI-Ableitung → Davids „ja, jetzt" (2026-10-24) → prod.

Beweise: dev `health/version` 2.6.1, PHP 8.5.12, Migration 13 s, Mail über den
gepatchten Worker, Realtime 101, Unit + Playwright 16/16 funktional grün;
prod (Skript `ops/appwrite-upgrade-2.6.sh`, Lauf durch die Elternsitzung)
Werkzeug-Aufruf bis Beweise **71 s**, Dump 22,2 MB / 800 Tabellen, Migration
16,6 s, alle zwölf Hosts `/api/health ok:true`, Zertifikat bis 2027-01-22,
`verify-tls` 6/6, `schema-parity` 69/42/41/39, OTP-Mail nach Leerlauf 1,61 s
`success`, Session-IP = Davids Mac (72.234.42.6, Hawaii), nicht der
Web-Server; CI-E2E auf der 2.6.1-Wegwerf-Instanz 16/16, F19 9/9. Runbook: [APPWRITE-2-6-UPGRADE.md](runbooks/APPWRITE-2-6-UPGRADE.md).

**Gelernt:** (1) Seit 2.4 ist die Client-IP der RECHTESTE nicht vertraute
`X-Forwarded-For`-Hop — mit unserer Kette (Nuxt setzt XFF, Traefik hängt die
Nuxt-IP an) stünde jede Prod-Session wieder auf dem Web-Server; die Nuxt-IP
gehört in `_APP_TRUSTED_PROXIES` (auf dev mit nachgestellter Kette gemessen,
Fix ebenso). (2) Das Upgrade-Werkzeug lädt seit 2.5 die Override MIT und löst
relative Mount-Pfade im eigenen Container auf — „Failed to start containers";
absolute Host-Pfade, und es läuft in 20 s durch. Die Override muss damit VOR
dem Werkzeug stimmen, das Gegenteil der 2.0-Regel. (3) Realtime-Handshakes
per `curl` nur mit `--http1.1` — über HTTP/2 antwortet Swoole 400, das sieht
aus wie ein Ausfall. (4) Executor 1.1.2 trägt weiter PHP 8.5.6; nur internes
Netz, keine Functions — notiert, nicht gelöst.

---

### SEO-Alternates: der Wächter gegen das blinde Leeren steht jetzt im Kern ✅ 2026-09-10

**Was:** Nachtrag zu F60. Der Kern-Vertrag `useSeoHiddenLocales()` (aus BI1 I3)
ist ein APP-WEITER State, und sein Kopfkommentar verlangte von jeder Seite, ihn
in `onBeforeRouteLeave` UND `onUnmounted` zu LEEREN. Das ist falsch: beim
Wechsel im Browser wird zuerst die NEUE Seite aufgebaut — sie schreibt ihren
Wert — und erst danach die alte abgeräumt. Das blinde Leeren löscht damit genau
den frischen Eintrag der neuen Seite. Der `pages`-Layer hatte den Fix seit F60
je Seite; die drei `insights`-Seiten (Beitrag, Duell, Ranking) hatten ihn nicht.

**Wie:** Die Absicherung liegt jetzt EINMAL im Kern statt in jeder Seite.
`useSeoHiddenLocales(quelle)` ist die neue Seiten-Seite: sie nimmt einen Getter
oder Ref, kopiert die Liste beim Schreiben (damit die Identität wirklich ihr
gehört) und räumt im `onUnmounted` nur auf, wenn im State noch GENAU DAS
Array-Objekt liegt, das dieser Aufruf hineingelegt hat. Der Kopf liest über
`useSeoHiddenLocalesState()` — ein `readonly` Ref, damit niemand am Wächter
vorbei schreiben kann. `onBeforeRouteLeave` fällt bewusst weg: mit dem
Identitätsvergleich braucht es den Haken nicht mehr, und er feuert, BEVOR
feststeht, dass die Navigation stattfindet (ein abbrechender Guard räumte sonst
die Meldung der Seite weg, auf der man bleibt). Alle vier Aufrufstellen sind
umgestellt.

**Beweis:** Erst der Fehler, dann der Fix, mit demselben Klick. `branding` lokal,
zweisprachiger Insights-Beitrag → einsprachige Rechtsseite `/terms` (client-seitig,
per Marker geprüft): VORHER meldete der Kopf `hreflang="en"` und `en-US` auf einen
Text, den es auf Englisch nicht gibt — der Direktaufruf derselben Seite meldete
korrekt nur `x-default`, `de`, `de-DE`. NACHHER stimmen beide überein. Gegenrichtung
(`/terms` → Beitrag) liefert wieder alle fünf. Dieselben zwei Richtungen im
`pages`-Layer auf `demo.localhost` (platform) nachgeklickt. Dazu Typecheck von
`branding`, `portfolio`, `control`, `platform`, `pnpm -r lint`, `pnpm -r test`.

**Gelernt:** **Ein app-weiter State braucht einen Besitzer, keine Disziplin.**
Der ursprüngliche Vertrag war nicht falsch AUFGESCHRIEBEN, er war falsch
GESCHNITTEN: er legte das Aufräumen in die Hand jeder Seite und beschrieb dabei
eine Reihenfolge, die es im Browser nicht gibt. Vier Aufrufstellen, drei davon
mit demselben Fehler — das ist das Muster, an dem eine Sicherung in die
Schnittstelle gehört statt in die Anleitung (dieselbe Lehre wie beim
`tableCacheNudge` der Migrationen). Und: **SSR sieht nichts davon.** Der Fehler
lebt ausschließlich in der Client-Navigation; Unit-Tests, Typecheck und Lint
finden ihn nicht, nur der Klick.

---

### F60 — Mehrsprachige Betreiber-Seiten: der Fallback zeigt und sagt, was er zeigt ✅ 2026-09-10

**Was:** Der geparkte Punkt F60 versprach „je Sprache eine Fassung" nach dem
Muster der Kategorie-Übersetzungen. Die Analyse vor Baubeginn zeigte, dass der
`pages`-Layer das **seit `pages-001`** hat, und zwar in der stärkeren Form: eine
Zeile je `slug` × `locale` (Unique-Index `uq_slug_locale`), `body` als
MEDIUMTEXT, Titel/Text/Veröffentlicht-Status je Fassung, EN/DE-Reiter im Editor,
sprachgenaue öffentliche Auflösung samt Microcache. **Keine Ablage-Entscheidung,
keine Migration.** Gebaut wurden die vier Lücken DRUMHERUM (Davids vier
Entscheidungen, DECISION-LOG 2026-09-10; Plan:
[archiv/F60-MEHRSPRACHIGE-SEITEN.md](archiv/F60-MEHRSPRACHIGE-SEITEN.md)):

1. **Der stumme Fallback spricht.** Eine nur auf Deutsch gepflegte Seite kam
   unter dem englischen Pfad mit `lang="en"` heraus, und `useLocaleHead` bewarb
   weiterhin ein `hreflang="en"`-Alternate, hinter dem derselbe deutsche Text
   stand — bei Impressum und Datenschutz der unangenehmste Fall. Jetzt: eine
   Zeile für den Leser („Diese Seite gibt es noch nicht auf Englisch — angezeigt
   wird die Fassung auf Deutsch."), `lang` am TEXT (Überschrift und Rumpf, nicht
   am Hinweis — der steht in der Sprache des Lesers), und Alternate-Adressen nur
   noch für Sprachen, die es **veröffentlicht** gibt. 404 in der fehlenden
   Sprache war die verworfene Alternative: Rechtstexte müssen erreichbar bleiben.
2. **Der Editor zeigt, was FEHLT:** je App-Sprache ein Kürzel (grün
   veröffentlicht · grau Entwurf · umrandet fehlt), und die Reiter kommen aus der
   i18n-Config statt aus `['en','de']` — das Datenmodell konnte immer beliebige
   Sprachen, dieser Bildschirm nicht.
3. **KI-Übersetzungsvorschlag** nach dem Muster des Kategorie-Vorschlags:
   `POST /api/pages/translate` **speichert nichts**, zwei Produkt-Gates
   (`pages` + `ai`), Kill-Switch (503 ohne Schlüssel, Knopf erscheint dann gar
   nicht), IP-Drossel `pages:translate`, ZDR fail-closed
   (`zdr: true, dataCollection: 'deny', allowFallbacks: false` — anders als bei
   den Kategorien geht hier ein RECHTSTEXT an den Anbieter), Deckel 12.000
   Zeichen mit klarer Absage statt Halbergebnis.

**Beweise:** `packages/pages/scripts/verify-page-languages.mjs` **23/23** gegen
zwei Dev-Server aus dem Worktree (Fallback, Hinweis, `lang`, `hreflang` UND
`og:locale:alternate`, drei Gegenproben: englische Fassung dazu ⇒ Hinweis weg +
Adressen zurück · Fassung auf Entwurf ⇒ beides wieder weg · Nachbarseite und
Startseite behalten ihre Adressen) · Unit: `pages/tests/pageLocales.test.ts` ·
Typecheck grün in ALLEN vier Apps mit dem Layer (platform, portfolio, control,
branding) · `check:i18n-keys`, `check:manifests`, `check:bilanz` grün ·
Klick-Beweis hinter Login auf einer Wegwerf-Community: Sprach-Kürzel gelesen
(`en:missing`/`de:draft`), deutsche Fassung veröffentlicht, danach auf dem
englischen Pfad Hinweis + `lang="de"` + nur deutsche Adressen im Browser
gemessen, dazu beide Richtungen einer CLIENT-Navigation (einsprachig ↔
zweisprachig ↔ Startseite) — genau dort steckte der Fehler unter Gelernt (3) ·
Kunden-Hilfe in beiden Sprachen ergänzt.

**Gelernt:** (1) **Ein geparkter Punkt beschreibt den Stand vom Tag seiner
Aufnahme, nicht den von heute.** F60 stand mit „Aufwand M — Tage" in der Liste;
die Hälfte war längst gebaut. Vor der ersten Frage an David gehört die
Ausgangslage im CODE nachgelesen — sonst führt man eine Entscheidungsrunde über
eine Ablage, die es schon gibt. (2) **Doppelte Arbeit erkennt man erst beim
Rebase, und dann gilt Davids Regel.** Ein eigener Kern-Vertrag für die
Alternate-Adressen war fertig und getestet, als der Rebase zeigte, dass eine
Nachbarsitzung am selben Tag für BI1 I3 denselben Mechanismus gebaut hatte
(`useSeoHiddenLocales()` + `core/shared/seoAlternates.ts`). Der EIGENE Commit
fiel; die fremde Fassung kann mehr (räumt auch `og:locale:alternate` mit) und
entscheidet bei `x-default` besser (es bleibt — keine Sprachzusage, sondern der
Rückfall, den die Seite ohnehin zeigt). Der Preis war eine Stunde; zwei Wege für
dieselbe Sache hätten dauerhaft mehr gekostet. (3) **Und der übernommene
Vertrag hatte einen Fehler, den nur der Klick-Beweis findet.** Der fremde State
ist app-weit; sein Kopf verlangt, dass die Seite ihn in `onBeforeRouteLeave` und
`onUnmounted` LEERT. Beim Wechsel im Browser wird aber zuerst die NEUE Seite
aufgebaut — sie schreibt ihren Wert — und erst danach die alte abgeräumt: das
blinde Leeren löscht genau den frischen Eintrag. Gemessen auf dem Weg zurück von
einer zweisprachigen Seite auf eine einsprachige: der Hinweis stand da, der Kopf
bewarb weiter `hreflang="en"`. Die Gegenrichtung fällt NICHT auf, weil dort beide
Seiten denselben Wert schreiben — und SSR sieht davon nichts, weil jeder Request
einen frischen State hat. Die Seite räumt jetzt nur auf, wenn im State noch genau
DAS Array-Objekt liegt, das sie hineingelegt hat (Identität, nicht Inhalt: zwei
Seiten dürfen dieselbe fehlende Sprache melden). Dass die insights-Seiten aus
BI1 I3 denselben Fehler haben könnten, war als eigene Aufgabe gemeldet — sie
hatten ihn, und die Absicherung steht seit demselben Tag EINMAL im Kern statt in
jeder Seite (eigener Eintrag oben).
(4) **Erwartungswerte im Beweis sind selbst eine Behauptung.** Drei Prüfungen
waren rot, weil sie `["de"]` erwarteten — nuxt-i18n schreibt je Sprache ZWEI
Alternates (`de` aus `code`, `de-DE` aus `language`) plus `x-default`. Der Code
stimmte, die Erwartung nicht. (5) **Die Port-Falle aus `.claude/rules/tests.md`
ist real und sieht wie ein Regressionsschaden aus:** der Platform-Dev-Server wich
beim Start still von 3021 auf **3000** aus (der Vorgänger hatte den Port noch
nicht freigegeben), die Messungen liefen gegen den sterbenden alten Prozess —
Symptom war ein `401 Invalid credentials` beim Login mit einem gerade erst
angelegten Konto, weil `login.post.ts` JEDEN Appwrite-Fehler bewusst zu einer
generischen 401 macht. Immer die `Local:`-Zeile im Dev-Log gegen den erwarteten
Port prüfen, nicht nur `lsof`. (6) **Beweis-Skripte räumten bisher nur ihre
EIGENEN Zeilen weg, nicht die vom Onboarding geseedeten** — in der lokalen
Dev-Datenbank lagen dadurch ~200 Seiten-Zeilen zu 69 Communities, von denen es
nur noch vier gibt. `verify-page-languages.mjs` merkt sich die Pool-Id der
Community (sie steht auf jeder gespeicherten `pages`-Zeile) und löscht am Ende
alle Seiten dieser Community. (7) **Ein frisch installierter Worktree kann ein
LÜCKENHAFTES Hoisting haben:** `pnpm install --frozen-lockfile` liess
`@shikijs/engine-oniguruma` aus `node_modules/.pnpm/node_modules` weg, und JEDE
SSR-Seite und API-Route antwortete 500 („Cannot find package") —
`pnpm install --frozen-lockfile --force` baut `node_modules` neu auf, ohne das
Lockfile anzufassen.

**Offen bei David (ein Gate, kein Blocker):** Der ZDR-Zwang ist lokal NICHT
gegen einen echten Anbieter gemessen — ohne hinterlegten Schlüssel antwortet die
Route 503, bevor sie das Modell ruft. Dieselbe Routing-Vorgabe läuft auf
branding.supply seit BI1 I2 produktiv (`BRAND_PROVIDER_ROUTING`), dort aber mit
einem anderen Modell. Der erste Klick auf Prod zeigt, ob ein ZDR-Anbieter das
auf `platform` eingestellte Modell bedient; tut er es nicht, ist die ehrliche
Absage sichtbar — und die Entscheidung, ob ZDR fällt oder das Modell wechselt,
gehört dann David.

### Sitzungs-Hygiene: 24 Video-Tipps gegen unseren Stand geprüft, Regeln je Phase, Ausgabe-Deckel gesetzt ✅ 2026-09-09

**Was:** Davids Auftrag, das Video „How To Never Run Out Of Codex and Claude
Usage Limits" (AI LABS, 2026-08-28) auszuwerten und in den Workflow zu
integrieren. Ergebnis: [referenz/SESSION-HYGIENE.md](referenz/SESSION-HYGIENE.md)
(jeder Tipp mit Befund übernommen / schon gebaut / bewusst nicht / Davids
Entscheidung, zehn Regeln, MCP-gegen-CLI-Vorschlag, Messwerte),
[WORKFLOW.md](referenz/WORKFLOW.md) Abschnitt „Sitzungsführung je Phase",
CLAUDE.md-Kurzabschnitt plus „Compact instructions" (offizieller Haken:
Claude Code liest diesen Block beim `/compact`), `.claude/settings.json`
mit `bashOutputMaxChars: 10000` (gilt nur für erfolgreiche Kommandos).
Neu als Regel: Korrektur per `/rewind` statt Nachricht, Sub-Agent falsch ⇒
neu spawnen, Befunde als EINE Liste, `/context` je Session, Playwright aus
dem Agenten mit `--reporter=dot`. Davids fünf Schalter stehen als `15 · SH1`
in OPEN-ITEMS.

**Gelernt:** (1) Der Test-Filter-Hook des Videos bringt bei uns nichts —
gemessen: Vitest 4 druckt ohne TTY bei Grün nur die Zusammenfassung (161
Tests = 498 Bytes); Regeln erst nach Messung übernehmen. (2) Einstellungs-
namen aus Videos nie übernehmen, ohne die Doku zu lesen: das Video sagt
„bash max output length", der Schlüssel heißt `bashOutputMaxChars` (die Env-
Variable `BASH_MAX_OUTPUT_LENGTH` wird ignoriert, sobald der Schlüssel
gesetzt ist). (3) YouTube-Transkripte gibt es ohne Proof-of-Origin-Token
nicht mehr (curl leer, yt-dlp 429, Transkript-Endpunkt 400 auch im
eingebauten Browser) — Rezept im Dokument: Player-`timedtext`-URL aus den
Performance-Einträgen des echten Chrome erneut mit `fmt=json3` abrufen.

---

### PS1 — Products-Seite auf branding.supply: Übersicht, fünf Produktseiten, deutsche Slugs, Nav-Aufklapper zurück ✅ 2026-09-09

**Auftrag (DECISION-LOG 2026-09-08, Nebenbefund BI1):** Übersicht plus je eine
Marketing-Seite pro Produkt, Namen aus den Manifesten, je Produkt Preis oder
Erstgespräch; der Nav-Punkt „Products" kehrt erst mit den Seiten zurück.
Konzept + sechs Entscheidungen: [PRODUCTS-SEITE.md](archiv/PRODUCTS-SEITE.md) §8
(DECISION-LOG 2026-09-09).

**Gebaut (Commits 0d3c9c26 Konzept · 7ec39e34 core · 83bff531 branding ·
68e31fee Fix):** `/products` + `/products/{brand-check,brand-foundation,
market-comparison,brand-design,brand-book-kit}` in `apps/branding` (die App
kennt alle ihre Produkte, ein Layer die anderen nicht — A14), deutsch
`/de/produkte/…` und `/de/produkte/marktvergleich` per `defineI18nRoute`
(`customRoutes: 'page'` ist der i18n-Default, `localePath('/products/…')` löst
je Sprache auf; `/de/products` leitet nuxt-i18n selbst per 302 auf
`/de/produkte`). Geteilter Rahmen `ProductPage.vue` + `ProductPriceLine.vue`,
Preis als EINE Konstante `apps/branding/app/utils/productPricing.ts` (149 € netto,
reist als `{price}` — steht in keiner Locale-Datei). Übersicht mit zwei
abgeblendeten „Kommt"-Karten (Experience, Monitoring). Nav-Registry: core kennt
`descriptionKey` (Vertrag statt Schlüssel-Konvention, FIELDS-Zeile im
i18n-Wächter, 5 Tests), die App trägt `products` (`to: '/products'`) + fünf
Kinder mit Icon + Beschreibung ein; `brand.nav.product.wizard` ohne George.

**Beweis:** Worktree-Server auf 3017 (`.env` aus `~/.appwrite-secrets`, danach
gelöscht), alle neun Routen 200 mit übersetzten Titeln, 0× `Detected HTML`,
eigener Klick auf Übersicht, Marktvergleich-Seite und Aufklapper (544 × 260 px,
sechs Einträge, Kartenfarbe, liegt oben auf — per `elementFromPoint` geprüft).
Wächter nach Rebase: manifests 26/9, i18n-keys 304/18 Felder, doc-links,
Lint core/brand/branding, Typecheck core/branding, core 1623 Tests, brand 2769,
branding 28. Davids Freigabe 2026-09-09 (Prototyp = echte Seiten; Brand-Check
im Aufklapper auf die Marketing-Seite, wie gebaut). **Prod-Beweis:** Deploy-Lauf
34409516032, `https://branding.supply/api/health` → `.build` = **66110cbe**;
live `/products`, `/products/market-comparison`, `/de/produkte`,
`/de/produkte/marktvergleich`, `/de/produkte/brand-book-kit` → 200,
`/de/products` → 302 auf `/de/produkte`; Aufklapper live 544 × 280 px, sechs
Links auf `/de/produkte/…`, Preis-Zeile „149 € netto je Branding, einmalig".

**Gelernt:** (1) Der Nuxt-UI-Aufklapper (`UNavigationMenu`, waagerecht) wird
nie breiter als die Menüleiste: Reka misst `--reka-navigation-menu-viewport-
width` am CONTENT, und der ist im Theme `absolute w-full` des Viewports — eine
Fixpunkt-Schleife bei der Leistenbreite. `w-max` am Content half nicht (die
erste Messung blieb stehen), `sm:w-[34rem]` am Viewport verlor gegen die
Variablen-Klasse `sm:w-(--reka-…)` (tailwind-merge kennt die Kurzform nicht als
`w-`-Klasse, beide bleiben, die Variable gewinnt in der CSS-Reihenfolge).
**`sm:min-w-[34rem]` am Viewport** ist die Lösung: andere Eigenschaft, schlägt
jede kleinere Breite, Reka misst danach den vollen Content (544 px) und klammert
rechts korrekt. (2) `viewport: 'bw-root'` allein malt teleportierte Flächen im
Seiten-Grund — auf dunklem Grund unsichtbar; `bw-overlay` dazu (brand.css Runde
19c gilt auch hier). (3) Ein Dropdown-Kind ist Marketing-Copy: der alte
Klickdummy-Schlüssel nannte George, die Rolle-vor-Name-Regel (2026-09-04) griff
erst, als der Text sichtbar wurde. (4) Screenshot-Messungen am offenen Menü
IMMER über eine eindeutige Klasse (`.bw-overlay`) — der erste
`[data-state=open]` im DOM war einmal ein anderes Element (Höhe 0, Opazität 0)
und täuschte ein Render-Problem vor, das es nicht gab. (5) **Ein Laufzeit-
Import aus `apps/<app>/shared/` bricht den Prod-Build** (Deploy-Lauf
34407402347 rot: `RollupError: Could not resolve "…/apps/branding/shared/
productPricing.ts" from ".nuxt/dist/server/_nuxt/products-….js"`) — der
Vite-SSR-Build lässt die Datei extern, Nitro findet sie nicht. Dev-Server,
Typecheck und alle Tests sahen davon nichts. Die anderen Apps importieren aus
ihrem `shared/` nur TYPEN (verschwinden beim Bauen); Laufzeit-Code, den nur die
Oberfläche braucht, gehört in `app/utils/` (auto-importiert, sicher im Bundle);
was Server UND Client brauchen, in das `shared/` eines LAYERS (dort bündelt es
der Build, Beweis: `packages/brand/shared/brandLegalLinks`). Nachgezogen mit
Fix-Commit + lokalem `pnpm --filter branding build` als Beweis.

### Sucheintrag-Beschreibung gilt auch im Silo (NAV1-Nebenbefund, letzte offene Entscheidung) ✅ 2026-09-09

**Anlass:** Beim Abschluss von NAV1 blieb eine Frage offen (Zeile `13 · NAV1` in OPEN-ITEMS):
den Sucheintrag unter `/dashboard/community/seo` gibt es auf jeder Site, aber von seinen zwei
Werten wirkte im Silo nur `noindex` — das sitzt in `useLocaleSeoHead()` und gilt der ganzen
Community. Die BESCHREIBUNG las genau EINE Datei, die Pool-Startseite. Auf branding.supply und
portfolio stand im Kopf der Startseite weiter der fest verdrahtete Text, egal was der Owner
eintrug. Davids Entscheidung 2026-09-09 (DECISION-LOG): die Owner-Beschreibung gilt auf JEDER
Site, der bisherige Text bleibt der Rückfall.

**Gebaut:** (1) `packages/core/app/composables/useCommunitySeoDescription.ts` — EINE Stelle, die
`useCommunitySeoSettings()` mit der puren Regel `resolveCommunitySeo` (core/shared/communitySeo.ts)
zusammensteckt: `useCommunitySeoDescription(fallback: MaybeRefOrGetter<string | null | undefined>):
ComputedRef<string>`, `''` heisst weiterhin „kein description-Tag" (S5). `noindex` bleibt bewusst
draussen — der zweite Wert derselben Zeile gilt der ganzen Community und gehört in den EINEN
Kopf-Aufruf. (2) Drei Leser: `apps/platform/app/pages/index.vue` (Inline-Rechnung ersetzt,
Verhalten identisch — Rückfall bleibt der Anriss der home-Seite, `|| undefined` lässt das Tag
weg), `apps/branding/app/pages/index.vue` (`description` + `ogDescription` in `useSeoMeta` und die
`description` des `WebSite`-Knotens im JSON-LD; Rückfall `home.seoDescription`),
`apps/portfolio/app/pages/index.vue` (`usePortfolioSeo({ description })` und die `description` des
`WebPage`-Knotens; Rückfall `HOME_META.description`). Unangetastet bleiben `personDescription`
(Person-Knoten) und `serviceDescription` (ProfessionalService) — die beschreiben die Person und
das Angebot, nicht die Site.

**Beweis:** lokal (branding :3010 im Worktree, Session per Server-SDK, 8/8): PATCH /api/pages/seo
mit eigener Beschreibung ⇒ 200; Startseite trägt sie in meta description, og:description und im
JSON-LD-WebSite-Knoten; Gegenprobe /about behält seine eigene; PATCH leer ⇒ i18n-Fallback de und en
steht wieder. Gemergt 4a544a03, LIVE mit Build 6d787e2e (CI viermal grün): Owner-Beschreibung per
PATCH in Davids Session gesetzt ⇒ branding.supply/de und / tragen sie in description + og:description,
/about unberührt; zurückgesetzt ⇒ i18n-Fallback wieder da.

---

### NAV1 Paket 3 — Reihenfolge der Dashboard-Navigation je Person (Konto-Prefs, Konto-Reiter „Navigation") ✅ 2026-09-08

**Anlass:** Entscheidung 3 aus „Navigation anpassen" (DECISION-LOG 2026-09-08): die Reihenfolge der
Dashboard-Nav ist die Wahl JEDER PERSON, nicht je Community (die Nav ist rollen-gefiltert). Konzept
+ Verträge: docs/archiv/DASHBOARD-NAV-JE-PERSON.md; Freigabe am Prototyp „wie gebaut" (E1–E3 nach
Empfehlung, Nachtrag im DECISION-LOG).

**Gebaut:** (1) `prefs.dashboardNav` = `{ groups?, items?, hidden? }` (Ids; ≤ 100 je Liste, ≤ 64
Zeichen, `^[a-z0-9-]+$`) in `PukalaniUserPrefs`. (2) Pure Regel `applyDashboardNavPrefs` +
fail-softer Leser `parseDashboardNavPrefs` in core/shared/dashboardNav.ts mit sechs Zusagen
(ohne Prefs = heutige Nav; unbekannte Ids still ignoriert; nicht Erwähntes hängt hinten an;
leere Gruppen fehlen; `hidden` nur in der Seitenleiste, NICHT in ⌘K; Module ohne Gruppe bleiben
vorne) — 22 neue Unit-Fälle (57 in der Datei). Die Standard-Gruppenreihenfolge steht jetzt EINMAL
(`DASHBOARD_NAV_GROUPS`), Typ `PukalaniAdminModule.group` liest sie (Nebenbefund: dem Typ fehlten
seit U7 `account` und `moderation` — nie aufgefallen, weil die Registry nicht gegen ihn geprüft
wird). (3) `PUT /api/auth/dashboard-nav` (core, Muster timezone.put.ts): Zod, 401/400, Merge über
die bestehenden Prefs; `null` oder `{}` = Zurücksetzen (Schlüssel wird entfernt). (4) admin:
Composable `useDashboardNavModules()` kapselt die Filter-Zutaten EINMAL für Layout und Editor;
`dashboard.vue` rendert `links` personalisiert und hält `allLinks` unpersonalisiert für die
Suche; sechster Konto-Reiter `/dashboard/settings/navigation` mit `DashboardNavPrefsEditor`
(ein Block je Gruppe, Gruppen-Pfeile, je Zeile Griff/Ziehen innerhalb der Gruppe, Pfeile, Auge;
Speichern ⇒ `auth.refresh()`, Seitenleiste zieht ohne Reload mit; Zurücksetzen). i18n de+en.

**Beweise:** Unit 57/57; Klick-Beweis lokal (Playwright gegen branding :3010 im Worktree, Session
per Server-SDK, Dev-Projekt portfolio-g4ml, Test-User `paket6-klickbeweis` mit Label `admin`):
18/18 — Reiter rendert, Ausblenden + Zeile hoch + Gruppe runter ⇒ PUT 200, Seitenleiste ohne
Reload, nach Reload persistent, Editor zeigt Ausgeblendetes gedimmt, ⌘K findet es weiter,
Zurücksetzen ⇒ Ausgangslage; Gegenproben ungültige Id 400, 101 Ids 400, ohne Session 401,
unbekannte Id angenommen und wirkungslos. Alle Gates grün (test/lint/typecheck/i18n-keys/
single-copy/manifests/bilanz/lint:scripts). LIVE: Build 5bbb3b8f auf branding.supply (`/api/health`),
Klick hinter dem Login (Davids Chrome, de): „Warteliste" ausblenden + „Website" hoch + Speichern
⇒ PUT 200, Seitenleiste ohne Reload „Übersicht · Website · Seiten · Management · …";
Zurücksetzen ⇒ `dashboardNav: null`, Ausgangslage zurück.

**Gelernt:** (1) **`$fetch` mit `body: null` schickt GAR KEINEN Body** — die Route sah `undefined`
und antwortete 400; „Zurücksetzen" schickt deshalb `{}`, und ein FEHLENDER Body bleibt bewusst 400
(ein Client, der seinen Body vergisst, darf nicht still die Wahl löschen). (2) **Appwrite 2.0
lehnt ein LEERES Prefs-Dokument ab** (`PATCH /account/prefs` mit `{}` ⇒ 400
general_argument_invalid „Value must be a valid object"; PHP dekodiert `{}` zu einem leeren
Array). Wer außer der Nav-Wahl nichts in den Prefs hat, bekam beim Zurücksetzen ein 500 — die
Route lässt in genau diesem Fall `dashboardNav: {}` stehen (liest sich als „keine Wahl"). Gilt
für JEDE künftige „Pref entfernen"-Route. (3) Der Browser-Pane wurde vom Klassifizierer
blockiert — der Klick-Beweis lief als Playwright-Skript mit Cookie aus `users.createSession`
(kein Passwort), dasselbe Muster wie die verify-Skripte; ein Seitenleisten-Selektor muss die
Nuxt-UI-Id `#dashboard-sidebar-dashboard` nehmen (`#dashboard nav` findet nichts, und ein leeres
Array macht jede „Eintrag fehlt"-Prüfung tautologisch grün — beim ersten Lauf so erwischt).

### Brand Design (Produkt 02, BD1): sechs Werkstatt-Kapitel, Vorbilder + Lesung, Farbwelt aus der Ramp-Mathematik, Zeichen in drei Stufen, Ergebnis-Board ✅ 2026-09-09

**Was:** Die erste bezahlte Ableitung aus der Foundation — Schicht 2 derselben Werkstatt mit
Beraterin Frida: `dna` (Weiche „Vorbilder oder Frida schlägt vor", bis 16 Screenshots je Marke,
KI-Lesung gegen die Foundation, Visual DNA aus zehn Dimensionen, drei Boards + Mix & Match),
`color` (Basis-/Akzent-Kandidaten mit Begründung, Hell- UND Dunkel-Rampe aus
`themes/shared/ramp.ts`, Rollen, Kontrast-Matrix mit adaptiver Knopf-Schriftfarbe), `type`
(sechs Paare, sieben self-gehostete Familien, Hierarchie-Faktor, Regeln), `mark` (Richtung,
Briefing mit gerechnetem Schutzraum, gesetzte Wortmarke/Monogramm als SVG, Stufe 3 KI-Entwürfe
über `aiImage` mit ZDR), `imagery` (drei Prinzipien mit Do & Don't, Icon-Satz mit
Strichstärken-Auskunft), `motion` (drei Tempi, Token-Satz, sechs Regel-Sätze, 800 ms
Zeichen-Aufbau). Ergebnis: `BrandDesignPreset` → Kapitel 10 der Foundation, Ergebnis-Board
`/brand/:id/design`, Snapshot v2 (Design-Kapitel reisen NIE roh — Vorbilder, Lesung und
Entwürfe sind `internal`), Beispiel Kailua Coffee. Freischaltung je Marke durch den Betreiber
(brand-022), Buckets `brand-inspiration` (5 MB) + `brand-drafts` (2 MB) server-only mit
Magic-Bytes und Owner-Auslieferung `no-store`; Core bekam zwei neue Transporte `aiVision` +
`aiImage` (OpenRouter, `data_collection: deny` fest und nur verschärfbar, Gates leer = aus).
Modelle (David): Vision `google/gemini-2.5-flash`, Bild `google/gemini-2.5-flash-image`
(Preview-Slug hatte unter ZDR keinen Endpunkt). Weg: Strategie (Konkurrenz Looka/Brandmark/
Huemint/Frontify) → Konzept (§2, Davids vier Entscheidungen, zwei gegen die Empfehlung) →
Prototyp im Playground (acht Screens + Nachtrag Weiche/Upload/Lesung/Board + Hell/Dunkel,
abgenommen 2026-09-08, eingefroren) → Pakete D0–D9 (Opus baut, Fable prüft; jedes Paket mit
eigenem Klick hinter Login: getComputedStyle, `--ds-dur`, SVG-Attribute, Kontrastwerte) →
Nachschnitt (Snapshot ohne rohe Design-Werte) → Audit ohne hohe Befunde
(docs/archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md) → A1 (IP-Eimer `brand:brief`,
Vision-Eingangsklemme 16 Bilder/64 MB vor dem Netz, GDPR-Purges werfen bei Nicht-404,
Burst-Deckel `retainBrandGeneration`) → Davids Abnahme 2026-09-09 („ich vertraue dir erstmal
hier"; Fundstellen-Liste D1–D8 in der Sitzung). Drei Prod-Migrationen mit Davids Ja
(brand-022, brand-024, brand-023). Beweise: `verify-brand-design.mjs` 130/130 (Gegenprobe 108),
`verify-brand-share.mjs` 51/51 (Gegenprobe 36), `verify-brand-sessions.mjs` 383/383; 2 705
brand-Tests, 1 597 Core-Tests. **Live:** Build `d4f17df6` auf branding.supply. Plan:
[archiv/BRAND-DESIGN.md](archiv/BRAND-DESIGN.md); Entscheidungen DECISION-LOG 2026-09-07…09.

**Gelernt:** (1) `isAiConfigured` verlangt `pukalani.ai.enabled`, das die branding-App nie setzt —
eine Brand-Route damit zu gaten heißt immer 503; Brand-Konsumenten gaten über `readBrandAiEnabled`
+ `resolveAiKey`. (2) Ein Special-Slot, der nie `confirmed` wird, sperrt alles hinter sich für
immer, wenn `inputSatisfied` ihn wie einen Antwort-Slot behandelt — Durchreich-Regel, getestet.
(3) Nach einem Karten-Klick darf `resolveNextSession` nur ERREICHBARE Sessions nennen, sonst
springt der Chat in ein gesperrtes Kapitel. (4) Ein Modell-Slug „Preview" kann unter ZDR ohne
Endpunkt sein („No endpoints found") — immer den GA-Slug prüfen, bevor er in die Config geht.
(5) Ein Wirkungs-Hinweis („fließt in 53 Felder") darf nur ERREICHBARE Kapitel zählen, sonst
verrät er Sperren. (6) Klick-Beweise auf Werkstatt-Seiten per DOM-Messung statt Screenshot —
die Animation lässt Playwright-Screenshots verhungern. (7) Eine gerechnete Setzung
(Schutzraum, Strichstärke) gehört an EINE Stelle als Zahl, der Satz wird daraus gebaut — sonst
widersprechen sich Text und Maß beim ersten Nachschnitt.

---

### Klick-Test-Befunde 13–18: Modal nie Demo, Anrede nach Weiche, Leiste hakt sofort, Kapitel-Reihenfolge, Session-Abschluss „George führt", Notizblock-Knöpfe ✅ 2026-09-09

**Was:** Davids eigener Durchgang als Testnutzer an einer neuen Marke (Freelancer Supply), direkt
nach den Kailua-Läufen. Sechs Befunde, drei davon Produktentscheidungen (DECISION-LOG 2026-09-09
(9) und (10)), alle am selben Tag gebaut und live; dazu zwei Nachzüge und eine Wortlaut-Entscheidung.
- **13 — Modal führte in die Demo** (`4413b5cd`): „Neues Branding" aus dem Avatar-Menü landete auf dem
  Klickdummy `/brand/demo/werte`. `BwNewBrandModal` hatte `mode: 'demo'` als VOREINSTELLUNG, und
  BwSiteNav + BwBrandSwitcher übergaben keinen Modus (Altbestand seit 2026-09-03; der Befund-6-Lauf
  hatte nur die drei Aufrufer umgebaut, die „live" schon sagten). Jetzt beide über `useBrandCreate`,
  Voreinstellung `live`, nur der Playground sagt `mode="demo"`.
- **14 — „ihr" für einen Solo-Gründer** (`34a3ef7c`, `converse-13`): die Team-Weiche W3 erreichte nur
  die Feld-Beschriftungen (`brandSlotPromptLabel`), nie den Auftrag. Jetzt `addressLines`: solo ⇒ eine
  Person im Singular (du/dich/dein, keine erfundenen Mitgründer), team ⇒ ihr/euch/euer; ohne Weiche
  bleibt der Auftrag wie zuvor. Route reicht `profileFacts(profile).team` durch; Route-Test am Solo-
  Profil.
- **15 — Leiste hakte erst nach Reload ab** (`86537da6`): die PATCH-Antwort trägt Slots + `revision`,
  aber keine Session-Zustände (rechnet der Server nur im vollen Abruf). Der Autosave lädt nach einem
  Rumpf mit Bestätigung `refreshStep` (Gespräch und offene Eingabe bleiben); bestätigte Sessions zeigen
  keine Minuten mehr („die Zeit verschwindet hinten dran").
- **16 — Ableitungen vor den Fragen verwirrten** (`953c0261` + `6770a2ce`, Entscheidung (9), gegen
  die Empfehlung „nur Kontext"): ALLE Kapitel geprüft. Fünf umgebaut (context, pvm, verbal, imagery,
  motion), Trenner „Daraus abgeleitet" in Leiste, Abnahme und Dokument; pure Regel
  `brandSessionGroups.ts` + Wächter `validateSessionOrder` (saubere Teilung ODER nachgewiesene
  blockierende Abhängigkeit). Sieben Kapitel bleiben gemischt, weil eine Frage aus einer Ableitung
  schöpft; in archetype/manifesto rücken die abhängigkeitsfreien Menschenfragen trotzdem vor
  (Nachfrage, nach Empfehlung), color bleibt begründet (beide Fragen schöpfen aus h.base). Session-
  Inhalte-Referenz zweimal über `print:sessions` neu erzeugt (reiner Reorder).
- **17 — Session-Abschluss: George führt** (`b39eaeb0`, `converse-14`, Entscheidung (10)): der Auftrag
  kennt jetzt den Session-Zustand (`sessionConfirmed`) — bestätigt ⇒ kein Bohren; unbestätigt ⇒
  Marker `CONFIRM:` als Bedienelement (Knöpfe „Passt so, bestätigen" / „Ich ergänze noch etwas", Texte
  aus dem Katalog). Abschlusszug `closing` nur bei bestätigter Session: würdigen, Übersprungene nennen
  (`skippedSessionsBetween`, gesperrte fallen weg), Ziel aus `resolveNextStop` als Beschriftung — die
  Bühne rendert „Weiter zu …", ohne Ziel zur Finalen Abnahme. Eröffnungszug spiegelt ein bis zwei Sätze
  Bekanntes (`chapterAnswers`). Der Auto-Sprung nach Bestätigung UND nach jeder Antwort entfällt (er
  hätte die Knöpfe unklickbar gemacht); nur die Eröffnung einer Entwurfs-Session springt weiter (8).
  Neu gefunden: ohne `?s=` rechnete die Bühne nach der Bestätigung still die nächste Session —
  `pinSession` hält sie in der Adresse. Davids Rückfrage „wohin, wenn das Nächste schon beantwortet
  ist?" beantwortet die Regel, nicht George: übersprungen wird, was bestätigt/vertagt ist, und George
  spricht es aus.
- **18 — leere Karten sagten „Korrigieren"** (`b39eaeb0`): pure Regel `brandLogCardAction` — leer +
  Frage „Beantworten", leer + Ableitung „Entwerfen" (beide springen per `?s=` in die Session), mit Wert
  „Korrigieren"; Bestätigen bleibt leer deaktiviert mit Hinweis.
- **Nachzüge:** sieben Werkstatt-Texte sprechen mit der Stimme des Kapitels (`{voice}`, in Design-
  Kapiteln Frida; `95533300`); die fünf Drossel-Meldungen sind stimmneutral (Davids Wortlaut-
  Entscheidung: die Grenze gehört dem Werkzeug, nicht der Person). Startseite: der Kailua-Teaser führt
  auf `/discover/kailua-coffee-co`, `/beispiel/kailua-coffee` (de+en) antwortet 301, Alt-Seite und
  ihr i18n-Block entfernt, Sitemap führt den Pfad als bewussten Ausschluss.

**Live-Beweise:** Builds `54737e39` (14/15), `953c0261` + `6d787e2e` (16), `b39eaeb0` (17/18),
`d1e04658` (Nachzüge: `/de/beispiel/kailua-coffee` → 301 auf `/de/discover/kailua-coffee-co`, en
ebenso, Startseite verlinkt die Anatomie). Gates je Commit: brand 2755 → 2824 Tests, branding 28,
Lint, Typecheck, i18n-Keys, Bilanz. Die Wizard-Fixes liegen hinter dem Login — Davids Durchgang durch
den Session-Abschluss steht in OPEN-ITEMS BW1.

**Gelernt:** (1) Eine Attrappe darf nie die Voreinstellung sein — der Demo-Zweig einer Komponente ist
eine ausdrückliche Wahl, und „an drei Orten" heißt grep über ALLE Render-Stellen. (2) Eine Weiche, die
nur Beschriftungen erreicht, ist für den Auftrag unsichtbar; jede Produktwahl, die das Gespräch
prägen soll, braucht eine ausformulierte Regel je Fall (du/ihr), nicht „address them correctly".
(3) Ein Deploy kann RÜCKWÄRTS laufen: bei parallelen Wellen gewinnt die ältere in Arbeit, die neueren
werden abgebrochen — der Wächter prüft deshalb Vorfahrschaft, nicht Gleichheit, und meldet den
Zwischenstand ehrlich. (4) Navigation ist eine Regel, kein Modell-Urteil: „wohin weiter" rechnet der
Server deterministisch, George spricht nur aus, was die Regel sagt. (5) Der Testnutzer sieht die
Registry-Reihenfolge als Erzählung — Ableitungen vor Fragen lasen sich wie übersprungene Fragen; die
Ordnung der Registry ist Produkt, nicht Implementierungsdetail.

---

### Kailua-Befunde 1–6: kein 409 gegen leere Serverfassung, Zähler aus dem Server-Stand, Sammel-Wert gehört dem Server, Anlage-Modal springt in die Werkstatt ✅ 2026-09-09

**Was:** Die sieben Bedien-Befunde aus dem ERSTEN Kailua-Wizard-Lauf (2026-09-08). Davids
Entscheidungen per Fragenrunde (DECISION-LOG 2026-09-09): Befund 6 Modal legt an und springt in die
Werkstatt, Befund 7 (Chat-Sprache = Oberflächensprache) ist gewollt. Ein Opus-Lauf, im Hauptloop
geprüft, Commit `5f4f5af3` — jede Ursache GEMESSEN, drei davon waren nicht die vermuteten:
- **1 — Pillen winzig:** kein Klick-Abfänger, nur `size="xs"` (≈24 px). Jetzt 32 px, Innenabstand,
  eigener Fokus-Ring (der Nuxt-UI-Ghost-Ring war auf `--bw-stale-soft` unsichtbar).
- **2 — 409 gegen leere Serverfassung, in EINEM Tab:** zwei Wurzeln. (a) Die Konversation warf die
  vom Server gemeldete `revision` weg — ein Gesprächszug bewegt sie aber (Sammel-Session schreibt
  Zwischenstand, „hat mitgelesen"-Stempel); der nächste Autosave war damit veraltet. (b) `flush()`
  kehrte bei laufendem Speichern sofort um — `await autosave.flush()` war an zwölf Stellen eine
  Lüge, der Nachzügler kam 750 ms später mitten in den Zug. Fix: `applyGenerationRevision` aus jedem
  Zug, `flush()` wartet den Lauf wirklich ab (Deckel 3), pure Regel `brandConflictNeedsDecision`
  (leere Serverfassung, gleicher Wortlaut oder reine Bestätigung auf unverändertem Text ⇒ KEIN
  Dialog: Server-Revision übernehmen, eigene Eingabe behalten, erneut senden; ab dem vierten stillen
  Anlauf wird der Dialog erzwungen). Der Dialog bleibt für echte Text-Kollisionen. 8 Tests.
- **3 — Zähler optimistisch (10/10 → 1/10):** dieselbe Wurzel plus zwei eigene: `completion`
  zählte die ABSICHT (`slotConfirmed`), und jedes unbehandelte Nein fiel in `mark('error')` ohne
  Toast. Jetzt zählt `serverSlotFacts` (die EINE Fortschritts-Wahrheit = Server-Stand), „wird
  gespeichert" hängt an der Zeile, endgültige Neins werden zum Toast mit Feldnamen (`rejectSave`),
  429/5xx werden weiter wiederholt.
- **4 — nur ein Fakt von drei:** NICHT der Renderer — der Client schrieb den ersten Teil einer
  `collect`-Session als Slot-Wert, damit galt `a.facts` als gefüllt, die Bühne verließ das
  Sammel-Modul, Teil 2/3 wurden „freie Fragen", und der Autosave überschrieb den vom Server
  zusammengelegten Wert mit dem Rohtext von Teil 1. Pure Regel `brandAnswerWritesSlot` (der
  Sammel-Wert gehört dem Server), `store.refreshStep()` lädt nach, ohne das Gespräch zu leeren;
  ohne KI-Zug (`noTurn`) schreibt der Browser doch, sonst wäre `a.facts` unbedienbar.
- **5 — Kontext-Felder aus dem Gespräch:** gemessen eine Produktfrage (Entwurfs-Slots hatten NIE
  eine Katalog-Frage), nicht gebaut — David hat danach Weg B gewählt (eigener Lauf). Gebaut wurde
  das Mindestmaß: die Wiederholungs-Regel `george-a-9` stand nur im Entwurfs-Prompt, jetzt auch im
  Gesprächs-Prompt.
- **6 — doppelte Anlage:** das Modal navigierte auf `new.vue` mit Query, dort standen die drei Felder
  erneut; das Modal hängt an DREI Orten. Jetzt `BwNewBrandDetails` einmal für Modal und Seite,
  Regeln pur in `brandStartCard.ts`, `useBrandCreate()` legt an und springt über
  `firstOpenBrandStep(journey)` ins erste offene Kapitel; Fehler bleiben im Modal; `new.vue` bleibt
  für direkte Links (`?path=relaunch`).
Gates: brand 2725 Tests (+20 aus dem Lauf, Rest Nachbar-Merges), Lint, Typecheck branding,
i18n-Keys, Bilanz. **Live:** Build `5f4f5af3` auf branding.supply (Health-SHA, Seiten 200) — die
Fixes liegen hinter dem Login, Davids Klick-Test steht in OPEN-ITEMS BW1.

**Gelernt:** (1) Bei drei von sechs Befunden lag die Ursache woanders als vermutet (Renderer vs.
Client-Schreibpfad, Pillen vs. Klick-Abfänger, Zähler vs. Absicht) — „Ursache gemessen, nicht
vermutet" als Pflicht im Auftrag zahlt sich aus. (2) Ein `await flush()`, das bei laufendem Lauf
sofort zurückkehrt, ist an jeder Aufrufstelle eine falsche Zusage; Serialisierung gehört in die
Funktion, nicht in die Disziplin der Aufrufer. (3) Eine Revision, die der Server meldet, gehört
IMMER in den Store — aus jeder Antwort, nicht nur aus dem Autosave.

**Befund 5 — Weg B + Kapitel-Verlauf ✅ 2026-09-09, Commit `cc6310c2` (Opus-Lauf, im Hauptloop
geprüft):** Ursache an der Registry bestätigt — `slotsForStep('context')` beginnt mit vier
nicht-fragbaren Entwurfs-Sessions, `resolveActiveSession` nahm die erste OFFENE (Pitch), die Bühne
rechnete ihr Modul aber aus der ersten offenen FRAGE (Herkunft); daraus folgten beide Befunde (kein
Entwurfs-Knopf für das Feld, auf dem der Mensch saß; `sessionKey: a.pitch` bei `nextSlotId:
a.origin`). Pure Regel `brandStageClaim` (`shared/brandStageModule.ts`): die aktive Session
bestimmt Modul und Feld, leer + entwerfbar ⇒ `draft` mit Georges Frage zum Feld (Label +
Hilfetext aus dem Katalog, ein neuer Satz mit `{voice}`) und Eingabezeile → `hints[slot.id]` →
`generateSlot()`; `nextSlot` ist null, solange die aktive Session die Bühne hält. Prompt:
`draftField` schließt den Zug auf dem eigenen Feld, `openFieldLabels` nennt Feld + Knopf.
`converse-12`: `loadBrandChapterAnswers` — EIN Lesezugriff je Zug (`Query.limit(60)`), jüngste
Antwort je fremder Session des Kapitels, Deckel 8 × 220 Zeichen, Block im Rumpf, „NEVER ASK
AGAIN" beruft sich darauf; Eröffnungszug trägt die Liste plus eigene Regel; Session-Schnitt des
Verlaufs bleibt. Tests brand 2753 (+28). Auto-Weiter bleibt (David, DECISION-LOG (8)).
**Gelernt:** eine Entscheidung, die über drei Computeds verteilt ist (`activeAwaitsConfirm`,
`nextSlot`, `stageModule`), hat keinen Ort, an dem sie falsch sein kann — erst die eine pure Regel
machte den Fehler benennbar und testbar.

**Nachtrag 2026-09-09, Davids erster Klick-Test:** „Neues Branding" aus dem Avatar-Menü landete
nach dem Modal auf dem Klickdummy `/brand/demo/werte`. Ursache: `BwNewBrandModal` hatte die
Voreinstellung `mode: 'demo'`, und zwei Aufrufer (BwSiteNav, BwBrandSwitcher) übergaben keinen
Modus — Altbestand seit dem 2026-09-03, vom Befund-6-Lauf übersehen, der nur die drei Live-Aufrufer
umbaute. Fix `4413b5cd`: beide über `useBrandCreate`, Voreinstellung `live`, der Playground sagt
`mode="demo"` ausdrücklich. **Gelernt:** eine Attrappe darf nie die VOREINSTELLUNG sein — wer eine
Komponente mit Demo-Zweig baut, macht den Demo-Zweig zur ausdrücklichen Wahl; und „an drei Orten"
in einem Bericht heißt: `grep` über ALLE Render-Stellen, nicht nur die, die schon `mode` sagen.

---

### Kailua-Wizard-Befunde 8/9/10/12: George behauptet nichts, leere Bestätigung erklärt sich, „Alle abnehmen", Handbuch-Kapitel „Stimme" geteilt ✅ 2026-09-09

**Was:** Der D5-Durchlauf (Beispiel-Branding Kailua Coffee Co. über den echten Wizard) brachte fünf
Bedien-Befunde (OPEN-ITEMS BW1 8–12). Drei waren Produktfragen, per Fragenrunde entschieden
(DECISION-LOG 2026-09-09: 11 kein Tor, 8 Prompt-Regel statt Auto-Entwurf, 12 Kapitel teilen —
GEGEN die Empfehlung). Ein Opus-Lauf, im Hauptloop geprüft, Commit `ea87feb6`:
- **8 — „ich trage das ein":** ein Gesprächszug bleibt ganz Nachricht (kein Marker, kein Feld —
  die Trennung aus `conversePrompt.ts` steht). Neu `converse-11`: George darf NIE behaupten, etwas
  eingetragen/notiert/geschrieben zu haben; nennt der Mensch eine Entscheidung, bestätigt er sie in
  einem Satz und verweist auf den Knopf. Der Knopf-NAME reist wie `openFieldLabels` aus dem
  Locale-Katalog (`brandDraftButtonLabel`, „George, entwirf das" / in Design-Kapiteln „Frida,
  entwirf das"). Bühne: nach einem Gesprächszug ohne Wert wird der Entwurfs-Knopf `solid` statt
  `ghost` (`draftNudge`), erlischt beim Klick, beim Kartenwechsel und mit dem ersten Wert.
- **9 — stiller No-op:** gemessen war der Knopf NIE klickbar (`confirmEnabled = hasValue`,
  natives `disabled`) — nur sagte nichts, was fehlt. Jetzt pure Regel `showConfirmBlockedNote`
  + Satz „Erst entwerfen oder selbst schreiben" in Draft- und Confirm-Modul; das 400 `slot_empty`
  der PATCH-Route landet als Toast (`rejectEmptyConfirmations` im Store) statt als stummes „Nicht
  gespeichert".
- **10 — „Alle abnehmen":** BULK-Route `POST …/steps/<stepKey>/accept-all` (Zod nur `revision`;
  was abnehmbar ist, rechnet der Server — eine Client-Liste wäre eine Behauptung über den
  Serverstand), dieselbe Tür wie die Einzel-Route, EIN `updateRow`, Teilerfolg als `failed[]`.
  Grund gegen elf Client-Aufrufe: jede Abnahme dreht `revision`, elf abhängige Roundtrips auf
  dieselbe Zeile hinterließen beim ersten 409 ein halb abgenommenes Kapitel. Pure Regel
  `brandAcceptableSessions` versorgt jetzt auch `BwSessionBlock` (vorher eigener Ausdruck dort).
- **12 — Kapitel geteilt:** `BRAND_FOUNDATION_SOURCE_STEPS.stimme = ['archetype']`, der
  Wort-Leitfaden (`ep.vocabulary`) steht als `vocabularyBlocks` im Messaging-Kapitel nach den
  Kernbotschaften. Keine Migration: alle vier Konsumenten (Leseansicht, Share, Discover-Anatomie,
  foundation.get) rufen `buildBrandFoundation` mit rohen Slot-Werten zur Lesezeit.
Gates: brand 2674 Tests (+17), Lint, Typecheck branding, i18n-Keys. Nebenbei: `check:bilanz` war
nach der neuen Route rot und hielt den Deploy — die Nachbar-Session hat die Bilanz zeitgleich neu
erzeugt (`bb39e223`), mein identischer Commit fiel beim Rebase als leer weg (Duplikat-Rennen
verloren, wie die Regel es will).

**Live-Beweis (Build `ea87feb6`, öffentlich ohne Login):** `/api/discover/kailua-coffee-co` liefert
das Kapitel `stimme` nur noch mit Archetyp-Wahl, Ziel-Gefühl und Ton-Wörtern (`choice, text,
chips`) und das Kapitel `messaging` mit dem Wort-Leitfaden (`list`); auf `/de/discover/
kailua-coffee-co` steht „Wort-Leitfaden" unter Kapitel 05, nicht mehr unter Kapitel 04
„Persönlichkeit & Stimme". Gesprächs-Regel, Karten-Hinweis und „Alle abnehmen" liegen hinter dem
Login — Davids Klick-Test steht in OPEN-ITEMS BW1.

**Gelernt:** (1) Ein „stiller No-op" ist oft ein deaktivierter Knopf ohne Erklärung — erst messen
(`disabled`, Handler, Route), dann bauen; hier war die Lücke die fehlende Ansage, nicht der Klick.
(2) Neue Route ⇒ `node scripts/produkt-bilanz.mjs` VOR dem Push, sonst hält das Lint-Gate den
Deploy (dritter Vorfall dieser Art, CLAUDE.md-Regel). (3) Nicht rebasen, während ein Agent im selben
Worktree schreibt — es ging nur gut, weil er noch keine getrackte Datei angefasst hatte.

---

### Navigation: komplette Testrunde Silo + Pool (Davids „teste du alles") ✅ 2026-09-08

**Was:** Nach Paket 2 und dem Silo-Fix eine volle Runde mit eigenen Klicks und den drei
Pool-Beweisen. LIVE branding.supply (eingeloggt, PATCH-Antworten mitgeschnitten): umbenennen
(Team → „Unser Team"), umordnen, Discover unter Products einrücken, externen Link anlegen
(target=_blank + rel=noopener im SSR-HTML), speichern 200, Neuladen hält den Stand, SSR-Kopf
zeigt genau die Wahl; dann Gruppe ausblenden (Kinder rücken hoch, Hinweis „steht als
Hauptpunkt, weil …"), About ausblenden, Link entfernen, speichern 200, SSR-Kopf stimmt;
Zurücksetzen 200 ⇒ Standard „Products → Brand Score · Discover Brands · About · Team" zurück;
Validierung: http-Link ⇒ Fehlertext + Knopf gesperrt. Sucheintrag: Beschreibung speichern 200,
nach Neuladen da, leeren 200. Weiterleitung: /nav-test ⇒ 301, entfernt ⇒ 404. POOL lokal
(control 3164 + platform 3165 aus dem Worktree): verify-community-navigation 87/87,
verify-community-redirects 61/61, verify-community-seo 49/49.

**Gelernt:** (1) Der erste Pool-Lauf war in Abschnitt 15 viermal rot — nicht der Code, das
Skript: Abschnitt 14 setzt die Community auf `basic`, und `basic` sperrt auch `/discussions`,
das 15 als Kind nutzen wollte. Die „Gruppen-Prüfung" wäre eine Tautologie gewesen (Kinder
fehlen wegen des Tarifs, nicht wegen der Gruppe) — genau deshalb prüft der Abschnitt seine
Vorbedingung NACH statt sie anzunehmen. Kur: Tarif vor 15 zurück auf `pro`, auf das SSR-HTML
warten. (2) Im ferngesteuerten Chrome-Tab kommen Klicks per Referenz nach einem `navigate`
nicht mehr an (Tab ist `visibilityState: hidden`) — Klicks per JavaScript auf den ECHTEN
Knopf funktionieren und messen dieselben Handler. (3) Pool-Klick im Browser NACHGEHOLT (David eingeloggt, 2026-09-08): auf demo.pukalani.app
Gruppe „Inhalte" mit Feed + Diskussionen angelegt, PATCH 200, Kopf zeigt den UDropdownMenu-
Auslöser mit beiden Kindern (`data-nav-group`), Rest daneben plus „Mehr"; Zurücksetzen 200,
Standard wieder da. Die Hülle heißt im Pool weiterhin „Community-Einstellungen" (richtig so).

### Sucheintrag + Weiterleitungen speichern im Silo (NAV1-Nebenbefund) ✅ 2026-09-08

**Was:** Davids Auftrag „fix die neu gefundenen Probleme": `PATCH /api/pages/seo` und
`PATCH /api/pages/redirects` antworteten ohne Mandanten-Kontext 404 — dieselbe Falle wie
bei der Navigation. Die Row-Id-Regel ist jetzt EINE (`core/shared/communitySettingsRow.ts`,
`communitySettingsRowIdFor(event)` in core/server/utils) für alle drei Ablagen, Routen UND
Lese-Middlewares (die brachen im Silo ebenfalls ab — eine gespeicherte Weiterleitung hätte
dort nie gegriffen).

**Beweis:** lokal (Dev-Instanz) PATCH 200, `/de/alt-test` ⇒ 301 `/de/about`, Gegenprobe 404,
`noindex` ⇒ robots-Meta; LIVE auf branding.supply per Klick: Weiterleitung `/nav-test` ⇒ 301
`/de/about`, entfernt ⇒ 404, Sucheintrag speichert; core 1566 Tests, Lint, Typecheck.

**Gelernt:** Wer eine Regel „nachzieht", zieht sie an EINE Stelle — drei Routen mit derselben
Zeile wären die nächste Drift. Und: Leser prüfen, nicht nur Schreiber — die Middlewares hätten
den Silo weiter ignoriert. Nebenbefund: die Sucheintrag-BESCHREIBUNG liest nur die
Pool-Startseite; im Silo wirkt bisher nur `noindex` (offen in OPEN-ITEMS).

### Website-Navigation mit Unterpunkten + Silo-Ablage (NAV1 Paket 2) ✅ 2026-09-08

**Was:** Davids Screenshot vom 2026-09-08: der Navigations-Editor auf branding.supply war leer
und ohne Wirkung — der brand-Layer registrierte nichts in `pukalani.chrome.nav`, der einzige
Leser der gespeicherten Wahl war das blueprint-Layout (BwSiteNav hatte eine feste Liste), und
im Silo antwortete `PATCH /api/pages/navigation` 404. Gebaut (Konzept
[archiv/NAVIGATION-UNTERPUNKTE.md](archiv/NAVIGATION-UNTERPUNKTE.md), Entscheidungen
DECISION-LOG „Navigation anpassen"): Vertrag additiv um `parent` (eine Ebene) und Gruppen
`group-n` (Hauptpunkt ohne Ziel) erweitert, Zusagen 5–9 in `resolveCommunityNav` (Kind folgt
Hauptpunkt · nichts verschwindet durch fehlenden Hauptpunkt · Gruppe ohne Kinder wird nicht
gerendert · Überlauf zählt nur Hauptpunkte · der Bauplan darf Gruppen vorgeben), Silo-Ablage
unter der rowId `instance`, EIN Composable `useCommunityNav()` (core) statt dreier Rechnungen,
Renderer blueprint (UDropdownMenu) + BwSiteNav (UNavigationMenu-children, Reihe und mobiles
Akkordeon), Editor mit Einrücken/Ausrücken/Ziehen/Gruppen, Schema-Regeln. Davids Korrektur am
Prototyp: das Standard-Menü von branding.supply ist „Products → Brand Score · Discover Brands ·
About · Team" — dafür darf die Registry Gruppen vorgeben (`parent`, `to: ''`).

**Beweis:** core 1526 Tests (79 Navigation, je Zusage eine Gegenprobe; drei Mutations-Gegenproben
je einzeln rot), pages 82 (Schema 19), brand 2592, Lint, Typecheck branding/comments/platform,
i18n-Wächter; Klickbeweis lokal (branding, Dev-Instanz portfolio-g4ml): Gruppe anlegen,
einrücken, Speichern 200, Neuladen, Desktop-Aufklapper, Mobil-Akkordeon, Standard ohne Wahl;
Screenshots an David, Freigabe 2026-09-08.

**Gelernt:** (1) `_instance` nach dem Muster `_account` war falsch übertragen — `_account` ist
ein Spalten-WERT, als ROW-ID lehnt Appwrite einen führenden Unterstrich ab (500 beim
Speichern; erst der Klickbeweis fand es, kein Test). (2) Ein Watcher läuft im SSR genau einmal:
wer aus einem nicht awaiteten `useAsyncData` eigenen Zustand in `watch(…, { immediate })`
ableitet, rendert auf dem Server den Stand OHNE Daten — Hydration-Mismatch; das Composable
liefert deshalb `ready`, und der Editor wartet darauf. (3) Reka rendert den Inhalt eines
Aufklappers erst beim Öffnen — Unterpunkte standen in keinem SSR-HTML, bis
`unmount-on-hide=false` sie versteckt im DOM hält (Crawler). (4) Ein Nuxt-UI-Hauptpunkt MIT
`to` UND `children` ist waagerecht klickbar, senkrecht aber ein Link ohne Akkordeon — deshalb
trägt ein Hauptpunkt mit Kindern kein `to`, sein Ziel reist als erstes Kind (`navMenuChildren`).

---

### Session-Token-Hygiene: CLAUDE.md als Kern + pfadgebundene `.claude/rules/` ✅ 2026-09-08

**Was:** Davids Auftrag „optimierter fahren, gleiches Ergebnis, weniger Nutzung". Gemessen
an einer 655k-Session: Verlauf 547k, CLAUDE.md + Memory-Index 53k je Runde, 445
MCP-Werkzeuge (19k geladen, 189k deferred — auch die Namen kosten). Umgesetzt:
CLAUDE.md 88 KB → 24 KB Kern, neun wortgleiche Domänen-Dateien in `.claude/rules/`
mit `paths:`-Frontmatter (Verlust-Prüfung: jede Zeile des Originals steht in genau
einer der neuen Dateien), Memory-Index 18 KB → 10,7 KB (80 Einträge erhalten),
Feedback-Memory `session-token-hygiene`, Connectoren/Plugins ohne Repo-Bezug in der
Desktop-App abgeschaltet (David). Entscheidung: DECISION-LOG 2026-09-08.

**Beweis:** `claude -p --model haiku` liest `packages/themes/package.json` → antwortet
`RULE_LOADED=yes` (Themes-Regel im Kontext) und `TENANT_RULE=no` (Isolations-Regel
nicht geladen).

**Gelernt:** Der Pfad-Trigger hängt am Read-Tool — wer per Bash liest (cat/sed), lädt
keine Regel; deshalb steht die Domänen-Liste mit Read-Hinweis oben im Kern. Subagenten
(außer Explore/Plan) bekommen die komplette CLAUDE.md-Hierarchie mit — jeder Aufruf
zahlte 44k, jetzt ~12k. Und: `TaskOutput` auf einen laufenden Agenten kippt sein
JSONL-Transkript in den Kontext (zweimal ~20k in derselben Session) — auf die
Benachrichtigung warten.

### Discover Brands (DB1 D0–D5): Galerie, Anatomie, Veröffentlichen mit Freigabe, Betreiber-Seite, Beispiel-Branding, Sitemap + OG-Bild ✅ 2026-09-08/09

**Was:** Davids Vorziehen von DB1 („mach mit discover brands weiter"). Strategie + Konzept
(docs/archiv/DISCOVER-BRANDS.md, seit D4 im Archiv) auf dem abgenommenen Klickdummy, der BF1-Leseansicht
(Veröffentlichung = eingefrorener Snapshot mit `sensitivity`-Filter, derselbe Renderer) und den
BC1/MV1-Daten; acht Entscheidungen per Fragenrunde (DECISION-LOG 2026-09-08: Freigabe VOR
Veröffentlichung, `/discover`, Website-Score sonst Fundament-Reife, Kailua-Beispiel; nach dem
Prototyp: Score im Ring + Reife als Zweitzeile, genau ein Featured, natives Teilen-Blatt,
Veröffentlichen mobil im Export-Menü). Vier Opus-Läufe (D0 Prototyp im Playground, D1 Backend,
D2 + D3 parallel), jeder im Fable-Hauptloop geprüft:
- **D0** Dummy an das Konzept angeglichen (Facetten Weiche/Archetyp/Farbwelt/Branche, beschriftete
  Scores, Badges Beispiel/Relaunch, Anatomie Kailua mit Markenabdruck, Veröffentlichen-Dialog mit
  drei Zuständen, Betreiber-Skizze) — von David abgenommen.
- **D1** Migration **brand-020** (`brand_profiles.publicationVisibility`, `brand_publications`
  mit `status` pending/published/declined/hidden/withdrawn und ZWEI Snapshot-Spalten — der
  öffentliche Stand bleibt sichtbar, bis über einen neuen entschieden ist —,
  `brand_publication_reports`), Snapshot-Bau in `brandSnapshot.ts` herausgezogen (Share-Link
  und Veröffentlichung rufen dieselbe Funktion), Slug-Regel (Umlaute, Deckel, Kollisions-Suffix),
  `brandPublicationCanSubmit` (Titel, Kapitel A+B, Archetyp), Dialog in der Leseansicht,
  Zustand auf der Brands-Karte, `navigator.share` im Teilen-Dialog, Kaskaden (Löschen, GDPR).
- **D2** Lese-API `GET /api/discover` (+`/<slug>`, Microcache 60 s, Zahlen gebündelt über
  `profileId` — beide Arten in einer Abfrage), Galerie, Anatomie (Fundament SERVER-seitig aus dem
  Snapshot gerechnet, der rohe Snapshot verlässt den Server nie), Nav-Punkt „Discover Brands",
  Startseiten-Teaser (unsichtbar ohne Veröffentlichungen), Betreiber-Vorschau `?preview=1`
  (users.manage, eingereichter Stand, nie im Cache, noindex).
- **D3** Betreiber-Routen approve/decline/hide/unhide/feature/example, Meldungen (öffentlich mit
  Honeypot + 3/Std je IP + Minuten-Eimer; Betreiber erledigt), Seite `/dashboard/discover` mit
  Reitern Warteschlange/Veröffentlicht/Abgelehnt/Meldungen; Regel-Erweiterungen: Ablehnung eines
  NEUEN Stands bei bestehendem öffentlichen (bleibt published, Begründung als „Aktualisierung
  abgelehnt"), Featured „genau eine, letzte gewinnt", Reiter decken alle fünf Zustände
  lückenlos ab (Test).

**Live-Beweise (Davids Chrome):** Einreichen an Krume & Gold → `POST …/publication` 200,
Pille „Wartet auf Freigabe", Log `publication_submitted`; Betreiber-Seite Warteschlange 1;
Vorschau `/discover/krume-gold?preview=1` mit Badge und sieben Kapiteln; Freigabe →
`POST …/approve` 200, Log `publication_approved`, Galerie „1 Marke", `/discover/krume-gold`
200 (indexierbar). Gates: brand 2158 Tests, Lint/Typecheck, i18n 283, Bilanz, Manifeste.

**Befund, offen:** Davids erster Klick auf „Freigeben" (und zwei eigene Klicks per Element-
Referenz/Koordinate) erreichten den Server NICHT — kein Request, kein Toast; ein Klick über die
Seite selbst (`button.click()`) und ein späterer physischer Klick auf „Ausblenden" derselben
Tabelle funktionierten. Nicht reproduzierbar, sobald die Warteschlange leer war; als
Beobachtungspunkt in OPEN-ITEMS. Weitere Nachzüge dort: Branche im Dialog aus dem Katalog wählen
(Freitext „Handwerksbäckerei" ⇒ „Nicht zugeordnet"), Log ohne Ids. Die graue Kachel von Krume & Gold ist KEIN Fehler: ihr Dreiklang ist „Schiefer" (`slate`), derselbe wie auf der Brands-Übersicht.

**Gelernt:** (1) „Hat geklappt" ist erst bewiesen, wenn der Server es sagt — Galerie-API,
Anatomie-Status und Log-Zeile gehören zu jedem Freigabe-Beweis; Davids Meldung und die leere
Galerie widersprachen sich, und nur das Log entschied. (2) Zwei Snapshot-Spalten statt eines
Zustands-Flags: „alter Stand bleibt öffentlich, bis entschieden ist" braucht ZWEI Wahrheiten
nebeneinander, kein Feld kann beides tragen. (3) Parallel-Läufe mit klarem Dateibesitz und
i18n-nur-per-Edit tragen auch zu dritt; die Naht (Vorschau-Parameter) blieb trotzdem beim
Hauptloop — wer zwei Läufe koppelt, baut die Kopplung selbst.

**Nachzüge 2026-09-08 (nach Davids Test):** (1) **Branche im Veröffentlichen-Dialog** aus dem
16er-Katalog wählen (vorbelegt aus dem Freitext; Schema lässt nur Katalog-Ids durch) — Krume &
Gold stand als „Nicht zugeordnet" in der Galerie, jetzt „Lebensmittel und Getränke". (2) Log-Zeilen
der Veröffentlichung ohne Profil-/Zeilen-Id. (3) **Live erwischt und behoben:** nach „Stand
aktualisieren" wechselt die Zeile auf `pending`, und Galerie wie Anatomie lasen nur
`status = published` — Krume & Gold war 404, obwohl die Regel „alter Stand bleibt öffentlich, bis
entschieden ist" beim SCHREIBEN galt. Pure Lese-Regel `brandPublicationIsVisible` (published, oder
pending MIT altem `snapshot`; unbekannter Status veröffentlicht nie), Galerie-Abfrage holt beide
Zustände. Beweis: Anatomie 200 während der Prüfung, Freigabe des neuen Stands → Galerie mit Branche.
**Gelernt:** eine Regel, die zwei Wahrheiten nebeneinander legt (öffentlicher + eingereichter Stand),
braucht ZWEI Leser — den Schreiber und den Leser; wer nur den Schreiber testet, sieht die Lücke
nicht. **Offen geblieben:** Davids echte Mausklicks auf „Freigeben" (zweimal) erreichten den Server
nicht, während synthetische Ereignisfolgen und andere Knöpfe derselben Tabelle funktionieren;
Verdacht ist der mit der Browser-Fernsteuerung GETEILTE Chrome-Tab (Navigation kurz vor dem Klick).
Nächster Test: neuer Tab, keine Fernsteuerung. Nebenbefund Nuxt UI: `UDashboardSearchButton`
rendert `⌘k` erst im Client — Hydration-Mismatch auf jeder Dashboard-Seite (Bestand, nicht D3).
**Geklärt (2026-09-08, 23:43 UTC):** im sauberen Test — neuer Tab, Fernsteuerung aus, zuerst nur
„siehst du die Zeile?", dann der Klick — kamen `publication_approved`, drei `publication_featured`
und zwei `publication_example` an. Die zwei verlorenen Klicks davor waren der GETEILTE Chrome-Tab:
die Fernsteuerung navigiert genau den Tab, in dem David klickt. **Gelernt:** Wenn David in seinem
Chrome testet, fasse ich den Browser nicht an — Fernsteuerung und Mensch teilen sich eine Tab-Gruppe,
und ein Navigate der Fernsteuerung frisst den Klick des Menschen lautlos. Beweis vor Vermutung: erst
„was siehst du?", dann „klick", dann Log.

**D5 — Beispiel-Branding „Kailua Coffee Co." über den echten Wizard ✅ 2026-09-08/09 (UTC):** zwei
Opus-Läufe in Davids freigegebenem Chrome (Davids Konto, Profil-Id nur im Lauf), 19 + 14 George-Züge,
keine Drossel. Der erste Lauf blieb an einem abgelehnten Befund hängen, den das Kapitel-Review bei
jedem Lauf NEU anlegte (`writeBrandFindings` deduplizierte nur gegen offene Befunde) — Fix `53be8792`:
Dedup gegen offene UND abgelehnte, nur ANGENOMMENE dürfen wiederkommen (Kehrtwende zu BW2 Paket 6,
DECISION-LOG). Beweis im zweiten Lauf: Werte-Konflikt „Falscher Moment" abgelehnt → `finding_dismissed`
im Log, nach Reload nicht wieder da, Kapitel 8/8. Danach Werte abgenommen, Archetyp-Kapitel 11/11
(primär „Der Weise", sekundär „Der Schöpfer", Ton calm/grounded/plain-spoken — beides per
Chat-Korrektur gesetzt, George übernahm), vier von acht Kapiteln abgenommen. Veröffentlichen mit
Branche „Lebensmittel und Getränke" → `publication_submitted` 01:19 UTC, Freigabe → `publication_approved`
01:20, Beispiel-Schalter → `publication_example: true` 01:20. Live geprüft (curl + Playwright-Screenshots
an David): `/api/discover` 2 Marken, Kailua `example: true`, Branche `food`; `/de/discover` 200 mit
Kailua im Hero (kein Featured gesetzt — der Hero fällt auf die neueste Marke zurück) und Badge
„Beispiel" auf der Kachel; `/de/discover/kailua-coffee-co` 200 mit Kopf „Anatomie · Beispiel", sieben
Kapiteln, Weiche „Neue Marke", Archetyp „Der Weise · Rest Der Schöpfer".
**Neue Bedien-Befunde** (in OPEN-ITEMS BW1 eingetragen): George sagt „ich trage das ein" und trägt
nichts ein; „Übernehmen & bestätigen" ohne Entwurf ist ein stiller No-op; Bestätigen ≠ Abnehmen — in der
Finalen Abnahme fehlt ein „Alle abnehmen" (11 Einzelklicks); ein offener Lücke-Befund blockiert die
Abnahme nicht; Leseansicht-Seitenleiste zeigt „Persönlichkeit & Stimme" offen, obwohl das Kapitel
abgenommen ist. **Gelernt:** (1) Ein Dedup, der „entschieden" mit „angenommen" gleichsetzt, macht
jede Ablehnung zur Endlosschleife — der Zustand, den man NICHT wiedersehen will, muss im Filter
stehen. (2) Ein Bedien-Lauf ohne Screenshot-Pfade ist kein Beweis für David — die Beweisbilder macht
der Hauptloop selbst (Playwright-CLI gegen die öffentlichen Seiten), nicht der Agent.

**D4 — Sitemap + robots.txt, OG-Bild je Anatomie, Branche als Ähnlichkeits-Grund ✅ 2026-09-09
(UTC), Commit `919f588c`, Opus-Lauf, im Hauptloop geprüft:** (1) `apps/branding/server/routes/
sitemap.xml.get.ts` + `robots.txt.get.ts` nach dem Marketing-Muster, pure Bausteine in
`server/utils/brandingSitemap.ts` (neun feste Seiten, jede sichtbare Anatomie mit ECHTEM `lastmod`
aus der Zeile, hreflang x-default/en/de, XML-Escaping, fail-soft mit Warn-Log; Rechtsseiten bewusst
draußen bis BS1 R3, `/beispiel/kailua-coffee` drin, weil von der Startseite verlinkt und ohne
noindex); Testlauf für `apps/branding` neu eingerichtet (vitest). (2) OG-Bild 1200×630 PNG in der
Farbwelt der Marke: Route `apps/branding/server/routes/og/discover/[slug].get.ts` (die App
komponiert — der Rasterizer wohnt in `themes`, ein Produkt-Layer darf ihn nicht importieren, A14;
`.png` schneidet der Handler ab, ein Nitro-Parameter deckt immer das ganze Segment), Renderer
`discoverOgImage.ts` mit dem gebackenen Font-Atlas, Verlauf mit früher Tiefe (Kontrast für alle zwölf
Welten nachgerechnet, Tinte über `brandInkColor`), Ablage unter Hash aus Slug + `$updatedAt` in
`tmpdir()`, `max-age` ein Tag statt `immutable` (die Adresse wandert bei neuem Stand nicht); nur
SICHTBARE Veröffentlichungen werden gerendert (404 sonst — niemand füllt die Platte mit erfundenen
Slugs). Pfad-Wahrheit `brandDiscoverOgPath()` im Layer, die Anatomie-Seite trägt ihn über
`useBrandOgImage()` ein und setzt beim Verlassen auf `null` zurück (app-weiter State). (3)
`similarDiscoverEntries`: Archetyp → Farbwelt → Branche (`unknown` zählt nicht), Deckel 4, i18n
de/en. Gates: brand 2651 Tests, branding 28 (neu), Lint/Typecheck, i18n-Keys 290, Manifeste.
**Live-Beweis (curl, Build `919f588c`):** `/robots.txt` 200 mit drei Disallow + Sitemap-Zeile;
`/sitemap.xml` 200, 22 URLs, beide Anatomien en+de mit `lastmod` = Freigabezeit;
`/og/discover/kailua-coffee-co.png` 200 `image/png` 50 KB, erfundener Slug 404, ohne `.png` 404;
Anatomie-Quelltext trägt `og:image` absolut + Typ/Maße + `twitter:card`; `/api/discover/
kailua-coffee-co` liefert Krume & Gold als Ähnliche mit Grund `industry`. **Gelernt:** (1) Ein
Deploy-Wächter, der auf den EIGENEN SHA wartet, schläft ewig, wenn die Nachbar-Session direkt danach
pusht — prüfen, ob der Live-Build den eigenen Commit als VORFAHR enthält. (2) `pnpm install
--filter <app>` erzeugt hier Peer-Hash-Churn im Lockfile und lässt `node_modules` inkonsistent
zurück (`nuxi prepare` stirbt repo-weit) — immer ungefiltert installieren.

---

### S3: Zweiter Faktor auf allen vier Betreiber-Konten + Google-Login für die Betreiber-Konsole ✅ 2026-09-08

Anlass (nachgemessen 2026-08-23): `mail@davidschubert.com` war in `admin`,
`account`, `portfolio` und `branding` das einzige Admin-Konto, überall ohne
MFA; Google-Login gab es nur für `account` und `branding`. Heute, direkt nach
AW2 (Appwrite 2.0), abgeschlossen:

- **MFA-Flow auf Appwrite 2.0 bewiesen** (`verify-mfa.mjs` 39/39 gegen die
  2.0-Dev-Instanz — Einrichten, Code, Drossel, Wiederherstellungs-Code in
  camelCase, Abschalten, Gast-Abwehr), dann hat David den Zweitfaktor auf
  allen vier Konten eingerichtet; Users-API zeigt je Projekt `mfa=true`.
- **Google für Projekt `admin`**: David hat die Redirect-URI
  `…/oauth2/callback/google/admin` am bestehenden Client ergänzt und den
  Provider in der Appwrite-Konsole angeschaltet (dritter Schlüssel war nicht
  nötig — ein Client bedient alle Projekte); Claude hat
  `NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google` auf der admin-Site gesetzt, per
  `workflow_dispatch` ausgerollt und gemessen: Knopf auf `/login`,
  `/api/auth/oauth?provider=google` → 302 zu accounts.google.com.
- **Nebenbefund 1, gefixt (Commit 215fb1ae):** auf `account.pukalani.app`
  `/settings → Sicherheit` fehlte die Zwei-Faktor-Karte (sie hing nur im
  Dashboard-Reiter des admin-Layers, den der Kontroll-Host nicht hat).
- **Nebenbefund 2, Davids Entscheidung (Commit cd383bc4):** die Online-Karte
  auf dem Kontroll-Host-Dashboard zeigte seit jeher „0 online" (Presence-
  Routen stehen bewusst nicht in `controlApiPrefixes`) — jetzt ausgeblendet.
- **Nebenbefund 3, gefixt (Commit cc330ce7):** im Dashboard von
  pukalani.studio blieb nach dem ersten Sidebar-Klick der Seitenbereich leer
  (nur harter Reload half). Ursache nach Bisektion mit identischen Versionen:
  die globale `app.pageTransition` (out-in) der portfolio-App über dem
  mehrwurzeligen `UDashboardPanel` — Vue gibt Fragmenten inerte
  Transition-Hooks, `afterLeave` feuert nie, Suspense parkt die neue Seite im
  versteckten Container. Seit 2026-07-17 so, kein heutiges Update beteiligt.
  Fade jetzt nur noch per `<NuxtPage :transition>` auf Layout `site`.
- **Nebenbefund 4, gefixt (Davids Auftrag, 2026-09-08):** die Dashboard-
  Übersicht fragte `/api/admin/comments?status=reported` auch in Apps ohne
  comments-Layer ab (404 in der Konsole von pukalani.studio) — die Capability
  hatte der Admin, die Route nicht die App. Die Schnellmoderations-Karte hängt
  jetzt am Registry-Eintrag `pukalani.admin.modules` (id `comments`), dem
  expliziten Vertrag statt eines Layer-Imports. Playwright gegen den lokalen
  Prod-Build: 0 Konsolenfehler, 0 Anfragen ≥ 400, Karte weg, Navigation intakt.

**Gelernt:** (1) Eine globale `app.pageTransition` mit `mode: 'out-in'`
verträgt sich nicht mit Seiten, deren Wurzel ein Fragment ist
(`UDashboardPanel`, jede Seite mit zwei Wurzelknoten) — es gibt keinen
Fehler, keine Warnung im Prod-Build, nur eine leere Seite; im Vite-Dev tritt
es fast nie auf, weil die Seite dort ohne eigenen Chunk vor dem Fallback
aufgelöst ist. Transitionen gehören je Route gesetzt, nie global über ein
Dashboard. (2) Ein per Extension gesteuerter Chrome-Tab liegt in einem
VERSTECKTEN Fenster: `requestAnimationFrame` und damit jede CSS-Transition
stehen dort still — „hängende" Übergänge in so einem Tab sind ein Messfehler,
kein Befund. Für Übergänge und Animationen Playwright headless nehmen (dort
läuft rAF). (3) Wenn man selbst als derselbe Nutzer in einem zweiten
(versteckten) Tab eingeloggt ist, überschreibt dessen `away`-Heartbeat die
sichtbare Presence desselben Mandanten (Letzter-gewinnt) — „0 online" war
einmal ich selbst. (4) Google erlaubt zwei Client-Secrets je OAuth-Client;
für ein weiteres Appwrite-Projekt braucht es keinen neuen Schlüssel, nur die
gespeicherte Kopie oder einen sauberen Tausch in allen Projekten.

### AW2: Appwrite 2.0 — Server (dev + prod) und SDKs (node-appwrite 29, appwrite 27) in einem Vorhaben ✅ 2026-09-08

Anlass: die Abhängigkeiten-Seite meldete Appwrite 1.9.6 → 2.0.0 und die SDKs
26 → 29/27. Davids Entscheidungen (DECISION-LOG 2026-09-08): alles in EINEM
Vorhaben, Start sofort, Prod-Fenster nach grüner CI-E2E gegen 2.0. Vier Stufen
in Reihenfolge, weil die SDK-Majors am Server hängen:

1. **SDK 28 + Code** (Commit `2d6dbc0d`): `Health`-Service (seit 27 weg) durch
   REST-Helfer `core/server/utils/appwriteHealth.ts` ersetzt (gleiche
   Methodennamen, 5-s-Timeout, nackter 502); `account.createJWT` (seit 28
   weg) durch `users.createJWT` am Admin-Client, userId NUR aus der bewiesenen
   Session — Scope `users.write` auf allen vier Prod-Keys vorher per Probe
   belegt. Läuft gegen 1.9.6 UND 2.0 (Response-Format 1.9.6).
2. **Dev-Instanz 2.0.0** (OrbStack): Dump + Config-Backup, Upgrade-Werkzeug,
   Override nachziehen, `migrate`. Beweise: verify-onboarding 28/28,
   verify-presence-boundary 23/23, verify-site-authz 120/120 (nach Reparatur
   von zwei Skript-Drifts), Health-Pillen, JWT + WS als Nutzer, Login per Klick.
3. **CI-Wegwerf-Appwrite 2.0** (Commit `547b3ae7`): Compose aus dem Werkzeug
   abgeleitet, `-ci`-Netze/-Labels, `appwrite-geo` in der Startliste; E2E
   danach viermal grün.
4. **Prod `api.pukalani.app` 2.0.0** (05:00 UTC, Skript auf appwrite-prod,
   unter 12 min) und **SDK 29 + Web 27** (Commit `03a0bffb`, Response-Format
   2.0.0). Nachweise: Runbook docs/runbooks/APPWRITE-2-0-UPGRADE.md.

**Gelernt:** (1) Das Upgrade-Werkzeug 2.0.0 ignoriert `--no-start`, startet
die Container OHNE `docker-compose.override.yml` (explizites `-f`) und lässt
`migrate` aus — Traefik-XFF und SMTP-Patch waren nach dem Lauf weg, ein
eigenes `docker compose up -d` + `migrate` gehört IMMER hinterher. (2) Eine
1.9.6-Patchdatei in einem 2.0.0-Container ist falsch (52 Diff-Zeilen) — je
Version eine eigene, die Override erst im Fenster umstellen. (3) `MYSQL_ROOT_PASSWORD`, nicht
`MARIADB_ROOT_PASSWORD`: mit der falschen Variablen ist der Dump 20 Byte groß
und nur am `ls` zu erkennen — der Prod-Ablauf bricht deshalb unter 100
Tabellen ab. (4) Beweis-Skripte rosten: `verify-site-authz` war seit der
Zod-Härtung (Name ≥ 2) und der Einladungs-Drossel (F57, 5/min je IP) bei 117
von 120, ohne dass es jemand sah — wer ein Skript als Beweis nimmt, liest die
roten Zeilen, bevor er sie dem Server anlastet. (5) Der Dev-traefik hängt
CI-Container in seine Router, wenn Label und Netz gleich heißen (beide lesen
denselben Docker-Socket) — `-ci`-Suffixe sind Pflicht für jeden lokalen
Nachstell-Versuch. (6) `users.createJWT` braucht `users.write`; vor einem
Deploy, der ein neues SDK-Verfahren nutzt, die Prod-Keys per Wegwerf-Probe
(create → jwts → delete) prüfen statt annehmen.

### Brand Foundation als Guidelines (BF1): Leseansicht, Teilen, Beispiel, Richtung — die Foundation als Markenhandbuch ✅ 2026-09-07

**Was:** Das Ergebnis-Dokument des Brand-Wizards („Euer Branding", die Arbeitsansicht mit
Abnahme und Prüfblick) hat eine zweite Ansicht bekommen: die **Brand Foundation** liest dieselben
bestätigten Werte als Markenhandbuch — zwölf Kapitel im klassischen Guidelines-Aufbau (Story,
Kontext, Purpose/Vision/Mission, Positionierung, Architektur, Werte, Stimme mit Do & Don't,
Manifest, Tagline & Messaging, Name, visuelle Schranke, Regeln für KI-Texte), teilbar per Link,
druckbar, ohne einen neuen KI-Aufruf. Anlass war Davids eingefügte Brand-Guidelines-Definition
(2026-09-05); Konzept, Prototyp (Playground, Davids Abnahme), fünf Pakete, Abnahme aller vier Blicke
am 2026-09-07. Plan (ausgeführt): [archiv/BRAND-FOUNDATION-LESEANSICHT.md](archiv/BRAND-FOUNDATION-LESEANSICHT.md).

**Davids Entscheidungen** (alle nach Empfehlung, DECISION-LOG 2026-09-05/07): Name „Brand
Foundation" (kein Konflikt mit dem bezahlten „Brand Book"), nur Festlegungen (Registry-Feld
`audience` neben `sensitivity`), visuelle Kapitel sichtbar gesperrt mit Begründung, Browser-Druck
statt Server-PDF; für G4 kuratierter Richtungen-Katalog, drei Richtungen je Archetyp, kein Preis
an der Schranke (Studio-Angebot), Wahl in der Werkstatt.

**Pakete (alle auf main, alle in Prod):**
- **Konzept + Prototyp** `418c5bd0`, `b54ba7e1`, `8fc82e21`, `fa686cac` — Konkurrenzanalyse mit
  Quellen (Frontify, Corebook°, standards.site, Brandkit, Lovable …), Dummy im Playground mit EINEM
  Renderer (`FdChapter`) für private und geteilte Ansicht, Inhaltsverzeichnis als `UPageAside` +
  `UContentToc` (Davids Wunsch), dann auch auf der echten Dokument-Seite `26bd2378`.
- **G1 `daa5eec0` — Regel + Renderer.** `audience: 'foundation' | 'internal'` je Session
  (31/37, Ausnahmetabelle per Test genagelt), `sessionTravels` = public UND foundation als EINE
  Regel hinter `brandShareableSlotValues` (den `sensitivity`-Filter hatte die Nachbar-Sitzung mit
  MV1 M5 am selben Tag geschlossen — kein zweiter daneben), purer Renderer `buildBrandFoundation`
  in `shared/brandFoundation.ts` (Snapshot-Form rein, Kapitel + Blöcke raus, Texte als
  i18n-Schlüssel). Drei Zuordnungen nach dem Konzept entschieden (d.emotion, e.composition
  foundation; b2.roleOfMaster internal).
- **G2 `6f2020e5` — private Leseansicht + Print.** Route + Seite `/brand/:id/foundation`,
  `BwFoundationChapter` (aus dem Dummy, plus `choice`-Zweig), generische `BwReadingToc` für
  Dokument UND Foundation, Rail-Einstieg „Brand Foundation" (immer erreichbar, ehrlicher Zustand),
  „Auf einer Seite", Export-Menü mit drei gesperrten Formen, 60+ i18n-Schlüssel mit Wächter aus
  einem echten Renderer-Lauf.
- **G3 `59516f76` + Core `f51b88d2` — Teilen sichtbar.** Zustands-Route, Teilen-Dialog (Link
  genau einmal, Kopieren, Widerrufen, Rotation), öffentliche Seite `/brand/share/:token` (Layout
  `false`, Schutz-Köpfe, `noindex` + og), Ereignisse ohne Token/Inhalt, Alt-Snapshot-Filter beim
  Lesen; Beweis `packages/brand/scripts/verify-brand-share.mjs` 36/36, Gegenprobe
  `VERIFY_EXPECT_LEAK=1` ⇒ 31/36 rot. Prod-Bestand `brand_shares` vor dem Deploy: 0.
- **G5 `e1d513d0` — Beispiel Kailua.** `/beispiel/kailua-coffee` auf branding.supply,
  indexierbar, fester Snapshot `shared/examples/kailuaCoffee.ts` (27 reisefähige Slots, 14
  Prüfungen inkl. Schmuggel-Gegenprobe), Startseiten-Teaser zurück.
- **G4 `65a9af3d` — Schranke + Richtung.** Katalog `shared/brandDirections.ts` (sechs
  Richtungen, jeder Archetyp in genau drei), `suggestBrandDirections`, `BwDirectionCard` mit
  lokalen CSS-Variablen ohne Web-Schriften, Weiche im Karten-Editor der Werkstatt
  (`result.direction`, Werkstatt kennt die Archetypen über `sourceValues`), Kapitel 10 zeigt
  Richtung + Farbwelt vor der Schranke; Wahrheit = bestätigter Slot, `presetId/presetVersion` im
  Snapshot daraus.

**Beweise:** je Paket Lint, brand-Tests (am Ende 1967), Typecheck der branding-App, i18n- und
Sessions-Wächter; Live-Durchspielungen am Dev-Server mit einer geseedeten Testmarke (eigene Marke
200, fremde 404, keine Rohantwort in Antwort/DOM, Druck-Emulation, Richtung wählen → Kapitel 10 →
Snapshot); Prod-Beweis je Paket der Live-Build-SHA von branding.supply.

**Gelernt:** (1) Nuxt UI registriert die Content-Komponenten (`UContentToc`, `UPageAside`) NUR mit
`ui.content: true` oder installiertem `@nuxt/content` — ohne den Schalter bleibt `<UContentToc>`
ein unaufgelöstes Element mit leerer Spalte und nur einer Vue-Warnung; ein laufender Dev-Server
übernimmt eine Layer-`nuxt.config`-Änderung nicht (Neustart). (2) `UContentToc` schiebt beim Klick
den Hash in den Router, der scrollt das FENSTER — in einer scrollenden Bühne muss die Seite selbst
per `scrollIntoView` springen; die Hervorhebungs-Linie rechnet mit fester Zeilenhöhe (1,75 rem),
zweizeilige Einträge setzen sie an den falschen Eintrag. (3) Das Workspace-Layout hält `100dvh` +
`overflow: hidden` auch auf Papier — der Druck endete nach der ersten Seite; der Dummy hatte kein
Layout, deshalb fiel es erst an der echten Seite auf (`@media print` im Layout). (4)
`frame-ancestors 'none'` war über `registerEmbeddableRoute` nicht ausdrückbar und verlor gegen den
Core-Default `'self'` im `render:response`-Hook — jetzt eine Verbots-Registry, Verbot schlägt
Erlaubnis; ebenso setzte `html-no-cache` sein `no-cache` über einen am Event gesetzten `no-store`.
(5) Appwrite schreibt Zeitstempel als `+00:00`, `toISOString()` als `Z` — wer Zeichenketten
vergleicht, sieht zwei Fristen. (6) Ein Befund im Konzept war schon geschlossen, bevor G1 begann
(MV1 M5) — „erst main prüfen" gilt auch mitten im Paket, sonst entsteht ein zweiter Filter für
dieselbe Frage. (7) Beweise mit dem versteckten Browser-Pane liefern widersprüchliche Messwerte
(JS-Scroll wird beim Screenshot zurückgesetzt) — für Mess-Beweise den Playwright-Browser mit festem
Viewport nehmen. (8) Ein Agent hat einmal ins Hauptrepo statt in den Worktree geschrieben — der
Auftrag nennt seither den Worktree-Pfad ausdrücklich und verbietet den Wechsel.

---

### Marktvergleich (MV1): Layer `market`, Behauptungs-Raum einer Kategorie mit Beleg, Bericht mit UWG-Riegel ✅ 2026-09-06

**Was:** Davids Produktgedanke vom 2026-09-04 („Konkurrenzanalysen … wo sich unsere Marke am
Markt am besten positionieren sollte") — geplant, freigegeben, gebaut und auf branding.supply
in Betrieb genommen. Strategie + Konzept mit acht Entscheidungen (DECISION-LOG 2026-09-05),
Prototyp M0/M0b abgenommen, §7 als Erweiterung aus der Prototyp-Runde (ein Motor drei
Ansichten · vier Kandidaten-Quellen · KEIN zweiter Score · erweiterter Abruf · KI-Aussensicht);
Plan jetzt [archiv/BRAND-MARKTVERGLEICH.md](archiv/BRAND-MARKTVERGLEICH.md).
Das Produkt zeigt den **Behauptungs-Raum** einer Kategorie — was Wettbewerber auf ihren
Websites SAGEN, übersetzt in die Feldstruktur der Brand Foundation, jede Aussage mit Zitat und
Quelle. Bewusst KEIN Ranking, kein Score je Wettbewerber, keine Aussage über Markterfolg.

- **M1 `475aeabd` — Layer + Vertrag.** `market` montiert in `apps/branding` (Manifest,
  `extends`, `LAYER_ORDER`, Schema-Parity-Soll), Gate `pukalani.market.enabled`.
  Der EINZIGE Griff über die Paketgrenze ist `packages/market/server/contracts/brandContract.ts`
  (Abruf, Besitz mit 404 statt 403, Slot-Registry, Kaskade), ESLint kennt dafür einen benannten
  Block. Drei Tabellen `market_competitors` / `market_profiles` / `market_reports`
  (market-001…003, server-only, MEDIUMTEXT, Indizes über `createIndexSteps`), Lösch-Kaskade als
  Registry in `brand` und ein eigener `registerUserDataContributor` (Rohtext bleibt aus der Auskunft).
- **M2 `1bb5c55f` — Abruf, Extraktion, Aussensicht.** Geteilter Mehrseiten-Abruf im brand-Layer
  (`brandSiteCrawl.ts`, `fetchBrandDocument` additiv), eigener Absender
  `PukalaniMarketBot/1.0`, robots-Parser nach RFC 9309, **vier anerkannte Formen des
  Nutzungsvorbehalts** (TDM-Kopfzeile, `tdmrep.json`, `noai`-Meta, `tdm-reservation`-Meta;
  fail-closed bei Zweifel, ein Vorbehalt schliesst den ganzen Wettbewerber aus), Pfad-Sperrliste
  (Personenbezug, Rechtstexte, Funktions- und Tagesaktuelles), PII-Filter, 8 Seiten / 2 MB /
  20 000 Zeichen je Seite / 60 000 je Lauf. Extraktion mit **drei deterministischen Riegeln**:
  Zod fail-soft je Feld · Beleg-Riegel (Zitat muss wörtlich im Rohtext GENAU der genannten Seite
  stehen, sonst fliegt das Feld) · Häufigkeit wird im Code gezählt, nie vom Modell übernommen.
  KI-Aussensicht (`market-ai-1`) nur mit Konsens ≥ 2 verschiedener Modelle, in eigener Spalte,
  ohne Einfluss auf irgendeinen Score.
- **M3 `11be1ef4` — Vergleich + Befunde.** Ein Modellaufruf (`market-r-1`) über eigenes Profil
  + N Marktprofile ⇒ Matrix, Konventionen, Überschneidungen, freie Stellen. **§ 6 UWG-Riegel in
  drei Lagen:** Anonymisierung im Prompt (das Modell sieht `c1…c5`, nie einen Namen),
  Prompt-Regel, Filter im Code über JEDES erzeugte Element (Name inkl. Teil-Token,
  umlaut-normalisiert, Domain, Wortliste herabsetzender Ausdrücke) — ein Treffer VERWIRFT das
  Element. Markt-Befunde als `kind: 'market'` in `brand_findings` (Migration **brand-018**,
  additiv), höchstens drei je Bericht, sperren nichts, ERSETZEN statt dazulegen.
  `revisionKey`/`stale` aus derselben Rechnung — ein überholter Bericht bleibt lesbar.
- **M4 `8e936691` + `0add6133` — Oberfläche.** Seite „Markt" als Ebene-1-Seite der Werkstatt in
  fünf Zuständen, Quellen-Wähler über vier Quellen (Website · eigene Brandings · Bibliothek ·
  freigegebene fremde Marken), Opt-in `brand_profiles.marketVisibility` (**brand-019**, Semantik
  wie das Brand-Check-Ranking, nie eine `ownerId` in der Antwort), Leisten-Erweiterungspunkt
  generisch in `brand` (nennt nirgends ein Produkt), Schranke `resolveMarketPaywall` mit
  `studio_cta_erstgespraech`. Der Nachfix zog das Gate auf alle drei Flächen.
- **M5 `ae3b70d7` — Betrieb.** Rohtext-Frist 24 h mit Sweep alle 30 min (Takt hängt am Layer,
  nicht am Produkt-Gate; Fail-Richtung umgekehrt: kein Stempel ⇒ löschen; der Sweep fasst die
  Belege NIE an), Erklärseite `/market-bot` (bewusst ohne Produkt-Gate), Vertraulichkeits-Nachweis
  als Typ-Form, Bewertungs-Route, Runbook + interne Doku-Seite.
- **M6 `0c2070bc` + M6b `66377315` — Bibliothek.** Werkzeug mit vier Modi, das den KUNDENWEG
  benutzt (Wegwerf-Konto, echte Route, dieselbe Kette) statt einer zweiten Pipeline; das Tor ist
  ein ZUSTAND (`status: 'verified'`), keine Zusage. Trockenlauf gegen zehn echte Hosts,
  Kostenschätzung, Rechts-Check-Memo (Anhang G, sechs Anwaltsfragen). M6b: die zwei ERFUNDENEN
  Einträge sind aus dem Produkt heraus, `the-barn` (9 Felder) und `apple` (5, `purpose`
  gestrichen) nach Davids Handprüfung übernommen — Fassung `lib-3`.

**Beweise:** `packages/market/scripts/verify-market-fetch.mjs` **33/33** ·
`verify-market-report.mjs` **45/45** · `verify-market-ui.mjs` **46/46** ·
`verify-market-retention.mjs` **51/51** (je gegen echte Routen, echte Ablage und erfundene
Websites auf eigenen `node:http`-Servern) · **213 Unit-Tests** im market-Layer, dazu
`brandSiteCrawlParse`, `brandFindings`, `brandWorkspaceNavExtras`, `brandSharing`,
`conversePrompt` im brand-Layer — jeder mit Gegenprobe.

**In Betrieb (2026-09-06):** Prod-Migrationen `brand-018/019` + `market-001…004` auf der Instanz
`branding` mit Davids ausdrücklichem Ja gefahren (zweiter Lauf komplett „existiert bereits",
`ops:schema-parity` grün), Gate-Flip als eigener Commit `9e984253` (auf `main` als Merge
`f7bd9fe4`), Rauchtest in Produktion von David bestanden, Seiten abgenommen. Erster bezahlter
Bibliothekslauf ≈ $0,11 für fünf Extraktionen. Runbooks:
[MARKTVERGLEICH-EINFUEHRUNG.md](runbooks/MARKTVERGLEICH-EINFUEHRUNG.md) (Durchlauf abgehakt) und
[MARKTVERGLEICH-BIBLIOTHEK.md](runbooks/MARKTVERGLEICH-BIBLIOTHEK.md).

**Gelernt: Cross-Layer-Re-Exporte gehören in `server/contracts/`, nie in `server/utils/`** —
Nitro auto-importiert `server/utils/**`, und die Re-Exporte des Vertrags hätten dort die
gleichnamigen Symbole des eigenen Layers geschattet. Ein Vertrag, den man versehentlich
benutzt, ist keiner.

**Gelernt: ein Gate muss ALLE Flächen schalten — Seite, Leiste und Routen.**
`pukalani.market.enabled` schaltete zuerst nur die Seite: die Leiste zeigte „Markt" weiter
(Klick ⇒ 404), und vor `/api/market/**` stand allein die core-Middleware `04.product-gate.ts`,
die den LAUFZEIT-Zustand prüft und einen fehlenden Eintrag bewusst als „an" durchlässt. Ohne
den Nachfix wäre mit dem Deploy etwas SICHTBAR geworden, bevor die Migration lief — genau die
Reihenfolge, die das Runbook verbietet.

**Gelernt: je Beweis-Skript ein FRISCHER Dev-Server-Prozess.** Die Drossel-Eimer leben im
Prozess; ein zweiter Beweis gegen denselben Server erbt die Zählerstände des ersten und meldet
in einem beliebigen Schritt eine 429. Genau so stand `verify-market-report.mjs` bei 42/43 — mit
eigenem Prozess 43/43. Ein Beweis, der die Reihenfolge seiner Nachbarn mitmisst, misst nicht das
Produkt.

**Gelernt: `aiEnabled` ist ein KONFIG-Flag, kein Schlüssel-Beweis.** Der erste bezahlte
Bibliothekslauf lief mit eingeschaltetem Gate, aber ohne `NUXT_AI_KEY` in der Dev-Env — fünf
Extraktionen kamen leer zurück, und im Log stand fünfmal `message: ""`. Grund: H3-Fehler
(`createError`) tragen die Aussage in `status`/`statusText`, nicht in `message` („AI not
configured" ist ein 503). Wer eine Anbieter-Meldung protokolliert, protokolliert beide Felder
(`describeProviderError` in `marketExtract.ts`, Commit `4fbb1a79`).

**Gelernt: erfundene „verified"-Einträge waren in PRODUKTION sichtbar — Fixtures gehören nach
`tests/`, nie in ausgelieferte Daten.** Die zwei `.example`-Marken waren als Platzhalter
richtig, solange die Mechanik ohne Inhalt lief; mit dem Gate-Flip standen sie im Quellen-Wähler
zahlender Kunden, mit einem Prüfsiegel, das niemand geleistet hatte. Sie leben jetzt als
`tests/fixtures/marketLibraryFixture.ts`, und die Test-Sperre ist UMGEDREHT: echter Host,
Prüfdatum nicht in der Zukunft, Beleg vom Auftritt der Marke selbst.

**Gelernt: Konzeptarbeit braucht denselben Blick auf `main` wie Code.** §7 wurde geschrieben,
während der Brand-Check (BC1) längst gebaut auf `main` lag — die Erweiterung plante einen
zweiten „Klarheits-Score" neben einem Score, den es schon gab. Der Blick auf `main` noch am
selben Abend hat ihn gestrichen und daraus „ein Motor, drei Ansichten" gemacht. Davids Regel
vom 2026-08-02 gilt nicht nur für Codemods.

**Gelernt: „die Grossen sperren" stimmt per BOT-ABWEHR, nicht per `Disallow` — und
JS-Seiten liefern ohne Headless-Browser keinen Text.** Acht von neun Konzern-Websites erlauben
unserem Absender alles; wer sperrt, antwortet schon auf die `robots.txt` mit 403 (adidas,
OpenAI, Counter Culture). Ein Werkzeug, das nur `Disallow` liest, hielte das für einen
Netzwerkfehler und versuchte es beim nächsten Lauf erneut. Umgekehrt sind sevDesk und
FreshBooks technisch offen und trotzdem unbrauchbar: ihr Text entsteht erst im Browser.

**Gelernt: der Share-Link las `sensitivity` nie — das BF1-Versprechen wurde erst durch M5
eingelöst.** `BrandSessionConfig.sensitivity` trug seit BF1 wörtlich „was per Share-Link und
Export standardmässig NICHT reist", und `confirmedSlotValues` lief beim Veröffentlichen über
ALLE bestätigten Slots: vier interne Sessions (`a.competitors` mit Wettbewerber-Namen und
notierter Schwäche, `a.complaints`, `a.challenge`, `a.facts`) waren dreissig Tage lang für
jeden mit dem Token lesbar. Gefunden hat das kein brand-Audit, sondern der Versuch, einen SATZ
AUS EINEM ANDEREN PLAN zu beweisen („vertraulich wie `a.competitors`") — ein Beweis, der einen
fremden Massstab benutzt, prüft auch den Massstab. Fix additiv in `brandSharing.ts`
(fail-closed), nicht in `confirmedSlotValues`.

**Nachzug 2026-09-06 (BC1-Rest + 90-Tage-Regel, zwei Opus-Läufe parallel):** (a) Die
Check-Mechanik ist aus `check.post.ts` als `runBrandCheck(event, input)` herausgezogen
(`packages/brand/server/utils/brandCheckRun.ts`; Reihenfolge Cache → Profil → Buchung →
Abruf → Urteil → Zeile byteweise erhalten; `profileId` darf eine Funktion sein, damit ein
Cache-Treffer keine Besitz-Abfrage kostet; `Retry-After` setzt nur noch die Route, weil ein
zweiter Aufrufer es sonst auf eine 200 stempelte). `decideBrandCheckMode` hat den dritten
Eingang `quota: 'account'` (Konto-Eimer OHNE Cache-Umgehung — vorher hing beides an
`force`). Der Marktvergleich-Lauf stösst für jeden GELESENEN Website-Kandidaten ohne Check
einen an — synchron vor dem Bericht (h3 1.15 exportiert kein `waitUntil`, ein schwebendes
Promise nähme unter pm2 den Prozess mit), Wanduhr 120 s, fail-soft je Kandidat; per robots.txt
Ausgeschlossene und ausgeblendete Zeilen bleiben ohne Score. brand 1906 / market 232 Tests.
(b) 90-Tage-Regel als pure Datei `marketLibraryAge.ts` (eigene Datei, weil das Werkzeug
Produkt-Regeln als `.ts` lädt und `marketLibrary.ts` über zod/marketProfile für Node-ESM
unerreichbar ist), `now` immer Parameter (Grenze 90 = frisch, 91 = stale, unlesbares Datum =
stale), `--check` zeigt das Alter, `--stale` (Exit 1) als Andockstelle für einen Cron,
`--now` zum Vorführen; Quellen-Wähler zeigt „Handgeprüft am …“ (UTC-Datum, `stale` vom
Server). **Bewusst nicht gebaut:** Mehrseiten-Abruf im Brand-Check (Produktfrage, Empfehlung
„Startseite bleibt“), Zeitplan für `--stale`. **Gelernt:** ein Nachzug, der eine Route in
eine Funktion zerlegt, ist nur dann keine Verhaltensänderung, wenn die Reihenfolge der
Kostenstellen als Test festgenagelt ist — deshalb `profileId` als Funktion statt als Wert.

**Live-Beweis 2026-09-08 (selbst geklickt, Davids freigegebener Chrome):** Krume & Gold ist die
einzige Brand mit abgenommenem Kapitel B und hatte KEINEN Wettbewerber — der Knopf „Markt
vergleichen“ war deaktiviert, Davids drei Klicks lösten nie einen Request aus, das Log blieb
leer. Wettbewerber `zeitfuerbrot.com` eingetragen → Lauf 42 s: `market.run_started` (1
Kandidat) → `market.extracted` (6 Seiten, 5 belegte Felder) → `market.run` →
**`brand.check_completed` Score 82** → `market.brand_checks` (open 1, ran 1, skipped 0) →
`market.report` (4 Konventionen, 3 freie Stellen, 3 Befunde). Kandidatenkarte zeigt „82 ·
Ausgezeichnet · Zum Brand-Check“. Dazu die Lauf-Route mit `market.run_requested` (vor jeder
Prüfung, nur Session ja/nein), `market.run_rejected` (Gate/Session/Besitz/locked/no_competitors/
Drossel als Code) und `market.run_started` — 4xx protokolliert der zentrale Handler nicht, und
genau das machte die Diagnose drei Runden lang unmöglich.

**Gelernt (Davids Rückfrage „wieso testest du das nicht immer direkt mit?“):** Eine
Live-Meldung ohne selbst durchgeführten Klick — auch hinter dem Login, Davids Chrome ist
freigegeben — verlagert den Test auf David und lässt Bedien-Ursachen (deaktivierter Knopf)
unsichtbar, weil sie nie den Server erreichen. Regel: den entscheidenden Klick selbst machen,
Netzwerk + Konsole + Server-Log zusammen lesen; nur vor echten Geld-Aktionen fragen.

### H1: Leere `UTable`-Spaltenköpfe (stille Hydration-Fehler) — 40 Stellen in 15 Layern behoben ✅ 2026-09-06

**Was:** Folgepunkt aus dem Brand-Check-Ranking: `header: () => ''` in einer `UTable`-Spalte
meldet im Browser „Hydration completed but contains mismatches" OHNE Knoten-Warnung — Vue
schreibt leeren Text beim SSR nicht (`<th><!--[--><!--]--></th>`), legt beim Hydrieren aber
einen leeren Textknoten an, und `hydrateFragment` loggt ohne `warn`. Statt 40 Einzel-
korrekturen EIN Helfer im Core: `srOnlyHeader(label)` (`packages/core/app/utils/tableHeader.ts`,
auto-importiert in allen Layern) rendert `<span class="sr-only">` — behebt den Fehler und gibt
Screenreadern den Spaltennamen. Leeres Label WIRFT im Dev (ein Fallback auf ein Leerzeichen
würde die Falle nur umbenennen), fällt in Prod still auf ein echtes Leerzeichen zurück. Vier
generische Schlüssel `ui.table.actions/select/drag/vote` (de+en). 40 Spalten in 36 Dateien
umgestellt (admin 4 · brand 4 · control 6 · posts 4 · comments/courses/events/onboarding/pages/
themes je 2 · billing/core/feedback/media/runner je 1). Gates: `pnpm -r lint` 0 Fehler,
`pnpm -r typecheck` 12 Pakete grün, core 1430 Tests, i18n-Wächter grün.

**Beweis (echtes Vorher/Nachher, comments-Dev-Server aus dem Worktree, Seed-Konto):**
`/de/dashboard/comments` nachher ohne Meldung und mit `<span class="sr-only">Aktionen</span>`
im letzten `<th>`; dieselbe Zeile testweise auf `header: () => ''` zurück ⇒ die Meldung 2× und
`<th><!--[--><!--]--><!--]--></th>`; wieder behoben ⇒ weg. Drei SSR-Ladungen (comments,
core-SessionsTable mit bedingtem Spread, themes) mit 0 Konsolen-Fehlern.

**Gelernt:** (1) Ein Hydration-Fehler ohne Knoten-Warnung heisst nicht „Datum/Locale", sondern
oft „leerer Text aus einer Renderfunktion" — Bisektion über Spalten/Slots findet ihn. (2) Bei
`select`-Spalten rendert Nuxt UI den `#select-header`-Slot, die `header`-Funktion greift dort
nicht — die Umstellung ist trotzdem richtig (konsistent, wirkt bei Slot-Wegfall). (3) Ein
Wiederholungs-Muster über viele Layer gehört als EIN Helfer ins Fundament, nicht als 40 Kopien.

### Brand-Check als Produktseite (BC1 P1–P6): Startseite, Ranking, Vergleich, Meine Brands, Ergebnisseite v2 ✅ 2026-09-05/06

**Was:** Davids Auftrag nach dem ersten Live-Check („eigene Seite, Teaser zeigen dorthin, Archiv/
Ranking, Quartett-Vergleich, Score neu ermitteln mit Gegenüberstellung, To-dos") — Konzept
docs/archiv/BRAND-CHECK-SEITE.md, vier Entscheidungen per Fragenrunde (Ranking nur mit Opt-in,
Branche per KI + Korrekturvorschlag, Dokument-Check sofort, Konto-Deckel 10/Tag; DECISION-LOG
2026-09-05), Visualisierung nach externem Input festgezogen (Markenabdruck, Ampel-Matrix,
Stärke · Chance · Nächster Schritt; §10). Sechs Opus-Läufe, meist zu zweit/dritt parallel im
selben Worktree (i18n nur per Edit, Dateibesitz je Lauf), jeder im Fable-Hauptloop geprüft:
- **P1** `/brand-check` (Formular, Reiter, Marketing, FAQ+JSON-LD, Opt-in-Häkchen), Teaser auf
  Start/About/Team · **P2** Migration **brand-017** (industry, rankingOptIn, hidden, userId,
  profileId, source; Tabelle `brand_check_corrections`), Branche im Judge (check-judge-2),
  force/Konto-Deckel, Ranking-API (je urlKey der jüngste Opt-in-Check, Microcache 60 s),
  Korrektur-Routen, hidden-Flag · **P3** Ranking-Seite (Filter, Sortierung je Kategorie,
  Zwei-Häkchen-Vergleich), Korrekturvorschlag auf der Ergebnisseite, Betreiber-Warteschlange
  `/dashboard/brand-check/corrections` · **P4** Vergleich mit zwei überlagerten Markenabdrücken
  (`BwBrandFingerprint`, Inline-SVG) + acht Duell-Zeilen · **P5** Dokument-Check
  (`POST /api/brand/profiles/:id/check`, Fundament-Reife `doc-score-1`, urlKey `doc:<profileId>`),
  Verlauf + `diffBrandChecks`, `pickBrandCheckTodos`, Score-Seite je Brand · **P6** Ergebnisseite
  v2 (Fazit-Bento, Delta zum Vorgänger, Rang, Markenabdruck, acht OFFENE Kategorie-Karten in
  eigener Section — Davids Zuschnitt —, Ampel-Matrix 8×5, Verbesserungsplan mit exakt
  gerechnetem „+X Punkte" je Kriterium), Vergleichs-Insights-Bento (Gesamtbild, Bilanz,
  Abstände ≥ 25 mit Kriterien-Belegen beider Seiten), Brand-Scores-Liste `/dashboard/brand-scores`.

**Abgenommen 2026-09-06 (David):** Ranking, Vergleich, Ergebnisseite , der Dokument-Check („Fundament prüfen") und „Neu ermitteln" (Cache-Umgehung gegen den Konto-Deckel) auf /dashboard/brand-scores live getestet — damit ist jeder Pfad des Pakets einmal echt gelaufen — „hat
geklappt"; Plan nach docs/archiv/BRAND-CHECK-SEITE.md verschoben.
**Live-Beweise:** pukalani.app (89, Branche `software` vom Judge) und freelancer.supply (61,
`personal`) mit Opt-in im Ranking; Vergleich beider 200 mit Markenabdruck; Korrektur- und
Score-Routen registriert. Nicht live durchgespielt (Login + echte KI-Kosten): Dokument-Check,
Neu-ermitteln, Korrektur-Annahme — per Route-Tests mit Attrappen abgesichert.

**Zwei Live-Fehler danach:** (1) Ranking sprang nach dem SSR auf 500 — `''` als Wert für „Alle
Branchen" im `USelect` (Reka verbietet leere `SelectItem`-Werte, die bekannte Falle) ⇒ Sentinel
`all`. (2) Stille Hydration-Fehler im Ranking: `header: () => ''` in einer `UTable`-Spalte — Vue
schreibt leeren Text beim SSR nicht, legt beim Hydrieren aber einen Textknoten an; der Zweig
loggt ohne Knoten-Warnung. Kur: echte `sr-only`-Beschriftung. Dasselbe Muster steht ~40-mal in
anderen Layern (comments, posts, core/SessionsTable, runner) — als Folgeaufgabe notiert.

**Gelernt:** (1) Parallel-Läufe im selben Worktree funktionieren, wenn jeder Lauf einen
Dateibesitz hat und geteilte Dateien (i18n) nur per Edit angefasst werden — ein Lauf hat trotzdem
eine Datei des anderen verwaist (`createdAt` nach Ersatz durch eine Komponente); das fängt nur
der Lint auf dem GESAMTSTAND. (2) Ein Lauf, der `.env`/Vorschauseiten anlegt, muss sie löschen —
und der Nachbar darf sie nicht „reparieren"; der eine TS-Fehler in `cmp-preview.vue` war genau
das. (3) Eine `''`-Option in einem Reka-Select ist kein Build-Fehler, sondern eine 500-Seite
NACH dem SSR — die Seite „steht kurz und springt". (4) Leere Spaltenköpfe in `UTable` erzeugen
Hydration-Fehler ohne Knoten-Warnung; Bisektion (Spalten einzeln ausschalten) findet sie.

### Brand-Check als Instrument: Website → Brand Score, 8 Kategorien, 3 Befunde ✅ 2026-09-05

**Was:** Davids Auftrag „mach mit dem brand-check instrument weiter" — der kostenlose
Aussen-Check der Startseite aus BRAND-WIZARD-PHASE-1 („Brand Score", Bewertungsmodell v2)
als baubares Instrument konzipiert (docs/archiv/BRAND-CHECK.md, 40 Kriterien in 8
Kategorien ausformuliert) und nach drei Entscheidungen Davids (Hybrid-Zugang: Score sofort,
Report per Mail über die Warteliste · mit dem Kriterien-Entwurf bauen · Ergebnis teilbar mit
`noindex`) in einem Opus-Lauf gebaut, im Fable-Hauptloop geprüft, live auf branding.supply:
- **Katalog + Rechnung pur** (`packages/brand/shared/brandCheck.ts`): 16 messbare + 24
  KI-beurteilte Kriterien, Gewichte 15/15/15/15/10/10/10/10, Bänder 94+/88/80/70/60/50,
  `scoreVersion` in der Zeile; nicht bewertbare Kriterien fallen aus der Normalisierung
  (Schloss statt 0). Die 16 Messwerte (`brandCheckMeasure.ts`) rechnen aus
  `extractSiteSignals()` (Kopf-Metadaten, Überschriften, Alt-Texte, CTA-Texte, JSON-LD,
  Mojibake/Doppel-Escapes) — deterministisch, ohne KI.
- **EIN Judge-Aufruf** für alle 24 beurteilten Kriterien (`brandCheckJudge.ts`,
  temperature 0, ZDR-Routing wie der Wizard, 12.000 Zeichen Seitentext, Pflicht-Beleg
  ≤ 160 Zeichen in Originalsprache); Antwort wird Eintrag für Eintrag geprüft — fremde Ids
  verworfen (ein Modell kann kein GERECHNETES Kriterium überschreiben), fehlende = `null`.
- **Route** `POST /api/brand/check`: Honeypot → `urlKey` → **7-Tage-Cache** je URL (0 KI-Kosten
  beim zweiten Aufruf) → Deckel **3/Tag je IP-Hash** (Salt aus Runtime-Key + UTC-Tag) und
  **200/Tag Instanz** (`brandAiQuota` kind `check`) → SSRF-sicherer `fetchBrandSite` → Messung →
  Judge → Score → Zeile `brand_checks` (Migration **brand-016**, mit Davids Ja gefahren; Parität
  25/25). Judge-Fehler ⇒ 503 `check_unavailable` und NICHTS gespeichert — ein „Score" aus 16
  von 40 Kriterien misst etwas anderes, als er behauptet. Kein Seitentext in der Zeile, nur
  Belege.
- **Client:** `BwBrandCheckForm` (Startseiten-Karte, drei Statuszeilen, Fehler je `reason`),
  Ergebnisseite `/brand-check/<id>` (SSR, Score-Ring, 8 Balken, 3 Befunde mit Beleg + nächstem
  Schritt, Relaunch-CTA, „Report per Mail" über `BwWaitlistForm :website`, Link kopieren, 40
  Kriterien zugeklappt); 140 i18n-Schlüssel je Sprache.

**Der eine Live-Fehler (und wo er wirklich lag):** der erste echte Check antwortete 503
`check_unavailable`; Log: `[brand-check] KI-Antwort war kein JSON: ```json`. Verdacht zuerst
beim Judge (Zaun, Token-Deckel, unmaskierte Anführungszeichen) — alles ausgeschlossen. Ursache
war **`aiCompleteJson` im Core**: `raw.replace(/\}[\s\S]*$/, '}')` greift am ERSTEN `}` der
Antwort, jedes verschachtelte Objekt (`{"items":[{…}]}`) wurde dahinter abgeschnitten. Die
bisherigen Konsumenten (Triage, Übersetzung, Assist) antworten flach und haben es nie berührt;
der Brand-**Review** des Wizards erwartet `findings: [{…}]` und lief bei jedem Befund still in
`provider_error` (fail-soft — deshalb unbemerkt). Fix: pure `extractJsonObject` (erstes `{` bis
letztes `}`) + Tests (`packages/core/tests/aiJsonExtract.test.ts`), Commit `7414cacb`.
**Live-Beweis nach dem Flip:** `POST /api/brand/check` für branding.supply/de → 200 in 14,5 s,
Score 80, 38 von 40 Kriterien bewertet (a5 Bildsprache und b5 Wort-/Bildwelt ehrlich „nicht
bewertbar" — die Seite hat keine Alt-Texte), drei Befunde mit Messwert-Beleg, Ergebnisseite 200.

**Gelernt:** (1) Ein „defensiver" Regex, der nur an flachen Antworten getestet wurde, ist eine
Zeitbombe für den ersten Konsumenten mit einer Liste von Objekten — Zuschnitt-Helfer gehören
als pure Funktion exportiert und mit einem VERSCHACHTELTEN Fall getestet. (2) Fail-soft
verbirgt Fehler: der Review hat monatelang „keine Befunde" gezeigt statt zu scheitern; wer
fail-soft baut, braucht einen Zähler im Log, den jemand liest. (3) Ein Log-Ausschnitt von 300
Zeichen, der mit „```json" beginnt und danach abbricht, heisst nicht „nur der Zaun kam an" —
pm2 schneidet Mehrzeilen-Ausgaben an der ersten Zeile; erst der Regex-Test in Node hat die
Ursache gezeigt. (4) Migrations-Nummern VOR der Anlage gegen `origin/main` prüfen (013/014 waren
von der Nachbar-Sitzung vergeben → 016).

### Brand-Wizard „Branding-Atome" (BW2): Session je Feld, Spezialist, Abnahmen, Korrektur-Regel, Dokument ✅ 2026-09-04/05

**Was:** Davids Idee vom 2026-09-04 („wir dröseln alles bis ins letzte Detail auf … jeder
Einzelpunkt bekommt seine eigene Session … wie ein Designsystem aus Atomen") als Plan
(docs/archiv/BRAND-WIZARD-SESSIONS.md) in acht Opus-Läufen gebaut, jeder im Fable-Hauptloop
geprüft (Bilanz + Klick-Beweis im Browser), alle live auf branding.supply:
- **P1** Session-Vertrag `BrandSessionConfig` (alle 68 Felder), `sessionsAffectedBy` (Hülle =
  Anhang A, mit Gegenprobe), Zustand je Session, EIN Prompt-Bauer statt vier Tabellen —
  Prompts zeichengleich (Fixture unabhängig gegen origin/main regeneriert, 42/42).
- **P2/2b** Inhalte für 68 Sessions (Ziel, Qualität, Anti-Muster, Leiter, Form, Beispiele de+en);
  unabhängiger Inhalts-Audit (archiv/audits/2026-09-04-brand-session-inhalte-audit.md), Davids
  8 Entscheidungen + 5 Reparaturen; Lese-Fassung GENERIERT (referenz/BRAND-WIZARD-SESSION-INHALTE.md,
  `check:sessions` hält sie am Code).
- **P3a/3b/3c** Verlauf je Session (brand-011), Eröffnungszug, Sammel-Session (a.facts), Abnahme-
  Backend (accept/defer/restart, brand-013, Quellen-Hash beim Bestätigen), Werkstatt mit
  Unterpunkten/`?s=`/Auto-Weiter/Vertagen, Finale-Abnahme-Seite mit Restart-Layer.
- **P4** `brand_findings` (brand-014), zweistufiger Prüf-Aufruf, Kapitel-Modus, hat-mitgelesen-Block,
  adaptive nächste Session, Eimer `review`. **P5** Befund-Chips (Abnahme/Log/Bühne, Annehmen/Ablehnen
  mit Grund). **P6** Impact vor Korrektur (409 ohne Ack), Warteschlange stale, „Gilt weiter",
  `correct`-Eingrenzung fail-closed, Invarianten scharf mit toleranter Listen-Lesung.
- **P7** „Euer Branding" (Dokument = Finale Abnahme der Ebene 1) + Prüfblick auf Klick (Nachholung ≤ 10).
- **P8** Reste: Hydration-Mismatch (Ursache: Eröffnungszug im Setup statt onMounted — NICHT die
  Layout-Zweige), Team-Fassung in Platzhalter/Prompt-Etikett, toter Store-Aufruf, 404 auf dem Dokument.
- **P9** (2026-09-05, Davids Entscheidung): Werkstatt antwortet für fremde/unbekannte Brandings mit 404 wie das
  Dokument; `blocked` (kein Beta-Zugang) bleibt die ruhige Fläche. Store trennt Listen-404 (`denied`) und
  Profil-404 (`profileDenied`) — das Rennen ist strukturell zu. **Dokument-Seite von David abgenommen 2026-09-05.**
- Prod-Migrationen 011/013/014 mit Davids Ja (Runner zog 012 der Nachbar-Sitzung mit).
- Tests brand 799 → 1434; Beweis-Skript `verify-brand-sessions.mjs` 106 Zusagen.

**Gelernt:** (1) **Die Bilanz-Gate-Liste gehört in JEDEN Agent-Auftrag** — ohne `check:bilanz` ging
Paket 3 mit rotem Lint auf main (Deploy hängt an Test+E2E, nicht an Lint). (2) **Screenshots des
Browser-Panes hinken der Darstellung hinterher** — dreimal sah eine korrekte Seite leer aus; DOM
(`get_page_text`/JS) ist die Wahrheit, dann eine zweite Aufnahme. (3) **Klick-Beweise finden, was
Route-Tests nicht sehen:** Abnahme-Entscheidung erreichte den Store nicht (P5), Plural im Layer (P6)
— beides erst im Browser sichtbar. (4) **Agent-Berichte prüfen, nicht glauben:** das Fixture „vor dem
Umbau erzeugt" wurde unabhängig gegen origin/main regeneriert; die Hydration-„Ursache" aus dem
Auftrag (Layout-Zweige) war falsch, der Agent hat sie mit Instrumentierung widerlegt. (5) **Ein
Agent im Worktree blockiert Doku-Fixes** — Fix in einem Wegwerf-Worktree (`git worktree add
--detach`) und `push HEAD:main`. (6) **Parallele Sitzungen auf main**: dreimal Doku-Konflikte in
OPEN-ITEMS (BW1-Zeile von main, BW2-Zeile von uns), einmal Push abgewiesen — immer `fetch+merge`
direkt vor dem Push und danach Bilanz. (7) **`readonly`-Einwände gegen einen Kundenwunsch prüfen,
ob sie am Rahmen hängen:** „Session je Feld" schien falsch, bis David „Session" als konfigurierte
Arbeitseinheit definierte — dann fielen alle Einwände. (8) Lokale branding-Entwicklung hat weder
`.env` noch Appwrite-Projekt: Läufe nutzen `portfolio-g4ml` @ localhost + Shiki-Symlink-Krücke —
gehört eigentlich in eine `apps/branding/.env.example`-taugliche Dev-Anleitung.

### branding.supply: Warteliste-Dashboard („wie bei pukalani.app") ✅ 2026-09-05

**Anlass:** Davids Frage, ob die Warteliste wie die Frühzugang-Anfragen auf
pukalani.app auch im Dashboard bedienbar sein muss — ja: ohne Seite hiesse jede
Beta-Welle Console-Arbeit und Codes von Hand.

**Gebaut (Opus-Lauf, eigene Prüfung):** Betreiber-Modul `/dashboard/waitlist`
(admin-Layer, `users.manage`, Registry-Eintrag „Management"): Zähler je Status,
Filter (Standard „bestätigt" = Arbeitsliste), UTable, Aktionen Einladen ·
Ablehnen · Notiz, CSV-Export (BOM, Semikolon). Routen unter
`/api/brand/admin/waitlist/*`, die EINE Auslass-Naht liefert nie `tokenHash`.
**Einladen** nutzt die bestehende Code-Erzeugung aus `scripts/invite.mjs`
(jetzt `createBrandInviteForEmail`: sha256-Hash, an emailLower gebunden, 30
Tage) + Einladungs-Mail de/en; scheitert die Mail, wird der Code zurückgenommen
— kein Code ohne Mail. Pure Zustandsregeln (`brandWaitlistAdmin.ts`), 36 Tests;
Bilanz regeneriert (neue Routen). Bewusste Abweichungen vom Vorbild:
Capability `users.manage` statt `sites.manage` (branding hat keine Sites),
Ablehnen auf Abgelehntes ist ein 200-No-op, kein eigener Drossel-Eimer.

**End-to-end von David bewiesen (2026-09-05):** Eintrag über die Brand-Check-
Karte → Bestätigungs-Mail → Link → „Bestätigt" → im Dashboard sichtbar →
Einladen → Einladungs-Mail mit Code angekommen.

**Gelernt:** Der Produkt-Bilanz-Wächter zählt Routen — neue Betreiber-Routen
verlangen `node scripts/produkt-bilanz.mjs` vor dem Push.

### branding.supply: Startseite, Vektoren, Double-Opt-in, Copy-Regeln ✅ 2026-09-04/05

**Startseite** nach dem abgenommenen Conversion-Dummy (Runden 137–148): Hero-Split
mit den zwei Weiche-Optionen (eingeloggt → Anlage mit `?path=`, Gäste → /invite),
Artefakte mit visuellen Beweisen, sechs Fähigkeiten, Brand-Check als EHRLICHER
Vorab-Eintrag über die Warteliste (Instrument noch nicht gebaut — ein „Check
starten" ins Leere wäre ein toter Knopf), Abschluss-CTA. Brand Insights und
Beispiel-Branding bleiben draussen (nur echte Ziele) — offen in OPEN-ITEMS.

**Vektor-Illustrationen** (Davids Entscheidung statt KI-Fotos): sieben Inline-SVGs
(`apps/branding/app/components/Art*.vue`) aus den `--bw-`-Tokens, genau ein Acid-Pop
je Motiv, beide Farbwelten ohne zweite Fassung; Squircle-Regel per `.bw-frame`
auf Rahmen/Platzhalter/Erfolgskarte ausgedehnt (corner-shape superellipse 1.7 —
cornerKit bewusst NICHT eingeführt: Safari/Firefox-Squircles nur per JS-Clip-Path,
der unsere randlosen Schatten abschnitte).

**Double-Opt-in der Warteliste** (Opus-Lauf Server, Formular/Landeseite selbst):
`pending` + sha256-Token-Hash + 24 h, Rohtoken nur in der Mail (Base-URL
`public.appUrl`), `POST /waitlist/confirm` stempelt `confirmed` und leert den
Hash — Betreiber-Mail ERST danach; kein Mailer/Mail-Fehler ⇒ 503 statt
Schein-Erfolg. Migration brand-015 (013/014 waren von der Nachbar-Session
belegt), Drossel für beide Routen, 21 Tests. Live bewiesen: `mail_sent`, Re-Signup
erneuert den Link, 400 bei unbekanntem Token.

**Copy-Regeln (David):** Rolle vor Name — „persönlicher Markenberater"/„Team aus
Markenexperten" statt bloß „George" (SEO + Verständlichkeit; George nur mit Rolle
gekoppelt, Wizard-Chat ausgenommen). Titel-Muster „Erstellt eure eigene Marke.
Ganz einfach, im Gespräch mit eurem persönlichen Markenberater." Positionierung
BREIT (Marke), Personal Brand nur in Sub-Copy/Description; Marketing „ihr",
Wizard „du" — zwei bewusste Register.

**Gelernt:** (1) Resend lehnt `example.com`-Empfänger mit 550 ab — Probe-Adressen
für Mail-Pfade sind `delivered@resend.dev`, sonst misst man den Anbieter statt
den Code. (2) Parallel-Sessions belegen Migrationsnummern: vor dem Anlegen
`ls scripts/migrations` gegen origin/main — 011 UND 013/014 wurden am selben Tag
doppelt vergeben.

### branding.supply: About und Team als Produktseiten + Warteliste ✅ 2026-09-04

**Auftrag (David):** /about und /team trennen (erst zu leer, dann: „optimiere
Struktur, Konzept und Texte auf Verständlichkeit, Verkaufsargumente, SEO,
Lead-Generierung, Mehrwert — Vorbild Apple; Platzhalter für Bildmaterial mit
Prompt an der Stelle").

**Konzept:** ein Gedanke je Abschnitt, grosse Aussage, ein Satz, ein Bild.
About = Verkaufsgespräch in acht Schritten (Hero „Wir sind unser eigener
Beweis" · Warum es uns gibt: Agentur/Generator/George · Drei Grundsätze · So
arbeiten wir mit 45-Minuten-Versprechen aus dem abgenommenen Landing-Dummy ·
Der Beweis · FAQ mit Preis-Wahrheit „Beta kostenlos, Fundament bleibt frei,
Ableitung bezahlt" (Produktentscheidung 2026-08-27) · Frühzugang · Team-
Teaser). Team = Produktseite: George als Hauptdarsteller, je Rolle ein
Nutzen-Satz „Was das für euch heißt", Wizard-Crew, Zusammenspiel als
Reihenfolge Fundament → Gestalt → Produktion → Draussen, Frühzugang. Die
Startseiten-Inhalte (Artefakte, Brand-Check, Beispiel-Branding) bleiben dem
abgenommenen Dummy vorbehalten — About wiederholt sie nicht.

**SEO:** `useSeoMeta` je Seite (Title/Description/OG), JSON-LD Organization
+ FAQPage (about) und AboutPage (team) über `apps/branding/app/utils/
jsonLd.ts`; FAQ-Antworten stehen IMMER im Markup, geklappt wird nur die
Sichtbarkeit.

**Lead-Generierung — die Warteliste (Opus-Lauf, Server; Formular selbst):**
bis dahin gab es KEINE Erfassung ohne Code. `POST /api/brand/waitlist`
(öffentlich, Zod, Honeypot statt Captcha, Dedupe per `emailLower`, 503 ohne
Tabelle, Betreiber-Mail fail-soft über `pukalani.brand.waitlistNotify`),
Tabelle `brand_waitlist` (Migration brand-012 — auf 012 umnummeriert, weil
die Nachbar-Session parallel eine 011 anlegte; server-only, UNIQUE-Index über
die indexRetry-Fabrik), Drossel `brand:waitlist` 5/min, `BwWaitlistForm` auf
About, Team und unter dem Code-Feld auf /invite. Datenschutz-Grenze
dokumentiert: kein `registerUserDataContributor` (kein Konto), Löschung heute
manuell.

**Bildmaterial:** `BwImagePlaceholder` (Kennung sichtbar, Prompt als Prop im
Code, NICHT im DOM) an neun Stellen (A1–A6, T1–T3); Register mit Visual-DNA-
Regel und wörtlichen Prompts in `docs/referenz/BRANDING-SUPPLY-BILDMATERIAL.md`.

**Beweise:** 1103 Tests (kombinierter Baum inkl. BW2 Paket 2b/3a der
Nachbar-Session), Typecheck, Lints (brand/core/app/scripts), i18n- und
Manifest-Wächter grün; live geprüft (de+en, JSON-LD geparst, Platzhalter,
Formulare gerendert).

**Gelernt:** (1) Rohe `@` in Locale-Nachrichten fängt `i18nCatalog.test.ts`
— auch die `{'@'}`-Schreibweise; Platzhalter-Texte ohne @ formulieren.
(2) Zwei Sessions, zwei Migrationen mit derselben Nummer: der Runner läuft
beide, aber die Labels lügen im Log — vor dem Push `ls scripts/migrations`
gegen origin/main prüfen. (3) Gates nach dem Rebase WIEDERHOLEN (diesmal
gemacht: 1034 → 1103 Tests auf dem kombinierten Baum).

### Brand-Wizard: Archetyp-Generator als Interim + Live-Durchstich bis zur Weiche ✅ 2026-09-04

**Auslöser:** Davids Live-Check-Auftrag („checke du auch den chatverlauf und die
buttons"). Der Durchstich fand den strukturellen Blocker: für `archetype` war
NIE ein Generator registriert (`no_generator`), sieben editor-none-Slots ohne
Weg, und laut Spec §12.2 wären Primär/Sekundär aus dem (bewusst späteren)
Paarvergleich-Instrument BERECHNET — das Kapitel war unabschliessbar.
**Davids Entscheidung** (AskUserQuestion, DECISION-LOG): Gesprächs-Ableitung
als Interim.

**Gebaut (Opus-Lauf + zwei eigene Fix-Runden):** 12-Archetypen-Katalog als
geschlossene Choice-Verträge (stabile Ids; Choice-Prüfung in die Advisor-Fabrik
gezogen — eine Kopie für B2 und D), 7 Slot-Aufträge (Hypothese ohne Festlegung;
bei zwei Kandidaten Rückfrage mit OPTION-Chips; gapReveal benennt Abweichung
ehrlich; voiceSamples = genau 3 Sätze), Stimme-Antworten erreichen George über
den a-9-Verlauf (Registry-Rückwärtsregel verbietet sie als dependencies).
Zwei Live-Funde sofort nachgefixt: (1) KOHÄRENZ — Prosa argumentierte
„Handwerker", Feld speicherte `sage`; jetzt Pflicht-Regel „Prosa nennt den
Katalog-Namen, informelle Gesprächs-Namen werden hörbar abgebildet"
(george-archetype-2). (2) ROHE ID IN DER BLASE — der Server-Tausch griff nur
auf der persistierten Nachricht; die Tausch-Regel wohnt jetzt in shared
(`swapBrandChoiceValueLine`) und läuft an BEIDEN Enden (Persistenz + gestreamte
Blase beim slot.ready-Frame). Dazu converse-5/george-a-11: OPTION-Zeilen als
MUST mit ausdrücklicher Klartext-Ausnahme + wörtlichem Beispiel (das Modell
liess die Kann-Fassung im Live-Test weg).

**Live bewiesen (Krume & Gold, Davids Chrome):** Rückfrage bei Müll-Daten →
Chat-Antwort → Entwurf wörtlich „aus euren eigenen Worten in diesem Gespräch"
(Senke end-to-end) → Der Schöpfer primär, Der Fürsorgliche sekundär (kohärent,
Anzeige statt Id) → gapReveal mit ehrlicher Lücke → **11/11, Konfidenz-Weiche
erreicht** — das Kapitel war am Morgen desselben Tages strukturell
unabschliessbar. Tests 727 → 1017 (inkl. BW2-Paket-1 der Nachbar-Session).

**Gelernt:** Ein Rebase nach fremdem Push macht die eigene grüne Gate-Runde
ungültig — die Gates liefen VOR dem Rebase, der kombinierte Baum war
unverifiziert (hier gut gegangen: Nachbar-Refactor war kompatibel). Nach jedem
Rebase mit Fremd-Commits die Gates auf dem NEUEN Baum wiederholen, bevor
gepusht wird — oder direkt danach, vor dem nächsten Schritt.

### Brand-Wizard: Konversations-Senke geschlossen + Gesprächs-Runde ✅ 2026-09-04

**Auftrag:** Davids Go („bau die konversations-senke wie du empfohlen hast") auf den
zentralen Befund des Komplett-Tests, plus drei Live-Funde aus seinem Krume-Test am
selben Tag. Vier Pakete, alle auf main und live bewiesen (Health-SHA):

1. **Konversations-Senke (`george-a-9`, Commit e91ac226, Opus-Lauf + eigene Prüfung):**
   Die letzten Züge des Bausteins reisen als eigener Prompt-Block in den
   Entwurfs-Generator (geteilte Verlaufs-Ladung `brandConversationHistory.ts` für
   generate+converse — eigene Blatt-Datei, weil ein Import in brandStore den Ring
   brandStore→conversePrompt→georgePrompt→brandGenerators→brandStore geschlossen hätte).
   Zwei neue Arbeitsregeln: Chat-Antworten haben Feldwert-Gewicht; eine beantwortete
   Frage wird NIE erneut gestellt. Injection-Grenze doppelt (Label + Regel).
   `inputHash` bewusst unberührt (gleiche Grenze wie Startkarte/Website-Text — die
   Neuerzeugung stösst der Mensch an). Heilt Loop UND editor-none-Sackgasse.
2. **Bühnen-Einstieg (2598fb23):** Der statische Abschluss-Satz benennt das erste
   offene Pflicht-Feld samt Aktion (Entwurfs-Knopf bzw. Bestätigen) statt ein Gespräch
   zu versprechen, das nicht startet (Davids Archetyp-Screenshot). TDZ-sicher ohne
   `pendingCard` gerechnet (Scroll-Watcher-Falle vom 2026-09-03).
3. **converse-3 (5bb70154):** „Keine Katalog-Frage mehr" ist NICHT „nichts mehr offen" —
   auf „was ist noch offen?" behauptete George „nichts mehr", während vier
   Ableitungs-Felder unbestätigt waren. Die offenen Pflicht-Felder reisen jetzt
   beschriftet in den Auftrag (brandStepCompletion + brandSlotPromptLabel); der Zweig
   treibt das erste voran statt zum Abschluss einzuladen, den die Route abwiese.
4. **Antwort-Chips (`george-a-10`/`converse-4`, 94f8e3db, Opus-Lauf):** Davids
   Anforderung an Vergleichsfragen — neuer Marker `OPTION:` (2–3 Zeilen am Zug-Ende,
   Empfehlung bleibt Prosa), Zeilen verlassen Sprechblase+Persistenz vollständig,
   reisen strukturiert im completed-Frame; Bühne rendert Chips, Klick geht über den
   EINEN bestehenden Sende-Pfad. Geteilte Normalisierung in shared (max 3 × 60,
   unter 2 = keine Wahl) für Server UND Frame-Dekoder; fehlendes Feld = Verhalten
   von vorher. Dazu Konto-Menü-Fix (b97592e0): „Brandings" führte auf nacktes `/`.

Beweise: brand-Tests 727 → 764, Lint/Typecheck/i18n-Wächter grün je Push.

**Gelernt:** Dieselbe fachliche Verwechslung („keine Frage mehr" vs. „nichts mehr
offen") sass an ZWEI Stellen — Bühnen-Satz und Gesprächs-Prompt — und der zweite
Fundort kam erst durch Davids Live-Test ans Licht, nachdem der erste längst gefixt
war. Wer eine Zustands-Verwechslung findet, sucht sofort alle Leser desselben
Zustands ab (hier: `resolveNextQuestion === null`), nicht nur den gemeldeten.

### Brand-Wizard: Komplett-Test (Links, Seiten, Login, Dashboard, 5 Brandings durchgespielt) ✅ 2026-09-03/04

**Davids Auftrag** (fünf Punkte) — alles Testbare getestet, alles Fixbare
gefixt (10 Commits, Details in den Commit-Messages), der Rest als
Zuschnitts-Fragen in OPEN-ITEMS.

**Durchgespielt:** Pfotenanker Kontext KOMPLETT (Fragen → Entwürfe →
Hinweis → Korrigieren-Ausweg → 10/10 → Gate → Auto-Übergang), Krume & Gold
pvm+Werte KOMPLETT + Archetyp bis zur Ableitungs-Wand, Pukalani Studio pvm
(EN-Content/DE-Chat), Ember + Untitled Kontext-Anspiel. George-Qualität am
neuen Prompt-Stand (a-7/a-8): Deutsch durchgehend, 3–4 Sätze, EINE Frage,
Katalog-Reihenfolge exakt, konkrete Anerkennung, B8-Kontextton
(Tierschutz), ehrliche Rückfragen statt dünner Entwürfe, aktive
Widerspruchs-Erkennung.

**Gefixte Blocker aus dem Durchspielen:**
- `step_locked` (`60b8d2af`): `open` ist GERECHNET — Zeilen nach einem
  Vorgänger-Abschluss bleiben roh `locked`, die Routen fütterten die
  Maschine mit dem rohen Zustand ⇒ Kapitel liessen sich NIE abschliessen
  („Passt" = stilles 400; Krume pvm 10/10 und fest). Routen nehmen jetzt
  den Journey-Zustand. DANACH liefen pvm→Werte→Archetyp-Übergänge sauber.
- Autosave wiederholte permanente 400 endlos (Retry jetzt nur 5xx/429).
- Abschluss-Satz unter Live-Zügen + „Nochmal"-Label auf jungfräulichen
  Feldern (`c0e678a1`).

**Der zentrale offene Befund (Davids Zuschnitt):** Die KONVERSATIONS-SENKE.
Antworten auf Georges Rückfragen (Kategorie-Einordnung, Purpose-Material,
Kunden-Zitate) erreichen den Entwurfs-Generator NIE — der liest nur
gespeicherte Slots. Folge: Entwurf → Rückfrage → Antwort → Entwurf →
dieselbe Rückfrage (dreifach live belegt). Härtester Fall: `editor: none`-
Ableitungen (d.hypothesis) — kein Entwurf (Generator verweigert ehrlich),
kein Tippen (Absicht), Antworten versickern ⇒ Kapitel UNABSCHLIESSBAR bei
dünnen/kaputten Quelldaten. Dazu: Rückfragen verweisen auf Felder
ABGESCHLOSSENER Kapitel ohne Weg dorthin.

**Weitere Zuschnitts-/Content-Befunde:** d.voiceSamples-Katalogfrage setzt
eine Auswahl voraus, die es nicht gibt — George erfand „vier Sätze", die
Bühne zeigt null (wie d.pairs behandeln oder Optionen generieren) ·
leeres unfertiges Ableitungs-Feld ohne Quellen zeigt „Passt das so als
Grundlage?" mit totem Bestätigen · Options-Modul-Platzhalter „Oder etwas
ganz Eigenes …" ohne Optionen darüber; Haupt-Prompt derweil kommentarlos
gesperrt · a.facts bündelt drei Fragen (bekannt) · `##`-Markdown roh in
Log-Karten · Ember-Altentwurf bricht B6 (echte Rösterei-NAMEN, selbst als
„not stated in inputs" markiert) · Kapitelwechsel blitzt <1 s die Frage
des Vorkapitels.

**Gelernt:** (1) Eine Katalog-Frage, die Optionen VORAUSSETZT („Welcher
dieser Sätze…"), zwingt das Modell zum Erfinden der Optionen — Fragen
müssen zur real existierenden UI passen. (2) „Ehrliche Verweigerung" des
Generators ist nur ehrlich, wenn es danach einen WEG gibt — sonst ist sie
eine höfliche Sackgasse. (3) CDP-getippte Eingaben wurden auf zwei Seiten
verschluckt (per JS-Submit reproduzierbar ok) — vor einem UI-Bug-Urteil
den Automations-Weg wechseln.

---

### S4: `events-sweep`-Naht-Geheimnis rotiert ✅ 2026-09-03

**Was:** Das zweite Naht-Geheimnis aus der A0-Runde stand seit der
Einrichtung unverändert in `platform.pukalani.app/.env`. Rotiert nach der
Reihenfolge aus `sharedSeamSecret.ts` (Empfänger zuerst), komplett
server-seitig und file-to-file — der Wert hat die Maschine nie verlassen:

1. Neuer Wert (64 hex) auf dem Server erzeugt, verschlüsselt (secretBox
   v1, exakt nach `secretBox.ts` repliziert) per Appwrite-REST in die
   Ablage geschrieben (`instance_secrets/events-sweep`, Projekt aus der
   platform-.env; Schreibstatus 200). Ab da nahm der Empfänger alt UND
   neu an.
2. Beweis an der Kante: falscher Schlüssel ⇒ 401, neuer ⇒ 200.
3. `NUXT_EVENTS_SWEEP_KEY` in der .env getauscht (Backup zuvor auf dem
   Server abgelegt, Eindeutigkeit der Schlüssel danach geprüft — die
   Doppel-Zeilen-Zeitbombe vom 2026-09-01 war die Blaupause dafür), der
   Cron-Weg mit der neuen .env liefert 200. Temp-Dateien gelöscht.

Der ALTE Wert bleibt als Env-Kandidat des laufenden Prozesses gültig, bis
der nächste Deploy die platform-App neu lädt — das ist der Sinn der
Übergangsstufe, kein Rest.

**Gelernt:** Nodes `fetch` (undici) VERWIRFT einen gesetzten
`Host`-Header stillschweigend — die Kanten-Probe lief damit als
unbekannter Host in die Tenant-404 und sah aus wie eine kaputte Route;
für Host-Header-Proben auf Mehr-Mandanten-Apps immer `curl` (so macht es
auch der Cron). Und: die Rotations-Reihenfolge „Empfänger zuerst" aus dem
Datei-Kopf trägt wirklich fensterlos — der Sweep lief zwischen allen
Schritten stündlich grün weiter.

---

### Brand-Wizard: Werkstatt-Umbau „Gespräch als Bühne" live + Live-Audit-Befunde behoben ✅ 2026-09-03

**Was passiert ist:** Der in 39 Dummy-Runden abgenommene Umbau
([plans/BRAND-WIZARD-GESPRAECH-UMBAU.md](plans/BRAND-WIZARD-GESPRAECH-UMBAU.md),
Davids Freigabe) wurde in zwei Opus-Läufen ausgeführt (Layout; Eine Stimme —
George spricht durchgehend, `BRAND_VOICE`/`techniqueForStep`/`colleagueForStep`
statt Berater-Übergaben), von drei parallelen Code-Audits geprüft, alle
Befunde in einer Fix-Runde behoben, danach Design-Entscheidungen Davids
umgesetzt (Kapitelname „Tagline & Messaging", Tablet volle Sidebar-Breite,
Mobil-Sidebar als Overlay, mobil Start im Gespräch). Abschluss war ein
**Live-Audit auf branding.supply** (Davids eingeloggter Chrome, Test-Brand
Krume & Gold): Layout, Log-Sublines, UChatPrompt, George-Layer, Toggles und
ein sparsamer George-Zug (erkannte die Platzhalter-Antworten und fragte nach,
statt sie zu übernehmen) — alles grün, keine Konsolen-Fehler.

**Die drei Live-Audit-Befunde, alle noch am selben Tag gefixt + deployt:**

1. **Konfidenz-Wahl verschwand nach Reload** (`ba4d5de8`): PATCH 200, GET trug
   den Wert, SSR malte den gewählten Chip — die Hydration nahm ihn weg.
   `serverConfidence`/`localConfidence` waren PRIVATE Refs im Setup-Store, und
   Pinia serialisiert nur Zurückgegebenes in den SSR-Payload. Beide Refs
   stehen jetzt im Return; Quelltext-Wächter
   `packages/brand/tests/brandWorkspaceStoreState.test.ts` prüft künftig jede
   Store-Ref auf Rückgabe.
2. **Gesamtfortschritt widersprach sich je Seite** (`52712129`): pvm 19/59,
   context 20/59. `toSlotFacts` (Server) zählte „gab es je einen Entwurf" —
   ein GELEERTES Feld (`b.mission`: latestDraft `''`, firstDraft 1 Zeichen)
   blieb über den firstDraft-Fallback gefüllt, der Client zählt das Sichtbare.
   Jetzt beidseitig die Anzeige-Rangfolge `latestDraft ?? firstDraft ??
   confirmed` (drei Tests inkl. Gegenprobe). Live bestätigt: beide Seiten 19/59.
3. **Georges Abschluss-Satz behauptete zu viel** (`71e5c792`): „In diesem
   Kapitel ist nichts mehr offen" stand direkt über „Noch offen: 1 von 10
   Feldern". Kein Server-Fehler, sondern Wortlaut: `resolveNextQuestion` kennt
   bewusst nur Frage-/Auswahl-Slots, Bühnen-Entwürfe (`stage-edit` wie
   `b.mission`) fragt George nie. Der Satz folgt jetzt dem Kapitel-Stand
   (`completion.slotsReady`); davor: „Meine Fragen sind durch — die offenen
   Felder unten formen wir jetzt hier im Gespräch."

**Befund 3 riss selbst eine Regression** (behoben in `836f0283`, ~40 min
Werkstatt-500 für Eingeloggte): `turns` las das erst ~280 Zeilen SPÄTER
deklarierte `completion`, und der Scroll-Watcher
(`watch(() => turns.value.length)`) wertet seine Quelle beim ANLEGEN aus —
im Browser mitten im Setup ⇒ TDZ-ReferenceError („Cannot access 'K' before
initialization") ⇒ 500-Seite auf jeder Werkstatt-Route. SSR blieb grün (der
Server legt keine Watcher an, `curl` zeigte 200), Tests/Lint/Typecheck sehen
TDZ in Callbacks nicht. Gefunden über `$nuxt.payload.error` im Browser, weil
die Prod-Fehlerseite Details bewusst versteckt.

**Dazu Davids Zuschnitt zur Optik-Meldung:** die Kapitel-Subline mischt
optionale Felder nicht in den Zähler, sondern benennt sie als Anhängsel —
„10/10 bestätigt + 1 optional" (`ef57a89c`, Registry-Zahl je Kapitel; betrifft
context/values/result). Live verifiziert am Kontext-Kapitel.

**Und die Kachel-Farbwelten je Brand** (Davids Auftrag aus dem Audit, gleich
mitgebaut): `shared/brandPalette.ts` — zwölf handgestimmte Dreiklänge (die
drei im Dummy ABGENOMMENEN führen die Tabelle an: Brot-Braun, Blaugrau,
Tannengrün; dazu Terrakotta, Oliv, Petrol, Pflaume, Rosenholz, Schiefer,
Messing, Taubenblau, Moos), deterministisch per FNV-1a aus der PROFIL-ID
(Umbenennen ändert die Farbe nicht; Tabelle darf nur hinten wachsen, sonst
färben sich Bestands-Kacheln um). Bewusst kuratierte Tabelle statt
Hash→OKLCH-Generator: unendlich viele Töne heisst regelmäßig hässliche.
Später kann eine echte Farb-Phase des Wizards die Zuweisung überschreiben.

**Zweite Welle in derselben Nacht (Davids Live-Test + „setze die offenen
Tasks alle um"):**

- **C5 verdrahtet** (`998b22c7`): „Nochmal von vorn" auf einem
  abgeschlossenen Kapitel öffnet es jetzt wirklich (`reopen` im
  Autosave-PATCH, Route öffnet vor der Konfidenz; vorher war die pure
  Transition von keinem API-Weg erreichbar — der Chip war eine Attrappe).
- **Mobil-Drawer statt Vollbild** (`d5d58630`, Davids Entscheidung):
  Spaltenbreite (`--bw-rail-w`, Deckel 85vw), Backdrop dunkelt ab und
  schliesst per Tipp; Backdrop teilt die z-50 der Rail über DOM-Reihenfolge
  (eigener Zähler wäre die 51-Falle über dem Info-Layer).
- **George sprach interne Slot-Ids nach** (`7fe8d8e8`, Davids Screenshot:
  „Die Felder a.customerPraise, a.oneThing … enthalten Platzhalter"): die
  Eingabe-Blöcke reisten als `[a.customerPraise]` in Prompt und Historie.
  Jetzt tragen sie die Frage aus dem Locale-Katalog in der Inhaltssprache
  (`brandSlotPromptLabel`, dieselbe Quelle wie die UI) und eine Care-Zeile
  verbietet Feld-Ids ausdrücklich (george-a-6, converse-2; inputHash liest
  slotId+value und blieb unberührt).
- **Autosave-Klemme** (`7fe8d8e8`): „Nicht gespeichert — wir versuchen es
  erneut" versprach eine Wiederholung, die es nicht gab — ein PATCH in
  einen Deploy-Reload (502, pm2 lädt) blieb für immer stehen. Jetzt Retry
  mit Backoff (4 s verdoppelnd, Deckel 60 s). Die Prod-Logs zeigten
  KEINEN 5xx, aber ein Dutzend Reloads, während Davids Tab offen war —
  der Fehler sass zwischen nginx und pm2, nicht im Code der Route.

**Dritte Welle in derselben Nacht (Davids „setze alle offenen Tasks um" +
sein zweiter Live-Test am eigenen Pukalani-Studio-Branding):**

- **P4: Architektur-Karten für `b2.model`** (`e11df0e7`, Opus-Agent
  implementiert, Hauptloop geprüft): Karten mit Titel/Wirkung/Beispiel je
  Modell, Klick übermittelt die stabile Id; `brandChoiceDisplayLabel` löst
  gespeicherte Ids an allen Lese-Stellen in den Namen auf. Offene
  choice-Slots behalten ihr Textfeld. Live-Klickpfad steht noch aus (kein
  Test-Branding hat `architecture` auf dem Weg).
- **Gesprächs-Verlauf** (`69d52f0d`, Davids Screenshots): (a) eine
  GEGENFRAGE landete wörtlich als Feld-Wert („wo hast du die website
  her?") — Fragezeichen-Endung läuft jetzt als freie Frage, bewusste
  Heuristik; (b) george-a-7: EINE Frage pro Zug (kein „oder was fehlt?",
  kein „aber bevor wir das durchgehen:"), und die Eingabe-Blöcke sieht nur
  das Modell — George verwies auf eine „start card hier oben im Gespräch",
  die es für den Menschen nicht gibt; (c) B4 mechanisch: `**Fett-Marker**`
  fallen server-seitig aus Slot-Entwürfen. Geklärt, kein Bug: englische
  Ableitungen auf Davids Branding folgen `contentLocale: 'en'` (bei der
  Anlage gewählt).
- **Kurz-Labels + Erklär-Absätze** (`bda41103`): 50 dokumentartige
  Log-Karten-Labels je Sprache (`brand.labels.<id>`, te()-Rückfall auf die
  Frage) und der Beschreibungs-Absatz je Baustein im Erklär-Layer
  (`brand.stepInfo.<key>` — die sieben Dummy-Texte wörtlich,
  architecture/result neu, alle übersetzt).
- **EIN Kopf für branding.supply** (`f838b330`, Davids Nachtrag „dieselbe
  Navbar wie im Wizard, eingesetzt"): App-default-Layout rendert
  BwSiteNav + BwSiteFooter im Fluss und überlagert das Core-Default —
  dessen Kopfzeile stand auf /team ÜBER der Inline-Nav (zwei Köpfe).
  Browser-bewiesen im Worktree-Dev (/, /team, /dashboard/brands).
- **Nav-Konto echt + Karten-Rückweg** (`3b9f3532`): das hartkodierte
  „DS"-Avatar wird zu echten Konto-Initialen, „Abmelden" wirkt
  (useLogout), Gäste sehen den Anmelden-Knopf statt eines Konto-Menüs
  ohne Konto (Gast-Zweig browser-bewiesen); und „Korrigieren" an
  `b2.model` führt zurück auf die Auswahl-Karten statt in eine
  UTextarea mit der rohen Id.
- **Bewusst NICHT gebaut:** die Ergebnis-SEITE (P5–P7). Der einzige
  Dummy (`demo/ergebnis.vue`) ist Iteration 2 von VOR dem Bühnen-Umbau
  und widerspricht der Spec (Leseansicht ohne George) — das Paket
  braucht Davids Konzept-Gate, keine Nacht-Improvisation. Ebenso die
  Antwort-AKKUMULATION für mehrteilige Katalog-Fragen (a.facts):
  Davids Richtung ist klar („einzeln nacheinander"), aber der Zuschnitt
  (Teil-Fragen als neue Katalog-Texte? Akkumulations-Mechanik im Slot?)
  ändert abgenommene Fragen und gehört vor sein Gate ①.

**Gelernt:** (1) In Pinia-Setup-Stores gehört JEDE Ref ins Return, auch wenn
nur ein computed sie liest — private Refs überleben die SSR-Hydration nicht,
und der Fehler ist unsichtbar, solange man nur den SSR-HTML-Strom oder nur
die API prüft (beide waren korrekt; erst der DOM-Vergleich nach Hydration
zeigte ihn). (2) Zwei Rechenwege für dieselbe Zahl (Server-Journey vs.
Client-Live) divergieren an Rändern, die keiner bedacht hat — hier das
GELEERTE Feld; die Kur ist eine geteilte Rangfolge, nicht ein Abgleich-Code.
(3) Ein Widerspruch auf dem Bildschirm hat nicht immer EINE Ursache: Befund 2
(Zahlen) und Befund 3 (Wortlaut) sahen aus wie dasselbe Problem und waren
zwei — nach dem ersten Fix weiterprüfen, ob der Widerspruch wirklich weg ist.
(4) In `<script setup>` ist jede Referenz auf eine SPÄTER deklarierte
`const` in einem Computed/Watcher eine Zeitbombe: `watch`-Quellen laufen
beim Anlegen, also im Setup — und genau diese Fehlerklasse sehen weder
Unit-Tests noch Typecheck noch Lint, nur ein Browser, der die Seite lädt.
Deklarationen strikt vor der ersten Verwendung anordnen, und eine Seite mit
neuen Computed-Verkettungen VOR dem Push einmal im Browser öffnen.
(5) Jede Beschriftung, die in einen Prompt reist, spricht das Modell
irgendwann nach — interne Ids, Pfade oder Codenamen haben in prompt-
sichtbaren Blöcken nichts verloren; menschliche Labels aus derselben Quelle
wie die UI. (6) Ein Zustandstext ist ein Versprechen: „wir versuchen es
erneut" ohne Retry-Mechanismus ist gelogen — erst den Mechanismus bauen,
dann den Text.

---

### branding-Prod-Ausfall nach Reload: zerschossene Server-.env, nicht der Code ✅ 2026-09-01

**Vorfall:** Nach dem Deploy des Dev-Port-Fixes (78bd3bb5) meldete der
Deploy-Wächter branding rot — `/api/health` antwortete 500, die Startseite
weiter 200. Ursache war NICHT der neue Build: die Server-`.env` der
branding-Site war um 09:30 (16 Minuten vor dem Reload) bei einem
Neuschrieb zerschossen worden — ein Kommentar klebte an `NUXT_SMTP_HOST`,
der SMTP-Block stand doppelt, und es gab ZWEI `NUXT_APPWRITE_KEY`-Zeilen,
von denen die LETZTE (die beim Parsen gewinnt) ungültig war. Die Zeitbombe
blieb unsichtbar, weil pm2 die .env erst beim (Re-)Load neu einliest: die
App lief mit dem alten, gesunden Env weiter, bis der nächste Deploy sie
zündete. Das ist die Gegenseite des Gelernt-Punkts (3) im P2-Eintrag
darunter — derselbe parallele .env-Neuschrieb, zwei Sitzungen an einer Datei.

**Diagnose ohne Wert-Exfiltration:** beide Key-Zeilen einzeln per
HTTP-Statuscode gegen `/v1/health` und `/v1/users` gemessen (Zeile 21:
200/200 = gültig · Zeile 22: 401/401 = tot); Struktur der .env nur als
Schlüsselnamen + Wertlängen gelesen, nie als Werte. **Reparatur** nach dem
dokumentierten Verfahren (Werte nie durch den Chat): Original nach
`~/.appwrite-secrets/branding-site-env-backup-2026-09-01-0930.env`
gesichert, lokal chirurgisch gepatcht (tote Key-Zeile raus, Kommentar
getrennt, SMTP dedupliziert, `NUXT_AI_KEY` blieb), per scp hoch, Reload
über deploy.yml-Dispatch. Danach alle sechs Hosts `ok:true` auf demselben
Build, branding 3× in Folge (Wächter-Kriterium).

**Gelernt:** (1) Zwei Sitzungen dürfen nie gleichzeitig dieselbe
Server-`.env` neu schreiben — und wegen der pm2-Reload-Verzögerung beweist
„die App läuft noch" nach einem .env-Schreiben NICHTS: geprüft ist eine
.env erst, wenn danach ein Reload sie eingelesen hat (oder man sie
strukturell gegenliest: doppelte Schlüssel sind das Alarmsignal, der
LETZTE gewinnt). (2) Ein 500 auf `/api/health` bei gesunder Startseite
zeigt auf den Admin-Key, nicht auf den Build — die Startseite braucht ihn
anonym nicht. (3) Leere pm2-Logs trotz 500ern heißen nur: das
Observability-Gate ist in dieser App aus — die Diagnose läuft dann über
direkte Proben am nginx vorbei (`curl 127.0.0.1:<port>`), nicht über Logs.

### Brand-Wizard P2 — George wird echt: Drosseln, Prompts, Startkarte, URL-Analyse ✅ 2026-09-01

**Was:** Vier Teilpakete am Stück (je ein Opus-Lauf, im Hauptloop geprüft):
(1) Der §6-DROSSEL-VERTRAG als Launch-Gate — 200/Tag je Konto, 10/Tag je
Brand×Slot, Burst 2 parallel, Instanz-Deckel 1000; gebucht wird NUR ein
echter Anbieter-Lauf (Stub/Cache/Kill-Switch/Sperre kosten nichts), 429
reist VOR dem SSE-Start als echtes HTTP mit Retry-After. (2) Der echte
George-GENERATOR für Baustein A: 9-Regeln-System-Prompt als pure Templates,
providerRouting wörtlich { zdr, dataCollection: 'deny', allowFallbacks:
false }, und ein geteilter FORMVERTRAG (shared/brandSlotFormat.ts), durch
den Stub und George dieselben list/structured-Formen schreiben — per Test
aneinander genagelt. (3) Die STARTKARTE (Content-Spec §2.1) existierte nur
als Papier — brand-009 legt websiteUrl/industry/about/audience an, der
Anlage-Dialog erhebt sie mit den wörtlichen Spez-Texten, George bekommt sie
als primäre Quelle (das Modal legt seither NICHT mehr selbst an, sondern
übergibt an die Startkarten-Seite). (4) Die URL-ANALYSE mit GESCHLOSSENEM
Rebinding-Fenster: einmal auflösen → alle IPs prüfen → eigene lookup-
Funktion in den Request → remoteAddress-Nachprüfung; v4/v6-Sperrbereiche
inkl. v4-mapped/NAT64/Oktal (81 Testfälle), max. 3 manuell geprüfte
Redirects, Dekompressions-Deckel, rohes HTML wird nie gespeichert, eigener
Tages-Deckel 20/Konto AUSSERHALB des KI-Kontingents. brand-Tests 227 → 437.
Migrationen brand-009/010 liefen jeweils VOR dem Code-Deploy gegen Prod.

**Gelernt:** (1) Eine SPEZIFIKATION ist keine Datenlage — Baustein A hätte
ohne die nie gebauten Startkarten-Spalten inhaltsleer generiert; der
Generator-Agent hat das ehrlich gemeldet („dir wurde nichts übergeben —
erfinde nichts") statt es zu kaschieren, daraus wurde Paket 2.5. (2)
MEDIUMTEXT kann in MariaDB keinen Default — Bestands-Zeilen lesen dann
undefined; Startkarten-Felder deshalb varchar mit '' und Pflicht NUR im
Zod. (3) Ein paralleler Server-.env-Neuschrieb verschluckte die frisch
angehängte NUXT_AI_KEY-Zeile still — die Kur ist nicht Sorgfalt, sondern
der Wächter: der Key ist seither Pflicht in ops:site-env.

### Deploy-Change-Detection: ältester Build ALLER Probe-Hosts als Diff-Basis ✅ 2026-09-01

**Was:** Nachzug zu Falle (3) des branding.supply-Erst-Deploys (Eintrag
darunter). Die Change-Detection in `deploy.yml` verglich gegen den Build-SHA
EINES Hosts (platform) — stirbt der sequenzielle Ausliefer-Schritt mitten in
der App-Schleife (rot ODER Runner-Ausfall; die Concurrency ist mit
`cancel-in-progress: false` NICHT die Ursache), sind die frühen Apps schon
geflippt und jeder Folge-Deploy sieht „nur Doku geändert" — die gestrandeten
Apps bleiben dauerhaft auf dem alten Stand (branding: 502 bis zum manuellen
`workflow_dispatch`). Jetzt fragt der Schritt ALLE sechs Probe-Hosts ab und
nimmt den ÄLTESTEN erreichbaren Build (Vorfahren-Vergleich per
`git merge-base --is-ancestor`) als Diff-Basis; ein Host ohne auflösbaren
`.build` (leer, 502, Timeout, unbekannter SHA — z. B. Erst-Deploy einer neuen
App) erzwingt sofort `skip=false` (fail-open), ebenso zwei nicht vergleichbare
Builds. Die App→Host-Liste ist entdoppelt: EINE Job-Env `APP_HOSTS` speist
Change-Detection UND Auslieferung (dort entfielen die `SITE`/`PROBE`-Arrays —
seit AH-4b ohnehin identisch; `SLOT` bleibt wegen control). Beweis: YAML-Parse
+ `bash -n` über alle 10 run-Blöcke grün; Basis-Wahl mit echten Commits
simuliert (ältester gewinnt, Reihenfolge egal, LEER/unbekannter SHA ⇒
fail-open); Live-Probe: alle sechs Hosts melden `d9dd981c`.

**Gelernt:** Eine Change-Detection, die den Fortschritt an EINEM Stellvertreter
misst, ist nur so ehrlich wie die am weitesten ZURÜCKLIEGENDE Einheit — bei
jeder sequenziellen Welle muss die Basis das Minimum aller Teilnehmer sein,
sonst versiegelt der erste Teilabbruch sich selbst. Und: eine Host-Liste, die
an zwei Stellen gepflegt wird, IST schon der Fehler — die Auslieferung kannte
branding, die Diff-Basis nicht; Listen gehören in genau eine Definition, aus
der alle Verbraucher lesen.

### branding.supply live — eigenes Appwrite-Projekt, eigene Domain, Beta im Invite-Modus ✅ 2026-09-01

**Was:** Ausführung des abgenommenen Infra-Plans (Davids Kehrtwende 2026-08-31,
[BRANDING-SUPPLY-INFRA.md](plans/BRANDING-SUPPLY-INFRA.md), Runbook
[BRANDING-SUPPLY-SETUP.md](runbooks/BRANDING-SUPPLY-SETUP.md) — dort stehen
alle Häkchen und Fallen im Detail). Konsole komplett per Chrome-Fernsteuerung
geklickt (Projekt `branding`, DB `main`, 2 Platforms, Runtime-Key 10 Scopes /
Migrations-Key 12 Scopes); DNS grau, ploi-Site 402929 auf **Prod-Port 3007**,
eigenes Zertifikat per HTTP-01 (D2-DNS-Token unnötig), nginx www→Apex;
Migrationen 2× (53 grün / 178 ↷), Parität 21/21; erster Deploy Build
`d9dd981c`, Proben `/` 200 · Datentür 404 · invite/check neutral; Modus
`invite`, Davids Code ausgestellt und live gegengeprobt (`{valid:true}`).
Secrets durchgängig file-to-file — geprüft wurde nur über Scope-Signaturen
(users/health/tablesdb-HTTP-Codes), nie über Werte.

**Gelernt:** VIER Fallen, drei davon mit Fix im Repo. (1) `pnpm migrate --app X
--env-file Y` verlor den App-Kontext (resolveEnvFile gab `app` nicht zurück) —
der Manifest-Filter griff nicht, der Erstlauf legte 18 Fremd-Tabellen an;
Fix in scripts/migrate.mjs, Fremd-Anlagen gelöscht. (2) rsync legt nur die
LETZTE Pfadebene an — beim Erst-Deploy einer neuen App fehlte
`releases/branding`, der Lauf starb NACH dem Flip der fünf Alt-Apps; Fix
`--mkpath` in deploy.yml. (3) Danach hielt die Change-Detection (Diff-Basis =
NUR platform-Build) alles für erledigt und übersprang dauerhaft — eine mitten
in der App-Schleife gestorbene Welle strandet alle späteren Apps; Sofort-Kur
`gh workflow run deploy.yml` (deployt immer), Härtung (ältester Build ALLER
Probe-Hosts als Basis) am 2026-09-01 erledigt — s. Eintrag darüber. (4) Dev-Port ≠ Server-Port: der Plan
setzte 3006, auf dem SERVER hält help die 3006 seit Wochen — die Portkarte des
Servers ist eine EIGENE Liste (3002 portfolio · 3003 admin · 3004 platform ·
3005 www · 3006 help · 3007 branding), die erste nginx-Fassung lieferte prompt
die Hilfe-Seite aus.

---

### branding-Dev-Port 3006→3010 — Kollision mit platform aufgelöst ✅ 2026-09-01

**Befund (beim Doku-Nachzug der Hosts-und-Ports-Seite gemessen):** `apps/branding`
und `apps/platform` starteten beide auf Dev-Port **3006** — der branding-Infra-Plan
zählte die Dev-Portkarte falsch („3000–3005 lokal vergeben") und übersah, dass
platform die 3006 seit jeher hält; er hatte damit BEIDE Portachsen falsch belegt
(die Server-Achse war schon beim Erst-Deploy aufgefallen, 3007 statt 3006). Folge
der Kollision: der zweite Nuxt-Server weicht STILL auf einen anderen Port aus —
genau die bekannte Falle, bei der ein „Beweis" den falschen Server misst.

**Gebaut (Commit `78bd3bb5`):** Dev-Port auf **3010** (nächster freier; 3009 hält
der brand-Playground), Prod-Port 3007 unberührt (eigene Achse). Alle Erwähnungen
in EINEM Commit nachgezogen: nuxt.config + package.json, Ecosystem-Kommentar
(„3006 lokal frei" gestrichen), CLAUDE.md-Silo-Regel, Hosts-und-Ports-Seite
(Warnbox durch Historien-Notiz ersetzt, 3010-Zeile), Infra-Plan §2, Runbook §3;
Memory `branding-supply-live` mit. **Beweis:** Ports 3006/3010 vorher per lsof
frei gemessen, dann `pnpm --filter branding dev` aus dem Worktree — erste
Log-Zeile bestätigt den Worktree-Pfad, Listener auf `[::1]:3010`.

**Gelernt:** Eine Portvergabe „aus dem Kopf" zählt verlässlich falsch — die
Dev-Portkarte in docs/content/2.architektur/6.hosts-und-ports.md ist die EINE
Liste, gegen die jede neue App prüft (dort steht es jetzt als Regel-Note). Und:
derselbe Plan hatte dieselbe Fehlerklasse (Achse verwechselt/falsch gezählt)
schon einmal auf der Server-Achse — wer einen Zähl-Fehler findet, prüft die
Schwester-Liste gleich mit.

### Paritäts-Wächter: AH-4c-Lücke geschlossen + Ausgerollt-Flag ✅ 2026-08-31

**Befund:** Seit dem AH-4c-Projekt-Rename (control→admin, 2026-08-18/19)
zeigte der `INSTANCES`-Eintrag in `scripts/ops/verify-schema-parity.mjs` auf
die nicht mehr existierende `control.env` — die Betreiber-Konsole wurde
wochenlang GAR NICHT auf Schema-Parität geprüft (inkl. runner-/tickets-
Tabellen), und der Lauf blieb dabei grün, weil „übersprungen" nur eine
Warnzeile war. Genau die Klasse „Konfiguration falsch, aber nichts wird von
selbst rot", gegen die der Wächter geschrieben wurde.

**Gebaut (drei Commits auf main, alle 2026-08-31):**
- `b62e702a`: Env-Zeiger auf `admin.env` umgehängt (beim branding-Umzug
  erwischt). Nachgeprüft: `admin.env` trägt `PROJECT_ID=admin` @
  api.pukalani.app; voller Lauf danach `control` 42/42 Soll-Tabellen inkl.
  runner — **keine Rückstände**, nichts für OPEN-ITEMS.
- `bb38028b`: Nebenfund aus dem Prüf-Lauf — `intro_requests`
  (Erstgespräch-Wizard, live seit 2026-08-22) fehlte im portfolio-Soll, weil
  die Tabelle per `ensure-intro-requests.mjs` statt `pnpm migrate` entstand
  und so an der Pflege-Regel („neue Tabelle ⇒ in ihren Layer-Block") vorbeikam.
- `6e7c3c89` (Davids Entscheidungen per strukturierter Fragen): **jeder
  INSTANCES-Eintrag trägt `ausgerollt`** — fehlt (oder ist unvollständig) die
  Env-Datei einer ausgerollten Instanz (account, control, portfolio), meldet
  der Lauf ✖ und endet mit Exit 1; photos/branding bleiben bis zum Launch
  eine stille Übersprungen-Zeile. Dazu zog die **portfolio-Migrations-Env von
  `apps/portfolio/.env.production` nach `~/.appwrite-secrets/migrations/
  portfolio.env`** um (Konvention wie account/admin/branding): die
  Repo-Baum-Datei fehlte in jedem Worktree, portfolio wäre dort mit dem Flag
  fälschlich rot gewesen. Leser nachgezogen
  (`cleanup-portfolio-legacy-tables.mjs`, `verify-site-env.mjs`), Original
  nach Byte-Vergleich gelöscht.

**Beweise:** Voller Lauf aus dem Worktree 4/4 ausgerollte Instanzen grün,
keine Warnungen; Gegenprobe (Fake-HOME ohne portfolio.env) meldet
`✖ AUSGEROLLT, aber … fehlt` + Exit 1, branding bleibt still; `lint:scripts`
grün; CI auf main Test/Lint/Typecheck grün (E2E per Concurrency vom
Folge-Commit abgelöst — kein Fehler).

**Gelernt:** (1) „Übersprungen" ist für eine AUSGEROLLTE Instanz kein
Hinweis, sondern ein Loch — ein Wächter, der bei fehlender Eingabe still
grün bleibt, prüft im Ernstfall genau dann nichts, wenn es darauf ankommt
(Umbenennung lässt Pfade zurück, zum wiederholten Mal). (2) Der
Skript-Kommentar behauptete, der Wächter laufe täglich in
production-watch.yml — stimmte nicht (er läuft nur manuell auf dem Mac);
eine Begründung, die auf einer falschen Betriebs-Annahme fußt, hätte hier
fast die falsche Härte-Entscheidung getragen. (3) Tabellen, die an
`pnpm migrate` vorbei entstehen (ensure-Skripte), tauchen in keiner
Migrations-Disziplin auf — die gepflegte Soll-Liste ist ihr einziges Netz.

### Doku-Nachzug: CONCEPT.md kennt alle 24 Layer, Silo-Regel kennt branding.supply ✅ 2026-08-31

**Anlass (Davids Auftrag):** die Layer-Tabelle und der Zähler „21 Layer" in
[CONCEPT.md](CONCEPT.md) waren veraltet — `brand`, `runner` und `marketing`
fehlten; real sind es 24 Workspace-Pakete. Nachgezogen in zwei Commits auf
main (`1076e446`, `018bef82`), alle vier CI-Checks grün, Deploy wie erwartet
übersprungen (reine Doku, Live-SHA unverändert):

- **Layer-Tabelle + Verzeichnisbaum:** drei neue Zeilen (`marketing` =
  Chrome-Layer ohne Tables, `brand` = Brand-Wizard „George", `runner` =
  AI-Runner-Board), `branding/` bei den Apps. Beide Zähler 21 → 24.
- **A14-Matrix:** `marketing` (Fundament) und `runner` (Plattform & Betrieb)
  eingetragen, damit „A14 kennt alle Layer" wieder stimmt; der Hinweis „Layer
  ohne eigene Tabelle" zählt jetzt vier. Nachgezählt: Tabelle 24 Zeilen,
  A14 24 Zeilen.
- **Über den Auftrag hinaus:** die A14-`brand`-Zeile („nur portfolio-Instanz",
  `PORTFOLIO_SOLL`) war seit der Kehrtwende vom selben Tag falsch → auf
  `branding`/`BRANDING_SOLL` gedreht. Auf Davids Nachtrag auch die
  **Silo-Regel in CLAUDE.md**: nicht mehr „das einzige verbliebene
  Silo-DEPLOYMENT ist portfolio", sondern ZWEI (portfolio + branding.supply,
  apps/branding, Projekt `branding`, Server-Port 3007 / Dev-Port 3006 — zwei
  getrennte Achsen); Grundregel unverändert. Die datierten Protokoll-Stellen
  („21 Layer" in den 2026-08-16-Einträgen, Archiv) bleiben bewusst stehen.

**Gelernt:** Der Auftrag nannte als Quelle die A14-Zeile („brand nur auf
portfolio") — die war beim Losarbeiten bereits überholt, weil eine parallele
Sitzung am SELBEN Tag den Umzug nach branding.supply gemergt hatte. „Erst
main prüfen" heißt auch: die im Auftrag mitgelieferten FAKTEN gegen den
frischen Stand messen (Manifest, Wächter-Skript), nicht nur nachsehen, ob die
Arbeit schon getan ist — sonst schreibt man eine veraltete Angabe sauber
formatiert neu hinein.

### W1/W2 — Studio-Rebrand (Wir-Stimme) + Erstgespräch-Wizard live ✅ 2026-08-22

**Zwei Pakete in einer Sitzung** (Davids Auftrag 2026-08-21, Entscheidungen
per strukturierten Fragen): (1) pukalani.studio spricht als „wir, Pukalani
Studio" — Wortmarke im Header (`david.schubert` → `Pukalani Studio`), gesamte
Copy in de+en gedreht (home, UX-Audit, Nuxt-Seite, beide Wissen-Guides,
llms.txt); David bleibt benannte Person, keine Teamgröße behauptet,
„Freelancer" nur noch Suchbegriff/Buchungsform. (2) `/erstgespraech`
(Vorbild tobiasnase.de, live durchgeklickt): 5 Schritte Vorqualifizierung
(Ziel aus den sechs Leistungen · Projektart/Budget-Spannen · Aufstellung ·
Status/Zeitrahmen · Kontakt, Telefon optional), Honeypot, Rate-Limit
`portfolio:intro-call`, zwei getrennt abgesicherte Zustellwege (Mail an
CONTACT.email + Zeile in `intro_requests`, Erfolg ab einem), Erfolgsansicht
mit cal.com-Sofortbuchung + 24-h-Rückfallzeile. Alle Site-CTAs → Wizard;
Plausible misst `studio_cta_erstgespraech`/`_wizard_start`/`_step`/
`_submitted`/`_booking_click` (U18-Liste erweitert, Wächter-Test nachgezogen).
Tabelle app-lokal (`ensure-intro-requests.mjs`, idempotent, server-only,
note als Mediumtext) — bewusst KEIN Produkt-Layer (Eigenschaft der
Marketing-Site). SMTP jetzt Pflicht auf portfolio (ops:site-env) und auf dem
Server gesetzt (Block von admin übernommen, Backup liegt daneben).

**Beweise:** lokal Wizard-Durchlauf + Mailpit-Mail in Klartext-Labels +
Appwrite-Zeile + Honeypot-Gegenprobe (schreibt nichts) + 6/6 E2E; live
Build-SHA `bc7e57b4` auf beiden Hosts, Test-Anfrage → `{ok:true}`, Zeile in
Prod angekommen (danach gelöscht), Mail ohne Fehler/Warnung im pm2-Log.
Plan: [STUDIO-ERSTGESPRAECH-FUNNEL.md](plans/STUDIO-ERSTGESPRAECH-FUNNEL.md).

**Gelernt:** (1) Der RELATIVE Import aus `app/` in den EIGENEN `shared/`-
Ordner einer App überlebt den Dev-Server, aber nicht den Prod-Build — Vite
externalisiert ihn und Nitro stirbt an `Could not resolve …/introCall.ts`
(Deploy 2026-08-22 rot, beide Läufe). Der `#shared`-Alias ist das Hausmuster
(apps/marketing macht es vor, app- UND server-seitig); Vitest braucht dieselbe
Abbildung von Hand. Ein grüner `nuxi dev` + Typecheck beweist den Prod-Build
NICHT. (2) Wer die U18-Event-Liste erweitert, muss `pnpm --filter
@pukalani/core test` laufen lassen: `tests/funnelEvents.test.ts` nagelt Namen
UND Präfix-Form fest — der Implementierungs-Agent hatte nur portfolio getestet.
(3) E2E-Klicks vor der Hydration sind tote SSR-Klicks (F10) — der Wizard
stempelt deshalb `data-ready` in seinem eigenen `onMounted`, und die Spec
wartet darauf statt auf `networkidle`.

---

### S2 — system-Kette auf `account` entblockt: eine tenantId als Label ✅ 2026-08-19

**Der Befund** (Favicon-Sitzung, 2026-08-19): `system-031` starb auf `account`
bei JEDEM Wiederholungslauf mit 400 — die einzige `community_handles`-Zeile
der Instanz (Alt-Autor `@davidschubert` aus der Comments-Silo-Zeit, F3) trug
`communityId = "t-mspkq1xd44lixo8oh2"`, eine **tenantId** statt der
`communities.$id`. Die Übernahme baute daraus `read("label:t-…")`, und
Appwrite **validiert Row-Permissions VOR dem Unique-Index**: das ungültige
Label gewinnt gegen das idempotente 409, obwohl die Zeile längst existierte.
Die gesamte system-Kette der Instanz war damit zu; `system-037` musste als
Einzeldatei vorbeifahren.

**Drei Reparaturen:**
1. **Daten:** `community_handles.communityId` → `6a7bf2ca7414bcc0d182` (die
   Comments-Community) — damit lösen alte `@davidschubert`-Erwähnungen dort
   wieder auf. Beim Beweis-Lauf war die Zeile bereits korrigiert (parallele
   Session); das Fix-Skript hat den Endzustand verifiziert statt blind zu
   schreiben (IST-Prüfung vor jedem Write).
2. **Nebenbefund gleich mit:** die `account_handles`-Zeile desselben Kontos
   hatte **leere Permissions** — nicht einmal den Besitzer-Read, den
   CLAUDE.md als „steht IMMER mit drin" zusagt; die Zeile war für ihren
   eigenen Besitzer unsichtbar. Repariert auf `read("user:…")`; Labels kommen
   keine, das Konto ist nirgends Mitglied (Vor-A5-Autor), der
   Runtime-Nachtrag `ensureAccountHandleAudience` ergänzt sie bei Bedarf.
3. **Härtung:** neue pure Regel `labelSafeCommunityId`
   (`core/shared/accountHandleAudience.ts`, exakt der `Role.label`-Zeichensatz
   `[a-zA-Z0-9]{1,36}`, 5 Tests) — die 031-Übernahme filtert Rollen jetzt
   fail-soft mit Warnung samt Korrektur-Hinweis. Ein engeres Publikum heilt
   der Runtime-Nachtrag; ein Abbruch blockierte die ganze Instanz.

**Beweis** (Davids Lauf, 2026-08-19): `pnpm migrate --env-file
~/.appwrite-secrets/migrations/account.env --layer system` — **alle 37
Migrationen grün**, `system-031` endet in „0 übernommen, 1 übersprungen
(bereits vergeben)". Der Lauf zeigte nebenbei, dass die Kette auf `account`
**nie vollständig gelaufen war**: 018/021/022 legten Spalten frisch an, die
024/026 planmäßig wieder entfernten (der Cutover hatte das Schema im
End-Zustand kopiert), und 032–035 zogen Bucket- und Tabellen-Permissions
nach. Genau deshalb ist eine blockierte Kette teurer als sie aussieht — sie
versteckt auch alle Reparaturen, die hinter ihr warten.

**Gelernt:** (1) **Appwrite prüft Row-Permissions VOR dem Unique-Index** —
die 409-Idempotenz einer Migration ist wertlos, sobald irgendeine Permission
ungültig ist: der Wiederholungslauf stirbt dann VOR dem Konflikt, jedes Mal.
Wer Rollen aus DATEN baut, validiert sie vorher und überspringt fail-soft —
die Sicherung gehört in den Code, nicht in die Datenhygiene. (2) Ein
Fix-Skript für Prod-Daten prüft den IST-Zustand vor jedem Write und druckt
den NACHHER-Zustand — so wurde aus dem Doppel-Fix zweier paralleler Sessions
ein „nichts zu tun" statt eines Konflikts.

### S1 — Alter Sicherungsordner mit lebenden Geheimnissen gelöscht ✅ 2026-08-19

Beim Aufräumen nach der Naht-Rotation gefunden: `/home/ploi/.env-backups/` lag
seit dem Control-Cutover (26. Juli) mit fünf Dateien auf dem Server — darunter
`NUXT_STRIPE_SECRET_KEY`, `NUXT_ENTITLEMENTS_PRIVATE_KEY` und `NUXT_SMTP_PASS`,
allesamt noch GÜLTIG. Vor dem Löschen wurde jeder einzelne Schlüssel gegen die
lebende `.env` gehalten: identisch (Sicherung überflüssig) oder abweichend
(Altwert aus der Studio-Zeit) — kein Wert existierte nur dort. Danach
`shred -u` je Datei statt `rm`, Ordner entfernt, Gegenprobe über
`/home/ploi` ohne Treffer, alle sechs Hosts weiter 200.

**Gelernt:** Eine Löschung wird billig, sobald man sie vorher unumkehrbar-frei
macht. Die Frage ist nicht „traue ich mich?", sondern „gibt es hier einen Wert,
den es nirgends sonst gibt?" — die lässt sich mechanisch beantworten (Wert je
Schlüssel gegen die lebende Datei), und danach ist Löschen kein Risiko mehr,
sondern Buchhaltung.
**Gelernt:** Sicherungen sterben nicht von selbst. Diese entstand als
verantwortungsvoller Zwischenschritt eines Cutovers und wurde genau dadurch zum
Problem: 24 Tage später kannte sie niemand mehr, und sie trug denselben Stripe-
Schlüssel wie die Produktion. Wer eine `.env` sichert, setzt im selben Atemzug
das Ende — sonst ist die Sicherung die Kopie, die niemand rotiert.

---

### U14 — Anmelden mit Google: eingeschaltet und end-to-end bewiesen ✅ 2026-08-21

Der Code war seit dem 2026-08-12 gebaut und unsichtbar; heute kamen die
Klicks und zwei Live-Funde. EINGESCHALTET: frisches Google-Projekt
**„Pukalani"** (`silver-area-506109-a4`) mit produktiv veröffentlichtem
Consent (extern, nur Basis-Scopes, Domain pukalani.app), OAuth-Client
„Pukalani Appwrite" mit GENAU EINER Redirect-URI auf den Appwrite-Callback
des `account`-Projekts; Provider in der Appwrite-Console mit neuer Client-ID
+ Secret (Davids alter Anlauf „Pukalani App", `pukalani-app` — erkennbar an
der Projektnummer 448117866990 in der vorher hinterlegten Client-ID — ist
damit abgelöst und kann nach einer Credentials-Durchsicht weg). App-Schalter:
`providers: ['google']` in apps/platform + `NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS`
in der Server-.env. End-to-end im echten Chrome bewiesen: Knopf auf /login
und /register, Konto-Wahl „Weiter zu pukalani.app", nach der Rückkehr SOFORT
eingeloggt (`/api/auth/me` → David Schubert, kein Anmelden-Knopf, kein
Reload).

**Gelernt:** „Erst nach Hand-Reload eingeloggt" nach einem OAuth-Rückweg hat
ZWEI Klassiker-Ursachen, die sich stapeln können — beide hier gefunden:
(1) SSR-Seiten ohne `Cache-Control` darf der Browser HEURISTISCH cachen und
zeigt dem frisch Angemeldeten die Gast-Fassung aus dem Cache (Fix: der
`render:response`-Hook stempelt jetzt jede SSR-Seite `no-cache`; der
Callback selbst `no-store`, seine Adresse trägt ein Einmal-Secret).
(2) Die WURZEL: ein `SameSite=Strict`-Session-Cookie wird auf einer
Navigation, deren Redirect-Kette extern (bei Google) begann, NICHT
mitgeschickt — die erste Seite kam ohne Session an. `lax` ist die
Standardwahl für Session-Cookies aus genau diesem Grund; Cross-Site-POSTs
tragen auch Lax nicht, alle Mutationen sind Nicht-GET, csrf-origin bleibt
das zweite Netz. Warnschild steht an der Stelle (setSessionCookie).
**Gelernt:** Ein „es geht immer noch nicht" IMMER erst gegen den
Live-Build-SHA halten — Davids zweiter Fehlversuch lief gegen den Stand vor
dem eigentlichen Fix und hätte fast eine dritte Fehlersuche gestartet.

---

### U16 — Adressen: Slug oder Id? Entschieden: so lassen (Weg A) ✅ 2026-08-20

Davids Entscheidung per strukturierter Frage (Empfehlung der Analyse
angenommen): Kategorien und Kurse behalten den festen, sprechenden Slug;
Themen und Events die Id — die beiden Muster laufen bewusst weiter parallel,
weil sie verschiedene Fragen beantworten. Kein Alt-Slug-Gedächtnis (Weg B war
bei Themen schon verworfen — die Id liefert dasselbe billiger), kein Umbau des
URL-Raums (Weg C nur, falls Umbenennen je echter Bedarf wird — dann ist er die
vorgezeichnete Lösung). Analyse mit allen drei Wegen und Kosten:
[ADRESS-MUSTER-KATEGORIEN.md](archiv/ADRESS-MUSTER-KATEGORIEN.md);
DECISION-LOG 2026-08-20. Nichts gebaut, nichts zu bauen — der Preis des
Zustands (Slug nach Anlage fest) ist benannt und akzeptiert.

---

### A0 — Naht-Geheimnisse: alle Zugänge über die Konsole, Rotation ohne Deployment ✅ 2026-08-19

Der Abschluss von A0 in zwei Etappen. ETAPPE 1 (2026-08-18, Nachbar-Sitzung +
David): KI, Statistik, Konsolen-KI und SMTP wandern in die verschlüsselte
Ablage `instance_secrets` (system-036, Umschlag `NUXT_INSTANCE_SECRETS_KEY`,
DB schlägt Env), David hinterlegt beide KI-Schlüssel über Instanz →
Integrationen; `ops:site-env` verlangt seither den UMSCHLAG statt der
Einzel-Keys (ein Wächter, der einen von zwei gleichwertigen Wegen anmahnt,
erzieht zum Weglesen).

ETAPPE 2 (2026-08-19): die GETEILTEN Naht-Geheimnisse — `onboarding-service`
(Header `x-pukalani-onboarding-secret`, in BEIDE Richtungen: platform→control
beim Onboarding über 49 Service-Routen, control→silo beim Domain-Settle) und
`events-sweep` (`x-sweep-key`, Empfänger reminder-sweep; einen Repo-Sender
gibt es nicht, der Cron trägt den Wert selbst). Die Regel, die die im
instanceSecrets-Kopf geforderte „Übergangsstufe" DAUERHAFT einbaut
(`core/server/utils/sharedSeamSecret.ts`, pur + 17 Tests): der SENDER schickt
genau EINEN Wert (Konsole zuerst, Env-Rückfall), der EMPFÄNGER nimmt die
MENGE {Konsole, Env} an — timing-sicher, ohne vorzeitigen Ausstieg (ein
früher Treffer verriete, ob schon rotiert wurde). Rotation ist damit reine
REIHENFOLGE: (1) neuen Wert in der Konsole des Empfängers, (2) in der des
Senders, (3) irgendwann den alten aus beiden `.env` nehmen — kein Deployment,
kein Riss, und die Reihenfolge steht an der Prüfstelle UND auf den
Konsolen-Karten. Kein Cache am Gate (ein TTL verzögerte genau die Rotation,
für die alles gebaut ist); leere Menge bleibt 404 wie zuvor (403/503 gehören
dem Sender). Live geprobt nach dem Flip: Service-Route ohne Header und mit
falschem Secret → 401, Naht über den Deploy hinweg ununterbrochen (alter
Sender sendet Env, neuer Empfänger nimmt sie an).

NACHTRAG (2026-08-19, gleiche Sitzung): beide Werte sind in den Konsolen
HINTERLEGT — server-seitig verschlüsselt und geschrieben (Werte verließen den
Server nie), Rundreise-Beweis 3/3 (Zeile lesen → entschlüsseln → Hash gegen
Env). Dabei zwei Funde: der geteilte Onboarding-Wert war beidseitig identisch
(per Hash geprüft), und `NUXT_EVENTS_SWEEP_KEY` EXISTIERTE GAR NICHT — der
Erinnerungs-Sweep hatte seit jeher KEINEN Aufrufer (kein Cron, kein Plugin;
F44-Klasse: Terminerinnerungen feuerten in Prod nie). Key erzeugt
(Konsole + platform-.env), stündlicher Cron eingerichtet (ploi-Job 326870;
weil ploi nach 10 min nicht in den Crontab synct, identische Zeile direkt im
ploi-Crontab, Log `/home/ploi/events-sweep.log`) — erster echter Lauf
2026-08-19T10:00:01Z → 200. AUCH ROTIERT (Probe, gleiche Sitzung):
Konsole → .env → pm2 in der A0-Reihenfolge, Endzustand gemessen — neuer
Key 200, alter Key 401, ohne Key 401; der Cron liest die .env je Lauf und
fährt nahtlos weiter.
**Gelernt:** Die eigene Sonde ist auch ein Messgerät: fünfmal 404 in der
Rotations-Probe hieß „kaputte Sonde" (Node-`fetch` verwirft den eigenen
Host-Header — die dokumentierte Falle, gegen die die Beweis-Skripte
`node:http` nutzen), nicht „kaputte Rotation". Erst die curl-Gegenmessung
trennte beides.
**Gelernt:** `%` ist in crontab ein Sonderzeichen — ein `curl -w
"%{http_code}"` wird ohne Maskierung still zum Zeilenumbruch; jede
Prozent-Stelle der Zeile maskieren, nicht nur die des Datums.
**Gelernt:** Ein geteiltes Geheimnis braucht keine Code-Stufe, wenn der
Empfänger eine MENGE annimmt und der Sender EINEN Wert schickt — die Zusage
wird choreographisch statt technisch.
**Gelernt (Nachtrag 2026-08-19):** Die Zusage „kein Riss" gilt fast überall —
aber wer sie prüft, muss vorher die KETTE messen statt sie zu vermuten. Hier
liegt `onboarding-service` auf DREI Deployments: platform sendet nur (den
Empfänger `requireControlCaller` bringt der `domains`-Layer mit, den
apps/platform gar nicht zieht), admin empfängt von beiden UND sendet an
portfolio, portfolio empfängt und ruft im selben Handler zurück. Für das Paar
platform→admin ist die Reihenfolge damit vollständig richtig und fensterlos.
Das Fenster sitzt allein an der Kante admin→portfolio, und es ist dort auch
nicht wegzusortieren: portfolio hat keinen `NUXT_INSTANCE_SECRETS_KEY`, also
keine Ablage, also genau EINEN gültigen Wert — wer zuerst dort dreht, bricht
dieselbe Kante von der anderen Seite. Solange das so bleibt, kostet eine
Rotation dort ein kurzes, bewusst gelegtes Fenster für genau eine
Betreiber-Handlung (Domain freischalten). Festgenagelt in
`packages/core/tests/seamRotationOrder.test.ts`; die Konsolen-Karte entscheidet
den Hinweistext seither nach der INSTANZ, nicht nach der Sorte.
**Gelernt:** Die erste Fassung dieses Nachtrags hat die Kette falsch gezeichnet
(sie hielt platform für einen Empfänger) und war zwei Stunden lang live. Der
Fehler kam davon, die Richtungen aus den Env-NAMEN zu erschliessen statt aus
den montierten Layern. Ein `extends` ist die Wahrheit darüber, welche Route auf
welchem Deployment überhaupt existiert — Namen sind es nicht.
**ETAPPE 3 (2026-08-19): die Rotation ist GEFAHREN** — und zwar fensterlos,
nachdem der Weg dafür erst gebaut werden musste. `portfolio` hatte keinen
`NUXT_INSTANCE_SECRETS_KEY`, konnte also nur EINEN Wert kennen; damit war die
Kante admin↔portfolio nicht ohne Lücke drehbar. Also zuerst dort eine Ablage
angelegt (die Tabelle stand längst — der `system`-Layer läuft überall mit) und
in EINEM Neustart der Umschlag-Schlüssel ergänzt UND die Env auf den NEUEN Wert
gesetzt, während die Ablage-Zeile den ALTEN trug. Das ist der Kniff: `send`
nimmt die Ablage zuerst, `accept` nimmt beide — portfolio sendete also weiter
alt und nahm ab sofort beides an, ohne dass eine Kante fiel. Danach der Reihe
nach admin, platform, portfolio auf den neuen Wert, zuletzt beide Env-Werte
nachgezogen. Gemessen wurde an ECHTEN Kanten statt an Vermutungen: POST auf
`/api/site/domain/settle` (409 = angenommen UND der geschachtelte Rückruf ans
Control Plane trug; 401 = abgewiesen) und auf `/api/control/community/audience`
(400 = angenommen). Schlussstand: neuer Wert überall 409/400, ALTER WERT
ÜBERALL 401, alle vier Hosts 200.

UNABHÄNGIG GEGENVERIFIZIERT (2026-08-19, zweite Sitzung — auf Davids Wunsch
„rotiere die control→silo-Richtung auch noch", die sich damit als schon
erledigt erwies): beide Richtungen sprechen DASSELBE Wort, es gibt keine
richtungs-eigenen Keys. Alle vier Ablage-Punkte (platform-Env, admin-Env,
beide Konsolen-Zeilen entschlüsselt) tragen denselben Hash; der
Settle-Empfänger der Silo-Kante (portfolio → kanonisch pukalani.studio)
weist einen falschen Wert mit 401 ab, auf Pool-Mandanten ist die Route zu
(404). Eine zweite Rotation wurde bewusst NICHT gefahren — fertige fremde
Arbeit wird verifiziert, nicht wiederholt.

**Gelernt:** Ein Zyklus lässt sich mit „erst Empfänger, dann Sender" NICHT
drehen — beide Knoten stellen mit einem Eintrag zugleich Annahme und Senden um.
Der Ausweg steckt in der Rangfolge selbst: Ablage=ALT + Env=NEU ist der
Zustand „nimm schon beides an, sende aber noch alt". Damit wird aus einem
Zyklus wieder eine Kette. Wer nur die Konsole benutzt, kann diesen Zustand
nicht herstellen — er braucht genau einen Neustart, und den hatten wir für den
Umschlag-Schlüssel ohnehin.
**Gelernt:** Beweise gehören an die Kante, nicht an die Konfiguration. Dass
drei `.env` denselben String tragen, sagt nichts darüber, ob die Naht trägt;
ein 409 auf der Settle-Route sagt es für BEIDE Richtungen auf einmal, weil der
Handler nach der Prüfung selbst zurückruft.

---

### F59 — Zeitzone aus dem Ort vorschlagen ✅ 2026-08-18

**Die letzte Ebene des Zeitzonen-Pakets vom 2026-08-17** (Konto-Zone auf
Event-Seiten, drift-freie Serien, Heimat-Zone der Community): der Termin, der
WOANDERS stattfindet. Davids Entscheidung (2026-08-17) wörtlich umgesetzt —
**vorschlagen statt geokodieren**: zeigt die Freitext-Adresse eines
Vor-Ort-Termins erkennbar in ein anderes Land, bietet das Formular die Zone
als Klick an; nichts wird still abgeleitet, kein externer Dienst, keine
Adresse verlässt die Instanz.

**Die Regel ist PURE und fail-closed**
(`packages/events/shared/addressTimezone.ts`): kuratierte Tabelle mit 48
Ländern (deutsch/englisch/Eigennamen), Diakritika-Normalisierung mit
ß→ss VOR der NFD-Zerlegung, Wortgrenzen SELBST geprüft (`\b` greift bei
Unicode nicht — „Chinatown" darf nicht China treffen). Bewusst NICHT drin:
Mehr-Zonen-Länder (aus „USA" folgt keine Zone), mehrdeutige Namen (kein
„Georgia", kein deutsches „Island" — normalisiert träfe es „Long Island" —,
kein „England"/„Wales", kein „Korea" allein), Zwei-Buchstaben-Codes, Städte.
Matchen zwei VERSCHIEDENE Länder ⇒ kein Vorschlag.

**Im Formular** (`EventFormModal.vue`): `timezoneOverride` + effektive Zone —
Wanduhr-Umrechnung, Hinweistext und Payload rechnen ab jetzt die effektive
Zone; Vorschlag und Rückweg stehen als zwei unabhängige Zeilen beim
ADRESSFELD (kein `v-else` — zeigt die Adresse nach dem Übernehmen in ein
drittes Land, gäbe es sonst einen Vorschlag ohne Rückweg). Übernehmen tauscht
nur die BEDEUTUNG der getippten Zeit, nie die Zahl. **Nebenbei einen echten
Fehler behoben:** das Bearbeiten las `row.timezone` nie und stempelte beim
Speichern die Community-Zone zurück — ein Termin in Tokio verschob sich um
Stunden, sobald jemand nur den Titel korrigierte.

**Beweis:** 21 neue Unit-Tests (Treffer, Fail-closed-Gegenproben,
Tabellen-Invarianten), events gesamt 208/208, eslint sauber,
`check:i18n-keys` grün, platform-Typecheck 0 Fehler.

**Gelernt:** (1) **IANA-Zonen-Namen wandern, und `Intl.supportedValuesOf`
nennt je Laufzeit nur EINE Schreibweise** — Node 22 (ICU 77) kennt nur
`Europe/Kiev`/`Asia/Calcutta`/`Asia/Saigon`/`America/Buenos_Aires`, aktuelle
Browser dieselben Zonen als `Europe/Kyiv`/`Asia/Kolkata`/… Da BEIDE Enden
gegen `isSupportedTimezone` validieren, hätte jede Schreibweise eine Seite
gegen sich gehabt: der Klick auf „Übernehmen" wäre im 400 gelandet. Ukraine,
Indien, Vietnam und Argentinien sind deshalb draußen; der Invariantentest
nagelt jede Tabellen-Zone an die Laufzeit-Prüfung. Ein Vorschlag, den man
nicht speichern kann, ist schlimmer als keiner. (2) Der Invariantentest hat
das VOR dem ersten manuellen Test gefangen — Tabellen-Daten verdienen
dieselben Gegenproben wie Code.

### Presence-Vorfahrt: sichtbarer Tab schlägt away-Tab fremder Mandanten ✅ 2026-08-18

Die Beobachtung stammt aus der Nachmessung des Scope-Vorfalls (Eintrag
darunter): die Plattform führt bewusst EINE Presence pro User (presenceId =
userId). Hat jemand die Dashboards ZWEIER Communities gleichzeitig offen, sind
das zwei Origins ohne Koordinationsmöglichkeit im Browser — und beide Tabs
schreiben dieselbe Zeile. Der versteckte Tab (`metadata.away=true`, von der
Browser-Drossel auf ~1×/min gebremst) stahl dem sichtbaren Tab (20-s-Takt)
regelmäßig den `metadata.tenantId`-Stempel; weil beide Leser fail-closed auf
genau diesen Stempel filtern, flackerte der Online-Zähler BEIDER Communities
zwischen 0 und 1 (gemessen: Davids Presence wechselte binnen 30 s zwischen
freelancer.supply und comments.pukalani.app). Alt-Design, kein Fehler des
Scope-Fixes — aber sichtbar für jeden Kunden mit zwei Tabs.

Entwurf (Davids Entscheidung: „Voll inkl. Leave-Guard"): der Server ist der
EINE Schiedsrichter. Pure Regel `core/shared/presencePriority.ts` — ein
away-Schreiber weicht einer FRISCHEN (<60 s = drei verpasste Heartbeats),
SICHTBAREN Presence eines FREMDEN Mandanten; alles andere bleibt bewusst
Letzter-gewinnt (away-über-away: sonst stürbe die Presence, niemand verlängerte
die Expiry; gleicher Mandant: sonst käme die away-Meldung des EINZIGEN Tabs nie
durch, seine eigene letzte Presence trägt denselben Stempel). Konstanten-Kette
per Test genagelt: 60 s Vorrang < 180 s Leser-Frische < 240 s Expiry. Drei
Anbauten: Heartbeat prüft NUR im away-Fall (kein Zusatz-GET im 20-s-Normalfall),
der Leave-Beacon löscht nicht mehr mandantenblind (das Schließen eines
Hintergrund-Tabs radierte den sichtbaren sonst für ~20 s aus), und away-Tabs
upserten NICHT mehr per WS — der liefe direkt an der Server-Regel vorbei, und
genau das war die offene Entwurfsfrage („der away-Client weiß nicht, ob er der
einzige Schreiber ist"): er muss es nicht wissen, er schreibt nur noch über den
HTTP-Heartbeat, und der Server sieht nach. Preis: der „im anderen Tab"-Badge
erreicht andere per 20-s-Poll statt ~280 ms — für einen versteckten Tab egal.

Beweis (Commit 540a6fc5, live als Build 4c758498 auf allen fünf Hosts):
13 Unit-Tests der puren Regel; neuer `packages/core/scripts/
verify-presence-away-priority.mjs` 12/12 über den ECHTEN Pfad (zwei lokale
Mandanten-Hosts, ein Nutzer, Stempel bleibt beim sichtbaren Tab; Gegenproben:
gleicher Mandant kommt durch, away-über-away wechselt, leave über den eigenen
Host löscht weiterhin); `verify-presence-boundary.mjs` 23/23 als
Regressions-Netz. Die Mandanten-Stempel ermittelt das neue Skript EMPIRISCH aus
der geschriebenen Presence statt aus einer Tabelle — `communities` lebt im
Control Plane, dafür hat es keinen Schlüssel.

**Gelernt:** Zweierlei. (1) Der Regressions-Beweis war zuerst 16/23 rot — nicht
wegen des Codes, sondern weil die Control-Naht (`NUXT_ONBOARDING_CONTROL_URL`
→ :3004) ins Leere zeigte und die A5-Label-Vergabe deshalb scheiterte. Die
CLAUDE.md-Regel „ein Beweis über Prozessgrenzen ist so ehrlich wie sein
ENTFERNTESTER Dienst" gilt auch für REGRESSIONS-Beweise: Control-Server im
Worktree auf 3014 hochfahren, Platform mit Env-Override starten ⇒ 23/23.
(2) Eine Prüfung, die ihren Erwartungswert aus DERSELBEN Antwort ableitet, die
sie prüft, ist immer grün (der Aufwärm-Schritt verglich `warmB.tenantId` mit
dem daraus gebauten `TENANT_B`) — Erwartungswerte müssen aus einer ANDEREN
Quelle stammen, hier: „ungleich dem Stempel von A".

### Online-Zähler stand seit AH-1 überall auf 0 — Runtime-Key ohne Presences-Scopes ✅ 2026-08-18

Davids Fund (Screenshots von freelancer.supply und comments.pukalani.app):
„0 online", obwohl er selbst eingeloggt im Dashboard stand. Kein Code-Fehler —
der beim AH-1-Cutover (2026-08-11) neu angelegte **Runtime-Key des Projekts
`account`** folgte der damaligen Runbook-Kurzform „sessions/users/rows/health"
und kam damit OHNE `presences.read`/`presences.write` (DEPLOYMENT.md verlangt
die volle 10-Scope-Liste; `control` und `portfolio` haben sie). Folge auf
JEDER Pool-Community, eine Woche lang: Heartbeat, leave und Zähler liefen in
ein 401 `general_unauthorized_scope`, das drei best-effort-`catch`-Blöcke
lautlos verschluckten — keine einzige Logzeile. Diagnose-Weg, der trug: erst
Code-Kette lesen (unauffällig), dann die öffentliche Zähler-Route auf zwei
Hosts proben (beide 0 ⇒ global, nicht Custom-Domain), dann `/v1/presences`
direkt mit dem Runtime-Key VOM SERVER aus rufen (Key verlässt den Server nie)
— die 401-Antwort nannte den fehlenden Scope beim Namen.

Repariert in zwei Hälften: (1) **Scopes ergänzt** in der Console (Davids
Freigabe, per Chrome-Session) — wirkte sofort, `count: 1` auf
freelancer.supply, und die frisch geschriebene Presence trug korrekt
`read(label:<communityId>)` (A4-Grenze intakt). (2) **Härtung** (c2a5e411,
deployt und am Live-Build-SHA verifiziert): `warnPresenceScopeMissingOnce()`
in `core/server/utils/presence.ts` meldet GENAU den Scope-Fehler einmal pro
Prozess als strukturiertes `presence.scope_missing` (F44-Muster; transiente
Fehler bleiben still, verbrauchen den Merker nicht), verdrahtet in Heartbeat,
Leave und `listOnlinePresences`. Dazu prüft `probe-key-scopes.mjs` jetzt auch
`/presences`, und ACCOUNT-CUTOVER.md nennt in der Key-Zeile die volle
Scope-Liste samt Probe. Beweis: neuer Test 3/3, core 1250/1255, Lint/Typecheck
grün.

**Gelernt:** Ein Runbook, das eine Scope-Liste ABKÜRZT („sessions/users/rows/
health"), wird beim nächsten Cutover wörtlich ausgeführt — Aufzählungen in
Runbooks entweder vollständig schreiben oder auf die maßgebliche Liste
verweisen, nie paraphrasieren. Und: ein best-effort-`catch` um eine
Zusatzschicht ist richtig, braucht aber eine Ausnahme für Fehler, die sicher
Konfiguration sind und nie von selbst heilen — sonst sieht „Feature bewusst
degradiert" eine Woche lang exakt aus wie „Feature kaputt" (dieselbe Lektion
wie F44/Mailer, nur an der nächsten Stelle).

### KI-Übersetzung für User-Content — einer übersetzt für alle ✅ 2026-08-18

Davids Auftrag (2026-08-17, aus der Airbnb-Recherche heraus): Beiträge und
Kommentare über `aiComplete()` übersetzen, gecacht nach dem posts-022-Muster.
Vier Entscheidungen vorab eingeholt: **Beiträge + Kommentare** · **Knopf je
Inhalt, keine Automatik** · Gate ist das **INHALTS-Produkt, bewusst nicht
`ai`** (eine personal-Community soll ihre eigenen Texte lesen können) · **nur
Eingeloggte, gedrosselt**; nachgereicht: **Tages-Limit 100/24 h je Konto**.

Bauform: EINE pure fail-softe Regel `core/shared/ugcTranslations.ts` (Muster
`categoryI18n`, geteilt wie `reactions.ts`, weil comments nie aus posts
importieren darf), JSON-Spalte `translations` als **MEDIUMTEXT** auf
`community_posts` (posts-023) und `comments` (comments-020) — Varchar wie bei
den Kategorien ginge nicht, body 10000 × Sprachen sprengt das
utf8mb4-Zeilenbudget. Routen `POST /api/posts/:id/translate` +
`/api/comments/:id/translate`: Lesen über die **Mitglieder-Klinke**
(Row-Permissions = Sichtbarkeitsprüfung, sonst läse ein Nicht-Mitleser fremde
Texte über den Umweg Übersetzung), Cache-Schreiben als
`operator`/`actor:'operator'` (abgeleiteter Inhalt — weder M13-Sperre noch
A5-Beitritt dürfen ziehen). **Cache-Treffer VOR jeder Drossel** (was nichts
kostet, kostet kein Kontingent), dann Burst 10/10 min je Mensch+Community,
Tages-Eimer `ugc-translate-day:<userId>` (EIN Deckel über beide Inhaltsarten),
IP-Buckets in `05.rate-limit.ts`. Echte Bearbeitung leert den Cache
(`[id].patch.ts`), No-op-Speichern nicht; neu übersetzt wird erst bei erneuter
Nachfrage — Dauer-Editieren erzeugt also keine KI-Kosten. UI: EIN Composable
`useUgcTranslation` (core), Knöpfe in `PostCard` und `CommentItem`, gleicher
Renderpfad für beide Fassungen, „Automatisch übersetzt · Original anzeigen".
Nachtrag gleichentags: **Umfrage-Optionen übersetzen mit** (im selben
KI-Aufruf) — `translatedPollOptions` übernimmt nur ein Array EXAKT gleicher
Länge (die Stimme hängt am Index; ein verschobenes Array ließe jemanden auf
„Ja" klicken und für „Nein" stimmen), sonst bleiben die Beschriftungen
Original und Titel/Text trotzdem übersetzt. Live auf demo bewiesen, auch
gemischtsprachig (DE/EN-Optionen kollabieren sauber in die Zielsprache).
Auch der GANZE Umfrage-Thread ist live bewiesen (demo, „Wann passt euch die
nächste Live-Session…"): Umfrage samt 4 Optionen UND beide Kommentare des
Threads nach EN übersetzt, Cache-Gegenprobe je Stück `cached:true` — jedes
Stück hat seinen eigenen Knopf und Cache-Eintrag. Eine Umfrage IN einem
Kommentar gibt es im Datenmodell nicht (Umfragen sind Beiträge, Kommentare
reiner Text) — die Frage kam von David und gehört hierher, damit sie nicht
wieder gestellt wird.
Zweiter Nachtrag gleichentags (Davids Entscheidung): **Events und Kurse
ziehen nach** — events-013 (`events.translations`) und courses-007
(`courses.translations` + `lessons.translations`), drei Routen mit dem
jeweiligen Inhalts-Produkt als Gate und demselben Tages-Eimer. Zwei Regeln
daraus: **Übersetzen zeigt nie mehr als Lesen** (die Lesson-Route übernimmt
alle fünf Vorprüfungen ihrer GET-Route — Entwurf, unveröffentlichter Kurs,
fehlende Einschreibung, paid-Gate; live bewiesen: ohne Einschreibung 403;
das BEZAHL-Tor zusätzlich lokal in beiden Hälften bewiesen — paid-Kurs mit
`entitlementProduct 'paidCourses'`: ohne Abo sind Einschreiben UND Übersetzen
403, mit simuliertem aktivem Abo (`billing_subscriptions` planId `pro`) läuft
beides und der zweite Abruf kommt aus dem Cache, 8/8). Auch das
EMBED-Widget ist geprüft (lokal, /embed mit demselben CommentItem): der GAST
sieht den Kommentar, aber KEINEN Übersetzen-Knopf (der Composable gate-t auf
die Session — kein anonymer KI-Kostenweg im iframe), der EINGELOGGTE sieht
ihn, und ein Klick übersetzte den deutschen Kommentar im Widget nach Englisch
samt „Automatically translated · Show original"-Zeile.
SEITEN (pages-Layer) bleiben BEWUSST draußen (geprüft 2026-08-18, Route
existiert nicht): sie sind Betreiber-CMS, kein UGC — Rechtstexte (Impressum,
AGB, Datenschutz) dürfen nicht auf Leser-Klick maschinell abweichen, ein
200k-Body sprengt das Output-Budget eines KI-Aufrufs, und das richtige
Modell wäre ohnehin das der Kategorie-Übersetzungen: der OWNER pflegt je
Sprache eine Fassung (ggf. mit KI-Vorschlag im Dashboard) — das wäre ein
eigenes Feature, kein Anbau an dieses
und **die Schwärzung leert den Cache mit** (`redact.post.ts` — sonst gäbe
der Knopf den geschwärzten Text als Cache-Treffer wortgleich wieder heraus).
Beweis jetzt 32/32 über alle fünf Inhaltsarten; live auf demo: Event, Kurs
und Lektion DE→EN je mit Cache-Gegenprobe.
KOSTEN-SCHÄTZUNG (2026-08-18, nachgemessen: kein `app_config.aiModel`-
Override ⇒ Default Claude Haiku 4.5 via OpenRouter, ~1 $/Mio. Input- und
~5 $/Mio. Output-Token): Kommentar ~0,1 Cent, Beitrag/Event ~0,3–0,5 Cent,
Maximaltexte (10k/15k Zeichen) ~2–3 Cent je Übersetzung. Monatlich damit:
heutige Nutzung < 1–2 €, eine lebhafte zweisprachige Community ~10–25 €;
harte Obergrenze je Konto ist der Tages-Eimer (100 × Worst-Case-2-Cent ≈
60 €/Monat bei täglich ausgereiztem Limit mit Maximaltexten, realistisch
~10 €). Die Kurve ist DEGRESSIV: jedes Inhalt-Sprache-Paar kostet genau
einmal, populäre Inhalte sind am schnellsten dauerhaft im Cache. Hebel ohne
Deploy, falls es je spürbar wird: `app_config.aiModel` (günstigeres Modell)
und das Tages-Limit.

Beweise: `packages/core/scripts/verify-ugc-translation.mjs` **16/16** gegen
echte Routen + KI (cached:false → cached:true zeichengleich, Zeile trägt die
Fassung, Edit leert, No-op lässt stehen, Gast 401, Sprachcode-Müll 400),
Browser-Klickprobe (Code-Span `headlamp` blieb stehen), Prod-Livetest auf
demo.pukalani.app (DE→EN, Cache-Hit, 401). Migrationen VOR dem Code-Deploy auf
`account` + `comments` gefahren; `NUXT_AI_KEY` auf platform gesetzt (fehlte —
F44-Klasse: Gate an, Schlüssel weg, Feature wäre still tot gewesen).

**Gelernt:** Die Create-Routen antworten **201**, nicht 200 — der erste
Beweis-Lauf hatte drei Skript-Rote, die Feature-Grüne daneben waren echt;
Statuscodes im Beweis immer von der Route ablesen, nicht raten.
**Gelernt:** Während des Abschlusses hat die Nachbar-Sitzung die ploi-Site auf
`admin.pukalani.app` umbenannt (AH-4b) — Deploy-rsync und `check:doc-links`
brachen mid-flight. Bei parallelen Sitzungen gehört VOR dem Prod-Flip ein
frischer Blick auf `main` UND auf die laufenden CI-Runs; tote Runbook-Verweise
nach fremden Renames darf man minimal heilen und meldet es der Sitzung
(SendMessage), statt zu warten oder doppelt zu bauen.

---

### Demo-Spielwiesen — drei Pool-Communities mit Leben gefüllt ✅ 2026-08-18

Davids Auftrag (2026-08-17): freelancer.supply als Spielwiese mit Demo-Daten
füllen — User mit Rollen, Inhalte für alle Produkte, gegenseitige
Nachrichten —, um UI/UX und Sicherheit am lebenden Objekt prüfen zu können.
Am 2026-08-18 auf **Morgenlicht** (demo, zweisprachig im Yoga-Ton) und
**Comments** (Blog-&-Web-Ton) ausgeweitet; **portfolio bewusst NICHT**
(Silo ohne Community-Produkte, echte Geschäfts-Site — Davids Entscheidung).

Acht Demo-Konten (`mail+fs-*@davidschubert.com`, anna=admin, jonas=moderator,
miriam=editor, Rest viewer) — EINMAL im Projekt `account` angelegt, als
Mitglieder in allen drei Communities, mit Profilbildern (randomuser-Portraits)
und Bios. Der Weg ist der Punkt: fast alles lief über die **echten
HTTP-Routen mit Session-Cookies** (Signup → A5-Registration-Join, Posts,
Kommentare, Votes, RSVPs, Einschreibungen, DMs) statt direkt in die DB —
dadurch sind die Produktionspfade gleich mitgetestet. Nur drei Handgriffe
direkt: Rollen (`community_members`-Patch im Control Plane),
`message_settings.enabled` (Owner-only-Route) und Davids eigenes Profilbild
(per ssh AUF dem Server mit dessen Runtime-Key — Werte verlassen den Server
nie). Umfang gesamt: ~600 Objekte (22 Discussion-Themen mit 109 Antworten,
21 Feed-Beiträge + 5 Umfragen, 6 Events mit 49 RSVPs, 3 Kurse, 15
DM-Konversationen mit 73 Nachrichten, 14 Galerie-Bilder). Werkzeug + Läufe +
Zugangsdaten: `~/.appwrite-secrets/freelancer-demo/` (idempotent über Titel,
--dry-run/--only; NICHT im öffentlichen Repo).

Nebenbei bewiesen, dass die Grenzen halten: Signup-Drossel nach 5 Konten,
fremde DM-Konversation → 404 (kein Existenz-Leak), Viewer-Kategorie → 403,
Gast-DMs → 401, Kommentar auf geschlossenes Thema → 403 `topic_closed`.
Zwei ECHTE Bugs aufgeflogen und behoben (Davids „Profilbild geht nicht"):
(1) `avatars`-Bucket ohne `create("users")` auf ALLEN drei Prod-Instanzen —
Session-Upload starb als generisches 500; Buckets direkt gefixt, Migration
system-032 zieht Bestand seither im 409-Zweig nach (`eeb67cd8`).
(2) `/api/storage/` fehlte in `controlApiPrefixes` — die Profilseite lebt
seit AH-1 auf account.pukalani.app, ihr Foto-Upload 404te dort (`3a9f5460`,
deployt, auf dem Kontroll-Host nachgemessen 404 → 201).

**Gelernt:** Eine Migration, die ihre Einstellungen aus der Prod-Instanz
ABLIEST, kopiert auch deren Fehlstand — system-032 hatte die leeren
Bucket-Permissions als „ist so gewollt" übernommen, und der Fehler wäre auf
jede frische Instanz gewandert. Abgelesene Werte gehören gegen den KONSUMENTEN
geprüft (die Upload-Route sagt klar: Session-Client braucht Bucket-Create).
Und: ein Feature, das auf den Kontroll-Host umzieht (AH-1: Profilseite),
braucht seine API-Präfixe in `controlApiPrefixes` MIT — der 404 sieht dort
wie ein Server-Fehler aus, und auf Mandanten-Hosts funktioniert derselbe
Pfad, was die Diagnose in die falsche Richtung schickt. Drittens, klein aber
zweimal gestolpert: Listen-Routen antworten uneinheitlich (`rows` vs.
`items`) — wer Beweise per API zählt, liest erst die Rohantwort.

### U21 — Tickets, die sich selbst umsetzen (AI-Runner) ✅ 2026-08-18

Ein Ticket auf admin.pukalani.app hat jetzt einen „Ausführen"-Bereich: ein
Klick, und auf Davids Mac claimt der Daemon `tools/ai-runner` den Auftrag,
startet Claude Code in einem CLI-Worktree des Zielrepos, streamt den
Fortschritt live ins Board (geteilte JWT-Realtime auf `run_events`) und
schreibt am Ende Branch, Commit, Diffstat, Tests, Dauer, Kosten und
Session-Id als Bericht ins Ticket — Transkript als Datei im Bucket
`runner-files`. Gebaut in vier Paketen (Konzept + Messläufe →
[AI-RUNNER.md](plans/AI-RUNNER.md)): Layer `packages/runner` + Migrationen
runner-001/002 · die Naht (5 Board- + 5 Runner-Routen, Bearer-Secret,
Claim-Mutex, `draft`-Status gegen das Anhänge-Wettrennen) · Board-UI
(Einmal-Token-Registrierung, RunnerRunPanel, A14-Verdrahtung ins
Ticket-Modal, `promptTrusted` aus `feedbackId`) · Mac-Daemon (deps-frei,
Allowlist lokal, klemmt Modus/Modell/Budget sichtbar, committet selbst, nie
push). End-zu-End bewiesen: echtes Ticket → geklemmtes Modell (fable→haiku
als Ereigniszeile) → richtiger Ein-Zeilen-Fix im Worktree-Commit mit
Ticket-/Lauf-/Session-Id → Bericht im Board; 23 s, $0.04, `main` des
Zielrepos unberührt. Sicherheits-Beweise mit Gegenprobe:
`verify-runner-boundary.mjs` (24; requireOwnRun neutralisiert ⇒ exakt 2
rot), `smoke.mjs` (46), Unit-Tests 55.

**Gelernt:** Dem Exit-Code eines headless Claude-Laufs darf man NIE glauben —
ein komplett blockierter Lauf endet als `success`/`is_error:false`, die
Wahrheit steht nur in `permission_denials` und `post_turn_summary`
(nachgemessen, bevor der Daemon gebaut wurde: drei Testläufe für ~4 Cent
haben drei Konzept-Annahmen bestätigt und zwei Fallen gefunden — Messen vor
Bauen hat sich hier doppelt bezahlt). Und: `git add -A` in einer Sitzung,
in der parallel ein zweiter Agent Dateien schreibt, sammelt dessen
halbfertigen Stand mit ein — Paket-4-Dateien landeten so im
Paket-3-Commit; seither bekommen parallele Agenten harte Dateigrenzen und
der Commit nennt Pfade statt `-A`.

### E1 + E1b — die lokalen Prod-Schlüsseldateien zeigen wieder aufs richtige Projekt ✅ 2026-08-17

Zwei Altlasten derselben Sorte, beide auf Davids Rechner (gitignored, nie im
Repo), plus der Wächter, der sie künftig findet:

- **E1** — `apps/control/.env.production` zeigte auf das GELÖSCHTE Projekt
  `studio`. Beim Bau des Wächters festgestellt: die Datei ist nicht mehr
  vorhanden.
- **E1b** — `apps/platform/.env.production` (vom 22. Juli) zeigte auf **`pool`**,
  das der Account-Cutover AH-1 am 2026-08-11 EINGEFROREN hat. Aufgefallen beim
  Versuch, für freelancer.supply (Scope `t-6a7bc358…`) von Hand eine Kategorie
  anzulegen: gegen `pool` meldeten `pages`, `post_categories` und
  `community_posts` jeweils `total=0` — die Community liegt dort gar nicht.
- **Wächter** — `pnpm ops:site-env` vergleicht seit 2026-08-18 zusätzlich die
  (nicht geheime) `NUXT_PUBLIC_APPWRITE_PROJECT_ID` des Servers mit dem, was
  `apps/*/.env.production` und `~/.appwrite-secrets/migrations/*.env` behaupten,
  nennt bei bekannten Altprojekten den Grund und endet mit Exit 1.
- **Letzter Handgriff (2026-08-17)** — die `platform`-Datei ist aus dem
  Repo-Baum weg. **VERSCHOBEN, nicht gelöscht**, nach
  `~/.appwrite-secrets/backups/platform-env-production-pool-frozen-2026-08-17.env`:
  sie war kein Teilstück der sanktionierten `pool.env` (1033 gegen 417 Bytes),
  sondern eine vollständige App-Env. Drei Variablen standen nur dort; die
  einzige geheime davon (`NUXT_APPWRITE_MIGRATIONS_KEY`) ist byte-identisch mit
  `~/.appwrite-secrets/pool-migrations.key` — per Hash-Vergleich belegt, ohne
  einen Wert anzuzeigen. Ein `rm` wäre also vertretbar gewesen; das Verschieben
  kostet nichts und ist umkehrbar.

**Beweis:** `pnpm ops:site-env` → „Alle Sites vollständig konfiguriert, alle
lokalen Dateien zeigen aufs richtige Projekt."

**Gelernt:** (1) **Eine Zustandsbehauptung in einem Dokument verfällt still.**
E1 schloss wörtlich mit „die anderen drei `.env.production` sind korrekt" — das
war beim Schreiben wahr und wurde durch einen völlig unbeteiligten Cutover
falsch, ohne dass jemand den Satz anfasste. Wer den Eintrag las, war danach
schlechter informiert als jemand, der ihn nicht gelesen hatte. Solche Sätze
gehören deshalb nicht in ein Dokument, sondern in einen Wächter — genau das ist
`ops:site-env` jetzt. (2) **Eine veraltete Env-Datei scheitert nicht laut.** Der
Lauf gegen das eingefrorene Projekt wirft keinen Fehler, er liefert `total=0` —
und das liest sich wie „die Daten fehlen", nicht wie „falsches Projekt".
Gefunden wurde es nur, weil jemand ein KONKRETES Datum erwartete und es nicht
vorfand. (3) **„Löschen ist Davids Klick" hat den Punkt zehn Tage liegen
lassen.** Verschieben in die schon vorhandene `backups/`-Ablage gibt dieselbe
Sicherheit wie Aufheben, räumt aber sofort — es braucht keinen Menschen, der
sich traut.

---

### F58-Nachtrag — der fehlende Menüpunkt „Kurse", und ein Reiter ohne Ziel ✅ 2026-08-17

Nach F58 fehlte auf freelancer.supply weiterhin der Menüpunkt „Kurse" im
Dashboard. Der Live-Payload schloss drei der vier Tore aus (`plan: "pro"`,
`products: {}`, Mandanten-Host), übrig blieb die Capability — und dort lag eine
Asymmetrie, die niemand entschieden hatte: **`events.manage` saß beim
Redakteur, `courses.manage` beim Admin**, zwischen `branding.manage` und
`team.manage`. Ein Redakteur durfte also Beiträge, Seiten, Medien und Termine
anlegen, aber keinen Kurs. Von außen sieht das exakt aus wie ein Fehler („ich
habe doch die richtige Rolle").

**Davids Entscheidung 2026-08-17: Kurse sind Inhalt.** `courses.manage` steht
jetzt im EDITOR-Block; Admin und Owner erben sie unverändert. Der Moderator
bekommt sie ausdrücklich NICHT — Editor und Moderator bleiben Geschwister, und
der Test nagelt beide Richtungen fest. Die Matrix ist pur und wird von Server
(`decideCommunityAccess` → `requireCommunityPermission`) und Client (Menü)
gelesen, die Route öffnet sich also mit dem Menüpunkt zusammen. RBAC-CONCEPT.md
und G0-PRODUKTVERTRAG.md nachgezogen.

**Zweiter Befund beim selben Hinsehen: der Reiter „Mitglieder" hatte kein
Ziel.** Beim F57-Umbau (2026-08-14, Commit `f781655a`) hat ein Kommentarblock
die `to`-Zeile in `communityTabs` ersetzt. Ein Reiter ohne Ziel verschwindet
aber nicht: `localePath(undefined)` ergibt den AKTUELLEN Pfad, also stand
„Mitglieder" auf jeder Seite der Hülle als aktiv hervorgehoben da — auch auf
„Allgemein" — und ein Klick führte zurück auf dieselbe Seite. Drei Tage lang,
sichtbar für JEDES Mitglied, weil der Reiter seit F57 nur noch
`members.invite` verlangt. `to` wiederhergestellt; dazu ein fail-closed
Wächter in `resolveSettingsTabs` (kein Ziel ⇒ kein Reiter), Test mit
Gegenprobe. Ein Abgleich über alle `app.config.ts` zeigt: das war die einzige
betroffene Stelle.

**Gelernt:** Ein Pflichtfeld im TypeScript-Typ schützt eine `app.config.ts`
NICHT — sie wird gegen den Registry-Typ nie geprüft (dieselbe Lücke, die
`isDashboardScope` beim `scope` schon schließt). Und die gefährlichere Hälfte:
ein fehlendes Feld muss zum VERSCHWINDEN führen, nicht zu einem plausibel
aussehenden Ersatzwert. `undefined` wurde hier still zu „die Seite, auf der du
gerade bist" — das sah aus wie ein Bedienfehler des Nutzers, nicht wie ein
Fehler im Menü. Beim nächsten neuen Registry-Feld gehört der fail-closed Filter
gleich mit dazu.

### F58 — Kurse und Termine sind aus dem Produkt heraus verwaltbar ✅ 2026-08-16

Gemeldet als Rechte-Problem („eingeloggt, richtige Rolle, kann trotzdem keinen
Kurs anlegen oder bearbeiten" — freelancer.supply/de/courses). Es war keines:
auf `/courses`, `/courses/:slug` und `/events` gab es **für keine Rolle** einen
Einstieg in die Verwaltung. Anlegen und Bearbeiten lebten ausschließlich unter
`/dashboard/courses` bzw. `/dashboard/events`, und von der Seite, auf der man
den Kurs SIEHT, führte kein Weg dorthin. Wer den Pfad nicht auswendig kannte,
stand vor einer Galerie ohne Ausgang — genau das sieht aus wie ein fehlendes
Recht. (Davids Leitprinzip: die Kernhandlung eines Produkts muss AUS DEM
PRODUKT HERAUS erreichbar sein.)

**Gebaut.** Je Produkt zwei Knöpfe in der Kopfzeile der öffentlichen Liste
(„Neuer Kurs"/„Neues Event" + „Verwalten") und ein „Bearbeiten" auf der
Detailseite, alle drei sichtbar nur mit der jeweiligen Capability. Zwei Knöpfe
statt einem, weil sie zwei Fragen beantworten: **Entwürfe stehen nicht in der
öffentlichen Liste** — wer gerade etwas angelegt hat, findet es dort nicht
wieder, „Verwalten" ist der einzige Weg dahin. Die Ziele sind TIEF verlinkt
(`?new=1` öffnet den Anlege-Dialog, `?edit=<id>` genau diesen Termin, Kurse
haben mit `/dashboard/courses/:id` ohnehin eine eigene Adresse) — ohne das wäre
die Beschriftung nur halb wahr.

Neu dafür: `useCapability()` in core (Operator-Label **oder** Community-Rolle —
dieselbe Rechnung wie `requireCommunityPermission` auf dem Server). Das
vorhandene `useCommunityCapability` allein hätte in Silo-Apps und im Playground
nichts gezeigt, weil es dort gar keine Community-Rolle gibt. Der
Termin-Knopf sitzt in `EventDetail.vue`, nicht in der Seite: die Detailseite
gibt es zweimal (events-Layer + Bauplan-Fassung), und eine Kopie ohne die
andere wäre der Pool/Silo-Unterschied, den PRODUKT-BILANZ.md ausschließt.

**Nebenbefund, behoben:** die Liste „Wiederholung" im Termin-Dialog stürzte bei
JEDEM Klick ab (`A <SelectItem /> must have a value prop that is not an empty
string`) — Serien-Termine waren über die Oberfläche nicht anzulegen. Ursache
war `value: ''` für „Einmalig"; der leere String ist bei Reka für „Auswahl
gelöscht" reserviert. Jetzt ein Sentinel (`'none'`) mit Übersetzung an genau
einer Stelle; Formularfeld und Nutzlast führen weiter `''`.

**Beweis:** `packages/courses/scripts/verify-manage-entrypoints.mjs` (14/14) und
`packages/events/scripts/verify-manage-entrypoints.mjs` (15/15), beide **mit
Gegenprobe** — ein gewöhnliches Mitglied und ein Gast sehen keinen der Knöpfe.
Das Öffnen der Dialoge selbst ist im Browser nachgemessen (es rendert
client-seitig, das SSR-HTML kann es nicht zeigen).

**Gelernt:** Ein Absturz, der nur beim ÖFFNEN einer Auswahlliste passiert, ist
unsichtbar, solange niemand die Liste öffnet — der Dialog ging auf, der Knopf
zeigte „Einmalig", und das Formular sah heil aus. Aufgefallen ist er erst, weil
der neue Tiefen-Link den Dialog schon beim Seitenaufbau öffnet und der Absturz
dabei die GANZE Seite mitriss. Ein Beweis, der nur SSR-HTML liest, hätte das nie
gefunden: was erst beim Klicken mountet, muss auch geklickt werden.

**Nachtrag 2026-08-17 — der Dialog öffnet jetzt AUF DER SEITE (Davids
Entscheidung).** Die oben beschriebenen TIEFEN LINKS sind ersetzt: „Neues
Event"/„Neuer Kurs" und „Event bearbeiten" öffnen das Formular an Ort und
Stelle. Der Link machte die Tür zwar sichtbar, ließ die Handlung aber weiterhin
woanders stattfinden — jeder Termin kostete einen Kontextwechsel, und die
Detailseite, auf der man gerade steht, verschwand dabei. Geteilt gehört der
MECHANISMUS, nicht der Einstieg: das Formular liegt seither in
`EventFormModal` bzw. `CourseFormModal` und wird von Dashboard, öffentlicher
Liste und (bei Terminen) Detailseite benutzt. Serverseitig war nichts nötig.

BEWUSST Link geblieben: „Verwalten" (beantwortet die andere Frage — Entwürfe
und Archiviertes stehen nur in der Tabelle) und „Kurs bearbeiten" (ein Kurs
wird in einer BUILDER-SEITE aufgebaut; das in einen Dialog zu zwingen wäre
schlechter, nicht konsequenter). `?new=1`/`?edit=<id>` bleiben gültige Ziele
für Lesezeichen. Neu auf der Termin-Detailseite: Zurückziehen (verlässt die
Seite — der PATCH entzieht das Leserecht, die Seite antwortet danach 404) und
Absagen (bleibt stehen, der Soft-Cancel behält das Leserecht). Vom öffentlichen
Einstieg angelegte Termine werden SOFORT veröffentlicht (`publishOnCreate`) —
ein Entwurf wäre dort im Moment des Anlegens unsichtbar; das Dashboard bleibt
Entwurf-zuerst, weil dort die Entwurfsliste danebensteht. Beweise auf den
Dialog nachgezogen, inkl. Gegenprobe „ist ein Knopf, kein Link": events 19/19,
courses 14/14.

**Gelernt (Nachtrag):** Ein FEHLENDES Boolean-Prop ist in Vue `false`, nicht
`undefined` — Boolean-Casting. Damit war in `CourseFormModal` der Zweig
„`paidAvailable` noch nicht bekannt" nie erreichbar, der Nachschlag lief nie,
und in der Kurs-Galerie fehlte „Bezahlt" dauerhaft, obwohl der Server
`paidAvailable: true` meldet. Kein Fehler, keine Warnung — nur eine Option
weniger, und `access` ist NUR beim Anlegen setzbar (der Builder zeigt es bloß
als Badge), der Kurs wäre also nie bezahlbar geworden. Kur:
`withDefaults(…, { paidAvailable: undefined })`. Wer ein optionales Boolean-Prop
als Dreizustand („ja/nein/weiß nicht") benutzt, MUSS den Default explizit auf
`undefined` setzen.

**Gelernt (Nachtrag 2) — parallele Sitzungen:** F58 wurde zweimal gebaut. Beide
Sitzungen hatten `main` vor Arbeitsbeginn geprüft; die eine landete, während die
andere noch baute. Die Regel „doppelte Arbeit ⇒ eigenen Commit fallen lassen"
greift hier NICHT blind: die zwei Lösungen unterschieden sich in einer Frage,
die David bereits entschieden hatte (Dialog statt Link). Deshalb wurde nicht
gemergt und nicht stillschweigend verworfen, sondern die Kollision vorgelegt —
und danach auf dem gemergten Stand NEU gebaut, statt zwei Wege nebeneinander
stehen zu lassen. Aus der fremden Lösung übernommen: `useCapability` (core) und
der Sentinel-Fix, beide besser als die eigene Fassung.

### Kundenreise 2026-08-15 — elf Funde beim Durchspielen, öffentlich wie eingeloggt ✅ 2026-08-15

Kein Audit über Code, sondern der Weg eines Kunden von der Startseite bis zum
Planwechsel, Station für Station im Browser. Öffentlich auf der Produktion
(Desktop + Handy, beide Sprachen), eingeloggt lokal gegen die Dev-Appwrite
(`seed-local-tester.mjs`, Konto und Community danach jedes Mal entfernt) — auf
der Produktion geht der eingeloggte Teil nicht: die Anmeldung läuft über einen
Code an eine E-Mail-Adresse, und ein Postfach hat der Agent nicht.

**Öffentlich.** Auf `account.pukalani.app` fehlte JEDES Symbol, weil
`/api/_nuxt_icon/` nicht in `controlApiPrefixes` stand — am deutlichsten an der
Passwort-Prüfliste, die ihre Häkchen verlor und zur reinen Textliste wurde, auf
der Seite, auf der jeder Kunde anfängt (`bd717033`). Gäste lasen Anwesenheit:
`usePresence()` stieg bei SSR und abgeschaltetem Realtime aus, nicht aber ohne
Anmeldung — 401 bei jedem Aufruf eines öffentlichen Mandanten-Hosts, dazu ein
nachgeladenes Web-SDK und ein 20-s-Poll ins Leere (`bd717033`). Auf der
Registrierung überlappte bis 768 px der Markenname den Zurück-Link: `p-8` gibt
32 px, die feste Leiste reicht bis 48 px, und `justify-center` läuft bei zu
hohem Inhalt nach BEIDEN Seiten über — die Anmeldung blieb heil, weil sie kurz
genug ist (`19caed61`). Jede 404 kam ohne `lang`/`dir` heraus, weil
`useLocaleSeoHead()` in app.vue sitzt und Nuxt bei einem Fehler `error.vue`
STATT app.vue rendert (`9f737b58`).

**Die Hilfe war halb englisch.** Sie schaltete ihre Oberfläche auf Englisch,
sobald der Browser englisch war, liess aber jeden Artikel deutsch stehen — und
schrieb `lang="en-US"` darüber. 18 Seiten übersetzt (~10.800 Wörter), Strategie
auf `prefix_except_default` zurückgeführt (der Vermerk dafür stand seit jeher in
der nuxt.config), je Sprache eine eigene Content-Sammlung, Sprachwähler
ergänzt — den gab es nämlich gar nicht, die Treffer im Quelltext waren die
i18n-Konfiguration (`c91e1168`, `ba91a009`, `6b611693`).

**Eingeloggt.** Der Anwesenheits-Heartbeat feuerte im Kundenbereich alle 20
Sekunden einen 404, pro Tab, für die ganze Sitzung — die Begründung dagegen
stand längst im Plugin, nur für den Fehlerseiten-Fall (`aeed2de4`). Die Hilfe
beschrieb sieben Wizard-Schritte, der Assistent hat seit U12 vier; drei
beschriebene Schritte gab es nicht mehr, dazu ein „Entwurf aus dem Assistenten",
den niemand mehr erzeugt (`aeed2de4`). Die Quer-Links zwischen Anmelden,
Registrieren und den Code-Varianten verloren `?redirect=` (zehn Stellen in vier
Dateien; der Audit fand danach eine elfte in „Passwort vergessen") — für Eingeladene ohne
Konto hiess das: Einladung angeklickt, registriert, auf der Startseite gelandet,
Einladung blieb `pending` und die vergebene ROLLE war still weg (`dba5b5b0`).
Und in der Pro-Testphase hatte die Pro-Karte keinen Kauf-Knopf, weil `isCurrent`
nur den Plan-Schlüssel verglich und eine Testphase `plan: 'pro'` setzt — kaufbar
war nur die Herabstufung (`f8b1c8f8`).

**Dazu eine Entscheidung.** Auf einer Community mit geschlossener Registrierung
war eine Einladung für Menschen OHNE Pukalani-Konto wertlos: die Register-Seite
sagt dort „Nur auf Einladung … melde dich einfach an". Davids Entscheidung: der
Token öffnet die Registrierung — gebunden an die eingeladene Adresse, sonst wäre
ein weitergeleiteter Link ein Generalschlüssel. Vertrag im Kern
(`inviteOpensRegistrationFor`), Naht im onboarding-Layer, Vorschau-Route im
Control Plane ohne JWT (es gibt noch keine Identität), Konto-Anlage auf der
Einladungs-Seite selbst (`ec79a04a`). Angegriffen statt behauptet: ohne Token
403, Token mit fremder Adresse 403, erfundener Token 403, missgebildeter 400.

Nicht gefunden wurde bei erstem Inhalt und Moderation etwas — beides trägt.
Markdown überlebt den Editor-Roundtrip ohne Maskierung und ohne Entities, und
das Ausblenden hält seine Zusage wörtlich (`open` → `resolved`/`hidden`, Beitrag
für Gäste weg, Wiederherstellen macht beides rückgängig).

**Gelernt:** (1) **Fast jeder Fund war hinter einem `catch` oder einem
Rückfallwert versteckt.** Die Systeme liefen weiter, nur eben falsch — kein
Alarm, kein rotes Log, nur eine Seite, die etwas nicht tut. Eine Reise findet
solche Fehler, ein Test-Lauf über bestehende Erwartungen nicht. (2) **Der
teuerste Fund war jedes Mal eine Begriffs-Verwechslung zwischen zwei Dingen, die
fast dasselbe bedeuten:** Plan-Schlüssel gegen „zahlt", Kontroll-Host gegen
Mandant, Abschnitt gegen Sammlung, „aktuell gesetzt" gegen „gekauft". Der Code
war nie kaputt, er beantwortete eine leicht andere Frage als die gestellte.
(3) **Ein leeres Ergebnis ist von einem kaputten nicht zu unterscheiden,
solange die Tabelle leer ist** — der SSR-Mandantenfehler (s. D7) wurde erst
sichtbar, als die Demo Termine bekam; Schaufenster zu füllen ist auch eine
Prüfmethode. (4) **Wächter über Quelltext müssen den RUMPF messen, nicht die
Datei** — dreimal an einem Tag mass ein neuer Test den eigenen Kommentar mit und
war rot, obwohl der Fix stimmte. (5) **Adressen nie raten, sondern aus der
Oberfläche lesen**: `/de/preise`, `/discussions/categories`,
`/dashboard/moderation` — dreimal als Fehler gemeldet, dreimal war es die
falsche Adresse und nicht die Seite.

---

### AU2 — die Drossel-Lücken des Audits sind zu ✅ 2026-08-15

`PATCH /api/account/handle` → WRITE_LIMITED 5/min (jeder Versuch zählt —
strikt schärfer als eine FAILURE-Regel, die neben WRITE toter Code wäre:
bei Doppel-Eintrag gewinnt WRITE Bucket und Zählweise). Handle-Suche →
eigener Eimer 120/min statt der vorgeschlagenen 30 (Client entprellt
150 ms, vier Erwähnungen à acht Zeichen sind ~30 Anfragen — 30/min hätte
normales Schreiben abgewürgt; 120 = die gleich teure Themen-Suche).
`POST /api/stats-event` 30/min wie telemetry/error. Reaktions-Toggles in
WRITE_LIMITED, damit Überlimit-Anfragen nicht erst einen Operator-get
kosten. `revokeAccountHandleAudience` räumt per Cursor ALLE Zeilen statt
25 (Cursor statt Offset, weil die Schleife schreibt, während sie liest).
Vier Rückgabe-Typen nachgezogen. Push `d2f9403b`, Deploy grün.

**Gelernt:** Die eigentlich undebouncte Stelle war NICHT der Editor
(längst 150 ms), sondern der Nachrichten-Dialog mit reaktiver
useFetch-Query — wer eine Drossel nachrüstet, muss die AUFRUFER messen,
nicht den prominentesten davon. Und: Rate-Limit-Listen sind
Vorrang-Mengen — eine Route in zwei Listen ist kein doppelter Schutz,
sondern eine tote Zeile.

### AU3 — F57/Auth-Korrektheit: sechs Befunde behoben ✅ 2026-08-15

`resolveTopics` stapelt jetzt zu 100 (Appwrite-Kappung; vorher
degradierten ALLE `#`-Links einer Feed-Seite still zu Rohtext, der catch
schluckte den 400 — jetzt fail-soft MIT logEvent). `reactionsGiven`:
comments zählt `comment_reactions` mit (Variante „wahre Zahl" statt
write-only — write-only hätte die Selbstheilung `counterFellBehind`
genommen und denselben Verlust nur verlangsamt). „Verlinkt von" mit
`localePath`. „Passwort vergessen" trägt das `?redirect=`-Ziel in beide
Richtungen (Test 5→8, Gegenprobe: Link zurückgedreht ⇒ exakt 2 rot).
`MfaChallengeForm` bindet `createMfaChallengeSchema(t)` (Tippfehler
scheitern client-seitig statt gegen den 5/min-Eimer zu zählen).
Migration 034 trägt den `updateTable → permissions: []`-Reparaturschritt
wie 033/035 — **der Prod-Nachlauf steht noch aus** (auf allen 4
Instanzen erneut fahren, damit der Schritt greift). Push `77626f85`,
Deploy grün.

**Gelernt:** Ein fail-soft-`catch` ohne Log ist ein Beweis-Vernichter —
der 400 der Appwrite-Kappung war live nie sichtbar, weil genau die
Stelle ihn schluckte, die ihn hätte melden müssen. Fail-soft heißt
„Antwort degradiert", nie „Fehler verschwindet".

### AU1 — Einladungs-Pfad gehärtet (vier Punkte) ✅ 2026-08-15

Die vier Befunde aus [AUDIT-2026-08-15.md](archiv/audits/AUDIT-2026-08-15.md)
Schnitt B, alle im seit F57 viewer-offenen Einladungs-Pfad.

**1 · Das `already_member`-Orakel ist zu — „ununterscheidbar antworten"**
(Davids Entscheidung 2026-08-15). Seit F57 darf jedes Mitglied einladen, und
`already_member` kostete nichts: kein Zähler, keine Mail, keine Zeile. Damit
war die Route ein beliebig oft benutzbarer Test „gehört diese Adresse hierher?"
für Adressen, deren Mitgliederliste der Fragende nicht lesen darf. Jetzt
entscheidet eine PURE Regel (`decideInviteDelivery` in
`packages/control/shared/communityTeam.ts`), was mit einer Entscheidung
geschieht: **senden · stillschweigen · ablehnen**. Wer `team.manage` hält,
bekommt weiter den ehrlichen 409 (er sieht dieselbe Person zwei Zeilen weiter
in seiner Liste); alle anderen bekommen die Erfolgs-Antwort.

**Der Preis ist die eigentliche Sicherung, nicht die Antwort.** Die stille
Einladung legt eine ECHTE `community_invites`-Zeile an — sofort mit `status:
'revoked'` und einem Token, das nie verschickt wurde. Sie zählt damit gegen das
Wochen-Kontingent (`countCommunityInvitesBy` filtert bewusst nicht nach Status),
ist aber überall tot, wo eine Einladung lebt: die Listen der offenen
Einladungen, `preview` und `accept` verlangen alle `pending`. Kein neuer
ENUM-Wert, weil `status` eine Enum-Spalte ist — ein vierter Wert wäre eine
Migration, die vor dem Code-Deploy laufen MUSS, sonst wäre ausgerechnet der
Missbrauchs-Pfad 400.

**Das Orakel wandert auch keine Ebene höher.** Das Control Plane meldet der
Runtime mit einem `delivered`-Feld, ob wirklich etwas rausging (daran hängt nur
die Glocken-Benachrichtigung — eine Meldung „Einladung zu X" an jemanden, der
in X längst Mitglied ist, wäre fünfmal die Woche ein Belästigungs-Werkzeug).
Die Naht schneidet das Feld ab, und der Rückgabetyp `CommunityInviteResponse`
(`packages/onboarding/shared/communityInvite.ts`) kennt es nicht: wer es
durchreichen will, muss zuerst den Typ ändern. Geprüft wurde ausserdem, was ein
Nicht-Team-Einlader sonst noch sehen kann — `/api/community/members` und
`/api/community/invites/[id]` sind `team.manage`, der Export ist
`community.export`, `invites/mine` geht über die eigene geprüfte Adresse, und
die neue `invites/preview` aus `ec79a04a` verlangt einen Token, den nur die Mail
trägt. Bleibt die Kontingent-Route, und die zählt beide Wege gleich.

**2 · `invitedByName` an der SENKE geklemmt.** `oneMailLine()`
(`packages/control/shared/mailText.ts`, pur + unit-getestet) macht aus allen
Steuer- und Formatzeichen Leerzeichen und kürzt — 80 Zeichen für den
Anzeigenamen, 120 für den Community-Namen, der auch im BETREFF steht (dort wäre
ein CR/LF eine Header-Injektion). An der Senke, nicht nur im Profil-Schema: ein
strengeres Schema hilft erst ab seinem Einführungstag, die Bestands-Namen
bleiben.

**3 · Unbestätigte Adresse lädt nicht ein.** `identity.emailVerified` lag im
Control Plane seit control-019 auf dem Tisch und wurde nie gelesen. Jetzt ist es
eine Zutat von `decideMemberInvite` — 403 `email_unverified`, Reihenfolge
Schalter → Adresse → Rolle → Menge. Owner/Admin bleiben unberührt (dieselbe
Regel wie beim Kontingent: hinzufügen, nicht beschneiden). Die Kontingent-Ansicht
trägt jetzt einen `reason` mit, damit unter dem fehlenden Knopf der wahre Satz
steht statt „ist hier ausgeschaltet".

**4 · Quota-Route entschlackt + gedrosselt.** `requireCommunityTeamRole()` neben
`requireCommunityTeamContext()`: gleiche vier Prüfungen, ohne das Nachladen
ALLER Mitgliedschaften. Zwei Funktionen statt eines Flags, weil ein leeres
`members`-Array die gefährlichste Antwort wäre, die es hier gibt
(`countActiveOwners` läse „kein Owner mehr"). `GET /api/community/invites/quota`
steht jetzt in `WRITE_LIMITED` — eigener Bucket `community:invite-quota` mit
`TOKEN_MAX`, nicht der der `onboarding:communities`-Geschwister: die Seite holt
das Kontingent beim Aufbau UND nach jeder abgelehnten Einladung, und wer sich
dabei den Community-Wechsler leerräumte, verlöre eine fremde Funktion.

Nebenbei repariert: die Einladungs-Antwort trug ein Vier-Felder-Kontingent ohne
`enabled`, und die Oberfläche schreibt sie direkt in ihren Zustand fort — nach
jeder Einladung war der Einladen-Knopf bis zum nächsten Seitenaufbau weg. Jetzt
rechnet auch sie mit `memberInviteQuota`.

**Beweise:** `packages/onboarding/scripts/verify-member-invites.mjs` **61/61**
live (zwei neue Abschnitte 9+10, gegen eigene Worktree-Server auf 3014/3016 mit
echter Service-Naht), `pnpm -r test` grün inkl. neuer Fälle in
`communityTeam.test.ts` (Ununterscheidbarkeit Feld für Feld + „ein
durchscheinender Unterschied fiele auf"), `communityInviteQuota.test.ts` und
`mailText.test.ts`. Alle sieben Gates grün.

**Gelernt:** Eine ununterscheidbare Antwort ist nur die halbe Sicherung — was
ein Orakel schliesst, ist der PREIS. Der erste Entwurf gab bloss eine
Erfolgs-Antwort zurück, ohne Zeile und ohne Zähler; damit wäre die Frage
gratis wiederholbar gewesen und das Orakel nur langsamer, nicht zu. Deshalb
entsteht die Zeile auf beiden Wegen. Zweite Lehre, an derselben Stelle: die
Ununterscheidbarkeit muss man bis zum BROWSER verfolgen, nicht bis zur ersten
Route — das interne `delivered` hätte das Orakel eine Ebene höher wieder
aufgemacht, und der Beweis prüft deshalb ausdrücklich, dass das Feld in der
Antwort nicht mehr vorkommt. Dritte: ein neuer Drossel-Eintrag kann einen
BEWEIS umbringen — `waitForMembership` pollt genau die Route, die AU1 gedeckelt
hat, 45-mal im Sekundentakt; ohne frische IP je Poll hätte der Beweis seine
eigene Drossel gemessen und „die Rolle kommt nicht an" gemeldet.

### Medien im Community-Export + drei Audit-Nachfragen entschieden ✅ 2026-08-16

Davids drei Audit-Nachfragen (Runde 5/6) beantwortet (DECISION-LOG). Zwei
„so lassen" (messages Block per userId — inhaltlich begründet; admin→comments-
Drift — kein Isolationsrisiko), eine gebaut: **`packages/media` bekommt einen
Community-Export-Contributor** (Vertrag A14, Muster events/courses) — Titel/
Untertitel/Alt-Text/`fileId`-Verweis/Layout/Reihenfolge der Galerie, aber
NICHT die Bilddateien (JSON soll Inhalt tragen, nicht Megabytes; die Datei holt
man über die `fileId`). Betreiber-Klinke wie bei events, damit unveröffentlichte
Medien nicht lautlos aus dem Bündel des Owners fallen; kein per-User-GDPR-Thema
(`media_items` trägt keine `userId`). Damit ist die U20-Export-Lücke, die
Runde 5 fand, geschlossen — die Galerie war das einzige Produkt, das im Export
fehlte.

### Audit-Runde 6 — die letzten Layer (admin/moderation/themes/feedback/domains): Produkt vollständig geauditet ✅ 2026-08-16

Zwei read-only audit-worker über die restlichen sicherheitsrelevanten Layer —
**damit ist das gesamte Produkt einmal systematisch durchgeaudited** (AU1–3 am
2026-08-15, Runde 5 + 6 am 2026-08-16). Ergebnis dieser Runde: **keine zu
behebenden Defekte**. Details + PASS-Listen: [AUDIT-2026-08-16.md](archiv/audits/AUDIT-2026-08-16.md)
Schnitte D+E.

Die höchste Rechte-Fläche (Betreiber-Konsole) ist sauber: alle 40 admin-Routen
gegatet, `requirePermission` server-seitig label-only (kein Site-Owner erreicht
eine admin-Daten-API — selbst verifiziert), Rollen-Route ohne
Privilege-Escalation (`actorCaps ⊇ role.caps`, nur admin/moderator zuweisbar,
kein Selbst-Entzug, `assertNotLastAdmin` — selbst verifiziert), kein
Secret-/Config-Leak, Moderation mandanten-isoliert über die Operator-Tür. Die
am meisten verdächtigte Fläche — die injizierten, unlayered Theme-Styles — ist
**fail-closed am Render-Punkt** (Hex-only-Farben, Allowlists für
Font-Name/Id/Varianten/attr, ein `</style><script>` ergibt `return ''`).
feedback/domains sind dünne, korrekt gegatete Control-Plane-Proxys.

Zwei Nicht-Defekte notiert (keine Fixe): eine harmlose admin-Middleware-
Asymmetrie (leerer Operator-Screen für Site-Rollen, Server 403) und die bekannte
admin→comments-String-Drift (mandanten-gescopt, wartet auf einen A14-Vertrag).

**Gelernt:** Ein vollständiger Audit-Bogen lohnt sich gerade an den Layern, die
man für „offensichtlich sicher" hält — die Betreiber-Konsole und die
Theme-Injektion waren die gruseligsten Verdachtsflächen und beide vorbildlich
fail-closed; der Beleg dafür ist so wertvoll wie ein Fund. Die substanziellen
Fixe kamen aus AU1–3 und Runde 5; die zuletzt geprüften Layer waren schon rund.

### Audit-Runde 5 — die ungeprüften Layer (billing/messages/events/courses/media/pages/tickets/analytics) ✅ 2026-08-16

Der Audit vom 2026-08-15 (AU1–AU3) deckte nur posts/comments/onboarding/
control/system/core ab. Runde 5 (drei read-only audit-worker) fuhr die
sensibelsten Rest-Layer. **Ergebnis: die Fläche ist sehr solide** — keine
Vertraulichkeits- oder Geld-Korrektheits-Lücke. Insbesondere PASS:
Privatnachrichten (Nicht-Teilnehmer sperren vor jedem `get`, Blockieren
fail-closed + bidirektional, PN im GDPR-Export/Löschung, Moderation sieht nur
den gemeldeten Ausschnitt), Stripe-Webhook (Signatur/Idempotenz/transiente-
Fehler-werfen, M13/F49-Sperrlogik, Keys AES-verschlüsselt), Datentür + actor
in events/courses/media, Upload-Härtung (Magic-Bytes/Größe/fileSecurity),
Event-Ticket-Kapazität (atomarer increment, overbook-safe), pages-CMS
(kein Draft-Leak, Slug tenant-relativ), analytics (kein Cross-Tenant, keine
PII/Keys).

**Zwei verifizierte Befunde behoben** (beide etablierte Klassen): (1)
**Drossel-Lücken** — RSVP, Event-Score, Event-Cover, Kurs-Einschreibung,
Lektions-Abschluss, `billing/checkout`+`portal`, `tickets/files` standen als
einzige ihrer Art NICHT in `WRITE_LIMITED` (AU2-Klasse). Nachgetragen mit
passenden Deckeln (Content 60/min, Uploads 30/min wie media, checkout eng bei
10 weil es zwei Stripe-Objekte je Ruf anlegt — besonders relevant, sobald A2
live ist). Der Routen-Test `rateLimitRoutes.test.ts` nagelt sie fest (5→8
Fälle). (2) **courses GDPR-Delete verschluckte List-Fehler** — `.catch(() =>
[])` auf lesson_progress/enrollments/authored ließ bei transientem Fehler 0
löschen, und `deleteUserCompletely` (gated auf Voll-Erfolg) lief danach in
`users.delete` → verwaiste Verhaltens-Zeilen eines gelöschten Kontos. Strikt
gemacht (Muster events); die wirkungslose Swallow im Export-Pfad gleich mit.

**Ein Fehlalarm entschärft:** courses gibt veröffentlichten Kursen
`read(Role.users())` statt `read(label:<communityId>)` wie events/media (C18).
Verifiziert: es gibt KEINE Realtime/Direktzugriffe auf Kurs-Rows — sie laufen
immer durch die tür-gescopte list/get, die den Mandanten belegt. Das
`read(users)` ist nur ein Publikums-Gate (eingeloggt vs. Gast), bewusst
dokumentiert (Katalog soll VOR Beitritt sichtbar sein). Kein Leck, kein Fix.

**Gelernt:** Ein Audit unmittelbar VOR dem Geld-Go-Live (A2) zahlt sich am
billing-Layer aus — die checkout-Drossel-Lücke wäre erst mit echtem Geld
schmerzhaft geworden (unbegrenzte Stripe-Customer-Rows). Und: die
Verifikation hat wieder einen Agenten-Befund als Fehlalarm entlarvt
(courses read(users)) — ohne die Frage „gibt es überhaupt einen
Zugriffspfad, der die Tür umgeht?" hätte ein „Fix" den dokumentierten
Katalog-Vor-Beitritt-Sinn zerstört.

### AU4 — Schema-Paritäts-Wächter prüft jetzt Soll pro Instanz über alle Layer ✅ 2026-08-16

`scripts/ops/verify-schema-parity.mjs` prüfte bisher NUR `system`-Tabellen
und nur die VEREINIGUNG der Instanzen — eine überall (oder auf der einen
Instanz, wo sie hingehört) fehlende Tabelle fiel damit nie auf (so blieb die
`changelog`-Lücke auf control monatelang unbemerkt). Jetzt: **kuratiertes
Soll pro Instanz**, aus benannten Layer-Blöcken zusammengesetzt (ADMIN_TABLES,
PAGES_TABLES, POSTS_TABLES, …; neue Tabelle ⇒ EINMAL im Block eintragen, gilt
dann überall, wo der Layer läuft). Drei Prüfungen: **Präsenz (fatal)** — jede
Soll-Tabelle muss da sein (der AU4-Kern, fängt die changelog-Klasse);
**Spalten-Parität (fatal)** über die gleichlaufenden Tabellen; **Drift
(Warnung)** — jede Ist-Tabelle ausserhalb des Soll. Live: account/control
sauber grün, portfolio grün auf allen 39 Soll-Tabellen + genau die sechs
Alt-Warnungen. **Gegenprobe** (Bogus-Tabelle ins Soll injiziert): `TABELLE
FEHLT` → exit 1. Dazu `scripts/ops/cleanup-portfolio-legacy-tables.mjs`
(`pnpm ops:cleanup-portfolio-legacy`, Trockenlauf-Default, löscht defensiv nur
bei 0 Zeilen) für portfolios sechs tote Alt-Tabellen (`sites`,
`feature_catalog`, `workspaces`, `workspace_invites`, `workspace_members`,
`feedback` — leer + code-unreferenziert; das Löschen selbst löst David aus,
weil der Harness destruktive Prod-Eingriffe sperrt). CLAUDE.md-E5-Absatz
nachgezogen.

**Gelernt:** Die wörtliche Vorgabe „Spalten-Parität über JEDE geteilte Tabelle"
lieferte live 29 SCHEINBEFUNDE — portfolios Single-Tenant-Legacy trägt die
Pool-Spalten (`communityId`) bewusst nicht, und control-native Tabellen
(`communities` & Co.) leben laut Migration control-037 NUR im Control-Plane-
Projekt, auf dem Pool nur als eingefrorener Alt-Schatten (dem genau
`memberInvitesEnabled` fehlt). Deshalb prüft die Spalten-Parität eng nur die
gleichlaufenden Tabellen (system+admin+pages+analytics), während die
PRÄSENZ-Prüfung — der eigentliche Fix — ALLE Soll-Tabellen abdeckt. Zweite
Lehre: ein Wächter, der wegen Architektur-bedingter Unterschiede dauernd rot
ist, wird weggelesen; die Drift-Meldung ist deshalb bewusst NICHT fatal.
Nebenbefund für später: schriebe `account` je wieder Communities in sein
eigenes Projekt, wäre das fehlende `communities.memberInvitesEnabled` ein
echtes Risiko (control-037 warnt) — heute reiner Alt-Schatten, daher offen
gelassen.

### F47 zu + Changelog eingefügt — und ein still leerer Betreiber-Changelog gefunden ✅ 2026-08-15

Davids Dreierpaket abgearbeitet: (1) **Plausible** — die sieben
Trichter-Goals wörtlich in der Sammel-Site `communities.pukalani.app`
angelegt (`funnel_cta_start/_cta_plan/_register_done/_gate_no_code/
_code_redeemed/_site_created/_request_submitted`), wöchentlicher
E-Mail-Report auf ALLEN fünf Sites aktiviert (pukalani.app · comments ·
communities · freelancer · portfolio; Plausible setzt Davids eigene
Adresse automatisch als Empfänger). Damit ist **F47 zu**. (2) Die sechs
kuratierten **Changelog-Einträge** aus dem Übergabezettel als ENTWÜRFE
(`published:false`) angelegt — David prüft + veröffentlicht in der UI,
Zettel gelöscht. (3) Die überholte F57-Doku-Session als erledigt
gemeldet (Nachbarsitzung hatte 53717e12 schon gepusht).

**Der Fund dabei:** Der Betreiber-Changelog auf admin.pukalani.app war
seit dem control-Cutover **still leer** — die `changelog`-Tabelle wurde
nie ins `control`-Projekt migriert (nur die Migrationen admin-001…003
gegen control fehlten). `changelog.get.ts` fängt jeden Fehler ab und
liefert `{total:0,entries:[]}`, also sah alles gesund aus (HTTP 200,
leere Liste) — genau die Fail-soft-Klasse, die ein fehlendes Fundament
unsichtbar macht. Die einzige `changelog`-Tabelle stand im `account`-
Projekt (Waise aus der Zeit VOR F3, als comments eine eigene Instanz
war; wird von keinem Live-Host mehr gelesen). Behoben: admin-001/002/003
gegen control gefahren (idempotent, je mit Projekt-Kontrolle), dann die
sechs Entwürfe dorthin — die öffentliche API liefert weiter leer, weil
sie `published:false` sind (korrekt). Der `account`-Waise blieb
unangetastet (Löschen wäre destruktiv, gelesen wird er nirgends).

**Gelernt:** Ein `try/catch`, der bei JEDEM Fehler eine leere Liste
zurückgibt, verwandelt „Tabelle fehlt" in „es gibt eben nichts Neues" —
ununterscheidbar von der Wahrheit. Fail-soft am Leseweg braucht einen
Wächter am Fundament (die Tabelle hätte in der Schema-Parität auffallen
müssen, aber `ops:schema-parity` deckt nur `system`-Tabellen, nicht die
des admin-Layers). Zweite Lehre: Wo eine Tabelle „nur einmal" existiert,
lohnt VOR dem Schreiben die Frage, ob der LESER auch dorthin zeigt — die
account-Waise hätte den Schreibvorgang klaglos geschluckt, sichtbar
geworden wäre nichts.

### Autonome Runde 4 — frisches Audit über den Post-Wellen-Stand ✅ 2026-08-15

Drei read-only Audit-Agenten über die Wellen-Schnitte (posts+comments /
onboarding+control+system / core), weil die Audits vom 2026-08-09 VOR
der gesamten Welle lagen. Ergebnis: [AUDIT-2026-08-15.md](archiv/audits/AUDIT-2026-08-15.md)
mit ~20 Befunden (kein Blocker; 8× Mittel, Rest Niedrig) → drei
gebündelte Zeilen AU1–AU3 in OPEN-ITEMS. Die Top-Befunde: das
`already_member`-Orakel im seit F57 viewer-offenen Einladungs-Pfad,
Zeilen-Injektion über `invitedByName` in die Einladungs-Mail,
ungedrosseltes globales Namens-Orakel auf `PATCH /api/account/handle`,
`resolveTopics` ohne Chunking (ab 100 Ids degradieren ALLE `#`-Links
einer Feed-Seite still), der `reactionsGiven`-Zähler-Rücksetzer und das
verlorene `?redirect=`-Ziel über „Passwort vergessen". Die drei
wichtigsten Behauptungen im Hauptloop nachverifiziert; die PASS-Listen
(Datentür, M13/A5, least-privilege, Export-PII, MFA-Härtung,
Open-Redirect-Schutz) stehen mit im Archiv-Dokument. Nebenbei: die
CLAUDE.md-Zeile „Handle-Gegenprobe steht aus" war seit Commit
`3d074289` überholt — nachgezogen.

**Gelernt:** Ein Audit unmittelbar NACH einer Feature-Welle findet eine
eigene Fehlerklasse: Invarianten, die eine ÄLTERE Annahme kodierten und
von der Welle still entwertet wurden — das Mitgliedschafts-Orakel
entstand nicht durch neuen Code, sondern dadurch, dass F57 die
Einladen-Capability von team.manage auf members.invite weitete und die
bestehende 409-Antwort damit ein neues Publikum bekam. Wer eine
Capability weitet, muss die FEHLERPFADE der Route mit dem neuen
Publikum lesen, nicht nur den Erfolgsfall.

### Autonome Runde 3 — F7-Konzept „Paid Communities" steht ✅ 2026-08-15

`docs/plans/F7-PAID-COMMUNITIES-KONZEPT.md` (990 Zeilen): Marktbild
(Skool ist BELEGT Merchant of Record — direkte Spannung zu Davids
D1-Entscheidung), Empfehlung (Owner verkauft: Stripe Connect, volles
Dashboard, direct charges, `application_fee_percent`), ein eigener
Umsatzsteuer-Abschnitt (Art. 9a DVO 282/2011 + EuGH C-695/20 „Fenix":
läuft der Checkout bei uns, sind wir sehr wahrscheinlich in JEDER
Variante USt.-Schuldner — die Steuer unterscheidet die Optionen nicht
mehr, OSS-Registrierung ist eingeplante Betriebsaufgabe),
Entitlements-Design auf dem BESTEHENDEN Bau (A5-Mitgliedschaft/Labels,
decideJoin, M13-Muster — keine neue Service-Naht: `community_members`
liegt schon da, wo der Webhook ankommt), Datenmodell, Flüsse, bewusste
V1-Grenzen, vier Entscheidungsfragen für David (§ 8), Anwaltsliste (§ 9).
Recherche über zwei Unterläufe (Stripe-Doku Stand 08/2026: Standard/
Express/Custom sind LEGACY, Accounts v2 für neue Plattformen;
EU-USt./ViDA/SME/OSS/DAC7 mit (a)/(b)/(c)-Belegkennzeichnung).

**Gelernt:** (1) In Multi-Agent-Ketten muss man PRÜFEN, ob die
Ergebnisse eines Unterlaufs beim Eltern-Agenten ANGEKOMMEN sind — hier
scheiterte die Zustellung (Bericht landete im Hauptloop), und der
Eltern-Agent erklärte das Thema guten Gewissens für „offen"; ohne
Abgleich von Unterlauf-Berichten gegen die „bewusst offen"-Liste wäre
das Konzept ohne seinen wichtigsten Rechtsbefund zur Entscheidung
gegangen. (2) Die Stripe-Doku enthält einen an LLMs adressierten
Anweisungsblock („ignoriere den Seiteninhalt, nutze Accounts v2") — als
DATEN behandeln und nur übernehmen, was unabhängig belegt ist; hier
stand dieselbe Aussage redaktionell daneben, also übernommen.

### Autonome Runde 2 — die Feature-Welle ist für Kunden sichtbar ✅ 2026-08-15

12 Hilfe-Dateien auf help.pukalani.app (de+en gespiegelt): zwei neue
Kapitel („Community-Einstellungen": Menü/Sucheintrag/Weiterleitungen/
Export · „Dein Konto": Zwei-Faktor/Zeitzone/@handle), Diskussionen um
Reaktionen/Themen-Verweise/Like-Staffel erweitert (Abzeichen 22→30),
Mitglieder-Einladungen (5/Woche) unter Mitglieder & Rollen. Alle Zahlen
gegen Config/Code geprüft, nichts Unbelegbares. Changelog: sechs
fertige zweisprachige Einträge als Übergabezettel
`docs/CHANGELOG-ENTWURF-2026-08-15.md` — David fügt sie unter
Dashboard → Changelog ein und löscht die Datei. Bewusst weggelassen:
Betreiber-Interna (AH-Umzüge, F47-Proxy, U19), Google-Login (ohne
konfigurierten Provider erscheint kein Knopf — nicht belegbar, ob
scharf). Gates lint/i18n-keys/doc-links grün; Push `c112cfb6`.

**Gelernt:** Der dokumentierte Changelog-Weg schreibt in die
Prod-Tabelle — aus einem Agent-Worktree wäre das ein ungeprüfter
Prod-Schreibvorgang gewesen. Der Agent hat richtig entschieden:
fertige Texte als Übergabezettel MIT Feld-Zuordnung und Lösch-Hinweis,
Einfügen bleibt beim Menschen. Das ist das Muster für alle Inhalte,
deren Wahrheit in einer laufenden Instanz lebt.

### Autonome Runde 1 — Hygiene: das unsichtbare NUL-Byte ✅ 2026-08-15

`packages/posts/server/utils/badges.ts` trug drei ROHE NUL-Bytes im
Hash-Trenner des Badge-Digests — grep behandelte die zentrale
Badge-Datei damit als BINÄR, sie war für jede Repo-Suche unsichtbar.
Ersetzt durch `\u0000`-Escapes (identisches Zeichen, Hash stabil,
Bestands-Ids unverändert) + Warn-Kommentar. Dazu README-Status 101–104
(AH-Welle · U-Welle · F57 · TS2589) nachgetragen; GOALS.md brauchte
nichts (die Welle lief nicht über den Goal-Runner). Der geplante
Archiv-Umzug des Discussions-Konzepts war beim `git fetch` schon von
der Nachbarsitzung erledigt (`53717e12`, inkl. der drei fehlenden
F57-Archiv-Einträge) — eigene Version verworfen, Regel befolgt.
Sieben Gates grün, Push `f1d62f48`.

**Gelernt:** (1) `\u0000` in einem Edit-Werkzeug-Aufruf wird beim
JSON-Dekodieren zum ROHEN NUL — der Fix hat seinen eigenen Fehler in
der README reproduziert; NUL-Arbeit immer per Python-Byte-Ersetzung,
danach Byte-Gegenprobe auf JEDER angefassten Datei. (2) Wenn eine
fremde Sitzung im eigenen Worktree arbeitet (hier: Branch
zurückgesetzt, uncommittete Auth-Änderungen), gilt die
Nicht-anfassen-Regel auch dort — der eigene, bereits committete Stand
lässt sich per `git push origin <sha>:main` verschiffen, ohne Branch
oder Working Tree zu berühren.

### D7 — die Demo-Community war halb leer, und das Füllen legte einen Fehler frei ✅ 2026-08-15

`demo.pukalani.app` ist von der Startseite verlinkt und das Erste, was ein
Interessent vom Produkt sieht. Der Feed war gefüllt, **Diskussionen und Events
aber leer** — genau die zwei Produkte, mit denen die Marketing-Seite am
stärksten wirbt. Gefunden beim Durchspielen der Kundenreise.

Eingespielt über zwei idempotente Seeds im Repo
(`packages/posts/scripts/seed-demo-discussions.mjs`,
`packages/events/scripts/seed-demo-events.mjs`, getrennt nach Layer wegen A14):
4 Kategorien, 9 zweisprachige Themen von sieben Autoren über fünf Wochen
gestaffelt, 15 Antworten (4 verschachtelt), 3 Termine mit 11 echten
RSVP-Zeilen. Alle drei Zustände sind vertreten (angeheftet, geschlossen,
gelöst). Beide Skripte verlangen `--community` UND `--public` als
ausdrückliche Angaben: der Mandanten-Stempel ist auf einer Pool-Instanz nicht
zu sehen, wenn er fehlt, und `communities.audience` steht im
Control-Plane-Projekt, zu dem ein Pool-Schlüssel keinen Zugang hat — geraten
würde dort im schlimmsten Fall eine geschlossene Community öffentlich.

**Der eigentliche Ertrag war ein Produktfehler** (Commit `8cdc0fa3`): Nach dem
Einspielen sagte die Events-Seite weiterhin „Aktuell sind keine Events
geplant", während der Kalender darunter denselben Termin zeigte. Im Pool
entscheidet der HOST über die Community, und ein blankes `$fetch('/api/…')`
trägt ihn im SSR nicht mit — die Route antwortete `404 Unknown host`,
`useAsyncData` merkte sich den Fehlschlag, der Browser heilte ihn nicht mehr.
Der Kalender lief nur, weil er clientseitig lädt. Betroffen waren **vier**
Stellen (EventList, Community-Karte im Dashboard, zwei Seiten-Editoren); die
letzten zwei fand erst der neue Wächter `packages/core/tests/ssrTenantFetch.test.ts`,
der alle mandantenfähigen Layer absucht und beidseitig bewiesen ist.

**Gelernt:** (1) **Ein leeres Ergebnis ist von einem kaputten nicht zu
unterscheiden, solange die Tabelle leer ist.** Der SSR-Fehler bestand
vermutlich seit dem Bau des Events-Produkts und war unsichtbar, weil nirgends
Termine lagen — Schaufenster zu füllen ist deshalb auch eine Prüfmethode, nicht
nur Kosmetik. (2) **`listColumns` ohne `Query.limit()` liefert 25 Spalten.**
Ich hielt die `events`-Tabelle daraufhin für unvollständig migriert und war
nahe an einer unnötigen Produktions-Migration; eine Probe-Zeile (anlegen,
sofort löschen) hat es geklärt, bevor etwas passierte. Die
CLAUDE.md-Regel „immer explizites `Query.limit()`" gilt auch für die
Metadaten-Abfragen, nicht nur für Datenzeilen. (3) **Eine Handsuche nach einem
Muster findet die mehrzeiligen Fälle nicht** — meine Grep-Suche fand zwei von
vier Stellen, der Wächter alle. (4) **Appwrite übernimmt ein mitgegebenes
`$createdAt`.** Ohne das trugen alle 15 Antworten die Sekunde des Seed-Laufs,
unter Themen von „vor drei Wochen"; die Zeilen mussten gelöscht und datiert neu
geschrieben werden. Der Bestands-Seed der Demo hat denselben Makel, er ist dort
nur schon eingealtert.

---

### TS2589-Strukturfix — Nitros Routen-Typkarte ist aus ✅ 2026-08-14

Zwei Pakete hintereinander waren an `TS2589` gestorben oder hatten drumherum
gebaut. Der Auftrag sagte „explizite Handler-Annotationen"; der Agent hat
GEMESSEN statt geglaubt (`vue-tsc --extendedDiagnostics`): Annotationen
ändern **1 %** — der Täter ist die generierte Routen-Typkarte, die jeder
`$fetch` an jeder Aufrufstelle gegen ALLE ~210 Routen auflöst
(Aufrufstellen × Routen = 92 % aller Instanziierungen). Fix: die Karte wird
im `types:extend`-Hook geleert (`packages/core/build/nitroRouteTypes.ts`,
offizieller Hook, kein Datei-Patchen) — **7.505.010 → 617.983
Instanziierungen (−91,8 %), Typecheck 10,7 s → 5,4 s**; 100 Proberouten
kosten +142 Instanziierungen, wo vorher 12 den Build brachen. Preis (Davids
Ratifizierung): `$fetch` ohne Typ-Parameter ist `unknown` — Umstellung
kostete 6 Stellen in 2 Dateien, weil 98 % der Aufrufe ihren Typ längst
nennen; ESLint erzwingt Typen für GEBUNDENE Aufrufe in `app/**` (111
Feuer-und-vergiss-POSTs bleiben bewusst frei), alle fünf `, string`-Tricks
sind entfernt (Grep 0), Verhalten per Konstruktion nullsummig (kein Test
angefasst, E2E 24/24). Wächter: Verhaltens-Unit-Test mit Gegenprobe.

**Gelernt:** (1) Ein vorgeschriebener Fix-Weg verdient dieselbe Messung wie
das Problem — die naheliegende Erklärung („tiefe Rückgabetypen") war um zwei
Größenordnungen daneben, und 268 Handler zu annotieren wäre fleißige
Wirkungslosigkeit gewesen. (2) Flat-ESLint-Configs ERSETZEN
no-restricted-syntax je Scope: eine neue Regel auf `packages/*/server/**`
hätte still den tablesDB-Datentür-Backstop abgeschaltet — jede neue Regel im
selben Scope braucht die Gegenprobe, dass die alten noch feuern. (3) Ein
Kommentar, der `**/` enthält, beendet seinen eigenen Blockkommentar.

### F57 — die vier sozialen Mechaniken sind KOMPLETT ✅ 2026-08-14

**Der Schlussstein: Emoji-Reaktionen auch auf ANTWORTEN** (Davids
Entscheidung 2026-08-13 „Ja, nachbauen" — die eine Frage, wegen der das
Discussions-Konzept noch in `plans/` lag). Damit ist F57 zu.

**Wie die Antwort-Ebene gebaut ist — der zweite von zwei Wegen.** Das Konzept
hatte sie als „additiv ohne Migration" in Aussicht gestellt (die vorsorgliche
`targetType`-Spalte aus posts-017). Dieser Weg fällt aus: `discussion_reactions`
gehört posts, und `comments` steht in jedem `extends` DAVOR — eine
comments-Route auf diese Tabelle wäre die A14-Umkehr, und zwar die schlimmste
Sorte, weil sie über einen blossen Tabellen-NAMEN läuft und nirgends rot wird.
Gebaut ist deshalb der zweite Weg, den das Konzept selbst nennt: ein eigenes
Datenmodell nach dem Muster der STIMMEN (`comment_reactions`, comments-019 —
so wie `comment_votes` neben `post_votes` steht). Geteilt wird stattdessen die
REGEL: der 8er-Satz, `allowedReactions`, `aggregateReactions` und
`toggledChips` sind nach `core/shared/reactions.ts` gezogen, die Chip-Leiste
als `CoreReactionBar` dazu. Fundament dürfen beide konsumieren; das
Datenmodell bleibt bei jedem Produkt.

**Gelesen wird ohne eigene Route:** die Chips reisen in `GET /api/comments`
mit, neben `myVotes` und `myReports`. Das ist billiger als eine zweite
gebündelte Abfrage (25 Antworten = 0 statt 1 Anfrage) und löst den
Realtime-Fall von selbst — ein während der Sitzung eintreffender Kommentar HAT
keine Reaktionen. Geschrieben wird durch die Mitglieder-Klinke (M13 + A5),
badge-neutral, in DENSELBEN `reactionsGiven`-Zähler wie die Themen:
`first-reaction` bleibt EIN Abzeichen, egal wo man zuerst reagiert. Interne
Ticket-Diskussionen bleiben draussen (409 `reaction_target_not_public`) —
sonst wäre die Reaktions-Zeile lesbarer als der Kommentar, auf den sie zeigt.
Beweis 35/35, Mechanik-1-Regression 27/27, E2E 24/24, alle sieben Gates.

**Die drei anderen Mechaniken, gebaut am 2026-08-13/14:**
- **Mechanik 1 — Emoji-Reaktionen an Themen** (fester 8er-Satz ohne 👍/❤️,
  posts-017): eigener Eintrag „F57 Mechanik 1" weiter unten in dieser Datei.
- **Mechanik 2 — Einladungen durch Mitglieder** (`promoter`, control-037 +
  posts-018, 40/40): eigener Eintrag „F57 Mechanik 2" oben.
- **Mechanik 3 — Tages-Limit für Likes** und **Mechanik 4 — Themen-Verlinkung
  mit Rückverweis** (`first-link`, posts-019/-020) sowie die **F57-Stufen**
  (Like-Staffel 50/50/75/100 nach Vertrauensstufe, `campaigner`/`champion`
  über `invitedBy`, posts-021, 47/47): eigene Einträge stehen seit dem
  2026-08-15 DIREKT UNTER DIESEM (nachgetragen beim Archivieren des
  Discussions-Konzepts) — bis dahin waren sie nur im DECISION-LOG
  (2026-08-14) und im Baustand des Konzepts dokumentiert, und diese Zeile
  hielt die Lücke fest, damit sie nicht als „nie gebaut" gelesen wird.

**Gelernt:** (1) **Auto-Import ist über Layer hinweg FLACH — und bei einer
Kollision gewinnt lautlos einer.** `comments` und `posts` hatten beide
`loadReactionSummary`/`allowedReactionsFor`/`resolveReactionTarget`; posts
gewann, und die Kommentar-Liste las still die THEMEN-Tabelle mit dem
THEMEN-Emoji-Satz. Sichtbar war das ausschliesslich als
`WARN Duplicated imports` in einem Dev-Log — kein Test, kein Typecheck, kein
Lint sieht es, und die Seite funktioniert. Helfer eines Produkt-Layers
gehören deshalb eindeutig benannt UND explizit importiert; ein Dev-Log beim
ersten Start zu lesen ist billiger als jeder Test, den man dafür schreiben
müsste. (2) **Ein Beweis, der nichts beweist, sieht aus wie ein Teilerfolg.**
Die gesäten Kommentare hatten keine Row-Permissions (`comments` ist
rowSecurity) — die Liste kam leer zurück, und weil „keine Reaktionen" und
„keine Kommentare" beide als leere Map ankommen, waren fünf Prüfungen still
grün; 29/34 sah nach einem echten Befund aus und war ein Messfehler. Jeder
Beweis, der aus einer LISTE liest, braucht zuerst die Zusicherung, DASS die
Liste das Gesuchte enthält. (3) **Eine neue Server-Route kostet inzwischen
Compiler-Budget.** Zwei neue Routen kippten `$fetch` erneut über die
Rekursionsgrenze (TS2589, zweiter Treffer nach commit 4fe38d78) — und diesmal
wären es rund 45 Aufrufstellen gewesen, die man mit `, string` hätte
entschärfen müssen. Der Ausweg war nicht Patchen, sondern EINE Route weniger:
die Leseabfrage an die bestehende Liste zu hängen war ohnehin der bessere
Entwurf. Wenn eine Compiler-Grenze zum Patch-Feldzug einlädt, ist meistens
der Entwurf die günstigere Stellschraube. (4) Der C18-Publikums-Umzug hatte
`discussion_reactions` NIE erfasst, obwohl die Datentür die Zeilen mit
`read: 'public'` anlegt — ein Umschalten auf „nur für Mitglieder" hätte die
Beiträge zugemacht und die Emoji-Zeilen darunter offen gelassen. Beim Bau des
Zwillings aufgefallen und in beiden Layern nachgetragen: wer eine Tabelle mit
Veröffentlichungs-Permission anlegt, meldet sie im selben Commit an.

### F57 Mechanik 3 — Tages-Limit für Likes ✅ 2026-08-14

*(Eintrag am 2026-08-15 nachgetragen — gebaut und deployed am 2026-08-14; der
F57-Sammeleintrag oben hatte die fehlende Archivierung ausdrücklich benannt.
Quelle: DECISION-LOG 2026-08-14 + Baustand in
`docs/archiv/DISCUSSIONS-KONZEPT.md`.)*

**Davids Zuschnitt vom selben Tag: 50 Likes pro Tag je Mensch und Community**
(Discourse-Standard — im Alltag unspürbar, beim Binge-Liken erreicht),
Config-Wert, `0` = aus. Durchgesetzt in BEIDEN Aufstimm-Routen (Themen
`posts/[id]/score`, Antworten `comments/[id]/vote`) VOR dem Schreiben;
abgewiesen wird mit **429** und `reason: like_limit_reached`, die Oberfläche
macht daraus einen eigenen Hinweis statt „Stimme kam nicht an".

**„Tag" ist der UTC-Kalendertag**, ausdrücklich nicht `prefs.timezone` (die es
seit U15 gäbe): ein Limit, das mit der Zonen-Wahl wandert, schenkt beim
Umstellen ein zweites Kontingent am selben Abend — eine Sicherung darf nicht an
einer Einstellung hängen, die der Betroffene selbst dreht. Preis: wer in UTC+13
lebt, bekommt sein Kontingent mittags.

**Die Rücknahme erstattet nichts**, und das ist die tragende Eigenschaft: eine
Stimme lässt sich per Klick zurücknehmen, ein Limit mit Erstattung wäre also
mit zwei Klicks je Like beliebig zu umgehen. Deshalb ist der Stand ein
VERBRAUCH in `member_counters` (posts-019: `likeDay`, `likesToday`,
`likeLimitDays`) und KEIN Zählen der heutigen Vote-Zeilen — die verschwinden
beim Zurücknehmen, das Kontingent käme zurück. Der Tageswechsel ist ein
Vergleich beim nächsten Like, kein nächtlicher Lauf. Downvotes kosten nichts,
der Wechsel von Ab- auf Aufstimme schon — entschieden über dasselbe
`upvoteDelta` wie die Abzeichen-Zähler, damit „was ist ein Like" nur EINE
Antwort hat. Fail-**open** bei Störung: eine irrtümlich verweigerte Stimme
trifft jemanden, der nichts falsch gemacht hat.

**Regeln PURE in `packages/core/shared/likeAllowance.ts`** (dort, weil posts
und comments sie beide brauchen und einander nicht kennen dürfen), Autorität im
posts-Layer über den Core-Vertrag `registerLikeAllowanceAuthority` — ohne
posts-Layer gibt es schlicht kein Limit (erlaubender No-Op).

**Bringt `out-of-love` / `higher-love` / `crazy-in-love`** (1/5/20 Tage mit
erreichtem Limit). Der Tag wird GENAU EINMAL gebucht — am atomaren Hochzählen,
dessen Ergebnis exakt auf dem Limit landet (`crossesLikeLimit`, `=== limit`
statt `>=`); sonst hieße „an 5 Tagen" nur „fünfmal dagegengelaufen". Der Zähler
startet für alle bei 0 und wird nie geeicht: „an diesem Tag war das Kontingent
aufgebraucht" lässt sich aus dem Bestand nicht einmal falsch rekonstruieren.

**Beweis:** `packages/posts/scripts/verify-like-limit.mjs` — 28/28 gegen ein
testweise auf 3 gesenktes Kontingent, 75/75 gegen die echten 50.

**Gelernt:** Die naheliegende Umsetzung — die heutigen Vote-Zeilen zählen —
ist hier FALSCH, und der Grund steht nicht im Datenmodell, sondern im
Bedienweg: die Rücknahme löscht die Zeile. Ein Limit muss als VERBRAUCH
gebucht werden, sobald die begrenzte Handlung rückgängig zu machen ist; sonst
ist es keins.

### F57 Mechanik 4 — Themen-Verlinkung mit Rückverweis ✅ 2026-08-14

*(Eintrag am 2026-08-15 nachgetragen — gebaut und deployed am 2026-08-14 als
das eigene Paket NACH den Mechaniken 2+3, so wie David die Reihenfolge gesetzt
hatte. Quelle: DECISION-LOG 2026-08-14 + Baustand in
`docs/archiv/DISCUSSIONS-KONZEPT.md`.)*

**Im Editor öffnet `#` ein Menü über die Themen der eigenen Community; das
Ziel-Thema zeigt darunter „Verlinkt von …".** Ein Verweis ist **gewöhnlicher
Text** wie `@handle` — der Markdown-Parser (`core/shared/markdown.ts`) bleibt
UNANGETASTET, es gibt keine neue Marke und keine Migration für
Bestandsinhalte.

**Er trägt die Row-Id, nicht den Slug** (`#<id>-<deko>`), und das war keine
Geschmacksfrage: der Themen-Slug ist nirgends gespeichert (er wird je Aufruf
aus Titel und Text abgeleitet), nicht eindeutig und vergeht beim Umbenennen —
`#mein-thema` hätte einen Vollscan über alle Titel je Seitenaufbau gekostet
und wäre trotzdem mehrdeutig geblieben. Dieselbe Arbeitsteilung wie in der
URL: die Id ist die Wahrheit, die Deko steht für Menschen da und wird beim
Auflösen ignoriert. Die Erkennungs-Regel ist FAIL-CLOSED
(`shared/topicLinks.ts`): `#` + 16–36 rein alphanumerische Zeichen + optionale
`-`-Deko, links kein Wortzeichen und kein `#` — damit sind `#42`,
Überschriften, URL-Anker und Code-Spans draußen. Ids MIT Trennzeichen sind
bewusst nicht verlinkbar (sonst zerfiele `#<id>-<deko>` nicht eindeutig);
betroffen ist genau der Willkommens-Beitrag, und der ist nie ein Ziel.

**Der Text ist die Wahrheit, die Tabelle ist der Index:** `discussion_links`
(posts-020, je Paar EINE Zeile) wird NIE gelesen, um einen Beitrag zu rendern
— die Verweise löst der Server beim Lesen aus dem TEXT auf (gebündelt, wie
`mentionsForPosts`); die Tabelle beantwortet allein die Gegenrichtung („wer
zeigt auf mich?"). Beim Bearbeiten wird sie ERSETZT, nicht ergänzt, sonst
bliebe ein entfernter Verweis für immer am Ziel stehen. Sie trägt bewusst
**kein `authorId`** (zwei Row-Ids sind nichts Personenbezogenes ⇒ kein
GDPR-Contributor); der Preis ist ein nie eichbarer Zähler `linksMade` — das
Abzeichen **`first-link`** zählt ab jetzt. Tote Verweise bleiben schlicht Text
und melden nichts.

**Zwei Türen:** die Index-Zeilen laufen über die Operator-Klinke (sie gehören
keinem Menschen), die ZIELE über die Mitglieds-Tür — wer ein Thema nicht sehen
darf, kann weder darauf verweisen noch als Verweis darauf erscheinen.

**Beweis:** `packages/posts/scripts/verify-topic-links.mjs` (42/42).

**Gelernt:** Eine Row OHNE `ownerUserId` bekommt von der Datentür nur
Leserechte — das Entfernen der Index-Zeilen scheiterte im ersten Beweislauf
genau daran, und zwar STILL. Zeilen, die keinem Menschen gehören, brauchen die
Operator-Klinke; und ein Beweis, der auch die RÜCKNAHME einer Wirkung prüft,
findet solche stillen Fehlschläge — einer, der nur das Anlegen prüft, nicht.

### F57-Stufen — Like-Staffel + Campaigner/Champion ✅ 2026-08-14

*(Eintrag am 2026-08-15 nachgetragen — gebaut und deployed am 2026-08-14.
Quelle: DECISION-LOG „F57-Stufen" 2026-08-14 + Baustand in
`docs/archiv/DISCUSSIONS-KONZEPT.md`.)*

**Davids Entscheidungen (bindend):** (1) Das Tages-Like-Limit **staffelt mit
der Vertrauensstufe** — TL0/TL1 = 50, TL2 = 75, TL3+ = 100. (2)
`Campaigner`/`Champion` werden **konzepttreu** gebaut, nach der
Katalog-Definition aus § 3.6 („3 Eingeladene wurden Basic" / „5 wurden
Member"), NICHT als billige Umdeutung auf „3 bzw. 10 angenommene Einladungen"
— das Abzeichen hieße sonst etwas anderes als das Konzept sagt, und niemand
würde je nachlesen, warum.

**Die Staffel ist EINE Liste**
(`pukalani.discussions.likesPerDayByLevel: [50, 50, 75, 100]`, Index = Stufe,
die ernannte Stufe 4 bekommt den letzten Eintrag), gelesen an EINER Stelle
(`likeLimitForLevel` in `core/shared/likeAllowance.ts`). Vier einzelne
Schlüssel wären die Einladung gewesen, einen zu setzen und drei zu vergessen —
der Zustand, in dem eine höhere Stufe stillschweigend weniger darf. Der
frühere Skalar `likesPerDay` ist ERSETZT, nicht ergänzt; aus = `[0,0,0,0]`.
Die Galerie NENNT die Zahl statt „mehr Likes" zu versprechen (`likeLimit` in
der Badges-Antwort, nie im Übersetzungs-Text).

**Campaigner/Champion — der dritte Verleihungs-Pfad.** Das qualifizierende
Ereignis ist der Stufen-Aufstieg eines ANDEREN Menschen, Wochen später, in
einer fremden Zähler-Zeile. Verworfen: beim Aufstieg das Control Plane fragen
(eine Naht über die Projektgrenze, mitten im Schreibpfad, für eine Antwort,
die sich nie ändert) und die Einladungen des Einladenden durchzählen (N+1 über
dieselbe Grenze). Gebaut ist die billigste Wahrheit: **die Annahme hinterlegt
den Einladenden** an der Zähler-Zeile des Eingeladenen
(`member_counters.invitedBy`, posts-021) — ein Schreibvorgang, einmal im Leben
einer Mitgliedschaft, an der Stelle, die `invitedBy` ohnehin zurückbekommt
(sie zählt dort `promoter`). Danach ist der Aufstiegs-Hook
(`inviteesBasic`/`inviteesMember`) reine Runtime-Sache ohne Naht.

**Drei Eigenschaften, die man nicht „vereinfachen" darf:** (a) Gezählt wird
die DIFFERENZ `(vorher, nachher]` der ERARBEITETEN Stufe — je Eingeladenem und
Stufe genau einmal, ohne irgendwo nachzusehen. (b) Die **Ernennung zu Stufe 4
meldet nichts**: der Katalog sagt „wurden Basic/Member", und ein Owner könnte
sonst die Abzeichen Dritter vergeben. (c) `invitedBy` wird nur gesetzt, wenn
es LEER ist — die erste Einladung gewinnt, sonst wäre eine zweite Einladung
ein Weg, eine bestehende Zuordnung umzuschreiben.

**Ehrlicher Preis:** beide Zähler starten für alle bei 0 und werden nie
geeicht (die Zuordnung liegt im Control Plane, die Stufen der Eingeladenen in
deren Zeilen) — wie schon bei „Editor" und „Promoter".

**Beweis:** `packages/posts/scripts/verify-trust-perks.mjs` (47/47, echter
Aufstieg über eine zurückdatierte `community_members`-Zeile), Regressionen
`verify-like-limit.mjs` 28/28 und `verify-member-invites.mjs` 42/42 (+2 neue
Prüfungen auf den Stempel).

**Gelernt:** Die Zusage „der Abzeichen-Tag wird genau EINMAL je Tag gebucht"
hing daran, dass das Limit an einem Tag eine feste Zahl ist — die Staffel
machte sie variabel: wer bei 50 aufräumt, auf TL2 steigt und bei 75 wieder die
Gleichheit trifft, hätte an einem Nachmittag zwei „Tage" für „Out of
Love"/„Higher Love" verbucht. Deshalb merkt sich die Zeile den gebuchten Tag
(`member_counters.likeLimitDay`, posts-021) — die Sicherung gehört in die
Daten, nicht in die Disziplin; eine Änderung, die eine Konstante zur Variablen
macht, muss jede Zusage prüfen, die auf der Konstanz gebaut war.

### F57 Mechanik 2 — Einladungen durch Mitglieder ✅ 2026-08-14

**Der Wachstumshebel aus dem Discussions-Konzept (Teil 4 Punkt 1).** Bis hierher
lud nur das Team ein; jetzt darf **jedes Mitglied ab Rolle Leser/in** Menschen
dazuholen. Davids Zuschnitt vom 2026-08-14: **5 pro Woche je Mitglied**, **je
Community vom Owner abschaltbar**, die Zahl als Config-Wert.

**Die eingeladene Rolle ist IMMER `viewer`** — und zwar in der ROUTE, nicht nur
im Formular. Ohne diese Prüfung wäre `role: 'admin'` im Body eine Rollen-Vergabe
per Mitglieds-Capability gewesen, also dieselbe Klasse Fehler, gegen die
`community.transfer` seinerzeit als eigene Capability geschnitten wurde. Aus
demselben Grund ist die neue Capability `members.invite` NEBEN `team.manage`
entstanden statt durch Absenken von `team.manage`: sie sagt „darf jemanden
herholen", nicht „darf über die Besetzung bestimmen". Der Schalter selbst hängt
weiterhin an `team.manage` — wer einladen darf, darf das Einladen nicht
abschalten.

**Owner und Admins bleiben kontingent- und schalterfrei.** Das war die
Bedingung, unter der die Mechanik gebaut werden durfte: sie fügt ein Recht hinzu
und beschneidet keines. Ein Owner, der seine eigene Community nicht mehr voll
besetzen kann, weil er den Schalter für seine Mitglieder umgelegt hat, wäre ein
Rückschritt gewesen.

**Das Kontingent zählt an den ERZEUGTEN Zeilen**, rollierend über sieben Tage —
kein Kalenderfenster, das um Mitternacht fünf frische Versuche verschenkt.
Verbraucht ist eine Einladung mit dem VERSAND, nicht mit der Annahme: 500 nie
angenommene Einladungen kosteten sonst nichts, und genau die sind der
Missbrauchsfall. Dass eine zweite Einladung an dieselbe Adresse die erste nur
auf `revoked` setzt statt sie zu löschen, ist dabei die tragende Eigenschaft —
wer dort je auf „aufräumen" umstellt, hebt das Kontingent auf, ohne es
anzufassen.

**Die Drossel ist NICHT das Kontingent, und beide werden gebraucht.** Das
Kontingent begrenzt die Menge über die Zeit und liegt hinter Rollen-Prüfung,
JWT-Mint und einer Zähl-Abfrage über die Service-Naht; die neue Drossel
(`community:invite`) begrenzt den Ansturm davor. Ein Deckel, der erst nach der
Arbeit greift, schützt den Server nicht.

**Regeln PURE und unit-getestet** (`packages/control/shared/communityInviteQuota.ts`):
`decideMemberInvite` setzt durch, `memberInviteQuota` zeigt an — und die Anzeige
ruft die Entscheidung SELBST auf. Ein Test hält beide über alle Kombinationen
aneinander, denn ein Knopf, der 403 erntet, ist schlimmer als kein Knopf.

**Abzeichen `promoter`** (erste ANGENOMMENE Einladung, neuer Zähler
`member_counters.invitesAccepted`). Gezählt wird die ANNAHME, nicht der Versand
— ein Abzeichen für verschickte Einladungen wäre eine Auszeichnung für Spam
gewesen und hätte gegen das Kontingent gearbeitet. Gebucht wird in der RUNTIME
(dort liegen die Zähler), das Control Plane reicht dafür `invitedBy` zurück:
dieselbe Arbeitsteilung wie bei `revokeCommunityLabel` (A5) und der
Verzugs-Meldung (C15).

**Campaigner/Champion bleiben BEWUSST offen** (David-Entscheidung nötig): das
Konzept definiert sie über die Vertrauensstufe DER EINGELADENEN („3 wurden
Basic", „5 wurden Member"). Das ist keine Zahl auf der Zeile des Einladenden —
sie entsteht Wochen später in einer fremden `member_counters`-Zeile und fällt
damit aus dem Zähl-Kreuzungs-Weg heraus, den alle Abzeichen dieser Klasse
benutzen. Sie brauchten einen dritten Verleihungs-Pfad (beim Aufstieg des
Eingeladenen, mit Rückverweis auf den Einladenden). Sie stattdessen still mit
„3 bzw. 10 angenommene" zu belegen wäre die billige und die falsche Lösung: das
Abzeichen hieße dann etwas anderes als das Konzept sagt, und niemand würde je
nachlesen, warum.

**Migrationen** (BEIDE vor dem Code-Deploy, `createRow`-Regel): **control-037**
(`communities.memberInvitesEnabled`, fail-open wie `openRegistration`, +
`community_invites.idx_community_inviter`) — nur das Control Plane;
**posts-018** (`member_counters.invitesAccepted`) — jede Instanz mit
posts-Layer. Die neue `communities`-Spalte traf DREI Anlegestellen, nicht zwei:
der Nagel-Test aus F3 hat `scripts/ops/f3-lib/rules.mts` gefunden.

**Beweis:** `packages/onboarding/scripts/verify-member-invites.mjs` **40/40**,
zweimal hintereinander (selbsträumend), gegen platform + control aus demselben
Worktree mit echter Service-Naht und echtem Mailversand über Mailpit.

**Gelernt:** (1) **Zwei 429 sind eines zu viel.** Drossel und Kontingent
antworten beide 429, die Drossel läuft als Middleware zuerst — mit einer
gemeinsamen Client-IP wäre die 6. Einladung am Rate-Limit gestorben und die
Kontingent-Prüfung nie erreicht worden. Der Test wäre GRÜN gewesen, ohne die
Mechanik zu berühren. Jeder Versuch bekommt deshalb eine eigene IP, und die
Drossel hat einen eigenen Abschnitt mit fester IP und kontingentfreiem Owner.
(2) **`communities.$id` ≠ `communities.tenantId`.** Die Datentür stempelt in
den Runtime-Tabellen `communityId = tenantId` (`t-…`); mit der `$id` gesucht
liefern `member_counters` und `user_badges` still eine LEERE Menge. Beide
Abzeichen-Prüfungen waren im ersten Lauf rot, obwohl das Produkt stimmte —
dieselbe Verwechslung, vor der CLAUDE.md bei `notify()` warnt.
(3) **Zwei neue Routen können die Typen einer ganz anderen App umwerfen.** Nuxt
tippt `$fetch` über die Vereinigung ALLER Server-Routen; die Ableitung des
Options-Typs kippte mit den zwei F57-Routen über die Rekursionsgrenze
(`TS2589`). Gemeldet wurde `apps/platform/server/utils/tenantBrandMark.ts` —
eine Datei, die niemand angefasst hatte; entschärft man den einen Aufruf,
wandert der Fehler zum nächsten `$fetch`. Vier der fünf betroffenen Aufrufe
zeigen ohnehin auf FREMDE Dienste, dort ist `, string` als Anfrage-Generic
präziser als die Inferenz gegen interne Routen. Die Schwelle war vorher schon
fast erreicht; F57 hat sie nur sichtbar gemacht.
(4) **Ein frisch beigetretenes Mitglied wartet bis zu 30 s auf seine Rolle**
(gemessen: t=0…25 s `role: null`, t=30 s `viewer`) — der bestehende
Rollen-Cache, der für jede Capability gilt. Wer das im Beweis nicht abwartet,
misst den Cache statt der Mechanik, und der generische 403 ohne `reason` sieht
aus wie ein kaputtes Gate.
(5) Die Testphase lässt **eine Community je Konto** zu — ein Beweis mit zwei
Communities braucht zwei Gründer.

### U15 Teil 5 (letzter) — Zeitzone: Datum und Uhrzeit in der eigenen Zone ✅ 2026-08-13

**Damit ist U15 zu.** Konto → Allgemein bekommt eine Karte „Zeitzone": ein
Auswahlfeld mit Suche, „Automatisch (Browser)" als erste Option und Vorgabe,
darunter die 418 Zonen der Laufzeit nach Region gruppiert. Darunter steht die
Wirkung im Klartext („Jetzt: 04:24 AM in Europe/Berlin") — eine Einstellung,
deren Folge man erst morgen bemerkt, kann niemand prüfen.

Abgelegt in den Appwrite-Account-Prefs (`prefs.timezone`, IANA-Name, `''` =
automatisch) wie `emailNotifications`/`emailLocale` — **keine Tabelle, keine
Migration**. Geschrieben über eine eigene kleine Route `PUT /api/auth/timezone`
(Session-Client, `updatePrefs` MIT MERGE); `/api/auth/` steht schon in
`controlApiPrefixes`, die Karte funktioniert deshalb auch auf den
Kontroll-Hosts, wo dieselbe Fläche als `/profile` läuft.

WIRKUNG AN EINEM PUNKT: `useFormatDate()` ist der zentrale Datums-Formatter und
der einzige Anfasspunkt. Ohne Wahl wird gar keine `timeZone`-Option gesetzt —
`Intl` rechnet wie bisher in der Zone der Laufzeit, das Verhalten ist Byte für
Byte das alte. `useFormatRelativeTime()` ist BEWUSST unberührt: „vor 5 Minuten"
ist eine Differenz und kennt keine Zeitzone.

Drei Dinge, die man nicht „vereinfachen" darf:

- **Fail-closed beim Schreiben, fail-soft beim Lesen** (`core/shared/timezone.ts`).
  Die Route prüft gegen `Intl.supportedValuesOf('timeZone')` und lehnt
  Unbekanntes mit 400 ab; ein Tippfehler in den Prefs ließe sonst
  `Intl.DateTimeFormat` bei JEDER späteren Anzeige eine RangeError werfen. Beim
  LESEN wird eine unbekannte Zone still zu „automatisch" — die tzdb streicht
  Zonen, und eine alte Wahl darf kein Dashboard weiß machen.
- **Ein Date-only-String hat keine Zeitzone.** `'2025-12-31'` ist in Tokio
  derselbe Tag wie in Denver. Er wird deshalb als UTC-Mitternacht gebaut UND in
  UTC formatiert; das Paar hebt sich auf. Vorher stand dort lokale Mitternacht
  mit lokaler Formatierung — dasselbe Ergebnis, aber sobald eine Konto-Zone
  dazukommt, wäre das Paar gemischt und der Tag verschöbe sich.
- **Kein Hydrations-Risiko, und zwar aus einem Grund:** die Zone kommt aus dem
  Auth-Store, den `plugins/auth.server.ts` schon beim SSR aus
  `event.context.user` füllt. Server-Render und erste Client-Render lesen
  denselben Wert aus demselben Payload. Die laufende Uhr der „Jetzt"-Zeile ist
  das Einzige, was der Server nicht wissen kann — sie steht in `<ClientOnly>`.

Beweis `packages/core/scripts/verify-timezone.mjs` **11/11** gegen einen
Worktree-Server (Gast 401 · `Mars/Olympus` 400 · `UTC` 400 · `europe/berlin`
400 · echte Zone 200 · `''` 200 · SSR-HTML trägt die gewählte Zone · zurück auf
automatisch = alter Zustand). Der entscheidende Vergleich nimmt
`Pacific/Kiritimati` (UTC+14) gegen `Pacific/Niue` (UTC−11): 25 Stunden
Abstand heißt zu JEDEM Zeitpunkt ein anderer Kalendertag, der Test kann also
nicht zufällig grün sein. Gegenprobe gefahren: mit einem `useFormatDate()`, das
die Zone ignoriert, fällt genau diese Prüfung (10/11). Dazu 25 Unit-Tests
(`format.test.ts`, `timezone.test.ts`) und ein Durchgang im Browser — Auswahl,
Suche, Speichern, Prefs-Merge (`emailNotifications` überlebt).

**Gelernt:** (1) `Intl.supportedValuesOf('timeZone')` liefert **nur kanonische
geografische Zonen** — kein `UTC`, kein `Etc/*`, keine Aliasse. Die
Erlaubnisliste lehnt „UTC" deshalb ab; das ist eine Folge der Liste, kein
Fehler, und steht als Test fest, damit es niemand „repariert". (2) Nuxt UIs
`USelectMenu` behandelt `type: 'label'` als STRUKTUR und filtert es bei einer
Suche NIE mit — die Suche nach „Berlin" zeigte sechs leere Regions-Zeilen über
dem einen Treffer. Kur: `v-model:search-term` binden und die Überschriften
weglassen, solange gesucht wird. (3) Eine dritte Anzeige-Stelle lief an der
zentralen Rechnung vorbei: `/profile/activity` rief die rohe Util mit
selbstgebauter Locale-Zeile. Wer eine Einstellung „im zentralen Formatter"
verankert, muss die direkten Util-Aufrufe mitgreppen — sonst wirkt sie überall
außer dort, wo ausdrücklich absolute Daten stehen.

---

### U15 Teil 4 — Zwei-Faktor: TOTP als zweiter Schlüssel fürs Konto ✅ 2026-08-13

Konto → Sicherheit bekommt eine Karte „Zwei-Faktor" (aus → einrichten → Codes
notieren → an), die Anmeldung einen zweiten Schritt (Code aus der App **oder**
Wiederherstellungs-Code). Alles läuft server-seitig über Appwrites MFA und den
Session-Client — kein eigener Code-Speicher, keine eigene Krypto, der Browser
spricht weiterhin nie mit Appwrite. Fünf Routen unter `/api/auth/mfa`
(setup · verify · challenge · disable · status), Regeln pur in
`core/shared/mfa.ts`, Drossel auf challenge/verify/disable.

Gebaut wurde gegen das GEMESSENE Verhalten von Appwrite 1.9.6, nicht gegen die
Doku — vier Punkte, an denen beides auseinanderfällt:

- **Der Login mit aktivem MFA ist ein ERFOLG.** `createEmailPasswordSession`
  liefert eine gültige Session mit `factors: ['password']`; das Cookie wird
  gesetzt. Der zweite Faktor fehlt nur noch, und Appwrite sagt das auf jedem
  Konto-Aufruf mit `401 user_more_factors_required`. Ob er fällig ist, fragen
  wir deshalb Appwrite (ein `account.get()` mit der frischen Session), statt
  `minimumFactors` nachzubauen — die Rechnung hängt auch an verifizierter
  Mail/Telefon und wäre nachgebaut sofort falsch.
- **`updateMFAChallenge` gibt eine Session mit LEEREM `secret` zurück.** Wer
  daraufhin das Cookie neu setzt, meldet den Nutzer im Moment des Erfolgs ab.
- **Ein falscher Code verbraucht die Challenge nicht** (Appwrite löscht sie nur
  bei Erfolg), und sein `abuse-limit` hängt am `challengeId` — wer je Versuch
  eine frische Challenge anlegt, läuft daran vorbei. Die wirksame Bremse ist
  unsere Drossel.
- **Abschalten verlangt bei Appwrite GAR NICHTS** — `updateMFA(false)` und
  `deleteMFAAuthenticator` gehen mit nichts als einer Session durch. Die
  Bestätigung ist unsere und ist bewusst ein gültiger zweiter Faktor statt des
  Passworts: wer den Zweitfaktor entfernt, soll belegen, dass er ihn noch hat
  (Wiederherstellungs-Code zählt, sonst wäre ein verlorenes Telefon eine
  Sackgasse).

**OAuth bleibt außen vor, und zwar von Appwrite so gewollt.** Eine
OAuth2-Session bekommt `'factors' => [TYPE::EMAIL, 'oauth2']`, im Quelltext
kommentiert mit „include a special oauth2 factor to bypass MFA checks"
(`app/controllers/api/account.php:1936`). Sie zählt damit schon zwei Faktoren
und wird nie zur Challenge geschickt. Wer den Zweitfaktor einschaltet und sich
danach mit Google anmeldet, kommt ohne Code hinein — **eine Entscheidung für
David** (s. OPEN-ITEMS), kein Fehler unseres Baus.

QR-Bild ohne neues Paket: es rendert Appwrites Avatars-API und reist als
`data:`-URI in der setup-Antwort mit. Eine eigene Bild-Route hätte die
otpauth-URL — und damit das Geheimnis — in eine URL gelegt (Verlauf, Proxy-
Logs, Referer). Fällt es aus, bleiben Geheimnis und Link im Klartext bedienbar.

Beweis `packages/core/scripts/verify-mfa.mjs` **39/39**, zweimal hintereinander;
Unit-Tests `packages/core/tests/mfa.test.ts`; E2E `24/24` als Gegenprobe, dass
ein Login OHNE Zwei-Faktor unverändert läuft.

**Gelernt:** Der Wiederherstellungs-Code war mit dem offiziellen SDK **komplett
tot**, und der Fehler sah exakt wie ein Tippfehler des Nutzers aus.
`Auth/MFA/Type::RECOVERY_CODE` ist `'recoveryCode'` (camelCase), jedes SDK-Enum
sendet `'recoverycode'`; die `WhiteList` beim Anlegen prüft case-INsensitiv und
speichert die Kleinschreibung, `Challenges/Update.php` vergleicht danach mit
`===` — der Zweig fällt in `default => false` und antwortet
`401 user_invalid_token`, also ununterscheidbar von „Code falsch". Gefunden
wurde das erst, als die naheliegenden Verdächtigen (Verschlüsselung der Spalte,
Cache, halbe Session) alle widerlegt waren: `getMFARecoveryCodes` gab dieselben
Codes im Klartext zurück, die die Challenge ablehnte. Die Regel daraus: **wenn
Lesen und Prüfen desselben Werts auseinanderfallen, liegt der Fehler im
Vergleich, nicht in den Daten** — und der Quelltext im Container (`docker exec
… /usr/src/code/…`) beantwortet solche Fragen in Minuten, wo Messen von außen
nur immer neue Hypothesen erzeugt. Der A/B-Beleg auf demselben Konto:
`factor="recoverycode"` → abgelehnt, `factor="recoveryCode"` → akzeptiert.
Abschnitt 6 des Beweises prüft weiterhin BEIDE Schreibweisen und fällt, sobald
Appwrite repariert — dann darf die Sonderbehandlung weg.

**Zweitens gelernt (am eigenen Beweis):** Ein Beweis, der beim zweiten Lauf rot
wird, misst sich selbst. Feste Client-IPs erbten das 60-Sekunden-Budget der
Drossel aus dem vorigen Lauf (429 schon beim ERSTEN Versuch), und Appwrites
Challenge-Deckel pro `userId` (10) ließ zwei Abschnitte an ihrem eigenen
Vorlauf scheitern statt an ihrer Aussage. Jetzt: frische IP je Abschnitt,
eigenes Konto je Abschnitt, der es braucht. Und eine Prüfung stand als
`check(..., true)` da und konnte nie fallen — sie belegt jetzt wirklich, dass
`mfa_invalid_code` und `rate_limited` als Grund mitreisen.

---

### F57 Mechanik 1 — Emoji-Reaktionen + der demo-Nachzügler des Account-Cutovers ✅ 2026-08-14

**Reaktionen:** fester 8er-Satz an Diskussions-Themen (Details/Zuschnitt im
DECISION-LOG 2026-08-14), Tabelle `discussion_reactions` (posts-017, Pool nur
account-Instanz), Toggle je (Ziel, Nutzer, Emoji), gebündelte Aggregation
(EINE Abfrage je Themenseite), badge-neutral mit Gegenprobe (5 Reaktionen
ändern keinen Upvote-Zähler), `first-reaction`-Badge an der ersten
ABGEGEBENEN Reaktion. Beweis 27/27, alle sieben Gates, Deploy `fb64a0ab`.

**Der Live-Beweis fand einen AH-1-NACHZÜGLER:** die Reaktions-Route
antwortete auf demo 500 — `communities.projectId` von demo und fünf
stillgelegten Probe-Communities zeigte noch auf das EINGEFRORENE
`pool`-Projekt. demo las und schrieb seit dem Cutover (2026-08-11) im
falschen Projekt; jede seitdem neue Tabelle fehlte dort (Nav/SEO warnten nur
fail-soft — die Reaktions-LESEROUTE machte das Loch als 500 sichtbar).
Reparatur über `scripts/ops/repair-runtime-project.mjs` (Dry-Run-Default,
defensive Gegenprüfung: bricht ab, wenn seit dem Stichtag ins eingefrorene
Projekt geschrieben wurde): Abweichung über alle 37 pool-Tabellen = 0,
Bestände t-demo beidseitig identisch (10/8/24), dann 6 Zeiger auf `account`
— demo antwortet seither 200 mit dem echten Emoji-Satz.

**Gelernt:** (1) Ein Cutover ist erst zu, wenn auch die ZEIGER umgezogen
sind — AH-1 migrierte Daten und fror pool ein, aber `communities.projectId`
der Bestands-Communities blieb; drei Tage lang bediente ein eingefrorenes
Projekt live Traffic, und nur fail-soft-Leser verdeckten es. Cutover-Runbooks
brauchen einen Punkt „alle Verweise auf das alte Ziel aufzählen und
umhängen". (2) Fail-soft ist zweischneidig: die Nav-/SEO-Warnungen standen
seit Tagen im Log, ohne dass sie jemand las — eine WARN-Zeile ohne Leser ist
kein Netz; die erste NICHT-fail-softe Route deckte den Zustand auf.
(3) `node --env-file` überschreibt exportierte Variablen nicht (zweiter
Treffer dieser Falle diese Woche) — Migrations-Läufe nie mit
`source`-Blöcken im selben Shell-Aufruf mischen.

### U15 Teil 3 — Weiterleitungen: alte Adressen führen wieder wohin ✅ 2026-08-13

Owner legt Redirects an (`/dashboard/community/redirects`, Capability
`branding.manage`): exakte Pfad-Treffer, **intern 301** (dauerhafter Umzug
nimmt sein Such-Ansehen mit), **extern 302** (ein fremdes Ziel erbt kein
Ansehen, und ein gemerktes 301 wäre im Browser nicht mehr abstellbar). Bau
nach dem 033/034-Muster: system-035 `community_redirects` (EINE Row je
Community, `permissions: []` + Reparaturschritt + ensureColumn; Spalte
**MEDIUMTEXT** — nachgerechnet: 100 Regeln × (256+512+Gerüst) ≈ 79k Zeichen,
varchar endet bei 16.381; `MAX_REDIRECT_RULES = 100` in Zod, Kommentar und
Test). Middleware bei `01.` (nach Tenant-Auflösung, vor allem anderen):
Treffer = 301/302 ohne Seitenaufbau, Fehltreffer = ein Blick in den
mandanten-gescopten 30-s-Microcache; nur GET/HEAD, Query bleibt. Sperrliste
für System-Pfade (`/api /dashboard /login /settings …`, sprachpräfix-fest —
der Beweis fand `from: "/de/login"` als angenommenen Unsinn und schloss die
Lücke fail-closed), Ketten UND Ringe beim Schreiben abgelehnt, Wildcards
bewusst nicht (Kunden-Regex im heißesten Pfad = Ein-Anfrage-DoS). Beweis
**61/61**, Migration auf allen vier Instanzen (Parität 13 Tabellen), Deploy
`f521730f`, live: Gast-PATCH 401, normale Seiten unverändert 200.

Drei Defaults zur Kenntnis für David (umkehrbar, je eine Zeile): Sperrliste
wie oben (Produkt-Pfade wie `/feed` bleiben umleitbar) · Obergrenze 100
Regeln · Ketten komplett verboten statt nur Ringschlüsse.

**Gelernt:** (1) Ein Pfad-Filter, der VOR der Sprachpräfix-Normalisierung
prüft, prüft einen Pfad, den der Leser nie sieht — Sperrlisten gehören auf
die NORMALISIERTE Form, und die Gegenprobe gehört in den Beweis. (2)
Weiterleitungs-Middleware so früh wie möglich einhängen: bei `10.` zahlte
jeder Treffer den vollen Aufbau einer Seite, die niemand sieht.

### U15 Teil 2 — „Sucheintrag" (SEO): Beschreibung, noindex, Vorschau ✅ 2026-08-13

Davids Zuschnitt: Meta-Beschreibung der Startseite (Fallback: Seiten-Anriss
wie bisher) + noindex-Schalter + Vorschau (Google-Snippet + generierte
Social-Karte — KEIN Upload, og:image bleibt generiert). Bau nach dem
Navigations-Muster: system-034 `community_seo` (`metaDescription` 320 +
`noindex`, `permissions: []`), pure Regel `resolveCommunitySeo`, Beschreibung
fließt in den BESTEHENDEN Kopf (index.vue-description), das robots-Signal
liegt in `useLocaleSeoHead()` neben C18-membersOnly (gilt der ganzen
Community) — Weg dorthin ohne zweiten Kopf-Pfad und ohne Extra-Fetch über
Middleware → context → Server-Plugin → Store. Reiter heißt kundensprachlich
„Sucheintrag"/„Search listing". Beweis **49/49** (u. a.: noindex aus ⇒ Tag
weg; 320 ⇒ 200, 321 ⇒ 400; Kontroll-Host trägt As noindex nie; og:image
überlebt den Schalter; Row per Session nicht lesbar). Migration auf allen
vier Instanzen (Parität 12 Tabellen deckungsgleich), Deploy `8abe1fca`, live:
kein robots-Meta im Default, Gast-PATCH 401, www unberührt.

**Im selben Zug zwei ernste Funde geschlossen:** (1) **system-033 hielt sein
Least-Privilege-Versprechen nicht** — der Fix-Commit hatte nur den KOMMENTAR
geändert, die Migration vergab weiter `read(any)` und lief so gegen alle vier
Instanzen (Tabellen leer, nichts exponiert). Jetzt: `permissions: []` +
updateTable-REPARATURSCHRITT in der Migration (heilt Bestand — gefahren,
per GET-Gegenkontrolle überall `[]`) + ensureColumn gegen die
400-column_limit-Falle (033 war nicht idempotent — der Wiederholungslauf
starb NACH dem Permissions-Schritt, live erwischt). (2) **Der
Paritäts-Wächter meldete währenddessen fälschlich „deckungsgleich"**: seine
handgepflegte SYSTEM_TABLES-Liste kannte `account_handles`,
`community_handles`, `community_navigation`, `community_seo` nicht — genau in
dem Moment, als drei Instanzen eine Tabelle NICHT hatten (der
034-Erstlauf traf durch eine Env-Falle viermal portfolio). Liste nachgezogen,
alle vier Instanzen über 12 Tabellen deckungsgleich.

**Gelernt:** (1) Ein Commit mit „fix"-Botschaft kann nur den Kommentar
ändern — die Abnahme eines Permissions-Fixes ist der GREP auf die
Permissions-ZEILE, nicht die Commit-Message. (2) `node --env-file`
überschreibt EXPORTIERTE Variablen nicht: ein `set -a; source`-Prüfblock vor
einem Migrations-Loop lenkt ALLE Läufe auf die letzte gesourcte Instanz —
Migrations-Läufe und Env-Sourcing nie im selben Shell-Aufruf mischen, und die
„Projekt X"-Zeile jedes Laufs LESEN. (3) Ein Wächter mit handgepflegter Liste
ist nur so wach wie sein letzter Pfleger — „Neue system-Tabelle ⇒ hier
eintragen" gehört in die Migrations-Checkliste, nicht ins Gedächtnis.

### U15 Teil 1 — Navigations-Editor: der Owner stellt sein Menü zusammen ✅ 2026-08-13

Davids Zuschnitt (2026-08-13): Produkt-Einträge **ausblenden + umordnen +
umbenennen** (eigene Labels für beide Sprachen — bewusster Übersetzungs-
Verzicht, leeres Feld fällt zurück) plus **eigene Links** (CMS-Seiten der
Community + externe https-URLs, neuer Tab mit `rel="noopener"`).

**Bau:** system-033 `community_navigation` (EINE Row je Community, rowId =
communities.$id, `config`-JSON 8192 — nachgerechnet gegen das
utf8mb4-Zeilenbudget, nicht geraten) mit **`permissions: []`** (Least
Privilege: heute liest nur SSR über den Admin-Client; Live-Propagation ist
eine dokumentierte Tür, keine vergessene). EINE pure Regel
`resolveCommunityNav` (core/shared) mit vier Zusagen: das Tarif-Gate filtert
VOR dem Override und bleibt autoritativ · unbekannte Ids werden ignoriert,
bleiben aber gespeichert · nicht Erwähntes hängt hinten an · ohne Wahl ändert
sich nichts. Dazu **umbenennen ja, umlenken nein** — ein Produkt-Eintrag trägt
nie ein eigenes Ziel (sonst zeigte „Beiträge" auf eine fremde Adresse);
Ziel-Prüfung fail-closed (URL-geparst, https-Pflicht). Editor
`/dashboard/community/navigation` im **pages-Layer** (der hatte sich seit E9
selbst angekündigt; keine Control-Plane-Naht nötig, der Link-Wähler braucht
die Seiten des Layers), Capability `branding.manage` (Gestaltungs-Klasse wie
F5 — bewusst NICHT `pages.manage`, das auch Editoren tragen).

**Beweise:** verify-community-navigation.mjs **66/66** — u. a. Umordnen/
Ausblenden/Umbenennen im SSR-HTML, Tarif-Gate-Gegenprobe (basic-Plan hält
/feed + /events trotz Override versteckt, die Wahl bleibt gespeichert),
`http://`/`javascript:`/`//host` je 400, fremde Seite 400 `unknown_page`,
Fremder 403/Gast 401, Mandanten-Isolation, Least-Privilege-Gegenprobe
(Owner-Session getRow → 404, listRows → 401, Admin-Key ok). Migration vor dem
Deploy auf allen vier Instanzen, `ops:schema-parity` deckungsgleich. Deploy
`35f5a851` gate+deploy=success; live: PATCH als Gast 401, öffentliches GET
`{"entries":[]}` = Standard-Menü, alle Hosts grün.

**Gelernt:** (1) Ein Agent, der seinen Beweis an einen Subagenten delegiert,
kann mit „Beweis läuft" fertig aussehen, während NICHTS gelandet ist — der
Blick in den Worktree (Skript existiert? Server laufen?) gehört zur Abnahme.
(2) Für öffentliche Community-Konfiguration ist `read(any)` nicht automatisch
das richtige Vorbild: wenn heute nur SSR liest, ist `permissions: []` der
billigere und engere Schnitt, und die Live-Propagation bleibt als EINE
dokumentierte Folge-Migration möglich. (3) Zeilenbudgets nachrechnen: 40
Einträge × 512-Zeichen-Ziele hätten in keine varchar-Spalte gepasst — die
Grenze gehört in Spalte UND Zod, sonst wird aus einem 400 ein Appwrite-500.

### U19 — „Hilf uns, Pukalani zu schärfen": das Markt-Signal hinter dem Aha ✅ 2026-08-12

Die drei Fragen, die U12 aus dem Wizard geworfen hat — **Größe · Zweck · Ziel** —
werden wieder gestellt, aber an der richtigen Stelle: als freiwillige Karte im
Dashboard des Owners, **nachdem** er seinen ersten eigenen Beitrag geschrieben
hat (Benchmark-Befund E5: „das Produkt-Signal geht nicht verloren, es kommt
später und von Leuten, die schon investiert sind"). Teilantworten erlaubt,
„Später" (30 Tage) und „Nicht mehr fragen" (für immer) daneben.

**Der Leser war die Bedingung** (Davids Entscheidung 2026-08-12): Betreiber-Seite
**Markt-Signal** unter `admin.pukalani.app/dashboard/market-signal` — drei
Verteilungen als Balken, Beteiligungsquote, keine Community-Namen. Ohne sie wäre
der Wizard-Fehler wiederholt worden (erhoben, nie gelesen).

**KEINE Migration, KEINE neue Tabelle.** Die Antworten haben in
`communities.profile` ihren angestammten Platz: `SiteProfile` trägt
`purpose`/`memberRange`/`goal` seit dem ersten Wizard als optionale Felder,
`parseSiteProfile` liest sie, und die Communities von VOR U12 haben dort echte
Werte stehen — eine eigene Tabelle hätte die Auswertung gezwungen, Alt- und
Neubestand zu vereinigen.

Gebaut: pure Regeln in `packages/onboarding/shared/profileSignal.ts` und
`packages/control/shared/marketSignal.ts` · Karte
`CommunityProfileSignalNotice.global.vue` (zweistufig — eine Zeile, die Fragen
erst auf Wunsch; 16 Auswahlkarten wären auf der Übersicht kein Hinweis mehr)
· Routen `GET/POST /api/community/profile-signal` +
`/profile-signal/postpone` (onboarding) → Service-Naht →
`POST /api/control/community/profile-signal` · Auswertung
`GET /api/control/market-signal` + Seite + Registry-Eintrag (`sites.manage`).
Beweis `packages/onboarding/scripts/verify-profile-signal.mjs`: **35/35**
gegen zwei Worktree-Server mit echter Naht.

**Gelernt (1): Die Checkliste taugte NICHT als Erscheinungs-Bedingung** — die
Aufgabe sah sie dafür vor, zwei Messungen haben sie widerlegt. Erstens ist
„teilweise abgehakt" ab Minute eins wahr: der Wizard setzt den Vibe, und der Vibe
IST `communities.theme`, also steht der Punkt „Farbwelt" schon erledigt da, bevor
der Owner das Dashboard zum ersten Mal sieht. Zweitens meldet die
Checklisten-Route nach dem Wegklicken **alle fünf Punkte als `false`** (bewusst —
sie spart dem Wegklickenden drei Abfragen und einen Control-Ruf pro
Seitenaufruf); wer die Checkliste ausblendet, wäre für die Markt-Frage FÜR IMMER
unsichtbar gewesen — und das sind gerade die entschlossenen Owner. Genommen wurde
deshalb der erste Punkt der Checkliste als das, was er ohnehin ist: der
Aha-Moment (`communityHasAuthoredContent`, derselbe core-Vertrag, dieselbe
Ausnahme für den gesäten Beispiel-Beitrag). Regel daraus: **eine geerbte
Bedingung erst messen, dann übernehmen.**

**Gelernt (2): `apps/control` extended `onboarding` NICHT.** Die Auswertungs-Seite
griff zuerst auf `onboarding.profileSignal.*` zu — dieselben Beschriftungen, die
die Karte benutzt. Auf `admin.pukalani.app` hätten dort die ROHEN Schlüssel
gestanden, genau der Impressum-Fall, den `check:i18n-keys` für Config-Schlüssel
abfängt und für `t()`-Aufrufe im Markup bewusst nicht. Die Betreiber-Seite hat
jetzt eigene, kürzere Labels unter `control.marketSignal.options.*`. Regel:
**vor jedem `t()` auf fremde Layer-Schlüssel die `extends`-Kette der App prüfen.**

**Gelernt (3):** Die Testphase lässt **eine Community je Konto** zu — der Beweis
für „Nicht mehr fragen" brauchte deshalb einen zweiten Owner. Und
`scheduledAt: null` wird von `createPostSchema` abgewiesen (`.optional()`, nicht
nullable): das Feld gehört weggelassen, nicht genullt.

---

### U20 — Community-Export: der Owner nimmt seine Community mit ✅ 2026-08-12

`GET /api/community/export` (onboarding) liefert EINE JSON-Datei mit Beiträgen,
Kommentaren, Seiten, Terminen und Kursaufbau samt Lektionen, dazu das Team mit
Name und Rolle. Owner-only über die neue Capability `community.export` —
dieselbe Klasse wie `community.transfer`/`community.delete`, weil hier das
gesamte Archiv das Haus verlässt und nicht etwas nach innen verwaltet wird.
Gedrosselt auf 2/min (eigener Bucket `community:export`, damit ein Export das
Budget des Switchers nicht leerräumt). Reiter „Export" unter
`/dashboard/community`, de+en.

**Gesammelt wird über einen VERTRAG, nicht über einen Sammler:**
`registerCommunityExportContributor` (core, wortgleich zum GDPR-Zwilling
`registerUserDataContributor`) + je ein Nitro-Plugin in posts, comments, pages,
events, courses und onboarding. Ein onboarding, das `community_posts` und
`lessons` beim Namen kennt, wäre genau die Cross-Layer-Kopplung, die A14
verbietet; so hat eine App ohne `courses` automatisch kein Kurs-Kapitel, ohne
dass irgendwo eine Liste gepflegt wird. Der Contributor bekommt bewusst NUR den
`H3Event` und keine communityId — damit ist die Datentür der einzige Weg zu
lesen.

**Die PII-Lesart** (Davids Zuschnitt, DECISION-LOG 2026-08-12): Inhalte tragen
den öffentlich sichtbaren ANZEIGENAMEN ihres Autors — ein Beitrag ohne Verfasser
wäre kein Archiv, sondern Konfetti. Verboten ist die MITGLIEDERLISTE: keine
E-Mail, keine Appwrite-Id, kein `authorId`, keine Einladungen (die tragen die
Adressen von Leuten, die noch nicht einmal Mitglied sind), keine
Gast-Autoren-Tabelle, keine Zahlungsdaten. Gewöhnliche Mitglieder erscheinen
ausschließlich in `memberCounts`. Das Bündel nennt sein eigenes Schweigen: das
Feld `omitted` listet auf, was bewusst fehlt — sonst rät der Leser, ob seine
Community leer oder der Export unvollständig ist.

**Beweis:** `packages/onboarding/scripts/verify-community-export.mjs` —
**34 bestanden, 0 fehlgeschlagen**, zweimal hintereinander. Er pflanzt ein
gewöhnliches Mitglied MIT Adresse und beweist zuerst, dass es mitgezählt wird
(`memberCounts.members ≥ 1`), und erst dann seine Abwesenheit im Text; dazu ein
rekursiver Schlüssel-Lauf über das ganze Bündel gegen
`email/authorId/organizerId/userId/runtimeUserId`. Fremder → 403, viewer → 403,
Gast → 401, dritter Aufruf → 429.

**Gelernt:** Drei Dinge, die nicht auf Anhieb stimmten.
(1) **Ein Session-Client hätte den Export still halbiert.** Entwürfe und
ausgeblendete Zeilen tragen moderations- oder besitzer-eigene Row-Permissions —
die Klinke `member` liest sie nicht. Der Export läuft deshalb
`as: 'operator', actor: 'member'` (Vorbild `seedWelcomePost.ts`): die Tür bleibt
die Grenze, der Handelnde bleibt ehrlich benannt, und weil der Export NICHTS
schreibt, greift `assertWritable` nie — er funktioniert also auch in einer
`billing`-gesperrten Community. Genau so gehört es: die Sperre soll zum Zahlen
bewegen, nicht Daten als Geisel nehmen.
(2) **Eine neue Capability steht an ZWEI Stellen, und der Typ erzwingt nur
eine.** Union in `shared/types/authz.ts` + Rolle in `communityAuthz.ts`
kompilierten grün — `ALL_CAPABILITIES` in `shared/authz.ts` ist ein
Laufzeit-Array, das der Typ nicht auf Vollständigkeit prüft. Gemerkt hat es
allein `communityAuthz.test.ts` („jede Site-Cap existiert im globalen
Katalog"). Wer eine Capability anlegt, fasst drei Dateien an.
(3) **Eine Drossel macht den eigenen Beweis beim zweiten Lauf rot.** Mit festen
Test-IPs räumt der 429-Abschnitt sein eigenes Minutenbudget leer, und der
nächste Lauf scheitert an „1. Lauf kommt durch" — was wie ein Produktfehler
aussieht. Kur: zufälliges Oktett je Lauf, wie es die Geschwister-Skripte für
`RUN_IP` längst machen.

### U14 (Code-Teil) — Anmelden mit Google, unsichtbar bis zu Davids Klicks ✅ 2026-08-12

Der komplette Code-Teil ist live und GEFAHRLOS ohne Credentials: kein
konfigurierter Provider ⇒ kein Button, Start-Route 404, Callback mit Müll ⇒
saubere Umleitung OHNE Session-Cookie (alles live nachgemessen). Flow:
`GET /api/auth/oauth?provider=google` (zwei Bedingungen: Config-Flag UND Env)
→ `createOAuth2Token` (NICHT createOAuth2Session — das Cookie muss auf
UNSEREM Host landen) → Google → Appwrite-Callback → unser
`/api/auth/oauth/callback` tauscht userId+secret gegen die Session und setzt
das httpOnly-Cookie mit DEMSELBEN Helfer wie der Passwort-Login. Redirect-Ziel
reist als 10-min-Lax-Cookie durch `safeRedirectTarget`.

**Die Circle-Falle trifft uns nicht** (am lebenden Appwrite verifiziert, nicht
angenommen): Google sieht ausschließlich Appwrites Redirect-URI — EIN
Google-Client für die ganze Plattform; je Host braucht es nur die Appwrite
Web-Platform, und die existiert wegen Realtime/F45 längst automatisch (Wildcard
+ `pending_platform` für Kundendomains). Erstkontakt = vollwertiges Konto:
A5-Beitritt, Feed, Meilenstein, Auth-Log wie beim Passwort-Weg; bei
geschlossener Registrierung wird die frische Session EINGEZOGEN, das Konto
NICHT gelöscht (Appwrite legt es vor unserem Code an — Verweigern ja,
Vernichten nie). AGB-Häkchen gatet die Buttons in der UI, exakt so streng wie
der Passwort-Weg. 35 neue Unit-Tests; Beweis in Schichten, der Voll-Flow ist
ohne echten Client ehrlich als „nicht messbar" ausgewiesen. Deploy `942e58c1`.
Rest: Davids Klick-Liste in docs/runbooks/GOOGLE-LOGIN.md.

**Gelernt:** (1) Ein „geparkt" geglaubter Punkt kann ein halbes Skelett im
Code haben (Phase-4-OAuth-Routen existierten) — vor dem Bauen greppen, aus
„neu bauen" wird „härten und vervollständigen". (2) `createOAuth2Session`
wäre bei SSR-Cookie-Architektur der falsche Appwrite-Weg — die Session-Cookies
landeten auf der Appwrite-Domain; Token-Flow + eigener Callback ist das
Muster. (3) Appwrite validiert success/failure-URLs gegen die registrierten
Platforms — Start-Routen dafür fail-soft bauen, sonst ist ein fehlender
Platform-Eintrag ein 500 statt einer stillen Abschaltung.

### F47-Rest / Adblock-Proxy — die Statistik läuft über den eigenen Host ✅ 2026-08-12

Plausibles offizielles „Bypass adblockers"-Muster als Nitro-Routen im
core-Layer (dort entsteht auch das Script-Tag): `GET /api/stats-script.js`
(proxyt das Script, Microcache 6 h) + `POST /api/stats-event` (proxyt
`/api/event`, nie gecacht) — Pfade bewusst neutral benannt, EIN gemeinsames
Gate (`analyticsProxy.ts`): ohne `pukalani.analytics.enabled` antworten beide
404. Kopfzeilen als ERLAUBNISLISTE gebaut: user-agent, x-forwarded-for aus
`trustedClientIp()` (nie der rohe Header), proto/host, content-type —
BEWUSST ohne `cookie` (trüge auf Mandanten-Hosts die Appwrite-Session) und
`authorization`. Korrektur am Plan: `data-api` gibt es im v3-Script nicht
mehr — Events gehen über `plausible.init({endpoint})`; mit `data-api` hätte
das Script über uns geladen und trotzdem direkt an die Instanz gemeldet
(genau an den Blocker). Legacy-Snippets ohne `pa-`-Id fallen sauber aufs alte
Verhalten. Live belegt (pukalani.app): `plausible.hawaii.studio` 0× im HTML,
Script 200 über den eigenen Pfad, Event **202** vom echten Upstream, `help`
(ohne Analytics) 404. Deploy `593bc6ab` gate+deploy=success.

**Gelernt:** (1) Ein Proxy-Rezept aus einer Doku altert mit der
Script-Generation — das v3-Script kennt `data-api` nicht mehr, und der halbe
Proxy (Script ja, Events nein) sähe funktionierend aus und misst nichts.
(2) Script- und Event-Route brauchen EIN gemeinsames Gate — getrennt gepflegt
könnte das Script laden, während die Events 404 bekommen: derselbe stille
Halb-Zustand.

### Krümel-Welle — sieben Aufräumer + ein gefundenes Sicherheitsloch ✅ 2026-08-12

**Font-Seed** (deploy.yml): Zurückschreiben zweistufig — Blobs additiv,
unifont-Metadaten (`meta/**`, 7-Tage-TTL) dürfen aktualisieren; läuft nur nach
GRÜNEM Build. Der stille Seed-Verfall am 2026-08-18 ist abgewendet, jeder
Deploy frischt auf. **Buckets** (system-032): `avatars` + `gdpr-exports` aus
der Prod-Instanz abgelesen und als Migration verewigt; gegen alle vier
Instanzen gefahren — auf DREI von vier fehlten Buckets real (control +
portfolio beide, comments eins). **C6**: die Drop-Migration war durch die
vollen AH-1-Läufe faktisch längst ausgeführt („schon weg" auf allen vier),
`ops:schema-parity` deckungsgleich. **USlider-a11y** (`CustomizeSlider`-
Wrapper in themes): Nuxt UI überschreibt reka-uis korrektes aria-label
hartkodiert mit „Thumb" — Beschriftung sitzt jetzt am `[data-slot="thumb"]`,
Browser-Gegenprobe: roher USlider sagt weiter „Thumb", die sechs Regler sagen
ihre Namen. **C2/C3/C4**: waren seit 2026-07-31 GEBAUT und standen nur noch
als stale Doppel-Einträge in den Notizen — am Code verifiziert
(planAllows-Gate im blueprint-Layout, Slot-Füllungen in blueprint,
Nav-Einträge in den Layern; `chrome.nav` ist Objekt-Map, keine
Array-Dopplung möglich).

**Handle-Gegenprobe (AH-7-Rest) → Sicherheitsloch gefunden und gefixt:**
Der Beweis lief erst 41/44 — deterministisch. `ensureAccountHandle` stempelte
bei der ANLAGE das Publikum des aktuellen Hosts ohne Mitgliedschafts-Prüfung
(das Gate in `handle.get.ts` kam eine Zeile zu spät); die Umbenennung erbte
und vergab zusätzlich. Wer eingeloggt nur seine Kontoseite auf fremdem
Community-Host öffnete, stand in deren Erwähnungs-Menü. KEIN Inhalts-Leck
(resolveHandleOwners filtert Mitgliedschaft separat — Benachrichtigungen an
Fremde waren nie möglich). Fix: Anlage und Umbenennung vergeben NIE ein Label;
das mitgliedschafts-gegatete `ensureAccountHandleAudience` ist der EINZIGE
Schreiber (GET **und** PATCH — ohne den PATCH-Aufruf verlöre ein Mitglied beim
ersten Namen-Setzen sein eigenes Publikum, gemessen: 37/44). Beweis danach
**44/44**, plus drei Mutations-Gegenproben (je gezielt rot). Bestands-Reparatur
`repair-handle-audience.mjs` (trocken per Default, `hasCommunityAccess`
wörtlich, entfernt nur): gegen Prod `account` — **1 vergiftete Zeile** (Label
der Comments-Community am Handle eines Kontos ohne aktive Mitgliedschaft),
mit `--apply` bereinigt, Kontroll-Dry-Run 0.

**Gelernt:** (1) Eine Gegenprobe, die „nur bestätigen" soll, findet das Loch —
der ⚠️-Vermerk „Probe steht aus" im Skript-Kopf war drei Tage lang die einzige
Wahrheit über eine offene Grenze; solche Vermerke sind Arbeitsaufträge, keine
Fußnoten. (2) Ein Gate NACH der schreibenden Zeile ist kein Gate —
Publikums-Vergabe gehört in genau EINEN mitgliedschafts-geprüften Schreiber,
alle anderen Pfade erben nur. (3) Notizen-Krümel altern wie Audit-Befunde:
C2/C3/C4 waren längst gebaut — vor dem Bauen COMPLETE gegenlesen (die Regel
galt bisher nur für OPEN-ITEMS-Punkte, sie gilt auch für Notizen). (4) Ein
frischer Worktree hat kein node_modules — der erste Gate-Lauf dort ist sonst
komplett rot und sieht wie ein echter Schaden aus.

### AP10 / U17 — Die Wettbewerbs-Munition auf der Marketing-Seite ✅ 2026-08-12

Vier Teile, jede Zahl aus dem Benchmark, jede Pukalani-Aussage am Code geprüft:

**Gebühren-Rechner** (`FeeCalculator.vue`, Daten `FEE_PROVIDERS` in
`apps/marketing/shared/marketing.ts`) auf allen `/vs/*` und `/wechseln`:
Mitglieder × Beitrag → Plattform-Gebühr je Wettbewerber (Circle 2 %, Mighty
2 %, Skool 2,9 %, Heartbeat 5 %, coapp 15 % — Quelle je Zeile verlinkt, Stand
10.08.2026) gegen Pukalani 0 % + 149 € Fixpreis; Stripe-Gebühren ehrlich
erwähnt. Grundpreise BEWUSST nicht addiert (vier Währungs-/Steuerwelten, kein
belegter Wechselkurs). Rundung nur in der Anzeige, Jahreswert aus dem
ungerundeten Monat.

**Belegte Branding-Zitate** auf /vs/circle und /vs/mighty-networks (Capterra,
mit Name+Datum, Original-Englisch in beiden Sprachen); /vs/skool bekommt statt
eines unbelegten Halbsatzes die belegte Tatsache (eigene Adresse nur im
teureren Plan, 100 $ je URL-Änderung). Gegenaussage am Code geprüft: Pukalani
hat KEIN Fremd-Branding und folglich kein Branding-Gate.

**Testphasen-Satz** genau einmal unter den Preisen: „Nach der Testphase wird
nichts gelöscht – deine Community wird nur-lesend, bis du dich entscheidest."
(F49/M13-belegt; die Preis-FAQ entsprechend geschärft.)

**Datenexport-FAQ**: Konto-Export als JSON (`GET /api/auth/export`, 11
Contributoren) ehrlich beschrieben — und ehrlich gesagt, dass es einen
gebündelten Community-Export NICHT gibt; das unbelegte Glossar-Versprechen
(„Mitgliederdaten") korrigiert.

Deploy `80512641` gate+deploy=success; live belegt (Startseiten-Satz, Rechner
auf /wechseln, Zitate+Quellen auf /vs/*, FAQ).

**Für David gemerkt:** Community-Export bauen oder das
`/wechseln`-Versprechen („jederzeit exportieren", „Kein Lock-in") senken —
der Benchmark nennt genau das den stärksten K4-Kontrast; Vergleichszeile
„Kurse inkl. Bezahl-Zugang (Early Access)" stand schon vorher da, im Pool
gibt es aber keinen Mitglieder-Zahlungsweg.

**Gelernt:** (1) `USlider` ist für Screenreader unbedienbar (fest verdrahtetes
`aria-label="Thumb"`) — für Eingaben Zahlenfelder nehmen; der Theme-Editor
trägt das Problem noch (Krümel in OPEN-ITEMS). (2) `UInputNumber` rastet
getippte Werte auf `min + n × step` — großzügige Schrittweite verfälscht
Eingaben (437 → 440), für freie Eingaben step 1. (3) Sekundärquellen aus einem
Benchmark (Trustpilot via Dritt-Seite) nicht zitieren, auch wenn sie saftiger
sind — die belegten Capterra-Zitate tragen genauso.

### AP9 / U16 + U10-Rest — Domain-Politur + Preisseiten, die dasselbe erzählen ✅ 2026-08-12

**Domain (U16, Wettbewerb E6):** Der „Prüfen"-Lauf fragt jetzt zusätzlich die
**CAA-Kette** (eigener Resolver, keine Fremd-API; nebenläufig gestartet, kostet
den Klick nichts). Regeln pur in `packages/control/shared/customDomain.ts`
(`caaChain` + `caaVerdictFromRecords`): Kette von unten nach oben, weil CAA
erbt (RFC 8659 § 3), TLD bewusst außen vor; ein Satz ohne `issue`-Feld
beschränkt nichts (`iodef` ist kein Verbot); `issue ";"` ist das Verbot für
ALLE — gezählt wird das Vorhandensein des Feldes, nicht der Name darin;
`issuewild` wird nicht bewertet (für Kundendomains wird nie ein Wildcard
bestellt); DNS-Fehler ⇒ `unknown`, NIE eine Warnung. Live gegen echtes DNS:
google.com → blocked, www.google.com erbt, letsencrypt.org → ok. Dazu
**Registrar-Anleitungen** (IONOS, Strato, United Domains, Hetzner, Cloudflare
+ generisch) als Aufklapper — sie beschreiben den WEG, die Werte (TXT, IP,
CNAME) bleiben die EINE Server-Anzeige darüber; **TTL-Hinweis**; **30-s-Auto-
Nachprüfen** (`useDomainAutoCheck`: nur solange nicht aktiv, Pause bei
`document.hidden`, sofort beim Zurückkommen mit Mindestabstand, nie zwei
gleichzeitig, Fehlschläge still — die Meldung gehört dem Knopf, der bleibt).

**Preise (U10: G5, E4, M5, M6):** Vergleichstabelle unter den Karten der
www-Startseite — **14 Zeilen, jede aus den echten Gates**
(`pukalani.tenancy.products` + `quota.plans`, inkl. „Eigene Domain — ab Pro",
U13), lokalisierte Zahlen, scrollt bei 375 px im Kasten statt die Seite.
Jahresrabatt überall als „**drei Monate geschenkt**" (Preis-Umschalter, FAQ,
Plan-Reiter, Hilfe-Seite — dasselbe Geld: 261 = 3×29). Zwei Angleichungen, die
erst die Tabelle sichtbar machte: Personals „unter eigener Adresse" las sich
wie die Pro-Domain; Pros Stichpunkte verschwiegen die eigene Domain.

Deploy `3f4d51fc` gate+deploy=success; live in beiden Sprachen nachgemessen.
Betreiber-Konsole bekommt CAA als Log statt Feld (andere Antwortform);
Silo-Domain-Seite: CAA + TTL, keine Registrar-Aufklapper (Operator-Publikum).

**Für David gemerkt:** Die Pro-Karte wirbt mit „plus Team-Rollen" — Team-Rollen
sind aber NIRGENDS plan-gegated (`communityTeam.ts` kennt keine Pläne), und
die Behauptung steht jetzt direkt über einer Tabelle, die die Zeile ehrlich
nicht führt. Entweder das Gate bauen oder den Satz streichen.

**Gelernt:** (1) `@click="handler"` reicht dem Handler das MouseEvent als
erstes Argument durch — ein optionaler `quiet`-Parameter wird damit IMMER
truthy und der Knopf dauerhaft stumm; Handler mit optionalen Parametern im
Template als `handler()` rufen. (2) Beim CAA-Parsen die leeren Werte NICHT
wegfiltern: `issue ";"` ist die härteste Policy des Feldes und sähe gefiltert
aus wie „keine Beschränkung" — am eigenen Test aufgefallen, bevor es ein
Kunde erlebte. (3) Eine Vergleichstabelle aus den ECHTEN Gates deckt
Marketing-Übertreibungen auf, die freier Text jahrelang trägt („unter eigener
Adresse", verschwiegene Pro-Domain, ungegatete Team-Rollen).

### AP8 / U12 — Der Wizard fragt drei Mal statt sieben ✅ 2026-08-12

Davids Entscheidung (2026-08-10) umgesetzt: Pflicht sind **Name/Adresse ·
Kategorie · Vibe** — die drei Antworten, die den ERSTEN ZUSTAND der Community
formen (Host, Willkommens-Beitrag, Farbwelt). Der Flow hat 4 Seiten statt 7
(`basics, category, vibe, summary`); `?step=goal` aus alten Lesezeichen landet
auf Schritt 1.

**Verbleib der vier gefallenen Fragen:** Beschreibung → Karte „Name und
Beschreibung" unter `/dashboard/community` (existiert seit U5); ihre
Zweitwirkung (Startseiten-Text) hängt am Checklisten-Punkt „Startseite", dessen
Hinweistext korrigiert wurde („mit deinem Text aus dem Wizard" wäre eine Lüge
geworden). Größe/Zweck/Ziel: NIRGENDS — bewusst; sie waren reine
Marktforschung, kein Codepfad hat sie je gelesen. KEINE neuen
Checklisten-Punkte: die fünf entschiedenen bleiben.

**Naht abwärtskompatibel** (dieselbe Lage wie `neutral` im Branding-PATCH —
control deployt VOR platform): `purpose`/`memberRange`/`goal` sind im
`.strict()`-Schema OPTIONAL statt gestrichen, mitgeschickte Alt-Werte werden
weiter gegen ihre Kataloge geprüft. BEWUSST ohne `.default()`: ein Default
schriebe eine Antwort ins Profil, die niemand gegeben hat — Abweichung vom
Brief-Wortlaut, mit Gegenprobe belegt (testweises `.default('new')` ⇒ Test
rot). Beweise: verify-onboarding 28/28 (neu: Alt-Nutzlast bleibt gültig,
Profil erfindet nichts, `goal: 'weltherrschaft'` → 400), acceptance 21/21
(Median 0,5 s), Deploy `2ce922fd` gate+deploy=success, alle Hosts + 301er grün.

**Für David gemerkt (drei Folge-Entscheidungen, keine Blocker):** (1) der
KI-Beschreibungs-Vorschlag (`/api/onboarding/suggest`, Entscheidung 2026-07-24)
ist mit seinem einzigen Aufrufer GELÖSCHT — Wiederandocken an
`/dashboard/community` wäre ~30 Zeilen; (2) das Markt-Signal Größe/Zweck/Ziel
ist weg, nicht verschoben (Benchmark-E5 schlug „hinter den Aha" vor); (3) kein
Default in der Naht — falls Wire-Symmetrie gewünscht, eine Zeile je Feld.

**Gelernt:** (1) „Wandert in die Checkliste" verdient eine Prüfung statt
Gehorsam: drei der vier Felder hatte NIE jemand gelesen — sie zu verschieben
hätte die Checkliste mit toten Fragen gefüllt; der richtige Umzug war die
Löschung plus ein ehrlicher Hinweistext. (2) Beweis-Skripte, die hinter der
ersten roten Erwartung abbrechen, verstecken die nächsten: drei Erwartungen
waren SCHON VORHER falsch (`pages.tenantId`→`communityId`, „genau 3 Seiten",
Startseiten-Zusage) und fielen erst auf, als die erste repariert war.

### AP7 / U11 — Fehlermeldungen, leere Seiten, Seitentitel, die weiterhelfen ✅ 2026-08-12

Vier Teile (Trichter G7/M3/M6/M7 + Dashboard M6/M8 + C5), live nachgemessen:

**429 sagt die Wahrheit (G7):** die Minuten-Sperre in
`core/server/middleware/05.rate-limit.ts` trägt jetzt `data.code:
'rate_limited'` → Envelope-`reason`; `isRateLimited()` +
`rateLimitRetrySeconds()` (liest `Retry-After`, rät NIE) in
`core/app/utils/fetchError.ts`, EIN Zweig `useAuthErrorMessage()` in **fünf**
Stellen statt der gemeldeten drei: Login, Register, OTP-Anforderung, OTP-
Code-Prüfung, reset-password. `forgot-password` behält die Anti-Enumerations-
Fassade („Schau ins Postfach" auch bei Fehlern), macht aber bei der Sperre die
begründete Ausnahme: sie zählt pro IP+Route und verrät nichts über die
Adresse — und die Fassade wäre dort eine Lüge (es ging keine Mail raus, der
Nutzer wartet auf nichts). Prod-Beweis: 6. Login-Versuch → 429 +
`retry-after: 56` + `reason: rate_limited`. Unit-Test mit Gegenprobe
(`rateLimitedError.test.ts`).

**/verify hilft sich selbst (M3):** der Resend lag DREIMAL abgeschrieben vor
(Banner, `EmailVerifyRequired`, auf `/verify` gar nicht) — jetzt einmal in
`useEmailVerifyResend()`. Ohne Session führt der Weg über `/login` statt über
einen Knopf, der 401 antwortet (der Link wird oft auf einem zweiten Gerät
geöffnet).

**Titel (C5 + Dashboard-M6):** der Audit-Stand war überholt — 0 der 17
gemeldeten Seiten noch titellos, 0 tote `useHead` (alle 90 Treffer geprüft).
Die ungezählte Lücke daneben: **67 Seiten** auf rohem `useHead({title})` ohne
Marke und ohne Sprachwechsel-Reaktivität → alle auf `useBrandTitle` (repo-weit,
sonst wären Tabs derselben Seitenleiste uneinheitlich); `/dashboard/themes`
hatte GAR keinen Titel (stand in keinem Audit). Bewusst ausgelassen:
Marketing-/Portfolio-SEO-Blöcke, Hüllen `/profile`+`/settings` (Kinder
titeln), `/embed` (noindex-iframe).

**Leere Zustände (M7/M8):** `CoreEmptyState` mit Aktion, wo eine Handlung
existiert — Discussions-Themen (öffnet den BESTEHENDEN Composer per
`v-model:open`, nicht Link in den Feed: eigenständige Produkte),
Theme-Galerie, Ticket-Brett (in `ClientOnly`, Board-Fetch ist
`server: false`); ohne Aktion ehrlich betitelt: Moderationsstapel,
Audit-Protokoll, beobachtete Tickets, Stripe-Preisliste.
`posts.moderation.empty`-Dopplung bereinigt; Footer-„Geschichte" zeigt wie der
Header auf `#geschichte` (M6). Bewusst OHNE EmptyState: `admin/config`,
onboarding `branding`/`plan`, beide Domain-Seiten — dort ist die leere Fläche
ein Formular oder eine Konstanten-Liste, kein Bestand.

Deploy `ff25c1a6`, gate+deploy=success, Proben auf account./www./Mandanten.

**Gelernt:** (1) Ein Audit-Befund über ZÄHLBARES (17 Seiten, 2 tote Aufrufe)
ist nach drei Wochen Parallelarbeit Geschichte — Fundstellen vor dem Bauen neu
greppen, der Agent fand stattdessen die GRÖSSERE ungezählte Lücke (67 rohe
`useHead`). (2) Eine Fassade gegen Konto-Enumeration gilt nur, solange sie
nichts verrät UND wahr bleibt — bei einer IP+Routen-Sperre ist „Schau ins
Postfach" beides nicht mehr. (3) Wartezeiten in Fehlertexten nur aus der
Antwort (`Retry-After`), nie geraten — sonst ist die Korrektur die nächste
falsche Meldung.

### AP6 / U9 — Die Übersichtsseite zeigt echte Zahlen ✅ 2026-08-12

Kennzahlen-Registry `pukalani.admin.stats` (Deklaration in app.config wie
notices, Werte über `DashboardStatValueProvider`-Nitro-Plugins je Layer) —
9 Kacheln aus 7 Layern: Mitglieder, Beiträge, Events, Kurse, Medien,
Speicher „x von y", Plan-/Testphasen-Zustand, Kommentare + offene Meldungen.
EINE gebündelte Route; die Sichtbarkeits-Trias (Ort × Capability ×
Produkt-Gates) wird server-seitig ERNEUT gerechnet — das ist Autorisierung:
ein viewer bekommt die Meldungs-Zahl gar nicht geliefert, „nicht
ausgewiesen" heißt Eintrag-fehlt statt null. Kosten je Kachel 0–1 Abfrage
(Usage-Counter-Wiederverwendung; Kachel-Id = Quota-kind), der Team-Ruf wird
mit der AP2-Checkliste GETEILT — netto ist die Pool-Übersicht billiger als
vorher. Der Nutzer/Kommentar-Chart ist Ort-gegatet (nur Silo — im Pool war
seine Nutzer-Achse längst tot, B2); usersTotal ist eine operator-Kachel
statt einer Markup-Ausnahme.

**Sichtbare Verhaltensänderung (gemeldet):** viewer/editor sehen auf der
Pool-Übersicht KEINE Kachel mehr — vorher eine, die in ein 403 führte.

**Gelernt:** (1) Eine Werte-Route, die mehr liefert als die UI zeigt, ist
eine stille Autorisierungs-Lücke — der Filter gehört in die Route, nicht
nur ins Rendering. (2) Wenn Kachel-Id = Quota-kind, zählt niemand doppelt:
Verträge wiederverwenden schlägt parallelbauen. (3) Deploy-Wachen müssen
über ALLE Zwilling-Läufe auf deploy=success warten (AP5-Lektion,
hier erstmals eingebaut).

### AP5 — U7 (Menü) + U8 (Adressen) ✅ 2026-08-13

**Menü:** neue Gruppe **Moderation** (der Moderator findet seine vier
Arbeitsflächen unter einem Wort statt verstreut auf „Produkte" und
„Einstellungen"), scope:account-Einträge in **„Dein Konto"**, Silo-Hub heißt
ehrlich **„Instanz-Einstellungen"**, Admin-Hülle „Instanz", order-Vergabe in
dokumentierten Zehnerschritten je Layer, und die ⌘K-Suche findet jetzt die
VEREINIGTE Menge (Sidebar + Community-Hub-Reiter + Konto-Reiter) über die
vorhandenen Registries — kein zweites Suchfeld. **Adressen:** neun
Umbenennungen mit 301 in beiden Locales (categories, trust-levels,
community/embed als Hub-Reiter, private-messages entschärft die
Posteingang-Falle, communities statt tenants, sites→websites nachgeholt,
request-access + report-abuse in beiden Sprachen — die Pfad-Sprachregel gilt
jetzt). Prod-Serien-Probe 7/7. Stripe-Rückkehr-Pfad unangetastet.

**Gelernt:** (1) Ein Beweis-Skript prüfte die alte Adresse auf 200 — nach
der Umbenennung wäre der Beweis still rot geworden; Pfad-Änderungen brauchen
den Grep auch über scripts/. (2) Das Deploy-Gate feuert je Prüf-Workflow
einen eigenen Lauf: der Zwilling eines stornierten Triggers zeigt
gate=skipped und sieht wie ein Fehler aus — die Wache muss den Lauf des
ERFOLGS-Triggers verfolgen, nicht den ersten Treffer.

### AP4 / U6 — Ein Wort je Sache ✅ 2026-08-13

~110 i18n-Werte in 27 Dateien auf das entschiedene Vokabular gezogen:
**Plan** (Tarif gestrichen, „Abo" nur Vertragszustand, Reiter+Titel
„Plan & Rechnung", „Kein Abo — nur zum Lesen") · **Community** statt
Tenant/Mandant/Site im Betreiber-Menü (Werte, Schlüssel+Pfade bleiben) ·
Rolle viewer = **Leser/in**/Reader · **Beiträge** statt Feed im Dashboard ·
Gestaltung/Theme-Katalog/Hell & dunkel (G6) · Aufgaben statt Board ·
Wünsche & Ideen statt Customer Feedback · Einbetter-Domains statt
Embed-Sites · DSGVO statt GDPR (de) · en-Satzschreibung/colors/Fonts ·
3 tote Schlüssel gelöscht. „Schon erledigt vorgefunden" sauber getrennt
(Basic-Karte, Landing-blocks, Dieser→Dieses Produkt). Bewusst NICHT: alles
mit Host-Weiche (S8 → neutraler „Zur Startseite"), technische
tenantId-Wörter, billing.account („Abo" ist dort der Vertrag).

**Flag an David:** noPlanLabel wurde auf den G5-Wortlaut gezogen, obwohl die
Notiz vom 2026-08-09 den damaligen Wortlaut schützte — F49/Matrix streichen
„Free Plan" ausdrücklich; Revert wäre eine Zeile.

**Gelernt:** (1) Der lokale Gate-Satz war UNVOLLSTÄNDIG — die CI-Lint fährt
zusätzlich check:doc-links (und check:themes): drei tote Verweise aus dem
F3-Archiv-Umzug hielten den Deploy auf. check:doc-links gehört ab jetzt in
die lokale Runde, und JEDER Datei-Umzug in docs/ zieht seine Verweise mit.
(2) Das gefixte Deploy-Gate hat sich zweimal bewiesen: einmal ehrlich NEIN
(Lint rot → kein Deploy) und einmal selbstständig JA nach Warten.

### AP3 — U5 (Community umbenennbar) + F56 (Nachricht-schreiben-Knopf) ✅ 2026-08-13

**U5:** Karte „Name und Beschreibung" ganz oben auf dem Reiter „Allgemein",
`PATCH /api/community/profile` → Service-Naht → control (Secret+JWT+Site-Rolle,
Nachbar-Muster), KEINE Migration. Der D6-Spiegel wurde BEWUSST NICHT
erweitert — Agenten-Fund: community_branding ist read(any)/anonym auflistbar
und verbietet identifizierende Felder wörtlich (verify-site-branding §12
ginge rot); Live-Gefühl kommt aus Resolver-Cache + optimistischem Update im
speichernden Fenster. Namens-Grenzen an den KUNDEN-Anlagepfad genagelt
(min 2 — sonst stellte Umbenennen Zustände her, die das Anlegen verweigert).
**F56:** neuer core-Registry-Vertrag `pukalani.chrome.authorActions`
(Glocken-Muster: niemand importiert jemanden) — der messages-Layer meldet den
Knopf an, PostCard (Feed+Discussions) und CommentItem rendern ihn neben
fremden Autorennamen; Tore: Owner-Schalter (ab Werk aus) + messages.write.
authorHandle wird gebündelt angereichert (eine Abfrage je Seite, kein N+1).
Live: profile-Routen 401 ohne Session, Hosts gesund — und der erste
NATÜRLICHE Deploy nach dem Gate-Fix lief ohne manuellen Hebel durch.

**Gelernt:** (1) Ein Auftrag kann falsch liegen: der Brief verlangte den
Namen im D6-Spiegel — der dokumentierte Anonymitäts-Vertrag der Tabelle
schlägt den Brief, und der Agent hat richtig widersprochen statt gebaut.
(2) Grenzwerte immer an den PFAD nageln, mit dem sie koexistieren
(Umbenennen ↔ Kunden-Anlage), nicht an den bequemsten.

### AP2 / U4 — Die Ankunft in der neuen Community ✅ 2026-08-13

Fünf Teile, live seit 0cce9167 (der Deploy brauchte den vierten Gate-Skip —
der ist seither GEFIXT, eigener Eintrag): (1) Willkommens-Checkliste mit den
fünf entschiedenen Punkten (Beitrag · Farbwelt · Einladen · Startseite ·
Abo), je aus VORHANDENEN Daten berechnet (keine neue Tabelle, keine neue
Naht), nur team.manage, ausblendbar; (2) Erst-/Wiederkehr-Begrüßung
(Konto-Alter-Heuristik, 0 Abfragen), Emoji vor leerem Moderationsstapel raus,
CoreEmptyState statt nacktem Gedankenstrich; (3) „Deine Community steht"-Mail
(Adresse, Dashboard-Link, account.-Hinweis, Testphasen-Ende — fail-soft, darf
Links tragen: Bestätigung einer Handlung von eben, kein Scam-Muster);
(4) Startseiten-Saat in BEIDE Sprachen + S6-Schlüssel-Umbenennung;
(5) Beispiel-Beitrag im Feed über den neuen core-Vertrag
`registerCommunityFirstContentProvider` — ableitbare Zeilen-Id
`wp-<tenantId>` ist zugleich Idempotenz und Wiedererkennung, damit die Saat
den eigenen Checklisten-Punkt NICHT abhakt (und ein gelöschtes Beispiel den
Punkt nicht verschenkt: Soft-Delete mitgedacht).

**Gelernt:** (1) Eine Checkliste, deren Saat sich selbst als „erledigt"
zählt, ist eine Attrappe — Wiedererkennung gehört in die Id, nicht in eine
Marker-Spalte. (2) Der A14-Wächter hat den direkten posts-Import ZWEIMAL
gefangen, bevor er ins Repo kam — der Registry-Vertrag war der richtige Weg.
(3) `billingStatus` gehört in den Mandanten-Kontext: jede Herleitung aus
plan/trialEndsAt hätte zahlenden Kunden „Abo abschließen" gezeigt.

### Deploy-Gate-Skip (der eskalierte Krümel) ✅ 2026-08-13

VIER stille Skips an zwei Tagen (AH-3, AH-7, AH-4, AP2): das Gate schaute
EINMAL, ob Test+E2E grün sind — der frühe workflow_run-Trigger sah den
anderen Lauf noch offen (go=false), und der späte Trigger scheiterte an der
if-Bedingung, sobald ein schneller Folge-Push den überholten Prüflauf
CANCELLED hatte. Niemand deployte, und das Lauf-Fazit sah trotzdem grün aus
(Job nur geskippt). Fix: die Vorprüfung POLLT bis 30 Minuten — ein Trigger
reicht; cancelled bleibt ein ehrliches Nein (der Nachfolger-Commit deployt
selbst). **Gelernt:** (1) Ein „success" am LAUF beweist nichts über die JOBS —
Wachen müssen die Job-Conclusions lesen. (2) Ein Gate, das auf zwei
asynchrone Ergebnisse angewiesen ist, darf nicht vom Timing seiner Trigger
abhängen — warten gehört ins Gate, nicht in die Hoffnung auf den zweiten
Anlauf.

### AH-6 / F3 — comments-Silo → Pool ✅ 2026-08-12

Das letzte Kunden-Silo ist eingeschmolzen: comments.pukalani.app ist eine
Pool-Community im Projekt `account` (plan pro ohne Abo, oeffentlich, Owner
David), bedient von apps/platform via nginx-Proxy der alten Site (Rollback =
eine proxy_pass-Zeile, Site-Loeschung bleibt Davids Panel-Klick). Nutzer:
1 Auto-Merge (beidseitig verifizierte Adresse, Davids Kommentare auf die
Pukalani-ID umgeschrieben), 1 Uebernahme mit Hash + Id-Erhalt, 0 Einzelfaelle.
Alle Inhalts-Tabellen Quelle=Ziel-verifiziert; apps/comments bleibt als CODE
der E2E-Anker (photos-Muster) — e2e.yml nachweislich unberuehrt. Details:
docs/runbooks/F3-CUTOVER.md, Plan jetzt in docs/archiv/F3-COMMENTS-POOL.md.
Danach existieren genau ZWEI Auth-Welten: account (alle Menschen) und
admin (Betreiber); portfolio bleibt Davids eigenes Silo.

**Gelernt:** (1) Ein universeller Mandanten-Stempel im Kopier-Werkzeug trifft
auch GLOBALE Tabellen (account_handles, 400 Unknown attribute) — Stempel-
Entscheidung gehoert je Tabelle in den Plan, nicht in die Schleife.
(2) Runtime- und Migrations-Keys haben je Instanz VERSCHIEDENE Scope-Saetze
(comments-Runtime ohne tables.read, Migrations ohne users.read) — Migrations-
Werkzeuge brauchen deshalb Env-Flags JE PHASE. (3) Der Inventar-Lauf mit
fail-loud auf Tabellen ohne Plan-Zeile hat fuenf vergessene Betreiber-
Alt-Tabellen gefunden, BEVOR sie stillschweigend mitgezogen wurden.

### AH-4 — Cutover control. → admin. ✅ 2026-08-12

Die Betreiber-Konsole heißt admin.pukalani.app; control. antwortet 301 mit
Pfad+Query. BEWUSST als Alias-Cutover statt Site-Umzug (die studio→control-
pm2-Falle war die Lehre): ploi-Site/Verzeichnis/Prozess behalten den Namen
control.pukalani.app als Infra-Anker, deploy.yml trennt Site (rsync) von
Probe-Host (Serien-Probe gegen admin.). Die 301-Middleware ist app-eigen —
der Agent belegte DREI stille Brüche, die der tenancy-Config-Weg verursacht
hätte (Konto-Menü, Glocken-Publikum, Trichter-Ereignisse). Zertifikat per
acme.sh/DNS-01 mit automatischer Verlängerung inkl. ploi-Upload-Hook;
Stripe-Webhook per API umgehängt. Details/Messwerte: ADMIN-CUTOVER.md.

**Gelernt:** (1) ploi-HTTP-01 scheitert für ALIASE wirklich (zweimal
gemessen) — der Token-Weg (acme.sh dns_cf + ploi-Custom-Upload + Renew-Hook)
ist jetzt das wiederverwendbare Rezept. (2) Cloudflare vor ploi.io blockt
python-urllib (1010) — curl mit Browser-UA. (3) Der Deploy-Gate-Skip trat
zum DRITTEN Mal auf; der Krümel steht auf Hoch. (4) Cloudflare-Token-Werte
sind nach der Erstellung NIE wieder einsehbar — und bestehende Tokens nie
„rollen", einer davon verlängert das Kunden-Wildcard.

### AH-7 — Der konto-weite @handle ✅ 2026-08-12

Eine Pukalani-ID = EIN Handle überall: `account_handles` (system-031, Unique
global auf handleLower, Historien-Zeilen wie beim Bestand), Übernahme „je
Konto der älteste aktive Community-Handle; global vergeben ⇒ kein Eintrag,
neu wählen im Formular" — nichts umbenannt, nichts zerstört.
Auflösungs-Kette: Konto-Register (publikums-gefiltert auf die Community) →
Community-Alt-Bestand. `/profile` trägt das echte Formular
(`PATCH /api/account/handle`, exakter Präfix), die alte per-Community-Route
ist entfernt (einziger UI-Konsument umgestellt, Beweise nachgezogen).
Migration VOR dem Deploy auf allen vier Instanzen. Live 3x-Serie: neue Route
401, alte Route 404, Such-Gate 401.

**Sicherheitsfund im Bau:** `/api/handles/search` hielt die Community-Grenze
nur über Row-Permissions — ein Leser mit Labels MEHRERER Communities hätte im
Erwähnungs-Menü von B die Mitglieder von A gesehen. Jetzt:
`requireCommunityMembership`-Gate + Publikums-Filter.

**Gelernt:** (1) Vor neuen Registry-/Vertragsnamen IMMER greppen — es gab
schon einen mandanten-gescopten Aktivitäts-Vertrag (AH-3) und hier fast
dieselbe Falle bei den Beweis-Skripten. (2) Das Deploy-Gate hat den
gate:success/deploy:skipped-Fehler ZUM ZWEITEN MAL gezeigt — Krümel auf Hoch
eskaliert; der workflow_dispatch-Hebel bleibt der Ausweg. (3) Bekannter,
dokumentierter Preis der Globalisierung: gehörte ein @name in einer Community
historisch jemand anderem als dem globalen Gewinner UND ist der Gewinner dort
Mitglied, zeigt ein Alt-Beitrag jetzt auf den Gewinner.

### AH-5 — Freelancer Community + demo-Vollausbau ✅ 2026-08-12

Davids Kurskorrektur bei der Anlage: die Werkstatt heißt NICHT master.,
sondern **freelancer.pukalani.app** („Freelancer Community", Beitritt offen,
Plan pro) — `master` bleibt deshalb in RESERVED_SUBDOMAINS (die kurze
Streichung 9701bfa9 wurde noch am selben Abend zurückgenommen, ca7bafdc).
Angelegt über eine server-seitige Operator-Session (Custom Token → Session →
`POST /api/control/tenants`; Secrets blieben auf dem Server, alle
Wegwerf-Sessions danach gelöscht). `demo.` lief bereits auf pro — der
Vollausbau war schon gegeben. Live: freelancer. antwortet 200 mit Namen im
SSR-HTML. Kein Deploy nötig (`freelancer` stand nie auf der Sperrliste).

**Gelernt:** Die control-App antwortet in ihren eigenen Routen mit `id`,
nicht `$id` — ein Skript, das Appwrite-Konventionen erwartet, stolpert nach
dem ERSTEN Erfolg (Community war angelegt, der Rest des Skripts starb; der
Nachlauf musste beide Feldnamen können).

### AH-3 — /profile/activity + Konto-Abrechnung ✅ 2026-08-11

Eigene Aktivität über alle Communities (`/profile/activity`): neuer
Registry-Vertrag `registerAccountActivityContributor` (GDPR-Muster), gefüllt
von posts/comments/events/courses; Route `/api/account/activity` als EXAKTER
controlApiPrefixes-Eintrag (kein Verzeichnis — Segmentgrenze, live 404-belegt
für Nachbarn), userId NUR aus der Session, Besitz doppelt gefiltert
(Query + Zeilen-Nachprüfung), Community-Hosts über den gebündelten Resolver.
Dazu `/settings/billing` als Owner-Übersicht (Plan/Testphase je Community,
Links in die Community-Plan-Seiten — KEIN neuer Zahlpfad, M13/A6 unangetastet).
Live 8/8 im Worktree; Prod 3x-Serien-Probe gruen.

**Der Weg zum Deploy war die eigentliche Geschichte:** (a) das Deploy-Gate
wertete den AH-3-Commit als „nichts zu deployen" (deploy-Job skipped bei
gruenem Gate — vermutlich vom schnellen Doku-Push in der concurrency-Gruppe
gestoert; Kruemel unten). (b) Danach VIER rote Deploys durch tote
fonts.gstatic-URLs: Googles CDN/Metadaten liefen auseinander, die Runner
loesten konsistent stale URLs auf, waehrend dieselbe Aufloesung lokal
funktionierte. Zwischenloesung: platform manuell nach CI-Rezept geflippt
(rsync → Symlink → pm2, 3x-Serien-Probe). Dauerloesung: deploy.yml saet den
@nuxt/fonts-Cache (WOFF2s UND meta/*-data.json mit den aufgeloesten URLs)
vom Prod-Server (~/fonts-cache) und schreibt NUR ADDITIV zurueck — der
naechste CI-Lauf war gruen mit NULL fonts.gstatic-Zugriffen im Log.

**Gelernt:** (1) Es gab schon einen ZWEITEN, mandanten-gescopten
Aktivitäts-Vertrag (`registerUserActivityProvider`, comments/F1-Stufe-3) —
der Agent hat ihn erst überschrieben (Auto-Import lautlos beschattet, Lint UND
Typecheck blieben grün!), dann wiederhergestellt und die neue Oberfläche auf
`AccountActivity*` umbenannt; beide Verträge tragen jetzt
Abgrenzungs-Kommentare. Vor neuen Registry-Namen: erst greppen. (2) Verfasste
Events/Kurse bewusst ausgelassen — ohne Index auf organizerId/authorId wäre
das ein Pool-weiter Scan je Seitenaufruf (Kandidat für eine spätere additive
Index-Migration).

### AH-2 — Der Account-Bereich auf account.pukalani.app ✅ 2026-08-11

Gebaut als GETEILTE Flächen statt Kopien (Davids Vorgabe „ein Account-Layer
überall"): `/` ist eine echte Account-Startseite (Weiche in der App-Seite,
Host-stabil, kein Hydration-Zweig; `?code=` schlägt weiter alles), `/profile`
rendert dieselbe `UserProfilePanel` wie die Dashboard-Konto-Hülle, `/settings`
hat vier Reiter — Sicherheit (nur noch Passwort), Sitzungen,
Benachrichtigungen und NEU „Daten" (Export + Konto löschen, Audit M10, an
BEIDEN Orten). Mandanten-Hosts sperren die Konto-Pfade per
`controlOnlyPaths` (exakte Segmente, kein startsWith-Übergriff auf z. B.
`/settings-der-community`). Live-Proben 6/6: Redirect-mit-`?redirect=` auf
allen neuen Pfaden, demo./profile 404, demo./ unberührt.

**Offen daraus:** der @handle ist je Community vergeben — `/profile` zeigt
ihn als Auskunft, nicht als Formular; ein konto-weiter Handle wäre eine
Datenmodell-Entscheidung (Frage an David gestellt).

**Gelernt:** (1) `useHead` UNTER dem script-Block ist toter Text — der
SFC-Compiler verwirft ihn still; zwei Bestands-Seiten waren so titellos
(Dashboard-Audit M6 hatte es schon einmal an anderen Dateien gezeigt — beim
Bauen neuer Seiten den Block-Ort prüfen). (2) Der Shell-Arbeitsordner der
Session springt gelegentlich auf das Haupt-Repo zurück — Push/Gates aus
Worktrees IMMER mit explizitem Pfad (`git -C <worktree>`), sonst prüft man
alten Code oder pusht den falschen Stand.

### AH-1 — EIN Cutover: Projekt pool→account + Host my./start.→account. ✅ 2026-08-11

**Davids „go" um die Mittagszeit, live um kurz nach Mitternacht** — der ganze
Cutover an einem Tag, weil der Moment einmalig günstig war: genau 2 Konten
(beide OTP-only, keine Passwort-Hashes nötig), 87 Zeilen, 3 Dateien.
Ablauf + Messwerte: [ACCOUNT-CUTOVER.md](runbooks/ACCOUNT-CUTOVER.md) (alle
Kästchen dieses Laufs abgehakt). Kern: Wegwerf-Provisioner nach Memory-Rezept
→ Projekt `account` in Davids Team (Wildcard-Plattform SOFORT — F45-Falle) →
volles Schema über den Runner → Kopie (Nutzer+Labels+Prefs, Rows mit
$permissions, Buckets+Dateien) → Delta leer → Env-Patches + Deploy `ce2dd5b0`
→ 7/7 Live-Proben → Wartungs-Mail OHNE Link (Davids Vorgabe; 1 gesendet, das
example.com-Seed-Konto blockt Resend mit 550) → Provisioner/Temp-Keys
rückstandslos entfernt. `pool` bleibt eingefroren als Fallback; die 301 der
Altnamen erhält Pfad+Query (Einladungs-Links!). Code-Paket: 3 Commits
(Redirect-Regel pur+getestet, Ziel NIE aus dem Request, Schleifen-Sperre).

**Gelernt:** (1) **Bucket-Anlage fehlt in den Migrationen** — avatars und
gdpr-exports existierten nur von Hand; in jeder frischen Instanz fehlen sie
(Krümel in OPEN-ITEMS). (2) Das Provisioner-Rezept braucht neben
WHITELIST_ROOT auch **WHITELIST_EMAILS** (Signup-550; Memory ergänzt).
(3) `getFileDownload` des Server-SDK liefert keinen Buffer-tauglichen Typ —
Datei-Kopien per REST. (4) Resend verweigert `example.com`-Empfänger (550) —
Seed-Konten von Massen-Mails ausnehmen.

### AP1 — Trichter dicht: U18 + U1 + U2 + U3 ✅ 2026-08-11

Vier Punkte als EIN Paket (Branch `ap1-trichter`, zwei Opus-Agenten, jede
Behauptung am Code nachgeprüft), live seit `2c183d65`:

- **U18 — Funnel-Events.** Sieben benannte Ereignisse
  (`core/shared/funnelEvents.ts`, `useFunnelEvent()` — meldet NUR über das
  eingebundene `window.plausible`, kein eigener Transport, SSR-frei).
  Marketing misst sofort; **5 der 7 Ereignisse auf my./start. schlafen**, bis
  die Kontroll-Hosts eine Plausible-Site haben — bewusst KEINE Script-Id
  erfunden; Entscheidung zurückgestellt und in ACCOUNT-HORIZONT.md notiert
  (sinnvoll erst nach AH-1, sonst trüge die Site den alten Hostnamen).
- **U1 — Die Code-Wand hat einen Ausgang.** `noCode` verlinkt die
  Anfrage-Seite (über den Routen-NAMEN, s. Gelernt), das onboarding-Layout
  hat ein Konto-Menü mit Abmelden, `guest.ts` respektiert `?redirect=`
  (`safeRedirectTarget` — der „schon angemeldet"-Fall aus der Einladungs-Mail
  landet jetzt bei seiner Einladung).
- **U2 — Das Tor hat einen Schalter.** `app_config.onboardingInviteOnly`
  (system-030, VOR dem Code-Deploy auf allen vier Instanzen gefahren),
  Betreiber-Schalter auf `/dashboard/invites` (`sites.manage`, auditiert),
  Durchsetzung server-seitig in `site.post.ts`/`precheck` (offenes Tor prüft
  UND verbraucht keinen Code — er soll gelten, wenn das Tor wieder schließt),
  fail-safe-Kette control→platform→marketing (nur ein AUSDRÜCKLICHES `false`
  öffnet, nur Erfolge werden gecacht), Landing liest den Zustand dynamisch,
  Register-Seite trägt den Early-Access-Hinweis über die neue
  `pukalani.auth.notices`-Registry.
- **U3 — Kaufabsicht landet nicht mehr im Passwortfeld.** `marketingRequestUrl`
  (`/request-access`, nicht `/anfragen` — Sprachpfade!), Preis-CTAs →
  `/register`, Early-Access-CTAs → Anfrage-Seite, „Anmelden" im Header.
  Studio-CTA blieb bewusst auf `#kontakt` (Entscheidung 2026-08-09).

**Beweise:** fünf Gates lokal UND in CI grün (inkl. E2E gegen
Wegwerf-Appwrite, TLS-Wächter), Live-Messung: `pukalani.app/api/gate` und
`my.pukalani.app/api/onboarding/gate` antworten `{"inviteRequired":true}`;
Landing EN/DE zeigt „Request access“/„I have a code“ bzw. „Zugang
anfragen“/„Ich habe einen Code“ je 3×; das Register-SSR trägt den Hinweis.

**Gelernt:** (1) `localePath('/pfad')` ist auf Seiten mit
`defineI18nRoute`-Sprachpfaden eine 404-Falle — auf EN kommt der rohe Pfad
unverändert zurück (im Worktree beidsprachig nachgemessen; der Agent hätte
den toten Link ausgeliefert). Links auf solche Seiten IMMER über den
Routen-Namen: `localePath({ name: '…' })`. (2) `pnpm check:bilanz` läuft in
der CI-Lint, aber NICHT im lokalen `pnpm lint` — jede neue `server/api`-Route
ändert die Routen-Zählung der Produkt-Bilanz; gehört ab jetzt in die lokale
Gate-Runde. (3) Ein roter Deploy kann reiner Upstream sein: fonts.gstatic
lieferte einmalig 404 auf eine Inter-Datei, der Wiederholungslauf war grün —
erst diagnostizieren, dann fixen.

---

### U13 — Eigene Domain bleibt ab Pro (Entscheidung, kein Code) ✅ 2026-08-10

**Frage** aus dem Wettbewerbs-Benchmark (E3): Pukalanis Domain-Sperre auf Pro
(149 €) ist die härteste im Vergleichsfeld — Ghost gibt die Domain auf jeder
bezahlten Stufe ab 18 $, Circle im Einstiegsplan (89 $), Bettermode und coapp
ab Starter; nur Skool bietet gar keine an. Für Verein und Coach ist die eigene
Adresse oft *der* Grund zu zahlen.

**Davids Entscheidung** (strukturierte Frage, 2026-08-10): **bleibt Pro-only.**
Pro behält damit sein stärkstes Verkaufsargument neben Team/KI/Kursen, und der
Zertifikats-/Prüf-Betrieb wächst nicht mit der Personal-Kundschaft.
**Verworfen:** 1 Domain ab Personal + mehrere ab Pro (die Audit-Empfehlung) ·
unbegrenzt auf allen bezahlten Stufen.

**Folgen statt Code:** die Preisseiten-Vergleichstabelle (U10) führt die Zeile
„Eigene Domain — ab Pro" ehrlich, und die Pro-Domain wird als Ausgleich
hochwertiger gemacht (U16: CAA-Prüfung, Registrar-Anleitungen, TTL-Hinweis,
Auto-Nachprüfen).

### Doku-Abschluss der Woche 2026-08-04..09 ✅ 2026-08-09

**Davids Auftrag** als Abschluss der Launch-Vorbereitung: Kunden-Hilfe und
interne Doku auf den Stand der Woche bringen, Ausgeführtes archivieren.

**Kunden-Hilfe** (`apps/help/content/**`, nur Deutsch). Die Discussions-Seite
war an fünf Stellen unwahr geworden: 16 Abzeichen statt 22 (der Katalog hat
seit den Vertrauensstufen eine VIERTE Gruppe), „jedes Abzeichen genau einmal"
(es gibt jetzt `awardedPer: 'content'` je Beitrag und `'membershipYear'` je
Jahr), „Pukalani meldet sich nicht" (es gibt `notify()` mit
`type: 'badge.awarded'`), „kein Neues-Thema-Knopf" (`DiscussionNewTopic` steht
auf Index und Kategorie-Seite) und „**Keine** Vertrauensstufen" in der
Negativliste — die vier Stufen sind gebaut. Dazu neu: Abschnitt *Erwähnungen*
und zwei neue Seiten, *Private Nachrichten* und *Eigene Domain*. Auf der
Rollen-Seite fiel ein zweiter Klassiker auf: die Warnung „Rollenwechsel läuft
derzeit noch über uns" stand dort, obwohl `/dashboard/community/members`
Einladen, Rolle ändern, Zugang entziehen und Besitz übertragen längst selbst
kann.

**Interne Doku.** `CUSTOMER-FEEDBACK.md` und `VOKABULAR-AUFRAEUMEN.md` nach
`docs/archiv/` (beide ausgeführt; bei der ersten war die Bedingung, die ihr
eigener Kopf für den Umzug nannte — „solange die Migration aussteht" —, seit
`control-032` erfüllt, mit vier späteren `control`-Migrationen darüber).
`DISCUSSIONS-KONZEPT.md`, `PRIVATE-NACHRICHTEN-KONZEPT.md`, `DASHBOARD-IA.md`
und `CHANGELOG-3.0.0-ENTWURF.md` bleiben mit korrigiertem Kopf. OPEN-ITEMS von
343 auf ~250 Zeilen gekürzt (vier Erledigt-Blöcke raus, die COMPLETE ohnehin
trägt), Zähler nachgezählt statt fortgeschrieben. Neu als Referenz:
`docs/referenz/EIGENE-DOMAIN.md` — es gab dafür weder einen CLAUDE.md-Absatz
noch ein Referenz-Dokument, nur ein (operatives) Runbook. Für
Handles/Erwähnungen wurde **bewusst keines** angelegt: CLAUDE.md trägt sie
bereits ausführlich.

**Zwei untracked Lücken gefunden und als offene Punkte eingetragen:** **F56**
(der in § 1 des PN-Konzepts zugesagte Einstieg „Nachricht schreiben" neben dem
Autorennamen — `MessageWriteButton.vue` ist gebaut, aber nirgends verdrahtet)
und **F57** (Teil 4 des Discussions-Konzepts führt Emoji-Reaktionen,
Mitglieder-Einladungen und das Tages-Like-Limit als „gebaut", es gibt sie
nirgends).

**Beweise:** eigener help-Dev-Server aus diesem Worktree, alle geänderten und
neuen Seiten mit 200 und den erwarteten Werten gerendert; `check:doc-links`
nach JEDER Verschiebung, `check:i18n-keys`, `check:manifests`, `check:bilanz`,
`pnpm -r test` und `pnpm -r lint` grün.

**Gelernt:** Eine Hilfe-Seite altert an ihren **Verneinungen** am schnellsten.
Zahlen („16 Abzeichen") fallen beim Lesen auf, aber ein Satz wie „Keine
Vertrauensstufen" oder „läuft derzeit noch über uns" liest sich auch dann
plausibel, wenn er seit Wochen falsch ist — er beschreibt ja eine Abwesenheit,
und die prüft niemand nach. Beide Fundstellen waren genau das. Regel: bei
jedem Doku-Durchgang zuerst die Negativlisten und die „noch nicht"-Sätze gegen
den Code halten, nicht die Beschreibungen. Und zweitens: eine Zusage wie „F1
ist KOMPLETT" ist ein **Prüfauftrag** — dieselbe Falle wie bei der
M13-Aufzählung; Teil 4 des Konzepts nannte vier soziale Mechaniken als gebaut,
gebaut war eine.

---

### F53-Nachtrag — Die drei WCAG-Hell-Befunde entschieden und behoben ✅ 2026-08-08

**Ausgangslage.** F53 hatte drei HELL-Bestandswerte der Marketing-Landing
unter AA gefunden und bewusst als Befund liegen lassen (Optik-Entscheidung
Davids). David hat heute per strukturierter Frage entschieden — dreimal die
Empfehlung, keinmal „bewusst lassen" (DECISION-LOG 2026-08-08):

**1 · Kicker/Link-Akzent → puka-800.** puka-600 (#e96c0c) als Schrift auf
den tone-Flächen maß 2,43–2,83:1; jetzt zeigt die STUFE im hellen
`.marketing-site`-Scope auf puka-800 (#983912, 5,48:1 auf sun-hold/noon bis
6,38:1 auf dawn/cloud) — exakt das Spiegelbild der Dark-Verschiebung aus B7,
die ~30 `text-primary-600`-Klassen bleiben unverändert (puka-theme.css).
DREI Folgen, die dazugehören: (a) die zwei FLÄCHEN-Konsumenten der Stufe
(`--puka-step-fill`, `--puka-plan-glow`) nennen jetzt je Modus ihre ROHE
Ramp-Stufe, sonst hätte die Hell-Verschiebung sie grundlos verdunkelt — der
alte Fußkommentar „die Verschiebung wirkt auch auf Flächen, das ist gewollt"
galt nur für dunkel und ist umgeschrieben; (b) vier direkte
`hsl(var(--puka-sun-deep))`-TEXT-Stellen (Kicker, Vergleichstabellen-Kopf,
Quellen-Links, Hero-Mock-Datum) zeigen jetzt auf `var(--ui-color-primary-600)`
und folgen damit BEIDEN Modus-Verschiebungen; Schatten/Verläufe bleiben auf
dem Tripel; (c) die ~10 `text-primary-600`-Icons und das „−25 %" werden hell
sichtbar gedeckter — bewusst mitgenommen.

**2 · CTA-Label → dunkle Tinte in beiden Modi.** Weiß auf der Sonne maß
1,81:1 (B7-Bestand); `--puka-cta-label` ist hell jetzt `hsl(var(--puka-ink))`
(9,34:1), der Dark-Block behält seinen LITERAL-Wert `hsl(220 40% 11%)`
(8,4:1) — er darf NICHT auf das Tripel vereinheitlicht werden, weil
--puka-ink im Dunkeln hell dreht.

**3 · Preis-Kleinzeile → toned/85.** `billingPeriod` (12,5 px) maß mit /70
nur 3,47:1 auf der Plan-Karte (#fefaf5); /85 misst 4,90:1, die PAngV-Zeile
darunter bleibt mit vollem toned (7,13:1) bewusst kräftiger.

**Beweise:** Kontraste per WCAG-Formel gerechnet (Skript, Werte oben);
lint + typecheck marketing 0; Browser-Beweis am Worktree-Dev-Server
(Port 3025, berechnete Farben): hell Kicker/primary-600 = puka-800,
CTA-Label rgb(20,29,46), billingPeriod toned/0.85, Step-Verlauf unverändert
500→600 — dunkel bitgenau wie vorher (600→puka-400, Step 500→400, Glow
puka-400, CTA-Literal 11 %). **Gelernt:** Wer eine Theme-Stufe je Modus
verschiebt, muss ihre FLÄCHEN-Konsumenten explizit machen — die
Dark-Verschiebung nahm die Flächen absichtlich mit, die Hell-Verschiebung
hätte dieselbe Mechanik zum Fehler gemacht; seither nennen Flächen ihre
Ramp-Stufe direkt und nur Schrift läuft über die verschobenen Aliase.

### F54 — Silo-Domain scharf: pukalani.studio ist die kanonische Adresse ✅ 2026-08-10

- **Freischaltung abgeschlossen** (Klick „Prüfen" im Control-Dashboard → `active`). Live nachgemessen statt der Anzeige geglaubt: `pukalani.studio` antwortet 200, `portfolio.pukalani.app` leitet **301** dorthin, und `canonical` zeigt auf **beiden** Hosts auf `https://pukalani.studio/…` — der `originFromRequest`-Schalter der App tut also genau das, wofür er eingebaut wurde (Audit-Befund B1 in Silo-Gestalt). Zertifikat: EINE Lineage mit drei SANs (`portfolio.pukalani.app`, `pukalani.studio`, `www.pukalani.studio`), 87 Tage Restlaufzeit.
- **Dabei gefunden und geschlossen — der Wächter kannte die Kundendomain nicht.** `scripts/ops/verify-tls.mjs` überwachte nur Hosts der Zone `pukalani.app`; `pukalani.studio` liegt außerhalb und ist von der Wildcard **nicht** gedeckt. Eine gescheiterte Erneuerung hätte die Kundendomain getötet, ohne dass ein einziger Eintrag rot geworden wäre — die Lücke war exakt so groß wie der Nutzen der eigenen Domain. Jetzt 13 statt 11 Hosts (`pukalani.studio` + `www`), Lauf grün.

**Gelernt:** Eine eigene Domain ist nicht nur ein DNS- und ein Zertifikats-Vorgang, sondern auch ein ÜBERWACHUNGS-Vorgang. Die Wildcard-Bequemlichkeit der eigenen Zone endet an der Zonengrenze: jeder Kundendomain-Host muss beim Freischalten in den TLS-Wächter — sonst wächst mit jedem Kunden ein blinder Fleck, der genau dann auffällt, wenn seine Seite schon tot ist.

### P13 — Portfolio-Relaunch: pukalani.studio trägt wieder die volle Freelancer-Site ✅ 2026-08-09

- **Inhalte des alten Repos `nuxt4-portfolio` vollständig ins Monorepo portiert** (`apps/portfolio`): Homepage mit 11 Sektionen (Leistungen & Preise, Prozess, Referenzen, FAQ …), `/ux-audit`, `/nuxt-entwickler-freelancer`, zwei `/wissen`-Guides — Texte, JSON-LD-Graph und SEO-Struktur 1:1, visuell ins bestehende Syne/Glibbergreen-Design eingepasst. Zweisprachig nach Monorepo-Konvention (EN auf `/`, DE unter `/de`, alte `/en/**`-Adressen 301); die vorher DE-only-Unterseiten bekamen neu übersetzte EN-Fassungen. Content als typisierte Datenmodule (cases.ts-Muster); `robots.txt`/`llms.txt`/Sitemap waren vorher live 404. Inhalts-Stichprobe gegen die Quelle: null Abweichungen bei allen Preisen/Kennzahlen.
- **Impressum/Datenschutz über den pages-Layer statt des toten `imprint.pdf`-Links**: Entwurfs-Vorlagen je de/en geseedet (`packages/pages/scripts/seed-legal-pages.ts` — Silo-Gegenstück zum Pool-Backfill, dieselben `legalTemplates`), App-Override `[slug].vue` rendert CMS-Seiten im Site-Chrome, der Footer verlinkt nur Veröffentlichtes. Prod-Migration bewusst VOR dem Code-Deploy.
- **Doppel-Review (Konzept + Code/Security) mit drei Fix-Paketen, alle live**: A Sicherheit (Sitemap-Origin über `resolveSeoOrigin` + XML-Escape gegen Cache-Poisoning, JSON-LD-Origins auf dieselbe Regel, Slug-Encoding + 404 bei Client-Slug-Wechsel auch in der Layer-Fassung, robots-Regel, Lockfile-Beifang zurückgeschnitten) · B Struktur (SEO-Kopf 1× statt 5×, robots/llms als generierte Routen aus den Datenmodulen, `LEGAL_PAGE_SLUGS` geteilt, Footer-Fallback-Rechtslinks bei Appwrite-Ausfall, Microcache auf `/api/pages/public` mit Write-Invalidierung, Sitemap nimmt veröffentlichte CMS-Slugs) · C Tests (22 E2E inkl. 301-Regeln und SEO-Routen, Paritäts-Wächter über die sechs zweisprachigen Datenmodule — per eingeschleuster Lücke bewiesen, dass er fängt).
- **Bewusst offen**: og-PNG-Verkleinerung (kein pngquant auf der Maschine), Footer-Entkopplung von `home.ts` (−14,9 KiB gzip je Unterseite, Preis: die gerade deduplizierte Label-Quelle teilte sich wieder), EN-Texte von David gegenlesen; Rechtstexte = OPEN-ITEMS A1. Altes GitHub-Repo `nuxt4-portfolio` archiviert.

**Gelernt:** Ein Deploy-Wächter muss eine Bedingung prüfen, die NUR der neue Stand erfüllen kann — zwei „live"-Fehlalarme kamen daher, dass die alte statische llms.txt bzw. ein längst ausgelieferter String die Bedingung ebenfalls erfüllten. `gh run list --limit N` verliert die relevanten Läufe, sobald TLS-Wächter-Läufe das Fenster füllen — je Workflow abfragen; `cancelled` heißt meist „von neuerem Commit abgelöst", nicht rot. Und: vor jedem Commit den BRANCH prüfen — der geteilte Checkout stand auf dem Arbeitsbranch der Nachbar-Session, der Commit landete erst dort und musste per Cherry-pick aus einem Temp-Worktree sauber nach `main` (Branch-Zeiger danach zurückgesetzt, fremde Arbeit unberührt).

### F54 — Silo-Domain-Erstlauf: vier Fehler, die lokal unsichtbar waren ✅ 2026-08-08

**Was passiert ist.** Der erste echte Domain-Umzug (`portfolio.pukalani.app`
→ `www.pukalani.studio`) hat vier Fehler gefunden. **Keiner davon war lokal
sichtbar** — die Vorbeweise standen bei 46/46 (Pool) und 35/35 (Silo). Die
Domain läuft inzwischen (Zertifikat über alle drei Namen, Origin-Proben
antworten 401); offen war beim Abschluss dieses Pakets nur noch der
Freischalt-Klick nach dem Deploy (steht als eigener Punkt in OPEN-ITEMS).

**1 · Der Abschluss hing am falschen Messwert.** `POST/GET
/v1/projects/:id/platforms` verlangt einen Scope, den weder der Runtime- noch
der Migrations-Key hat (`401 general_unauthorized_scope`). Die lokale Messung
lief mit einem Dev-Key mit ALLEN Scopes — in Produktion scheiterte der letzte
Schritt der Freischaltung damit **immer**. Fix: eintragen wird weiter
VERSUCHT (fail-soft), der ERFOLG wird über die **schlüssellose Origin-Probe**
gemessen (`GET /v1/account` mit `Origin:` + `X-Appwrite-Project` — 401 =
akzeptiert, 403 `general_unknown_origin` = fehlt). Pure Regeln in
`packages/core/shared/appwriteOriginProbe.ts`, fail-closed in der Mitte:
5xx, ein 403 aus anderem Grund und „gar keine Antwort" heißen *weiß ich
nicht* und schalten nie frei. Beide Silo-Wege und der Pool-Weg umgestellt.

**2 · Nach einem Fehlschlag wurde nicht mehr nachbestellt.** Silo- und
Tenant-Pfad lasen die ploi-Zertifikatsliste unterschiedlich (`certificateCovers`
nur aktive vs. `coveringCertificate` jeder Status) — zwei Lesarten derselben
Frage an derselben Liste. Jetzt EINE pure Regel `certificateOrderDecision`:
kein deckender Eintrag ⇒ bestellen, bei JEDEM Prüf-Klick; deckender Eintrag
`active` ⇒ still übersprungen; anderer Status ⇒ übersprungen mit Status und
Ausweg (der Klickschutz gegen die LE-Ratengrenze bleibt). `certificateCovers`
ersatzlos entfernt.

**3 · ploi's Alias-API pflegt den Port-80-Block nicht.** Ein Alias landet im
`server_name` des :443-vHosts; die HTTP-Umleitung steht in einer eigenen,
root-eigenen Datei (`/etc/nginx/ploi/<site>/before/ssl-redirect.conf`), die
die API nicht anfasst. Der neue Name fällt auf Port 80 in den 444-Catch-all,
und genau dort holt Let's Encrypt seine HTTP-01-Prüfung ab. Fix: **Preflight
vor jeder Silo-Bestellung** (`acmeChallengeReachable`) — jede HTTP-Antwort ist
ein Ja, gar keine blockiert, und statt der Bestellung kommt der Handgriff in
den Status. Die Sicherung sitzt IN `requestPloiSiteCertificate`, nicht beim
Aufrufer. Auf dem TENANT-Pfad bewusst NICHT (eigener vHost inkl. :80; ein
Preflight direkt nach dem asynchronen nginx-Reload würde falsch blockieren).

**4 · Die gefährlichste Entdeckung: ein gescheiterter Antrag LÖSCHT die
bestehende Zertifikats-Linie der Site.** Nach dem fehlgeschlagenen
3-Namen-Antrag war `/etc/letsencrypt/live/portfolio.pukalani.app/` weg. Die
Site lief nur noch aus dem nginx-Arbeitsspeicher weiter — sie sah völlig
gesund aus, aber jeder Reload scheiterte still (`[emerg] cannot load
certificate`) und ein Neustart hätte sie vom Netz genommen. Der Preflight aus
(3) ist die Absicherung; dazu ein Wiederherstellungs-Rezept im Runbook
(**B7**: Ursache messen, dann **Einzel-Namen-Antrag zuerst**, der die Lineage
unter ihrem alten Namen wiederherstellt und den nächsten Reload heilt) und
eine Korrektur im Kopf von `ploi.ts` — dort stand bis heute, hier werde
„niemals" ein Site-Zertifikat angefordert; seit control-036 stimmt das nicht.

**Außerdem:** `NUXT_ONBOARDING_SERVICE_SECRET` + `NUXT_ONBOARDING_CONTROL_URL`
fehlten auf der portfolio-Site und mussten mitten im Durchlauf nachgetragen
werden — jetzt in der `.env.example` beider Silo-Apps und in der Pflicht-Liste
von `scripts/ops/verify-site-env.mjs`.

**Beweise.** `packages/domains/scripts/verify-domain-settle.mjs` **19/19**,
gegen eine echte Appwrite 1.9.6 und eine echte Silo-App mit einem
**absichtlich scope-losen Schlüssel** — also im Produktionsfall statt in der
lokalen Idealwelt. Darin der Portfolio-Fall selbst: `ok: true`, obwohl die
Registrierung am Schlüssel scheitert. Unit: core 13/13 neu (davon 6 gegen ein
echtes Appwrite-Double, belegt u. a., dass kein Schlüssel mitgeht), control
`siteDomain.test.ts` 33/33 (davon 3 gegen echte HTTP-Server inkl. eines
444-Doubles, das den Socket ohne Antwort zumacht). **Drei Gegenproben, je eine
pro Fix:** `interpretOriginProbe` mutiert ⇒ Live-Beweis fällt auf 17/19 (rot
sind genau die zwei Prüfungen an der Probe); `certificateOrderDecision`
mutiert ⇒ 30/33 (die drei „bestellt"-Fälle); `interpretAcmePreflight` mutiert
⇒ 30/33 (die drei „blockiert"-Fälle).

**Nicht gemessen, und das gehört dazu:** die Bestellung selbst und die
Lineage-Löschung lassen sich lokal nicht herstellen — dafür gibt es kein
Let's Encrypt und kein ploi im Trockenlauf. Fix 2 und 3 sind Unit-bewiesen
(mit echten Sockets), nicht live. Der Abschluss-Klick am Portfolio steht
ebenfalls aus; er passiert nach dem Deploy.

**Gelernt (drei Dinge):**
1. **Ein gescheiterter Zertifikatsantrag ist kein Nicht-Ereignis — er zerstört
   den Bestand.** certbot ersetzt eine Lineage durch die Namen, die man ihr
   gibt; scheitert die Validierung, bleibt sie nicht stehen, sondern
   verschwindet. Und der Schaden ist unsichtbar, weil nginx das alte
   Zertifikat im Arbeitsspeicher hält: die Site sieht gesund aus, bis jemand
   sie neu lädt. Deshalb wird vor einer Bestellung **gemessen, ob die
   Validierung ankommen kann** — nicht gehofft.
2. **Ein lokaler Allmachts-Schlüssel beweist nichts über Produktion.** „Ein
   gewöhnlicher Projekt-API-Key genügt" war am 2026-08-07 sauber gemessen —
   gegen einen Key, der zufällig alle Scopes hatte. Wo eine Berechtigung im
   Spiel ist, muss der Beweis mit dem SCHWÄCHSTEN Schlüssel laufen, den
   Produktion kennt; der neue Beweis tut genau das.
3. **Die richtige Frage ist die, die ohne Rechte auskommt.** Der Fix war nicht
   ein dritter Schlüssel, sondern ein anderer Messwert: nicht „konnten wir
   eintragen?", sondern „ist der Origin akzeptiert?". Die Antwort darauf stand
   seit F45 als Gegenprobe in der Datei — sie war nur nie der Messwert.

---

### Session-Audit 2026-08-09 — drei Stränge, 4 HIGHs, 14 Fixes ✅ 2026-08-09

**Auftrag David:** alles aus der Session (F49–F55) technisch, konzeptionell
und auf Code-Sauberkeit/Sicherheit prüfen. **Aufbau:** volle Testbatterie
(19 Pakete, 7 Typechecks, 6 Gates, Live-Spots aller 7 Hosts — alles grün)
plus drei audit-worker in Strängen (Stripe/Billing · Nav/Hub/Switcher ·
Cert/Pricing/Marketing), jeder Befund im Hauptloop verifiziert.
**Die vier HIGHs:** (1) Preis-Cache wurde VOR der Client-Auflösung gelesen —
die Key-Wechsel-Leerung (Audit MEDIUM 4) griff auf dem Checkout-Pfad nie;
(2) Preis-Umzug invalidierte den Cache nicht (Checkouts auf archivierte Ids);
(3) die zwei F50-Switcher-Routen fehlten im Rate-Limit (ungedrosselte
JWT-Mints + Control-Plane-Reads) — dieselbe Lücke fand zeitgleich eine
Selbst-Review-Session, der Merge vereinte beide (switcher+switch+
control-handoff); (4) die F52-Sperr-Meldung („Eintrag in ploi löschen …")
erreichte weder Owner noch Log — ein festgefahrenes Zertifikat blockierte
dauerhaft und unsichtbar. Dazu u. a.: stiller ignore im Fulfillment loggt
jetzt (einzige Sackgasse der Zustandsmaschine), Plan kommt aus dem
tatsächlichen lookup_key statt der eingefrorenen Checkout-Metadata
(Portal-Plan-Wechsel; Alt-Wert-Übersetzung GEGUARDET — Unbekanntes bleibt
ignore statt Degradierung), Webhook-Anlegen serialisiert, 409 statt 500 wo
die Endpunkt-Id sonst nie ankäme (der zentrale Handler ersetzt jede
5xx-Meldung), Marketing-Vergleichstabelle „ab 29 €" statt „kostenlos".
**Sicherheitsfragen alle sauber:** kein Klartext-Key-Leck möglich, alle
Stripe-Endpunkte hinter system.manage, Host-Sprung-Siegel dicht,
Verbrauchszählung mandantenscharf, abuse-Sperren unantastbar.
**Bewusst liegen gelassen** (Geschmacks-/Betriebsfragen): Davids
noPlanLabel-Wortlaut (seine explizite Entscheidung), Basic-Karte im
Plan-Raster, Studio-CTA-Ziel, en-„blocks"-Umbenennung (~25 Stellen),
Cross-Host-Sprünge landen auf EN-Pfaden, conflicts-Wächter
onboarding×domains, marketing error.vue ohne Layout(-Dark).
**Gelernt:** (1) Der Merge zweier unabhängiger Fixes derselben Lücke ist die
VEREINIGUNG, nicht die Wahl einer Seite. (2) Hand-aufgelöste Konflikte ohne
Typecheck sind unfertig — der Worktree-Typecheck fing eine doppelte
Deklaration, die drei grüne Testsuiten nicht sahen. (3) `git add -A` bleibt
im geteilten Checkout verboten; der PR-Weg (Branch + Remote-Merge) umgeht
den blockierten lokalen Checkout sauber.

### F55 — Stripe-Verwaltung im Control-Dashboard ✅ 2026-08-08

**Was gebaut wurde** (Davids Entscheidung am selben Tag, nachdem der
Terminal-Weg praktisch scheiterte — Shell-Export-Verwechslung, zsh/bash-read,
Key-Fragment im Chat ⇒ Key rotiert): `/dashboard/stripe` auf apps/control
(system.manage) mit vier Karten — Status (Modus/Steuer-Default/Signatur/
lookup_keys, fail-soft je Abschnitt) · Schlüssel (maskiert, vor dem Speichern
per accounts.retrieve verifiziert, AES-256-GCM in `stripe_settings`
[billing-002]; Entschlüsselung über `NUXT_BILLING_SETTINGS_KEY`, ohne sie
ehrlich „nicht eingerichtet") · Preise (Katalog jetzt EINE Quelle:
`control/shared/stripePriceCatalog.ts`, `ensure-prices.mjs` importiert sie;
`tax_behavior: inclusive` wird EXPLIZIT gesetzt — die A3-Konto-Default-Falle
ist damit konstruktiv zu) · Webhook (Anlegen mit den neun Ereignissen, das
whsec aus der API-Antwort wird sofort verschlüsselt mitgespeichert).
Laufzeit-Auflösung DB-vor-Env für useStripe (async, Client am Key gecacht)
und die Webhook-Route — ohne DB-Wert exakt das Vor-F55-Verhalten.
**Betrieb:** Env-Schlüssel AUF dem Server erzeugt (nie übertragen),
billing-002 auf control UND comments (Prod) gefahren, pm2-Reload mit
--update-env (Falle: der Prozess heißt `controlpukalaniapp`, nicht
`control`). **Beweise:** billing 94/94, control 375/375, 4 Apps typecheck 0,
alle Doku-Gates; live: Seite 302→Login, status-API 401 anonym, Webhook
unsigniert 400, Build-SHA = F55-Commit, Env-Schlüssel im Prozess bestätigt.
**Gelernt:** (1) `git add -A` in einem geteilten Checkout ist verboten —
es hat uncommittete FREMDE Portfolio-Dateien in den Commit gezogen
(chirurgisch per reset --soft + restore --staged getrennt); immer explizite
Pfade adden. (2) GitHubs Push-Protection matcht auch ERFUNDENE
sk_live_-Beispielwerte in Tests — Fixture-Keys zur Laufzeit zusammensetzen.

### F38-Rest + B1-Rest — Pool-media live, Baselines gesichtet ✅ 2026-08-08

**F38:** Die Console-Rechte (Migrations-Key buckets+files, Laufzeit-Key
files) waren beim Nachmessen BEREITS gesetzt und die media-Migration im Pool
gefahren — `media_items` und der Bucket `media` existierten (die
OPEN-ITEMS-Anleitung war überholt, drittes Beispiel an einem Tag). Frisch
nachgemessen gegen die echte Pool-Instanz:
`packages/media/scripts/verify-pool-isolation.mjs` **14/14** (Isolation,
Gast-Sichtbarkeit veröffentlicht/Entwurf, Rückzug per Roh-URL) und
`packages/activity/scripts/verify-pool-isolation.mjs` **8/8** (Bestand: 0
Zeilen ohne communityId) — beide räumen selbst auf. **B1:** David hat die
neun Vorher/Nachher-Bildpaare (Artefakt-Seite) gesichtet und freigegeben;
die Bilder waren längst committet und pixelstabil (Toleranz 0,0001).
**Gelernt:** Wenn ein Listen-Punkt einen manuellen Vorab-Schritt eines
Menschen enthält („David setzt Rechte"), zuerst MESSEN, ob er nicht längst
passiert ist — heute dreimal bestätigt (F53, F38, demo-Stempel): die Liste
altert schneller als sie gepflegt wird, die Instanz lügt nie.

### F53 — Dark Mode der Marketing-Landing: die vier fehlenden Stücke ✅ 2026-08-08

**Der wichtigste Befund zuerst:** Dark Mode war beim Anlegen des Punkts
BEREITS GEBAUT — B7 (`c84c681e`, 2026-08-01) hat die Klemme gelöst,
`.dark`-Zweige in marketing.css/puka-theme.css angelegt und sogar einen
Wähler in den Fuß gestellt; die OPEN-ITEMS-Zeile (und die Empfehlung „hell
lassen" in der 4. Fragerunde) beschrieben einen sechs Tage alten Stand.
**Wirklich gefehlt haben vier Dinge:** (1) **Die Storage-Altlast** — die
Klemme hat nicht nur gelesen, sondern bei jedem Aufruf `'light'` in den
Storage GESCHRIEBEN (color-mode-Plugin, watch immediate); Besucher der
1,8 Klemm-Tage wären für immer hell geblieben, denn der Storage-Wert schlägt
die Voreinstellung im Inline-Skript. Gelöst über einen NEUEN Storage-Schlüssel
(`pukalani-appearance`) statt eines Reset-Plugins: der leere Schlüssel malt
schon den ersten Frame richtig, ein Plugin liefe nach dem Inline-Skript und
flackerte. Preis: wer seit B7 bewusst gewählt hat, wählt einmal neu.
(2) **theme-color-Meta** an colorMode gebunden — EIN Eintrag; zwei
media-Metas überleben unheads Dedupe nicht (gemessen: vier Zeilen, zwei tot).
(3) **Die Studio-Karte** (tags erst seit dem F49-Nachtrag) hatte auf den
tone-Flächen in BEIDEN Modi praktisch keinen Rand (Fläche 1,00–1,04:1, Ring
1,03–1,11:1) — jetzt puka-Panel + Kante inkl. der divide-Linie der liegenden
Bauform. (4) **Hero-Thumbnails** über ein Hell/Dunkel-Tripel.
**Kontraste gerechnet, nicht geschätzt:** dunkel alles ≥ AA (schlechtester
Fließtext 5,82:1, CTA 10,07:1). DREI HELL-BESTANDSWERTE liegen unter AA
(Kicker 2,43–2,83:1 · CTA-Weiß auf der Sonne 1,81:1 · Preis-Kleinzeile
3,41:1) — bewusst NICHT angefasst (B7-Bestand, Optik-Entscheidung Davids),
als Befund notiert. **Beweise:** lint/typecheck 0, Playwright hell+dunkel
(Hero, Preise; html-Klasse folgt prefers-color-scheme), Live-Flip per
Build-SHA verifiziert. **Gelernt:** Die OPEN-ITEMS-Zeile war sechs Tage
veraltet — der Implementierungs-Agent hat den Ist-Stand ZUERST gemessen und
so einen Doppelbau verhindert; genau dafür steht „erst main/Ist-Stand
prüfen" auch VOR Punkten aus der eigenen Liste.

### F50 + F51 — Community-Settings-Hub und Community-Switcher ✅ 2026-08-08

**Was gebaut wurde** (Davids Entscheidungen DECISION-LOG 2026-08-07; drei
Pakete, je Opus-implementiert und im Hauptloop verifiziert):

**F51 Paket 1 — der Hub.** Menüpunkt „Community-Einstellungen" UNTEN LINKS
(erster Nutzer der bis dahin toten `placement: 'bottom'`-Registry-Ausfahrt;
sichtbar nur, wenn nach Ort×Capability×Produkt-Gates Reiter übrig sind) und
die zweite Reiter-Hülle `/dashboard/community` (admin-Layer, Muster F24) aus
der neuen Registry `pukalani.admin.communityTabs` — gleicher Typ wie die
Konto-Reiter, erweitert um productKey/planProduct/configFlag (sonst wäre der
Umzug von Aktivität/Analytics ein stiller Rechte-Verlust gewesen). Neun
Seiten zogen in ihren Layern unter die Hülle; Plan-Reiter trägt Davids
Wortlaut („Testphase (Pro) – noch X Tage" / „Kein Abo – Free Plan" +
Nur-lesen-Hinweis); Stripe-Rückkehr-URLs und pastDue-Link auf
`/dashboard/community/plan`, Alt-Pfade 301 in beiden Locales.

**F51 Paket 2 — die neuen Sichten.** Produkte-Reiter (Katalog-Texte +
Mindest-Plan über die dritte Projektion `/api/community/products` für
`team.manage` — `/api/platform/products` liefert nur Schlüssel,
`/api/admin/products` verlangt `system.manage`) und Speicher-Reiter
(Verbrauch vs. Kontingent: Zähl-Registry `registerCommunityUsageCounter` je
Produkt-Layer, Zählung durch die Datentür mit `as:'operator'/actor:'member'`,
Limits aus `tenantLimitsFor()` — DERSELBEN Auflösung wie die 429-Bremse,
eigens aus `assertPoolWriteQuota` herausgezogen). Silo-Instanz-Sicht: vier
operator-Reiter auf die bestehenden Betreiber-Seiten, zusätzlich hinter
`configFlag: 'admin.instanceTabs'` (Core aus, comments an) — scope allein
hätte control und photos als single-tenant-Apps einen Hub beschert.

**F50 — der Switcher.** TeamsMenu im Sidebar-Kopf (Schalter
`pukalani.chrome.communitySwitcher`, Core aus, platform an, nur
`place==='community'`): Communities mit TEAM-Rolle (viewer bewusst nicht),
aktuelle zuerst (Vergleich per communityId — eine Community löst seit
control-035 unter mehreren Hosts auf), „Community anlegen"/„Communities
verwalten". Der Sprung siegelt über die EINE geteilte
`sealCommunityHandoff()` (aus handoff.post.ts gezogen; Sicherheitskern des
Audits 2026-08-02 unverändert: Ziel-Host aus der Mitgliedschaftsliste, Siegel
hostgebunden); `/api/community/switch` verschärft auf Team-Rollen.

**Beweise:** Alle Gates je Paket grün (core 776, onboarding 32, admin 74,
Produkt-Layer-Tests, 4–5 Apps typecheck 0, i18n/manifests/doc-links); zwei
SSR-Dev-Smokes (Hülle mit Reitern + eingebettetem Kind; Silo mit acht Reitern
inkl. Instanz-Sicht); **Live-Beweis auf prod** (Build 30d992f4): Switcher-
Liste mit Owner+Admin-Rolle und aktueller Community zuerst, Sprung-Siegel →
`site-session` 302 + Cookie → eingeloggt auf `B/dashboard` (200), 404-Gates
auf `my.*` und im Silo, fremde Community 403. Testdaten komplett abgeräumt.
**Nebenbei live bestätigt:** „eine Community pro Konto während der Testphase"
(Kontingent-403 der Naht) — der zweite Dashboard-Zugang läuft wie vorgesehen
über die Team-Rolle. **Gelernt:** (1) Ein CI-Lint-Rot nach einem Datei-Umzug
war der DOKU-Wächter (`check:doc-links`) — wer Seiten verschiebt, zieht auch
Pfad-Nennungen in OPEN-ITEMS/Runbooks mit um; lokal „lint grün" heißt nicht
CI-Lint grün, die CI fährt mehr Schritte. (2) `scopeVisibleAt('operator', …)`
gilt in JEDER single-tenant-App — wer Betreiber-Reiter registriert, braucht
zusätzlich einen Bau-Schalter, sonst erben ihn control und photos.

**Nachtrag (2026-08-08, Davids UX-Befund):** die zwei AUSGÄNGE des Switchers
(„Community anlegen" → `start.*`, „Communities verwalten" → `my.*`) waren
schlichte Links — der Klickende stand drüben ausgeloggt vor dem Login-Formular,
obwohl es dieselbe Platform-App und dasselbe Pool-Projekt ist (Session-Cookies
sind host-only). Jetzt springen sie über dasselbe Siegel-Verfahren wie der
Community-Wechsel: `POST /api/community/control-handoff` (onboarding, nur
`mode: 'pool'`) siegelt per neuer `sealControlHostHandoff()` — OHNE
Control-Plane-Ruf, denn ein Kontroll-Host ist kein Mandant und der Ziel-Host
kommt aus der CONFIG (`controlExitTarget` in `shared/controlExit.ts`,
`resolveControlHosts` Env-vor-Config), nie vom Aufrufer (Audit-Eigenschaft
2026-08-02 bleibt). Menü-Einträge holen das Siegel beim KLICK, Fallback bleibt
der statische Link. Beweis: `verify-control-exit.mjs` **16/16** (Verweigerungen
401/400/404, beide Ziele eingeloggt angekommen, Host-Bindung hält).
**Gelernt:** (1) Der Wizard-Host lebt auf ZWEI Achsen: er muss lokal auch in
`NUXT_PUBLIC_TENANCY_CONTROL_HOSTS` stehen (wie in prod `start.pukalani.app` in
beiden Listen steht), sonst ist er ein unbekannter Host und die Einlösung
antwortet 404. (2) Eine Sicherung erst LESEN, dann „fixen": im Review-Eifer
wurde hier ein `handoffAudience()`-Wrapper um den Siegel-Aufruf gelegt gegen
eine Port-Falle, die es nicht gibt — `sealHandoffToken` normalisiert die
Audience selbst (erste Zeile der Funktion). Der Wrapper war harmlos (doppelt
normalisiert), aber seine Begründung stand einen Tag lang als falsche
Tatsache in drei Dokumenten; beim Selbst-Review am 2026-08-09 zurückgebaut.
(3) `POST /api/community/switch` und `control-handoff` fehlten im
Rate-Limit (der Kommentar „im selben Budget" war Absicht, nicht Code) —
nachgezogen, Bucket `onboarding:communities` wie der Kundenbereichs-Handoff.

### A2a — Stripe-Testmodus-Walkthrough: alle sechs Proben real durchgespielt ✅ 2026-08-08

**Was bewiesen wurde** (gegen die Produktions-Deployments im Stripe-Testmodus,
reproduzierbar über `packages/control/scripts/a2a-checkout-driver.mjs`):
Preise + Webhook-Signatur (Probe 1) · Owner-Grenze der Abo-API (2) ·
Monats-Checkout end-to-end mit Testkarte inkl. Row-Solltabelle, Metadata,
Spiegel-Zeile, Doppelkauf-409 (3) · Jahres-Checkout 1.341 € ⇒ plan pro (4) ·
Portal, Kündigung zum Periodenende (no-op), sofortige Kündigung ⇒ **F49
live**: basic/canceled + billing-Sperre in ~5 s, Neukauf hebt sie im selben
Schreibvorgang, Portal ohne Customer 409 (5) · Test-Clock-Abo: past_due,
Plan bleibt, retry-fester pastDueSince-Stempel, 14-Tage-Sweep sperrt
(rückdatiert + Stundenlauf), Pool-Glocke mit Idempotenz-rowId `pastdue-…` und
`t-…`-Ablage, Control-Glocke bewusst leer (6). **Befunde:** Test-Webhook trug
nur 6 von 9 Ereignissen (ergänzt; Live-Endpunkt-Prüfpunkt im GO-LIVE-Runbook)
· `ensure-prices` war im pnpm-Workspace nie aufrufbar (Symlink-Abhilfe
dokumentiert; Root-devDependency-Fix zurückgestellt — Lockfile sortiert dabei
um ~1000 Zeilen um) · Datetime-Spalte macht aus `''` einen Jetzt-Stempel
(Einladungs-Code sofort „abgelaufen") · Stripe-Checkout-Adress-Autocomplete
fängt den Kaufen-Klick ab · `billing_subscriptions.planId` bei Community-Abos
`unknown` (Kosmetik) · Test Clocks lassen sich NIE an Checkout-Kunden hängen.
Anleitung komplett neu geschrieben (STRIPE-TEST-WALKTHROUGH.md); Testdaten
abgeräumt (Abos gekündigt, Clock gelöscht, 3 Communities stillgelegt, Konten
+ Wegwerf-Zeilen entfernt). **Gelernt:** Die alte Anleitung empfahl mit
`stripe trigger` und „Test Clock am Checkout-Kunden" zwei Wege, die nur
GRÜN AUSSEHEN — das Fixture trägt unsere Metadata nicht, und eine Clock lässt
sich nie nachrüsten. Ein Walkthrough ist erst dann einer, wenn ihn jemand
wirklich gegangen ist.

### F49 — Pricing-Umbau: ohne Abo nur-lesend, Preisseite nur Personal + Pro ✅ 2026-08-07

**Was gebaut wurde** (Davids Entscheidungen, DECISION-LOG 2026-08-07, Runden
1–5): Der funktionsfähige Gratis-Zustand ist gestrichen — eine Community ohne
bezahltes Abo ist NUR-LESEND, über die vorhandene M13-`billing`-Sperre, auf
allen drei Wegen dorthin: (1) **Trial-Ende** — `trialSweep` setzt statt des
Basic-Downgrades jetzt `suspension: 'billing'` + `TRIAL_ENDED_SUSPENSION_
REASON` (plan 'basic' bleibt als Quota-Anker); der plan-Filter ist raus, damit
der BESTAND mit abgelaufenem Trial rückwirkend mitgenommen wird; Query über
`listAllRows` statt `limit(100)` (pastDueSweep-Begründung). (2) **Zahlungs-
verzug** — unverändert (14 Tage, pastDueSweep). (3) **Kündigung** — der
free-fallback-Zweig SETZT die Sperre (`SUBSCRIPTION_ENDED_SUSPENSION_REASON`)
statt sie zu räumen; abuse bleibt immer unangetastet. Tragende Regel-Änderung:
`shouldLiftBillingSuspension` hebt nur noch bei `billingStatus === 'active'`
auf — die alte Formel (`!== 'past_due'`) hätte die neuen Sperren im nächsten
stündlichen Lauf wieder aufgehoben (Attrappe mit einer Stunde Halbwertszeit).
Der Kauf öffnet wie bisher im selben Schreibvorgang (Webhook apply-plan).
Texte ehrlich nachgezogen: Wizard („nichts wird gesperrt" ist raus),
Trial-Hinweise (ending/ended + „Plan wählen"), `my.*`-Karten, Abo-Seite
(Basic-Bullets = „Zustand ohne Abo"), Hilfe (5.abrechnung.md), jeweils de+en.
Preisseite www: Basic-Spalte entfernt; seit Davids Nachtrag vom 2026-08-08
stehen NUR Personal + Pro im Zweispalter, und Enterprise/Pukalani Studio
grenzt sich als eigene LIEGENDE Karte darunter ab (badge statt #header —
die horizontale Form rendert den Slot nicht; Text als `description`, nicht
`tagline`, sonst bleibt die halbe Karte leer). FAQ und Lead neu
(„Mitmachen kostet nie etwas" statt „Basic dauerhaft kostenlos").
**Beweise:** control 352/352 (+22 skipped; trialSweep-Fälle neu geschnitten
inkl. Bestand/Vetos/Idempotenz, Lift-Regel-Fälle erweitert), onboarding 15/15,
`check:i18n-keys` grün, 3× lint ohne Befund, typecheck control/platform/
marketing je 0 Fehler. Der I/O-Teil (Sweep-Write, Webhook-Kündigung) wird mit
**A2a** (Stripe-Testmodus-Walkthrough, als Nächstes dran) end-to-end bewiesen —
die Sperr-WIRKUNG von `suspension='billing'` selbst ist seit M13 live belegt.
**Gelernt:** Eine Sperre, die ein Sweep setzt, muss gegen JEDEN Aufheber
geprüft werden, der dieselbe Spalte liest — `shouldLiftBillingSuspension` war
als „Netz unter dem Webhook" gebaut und wäre unbemerkt zum Gegenspieler der
neuen Regel geworden. Wer einen Zustand neu belegt, liest zuerst alle Leser.

### F52 — Pool-Domains: Sperre gegen den Wiederholungs-Klick ✅ 2026-08-07

**Was gebaut wurde.** `requestPloiTenantCertificate` (packages/control/server/
utils/ploi.ts) liest jetzt VOR jeder Anforderung die Zertifikatsliste der
Site — dieselbe Sperre, die der Silo-Pfad (`requestPloiSiteCertificate`)
schon hatte. Neue pure Funktion `coveringCertificate` (Deckung der Namensmenge
UNABHÄNGIG vom Status), `certificateCovers` darauf abgestützt (Verhalten
unverändert, Tests grün). Deckt ein Eintrag den Host ab: `active` ⇒ still
übersprungen; jeder ANDERE Status ⇒ übersprungen mit Meldung, die Status und
Ausweg nennt (Eintrag in ploi löschen, erneut prüfen). Kein Eintrag oder
Listen-Fehler ⇒ Anforderung geht raus (fail-open, kein Regressionsrisiko).
**Warum so:** Let's Encrypt erlaubt fünf identische Zertifikate pro Woche —
der sechste Klick WÄHREND der Ausstellung sperrt den Kunden sieben Tage aus,
und die LE-Meldung nennt keinen der vorherigen Klicks. Status-Vokabular von
ploi ist bewusst NICHT geraten: live belegt ist nur `active` (Site 391312,
`tenant`-Flag in der Liste nachgemessen 2026-08-07); alles andere gilt als
„in Arbeit". **Beweis:** vitest 350/350 (packages/control, inkl. 4 neue
coveringCertificate-Fälle), eslint 0 Fehler, `pnpm --filter control
typecheck` 0 Fehler. Ein Live-Beweis mit echtem Tenant-Zertifikat steht aus,
bis der erste Kunde eine Domain aktiviert (Runbook
CUSTOM-DOMAIN-ERSTAKTIVIERUNG deckt das).

### Eigene Domain je Community (Custom Domains) ✅ 2026-08-07

**Was gebaut wurde.** Eine Pool-Community ist unter ihrer eigenen Adresse
erreichbar (`www.kunde.de`), komplett in Selbstbedienung. Migration
`control-035` (sechs additive Spalten an `communities` + `idx_custom_domain`),
pure Regeln in `packages/control/shared/customDomain.ts`, Host-Auflösung über
`host` ODER die eigene Domain, 301/308 auf die kanonische Adresse in
`00.tenant.ts`, DNS-Nachweis (TXT + A/CNAME) mit eigenem Resolver,
ploi-Tenant + Zertifikat, Appwrite-Web-Platform, Dashboard unter
`/dashboard/settings/domain` (de+en). Davids vier Entscheidungen vom selben Tag
(DECISION-LOG) sind alle umgesetzt: Pro-Gate server-seitig, 301 mit der
Subdomain als Rückfall, volle Selbstbedienung, www + Apex automatisch.

**Beweis.** `packages/onboarding/scripts/verify-custom-domain.mjs` — **46/46**,
gegen zwei eigene Dev-Server (control :3014, platform :3016) im Trockenlauf,
inkl. der vollen Kette bis `active` mit Appwrite-Origin-Gegenprobe (403 → 401).
37 Unit-Tests in `packages/control/tests/customDomain.test.ts`, 9 in
`packages/core/tests/canonicalHost.test.ts`. Der Beweis ist gegengeprobt: eine
Mutation am Resolver macht genau die Abschnitte rot, die die eigene Domain
messen. **Offen bleibt genau ein Stück**: ploi + Let's Encrypt beim ersten
echten Kunden — Häkchen dafür in
[docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md](runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md).

**Die eine offene Frage war beantwortbar.** Ob sich die Appwrite-Web-Platform
(F45) automatisieren lässt, hing daran, WOMIT sich `POST /v1/projects/:id/platforms`
authentifiziert — bei Appwrite Cloud ist das eine Konsolen-API. Gemessen gegen
die selbst gehostete 1.9.6: ein **gewöhnlicher Projekt-API-Key genügt**, sofern
der Header `X-Appwrite-Project` dieselbe Id trägt wie der Pfad (ohne ihn 403
`project_id_missing`, mit ihm 201). Registriert wird sie von der **Platform**-App,
nicht vom Control Plane — das hat für das Pool-Projekt keinen Schlüssel
(dieselbe Grenze wie bei `revokeCommunityLabel`, A5).

**Gelernt (vier Dinge, alle live erwischt):**
1. **Appwrite prüft beim Anlegen einer Web-Platform NICHT auf Dubletten** —
   derselbe Hostname zweimal ergibt zwei Zeilen, kein 409. Idempotenz muss der
   Aufrufer herstellen (erst lesen, dann schreiben).
2. **Ein `runtimeConfig`-Schalter vom Typ String ist per Env keiner mehr.**
   Nuxt schiebt Überschreibungen durch `destr()`: aus
   `NUXT_CUSTOM_DOMAIN_DRY_RUN=1` wird die **Zahl** 1, und `1 === '1'` ist
   falsch. Der Trockenlauf war damit still aus und meldete „ploi ist nicht
   konfiguriert" — das sah aus wie ein fehlendes Token. Der Nachbar
   `…_DNS_SERVERS=127.0.0.1:5354` war unauffällig, weil `destr` daraus keine
   Zahl machen kann; solche Fehler treffen deshalb immer nur EINEN von mehreren
   Schaltern. Konsequenz: `isDryRunFlag()` liest tolerant (`1/true/yes/on`).
3. **Ein Unique-Index geht hier nicht.** `customDomain` ist optional mit Default
   `''`, und leere Strings kollidieren in MariaDB — nach der ersten Zeile ohne
   eigene Domain wäre keine Community mehr anlegbar. Die Eindeutigkeit setzt der
   Code durch, und zwar über das FORMEN-PAAR (www + Apex), was ein
   Spalten-Index ohnehin nie gesehen hätte.
4. **Vite blockt im Dev-Server unbekannte Hosts mit 403** („add to
   `server.allowedHosts`"). `.localhost` steht in seiner Erlaubnisliste, `.test`
   nicht — eine vollständig freigeschaltete Domain antwortete deshalb 403 und
   das sah nach einer Rechte-Prüfung aus. In Produktion gibt es Vite nicht.

**Bekannte Grenze, bewusst NICHT behoben** (von David vorab benannt): der
Konto-WS (`useRealtimeAccount`) ist cookie-nativ, weil die Sofort-Abmeldung bei
Session-Widerruf am Cookie-Close hängt. Auf einer Kundendomain degradiert er auf
den 30-s-Poll. CLAUDE.md verbietet die Konsolidierung auf JWT ausdrücklich.
Zweite Folge derselben Cookie-Regel: wer die Domain aktiviert, **muss sich dort
neu anmelden** — steht im Runbook.

---

### H1 — Ein Fremder konnte sich in jeder Community einen `@namen` nehmen ✅ 2026-08-05

**Der Befund** (gemessen am selben Tag, beim Bau des Grenzbeweises):
`GET /api/handles/me` fragte nur nach der SITZUNG, nie nach der Mitgliedschaft.
Ein Pool-Konto ohne jede Zugehörigkeit bekam damit auf `kunde-a.localhost` eine
Zeile mit `communityId: t-kunde-a` — es wurde kein Mitglied (die Labels blieben
leer), belegte den Namen dort aber **dauerhaft**: die Historien-Zeile
(`status: 'former'`) gibt einen Handle nie wieder frei. `@vorstand` war so
pool-weit automatisiert wegschnappbar, und der Fremde stand obendrein im
Erwähnungs-Menü der fremden Community. Bemerkenswert war, dass
`packages/posts/server/api/posts/index.post.ts` die Mitgliedschaft als
Voraussetzung im eigenen Kommentar dokumentierte — die Handle-Route hatte sie
schlicht nicht.

**Davids Entscheidung** (2026-08-04): Mitglieder-Gate an der Route, nicht die
Variante „erst beim ersten Schreibvorgang vergeben".

**Wie geprüft wird — der bestehende Mechanismus, kein zweiter.** Die Wahrheit
über Mitgliedschaft liegt in `community_members` im Control Plane; die Runtime
kennt sie über den Rollen-Resolver (30-s-Cache) und über das Community-Label.
Genau diese beiden liest die neue pure Regel `isCommunityMember`
(`core/shared/communityAccess.ts`), und sie liest sie in derselben Reihenfolge
wie `server/middleware/06.community-label.ts`, damit nicht zwei Regelwerke für
eine Frage auseinanderlaufen:

- **kein Pool-Mandant ⇒ ja.** Silo (`apps/comments`), Kontroll-Host, Playground:
  dort ist das PROJEKT die Grenze, jedes Konto ist zuhause. Ein Gate wäre keine
  Grenze, sondern eine Aussperrung.
- **frisch entzogen ⇒ nein**, noch vor der Rolle (`communityAccessRecentlyDenied`)
  — sonst hätte „Zugang entziehen" ein 30-Sekunden-Loch, in dem sich der
  Hinausgeworfene noch einen Namen sichert.
- **Rolle ⇒ ja.**
- **Community-Label ⇒ ja.** Kein zweiter Weg, sondern derselbe eine Sekunde
  früher. Das schliesst den A5-Fall „Beitritt durch den ersten Schreibvorgang":
  wer so beitritt, hat seine Zeile erst seit Millisekunden und der Rollen-Cache
  weiss noch nichts — `grantCommunityLabel` schreibt das Label aber im SELBEN
  Request auch nach `event.context.user.labels`. Der in der Aufgabe erwartete
  Race fällt damit weg, statt als Lücke stehenzubleiben.

Keine Capability, kein `requireCommunityPermission`: ein Handle ist keine
Admin-Fähigkeit, und der Operator-Break-Glass hätte den Betreiber beim
Support-Besuch still zum Namensinhaber in der Kunden-Community gemacht.

**Wo die Wache sitzt.** Nicht (nur) in den zwei heutigen Routen, sondern in den
beiden SCHREIB-Funktionen (`core/server/utils/handles.ts`) — dasselbe Muster
wie beim A5-Beitritt, den die Datentür abfängt statt zwanzig Routen. Damit ist
auch `posts/index.post.ts` mitgeschützt, das `ensureCommunityHandle` ebenfalls
ruft. Zwei Antworten auf dasselbe Nein, weil zwei Dinge gefragt wurden: die
VERGABE ist eine Nebenwirkung und schweigt (`null`), der WECHSEL ist eine
Absicht und bekommt einen Grund (403, `data: { code: 'not_a_member' }` →
`reason` im Envelope).

`GET /api/handles/me` antwortet einem Nicht-Mitglied **200 mit `member: false`**,
nicht 403: die Kontoseite ist auf jedem Host dieselbe, und „hier hast du keinen
Namen" ist eine gültige Auskunft, kein Fehler. Das Formular weicht dort einem
Satz (`account.handle.notAMember`, de+en) — ein Eingabefeld, das jede Eingabe
mit 403 quittiert, wäre eine Attrappe.

**Die Suchroute bleibt bewusst ohne Gate.** `GET /api/handles/search` vergibt
nichts, und sie zeigt einem Fremden ohnehin nichts: zwei unabhängige Schichten
(Mandanten-Filter der Datentür + `read(label:<communityId>)`) sind am selben Tag
einzeln gemessen worden. Ein Gate machte aus einer leeren Liste ein 403 und
kostete auf dem heissen Pfad (Tippen im Erwähnungs-Menü) je Anfrage eine
Rollen-Auflösung. Im Silo gilt dasselbe aus dem anderen Grund: dort tragen die
Zeilen `read("users")`, jedes Konto der Instanz ist zuhause. Die Bedingung steht
im Dateikopf: sobald diese Route etwas anlegt oder mit dem Admin-Client läse,
gehört das Gate hierher.

**Bestandsdaten (Produktion, nur gelesen, 2026-08-05):** `community_handles` im
Pool-Projekt hat **0 Zeilen**, also **0 fremdvergebene** — der Befund entstand am
selben Tag wie das Produkt. Das Silo (`comments`) hat 1 Zeile, dort gibt es keine
Mandanten-Grenze. Kein Aufräumen nötig.

**Beweise.** `packages/core/scripts/verify-handle-search-boundary.mjs` um die
Abschnitte 8–10 erweitert: **37/37** (vorher 26/26), gefahren gegen zwei eigene
Dev-Server (control :3014, platform :3016, Naht per Env). Silo unverändert:
`verify-mention-menu.mjs` 22/22, `verify-handles-mentions.mjs` 34/34. Dazu 6
Unit-Tests für die pure Regel.

**Die Gegenprobe ist der eigentliche Beweis.** Wache absichtlich entfernt
(`return true` am Anfang von `resolveCommunityMembership`) ⇒ **31/37**, und die
sechs Roten sind genau die neuen Abschnitte 8+9; Abschnitt 10 („für Mitglieder
ändert sich nichts") bleibt grün. Gemessen wurde dabei wörtlich der Befund: der
Fremde bekam auf Host B `{"handle":"probenachbar","member":true}`, die Tabelle
von Community B wuchs von 1 auf 2 Zeilen, er nahm `@grenzprobe_vorstand` — und
das rechtmässige Mitglied bekam danach `409 {"reason":"taken"}`, für immer.

**Gelernt:** Eine Lese-Route, die BEIM HINSEHEN vergibt, ist keine Lese-Route —
sie verteilt an jeden, der hinsieht, und ein Gate an der „Schreibstelle" greift
dort nicht, weil niemand sie als Schreibstelle liest. Der Kommentar in
`core/server/utils/handles.ts` sagte ausdrücklich „die Autorisierung passiert
VOR dem Aufruf, in der Route" — ein Versprechen an die Disziplin, und die
Disziplin hielt es nicht. Dieselbe Lektion wie bei `createIndex` und beim
A5-Beitritt: **Sicherungen gehören in die Schnittstelle, nicht in die
Erinnerung.** Zweitens: die schärfste Messung einer Belegung ist nicht „ist eine
Zeile da", sondern „kann der Rechtmässige den Namen noch bekommen" — erst der
409 in der Gegenprobe zeigt, dass der Schaden dauerhaft gewesen wäre.

### F48 Teilpaket 3 — Namensvervollständigung beim Tippen von `@` ✅ 2026-08-05

Der letzte Rest von F48. `UEditorMentionMenu` in der Beitrags-Schreibfläche:
`@` plus die ersten Buchstaben öffnet ein Menü, die Vorschläge kommen aus dem
schon bestehenden `GET /api/handles/search`. Eine reine TIPPHILFE — Format,
Auflösung und Benachrichtigung bleiben, wie sie am 2026-08-04 gebaut wurden;
wer den Namen von Hand tippt, bekommt dasselbe Ergebnis.

**Der eine Punkt, an dem es kaputtgehen konnte,** ist die Serialisierung: das
Menü fügt einen mention-KNOTEN ein, und der wird von Haus aus zu
`[@ id="…" label="…"]` — Klammer-Syntax, die unser Parser roh in den Beitrag
durchreicht. Zuerst DOM-frei gemessen, dann gebaut:
`Mention.extend({ renderMarkdown: n => '@' + n.attrs.id })`. Nötig ist
`.extend()` und nicht `.configure()`, weil `renderMarkdown` ein
EXTENSION-Feld ist (`getExtensionField`) und über `:mention="{…}"` gar nicht
erreichbar wäre — daraus folgt `:mention="false"` plus `:extensions`, und
daraus erst die direkte Abhängigkeit.

**Gelernt:** *Eine Abhängigkeit, die den Lockfile sprengt, ist selten die
Abhängigkeit — meistens ist es die ungepinnte Aufnahme.* Der Vorgänger-Versuch
bewegte 1898 Zeilen (+334/−1564) und wurde zu Recht abgebrochen. Dasselbe
Paket, exakt auf `3.27.1` gepinnt (ohne Caret, weil eine Caret-Range nichts
pinnt), kostet **6 Zeilen (+6/−0)**: `@tiptap/extension-mention` liegt als
optionaler Peer von `@nuxt/ui` längst im Baum, und pnpm greift denselben
Store-Eintrag — nachgeprüft an der identischen Inode.

**Gelernt:** *Ein Wächter, der nichts findet, meldet grün.* Beim Eintragen von
`@tiptap/core` in `scripts/check-single-copy.mjs` fiel auf, dass dessen
`versionsOf()` **kein einziges gescoptes Paket** traf: pnpm quotet solche
Schlüssel im Lockfile (`  '@unhead/vue@3.2.3':`), die Regel erlaubte das
Anführungszeichen nicht. `@unhead/vue` stand seit seiner Aufnahme in der
Liste, lieferte immer `[]`, wurde von `versions.length <= 1` übersprungen —
und die daneben gepflegte ACCEPTED-Ausnahme war ebenfalls tot. Eigener
Commit, vorher/nachher über alle zehn Einträge gemessen.

**Gelernt:** *`rel="prefetch"` ist nicht der kritische Pfad.* Die Feed-Ansicht
holt den Tiptap-Chunk auch ohne Schreibabsicht — aber idle und vorsorglich.
Wer nur zählt, welche `.js` der Browser lädt, hält das Nachladen deshalb
fälschlich für wirkungslos. Verglichen gehört `modulepreload` + `<script src>`,
und der ist zwischen beiden Produktions-Builds **byte-gleich** (1 060 198 roh,
123 Dateien). Die Erwähnungs-Logik liegt in einem eigenen nachgeladenen Chunk
(19 818 roh / 6 475 gzip), über alle Chunks summiert +4 361 Bytes roh.

**Bewusst nicht:** ein nacktes `@` fragt nichts ab — die leere Anfrage hieße
zugleich „Menü beendet" (`onExit` setzt den Suchbegriff zurück), und ein
einzelnes Zeichen soll nicht die Mitgliederliste aufblättern. `ignore-filter`
ist dabei Pflicht, nicht Geschmack: nur in diesem Zweig beobachtet
`useEditorMenu` die `items` und öffnet nach, wenn Treffer NACH dem letzten
Tastendruck eintreffen. Keine neuen i18n-Texte — das Menü zeigt nur Handles.

**Beweis:** `packages/posts/scripts/verify-mention-menu.mjs` — **22/22**,
echter Browser, echte Route, echte Glocke (Menü, Tastaturauswahl,
Speicherformat, Anzeige, `post.mention` statt Rückfall `replied`, `e@mail`
löst nichts aus, unbekannter Name bleibt Text, Bestands-Beitrag bleibt beim
Öffnen+Speichern byte-gleich). **Gegenprobe:** ohne den Serialisierer fällt
derselbe Lauf auf 14/22 — der Beweis kann also scheitern.

### F48 Teilpaket 2 — Schreibfläche für Beiträge auf `UEditor` ✅ 2026-08-04

Die Umstellung selbst, dritter Anlauf und diesmal durch. Der erste Anlauf hat
gemessen und ANGEHALTEN (der Serialisierer maskiert Alltagszeichen), der
zweite hat daraufhin den Renderer CommonMark-treu gemacht (Teilpaket 1
unten) — damit war der Weg frei.

**Gebaut:** `packages/posts/app/components/PostBodyField.vue` (die EINE
Schreibfläche für Composer und Bearbeiten) rendert bis zum ersten Fokus eine
`UTextarea` und lädt dann `LazyPostBodyEditor` nach. Die ganze Editor-
Konfiguration samt Begründung steht in `PostBodyEditor.vue`: `UEditor` im
Markdown-Modus, `UEditorToolbar` mit genau dem Subset, `UEditorEmojiMenu` mit
einer kleinen eigenen Liste (`app/utils/emojiMenuItems.ts` — Nuxt UI bringt
keinen Datensatz mit), KEIN Erwähnungs-Menü. Abgeschaltet sind
`strike`/`underline` (Marke nicht im Schema), h1/h4+, Bild und Erwähnung;
Tabellen und Aufgabenlisten sind gar nicht erst dabei. Zwei Rest-Wege sind
einzeln zugemacht: die Eingaberegel `---` steht nicht auf der Erlaubnisliste
von `enableInputRules`/`enablePasteRules` (Fail-closed: eine künftige neue
Erweiterung ist damit still AUS statt still AN), und `<hr>` aus der
Zwischenablage entfernt `transformPastedHTML`.

**Das Speicherformat ändert sich nicht** — weiterhin das Markdown-Subset,
keine Migration. Die Regel „Öffnen darf nichts ändern" ist dafür von
`packages/pages/shared/editorBody.ts` nach `packages/core/shared/editorBody.ts`
gezogen (jetzt zwei Konsumenten) und greift beim Bearbeiten: ohne sie machte
schon das Aufschlagen eines Bestands-Beitrags aus `snake_case` ein
`snake\_case`, und daran hängt sichtbar „bearbeitet" (`posts.editedAt`).

**Beweis:** `packages/posts/scripts/verify-composer-editor.mjs` — 72/72,
echter Browser (Playwright aus `apps/comments`), echter Editor, echte Route,
echter Renderer, mit Gegenprobe. Nachladen im PRODUKTIONS-Build gemessen:
541 KiB roh / ~169 KiB gzip bleiben aus einer Feed-Ansicht ohne
Schreibabsicht draußen (2107 statt 2648 KiB JavaScript, −20 %).

**Bewusst offen geblieben** (beides gemessen und im Skript festgenagelt, damit
es nicht unbemerkt kippt): verschachtelte Listen speichert der Editor korrekt
eingerückt, `parseMarkdown` rendert sie FLACH — das war in der Textfläche
schon so und wäre eine Renderer-Erweiterung. Und ein Sternchen-PAAR ist
Betonung, auch in `2 * 3 * 4 = 24`; die alte Textfläche hat denselben Text
genauso kursiv gerendert (`core/tests/markdown.test.ts` nagelt es fest), neu
ist nur, dass man es beim Tippen SIEHT.

**Gelernt:** Ein WYSIWYG-Editor über einem eigenen Parser hat zwei Fronten,
und die zweite fällt leicht unter den Tisch: nicht nur, was er SCHREIBT
(Serialisierung), sondern auch, was er LIEST. `UEditor` parst Markdown mit
`marked` und `gfm: true` — damit wäre `~~alt~~` eine Durchstreichung, die
Marke gibt es hier nicht, sie fiele weg, und aus einem Bestands-Beitrag
verschwänden beim bloßen Aufschlagen vier Zeichen. `gfm: false` behebt das;
gefunden nur, weil die Prüfung „was der Renderer nicht kennt, darf keine
Zeichen fressen" als eigener Fall im Beweis stand.

### F48 Teilpaket 1 — Markdown-Renderer CommonMark-treu ✅ 2026-08-04

**Davids Entscheidung** nach der Messung des Vorgängers (Option B aus
`docs/archiv/COMPOSER-UEDITOR.md`): nicht der Editor ist das Problem, sondern
der Renderer. `packages/core/shared/markdown.ts` kannte weder Backslash-Escapes
noch HTML-Entities und zeigte beides sichtbar an — schon heute eine Lücke
(ein Bestandstext mit `\_` zeigte den Backslash), und der Grund, warum die
Umstellung des Composers auf `UEditor` scheiterte: `@tiptap/markdown` maskiert
beim Serialisieren **hartkodiert** jeden Text-Knoten.

**ZUERST GEZÄHLT, DANN GEBAUT.** Die Änderung verändert die Anzeige von
Bestandstexten, also wurde vor der ersten Codezeile gegen BEIDE
Produktions-Instanzen gemessen (nur lesend): **0 von 80** Texten in
`community_posts.body/title`, `comments.content`, `pages.body`,
`lessons.content`, `courses.description`, `events.description` tragen einen
Backslash oder eine HTML-Entity. Es gab also nichts zu migrieren und keine
Übergangsregel zu bauen — aber das wusste vorher niemand.

Gebaut: Escapes werden **vor** dem Parsen maskiert (je escaptem Zeichen ein
Zeichen aus der privaten Unicode-Zone) statt in jedem der sieben
`INLINE_RE`-Zweige per Lookbehind mitgedacht. Dadurch wirkt der Escape auch auf
die BLOCK-Erkennung (`\# kein Kopf`, `\- keine Liste`). Entmaskiert und
dekodiert wird ausschliesslich im Blatt eines TEXT-Knotens; in Code-Spans und
Codeblöcken passiert bewusst nichts, denn dort maskiert der Serialisierer auch
nicht. Die Sicherheitsgrenze bleibt: weiter AST → vnodes, kein `v-html`.
`isSafeHref` prüft das Ziel jetzt NACH dem Dekodieren — sonst käme
`javascript&#58;` an der Prüfung vorbei.

**Beweise:** 80 Unit-Tests in `packages/core/tests/markdown.test.ts` (darunter
alle 32 escapebaren Zeichen einzeln) und ein Rundlauf im Browser gegen die
lokale Instanz: ein Beitrag mit `\*`, `\[`, `&lt;script&gt;`, Windows-Pfad und
Code-Span wurde gespeichert und im Feed gerendert — 0 `script`-Elemente,
0 `b`-Elemente, `<script>alert(1)</script>` steht als sichtbarer TEXT da,
`` `a\*b` `` behält seinen Backslash, `\#` bleibt ein Absatz, `*ja*` ist
weiterhin kursiv.

Zwei Nebenbefunde derselben Messung gleich mit: die Bearbeiten-Fläche in
`PostCard` und der Composer teilen sich jetzt **eine** Komponente
(`PostBodyField`, weiterhin `UTextarea` — die `UEditor`-Umstellung ist ein
eigenes Paket und trifft dann eine Datei statt zwei), und die Längengrenze
zählt Codepoints statt UTF-16-Einheiten.

**Gelernt:** Eine Längengrenze muss zählen, wie die SPALTE zählt. `z.string()
.max(10_000)` zählt UTF-16-Einheiten, Appwrite/MariaDB zählen Codepoints — am
2026-08-04 gegen die lokale 1.9.6 nachgemessen: 10 000 Emoji (= 20 000
UTF-16-Einheiten) werden angenommen, 10 001 abgelehnt. Ein Beitrag aus 6000
Emoji wurde also mit „zu lang" abgewiesen, obwohl die Spalte ihn genommen
hätte. Für lateinischen Text fällt das nie auf; deshalb hat es auch niemand
gemerkt.
### F1 — Private Nachrichten v1: DAMIT IST F1 KOMPLETT ✅ 2026-08-04

**Davids Bau-Go** („starte den bau der pn v1") auf das am selben Tag
entscheidungskomplette Konzept (PRIVATE-NACHRICHTEN-KONZEPT.md — dort die
sieben Entscheidungen und der Stufenplan; Ausbaustufen 2/3 wie Suche, Digest,
Gruppen-PN sind dort beschrieben und werden erst bei Bedarf zu offenen
Punkten). Gebaut: neuer Produkt-Layer `packages/messages` (56 Dateien) —
fünf Tabellen (messages-001; Teilnehmer als EIGENE Tabelle statt Array-Spalte:
Appwrite 1.9.6 kann keine Array-Indizes, und der Ungelesen-Zähler wird so
atomar), Row-Permissions NUR Teilnehmer (die Moderation liest ausschließlich
den eingefrorenen Meldungs-Snapshot), „Tür vor der Tür" in messageGate.ts
(Owner-Schalter → Sperre+Stufe im SELBEN Fehler — kein Blockier-Orakel —
→ Budgets zuletzt, abgewiesene Versuche kosten kein Kontingent), Adressierung
über Handles (nie User-Ids — sonst wäre das Formular ein Adressbuch),
Inbox-UI nach dem Nuxt-UI-Template-Muster (Davids Hinweis), UEditor-
Schreibfläche ohne Überschriften/Codeblöcke, DSGVO-Contributor ab Tag 1,
`tenancy.products.messages: 'personal'`. `messages.write` zusätzlich für
ernannte Rollen (nicht Viewer — dort muss der Spam-Schutz greifen);
Live-Befund des Agenten: ein berufener Moderator mit Stufe 0 lief ins
Null-Budget → `effectiveOpenerLevel` verbindet beide Quellen. Beweise:
verify-messages.mjs 64/64 (Schema) + 92/92 (Live-Schutzpfad) — beide auch
bei mir gefahren —, messages 57 + core 758 Tests, alle Tore grün,
messages-001 auf allen vier Instanzen VOR dem Deploy. Für Bestand ändert
sich NICHTS: `message_settings` leer = aus, der Owner öffnet bewusst.

**Gelernt:** Wenn ein Recht ZWEI Quellen hat (Stufe oder Ernennung), müssen
alle nachgelagerten Rechnungen beide kennen — die Tür ließ den berufenen
Moderator durch, das Budget kannte nur die Stufe und gab ihm null. Solche
Fehler findet erst ein Lauf gegen die echte Instanz, kein Fixture. UND: der
erste Push starb in CI an einem unescapten `@` in „Name eingeben (ohne @)"
(en.json) — die dokumentierte i18n-Falle in ihrer @-Variante, der komplette
EN-Locale-Compile fiel, E2E rot, Deploy-Gate hielt korrekt. Lokal unsichtbar,
weil die Seiten-Beweise DE trafen: **ein Seiten-Beweis für einen neuen Layer
muss BEIDE Sprachen rendern** (EN ist die Default-Locale ohne Präfix — genau
die trifft CI zuerst).

### F1 gemeinsames Paket, Teilpaket 3 — Trust Levels ✅ 2026-08-04

**Davids Go** („danach direkt teilpaket 3") plus zwei per Frage abgenommene
Festlegungen (DECISION-LOG): Schwellen „Mittel" (TL1: 2 Tage·1 Inhalt·1
Upvote · TL2: 15·5·10/5 · TL3: 60·25·50/25 · TL4 nur von Hand) und
v1-Rechte (TL3: fremde Themen umbenennen/umkategorisieren · TL4: +
anheften/schließen/gelöst + fremde Beiträge bearbeiten). Umsetzung: ZWEI
Spalten auf member_counters (posts-016: `trustLevel` 0–3 erarbeitet — die
Spalte selbst weist eine 4 ab — und `trustLevelLeader` als Ernennung; mit
EINER Spalte hätte der Ernennungs-Entzug die erarbeitete Stufe fail-soft neu
rechnen müssen und bei klemmender Verbindung eine echte 3 gelöscht).
RBAC-Einspeisung in `decideCommunityAccess` als dritter Weg `via:'trust'` —
Rolle → Stufe → Operator-Break-Glass (verdiente Rechte erzeugen keine
Warnzeile), Stufe wird NUR nachgeschlagen, wenn die Capability überhaupt aus
ihr folgen kann (3 von 31; alle anderen Routen kosten nichts, Rückwärts-
Wächter-Test über 5 Rollen × 31 Capabilities). Neue Capabilities
posts.curate/arrange/revise/appoint; Zustands-Route stellt jetzt ZWEI Fragen
(„darf setzen" ≠ „ist Stab" — sonst hätte TL4 die Melde-Queue mitgeerbt).
Aufstieg beim Schreiben (drei Kosten-Ausstiege, Control-Plane-Abruf nur wenn
Zähler reichen) + Beim-Hinsehen-Netz für reine Zeit-Aufstiege; Level-Up =
TL-Abzeichen über den Teilpaket-2-Weg samt Glocke. TL4-Fläche
`/dashboard/discussion-leaders` (posts-eigenes Modul; bewusst nicht die
Mitgliederliste — A14 und „Stufe ohne Aktivität wäre eine Aussage ohne
Grundlage"). Beweise: verify-trust-levels.mjs 15/15 gegen echte Appwrite
(auch bei mir), posts 279 + core 701 Tests, Migration dev+prod VOR Deploy.

**Gelernt:** Wenn eine Verhaltens-Stufe Rechte vergibt, gehört sie im
Entscheidungsweg VOR das Break-Glass (sonst erzeugt ein verdientes Recht
Support-Warnzeilen) und hinter einen „kann diese Capability überhaupt aus
einer Stufe folgen?"-Filter (sonst zahlt jede der 31 Prüfungen eine
DB-Abfrage). Und „darf X setzen" und „gehört zum Stab" sind zwei Fragen —
eine geteilte Capability hätte TL4 still die Moderations-Queue geöffnet.

### F1 gemeinsames Paket, Teilpaket 2 — Mehrfach-Verleihung + Benachrichtigung ✅ 2026-08-04

**Davids Go** („mach direkt mit teilpaket 2 weiter"). `user_badges` ist
mehrfachfähig (posts-015: additives `qualifier`, NEUER Unique-Index über vier
Spalten ZUERST, dann NULL→''-Backfill — MariaDB-NULL kollidiert in einem
Unique-Index mit nichts —, ERST DANN der alte Index weg; kein Fenster ohne
Netz). Zuordnung als Katalog-FELD `awardedPer`: Posting-Gruppe je INHALT
(Merkmal = Row-Id), **Jahrestag je Mitgliedsjahr** (Fenster mit Anfang UND
Ende — mit bloßem „seit" wäre jedes alte Jahr qualifiziert, sobald jemand
heute schreibt), Erste-Male/Bestandsschwellen einmalig; ein Test nagelt die
drei Listen namentlich fest. Verleihung an DREI Orten: Stimm-Routen melden
den neuen Score über den neuen Core-Vertrag `reportContentUpvotes`
(vorher-gegen-nachher — sonst liefe jede weitere Stimme auf einem beliebten
Beitrag dauerhaft in nutzlose 409), Zähl-Buchung prüft zählerbasierte
Schwellen, Beim-Hinsehen bleibt Nachzügler-Netz (verleiht Inhalts-Abzeichen
nur mit leerem Merkmal und nur, wenn noch GAR keine Zeile existiert).
Benachrichtigung: neuer Typ `badge.awarded` (scope 'tenant', C15) mit
Pflicht-Zweig in der Glocke (C17, Netz-Test erweitert) und fester
`rowId = sha256(community·user·badge·qualifier)` — Glocke und Mail bleiben
einmalig, auch wenn zwei Wege denselben Verdienst gleichzeitig sehen. Die
Zeile speichert i18n-SCHLÜSSEL; Glocke übersetzt beim Betrachter, Mail über
die neue `notificationText`-Registry in `prefs.emailLocale` (posts liefert
seine eigenen Locale-Texte — keine zweite Wortliste in core). Galerie zeigt
„×N". Migration dev+prod VOR dem Deploy. Umsetzung Opus-Agent, Prüfung hier
(Tore selbst grün: posts 239, core 637; Migrations-Reihenfolge und
Crossing-Regel gelesen).

**Gelernt:** Ein Unique-Index ersetzt einen anderen nur DANN ohne Lücke, wenn
der Backfill dazwischen liegt — Appwrite gibt Bestandszeilen NULL, und NULL
ist in MariaDB-Unique-Indizes mit nichts gleich; ohne Backfill hätte eine
Altzeile eine frische ''-Verleihung nicht abgewehrt. Und Schwellen prüft man
als ÜBERQUERUNG (vorher/nachher), nie als Zustand — sprungfeste Differenz
statt `===`, sonst verliert ein 9→11 die 10.

### F1 gemeinsames Paket, Teilpaket 1 — mitschreibende Zähler + posts.editedAt ✅ 2026-08-04

**Davids Go** („starte das gemeinsame paket") plus drei per Frage abgenommene
Architektur-Entscheidungen (DECISION-LOG 2026-08-04): TL speisen das
bestehende RBAC · TL1–3 automatisch, TL4 von Hand · Mehrfach-Verleihung für
ALLE sinnvoll zählbaren Abzeichen (Revision der „genau einmal"-Regel — auch
Jahrestag künftig jährlich; kommt in Teilpaket 2). Gebaut in Teilpaket 1:
Tabelle `member_counters` (posts-013; EINE Row je communityId+userId, fünf
Zähler + `seeded`), Schreib-Vertrag `recordUserCounterEvents` in core
(comments zählt mit, ohne posts zu kennen — A14), atomar über
`incrementRowColumn`/`decrementRowColumn` (kein Read-Modify-Write),
Vorzeichen-Regel `upvoteDelta` PUR in core/shared (posts- UND comments-Stimme
teilen sie; nur Aufstimmen zählen, Entscheidung 4), Lazy-Seed beim ersten
Hinsehen statt Massen-Backfill (+ einseitige Selbstheilung: Aggregat höher ⇒
Zähler zieht nach). Dazu `community_posts.editedAt` (posts-014, NUR echte
Titel-/Text-Änderung — Zustands-/Kategorie-Wechsel setzen es nicht),
„bearbeitet"-Hinweis an der Karte und das Abzeichen „Nachgebessert"/„Editor"
(erste EIGENE Bearbeitung; Moderator-Edits erreichen die Zählstelle nie).
`member_counters` ist ab Tag 1 im GDPR-Export UND in der Löschung.
Migrationen posts-013/014 dev+prod VOR dem Deploy. Umsetzung Opus-Agent,
Prüfung hier (Tore selbst grün: posts 222, core 624; Vorzeichen-Regel und
Aufrufstellen gelesen).

**Gelernt:** Beim Zählen einer Stimme bewegt sich der Zähler von ZWEI
Menschen — und der zweite (der Autor) hat gerade NICHT gehandelt: `actor:
'operator'` an der Zähl-Buchung ist deshalb die Wahrheit, nicht Bequemlichkeit
(sonst machte A5 den Beschenkten zum Mitglied). Und ein Formular, das beim
Speichern immer ALLE Felder mitschickt, macht aus „Feld im PATCH vorhanden"
kein Signal — die editedAt-Regel muss Titel/Text VERGLEICHEN, nicht auf
Anwesenheit prüfen.

### F1 — Jahrestag-Abzeichen + Beitritts-Zahl der About-Seite ✅ 2026-08-04

**Davids Go** („starte f1"; Teil-5-Entscheidung 1 im DISCUSSIONS-KONZEPT).
Beide Stücke fehlten aus DEMSELBEN Grund — das Beitrittsdatum liegt in
`community_members` im Control Plane — und kommen deshalb über EINEN neuen
Registry-Vertrag: `registerCommunityJoinDatesResolver` (core, Geschwister des
Ehemaligen-Vertrags; EIN Vertrag mit ZWEI Methoden nach dem
userDataContributor-Muster, damit keine App nur die Hälfte verdrahtet),
Implementierung im control-Layer (Cross-Projekt-Read, 60-s-Caches),
verdrahtet in apps/platform. „Jahrestag": Beitritt ≥365 Tage her UND ≥1
eigener Inhalt (Beitrag ODER Antwort) in den letzten 365 Tagen — beim
Hinsehen, genau einmal, keine Benachrichtigung; die Datumshälfte läuft über
ein optionales `since` im bestehenden Zähl-Vertrag (KEIN Umbau auf
mitschreibende Zähler — das bleibt Teil-5-Paket 4–6). About-Seite: fünfte
Kachel „Beitritte (7 Tage)", nur `status='active'`, und sie erscheint NUR,
wenn die Antwort echt ist — `null` (Silo, keine Naht, Lesefehler) heißt
„Kachel fehlt", nie 0; für Gäste geschlossener Communities fällt sie weg
(C18). Keine Migration, keine neue Tabelle, keine neue Service-Naht.
Umsetzung Opus-Agent, Prüfung hier; Beweise: env-gebundener Control-Test 8/8
gegen echte Appwrite ($createdAt = Beitrittsmoment, removed/invited fallen
raus, Datums-Query zählt richtig), Dev-Server: About-API liefert
`signupsLast7Days: 16`, Kachel rendert im SSR, `anniversary` im Katalog.

**Gelernt:** „Unbekannt" braucht im Bedingungs-Code eine EIGENE Aussage —
bei Zählern wird fehlend zu 0 und fällt unter jede Schwelle, bei einer
Mindest-DAUER ginge „unbekannt" sonst als „lange genug" durch. Und:
`community_members` hat kein Datums-Feld — `$createdAt` der Zeile IST das
Beitrittsdatum (alle vier A5-Wege legen sie im Beitrittsmoment an); nur
A5-`legacy`-Übernahmen tragen das Übernahme- statt des echten Datums.

### Analytics v2, Pakete 3+4 — Bewerbung, Hilfe, Datenschutz ✅ 2026-08-04

**Davids Go** („mach weiter mit paket 3+4"), Texte vorab wörtlich abgenommen
(AskUserQuestion mit Vorschau). Landing: Produktseite `/products/analytics`
(+ `/de/produkte/analytics`, Slug in beiden Sprachen gleich — keine
Redirects), 7. Produkt in Kopf-Ausklapper/Karten/Sitemap, Pricing-Highlight
„Besucherstatistik ohne Cookies" bei Personal UND im „alles aus
Personal"-Satz von Pro (nicht angehängt — sonst läse es sich als
Pro-Zusatz). Hilfe: `anleitung/produkte/analytics` (nur DE — die Hilfe fährt
bewusst no_prefix/de) + Zeilen in Produkt- und Plan-Tabelle. Recht: der
abgenommene Plausible-Satz als Abschnitt „Reichweitenmessung" in der
Datenschutz-VORLAGE (wirkt nur auf neu geseedete Seiten — Bestand ist
Kundeninhalt; der Satz steht im Hilfe-Artikel zum Kopieren) UND im
Landing-Datenschutz (Abschnitt 8 — die Landing trackt ja selbst).
Umsetzung Opus-Agent, Prüfung hier; Dev-Beweise DE+EN (H1, 4 Häkchen,
Pricing, Sitemap, Hilfe-Artikel), OG-Bilder auf Davids Maschine erzeugt.

**Gelernt:** Die Produktseite zählte ihre Häkchen mit einer FESTEN 6 — ein
Produkt mit 4 Zeilen hätte zwei ROHE i18n-Schlüssel gerendert (vue-i18n gibt
fehlende Schlüssel als Text zurück, kein Fehler, kein Leerlauf). Jetzt zählt
der Text selbst (`te()` bis zur ersten Lücke). Und: der OG-Generator
überschreibt ALLE Bilder — ein Diff dort ist nicht automatisch Drift,
diskussionen-de/en waren schlicht seit dem „Kommentare"-Rename veraltet und
sind mit dem Lauf ehrlich geworden.

### Analytics v2, Pakete 1+2 — Aktiv-Schalter (Sammel-Site) + Zahlen im Dashboard ✅ 2026-08-04

**Davids Go** („leg los mit 1+2") noch am Tag der v1. Der geplante Weg —
Site-Automatik per Sites-API — fiel bei der Vorprüfung: die CE v3.2.1 hat die
Provisioning-Routen NICHT (404 auch mit Auth-Header; am Quellcode bestätigt,
`on_ee`-Block im Router). Davids Wahl darauf: **Sammel-Site + Hostname-
Filter**. Alle Pool-Communities tracken in EINE Plausible-Site
`communities.pukalani.app`; „Aktivieren" ist nur noch ein Schalter
(`analytics_settings.enabled`, Migration analytics-002), das BYO-Feld aus v1
bleibt als „Erweitert" und gewinnt. Zahlen holt die neue Route
`GET /api/analytics/stats` (Owner-Capability, dann Tarif-Gate): fünf parallele
v2-Queries (heute · 30-Tage-Totals · Zeitreihe · Top-Seiten · Top-Quellen),
bei der Sammel-Site mit `["is","event:hostname",[host]]` — der Host kommt
IMMER aus dem Request, nie vom Client. Key „pukalani-stats" server-only
(`NUXT_ANALYTICS_STATS_API_KEY`, ops:site-env-Pflicht auf drei Sites).
Umsetzung Opus-Agent, Prüfung + Setup (Plausible-Site, Key, Envs via ploi,
Migrationen dev+prod VOR dem Deploy) hier. Beweise: API-Vertrag komplett per
curl verifiziert (Hostname-Aufschlüsselung UND -Filter isolieren nachweislich
je einen Host), Dev-Server: Config-Form `{scriptId, ownScriptId, enabled}`,
Stats ohne Session 401; 33 Layer- + 604 Core-Tests grün.

**Gelernt:** Plausibles `date_range:"30d"` endet GESTERN — ein heute
geseedeter Event erscheint dort nicht (nur in `"day"`); wer das beim
Verifizieren nicht weiß, hält den korrekten Filter für kaputt. Und: die
LiveView-Formulare der Plausible-UI schlucken den ersten programmatischen
Klick nach dem Laden — `form.requestSubmit()` per JS ist der verlässliche Weg.

### Plausible-Analytics: drei Betreiber-Sites + Produkt „Analytics" v1 ✅ 2026-08-04

**Anlass:** David wollte Plausible (self-hosted, plausible.hawaii.studio) auf
pukalani.app; daraus wurden zwei Pakete. **Paket 1:** marketing, comments und
portfolio tracken in je eine eigene Plausible-Site — über das bestehende
Config-Gate `pukalani.analytics`, additiv um das v3-Snippet erweitert
(`snippet: 'v3'` + volle Script-URL; die Site-Zuordnung steckt in der
Script-Id `pa-…`, Outbound/Downloads/Formulare hängen serverseitig an der Id).
Alle drei in Plausible verifiziert (Dashboard „1 current visitor"). Kein
Consent-Banner: Plausible ist cookielos. **Paket 2 (Davids Entscheidungen:
Script-Id-Variante jetzt, Produktname „Analytics", ab Personal, Pool+Silo):**
neues Produkt-Layer `packages/analytics` — Tabelle `analytics_settings`
(EINE Row je Community bzw. je Silo-Instanz, Unique-Index auf `communityId`),
`GET /api/analytics/config` (öffentlich, fail-soft, Microcache 60 s je
Mandant) + `PATCH /api/analytics/settings` (neue Capability
`community.analytics` nach F37-Muster, dann `requirePlanProduct`), Dashboard-
Seite `/dashboard/analytics`, Head-Injection im Core-Plugin (SSR über
`useRequestFetch` — Host-Header! — und `useState`-Transport). Umsetzung
Opus-Agent, Prüfung hier; Beweis am Portfolio-Dev-Server: ohne Row statisches
Script, Row `pa-testDevProbe…` gewinnt, Row weg ⇒ statisch zurück.

**Sicherheitsentscheidung (der Kern des Entwurfs):** NIE eine freie
Script-URL oder ein freies Snippet vom Kunden — nur die Id (`^pa-[A-Za-z0-9_-]
{8,80}$`, Regel EINMAL in `core/shared/analyticsScript.ts`, Head und
Validierung teilen sie). Eine freie Adresse wäre die Erlaubnis, fremden Code
auf einem Host auszuführen, dessen Cookies unsere Sessions tragen.

**Gelernt:** Plausible schiebt den Auto-Pageview auf, solange der Browser-Tab
`hidden` ist — in einem automatisierten Hintergrund-Tab sieht das wie „Snippet
feuert nicht" aus, ist aber gewolltes Verhalten (im Script-Code verifiziert).
Und: das neue v3-Site-Script trägt seine Config serverseitig; die Checkboxen
in der Plausible-UI ändern das Snippet nicht mehr.

### F1 Stufe 2 — Aktivität, Views, About, Guidelines ✅ 2026-08-04

**Go von David** nach der Vier-Fragen-Runde. Umsetzung Opus-Agent (5 Commits),
Prüfung hier; Migrationen posts-009/010 VOR dem Deploy auf `pool` und
`comments`, beides nachgemessen (`lastActivityAt` available, `post_views` mit
3 Spalten).

**Die zwei Entwürfe, die die Stufe tragen:**

- **Aktivität als Cross-Layer-Vertrag** (die Stufe-1-Schuld): core-Registry
  `registerContentActivityHandler`, posts registriert und zieht
  `lastActivityAt` nach, comments ruft `notifyContentActivity` — und kennt
  posts weiterhin nicht. Bewusst anders als beim Melde-Vertrag: ein
  unbekannter targetType ist KEIN Fehler (ein Kommentar an einem Ticket ist in
  Ordnung; ein 400 legte jede App ohne posts lahm). Handler mit
  `as+actor: 'operator'` — der Nachzug fällt weder unter M13 noch macht er
  nach A5 jemanden zum Mitglied.
- **Views: Tabelle UND Puffer, beides nötig.** Nur die Tabelle = ein Write je
  Aufruf; nur der Puffer auf der Beitrags-Zeile = `$updatedAt` wandert bei
  jedem Gast-Aufruf, jeder Feed-Abonnent bekäme leere Realtime-Ereignisse, und
  die frisch reparierte Aktivität wäre sofort wieder unwahr. `post_views`
  trägt `permissions: []` (ohne Leser kein Realtime), dedupe über den
  Rate-Limit-Store (30 min je Topic+Betrachter; IP nur als TTL-Schlüssel in
  Redis, in der Tabelle steht eine ZAHL), und wer weder Konto noch IP hat,
  wird nicht gezählt — genau die Quelle, die eine Schleife fahren würde.
  Preis, ausgesprochen: bis 60 s Verzug, Neustart verschluckt den Puffer.

**About zeigt vier Zahlen und lügt bei keiner:** Themen gesamt / 7 Tage,
Beiträge heute, Kategorien. „Aktive Nutzer", „Beitritte 7d", „Likes gesamt",
„gegründet vor N" fehlen sichtbar mit Begründung im Routen-Kopf — der älteste
Beitrag als Gründungs-Ersatz wäre genau deshalb gefährlich, weil er wie die
Antwort aussieht und eine andere Frage beantwortet.

**Guidelines** über die pages-Mechanik: eigener Seed neben `seedLegalPages`
(Guidelines erscheinen VERÖFFENTLICHT, Rechtstexte als Entwurf — deshalb kein
Schalter im selben Seed), eigen formulierter Beispieltext de+en, ein Test
prüft „kein Platzhalter, keine Rechtsaussage" als Gegenprobe.

**Bewusst nicht gebaut** (je begründet im Code): Team-Liste für alle (die
Mitglieder-Naht verlangt `team.manage` und liefert E-Mails mit — sie zu
öffnen ist eine Autorisierungs-Entscheidung, als Frage an David gestellt) ·
Profil-Links (es gibt keine öffentliche Profilseite) · Seitenleisten-Hälfte
„kommentiert" (bräuchte einen fünften Core-Vertrag — Frage an David) ·
Teilnehmer-Avatare (25 Abfragen je Seite) · Guidelines-Backfill für
Bestands-Communities (Seed läuft bei Provisionierung; Nav degradiert sauber).

**Tore** (nachgefahren): Tests grün über alle Pakete (posts 128, core 556),
Typecheck Exit 0, Lint Grundlinie, Manifeste, Doku-Links, Bilanz posts
**21/21**. Kein Live-Beweis über die Dev-Server — beide liefen gewedged aus
fremden Sitzungen (jede Route 500 mit fremden Parse-Fehlern); Live-Prüfung
folgt nach dem Prod-Deploy.

**Gelernt:** Die beiden Fallen im Auftrag („Views dürfen weder `$updatedAt`
bewegen noch Realtime feuern") haben den Entwurf bestimmt, bevor er entstand —
der Agent hat sie nicht umschifft, sondern zum Fundament gemacht
(`permissions: []` + eigene Tabelle). Fallen benennen ist billiger als sie
finden.

---

### F1 Stufe 1 — Discussions: Kategorien, Seiten, 301-Regel ✅ 2026-08-03

**Davids Baustart-Go** nach den sieben Konzept-Entscheidungen (§ 3.8).
Umsetzung Opus-Agent (4 Commits, 44 Dateien), Prüfung hier.

**Gebaut, nach Weg B** (kein eigener Layer): Tabelle `post_categories`
(posts-007, Unique **(communityId, slug)** über `createIndexSteps`) ·
additives `community_posts.categoryId` + drei Indizes inkl. Fulltext auf
`title` (posts-008) · Kategorien-Verwaltung im Dashboard hinter der neuen
Capability **`posts.manage`** (nur Admin — Moderator hat `posts.moderate`,
das ist Moderation, nicht Struktur) · öffentliche Seiten im blueprint nach dem
URL-Schema, die Kanonik-Regel pur in `discussionUrl.ts` · Sortierung
Latest/Top+Zeitraum/Categories · Basis-Filter · Titel-Suche · Seitenleiste ·
Landing-Baustein „Diskussionen" → „Kommentare".

**Die vier bewussten Auslassungen des Agenten, alle geprüft und richtig:**
Produkt-Gate bleibt `posts` (das Manifest-System erzwingt key = Ordnername —
ein `discussions`-Key wäre ein halbes Produkt; an den Routen begründet) ·
**Hot weggelassen statt gefaked** (ehrlich nur mit Rang-Spalte + Lauf; ein
Test nagelt fest, dass `hot` KEIN gültiger Wert ist) · Participants-Spalte
heißt ehrlich „Autor" (volle Beteiligung kennt nur comments — A14) ·
Activity = `$updatedAt`, Antworten bewegen ihn in Stufe 1 nicht (bräuchte
einen Cross-Layer-Vertrag; im Typ-Kommentar notiert).

**Ein echter Fund des Agenten beim eigenen Live-Beweis:** der
Kategorie-PATCH schrieb weggelassene Felder auf Vorgaben zurück — ein bloßes
Umbenennen hat eine STILLGELEGTE Kategorie wieder scharf geschaltet, mit 200.
Regel jetzt pur + getestet (`categoryPatch.ts`: „weggelassen heißt
unverändert").

**Reihenfolge eingehalten:** posts-007/008 VOR dem Deploy auf `pool` und
`comments` gefahren; Tabelle (6 Spalten), Unique-Index und `categoryId` auf
beiden `available` nachgemessen. Tore hier nachgefahren: **1621 Tests**,
Typecheck Exit 0, Lint auf der Grundlinie, Manifeste, Doku-Links, Bilanz
(posts **20/20** durch die Datentür).

**Offen und in der F1-Zeile notiert:** Stufen 2–5, der Seitenleisten-Anteil
„kommentiert" (braucht denselben Cross-Layer-Vertrag wie Activity), und die
SEO-Frage, ob die Landing-URL `/products/discussions` beim neuen Namen
„Kommentare" bleibt — bewusst Davids Entscheidung, nicht meine.

**Gelernt:** Die Ehrlichkeits-Klausel im Auftrag („weglassen und begründen
statt faken") hat funktioniert — Hot fehlt sichtbar mit Begründung und Test,
statt als Sortierung dazustehen, die nur die geladene Seite umordnet. Eine
Funktion, die nicht kann, was ihr Name verspricht, ist teurer als ihr Fehlen:
sie kostet das Vertrauen in alle Nachbarn.

---

### F46 — Der Text eines abgesagten Termins lässt sich schwärzen ✅ 2026-08-03

**Davids Entscheidung.** Ein abgesagter Termin wird NICHT ausgeblendet — die
Absage ist die Nachricht, auf die die Zusagenden ein Anrecht haben. Ist der TEXT
das Problem, wird er entfernt: Titel und Beschreibung leer, Titelbild gelöscht,
Status bleibt `cancelled`. Verworfen: ausblenden mit Benachrichtigung an die
Zusagenden — teurer, und die Absage verschwände für jeden, der die Nachricht
nicht liest.

**Umsetzung Opus-Agent, Prüfung hier.** Eine Route (`redact.post.ts`), eine
pure Regel (`canRedactEvent`, erlaubt nur für `cancelled`), eine additive Spalte
`events.redactedAt` und der Hinweis aus i18n statt eines leeren Feldes.

**Was ich nachgeprüft habe:**

- **Migration VOR dem Deploy**, in dieser Reihenfolge und nicht andersherum:
  `events-011` auf `comments` und `pool` gefahren, danach `redactedAt` auf
  beiden `available` (datetime, optional). Andersherum hätte jede Schwärzung
  `400 row_invalid_structure` geworfen — der Migrations-Kopf sagt das auch.
- **`portfolio` bleibt außen vor**, und das ist kein Versehen: die App führt den
  events-Layer gar nicht (Produkte nur themes + admin). Ihre `events`-Tabelle
  ist eine Altlast — ihr fehlt sogar `communityId`, weil die E8-3-Umbenennung
  nur dort lief, wo der Layer aktiv ist. Als Aufräum-Kandidat notiert, nicht
  angefasst (Tabellen löschen ist unumkehrbar).
- **Kein `redactedBy`.** Die events-Zeile ist öffentlich lesbar; die Id des
  Moderators dort abzulegen hieße, per Roh-REST bekanntzugeben, wer eine
  Community moderiert. Gute Entscheidung des Agenten.
- **Titelbild wird gelöscht statt umpermissioniert.** Ein geschwärzter Termin
  bleibt absichtlich lesbar — also bliebe es das Bild auch, wenn man nur die
  Rechte nachzöge. Es gibt genau eine Wahrheit über Dateirechte
  (`applyEventCoverVisibility` leitet sie aus den Row-Rechten ab), deshalb hier
  löschen wie in `cover.delete.ts`.
- **Kein Audit-Eintrag**, mit Begründung: `recordAudit` gehört dem admin-Layer,
  ein Aufruf aus events wäre ein Cross-Layer-Auto-Import (A14) und in einer
  Silo-App ohne admin zur Laufzeit nicht vorhanden. Heute protokolliert KEINE
  Moderations-Aktion etwas — diese eine zur Ausnahme zu machen gäbe eine
  Lückenlosigkeit vor, die es nicht gibt. Rechenschaft über Moderation gehört
  als EIN Vertrag für alle Aktionen gebaut, nicht als Sonderfall.

**Tore** (hier nachgefahren): events **165/165** (vorher 129), Repo ~1.570,
Typecheck über zehn Apps, Lint auf der Grundlinie, Manifeste, Doku-Links, und
`check:bilanz` diesmal vom Agenten selbst mitgezogen (events 16/17 → 17/18).

**Gelernt:** Der Agent hat die eine Frage, die zählte, selbst gestellt und
beantwortet — ob Appwrite einen LEEREN String in eine als `required` deklarierte
Spalte annimmt. Er hat es mit einer Wegwerf-Zeile auf der Dev-Instanz gemessen
statt es anzunehmen; hätte Appwrite abgelehnt, wäre das ganze Vorgehen
hinfällig gewesen. Genau solche Fragen gehören VOR den Bau, nicht in den
Bericht danach.

---

### F15 — Termine sind wieder meldbar, und jemand schaut hin ✅ 2026-08-03

**Das Problem.** Der Melde-Knopf an Terminen war am 2026-08-01 ENTFERNT worden,
weil er ins Leere meldete: die Moderation kannte nur `comment` und `post`.
Termine sind die dritte öffentliche Inhaltsart im Pool — mit Titel,
Beschreibung, Titelbild und Ort —, und für sie konnte ein Owner auf Missbrauch
nicht reagieren. Das Entfernen war ehrlicher als der Knopf, aber die Lücke
blieb.

**Gebaut** (Umsetzung Opus-Agent, Prüfung hier): Capability `events.moderate`,
Status `hidden`, Registrierung als Melde-Ziel, drei Routen (Queue, Ausblenden,
Wiederherstellen), eine eigene Dashboard-Seite und der Knopf zurück an der
Detailseite. Die Reihenfolge zählt: der Knopf kam ZULETZT, denn eine
Registrierung ohne Queue wäre dieselbe Lüge gewesen wie vorher.

**Die Entscheidungen, die ich nachgeprüft habe:**

- **Keine Migration nötig** — `events.status` ist `varchar(12)`, kein Enum,
  `hidden` sind sechs Zeichen. Der Agent hatte das nur auf der Dev-Instanz
  gemessen und das auch gesagt; ich habe es auf BEIDEN Prod-Instanzen
  nachgemessen (`pool` und `comments`, je `type=varchar size=12`). Wäre es ein
  Enum gewesen, hätte der Code-Deploy ohne vorherige Migration jedes Ausblenden
  mit einem Schreibfehler beantwortet.
- **Eigene Seite statt Abschnitt** in `/dashboard/events`: jene Seite gated auf
  `events.manage`, was ein Moderator NICHT hat — der Abschnitt wäre für genau
  die Rolle unsichtbar gewesen, für die er da ist. Das ist Audit-Befund S9
  („tote Capability"), und posts löst es seit C16 genauso.
- **Titelbild schließt automatisch mit.** `eventCoverPermissions()` leitet die
  Dateirechte ausschließlich aus `row.$permissions` ab, nie aus dem Status —
  das Entziehen des Leserechts nimmt das Cover mit. Ein `hidden`-Zweig dort
  hätte eine zweite Wahrheit eingeführt. Nachgelesen, stimmt.
- **Plan-Gate bleibt auf den Moderations-Routen.** Ich hatte das als Falle
  markiert („ein Moderator muss auch bei gefallenem Plan handeln können"). Die
  Prüfung zeigt: ALLE sechs öffentlichen Event-Routen tragen dasselbe Gate —
  fällt der Plan, ist das Produkt komplett unerreichbar, es bleibt also nichts
  Sichtbares unmoderiert. Der Fall, in dem Inhalt sichtbar IST und moderierbar
  bleiben muss (M13), hängt an der Operator-Klinke, nicht am Plan.
- **Kein Auto-Ausblenden.** Ein Termin trägt Zusagen, Kalendereinträge und
  womöglich bezahlte Tickets; bei N Meldungen zu verschwinden wäre ein Hebel,
  den eine abgesprochene Gruppe zieht. Steht als bewusste Ablehnung im Kopf der
  Route.

**Was das Gate gefangen hat:** `check:bilanz` war rot — der Agent hatte drei
Routen ergänzt und die erzeugte PRODUKT-BILANZ nicht nachgezogen (events
13/14 → **16/17** durch die Datentür). Genau dafür ist das Gate gebaut worden.
Die übrigen Tore liefen hier nach: 129/129 events, ~1.470 Tests gesamt,
Typecheck über alle zehn Apps, Lint auf der Grundlinie, Manifeste, Doku-Links.

**Offen geblieben und als F46 notiert:** ein ABGESAGTER Termin lässt sich nicht
ausblenden. Eine Absage ist die Nachricht, auf die die Zusagenden ein Anrecht
haben — ist aber der Text das Problem, kommt heute niemand daran vorbei. Das
ist eine Produktfrage, keine vergessene Zeile.

**Gelernt:** Ein Agent, der seine eigenen Unsicherheiten benennt, ist mehr wert
als einer, der fertig meldet — die wichtigste Zeile seines Berichts war „ich
habe die Spalte nur lokal gemessen". Genau die habe ich dann gegen Produktion
geprüft, und genau da hätte der Fehler wehgetan. Umgekehrt gilt: was er NICHT
erwähnte, fand das Gate (die Bilanz). Beides zusammen ist die Prüfung — den
Bericht lesen UND die Maschine laufen lassen.

---

### F2 (aus OPEN-ITEMS) — Der „Block-Editor-Worktree" ist gesichtet, übernommen und abgeräumt ✅ 2026-08-03

> Nicht zu verwechseln mit dem Audit-Befund **F2** weiter unten (doppelter
> i18n-Schlüssel, 2026-07-31) — das ist die im Kopf beschriebene
> Nummern-Kollision. Gemeint ist hier der geparkte Punkt aus OPEN-ITEMS.md.

**Was drin lag — deutlich weniger, als der Name versprach.** Ein einziger
Commit vom 2026-07-26, drei Dateien, +108/−11. Kein Block-Editor-Umbau,
sondern die kleinste sinnvolle Ausbaustufe des Seiten-Editors: **drei Ansichten
je Sprachversion** — Schreiben (Tiptap) · Markdown (Rohtext für gezielte
Korrekturen an bestehenden Bodies) · Vorschau, letztere mit EXAKT derselben
`MarkdownContent`-Komponente wie die öffentliche Seite. Dazu wurde die
Schreibfläche auf das Renderer-Subset getrimmt (kein Bild, kein Mention, kein
Durchgestrichen; dafür Inline-Code und Codeblock, die der Renderer längst
konnte und die Toolbar verschwieg), und es ist immer nur EINE Ansicht montiert
— sonst schreiben Tiptap-Serialisierung und Rohtextfeld über dasselbe
`v-model` gegeneinander.

**Warum übernehmen statt verwerfen.** Die Arbeit ist sauber begründet, hält
sich an die bestehende Architektur (ein Renderpfad, kein `v-html`) und trägt
ihre bewussten Ablehnungen als Kopfkommentar. Genau der Zuschnitt, den das
Leitprinzip Einfachheit verlangt.

**Der Übernahme-Befund.** `main` war seit der Basis viermal über dieselben
Dateien gelaufen — B6 (Seitenliste als `UTable`), C10, C12, K8. Trotzdem gab es
beim Cherry-Pick **genau einen** Konflikt: die Import-Zeile. `main` braucht
`TableColumn` (B6), die Änderung bringt `TabsItem` mit — beides nötig;
`NavigationMenuItem` ist mit B6 weggefallen und daher entfernt. Alles Übrige
verschmolz konfliktfrei; Liste und Editor stehen jetzt nebeneinander.

**Abgeräumt.** Der Worktree belegte **560 MB**. Entfernt samt Branch — nachdem
geprüft war, dass er keine uncommittete Arbeit trug und seine Änderungen auf
`main` angekommen sind (inklusive der i18n-Schlüssel `mode.write/markdown/
preview`, `markdownHint`, `previewHint`, `previewEmpty` in de UND en).

**Gelernt:** Die Angst vor dem Rebase war größer als der Rebase. Vier fremde
Commits auf denselben Dateien klangen nach Aufgeben, waren aber ein einziger
Import-Konflikt — vor dem Verwerfen fremder Arbeit erst MESSEN, was die
Übernahme wirklich kostet. Zweitens: ein ungesichteter Worktree kostet doppelt,
Plattenplatz und die offene Frage, ob dort etwas Wertvolles liegt; hier lautete
die Antwort „ja", und sie war in zwanzig Minuten zu haben, während das Ding
über eine Woche lag. Und drittens hat beim Nachtragen die eigene
Sicherungs-Zeile im Skript (`'### F2 —' not in s`) angeschlagen: die F-Nummern
sind ZWEIMAL vergeben, und ohne diese Prüfung wären zwei verschiedene Punkte
unter derselben Überschrift im Archiv gelandet.

---

### E5 — Schema-Gleichstand ist messbar statt „mitdenken" ✅ 2026-08-03

**Der Punkt lautete:** die Einzel-Instanzen fahren die `system`-Migrationen
mit, also daran denken. Eine Erinnerung ist keine Sicherung — und weil es
**kein Migrations-Register in der DB** gibt (die Idempotenz kommt vom 409),
konnte niemand nachsehen, ob eine Instanz zurückhängt.

**Erst gemessen.** Alle vier ausgerollten Instanzen (pool, control, comments,
portfolio) haben alle acht `system`-Tabellen, und die Spaltenmengen sind
**deckungsgleich**. Es gab also keinen Rückstand aufzuholen. `photos` ist
nebenbei eine Karteileiche in diesem Punkt: die App liegt im Repo, ist aber
nicht ausgerollt — kein pm2-Prozess, keine ploi-Site, keine `.env.production`.

**Nebenbefund, der wichtiger ist als der Punkt selbst:** das
Communities-Register des Control Plane enthält **genau eine** Zeile (der
Pool-Mandant `demo`) und **keinen einzigen Silo**. Der Wellen-Runner
(`pnpm migrate --wave …`) liest seine Ziele aber genau daraus und meldet
folgerichtig „keine Silo-Projekte im Register". `comments` und `portfolio` sind
Betreiber-eigene Instanzen und stehen dort bewusst nicht — sie werden einzeln
migriert (`--app`). Wer die Wellen für ein Sicherheitsnetz hält, hält also
heute nichts in der Hand; das Netz ist der neue Wächter.

**Gebaut.** `pnpm ops:schema-parity` fragt nicht „welche Migration lief?",
sondern was dabei herauskam: die Spalten der acht `system`-Tabellen, über alle
Instanzen verglichen. Verglichen wird gegen die **Vereinigung**, nicht gegen
eine gekürte Referenz-Instanz — hinkt ausgerechnet die, wäre der Wächter still
zufrieden. Eine fehlende `.env.production` wird übersprungen und gemeldet
(`photos`), damit ein nicht ausgerollter App-Ordner den Lauf nicht rot färbt.

**Beweis.** Grün über alle vier Instanzen. Zweimal rot erzwungen: mit einer
Tabelle, die es NIRGENDS gibt (alle vier rot — zeigt, dass der 404-Pfad
greift), und mit `embed_sites`, die es nur in `pool` und `comments` gibt —
gemeldet wurden exakt `control` und `portfolio`. Danach wieder grün.

**Gelernt:** „Daran denken" ist der Zustand VOR einer Lösung, nicht die Lösung.
Wo ein Register fehlt, misst man das Ergebnis statt den Vorgang — und die
Gegenprobe muss die Richtung treffen, um die es geht: dass ALLE rot werden,
beweist nur, dass das Skript etwas tut; dass genau die zwei zurückhängenden
Instanzen genannt werden, beweist, dass es das Richtige tut.

---

### D4 — Der Apex läuft auf „Full (Strict)" ✅ 2026-08-03

**Ausgangslage.** Der Zonen-Modus war auf „Full" festgenagelt: Cloudflare
verschlüsselt zum Ursprung, prüft dessen Zertifikat aber NICHT. Ein aktiver
Angreifer zwischen Cloudflare und Hetzner hätte sich als Ursprung ausgeben
können. „Full (Strict)" war nicht möglich, und der Grund stand nirgends —
gefunden hat ihn erst die Messung: der Ursprung liefert für `pukalani.app` das
Let's-Encrypt-**Wildcard**, und ein Wildcard `*.pukalani.app` deckt die WURZEL
nicht ab. Strict hätte den Apex getötet.

**Die Falle, die im Ticket fehlte.** `www.pukalani.app` zeigt **direkt** auf den
Ursprung (grau, nicht proxied) — echte Browser sprechen dort mit nginx, und dem
Cloudflare-Origin-CA vertraut **nur Cloudflare**. Ein Origin-Zertifikat im
gemeinsamen Serverblock hätte `www` für jeden Besucher zerschossen. Entschärft
war das schon: `www` hat in `before/ssl-redirect.conf` längst einen eigenen
Block mit dem Wildcard und leitet auf den Apex um. Damit schrumpfte der Eingriff
auf zwei Zeilen — plus die Entfernung von `www` aus dem `server_name` des
Apex-Blocks, damit die Trennung explizit ist und nicht von der
Include-Reihenfolge abhängt.

**Der private Schlüssel ging NICHT durchs Dashboard.** Das Ticket sagte, er
müsse — muss er nicht: Cloudflare signiert auch eine fremde CSR. Schlüssel und
CSR sind auf dem Server entstanden (`/home/ploi/certs/apex/`, `600`), nur die
CSR reiste ins Dashboard, zurück kam das Zertifikat. Der Schlüssel hat die
Maschine nie verlassen und war nie in einem Chatfenster.

**Umsetzung.** Origin-Zertifikat über die eigene CSR, Hostname **nur**
`pukalani.app` (kein Wildcard — das läge sonst als browser-untrautes Zertifikat
herum), 15 Jahre. Zertifikat gegen den Schlüssel geprüft (gleicher Modulus),
nginx-Konfiguration über die ploi-API getauscht, **reload statt restart**: ein
Reload mit fehlerhafter Konfiguration scheitert folgenlos, ein Restart ließe
nginx unten — und ohne `sudo` konnte ich `nginx -t` nicht vorher laufen lassen.
Die geteilte certbot-Lineage blieb unangetastet.

**Beweis, in dieser Reihenfolge.** Vor dem Umschalten am Ursprung nachgemessen
(SNI gegen die IP): Apex → Cloudflare Origin CA, `www`/`platform`/`demo` →
Wildcard, `control`/`comments` → eigene Zertifikate. Dann der Schalter, dann
über die Kante: Apex fünfmal `200`, `/de` `200`, `www` `301` auf den Apex, und
alle sechs übrigen Hosts `200`. `verify-tls.mjs` **11/11**. Cloudflare zeigt
„Full (strict)", Automatik weiter aus.

**Gelernt:** Ein Wildcard deckt die Wurzel nicht ab — das ist der ganze Grund,
warum diese Zone monatelang auf „Full" festhing, und es stand in keinem
Dokument. Aufgefallen ist es erst, weil ich vor dem Eingriff gemessen habe, was
der Ursprung je Namen WIRKLICH ausliefert. Zweitens: bei einem Zertifikat, dem
nur ein Vermittler vertraut, entscheidet die Frage „wer spricht hier direkt mit
dem Ursprung?" über jeden Serverblock — proxied und grau dürfen sich kein
Zertifikat teilen. Und drittens hat die Dokumentation zwei Stellen mitgeführt,
die jetzt das Gegenteil behaupteten (CLAUDE.md „Zonen-Modus fest Full",
verify-tls „am Ursprung BEWUSST ohne Zertifikat") — nachgezogen, denn genau
solche Sätze führen beim nächsten Mal die Hand.

---

### F45 — Die Betreiber-Konsole hat ihre Realtime zurück ✅ 2026-08-03

**Das Problem.** Im Appwrite-Projekt `control` war **keine einzige**
Web-Platform eingetragen. `control.pukalani.app` bekam vom eigenen Projekt
`403 general_unknown_origin` — dieselbe Antwort wie ein wildfremder Host. Damit
war auf der Betreiber-Konsole jede Realtime tot: `apps/control` hat den
Core-Default AN (F14) und zieht fünf Client-Plugins (account, auth, branding,
config, themes). Verloren waren die Sofort-Abmeldung bei Session-Widerruf, die
Live-Glocke (die hängt nach C17 ausgerechnet nur dort) und die Live-Übernahme
von Theme und Config. Die anderen drei Projekte waren in Ordnung — `pool` hat
ein Wildcard `*.pukalani.app` (deckt jeden neuen Mandanten-Host automatisch),
`comments` und `portfolio` je ihren eigenen Namen.

**Behoben.** David hat `control.pukalani.app` als Web-Platform eingetragen
(2026-08-03). Präzise, kein Wildcard: der alte Name `studio.pukalani.app`
bleibt abgewiesen.

**Beweis, beidseitig.** Vorher/nachher an der REST-Grenze: `Origin`-Header gegen
`/v1/account` — `403 general_unknown_origin` → **`401
general_unauthorized_scope`** (Host akzeptiert, nur keine Sitzung), Fremd-Host
unverändert 403. Und am echten Kanal: die erste Nachricht im Realtime-Socket
lautet für `control.pukalani.app` jetzt
`{"type":"connected","data":{"channels":["account"],…}}`, für einen Fremd-Host
weiterhin `{"type":"error","data":{"code":1008,"message":"Invalid Origin…"}}`.

**Gelernt (Diagnose-Rezept):** Der WebSocket-**Handshake** verrät nichts — er
antwortet `101 Switching Protocols` für JEDEN Origin, auch für einen
abgewiesenen. Die Ablehnung kommt erst als erste Nachricht IM Socket
(`code 1008`), und der Browser macht daraus nur ein „Realtime disconnected".
Deshalb sieht ein fehlender Platform-Eintrag exakt aus wie ein Netzproblem.
Zwei billige Messungen entscheiden es: `curl` mit `Origin`-Header gegen
`/v1/account` (403 vs. 401) oder die erste Socket-Nachricht mitlesen — für
Letzteres `--http1.1` erzwingen, über HTTP/2 scheitert der Upgrade mit 400 und
man misst sein eigenes Werkzeug.

---

### P12 — Die drei Cutover-Krümel sind weg ✅ 2026-08-03

Nach dem Control-Cutover blieben drei Reste übrig. Alle drei nachgemessen statt
abgehakt:

- `/home/ploi/releases/studio/` — **existiert nicht mehr** (die Release-Slots
  sind heute comments, control, help, marketing, platform, portfolio).
- GitHub-Secret `PLOI_DEPLOY_WEBHOOK_STUDIO` — **fort** (`gh secret list` kennt
  nur noch die drei ploi-Webhooks und den Deploy-SSH-Key).
- Web-Platform `studio.pukalani.app` im Projekt `control` — **nicht vorhanden**.

**Gelernt:** Der dritte Punkt war richtig gestellt und trotzdem irreführend
beantwortet. Gesucht wurde ein Eintrag, der zu viel ist; gefunden wurde, dass
dort ÜBERHAUPT KEINER steht — auch nicht der, der hingehört
(`control.pukalani.app`, jetzt F45). Eine Aufräum-Frage („hängt X noch da?")
misst nur die eine Richtung. Wer die Liste ganz liest statt nur nach X zu
suchen, sieht auch, was FEHLT. Die Messung dafür ist billig: eine Anfrage mit
`Origin`-Header gegen `/v1/account`, `403 general_unknown_origin` heißt „Host
unbekannt", `401` heißt „Host akzeptiert, nur keine Sitzung".

---

### F42 — Der 84-Scope-Schlüssel im Projekt `control` ist gelöscht ✅ 2026-08-03

**Das Problem.** In der Console lag ein Schlüssel mit **84 Scopes** namens
„Claude Code" — praktisch Vollzugriff auf das Betreiber-Projekt. Die Frage
„wird der noch gebraucht?" war nicht zu beantworten: die Console zeigt Name und
Scope-ZAHL, eine `.env` zeigt nur einen Wert. Welcher Schlüssel welcher ist,
sagt keine der beiden Seiten.

**Also gemessen** — `scripts/ops/probe-key-scopes.mjs`, nur GET-Anfragen, der
Schlüssel wird nie ausgegeben. `401` heißt „Scope fehlt", alles andere heißt
„Scope da" (auch `400` und `404` — beide setzen voraus, dass die Autorisierung
schon durch war; genau daran erkennt man `users.read` ohne gültige Query).

| Schlüssel | darf | darf nicht |
| --- | --- | --- |
| Laufzeit `control` | `users` | databases · buckets · functions · teams · locale · health |
| Cross-Projekt-Leser (platform) | **nur** `rows.read` | alles andere |
| Migrationen `control` (2 Dateien) | `databases` · `buckets` | users · teams · functions · topics |

Keiner davon war der große. Dazu: die GitHub-Actions haben **gar keinen**
Appwrite-Schlüssel (`gh secret list` — nur ploi-Webhooks und der Deploy-SSH-Key;
die E2E baut sich ihre Wegwerf-Instanz selbst), und die letzte lokale Datei mit
Prod-`control`-Zugang außerhalb von `~/.appwrite-secrets` ist am 2026-08-02
gelöscht worden. Zuletzt benutzt wurde er rund um den Control-Cutover, als
Migrationen von Hand liefen.

**Löschen statt eindampfen** — ein eingedampfter Schlüssel ohne benennbaren
Zweck stellt beim nächsten Console-Blick dieselbe Frage noch einmal. David hat
ihn am 2026-08-03 händisch gelöscht.

**Beweis danach.** Alle fünf Hosts antworten `ok` auf `9ee57665` (platform,
control, comments, portfolio, help), der demo-Mandant lädt — das ist der
Cross-Projekt-Leser bei der Arbeit —, ein unbekannter Host antwortet weiterhin
404 (der Resolver liest also wirklich), und beide `control`-Schlüssel messen
unverändert 2 bzw. 1 von 10 Lese-Scopes.

**Gelernt:** Eine Sicherheitsfrage, die man nur diskutieren kann, wird vertagt;
eine, die man messen kann, wird entschieden. Das Werkzeug dafür zu bauen hat
weniger gekostet als die Diskussion — und es beantwortet dieselbe Frage beim
nächsten Mal in zehn Sekunden. Die Regel steht jetzt im Runbook: ein Schlüssel
gehört zu EINER Aufgabe und trägt deren Namen; wer beim Anlegen „alles
ankreuzen" wählt, spart fünf Minuten und hinterlässt eine Frage, die Monate
später niemand mehr beantworten kann.

---

### F44 — Der Pool verschickt zum ersten Mal überhaupt Mails ✅ 2026-08-03

**Das Problem.** `apps/platform` hatte als einzige mail-versendende Instanz kein
`NUXT_SMTP_*`. Für **jede** Kunden-Community ging damit nie eine
Benachrichtigung raus — Antworten, Erwähnungen, Digest, und seit F43 die
Zahlungswarnung des Owners. Niemandem fiel es auf, weil ein fehlender Mailer
sich exakt wie ein bewusst abgeschaltetes Produkt verhält: die App läuft, die
Seiten antworten, nur die Mail bleibt aus. Gefunden wurde es zufällig, beim
Beweis für einen anderen Punkt.

**Drei Sachen sind daraus geworden.**

1. **Der Ausfall ist nicht mehr still.** `warnMailerMissingOnce()` schreibt beim
   ERSTEN verworfenen Versand einmal pro Prozess ins Log. Der erste Anlauf hing
   die Warnung an `isMailerConfigured()` — falscher Ort: diese Frage stellt der
   Digest-Sweep beim Start JEDER App, auch help, marketing und portfolio, die
   bewusst nichts verschicken. Eine Warnung, die überall steht, wird weggelesen,
   und dann ist der Ausfall wieder still, nur lauter.
2. **Ein Wächter, der es gefunden hätte:** `pnpm ops:site-env` liest über ssh nur
   die SCHLÜSSELNAMEN jeder Server-`.env` (Werte bleiben dort) und meldet
   fehlende Pflicht-Variablen. Kein CI-Gate, weil ssh. Die Pflicht-Liste ist im
   Skript gepflegt und NICHT aus `.env.example` abgeleitet — die Vorlage führt
   auch Optionales, und ein Wächter, der Optionales anmahnt, wird weggelesen.
3. **Die Vorlage selbst war eine Falle:** `NUXT_PUBLIC_APP_URL` stand zweimal in
   `apps/platform/.env.example`, oben mit Wert, unten leer. Wer sie kopiert,
   bekommt die leere — und damit kaputte Links in jeder Mail ohne
   Community-Bezug (D5-Rückfall).

**Umgesetzt.** Die fünf SMTP-Zeilen serverseitig aus `control` übernommen
(byte-gleich mit `comments`, per Hash-Vergleich ohne Klartext nachgemessen — ein
Resend-Konto für alles), `NUXT_PUBLIC_APP_URL=https://my.pukalani.app` ergänzt,
`.env.bak-f44` als Rückweg, dann `pm2 startOrReload … --update-env`.

**Beweis.** `pm2 env` zeigt alle sechs Variablen im Prozess (`smtp.resend.com`,
Port 587); `transporter.verify()` aus dem Release meldet **SMTP-Anmeldung
akzeptiert**, ohne eine Mail zu verschicken; `pnpm ops:site-env` ist auf allen
sechs Sites grün; platform, control und comments antworten unverändert `ok`.

**Gelernt:** Zwei Messfehler auf dem Weg, beide lehrreich. `/proc/<pid>/environ`
taugt bei pm2 im **Cluster-Modus** NICHT als Beleg — pm2 setzt die Umgebung im
Worker, nicht beim exec, also steht dort nichts, und das sah aus wie ein
gescheiterter Reload. Richtig ist `pm2 env <id>`. Und dessen Ausgabe trennt mit
`: `, nicht mit `=` — ein `grep "^KEY=."` zählt dort immer null und behauptet
„leer", obwohl der Wert da ist. Wer eine Konfiguration prüft, muss zuerst das
FORMAT des Prüfwerkzeugs kennen, sonst misst er sein eigenes Muster.

---

### F21 — Die Einmal-Allowlist ist scharf: `event_ticket_*` ✅ 2026-08-03

**Das Problem.** Für Event-Tickets galt nur die Grundregel „kein Plan-Key + der
Stripe-Price muss `one_time` sein". Der Ticket-Schlüssel ist aber ein
**Freitextfeld** im Dashboard (`events.priceLookupKey`): wer eine Community
verwaltet, konnte damit auf JEDEN Einmal-Preis des Stripe-Kontos zeigen — auch
auf einen, der mit Tickets nichts zu tun hat.

**Warum es jetzt ging, obwohl es bewusst offen blieb.** Der Vorbehalt war, ein
Deploy würde bestehende Ticketverkäufe mit 400 beantworten. Nachgemessen am
2026-08-03: die `events`-Tabelle ist in **beiden** Prod-Instanzen leer (0
Termine, gelesen über die Laufzeit-Schlüssel), und von den 13 aktiven Preisen
im Stripe-Testkonto hat **kein einziger Einmal-Preis** überhaupt einen
`lookup_key` — ohne den ist er nicht referenzierbar. Es gab also nichts zu
brechen. Der Vorbehalt war richtig, als er notiert wurde; er war nur nie
nachgeprüft worden.

**Die Entscheidung: Präfix statt Aufzählung.** `oneTimeLookupKeys:
['event_ticket_*']` in `apps/comments` — der einzigen App, die den
Ticket-Checkout verdrahtet (`events.ticketCheckoutPath`). Einzelne Preise sind
nicht vorhersehbar, sie gehören dem Betreiber und entstehen je Veranstaltung;
ein Namens-Präfix umreißt die Menge trotzdem eindeutig. Der Fund nebenbei: im
Testkonto liegt ein Einmal-Preis über 599 € aus einem anderen Zusammenhang —
bekäme der einen `lookup_key`, wäre er ohne Liste über die Ticket-Route
kaufbar.

**Die Regel steht am Eingabefeld.** Den Schlüssel tippt die Redaktion ein, das
Scheitern erlebt der KÄUFER — eine Allowlist, die man erst am 400
kennenlernt, ist eine Falle. Der Hilfetext unter „Preis-Schlüssel bei Stripe"
nennt das Muster jetzt, gelesen aus der Config statt hineingeschrieben (sonst
verspricht die Oberfläche irgendwann etwas, das die Config nicht mehr kennt).
Dazu Runbook-Schritt 2.2b für den Tag, an dem echte Ticketpreise entstehen.

**Beweis.** `packages/billing/tests/one-time-allowlist.test.ts` (6) +
`packages/events/tests/price-lookup-hint.test.ts` (5), Suiten 64/64 und 97/97.
Festgenagelt ist auch, was am leichtesten kaputtgeht: ein nacktes `*` erlaubt
NICHTS, ein `*` mitten im Muster gilt nicht als Platzhalter, und ein Plan-Key
fliegt VOR der Allowlist raus (sonst könnte eine schlampige Liste ein Abo als
Einmalkauf öffnen).

**Gelernt:** Ein „wartet auf X"-Punkt kann längst fällig sein — hier lag der
Vorbehalt („es gibt bestehende Verkäufe") seit Wochen unwidersprochen in der
Liste, und die Messung dauerte fünf Minuten. Vor dem Vertagen einmal nachsehen,
ob die Bedingung überhaupt noch gilt. **Nicht browser-verifiziert:** der
Hilfetext ist über Quell-Anker und beide Locale-Dateien geprüft (Platzhalter
`{patterns}` vorhanden, Feld nutzt den berechneten Text, Config gesetzt) — die
gerenderte Darstellung habe ich nicht aufgerufen, weil dafür ein eigener
Dev-Server samt Anmeldung nötig gewesen wäre; das Layout ändert sich nicht.

---

### F20 — Nur Karte: SEPA und Kauf auf Rechnung abgeschaltet ✅ 2026-08-03

**Die Entscheidung.** David: „nur Karte, SEPA und Rechnung abschalten."

**Warum das eine Code-Zeile und kein Dashboard-Klick ist.** Vorher setzte
KEINE unserer vier Checkout-Erzeugungen `payment_method_types` — was im
Checkout erschien, entschied allein das Stripe-Dashboard. Ein einziger Klick
dort, auch versehentlich oder auf Stripes eigene Empfehlung hin, hätte den
verzögerten Zahlungspfad scharf gemacht. Jetzt gibt der Code die Liste mit,
und sie gewinnt gegen die Voreinstellung: die Entscheidung steht damit dort,
wo sie überprüfbar ist.

**Warum ausgerechnet Karte.** Verzögerte Methoden trennen „durch den Checkout"
von „bezahlt": `checkout.session.completed` feuert mit
`payment_status: 'unpaid'`, belastet wird Tage später, und das kann scheitern.
Für ein Abo wäre das verkraftbar — für ein **Event-Ticket** nicht: der Käufer
stünde ohne Ticket da und verstünde nicht, warum, denn aus seiner Sicht hat er
bezahlt.

**Was ausdrücklich NICHT geändert wurde.** `mayFulfillCheckout` (Erfüllung
hängt am `payment_status`, nicht am Event-Namen) bleibt unverändert. Eine
Karten-Zahlung kann über 3-D-Secure ebenfalls in `unpaid` landen, und wer die
Methoden-Liste eines Tages erweitert, soll dabei keine stille Lücke aufreißen.
Der Kommentar dort behauptete allerdings, niemand setze `payment_method_types`
— er ist mitgezogen worden.

**Umsetzung.** Ein Wert an EINER Stelle
(`packages/billing/shared/paymentMethods.ts`) statt vier Kopien; die vier
Aufrufstellen reichen ihn durch (2× `fulfillment.ts`, `checkout.post.ts`,
`apps/control/.../communityCheckout.ts`). Dazu Runbook-Schritt 2.5, der jetzt
„nichts zu tun" sagt.

**Beweis.** `packages/billing/tests/payment-methods.test.ts` (3 Tests, Suite
58/58): der dritte liest die QUELLE und verlangt das Feld an JEDER
`checkout.sessions.create`-Stelle im Repo. Gegenprobe gemacht — Feld in
`communityCheckout.ts` entfernt ⇒ rot, mit Dateinamen im Fehler; wieder
eingesetzt ⇒ grün.

**Gelernt:** Zwei Fallen in EINEM Quell-Wächter, beide beim Schreiben
aufgelaufen. Erstens fand der Test **sich selbst** als Verstoß — er nennt den
gesuchten Aufruf ja im Klartext; `tests/`-Dateien gehören aus dem Scan. Und
zweitens braucht so ein Test eine untere Schranke auf die Trefferzahl
(`calls >= 4`): findet der Scan eines Tages nichts, weil ein Ordner umbenannt
wurde, wäre er sonst grün — ein stillgelegter Wächter sieht genauso aus wie
ein zufriedener.

---

### F39 — Plan-Zuordnung und Kontingent-Zahlen bestätigt ✅ 2026-08-03

**Die Entscheidung.** David: „passt so, übernimm die Zahlen." Damit sind die
am 2026-08-02 vorgeschlagenen Werte verbindlich — Mediathek ab **personal**,
Activity-Feed ab **basic** (`pukalani.tenancy.products`), Kontingente
`media 50/Tag · 300 gesamt` (personal) bzw. `200/Tag · 1.000` (pro) und
`events 50/Tag · 1.000` bzw. `200/Tag · 10.000`.

**Was sich im Code geändert hat: nichts an den Zahlen.** Sie waren gesetzt und
live, nur mit einem ⚠️-Vorbehalt versehen. Entfernt wurden genau diese
Vorbehalte — in `apps/platform/app/app.config.ts` (Quota-Block und
`tenancy.products`) und in `apps/platform/site.manifest.ts`. Die Herleitungen
bleiben stehen: sie sind die **Begründung** einer Zahl, nicht ihr Vorbehalt,
und wer sie später ändert, soll lesen können, woher sie kam (freie Platte
27 GB aus E3, ~4 MB je Foto, `SERIES_MAX_PER_RUN = 26` als Untergrenze für
`events.perDay`).

**Warum das kein Deploy-Zwang ist.** Beide Achsen bleiben ohne Code-Änderung
umstellbar, die Kontingente sogar ohne Deploy: der editierbare Katalog
`community_plans` (control-014) greift pro Plan VOR diesen Werten
(`tenantsResolver.ts` → `tenant.limits`). Die Werte hier sind der Rückfall,
nicht die einzige Wahrheit.

**Gelernt:** Ein „VORSCHLAG"-Kommentar im Code ist eine Frage an einen
Menschen, und Fragen gehören in die eine offene-Punkte-Liste, nicht in eine
Konfigurationsdatei — dort liest sie niemand, der nicht ohnehin schon
hinsieht. Richtig war deshalb, den Vorschlag zusätzlich als F39 zu führen;
falsch wäre gewesen, sich auf das ⚠️ im Code zu verlassen. Und beim Abhaken
zählt der Rückweg: derselbe Vorbehalt stand an **vier** Stellen (zwei Blöcke
in `app.config.ts`, zwei Zeilen im Manifest) plus einmal historisch im
Archiv — wer nur die auffälligste löscht, hinterlässt eine Datei, die die
Entscheidung immer noch als offen beschreibt.

---

### F43 — Die Zahlungswarnung eines Community-Abos landet in der Community-Glocke ✅ 2026-08-03

**Das Problem.** Ein Community-Owner wurde über KEINEN Kanal gewarnt, wenn
seine Zahlung ausblieb — 14 Tage später schaltete der M13-Sweep die Community
auf nur-lesend, ohne dass je ein Hinweis angekommen war. Ursache: der
Stripe-Webhook läuft auf `control`, `metadata.userId` eines Community-Checkouts
ist aber eine **Pool**-Nutzer-Id. Im control-Projekt gibt es sie nicht
(nachgemessen: `users.get` → 404 `user_not_found`). Die Glocken-Zeile bekam
`read(user:<pool-id>)` und war für niemanden lesbar, und `maybeSendInstantEmail`
scheiterte an derselben Nachschlage.

**Davids Entscheidung.** Die Warnung gehört dorthin, wo der Owner eingeloggt
ist: in die **Community-Glocke** seines Mandanten-Hosts, mit Link auf
`/dashboard/settings/subscription`. Das schärft C15, hebt es nicht auf — bei
einem KONTO-Abo (Silo, Einzelvertrag) bleibt die Warnung `scope: 'account'`,
weil dort ein Konto der Vertragspartner ist. Dass kein anderes Mitglied sie
sieht, war nie Sache des Ablage-Stempels, sondern der Row-Permissions
(`read(user:<owner>)`) — und das bleibt so.

**Der gewählte Weg: der Pool merkt es selbst.** Der Webhook stempelt weiter nur
`communities.billingStatus` + `pastDueSince`; ein stündlicher Lauf der
Platform-App liest die überfälligen Communities über den bereits vorhandenen
read-only-Cross-Projekt-Key, sucht ihren Owner in `community_members` und
schreibt die Meldung im Pool. Dieselbe Arbeitsteilung wie bei M13 (Webhook
stempelt, Sweep entscheidet).

**Warum NICHT die naheliegende Service-Naht control→platform.** Sie wäre
sofort, aber sie kostet: ein zweites Secret, einen Dienst-Endpunkt auf einem
öffentlichen Mehr-Mandanten-Host — und einen Geldpfad, der von der
Erreichbarkeit der Platform-App abhängt. Der Webhook muss transiente Fehler
WERFEN (Stripe-Regel), ein Platform-Neustart löste also Stripe-Retrys auf den
ganzen Geldpfad aus. Gekauft hätte man damit Sofortigkeit — neben einer
14-Tage-Frist wertlos. Das Control Plane KANN die Zeile ohnehin nicht selbst
anlegen: es hat keinen Schlüssel für das Pool-Projekt (dieselbe Grenze, wegen
der die Runtime `revokeCommunityLabel` zieht, A5).

**„Genau einmal" ohne Raten.** `notify()` hat einen Idempotenz-Schlüssel
bekommen (`rowId`): derselbe Schlüssel schreibt genau eine Zeile, der zweite
Versuch läuft in Appwrites 409 und ist ein No-op — ohne Glocken-Zeile UND ohne
Mail (`created: false`). Kein „erst nachsehen, dann schreiben": zwischen
Nachsehen und Schreiben passt ein zweiter Lauf. Der Schlüssel ist
`sha256(communityId | pastDueSince | recipientId)` — `pastDueSince` trennt die
Verzugs-EPISODEN (wer bezahlt und später wieder offen ist, wird erneut
gewarnt), `recipientId` trennt die Owner (sonst gewänne der erste das Rennen).
`notify()` ist dafür jetzt auch ohne `H3Event` aufrufbar und nimmt den
Ablage-Wert per `communityId` explizit entgegen — ein Sweep hat keinen
Mandanten-Kontext.

**Beweis.** Neu: `packages/onboarding/scripts/verify-past-due-notice.mjs`
(**28/28**) — Glocke, Mail (Mailpit), fremdes Mitglied sieht nichts,
Row-Permissions direkt an der Zeile nachgemessen, zweiter Lauf meldet nichts,
neue Episode meldet wieder, bezahlte und fremdprojektige Communities werden
übersprungen, Fremde können den Lauf nicht auslösen. Unverändert grün:
`verify-community-suspension` **117/117**, `verify-site-authz` **118/118**.
Dazu Unit-Tests für die pure Auswahlregel, den Schlüssel und die
Webhook-Weiche (`paymentFailureAudience`).

**Gelernt:** Der Mail-Zweig war lokal still, weil `apps/platform/.env` kein
`NUXT_SMTP_*` trug — `isMailerConfigured()` gibt dann sauber `false` zurück,
und der ausbleibende Versand sieht aus wie ein Code-Fehler. **Jede App, die
`notify()` ruft, braucht ihre eigene SMTP-Konfiguration**; für die
Platform-Instanz auf dem Server ist das noch zu setzen (bisher hatte nur
`control` sie). Zweitens: in dieser Kette heißen ZWEI verschiedene Werte
`communityId` — `community_members.communityId` ist `communities.$id`,
`notifications.communityId` ist `communities.tenantId`. Beide Wege sind
fail-soft, eine Verwechslung erzeugt also nichts als Stille.
### G5 — Der Reconnect-Sturm auf 404-Hosts ✅ 2026-08-03

**Der Nachzügler zu Befund 3 des M13-Wechselwirkungs-Audits.** Dort war der
Presence-Heartbeat auf der 404-Seite eines `abuse`-gesperrten Hosts stillgelegt
worden; beim Beweis dafür fiel daneben ein deutlich größeres Rauschen derselben
Klasse auf, das bewusst offen blieb. Es ist jetzt reproduziert, erklärt und
behoben.

**Die Kette — am Code hergeleitet, im Browser bestätigt.** `useError()` ist auf
so einer Seite gesetzt, der Auth-Store aber **hydriert**: Nuxt lässt für seinen
internen `/__nuxt_error`-Durchgang die Mandanten-Middleware passieren (C12b),
also läuft `02.auth.ts` und der Nutzer ist eingeloggt. Damit startete
`realtime-account.client.ts` seinen cookie-nativen WebSocket. Der kann dort nie
stehen — und **jedes Schließen** zog ein `auth.refresh()` nach sich, also
`GET /api/auth/me` **+** `GET /api/community/role`, beide garantiert 404. Der
Beweis für die Urheberschaft steht im Takt: 1,1 s · 2,2 · 4,2 · 8,2 · 16,3 ·
31,3 · 46,3 — exakt `min(1000·2^n, 15_000)` aus `scheduleReconnect()` in
`useRealtimeAccount`. Kein anderer Aufrufer von `auth.refresh()` läuft
ungefragt (die übrigen sieben hängen alle an einer Nutzeraktion).

**Zwei getrennte Fehler, zwei getrennte Fixe.**

**(a) Auf einer Adresse, die es nicht gibt, wird nichts mehr gestartet.** Neue
Regel `startWhenHostResolves()` (`core/app/utils/hostGate.ts`), benutzt von
`realtime-account`, `realtime-config` (core) und `realtime-themes` (themes).
`realtime-branding` braucht sie nicht — ohne `useSiteId()` steigt es ohnehin
aus. Bedingung ist **`isUnknownHostError`, nicht `useError()` schlechthin** —
und das ist der bewusste Unterschied zu Befund 3: ein 404 auf einer
Tippfehler-URL einer **gesunden** Community ist etwas anderes. Dort lebt der
Host, die APIs antworten, und der Account-WS erfüllt seinen Zweck
(Sofort-Abmeldung bei Session-Widerruf). Ihn dort abzuschalten wäre kein
Sparen, sondern der Verlust eines Sicherheitssignals. Benutzt wird dieselbe
Regel, mit der die Fehlerseite ihren eigenen Satz wählt (`CoreErrorPage`,
`shared/unknownHost.ts`) — Seite und Verhalten behaupten damit garantiert
dasselbe. **Nachgeholt, nicht verworfen:** räumt `clearError()` den Fehler,
startet das Abonnement doch noch; ein blosses `return` liesse einen Tab, der
einmal auf einer 404 war, für den Rest der Sitzung ohne Realtime.

**(b) Der Auth-Nachtrag ist entkoppelt, nicht nur umgeleitet.** Die eigentliche
Verstärkung war „ein Verbindungsabbruch = ein Doppel-Abruf". Neue pure Regel
`accountVerifyDue()` neben dem Realtime-Gate (`shared/realtimeGate.ts`, 30 s
Mindestabstand, unit-getestet). Der Verlust ist klein und benannt: ein Widerruf
ist ein **einmaliges** Ereignis, nach einer normal stehenden Verbindung liegt
die letzte Prüfung lange zurück und die Abmeldung kommt **sofort** — nur wenn
ohnehin gerade geflappt wird, kann sie sich um bis zu 30 s verzögern, und dort
ist die Verbindung sowieso unbrauchbar. `0` heisst „noch nie geprüft" und ist
**ausdrücklich** immer fällig, statt sich darauf zu verlassen, dass `Date.now()`
größer als der Abstand ist (sonst verschwände in jedem Test mit gefälschter
Zeit genau die Abmeldung, um die es geht).

**Zur dritten Frage (exponentieller Backoff): unser Code hatte ihn schon, das
SDK hat ihn nicht.** `useRealtimeAccount` staffelt 1 → 15 s und setzt den
Zähler nur nach einer **stabilen** Verbindung (≥ 5 s) zurück — die Messung oben
zeigt die Treppe. Die 58 Konsolenzeilen „Realtime disconnected. Re-connecting
in **1** seconds." kommen aus dem **Appwrite-Web-SDK**: dessen `createSocket`
setzt `reconnectAttempts = 0` im `open`-Handler, nicht nach einer Weile. Ein
Server, der die Verbindung annimmt und sofort wieder schließt — degradierter
`appwrite-realtime`-Container, abgelehnter Origin — hält den Zähler damit für
immer auf 0, und die Staffelung (1 s → 5 s → 10 s → 60 s) wird nie erreicht.
Das ist Fremdcode ohne Haken; der einzige Hebel von hier aus ist, gar nicht
erst zu abonnieren. Deshalb kein eigener Backoff-Umbau — die Änderung wäre eine
Attrappe.

**Beweis (Playwright, echte Appwrite, Dev-Server aus dem Worktree auf 3016,
je 60 s auf der 404-Seite eines `abuse`-gesperrten Hosts mit eingeloggter,
hydrierter Session):**

| | WebSockets | `/api/*` | Konsole „Realtime disconnected" |
| --- | --- | --- | --- |
| vorher | **66** | **15** (7 × `me`+`role`, 1 × `realtime-token`) | **58** |
| nachher | **1** (Vite-HMR) | **0** | **0** |

**Gegenprobe, damit „gar nichts" nicht als Erfolg durchgeht** (gesunder Host,
30 s): auf `/` läuft Realtime weiter (52 WS-Versuche, `realtime-token`,
Presence-Heartbeat) — und darin **eine einzige** `me`+`role`-Prüfung statt der
fünf, die der alte Takt in derselben Zeit gemacht hätte: Fix (b) sichtbar. Auf
einer gewöhnlichen 404-Unterseite (`/gibt-es-nicht`, HTTP 404) startet Realtime
**ebenfalls** — genau der Unterschied zu Befund 3.

`pnpm -r test` grün (core 544), typecheck 0 Fehler, lint 0 Fehler / 5 bekannte
Warnungen, `check:manifests` und `check:single-copy` konsistent.

**Gelernt:** (1) **Ein Reconnect-Takt ist eine Unterschrift.** Die Deltas
1,1 · 2,2 · 4,2 · 8,2 · 15 · 15 haben den Verursacher eindeutig benannt — ohne
Zeitachse im Netzwerk-Log wäre „irgendwas pollt" die einzige Aussage geblieben.
Bei Rausch-Befunden deshalb immer die **Abstände** mitschreiben, nicht nur die
Summen. (2) **Der Browser-Tab in der Vorschau-Leiste drosselt seine Timer.**
Eine erste Messung dort ergab nach 62 s Wandzeit nur 15,6 s Seitenzeit und
damit ein Sechstel der Ereignisse — das sah aus wie ein viel kleineres Problem.
Zeitbasierte Beweise gehören in einen skriptgesteuerten Browser.
(3) **`fetch` in Node löst `kunde-a.localhost` nicht auf** (nur Chromium tut
das intern) **und Nitro hört auf `::1`** — beides zusammen ergab einen
Prüf-Poller, der stumm ewig lief. Die Projektregel „node:http über ::1 mit
gesetztem Host-Header" gilt für Beweis-Skripte **und** ihre Hilfsschleifen.
(4) **Eine „0 = noch nie"-Konvention muss im Code stehen, nicht in der Uhr.**
Der erste Testlauf fiel um, weil `accountVerifyDue(0, 1)` rechnerisch nicht
fällig war — die Absicht hing daran, dass `Date.now()` groß ist.

---

### G4 — Sicherheits-Paket: Session-Handoff, Einladungen, Drosseln, IP ✅ 2026-08-02

**Was geprüft wurde.** Neun Befunde aus einem Sicherheits-Audit über
`packages/core`, `packages/onboarding` und `packages/control`, nach Schwere
abgearbeitet. Jeder Fix hat einen eigenen Beweis; die zwei großen Live-Beweise
sind gewachsen (`verify-site-authz` 103 → **118/118**,
`verify-community-suspension` unverändert **95/95**), dazu ein neuer
Drossel-Beweis (`verify-rate-limits`, **7/7**).

**1 (KRITISCH, Kontoübernahme) — DER SESSION-HANDOFF GING AN JEDE ADRESSE.**
`/start/done` nahm seinen Ziel-Host ungeprüft aus `?host=`
(`packages/onboarding/app/pages/start/done.vue:16,42,48`), und
`POST /api/onboarding/handoff` siegelte die laufende Session in ein Token, das
an **keinen** Host gebunden war. Beides zusammen war eine vollständige
Kontoübernahme: Opfer öffnet `…/start/done?host=angreifer.example&site=x`,
klickt „Community öffnen", das frische Siegel landet in der Query beim
Angreifer, der es binnen 60 s gegen einen ECHTEN Pukalani-Host einlöst —
`site-session.get.ts` setzte ihm daraufhin das Session-Cookie des Opfers. Kein
Schritt davon verlangte etwas, das ein Angreifer nicht hat.

Geschlossen wurden **beide** Hälften, denn jede allein bleibt löchrig:

*(a) Das Siegel trägt seinen Ziel-Host.* `sealHandoffToken`/`openHandoffToken`
(`core/server/utils/embedHandoff.ts`) haben ein PFLICHT-Argument `audience`
bekommen (Payload-Feld `a`), normalisiert mit derselben Funktion wie die
Mandanten-Auflösung (`normalizeHost` — bewusst keine zweite Variante). Kein
Default und keine Alt-Duldung: ein Token ohne passende Zielgruppe ist `null`.
Das ist gefahrlos, weil beide Seiten im selben Deployment laufen (die
Wildcard-Site `platform` bedient Kontroll- und Mandanten-Hosts), es also nie
gemischte Formate gibt — und weil ein misslungener Handoff in beiden Aufrufern
in einen Fallback auf den normalen Login läuft, nie in eine Sackgasse. Der
EMBED-Weg (Popup → iframe, `embed-handoff`/`embed-session`) wurde mitgezogen
und bricht nicht: dort sind Aussteller und Einlöser per Konstruktion dieselbe
Origin.

*(b) Der Host kommt aus der Mitgliedschaft.* `handoff.post.ts` verlangt jetzt
`communityId` (Pflicht), holt die Community aus der **eigenen** Liste des
Nutzers (`/api/control/community/mine` — dieselbe Quelle wie „Deine
Communities") und antwortet mit `{ token, host }`. Wer nicht Mitglied ist,
bekommt 403 statt eines Siegels; die Seite baut ihr Ziel aus dem
zurückgegebenen Host, kann also gar keinen fremden mehr in den Link schreiben.
`start/community.vue` hängt `host` nicht mehr an die Weiterleitung, und
`done.vue` liest die Adresse aus der Community-Liste — `?site=` ist nur noch
ein SCHLÜSSEL in eine geprüfte Liste. Der zusätzliche Control-Plane-Ruf pro
Klick kostet dasselbe wie die Übersicht darüber und teilt deshalb deren
Budget (`onboarding:communities`, 10/min).

**Beweis** (Abschnitt 5 von `verify-site-authz.mjs`, echter Kundenpfad):
Siegel für Host A → auf Host B **401 ohne Cookie**, dasselbe Siegel auf Host A
weiterhin 302 mit Cookie · Fremder bekommt für eine fremde Community **403** ·
ohne `communityId` **400** · Gast **401** · die Antwort nennt den Ziel-Host
selbst. Dazu sechs Unit-Fälle (Sub-/Superstring des Hosts, Groß-/Kleinschreibung,
Port, leere Zielgruppe beidseitig).

**2 (hoch) — EINE EINLADUNG WAR NUR SO VIEL WERT WIE EIN TIPPFELD.**
`accept.post.ts:70` band auf `identity.email`, prüfte aber `emailVerified`
nicht — obwohl `verifyRuntimeIdentity` es liefert. Der Pool ist EIN
Appwrite-Projekt und die Registrierung verlangt keine Bestätigung, bevor man
loslegt: wer wusste, dass `chef@verein.de` als admin eingeladen wurde und dort
kein Konto hatte, legte sich auf irgendeinem offenen Pool-Host genau diese
Adresse an — ohne je an das Postfach zu kommen — und nahm die Einladung an.
Aus „nur der Eingeladene" wurde „jeder, der den Namen kennt", inklusive der
Rolle aus der Einladung. Dasselbe galt für an eine Adresse GEBUNDENE
Einladungs-Codes (`evaluateInviteCode`, control-017).

Jetzt verlangt beides eine bestätigte Adresse: `evaluateInviteCode` hat einen
vierten Parameter `emailVerified` und einen neuen Grund `unverified_email`,
`accept.post.ts` prüft `identity.emailVerified`. Die Reihenfolge ist wichtig
und getestet — der Unterschied zwischen „falsche Adresse" und „unbestätigt"
wird erst NACH der Adressgleichheit sichtbar, ist also kein Orakel: wer hier
ankommt, führt bereits die passende Adresse.

**Rückwärtskompatibilität war die eigentliche Arbeit.** Ein stummes „gilt
nicht" hätte bestehende unverifizierte Konten ausgesperrt, ohne den Weg zu
zeigen. Deshalb reist genau dieser eine Grund nach außen (`data.code:
'email_unverified'` → `reason` im Envelope; der Control-Plane-Transport reicht
ihn durch), die Vorprüfung des Wizards meldet ihn als `codeReason`, und in der
UI steht die neue Komponente `AuthEmailVerifyRequired` (core) — ein Kasten mit
Knopf, der `POST /api/auth/verification` ruft, also die schon vorhandene
Wiederholungs-Route. Bewusst NICHT an `pukalani.auth.verification` gekoppelt:
die Sperre gilt unabhängig davon, ob die App sonst zur Bestätigung mahnt, und
ein Kasten ohne Ausweg wäre das Schlechteste von beidem. Texte de+en an drei
Stellen (`/join`, Wizard-Schritt 0, Wizard-Abschluss).

**Beweis:** im Live-Lauf nimmt ein UNBESTÄTIGTES Konto die Einladung nicht an
(403 + `reason: email_unverified`, keine Mitgliedschaft), nach
`updateEmailVerification` sofort schon. Dazu drei Unit-Fälle inklusive der
Reihenfolge-Zusage.

**3 (hoch) — DIE REGISTRIERUNG WAR UNGEDROSSELT.** `POST /api/auth/signup`
fehlte in `ALWAYS_LIMITED`, obwohl sie die schärfste der Mail-Routen ist: sie
legt Konten an, verschickt Mail an eine frei wählbare Adresse und läuft über
den Admin-Client, umgeht also auch Appwrites eigenes Limit. Jetzt 5/min und IP
wie ihre Geschwister recovery/otp/verification — ein Mensch legt sich kein
zweites Konto in derselben Minute an, ein geteilter Anschluss bleibt mit fünf
Anmeldungen je Minute bequem darunter.

**4 (hoch, erst verifiziert) — X-FORWARDED-FOR WAR FÄLSCHBAR, UND DIE
BEGRÜNDUNG IM CODE STIMMTE NICHT.** Beide Stellen riefen
`getRequestIP(event, { xForwardedFor: true })`. Nachgemessen: h3 **1.15.11**
nimmt darin `.split(",").shift()` — das ERSTE Segment. Und die nginx-Vorlage
dieses Projekts (`docs/archiv/HELP-GO-LIVE.md:98`) setzt
`$proxy_add_x_forwarded_for`, was die echte IP **anhängt**. Wer also
`X-Forwarded-For: 1.2.3.4` mitschickte, erzeugte `1.2.3.4, <echte IP>` — und
gelesen wurde `1.2.3.4`. Damit war jedes IP-Limit mit einem Header-Zähler
aushebelbar (Login-Brute-Force zuerst) und die IP im Aktivitätsprotokoll frei
erfunden.

Der Kommentar im Code und die Phase-17-Checkliste beschrieben ein Setup, das
es hier nie gab: „nur hinter einem Proxy vertrauenswürdig, der den Header
ÜBERSCHREIBT". Die Firewall verhindert das UMGEHEN des Proxys — nicht das
MITSCHICKEN eines Headers DURCH ihn. Genau diese Verwechslung ließ den Befund
2026-07-05 als „bewusst kein Code-Gate" durchgehen.

Gelöst zentral: `core/server/utils/clientIp.ts` mit der puren, getesteten
`resolveClientIp` (LETZTES Segment = das, was der eigene Proxy angehängt hat)
und `trustedClientIp(event)`. Umgestellt sind **alle fünf** Aufrufer:
Rate-Limit-Middleware, `authAudit`, `admin/server/utils/audit.ts`,
`comments/.../guest.post.ts` (der IP-Hash der Gast-Kontaktspur) und
`apps/photos/.../contact.post.ts` (eigener Mini-Limiter). **Ehrliche Grenze,
im Code notiert:** die Regel setzt GENAU EINEN eigenen Proxy voraus. Für den
einen zusätzlich über Cloudflare laufenden Host (`pukalani.app`) ist das letzte
Segment die Cloudflare-Kante — dort landen alle Besucher in einem Eimer. Das
ist die sichere Richtung (zu streng, nie zu lasch), und dieser Host trägt keine
Auth-Routen.

**5 (mittel) — DER DRITTE OPEN-REDIRECT-GUARD WAR DER SCHWÄCHSTE.**
`site-session.get.ts` prüfte `to` mit einer eigenen Regex
(`^\/(?!\/)[^\s]*$`), die `/\evil.example` durchließ — Browser lesen `\` wie
`/`, daraus wird `//evil.example`. Die beiden anderen Tore des Repos
(`shared/redirectTarget.ts`, `shared/notificationLinks.ts`) sperren Backslashes
seit jeher. Statt einer dritten Variante ruft die Route jetzt
`safeRedirectTarget` im Zod-`refine` auf — die Ablehnung bleibt ein 400 wie
bisher.

**6/7 (mittel) — ZWEI UNGEDROSSELTE VERSTÄRKER.**
`POST /api/storage/<bucket>` (Avatar-Upload, bis 5 MB je Datei auf die geteilte
Platte) bekommt 30/min wie `/api/media`, aber einen eigenen Eimer — ein
Redakteur, der eine Galerie füllt, soll sich nicht am Profilbild aussperren.
`GET /api/presence/count` war unauthentifiziert erreichbar und löste pro Aufruf
bis zu **fünf** Presences-Seiten über den ADMIN-Client aus (der billigste
Verstärker im System: ein GET ⇒ fünf Admin-Abrufe); jetzt 120/min wie die
öffentlichen Kommentar-Lese-Routen.

**8 (niedrig) — DAS KONTEN-ORAKEL.** Bei GESCHLOSSENER Registrierung
antwortete `POST /api/auth/otp` für unbekannte Adressen 403 und für bekannte
200 — eine Adressliste ließ sich damit gegen eine Community prüfen.
`recovery.post.ts` macht es seit jeher richtig (identische Antwort in JEDEM
Pfad); die OTP-Route steigt jetzt genauso still aus: dieselben Felder in
derselben Form (frische `userId`, plausible Sicherheitsphrase), kein Konto,
keine Mail. Der Preis ist bewusst: wer sich vertippt, wartet auf eine Mail, die
nicht kommt — dieselbe Erfahrung wie beim Passwort-Zurücksetzen.

**9 (niedrig) — PRÄFIX OHNE SEGMENTGRENZE.** `isAllowedControlPath` verglich
mit nacktem `startsWith`. Vier der sieben echten Präfixe stehen ohne
Schrägstrich in der `app.config` (`/api/health`, `/api/notifications`,
`/api/feedback`, `/api/abuse`) — damit hätte `/api/feedbackfoo` oder
`/api/abuse-export` das Tor passiert. Heute existiert keine solche Route; ein
Sicherheitstor, das eine noch nicht geschriebene Route mit-erlaubt, ist aber
eine Falle für den Nächsten. Jetzt gilt die Regel aus dem Produkt-Gate
(`=== prefix` · `/` · `?`), mit abgeschnittenem Schrägstrich am Ende — sonst
verlangte `/api/auth/` ein `//` und der ganze Kundenbereich fiele auf 404.

**Nebenbei repariert:** `packages/control/scripts/verify-onboarding.mjs` las
`community_members` OHNE Filter und ohne Limit (25er-Default) — sobald andere
Beweisläufe Zeilen hinterließen, fiel die eigene aus dem Fenster und der Beweis
meldete einen Fehler, den es nicht gab. Jetzt gezielt nach der Community
gefragt (25/25 grün).

**Beweise gesamt.** `pnpm -r test` (1360 Tests, 0 rot — davon 6 neue
Handoff-Zielgruppen-Fälle, 7 IP-Fälle, 3 Einladungs-Fälle, 2
Pfad-Grenzen-Fälle) · `pnpm -r typecheck` sauber · `pnpm -r lint` 6 bekannte
Warnungen · `pnpm check:manifests` konsistent ·
`verify-site-authz` 118/118 · `verify-community-suspension` 95/95 ·
`verify-onboarding` 25/25 · `verify-control-host` 13/13 ·
`verify-rate-limits` 7/7 (neu).

**Gelernt:** *Ein Token ohne Adressat ist ein Generalschlüssel.* Der Handoff
war handwerklich sauber gebaut — AES-GCM, 60 Sekunden, Prüfung gegen Appwrite
vor jedem Cookie — und trotzdem eine Kontoübernahme, weil nirgends stand, WER
ihn öffnen darf. Jede Fähigkeit, die zwischen zwei Kontexten reist, braucht
ihren Empfänger IM Siegel; die Lebensdauer ersetzt das nicht.

**Gelernt:** *Eine begründete Ausnahme veraltet mit ihrer Begründung.* Das
X-Forwarded-For-Vertrauen war 2026-07-05 geprüft und bewusst ohne Code-Gate
gelassen — mit einer Annahme über nginx, die nie zutraf. Wer eine Prüfung mit
„das Setup garantiert es" abschließt, muss die Garantie NACHMESSEN (hier: eine
Zeile in der nginx-Vorlage, eine Zeile im h3-Bundle), nicht behaupten.

**Gelernt:** *Sicherheitsfixes ohne Ausweg sind halbe Fixes.* Die
Einladungs-Sperre hätte bestehende Konten stumm ausgesperrt. Der aufwendigste
Teil war nicht die Prüfung, sondern der eine Grund, der nach außen darf, und
die Stelle, an der er zu einem Knopf wird. Und weil er nach außen darf, musste
die Reihenfolge der Prüfungen zur Zusage passen — sonst wird aus der Hilfe ein
Orakel.

**Gelernt:** *Ein Beweisskript, das absichtlich Fehlversuche erzeugt, drosselt
sich selbst aus.* Die neuen Handoff-Prüfungen sprengten das 5/min-Budget von
`site-session`, ein zweiter Lauf innerhalb einer Minute meldete 429 statt der
geprüften Antwort. Lösung: jeder solche Abschnitt bekommt eine eigene
Client-IP per Header — was lokal genau deshalb wirkt, weil dort kein nginx die
echte anhängt, also exakt die dokumentierte Grenze aus `clientIp.ts`.

**Gelernt:** *Der Mandanten-Kontext hinkt der Control-Plane-Zeile hinterher.*
Die OTP-Prüfung schlug zuerst fehl, weil „Registrierung schließen" sofort in
der Datenbank steht, `tenantRegistrationOpen()` seinen Wert aber aus dem
Resolver-Cache (≤30 s) liest — das Control Plane entscheidet den BEITRITT
ungecacht, die Auth-Routen sehen die Sperre später. Der Beweis wartet jetzt mit
einer nebenwirkungsfreien Sonde (`signup` mit ungültigem Passwort: geschlossen
⇒ 403 VOR der Body-Prüfung, offen ⇒ 400, in keinem Fall ein Konto).

---

### G3 — courses/themes-Audit: eine Meldung für drei verschiedene Absagen ✅ 2026-08-02

**Was geprüft wurde.** `packages/courses` und `packages/themes`. Sechs
Befunde, jeder vor dem Fix am laufenden System reproduziert.

**1 (mittel, Produktfehler) — DREI ABSAGEN, EINE FALSCHE MELDUNG.** Die
Kurs-Seite machte aus JEDEM 403 beim Einschreiben denselben Satz: „Dieser Kurs
gehört zu Pro", mit einem Knopf auf `/pricing`
(`courses/app/pages/courses/[slug]/index.vue:41` — `if (statusCode === 403)`,
mehr stand da nicht). Zusammengefallen sind drei ganz verschiedene Lagen:
(a) diese Instanz kann `paid` gar nicht freischalten (kein Access-Guard —
im Pool der Normalfall), (b) der Guard hat abgelehnt, (c) die Community ist
wegen offener Rechnung gesperrt (M13). Zwei davon waren dadurch gelogen. Im
Pool zeigte der Knopf auf eine Seite, die es dort nicht gibt: `/pricing` lebt
in `packages/billing`, und `apps/platform` bindet den Layer nicht ein
(nachgezählt in der `extends`-Liste) — der Klick endete im 404. Und im Fall (c)
stand eine KAUFAUFFORDERUNG neben der Mahnung, die das globale Hinweis-Plugin
(`core/app/plugins/community-suspended-notice.client.ts`) längst zeigt:
ausgerechnet dann, wenn eine Rechnung offen ist.

Jetzt tragen beide 403 einen fachlichen Grund (`data.code` → `reason` im
Envelope, das etablierte Muster), und die Seite unterscheidet daran:
`course_upgrade_required` ⇒ Upgrade-Hinweis MIT Knopf ·
`course_paid_unavailable` ⇒ ehrlicher Satz OHNE Knopf („Er ist als
kostenpflichtiger Kurs angelegt, aber in dieser Community gibt es keine
Bezahlmöglichkeit") · `community_suspended` ⇒ die Seite schweigt, weil das
Plugin schon spricht. Genau so steht es auch im Kopf jenes Plugins: „wer so
eine Stelle ohnehin anfasst, prüft `error.data.reason` und schweigt dann."

**Warum kein zweites Flag für „gibt es hier ein /pricing?".** Weil der Grund
die Frage schon beantwortet: `course_upgrade_required` kann per Konstruktion
nur fallen, wenn ein Guard registriert ist — und den registriert die App, die
auch billing einbindet. Kein Guard ⇒ kein billing ⇒ kein `/pricing`. Das ist
dieselbe Wahrheit, aus der das Dashboard-Formular schon `paidAvailable` zieht
(F13), nur an der anderen Tür gelesen; ein drittes Feld könnte daneben altern.

**2 (niedrig) — DER F13-FIX WIRKTE NUR IM FORMULAR.** `POST /api/courses` und
`PATCH /api/courses/:id` nahmen `access: 'paid'` weiterhin an, auch ohne
Guard. Über die API, einen alten Client oder einen zweiten Tab entstand also
weiter ein Kurs, dessen Buchen-Knopf anschließend nur noch 403 sagt — die
Regel lebte in der Oberfläche statt dort, wo sie niemand umgehen kann. Jetzt
lehnt `assertPaidAccessOffered()` server-seitig ab (422 mit
`course_paid_unavailable`), gelesen aus derselben `isCourseAccessConfigured()`.
Der PATCH prüft den MERGED Zustand — sonst bliebe ein Bestandskurs unbemerkt
auf `paid` stehen, wenn jemand nur den Titel ändert; der Ausweg ist ein Feld
im selben Formular.

**3 (niedrig) — KEIN NETZ FÜR DIE ZWEI MITGLIEDS-WEGE.** `enroll.post.ts` und
`lessons/[id]/complete.post.ts` setzen `actor: 'member'` HART (sie haben kein
Gate, aus dem sie ihn beziehen könnten — nur eine angemeldete Person). Fällt
das `actor` weg, fallen sie auf die Klinke `operator` zurück und damit still
aus der Inhalts-Sperre (M13) und dem Beitritts-Auslöser (A5) — genau das Loch,
das C1c am Vortag geschlossen hatte. Es fällt niemandem auf: das Einschreiben
funktioniert ja weiter, nur eben auch in einer Community mit offener Rechnung.
Der vorhandene Anker-Test prüfte für die sechs REDAKTIONS-Routen ausdrücklich
das Gegenteil (`not.toContain("actor: 'member'")`), die beiden Mitglieds-Wege
standen gar nicht in der Liste. Jetzt: eigener Anker-Block für sie plus vier
Live-Prüfungen im Sperr-Beweis (einschreiben und Lektion abschließen in einer
gesperrten Community ⇒ 403 mit Grund), inklusive Ausgangslage davor — sonst
wäre ein 403 nicht vom Produkt-Gate oder einem Tippfehler zu unterscheiden.

**4 (niedrig, themes) — EINE FELDLISTE, ZWEIMAL GESCHRIEBEN.** Der
JSON-Import der Theme-Galerie führte 14 Config-Felder als abgeschriebenes
String-Array (`sanitizeConfig`), deckungsgleich mit `ThemeConfig` — solange
jemand daran dachte. Ein neues additives Feld (und additiv ist hier die Regel:
das config-JSON trägt bewusst kein `version`) wäre beim Import STILL
verschluckt worden. Still, weil ein fehlendes Feld kein Fehler ist, sondern
ein Default: das eingeführte Theme sähe anders aus als das exportierte, und
niemand wüsste warum. Jetzt kommt die Liste aus `THEME_CONFIG_KEYS`, das über
`Record<keyof Required<ThemeConfig>, true>` am Typ hängt — ein vergessenes
Feld ist ein Typfehler, kein stiller Verlust. Dazu ein Test, der die
Editor-Defaults danebenhält (die leiten sich bewusst NICHT vollständig aus
`ThemeConfig` ab, dort dürfen Felder `null` sein).

**5 (niedrig, themes) — zwei hartkodierte Strings** in
`CustomizeSceneBranding.vue` („Primary", „Neutral") → i18n de+en. Der
deutsche Begriff ist „Grundton", derselbe wie unter
`/dashboard/settings/community`; en „Base tone" wie im admin-Layer.

**6 (niedrig, themes) — DAS GATE SAH NUR IN EINE RICHTUNG.**
`generate-themes.ts --check` verglich Katalog → Datei. Eine CSS, die zu keinem
Katalog-Eintrag mehr gehört (umbenanntes oder gestrichenes Theme), blieb
liegen und wurde weiter ausgeliefert — und weil mit `neutral.css` eine legitim
handgepflegte Datei danebensteht, war „gehört das hierher?" von außen nicht zu
entscheiden. Jetzt nennt das Gate die erwartete Menge (Katalog + dokumentierte
Ausnahme) und meldet alles andere. Gegenprobe gefahren: eine untergeschobene
`zzz-verwaist.css` bricht den Lauf mit Exit 1, nach dem Löschen wieder grün.

**Nebenbei mitgenommen:** die halbe F22-Zeile — der Kopf von
`courseAccess.ts` nannte als Guard-Beispiel „billings `requireEntitlement`",
das mit G1 entfallen ist; heute ruft der Guard `getEntitledProducts()`.

**Beweise.** `verify-community-suspension.mjs` auf 95 Prüfungen erweitert
(vorher 87, acht neue) und grün — 95 bestanden, 0 fehlgeschlagen · Browser-Beweis für Befund 1 auf `demo.localhost:3006`,
beide Fälle einzeln: bezahlter Kurs ohne Bezahlmöglichkeit ⇒ „Dieser Kurs ist
gerade nicht buchbar", kein `/pricing`-Knopf; gesperrte Community ⇒ GENAU EIN
Hinweis (der globale Sperr-Toast), kein doppelter Kurs-Hinweis ·
`pnpm -r test` 0 Fehlschläge (courses 37 → 44, themes 153) · `pnpm typecheck`
0 Fehler · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`check:manifests` und `check:themes` grün.

**Gelernt:** Ein `catch`, der nur den HTTP-Status liest, ist eine
Meldungs-Falle — er behauptet EINE Ursache, wo der Server drei verschiedene
meint. Und wer eine Oberfläche baut, die auf ein Ziel verweist, muss prüfen,
ob es dieses Ziel auf DIESEM Host überhaupt gibt: im Pool und im Silo laufen
verschiedene Layer-Verbünde, ein `localePath('/pricing')` ist deshalb keine
Zusage, sondern eine Annahme.

**Gelernt (Beweis-Betrieb):** (1) `verify-community-suspension.mjs` braucht
rund **20 Minuten** und steht dabei mehrfach LANGE still — am auffälligsten am
Ende von Abschnitt 7, wo es nach dem Aufheben der abuse-Sperre darauf wartet,
dass der Host zurückkommt (Resolver-Cache, bis 45 s je Schleife, und davon
gibt es viele). Ich habe den ersten Lauf genau dort für hängend gehalten und
abgebrochen; der zweite lief an derselben Stelle unverändert durch. Bei diesem
Skript also am Prozess prüfen, ob es noch lebt, statt am stehenden Log — und
abgebrochene Läufe hinterlassen Communities und Konten, die von Hand weg
müssen (das Aufräumen steht im `finally`). (2) `stdbuf` gibt es auf macOS
nicht; der Aufruf scheitert lautlos mit „command not found" in der
umgeleiteten Datei, und der Wrapper-Exit-Code sagt trotzdem 0. Vor dem Warten
also immer in die Log-Datei sehen, nicht nur auf den Rückgabewert.
(3) Nebenbei: Live-Beweise nicht laufen lassen, während man am selben Code
editiert — Vite lädt den Dev-Server neu, und ein Fehlschlag wäre dann nicht
mehr der neuen Arbeit zuzuordnen.

**Gelernt (Sperre lokal setzen):** Eine `billing`-Sperre direkt in die Row zu
schreiben hält NICHT — der `pastDueSweep` hebt sie binnen Sekunden wieder auf
(„kein `pastDueSince` ⇒ nicht überfällig ⇒ nicht gesperrt"). Wer lokal eine
gesperrte Community braucht, setzt `suspension`, `billingStatus: 'past_due'`
UND ein `pastDueSince` in der Vergangenheit. Das ist kein Fehler der
Automatik, sondern ihr Zweck — es kostet nur eine halbe Stunde, wenn man es
nicht weiß.

---

### G2 — events/posts-Audit: der Geldpfad war seit Wochen tot, und CI blieb grün ✅ 2026-08-02

**Was geprüft wurde.** `packages/events`, der GDPR-Contributor von
`packages/posts` und die A14-Naht in `apps/comments/server/plugins`. Sieben
Befunde, jeder vor dem Fix am laufenden System reproduziert.

**1 (kritisch) — DER GELDPFAD WAR TOT.** `grantEventTicket()` schrieb
`data: { …, tenantId }` in `event_tickets`. Diese Spalte gibt es seit E8-3
nicht mehr (events-007 legte `communityId` daneben, events-008 löschte
`tenantId`) — live nachgemessen trägt KEINE Tabelle irgendeiner Instanz noch
ein `tenantId`. Appwrite lehnt unbekannte Felder ab; reproduziert mit dem
Roh-SDK: `400 row_invalid_structure — Unknown attribute: "tenantId"`. Folge in
der Silo-App, wo billing komponiert ist: der Kunde zahlt, der
Stripe-Webhook ruft über `billing-fulfillment.ts` in `grantEventTicket`, das
wirft, Stripe wiederholt endlos, das Ticket entsteht NIE — und
`assertCanRsvpGoing` hält ausgerechnet den Zahlenden mit 403 fail-closed vor
der Tür. Ein ZWEITER, unabhängiger Bruch lag im Lesepfad: `hasEventTicket`
sucht durch die Datentür, und die filtert auf `communityId` — selbst ein
irgendwie geschriebenes Ticket wäre unauffindbar geblieben. Behoben in Typ,
Schreib- und Lesestelle. Repo-weite Nachsuche nach derselben Fehlerklasse:
zwei tote Typ-Felder (`comments`, `media`), sonst nichts — sie stehen als
F25 offen.

**Warum es niemand sah.** `tests/event-tickets.test.ts` mockt den Row-Store.
Ein nachgebauter Speicher hat kein Schema; er nimmt `tenantId`, `bananenId`
und alles andere klaglos an und bleibt grün, während die echte Datenbank seit
Wochen 400 antwortet. Deshalb zwei Konsequenzen: der Mock lehnt jetzt
unbekannte Felder ab (`TICKET_COLUMNS`, mit Selbstprüfung — eine handgepflegte
Liste, die veralten kann, also kein Ersatz), und der eigentliche Beweis läuft
gegen die echte Instanz: `packages/events/scripts/verify-paid-ticket.mjs`
**13/13** liest die Spaltenliste aus Appwrite und fährt Ausstellen →
Wiederfinden → Nachbar sieht nichts → RSVP erlaubt → Webhook-Retry idempotent
→ Silo-Leerwert → unbekanntes Event wirft. Gegenprobe: mit dem alten
Feldnamen fällt er sofort um. Er importiert den ECHTEN Quelltext samt
Datentür (`registerHooks` + `--experimental-strip-types`), nachgestellt sind
nur die Nitro-Auto-Imports. **Und er läuft jetzt in der CI** (e2e.yml, direkt
nach dem Bootstrap gegen die Wegwerf-Appwrite) — genau dort, wo der Fehler
hätte auffallen müssen.

**2 (hoch) — die Titelbilder blieben öffentlich, wenn die Community zumacht.**
Der Bucket `event-covers` wurde in events-002 bucket-weit `read("any")` mit
`fileSecurity: false` angelegt, und das events-Plugin meldete seine Tabelle im
C18-Umzug OHNE `bucket`. Der Umzug zog also jede Event-Row brav auf
`read(label:<communityId>)` und meldete `complete: true`, während jedes Cover
per Roh-URL für die ganze Welt abrufbar blieb — genau der Fall, den core an
`audienceRepermission.ts` benennt. Migration **events-009** stellt den Bucket
auf `fileSecurity` (übrige Einstellungen vorher gelesen und zurückgeschrieben —
`updateBucket` setzt Weggelassenes sonst auf Vorgaben), zieht jede Bestandsdatei
auf die Rechte IHRER Row und sperrt Waisen zu; fail-loud, Exit 1 bei Resten.
Zur Laufzeit gilt eine Regel in einem Satz: **ein Cover ist nie offener als
sein Termin** (`utils/eventCovers.ts`) — beim Upload gestempelt, beim
Publizieren/Zurückziehen nachgezogen, beim C18-Umzug über den jetzt
registrierten `bucket`-Eintrag. Beweis: `verify-audience-flip.mjs` **25/25**,
erweitert um die DATEI (anonymer HTTP-Abruf der `<img src>`-URL, vor und nach
jedem Umschalten). Mit dem alten Bucket-Zustand fällt genau die neue Zeile um.

**3 (mittel) — die Serien-Expansion lief am Kontingent vorbei.** Gedeckelt war
nur das manuelle Anlegen; `expandSeries` legt bis zu 26 Zeilen je Lauf an und
läuft aus JEDEM Listen-GET. Ein Kunde materialisierte sich so über sein
Kontingent hinaus, ohne je etwas Verbotenes zu tun — er legt EINE Serie an,
der Rest entsteht von selbst. Jetzt wird VOR JEDER Zeile geprüft (ohne
konfigurierte events-Limits kehrt `assertPoolWriteQuota` sofort zurück, kostet
also nichts), und die Schleife bricht SAUBER ab statt zu werfen: ein Sweep darf
den fremden Listen-Aufruf nicht sprengen, an dem er zufällig hängt. Still ist
er trotzdem nicht — `logEvent` schreibt Serie, Anzahl und Community, und
unterscheidet „Kontingent voll" von „Prüfung selbst gescheitert" (beides
stoppt: wer die Grenze nicht kennt, darf sie nicht überschreiten).

**4 (mittel) — der Wartungsmodus kannte die Termine nicht.** `maintenanceMode`
war im events-Layer an KEINER Route geprüft. comments kennt ihn seit jeher,
posts seit S10b an allen fünf Wegen — events an keinem: der Betreiber legte
den Schalter um, Kommentare und Beiträge froren ein, und Termine wurden weiter
angelegt, bearbeitet, abgesagt, bebildert, zu- und abgesagt und bewertet.
`assertEventsWritable` (eigener Layer, eigener NAME — zwei gleichnamige
Auto-Imports in `server/utils` zweier Layer kollidieren) hängt jetzt in allen
acht Mitglieds-Schreibwegen, jeweils NACH der Anmeldung. Ausgenommen bleibt der
schlüsselgeschützte Reminder-Sweep. Netz: `events-maintenance-gate.test.ts`
nach dem posts-Muster — strukturell, weil der Befund strukturell ist.

**5 (niedrig) — der GDPR-Grabstein sprach zur falschen Community.** Der
posts-Contributor setzte `read(label('admin'))`, ein INSTANZ-weites Label: im
Pool hätte jede fremde Community Leserecht auf einen Grabstein, der von einem
Menschen handelt. Jetzt je Zeile aus IHRER `communityId` abgeleitet
(`mod<communityId>`, sonst die globalen Betreiber-Rollen) — bewusst NICHT über
`useTenant(event)`: der Lauf geht über alle Communities des Users, es gibt also
keinen „Mandanten dieses Requests", dem man folgen dürfte.

**6 (niedrig) — der Reminder-Sweep-Endpunkt kannte keinen Mandanten.** Der
Schlüssel sagt „wer", nicht „wessen": ohne Pool-Kontext scopet die Datentür
nicht, der Sweep lief über ALLE Communities und `notify({scope:'tenant'})`
stempelte eine leere tenantId — die Erinnerung landete in der
„unbekannt"-Ablage statt in der Glocke ihrer Community. In
Multi-Tenant-Deployments jetzt 400 mit `tenant_required`: ein Aufruf je
Community-Host. Silo unverändert.

**7 (niedrig) — drei Serien-Fan-outs kappten still.** Publish-Propagation,
Cover-Propagation und „Serie beenden" liefen mit nacktem `Query.limit(200)`.
Eine wöchentliche Serie überschreitet das nach knapp vier Jahren — und dann
lässt „Serie beenden" Termine stehen, die der Owner für abgesagt hält. Jetzt
`listSeriesInstances()`, cursor-paginiert, mit lauter Notbremse bei 5000.

**Migration.** `events-009` (Bucket + Bestand). **Reihenfolge in Prod: ERST
Code deployen, DANN migrieren** — wie media-002: nach der Migration vergibt nur
der neue Code Datei-Rechte, ein frisch hochgeladenes Cover bekäme unter altem
Code gar keine. Andersherum gibt es kein Fenster. Betroffen: platform und
comments. Lokal gefahren, Prod steht aus.

**Beweise.** verify-paid-ticket **13/13** (neu) · verify-audience-flip **25/25**
(erweitert) · verify-community-suspension **95/95** · events-Pool-Isolation
**14/14** · posts-Pool-Isolation **7/7** · `pnpm -r test` (1338 grün) ·
`pnpm -r typecheck` grün · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`pnpm check:manifests` grün.

**Gelernt:** (1) **Ein Mock kann eine Schema-Zusage nicht prüfen — er kann sie
nur bestätigen.** Der Test hier war nicht schlampig, er war gut geschrieben und
prüfte die richtige Frage („kommt der Mandanten-Stempel aus dem Event?"). Nur
lag der Fehler eine Ebene darunter, in einer Zusage, die der Prüfling gar nicht
hat: der nachgebaute Store nimmt jeden Feldnamen an. Regel daraus: wo Code eine
SPALTE benennt, gehört mindestens ein Beweis an die echte Instanz — und in die
CI, die eine hat. (2) **Eine Umbenennung ist erst fertig, wenn der SCHREIBPFAD
sie kennt.** events-007/008 liefen fehlerfrei, mit Backfill, Index-Zwillingen
und fail-loud-Gegenprobe — makellose Arbeit an den DATEN. Der Code, der
hineinschreibt, stand daneben und wurde von keiner dieser Prüfungen berührt.
Die Migrations-Gegenprobe fragt „stimmen die Zeilen?", nie „schreibt noch
jemand den alten Namen?" — dafür gibt es nur `grep` und einen echten
Schreibvorgang. (3) **Ein optionales Registry-Feld ist eine Falle, wenn sein
Fehlen wie eine Aussage aussieht.** `registerAudienceRepermissionTable` hatte
für Dateien längst einen Platz (`bucket`), media nutzte ihn, events ließ ihn
weg — und nichts unterschied „hat keine Dateien" von „hat welche und vergisst
sie". Der Umzug meldete deshalb wahrheitsgemäß `complete: true` über eine halbe
Arbeit. Wo ein Vertrag eine zweite Seite kennt, muss das Weglassen begründet
DASTEHEN, nicht bloß möglich sein.

---

### G1 — Billing-/Admin-Audit: Ware ohne Geld, und drei tote Hälften ✅ 2026-08-02

**Was geprüft wurde.** `packages/billing`, die Admin-Routen der
Nutzerverwaltung und der GDPR-Contributor des system-Layers. Acht Befunde,
alle vor dem Fix am Code reproduziert.

**1 (hoch, vor dem Stripe-Go-Live kritisch) — WARE OHNE GELD.** Der Webhook
erfüllte einen Einmal-Kauf, sobald `checkout.session.completed` eintraf. Diese
Nachricht bedeutet aber nur „der Kunde ist durch den Checkout durch", nicht
„bezahlt": bei einer verzögerten Zahlungsart (SEPA-Lastschrift, Rechnung)
kommt sie mit `payment_status: 'unpaid'`, und die Belastung passiert Tage
später — oder scheitert. `payment_status` kam im ganzen Repo nicht vor, die
drei Nachzügler-Ereignisse (`async_payment_succeeded`, `async_payment_failed`,
`expired`) standen nicht in der Allowlist, und keine unserer
Checkout-Erzeugungen schränkt `payment_method_types` ein — welche Methoden
angeboten werden, entscheidet also das Stripe-Dashboard. Ein einziger Klick
dort hätte gereicht: Ticket sofort ausgestellt, Zahlung platzt später, kein
Rückweg. Jetzt entscheidet der Zahlungs-Status statt des Ereignis-Namens
(`checkoutOutcome`, pure, alle vier Wege getestet), die Nachzügler sind
zugelassen, und was NICHT erfüllt wird, steht als strukturierte Log-Zeile da
(`billing.checkout_not_fulfilled`; `payment_failed` als `error`, weil dort
jemand hinsehen muss). Bewusst KEIN `throw`: ein Stripe-Retry käme zum selben
Ergebnis, und die Webhook-Regel lautet werfen nur, wenn Wiederholen helfen kann.

**2 (mittel) — Preis-Allowlist.** `lookupKey` war ein freier Parameter der
Checkout-Utilities; die Garantie hing allein am Aufrufer. Abos prüfen jetzt
HART gegen `pukalani.billing.plans` (ein Preis, den kein Plan nennt, schaltet
ohnehin nichts frei). Einmal-Käufe lassen sich nicht erschöpfend auflisten —
ein Event-Ticket zeigt auf einen `lookup_key`, den der Betreiber in SEINEM
Stripe-Konto anlegt und als Freitext einträgt. Dort greifen zwei Regeln: nie
ein Plan-Key, und der aufgelöste Stripe-Price MUSS `one_time` sein. Wer es
enger will, trägt `pukalani.billing.oneTimeLookupKeys` ein (exakt oder
`präfix_*`).

**3 (mittel, Isolation am Socket) — das Dashboard hörte pool-weit zu.**
`useRealtimeRows(…, 'comments', …)` lief ohne `where`. Dieselbe Klasse wie B2,
nur eine Ebene tiefer: der Strom liest DIREKT gegen Appwrite und ist von der
Datentür nicht erfasst. Live nachgemessen (zwei lokale Communities, roher
Gast-WebSocket): beide neu angelegten Zeilen kamen an EINEM Socket an, beide
mit `read("any")` — die Row-Permissions sind hier also gar keine Grenze.
Folge im Betrieb: jedes Kunden-Dashboard zog bei jedem fremden Kommentar drei
Refetches. Jetzt `rowBelongsToHost(payload, tenantId)` wie bei Activity-Feed
und Glocke; das Spiegel-Inventar in `tenant-brand.server.ts` nennt den neuen
Leser.

**4 (mittel, GDPR) — die E-Mail überlebte die Kontolöschung.**
`POST /api/admin/users` legte sie als `metadata.email` im Audit-Log ab; der
Contributor pseudonymisierte `actorName`/`ip`/`metadata.name`. Die Adresse
stand aber in der Zeile des ANLEGENDEN Admins, nicht in einer eigenen — der
Actor-Zweig griff sie nie. Beide Hälften gefixt: die Route speichert sie nicht
mehr (gebraucht wurde sie nie, `targetId`/`targetName` beantworten „wer"), und
`stripPersonalMetadata` räumt den Bestand — auch im `targetId`-Zweig.

**5 (mittel) — Teil-Löschung meldete nur „fehlgeschlagen".** Die Route hängte
`{results, failed, exportFileId}` an einen 500er. Der zentrale Handler holt
aus `data` aber ausschließlich `code` heraus: es kam NIE etwas an,
`publicContributorResults()` war in der Produktion toter Code — exakt die
`last_admin`-Bauart vom 2026-07-29. Der Betreiber las „Aktion fehlgeschlagen —
es gilt weiter der Stand, den du hier siehst", während der Nutzer in Wahrheit
GESPERRT zurückblieb und ein zweiter Lauf nötig war. Jetzt reist
`deletion_incomplete` als Grund; die Zuordnung Grund → Text liegt pur in
`packages/admin/shared/userActionErrors.ts` (Liste, Detailseite und Test
benutzen dieselben Schlüssel), Texte in de+en. `publicContributorResults` ist
entfallen — WELCHE Layer offen sind, steht strukturiert im Log.

**6 (niedrig) — `requireEntitlement()` entfernt.** Kein Aufrufer, und das war
kein Versehen: der einzige echte Konsument ist der Kurs-Zugangs-Guard, und ein
Guard braucht eine Antwort (`boolean`), keinen Wurf. Ein zweites, werfendes
Gate daneben ist keine Absicherung, sondern eine Abzweigung — es antwortete 402
ohne fachlichen `data.code`, also ohne `reason` im Envelope.

**7 (niedrig) — Rücksprung-URLs kamen aus dem `Host`-Header.** Auf einer
Wildcard-Site reicht der Header ungeprüft bis in den Node-Prozess: ein
gefälschter Host erzeugte eine ECHTE Stripe-Checkout-URL, die nach der Zahlung
auf einen fremden Host zurückführt. Jetzt gewinnt die konfigurierte Basis-URL
der App; der Request-Origin bleibt nur der Rückfall für die lokale Entwicklung
(`shared/returnOrigin.ts`, pur). Muster war `communityCheckout.ts`, das die URL
schon aus `tenants.host` baut.

**8 (niedrig) — `admin/system/update.post.ts` protokolliert.** Dass sie
dev-only ist, war kein Grund: sie schreibt in `pnpm-workspace.yaml` und stößt
einen Install an. Dabei fiel auf, dass `user.created` in keiner der beiden
Sprachen einen Audit-Text hatte — nachgetragen.

**Beweise.** `pnpm -r test` grün (Billing 52, Admin 64, Core 477 — neu:
`checkout-fulfillment-gate`, `user-action-errors`,
`audit-metadata-pseudonymization`, umgewidmetes `userDataOrchestration`).
`pnpm lint` 0 Fehler / 6 bekannte Warnungen, `pnpm check:manifests` 18 Layer +
8 Apps konsistent, `pnpm typecheck` für `apps/control` (= billing + admin +
system + core) grün. Live: zwei Communities über einen Gast-Socket, Testzeilen
danach wieder entfernt.

**Gelernt:** Ein Fehler-Envelope, das nur bei 4xx einen Grund durchlässt,
erzeugt tote Hälften — und zwar genau dort, wo es weh tut. Die alte Regel
(„bei 5xx gibt es nichts zu erklären, nur zu verschweigen") stimmt für die
MESSAGE, nicht für den GRUND: es gibt 5xx, die eine handlungsleitende Auskunft
tragen, und „teilweise gelöscht, Konto gesperrt, bitte erneut ausführen" ist
eine davon. Seit dem 2026-08-02 gilt `reason` für jeden Status; verschwiegen
bleibt trotzdem alles Interne, weil `domainReasonFrom` nur einen kurzen, selbst
geschriebenen Schlüssel durchlässt. Zweite Lektion, dieselbe Familie: wer eine
Ablehnung nur an `statusText` hängt (`requireEntitlement`, 402 „Upgrade
required"), baut die nächste tote Hälfte — ein fachlicher Grund gehört an
JEDEN Wurf, den eine Oberfläche unterscheiden muss.

**Gelernt (2):** Row-Permissions sind am Realtime-Socket kein Mandanten-Netz.
Bei `read("any")`-Zeilen — und öffentliche Kommentare sind genau das — stellt
Appwrite jedem Zuhörer alles zu, auch einem Gast. Der Beweis dafür kostete
zwanzig Zeilen (roher WebSocket auf `tablesdb.<db>.tables.<table>.rows`, zwei
Zeilen anlegen, zählen was ankommt) und war den Aufwand wert: er verwandelte
„könnte theoretisch lecken" in „leckt, hier ist die Zeile". Das Web-SDK taugt
dafür nicht, es braucht `window`; der rohe Socket spricht dasselbe Protokoll.

---

### F19b · #33 — Der Cache-Anstoß hängt nicht mehr am Aufrufer ✅ 2026-08-02

**Befund.** F19 hatte die Ursache gefunden und den Anstoß gebaut — als
OPTIONALES drittes Argument von `indexStep`. Verdrahtet wurde er in den zwei
Migrationen, die die CI umgeworfen hatten (`media/003`, `events/007`). Am
nächsten Morgen starb die CI-E2E an `posts/004`: `tenantId`,
`column_not_available`, **23 Wiederholungen ohne Bewegung**, Abbruch — genau
das Muster von F19, nur in einer der **61** Migrationen ohne Anstoß. Der Schutz
existierte, an der Stelle des Schadens war er nur nicht eingeschaltet.

**Gebaut — die Sicherung sitzt jetzt in der Schnittstelle.** Es gibt kein
`nudge`-Argument mehr. `createIndexSteps(tablesDB, databaseId)` bindet Client
und Datenbank einmal je Datei und liefert zwei gebundene Formen, die den
`createIndex`-Aufruf **selbst** machen:

```ts
const { indexStep } = createIndexSteps(tablesDB, databaseId)
await indexStep('Index comments.author', {
  tableId: 'comments', key: 'author', type: 'key', columns: ['authorId'],
})
```

Der Index reist damit als DATEN statt als Funktion. Zwei Dinge folgen daraus,
und beide waren der Grund für die Form: der Anstoß kann nicht vergessen werden
(es gibt nichts mehr wegzulassen), und er kann nicht auf die falsche Tabelle
zeigen — er benutzt dieselbe `tableId` wie der Index. `createIndex(spec)` ist
die rohe Schwester für die sieben Migrationen, die ihr 409-Handling selbst
schreiben; `withIndexRetry(run, label, nudge)` bleibt als Unterbau, hat den
Anstoß aber als PFLICHT-Argument.

**Umgestellt:** 69 Migrationen, **148 Aufrufstellen**, mechanisch (Skript, vom
HEAD-Stand aus, jede Datei geprüft) — inklusive der zwei bereits verdrahteten,
damit es EINEN Weg gibt und nicht zwei. Nur der Aufruf hat sich geändert:
Fachlogik, Reihenfolge, Log-Texte und die Kommentare, die den historischen
Grund erklären, stehen unangetastet. Echte Fehler (falsche `tableId`, doppelte
Index-Namen) sind dabei keine gefunden.

**Der Wächter ist ESLint, nicht TypeScript.** Beim Umstellen fiel auf, dass
`packages/*/scripts/migrations/**` in **keiner** tsconfig liegt: weder
`nuxi typecheck` der Apps noch das Core-Playground nimmt die scripts-Ordner der
Layer auf. Ein Typfehler dort fällt nirgends auf (Gegenprobe: ein `tsc` über
alle 63 Migrationen meldet **14 vorbestehende** Fehler, die seit jeher
niemandem aufgefallen sind — Row-Generics, `Compression`, `title` in
`Partial<Row>`; alle unabhängig von dieser Arbeit, keiner betrifft die
Index-Anlage). `eslint .` jedes Layers sieht die Dateien dagegen sehr wohl.
Deshalb verbietet eine `no-restricted-syntax`-Regel rohes
`tablesDB.createIndex` in Migrationen — das ist der letzte Weg an der Fabrik
vorbei, und er ist jetzt zu.

**Beweise.**
- `pnpm -r typecheck` grün. Der Typ-Nachweis selbst per `tsc` über die
  Migrationen: die alte Closure-Form ergibt `TS2345` („`() => Promise<…>` ist
  kein `IndexSpec`"), `withIndexRetry` ohne Anstoß `TS2554` („Expected 3
  arguments, but got 2"). Dieselbe Stelle meldet ESLint zweimal mit der
  Klartext-Begründung; danach zurückgebaut.
- Voller Migrationslauf gegen eine **frische Datenbank** derselben lokalen
  1.9.6 (`NUXT_PUBLIC_APPWRITE_DATABASE_ID=f19proof pnpm --filter comments run
  bootstrap` — alle Layer in CI-Reihenfolge, dieselbe Kette wie
  `appwrite-setup` + `bootstrap --seed`): alle Tabellen, Spalten und Indizes
  angelegt, kein `column_not_available`.
- `packages/media/scripts/verify-index-nudge.mjs` **9/9** am lebenden 1.9.6
  (Cache in Redis vergiftet): Gegenprobe „nur warten" scheitert 8/8, MIT der
  Fabrik stößt der Wrapper beim dritten Fehlversuch an und der Index steht nach
  **5,8 s** — der Anstoß kommt dabei aus der Fabrik, der Aufrufer gibt nichts
  mit. Dazu 12 Unit-Tests in `packages/core/tests/indexRetry.test.ts` (vier neue
  nageln fest, dass die FABRIK verdrahtet und auf die Tabelle des Index zielt),
  `pnpm -r test` und `pnpm -r lint` grün.

**NICHT abgedeckt:** der lokale Lauf benutzt eine bestehende, warme
Appwrite-Instanz (nur die Datenbank ist frisch) und lief ohne `--seed`. Er
beweist, dass alle 148 umgestellten Aufrufe gegen ein echtes 1.9.6 durchgehen —
nicht, dass das Rennen dabei je aufgetreten wäre. Dass der Anstoß im Fehlerfall
wirklich feuert, zeigt nur `verify-index-nudge.mjs` (dort wird der Zustand
künstlich hergestellt); der Ernstfall bleibt der CI-Runner.

**Gelernt:** **Ein Schutz, den der Aufrufer mitgeben MUSS, ist ein Schutz, den
die Aufrufer vergessen.** 2 von 63 haben ihn durchgereicht, 61 nicht — und die
CI fiel prompt in eine der 61. Ein optionales Sicherheits-Argument ist keine
Sicherung, sondern eine Bitte. Die Sicherung gehört in die Schnittstelle: was
der Aufrufer nicht angeben kann, kann er nicht falsch angeben. Zweitens: **wo
eine Regel nicht geprüft wird, ist sie keine Regel.** Der Typfehler wäre hier
folgenlos geblieben — Migrationen typechecked niemand. Erst die ESLint-Regel im
tatsächlich laufenden `pnpm -r lint` macht daraus einen Wächter. Vor dem Bauen
eines Gates also nachsehen, ob das Werkzeug die Dateien überhaupt anfasst.

---

### F19 · #33 — Warum die CI-E2E zufällig starb: ein vergifteter Appwrite-Cache ✅ 2026-08-02

> **Die Nummer F19 war zweimal vergeben** (in OPEN-ITEMS.md standen am
> 2026-08-01 die Zeilen `33 · F19` UND `38 · F19`). Unterschieden wird deshalb
> über die laufende Nummer: **#33** ist dieser Eintrag (CI-E2E / Index-Cache,
> Fortsetzung in F19b · #33), **#38** ist der Sperr-Beweis weiter unten.

**Befund.** Zwei von acht E2E-Läufen eines Vormittags starben im Bootstrap mit
`column_not_available` — einmal `media/003` (`tenantId`), einmal `events/007`
(`communityId`). Die naheliegende Erklärung („Wiederhol-Vorrat zu knapp") war
FALSCH und ließ sich widerlegen: der Vorrat lief jedes Mal **vollständig** ab
(24/24 Versuche über 2,5 min), die letzten fünfzehn bereits auf der
Deckel-Pause — es ging nichts voran. Im selben Lauf gingen **67 andere Indizes
beim ersten Versuch** durch. Kein überlasteter Runner also, sondern ein
Zustand, aus dem Geduld nicht herausführt.

**Ursache (im Container-Quellcode von 1.9.6 nachgelesen, nicht geraten).** Der
Index-Endpunkt prüft die Spalte nicht am `attributes`-Dokument, sondern an der
Spaltenliste im **gecachten Collection-Dokument**
(`Indexes/Create.php:97` + `:170`). Der Worker setzt erst `status = 'available'`
(`Workers/Databases.php:210`) und räumt den Cache **erst danach** (`:242`) —
dazwischen liegt noch das Realtime-`trigger()`. Wer in diesem Fenster liest,
schreibt seinen veralteten Stand **nach** dem Räumen zurück; dann steht die
Spalte dort für immer auf `processing`, weil nichts ein zweites Mal räumt.
Bitter: der Poller, der auf `available` wartet, ist selbst der
wahrscheinlichste Vergifter — er liest genau in diesem Moment.

**Beweis.** Das Rennen ist lokal kaum zu treffen (Fenster im
Millisekundenbereich auf unbelasteter Maschine), der vergiftete ZUSTAND aber
exakt herstellbar: Cache-Eintrag in Redis auf `processing` zurückdrehen.
Damit ist die Kette gemessen — vergifteter Cache ⇒ 4/4 derselbe Fehler;
`updateTable` ⇒ Eintrag weg ⇒ Index sofort da.
`packages/media/scripts/verify-index-nudge.mjs` **9/9** mit Gegenprobe: ohne
Anstoß läuft der Vorrat leer (~2,5 min, wie in der CI), mit Anstoß steht der
Index nach **5,9 s**. Dazu 8 Unit-Tests (`packages/core/tests/indexRetry.test.ts`).

**Gebaut.** `indexStep`/`withIndexRetry` nehmen einen optionalen `nudge`; ab dem
dritten Fehlversuch wird der Cache angestoßen statt länger gewartet. Verdrahtet
in `media/003` und `events/007`. Die 141 übrigen Aufrufe verhalten sich
unverändert — der Rest steht als F19 in OPEN-ITEMS.

**Gelernt:** (1) **Ein erschöpftes Budget beweist nicht, dass es zu klein war.**
„24/24 verbraucht" heißt erst dann „zu wenig Geduld", wenn sich zwischendurch
etwas bewegt hat; hier bewegte sich nichts, und das war das eigentliche Signal.
Der Vorlauf-Commit hatte den Vorrat schon von 15 s auf 150 s erhöht — die
richtige Frage war nicht „wie lange?", sondern „wovon hängt es überhaupt ab?".
(2) **Die naheliegende Kur wäre eine Sicherheitslücke gewesen.** `updateTable`
setzt `rowSecurity` und `enabled` bedingungslos (Vorgaben `false`/`true`, nur
`permissions` erbt) — ein Anstoß mit bloßem `name` hätte still die
Zeilen-Sicherheit einer Tabelle abgeschaltet. Aufgefallen ist das nur, weil vor
dem Einbau die Parameter-Semantik im Quellcode gelesen wurde; der Test trägt
die Gegenprobe seitdem fest. (3) **Ein Beweis ohne Gegenprobe ist keiner** —
beide Beweisskripte zeigen zuerst, dass der Fehler ohne die Kur auftritt.


## AH-4c — Appwrite-Projekt `control` → `admin` (2026-08-18/19, KOMPLETT)

Davids Entscheidung gegen die Empfehlung „nur Anzeige-Name": echtes neues
Projekt `admin` + 1:1-Umzug per eigenem Werkzeug
(`scripts/ops/ah4c-project-transfer.mjs`, Selbsttest 30/30, vitest 54/54).
Wartungsfenster ~15 min: 1 Nutzer + 249/249 Rows + 4/4 Dateien, verify
deep-equal grün; Delta (3 Rows) gezielt nachgezogen; Env-Schnitt
admin+platform; Serien-Proben grün (Mandanten-Hosts 3×200,
Runner-Heartbeat im neuen Projekt). Danach Schlüssel-Hygiene: alle Keys
least-privilege (Runtime 84→10, Migrations 84→12, dedizierter
rows.read-Naht-Key), F42-Breitkey gelöscht. Beobachtung von David am
2026-08-19 bewusst verkürzt: beide Rückweg-Keys widerrufen (Gegenprobe
2×401), Projekt `control` eingefroren mit 0 Keys, Backups gelöscht —
langsamer Rückweg (neue Keys + Env-Tausch) bleibt, solange das Projekt
existiert. Runbook: docs/runbooks/ADMIN-PROJEKT-CUTOVER.md.

**Gelernt:** (1) „Scopes ergänzt" heißt beim Menschen oft „Select all" —
nach jedem Konsolen-Klick-Auftrag die Scope-ZAHL nachmessen, nicht die
Aussage. (2) Beim pbpaste-Rezept muss das Secret der LETZTE Kopiervorgang
sein, sonst landet der Befehlstext als Key in der Datei — die Befehle
prüfen seither das Präfix. (3) Nach dem Schnitt ist die rows-Phase eines
Transfer-Werkzeugs nicht mehr idempotent-sicher (das Ziel lebt und wächst)
— Deltas gezielt nachziehen statt Volllauf. (4) `/health/version` ist
konsolen-intern und antwortet JEDEM Server-Key 401 — kein Scope-Fehler.

---

## 📌 Master-To-do — erledigte Brocken

Legende Wer: **[David]** nur David · **[Claude]** autonom machbar ·
**[beide]** Claude baut, David entscheidet/gibt frei.

| # | Task | Wer | Schwere | % | Status |
|---|------|-----|---------|---|--------|
| 3 | **Money-Path-Rest** — #6b Cross-Sub via Stripe-Autorität + #7a Workspace-Customer/Owner-Portal. Deployt 2026-07-22, Details [DECISION-LOG](DECISION-LOG.md). | — | — | 8 | ✅ fertig |
| 4 | **Horizont 3 — Pool+Silo Multi-Tenancy** ([Blueprint](archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md)) — **Kern KOMPLETT (2026-07-23):** Spike ✅ · Schicht 1 ✅ · 4.1 Pool-Datenpfad ✅ · Naht 1/2 ✅ · tenants-Register + Resolver ✅ · Onboarding-UI ✅ · **Prod-Rollout ✅** (platform.pukalani.app als 4. ploi-Site, Wildcard-DNS + ploi-verwaltetes Wildcard-TLS, Pool-Projekt `pool` mit 9 Tabellen, demo.pukalani.app live: 200 + gescopte Liste, unbekannte Hosts 404; Deploy-Kette + Secret; Learnings: platform-Build braucht 3584 MB Heap, `/api/health` + `/_i18n/` sind host-freie Infra-Pfade) · **4.2 Wellen-Migrationen ✅** (tenants.wave internal→canary→stable, `pnpm migrate --wave` + Control-UI, fail-loud, control-012 auf Dev+Prod) · **4.3 Quota ✅ scharf** (assertPoolWriteQuota, comments 1000/Tag + 50k gesamt im Pool, 429 lokal bewiesen — **Zahlen abnicken, s. Kasten unten**) · Microcaches tenant-aware ✅ (tenantCacheScope: changelog, features). **Fläche 2 ✅** reports (moderation-002) gepoolt. **Quota pro Plan ✅ (2026-07-23):** tenants.plan (control-013, free/pro/business) staffelt die Limits (free 200/Tag+5k · pro 1.000/50k · business 5.000/250k; Silo ohne Limit); limitsForPlan pure-getestet, Control-UI Plan-Badge+Select, Migration Dev+Prod. **Tenant-Homepage MVP ✅ (2026-07-23):** pages-Layer in platform gepoolt (pages-003), index.vue rendert die `home`-Seite des Tenants (Markdown + `[[comments]]`-Block, useRequestFetch für Host-Weitergabe), Isolation lokal bewiesen (kunde-a Seite / kunde-b Fallback). **Live-Isolationsskript** [verify-pool-isolation.mjs](../packages/comments/scripts/verify-pool-isolation.mjs). **Read-only-Control-Plane-Key ✅ (2026-07-24, autonom):** `platform-control-readonly` (NUR rows.read) live auf app-prod (Write-Probe 401, demo 200/unknown 404); dabei kompletten Provisioner-Cleanup nachgeholt (pool-Projekt → Pukalani-App-Team, Team provisioning + provisioner-Account weg — alle 4 Prod-Projekte gehören jetzt David) + geleakten comments/migrations-Key rotiert ([Runbook](runbooks/PLATFORM-CONTROL-KEY-SWAP.md)). **Community-Plattform G0+G1 ✅ (2026-07-24, autonom):** Produktvertrag ([G0](referenz/G0-PRODUKTVERTRAG.md), David: Nav, 5-Rollen, Tarif, EA-Scope; kanonische Kunden-Site = **der Tenant**) + Sicherheits-Naht ([Roadmap](archiv/SAAS-ROADMAP.md) G1): `control-015` (`tenants.workspaceId` + `site_members`), core `tenantAuthz` (5 Site-Rollen owner/admin/mod/editor/viewer), `requireTenantPermission` (Cross-Projekt, 30-s-Cache, fail-closed), **Naht 4** `tenantRowPermissionsFor` (read(label(siteId)), Mechanismus + 11 Tests) + **Isolationsbeweis** grün lokal+prod (162 core + 58 studio). **Nachtrag 2026-07-25/28:** Naht-4-Live-Wiring + Session-Label je Site sind mit O5 erledigt (Site-Label wird gesetzt, `requireSitePermission` gilt), „Admin per Tenant" ist mit den Site-Rollen (N1) erledigt — der Owner erreicht sein Dashboard und sieht nur seine Capabilities. **Gelernt:** (1) Der platform-Build braucht **3584 MB Heap** — mit dem Standard-Cap starb er auf dem Server, nicht lokal. (2) `/api/health` und `/_i18n/` müssen **host-frei** bleiben, sonst sperrt der Mandanten-Resolver die eigene Infrastruktur aus. (3) Ein Migrations-Key war geleakt und musste rotiert werden — Schlüssel gehören in Dateien unter `~/.appwrite-secrets/`, nie in Repo-nahe Env-Dateien. **M4 ✅ (2026-07-31):** der letzte ~1 % — das Schlüssel-Verzeichnis für Silo-Communities (`packages/control/scripts/list-silo-keys.ts`, Eintrag unten). Der dynamische Silo-ADMIN-Zugriff zur Laufzeit bleibt bewusst bei seinem 501 (Sicherheitsentscheidung ohne heutigen Konsumenten) — H3 gilt damit als geschlossen. | Claude (Etappen-Go: David) | schwer | 40 | ✅ 40/40 fertig |
| 5 | **Embed-Widget E2–E4** ([Plan](archiv/EMBED-WIDGET.md)) — **E2 ✅ + E3 ✅ (2026-07-23):** E2 = Schreiben im iframe (Popup-Login + Handoff-Token + CHIPS-Cookie; CSRF-scharf; prod-bewiesen cross-site von davidschubert.com inkl. Cookie-Forensik). **E3 = Site-Registry** `embed_sites` (comments-012, Dev+Prod) + Admin-UI `/dashboard/embed` + Registry-gespeiste frame-ancestors-CSP (allowedOrigins jetzt `['http://localhost:*']` statt `['*']`; davidschubert.com in Prod-Registry) + `GET /api/comments/count` (CORS, `data-pukalani-count`-Loader) + Redis-Rate-Limit. Bewiesen: CRUD per API (Create/409/PATCH/DELETE), CSP-from-Registry + count-CORS + 3 Fehlermeldungs-Zweige, 10 Unit-Tests, Embed-E2E grün. **E4 ✅ (2026-07-23):** (1) **Gast-Kommentare** ohne Account (Name+E-Mail, ohne Verifikation) — POST `/api/comments/guest` (Gate `embed.guests`, Rate-Limit 5/min/IP, Tenant-Quota, kein operatorTarget), comments-013 (`authorKind` + operator-lesbare `guest_authors`-Tabelle; **E-Mail nie auf der read(any)-Row**), GuestCommentForm + „Gast"-Badge; live bewiesen (POST 201, keine E-Mail in der öffentlichen Liste, anon-Read von guest_authors 401, Browser-E2E). Aktiviert auf der comments-App. Migration: lokaler Pool, Prod-Pool, Prod-comments. (2) **Presence im Embed** — funktioniert out of the box (geteilter Realtime-Socket trägt sie ins iframe; heartbeat+realtime-token+presences alle 200 live nachgewiesen). (3) **Web-Component** `<pukalani-comments>` (public/pukalani-comments.js, Shadow DOM, sandboxed iframe → keine XSS-/CORS-Fläche); live bewiesen (Shadow-Root+iframe, Resize 308px). **Bewusst später (supervised):** echte Inline-Render-Variante ohne iframe (eigener Sanitizer + CORS-Allowlist) + E3-Task-17 (dedizierte apps/embed-comments). **Gelernt:** `localhost:PORT` gegen `localhost:PORT` ist same-**site** — ein lokaler „Cross-Origin"-Test beweist beim Cookie-Verhalten NICHTS. Cross-Site-Beweise brauchen echte Domains (deshalb der Prod-Beweis von davidschubert.com samt Cookie-Forensik). Und: die E-Mail eines Gastes darf nie auf einer `read(any)`-Row landen — dafür gibt es die getrennte `guest_authors`-Tabelle. | Claude | schwer | 12 | ✅ E2–E4 fertig |
| 6 | **Themes-Vollausbau 26×11** ([Plan](archiv/THEMES-VOLLAUSBAU.md)) — **✅ FERTIG (2026-07-24, E1–E7 alle per Empfehlung):** kuratierter Katalog `theme.catalog.ts` (21 Hue-Kreis-Welten + 5 gedeckte Ausreißer, je Basis+10 tonale Varianten = 286 Ramps), Generator mit Kontrast-Gate (Anker fest 500 — Bestands-500er byte-gleich, `--ui-primary` bleibt 600/400), committete `themeRegistry.gen.ts` + CI-Gate `check:themes` (lint.yml), Grid-Modal-Picker mit sticky Varianten-Reihe (E7b). Bewiesen: 62 Unit-Tests + Guard (26×11), SSR-Cookie-Beweis, Visual-Baselines 9/9 neu, Dark-Stichprobe. **Gelernt:** Generierte Dateien gehören ins Repo UND hinter ein CI-Gate (`check:themes`) — sonst laufen Katalog und erzeugtes CSS auseinander, ohne dass es jemand merkt. Der Kontrast-Anker muss FEST auf Stufe 500 stehen, sonst verschiebt jede Neugenerierung bestehende Kundenfarben. | Claude | schwer | 10 | ✅ fertig |
| 7 | **Deploy-RAM-Härtung** — Swap (18.07.) + NODE_OPTIONS-Cap 2560 in ploi-`~/.bashrc`; Praxistest: Deploys in Folge sauber. Nachtrag 23.07.: platform-Build braucht 3584 (Deploy-Script), Überhang läuft in den Swap. | — | — | 3 | ✅ fertig |
| 8 | **Shared Rate-Limit-Store** — ✅ 2026-07-23: Redis lief auf app-prod bereits (bei Server-Einrichtung mitinstalliert, localhost:6379). Core `rateLimitStore.ts` (Fixed-Window, peek/hit; Redis wenn `NUXT_REDIS_URL` gesetzt, sonst In-Memory; fail-open mit Log; Keys pro Appwrite-Projekt gescoped), Middleware umgestellt, Unit-Tests + lokaler E2E (5×200 → 429, geteilter Redis-Zähler). | — | — | 3 | ✅ fertig |
| 9 | **E2E studio + portfolio** — Playwright-Smoke (10 + 5 Tests) nach comments-Muster; `pnpm --filter <app> e2e`. | — | — | 3 | ✅ fertig |
| 13 | **Self-Service-Onboarding ✅ GEBAUT (2026-07-25, O1–O6)** — der öffentliche Trichter läuft: `app.pukalani.app` (Kontroll-Host, Nicht-Mandant mit fail-closed API-Allowlist) → Invite-Code → **Wizard in 7 Schritten** → Community steht → **Handoff, der eingeloggt ankommt**. Abnahme nach Roadmap-DoD: **10 unbeaufsichtigte Läufe, Median 0,3 s**, Retry idempotent, keine Waisen-Rows. Dazu: Branding pro Mandant (nicht pro Projekt), `requireSitePermission` (Site-Rolle vor protokolliertem Break-Glass), Site-Label für Naht 4, Startseite aus der Beschreibung, Testphasen-Sweep. **Hosts umbenannt (2026-07-25):** `control.` (Betreiber, Alias der Control-Site + Wildcard-Zertifikat) · `my.` (Kundenbereich) · `start.` (Kurz-Link in den Wizard) — alle live, Altnamen antworten weiter. Details: [SAAS-ROADMAP #1](archiv/SAAS-ROADMAP.md) | Claude | schwer | — | ✅ Trichter fertig |
| 10 | **SaaS-Produkt-Roadmap + pukalani.app-Landingpage** — ✅ SPEZIFIZIERT (2026-07-24): der verlorene „10-Ideen"-Zettel wurde durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (9 Ideen, Davids Entscheidungen je Idee, UI/UX-Konzepte für Tenant-Selbstverwaltung/Dashboard-IA/Custom-Domains) + [PUKALANI-LANDINGPAGE.md](archiv/PUKALANI-LANDINGPAGE.md) (SEO+UX-Konzept). **✅ GEBAUT (2026-07-27):** die Landing ist live auf `pukalani.app` (ploi-Site 392338, Apex proxied über Cloudflare), Roadmap-Blöcke §A Dashboard-IA, #2 Tenant-Selbstverwaltung und #1 Self-Service-Onboarding sind umgesetzt. Rest: laufende Inhaltspflege (Netto/Brutto s. A3; og:image je Community ist seit 2026-07-29 erledigt, s. B2). | beide | mittel | 2 | ✅ Landing live |
| 11 | **GitHub-Klicks** — ✅ 2026-07-23: #16/#15/#2 hatte David am 21.07. gemergt; Release-PR #18 gemergt → **v2.2.0 released** (Changelog-Draft automatisch angelegt — Kuratieren + Publish von v2.1.0 UND v2.2.0 liegt bei David im Dashboard). Neu offen: Dependabot #19–23 (npm-Bumps, kein workflow-Scope nötig). | — | — | 1 | ✅ fertig |
| 12 | **Kleinkram** — ✅ Demo-Passwörter · ✅ >14k-Limit (MEDIUMTEXT) · ✅ Wegwerf-Projekte gelöscht (2026-07-24): alle 7 lokalen Probes (s0-*, s1-probe-*, s3-*) weg — 5 regulär via Console-API (Login als Spike-User s0-admin), 2 chirurgisch per DB (Appwrite-Delete warf `openssl_decrypt cipher_algo empty`-500; 132 präfix-verifizierte Tabellen gedroppt + Console-Rows entfernt), Wegwerf-Teams s0-org/pukalani-sites gelöscht, Spike-Console-User s0-admin (hartkodiertes PW!) entfernt, Redis-Cache geflusht; echte Projekte per Smoke verifiziert (401 vs 404). **Gelernt:** Appwrites Projekt-Löschung kann mit `openssl_decrypt cipher_algo empty` in einen 500 laufen — dann bleibt nur der chirurgische Weg über die DB, und der verlangt VORHER eine Präfix-Verifikation jeder Tabelle. Und: ein hartkodiertes Spike-Passwort überlebt den Spike, wenn niemand aufräumt. ✅ Dependabot #19–23: von Dependabot selbst geschlossen — die Bumps (u. a. @nuxt/ui 4.10, vue-tsc 3.3.8) kamen längst über den pnpm-Catalog rein. | — | — | 1 | ✅ fertig |

**Fertig-Anteil zum Stichtag 2026-07-30: 82 % ✅ (43 % + 39/40 von H3) ·
offener Rest (18 %) wartet fast vollständig auf David: Rechtstexte (5) +
Stripe-Live (12) + Audience-Entscheidung (1, inzwischen als C18 entschieden).**
Der Stichtag bleibt stehen (Momentaufnahme); H3 steht seit 2026-07-31 auf
40/40 — M4 war der Rest.

> **📋 Quota-Zahlen (H3-4.3) — seit 2026-07-24 IM STUDIO EDITIERBAR:**
> Studio → Tenants → „Pläne & Limits": free 200/Tag + 5.000 gesamt ·
> pro 1.000/50.000 · business 5.000/250.000 (Seed = beschlossene Zahlen;
> 0 = unbegrenzt). Änderungen wirken im Pool nach ≤ 90 s ohne Deploy
> (tenant_plans, control-014 → Resolver legt Limits in den TenantContext;
> app.config bleibt Fallback). Silo-Kunden: ohne Limit (eigenes Projekt).

---

## A — erledigt (blockierte den ersten zahlenden Kunden)

| # | Task | Erledigt | Wer |
| --- | --- | --- | --- |
| A3 | **Netto/Brutto-Angabe** — ✅ ERLEDIGT (2026-07-29, Davids Entscheid: **Brutto**): 29 €/149 € sind Endpreise, Hinweis „inkl. 19 % MwSt." / „incl. 19 % VAT" steht AM Preis — Landing (`PricingSection` + FAQ, de/en), Hilfe (`anleitung/5.abrechnung.md`), Billing-Preistafel (`packages/billing`), Betreiber-Preisfeld (control) als „brutto" beschriftet. **REST [David], läuft in A2 weiter:** Stripe legt die Prices ohne `tax_behavior` an und die Checkouts laufen mit `automatic_tax` — steht das Konto-Default auf „exclusive", rechnet Stripe 19 % oben drauf und widerspricht der Landing. Prüfung vor dem Live-Gang: [STRIPE-GO-LIVE-RUNBOOK](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) §2.4. **Gelernt:** Eine Preisangabe ist erst dann konsistent, wenn auch die ZAHLSTELLE dasselbe rechnet — steht Stripes Konto-Default auf „exclusive", schlägt es 19 % auf den beworbenen Endpreis auf. Preis-Texte und `tax_behavior` immer im selben Arbeitsgang prüfen. | 2026-07-29 | ✅ Claude · Stripe-Rest David |
| A4 | ~~**Presence-Rows sind pool-weit lesbar**~~ — **erledigt 2026-07-29** (Weg (c), Davids Entscheidung): Presencen tragen im Pool `read("label:<siteId>")` statt `read("users")`, das Label vergibt `core/server/middleware/site-label.ts`. Der tenantId-Filter bleibt als Netz. Beweis in beide Richtungen: `packages/core/scripts/verify-presence-boundary.mjs` (23/23). **Nachtrag:** die damalige Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") ist mit A5 ersetzt — sie war mit C16 nicht mehr haltbar. Analyse + Umsetzungs-Stand: [PRESENCE-GRENZE.md](archiv/PRESENCE-GRENZE.md) Abschnitt 8. **Gelernt:** Die erste Fassung der Label-Regel („wer eingeloggt einen Mandanten-Host benutzt, ist Mitglied") hielt keinen Tag — sie beschrieb ein VERHALTEN statt einer Tatsache und machte „Zugang entziehen" wirkungslos (→ A5). Eine Berechtigung muss an einem Datensatz hängen, den man entfernen kann, nicht an einer Beobachtung. Rest-Falle, die bleibt: eine Label-Änderung berechnet die Rollen bereits OFFENER WebSockets nicht neu. | 2026-07-29 | ✅ |
| A5 | ~~**„Zugang entziehen" wirkte nicht**~~ — **erledigt 2026-07-29** (Davids Entscheidungen 1+2): Mitgliedschaft ist jetzt ein EREIGNIS und das Site-Label folgt ihr, statt sie zu behaupten. Gesteuert vom bestehenden Schalter `tenants.openRegistration`: offen ⇒ Beitritt mit Rolle `viewer` bei (a) Kontoanlage auf dem Mandanten-Host und (b) erstem eigenen Schreibvorgang (abgefangen in der Datentür, nicht in zwanzig Routen) — ein bloßer Seitenaufruf löst bewusst nichts aus; geschlossen ⇒ nur per Einladung. Entfernen zieht Rolle UND Label (`revokeSiteLabel` + Kurzzeit-Notiz gegen den 30-s-Rollen-Cache) und ist gegen Wiederbeitritt gesperrt. Bestand aus der A4-Zeit (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst — kein Backfill-Skript. Mitgliederliste zeigt alle, Standardansicht filtert aufs Team. Beweis: `verify-site-authz.mjs` Abschnitt 10 (97/97) + `verify-presence-boundary.mjs` (23/23). **Gelernt:** Den Beitritts-Auslöser in die **Datentür** zu legen statt in zwanzig Routen war der Unterschied zwischen „einmal richtig" und „neunzehnmal richtig und einmal vergessen". Und: ein 30-s-Rollen-Cache macht jeden Entzug für eine halbe Minute wirkungslos — deshalb die Kurzzeit-Notiz `rememberSiteAccessRevoked`. | 2026-07-29 | ✅ |
| D7 | ✅ **ERLEDIGT 2026-07-30.** Neu ist `listOperatorIds()` in `packages/control/server/utils/inviteRequests.ts`: Appwrite filtert das Label jetzt SELBST (`Query.contains('labels', ['admin'])`, gegen eine laufende 1.9.6 verifiziert), dazu eine Cursor-Seitenschleife. Der `includes('admin')`-Nachcheck bleibt bewusst stehen — `contains` arbeitet auf Strings substring-artig, ein Konto mit Label `administrator` darf hier nicht mitgemeint sein. Wird der Seiten-Deckel erreicht, ist das eine LAUTE Log-Zeile statt einer stillen Kürzung. Dass die Grenze real ist, wurde beim Fix gemessen: die geprüfte Instanz hat **42 Konten**, davon 4 mit `admin` — mit `limit(25)` war das Durchrutschen keine Theorie mehr. Lint sauber, 139 Tests, Typecheck 0 Fehler. **Gelernt:** Jede Liste ohne explizite Seitenschleife ist ein stiller Datenverlust in Zeitlupe — Appwrites Default-`limit` ist 25. Und `Query.contains` arbeitet auf Strings substring-artig: `admin` matcht auch `administrator`, der Nachcheck im Code bleibt Pflicht. Erreichte Deckel gehören LAUT ins Log, nie still gekürzt. | 2026-07-30 | Claude |

---

## B — erledigte Entscheidungen

| # | Frage | Erledigt | Wer |
| --- | --- | --- | --- |
| B2 | ~~**og:image je Tenant-Seite**~~ — **erledigt 2026-07-29** (Davids Entscheidung: **automatisch generiert**, kein Upload-Feld und kein Einheitsbild). `/og/<key>.png` liefert je Community eine 1200×630-Karte aus Theme-Basisfarbe + Community-Name + dezenter Wortmarke; `useLocaleSeoHead()` (core) setzt og:image/width/height/type/alt + `twitter:card` als EINZIGE Stelle, absolut auf dem Request-Host. **PNG, nicht SVG** — Facebook/WhatsApp/LinkedIn zeigen SVG als og:image nicht. Gerastert OHNE Renderer im Betrieb: Chrome hat die Zeichen einmal in ein Deckungs-Atlas gebacken (`packages/themes/scripts/generate-brand-card-font.mjs`, 85 KB committet), der Server setzt sie zusammen (~16 ms Event-Loop, Kompression im Threadpool) und legt das Bild unter `/tmp` ab — je Community faktisch EINMAL. Beweis: `apps/platform/scripts/verify-og-image.mjs` (19/19 grün gegen demo.localhost). Gate `pukalani.seo.tenantOgImage` (Core-Default aus). **Offen als mögliche Ergänzung:** eigenes Bild hochladen (bewusst NICHT gebaut). **Gelernt:** Facebook, WhatsApp und LinkedIn zeigen **kein SVG** als og:image — die erste, elegante SVG-Lösung war unbrauchbar und musste als PNG neu gebaut werden. Beim Rastern gilt: kein Renderer im Betrieb (Chrome backt die Zeichen einmal in ein Atlas), und der Schlüssel in der Bild-URL darf nie EINGABE sein, sonst füllt ein Bot mit erfundenen Schlüsseln die Platte. Ablage in `tmpdir()`, nie in `.output` — Release-Slots wechseln den Pfad. | 2026-07-29 | ✅ |
| B3 | ~~**Theme-Name „Sunrise"** steht im Picker neben dem bestehenden „Sunset"~~ — **erledigt 2026-07-29** (Davids Entscheidung): das Standard-Theme heißt im Picker **„Aloha"**. Geändert wurde AUSSCHLIESSLICH das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n — Theme-Namen sind Eigennamen, de = en); die Id bleibt `default`, weil sie in `tenants.theme`, `data-theme`, den CSS-Dateinamen und gespeicherten Kunden-Configs steckt. Test hält Name + Eindeutigkeit fest (`tests/builtinThemes.test.ts`). **Gelernt:** Ein Anzeige-Label ist NICHT der Schlüssel. Wer ein Theme über seine Id umbenennt, bricht `tenants.theme`, `data-theme`, die CSS-Dateinamen und alle gespeicherten Kunden-Configs auf einmal. | 2026-07-29 | ✅ |
| B5 | ~~**Besucher-Theme vs. Community-Theme**~~ — **erledigt 2026-07-29** (Davids Entscheidung: die Community gewinnt). Auf einem Mandanten-Host wird das Theme-Cookie GAR NICHT mehr gelesen: `data-theme/data-variant` kommen aus `tenants.theme/variant`, ohne eigene Wahl aus der Instanz-Einstellung. Der Theme-Wähler VERSCHWINDET dort (öffentliches Anzeige-Menü + Dashboard-Kontomenü) statt beschriftet zu werden — er hätte auch „nur für dich" nicht mehr gewirkt. Hell/Dunkel, Neutral-Palette und Sprache bleiben Besucher-Wahl. Regel pur + getestet in `packages/themes/shared/themeSelection.ts` (11 Fälle); live belegt an `kunde-a.localhost` (Cookie `crimson` → SSR `data-theme="lagoon"`) gegen `app.localhost` (Cookie gewinnt weiter). **Rest ebenfalls erledigt (2026-07-29, Davids Entscheidung: JA):** die **Neutral-Palette folgt der Community**. Neue Spalte `tenants.neutral` (Migration **control-020**, additiv, `''` = keine eigene Wahl → Voreinstellung), zweite pure Funktion `resolveNeutralSelection` auf EIGENER Achse (die Herkunft kann von der des Themes abweichen, deshalb kein viertes Feld im Theme-Ergebnis) — 14 neue Fälle, Registry-Prüfung `isBuiltinNeutralSelection` gegen `NEUTRAL_REGISTRY`. Gesetzt wird sie als EINE Zeile „Grundton" neben Theme/Variante in `/dashboard/settings/community` (10 Chips inkl. „Voreinstellung"); der Besucher-Umschalter verschwindet auf Mandanten-Hosts aus Anzeige-Menü, Dashboard-Kontomenü und Theme-Studio (`canChooseNeutral`). Hell/Dunkel und Sprache bleiben Besucher-Wahl. Beweis: `packages/onboarding/scripts/verify-site-branding.mjs` 40/40 (u. a. `kunde-a` mit Cookie `pukalani-neutral=olive` → SSR `data-neutral="taupe"`, Kontroll-Host mit demselben Cookie → `olive`). **Rest lief als D6 weiter — erledigt am 2026-08-01 (eigene Zeile unten):** eine Änderung erreichte offene Fenster nicht ohne Reload (`communities` liegt im Control-Plane-Projekt, es gibt dafür kein Realtime); gelöst über den Spiegel `community_branding` im Runtime-Projekt. **Gelernt:** Ein Wähler ohne Wirkung ist eine Lüge — deshalb VERSCHWINDET der Theme-Umschalter auf Mandanten-Hosts, statt beschriftet zu werden. Die Regel selbst gehört in eine PURE Funktion mit Fallmatrix (11 + 14 Fälle); die Composables legen nur Cookies und Registry-Prüfung darum. Und `''` (keine eigene Wahl) darf nie in ein `USelectItem` — Nuxt UI verbietet leere Werte, deshalb Chips. | 2026-07-29 | ✅ |
| B6 | ✅ **ENTSCHIEDEN 2026-07-30 (David): `UTable` ist der Standard für Datenlisten** — Sortierung, Auswahl und Paginierung kommen mitgeliefert und verhalten sich überall gleich; handgebaute Listen nur mit Grund, und der gehört an die Stelle geschrieben. Steht als Regel in CLAUDE.md. **Offen ist damit nicht mehr die Frage, sondern das Ausrollen** auf die ~18 handgebauten Listen — das läuft mit E9 (Dashboard-Umbau), damit die Listen nicht zweimal angefasst werden. | 2026-07-30 | David |

---

## C — erledigt (Claude konnte sofort)

| # | Task | Erledigt | Herkunft |
| --- | --- | --- | --- |
| C0 | ✅ **ERLEDIGT 2026-07-28** — media-002 gegen Projekt `comments` gefahren. Vorher: Tabelle `rowSecurity=false` + `read("any")`, Bucket `fileSecurity=false` + `read("any")` — jeder Anonyme konnte Entwürfe samt Bild abrufen. Nachher: beide `rowSecurity/fileSecurity=true` mit leeren Table-/Bucket-Rechten, das Leserecht hängt an der Row bzw. Datei und folgt `published`. Der veröffentlichte Bestand (1 Eintrag) trägt jetzt `read("any")` + `read("label:admin")` und ist unverändert erreichbar (Galerie-URL → HTTP 200, image/webp). Ist-Zustand vorher als JSON gesichert. **Voraussetzung war**: dem `comments`-Migrations-Key fehlten Storage-Scopes — media-002 ist die erste Migration, die einen Bucket anfasst (David hat sie am 2026-07-28 ergänzt). `photos` war nie betroffen (nicht in Produktion). **Gelernt:** Migrations-Keys haben **Scopes** — media-002 war die erste Migration, die einen Bucket anfasst, und scheiterte, bis David dem `comments`-Key die Storage-Scopes gab. Vor jeder Migration prüfen, welche Ressourcenart sie berührt. Zweitens: den Ist-Zustand VORHER als JSON sichern, sonst gibt es keinen Vergleichspunkt für „nachher unverändert erreichbar". | 2026-07-28 | Audit B3 |
| C0b | ✅ **ERLEDIGT 2026-07-29** — die beiden ruhenden Migrationen sind auf prod gefahren. **system-021** (`activities.tenantId` + `idx_tenant`) auf ALLE vier Instanzen mit Appwrite: control, pool, comments, portfolio (marketing und help haben keine Datenebene). **media-003** (`media_items.tenantId` + `idx_tenant_published_order`) auf comments — die einzige Prod-Instanz mit media, weil photos nur lokal läuft. Vorher je Instanz gesichert, danach gegengeprüft: überall `tenantId` mit Status `available`, Spalten 8→9 bzw. 7→8, Indizes 3→4 bzw. 1→2, Zeilenbestand unverändert (comments 32 Aktivitäten, 1 Medien-Eintrag). Alle Kunden-Hosts danach 200. | 2026-07-29 | C1b / Audit B3 |
| C0c | ✅ **ERLEDIGT — war schon auf prod, die Zeile war veraltet** (nachgeprüft 2026-07-29). `system-022` (`notifications.tenantId` + `idx_recipient_tenant`) liegt auf **allen vier** Instanzen mit Datenebene: `control`, `pool`, `comments`, `portfolio` — je 8 Spalten, `tenantId` mit Status `available`, 4 Indizes inklusive `idx_recipient_tenant` (gelesen über `listColumns`/`listIndexes` gegen `https://api.pukalani.app/v1` mit den Migrations-Keys). Das Rückfall-Fenster, vor dem diese Zeile warnte, hat es also nie gegeben. `notifications` ist auf allen vier noch leer (0 Zeilen) — die Glocke ist jung, ein Backfill wäre ohnehin gegenstandslos. **Gelernt:** Eine Warnung in einer To-do-Liste ist eine BEHAUPTUNG, bis jemand nachmisst. Diese hier warnte vor einem Rückfall-Fenster, das es nie gab. Vor dem Handeln immer den Ist-Zustand gegen die Instanz lesen (`listColumns`/`listIndexes`), nicht gegen die Notiz. | 2026-07-29 | C15 |
| C1 | ✅ **ERLEDIGT 2026-07-28** — `/api/admin/stats\|analytics` gaten über `await requireSitePermission(event, 'dashboard.access')` statt label-only. Bewusst diese Capability: sie ist die Eintrittskarte, die alle fünf Site-Rollen auf die Übersicht bringt — enger gegated bliebe die Seite für Editor und Viewer leer, der Befund wäre nur verschoben. Kennzahl-genau geklemmt: `commentsReported` nur mit `comments.moderate` (offene Meldungen sind Moderations-Wissen), `usersTotal`/`usersInRange` bleiben im Pool `null` wie gehabt — Karte bzw. Balkenreihe entfallen dann, statt eine fremde Zahl zu zeigen. Mitgenommen: **Audit S2** — die Übersicht gatet ihre Widgets jetzt einzeln (Schnellmoderation `comments.moderate`, Aktivität `audit.read`, Speicher `storage.manage`), inklusive `immediate`, damit für Site-Rollen keine vorhersehbaren 403-Fetches mehr rausgehen. Beweise: `packages/admin/tests/dashboard-stats-authz.test.ts` (11 Fälle) + live 30/30 in `verify-site-authz.mjs` (neuer Abschnitt 6b: Owner 200, Fremder 403, Gast 401). | 2026-07-28 | Pool-Audit N8 |
| C1b | ✅ **ERLEDIGT 2026-07-28** — media und activity gehen durch die Datentür. Migrationen: **media-003** (`media_items.tenantId` + idx_tenant_published_order) und **system-021** (`activities.tenantId` + idx_tenant), beide additiv/ruhend ohne Backfill ('' = Silo, im Pool fail-closed). Alle sechs `server/api`-Routen über `tenantDb(event)`, `as:'operator'` nur wo fachlich nötig (Entwurfs-Rows ohne breites Leserecht, Rows ohne Schreibrechte) und je Fall am Code begründet. Auch die Helfer außerhalb des Backstops: `applyMediaVisibility` prüft selbst, `recordActivity` (core) stempelt Mandant + Site-Label statt `read(users)` — sonst hätte im Pool jedes Mitglied den Feed aller Communities bekommen, auch über Realtime. Der Activity-Realtime-Stream filtert zusätzlich clientseitig (`useTenantId`). ESLint-Backstop auf beide Layer erweitert; Isolationsbeweise `packages/{media,activity}/tests/tenant-isolation.test.ts` gegen echte Appwrite grün. **Prod-Migrationen nachgezogen mit C0b (2026-07-29).** **Ein Rest, kein Leck**: Entwurfs-DATEIEN im Bucket tragen nur den globalen Operator-Read — im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht vorschauen; Richtung (server-seitige Vorschau-Route) steht in `media/server/utils/mediaPermissions.ts`. **Gelernt:** Der ESLint-Backstop gegen rohes `.tablesDB` griff nur in `server/api/**` — der Stats-Contributor von comments liegt aber in `server/plugins/**` und zählte deshalb ungebremst pool-weit in eine Kunden-Ansicht. Wer einen `H3Event` bekommt, bedient einen REQUEST und gehört hinter dieselbe Tür wie eine Route. Zweitens: `recordActivity` stempelte `read(users)` — im Pool hätte damit jedes Mitglied den Feed ALLER Communities bekommen, auch über Realtime. Helfer außerhalb des Backstops sind die gefährlichsten Stellen. | 2026-07-28 | Dashboard-Audit S3 |
| C1c | ✅ **ERLEDIGT 2026-08-01** — **die Türklinke sagt nicht mehr, wer handelt.** `tenantDb(event)` hatte bis hierher EINE Angabe (`as: 'member' \| 'operator'`), und die entschied dreierlei auf einmal: welcher Appwrite-Client fragt, ob die Inhalts-Sperre (M13) greift, und ob das Schreiben eine Mitgliedschaft auslöst (A5). Das ging nur so lange gut, wie „Admin-Client" und „Betreiber handelt" dasselbe waren — und das sind sie nicht: viele Routen brauchen den Admin-Client aus rein TECHNISCHEN Gründen (`media_items`, `poll_votes`, `event_rsvps`, `enrollments` tragen bewusst keine User-Schreibrechte; ein Gast hat gar keine Sitzung). Sie meldeten sich damit still von Sperre UND Beitritt ab. **Neu:** `as` = mit welchen Zugangsdaten, `actor: 'member' \| 'guest' \| 'operator'` = wer handelt, Default `actor = as` — alles Bestehende verhält sich unverändert, und wer den Admin-Client braucht, obwohl ein Mensch aus der Community handelt, muss es HINSCHREIBEN. Zwei pure Regeln (`actorFacesContentLock`, `actorJoinsByWriting`) statt zweier `=== 'member'`-Vergleiche im Rumpf. Umgestellt: die vier Medien-Wege (Upload, Metadaten/Veröffentlichen, Löschen, `applyMediaVisibility`) auf `actor: 'member'`; der Gast-Kommentar auf `actor: 'guest'` — INHALT (fällt unter die Sperre), aber kein Beitritt (ein Gast hat kein Konto, dem eine Mitgliedschaft gehören könnte). Genau diese beiden Antworten ließen sich mit einer einzigen Angabe nicht geben. **Dabei gefunden und mitgefixt:** die M13-Zusage nennt „Kommentare, Beiträge, Umfragen, Zu- und Absagen, Kursfortschritt" — von diesen fünf war nur der erste wirklich zu. Umfrage-Stimme, Beitrags-Löschung durch den Autor, Event-Zu-/Absage, Kurs-Einschreibung und Lektions-Abschluss liefen alle über die Operator-Klinke an der Sperre vorbei. **Mitgenommene Befunde:** media hatte als einziger Inhalts-Layer kein Quota-Gate (jetzt `kind: 'media'`, heute No-Op wie courses/events) und kein Rate-Limit (jetzt `media:upload`, 30/min — der einzige Weg, der Binärdaten auf die geteilte Platte legt) und puffert große Uploads nicht mehr blind (Content-Length-Vorprüfung vor `readMultipartFormData`) · `applyMediaVisibility` versuchte die zweite Phase nicht erneut und schwieg beim Scheitern — jetzt ein Retry plus lautes Log (Muster Zwei-Phasen-Hide), denn in BEIDEN Richtungen ist die Datei die offene Seite · `/api/comments/count` ist seit C18 nicht mehr für alle dieselbe Zahl (in einer members-Community sieht ein Mitglied mehr als ein Gast) und cachte sie trotzdem 30 s user-agnostisch und gab sie mit `Access-Control-Allow-Origin: *` an jede fremde Seite: die Route antwortet dort jetzt 404 (F4-Muster) statt den Cache-Schlüssel zu flicken — eine geschlossene Community soll ihre Zahlen gar nicht erst cross-origin veröffentlichen, und danach ist der Cache wieder ehrlich · `guest_authors` war schreib-only ohne Löschpfad: 90-Tage-Frist wie bei den Melder-Adressen, hier fällt die ganze Zeile (sie ist nur ein Rückfragekanal, kein Beleg) · die letzte rohe `.tablesDB`-Stelle in `server/api/**` (Nutzer-Detailseite las `comments` pool-weit) geht durch die Tür, und `packages/admin/server/api/**` steht jetzt im ESLint-Backstop — mit EINER begründeten Ausnahme für die projekt-globalen Betreiber-Tabellen statt zwanzig Einzelzeilen. **Beweise:** neue Unit-Tests für die Trennung (inkl. „Gast löst keinen Beitritt aus" und „Moderation kommt durch die Sperre"), Quelltext-Anker für die fünf Routen, `verify-community-suspension.mjs` um 5 Fälle erweitert → **62/62 grün** (Umfrage-Stimme ist ZU mit `reason: community_suspended`, Moderation SCHREIBT weiter), Pool-Isolation comments 13/13 · events 14/14 · courses 28/28, `count` live: öffentliche Community 200, members-Community 404, `pnpm -r test` (1156) · typecheck · lint · check:manifests · check:single-copy grün. **Gelernt:** Die Türklinke war nie als Aussage über den HANDELNDEN gemeint — sie beschreibt nur, mit welchen Zugangsdaten Appwrite angesprochen wird. Zwei fachliche Regeln daran zu hängen war bequem und genau so lange richtig, wie sich niemand aus technischen Gründen für den Admin-Client entscheiden musste. Wer eine Regel an einen Parameter hängt, muss prüfen, ob dieser Parameter die Frage der Regel überhaupt beantwortet; sonst wird jede spätere technische Notwendigkeit zur stillen Ausnahme von einer fachlichen Zusage. Und: eine Zusage, die eine Aufzählung enthält („Kommentare, Beiträge, Umfragen, Zu- und Absagen, Kursfortschritt"), ist ein Prüfauftrag — vier von fünf Punkten stimmten nicht. | 2026-08-01 | Datentür-Audit |
| C9 | ✅ **ERLEDIGT 2026-07-28** — Ursache war **keine** CI-Eigenheit und **nicht** die localhost-Falle: der Test war schlicht veraltet. Seit **E4** (Gast-Kommentare, 23.07.) steht der Zweig `data-guest-composer` im `v-else-if`-Band VOR `data-embed-login` und verdrängt ihn, sobald `pukalani.comments.embed.guests` an ist — der gesuchte Knopf `[data-embed-login] button` existierte seither nie. Lokal exakt reproduzierbar (also kein Umgebungsunterschied); ältester noch abrufbarer Lauf (26.07.) zeigt dieselbe Signatur. Zwei Änderungen: (1) der Popup-Login-Knopf trägt in BEIDEN Gast-Zweigen den Haken `data-embed-login-cta`, die Spec hängt am Knopf statt am Container; (2) der Test bekommt ein Budget von 150 s — mit den 30 s Standard riss er auf einem kalten Server schon im ersten Warteschritt ab und meldete „Hydration-Zeitüberschreitung" statt des echten Fehlers, was die Diagnose tagelang in die falsche Ecke schickte. Beim Nachmessen kam ein **zweiter**, echter Grund dazu — der Kaltstart des **Dev**-Servers, gegen den die Suite fährt (auch in CI): er kompiliert jede Route beim ersten Zugriff (kalt gemessen `/` gut 25 s, `/embed` samt Client-Bundle über 30 s). Das riss (a) das 30-s-Standardbudget von `realtime` und `embed-write` und (b) die harte 10-s-Kante in `public/embed.js`, die das iframe **endgültig** versteckt (`display:none` + „Comments could not be loaded"), wenn das Widget keine Höhe meldet — gedacht für den CSP-geblockten Einbetter, aber die Höhe kommt erst aus `onMounted`. Danach heilt kein Warten mehr. Deshalb drei Maßnahmen, jede an einer gemessenen Kante: Test-Budget global auf 90 s (embed-write 240 s, es fährt drei Dokumente hoch); beide Embed-Specs rufen `/embed` einmal **im Browser** auf und warten dort bis zur **Hydration**, bevor die Hostseite lädt (ein SSR-Abruf oder ein `goto` bis `load` lässt den Client-Graph unfertig — beides nachgemessen, beides reichte nicht); und die Lebendigkeits-Wartezeiten der Handoff-Kette stehen auf 60 s, weil `/api/auth/login\|embed-handoff\|embed-session` ebenfalls erst beim ersten Aufruf kompilieren. Ohne das war die Suite nur noch dank `retries: 1` grün, also „flaky" statt verlässlich. **Drittens** zeigte sich, dass der lange als „hängt halt 5 Minuten, nicht killen" abgetane Playwright-Teardown-Hang kein harmloses Warten ist: Playwright force-killt jeden Worker nach 300 s und zählt das als Fehler **ausserhalb jedes Tests** — Exit-Code 1 bei komplett grüner Suite. Das trifft **nur lokal** (macOS); in CI läuft dieselbe Suite in ~1,6 min sauber durch, dort taucht die Meldung nie auf. Naheliegende Ursache (die Test-eigenen `node:http`-Hostserver hielten Keep-alive-Sockets, `close()` wartete darauf) ist behoben — `closeAllConnections()` vor `close()`, richtige Hygiene —, **erklärt den Hang aber nicht**: er trifft auch Worker, die nie einen solchen Server hatten. Lokale Ursache bleibt offen (→ E7). Damit ein übersprungener Fall nicht mehr still verschwindet, läuft in CI zusätzlich der `list`-Reporter (der `github`-Reporter meldet nur „9 skipped" als Zahl). **Was der Job künftig fängt / was nicht**: siehe Notiz unter der Tabelle. **Gelernt (der lehrreichste Eintrag der ganzen Liste):** (1) Der E2E-Job war über EINEN TAG rot, ohne dass es jemand merkte — seither gehört `gh run list --branch main` in jeden Durchgang, die lokale Konsole reicht nicht. (2) Ein Test-Haken gehört ans **handelnde Element**, nie an einen Container: ein Config-Gate tauschte den Zweig aus, der Container blieb, der Knopf verschwand. (3) Ein zu knappes Zeitbudget meldet eine Zeitüberschreitung an BELIEBIGER Stelle statt der echten Ursache — das schickte die Diagnose tagelang in die falsche Ecke. (4) `retries: 1` macht aus einem echten Fehler ein „flaky" — grün, aber wertlos. (5) Ein Reporter, der nur „9 skipped" als Zahl meldet, versteckt übersprungene Fälle; deshalb zusätzlich der `list`-Reporter. (6) Ein „hängt halt fünf Minuten"-Verhalten kann ein Exit-Code-1 sein: Playwright force-killt Worker nach 300 s und zählt das als Fehler AUSSERHALB jedes Tests. | 2026-07-28 | CI-Beobachtung 28.07. |
| C10 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Bestätigungs-Vertrag existiert als `packages/core/app/composables/useConfirm.ts` und wird an **10** Stellen benutzt (`await confirm({...})`: Übersicht, System, Speicher, GDPR-Exporte, Changelog, Nutzer ×2, Embed, Kommentare …). Natives `window.confirm()` kommt im ganzen Repo nur noch EINMAL vor — im Docstring von `useConfirm.ts`, der beschreibt, was es ersetzt hat. Auch die Doppelklick-Sperren sind da (`saving`-Guard in `media.vue`, mit „Audit-Befund C10" annotiert). **Gelernt:** Ein Audit-Befund altert. Zwischen Befund und Abarbeitung lag hier die Umsetzung — wer ihn ungeprüft „abgearbeitet" hätte, hätte eine zweite Lösung neben die bestehende gebaut. Jeden Befund vor dem Fixen am Code nachmessen. | 2026-07-30 | Dashboard-Audit, UI-Hebel 2 |
| C11 | ✅ **ERLEDIGT — beim Nachmessen am 2026-07-30 bereits gebaut.** Der Baustein heißt `packages/core/app/components/core/EmptyState.vue` (= `<CoreEmptyState>`) und steht in **22** Dateien. Die Zeile suchte nach `UEmpty` und fand deshalb nichts — die Hausform ist die eigene Komponente, nicht die Nuxt-UI-Variante; CLAUDE.md führt sie inzwischen als Standard („Leerer Zustand über CoreEmptyState"). **Gelernt:** Eine Suche nach dem FREMDEN Namen (`UEmpty`) findet die Hausform nie. Wer prüft, ob ein Muster existiert, muss nach der Sache suchen, nicht nach der Schreibweise, die er erwartet — sonst meldet das Audit eine Lücke, die keine ist. | 2026-07-30 | Dashboard-Audit, UI-Hebel 1 |
| C13 | ✅ **GRÖSSTENTEILS ERLEDIGT 2026-07-28** — jeder Befund erst am Code nachgeprüft, dann gefixt: **S5** „Autor sperren" + Autoren-Link gaten auf `users.manage` (Muster aus dashboard/index.vue; dieselbe Stelle steckte auch in der Schnellmoderation der Übersicht) · **S7** `grantEventTicket` stempelt den Mandanten seines Events, s. D1 · **S8** Appwrite-Fehlertexte bleiben serverseitig (`publicContributorResults()` + strukturierte Logs) · **S10a** Produkt-Gate auf ALLE neun posts-Routen (nicht nur die vier gemeldeten — hide/restore/assist gehören zwingend dazu) · **S10b** Wartungsmodus auf patch/delete **und vote** (der Befund nannte `vote.post` irrtümlich als Referenz; die Prüfung sitzt in `score.post`) · **S10c** Triage-Gate in die Route gezogen. Vier neue Test-Suites, drei davon strukturell (jede Route trägt ihren Gate). **Offen abgespalten:** S6 → C15, S9 (tote Capabilities) → C16. Details + Prüfvermerke: [DASHBOARD-AUDIT-2026-07-28.md](archiv/audits/DASHBOARD-AUDIT-2026-07-28.md). **Gelernt:** Ein Audit-Befund kann die richtige Lücke mit der falschen Fundstelle melden — S10b nannte `vote.post`, die Prüfung sitzt in `score.post`. Und er kann zu klein zählen: gemeldet waren vier posts-Routen, betroffen waren neun. Immer die ganze Route-Familie absuchen, nicht die genannte Liste abarbeiten. Nachhaltig wurde es erst durch **strukturelle** Tests: „jede Route trägt ihr Gate" fängt auch die zehnte, die noch niemand geschrieben hat. | 2026-07-28 | Dashboard-Audit |
| C15 | ✅ **ERLEDIGT 2026-07-29** — die Glocke ist mandantenrichtig. **Migration `system-022`** (`notifications.tenantId` + `idx_recipient_tenant`, ohne Backfill; Prod-Lauf mit C0c bestätigt). Die Spalte trägt DREI Bedeutungen, gebündelt in der einen puren Regel `core/shared/notificationScope.ts`: `<tenantId>` = diese Community, `_account` = Kundenbereich (kollisionsfrei, weil eine Appwrite-Row-Id nie mit `_` beginnt), `''` = unbekannt. `notify()` verlangt jetzt ein **Pflichtfeld `scope: 'tenant' \| 'account'`** — kein Default, damit „mandantenlos" eine Entscheidung ist und kein vergessenes Feld; der TypeScript-Fehler ersetzt hier den ESLint-Backstop, der in `server/utils/**` nicht greift. Alle **acht** Aufrufer gestempelt (nicht sechs, wie hier stand): comments ×3, tickets ×2, events, control-Invites, Stripe-Webhook — die letzten beiden **`'account'`** (Davids Entscheidung 3: Vertrags-Meldungen gehören nicht in eine Kunden-Community). Beide Leserouten + der Realtime-`where` der Glocke filtern über dieselbe Regel. **Bestandszeilen bleiben sichtbar** (Davids Entscheidung 2) — bewusst fail-OPEN, die begründete Ausnahme von der sonst geltenden fail-closed-Regel: sonst leert sich jedem Nutzer im Deploy-Moment die Glocke, und Row-Security hält die Empfänger-Grenze ohnehin. Die Begründung steht an drei Stellen im Code, damit sie niemand „korrigiert". Dazu zwei Rückfälle für das Deploy-Fenster (Code vor Migration): Schreiben ohne Stempel, Lesen ohne Filter — beide **laut** geloggt. Der Digest-Sweep bleibt bewusst mandantenübergreifend (eine Mail pro Tag, nicht eine pro Community) und ist vom Stempel unberührt. Beweise: `packages/core/tests/notificationScope.test.ts` (16 Fälle, Stempel-Vertrag Pool/Silo/mandantenlos) + `packages/core/tests/notification-tenant-isolation.test.ts` (5/5 gegen echte Appwrite: ein Nutzer, zwei Communities, jede Glocke nur ihre eigenen; `_account` nie in einer Community; Bestandszeilen in beiden). **Reste abgespalten:** C17 (Kundenbereich hat keine Glocke), D5 (Mail-Links). **Gelernt:** (1) Ein **Pflichtfeld** ist der bessere Wächter als ein Default, wenn der ESLint-Backstop nicht greift — in `server/utils/**` gibt es keinen, also erzwingt der Typfehler die Entscheidung. Ein geratener Stempel hätte eine Zahlungswarnung in fremde Glocken gelegt. (2) Die sonst geltende fail-closed-Regel war hier FALSCH: ohne Backfill hätte sie jedem Nutzer im Deploy-Moment die Glocke geleert. Solche begründeten Ausnahmen gehören DREIMAL in den Code geschrieben, damit sie niemand „korrigiert". (3) Für das Deploy-Fenster (Code vor Migration) je einen LAUTEN Rückfall einbauen — still weiterlaufen heißt, den Fehler erst beim Kunden zu sehen. | 2026-07-29 | Dashboard-Audit S6 |
| C17 | ✅ **ERLEDIGT 2026-07-29 — die Glocke hängt jetzt dort, wo die Meldungen liegen.** Die Zeile hier hatte den falschen LESER im Verdacht: sie suchte die Anzeige auf `my.pukalani.app` (Platform-App, Pool-Projekt) und schloss daraus auf ein Cross-Projekt-Problem. Am Code nachgeprüft gibt es keines — **Absender, Empfänger und Leser liegen alle drei im `control`-Projekt**: `packages/billing/server/api/stripe/webhook.post.ts:113` (`recipientId: row.userId` aus `billing_subscriptions`, ein Konto DIESES Projekts) und `packages/control/server/utils/inviteRequests.ts:261` (Betreiber mit Label `admin`) laufen beide nur in `apps/control`; `apps/platform` hängt `@pukalani/billing` gar nicht ein und hat deshalb keinen einzigen `account`-Absender. Gefehlt hat nur die ANZEIGE: die Glocke wird ausschließlich aus `pukalani.chrome.utilities` gerendert, und dessen einziger Konsument ist das **blueprint**-Layout — ein Layer, den `apps/control` nicht extended. Fix: neuer Schalter `pukalani.chrome.accountBell` (Core-Default **aus**), gerendert im core-default-Layout (= Kopfzeile von `/workspace` und `/account/billing`) und in der Dashboard-Shell (Sidebar-Reihe neben der Suche — **nicht** als schwebendes Widget oben rechts: dort sitzen die Aktionen der Seiten-Kopfzeilen, das erste Layout verdeckte „Neuer Code"). `apps/control` schaltet ihn an, sonst ändert sich für keine App etwas. Dazu ein zweiter Befund aus demselben Weg: `invite.request` hatte in der Glocke **keinen Lesetext** und fiel auf `'replied'` zurück — die Betreiber-Glocke behauptete „hat auf deinen Kommentar geantwortet"; jetzt `notifications.inviteRequest` (de+en), und der `title` trägt die anfragende Adresse statt eines hartcodierten deutschen Satzes. Beweise: `packages/control/scripts/verify-account-bell.mjs` (**27 bestanden, 0 fehlgeschlagen** — echter Weg vom öffentlichen Anfrage-Formular über das Control Plane bis in die Glocke, Fremder sieht nichts, Gast sieht keine Glocke, plus die Gegenprobe im Pool: Community-Glocke ohne `_account`, Kundenbereich ohne Community-Meldung) + `packages/core/tests/notificationBellTexts.test.ts` (strukturell: jeder gesendete Typ braucht einen eigenen Lesetext in beiden Sprachen — verifiziert rot, wenn der Zweig fehlt). Browser-geprüft (Konsole sauber, nur die bekannte `i18n baseUrl`-Warnung). **KEINE Migration nötig.** Offen geblieben (bewusst): auf `my.pukalani.app` hängt weiter keine Glocke — dort gibt es heute nichts zu zeigen; kommt Pool-Billing (D1), braucht das Onboarding-Layout eine. **Gelernt:** Die Zeile hatte den falschen LESER im Verdacht und leitete daraus ein Cross-Projekt-Problem ab, das es nicht gab. Bei „X wird nicht angezeigt" zuerst Absender, Empfänger und Leser einzeln lokalisieren — hier lagen alle drei im selben Projekt, gefehlt hat nur ein Layout-Schalter. Zweitens: ein neuer `notify()`-Typ ohne eigenen Lesetext fällt still auf `'replied'` zurück, und die Glocke behauptet dann etwas Falsches. Deshalb der strukturelle Test, der jeden gesendeten Typ in beiden Sprachen einfordert. | 2026-07-29 | C15 |
| D5 | ✅ **ERLEDIGT 2026-08-01 — Benachrichtigungs-MAILS verlinken jetzt auf den Host der Community.** Die Glocke war seit C15 mandantenrichtig, die Mail nicht: `absoluteLink()` baute JEDE URL aus einer einzigen Env-Basis (`public.appUrl`). Eine Antwort in Community A verlinkte damit auf den App-Host — ein Pfad, den es dort nicht gibt, auf einer Domain, für die der Empfänger nicht einmal ein Session-Cookie hat (Cookies sind host-gebunden). Betroffen waren BEIDE Zweige, Sofort-Mail und Digest. **Gebaut in drei Teilen.** (1) Die **pure Regel** `packages/core/shared/notificationLinks.ts` (30 Fälle unit-getestet): sie liest genau die drei Spaltenwerte aus `notificationScope.ts` — `<communityId>` ⇒ Host dieser Community, `_account` ⇒ App-Host (per Konstruktion richtig, weil Absender, Empfänger und Leser einer Konto-Meldung im selben Projekt liegen, s. C17), `''` ⇒ App-Host wie bisher (Bestand + Silo). Der Open-Redirect-Guard wandert mit und wird wichtiger als vorher, weil der Pfad jetzt an einen Host aus der DATENBANK geklebt wird. (2) Der **Registry-Vertrag** `registerCommunityHostResolver` (`core/server/utils/communityHost.ts`) nach dem Muster von N9/A5 — core darf das Control Plane nicht kennen (A14), die App verdrahtet die Antwort. Zwei Eigenheiten gegenüber den Nachbarn: **kein `H3Event`** (der Digest-Sweep läuft im Intervall-Plugin, ganz ohne Request — genau das war der Parkgrund) und **gebündelt** (viele Ids rein, EINE Karte raus). Implementierung `packages/control/server/utils/communityHostResolver.ts`, Cache 60 s positiv WIE negativ, fail-soft; registriert in `apps/platform/server/plugins/tenant-resolver.ts` neben den drei bestehenden Resolvern. (3) Die **Verdrahtung**: `notify()` reicht den bereits berechneten Ablage-Wert an den Instant-Zweig weiter (nie zweimal rechnen), der Sweep löst die Hosts EINMAL vor der Empfänger-Schleife auf und gibt die fertige Karte in jede Mail — **jeder EINTRAG** wählt daraus seine Basis, nicht die Mail eine gemeinsame. Das ist der eigentliche Härtefall und kein Sonderfall: der Sweep bündelt bewusst mandantenübergreifend (eine Sammel-Mail pro Tag, nicht eine je Community), also stehen Links aus zwei Communities und dem Kundenbereich regelmäßig nebeneinander. **Beweise:** 30 Unit-Tests der puren Regel · 4 Live-Tests des Resolvers gegen eine echte Appwrite (`packages/control/tests/communityHostResolver.test.ts`) · **Ende-zu-Ende mit Mailpit** (`packages/core/scripts/verify-notification-mail-links.mjs`, **11/11**): eine echte Antwort über `POST /api/comments` auf `kunde-a.localhost` erzeugte eine Sofort-Mail mit `http://kunde-a.localhost/de/threads/…`, und EINE Digest-Mail trug gleichzeitig `http://kunde-a.localhost/…`, `http://kunde-b.localhost/…` und `http://app.localhost:3006/dashboard/billing` — drei Hosts in einer Mail. Der Sweep bleibt unverändert mandantenübergreifend. **Gelernt (drei Stück):** (1) **Der Wert in `notifications.communityId` ist `communities.tenantId`, nicht `communities.$id`** — E8-3 hat die SPALTE umbenannt, den WERT nicht (`scopeRowFor` stempelt weiter `tenant.tenantId`). Ein Nachschlagen über `$id` wäre STILL gescheitert, weil der ganze Vertrag fail-soft ist: die Mail geht raus, mit dem alten falschen Link, ohne eine Zeile im Log. Deshalb ist genau dieser Härtefall als eigener Live-Test festgenagelt und nicht als Fixture. (2) **Ein fail-soft-Vertrag braucht einen Test, der das FEHLSCHLAGEN vom RICHTIGEN Ergebnis unterscheidet** — sonst ist er immer grün. Der Mailpit-Beweis enthält deshalb zwei Gegenproben: „der Community-Link ist NICHT die App-Basis" und „drei verschiedene Hosts in einer Mail". (3) **Der Parkgrund war nur zur Hälfte der Cross-Projekt-Zugriff** — die andere Hälfte war die Form: ein Vertrag mit `H3Event` hätte für den Digest-Sweep nie funktioniert, und ein Einzel-Lookup wäre im Sweep die N+1-Falle über Projektgrenzen gewesen. Die Frage „wer ruft das auf?" entschied die Signatur, nicht die Technik. | 2026-08-01 | C15 |
| D6 | ✅ **ERLEDIGT 2026-08-01 — ein Farbwechsel der Community erreicht offene Fenster jetzt ohne Reload.** Eigene Themes, Schriften und Instanz-Einstellungen morphten seit jeher live; die Farbe der COMMUNITY war die Ausnahme, weil ihre Wahrheit (`communities.theme/variant/neutral`) im **Control-Plane-Projekt** liegt — dort hat der Browser weder Session noch Leserecht, kann also weder fragen noch abonnieren. Gebaut ist der dokumentierte Weg: ein **SPIEGEL im Runtime-Projekt**. Neue Mini-Tabelle `community_branding` (**Migration system-028**, `read(any)` wie `app_config`/`custom_themes`, rowSecurity aus, **eine Row je Community, rowId = `communities.$id`**, drei Varchar-Spalten, **kein Index** — die Zeile wird nur über ihre rowId angefasst). Geschrieben wird sie **nach** dem bestätigten Control-Plane-Schreibvorgang, aus der ANTWORT und **fail-soft**, von `core/server/utils/communityBrandingMirror.ts` (Aufrufer: `PATCH /api/community/branding`). Gelesen wird sie **nur per Realtime**: `core/app/plugins/realtime-branding.client.ts` abonniert **genau die eigene Row** (`Channel…row(<communityId>)` via `useSiteId()`, dazu `mirrorBelongsToCommunity` als Netz) und schreibt das Ergebnis in `useTenantBranding()` — ab da rechnet die bestehende B5-Vorrangregel (`resolveThemeSelection`/`resolveNeutralSelection`) und der Head-Getter zieht `data-theme/-variant/-neutral` **und die Theme-CSS-Datei** nach. Ohne Community-Id (Kontroll-Host, Silo, Playground) abonniert das Plugin **gar nichts**. **Warum keine neue Spalte in `app_config`:** die Tabelle ist per Vertrag EINE Row pro PROJEKT (`global`) — im Pool teilen sich alle Communities sie, und genau diese Verwechslung hatte O5 schon einmal aufgelöst. **Der Spiegel ist Bequemlichkeit, nicht Wahrheit:** SSR fragt weiter den Resolver, ein fehlgeschlagenes Spiegeln heilt der nächste Seitenaufbau (≤30 s). Bewusst NICHT mitgemorpht: Tab-Farbe/Favicon/og:image (sie hängen an `themeSettings.defaultThemeId`; ein Nachziehen würde die Instanz-Voreinstellung überschreiben und wäre beim Zurücksetzen auf `''` nicht mehr rückrechenbar) — gecachte Artefakte, die beim nächsten Aufbau folgen. **Beweise:** Browser gegen echte Appwrite — zwei Fenster derselben Community morphen live (`lagoon → sunset → forest`, jeweils Attribute + `/themes/<id>.css` getauscht, `performance.getEntriesByType('navigation').length` bleibt **1**, also kein Reload), eine Änderung an der Spiegel-Row einer **fremden** Community löst **nichts** aus, und der Kontroll-Host trägt keine Site-Id im Payload (Plugin no-op) · `verify-site-branding.mjs` weiter **42/42** · neue Unit-Tests `packages/core/tests/communityBranding.test.ts` + zwei D6-Fälle in `packages/themes/tests/themeSelection.test.ts` · Migration lokal zweimal gefahren (idempotent). **Gelernt (drei Stück):** (1) **`tablesDB.upsertRow` publiziert KEIN Realtime-Event** (Appwrite 1.9.6, live erwischt): die Spiegel-Row stand korrekt in der Datenbank und kein Browser erfuhr davon — der Spiegel wäre eine teure Attrappe gewesen, die in jedem Unit-Test und jedem Log grün aussieht. `updateRow`, bei 404 `createRow`. Wer je auf „ein Aufruf statt zwei" vereinfacht, nimmt dem Feature die Wirkung. (2) **Ein Live-Beweis braucht eine echte WS-Verbindung** — die lokale Appwrite hat nur `localhost` als Web-Platform registriert, jeder Mandanten-Host (`kunde-a.localhost`, `my.localhost`) wird beim WS-Handshake mit „Invalid Origin" abgewiesen und der Client loggt nur „Realtime disconnected". Das sieht wie ein Fehler im neuen Code aus und ist eine Lücke der Testumgebung; der Beweis lief deshalb über eine temporäre Community auf dem Host `localhost`. (3) **Ein Spiegel darf nie zur zweiten Wahrheit werden** — deshalb wird er nirgends gelesen, um zu rendern, und deshalb ist sein Schreiben fail-soft. Drift kann so gar nicht sichtbar werden. | 2026-08-01 | B5 |

**Was der E2E-Job (C9) beweist — und was nicht.** Er fährt eine echte
Wegwerf-Appwrite hoch und deckt danach 15 Fälle ab: öffentliche Seiten,
i18n-Routing und SSR-Render (smoke), den Auth-Guard, das Embed-Widget auf einer
echten Fremd-Origin samt `frame-ancestors`-Split und `noindex`, den kompletten
Popup-Handoff-Login mit anschließendem Schreiben (embed-write) und — das ist der
teuerste Fall — die **Realtime-Zustellung** gegen die echte Instanz: ein
serverseitig angelegter Kommentar muss live im Browser ankommen und beim Löschen
wieder verschwinden. Das ist der Regressionsschutz für die
SDK-Socket-Konsolidierung. **Nicht** abgedeckt: die 9 visuellen
Theme-Baselines (plattformspezifisch `-darwin`, laufen nur lokal — sie stehen
seit jeher als `skipped` im Log und heißen jetzt beim Namen), und das
CHIPS-Partitionierungs-Verhalten selbst: `localhost:PORT` gegen
`localhost:PORT` ist same-**site**, echtes Cross-Site-Gastverhalten braucht
echte Domains und bleibt ein Prod-Beweis
([EMBED.md](referenz/EMBED.md)).

---

## E — erledigte Betriebs-/Hygiene-Punkte

| # | Task | Erledigt |
| --- | --- | --- |
| E4 (Teil) | **Cutover-Krümel** ([CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md)): ploi-Alias `studio.` ✅ **entfernt 2026-07-30** (ploi → Domain aliases; `studio.pukalani.app` antwortet jetzt 404 über die Wildcard-Site `platform`, alle übrigen Hosts unverändert, verify-tls grün). Das „Doppel-Zertifikat" ist **kein Aufräum-Punkt**: control hat eine eigene Lineage, die den Alt-SAN `studio` bis zur nächsten automatischen Erneuerung mitführt — eine Anforderung nur zum Entfernen eines überzähligen Namens wäre reines Risiko ohne Nutzen. **Rest offen (Read-only-Key im Projekt `control`) steht in OPEN-ITEMS.md.** **Gelernt:** Beim Aufräumen des Cutovers starb einmal die portfolio-App, weil `pm2 jlist` auf ein cwd unter dem ALTEN Hostnamen zu prüfen war (`ops/pm2-heal.sh`). Eine Umbenennung zieht Meldungen mit, PFADE aber nicht — nach jedem Rename die Prozess-/Skript-Pfade einzeln nachsehen. Und: ein überzähliger Zertifikatsname ist KEIN Aufräumgrund; eine Neuanforderung nur zum Entfernen wäre Risiko ohne Nutzen. | 2026-07-30 |
| E6 | ✅ **ERLEDIGT 2026-07-30** — 47 Worktrees + 47 Zweige `worktree-agent-*` entfernt (alle in `main`, ohne `--force` gelöscht, keiner hatte ungesicherte Änderungen). **Stehen geblieben und zwar bewusst:** `worktree-agent-a762b1bc42bba74d7` = der geparkte **Seiten-Editor** (1 Commit, 108 Zeilen, Feature-Stopp) und VIER Worktrees anderer Claude-Sitzungen (`claude/epic-diffie`, `claude/pukalani-landingpage-optimization`, `claude/sleepy-leavitt`, `claude/upbeat-curran`) — deren Arbeit liegt zwar in `main`, aber sie gehören mir nicht und mindestens eine ist aktiv. **Gelernt:** Vor dem Löschen IMMER prüfen, ob ein Worktree einer fremden, laufenden Sitzung gehört — `--force` wäre hier fremder Arbeitsverlust gewesen. Ohne `--force` löschen ist der eingebaute Schutz: Zweige mit ungesicherten Änderungen verweigern sich von selbst. | 2026-07-30 |
| E8 (Etappen 1+2) | **Umbenennung auf `community`** — Davids Entscheidung (2026-07-29/30). Plan: [UMBENENNUNG-AUF-COMMUNITY.md](archiv/UMBENENNUNG-AUF-COMMUNITY.md). **Etappe 1 LIVE:** `sites` → `websites` (control-022). **Etappe 2 LIVE (2026-07-30):** `site_members`/`site_invites` → `community_members`/`community_invites` + Spalte **`siteId` → `communityId`** in beiden UND in `invite_requests` (control-023); der Name `communityId` gilt jetzt überall, wo eine `tenants.$id` transportiert wird (TenantContext, Resolver-Verträge, Service-Naht). Beweise nachgefahren: **97/97** Site-Autorisierung · **23/23** Presence-Grenze · **17/17** + **19/19** Einladungen. Beim Ausrollen bewusst KEINE Kompatibilitäts-Brücke: das Deploy-Fenster (control vor platform, dieselbe Schleife, unter einer Minute) lässt die Naht kurz mit 400 antworten — bei leeren Tabellen und ohne Kunden verhältnismäßig, eine Brücke wäre ein neuer Halbzustand gewesen. **Das Aufräumen der Alt-Tabellen ist mit E11 miterledigt.** Etappen 3+4 sind am 2026-07-31 nachgezogen — eigene Einträge weiter unten (E8-3, E8-4); in OPEN-ITEMS.md steht davon nichts mehr offen. **Gelernt:** Eine Kompatibilitäts-Brücke ist nicht automatisch die vorsichtigere Wahl — sie wäre hier ein neuer HALBZUSTAND gewesen, den später wieder jemand hätte abbauen müssen. Bei leeren Tabellen und ohne Kunden ist ein Deploy-Fenster von unter einer Minute mit kurzen 400ern die ehrlichere Lösung. Die Entscheidung hängt an der Frage „wer sieht den Zwischenzustand?", nicht an der Technik. | Etappe 1+2: 2026-07-30 |
| E11 | **Vokabular aufräumen — ein Wort je Sache** ([VOKABULAR-AUFRAEUMEN.md](archiv/VOKABULAR-AUFRAEUMEN.md)) — Davids Auftrag 2026-07-30. **`feature` → `product` ist DURCH (Etappen A+B, 2026-07-30):** Migrationen control-024 + system-023 + courses-003 auf allen vier Instanzen (lokal+Prod), 964 regelbasierte Ersetzungen in 226 Dateien + 43 git mv, Typecheck 10/10 + alle Tests + Gates grün. **Das ZUSAMMENZIEHEN ist DURCH (2026-07-30, Davids Go — Beobachtungsnacht erlassen):** control-025/026 + system-024 + courses-004 auf lokal + Prod, alle Übergangs-Spiegel/Aliasse entfernt; auch das E8-Aufräumen (Alt-Tabellen) ist damit erledigt. „Customize theme" ersetzt das Theme-Studio (Davids Entscheidung). NEU: Betreiber-Seite „Gesperrte Namen" (control-027) und A6 Schritte 0–2 (control-028, Community-Fulfillment). Ursprünglicher Kern war: **`feature` → `product`**, also `feature.manifest.ts` → `product.manifest.ts` (**18 Dateien**), `featureKey` (56), `featureGates` (18), `check:manifests` (13) — insgesamt **2.626 Zeilen in 413 Dateien**. **Bewusste Kehrtwende:** CLAUDE.md hält bis heute fest „im CODE bleibt das Vokabular `features`" (P4); das gilt damit nicht mehr. Zwei Stellen mit echtem Risiko waren: die Appwrite-Tabelle **`feature_catalog`** (kein Rename möglich ⇒ Muster control-022/023, Zeilen MIT `rowId: row.$id`, und die Row-Id ist hier der Feature-Key, der in `entitlements.featureKey` steckt) und die **öffentliche Route `/api/platform/features`**. Die Altlast **`pukalani.studio.*`** ist ebenfalls DURCH (2026-07-30: → `pukalani.control.*` samt Log-Präfixen, controlUserData, Prosa; RESERVED `studio` + Theme-Studio bleiben bewusst); übrig drei bewusste `reddit`-Kommentarreste. **Einzige offene Frage war `maui` vs. `pukalani`** — inzwischen entschieden und als eigener Punkt (E11b) in OPEN-ITEMS.md geführt. Reihenfolge zwingend seriell (alle fassen dieselben Dateien an): A6 → E8-3 → E8-4 → feature/product ✅ → pukalani.studio ✅ → E9/E10. **Gelernt (fünf Fallen, alle beim Bauen aufgetaucht):** (1) **`app_config` stand am utf8mb4-Zeilenbudget** — die neue Spalte `products` passte nicht mehr als `varchar(4000)` und musste als **MEDIUMTEXT** angelegt werden (off-row, kostet kein Zeilenbudget). Bei breiten Konfig-Tabellen vor jeder neuen Spalte das Budget rechnen. (2) **Die DRITTE Migrations-Lücke (`courses.entitlementFeature`) fiel erst beim Bauen auf**, nachdem schon zwei gefunden waren: dieselbe Vokabel liegt in MEHREREN Projekten. Regel: vor jedem Vokabular-Rename ALLE `scripts/migrations/**` nach dem Wort greppen — sowohl als `key:` (Spaltenname) wie als `tableId` — und die Trefferliste abhaken, statt sich auf das Gedächtnis zu verlassen. (3) **Die Changelog-Kategorie `'feature'` ist ein DATEN-WERT** („Neuerung") und kein Vokabel-Vorkommen — sie darf nie mitbenannt werden. Ein regelbasiertes Ersetzen muss Daten von Bezeichnern trennen; dasselbe gilt für **Locale-WERTE**: das Skript benennt Schlüssel um, niemals die Sprache dahinter. (4) **`entitlements.featureKey` war `required` + Unique-Index** — ohne Dual-Write wäre JEDER Insert im Umstellungsfenster gescheitert. Pflichtspalten mit Unique-Index brauchen immer die Doppelschreibphase. (5) Die Row-Id von `feature_catalog` IST der Feature-Key und steckt in `entitlements.featureKey` — beim Kopieren also `rowId: row.$id` mitführen, sonst zerreißt die Referenz. | 2026-07-30 |
| F9 | **`channel: 'chrome'` in den letzten zwei Test-Configs nachgezogen** — ✅ **ERLEDIGT 2026-08-01.** `apps/portfolio/playwright.config.ts` und `apps/control/playwright.config.ts` fahren jetzt wie `apps/comments` Playwrights **gebündeltes Chromium** (kein `channel`), samt Kopfkommentar mit dem E7-Grund (System-Chrome startet auf macOS GoogleUpdater/crashpad, die das stdout-Socketpair des Workers erben, zu launchd reparenten und nie schließen ⇒ 300-s-Force-Kill, Exit 1 trotz grüner Suite). **CI-Install-Schritt bewusst NICHT nötig und deshalb auch nicht gebaut:** ein Durchgang durch alle sieben Workflows zeigt, dass Playwright **ausschließlich** in `e2e.yml` und dort **nur für `comments`** läuft — portfolio und control haben gar keinen E2E-Job, ihre Suiten sind lokale Smoke-Netze. Das steht jetzt so in beiden Kopfkommentaren, damit niemand den Schritt „sicherheitshalber" nachrüstet. Beweis: `portfolio` **5/5 grün in 11,9 s**, `control` **10/10 grün in 14,3 s**, beide Exit 0 und ohne Teardown-Hang. Die zwei Einmal-Skripte (og-images, brand-card-font) bleiben wie geplant auf System-Chrome. **Gelernt:** Bevor man einen CI-Schritt „analog zum Vorbild" nachzieht, erst nachsehen, ob die Suite in CI überhaupt läuft — hier wären zwei Install-Schritte für Jobs entstanden, die es nicht gibt. Die Begründung gehört in den Kopfkommentar der Config, sonst wird sie beim nächsten Durchgang erneut erwogen. | 2026-08-01 |
| F10 | **`embed-write.spec.ts` — die Diagnose war falsch, die Ursache eine ganz andere** — ✅ **ERLEDIGT 2026-08-01.** In der Aufgabenliste stand „fällt unter **Parallel-Last** durch, der 60-s-Popup-Puffer reißt", mit den Kandidaten „Budget hoch" oder „Worker-Exklusivität". **Beide wären am Problem vorbeigegangen, beide durch Messung ausgeschlossen:** ein höheres Budget hilft nicht (im Voll-Lauf hatte der Fall die letzten 34 s praktisch allein und fiel trotzdem), und Worker-Exklusivität hilft nicht (**kalt und ALLEIN** fällt er genauso, 90 s) — Playwright böte sie über ein eigenes Projekt mit `dependencies` an (per-Projekt-`workers` gibt es seit 1.61 auch, isoliert aber NICHT gegen andere Projekte), nur nützt sie hier nichts. Die echte Ursache steckte im **Popup**: `__vue_app__` entsteht beim `createApp`, die Seite darunter hängt an einem `<Suspense>` und wird **erst rund 100 ms später** hydratisiert. In diesem Spalt sieht das SSR-Markup interaktiv aus, ohne dass Vue lauscht — `fill()` landet nur im DOM, die reaktive Kopie des Formulars bleibt leer, und beim Absenden meldet **Zod „Please enter a valid email address"**. `/api/auth/login` wurde nie gerufen, das Popup blieb offen, das iframe stand für immer auf `status='waiting'` (CTA disabled) — und der Fall starb 60 s später an einer Wartezeile, die mit der Ursache nichts zu tun hatte. Nachgewiesen mit einer Wegwerf-Spec, die Konsole, `pageerror` und alle `/api/`-Antworten des Popups mitschnitt und die Kandidaten-Signale im 100-ms-Takt abtastete: bei `__vue_app__` war `isMounted:true`, aber `formVnode:false`; 100 ms später `formVnode:true`, danach `login 200` → Popup geschlossen → Composer da. **Fix:** ein `subtreeHydrated(selector)`-Prädikat neben dem bestehenden `hydrated` — es prüft `__vnode` am Element, also ob Vue **diesen Teilbaum** übernommen hat — und zwei Wartezeilen davor (`[data-login-form]` im Popup, `[data-comment-section]` im iframe). Kein `retries`-Kaschieren, keine verstellte Uhr, die 60-s-Puffer bleiben unverändert stehen. Beweis: der zuvor dreimal reißende Fall (kalt+allein) läuft **10,5 s statt 90 s Fehlschlag**; volle Suite **3× hintereinander grün, Exit 0, kein Teardown-Kill** — Lauf 1 **kalt 54 s** (24/24, embed-write 25,6 s), Lauf 2 **15 s**, Lauf 3 **15 s**. Zum Vergleich vorher: kalte Volllauf-Suite 103 s **mit** Fehlschlag. **Gelernt (drei Stück):** (1) **Eine Fehlerbeschreibung in der Aufgabenliste ist eine Hypothese, kein Befund.** „Unter Parallel-Last" stimmte als Beobachtung und war als Ursache trotzdem falsch — der erste Lauf war zufällig warm und gewann das 100-ms-Rennen, alle späteren nicht. Die Gegenprobe „kalt UND allein" kostete drei Minuten und drehte die ganze Richtung. (2) **`__vue_app__` ist kein Beweis, dass ein Formular bedienbar ist.** Unter `<Suspense>` lebt die App, bevor die Seite hydratisiert ist; wer in diesem Spalt tippt, füllt nur den DOM. Wartezeilen gehören an den Teilbaum, mit dem der Test tatsächlich umgeht — dieselbe Lektion wie C9 („Haken ans handelnde Element"), nur eine Ebene tiefer. (3) **Ein stiller Validierungsfehler tarnt sich als Zeitüberschreitung.** Sichtbar wurde er erst, als der Zwischenzustand mitgeschrieben wurde (Popup-URL, `window.opener`, Fehlertext, Composer-Zahl im 2-s-Takt). Bei „wartet und wird nie fertig" zuerst den Zustand protokollieren, statt an der Wartezeit zu drehen — und **zwei falsche Fährten unterwegs** (Appwrite-Rate-Limit, Vite-Optimizer-Reload) waren beide in unter fünf Minuten widerlegt, weil sie messbar formuliert waren. | 2026-08-01 |
| F13 | **Keine Preise mehr für Unverkäufliches** — ✅ **ERLEDIGT 2026-08-01.** Das Events-Dashboard bot im Pool „Bezahlt" samt Preis und `priceLookupKey` an, obwohl der Kauf-CTA dort „Bald verfügbar" zeigt (D1/F7). Jetzt entscheidet **dieselbe Wahrheit wie der CTA** — `pukalani.events.ticketCheckoutPath`, kein neues Flag —, ob die Zeile „Zugang" überhaupt erscheint: gesetzt im Silo (`apps/comments`), leer im Layer-Default und damit im Pool. Pure Regel `paidAccessChoosable()` in `packages/events/shared/types/event.ts`, 7 Tests plus 3, die die **Herkunft** der Wahrheit festnageln (Layer-Default leer · comments gesetzt · platform setzt sie nicht — sonst wäre die Sperre lautlos wirkungslos). **Zwei bewusste Kanten:** (1) Ein **bestehendes Paid-Event** bringt die Option beim Bearbeiten zurück — eine Sperre darf Bestandsdaten nicht umschreiben, sonst stünde die Auswahl auf einem Wert, den sie nicht kennt, und das nächste Speichern setzte den Zugang still auf „Kostenlos". (2) Die Entscheidung wird **beim Öffnen des Dialogs eingefroren**, nicht laufend berechnet: sonst verschwände die Option mitten im Ausfüllen, sobald jemand versuchsweise auf „Kostenlos" stellt — und der Rückweg wäre weg. Wo nur „Kostenlos" übrig bliebe, fällt die ganze Zeile weg statt als Ein-Punkt-Auswahl stehen zu bleiben. **Kurse hatten dieselbe Sackgasse und sind mitgemacht** — dort sogar schlimmer: ein bezahlter Kurs im Pool ist fail-closed 403 und der Upgrade-Hinweis zeigt auf ein `/pricing`, das es im Pool gar nicht gibt. Die Wahrheit hat dort aber eine **andere Form**: sie ist keine Config, sondern die Frage, ob eine App `registerCourseAccessGuard` gerufen hat. Deshalb **keine gespiegelte Config**, sondern die echte Wahrheit durchgereicht: `isCourseAccessConfigured()` → `paidAvailable` in `/api/courses/manage` → das Formular blendet 'paid' aus ('members' bleibt). Beweise: `pnpm -r test` grün (events 47, courses 20 — je 3 neue Fälle), Typecheck 10/10, Lint 0 Fehler. | 2026-08-01 |
| F18 | **Gast-Kontaktdaten: die Erhebung ist gefallen, nicht die Lese-Stelle nachgereicht** — ✅ **ERLEDIGT 2026-08-02, Davids Entscheidung.** Die Ausgangslage war ein Patt: `guest_authors` nahm seit E4 Name, **E-Mail und IP-Hash** jedes Gast-Kommentars auf, seit dem 2026-08-01 mit 90-Tage-Frist — aber die Moderation kam nirgends heran. **Erste Handlung war deshalb, die Prämisse zu prüfen statt zu bauen:** eine Volltextsuche über das ganze Repo fand für die Tabelle **genau drei** Berührungspunkte — den Schreibvorgang in `guest.post.ts`, die Konstante `GUEST_AUTHORS_TABLE` und `guestAuthorPrune.ts`, der die Zeilen **löscht**. Keine Moderations-Ansicht, keine Admin-Route, kein GDPR-Export, kein Skript, kein Sweep, der sie *liest*. Die Prämisse stimmte also, und damit war die Frage entschieden: personenbezogene Daten, die nie jemand ansieht, sind unter DSGVO nicht die milde, sondern die **schlechteste** Variante — man trägt das volle Risiko für null Nutzen. **Der Zweck war erkennbar, aber nur zur Hälfte gebaut:** `docs/referenz/EMBED.md` versprach die Tabelle „für Moderation + DSGVO", gedacht als Rückfragekanal zu einem Gast. Erhebung fertig, Gegenstelle nie angefangen — und ein Auskunftspfad wäre auch nicht trivial gewesen, weil `guest_authors` keinen Index auf `email` hat und „gleiche Adresse = gleicher Mensch" eine Annahme bleibt, keine Tatsache. **Entfernt:** `guestEmail` aus dem Zod-Schema, dem Formular (samt Zweispalten-Raster, das jetzt eine halbe Zeile Leere gestempelt hätte), dem Store-Aufruf und drei i18n-Schlüsseln je Sprache; der komplette `guest_authors`-Schreibvorgang aus der Route samt `createHash`/`trustedClientIp` — der IP-Hash existierte ausschließlich für diese Zeile. Der **Anzeigename bleibt**: er steht ohnehin öffentlich auf der Kommentar-Row und ist keine Kontaktspur. **Bewusst NICHT `.strict()`** im Schema: Widgets liegen im Browser-Cache fremder Einbetter, und ein alter Client, der `guestEmail` weiter mitschickt, bekommt weiter 201 — Zod strippt das Feld, statt jeden noch nicht neu geladenen Einbetter bis zum Cache-Ablauf vom Kommentieren auszusperren. **Tabelle bleibt vorerst stehen** (Davids Neigung, bestätigt): ein Drop ist unumkehrbar und gehört in eine eigene Zeile; der Bestand war beim Umbau **1 Zeile lokal, 0 auf prod-pool, 0 auf prod-comments**, also erledigt die 90-Tage-Frist ihn ohne Lösch-Migration. `guestAuthorPrune.ts` ist damit vom Dauerbetrieb zum **Abräum-Sweep** geworden, und das steht jetzt an ihm dran. Ein **Rückfragekanal** ist damit bewusst weg — wer ihn will, baut ihn als Ganzes (Zweck, Lese-Stelle, Frist, Auskunftspfad), nicht wieder nur die Erhebung. **Rechtstexte blieben unangetastet und mussten es auch:** die Vorlage in `packages/pages/shared/legalTemplates.ts` nennt Konto, Inhalte, Server-Protokolle und Sitzungs-Cookie — Gast-Kontaktdaten kamen dort nie vor, es gab also weder etwas zu streichen noch (nach F18) etwas zu ergänzen. Korrigiert wurde die **Kunden-Hilfe** (`apps/help/.../embed-widget.md`), die Kunden noch zusagte, Name/E-Mail/IP-Hash lägen „für Moderation und Auskunftsersuchen" bereit — eine Aussage, die nach dem Umbau schlicht falsch gewesen wäre. **Beweise:** Live gegen den comments-Dev-Server **6/6** (Gast ohne E-Mail → 201 mit `authorKind: 'guest'`; alter Client MIT `guestEmail` → weiter 201, Adresse weder auf der Row noch in der DB; `guest_authors` vorher 1, nachher 1 — es entsteht keine Zeile mehr), neue Unit-Tests für Schema/Strip/Route-Quelltext, `verify-community-suspension` **117/117**, comments-Pool-Isolation **13/13**, `pnpm -r test` · typecheck · lint (0 Fehler) · `check:manifests` grün. **Gelernt:** (1) Bei „die Daten sind unlesbar" ist die erste Arbeit die **Gegenprobe an der Prämisse**, nicht der Entwurf einer Lösung — hätte sich EINE Lese-Stelle gefunden, wäre die ganze Entscheidungsgrundlage falsch gewesen. (2) Eine Frist ist die richtige Antwort auf Daten, die man **braucht**, und nur ein Pflaster auf Daten, die man nie benutzt; wir hatten tags zuvor das Pflaster geklebt und einen Tag später gemerkt, dass die Wunde keine war. (3) Ein halb gebautes Feature verrät sich an genau dieser Asymmetrie — **Erhebung fertig, Auswertung nie angefangen**; wer die Erhebung schreibt, ohne die Lese-Stelle im selben Zug zu bauen, produziert im besten Fall Datenmüll und im schlechteren eine Haftung. (4) Beim Entfernen eines Feldes aus einem **eingebetteten** Widget entscheidet der Browser-Cache fremder Seiten mit: `.strict()` wäre hier ein stiller Ausfall für jeden Einbetter gewesen, der noch die alte Datei ausliefert. | 2026-08-02 | Audit-Befund 2026-08-01 |
| F17 | **Rest-Schreibwege auf „wer handelt" durchgesehen — vollständig, nicht stichprobenhaft** — ✅ **ERLEDIGT 2026-08-01.** Inventar über ALLE Layer statt der drei genannten: **84 Aufrufstellen der Operator-Klinke in 73 Dateien** (100 Textstellen inkl. Kommentaren und Tests). Aufgeteilt: **41 reine Lese-Wege** (für Sperre und Beitritt bedeutungslos), **10 trugen schon einen `actor`** (C1c) und **33 Schreibwege** waren zu entscheiden — zwei davon (Meldung abgeben/zurückziehen) schon mit Begründung versehen. Ergebnis: **14 umgestellt** (Kurs anlegen/bearbeiten/veröffentlichen, Lektion anlegen/bearbeiten/löschen/umsortieren, Termin anlegen/bearbeiten/absagen, Serie beenden, Titelbild setzen/entfernen, Seite speichern/löschen), **17 bleiben Betreiber-Sache — jetzt mit einem Satz Begründung an der Stelle**, damit die nächste Durchsicht nicht wieder rät. **Die eigentliche Erkenntnis war nicht „welche Routen", sondern WOHER die Antwort kommt:** ein hartkodiertes `actor: 'member'` (das Muster aus C1c) wäre an genau diesen Routen falsch gewesen, weil sie alle über `requireCommunityPermission` laufen — und der lässt neben der Community-Rolle auch das **protokollierte Betreiber-Break-Glass** durch. Mit festem 'member' hätte ein Support-Eingriff den Betreiber als `viewer` in die Mitgliederliste seines Kunden geschrieben (A5) und ihn in einer gesperrten Community von den Inhalten seines eigenen Kunden ausgesperrt (M13). Der Gate weiß die Antwort bereits, also **liefert er sie jetzt mit**: `requireCommunityPermission` gibt `via` + `actor` zurück, die Regel ist pur und getestet (`actorForCommunityAccess` in `core/shared/communityAccess.ts`: Rolle ⇒ 'member', Break-Glass/Silo ⇒ 'operator'), die Routen schreiben nur noch `tenantDb(event, { as: 'operator', actor })`. **Die drei Kategorien, die operator bleiben** (je mit Begründung im Code): **Moderation** (Kommentar-Status, Post hide/restore, Auto-Hide, Feed-Eintrag löschen) — die Sperre lässt sie ausdrücklich durch; **Sweeps** (publishDuePosts, Serien-Expansion, Reminder) — sie laufen im GET eines beliebigen Lesers, oft eines Gastes, und schreiben auf fremden Zeilen: ein `actor` machte dort jeden Vorbeisurfer zum Mitglied; **Ableitungen und Einstellungen** (Vote-Recount, lessonCount, recordActivity, Publikums-Umzug, embed-sites hinter `system.manage`) — die Handlung ist eine Zeile vorher schon durch Sperre und Beitritt gegangen, bzw. es ist eine Owner-Einstellung, die Davids Grenze ausdrücklich offen lässt. **Ein strittiger Fall, entschieden und im Code begründet:** ein Termin **absagen** ist technisch ein Status-Write auf Inhalt, schützt aber die Zusagenden, die mit der offenen Rechnung nichts zu tun haben. Entschieden für die Sperre (eine Absage ist eine neue Aussage an alle Teilnehmer, keine Rücknahme; eine Ausnahme „löschen ja, anlegen nein" schreibt sich fort; die Mahnung ist in Minuten aufgehoben und das Break-Glass kommt weiter durch) — Umkehr wäre EINE Zeile, die Begründung steht in `events/[id].delete.ts`. **Beweise:** `verify-community-suspension.mjs` um 24 Fälle erweitert → **86/86 grün** (Termin/Kurs/Lektion/Seite je ZU mit `reason: community_suspended`, plus die Gegenprobe „Publikum umstellen bleibt offen"), Ausgangslage vorher 201/200 — sonst wäre ein 403 nicht vom Produkt-Gate zu unterscheiden; Pool-Isolation courses 28/28 · events 14/14 · comments+pages 13/13 · posts 7/7 (Abschnitt „Operator-Break-Glass" fährt den neuen Pfad mit), `verify-site-authz` 103/103, `verify-presence-boundary` 23/23; neue Unit-Tests für die pure Regel und den Gate-Rückgabewert plus Quelltext-Anker je Layer (`redaction-actor.test.ts` in courses/events/pages), `pnpm -r test` **1248** · typecheck · lint (6 bekannte Warnungen) · check:manifests · check:single-copy grün. **Gelernt:** Wenn eine fachliche Frage („handelt hier ein Mensch dieser Community?") an einer Route beantwortet werden muss, die einen **Autorisierungs-Gate** hat, dann ist die Antwort schon im Gate — sie dort abzuholen ist nicht nur weniger Code, sondern der einzige Weg, der auch für den Ausnahmefall stimmt. Ein hartkodierter Wert beantwortet immer nur den Normalfall; hier hätte er den Break-Glass-Pfad still falsch gemacht, und zwar unsichtbar, weil dieser Pfad selten und nur im Log sichtbar ist. Zweite Lehre aus derselben Durchsicht: **„Schreibweg" ist nicht dasselbe wie „jemand schreibt".** Ein Drittel der gefundenen Schreibstellen hat gar keinen Handelnden — Sweeps, Zähler, Protokolle. Wer sie mit derselben Regel belegt wie eine Redaktions-Route, macht aus einem Lese-Request eine Mitgliedschaft. | 2026-08-01 |
| F9 (Rest) | **DevTools-Abzeichen aus den neun Theme-Baselines** — ✅ **ERLEDIGT 2026-08-01.** In jeder der neun `themes-visual`-Baselines saß mitten im Bild das Nuxt-DevTools-Abzeichen **mit wechselnder ms-Zahl**; überlebt hatte es nur, weil `maxDiffPixelRatio: 0.02` es verschluckte. **Schalter:** `devtools: { enabled: !process.env.PW_E2E }` in `apps/comments/nuxt.config.ts`, gesetzt vom `webServer.env` in `playwright.config.ts` — der normale Dev-Betrieb behält seine DevTools, nur der Testlauf nicht. `nuxt.config` ist die Stelle, weil `devtools` eine **Build-Option** ist (kein runtimeConfig, nicht pro Request umschaltbar); dass E2E gegen den DEV-Server fährt, macht den Schalter überhaupt erst wirksam. Weil `reuseExistingServer: true` einen schon laufenden Server samt SEINER Umgebung übernimmt, prüft die Spec zusätzlich `nuxt-devtools-frame` auf 0 und nennt beim Fehlschlag den Grund — **verifiziert, dass die Zusicherung wirklich anschlägt** (gegen einen DevTools-Server: „Received: 1"). Neun Bilder neu gebacken, danach **`maxDiffPixelRatio` von 0.02 auf 0.0001 gesenkt** (gemessen: mit Toleranz 0 sind die Läufe pixelgleich; 0,01 % ≈ 166 px ≈ ein 13×13-Feld für vereinzelte Kantenglättung). Beweis: volle comments-Suite **3× grün, 24/24, Exit 0**. **Gelernt (zwei Stück):** (1) **`--update-snapshots` backt nur FEHLGESCHLAGENE Bilder neu.** Der erste „Neubau"-Lauf meldete 9 grün und schrieb **keine einzige Datei** — die tolerante Toleranz ließ die vergifteten Baselines bestehen. Ein Rebake, der nichts ändert, ist kein Rebake: `--update-snapshots=all` erzwingen und danach `git status` lesen. (2) **Eine großzügige Toleranz ist kein Sicherheitsabstand, sondern ein Versteck.** 2 % waren das Zehnfache dessen, was das Abzeichen brauchte — ein Netz, das ein ganzes Bedienelement verschluckt, verschluckt auch eine kaputte Ramp. Erst die Quelle des Rauschens beseitigen, dann die Toleranz auf das messbare Minimum ziehen. | 2026-08-01 |
| E11b | **`maui` → `pukalani` im Repo-INHALT** ([VOKABULAR-AUFRAEUMEN.md](archiv/VOKABULAR-AUFRAEUMEN.md) Abschnitt 4) — Davids Entscheidung: **Inhalt jetzt, Ordner später.** Der lokale Ordner und das GitHub-Repo heißen weiter `maui-monorepo`, die Domain `maui.photos` bleibt überall unverändert (Vorgabe 2026-07-31). **Die 567 Dateien im Plan stammten von VOR Etappe A** — nachgemessen blieben am 2026-07-31 nur **180 Treffer in 84 Dateien** (ohne `docs/archiv/**`, `CHANGELOG.md`, `pnpm-lock.yaml`). Regelbasiert wie Etappe A/B: **88 Ersetzungen in 50 Dateien** über 11 Regeln + 1 `git mv`; **92 Treffer bleiben bewusst** (maui.photos · Insel Maui als Ort · Stripe-Datenschlüssel · Embed-Rückwärtskompatibilität · echter Repo-/Ordnername · historische Sätze · spikes). Beweise: 826 Unit-Tests, `check:manifests` 18 Layer/8 Apps, `check:single-copy`, `pnpm -r typecheck` 10/10 grün; `pnpm-lock.yaml` unverändert. **Gelernt (drei Fallen, alle Altlasten AUS Etappe A):** (1) **Ein Vokabel-Rename hinterlässt tote Bezeichner, die still weiterlaufen.** Fünf Gruppen zeigten ins Leere: `maui.*`-Config-Gates (Namensraum heißt `pukalani.*`), `@maui/*`-Importe (Scope heißt `@pukalani/*`), das Einladungscode-Präfix `MAUI-` (Codes heißen `PUKA-`), die Brand-Fallback-Kommentare (Fallback ist `'Pukalani'`) und `public/maui-comments.js`, dessen eigene Anleitung schon `/pukalani-comments.js` nannte — **die dokumentierte URL lieferte 404**. Regel: nach jedem Rename nicht nur greppen, sondern die Treffer GEGEN den neuen Zustand prüfen. (2) **Ein Beweis-Skript kann durch einen Rename lautlos wertlos werden.** `verify-invite-stock.mjs` prüfte NEGATIV auf `MAUI-` (passt seither immer) und einmal POSITIV (`Kunde hat den Code per Mail`) — Letzteres wäre rot gelaufen, Ersteres grün ohne Aussage. Prüfungen auf Abwesenheit brauchen nach einem Rename dieselbe Sorgfalt wie Prüfungen auf Anwesenheit. (3) **Blindes Ersetzen macht historische Sätze zur Lüge.** Etappe A schrieb in `themes/app/plugins/theme.ts` „die Head-Ids heißen `pk-*`, nicht mehr `pukalani-*`" — sie hießen `maui-*`, nie `pukalani-*` (git 00674664). Protokoll-Sätze gehören in die Ausnahmeliste, nicht in die Regel. | 2026-07-31 |

---

## 2026-07-30 — am selben Tag zusätzlich fertig geworden

Diese vier Punkte sind aus E11 hervorgegangen und standen deshalb nie als
eigene Zeile in OPEN-ITEMS.md. Sie stehen hier, weil ihre Lektionen sonst
verloren gingen.

| Was | Ergebnis | Gelernt |
| --- | --- | --- |
| **Zusammenziehen der Übergangs-Spiegel** (control-025 `product-contract-cleanup`, control-026 `drop-site-legacy`, system-024 `drop-app-config-features`, courses-004 `drop-entitlement-feature`) | Alle Doppel-Spalten und Aliasse aus der `feature`→`product`-Umstellung sind weg, lokal und auf Prod; damit ist auch das E8-Aufräumen (Alt-Tabellen `site_members`, `site_invites`, `sites`) erledigt. Davids Go kam ohne die geplante Beobachtungsnacht. | **Die Drop-Migrationen liefen ein paar Minuten VOR dem Cleanup-Deploy.** In diesem Fenster konnte der Health-Sweep nicht mehr in die bereits gelöschte Spalte spiegeln — der Fehler wurde gefangen und heilte sich mit dem Deploy selbst, war also folgenlos. **Regel:** Drop-Migrationen laufen IMMER erst, nachdem der Code live ist, der die Spalte nicht mehr braucht — und die Reihenfolge ist **je Instanz** zu prüfen, nicht einmal global. Additive Migrationen laufen vorher, löschende nachher. |
| **„Customize theme" ersetzt das Theme-Studio** (Davids Entscheidung) | Der Bereich heißt in der Oberfläche jetzt nach dem, was man dort tut, nicht nach einem internen Produktnamen. | Interne Produktnamen („Studio") wandern mit der Zeit in die Kundenoberfläche, wenn niemand sie stoppt. Ein Bereichsname sollte die HANDLUNG beschreiben. Der Schlüssel/Pfad bleibt dabei unangetastet — siehe die Lektion aus B3 (Label ≠ Id). |
| **Betreiber-Seite „Gesperrte Namen"** (Migration control-027 `reserved-names`) | Reservierte Subdomains sind nicht mehr nur eine Konstante im Code, sondern vom Betreiber pflegbar. | **Eine Appwrite-Row-Id fasst nur 36 Zeichen.** Weil der gesperrte Name selbst die Row-Id ist, musste das Namenslimit von 40 auf **36** — sonst antwortet `createRow` mit einem generischen 400, dessen Text nicht verrät, woran es liegt. **Regel:** Wenn ein Fachwert als Row-Id dient, ist seine Maximallänge 36, und das Formular muss das durchsetzen, nicht die Datenbank. |
| **A6 Schritte 0–2** (Migration control-028 `community-billing`) | Der Befund ist festgehalten und das Community-Fulfillment additiv angelegt; die Schritte 3–6 stehen offen in OPEN-ITEMS.md. | **Schritt 0 war ein PURER TEST, kein Dokument:** er hält fest, dass der Geldpfad nur `workspaceId` kannte. Beweis-Tests VOR dem Umbau zu schreiben kostet fast nichts und zahlt doppelt — sie belegen den Befund unbestreitbar, und beim Bauen drehen sie sich mit um, statt nachträglich erfunden zu werden. |

### Prozess-Lektion: geteilter Arbeitsbaum

Bei parallel laufenden Sitzungen im **selben** Arbeitsbaum ließ ein
`git stash push -u` / `pop` eines Sub-Agenten unkommittete Dateien der anderen
Sitzung vorübergehend verschwinden. Es kam am Ende alles zurück — der Schreck
war trotzdem echt, und bei einem abgebrochenen `pop` wäre es Arbeitsverlust
gewesen. **Regeln:** (1) früh und klein committen, statt große unkommittete
Stände liegen zu lassen; (2) Sub-Agenten **stashen nie** in einem geteilten
Baum — wer Isolation braucht, bekommt einen eigenen Worktree.

---

## Ältere, bereits abgeschlossene Abschnitte

Die folgenden Abschnitte standen bis 2026-07-30 unverändert in OPEN-ITEMS.md und
sind vollständig erledigt bzw. bewusst entschieden. Sie bleiben hier als
Begründungs-Archiv.

> **2026-07-06 bis 2026-07-09 — Produkt-Arc „Community-Plattform":**
> GOALS-Phasen 21–27 sind komplett (Feed, Events + v2 inkl. Serien, Billing,
> Courses, Posts), dazu Tickets-Board P1–P4 und das **KI-Paket** (core
> `aiComplete()`, Moderations-Assist für Kommentare + Posts, globales
> Laufzeit-Model-Override `app_config.aiModel`). Details: README-Status
> 56–60 + GOALS.md.
>
> **2026-07-02 — Großes Abarbeitungs-Paket:** ALLE offenen Findings des
> Gesamtchecks (🟠 + 🟡) wurden umgesetzt (siehe „Bereits erledigt"), dazu die
> Ideen 1–3 (App-Template, @-Mentions, Markdown). Für die größeren Blöcke
> liegen jetzt umsetzungsreife Pläne unter **docs/plans/**.

### 🟠 Ehemals „Offen — als Nächstes angehen"

- **Phase 17 – Production Deployment** — Plan + Schritt-für-Schritt-Checkliste
  für den Betreiber: [docs/archiv/PHASE-17-PRODUCTION.md](archiv/PHASE-17-PRODUCTION.md).
  **Vorarbeit ✅ (2026-07-11): Prod-Build lokal generalprobiert** — nuxi build
  + node .output, 14/14 funktionale E2E (inkl. Realtime) gegen den Build;
  Prod braucht nur noch NUXT_PUBLIC_I18N_BASE_URL + NUXT_SMTP_* auf echte Werte.
  (Empfehlung: 2 Hetzner-VMs, ploi-Daemon, deploy.yml via workflow_run,
  Realtime-Watchdog; ~60 abhakbare Schritte, ~25–28 €/Monat).
  **Komplett erledigt 2026-07-19 (s. unten „Roadmap").**
- ✅ **Changelog Track 2B AKTIV** (2026-07-19): Function `changelog-draft`
  läuft auf Prod, GitHub-Release-Webhook → `https://changelog.pukalani.app/`
  (Custom Domain mit Let's-Encrypt; functions-Subdomains bekommen auf 1.9.5
  kein Einzel-Cert). Smoke-/HMAC-Tests bestanden; echter Release-E2E läuft
  mit dem nächsten release-please-Release mit. Ist-Zustand + Betrieb:
  [docs/archiv/CHANGELOG-2B-AKTIVIERUNG.md](archiv/CHANGELOG-2B-AKTIVIERUNG.md).

### 📋 Ehemals „Pläne für größere Ausbauten"

- **Themes-Vollausbau 26×11**: [docs/archiv/THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md)
  — Generator-Script muss neu gebaut werden (nicht im Repo!), 9 Schritte,
  ~7–10 PT, 7 Entscheidungen (E1–E7). **Vorgezogen erledigt (2026-07-02):
  Theme-Studio** unter /dashboard/themes (themes-Layer via pukalani.admin.modules):
  Galerie aller Themes mit Live-Wechsel + Nuxt-UI-Showcase, EIGENE Themes
  anlegen/bearbeiten/sortieren/löschen (Runtime-Ramp-Generator
  themes/shared/ramp.ts mit WCAG-Kontrast-Check + CSS-Export; Table
  custom_themes via system-009, CRUD /api/admin/themes, öffentliche Liste
  /api/themes, SSR-flash-frei injiziert). Der 26-Themes-KATALOG aus dem Plan
  **ist seit 2026-07-24 gebaut** (Master #6).
- ✅ **packages/billing (Stripe)** — umgesetzt 2026-07-08 als GOALS-Phase 23
  ([Plan](archiv/BILLING-STRIPE.md) exekutiert): hosted Checkout/Portal,
  Webhook (Signatur/Allowlist/Stale-Guard), Entitlements + `useBilling`,
  Live-Matrix mit echtem Test-Key gefahren. Details README-Status 56.
- **Embed-Widget**: [docs/archiv/EMBED-WIDGET.md](archiv/EMBED-WIDGET.md)
  — **E0+E1 ✅ (2026-07-09): Read-only-MVP live** (iframe + embed.js,
  frame-ancestors-Split, Read-Rate-Limit, [docs/referenz/EMBED.md](referenz/EMBED.md)).
  **E2–E4 ✅ 2026-07-23** (Master #5).

### 🟡 Klein / Reste

- **Audit-Produktfragen (2026-07-05 ENTSCHIEDEN):**
  (a) **Presence-Sichtbarkeit — so lassen**: Presence-Metadata (`userName`/
  `avatarUrl` + Aktivität) bleibt per `read("users")` für alle eingeloggten
  User lesbar — Name/Avatar sind ohnehin öffentlich (Kommentare), „wer ist
  online/tippt/reviewt" IST das Feature; nur eingeloggte sehen es. Bei
  Kundenprojekten/Multi-Tenant neu bewerten (dann Reads über Server-Route
  proxien). *(Genau das ist mit A4/A5 passiert.)* (b) **deleted-Tombstones zählen
  mit**: sie sind sichtbare Listeneinträge („[gelöscht]", Reddit-Verhalten);
  Zähler = Liste; Nicht-Zählen würde Anzeige und total auseinanderlaufen lassen.
  (c) **X-Forwarded-For**: kein Code-Gate — als expliziter Checkpunkt im
  Phase-17-Plan verankert (App NUR hinter ploi-nginx, Port 3000 nie exponiert,
  Firewall erzwingt es). Akzeptiert ohne Fix: L15 (controversial-Cap 200,
  dokumentierte Grenze).
- ✅ **Kleinkram-Batch (2026-07-02)**: `appwrite.config.json` umbenannt (inkl.
  Doku-Referenzen); **Stats-Contributor-Registry** umgesetzt
  (`registerDashboardStatsContributor` in core, Plugins in comments/moderation,
  admin/stats kennt keine Feature-Tabellen mehr); A14-Vertragsliste + die
  bewusste core→system-Matrix-Ausnahme in CONCEPT dokumentiert; SEO-Caveat
  dokumentiert (s. u.).
- ✅ `redirectOn:'all'`-**SEO-Caveat GELÖST (2026-07-10)**: hreflang-Alternates
  + og:locale + canonical via `useLocaleHead` in den App-Shells; `detect-
  BrowserLanguage.fallbackLocale` entfernt (signal-lose Crawler-Requests
  bekamen auf /de/* EN-Content — jetzt URL-Locale als Autorität). Absolute
  URLs via `NUXT_PUBLIC_I18N_BASE_URL` — in Prod (Phase 17) auf die echte
  Domain setzen. Details README-Status 65.
- **Bewusst akzeptiert/zurückgestellt (2026-07-02 entschieden)**:
  **UserMenu → /dashboard**: bleibt als
  capability-gegateter localePath-Link (Apps ohne admin-Layer haben keine User
  mit dashboard.access — der Link erscheint dort nie). **PresenceAvatar auf
  UChip**: ✅ umgesetzt 2026-07-11 (Badge aus dem Chip-Theme, live verifiziert).
  **Flag-Registry statt commentsEnabled
  in core**: mittlerer Refactor der AppConfig-Typen, lohnt erst mit dem
  nächsten neuen Flag. `useFormatCurrency`: bleibt als Baukasten-Vorhaltung
  (billing-Plan nutzt sie).
- **Geprüft, bewusst NICHT umgesetzt**: `login.post` kann den Namen nicht
  billig an `logAuthEvent` durchreichen — das Session-Objekt enthält keinen
  Namen, jede Alternative kostet denselben users.get (2026-07-02 geprüft).
  Client-seitiges `usePresence.refresh()` bleibt bei limit 200 (jedes Event
  triggert ein list(); Pagination dort würde Requests vervielfachen — der
  SERVER paginiert seit 2026-07-02 bis 1000).

### 💡 Ideen fürs nächste Level — alle umgesetzt

1. ✅ **E-Mail-Notifications + Digest** (2026-07-10) — Opt-in-Mails (instant/
   digest) über den Core-SMTP-Mailer (nodemailer statt Appwrite Messaging —
   kein Console-Setup/Key-Scope nötig); Details README-Status 63.
2. ✅ **Admin-Bulk-Aktionen + CSV-Export** (2026-07-10) — Multi-Select in
   Queue + User-Liste, Bulk-Routen mit Einzel-Flow-Guards, CSV-Export;
   Details README-Status 64.
3. ✅ **Caching/Microcache** (2026-07-10) — core createMicrocache für
   Gast-Kommentare Seite 1, Changelog-Liste (Write-Invalidierung) und
   /api/stats (L11). SSR-Seiten-SWR bewusst NICHT (Session-State im HTML);
   Details README-Status 64.
4. ✅ **CI mit echter Appwrite-Instanz** (2026-07-10) — e2e.yml startet den
   1.9.5-Stack im Runner, Console-Setup per Script, bootstrap+seed, volle
   Playwright-Suite inkl. Realtime — grün; Details README-Status 64.
5. ✅ **Auto-Hide-Threshold** (2026-07-09) — Eskalations-Vertrag
   `registerReportEscalationHandler` (moderation) + Auto-Hide in comments
   (`pukalani.comments.autoHideReports`, zweiphasig + Cascade, Meldungen bleiben
   offen); Report-„Kategorien" existierten bereits als offener reason-Katalog.

### 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

### 🔧 Cleanup / Improvements / NITs

- ✅ **Status-Codes** (2026-06-29): `status.patch`-`getRow` → 404 (statt 500) und `status.patch`-`updateRow` + `users/[id].delete`-`users.delete` via `toH3Error` gemappt. `comments/index.post` und `config.patch` waren bereits via `toH3Error` sauber, `users.get`/`appConfig` schon abgefangen.
- ✅ **i18n/A11y** (2026-06-29, bereits erledigt — Note war stale): Sidebar-Labels nutzen `t('dashboard.sidebar.*')` (Keys de+en vorhanden); [AnalyticsTrendChart.vue](../packages/admin/app/components/AnalyticsTrendChart.vue) hat `role="img"` + `aria-label` + per-Bar `<title>`; [OtpLoginForm.vue](../packages/core/app/components/auth/OtpLoginForm.vue)-`resend()` setzt `errorMessage = null` vor dem Request.
- ✅ **Dead Code** (2026-06-29): `useSeo.ts` entfernt (nur `useSeoMeta` wird genutzt). `useAnalytics.ts` und `RowList<T>` existierten schon nicht mehr.
- ✅ **Duplizierung** (2026-06-29, bereits konsolidiert — Note war stale): Avatar-Auflösung → `core/server/utils/avatars.ts` (`resolveAvatars`, von comments/presence/audit genutzt); GDPR-Export-Mapper → `core/server/utils/dataExport.ts` (`mapExport*`, beide Export-Endpoints); Changelog-Row→DTO → `admin/shared/changelog.ts` (`rowToChangelogEntry`, public + admin).
- ✅ **Coverage-Lücke** (2026-06-29, geprüft — keine echte Lücke): Der App-`nuxi typecheck` (comments extends ALLE Layer) prüft transitiv auch deren Server-Code — per absichtlichem Typfehler in `moderation/.../reportQueries.ts` verifiziert (wird gefangen). Kein `test`-Script-Gap: themes/moderation/system haben 0 Tests, comments/admin/core haben Tests + Script. Standalone-Typecheck pro Layer bräuchte je ein `.playground` (wie core) — bewusst nicht.
- ✅ **NITs** (2026-06-29, geprüft): `stats.get.ts` nutzt schon die moderne `users.list({ queries })`-Form; `.env.example` enthält `NUXT_PUBLIC_APPWRITE_PROJECT_NAME` nicht (mehr) und nirgends Code-Nutzung — beide stale. Bewusst akzeptiert: `isOutdated`-Prerelease-Ordering (installed/latest kommen aus stable-only package.json/Registry → Pfad triggert real nie, ein Fix wäre toter Code) und CI-`@vN`-Tags (Dependabot-managed, first-party/reputable Actions).
- ✅ **Hydration-Mismatch (relative Zeit)** (2026-07-01): „vor X Sekunden" renderte server/client mit unterschiedlichem `now` → ~16 Mismatches + Vue-Warnungen pro Load. Fix: `now`-Basis in [useFormatRelativeTime](../packages/core/app/composables/useFormatRelativeTime.ts) via `useState` (SSR→Client identisch), Update erst nach Mount + 30s-Ticker. Verifiziert: 0 Mismatches/0 Warnungen.
- ✅ **Destruktive Migration `comments-002`** (2026-07-01): Migration ist jetzt idempotent — sind beide Tables schon am Zielschema (Pflichtspalten `targetId`/`content` bzw. `commentId`/`userId`/`value` vorhanden), wird der DROP übersprungen (kein Datenverlust bei Re-Run). `createTable`/Spalten/Indizes sind ohnehin 409-idempotent; der Erst-Umbau (altes `postId`-Schema → Ziel) droppt weiterhin wie vorgesehen.
- ✅ **Zwei Presence-Systeme vereinheitlicht** (2026-07-01): Globale Online-, Thread- und Moderations-Presence teilen sich jetzt **eine** Presence pro User (`presenceId=userId`, metadata trägt `scope`/`action`/`typing`) über die Presences-API. `usePresenceState()` ist die einzige Upsert-Autorität, `usePresence(predicate)` liest gefiltert. Entfernt: `presence`-Table, `presenceRowId` (der `presence/leave`-Endpoint EXISTIERT weiterhin — er löscht die Presences-API-Presence per sendBeacon beim Verlassen). `admin/users`-Routen lesen `listOnlinePresences()`; „online jetzt" via `updatedAt`-Recency (60s). Neue Use-Cases: Moderations-Claim-Lock (`useModerationPresence`), Edit-Awareness auf Config/Changelog (`useEditAwareness`), Live-Online im Dashboard + Users-Liste. **Nachtrag (verifiziert per Playwright + Live-Appwrite):** In der SSR-Cookie-Architektur kann der Browser seine Presence nicht selbst schreiben (Web-SDK-Client ohne Session → `realtime.upsertPresence()` als Guest-WS verworfen, `PUT /presences` → 401). Der WRITE läuft daher server-seitig über `POST /api/presence/heartbeat` (Admin-Client, `read("users")`, `expiresAt` 90s); `usePresenceState` ruft die Route (Heartbeat 20s + `visibilitychange`/`focus`). Der Reader liest weiter direkt über die Presences-API (Cookie-GET). Ohne diesen Fix fielen eingeloggte User nach 60s auf „offline".
- ✅ **Echtes Realtime-Presence** (2026-07-01, ~280ms verifiziert, in production): (1) WS-Upsert (`realtime.upsertPresence`, JWT-Client, Owner-Rechte) — nur der WS-Weg löst das Event aus, der HTTP-Upsert nicht; (2) JWT-authentifizierter Reader-WS (empfängt `read("users")`-Events); (3) **gesunder realtime-Worker** — der laufende war durch einen Swoole-Crash degradiert und lieferte nichts, `docker compose up -d --no-deps appwrite-realtime` hat es gefixt. Poll (20s) ist jetzt nur noch Backstop. Betriebs-Hinweis: bei degradiertem Worker Container neu erstellen (der User hatte mit „muss neugestartet werden?" recht).
- ✅ **Presence-Use-Cases erweitert** (2026-07-01, verifiziert per Playwright): neue metadata-Felder `page`/`replyingTo`/`near` (je eigener Zweck). (a) **Betrachtungs-Presence** (`useViewingPresence` + `DashboardViewers`): „N andere sehen diese Seite" global im Dashboard → deckt „anderer Admin schaut denselben User/dieses Dashboard an" + Live-Betrachterzahl pro Seite ab. (b) **Antwort-Presence**: offenes Antwort-Formular meldet `replyingTo` → Kommentar zeigt „X antwortet gerade …". (c) **Lese-Präsenz**: IntersectionObserver meldet den sichtbarsten Kommentar als `near` → „N lesen hier" je Kommentar. (d) **`PresenceAvatar`** (core): Icon-Badge in der Ecke (Stift = tippt, Pfeil = antwortet) statt Farbpunkt. Damit sind alle vorgeschlagenen Presence-Beispiele umgesetzt.

### ⏸️ Ehemals „Zurückgestellt — brauchen Design"

- ✅ **Cross-Layer-Write (Notifications)** (2026-06-29): Core stellt jetzt `notify(event, {...})` ([core/server/utils/notify.ts](../packages/core/server/utils/notify.ts)) als Vertrag bereit (best-effort, Row-Security); comments ruft ihn statt direktem `tableId: 'notifications'`-Zugriff. Kein String-Coupling mehr (CONCEPT A14). Der `/`-Link-Teil war schon gelöst (`targetUrl` + Open-Redirect-Guard).
- ✅ **`total`-Semantik / Hide-Orphaning** (2026-06-30, gelöst): **Client** — Hide entfernt jetzt den ganzen Subtree (`removeWithDescendants` + reine, getestete `descendantIds`), keine verwaisten Replies, `rows`/`total` konsistent. **Server (Cascade-Hide, gewählt)** — `status.patch` blendet beim Ausblenden den Subtree mit aus (Thread per rootId laden → BFS → nur aktive Nachfahren), so zählt der globale `total` keine unerreichbaren non-hidden-Antworten mehr. Wiederherstellen kaskadiert bewusst nicht (nur der Parent; Antworten ggf. einzeln). Per-Nachfahre-Realtime-Events sind im Client reihenfolge-unabhängige No-ops.
- ✅ **Pro-Melder-Report-Modell** (2026-06-30, bereits gebaut als generischer `moderation`-Layer — Note war stale): `reports`-Tabelle mit `reporterId` + Unique-Index `reporter_target` (eine Meldung pro User/Target), eigener Rückzug (`index.delete` nach `reporterId` gefiltert), Status-Lifecycle, und Admin-Melder-Anzahl (`openReportsByTarget.counts` → `reportCount` in der Moderations-Queue). Das alte `'reported'`-Status-Flag am Kommentar ist entfernt (`status` = nur noch active/hidden/deleted). Übertrifft die ursprüngliche Spec (generisch statt comment-spezifisch). Einziger Rest: das akzeptierte LOW-`targetType`-Residual (s. Security-Review).
- ✅ **„Bearbeitet"-Indikator** (2026-06-29, bereits umgesetzt — Note war stale): `editedAt`-Spalte (Migration 005) wird beim Edit gesetzt ([id].patch.ts) und in CommentItem angezeigt — unabhängig von `$updatedAt`.

### 🗺️ Roadmap — bewusst ausgeklammert

- ✅ **Phase 17 – Production Deployment** (KOMPLETT 2026-07-19,
  [Checkliste + Learnings](archiv/PHASE-17-PRODUCTION.md)):
  **comments.pukalani.app ist LIVE** — Appwrite 1.9.5 auf api.pukalani.app,
  ploi-Site mit pm2 + Auto-Deploy-Kette (Push→Test→Deploy→pm2-Restart, e2e
  bewiesen), Offsite-Backups (Storage Box), UptimeRobot, Watchdog, HSTS,
  Schema-Bootstrap (29 Tables) + voller Smoke-Test inkl. OTP-Mail (Resend)
  und Realtime-ohne-Reload. A.10-Follow-ups: changelog-draft-Function
  deployen, Zero-Downtime Stufe 2.
- ✅ **Phase 18 – Realtime/Presence auf SDK** (KOMPLETT erledigt 2026-07-01
  auf 1.9.5+MariaDB — GOALS-Header nachgezogen + Trigger-Task
  `appwrite-release-watch` gelöscht am 2026-07-09):
  - ✅ **P2 Presence** — **komplette** Presence (global + Thread + Moderation) auf die **Presences API** vereinheitlicht: eine Presence pro User (`presenceId=userId`, metadata `scope`/`action`/`typing`), `usePresenceState` als einzige Upsert-Autorität + `usePresence(predicate)` als Reader. Alt-System (Endpoints `presence/heartbeat|leave`, `presence`-Table system-007, `presenceRowId`) entfernt. Multi-User end-to-end verifiziert. Use-Cases live: Claim-Lock, Edit-Awareness, Live-Online (s. erledigtes Finding oben).
  - ✅ **P1 Rows-Rückbau** (2026-07-01) — `useRealtimeRows` läuft jetzt auf der **einen geteilten, JWT-authentifizierten SDK-Realtime** ([useRealtimeClient.ts](../packages/core/app/composables/useRealtimeClient.ts)): `realtime.subscribe(Channel.tablesdb().table().row())` mit optionalem server-seitigem `queries`-Passthrough; `where`-Filter bleibt als sicherer Default. Presence, Row-Streams und Config-Flags multiplexen über **denselben Socket** (vorher: ein nativer WS pro Aufruf). `useRealtimeAccount` bleibt bewusst cookie-nativ (Instant-Session-Revoke hängt am Cookie-Close-Signal). Tote `appwrite.client.ts` entfernt. Verifiziert per Playwright (Gast-Tab): Row-Create + -Delete live über den JWT-Socket, sauberer Reload ohne Console-Fehler.
  - ✅ **P3 Email-Policies** — Signup-UX für Wegwerf-/Free-Adressen (422→i18n); Console-Toggle ist der Betreiber-Schritt.
- **Backlog**: ✅ Themes-Vollausbau (26×11) FERTIG 2026-07-24 (s. Master #6); obsidian-community-concept
  (`packages/billing` ✅ 2026-07-08 als Phase 23).
  - ✅ **E2E-Tests (Playwright)** (2026-07-01): comments hat eine erste E2E-Ebene ([e2e/smoke.spec.ts](../apps/comments/e2e/smoke.spec.ts)) — auth-freie Smoke-Tests (Routing, SSR-Render, i18n, öffentliche Seiten, 404) gegen System-Chrome, `pnpm --filter comments e2e`. Eingeloggte/Realtime-Flows bleiben manuell verifiziert (passwortbasierter Login). Weitere Apps: sobald vorhanden.
- ✅ **Changelog Track 2B** (2026-07-01, deploy-bereit): Appwrite Function [functions/changelog-draft](../functions/changelog-draft) + [appwrite.json](../appwrite.config.json) — GitHub-Release-Webhook (HMAC) → Commits via Compare-API → Entwurf. Teilt die Parsing-Logik mit Track 2A (`src/parse.js`, unit-getestet). **Aktiv erst mit Prod + öffentlicher Domain** (GitHub muss den Webhook per HTTPS erreichen); bis dahin bleibt `pnpm changelog:draft` (2A) der Weg. **Aktiv seit 2026-07-19.**
- **Sonstiges**: ✅ öffentliche `/changelog`-Vollhistorie-Seite existiert bereits ([changelog.vue](../packages/admin/app/pages/changelog.vue), auth-frei, alle Einträge). Die 10 gesammelten SaaS-Feature-Ideen sind durch [SAAS-ROADMAP.md](archiv/SAAS-ROADMAP.md) ersetzt (Master #10).

---

## ✅ Bereits erledigt (Referenz, historisch)

- **Gesamtaudit + Abarbeitung (2026-07-05)** — Read-only-Audit über 9 Slices
  (Orchestrator + audit-scout/audit-worker je Slice) gegen alle dokumentierten
  Invarianten: **0 Critical, 0 High**, Ergebnis in [docs/archiv/audits/GESAMTAUDIT-2026-07-05.md](archiv/audits/GESAMTAUDIT-2026-07-05.md)
  (inkl. Requested-Changes-Reconciliation: kein einziges „Regressed").
  Abarbeitung in 4 Paketen:
  - **Garantie-Fixes**: GDPR-Recipient-Query strikt statt geschlucktem catch
    (M1, system-Contributor), Sperr-Schritt in `deleteUserCompletely` strikt
    (L1), Hide-Phase-2 mit Retry + lautem Log statt Schlucken (L2).
  - **CSS-Sink-Härtung** (L3): `customFontCss`/`customThemeCss` prüfen die
    admin-Zod-Allowlists gespiegelt am Render-Sink (fail closed), Pointer-
    Kommentare in beide Richtungen, 7 Injection-Tests.
  - **Kleinkram** (L4–L10, L12–L14): Storage-Orphan-Scan auf Cursor,
    unread-Count über Gesamtmenge, `REPORTS_WINDOW`-Konstante + Überlauf-Log,
    `commentsReported`-Stat zum Konsumenten (comments) verschoben,
    Function ohne statischen Key-Fallback, bootstrap app-agnostisch
    (+ Package- statt Verzeichnisname in pnpm-Filtern), Migration 006→010,
    statusText-Leak, Return-Typ.
  - **Doku**: CONCEPT.md D1–D4 nachgezogen (A4 → geteilte JWT-Realtime,
    A14-Matrix ohne presence + mit custom_themes/fonts, Package-/Stack-Tabelle
    aktuell), migrate.mjs-Kommentar. Offene Produktfragen s. 🟡.
- **Observability-Gate `pukalani.observability` (2026-07-02)**: strukturierte
  JSON-5xx-Logs am ZENTRALEN `core/server/error.ts` (4xx bleiben still, keine
  Bodies/Header — PII), Client-Error-Inbox (`observability-errors.client.ts`:
  vue:error + window.onerror + unhandledrejection, dedupliziert, max
  10/Session → `POST /api/telemetry/error`, Zod + Rate-Limit 30/min),
  Sentry-Andockpunkt dokumentiert in `logEvent.ts` (bewusst ohne SDK-Dep).
  Core-Default aus; comments aktiviert. Live verifiziert: 500 → JSON-
  Zeile mit Pfad/Stack, 4xx still, Browser-Fehler beide Pfade geloggt,
  Rate-Limit greift (429). Unit-Tests für shapeErrorLog/logEvent.

- **GDPR-Löschung/-Export komplett (2026-07-02)** — Umsetzung des Plans
  [plans/GDPR-DELETE-AND-EXPORT.md](archiv/GDPR-DELETE-AND-EXPORT.md) mit den
  Plan-Defaults (E1–E8; u. a. Tombstone mit geleertem Content, Snapshot auch
  bei Selbst-Löschung, 30-Tage-Lazy-Cleanup):
  - **UserDataContributor-Vertrag** (`core/server/utils/userData.ts`) +
    Contributors in comments/moderation/system (je `server/plugins/user-data.ts`)
    — die A14-Verletzung core→comments im Export ist WEG (`dataExport.ts`
    kennt kein Feature-Schema mehr); system hat damit erstmals Server-Code.
  - **`deleteUserCompletely`**: Snapshot → Sperren → Audit (ohne Klarname) →
    Contributors sequenziell/isoliert → Avatar+Presence → `users.delete` NUR
    bei Voll-Erfolg (Teilfehler = gesperrter User + Report, idempotenter Re-Run).
    Kommentare → Tombstone in der ROW (Roh-REST ohne PII), Votes/Reports/
    Notifications (Empfänger + Verursacher via neuem `senderId`) hart gelöscht,
    Audit-Logs pseudonymisiert (actorName/ip/metadata.name/targetName leer).
  - **Exports vollständig**: `exportUserCompletely` (Self + Admin, Cursor-
    Pagination via `listAllRows`, alle Datenarten inkl. Votes/Reports).
  - **Snapshots**: Bucket `gdpr-exports` (bootstrap, encryption, keine
    Bucket-Permissions), Admin-Routen List/Download/Delete + Audit, UI-Tab
    unter /dashboard/admin, Lazy-Cleanup > 30 Tage.
  - **Migrationen**: comments-009 (votes-userId-Index), system-008
    (notifications.senderId + Index, audit_logs-target-Index) — auf Dev
    ausgeführt. `notify()` trägt jetzt `senderId` (Reply + Mention).
  - **Verifiziert**: 41/41 Live-E2E-Checks (Self-Delete-Vollprüfung mit allen
    PII-Arten, fremde Antwort überlebt, Roh-REST-Check, Admin-Delete +
    Download, RBAC least-privileged 403, Bucket-Allowlist), Unit-Tests
    (Registry, listAllRows), 12/12 Playwright, typecheck/lint grün.
    Akzeptiert: E8-Lücke (Alt-Notifications ohne senderId).

- **Gesamtcheck-Abarbeitung (2026-07-02)** — alle offenen 🟠/🟡-Findings + Ideen 1–3 in 10 Batches:
  - **admin ohne comments**: `stats.get` degradiert mit catch + 0-Fallback (search/analytics waren schon sauber).
  - **toH3Error-Serie**: changelog patch/delete, users status.patch/sessions.delete, admin-storage delete, core-storage get/delete, otp.post — 4xx statt unmaskiertem 500.
  - **Effizienz**: `assertNotLastAdmin` via `Query.contains('labels','admin')`+limit 2 (live auf 1.9.5/MariaDB verifiziert); `reports/resolve` parallel in 10er-Chunks; `presences.list total:false`.
  - **Vote-Privacy**: `comment_votes` Table-`read(users)` entfernt (Migration 007, auf Dev ausgeführt); 002 legt frisch ohne Table-Read an.
  - **Migrations entkoppelt + apps/_template**: zentraler Runner `scripts/migrate.mjs` (`pnpm migrate --app <app>`, Auto-Detect nur bei genau einer App, `--env-file` für CI/Prod); Layer-Scripts rufen den Runner; bootstrap.ts app-agnostisch; MDC/ProseMirror-Config in den admin-Layer gezogen; Template-App (Port 3002) mit README läuft in lint/typecheck der CI mit.
  - **i18n**: core `ui.cancel` (statt 7× Cross-Layer-Key), tote admin-Keys entfernt (gegen dynamische Kompositionen geprüft), `admin.users.notFound` statt hartkodiertem „— 404".
  - **9 Client-Bugs**: useLogout() mit Presence-Beacon + try/catch (3 Stellen dedupliziert); Dashboard-Suche Stale-Guard; Vote-In-Flight-Serialisierung (Client) ; useRealtimeAccount Stabilitätsfenster-Backoff + nur für eingeloggte User; pending-Reply-Puffer; WhatsNew-Unread auf `$createdAt`; IntersectionObserver re-observed bei temp-ID-Tausch; `?status=`-Watch; s.o.
  - **Vote-Lost-Update (Server)**: `serializePerComment` — Recount+Write pro Kommentar serialisiert (Multi-Instanz-Grenze im Util dokumentiert → Appwrite-Transactions).
  - **Kanten**: Antworten-Subtrees + Cascade-Hide-Thread + Changelog + users-active-Sort + Analytics auf Cursor-Pagination (Notanker mit Log statt stillem Cap); listOnlinePresences bis 1000; Rate-Limit-Fallback auf Session-Identität statt `unknown`-Sammeltopf; Avatar-Upload mit Magic-Bytes-Check.
  - **hidden-REST-Leak GESCHLOSSEN**: Lese-Sichtbarkeit auf Row-Ebene (Migration 008 + Backfill, auf Dev ausgeführt); Hide = zweiphasig (Status-Event → Permission-Entzug), Restore in einem Write; live verifiziert (Gast-REST 404 auf hidden, Gast-WS bekommt weiterhin Events).
  - **UAuthForm**: Regel präzisiert — UAuthForm ist Vorlage, die optimierten UForm-Implementierungen bleiben; Abweichungen dokumentiert in [docs/referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md); CLAUDE.md/CONCEPT.md angepasst.
  - **@-Mentions**: `resolveMentions()` gegen Thread-Teilnehmer (kein globaler Namensraum, max 5), notify(type:'mention'), Bell-Text je Typ, Autocomplete im CommentForm; live verifiziert.
  - **Markdown-Kommentare**: eigener sicherer Subset-Parser (`shared/markdown.ts`, 20 Tests inkl. XSS) + vnode-Renderer `CommentMarkdown.vue` (kein v-html; MDC bewusst NICHT für Fremd-Content); SSR-verifiziert.
  - **6 Plan-Dokumente** unter docs/plans/ (GDPR, Phase 17, Changelog 2B, Themes, Billing, Embed).

- **Appwrite 1.9.5 + MariaDB-Umstieg + Phase-18-P2 + Tooling (2026-07-01)**:
  - **Server-Upgrade** Appwrite 1.9.0 → 1.9.5 (Backup, manueller Tag-Bump da
    Web-Installer interaktiv, `migrate`) — dann **DB-Adapter-Umstieg MongoDB →
    MariaDB** (frische Instanz, empfohlener Default). Stolpersteine gelöst:
    Traefik-Segfault (Neustart), SMTP → Mailpit, Console-Whitelist, fehlende
    1.9.5-Schema-Attribute (`migrate`), inkonsistente `main`-DB-Metadaten
    (neu angelegt), API-Key-Scopes.
  - **P2 Presence** auf die Presences-API (s. Phase 18).
  - **P3 Email-Policies**-UX (422 → freundliche i18n-Meldung im Signup).
  - **Bootstrap-Tooling**: `pnpm bootstrap` (DB + Bucket + Platform + alle
    Migrationen, Guard gegen destruktiven Re-Run) + `pnpm seed` (Demo-User mit
    Rollen + Kommentare). Beide reproduzierbar/idempotent.
  - **Security-Test**: XSS/HTML/JS/SQL-Payloads als Kommentar-Inhalt → alle
    escaped (Vue-Autoescaping, kein `v-html`), 0 injizierte Elemente, DB intakt.
  - **Hydration-Fix** (relative Zeit) + README-/Doku-Update.
- **Pre-Production Security Review (2026-06-29)** — Review über `d1a2e13..HEAD`
  (2 Review-Agents: Authz + Input/Leak/Redirect, plus eigener Pass):
  - **MEDIUM behoben — Stored Open-Redirect via `targetUrl`**: der alte Guard
    (`startsWith('/') && !startsWith('//')`) ließ protokoll-relative Bypässe
    durch (`/\evil` — Browser normalisiert `\`→`/` —, `/%2F%2Fevil`,
    Whitespace-Tricks `/ /evil`, `/\t//evil`). Diese flossen unverändert in den
    Reply-Notification-Link → Off-Site-Navigation (Phishing). Fix: strenge
    Regex `^\/(?![/\\%])[^\s\\]*$` im
    [comment-Schema](../packages/comments/schemas/comment.ts) **+**
    `safeLink()`-Render-Guard in
    [NotificationBell.vue](../packages/core/app/components/NotificationBell.global.vue)
    (defense-in-depth gegen alt gespeicherte Rows) **+** Regressionstest
    [schema.test.ts](../packages/comments/tests/schema.test.ts).
  - **LOW behoben — `reports/resolve`-Input-Hygiene**: lose `typeof`-Checks +
    unbegrenztes `resolution` → `resolveReportSchema` (Zod, längenbegrenzt).
  - **LOW behoben — Rate-Limiting auf Schreib-Endpoints**: `rate-limit`-Middleware
    deckt jetzt auch `POST /comments`, `PATCH /comments/[id]`, Vote und
    `POST /reports` ab (eigenes, weiteres Budget `WRITE_MAX=60/min`; Vote-Spam
    über viele IDs teilt EINEN Bucket). `reports/resolve` bewusst ausgenommen
    (Moderator-gated).
  - **Akzeptiertes Restrisiko (LOW) — `reports.targetType` ungeprüft**: ein
    eingeloggter User könnte Meldungen mit beliebigem `targetType`/nicht
    existierendem `targetId` absetzen. Entschärft: die Moderations-Queue filtert
    Junk bereits über Comment-Existenz; nur die „Gemeldet"-KPI ließe sich minimal
    aufblähen. Moderation bleibt bewusst domänen-generisch → kein Existenz-Check
    (würde den Layer an Comments koppeln). Sauberer Fix kommt mit dem
    zurückgestellten `comment_reports`-Modell.
  - **Sauber bestätigt (kein Defekt)**: Error-Envelope leakt keine Appwrite-/
    Zod-/Stack-Details; alle Authz-Guards (reports/comments/admin) korrekt,
    `reporterId` server-autoritativ; Moderations-Inputs parameterisiert (keine
    Injection, keine `Role`-Spoofing-Fläche).
- **3. Review-Pass (2026-06-24)** — neue Funde abgearbeitet:
  Storage-Orphan-Erkennung paginiert jetzt ALLE User+Files (vorher nur 100 →
  Falsch-Orphans, die der Bulk-Delete gelöscht hätte); Passwortänderung beendet
  Fremd-Sessions; Analytics-Chart-Buckets und KPI-Totals aus derselben
  In-Range-Menge (kein Balken-vs-Legende-Widerspruch mehr); Status-Guards auf
  Comment-PATCH + Vote (kein Editieren/Voten auf hidden/deleted per Direktrequest);
  Rate-Limit-Budget je Methode+Route (Reset-Confirm teilt nicht mehr das
  Mail-Budget); avatarUrl auf relative Storage-URL/https eingeschränkt;
  Notifications mit zusätzlichem recipientId-Filter; loadAll iteriert über
  Seitenzahl (controversial überspringt keine Zeilen); changelog-date als
  ISO-datetime validiert; OAuth-Redirects locale-aware; xForwardedFor-Trust
  dokumentiert; Dead-Migration 001 entfernt; README-Baum korrigiert.
  Bewusst NICHT angefasst: report-Toggle-TOCTOU (`active↔reported` ist bereits
  geguardet; sauberer Fix = das zurückgestellte `comment_reports`-Modell).
- **🟠+🟡-Batch (2026-06-24)** — alle 14 Punkte abgearbeitet:
  Layer-Scan TTL-Cache (~60 s); Realtime-WebSocket `new WebSocket()` in
  try/catch + Backoff (rows + account); kein Falsch-Logout mehr
  (`refresh()` nullt nur bei 401/403, `onClose` feuert nur nach erfolgreichem
  `open`); Dashboard-`today` client-only (kein Hydration-Mismatch);
  comments-`migrate`-Script repariert (002→004 idempotent + `--env-file`);
  vote-`myVote` autoritativ aus der DB nachgelesen; users-`total` echte
  Gesamtzahl bei „Jetzt aktiv"; analytics-KPIs per Count-Query statt Sample;
  changelog-Patch-Audit `row.title`; healthCheck-Default `unknown`;
  changelog-Löschdialog `localized()`; GDPR-Export `account.get()` abgefangen
  (Fallback Context-User); NotificationBell Re-Subscribe via `watch`;
  release-please `bootstrap-sha` entfernt.
- **Code-Review Batches A–G**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME; GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell `<i18n-t>`; Vote-Flicker behoben (Single-Write, autoritative Counts) inkl. Flip-Race/Score-Drift/409; Controversial-Sort über Fenster; Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren); `assertNotLastAdmin` paginiert; `config.patch` 404-only; `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-Sortierung; admin-Middleware `status/statusText`; CI `permissions`+`concurrency`; Dependabot; `@nuxtjs/i18n` als echte Dep; `changelog-draft` `execFileSync`.
- **Kommentar-UI (Reddit-Stil)**: borderless, kompakte Aktionszeile, Edit/Delete/Report hinter ⋯, Antworten ein-/ausklappen, „Alle {x} laden"-Button (löst die verborgenen Kommentare + verwaiste Replies), **unreport** (Melden ⇄ zurückziehen).
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei; keine Prod-Fehler-Leaks (Nitro maskiert ungefangene Fehler).

### C19 — /de-Endlosschleifen-Fix ✅ 2026-07-31

3xx-Antworten mit leerem Location-Header werden im Core auf die App-Wurzel
normalisiert (Commit 5528d01); mit dem Deploy von Build 49442b7 auf allen
Hosts live, Nachweis per Ancestor-Check des Live-Builds.
**Gelernt:** Ein „im Code behoben"-Punkt ist erst zu, wenn der Fix nachweislich
im LIVE-Build steckt — der Ancestor-Check (`git merge-base --is-ancestor
<fix> <live-build>`) ist dafür der billigste Beweis, kein erneutes Deployen.

### E8-3 — tenants→communities + 19 communityId-Spalten ✅ 2026-07-31

Komplett in einem Tag, in drei Phasen je Instanz (4 Prod + 4 lokal):
(1) control-029 kopierte `tenants`→`communities` und `tenant_plans`→
`community_plans` GENERISCH (Spalten+Indizes aus der Quelle gespiegelt,
Zeilen MIT Row-Id, upsert-fähig); (2) acht Layer-Migrationen legten
`communityId` neben `tenantId` in alle 19 Pool-Tabellen (Backfill +
Index-Zwillinge, Unique erst nach vollständiger Kopie), Code-Umschaltung am
Engpass (Datentür: Filter neu, Stempel doppelt); (3) Aufräumer mit finalem
Drift-Backfill + Gegenprobe VOR jedem Löschen, control-030 ließ die
Alt-Tabellen fallen. Beweise: comments 13/13 · presence 10/10 · posts 7/7 ·
events 14/14 · courses 28/28; alle Instanzen paginiert nachverifiziert.
**Gelernt:** `listColumns` paginiert bei 25 — die spaltenreiche
events-Tabelle wurde vom generischen Skip STILL übersprungen und flog erst
im Isolationsbeweis auf (Query.limit(200) gehört in JEDEN Spalten-Scan;
Beweise nach jedem Schritt sind der Grund, warum so ein Umbau verantwortbar
ist). **Gelernt:** Tabellen liegen auf MEHR Instanzen als die Manifeste
sagen (events-Altbestand auf comments, pages auf control, media auf photos)
— Schema-Verifikation immer über ALLE Instanzen, nie über die Layer-Liste.

### E8-4 — der EINE Wächter + Community-Vokabular ✅ 2026-07-31

requireTenantPermission war bereits toter Code (null Aufrufer — organisch
gestorben); requireSitePermission/resolveTenantRole heißen jetzt
requireCommunityPermission/resolveCommunityRole in EINER Datei. 908
Ersetzungen in 129 Dateien, 51 Umbenennungen; EINE CommunityRole-Definition
(die Zweitkopie mit „muss identisch bleiben"-Kommentar ist weg), Capability-
Keys community.*, Routen /api/community/**. Beweise: alle Tests, Typecheck,
comments 13/13 · presence 23/23 · site-authz 97/97. E8 ist damit KOMPLETT
(Plan → docs/archiv/UMBENENNUNG-AUF-COMMUNITY.md).
**Gelernt:** Nitro sortiert Middleware lexikografisch — ein RENAME kann die
Ausführungs-Reihenfolge verschieben (community-label wäre vor csrf/rate-limit
gerutscht). Reihenfolge gehört EXPLIZIT in Nummern-Präfixe, nie an den Zufall
eines Dateinamens. **Gelernt:** „muss identisch bleiben"-Kommentare markieren
eine Kopie, die man zusammenführen sollte, nicht pflegen.

### A6 — die Community ist das zahlende Objekt ✅ 2026-07-31

Alle Schritte: Beweis-Test → control-028 → Community-Fulfillment (Cross-Sub-
Guards) → Checkout/Portal über die Service-Naht (Stripe-Testmodus Ende-zu-
Ende bewiesen: cs_test-URL + Portal) → Abo-Seite im Community-Dashboard →
Workspace-Rückbau (69 Dateien, −2364 Zeilen; Lizenz-Mechanik geparkt in
entitlementGrants/entitlementPlan) → control-031 (Bremse: keine lebende
Subscription, sonst Abbruch). Schritt 4 war leer (Pool hat null Nutzer).
**Gelernt:** Instanz-weite Capabilities (billing.manage) nie an Site-Rollen
vergeben — der Rollen-Trennungs-Test hat genau das gefangen; Site-Belange
brauchen EIGENE community.*-Capabilities. **Gelernt:** GDPR-Contributor nur
dort, wo die userId-Verankerung wirklich liegt — ein Contributor, der
strukturell nichts findet, täuscht Vollständigkeit vor.

### E9 — Menü-Umbau: eine Navigation, drei Ebenen ✅ 2026-07-31

scope 'operator'|'community'|'account' als Pflichtfeld je Registry-Modul,
PURE Filter-Regel (dashboardNav.ts, 20 Tests): dreiwertiger Ort, getrennte
Rechte-Quellen, fail-closed ohne scope. Gruppen nach Davids Entwurf; keine
Menüpunkte ins Leere — die 14 fehlenden Seiten kommen einzeln (Plan bleibt in
docs/plans/DASHBOARD-IA.md). **Gelernt:** die Silo-Ausnahme muss an
tenancy.enabled hängen, nicht an isTenantHost — sonst erscheinen
Community-Einträge auf Kontroll-Hosts, wo ihre APIs 404en.

### E10 — Customer Feedback zentral ✅ 2026-07-31

Nach Davids acht Vorab-Entscheidungen: feedback+tickets zogen von comments
nach control (Silo-Bestand vorher gesichert: 10 lokal/1 Prod), vier neue
Control-Tabellen (control-032, lokal+Prod gefahren), Feedback-Widget auf
jeder Community-Seite, /dashboard/feedback (Trending/Top/New) +
/dashboard/roadmap (vier Spalten), Naht „jedes Dashboard fragt seinen
eigenen Server" (controlService in core, in-process auf control,
fail-soft), origin nur für den Betreiber, eine Stimme pro Person,
Rate-Limits, GDPR-Contributor. Roadmap = Sicht auf Feedback, NICHT das
Ticket-Board (bleibt Betreiber-intern). Bewusst offen im Plan: Auto-
Changelog bei Complete, Owner-Sicht, Verfasser-Benachrichtigung (D5-Wand).
**Gelernt:** Wenn zwei Layer denselben Naht-Transport brauchen, gehört er
in core hochgezogen — nicht kopiert (controlService, Config-Schlüssel
unverändert, onboarding delegiert nur noch).

### C18 — Sichtbarkeit pro Community ✅ 2026-07-31

Wählbar unter Settings→Community (team.manage), neue Communities entstehen
öffentlich (dokumentierte Kehrtwende zu G0-7). Permissions-Flip in beide
Richtungen über pure Regel repermissionRow() (liest „veröffentlicht" am
BESTEHENDEN Array ab — öffnet nie, was zu war) + Registry/Cursor/Zeitbudget;
SEO zieht mit (noindex, robots, sitemap-404 VOR dem Datenlesen, og zu);
pages ohne Row-Permissions bekam die eigene Wache. Beweise:
verify-audience-flip 19/19, pool-isolation 13/13 unverändert; Demo nach dem
Deploy explizit public gestempelt (Status quo). **Gelernt:** Ein Feld, das
bisher nichts steuerte, macht beim Scharfschalten den BESTAND fail-closed
„halb zu" — der Betriebsschritt (Stempel-Einzelvorgang) gehört in denselben
Plan wie der Code. **Gelernt:** Mandantenübergreifende Schreiber (GDPR-
Tombstone) dürfen nie hart read(any) stempeln — sie öffnen sonst Inhalte
geschlossener Communities.

### C12 — Dashboard-Kleinteile ✅ 2026-07-31

Audit-Liste komplett (96 Dateien): Kunden-Labels statt interner IDs
(gebündelte Namens-Auflösung statt 50 Einzelabrufen), Jargon übersetzt,
Nuxt-UI statt Handbau, aria-Labels, Toasts 15→190 mit Beschreibung über
fünf parallele Gruppen — jede Beschreibung gegen den Code verifiziert.
**Gelernt:** error.statusMessage als Toast-Text ist unter HTTP/2 IMMER leer
(Reason-Phrase entfällt) — Beschreibungen brauchen übersetzte Fallbacks
(Rest als F1). **Gelernt:** Audit-Zeilennummern altern — Stellen per Inhalt
suchen, Erledigtes ausweisen statt doppelt bauen. **Gelernt:** Eine gute
Fehler-Beschreibung sagt, was NICHT passiert ist („dein Text steht noch im
Formular") — und muss gegen den Code geprüft sein, sonst ist sie gelogen.

**Rest: der UTable-Rollout (B6) ✅ 2026-07-31.** Die Audit-Zahl „18 handgebaute
Listen" stammt vom 2026-07-28 und war beim Nachmessen längst abgetragen: die
B6-Welle (Merge `d1692c49` plus `a2be6cae`, `7dcf4515`, `173c2bad` …) hat sie
umgebaut — heute halten **26 Dashboard-Seiten** plus die geteilte
`SessionsTable` eine `UTable`. Neu gemessen
wurde über alle `app/pages/dashboard/**` und `app/components/**` der Layer;
übrig blieben zwei echte Datenlisten, beide umgebaut: die **letzten Kommentare**
auf der Nutzer-Detailseite (`admin/users/[id].vue` — dieselbe Karten-Reihe, in
der Sitzungen und Protokoll schon Tabellen waren; Spaltenköpfe aus
`admin.moderation.col.*`, damit dieselben Felder nicht zweimal übersetzt
werden) und die **Abhängigkeiten** auf `dashboard/system.vue` (eine Tabelle JE
KATEGORIE, damit die Gruppierung bleibt; Inhalt 1:1, inkl. Dev-Update-Knopf).
Alles andere ist **bewusst keine Tabelle** und trägt den Grund jetzt AN DER
STELLE als Kommentar (B6 verlangt genau das): Vorschau-Kacheln der Übersicht
(`admin/dashboard/index.vue`, fünf Zeilen + „Alle ansehen") · Benachrichtigungs-
Kanäle in der schmalen Steuerspalte (`users/[id].vue`) · Schalter-mit-Erklärtext
statt Datensatz (`admin/products.vue`, `admin/config.vue`) · der Aktivitäts-Feed
(`activity.vue` — dieselbe Komponente wie öffentlich, Bündelung + Endlos-
Nachladen) · die Roadmap und das Ticket-Brett (der Status IST dort die Spalte;
die tabellarische Sicht auf dieselben Daten steht unter `/dashboard/feedback`) ·
die Beobachtet-Schublade (`tickets.vue`) · Preiskarten
(`settings/subscription.vue`) · der Quota-Katalog in `control/tenants.vue`
(Formular mit Eingabefeldern). **Gelernt:** Eine Audit-ZAHL altert wie eine
Zeilennummer — vor dem Ausrollen neu messen, sonst baut man an bereits
umgebauten Stellen. Und: „handgebaut" ist kein Befund, solange der Grund
danebensteht — die Arbeit an solchen Stellen ist, den Grund zu schreiben, nicht
die Bauweise zu wechseln.

### C16 — die drei toten Berechtigungen haben ein Ziel ✅ 2026-07-31

`branding.manage`, `posts.write` und `community.delete` standen in der
Rollen-Matrix und steuerten nichts. Jede hat jetzt eine Fläche — zwei davon
anders, als die Notiz es vorgezeichnet hatte:

**`branding.manage` (= F5).** Nicht „die Themes-Seiten auf branding.manage
ziehen": `custom_themes`, `custom_fonts` und `app_config.themeSettings` gehören
dem Appwrite-PROJEKT (read(any), Live-Propagation an ALLE Communities des
Pools) — ein Community-Admin hätte damit fremde Communities umgefärbt. Der
Schnitt heißt **Wahl ≠ Katalog**: die Wahl (`communities.theme/variant/neutral`)
zog aus der Settings-Karte auf eine eigene Seite `/dashboard/branding` im
**onboarding**-Layer (dort, wo ihre Route lebt — dieselbe Regel wie bei den
Mitgliedern), der Katalog bleibt `system.manage`, und das Theme-Studio ist
jetzt `scope: 'operator'`. Umgezogen, nicht kopiert.

**`posts.write`.** Der gemeldete Befund war schon halb erledigt: die Routen
prüften die Autorschaft längst (`row.authorId !== user.$id` ⇒ 403), das
Karten-Menü bot Bearbeiten/Löschen an. Die echte Lücke war das DASHBOARD — die
posts-Sektion verlangt `posts.moderate`, und Editor und Moderator sind in der
Matrix **Geschwister**, keine Kette. Also: die dreifach ausgeschriebene
Autoren-Regel zu einer puren Funktion zusammengezogen
(`postAuthorPolicy.ts`, 15 Tests) und eine zweite Nav-Registrierung +
`/dashboard/my-posts` (`GET /api/posts/mine`) für `posts.write` gebaut.

**`community.delete`.** Kehrtwende zur Entscheidung 3 vom 2026-07-29, mit einem
Schnitt, der deren Einwand auflöst: **stilllegen statt vernichten**
(`communities.status='disabled'` ⇒ Host 404 in ≤30 s, alle Mitgliedschaften
'removed', Labels eingezogen — INHALTE BLEIBEN). Gesperrt bei laufendem Abo
(409 `subscription_active`) und bei bereits stillgelegter Community. Volle
Begründung im [DECISION-LOG](DECISION-LOG.md#2026-07-31).

**Gelernt:** Eine tote Capability sagt nicht, WO ihre Fläche hingehört. Bei
zweien lag die Antwort im Datenmodell, nicht in der Nav — `branding.manage` an
die Themes-Seiten zu hängen hätte eine Mandanten-Grenze geöffnet, weil die
dortigen Tabellen dem Projekt gehören und nicht der Community. Erst die Frage
„wem gehören die Zeilen, die diese Seite schreibt?" ergab den Schnitt.
**Gelernt:** Ein Modul der Nav-Registry trägt genau EINE `requiredCapability` —
bei Geschwister-Rollen (Editor ⊥ Moderator) braucht deshalb jede Zielgruppe
ihren eigenen Eintrag; ein gemeinsamer stellte eine der beiden vor eine Wand.

### F2 — doppelter i18n-Schlüssel in der Mitgliederliste ✅ 2026-07-31

`members.role` war in de+en ZWEIMAL definiert (String-Spaltenkopf und Objekt
`role.done`). `JSON.parse` behält still den letzten — der Spaltenkopf „Rolle"
rendert dadurch als roher Key-Pfad. Objekt in `members.roleChange.*` umbenannt,
Nutzung nachgezogen. **Gelernt:** Weder `JSON.parse` noch `jq --stream` noch
ein Blatt-Pfad-Diff finden das, denn die Blätter heißen verschieden
(`members.role` vs. `members.role.done`) — es braucht einen Scanner über den
ROHTEXT, der Schlüssel pro Objekt zählt. Gegenprobe über alle 48 Locale-Dateien
des Repos: sonst keine Dubletten.

### C14 — Bild-Naht Schritt 2: `@nuxt/image` mit Appwrite-Anbieter ✅ 2026-07-31

**Zuerst gemessen, dann entschieden — die Messung hat den Default gedreht.**
Zwei Läufe: (a) sharp/libvips, also das, was `ipx` unter @nuxt/image auf dem
APP-Server täte, (b) Appwrite 1.9.6 selbst. sharp auf einem M1 Max: AVIF kostet
das **3- bis 24-Fache** an CPU (0,5 MP → 1280 px: 1348 ms CPU gegen 56 ms für
WebP; 2 MP: 2280 ms gegen 136 ms). Auf dem geteilten CX23/CX33 neben sieben
Apps ist das nicht vertretbar. Appwrite ist milder (1,0–3,0× Wanduhr, zweiter
Abruf ~5 ms aus dem Cache), aber der **Byte-Gewinn trägt den Aufpreis nicht**:
bei gleicher `quality` war AVIF nur unter ~q60 kleiner (10–40 %) und ab q78
sogar GRÖSSER als WebP. **Entscheidung: Default WebP, AVIF nur ausdrücklich je
Bild** (`format="avif"`), und `image.format: ['webp']` im Core-Layer, damit auch
`<NuxtPicture>` niemanden unbemerkt AVIF bezahlen lässt.

**Der Anbieter rechnet nichts.** Appwrite kann `/preview` mit
width/height/quality/output und cacht das Ergebnis — gegen die lokale Instanz
nachgemessen: `output` akzeptiert **jpg, jpeg, png, webp, heic, avif, gif**
(ein unbekannter Wert antwortet 400 und nennt genau diese Liste), Kante hart bei
4000 px. Der Anbieter ist deshalb ein reiner URL-Bauer; `ipx` (und damit `sharp`
samt der 26-teiligen `@img/sharp-*`-Plattform-Matrix) steht als
`ignoredOptionalDependencies` in `pnpm-workspace.yaml`. Netto neu im Lockfile:
**zwei** Pakete. Beide Prod-Builds (photos, comments) enthalten weder einen
`/_ipx`-Handler noch sharp.

**Gelernt (teuer, 188 Typfehler):** @nuxt/image referenziert die Typ-Vorlage
jedes EIGENEN Anbieters mit `{ nitro, nuxt, node, shared }` — die Anbieter-Datei
landet also in ALLEN VIER generierten tsconfigs, und in zweien davon gibt es
weder `#imports` noch die App-Auto-Imports. Ein `useRuntimeConfig` aus
`#imports` im Anbieter kostete 188 Fehler quer durch alle Layer, von denen nur
EINER auf die Anbieter-Datei zeigte; die anderen 187 sahen aus, als hätten die
Auto-Imports aufgehört zu funktionieren. Der Ausweg war zugleich die einfachere
Bauart: die URL, die `<NuxtImg>` bekommt, ENTHÄLT Endpoint und Projekt schon —
der Anbieter braucht überhaupt keine Konfiguration. **Ein Anbieter darf nur
importieren, was in jedem der vier Projekte existiert.**

**Gelernt (still und gefährlich):** `sizes="100vw"` OHNE Stufen-Präfix liest
@nuxt/image als Schlüssel `1px`, macht daraus eine Bildschirmbreite von 1 und
liefert ein srcset `1w, 2w` — ein 1-Pixel-Bild, ohne Fehlermeldung. Jede
Aufrufstelle schreibt deshalb `xs:100vw`; festgehalten in
`packages/core/tests/nuxtImageProvider.test.ts`.

**Umgestellt:** EventCard, EventDetail, Event-Formular (events), Medien-Tabelle
(media), Galerie-Raster und Hero (photos). Kein Layout verändert — nur `<img>`
zu `<NuxtImg>` plus `sizes`/`placeholder`. Statische Bilder (`about.vue`) und der
Core-Proxy `/api/storage/*` (admin) bleiben unangetastet: der Anbieter reicht
alles durch, was keine Appwrite-Storage-URL ist, und darf deshalb global der
Default sein. **Beweise:** 40 Unit-Tests, `pnpm -r test/typecheck/lint` und
`check:manifests`/`check:single-copy` grün, zwei Prod-Builds, und ein Lauf gegen
die lokale Appwrite, der die vom Anbieter gebauten URLs wirklich abruft (alle
Varianten 200, Content-Type und Maße geprüft, Testbild wieder gelöscht).
**Rest:** `srcset` in der Antwort von `/api/media` hat seither keinen Leser mehr.

### F3 — Kontolöschung räumt jetzt auch das Control Plane ✅ 2026-07-31

**Der Befund:** `deleteUserCompletely` räumt das Appwrite-Projekt der RUNTIME
ab. `community_members` und `community_invites` liegen aber im Control Plane —
einem anderen Projekt, auf das die Runtime nur einen read-only-Key hat. Nach
der Löschung eines Pool-Kontos blieb die Mitgliedschaft mit toter
`runtimeUserId` stehen, und — der eigentliche Punkt — die E-Mail-Adresse der
Person unbefristet in jeder Einladung an sie. Eine userId ohne Konto ist ein
Pseudonym ohne Auflösung; eine E-Mail ist ein Personenbezug.

**Gelöst über die BESTEHENDE Service-Naht**, keine neue Vertrauensfläche: zwei
Routen im Control Plane (`/api/control/community/members/user-data` und
`…/user-erase`, Gate = Service-Secret) plus ein GDPR-Contributor `onboarding`
in dem Layer, dem die Naht gehört (A14 — dieselbe Stelle wie der
Beitritts-Handler). Silo-Apps ohne onboarding bekommen keinen Contributor, und
das ist richtig: dort gibt es keine Mitgliedschaften.

**KEIN JWT, anders als bei allen anderen community-Routen.** Das ist die
einzige Möglichkeit, nicht eine Aufweichung: beim Aufruf ist das Konto gerade
gesperrt und verschwindet gleich — bei einem Betreiber-Auftrag oder einem
Re-Run nach Teilfehler existiert es womöglich gar nicht mehr. Ein JWT zu
verlangen hieße, die Löschung genau dann zu verweigern, wenn sie am nötigsten
ist (derselbe Schnitt wie bei `feedback/user-erase`). Identität ist das Paar
(runtimeProjectId, runtimeUserId), und alles wird hart darauf gescopt —
dieselbe userId in zwei Projekten sind zwei Menschen.

**Die Letzter-Owner-Regel** (pure, `decideMembershipErasure`, 7 Tests): der
Regelfall ist LÖSCHEN — an einer Mitgliedschaft hängt kein fremder Kontext.
Die einzige Ausnahme ist der letzte Owner einer AKTIVEN Community; dort bleibt
die Zeile als Struktur stehen, aber ohne Personenbezug (E-Mail geleert), und
jeder solche Fall reist im KLARTEXT (Community-Name + Rolle) in die Antwort
und ins Log — der Betreiber muss wissen, welche Community einen verwaisten
Owner-Platz hat. Verweigern wäre falsch (das Löschrecht hängt nicht daran, ob
jemand erbt), einfach löschen auch (dann hätte die Kontolöschung von hinten
aufgehoben, was „Zugang entziehen" von vorn verbietet). Ein Test nagelt beide
Wege aneinander: was `decideRemoval` als `last_owner` sperrt, bleibt hier
stehen.

Einladungen werden HART gelöscht (der Personenbezug einer Einladung IST die
Adresse — ohne Empfänger ist der Token-Hash wertlos) und über die Community
auf das rufende Projekt eingegrenzt, weil `community_invites` keine
`runtimeProjectId` trägt. Die Adresse geht nur mit, wenn sie BESTÄTIGT ist:
eine unbestätigte gehört nachweislich niemandem. Export degradiert bei
unerreichbarer Naht auf leer, Löschung NICHT — sie scheitert laut, damit das
Voll-Erfolgs-Gate von `deleteUserCompletely` greift.

**Gelernt:** Ein GDPR-Contributor gehört dorthin, wo die NAHT zu den Daten
liegt, nicht dorthin, wo die Tabelle steht — sonst müsste ein Fundament-Layer
ein Produkt kennen. **Gelernt:** Wenn eine Löschregel und eine Verwaltungsregel
dieselbe Sache schützen, müssen sie dieselbe pure Funktion benutzen oder
aneinander getestet sein; zwei Wege zu einer Community ohne Owner sind einer zu
viel.

**Nachtrag (2026-07-31):** die drei dokumentierten Reste des Befunds sind zu.
(1) **`community_invites.invitedBy`/`acceptedBy` gekappt** — das sind die
Spuren, die ein Konto in FREMDEN Einladungen hinterlässt (wer eingeladen, wer
angenommen hat); die Zeile gehört jemand anderem und bleibt, nur der Verweis
fällt auf `''`. Gefahrlos, weil beide Spalten im ganzen Repo KEINEN Leser haben
(nur Schreibstellen in `invite.post.ts`/`accept.post.ts` — die Mail nennt den
Einladenden aus `invitedByName` im JWT). Eine pure Regel
(`inviteReferenceErasure`, 5 Tests) sagt, welche Felder ein Update anfasst;
pauschales Leeren hätte die Spur eines Unbeteiligten mitgelöscht. Idempotent per
Konstruktion, weil `''` die Abfrage nicht mehr trifft. (2) **`invite_requests`
in Auskunft UND Löschung** — der Personenbezug einer Early-Access-Anfrage ist
die Adresse PLUS der Freitext („Wofür willst du Pukalani nutzen?"), und der
Prune-Sweep räumt bewusst nur `declined` (30 d) und `redeemed` (90 d) ab: eine
OFFENE Anfrage lag bisher unbegrenzt da, gerade weil auf sie noch niemand
geantwortet hatte. Gescopt allein über die BESTÄTIGTE Adresse — die Tabelle
trägt keine Projekt-Spalte, sie entsteht vor jeder Community. (3) **Die
kaufmännische Frage ist ein eigener offener Punkt geworden** (F8): nach der
Kontolöschung des Owners bleiben `communities.stripeCustomerId`/`billingStatus`
bewusst stehen, weil die Letzter-Owner-Zeile nur entpersonalisiert wird — ob das
so bleibt (Aufbewahrungspflicht) oder eine Frist bekommt, ist Davids
Entscheidung und keine, die eine Löschroutine still trifft.

**Gelernt:** Eine Spalte ohne Leser ist trotzdem ein Datum. „Wird nirgends
angezeigt" beantwortet die Frage, ob das Kappen weh tut — nicht die Frage, ob
die Zeile dauerhaft auf eine gelöschte Person zeigen darf.

### F4 — Gäste schreiben nur, wo Gäste lesen dürfen ✅ 2026-07-31

**Der Befund (C18-Kante):** eine Gast-Kommentar-Row bekommt beim Anlegen
`withPublishedRead()`, und in einer Community mit Publikum 'members' ist das
`read(label:<communityId>)`. Ein Gast trägt kein Label — er sah nach dem
nächsten Seitenaufbau weder seinen eigenen Beitrag noch irgendeinen anderen.

**Die POST-Response-Lösung trägt nur die halbe Strecke** und war schon da: der
Store hängt die Antwort des POST per `upsertRow` in den lokalen Zustand, der
Gast sieht seinen Kommentar also sofort. Das ist bei Gästen keine
Bequemlichkeit, sondern das Einzige, was funktioniert — ein Nachladen der Liste
brächte ihn nicht zurück. Es hilft aber nur bis zum Neuladen; danach schrieb
der Gast nachweislich in ein Loch.

**Die kleinste ehrliche Lösung ist deshalb, die Frage vorn zu stellen:** Gäste
schreiben genau dort, wo Gäste auch LESEN dürfen. Eine pure Regel
(`guestCommentsAllowed`, 5 Tests) mit zwei Konsumenten — die Route antwortet
404, die Ansicht zeigt den Composer nicht. Liefen sie auseinander, stünde ein
Formular da, dessen Absenden garantiert scheitert.

Verworfen: `read(any)` auf der Gast-Row (macht die geschlossene Community genau
dort auf, wo jeder Fremde schreiben darf) und ein kurzlebiges
Sichtbarkeitsfenster (eine Permission, die wieder verschwindet, ist eine zweite
Wahrheit über dieselbe Zeile).

**Gelernt:** Der alte Kommentar im Anlegepfad nannte den Widerspruch schon
richtig, verwies aber auf einen Schalter, der ihn nicht auflösen kann:
`pukalani.comments.embed.guests` gilt für die INSTANZ, `audience` je COMMUNITY
— im Pool hätte der Betreiber Gast-Kommentare nur für ALLE Communities
abschalten können. Ein Rat, der in der beschriebenen Situation nicht befolgbar
ist, ist keine Dokumentation eines bewussten Verhaltens, sondern ein offener
Befund.

### F6 — type-only-Imports in alten Migrationen ✅ 2026-07-31

Bereits behoben vorgefunden: alle Migrations-Ordner linten fehlerfrei (die
parallele Session hat die Imports mit ihrem Index-Race-Retry-Refactor
mitgezogen). **Gelernt:** Funde vor dem Fixen erst REPRODUZIEREN — in einem
Repo mit parallelen Sessions altern Befunde in Stunden.

### C5 + C2 — Seitentitel + Nav-Tarif-Gate ✅ 2026-07-31

C5: 26 titellose Dashboard-Seiten über 7 Layer (Audit sagte 17/3 — Zahlen
altern) + verify/join, exakt im Bestandsmuster (useHead/useBrandTitle), ein
einziger neuer i18n-Key. C2: planProduct-Feld in der Nav-Registry (Name aus
dem Chrome-Vertrag — kein zweites Wort für dieselbe Frage), Gate an der
EINEN Filterstelle, an planAllowsProduct genagelt (dieselbe pure Funktion
wie der Server); Nicht-Pool unverändert; +7 Tests. **Gelernt:** Undefined-
Behandlung gehört IN die pure Regel, nicht an jede Aufrufstelle — der
Testfall planOn=false hat den vergesslichen Aufrufer sofort reproduziert.

### C3 + C4 — Kompositionen und Nav-Einträge in ihre Layer ✅ 2026-07-31

Events-/Kurs-Kompositionen aus apps/comments in den blueprint-Layer (Pool
und Silo identisch — platform zeigt die Einträge jetzt ERSTMALS, obwohl es
die Layer längst zog: der C4-Gewinn); Nav-Einträge in ihre Produkt-Layer,
Dedup strukturell (Objekt-Map, Key = Id). **Gelernt:** Beim Umzug einer
Komposition reist jeder fest verdrahtete APP-Pfad mit und wird woanders zur
Lüge — der Ticket-Checkout-Pfad wurde ein expliziter Config-Vertrag
(pukalani.events.ticketCheckoutPath, leer = fail-closed „Bald verfügbar").


### F1 — leere Fehler-Beschreibungen (statusMessage) ✅ 2026-07-31

Bereits behoben vorgefunden: der C12-Commit (`7bf22c92`) hat die vier
gemeldeten Stellen mitgenommen — in `packages/{comments,pages,media,admin}`
steht heute NULL `statusMessage`. Nachgemessen repo-weit: die einzigen
verbliebenen Vorkommen sind die sieben Betreiber-Stellen in
`packages/control` (invites 2×, tenants, websites 3×, requests) und die
tragen alle schon den Fallback (`statusMessage || t('…Hint')`); `requests.vue`
lässt die Beschreibung bei 502 bewusst leer, weil der Titel dort die Ursache
nennt. Die Regel, die daraus überlebt: **Kunden-Dashboard = nur übersetzter
Text** (ein englischer Entwickler-Satz sagt dem Community-Betreiber nichts),
**Betreiber-Konsole = `statusMessage` vorn, übersetzter Fallback dahinter**.
Beides steht als Begründung IN den Dateien (embed.vue, media.vue, pages.vue,
system.vue, products.vue), nicht nur hier. **Beweise:** `pnpm -r test`
(51 Suiten), `check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die
6 bekannten Warnungen), plus eine statische i18n-Gegenprobe: 2877 Keys in de
und en, keiner nur auf einer Seite, jeder statisch auflösbare `t()`-Key der
fünf Pakete in beiden Sprachen vorhanden. **Gelernt:** Eine „Rest"-Zeile, die
MITTEN in der Ausführung des Elternpunkts geschrieben wird, ist am Ende oft
schon miterledigt — vor dem Fixen reproduzieren (dieselbe Lektion wie F6).

### C7 — App-Icon je Community ✅ 2026-07-31

`/icon/<key>.png` (512, `?size=180` für iOS' `apple-touch-icon`): randlose
Kachel in der Basisfarbe der Community + Initiale, gerastert ohne Renderer im
Betrieb aus demselben gebackenen Zeichensatz wie die Vorschau-Karte. Gate
`pukalani.seo.tenantAppIcon` (Core-Default AUS, platform AN), verdrahtet an
der EINEN Stelle, an der schon Favicon und og:image hängen
(themes/app/plugins/theme.ts). Die Karten-Zeichenwerkzeuge sind dafür nach
`shared/brandRaster.ts` gewandert — statt einer zweiten Kopie hat jetzt auch
das Icon dieselbe Fläche, Mischung und Glyphen-Skalierung. Neu darin ist das
VERGRÖSSERN (der Atlas ist bei 72 px gebacken, ein 512er-Icon will ~300 px):
bilinear plus Steilerstellen der Deckung um 0,5, gedeckelt auf Faktor 2.
Anders als das og:image bleibt das Icon auf „nur für Mitglieder"-Communities
ERREICHBAR — begründet in der Route: es entsteht nur, wenn ein Mitglied die
Seite selbst auf seinen Home-Bildschirm legt, liegt danach ausschließlich auf
dessen Gerät und trägt nichts nach außen (anders als eine Vorschau in fremden
Chats, C18). **Beweise:** 15 neue Tests (Maße + PNG-Magic-Bytes je Größe,
Größen-Allowlist, Schlüssel-Trennung zur Karte), `pnpm -r test`,
`check:manifests`, `pnpm -r typecheck`, `pnpm -r lint` (die 6 bekannten
Warnungen), dazu drei gerenderte Muster angesehen. **Gelernt:** Zwei Dinge
kamen erst durchs Hinsehen. (1) Der Test „Icon-Schlüssel ≠ Karten-Schlüssel"
schlug fehl — beide Versionszahlen standen auf 1, der gemeinsame Hash lieferte
denselben Wert; ein Namensraum ('icon') macht die beiden Gestaltungs-Stände
wirklich unabhängig. (2) Die erste Kanten-Steilheit (Faktor 2,7) sah in der
gerenderten Datei am „C" wellig aus: Steilerstellen verstärkt nicht nur die
Kante, sondern auch die Ungenauigkeit der Vorlage. Ein PNG-Test prüft Maße und
Magic Bytes — wie es AUSSIEHT, sieht nur, wer es ansieht.

### C12b — die Fehlerseite eines unbekannten Hosts sagt jetzt die Wahrheit ✅ 2026-07-31

Wer sich vertippt (`tippfehler.pukalani.app`), bekam eine Seite mit der
Überschrift **„500 - Unknown host"** über einer Antwort, die korrekt **404**
war: falsche Zahl, dazu Betreiber-Jargon vor einem Besucher.

**Wie die 500 zustande kam** (nachgelesen im Modul-Code, nicht geraten): der
404 fällt in der SERVER-Middleware `core/server/middleware/00.tenant.ts`, also
vor dem Renderer. Nuxts Fehler-Handler rendert die Fehlerseite über einen
INTERNEN Request auf `/__nuxt_error` (`localFetch`,
`@nuxt/nitro-server/dist/runtime/handlers/error.mjs`) — der lief durch dieselbe
Middleware, mit demselben unbekannten Host, und warf wieder. Für genau diesen
zweiten Durchgang schaltet Nuxt seinen Renderer bewusst ab
(`event.path.startsWith('/__nuxt_error') ? null : localFetch(…)`, sonst gäbe es
eine Endlosschleife) und fällt auf sein **eingebautes** Template zurück
(`templates/error-500.mjs`). Dieses Template liest `status`/`statusText` —
Nitros Fehler-Body trägt aber `statusCode`/`statusMessage`
(`nitropack/dist/runtime/internal/error/prod.mjs`). `status` fehlt also, das
Template nimmt seinen eigenen Default **500**, während `statusText` durchkam
(`errorObject.statusText ||= error.statusMessage`). Daher exakt die Paarung
„500" + „Unknown host" über einer 404-Antwort.

**Gebaut:** eine pure Regel-Datei `packages/core/shared/unknownHost.ts`
(Statustext + fachlicher Code + `isErrorPageRenderPass` + `isUnknownHostError`),
die Middleware lässt den Renderpass durch (`/__nuxt_error`) und wirft sonst
weiter 404 — jetzt mit `data.code = 'unknown_host'`. `CoreErrorPage` macht
daraus den Besuchersatz „Diese Adresse gehört zu keiner Community." (de/en) und
zeigt statt „Zur Startseite" (das im Kreis führte) einen Ausweg auf die
Anbieter-Seite: neues Feld `pukalani.brand.homeUrl` (Core-Default leer,
`apps/platform` = `https://pukalani.app`). Ohne Mandant rendert die Seite mit
der Instanz-Voreinstellung — kein Community-Branding, korrekt, die Adresse
gehört ja zu keiner. Der Theme-Plugin-Fetch auf `/api/themes` läuft dort in
denselben 404 und ist bereits `.catch`-gesichert.

**Kein Loch:** `/__nuxt_error` beantwortet Nuxts Renderer nur für INTERNE
Requests (`'__unenv__' in event.node.req`, `handlers/renderer.mjs`) und wirft
für alles von außen selbst 404 — die Ausnahme in der Middleware kann also nur
die Fehlerseite rendern, nie eine ungescopte Route. Beweis: 7 neue Unit-Tests
`packages/core/tests/unknownHost.test.ts` (u. a. „beschönigt keinen 5xx" — ein
kaputter Resolver bleibt fail-loud). **Gelernt:** Wenn eine Middleware wirft,
wirft sie auch beim Rendern der Fehlerseite — der Renderpass ist ein eigener
Request und braucht eine bewusste Ausnahme. Und: eine gerenderte Fehlerzahl ist
kein Beweis für den HTTP-Status; hier stammten Zahl und Text aus zwei
verschiedenen Quellen.

### C8 — Suche in der internen Doku ✅ 2026-07-31

Die Zeile las sich als „gibt es nicht"; gemessen wurde etwas anderes. Die
Doku-Site (`docs/`, eigenständige Nuxt-Content-App) hatte die Suche seit dem
ersten Commit — `queryCollectionSearchSections('docs')` plus
`UContentSearch`/`UContentSearchButton`. Sie funktionierte auch: gegen den
gebauten Server geprüft (⌘K, Abschnitts-Treffer mit Brotkrumen und
Hervorhebung, Pfeiltaste + Enter springt auf `/features/uebersicht#feature-layers`).

**Was wirklich fehlte, war die Sprache:** Nuxt UI beschriftet seine eigenen
Bausteine ohne gesetzte Locale englisch — „Search…", „Type a command or
search…", „Theme", „No matching data" — auf einer durchgehend deutschen Doku.
Gesetzt ist jetzt `<UApp :locale="de">` (app.vue + error.vue, Import aus
`@nuxt/ui/locale`), womit die gesamte Oberfläche mitzieht, nicht nur die Suche.
Der doppelte Suche-Block (app.vue UND error.vue) steht als eine Komponente
`docs/app/components/AppSearch.vue` mit deutschem Platzhalter („Doku
durchsuchen …") und Dialog-Titel. Kein externer Dienst: der Abschnitts-Index
entsteht im Browser aus der lokalen Content-Datenbank (`server: false` — er hat
im SSR-Payload nichts zu suchen). **Beweise:** `pnpm --filter @pukalani/docs
build` grün, Header zeigt „Suchen… ⌘K", Suche nach „presence" liefert neun
Abschnitts-Treffer über drei Gruppen. **Gelernt:** Zweimal in einem Durchgang
hat die MESSUNG gelogen, nicht der Code. (1) Der erste „Klick tut nichts" war
ein Klick daneben — Screenshot-Koordinaten sind skaliert, Elemente gehören per
`ref` angeklickt. (2) Danach war die Seite plötzlich tot mit 404 auf
`_nuxt/*.js`: der alte Vorschau-Server lief noch, der neue starb still an
EADDRINUSE, und das Fenster lud neues HTML gegen alte Chunk-Hashes. Vor jedem
Beweis prüfen, ob der Server, den man misst, auch der ist, den man gebaut hat.

### M4 — Schlüssel-Verzeichnis für Silo-Communities ✅ 2026-07-31

Der letzte ~1 % aus Horizont 3. Der Wellen-Runner war schon fail-loud (fehlt
`~/.appwrite-secrets/migrations/<projectId>.env`, bricht er ab, BEVOR er
irgendetwas migriert — keine halbe Welle); was fehlte, war der Blick VORHER.
Gebaut ist deshalb genau ein Betreiber-Skript,
[`packages/control/scripts/list-silo-keys.ts`](../packages/control/scripts/list-silo-keys.ts):
es liest das Community-Register des Control Plane und den lokalen
Schlüssel-Ordner und sagt je Silo-Projekt, in welcher Welle es steht, welche
Hosts daran hängen und ob seine Migrations-Env bereitliegt. Aufruf
`node --experimental-strip-types --env-file=apps/control/.env
packages/control/scripts/list-silo-keys.ts [--wave <welle>] [--keys-dir
<ordner>]`; Exit 1, wenn ein Projekt den Lauf blockieren würde — damit taugt
es auch als Vorabprüfung vor `pnpm migrate --wave` (im Runbook
[DEPLOYMENT.md 2b](runbooks/DEPLOYMENT.md) verlinkt).

**Bewusst klein gehalten:** kein Schreiben (weder DB noch Ordner), keine neue
Tabelle, keine Schlüssel in Appwrite — und **nie ein Wert auf stdout**. Es
meldet nur „Datei da / Pflicht-Variable gesetzt"; die einzige Ausnahme ist die
`projectId` aus der Datei (kein Geheimnis), denn eine vorhandene Datei, die auf
ein ANDERES Projekt zeigt, kommt durch die Existenzprüfung des Runners und
migriert dann die falsche Instanz. Die Wellen-Zuordnung kommt aus derselben
puren Regel wie der Lauf (`siloProjectsForWave` — `''` = stable, disabled zählt
mit, Projekte dedupliziert); ein Verzeichnis, das anders gruppiert als der
Lauf, wäre wertlos. Deshalb ist es auch `.ts` neben `list-silo-tenants.ts` und
kein `.mjs`: sonst stünde die Regel ein zweites Mal im Repo.

**Keine UI.** Die Betreiberseite läuft auf dem SERVER, die Schlüssel liegen auf
Davids Rechner — eine Spalte „Schlüssel vorhanden" könnte dort nur raten. Ein
Verzeichnis, das an der falschen Stelle nachsieht, ist schlimmer als keines.

**Nicht gebaut, bewusst:** der DYNAMISCHE Silo-Admin-Zugriff zur Laufzeit
(fremdes Projekt → fremder Key) bleibt bei seinem 501 in
`core/server/lib/appwrite.ts`. Das ist eine Sicherheitsentscheidung (ein
Server, der fremde Admin-Keys hält), kein Verzeichnis — und sie hat heute
keinen Konsumenten: kein fremder Silo-Host wird von der Platform-App bedient.

**Beweis (lokale control-Instanz):** leeres Register → „Keine Silo-Communities
im Register", Exit 0. Mit drei Wegwerf-Zeilen (zwei Hosts auf EIN Projekt,
eine Zeile mit `wave: ''`) und einem Wegwerf-Ordner: Welle `canary` zeigt
`m4probe-a` als bereit, Welle `stable` fasst beide Hosts unter `m4probe-b`
zusammen (also `''` → stable UND Dedup bewiesen) und meldet an einer
absichtlich kaputten Datei alle drei Befunde auf einmal — fehlende
`NUXT_PUBLIC_APPWRITE_DATABASE_ID`, kein Migrations-Key, falsche `projectId` —
Exit 1. Leerer Ordner → „Datei fehlt" + erwarteter Pfad. Wegwerf-Zeilen
danach gelöscht (Register wieder bei den drei Pool-Zeilen).

**Ehrlicher Ist-Stand:** produktiv listet das Verzeichnis heute NICHTS, und
das ist richtig — es gibt keine fremden Silo-Kunden. Die Einzel-Instanzen
`comments`/`portfolio`/`photos` stehen nicht im Community-Register und
migrieren über `pnpm migrate --app <app>`, nicht über Wellen (s. E5).
**Gelernt:** Ein Vorab-Check darf nicht bloß prüfen, ob eine Datei DA ist —
der Wellen-Runner tut genau das, und eine falsch befüllte Datei besteht diesen
Test und migriert danach die falsche Instanz. Anwesenheit ist keine Eignung.

### E7 — der lokale Playwright-Hang ist weg ✅ 2026-08-01

**Was war:** auf macOS beendeten sich die Playwright-Worker nach grünen Tests
nicht. Playwright force-killte sie nach 300 s und zählte das als Fehler
AUSSERHALB jedes Tests — Exit 1 trotz grüner Suite. Schlimmer: nach einem ROTEN
Test startet Playwright den Worker neu und wartet dabei auf den alten; ein Lauf
mit roten Baselines stand deshalb bei 21 von 24 Tests über 500 s still. In CI
trat das nie auf.

**Ursache (am 2026-07-31 belegt):** der Worker ist längst fertig (Event-Loop
leer, Stack in `kevent`), hängt aber an zwei offenen `net.Socket`-Handles —
stdout/stderr des Browsers. Ein Start von System-Chrome (`channel: 'chrome'`)
weckt auf macOS den `GoogleUpdater` (`--wake-all`), dessen
`--crash-handler`-Prozesse **erben genau diese beiden Deskriptoren**, reparenten
zu launchd (PPID 1) und schließen sie nie. Der Worker bekommt kein EOF. Über
Startflags war nichts zu machen: Playwright übergibt
`--disable-background-networking`, `--disable-component-update`,
`--disable-breakpad` und `--no-service-autorun` bereits, der Updater kommt
trotzdem.

**Die Kur (Davids Entscheidung):** `channel: 'chrome'` aufgeben, Playwrights
**gebündeltes Chromium** nutzen. Geändert: `apps/comments/playwright.config.ts`
(kein `channel` mehr), die 9 eingecheckten `-darwin`-Baselines der
Theme-Screenshots neu aufgenommen (Dateinamen unverändert — das Projekt hieß
schon vorher `chromium`), und in `.github/workflows/e2e.yml` ein eigener Schritt
`playwright install --with-deps chromium`, weil ubuntu-latest zwar Chrome, aber
kein Playwright-Chromium mitbringt.

**Beweis (eigener Dev-Server auf Port 3011, `PW_BASE_URL` gesetzt):** volle
Suite mehrfach — **24/24 grün, Exit 0, 23 s bzw. 26 s**, keine
`worker process did not exit`-Meldung, danach kein übrig gebliebener
Chromium-Prozess (`ps`/`lsof` sauber; der einzige „Google"-Treffer war Davids
eigener Browser, PPID 1, gestartet Wochen vorher). Vorher: 17+ Minuten.
Entscheidend ist der ROTE Fall: Läufe mit einem fehlgeschlagenen Test endeten
jetzt nach 69–83 s mit Exit 1 statt minutenlang stillzustehen — der Hang war
genau dort am teuersten und ist genau dort weg.

**Nebenbefund, NICHT von diesem Wechsel:** `embed-write.spec.ts` fällt bei
Playwrights Standard-Arbeiterzahl (hier 5) reproduzierbar durch, bei 1 oder 2
Arbeitern nie. Gegenprobe mit System-Chrome: fällt genauso durch — also
Parallel-Last, kein Browser-Problem (auf dieser Maschine liefen zusätzlich drei
Dev-Server fremder Arbeitsbäume). Als Fund gemeldet, noch nicht eingeplant.

**Gelernt:** Ein Prozess, der „nicht beendet", muss nicht selbst beschäftigt
sein — es reicht, dass ein FREMDER Prozess seine Pipes geerbt hat. Rezept für
das nächste Mal: im hängenden Worker `process._getActiveHandles()` ausgeben
(zeigt die offenen Sockets), dann per `lsof` den PEER derselben Socket-Inode
suchen — steht dort ein fremder Prozessname statt `/dev/null`, ist der Erbe
gefunden. Und: die Suche nach „welches Startflag schaltet das ab" war die
falsche Frage; abschaltbar war nicht der Updater, sondern die Entscheidung,
überhaupt System-Chrome zu starten.

### B7 — Dunkles Design für die Landingpage ✅ 2026-08-01

**Davids Entscheidung am Morgen: Ja** (zusammen mit B4 → Variante a). Die
Hell-Klemmung bestand aus DREI Teilen und alle drei mussten fallen:
`preference: 'light'` in der Config, ein `pages:extend`-Hook, der jeder Seite
`colorMode: 'light'` aufzwang (schlug sogar gespeicherte Besucher-Wahlen), und
— der eigentliche Grund — ein `marketing.css` ohne `.dark`-Zweig. Jetzt:
System-Präferenz entscheidet (`fallback: 'light'` hält Crawler/OG-Scraper
hell), die Licht-Dramaturgie läuft im Dunkeln „eine Oktave tiefer" (dieselben
acht HSL-Tripel, dunkel), Akzente drehen über die `--ui-color-primary-*`-
Stufen statt über ~30 Klassen-Änderungen. Umschalter (Hell/Dunkel/System) in
der Fuß-Basiszeile neben dem Sprachwähler; Auslöser-Icon bewusst fest, weil
SSR-gerendert (Hydration-Mismatch). Kontrast-Fix am gefüllten CTA: eigene
Label-Variable, dunkel 8,4:1 statt 1,9:1. Hell blieb bis auf drei Haarlinien
unverändert. Beweis: 20 Screenshots (alle Sektionen + Unterseiten, hell+
dunkel), Tests 4/4, Typecheck, Lint-Baseline, Build grün.

**Gelernt:** Eine „Klemmung" hat selten nur eine Schraube — wer nur die
Config-Preference löst, bekommt eine halb-dunkle Seite mit erzwungenen
Ausnahmen. Erst alle Stellen finden, die denselben Zustand erzwingen, dann
gemeinsam lösen. Und: wenn EIN Wert zwei Aufgaben trägt (Ink = Text UND
Bandgrund), braucht der Dunkel-Zweig eine Trennung in zwei Variablen — sonst
zwingt eine Farbe die andere mit.

### B4 — Appwrite-Web-SDK erst bei Bedarf ✅ 2026-08-01

**Davids Entscheidung am Morgen: Variante (a)** — das Web-SDK (im Projekt nur
für Realtime erlaubt) verschwindet aus dem Initial-Bundle und wird erst
geladen, wenn wirklich abonniert wird. Variante (b) (spekulative
`prefetch`-Hints filtern) blieb bewusst liegen: sie hätte den
Navigations-Vorsprung nach dem Login gekostet.

Umgebaut wurde genau die Realtime-Schicht des Core:
`useRealtimeClient.ts` (Clients + geteilte `Realtime` hinter EINEM
`clientsPromise`), `useRealtimeRows.ts` und `usePresence.ts`. Aus den
statischen `import { … } from 'appwrite'` wurden `import type` (verschwindet
beim Kompilieren restlos) plus ein dynamisches `import('appwrite')` an genau
den drei Stellen, die SDK-Symbole brauchen. Race-Freiheit hängt am einen
`clientsPromise`: Config-Plugin, Themes-Plugin und Presence starten fast
gleichzeitig und bekommen denselben Socket, nie zwei.
`syncRealtimeAuth()` lädt bewusst NICHTS nach — ohne bestehende Clients gibt
es keinen Socket umzuauthentifizieren, und ein Login auf einer Seite ohne
Abonnement soll keine 75 kB nachziehen. SSR ist unberührt (Web-SDK ist
client-only, die `import.meta.server`-Guards standen schon).

**Bundle, gemessen am Produktions-Build (statischer Initial-Graph = Entry plus
alles, was von dort per `import` hängt und im Head als `modulepreload` steht):**

| App | vorher | nachher | Ersparnis |
|---|---|---|---|
| `comments` | 704.254 B roh / **247.145 B gzip** | 630.050 B roh / **222.428 B gzip** | −74.204 B roh / **−24.717 B gzip (−10,0 %)** |
| `marketing` | 613.732 B roh / **217.274 B gzip** | 541.545 B roh / **192.836 B gzip** | −72.187 B roh / **−24.438 B gzip (−11,2 %)** |

Der SDK-Chunk selbst wandert vom Preload-Graph in einen eigenen, nachgelagerten
Chunk: **75.458 B roh / 25.400 B gzip** — also nicht größer als der frühere
statische Anteil (76.279 / 25.653). Ein Prefetch-Hint entsteht dafür NICHT:
`vue-bundle-renderer` verlinkt nur `dynamicImports` der GERENDERTEN Module,
und der Chunk hängt an drei Composable-Chunks, nicht am Entry-Modul.

**Beweise, alle live und nicht angenommen:**
- comments-E2E **24/24 grün in 31,2 s, Exit 0** (inkl. `realtime.spec.ts`
  „serverseitig angelegter Kommentar erscheint live" und des Popup-Login-
  Flows) — gegen den Dev-Server dieses Arbeitsbaums.
- **Live-Theme-Morphen für Gäste funktioniert weiter:** in einem Fenster ohne
  Session (`document.cookie` ohne `a_session`) wurde `app_config.themeSettings`
  server-seitig auf `crimson` und danach auf `jade` gesetzt — beide Male sprang
  `<html data-theme>` ohne Reload mit, samt frisch eingehängter
  `/themes/<name>.css`. Danach auf `mist` zurückgesetzt.
- **Seite ohne Realtime-Konsumenten lädt kein SDK:** `help` (keine
  Appwrite-Instanz) zeigt im Netzwerk-Log null `appwrite`-Requests und null
  `/api/auth/realtime-token`.
- `pnpm -r test` (alle Pakete grün), `-r typecheck` Exit 0, `-r lint` mit den
  6 bekannten Warnungen, `check:manifests` konsistent.

**F11 ist damit NICHT miterledigt** (nachgemessen statt vermutet): auf
`marketing` feuert `/api/auth/realtime-token → 401` unverändert, weil das
Config-Plugin weiter bedingungslos abonniert. Die Zeile in OPEN-ITEMS ist
entsprechend präzisiert.

**Gelernt (zwei Stück):** (1) **Ein bequemer `loadAppwriteSdk()`-Helfer kostet
das Tree-Shaking.** Erste Fassung reichte den SDK-Namespace durch eine
Funktion — Rollup sieht dann nicht mehr, welche Exporte benutzt werden, und
der Chunk wuchs von 76 kB auf **148 kB** (Storage, Messaging, Functions, Teams,
Avatars kamen mit). Der Initial-Graph schrumpfte trotzdem, die Zahl sah gut
aus, und die Regression wäre unbemerkt geblieben, hätte man nur die
Ersparnis gemessen. Fix: jeder Konsument destrukturiert DIREKT am
`import('appwrite')` — und **auch ein `Promise.all([import('appwrite'), …])`
zerstört es wieder**, weil der Namespace in eine Funktion wandert. (2)
**`useRuntimeConfig()` muss vor dem ersten `await` gelesen werden.** Beim
Umbau auf async ist der Nuxt-Kontext nach dem ersten `await` weg; alle
Einstiegspunkte lesen die Config deshalb synchron und starten erst danach das
Lade-Promise. Und der Port-Fallback der Dev-Server hat wieder zugeschlagen:
`PORT=…` wirkt nicht, weil das `dev`-Script `--port` fest übergibt — comments
landete auf 3000, marketing auf 3002 (die Standard-Ports hielt ein fremder
Arbeitsbaum). Erste Log-Zeile lesen, sonst misst der Beweis fremden Code.

### M13 (Teil) — Testphase-Hinweis gebaut, /workspace-Umzug gegenstandslos ✅ 2026-08-01

**Testphase-Hinweis:** `communities.trialEndsAt` (control-016) existierte,
zeigte aber nirgends hin. Jetzt: pure Regel `trialNotice` in
`packages/control/shared/onboarding.ts` (sichtbar 7 Tage vor Ablauf bis 14
Tage danach — ohne Nachlauf-Grenze wäre es ein Dauer-Verkaufsbanner, weil der
Sweep nur `plan` senkt und das Datum stehen lässt), Wert reist durch den
bestehenden Mandanten-Resolver (kein Extra-Hop), Route
`GET /api/community/billing/trial` gegated auf `community.billing` (der
Vertragszustand geht Mitleser nichts an — Beweis: Gast 401, Fremder 403,
Moderator 403, Kontroll-Host 404). Gerendert über die NEUE Registry
`pukalani.admin.notices` (Bauart chrome.utilities) auf der Dashboard-
Übersicht, client-only (Text hängt an Date.now() — SSR wäre ein
Hydration-Bruch). Beweis: verify-trial-notice.mjs 15/15 (echter
Wizard-Abschluss, alle vier Zustände, vier Verweigerungen), Browser beide
Sprachen inkl. Singular/Plural.

**/workspace → my.*: nichts zu bauen.** `/workspace` fiel schon mit A6
(8b11edbc, 2026-07-31, Workspaces ersatzlos abgeschafft) und lag außerdem auf
control.pukalani.app, nie auf my.* — es gab weder ein Ziel für einen Redirect
noch Code-/Mail-/Stripe-Verweise (Inventar geprüft; nur zwei Doku-Stellen,
beide mit datierten Hinweisen markiert statt blind umgeschrieben). Dabei die
ECHTE Lücke gefunden: my.* hat keine Landeseite für Bestandskunden → F12
(am selben Tag gebaut, Eintrag unten).

**Gelernt:** (1) Ein Listen-Eintrag altert wie eine Diagnose — „Umzug
/workspace→my.*" beschrieb einen Zustand von vor A6; erst Bestandsaufnahme,
dann bauen (der „Umzug" wäre eine erfundene Entsprechung gewesen). (2)
Appwrite gibt Datetimes als `…+00:00` zurück, `toISOString()` schreibt `…Z`
— String-Vergleiche auf Datetime-Spalten sind ewig falsch, immer als
Zeitpunkt vergleichen. (3) Vertragszustands-Daten gehören nicht in den
SSR-Payload öffentlicher Seiten, auch wenn es bequem wäre.

### F12 — `my.pukalani.app` ist jetzt der Kundenbereich ✅ 2026-08-01

**Befund (aus M13):** `my.*` hatte keine Landeseite. `/` leitete auf JEDEM
Kontroll-Host hart nach `/start`, und weil `useAuthRedirect()` mangels
`?redirect=` auf `/` zurückfällt, landete auch der Post-Login-Redirect dort —
ein Bestandskunde wurde in seinem eigenen Kundenbereich mit „Neue Community
anlegen" begrüßt.

**Gebaut (Davids Entscheidung: Kunden-Übersicht mit Plan-Badge +
Testphase-Status).** `my./` zeigt „Deine Communities": Name, Adresse, eigene
Rolle, Plan-Badge, Testphasen-Hinweis; Klick → Handoff-Token → `https://<host>/
dashboard`, eingeloggt (dasselbe 60-s-Siegel wie am Wizard-Ende). Wer 0
Communities hat, wird weiter in den Wizard geschickt — für den Neukunden war
das alte Verhalten immer richtig. Ausgeloggt greift der bestehende Auth-Guard
und bringt danach auf die Übersicht zurück (`?redirect=`).

**Vier Entscheidungen, die den Bau tragen:**

1. **Zwei Kontroll-Hosts, zwei Aufgaben.** Neue Achse
   `pukalani.tenancy.wizardHosts` (Env `NUXT_PUBLIC_TENANCY_WIZARD_HOSTS`,
   Prod `['start.pukalani.app']`) statt „der erste `controlHost` ist der
   Kundenbereich" — eine Reihenfolge-Regel kippt beim nächsten Env-Override
   unbemerkt. Pure, unit-getestete Funktion `controlHomeTarget()` in
   `core/shared/controlCenter.ts`; ein `?code=` schlägt beides (weitergeleitete
   Einladungs-Mail auf `my.*` darf den Code nicht verlieren).
2. **Post-Login blieb unangetastet.** Der Redirect zeigt weiter auf `/`; dass
   `/` jetzt woanders hinführt, erledigt dieselbe eine Middleware. Kein
   zweiter Ort, an dem ein Ziel gepflegt werden muss.
3. **Kein neuer API-Präfix — bewusst geprüft, nicht übersehen.**
   `GET /api/onboarding/communities` fällt unter den schon eingetragenen
   Präfix `/api/onboarding/`, und der Grund der Allowlist (auf einem Host ohne
   Mandant scopt nichts) trifft hier nicht zu: die Route berührt keine Tabelle
   des Runtime-Projekts, sie mintet ein JWT und lässt das Control Plane
   antworten (`POST /api/control/community/mine`), das nur nach der Identität
   AUS diesem JWT sucht. Auf einem Mandanten-Host antwortet sie 404 — Route
   UND Seite, denn eine versteckte Seite sperrt keine Route.
4. **Karten statt `UTable`** (bewusste Abweichung von Davids Regel B6, im Kopf
   der Seite begründet): die Liste ist per Konstruktion kurz (eigene
   Communities auf 3 gedeckelt), jeder Eintrag ist ein SPRUNG AUF EINEN
   ANDEREN HOST statt ein Datensatz zum Vergleichen, und es ist das Erste, was
   ein Kunde nach der Anmeldung sieht — oft auf dem Telefon. Wo dieselben
   Daten zum VERWALTEN stehen (`/dashboard/members`), bleibt UTable.

**Die Testphase reist nur zum Zahlenden.** `trialEndsAt` steht in der Antwort
nur für Mitgliedschaften, deren Rolle `community.billing` trägt (heute:
owner) — dieselbe Grenze, die M13 für `/api/community/billing/trial` gezogen
hat. Der **Plan** dagegen steht für alle: er liegt ohnehin im SSR-Payload
jeder Community-Seite (`tenant-brand.server.ts` spiegelt ihn für
`planAllows()`), ihn hier zu verschweigen wäre eine Geheimhaltung, die einen
Klick weiter nicht existiert. Der Umschlag trägt exakt sechs Felder — kein
`stripeCustomerId`, kein `projectId`, kein `tenantId`.

**Beweis:** `packages/onboarding/scripts/verify-my-overview.mjs` **25/25** —
zwei echte Wizard-Communities, Alice sieht genau ihre beiden (Bobs nicht),
Bob nur seine, ein Konto ohne Mitgliedschaft nichts, ein **entferntes**
Mitglied (`status='removed'`) die Community NICHT; Owner mit Testphasen-Datum
vs. Viewer derselben Zeile mit `null`; Feld-Liste des Umschlags; Gast 401,
Mandanten-Host 404 (Route + Seite); alle sechs Wege von `/` (my./ →
Übersicht · 0 Communities → Wizard · ausgeloggt → Login mit `?redirect=` ·
start./ → Wizard · `?code=` auf beiden Hosts → Wizard mit Code). Dazu 6+4
Unit-Tests (`myCommunities.test.ts`, `controlCenter.test.ts`) und der
Browser-Beweis in beiden Sprachen. `pnpm -r test` grün, typecheck grün, lint
mit den 6 bekannten Warnungen, `check:manifests` konsistent.

**Gelernt:** (1) **Ein „Redirect-Ziel ändern" ist selten eine Zeile.** Die
ehrliche Frage war nicht „wohin zeigt `/`?", sondern „welcher Host ist das
hier?" — ohne die neue Achse hätte `start.pukalani.app` still seinen Zweck
verloren, und genau das wäre erst dem ersten Kunden aufgefallen, der den
Kurz-Link aus einer Bio anklickt. (2) **Eine Liste eigener Dinge ist trotzdem
eine Datengrenze.** Der erste Entwurf hätte Plan und Testphase pauschal
mitgeliefert; erst der Blick auf M13 zeigte, dass „diese Community testet
noch" eine Aussage über den Vertrag ist — und dass der Plan es NICHT ist. Wer
Felder aus einer Zeile in einen Payload hebt, muss jedes einzeln begründen.
(3) **Nuxt fasst verkettete Middleware-Weiterleitungen zu EINEM 302
zusammen** — `my./` ausgeloggt antwortet direkt `/login?redirect=/communities`,
nicht erst `/communities`. Ein Beweis, der auf die Zwischenstufe wartet, misst
etwas, das es nie gibt. (4) Ein Wegwerf-Skript im Scratchpad findet
`node-appwrite` nicht (pnpm-Store) — es muss im Paket-Verzeichnis liegen, das
die Abhängigkeit hat.

### F11 — Gäste holen keinen Realtime-Token mehr ✅ 2026-08-01

**Befund (B7-Fund, in B4 nachgemessen und ausdrücklich NICHT miterledigt):**
`packages/core/app/plugins/realtime-config.client.ts` abonniert `app_config`,
sobald eine App eine Datenebene hat. Jeder Abonnent ruft
`ensureRealtimeJwt()`, und das holte den Token für JEDEN — auch für einen
Besucher ohne Session. Auf der Marketing-Landing hieß das: **ein
`GET /api/auth/realtime-token → 401` pro Seitenaufruf**, für jeden Gast,
ohne jeden Nutzen.

**Was NICHT das Problem war — und deshalb bleibt:** der WebSocket selbst.
`read(any)`-Channels (`app_config`, `custom_themes`, öffentliche Kommentare)
liefern auch einem Gast Events; davon lebt das Live-Theme-Morphen für
Besucher (in B4 live bewiesen). Der Gast-WS ist Feature, nicht Restposten.
Gefixt wurde also genau der sinnlose Token-Abruf, nichts sonst.

**Die Lösung ist eine Bedingung an EINER Stelle** — der einzigen, die
`/api/auth/realtime-token` überhaupt ruft: `ensureRealtimeJwt()` in
`packages/core/app/composables/useRealtimeClient.ts`. Ohne erkennbare Session
kein Abruf und kein Refresh-Timer; der Socket verbindet als Gast weiter.
Erkannt wird die Session am **Auth-Store**, den `plugins/auth.server.ts` beim
SSR aus `event.context.user` stellt und der Pinia-Nuxt-Plugin im Browser aus
dem Payload zurückspielt — **ein sessionloser Erstbesuch weiß es also ohne
einen einzigen Request**. Das httpOnly-Cookie kann der Browser nicht lesen,
und ein `/api/auth/me`-Ping wäre nur derselbe 401 unter anderem Namen
gewesen.

**Der Login im offenen Fenster zieht nach** — über den Weg, den es schon gab:
`plugins/realtime-auth.client.ts` beobachtet `auth.user.$id`, ruft
`syncRealtimeAuth(true)`, das nullt den memoisierten `jwtPromise`, holt über
dasselbe (jetzt passierbare) Gate den Token und schließt den Socket einmal —
die SDK verbindet neu und re-subscribed alles selbst. Bewusst **nicht**
memoisiert wird die Gast-Antwort: sie wird bei jedem Aufruf frisch gelesen,
sonst bliebe ein Fenster nach dem Login dauerhaft Gast.

**Mitgenommen (dieselbe Wurzel, gleiche Datei):** der 12-Minuten-Refresh
wurde bisher bei jedem `ensureRealtimeJwt()`-Erststart neu angelegt und nie
angehalten. Weil `syncRealtimeAuth()` den `jwtPromise` bei JEDEM Auth-Wechsel
nullt, sammelte ein Tab mit mehreren Login/Logout-Runden **mehrere parallele
Timer** — und nach dem Logout tickten sie weiter gegen einen Endpunkt, der
nur noch 401 antwortet. Jetzt: genau ein Timer (`jwtTimer ??=`), angehalten
bei Logout und bei jedem Gast-Aufruf.

**Diff:** eine Datei, `packages/core/app/composables/useRealtimeClient.ts`
(Gate + Timer-Wächter + Kommentare). Kein Plugin, kein Aufrufer, keine
Route geändert.

**Beweise, alle live gemessen:**
- **A/B auf der Marketing-Landing (Gast, Dev):** mit deaktiviertem Gate
  reproduziert — `GET /api/auth/realtime-token → 401`. Mit Gate: **null**
  `/api/`-Requests überhaupt, während der SDK-Chunk (`deps/appwrite.js`)
  weiterhin geladen wird — die Subscription läuft also, nur der Token fällt weg.
- **comments als Gast:** null Token-Requests, Realtime-WS steht
  (`ws://localhost/v1/realtime?project=…`, **ohne** `jwt`), ein
  server-seitig angelegter Kommentar kommt live an.
- **Live-Theme-Morphen als Gast:** `app_config.themeSettings` von `mist` auf
  `forest` gesetzt → `<html data-theme>` springt ohne Reload mit
  (navigation-Einträge 1 → 1), dabei null Token-Requests.
- **Login im selben Fenster (SPA-Navigation, kein Reload):**
  `/api/auth/realtime-token → 200`, der Socket verbindet neu und trägt jetzt
  den Token in der URL (`…/realtime?project=…&jwt=eyJ…`), Presence-WS-Upsert
  ohne Warnung.
- **comments-E2E 24/24 grün in 29,6 s, Exit 0** (inkl. `realtime.spec.ts` und
  des Popup-Login-Flows) · **`verify-presence-boundary.mjs` 23/23** ·
  `pnpm -r test` alle grün · `typecheck` Exit 0 · `lint` mit den 6 bekannten
  Warnungen · `check:manifests` konsistent.

**Gelernt (vier Stück):** (1) **Der Beweis „kein Request" braucht den
Gegenbeweis.** Ein leeres Netzwerk-Log beweist genauso gut, dass der Code gar
nicht lief — erst der A/B-Lauf mit ausgeschaltetem Gate (401 da, 401 weg)
trennt „gefixt" von „nie ausgeführt". Dazu gehört der positive Beleg, dass
der abhängige Pfad noch läuft (SDK-Chunk geladen, Theme morpht). (2)
**`performance.getEntriesByType('resource')` puffert nur 250 Einträge.**
Genau daran wäre der erste Marketing-Beweis gescheitert: der SDK-Chunk lud
nachweislich, tauchte aber nicht mehr in der Liste auf — „also hat das
Abonnement nicht stattgefunden". Netzwerk-Messungen gehören auf die
Werkzeug-Seite (Playwright/DevTools), nicht in die Seite. (3) **`pnpm --filter
X dev -- --port N` kippt den Dev-Server in eine Attrappe.** Das `--` schiebt
`--port 3017` in `nuxi dev [rootDir]` als POSITIONALES Argument — Nuxt startet
mit rootDir `--port`, bindet einen Fallback-Port und liefert die
„Welcome to Nuxt"-Seite. Sah aus wie ein kaputter Build, war ein kaputter
Aufruf. Der Port lässt sich so nicht erzwingen; richtig ist `pnpm --filter X
dev` und dann die Zeile `[get-port] … Using alternative port …` lesen.
(4) **`verify-presence-boundary.mjs` braucht ZWEI Server:** ohne laufendes
`apps/control` (Port 3004) scheitern 7 der 23 Prüfungen an fehlenden
Site-Labels — der Beitritt ist ein Control-Plane-Vorgang. Das sieht nach
Regression aus und ist Umgebung; Akt 2 überspringt sich nur, wenn `platform`
fehlt, nicht wenn das Control Plane fehlt.

### D1 — Neubewertung: in F7 eingerückt ✅ 2026-08-02 (Davids Entscheidung)

Der Wartegrund „der Stripe-Webhook kennt den Community-Host nicht" war seit
S7+A6 sachlich überholt (die Zuordnung läuft über die Event-Row bzw.
metadata.communityId — der Webhook braucht nie einen Host; D5 löst die
GEGENrichtung und war hier irrelevant). Der echte Blocker stand nirgends:
ohne Stripe Connect landet das Ticketgeld eines Community-Events beim
BETREIBER, und der Owner bräuchte je Preis einen von David angelegten
lookup_key — kein selbstbedienbares Produkt. David: Nein zu
Betreiber-als-Verkäufer ⇒ D1 ist Teilstück von F7 (Events-Hälfte M,
Kurse-Hälfte L/XL — community-scoped Entitlements sind unentworfen).
Nebenbefund als F13: das Pool-Formular bietet „paid" an, obwohl der CTA
„Bald verfügbar" zeigt (am 2026-08-01 behoben — eigener Eintrag oben, samt
der gleichen Sackgasse bei den Kursen).

**Gelernt:** Ein geparkter Wartegrund altert wie eine Diagnose — er hat hier
einen D5-Verdacht erzeugt, der ins Leere lief. Geparkte Zeilen beim Erledigen
ihrer Nachbarn gegenlesen; und „technisch möglich" ist nicht „produktlich
sinnvoll": die Geldfluss-Frage (wer ist Verkäufer?) schlägt jede Verdrahtung.

### M13 (Rest) — Sperr-/Missbrauchspfad ✅ 2026-08-02 (Davids Entscheidungen)

Damit ist M13 vollständig; das letzte Stück war die Frage, die eine Plattform
irgendwann beantworten muss: **was passiert, wenn eine Community nicht zahlt
oder Schaden anrichtet?**

**Davids Entscheidungen (2026-08-02):** drei Auslöser — (1) der Betreiber
sperrt von Hand, mit protokolliertem Grund; (2) Zahlungsverzug automatisch
nach 14 Tagen; (3) eine GEPRÜFTE Missbrauchsmeldung von außen. Zwei Stufen —
`billing` macht die Community **nur-lesend** (Gäste und Mitglieder lesen
weiter, jedes Schreiben ist zu, der Owner sieht einen Hinweis mit dem Weg zur
Zahlung), `abuse` nimmt den **Host sofort komplett vom Netz** (404 wie eine
unbekannte Adresse, Inhalte bleiben nur dem Betreiber zugänglich). Entsperren
geht immer von Hand; eine ausgeglichene Zahlung hebt die billing-Sperre von
selbst auf.

**Migration control-034** (additiv): `communities.suspension` (''|billing|abuse)
· `suspensionReason` · `suspendedAt` · `pastDueSince`, dazu die Indizes
`idx_billing_status`/`idx_suspension` und die Tabelle `abuse_reports`
(permissions: [], wie invite_requests). BEIDE `createRow<TenantRow>`-Stellen
setzen die vier Felder explizit — die Migration muss vor dem Code-Deploy laufen.

**Warum eine eigene Achse neben `status`** (der 404et den Host auch): `status`
ist der LÖSCHWEG (C16) und lässt die Community aus der Kundenübersicht
verschwinden. Eine gesperrte muss dort BLEIBEN — sonst kann der Owner weder
zahlen noch erfahren, warum seine Adresse tot ist. Und `status` trägt weder
Grund noch Zeitpunkt.

**Durchgesetzt an genau zwei Stellen, keiner Route:**
- `abuse` ⇒ `mapTenantRowToContext()` liefert `null`. Damit fällt der
  BESTEHENDE C12b-Pfad an: 404 mit `unknown_host`, Seite wie API, ohne dass
  eine einzige Route davon weiß.
- `billing` ⇒ die DATENTÜR (`tenantDb`) weist `create/update/remove/
  increment/decrement/updatePermissions` für die Türklinke `'member'` ab —
  403 mit `data.code: 'community_suspended'`. Dieselbe Stelle wie der
  A5-Beitritt, und aus demselben Grund: „jede Route muss daran denken" hat
  sich am 2026-07-26 schon einmal als keine Regel erwiesen. `'operator'`
  bleibt offen, sonst nähme die Mahnung dem Betreiber die Moderation aus der
  Hand.
Die puren Regeln liegen in `packages/core/shared/communitySuspension.ts`
(fail-OPEN beim Lesen der Spalte: ein krummer Wert darf nie eine zahlende
Community vom Netz nehmen; die Schreibseite ist per Zod-Enum eng).

**Zahlungsverzug:** der Stripe-Webhook stempelt nur `pastDueSince` — und zwar
NUR beim ersten Mal (jedes weitere Dunning-Event würde die Frist sonst neu
starten und sie liefe nie ab). Gesperrt wird im stündlichen Sweep
(`runPastDueSweep`, mitfahrend im bestehenden trial-sweep-Plugin statt eines
zweiten Timers), aufgehoben in derselben Runde, sobald kein Verzug mehr
besteht — das ist das Netz unter dem Webhook, der die Sperre beim
`active`-Event sofort löst. `POST /api/control/sweeps/past-due`
(`sites.manage`) stößt ihn an, damit die 14-Tage-Automatik beweisbar ist,
ohne eine Stunde zu warten.

**Missbrauchsmeldung:** öffentliche Seite `/missbrauch-melden` (en
`/report-abuse`) ohne Anmeldung — wer meldet, ist fast nie Mitglied der
gemeldeten Community. Honeypot + Rate-Limit 5/min/IP + strenges Zod; der Host
wird pur normalisiert (ein voller Link ist erlaubt). Der Weg läuft über die
bestehende Service-Naht ins Control Plane (`/api/abuse` neu in
`controlApiPrefixes`, damit die Seite auf einem Kontroll-Host lebt — der
gehört niemandem und kann deshalb nie gesperrt sein). **Eine Meldung bewirkt
für sich NICHTS**: sie legt eine Zeile an und weckt den Betreiber. Sonst wären
fünf erfundene Meldungen eine Waffe gegen jede beliebige Community. Entschieden
wird in der Warteschlange `/dashboard/abuse` (UTable, `sites.manage`); der
Knopf „Community sperren" schreibt über dieselbe eine Sperr-Funktion, also
steht auch dieser Weg im `audit_logs`-Protokoll.

**Was der Kunde sieht:** ein Hinweis auf der Dashboard-Übersicht über die
M13-Registry `pukalani.admin.notices` (`order: 5`, vor dem Testphasen-Hinweis
— eine gesperrte Community ist die dringlichere Nachricht), Text = der Grund,
den der Betreiber getippt hat, Knopf → Abo-Seite. Der GRUND reist bewusst
NICHT im Mandanten-Kontext mit (er stünde sonst im SSR-Payload jeder
öffentlichen Seite und erzählte jedem Gast vom Zahlungsverzug), sondern kommt
über einen einzelnen, auf `community.billing` gegateten Service-Ruf — und nur,
wenn wirklich gesperrt ist.

**In „Deine Communities" (my.*):** billing-gesperrte Communities BLEIBEN mit
Hinweis stehen und sind klickbar (der Host läuft ja). Eine abuse-gesperrte
sieht **nur, wer abrechnet** (heute der Owner) — als Karte OHNE Link mit
Status-Text. Zwei Gründe: der Host ist offline, für alle anderen ist die
Community schlicht weg (dieselbe Erfahrung wie bei jeder abgeschalteten
Adresse); und „wegen Missbrauchs gesperrt" ist ein Vorwurf — den liest der,
an den er gerichtet ist, nicht seine zwanzig Mitglieder.

**Beweise:** `packages/onboarding/scripts/verify-community-suspension.mjs`
**50/50** (echter Wizard-Abschluss; billing: Gast liest 200 / Mitglied-POST 403
mit `reason` / Owner sieht Banner-API samt Text / Mitglied 403 / Moderation
offen; abuse: Seite UND API 404 als `unknown_host`, selbst für den Owner;
Meldeformular bleibt erreichbar; Übersichts-Karten; Betreiber-Route 401/403/400
ohne Grund + Protokoll; Sweep 13 vs. 15 Tage mit injizierter Zeit, Idempotenz,
automatische Aufhebung, abuse unangetastet; Meldeformular ohne Konto inkl.
Honeypot und Warteschlangen-Kanten). Dazu 3 neue Unit-Dateien (core
communitySuspension, control pastDueSuspension + abuseReports) und erweiterte
Bestandstests. `verify-site-authz` **97/97** unverändert;
`verify-my-overview` **27/27** (war 25/25 — der Umschlag-Whitelist-Test kannte
`suspension` noch nicht, plus zwei neue Prüfungen). Browser: Sperr-Dialog und
„nur lesen"-Abzeichen in der Communities-Liste, Missbrauchs-Warteschlange,
öffentliches Meldeformular, roter Owner-Hinweis im Dashboard einer gesperrten
Community.

**Gelernt:** (1) **`toH3Error()` verschluckte fachliche 4xx.** Die
Aufrufstellen sehen fast alle so aus: `await db.create(…).catch(e => { throw
toH3Error(e, '…') })` — das `.catch` fängt also auch die bewussten Fehler der
DATENTÜR. Aus dem 403 der Sperre wurde ein 500 „interner Fehler": der Server
wies korrekt ab und log dem Client dabei. Behoben, indem ein bereits fertiger
H3-Fehler unverändert durchgeht. Wer eine Regel in eine geteilte Naht legt,
muss prüfen, was die Aufrufer mit ihren Fehlern machen. (2) **Ein Beweis nach
einem Datei-Edit misst unter Umständen den alten Server.** Ein Lauf war rot,
weil Nitros HMR nach der `appwriteError.ts`-Änderung mit einem halb alten
Bundle antwortete — derselbe Lauf war ohne jede Codeänderung sofort grün. Nach
einer Änderung an `server/utils/**` erst den Dev-Server durchatmen lassen (oder
neu starten), sonst debuggt man eine Regression, die es nicht gibt. (3)
**Die Frist braucht eine eigene Spalte.** `pastDueSince` aus `$updatedAt`
abzuleiten wäre bequem und falsch: der Webhook schreibt bei jedem
Dunning-Versuch, die 14 Tage begännen jedes Mal von vorn und liefen nie ab.
(4) **Zeit im Beweis injizieren, nicht abwarten.** Der Sweep rechnet gegen eine
Spalte — 13 Tage und 15 Tage sind zwei `updateRow`-Aufrufe und eine
Sekunde Laufzeit; „eine Stunde auf den Timer warten" wäre kein Beweis, sondern
eine Hoffnung.

### Quer-Audit-Befunde gefixt ✅ 2026-08-02

Sechs Befunde aus dem Quer-Audit über den frisch gebauten M13-Pfad, alle vorher
am Code reproduziert, dann behoben. Der Reihe nach:

**1 (HIGH) — Der gemeldete Link lief roh in ein `href`.** `abuse.vue` rendert
`:href="row.original.url"`; auf dem ganzen Weg dorthin (öffentliche Route →
Service-Naht → Zeile → Projektion) prüfte niemand mehr als `max(500)`. Ein
`javascript:`-Wert wäre damit **einen Klick des Betreibers** von fremdem Code im
control-Origin **mit `sites.manage`-Session** entfernt gewesen; `target="_blank"`
hilft dagegen nicht, weil ein `javascript:`-Ziel gar kein neues Fenster öffnet.
Gefixt auf ALLEN Stationen: neue pure Regel `isDisplayableReportUrl` /
`normalizeReportedUrl` (`packages/control/shared/abuseReports.ts`) — sie räumt
erst \t\r\n **überall** und C0-Leerraum an den Rändern weg (Browser tun genau
das, bevor sie das Schema lesen: `java\nscript:` **ist** `javascript:`) und
parst dann mit `new URL()`, statt einen zweiten, eigenen Parser zu erfinden.
Beide Eingänge (`abuse/report.post.ts`, `control/abuse-reports/index.post.ts`)
normalisieren jetzt; ein unbrauchbarer Link **leert nur das Feld** und weist die
Meldung nie ab — der Fließtext ist der wertvolle Teil. Die Warteschlange macht
zusätzlich nur dann ein `<a>`, wenn dieselbe pure Regel zustimmt, sonst steht
der Wert als Text da (Bestandszeilen von vor dem Fix). **Entscheidung, festgehalten:
`url` ist BELEG, der Klick nur KOMFORT** — deshalb bleibt der Wert vollständig
lesbar, auch wenn er nie klickbar wird.

**2 (MEDIUM) — `/api/onboarding/communities` ohne Deckel.** Jeder Aufruf prägt
ein Appwrite-JWT und lässt danach zwei Tabellen über zwei Projekte lesen — die
Kostenklasse der `realtime-token`-Route, die schon auf 10/min stand. Gleicher
Deckel (`TOKEN_MAX`), eigener Bucket.

**3 (MEDIUM) — Der Zahlungsverzugs-Sweep kappte still bei 100.** Beide Schleifen
lasen `Query.limit(100)` ohne Pagination. Nach oben fehlte damit nur eine
verspätete Sperre — nach **unten** blieb jemand gesperrt, der längst bezahlt
hat, und niemand hätte es gemerkt: genau die Hälfte, die das Netz unter dem
Webhook ist. Neu: `collectPastDueWork()` sammelt beide Vorräte über den
hauseigenen `listAllRows` (Cursor bis zur Teilseite, wirft bei 50.000 statt
unvollständig zurückzukehren). **Erst lesen, dann schreiben** ist dabei keine
Stilfrage: der Lauf ändert genau die Spalten, nach denen er filtert — eine
bearbeitete Zeile verlässt die Ergebnismenge und verschöbe alles Nachfolgende.

**4 (LOW) — Mail-Links zeigten auf abuse-gesperrte Hosts.** `communityHostResolver`
kannte nur `status`, weil die Sperre nach ihm gebaut wurde. Jetzt fällt
`suspension === 'abuse'` genauso durch wie `disabled` (der Host ist komplett
offline, der Link wäre eine 404-Sackgasse). `billing` bleibt bewusst drin: dieser
Host **lebt**, nur-lesend, und der Link führt genau richtig. Gefiltert wird im
Code statt per `Query.notEqual` — die Spalte ist optional, und ein SQL-`!=`
sortiert NULL gleich mit aus, womit der Resolver für Bestandszeilen gar nichts
mehr fände.

**5 (LOW) — Mitgliedschafts-Seite ohne `status`-Filter.** `community/mine.post.ts`
holte 50 Zeilen und siebte **danach**: wer aus mehr als 50 Communities entfernt
worden war, bekam eine leere Übersicht, obwohl er anderswo aktiv ist. Der Filter
steht jetzt in der Abfrage, wie bei der Schwester `suspension.post.ts`. Damit
das Literal `'active'` ehrlich bleibt, ist `hasCommunityAccess` neu festgenagelt.

**6 (LOW) — `reporterEmail` reiste in den Browser,** obwohl die Warteschlange sie
nirgends rendert. Aus dem Umschlag genommen; sie steht weiter in der Zeile und in
der Alarm-Mail, wo sie gebraucht wird. (Ihre Löschfrist bleibt offen — F8.)

**Dazu eine Klärung ohne Codeänderung:** in `abuse-reports/[id].patch.ts` steht
jetzt an der Stelle, warum `status: 'open'` eine verhängte Sperre NICHT
zurücknimmt — mehrere Meldungen können zu derselben Sperre geführt haben, und
Entsperren ist ein eigener Vorgang mit eigenem Protokolleintrag.

**Beweise:** `verify-community-suspension.mjs` **54/54** (war 50/50 — vier neue
Live-Prüfungen für den Link: `java\nscript:`-Meldung wird ANGENOMMEN, die Zeile
steht, das Feld ist leer, ein gewöhnlicher https-Link kommt getrimmt an),
`verify-my-overview.mjs` **27/27** unverändert. Unit: 15 Fälle für die pure
URL-Regel (`javascript:`/`data:`/`vbscript:`/`file:`, `JaVaScRiPt:`,
Leerzeichen- und Steuerzeichen-Tricks inkl. `java\nscript:`, relative Werte),
4 für die Sweep-Pagination gegen ein seitenlieferndes Fake-TablesDB, 2 für den
Host-Resolver (env-gated; mit der lokalen Appwrite scharf gelaufen, 6/6 —
abuse fällt durch, billing bleibt, eine Zeile OHNE gesetzte Spalte bleibt
auflösbar), 1 für `hasCommunityAccess`. `pnpm -r test` grün (1131 bestanden, 33 übersprungen —
die env-gated Läufe gegen echte Appwrite), typecheck 0 Fehler, lint
6 bekannte Warnungen, `check:manifests` konsistent. Der neue Deckel live
gemessen: zehn Aufrufe kommen durch, der elfte bekommt 429; `/api/health`
bleibt frei.

**Gelernt:** **Dieselbe Route normalisierte den Host ein zweites Mal, die URL
kein einziges Mal.** Der Host war das Feld, über das jemand nachgedacht hatte —
er hat eine Bedeutung, also bekam er eine Regel, und zur Sicherheit gleich
zweimal. Die URL daneben galt als „nur ein Link" und rutschte roh bis in ein
`href` der Betreiber-Oberfläche durch. Bei einer Quelle OHNE Anmeldung braucht
**jedes** Feld dieselbe Paranoia, nicht nur das, dessen Format man interessant
fand. Zweitens: eine **Prüfung muss denselben String prüfen, der später
ausgeführt wird** — Browser entfernen \t\r\n mitten in einer URL, bevor sie das
Schema lesen, und jede Regel, die das nicht nachmacht, prüft an der
Angriffsfläche vorbei. Drittens, aus Befund 3: **ein `limit()` ohne Schleife ist
ein stiller Datenverlust**, und er tut dort weh, wo etwas ZURÜCKGENOMMEN werden
soll — eine nicht verhängte Sperre fällt auf, eine nicht aufgehobene nicht.

---

### F8 (Abrechnungs-Hälfte) — Abrechnungsdaten überleben die Kontolöschung ✅ 2026-08-02

**Davids Entscheidung:** `communities.stripeCustomerId` und `billingStatus`
bleiben stehen, wenn der (letzte) Owner sein Konto löscht — es gibt KEINE
Löschfrist für Abrechnungsdaten. Grundlage ist die kaufmännische
Aufbewahrungspflicht (§147 AO / §257 HGB): Rechnungs- und Zahlungsvorgänge
müssen 8–10 Jahre nachvollziehbar bleiben, und Art. 17 Abs. 3 lit. b DSGVO
nimmt genau diesen Fall vom Löschrecht aus. Der Personenbezug an der
Community-Zeile selbst ist durch F3 bereits versorgt: die Letzter-Owner-
Mitgliedschaft wird entpersonalisiert (E-Mail geleert), die Einladungen und
Anfragen sind weg — was bleibt, ist der Zahlungs-Verweis auf Stripe, und dort
gelten Stripes eigene Aufbewahrungsregeln. Begründung steht jetzt an der
Stelle (`packages/control/server/utils/communityErasure.ts`), im
[DECISION-LOG](DECISION-LOG.md). Der Rest — die Löschfrist für
`abuse_reports.reporterEmail` (Melder ohne Konto, die erreicht kein
GDPR-Contributor) — hat David am selben Tag entschieden und steht weiter
unten als **F8-Rest**.

---

### C20 / F14 — Apps ohne Realtime bekommen keinen Socket mehr ✅ 2026-08-01

**Befund (aus B7, vorbestehend):** Die Marketing-Landing hielt bei jedem
Seitenaufruf eine Realtime-Verbindung zu Appwrite offen und abonnierte
`app_config` — Laufzeit-Flags, die diese Seite nirgends liest. Sie hat weder
Konto noch Composer noch Wartungs-Hinweis. Ursache ist kein Fehler in einem
Plugin, sondern **Vererbung**: `packages/core/app/plugins/realtime-config.client.ts`
läuft in JEDER App, die core erweitert, und der einzige Riegel davor war
„hat diese App eine Datenbank-Id?" — die hat `marketing` (`.env` setzt
`NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`, damit die Layer booten).

**Der 401 aus dem ursprünglichen C20-Text war zu diesem Zeitpunkt schon weg**
(siehe F11, am selben Tag): `ensureRealtimeJwt()` fragt seit dem nach einer
Session und holt für Gäste keinen Token mehr. Übrig blieb das, was F11
ausdrücklich stehen ließ — der Gast-WebSocket samt nachgeladenem
76-kB-Web-SDK. Für eine App, die davon lebt (Live-Theme-Morphen für Besucher),
ist das ein Feature; für eine statische Landing ist es Ballast. F14 nimmt
genau diesen Fall, ohne F11s Entscheidung anzutasten.

**Die Lösung ist ein ausdrücklicher Vertrag, kein Sonderfall im Plugin.**

1. **Eine pure Regel** — `packages/core/shared/realtimeGate.ts`,
   `realtimeAllowed(enabled, ...ids)`. Sie beantwortet die beiden Fragen, die
   dasselbe bedeuten („hier gibt es nichts zu abonnieren"): das Config-Gate
   `pukalani.realtime.enabled` **und** die Datenebene (Datenbank-/Tabellen-Id
   bzw. Endpoint/Projekt). Der alte `!databaseId`-Guard aus dem
   Live-Vorfall vom 2026-07-29 geht darin auf statt daneben zu stehen.
   5 Unit-Tests (`packages/core/tests/realtimeGate.test.ts`).
2. **Core-Default AN** — die begründete Ausnahme von „Core-Default ist IMMER
   aus". Realtime ist kein Zusatz, den eine App anschaltet, sondern das
   bestehende Verhalten jeder Produkt-App. Ein Default AUS hätte sie alle
   stillschweigend entkoppelt, und der Ausfall wäre unsichtbar gewesen: die
   Seite sieht richtig aus, sie aktualisiert sich nur nicht mehr.
3. **Gelesen an EINER Stelle** — `realtimeEnabled()` in
   `useRealtimeClient.ts`, memoisiert (die App-Config ist zur Laufzeit
   konstant, anders als der Auth-Zustand in F11). Nicht in den drei Plugins:
   dieselbe Regel an drei Aufrufern wäre beim vierten vergessen — dieselbe
   Überlegung, die den `!databaseId`-Guard schon in `useRealtimeRows` gestellt
   hatte.
4. **Der Vertrag steht im TYP, nicht in einer Konvention.**
   `ensureRealtimeClients()` / `sharedRealtime()` / `realtimeCookieClient()`
   geben jetzt `… | null` zurück. Der strict-Modus **zwingt** damit jeden —
   auch jeden künftigen — Konsumenten, „diese App hat keine Realtime" zu
   behandeln. Ein `throw` hätte dieselbe Wirkung nur zur Laufzeit gehabt, und
   ein stiller Rückgabewert gar keine.
5. **Zweite Tür mitgenommen:** `useRealtimeAccount()` geht bewusst NICHT über
   das Web-SDK (Cookie-Auth, Instant-Session-Revoke — CLAUDE.md) und hätte das
   Gate deshalb nicht von selbst geerbt. Es fragt dieselbe Regel selbst ab.
   Ebenso `usePresenceState()`: ohne Realtime schriebe der HTTP-Heartbeat
   Presences, die kein Leser mehr abholen kann.

**Abgeschaltet ist es in `marketing` und `help`** — beide öffentlich,
kontenlos, ohne Laufzeit-Flags, beide ohne `themes`-Layer (es gibt dort also
auch kein Live-Theme-Morphen zu verlieren). Der bewusst gezahlte Preis steht
an beiden Stellen im Code: Flag-Änderungen greifen dort erst beim nächsten
Seitenaufbau.

**Beweis (A/B am selben Server, nur die eine Zeile geändert):**
`enabled: true` → `…/deps/appwrite.js` wird geladen (Web-SDK + Socket);
`enabled: false` → kein SDK, kein `/api/auth/realtime-token`, Konsole ohne
einen einzigen Eintrag. Gegenprobe, dass nichts kaputtging: die volle
comments-E2E-Suite **24/24 grün**, darin der Realtime-Guard („serverseitig
angelegter Kommentar erscheint live und verschwindet beim Löschen"). Dazu
`pnpm -r test` (431 core-Tests), Lint und `typecheck` von marketing und
comments; alle sieben Apps starten.

**Gelernt:** (1) **`performance.getEntriesByType('resource')` puffert nur 250
Einträge.** Im Dev-Modus sind das ein paar hundert Modul-Requests — der
nachgeladene SDK-Chunk fiel hinten raus, und die Messung sagte „kein SDK
geladen", obwohl es geladen war. Zwei Messungen hintereinander waren dadurch
scheinbar identisch, obwohl das Gate umgelegt war. Für solche Beweise das
Netzwerkprotokoll des Browsers nehmen, nicht die Performance-API — oder den
Puffer vorher vergrößern. (2) **`pnpm --filter <app> dev -- --port N` wirkt
nicht:** das Skript hat `--port` schon fest verdrahtet, das zweite landet als
Positionsargument, und Nuxt weicht bei belegtem Port still auf einen anderen
aus (hier 3007 → 3000). Genau die Falle, vor der CLAUDE.md unter „Tests"
warnt — ein Beweis liefe dann gegen den Server eines fremden Worktrees.
Richtig: `pnpm --filter <app> exec nuxi dev --port N`. (3) **Der erste
Seitenaufruf nach einem Dev-Server-Start beweist nichts über nachgeladene
Abhängigkeiten:** Vite bündelt `appwrite` beim ersten Import erst („dependency
optimized") und lädt die Seite dabei neu. Immer die zweite Messung nehmen.

### E2 — UptimeRobot nachgezogen ✅ 2026-08-01

Erledigt in Davids echtem Chrome (eingeloggte UptimeRobot-Session), kein
API-Key nötig. Von den „drei Klicks" war beim Nachsehen nur noch EINER echt:

- **Monitor `help.pukalani.app/api/health` angelegt** (ID 803644024, HTTP,
  5-min-Intervall, E-Mail-Alarm — dieselbe Bauart wie die übrigen sechs).
  Der Endpunkt war vorab geprüft (`{"ok":true,"build":…}`).
- **Die Umbenennung war schon passiert:** Monitor 803548622 trägt den
  Friendly-Name `control.pukalani.app/api/health` — die „studio…"-Zeile war
  veraltet.
- **Die öffentliche Statusseite existierte schon** („Pukalani",
  stats.uptimerobot.com/MFP8D9JGlW, Public + Published, 4 Monitore) — sie
  musste nicht eingeschaltet, sondern nur ERGÄNZT werden: help ist jetzt der
  fünfte Service, von der öffentlichen Seite aus verifiziert (alle 5
  „Operational").

**Nachtrag (gleicher Tag, Davids Entscheidung):** `pukalani.app` (Landing) und
`demo.pukalani.app` (Platform-Stellvertreter) sind ebenfalls auf die
Statusseite gewandert — sie zeigt jetzt ALLE 7 Monitore, öffentlich verifiziert
(alle „Operational").
**Gelernt:** Dieselbe Woche, dritte veraltete Zeile (nach C8 und C12b-Notiz):
Betriebs-Punkte altern schneller als Code-Punkte, weil sie auch außerhalb des
Repos erledigt werden können — vor dem Ausführen erst nachsehen, was WIRKLICH
noch fehlt.

---

### F8-Rest — Melder-Adressen leben höchstens 90 Tage ✅ 2026-08-02

**Davids Entscheidung** (am selben Tag wie die Abrechnungs-Hälfte, siehe oben):
`abuse_reports.reporterEmail` verfällt nach **90 Tagen**, gerechnet **ab der
Meldung** (`$createdAt`) und **unabhängig vom Status**.

**Warum diese Spalte überhaupt einen eigenen Sweep braucht:** sie ist die
einzige personenbezogene Spur im System ohne Konto. Wer eine Community meldet,
ist fast nie Mitglied darin und meist gar nicht angemeldet — es gibt keine
userId, an der ein GDPR-Contributor ansetzen könnte. Ohne eigene Frist bliebe
die Adresse für immer liegen, und zwar unbemerkt, weil der normale Löschpfad
sie nie zu Gesicht bekommt.

**Warum der Anker `$createdAt` ist und nicht `handledAt`:** Der Anker an der
Bearbeitung klingt naheliegender („die Adresse wird ja bis zur Klärung
gebraucht"), macht die Zusage aber von der Warteschlangen-Disziplin des
Betreibers abhängig — eine Meldung, die ein Jahr unbearbeitet liegt, hielte die
Adresse ein Jahr fest. Genau das darf die eigene Bequemlichkeit nicht
entscheiden. Mit `$createdAt` ist die Zusage hart und ohne Fußnote
aussprechbar: *eine Melder-Adresse lebt höchstens 90 Tage.*

**Warum die Zeile bleibt:** gelöscht wird nur das Feld. Die Meldung ist der
Beleg für eine womöglich verhängte Sperre — sie zu entfernen hieße, die
Begründung der eigenen Maßnahme wegzuwerfen. Ohne Adresse ist sie exakt das,
was eine anonyme Meldung von Anfang an ist. **Idempotent per Konstruktion:**
eine geleerte Zeile trägt `null` und fällt damit aus der Kandidaten-Abfrage; es
braucht kein Merkmal „schon aufgeräumt".

**Wo es hängt:** pure Regel `shouldEraseReporterEmail` + Sweep
`eraseStaleReporterEmails` in
`packages/control/server/utils/abuseReportPrune.ts` (Muster:
`inviteRequestPrune.ts`), eingehängt als vierter Mitfahrer im stündlichen
`packages/control/server/plugins/trial-sweep.ts` — gleicher Takt, gleiches
Fehler-Verhalten wie die drei daneben. Ein eigener Timer wäre nur ein weiterer
Ort, an dem man nach dem Grund für ein verschwundenes Datum sucht. Fehler pro
Zeile werden geloggt und übersprungen, der Sweep läuft weiter. 6 Unit-Tests in
`packages/control/tests/abuseReports.test.ts`.

**Gelernt:** Die Spalte hat `''` als Vorgabe (Migration control-034), nicht
`null` — und anonyme Meldungen sind der Regelfall. Eine Kandidaten-Abfrage nur
mit `Query.isNotNull` hätte deshalb Stunde für Stunde ihre 100 Plätze mit
Zeilen belegt, an denen nichts zu tun ist, und die wirklich fälligen nie
erreicht. Sie filtert jetzt **beide** Leer-Schreibweisen weg und sortiert
`orderAsc('$createdAt')`, damit der Sweep sich garantiert vorwärts arbeitet.
Wo eine Spalte zwei Arten hat, „leer" zu sein, muss die Abfrage beide kennen.

**Öffentliche Zusage geprüft, nichts zu ändern:** die Formular-Copy
(`onboarding` i18n, `abuse.privacy` / `abuse.emailHint`) nennt **keine**
Speicherdauer — sie sagt nur, dass gespeichert und ohne Adresse anonym
gemeldet wird. Die Frist widerspricht also keinem Versprechen; ob sie
irgendwann in der Datenschutzerklärung auftaucht, entscheidet A1 (echte
Rechtstexte).
[DECISION-LOG](DECISION-LOG.md) und die F8-Zeile in OPEN-ITEMS.md trägt nur
noch den offenen Rest: die Löschfrist für `abuse_reports.reporterEmail`
(Melder ohne Konto — die erreicht kein GDPR-Contributor, sie braucht einen
eigenen Sweep).

### Wechselwirkungs-Audit M13 × übrige Features — 5 Befunde ✅ 2026-08-02

Fünf Befunde aus dem Audit „was macht die Sperre mit dem Rest des Produkts",
alle zuerst am Code (und drei davon live) reproduziert, dann behoben. Davids
Vorgabe vorab: **die Sperre friert NUR INHALTE ein** — Owner-Einstellungen
bleiben bewusst offen; das war zu dokumentieren, nicht zu ändern.

**1 (MEDIUM, echter Produktfehler) — die Sperre erreichte die Falschen.**
`COMMUNITY_SUSPENDED_CODE` reiste sauber bis in den Browser (403,
`reason: community_suspended` im Envelope) und **niemand las ihn**: ein Mitglied,
das in einer gesperrten Community schrieb, bekam den generischen „hat nicht
geklappt"-Toast seines Layers. Die Mahnung war also für genau die Leute
unsichtbar, die sie zum Owner tragen. Jetzt gibt es **einen** Leser für alle
Layer: `packages/core/app/plugins/community-suspended-notice.client.ts` zeigt
„Diese Community ist gerade schreibgeschützt" (de/en), **ohne** den Grund zu
verraten — der bleibt `community.billing`-gegated.

**2 (LOW) — die `my.*`-Karte widersprach ihrem eigenen Kommentar.**
`projectMyCommunities` blankte `suspension` für jede Rolle ohne
`community.billing`, während der Kommentar daneben „nur der GRUND ist gegated"
versprach. Eine Wahrheit gewählt, und zwar die des Kommentars: neues Feld
**`readOnly`** (DASS) für jede Karte, `suspension` (WARUM) weiter nur für den
Abrechnenden. Ein Viewer sieht Schloss + „Nur zum Lesen — gerade sind keine
Beiträge möglich", nie „Zahlung offen". Der Vorwurf „Missbrauch" kann auch
nicht indirekt durchkommen: abuse-gesperrte Communities verschwinden für
Mitleser ohnehin ganz aus der Liste.

**3 (LOW) — Presence-Rauschen auf abuse-404-Hosts.** Auf einem gesperrten Host
wirft `00.tenant.ts` für JEDEN Pfad 404 — auch für `/api/presence/heartbeat`.
Die Fehlerseite rendert trotzdem mit Auth-Kontext, also startete
`usePresenceState()` seinen 20-s-Takt und feuerte dauerhaft 404-POSTs, still
verschluckt vom `.catch(() => {})`. Der Heartbeat startet jetzt **gar nicht**,
solange `useError()` gesetzt ist — und wird **nachgeholt**, sobald der Fehler
geräumt ist (ein blosses `return` hätte einen Tab, der einmal auf einer 404
war, für den Rest der Sitzung unsichtbar gemacht).

**4 (LOW, Dokumentation) — die bewusste Grenze stand nirgends.** Jetzt an der
zentralen Stelle (`core/shared/communitySuspension.ts`) und in CLAUDE.md, mit
Davids Begründung: zu ist jeder INHALT (Türklinke `member` der Datentür), offen
bleiben Branding, Team/Rollen, Publikum, Registrierung und die Moderation
(Klinke `operator`) — die laufen über die Service-Naht ins Control Plane. Die
Sperre soll zum ZAHLEN bewegen, nicht den Owner aussperren; eine gesperrte
Community, die niemand mehr moderieren kann, wird zum Problem des Betreibers.

**5 (LOW, geprüft und ENTSCHIEDEN) — `community_branding` ist aufzählbar.**
Stimmt, live nachgemessen: ein anonymer Client bekommt per REST die Row-Ids und
Farben **aller** Communities (`read(any)`, `rowSecurity: false`, system-028).
**Entscheidung: akzeptiert, nicht geräumt.** Vier Gründe, in der Reihenfolge
ihres Gewichts: (a) es liegen dort nur eine undurchsichtige Row-Id und drei
Farb-Tokens, die ohnehin als `data-theme/-variant/-neutral` im HTML jeder Seite
dieser Community stehen — kein Name, kein Host, keine Mitgliedschaft, und ohne
Host lässt sich eine Id keiner Community zuordnen; aufzählbar ist die ANZAHL,
nicht die Identität. (b) Appwrite kennt kein Recht, das Lesen erlaubt und
Auflisten verbietet — „nicht aufzählbar" hiesse hier „kein Leserecht", also kein
Live-Morphen (D6); es gibt nichts zu härten, nur zu entfernen. (c) Dieselbe
bewusste Bauart wie bei den Schwestern `app_config` (system-005) und
`custom_themes` (system-013), letztere trägt sogar NAMEN. (d) „Beim Sperren
räumen" klingt billig und ist es nicht: die Sperre entsteht im
**Control-Plane-Projekt**, der Spiegel liegt im **Runtime-Projekt**, und einen
Schlüssel in diese Richtung gibt es bewusst NICHT (derselbe Grund, aus dem
`revokeCommunityLabel` in der Runtime läuft) — eine neue Service-Naht für drei
Farbwörter wäre teurer als das, was sie schützt. Damit die Abwägung nicht
stillschweigend verfällt, ist ihre **Bedingung** jetzt geprüft: Abschnitt 12 von
`verify-site-branding.mjs` listet die Tabelle anonym und geht rot, sobald ein
Feld ausserhalb der drei Farb-Spalten auftaucht.

**Zusatzfrage aus dem Audit, beantwortet ohne Codeänderung:**
`onboardingProvision.ts` setzt theme/variant beim Anlegen, spiegelt aber nicht —
die Spiegel-Row entsteht erst beim ersten Branding-PATCH. **Keine Lücke:** der
Abonnent hängt am Row-Kanal, auch wenn es die Zeile noch nicht gibt, und
`createRow` publiziert dort ein Event (live gegen Appwrite 1.9.6 geprüft — anders
als `upsertRow`). Nachrüsten liesse es sich ohnehin nicht ohne neue Naht:
`onboardingProvision` läuft im Control-Plane-Projekt und hat keinen Schlüssel
fürs Runtime-Projekt. Steht jetzt in `core/shared/communityBranding.ts`.

**Beweise:** `verify-community-suspension.mjs` **55/55** (war 54/54),
`verify-my-overview.mjs` **30/30** (war 27/27), `verify-site-branding.mjs`
**44/44** (war 42/42). Browser gegen echte Appwrite: ein Mitglied schreibt in
eine billing-gesperrte Community → der klare Hinweis steht **über** dem
generischen Toast des Layers; auf der 404-Seite eines abuse-gesperrten Hosts
feuert der alte Stand binnen Sekunden `POST /api/presence/heartbeat → 404
Unknown host` und wiederholt es, der neue in 70 s **kein einziges Mal**.
`pnpm -r test` grün, typecheck 0 Fehler, lint 6 bekannte Warnungen,
`check:manifests` konsistent, Prod-Build einer App durchgelaufen.

**Gelernt:** (1) **Ein `$fetch`-Interceptor in einem Plugin wirkt NICHT — und
sieht dabei richtig aus.** Nuxts `#build/fetch.mjs` endet auf
`export const $fetch = globalThis.$fetch`: eine **Momentaufnahme**. Wer
`globalThis.$fetch` in einem Plugin ersetzt, erreicht Konsolenaufrufe und
`useFetch`, aber **nicht** das auto-importierte `$fetch` der Komponenten — das
Modul ist längst ausgewertet. Live erwischt: derselbe 403 toastete aus der
Konsole und schwieg aus dem PostComposer. Der Interceptor gehört deshalb per
`app:templates`-Hook **in die Vorlage**, und zwar als String-Ersetzung auf
Nuxts eigener Ausgabe: ein Bump, der die Zeile umbenennt, nimmt uns still den
Hinweis, statt den Build zu brechen. (2) **Ein Live-Beweis pro Minute — sonst
misst man den Rate-Limiter.** `GET /api/onboarding/communities` steht auf
10/min und IP, und `verify-my-overview` lag schon knapp darunter (die
SSR-Abrufe der Seiten zählen mit). Zwei zusätzliche Abrufe kippten den Beweis
in 429-Fehler, die wie ein kaputtes Feature aussahen. Neue Prüfungen in einen
laufenden Live-Beweis kosten **Budget**, nicht nur Zeit. (3) **Ein Beweis, der
in `| head` läuft, stirbt nicht — er läuft weiter.** Drei abgebrochene
Durchgänge legten danach munter weiter Test-Communities an, und die tauchten
als „Geister" in jeder folgenden Messung auf. Verify-Skripte mit Aufräum-Block
immer in eine Datei schreiben, nie durch eine Pipe kürzen. (4) **Der
past-due-Sweep hebt eine von Hand gesetzte `billing`-Sperre wieder auf**, wenn
`billingStatus` nicht `past_due` ist — für einen Browser-Beweis muss man beide
Spalten setzen, sonst ist die Community 30 Sekunden später wieder frei und man
sucht den Fehler im eigenen Code.

---

### Index-Retry in elf Migrationen nachgerüstet ✅ 2026-08-02

**Aufgefallen als Nebenbefund beim Landen von F14** (nicht davon verursacht):
die CI-E2E starb im Bootstrap, bevor ein einziger Test lief —
`AppwriteException: The requested column 'communityId' is not yet available`
(400, `column_not_available`) aus dem `createIndex` von
`packages/moderation/scripts/migrations/003-community-id.ts`.

**Es ist genau das Rennen, für das es `scripts/migrations-lib/indexRetry.mts`
schon gab:** der Index-Endpunkt prüft die Spalten-Verfügbarkeit nicht am
`attributes`-Dokument, sondern an der im Collection-Dokument eingebetteten
Kopie aus Appwrites Metadaten-Cache — und die hinkt nach. `waitAvailable()`
pollt also die frische Wahrheit, und der Index-Aufruf danach sieht die
veraltete. Pollen allein reicht nicht; CLAUDE.md schreibt den Retry vor.

**Elf Migrationen hatten ihn trotzdem nicht:** die acht `*-community-id.ts`
der E8/E11-Umbenennungswelle plus `control-025/028/029`. Die acht sind
praktisch Kopien voneinander (identische Struktur, identische Zeilennummer der
Index-Anlage) — die Vorlage hatte den Retry offenbar nie, und die Kopien haben
ihn brav mitvererbt.

Umgestellt ist **ausschließlich die Hülle um `createIndex`** (je eine
Import-Zeile und `step(` → `indexStep(`; der Helfer ist als Drop-in mit
gleicher Ausgabe und gleicher 409-Idempotenz gebaut). `step()` bleibt überall
stehen, wo es hingehört: Spalten-Anlage in allen elf, und in `control-025` das
`deleteIndex` — ein Delete kennt den Spalten-Race nicht. Inhaltlich ist keine
Migration angefasst: keine Spalte, kein Backfill, kein Name, keine Reihenfolge.
Danach steht die Prüfung „gibt es noch ein `createIndex` ohne Retry?" über alle
Layer auf null.

**Beweis:** E2E `success` auf `5c212ae0` (enthält den Fix) — alle
Index-Zwillinge der Welle sauber angelegt (`activities.idx_community`,
`notifications.idx_recipient_community`, `comments.idx_community`,
`embed_sites.uq_community_host`, `post_votes.idx_community_vote`, …). Dazu
`pnpm -r test` und `pnpm -r lint` unverändert.

**Gelernt:** (1) **Der grüne Lauf beweist weniger, als er aussieht.** In ihm
hat der Retry KEIN einziges Mal ausgelöst (null „noch nicht sichtbar"-
Meldungen) — belegt ist damit „bricht nichts, Migrationen laufen durch",
nicht „rettet das Rennen". Ein sporadischer Fehler lässt sich nicht auf
Bestellung vorführen; wer hier mehr behauptet, verwechselt Abwesenheit mit
Beweis. (2) **Eine Migrations-Vorlage vererbt auch ihre Lücken.** Acht
identische Kopien hieß: ein vergessener Retry wurde achtfach ausgerollt, ohne
dass es je auffiel — bis der Zufall eine davon traf. Wer eine Migration
kopiert, kopiert die Sicherungen mit oder eben nicht; ein Blick auf
`grep -L indexStep` über die Migrationen kostet Sekunden. (3) **Der
Import-Pfad ist die Stelle, an der so ein Fix real scheitert.** Migrationen
laufen als eigenständige `node --experimental-strip-types`-Prozesse, die
Auflösung ist relativ zur DATEI. Unit-Tests sehen davon nichts — die billige
Gegenprobe ist, jede Datei einmal ohne Env-Variablen zu starten: lädt sie und
bricht sie regulär an der Env-Prüfung ab, stimmt der Pfad.

---

### Moderations-Audit gefixt ✅ 2026-08-01

Neun Befunde über `packages/moderation` (Melde-Weg), alle **vorher am Code
reproduziert**, dann behoben. Zwei davon waren echte Grenz-Fehler, einer eine
Lüge in der Oberfläche, der Rest Nachlauf und tote Verzweigungen.

**1 (MEDIUM, Isolation + kaputtes Feature) — `reports` war die einzige
Pool-Tabelle ohne zweite Verteidigungslinie.** `/api/reports` setzte seine
Row-Permissions von Hand und benutzte dafür die GLOBALEN Betreiber-Labels
`read("label:admin")` / `read("label:moderator")` statt der zentralen
Permission-Bildung. Falsch nach **beiden** Seiten: ein Kunden-Moderator trägt
diese Labels nicht (seine Rolle steht in `community_members`) — Appwrite lieferte
ihm also **keine Realtime-Ereignisse**, während der Kommentar in
`dashboard/comments.vue` „live" behauptete; und wer ein globales Label trägt, las
per Realtime die Meldungen **aller** Communities des geteilten Pool-Projekts.

Die Antwort war nicht „dieselbe Bildung wie überall", denn keins der beiden
vorhandenen Publika passt: `read("label:<communityId>")` wäre **jedes Mitglied**
(eine Meldung nennt einen Menschen, einen Vorwurf und eine Notiz — sie ist kein
Inhalt), die globalen Rollen sind zu weit. Appwrite kennt aber nur ODER-Rollen,
den Schnitt „Moderator UND diese Community" gibt es dort nicht. Also bekommt er
einen eigenen Schlüssel: ein **zweites, abgeleitetes Label je Community**
(`mod<communityId>`, `packages/core/shared/communityModeratorLabel.ts`, pure +
7 Tests), vergeben von `core/server/middleware/06.community-label.ts` an jeden
mit `reports.moderate`. Neues Publikum `read: 'moderators'` in
`tenantRowPermissionsFor` (Pool: das Moderations-Label; Silo/Single-Tenant: die
globalen Rollen, denn dort IST das Projekt die Grenze; ohne communityId
fail-closed). Die C18-Regel gilt hier bewusst **nicht** — auch die offenste
Community macht Meldungen nicht öffentlich.

Drei Feinheiten, die dazugehören: (a) das Label wird nur bei **erfolgreicher**
Rollen-Auflösung nachgezogen — ein Entzug auf Verdacht ließe das Publikum eines
Moderators bei jedem Netz-Schluckauf flackern; (b) `revokeCommunityLabel` nimmt
seitdem **beide** Labels in **einem** `updateLabels` (zwei Schreibvorgänge wären
zwei Gelegenheiten, sich gegenseitig zu überschreiben) — „draußen" heißt auch
fürs Moderations-Publikum draußen; (c) eine Beförderung wirkt innerhalb des
bestehenden **30-s-Rollen-Caches**, nicht sofort — das Control Plane kann den
Runtime-Cache nicht leeren.

**Beweise:** `packages/moderation/scripts/verify-report-boundary.mjs` (neu,
**25/25**) — Akt 1 zeigt das Leck im Alt-Zustand und die Grenze im Neu-Zustand
direkt gegen Appwrite, Akt 2 fährt den echten Weg über `/api/reports` und liest
das Ergebnis mit **echten Sessions am eigenen Code vorbei** (genau die Frage,
die auch Realtime stellt). Dazu `verify-site-authz.mjs` Abschnitt 9b (neu) für
Vergabe/Beförderung/Entzug des Labels, insgesamt **103/103** ·
`packages/moderation/tests/reportPermissions.test.ts` (an
`tenantRowPermissionsFor` genagelt, Muster `presencePermissions.test.ts`) ·
`packages/core/tests/tenantRowPermissions.test.ts` um sieben `moderators`-Fälle
erweitert.

**2 (MEDIUM) — Melden ging, Zurückziehen nicht.** Das Abgeben lief über die
Operator-Klinke der Datentür (die M13-Zahlungssperre greift dort nicht), das
Zurückziehen über die Mitglieds-Klinke (sie greift). In einer gesperrten
Community bekam der Melder also 403, während die Oberfläche „deine Meldung ist
noch aktiv" behauptete — und das war sie dann auch, unabänderlich.
**Entscheidung, im Code festgehalten:** eine Meldung ist kein INHALT, sondern
eine AUSSAGE über andere; sie abgeben zu dürfen, aber nicht zurücknehmen, ist
die falsche Hälfte. Also dieselbe Klinke wie beim Abgeben. Sicher trotz
Admin-Client, weil der Zugriff doppelt eingeengt bleibt (`find` auf
`reporterId = <Session-User>` **und** Mandanten-Filter, `remove` belegt die
Zugehörigkeit erneut). Beweis: zwei neue Prüfungen in
`verify-community-suspension.mjs` (**62/62**).

**3 (MEDIUM) — eine tote Verzweigung, gleiche Klasse wie der alte
`last_admin`-Fall.** Die Route antwortete auf eine Doppel-Meldung `200
{ alreadyReported: true }`, die Konsumenten verzweigten auf `409` — der Zweig
konnte nie feuern, und der Nutzer las „Meldung eingegangen" für etwas, das nicht
angelegt wurde. **Eine Wahrheit, und zwar die im Repo etablierte:** 409 mit
`data.code: 'already_reported'`, der zentrale Handler hebt ihn als `reason` ins
Envelope, der Client liest `error.data.reason`. Codes + Leser pur in
`packages/moderation/shared/reportErrors.ts`, damit Server, Client und Test
dieselben Strings benutzen. Konsumenten nachgezogen: `ReportButton` schaltet auf
„Zurückziehen" statt Fehler-Toast, `PostCard` sagt „bereits gemeldet" statt „kam
nicht an".

**4 (MEDIUM) — Event-Meldungen versandeten: Knopf entfernt, nicht gebaut.**
`EventDetail.vue` meldete mit `targetType: 'event'` und versprach „ein Moderator
sieht sie sich an". Kein Eskalations-Handler kannte den Typ, keine Queue fragte
ihn ab (comments fragt 'comment', posts fragt 'post'). Die ehrliche Lösung wäre
eine Moderations-Queue für Events — und die ist **nicht klein**: Events kennen
nur `draft/published/cancelled`, es fehlt also der Moderations-Zustand
(Migration + Schema + Filter), dazu eine Capability `events.moderate`, eine
Queue-Route, eine Dashboard-Seite und ihre Texte. Das ist ein Feature, kein Fix.
Also **Knopf weg** (samt `events.report.*` in de/en), Begründung als Kommentar an
der Stelle, und der Rest als F-Zeile in OPEN-ITEMS. Lieber kein Knopf als einer,
der ins Leere meldet.

**5 (LOW) — Typ-Nachlauf E8-3.** `shared/types/report.ts` trug noch `tenantId?`,
obwohl die Spalte mit `moderation-004` gefallen ist; `communityId` fehlte.

**6 (LOW) — Catch-all-500.** Jeder Nicht-409 wurde „Could not submit report" mit
Status 500 — auch ein bereits geformter H3-Fehler samt fachlichem `data.code`.
Jetzt `toH3Error` (das ist genau der Fall, für den es seit M13 H3-Fehler
durchreicht).

**7 (LOW) — `openCount` sättigte bei 100.** Die Eskalation zählte
`openReportsForTarget(...).length`, und die Funktion holt höchstens 100 Zeilen —
ein `autoHideReports`-Schwellwert über 100 hätte **nie** gezündet. Neu:
`countOpenReportsForTarget` liest `total` mit `Query.limit(1)` (keine Zeile
übertragen, richtig gezählt). `openReportsForTarget` bleibt das Anzeige-Fenster
für Detailansicht und KI-Assist und sagt das jetzt auch.

**8 (LOW) — Phantom-Ziele.** targetType/targetId waren freie Strings; jede
angemeldete Person konnte beliebig viele Zeilen mit erfundenen Zielen erzeugen
(der Unique-Index bremst nicht, jedes erfundene Ziel ist ein neues Paar). Neue
Registry `registerReportTarget` (Muster `registerReportEscalationHandler`, A14):
comments meldet 'comment' an, posts meldet 'post' an; unbekannter Typ → 400
`unknown_target`, fehlendes Ziel → 404 `target_not_found`. Das macht Befund 4
zugleich selbst-durchsetzend — ein wiederbelebter Event-Knopf liefe jetzt in
einen Fehler statt in eine stille Karteileiche.

**9 (LOW, Entscheidung) — `GET /api/reports` bleibt.** Geprüft und behalten, mit
Begründung im Kopf der Datei: sie ist keine tote, sondern eine **unbenutzte**
Oberfläche. Sie ist (a) die Autorisierungs-Probe zweier Beweis-Skripte
(`verify-site-authz`, `verify-community-suspension`) und (b) die typ-agnostische
Sicht des Layers, dem die Tabelle gehört — der Weg für jeden meldbaren Typ ohne
eigene Queue, also genau der Fall, an dem Events aufgelaufen sind.

**Gates:** `pnpm -r test` grün (u. a. neu: moderation 19, core 456) ·
`pnpm typecheck` 0 Fehler · `pnpm lint` 0 Fehler / 6 bekannte Warnungen ·
`pnpm check:manifests` + `check:single-copy` grün · Pool-Isolation weiter grün
(comments 13/13 · posts 7/7 · events 14/14 · courses 28/28) ·
`verify-presence-boundary` 23/23.

**Gelernt (vier Stück):**

1. **Eine Route zu gaten beweist nichts über die Row-Permissions.**
   `GET /api/reports` war korrekt per `reports.moderate` geschützt und las über
   den Admin-Client — sie war nie das Leck. Das Leck lag eine Ebene tiefer, dort
   wo Appwrite entscheidet, was ein WebSocket ausliefert. Wer eine Grenze
   beweisen will, muss **mit einer echten Session am eigenen Code vorbei** lesen;
   alles andere prüft die Anwendungslogik gegen sich selbst.
2. **Handgesetzte Permissions sind der Ort, an dem eine zentrale Regel
   ausfällt** — und zwar leise, weil die Zeile ja *irgendwelche* Rechte trägt.
   Die drei Nachbartabellen waren richtig, genau diese eine nicht. Ein
   `permissions:`-Feld an einer Aufrufstelle gehört ab jetzt begründet oder
   ersetzt; das Publikum lebt als pure Funktion neben der Route und wird gegen
   `tenantRowPermissionsFor` genagelt.
3. **Ein 200 mit `{ ok: true, alreadyReported: true }` ist eine Lüge mit
   Beleg-Charakter.** Der Client hatte den richtigen Zweig — er konnte ihn nur
   nie erreichen. Es gibt genau einen Kanal für fachliche Ablehnungsgründe
   (`data.code` → `reason`); ein zweiter über ein Erfolgs-Feld erzeugt zwei
   plausible Hälften, die zusammen nicht funktionieren.
4. **Beim Beweis-Schreiben zweimal die eigene Erwartung erwischt, nicht den
   Code:** (a) Zwei Meldungen desselben Melders auf dasselbe Ziel liefen in den
   Unique-Index und meldeten „Row already exists" — das sah wie ein Grenz-Fehler
   aus und war meine Fixture. (b) `reports.communityId` ist die **Spalte** mit
   dem Zeilen-Scope (`tenantId`-Wert), das **Label** leitet sich von
   `communities.$id` ab — zwei Schlüssel für denselben Mandanten (so gewollt,
   `$id` hat die einzige alnum-Garantie). Meine Prüfung verglich beide und
   scheiterte zu Recht. Und ein `Promise.resolve(probe(...)).catch(…)` fängt eine
   **synchron** werfende Prüfung nicht — das fand ein Test, den ich zum Beweis
   geschrieben hatte, bevor er je einen echten Fehler sehen sollte.
### Missbrauchs-Warteschlange blättert ✅ 2026-08-02

Der Nachzügler des Quer-Audits: `abuse-reports/index.get.ts` las
`Query.limit(100)` und schrieb ein `console.warn`, wenn mehr da war — ein
ausdrücklicher TODO des Autors und ein **stiller Deckel**, denn die Warnung
stand nur im Server-Log. Die Oberfläche zeigte 100 Zeilen und sagte nirgends,
dass es mehr gibt; bei „neueste zuerst" fällt dabei ausgerechnet die **älteste**
Meldung hinten heraus, also die, die am längsten wartet.

**Gebaut:** echte Seiten mit `Query.offset` (25 pro Seite,
`ABUSE_REPORTS_PAGE_SIZE`), `UPagination` unter der `UTable` (Davids Regel B6),
`?page=` über die pure `parseAbuseReportsPage` (alles Krumme wird Seite 1, nie
ein 400). **Offset statt Cursor** ist hier die richtige Wahl, obwohl das Haus
`listAllRows` mit `Query.cursorAfter` hat: ein Cursor kann nur „weiter", die
Paginierung springt aber auf Seite N. Der bekannte Preis — eine neue Meldung
oben verschiebt die Seiten um eine Zeile — ist klein, weil aus dieser Liste
nichts VERSCHWINDET (ein Statuswechsel ändert die Zeile nur).

**Die Kennzahlen haben eine eigene Quelle bekommen** (die eigentliche
Entscheidung): `summarizeAbuseReports` rechnete aus den GERENDERTEN Zeilen —
mit Paginierung hätte „3 offen" plötzlich die 25 sichtbaren Zeilen beschrieben
statt der Warteschlange. Das ist die teuerste Sorte Fehler: die Zahl sieht
richtig aus, und auf Seite 1 stimmt sie sogar. Ersetzt durch
`abuseReportStatsFromCounts({ total, suspended, dismissed })` — `total` kommt
aus der Listen-Abfrage, die beiden anderen aus je einer eigenen Zählung mit
`Query.limit(1)` (gelesen wird nur deren `total`; `idx_status` aus control-034
deckt sie). **`open` wird gerechnet, nicht gezählt**, und das ist kein Sparen:
`projectAbuseReport` rendert JEDEN unbekannten Spaltenwert als 'open' — eine
dritte Abfrage `equal('status','open')` würde genau diese Zeilen auslassen, und
Kachel und Zeilen-Abzeichen widersprächen sich. `total − suspended − dismissed`
ist dieselbe Regel wie die Anzeige, nur andersherum gelesen; bei 0 geklemmt,
weil drei Abfragen drei Zeitpunkte sind.

**Beweise:** `verify-community-suspension.mjs` **66/66** (elf neue Prüfungen;
54 → 65 auf dem Arbeitsstand, nach dem Merge mit `main` 55 → 66, weil dort das
Wechselwirkungs-Audit eine `readOnly`-Prüfung dazugelegt hat — Seite 1 liefert
genau 25, der Umschlag nennt `page`/`pageSize`, Seite 2
überschneidet sich nicht, beide Seiten zusammen tragen alle 30 frisch angelegten
Meldungen, die Kacheln zählen mehr als die Seite, sie zählen einen Zustand mit,
der auf Seite 1 gar nicht vorkommt, offen+gesperrt+verworfen ergibt gesamt, beim
Blättern ändern sie sich nicht, eine Seite hinter dem Ende ist leer statt Fehler
und zeigt dieselben Kacheln, `?page=abc` fällt auf 1 zurück). Unit: 9 neue Fälle
(Kennzahlen inkl. krummer Bestandswerte und auseinanderlaufender Zählungen,
Seitenzahl-Parsing). In der Oberfläche nachgesehen (30 erfundene Meldungen, 3
davon verworfen): Seite 1 zeigt 25 offene, die Kacheln stehen auf
27/0/3/30 — auf Seite 2 stehen die drei verworfenen, **die Kacheln bleiben
gleich**. `console.warn` ist weg, weil der Deckel weg ist. typecheck 0 Fehler,
lint unverändert.

**Gelernt:** (1) **Ein TODO im Log ist kein Deckel, den jemand bemerkt.** Wer
kappt, muss der OBERFLÄCHE sagen, dass gekappt wurde — sonst ist die Warnung
nur eine Notiz an sich selbst. (2) **Wer paginiert, muss zuerst die Kennzahlen
darüber prüfen.** Jede Zahl, die vorher aus „allem, was ich geladen habe"
entstand, beschreibt hinterher nur noch die Seite; das Aggregat braucht eine
eigene Quelle, sonst wird aus einer Verbesserung eine leise Lüge. (3) Die
Kennzahl muss nach DERSELBEN Regel zählen, nach der die Zeile rendert —
deshalb wird `open` gerechnet und nicht abgefragt. (4) **Worktree-Falle
wieder live:** die Dev-Server auf 3004/3006 gehörten dem HAUPT-Repo, ein Beweis
dort hätte den alten Code gemessen; und `pnpm --filter <app> dev -- --port X`
wirkt NICHT (das Skript hat sein `--port` schon fest verdrahtet, der zweite
Wert wird ignoriert und `get-port` weicht still auf 3000 aus) — der Weg ist
`pnpm --filter <app> exec nuxi dev --port X`. (5) **Der ERSTE Lauf gegen einen
frisch gestarteten Dev-Server ist kein Messwert.** Abschnitt 3 fiel dabei
mehrfach um (mal „unknown_host", mal blieb das Schreiben bei 201) — der
45×1-s-Ring wartet auf den 30-s-Resolver-Cache, konkurriert aber mit dem
Kaltstart-Kompilat der Seiten. Der zweite Lauf war jedes Mal grün. Vor einem
roten Befund also erst einmal warmlaufen lassen, sonst jagt man einen
Regressionsschaden, den es nicht gibt.

### F19 · #38 — der Sperr-Beweis war beim Kaltstart falsch-rot ✅ 2026-08-02

> Zweite Vergabe der Nummer F19 (laufende Nummer **#38**) — nicht zu verwechseln
> mit F19 · #33 weiter oben (CI-E2E / Index-Cache). Siehe die Notiz dort.

`verify-community-suspension.mjs` meldete beim ersten Lauf regelmäßig 14
Fehlschläge; ein zweiter Lauf war sauber. Die naheliegende Erklärung
(30-s-Resolver-Cache) war FALSCH — das Skript wartet ohnehin bis zu 45 s in
einer Poll-Schleife. Die Ursache war der **past-due-Sweep**: er läuft im
control-Plugin bei JEDEM Serverstart mit und hebt eine billing-Sperre auf,
sobald `billingStatus` nicht `past_due` ist. Das ist korrekt (er ist das Netz
unter dem Webhook) — nur setzte das Skript die Sperre von Hand OHNE passenden
Zahlungsstatus. Dieser Widerspruch wurde vom Sweep zu unseren Ungunsten
aufgelöst, und danach kamen alle Schreibvorgänge durch.

Zwei Änderungen: (1) `setSuspension('billing')` stempelt jetzt
`billingStatus: 'past_due'` + frisches `pastDueSince` mit — ein Zustand, den
der Betrieb auch herstellen würde, statt eines, den der Sweep aufräumen muss;
(2) `assertSuspensionStands()` prüft während der Warteschleife, ob die Sperre
überhaupt noch steht, und BRICHT mit klarer Ansage ab („kein Befund über den
Code, Umgebung prüfen") statt sich als Dutzend rätselhafter Fehlschläge zu
tarnen. Beweis: zwei Kaltläufe hintereinander **87/87, Exit 0** — davon der
erste genau in der Situation, die vorher zweimal rot war.

**Gelernt:** Ein Beweis-Skript muss einen Zustand herstellen, den das System
selbst für stimmig hält — sonst räumt eine korrekte Automatik ihn weg und der
Beweis misst etwas anderes, als er behauptet. Und: Flakiness ist kein
Schicksal, sondern eine unfertige Diagnose. Die These „Cache" hielt zwei Tage,
weil niemand nachgesehen hat, ob die Sperre zum Prüfzeitpunkt noch steht — die
Prüfung darauf kostete vier Zeilen und beantwortet die Frage endgültig.

---

### G5 — Nacht-Audit-Nachlese: fünf Härtungen in core/control/admin ✅ 2026-08-02

**Was das war.** Fünf Befunde aus dem Nacht-Audit (F32, F33, F34, F35, F23) —
alle in `packages/core`, `packages/control`, `packages/admin`. Keiner war ein
offenes Loch mit Ausnutzung von heute; alle fünf waren Zusagen, die der Code
machte, ohne sie zu prüfen. Jeder wurde erst am Code REPRODUZIERT, dann
gefixt, jeder hat einen eigenen Unit-Beweis. Die beiden Live-Beweise bleiben
grün (`verify-site-authz` **118/118**, `verify-community-suspension`
**117/117** — dort waren 95 der Stand der Auftragsnotiz, die Suite ist
seither gewachsen; 0 Fehlschläge, Exit 0). Unit-Stand danach: core **515**,
control **264**, admin **70**; `pnpm typecheck` und `check:manifests` sauber,
`lint` bei den bekannten 6 Warnungen und 0 Fehlern.

**Betriebsnotiz zu den Live-Läufen (nicht am Code):** zwei Läufe des
Sperr-Beweises blieben mitten in der Suite an einer EINZELNEN HTTP-Anfrage
hängen (einmal gegen platform :3006, einmal gegen control :3004) — Socket
ESTABLISHED, keine Antwort, kaum CPU. Beide Male antwortete genau dieselbe
Route unmittelbar danach per `curl` in unter 0.3 s. Das passierte während
parallel an anderen Layern gearbeitet wurde (`packages/events`,
`packages/themes` hängen in den Extends dieser beiden Apps): ein
Nitro-Dev-Reload mitten in einer laufenden Anfrage lässt sie stehen, und das
Skript setzt kein Socket-Timeout. Wer den Beweis führt, prüft bei einem Hänger
also erst den Dev-Server (`curl` auf dieselbe Route), bevor er den Code
verdächtigt. Der dritte Lauf lief in einem Zug durch.

**F32 (Mittel) — UNTER DER WILDCARD IST JEDER MANDANT „SAME-SITE".** Der
CSRF-Herkunftscheck (`core/server/middleware/03.csrf-origin.ts`) lehnte nur
`Sec-Fetch-Site: cross-site` ab und ließ `same-site` bedingungslos durch. Das
ist richtig für eine App auf EINEM Host — dieses Deployment hängt aber unter
`*.pukalani.app`, und dort ist jeder Mandanten-Host same-site zu jedem
anderen. `boese-community.pukalani.app` durfte also schreibende Requests an
`verein.pukalani.app` schicken, und der Browser meldete brav „same-site".
Heute hält noch das `SameSite=Lax`-Cookie; scharf wird es genau dann, wenn das
partitionierte Embed-Cookie (`SameSite=None`) kommt — also in dem Moment, für
den dieser Check überhaupt gebaut wurde.

Gefixt mit der kleinsten Härtung: `same-site` fällt jetzt in den
Origin-gegen-Host-Vergleich, der drei Zeilen weiter unten schon stand. Ein
`same-site` OHNE `Origin` wird abgelehnt — same-site heißt per Definition
cross-origin, ein Browser schickt dabei immer einen Origin, seine Abwesenheit
ist ein Widerspruch. Bewusst NICHT strenger wurden `same-origin` (bei manchen
gleichherkünftigen Formular-POSTs fehlt der Origin — ein Zwang bräche echte
Requests, ohne etwas zu gewinnen), `none` und der origin-lose
Server-zu-Server-Fall (Stripe-Webhook, curl: kein Browser-Cookie im Spiel).

Die Entscheidung liegt jetzt PURE in `core/server/utils/csrfOrigin.ts`, die
Middleware ist nur noch Gate + Header-Auslesen.

**DER EMBED-FLUSS BRICHT NICHT — nachgeprüft, nicht vermutet.** `apps/comments`
ist der einzige aktive Konsument (`csrfOriginCheck: true`). Alle unsicheren
Embed-Routen werden aus einem Dokument DERSELBEN Origin gerufen: das iframe
zeigt auf `<widget-host>/embed` und ruft `<widget-host>/api/*`, das Login-Popup
ruft `/api/auth/embed-handoff` von der Widget-Origin, das iframe danach
`/api/auth/embed-session`. Alle melden `same-origin`. `embed.js` läuft zwar auf
der fremden Gastgeber-Seite, macht dort aber nur GET (`/api/comments/count`) —
unsichere Methoden fasst die Regel gar nicht an. Es war also **keine Ausnahme
zu ziehen**, und das ist die eigentliche gute Nachricht: hätte es eine
gebraucht, wäre sie die Sollbruchstelle des ganzen Checks geworden.

**Beweis:** 13 Fälle (`packages/core/tests/csrfOrigin.test.ts`) — same-origin
mit und ohne Origin, same-site mit passendem Origin (nur Schema unterschiedlich),
same-site mit fremdem Mandanten-Host, same-site mit anderem PORT, same-site ohne
Origin, `'null'` aus einem sandboxed iframe, Präfix-/Suffix-Tricks am Hostnamen,
cross-site (auch mit passend gefälschtem Origin), `none`, fehlender Header mit
und ohne Origin.

**F33 (Niedrig) — DIE NAHT GLAUBTE DEM AUFRUFER SEIN PROJEKT.**
`POST /api/control/community/members/user-erase` nahm `runtimeProjectId` aus
dem Body und scopte hart darauf. Das fehlende JWT ist begründet (das Konto ist
beim Aufruf schon gesperrt und gleich weg), aber niemand prüfte das genannte
Projekt: wer das Service-Secret hatte, konnte damit Mitgliedschaften und
Einladungen in JEDEM Runtime-Projekt löschen — also im Silo eines fremden
Kunden. Jetzt hält `assertOnboardingRuntimeProject` (control
`server/utils/onboardingService.ts`) das genannte Projekt gegen das EINE, das
diese Naht bedient (`onboardingRuntimeProject`), und antwortet sonst 403. Der
Body darf das Projekt weiterhin NENNEN — aber nur, um bestätigt zu werden.

**MITGEFIXT, weil derselbe Schnitt:** `members/user-data.post.ts`, die
Auskunfts-Route daneben, hatte die identische Lücke in Leserichtung. Eine
Auskunft über die Mitgliedschaften und Einladungs-ADRESSEN eines fremden
Runtime-Projekts ist auch ohne Schreibrecht ein Datenleck. Beide sind die
einzigen Community-Routen, die ihr Projekt aus dem Body nahmen — alle anderen
ziehen es ohnehin aus `verifyRuntimeIdentity` (nachgezählt: 7 Routen,
`Query.equal('runtimeProjectId', identity.projectId)`).

**Beweis:** `packages/control/tests/onboardingRuntimeProject.test.ts` —
eigenes Projekt (auch mit Whitespace aus Env-Dateien), fremdes Projekt,
Teil-Treffer (`pool` vs. `poo`/`pool2`), Groß-/Kleinschreibung (Appwrite-Ids
sind case-sensitiv, also wird NICHT normalisiert), leer gegen leer.

**F34 (Niedrig) — EIN TIMEOUT SCHALTETE DIE MANDANTEN-TRENNUNG DER GLOCKE AB.**
`runScopedNotificationQuery` fing JEDEN Fehler und wiederholte die Abfrage
UNGESCOPT. Gedacht war das als Deploy-Brücke für den Fall „Spalte noch nicht
migriert"; getroffen hat es auch Timeouts, Appwrite-5xx und abgerissene
Sockets — also genau die Fehler, die im Betrieb tatsächlich vorkommen. Für die
Dauer der Störung mischten sich fremde Communities in die Glocke.

**ENTSCHIEDEN: verengen statt streichen.** Der Rückfall feuert jetzt nur noch
bei `code === 400` UND `general_query_invalid` (bzw. „attribute not found" im
Text, falls Appwrite den Typ je umbenennt) — `isUnknownScopeColumnError`, pure
und getestet. Alles andere fliegt durch; der Aufrufer bekommt seinen 5xx, und
die Glocke bleibt getrennt. Ganz entfernt wurde die Brücke NICHT, obwohl die
Migration überall gelaufen ist: in diesem Zustand kostet sie nichts (sie kann
nur noch auf einer Instanz ohne Migration feuern) und deckt denselben Fall bei
der NÄCHSTEN Umbenennung der Spalte wieder ab — die es schon gab
(`tenantId` → `communityId`, system-025). Was sie nicht mehr darf, ist bei
irgendetwas anderem feuern. Ein Transportfehler ist kein Grund, eine
Sicherheits-Grenze fallen zu lassen.

**Beweis:** `packages/core/tests/notificationScopeFallback.test.ts` — 400er
mit und ohne Typ, 500/504/ECONNRESET/429/401 und blanke Fehler als „nicht der
Fall", dazu der Ablauf selbst: Normalfall EIN gescopter Lauf, Silo ohne
Rückfall-Pfad, nicht migrierte Spalte mit genau EINEM ungescopten
Wiederholungslauf, Timeout mit genau EINEM Versuch und durchgereichtem Fehler.

**F35 (Niedrig) — DIE ATTRAPPEN-PHRASE WAR AN DER GROSSSCHREIBUNG ZU ERKENNEN.**
Seit G4 antwortet `/api/auth/otp` bei geschlossener Registrierung auch für
unbekannte Adressen 200, mit einer erfundenen Sicherheitsphrase. Der Code nannte
die selbstgebaute Wortliste eine „ehrliche Grenze" („wer beide Listen kennt,
könnte an EINEM Wort erkennen …"). **Nachgemessen ist es viel schlimmer als
das:** Appwrite baut die Phrase in `src/Appwrite/Auth/Phrase.php` aus einem
GROSSgeschriebenen Adjektiv und einem KLEINgeschriebenen Substantiv („Radiant
zebra") — unsere Attrappe schrieb BEIDE Wörter groß („Amber Anchor"). Die
Unterscheidung brauchte also gar keine Wortlistenkenntnis: die
Groß-/Kleinschreibung des zweiten Wortes verriet in **100 % der Fälle**, dass
keine Mail unterwegs ist. Genau die Konten-Enumeration, die der stille Pfad
verhindern sollte, funktionierte weiter. Obendrein lagen nur 6 von 16
Adjektiven und 1 von 16 Substantiven überhaupt in Appwrites Listen.

Gefixt mit Appwrites EIGENEN Listen, verbatim übernommen
(`core/server/utils/securityPhrase.ts`) — nicht abgetippt, sondern aus dem
laufenden Container gelesen (`docker exec appwrite cat
/usr/src/code/src/Appwrite/Auth/Phrase.php`, Appwrite 1.9.6): 129 Adjektive,
104 Substantive **einschließlich der drei Dubletten** („umbrella", „globe",
„xylograph" stehen dort je zweimal). Appwrite zieht mit `array_rand`, eine
Dublette hat also die doppelte Wahrscheinlichkeit — wer die Liste „aufräumt",
baut den statistischen Unterschied wieder ein, den diese Datei beseitigt.

**Die Drift-Sorge des alten Kommentars war richtig, aber die kleinere Gefahr:**
Drift entsteht nur, wenn Appwrite die Liste ÄNDERT, und verrät dann höchstens
die hinzugekommenen Wörter. Der bisherige Zustand verriet jede einzelne
Attrappe sofort. Die Datei gehört jetzt auf die Prüfliste beim
Appwrite-Upgrade; der Vergleich ist der eine `docker exec`-Befehl oben.

**Beweis:** `packages/core/tests/securityPhrase.test.ts` — Umfang (129/104,
101 eindeutige Substantive, die drei Dubletten je zweimal), Groß-/Kleinregel
beider Listen, keines der alten Eigenbau-Substantive mehr enthalten, und 500
gezogene Phrasen, deren beide Wörter aus den Listen stammen („ice cream" mit
Leerzeichen inklusive) und deren zweites Wort kleingeschrieben ist. Live
mitbewiesen in `verify-site-authz.mjs` Abschnitt 10c („OTP: UNBEKANNTE Adresse
antwortet identisch").

**F23 (Niedrig) — DER STATS-CACHE TRUG EINE MANDANTENZAHL ÜBER HOST-GRENZEN.**
`/api/admin/users/stats` hielt ALLE VIER Zahlen in einer prozessweiten,
ungeschlüsselten 60-Sekunden-Variablen. Drei davon sind projektweit
(`total`/`active`/`new` aus `users.list()`; im Pool teilen sich alle
Communities EIN Appwrite-Projekt), die vierte — `online` aus
`listOnlinePresences(event)` — ist seit A4 mandantengescopt. Ein Betreiber, der
binnen einer Minute zwei Community-Hosts ansah, bekam auf dem zweiten die
Anwesenheitszahl des ersten.

**ENTSCHIEDEN: trennen statt schlüsseln.** Ein mandantengeschlüsselter Cache
(Muster `tenantCacheScope`) hätte die Zahlen MITGESCHLEPPT, die gar nicht pro
Mandant verschieden sind — und mit ihnen den teuren Teil: `active` scannt bis
zu 5.000 Nutzer per Cursor, weil `accessedAt` bei Appwrite nicht queryfähig
ist. Bei N Communities wären das N Scans für N identische Ergebnisse; ein
Cache, der Last sparen soll, hätte sie vervielfacht. `online` dagegen ist EIN
Presences-Aufruf ohne Scan — es zu cachen sparte praktisch nichts und war der
einzige Grund, warum der Cache falsch sein konnte. Es kommt jetzt bei jedem
Request frisch, was für eine Live-Zahl ohnehin das richtige Verhalten ist.

Der Cache liegt jetzt in `admin/server/utils/userStatsCache.ts` (auf dem
bestehenden `createMicrocache`), sein Schlüssel ist das APPWRITE-PROJEKT —
genau das, was diese Zahlen beschreiben. Im Betrieb ist das ein einziger
Eintrag; er steht trotzdem im Schlüssel, damit der Cache nicht wieder zu einer
namenlosen Variablen wird, an die man den nächsten Wert einfach anhängt. Der
Typ `ProjectUserCounts` schließt `online` STRUKTURELL aus.

**Beweis:** `packages/admin/tests/userStatsCache.test.ts` — Treffer im TTL
lädt nicht nach, ein anderes Projekt bekommt einen eigenen Eintrag, nach TTL
wird neu geladen, das Ergebnis trägt genau die Schlüssel `total`/`active`/`new`;
dazu zwei Quelltext-Prüfungen an der Route (Muster
`dashboard-stats-authz.test.ts`): `listOnlinePresences` steht AUSSERHALB des
gecachten Laders, und es gibt keine eigene `let cache`-Variable mehr.

**Gelernt (drei Zeilen, die zusammengehören):**

1. **Ein „ehrlicher Grenze"-Kommentar ist eine Behauptung, bis jemand
   nachmisst.** F35 stand als bewusst getragener Restposten im Code — mit einer
   Begründung, die plausibel klang und die eigentliche Lücke (die
   Groß-/Kleinschreibung) gar nicht erwähnte, weil niemand die Referenz
   aufgemacht hatte. Sie lag zwei `docker exec` entfernt. Wo ein Kommentar eine
   fremde Implementierung beschreibt, gehört die Quelle DAZU — Pfad, Version
   und der Befehl, mit dem man es nachprüft.
2. **Ein Fehler-Rückfall braucht ein Fehler-PRÄDIKAT.** `catch (error)` ohne
   Bedingung sagt „bei Problemen die Sicherheitsregel weglassen" — und trifft
   dann garantiert die Fälle, für die es nicht gedacht war. Wer eine
   Deploy-Brücke baut, prüft den Fehler, den die Brücke überbrücken soll.
3. **Ein Cache ohne Schlüssel ist ein Versprechen, dass alles darin global
   gilt.** Als er gebaut wurde, stimmte das; `online` kam später dazu und hat
   das Versprechen still gebrochen. Deshalb hier nicht „Schlüssel dran",
   sondern erst die Frage „was IST hier eigentlich projektweit?" — die Antwort
   war ein eigener Typ, und der lässt den nächsten Anbau nicht mehr zu.

---

## F30 — die Live-Beweise laufen jetzt mit (2026-08-02)

**Der Befund:** im Repo lagen 24 `verify-*.mjs`. In der CI lief davon GENAU
EINER (`verify-paid-ticket`, seit G2). Alle anderen prüften, wer zufällig daran
dachte — und genau deshalb blieben am 2026-08-02 ein toter Geldpfad und ein
Isolations-Loch wochenlang unentdeckt, OBWOHL es für beide einen Beweis gab.
Ein Beweis, den niemand ausführt, ist kein Beweis, sondern eine Datei.

**Eingehängt in `e2e.yml` (fünf neue Schritte, alle grün gemessen):**
Mandanten-Isolation `comments`/`reports`/`pages` (13 Prüfungen) ·
Mandanten-Isolation `posts`/Votes/Polls (7) · Sichtbarkeit je Community aus
GAST-Sicht, C18/F28 (38) · Presence-Grenze Akt 1 an der Appwrite-API, A4 (10) ·
Index-Anstoß bei vergiftetem Metadaten-Cache, F19 (9). Zusammen **+~30 s** auf
einen Job von ~5 min. Jeder bekam einen EIGENEN Schritt mit sprechendem Namen:
ein roter Lauf soll am Schritt-Namen zeigen, welche Zusage gebrochen ist,
statt in einem Sammel-Schritt zu verschwinden.

**Bewusst NICHT eingehängt:** die übrigen 18. Dreizehn davon brauchen einen
Platform-Dev-Server MIT den Wegwerf-Communities `kunde-a`/`kunde-b` in einem
Control-Plane-Projekt, fünf zusätzlich einen zweiten Dev-Server (`apps/control`)
und teils Mailpit; `verify-community-suspension` allein braucht ~20 min. Das ist
EIN fehlendes Stück Bühne, nicht achtzehn Probleme — die Skizze steht in
`docs/referenz/LIVE-BEWEISE.md`. Nicht nebenbei gebaut, weil die E2E ein
Deploy-Gate ist: eine halb gebaute Bühne erzeugt rote Läufe, die nichts über
das Produkt aussagen, und rot heißt hier „kein Deploy".

**Beweis:** alle sechs Schritt-Rümpfe aus dem YAML extrahiert, mit `bash -n`
geprüft und einzeln in Workflow-Reihenfolge aus dem Repo-Wurzelverzeichnis
gefahren (Exitcode 0); der Wächter des Redis-Schritts gegengeprüft (Exitcode 1
mit `::error::`-Ansage); alle sechs Workflow-Dateien durch einen YAML-Parser.

**Gelernt (drei Zeilen):**

1. **Eine zweite Appwrite auf demselben Docker-Daemon ist keine zweite
   Appwrite.** Der Versuch, die CI-Instanz lokal nachzustellen, scheiterte
   zweimal an Übersprechen: traefik entdeckt Container über den DOCKER-SOCKET,
   nicht über das Compose-Projekt — es griff sich die Container der laufenden
   Dev-Instanz und verteilte Anfragen im Wechsel (Konto angelegt auf Stack A,
   Login gegen Stack B ⇒ „Invalid credentials", ein Fehler, den es nicht gab).
   Danach nahm der `databases`-Worker des zweiten Stacks gar keine Aufträge mehr
   an; Spalten blieben für immer auf `processing`. In CI gibt es diesen Fall
   nicht (ein Stack, ein Runner) — lokal muss man am traefik VORBEI direkt auf
   den Container zielen, oder es bleiben lassen.
2. **Vor jedem Live-Beweis gehört geprüft, WER auf dem Port liegt.** Ein
   „Fehlschlag" von `courses/verify-silo-unchanged` war in Wahrheit
   `apps/control` auf :3001 statt `apps/comments` — dieselbe Falle, die
   CLAUDE.md unter WORKTREE-BEWEISE beschreibt, nur eine Tür weiter.
   `lsof -nP -iTCP -sTCP:LISTEN`, dann das `cwd` des Prozesses ansehen.
3. **Einen Container-Namen nicht raten, wenn man ihn erfragen kann.**
   `<projekt>-<dienst>-<n>` stimmt heute; als HARTE Zeile in einem Deploy-Gate
   wäre es eine stille Kopplung, die bei einer Umbenennung wie ein Produktfehler
   aussieht. `docker compose ps -q redis` liefert die Id, und fehlt sie, bricht
   der Schritt mit eigener Ansage ab.

### G6 — Sichtbarkeit der Titelbilder + zwei Sperr-Entscheidungen ✅ 2026-08-02

**Was das war.** Vier Punkte aus dem Nacht-Audit in `packages/events`,
`packages/media`, `packages/posts`, `packages/comments`: ein Rest-Leck bei den
Titelbildern (F28), zwei von David an mich delegierte PRODUKT-Entscheidungen zur
Zahlungssperre (F25, F26) und zwei tote Typ-Felder (F29). Jeder Befund wurde
erst reproduziert, dann gefixt; die zwei Entscheidungen stehen jetzt AN BEIDEN
Stellen, die sie betreffen, samt der überstimmten Gegenargumente.

---

**F28 (Mittel) — EIN ENTWURFS-TITELBILD SAHEN ALLE MITGLIEDER.**

Der große Teil war schon zu (events-009 band die Cover-Datei an ihre Row); übrig
blieb eine Ausnahme mit gutem Grund: ein Cover, dessen Row kein Leserecht trägt
(Entwurf), bekam ersatzweise das MITGLIEDER-Publikum der Community. Der Grund
war die Vorschau im Bearbeiten-Dialog — die holte der BROWSER direkt aus dem
Bucket, „niemand" hätte dort ein kaputtes Bild bedeutet. Die Wirkung: jedes
Mitglied konnte das Titelbild eines unveröffentlichten Termins per Roh-URL
abrufen. Die Datei war offener als ihre Zeile, und genau das darf nicht sein.

Gefixt, indem der GRUND weggeräumt wurde statt der Regel: neue Route
`GET /api/events/:id/cover` (server-seitig, hinter `events.manage` UND der
Datentür; die fileId kommt aus der geprüften Row, nie aus der URL; skaliert auf
800 px WebP, `Cache-Control: private, no-store`). Damit ist die Regel wieder
eine Zeile — **eine Datei ist nie offener als ihre Zeile** —, und sie steht PURE
in `packages/events/shared/coverAudience.ts`, gelesen von der Laufzeit UND vom
Live-Beweis. `eventCoverPermissions()` hat dabei seinen `H3Event`-Parameter
verloren: die Rechnung hängt an nichts mehr außer der Row, und ein ungenutzter
Parameter wäre eine Einladung, wieder Request-Wissen hineinzuziehen. Migration
**events-010** zieht den Bestand nach (eigene Migration statt Korrektur an 009 —
009 ist gelaufen, und beide hintereinander ergeben denselben Endzustand).

**MEDIA WAR NICHT BETROFFEN, nachgemessen statt vermutet.** Dort bekommen Row
und Datei an JEDER Stelle dasselbe Array (Anlegen, Umschalten, C18-Umzug); die
Entwurfs-Datei ist genauso weit offen wie ihre Zeile, nämlich für ein einziges
Operator-Label. Was dort bleibt, ist Vorschau-KOMFORT im Pool (die eigene
Redaktion sieht ihre Entwurfs-Kacheln nicht), kein Publikum — die neue
events-Route ist die Vorlage dafür, wenn es drankommt.

---

**F25 (Produktentscheidung) — SWEEPS IN EINER GESPERRTEN COMMUNITY: AUFGETEILT.**

Beide Sweeps laufen bewusst ohne `actor`, die Inhalts-Sperre der Datentür greift
also bei keinem von beiden. Die Antwort ist trotzdem nicht dieselbe, und die
Grenze verläuft zwischen ÄNDERN und ANLEGEN:

* `publish-on-read` (posts) **läuft weiter**. Es ändert nur die SICHTBARKEIT
  einer vorhandenen Zeile, die der Autor vor der Sperre auf genau diesen
  Zeitpunkt gestellt hat. Nichts entsteht, nichts kostet Kontingent — sie
  festzuhalten wäre keine Mahnung, sondern die nachträgliche Zensur eines
  fertigen Beitrags.
* `Serien-Top-up` (events) **hält an**. Es erzeugt NEUE Zeilen und verbraucht
  Kontingent; das ist genau, was die Zahlungssperre meint. Ohne die Bremse wächst
  eine Serie monatelang weiter, ausgelöst von jedem beliebigen Lese-Request eines
  Fremden.

Die Prüfung steht VOR dem Marker `seriesGeneratedUntil` — würde er trotz Sperre
geschrieben, hielte er das Fenster für erledigt und die Serie bekäme nach dem
Entsperren ein Loch, das nie wieder auffällt. Fail-soft (Rückgabe 0 + `logEvent`,
kein Wurf): der Sweep hängt an einem fremden Listen-Aufruf, der weiter
funktionieren muss. Die Begründung steht an BEIDEN Stellen, jeweils mit Verweis
auf die andere — wer die Entscheidung dreht, dreht sie zweimal.

---

**F26 (Produktentscheidung) — RSVP ZURÜCKZIEHEN BLEIBT OFFEN.**

Dieselbe Logik wie bei Davids Absage-Entscheidung: eine Rücknahme ist keine neue
Aussage. Wer nicht absagen kann, blockiert einen Platz und verfälscht die
Planung des Organisators — wegen einer Rechnung, mit der er nichts zu tun hat.

Die eigentliche Arbeit war nicht die Entscheidung, sondern die Toggle-Semantik:
Zusagen und Zurückziehen sind DERSELBE Aufruf mit DEMSELBEN Body, sie
unterscheiden sich nur am Bestand. Die Route hat deshalb jetzt zwei Türen —
`actor: 'member'` für alles, was eine neue Aussage ist, und eine türlose
(`{ as: 'operator' }`, dieselbe Bauart wie beim Absagen) für genau den Zweig, der
die eigene Zeile löscht, Zähler-Dekrement inklusive. Eng gezogen: der WECHSEL
going → declined bleibt zu, obwohl er ebenfalls einen Platz frei machen würde —
er hinterlässt eine neue Aussage. Der Weg zum freien Platz steht trotzdem offen
(dieselbe Schaltfläche erneut). Die Ausnahmen werden ab jetzt an EINER Stelle
geführt (`[id].delete.ts`); die Liste ist von einem auf zwei Einträge gewachsen,
statt dass sich der neue Weg auf eine Formulierung beruft, die ihn nicht kennt.

**DABEI GEFUNDEN, echter Fehler:** der Zusage-Zweig übersetzte JEDEN Fehler des
atomaren Hochzählens in `409 Event is full`. In einer gesperrten Community warf
die Datentür dort ihr 403 mit `reason: community_suspended` — der Kunde las
„Event is full" an einem leeren Termin ohne Kapazitätsgrenze. Der Beweis lief
genau deshalb erst rot. Jetzt reist ein fertig geformter H3-Fehler unverändert
weiter (`isError`), übersetzt wird nur der rohe Appwrite-Fehler.

---

**F29 (Niedrig) — ZWEI TOTE `tenantId`-FELDER** in `comments/shared/types/
comment.ts` und `media/shared/types/media.ts` entfernt. Die Spalten sind mit
comments-017/media-005 gefallen, gelesen oder geschrieben wurden die Felder
nirgends. An ihrer Stelle steht jetzt der Grund, warum dort NICHTS steht — genau
diese Drift zwischen Typ und Schema hat im events-Layer den Geldpfad gebrochen.

---

**Beweise (alle live, gegen die laufende Instanz).**
`verify-community-suspension` **117/117** (vorher 95, +22: RSVP in beide
Richtungen samt Zähler, der Wechsel als Gegenprobe, beide Sweeps in beide
Richtungen) · `verify-audience-flip` **38/38** (vorher 25, +13: die vier
Zustände eines Titelbilds, je anonym UND als eingeloggtes Mitglied mit
Community-Label — inklusive einer VORHER-Messung, die den Befund zeigt) ·
`verify-paid-ticket` 13/13 · Pool-Isolation events 14/14, posts 7/7,
comments 13/13 · `pnpm -r test` (1409 grün), typecheck, lint (6 bekannte
Warnungen), `check:manifests`.

**Gelernt (vier Zeilen):**

1. **Ein Gast-Abruf beweist bei Mitglieder-Rechten gar nichts.** Der Befund war
   ja gerade, dass die Datei das MITGLIEDER-Publikum trug — der Gast scheiterte
   vorher wie nachher. Ein Beweis muss den Betrachter haben, um den es geht:
   `verify-audience-flip` legt dafür jetzt ein echtes Konto mit dem
   Community-Label an und liest mit dessen Sitzung.
2. **Ein Sweep-Beweis muss dem Sweep erst etwas ZU TUN geben.** Der erste Anlauf
   maß „nach der Sperre kam kein Termin dazu" — es wäre auch ohne Sperre keiner
   dazugekommen, das Rolling Window war voll. Erst das Löschen der jüngsten
   Instanzen (Lücke) macht aus „nichts passiert" eine Aussage. Dieselbe Falle
   wie bei jedem idempotenten Vorgang: kein Effekt ist kein Ergebnis.
3. **Ein `.catch()` ohne Fallunterscheidung ist eine Falschauskunft mit Ansage.**
   „Event is full" war jahrelang die Antwort auf jeden Fehler beim Hochzählen.
   Gefunden hat es kein Test, sondern der Live-Beweis, der einen konkreten GRUND
   erwartete statt nur einen Status.
4. **Zwei Appwrite-Stacks auf demselben Docker-Daemon sprechen über.** Während
   der Läufe stand parallel eine Wegwerf-Instanz (F30) auf denselben
   Docker-Netz; traefik entdeckt Container über den SOCKET und verteilte
   Anfragen abwechselnd auf beide — jede zweite meldete
   `project_not_found`. Erkennbar am Wechselmuster, nicht am Fehlertext. Ausweg:
   am traefik vorbei direkt auf die Container-IP der gemeinten Instanz zielen.
   (Deckt sich mit dem, was F30 an derselben Stelle gelernt hat.)

---

### F31 — die vierte Stelle der Theme-Feldliste ✅ 2026-08-02

`ThemeConfig` (`packages/themes/shared/ramp.ts`) wächst additiv — das
config-JSON trägt bewusst kein `version`. Seit G3 hängen zwei Stellen am Typ
(`THEME_CONFIG_KEYS` per `Record<keyof Required<ThemeConfig>, true>`, und der
JSON-Import der Galerie-Seite leitet seine Liste daraus ab). Die Aufgabenliste
nannte eine dritte, die weiter von Hand nachzuziehen war: die strikte
Zod-Prüfung der Speicher-Routen. **Beim Nachzählen waren es vier** — das Schema
steht WÖRTLICH ZWEIMAL im admin-Layer, in `themes/index.post.ts` und in
`themes/[id].patch.ts`.

Diese vierte Stelle ist die einzige, an der ein Auseinanderlaufen wehtut, und
zwar sofort: das Schema ist `.strict()`. Ein Feld, das die Liste kennt und das
Schema nicht, lässt nicht dieses eine Feld fallen, sondern weist den GANZEN
Speichervorgang mit 400 ab — der Editor ließe sich dann gar nicht mehr
speichern. Und weil die Kopie doppelt liegt, wäre auch „anlegen geht, bearbeiten
wirft 400" ein möglicher Zustand.

**Entschieden wurde gegen ein geteiltes Schema — nicht aus Bequemlichkeit,
sondern weil es dafür kein legales Zuhause gibt.** Der naheliegende Weg wäre,
das Zod-Schema aus `packages/themes` zu exportieren und im admin-Layer zu
importieren. Beide Richtungen sind von der Layer-Grenze A14 gesperrt, und zwar
per ESLint-Backstop, nicht nur per Prosa: `packages/themes/**` darf **kein**
`@pukalani/*` importieren (auch core und system nicht — themes ist rein
visuell), und `packages/admin/**` darf keinen anderen Feature-Layer importieren,
also auch nicht `@pukalani/themes`. Ein gemeinsames Zuhause gäbe es erst nach
einer bewussten Änderung der Layer-Matrix; das ist eine
Architektur-Entscheidung, keine Aufräumarbeit, und sie gehört David, nicht
einem Aufräum-Auftrag.

**Gebaut wurde deshalb ein Quelltext-Anker** in
`packages/themes/tests/themeConfigKeys.test.ts` (Muster: die Anker in
`packages/events/tests/redaction-actor.test.ts`). Er LIEST die beiden
admin-Dateien, zieht die Schlüssel der obersten Ebene aus dem
`themeConfigSchema`-Literal und hält sie gegen `THEME_CONFIG_KEYS` — plus zwei
Zusicherungen, die die eigentliche Falle abdecken: beide Routen prüfen wörtlich
dasselbe, und `.strict()` bleibt stehen (ohne `.strict()` verschwände ein
unbekanntes Feld still, der Test wäre grün und das Theme trotzdem falsch
gespeichert). Geprüft werden bewusst nur die SCHLÜSSEL, nicht die Wertebereiche:
ob `hueShift` von −180 bis 180 geht, ist eine Produktfrage mit genau einer
richtigen Antwortstelle; ob ein Feld überhaupt BEKANNT ist, ist eine
Ja/Nein-Tatsache, und nur die kann auseinanderlaufen.

Beweis: `pnpm --filter @pukalani/themes test` **157/157** (vorher 153),
`check:themes` grün.

**Gelernt:** Wenn zwei Stellen zusammengehören und die Layer-Grenze einen Import
zwischen ihnen verbietet, ist der Quelltext-Anker nicht die faule Lösung,
sondern die einzige, die keine Grenze verschiebt — er LIEST die Datei, er
importiert sie nicht. Zweite Lehre, teurer: **die Aufgabenliste sprach von drei
Stellen, es waren vier.** Die vierte war eine wörtliche Kopie der dritten in der
Nachbardatei. Vor dem Beheben einer Doppelung immer erst zählen, statt der
Beschreibung zu glauben — sonst hält man zwei von drei Kopien zusammen und die
dritte läuft weiter weg.

---

### F22 — tote Doku-Verweise: einmal aufgeräumt, dann bewacht ✅ 2026-08-02

Die Aufgabenliste nannte EINEN Fall (CLAUDE.md behauptete, `community.delete`
sei bewusst nicht gebaut — seit C16 vom 2026-07-31 ist es gebaut, als
Stilllegen). Gesucht wurde nach dem ganzen Muster, und zwar mit einem Werkzeug,
das bleibt: **`scripts/ops/verify-doc-links.mjs`** (`pnpm check:doc-links`).
Es prüft in `docs/**`, `CLAUDE.md`, `AGENTS.md`, `README.md` und in den
Kopfkommentaren aller Skripte drei Dinge: Markdown-Links auf Repo-Dateien,
`[[…]]`-Verweise und pfad-artige Angaben in Backticks. Dazu die Routen der
internen Doku-Site (`docs/content/**` → `/architektur/migrationen`), die sonst
niemandem beim Schreiben auffallen, sondern erst dem Leser als 404.

**Die eigentliche Arbeit war die Kalibrierung, nicht das Finden.** Der erste
Entwurf meldete **120 Stellen, davon war eine Handvoll echt** — die Doku ist
voller Fragmente, die wie Pfade aussehen und keine sind (`pages/login.vue` in
einer Aufzählung, `users/[id].vue` als Name einer Dashboard-Seite,
`src/main.js` aus dem Beispiel-Repo eines fremden Projekts). Drei Regeln haben
daraus ein brauchbares Signal gemacht:

1. **Nur eindeutige Repo-Pfade zählen** — entweder ab Wurzel (`packages/…`) oder
   in der gewachsenen Layer-Kurzform (bekannter Layer-/App-Name + Struktur-Ordner,
   also `core/server/…`, `themes/shared/…`). Beide Segmente werden gegen die
   WIRKLICHEN Verzeichnisse geprüft, die Liste pflegt sich also selbst.
2. **Die Kurzform aus Layer-Sicht wird aufgelöst, nicht bestraft.** Die Doku
   schreibt ständig `scripts/generate-themes.ts` und meint
   `packages/themes/scripts/…`. Das ist die übliche Schreibweise hier, kein
   Fehler.
3. **`[[…]]` bedeutet in diesem Repo „Notiz AUSSERHALB"** — nachgesehen: alle
   zehn zeigen in Davids Obsidian-Vault oder auf eine Claude-Memory-Notiz (eine
   trägt das sogar als „(Memory)" dabei). Sie werden aufgelistet, nie als Fehler
   gezählt; prüfbar wären sie nur gegen ein Verzeichnis auf einer bestimmten
   Maschine, und ein Wächter, der nur dort grün ist, ist keiner.

**Die Grenze, an der das Skript aufhört — und warum sie so verläuft.**
`docs/archiv/**`, `docs/OPEN-ITEMS-COMPLETE.md`, `README.md` und `CHANGELOG.md`
sind PROTOKOLLE. Ein Dateiname im Fließtext ist dort eine historische Aussage
(„die Datei hieß damals so"); ihn zu „korrigieren" wäre Geschichtsfälschung.
Ein Link auf ein DOKUMENT ist etwas anderes: er verspricht „hier kannst Du es
nachlesen", und das altert nicht — zieht die Datei um, muss der Link mitziehen,
es ist ja dasselbe Dokument. Deshalb: **Dokument-Links überall erzwungen, auch
im Archiv; Pfad-Angaben und Links in den CODE nur außerhalb der Protokolle**
(`--strict` macht auch sie zu Fehlern, für eine bewusste Durchsicht).

**Gefunden und behoben (7 Stellen):**

- **CLAUDE.md, `community.delete`** — der genannte Fall. Steht jetzt richtig da:
  gebaut als Stilllegen (`communities.status='disabled'`, Host 404 in ≤30 s,
  Mitgliedschaften 'removed', INHALTE BLEIBEN), gesperrt bei laufendem Abo,
  samt beider Routen.
- **CLAUDE.md, `tenants.*` → `communities.*` (6 Stellen)** — die Tabelle
  `tenants` ist mit control-030 GEFALLEN (E8-3, Umbenennung control-029). Wer
  nach `tenants.theme` oder `tenants.openRegistration` greppt, findet nichts.
- **CLAUDE.md, `Role.label(siteId)` → `Role.label(communityId)`** und die
  Presence-Zeile `read("label:<siteId>")` — dieselbe Umbenennung.
- **CLAUDE.md, die Pool-Scope-Spalte** — `create` stempelt `communityId` (nicht
  mehr `tenantId`), `notifications.communityId`, `<communityId>` als
  Spaltenwert. Die INDEXNAMEN (`uq_tenant_host`, `uq_tenant_slug`) blieben
  dagegen unverändert; das steht jetzt ausdrücklich dabei, sonst „korrigiert"
  sie der nächste Durchgang fälschlich mit.
- **`docs/CONCEPT.md`** — das Migrations-Beispiel zeigte auf
  `comments/…/001-comments-tables.ts`; die früheste vorhandene ist `002-`.
- **`docs/archiv/VOKABULAR-AUFRAEUMEN.md` + der E8-Eintrag hier** — beide
  verlinkten `plans/UMBENENNUNG-AUF-COMMUNITY.md`; der Plan ist ausgeführt und
  liegt in `archiv/`.
- **`docs/archiv/UMBENENNUNG-AUF-COMMUNITY.md`** — der Kopf sagte „Status:
  geplant, nicht ausgeführt" und „Liegt in `docs/plans/`", während die Datei im
  Archiv lag und die Etappen 1–4 am 2026-07-30/31 gelaufen waren. Kopf richtig
  gestellt, der Plan-Text darunter bewusst unverändert.

**Bewusst STEHEN GELASSEN (18 Pfad-Angaben in Protokollen + 10 externe
Notizen):** `docs/archiv/PRESENCE-GRENZE.md` nennt `siteLabel.ts` und
`site-label.ts`, `THEMES-VOLLAUSBAU.md` nennt `styleguide.vue` — alles Dateien,
die es unter diesen Namen einmal gab. Das Archiv ist Protokoll (CLAUDE.md,
Doku-Ordnung). Zwei davon stehen im Lern-Archiv selbst (`A4` nennt
`core/server/middleware/site-label.ts`, heute `06.community-label.ts`) und
bleiben aus demselben Grund.

Nicht behoben, weil außerhalb dieses Auftrags: **`tenantId` lebt im Code
weiter** — als Feld im Request-Kontext, als Presence-Metadatum
(`presenceFilter.ts`, in CLAUDE.md korrekt so benannt) und als Spalte
`communities.tenantId` (der Mandanten-SCHLÜSSEL, nicht die Row-Id). Die
Umbenennung betraf die Pool-Spalten, nicht das Wort. Wer hier weiter aufräumt,
muss die drei Bedeutungen auseinanderhalten.

Beweis: `pnpm check:doc-links` **0 tote Verweise**, Exit 0.

**Gelernt:** Ein Doku-Wächter scheitert nicht am Finden, sondern am Schreien.
Der erste Entwurf hatte eine Trefferquote von unter 5 % — so ein Skript wird
beim ersten Lauf abgeschaltet, und dann ist die Doku schlechter dran als ohne.
Die Regel, die es gerettet hat, ist nicht „strenger prüfen", sondern **„nur
prüfen, was maschinell EINDEUTIG entscheidbar ist"**: Pfade ja, Symbolnamen
nein (`requireEntitlement` ist kein Pfad, und eine Heuristik darauf meldete
jeden Begriff, der einmal anders hieß).
**Gelernt:** Die nützlichste Unterscheidung war nicht „Archiv oder nicht",
sondern **„Wegweiser oder Protokoll"**. Ein Link verspricht Erreichbarkeit und
muss auch in einem zehn Monate alten Dokument stimmen; ein Dateiname im
Fließtext beschreibt einen Zustand von damals und darf gar nicht stimmen. Wer
beides gleich behandelt, schreibt entweder Geschichte um oder lässt kaputte
Wegweiser stehen.
**Gelernt (Nebenbefund):** Die Umbenennung `tenants`→`communities` (E8-3) war im
CODE vollständig, in CLAUDE.md an **vierzehn** Stellen nicht — und CLAUDE.md ist das
Dokument, aus dem jeder Agent seinen Weltzustand bezieht. Eine Umbenennung ist
erst fertig, wenn auch die Anleitung sie kennt; sonst greppt der nächste nach
einer Tabelle, die es seit drei Tagen nicht mehr gibt.

### F24 — `/dashboard/settings/community` liegt jetzt bei seinen Routen ✅ 2026-08-02

Die Seite lag im **admin**-Layer und rief ausschließlich Routen des
**onboarding**-Layers (`/api/community/{registration,audience,delete}`) —
derselbe Schnitt-Fehler, wegen dem `/dashboard/members` (S9) und
`branding.vue` (F5) schon umgezogen waren. Der Leitsatz dahinter:
**eine Seite kann nur so weit reichen wie ihre Routen.**

Umgezogen ist die Datei nach
`packages/onboarding/app/pages/dashboard/settings/community.vue`, dazu die
i18n-Teilbäume `dashboard.community.*` und `dashboard.settings.community`
(de+en). Die Texte lagen bis heute in `admin`, obwohl `branding.vue`
(onboarding, seit F5) sie schon mitbenutzte — die Schicht-Grenze lief also
schon vorher quer durch eine Sprachdatei.

**Der eigentliche Punkt war der Reiter, nicht die Datei.** Er stand fest
verdrahtet in `packages/admin/app/pages/dashboard/settings.vue` und war nur zur
LAUFZEIT versteckt (`isTenantHost`). Eine Silo-App ohne onboarding hatte ihn
damit im Bauplan und verließ sich darauf, dass eine Beobachtung ihn wegblendet.
Jetzt gibt es dafür eine Registry — `pukalani.admin.settingsTabs`
(`packages/core/shared/types/settings-tab.ts`), dieselbe Bauart wie
`pukalani.admin.modules`: wer die Routen besitzt, registriert den Einstieg.
Gefiltert wird mit der BESTEHENDEN puren Regel aus
`core/shared/dashboardNav.ts` (Ort × Capability, `resolveSettingsTabs`) — kein
zweites Regelwerk für dieselbe Frage. Die vier KONTO-Reiter (Allgemein,
Benachrichtigungen, Geräte, Sicherheit) bleiben bewusst in der Hülle
verdrahtet: sie gehören dem admin-Layer, der die Hülle mitbringt.

Der ehrliche Hinweis statt der Schalter BLEIBT: `scope: 'community'` hält den
Reiter vom Kontroll-Host fern, aber `apps/platform` bedient Kontroll- UND
Mandanten-Hosts aus derselben App — die Seite ist über ihre URL dort weiterhin
erreichbar.

**Beweis je App** (`.nuxt` frisch erzeugt, `nuxi prepare`):

| App | Route `/dashboard/settings/community` | onboarding-app.config im Merge | Reiter möglich |
|---|---|---|---|
| comments | nein | nein | **nein** |
| photos | nein | nein | **nein** |
| portfolio | nein | nein | **nein** |
| control | nein | nein | **nein** |
| platform | ja | ja | ja |

Gegenprobe: `/dashboard/settings/security` existiert in allen fünf Apps
weiterhin — es sind die FREMDEN Reiter verschwunden, nicht die Hülle.
Dazu 9 neue Fälle in `packages/core/tests/settingsTabs.test.ts`,
`pnpm -r test` grün, `typecheck` Exit 0, `lint` Exit 0 (6 bekannte
Warnungen), `check:manifests` 18 Layer / 8 Apps,
`verify-site-authz` **118/118**, `verify-community-suspension` **117/117**.

**Gelernt:** „Versteckt" und „nicht vorhanden" sehen im Browser gleich aus und
sind es im Bauplan nicht. Der Reiter war seit S9 und F5 nachweislich falsch
platziert, aber weil eine Laufzeit-Bedingung ihn zuverlässig wegblendete, sah
jede Prüfung grün aus — der Fehler war nur durch die Frage „wem gehören die
Routen?" zu finden, nicht durch Hinsehen. Wo eine Seite lebt, entscheiden ihre
Routen; wo ihr Einstieg lebt, muss derselbe Layer entscheiden dürfen. Und:
i18n-Schlüssel wandern bei so einem Umzug MIT — sonst hängt der neue Layer
still am alten, und der nächste Silo-Aufbau merkt es erst, wenn Texte fehlen.

### Audit der nie geprüften Layer: blueprint · pages · system ✅ 2026-08-02

Drei Layer, die noch nie einzeln durchgesehen wurden. Sie halten ihre
Verträge — die drei Kern-Invarianten sind BESTANDEN, nicht knapp bestanden:

- **blueprint** ist weiterhin ein reiner Kompositions-Layer: acht Dateien,
  kein `server/`, keine Migrationen, keine Tables. Die vier Kompositionen
  (`feed.vue`, `events/[id].vue`, `courses/[slug]/lessons/[id].vue`,
  `layouts/default.vue`) existieren wirklich nur EINMAL — keine App unter
  `apps/*/app/pages` beschattet eine davon, und `comments` wie `platform`
  listen blueprint in `extends` VOR den Produkt-Layern.
- **pages** hält die Datentür lückenlos: alle sechs Routen unter
  `server/api/pages/**` gehen durch `tenantDb(event)`, kein rohes `.tablesDB`,
  ESLint deckt den Pfad ab. M13, C18, der Unique-Index pro Mandant und die
  MEDIUMTEXT-Grenzen stimmen; ein GDPR-Contributor fehlt zu Recht, weil
  `PageRow` gar keine Nutzerdaten trägt.
- **system** verteilt seine Tabellen nicht: alle neun Zugriffe auf `app_config`
  benutzen dieselbe eine Row `global`, Mandanten-Branding wird beim LESEN
  überlagert und nie hineingeschrieben, und keine Community-Rolle trägt
  `system.manage`. Alle 28 Migrationen sind idempotent, jede
  index-anlegende benutzt `createIndexSteps`.

**Direkt behoben (kleine, echte Fehler):**

1. **Die Reihenfolge einer Seite überlebte keine Bearbeitung** (pages,
   `server/api/pages/index.put.ts`). Der Upsert schrieb
   `sortOrder: body.sortOrder ?? 0` in BEIDE Zweige, die Dashboard-Seite sendet
   das Feld aber nie (sie hat kein Bedienelement dafür). Getroffen hat es genau
   die Seiten, für die `sortOrder` gedacht ist: `seedLegalPages` stempelt
   Impressum/Datenschutz bewusst auf 90/91, damit sie ans ENDE der Navigation
   rutschen — nach der ersten Korrektur standen sie vorn, ohne Weg zurück.
   Jetzt gilt beim Aktualisieren „fehlendes Feld heißt nicht angefasst"
   (dieselbe Regel wie `neutral` im Community-PATCH); beim Anlegen bleibt 0.
   Netz: `packages/pages/tests/page-sort-order.test.ts`.
2. **App-Code importierte eine Nitro-Route** (blueprint →  pages).
   `layouts/default.vue` holte `PublicPageNavItem` aus
   `pages/server/api/pages/public/index.get.ts` — einer Datei, die
   `node-appwrite` und Server-Auto-Imports auf oberster Ebene benutzt und die
   aus jeder `tsconfig.app.json` ausgeschlossen ist. Der Typ wohnt jetzt in
   `pages/shared/types/page.ts`, wo geteilte Domain-Typen hingehören.
3. **Eine Idempotenz-Prüfung, die ab 25 Spalten lügt** (system, sieben
   `app_config`-Migrationen: 002, 011, 015, 016, 018, 019, 023). `listColumns`
   lief ohne `Query.limit()`. Eine abgeschnittene Liste meldet „Spalte fehlt",
   `createColumn` antwortet dann **400 `column_limit_exceeded` statt 409** —
   und genau die 409-Abkürzung IST die Idempotenz dieser Migrationen. 021/022/
   025/026/027 nennen `Query.limit(200)` schon „Pflicht"; die älteren sind
   nachgezogen. `app_config` steht heute bei ~7 Spalten und wächst mit jedem
   Flag.
4. **Ein Poller, der nie pollt** (system, `008-gdpr-columns.ts`).
   `waitForColumns` prüfte `columns.every(...)` ohne den `columns.length > 0`-
   Wächter, den 001/003/014/020/028 alle haben — auf einer leeren Liste ist
   `.every()` wahr, die Funktion hätte sofort „verfügbar" gemeldet.
5. **Zwei Kopfzeilen, die die Unwahrheit sagten** (system). `nuxt.config.ts`
   behauptete „Kein App-/Server-Code, nur Migrationen" — der Layer liefert zwei
   Lese-Routen und den GDPR-Contributor; und `product.manifest.ts` nannte im
   betreiber-sichtbaren Katalogtext `changelog` (gehört admin) und verschwieg
   `app_secrets` + `community_branding`. Dazu ein hinterherhinkender Kommentar
   in `core/server/utils/recordActivity.ts` („stempelt tenantId", seit
   system-025/026 ist es `communityId`).

**Gemeldet statt gefixt** (steht als F-Zeilen in OPEN-ITEMS.md): die
Pool-Komposition in `apps/platform/app/pages/index.vue`, die eigentlich
blueprint gehört; die fehlenden ESLint-Blöcke für `blueprint` und `pages`; der
`app_config`-Schreibzugriff von `tickets` unter einer Moderator-Capability; und
der doppelt hartkodierte `activities`-Tabellenname im activity-Layer.

**Gelernt:** Zwei der fünf Funde sind derselbe Fehlertyp — **eine Prüfung, die
im Erfolgsfall wie im Fehlerfall grün aussieht.** `columns.every()` auf einer
leeren Liste und `listColumns` ohne Limit melden beide „alles in Ordnung",
wenn sie in Wahrheit nichts gesehen haben. Beide waren an anderer Stelle im
selben Ordner schon richtig gelöst und dort sogar als „Pflicht" kommentiert;
der Fehler war nicht fehlendes Wissen, sondern dass die Erkenntnis nie
rückwärts in die älteren Dateien lief. Wer eine Falle dokumentiert, sollte im
selben Zug greppen, wo sie sonst noch steht.

---

### F37 — Embed-Widget und Code-Login im Pool freigeschaltet ✅ 2026-08-02

**Der Befund** (Paritäts-Audit Silo × Pool, Davids Entscheidungen 1 + 2): zwei
Produkte lebten nur in `apps/comments`, obwohl nichts sie am Pool hinderte.

1. **Das Embed-Widget.** `pukalani.comments.embed.*`, `auth.embedSession` und
   `security.csrfOriginCheck` standen nur im Silo — dabei ist die Technik seit
   comments-015/016 mandantenfähig (`embed_sites` trägt `communityId`), und die
   Landing verkauft das Einbetten als Teil von „Diskussionen". Im Pool
   antwortete `/embed` schlicht 404.
2. **Der passwortlose Login.** `pukalani.auth.otp` war im Silo an, im Pool aus
   (Core-Default).

**Der eigentliche Blocker war die Berechtigung.** Die Einbetter-Seite und ihre
drei Routen verlangten `system.manage` — ein INSTANZ-Label, das ein
Kunden-Owner nie trägt. Selbst mit gesetztem Config-Schalter wäre die Fläche im
Pool für jeden Kunden zu geblieben, obwohl sie in seinem Dashboard steht. Neu
ist deshalb die Community-Capability **`community.embed`**, nach dem Muster von
`community.billing` (A6) im **Owner**-Bündel: wer eine fremde Domain freigibt,
öffnet die Community nach außen (`frame-ancestors` **plus** ein partitioniertes
Session-Cookie auf der Gastgeber-Seite) — dieselbe Klasse Entscheidung wie das
Abo. Ein Admin verwaltet, was INNEN passiert. Durchgesetzt an drei Stellen:
Seiten-Meta (`/dashboard/embed`), den drei Routen
(`await requireCommunityPermission`) und dem Nav-Eintrag. Der **Silo-Weg bleibt
offen**, weil die Cap in `ALL_CAPABILITIES` steht — ohne Mandanten fragt
`decideCommunityAccess` ausschließlich das Betreiber-Label.

**Die Mandantengrenze war schon richtig** — und das ist der wichtigste Befund:
die drei Routen gingen längst durch die Datentür (`tenantDb(event, {as:
'operator'})`), also scopt `list`, stempelt `create` und belegen
`update`/`remove` die Zugehörigkeit. Zu bauen war hier nichts, zu BEWEISEN
alles: der neue Live-Beweis
`packages/comments/scripts/verify-embed-boundary.mjs` (**40/40**) fährt zwei
echte Communities gegeneinander — derselbe Einbetter-Host in beiden (Unique ist
tenant-relativ), Zugriff über die bekannte FREMDE Row-Id endet in 404, die
Owner-Rolle reist nicht mit, und die `frame-ancestors`-CSP von A nennt nie den
Einbetter von B.

**`csrfOriginCheck` wurde für den Pool NEU belegt**, nicht aus dem Silo
übernommen — die F32-Härtung vom selben Tag behandelt `Sec-Fetch-Site:
same-site` streng, und unter der Wildcard ist jeder Mandanten-Host same-site zum
nächsten. Abschnitt 7 des Beweises zeigt live: same-origin (Dashboard + der
gesamte Embed-Fluss) geht durch, ein Formular auf der Nachbar-Community wird
abgewiesen, der cross-site-GET des Zählers aus `embed.js` bleibt erlaubt, und
kopflose Server-zu-Server-Aufrufe (Control-Naht, Beweis-Skripte) laufen weiter.

**Der Code-Login endet nicht mehr in einer Sackgasse.** Ob eine Instanz OTP
kann, entscheidet die Appwrite-Console („Auth → Settings → Email OTP") und das
SMTP der Instanz — bis heute wurde daraus ein generischer 500 und die
Anmeldeseite sagte „bitte erneut versuchen", ein Text, der zum Wiederholen
einlädt, obwohl Wiederholen nie hilft. Jetzt erkennt die Route die zwei
Instanz-Ursachen (`user_auth_method_unsupported` 501, `general_smtp_disabled`
503, pure Regel in `core/shared/authMethodAvailability.ts`), antwortet 503 mit
`reason: 'otp_unavailable'` und loggt für den Betreiber, WELCHE der beiden es
war. Die Oberfläche macht daraus „hier gerade nicht verfügbar, nimm dein
Passwort". Beweis: `packages/core/scripts/verify-otp-availability.mjs` (4/4) —
prüft nicht „OTP geht", sondern die immer wahre Zusage „Code ODER benannte
Absage, nie ein generischer 500", und sagt im Klartext, welcher Fall vorliegt.

**Der Nav-Eintrag hängt jetzt am Produkt.** Die Modul-Registry kannte zwei
Produkt-Gates (`productKey` = Betreiber-Schalter zur Laufzeit, `planProduct` =
Tarif des Kunden), aber keines für den BAU-Schalter der App. Der Einbetter-Punkt
stand deshalb im Menü jeder App, die den comments-Layer zieht — auch in
`photos` und `_template`, wo die Seite 404 antwortet. Neu: `configFlag`
(+ `configOn`/`configFlagEnabled`, fail-closed — ein Tippfehler im Pfad blendet
aus statt ein).

**Beweise:** verify-site-authz **118/118** · verify-community-suspension
**117/117** · verify-embed-boundary **40/40** (neu) · verify-otp-availability
**4/4** (neu) · `pnpm -r test` grün (core 541) · typecheck · lint (0 Fehler,
5 bekannte Warnungen) · check:manifests · check:doc-links.

**Offen für David (Console):** im Appwrite-Projekt **`pool`** der PRODUKTION
prüfen, ob „Auth → Settings → Email OTP" aktiv ist. Lokal ist es an (der Beweis
meldet Fall A); ist es in Prod aus, sperrt das den Login nicht mehr aus,
sondern zeigt den ehrlichen Hinweis.

**Gelernt:** Ein Config-Schalter ist nur die halbe Freischaltung — **die andere
Hälfte ist die Frage, wer das Produkt bedienen darf.** Beide Male steckte der
Fehler an derselben Stelle: eine Fläche stand im KUNDEN-Dashboard, verlangte
aber ein BETREIBER-Recht. Im Silo fällt das nie auf, weil dort beide dieselbe
Person sind. Wer ein Silo-Produkt in den Pool hebt, muss deshalb zuerst die
Capability-Zeile lesen, nicht die Config-Zeile — und zweitens prüfen, ob der
Menüpunkt an das Produkt gebunden ist, denn ein toter Menüpunkt fällt niemandem
auf, ein fehlender sofort. Zweite Lektion aus dem Aufräumen: ein
`.catch(() => {})` auf einem Tippfehler im Tabellennamen (`tenants` statt
`communities`) räumt still gar nichts weg — und der Lauf sieht trotzdem grün
aus. Genau derselbe Fehlertyp wie im Layer-Audit desselben Tages: eine Prüfung,
die im Erfolgs- wie im Fehlerfall grün aussieht.

### F38 — `media` und `activity` sind Pool-Produkte ✅ 2026-08-02

**Davids Entscheidung:** beide Layer werden in `apps/platform` montiert. Sie
waren seit C1b (2026-07-28) vollständig mandantenfähig gebaut —
`communityId`-Spalten, jede Route durch die Datentür, ESLint-Backstop,
C18-Umzug inklusive Bucket — aber in **keiner** Pool-App gewählt. Das war der
schlechteste aller Zustände: `recordActivity()` schrieb im Pool jeden Tag
Zeilen, die niemand lesen konnte, weil es dort keinen Feed gab. Und die
Mediathek, das einzige Produkt, mit dem eine Community eigene Bilder verwaltet,
gab es nur im Silo.

**Montiert an allen vier Stellen** (`pnpm check:manifests` erzwingt sie):
`apps/platform/site.manifest.ts` (Produkt-Wahl) · `nuxt.config.ts` (`extends`,
Reihenfolge aus `EXTENDS_ORDER`: media hinter events, activity hinter courses) ·
`package.json` (`@pukalani/media`, `@pukalani/activity`) ·
`scripts/migrate.mjs` (`media` stand dort schon; `activity` gehört **nicht**
hinein — der Layer hat bewusst keine eigenen Migrationen, `activities` gehört
`system`, A14).

**Plan-Zuordnung — bestätigt (David, 2026-08-03, F39):** `media: 'personal'`,
`activity: 'basic'` (`pukalani.tenancy.products`). Begründung: die Mediathek
ist der **einzige** Layer, der Binärdateien auf die geteilte Platte legt und
damit laufend Speicher kostet; der Feed zeigt nur, was ohnehin passiert ist,
und ohne ihn wirkt eine frische Community tot. Die Zeilen sind einzeln
umstellbar, ohne Code-Änderung — die Gates hängen an ihnen.

**Gates, an allen sechs Einstiegen nachgezogen:** `requirePlanProduct` fehlte in
beiden Layern komplett (sie waren nie im Pool). Jetzt an
`/api/media` GET/POST/PATCH/DELETE und `/api/activity` GET/DELETE, jeweils als
erste Zeile — auch im öffentlichen Lese-Zweig der Galerie, der keine Sitzung
verlangt. Dazu `planProduct` an den Nav-Einträgen beider Layer (Modul-Registry
**und** Chrome-Nav): ohne das Feld stünde der Menüpunkt auch dort, wo die Route
404 antwortet — das Menü lügt sonst. `assertPoolWriteQuota(kind: 'media')`
stand schon; der Plan-Katalog nennt noch keine media-Grenzen, die Drossel ist
also ein No-Op wie bei events/courses (→ offener Punkt).

**F28, media-Hälfte: mit dem Umzug geschlossen.** Der Kopf des media-Layers
sagte selbst, das sei „fällig, bevor media in apps/platform gezogen wird" — zu
Recht: eine Entwurfs-DATEI trägt seit media-002 nur `read(label:'admin')`, ein
GLOBALES Betreiber-Label. Im Silo trägt der Betreiber es und die Vorschau in
`/dashboard/media` lud direkt aus dem Bucket; im Pool trägt es **niemand aus der
Community**, jede Redaktion hätte ihre eigenen Entwürfe als kaputte Bilder
gesehen. Gebaut ist die Antwort von events (`GET /api/events/:id/cover`):
`GET /api/media/:id/file`, hinter `media.manage` + Datentür, skaliertes WebP,
`private, no-store`. Welche Kachel diesen Weg nimmt, entscheidet der **Server**
(`index.get.ts` kennt `published` ohnehin) — veröffentlichte Bilder bleiben auf
der Bucket-URL, sonst zöge eine Liste mit 100 Kacheln durch Nitro. Das Label auf
der Datei bleibt bewusst unverändert: die Lösung ist eine Route, **nicht** ein
weiteres Label.

**Der Bestand des Feeds bleibt unsichtbar — das ist die Entscheidung.**
`system-021` hatte sie ausdrücklich offengelassen („Backfill über die Objekte
oder Alt-Einträge wegwerfen"). Gemessen (lokale Instanz, neuer Beweis-Abschnitt):
**242 von 2038** Feed-Zeilen tragen keine `communityId` — und **alle 242** tragen
`read("users")`, das Publikum von VOR C1b. Im Pool heißt das: jeder eingeloggte
Nutzer **aller** Communities. Sie nur zu stempeln würde sie in einen
Community-Feed holen und dabei pool-weit lesbar lassen; das wäre schlechter als
unsichtbar. Dazu kommt, dass die Hälfte gar nicht zuzuordnen ist —
`user.joined` (30) und `milestone.*` haben kein Objekt, wegmoderierte Objekte
sind weg. Ein Feed ist ein Strom: was vor dem Einschalten war, fehlt niemandem.
**Neue** Zeilen sind ab der ersten korrekt — `recordActivity()` stempelt seit
C1b `communityId` UND `Role.label(communityId)`.

**Beweise:** `packages/media/scripts/verify-pool-isolation.mjs` **14/14** (neu —
Galerie-Trennung, Zugriff per ID für PATCH/DELETE/`/file`, und der Gast-Abruf
der DATEI in beiden Richtungen) · `packages/activity/scripts/verify-pool-isolation.mjs`
**8/8** (neu — Server-Weg *und* Realtime-Weg mit einer echten Mitglieds-Sitzung,
dazu die Bestands-Messung) · `verify-audience-flip` **49/49** (war 38/38, um
media_items + Bucket `media` erweitert — der einzige Layer, der sich MIT
`bucket` in der C18-Registry anmeldet, und bis heute der einzige ungeprüfte) ·
`pnpm -r test` grün · beide `tenant-isolation.test.ts` **mit** Live-Env gefahren
(media 11/11, activity 5/5) · typecheck (platform, comments, photos) · lint
(0 Fehler, 6 bekannte Warnungen) · check:manifests · check:doc-links ·
check:single-copy.

**Migrations-Reihenfolge für Prod** steht in OPEN-ITEMS.md — sie ist der einzige
Teil, der nicht allein von hier aus geht: `media-001` legt als einzige Migration
des ganzen Repos einen **Bucket** an, und der Pool-Schlüssel hat heute keine
Storage-Rechte (F36).

**Gelernt:** **Ein Layer, der „pool-fähig gebaut" ist, ist nicht dasselbe wie
ein Layer, der im Pool läuft.** Beide waren technisch fertig — Spalten,
Datentür, Backstop, C18-Registry —, und trotzdem fehlten *sechs* Plan-Gates,
*drei* `planProduct`-Felder und die halbe F28-Route. Der Grund ist immer
derselbe: geprüft wurde gegen die Frage „ist der Datenzugriff dicht?", nicht
gegen „was sieht ein Kunde, der das Produkt nicht gekauft hat?". Zweite
Lektion, und sie ist unangenehmer: die env-gated Integrationstests
(`tenant-isolation.test.ts`) waren seit dem `tenantId`→`communityId`-Rename
**falsch** — sie prüften eine Spalte, die es auf keiner Instanz mehr gibt. In
der CI standen sie als „skipped", also grün. Ein Test, der ohne Env
stillschweigend übersprungen wird, ist so lange kein Beweis, bis ihn jemand
**mit** Env fährt; genau dieselbe Fehlerklasse wie das `.catch(() => {})` aus
F37. Dritte Lektion, ganz praktisch: zwei Dev-Server derselben App liefen
parallel, der zweite hatte `--port 3006` bekommen und still auf 3000
zurückgeschaltet — der Nuxt-Lock zeigte dann „Dir: apps/platform, URL :3000".
Vor jedem Live-Beweis `lsof -nP -iTCP -sTCP:LISTEN` lesen, wie es in CLAUDE.md
steht.

## Paritäts-Audit 2026-08-02 — sieben Befunde aus dem Paket „Wächter und Vorlagen"

Alle sieben zuerst NACHGESTELLT, dann behoben. Was dabei auffiel, steht am Ende
unter **Gelernt**.

**Ein Moderator konnte die Instanz umstellen.** `PATCH /api/tickets/settings`
schreibt `app_config/global` — die EINE Einstellungszeile des Projekts —,
verlangte dafür aber `tickets.manage`, und das liegt im Moderator-Bündel
(`authz.ts`). Jeder andere `app_config`-Schreiber (`admin/config.patch`,
`admin/themes/settings.patch`, `admin/products/[key].patch`) verlangt
`system.manage`. Ein Moderator konnte damit das KI-Modell der ganzen Instanz
wechseln; jede folgende Triage lief auf Kosten des Betreibers über sein Modell.
Nachgestellt an der Rechte-Matrix (`hasCapability(['moderator'],
'tickets.manage') === true`, `system.manage === false`). Die Trennlinie ist
jetzt nicht „Ticket-Fläche vs. Rest", sondern WAS geschrieben wird: das Board
BEDIENEN bleibt `tickets.manage` (alle 20 anderen Routen inklusive
`settings.get`), die Instanz UMSTELLEN ist `system.manage`. Damit ein Moderator
den 403 nicht erst nach dem Klick sieht, liefert `settings.get` ein
`canEditModel`; das Modal blendet Speichern/Zurücksetzen aus und erklärt, warum.
Beweis: `packages/tickets/tests/route-guards.test.ts` (26/26) — die Ausnahme
steht als benannte Aufzählung `OPERATOR_ONLY` statt als Sonderfall im Code, und
ein zusätzlicher Test verlangt für JEDE Route, die `app_config` anfasst, den
Betreiber-Gate. Gegenprobe: alte Capability zurückgesetzt ⇒ Test rot.

**Der Bauplan hatte als einziger Layer keinen Wächter.** `packages/blueprint`
darf mehrere Produkt-Layer kennen — das ist sein Zweck. Verboten ist nicht das
Kennen, sondern das BESITZEN (kein `server/`, keine Tabellen, keine
Produkt-Logik). Nachgestellt: eine `blueprint/server/api/probe.get.ts` mit rohem
`tablesDB` lief sauber durch `eslint .`. Neu greifen zwei Blöcke: kein
`appwrite`/`node-appwrite`-Import im ganzen Layer, und jede Datei unter
`blueprint/server/**`, `scripts/**`, `shared/**` bricht den Lint ab dem ersten
Zeichen (Selector `Program`) mit der Begründung im Text. Geschützt wird damit
die Zusage „Pool und Silo zeigen dasselbe": eigener Datenzugriff im Bauplan wäre
Verhalten, das es nur in Apps MIT blueprint gibt.

**Die Layer-Liste im ESLint war handgepflegt und deshalb falsch.** Sie führte
`feed` (existiert seit dem posts-Rename nicht mehr) und kannte `pages`, `media`,
`activity`, `onboarding`, `control` und `blueprint` nicht — sechs Layer ganz
ohne Import-Backstop, nachgestellt mit je einer Probe-Verletzung, die vorher
niemand meldete. Die Liste wird jetzt aus `packages/` GELESEN und in drei Töpfe
sortiert (`FOUNDATION` / `SEAM` / `PRODUCTS`); ein Layer ohne Topf bricht den
Lint sofort mit Klartext („ohne Topf: …"). Statt einer Verbotsliste steht in
jedem Block, was ERLAUBT ist (`otherLayers([…])`) — die Sperre ergibt sich
daraus. Die bestehenden Nähte sind benannt geblieben: `feedback → control`
(E10), `onboarding`/`control → control, onboarding, pages, themes`. Beweis: je
eine Probe-Verletzung pro neuem Block (blueprint-server, blueprint-appwrite,
pages, media, activity, onboarding, control, core, Topf-Drift) — alle schlugen
an, danach zurückgebaut; `pnpm -r lint` unverändert 0 Fehler / 6 bekannte
Warnungen.

**Die Produkt-Bilanz wird jetzt gerechnet statt gepflegt.**
`docs/referenz/PRODUKT-BILANZ.md` war zu 7 von 12 Zeilen falsch — ausgerechnet
das Dokument, auf dem Davids Zusage „Pool = Silo" ruht: `events`/`courses`
galten als „nicht montiert" (laufen im Pool), `tickets`/`feedback` als
„Silo-only" (sind nach `control` gezogen), `media` als „eingefroren" (ist
pool-fertig), die „strukturelle Lücke" ist geschlossen, und `packages/community`
heißt gebaut `packages/blueprint`. **Entscheidung: beides.** Das alte Dokument
hat seine Aufgabe erfüllt (es begründet, warum es den Bauplan gibt, samt der
verworfenen Alternativen) und liegt als Protokoll in
`docs/archiv/PRODUKT-BILANZ-2026-07-27.md` — mit einem Kasten obenauf, der sagt,
dass es historisch ist. Unter dem alten Pfad steht jetzt eine ERZEUGTE Bilanz:
`node scripts/produkt-bilanz.mjs` (`pnpm bilanz`) liest die Site- und
Produkt-Manifeste, zählt in `server/api/**` die Routen hinter `tenantDb`, sucht
`communityId` in den Migrationen, liest das Tarif-Gate aus
`apps/platform/app/app.config.ts` und stellt fest, welche App-Seite eine
Layer-Seite verdeckt (heute: keine). `pnpm check:bilanz` ist das Gate dazu —
Neuerzeugen darf kein Diff geben, Muster `check:themes`.

**Die Kopiervorlage startete außerhalb der Zusage.** `apps/_template` zog
`comments` ohne `blueprint`. Nachgestellt: wer als Nächstes `posts` dazunimmt —
der offensichtliche zweite Schritt —, bekommt bei GRÜNEM `check:manifests` die
nackte `posts/app/pages/feed.vue` statt der komponierten Bauplan-Seite. Die
Vorlage führt jetzt `blueprint` samt seiner `requires` (posts, comments, events,
courses); wer kleiner will, streicht Produkte UND Bauplan gemeinsam, und
`check:manifests` erzwingt genau diese bewusste Entscheidung.

**Die Demo-Seite aus Phase 2 ist weg.** `apps/comments/app/pages/theme-check.vue`
war öffentlich auf dem Silo-Host erreichbar, ohne `noindex`, mit einem
SSR-`console.log` auf jedem Aufruf, und schrieb die App-Config in die Seite.
Anders als `visual.vue` (dokumentiert, `noindex`, Ziel der Themes-Visual-Suite)
hatte sie keinen Konsumenten: ihre Aufgabe war der einmalige Phase-2-Nachweis,
dass `app.config` App > Core mergt, und der steht in `GOALS.md`. Sie wie
`visual.vue` zu behandeln hieße, eine Seite zu dokumentieren und zu
noindexen, die niemand liest — also entfernt.

**Der Seed für die Rechtsseiten war pool-blind.**
`packages/pages/scripts/seed-demo.mjs` fragte die Existenz ohne `communityId` und
schrieb ohne Stempel. Nachgestellt gegen die Platform-Instanz: dieselbe Abfrage
für `home`/`en` liefert die Zeile der Community `t-demo` — auf einer
Pool-Instanz meldet der Seed also „existiert schon" wegen einer FREMDEN Seite,
und was doch angelegt wird, ist eine Waise mit `communityId: ''`. Das Skript
verlangt jetzt genau eine Angabe: `--community <id>` oder `--single-tenant`
(die ausdrückliche Wahl von `communityId: ''`, wie `scopeRowFor` sie im Silo
stempelt). Ein Default gibt es bewusst nicht — der falsche von beiden ist auf
einer Pool-Instanz nicht zu sehen, sondern nur zu merken. Beweis: drei
Abbruch-Fälle, dann ein echter Lauf gegen die Platform mit `--community
seedprobe` (6 Zeilen angelegt, zweiter Lauf 6× übersprungen, alle 6 mit Stempel,
danach aufgeräumt).

**Der N1-Beweis erwartete ein Menü, das E9 abgeschafft hat.**
`verify-dashboard-access.mjs` stand auf 28/30, weil Abschnitt 6 die
Operator-Module `/dashboard/system` und `/dashboard/users` im Menü eines
MANDANTEN-Hosts erwartete. Genau das hat E9 beendet („das Menü hört auf zu
lügen", 81ac8a93): `scopeVisibleAt` zeigt am Ort einer fremden Community nur
community-Module — auch dem Betreiber. Überholt war die Erwartung, nicht der
Code. Der Abschnitt prüft jetzt beides GETRENNT, weil es zwei Dinge sind: das
MENÜ (Ort) und der ZUGANG (Capability auf der Route) — kein Operator-Modul im
Menü des Mandanten-Hosts, aber `/dashboard/users` und `/api/admin/users` direkt
weiterhin 200, und als Gegenprobe zum Ort stehen dieselben Module auf dem
Kontroll-Host sehr wohl im Menü (sonst hieße der Befund nur „Modul
verschwunden"). Mitgenommen: der Kopf nannte einen Port, den es nicht mehr gibt
(3141 statt `PLATFORM_PORT`), ein Prüftext nannte die Tabelle `tenants` statt
`communities`, und die 429-Falle bei zwei Läufen kurz hintereinander steht jetzt
dort, wo man sie sucht. Ergebnis: **35/35** (aus 30 Prüfungen wurden 35, weil
zwei überholte durch acht schärfere ersetzt sind).

**Beweise:** tickets 26/26 (mit Gegenprobe rot) · verify-dashboard-access
**35/35** · seed-demo-Lauf gegen die Platform inkl. Aufräumen · 9
ESLint-Probe-Verletzungen, alle schlagen an · `pnpm -r test` grün (core 541,
gesamt unverändert) · typecheck 0 Fehler (inkl. `_template` mit den neuen
Layern) · `pnpm -r lint` 0 Fehler / 6 bekannte Warnungen · check:manifests ·
check:bilanz · check:doc-links · check:single-copy.

**Gelernt:** Ein Wächter, den man von Hand pflegt, wächst nicht mit — er
vergisst immer den zuletzt gebauten Fall. Das galt hier dreimal am selben Tag,
in drei Verkleidungen: die ESLint-Layer-Liste kannte die sechs jüngsten Layer
nicht und führte einen, den es nicht mehr gibt; die Produkt-Bilanz war fünf
Wochen nach ihrer Erstellung mehrheitlich falsch; der N1-Beweis hielt an einer
Menü-Regel fest, die zwei Tage vorher abgeschafft worden war. In allen drei
Fällen sah der Zustand GRÜN aus — die Liste lief durch, das Dokument las sich
schlüssig, das Skript meldete 28 Häkchen. Die Konsequenz ist überall dieselbe:
**die Wahrheit aus dem Code lesen statt sie danebenzuschreiben** (Layer aus
`packages/`, Bilanz aus den Manifesten, Erwartung aus der geltenden Regel) und
**Drift zum Fehler machen statt zur Fußnote** (unklassifizierter Layer bricht
den Lint, `check:bilanz` bricht bei jedem Diff). Zweite Lektion, kleiner, aber
teurer: eine Vorlage ist eine Entscheidung, die man n-mal trifft, ohne sie noch
einmal zu prüfen — `apps/_template` ohne Bauplan hätte jede künftige App still
neben die Zusage „Pool = Silo" gesetzt, und die Falle schnappte erst beim
ZWEITEN Produkt zu, wo niemand mehr an die Vorlage denkt.

### F38 — Storage-Rechte im Pool, media/activity in Produktion ✅ 2026-08-03

Über die Appwrite-Console erledigt (David hatte den Browser-Weg ausdrücklich
freigegeben). Befund beim Nachsehen: der **Migrations**-Schlüssel hatte
`buckets.read/write` bereits, es fehlten nur `files.read/write` — ergänzt
(12 → 14 Scopes). Der **Laufzeit**-Schlüssel hatte `files.read/write` schon
und bewusst KEINE Bucket-Rechte; dort wurde nichts geändert. Die frühere
Fehlermeldung „missing buckets.read" kam daher, dass die Migration
versuchsweise mit dem Laufzeit-Schlüssel lief — kein Rechte-Loch, ein
falscher Schlüssel.

Danach in Produktion gefahren: `events-009` + `events-010` (pool und
comments, je 0 Zeilen — beide Instanzen haben keine Termine mit Bild) und
`media-001…005` auf pool (Tabelle, Bucket mit fileSecurity, Indizes,
communityId, Alt-Spalte weg). Live gegengeprüft: `/api/media` 200 auf der
pro-Community, `/api/activity` 401 (Produkt enthalten, Session fehlt).

**Gelernt:** Bevor man Rechte erweitert, erst nachsehen, welche schon da
sind — die Hälfte der angeforderten Scopes existierte, und der eine
„fehlende" war in Wahrheit der falsche Schlüssel im Aufruf. Ein
Laufzeit-Schlüssel bekommt keine Bucket-Rechte, auch nicht „der
Einfachheit halber".

### E1 — tote Schlüsseldatei gelöscht ✅ 2026-08-03

`apps/control/.env.production` zeigte auf das gelöschte Projekt `studio`
(nachgeprüft: `NUXT_PUBLIC_APPWRITE_PROJECT_ID=studio`), lag nur auf Davids
Rechner und war nie im Repo. Auf Davids Zuruf gelöscht.

**Reihenfolge, die zählt:** vorher die zwei noch LEBENDEN Verweise korrigiert
— der Kopf von `packages/pages/scripts/seed-demo.mjs` nannte die Datei als
Aufruf-Beispiel, und `docs/runbooks/DEPLOYMENT.md` warnte zwar davor, nannte
sie aber weiter. Wer eine Datei löscht, ohne die Wegweiser umzustellen,
verschiebt das Problem nur von „falsche Datei" zu „Datei fehlt".

**Gelernt:** Vor dem Löschen greppen, wer noch darauf zeigt — und die
Warnung im Runbook in eine Feststellung umschreiben („ist gelöscht; taucht
sie wieder auf, ist sie falsch"), statt sie stehen zu lassen. Eine Warnung
vor etwas Nicht-mehr-Existierendem verwirrt beim nächsten Lesen.

### E4 · B1 · E3 — drei Zeilen geschlossen, eine davon war längst erledigt ✅ 2026-08-03

**E4 (Nur-Lese-Schlüssel im Projekt `control`) war bereits gebaut** — die Zeile
war veraltet, wie heute schon mehrere. In der Console liegt „platform read-only
(tenants/site_members)" mit genau EINEM Lese-Scope, zuletzt vor einer Stunde
benutzt; im Code hängt er als `NUXT_PLATFORM_CONTROL_KEY` am
Mandanten-Resolver (`apps/platform/server/plugins/tenant-resolver.ts:33`).
Ich habe deshalb KEINEN zweiten angelegt. **Gelernt:** vor dem Anlegen
nachsehen, ob es das Ding schon gibt — ein zweiter Schlüssel mit demselben
Zweck ist kein erledigter Punkt, sondern eine zusätzliche Angriffsfläche.
Beim Nachsehen fiel ein 84-Scope-Schlüssel auf (→ F42).

**B1 (neun Referenzbilder) gesichtet.** Kein DevTools-Abzeichen mehr, echte
Texte statt roher Schlüssel, Themes greifen sichtbar (default neutral-schwarz,
midnight blau-violett). Die Sachaussage im Bild („9 Neutral-Töne") gegen die
Registry geprüft: stimmt exakt (NEUTRAL_REGISTRY hat neun Einträge). Keine
Auffälligkeit, die einen Neu-Bake rechtfertigt.

**E3 (Server-Größe) geschlossen** mit dem Messergebnis vom 2026-08-02 als
Entscheidung: kein Rescale. 1,0 von 3,7 GB belegt, Swap unberührt, Last 0,00,
Platte 29 %, null OOM in 30 Tagen. Die Maschine ist ein CX22, nicht der
angenommene CX33 — und die CI baut auf dem Runner, nicht auf dem Server.

### F41 — der Layer-Wächter greift jetzt wirklich ✅ 2026-08-02

**Der Befund.** `eslint.config.mjs` verbot Cross-Layer-Importe über
`no-restricted-imports` — aber `no-restricted-imports` vergleicht den
SPEZIFIZIERER-TEXT, und alle Muster lauteten `@pukalani/<layer>`. Im gesamten
Repo gibt es **null** solcher Importe. Sämtliche 244 realen Cross-Layer-Importe
sind relativ. Der Backstop schützte also ausschließlich hypothetische Fälle,
und zwar seit es ihn gibt.

**DIE LANDKARTE, die bisher niemand hatte** (244 relative Cross-Layer-Importe,
aufgelöst statt gegriffen — Quelle: Resolver-Skript über `packages/**`):

*Echte Layer-zu-Layer-Kanten (50) — alles außer core und Repo-Wurzel:*

| Kante | Anz. | Beispiel | Urteil |
| --- | --- | --- | --- |
| feedback → control | 20 | `control/shared/customerFeedback` (16), `control/schemas/customerFeedback` (4) | Naht 1, gesegnet (E10) |
| onboarding → control | 20 | `control/shared/onboarding` (6), `myCommunities` (4), `communityTeam` (3), `abuseReports` (2), `schemas/tenant` (2), `schemas/onboarding` (2) | Naht 2, gesegnet |
| onboarding → pages | 2 | `pages/server/utils/seedHomePage`, `…/seedLegalPages` | Naht 2, gesegnet |
| onboarding → themes | 1 | `themes/shared/builtinThemes` | Naht 2, gesegnet |
| control → themes | 2 | `themes/shared/builtinThemes`, `themes/app/utils/themeRegistry.gen` | Naht 3, gesegnet |
| control → pages | 1 | `scripts/backfill-legal-templates.mjs` → `pages/shared/legalTemplates.ts` | **war nicht in der Liste**, aber von der Regel längst erlaubt |
| control → events | 1 | `scripts/verify-audience-flip.mjs` → `events/shared/coverAudience.ts` | **FUND** — nirgends gesegnet |
| blueprint → events | 1 | `events/shared/types/event` | Naht 4, gesegnet |
| blueprint → pages | 1 | `pages/shared/types/page` | Naht 4, gesegnet |
| admin → system | 1 | Test → `system/server/utils/userDataContributor` | Fundament↔Fundament, erlaubt |

*Die anderen 194, bewusst nicht „Cross-Layer" im Sinne von A14:* **121 × → core**
(alle 17 Layer; jeder zieht mindestens `core/shared/types/manifest` als Typ —
Spitzenreiter control 38, admin 26) und **73 × → Repo-Wurzel**, davon 71 auf
`scripts/migrations-lib/indexRetry.mts` und 2 auf `functions/changelog-draft`.
Letztere fallen gar nicht erst in den Geltungsbereich: das ist geteiltes
Werkzeug, kein Layer.

**Die vier gesegneten Nähte am Code nachgeprüft:** alle vier existieren und
stimmen. Zwei Korrekturen an der Liste — `control → pages` fehlte darin
(Backfill-Skript; die Regel erlaubte es ohnehin schon, die Liste war
unvollständig, nicht die Regel), und `control → events` ist eine fünfte Kante,
die in keiner Segnung steht.

**Die Regelform — und warum Regex hier beweisbar falsch ist.** Naheliegend wäre
gewesen, die relativen Pfade textlich zu prüfen. In diesem Repo geht das nicht:
**jeder Layer-Name existiert auch als Unterordner.** `app/pages` gibt es in
allen 18 Layern, dazu `server/api/admin`, `server/api/comments`,
`app/components/core`, `public/themes`. Ein Muster auf das Segment `pages` kann
nicht unterscheiden, ob `../../pages/x` den LAYER `pages` meint oder den Ordner
`app/pages` derselben Datei — die Zahl der `../` hängt an der Tiefe der
Quelldatei und ist im Selektor nicht bekannt. Gebaut wurde deshalb eine eigene
Regel `pukalani/no-cross-layer-relative` (Inline-Plugin in `eslint.config.mjs`),
die den Pfad mit `path.resolve` WIRKLICH auflöst. Nebenwirkung, die man sonst
von Hand hätte bauen müssen: der Selbst-Import eines Layers ist automatisch
erlaubt, egal wie tief verschachtelt, und die Repo-Wurzel fällt von selbst raus.
Die Erlaubnislisten stehen in denselben Blöcken wie ihre
`@pukalani/*`-Gegenstücke — eine Grenze ist an EINER Stelle beschrieben, nicht
an zweien.

**Beweismatrix** (Probe-Dateien, danach zurückgebaut). Angeschlagen: posts →
comments · themes → core als WERT · moderation → comments (Fundament nach
unten) · blueprint → control. Durchgegangen: posts → core · Selbst-Import über
`../../../shared/…` · `comments/app/__x.ts` → `../pages/…` (die
Ordner-Namenskollision, an der ein Regex gescheitert wäre) · themes → core als
TYP · blueprint → posts. Dass die „muss durchgehen"-Proben nicht bloß
übersprungen wurden, ist eigens belegt: mit einem `debugger` darin meldete
ESLint jedes Mal `no-debugger` — die Dateien wurden also gelintet und die
Layer-Regel schwieg bewusst.

**Zwei bestehende Importe wurden rot — beide blieben rot und stehen jetzt als
begründete Einzelausnahme IM CODE**, statt die Regel aufzuweichen (das Muster,
das CLAUDE.md für eventlose Sweeps schon vorschreibt): `control/scripts/
verify-audience-flip.mjs` (Beweis-Skript, das die ECHTE Regel beider Seiten
importieren MUSS — eine Nachbildung liefe still auseinander und der Beweis wäre
wertlos) und `themes/tests/themeSelection.test.ts` (Testnaht auf den echten
`mirrorRowToBranding`). Der dritte Fall, `themes/product.manifest.ts`, ist keine
Ausnahme, sondern eine Option: `allowTypeFrom: ['core']`. CLAUDE.md verlangt von
JEDEM Layer ein Manifest mit `import type { ProductManifest }` — auch von
`themes`, das sonst gar nichts aus core kennen darf. Werte aus core bleiben dort
verboten.

**Gelernt:** Ein Wächter, der nie anschlägt, sieht genauso grün aus wie einer,
der funktioniert — und beide Zustände sind aus dem Lint-Ergebnis nicht zu
unterscheiden. Der einzige Beleg ist die **Probe-Verletzung**: eine Datei, die
kaputt sein MUSS. Diese Regel gehört ab jetzt zu jedem neuen Backstop, sonst
schreibt man Konfiguration, die niemand je ausgelöst hat. Zweitens: bevor man
Importe textlich prüft, erst nachsehen, ob die Layer-Namen auch als Ordnernamen
vorkommen — hier taten es ALLE 18, ein Regex wäre entweder löchrig oder voller
Fehlalarme geworden. Drittens: das Inventar zuerst zu ziehen war das eigentlich
Wertvolle. Ohne die aufgelöste Landkarte hätte niemand gemerkt, dass die
„vier gesegneten Nähte" in Wahrheit fünf Kanten sind.

### Zwei Kleinigkeiten — eine gefixt, eine nachgemessen ✅ 2026-08-03

**Mediathek: die Bremse log den Kunden an.** Der Upload fing jeden Fehler mit
einem nackten `catch` und zeigte immer „JPEG, PNG und WebP bis 15 MB — größere
Bilder vorher verkleinern". Seit den Kontingent-Zahlen von heute gibt es einen
ZWEITEN Grund, und der Kunde bekam den Rat zu verkleinern, während in Wahrheit
sein Tarif voll war — ein Rat, der beliebig oft scheitert. Die Anzeige liest
jetzt den `reason` aus dem Envelope (den der Server seit heute mitschickt) und
unterscheidet „Tarif voll" von „für heute erreicht", je mit dem passenden Weg.

**Zahlungswarnung: der Verdacht war richtig und die Lage schlimmer.** Gemeldet
war „die Glocke bleibt vermutlich leer". Nachgemessen (Pool-Nutzer-Id gegen das
control-Projekt: 404 `user_not_found`) gilt: `metadata.userId` eines
Community-Abos ist eine Pool-Id, der Webhook läuft auf control. Die
Glocken-Zeile bekommt dort `read(user:<pool-id>)` — unlesbar für jeden. UND
`maybeSendInstantEmail` schlägt denselben Nutzer nach, bekommt 404 und bricht
still ab. Es kommt also über KEINEN Kanal etwas an, während der M13-Sweep nach
14 Tagen die Community auf nur-lesend setzt.

Nicht repariert, sondern LAUT gemacht: fehlt der Empfänger, schreibt der
Webhook jetzt `billing.notify_recipient_missing` als Fehler. Die Zustellung
selbst war eine Entscheidung (Kontobereich oder Community-Glocke — C15/C17) und
lag als **F43** bei David — sie ist am 2026-08-03 gefallen und gebaut: die
Warnung eines COMMUNITY-Abos landet in der Community-Glocke, geschrieben vom
Pool (siehe den F43-Eintrag oben).

**Gelernt:** „vermutlich leer" ist keine Diagnose. Der zweite Kanal (E-Mail) war
in der ursprünglichen Meldung gar nicht geprüft — und genau er hätte den Fall
harmlos gemacht. Und: zwei ineinandergreifende `.catch(() => null)` können aus
einem Ausfall im GELDPFAD ein Ereignis machen, das nirgends auftaucht.

### F1 Stufe 4 (Discussions) — Abzeichen · erledigt 2026-08-04

16 Abzeichen, sechster Cross-Layer-Vertrag (`registerUserCounterProvider`),
Galerie unter `/discussions/badges`. Migrationen `posts-012` (Tabelle
`user_badges` + 3 Indizes) und `comments-018` (1 Index) auf beiden Instanzen
VOR dem Deploy. Live `48998ad9`; Zahlen in Produktion von David bestätigt.
Entscheidungen zum Zuschnitt: Konzept Teil 5.

Zwei Entwurfsentscheidungen mit Begründung: die Verleihung läuft als
`actor: 'operator'` — mit `member` hätte das ANSEHEN der eigenen Seite den
Betrachter per A5 zum Mitglied gemacht und wäre unter M13 an einer 403
gescheitert. Und ausgewertet wird beim HINSEHEN, nicht in einem Lauf; deshalb
bewusst keine Benachrichtigung.

**Gelernt:** Ein konfliktfreier Merge ist KEIN grüner Build. Das Zusammenführen
mit der Analytics-Arbeit der Nachbarsitzung lief ohne einen einzigen Konflikt
durch und hinterließ 16 Typfehler — Git legt Textzeilen widerspruchsfrei
zusammen und stellt dabei einen Zustand her, den keiner der beiden Zweige je
gebaut hat. Ursache hier harmlos (der neue `analytics`-Layer brauchte ein
`pnpm install`), gefunden aber nur, weil nach dem Merge noch einmal geprüft
wurde statt dem grünen Stand von vorher zu vertrauen. Nach JEDEM Merge fremder
Arbeit: install + typecheck, bevor gepusht wird.

**Zweite Lehre:** „Weglassen und begründen" hat wieder mehr gebracht als jede
grüne Zahl — der Agent hat 6 Abzeichen NICHT gebaut und dabei aufgedeckt, dass
`posts` keine Bearbeitung festhält und das Beitrittsdatum im Control Plane
liegt. Nebenbefund aus derselben Haltung: `about` fehlte seit Stufe 2 in
`RESERVED_CATEGORY_SLUGS` — eine Kategorie mit diesem Slug wäre nicht verdeckt,
sondern unerreichbar gewesen.

### F1 kleines Paket (Discussions) — Regeln-Vorlage + Hilfe-Umbenennung · erledigt 2026-08-04

Die Punkte 2 und 3 aus Teil 5 des Discussions-Konzepts, beide klein und beide
sichtbar.

**Verhaltensregeln für Bestandskunden.** Seit Stufe 2 legt der Seed die
Regeln-Seite bei der Provisionierung an — Bestands-Communities hatten deshalb
keine, und der Navigationspunkt verschwand bei ihnen ganz. Gebaut als
**Rückfall zur Laufzeit, nicht als Backfill.** Der Grund ist nicht Bequem-
lichkeit, sondern dass ein Backfill hier gar nicht sauber geht: die
`pages`-Zeilen liegen im Runtime-Projekt, die Liste der Communities im Control
Plane, und ein Migrationslauf bekommt genau EINEN Schlüssel für EINE Instanz.
Er müsste den Bestand aus den vorhandenen Zeilen erraten (`distinct
communityId`) und verfehlte ausgerechnet die Communities ohne jede Seite; auch
die Sprache steht drüben. Dazu kommt das Argument, das schon im Kopf von
`seedGuidelinesPage.ts` steht: es ist die Seite des Owners. Vier Stellen, eine
Regel — Navigationspunkt, öffentliche Seite, Eintrag in der Seiten-Liste
(„Vorlage") und ein vorgefüllter Editor, dessen erstes Speichern die Zeile
anlegt. Eine vorhandene Zeile gewinnt immer; ein bewusst zurückgezogener
Entwurf bleibt zurückgezogen.

**Hilfe-Umbenennung.** „Diskussionen" meinte auf help.pukalani.app noch den
Kommentar-Baustein — seit F1 gibt es ein Produkt dieses Namens. Elf Stellen
umbenannt, die Produkt-Seite umgezogen (`/anleitung/produkte/kommentare`, 301
für den alten Pfad). Auf der Landing war dieselbe Umbenennung schon passiert.

**Gelernt:** Ein Rückfall braucht einen Schalter, sobald sein Layer in mehr als
einer App steckt. `pages` läuft auch in `control`, wo der BETREIBER seine
eigenen Rechtstexte pflegt — ohne `pukalani.pages.guidelinesFallback` (Layer
aus, `platform` an) hätte die Betreiber-Konsole eine Vorlage für
Community-Regeln in ihrer Seiten-Liste stehen gehabt und unter
`control.pukalani.app/guidelines` einen Text, der dort niemanden meint. Die
Frage „wer erbt diesen Layer eigentlich noch?" gehört an den Anfang, nicht ans
Ende.

**Zweite Lehre:** Der Editor schützt seit dem 2026-08-03 die Urfassung
(`shared/editorBody.ts`: hat niemand getippt, geht der Text aus der API raus,
nicht Tiptaps Rückserialisierung). Beim Vorfüllen mit einer Vorlage sah es
naheliegend aus, `pristineBody` leer zu lassen — „es gibt ja nichts zu
schonen". Genau das hätte beim Öffnen-und-Speichern einen LEEREN Text
gespeichert. Wer an einer Stelle mit Sonderregel etwas Neues anhängt, muss die
Sonderregel erst zu Ende lesen.

---

## BI1 I1 — Brand Insights: Layer + Schema + Vertrag (2026-09-09)

**Was gebaut wurde** (drei Commits, Live-Build `bb1f9102` auf branding.supply, per /api/health bewiesen): Paket I1 aus
docs/plans/BRAND-INSIGHTS.md §9.9, die „volle Rechnung" aus §9.1 (5) ohne Abkürzung.

- **`insights.manage`** (`41a84637`, eigener Commit): nur im Admin-Wildcard, bewusst
  nicht bei `moderator` — die Redaktion ist Betreiber-Sache, die Silo-App hat keine
  Community-Rollen (Vorlage `runner.manage`).
- **Layer montiert** (`b5d284f1`): `product.manifest.ts` (`hasMigrations: true`,
  `apiPrefixes: ['/api/insights']`), `apps/branding/site.manifest.ts` + `nuxt.config.ts`
  (nach `market`, vor `pages` — pages muss mit seiner `/[slug]`-Route zuletzt stehen),
  `@pukalani/insights` in der App, `pukalani.insights.enabled: true`, `LAYER_ORDER`
  in `scripts/migrate.mjs` nach `market`, Bilanz regeneriert, `INSIGHTS_TABLES` im
  BRANDING_SOLL des Paritäts-Wächters.
- **Drei Tabellen** `insights_posts` (26 Spalten) · `insights_brands` (21) ·
  `insights_corrections` (12), server-only, Indizes nur über `createIndexSteps`.
  Abweichungen von §9.3, alle im Migrationskopf vorgerechnet: `facts` MEDIUMTEXT
  statt varchar 4000 (12 Duell-Zeilen ≈ 7.400 Zeichen, 10 Ranking-Plätze ≈ 8.300),
  `brandRefs` 4000 statt 2000, `history` 5000 statt 4000, `topics` als JSON-Liste
  statt Kommaliste (ein Parser; `Query.contains` trifft bei Kommalisten Präfixe).
  Zusatz gegenüber §9.3: `insights_corrections.retentionAt` (Datum, ab dem
  `contactEmail`/`ipHash` geleert werden, 12 Monate als EINE Konstante) mit Index
  `idx_retention`, und `idx_contact_email` als Lesepfad des GDPR-Contributors
  (Adresse wird getrimmt + kleingeschrieben gespeichert).
- **Der EINE Vertrag** `packages/insights/server/contracts/brandContract.ts`
  (genau §9.1 (2)): `brand_checks`-Lesezugriff + Kategorien, Farbwelt,
  Archetyp-Katalog, Branchen-Katalog, Slug-Regel, SSRF-fester Abruf samt
  robots/TDM. ESLint-Block `packages/insights/**` erlaubt nur `brand`; der
  Datentür-Block (`tablesDB`-Sperre) nimmt insights BEWUSST NICHT auf: kein
  `communityId`, Silo auf `branding` — Begründung steht im ESLint-Block.
- **GDPR-Contributor** (`registerUserDataContributor`, id `insights`): Export der
  Korrekturen mit der Konto-Adresse (ohne `ipHash`), Ids der geprüften Beiträge und
  beanspruchten Marken; Löschung leert `contactEmail`/`ipHash`/`retentionAt`,
  `reviewedBy`, `claimedBy` — idempotent, die Zeile bleibt (Nachweis, §9.3).
- **Fristen-Sweep** (`insightsCorrectionsSweep.ts`, Plugin alle 24 h, Produkt-Gate)
  nach dem Muster `brandEventsSweep.ts` — leert, löscht nicht.
- **Shared-Vertrag erweitert:** `insightsCorrectionSchema`, `insightsSlugHistoryPush`
  (≤ 5, ohne Duplikate), Row ⇄ Vertrag fail-soft (`shared/insightsRows.ts`); 87 Tests.

**Beweise:** Migration lokal gegen die Dev-Appwrite zweimal gefahren (Lauf 2: 75 ×
„existiert bereits"), **Prod `branding` mit Davids Ja 2026-09-09 gefahren** (3 Tabellen,
13 Indizes), `pnpm ops:schema-parity` branding 38/38 grün; `check:manifests`,
`check:i18n-keys`, `check:single-copy`, `check:bilanz`, `lint:scripts`, Lint
insights/core/brand/market/branding, Typecheck branding, Unit-Tests insights 87 / core
1618 / brand 2820 / market 206.

**Nebenbefund, behoben** (`bb1f9102`): `packages/market` hatte seit M1 KEIN
`server/plugins/product-manifest.ts` — als einziger Produkt-Layer mit `apiPrefixes`.
Folge: die Notabschaltung `app_config.products.market.enabled = false` traf
`/api/market/**` nie, und der Rohtext-Sweep stieg an `getProductRegistry().has('market')`
bei jedem Lauf aus — der gefilterte Text fremder Websites blieb über die zugesagten
24 Stunden hinaus liegen. Vier Zeilen Plugin, jetzt registriert. Ebenfalls ohne Plugin,
aber NICHT angefasst (eigene Entscheidung nötig): `domains`, `onboarding`, `runner`.

**Gelernt:** Ein Manifest mit `apiPrefixes` ist ein Versprechen, das erst ein
Laufzeit-Plugin einlöst — `check:manifests` prüft die DATEI, nicht die Registrierung.
Beim nächsten Layer gehört das Plugin in dieselbe Checkliste wie LAYER_ORDER und
Paritäts-Soll; ein Wächter „Layer mit `apiPrefixes` braucht
`server/plugins/product-manifest.ts`" wäre die dauerhafte Antwort (offen: OPEN-ITEMS Zeile `PM1`). **Zweite Lehre:** ein Fristen-Sweep, der Felder LEERT statt Zeilen zu löschen,
muss auch sein Fälligkeits-Datum leeren — sonst füllen die schon geleerten Zeilen
jeden Batch (`retentionAt <= now`, Limit 200) und neue fällige Zeilen werden nie mehr
erreicht. Bei der Prüfung erwischt, vor dem Deploy behoben. **Dritte:** Appwrite 2.0
lehnt einen Index über varchar > 768 Zeichen ab (`column_index_invalid`, MariaDB
3072 B ÷ 4) — `idx_slug_history` auf einer 1000er-Spalte braucht `lengths: [768]`.

## BI1 I2 — Brand Insights: Redaktions-Dashboard + KI-Entwurf (2026-09-09)

**Was gebaut wurde** (Commit `f6d6da89`, Merge `d1e04658`, Bilanz `9d4dc553`; Live-Build
`d1e04658` auf branding.supply per /api/health bewiesen): Paket I2 aus
docs/plans/BRAND-INSIGHTS.md §9.9 — die Redaktion hinter `insights.manage`, gebaut von einem
Opus-Lauf nach Auftrag, geprüft und nachgeschärft im Hauptloop.

- **Routen `/api/insights/**`** (alle `requirePermission(event, 'insights.manage')`, Admin-Client
  über `insightsDb`, expliziter `Query.limit`): Liste, Anlegen (Slug über den brand-Vertrag),
  Lesen mit Editor-Kontext (Marken, Form-Issues), Speichern (`insightsPostEditSchema` ohne
  Server-Felder, `readingMinutes` beim Speichern, `slugHistory` bei Umbenennung,
  `translationReviewed` nur mit vorhandener zweiter Fassung), Zustandswechsel
  (`insightsTransitionAllowed`-Matrix; vor jedem Ziel außer `draft` die **sechs Prüfregeln als
  Server-Gate MIT Quellen-Abruf** über `fetchBrandSiteForCheck` — robots/TDM-Verbot und
  Abruf-Fehler zählen als „nicht belegbar", nie als „ungeprüft"; Deckel 20 Quellen je Lauf),
  Beleg-Ampel je Quelle (deterministisch, `evidenceIsGrounded`, Grund `ok/not_found/
  fetch_failed/robots_denied/tdm_reserved/no_url`), Übersetzen und KI-Entwurf (Kette
  Permission → `readBrandAiEnabled` fail-closed → Drossel 10/Stunde + 50/Tag je Konto und Art
  über `useRateLimitStore` → `aiCompleteJson` mit `BRAND_PROVIDER_ROUTING`; Prompt-Fassungen
  `insights-t-1`/`insights-d-1` als Konstanten, je Beitrag gespeichert; Entwurf bleibt `draft`),
  Marken-Liste + Schnellanlage (Prüfregel 6 braucht eine Zeile).
- **Seiten** `packages/insights/app/pages/dashboard/insights/{index,[id],radar}.vue`
  (`layout: 'dashboard'`, `['auth','admin']`, `requiredCapability: 'insights.manage'`): Liste als
  `UTable` mit Anlege-Dialog, Editor aus der I0-Form (`InEditor.vue` ist jetzt die echte
  Komponente: UEditor nach editor.md, zwei Sprach-Reiter mit Maschinen-Stempel, editierbares
  Quellen-Panel mit Ampel, Marken-Panel, Fakten als JSON mit Zod, Prüfregeln, Übergänge,
  Vorschau, Übersetzen, KI-Entwurf), Radar-Platzhalter bis I4. Admin-Modul `insights` in
  `pukalani.admin.modules` (operator, `productKey`, `configFlag`, zwei Kinder).
- **brand-Vertrag** um Abschnitt 7 (Kill-Switch, ZDR-Routing) und `fetchBrandSiteForCheck`
  ergänzt; kein Schreiben in brand-Tabellen — KI-Ereignisse als `logEvent`-Zeilen
  `insights.{draft,translate}.{requested,completed,failed}` (nie Prompt, nie Text).
- **Shared:** `insightsAiLimits.ts`, `insightsPrompts.ts`, `types/insightsApi.ts` (an beiden
  Enden verlangt), Erweiterungen in `insightsPost.ts` (Edit-Schema aus denselben Regeln,
  Übergangs-Matrix, `insightsMethodologyLinked`). 33 neue Tests (87 → 120).

**Drei Zuschnitte, die vom Auftrag abweichen** (alle im Code begründet): (1) `review_blocked`
ist **200 mit `changed: false` + `issues`**, kein 409 — der zentrale Fehler-Handler hebt aus
`data` nur den `code`, eine Liste käme nie an, und der teure Gate-Lauf müsste doppelt laufen.
(2) Abruf über `fetchBrandSiteForCheck` statt `fetchBrandSite` — nur jener prüft robots/TDM
(der Wizard-Weg auf die EIGENE Website tut es bewusst nicht); kein eigener
`PukalaniInsightsBot` in I2. (3) Der Herabsetzungs-Riegel bekommt als Kandidaten die Marken,
die der Beitrag NICHT verweist — wörtlich umgesetzt hätte jedes Markenprofil an seinem eigenen
Titel blockiert; ein Treffer heißt jetzt „genannt, aber ohne Verweis" (genau Regel 6).

**Klick-Beweis** (Dev-Server aus dem Worktree, Port 3018, Dev-Instanz `portfolio-g4ml`,
Admin-Session per Server-SDK als Cookie — kein Passwort getippt): Anlegen → Editor → Text +
Quelle example.com → Speichern 200 (`readingMinutes: 1`) → Beleg prüfen: erst `not_found`
(example.com hat 2025 seinen Satz geändert — das Gate hatte RECHT), mit dem echten Satz `ok`
→ Gate ohne Marken-Verweis: `disparagement competitor_domain` an Titel und Text → Marke
angelegt + verknüpft → `review` → `published` mit `reviewedBy`/`publishedAt` → Vorschau →
Übersetzen lokal 503 „AI not configured" (kein Schlüssel lokal; Log-Zeilen requested/failed
da). Screenshots an David. **Prod-Beweis nach dem Deploy** (Davids freigegebener Chrome,
branding.supply, Build `d1e04658`): Beitrag „I2-Beweis: Kailua Coffee Co." angelegt → KI-Entwurf
(Brief, 300 Wörter) liefert Titel/Vorspann/Text mit `[Quelle]`-Platzhaltern, Lesezeit 3 Min,
Zustand bleibt Entwurf → Übersetzen liefert die englische Fassung mit Stempel „Maschinell
erzeugt am 09.09.2026, noch nicht redigiert" und Häkchen; der Platzhalter bleibt Platzhalter.
Der Beitrag steht als Entwurf in Davids Redaktion (I2 hat keinen Löschen-Weg — offen in
OPEN-ITEMS). Wächter: 120 Tests, Lint insights/branding, Typecheck branding,
check:i18n-keys, check:manifests, check:bilanz.

**Fünf Befunde aus dem Klick-Beweis, alle vor dem Push behoben:** `i-ph-radar` gibt es in
Phosphor nicht (→ `i-ph-broadcast`) · Herabsetzungs-Meldung zeigte den rohen Grund
(`competitor_domain`) statt eines Satzes · „1 Punkte offen" — Plural braucht `t(key, n)`,
nicht `{ count }` · eine Quelle ohne Herausgeber ließ sich nicht speichern und der Toast sagte
nur „Das hat nicht geklappt" — die Formregeln rechnen jetzt LOKAL am Entwurf mit (Regel 2 war
hinter dem Schema-400 unsichtbar), der 400 bekommt einen sprechenden Toast · Fehlercode im
KI-Log war „Error" statt „503 AI not configured".

**Gelernt:** (1) Ein Schema, das beim SPEICHERN abweist, macht eine Prüfregel im Panel
unerreichbar — wer beides will (Plan §9.3: Schema UND Übergang), muss die puren Regeln auch am
unsaved Entwurf rechnen, sonst sieht der Mensch nur einen 400. (2) Ein Beleg-Riegel gegen eine
LEBENDE Website ist ein Test mit beweglichem Erwartungswert: example.com hat seinen Satz
geändert; der „Fehler" war die Wahrheit. (3) `check:bilanz` gehört in dieselbe Wächter-Liste
wie i18n/manifests, sobald ein Layer Routen oder Seiten bekommt — die CI hat es gesehen, die
lokale Runde nicht. (4) Klick-Beweis hinter Login ohne Passwort: `users.createSession` per
Server-SDK, Secret als `a_session_<projekt>`-Cookie in den Playwright-Kontext.

## BI1 I2-Reste — Beitrag löschen, Marken-Seite, Korrekturen-Liste (2026-09-10)

**Was:** die drei kleinen Reste aus Paket I2 (Plan §9.4), ohne Migration. (1) `DELETE
/api/insights/posts/[id]` hinter `insights.manage`: nur `draft`/`review` löschbar, ein
freigegebener Beitrag antwortet 409 `not_deletable` und wird erst über den bestehenden
Übergang zurückgezogen; EINE pure Regel `insightsPostDeletable` für Route und Oberfläche.
Knopf mit Bestätigung im Editor (gesperrt mit Hinweis, solange öffentlich) und Papierkorb je
Entwurfszeile der Liste. (2) `/dashboard/insights/brands`: UTable mit Zustands-Filtern und
Zählern, Slideover über alle §9.3-Felder (Quellen über die aus dem Editor gezogene
`InSourcesEditor`, Zeichen und Historie mit Beleg-Zeiger, Beziehungen, Zustand — `removed`
nur mit Grund, `removedAt` setzt der Server am Übergang und leert es auf dem Rückweg);
`GET`/`PATCH /api/insights/brands/[id]` mit slugHistory-Führung, `insightsBrandEditSchema`
ohne die drei Server-Felder. (3) `/dashboard/insights/corrections` nach dem Muster der
Brand-Check-Korrekturen: Filter open (Standard)/accepted/declined/alle mit Zählern, Annehmen,
Ablehnen mit Pflicht-Notiz; `GET /api/insights/corrections` liefert den Kontakt NUR als
`hasContact` (nie die Adresse), `POST …/[id]/decision` mit 409 `already_decided` und 400
`note_required` aus der puren Regel `insightsCorrectionDecisionAllowed`. Das Speichern der
Entscheidung schreibt bewusst nur `status`/`decisionNote`/`decidedAt` — ein Vollschreiben
hätte eine vom Retention-Sweep geleerte Adresse aus altem Stand zurückgeholt. Annehmen
ändert das Ziel NICHT (das bleibt Redaktionsarbeit — Hinweis im Toast). Nav: Beiträge ·
Marken · Korrekturen · Radar als Unterpunkte; i18n de+en; 144 Tests (vorher 119).

**Klick-Beweis** (Dev-Server aus dem Worktree, Port 3018, Dev-Instanz `portfolio-g4ml`,
Admin-Session per `users.createSession` als Cookie, zwei Korrekturen per Server-SDK gesät):
Korrekturen 2 offen → Annehmen (Zähler 1/1/0) → Ablehnen-Knopf ohne Notiz gesperrt → mit
Notiz (0/1/1) → API-Gegenprobe 409 `already_decided` · Marke: Land + Gründungsjahr, Zeichen
ohne Beleg ⇒ Formular bleibt mit „Beleg fehlt" stehen, ohne Zeichen + „Veröffentlicht" ⇒
gespeichert, Slideover zu, Zähler 0/1/0; API: `removed` ohne Grund 400, mit Grund `removedAt`
gesetzt, zurück auf `published` geleert · Löschen: neuer Entwurf im Editor gelöscht ⇒ Liste,
GET 404; Papierkorb nur an Entwurfszeilen; DELETE auf den freigegebenen Beitrag 409; Knopf im
Editor des freigegebenen gesperrt. Danach alle vier Seiten ohne Hydration-Meldung (Browser-
Konsole und Dev-Log 0). Prod: Test-Entwurf „I2-Beweis: Kailua Coffee Co." über den neuen
Löschen-Weg entfernt. Wächter: Tests, Lint insights/branding, Typecheck branding,
check:i18n-keys, check:manifests, check:bilanz.

**Vier Befunde aus dem Klick-Beweis, alle vor dem Push behoben:** (a) Hydration-Mismatch auf
ALLEN Insights-Seiten, seit I2: `useFetch` mit `server: false` steht auf dem Server auf
`idle`, im Browser schon beim Hydrieren auf `pending` — das Lade-Icon, das `disabled` des
Knopfs und der Leer-Zustand des Editors („Beitrag nicht gefunden" kurz per SSR) wichen ab.
Der Ladezustand zählt jetzt erst nach dem Mounten (`hydrated`-Ref) · (b) die Korrekturen-
Tabelle lief bei 1440 px aus dem Panel und versteckte „Ablehnen": Nuxt UI setzt
`whitespace-nowrap` auf jede Zelle, ein Grund-Satz reichte (dieselbe Falle wie die
Kit-Lizenztabelle) — `:ui="{ td: 'whitespace-normal' }"` · (c) die Beleg-Auswahl zeigte
„-1" statt „Ohne Beleg": ein numerisches `USelect` rendert einen Wert ohne Eintrag roh —
„Ohne Beleg" ist jetzt ein Eintrag mit Wert -1, das Schema weist ihn weiter ab · (d) die
Ablehnung des Schemas war UNSICHTBAR: die Zeilen-Felder für Zeichen/Historie hatten kein
`name`, UForm konnte den Fehler nirgends zeigen, Speichern tat stumm nichts — `name`
`marks.<i>.sourceIndex` usw. plus Meldung „Beleg fehlt" statt zods „Too small".

**Gelernt:** (1) `server: false` + `status` im Markup ist IMMER ein Hydration-Mismatch —
Nuxt startet die Abfrage im Browser vor dem Mount; ein Ladezustand, der SSR-sichtbar ist,
braucht ein Mount-Gate. Die Warnung steht nur in der Dev-Konsole, Typecheck/Lint/Tests sehen
sie nie; ein Klick-Beweis liest deshalb IMMER auch die Konsole mit. (2) Ein UForm-Feld ohne
`name` hat keinen Ort für seinen Fehler: das Schema blockiert, der Mensch sieht nichts. Jede
Zeilen-Liste in einem Formular braucht `name` mit Index. (3) `nuxi typecheck` neben einem
laufenden Dev-Server desselben Worktrees schreibt `.nuxt` neu und reißt den Server mit —
Wächter vor oder nach dem Beweis fahren, nicht daneben. (4) Ein Zähler-Reiter, der den
Standard „Offen" zeigt, ist im Beweis nur mit ZWEI Zeilen aussagekräftig — eine angenommen,
eine abgelehnt —, sonst ist „0 offen" auch ohne Funktion grün.
## BI1 I4 — Brand Insights: Themenradar (2026-09-09)

**Was gebaut wurde** (Commit `c52768e3`, Merge mit den I2-Resten der Nachbarsitzung `83e1b4d3`):
Paket I4 aus docs/plans/BRAND-INSIGHTS.md §9.6/§9.9 — der Themenradar hinter `insights.manage`,
gebaut von einem Opus-Lauf nach Auftrag, geprüft und nachgeschärft im Hauptloop. Die vier
Leitplanken sind KEINE Absicht, sondern Form: es gibt in `shared/insightsYoutube.ts` nur drei
Adress-Bauer (`channels`, `playlistItems`, `videos` — je 1 Einheit), keinen für `search.list`
und keinen für `commentThreads`; ein Test hält das über die Export-Namen fest.

- **Migration insights-004 `insights_topics`** (server-only, 14 Spalten, Indizes über
  `createIndexSteps`: `uq_video_id`, `idx_fetched_at`, `idx_topic`). Je Video NUR die
  öffentlichen API-Zahlen (Aufrufe, Likes, Kommentar-ZAHL, Datum, Kanal, Titel) plus UNSERE
  drei Werte (`relevance`, `opportunity` nullable, `opportunitySignals`). **Retention-Entscheid
  (§9.6 offen gelassen, in I4 gefällt): „täglich neu" + 30-Tage-Netz** — der Lauf überschreibt
  je `videoId`, und was er nicht mehr erreicht (Kanal aus der Liste, Video privat, Lauf
  ausgefallen), löscht das Netz als GANZE Zeile. Leitplanke (a) ERLAUBT das Bleiben unserer
  Zahl, verlangt es nicht; eine 30 Tage alte Zahl zu einem Video, das wir nicht mehr
  beobachten, hilft Discover nicht. Schema-Parität-Soll + Bilanz nachgezogen.
- **Kanalliste als Konfiguration** `pukalani.insights.radar.channels` (Layer-Default leer —
  eine Kanalliste ist eine redaktionelle Entscheidung der App), zwölf Kanäle in
  `apps/branding/app/app.config.ts`, jede Id aus dem Kanal-HTML verifiziert (`externalId`
  bzw. kanonische `/channel/UC…`-Adresse). Uploads-Playlist = `UU` + Rumpf der Kanal-Id;
  Handles und alles, was nicht `UC` + 22 Zeichen ist, wirft `readInsightsRadarConfig` still
  heraus. `maxVideosPerChannel` 20 (Deckel 50).
- **Relevanz per Schlagwortliste** (§9.6): `INSIGHTS_TOPIC_KEYWORDS` je Cluster (de+en),
  `insightsRadarClassify(title, channelTopic)` — Treffer auf Wortgrenzen, Cluster mit den
  meisten Treffern gewinnt, Gleichstand ⇒ Kanal-Cluster, ohne Treffer 0.5 (kuratierter Kanal
  ist ein halbes Signal), je Treffer +0.25, Deckel 1.0. Ohne Abonnentenzahl gibt es KEIN
  Performance-Signal (Zahl aus 2 von 5), nicht Signal 0.
- **Sweep** `server/utils/insightsRadarSweep.ts` mit injizierbaren `deps` (fetch, Config,
  TablesDB, Log — nur so mit Fakes prüfbar), Plugin `radar-sweep.ts` (erster Lauf 90 s, dann
  24 h, Produkt-Registry-Gate). Drei Gates VOR dem ersten Aufruf: Schlüssel, Kanäle,
  Quota-Schätzung (`ceil(K/50) + K + ceil(K·V/50)`, Deckel 5.000 von 10.000 — der Nachtlauf
  teilt sich das Budget mit dem Knopf). `quotaExceeded`/401/403 bricht ab, ein fehlender
  Kanal kostet einen Kanal. Fehlermeldungen gehen nur durch `insightsYoutubeSafeMessage`
  (der Schlüssel steht bei dieser API in der Query jeder Adresse, und `fetch` zitiert
  Adressen in Fehlern). Logs tragen NUR Zahlen.
- **Routen** `GET /api/insights/radar` (Zustand: `configured`, Kanäle, Quota-Schätzung,
  `lastRunAt` = jüngster `fetchedAt`, kein zweiter Zustand; Zeilen nach `opportunity`
  sortiert, Deckel 500) und `POST /api/insights/radar/run` (Drossel 3/Stunde je Konto über
  `useRateLimitStore`, 503 `not_configured` ohne Schlüssel). **Seite**
  `/dashboard/insights/radar`: Status-Karte (Schlüssel hinterlegt/fehlt mit dem Env-Namen als
  Code, Kanäle, Kosten je Lauf, letzter Lauf), Knopf, `InRadar` unverändert mit der
  gespeicherten `relevance` über `resolveRelevance`; Warnung ohne Schlüssel.
- **Env-Wächter:** `NUXT_INSIGHTS_YOUTUBE_KEY` ist im `branding`-Block von
  `verify-site-env.mjs` PFLICHT und bis zu Davids Eintrag bewusst rot — ein still nichts
  tuender Sweep ist die F44-Sorte Loch. `NUXT_INSIGHTS_YOUTUBE_BASE_URL` (Stub-Adresse für
  den lokalen Beweis) steht dort absichtlich NICHT.
- 55 neue Tests (120 → 175; nach dem Merge mit den I2-Resten 199).

**Klick-Beweis** (Dev-Server aus dem Worktree, Port 3021, Dev-Instanz `portfolio-g4ml`,
Migration 004 lokal gefahren, Admin-Session per Server-SDK als Cookie; **YouTube als Stub**
auf Port 3099 über `NUXT_INSIGHTS_YOUTUBE_BASE_URL` — antwortet für jede Kanal-Id
deterministisch in den drei API-Formen): GET vor dem Lauf `configured: true, channels: 12,
quotaEstimate: 18, lastRunAt: null` → Knopf „Jetzt laufen lassen" → Toast „Fertig: 12 Kanäle,
38 Videos, 38 gespeichert, 0 entfernt" → Tabelle mit Cluster, Zahlen, Alter und „78 von 100 ·
aus 3 von 5 Signalen" (Zeilen ohne Abonnentenzahl zeigen „aus 2 von 5") → zweiter Lauf
idempotent (38 gespeichert, 0 neu) → Stub-Treffer NUR `/channels` 1×, `/playlistItems` 12×,
`/videos` 1× (kein `search`, kein `commentThreads`; Query-Parameter ohne Inhalt) → 4. Lauf in
der Stunde 429 `reason: rate_limited` → ohne Session 401 → **30-Tage-Netz:** eine Zeile mit
`fetchedAt` vor 40 Tagen eingepflanzt, Lauf meldet `deleted: 1`, Zeile weg → Plugin-Lauf nach
90 s im Log (`insights.radar_swept`). **Fail-closed** (zweiter Server ohne Schlüssel):
`configured: false`, POST 503 `reason: not_configured`, Warnung „Es fehlt der API-Schlüssel",
Knopf ausgegraut, einmalige Log-Zeile `insights.radar_unconfigured`. Screenshots an David.
Wächter: 199 Tests, Lint insights/branding/scripts, Typecheck branding, check:i18n-keys,
check:manifests, check:bilanz.

**Ein Befund aus dem Klick-Beweis, vor dem Push behoben:** die Status-Karte hatte **Höhe 0**.
Der Body der `UDashboardPanel` ist eine Flex-SPALTE fester Höhe; ein Kind mit
`overflow-hidden` (`UCard`) verliert dort sein `min-height: auto` und schrumpft auf null,
sobald der Inhalt darunter überläuft. Die Seite las sich per `innerText` vollständig vor,
gerendert war ein Strich, der Knopf stand im DOM und war nicht anklickbar — Konsole, Lint,
Typecheck sahen nichts. Fix: `shrink-0` an der Karte, Begründung im Markup.

**Nicht live geschaltet, und zwar absichtlich:** der Schlüssel liegt nicht in der Server-.env
(per ploi geprüft), und die Prod-Migration insights-004 braucht Davids Ja. Der Code ist
deployt und ohne Schlüssel stumm.

**Gelernt:** (1) Ein Klick-Beweis, der nur `innerText` liest, ist grün bei einem Element mit
Höhe 0 — die Geometrie (`getBoundingClientRect`) gehört zum Beweis, sobald ein Klick nicht
ankommt. (2) `"channelId":"UC…"` im HTML einer Kanalseite ist der Kanal eines EMPFOHLENEN
Videos, nicht der der Seite; die Kanal-Id steht in `externalId` bzw. der kanonischen
`/channel/`-Adresse (zwei von zwölf wären sonst fremd gewesen). (3) Ein Flex-Kind mit
`overflow-hidden` in einer Flex-Spalte braucht `shrink-0` — dieselbe Falle wartet auf jede
weitere `UCard` über einer langen Tabelle im Dashboard-Body. (4) Zwei `nuxi dev` derselben App
im selben Worktree schliessen sich aus („Another Nuxt dev is already running") — der
Fail-closed-Beweis ohne Schlüssel läuft NACH dem Beweis mit Schlüssel, nicht daneben.
(5) `useAppConfig(event)` ist in Nitro kein gültiger Aufruf (TS2554), auch wenn eine Stelle im
Repo es so schreibt — die App-Config ist eine Konstante des Prozesses.

## BI1 I4 — Gates auf Prod geschlossen: Schlüssel, Migration, erster Lauf (2026-09-10)

**Was:** (1) `NUXT_INSIGHTS_YOUTUBE_KEY` in die Server-`.env` von branding.supply — über ein
Terminal-Fenster mit `read -rs`, das den Wert nur per stdin durch ssh reicht (nie Argument, nie
Log, nie Chat), Sicherung der `.env` daneben, Gegenlesen nur strukturell (eine Schlüssel-Zeile,
Wertlänge 39, keine doppelten Schlüssel — das Alarmsignal aus dem Vorfall vom 2026-09-01),
danach `pm2 startOrReload <ecosystem> --update-env` und Health 200 am Prozess; `ops:site-env`
für branding grün. (2) Prod-Migration insights-004 mit Davids Ja gefahren (`pnpm migrate --app
branding --env-file … --layer insights`), Parität branding 39/39. (3) Erster Lauf auf Prod:
12 Kanäle, 205 Videos gespeichert, 0 Fehler, 18 Einheiten; die Radar-Seite zeigt „Letzter Lauf
10.09.2026" und die Tabelle mit Opportunity-Werten.

**Befund für die I4-Sitzung (nicht angefasst):** Ogilvy, pentagramdesign und Harry Dry liefern
Uploads von vor Jahren (755–5314 Tage) mit Opportunity 17–50 — das 30-Tage-Netz gilt dem
Abruf-Datum, nicht dem Video-Alter; ein Alters-Deckel je Video (oder die Kanäle aus der Liste)
wäre die nächste Schärfung.

**Gelernt:** (1) Ein Terminal-Fenster für ein Geheimnis: `osascript` an Terminal.app scheitert
ohne Automations-Freigabe (AppleEvent-Timeout) — eine ausführbare `.command`-Datei per `open`
braucht keine. (2) Ein Klick des Chrome-Werkzeugs auf einen Nuxt-UI-Knopf kann ohne jede
Wirkung verpuffen (kein Request, kein Toast) — Beweis ist der Server: `fetch` in der Seite oder
das pm2-Log, nie „ich habe geklickt". (3) Der 90-s-Erstlauf des Sweeps nach dem Deploy lief
VOR der Migration und endete still am fehlenden Tisch — ein leeres Log nach dem Neustart ist
also kein Beweis für „nichts passiert", sondern ein Hinweis auf einen stillen Rückweg.

## BI1 I4-Schärfung — Alters-Deckel je Video, Pentagram raus (2026-09-10)

**Anlass:** der Befund der Nachbarsitzung aus dem ersten Prod-Lauf (COMPLETE „BI1 I4 — Gates auf
Prod geschlossen"): Ogilvy, „pentagramdesign" und Harry Dry lieferten Uploads von 2012–2024 mit
Opportunity 17–50 — die Uploads-Playlist gibt die JÜNGSTEN Videos eines Kanals, und bei einem
Kanal ohne neue Uploads sind das Jahre alte; das 30-Tage-Netz rechnet mit dem Abruf-Datum.

**Was gebaut wurde:** (1) `INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT = 180` / `…_CAP = 365`,
`readInsightsRadarConfig` liest `pukalani.insights.radar.maxVideoAgeDays` (Unsinn ⇒ Vorgabe,
über 365 ⇒ 365). (2) Der Sweep überspringt ältere Videos VOR dem Schreiben und zählt sie
(`tooOld` im Ergebnis, im Log und im Toast) — ein Video ohne lesbares Datum bleibt drin. (3) Das
Netz läuft zweimal: über `fetchedAt` (30 Tage) und über `publishedAt` (Deckel), damit die schon
gespeicherten alten Zeilen sofort fallen und nicht erst nach 30 Tagen. `publishedAt` hat keinen
Index; der Filter läuft auf Appwrite 2.0 ohne (lesend gegen Prod geprüft: 32 Zeilen älter als
180 Tage, genau die drei Kanäle plus ein Google-Search-Central-Video von vor 245 Tagen),
sortiert wird über den indizierten `fetchedAt`. (4) `GET /api/insights/radar` meldet
`maxVideoAgeDays`, `InRadar` sagt es als dritte Hinweiszeile (de+en). (5) „Pentagram" aus der
Kanalliste: `@PentagramDesign` ist ein Privatkonto, `@pentagram` eine Metal-Band — das Designbüro
hat keinen YouTube-Kanal unter seinem Namen. Drei neue Tests (Deckel beim Schreiben, Deckel im
Netz inkl. Kappung auf 365, Config-Leser), Sweep-Fake liest die Spalte aus der Abfrage.
Beschlüsse im DECISION-LOG (2026-09-10, vier Punkte, darunter Env statt `instance_secrets` mit
Grund).

**Beweise:** 202 Tests insights, Lint insights/branding, Typecheck branding, check:i18n-keys
(309 Nennungen), check:manifests, check:bilanz, check:doc-links, `pnpm --filter branding build`;
Prod (Build `fbe77d71`, 2026-09-10): `GET /api/insights/radar` meldet `maxVideoAgeDays: 180`,
11 Kanäle, 17 Einheiten, die Hinweiszeile steht auf der Seite; der Lauf über
`POST /api/insights/radar/run` (aus der eingeloggten Seite — der Werkzeug-Klick auf den Knopf
verpuffte wie bei der Nachbarsitzung) antwortet 200 mit `channels 11, videos 173, upserted 173,
deleted 32, tooOld 31, errors 0, quotaUnits 17`; danach 173 Zeilen, ältestes Video 2026-03-17,
neun Kanäle in der Tabelle — Ogilvy, „pentagramdesign" und Harry Dry sind weg, genau die 32
Zeilen der lesenden Vorab-Prüfung.

**Gelernt:** (1) Eine Seite mit `useFetch({ lazy: true, server: false })` zeigt nach dem Laden
erst ihre VORGABEN („Schlüssel fehlt", „kein Kanal", „noch kein Lauf") — wer sie sofort ausliest,
liest einen Zustand, den es nie gab; der Beweis liest die Antwort der Route (`fetch` in der
Seite) oder wartet auf `status === 'success'`. Zwanzig Minuten Fehlersuche an einem gesunden
Server. (2) Eine Kanal-Id ist erst geprüft, wenn Titel UND jüngster Upload zur Erwartung passen —
`@PentagramDesign` löst sauber auf, nur eben auf jemand anderen. (3) Ein Wächter, der etwas
„bei David" nennt, muss gelesen werden, BEVOR man Fragen bündelt: Schlüssel und Migration waren
schon durch (Env-Wächter grün, Parität 39/39), während OPEN-ITEMS sie noch als offen führte.

## PM1 — Produkt-Manifest-Wächter: `apiPrefixes` ⇒ Laufzeit-Plugin (2026-09-09)

**Ausgangslage:** Ein `product.manifest.ts` ist `import type`-only; was es unter
`apiPrefixes` verspricht, löst erst ein `server/plugins/product-manifest.ts` mit
`registerProductManifest(manifest)` ein. Die Produkt-Middleware
(`core/server/middleware/04.product-gate.ts`), `isProductEnabled()`, der Betreiber-
Katalog und `/api/platform/products` kennen nur die Registry. `market` fuhr so seit
M1 (behoben `bb1f9102`, COMPLETE „BI1 I1"); drei Layer blieben ohne Plugin.

**Live-Befund vor dem Bau** (`/api/platform/products`): pukalani.studio listete
`admin, analytics, core, pages, system, themes` — **`domains` fehlte**, obwohl
einkompiliert; admin.pukalani.app listete neun Produkte — **`runner` fehlte**.
Folge: Notabschaltung über `app_config.products.<key>.enabled=false` traf
`/api/site/domain/**` und `/api/runner/**` nie, beide fehlten im Katalog.
`onboarding` (`tier: foundation`) war nur inkonsistent zu core/system/admin/themes.

**Davids Entscheidung** (strukturierte Frage je Layer, alle drei Empfehlungen
angenommen, daher kein DECISION-LOG-Eintrag): **Plugin nachrüsten** für `domains`,
`runner` und `onboarding`. Ausnahmeliste bleibt leer.

**Gebaut:**
- Drei Plugins nach dem insights-Muster (`packages/{domains,runner,onboarding}/server/plugins/product-manifest.ts`), Kopfkommentar nennt die Wirkung und das Datum.
- `scripts/check-manifests.mjs` Prüfung 6: jeder Layer mit `apiPrefixes` braucht das Plugin, und das Plugin muss wörtlich `import manifest from '../../product.manifest'` + `registerProductManifest(manifest)` enthalten (eine leere Plugin-Datei zählt nicht). `MANIFEST_PLUGIN_EXCEPTIONS` (Map Layer → Begründung, heute leer) — steht ein Layer dort UND hat ein Plugin, ist das ebenfalls rot („Ausnahme streichen").

**Gegenproben** (Wächter rot, Plugin zurückgelegt): (A) Plugin entfernt ⇒ „fehlt —
das Manifest deklariert apiPrefixes [/api/site/domain] …"; (B) Plugin ohne Aufruf ⇒
„muss … enthalten"; (C) Ausnahme eingetragen trotz Plugin ⇒ „Ausnahme streichen";
(D) Ausnahme + kein Plugin ⇒ grün. Gates: check:manifests, lint:scripts, -r lint,
-r typecheck, -r test, check:i18n-keys, check:single-copy, check:bilanz.

**Live-Beweis nach dem Deploy** (Build `b976197d` auf beiden Hosts, CI Test/Lint/
Typecheck/E2E grün): `/api/platform/products` listet auf pukalani.studio jetzt
`domains`, auf admin.pukalani.app `runner`; `GET /api/site/domain` und
`GET /api/runner/runs` antworten weiter 401 (nicht 404) — kein Entitlement-Dokument
hat die neu registrierten Produkte abgeschaltet.

**Gelernt:** Der Wächter prüft die DATEI, deshalb prüft er auch den INHALT — ein
leeres `defineNitroPlugin(() => {})` hätte die Regel formal erfüllt und nichts
registriert. Zweitens: `/api/platform/products` ist der schnellste Live-Beweis,
ob ein Layer wirklich registriert ist (fehlt der Key trotz Site-Manifest, fehlt das
Plugin). Drittens (Arbeitsweise): `git checkout -- <datei>` als „Aufräumen" nach
einer Gegenprobe wirft auch die eigene uncommittete Änderung weg — Gegenproben an
einer Kopie im Scratchpad fahren oder die Änderung vorher als WIP committen.


---

## BI1 I3 — Brand Insights: die öffentlichen Seiten (2026-09-10)

**Was gebaut wurde** (zwei Commits — Core eigens, wie die Git-Regel es verlangt; gebaut von
einem Opus-Lauf nach Auftrag, geprüft und nachgeschärft im Hauptloop): Paket I3 aus
docs/plans/BRAND-INSIGHTS.md §9.5 — Journal, Artikel, Themen, Markenprofil, Duell und Ranking
sind öffentlich lesbar, ohne Konto, über eigene Leserouten mit Microcache.

- **DER RIEGEL IST DIE HAUPTSACHE.** Das Gate aus §6 (Anwaltsantworten BI1-3/BI1-4) ist
  GEBAUT, nicht umgangen: `pukalani.insights.publicFormats` steht im Layer auf `['article']`,
  und ein gesperrtes Format antwortet an BEIDEN Türen 404 — Seite UND Leseroute, wie die
  Datentür. Auch Sitemap und og-Bild lassen es weg. Die pure Regel
  `readInsightsPublicFormats` ist fail-closed (kein Array bekannter Schlüssel ⇒ nichts
  erlaubt). Davids Handgriff nach der Anwaltsantwort ist EINE Zeile, kein Code.
- **Sieben Leserouten** `/api/insights/public/**` (Liste, Artikel, Marke, Duell, Rankings ×2,
  Korrektur-POST), je 60 s Microcache; `?preview=1` hinter `insights.manage` und NIE im Cache.
- **Was öffentlich wird, entscheidet die Route:** `state ∈ {published, updated}`, interne
  Felder (`noteInternal`, `reviewedBy`, Modell-Stempel) gestrichen — und eine NICHT redigierte
  Maschinenübersetzung verlässt den Server gar nicht (§3.2). Die Seite zeigt dann die
  Grundfassung mit Hinweis, `noindex, follow`, und meldet die fehlende Sprache NICHT als
  hreflang-Alternate.
- **Sieben Seiten**; Filter, Sortierung und Ansicht stehen in der Adresse (teilbarer Link).
  301 aus `slugHistory` und für die Duell-Gegenrichtung (Slug alphabetisch), 410 für die auf
  Wunsch entfernte Marke — mit Hinweis und ohne ihre Inhalte.
- **Korrekturweg** auf Profil, Duell und Ranking: EIN Formular, Honigtopf, 3/Std + 10/Tag je
  Anschluss, Ziel muss öffentlich sein, Dublette 409, kein Double-Opt-in, Frist 12 Monate als
  Datum in der Zeile.
- **SEO:** JSON-LD Article + BreadcrumbList (+ ItemList am Ranking), og:image je Artikel,
  Sitemap mit `lastmod` und nur den Sprachen, die es WIRKLICH gibt. Bewusst kein
  `Organization` und kein `Review`/`AggregateRating` über fremde Marken. Nav-Punkt
  „Brand Insights" (Eigenname, unübersetzt).
- **Drei Core-Bausteine** (eigener Commit `4c45ca2a`): `markdownHeadings` + Prop
  `headingAnchors` an `MarkdownContent` (Verzeichnis und Text rechnen DIESELBE Id an EINER
  Stelle), `shared/seoAlternates.ts` + `useSeoHiddenLocales()` in `useLocaleSeoHead()`,
  Minuten-Eimer `insights:correction`. 14 neue Fälle, je mit Gegenprobe.

**Klick-Beweis** (Dev-Server aus dem Worktree, Port 3020, Dev-Instanz `portfolio-g4ml`,
Admin-Session per `users.createSession` als Cookie, Daten per Server-SDK gesät und danach
wieder entfernt): Riegel zu ⇒ Marke/Duell/Rankings 404, Liste nur Artikel, Entwurf 404,
`?preview=1` ohne Konto 401 und mit Admin-Cookie 200 + noindex + Vorschau-Marke · alter Slug ⇒
echte 301 mit richtigem Ziel · Honigtopf schreibt KEINE Zeile (in der Tabelle gegengeprüft),
Adresse kleingeschrieben gespeichert, Frist auf 2027 · Entwurf als Ziel und Marke bei
gesperrtem Format je 404, `removal` ohne Grund und unbekanntes Feld je 400, 4. Korrektur in der
Stunde 429 `rate_limited_hour` (der Minuten-Eimer des Core greift schon beim 4. in der Minute)
· og-Bild 1200×630 PNG, für ein gesperrtes Format 404 · Sitemap bietet den Artikel NUR auf
Deutsch an (hreflang `x-default,de`), ohne `/brands` und `/rankings` · die unredigierte
englische Fassung steht nirgends in der Antwort. Riegel testweise offen ⇒ Profil mit
Steckbrief/Zeichen/Historie/Beziehung/Quellen, Duell mit 301 der Gegenrichtung, Ranking mit
ausgewiesener Lücke „auf Wunsch entfernt", entfernte Marke 410 ohne ihre Inhalte; danach
zurückgesetzt. Browser: keine Hydration-Meldung, ein geteilter Link stellt Thema, Sortierung
und Ansicht wieder her, die englische Fassung zeigt „This language has not been edited yet".
Wächter: 249 Tests insights, 1637 core, 32 branding, Lint insights/core/branding/scripts,
Typecheck branding exit 0, check:i18n-keys 310, check:manifests 26/9, check:bilanz,
check:single-copy, check:doc-links.

**Drei Befunde aus dem eigenen Klick-Beweis, alle vor dem Push behoben:** (a) `/rankings` war
bei gesperrtem Format eine erreichbare, indexierbare Seite („Rankings", `index, follow`) — der
Riegel hatte dort bewusst NICHT geschlossen, mit der Begründung „eine 404 in der Navigation
wäre Davids 404-Audit"; die trägt nicht, denn bei gesperrtem Format steht die Adresse in keiner
Navigation und in keiner Sitemap. (b) Ein Duell ohne Brand-Check antwortete 404, obwohl die
Prüfregeln vor `review` keinen verlangen (`showsScore` fragt `brandRefs.some(ref => ref.checkId)`)
— Sitemap, Journal-Karte und die 301 der Gegenrichtung zeigten damit auf einen toten Punkt. Die
Statistik-Tafel entfällt jetzt (wie `score` am Profil seit dem Prototyp optional ist), Fakten,
Einordnung und Quellen bleiben. (c) Auf JEDER Karte und im Artikel-Kopf stand der rohe
Zeitstempel `2026-09-08T10:00:00.000+00:00` statt „8. Sept. 2026".

**Gelernt:** (1) **Ein Prototyp ist eine Form, keine Datenprobe.** `insightsDay` war an
Demo-Daten mit reinen Datums-Strings gebaut (`publishedAt: '2026-09-04'`); die echten Spalten
sind Appwrite-`datetime` und liefern einen vollen Zeitstempel, den die Funktion als „ungültig"
zurückgab — und ihr Ausweg „gib die Eingabe zurück" machte den Fehler zu etwas, das wie Absicht
aussah. Der Editor hatte sich längst mit `.slice(0, 10)` an der Aufrufstelle beholfen: genau die
Sorte Wissen, die an der zweiten Aufrufstelle fehlt. Normalisierung gehört IN die Funktion.
(2) **Ein Riegel, der eine Adresse übrig lässt, ist keiner.** Die Liste eines gesperrten Formats
darf nicht mit einer leeren Liste antworten — „diesen Bereich gibt es, er ist nur leer" ist eine
Auskunft, und die Seite darüber wird indexiert. 404 an beiden Türen, wie die Datentür.
(3) **Zwei Sicherungen für dieselbe Sache müssen dieselbe Frage stellen.** Die Prüfregeln vor
`review` und die Leseroute waren sich über das Duell uneins; das Ergebnis war ein freigegebener
Beitrag, den die Sitemap anbot und die Route mit 404 beantwortete. Wer eine Bedingung in die
Leseroute schreibt, muss sie in der Redaktion durchsetzen — oder sie fallen lassen.
(4) **Textsuche im HTML ist kein Render-Beweis:** der i18n-Katalog und der Nuxt-Payload stehen
im Dokument, und Vue rendert Template-Kommentare mit aus. Dreimal hintereinander ein falsches
„JA" gemessen; erst `<script>`-Blöcke UND Kommentare herausschneiden misst, was ein Mensch sieht.

## BI1 Kanalliste-Nachtrag — Ogilvy und Harry Dry ersetzt (2026-09-10)

**Anlass:** der offene Punkt aus COMPLETE „BI1 I4-Schärfung" — nach dem Alters-Deckel blieben
zwei Kanäle in der Liste, die nichts mehr liefern. Das Inventar hat es scharf gemacht: im Lauf
vom 2026-09-10 lieferten **Ogilvy** (letzter Upload 2024-12-02, 646 Tage) und **Marketing
Examples / Harry Dry** (2024-07-20, 781 Tage) **null Zeilen** bei je einer Einheit Kosten pro
Lauf — 173 Zeilen kamen aus 9 der 11 Kanäle. Beide waren zugleich der EINZIGE Kanal ihres
Clusters (`brand-psychology` bzw. `brand-language`).

**Davids Entscheidung (2026-09-10, gebündelt gefragt): ersetzen statt streichen.**
- `brand-psychology`: Ogilvy → **Nudgestock** (UCBOzmOV9UHpTEYNr6NqOZ2g) — Ogilvys eigenes
  Behavioural-Science-Festival (Rory Sutherland), also dieselbe Nische und dasselbe Haus.
  Bewusst dünn und stoßweise: rund 3 Uploads je 180 Tage, der Schwung an Vorträgen kommt nach
  dem Festival im Juni.
- `brand-language`: Marketing Examples → **StoryBrand With Donald Miller**
  (UC_RirP9QR49zw2HOZ95dKrA) — Messaging, Elevator Pitch, Tonalität; täglich aktiv.
Verworfen: beide ersatzlos streichen (hätte zwei von sieben Clustern ohne eigenen Kanal
gelassen) · Ogilvy Consulting (825 Tage) und Copyblogger (923 Tage), beide ebenso tot wie das,
was sie ersetzen sollten · Marketing Week (6637 Tage). Begründungen im DECISION-LOG (2026-09-10).

**Prüfweg ohne API-Schlüssel** (der Schlüssel liegt nur in der Prod-`.env`, und das soll so
bleiben): Handle → `externalId` aus dem Kanal-HTML → `https://www.youtube.com/feeds/videos.xml
?channel_id=UC…` liefert Titel UND jüngsten Upload. Damit ist die Pentagram-Lehre („Titel und
jüngster Upload müssen passen, nicht nur die Id") zum ersten Mal maschinell prüfbar — und sie
hat sofort gegriffen: **`@BusinessMadeSimple` löst auf einen Kanal namens „Cameron Belling"
auf** und ist gar nicht erst in die Liste gekommen.

**Beweise:** 202 Tests insights, Lint insights + branding, Typecheck branding, `check:i18n-keys`,
`check:manifests`, `check:bilanz` — alle grün; vier CI-Checks auf `main` grün (Test, Lint,
Typecheck, E2E). Deploy-Beweis `https://branding.supply/api/health` → `.build` = `d1c3da9a`.
Danach der Lauf per Knopf auf `/dashboard/insights/radar` (1 von 3 der Stunde): Toast
„Fertig: 11 Kanäle, 190 Videos, 190 gespeichert, 0 entfernt, 24 zu alt"; `GET /api/insights/radar`
danach **196 Zeilen aus allen 11 Kanälen** — StoryBrand 20 Zeilen unter `brand-language`
(„Messaging Not Working? Fix Your C-Suite Confusion", 2026-09-09), Nudgestock 3 Zeilen unter
`brand-psychology` („Nudgestock 2026 - Livestream", 36 Tage, 42 von 100), Ogilvy und Marketing
Examples weg. Kanalzahl bleibt 11, Quota-Schätzung bleibt 17 Einheiten je Lauf.

**Gelernt:** (1) **Ein leerer RSS-Feed ist kein Beweis für „tot".** `videos.xml` lässt Kanäle
ohne Langform-Uploads leer aussehen, während die Uploads-Playlist (die unser Sweep über
`UU`+Rumpf liest) sehr wohl etwas hat — Copy Posse, April Dunford und Wynter kamen so als
„inaktiv" heraus und wurden zu Unrecht aussortiert. Umgekehrt gilt der Beweis: ein Feed MIT
Einträgen datiert den jüngsten Upload zuverlässig. (2) **Das Nachrüsten eines zweiten Prüfwegs
per Scraping ist gescheitert** — die `/videos`- und `/playlist`-Seiten liefern per `curl` gar
keine Video-Einträge (JS-gerendert bzw. Consent-Wand); die Methode gab auch bei einem KNOWN-GOOD
Kanal null zurück. Ein Prüfweg, der beim Gegenbeispiel dasselbe sagt wie beim Befund, ist kein
Prüfweg — das fällt nur auf, wenn man ihn gegen einen bekannt gesunden Fall laufen lässt.
(3) Die Id-Regel `^UC[A-Za-z0-9_-]{22}$` erlaubt Unterstriche — bei `UC_RirP9QR49zw2HOZ95dKrA`
lohnte der Blick, denn ein zu enges Muster hätte den Kanal STILL aus der Liste geworfen
(`readInsightsRadarConfig` verwirft ohne Meldung). Vor dem Push gegen die echte Regel geprüft.
(4) Der Werkzeug-Klick auf „Jetzt laufen lassen" hat diesmal gegriffen (zweimal zuvor verpuffte
er) — der Beweis blieb trotzdem die Antwort der Route, nicht der Klick.

## BW1 Solo-Inhaltsrunde — die Wizard-Oberfläche spricht anredefrei (2026-09-09)

**Ausgangslage:** Die Katalog-FRAGEN tragen die Solo-Weiche seit `1ba268db`.
Alles daneben sprach weiter „ihr/euch": eine Einzelperson las im selben Kapitel
erst eine du-Frage und darunter „Tragt eure Farbe ein". Die Notiz in OPEN-ITEMS
sprach von 254 Texten.

**Inventur (Explore-Agent):** **407** Stellen, nicht 254 — die alte Zahl traf
genau `packages/brand/i18n/locales/de.json` (255) und übersah die 85
Marketing-Schlüssel in `apps/branding/i18n/` sowie 67 deutsche Strings im CODE
(Auswahl-Fragen, Berater-Stimmen, die komplett hartcodierte `team.vue`).
Nebenbefund, der Arbeit sparte: die Server-Prompts waren **schon erledigt**
(`conversePrompt.ts` hat seit converse-13 `addressLines`, `georgePrompt.ts`
`brandTeamVoiceLines`) — offen war dort genau eine Beispielzeile.

**Davids Zuschnitt** (drei strukturierte Fragen, alle Empfehlungen angenommen,
daher kein DECISION-LOG-Eintrag): (1) **nur Wizard** — Marketing bleibt „ihr"
nach der Copy-Regel vom 2026-09-04, und technisch könnte es die Weiche gar nicht
tragen: sie liest `profile.team`, das es auf öffentlichen Seiten nicht gibt;
(2) **neutral wo möglich**, Weiche nur wo wirklich jemand angesprochen wird;
(3) **Wizard-Code mitnehmen**.

**Gebaut** (`9cab0bc8`):
- **162 Texte anredefrei** — stepInfo, Hilfe-Blöcke, Design- und Kit-Kapitel, „Meine Brands", Dokument, Vorbilder. „warum es euch gibt" ⇒ „warum es diese Marke gibt".
- **Die 20 Brand-Check-Kriterien ebenfalls neutral**, obwohl sie auch auf der ÖFFENTLICHEN Ergebnisseite stehen: derselbe Text an zwei Orten kann nicht zwei Anreden haben, und anredefrei ist in beiden richtig. Bewusster Nebeneffekt auf einer Marketing-Seite.
- **11 Weichen-Paare** für Georges Kapitel-Einstiege und die Phasen-Intros der Berater, neue pure Regel `shared/brandTeamText.ts` (`teamTextKeyFor`) + Composable. Die Weiche ist je Schlüssel OPTIONAL: kein Paar ⇒ Basis-Schlüssel.
- **Im Code:** 15 `deSolo` an den Auswahl-Verträgen, 4 Solo-Satzanfänge der Berater, die Rückfragen von Nika und Otto, acht Vokabular-Stellen neutral.
- **`team` reist bis in die Prompts** (Generator + converse-Route setzen es, `advisorOpenersFor` und `brandChoiceFallbackQuestion` lesen es).
- **Wächter** `tests/brandTeamText.test.ts`: kein Wizard-Text spricht Plural · jede Weiche trägt beide Fassungen in beiden Sprachen · keine Solo-Fassung sagt „ihr".

**Beweise:** Gegenproben rot (eingebauter „ihr"-Text · halbe Weiche), Resolver
gegen den echten Katalog zeigt du/ihr getrennt und den Rückfall bei Texten ohne
Weiche, Dev-Server rendert ohne Konsolenfehler. Gates: -r lint, -r typecheck,
-r test (3187 in brand nach dem Rebase auf BK1), check:i18n-keys,
check:manifests, check:single-copy, check:bilanz. Nach der Runde stehen in
`de.json` noch 90 Plural-Texte — alle in Marketing und Admin, also gewollt.
**Offen: Davids Klick** durch ein Solo-Branding in der Werkstatt; lokal ging der
Beweis nur bis vor den Login (kein Gast-Zugang, Zugangsdaten gibt der Agent nicht ein).

**Gelernt:** Die Annahme „Englisch braucht die Weiche nicht, weil `you` beides
ist" war fachlich richtig und strukturell falsch — `i18nCatalog.test.ts` verlangt
für beide Sprachen denselben Schlüsselvorrat, und der Test hat es sofort gefangen.
Die englischen Kinder tragen jetzt zweimal denselben Satz; das ist kein Versehen,
sondern steht so im Kopf von `brandTeamText.ts`. **Zweite Lehre:** ein Wächter,
der eine Anrede prüft, muss die dritte Person Singular ausnehmen — „die Produkte
heissen nach ihr" und „danach steht hier ihr Score" sind kein „ihr" an den Leser.
**Dritte:** typografische Ellipsen aus einem Kommentar können ein
Zero-Width-Space mitbringen (`no-irregular-whitespace`); Typecheck und Tests
sehen das nicht, nur Lint. **Vierte (Umgebung):** ein frischer Worktree startet
`apps/branding` nicht — `@shikijs/engine-oniguruma` liegt im pnpm-Store, ist aber
nicht auflösbar, und Nitro antwortet auf JEDER Seite 500. Ein Symlink in
`node_modules` plus Neustart des Dev-Servers heilt es; das Repo bleibt unberührt.


## Vorfall appwrite-prod — Platte voll durch ClickHouse-Diagnose-Logs (2026-09-28)

**Auslöser:** UptimeRobot meldete `api.pukalani.app` als DOWN. `/v1/health/version`
antwortete beim Nachmessen durchgehend 200 in 0,7 s — der Alarm war ein Timeout,
kein 5xx (Traefik zeigt keine Fehlerantworten). Dahinter: Platte von
`appwrite-prod` (75 GB) zu 100 % voll, Load ~10 auf 4 CPUs, Redis mit 73 % CPU.

**Ursache:** Appwrite 2.0 brachte am 2026-09-08 ClickHouse als Pflicht-Container
mit (Nutzungsstatistik der Console, vorher MariaDB). Die Stock-`docker-compose.yml`
mountet für `clickhouse` KEINE Logger-Config, das Alpine-Image loggt auf Trace:
~320 Zeilen/s in `system.text_log`, insgesamt **31 GB `system.*`-Tabellen in
20 Tagen** (text_log 19,3 GB, trace_log 5,5 GB, query_log 1,9 GB,
processors_profile_log, part_log, metric_log …) plus 1,8 GB Logdateien im
Container. Nutzdaten (`appwrite.projects_usage_events`) nur 234 MB. Folge: Redis
konnte seinen RDB-Snapshot nicht schreiben (`MISCONF … unable to persist to
disk`) und lehnte ab 20:07 CEST JEDEN Schreibbefehl ab; die Worker drehten im
Retry (`[Usage] Failed to publish usage message`), daher die Last. Gleiches Muster
wie der Plausible-Vorfall vom 2026-08-04 (dort ClickHouse 24, andere Maschine).

**Sofortmaßnahme (00:32 CEST):** Logdateien im Container geleert, dann alle
`system.*_log`-Tabellen truncated — reine Diagnostik, kein Nutzdatenverlust.
Platte 100 % ⇒ 55 %, `rdb_last_bgsave_status:ok`, keine MISCONF-Zeile mehr,
Load 10 ⇒ 0,4.

**Dauerfix (mit Davids Ja, 00:40 CEST):** `~/appwrite/patches/clickhouse-logging.xml`
per `docker-compose.override.yml` nach `/etc/clickhouse-server/config.d/logging.xml`
gemountet — Logger auf `warning` (100 M × 3), sämtliche `system.*_log`-Tabellen
per `remove` abgeschaltet; `docker compose up -d clickhouse` (nur dieser
Container, Usage-Ingest lief weiter: +232 Events in 60 s). Dazu
`docker image prune` (10 verwaiste Images, 9,4 GB). Endstand **43 %**.
Beweise: preprocessed config ohne text_log/trace_log/query_log, `<level>warning`,
`system.*`-Parts nach 2 min unverändert 7 MB, Logdateien 2,8 K. Backup der
Override: `docker-compose.override.yml.bak-2026-09-28`.

**Gelernt:** `TRUNCATE` in ClickHouse braucht 1 MiB freien Platz — bei 0 Byte
zuerst Logdateien leeren (`: > *.log`), sonst `NOT_ENOUGH_SPACE`. Ein
Health-Endpunkt, der nur die Version liefert, sieht eine volle Platte nicht;
der UptimeRobot-Alarm war trotzdem echt. Ein Appwrite-Major-Upgrade kann neue
Container mitbringen, deren Standard-Config nicht für Dauerbetrieb taugt — nach
jedem Upgrade `docker system df -v` lesen. Beim Prod-Sprung auf 2.2 (AW22) muss
der `clickhouse`-Mount der Override mitkommen (Runbook ergänzt).

## Vorfall appwrite-prod — TLS-Zertifikat von api.pukalani.app acht Tage abgelaufen (2026-10-24)

**Entdeckt** beim Abschluss des ClickHouse-Vorfalls (Frage „ist das Ticket zu?"):
`curl https://api.pukalani.app` scheiterte mit `certificate has expired`. Das
Let's-Encrypt-Zertifikat war am **2026-10-16 11:45 UTC** abgelaufen; seitdem
antworteten portfolio, platform, admin und branding auf `/api/health` mit
`{"ok":false,"code":"INTERNAL_ERROR"}` — node-appwrite verweigert das abgelaufene
Zertifikat, jede Server-Route stirbt. **Acht Tage Komplettausfall ohne Alarm.**

**Ursache, zwei Glieder:** (1) Die planmäßige Erneuerung am 2026-09-17 00:00
scheiterte an Let's Encrypt: `accountDoesNotExist — Account acct/3757026986 not
found`. Das ACME-Konto lag nur in der Schreibschicht des Containers
`appwrite-worker-certificates` (kein Volume) und war beim CA nicht mehr bekannt;
warum, ist nicht feststellbar. (2) Appwrite setzt die Domain-Regel nach EINEM
Fehlversuch auf `status: unverified` — und der Zertifikats-Worker überspringt
jeden weiteren Auftrag für eine Regel, die nicht `verified` ist
(`Certificates.php:295`). Die Maintenance plante zwar jede Nacht „1 certificate
for renewal", der Worker warf es jede Nacht weg („skipped as the associated
rule is … not in the expected state"). Dazu lief der Worker seit Wochen mit
toter DB-Verbindung (`MySQL server has gone away`).

**Behebung (05:05–05:10 UTC, ohne Neustart von Traefik oder API):** Sicherung
von `/etc/letsencrypt` und der Regel-Zeile nach `~/backup/certs-2026-10-24/`;
Regel per SQL zurück auf `verified` + Redis-Cache-Schlüssel der Regel gelöscht;
`docker compose restart appwrite-worker-certificates` (frische DB-Verbindung);
altes ACME-Kontoverzeichnis im Container entfernt, damit certbot neu registriert;
dann Appwrites eigene Aufgabe `docker exec appwrite php app/cli.php ssl
--domain=api.pukalani.app --skip-check=true`. Neues Zertifikat bis
**2027-01-22**, neues ACME-Konto acct/3902972542, `renewDate` 2026-12-23,
`attempts` 0, alle vier Apps wieder `ok:true`.

**Gelernt:** Ein Health-Endpunkt mit `ok:false` ist nur so gut wie der Alarm
dahinter — UptimeRobot hat acht Tage 500er nicht gemeldet oder die Mails kamen
nicht an (⇒ MON1 in OPEN-ITEMS, braucht Davids Login). Appwrites
Zertifikats-Pfad hat KEINEN zweiten Versuch: ein roter Lauf macht die Regel
`unverified`, und ab da ist jede nächtliche Erneuerung ein stilles „skipped";
nach jedem Appwrite-Upgrade und bei jedem Zertifikats-Alarm also
`_console_rules.status` UND das Worker-Log lesen. Der Weg zurück ist
Appwrites `ssl`-Task, nicht Hand-certbot. Beim 2.2-Sprung (AW22) wandert der
Worker in `appwrite-worker` — der Befehl bleibt derselbe, das Log heißt dann
anders.

---

## BI1 I5a — Brand Insights: Newsletter-Anmeldung mit Double-Opt-in (2026-10-24)

**Was gebaut wurde** (drei Commits — Core eigens, wie die Git-Regel verlangt; gebaut von einem
Opus-Lauf nach Auftrag, geprüft und nachgeschärft im Hauptloop): die SAMMEL-Hälfte von Paket I5
aus docs/plans/BRAND-INSIGHTS.md §9.3a/§11 Frage 5. Der VERSAND ist I5b und bewusst nicht
gebaut — eine Route ohne Aufrufer ist eine Zusage ohne Einlösung.

- **Der Riegel ist gebaut, nicht abgewartet.** `pukalani.insights.newsletter.enabled`
  (Layer-Default `false`) schliesst an BEIDEN Türen: kein Formular auf der Seite, und alle drei
  Routen antworten 404 — mit dem NEUTRALEN Grund der übrigen öffentlichen Routen
  (`post_not_found`), nicht mit „Newsletter aus". Die pure Regel ist fail-closed. Grund: die
  Rechtstexte von branding.supply sind Entwurf (BS1 R2 wartet auf Davids Generator-Texte, R3 ist
  der Anwaltstermin) — ohne Datenschutz-Abschnitt „Newsletter" wird keine Adresse erhoben.
  Dieselbe Mechanik wie `publicFormats` bei den Markenprofilen, dieselbe Regel wie bei
  Plausible R2c: erst Text, dann Schalter.
- **Kein Takt (Davids Entscheidung).** Formular, Seite und Mail sagen „Wir schreiben, wenn ein
  neues Stück erscheint" — nirgends „wöchentlich". Ein Test nagelt die verbotenen Wörter in
  beiden Sprachen fest; der Wochentakt aus §3.3 bleibt Redaktionsziel statt Zusage an Fremde.
- **Tabelle `insights_subscribers` (Migration insights-006** — 005 hat während des Laufs die
  Kanalliste der Nachbarsitzung belegt), server-only, Spalten wörtlich aus §9.3a plus
  `retentionAt` als `datetime`. `uq_email_lower` ist die Wahrheit gegen Dubletten; der
  Unique-Konflikt wird abgefangen statt vorher gefragt. **Die Warteliste wird NICHT
  weiterbenutzt** — eine Zustimmung gilt nur für das, wofür sie gegeben wurde.
- **Drei Routen:** anmelden (Riegel → Honigtopf → Drossel 3/Std + 10/Tag → Zeile → Mail;
  schlägt die Mail fehl, 503 und die Zeile bleibt unbestätigt stehen), bestätigen (24-h-Frist,
  löscht den Token-Hash), abmelden (nur Token, idempotent). Die Anmelde-Antwort ist IMMER
  `{ ok: true }`: neue, bekannte unbestätigte, bekannte BESTÄTIGTE Adresse und zugeschnappter
  Honigtopf laufen in dieselbe Antwort — jede Unterscheidung wäre die Auskunft, wer auf der
  Liste steht.
- **Der Abmelde-Token ist abgeleitet statt gespeichert** (HMAC über die Zeilen-Id, konstante
  Zeit, Geheimnis wie bei `insightsIpHash`): der Bestätigungs-Hash wird beim Bestätigen
  gelöscht, und eine Spalte mit einem rohen Geheimnis wäre ein lesbares Passwort.
- **Fristen-Sweep, zwei Regeln:** nie bestätigt und Token-Frist 30 Tage her ⇒ die GANZE Zeile
  fällt (für diese Adresse gab es nie eine Einwilligung); abgemeldet und 12 Monate um ⇒ die
  personenbezogenen Felder werden GELEERT, die Zeile bleibt als Nachweis. `retentionAt` geht
  mit auf null (die I1-Lehre), und `emailLower` bekommt `removed:<rowId>` statt `''`, weil die
  Spalte den Unique-Index trägt.
- **Core (eigener Commit):** Minuten-Eimer `insights:newsletter` (3/min) neben
  `brand:correction`. Bestätigen und Abmelden bekommen bewusst keinen — beide tragen einen
  Token, und ein Deckel träfe den Menschen, der zweimal auf denselben Link klickt.

**Klick-Beweis** (Dev-Server aus dem Worktree auf 3030, LOKALE branding-Instanz auf Appwrite
2.6.1, Migration dort gefahren, **Mailpit** als SMTP): Riegel ZU ⇒ alle drei Routen 404 mit
neutralem Grund, beide Seiten 404, Formular nicht im gerenderten Baum. Riegel testweise AUF ⇒
Anmeldung mit `Leser@Example.TEST` ⇒ 200, **eine** Mail in Mailpit an `leser@example.test`
(kleingeschrieben gespeichert), Betreff „Bitte bestätige deinen Newsletter", Text mit dem
Versprechen-Satz, **keinem** Takt-Wort, Bestätigungs- UND Abmelde-Link; Bestätigen im BROWSER ⇒
Seite „Eingetragen", Zeile trägt `confirmedAt` und hat Token-Hash und Frist geleert; zweite
Anmeldung derselben bestätigten Adresse ⇒ 200 und **keine** zweite Mail; Honigtopf ⇒ 200, keine
Zeile, keine Mail; Abmelden mit dem Token aus der Mail ⇒ `unsubscribedAt` + `retentionAt` auf
+12 Monate, zweites Abmelden idempotent 200, **gefälschter Token 200 ohne jede Änderung**
(bewusst keine Fehlermeldung für jemanden, der aussteigen will); vier Anmeldungen von einem
Anschluss ⇒ die vierte 429 `rate_limited_hour`. Danach Riegel zurück auf `false` und erneut
geprüft, Testzeilen und Postfach geräumt, `.env` gelöscht.

**Prod (2026-10-25, Davids ausdrückliches Ja):** Migration `insights-006` gegen `branding` auf
api.pukalani.app gefahren — `insights_subscribers` angelegt (10 Spalten, 3 Indizes, server-only,
0 Zeilen), `insights-005` der Nachbarsitzung stand da bereits. `pnpm ops:schema-parity` branding
41/41, alle vier Instanzen grün. Live-Build `ecb5833f`; der Riegel bleibt zu, die drei Routen
antworten weiter 404, obwohl die Tabelle jetzt steht. **Der Runner muss direkt über `node
--experimental-strip-types scripts/migrate.mjs` laufen: pnpm 10 kennt ein eigenes `--env-file`
und schluckt die Option, auch hinter `--`.**

**Wächter nach dem Merge mit der Nachbarsitzung:** insights 362 Tests · core 1652 · branding 32
· Lint insights/core/branding/scripts (core eine Alt-Warnung in `ContentClamp.vue`) · typecheck
branding exit 0 · check:i18n-keys 311 · check:manifests 26/9 · check:bilanz · check:single-copy
· check:doc-links.

**Gelernt:** (1) **Ein Konflikt an einem Listen-ENDE ist additiv — aber die Auflösung darf die
Klammer nicht fressen.** Vier Dateien kollidierten, weil die Nachbarsitzung (`insights_channels`,
005) und dieses Paket (`insights_subscribers`, 006) an denselben Listen-Enden anbauen. Ein
Skript, das „beide Seiten behalten" mechanisch anwendet, hat in `insightsApi.ts` die schliessende
Klammer des letzten fremden Interfaces mit verschluckt: Tests und Typecheck liefen weiter, nur
ESLint meldete `Parsing error`. Nach einer mechanischen Konfliktauflösung gehört der LINT-Lauf
dazu, nicht nur die Tests. (2) **Eine Migrationsnummer ist erst beim Schreiben vergeben:**
`origin/main` zog während des Bau-Laufs 005 unter dem Paket weg. Die Nummer gegen `origin/main`
zu prüfen ist Pflicht — am Anfang UND vor dem Commit. (3) **Der erste Aufruf einer neuen
API-Route im Dev-Server ist kein Beweis:** die Bestätigungsseite stand drei Sekunden lang auf
„Wir prüfen den Link …", weil Nitro die Route erst bündelte — die Zeile in der Datenbank war da.
Wer zu früh misst, sieht einen Fehler, den es nicht gibt (die Umkehrung der I4-Lehre, wo zu
frühes Messen einen Zustand zeigte, den es nie gab). (4) **Mailpit ist der einzige ehrliche
Beweis für einen Double-Opt-in:** „200 zurückbekommen" sagt nichts darüber, ob die Mail den
richtigen Link, die richtige Sprache und den richtigen Satz trägt — und „keine zweite Mail" ist
überhaupt nur am Postfach zu sehen.
