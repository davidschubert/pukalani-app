# Gelöschtes zurückholen – Plan (WH1)

> **Plan-Status (2026-11-21):** nicht gebaut ([OPEN-ITEMS](../OPEN-ITEMS.md) „WH1“).

Stand: 2026-11-15. Noch nicht gebaut. Offener Punkt: **WH1** in
[OPEN-ITEMS](../OPEN-ITEMS.md). Was heute gilt, steht in
[EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md).

## Der Wunsch

David, 2026-11-12: gelöschte Konten und Marken 90 Tage lang zurückholen können,
danach endgültig löschen; an jeder Lösch-Stelle steht klar, was gelöscht wird
und was bleibt.

Gebaut ist seit dem 2026-11-15 nur ein Teil davon: Prüfergebnisse (Brand Checks)
werden beim Löschen sofort versteckt und nach 90 Tagen endgültig gelöscht;
zurückholen kann in der Zeit nur der Betreiber von Hand. Ein gelöschtes Konto
und eine gelöschte Marke kommen nicht zurück. In der Oberfläche gibt es bisher
gar keinen Knopf „Marke löschen" (nur die Route dahinter).

## Entscheidungen (David, 2026-11-15, zum Anklicken)

| Frage | Entscheidung |
| --- | --- |
| Gelöschte Marke zurückholen | **Papierkorb zum Selbst-Zurückholen:** neuer Knopf „Marke löschen"; die Marke verschwindet sofort überall, liegt 90 Tage unter „Gelöschte Marken" und wird danach endgültig gelöscht |
| Gelöschtes Konto zurückholen | **Mit dem Pukalani-Konto entscheiden.** Heute bleibt der Satz „kann nicht wiederhergestellt werden" |
| Hochgeladene Bilder und Logo-Entwürfe einer gelöschten Marke | **90 Tage behalten**, damit die Marke vollständig zurückkommt; der Hinweis beim Löschen sagt es |
| Zurückgeholte Marke, die veröffentlicht war | **Bleibt zurückgezogen;** wer sie wieder zeigen will, veröffentlicht neu und durchläuft die Freigabe noch einmal |

Noch offen, mit Vorschlag (wird im Prototyp gezeigt und dort entschieden):

- **„Jetzt endgültig löschen" im Papierkorb:** Vorschlag ja, nach erneuter
  Anmeldung. Wer wirklich sofort alles weg haben will, darf nicht 90 Tage warten
  müssen.
- **Bedenkzeit für Konten, wenn sie mit dem Pukalani-Konto kommt:** Vorschlag
  30 Tage statt 90. Bekannte Dienste liegen bei Konten bei rund 14 bis 30 Tagen;
  90 Tage sind für einzelne Dinge üblich (ein Projekt, ein Papierkorb), für ein
  ganzes Konto ungewöhnlich lang (Angabe aus allgemeinem Wissen, nicht eigens
  nachgeprüft).

## Warum Marken jetzt und Konten später

**Marken sind überschaubar.** Die Marken-Tabellen sind nur über unseren Server
erreichbar (`permissions: []`, keine Rechte an einzelnen Zeilen). Ein
Kennzeichen an der Marke reicht, damit sie überall als „nicht vorhanden" gilt;
fast alle Wege laufen schon durch eine einzige Stelle (`loadOwnedProfile`).

**Konten sind es nicht.** Ein Konto bei Appwrite zu löschen lässt sich nicht
rückgängig machen; zurückholbar ist es nur, solange es NICHT gelöscht ist. Dann
müssten aber alle Inhalte in der Zeit versteckt sein, und zwar wirklich: Inhalte
der Communities sind direkt bei Appwrite und über Live-Aktualisierung lesbar,
verstecken heißt dort Leserechte entziehen und später wiederherstellen. Dafür
bräuchte jeder der 16 Beiträge zu Export und Löschung zwei neue Wege
(verstecken, zurückholen), dazu die Naht zum Control Plane. Und genau diese
Stelle baut das Pukalani-Konto um (Löschung zentral, Etappen E2 bis E4 in
[PUKALANI-KONTO.md](PUKALANI-KONTO.md)); heute gebaut, würde es zweimal gebaut.

**Verworfen: Zurückholen aus der Sicherungskopie.** Die Kopie enthält kein
Passwort, keinen zweiten Faktor und keine Dateien; Kommentare und Beiträge haben
beim Löschen ihre Konto-Kennung schon verloren; Nachrichten, Stimmen und
Mitgliedschaften sind hart gelöscht. Sie liegt nur 30 Tage, und nicht jede Seite
hat sie (branding.supply nicht).

## Was „Papierkorb" für eine Marke heißt

- **Löschen:** die Marke bekommt den Zeitpunkt „gelöscht seit". Ab dann gilt
  sie in jedem Weg als nicht vorhanden: eigene Liste, Werkstatt, geteilte Links,
  Galerie, Sichtbarkeit im Marktvergleich. Ihre Prüfergebnisse werden wie heute
  versteckt, eine Veröffentlichung wird zurückgezogen. Gelöscht wird in diesem
  Moment nichts.
- **Papierkorb:** unter „Gelöschte Marken" stehen Name, Datum und die
  verbleibenden Tage, dazu „Zurückholen" und „Jetzt endgültig löschen".
- **Zurückholen:** das Kennzeichen fällt, die Marke steht wieder in der Liste,
  mit allen Kapiteln, Gesprächen, Bildern und Entwürfen. Die Prüfergebnisse
  werden wieder sichtbar – genau die, die dieses Löschen versteckt hat, und nur,
  solange die 90 Tage nicht um sind. Geteilte Links bleiben beendet, die
  Veröffentlichung bleibt zurückgezogen (die Adresse in der Galerie bleibt
  reserviert).
- **Nach 90 Tagen:** ein stündlicher Lauf löscht die Marke mit allem, was an ihr
  hängt (das, was die Lösch-Route heute sofort tut).
- **Kontolöschung:** entfernt auch Marken im Papierkorb sofort, und die Auskunft
  nennt sie weiter.

## Bau in vier Schritten

Alles im Layer `brand` (läuft nur auf branding.supply).

1. **Kennzeichen und Regel.** Migration `brand-027` (nur Projekt `branding`):
   Spalte `erasedAt` an `brand_profiles` samt Index. Eine reine Regel neben
   `brandCheckErasure.ts` („sichtbar / im Papierkorb / fällig"). Der Filter in
   `loadOwnedProfile` und in den 13 Dateien, die die Tabelle direkt lesen.
2. **Löschen wird Verstecken.** `profiles/[id]/index.delete.ts` setzt das
   Kennzeichen, versteckt die Prüfergebnisse, zieht die Veröffentlichung zurück.
   Die heutige Kaskade (Kapitel, Gespräche, Links, Ereignisse, Funde, Bilder,
   Entwürfe, Marktvergleich) wandert in eine Funktion, die ohne Anfrage läuft.
   Geteilte Links (`share/[token].get.ts`) und die Sichtbarkeit im
   Marktvergleich achten auf das Kennzeichen.
3. **Zurückholen und Lauf.** Route „zurückholen", Route „jetzt endgültig" (nach
   erneuter Anmeldung), stündlicher Lauf mit Schalter (aus / nur zählen /
   löschen) und Hand-Route, nach dem Muster von `brandCheckErasureRun.ts`.
4. **Oberfläche.** Knopf „Marke löschen" mit Hinweis, Abschnitt „Gelöschte
   Marken" in `dashboard/brands/index.vue`, Texte de und en.

Aufwand: zusammen etwa ein Tag Bau, dazu Prototyp und Beweise.

## Ablauf nach dem Haus-Workflow

1. **Strategie:** diese Datei (Analyse und Entscheidungen).
2. **Konzeption:** die zwei offenen Punkte oben klären; Hinweis-Texte de und en.
3. **Prototyp und Freigabe:** Lösch-Dialog mit Hinweis und der Abschnitt
   „Gelöschte Marken" in echten Nuxt-UI-Komponenten; David gibt frei.
4. **Umsetzung:** die vier Schritte oben.
5. **Audit und Beweise:**
   - Tabellen-Test der Regel;
   - Sichtbarkeits-Test über jeden Weg nach außen (Muster:
     `brandCheckErasureVisibility.test.ts`);
   - Test des Laufs;
   - ein Listen-Test, der jede Datei nennt, die `brand_profiles` liest, mit
     einer Entscheidung (Muster: `user-data-coverage.test.ts`);
   - Erweiterung von `brandUserDataStrict.test.ts` (Kontolöschung und Auskunft
     finden Marken im Papierkorb);
   - lokal mit Wegwerf-Konto: veröffentlichen, teilen, löschen, jede öffentliche
     Adresse prüfen, zurückholen, Frist ablaufen lassen.
6. **Ausliefern:** Migration vor dem Code (Vorbedingung in den PR-Titel);
   Lauf erst auf „nur zählen", dann mit Davids Ja auf „löschen".
7. **Doku:** `EXPORT-UND-LOESCHUNG.md`, Hilfetext, Datenschutztext von
   branding.supply (Fristenliste, beide Sprachen), Changelog.

## Was die Texte dann sagen müssen

Hinweis am Knopf „Marke löschen": sofort für alle unsichtbar · 90 Tage unter
„Gelöschte Marken" zurückholbar · danach endgültig gelöscht · geteilte Links und
die Galerie enden sofort, neu veröffentlichen braucht eine neue Freigabe · wer
sein Konto löscht, löscht auch Marken im Papierkorb sofort. Die Zeile des
`brand`-Layers im Hinweis vor der Kontolöschung (`brand.account.deleteNotice`)
ändert sich passend. Der Datenschutztext sagt heute, eine einzelne Marke löscht
der Betreiber auf Anfrage; mit dem Knopf wird daraus die neue Frist.

## Fallen, die der Bau kennen muss

- **Kontolöschung muss Marken im Papierkorb finden.** Erbt der Beitrag zu
  Export und Löschung den neuen Filter „nicht gelöscht", überleben solche Marken
  das Konto um bis zu 90 Tage und fehlen in der Auskunft.
- **13 Dateien lesen `brand_profiles` an `loadOwnedProfile` vorbei.** Jede
  braucht eine Entscheidung; der Listen-Test hält das fest.
- **Der Lauf für Prüfergebnisse nimmt Website-Ergebnissen nach 90 Tagen den
  Bezug zur Person.** Zurückholen darf nur die Ergebnisse wieder zeigen, die
  dieses Löschen versteckt hat, und muss ablehnen, sobald die Frist um ist.
- **Ein halb durchgelaufener Lösch-Lauf** darf keine sichtbare halbe Marke
  hinterlassen: die Marke bleibt versteckt, der Lauf versucht es wieder.
- **Der Schalter des Laufs steht ohne Angabe auf „aus".** Ohne die Zeile in
  `apps/branding/app/app.config.ts` wird nie etwas endgültig gelöscht.
- **Bilder Dritter:** hochgeladene Vorbilder liegen 90 Tage weiter im Speicher.
  Das ist entschieden, gehört aber in den Hinweis und in den Datenschutztext.
- **Ein Ausfall des Laufs** hält Daten länger als zugesagt und steht heute nur
  im Protokoll der App (der Alarm dafür ist ein eigenes Paket).

## Für später: was ein zurückholbares Konto bräuchte

Als Merkzettel für das Pukalani-Konto, nicht Teil von WH1:

- eine eigene Zeile „Löschung vorgemerkt" statt nur „gesperrt" – gesperrt
  bedeutet heute schon „vom Betreiber wegen Missbrauch gesperrt", ein
  Zurückholen dürfte so ein Konto nicht entsperren;
- der Nachweis ohne Anmeldung: ein einmaliger Link an die bestätigte Adresse,
  der nur die Löschung aufhebt und keine Sitzung gibt;
- der Name (`account_handles`) darf in der Zeit nicht frei werden;
- der letzte Owner einer Community: in der Bedenkzeit hat sie niemanden, der
  handelt, während das Abo weiterläuft;
- der Kunde bei Stripe wird heute mitgelöscht, das lässt sich nicht umkehren;
- ein Weg „jetzt endgültig" muss bleiben, für ausdrückliche Lösch-Wünsche.
