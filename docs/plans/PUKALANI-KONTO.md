# Pukalani-Konto — ein Konto für alle Seiten

**Sorte:** Plan (noch nicht gebaut). **Stand: 2026-11-12 · Status: Konzept
geschrieben, acht Entscheidungen offen (§ 10).** Nichts hiervon ist umgesetzt —
keine Code-Änderung, keine Migration, nichts an Production.

Dieses Dokument setzt den [Account-Horizont](ACCOUNT-HORIZONT.md) fort. Der hat
den Pool zu EINEM Konten-Stamm gemacht (Projekt `account`, Host
`account.pukalani.app`, ein @handle je Konto). Hier geht es um die zwei Dinge,
die danach noch fehlen: die **Sitzung je Seite** und die **Seiten außerhalb des
Pools**.

---

## 1. Kurzfassung

- **Das Ziel** (Davids Worte, 2026-11-12): ein Pukalani-Konto mit den
  Anmeldedaten, vergleichbar mit einer Apple-ID. Dieselbe Anmeldung auf allen
  Seiten. Wer sich auf einer Seite registriert, ist dieser einen Seite
  beigetreten und hat nur dort Zugriff. Auf einer zweiten Seite tritt man mit
  demselben Konto bei. Das Konto zeigt, womit es verbunden ist. Jede Seite
  speichert ihre eigenen Daten zum Nutzer.
- **Der Stand:** Im Pool ist der fachliche Teil gebaut — ein Konto, Beitritt
  als Ereignis, Daten je Community getrennt. Zwei Dinge passen noch nicht zum
  Ziel: (1) Eine Anmeldung gilt technisch immer für das **ganze Konto**, egal
  auf welcher Seite sie liegt. (2) branding.supply, pukalani.studio und die
  Betreiber-Konsole haben je einen **eigenen Konten-Stamm**.
- **Die Empfehlung:** Weg (a) — eine zentrale Anmeldestelle
  `account.pukalani.app`, jede Seite bekommt eine eigene Sitzung, die nur dort
  gilt. Kontoweite Dinge (Passwort, Zahlung, Export, Löschung) gibt es nur an
  der zentralen Stelle. branding.supply behält sein eigenes Projekt und seine
  eigenen Daten, hängt sich aber an dasselbe Konto. Gebaut in fünf Etappen,
  die erste ist ein kleiner Beweis.

---

## 2. Der Ist-Stand, am Code belegt

### 2.1 Vier Projekte, vier Konten-Stämme

Appwrite kennt Nutzer nur **je Projekt** — dieselbe E-Mail in zwei Projekten
sind zwei Konten, die nichts voneinander wissen
([ACCOUNT-HORIZONT.md](ACCOUNT-HORIZONT.md), „Appwrite-Faktenlage").

| Projekt | Wer meldet sich dort an | App | Beleg |
| --- | --- | --- | --- |
| `account` | alle Mitglieder aller Pool-Communities (`*.pukalani.app`, Kundendomains) und der Kundenbereich `account.pukalani.app` | `apps/platform` | `.claude/rules/appwrite.md` („Das geteilte Projekt … heißt seit AH-1 `account`") |
| `branding` | Nutzer von branding.supply | `apps/branding` | `apps/branding/.env.example:12`, `docs/plans/BRANDING-SUPPLY-INFRA.md` (eigener Konten-Stamm, Davids Entscheidung 2026-08-31) |
| `portfolio` | pukalani.studio (Davids eigene Site) | `apps/portfolio` | `apps/portfolio/nuxt.config.ts:13`, ACCOUNT-HORIZONT („bleibt als Davids eigenes Silo unberührt") |
| `admin` | Betreiber | `apps/control` | `.claude/rules/hosts-ops.md` (AH-4c, Cookie `a_session_admin`) |

Alle vier Apps erben dieselben Anmelde-Formulare und dieselben Routen aus dem
Core-Layer (`packages/core/server/api/auth/**`). Sie **sehen** also gleich aus —
sprechen aber mit vier verschiedenen Nutzer-Datenbanken.

### 2.2 Wie Konto, Sitzung und Cookie entstehen

- **Konto + Sitzung in einem Schritt:** `signup.post.ts:97-98` legt das Konto an
  und erzeugt sofort eine Appwrite-Sitzung; `login.post.ts:12` erzeugt sie bei
  der Anmeldung. Dazu kommen Code-Login (`otp/verify.post.ts`) und Google
  (`oauth/callback.get.ts:68`).
- **Das Cookie trägt das Sitzungs-Geheimnis selbst:** `setSessionCookie`
  (`packages/core/server/lib/appwrite.ts:38-62`) schreibt `session.secret` in
  das Cookie `a_session_<Projekt>` — httpOnly, `sameSite: lax`, ohne
  `Domain`-Angabe, also **nur für diesen einen Host**.
- **Jede Anfrage:** `02.auth.ts:9-13` liest das Cookie, fragt Appwrite
  (`account.get()`) und setzt `event.context.user`.
- **Eine Appwrite-Sitzung gilt für das ganze Konto.** Appwrite kennt keine
  Sitzung, die auf einen Host oder eine Community begrenzt ist. Dasselbe gilt
  für das Kurzzeit-Token der Live-Verbindung (`realtime-token.get.ts:7-10`
  nennt das ausdrücklich: „nicht auf Realtime scopebar").

### 2.3 Wie eine Sitzung den Host wechselt

Weil das Cookie nur für einen Host gilt, gibt es den **Handoff**:

1. Der abgebende Host versiegelt das Sitzungs-Geheimnis in ein Token, das
   60 Sekunden gilt und an den Ziel-Host gebunden ist (`sealCommunityHandoff`
   und `sealControlHostHandoff` in
   `packages/onboarding/server/utils/communityHandoff.ts:84-166`;
   `HANDOFF_TTL_MS` in `packages/core/server/utils/embedHandoff.ts:43`).
2. Der Ziel-Host kommt aus der Mitgliedschafts-Liste, nie vom Aufrufer
   (`communityHandoff.ts:100-108`).
3. Der Ziel-Host öffnet das Siegel, prüft es gegen Appwrite und setzt sein
   eigenes Cookie (`site-session.get.ts:61-76`).

Drei Aufrufer: Kundenbereich (`onboarding/handoff.post.ts:36`),
Community-Wechsler im Dashboard (`community/switch.post.ts:40`, nur Team-Rollen)
und die Ausgänge zum Kontroll-Host (`community/control-handoff.post.ts:76`).

**Was dabei wandert, ist dieselbe Sitzung.** Nach dem Sprung liegt auf beiden
Hosts ein Cookie mit demselben Geheimnis. Folge: Abmelden auf einer Seite
(`logout.post.ts:10`, `deleteSession('current')`) beendet diese eine
Appwrite-Sitzung überall, wohin sie kopiert wurde.

### 2.4 Wie ein Beitritt entsteht

Regel A5 (`.claude/rules/tenant-isolation.md`, Vertrag
`packages/core/shared/communityJoin.ts`):

- **Mitglied ist, wer eine `community_members`-Zeile mit Zugang hat.** Die Zeile
  liegt im Control Plane. Das Lese-Label am Konto folgt ihr
  (`06.community-label.ts:76-79`).
- **Zwei Auslöser:** `registration` — Kontoanlage auf dem Host der Community
  (`signup.post.ts:134`) — und `contribution` — der erste eigene Schreibvorgang,
  abgefangen in der Datentür (`communityJoin.ts:28-36`).
- **Die Regel:** `decideJoin` (`packages/control/shared/communityTeam.ts:518-529`).
  Offene Community ⇒ Beitritt als `viewer`. Geschlossene ⇒ nur per Einladung.
  Entzogen ⇒ kommt nicht von selbst zurück.
- **Ein Seitenaufruf löst nichts aus** (`communityJoin.ts:38-42`).

Was es nicht gibt: einen Schritt, in dem der Mensch dem Beitritt zu einer
**zweiten** Community ausdrücklich zustimmt und sieht, was diese Community von
ihm erfährt. Der Beitritt geschieht dort still beim ersten Schreiben. Und einen
Knopf „diese Community verlassen" für das Mitglied selbst gibt es in den Routen
nicht — nur der Owner kann den Zugang entziehen
(`packages/control/server/api/control/community/members/remove.post.ts`).

### 2.5 Kundendomains

[EIGENE-DOMAIN.md](../referenz/EIGENE-DOMAIN.md): eine Community bekommt einen
kanonischen Host; alle anderen Hosts derselben Community leiten dorthin um
(`00.tenant.ts:113-116`). Die Zustandskette treibt allein der „Prüfen"-Klick
(`advanceCustomDomain` in `packages/control/server/utils/customDomainService.ts`).

Für dieses Konzept wichtig: Die Kundendomain ist ein Host wie jeder andere —
gleiche App, gleiches Projekt `account`, gleiche Anmelde-Routen. § 6 der
Referenz hält fest: „Die Sitzung hängt am Host", nach der Umstellung meldet man
sich neu an. Der Unterschied zu `*.pukalani.app`: Die Domain **gehört dem
Kunden**, nicht uns.

### 2.6 Kontoweite Funktionen

Passwort (`password.put.ts`), Zwei-Faktor (`mfa/*`), Sitzungs-Liste
(`sessions/*`), Datenexport (`export.get.ts`) und Kontolöschung
(`account.delete.ts`) sind Core-Routen und antworten **auf jedem Host**. Die
Konto-Hülle ist bewusst in jedes Community-Dashboard eingebunden (Davids
Entscheidung 2026-08-11, ACCOUNT-HORIZONT „Die Vision"). Unumkehrbares verlangt
eine frische Anmeldung (`requireRecentAuth`,
`packages/core/server/utils/recentAuth.ts:20`).

Export und Löschung orchestriert der Core über Beiträger je Layer
(`UserDataContributor`, `packages/core/server/utils/userData.ts:22-37`;
vierzehn Layer haben einen angemeldet). Das reicht **so weit wie das Projekt**:
Wer sein Pool-Konto löscht, löscht nichts auf branding.supply — und umgekehrt.

### 2.7 „Verbunden mit" heute

`account.pukalani.app/communities` zeigt die eigenen Communities. Die Quelle ist
das Control Plane (`listMyCommunities`, `communityHandoff.ts:68-72`; Form
`MyCommunityView` in `packages/control/shared/myCommunities.ts:30`). Die Silos
kommen darin nicht vor.

### 2.8 Was Appwrite hergibt (Doku geprüft, 2026-11-12)

- **Nutzer strikt je Projekt.** Kein Teilen zwischen Projekten.
- **Eigene Anmeldewege sind vorgesehen:** Der Server stellt für eine Nutzer-Id
  ein kurzlebiges Token aus (`users.createToken`), das gegen eine **neue**
  Sitzung getauscht wird (`account.createSession`). Damit kann jede Seite ihre
  eigene Sitzung bekommen, statt eine zu kopieren.
- **Nutzer-Ids sind beim Anlegen frei wählbar** — ein verbundener Dienst kann
  sein lokales Konto unter derselben Id führen wie das Pukalani-Konto.
- **Übernahme mit Passwort-Hash** ist möglich und bei AH-1 schon einmal
  gefahren (`docs/runbooks/ACCOUNT-CUTOVER.md`).
- **Kein eingebautes „Konto über mehrere Projekte".** Was hier „ein Konto für
  alle Seiten" heißt, bauen wir selbst — Appwrite liefert die Bausteine.

---

## 3. Abgleich mit dem Zielbild

| Zielbild | Pool heute | Silos heute |
| --- | --- | --- |
| Ein globales Konto mit den Anmeldedaten | **gebaut** (Projekt `account`, AH-1) | **fehlt** — je Silo eigener Stamm |
| Dieselbe Registrierung und Anmeldung überall | gleiche Formulare, aber je Host eigene Eingabe | sieht gleich aus, ist ein anderes Konto |
| Registrierung auf einer Seite = Beitritt nur dort | **gebaut** (A5, Auslöser `registration`) | entfällt — ein Silo hat keine Mitgliedschaft, das Konto ist die Zugehörigkeit |
| Zugriff nur dort | fachlich **gebaut** (Lese-Label je Community, Datentür) — **technisch widerspricht** die Sitzung: sie gilt fürs ganze Konto | Projekt ist die Grenze |
| Zweite Seite: Beitritt mit demselben Konto | geht, aber **still** (erster Schreibvorgang) und nach erneuter Passwort-Eingabe auf dem zweiten Host | **fehlt** |
| Das Konto hält fest, womit es verbunden ist | **gebaut** für Communities (`/communities`); selbst verlassen **fehlt** | **fehlt** |
| Jede Seite speichert eigene Daten, verknüpft mit dem Konto | **gebaut** (Stempel `communityId` + Nutzer-Id) | eigene Daten ja, Verknüpfung **fehlt** |
| Kontoweite Dinge an einer Stelle | **widerspricht** — Passwort, Export, Löschung antworten auf jedem Host | je Silo getrennt |

**Zwei echte Widersprüche:**

1. **Die Sitzung.** Das Ziel sagt „nur dort Zugriff". Heute ist jede Anmeldung
   eine Anmeldung des ganzen Kontos — auch auf einer Domain, die dem Kunden
   gehört.
2. **Die Konto-Hülle in jedem Dashboard.** Sie war 2026-08-11 Absicht. Mit
   „kontoweite Dinge nur zentral" wird ein Teil davon zurückgenommen — das
   braucht Davids Entscheidung (§ 10, Frage 4).

---

## 4. Was der neue Bau leisten soll

Unabhängig vom Weg — daran wird jeder Vorschlag gemessen:

1. **Eine Seite, eine Sitzung.** Was im Browser einer Seite liegt, gilt nur auf
   dieser Seite und nur für diese Community oder diesen Dienst. Auf einem
   anderen Host ist es wertlos.
2. **Anmeldedaten werden nur an einer Stelle eingegeben** — auf einem Host, der
   uns gehört.
3. **Kontoweite Handlungen nur zentral:** Passwort, E-Mail, Zwei-Faktor,
   Geräte-Liste, Zahlung des Kontos, Export, Löschung.
4. **Beitritt ist sichtbar und gewollt.** Beim ersten Beitritt zu einer Seite
   sieht der Mensch, was die Seite von ihm erfährt, und stimmt zu. Die
   Zustimmung wird mit Datum und Fassung festgehalten.
5. **Das Konto kennt alle Verbindungen** — Communities und Dienste — und der
   Mensch kann jede einzeln trennen.
6. **Export und Löschung erreichen alle verbundenen Seiten.** Vor dem Löschen
   steht klar da, was gelöscht wird und was bleibt (Davids Entscheidung).
7. **Abmelden wirkt wie erwartet:** auf einer Seite nur dort; „überall
   abmelden" an der zentralen Stelle.
8. **Die bestehenden Grenzen bleiben:** Datentür, A5, Lese-Labels, die
   Betreiber-Konsole als getrennte Welt.

---

## 5. Drei Wege

### Weg (a) — Zentrale Anmeldestelle, je Seite eine eigene Sitzung

So lösen es Apple, Microsoft und Google: Die Anmeldung findet immer auf einem
Host des Anbieters statt, jede Anwendung bekommt danach ihre eigene Sitzung.

**Was der Nutzer erlebt**

- Auf Community X klickt er „Anmelden" und landet auf `account.pukalani.app` —
  mit Namen und Farbe von X („Anmelden bei X"). Er gibt E-Mail und Passwort ein
  (oder Code, oder Google). Neu? Dann entsteht das Konto, und er ist X
  beigetreten. Zurück auf X ist er angemeldet — **nur auf X**.
- Später auf Community Y: „Anmelden" → die zentrale Stelle erkennt ihn wieder,
  ohne neues Passwort, und fragt: „Mit deinem Pukalani-Konto Y beitreten? Y
  sieht: Name, Bild, @handle; die Betreiber von Y sehen deine E-Mail." Ein
  Klick, zurück auf Y.
- Auf branding.supply dasselbe: „Anmelden" → zentrale Stelle → zurück.
- Unter `account.pukalani.app` steht „Verbunden mit": X, Y, branding.supply —
  je mit „Öffnen" und „Trennen". Passwort, Zwei-Faktor, Geräte, Export und
  „Konto löschen" gibt es nur hier.
- „Abmelden" auf X beendet nur X.

**Was umzubauen ist**

- *Sitzung je Seite.* Das Cookie einer Seite trägt nicht mehr das
  Sitzungs-Geheimnis, sondern einen versiegelten Umschlag, den nur unser Server
  öffnen kann und der an Host und Community gebunden ist. Die Verschlüsselung
  dafür gibt es schon (Handoff-Siegel, `embedHandoff.ts`). Jede Seite bekommt
  eine **eigene** Appwrite-Sitzung (per `users.createToken`) statt einer Kopie.
  Der Umbau sitzt an wenigen Stellen: `sessionCookieName` wird in ganzen fünf
  Dateien gelesen (`lib/appwrite.ts`, `02.auth.ts`, `communityHandoff.ts`,
  `embed-handoff.post.ts`, `apps/control/server/middleware/docs-guard.ts`).
- *Zentrale Anmeldung.* Anmelden, Registrieren, Code, Google, Zwei-Faktor und
  „Passwort vergessen" laufen nur noch auf `account.pukalani.app`. Die Seiten
  leiten dorthin und bekommen einen Einmal-Code zurück (derselbe Mechanismus
  wie der heutige Handoff, in die andere Richtung). Nebenwirkung: Google
  braucht nur noch **eine** registrierte Rückkehr-Adresse — das löst den Punkt
  „OAuth auf Custom Domains" aus
  [MULTI-SITE-PLATFORM-STRATEGIE.md](../referenz/MULTI-SITE-PLATFORM-STRATEGIE.md)
  (L8, „zentraler Auth-Broker").
- *Kontoweite Routen nur zentral.* Auf Community-Hosts antworten Passwort,
  E-Mail, Zwei-Faktor, Sitzungs-Liste, Export und Löschung nicht mehr; die
  Oberfläche verlinkt zur zentralen Stelle.
- *Beitritt mit Zustimmung.* Ein dritter Auslöser neben `registration` und
  `contribution` (oder als Ersatz für `contribution`, § 10 Frage 3): der
  ausdrückliche Beitritt an der zentralen Stelle. `decideJoin` bleibt die Regel.
- *Verbundene Dienste.* branding.supply behält Projekt und Daten. Sein lokales
  Konto wird an die Pukalani-Konto-Id gebunden; das lokale Passwort entfällt.
  Für Export und Löschung bekommt der Dienst eine Dienst-Naht, wie sie zwischen
  `onboarding` und `control` schon besteht (Service-Secret + geprüfte Identität).
- *Einbettung.* Der Popup-Weg für eingebettete Kommentare
  (`embed-handoff.post.ts`, `embed-session.post.ts`) wird auf dieselbe zentrale
  Stelle umgehängt.

**Aufwand grob:** XL insgesamt, verteilt auf fünf Etappen (§ 8). Die ersten
beiden Etappen (Sitzung je Seite, zentrale Anmeldung) sind je L und bringen den
größten Teil des Nutzens allein für den Pool.

**Risiken**

- Die Anmeldung ist das Tor für alles. Ein Fehler dort sperrt alle aus — also
  kleine Etappen, je mit Beweis-Skript und Gegenprobe, und ein Rückweg je
  Etappe.
- Einmalige Abmeldung aller Nutzer beim Wechsel des Cookie-Formats.
- Die Live-Verbindung (Realtime) braucht im Browser ein Appwrite-Token, und
  das kann Appwrite nicht auf eine Seite begrenzen. Wie die Anforderung 1 dort
  erfüllt wird, klärt Etappe 0 (§ 9).
- Auf Kundendomains verlässt der Besucher für die Anmeldung kurz die Domain des
  Kunden. Das ist bei jedem großen Anbieter so, nimmt dem Kunden aber ein Stück
  „alles unter meiner Adresse".

**Bestehende Konten**

- *Pool:* nichts zu tun — sie liegen schon im Projekt `account`.
- *branding.supply:* Wer dort ein Konto hat, bekommt ein Pukalani-Konto mit
  demselben Passwort (Übernahme mit Hash, wie bei AH-1). Gibt es die E-Mail
  schon im Projekt `account`, werden beide **nur bei bestätigter E-Mail auf
  beiden Seiten** verbunden; dann gilt das Passwort des Pukalani-Kontos, und
  der Mensch erfährt das vorher per Mail. Ohne bestätigte E-Mail wird nie
  automatisch verbunden — der Mensch bestätigt erst.
- Wie viele Adressen doppelt vorkommen, ist nicht gezählt. Die Zählung gehört
  an den Anfang der Etappe für branding.supply.

**Datenschutz**

- Zustimmung beim ersten Beitritt je Seite, mit Datum und Fassung. Für die AGB
  gibt es das Muster schon (`recordTermsAcceptance`,
  `packages/core/server/utils/termsAcceptance.ts`).
- Export und Löschung an einer Stelle über alle Verbindungen. Der Vertrag
  `UserDataContributor` wird um eine dritte Auskunft ergänzt: „was lösche ich,
  was bleibt" — daraus entsteht der Hinweis vor dem Löschen.
- „Trennen" einer einzelnen Verbindung löscht die Daten dort, das Konto bleibt.
- Betreiber-Sitz USA, Märkte weltweit: dieselbe zentrale Seite bedient die
  Rechte aus der DSGVO und aus vergleichbaren Gesetzen (Auskunft, Löschung).

**Kontoübersicht „verbunden mit":** vollständig — Communities und Dienste in
einer Liste, gespeist aus dem Control Plane, das die Mitgliedschaften heute
schon führt.

---

### Weg (b) — Die Silos in das gemeinsame Konto-Projekt holen

branding.supply behält Domain und Deployment, spricht aber mit dem Projekt
`account`. (ACCOUNT-HORIZONT: „Deployment-Isolation ≠ Projekt-Isolation".)

**Was der Nutzer erlebt:** Ein Konto, überall dasselbe Passwort — weil es
wirklich nur noch eine Nutzer-Datenbank gibt. An der Sitzung ändert sich nichts:
Sie gilt weiter fürs ganze Konto.

**Was umzubauen ist**

- Die Layer `brand`, `market` und `insights` werden mandantenfähig (Datentür,
  Stempel, Lese-Rechte, Pool-Regeln für eindeutige Schlüssel) — oder
  branding.supply wird eine besondere Community im Pool. Heute sind sie für ein
  eigenes Projekt geschrieben.
- Umzug aller Daten (Zeilen, Dateien, Zahlungs-Bezüge) und aller Konten.
- `app_config` ist **eine Zeile je Projekt**. Schalter wie Registrierung,
  Aufnahme-Modus und Wartung gälten plötzlich für Pool und branding.supply
  zugleich und müssten getrennt werden.
- Die Tabellen `comments` und `pages` gibt es in beiden Projekten.

**Aufwand grob:** XL, und zwar am Stück — der Umzug lässt sich schlecht in
kleine, einzeln rückholbare Etappen teilen.

**Risiken**

- Der Server-Schlüssel von branding.supply wäre der des Konto-Projekts.
  Appwrite-Schlüssel gelten je Projekt, nicht je Tabelle — ein Fehler dort
  beträfe alle Communities.
- Kehrtwende zu Davids Entscheidung vom 2026-08-31 (eigener Konten-Stamm für
  branding.supply).
- Löst den Sitzungs-Widerspruch aus § 3 **nicht**. Der bräuchte zusätzlich
  die ersten zwei Etappen von Weg (a).
- Für künftige Kunden-Silos (Enterprise) keine Antwort — die sollen ja gerade
  ein eigenes Projekt haben.

**Bestehende Konten:** müssen zusammengeführt werden, bevor irgendetwas
umzieht; bei doppelter E-Mail gewinnt ein Passwort. Alle Daten bekommen neue
Besitzer-Ids.

**Datenschutz:** Export und Löschung sind danach einfach — ein Projekt, die
Beiträger gibt es schon. Der Zustimmungs-Schritt fehlt weiter.

**Kontoübersicht:** leicht, weil alles in einem Projekt liegt.

---

### Weg (c) — Silos getrennt lassen, nur eine Brücke

branding.supply behält seine eigenen Konten und bekommt zusätzlich den Knopf
„Mit Pukalani-Konto anmelden".

**Was der Nutzer erlebt:** Zwei Wege zur Anmeldung auf derselben Seite. Wer
schon ein branding-Konto hat, behält dessen Passwort; wer neu kommt, kann sein
Pukalani-Konto nehmen. Im Pool ändert sich nichts.

**Was umzubauen ist:** Die zentrale Stelle lernt, eine Identität an einen Dienst
zu bestätigen; der Dienst lernt, ein lokales Konto an eine Pukalani-Konto-Id zu
binden. Das ist ein Teil der Dienst-Etappe von Weg (a) — ohne Übernahme der
Bestandskonten und ohne den Sitzungs-Umbau.

**Aufwand grob:** M bis L.

**Risiken**

- Zwei Passwörter für dieselbe E-Mail bleiben möglich — die häufigste Quelle
  für „ich komme nicht mehr rein".
- Der Sitzungs-Widerspruch aus § 3 bleibt vollständig bestehen.
- Kontoweite Dinge bleiben verteilt: Wer sein Pukalani-Konto löscht, hat sein
  branding-Konto mit eigenem Passwort noch.

**Bestehende Konten:** bleiben, wie sie sind. Verbunden wird nur, wer den Knopf
benutzt.

**Datenschutz:** Export und Löschung bleiben je Dienst getrennt. Zustimmung
beim Verbinden wäre möglich.

**Kontoübersicht:** unvollständig — sie zeigt nur, was über die Brücke
verbunden wurde.

---

## 6. Vergleich

| | (a) Zentrale Anmeldung, Sitzung je Seite | (b) Silos ins Konto-Projekt | (c) Brücke |
| --- | --- | --- | --- |
| Eine Seite, eine Sitzung | **ja** | nein | nein |
| Anmeldedaten nur an einer Stelle | **ja** | nein | nein |
| Kontoweite Dinge nur zentral | **ja** | teils | nein |
| Ein Konto auch für branding.supply | **ja** | **ja** | wahlweise |
| Beitritt mit Zustimmung | **ja** | nein | nur beim Verbinden |
| Export/Löschung über alles | **ja** (über Dienst-Naht) | **ja** (ein Projekt) | nein |
| „Verbunden mit" vollständig | **ja** | **ja** | nein |
| Silo-Regel und eigener Konten-Stamm bleiben | Projekt bleibt, Stamm wird geteilt | nein | **ja** |
| Trägt auch Kunden-Silos | **ja** | nein | **ja** |
| In kleinen Etappen baubar | **ja** | kaum | **ja** |
| Aufwand | XL in 5 Etappen | XL am Stück | M–L |

---

## 7. Empfehlung

**Weg (a).** Er ist der einzige, der das ganze Zielbild trifft, und der einzige,
der beide Widersprüche aus § 3 auflöst. Er passt zur Silo-Regel: Der Code bleibt
je Produkt ein eigener Layer, das Deployment bleibt, wo es ist — geteilt wird
nur die Identität.

Weg (c) ist kein Gegenentwurf, sondern ein **Teilstück** von (a): Die Brücke
entsteht in Etappe 4 ohnehin. Wer (c) zuerst baut, hat danach zwei
Anmelde-Wege, die er wieder zusammenführen muss.

Weg (b) kostet ähnlich viel, löst das Sitzungs-Thema nicht und nimmt die
Trennung zurück, die für branding.supply bewusst gewählt wurde.

**Was bewusst getrennt bleibt:**

- **Die Betreiber-Konsole** (`admin`). Betreiber-Konten sind keine
  Kunden-Konten; ACCOUNT-HORIZONT nennt genau zwei Welten als Ziel — `account`
  (alle Menschen) und `admin` (Betreiber).
- **pukalani.studio** (`portfolio`) — Davids eigene Site, kein Kunden-Stamm.
  Kann später ein verbundener Dienst werden, muss es nicht (§ 10 Frage 6).

---

## 8. Etappen

Jede Etappe ist für sich nützlich und einzeln rückholbar. Vor jeder steht nach
[WORKFLOW.md](../referenz/WORKFLOW.md) ein Prototyp und Davids Freigabe.

| # | Etappe | Ergebnis | Aufwand |
| --- | --- | --- | --- |
| **E0** | **Beweis im Kleinen** | Lokal gezeigt: versiegeltes Seiten-Cookie + eigene Sitzung je Host; die Live-Verbindung auf einem fremden Host; Zählung doppelter E-Mails zwischen `account` und `branding` (nur lesend, mit Davids Ja). Klärt die Fragen aus § 9. | S–M |
| **E1** | **Sitzung je Seite (Pool)** | Jede Community-Seite und jede Kundendomain hat eine eigene Sitzung, die nur dort gilt. Abmelden wirkt je Seite. Der heutige Handoff stellt neue Sitzungen aus statt Kopien. Einmalige Abmeldung aller. | L |
| **E2** | **Zentrale Anmeldung** | Anmelden, Registrieren, Code, Google, Zwei-Faktor und Wiederherstellung nur auf `account.pukalani.app`, im Kleid der jeweiligen Community. Passwort, E-Mail, Geräte, Export und Löschung nur dort. Einbettung umgehängt. | L |
| **E3** | **Beitritt mit Zustimmung + „Verbunden mit"** | Beitritts-Schritt an der zentralen Stelle, Zustimmung festgehalten. Liste aller Verbindungen mit „Trennen". Klarer Hinweis vor Trennen und Löschen: was wird gelöscht, was bleibt. | M–L |
| **E4** | **branding.supply als verbundener Dienst** | Anmeldung über das Pukalani-Konto; Bestandskonten übernommen und verbunden; Export und Löschung erreichen den Dienst. Eigenes Projekt und eigene Daten bleiben. | L–XL |
| **E5** | **Aufräumen** | Alte Wege entfernt, Referenz-Doku und Regeln nachgezogen, Hilfe-Texte für Kunden. | S–M |

E1 und E2 gehören fachlich zusammen, werden aber getrennt ausgerollt: E1 ändert
nur, **was im Cookie liegt** — die Formulare bleiben, wo sie sind. Erst E2
verlegt sie.

**Wie Davids weitere Entscheidungen hineinpassen:**

- *Eigene Domain nach Plan-Ende mit Schonfrist abschalten:* Mit E1 stirbt die
  Sitzung einer Domain mit der Domain; auf der Pukalani-Adresse ist man über
  die zentrale Stelle mit einem Klick wieder drin.
- *Testphase einmal pro Person:* „Person" ist ab hier das Pukalani-Konto. Die
  Marke „Testphase verbraucht" gehört ans Konto, nicht an die Community.
- *Hinweis beim Löschen von Konto oder Marke:* E3 liefert die Auskunft je
  Layer und die Seite dafür.

---

## 9. Was Etappe 0 klären muss

Technische Fragen, die sich nur am laufenden System beantworten lassen:

1. **Live-Verbindung.** Die Seite braucht im Browser ein Appwrite-Token für
   Realtime, und Appwrite kann es nicht auf eine Seite begrenzen
   (`realtime-token.get.ts`). Zu prüfen: kürzere Laufzeit auf fremden Domains,
   ein eigener Weg über unseren Server, oder dort bewusst ohne
   Live-Verbindung und mit Abfrage im Takt (wie der 20-Sekunden-Takt, den die
   Anwesenheit schon hat).
2. **Bindung prüfen ohne Zusatz-Aufruf.** `02.auth.ts` fragt heute je Anfrage
   einmal Appwrite. Die Host-Bindung soll aus dem Umschlag selbst kommen, ohne
   zweite Abfrage.
3. **Zwei-Faktor und frische Anmeldung** (`requireRecentAuth`) mit einer
   Sitzung, die an der zentralen Stelle entstand und auf der Seite eine eigene
   ist.
4. **Sitzungs-Obergrenze.** Appwrite begrenzt die Zahl der Sitzungen je Nutzer
   (Standard 10, höchstens 100). Mit einer Sitzung je Seite zählt das anders als
   heute.
5. **Wiedererkennen an der zentralen Stelle.** Wie lange bleibt man dort
   angemeldet, und was heißt das auf einem geteilten Rechner?
6. **Zahlen.** Wie viele Konten hat `branding`, wie viele E-Mails gibt es in
   beiden Projekten, wie viele davon sind bestätigt?

---

## 10. Entscheidungen für David

Empfehlung jeweils zuerst.

1. **Welcher Weg?**
   **(a) Zentrale Anmeldung, Sitzung je Seite** · (c) nur die Brücke ·
   (b) Silos ins Konto-Projekt.
2. **Wo gibt man sein Passwort ein?**
   **Immer auf `account.pukalani.app`** — ein Ablauf für alle Seiten ·
   nur bei Kundendomains zentral, auf `*.pukalani.app` weiter direkt auf der
   Seite.
3. **Wann ist man einer zweiten Community beigetreten?**
   **Beim Anmelden dort, mit sichtbarer Zustimmung** — dann gilt „angemeldet =
   Mitglied", und der stille Beitritt beim ersten Schreiben entfällt ·
   wie heute: anmelden ohne Beitritt, Beitritt still beim ersten Schreiben.
4. **Konto-Einstellungen im Community-Dashboard?**
   **Heikles nur noch zentral** (Passwort, E-Mail, Zwei-Faktor, Geräte, Export,
   Löschung); Harmloses bleibt im Dashboard (Sprache, Benachrichtigungen) ·
   alles nur noch zentral · alles bleibt, wie es ist (nimmt die Entscheidung
   vom 2026-08-11 nicht zurück, erfüllt aber Anforderung 3 nicht).
5. **branding.supply: was passiert mit bestehenden Konten?**
   **Übernehmen und verbinden** — ein Konto, ein Passwort, vorher eine Mail ·
   bestehen lassen und nur neue Anmeldungen über das Pukalani-Konto.
6. **pukalani.studio: verbinden oder getrennt lassen?**
   **Getrennt lassen** — eigene Site ohne Kunden-Stamm ·
   später als verbundenen Dienst anhängen.
7. **Kunden mit eigenem Silo (Enterprise): Pukalani-Konto oder eigener Stamm?**
   **Der Kunde wählt beim Einrichten** — Standard ist das Pukalani-Konto, der
   eigene Stamm bleibt das Enterprise-Versprechen · immer Pukalani-Konto ·
   immer eigener Stamm.
8. **Reihenfolge und Start.**
   **E0 jetzt, danach E1 → E2 → E3 → E4** · erst branding.supply (E4), dann der
   Pool · noch nicht anfangen, erst das Gesamtaudit abschließen.
