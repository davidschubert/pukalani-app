# Brand Insights — Kuration, Merkliste, Artikel aus Video (BI2)

> **Sorte:** Plan (noch nicht gebaut). Fortsetzung von
> [BRAND-INSIGHTS.md](BRAND-INSIGHTS.md) — dort steht das Redaktionskonzept
> BI1, hier nur, was Davids Wünsche vom **2026-09-09** daran anbauen.
> Offene Punkte gehören nach `docs/OPEN-ITEMS.md`, nicht in dieses Dokument.

## 0. Der Anlass — Davids sieben Wünsche

Nach dem ersten Blick auf den Themenradar (live seit 2026-09-10) hat David
sieben Dinge benannt. Sie hängen zusammen, aber sie sind nicht dasselbe
Vorhaben — deshalb stehen sie hier einzeln, mit dem, was sie kosten:

1. **Woher kommen die elf Kanäle?** Einsehen und bearbeiten können, die Liste
   einschränken können.
2. **Kanäle in Cluster setzen** — Brand-Design, Branding, SEO, GEO,
   Branding & KI, Brand Strategy.
3. **Filtern und sortieren** — heute ist alles nach Opportunity sortiert, es
   gibt keinen Themen-Filter und keine Sortierung nach Aufrufen oder Likes.
4. **Eine eigene Liste** — YouTube-Link einwerfen, Video wird wie im Radar
   ausgelesen (Kanal, Titel, Thema, Aufrufe, Likes, Kommentare, Alter,
   Opportunity). Getrennt vom Radar, Davids eigene Fundstücke.
5. **Zwei Links je Zeile, in BEIDEN Listen** — einer öffnet das Video in einem
   neuen Tab, einer ist ein Schalter mit drei Stellungen: „Nicht geprüft",
   „Uninteressant", „Interessant".
6. **Filter „nur Interessante"** — die Vorauswahl.
7. **Aus einem Video einen Artikel** — KI liest das Video aus, schreibt einen
   Beitrag nach SEO/GEO-Regeln, der Freude beim Lesen macht und zum
   Diskutieren anregt; darunter das `comments`-Feature.

Punkt 7 ist der einzige mit einer echten Rechtsfrage. Punkte 1–6 sind Handwerk.

---

## 1. Antwort auf Frage 1 — woher die Kanäle kommen

**Sie stehen im Code**, in `apps/branding/app/app.config.ts` unter
`pukalani.insights.radar.channels` — heute **elf Zeilen**. Eine zwölfte
(Pentagram) wurde am 2026-09-10 entfernt, weil die Kanal-Id einem Privatkonto
gehörte; an ihrer Stelle steht ein Kommentar mit der Begründung. Zwei weitere
Zeilen wurden am 2026-09-10 ausgetauscht, weil ihre Kanäle seit Jahren nichts
mehr hochladen: Ogilvy wich Nudgestock, Marketing Examples wich StoryBrand.
**Drei Änderungen an einer Liste in zwei Tagen — genau der Befund, der Frage A
trägt.** Jede Zeile trägt drei Dinge: die Kanal-Id (`UC…`), das Cluster,
für das der Kanal steht, und einen Anzeigenamen als Lesehinweis.

**Warum sie dort stehen und nicht in einer Tabelle**, steht wörtlich im Kopf
von `packages/insights/shared/insightsRadar.ts`: die Liste ändert sich seltener
als ein Deploy, sie ist eine redaktionelle Entscheidung, und „warum ist dieser
Kanal drin?" beantwortet ein Kommentar neben der Zeile, keine Datenbank-Row.

**Einsehen kannst du sie heute nur im Code, bearbeiten nur per Deploy.** Genau
das soll sich ändern — und damit steht die damalige Begründung zur Revision.
Sie war nicht falsch, sie hat nur mit einer Annahme gerechnet, die sich als
unzutreffend erwiesen hat: dass die Liste selten wechselt. Der erste Prod-Lauf
hat drei tote Kanäle gezeigt, und der Betreiber will jetzt kuratieren, nicht
deployen.

### Entscheidungsfrage A — wo wohnt die Kanalliste künftig?

| | Weg | Was er kostet | Was er bringt |
|---|---|---|---|
| **A1** | Config bleibt, Dashboard zeigt sie nur an | fast nichts | erfüllt „bearbeiten" nicht |
| **A2** | **Tabelle `insights_channels`, Dashboard bearbeitet sie, Config wird einmalig übernommen und danach nicht mehr gelesen** | eine Migration, ein Übernahme-Skript | **eine Wahrheit, an einer Stelle** |
| A3 | Hybrid: Config = Grundstock, Tabelle = Ergänzungen und Ausblendungen | zwei Wahrheiten | nichts, was A2 nicht auch kann |

**Empfehlung: A2.** A3 sieht nach Kompromiss aus und ist der teuerste Weg: bei
jeder Frage „warum läuft dieser Kanal?" müssten künftig zwei Orte gelesen und
in der richtigen Reihenfolge verrechnet werden. Der Verlust bei A2 ist echt,
aber klein — die Begründung „warum ist der drin?" wandert aus dem
Code-Kommentar in ein **Notiz-Feld an der Zeile**, und die Versionsgeschichte
dieser Notiz gibt es dann nicht mehr. Dafür gibt es etwas Besseres: das Feld
steht neben dem Kanal statt in einer Datei, die niemand öffnet.

### Was die Kanal-Seite können muss

* **`/dashboard/insights/channels`** hinter `insights.manage`, wie alle
  Redaktionsseiten. `UTable` (B6), leerer Zustand über `CoreEmptyState`.
* **Spalten:** Kanal (Name + Handle), Cluster, Zustand, jüngster Upload,
  Videos im letzten Lauf, Notiz.
* **Einschränken heißt ausschalten, nicht löschen** — ein Kanal bekommt
  `active: false` und bleibt mit seiner Notiz stehen („liefert seit 2023
  nichts", „Id war ein Privatkonto"). Löschen wäre der Weg, denselben Irrtum
  in einem halben Jahr ein zweites Mal zu machen.
* **Anlegen mit Prüf-Vorschau — die Lehre aus Pentagram.** Wer eine Id oder
  ein Handle einträgt, bekommt vor dem Speichern **Titel, Abonnentenzahl und
  das Datum des jüngsten Uploads** zu sehen und bestätigt DIESEN Kanal. Die
  Regel steht schon im Gedächtnis des Projekts und wird hier zur Mechanik:
  *ein Kanal ist erst geprüft, wenn Titel und jüngster Upload zur Erwartung
  passen, nicht nur die Id.* Kosten: 1 Quota-Einheit je Vorschau.
* **Handles auflösen.** `@thefutur` ist das, was ein Mensch in der Hand hat;
  `UC-b3c7kxa5vU-bnmaROgvog` ist das, was die API will. `channels.list` kann
  `forHandle` — 1 Einheit, und der Betreiber muss nie wieder eine Id von Hand
  suchen.

**Migration `insights-005`,** dieselben Hausregeln wie 001–004 (server-only,
`permissions: []`, kein `communityId`, Indizes über `createIndexSteps`). Die
Zeile enthält keine API-Daten im Sinne der Policies außer Name und
Abonnentenzahl — beide werden vom täglichen Lauf ohnehin neu geholt.

---

## 2. Die Cluster — Davids sechs treffen unsere acht nicht

Heute gibt es **einen** Katalog (`INSIGHTS_TOPICS` in `insightsPost.ts`), und
er trägt zwei Lasten: er rubriziert die Radar-Videos, und er rubriziert die
öffentlichen Beiträge. Acht Schlüssel:

`rebranding` · `brand-psychology` · `brand-analysis` · `brand-strategy` ·
`brand-language` · `seo-geo` · `brand-experience` · `visual-identity`

Davids sechs Wünsche dagegen: Brand-Design · Branding · SEO · GEO ·
Branding & KI · Brand Strategy. Drei Unterschiede fallen auf:

* **SEO und GEO sind bei uns EIN Schlüssel** (`seo-geo`), bei David zwei. Er
  hat recht: das sind zwei Disziplinen mit zwei Fragen. „Wie finde ich das bei
  Google?" und „Wie zitiert mich eine KI-Antwort?" haben verschiedene
  Antworten, und ein Radar, der sie zusammenwirft, kann die eine nicht zeigen,
  ohne die andere mitzuschleppen.
* **„Branding & KI" gibt es bei uns nicht.** Das ist die Lücke, die am
  meisten kostet — es ist das Thema, über das gerade am meisten geredet wird.
* **„Brand-Design" heißt bei uns `visual-identity`.** Dasselbe Ding, anderes
  Wort. Hier braucht es keinen neuen Schlüssel, nur ein anderes Etikett.

### Entscheidungsfrage B — ein Katalog oder zwei?

| | Weg | Folgen |
|---|---|---|
| **B1** | **Den EINEN Katalog erweitern** — er gilt weiter für Radar UND Beiträge | ein Vokabular; das Video, das ein Artikel wird, behält seine Rubrik |
| B2 | Zwei Achsen: öffentliche Themen (8) + freie Radar-Cluster | Radar-Kuration ohne Rückwirkung — aber jeder Schritt vom Video zum Artikel ist eine Übersetzung, und zwei Listen laufen auseinander |

**Empfehlung: B1**, konkret so:

| Schlüssel | Label heute | Label künftig | Änderung |
|---|---|---|---|
| `seo` | — | SEO | **aus `seo-geo` getrennt** |
| `geo` | — | GEO | **aus `seo-geo` getrennt** |
| `brand-ai` | — | Branding & KI | **neu** |
| `visual-identity` | Visual Identity | **Brand Design** | nur das Etikett |
| `brand-strategy` | Brand Strategy | Brand Strategy | — |
| `rebranding`, `brand-psychology`, `brand-analysis`, `brand-language`, `brand-experience` | | | unverändert |

Ergibt **zehn Cluster**. Davids „Branding" als eigener Punkt geht bewusst
nicht mit ein: das ist der Oberbegriff für alle zehn, und ein Cluster, das
alles heißt, sortiert nichts.

**Kosten der Trennung `seo-geo` → `seo` + `geo`:** die Schlagwortliste bekommt
zwei Einträge statt einem (GEO: „ai overview", „llm", „chatgpt", „answer
engine", „aeo", „geo" — SEO behält den Rest), die Tests zeigen, was sich
verschiebt. Bestandsdaten sind kein Problem: Radar-Zeilen werden täglich neu
geschrieben, und `insights_posts` trägt heute keinen veröffentlichten Beitrag
mit dieser Rubrik. Die drei SEO-Kanäle (Ahrefs, Google Search Central,
Semrush) werden auf der neuen Kanal-Seite von Hand zugeordnet.

---

## 3. Filtern und sortieren — was heute fehlt und warum

`InRadar.vue` rechnet die Opportunity je Zeile und sortiert die Liste **fest**
danach, bevor `UTable` sie überhaupt sieht. Deshalb gibt es keine
Spaltensortierung — nicht weil `UTable` sie nicht könnte, sondern weil die
Reihenfolge vorher schon entschieden ist. Ebenso fehlt jeder Filter.

**Zu bauen (reine Oberfläche, keine Migration, kein Gate):**

* **Sortierung über jede Zahlenspalte** — Aufrufe, Likes, Kommentare, Alter,
  Opportunity. `UTable` bringt sie mit, sie muss nur erlaubt werden.
  **Standard bleibt Opportunity absteigend**, damit sich das Bild beim Öffnen
  nicht ändert.
* **Filter Cluster** — Mehrfachauswahl, „nur Brand Strategy" ist damit ein
  Klick.
* **Filter Kanal** — dieselbe Mechanik, für „was macht Ahrefs gerade?".
* **Filter Urteil** — „Nur Interessante", „Ohne Uninteressante" (Vorgabe),
  „Alle". Siehe Abschnitt 5.
* **Zeitraum** — 7 / 30 / 90 / alle Tage. Der Alters-Deckel von 180 Tagen
  bleibt darüber und wird weiter angeschrieben.
* **Eine Zeile Zusammenfassung** über der Tabelle: „37 von 205 Videos",
  damit ein Filter nie unbemerkt greift.

**Wichtig für `null`:** eine Zeile ohne Opportunity heißt „kein Signal", nicht
„schlecht". Sie steht heute am Ende und muss auch bei jeder anderen Sortierung
am Ende stehen, nie als Null mitgerechnet.

---

## 4. Die eigene Liste — „Fundstücke"

Eine zweite Tabelle im selben Bereich, **`/dashboard/insights/fundstuecke`**,
gespeist über ein Feld „YouTube-Link einfügen". Sie zeigt dieselben Spalten
wie der Radar und rechnet mit **denselben reinen Regeln** — dieselbe
Einordnung (`insightsRadarClassify`), dieselbe Opportunity-Formel. Zwei Listen
mit zwei Rechenwegen wären zwei Wahrheiten über dasselbe Video.

**Was der Link-Wurf tut:** Video-Id aus jeder üblichen Form lesen
(`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, mit und ohne Parameter),
dann `videos.list` (1 Einheit) und, falls der Kanal unbekannt ist,
`channels.list` (1 Einheit). Danach steht die Zeile.

### Der eine Unterschied, der wirklich zählt: die Zeile stirbt nicht

Die Radar-Tabelle ist **flüchtig** — der Lauf überschreibt täglich, das
30-Tage-Netz löscht ganze Zeilen, und Videos über 180 Tage kommen gar nicht
erst hinein. Das ist richtig so (Policies III.E.4) und für den Radar auch
gewollt: er zeigt, was jetzt läuft.

**Für Deine eigene Liste wäre genau das der Fehler.** Du findest ein Video,
hältst es fest, und drei Wochen später ist es weg, weil ein Aufräum-Lauf
nicht wusste, dass es Deins war. Deshalb gilt hier eine andere Aufteilung
innerhalb derselben Zeile:

* **Deins und dauerhaft:** die Video-Id, wann Du es hinzugefügt hast, Dein
  Urteil, Deine Notiz, das Cluster, das Du gesetzt hast. Das sind keine
  API-Daten — das sind Deine Aufzeichnungen über ein Video.
* **Von YouTube und flüchtig:** Aufrufe, Likes, Kommentarzahl, Kanalname,
  Abonnenten, Titel, Veröffentlichungsdatum. Die zieht der tägliche Lauf mit
  (ein Stapel je 50 Videos = 1 Einheit) und schreibt sie neu.
* **Wenn ein Video nicht mehr abrufbar ist** (gelöscht, privat), werden die
  **Zahlen geleert und die Zeile bleibt**, mit einem sichtbaren Hinweis. Im
  Radar geht in diesem Fall die ganze Zeile — der Unterschied ist beabsichtigt
  und gehört in den Kopf der Migration.
* **Kein Alters-Deckel.** Du findest absichtlich auch alte Videos. Die 180
  Tage sind eine Regel des Radars („was läuft gerade"), nicht Deiner Liste.

**Migration `insights-007`**, `insights_watchlist`.

---

## 5. Der Schalter — und warum er nicht auf die Radar-Zeile gehört

David will drei Stellungen: **Nicht geprüft · Uninteressant · Interessant**,
in beiden Listen. Der naheliegende Weg wäre eine Spalte an der Radar-Zeile.
**Das wäre ein Fehler,** und zwar ein stiller: die Radar-Zeile wird täglich
überschrieben und nach spätestens 30 Tagen gelöscht. Ein Urteil, das mit ihr
verschwindet, ist die Arbeit nicht wert, die es gekostet hat.

**Das Urteil lebt deshalb in der Fundstück-Tabelle, geschlüsselt über die
Video-Id.** Der Radar liest es dazu (ein `listRows` über die Ids der
angezeigten Videos). Daraus folgt eine Mechanik, die genau das tut, was David
beschreibt:

> **„Interessant" im Radar zu klicken, LEGT das Video in Deine Liste.**

Der Radar ist damit der Zulauf, die Fundstücke sind die Vorauswahl, und der
Link-Wurf ist der zweite Weg hinein — für alles, was der Radar nicht sieht.
„Uninteressant" ist die Gegenrichtung: das Video bleibt vermerkt und der
Standard-Filter des Radars blendet es aus, damit es morgen nicht wieder oben
steht.

**Der zweite Link je Zeile** ist billig: die Adresse
`https://www.youtube.com/watch?v=<id>` folgt aus der Video-Id, es muss nichts
gespeichert werden. Neuer Tab, `rel="noopener"`, und der Kanalname wird
gleich mit verlinkt.

---

## 6. Aus einem Video ein Artikel — der Punkt mit der Rechtsfrage

Hier ist der Wunsch am größten und der gangbare Weg am schmalsten. Drei
Tatsachen zuerst, weil sie den Zuschnitt bestimmen:

1. **Die YouTube Data API liefert keine Transkripte.** `captions.download`
   funktioniert nur für Kanäle, die einem selbst gehören. Alle bekannten
   Transkript-Bibliotheken holen sich den Text an der API vorbei und verstoßen
   damit gegen die Nutzungsbedingungen — auf derselben Instanz, auf der wir
   einen API-Schlüssel betreiben.
2. **Was die API liefert, reicht weiter als gedacht:** `snippet` enthält
   **Titel, Beschreibung und Tags**. Bei guten Kanälen ist die Beschreibung
   ein Inhaltsverzeichnis mit Kapitelmarken — das ist Substanz, kein Titel.
3. **Ein Artikel, der ein fremdes Video nacherzählt, ist urheberrechtlich
   heikel und redaktionell schwach.** BI1 §4.1 hat dafür schon Regeln: Zitat
   höchstens 200 Zeichen, Quelle mit Datum, keine erfundenen Zitate, keine
   Zahl ohne Beleg.

### Entscheidungsfrage C — wie tief liest die KI das Video?

| | Weg | Rechtslage | Empfehlung |
|---|---|---|---|
| **C1** | **Titel + Beschreibung + Tags werden zu einem BRIEF** (Thesen, offene Fragen, Gegenpositionen) — der Brief geht in den bestehenden Entwurfs-Weg, der Artikel ist unser eigener Text zum THEMA, mit dem Video als einer Quelle | sauber, keine neue Frage | **ja** |
| C2 | Transkript besorgen und auswerten | ToS-Verstoß über Drittanbieter; über Google Speech-to-Text teuer und braucht die Audiospur, an die wir legal nicht kommen | nein |
| C3 | Du schaust das Video und tippst den Brief | geht heute schon | als Ergänzung, nicht als Ersatz |

**Empfehlung: C1, mit C3 daneben.** Der Knopf heißt dann ehrlich **„Brief aus
diesem Video"** und nicht „Video analysieren" — er zündet, er ersetzt Dich
nicht. Was er tut: legt einen Beitrag im Zustand `draft` an, füllt den Brief
mit Thesen und offenen Fragen, trägt das Video als Quelle in `sources` ein
(Kanal als Publisher, Veröffentlichungsdatum als Datum) und lässt Dich vor dem
Entwurf noch einmal darüber. Danach läuft alles durch die bestehende Redaktion
— sechs Prüfregeln, Beleg-Riegel, Freigabe. Neue Prompt-Fassung
`insights-b-1`; der Prompt bekommt ausdrücklich mit, dass er **nicht
zusammenfassen** soll, sondern **anknüpfen**.

### Die SEO/GEO-Regeln — eine Prompt-Frage, kein Bauwerk

Davids zweiter Halbsatz („alle SEO/GEO-relevanten Regeln beachten, Freude beim
Lesen, am Ende zum Diskutieren anregen") ist am billigsten dort aufgehoben, wo
die Regeln heute schon stehen: in einer neuen Fassung des Entwurfs-Prompts,
**`insights-d-2`**. Was hineingehört:

* **Die Antwort im ersten Absatz.** Eine KI-Antwortmaschine zitiert den Satz,
  der die Frage beantwortet — nicht den, der sie ankündigt.
* **Zwischenüberschriften als Fragen**, in der Sprache, in der Menschen sie
  stellen. Das ist zugleich der Aufhänger für FAQ-Auszeichnung.
* **Definierende Sätze** („X ist …") — das ist die Form, die zitierfähig ist.
* **Ein FAQ-Block am Ende** mit drei bis fünf echten Fragen.
* **Eine Diskussionsfrage als letzter Absatz** — Davids Wunsch, und zugleich
  die Brücke zu den Kommentaren.
* **Keine Floskeln, kein „In der heutigen schnelllebigen Welt".** Der Prompt
  soll den Sound benennen, den branding.supply sonst spricht.

Eine **siebte Prüfregel** kann das durchsetzen, wo es prüfbar ist: „endet mit
einer Frage" und „hat mindestens zwei Frage-Zwischenüberschriften" sind reine
Regeln, die ein Test lesen kann. Alles Übrige ist Prompt und bleibt Prompt.

### Kommentare unter den Artikeln

Der `comments`-Layer ist **nicht** im Manifest von `apps/branding` — er müsste
montiert werden (Manifest, extends, LAYER_ORDER, Bilanz, Paritäts-Soll), seine
Tabellen kämen auf die `branding`-Instanz, und Moderation plus DSGVO-Beitrag
hängen mit dran. Vor allem aber: **es gibt noch keine öffentlichen Seiten.**
Paket I3 ist am Anwalts-Gate (BI1-3/BI1-4). Kommentare unter Artikeln sind
deshalb ein eigenes Paket **nach I3**, nicht Teil dieser Runde.

**Nachtrag 2026-09-10 — K7 ist NICHT mehr blockiert.** I3 ist gebaut, und der
Riegel steht je Format: `pukalani.insights.publicFormats` hat als Vorgabe
**`['article']`**. Artikel sind also schon öffentlich; am Anwalt hängen nur
Markenprofil, Duell und Ranking, weil dort über FREMDE Marken geurteilt wird.
Ein Artikel ist unser eigener Text zu einem Thema — die Frage stellt sich nicht.

**Damit ist K7 ab sofort machbar** und braucht nur noch, was jedes neue Produkt
in einer App braucht: `comments` ins Manifest und in `extends`, seine
Migrationen auf die `branding`-Instanz, ein GDPR-Beitrag und Moderation. Der
Anwalt ist dafür kein Gate.

---

## 7. Die Pakete, in der Reihenfolge, in der sie fallen

| # | Paket | Braucht | Aufwand |
|---|---|---|---|
| ~~K1~~ | ~~Cluster-Katalog erweitern~~ — **entfällt** (Davids Entscheidung B, 2026-09-09: erst mal so lassen) | — | — |
| ✅ **K2** | **Filtern und sortieren** im Radar — **GEBAUT 2026-09-09** (reine Regeln in `packages/insights/shared/insightsRadarView.ts`, 27 Tests, Klick-Beweis im Playground) | — | S |
| ✅ **K3** | **Kanal-Seite** — **GEBAUT UND AUF PROD 2026-10-24** (Migration `insights-005` gefahren, elf Kanäle übernommen) | Entscheidung A ✔ | M |
| ✅ **K4** | **Fundstücke + Schalter** — **GEBAUT 2026-10-25** (Migration `insights-007`, Link-Wurf, Urteil in beiden Listen, YouTube-Link je Zeile, Filter; Sweep zieht die Zahlen mit). **Offen: Davids Ja zur PROD-Migration.** | — | M |
| **K5** | **Brief aus Video** — Prompt `insights-b-1`, Knopf auf den Fundstücken, Beitrag als Entwurf mit Video-Quelle | Entscheidung C (§9) · K4 · **Routen-Probe** | S–M |
| **K6** | **SEO/GEO-Artikelregeln** — Prompt `insights-d-2`, siebte Prüfregel | — | S |
| **K7** | **Kommentare unter Artikeln** — `comments` in `apps/branding` montieren | **kein Gate mehr** — Artikel sind seit I3 öffentlich (`publicFormats: ['article']`) | M |

**Nach Davids Entscheidungen vom 2026-09-09 (§9):** K1 entfällt, K2 läuft
sofort (kein Gate, keine Migration), K3 ist beauftragt und braucht ein Ja zur
Prod-Migration, K5 wartet auf die Routen-Probe aus §9. **K7 hat seit I3 kein
Gate mehr** — Artikel sind öffentlich, der Anwalt hält nur Profil, Duell und
Ranking.

## 8. Was dieses Vorhaben NICHT tut

* **Keine `search.list`-Entdeckung.** Der eigene kleine Tages-Eimer (100
  Aufrufe) und Leitplanke (c) aus BI1 §9.6 gelten weiter. Neue Kanäle kommen
  von Hand oder gar nicht.
* **Keine Kommentar-Texte, keine Nutzernamen.** Leitplanke (b) steht bis zur
  Anwaltsantwort BI1-2 unverändert.
* **Kein Verdichten über Kanäle hinweg.** Auch die Fundstück-Liste bleibt
  „eine Zeile = ein Video" (Policies III.E.2). Es gibt weiterhin keine
  Kanal-Tabelle mit Summen.
* **Keine Transkripte**, solange C2 nicht ausdrücklich entschieden und
  anwaltlich gedeckt ist.

---

## 9. Entscheidungen (David, 2026-09-09)

**Frage A — Kanalliste: `A2`, Tabelle + Dashboard-Seite.** Die elf Zeilen
ziehen aus `apps/branding/app/app.config.ts` in `insights_channels` um; die
Config wird einmalig übernommen und danach nicht mehr gelesen. Damit ist Paket
**K3** beauftragt (Migration `insights-005`, Handle-Auflösung, Prüf-Vorschau,
aktiv/inaktiv, Notiz). Die Begründung von 2026-09-09 im Kopf von
`insightsRadar.ts` („die Liste ändert sich seltener als ein Deploy") wird damit
**bewusst aufgehoben** — sie war nicht falsch, sie rechnete mit einer Annahme,
die der erste Prod-Lauf widerlegt hat.

**Frage B — Cluster: `erst mal so lassen`.** Die acht Themen bleiben, wie sie
sind. `seo` und `geo` bleiben ein Schlüssel, „Branding & KI" kommt nicht dazu,
`visual-identity` behält sein Etikett. **Paket K1 entfällt** — und mit ihm die
Vorbedingung von K2 und K4, die beide mit den acht bestehenden Clustern
auskommen. Wenn der Radar im Betrieb zeigt, dass GEO-Videos unter SEO
untergehen, ist die Trennung eine eigene, kleine Runde; das Konzept dafür steht
in §2 und bleibt gültig.

**Frage D — Reihenfolge: K1 + K2 sofort.** Weil K1 entfällt, ist das **K2
allein**: filtern und sortieren. Ohne Migration, ohne Gate.

### Frage C bleibt offen — und die Antwort ist besser als gedacht

Davids Rückfrage war: *„können heutige KIs nicht die Videos ansehen, verstehen,
analysieren und wissen dann was im Video inhaltlich passiert?"*

**Ja, das können sie — und §6 dieses Plans war an dem Punkt zu vorsichtig.** Was
dort steht, gilt weiterhin für die *YouTube Data API*: sie liefert keine
Transkripte. Aber der Weg führt gar nicht über sie. **Die Gemini-API nimmt eine
YouTube-Adresse direkt entgegen** und wertet **Bild- UND Tonspur** aus; man kann
im Prompt auf Zeitmarken zeigen („was passiert bei 04:12?"). Die belegten
Grenzen (Google-Doku, Stand 2026-09):

* **nur öffentliche Videos** — keine privaten, keine ungelisteten;
* **bis zu 10 Videos je Anfrage** ab Gemini 2.5, davor eines;
* **kostenloser Tarif: 8 Stunden Video am Tag**, im bezahlten Tarif keine
  Längenbegrenzung;
* die Funktion läuft als Vorschau und wird derzeit nicht gesondert berechnet.

**Und unser Stack erreicht sie im Grundsatz.** Alle Modell-Aufrufe gehen über
OpenRouter, und OpenRouter kennt einen Inhaltstyp `video_url`, der eine
YouTube-Adresse annimmt. **Aber nur über den Anbieter „Google AI Studio"** —
die Doku sagt es wörtlich: Vertex AI nimmt keine YouTube-Links, dort müsste das
Video als Base64 mitgeschickt werden, und an die Datei kommen wir legal nicht.

**Genau hier liegt der Haken, und er ist ein anderer als der vermutete.** Er ist
nicht urheberrechtlich, er ist datenschutzrechtlich:

`BRAND_PROVIDER_ROUTING` pinnt jeden Lauf auf `zdr: true`,
`data_collection: 'deny'` und **`allow_fallbacks: false`**. Ein Blick auf die
heutigen Endpunkte von `gemini-2.5-flash` zeigt sieben Routen, davon drei über
**`google-vertex/eu`** — der EU-Weg, über den unsere Läufe heute gehen — und
vier über **`google-ai-studio`** (Sitz US). Der Weg, der Videos kann, ist also
nicht der Weg, den wir heute fahren. Zwei Fragen entscheiden das Paket, und
beide sind billig zu beantworten:

1. **Ist `google-ai-studio` unter `zdr: true` + `data_collection: 'deny'`
   überhaupt erreichbar?** Mit `allow_fallbacks: false` gibt es kein Ausweichen
   — entweder die Route ist erlaubt, oder der Lauf schlägt fehl. Das ist **eine
   Probe-Anfrage mit unserem Schlüssel**, kein Konzept.

   *So weit ohne Schlüssel geprüft (2026-09-09):* `google/gemini-2.5-flash`
   steht in OpenRouters ZDR-gefilterter Modell-Liste (`/models?zdr=true`) —
   mindestens EINE seiner sieben Routen ist also ZDR-fähig. **Welche**, sagt
   die öffentliche Auskunft nicht: die Endpunkt-Liste kennt kein ZDR-Feld und
   ignoriert den Filter. Genau deshalb bleibt die Probe die Entscheidung.
2. **Wenn ja: Wollen wir für diesen einen Zweck den EU-Weg verlassen?** Das
   berührt BS1 (AVV, Datenschutzerklärung, Anwaltsrunde) — allerdings mit einem
   milden Gegenstand: hineingereicht wird eine **öffentliche YouTube-Adresse**,
   keine Kundendaten, keine Marken-Unterlagen.

**Daraus wird eine vierte Option zu Frage C:**

| | Weg | Rechtslage | Aufwand |
|---|---|---|---|
| C1 | Brief aus Titel, Beschreibung, Tags | sauber, keine neue Frage | S |
| C2 | Transkript über Dritte | ToS-Verstoß | — |
| C3 | Du schreibst den Brief | geht heute | — |
| **C4** | **Gemini sieht das Video** (YouTube-Adresse über OpenRouter an Google AI Studio, Bild + Ton) | keine ToS-Frage — es ist Googles eigener, dokumentierter Weg. Offen ist die **Route** (ZDR/EU), nicht der Inhalt | **S–M nach der Probe** |

**Empfehlung: C4, mit C1 als Rückfall.** Wenn die Probe zeigt, dass die Route
unter unseren Bedingungen läuft, ist C4 in derselben Größenordnung wie C1 zu
bauen und liefert ungleich mehr: echte Thesen aus dem, was im Video gesagt
wird, statt aus dem, was in der Beschreibung steht. Läuft sie nicht, bleibt C1
— und der Knopf heißt weiter ehrlich „Brief aus diesem Video".

**Was sich dadurch NICHT ändert:** der Artikel bleibt unser eigener Text. Auch
mit vollem Videoverständnis wird nicht nacherzählt — §4.1 gilt unverändert
(Zitat höchstens 200 Zeichen, Quelle mit Datum, keine erfundenen Zitate). Ein
Modell, das ein Video gesehen hat, macht den Brief besser; es macht ihn nicht
zum Ersatz für einen eigenen Standpunkt.


---

## 10. K2 gebaut (2026-09-09)

Was jetzt auf `/dashboard/insights/radar` steht:

* **Jede Zahlenspalte ist ein Knopf** — Aufrufe, Likes, Kommentare, Alter,
  Opportunity. Zweiter Klick dreht um. Das **Alter fängt beim Jüngsten an**,
  alle anderen beim Grössten: „das älteste Video zuerst" will niemand sehen.
* **Drei Filter** — Thema, Kanal (beide Mehrfachauswahl), Zeitraum (alle · 7 ·
  30 · 90 Tage). Die Auswahllisten kommen aus den DATEN, nicht aus dem Katalog:
  angeboten wird nur, was ein Lauf tatsächlich geholt hat.
* **Eine Trefferzeile** („37 von 205 Videos") und ein
  **„Filter zurücksetzen"**, das nur erscheint, wenn etwas eingeschränkt ist.
* **Die Vorgabe ist unverändert Opportunity absteigend** — die Seite zeigt sich
  beim Öffnen genau wie vorher.

**Die Regeln liegen pur** in `shared/insightsRadarView.ts` und haben 27 Tests.
Drei davon halten Zusagen fest, die man sonst beim nächsten Umbau verliert:

1. **`null` steht in BEIDEN Richtungen am Ende.** Eine Zeile ohne Opportunity
   heisst „kein Signal", nicht „schlechtes Video" — aufsteigend nach vorn
   sortiert stünde sie dort, wo „am wenigsten aussichtsreich" steht.
2. **Gleichstand entscheidet die Video-Id.** Ohne diesen Riegel zeigten zwei
   Aufrufe derselben Ansicht dieselben Videos in zwei Reihenfolgen — bei 205
   Zeilen mit vielen gleichen Werten (Likes 0, Alter 3) kein Randfall.
3. **Leere Auswahl heisst ALLE, nicht keines.** Die andere Lesart ist die, bei
   der die Seite beim Öffnen leer ist.

**Gelernt (Klick-Beweis):** der leere Filter ist eine **Funktion**, keine
Konstante. `{ ...KONSTANTE }` hätte das Objekt kopiert und die **Arrays darin
geteilt** — eine Mehrfachauswahl, die ihre Liste an Ort und Stelle ändert,
schriebe damit in den Modul-Zustand, und „Zurücksetzen" gäbe beim zweiten Mal
die Auswahl von eben zurück. Ein Test hält das fest.

**Gelernt (Werkzeug, nicht Code):** ein Klick des Browser-Werkzeugs auf einen
Eintrag in einem Reka-Aufklapper kann folgenlos verpuffen — die Auswahl blieb
stehen, ohne Fehler in Konsole, Lint oder Typecheck. Das sah nach einem Fehler
in `USelect` aus (Rekas `SelectItem` deklariert `value` als `type: String`, der
Zeitraum ist eine Zahl), und die Erklärung war schon halb geschrieben. **Sie
war falsch.** Mit einer vollständigen Zeigerfolge (`pointermove` →
`pointerdown` → `pointerup` → `click`) greift `USelect` mit Zahlen einwandfrei;
die 30 kam als Zahl zurück, ohne eine einzige Warnung. Lehre: eine Diagnose,
die aus dem Verhalten des WERKZEUGS stammt, ist erst eine, wenn sie gegen die
Gegenprobe steht — sonst landet eine erfundene Falle als Kommentar im Code.


---

## 11. K3 gebaut (2026-10-24)

Die Kanalliste wohnt jetzt in der Tabelle `insights_channels` und wird unter
`/dashboard/insights/channels` gepflegt. Was dort steht:

* **Elf Kanäle übernehmen** — ein Knopf, der nur auf eine LEERE Liste wirkt.
  Die Saat liegt in `packages/insights/shared/insightsChannelSeed.ts`, samt der
  Notizen, die vorher Code-Kommentare in der App-Config waren. Ein zweiter Lauf
  brächte Kanäle zurück, die du bewusst entfernt hast — deshalb gibt es ihn
  nicht, und die Antwort sagt das (`seeded: 0`) statt stillschweigend zu
  gelingen.
* **Prüfen, dann aufnehmen.** Zwei Schritte, und der Zwischenschritt ist der
  Zweck: zwischen Eingabe und Speichern stehen **Titel, Abonnentenzahl und der
  jüngste Upload**. Genau diese drei Angaben hätten `@PentagramDesign` im
  September entlarvt (echte Id, Privatkonto, ein Video von 2012). Eingabe
  ändern verwirft die Vorschau — sonst könnte man den einen prüfen und den
  anderen aufnehmen.
* **Handle, Id oder Adresse** werden gelesen; die alten Formen `/c/` und
  `/user/` fallen klar durch, weil die API sie nicht mehr auflöst.
* **Ausschalten statt löschen.** Ein Kanal, der nichts mehr liefert, behält
  seine Zeile und seine Notiz. Entfernen gibt es für das, was nie hingehörte,
  mit Rückfrage.
* **Cluster und Notiz ändern sich an Ort und Stelle** in der Tabelle.
* **Der Lauf zieht nach, was ihm die API sagt** — Titel, Handle, Abonnenten,
  Prüfzeitpunkt. **Cluster, Zustand und Notiz fasst er nie an**; ein Lauf, der
  die Notiz überschriebe, nähme der Liste genau das, wofür sie gebaut wurde.

**Die Config ist leer.** `pukalani.insights.radar.channels` gibt es nicht mehr;
`readInsightsRadarConfig` liest nur noch die zwei Betriebsgrössen (wie tief je
Kanal, wie alt höchstens). Sweep und Radar-Route lesen beide dieselbe Tabelle.

### Gelernt

**Der `@`-Fall aus CLAUDE.md trifft auch PLATZHALTER.** Die Zeile
`"inputPlaceholder": "@thefutur"` hat den vue-i18n-Nachrichten-Compiler
abstürzen lassen — und zwar nicht nur diesen Schlüssel: auf der ganzen Seite
standen rohe Schlüssel, bis hinauf in den Seitentitel (`ui.metaTitle`). Lint,
Typecheck und 293 Unit-Tests waren dabei grün; sichtbar war es nur im Dev-Log
(`Invalid linked format (error code: 10)`) und im Browser. Richtig ist
`{'@'}thefutur`. Die Regel gilt für JEDE Zeichenkette einer Locale-Datei, auch
für eine, die wie ein Beispiel aussieht.

**Der Klick-Beweis hat eine Lücke gefunden, die kein Test hatte:** ein über die
Vorschau aufgenommener Kanal stand dauerhaft mit seiner rohen Id in der Liste.
Die Vorschau kannte sein Handle, der Lauf las es inzwischen auch mit — nur
schrieb ihn niemand zurück. Jetzt trägt der Nachtrag das Handle mit, und zwar
nur, wenn die API eines nennt (sonst verlöre ein Kanal ohne `customUrl` das,
was die Saat mitgebracht hat).

**Die Routen gehen über die KANAL-Id, nicht über die Row-Id.** Der Vertrag
`InsightsChannel` beschreibt einen Kanal, keine Appwrite-Zeile — die Row-Id
hätte durch jede Abbildung mitgeschleppt werden müssen, nur damit eine Adresse
sie hat. Der Preis ist eine zusätzliche Abfrage je Änderung, bei höchstens
fünfzig Zeilen keine Rechnung.

### Auf Prod (2026-10-24, Davids Ja)

Migration `insights-005` gefahren, die elf Kanäle übernommen. Belege:

* `insights_channels` auf `branding` — neun Spalten `available`, beide Indizes
  `available`, `permissions: []`, `rowSecurity: false`;
* **Schema-Parität branding 40/40**, keine unbekannten Tabellen;
* elf Zeilen, alle aktiv, Cluster wie in der Saat;
* `/api/insights/channels` und `/api/insights/radar` antworten ohne Konto
  **401** (nicht 404) — die Routen sind ausgeliefert und das Produkt-Gate
  lässt sie durch, nur die Berechtigung fehlt.

**Reihenfolge, die hier schiefgehen konnte und nicht schiefging:** der Code war
bereits ausgeliefert (Build `ecb5833f` trägt K3), als die Migration lief — der
Radar las in diesem Fenster eine Tabelle, die es noch nicht gab. Das ist der
Grund, warum die Route dafür einen `isInsightsRowMissing`-Zweig hat: sie meldet
„kein Kanal" statt eines 500. Richtig wäre trotzdem Migration VOR Deploy
gewesen.

**Noch nicht bewiesen:** die Seite hinter dem Login. Der Migrations-Schlüssel
hat bewusst keinen `users`-Scope, eine Prod-Sitzung kann ich damit nicht
herstellen. Der nächtliche Lauf liest die Tabelle beim nächsten Takt (90 s nach
jedem Boot, sonst alle 24 h); die Radar-Seite liest sie bei jedem Aufruf.


---

## 12. K4 gebaut (2026-10-25)

Die eigene Video-Liste steht unter `/dashboard/insights/finds`, und der
Themenradar hat zwei Links je Zeile bekommen.

* **Link-Wurf.** Ein Feld, ein Knopf. Gelesen wird jede Form, die beim
  Kopieren entsteht: `watch?v=`, `youtu.be`, Shorts, Live, Embed, die nackte
  Id, mit und ohne Anhängsel. Eine Playlist oder ein Kanal fällt klar durch,
  statt irgendetwas daraus zu nehmen. Die Zahlen kommen sofort mit (zwei
  Einheiten), sonst stünde die neue Zeile bis zum nächsten Lauf als leeres
  Gerüst da.
* **Der Dreifach-Schalter** (`InVerdictSwitch`) steht in BEIDEN Listen und
  bedeutet dort dasselbe: Nicht geprüft · Uninteressant · Interessant.
* **„Interessant" im Radar LEGT das Video in die Fundstücke** — ohne einen
  einzigen API-Aufruf, weil die Radar-Zeile die Zahlen schon trägt.
* **Der Radar blendet ab Werk aus, was du abgehakt hast.** Drei Stellungen:
  ohne Uninteressante (Vorgabe) · nur Interessante · jedes Urteil.
* **Der tägliche Lauf zieht die Zahlen der Fundstücke mit** (ein Stapel je 50,
  also vier Einheiten bei vollen 200 Zeilen).

### Die tragende Entscheidung, und warum sie so herum fällt

**Das Urteil wohnt in den Fundstücken, nicht an der Radar-Zeile.** Eine Spalte
dort wäre naheliegend und falsch: die Radar-Zeile wird täglich überschrieben
und nach dreissig Tagen gelöscht (Policies III.E.4), ein Urteil daran
verschwände mit ihr. Daraus folgt alles Weitere — „Urteil setzen" und „Zeile
anlegen" sind derselbe Vorgang, und der Radar liest die Urteile über die
Video-Ids dazu.

**Zwei Lebensdauern in einer Zeile.** Video-Id, Zeitpunkt, Urteil, Notiz und
Cluster gehören dir und bleiben. Titel, Kanal, Abonnenten und die drei Zahlen
gehören YouTube und werden täglich überschrieben. Ist ein Video nicht mehr
abrufbar, werden die **Zahlen geleert und die Zeile bleibt** (`available:
false`) — im Radar ginge in diesem Fall die ganze Zeile. Ein Test nagelt fest,
dass der Nachtrag Urteil, Notiz, Cluster und Zeitpunkt in KEINEM seiner
Schreibvorgänge anfasst; ein Typ hält diese Zusage nicht.

**Kein Alters-Deckel.** Der Radar fragt „was läuft jetzt"; hier hebt jemand
absichtlich auch etwas Älteres auf.

**„Nicht geprüft" kann wegnehmen — aber nicht, was beschrieben ist.** Stellt
man im Radar zurück und hängt keine Notiz an der Zeile, bleibt nichts
aufzuheben und sie geht. Mit Notiz bleibt sie: dann hat ein Mensch etwas
hineingeschrieben, und das wirft kein Schalter weg.

### Beweis

400 Unit-Tests, Lint und Typecheck grün. Dazu ein Klickdurchlauf gegen eine
**eigene Wegwerf-Appwrite auf Port 8080** (`docker compose -p k4proof`) und
einen YouTube-Stub:

| Was | Ergebnis |
|---|---|
| Alle sieben Migrationen auf einer leeren Instanz | durch, `insights-007` neu |
| Radar-Lauf | 3 Videos, Fundstück-Nachtrag lief mit |
| „Interessant" im Radar | Fundstücke 0 → 1, Zahlen übernommen, kein API-Aufruf |
| „Uninteressant" im Radar | Zeile fällt sofort aus der Liste (Vorgabe greift) |
| Drei Filterstellungen | 2 · 1 · 3 Zeilen |
| Link-Wurf mit Anhängsel | Titel, Zahlen und Abonnenten sofort da |
| Vier Ablehnungen | Playlist/Kanal/zu lang 400 · doppelt 409 · unbekannt 404 |
| Video verschwindet, Lauf | `gone: 1`, Zahlen 0, Titel leer, **Notiz und Urteil stehen** |
| Ansicht dazu | Striche statt Nullen, „keine Zahl", Hinweiszeile |
| Notiz und Urteil in der Liste ändern | gespeichert, Notiz vom Urteilswechsel unberührt |
| Zurückstellen mit/ohne Notiz | bleibt gelistet · wird entfernt |
| Wegnehmen | 200, zweiter Versuch 404 |

### Gelernt

**Die lokale Appwrite liess sich nicht mehr benutzen.** Seit 2.2 erlaubt eine
self-hosted Instanz nur EINE Organisation, und ein frisch angelegtes
Konsolen-Konto ist in keiner — also kein Projekt, kein Schlüssel, kein
`apps/branding/.env`. Der Weg heraus ist die **CI-Wegwerf-Instanz mit eigenem
Compose-Projektnamen und eigenem Port** (`docker compose -p k4proof`,
Port 8080): das Compose-File hat bewusst keine festen Container-Namen, also
kollidiert nichts mit der laufenden Instanz auf :80. Zwei Dinge, die der CI-Lauf
selbst macht und von Hand fehlen: `_APP_OPENSSL_KEY_V1` muss gesetzt sein
(sonst beendet sich der `appwrite`-Container kommentarlos), und die Datenbank
`main` legt das Setup-Skript nicht an.

**Eine erfundene Video-Id im eigenen Stub hat den Parser zu Recht abgewiesen.**
`verschwindet` sind zwölf Zeichen, eine YouTube-Id hat elf. Zehn Minuten
Fehlersuche am richtigen Code — der Merksatz dazu: Testdaten müssen dasselbe
Format erfüllen wie echte, sonst prüft man die Prüfung.

### Was jetzt bei David liegt

**Die Prod-Migration `insights-007`** — vor dem Code-Deploy. Bis sie läuft,
antwortet die Fundstück-Seite auf Prod mit einer leeren Liste (die Routen sind
fail-soft), und der Radar zeigt keine Urteile.
