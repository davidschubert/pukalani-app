# KR1 — Einzelheiten

> Einzelheiten zum offenen Punkt **KR1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**KR1 — Davids Klick-Runde auf den echten Seiten.** Stand 2026-11-23: acht
Blöcke, zusammen gut zwei Stunden — am besten in ZWEI Sitzungen (Teil 1 ohne
und mit Wegwerf-Konto, Teil 2 als Owner und Betreiber). Die Proben sind nach
Anmeldung sortiert: du wechselst das Konto so selten wie möglich. Jede Probe
sagt: wo, mit wem, was du klickst, was du sehen musst, und was du tust, wenn
nicht. „Wortlaut kann abweichen" heißt: die Beschreibung stammt aus dem Code
oder der Sprachdatei, nicht aus einem Blick auf die echte Seite — gilt der
Sinn, nicht das Wort.

**Stand Sitzung 1 (2026-11-24, mit David):**

- **Erledigt:** G (Handprüfung: `anthropic` übernommen, Tonwörter auf
  „Direct, Thoughtful" gekürzt, `verified` DS 2026-11-24; `nike` verworfen,
  der alte Nike-Eintrag bleibt mit `keptStale` stehen wie apple/the-barn;
  übernehmen und Vermerk setzen macht die nächste Sitzung), F (F1 und F2
  passen, Davids Ja zur Copy = Gate K7), A1 (Bremse greift).
- **Gescheitert:** A2 und A3 — die Bot-Prüfung liefert auf Production kein
  Ergebnis, die Absende-Knöpfe bleiben grau (Punkt BP2). A4 und A5 hängen an
  derselben Prüfung und sind deshalb nicht geklickt.
- **Verschoben in Sitzung 2:** B6 (geht nur mit eigenem Konto, siehe dort),
  B7 (es gibt noch kein Wegwerf-Konto; anlegen erst, wenn BP2 behoben ist),
  B8 (NordPass hatte keinen Eintrag für das Konto — Markup stimmt, mit
  gespeichertem Eintrag wiederholen). Danach A2, A4, A5 nachholen.

**Reihenfolge und Zeit je Block** (die Buchstaben bleiben, andere Einträge
verweisen darauf):

| Sitzung | Block | Mit wem | Zeit |
|---|---|---|---|
| 1 | G — Marktvergleich-Entwürfe prüfen (Datei, kein Konto) | niemand | ≈ 15 Min |
| 1 | A — ohne Anmeldung | Gast, privates Fenster | ≈ 20 Min |
| 1 | F — branding.supply: Beispiel-Kit und Texte | Gast | ≈ 5 Min |
| 1 | B — Wegwerf-Konto | privates Fenster | ≈ 15 Min |
| 2 | C — Owner mit dem Wegwerf-Konto zugleich | du + Wegwerf-Konto | ≈ 25 Min |
| 2 | H — neu seit dem 2026-11-22 (H1–H2 als Owner, H3–H6 als Betreiber) | du (+ Wegwerf-Konto bei H3) | ≈ 30 Min |
| 2 | D — Betreiber | du, `admin.pukalani.app` | ≈ 15 Min |
| — | E — Neues aus den Paketen Q01–Q26 (hängt in A–D mit drin, nur Blick) | wie dort | ≈ 10 Min |

Sitzung 1 ≈ 55 Min, Sitzung 2 ≈ 80 Min.

**Vorher einmal (5 Min):** ein Wegwerf-Konto auf `account.pukalani.app`
anlegen (eigene Mail-Adresse mit Postfach, Wegwerf-Passwort, das du sonst nirgends
nutzt). Zwei Browser-Fenster: eines als du (Owner/Betreiber), eines privat für
das Wegwerf-Konto. Ein zweites Postfach-Fenster (Webmail) offen halten.

**Wenn eine Probe scheitert:** nichts reparieren. Den Satz auf dem Bildschirm
(oder ein Foto), die Adresse und die Uhrzeit notieren und hier melden; der
Leitstand legt daraus einen Punkt an. Ein „hier gerade nicht verfügbar" bei
einer Anmeldung heißt: Schalter „Email OTP" im Projekt prüfen
([ANMELDE-REGELN.md](../../runbooks/ANMELDE-REGELN.md)) — erst melden, dann
anfassen.

## Block A — ohne Anmeldung (Gast, privates Fenster) · ≈ 20 Min

1. **Anmelde-Bremse** ([AB1 a](AB1.md)) · `account.pukalani.app/login` · Gast.
   Die Mail des Wegwerf-Kontos eintragen, sechsmal ein FALSCHES Passwort,
   „Anmelden". *Sehen:* erst die Fehlermeldung zu falschen Daten, nach einigen
   Versuchen „Zu viele Versuche. Warte noch {n} Sekunden/Minuten und versuch es
   dann noch einmal." (Wortlaut kann abweichen: Zahl und Einheit.) Der Knopf
   bleibt bedienbar, die Seite stürzt nicht ab. *Sonst:* Wortlaut und ob eine
   Zeit genannt wurde melden. Anschließend 15 Minuten nichts mit diesem Konto.
2. **Gestohlenes Passwort** (P29, [ANMELDE-REGELN.md](../../runbooks/ANMELDE-REGELN.md))
   · `account.pukalani.app/register` · Gast. Neue, noch nicht benutzte Mail
   eintragen und ein bekanntes Leck-Passwort versuchen (zum Beispiel
   „Password123!"). *Sehen:* „Dieses Passwort ist in bekannten Datenlecks
   aufgetaucht. Bitte wähle ein anderes." und KEIN neues Konto (danach
   Anmeldung mit der Mail geht nicht). *Sonst:* Konto entstanden ⇒ melden,
   Konto im Betreiber-Dashboard löschen lassen.
3. **Erstgespräch auf der Studio-Site** · `pukalani.studio/erstgespraech` · Gast.
   Alle Schritte mit eigener Adresse ausfüllen, im letzten Schritt abschicken.
   *Sehen:* das Feld der Bot-Prüfung lädt, der Knopf wird nach einem
   Augenblick frei, eine Bestätigung erscheint. Eine Mail geht NUR an die
   Studio-Adresse (dein Postfach), nicht an die eingetragene Adresse: sie hat
   Anrede („Hallo …") und Schluss-Zeile mit dem Namen der Marke.
   *Sonst:* Knopf bleibt grau oder „Bot-Prüfung fehlgeschlagen" ⇒ melden mit
   Browser und Uhrzeit.
4. **Formulare von branding.supply** ([SR1 a](SR1.md)) · `branding.supply` (die
   Knöpfe zum Erstgespräch und zur Warteliste) · Gast. Beide je einmal mit
   eigener Adresse abschicken. *Sehen:* Feld der Bot-Prüfung, Anfrage geht
   durch, die Bestätigungs-Mail trägt „Branding Supply" als Schluss-Zeile und
   enthält nicht deinen eigenen Text. *Sonst:* Anfrage kommt nicht an ⇒ melden.
5. **Anmeldung per Code, Gast-Seite** ([SV1 a](SV1.md)) · `account.pukalani.app/login`
   → „Ohne Passwort anmelden (Code per E-Mail)" · Wegwerf-Konto. „Code
   anfordern". *Sehen:* Mail kommt in deiner Sprache, mit der Sicherheitsphrase
   („Deine Sicherheitsphrase (steht auch in der Mail):") und einem
   6-stelligen Code; Absender-Name ist die Marke. Code eintippen, „Anmelden"
   ⇒ du bist drin. Danach abmelden. *Sonst:* „hier gerade nicht verfügbar" ⇒
   siehe oben. Dasselbe einmal auf `branding.supply` (dort „ihr" statt „du" in
   der Mail).

## Block B — als Wegwerf-Konto (privates Fenster) · ≈ 15 Min

6. **Profilbild auf den drei Seiten** ([PB1 a](PB1.md)) · `admin.pukalani.app`,
   `portfolio.pukalani.app`, `branding.supply` · DEIN Konto, nicht das
   Wegwerf-Konto: die drei sind eigene Projekte, das Wegwerf-Konto gibt es
   dort nicht (admin. zeigt ihm eine leere Seite). Gehört deshalb in
   Sitzung 2. Ort: Dashboard → Einstellungen (`/dashboard/settings`), auf
   branding.supply `/de/account`. Ein kleines Bild hochladen, speichern,
   danach dein altes Bild zurücksetzen. *Sehen:* das Bild erscheint im Kopf
   und nach Neuladen weiter. *Sonst:* Fehlermeldung beim Hochladen ⇒ dem
   Schlüssel fehlt dort das Schreibrecht für Dateien
   ([APPWRITE-KEYS.md](../../runbooks/APPWRITE-KEYS.md)); melden, nicht
   anfassen.
7. **Mitmachen als Mitglied** (Rest MM1, [MM1 a](MM1.md)) · `demo.pukalani.app` ·
   Wegwerf-Konto, noch KEIN Mitglied. Ein Kommentar schreiben. *Sehen:* die
   Seite bittet um Beitritt oder lehnt höflich ab (kein Absturz). Danach in
   Block C wird das Konto Mitglied.
8. **Passwort-Manager** (Q08) · `account.pukalani.app/login` · Wegwerf-Konto.
   Beim Anmelden füllt dein Passwort-Manager E-Mail und Passwort von allein
   (Feld „E-Mail" ist `username`, Passwort `current-password`). *Sonst:*
   Manager erkennt die Felder nicht ⇒ melden mit Name des Managers.

## Block C — als Owner (du) mit dem Wegwerf-Konto zugleich · ≈ 25 Min

Du bist Owner der Demo-Community `demo.pukalani.app` (eigenes Fenster), das
Wegwerf-Konto bleibt im privaten Fenster angemeldet.

9. **Einladen, Annehmen, Entziehen** ([SI1 a](SI1.md), [MM1 a](MM1.md)) · als Owner:
   Dashboard → Mitglieder → die Mail des Wegwerf-Kontos einladen. Im
   Webmail-Fenster den Link der Einladungs-Mail öffnen. *Sehen:* die Seite
   zeigt die Einladung (nicht „Link ungültig"); Annehmen ⇒ das Konto ist
   Mitglied. Dann als Owner „Zugang entziehen" und im Dialog bestätigen.
   *Sehen (Owner):* die Liste zeigt „entfernt", KEIN Hinweis auf einen offenen
   Lese-Zugang. *Sehen (Wegwerf-Konto, Seite neu laden):* eine Hinweisseite
   statt der Community; dort eine Nachricht an die Leitung schreiben ⇒ beim
   Owner kommt Mail und Glocke. Neue Einladung annehmen ⇒ wieder Mitglied.
   *Sonst:* jede Abweichung melden.
10. **Alte Antwort nach dem Entfernen** (N03) · Vorher als Wegwerf-Konto einen
    Kommentar schreiben (Block B/7 ersatzweise jetzt), Konto entfernen
    (Probe 9), dann als Owner auf diesen Kommentar antworten. *Sehen:* das
    entfernte Konto bekommt KEINE Mail, der Kommentar zeigt „Ehemaliges
    Mitglied".
11. **Hauptsprache der Community** (Q10; die Demo-Community bleibt englisch,
    COMPLETE „SU1 (a)") · als Owner einer WEGWERF-Community: Dashboard →
    „Name und Beschreibung" → Hauptsprache wählen (Deutsch) → Speichern.
    *Sehen:* gespeichert, kein Fehler; Seitenquelltext einer Diskussion
    enthält `rel="canonical"` mit der Adresse ohne `/en`. Wortlaut kann
    abweichen.
12. **Statistik mit eigener Zähl-Seite** ([KK1 b](KK1.md)) · als Owner einer
    Community mit eigener Zähl-Seite: Kennung speichern, Zahlen-Seite öffnen.
    *Sehen:* Zahlen erscheinen und gehören der eigenen Adresse, keine fremden.
    Hast du keine solche Community, überspringen und notieren.

## Block D — als Betreiber (du, `admin.pukalani.app`) · ≈ 15 Min

13. **Personen-Liste exportieren, neu anmelden** ([BP1 a](BP1.md)) · Dashboard →
    „Personen" → Liste exportieren (Datei kommt). Mehr als zehn Minuten
    warten (in der Zeit Probe 14, 15), dann noch einmal exportieren.
    *Sehen:* „Zur Sicherheit neu anmelden"; nach der Anmeldung geht es auf
    derselben Seite weiter. Ein Konto öffnen: die Karte „Aktivität" zeigt
    Einträge.
14. **Einladungs-Code und neue Community** ([SV1 a](SV1.md)) · im
    Betreiber-Dashboard einen Einladungs-Code anlegen, dann auf
    `account.pukalani.app` eine Community anlegen (Assistent fragt zuerst nach
    dem Code). *Sehen:* das Kästchen der Betreiber-Bedingungen ist da und ohne
    Haken geht es nicht weiter.
15. **Plan, Testphase, Domain** ([PD1 b](PD1.md)) · (a) Wizard mit einem Konto, das
    seine Testphase schon hatte: erwartet „Ohne Testphase". (b) Wizard mit einem
    Konto ohne bestätigte Mail-Adresse: Kasten und Knopf „Mail erneut senden"
    erscheinen. (c) In der Betreiber-Tabelle den Schalter „freigegeben" an einer
    Community umlegen und zurück. (d) Die Domain-Seite eines Owners ohne
    Freigabe öffnen. Wortlaut kann abweichen. *Sonst:* melden, nichts
    umstellen, was nicht zurückgestellt ist. Hier KEINE echte Zahlung.

## Block E — Neu seit den Paketen (Q01–Q26) · höchstens zwölf, wichtigste zuerst

Dinge, die noch kein Mensch hinter der Anmeldung live gesehen hat. Du machst
sie nebenbei in den Blöcken A–D.

E1. **Konto-Abrechnung und Plan-Seite (Geld)** (Q14, Q15) · als Owner:
    Dashboard → Abrechnung und Plan. *Sehen:* Preise und Namen Basic / Personal / Pro
    stimmen mit der Preis-Seite von `pukalani.app` überein, die Liste lädt ohne den Satz
    „Keine Einträge" für einen Augenblick, ein Fehler zeigt „Noch einmal
    versuchen". Keine Buchung auslösen.
E2. **Betreiber-Listen: Nutzer, Einladungs-Codes, Abos** (Q14) · Block D:
    jede Liste öffnen, einmal Neuladen. *Sehen:* erst „lädt", dann Daten oder
    ein leerer Zustand mit Erklärung — nie kurz „leer", dann Daten.
E3. **Mitglieder: Löschen fragt im eigenen Dialog** (Q14) · Block C/9:
    „Zugang entziehen" öffnet einen Dialog der Seite, nicht das graue Fenster
    des Browsers.
E4. **Anmelde-Mails im Ton der Marke** (Q06) · Block A/5 und die Registrierung
    aus A/2 mit gültigem Passwort an einer weiteren Wegwerf-Adresse:
    Bestätigungs-Mail hat die Anrede, den Markennamen des Projekts (nicht
    „Appwrite") und die Sprache des Kontos.
E5. **Mails an Mitglieder** (Q06) · Block C/9: die Einladungs-Mail und die
    Mail „entfernte Person" haben Anrede „Hallo {Name}," und Schluss-Zeile mit
    der Marke.
E6. **Zeichen auf der Anmelde-Seite** (Q24) · `account.pukalani.app/login`,
    `branding.supply`, die Studio-Site: das Zeichen der Marke steht oben,
    in hellem und in dunklem Modus lesbar, die drei Marken zeigen aufeinander
    (Fußzeile). Wortlaut kann abweichen.
E7. **Menü-Knopf in der Community** (Q01) · `demo.pukalani.app` im schmalen
    Fenster (375 px oder am Handy): links drei Striche, die Schublade zeigt alle
    Punkte; Feedback-Knopf verdeckt am Seitenende nichts.
E8. **Deutsche Wörter** (Q16) · beim Durchklicken: „Konto" statt Account,
    „Marke" und „Marken entdecken" (Menü von branding.supply auf Deutsch
    deutsch), „Einladungscode". Ein englisches Wort in einer deutschen Seite
    ⇒ notieren.
E9. **Vorschaubild „Marken entdecken"** (neu, Bahn 3) · einen Link zu einer
    Marke unter `branding.supply` (Marken entdecken, eine Marke öffnen; Adresse kann abweichen) in eine Nachrichten-App
    einfügen: die Vorschau trägt „Marken entdecken · branding.supply".
E10. **Tastatur** (Q09) · Dashboard: Tab drücken ⇒ ein Sprunglink „Zum
    Hauptinhalt" erscheint und springt in den Hauptbereich.
E11. **Dashboard ohne Flackern** (Q15) · eine Dashboard-Seite hart neu laden
    (Kategorien, Nachrichten, Gemeldete Nachrichten): kein kurzes „keine
    Einträge", keine rote Konsolenzeile „Hydration".
E12. **Suchseiten** (Q10) · als Gast eine Diskussion der Demo aufrufen,
    Quelltext ansehen: `canonical` einmal, auf der Konto-Seite
    `noindex`. Wortlaut kann abweichen.

## Block H — Neu seit dem 2026-11-22, noch nie hinter der Anmeldung gesehen · ≈ 30 Min

Alles hier ist gebaut, getestet und live, aber noch von keinem Menschen auf
Production hinter der Anmeldung angesehen. H1–H2 als Owner (passt an Block C),
H3–H6 als Betreiber (passt an Block D). Nichts dauerhaft umstellen: was du
umlegst, legst du zurück.

H1. **Listen mit Ausfall** (LZ1, COMPLETE „LZ1" und „LZ1 Bahn 8") · als
    Owner im Dashboard der Demo-Community: eine Liste öffnen (Kategorien,
    Nachrichten). In den Entwickler-Werkzeugen des Browsers
    (Reiter Netzwerk) auf „Offline" stellen, dann in der Seitenleiste eine
    ANDERE Liste anklicken. *Sehen:* statt „Keine Einträge" ein Satz, dass
    das Laden nicht geklappt hat, mit Knopf „Noch einmal versuchen";
    wieder „Online", Knopf drücken ⇒ die Liste kommt. Wortlaut kann
    abweichen. *Sonst:* Seite und Satz melden.
H2. **KI-Training je Community** (KC1) · als Owner: Dashboard → „Community"
    → „Sichtbarkeit". *Sehen:* der Schalter steht nur bei öffentlicher
    Sichtbarkeit, Vorgabe aus, daneben der Satz „eine Bitte an Crawler,
    kein Schloss". Einschalten, `<community>/robots.txt` neu laden: die
    Trainings-Crawler sind jetzt erlaubt; ausschalten, neu laden: wieder
    gesperrt. *Zum Schluss:* Schalter AUS.
H3. **Moderator im Not-Zugang: Übersicht und Statistik zu** (BT1 e) · in der
    Appwrite-Konsole (Projekt `account`) dem Wegwerf-Konto das Label
    `moderator` geben. Mit ihm auf `demo.pukalani.app` (es ist KEIN Mitglied)
    das Dashboard öffnen. *Sehen:* Übersicht und Statistik zeigen „kein
    Zugang"; die Moderations-Liste der Kommentare öffnet. Du als Betreiber
    siehst alle drei. *Zum Schluss:* Label wieder entfernen.
H4. **Kontingent-Katalog in der Konsole** (KK1 c) · `admin.pukalani.app` →
    Konsole → Kasten „Pläne & Limits". *Sehen:* je Plan (Basic, Personal,
    Pro) eine Zeile je Art — Kommentare, Seiten, Termine, Mediathek —; bei
    Pro Kommentare 5000 je Seite und 250.000 gesamt. Nichts speichern.
    *Sonst:* welche Art fehlt oder welche Zahl abweicht.
H5. **Der zählende Sicherungs-Lauf: die drei Mitgliedschaften** (SI1 b) ·
    Appwrite-Konsole, Projekt `admin` (Control Plane): Tabelle
    `communities`, Filter Status „disabled" — die Ids notieren; dann
    Tabelle `community_members`, Filter `communityId` = eine dieser Ids UND
    Status `active`. *Sehen:* genau die Zeilen, die der Lauf zählt (lokal am
    Spiegel waren es drei, in drei Communities). Für jede: soll die Person
    in der stillgelegten Community wirklich entfernt werden? *Dann:* dein Ja
    oder Nein zur Zahl dem Leitstand sagen — erst danach wird `apply`
    geschaltet (SI1). Nichts in der Konsole ändern.
H6. **Insights: Knopf „KI-Prüfung"** (IN1 a) · `branding.supply`, Redaktion
    der Insights, einen Artikel öffnen, „KI-Prüfung" drücken. *Achtung:* das
    ist ein ECHTER KI-Lauf (wenige Cent). *Sehen:* der Knopf sperrt während
    des Laufs, ein zweiter Klick startet nichts; danach Hinweise je Abschnitt,
    nichts wird gesperrt oder geändert. *Sonst:* Satz und Uhrzeit melden.

## Block F — branding.supply: Beispiel-Kit und neue Texte (BK1 K7) · ≈ 5 Min

Gast, privates Fenster; passt an Block A.

F1. **Das Kit am Beispiel** · `branding.supply/de/discover/kailua-coffee-co`
    · Gast. Bis unter das Dossier scrollen. *Sehen:* Abschnitt „Das Kit" mit
    vier Kacheln (brand.md, tokens.json, tokens.css, Zeichen (SVG)); ein Klick
    auf „brand.md" öffnet die Datei im Browser (Text, beginnt mit „# Kailua
    Coffee Co."), „Zeichen" und „Ganzes Kit laden (.zip)" laden eine Datei
    „Kailua Coffee Co. brand kit 2026-09-09.zip" (lesbarer Name, so gewollt —
    ZN1); entpackt liegen darin
    `README.md`, `brand.md`, `tokens.css` und ein Ordner `marks/` mit SVGs.
    Auf einer anderen Marke unter „Marken entdecken" gibt es den Abschnitt
    NICHT. *Sonst:* Adresse, Kachel und was stattdessen kam melden.
F2. **Texte zu Book & Kit** · `branding.supply/de` (Abschnitt „Was am Ende auf
    dem Tisch liegt"), `branding.supply/de/team`, das Menü „Produkte" ·
    Gast. *Sehen:* Brand Book „Das vollständige Handbuch — Regel-Kapitel, Do &
    Don’t, AI-Guidelines."; die Karte brand.json nennt brand.md und brand.json;
    Content-Kompass und 90-Tage-Plan tragen das Etikett „Brand Experience";
    auf der Team-Seite steht nirgends mehr „Strategy Playbook"; im Menü steht
    bei Book & Kit „Book, Tokens, brand.md + brand.json." *Dein Wort zur
    Copy* (Gate von K7): passt oder ändern — die Sätze stehen in der Meldung
    von Bahn 9.

Nicht Teil der Runde, weil sie auf den ersten Artikel warten: die Proben aus
BI2 und IN1 (b), siehe BI5.

## Block G — Marktvergleich: neu gerechnete Entwürfe prüfen (MV1) · ≈ 15 Min

Am Rechner, kein Konto nötig. Am 2026-11-22 neu gerechnet (Bahn 12, lokal,
mit Davids Ja; unter 0,25 $). Zwei Entwürfe sind entstanden: `nike` (5
belegte Felder) und `anthropic` (8). Sie liegen NICHT im Repo (Entwürfe sind
`.gitignore`, Runbook §0), sondern im Notiz-Ordner der Leitstand-Sitzung,
Unterordner `mv1-entwuerfe-2026-11-22`; vor der Prüfung nach
`packages/market/shared/library/drafts/` im eigenen Checkout kopieren.

G1. **Handprüfung je Feld** ([Runbook §4](../../runbooks/MARKTVERGLEICH-BIBLIOTHEK.md))
    · `nike.json`, `anthropic.json`. Je Feld `sourceUrl` im Browser öffnen
    und `quote` dort suchen. *Sehen:* das Zitat steht wörtlich da, das Feld
    passt zum Zitat, kein Name einer Person, keine Wertung, Zitat höchstens
    200 Zeichen. *Achtung bei nike:* ein Teil der Belege stammt von
    `nike.com/help/` — ob eine Hilfe-Seite die Marke beschreibt, ist deine
    Entscheidung; im Zweifel das Feld streichen. *Dann:* im Entwurf
    `status: "verified"`, `verifiedAt` und `verifiedBy` setzen und der
    nächsten Sitzung sagen „übernehmen" — sie fährt `--promote` und liefert
    aus. *Sonst:* Feld löschen; bleiben weniger als drei, den Entwurf
    verwerfen.
G2. **Drei Marken ohne neuen Entwurf** · ENTSCHIEDEN (David, 2026-11-23):
    stehen lassen. `apple` und `the-barn` tragen in der Bibliothek den
    Vermerk `keptStale`; der Montags-Wächter listet sie als „bewusst stehen
    gelassen" und meldet sich erst nach dem 2027-02-21 wieder; `meta` bleibt
    draußen. Kein Klick nötig. *Achtung:* `nike` und `anthropic` werden am
    2026-12-06 ebenfalls überfällig — ohne G1 öffnet der Wächter am
    2026-12-07 ein Issue für beide.
