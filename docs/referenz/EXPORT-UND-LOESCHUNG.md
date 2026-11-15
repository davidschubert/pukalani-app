# Export und Löschung – wie es gebaut ist

Stand: 2026-11-15 (Gesamtaudit, Paket P14). Diese Datei beschreibt, was geschieht, wenn jemand
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

## Die Liste: jede Tabelle hat eine Entscheidung

`packages/core/tests/support/userDataTables.ts` nennt für jede Tabelle und jede Ablage, in welcher
Datei sie für die Auskunft gelesen und für die Löschung geleert wird – oder mit einem Satz, warum
nicht. Der Test `packages/core/tests/user-data-coverage.test.ts` hält die Liste gegen die
Soll-Tabellen aus `scripts/ops/verify-schema-parity.mjs` und gegen die genannten Dateien.

**Neue Tabelle oder Ablage – was zu tun ist:**

1. In die Soll-Liste des Paritäts-Skripts eintragen (wie bisher).
2. In `userDataTables.ts` eintragen: Datei für Export und Löschung, `skip('Grund')` oder `NONE`.
3. Trägt sie Daten über Menschen: im Beitrag des Layers lesen und leeren, mit Test.
4. Hat sie eine Frist: den Lauf nennen, der sie durchsetzt (nächster Abschnitt).

Der Test sieht keine neue **Spalte** an einer vorhandenen Tabelle. Wer einer Tabelle ein Feld mit
Text, Name, Adresse oder Konto-Id gibt, zieht den Beitrag und – wenn es Inhalt ist – den
Platzhalter des Layers von Hand nach (so fehlte der Übersetzungs-Cache `translations` nach seiner
Einführung in jedem Lösch-Weg).

## Was „gelöscht" heißt

| Inhalt | Beim eigenen Löschen | Bei der Kontolöschung |
| --- | --- | --- |
| Kommentar | Zeile bleibt als leerer Platzhalter (Text, Name, Konto-Id, Übersetzungen leer; Rechte des Kontos entfernt), damit Antworten darunter nicht zerreißen | derselbe Platzhalter (`commentTombstone.ts`) |
| Beitrag | Status „gelöscht", nur noch die Autorin liest ihn; Ausschnitt im Verlauf und Erwähnungs-Benachrichtigungen fallen | Titel, Text, Umfrage, Übersetzungen, Konto-Id leer; nur die Moderation der Community liest den Rest |
| Private Nachricht | – | gelöscht; die Vorschau der Unterhaltung zeigt die letzte verbleibende Nachricht. Eine gemeldete Nachricht bleibt bis zu 90 Tage als Beleg |
| Termin | – | abgesagt und geschwärzt wie durch die Moderation (`eventRedaction.ts`): Titel, Beschreibung, Ort, Link, Bild weg |
| Kurs | – | bleibt (gehört der Community), ohne Namen und Konto-Id |
| Prüfergebnis (Brand Check) | beim Löschen der Marke: sofort unsichtbar | sofort unsichtbar; nach 90 Tagen endgültig weg bzw. ohne Bezug zur Person |
| Stimmen, Reaktionen, Zusagen, Einschreibungen, Abzeichen | – | gelöscht |
| Protokoll (`audit_logs`) | – | Name, IP und Zusatzangaben leer; die Konto-Id bleibt als Nachweis |

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
| Ereignisse des Marken-Bereichs (`brand_events`) | 24 Monate | `brand/server/plugins/brand-events-sweep.ts` | – | – |

Zwei Zahlen stehen bewusst nebeneinander (Davids Entscheidung vom 2026-11-15): Die vollständige
Kopie liegt kurz (30 Tage), die wenigen versteckten Reste länger (90 Tage). Der Hinweis vor dem
Löschen nennt beide.

Jeder Lauf hat eine Sperre gegen den Doppelstart im selben Prozess und eine Route zum Auslösen von
Hand, die ohne Angabe nur zählt:

- `POST /api/admin/gdpr-exports/prune` (`users.manage`)
- `POST /api/brand/admin/check-erasure/run` (Betreiber von branding.supply)

Ein Ausfall zeigt sich heute nur als Fehlerzeile im Log der App. Ein Alarm in die Betreiber-Ansicht
hinein ist ein eigenes Paket (Gesamtaudit P22).

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

## Bewusst ausgenommen

- **Vertragsdaten einer Community** (`communities`: Name, Abo) – Aufbewahrungspflicht, gehört nicht
  dem einzelnen Konto.
- **Der letzte Owner einer Community** behält seine Mitglieds-Zeile mit Konto-Id (die Adresse wird
  geleert); welche Community betroffen ist, steht im Log.
- **Arbeitsmaterial der Betreiber-Konsole** (Tickets samt Anhängen, Auftragstexte der Runner-Läufe):
  die Inhalte bleiben, der Bezug zur Person wird geleert.
- **Konto-Ids in der Unterhaltung des Gegenübers** (`conversations.participants`): Struktur des
  Fadens der anderen Person, kein lesbarer Inhalt.
- **Gemeldete private Nachrichten** bleiben bis zu 90 Tage als Beleg (eigenes Paket P16 regelt, wer
  sie liest und wann sie fallen).
- **Zeilen ohne Konto**: Warteliste und Gesprächsanfragen von Menschen, die nie ein Konto angelegt
  haben, und das Konto-Protokoll haben heute noch keinen Lauf. Die Fristen sind entschieden
  (2026-11-15: Warteliste 30 / 90 Tage / 12 Monate, Gesprächsanfragen und Protokoll 12 Monate), der
  Bau ist der offene Punkt EL1 (c) in [OPEN-ITEMS](../OPEN-ITEMS.md).

## Altbestand

`scripts/ops/erasure-backfill.mjs` bringt Zeilen, die vor P14 „gelöscht" wurden, auf den Stand, den
der Code heute schreibt. Ohne `--apply` zählt es nur; das Protokoll nennt nur Zahlen. Gegen eine
Instanz, die nicht `localhost` ist, braucht `--apply` zusätzlich `ERASURE_BACKFILL_CONFIRM=<Projekt>`.
Zwei kleine Tests (in `messages` und `comments`) halten die Feldwerte des Skripts gegen die
Konstanten der Layer.

## Beweise

- Tests je Beitrag: `packages/*/tests/*UserData*.test.ts`, dazu `comment-deletion`, `postDeletion`,
  `messagesPreview`, `eventsOrganizerDeletion`, `brandCheckErasure*`, `communityErasure`.
- Listen-Test: `packages/core/tests/user-data-coverage.test.ts`.
- Naht-Wächter: `packages/control/tests/seamRuntimeProjectGuard.test.ts` (eine Naht-Route ohne
  Token, die ein Projekt aus dem Rumpf nimmt, muss es prüfen).
