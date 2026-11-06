# Umbau-Auftrag: Die echte Werkstatt wird „Gespräch als Bühne"

Stand 2026-09-02 · Status: **wartet auf Davids Freigabe** · Ausführung: zwei
Opus-Läufe (Zuschnitt unten), Verifikation im Fable-Hauptloop.

## 0. Was das hier ist

Davids Konzept-Revision vom 2026-09-02 („der ki markenberater muss zentral in
der mitte sein … rechts der LOG-bereich … nach jeder frage einmal final
confirmen") wurde in **38 Korrekturrunden** an einem Klickdummy ausgearbeitet
und abgenommen. Dieser Auftrag überträgt den Dummy-Stand auf die echte
Werkstatt.

**Der verbindliche Vertrag ist der Dummy selbst:**
`packages/brand/.playground/app/pages/brand/demo/gespraech.vue`
(+ `GdSidebar.vue`, `demoRail.ts`) — Commits `ec3e884a…0e84bc3a` auf `main`,
jede Runde einzeln committet und im Kopf der Dateien begründet. Bei jeder
Detailfrage gilt: **so wie im Dummy, Pixel zählen** (Davids Runden 4–7 waren
1px-Korrekturen). Der Dummy wird NICHT gelöscht — er bleibt der Beweis der
Abnahme.

**Die betroffene echte Seite:**
`packages/brand/app/pages/brand/[profileId]/[stepKey].vue` (Werkstatt) sowie
die Brandings-Übersicht des brand-Layers. `BwWorkspace`, `BwRailFooter`,
`BwBrandCard` und `brand.css` tragen bereits ALLE nötigen Props/Slots/Klassen
aus den Dummy-Runden (Default-aus, live harmlos) — die echte Seite muss sie
nur benutzen.

## 1. Modell-Entscheidungen (DECISION-LOG 2026-09-02, bindend)

1. **EINE Stimme.** George spricht den GANZEN Wizard. Vera/Milo/Nika/Otto
   sprechen nie selbst; George erwähnt sie („Ich habe euren Kontext mit Vera
   durchgesehen — sie liest streng mit"). Ihre Interview-Techniken bleiben
   als Phasen-Facetten in den Prompts. Handover-Züge werden zu
   George-Phasen-Intros. Die /team-Seite behält das Team.
2. **Brand Language geht in Brand Foundation auf.** Tagline & Messaging und
   Name & Prüfung sind Foundation-Kapitel VOR dem Foundation-Ergebnis
   (demoRail zeigt die Ziel-Reihenfolge). Journey/Slot-Registry entsprechend.
3. **Der Bereich heißt überall „Purpose, Vision & Mission"** (i18n `pvm`
   de+en ist schon umgestellt, R38).

## 2. Layout-Vertrag (Runde → Regel)

### Linke Spalte: Sidebar im Nuxt-UI-Muster (R14-R22, R30)
- `GdSidebar` aus dem Playground wird als Layer-Komponente gehoben
  (z. B. `BwWorkspaceSidebar.vue`); Daten kommen aus der echten Journey
  statt `demoRail`.
- Oben der **Brand-Switcher** (ersetzt Topbar-Switcher): Trigger-Zeile mit
  Monogramm; Menü in exakter Trigger-Breite
  (`w-(--reka-dropdown-menu-trigger-width)`), Einträge ZWEIZEILIG (Name /
  Vorhaben + Inhaltssprache-Flagge), Häkchen an der aktiven Marke, darunter
  „Neues Branding" + „Brandings verwalten". **Falle:** das Menü teleportiert
  an den Body — Content braucht `bw-root bw-overlay` (Token + Karten-Grund),
  sonst sind alle Farben leer/grau (R19b/c live erwischt).
- **Keine Suche.** Bereiche als einklappbare Gruppen (UCollapsible): nur der
  aktive Bereich offen; Zeilen `px-2.5 py-1.5 gap-1.5`, Kinder `ms-5` an
  1px-Führungslinie, Spalten-Pad `--bw-rail-pad-x: 1rem / -y: 0.75rem`.
- Status-Glyphen VORN (Haken accent / Halbmond ink / Kreis muted / Schloss;
  Ergebnis = Sparkle, gesperrt bis Bereich fertig). Info-Icon HINTEN, erst
  bei Hover/Fokus sichtbar, öffnet den bestehenden Erklär-Layer.
- **Feste Breite 300px** (`railWidth`), Naht zur Bühne = border-e der Rail
  (kein Splitter dort). Sidebar einklappbar über den Balken-Toggle
  (`railCollapsed`). Kein Rail-Fuß (`railFooter=false`).
- **Kein Layout-Sprung beim Laden:** BwWorkspace hat den Pre-Mount-Zweig
  (R30/30b) — die echte Seite bekommt ihn geschenkt, solange sie `railWidth`
  setzt. Nichts eigenes bauen.

### Topbar: WEG (R20)
`topbar=false`, `localeInTopbar=false`. Der Sync-Zustand (Speichert…/
Offline/Konflikt, P1c-Vertrag!) zieht in die Sidebar (unter die Gruppen,
nur Abweichungen) — wie im Dummy.

### Balken über der Bühne (R10, R20b/e, R29b, R32-34)
- NUR über der Gesprächs-Spalte (endet an der Naht zum Stand).
- UDashboardNavbar-Maße: Höhe 4rem, `px-6`, `gap-1.5`, `border-b` 1px;
  Grund = Papier-Grau der Gesprächs-Fläche (`--bw-paper`).
- Inhalt: links Nav-Toggle (i-ph-sidebar-simple, sm ghost), dann zweizeilig
  BEREICH in Versalien (bw-label uppercase tracking-wider) über dem
  Kapitel-Titel (font-semibold, truncate); rechts der Stand-Toggle
  (gespiegeltes Icon, `-scale-x-100`, schaltet `georgeCollapsed`).

### Bühne: das Gespräch (R1-R9, R20, R23, R37)
- Kein Kopf, kein Papier-Schatten. Georges **Avatar ist klickbar** und
  öffnet den George-Info-Layer (George Winter · Markenberater + Team im
  Rücken) — es gibt KEINE George-Zeile im Stand mehr.
- Antwort-Module IM Zug (Frage immer ÜBER den Aktionen):
  - `answer`: nur „Beispiel ansehen"-Link direkt unter der Frage;
    aufgeklappt übernimmt Klick ODER Tab das Beispiel ins leere Feld.
  - `draft` (Entwurfs-Moment): Basis-Zeile, gestrichelter Entwurfs-Rahmen
    (verschwindet mit Bestätigung), Aktionen: „Nochmal, mit Hinweis"
    (Hinweis-Feld) / „Korrigieren" / „Übernehmen & bestätigen".
  - `options`: Claude-Desktop-Stil — volle Zeilen mit Titel + Begründung,
    Empfehlung markiert UND begründet, „Sonstiges" mit eigenem Feld,
    Aktion unten rechts: NUR „Übermitteln" (R39: kein Überspringen —
    eine Kernentscheidung lässt sich nicht überspringen).
  - `confirm`: Karte trägt als Kopf die **URSPRUNGSFRAGE** des Inhalts
    (`sourceQuestion`), nicht die Abschluss-Frage; Abschluss-Frage steht
    über den Knöpfen. Aktionen rechtsbündig: „Korrigieren"
    (`bw-confirm--ghost`, EXAKT die Bestätigen-Metrik) + „Bestätigen"
    (bw-confirm, bernstein → grün „Bestätigt").
  - `gate` (Konfidenz): erscheint erst, wenn `brandStepCompletion` erfüllt
    ist (geteilte Regel, nicht „letzte Frage beantwortet").
- „Noch offen: n von N …"-Hinweis: eingerückt auf die Text-Flucht
  (Avatar 2rem + Lücke 0.65rem).

### Prompt fest unten (R23, R24, R29, R29c)
- `UChatPrompt` + `UChatPromptSubmit` im `stage-footer`-Slot (46rem-Flucht).
- Nur Feld + Pfeil-nach-oben. KEIN Anhang, KEIN Modell-Wähler, KEIN
  „Weiß ich nicht"-Knopf (tippbar, gleicher Antwort-Weg — Georges
  Ehrlichkeits-Umgang übernimmt).
- Fokus-Overrides Pflicht: `has-[textarea:focus-visible]:outline-none` +
  `…:ring-default` (Textareas gelten im Browser immer als focus-visible).
- Bedient den jüngsten offenen answer-Zug; sonst disabled (draft/options/
  confirm antworten in ihren Modulen). Im echten Produkt läuft die Eingabe
  über die converse-Route (B5b); Enter sendet, Shift+Enter Umbruch.

### Rechte Spalte: der Stand als chronologischer Log (R11-R13, R25-R28, R31, R35-R36)
- KEIN eigener Kopf. Die Spalte ist eine Zeitleiste der Kapitel:
  je Kapitel eine Sektions-Zeile (Status-Icon vorn, Titel, „n/N bestätigt"
  bzw. „n/n" als SUBLINE darunter, hinten nur der Klapp-Pfeil), zwischen
  Sektionen IMMER eine 1px-Linie. Abgeschlossene Kapitel eingeklappt oben,
  das laufende offen darunter; Kapitel-Titel deutsch bei DE-UI („Kontext").
- Karten im Info-Layer-Muster: Ampel-Dot + fette Headline,
  Beschreibungs-Subline (dieselben Texte wie der Erklär-Layer), darunter die
  Antwort. ALLE Entscheidungen ausgeschrieben — kein „Und N weitere".
- „Korrigieren" erscheint erst bei Hover/Fokus (Karte); „Bestätigen" ist bei
  offenen Einträgen IMMER sichtbar (`bw-confirm--xs`, gleiche Größe wie
  Korrigieren). Bestätigt = server-erzwungener Zustand (Feinschliff-Paket,
  unverändert): Korrigieren ist der einzige Rückweg.
- Fuß der Spalte: NUR der Gesamtfortschritt, dreizeilig („Gesamtfortschritt"
  + Prozent / Balken / „n/N" + Restzeit), 1px-Linie darüber.

### „Euer Branding" (R35)
- NICHT mehr in der Werkstatt. Der Einstieg wohnt an der **Kachel der
  Brandings-Übersicht** (`BwBrandCard` `resultTo`/`resultReady`):
  ausgegraut mit Schloss + „Ab Foundation-Abschluss", aktiv (Score vorn im
  `BwRailFooter`-Kartenmuster, Sparkle nur Fallback) sobald die Brand
  Foundation abgeschlossen ist. BEWUSST kein 100%-Gate (Monitoring endet
  nie). Die echte Übersichtsseite speist `resultReady` aus echten Daten.

## 3. Eine-Stimme in den Prompts (Lauf 2)

- `advisorForStep` liefert künftig die TECHNIK (Fragelogik, teach-Bausteine),
  nicht den Sprecher: Persona-Layer überall George (georgePrompt-Regeln:
  BASIS:/DRAFT:/ASK:/QUESTION:-Marker, Ehrlichkeits-Fallback, B2-Rahmung).
  Vera-/Milo-Inhalte (Provokationsfragen, Werte-aus-Geschichten) bleiben
  wörtlich erhalten — nur die Stimme wechselt.
- UI zeigt durchgehend „Gespräch mit George · Markenberater"; George
  erwähnt die Kolleg:innen in Phasen-Intros (Formulierungs-Vorbild: der
  Dummy-Eröffnungszug).
- `/team`-i18n `crewTitle`/`crewIntro` („Jede Phase hat ihren eigenen
  Interviewer") auf die Eine-Stimme-Erzählung umschreiben (de+en) — offener
  Punkt aus dem Team-Paket.
- Tests nachziehen (advisorPrompts, brandAdvisors-Wächter bleiben; der
  Hunde-Vokabular-Test bleibt unangetastet).

## 4. Nicht anfassen / bekannte Fallen

- Confirm-Server-Zustand, Drosseln, Readiness-Gate, ZDR-Routing, Quotas:
  **unverändert** — das ist gebauter Feinschliff, der Umbau ist UI + Fluss.
- Teleportierte Layer (Menüs, Modals): immer `bw-root` (+ `bw-overlay` für
  Karten-Grund) an den Content.
- Scoped-CSS greift in teleportierten Slots nicht verlässlich → inline/
  globale Klassen (R19b).
- i18n: keine spitzen Klammern in Messages; neue Config-Schlüssel in die
  FIELDS-Tabelle von check-i18n-keys.
- `@tiptap/extension-mention` bleibt exakt gepinnt; keine Katalog-Bumps in
  diesem Umbau.
- Worktree-Beweise: Dev-Server via `pnpm --filter <app> exec nuxi dev
  --port N`, Ports vorher prüfen (CLAUDE.md Tests-Abschnitt).

## 5. Zuschnitt in zwei Opus-Läufe

**Lauf 1 — Layout (rein UI, kein Prompt-Text):** Werkstatt-Seite auf das
Dummy-Layout; GdSidebar in den Layer heben (mit echten Journey-Daten);
Stand-Spalte als Log; Prompt unten; Balken; Brandings-Übersicht
resultTo/resultReady aus echten Daten. Beweis: Playground-Werkstatt gegen
lokale Appwrite, Screenshot-Abgleich mit dem Dummy, brand-Tests + Typecheck
+ i18n-Keys grün.

**Lauf 2 — Eine Stimme + Language→Foundation:** Prompts/Registry/Journey-
Reihenfolge, /team-Texte, Tests. Beweis: advisor-Tests grün, ein
verify-Skript-Durchlauf der Generate/Converse-Kette (bezahlt KI, nur nach
Rücksprache), Werkstatt zeigt durchgehend George.

Beide Läufe committen selbst, pushen nie; nach jedem Lauf Fable-Verifikation,
dann Push + 4 Checks + Deploy-Beweis (Live-Build-SHA).
