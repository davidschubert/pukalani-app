# Sitzungs-Hygiene — Kontext, Nutzungslimit und Werkzeuge einer Agenten-Session

Wie wir Claude-Code-Sessions führen, damit **dasselbe Ergebnis weniger Nutzung
kostet** (Davids Auftrag 2026-09-08). Grundlage sind zwei Quellen: die
gemessene 655k-Session vom 2026-09-08 (Messages 84 %, CLAUDE.md+MEMORY.md
53k je Runde, 445 MCP-Werkzeuge) und das Video „How To Never Run Out Of
Codex and Claude Usage Limits" (AI LABS, 2026-08-28, 24 Tipps in drei
Stufen), das am 2026-09-09 gegen unseren Stand geprüft wurde. Jeder Tipp
steht unten mit dem Befund: **übernommen**, **schon gebaut**, **bewusst
nicht** oder **Davids Entscheidung**. Die Einstellungsnamen sind gegen die
Claude-Code-Doku (settings-reference, env-vars, costs, hooks) verifiziert.

Dieses Dokument ergänzt [WORKFLOW.md](WORKFLOW.md) (Abschnitt
„Sitzungsführung je Phase") und die Memory-Notiz `session-token-hygiene`.

## Wie die Kosten entstehen (in fünf Sätzen)

1. Ein Modell erinnert sich an nichts: **jede Runde sendet die ganze
   Konversation neu** — Systemprompt, CLAUDE.md, geladene Regeln, Werkzeug-
   Namen, alle bisherigen Nachrichten und Tool-Ausgaben. Eine Nachricht spät
   in der Session kostet deshalb ein Vielfaches derselben Nachricht am Anfang.
2. Ein **Prompt-Cache** hält diesen Präfix vor; Lesen daraus kostet rund ein
   Zehntel. Im Abo lebt der Cache **eine Stunde** ab der letzten Aktivität
   (mit Zusatzguthaben und per API-Key fünf Minuten). Nach einer längeren
   Pause zahlt die erste Nachricht den vollen Kontext.
3. Das **Nutzungslimit** ist etwas anderes als das Kontextfenster: ein Budget
   je 5-Stunden-Fenster plus ein Wochenbudget, **geteilt über alle Modelle**
   — ein Modellwechsel gibt nichts zurück.
4. **Compaction ist nicht gratis**: sie liest die ganze Konversation, das
   Ergebnis ist ein Auszug, und aus dem Limit kommt nichts zurück.
5. Was **standardmäßig an** ist, kostet still mit: Recap-Zusammenfassungen,
   gebündelte Skills, Workflows, Advisor, ungenutzte MCP-Server.

## Die Tipps aus dem Video und unser Stand

| # | Tipp (Video) | Unser Stand | Befund |
| --- | --- | --- | --- |
| 1 | `/clear` vor jeder Aufgabe, die nichts mit der letzten zu tun hat | Session pro Paket, neues Vorhaben = neue Session über die Karte ([WORKFLOW.md](WORKFLOW.md)) | schon gebaut; ergänzt: vorher `/rename`, damit `/resume` sie wiederfindet |
| 2 | `/compact` meiden; wenn nötig **vor** der Pause, nicht danach, und mit Fokus-Anweisung | Regel gab es nur als Memory-Zeile | **übernommen**: Compact-Anweisung steht jetzt in CLAUDE.md, Zeitpunkt-Regel unten |
| 3 | `/rewind` (Doppel-Esc) statt Korrektur-Nachricht: der Fehler bleibt sonst in jeder folgenden Runde im Kontext | nicht geregelt | **übernommen** (David und Agent, s. Regeln 3/4) |
| 4 | EIN langer Prompt statt vieler kleiner — der Agent plant dann als Ganzes, und jede Tool-Runde trägt weniger Kontext | Opus-Aufträge sind bereits vollständig und selbständig | **übernommen** für die Prototyp-Iteration: Korrekturen sammeln, als Liste senden |
| 5 | Session-Recap abschalten, `/recap` bei Bedarf selbst | Recap läuft (Standard) | **Davids Entscheidung** (`awaySummaryEnabled: false`) |
| 6 | Modell nach Schwere: Opus nur für das Schwere, Sonnet fürs Tägliche, Haiku für Kleines | Fable prüft und entscheidet, Opus baut, Haiku (audit-scout) und Explore erkunden | schon gebaut |
| 7 | Effort-Stufe: Standard mittel, hoch nur je Aufgabe (`/effort`, „ultrathink") | nur als Memory-Zeile | **übernommen** als Regel; Standardwert `effortLevel` ist Davids Entscheidung. Fable denkt immer (nicht abschaltbar) |
| 8 | Sub-Agenten auf anderen Modellen; ein „Model-Router"-Skill auf jedem Prompt | Routing nach ROLLE (Prüfen/Bauen/Erkunden), nicht je Prompt | **bewusst nicht**: ein Skill, der auf jedem Prompt läuft, kostet selbst — die Rollenregel ist billiger und vorhersagbar |
| 9 | Skill-Datei unter 200 Zeilen; Tiefe in Referenzdateien daneben (nur Name + Beschreibung sind dauerhaft im Kontext) | `.claude/rules/*.md` laden per `paths:` nur beim Lesen passender Dateien; größte Datei tenant-isolation 13 KB | schon gebaut; Regel unten: neue Regel-Datei ≤ 200 Zeilen, Geschichte nach docs/referenz |
| 10 | Spezielles in Skills, nicht in CLAUDE.md | dasselbe Prinzip mit `.claude/rules` seit 2026-09-08 | schon gebaut |
| 11 | CLAUDE.md unter 200 Zeilen, nur was das Modell nicht ohnehin weiß | CLAUDE.md hat **352 Zeilen / 24 KB** (Kern nach Option A) | **Davids Entscheidung**: zweite Kürzungsrunde (Begründungs-Geschichten → docs/referenz, Regel + ein Satz Warum bleibt) |
| 12 | CLAUDE.md nicht vom Agenten schreiben lassen (füllt sie mit Bekanntem) | Regel „Regel + ein Satz Warum + Verweis" (Memory) | schon gebaut; ergänzt: kein „wie startet man die App" in CLAUDE.md |
| 13 | Je Ordner eine CLAUDE.md, die nur beim Öffnen lädt | `paths:`-Frontmatter der rules leistet dasselbe, ohne 30 Dateien im Baum | schon gebaut (andere Mechanik, gleiche Wirkung) |
| 14 | `/usage` lesen: was frisst das Fenster (Skills, MCP, Verhalten) | nicht geregelt | **übernommen**: `/context` einmal je Session, `/usage` je Woche (Regel 8) |
| 15 | CLI statt MCP: MCP-Werkzeuge liegen dauerhaft im Kontext, ein CLI nur, wenn es läuft | `gh` ist Regel, GitHub-MCP liegt trotzdem daneben; Appwrite-API-MCP (verbindet hier nicht einmal), ploi-MCP (Projekt), Nuxt/Nuxt-UI-Docs, Playwright, Figma, Trello, Gmail, Kalender, Drive, Obsidian | **Davids Entscheidung**: siehe Vorschlag unten |
| 16 | Ein Skill sagt dem Agenten, dass das CLI existiert | CLAUDE.md/rules nennen `gh`, `pnpm migrate`, `scripts/ops/*` | schon gebaut |
| 17 | Memory abschalten (lädt in jede Nachricht) | MEMORY.md ist Davids Übergabe-Mechanik zwischen Sessions (12,5 KB Index) | **bewusst nicht**; stattdessen Regel 9: Index kurz halten, `/consolidate-memory` je Monat |
| 18 | `disableBundledSkills: true`, wenn die eingebauten Skills ungenutzt sind | `/code-review`, `/simplify`, `/security-review`, `/loop` sind eingebaut; Nutzung unklar | **Davids Entscheidung** |
| 19 | Workflows abschalten oder klein halten | Workflows laufen nur auf ausdrückliche Bitte („ultracode"); Richtwert mittel (≤ 15 Agenten) | schon so; keine Änderung |
| 20 | Hook, der aus Test-Ausgaben nur die Fehlschläge durchlässt | **Gemessen**: Vitest 4 druckt ohne TTY bei Grün nur die Zusammenfassung (themes: 161 Tests = 498 Bytes). Playwright-`list` druckt je Test eine Zeile | **bewusst nicht** (kein Gewinn bei Vitest); Playwright aus dem Agenten mit `--reporter=dot` (Regel 7) |
| 21 | Terminal-Ausgabe deckeln: 30 000 → 10 000 Zeichen | Standard 30 000 | **übernommen**: `bashOutputMaxChars: 10000` in `.claude/settings.json` — gilt nur für ERFOLGREICHE Kommandos, Fehlschläge kommen weiter voll |
| 22 | Advisor aus (sendet bei jedem Aufruf den ganzen Verlauf an das stärkere Modell, ohne Cache), eigenen Advisor-Agenten bauen | nicht aktiv; unsere Arbeitsteilung IST der Advisor (Fable prüft, Opus baut) | schon so; nicht einschalten |
| 23 | Sessions reden miteinander: nur den relevanten Teil schicken | `spawn_task`/Karte mit selbständigem Auftrag | schon gebaut; Regel: Übergabe = Lesereihenfolge + Fundstellen, nie der Verlauf |
| 24 | Wissen, wie 5-Stunden-Fenster und Cache ticken | — | oben in fünf Sätzen |

## Regeln, die ab 2026-09-09 gelten

1. **Session = Paket.** Nach Commit + Merge + Push endet die Session; das
   nächste Vorhaben startet über die Karte in einer neuen. Vor `/clear`
   oder dem Ende `/rename`, damit `/resume` den Faden wiederfindet.
2. **Compaction ist die Ausnahme, nicht der Rhythmus.** Wenn sie nötig ist:
   VOR einer Pause (der Cache lebt eine Stunde), nie danach, und immer mit
   Fokus (`/compact focus: offene Beweise, geänderte Dateien, Entscheidungen`).
   Die Standard-Fokusanweisung steht in CLAUDE.md unter „Compact instructions".
3. **Korrektur durch Zurückspulen (David).** Ist ein Ergebnis falsch: nicht
   „nein, so nicht" nachschicken, sondern `/rewind` (Doppel-Esc) und den
   korrigierten Auftrag stellen. Die Korrekturnachricht trüge den Fehler sonst
   in jede folgende Runde.
4. **Korrektur durch Neu-Spawnen (Agent).** Liefert ein Sub-Agent das Falsche,
   wird er nicht per Nachricht nachgesteuert, sondern mit korrigiertem,
   vollständigem Auftrag neu gestartet — frischer Kontext ist billiger als ein
   Verlauf mit Fehler und Korrektur.
5. **Korrekturen sammeln.** In der Prototyp-Iteration (WORKFLOW Phase 3)
   gehen Befunde als EINE nummerierte Liste in EINEN Prompt, nicht Stück für
   Stück. Der Agent plant sie zusammen und jede Tool-Runde trägt weniger mit.
6. **Effort nach Aufgabe.** Routine (Doku, Umbenennen, Lint-Fixes) auf
   `/effort medium`; hoch nur für die eine Aufgabe, die es braucht, danach
   zurück. Modell nach ROLLE: Fable prüft/entscheidet, Opus baut, Haiku/
   Explore erkunden (Explore lädt CLAUDE.md nicht, jeder andere Sub-Agent
   schon).
7. **Ausgaben klein halten.** Testläufe mit großer Ausgabe in einen
   Sub-Agenten, nur die Bilanz zurück; Playwright aus dem Agenten mit
   `--reporter=dot`; Dateien in Ausschnitten (`sed -n`, grep), Bash mit
   `head`/`tail`; Screenshots nur als Endbeweis, sonst `read_page`. Der Deckel
   `bashOutputMaxChars: 10000` fängt den Rest bei erfolgreichen Kommandos.
8. **Messen statt vermuten.** Einmal je Session `/context` (was liegt im
   Fenster), einmal je Woche `/usage` (Anteile von Skills, MCP-Servern,
   Verhalten). Ein Posten über 10 % wird ein Eintrag in COMPLETE „Gelernt"
   oder eine Regel hier.
9. **Regel-Dateien und Memory bleiben kurz.** Neue Domänen-Regel in ihre
   `.claude/rules`-Datei, höchstens 200 Zeilen je Datei, die Geschichte in
   docs/referenz. MEMORY.md ist ein Index (eine Zeile je Notiz, kein Inhalt);
   `/consolidate-memory` einmal im Monat.
10. **Nichts Stilles einschalten.** Kein Advisor, keine Workflows ohne
    ausdrückliche Bitte, keine Loops/Cron ohne Zweck (jeder Tick sendet den
    ganzen Kontext), keine MCP-Server ohne Repo-Bezug.

## Vorschlag zu MCP gegen CLI (Davids Entscheidung)

MCP-Werkzeuge werden zwar verzögert geladen (nur Name und Server-Hinweis
liegen im Kontext), aber 300+ Namen kosten je Runde, und ein Server, den
niemand aufruft, kostet ohne Gegenwert. Empfehlung je Server:

| Server | Empfehlung | Warum |
| --- | --- | --- |
| GitHub-MCP | aus | `gh` ist seit jeher die Regel (PRs, Issues, API); doppelter Weg |
| Appwrite-API-MCP | **an, nur lokal und nur lesend** (Davids Entscheidung 2026-11-06) | zeigt den IST-Zustand (Spalten, Indizes, Rechte, Daten) beim Debuggen; seit dem Server-Stand vom 2026-10-27 nur fünf Meta-Werkzeuge im Kontext. Plugin-Optionen `http://localhost/v1` + `reddit-comments` (Pool), Schlüssel `claude-mcp-readonly` mit ausschließlich `*.read`-Scopes (ohne `keys`/`oauth2`/`providers`). NIE gegen Prod: die Sessions laufen ohne Rückfrage, die „destruktiv"-Annotation schützt dort nicht. Schema-Änderungen bleiben bei `pnpm migrate` und `scripts/ops/*` (node-appwrite) |
| Appwrite-Docs, Nuxt-Docs, Nuxt-UI-Docs | an lassen | Nachschlagen ohne Kontextlast des Repos; nur bei Bedarf aufgerufen. Der Appwrite-Docs-Server `mcp-for-docs.appwrite.io` ist abgekündigt; sein Nachfolger `mcp.appwrite.io` meldet sich bei Appwrite Cloud an (für self-hosted nur als Doku-Suche brauchbar) |
| ploi | an lassen | Deploy-Log und Site-Env ohne Browser; kein CLI-Ersatz vorhanden |
| Playwright-Plugin | aus, wenn der eingebaute Browser reicht | zweiter Browser-Werkzeugsatz neben Claude_Browser und Claude-in-Chrome |
| Figma, Trello, Gmail, Kalender, Drive, Obsidian | aus für dieses Projekt | kein Repo-Bezug; Obsidian nur, wenn Notizen bewusst gebraucht werden |

Umsetzung ist ein Klick je Connector in der Desktop-App bzw. `/mcp` im
Terminal; im Repo ändert sich nichts.

## Bewusst nicht übernommen

- **Memory aus** — die Memory ist unsere Übergabe zwischen Sessions und
  ersetzt lange Verläufe (billiger, nicht teurer). Der Index bleibt kurz.
- **Model-Router-Skill auf jedem Prompt** — Rollen-Routing leistet dasselbe
  ohne Laufzeitkosten.
- **Test-Filter-Hook** — gemessen ohne Gewinn bei Vitest 4 (nur Zusammen-
  fassung bei Grün). Kommt wieder auf den Tisch, wenn `/usage` Test-Ausgaben
  als Posten zeigt.
- **Eigener Advisor-Agent** — die Arbeitsteilung Fable/Opus ist bereits
  dieser Mechanismus, nur mit Regie statt Automatik.

## Gemessen am 2026-09-09

| Was | Wert |
| --- | --- |
| CLAUDE.md | 352 Zeilen, 24,5 KB (Video-Ziel: unter 200 Zeilen) |
| `.claude/rules/*.md` gesamt | 9 Dateien, 69,8 KB, lädt nur pfadbezogen |
| MEMORY.md-Index | 12,5 KB |
| Vitest-Ausgabe bei Grün (themes, 161 Tests) | 13 Zeilen, 498 Bytes |
| Deferred-Werkzeuge in dieser Session | über 300 Namen (Connectoren ohne Repo-Bezug enthalten) |

**Gelernt beim Beschaffen des Transkripts:** YouTube liefert Untertitel
ohne Proof-of-Origin-Token nicht mehr (leere 200-Antwort per curl, 429 per
yt-dlp, „Precondition check failed" am Transkript-Endpunkt — auch im
eingebauten Browser). Weg, der funktioniert: im echten Chrome den Player
Untertitel laden lassen und die dabei entstandene `timedtext`-URL aus
`performance.getEntriesByType('resource')` mit `fmt=json3` erneut abrufen —
innerhalb der Seite, denn die URL trägt das Token.
