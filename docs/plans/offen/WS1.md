# WS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **WS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**WS1 — Die Werkstatt-Seite in Teile schneiden: der Rest nach Q21 (2026-11-21).**
`packages/brand/app/pages/brand/[profileId]/[stepKey].vue` hat nach Q21 noch
5.119 Zeilen (Skript bis Zeile 3844, Vorlage ab 3846). Q21 hat den Rauch-Test
gebaut (`packages/brand/tests/render/workshopPage.test.ts`, Vitest-Projekt
`render`) und den ersten Abschnitt geschnitten: den Website-Streifen
(`BwSiteStrip.vue`, Erledigt-Liste „Q21").

**Regeln für jeden weiteren Schnitt:** ein Kapitel je Pull Request; Verhalten
und Aussehen bleiben gleich; Zustand bleibt im Store oder dort, wo er heute
liegt, keine neue Zustands-Quelle; der Rauch-Test ist vor und nach dem Schnitt
grün, und wer den Klick-Weg eines Kapitels nicht abdeckt, ergänzt ihn im
Rauch-Test (gestellte Antworten in `tests/render/support/workshopFixtures.ts`).

**Die Kapitel** (Zeilen Stand Q21; Skript = Abschnitts-Überschrift `// ──`):

- ~~**(a) Der Log rechts**~~ — **geschnitten (WS1-Lauf 2026-11-21):**
  `BwWorkshopLog` hält, was nur der Log liest (aufgeklappte Kapitel, lesend
  geholte Felder fremder Kapitel); die Karten rechnet weiter die Seite
  (`chapterCards`), jede Handlung geht als Ereignis zurück. Seite 4.922 →
  4.612 Zeilen. Rauch-Test: fremdes Kapitel auf/zu/auf (ein Abruf),
  „Beantworten" springt in die Session.
- ~~**(b) Die Modale**~~ — **geschnitten (WS1-Lauf 2026-11-21):**
  `BwAdvisorInfoModal`, `BwVersionsModal` (holt die Historie selbst),
  `BwConflictModal` (liest `store.conflict`). Seite 5.119 → 4.922 Zeilen.
  Der Rauch-Test hat dafür einen zweiten Fall (Steckbrief, frühere Fassungen,
  Konflikt).
- **(c) Das Antwort-Modul im Zug** — Vorlage der Züge 4117–4613 und die aktive
  Karte 4614–4722; Skript „Das Antwort-Modul im Zug" 2007–2212 und „Die drei
  Richtungen" 2213–2283.
- **(d) Die Design-Werkzeuge** — Vorlage der Panels (DNA bis Pressekit) rund
  um 3980–4116; Skript 3196–3700 (DNA, Farbwelt, Typografie, Zeichen,
  Bildsprache, Bewegung, Book & Kit). Eher ein Composable je Werkzeug als neue
  Vorlagen, die Panels sind schon Komponenten.
- **(e) Session, Verlauf, Eröffnungszug** — Skript 295–1504 (Stimme, nächste
  Frage, aktive Session, Verlauf und Auto-Weiter). Kein Template-Anteil; ein
  Composable, das der Store-Grenze folgt. Das heikelste Kapitel (SSR-Payload,
  `onMounted`-Klammern) und deshalb zuletzt.
- **(f) Korrektur-Regel und Warteschlange** — Skript 1505–2006 (Slot-Zustände,
  Korrektur-Regel, „neu besprechen").
- ~~**(g) Leiste, Fortschritt, Navigation, Abnahme**~~ — **geschnitten
  (WS1-Lauf 2026-11-21):** `useBrandWorkshopRail` (Leiste der drei Schichten
  und Gesamtfortschritt; die Seite reicht die Rechnungen herein, die Bühne und
  Leiste teilen), `useBrandWorkshopLayout` (Spalten ein-/ausklappen, schmale
  Fenster), `BwStageBar` (Balken mit der `h1`). Die Navigation selbst
  (`goToStep`, `selectSession`, `goToBrand`, Abnahme-Sprünge) bleibt in der
  Seite: sie hängt am Autosave und an der Session-Wahl. Seite 4.612 → 3.957
  Zeilen.
