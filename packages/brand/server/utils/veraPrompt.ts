/**
 * DIE AUFTRÄGE AUS VERAS TECHNIK (P3.1) — Baustein B (Purpose · Vision ·
 * Mission + Positionierung) und B2 (Markenarchitektur), Content-Spec §5/§5a.
 *
 * ── GESPROCHEN WERDEN SIE VON GEORGE (Davids Entscheidung 2026-09-02) ─────
 * Seit der Eine-Stimme-Entscheidung ist Vera keine Sprecherin mehr, sondern die
 * TECHNIK dieser beiden Kapitel: ihre Wettbewerbs-Schärfe, ihre
 * Provokationsfragen, ihr Prüfstein. Am Inhalt dieser Datei hat das kein Wort
 * geändert — nur die Facetten-Schicht des System-Prompts (`georgePrompt.ts`)
 * sagt jetzt „so arbeitest du hier" statt „so heisst du hier".
 *
 * ── SEIT BW2 STEHEN DIE AUFGABEN NICHT MEHR HIER ──────────────────────────
 * Sie sind Inhalt der Session (`shared/sessionContent.ts`) und werden von EINEM
 * Bauer gesetzt (`server/utils/sessionPrompt.ts`) — vier Tabellen für vier
 * Bausteine waren vier Stellen, an denen ein Rahmen fehlen kann, und ein Slot,
 * der in der falschen Tabelle nachschlug, warf. Am WORTLAUT hat der Umzug
 * nichts geändert (Fixture-Beweis), also steigt `VERA_PROMPT_VERSION` nicht.
 *
 * Was hier bleibt, ist die Begründung dieser beiden Kapitel — sie erklärt die
 * Regeltexte, die jetzt nebenan stehen, und gehört zu Vera, nicht zur Tabelle.
 *
 * ── WARUM DIE PRIMÄRE QUELLE EINE ANDERE IST ──────────────────────────────
 * Baustein A schöpft aus der STARTKARTE (seine Slots haben keine
 * `dependencies`). Ab Baustein B liegen ANTWORTEN vor — fünf beantwortete
 * Provokationsfragen für den Purpose, drei für die Vision. Ein Purpose, der aus
 * vier Startkarten-Zeilen gebaut wird, wäre genau die Behauptung, die Regel 4
 * verbietet, und Veras Prüfstein („könnte das jeder Wettbewerber sagen?")
 * fiele automatisch durch. Der Bauer rechnet das mechanisch aus
 * `inputs.slots` — kein Baustein muss es mehr wissen.
 *
 * ── DIE FORMELN SIND GERÜSTE, KEINE SCHABLONEN ────────────────────────────
 * §5 verlangt „drei Statements nach den 02-Templates" und der Lehrblock
 * teach.pvm sagt, was die drei unterscheidet: Purpose = WARUM, Vision = WOHIN,
 * Mission = WIE. Die Formel steht deshalb in jedem Auftrag WÖRTLICH, mit einem
 * ausdrücklichen Zusatz: sie ist ein Gerüst, kein Lückentext. Ein Modell, das
 * die Formel abschreibt, liefert „Wir existieren, um X für Y zu tun" — ein
 * Satz, dessen Bauplan man ihm ansieht, und den kein Mensch je vorlesen würde.
 *
 * ── VERAS PRÜFSTEIN STEHT IN JEDEM PVM-AUFTRAG ────────────────────────────
 * „Could any competitor in this industry say exactly this?" ist ihre
 * Interview-Technik (`brandAdvisors.ts`) und zugleich die Qualitätsschwelle
 * von §5. Sie steht in der Facetten-Schicht des System-Prompts — und ZUSÄTZLICH
 * hier, als Prüfung am fertigen Satz. Die Schicht sagt, wie GEFRAGT wird; das
 * hier sagt, was ABGEGEBEN wird.
 */

/**
 * Fassung dieser Aufträge. Steigt, sobald sich eine Aufgabe inhaltlich ändert —
 * oder der System-Prompt, mit dem sie gesendet werden.
 *
 * `vera-b-5` (2026-09-09, Davids Team-Entscheidung): die Aufgaben sind
 * unverändert, das FUNDAMENT nicht (`george-a-14`, Solo-Weiche für
 * Markentexte). `b.purpose`, `b.mission` und `b2.rule` schreiben ihre Werte in
 * der ersten Person — ein Eintrag aus `vera-b-4` entstand nachweislich ohne
 * die Regel, die dort jetzt „ich" statt „wir" verlangt, wenn eine Person
 * allein die Marke führt.
 *
 * `vera-b-4` (2026-09-04, BW2 Paket 2b — Gegenlese-Runde): neue Beispielwelt
 * (Yoga-Studio in B, Software-Haus in B2), `b2.model` schreibt die Form des
 * Werts jetzt ausdrücklich („ohne Person"), und die Namen in den
 * B2-Beispielen stehen in beiden Sprachen gleich — ein Markenname wechselt
 * nicht mit der Oberflächensprache. Prüfstein und Formeln bleiben wörtlich.
 *
 * `vera-b-3` (2026-09-04, BW2 Paket 2 — Session-Inhalte): die vier PVM- und
 * die zwei Architektur-Aufträge tragen jetzt Qualitätsmerkmale, Anti-Muster,
 * ein Formvorbild aus einer fremden Branche und die Form des Werts (Purpose
 * höchstens 25 Wörter, kein Markenname; Vision ohne Zahlen). Veras Prüfstein
 * und die Formeln sind wörtlich geblieben.
 *
 * `vera-b-2` (2026-09-02): die Aufgaben sind unverändert, der SYSTEM-Prompt
 * nicht (`george-a-5`, Eine Stimme). Ein Eintrag aus `vera-b-1` stammt aus
 * einem Lauf, in dem sich das Modell als Vera vorgestellt hat; beide für
 * vergleichbar zu erklären, wäre genau die Sorte stille Unwahrheit, gegen die
 * es diese Zahl gibt.
 */
export const VERA_PROMPT_VERSION = 'vera-b-5'

/**
 * VERAS PRÜFSTEIN, wörtlich — der Satz, der jeden PVM-Entwurf tragen muss.
 *
 * Er LIEGT seit BW2 in `shared/sessionContent.ts`, weil er dort gebraucht
 * wird: er steht wörtlich in drei Verarbeitungsregeln (Purpose, Vision,
 * Mission), und ein Regeltext, der in einer Datei steht und in einer anderen
 * gelesen wird, hat irgendwann zwei Fassungen. Hier bleibt der NAME, unter dem
 * ihn die Beweise kennen — eine Aufrufstelle zu brechen wäre für einen Umzug
 * ein zu hoher Preis.
 */
export { VERA_COMPETITOR_TEST } from '../../shared/sessionContent'
