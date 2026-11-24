# Export und Löschung – wie es gebaut ist

Stand: 2026-11-17 (Gesamtaudit, Pakete P14 und P16; Fristen-Läufe aus der Nacharbeit N04). Diese Datei beschreibt, was geschieht, wenn jemand
seine Daten anfordert oder sein Konto löscht, welche Fristen gelten und wie man eine neue Tabelle
richtig anschließt. Der Plan, aus dem das Fundament entstand, liegt im Archiv:
[GDPR-DELETE-AND-EXPORT.md](../archiv/GDPR-DELETE-AND-EXPORT.md).

## Der Vertrag

Jeder Layer, der Daten über Menschen speichert, meldet beim Start einen Beitrag an
(`registerUserDataContributor`, Nitro-Plugin `server/plugins/user-data.ts`). Der Core kennt kein
Produkt-Schema; er ruft die Beiträge nur auf (`packages/core/server/utils/userDataOrchestration.ts`).

- **Auskunft** (`GET /api/auth/export`, Betreiber: Nutzerverwaltung): Konto, Sitzungen und je Layer
  ein Abschnitt. Ein Beitrag, der wirft, bricht die Auskunft ab. Kann ein Abschnitt aus gutem Grund
  nicht geliefert werden (das Control Plane antwortet nicht), steht dort `{ "unavailable": true }` –
  nie ein leeres Objekt, das wie „nichts gespeichert" aussieht.
- **Löschung** (`DELETE /api/auth/account`, Betreiber: Nutzerverwaltung): Kopie schreiben → Konto
  sperren → jeden Beitrag aufrufen → Bild und Anwesenheit entfernen → das Konto bei Appwrite löschen,
  **nur wenn jeder Beitrag Erfolg gemeldet hat**. Scheitert einer, bleibt das Konto gesperrt stehen,
  und der Lauf lässt sich wiederholen (jeder Schritt verträgt das).

**Wer den Export bekommt** (SEC-034, seit 2026-11-16 — Davids Entscheidung): jeder Beitrag erhält
`exportUserData(event, userId, { audience })`. `self` ist die Person selbst (`GET /api/auth/export`)
und bekommt alles, was sie im Produkt sieht. `operator` ist der Betreiber: der Export in der
Nutzerverwaltung **und** die Kopie vor einer Löschung (30 Tage im Bucket `gdpr-exports`). Dort gibt
`messages` je Gespräch nur Gegenüber, wer begonnen hat, Beginn, letzte Nachricht und zwei Zähler
heraus — **keinen Nachrichtentext**, keine einzelnen Zeitpunkte, kein „gelesen". Ein neuer Beitrag,
der private Inhalte zwischen Menschen speichert, beachtet `audience`; alle anderen liefern für beide
dasselbe. Herausgaben an den Betreiber (Export, CSV-Liste, Download einer Kopie) verlangen eine
frische Anmeldung (10 Minuten) und stehen vorher im Betreiber-Protokoll — ohne Eintrag gibt die
Route nichts heraus (503 `audit_unavailable`, BE-021).

Drei Regeln, die jede Änderung an einem Beitrag einhalten muss:

1. **Ein Lesefehler ist ein Fehler, kein „nichts gefunden".** Gelesen wird mit `listAllRows` oder
   `listAllRowsIfTableExists` (leer nur, wenn die Tabelle auf der Instanz fehlt). Ein `.catch(() => [])`
   macht aus einem Aussetzer eine erfolgreiche Löschung, bei der die Zeilen stehen bleiben – und einen
   zweiten Versuch gibt es dann nicht mehr, weil das Konto weg ist.
2. **„Konto schon weg" ist nur die Antwort `user_not_found`.** Ein 404 ohne diese Art kommt vom Proxy
   vor Appwrite, wenn der Dienst dahinter fehlt (`isAppwriteUserMissing`).
3. **Eine Adresse ist nur ein Schlüssel, wenn sie bestätigt ist.** Zeilen ohne Konto-Id (Warteliste,
   Meldungen, Newsletter, Gesprächsanfragen) werden über die Adresse des Kontos gefunden – aber nur
   über eine bestätigte, sonst bekäme ein Konto unter fremder Adresse fremde Zeilen.

## Zustimmung und diese Rechte (SEC-007/SEC-008, seit 2026-11-16)

Apps, die AGB verlangen, halten die Zustimmung als Zeile in `consent_records` fest (Art, Fassung,
Zeitpunkt, Weg, Host – keine IP). Die Auskunft liefert diese Zeilen im Abschnitt des
`system`-Layers, die Löschung entfernt sie mit dem Konto
(`packages/system/server/utils/userDataContributor.ts`).

Wem die Zustimmung fehlt, der kann in diesen Apps nichts mehr anlegen
(`07.consent-required.ts`). **Auskunft und Löschung des eigenen Kontos hängen nicht daran:** beide
Routen liegen unter `/api/auth/`, und dieser Bereich steht auf der Erlaubnisliste der Tür
(`packages/core/shared/consentGate.ts`). Wer ein Recht aus der DSGVO ausübt, muss vorher keinen
AGB zustimmen.

## Die Liste: jede Tabelle hat eine Entscheidung

`packages/core/tests/support/userDataTables.ts` nennt für jede Tabelle und jede Ablage, in welcher
Datei sie für die Auskunft gelesen und für die Löschung geleert wird – oder mit einem Satz, warum
nicht. Der Test `packages/core/tests/user-data-coverage.test.ts` hält die Liste gegen die
Tabellen, die die Migrationen der Layer anlegen (seit 2026-11-16 aus den Migrations-Dateien gelesen,
`scripts/lib/migration-inventory.mjs`; vorher aus einer Soll-Liste von Hand), und gegen die
genannten Dateien.

**Neuer Layer – die Lösch-Pflicht hält ein Wächter.** Jedes `product.manifest.ts` sagt
`userData: true | false`. `pnpm check:manifests` (Prüfung 9) liest dazu den Dateibaum und die
Migrationen: `true` verlangt das Plugin `server/plugins/user-data.ts` mit
`registerUserDataContributor` und für jede Tabelle mit einer Personen-Spalte (Konto-Id, „…By",
E-Mail, IP, Handle, Name einer Person) einen Eintrag in der Liste, der nicht `NONE` heißt; `false`
ist rot, sobald eine Migration des Layers eine solche Spalte anlegt. Eine Spalte, die nur so heißt
und keine Person meint, steht mit Grund in `PERSON_COLUMN_EXCEPTIONS`
(`scripts/lib/user-data-duty.mjs`).

**Neue Tabelle oder Ablage – was zu tun ist:**

1. In die Soll-Liste des Paritäts-Skripts eintragen (ein Test hält sie gegen die Migrationen).
2. In `userDataTables.ts` eintragen: Datei für Export und Löschung, `skip('Grund')` oder `NONE`.
3. Trägt sie Daten über Menschen: im Beitrag des Layers lesen und leeren, mit Test.
4. Hat sie eine Frist: den Lauf nennen, der sie durchsetzt (nächster Abschnitt).

Eine neue **Spalte** an einer vorhandenen Tabelle sieht der Wächter nur, wenn sie wie eine Person
HEISST (`userId`, `invitedBy`, `email` …). Ein Feld mit neutralem Namen (`note`, `payload`,
`translations`) sieht er nicht. Wer einer Tabelle ein Feld mit Text, Name, Adresse oder Konto-Id
gibt, zieht den Beitrag und – wenn es Inhalt ist – den
Platzhalter des Layers von Hand nach (so fehlte der Übersetzungs-Cache `translations` nach seiner
Einführung in jedem Lösch-Weg).

## Was „gelöscht" heißt

| Inhalt | Beim eigenen Löschen | Bei der Kontolöschung |
| --- | --- | --- |
| Kommentar | MIT Antworten: Zeile bleibt als leerer Platzhalter (Text, Name, Konto-Id, Übersetzungen leer; Rechte des Kontos entfernt), damit Antworten darunter nicht zerreißen. OHNE Antworten (auch keine ausgeblendete) und ohne offene Meldung: die Zeile fällt ganz, dazu gelöschte Vorfahren, die dadurch kinderlos werden (KC2, `commentPrune.ts`) | derselbe Platzhalter (`commentTombstone.ts`), auch ohne Antworten |
| Beitrag | Status „gelöscht", nur noch die Autorin liest ihn; Ausschnitt im Verlauf und Erwähnungs-Benachrichtigungen fallen | Titel, Text, Umfrage, Übersetzungen, Konto-Id leer; nur die Moderation der Community liest den Rest |
| Private Nachricht | – | gelöscht; die Vorschau der Unterhaltung zeigt die letzte verbleibende Nachricht. Eine gemeldete Nachricht bleibt bis zu 90 Tage als Beleg |
| Termin | – | abgesagt und geschwärzt wie durch die Moderation (`eventRedaction.ts`): Titel, Beschreibung, Ort, Link, Bild weg |
| Kurs | – | bleibt (gehört der Community), ohne Namen und Konto-Id |
| Prüfergebnis (Brand Check) | beim Löschen der Marke: sofort unsichtbar | sofort unsichtbar; nach 90 Tagen endgültig weg bzw. ohne Bezug zur Person |
| Stimmen, Reaktionen, Zusagen, Einschreibungen, Abzeichen | – | gelöscht |
| Protokoll (`audit_logs`) | – | Name, IP und Zusatzangaben leer; die Konto-Id bleibt als Nachweis — bis der Eintrag 12 Monate nach dem Schreiben gelöscht wird (Frist unten) |

Die Listen-Route der Kommentare liefert für Gelöschtes nur noch die Struktur des Fadens und nie
`$permissions`. Betreiber-Exporte einer Community geben Gelöschtes ohne Text aus.

## Fristen und die Läufe, die sie durchsetzen

| Was | Frist | Lauf | Schalter | Zeile im Log |
| --- | --- | --- | --- | --- |
| Kopie der Daten eines gelöschten Kontos (Bucket `gdpr-exports`) | 30 Tage | `core/server/plugins/gdpr-export-prune.ts`, stündlich, in jeder App mit eingetragenem Bucket | keiner (ohne Bucket kein Lauf) | `gdpr.exports_pruned`, Fehler `gdpr.exports_prune_incomplete` / `gdpr.exports_prune_failed` |
| Versteckte Prüfergebnisse (`brand_checks.erasedAt`) | 90 Tage | `brand/server/plugins/brand-check-erasure.ts`, stündlich | `pukalani.brand.checkErasure` (off / dry-run / apply) | `brand.check_erasure`, Fehler `brand.check_erasure_incomplete` / `…_failed` |
| Adresse an Korrektur-Meldungen (`brand_check_corrections`) | 90 Tage ab Meldung | derselbe Lauf | derselbe | derselbe |
| Adresse eines Melders (`abuse_reports`) | 90 Tage ab Meldung | `control/server/plugins/trial-sweep.ts` | keiner | `abuse.reporter_email_pruned` |
| Zugangs-Anfragen (`invite_requests`), samt Adresse am Einladungscode | abgelehnt 30, eingelöst 90 Tage | derselbe Sammel-Lauf (`inviteRequestPrune.ts`) | keiner | – |
| Kontaktdaten von Gästen (`guest_authors`, Altbestand) | 90 Tage | `comments/server/plugins/guest-author-prune.ts` | keiner | `comments.guest_authors_pruned` |
| Protokolle und Ereignisse der Runner-Läufe | 30 / 90 Tage | `runner/server/plugins/run-retention.ts` | `pukalani.runner.retention` | `runner.retention` |
| Texte und Anhänge der Runner-Läufe (Auftragstext, Bericht-Text, Fehlertext, Anhang-Dateien; Kosten, Dauer, Commit und Kennungen bleiben) | 12 Monate nach dem Ende des Laufs | `runner/server/plugins/run-text-retention.ts`, stündlich (Regel `runner/shared/runTextRetention.ts`) | `pukalani.runner.textRetention` (off / count / apply; control: `apply` seit 2026-11-17) | `retention.run` mit `job: run-text-retention` (`deleted` zählt hier geleerte Läufe, die Zeile bleibt) |
| Runner-Läufe, die nie beendet wurden (Entwurf, oder hängt auf `queued`/`claimed`/`running`): werden abgebrochen (`cancelled`, Grund `abandoned`), danach greifen die beiden Fristen darüber | 7 Tage ohne Lebenszeichen (letzte Änderung der Zeile, Claim, Start, jüngstes Ereignis) | `runner/server/plugins/stale-run-retention.ts`, stündlich (Regel `runner/shared/staleRunRetention.ts`) | `pukalani.runner.staleRunRetention` (off / count / apply; control: `apply` seit 2026-11-18 — davor zählte er einen Tag lang nur, sechs Läufe, jedes Mal 0) | `retention.run` mit `job: stale-run-retention` (`deleted` zählt beendete Läufe, die Zeile bleibt) |
| Ereignisse des Marken-Bereichs (`brand_events`) | 24 Monate | `brand/server/plugins/brand-events-sweep.ts` | – | – |
| Beleg einer gemeldeten privaten Nachricht (`messages.reportedBody` und `reportedAt`) | 90 Tage nach der letzten Erledigung (ohne Meldungs-Zeile: ab der Meldung) | `messages/server/plugins/report-evidence-sweep.ts`, stündlich | `pukalani.messages.reportEvidenceSweep` (off / count / apply; platform und comments: `count`) | `messages.report_evidence_sweep` |
| Profilbild ohne Profil (Bucket `avatars`: hochgeladen, aber nie oder nicht mehr im Profil eingetragen, oder das Konto gibt es nicht mehr) | 7 Tage nach dem Upload | `core/server/plugins/avatar-orphan-sweep.ts`, alle 6 Stunden, nur in Apps mit Avatars-Bucket; Regel `core/shared/avatarOrphan.ts` | `pukalani.storage.avatarOrphanSweep` (off / count / apply; control, platform, portfolio: `apply` seit 2026-11-17; branding.supply hat keinen Bucket für Profilbilder) | `retention.run` mit `job: avatar-orphan-sweep`, dazu `avatar_orphan.sweep` (Dateien ohne eindeutigen Besitzer, vor dem Löschen doch eingetragene) |
| Warteliste von branding.supply (`brand_waitlist`) | nie bestätigt 30 Tage nach der letzten Anforderung eines Links, eingeladen oder abgelehnt 90 Tage nach dem letzten Schreiben, noch wartend 12 Monate ab dem Eintragen | `brand/server/plugins/brand-waitlist-retention.ts`, stündlich (Regel `brand/shared/brandWaitlistRetention.ts`) | `pukalani.brand.waitlistRetention` (off / count / apply; branding: `apply` seit 2026-11-17) | `retention.run` mit `job: brand-waitlist-retention`, Fehler `retention.incomplete` / `retention.failed` |
| Gesprächsanfragen von branding.supply (`brand_intro_requests`), unabhängig vom Status, auch mit Konto | 12 Monate ab dem Eingang | `brand/server/plugins/brand-intro-retention.ts`, stündlich (Regel `brand/shared/brandIntroRetention.ts`) | `pukalani.brand.introRequestRetention` (off / count / apply; branding: `apply` seit 2026-11-17) | `retention.run` mit `job: brand-intro-retention`, Fehler `retention.incomplete` / `retention.failed` |
| Gesprächsanfragen von pukalani.studio (`intro_requests`) | 12 Monate ab dem Eingang | `apps/portfolio/server/plugins/intro-request-retention.ts`, stündlich (Regel `apps/portfolio/shared/introRequestRetention.ts`; fehlt die Tabelle, ist nichts zu tun) | `pukalani.portfolio.introRequestRetention` (off / count / apply; ohne Wert `off`; portfolio: `apply` seit 2026-11-17) | `retention.run` mit `job: intro-request-retention`, Fehler `retention.incomplete` / `retention.failed` |
| Konto-Protokoll (`audit_logs`), jeder Eintrag — auch über Handlungen des Betreibers (Davids Entscheidung 2026-11-17) | 12 Monate ab dem Schreiben | `core/server/plugins/audit-log-retention.ts`, stündlich, in jeder App mit Schalter (Regel `core/shared/auditLogRetention.ts`; fehlt die Tabelle, ist nichts zu tun) | `pukalani.audit.retention` (off / count / apply; control, platform, branding, portfolio: `apply` seit 2026-11-17; die Test-App comments: `count`) | `retention.run` mit `job: audit-log-retention`, Fehler `retention.incomplete` / `retention.failed` |

**Gemeldete private Nachrichten (SEC-033, Davids Entscheidung 2026-11-12):** Den Text sieht die
Moderation nur, solange eine Meldung offen ist — in der Liste und in der Einzel-Ansicht entscheidet
dieselbe Funktion (`moderatorVisibleBody`, `packages/messages/shared/messageReport.ts`); das gilt
beim Lesen und damit sofort auch für alle schon erledigten Meldungen. Jede Einsicht steht im
Betreiber-Protokoll (`message_report.viewed`, `message_report.queue_viewed`). Danach bleibt die
Kopie 90 Tage gespeichert; der Lauf leert dann den eingefrorenen Beleg — `reportedBody` UND
`reportedAt`, in einem Schreibvorgang. Das Gespräch der Beteiligten (`body`) bleibt, ebenso die
Meldung und ihr Vermerk in `reports` (dort bleibt „wurde gemeldet" stehen). Warum auch der
Zeitstempel: er ist der Merker „es gibt einen Beleg"; ohne Beleg kein Merker — eine spätere neue
Meldung friert dann den Text von dann neu ein, statt eine offene Meldung ohne Text zu erzeugen, und
die Zeile fällt aus der Liste der Moderation und aus der Arbeitsliste des Laufs (`reportedAt != ''`).
Der Zeitpunkt der Erledigung ist das
`$updatedAt` der erledigten Meldungs-Zeile (keine eigene Spalte); eine neu geöffnete Meldung
schützt den Beleg, vor dem Leeren wird frisch gelesen. Der Stand wird je Nachricht nur in ihrer
eigenen Community gefragt. `apply` nimmt die Lauf-Sperre in `system_runs`. Scharf (`apply`) ist der Lauf
seit dem 2026-11-16 in `platform` und in der Test-App — Davids Ja zur gezählten Zahl (0 gemeldete
Nachrichten auf Production an diesem Tag); Rückweg ist `count` oder `off` in der `app.config.ts`
der App. Den Bestand zählt nur lesend
`node --env-file=<env-datei> packages/messages/scripts/report-evidence-count.mjs` (nur Zahlen,
dazu die Zahl der Dateien im Bucket der Lösch-Kopien). Die Kontolöschung des Autors behält ihre
eigene Regel (`evidenceStillProtected`, 90 Tage ab der Meldung).

Zwei Zahlen stehen bewusst nebeneinander (Davids Entscheidung vom 2026-11-15): Die vollständige
Kopie liegt kurz (30 Tage), die wenigen versteckten Reste länger (90 Tage). Der Hinweis vor dem
Löschen nennt beide.

Jeder Lauf hat eine Sperre gegen den Doppelstart im selben Prozess und eine Route zum Auslösen von
Hand, die ohne Angabe nur zählt:

- `POST /api/admin/gdpr-exports/prune` (`users.manage`)
- `POST /api/admin/avatars/orphan-sweep` (`storage.manage`; `{ apply: true }` löscht nur, wenn der
  Schalter der App auf `apply` steht, sonst 409 `sweep_not_enabled`)
- `POST /api/runner/retention/texts` (`runner.manage`; leert nur mit `{ apply: true }` und Schalter
  `apply`)
- `POST /api/runner/retention/stale` (`runner.manage`; beendet nur mit `{ apply: true }` und Schalter
  `apply`)
- `POST /api/brand/admin/check-erasure/run` (Betreiber von branding.supply)
- `POST /api/brand/admin/waitlist-retention/run` (Betreiber von branding.supply; löscht nur mit
  `{ apply: true }` und Schalter `apply`)
- `POST /api/brand/admin/intro-retention/run` (Betreiber von branding.supply; löscht nur mit
  `{ apply: true }` und Schalter `apply`)
- `POST /api/admin/intro-requests/retention/run` (pukalani.studio, `users.manage`; löscht nur mit
  `{ apply: true }` und Schalter `apply`)
- `POST /api/admin/audit-logs/retention/run` (`system.manage`; löscht nur mit `{ apply: true }` und
  Schalter `apply` und schreibt dann genau einen Eintrag `audit_log.retention_applied` mit den Zahlen)

Ein Ausfall fällt auf: jeder Lauf ist ein Zeit-Lauf (`defineTimedJob`), der tägliche Wächter „In die
App hinein" liest seine `job.run`-Zeilen und meldet einen Lauf, der überfällig ist oder scheitert
(OPS-011; erwartete Läufe je App: `ops/timed-jobs.conf`).

### Das Gerüst der Fristen-Läufe (seit 2026-11-17)

Neue Läufe, die nach einer Frist löschen, bauen auf einem gemeinsamen Gerüst auf:
`packages/core/shared/rowRetention.ts` (Schalter, Rechnung „älter als N Tage", Schleife — pur) und
`packages/core/server/utils/rowRetention.ts` (Anbindung an eine Tabelle, Sperre, Log-Zeilen). Der
Schalter hat drei Stellungen:

- `off` — der Lauf meldet sich nicht an (Vorgabe in Core und Layern).
- `count` — er liest mit genau der Auswahl, die `apply` träfe, schreibt nichts und meldet die Zahl
  je Takt als `retention.run` (mit `job`, `expired`, `byReason`). **So geht jeder neue Lauf live.**
- `apply` — er löscht. Gesetzt wird das je App in deren `app.config.ts`, mit Davids Ja zur gezählten
  Zahl; der Rückweg ist `count`.

Ein unbekannter Wert heißt `off` (Fehlerzeile `retention.invalid_mode`). Die Hand-Routen zählen ohne
Angabe nur; `{ "apply": true }` löscht nur, wenn der Schalter der App auf `apply` steht (sonst 409).
Wie ein neuer Lauf entsteht, steht im Kopf von `server/utils/rowRetention.ts`. Stand: Warteliste,
beide Gesprächsanfragen, Konto-Protokoll, Profilbilder und Runner-Texte liefen am 2026-11-17 zuerst
im Zähl-Modus und stehen seit demselben Tag in den ausgerollten Apps auf `apply` — Davids Ja zur
gezählten Zahl (fällig war genau ein Profilbild, dessen Konto es nicht mehr gibt; alles andere 0).
Die Test-App `apps/comments` bleibt auf `count`.

**Zurückholen innerhalb der 90 Tage** geht nur von Hand und nur für Prüfergebnisse: in der
Appwrite-Konsole das Feld `erasedAt` der Zeile leeren. Ein gelöschtes Konto und eine gelöschte Marke
kommen nicht zurück. Geplant ist ein Papierkorb für Marken (Punkt WH1,
[WIEDERHERSTELLUNG.md](../plans/WIEDERHERSTELLUNG.md)); Konten werden mit dem Pukalani-Konto
entschieden.

## Der Hinweis vor dem Löschen

`AccountDeleteCard.vue` zeigt über dem Knopf, was sofort weg ist, was 30 Tage als Kopie bleibt
(nur, wenn die App einen Bucket dafür hat) und dass es endgültig ist. Ein Layer hängt eine eigene
Zeile an, indem er einen i18n-Schlüssel unter `pukalani.account.deleteNotices` in seiner
`app.config.ts` nennt (heute: `brand`, `onboarding`, `messages`). `pnpm check:i18n-keys` prüft, dass
jeder genannte Schlüssel in beiden Sprachen existiert. **Ändert sich, was beim Löschen geschieht,
ändert sich dieser Text mit** – und die Datenschutztexte, die dieselben Fristen nennen: der
vorläufige Text von branding.supply (`apps/branding/scripts/legalPrivacyInterim.ts`, ein Test hält
die 90 Tage an den Konstanten fest; liegt auf Production als Zeile und wird eigens eingespielt), der
Entwurf auf pukalani.app (`apps/marketing/i18n/locales/*.json`, Abschnitt „Speicherdauer") und die
Vorlage für Communities (`packages/pages/shared/legalTemplates.ts`). Die verbindlichen Fassungen
prüft Davids Anwalt.

**Was das Löschen nicht darf oder zurücklässt (LA1, seit 2026-11-23).** Die Karte fragt
`GET /api/auth/account/deletion-check` (Vertrag `core/shared/accountDeletion.ts`):

- **Der letzte aktive Admin** (Label `admin`, Konto nicht gesperrt) kann sein Konto nicht löschen:
  die Karte sagt es vorher und sperrt den Knopf; `DELETE /api/auth/account` antwortet 409
  `last_admin` (SA1, `withLastAdminGuard` in `core/server/utils/lastAdmin.ts`). Erst bekommt ein
  anderes Konto das Admin-Recht.
- **Warnungen** melden Layer über `UserDataContributor.deletionWarnings`; sie verhindern nichts.
  Heute: onboarding meldet die Communities, in denen das Konto der letzte aktive Owner ist —
  dieselbe Rechnung wie die Löschung (`previewCommunityErasure`, Naht
  `/api/control/community/members/user-erase-preview`). Ist eine Frage gestört, sagt die Karte, dass
  die Liste unvollständig sein kann.

**Verwaister Inhaber-Platz neu vergeben (LA2, seit 2026-11-24).** Löscht der einzige Owner sein
Konto, bleibt seine Zeile ohne Adresse stehen, und „Besitz übertragen" kann niemand mehr. Ein
Betreiber (`sites.manage`, frische Anmeldung) gibt den Platz auf account.pukalani.app unter
„Inhaber-Platz" (`/dashboard/community-owner`) einem bestehenden Konto:

1. Community-Id eingeben, „Prüfen": `GET /api/onboarding/operator/community-owner` fragt das Control
   Plane nach den aktiven Ownern (Naht `members/owner-status`) und prüft JEDES Owner-Konto bei der
   eigenen Appwrite (`users.get`: nur 404 heißt gelöscht, jede andere Antwort 503).
2. Bei „Kein lebender Inhaber" die Adresse des neuen Inhabers nennen und bestätigen:
   `POST /api/onboarding/operator/community-owner` sucht das Konto (404 `account_not_found`), prüft
   noch einmal (lebt ein Owner, 409 `owner_present`) und ruft die Naht `members/owner-reassign`. Dort
   unter der Team-Sperre: die aktiven Owner müssen GENAU die geprüften sein (sonst 409
   `owner_changed`), das neue Konto wird Owner (eine vorhandene Zeile wird umgestellt), DANN werden
   die verwaisten Zeilen gelöscht. Scheitert das Löschen, wird der erste Schritt zurückgenommen.
3. Eintrag im Betreiber-Protokoll `community.owner_reassigned` (Ziel: die Community).

Die neue Rolle wirkt nach dem Rollen-Cache (bis 30 s); das Community-Label setzt die Seite beim
nächsten Besuch des neuen Inhabers selbst.

## Bewusst ausgenommen

- **Vertragsdaten einer Community** (`communities`: Name, Abo) – Aufbewahrungspflicht, gehört nicht
  dem einzelnen Konto.
- **Der letzte Owner einer Community** behält seine Mitglieds-Zeile mit Konto-Id (die Adresse wird
  geleert); welche Community betroffen ist, steht im Log. Vergibt ein Betreiber den Platz neu (LA2,
  oben), wird diese Zeile gelöscht.
- **Arbeitsmaterial der Betreiber-Konsole** (Tickets samt Anhängen, Auftragstexte der Runner-Läufe):
  die Inhalte bleiben, der Bezug zur Person wird geleert. Texte und Anhänge der Runner-Läufe fallen
  nach 12 Monaten (oben unter „Fristen").
- **Konto-Ids in der Unterhaltung des Gegenübers** (`conversations.participants`): Struktur des
  Fadens der anderen Person, kein lesbarer Inhalt.
- **Gemeldete private Nachrichten** bleiben bei der Kontolöschung bis zu 90 Tage als Beleg; wer sie
  liest und wann der Text fällt, steht oben unter „Fristen" (SEC-033).
- **Zeilen ohne Konto** sind seit dem 2026-11-17 NICHT mehr ausgenommen: Warteliste,
  Gesprächsanfragen (branding.supply und pukalani.studio) und das Konto-Protokoll haben je einen
  Lauf (oben unter „Fristen"), und er löscht. Entschieden am 2026-11-15 (Fristen) und am 2026-11-17
  (das Protokoll ganz, auch Einträge über Handlungen des Betreibers; Löschen eingeschaltet).

## Altbestand

`scripts/ops/erasure-backfill.mjs` bringt Zeilen, die vor P14 „gelöscht" wurden, auf den Stand, den
der Code heute schreibt. Ohne `--apply` zählt es nur; das Protokoll nennt nur Zahlen. Gegen eine
Instanz, die nicht lokal ist, braucht `--apply` zusätzlich `PUKALANI_TARGET_CONFIRM=<Projekt>` (seit
2026-11-16 die eine Ziel-Prüfung aller Skripte, `scripts/lib/target.mjs`; vorher hieß die Variable
`ERASURE_BACKFILL_CONFIRM`).
Zwei kleine Tests (in `messages` und `comments`) halten die Feldwerte des Skripts gegen die
Konstanten der Layer.

Seit dem 2026-11-18 kennt das Skript die Regel `notification-excerpts` (EL1 d): Meldungen zu
Antworten und Erwähnungen von vor dem 2026-11-15 behalten sonst ihren Textauszug, auch wenn der
Kommentar gelöscht ist. Die Regel leert nur den Auszug (`body`), die Meldung bleibt. „Alt" erkennt
sie an der Id (neue Meldungen tragen die feste Id `cmn…`), nicht am Text; eine Zeile mit zufälliger
Id von nach dem Stichtag bleibt und zählt als „nicht prüfbar". Ein dritter Test in `comments` hält
Id-Form und Typen gegen den Layer. Aufruf nur für diese Regel: `--only notification-excerpts`.

## Beweise

- Tests je Beitrag: `packages/*/tests/*UserData*.test.ts`, dazu `comment-deletion`, `postDeletion`,
  `messagesPreview`, `eventsOrganizerDeletion`, `brandCheckErasure*`, `communityErasure`.
- Listen-Test: `packages/core/tests/user-data-coverage.test.ts`.
- Naht-Wächter: `packages/control/tests/seamRuntimeProjectGuard.test.ts` (eine Naht-Route ohne
  Token, die ein Projekt aus dem Rumpf nimmt, muss es prüfen).
