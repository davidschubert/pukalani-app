# F60 — Mehrsprachige Betreiber-Seiten

**Stand:** Konzeption 2026-09-10 · Entscheidungen gefallen (DECISION-LOG 2026-09-10)
**Layer:** `packages/pages` (+ ein kleiner Vertrag im `core`)
**Apps mit dem Layer:** `platform` (Pool), `portfolio`, `control`, `branding`

---

## 1. Ausgangslage — was es schon gibt

Die Annahme in OPEN-ITEMS („Muster Kategorie-Übersetzungen: eine Fassung
ÜBERSCHREIBT die Grundfassung") beschreibt den Stand vom Tag der Aufnahme,
nicht den von heute. Der `pages`-Layer hat das Modell **seit `pages-001`**, und
zwar in der stärkeren Form:

| Was | Wo | Zustand |
| --- | --- | --- |
| Eine Zeile je `slug` × `locale`, Unique-Index `uq_slug_locale` | `scripts/migrations/001-pages-table.ts` | ✅ |
| `body` als MEDIUMTEXT (~16 MB; Zod deckelt bei 200.000) | `002-body-mediumtext.ts` | ✅ |
| Titel, Body und Veröffentlicht-Status **je Fassung** | `shared/types/page.ts` | ✅ |
| EN/DE-Reiter im Editor, gespeichert wird der aktive Reiter | `app/pages/dashboard/pages.vue` | ✅ |
| Öffentliche Auflösung nach `?locale=`, Fallback `en` | `server/api/pages/public/[slug].get.ts` | ✅ |
| Sprachgenauer Microcache der Navigation | `public/index.get.ts` | ✅ |

**Folge:** keine Ablage-Entscheidung, keine Nebentabelle, **keine Migration**.
Das Kategorie-Muster wäre hier ein Rückschritt — ein JSON-Feld in der Zeile mit
200.000-Zeichen-Rechtstexten sprengt das MariaDB-Zeilenbudget
(`.claude/rules/appwrite.md`).

## 2. Die vier Lücken um dieses Modell herum

1. **Der Fallback ist stumm.** Eine nur auf DE gepflegte Seite kommt unter dem
   EN-Pfad `/imprint` als deutscher Text heraus — mit `lang="en"` am Dokument,
   deutschem Titel in der EN-Navigation, und `useLocaleHead` bewirbt weiterhin
   ein `hreflang="en"`-Alternate, hinter dem kein englischer Text steht. Bei
   Impressum und Datenschutz ist das der unangenehmste Fall.
2. **Kein KI-Vorschlag** — der optionale Teil des Items.
3. **Sprachliste hartcodiert** `['en','de']` im Editor, obwohl der Typ-Kommentar
   „beliebige Sprachen" verspricht und die Liste in der i18n-Config steht.
4. **Keine Sicht auf FEHLENDES** — die Tabelle zeigt Badges für vorhandene
   Fassungen, nie „DE fehlt".

## 3. Davids Entscheidungen (2026-09-10)

| # | Frage | Entscheidung |
| --- | --- | --- |
| a | Zuschnitt | Lücken schließen **+ KI-Vorschlag**, ohne Migration |
| b | Fallback | **Zeigen und ehrlich beschriften** — nicht 404, nicht stumm |
| c | KI-Vorschlag | **Wie bei den Kategorien**: Knopf füllt das Formular, die Route speichert nichts |
| d | Lange Texte | **Deckel 12.000 Zeichen + klare Absage**, ein Klick = ein Aufruf |

Verworfene Alternativen und ihre Begründung: DECISION-LOG 2026-09-10.

## 4. Was gebaut wird

### 4.1 Ehrlicher Fallback (Entscheidung b)

**Server** — `public/[slug].get.ts` liefert zusätzlich `availableLocales`: die
Sprachcodes, in denen es diese Seite **veröffentlicht** gibt. Die Zeilen sind
ohnehin schon geladen; es kostet keine zweite Abfrage.

**Seite** — `app/pages/[slug].vue`:
- `<article :lang="page.locale">`, damit Vorleseprogramme und Übersetzer die
  Sprache des Textes kennen (heute erben sie die des Dokuments und lesen
  deutschen Text englisch vor);
- eine schlichte Zeile über dem Titel, wenn die gelieferte Sprache nicht die
  gewünschte ist: *„Diese Seite gibt es nur auf Deutsch."*;
- die Seite meldet ihre vorhandenen Sprachen an den EINEN SEO-Kopf.

**Core-Vertrag** — `useSeoHiddenLocales()`. Der war beim Bau noch nicht da; ein
eigener (`usePageLocaleAlternates()` plus `core/shared/localeAlternates.ts`) war
schon geschrieben und ist beim Rebase **fallen gelassen** worden, weil eine
Nachbarsitzung für BI1 I3 am selben Tag denselben Mechanismus gebaut hatte
(CLAUDE.md: „zwei Wege für dieselbe Sache kosten dauerhaft mehr als eine
verlorene Stunde"). Die fremde Fassung kann an einer Stelle mehr — sie räumt
auch die `og:locale:alternate`-Meta-Angaben mit — und trifft bei `x-default` die
andere, bessere Entscheidung: es BLEIBT stehen, weil es keine Sprachzusage ist,
sondern die Ansage „nimm diese, wenn keine passt".

Der Unterschied in der Bauart: der fremde State ist app-weit und muss von der
Seite ZURÜCKGESETZT werden (`onBeforeRouteLeave` + `onUnmounted`) — der eigene
trug den Pfad mit und war dadurch automatisch wirkungslos, wenn er nicht mehr
passte. Die Seite tut jetzt das Zurücksetzen; die Gegenprobe im Beweis (Punkt 7
und 8) prüft genau das.

**Bewusst NICHT geändert:** die Navigation zeigt weiter den Titel der
Ersatzsprache, ohne Zusatz. Ein „(Deutsch)" hinter jedem Menüpunkt wäre Lärm an
der Stelle, an der niemand liest; die Seite selbst sagt es, und der Weg dorthin
ist ein Klick.

### 4.2 Editor: Sprachen aus der Config, Fehlendes sichtbar (3 + 4)

- Die Reiter kommen aus `useI18n().locales` statt aus einer Konstante — eine
  dritte App-Sprache erscheint damit ohne Code-Änderung.
- Die Tabelle zeigt **einen Badge je App-Sprache**: grün „veröffentlicht",
  grau „Entwurf", umrandet „fehlt".
- Der Anzeige-Titel folgt der Standardsprache statt einem hartcodierten `en`.

### 4.3 KI-Vorschlag (c + d)

Neue Route `POST /api/pages/translate` — Wort für Wort das Muster von
`posts/categories/translate.post.ts`:

- **Sie speichert nichts.** Sie gibt Titel und Body zurück, die im Formular
  landen; veröffentlicht wird von Hand.
- **Zwei Produkt-Gates**, nicht eins: `pages` UND `ai`.
- **Kill-Switch:** kein hinterlegter Schlüssel ⇒ 503, und die Oberfläche zeigt
  den Knopf gar nicht erst (`aiTranslate` aus `/api/pages`, plus
  `planAllows('ai')`).
- **Drossel:** IP-Bucket `pages:translate` in `core/server/middleware/05.rate-limit.ts`,
  dieselbe Kostenklasse wie die UGC-Übersetzungen.
- **ZDR:** `{ zdr: true, dataCollection: 'deny', allowFallbacks: false }` —
  fail-closed. Anders als bei einem Kategorie-Namen geht hier ein
  **Rechtstext** an den Anbieter; lieber „gerade nicht verfügbar" als ein
  stiller Ausweich auf einen Anbieter ohne Zero-Data-Retention.
- **Deckel 12.000 Zeichen** (Entscheidung d): darüber lehnt das Zod-Schema ab,
  und der Knopf sagt es vorher.
- Der Text kommt **aus dem Formular**, nicht aus der Datenbank — sonst käme der
  Vorschlag beim Anlegen einer Seite immer zu spät.

Quelle des Vorschlags ist die erste ANDERE Sprache mit Inhalt, bevorzugt die
Standardsprache. Ein leerer Vorschlag lässt das Feld in Ruhe.

## 5. Nicht in diesem Paket

- **„Übersetzung veraltet"-Marker** (Grundfassung nach der Übersetzung geändert)
  — von David verworfen, weil er eine Prod-Migration auf vier Instanzen kostet
  für ein Problem, das bei zwei Sprachen und einer Handvoll Seiten sichtbar ist.
- Leser-Auto-Übersetzung — bleibt ausgeschlossen (COMPLETE „KI-Übersetzung").
- Abschnittsweises Übersetzen langer Texte.

## 6. Beweise

Unit-Tests (Fallback-Regel, Alternates-Filter, Übersetzungs-Schema) ·
`typecheck`/`lint` der berührten Layer · `check:i18n-keys` · `check:manifests` ·
`check:bilanz` · Klick-Beweis hinter Login: nur DE anlegen → veröffentlichen →
`/imprint` zeigt den Hinweis und kein `hreflang="en"` → EN per KI vorschlagen →
speichern → Hinweis verschwindet, Alternate ist wieder da.
