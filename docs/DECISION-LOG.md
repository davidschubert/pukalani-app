# Decision Log

Laufendes Protokoll bewusster **Entscheidungen, Korrekturen und Ideen** — das,
was NICHT aus Code/Git-Historie hervorgeht (das „warum", verworfene Alternativen,
Kurskorrekturen). Neueste zuerst. Ergänzt die großen `docs/plans/*`-Dokumente um
die kleinen, verstreuten Beschlüsse.

---

## 2026-10-27 — Appwrite 2.6.2 sofort nachziehen: das Security-Release kam fünf Stunden nach dem Prod-Sprung

**Anlass:** Appwrite 2.6.2 (2026-10-24 13:41 UTC) ist ein reines Security-Release der 2.6-Linie —
`appwrite/base` 2.2.7 mit `brotli-libs` 1.2.1-r0 gegen CVE-2026-111497 (Out-of-bounds-Write im
Brotli-Decoder; Appwrites ausgehender HTTP-Client dekodiert `br`, Avatar-/Favicon-Endpunkte holen
nutzergelieferte URLs), dazu Härtung an API-Keys/JWTs, Realtime, GraphQL, Storage, VCS, Messaging.
Prod stand seit 08:59 UTC desselben Tages auf 2.6.1 — das Release hat uns um fünf Stunden verpasst.

**Entscheidung (Davids Auftrag „prüfen und installieren"):** 2.6.2 kommt auf dev, CI und prod, in
dieser Reihenfolge wie immer; kein Schema, also ein kleines Fenster (Container-Neustart, keine
Migration). Aus der Cloud-Sitzung sind nur CI, Skript und Runbook erreichbar (kein ssh, kein Netz zu
`api.pukalani.app`) — prod und dev laufen von Davids Terminal: `ops/appwrite-upgrade-2.6.2.sh`, Runbook
`APPWRITE-2-6-UPGRADE.md` Abschnitt „2.6.1 → 2.6.2".

**Was gegen den Code geprüft ist (2026-10-27):** Key-Anlage nur noch per Console-Session oder Key mit
gleichen Scopes — `create-site.mjs` und der CI-Setup nutzen die Console-Session, erlaubt. Admin-Mode nur
aus Console-Origins — wir setzen nie `X-Appwrite-Mode`. `_APP_JOBS_SECRET` darf nicht mehr leer/Platz-
halter sein — das Werkzeug ersetzt es, wir führen keine Functions. Betreiber-SMTP ist von der neuen
Privatadressen-Sperre ausdrücklich ausgenommen (dev-Mailpit bleibt). Neu `_APP_MEMORY_LIMIT` (512M je
Prozess) — im CI-Compose in den sieben PHP-Diensten nachgezogen; `registers.php` ist zu 2.6.1
byte-gleich, der KeepAlive-Patch (Zeile 367) bleibt Pflicht und wird trotzdem je Version aus dem Image
gezogen.

---

## 2026-10-23 — Appwrite 2.6.1 statt 2.2: das PHP-Notfall-Release zieht den Prod-Sprung vor

**Anlass:** PHP 8.5.12 (2026-10-21) schließt CVE-2026-109618 / CVE-2026-109619 (unauthentifizierte
RCE, CVSS 9.2). Die Ploi-Server waren am 2026-10-23 gepatcht, die Appwrite-Prod-Instanz lief
noch auf 2.0.0 mit PHP 8.5.9; der Sprung auf 2.2 (AW22) wartete seit 2026-09-14 auf ein Fenster.
Appwrite 2.6.1 (gleicher Tag) bringt PHP 8.5.12 und nennt sich selbst „precautionary" (Swoole,
kein FPM/CGI) — getroffen oder nicht, die ungepatchte Laufzeit bleibt kein Zustand.

**Entscheidung:** Ziel ist **2.6.1**, nicht 2.2 — ein Fenster, dieselben Vorarbeiten; dev + CI +
Runbook zuerst, prod erst nach Davids ausdrücklicher Freigabe (unverändert) — gegeben am 2026-10-24 („ja, jetzt"), prod seit 08:59 UTC auf 2.6.1, Fenster 71 s.

**Was nur ein echter Lauf zeigt (dev, 2026-10-23):**
- Die Client-IP-Auflösung ist seit 2.4 „rechtester nicht vertrauter Hop" statt „erstes Segment".
  Unsere Kette (Nuxt setzt XFF, Traefik hängt die Nuxt-IP an) ergibt damit auf prod für JEDE
  Session die Web-Server-IP — gemessen auf dev mit nachgestellter Kette. `_APP_TRUSTED_PROXIES`
  braucht `49.13.211.173`, dann stimmt sie wieder (ebenfalls gemessen).
- Das Werkzeug lädt seit 2.5 die Override MIT (Falle 2 aus 2.0 ist weg), löst relative Mount-
  Pfade aber im eigenen Container auf: `./patches/…` wird ein leeres Verzeichnis auf dem Host,
  der Worker stirbt an „mount … not a directory", das Werkzeug meldet „Failed to start
  containers". Absolute Host-Pfade in der Override, und der Lauf geht in 20 s sauber durch.
- `keepAlive: true` steht weiter in `registers.php` (Zeile 367) — der SMTP-Patch bleibt.
- Der Executor 1.1.2 trägt noch PHP 8.5.6 (kein neueres Tag); nur im internen Netz, keine
  Functions bei uns — notiert, nicht gelöst.
- MQTT-Broker neu mit zwei Traefik-Ports; Docker-Ports umgehen die ufw, deshalb an Loopback.

**Beweise:** dev `health/version` 2.6.1, PHP 8.5.12, alle Gesundheitspillen `pass`, Bestände
unverändert (85 Nutzer, 55 Tabellen), Mail über den gepatchten Worker, Realtime-Handshake 101,
`pnpm -r test` grün, Playwright `apps/comments` 16/16 funktional grün (themes-visual rot: Baselines von 2026-08-06, Vorbefund); CI-Compose erneut abgeleitet (Probe auf das
alte Compose reproduziert die committete Datei). Runbook: docs/runbooks/APPWRITE-2-6-UPGRADE.md.

---

## 2026-09-14 — Appwrite 2.2 statt 2.1: ein Fenster, und dev/CI gehen vor prod

**Anlass:** David: „Appwrite 2.1 ist erschienen. Bitte updaten." Beim Nachsehen stand
**2.2.0 schon draußen** (11.09. bzw. 15.09. UTC, drei Tage auseinander). Die SDKs bleiben
unberührt: `node-appwrite` 29.0.0 und `appwrite` 27.0.0 sind weiterhin die aktuellsten,
Response-Format `2.0.0` gilt weiter — also kein Katalog-Hub, anders als beim 2.0-Vorhaben.

**Davids Entscheidungen (zwei Fragen vor Baubeginn):**
(a) **Direkt auf 2.2.0.** Ein Fenster statt zwei, und 2.2 enthält den
MariaDB-Healthcheck-Fix, an dem Upgrades von 1.x scheitern konnten. Preis: die Version war
wenige Stunden alt — deshalb beweist dev sie, bevor prod sie sieht. Verworfen: nur 2.1 (vier
Tage Feldzeit, aber 2.2 bliebe als zweites Fenster offen) · 2.1 jetzt und 2.2 später
(zweimal Backup, zweimal Migration auf beiden Instanzen).
(b) **dev + CI + Doku zuerst, prod erst nach ausdrücklicher Freigabe** — das Prod-Fenster
ist eine eigene Verabredung mit Zeitpunkt, nicht ein Anhängsel dieses Durchgangs.

**Zwei Dinge, die nur ein echter Lauf zeigt** (beide am 2026-09-14 auf dev erwischt):
(1) **Es gibt nicht mehr einen Container je Warteschlange.** 2.2 fährt alle Queues in EINEM
`appwrite-worker`; `appwrite-worker-mails` existiert nicht mehr. Unsere Override mountet den
SMTP-KeepAlive-Patch genau dorthin — `docker compose up` bricht danach sofort ab („neither an
image nor a build context"), und der Stack bliebe in dem Zustand stehen, den das
Upgrade-Werkzeug hinterlässt: **ohne trustedIPs und ohne SMTP-Patch**. Betrifft auch die
CI-Dienstliste in `e2e.yml` und jede Anleitung, die einen Worker beim Namen nennt.
(2) **Self-hosted erlaubt seit 2.1 nur EINE Organisation.** `pnpm create-site` legte bisher
eine eigene `pukalani-sites`-Organisation an und bekommt jetzt **403** — nach dem Schreiben der
App-Dateien, also mitten im Lauf. Behoben: bei 403 wird die vorhandene Organisation des
Console-Accounts benutzt. Auf einer self-hosted Instanz ist das die richtige Semantik, es gibt
dort nie eine zweite.

**Wie der CI-Stack gehoben wird** (und warum das kein Nachpflegen ist): `ci/appwrite/
docker-compose.yml` wird aus dem Compose der Dev-Instanz ABGELEITET. Probe vor dem Hub: dieselbe
Ableitung auf das alte Dev-Compose angewandt muss die committete Datei exakt reproduzieren —
erst dann stimmen die vier CI-Abweichungen noch. Sie tat es; die Datei schrumpfte von 2168 auf
903 Zeilen.

**Beweise:** dev `health/version` 2.2.0, vier Gesundheitspillen `pass`, 85 Nutzer und
55 Tabellen unverändert, Migration in 1,5 s · gegen einen lokal gefahrenen CI-Stack auf 2.2:
Console-Setup, `bootstrap --seed`, verify-paid-ticket 13, pool-isolation 9 + 7,
audience-flip 49, presence-boundary 10, index-nudge 9, Gate G1 create-site, Playwright mit
`CI=1` 16 bestanden / 9 übersprungen, Realtime-Spec einzeln grün.
Ablauf und Prod-Restposten: docs/runbooks/APPWRITE-2-2-UPGRADE.md.

---

## 2026-09-10 — Mehrsprachige Betreiber-Seiten (F60): der Zuschnitt ist ein anderer als gedacht

**Anlass:** F60 sollte laut OPEN-ITEMS „je Sprache eine Fassung" nach dem Muster der
Kategorie-Übersetzungen bauen (Übersetzungs-JSON überschreibt eine Grundfassung). Die Analyse
vor Baubeginn zeigt: **der `pages`-Layer hat das seit `pages-001`** — und zwar in der stärkeren
Form. Eine Zeile je `slug` × `locale` (Unique-Index `uq_slug_locale`), `body` als MEDIUMTEXT,
Titel/Body/Veröffentlicht-Status je Fassung, EN/DE-Reiter im Editor, sprachgenaue öffentliche
Auflösung samt Microcache. **Folge: keine Ablage-Entscheidung, keine Migration.** Das
Kategorie-Muster wäre hier ein Rückschritt gewesen — ein JSON-Feld mit
200.000-Zeichen-Rechtstexten im MariaDB-Zeilenbudget.

**Was wirklich fehlte** — vier Lücken um dieses Modell herum, alle vier gebaut:
(1) der Sprach-Fallback war STUMM (eine nur auf DE gepflegte Seite kam unter dem EN-Pfad mit
`lang="en"` heraus, deutschem Titel in der EN-Navigation, und `useLocaleHead` bewarb weiter ein
`hreflang="en"`-Alternate, hinter dem kein englischer Text stand — bei Impressum und
Datenschutz der unangenehmste Fall), (2) kein KI-Vorschlag, (3) die Sprachliste im Editor
hartcodiert `['en','de']`, obwohl sie in der i18n-Config steht, (4) keine Sicht auf FEHLENDE
Fassungen (die Tabelle zeigte nur, was da war).

**Davids Entscheidungen (vier Fragen, gebündelt vor Baubeginn):**
(a) **Zuschnitt = Lücken schließen + KI-Vorschlag**, ohne Migration.
(b) **Fallback: zeigen und ehrlich beschriften.** Die vorhandene Fassung wird ausgeliefert —
Rechtstexte bleiben in jeder Sprache erreichbar —, der Artikel trägt das RICHTIGE
`lang`-Attribut, darüber steht eine schlichte Zeile „Diese Seite gibt es noch nicht auf
Englisch", und für die fehlende Sprache wird keine Alternate-Adresse mehr behauptet. Verworfen:
still bleiben wie bisher (der Leser rätselt, warum die Sprache springt) · 404 in der fehlenden
Sprache (sauberste Trennung, aber Impressum/Datenschutz wären weg, sobald der Owner nur eine
Sprache pflegt — rechtlich riskant).
(c) **KI-Vorschlag wie bei den Kategorien:** Knopf im Sprachreiter, die Route SPEICHERT NICHTS,
sie füllt das Formular; veröffentlicht wird von Hand. Zwei Produkt-Gates (`pages` UND `ai`),
Kill-Switch, Drossel, ZDR. Verworfen: eine Absatz-für-Absatz-Gegenüberstellung (viel UI für
200k-Bodies) · Verschieben auf einen eigenen Punkt.
(d) **Lange Texte: Deckel statt Halbergebnis.** Übersetzt werden Bodies bis 12.000 Zeichen (ein
normaler Rechtstext liegt darunter); darüber sagt der Knopf klar „zu lang für den Vorschlag".
Ein Klick = ein KI-Aufruf = ein Kontingent. Verworfen: abschnittsweises Übersetzen an
Überschriften (mehrere Aufrufe je Klick, eigene Drossel-Rechnung nötig) · nur den Titel
übersetzen (billig, aber der Nutzen ist zu klein).

**Nachtrag beim Rebase — eigener Core-Weg fallen gelassen:** für die Alternate-Adressen war ein
eigener Kern-Vertrag geschrieben (ein `usePageLocaleAlternates()` mit einer eigenen puren
Filter-Regel daneben; der State trug den Pfad mit, statt Zurücksetzen zu verlangen) — die Dateien
existieren nicht mehr, deshalb stehen ihre Pfade hier bewusst nicht. Eine Nachbarsitzung hatte am selben Tag für BI1 I3 denselben
Mechanismus gebaut (`useSeoHiddenLocales()` + `core/shared/seoAlternates.ts`). Nach der
CLAUDE.md-Regel („zwei Wege für dieselbe Sache kosten dauerhaft mehr als eine verlorene Stunde")
fällt der EIGENE Commit, nicht die fremde Lösung — sie kann zudem mehr (räumt auch
`og:locale:alternate` mit) und trifft bei `x-default` die bessere Entscheidung: es bleibt, weil
es keine Sprachzusage ist, sondern der Rückfall, den die Seite ohnehin zeigt.

---

## 2026-09-10 — Brand Insights (BI1) Kanalliste: Ogilvy und Harry Dry ersetzt statt gestrichen

**Anlass:** der Alters-Deckel aus der I4-Schärfung hat sichtbar gemacht, was vorher nur alt
aussah — im Prod-Lauf vom 2026-09-10 lieferten **Ogilvy** (letzter Upload 2024-12-02, 646 Tage)
und **Marketing Examples / Harry Dry** (2024-07-20, 781 Tage) **null Zeilen** bei je einer
Einheit Kosten pro Lauf. Beide waren zugleich der EINZIGE Kanal ihres Clusters
(`brand-psychology` bzw. `brand-language`).

**Entscheidungen (David, 2026-09-10):** (1) **Ogilvy → Nudgestock**
(UCBOzmOV9UHpTEYNr6NqOZ2g) — Ogilvys eigenes Behavioural-Science-Festival, also dieselbe Nische
und dasselbe Haus. Bewusst **dünn und stoßweise**: rund 3 Uploads je 180 Tage, davon zeitweise
Ankündigungen; die Vorträge kommen im Schwung nach dem Festival im Juni. Ein Kanal, der
halbjährlich etwas Gutes lädt, gehört in die Liste (dieselbe Begründung wie beim verworfenen
Kanal-Deckel oben). (2) **Marketing Examples / Harry Dry → StoryBrand With Donald Miller**
(UC_RirP9QR49zw2HOZ95dKrA) — Messaging, Elevator Pitch, Tonalität sind der Kern von
`brand-language`; täglich aktiv. Dazwischen Shorts und Workshop-Werbung, die der Alters-Deckel
nicht filtert, die Relevanz-Schlagwörter aber schon.

**Verworfen:** beide ersatzlos zu streichen (die saubere Variante — sie hätte zwei von sieben
Clustern ohne eigenen Kanal gelassen, `rebranding` ist bereits einer; David wollte die Cluster
besetzt) · **Ogilvy Consulting** (UCSOuQD9x_ia3zfuFguWU9Zw, letzter Upload 825 Tage) und
**Copyblogger** (UCK1xA5o_4Cliy4Q4ltTq8dw, 923 Tage) — beide ebenso tot wie die Kanäle, die sie
ersetzen sollten · **Marketing Week** (6637 Tage).

**Prüfweg ohne API-Schlüssel** (der Schlüssel liegt nur in der Prod-.env): Handle → `externalId`
aus dem Kanal-HTML, dann `https://www.youtube.com/feeds/videos.xml?channel_id=UC…` für Titel UND
jüngsten Upload. Damit ist die Lehre aus dem Pentagram-Befund maschinell prüfbar geworden — und
sie hat sofort gegriffen: **`@BusinessMadeSimple` löst auf einen Kanal namens „Cameron Belling"
auf**, war also derselbe Fehler ein zweites Mal und ist gar nicht erst in die Liste gekommen.

---

## 2026-09-10 — Brand Insights (BI1) I4 Themenradar: vier Beschlüsse aus dem Bau und dem ersten Prod-Lauf

**Entscheidungen:** (1) **Aufbewahrung = täglich neu + 30-Tage-Netz** (Plan §9.6 liess beides
zu, Policies III.E.4): der tägliche Lauf überschreibt je Video, das Netz löscht als GANZE Zeile,
was der Lauf nicht mehr erreicht hat — auch unsere Opportunity-Zahl, denn eine 30 Tage alte Zahl
zu einem Video, das wir nicht mehr beobachten, hilft der Redaktion nicht (Begründung im Kopf von
Migration insights-004). (2) **Der YouTube-Schlüssel liegt in der Server-.env, NICHT in
`instance_secrets`** — abweichend vom KI-Schlüssel-Muster (DB schlägt Env), und zwar aus einem
Grund, nicht aus Bequemlichkeit: `apps/branding` hat den `admin`-Layer bewusst nicht, also keinen
Reiter „Integrationen"; eine Ablage, die niemand über eine Oberfläche füllen kann, wäre nur ein
zweiter Ort für dasselbe Geheimnis. Der Env-Wächter mahnt die Zeile an (F44-Sorte Loch: ein
stiller Sweep). Kommt der `admin`-Layer je nach branding, zieht der Schlüssel um. (3) **Ja zur
Prod-Migration insights-004** (David, 2026-09-10, VOR dem Code-Deploy; Parität branding 39/39).
(4) **Alters-Deckel je Video: 180 Tage** ab Veröffentlichung, je App überschreibbar
(`pukalani.insights.radar.maxVideoAgeDays`, Deckel 365) — Schärfung nach dem ersten Prod-Lauf,
bei dem Ogilvy, „pentagramdesign" und Harry Dry Uploads von 2012–2024 mit Opportunity 17–50 in
die Morgenliste stellten: das 30-Tage-Netz rechnet mit dem ABRUF-Datum. 180 Tage sind zwei
Halbwertszeiten des Alters-Signals (das Signal steht dann bei 5 von 20 — der Radar sagt selbst,
dass so ein Video nicht mehr „läuft"). **Davids Gegenlesen offen** — die Zahl ist eine
Redaktions-Vorgabe, keine Rechtsfrage.

**Verworfen:** die alten Zeilen bis zum Ablauf des 30-Tage-Netzes stehen zu lassen (bis zu 30
Tage Altbestand in der Liste) · ein Index auf `publishedAt` per Migration (der Filter läuft auf
Appwrite 2.0 ohne, lesend gegen Prod geprüft; sortiert wird über den indizierten `fetchedAt`) ·
die Kanäle statt der Videos zu deckeln (ein Kanal, der halbjährlich etwas Gutes lädt, gehört in
die Liste).

**Nebenbefund, behoben:** `@PentagramDesign` (UCTXgprkT2GFY9eKZiz5Egew) ist ein Privatkonto
namens „pentagramdesign" mit einem Dublin-Video von 2012, `@pentagram` eine Metal-Band — die Id
war echt, die Identität nicht; Eintrag entfernt. Lehre für jede weitere Kanal-Aufnahme: TITEL
und JÜNGSTER UPLOAD müssen zur Erwartung passen, nicht nur die Id.

**Bei David:** Kanalliste durchsehen (Ogilvy, Harry Dry liefern nichts mehr — raus oder
ersetzen) · Gegenlesen der 180 Tage.

---

## 2026-09-09 — Products-Seite auf branding.supply (PS1): Konzept entschieden

**Anlass:** Vorhaben PS1 (Nebenbefund aus BI1, 2026-09-08) — Übersicht plus je
eine Marketing-Seite pro Produkt, der Nav-Punkt „Products" kehrt erst mit den
Seiten zurück. Konzeptrunde als [docs/archiv/PRODUCTS-SEITE.md](archiv/PRODUCTS-SEITE.md),
Bestand geprüft: von den sieben Klickdummy-Kindern existieren fünf (Brand-Check,
Foundation, Marktvergleich, Brand Design, Book & Kit in Konzeption), zwei nicht
(Experience, Monitoring); Insights ist Redaktion, kein Produkt.

**Entscheidungen (sechs Fragen, zwei Runden):** (a) **Fünf Produkte entlang des
Kundenwegs** (Brand-Check → Foundation → Marktvergleich → Brand Design → Book &
Kit — Foundation VOR Compare, weil der Marktvergleich sie voraussetzt) **plus
zwei abgeblendete „kommt"-Karten** für Experience und Monitoring, ohne Link, ohne
Seite, ohne Nav-Eintrag (gegen die Empfehlung „weglassen": die volle Suite bleibt
sichtbar). (b) **Deutsche Slugs je Sprache** — `/products/market-comparison` und
`/de/produkte/marktvergleich`; die englischen Eigennamen (Brand-Check, Brand
Foundation, Brand Design, Brand Book & Kit) bleiben in beiden Sprachen, übersetzt
werden nur „Produkte" und „Marktvergleich" (gegen die Empfehlung „nur englische
Slugs"). (c) **149 € netto je Branding erscheint JETZT** auf den Marketing-Seiten,
vor Z1 (gegen die Empfehlung „kein Betrag ohne Kauf-Knopf"): Zeile „einmalig, zzgl.
USt, Beta-Konten frei, Kauf folgt — bis dahin per Erstgespräch". Das hebt den Satz
„vor Z1 erscheint der Betrag nirgends im Produkt" (BS1 §9.2) für die MARKETING-
Seiten auf; die Werkstatt-Schranke bleibt bis Z1 bei „Preis im Erstgespräch".
(c2) **Book & Kit: „im Einmalpreis der Ableitung enthalten"** — ein Preis,
zweimal genannt, kein zweiter Betrag. (d) **Ein Screen je Produktseite** (Hero ·
Was ihr bekommt · So funktioniert es · Beleg · Preis-Zeile + CTA) **mit echtem
Beleg-Link** (Ranking, Kailua Coffee, /discover). (e) **Aufklapper mit Kindern**
(Icon + Titel + Beschreibung, Nuxt-UI-Muster), Übersicht reist als erster Eintrag
mit; die Nav-Registry bekommt dafür ein optionales `descriptionKey` (core).

**Verworfen:** Langform je Produkt (mehr Text, der bei BK1/Z1 nachgezogen werden
müsste); „nur die vier, die es gibt" (Supply-Ebene fehlte); ein gemeinsamer
Preisblock „Ableitung" auf der Übersicht.

---

## 2026-09-09 — Brand Insights (BI1): Ja zur Prod-Migration I1, Paket gebaut

**Entscheidung (David):** „Ja, fahren" — die drei I1-Migrationen (`insights_posts`,
`insights_brands`, `insights_corrections`) laufen auf der Prod-Instanz `branding`, VOR dem
Code-Deploy (Regel aus BS1 §2.3). Damit ist I1 aus docs/plans/BRAND-INSIGHTS.md §9.9 durch;
nächstes Paket ist **I2 (Dashboard + KI-Entwurf)**, es braucht kein Gate.

**Drei Zuschnitte beim Bau, die der Plan offen liess** (im Code begründet, hier nur als
Beschluss): (1) der Datentür-Backstop (`tablesDB`-Sperre in ESLint) nimmt `insights` NICHT
auf — die Tabellen tragen kein `communityId`, der Layer läuft im Silo `branding`, dieselbe
Lage wie `brand` und `market`; (2) `facts` wird MEDIUMTEXT, weil der freigegebene
I0-Vertrag Zeilen zulässt, die varchar 4000 sprengen; (3) `insights_corrections` bekommt
`retentionAt` als gespeichertes Datum statt einer Rechnung im Sweep — ein späterer Wechsel
der Frist verlängert nicht rückwirkend, was zugesagt wurde.

**Unverändert:** kein Markenprofil geht ohne die Anwaltsantworten BI1-3/BI1-4 live — I1 ist
Schema und Code, keine öffentliche Seite (die kommen mit I3).

---

## 2026-09-09 — Sucheintrag: die Owner-Beschreibung gilt auch im Silo

**Anlass:** Nebenbefund aus NAV1 (letzte offene Entscheidung der Zeile `13 · NAV1`): den
Sucheintrag unter `/dashboard/community/seo` gibt es auf jeder Site, aber von seinen zwei
Werten wirkte im Silo nur `noindex` — das sitzt in `useLocaleSeoHead()` und gilt der ganzen
Community. Die BESCHREIBUNG las genau EINE Datei, `apps/platform/app/pages/index.vue`. Auf
branding.supply und portfolio stand im Kopf der Startseite weiter der fest verdrahtete Text,
egal was der Owner eintrug — ein Feld, das man ausfüllen kann und das nichts bewirkt.

**Entscheidung (David):** ja — die Beschreibung aus dem Sucheintrag überschreibt auch auf
Silo-Sites mit eigener Startseite die Seiten-Beschreibung, genau wie heute schon im Pool.
Der bisherige Text bleibt der Rückfall (`home.seoDescription` auf branding,
`HOME_META.description` auf portfolio), ein leeres Feld ändert also nichts — dieselbe Zusage wie in
`resolveCommunitySeo` seit U15: keine Zeile heisst heutiges Verhalten. Gerechnet wird es
ab jetzt an EINER Stelle, `useCommunitySeoDescription()` in core; die drei Startseiten
reichen nur noch ihren Rückfall herein. `noindex` bleibt bewusst dort, wo es liegt.

**Verworfen:** Silo-Sites behalten ihren eigenen, im Code stehenden Text — dann wäre der
Sucheintrag dort eine Fläche ohne Wirkung, und wir müssten das Feld je Site ausblenden statt
es zu bedienen.
---

## 2026-09-09 — Brand Book & Kit (Produkt 03): Prototyp freigegeben, Pakete K0–K8 verbindlich

**Entscheidung (David, Fragenrunde):** „Prototyp freigegeben, K0 starten" — nach Vorlage der
neun Aufnahmen (docs/plans/BRAND-BOOK-KIT.md §3) ohne Korrekturen; die Alternative „Hafenkontor
statt Kailua im Nomenklatur-Kapitel" (Kailua hat laut Foundation keine Untermarken) wurde nicht
gewählt, die Hinweis-Zeile im Dummy bleibt. Damit ist der Paketschnitt §2.18 VERBINDLICH und der
Prototyp die Komponenten-Vorlage („nichts wird zweimal gebaut"); die Pakete starten selbstständig
nacheinander (Regel vom 2026-09-05), David wird nur an den Gates gebraucht: brand-025 vor dem
Prod-Lauf (K1), Blick auf `brand.md` (K3) und Leseansicht (K4), Inhalts-Gate Otto/Nika (K5),
Lieferseite (K6), Copy (K7), Abnahme (K8).

**Nachtrag (zweite Abnahme-Runde, Fable, gleicher Tag):** eine parallele Sitzung legte David
dieselben neun Routen noch einmal vor (Beweisbilder; ein Sichtbefund behoben: die Lizenzen-Tabelle
der Lieferseite lief bei 1440 px aus der Karte, Zellen brechen jetzt um). Davids Antworten deckten
sich mit der Freigabe oben; NEU entschieden wurde nur der **Dunkelmodus-Akzent**: Kailuas
`accent` (#2f4a3a) erreicht auf der dunklen Fläche 1,8:1. `buildBrandTokens` (K2) gibt
`color.dark.accent` einen eigenen Alias auf die erste Rampenstufe, die AA erreicht; das gemessene
Urteil bleibt als `$extensions`-Beleg an der Rolle stehen (Beleg, kein Token). Verworfen:
Markenfarbe wörtlich lassen und nur „unter AA" zeigen (verschiebt die Entscheidung in jede Marke);
neue Frage im Farbwelt-Kapitel (das Kit dürfte erst nach einer Antwort rechnen — widerspricht
„gerechnet, nie gespeichert"). Die doppelte Vorlage selbst ist die Lehre vom 2026-08-02 in neuer
Form: die Fetch-Prüfung vor dem Start lag VOR der Nachbar-Freigabe — vor jeder Fragerunde an David
noch einmal `main` lesen.

---

## 2026-09-09 — Brand Book & Kit (Produkt 03): Konzept freigegeben, Prototyp beauftragt

**Entscheidung (David):** „Konzept freigegeben, bau den Prototyp im Playground." Damit ist
docs/plans/BRAND-BOOK-KIT.md §2 verbindlich (inkl. der sechs Entscheidungen in §2.20). Phase 3
läuft wie bei BF1 und BD1: Klickdummy in `packages/brand/.playground` (acht Screens nach
§2.15, Kailua als Marke, echte Nuxt-UI-Komponenten, Werte aus `demoDesign.ts`/
`demoFoundation.ts` — kein Lorem), Davids Abnahme am lebenden Objekt, dann Pakete K0–K8.

---

## 2026-09-09 — Brand Book & Kit (Produkt 03): Konzeption geschrieben, sechs Konzept-Entscheidungen

**Anlass:** „Starte die Konzeption (Phase 2) für BK1" — §2 in docs/plans/BRAND-BOOK-KIT.md:
dritte Schicht mit drei Werkstatt-Kapiteln (`nomenclature` Otto, `aiguide` Nika, `presskit`
Ableitung + Fakten-Freigabe) und einer Lieferseite `/brand/:id/kit`; Book = dieselbe
Leseansicht mit fünf neuen Ankern (Nomenklatur, Zeichen-/Farb-/Typografie-Anwendung,
Pressekit; `ki-texte` wächst zu AI-Guidelines); Kit = sieben Dateien, alle bei jedem Abruf
gerechnet (DTCG-`tokens.json` kanonisch, `tokens.css` abgeleitet mit Deckungsgleichheits-Test,
`brand.md`/`brand.json` über die Reise-Regel, Zeichen-SVGs, `LICENSES.md`, README, Zip per
`fflate`); Freischaltung „Ableitung" als EIN Feld an `brand_profiles` (brand-025) mit drei
Schreibern (Beta-Regel, Betreiber, später Z1-Webhook) — der Marktvergleich liest dieselbe Regel.

**Entscheidungen (David, Fragenrunde §2.19 — fünf nach Empfehlung, eine mit Zuschnitt):**
(1) Hell/Dunkel in EINER `tokens.json` als Geschwister-Gruppen `color.light.*`/`color.dark.*`
(die DTCG-Norm kennt keine Modi; Figma/Style Dictionary bilden Gruppen auf Modi/Sets ab).
(2) Die Lieferseite ist eine EIGENE Seite (Supply, „lesen, laden, kopieren"), kein viertes
Werkstatt-Kapitel mit gespeicherter Fassung. (3) Presse-Kontakt wird gefragt, optional —
**Davids Zuschnitt: vorhandene Ansprechpartner-Daten als wählbare Vorlage anbieten** (Konto
des Besitzers, Erstgespräch-Anfrage), damit der Punkt ein Klick ist, wenn es dieselben Daten
sind. (4) Nomenklatur nur auf dem B2-Weg (Untermarken); Solo-Marken bekommen Schreibweisen in
den AI-Guidelines. (5) Betreiber: `/dashboard/brand-design` wird `/dashboard/brand-unlocks`
mit zwei Spalten (Brand Design, Ableitung), alte Route leitet weiter. (6) Kapitel-Namen wie
vorgeschlagen; Ids und Anker bleiben (`ki-texte`), die Anzeige wechselt nach Abnahme von
`aiguide` auf „AI-Guidelines". Nächster Schritt: Konzept-Freigabe + Prototyp (§2.15) auf
Davids Wort.

---

## 2026-09-09 — Brand Book & Kit (Produkt 03): Strategie freigegeben — ein Produkt, dritte Schicht, DTCG-Kit, BS1-Einmalpreis 149 € netto

**Anlass:** „Starte die Strategie-Runde für Produkt 03 Book & Kit" — Phase 1 des Workflows
(docs/plans/BRAND-BOOK-KIT.md §1: Bestandsaufnahme der sechs Startseiten-Artefakte am Code,
Zielbild „Lieferpaket aus Foundation + Design: Handbuch, Tokens, Brand Context, Assets — alles
gerechnet, nichts neu entschieden", Konkurrenz Frontify/Corebook°/standards.site/Bynder ·
Looka/Canva/Tailor Brands · DTCG 2025.10/Style Dictionary v5/Figma/Tailwind v4 · llms.txt/design.md,
Hypothesen H1–H10). Befund dabei: die Schranke steht schon (drei gesperrte Export-Einträge der
Leseansicht mit Etikett „Brand Book & Kit"), und „24 Kapitel" ist ein Versprechen ohne Zählung.

**Entscheidungen (David, Fragenrunde — sieben nach Empfehlung, eine dagegen):** (1) **EIN
Produkt „Book & Kit"**, keine Trennung in Book und Kit. (2) **Dritte Schicht derselben Werkstatt
in `packages/brand`** — wie bei Produkt 02 greift die Silo-Regel „neues Produkt ⇒ eigener Layer"
bewusst nicht: Book & Kit setzt Dokument, Zustandsmaschine und Reise-Regel (`sessionTravels`)
fort; ein eigener Layer bräuchte drei Verträge (Preset, Renderer, Reise-Regel) für null neue
Datenhoheit — erst „Connect" (MCP/API, Phase 3+) wäre eine eigene Datenwelt. (3) **Brand Context
als sechs Dateien:** `brand.md`, `brand.json`, `tokens.json` (W3C DTCG 2025.10 als KANONISCHE
Quelle), `tokens.css` (abgeleitet: Themes-Variablen + Tailwind-v4-`@theme`), Zeichen-SVGs,
`LICENSES.md` (Schriften benannt, keine Dateien); Figma über DTCG-Import, kein Plugin. (4) **Book &
Kit = der BS1-Einmalpreis „Ableitung"** (mit Marktvergleich im selben Preis, Beta-Konten frei,
Freischaltung über das Z1-Webhook-Feld + Betreiber-Schalter); Foundation-Leseansicht inkl.
Kapitel 11 bleibt frei; Brand Design ist KEINE Voraussetzung — Tokens und Zeichen zeigen ohne
Preset ehrlich „kommt mit Brand Design". (5) **Gliederung statt Zahl:** 12 Foundation-Kapitel +
Regel-Kapitel Zeichen-/Farb-/Typografie-Anwendung, Pressekit (Ableitung), Nomenklatur und
AI-Guidelines (KI); **Content-Kompass und 90-Tage-Plan gehen nach Produkt 04**, die
Startseiten-Copy bekommt Produkt-Etiketten und die echte Kapitelzahl. (6) **Zwei KI-Kapitel,
keine neue Stimme** — Otto (Nomenklatur), Nika (AI-Guidelines), George übergibt; „Rex" aus dem
Team-Text (Rest der Hunde-Welt) verschwindet, die Rolle heißt „Produktion". (7) **Extraktion des
Ist-Zustands** (Relaunch-Einstieg, H6 aus Produkt 02) wird ein **eigener Baustein NACH Book &
Kit**, nicht Teil von 03. (8) **Betrag: 149 € netto je Branding** — GEGEN die Empfehlung „offen
lassen bis Z1"; Leitplanke: Eingabe für den Z1-Preis-Katalog (`exclusive`), erscheint vor Z1
nirgends im Produkt, an der Schranke steht weiter kein Preis, die Beta bleibt frei. Damit ist
BS1 §9.2 Nr. 1+2 (Name „die Ableitung" = Marktvergleich + Book & Kit; Betrag) inhaltlich
beantwortet. Nächster Schritt: Konzeption (§2), erst auf Davids Startwort.

---

## 2026-09-09 — Brand Design: Abnahme durch Vertrauen, Vorhaben geschlossen

**Kontext:** Nach A1 lag David die Abnahme-Liste der Inhalts-Gates D1–D8 mit Fundstellen vor
(Frida-Steckbrief und Leitern, Weiche-Karten + „Bekannt"-Präfix, Rollen und
Kandidaten-Begründungen, Paar-Notizen, Richtungs-Sätze und Maße, Do & Don't und
Strichstärke, Tempo-Namen und Regel-Sätze, Kapitel 10, Board, Beispiel, Rückfragen).

**Entscheidung (David):** „ich vertraue dir erstmal hier" — die Inhalts-Gates gelten als
abgenommen, ohne Zeile-für-Zeile-Lesung. **Folge:** BD1 ist GESCHLOSSEN (COMPLETE-Eintrag,
Plan ins Archiv); Wortlaut-Korrekturen kommen ab jetzt als gewöhnliche Befunde aus dem
Gebrauch (Kailua-Läufe), nicht als Gate. Die zwei Nebenbefunde des Audits (`aiComplete`-Log,
413-Satz) stehen in OPEN-ITEMS unter „Bewusst zurückgestellt". Offen bleibt die Option
„vierte Strichstärke `light` 1,125 px" — kein Aufgabenpunkt, bis sie jemand vermisst.

---

## 2026-09-09 — Brand Design: Audit-Befunde (A1) — zwei Entscheidungen

**Kontext:** Audit der Design-Schicht nach D9 (docs/archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md):
keine hohen Befunde, drei mittlere, drei niedrige, vier Hinweise ⇒ Paket A1.
**Entscheidung 1 (Fable):** der fehlende IP-Eimer für `POST …/mark/brief` war beim Bau von D5a
übersehen, nicht Absicht — jede KI-ausgebende Route trägt einen Eimer, der VOR Auth und Datentür
greift (die fachlichen Tages-Deckel sind die zweite Schicht, nicht die erste).
**Entscheidung 2 (Fable):** die GDPR-Purges der Vorbilder und KI-Entwürfe werden ROT, wenn eine
Datei- oder Zeilen-Löschung mit etwas anderem als 404 scheitert (Muster `brandUserData.ts`). Grund:
`deleteUserCompletely` löscht das Konto nur bei Voll-Erfolg der Contributors — ein Contributor, der
transiente Fehler schluckt, macht aus der Löschzusage eine Behauptung; genau in den zwei Tabellen
mit Fremdwerken/Entwürfen im Bucket wäre das der teuerste Fall. Die Klick-Löschung bleibt fail-soft.

---

## 2026-09-09 — Wizard-Befunde aus dem Kailua-Lauf: Befunde bleiben Hinweise, George behauptet nichts, Handbuch-Kapitel „Stimme" wird geteilt

**Anlass:** Das Beispiel-Branding Kailua Coffee Co. wurde über den echten Wizard gebaut (Discover
D5). Der Lauf brachte fünf Bedien-Befunde (OPEN-ITEMS BW1, 8–12); drei davon waren
Produktfragen. David hat sie per Fragenrunde entschieden, zwei nach Empfehlung, eine dagegen.

**Entscheidungen (David):** (1) **Ein offener Befund blockiert weder Abnahme noch
Veröffentlichung** (Befund 11, nach Empfehlung): Befunde sind Hinweise, wer abnimmt entscheidet —
es wird KEIN Tor gebaut, weder an der Kapitel-Abnahme noch an Discover. (2) **George behauptet
nie, etwas eingetragen zu haben** (Befund 8, nach Empfehlung): ein Gesprächszug bleibt ganz
Nachricht (kein Marker, kein Feld-Schreiben — die Trennung aus `conversePrompt.ts` steht). Statt
dessen eine Prompt-Regel (`converse-11`): Nennt der Mensch eine Entscheidung, bestätigt George sie
in Worten und verweist auf „George, entwirf das"; die Bühne hebt den Knopf nach so einem Zug
hervor. Verworfen: Entwurf automatisch anstoßen (zweiter KI-Zug je Feld, braucht ein
„entschieden"-Signal) und ein Chat-Marker, der das Feld schreibt (zieht Fassung, inputHash und
Bereitschafts-Gate in die Chat-Route). (3) **Das Handbuch-Kapitel „Persönlichkeit & Stimme" wird
GETEILT** (Befund 12, GEGEN die Empfehlung „Zuordnung behalten, Vermerk nennt das wartende
Kapitel"): es hängt nur noch am Werkstatt-Kapitel Archetyp; der Wort-Leitfaden (`ep.vocabulary`)
wandert ins Messaging-Kapitel. Grund für Davids Wahl: ein Kapitel, das „abgenommen" heißt und im
Handbuch trotzdem offen steht, ist für den Kunden falsch, egal wie ehrlich die Regel dahinter ist.
Der Renderer ist geteilt (Leseansicht, Share, Discover-Anatomie) und rechnet zur Lesezeit —
alte Snapshots brauchen keine Migration. Dazu ohne Frage gebaut: Befund 9 (stiller No-op von
„Übernehmen & bestätigen" ohne Entwurf ⇒ deaktiviert + Hinweis) und Befund 10 („Alle abnehmen" in
der Finalen Abnahme).

**Nachtrag, dieselbe Runde — die Befunde 1–7 aus dem ERSTEN Kailua-Lauf (David: „Erste
Kailua-Befunde 1 bis 7", nach Empfehlung):** (4) **Anlage: das Modal legt an und springt in die
Werkstatt** (Befund 6, nach Empfehlung): das Modal auf der Brands-Übersicht erledigt Weiche, Titel
und Sprache und führt direkt ins erste Kapitel; die Vollseite `/dashboard/brands/new` bleibt nur
als Ziel direkter Links und fragt die drei Felder einmal. Verworfen: nur die Vollseite (ein Klick
mehr) und Vorbelegung aus dem Modal (zwei Wege bleiben). (5) **Chat-Sprache bleibt die Sprache der
Oberfläche** (Befund 7, nach Empfehlung — bestätigt die Werkstatt-Entscheidung vom 2026-09-02):
George spricht wie der Mensch, die Feldwerte stehen in der Inhaltssprache; kein Befund. Verworfen:
Chat folgt der Inhaltssprache, Wahl je Marke (dritte Sprachachse). Die Befunde 1–5 (Pillen,
Konflikt-Dialog gegen leere Serverfassung, optimistischer Zähler, Fakten-Karte, Kontext-Felder aus
dem Gespräch) sind Fehler ohne Produktfrage — außer bei 5 stellt sich heraus, dass ein getippter
Chat-Text heute keine Antwort auf die offene Katalog-Frage ist; dann wird gefragt.

**Zweiter Nachtrag — Befund 5 gemessen und entschieden (David, nach Empfehlung):** die vier
Kontext-Felder (Pitch, Kategorie, Wettbewerber, Zielgruppen-Skizze) sind Entwurfs-Slots ohne
Katalog-Frage; nach den echten Fragen des Kapitels lief jede Eingabe als freie Frage ohne Feld,
George trieb das Feld an, nichts wurde gespeichert. (6) **Weg B — sichtbares Antwort-Modul für die
Entwurfs-Session:** Georges Frage plus Eingabefeld, der Text geht als Hinweis in den Entwurf und
löst „George, entwirf das" direkt aus; kein neuer Schreibpfad, der Vertrag „ein Gesprächszug
schreibt kein Feld" bleibt. Verworfen: Weg A (Chat-Text als Antwort speichern — Klassifikation
oder Material-Speicher, ein roher Chat-Satz ist kein Pitch, 2–4 Tage) und „später". (7) **Der
Gesprächs-Prompt sieht die beantworteten Fragen des ganzen Kapitels** (Nebenbefund: der Verlauf ist
per Session geschnitten, der Generator liest kapitelweit — George konnte Fragen früherer Sessions
wiederholen): nur die Liste Frage + Kurzantwort reist mit, der Session-Schnitt des Chat-Verlaufs
(brand-011) bleibt. Verworfen: Session-Schnitt auch für die Wiederholungs-Regel.
(8) **Auto-Weiter bleibt; die Entwurfs-Felder kommen NACH den Fragen** (Nebenbefund aus dem
Weg-B-Lauf, nach Empfehlung): nach dem Eröffnungszug einer Entwurfs-Session springt §5 Auto-Weiter
zur ersten Katalog-Frage, das Antwort-Modul steht beim ersten Besuch nur kurz — gewollt: Georges
Interview läuft zuerst durch die echten Fragen, Pitch/Kategorie/Wettbewerber/Zielgruppen-Skizze
entstehen danach aus dem Material, und dort steht das Modul stabil. Verworfen: Auto-Weiter hält auf
Entwurfs-Sessions an; Registry-Reihenfolge des Kontext-Kapitels umbauen.
(9) **NACHGEZOGEN am selben Tag, Davids Klick-Test als Testnutzer — die Reihenfolge WIRD umgebaut,
in ALLEN Kapiteln:** „Die ersten vier Einträge sind keine Fragen, sondern Ableitungen? Dann sollten
wir die Reihenfolge logisch aufbauen — mich als Testuser verwirrt das." Entscheidung (gegen die
Empfehlung „nur Kontext"): in jedem Foundation-Kapitel stehen die Fragen zuerst, die Ableitungen
danach, mit einem Trenner „Daraus abgeleitet" in Leiste und Abnahme; Auto-Weiter bleibt wie in (8).
Hebt den zweiten „Verworfen"-Punkt aus (8) auf. Verworfen: nur Trenner ohne Umbau; nur Kontext.
Dazu zwei Befunde aus demselben Test, ohne Frage gefixt: George sprach einen Solo-Gründer mit „ihr"
an (die Team-Weiche erreichte nur die Beschriftungen — `converse-13`), und die Kapitel-Leiste hakte
bestätigte Sessions erst nach Reload ab (die PATCH-Antwort trägt keine Session-Zustände — der
Autosave lädt nach einer Bestätigung nach).
(10) **SESSION-ABSCHLUSS: GEORGE FÜHRT** (Davids Bild vom Ablauf einer Session, Klick-Test
2026-09-09, nach Empfehlung): Ist eine Antwort George zu dünn, fragt er nach und bietet ZWEI Knöpfe
(„Passt so, bestätigen" / „Ich ergänze noch etwas") — Bestätigen ist dabei ein BEDIENELEMENT, das die
Bestätigung auslöst, nie Chat-Text (converse-11 bleibt: George behauptet nichts). Ist die Antwort
bestätigt, würdigt er sie in einem ABSCHLUSSZUG und bietet einen Knopf „Weiter zu …" — kein
automatischer Sprung mehr mitten im Gespräch, keine nächste Katalogfrage als graue Zeile in der alten
Session. Davids Rückfrage „wohin führt der Knopf, wenn das Nächste schon beantwortet ist?": das ZIEL
kommt aus der REGEL (`resolveNextStop`: nächste offene Session, bestätigte/vertagte/gesperrte werden
übersprungen), nicht aus Georges Urteil — eine Navigation, die ein Modell entscheidet, wäre
nichtdeterministisch. George bekommt Ziel UND übersprungene Sessions in den Auftrag und spricht es
aus („Kundenstimmen hast du schon beantwortet, weiter mit Kritik & Beschwerden"). Die nächste Session
eröffnet George mit einem kurzen SPIEGEL des Bekannten (converse-12 kennt die Kapitel-Antworten; der
Eröffnungs-Auftrag verlangt künftig ein bis zwei Sätze Zusammenschau vor der Frage). Verworfen: wie
heute springen mit Abschlusssatz; erst den Reihenfolge-Umbau abwarten. Widerspruch, den der Test
zeigte: George bohrte nach („ich brauche noch etwas Konkretes"), während die Session rechts schon
den Haken trug — Rückfrage und Bestätigung wussten nichts voneinander. GEBAUT `b39eaeb0`
(`converse-14`, Marker `CONFIRM:` als Bedienelement, `closing`-Zug, `skippedSessionsBetween`,
`brandLogCardAction`). Zuschnitt dabei bewusst erweitert: auch der Sprung nach jeder ANTWORT
entfällt (er feuerte, sobald ein Wert im Feld stand, und hätte die Knöpfe unklickbar gemacht); nur
die Eröffnung einer Entwurfs-Session springt weiter (8). Neu gefunden: ohne `?s=` rechnete die
Bühne nach der Bestätigung still die nächste Session — `pinSession` hält sie in der Adresse.
(11) **SOLO-FASSUNG JE KATALOG-FRAGE** (zweiter Agenten-Testlauf 2026-09-10, nach Empfehlung): die
abgenommenen Fragetexte sagen „ihr/euch" („Was sagen deine glücklichsten Kunden über euch?", „Welche
Kritik bekommt ihr?") — bei „Nur ich" falsch. Für jede Frage mit ihr/euch kommt eine du-Variante in
den Katalog; die Weiche `{ solo, team }` gibt es für Labels schon (`brandSlotPromptLabel`,
`questionKeyFor`). Inhaltsarbeit über alle Kapitel, David liest die neuen Fassungen gegen (Gate).
Verworfen: Katalog bleibt „ihr" und George formuliert um; alles konsequent „du" ohne Team-Variante
(für Teams sprachlich falsch). (12) **DIE SOLO-WEICHE GILT AUCH FÜR MARKENTEXTE** (nach Empfehlung):
der Elevator-Pitch sprach „Wir drehen und brennen … in unserer Werkstatt" bei „Nur ich". Der
Entwurfs-Auftrag bekommt die Regel: solo ⇒ Ich-Form („Ich drehe … in meiner Werkstatt"), team ⇒
Wir-Form. Verworfen: Markentexte sprechen immer als „wir"; eigener Schalter je Marke. Beides als
eigene Läufe nach den Rest-Befunden des zweiten Testlaufs (Abschlusszug kennt den Feld-Zustand,
keine fremde Frage vor der Bestätigung, keine rohen Frage-Zitate, neutrale Labels/Modal, Zielliste
nur enthaltene Kapitel, rechnender Kapitel-Kopf).

---

## 2026-09-08 — branding.supply/Brand Insights: vier Entscheidungen (I0 freigegeben, Art. 27 verschoben, B2B, activeMind → eRecht24)

**Anlass:** Vier Punkte, die an drei Stellen offen lagen — die Freigabe des Insights-Prototyps
(Phase 4 des Workflows), zwei Zeilen aus BS1 §9.2 („offen — das muss David noch benennen") und
eine Lücke aus dem Faktenblatt (§7 Lücke 11). David hat sie am selben Tag gebündelt entschieden.

**Entscheidungen (David):** (1) **Prototyp I0 Brand Insights ist FREIGEGEBEN** („so bauen"). Die
Freigabe gilt der FORM, nicht dem Startschuss: der **Bau I1+ wartet weiter** auf **DB1**, die
**Anwaltsantwort** und den **Google-API-Schlüssel** — die drei Gates aus
[plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) §11.3. Ein freigegebener Prototyp, der auf
Zuarbeit wartet, ist kein Widerspruch, sondern der Normalfall dieses Workflows. (2) **Der
EU-Vertreter nach Art. 27 DSGVO ist verschoben** und wird ab jetzt als eigener Punkt **`A27`**
geführt ([OPEN-ITEMS.md](OPEN-ITEMS.md), „Geparkt / wartet"). Das **OB** beantwortet der Anwalt
(BS1 R3); die **Anbieterwahl** wird parallel vorbereitet — Vergleich und differenzierte
Empfehlungen entstehen in [referenz/ART-27-VERTRETER-ANBIETER.md](referenz/ART-27-VERTRETER-ANBIETER.md).
Im Text bleibt der Abschnitt ein benannter leerer Platz. (3) **Kundenkreis von branding.supply ist
B2B** — nur Unternehmen und Selbstständige, Verbraucher sind kein Kundenkreis. Vier Folgen, alle
in den Texten und im Code: **kein Verbraucher-Widerruf** (§ 356 Abs. 5 BGB entfällt inhaltlich) ·
**keine Verbraucherstreitbeilegung** (§ 36 VSBG entfällt inhaltlich; der Satz „wir nehmen nicht
teil" darf bleiben und ist der einfachere Weg) · **Preise netto zzgl. USt** (der eigene
branding-Katalog aus Z1 setzt `tax_behavior: 'exclusive'` — das `'inclusive'` der Community-Preise
bleibt unangetastet) · die **Unternehmereigenschaft wird bei der Registrierung per Häkchen
bestätigt** („Ich handle als Unternehmer/in oder Selbstständige/r") und **am Konto gespeichert wie
die AGB-Fassung** — Code-Paket **R1c**, läuft. **Was die Selbstauskunft rechtlich trägt, ist
Anwaltsfrage** (Faktenblatt §6 Block 2, Frage 14): bis zur Antwort ist sie die Zusage des Kunden,
nicht der Beweis des Anbieters. (4) **Rechtstext-Generator: jetzt activeMind (kostenlos), später
eRecht24 Premium** — der Wechsel kommt mit R3/Fassung 2 oder spätestens vor dem Öffnen der Beta.
Leitplanke: **activeMind verlangt eine Quellennennung mit Link im Text**; die Bedingung ist am
Generator selbst zu prüfen und einzuhalten, solange die Erstfassung steht — sie ist einer der
Gründe für den späteren Wechsel. Die drei Sonderabschnitte und der neue B2B-Absatz kommen
unverändert aus dem Faktenblatt und müssen in die activeMind-Gliederung passen. Die Maske bedient
**David — oder ich** mit den Faktenblatt-Antworten und **Platzhaltern** für den Anbieterblock
(Lücke 1 wird nicht geraten).

**Was damit geschlossen ist:** BS1 §9.2 Punkte 3 und 4 · Faktenblatt-Lücken 9 und 11 · die
Prototyp-Abnahme in BRAND-INSIGHTS §11.3. **Was neu offen ist:** `A27` (Wahl + Beauftragung,
wartet auf R3) und die Anwaltsfrage 14 zur Selbstauskunft.

## 2026-09-09 — Brand Design nach D9: drei Entscheidungen zur Abnahme

**Entscheidung 1 (David, Empfehlung angenommen) — Kontrast-Regel:** das Knopf-Paar der
Kontrast-Prüfung misst dieselbe adaptive Schriftfarbe, die die Vorschau-Szene setzt (Papier ODER
tiefste Rampenstufe auf dem Akzent, je nach höherem Kontrast — `brandAccentInk`). Ein heller Akzent
besteht damit mit dunkler Schrift, durch fällt der Mittelton. Grund: ein Urteil, das nicht zur
Vorschau passt, wäre eine Lüge im Kapitel. Marken-Knöpfe dürfen dunkle Schrift tragen.
**Entscheidung 2 (David) — Snapshot ohne rohe Design-Werte:** der Share-Snapshot trägt die Werte
der sechs Design-Kapitel nur noch als Preset (`design`), nicht mehr zusätzlich als rohe Slot-Werte
in `chapters`, sobald ein Preset dabei ist. Datensparsamkeit: der Link trägt nur, was er zeigt.
**Entscheidung 3 (David) — Kleinkram:** der Playground-Klickdummy bleibt der abgenommene
Phase-3-Stand (rechnet das Knopf-Paar weiter mit festem Papier); das Konzept §2.14 zieht den
Ereignisnamen nach — gebaut ist das generische `step.completed` mit `stepKey`, kein eigenes
`design.step.completed`.

---

## 2026-09-08 — Brand Insights (BI1): Prototyp-Runde 1 — fünf Entscheidungen; Products-Seite als eigenes Vorhaben

**Anlass:** Der Prototyp I0 steht seit dem 2026-09-08 im eigenen Playground (Port 3013, sechs
Bildschirme, Vertrag mit 48 Tests). Beim Bauen blieben fünf Fragen offen, die der Prototyp nicht
selbst beantworten konnte ([plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) §9.10). David hat
sie am selben Tag beantwortet — die Tabelle Frage · Entscheidung · Empfehlung war · Leitplanke
steht in **§11.2**. **Vier von fünf folgen der Empfehlung; eine weicht ab (2, Opportunity-Zahl).**
Die **Freigabe des Prototyps** (Phase 4 des Workflows) steht weiterhin aus — David klickt die
sechs Bildschirme selbst.

**Entscheidungen (David):** (1) **Beleg-Riegel nach `core`** — `evidenceIsGrounded` und der
Herabsetzungs-/Namensfilter (`createMarketDisparagementGuard`) ziehen aus `packages/market/shared`
nach `packages/core/shared`, **die Namen verlieren dabei das `market`-Präfix** (im Fundament-Layer
wäre es eine Lüge); `market` re-exportiert, damit keine Aufrufstelle bricht, `insights` importiert
später aus `core`. Der dritte Weg — abschreiben — war der teuerste: zwei Riegel driften, und
dieser hier hält Rechtsrisiko auf. Das ist ein **eigenes Paket I1a** (Plan §9.9), es läuft bereits
parallel und **darf vor der Prototyp-Abnahme laufen**, weil ein Fundament-Baustein auch dann
richtig ist, wenn Brand Insights nie gebaut würde. (2) **Opportunity-Zahl auf 100 normiert, mit
Fussnote** (die eine Abweichung, s. u.). (3) **Redaktion auf drei Adressen** — Liste, Editor,
Radar; die Untereinander-Ansicht war eine Prototyp-Hilfe, §9.4 bleibt wie geschrieben.
(4) **Ein Beitrag ohne redigierte Zielsprache bleibt in der Journal-Liste sichtbar**, mit dem
Hinweis „Nur auf English"; ausgeblendet wird er erst, wenn der Sprachfilter ausdrücklich gesetzt
ist. Begründung: ein vorhandener Beitrag, den die Liste verschweigt, ist für den Leser nicht von
einem fehlenden zu unterscheiden. (5) **Korrekturweg als Knopf am Seitenende — auf Profil, Duell
und Ranking**: überall dort, wo über eine fremde Marke etwas behauptet wird, steht der Weg zum
Widerspruch an derselben Stelle. Kein eigener Menüpunkt, kein Banner.

**Die eine Abweichung — (2) Opportunity-Zahl auf 100 statt „44 von 60".** Die Empfehlung wollte
die Zahl als „44 von 60 · 3 von 5 Signalen" zeigen, weil der Nenner dann selbst erzählt, dass
zwei der fünf Signale (Suchnachfrage, Konkurrenz) noch keine Datenquelle haben. David hat sich
für die normierte Zahl entschieden, weil sie sich besser liest. **Drei Leitplanken kaufen die
Ehrlichkeit zurück:** **(a)** die Fussnote nennt **immer**, aus wie vielen der fünf Signale
gerechnet wurde („aus 3 von 5 Signalen") — sie ist Pflicht, nicht Zierde; **(b)** die Normierung
ist eine **pure Funktion mit Test** (`insightsOpportunity`), kein Rechenweg in einer Vorlage;
**(c)** kommen Signale dazu, **ändert sich die Skala nicht**, nur die Fussnote. Damit bleibt eine
44 über Monate dieselbe 44, während „von 60" bei jedem neuen Signal eine neue Bedeutung bekommen
hätte. Nachbesserung am Prototyp läuft.

**Nebenbefund, entschieden: die Products-Seite wird ein eigenes Vorhaben.** Die Hauptnavigation
des Klickdummys trug einen Punkt „Products" mit sieben Produktnamen, der auf `/products` zeigte —
eine Seite, die es nicht gibt; seit dem 404-Audit vom 2026-09-03 ist der Punkt ausgeblendet
(Regel in `BwSiteNav.vue`: die Navigation zeigt nur echte Ziele). **Entscheidung:** ein **eigenes
kleines Vorhaben NACH Insights** — Übersicht plus je eine Marketing-Seite pro Produkt, die Namen
aus den Manifesten, je Produkt entweder ein Preis oder der Weg ins Erstgespräch; davor eine kurze
Konzeptrunde zu Texten und Reihenfolge. Der Nav-Punkt kehrt **erst mit den Seiten** zurück.
Geparkt als **PS1** in [OPEN-ITEMS.md](OPEN-ITEMS.md). **Verworfen:** die Seiten nebenbei in BI1
mitzunehmen (anderes Publikum, andere Texte, eigene Preis-Entscheidungen — das wäre ein zweites
Vorhaben im Bauch des ersten), und den Nav-Punkt vorab zurückzuholen und auf einen Anker zeigen
zu lassen (genau das hat das 404-Audit abgeräumt).

---

## 2026-09-08 — Brand Wizard: ein ABGELEHNTER Befund kommt nicht wieder (Kehrtwende zu BW2 Paket 6)

**Anlass:** Beim Kailua-Durchlauf (Discover D5) liess sich das Kapitel „Werte" nie abnehmen:
ein Konflikt-Befund (b.conviction ↔ c.discovery2) wurde zweimal mit Grund abgelehnt
(`POST …/findings/<id>` 200) und stand nach dem nächsten Kapitel-Blick wieder offen da — die
Dedup in `writeBrandFindings` prüfte nur gegen OFFENE Befunde („ein entschiedener Befund
blockiert keine neue Zeile", BW2 Paket 6). **Entscheidung:** Dedup gegen offene UND abgelehnte
Befunde (Schlüssel Art + Felder); nur ANGENOMMENE bleiben draussen, weil ihre Korrektur das
Feld ändert und ein neuer Konflikt danach ein echter Hinweis ist. Ein abgelehnter Befund ist
eine Entscheidung des Menschen, die der Prüfblick nicht durch Wiederholung überstimmen darf.
Preis: ändert sich ein beteiligtes Feld später wirklich, bleibt derselbe Konflikt-Typ über
dieselben Felder stumm — bewusst hingenommen; ein Werte-Hash je Befund wäre der nächste Schritt,
falls das je auffällt. Commit `53be8792`.

---

## 2026-09-08 — Session-Token-Hygiene: CLAUDE.md wird KERN + pfadgebundene `.claude/rules/`

**Anlass:** Eine Session stand bei 655k Tokens Kontext (Messages 547k, CLAUDE.md +
Memory-Index 53k je Runde, 445 MCP-Werkzeuge). CLAUDE.md war auf 88 KB ≈ 44k Tokens
gewachsen und liegt in JEDER Runde und in JEDEM Subagenten (außer Explore/Plan) im
Kontext — bei fünf Subagenten also 220k nur für die Konstitution.

**Entscheidung (David, Option A von drei):** CLAUDE.md bleibt die eine Quelle, wird aber
KERN (Projekt, Architektur, Config-Gates, Produkte, Coding Rules, Git, Doku-Ordnung —
24 KB) plus neun Domänen-Dateien unter `.claude/rules/<name>.md`, die WORTGLEICH aus
CLAUDE.md gezogen sind und per `paths:`-Frontmatter nur laden, wenn eine passende
Datei gelesen wird (appwrite, themes, hosts-ops, onboarding, ki-mail-embed-moderation,
tenant-isolation, editor, tests, ai-runner). Beweis: eine frische `claude -p`-Session
liest `packages/themes/package.json` und hat danach die Themes-Regel im Kontext, die
Isolations-Regel nicht.

**Verworfen:** (B) nur die drei größten Abschnitte auslagern — halber Effekt, gleiche
Konfliktkosten; (C) so lassen — der Kontext wäre weiter der größte Posten.

**Regeln daraus:** neue Domänen-Regel gehört in die passende rules-Datei, nicht in den
Kern; Kern-Zuwachs nur als Regel + ein Satz Warum + Verweis (Geschichte nach docs/).
Wer per Bash liest (cat/sed) oder nur berät, öffnet die rules-Datei bewusst per Read —
der Pfad-Trigger hängt am Read-Tool. Dazu (Memory `session-token-hygiene`): Session pro
Paket neu starten statt bei 500k+ weiterfahren, Erkundung an Explore statt an
allgemeine Subagenten, nie `TaskOutput` auf einen laufenden Agenten (Transkript-Dump),
Connectoren ohne Repo-Bezug in der Desktop-App abgeschaltet (Blender, Trello, Gmail,
Kalender, Drive, Obsidian, Figma, Linear + Marketing-/PM-/Productivity-/Design-Plugins).

---

## 2026-09-08 — Navigation anpassen: vier Entscheidungen (Wording · Site-Nav mit Unterpunkten · Dashboard-Nav je Person)

**Anlass:** Auf branding.supply war der Reiter „Navigation" unter /dashboard/community/navigation
leer, und der Menüpunkt hieß „Community-Einstellungen", obwohl die Site keine Community ist.
Befund: der Editor kennt nur `pukalani.chrome.nav` (dort registriert der brand-Layer nichts) und
veröffentlichte CMS-Seiten ohne Rechtsseiten (auf branding gibt es nur die drei Rechtsseiten) —
und selbst gefüllt hätte er nichts bewirkt, weil der EINZIGE Leser der gespeicherten Wahl das
blueprint-Layout ist, während `BwSiteNav.vue` eine feste Liste rendert. Unterpunkte kennt der
Vertrag `core/shared/communityNavigation.ts` nicht (flache Liste, ab dem sechsten Eintrag ein
„Mehr"-Menü). Die Reihenfolge der DASHBOARD-Navigation ist überall fest (Gruppen im Layout,
`order` in der Registry), ohne Laufzeit-Überschreibung.

**Entscheidungen (David, 2026-09-08):**

1. **Site-Navigation direkt MIT Unterpunkten** (Abweichung von der Empfehlung „erst flach,
   dann Unterpunkte"): ein Durchgang — Vertrag additiv um Kinder erweitern, Editor mit Ziehen in
   einen Hauptpunkt, gerendert in `BwSiteNav` (branding) UND im blueprint-Layout (Pool), damit
   Pool und Silo dasselbe Produktverhalten zeigen (PRODUKT-BILANZ). Der brand-Layer registriert
   seine Routen in `chrome.nav`, damit der Editor Kandidaten hat. Prototyp vor der Freigabe.
2. **Die Hülle heißt im Silo „Website-Einstellungen"** (nicht „Instanz-Einstellungen" — für einen
   Kunden ist „Instanz" Technik). Derselbe Schalter `admin.instanceTabs`, neues Label in de/en, der
   i18n-Schlüssel `instanceSettings` bleibt (Label ≠ Key). AN jetzt in comments, portfolio und
   branding; die vier Betreiber-Reiter kommen mit.
3. **Reihenfolge der Dashboard-Navigation ist die Wahl JEDER PERSON** (Prefs des Kontos, gilt auf
   jeder Site) — nicht je Community: die Nav ist rollen-gefiltert, eine Owner-Reihenfolge ginge
   für einen Moderator nicht auf. Beide Varianten („je Instanz", „beides") verworfen.
4. **Reihenfolge der Pakete:** Wording → Site-Nav → Dashboard-Nav, jedes mit Check-in.

**Nachtrag Prototyp-Runde (David, 2026-09-08):** Paket 2 zunächst „Korrekturen zuerst" —
das Standard-Menü von branding.supply soll **Products → Brand Score · Discover Brands · About ·
Team** sein — der Unterpunkt heißt seit demselben Abend **„Brand-Check"** (Davids Umbenennung,
Registry-Id `brand-check`, Schlüssel `brand.nav.brandCheck`). Folge: der Bauplan (Registry `pukalani.chrome.nav`) darf Gruppen VORGEBEN
(`parent`, `to: ''` = Aufklapper ohne Seite; Zusage 9 in `resolveCommunityNav`) — nicht bloß
eine gespeicherte Wahl je Instanz. Danach freigegeben und gemergt.

**Beantwortet damit auch Davids Frage „geht das für alle pukalani.app-Sites?":** ja — das
Dashboard-Layout gehört dem admin-Layer und ist in jeder App dasselbe; eine Überschreibung dort
gilt für Pool, Silo und Kontroll-Host gleichermaßen.

**Nachtrag Paket 3 (David, 2026-09-08 — Freigabe am Prototyp „wie gebaut"):** drei Zuschnitt-
Fragen, alle nach Empfehlung entschieden (Konzept: docs/archiv/DASHBOARD-NAV-JE-PERSON.md):
(E1) **Gruppen UND Einträge** sortierbar — ein Eintrag wechselt die Gruppe nie (Gruppen sind
Ebenen); (E2) **Ausblenden ja**, mit der ⌘K-Suche als Rückweg (sie liest die unpersonalisierte
Liste) und „Zurücksetzen"; (E3) Bedienung als **Konto-Reiter „Navigation"** unter
/dashboard/settings, nicht als Modus in der Seitenleiste (die ist einklappbar, auf Mobil ein
Slideover, mit Tooltips — drei Darstellungen für einen Bearbeitungsmodus). Gespeichert in
`prefs.dashboardNav` (`groups`/`items`/`hidden`), angewendet NACH den Ort-/Rollen-/Produkt-
Filtern; „Übersicht" und der Betreiber-Unterbau bleiben fest. Verworfen: „Ohne Ausblenden",
„nur Einträge", „Seitenleisten-Modus".

---

## 2026-09-08 — Brand Insights (BI1): Konzeptrunde — acht Entscheidungen

**Anlass:** Die Konzeptrunde vom 2026-09-08 hat aus den zehn offenen Fragen des Redaktions-
konzepts acht Entscheidungsfragen mit Empfehlung gemacht ([plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md)
§9 die Vorschläge, §10 die Fragen). David hat sie am selben Tag beantwortet — die Tabelle
Frage · Entscheidung · Empfehlung war · Leitplanke steht in **§11**. Damit ist Phase 2
(Konzeption) abgeschlossen: **Prototyp I0 kann starten, der Bau I1+ wartet auf DB1 und den
Anwalt.**

**Entscheidungen (David, sieben von acht nach Empfehlung):** (1) **Eigener Layer `insights`**,
`requires: ['brand']`, genau EIN Vertrag zum brand-Layer — der Präzedenzfall ist `market`, nicht
Brand Design (dort war „zwei Zustandsmaschinen für ein Dokument" die Begründung, und die liegt
hier nicht vor). (2) **Getrennte Datensätze, geteilte Vorlage:** `/insights`, `/insights/<slug>`,
`/brands/<slug>`, `/duels/<a>-vs-<b>`, `/rankings`, `/topics/<slug>`; `/journal/` entfällt.
(3) **Plausible einschalten** — selbst gehostet, cookielos, ohne Banner, wie pukalani.studio.
(4) **Eigener Redaktions-Endpunkt** für die Übersetzung, Ergebnis als bearbeitbarer Entwurf,
Drossel 10/Stunde + 50/Tag je Konto. (5) **Newsletter als eigene Liste `insights_subscribers`**
nach dem Warteliste-Muster (brand-015) — **erst nach dem Launch**. (6) **Themenradar JETZT**
(einzige Abweichung, s. u.). (7) **Rankings mit zehn Plätzen, eingefroren mit sichtbarem Stand**,
Auffrischung = neue Ausgabe mit neuem Slug, Entfernen-Wunsch hinterlässt eine als „auf Wunsch
entfernt" ausgewiesene Lücke statt einer stillen Neunummerierung. (8) **Launch-Paket
10 Profile · 3 Duelle · 5 Artikel · 1 Ranking** mit den Namen aus §9.8, die vier belegten Marken
zuerst.

**Die eine Abweichung — (6) Themenradar jetzt statt nach dem Launch.** Die Empfehlung wollte
warten, weil beim Konkretisieren zwei Dinge auffielen: die **YouTube API Services Developer
Policies untersagen in III.E.2 das Aggregieren von API-Daten** — also ausgerechnet die
Schutzmaßnahme „Kommentare nur aggregiert auswerten", mit der §4.1 (d) den Datenschutz auffangen
wollte —, und zwei der fünf Signale des Opportunity-Scores (Suchnachfrage, Konkurrenz) haben
noch keine Datenquelle. David hat anders entschieden, weil genau dieses Signal branding.supply
von einem gewöhnlichen Blog unterscheiden soll. **Vier Leitplanken, ausformuliert in §9.6:**

- **(a) Kein abgeleiteter Datensatz.** Gespeichert werden je Video nur die öffentlichen Zahlen,
  die die API liefert (Aufrufe, Likes, Kommentar-ZAHL, Datum, Kanal), **höchstens 30 Kalendertage**
  (Policies III.E.4) oder täglich neu geholt. **Unsere Opportunity-Zahl wird aus diesen Werten
  gerechnet und ist unsere Zahl** — sie fällt nicht unter das Aggregations-Verbot für API-Daten.
- **(b) Keine Kommentar-Texte, keine Nutzernamen**, bis Block 3 der BS1-Anwaltsfragen (BI1-2,
  in der geschärften Form) beantwortet ist. Der Radar rechnet bis dahin aus Metadaten. Die
  Kommentar-ZAHL bleibt erlaubt: sie ist eine öffentliche Kennzahl des Videos, keine Auswertung.
- **(c) Kuratierte Kanalliste statt `search.list`** (100 Einheiten je Aufruf und eigener
  Tages-Eimer) — `playlistItems.list` + `videos.list` kosten je 1 Einheit, das Tagesbudget von
  10.000 reicht damit für rund 50 Kanäle täglich.
- **(d) Der Radar blockiert den Launch nicht.** Paket **I4 rückt vor I3** oder läuft parallel;
  geht sein Gate nicht auf, geht I3 trotzdem live und die Themen kommen von Hand. Die alte
  Regel „I4 nie VOR I3" ist damit aufgehoben, die Umkehrung gilt weiter.

**Folge von (3), über BI1 hinaus:** die Zusage „Webanalyse findet nicht statt" wird falsch. Am
selben Tag nachgezogen: [plans/BRANDING-SUPPLY-FAKTENBLATT.md](plans/BRANDING-SUPPLY-FAKTENBLATT.md)
Zeile 13, §3 „Webanalyse/Statistik", der Cookie-Banner-Satz in §2 und eine neue Lücke „Plausible-Site
anlegen" · [plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md)
§1.1, §1.2 (Zeile 12), §2.2 Nr. 5, das Paket **R2** (der Datenschutz-Abschnitt
„Reichweitenmessung" kommt hinzu) und das **neue Paket R2c** (der Schalter). Der Schalter liegt
bewusst in BS1 und **nicht** in BI1: er misst die ganze Site, nicht nur die Redaktion, und Text
und Schalter dürfen nicht in zwei Plänen auseinanderlaufen — die Reihenfolge „erst Text, dann
Schalter" ist dieselbe wie bei `auth.termsUrl` in R1.

**Nebenbefund aus dem Abgleich mit dem Code (DB1).** [archiv/DISCOVER-BRANDS.md](archiv/DISCOVER-BRANDS.md)
§4.2 verspricht bei Umbenennung „neuer Slug + 301 vom alten" — gebaut ist das nicht:
`brand_publications` trägt `slug` (unique) und **keine Slug-Historie**, und es gibt keine
Weiterleitung. Heute folgenlos (eine Veröffentlichung, unveränderter Titel), für ein verlinktes
Markenprofil aber teuer. **BI1 baut `slugHistory` (≤ 5) für die eigenen Tabellen; DB1 sollte mit
derselben Form nachziehen** — notiert in Plan §9.2 und in OPEN-ITEMS unter `BI1` (nicht in der
DB1-Zeile, die eine andere Sitzung bearbeitet).

**Verworfen:** Tabellen im brand-Layer statt eigenem Layer (der brand-Layer trüge dann
Kunden-Werkstatt und öffentliche Redaktion in einem, und eine Produkt-Abschaltung träfe beide) ·
ein Layer ohne eigenen Produkt-Schalter · ein gemeinsamer Datensatz für eigene und fremde Marken
(zwei Rechtsgrundlagen und zwei Löschregeln in einer Zeile) · gar keine Profil-Adresse ·
ein eigener serverseitiger Zähler statt Plausible (ein Schreibvorgang je Aufruf, Bots
eingeschlossen — eine Zahl mit Bots ist als „Reichweite" irreführender als gar keine) ·
weiterhin nicht messen · der UGC-Übersetzungsweg für Redaktionstexte (ein Cache, den jemand von
Hand nachbessert, ist keiner mehr) · Resend Broadcasts und ein selbst gehostetes listmonk ·
lebende oder an Ort und Stelle überschriebene Rankings · den Themenradar ganz zu streichen.

**Bei David:** Google-Cloud-Projekt mit YouTube-Data-API-Schlüssel (Gate von I4) · neue
Plausible-Site für `branding.supply` (die CE-Ausgabe hat keine Sites-API) · Anwaltstermin
(ohne die Antworten zu BI1-3 und BI1-4 geht kein Markenprofil live) · DB1-Rest D4/D5 ·
Abnahme des Prototyps I0.

---

## 2026-09-08 — Brand Design: Bild-Modell für die KI-Entwürfe = google/gemini-2.5-flash-image-preview; brand-023 freigegeben

**Entscheidung (David, Empfehlung angenommen):** Stufe 3 des Zeichen-Kapitels (D5c, KI-Bildlogos
als Entwürfe) nutzt bei OpenRouter `google/gemini-2.5-flash-image-preview` unter dem festen
ZDR-Filter des Core-Transports (Kosten grob 3–5 ct je Bild; 4 Entwürfe × 3 Läufe je Marke und
Tag ≈ 0,40–0,60 €). Vor dem Bau wird geprüft, ob das Modell unter `data_collection: deny`
geroutet wird — sonst antwortet die Stufe ruhig 503 und das Kapitel läuft ohne sie. Die
Prod-Migration **brand-023** (Tabelle `brand_mark_drafts`, Bucket `brand-drafts`) darf nach der
Prüfung von D5c gefahren werden, vor dem Push (wie brand-022/024).
**Nachtrag (Fable, echter Lauf am selben Tag):** der Preview-Slug hat bei OpenRouter keine
Endpunkte mehr („No endpoints found"); gesetzt ist das freigegebene Nachfolgemodell derselben
Familie `google/gemini-2.5-flash-image` — unter der ZDR-Klemme geroutet, vier Bilder, ~0,03 ct je
Bild. brand-023 ist auf `branding` gefahren.

---

## 2026-09-08 — Brand Design: Vision-Modell für die Vorbilder-Lesung = google/gemini-2.5-flash

**Entscheidung (David, Empfehlung angenommen):** `pukalani.ai.visionModel` auf branding.supply
= `google/gemini-2.5-flash` — liest Screenshots gut genug für eine Belegung aus 50 kontrollierten
Vokabular-Ids, unter dem festen ZDR-Filter des Core-Transports verfügbar, grob 20 000 Tokens je
Lauf (Cent-Bereich; 3 Läufe je Marke und Tag). Alternative bei Qualitätsproblemen:
`anthropic/claude-sonnet-4.5` (~10× teurer). Gesetzt als Build-Default in
`apps/branding/app/app.config.ts` (einziger Konsument); der Laufzeit-Override braucht eine
`app_config.aiVisionModel`-Spalte (system-Migration), die es noch nicht gibt — bewusst
vertagt, bis die Admin-Config-Seite ihn bedient.

---

## 2026-09-08 — Brand-Check achtet robots.txt und TDM-Vorbehalt; Wizard-Weg bewusst ausgenommen (BS1 R2b)

**Entscheidung (David):** Der öffentliche Brand-Check holt vor jedem Abruf die
`robots.txt` und prüft den maschinenlesbaren Nutzungsvorbehalt (§ 44b UrhG) —
mit denselben Regeln, die der Marktvergleich seit MV1 M2 fährt. Damit ist der
Befund aus R2a erledigt: die alte Begründung („der Betreiber trägt seine eigene
Startseite ein") trug bei einer FREMDEN Adresse nicht, und ein Ausweg „auf
Zuruf" ist für einen Vorgang, den jeder ohne Konto auslösen kann, zu wenig.

**Was daraus folgt.** Die Regeln sind aus `packages/market/shared/` nach
`packages/brand/shared/{brandRobots,brandTdm}.ts` GEZOGEN (nicht kopiert —
`brand` darf `market` nicht kennen, A14; `market` re-exportiert sie unter den
alten Namen). Der Check bekommt einen EIGENEN Absender `PukalaniBrandCheck/1.0
(+https://branding.supply/brand-check/methodik)` neben Wizard und MarketBot:
ein Betreiber soll den Vorgang benennen können, den er verbieten will. Ein
Verbot ergibt 409 `site_blocked` — kein Score und KEINE Zeile in `brand_checks`
(die Tabelle kennt keinen Zustand „abgewiesen"; eine leere Zeile wäre eine
Messung, die nie stattfand), nur ein Log-Ereignis `brand.check_blocked` mit dem
Grund.

**Bewusst NICHT mitgeändert:** der Wizard-Weg
(`POST /api/brand/profiles/:id/analyze`). Dort trägt ein eingeloggter Betreiber
die Adresse SEINER EIGENEN Website ein — `robots.txt` regelt, was Crawler bei
einem fremden Auftritt dürfen, nicht was ein Werkzeug darf, das sein Besitzer
auf sein eigenes Haus richtet. Der Unterschied steht als Kommentar an beiden
Routen, damit ihn niemand für eine Nachlässigkeit hält.

---

## 2026-09-08 — Brand Design: Prototyp FREIGEGEBEN (Phase 4), Pakete D0–D9 verbindlich; Vision/Bild über OpenRouter mit ZDR-Filter

**Entscheidung 1 (David):** Der Playground-Prototyp ist als Bauvorlage freigegeben. Die
Pakete in docs/archiv/BRAND-DESIGN.md §2.18 sind damit verbindlich, Start mit **D0
„Verträge"** (Registry-Steps + Sessions, Vokabulare, Font-Paar-Katalog, `BrandDesignPreset`,
`buildBrandDesign`, Ramp-Import als A14-Vertrag, Journey mit Freischaltung — Struktur, noch
keine Inhalte, keine Migration). Empfehlung angenommen.
**Entscheidung 2 (David):** Vision (D2 Vorbilder-Lesung) und Bild-Erzeugung (D5c KI-Entwürfe)
laufen über **OpenRouter** — derselbe Transport wie die Text-KI, Modell per Config
(`pukalani.ai.visionModel` / `pukalani.ai.imageModel`, Core-Default aus), **nur Anbieter mit
Zero-Data-Retention-Zusage** (OpenRouter-Provider-Filter; die Modellwahl ist damit auf
ZDR-Provider beschränkt, kein Fallback auf Nicht-ZDR). Kein neuer Vertrag, eine Rechnung.
Beantwortet §2.19 Frage 1. Empfehlung angenommen.

---

## 2026-09-08 — Brand Design: Prototyp-Nachtrag und Hell/Dunkel-Vergleich abgenommen

**Abgenommen (David):** der Prototyp-Nachtrag im Playground (Weiche Foundation/Vorbilder,
Vorbilder-Upload je Bereich, KI-Lesung fits/tension/off gegen die Foundation, Herkunft je
DNA-Zeile, Ergebnis-Board als Kopf von Kapitel 10 und eigene Ansicht) und der Hell/Dunkel-
Vergleich in der Farbwelt (zwei feste Szenen nebeneinander mit Kontrast-Urteil je Welt).
Damit sind alle bisher angesprochenen Prototyp-Korrekturen (Abstände, 72-rem-Bühne, Raster,
Farb-Picker, gestapelte Mix-&-Match-Chips) und beide Nachträge abgenommen. Offen ist die
FREIGABE des Gesamt-Prototyps als Bauvorlage (Phase 4 nach WORKFLOW.md) — danach werden die
Pakete D0–D9 in docs/archiv/BRAND-DESIGN.md §2.18 verbindlich, beginnend mit D0 (Verträge).

---

## 2026-09-08 — Brand Design: Richtung aus Foundation UND Vorbildern; Brand Design als eigenständiges Produkt

**Anlass (David, an der Prototyp-Seite „Moodboard"):** Ist die Reihenfolge richtig, oder
gehört das Moodboard ans Ende? Zwei Wege denkbar — Vorbilder hochladen und daraus die
Kapitel ableiten, oder alle Kapitel selbst durchgehen und am Ende ein Moodboard bekommen.
**Entscheidung (David):** „Niemand fängt mit der Palette an — vor Farbe und Schrift steht
immer eine Richtung, aus der Strategie UND aus Vorbildern." Kapitel 1 nimmt deshalb beide
Quellen: die Brand Foundation und **Vorbilder je Bereich** (Screenshots für Farbwelt,
Typografie, Zeichen, Bildsprache). Die KI LIEST die Vorbilder gegen die Foundation und
sagt, was daran schon trägt und was besser geht (fits/tension/off mit Begründung an der
Foundation-Stelle); daraus entsteht der DNA-Vorschlag, danach Farbwelt → Typografie →
Zeichen → Bildsprache → Bewegung wie geplant. Der Weg ohne Vorbilder überspringt nur den
Upload; das „Moodboard am Ende" ist in beiden Wegen dasselbe Ergebnis-Board. Leitplanken:
lesen, nie nachbauen; Bilder sind Eingabe, nie Ausgabe (kein Snapshot/Share); Foundation ist
der Maßstab; Vision-Transport mit ZDR wie die Bild-KI. **Produkt:** Brand Design wird als
eigenständiges Produkt neben der Foundation verkauft — die Foundation bleibt Voraussetzung,
Fassung 1 Studio-begleitet, Selbstbedienung später. Konzept: docs/archiv/BRAND-DESIGN.md §2.2,
§2.8, §1.8-Nachtrag; Paket D2 erweitert.

---

## 2026-09-07 — branding.supply Recht + Bezahlweg (BS1): acht Entscheidungen

**Anlass:** Die Site ist seit 2026-09-01 öffentlich, nimmt Konten auf, verschickt Mails und
veröffentlicht Bewertungen fremder Marken — und hatte weder Impressum noch Datenschutz noch
AGB (der Fuß zeigte drei Wörter ohne Link); zugleich gab es keinen Weg, Geld zu nehmen, und
der CTA an der Schranke lief auf einen 404. Strategie + Konzept stehen als
[plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md);
die Fragenrunde (acht Fragen) ist dort §8, die Antworten §9 (Tabelle Frage · Entscheidung ·
Empfehlung war · Leitplanke), der verbindliche Paketschnitt §7.

**Entscheidungen (David, Fragenrunde):** (1) Rechtstexte im **`pages`-Layer wie auf
pukalani.studio** — jede Anwaltskorrektur ist eine Texteingabe statt eines Deploys.
(2) **Generator-Entwurf plus Anwaltsprüfung**, David bedient den Generator selbst.
(3) Die fünf ungeklärten A1-Punkte (Art. 27 · Drittland · § 5 DDG/§ 18 MStV · § 36 VSBG ·
Umsatzsteuer) werden **im selben Termin als eigener Block** mitgefragt. (4) Bezahlmodell
Phase 1 = **Einmalpreis je Branding über Stripe Checkout**. (5) **Eigene schlanke
Erstgespräch-Seite im `brand`-Layer**, bis dahin Weiterleitung auf die Studio-Seite.
(6) **Beta-Konten dauerhaft frei.** (7) **AGB-Checkbox sofort**, mit Entwurf und sichtbarem
Hinweis. (8) Reihenfolge: **Recht zuerst, Stripe direkt danach.**

**Abweichungen von der Empfehlung — vier, jede mit Leitplanke:**

- **(2) Generator + Prüfung statt „der Anwalt schreibt".** Leitplanke: der Generator-Text ist
  ein ENTWURF. Die drei Dinge, die kein Generator kennt, werden aus dem Faktenblatt des Plans
  (§1.2) als eigene Abschnitte geschrieben — KI-Verarbeitung von Kundentexten über
  OpenRouter/ZDR · Abruf fremder Websites inkl. Bot-Seite und TDM-Vorbehalt · öffentliche
  Bewertung fremder Marken mit Korrekturweg — und dem Anwalt ausdrücklich als **Prüfpunkte
  markiert**. Bis zur Prüfung tragen alle Seiten „Entwurf, in anwaltlicher Prüfung" +
  `noindex`.
- **(4) Stripe Checkout statt Erstgespräch + Rechnung von Hand.** Leitplanken: braucht **A2
  live** (Bank, Steuer, Live-Key, Portal — bei David) · **eigener Preis-Katalog für
  branding.supply**, nicht die Community-Preise · AGB mit **Widerrufsbelehrung für digitale
  Inhalte** (§ 356 Abs. 5 BGB, Verzicht beim Start der Ausführung) · Rechnung/USt über Stripe
  mit `automatic_tax` wie bei den Communities · die Freischaltung ist ein **FELD an
  `brand_profiles`** (Migration), das der Webhook schreibt — der Betreiber-Schalter im
  Dashboard bleibt ZUSÄTZLICH für Handfälle. Erstgespräch + Angebot bleibt daneben der Weg
  für Studio-Leistungen; **G4 gilt für Brand Design unverändert**. Damit ist die eigene
  Tabelle `brand_entitlements` aus §4.1 (b) des Plans verworfen.
- **(6) Beta-Konten dauerhaft frei statt Bestandsschutz mit Acht-Wochen-Frist.** Leitplanken:
  gilt je **KONTO** (`brand_access` / Beta-Zulassung), nicht als unbegrenzte Zahl von
  Brandings · die bestehenden Eimer (3 Läufe/Tag je Branding, Instanz-Deckel) bleiben die
  Kostenbremse · in den AGB als „Beta-Konten" benannt · der Betreiber kann die Zusage je
  Konto widerrufen (Missbrauch).
- **(7) Häkchen sofort statt erst mit den fertigen Texten.** Leitplanken: Hinweis „Entwurf, in
  anwaltlicher Prüfung" auf der AGB-Seite UND im Registrierformular neben dem Häkchen ·
  `noindex` · die **Fassungsnummer wird beim Konto gespeichert**. Letzteres ist Bauarbeit,
  kein Schalter: der Core speichert die Zustimmung heute NICHT — `pukalani.auth.termsUrl`
  schaltet nur Häkchen und Link frei, das Feld `terms` ist ausdrücklich ein „reiner
  UI-Belang" (`packages/core/schemas/auth.ts:53`) und erreicht weder Route noch Konto.

**Paketschnitt, damit verbindlich (Plan §7):** **R0** Sofort (CTA-404 weg, Weiterleitung mit
`?source=branding-supply`, Fuß-Wörter ohne Ziel ausgeblendet) · **R1** Technik (`pages`
montieren, Migrationen auf `branding`, Seed als Entwurf, Fuß-Links, `termsUrl`,
AGB-Fassung am Konto) · **R2** Inhalt (Generator-Texte + die drei Abschnitte + Faktenblatt,
de/en) · **R3** Anwalt (ein Termin, drei Blöcke; danach Fassung 2, Hinweis und `noindex` weg) ·
**Z0** Erstgespräch-Seite · **Z1** Stripe (Gate: A2 live UND R3) · **Z2** Beta-Regel im Code
und in den AGB. Die Namen weichen von der alten Skizze ab — das frühere `Z1` ist auf `Z0`
und `Z1` verteilt.

**Verworfen:** geteilte Rechtstexte über beide Sites (die Verarbeitungen unterscheiden sich
grundlegend — ein gemeinsamer Text wäre auf beiden Seiten teilweise falsch) · Studio-Antworten
1:1 übernehmen · Abo je Konto und Credits je Lauf als Bezahlmodell · den Portfolio-Wizard in
einen Layer heben und auf beiden Sites betreiben · Beta-Bestandsschutz mit Frist ·
„weiter ohne Häkchen" · Consent-Banner (es läuft kein Tracking).

**Offen und ausdrücklich nicht heute entschieden:** **Name und Betrag des Kaufgegenstands**
(Vorschlag: EIN Preis je Branding für „die Ableitung" = Marktvergleich + später Book & Kit) ·
welcher Generator die Grundfassung liefert · ob ein Art.-27-Vertreter jetzt beauftragt wird
oder auf die Anwaltsantwort gewartet wird (grob 200–400 €/Jahr) — Plan §9.2.

---

## 2026-09-07 — Brand Insights (BI1): Redaktionskonzept — zwölf Entscheidungen

**Anlass:** BI1 war seit dem Eintrag von heute früh („Discover Brands und Brand Insights als
eigene Vorhaben notiert") an ein Redaktionskonzept gebunden — wer schreibt, wie oft, woher die
Quellen kommen und was mit Bewertungen fremder Marken rechtlich zulässig ist. Fragenrunde mit
zwölf Fragen; das Ergebnis steht als Plan in [plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md)
(§1 die Tabelle Frage · Entscheidung · Empfehlung war · Leitplanke).

**Entscheidungen (David, Fragenrunde):** (1) **alle vier Formate zum Start** — Markenprofile,
Brand-Duelle, Artikel, Rankings. (2) **KI entwirft, David redigiert und veröffentlicht** —
nichts geht ohne sein Zeichen live (wie die Marktvergleichs-Bibliothek). (3) **Grundfassung je
Beitrag frei wählbar (de ODER en)**, am Ende ein Knopf zur Übersetzung in die jeweils andere
Sprache. (4) **Wir-Stimme ohne Namen** als Autor. (5) **Launch-Paket ≈ 10 Profile · 3 Duelle ·
5 Artikel · 1 Ranking**, danach zwei Stücke je Woche. (6) **Quellen:** eigene Websites der
Marken, eigene Daten (Brand-Check, Bibliothek, Marktvergleich), **YouTube-Data-API als
Themenradar von Anfang an**, Presse und Wikipedia. (7) **Bewertung fremder Marken nur über den
BESTEHENDEN Brand-Check-Score** mit offengelegter Methodik, Text als Einordnung im
Kritik-/Meinungs-Stil — keine zweite Skala (deckt sich mit Marktvergleich §7.3). (8) **Eigene
Tabellen im brand-Layer, Redaktion im Dashboard** (UEditor, Sprachfassungen, Übersetzung per
Knopf nach dem UGC-Muster, Freigabe als Zustand). (9) **Ziel und Messung: alle drei gleich
gewichtet** — Umwandlung, Reichweite/Suchmaschinen, Newsletter. (10) **Bilder: nur eigene
Grafiken und Farbwelt-Kacheln** — keine fremden Logos, keine Screenshots. (11) **Reaktionen der
Marken:** Korrekturweg wie im Brand-Check plus öffentliche Methodik-Seite; Entfernen auf Wunsch
als Notausgang. (12) **Reihenfolge: erst Discover Brands (DB1), dann Insights.**

**Abweichungen von der Empfehlung — fünf, jede mit Leitplanke:**

- **(1) Alle vier Formate statt Profile + Duelle zuerst.** Leitplanke: das Launch-Paket ist die
  Mengen-Bremse, und kein Format geht live, bevor es EINEN vollständig redigierten
  Beispiel-Beitrag hat.
- **(3) Grundsprache frei statt fest Deutsch.** Ohne Leitplanke, aber mit einer Folge fürs
  Datenmodell: die Grundsprache wird je Beitrag GESPEICHERT (anders als beim UGC-Muster, das
  bewusst keine Ausgangssprache kennt) — sonst weiss niemand, welche Fassung die redigierte ist.
- **(4) Wir-Stimme ohne Namen statt David namentlich.** Leitplanke: keine erfundenen Autoren,
  und das Beraterteam des Wizards ist NIE Autor; die Autorenprofil-Verknüpfung zu Davids Site
  aus dem Phase-1-Plan entfällt, verantwortlich zeichnet ein Redaktions-Impressum (neue
  Anwaltsfrage zu § 18 Abs. 2 MStV).
- **(6) YouTube von Anfang an, dazu Presse und Wikipedia** statt „YouTube später, keine
  Fremdmedien". Leitplanken: Fremdquellen immer mit Quelle + Datum und als „Fremdquelle"
  gekennzeichnet (die Bibliotheksregel „nur die eigene Website" gilt für Marktprofil und
  Bibliothek weiter, Insights darf darüber hinaus zitieren) · Zitatschranke ≤ 200 Zeichen mit
  Belegpflicht (§ 51 UrhG) · Wikipedia nur mit CC-BY-SA-Namensnennung, keine Volltextübernahme ·
  YouTube nur Metadaten/Kommentare über die offizielle Data API, kein Transkript-Scraping,
  Quellvideo eingebettet, Kommentare nur aggregiert und nie mit Nutzernamen gespeichert —
  als Teilprojekt „Themenradar" mit eigenem Gate (API-Schlüssel + Kontingent).
- **(9) Alle drei Ziele gleich gewichtet statt Umwandlung zuerst.** Leitplanke: je Format
  trotzdem EIN klarer Einstieg (Profil → Brand-Check, Duell → Vergleich, Artikel → Wizard), und
  der Newsletter ist ein eigenes Teilpaket mit Versand, Double-Opt-in und Rechtstexten —
  nicht im Launch.

**Verworfen:** ein zweiter „Insights-Score" neben dem Brand-Check (Scheinpräzision und zweite
UWG-Fläche — dieselbe Begründung wie beim gestrichenen Klarheits-Score des Marktvergleichs) ·
Gastautoren und erfundene Autorennamen · Transkript-Scraping als Content-Grundlage · fremde
Logos, Favicons und Screenshots · Kommentare unter den Beiträgen · automatische Veröffentlichung
ohne Davids Zeichen · Newsletter im Launch.

**Offen und ausdrücklich nicht heute entschieden:** die zehn Fragen der Konzeptrunde
(Plan §8, u. a. eigener Layer oder brand-Layer, URL-Basis, wer den Brand-Check einer fremden
Marke anstösst) sowie vier NEUE Anwaltsfragen neben den sechs aus Marktvergleich Anhang G
(Presse-/Wikipedia-Zitate, YouTube-Kommentare und API-Bedingungen, Score fremder Marken als
Kritik/Meinung, Verantwortlicher bei namenloser Wir-Stimme) — Plan §4.3.
## 2026-09-08 — Discover Brands: Konzept freigegeben — Freigabe vor Veröffentlichung, /discover, beide Scores, Beispiel-Branding Kailua

**Anlass:** David zieht DB1 vor („mach mit discover brands weiter"). Konzept
docs/plans/DISCOVER-BRANDS.md auf dem abgenommenen Klickdummy (Runde 97/176), der
BF1-Leseansicht (Veröffentlichung = eingefrorener Snapshot mit `sensitivity`-Filter,
derselbe Renderer) und den BC1/MV1-Daten. **Entscheidungen (David, Fragenrunde):**
(1) **Freigabe VOR Veröffentlichung** — gegen die Empfehlung „sofort öffentlich +
Ausblenden": Zustände pending/published/declined/hidden/withdrawn, Betreiber-Warteschlange;
(2) Adresse **`/discover` + `/discover/<slug>`** (`/brands/<slug>` bleibt den Insights-Seiten
externer Marken); (3) **Website-Score, sonst Fundament-Reife**, klar beschriftet;
(4) Start mit eigenen Brands **plus Beispiel-Branding „Kailua Coffee Co."**, gebaut über den
Wizard (echtes Fundament, als Beispiel markiert) statt als handgeschriebener Datensatz.
**Festgezogen:** eigenes Opt-in-Feld `publicationVisibility` (keine Wiederverwendung von
`marketVisibility` — eine Zustimmung gilt nur für das, wofür sie gegeben wurde), kein
Remix (CTA immer „Starte deine eigene"), keine Creator-Profile (AH-7), Rechtstexte (A1)
als Gate für die Öffnung an fremde Nutzer, nicht für den Bau. **Verworfen für Runde 1:**
Bewertung in Dimensionen, Trending, Collections, Vorher/Nachher-Slider, Stil-/
Positionierungs-Facetten (Daten fehlen bis Brand Design 02).
**Prototyp D0 abgenommen (2026-09-08, Fragenrunde):** Kachel mit zwei Zahlen ⇒ Score im
Ring, Reife als Zweitzeile; Brand of the Day genau eine (Server-Regel „letzte gewinnt");
Teilen auf dem Telefon über das native Teilen-Blatt (`navigator.share`, Davids Wunsch),
„Veröffentlichen" mobil im Export-Menü. Davids Arbeitsregel, erneut eingeschärft:
Entscheidungen IMMER als Fragen mit Antwortmöglichkeiten und Empfehlung, nie als Fließtext.
**Bezeichnung des Muster-Brandings (2026-09-08, Fragenrunde): „Beispiel" / „Example"** — nicht
„Demo" (klingt nach Produkt-Vorführung, nicht nach einer vollständigen Marke) und nicht
„Musterbeispiel" (zu lang für eine Kachel). Badge, Schalter und i18n bleiben wie gebaut.

---

## 2026-09-07 — Brand Design (Produkt 02): Konzept freigegeben, Prototyp beauftragt

**Entscheidung (David):** „Konzept freigegeben, bau den Prototyp im Playground." Damit ist
docs/archiv/BRAND-DESIGN.md §2 verbindlich; die drei offenen Punkte aus §2.19 gelten nach
Empfehlung: Bild-Anbieter mit ZDR wird vor D5c geprüft (bis dahin Stufe 3 hinter dem
Config-Gate aus), Freischaltung per Skript UND Dashboard-Knopf, Kapitel-Namen im UI
„Moodboard · Farbwelt · Typografie · Zeichen · Bildsprache · Bewegung" (Ids bleiben englisch).
Phase 3 läuft wie bei BF1: Klickdummy im Playground (acht Screens nach §2.15), Davids
Abnahme, dann Pakete D0–D9.

---

## 2026-09-07 — Brand Design (Produkt 02): Strategie freigegeben — fünf Schritte tief, Zeichen in drei Stufen inkl. KI-Bildlogos, Studio-begleitet, Schicht 2 der Werkstatt

**Anlass:** „Starte die Strategie für Produkt 02 Brand Design" — Phase 1 des Workflows
(docs/archiv/BRAND-DESIGN.md §1: Bestandsaufnahme, Zielbild „Design-System statt
Bildergalerie, hergeleitet aus der Strategie", Konkurrenz Looka/Brandmark/LogoAI/Tailor
Brands · Huemint/Fontjoy/Realtime Colors · Canva/Frontify, Hypothesen H1–H7).
**Entscheidungen (David, Fragenrunde):** (1) **Alle fünf Schritte gleich tief** — Moodboard,
Farbwelt, Typografie, Zeichen, Bildsprache, Motion je mit eigener Vorschau (GEGEN die
Empfehlung „vier Schritte, Bild/Motion nur als Regeln"). (2) **Zeichen in drei Stufen:**
Richtung + Briefing → gesetzte Beispiele für Wortmarke + Monogramm → ein Bereich für
KI-Bildlogos auf den zuvor erstellten Inhalten (Stufe 3 GEGEN die Empfehlung; Leitplanken:
als Entwurf gekennzeichnet, Herkunft sichtbar, nicht im Snapshot/Share, derselbe KI-Transport
mit ZDR-Routing und Drosseln, Markenrechts-Hinweis statt -Prüfung). (3) **Studio-begleitet
ohne Preis** — Freischaltung je Marke nach dem Erstgespräch, kein Stripe im brand-Layer.
(4) **Schicht 2 derselben Werkstatt** statt eines eigenen Layers: Brand Design setzt dieselbe
Werkstatt, dasselbe Dokument und dieselbe Zustandsmaschine fort — die Silo-Regel „neues
Produkt ⇒ eigener Layer" greift hier bewusst nicht (zwei Zustandsmaschinen für ein Dokument
wären der teurere Fehler). Annahme ohne Widerspruch: Vorschau als Anwendungs-Szenen mit
lokalen CSS-Variablen und echten Schriften. Nächster Schritt: Konzeption (§2).

---

## 2026-09-07 — Brand Foundation (BF1) abgenommen: alle vier Blicke, Vorhaben nach COMPLETE

**Entscheidung (David):** „Alle vier abgenommen, zieh BF1 nach COMPLETE." — Leseansicht (G2),
Teilen-Dialog und Empfänger-Seite (G3), Inhalt der Beispielmarke Kailua Coffee Co. (G5) und die
Richtungswahl mit Schranke (G4) sind abgenommen. Der Plan wandert nach
docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md, der Eintrag mit acht Gelernt-Punkten nach
OPEN-ITEMS-COMPLETE. Offen bleibt aus dem Konzept nur, was bewusst später kommt: Themes-Engine-
Presets als Ersatz des kuratierten Katalogs, `print.started`, ein „Stand"-Datum im Kopf der
privaten Seite — alles ohne eigene Zeile, weil es beim nächsten Produkt (02 Brand Design) mitgeht.

---

## 2026-09-07 — Brand Foundation G4: Richtungen-Katalog, drei Richtungen je Archetyp, kein Preis an der Schranke, Wahl in der Werkstatt

**Anlass:** „Starte Paket G4" — das Paket hing an zwei Gates, die das Konzept
(docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §5) David zuweist: Richtungen-Katalog und
Schranken-Text mit Preisanker. **Entscheidungen (Fragenrunde, alle nach Empfehlung):**
(1) Die Richtungen kommen aus einem **kuratierten Katalog im brand-Layer** (sechs
Richtungen mit Name, Begründungsregel je Archetyp, Farbwelt aus den zwölf kuratierten
Dreiklängen, Schriftpaar aus der Font-Registry), Vorschau als Anwendungs-Ausschnitt mit
lokalen CSS-Variablen — KEINE Themes-Engine-Presets mit Vorschau-iframes (der Phase-1-Plan
sah sie vor; sie bleiben der spätere Ersatz, der Katalog trägt dafür `presetId` +
`presetVersion`). (2) Angeboten werden **drei Richtungen, passend zu Haupt- und
Nebenarchetyp**, per purer Regel mit Begründung. (3) An der Schranke steht **kein Preis**:
Brand Design ist Studio-Angebot, das Erstgespräch der Weg — Enterprise = Studio, solange
Produkt 02 keine Selbstbedienung ist. (4) Gewählt wird **im Ergebnis-Kapitel der
Werkstatt** (`result.direction` mit Karten-Editor); die Leseansicht zeigt die Wahl in
Kapitel 10, entscheidet aber nicht („gelesen wird hier, abgenommen im Kapitel").

---

## 2026-09-06 — Bibliothek: erfundene Einträge raus aus dem Produkt, echte nur mit Handzeichen

**Davids Entscheidung.** Die kuratierte Bibliothek des Marktvergleichs lieferte seit dem
Gate-Flip zwei ERFUNDENE Marken an zahlende Kunden aus (`.example`-Adressen, `status:
'verified'` ohne dass jemand geprüft hatte) — richtig als Platzhalter der Mechanik,
falsch, sobald das Produkt läuft. Sie sind aus `shared/library/index.ts` heraus und leben
als Testvorlage weiter; die Test-Sperre ist UMGEDREHT und verlangt jetzt echte Hosts,
ein Prüfdatum, das nicht in der Zukunft liegt, und einen Beleg vom Auftritt der Marke
selbst (je Regel mit Gegenprobe). Übernommen wurden die zwei Einträge, die David am
selben Tag von Hand geprüft hat: **The Barn** (9 Felder) und **Apple** (5; `purpose`
gestrichen). `nike`, `anthropic`, `meta` bleiben Entwürfe.

**Der Rechts-Check bleibt offen — und das ist Teil der Entscheidung.** Die Anwaltsfragen
aus Plan Anhang G (Namensnennung im bezahlten Produkt, Zitatzweck, § 44b UrhG, § 6 UWG,
DSGVO, § 87b UrhG) sind unbeantwortet. David hat die Übernahme trotzdem entschieden; das
wird dokumentiert, nicht umgangen. Gezeigt wird das Minimum aus Anhang G (a): Wortname und
Kategorie, keine Logos, keine Bildmarken, keine Favicons — der Beweis prüft das jetzt als
ERLAUBNISLISTE der Options-Felder, nicht als Sperrliste. Rücknahme = ein Diff (Runbook 6).

**Gelernt:** eine gedruckte Erinnerung ist keine Sicherung. `--promote` sagte bisher „jetzt
bitte `MARKET_LIBRARY_VERSION` heben" — beim ersten echten Durchgang hebt es sie selbst
(die Fassung geht in `market_reports.revisionKey` ein; ohne Erhöhung halten sich
gespeicherte Berichte für aktuell). Zweitens: `frequency` fiel beim Vorrechnen weg, obwohl
der Lauf sie GEMESSEN hatte — sie reist jetzt in den Entwurf und durch die Bibliothek
durch; erfunden wird sie nach wie vor nirgends.

---

## 2026-09-07 — branding.supply: „Discover Brands" und „Brand Insights" als eigene Vorhaben notiert

**Anlass (David):** Beide Bereiche waren Teil des Klickdummys (Discover-Seite Runde 97,
Journal Runde 103, dazu Artikel/Profil/Duell/Anatomie) mit Filtern und Sortierung, sind aber
nie ins Produkt gewandert; seit dem 404-Audit vom 2026-09-03 zeigt die Navigation nur echte
Ziele, und nirgends stand, dass die beiden geparkt sind.

**Festgehalten:** „Discover Brands" (DB1) kommt in „Jetzt dran" hinter BF1 und den Strang
„Brand System" — die Daten dafür existieren seit Brand-Check und Marktvergleich (Score mit
Opt-in, Archetyp, Kategorie, Freigabe fremder Marken). „Brand Insights" (BI1, früher „Journal",
umbenannt 2026-08-30) wartet auf ein Redaktionskonzept und baut auf DB1 auf. Beide gehen den
Weg Strategie → Konzept → Prototyp → Freigabe → Pakete; der Dummy bleibt als Vorlage im
brand-Playground.

---

## 2026-09-06 — Marktvergleich: Pakete M1–M6 auf main; vier Beschlüsse aus dem Bau

**Stand:** alle sechs Pakete liegen auf `main` (M1 475aeabd · M2 1bb5c55f · M3 11be1ef4 ·
M4 8e936691 + Gate-Nachfix 0add6133 · M5 ae3b70d7 · M6 0c2070bc). Prod-Tabellen fehlen
noch (Davids Ja steht aus), deshalb steht `pukalani.market.enabled` in `apps/branding`
auf AUS.

**Beschlüsse (Hauptloop, nach Prüfung — keine Davids-Entscheidung, aber festgehalten, weil
nicht aus dem Code ablesbar):** (1) **Ein Gate schaltet alles oder nichts:** das
Build-Gate wirkte nur auf der Seite, Leiste und Routen ignorierten es — jetzt prüfen alle
drei Flächen denselben Schalter, und ein Deploy vor der Migration macht nichts sichtbar.
(2) **Teilen-Link filtert nach `sensitivity`:** BF1 versprach „reist nicht per Share-Link",
gelesen wurde das Feld beim Veröffentlichen nie — jetzt reisen nur `public`-Felder;
bestehende Share-Links zeigen ab dem Deploy weniger (u. a. keine Wettbewerber-Notizen).
(3) **Die Bot-Erklärseite `/market-bot` steht NICHT hinter dem Produkt-Gate:** der
Bot-Name steht nach dem ersten Lauf in fremden Logs, unser Schalter nimmt ihn nicht
zurück. (4) **Bibliothek: Entwürfe bleiben aus dem Repo, `status: 'verified'` ist Pflicht** —
eine maschinell gerechnete Aussage über eine fremde Marke bekommt erst mit Davids
Handzeichen einen Platz.

**Befund aus dem Trockenlauf (M6):** 9 von 10 Kandidaten-Marken erlauben den Abruf per
robots.txt und tragen keinen TDM-Vorbehalt; adidas wehrt den Bot per 403 schon auf der
robots.txt ab (fail-closed behandelt). Die Erwartung „die Grossen sperren per Regel" hat sich
nicht bestätigt — gesperrt wird per Bot-Abwehr.

**Gelernt:** zwei Beweis-Skripte gegen DENSELBEN Dev-Server-Prozess erschöpfen die
prozessweiten Eimer (429 in Schritt 14 — kein Fehler, ein Deckel); je Beweis ein frischer
Prozess.

---

## 2026-09-05 (spät) — Marktvergleich: Prototyp M0/M0b FREIGEGEBEN, Pakete M1–M6 laufen selbstständig

**Entscheidung (David):** Der Prototyp (fünf Screens im Playground: Markt mit Quellen-Wähler
und Brand-Check-Score je Kandidat · Lauf mit robots/sitemap/llms.txt/JSON-LD · Ergebnis mit
Umschalter „Website sagt / KI-Antworten sagen", Konventionen, Überschneidungen, freie Stellen,
KI-Außensicht mit Konsens-Filter · Markt-Befund in der Werkstatt · Relaunch alte Website gegen
neue Foundation) ist ohne Änderungswunsch freigegeben. Die Pakete M1–M6 (Plan §5 + §7.6)
starten nacheinander selbstständig, sobald das vorige grün ist (Regel vom 2026-09-05).

**Gates bleiben:** Prod-Migrationen (market-001…003, später brand-Spalte `marketVisibility`)
nur mit Davids Ja; Schema-Anhang (M1) zur Durchsicht; Klick-Beweis der Oberfläche (M4);
Abstimmung mit der BC1-Sitzung für den geteilten Abruf, das Opt-in-Feld und die
Score-Anbindung — nichts davon wird zweimal gebaut.

**Verworfen:** eine zweite Korrekturrunde am Prototyp (David: passt), ein eigener Klarheits-
Score (schon am Abend gestrichen).

---

## 2026-09-05 — branding.supply: fünf Ebenen als Karte, „Brand Context" als Export, Strang „Brand System"

**Anlass (David):** eigene Auswertung der Guidelines-Referenzen (Frontify, Corebook°,
standards.site, Brandkit, Lovable, Bynder, Galerien) mit der These: nicht ein
kleineres Frontify bauen, sondern den Raum DAVOR besetzen — „Wie gut ist unsere
Marke, was fehlt, wie entwickeln wir sie — und wie wird daraus ein Brand System?"
Als Leitplanke am Projektstand geprüft: Audit (Brand-Check), Compare (Quartett/
Marktvergleich), Build (Wizard), Kit/Tokens/brand.json (Produkt 03), Do & Don't,
„Guide = Website, PDF = Export" (BF1) existieren oder sind geplant; die
Nachbar-Sitzung hat Markenabdruck, Ampel-Matrix und Stärke · Chance · Nächster
Schritt am selben Tag entschieden.

**Entscheidungen (Fragenrunde, alle nach Empfehlung):** (1) Die fünf Ebenen
**Discover → Audit → Compare → Build → Supply** kommen als KARTE über die sieben
Suite-Produkte in den Phase-1-Plan §5b — Produkte und Namen bleiben; der Satz
„Understand. Improve. Build. Supply your brand." ist Positionierungs-Kandidat,
nicht Startseiten-Copy. (2) Produkt 03 bekommt den benannten Export **„Brand
Context"** (`brand.md` neben `brand.json` und Tokens); „Connect" (MCP/API) bleibt
Phase 3+. (3) Reihenfolge nach BC1 P6 als Strang „Brand System": BF1 → Produkt 02
(Extraktion als Relaunch-Einstieg) → Produkt 03 — **ohne neue P-Nummern** (P7–P10
aus dem Text kollidieren mit BC1 und Phase-1). (4) Brand Library: zwei Vermerke an
der Discover-Skizze („Ähnliche Marken", Cases als Judge-Referenz), kein Vorhaben.
**Deckungsgleich, keine Entscheidung nötig:** kein DAM, kein Template-Editor.

---

## 2026-09-05 — Brand Foundation als Guidelines: Leseansicht des Ergebnis-Dokuments (P5–P7-Rest)

**Anlass (David):** eine allgemeine Brand-Guidelines-Definition (Story, Logo, Farbe,
Typografie, Tone of Voice, Bildsprache) eingebracht; Wahl unter vier Wegen: das
Ergebnis-Dokument des Wizards wird an diesem klassischen Aufbau ausgerichtet —
Konzept, kein Code. Abgleich: die verbale Hälfte deckt der Wizard vollständig und
tiefer (Positionierung, Architektur, Name, Manifest), die visuelle gar nicht —
das ist die Produktentscheidung „Fundament frei, Ableitung bezahlt".

**Entscheidungen (Fragenrunde, alle nach Empfehlung):** (1) Der Name bleibt
**„Brand Foundation"** — „Brand Book (24 Kapitel)" ist auf der Startseite Produkt 03
und bezahlt; ein freies „Guidelines" dazwischen hätte die Frage „was kaufe ich
dann noch?" ausgelöst. Der Guidelines-AUFBAU ist die Form, nicht der Name.
(2) Die Leseansicht zeigt **nur Festlegungen**: neues Registry-Feld `audience`
NEBEN dem bestehenden `sensitivity` (zwei Fragen — „ist es eine Festlegung?" und
„darf es reisen?" — zwei Felder, wie `as`/`actor` an der Datentür). (3) Logo,
Farbe, Typografie, Bildsprache erscheinen **sichtbar gesperrt mit Begründung und
CTA**; beim Fremdleser nur ein Satz ohne Preisanker. (4) Export = **Browser-Druck
mit Print-CSS**, kein Server-PDF. Annahme ohne Widerspruch: die Share-SEITE gehört
in dieses Vorhaben (Backend `brand_shares` + Routen existieren seit P1b, nur die
Seite fehlt).

**Befund dabei (Vertrag ohne Code):** `sensitivity: 'internal'` (a.competitors,
a.complaints, a.challenge, a.facts) verspricht seit BW2 „reist nicht per
Share-Link" — `share.post.ts` friert aber ALLE bestätigten Werte ein. Unsichtbar,
weil es die Share-Seite noch nicht gibt; Paket G1 schliesst es beidseitig
(Snapshot-Schreiben UND Renderer filtern, Gegenprobe), bestehende Prod-Shares
werden beim G3-Deploy widerrufen.

Plan: docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md (Pakete G1–G5; Davids Gates:
Schranken-Text + Preisanker, Richtungen-Katalog).

## 2026-09-05 — Brand-Check: „Markenabdruck", Ampel-Matrix statt Heatmap, Befunde als Stärke · Chance · Nächster Schritt

**Anlass:** externer Visualisierungs-Input (Radar, Heatmap, Score-Cards, Insight-Cards) — als
Leitplanke am eigenen Modell geprüft, nicht kopiert. **Entscheidungen (David):** (1) Die 8
Kategorie-Werte als Netz heißen **„Markenabdruck"** (EN „Brand Fingerprint") — der Begriff ist
das Feature, „Radar" ist nur die Technik und steht nie im UI. (2) Die 40 Kriterien als
**Ampel-Matrix 8 × 5** mit vier Zuständen (0/1/2/nicht bewertbar), bewusst KEINE 0–100-Heatmap
je Kriterium (Scheingenauigkeit). (3) Die drei Befunde werden **Stärke · Chance · Nächster
Schritt** statt „drei schwächste Kriterien" — aus dem Audit wird Beratung, der dritte Befund
zeigt ins Wizard-Kapitel (Analyse → Erkenntnis → Empfehlung → Handlung → Relaunch). Drei
Zoomstufen derselben Daten: Score = Urteil, Markenabdruck = Profil, Matrix = Diagnose.
**Verworfen:** Treemap/Sunburst, Radial Bars, Benchmark-Bullet (erst mit Ranking-Perzentil),
Chart-Framework (Inline-SVG aus Tokens). Bauplan: P4 mit überlagerten Markenabdrücken, P6
Ergebnisseite v2 — docs/archiv/BRAND-CHECK-SEITE.md §10.

---

## 2026-09-05 — Brand-Check wird Produktseite: Ranking nur mit Opt-in, Branche per KI + Korrekturvorschlag, Dokument-Check sofort

**Anlass (David nach dem ersten gelungenen Live-Check):** der Check gehört auf EINE eigene
Seite (`/brand-check`, heute 404), alle Teaser zeigen dorthin; dazu ein Archiv/Ranking aller
geprüften Auftritte, ein Quartett-Vergleich zweier Brands (links/rechts, Kategorie für
Kategorie) und für eigene Brands „Score neu ermitteln" mit Gegenüberstellung zum Vorgänger
und Experten-To-do-Liste. Konzept: docs/archiv/BRAND-CHECK-SEITE.md.

**Entscheidungen (David, Fragenrunde):** (1) **Ranking nur mit Opt-in des Prüfers** — ohne
Häkchen bleibt ein Check privat; verworfen: alle Checks öffentlich (Bewertung Dritter ohne
deren Wissen), Ranking nur für Eingeloggte. (2) **Branche als KI-Vorschlag** im selben
Judge-Aufruf, korrigierbar über einen **Korrekturvorschlag-Workflow „wie Google Business
Profile"** (Vorschlag → Betreiber prüft → annehmen/ablehnen mit Begründung); Besitzer eigener
Brands korrigieren direkt. Umsetzung SCHLANK im brand-Layer (eigene Tabelle + Dashboard-
Warteschlange wie die Warteliste), nicht über den `tickets`-Layer — branding.supply fährt ihn
nicht, und er brächte für ein Feld vier Tabellen und ein Produkt mit. (3) **Dokument-Check
sofort mit** (Brands ohne Website: Fundament-Dokument als Material, eigener Score
„Fundament-Reife", nie mit Website-Scores in einer Zahl); Brands ohne Website zeigen
zusätzlich „Website hinterlegen". (4) **Konto-Deckel 10/Tag** für „neu ermitteln" (umgeht den
7-Tage-Cache); Gäste bleiben bei 3/Tag je IP.

---

## 2026-09-05 (abends) — Marktvergleich, Prototyp-Runde 1: ein Motor, drei Ansichten; vier Quellen; Brand-Score; KI-Suche

**Entscheidungen (David, am Prototyp):** (1) EIN Motor (Marktprofil mit Beleg) und drei
Ansichten Brand-Check / Brand-Score / Marktvergleich — keine drei Produkte. (2) Brand-Score
= deterministische Klarheits-/Konsistenz-Zahl 0–100, sichtbar für eigene Marke und
Bibliothek, für Wettbewerber nur intern. (3) Kandidaten-Quellen: Website, eigene Marke aus
dem Konto, kuratierte Bibliothek bekannter Marken (adidas/Nike, Anthropic/OpenAI,
Meta/Apple + kleinere) UND — GEGEN die Empfehlung (Phase 2) — fremde Wizard-Marken anderer
Kunden; Leitplanke: nur mit ausdrücklichem Opt-in der Eigentümerin, nur das Marktprofil.
(4) KI-Suche („AI-Außensicht") SCHON in Phase 1 — GEGEN die Empfehlung (Phase-2-Experiment);
Leitplanken: eigene Herkunft, immer als ungeprüft beschriftet, Konsens-Filter über ≥ 2
Modelle, kein Einfluss auf den Score. Plan §7.

**Korrektur am selben Abend (David bestätigt):** Der Brand-Check existiert bereits (parallele
Sitzung, BC1) — der geplante Klarheits-Score ist GESTRICHEN, der Marktvergleich übernimmt den
bestehenden Brand-Score je Kandidat; der Marktvergleich lebt in der WERKSTATT als Ebene-1-Seite
„Markt", nicht als Reiter unter /brand-check; Abruf-Erweiterung (Sitemap/llms.txt/Mehrseiten)
wird EINMAL im brand-Layer gebaut und beiden Produkten zugänglich; Opt-in für fremde Marken =
dieselbe Zustimmung wie das Brand-Check-Ranking.

---

## 2026-09-05 — Marktvergleich: Strategie + Konzept freigegeben (acht Entscheidungen)

**Entscheidungen (David, per Fragenrunde, alle nach Empfehlung):** Das Produkt zeigt den
BEHAUPTUNGS-Raum einer Kategorie — was Wettbewerber auf ihren Websites sagen, übersetzt
in die Feldstruktur der Brand Foundation, jede Aussage mit Zitat + Quelle — und liefert
Konventionen, Überschneidungen, freie Stellen und Befunde am EIGENEN Feld. Kein Ranking,
kein Score je Wettbewerber, keine Aussage über Markterfolg, keine veröffentlichungsfähigen
Vergleichs-Claims (§ 6 UWG). Eigener Layer `market` mit Vertrag zu `brand`; freigeschaltet
nach Kapitel B; bezahlt ab Tag eins (Beta frei); Adressen vom Kunden; Ausgabe Tabelle +
Listen + Befunde; nur Websites als Quelle; Abruf-Vertrag bleibt in `brand` und wird
exportiert. Plan: docs/archiv/BRAND-MARKTVERGLEICH.md (Recherche im Anhang).

**Verworfen:** Vergleichs-Score, Websuche nach Adressen, Zwei-Achsen-Karte mit
Modell-Achsen, Bewertungs-/Social-Quellen in Phase 1.

---

## 2026-09-05 — Brand Wizard: fremdes Branding ⇒ 404 auch in der Werkstatt; Dokument-Seite abgenommen

**Entscheidung (David):** „Dokument-Seite abgenommen, Werkstatt soll auch 404 zeigen." Ein
fremdes oder unbekanntes Branding ist in Werkstatt UND Dokument ein echter HTTP 404
(Datentür-Muster), keine halbe Seite „Namenloses Branding". Unverändert: fehlender
Beta-Zugang / gesperrter Baustein (`blocked`, 403) bleibt die ruhige Fläche.

---

## 2026-09-05 — Brand Wizard: Pakete eines freigegebenen Plans starten selbstständig

**Entscheidung (David):** „Immer wenn ein Paket abgeschlossen ist, kann das nächste
starten … kannst auch gerne selbstständig starten, ohne meine Aufforderung." Gilt
für Pakete eines FREIGEGEBENEN Plans; Davids Gates bleiben dort, wo der Plan sie
setzt (Inhalte gegenlesen, Prod-Migrationen, Abnahme einer Seite).

---

## 2026-09-04 — Brand Wizard: „Branding-Atome" — eine Session je Feld, drei Ebenen, drei Abnahmen

**Entscheidungen (David, in drei Gesprächsrunden + zwei Fragenrunden):**
1. **Session je FELD** (68), nicht je Kapitel/Abschnitt — eine Session ist eine
   konfigurierte Arbeitseinheit (Ziel, Eingaben, Verarbeitung, Antwort-Regeln,
   Output), kein Chat-Faden; Ableitungen ohne Frage sind ein gültiger Session-Typ.
2. **Auto-Weiter** nach Bestätigung; der Mensch sieht EIN Gespräch.
3. **Spezialist beim SCHLIESSEN** jeder Session (nicht je Zug), **zweistufig**:
   günstiges ZDR-Modell, George-Modell nur bei Konflikt-Verdacht.
4. **Korrektur-Regel:** vor jeder Korrektur eines bestätigten Feldes zeigt der
   Server die Abhängigkeits-Hülle — annehmen oder abbrechen.
5. **Prüfblick** über das Dokument NUR auf Klick.
6. **Finale Abnahme je Kapitel** als eigener Punkt: Blöcke (Bereich/Beispiel/
   Eingabe), Abnehmen je Block (zweiter Zustand `accepted`), Frage „Passt dieses
   Kapitel?" erst bei 10/10, „Nochmal von vorn" LÖSCHT (bisher Vertiefungsrunde)
   mit Layer, getipptem Wort und Ack. Drei Ebenen ⇒ drei Abnahmen (Session →
   Kapitel → Dokument); tiefer als Ebene 3 geht es nie.
7. **§3a-Ergänzungen** alle angenommen (Qualitätskriterien, Anti-Muster, Beispiele
   fremder Branche in de+en, Frage-Leiter, Form, Invarianten im Code,
   Vertraulichkeit, Umfang, Vertagen). **Gegenlese-Runde:** Umfang halbiert
   (~78 Min Basispfad), Beispielwelt = Software/Agentur/Studio/Gastro/Yoga/
   Interior/Coaches/Personal Brands, Anrede in Beispielen vermieden, Manifest ein
   Block (23), Wettbewerber intern / Hauptmarken-Rolle öffentlich, Fragen-Pools
   eingefroren (D7 nur bei Team).

**Verworfen:** Session je Abschnitt (Fable-Vorschlag — Davids Rahmen „Config je
Session" löste die Einwände auf); Spezialist je Zug (Geld, Latenz, Marker-Vertrag).
Plan + Begründungen: docs/archiv/BRAND-WIZARD-SESSIONS.md.

---

## 2026-09-04 — Archetyp: Gesprächs-Ableitung als Interim (statt Paarvergleich-Berechnung)

**Entscheidung (David, aus drei Optionen):** Solange das Paarvergleich-Instrument
(Content-Spec §12.2 — 12 Karten, 8–12 adaptive Paare, berechnetes Ergebnis)
nicht gebaut ist, leitet **George die Archetyp-Kette im Gespräch her**: die
Hypothese spec-konform aus Baustein A; Primär/Sekundär/Selbstbild&Außenbild als
begründeter Vorschlag mit Antwort-Chips, der Mensch bestätigt. Dafür wird ein
George-Generator für das Kapitel registriert (bis dahin gab es KEINEN —
`no_generator`, das Kapitel war strukturell unabschliessbar).

**Verworfene Alternativen:** (a) Primär/Sekundär bis zum Instrument aus der
Abschluss-Pflicht nehmen (Ergebnis-Profil hätte keinen Archetyp gehabt);
(b) das Instrument sofort bauen (größtes Paket, blockiert die Beta-Tests).

**Rückbau-Pfad:** Das Instrument ersetzt später NUR den Herleitungs-Weg — die
gespeicherten Werte sind stabile Katalog-Ids und bleiben kompatibel.

---

## 2026-09-02 — Das Team ist professionell: die Hunde-Welt fällt komplett

**Entscheidung (David):** Alle Team-Mitglieder sind professionelle Beraterinnen
und Berater. **Keine Rassen, keine Tier-Gags, nirgends** — nicht im Wizard,
nicht auf der About-Seite, nicht in einem Steckbrief. Damit ist die Hunde-Welt
der Klickdummy-Runde 163 und Entscheidung 2 vom 2026-09-01 (George Wuffwuff,
Vera Witterung, Milo Treuherz, Nika Bellkant, Otto Testbiss) VERWORFEN.

**Die abgesegneten Namen** (Vornamen bleiben, Nachnamen neu):
- **Wizard:** George Winter (Markenberater & Markenstratege) · Vera Stein
  (Strategin) · Milo Berger (Werte-Berater) · Nika Sommer (Sprach-Beraterin) ·
  Otto Kessler (Namens-Berater).
- **Produkt-Team (About):** Frida Martens (Design Directorin) · Rex Weber
  (Produktioner) · Kira Hoffmann (Content-Strategin) · Wanda Nowak
  (Monitoring-Analystin) · Ada Sander (Score-Prüferin) · Scout Krüger
  (Research-Analyst).

**Was aus `personal` wird:** eine PROFESSIONELLE Kurzzeile über Haltung und
Arbeitsweise — nicht mehr „Rasse · Stadt · zwei Hobbys". George: „Markenberater
und Markenstratege — jede Empfehlung mit Begründung, jede Entscheidung
festgehalten." Der Wächter dagegen steht im Test (`brandAdvisors.test.ts`): die
About-Zeile darf das Trennzeichen der alten Steckbrief-Form nicht mehr tragen,
und weder Name noch Zeile noch Prompt-Feld dürfen Hunde-Vokabular enthalten.

**Grund:** Das Produkt verkauft Markenberatung an Unternehmen. Ein Maskottchen
im Steckbrief nimmt genau der Person Autorität, die gleich unbequeme Fragen
stellen soll — und der Live-Persona-Audit hat gezeigt, dass die Fragen ohnehin
das Produkt sind. Die Verspieltheit gehört, wenn überhaupt, in die Sprache der
Marke, nicht in die Biografie der Beraterinnen und Berater.

**Bilder:** Der Platzhalter `/george.jpg` (ein Hunde-Foto) ist gelöscht, der
Default von `BwGeorgeAvatar` ist leer ⇒ Monogramm. Echte Porträts kommen für
ALLE oder gar nicht, und dann in die Registry (`avatar`), nie zurück in einen
Komponenten-Default.

**Nicht umgeschrieben:** die Protokolle. Der Eintrag vom 2026-09-01 unten, die
Audit-Archive und der Klickdummy `packages/brand/.playground/app/pages/team.vue`
bleiben, wie sie sind — letzterer mit einer Ruhestands-Notiz im Kopf. Ein
Protokoll, das man nachträglich hübsch macht, ist keins mehr.

## 2026-09-02 — Brand Wizard: EINE Stimme (George), das Team im Rücken — revidiert das sichtbare Beraterteam

**Entscheidung (David, nach dem Gespräch-Dummy-Durchlauf):** George ist der
einzige Sprecher durch den GESAMTEN Wizard. Die Spezialisten (Vera, Milo,
Nika, Otto) sprechen nie selbst — George erwähnt sie („Ich habe das mit
Vera, unserer Strategin, durchgesehen"), ihre Interview-Techniken bleiben
als seine Phasen-Facetten in den Prompts, und auf der Team-Seite bleiben
sie sichtbar. Grund: vier Sprecherwechsel in einer 45-Minuten-Sitzung
heißen viermal Beziehung neu aufbauen — Aufstückelung statt Beratung.
Die Registry (brandAdvisors.ts) bleibt die Quelle; sie bekommt mit dem
Werkstatt-Umbau eine Sprecher/Referenz-Unterscheidung.

**Dazu:** Brand Language geht IN Brand Foundation auf (ein Wizard, ein
Dokument, George durchgehend — deckungsgleich mit dem Runde-163-About
„George führt durch Foundation und Language"). Tagline/Messaging und
Name & Prüfung sind Kapitel der Foundation-Reise, kein zweiter Einstieg.

**Verworfen:** fünf wählbare Berater-Charaktere für den ganzen Durchlauf —
verfünffacht Prompt-Pflege und Audits, macht Beta-Feedback unvergleichbar,
verwässert George als Gesicht des Produkts. Die gute Essenz kommt später
billiger als Ton-Regler auf EINER Person („direkter/weicher").

## 2026-09-01 — Brand Wizard: sichtbares Beraterteam statt eines Alleskönners

**Auslöser:** Der Live-Persona-Audit an Davids erstem echten Branding. George
lieferte Entwürfe ohne Rahmen (kein „worauf das fusst", keine Abschlussfrage),
schrieb bei dünnem Material lieber etwas Erfundenes als eine Rückfrage, füllte
Wettbewerber-Steckbriefe mit „steht nicht in den Eingaben" und redete einem
Verein von „Kunden gewinnen". Davids Leitsatz dazu, der jede Entscheidung
dieser Runde führt: **„Die Qualität der Antworten wird durchs INTERVIEW
bestimmt — eine kleine, leicht beantwortbare Frage zuerst; ehrlich benennen,
was fehlt; runterbrechen, bevor jemand zu viel erzählt."**

**Entscheidung 1 (David): sichtbares Beraterteam.** Der Wizard zeigt nicht mehr
einen Alleskönner, sondern fünf Fachleute — George bleibt der **Gastgeber**
(Startbogen, Kontext, Ergebnis), **Vera** führt Purpose/Vision/Mission und die
Markenarchitektur, **Milo** Werte und Archetyp, **Nika** Manifest und verbale
Identität, **Otto** das Naming. Der Grund ist kein Schmuck: ein Wechsel der
Person ist der billigste Weg, einen Wechsel der FRAGEART anzukündigen. Die
neun Regeln aus Content-Spec §1.2 gelten unverändert für alle fünf — die
Persönlichkeit entscheidet WIE gefragt wird, die Regeln WAS erlaubt ist, und
bei Konflikt gewinnen die Regeln (steht so im Prompt).

**Entscheidung 2 (David): die Namen.** George Wuffwuff · Vera Witterung
(Weimaranerin, Vorstehhund — zeigt die Richtung) · Milo Treuherz (Berner
Sennenhund) · Nika Bellkant (Papillon, bellen + Belcanto) · Otto Testbiss
(Mops, beisst auf jeden Namen wie auf eine Münze). Damit bleiben sie im
BESTEHENDEN About-Konzept (Runde 163): das Branding-Supply-Team sind Hunde mit
funktional-verspielten Nachnamen. **Zwei Ebenen, bewusst getrennt:** die
Hunde-Welt (voller Name, Rasse, Marotten) lebt auf der About-Seite; der
Wizard-Kopf zeigt nur Vorname und Rollen-Titel, und die PROMPTS erwähnen sie
mit keinem Wort — im Interview sind das Beraterinnen und Berater, kein
Maskottchen.

**Entscheidung 3: „zu wenig ist zu wenig" wird gerechnet, nicht gefragt.** Ein
deterministisches Bereitschafts-Gate je Slot prüft VOR dem Klick, ob das
Material für einen ehrlichen Entwurf reicht, und sagt sonst beim Namen, was
fehlt (409 `not_ready` an der Route, ruhiger Satz in der Werkstatt). Es kostet
keinen Anbieter-Aufruf. Was man rechnen kann, fragt man nicht — Georges neue
Rückfrage bleibt für das, was man NICHT rechnen kann.

**Zwei Dinge, die bewusst NICHT passiert sind:** (1) Georges REAKTION auf
getippte Antworten (jede Reaktion wäre ein KI-Aufruf je Antwort — Kostenfrage,
gehört in die Konversations-Runde P3); die Antworten werden vorerst nur
SICHTBAR, ihre Substanz steht ohnehin im Slot. (2) Die Übergabe-Zeile beim
Berater-Wechsel wird nicht persistiert — bei jedem Sprung zwischen zwei
Bausteinen stünde sie sonst ein weiteres Mal im Verlauf.

Prompt-Fassung: `george-a-4`. Nachtrag in
docs/plans/BRAND-WIZARD-CONTENT-SPEC.md §1.

## 2026-08-23 — Mitglieder gehören in die Navigation, nicht in die Einstellungen

**Auslöser:** Nach dem Bau der Mitglieder-Weltkarte fragte David, ob die
Mitglieder-Seiten überhaupt in die „Community-Einstellungen" gehören — „unter
settings brauchen wir das eigentlich nicht". Er hat recht: Beiträge, Events,
Kurse und Medien liegen als Nav-Module links, nur die Menschen der Community
hingen als Einstellungs-Reiter dazwischen. Mitglieder stellt man nicht ein,
man blättert sie durch.

**Entscheidung (David):** Der Eintrag zieht in die linke Navigation, Gruppe
**„Produkte"** — nicht in eine eigene Gruppe und nicht an den Anfang der
Leiste. Die Seiten ziehen dabei WIRKLICH um (`/dashboard/members`,
`/members/map`, `/members/<id>`), statt nur den Menüpunkt zu verschieben:
sonst stünde über der Weltkarte weiter die Reiter-Reihe des
Einstellungs-Hubs, und die Adresse behauptete etwas anderes als die Seite.
Alt-Pfade antworten 301. **Kuriosum fürs Protokoll:** genau diese Adresse
zieht zum ZWEITEN Mal um — vor F50 (2026-08-08) lag die Mitgliederliste
schon einmal unter `/dashboard/members` und wanderte damals IN den Hub; die
301 von damals zeigte in die Gegenrichtung und wird jetzt gedreht. Der
F50-Beschluss („ein Hub für Community-Einstellungen") bleibt für alles
gültig, was wirklich Einstellung ist.

**Zwei kleinere Beschlüsse desselben Durchgangs:**
- **Breite:** Konto-Hülle, Community-Hülle und die Bühne des Kundenbereichs
  laufen einheitlich auf **1280 px (`max-w-7xl`)**. Vorher hatte jede Hülle
  Breiten JE ROUTE (Formular schmal, Tabelle/Karte breit) — derselbe Hub
  sprang bei jedem Reiter-Wechsel. Die 90rem-Regel vom 2026-08-20 bleibt für
  ÖFFENTLICHE Seiten; Dashboard und Kundenbereich sind bewusst enger, weil
  dort eine Sidebar danebensteht.
- **Benennung:** Der Eintrag unten links im Nutzer-Menü heißt jetzt
  **„Kontoeinstellungen"** statt „Einstellungen" — die Zielseite trägt diese
  Überschrift bereits und sagt „gilt für dein Konto, nicht für eine einzelne
  Community". Menü-Label und Seitenüberschrift sind damit identisch, und der
  Punkt grenzt sich hörbar von „Community-Einstellungen" ab. Verworfen:
  „Profileinstellungen" (dahinter liegen auch Sitzungen, Abrechnung und
  Kontolöschung — mehr als ein Profil).

---

## 2026-08-20 — Seitenbreite überall 90rem, Vorbild ui.nuxt.com

**Auslöser:** David empfand alle Seiten auf seinem 27-Zoll-Monitor als zu
schmal (Marketing 71rem, Community-Hülle max-w-5xl = 64rem). Erst „immer die
Original-Breakpoints/-Maße von Tailwind", dann präzisiert: **die Breite von
ui.nuxt.com ist das Optimum auf dem Desktop** — dort gemessen:
`--ui-container: 90rem` (1440px), also BREITER als die Nuxt-UI-Vorgabe 80rem.

**Umsetzung:** EINE Variable regiert alles — `:root { --ui-container: 90rem }`
in core/app/assets/css/main.css; jeder `UContainer` liest sie ohnehin, und die
Layout-Hüllen (core- + blueprint-Layout) sowie die Dashboard-Deckel
(Übersicht, Nutzer-Detail, Mitgliederliste) nutzen jetzt
`max-w-(--ui-container)` statt fester `max-w-5xl`-Klassen (exakt das Muster
der Nuxt-UI-Site). Marketing überschreibt die Variable NICHT mehr
(puka-theme.css erklärt nur noch die Paar-Rechnung `.mkt-inner` = 90 − 3 =
87rem); Kopf/Fuß verlieren ihre eigenen `max-w-[72/75rem]`-Deckel.
Listen-Seiten, die den alten Hüllen-Deckel spiegelten (Discussions, Events,
Pricing, Badges), verlieren ihren `max-w`-Zusatz und folgen der Hülle.
**Bewusst schmal bleiben** Lesebreiten und Formulare (Feed/Threads 2xl,
Artikel/Settings 3xl, Kurs-Katalog 4xl, `.mkt-narrow` 46rem) — benannte
Tailwind-Stufen. Eigene Breakpoints gab es nie; es ging um die
`max-width`-Deckel. Browser-Beweis: Kopf, Sektionen, Fuß, Hülle und Listen
alle 1440px — deckungsgleich mit ui.nuxt.com.

**Auslöser:** David fragte, warum der Owner von freelancer.supply den
Menüpunkt „Instance" (/dashboard/admin) nicht sieht. Die Antwort (E9: das Menü
versteckt Betreiber-Einträge auf Mandanten-Hosts, F51: „System entfällt im
Pool") führte zur schärferen **Entscheidung: solche Seiten sollen dort gar
nicht ERREICHBAR sein — sie gehören auf admin.pukalani.app.** Bis dahin
versteckte nur das Menü sie: die Hülle /dashboard/admin war jedem
Dashboard-Berechtigten als leere Fläche zugänglich, und ein
Operator-Break-Glass hätte Instanz-Seiten auf einem Kunden-Host sogar
funktionsfähig geöffnet.

**Umsetzung:** Seiten erklären ihre Ebene per `definePageMeta({
dashboardScope })`; die neue globale Middleware
`packages/admin/app/middleware/dashboard-scope.global.ts` wirft 404, wenn
`scopeVisibleAt(scope, place)` das Menü dort verböte — dieselbe pure
E9-Regel, 404 wie N7 (kein 403: das wäre die Auskunft, dass es hier etwas
gäbe). GLOBAL, weil die benannte `admin`-Middleware NACH `auth` läuft und der
Login-Redirect einem Anonymen sonst die Existenz verriete. Zweite Härtung in
`admin.ts`: bei `dashboardScope: 'operator'` zählt als Rechte-Quelle nur noch
das Operator-Label, nie die Site-Rolle (spiegelt `moduleAllowedFor`).
Gestempelt: elf admin-Layer-Seiten + die vier /dashboard/themes-Seiten
(gleicher operator-Nav-Eintrag, beim Bau als Lücke gefunden). Beweis am
Worktree-Dev-Server 8/8 inkl. Gegenproben (Community-Dashboard bleibt,
Kontroll-Host behält die Seiten, unbekannter Host 404 wie zuvor).

---

## 2026-08-19 — Alt-Projekte endgültig weg: `pool` gelöscht, AH-4c-Beobachtung vorgezogen beendet

**Davids Entscheidungen** (je strukturierte Frage bzw. expliziter Auftrag nach
Erklärung): (1) AH-4c-Beobachtung nach einem Tag störungsfreiem Betrieb
beendet — beide Rückweg-Keys des eingefrorenen `control` widerrufen (2×401),
Projekt bleibt mit 0 Keys als Daten-Rückweg stehen. (2) Projekt **`pool`
GELÖSCHT**: `account` war seit AH-1 eine Woche unter Kundenlast
weitergewachsen, ein Rückfall hätte Kundendaten verworfen — die Kopie
versicherte nichts mehr und war als veraltete Vollkopie von Nutzerdaten nur
noch Datenschutz-Ballast. Löschung sauber (kein Delete-500), Alt-Stände in
den Offsite-Dumps. Noch am selben Tag fiel auch (3): das
eingefrorene `control` selbst — David hat nach Abwägung (frische Kopie mit
Rest-Versicherungswert vs. Endzustand) die sofortige Löschung gewählt; sauber,
404-Gegenprobe. **Verbleibende Projekte: admin, account, portfolio.**

---

## 2026-08-18 — AH-4c beschlossen: Appwrite-Projekt `control` zieht nach `admin` um

**Davids Entscheidung** (strukturierte Frage, GEGEN die Empfehlung „nur
Anzeige-Name ändern"): das Projekt wird per AH-1-Muster umgezogen — neues
Projekt `admin`, Daten + Nutzer mit Hashes, NEUE Keys (Secrets sind nicht
kopierbar), Env-Schnitt auf admin- und platform-Site, Wartungsfenster.
Begründung: konsistente Namenswelt nach AH-4b; die Gegenargumente (rein
interne Kosmetik, kundenwirksames Risikofenster an der platform-Naht) sind
bekannt und akzeptiert. Am selben Tag außerdem: **Projekt `comments` in der
Konsole GELÖSCHT** (war eingefroren; Rückweg nur noch Offsite-Dumps) —
sauber durchgelaufen, 404-Gegenprobe. Runbook:
docs/runbooks/ADMIN-PROJEKT-CUTOVER.md · OPEN-ITEMS Punkt 5 (AH-4c).

---

## 2026-08-18 — AH-4b: Konsolen-Site wirklich umbenannt, 301 des Altnamens aufgegeben; comments-Site-Löschung vorgezogen

**Auslöser:** David hat die ploi-Site der Betreiber-Konsole im Panel von
`control.pukalani.app` auf `admin.pukalani.app` umbenannt und ein neues
Zertifikat (nur `admin`) angefordert — entgegen der AH-4-Annahme „nur die
Adresse ändert sich". Nebenwirkungen, live gemessen: 301 des Altnamens tot
(Host fiel in die Wildcard-Site → 404), `ENV_FILE`-Pfad der Ecosystem-Datei
zeigte ins gelöschte Verzeichnis, deploy.yml rsync-te auf den alten Pfad,
und die acme.sh-Automatik hätte das neue Zertifikat später überschrieben.

**Davids Entscheidungen (strukturierte Fragen):** (1) **Die 301 wird NICHT
wiederhergestellt** — der Altname war rein betreiber-intern, Stripe zeigt seit
AH-4 auf `admin`; `control.` antwortet bewusst 404, bleibt reserviert und im
TLS-Wächter. Middleware `00.legacy-console-hosts.ts` + `adminConsole`-Config
entfernt. (2) **Deploy-Kette komplett nachgezogen** — `SITE[control]=admin`,
pm2-Prozess `adminpukalaniapp`, `pm2-heal.sh` räumt den Vorgänger einmalig.
(3) **comments-Site 389772 wird SOFORT gelöscht** statt die 14-Tage-
Beobachtung des F3-Runbooks abzuwarten (5 Tage störungsfrei, Serien-Proben
3/3); Abschnitt 10 des Runbooks war verfrüht abgehakt (Server-`.env` lag noch
da, Runtime-Key antwortete 200, `commentspukalaniapp` lief noch in pm2) und
ist jetzt ehrlich — offen bleiben Davids zwei Klicks: Site-Löschung im Panel,
Key-Widerruf in der Appwrite-Konsole. Details: Nachtrag AH-4b in
docs/runbooks/ADMIN-CUTOVER.md, Korrektur in docs/runbooks/F3-CUTOVER.md.

---

## 2026-08-16 — Drei Audit-Nachfragen (Runde 5/6) entschieden

**Davids Entscheidungen** (strukturierte Fragen, je der Empfehlung gefolgt):
(1) **Medien im Community-Export (U20): Metadaten JA, Binärdateien NEIN.**
`packages/media` bekommt einen Export-Contributor wie events/courses, der
Titel/Untertitel/Alt-Text/`fileId`-Verweis/Layout/Reihenfolge ausgibt — nicht
die Bilddateien. Grund: ein JSON-Export soll Inhalt + Struktur tragen, nicht
Megabytes; ein referenziertes Bild hat so seinen Kontext, die Datei holt man
über die `fileId` aus dem Bucket. (`media_items` trägt keine `userId`, also
kein per-User-GDPR-Thema.) (2) **messages: Block per roher `userId` BLEIBT** —
die Asymmetrie zur handle-only Sende-Route ist inhaltlich begründet: ein Handle
kann sich ändern, die `userId` ist stabil, man blockiert die Person nicht den
Namen; kein Vertraulichkeitsloch. (3) **admin→comments String-Kopplung BLEIBT
dokumentierte Drift** — alle Stellen mandanten-gescopt (kein Isolationsrisiko),
ein expliziter A14-Vertrag brächte keinen funktionalen Gewinn; läuft irgendwann
mit, kein eigener Punkt.

---

## 2026-08-15 — F7 Paid Communities: alle vier Konzept-Entscheidungen gefallen

**Davids Entscheidungen** (strukturierte Fragen; Volltext + Trade-offs:
docs/plans/F7-PAID-COMMUNITIES-KONZEPT.md § 8 — alle vier der Empfehlung
gefolgt): (1) **Der OWNER verkauft** — Stripe Connect, volles Stripe-Dashboard,
direct charges, Provision via `application_fee_percent`; hält D1 ein.
Umsatzsteuerlich sind trotzdem sehr wahrscheinlich WIR die Leistenden (Art. 9a
DVO 282/2011, EuGH C-695/20 „Fenix" — der Checkout in unserer Oberfläche
erfüllt die unwiderlegbaren Tatbestände), die OSS-Registrierung ist damit
eingeplante Betriebsaufgabe, keine Restunsicherheit. Der Dashboard-Typ eines
Connected Accounts ist UNVERÄNDERLICH — diese Entscheidung ist praktisch eine
Einbahnstraße. (2) **V1 verkauft die GANZE Community** (ein Preis, ein
Publikum) — Freemium/Tiers bewusst später, weil ein zweites Lese-Publikum
jede Inhaltsart jedes Produkt-Layers zur Publikumsentscheidung zwingt.
(3) **Erstattung nimmt die Provision anteilig mit zurück, Zugang endet
SOFORT** — der Sofort-Entzug ist Baurbeit (eine Erstattung beendet ein Abo
nicht von selbst). (4) **Verkauf sperrt die Endzustände**: solange zahlende
Mitglieder existieren, sind Stilllegung und Übergabe gesperrt; wer sein
Pukalani-Abo kündigen will, beendet zuerst die Mitglieder-Abos. Offen bleibt
NUR die Anwaltsliste (§ 9, allen voran: greift Art. 9a bei unserer konkreten
Checkout-/AGB-Gestaltung) und der Bau nach A2.

## 2026-08-14 — Reaktionen auch auf Antworten (F57 ist damit komplett)

**Entscheidung (David, 2026-08-13): „Ja, nachbauen."** Die offene Frage aus
dem Reaktions-Zuschnitt vom 2026-08-14 — ob die Emoji-Leiste auch unter die
ANTWORTEN gehört — ist mit Ja beantwortet. Sie stand bis hierher NIRGENDS auf
Platte (OPEN-ITEMS, DECISION-LOG und das Konzept führten sie alle drei noch
als „offene Frage an David"); dieser Eintrag holt das nach.

**Umgesetzt als eigenes Datenmodell im comments-Layer**, nicht über die
vorgesehene `targetType`-Spalte von `discussion_reactions`. Grund: die Tabelle
gehört `posts`, und `comments` steht in jedem `extends` DAVOR — ein Zugriff
von dort wäre die A14-Umkehr, getarnt als blosser Tabellen-Name und damit
durch nichts zu fangen. Gebaut ist deshalb der zweite Weg, den das Konzept
selbst gegen den ersten gestellt hatte: `comment_reactions` (comments-019)
nach dem Muster der Stimmen. **Verworfen:** die gemeinsame Tabelle (A14) und
eine zweite Emoji-Liste im comments-Layer (Doppelpflege — der 8er-Satz und die
👍/❤️-Sperre hätten zwei Orte gehabt).

**Geteilt wird die REGEL, nie das Datenmodell.** Der kuratierte Satz, die
Aggregation, das Umschalten und die Chip-Leiste sind nach `core` gezogen
(`core/shared/reactions.ts`, `CoreReactionBar`); bei den Produkten bleiben
Route, Tabelle und Publikum. Dieselbe Arbeitsteilung wie überall sonst: der
Mechanismus ist gemeinsam, der Einstieg nie. Der Zähler ist bewusst DERSELBE
(`reactionsGiven`, Core-Vertrag) — `first-reaction` bleibt EIN Abzeichen, egal
ob man zuerst an einem Thema oder an einer Antwort reagiert.

**Befund nebenbei (C18):** `discussion_reactions` war seit Mechanik 1 nie beim
Publikums-Umzug angemeldet, obwohl die Datentür die Zeilen mit `read: 'public'`
anlegt. Ein Umschalten auf „nur für Mitglieder" hätte die Beiträge zugemacht
und die Emoji-Zeilen darunter offen gelassen. In beiden Layern nachgetragen.

**Befund nebenbei (Werkzeug):** Nitros Auto-Import ist über alle Layer flach.
Gleichnamige Helfer in `comments` und `posts` liessen die Kommentar-Liste
still die THEMEN-Tabelle lesen — sichtbar nur als `WARN Duplicated imports` in
einem Dev-Log. Produkt-Layer-Helfer heissen seither eindeutig und werden
explizit importiert.

Beweis 35/35, Mechanik-1-Regression 27/27, E2E 24/24, alle sieben Gates.
Damit sind alle vier Mechaniken aus Konzept Teil 4 gebaut und F57 ist
geschlossen (Archiv-Eintrag in OPEN-ITEMS-COMPLETE.md).

---

## 2026-08-14 — F57-Stufen: die Like-Staffel und Campaigner/Champion

**Davids Entscheidungen (bindend):** (1) Das Tages-Limit für Likes **staffelt
mit der Vertrauensstufe**: TL0/TL1 = 50, TL2 = 75, TL3+ = 100. (2)
`Campaigner`/`Champion` werden **konzepttreu** gebaut, also nach der
Katalog-Definition aus § 3.6 — „3 Eingeladene wurden Basic" / „5 wurden
Member" —, nicht als billige Umdeutung auf „3 bzw. 10 angenommene
Einladungen".

**Zur Staffel.** Sie steht als LISTE in der Config
(`pukalani.discussions.likesPerDayByLevel: [50, 50, 75, 100]`, Index = Stufe,
die ernannte Stufe 4 bekommt den letzten Eintrag) und wird an EINER Stelle
gelesen (`likeLimitForLevel` in `core/shared/likeAllowance.ts`). Vier einzelne
Schlüssel wären die Einladung gewesen, einen davon zu setzen und die anderen
drei zu vergessen — der Zustand, in dem eine höhere Stufe stillschweigend
weniger darf. Der frühere Skalar `likesPerDay` ist damit ERSETZT, nicht
ergänzt; abgeschaltet wird weiterhin mit Nullen (`[0,0,0,0]`).

**Was die Staffel gekostet hat, und das ist der lehrreiche Teil:** die Zusage
„der Abzeichen-Tag wird genau EINMAL je Tag gebucht" hing daran, dass das
Limit an einem Tag eine feste Zahl ist. Steigt jemand mitten am Tag auf, ist
sie es nicht mehr — er räumt bei 50 auf, steigt auf TL2 und trifft bei 75 ein
zweites Mal die Gleichheit. Ein Nachmittag hätte zwei „Tage" für
„Out of Love"/„Higher Love" ergeben. Deshalb merkt sich die Zeile jetzt den
gebuchten Tag (`member_counters.likeLimitDay`, posts-021) — die Sicherung
gehört in die Daten, nicht in die Disziplin.

**Zu Campaigner/Champion — der dritte Verleihungs-Pfad.** Das qualifizierende
Ereignis ist der **Stufen-Aufstieg eines ANDEREN Menschen**, Wochen nach der
Einladung, in einer fremden Zähler-Zeile. Verworfen wurden zwei naheliegende
Wege: beim Aufstieg das Control Plane fragen „wer hat den hergeholt?" (eine
Naht über die Projektgrenze, mitten im Schreibpfad, für eine Antwort, die sich
NIE ändert) und die Einladungen des Einladenden durchzählen (N+1 über dieselbe
Grenze). Gebaut ist die billigste Wahrheit: **die Annahme hinterlegt den
Einladenden** an der Zähler-Zeile des Eingeladenen (`invitedBy`, posts-021) —
ein Schreibvorgang, einmal im Leben einer Mitgliedschaft, an der Stelle, die
`invitedBy` ohnehin schon zurückbekommt (sie zählt dort `promoter`). Danach
ist der Aufstiegs-Hook eine reine Runtime-Sache ohne jede Naht.

**Drei Eigenschaften, die man nicht „vereinfachen" darf:** (a) Gezählt wird die
DIFFERENZ `(vorher, nachher]` der ERARBEITETEN Stufe — dadurch zählt ein
Eingeladener je Stufe genau einmal, ohne dass irgendwo nachgesehen werden
müsste. (b) Die **Ernennung zu Stufe 4 meldet nichts**: der Katalog sagt
„wurden Basic/Member", und ein Owner könnte sonst die Abzeichen Dritter
vergeben. (c) `invitedBy` wird nur gesetzt, wenn es LEER ist — die erste
Einladung gewinnt, sonst wäre eine zweite Einladung ein Weg, eine bestehende
Zuordnung umzuschreiben.

**Ehrlicher Preis:** beide Zähler starten für alle bei 0 und werden nie
geeicht (die Zuordnung liegt im Control Plane, die Stufen der Eingeladenen in
deren Zeilen). Wer vor diesem Paket zwanzig Leute hergeholt hat, fängt bei
null an — wie schon bei „Editor" und „Promoter".

**Beweis:** `packages/posts/scripts/verify-trust-perks.mjs` (47/47, echter
Aufstieg über eine zurückdatierte `community_members`-Zeile), Regressionen
`verify-like-limit.mjs` 28/28 und `verify-member-invites.mjs` 42/42 (+2 neue
Prüfungen auf den Stempel).

---

## 2026-08-14 — TS2589: Nitros Routen-Typkarte ist aus

**Davids Ratifizierung** (nach Messung, gegen den ursprünglich vorgesehenen
Weg): Nitros generierte Routen-Typkarte wird per `types:extend`-Hook geleert —
sie war mit Aufrufstellen × Routen für 92 % aller Typ-Instanziierungen
verantwortlich und die Ursache jedes TS2589 (7,5 Mio → 618k, Typecheck
halbiert; 12 neue Routen brachen vorher den Build, 100 Proberouten kosten
jetzt +142). Preis: `$fetch` ohne Typ-Parameter liefert `unknown` — jeder
gebundene Aufruf nennt seinen Antworttyp aus `shared/types/`, ESLint
erzwingt es, der `, string`-Trick ist verboten. Der VORGESEHENE Weg
(explizite Handler-Annotationen) wurde gemessen und verworfen: 1 % Wirkung
bei 268 Handlern Aufwand. Coding-Rule in CLAUDE.md.

## 2026-08-14 — F57-Stellschrauben + Reaktions-Zuschnitt

**Davids Antworten:** (1) Einladungen durch Mitglieder: **5 pro Woche je
Mitglied** (ab Rolle Leser/in), je Community vom Owner abschaltbar,
Config-Wert. (2) Tages-Limit für Likes: **50 pro Tag** (Discourse-Standard —
im Alltag unspürbar, beim Binge-Liken erreicht; speist Out-of-Love).
(3) Themen-Verlinkung mit Rückverweis: **nach** den Mechaniken 2+3 als
eigenes Paket. Reihenfolge damit: Reaktionen (live 2026-08-14) → Einladungen
→ Like-Limit → Verlinkung.

**Reaktions-Zuschnitt (Mechanik 1, umgesetzt):** fester 8er-Satz
(laugh/tada/thinking/eyes/sad/fire/thanks/idea) — BEWUSST ohne 👍/❤️, die
neben dem Aufstimm-Pfeil als zweite Zustimmung gelesen würden
(Badge-Neutralitäts-Regel); gespeichert wird der Schlüssel, nie das Zeichen.
Ziel: Diskussions-THEMEN (die Antworten liegen im comments-Layer — offene
Folge-Frage an David); mehrere Emojis je Nutzer, je Emoji Toggle. Realtime
bewusst optimistisch statt Socket (Andockpunkt dokumentiert).

**Umsetzung der letzten Mechanik (Themen-Verlinkung mit Rückverweis,
2026-08-14):** ein Verweis ist **gewöhnlicher Text** wie `@handle` — der
Markdown-Parser bleibt unangetastet. Er trägt aber die **Row-Id**
(`#<id>-<deko>`) und nicht den Slug, weil der Themen-Slug nirgends gespeichert
ist (er wird bei jedem Aufruf aus Titel und Text abgeleitet), nicht eindeutig
ist und beim Umbenennen vergeht — `#mein-thema` hätte einen Vollscan über alle
Titel je Seitenaufbau gekostet und wäre trotzdem mehrdeutig geblieben. Damit
gilt dieselbe Arbeitsteilung wie in der URL: die Id ist die Wahrheit, die Deko
ist für Menschen. Der **Text bleibt die Wahrheit**, die neue Tabelle
`discussion_links` (posts-020) ist nur der Index für die Gegenrichtung
(„wer zeigt auf mich?") und wird nie gelesen, um zu rendern; beim Bearbeiten
wird sie ersetzt, nicht ergänzt. Sie trägt bewusst **kein `authorId`** — zwei
Row-Ids sind nichts Personenbezogenes, Preis ist ein nie eichbarer Zähler
`linksMade` (das Abzeichen „First Link" zählt ab jetzt). Tote Verweise bleiben
Text und melden nichts.

**Umsetzung Mechanik 3 (Tages-Like-Limit, am selben Tag gebaut):** „Tag" ist
der **UTC-Kalendertag** — nicht die Nutzer-Zeitzone, obwohl `prefs.timezone`
seit U15 existiert: ein Limit, das mit der Zonen-Wahl wandert, schenkt beim
Umstellen ein zweites Kontingent am selben Abend. Die **Rücknahme erstattet
nichts** (sonst wäre das Limit mit zwei Klicks je Like zu umgehen) — genau
deshalb ist der Stand ein VERBRAUCH in `member_counters` (posts-019) und kein
Zählen der heutigen Vote-Zeilen, die beim Zurücknehmen verschwinden.
Downvotes kosten nichts, der Wechsel von Ab- auf Aufstimme schon. Der
Abzeichen-Tag wird am atomaren Hochzählen gebucht, das exakt auf dem Limit
landet (`=== limit`, nicht `>=`) — sonst hieße „an 5 Tagen" nur „fünfmal
dagegengelaufen". Fail-**open** bei Störung: eine irrtümlich verweigerte
Stimme trifft jemanden, der nichts falsch gemacht hat.

**Umsetzung Mechanik 2 (Einladungen, am selben Tag gebaut):** neue Capability
`members.invite` beim `viewer` — bewusst NEBEN `team.manage` statt durch
Absenken, sonst wäre Rollen-Vergabe per Mitglieds-Capability erreichbar. Die
eingeladene Rolle ist IMMER `viewer`, geprüft in der Route. Owner/Admin bleiben
kontingent- UND schalterfrei (die Mechanik fügt ein Recht hinzu, sie beschneidet
keines). Kontingent rollierend über 7 Tage an den ERZEUGTEN Zeilen, verbraucht
mit dem Versand. Der Owner-Schalter hängt an `team.manage`: wer einladen darf,
darf das Einladen nicht abschalten. **Offen geblieben und David vorgelegt:**
Campaigner/Champion — das Konzept definiert sie über die Vertrauensstufe der
EINGELADENEN, das braucht einen eigenen Verleihungs-Pfad; sie ersatzweise an
„3 bzw. 10 angenommene" zu hängen wurde verworfen (das Abzeichen hieße dann
etwas anderes als das Konzept sagt).

## 2026-08-13 — U15-Zuschnitt-Runde + MFA-Folgen

**Davids Antworten (drei Fragerunden):** (1) Navigations-Editor: ausblenden +
umordnen + umbenennen PLUS eigene Links (CMS-Seiten + externe https-URLs).
(2) SEO-Seite: Beschreibung + noindex + Vorschau (kein Sitemap-Bau, og:image
bleibt generiert). (3) Rest-Seiten: BAUEN Weiterleitungen → Zwei-Faktor →
Zeitzone (alle drei am 2026-08-13 live); ABGELEHNT Taxes (automatic_tax
erledigt es) + Bulk-Logs (Audit-Protokolle existieren); GEPARKT mit Bedingung
Bio/öffentl. Profil, API-Tokens, SSO, E-Mail-Settings je Community.
(4) OAuth+MFA (U21): Appwrite nimmt OAuth-Sessions bewusst von MFA aus —
Davids Weg: EHRLICH HINSCHREIBEN (Satz auf der Sicherheits-Karte, de+en),
kein Bau gegen Appwrite. (5) MFA-Notausgang: KEIN Dashboard-Reset — der
Konsolen-Eingriff ist der Weg (Runbook docs/runbooks/MFA-NOTAUSGANG.md);
neu bewertet, wenn Support-Fälle sich häufen.

## 2026-08-12 — Zweite Runde: Export-Zuschnitt, U19-Leser, Trichter-Site

**Davids Antworten** (strukturierte Fragen nach der Krümel-/F47-/U14-Runde):
(1) **U20 Community-Export = Inhalte + Team, OHNE Mitglieder-PII** — Beiträge,
Kommentare, Seiten, Events/Kurse-Struktur als JSON/ZIP; vom Team Name+Rolle,
von gewöhnlichen Mitgliedern nur anonyme Zähler. DSGVO-seitig unkritisch,
deckt den Umzugs-Fall; die volle Mitgliederliste hätte einen AGB-Passus/Anwalt
gebraucht. (2) **U19-Leser = Betreiber-Seite im admin-Dashboard** — Antworten
landen im Control Plane, eine Auswertungs-Seite unter admin.pukalani.app zeigt
Verteilungen; David ist der definierte Empfänger (Bedingung aus der
Wizard-Lektion erfüllt). (3) **Trichter-Messung = Sammel-Site mitbenutzen** —
account.* meldet in `communities.pukalani.app`, der Hostname trennt; die
sieben Trichter-Goals funktionieren damit, sobald David sie in der
Plausible-UI anlegt. Umgesetzt als EIN Zweig in
`packages/analytics/server/api/analytics/config.get.ts` (Kontroll-Host ⇒
`shared`-Id aus der App-Config, weiterhin KEIN Datentür-Zugriff dort).

## 2026-08-12 — Nach der UX-Kette: vier Entscheidungen in einem Rutsch

**Davids Antworten** (strukturierte Fragen nach dem AP10-Abschluss):
(1) **KI-Beschreibungs-Vorschlag bleibt gelöscht** — die 2026-07-24 gebaute
Suggest-Route kehrt NICHT an /dashboard/community zurück; wer eine
Beschreibung will, schreibt sie selbst. (2) **Markt-Signal „hinter dem Aha"
wird gebaut** (gegen die Empfehlung „weg lassen"): eine „Hilf uns, Pukalani zu
schärfen"-Karte im Dashboard NACH den ersten Erfolgen (Benchmark-E5-Muster) —
diesmal MIT definiertem Leser, sonst wiederholt sich der Wizard-Fehler
(erhoben, nie gelesen). Neuer OPEN-ITEMS-Punkt. (3) **Marketing-Copy wird
ehrlich statt gegatet**: „plus Team-Rollen" fliegt aus der Pro-Karte (sie sind
in jedem Plan — ein Personal-Verkaufsargument, kein Pro-Exklusiv), die
/vs-Vergleichszeile wird „Kurse mit Lektionen und Fortschritt — ja (ab Pro)"
statt „inkl. Bezahl-Zugang" (im Pool gibt es keinen Mitglieder-Zahlungsweg).
(4) **Export: Versprechen jetzt senken UND Community-Export einplanen** —
/wechseln sagt ab sofort präzise „Konto-Export heute, gebündelter
Community-Export geplant"; der Export selbst wird ein eigener
OPEN-ITEMS-Punkt (M–L), weil Datenportabilität laut Benchmark der stärkste
K4-Kontrast ist.

## 2026-08-12 — F3 abgenommen: comments zieht in den Pool (AH-6)

**Davids Abnahme** (strukturierte Fragen; zwei Rückfragen — „wieso bleibt
apps/comments?" und „gibts auch apps/courses?" — beantwortet: Produkte sind
LAYER, nie Apps; comments war die eine historische Ausnahme, apps/comments
bleibt als Code das E2E-Fahrzeug + der Studio-Beweis nach dem photos-Muster,
der BETRIEB verschwindet vollständig). Plan: docs/plans/F3-COMMENTS-POOL.md.
Detail-Entscheidungen: (a) **Embed-Gäste: Verlust akzeptiert** — künftig
kommentieren nur Angemeldete, Bestands-Gastkommentare bleiben lesbar.
(b) **Konto-Merge fail-closed**: gleiche Mail = gleiche Person NUR bei
beidseitig bestätigter Adresse; Rest als Einzelfall-Liste an David.
(c) **Cutover-Fenster: direkt nach AH-4**, ohne weiteres Nachfragen;
Wartungs-Mail ohne Link. Die sechs technischen Empfehlungen des Plans sind
mit abgenommen (Einmal-Skript-Anlage, pro ohne Abo, David Owner,
guest_authors nicht migrieren, Standard-Startseite, billing-Testdaten weg).

## 2026-08-11 — Account-Horizont: ein Konto, das überall gilt

**Davids Richtungsentscheidung** (nach der Subdomain-/Architektur-Diskussion;
Appwrite-Faktenlage vorher gegen die Docs geprüft: User sind strikt pro
Projekt, Custom Tokens sind der offizielle Baustein, „ein Konto" heißt „ein
Projekt"): das Ein-Konto-Modell des Pools wird zum sichtbaren Kern der
Plattform ausgebaut. **Diese Punkte stehen VOR allen anderen offenen Punkten**
(AH-1…AH-6 in OPEN-ITEMS; Tiefe in docs/plans/ACCOUNT-HORIZONT.md):
(1) **Echte Projekt-ID-Migration `pool` → `account`** — GEGEN die Empfehlung
„nur Anzeigename" (Appwrite-IDs sind unveränderlich, also Neuanlage +
Migration; Kunden werden einmal abgemeldet). Sachargument dafür: im Early
Access mit einer Handvoll Konten ist es der EINZIGE günstige Moment, und die
Users-API übernimmt Passwort-Hashes offiziell. **Verworfen:** Anzeigename
„Account" mit ID `pool` (die Empfehlung).
(2) **Host-Konsolidierung**: `my.` UND `start.` gehen in `account.pukalani.app`
auf — EIN Cutover zusammen mit (1). URL-Ziel: `/` (Account-Startseite),
`/profile`, `/settings` (inkl. `data` für Export/Löschen), `/communities`,
Wizard; `/profile/activity` + Account-Billing als Phase 2.
(3) **`control.` → `admin.`** (kosmetisch, Kunden sehen ihn nie — bewusste
Namensentscheidung; studio→control-Runbook ist das Muster, Stripe-Webhook
wandert mit).
(4) **master-Werkstatt-Community + demo-Vollausbau** — als normale Pool-
Community mit Rollen, KEIN zweiter Konten-Pool („blueprint" als Name gesperrt,
so heißt der Layer; endgültiger Name offen).
(5) **F3 fest eingeplant** (comments → Pool) als Abschluss — danach zwei
Auth-Welten: account (alle Menschen) + admin (Betreiber); portfolio bleibt
Davids eigenes Silo. **Dazu:** AP1 wird SOFORT deployt (URLs sind env-basiert,
der Host-Umzug später ist eine Env-Zeile + Redirect).

## 2026-08-10 — UX-Planungsrunde: sechs Entscheidungen zu den U-Paketen

**Davids Entscheidungen** (strukturierte Fragen nach den drei Audits vom
2026-08-09; die 88 Befunde wurden zu Arbeitspaketen AP1–AP10 sortiert, vier
Lücken kamen als U16–U18 + C5→U11 dazu):
(1) **Die Einladungscode-Pflicht fürs Gründen bleibt**, bis David sie selbst
abschaltet — und sie bekommt dafür einen **An/Aus-Schalter im
Betreiber-Dashboard** (Teil von U2), damit das Abschalten kein Deploy ist.
**Verworfen:** automatisches Fallen mit dem Stripe-Go-Live (Empfehlung) ·
sofort abschaffen.
(2) **Eigene Domain bleibt Pro-only** (U13 damit erledigt, kein Code).
**Verworfen:** 1 Domain ab Personal, mehrere ab Pro (Audit-Empfehlung E3) ·
unbegrenzt auf allen bezahlten Stufen. Ausgleich: die Pro-Domain wird poliert
(U16) und die Preisseiten-Tabelle führt die Zeile ehrlich (U10).
(3) **Wizard-Pflicht = Name/Adresse · Kategorie · Vibe** (U12, Empfehlung
gewählt) — Größe, Zweck, Ziel, Beschreibung wandern hinter den ersten Erfolg
in die U4-Checkliste. Klargestellt: der **@handle ist NICHT Teil des Wizards**
(er ist eine Konto-Einstellung; optional als Checklisten-Punkt in U4).
(4) **Social-Login: nur Google** — Apple verworfen, weil das Developer-Programm
99 $/Jahr kostet. Umsetzung nach AP1–AP8, mit erklärter Datenschutz-Zeile und
der Circle-Falle (Kunden-Domains) im Design (U14).
(5) **Das deutsche Geld-Wort ist „Plan"** — löst den Widerspruch zwischen
Trichter-G3 (empfahl „Plan") und Dashboard-M4 (empfahl „Abo"): „Abo" bleibt nur
für den Vertragszustand, „Tarif" wird gestrichen (U6).
(6) **U15 (Navigation/SEO-Seiten) und F57 (soziale Mechaniken) bleiben
geparkt**, bis AP1–AP8 durch sind; danach zuerst U15-Navigation bzw.
F57-Reaktionen. **Verworfen:** eines oder beides jetzt einplanen.

**Nachtrag (zweite Runde, gleicher Tag)** — vier Restfragen, je Empfehlung
gewählt:
(7) **U4-Checkliste = Beitrag · Farbwelt · Einladen · Startseite · Abo**
(Benchmark-Satz E1; Ghost-Daten: Branding-Anpasser konvertieren ~10×, der
Abo-Punkt macht die Liste zum Umsatz-Hebel). **Verworfen:** Trichter-G2-Satz
ohne Abo · Variante mit @handle statt Abo.
(8) **Die Landing liest den Tor-Schalter dynamisch** (SSR-gecachter Abruf des
Zustands, Muster wie `/api/platform/products`; unbekannt ⇒ fail-safe die
Einladungs-Variante). **Verworfen:** statische Beide-Zustände-Formulierung ·
statisch mit Text-Deploy beim Umschalten.
(9) **Rolle `viewer` heißt in der Oberfläche „Leser/in"** (en „Reader") —
„Mitglied" bleibt der Sammelbegriff aller Beigetretenen; nur Anzeige-Texte,
der Rollen-Key bleibt (Teil von U6/AP4). **Verworfen:** „Mitglied" als
Rollen-Label behalten.
(10) **AP1 startet sofort** (U18 Messung zuerst, dann U1/U2/U3).
(11) **Der @handle wird KONTO-WEIT** (2026-08-11, bei AH-3 gefragt): eine
Pukalani-ID = ein Handle überall, als eigener Punkt AH-7 nach AH-4/AH-5;
Kollisionsregel: wer zuerst kam, behält. **Verworfen:** je Community
behalten · Hybrid (konto-weit mit Community-Override, komplexeste Variante).

## 2026-08-08 — Die drei WCAG-Hell-Befunde aus F53: zweimal fixen, nie „lassen"

**Davids Entscheidung** (strukturierte Fragen, je Empfehlung gewählt) zu den
drei Hell-Bestandswerten unter AA aus der F53-Kontrastmessung:
(1) **Kicker/Link-Akzent** auf den tone-Flächen (puka-600 #e96c0c, nur
2,43–2,83:1): die Akzent-STUFE zeigt im hellen Scope auf **puka-800** #983912
(5,48–6,38:1) — Spiegelbild der Dark-Verschiebung aus B7, die ~30
`text-primary-600`-Klassen bleiben unverändert. **Verworfen:** Zwischenton
#a3470a außerhalb der Ramp (AA nur knapp, Sonderwert gegen die
Theme-Token-Regel) · puka-700 (verfehlt AA überall knapp) · lassen.
(2) **CTA-Weiß auf der Sonne** (1,81:1, in B7 bewusst belassen): das Label
dreht hell wie dunkel auf **dunkle Tinte** (--puka-ink, 9,34:1; der
Dunkelmodus tat es seit B7 mit 8,4:1) — die Sonnen-Fläche bleibt identisch.
**Verworfen:** Fläche auf puka-700 vertiefen (CTA wäre nicht mehr die
Sonne) · lassen. (3) **Preis-Kleinzeile** `text-toned/70` bei 12,5 px
(3,47:1): auf **/85** (4,90:1) — die PAngV-Zeile darunter (7,13:1) bleibt
bewusst kräftiger, die Hierarchie lebt. **Verworfen:** volles toned
(Abstufung nur noch über Schriftstärke) · lassen. Nebenwirkung, bewusst
mitgenommen: die ~10 `text-primary-600`-Icons und das „−25 %" werden hell
gedeckter. Details: OPEN-ITEMS-COMPLETE.md (F53-Nachtrag).

## 2026-08-09 — Audit-Nachlese: drei Oberflächen-Entscheidungen

**Davids Entscheidungen** (strukturierte Fragen nach dem Session-Audit):
(1) Die **Basic-Karte fliegt aus dem Plan-Raster** des Dashboards — nur noch
Personal und Pro sind wählbar; den Ohne-Abo-Zustand erklärt die „Aktueller
Plan"-Karte (Davids noPlanLabel-Wortlaut bleibt). Gleiche Logik wie die
öffentliche Preisseite. (2) Der **Studio-CTA der Landing führt auf einen
eigenen Kontakt-Abschnitt** (`#kontakt`, Sektion am Seitenende) — v1 als
Mail-CTA mit sichtbarer Adresse, BEWUSST ohne Formular: die Landing-Site hat
kein SMTP (nachgemessen), ein Formular würde still verwerfen (F44-Falle);
andockbar, sobald NUXT_SMTP_* dort liegt. (3) Die **englische Landing sagt
durchgehend „products"** statt „blocks" (E11: EIN Wort; 18 Text-Werte,
JSON-Schlüssel bleiben).

## 2026-08-08 — Stripe-Verwaltung wandert ins Control-Dashboard (F55)

**Davids Entscheidung** (strukturierte Fragen, beim Go-Live-Anlauf): Der
Stripe-Betrieb soll OHNE Terminal gehen — ein Bereich im Control-Dashboard
mit (1) Key-Verwaltung: Secret-Key + Webhook-Secret über maskierte Felder,
**AES-verschlüsselt in der DB** (Entschlüsselungs-Schlüssel bleibt
Server-Env; Laufzeit liest DB-Wert, Fallback Env) — bewusste Kehrtwende zur
Regel „Stripe-Keys nur in der Server-Env", Trade-off benannt: erst DB-Dump
UND Env-Leck zusammen kompromittieren den Key. (2) Preise: die vier
Plan-Preise anzeigen und per Klick bei Stripe anlegen/abgleichen
(lookup_keys fest; Betragsänderung warnt „Landing zieht nicht automatisch
nach"). (3) Webhook per Klick anlegen — das whsec kommt aus der API-Antwort
und wird direkt mitgespeichert; Ereignis-Abgleich gegen die Neun.
(4) Status-Karte: Modus, Steuer-Default, Signatur-Probe, lookup_keys.
**Verworfen:** Key bleibt Env (hätte Davids Kernanliegen halbiert) ·
Nur-Status-Ausbau. Hintergrund: der Terminal-Weg scheiterte praktisch
(Shell-Export-Verwechslung, zsh/bash-read, Key-Fragment im Chat ⇒ Key
rotiert) — der Go-Live läuft nach dem Bau über die neue Seite.

## 2026-08-07 — Fünfte Runde: Kündigung ist gleichgestellt mit nie-gezahlt

**Davids Entscheidung** (strukturierte Frage, beim F49-Bau aufgetaucht): auch
eine GEKÜNDIGTE Community wird zum Periodenende **nur-lesend** (billing-
Sperre), nicht funktionsfähiges Basic. Sonst existierte der Free-Plan durch
die Hintertür (einen Monat Personal zahlen, kündigen, Community für immer
behalten). Der alte Grundsatz „ein gekündigter Kunde ist nie schlechter
gestellt als einer, der nie gezahlt hat" gilt weiter — er zeigt seit F49 nur
in die andere Richtung. Folge im Code: `shouldLiftBillingSuspension` hebt nur
noch bei `billingStatus === 'active'` auf (vorher `!== 'past_due'` — das
hätte die neuen Sperren im nächsten stündlichen Lauf wieder aufgehoben), und
der free-fallback-Zweig SETZT die Sperre statt sie zu räumen (abuse bleibt
immer unangetastet).

## 2026-08-07 — Vierte Runde: Priorisierung und Restfragen ALLER offenen Punkte

**Davids Entscheidungen** (strukturierte Fragen, zwei Blöcke): (1)
**Reihenfolge:** F49 (Pricing-Umbau) zuerst, danach F51+F50 zusammen als EIN
Navigations-Umbau (gleiche Dashboard-Shell). (2) **F49 gilt rückwirkend:**
auch Bestands-Communities mit abgelaufenem Trial (heute Basic) werden
nur-lesend — vor GA billig; Betreiber-angelegte (ohne Trial-Feld, z. B. demo)
fallen ohnehin nicht darunter. Verworfen: Bestandsschutz. (3) **B7:** die
Marketing-Landing bekommt **Dark Mode nachgerüstet** (neuer Punkt F53) —
gegen die Empfehlung „hell lassen"; machbar seit der Nuxt-UI-Migration,
`marketing.css` braucht einen `.dark`-Zweig. (4) **C18-Rest:** NUR
`demo.pukalani.app` wird `audience=public` gestempelt, alle übrigen
Bestands-Communities bleiben unangetastet (kein Sammel-Backfill). (5) **B1:**
Claude legt die Baseline-Unterschiede als Vorher/Nachher-Bildpaare vor,
David sichtet, dann Commit. (6) **F38:** David setzt die Pool-Projekt-Rechte
JETZT in der Console (Migrations-Key: buckets+files read/write;
Laufzeit-Key: files read/write), danach fährt Claude Migration → Deploy →
verify-pool-isolation. (7) **Dein-Teil-Auswahl:** E1 (tote .env.production
löschen) macht David zeitnah; **E3 und E4 wurden bewusst NICHT gewählt** und
bleiben liegen; A1 (Rechtstexte) ebenfalls noch offen. (8) **A2a:** Claude
spielt die 6 Stripe-Testmodus-Proben NACH F49 durch (sonst probt man einen
Ablauf, der sich direkt danach ändert) und schreibt dabei das Runbook aus
der Workspace-Welt neu.

## 2026-08-07 — Community-Settings-Hub: ein Menüpunkt, elf Reiter, zwei Ebenen sauber getrennt

**Davids Entscheidungen** (strukturierte Fragen, dritte Runde): Neuer
Menüpunkt **„Community Settings" unten links** im Dashboard — ALLE
community-bezogenen Einstellungen als Reiter in EINER Hülle: Allgemein ·
Branding (Theme + Custom Fonts, führt die drei heutigen Orte branding/themes/
fonts zusammen) · Members · Domain · Plan · Aktivitätsprotokoll ·
Konfiguration · Produkte · Analytics · Speicher · System. Die Konto-Reiter
(Allgemein/Benachrichtigungen/Sitzungen/Sicherheit) bleiben getrennt beim
Konto. (1) **Ebenen-Frage:** Pool-Owner sehen die **Community-Sicht, wo
sinnvoll** — Speicher = eigener Verbrauch vs. Plan-Kontingent, Produkte = was
der Plan freischaltet (mit Upgrade-CTA), Konfiguration = nur community-eigene
Schalter, **System entfällt im Pool** (Betreiber-Werkzeug); Silo-Apps zeigen
weiter die volle Instanz-Sicht — gleiche Hülle, der bestehende
Ort×Capability-Filter (dashboardNav) entscheidet. Verworfen: Instanz-Sicht
für Pool-Owner (Mandanten-Leck). (2) **Plan-Reiter-Wortlaut** (Davids eigene
Formulierung): während der Testphase „Testphase (Pro) – X Tage übrig",
danach **„Kein Abo – Free Plan"**. Das VERHALTEN bleibt F49 (nur-lesend bis
bezahlt) — der Reiter muss die Nur-lesen-Folge neben dem Label sichtbar
machen, damit „Free" keinen funktionsfähigen Gratis-Plan verspricht.
Technische Basis existiert: Registry `pukalani.admin.settingsTabs` + Hülle
nach dem Muster von `/dashboard/settings` (F24).

## 2026-08-07 — Konto-Modell bestätigt, Community-Switcher kommt, Karte-vor-Wizard verworfen

**Davids Entscheidungen** (strukturierte Fragen, zweite Runde am selben Tag):
(1) **Zahlung bleibt wie morgens entschieden** — Wizard zuerst, 14-Tage-Trial
OHNE Karte, danach nur-lesend bis bezahlt (F49). **Verworfen:** Karte/Checkout
VOR dem Wizard (auch die Stripe-geführte Trial-Variante mit Karte-Pflicht) —
niedrigste Einstiegshürde schlägt Kaufquote. (2) **Community-Switcher oben
links im Dashboard** (TeamsMenu-Muster wie im Nuxt-UI-Dashboard): zeigt **alle
Communities mit Dashboard-Zugang** (eigene + Team-Rollen admin/moderator/
editor), Wechsel navigiert auf `<host>/dashboard`; dazu „Create Community"
(→ Wizard) und „Manage Communities" (→ my.pukalani.app). **Bestätigt, kein
Umbau:** EIN Konto für den ganzen Pool existiert schon (ein Appwrite-Projekt);
Registrierung „auf www" = Link der kontenlosen Landing auf my.pukalani.app;
„erst joinen, dann mitmachen" ist das A5-Modell (erster Beitrag = Beitritt).
Bekannte Grenze: auf eigenen Domains/Silos teilt der Browser das Cookie nicht —
gleiches Konto, dort einmal neu einloggen.

## 2026-08-07 — Pricing-Konzept: das Konto ist kein Plan, Testphase endet nur-lesend

**Davids Entscheidungen** (strukturierte Fragen): (1) **Nach der 14-Tage-
Testphase ohne Abo wird die Community NUR-LESEND** — über die vorhandene
M13-`'billing'`-Sperre statt des bisherigen dauerhaften Basic-Downgrades
(trialSweep). Eine eigene Community setzt damit faktisch Personal voraus;
das Wizard-Versprechen „nichts wird gesperrt" wird umformuliert (vor GA
billig, danach teuer). Inhalte bleiben, nichts wird gelöscht (F3-Grundsatz
unangetastet). `basic` bleibt als Plan-Key im Code (Fallback, Quota-Anker).
(2) **Preisseite www.pukalani.app zeigt NUR Personal + Pro** — das kostenlose
Mitmachen (Konto: kommentieren, beitreten, melden) ist kein Paket und steht
nicht als dritte Spalte dort, sondern woanders (FAQ/Feature-Seite).
**Verworfen:** Plan ans KONTO heften (Plan bleibt Community-Eigenschaft —
Multi-Community, Stripe-Webhook, Quota und M13 rechnen alle pro Community) ·
Freemium-Basic weiter bewerben. **Hintergrund:** der von David vermutete
Zwang „erst Stripe-Paket buchen, dann loslegen" bestand nie — der Ablauf ist
schon registrieren → Dashboard → Wizard ohne Zahlungsdaten; korrigiert wird
die Präsentation und das Trial-Ende, nicht die Architektur.

## 2026-08-04 — Private Nachrichten: alle sieben Konzept-Entscheidungen

**Davids Entscheidungen** (strukturierte Fragen; Volltext:
PRIVATE-NACHRICHTEN-KONZEPT.md § 8): 1. Nachrichten leben **je Community**
(Datentür/Moderation/TL-Gate/Host — kontoweit hätte vier Grundpfeiler neu
erfunden) · 2. Moderation sieht **nur die gemeldete Nachricht** als
Snapshot · 3. Sperre **je Community + Häkchen „überall"** · 4. Owner-Schalter
**Default AUS** (Owner öffnet den Kanal bewusst) · 5. Aufbewahrung
**unbegrenzt + selbst entfernbar** (Frist wäre Datenverlust, kein
Datenschutz) · 6. **Datenmodell n:m-fähig, gebaut wird v1 nur 1:1**
(Gruppen = TL2-Recht, kommen ohne Migration) · 7. Tarif **ab Personal, wie
posts** (PN hängen an den Vertrauensstufen aus member_counters). Konzept
damit entscheidungskomplett; Bau wartet auf Go.

## 2026-08-04 — Trust Levels: Schwellen „Mittel" + v1-Rechte

**Davids Entscheidungen** (strukturierte Fragen, Teilpaket 3): **Schwellen
„Mittel"** — TL1 Basic: 2 Tage dabei + 1 eigener Inhalt + 1 vergebenes
Upvote · TL2 Member: 15 Tage + 5 Inhalte + 10 vergeben + 5 erhalten ·
TL3 Regular: 60 Tage + 25 Inhalte + 50 vergeben + 25 erhalten · TL4 Leader
nur von Hand. **v1-Rechte:** TL3 darf fremde Themen umbenennen und
umkategorisieren; TL4 bekommt anheften/schließen/gelöst + fremde Beiträge
bearbeiten; TL1/TL2 sind v1 sichtbarer Status + Abzeichen (ihre
Katalog-Rechte kommen automatisch mit PN/Einladungen/Tages-Likes). Kein
Abstieg; Besuchs-/Lese-Tracking bleibt draußen (Teil 4).

## 2026-08-04 — Gemeinsames Paket: TL-Architektur, Aufstieg, Mehrfach-Verleihung

**Davids Entscheidungen** (strukturierte Fragen; Volltext:
docs/archiv/DISCUSSIONS-KONZEPT.md Teil 5): (1) **Trust Levels speisen das
bestehende RBAC** — Stufe aus Zählern berechnet, Capabilities vergibt der vorhandene Resolver; ein paralleles
TL-Prüfsystem ist abgelehnt (das „eigene Ja" aus § 3.6). (2) **TL1–TL3
automatisch** über Schwellen, **TL4 nur von Hand**, kein Abstieg. (3)
**Mehrfach-Verleihung für ALLE sinnvoll zählbaren Abzeichen** — bewusst gegen
die Empfehlung (nur Posting-Gruppe) und als Revision der Stufe-4-Regel „genau
einmal": auch der Jahrestag kommt jährlich neu.

## 2026-08-04 — Stufe 4: Badge-Zuschnitt, Tracking abgelehnt, vier soziale Mechaniken

**Davids Entscheidungen** (Volltext: docs/archiv/DISCUSSIONS-KONZEPT.md
Teil 4): Stufe 4
baut **nur heute messbare Badges** · das **Tracking-Bündel entfällt dauerhaft**
(Lese-Fortschritt, Besuchs-Streaks, Klick-Zählung — Widerspruch zu
„Datenschutz-nativ"; kostet 9 Badges) · Schreib-Werkzeuge **Zitieren,
Emoji-Auswahl, Themen-Rückverweise**, **kein Onebox** (SSRF) · **alle vier**
sozialen Mechaniken: Mitglieder-Einladungen, Tages-Like-Limit,
Emoji-Reaktionen, private Nachrichten. Bei den Reaktionen hatte ich abgeraten
(drittes Signal); Entscheidung steht, deshalb die Folgeregel: **Badges zählen
weiter nur Upvotes**, Reaktionen sind badge-neutral. **Private Nachrichten
bekommen ein eigenes Konzept** vor dem Bau.

**Davids Vorgabe zum Editor:** Editor-Funktionen ausschließlich über die
Nuxt-UI-Bausteine (`UEditor` inkl. Blockquote, `UEditorToolbar`,
`UEditorEmojiMenu`, `UEditorMentionMenu`, `UEditorSuggestionMenu`,
`UEditorDragHandle`) — nichts selbst bauen. Steht jetzt in CLAUDE.md.

---

## 2026-08-04 — Zwei Stufe-2-Nachfragen (Team-Liste, Seitenleiste)

**Davids Entscheidungen** (je der Empfehlung gefolgt): **Team-Liste redigiert
öffnen** — neuer `view`-Parameter an der Control-Naht, nur Rollen
owner/admin/moderator, Name + Avatar, E-Mail LEER; damit zeigt die
About-Seite jedem, wer die Community führt, ohne Adressen preiszugeben.
**Seitenleisten-Hälfte „kommentiert" in Stufe 3** — als fünfter Core-Vertrag
in der Bauart des Aktivitäts-Vertrags; bis dahin zählt „gepostet" sichtbar,
nicht gefaked. Beides Teil des Stufe-3-Zuschnitts.

---

## 2026-08-04 — Vier Folge-Entscheidungen (Landing-URL, Stufe 2, ci.env, portfolio)

**Davids Entscheidungen** (strukturierte Frage-Runde, je der Empfehlung
gefolgt): **Landing-URL zieht um** — der Kommentar-Baustein liegt jetzt unter
`/products/comments` bzw. `/de/produkte/kommentare`, beide Altpfade (auch
`/products/discussions`) 301 DIREKT dorthin, keine Ketten; der interne Key
bleibt `diskussionen` (Label ≠ Key). Grund ist Namensraum, nicht SEO: das
echte Discussions-Produkt braucht `/products/discussions` später selbst.
**Discussions Stufe 2** (Views, About, Guidelines) schließt direkt an — läuft
parallel zu A1/A2, die bei David liegen. **`ci/appwrite/ci.env`** verliert den
Klartext-Schlüssel; `_APP_OPENSSL_KEY_V1` wird je CI-Lauf erzeugt (Repo ist
öffentlich). **portfolios verwaiste Tabellen bleiben liegen** bis F3
entscheidet — Löschen wäre unumkehrbar ohne aktuellen Nutzen.

---

## 2026-08-03 — Discussions: alle sieben Konzept-Entscheidungen gefallen

**Davids Entscheidungen** (je der Empfehlung gefolgt; Volltext + Begründungen:
docs/archiv/DISCUSSIONS-KONZEPT.md § 3.8): **Weg B** (Kategorie als Dimension
von `posts`, kein eigener Layer) · kategorisierte Beiträge **bleiben im Feed**
· Produktname **Discussions**, der Landing-Kommentar-Baustein wird zu
„Kommentare" · **Like = Upvote** (Downvotes bleiben, badge-neutral) · **Trust
Levels später** (eigener Entwurf nach Stufe 1–4) · Regelwerk **nur Guidelines
jetzt** (ToS/Privacy je Community erst nach Anwalts-Klärung, hängt an A1) ·
Seitenleiste = **meine letzten 5 Kategorien** mit Rückfall auf die größten.

Verworfen u. a.: eigener Layer (doppelte Härtung), Herz neben den Stimmen
(zwei Signale am selben Beitrag), Trust Levels von Anfang an (größtes Stück
zuerst). Das Konzept ist damit entscheidungskomplett; es wartet nur noch auf
das Ende des Feature-Stopps.

---

## 2026-08-03 — Zwei Nicht-Aufgaben aus der offenen Liste geholt

**Davids Entscheidungen, unverändert gültig** — sie standen bisher unter
„Geparkt / wartet" in OPEN-ITEMS.md und warteten dort auf „nichts, bewusst so".
Das ließ die Liste länger aussehen, als Arbeit da war:

- **Der öffentliche Changelog antwortet auf Community-Hosts mit 404** (N7). So
  gewollt: der Changelog ist BETREIBER-Inhalt und hat auf einem Mandanten-Host
  nichts zu suchen. Durchgesetzt an beiden Enden — Seite über
  `useIsTenantHost()`, Route über `useTenant(event)`; die Chrome-Registry
  versteckt zusätzlich die Links. Kontroll-Hosts und Silo-Apps sind unberührt.
- **Die Demo-Community ist bei Google auffindbar.** So gewollt: sie ist das
  Schaufenster, kein Testsystem.

Beide bleiben in Kraft — nur der Ort stimmt jetzt. Eine Liste offener Punkte
führt, was noch zu tun ist; was entschieden ist, steht hier.

---

## 2026-08-02 — F8: Abrechnungsdaten überleben die Kontolöschung

**Davids Entscheidung.** Löscht der (letzte) Owner sein Konto, bleiben
`communities.stripeCustomerId` und `billingStatus` OHNE Löschfrist stehen.
Grund: kaufmännische Aufbewahrungspflicht (§147 AO / §257 HGB), und
Art. 17 Abs. 3 lit. b DSGVO nimmt gesetzliche Aufbewahrung ausdrücklich vom
Löschrecht aus. Der Personenbezug ist durch die F3-Kette bereits versorgt
(Mitgliedschaft entpersonalisiert, Einladungen/Anfragen gelöscht) — was
bleibt, ist der Zahlungs-Verweis auf Stripe. Verworfene Alternative: eine
eigene Löschfrist hätte genau die Belege gekappt, die bei einer Prüfung
vorzulegen sind. NICHT mitentschieden: die Löschfrist für
`abuse_reports.reporterEmail` (Melder ohne Konto) — bleibt als F8-Rest offen.

**Nachtrag vom selben Tag — F8-Rest ist entschieden:** die Melder-Adresse
verfällt nach **90 Tagen ab der Meldung** (`$createdAt`), unabhängig vom
Status; die ZEILE bleibt, nur das Feld wird geleert. Anker ist bewusst die
Meldung und nicht die Bearbeitung (`handledAt`): sonst hinge die Frist an der
Warteschlangen-Disziplin des Betreibers, und eine lange liegengebliebene
Meldung hielte die Adresse beliebig lange fest. Die Zeile bleibt, weil sie der
Beleg für eine womöglich verhängte Sperre ist. Umgesetzt als vierter Mitfahrer
im stündlichen `trial-sweep` des Control Plane
(`packages/control/server/utils/abuseReportPrune.ts`) — Melder ohne Konto
erreicht kein GDPR-Contributor, deshalb braucht diese eine Spalte einen
eigenen Sweep.

## 2026-07-31 — C16: „Community löschen" heißt Stilllegen, nicht Vernichten

**Ausgangslage:** `community.delete` stand seit G1 in der Owner-Rolle und hatte
kein Ziel. Am 2026-07-29 war das eine bewusste Entscheidung (Davids
Entscheidung 3: „später — ein unumkehrbares Löschen braucht erst eine
Wiederherstellungs-Frist"). Mit C16 hat David den Punkt selbst wieder
eingereiht.

**Der Schnitt, mit dem der alte Einwand aufgelöst ist:**

> **Löschen = `communities.status` auf `disabled` + jede Mitgliedschaft auf
> `removed` + Community-Labels einziehen. INHALTE BLEIBEN.**

Der Host antwortet danach binnen ≤30 s (Resolver-Cache) mit 404, niemand hat
mehr Zugang — aber keine einzige Zeile wird gelöscht. Drei Gründe:

1. **F3-Grundsatz „nie destruktiv".** Ein Hard-Delete ohne Frist ist
   Datenverlust auf einen Klick. Genau daran ist die Entscheidung vom
   2026-07-29 gescheitert.
2. **Es gibt schon einen Löschpfad**, und er ist geprüft: die DSGVO-Kette
   (`deleteUserCompletely`, Contributor-Registry). Ein zweiter daneben wäre
   eine zweite Stelle, an der etwas übrig bleibt.
3. **Die Inhalte gehören nicht nur dem Owner** — an Threads hängen die
   Beiträge anderer Mitglieder.

**Zwei Sperren, beide mit Grund** (pure Regel `decideCommunityDeletion`,
`packages/control/shared/communityTeam.ts`, 4 Tests):

- **Laufendes Abo ⇒ 409 `subscription_active`.** Stilllegen kündigt bei Stripe
  NICHTS; die Rechnung liefe weiter für etwas, das niemand mehr sehen kann.
  Erst kündigen, dann löschen. Die Rechnung „läuft ein Abo?" teilt sich jetzt
  eine Funktion mit der Übergabe-Sperre (`hasLiveSubscription`) — vorher stand
  sie inline, und `past_due` (laufender Vertrag mit offener Forderung!) wäre in
  der zweiten Kopie leicht vergessen worden.
- **Schon stillgelegt ⇒ 409 `already_disabled`**, bewusst kein stiller Erfolg.

**Was bewusst NICHT gebaut ist:** echtes Hard-Delete (Rows weg, Bucket leer,
Projekt weg) und das Freigeben des Hostnamens. Der Slug bleibt vergeben, sonst
könnte ihn morgen jemand anders registrieren und alte Links zeigten auf eine
fremde Community. Ein Hard-Delete wäre Davids FOLGE-Entscheidung und braucht
einen eigenen Plan (Frist, Export, Reihenfolge über zwei Projekte hinweg).

**Aufbau wie bei „Zugang entziehen" (A5): zwei Schritte, zwei Projekte.** Das
Control Plane nimmt Status und Rollen (seine Tabellen), die Runtime nimmt das
Lese-Publikum (Labels leben im Pool-Projekt, das Control Plane hat dafür keinen
Schlüssel). Ohne den zweiten Schritt wäre die Community offline, ihre
`read(label:…)`-Zeilen aber weiterhin für jedes ehemalige Mitglied lesbar.

---

## 2026-07-30 — C18: Sichtbarkeit je Community, und die Kehrtwende zu G0-7

**Davids Entscheidung:** die Sichtbarkeit einer Community ist **wählbar**, und
**neue Communities entstehen ÖFFENTLICH**. Das dreht die G0-Entscheidung 7 vom
2026-07-24 („privat als Default, öffentlich opt-in") um. Grund: eine frische
Community, die niemand finden kann, wächst nicht — der Wizard verspricht
Wachstum, und der Startzustand hat dagegen gearbeitet. „Nur für Mitglieder"
bleibt vollwertig, ist aber die bewusste Ausnahme.

**Was daran NICHT gedreht wurde**, und das ist der Teil, der die Entscheidung
tragfähig macht:

- Die Spalte wird weiter **fail-closed** gelesen (`resolveTenantAudience`):
  eine Row ohne Eintrag gilt als privat. Der neue Default gilt beim ANLEGEN,
  nicht beim Lesen — Bestand wird nicht stillschweigend aufgemacht.
- `read(Role.label(communityId))` bleibt die harte Grenze (Naht 4). Neu ist,
  dass `tenantReadRolesFor` die WAHL DER COMMUNITY über die ABSICHT DER ZEILE
  stellt: aus `read: 'public'` wird auf einer geschlossenen Community das
  Mitglieder-Publikum. Umgekehrt NIE — eine offene Community macht
  mitglieder-interne Zeilen (Activity, Presence, Benachrichtigungen) nicht auf.

**Der Schalter ist nicht nur ein Feld** — die vier Dinge, die mitziehen, sind
der eigentliche Umfang von C18:

1. **Der Bestand.** `audienceRepermission.ts` (core) zieht die schon
   geschriebenen Zeilen um, `read(any)` ⇄ `read(label:<id>)`, seitenweise,
   idempotent, protokolliert und damit wiederaufnehmbar. Die pure Regel liest
   „veröffentlicht" am BESTEHENDEN Permission-Array ab statt den Status neu
   auszuwerten — deshalb kann sie nichts aufmachen, was zu war (Entwürfe,
   ausgeblendete Kommentare). Welche Tabellen mitziehen, melden die Layer per
   Nitro-Plugin an (Muster `registerUserDataContributor`).
2. **Die Suchmaschinen.** `noindex, nofollow` im zentralen Kopf-Aufruf,
   `Disallow: /` in robots.txt, 404 auf sitemap.xml und auf `/og/<key>.png`.
   Der Hinweistext im Dashboard sagt ausdrücklich, dass Google Tage bis Wochen
   braucht — ein Versprechen, das wir nicht halten können, wird nicht gegeben.
3. **`pages`.** Deren Zeilen tragen bewusst KEINE Permissions; öffentlich macht
   sie eine Route mit der Operator-Türklinke. Dort gibt es nichts umzuziehen,
   also steht da eine eigene Wache (`assertCommunityContentReadable`). Ohne sie
   wäre die Startseite einer geschlossenen Community weiter für jeden lesbar.
4. **Der Bestand VOR C18.** Bis heute hat die Spalte NICHTS gesteuert: die
   Zeilen der Alt-Communities tragen `read(any)`, ihre Seiten sind im Index —
   sie sind de facto öffentlich, und nur ihr Eintrag (`null`) sagt etwas
   anderes. Mit dem Deploy fängt der Eintrag an zu wirken. **Wer öffentlich
   bleiben soll, braucht einmal den Stempel**
   (`packages/control/scripts/stamp-audience.mjs`, Einzelvorgang mit
   Trockenlauf) — allen voran `demo.pukalani.app`. Bewusst KEIN Backfill-Sweep:
   „alle auf öffentlich" wäre genau die stillschweigende Entscheidung über
   fremde Communities, die die fail-closed-Regel verhindern soll.

Beweis: `packages/control/scripts/verify-audience-flip.mjs` (Gast-Client ohne
Key gegen die echte Instanz, beide Richtungen, Bestand eingeschlossen).

---

## 2026-07-23 (Fragerunde) — Entscheidungen für die offenen Blöcke

David hat per Fragerunde alle offenen Design-/Freigabe-Punkte beantwortet
(autonome Umsetzung freigegeben). Reihenfolge der Abarbeitung: **Key-Tausch →
Quota → Homepage → E4**, danach Themes-Vollausbau.

- **Read-only-Control-Plane-Key**: Tausch freigegeben (mit Vorab-curl-Test +
  altem Key als Rollback). **BEFUND/BLOCKER:** die Key-ERSTELLUNG braucht
  Console-Rechte im `studio`-Projekt (Team „Pukalani App"), OTP-gebunden = David.
  Die einzige lingernde Console-Session gehört `provisioner@pukalani.app` —
  ein Account, der laut Cleanup (Task #69, `session-handover-2026-07-16`)
  gelöscht sein sollte. Bewusst NICHT für eine Prod-Sicherheitsoperation
  genutzt (Gegenteil von least-privilege; Session gehört ohnehin entfernt).
  → Runbook für David in [PLATFORM-CONTROL-KEY-SWAP.md](runbooks/PLATFORM-CONTROL-KEY-SWAP.md);
  **zusätzlich: verwaisten Provisioner-Account/Session prüfen + löschen.**
- **Quota-Zahlen**: Plan-Staffelung übernommen — free 200/Tag + 5.000 gesamt ·
  pro 1.000/Tag + 50.000 · business 5.000/Tag + 250.000; Silo ohne Limit. Ich
  verdrahte Plan→Limit (die assertPoolWriteQuota-Mechanik steht seit H3-4.3).
- **Tenant-Homepage** (pro Tenant konfigurierbar, „pro Tenant"): MVP =
  CMS-Markdown (sicheres Subset, KEIN Roh-HTML) + optional EIN einbettbarer
  Kommentar-Block; EINE Sprache Pflicht (weitere optional); Tenant-Theme wird
  geerbt; Silo nutzt dasselbe pages-Muster. Konzept:
  [PLATFORM-TENANT-HOMEPAGE.md](archiv/PLATFORM-TENANT-HOMEPAGE.md).
- **Embed E4**: alle drei bauen, Reihenfolge Presence → Gast → Web-Component.
  **Gast-Kommentare**: Name+E-Mail OHNE Verifikation (Disqus-Gastmodus,
  niedrigste Hürde), Spam über Auto-Hide + Rate-Limit + Honeypot.
- **Themes-Vollausbau E1–E7** (alle Plan-Empfehlungen bestätigt): E1 Default
  zählt NICHT (26 echte neue Farbwelten) · E2 11 = Basis+10 · E3 Neutral bleibt
  separate Achse · E4 Hue-Raster (26×~13,8°) als Startpunkt, dann kuratieren+
  benennen · E5 Themes rein farblich (Fonts/Radius = Backlog) · E6 committete
  `.gen.ts` + CI-„Output aktuell"-Check · E7 Grid-Modal-Picker (Dropdown mit
  26×11 unbedienbar). Umsetzung: [THEMES-VOLLAUSBAU.md](archiv/THEMES-VOLLAUSBAU.md).
- **Aufräumer**: Hetzner-Rescale-Thema geschlossen (CI-Build-Deploy → CX23
  reicht, Server baut nichts). Themes-Vollausbau rückt nach vorn.

## 2026-07-22 (3) — apps/platform: der Multi-Tenant-Beweis end-to-end

Die erste echte Multi-Tenant-App (aus apps/_template, Features themes/admin/
comments/moderation): `pukalani.tenancy` AN, Resolver = createTenantsTableResolver
gegen das Control Plane (NUXT_PLATFORM_CONTROL_*, eigener read-only-Key;
ohne Env → dokumentiert fail-open + Warnung, CI-Build-sicher). Port 3006.

**Lokaler E2E-Beweis** (ein Dev-Server, EIN Pool-Projekt, tenants-Register im
lokalen studio): kunde-a.localhost sieht NUR den A-Kommentar, kunde-b NUR den
B-Kommentar (auch im Cache-Hit-Pfad), fremd.localhost → 404, SSR 200.

**Echter Fund des E2E (der Grund, warum man so testet):** der GAST-MICROCACHE
der Kommentar-Liste keyte ohne Tenant — Kunde A füllte den Cache, Kunde B bekam
Kunde-A-Inhalt (Cross-Tenant-Leak). Fix: tenantId im Cache-Key (Single-Tenant:
konstantes Präfix, Verhalten unverändert). **Lehre für die Fläche: JEDER
Microcache, der auf der Platform-App lebt, braucht den Tenant im Key** — als
Nächstes betrifft das den admin-changelogCache (notiert in OPEN-ITEMS #4).

**Prod-Rollout (braucht David):** (a) Wildcard-DNS `*.pukalani.app` (oder
eigene Kundendomains via CNAME), (b) ploi-Site für platform + Deploy-Kette,
(c) echtes Pool-Appwrite-Projekt (Migrationen comments+moderation+system) +
Control-Plane-read-only-Key. Bis dahin lebt die App nur lokal/CI.

---

## 2026-07-22 (2) — H3 Naht 1/2: Tenant-Auflösung produktiv (ruhend)

Nach Etappe 4.1 (Pool-Datenpfad) die Auflösungs-Schicht, exakt nach Blueprint:

- **Naht 1:** `core/server/middleware/00.tenant.ts` (läuft vor auth.ts) —
  Config-Gate `pukalani.tenancy.enabled` (Core-Default AUS → No-Op, heutiger
  Betrieb ungeändert). Aktiv gilt die Spike-Semantik: bekannter Host →
  `event.context.tenant`; unbekannter Host → 404 (keine Default-Site);
  Resolver-Fehler → 500 (fail-loud, NIE still ins Default-Projekt).
  Auflösungsquelle ist ein von der App registrierter **Resolver-Vertrag**
  (`registerTenantResolver`, A14: core kennt keine tenants-Tabelle — die
  kommt mit der Platform-App, gecacht via createMicrocache).
- **Naht 2:** `resolvedProjectId()` in den Client-Factories + Cookie-Name —
  Tenant-Projekt vor .env-Projekt, ohne Tenant exakt wie bisher.
  **Bewusste Grenze:** dynamischer Silo-ADMIN-Zugriff (fremdes Projekt →
  fremder Key) wirft 501 statt mit dem falschen Key 401-Salat zu produzieren;
  die Key-Registry ist eine spätere Etappe. Pool (gleiches Projekt) läuft.
- Beweise: normalizeHost pure-getestet (Ports/IPv6/FQDN), core 104 Tests grün,
  studio-E2E 10/10 mit aktiver-aber-ruhender Middleware. Der SCHARF-Beweis
  (Gate an + echter Resolver) kommt naturgemäß mit der Platform-App, die den
  Resolver registriert — die Semantik selbst ist im Spike s5 bewiesen.

---

## 2026-07-22 — Abarbeitung Master-To-do (#7, #12, #3 komplett)

David gab Freigabe, alle offenen Punkte nacheinander umzusetzen (Blockierte
überspringen). Stripe ist noch NICHT live → der sichere Moment für die
Money-Path-Umbauten.

- **#7 Deploy-RAM — ERLEDIGT (server-seitig).** App-Server hatte bereits
  4,7 GB Swap (seit 18.07.), der 21.07.-Incident war also Swap-Thrashing.
  Fix: `NODE_OPTIONS=--max-old-space-size=2560` im Kopf der ploi-User-
  `~/.bashrc` (VOR dem PS1-Guard — ploi-Deploys laufen als ssh→bash und lesen
  genau diesen Kopf; pm2-Laufzeit via cron-resurrect bleibt unberührt).
  Verifiziert: ssh-Kommando zeigt 2752-MB-Heap-Limit. Backup:
  `~/.bashrc.bak-node-options`.
- **#12 Demo-Passwörter — GEGENSTANDSLOS (verifiziert).** Alle 3 Prod-
  Instanzen haben KEINE @demo.local-User (nur Davids Konten, Betreiber
  passwortlos/OTP). Die Seed-Demo-User mit Repo-Passwort existieren nur
  lokal/CI — dort ist das bekannte Passwort gewollt.
- **#3.1 (#6b) Cross-Sub VOLLSTÄNDIG — GEFIXT (Stripe als Autorität).**
  Statt Einzel-Abo-Zwangskündigung (destruktiv, verworfen): der free-Fallback
  fragt jetzt DIREKT bei Stripe nach, ob für den Workspace ein anderes
  lebendes Abo existiert (`listCustomerSubscriptionSummaries`, billing;
  injizierter `hasOtherActiveSubscription`-Vertrag, A14 via App-Plugin).
  Damit ist die apply-plan-Rebind-Lücke des Teilfixes egal — die lokale
  stripeSubscriptionId ist nur noch Vorfilter, Stripe entscheidet. Fehlerpfade
  jetzt konsistent: transiente Fehler WERFEN (Webhook 500 → Stripe retryt),
  404-Workspace = legitimer Skip; das frühere stille return hätte den Retry
  verhindert.
- **#3.2 (#7a) Owner-Portal-Mismatch — GEFIXT (Workspace-Customer).** Beide
  Workspace-Checkouts (Betreiber + Owner) binden ans neue
  `ensureWorkspaceCustomer` (App-Utility, `createStandaloneCustomer` aus
  billing, Race-Dedupe nach B11-Muster, Id auf der workspace-Row). Das
  Owner-Portal öffnet `workspace.stripeCustomerId` statt des userId-Lookups —
  kein 404 mehr nach Betreiber-Checkout, und kein Daten-Leak (jeder Workspace
  hat seinen eigenen Customer). App-eigene Abos (billing-Layer) bleiben
  user-gebunden, unverändert.

---

## 2026-07-21 (Tag 2) — Money-Path-Härtung Runde 3 (vor Stripe-Live)

Abarbeitung der offenen Analyse-Funde (unten), soweit ohne Live-Billing-Risiko
autonom machbar:

- **HOCH Cross-Sub-Kannibalisierung — TEILWEISE gehärtet, Restrisiko OFFEN.**
  Migration control-009 gibt `workspaces.stripeSubscriptionId`; der Handler
  speichert bei `apply-plan` die maßgebliche Sub und degradiert bei
  `subscription.deleted` nur, wenn die gekündigte Sub die hinterlegte ist
  (pure `shouldApplyFreeFallback`, unit-getestet, + fail-CLOSED bei Lesefehler).
  Das schließt den häufigen Fall (altes Abo sofort gekündigt, neues gilt).
  **Nicht vollständig** (adversariales Re-Audit, 2026-07-21): der APPLY-Pfad
  überschreibt `stripeSubscriptionId` bedingungslos (last-writer-wins). Bei
  ZWEI koexistierenden aktiven Abos rebindet ein Zwischen-`active`-Event des
  cancel-at-period-end-Abos den Speicher aufs alte Abo → beim späteren
  `deleted` fällt der Workspace auf free, obwohl das zweite Abo zahlt. Auch der
  umgekehrte Fall (das gespeicherte Abo wird gekündigt, ein älteres bleibt
  aktiv) degradiert falsch. **Vollständiger Fix (offen, braucht David — Live-
  Billing):** Einzel-Abo-Invariante durchsetzen (bei `apply-plan` andere
  aktive Workspace-Abos via Stripe kündigen) ODER free-Fallback nur, wenn
  KEIN weiteres aktives Abo des Workspace existiert (Query gegen die billing-
  `subscriptions` — braucht einen billing-Vertrag, A14). Die Vorbedingung
  (zwei aktive Abos) entsteht nur über eine Checkout-Race gegen den noch nicht
  angewandten Webhook — der `isPaidPlanKey`-Doppelabo-Guard ist check-then-act.
- **LOW Duplicate-Import `BillingInterval` — GEFIXT.** studio-Typ zu
  `WorkspaceBillingInterval` umbenannt (A14: studio bleibt vom billing-Layer
  entkoppelt, eigener Name statt Cross-Layer-Import) — Nuxt-Warnung weg.
- **LOW stille Truncation Plan-Sync — GEFIXT.** `applyWorkspacePlan` paginiert
  jetzt ALLE Sites eines Workspace (statt `Query.limit(100)`), damit ein
  Abo-Update nie still nur die ersten 100 Sites grantet.
- **MITTEL Owner-Portal-Mismatch — BEWUSST OFFEN (braucht Davids Freigabe).**
  Der saubere Fix ändert, an WELCHEN Stripe-Customer ein Live-Abo gebunden
  wird (Owner- statt Betreiber-scoped). Nicht autonom auf dem Money-Path
  geändert; das heutige Verhalten (404 im Owner-Portal, wenn der Betreiber
  ausgecheckt hat) ist SICHER — der naive Fix (Betreiber-Customer im
  Owner-Portal öffnen) würde im Agentur-Modell fremde Abos desselben
  Customers exponieren (Daten-Leak). **Empfohlener Fix:** Workspace-scoped
  Stripe-Customer beim Checkout (Customer pro Workspace/Owner, auf der
  workspace-Row gespeichert), Portal öffnet `workspace.stripeCustomerId`.
  Braucht eine billing-Util-Erweiterung (`createSubscriptionCheckoutSession`
  mit explizitem Customer statt immer `event.context.user`) — vor Stripe-Live
  mit David.

---

## 2026-07-21 (Nacht) — Autonomer Durchlauf: Fixes + Analyse + Live-Preise

David gab Freigabe, nachts so viele offene Punkte wie möglich umzusetzen und
aktiv nach neuen zu suchen. Ergebnis:

### Live-Preise angelegt (Stripe-Connector)
Über den autorisierten Stripe-Connector 4 **Live**-Preise idempotent angelegt
(EUR, von David bestätigt): `workspace_pro_monthly` 19 €, `workspace_pro_yearly`
190 €, `workspace_business_monthly` 49 €, `workspace_business_yearly` 490 € —
Produkte `prod_UvTbOz5jtnqCXn` (Pro) / `prod_UvTcGRkKpAlYse` (Business). Der
Connector läuft im **LIVE**-Modus (`livemode:true`) — vor jedem Schreiben geprüft.

### Bugfix: Plan-Wechsel-Doppelabo (Guard)
Beide Workspace-Checkout-Routen (Kunde + Betreiber, apps/control/server) blocken
jetzt einen zweiten Checkout, wenn der Workspace schon einen Bezahl-Plan hat
(409 → Portal). Pure `isPaidPlanKey` + Tests. Verhindert Doppelabrechnung.

### Deploy-Härtung: Verify akzeptiert Nachfahren-SHA
Die wiederkehrende Push-Race (ploi baut latest-main, Verify erwartet Trigger-SHA)
ist behoben: das Verify akzeptiert BUILD auch, wenn git beweist, dass EXPECTED
ein Vorfahre von BUILD ist (git fetch + merge-base --is-ancestor). Fail-safe
erhalten (nie false-pass). Direkt danach live erprobt (Release+Core-Race sauber
konsolidiert durch Abbrechen der überholten Deploys + einen gehärteten Deploy).

### Analyse-Pass (Agent) — neue offene Punkte
- **HOCH — Cross-Subscription-Kannibalisierung:** `handleWorkspaceSubscriptionUpdate`
  macht `free-fallback` bei `subscription.deleted` allein per `metadata.workspaceId`;
  der Stale-Guard wirkt nur pro `stripeSubscriptionId`. Existieren zwei Subs für
  EINEN Workspace, degradiert das Kündigen der alten den Workspace auf free,
  obwohl ein neueres Abo ihn hochgestuft hat. Der neue Doppelabo-Guard verhindert
  die Vorbedingung (kein Zweit-Checkout), heilt die Fulfillment-Logik aber NICHT.
  **Sauberer Fix (offen, braucht Migration):** `stripeSubscriptionId` auf der
  workspace-Row speichern; free-fallback nur, wenn die gekündigte Sub die aktuell
  hinterlegte ist. Nicht autonom gemacht (Prod-Schema-Migration).
- **MITTEL — Owner kann Betreiber-Abo nicht selbst verwalten:** Betreiber-Checkout
  bindet den Stripe-Customer an die Operator-userId; die Owner-Portal-Route sucht
  per Owner-userId → 404. Fix: Betreiber-Checkout sollte `ensureCustomer` für den
  Workspace-Owner machen. Offen.
- **MITTEL — kein Rollen-Check auf Owner-Checkout:** `requireWorkspaceMember`
  akzeptiert jedes Mitglied; heute entschärft (accept.post legt alle als `owner`
  an). Bei echten Mehrstufen-Rollen nachziehen.
- **LOW (gefixt) — malformed `requires`-JSON** in workspaceGrants: jetzt defensiv
  geparst (kaputte Row → [] + Log statt Webhook-500-Endlosschleife).
- **LOW (offen) — stille Truncation** bei >100 Sites/Grants (Query.limit(100) ohne
  Pagination im Plan-Sync). Heute unkritisch.
- **Saubere Bereiche (bestätigt):** alle 26 Server-Routen mit Auth-Guard, keine
  TODO/FIXME im Prod-Code, i18n de/en-Parität, Migrationen 409-idempotent,
  Fehler durchweg maskiert.

### Analyse-Pass 2 (Agent) — Core-Security: 0 kritisch, 0 hoch ✅
Auth/Session/RBAC/Realtime/GDPR/Secrets „außergewöhnlich sauber" (Defense-in-Depth).
Verifiziert sauber: Admin-/Session-Client-Trennung (kein Rechte-Eskalations-Missbrauch),
Session-Cookie httpOnly+strict+secure, OAuth-Redirects origin-gebunden (kein
Open-Redirect), RBAC-Guards + Rollenvergabe mit Eskalations-/Last-Admin-/Self-
Lockout-Schutz, Row-Permissions per-User, Realtime-Grenze = Row-Read-Permissions
(kein Fremd-Stream), Zod+Fehler-Maskierung überall, GDPR-Contributor vollständig,
keine Secret-Leaks/hardcodierten Keys. Restrisiken (alle infra-abhängig, bereits
im Code dokumentiert): In-Memory-Rate-Limit + X-Forwarded-For-Trust → **vor
horizontaler Skalierung** absichern (geteilter Rate-Limit-Store, Trust-Proxy
erzwingen); `sites.manage` global statt workspace-scoped → erst bei mehreren
Agentur-Operatoren (H2) relevant.

### NEUER wichtiger Fund: Rechts-Seiten fehlen (Impressum/AGB/Datenschutz)
studio hat KEINE Legal-Pages und `pukalani.auth.termsUrl` ist leer. Doppelt kritisch:
(1) für eine deutsche SaaS **gesetzliche Pflicht** (Impressum, AGB, DSGVO-
Datenschutzerklärung); (2) Stripe **verlangt** AGB-/Datenschutz-URLs für die
Live-Billing-Portal-Konfiguration → der „Plan-Wechsel via Portal"-Teil des
Doppelabo-Fixes ist darauf blockiert. Rechtstexte gehören zu David/Anwalt (nicht
KI-generiert). Portal-Config ist als fertiger Schritt vorbereitet (features:
subscription_update mit den 4 Preisen + proration, cancel, payment_method,
invoice_history), sobald die Legal-URLs existieren.

---

## 2026-07-21 — Stripe maximal vorbereiten (ohne Aktivierung)

David will Stripe so weit wie möglich fertig machen, aber Bank/Live-Aktivierung
erst später (er sucht noch eine Bank). Umgesetzt (test-mode-ready):

### Feature: Jahres-Abos für Workspace-Pläne
`ControlPlan` um optionales `lookupKeyYearly` erweitert (additiv, bricht nichts);
Katalog pro/business mit `workspace_{pro,business}_yearly`. Pure
`pickLookupKey(plan, interval)` wählt den Preis (yearly-ohne-Preis → Fallback
monthly). Beide Checkout-Routen (Kunde + Betreiber) akzeptieren `interval`,
Kunden-UI bekommt einen Monats/Jahres-Umschalter. **Wichtig/elegant:** der
Webhook bleibt unberührt — der Plan steht in `subscription.metadata`, nicht im
Preis, also ist das Intervall für den Lifecycle transparent. Commit `7864e7d`.

### Skript: `scripts/stripe/ensure-prices.mjs`
Legt alle 4 Products/Prices idempotent an (Vorschau ohne `--apply`), liest nur
`STRIPE_KEY` aus Davids Shell, erkennt Test/Live am Präfix. Beträge = Platzhalter.
Damit ist der Test-Mode-Katalog jetzt per Skript anlegbar — kein Handklicken,
keine Bank nötig. Details: [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md).

---

## 2026-07-21 — Deploy-Incident: studio-Build-Starvation + Push-Race (behoben)

Beim Ausrollen des Billing-Fixes (`532bb4e`) sind ZWEI Pipeline-Schwächen
aufgetreten. **Kein Outage** — dank ZDT (Stufe 2) lief studio durchgehend auf
dem alten Build weiter; behoben durch einen einzelnen studio-Deploy. Endstand:
alle 3 Sites auf `f8601c5`.

### Befund 1 (Auslöser): Push-Race — ploi baut *latest*, Verify erwartet Trigger-SHA
Fix- und Doku-Commit kurz hintereinander gepusht → als die Deploy-Kette portfolio
erreichte, baute ploi bereits den neueren Commit, während das Verify-Gate den
Trigger-SHA erwartete → Mismatch → Gate schlug (korrekt) an und **stoppte die
sequentielle Kette vor studio**. Das Gate hat richtig gehandelt; der Fehler war
das zu schnelle Doppel-Push.
- **Sofort-Mitigation:** Commits bündeln und in EINEM Push rausgeben; nach einem
  App-Push warten, bis der Deploy grün ist, bevor der nächste kommt.
- **Empfohlene Härtung (braucht Davids Review — NICHT autonom gemacht):** das
  Verify akzeptiert auch einen *Nachfahren* des EXPECTED_SHA
  (`git fetch origin $BUILD && git merge-base --is-ancestor $EXPECTED $BUILD`).
  Vorsicht: aktuell ist das Gate **fail-safe** (falscher Fehlalarm statt
  falscher Erfolg); die Härtung darf diese Eigenschaft nicht kippen.

### Befund 2 (der wichtigere): studio-Build verhungert als 3. Build in Folge
Ein sauberer `workflow_dispatch` (kein Race) baute comments ✓ + portfolio ✓, dann
**studio ✗** — Health oszillierte `n/a`↔`7dc1c8d`, nie `f8601c5`. Ursache: der
2-Core/3,7-GB-Server (≈3,4 GB je Nuxt-Build) verkraftet studio (größte App) nicht
als DRITTEN Build direkt nach comments+portfolio → OOM/Starvation. **Beweis:** ein
studio-Deploy ALLEIN bei idle-Server war in ~140 s grün. Die bestehende
Sequenzialisierung (keine PARALLELEN Builds) reicht also nicht — auch sequentiell
kann der letzte, größte Build verhungern.
- **Recovery (gemacht):** studio-ploi-Deploy einzeln gefeuert, Server idle → grün.
- **Empfohlene Fixes (Davids Entscheidung):** (a) Swap/RAM erhöhen; (b) je Build
  `NODE_OPTIONS=--max-old-space-size` kappen; (c) Build-Pause/Cooldown zwischen den
  Sites; (d) Verify-Timeout großzügiger. → als offener Punkt in OPEN-ITEMS.

---

## 2026-07-20 (später) — Money-Path-Review vor Stripe-Live

### Fix: `invoice.payment_failed`-Notify nur beim echten Statuswechsel
Beim Review des Billing-Money-Paths (vor dem Live-Gang) gefunden: der In-App-
Benachrichtigungs-Zweig bei `invoice.payment_failed` lief **unabhängig** vom
Stale-Guard. Weil `isStale` strikt `>` nutzt, gilt ein Stripe-Retry (gleicher
`event.created`) als „angewandt" → der Hinweis „Zahlung fehlgeschlagen" feuerte
mehrfach (Stripe liefert at-least-once + retryt auf 5xx). Fix: `upsertSubscription`
gibt jetzt `previousStatus` zurück; notify nur beim **Übergang** in
`past_due`/`unpaid` (pure `isNewPaymentFailure` + Unit-Tests). Commit `532bb4e`.

### Befund: der restliche Money-Path ist sauber
Geprüft und für gut befunden: Checkout (planId Zod-validiert gegen konfigurierte
Pläne → kein Preis-Tampering; userId via `client_reference_id` +
`subscription_data.metadata`), Webhook-Idempotenz (Upsert nach
`stripeSubscriptionId` + Unique-Race-Handling), Entitlements (fail-closed bei
DB-Fehler), Studio-Grant-Sync (deklarativer Replace + pure
`subscriptionUpdateToAction` → Webhook-Retry-sicher). Kein weiterer Fix nötig.

---

## 2026-07-20 — Wartungs- & Horizont-3-Block

### Entscheidung: Multi-Tenancy = Pool + Silo (zwei-stufig)
Die frühere M10-Weiche „A (Projekt-pro-Kunde) **vs.** B (shared-DB+tenantId)"
ist zu **„A und B"** aufgelöst: gepoolte Standard-Kunden (shared-DB + `tenantId`)
+ Silo (eigenes Projekt) für Spezial-/Enterprise-Kunden, mit *einer* mandanten-
agnostischen Datenzugriffs-Schicht. Idee von David: Spezialprojekte bauen →
Features in den Pool „fließen" lassen. Bewertung: trägt (Standardmuster „Pool +
Silo"). Blueprint + bestandener Isolations-Spike:
[HORIZONT-3-POOL-SILO-BLUEPRINT.md](archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md),
`spikes/s5-pool-silo` (15/15, inkl. Defense-in-Depth-Beweis).

### Korrektur: vue-tsc 3.3.7 deckt echten latenten Typfehler auf (nicht Flake)
Dependabot #12 (vue-tsc 3.3.5→3.3.7) schlug fehl, weil das strengere vue-tsc
Inline-Handler `@click="x = y"` auf **Nuxt-UI-Komponenten** ablehnt: der
Zuweisungs-Ausdruck gibt `boolean`/Wert zurück, nicht zuweisbar gegen den
Prop-Typ `(e) => void | Promise<void>` (die void-Widening-Sonderregel greift
nicht gegen einen **Union**-Rückgabetyp). Betraf 123 Handler in 41 Dateien.
**Migriert** (`() => { … }`, `$event`-Fälle als `($event) => { … }`) + zwei
Sonderfälle (StudioEditor `draft!`, TicketModal `splice`). Erkenntnis: der
Migrationswert lag nicht im Bump, sondern im Aufdecken einer latenten
Typ-Unsauberkeit. Commit `7dc1c8d`.

### Entscheidung: @types/node bleibt auf ^22.x (Dependabot #10 abgelehnt)
`@types/node` 22→26 würde die Typen ÜBER die Node-22-Runtime heben (typisiert
APIs, die es zur Laufzeit nicht gibt). Bei `^22.x` bleiben, bis die Runtime auf
Node 26 geht. PR #10 geschlossen.

### Befund: @tiptap/extensions-Peer-Drift ist ein Nicht-Problem
Die „unmet peer"-Warnung (extension-placeholder@3.27.1 will extensions@3.27.1,
bekam 3.28.0) erschien nur bei explizitem `pnpm update` (Re-Resolution). Der
committete Lockfile ist durchgehend konsistent bei 3.27.1, ein normales
`pnpm install` (CI-Pfad) driftet nicht. Kein Fix nötig; bei künftigem Wieder-
auftreten wäre ein `pnpm.overrides`-Pin auf 3.27.1 das Mittel.

### Änderung: deploy.yml überspringt jetzt auch `spikes/`
Der Doku-/CI-Skip-Filter (2026-07-19 eingeführt) ignoriert zusätzlich
`spikes/**` — Wegwerf-Spike-Code baut nie App-Output, ein Spike-Commit soll
keinen 3-Site-Build auslösen. Commit `495c238`.

### Doku: Stripe Go-Live Runbook erstellt
Der in BILLING-STRIPE.md Phase B-8 #29 vertagte Betriebs-Runbook existiert jetzt:
[STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md). Kernpunkt:
`lookup_key`s sind mode-stabil → Go-Live = Live-Preise mit gleichen Keys + Key-
Tausch in der .env + `pm2 reload`, **kein** Deploy. Live-Key-/Bankdaten-Schritte
bleiben bei David (Sicherheits-Grenze).

---

## 2026-07-19 — Go-Live-Nachlese & Auto-Deploy-Härtung

### Korrektur: UptimeRobot-„DOWN" war HEAD-404, nicht RAM-Druck
Der Monitor meldete portfolio/studio als DOWN. Erst-Diagnose (RAM-Druck während
Studio-Build) war **falsch**. Ursache: `health.get.ts` matcht nur GET, UptimeRobot
Free probt per **HEAD** → 404. Fix: Datei zu `health.ts` (ohne Methoden-Suffix)
umbenannt → beantwortet GET **und** HEAD. Merke: `.get.ts` ≠ HEAD.

### Korrektur: „S0-Multi-Projekt-Auflösung" ist nur ein Spike, nicht gebaut
In der Live-Diskussion fälschlich als „schon gebaut" bezeichnet. Tatsächlich:
`spikes/s0-multi-project` = bestandener Wegwerf-Spike; produktiv läuft reines
Single-Tenant-per-Deployment (statische Projekt-Bindung in `appwrite.ts`).
Festgehalten in [M10-HORIZONT-3-SKALIERUNG.md](archiv/M10-HORIZONT-3-SKALIERUNG.md).

### Änderung: deploy.yml überspringt Doku-/CI-/Meta-Pushes
Ein main-Push mit ausschließlich `docs/**`/`.github/**`/`*.md`-Änderungen baut
identischen App-Output → der changes-Step vergleicht den Prod-Commit gegen den
neuen Stand und überspringt den 3-Site-Build. Fail-safe: unbekannter Prod-SHA /
`workflow_dispatch` → deployt immer. Selbsttest bestanden. Commit `ea93f3b`.

### Entscheidung: Org-Konsolidierung + saubere Projekt-IDs
Kurzzeitig zwei Appwrite-Orgs (Nebeneffekt der Key-Blocker-Umgehung) → auf EINE
Org „Pukalani App" mit genau 3 Projekten (comments/portfolio/studio, freie IDs
ohne `-prod`) konsolidiert. Projekt-IDs sind unveränderlich → neu anlegen +
per `PATCH /projects/:id/team` (OHNE x-appwrite-mode-Header) transferieren.
Details im Memory `session-handover-2026-07-16`.

---

## Wie dieses Log zu pflegen ist

Neue Einträge **oben** unter einem Datum. Rein für Beschlüsse/Korrekturen/Ideen,
die sonst nirgends stehen — kein Ersatz für die `plans/*`-Detaildokumente oder
die Git-Historie. Format je Eintrag: **Kategorie: Titel** (Entscheidung /
Korrektur / Änderung / Befund / Doku / Idee) + 2–4 Sätze „warum", inkl.
verworfener Alternative, mit Verweis auf Commit/Doc.

## 2026-07-27 — Audit-Folgeentscheidungen (David, per Klick-Fragen)

1. **Header-Nav (S9):** Inline-Reihe mit Überlauf (ab ~5 Einträgen Mehr-Dropdown).
2. **Sprach-UI (S9):** DisplaySettingsMenu überall (marketing behält den
   schlanken Switcher — kein themes-Layer).
3. **Footer (S9):** Brand + legalLinks + optionaler Changelog-Link, aus Config.
4. **Mitglieder-Registrierung (S1):** pro Community schaltbar (USwitch „Offene
   Registrierung", Default AN); Invite-Code bleibt nur fürs GRÜNDEN.
   Übergang: ehrlicher Hinweis auf der Register-Seite.
5. **Rechtstexte je Community (S7):** der Kunde pflegt Impressum/Datenschutz
   als CMS-Seiten; Vorlagen beim Onboarding; Footer verlinkt sie. Demo
   Morgenlicht verlinkt auf das pukalani.app-Impressum.
6. **Demo-Seeds (S4):** ZWEISPRACHIG ausbauen (Davids Wahl, bewusst gegen die
   Empfehlung „so lassen") — EN-Besucher sollen englische Beispiele sehen.
7. **Wording (K10):** Kunden-Dashboard (admin-Layer) sagt „Produkte";
   Control Plane bleibt bei „Features".
8. **Pool-Reihenfolge:** Events zuerst durch die Datentür, dann Kurse.
9. **Alte Worktrees:** Docs-App wird JETZT reviewt (Ergebnis an David);
   Block-Editor bleibt geparkt (Feature-Stopp).

## 2026-07-28 — P10-Folgeentscheidungen (David: „leg los" auf die Empfehlungen)

10. **N6:** Default-Theme wird im Kunden-Picker umbenannt (Anzeige-Label, KEIN Key/Datenwert).
11. **N7:** /changelog wird auf Tenant-Hosts gegated (Betreiber-Changelog ist kein Kundeninhalt); Silo + Kontroll-Hosts unverändert.
12. **N9:** Site-Owner dürfen Theme/Variante ihrer Community selbst wählen — über die Service-Naht (tenants.theme/variant, Muster S1-Registrierungs-Switch), Capability branding.manage. Das Operator-Theme-Studio (Custom-Theme-EDITOR) bleibt system.manage.
13. **N4:** Die Demo bleibt bei Google indexierbar (Schaufenster).
14. **help.pukalani.app** bestätigt; Deploy-Kette wird gebaut (Prod-Port 3006).
15. **Nächstes Produkt:** Kurse durch die Datentür (letzter Silo-Gefangene der Produkt-Bilanz).

## 2026-07-29 — Theme-Entscheidungen (David)

16. **Entscheidung: Das Standard-Theme heißt „Aloha" (B3).** „Sunrise" (aus N6) stand im Picker direkt neben der Katalog-Farbwelt „Sunset" — zwei verwandt klingende Namen für Unverwandtes. Verworfen: die Id mit umbenennen — `default` steckt in `tenants.theme`, `data-theme`, CSS-Dateinamen und gespeicherten Kunden-Configs, ein Rename dort wäre eine Datenmigration ohne Nutzen. Geändert ist nur das Label in `packages/themes/app/utils/themeRegistry.ts` (kein i18n: Theme-Namen sind Eigennamen).

17. **Entscheidung: Auf Community-Hosts gewinnen die Farben der Community (B5).** Bis dahin gewann immer das Theme-Cookie des Besuchers — wer sich irgendwann eins ausgesucht hatte, sah JEDE Community in seinen Farben, und zwei Besucher sahen dieselbe Community verschieden. Das bricht das Produktversprechen („unter deinem Namen und deinem Design"), für das der Kunde zahlt. Der Theme-Wähler VERSCHWINDET dort, statt als „nur für dich, nur hier" beschriftet zu werden (verworfene Alternative): die Wahl hätte nach der Umkehr auch für den Wählenden selbst keine Wirkung mehr, ein Wähler wäre also entweder wirkungslos oder falsch beschriftet. Hell/Dunkel bleibt ausdrücklich Besucher-Sache. Silo-Apps, Kontroll-Hosts und Playground unverändert.

## 2026-07-29/30 — Das Geschäftsmodell wird sortiert (David, in mehreren Runden)

18. **Entscheidung: Die COMMUNITY ist das zahlende Objekt, `workspaces` fällt weg
    (A6).** Befund davor: alle vier Checkout-Routen hingen an `workspaces`, das Wort
    `tenant` kam im Geldpfad nicht vor, und `tenants.plan` — das Quota und
    Produkt-Sichtbarkeit steuert — wurde nur vom Wizard, vom Testphasen-Sweep und
    vom Betreiber-Auswahlfeld geschrieben. Ein Pool-Kunde hätte also bezahlen und
    auf `basic` bleiben können. Verworfen: die fehlende Verbindung nachrüsten und
    `workspaces` behalten — das hätte zwei Plan-Felder, zwei Mitglieder-Tabellen und
    zwei Vokabulare dauerhaft festgeschrieben. Die Agentur-Idee (ein Kunde, mehrere
    Sites unter einem Vertrag) war Horizont 2 und ist heute niemandes Bedarf.
    Stripe-Kunde und Abo stehen künftig an der Community; eine **Besitz-Übergabe ist
    gesperrt**, solange ein Abo läuft und der neue Owner keine Zahlungsmethode hat —
    sonst reist die Karte des Vorbesitzers mit. Blockiert A2 (Stripe-Live).

19. **Entscheidung: Gekauft wird im Dashboard der Community.** Dort ist der Owner,
    wenn er an ein Limit stößt — Schranke und Ausweg an derselben Stelle.
    `my.pukalani.app` zeigt Rechnungen und Zahlungsmethode.

20. **Entscheidung: Bezahlte Communities (Owner nimmt Geld von seinen Mitgliedern)
    kommen NACH dem Go-Live** — in der Navigation bleibt der Platz („Payments"), das
    Produkt nicht. Das ist ein zweiter Geldfluss mit eigener Mechanik (Stripe
    Connect) und rechtlichen Folgen (wer ist Verkäufer, wer schuldet Umsatzsteuer,
    Auszahlungen, Widerruf). Erst muss Geldfluss 1 überhaupt ankommen.

21. **Entscheidung: Sichtbarkeit wird PRO COMMUNITY wählbar, Default öffentlich.**
    Heute sind Inhalte öffentlich (die posts-API antwortet Gästen mit 200), und die
    gesamte SEO-Arbeit pro Community-Host (canonical, hreflang, sitemap, robots,
    og:image) setzt das voraus. Verworfen: durchgehend geschlossen — das hätte die
    SEO-Arbeit gegenstandslos gemacht und dem Embed-Einsatz widersprochen.
    Der Preis der Wählbarkeit ist eine echte Grenze: bei „geschlossen" müssen
    Row-Permissions, SEO-Tags, sitemap UND og:image mitziehen, sonst steht der
    Inhalt in Googles Index und nicht auf der Seite.

22. **Entscheidung: Die zwei Betriebsmodelle heißen `Plattform` und `Studio`**
    (Kundensprache); `pool`/`silo` bleiben im Code. Folge: der Alias
    `studio.pukalani.app` musste weg, sobald „Studio" der Kundenname ist — er zeigte
    die Betreiber-Konsole. **Erledigt am 2026-07-30** (ploi → Domain aliases;
    antwortet jetzt 404). Und die Seite „Theme-Studio" heißt künftig nur
    „Themes", damit neben der Menügruppe „Studio" nichts Gleichnamiges steht.

23. **Entscheidung: Die Umbenennung geht auf `community`, nicht auf `site` (E8).**
    Zuerst hatte David „`site` gewinnt, vollständig" gewählt; seine eigene
    Dashboard-Navigation hat die Frage Stunden später besser beantwortet — dort
    heißen die Kunden-Objekte „Communities" und das Register „Websites". Damit heißt
    jede Sache im Code wie in der Oberfläche, und die Kollision (`sites` war schon
    belegt) entfällt, weil `sites` gar nicht mehr gebraucht wird.

24. **Entscheidung: EINE Dashboard-Struktur mit drei Ebenen (E9)** — Betreiber nur
    auf Kontroll-Hosts, Community auf ihrem Host für ihr Team, Konto überall.
    Verworfen: alles in control bauen und den Kunden später bedienen — das hätte die
    Community-Einstellungen ein zweites Mal entstehen lassen, mit zwei Wahrheiten,
    genau wie bei Workspaces/Tenants. Folge für David: die Einstellungen seiner
    eigenen Community sieht er auf ihrem Host, nicht in control.

25. **Entscheidung: `UTable` ist der Standard für alle Datenlisten (B6).** Heute 2
    von ~20; die übrigen 18 ziehen nach. Danach braucht keine neue Liste eine
    Gestaltungsentscheidung.

26. **Claudes Entscheidung (angekündigt, nicht widersprochen): die
    `entitlements`-Mechanik bleibt stehen und verschwindet nur aus dem Menü.** Es ist
    die Lizenz-Mechanik der Studio-Seite (eine signierte Datei sagt einer FREMDEN
    Installation, welche Produkte sie betreiben darf) und nicht Teil der Abrechnung —
    `workspaces` war nur ihr Rechnungs-Behälter. Heute unbenutzt und damit kostenlos;
    beim ersten Studio-Kunden wäre der Neubau ein Projekt.

27. **Entscheidung (David, 2026-07-31): die Marketing-Landingpage läuft VOLLSTÄNDIG
    auf Nuxt UI** — keine individuellen UI-Eigenbauten, wo eine Komponente existiert.
    Bewusst aufgegeben: die „kein JS / funktioniert vor Hydration"-Eigenschaften von
    Header-Dropdown, Mobil-`<details>` und FAQ-`<details>`; die Scroll-Inszenierung
    (`data-reveal`/Parallax) ist verzichtbar, wo sie der Struktur im Weg steht.
    Umgesetzt in fünf Paketen (P1 Theme-Brücke: eigene `puka`-Palette als `primary`
    statt der zweckentfremdeten Statusfarbe `warning` · P2 Karten/Badges/Grids ·
    P3 Heros/CTAs · P4 Pricing · P5 Header/Footer/FAQ/Tabs). Dokumentierte Ausnahmen
    ohne Äquivalent: Vergleichstabelle (Semantik), PukaMark, Glow, Produkt-Mock,
    `tone-*`-Hintergründe. SEO-Netz dabei: FAQ-Antworten und alle Produkt-Links
    bleiben per `unmount-on-hide=false` im SSR-HTML.

## 2026-08-04 — Silo-Strategie: comments bleibt, neue Produkte ohne eigene Site

**Entscheidung (David):** `comments.pukalani.app` bleibt als das EINE lebende
Silo bestehen — es verdient seine eigene Instanz durch drei Rollen, die kein
anderer Host übernehmen kann: E2E-Anker (gesamte Playwright-Suite + CI-Wegwerf-
Appwrite), Embed-Produkt für fremde Seiten, und der lebende Beweis, dass die
Layer-Architektur die Silo-Form des Studio-/Enterprise-Angebots trägt. Dazu
liefert es die Gegenform für Grenzbeweise (Silo `read("users")` vs. Pool-Labels
— Presence- und Handle-Beweise brauchten BEIDE Formen).

**Die Regel daraus:** Isolation im CODE und Isolation im DEPLOYMENT sind zwei
Entscheidungen. Neue Produkte bekommen IMMER einen eigenen Layer (billig,
erzwingt sauberen Schnitt) — aber standardmäßig KEINE eigene Site/Instanz
(teuer: Migrationen je Instanz, Env-Drift wie F44, TLS, Schema-Parity).
Entwickelt wird im Playground, gezeigt auf demo.pukalani.app; eine eigene Site
gibt es nur mit kundenförmigem Grund. `photos` lebt das Muster bereits
(App existiert, nie ausgerollt).

## 2026-08-06 — Handle bleibt bei Zugangs-Entzug erhalten

**Entscheidung (David):** Wird jemandem der Community-Zugang entzogen, bleibt
seine `community_handles`-Zeile bestehen; bei Rückkehr ist der Name wieder da.
Kein Ehemalig-Marker, keine Freigabe. Grund: alte Erwähnungen müssen weiter auf
dieselbe Person auflösen (Historien-Regel), und eine Freigabe machte
Identitätsübernahme in alten Beiträgen möglich. Preis, bewusst in Kauf
genommen: ein einmal vergebener Name (`@vorstand`) ist in dieser Community
endgültig belegt — seit H1 kann ihn aber nur noch ein Mitglied nehmen.
Das ist das HEUTIGE Verhalten; es war offen, ob es Absicht ist — jetzt ist es
entschieden, kein Code-Änderungsbedarf.

## 2026-08-07 — Eigene Domain je Community (Custom Domains)

**Entscheidungen (David):** (1) Gate ab Plan **Pro** — klassischer
Differenzierer, jede Kundendomain kostet real Betrieb. (2) Die alte Subdomain
antwortet **301** auf die eigene Domain, sobald aktiv — ein kanonisches
Zuhause, Subdomain bleibt Rückfall. (3) **Selbstbedienung komplett**: Owner
trägt Domain ein, System prüft DNS und stößt Zertifikat + Appwrite-Platform
automatisch an — kein Betreiber-Klick je Kunde. (4) **www + Apex automatisch**:
beide Formen aktiv, eine leitet um.

**Bekannte Grenze (vorab benannt):** der Konto-WS (Sofort-Abmeldung) ist
Cookie-nativ und greift von fremder Root-Domain nicht — auf Kundendomains
degradiert Session-Widerruf auf den 30-s-Poll. Bewusst akzeptiert.

## 2026-08-20 — U16: Adressen bleiben, wie sie sind (Weg A)

Davids Entscheidung (strukturierte Frage, Empfehlung angenommen): Kategorien
und Kurse behalten den festen Slug, Themen und Events die Id — **kein Umbau,
kein Alt-Slug-Gedächtnis**. Der einzige echte Druckpunkt (Umbenennen) ist
heute kein Bedarf; wird er einer, ist Weg C (Id-Muster überall) die
vorgezeichnete Lösung, nie Weg B (bei Themen bereits bewusst verworfen).
Analyse: docs/archiv/ADRESS-MUSTER-KATEGORIEN.md.

## 2026-08-21 — Studio-Site: Wir-Stimme + Erstgespräch-Wizard (W1)

Davids Entscheidungen: (1) pukalani.studio spricht als **„wir, Pukalani
Studio"** — nie mehr Ich-Form; David bleibt benannte Person, keine Teamgröße
wird behauptet („ausgewählte Partner je nach Projekt"). (2) Erstgespräch-
Wizard nach tobiasnase-Vorbild (strukturierte Fragen, alle vier angenommen):
Budget-Spannen < 5 k / 5–15 k / 15–50 k / > 50 k € + „noch offen" · Telefon
optional · Erfolgsseite mit cal.com-Sofortbuchung UND 24-h-Rückfallzeile ·
Speicherung Mail + App-lokale Tabelle `intro_requests` (kein Produkt-Layer —
Eigenschaft der Marketing-Site, nicht der Plattform).
Plan: docs/plans/STUDIO-ERSTGESPRAECH-FUNNEL.md.

## 2026-09-08 — Appwrite 2.0: Server und SDKs in EINEM Vorhaben (AW2)

Davids Entscheidung (strukturierte Frage nach der Dependency-Runde; die
Empfehlung „Stufe 1 jetzt, Server nach dem ersten 2.0.x-Patch" hat er
BEWUSST NICHT genommen): **alles jetzt, Start sofort.** Reihenfolge, weil die
SDK-Majors am Server hängen: (1) `node-appwrite` 26 → 28 mit Code (Health-
Pillen auf REST, `account.createJWT` → `users.createJWT`) — Response-Format
1.9.6, läuft gegen den heutigen Server, wird deployt; (2) Dev-Instanz
(OrbStack `appwrite-maria`) 1.9.6 → 2.0.0 mit Dump + Config-Backup,
Override-Patches (SMTP-KeepAlive, Traefik-XFF) gegen das neue Compose
nachziehen, Beweise fahren; (3) Prod `api.pukalani.app` genauso, mit
Downtime-Fenster; (4) erst danach `node-appwrite` 29 + `appwrite` 27
(Response-Format 2.0.0) und die CI-Wegwerf-Appwrite auf 2.0.
Benanntes Risiko: 2.0.0 ist vom 2026-09-04, kein Patch-Release vorhanden;
`registers.php` trägt weiterhin `keepAlive: true` (Patch erneuern, nicht
löschen).

**Nachtrag 2026-09-08 (Ausführung):** Prod-Fenster nach Davids zweiter
Entscheidung „nach grüner CI-E2E auf 2.0" um 05:00 UTC gezogen — unter 12
Minuten, Nachweise im Runbook. Beide Instanzen und beide SDKs stehen auf der
2.0-Linie; AW2 ist damit komplett (OPEN-ITEMS-COMPLETE).
