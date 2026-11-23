# WS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **WS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**WS1 — Die Werkstatt-Seite in Teile schneiden: Stand nach Bahn C (2026-11-23).**
`packages/brand/app/pages/brand/[profileId]/[stepKey].vue`: 5.235 Zeilen vor
Q21, 5.119 nach Q21, 3.746 nach dem WS1-Lauf (fünf Schnitte, Erledigt-Liste
„WS1-Lauf"), 3.767 auf `main` vor Bahn C (zwischendurch gewachsen), **3.325
nach Bahn C** (zwei Schnitte, s. unten). Der Rauch-Test
(`packages/brand/tests/render/workshopPage.test.ts`, Vitest-Projekt `render`)
hat jetzt acht Fälle: Kontext-Kapitel samt Log, Leiste und Balken; Steckbrief,
frühere Fassungen und Konflikt; Bestätigungs-Modul; Farbwelt; Korrektur-Regel;
Options-Modul; Antwort-Modul; Entwurfs-Modul.

**Regeln für jeden weiteren Schnitt:** ein Kapitel je Pull Request; Verhalten
und Aussehen bleiben gleich; Zustand bleibt im Store oder dort, wo er heute
liegt, keine neue Zustands-Quelle; der Rauch-Test ist vor und nach dem Schnitt
grün, und wer den Klick-Weg eines Kapitels nicht abdeckt, ergänzt ihn im
Rauch-Test (gestellte Antworten in `tests/render/support/workshopFixtures.ts`).
FALLE: der Store lebt über alle Fälle einer Datei und lädt dasselbe Kapitel
beim nächsten Aufbau nicht neu — ein Fall, der den Store verändert (etwa einen
Konflikt auflöst), muss einen vollständigen Stand hinterlassen. Ein Fall, der
einen ANDEREN Ausgangsstand des Kapitels braucht, läuft direkt nach dem
Farbwelt-Fall (anderes Profil ⇒ das Kontext-Kapitel wird frisch geladen) und
schaltet seinen Stand über einen Schalter der gestellten Antwort ein
(`workshopReviseSlotConfirmed`), der danach an bleibt.
KI-ROUTEN IM RAUCH-TEST: `…/converse` und `…/generate` antworten nur mit einem
gestellten Strom, wenn der Fall sie ausdrücklich scharf schaltet (`aiStub`,
Frames aus `serializeBrandGenerationEvent`); jeder andere Aufruf zählt in
`calls.ai`, das in jedem Fall 0 bleibt.

**Geschnitten** (WS1-Lauf): (b) Modale → `BwAdvisorInfoModal`,
`BwVersionsModal`, `BwConflictModal`; (a) Log → `BwWorkshopLog`; (g) Leiste und
Balken → `useBrandWorkshopRail`, `useBrandWorkshopLayout`, `BwStageBar`;
(d) Design-Werkzeuge → `useBrandDesignToolSync`; (c, Teil) Bestätigungs-Modul
→ `BwStageConfirm`.

**Geschnitten** (Bahn C, 2026-11-23, Zweige `claude/bahnc-ws1-c` und darauf
`claude/bahnc-ws1-f`, noch nicht auf `main`):
- **(c, Rest)** → `BwStageAnswer` (Beispiel-Ausweg), `BwStageOptions`
  (Richtungen, Boards, Text-Karten, eigene Formulierung; `BwBoardChoice` wohnt
  jetzt dort), `BwStageDraft` (Entwurfs-Modul) — Muster `BwStageConfirm`. Der
  Erzeugungs-Zustand bleibt in der Seite (`hints`, `hintOpen`, `ownChoice`,
  `exampleOpen` als `v-model`/Ereignis). `BwStageDraft` hat 15 Eingänge und
  11 Ereignisse: viel, aber flach — reine Anzeige, keine eigene Rechnung.
  3.767 → 3.520.
- **(f, Teil) Korrektur-Regel** → `useBrandSlotRevision` (Impact-Hinweis,
  Korrigieren, Übernehmen, Verwerfen, `correctThenGo`, die vier
  Ablehnungs-Auskünfte). 5 Eingänge, 11 Rückgaben (davon 6 durchgereichte
  Impact-Refs); `editingSlotId`/`editBaseline` bleiben Refs der Seite.
  3.520 → 3.325.

**Offen, jeweils mit gemessenem Grund** (Zählung: Deklarationen eines
Abschnitts, die außerhalb gelesen werden = Ausgänge; Deklarationen der Seite,
die er liest = Eingänge; Stand 3.325 Zeilen):

- **(e) Session, Verlauf, Eröffnungszug** (Skript „Eine Stimme" bis vor
  „Slot-Zustände", rund 1.200 Zeilen). Als Ganzes 70 Deklarationen, davon 58
  außerhalb gelesen, 20 Eingänge — der Abschnitt IST die Mitte der Seite
  (`activeSlot`, `nextSlot`, `turns`, `stageClaim`, `completion` lesen Bühne,
  Log, Leiste und Module). Der kleinste eigene Teil „Verlauf, Eröffnungszug
  und Auto-Weiter" hat 13 Ausgänge und 19 Eingänge und trägt das
  `await useAsyncData` der Session-Historie (SSR-Nutzlast, Schlüssel aus
  `activeSessionKey`) samt der `onMounted`-Klammer um den Eröffnungszug.
  Gegenseitige Abhängigkeit mit (f): (e) liest `turnEnded` aus der
  Warteschlange, (f) liest aus (e) zwölf Namen (u. a. `goToSession`,
  `pinSession`, `goToAcceptance`, `closingFrom`, `slotFacts`, `readinessOf`).
  Ein Composable senkte die Kopplung nicht, und den heiklen Teil (Hydration,
  Reihenfolge der `await` in `setup`) sieht der Rauch-Test nicht — er baut nur
  im Browser auf. Erst mit einem Prüfweg, der Server-Ausgabe und Hydration
  vergleicht, schneiden.
- **(f, Rest) Slot-Zustände und Warteschlange „neu besprechen"**.
  Slot-Zustände: 6 Deklarationen, 5 Ausgänge (`confirmSlot`, `onInput`,
  Weiter-Knopf), 16 Eingänge. Warteschlange: 13 Deklarationen, 11 Ausgänge
  (`slotCards`, `cardFor`, `generateSlot`, `hints`, `hintOpen`, `turnEnded`,
  …), 19 Eingänge, und ihr Session-Wechsel-Beobachter räumt Zustand aus (e)
  (`promptDraft`, `exampleOpen`, `editingSlotId`, `keepWritingFor`). Das ist
  die Karten-Rechnung, die Bühne, Log und Leiste gleichzeitig lesen; ein
  Composable bräuchte die Hälfte der Seite als Eingang. Sinnvoll erst nach (e).
- **DNA-Vorschlag und Book & Kit** (Rest von d): andere Form als die fünf
  Werkzeuge (Mix-Quellen, Bretter, kein Abgleich nach dem Mount); klein genug,
  um in der Seite zu bleiben.
