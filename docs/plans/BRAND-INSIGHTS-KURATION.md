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
| ✅ **K4** | **Fundstücke + Schalter** — **GEBAUT UND AUF PROD 2026-10-27** (Migration `insights-007` gefahren, Parität branding 42/42) | — | M |
| ✅ **K5** | **Brief aus Video** — **GEBAUT 2026-10-27** (§14): Core-Transport `aiVideo`, Prompt `insights-b-1`, Migration `insights-009`, Knopf auf den Fundstücken, Beitrag als Entwurf mit Video-Quelle. Klick-Beweis lokal, 0,05 $ je 25-Minuten-Video. **Auf PROD 2026-10-27** (Migration VOR dem Merge, Parität 43/43, Build `c97c4dea`). **Nachtrag 2026-10-28:** ein Brief über 2.000 Zeichen warf den bezahlten Lauf weg (2 von 6 gemessenen Läufen) — das Schema klemmt jetzt an einer Grenze statt abzulehnen | Entscheidung C (§13) ✔ · K4 ✔ | S–M |
| **K6** | **SEO/GEO-Artikelregeln** — Prompt `insights-d-2`, siebte Prüfregel | — | S |
| **K7** | **Kommentare unter Artikeln** — `comments` in `apps/branding` montieren | **kein Gate mehr** — Artikel sind seit I3 öffentlich (`publicFormats: ['article']`) | M |

**Nach Davids Entscheidungen vom 2026-09-09 (§9):** K1 entfällt, K2 läuft
sofort (kein Gate, keine Migration), K3 ist beauftragt und braucht ein Ja zur
Prod-Migration, K5 wartete auf die Routen-Probe aus §9 — **die ist am
2026-10-27 gefahren, §13: C4 ist baubar.** **K7 hat seit I3 kein
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
nicht der Weg, den wir heute fahren.

> **BEIDE Sätze hat die Probe am 2026-10-27 widerlegt — siehe §13.** AI Studio
> ist gar nicht ZDR-fähig (404), Vertex EU nimmt YouTube-Adressen sehr wohl,
> und „der EU-Weg, über den unsere Läufe heute gehen" gibt es nicht: ohne
> `only` wählt OpenRouter jede ZDR-Route, in der Probe Amazon Bedrock. Der
> Absatz bleibt als Protokoll stehen, gilt aber nicht mehr. Zwei Fragen entscheiden das Paket, und
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

### Auf Prod (2026-10-27, Davids Ja)

Migration `insights-007` gefahren. Belege:

* `insights_watchlist` auf `branding` — **fünfzehn Spalten `available`**, alle
  drei Indizes `available` (`uq_video_id` unique, `idx_verdict`,
  `idx_added_at`), `permissions: []`, `rowSecurity: false`, 0 Zeilen;
* **Schema-Parität branding 42/42**, keine unbekannten Tabellen;
* `/api/insights/watchlist`, `/api/insights/channels`, `/api/insights/radar`
  und `POST …/watchlist/verdict` antworten ohne Konto **401** (nicht 404) —
  ausgeliefert, Produkt-Gate offen, nur die Berechtigung fehlt.

**Dieselbe Reihenfolge wie bei K3, und wieder nicht die gedachte:** der Code
war schon live (Build `d9b2919f` trägt K4), als die Migration lief. Es ist
nichts passiert, weil die Routen für genau diesen Fall fail-soft sind — die
Fundstück-Seite zeigt dann eine leere Liste, der Radar keine Urteile. Dass es
zweimal so lief, ist trotzdem ein Befund: solange ein Paket per Merge auf
`main` sofort deployt, ist „Migration VOR Deploy" nur einzuhalten, wenn die
Migration vor dem Merge gefahren wird.

**Nicht bewiesen:** die Seite hinter dem Login. Der Migrations-Schlüssel hat
bewusst keinen `users`-Scope — dieselbe Grenze wie bei K3.

---

## 13. Die Routen-Probe zu Frage C — gefahren (2026-10-27, Davids Auftrag)

Elf Anfragen mit dem echten Schlüssel (`~/.appwrite-secrets/branding-ai.key`),
jede mit genau den drei Feldern aus `BRAND_PROVIDER_ROUTING`. Gesamtkosten der
Probe: **0,063 $**.

**Das Ergebnis in einem Satz:** Gemini sieht ein YouTube-Video unter unserer
Datenschutz-Klemme — und sogar auf **`google-vertex/eu`** festgenagelt. **C4
ist baubar, ohne den EU-Weg zu verlassen.**

### Die fünf Messwerte

1. **Vertex EU kann es doch.** `only: ['google-vertex/eu']` +
   `google/gemini-3.1-flash-lite` + YouTube-Adresse ⇒ **HTTP 200**, inhaltlich
   richtige Antwort. Die OpenRouter-Doku behauptet wörtlich, Vertex nehme keine
   Video-URLs und nur „Google AI Studio" nehme YouTube-Links — **das ist heute
   falsch**. Belegt nicht am Text, sondern an der ABRECHNUNG: für ein
   19-Sekunden-Video weist die Antwort `video_tokens: 1197` und
   `audio_tokens: 479` aus. Bild UND Ton, wie die Google-Doku es verspricht.
2. **„Google AI Studio" ist gar nicht ZDR-fähig.** `only: ['google-ai-studio']`
   ⇒ **404** „No endpoints found matching your data policy (Zero data
   retention)". Damit ist die zweite Frage aus §9 („Wollen wir für diesen
   Zweck den EU-Weg verlassen?") **gegenstandslos**: diese Route steht uns
   ohnehin nicht offen — und wir brauchen sie nicht.
3. **Das Modell erfindet nichts.** Gegenprobe mit einer erfundenen, aber
   formgültigen Video-Id ⇒ **502** „Provider returned error". Ohne erreichbares
   Video gibt es keine Antwort, also ist eine Antwort ein Beweis, dass das
   Video gelesen wurde. Ohne diese Gegenprobe wäre jeder Treffer wertlos
   gewesen — ein Modell, das aus dem Titel rät, antwortet genauso flüssig.
4. **Was ein Video kostet** (gemessen, `gemini-3.1-flash-lite`): ein
   25-Minuten-Video = **134.888 Prompt-Tokens** (96.960 Video + 37.888 Audio)
   ⇒ **0,049 $**. Die ZWEITE Frage zum selben Video im Cache-Fenster:
   **0,0067 $** (134.464 Tokens als `cached_tokens`). Also ~5 Cent fürs Lesen
   und ~0,7 Cent je weitere Frage — **Brief und Artikel (K5 + K6) nacheinander
   kosten zusammen rund 6 Cent je Video.** Ein 50-Minuten-Video liegt bei
   ~10 Cent. Das trägt jede Drossel, die §9.4 heute schon hat.
5. **`processing: 'static'` ist kein Sparhebel.** Mit und ohne das Feld stehen
   dieselben Token-Zahlen in der Abrechnung (1197/479 beim kurzen,
   96.960/37.888 beim langen Video). Der scheinbare Preissturz beim zweiten
   langen Lauf war der **Prompt-Cache**, nicht der Modus — sichtbar nur, weil
   `cached_tokens` mitgelesen wurde. Nicht als Einsparung einplanen.

**Inhaltliche Gegenprobe (hat die Probe überhaupt verstanden?):** beim
19-Sekunden-Video („Me at the zoo", bewusst gewählt, weil der Inhalt
unabhängig bekannt ist) nennt die Antwort den Zoo, **zwei** Elefanten, den
letzten gesprochenen Satz wörtlich und die Kleidung. Beim 25-Minuten-Video aus
Davids Kanalliste (Google Search Central, „PDFs in Search") kommen drei
Kernaussagen mit Zeitstempeln zurück, sachlich richtig, plus eine
Artikel-These. Das ist genau die Form, die K5 braucht.

### Zwei Befunde, die die Probe nebenbei aufgedeckt hat

**B1 — das Vision-Modell von `branding` ist TOT.** `apps/branding` setzt
`pukalani.ai.visionModel: 'google/gemini-2.5-flash'`. Dieses Modell steht
**nicht mehr** in OpenRouters ZDR-Liste; sein ganzes Endpunkt-Angebot sind
heute drei AI-Studio-Routen, und AI Studio ist nicht ZDR-fähig (Messwert 2).
Jeder Aufruf antwortet deshalb **404 „No endpoints found matching your data
policy"** — nachgestellt mit genau der Aufrufform der App (Text + `image_url`
+ die drei Routing-Felder). Betroffen ist der EINE Konsument von `aiVision`:
die **Inspirationslesung** im Brand-Wizard
(`packages/brand/server/utils/brandInspirationReading.ts`). Auf Prod ist der
Schalter dabei AN (`app_config.brandAiEnabled: true`, `aiModel` leer, also
gilt der Build-Default) — die Funktion ist also nicht abgeschaltet, sie
scheitert. Ein Laufzeit-Override für `visionModel` gibt es bewusst nicht, die
Spalte fehlt; es ist eine Zeile in `apps/branding/app/app.config.ts`.
Dieselbe Falle hat schon einmal zugeschlagen und steht als Kommentar zwei
Zeilen darunter (`…-image-preview` hatte 2026-09 keine Endpunkte mehr) — ein
Modell-Slug bei OpenRouter ist kein Versprechen, sondern ein Angebot, das
verschwindet. **Geprüft wurde deshalb jeder konfigurierte Slug gegen
`/models?zdr=true`:** `anthropic/claude-haiku-4.5` ✓,
`google/gemini-2.5-flash-image` ✓, `google/gemini-2.5-flash` ✗.
`google/gemini-3.1-flash-lite` hat in derselben Probe ein echtes 32×32-PNG
korrekt beschrieben — es kann Bild UND Video und wäre damit EIN Modell für
beides.

**B2 — die EU-Route ist heute nicht gepinnt.** `BRAND_PROVIDER_ROUTING` nennt
kein `only`, also wählt OpenRouter jede Route, die ZDR und `deny` erfüllt —
in der Probe wurde unser Textmodell von **Amazon Bedrock** bedient (die
Endpunkt-Liste von `claude-haiku-4.5` führt `anthropic`, `azure/global`,
`amazon-bedrock/{global,us,eu-west-1}`, `google-vertex/{global,us-east5,europe}`).
**Die Notiz in §9, „`google-vertex/eu` — der EU-Weg, über den unsere Läufe
heute gehen", war falsch:** ZDR sagt „nichts wird gespeichert", es sagt nichts
über den ORT. Wer Datenresidenz in der EU will, muss sie pinnen
(`only: ['google-vertex/eu']` o. ä.) — und zahlt dafür mit Ausfall ohne
Ausweichweg, weil `allow_fallbacks: false` bleibt. Unter den heute
video-fähigen ZDR-Gemini-Modellen hat **nur `gemini-3.1-flash-lite` überhaupt
einen `google-vertex/eu`-Endpunkt**; `3.5-flash`, `3.8-flash` und `4-argon`
bieten global/us und AI Studio. Das ist eine Entscheidung für David, keine
Technikfrage — sie gehört zu BS1 (AVV, Datenschutzerklärung).

**B1 ist noch am selben Tag behoben** (Davids Wahl, Hergang im Archiv unter
„AI1"): `visionModel: 'google/gemini-3.1-flash-lite'`, und die
Inspirationslesung läuft über die neue Konstante **`BRAND_PROVIDER_ROUTING_EU`**
(`BRAND_PROVIDER_ROUTING` + `only: ['google-vertex/eu']`) — Davids
Entscheidung „nur für Bild und Video pinnen". Dieselbe Konstante nimmt K5 für
das Videolesen. Bewiesen mit einem echten Lauf der neuen Kombination (Modell +
EU-Pin + echtes PNG ⇒ 200). Neu dazu: **`pnpm ops:ai-models`**, der jeden
konfigurierten Slug gegen `/models?zdr=true` prüft (ohne Schlüssel, mit
Gegenprobe am toten Slug). **Von B2 bleibt der TEXT-Weg offen** — OPEN-ITEMS
`AI1`.

### Was daraus für K5 folgt

* **C4 gewinnt** und braucht keine neue Rechtsrunde: hineingereicht wird eine
  öffentliche YouTube-Adresse an Googles eigenen, dokumentierten Weg, auf einer
  Route, die wir ohnehin fahren dürfen.
* Der Transport fehlt noch: `aiComplete` schickt `content` als STRING,
  `aiVision` kennt `image_url`. K5 braucht **einen dritten Baustein im Core**
  (oder eine Erweiterung von `aiVision` um `video_url` + das optionale
  `processing`) — dieselbe Naht, dieselbe Schlüssel-Auflösung, derselbe
  Routing-Vertrag.
* Das Modell für K5 ist nicht automatisch das Modell aus
  `getEffectiveAiConfig` (`claude-haiku-4.5` sieht keine Videos). K5 braucht
  einen eigenen Schlüssel in der Config — Vorschlag: `pukalani.ai.videoModel`,
  Core-Default LEER (= aus), wie beim Vision-Modell.

---

## 14. K5 gebaut (2026-10-27) — „Brief aus diesem Video"

Aus einem Fundstück wird ein BEITRAG im Zustand `draft`, dessen Brief ein
Modell geschrieben hat, nachdem es das Video gesehen hat — Bild und Ton. Der
Artikel entsteht daraus NICHT: dafür gibt es den bestehenden Entwurfs-Lauf
(`insights-d-1`), und dazwischen sitzt ein Mensch. Zwei Läufe statt einem,
mit Absicht.

### Der Weg, in einem Satz
`/dashboard/insights/finds` → Knopf **„Erzeugen"** in der neuen Spalte
*Brief* → Rückfrage → das Modell sieht das Video → Beitrag angelegt (Brief,
Cluster, Video als Quelle) → der Knopf wird zu **„Zum Beitrag"** → im Editor
steht der Brief im Feld „Brief an die KI", bereit für „Entwurf schreiben".

### Was gebaut wurde

* **Core: ein vierter Transport** `packages/core/server/utils/aiVideo.ts`
  (neben `aiComplete`, `aiVision`, `aiImage`). Gate ist der Modell-NAME
  (`pukalani.ai.videoModel`, Core-Default LEER), `data_collection: 'deny'`
  klemmt der Transport fest, `zdr`/`only`/`allowFallbacks` verschärft der
  Konsument. **Nur Adressen, keine Bytes:** `data:`-URIs fallen VOR dem
  Netzaufruf durch — ein base64-Video wären hunderte Megabyte in einem
  Request-Rumpf. 23 Tests.
* **`apps/branding`:** `videoModel: 'google/gemini-3.1-flash-lite'` — dasselbe
  Modell wie die Bildlesung, und damit dieselbe EU-gepinnte Route.
* **Prompt `insights-b-1`** (`shared/insightsVideoBrief.ts`, pur, 30 Tests):
  Aufbau in fünf Teilen (Worum es geht · die These · Belege mit Zeitmarken ·
  Gegenposition · offene Fragen), Cluster-Vorschlag aus dem Katalog,
  Arbeitstitel.
* **Migration `insights-009`:** `brief` (MEDIUMTEXT), `briefModel`,
  `briefPromptVersion`, `briefVideoId` an `insights_posts`; `briefPostId` an
  `insights_watchlist`.
* **Route** `POST /api/insights/watchlist/<videoId>/brief`, **UI** (Spalte +
  Knopf + Rückfrage + Toast mit Link), **i18n** de/en.
* Der **Brief ist jetzt eine Spalte** statt eines flüchtigen Formularfelds.
  Er ist bezahlt und er ist Arbeit; ein Neuladen darf ihn nicht wegwerfen.

### Die Entscheidungen, die drinstecken

**KEINE WÖRTLICHEN ZITATE, SONDERN ZEITMARKEN.** Das ist die wichtigste und
sie folgt aus unserer eigenen Mechanik: `insightsReviewIssues()` prüft ein
Zitat, indem es die Quelle ABRUFT und den Satz im Text sucht. Der Text einer
YouTube-Seite ist Titel und Beschreibung — ein gesprochener Satz steht dort
nie. Ein Video-Zitat wäre also entweder ein blockiertes Gate
(`quote_not_grounded`) oder, schlimmer, eine unprüfbare Behauptung darüber,
was jemand gesagt hat. Der Prompt verlangt deshalb Paraphrasen mit Zeitmarke,
und **die Quelle trägt `quote: ''`**. Eine Zeitmarke kann jeder nachsehen; ein
Zitat, das niemand findet, ist kein Beleg.

**DIE REIHENFOLGE DER PRÜFUNGEN IST DIE EIGENTLICHE ARBEIT.** Ein Video-Lauf
ist der teuerste Weg dieses Monorepos. Jede Ablehnung, die nach dem
Anbieter-Aufruf käme, wäre bezahlt. Also: Fundstück da? → schon ein Brief? →
Video noch abrufbar? → als Quelle ablegbar (Kanal + Datum)? → Video-Modell
konfiguriert? → Kill-Switch und Drossel → **erst jetzt** der Anbieter.

**DER VERWEIS ÜBERLEBT EINEN FEHLSCHLAG.** Schlägt das abschliessende Update
von `briefPostId` fehl, bleibt der BEITRAG stehen. Ihn wegzuwerfen wäre die
schlechtere Wahl: der Brief ist bezahlt. Ein zweiter Lauf legt dann einen
zweiten Entwurf an — lästig, aber sichtbar.

**EIN GELÖSCHTER BEITRAG GIBT DAS FUNDSTÜCK FREI.** Zeigt `briefPostId` ins
Leere, räumt die Route den Verweis und macht weiter. Sonst wäre ein Fundstück
nach einem Aufräumen für immer blockiert.

**DER BRIEF IST INTERN.** Er steht in `INSIGHTS_POST_INTERNAL_FIELDS` und
kommt damit in keiner öffentlichen Antwort vor — er enthält ausdrücklich das,
was NICHT veröffentlicht wurde.

### Beweis (lokale Wegwerf-Instanz + echter Lauf)

* `insights-009` zweimal gegen eine echte Appwrite gefahren: beim ersten Mal
  fünf Spalten angelegt, beim zweiten **fünfmal „existiert bereits"**.
* **Klick-Beweis:** Fundstück angelegt, in der Liste auf „Erzeugen" geklickt.
  Ergebnis in der Datenbank: Beitrag `state: draft`, Adresse aus dem
  Arbeitstitel (`pdfs-in-der-google-suche-warum-sie-kein-seo-geheimtipp-sind`),
  `briefModel: google/gemini-3.1-flash-lite`, `briefPromptVersion:
  insights-b-1`, `briefVideoId: wJukFIpZybY`, `topics: ["seo-geo"]`, Quelle
  `{kind: youtube, publisher: "Google Search Central", date: "2026-10-13",
  quote: ""}`, Brief 1.763 Zeichen. Die Fundstück-Zeile trägt `briefPostId`,
  der Knopf heisst dort jetzt „Zum Beitrag", und im Editor steht der Brief im
  Feld „Brief an die KI".
* **Backstops live:** zweiter Lauf auf dasselbe Video ⇒ **409 `brief_exists`**
  (kein zweites Mal bezahlt), unbekanntes Video ⇒ **404 `video_not_found`**.
* **Kosten gemessen:** 0,0508 $ für ein 25-Minuten-Video (135.575
  Prompt-Tokens: 96.960 Video + 37.888 Audio).

### Auf Prod (2026-10-27, Davids Ja) — und zum ersten Mal in der richtigen Reihenfolge

`insights-009` lief **VOR** dem Merge. Das war hier keine Formsache: anders als
bei K3 und K4 wäre ein Deploy ohne die Spalten nicht fail-soft gewesen —
`fromInsightsPost` schickt die neuen Felder bei JEDEM Schreibvorgang mit, also
hätte es jedes Anlegen und jedes Speichern eines Beitrags gebrochen, nicht nur
das Neue.

* Vorher: `insights_posts` 26 Spalten, `insights_watchlist` 15, keine `brief*`.
* Nachher: 30 und 16, alle fünf neuen Spalten `available`
  (`brief` als MEDIUMTEXT), Zeilen unberührt.
* `pnpm ops:schema-parity`: branding **43/43**, keine unbekannten Tabellen
  (account 69/69, control 42/42, portfolio 41/41 ebenfalls grün).
* Danach Merge und Deploy: Live-Build **`c97c4dea`**, `/api/health` `ok: true`.
* `POST /api/insights/watchlist/<videoId>/brief` antwortet ohne Konto **401**
  (nicht 404) — ausgeliefert, Produkt-Gate offen, nur die Berechtigung fehlt.

**Auf Prod bewiesen am 2026-11-06** (Live-Build `034f0868`, Davids eigene
Sitzung): zwei echte Läufe über die echte Route. Einer schrieb 2.194 Zeichen,
die Klemme machte 1.887 daraus und legte den Entwurf an — die alte Fassung
hätte den bezahlten Lauf hier verloren. Der andere blieb von selbst unter dem
Deckel (1.993), dasselbe Video lieferte neun Tage zuvor noch 2.027: die
Streuung gehört zum LAUF, nicht zum Video. Entwürfe und Fundstücke danach
wieder entfernt. Details und beide Log-Zeilen: COMPLETE „K5-Nachtrag".

**Dabei aufgefallen — `BI3`, ERLEDIGT 2026-11-08:** der 51-Minuten-Lauf brauchte
65,4 s, nginx gab bei 60 auf. Der Klient bekam `504`, der Server legte den
Entwurf trotzdem an — kein Geld verloren, aber der Mensch sah einen Fehler
statt des Links zu seinem Entwurf. Behoben mit einem eigenen nginx-Block
(`brief`/`draft`/`translate`, `proxy_read_timeout 180s`); der Rest der Site
bleibt bei 60s. Wortlaut im Runbook BRANDING-SUPPLY-SETUP.md § 7 — die
vhost-Konfiguration liegt NUR in ploi, nicht im Repo. Einzelheiten und die
Grenze des Beweises: COMPLETE „BI3". Der `brief`-Arm dieses Blocks wurde
am selben Tag wirkungslos, weil §15 den Lauf hinter die Antwort gelegt hat;
für `draft` und `translate` trägt er weiter.

**Und ein neuer offener Punkt `BI4`:** `draft` erlaubt 2.000 Zielwörter, trägt
aber nur 8.000 Tokens — am oberen Ende bricht die Antwort mitten im JSON ab
und der bezahlte Lauf ist weg. Dieselbe Bauart wie der K5-Nachtrag, einmal
gemessen, Schwelle noch unbekannt.

### Gelernt

**EIN SCHEMA MIT LAUTER VORGABEN NIMMT KEINEN FEHLENDEN RUMPF.** Der Knopf
schickt keinen Body; `z.object({…default()})` nimmt ein Objekt OHNE Schlüssel,
aber nicht `undefined` — der erste Klick endete mit **400 „Validation Error"**,
bevor irgendetwas passierte. Typecheck, Lint und alle Tests waren grün; beide
sahen nur, dass es ein Schema GIBT. Richtig ist ein `z.preprocess(value =>
value ?? {}, …)`, und die Regel liegt jetzt im Vertrag (`insightsBriefRequestSchema`)
mit vier Tests — **eine Route, deren Vorgaben nur greifen, wenn man
ausdrücklich `{}` schickt, hat keine Vorgaben.** Gefunden hat das nur der
Klick.

**EIN EXIT-CODE AUS EINER PIPELINE GEHÖRT DER LETZTEN STUFE.** `pnpm
typecheck | tail -6` meldete „exit 0" — das war `tail`. Dadurch ging ein
Typfehler auf `main` (eine Nachbarsitzung fand ihn). Seither `set -o pipefail`
oder Logdatei + eigener Statusabruf.

**EIN `as const`-VERTRAG UND EIN MUTABLER TYP VERTRAGEN SICH NICHT.**
`BRAND_PROVIDER_ROUTING_EU` liess sich nicht an `AiProviderRouting` übergeben
(`readonly ["google-vertex/eu"]` gegen `string[]`). Geweitet wurde der
CORE-TYP (`only?: readonly string[]`), nicht der Vertrag entschärft: die
Konstante reist per Spread, und ein Spread kopiert die REFERENZ — ein
`as string[]` hätte die Allowlist von jeder Aufrufstelle aus veränderbar
gemacht.

**WERKZEUG:** nach `users.create` auf einer frischen Appwrite erst
`PATCH /users/<id>/password` setzen, sonst antwortet die Anmeldung 401
(zweimal erlebt). Und: die Fundstück-Tabelle scrollt waagerecht — der
Brief-Knopf liegt rechts ausserhalb des Sichtfelds, `scrollLeft` setzen,
bevor man klickt.

### Nachtrag (2026-10-28) — ein zu langer Brief warf den bezahlten Lauf weg

Der Klick-Beweis oben lief durch, weil sein Brief 1.763 Zeichen lang war.
Darüber hätte er nicht durchlaufen: `insightsVideoBriefSchema` klemmte
`brief` mit `z.string().max(2000)`, die Route parst innerhalb eines `try`,
dessen `catch` nur loggt und weiterwirft — und zu dem Zeitpunkt ist das Video
gelesen und der Lauf **bezahlt**. Eine Ablehnung dort schützt nichts.

Sechs echte Läufe gegen genau diesen Prompt (`gemini-3.1-flash-lite` auf
`google-vertex/eu`, Videos von 8 bis 51 Minuten) ergaben: 1.575 · 1.673 ·
1.848 · 1.897 · **2.027** · **2.387** Zeichen. **Zwei von sechs** über dem
Deckel, und die Länge hängt NICHT an der des Videos (die 2.387 kamen aus acht
Minuten, die 1.897 aus 45). Die vier Treffer unter dem Deckel liegen bei 92
bis 95 Prozent davon — das Modell zielt auf die Zahl, die im Prompt steht.

Jetzt klemmen alle drei Felder des Schemas, keines lehnt ab.
`clampInsightsBrief` schneidet am spätesten sauberen Schluss (späteres von
Zeilen- und Satzende, dann Wort, dann hart) und räumt eine abschliessende
Zeile weg, die nur ankündigt — in der Gegenprobe endete ein Brief sonst auf
`### OFFENE FRAGEN` ohne Fragen. Gegenprobe mit denselben zwei Videos:
2.027 ⇒ 1.895, 2.387 ⇒ 1.905, beide auf einem Satzzeichen.

**Gelernt:** eine Validierung NACH einem bezahlten Modell-Aufruf darf nicht
ablehnen, sondern muss klemmen — streng ist VOR dem Aufruf (K5 prüft dort
sechs Stufen), danach wird nur noch zugeschnitten. Und ein Deckel im Prompt
ist eine Bitte, keine Grenze: wer danach hart schneidet, bekommt abgebrochene
Wörter, wer ablehnt, verliert den Lauf.

**Nebenbefund:** drei von zehn probierten YouTube-Videos antworteten mit
`502` / `PERMISSION_DENIED` vom Anbieter — binnen 1,2 Sekunden und ohne
Kosten. Nicht jedes öffentliche Video ist für Gemini lesbar; ein `502` auf
diesem Weg heisst also oft „dieses Video nicht", nicht „Anbieter kaputt".

---

## 15. BI3 gebaut (2026-11-08) — „Brief aus Video" läuft dem Proxy nicht mehr davon

> **Zur Einordnung:** BI3 wurde am 2026-11-08 von ZWEI Sitzungen angefasst.
> Die andere hat den nginx-Block gesetzt (`brief`/`draft`/`translate`,
> `proxy_read_timeout 180s`, §14 und COMPLETE „BI3"). Davids Entscheidung
> nach dem Gegenlesen: **beides behalten.** Der Block deckt `draft` und
> `translate`, die weiterhin synchron ein Modell rufen; nur sein
> `brief`-Arm wird durch diesen Abschnitt wirkungslos. Es sind also nicht
> zwei Mechaniken für eine Frage, sondern eine Decke für drei Routen und
> die gründliche Antwort für die teuerste davon.

Der Klick auf **„Erzeugen"** antwortet jetzt nach Millisekunden und sagt
„der Lauf ist gestartet". Der bezahlte Lauf rechnet dahinter weiter und
berichtet an die FUNDSTÜCK-ZEILE; die Liste fragt nach, solange er offen ist,
und der Erfolgs-Toast mit dem Link zum Entwurf kommt, wenn er wirklich fertig
ist.

### Der Befund, der das ausgelöst hat

Gemessen auf Prod am 2026-11-06 (Nachtrag zu §14): ein 51-Minuten-Video
brauchte 65,4 s, **nginx gibt nach 60 auf**. Der Node-Prozess lief weiter und
legte den Entwurf korrekt an — der Mensch sah trotzdem einen Fehler-Toast und
bekam den Link nie. Kein Geld verloren (Stufe 3 führte den zweiten Klick auf
den vorhandenen Beitrag), aber **die Meldung log**.

### Die Entscheidung, die alles andere nach sich zieht

**NICHT `proxy_read_timeout` HERAUFSETZEN** (Davids Richtung, 2026-11-08). Eine
höhere Grenze verschiebt sie nur; das nächste längere Video reisst sie wieder,
und zwar wieder erst auf Prod und wieder mitten in einem bezahlten Lauf. Die
Antwortzeit dieser Route hängt an der Länge eines FREMDEN Videos — eine Zahl,
die wir weder kennen noch begrenzen.

### Wie der Mensch erfährt, dass der Brief fertig ist — und warum nicht per Realtime

Die Frage war: ein Zustand an der Zeile plus Nachfragen, oder die bestehende
Realtime-Naht (`pukalani.realtime.enabled` / `useRealtimeRows`)?

**Realtime ist hier nicht „grösser", sondern VERSCHLOSSEN.** Alle drei
insights-Tabellen sind server-only — `permissions: []`, `rowSecurity: false`
(begründet im Kopf von `server/utils/insightsStore.ts`: die Grenze dieses
Layers ist das Gate `insights.manage`, nicht eine Row-Permission). Es gibt
also **keine Session, die `insights_watchlist` abonnieren könnte**. Realtime
hiesse: eine Betreiber-Tabelle für Klient-Lesezugriff öffnen — eine
Grenzverschiebung für eine Seite, die EIN Mensch benutzt und auf der EIN Lauf
höchstens drei Minuten offen steht.

Und es hätte die Spalten nicht einmal erspart: **Realtime trägt die ZEILE**,
also muss die Zeile „läuft gerade" und „ist schiefgegangen" sagen können. Die
Spalten sind der Kern, Realtime wäre nur eine andere Zustellung. Der kleinere
Weg beantwortet die Frage ehrlich, also wurde er genommen.

### Was gebaut wurde

* **Migration `insights-010`:** zwei Spalten an `insights_watchlist` —
  `briefRunAt` (DATETIME) und `briefError` (VARCHAR 32).
* **Der Zustand wird GERECHNET, nicht gespeichert** (`insightsBriefState` in
  `shared/insightsWatchlist.ts`, pur): `none` · `running` · `stalled` ·
  `failed` · `done`, aus `briefPostId`, `briefError`, `briefRunAt` und der Uhr.
  Dazu `insightsBriefStartable` (darf ein neuer, bezahlter Lauf starten?) und
  `insightsBriefPending` (muss die Liste weiter nachfragen?). 30 Tests.
* **Die Route** (`.../[videoId]/brief.post.ts`) ist geteilt: die Stufen 1–7
  bleiben synchron, stempeln `briefRunAt` und antworten **`202`** mit der
  Zeile. Der Anbieter-Aufruf und alles danach läuft in `runInsightsBrief()`
  hinter der Antwort — mit Besitzer (`.catch`), damit eine unbehandelte
  Ablehnung nicht unter pm2 den Prozess mitnimmt.
* **Stufe 3 ist jetzt zweiteilig:** `brief_exists` (Beitrag da) UND
  `brief_running` (Lauf offen).
* **Die Antwort** trägt nur noch `{ item }` — der Beitrag existiert zu diesem
  Zeitpunkt noch nicht, und ihn trotzdem zu behaupten wäre die Lüge von BI3
  in einem Typ.
* **Die Oberfläche** zeigt vier Zustände statt zwei (Knopf · „Läuft" mit
  Spinner · „Nochmal" mit Grund im Titel · „Zum Beitrag"), fragt alle 5 s nach,
  solange ein Lauf offen ist, und hört von selbst auf. i18n de/en.

### Die Entscheidungen, die drinstecken

**DIE TEILUNG LIEGT GENAU AM GELD.** Alles, was NICHTS kostet, bleibt
synchron und lehnt weiterhin mit `4xx` ab — der Mensch sieht es sofort. Erst
was den Lauf schon bezahlt hat, berichtet an die Zeile. Die K5-Entscheidung
„die Reihenfolge der Prüfungen ist die eigentliche Arbeit" gilt damit
unverändert; sie ist jetzt zugleich die Naht.

**DER ZWEITE KLICK ZAHLT NICHT ZWEIMAL — UND DAS IST NEU ZU VERDIENEN.** Vor
BI3 hielt die offene Verbindung den zweiten Klick auf: die Zeile lud, der
Knopf war gesperrt. Jetzt antwortet die Route nach einer Sekunde und der Knopf
wäre wieder da — drei Klicks wären drei bezahlte Läufe. Die Sperre hängt
deshalb an der ZEILE (`brief_running`), nicht am Browser, und die SERVER-Uhr
entscheidet. Die Oberfläche rechnet denselben Zustand nur für ihre Anzeige;
bei einer schiefen Browser-Uhr gewinnt die Route.

**EIN VERWAISTER LAUF LÖST SICH SELBST.** Genau DARUM wird der Zustand
gerechnet statt gespeichert: ein Aufräumer, der eine Spalte `briefState` von
„läuft" zurücksetzt, wäre der Prozess, der in diesem Fall gerade nicht mehr
lebt (Neustart, Deploy, Container weg). Die Uhr braucht niemanden.
`INSIGHTS_BRIEF_STALL_MS` ist deshalb aus `INSIGHTS_BRIEF_TIMEOUT_MS`
ABGELEITET (+ 60 s für das Schreiben danach), und ein Test nagelt fest, dass
sie echt grösser ist — eine Stall-Grenze UNTER der Zeitgrenze gäbe die Zeile
frei, WÄHREND der erste Lauf noch bezahlt wird.

**ZWEI GRÜNDE, NICHT FÜNF.** `briefError` trägt `brief_failed` oder
`slug_taken`. `brief_failed` deckt bewusst drei Fälle in einem: Anbieter lehnt
ab (nicht jedes öffentliche Video ist lesbar — gemessen drei von zehn),
Zeitgrenze gerissen, Antwort kein JSON. Der Transport wirft für alle drei
dasselbe `502`; eine feinere Auskunft wäre erfunden, und die Handlung des
Menschen ist dieselbe. Die Diagnose-Kennung (`502 AI video failed`) bleibt im
LOG.

**DIE DROSSEL BUCHT WEITER BEIM START.** `insightsBeginAiRun` steht unverändert
VOR der Antwort: sie bucht, was ANGESTOSSEN wurde, nicht was gelungen ist. Ein
Deckel, der erst beim Erfolg zählt, hält einen verklemmten Knopf nicht auf.

**DER STEMPEL STEHT VOR DEM LAUF.** Erst wenn `briefRunAt` geschrieben ist,
geht der Anbieter-Aufruf los. Scheitert das Schreiben, gibt es keine Sperre —
und der zweite Klick zahlte ein zweites Mal. Der Eimer ist dann gebucht und
der Lauf nicht gemacht; das ist der richtige Weg herum.

### Beweis (lokale Wegwerf-Instanz, ein echter Lauf + ein Stub)

Wegwerf-Appwrite 2.7.1 (`docker compose -p bi3`, Port 8099), Projekt
`branding`, Migrationen gefahren, Konto mit Label `admin`.

* **Migration:** `insights_watchlist` 16 → **18 Spalten**, `briefRunAt`
  (datetime) und `briefError` (varchar) beide `available`; zweiter Lauf
  zweimal **„existiert bereits"**.
* **Echter bezahlter Lauf** (`wJukFIpZybY`, dasselbe Video wie in §14):
  **HTTP 202 nach 0,066 s**, der Lauf meldete sich 10,08 s später
  (`insights.brief.completed`, `briefChars: 1875`). Beitrag `state: draft`,
  Adresse `warum-pdfs-fuer-seo-und-ki-suche-keine-sackgasse-sind`,
  `briefModel: google/gemini-3.1-flash-lite`, `briefPromptVersion:
  insights-b-1`, `briefVideoId: wJukFIpZybY`, `topics: ["seo-geo"]`, Quelle mit
  `quote: ""`.
* **Der zweite Klick:** drei Klicks WÄHREND des Laufs ⇒ dreimal **409
  `brief_running`** (0,036 / 0,018 / 0,013 s). Kein zweiter bezahlter Lauf.
* **DER EIGENTLICHE REGRESSIONSBEWEIS — ein Lauf von 90 Sekunden** (Stub statt
  Anbieter, kostenlos): **HTTP 202 nach 0,079 s**; die Zeile stand bei
  **t+61 s und t+71 s** noch auf „läuft" — also JENSEITS des alten
  60-Sekunden-Deckels, dort wo vorher der 504 kam — und trug bei t+91 s den
  Beitrag. Log: `durationMs: 90094`. Unter der alten Fassung wäre genau dieser
  Lauf ein Fehler-Toast gewesen.
* **Fehlschlag:** Stub antwortet 502 ⇒ 202 nach 0,090 s, zwei Sekunden später
  `briefError: brief_failed` an der Zeile, Log
  `errorCode: "502 AI provider unavailable"`.
* **Verwaist vs. gesperrt, dieselbe Zeile:** `briefRunAt` 30 s alt ⇒ **409
  `brief_running`**; `briefRunAt` 5 min alt ⇒ **202** mit neuem Stempel.
* **Klick-Beweis im Browser** (hinter dem Login, `/de/dashboard/insights/finds`):
  Rückfrage bestätigt ⇒ Toast „Der Lauf ist gestartet.", Zelle zeigt **„Läuft"**
  mit Spinner; ohne weiteres Zutun sprang sie auf **„Zum Beitrag"** um und der
  Erfolgs-Toast „Der Brief steht." erschien MIT dem Link. Die beiden
  Fehl-Zustände zeigen **„Nochmal"** mit unterschiedlichem Titel
  („hat keinen Brief geliefert …" bzw. „ist nicht zurückgekommen …").
* `pnpm -r test` (alle Pakete), `pnpm -r lint`, `pnpm lint:scripts`,
  `pnpm -r typecheck` und die sechs `lint.yml`-Wächter grün — Exit-Codes aus
  einer Statusdatei gelesen, nicht aus einer Pipe.

### Gelernt

**EINE ANTWORT, DIE AUF EINEN FREMDEN DIENST WARTET, HAT KEINE EIGENE
ANTWORTZEIT.** Der 504 war kein Proxy-Problem, sondern eine Route, deren Dauer
an der Länge eines YouTube-Videos hing. Jede Zahl, die man dagegen setzt, ist
geraten. Die Frage ist nicht „wie lange darf es dauern?", sondern „wer hält den
Zustand, während es dauert?" — und das kann nur etwas sein, das den Prozess
überlebt.

**EIN ZUSTAND MIT EINEM ZEITABLAUF GEHÖRT NICHT IN EINE SPALTE.** „Läuft" wird
zu „verschollen", ohne dass jemand klickt. Eine Spalte `briefState` hätte
genau den Schreiber gebraucht, der in diesem Fall tot ist. Gerechnet aus einem
Zeitstempel braucht derselbe Übergang niemanden — und die Stall-Grenze muss
dann aus der Zeitgrenze des Laufs ABGELEITET sein, sonst driften die beiden
Zahlen auseinander und die kleinere gibt eine bezahlte Zeile zu früh frei.

**WER EINE WARTEZEIT WEGNIMMT, NIMMT AUCH EINE SPERRE WEG.** Die offene
Verbindung war unbemerkt der Schutz gegen den Doppelklick. Das fällt beim
Umbau nicht auf, weil nichts bricht — es wird nur teurer. Beim Entkoppeln
einer teuren Route gehört deshalb immer die Frage dazu, was die Synchronität
nebenbei garantiert hat.

**EIN BEWEIS MUSS DIE GRENZE ÜBERSCHREITEN, UM DIE ES GEHT.** Der echte Lauf
war nach 10 Sekunden fertig und hätte den Befund nie berührt — er lag unter
den 60 Sekunden. Erst der 90-Sekunden-Stub (kostenlos) hat gezeigt, dass die
Zeile jenseits des alten Deckels noch „läuft" sagt und danach umspringt. Wer
eine Zeitgrenze repariert, braucht einen Beweis, der sie reisst.

**WERKZEUG:** Port 8080 war von `plane-proxy` belegt — die Wegwerf-Instanz
nimmt ihre Ports aus der Env-Kopie (`_APP_HTTP_PORT`, `_APP_HTTPS_PORT`,
`_APP_MQTT_PORT`, `_APP_MQTT_WSS_PORT`), hier 8099/8444/8885/8086. Und der
Worktree brauchte wieder die `@shikijs`-Symlinks in `node_modules`, sonst
antwortet jede Route 500.

---

## 16. K6 gebaut (2026-11-08) — die SEO/GEO-Regeln sind eine Prompt-Fassung und EINE Prüfregel

Davids Wunsch, wörtlich: „der Artikel soll alle SEO/GEO-relevanten Regeln
beachten, gleichzeitig Freude beim Lesen bereiten und am Ende zum Diskutieren
anregen." Gebaut ist das genau dort, wo §6 es verortet hat — in einer neuen
Fassung des Entwurfs-Prompts (**`insights-d-2`**) und in der **siebten
Prüfregel**, die von diesen Zusagen die beiden prüft, die sich wirklich
rechnen lassen. Kein Schema, keine Migration, keine neue Spalte.

> **Zusammen mit BI4 lesen.** Diese Fassung bestellt MEHR Struktur (FAQ-Block,
> Diskussionsfrage) und damit längere Antworten — also genau die Grenze, die
> BI4 vermisst: `draft.post.ts` hat `maxTokens: 8000` fest verdrahtet, während
> `targetWords` bis `INSIGHTS_DRAFT_WORDS_MAX` (2.000) erlaubt. K6 macht das
> Problem früher sichtbar, es löst es nicht. Wer `insights-d-2` auf hohe
> Wortzahlen loslässt, bevor BI4 durch ist, verliert bezahlte Läufe. Der
> Hinweis steht als Kopfkommentar an `INSIGHTS_DRAFT_PROMPT_VERSION`, damit
> ihn auch findet, wer nur die Datei liest.

### Was gebaut wurde

| Stück | Datei | Was es tut |
|---|---|---|
| Prompt-Fassung `insights-d-2` | `packages/insights/shared/insightsPrompts.ts` | sechs SEO/GEO-Regeln als eigener Block `SEO_GEO_RULES`, VOR den vier Verboten eingehängt |
| Die siebte Prüfregel | `packages/insights/shared/insightsPost.ts` | zwei Codes in `insightsReviewIssues`: `text_without_closing_question`, `text_without_question_headings` |
| Die zwei puren Rechnungen | `packages/insights/shared/insightsPost.ts` | `insightsQuestionHeadings()`, `insightsEndsWithQuestion()`, Deckel `INSIGHTS_QUESTION_HEADINGS_MIN = 2` |
| Anzeige im Editor | `packages/insights/app/components/InEditor.vue` | zwei Einträge in `ISSUE_KEY`, `min` im Meldungstext |
| i18n | `packages/insights/i18n/locales/{de,en}.json` | `textWithoutClosingQuestion`, `textWithoutQuestionHeadings` |
| Launch-Texte nachgezogen | `packages/insights/scripts/launch/{nike,adidas-vs-nike,ikea,ranking}.mjs` | je FAQ-Block (drei `###`-Fragen) und eine Diskussionsfrage als letzter Absatz, de+en |

Die sechs Regeln im Prompt: die **Antwort im ersten Absatz** · **Zwischen­
überschriften als Fragen** (mindestens zwei) · **definierende Sätze** („X ist
…") · ein **FAQ-Block am Ende** mit drei bis fünf echten Fragen, jede als
`###`-Überschrift · der **letzte Absatz ist eine Diskussionsfrage** · **keine
Floskeln** (ausdrücklich kein „In der heutigen schnelllebigen Welt").

### Die Entscheidungen, die drinstecken

**DIE REGEL SITZT IM GATE, NICHT IM SCHEMA — und das ist die wichtigste.**
`insightsPostRuleIssues` hätte gepasst (es ist eine Form-Regel, und die
Form-Regeln gelten auch im Formular), aber es läuft im `superRefine` von
`insightsPostSchema`, und durch dieses Schema geht JEDES Schreiben — auch das
des Entwurfs-Laufs. Eine Regel dort hätte die Antwort eines BEZAHLTEN Laufs
abgelehnt, sobald das Modell die Diskussionsfrage vergisst: Lauf weg, Geld
weg, Redakteur ohne Text. Genau diese Bauart hat der K5-Nachtrag vom
2026-10-28 schon einmal gekostet. Ein unvollständiger Entwurf ist kein Fehler,
sondern Arbeit — er gehört in den Editor, wo die Liste ihn anzeigt, und
blockiert erst den Weg nach `review`. Die Begründung steht ausführlich am Kopf
von `insightsReviewIssues` UND als Warnung an `insightsPostRuleIssues`.

**DER FAQ-BLOCK TRÄGT DIE FRAGEN ALS `###`-ÜBERSCHRIFTEN — dadurch braucht die
Regel keine Format-Ausnahme.** Der naheliegende Weg wäre gewesen, das RANKING
auszunehmen: seine Plätze stehen in den DATEN, nicht im Text
(`FORMAT_BRIEFING.ranking` verbietet sie dort ausdrücklich), ein Ranking-Text
hat also kaum Kapitel. Statt einer Ausnahme für genau ein Format koppelt der
Prompt den FAQ-Block an `###`-Überschriften: damit hält JEDES Format die Regel
mit seinem FAQ-Block, und die Regel gilt für alle vier gleich. Eine Regel mit
Ausnahme für ein Format ist eine halbe Regel.

**GEPRÜFT WIRD JEDE NICHT-LEERE FASSUNG, nicht nur die Grundfassung.** Eine
leere zweite Fassung prüft die Regel NICHT (dieselbe Begründung wie bei
`sourceTexts`: eine Prüfung ohne Text wäre eine Lüge) — sobald dort aber Text
steht, gilt sie, sonst verlöre der englische Leser die Frage still.

**GEZÄHLT, NICHT GERATEN.** Eine Überschrift zählt nur, wenn ihr Text mit
einem Fragezeichen ENDET: „Warum? Drei Gründe" erwähnt eine Frage, stellt aber
keine — und nur die gestellte ist der Aufhänger, den eine Antwortmaschine als
Frage liest. Auszeichnung fällt auf beiden Seiten weg, `**Was heißt das?**`
zählt also. Für die Schlussfrage gilt: die letzte nicht-leere Zeile, und eine
ÜBERSCHRIFT zählt dort nicht — ein Text, der mit `## Und ihr?` aufhört,
kündigt einen Absatz an, den niemand geschrieben hat.

**VIER VERBOTE UNANGETASTET.** `HARD_RULES` ist die rechtliche Hälfte und mit
`insights-d-1` wortgleich; die neuen Regeln sind ein EIGENER Block davor. Die
zwei Sorten zu mischen hiesse, dass eine Lockerung an der Form („diesmal ohne
FAQ") aussieht wie eine Lockerung an der Haftung. Ein Test nagelt beides fest,
inklusive der Reihenfolge (die Verbote sind das Letzte vor dem Brief).

**NUR ZWEI ZUSAGEN SIND PRÜFBAR, die anderen vier bleiben Prompt.** „Die
Antwort im ersten Absatz", „definierende Sätze" und „keine Floskeln" sind
BEWERTUNGEN — ein Regex darüber wäre eine Prüfung, die man austrickst, ohne
besser zu schreiben. §6 sagt es genauso: „Alles Übrige ist Prompt und bleibt
Prompt."

**DIE FASSUNG WIRD HOCHGEZÄHLT, ALTE BEITRÄGE BEHALTEN IHRE.** `insights-d-2`
bestellt inhaltlich etwas anderes. Beiträge mit `draftPromptVersion:
'insights-d-1'` tragen das weiter und sollen das auch — sonst behaupten zwei
verschiedene Läufe dieselbe Herkunft.

### Beweis

* `pnpm --filter insights test` → **569/569** (22 Dateien), darunter:
  * **Gegenprobe der Regel in beide Richtungen:** ein Text ohne Frage am Ende
    fällt durch (zwei Befunde mit Stelle und Sprache), derselbe Text mit
    Frage-Kapiteln und Schlussfrage besteht.
  * **gezählt statt geraten:** Fragezeichen in der Mitte zählt nicht, `#`
    (oberste Ebene) zählt nicht, Auszeichnung wird abgeschnitten, EINE
    Frage-Überschrift ist zu wenig (der Deckel liegt bei zwei).
  * **leere zweite Fassung** wird nicht geprüft; sobald sie Text trägt, melden
    beide Befunde `detail: 'en'`.
  * **alle vier Formate** halten die Regel — das Ranking mit seinem FAQ-Block.
  * **die Prompt-Zusagen am Text festgenagelt** (wie
    `insightsVideoBrief.test.ts` für `insights-b-1`): jede der sechs Regeln,
    die `###`-Kopplung des FAQ-Blocks, Davids Floskel wörtlich, die vier
    Verbote samt Reihenfolge, und dass jedes Format dieselben Regeln bekommt.
* Repo-weit grün, Exit-Code getrennt von der Ausgabe gelesen (nicht aus einer
  Pipe): `pnpm -r test` **exit 0** (569 + alle übrigen Pakete), `pnpm -r lint`
  **exit 0**, `pnpm lint:scripts` **exit 0**, `pnpm -r typecheck` **exit 0**,
  und die fünf Wächter von `lint.yml` (`check:manifests`, `check:i18n-keys`,
  `check:bilanz`, `check:doc-links`, `check:single-copy`) jeder **exit 0**.
* **KEIN echter Lauf** — ein Entwurfs-Lauf kostet Geld, und das ist Davids
  Entscheidung (Angebot steht im Bericht: ein 700-Wörter-Entwurf liegt nach
  den K5-Messungen deutlich unter einem Cent).

### Gelernt

**EINE NEUE PRÜFREGEL TRIFFT ALTEN INHALT — und das ist der eigentliche
Beweis, dass sie beisst.** Nach dem Einbau war genau ein Test rot:
`launchContent.test.ts` („die sechs Prüfregeln ohne Quelltexte: keine
Treffer"). Keiner der vier Launch-Beiträge endete mit einer Frage (alle vier
endeten auf den **Methodik:**-Satz), und das Markenprofil hatte überhaupt
keine Zwischenüberschrift. Zwei Wege standen offen: die Regel an der
Prompt-Fassung grandfathern (unsichtbar, und damit genau die Sorte stiller
Ausnahme, die dieses Repo nicht mag) oder die Texte nachziehen. Nachgezogen
ist richtig, weil es die Arbeit ist, die ein Redakteur ohnehin tun müsste —
und weil der Test damit WEITER beweist, was er behauptet. Der
**Methodik:**-Satz ist dabei eine Zeile nach oben gewandert: die
Diskussionsfrage muss wirklich die letzte sein.

**ACHTUNG BEIM NACHZIEHEN DER LAUNCH-TEXTE: der Namensfilter liest mit.** Der
IKEA-Artikel ist um die Falle `von IKEA` → `vonikea` → enthält `nike`
herumgeschrieben (§ `launchContent.test.ts`). Jeder neue FAQ-Satz läuft durch
denselben Herabsetzungs- und Namensfilter wie der Rest; das Ranking darf in
seinem FAQ keine Marke nennen, die nicht in `entries` steht. Die Tests haben
das abgedeckt — aber nur, weil sie VOR dem Formulieren liefen.

**DIE PROD-TEXTE SIND DAMIT NOCH NICHT NEU.** Die vier Beiträge liegen seit
dem 2026-11-08 auf Prod (I6 Stufe 1). Geändert ist der SEED, nicht die
Datenbank: die neuen FAQ-Blöcke und Diskussionsfragen kommen erst mit dem
zweiten Seed-Lauf dorthin, der für Davids Brand-Checks ohnehin aussteht.
Bis dahin bleiben die Live-Texte, wie sie sind — die Regel blockiert sie
nicht, weil sie nur den Weg NACH `review` prüft und nicht den Weg zurück.
