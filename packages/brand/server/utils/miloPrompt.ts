/**
 * DIE AUFTRÄGE AUS MILOS TECHNIK (P3.1) — Baustein C · Werte, Content-Spec §6.
 *
 * ── GESPROCHEN WERDEN SIE VON GEORGE (Davids Entscheidung 2026-09-02) ─────
 * Milo ist seit der Eine-Stimme-Entscheidung kein Sprecher mehr, sondern die
 * TECHNIK dieses Kapitels: Werte aus Geschichten, Moment-Beleg-Pflicht, kein
 * Adjektiv ohne Beispiel. Am Inhalt dieser Datei hat das kein Wort geändert.
 *
 * ── DIE EINE TECHNIK, UM DIE ES HIER GEHT ─────────────────────────────────
 * §6 ersetzt die statische Wortliste des Original-Formulars (03 §6, sieben
 * Kategorien zum Ankreuzen) ausdrücklich durch Kandidaten, die AUS DEN
 * ANTWORTEN entstehen. Das ist auch Milos Steckbrief in `brandAdvisors.ts`:
 * „You find values inside stories … you distil the word from the story, never
 * the other way round", und seine Verbotsliste sagt es negativ — „never accept
 * an adjective as a value without an example behind it".
 *
 * Der Auftrag hier setzt das in eine prüfbare FORM um: jeder Kandidat trägt
 * seinen Beleg in derselben Zeile. Ein Wert ohne Beleg ist keine Erkenntnis,
 * sondern ein Wort — und ein Mensch, der „Qualität · Zuverlässigkeit ·
 * Leidenschaft" vorgesetzt bekommt, kann nicht einmal sagen, warum es falsch
 * ist. Mit Beleg kann er widersprechen, und genau darum geht es.
 *
 * ── WARUM DER BELEG IN DIE ZEILE GEHÖRT UND NICHT IN DIE SPRECHBLASE ──────
 * Der nächste Slot (`c.final`) lässt den Menschen auf drei bis fünf eingrenzen
 * — er trifft die Auswahl also an der LISTE, nicht am Chat-Verlauf. Stünde die
 * Herkunft nur in Georges Zug, wäre sie beim Auswählen weg, und die Entscheidung
 * fiele wieder nach Klang. Deshalb ist die Form „Wert — Beleg" Teil des
 * Feldwerts, innerhalb der Listen-Form aus `brandSlotFormat.ts`.
 *
 * ── SEIT BW2 STEHT DIE AUFGABE NICHT MEHR HIER ────────────────────────────
 * Sie ist Inhalt der Session (`shared/sessionContent.ts`) und wird von EINEM
 * Bauer gesetzt (`server/utils/sessionPrompt.ts`). Am WORTLAUT hat der Umzug
 * nichts geändert (Fixture-Beweis), also steigt `MILO_PROMPT_VERSION` nicht.
 * Was hier bleibt, ist die Begründung dieses Kapitels — sie erklärt die
 * Regeltexte, die jetzt nebenan stehen.
 */

/**
 * Fassung dieser Aufträge. Steigt, sobald sich eine Aufgabe inhaltlich ändert —
 * oder der System-Prompt, mit dem sie gesendet werden.
 *
 * `milo-c-5` (2026-09-09, Davids Team-Entscheidung): die Aufgaben sind
 * unverändert, das FUNDAMENT nicht (`george-a-14`, Solo-Weiche für
 * Markentexte). `c.definitions` schreibt Werte-Definitionen als VERHALTEN in
 * der ersten Person — für eine Marke, die eine Person allein führt, heisst das
 * ab hier „ich" und nicht mehr „wir".
 *
 * `milo-c-4` (2026-09-04, BW2 Paket 2b — Gegenlese-Runde): neue Beispielwelt
 * (Ernährungscoaching statt Hundeschule), und `c.definitions` trägt eine
 * INVARIANTE — jeder gewählte Wert muss in der Liste vorkommen, geprüft im
 * Code statt im Modell.
 *
 * `milo-c-3` (2026-09-04, BW2 Paket 2 — Session-Inhalte): Kandidaten und
 * Definitionen tragen jetzt Qualitätsmerkmale, Anti-Muster und ein Formvorbild
 * aus einer fremden Branche (dieselbe Hundeschule durch das ganze Kapitel, so
 * dass man Moment, Wert und Definition aneinander sieht). Die Moment-Beleg-
 * Pflicht ist wörtlich geblieben.
 *
 * `milo-c-2` (2026-09-02): Aufgaben unverändert, System-Prompt auf
 * `george-a-5` · Eine Stimme.
 */
export const MILO_PROMPT_VERSION = 'milo-c-5'

/**
 * WIE VIELE WERTE-KANDIDATEN — die Zahl, auf die §6/03 §7 danach auf 3–5
 * eingrenzt.
 *
 * Sie LIEGT seit BW2 in `shared/sessionContent.ts`, weil die Verarbeitungsregel
 * sie im Satz führt („distil 5 to 7 candidate VALUES") und `shared/` nicht aus
 * `server/utils/` lesen kann. Hier bleibt der NAME, unter dem ihn die Beweise
 * kennen — zwei Zahlen für dieselbe Spanne wären zwei Auffassungen davon, was
 * noch eine Auswahl ist.
 */
export { MILO_CANDIDATE_RANGE } from '../../shared/sessionContent'
