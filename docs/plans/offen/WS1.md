# WS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **WS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**WS1 — Die Werkstatt-Seite in Teile schneiden: Stand nach dem WS1-Lauf (2026-11-21).**
`packages/brand/app/pages/brand/[profileId]/[stepKey].vue`: 5.235 Zeilen vor
Q21, 5.119 nach Q21, **3.746 nach dem WS1-Lauf** (fünf Schnitte, Erledigt-Liste
„WS1-Lauf"). Der Rauch-Test (`packages/brand/tests/render/workshopPage.test.ts`,
Vitest-Projekt `render`) hat jetzt vier Fälle: Kontext-Kapitel samt Log,
Leiste und Balken; Steckbrief, frühere Fassungen und Konflikt;
Bestätigungs-Modul; Farbwelt auf einem zweiten Probe-Profil mit
freigeschaltetem Brand Design.

**Regeln für jeden weiteren Schnitt:** ein Kapitel je Pull Request; Verhalten
und Aussehen bleiben gleich; Zustand bleibt im Store oder dort, wo er heute
liegt, keine neue Zustands-Quelle; der Rauch-Test ist vor und nach dem Schnitt
grün, und wer den Klick-Weg eines Kapitels nicht abdeckt, ergänzt ihn im
Rauch-Test (gestellte Antworten in `tests/render/support/workshopFixtures.ts`).
FALLE: der Store lebt über alle Fälle einer Datei und lädt dasselbe Kapitel
beim nächsten Aufbau nicht neu — ein Fall, der den Store verändert (etwa einen
Konflikt auflöst), muss einen vollständigen Stand hinterlassen.

**Geschnitten** (WS1-Lauf, in dieser Reihenfolge): (b) Modale →
`BwAdvisorInfoModal`, `BwVersionsModal`, `BwConflictModal`; (a) Log →
`BwWorkshopLog`; (g) Leiste und Balken → `useBrandWorkshopRail`,
`useBrandWorkshopLayout`, `BwStageBar`; (d) Design-Werkzeuge →
`useBrandDesignToolSync`; (c, Teil) Bestätigungs-Modul → `BwStageConfirm`.

**Offen, jeweils mit dem Grund, warum es im WS1-Lauf blieb:**

- **(c, Rest) Antwort-, Options- und Entwurfs-Modul im Zug** (Vorlage im
  `#default`-Bereich, Skript „Das Antwort-Modul im Zug" und „Die drei
  Richtungen"). Der wichtigste Klick des Options- und Antwort-Moduls schickt
  die Antwort an George (`…/converse`) — der Rauch-Test darf keine KI-Route
  auslösen, ein gestellter Gesprächs-Strom fehlt noch. Das Entwurfs-Modul
  hängt am Erzeugungs-Zustand (Strom, Hinweis-Feld, abgeschnittener Entwurf,
  Neuversuch): als Baustein bräuchte es rund zwanzig Eingänge und Ereignisse.
  Voraussetzung für den nächsten Schnitt: ein gestellter Strom für
  `converse`/`generate` im Rauch-Test.
- **(e) Session, Verlauf, Eröffnungszug** (Skript „Eine Stimme", „George: die
  nächste offene Frage", „Die aktive Session", „Verlauf, Eröffnungszug und
  Auto-Weiter"). Die heiklen Stellen sind SSR-Nutzlast und `onMounted`-Klammern
  gegen Hydration-Fehler; der Rauch-Test baut nur im Browser auf und sieht
  beides nicht. Erst mit einem Prüfweg, der Server-Ausgabe und Hydration
  vergleicht, schneiden.
- **(f) Korrektur-Regel und Warteschlange** (Skript „Slot-Zustände",
  „Die Korrektur-Regel", „Die Warteschlange „neu besprechen""). Das ist der
  Handlungs-Kern der Seite (eingeben, bestätigen, korrigieren, erzeugen, die
  Karten-Rechnung `slotCards`), den Bühne, Log und Leiste gleichzeitig nutzen.
  Ein Composable bräuchte rund 15 Eingänge und 25 Rückgaben, ohne die
  Kopplung zu senken. Sinnvoll erst, wenn (c) und (e) stehen.
- **DNA-Vorschlag und Book & Kit** (Rest von d): andere Form als die fünf
  Werkzeuge (Mix-Quellen, Bretter, kein Abgleich nach dem Mount); klein genug,
  um in der Seite zu bleiben.
