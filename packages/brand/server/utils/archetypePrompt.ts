/**
 * DIE AUFTRÄGE DES BAUSTEINS D — Archetyp & Stimme, Content-Spec §7 + §12.
 * GESPROCHEN von George (Eine Stimme, 2026-09-02), die TECHNIK ist Milos
 * (`brandAdvisors.ts` gibt ihm `values` UND `archetype`).
 *
 * ── WARUM ES DIESE DATEI ÜBERHAUPT SCHON GIBT ─────────────────────────────
 * Baustein D war der einzige mit entwerfbaren Slots und ohne Generator:
 * `resolveBrandSlotGenerator('archetype')` fand nichts, „George, entwirf das"
 * endete mit `no_generator`, und der Hinweis „schreib es selbst" ist bei sieben
 * Slots mit `editor: 'none'` keine Alternative, sondern eine Sackgasse — es gibt
 * dort gar kein Feld zum Selberschreiben.
 *
 * ── INTERIM: DAS GESPRÄCH STATT DES PAARVERGLEICHS ────────────────────────
 * INTERIM bis zum Paarvergleich-Instrument (Spec §12.2) — Davids Entscheidung
 * 2026-09-04: George leitet die Archetyp-Kette im GESPRÄCH her statt sie zu
 * BERECHNEN; das Instrument ersetzt diesen Weg, die gespeicherten Werte
 * (stabile Ids aus `brandChoiceOptions.ts`) bleiben kompatibel.
 *
 * Zwei Folgen, die man diesen Aufträgen ansehen muss:
 *
 * 1. `d.pairs` IST LEER UND BLEIBT ES. Er ist laut Registry die Quelle von
 *    `d.primary`/`d.secondary` und steht deshalb als leeres Feld in den
 *    Eingaben. Ein Modell, das eine leere Quelle sieht, liest daraus gern eine
 *    AUSSAGE („sie haben keine Paare gewählt, also ist ihnen das egal").
 *    Deshalb sagen die beiden Aufträge WÖRTLICH, dass dieses Feld noch kein
 *    Instrument hat — die ehrliche Auskunft ist billiger als die Erfindung, die
 *    sonst an ihre Stelle tritt.
 *
 * 2. DIE WAHL GEHÖRT DEM MENSCHEN, NICHT DEM MODELL. Wo zwei Archetypen
 *    ernsthaft in Frage kommen, ist ein Entwurf keine Ableitung mehr, sondern
 *    ein Münzwurf mit Begründung — und im Brand-Dokument sieht man einem
 *    Münzwurf nichts an. Also: RÜCKFRAGE mit `OPTION:`-Zeilen (george-a-11,
 *    seit 2026-09-04), Empfehlung in der Prosa, ein Klick des Menschen. Das ist
 *    genau die Rolle, die der Paarvergleich später präziser ausfüllt.
 *
 * ── WAS AN QUELLEN WIRKLICH ANKOMMT ───────────────────────────────────────
 * Die Eingaben eines Laufs sind die transitive Hülle aus der Registry, nicht
 * die Wunschliste dieser Datei. Für `d.primary` heisst das: `d.pairs` (leer),
 * `d.hypothesis`, `a.pitch`, `a.toneAnalysis`, `a.customerPraise`. Die vier
 * STIMME-Antworten (`d.party`, `d.never`, `d.admired`, `d.emotion`) stehen in
 * der Registry NACH `d.primary` und können dort deshalb gar nicht als
 * Abhängigkeit stehen — die Rückwärts-Regel des Katalogs
 * (`validateSlotRegistry`) verbietet es, und sie umzustellen hiesse, die
 * Reihenfolge des Kapitels für ein Provisorium zu verbiegen.
 *
 * Sie erreichen George trotzdem: über das GESPRÄCH (a-9, der Verlauf des
 * Kapitels reist mit und hat laut Instruktions-Rumpf das Gewicht eines
 * Feldwerts). Die Aufträge nennen sie deshalb als „was sie im Gespräch gesagt
 * haben" und nicht als Feld — eine Aufgabe, die ein Feld verlangt, das nie
 * mitreist, erzeugt eine Rückfrage nach etwas, das schon beantwortet ist. Wenn
 * der Paarvergleich kommt, wandern `d.primary`/`d.secondary` in der Registry
 * ohnehin hinter die Stimme-Fragen, und dieser Absatz fällt mit.
 *
 * ── SEIT BW2 STEHEN DIE AUFGABEN NICHT MEHR HIER ──────────────────────────
 * Sie sind Inhalt der Session (`shared/sessionContent.ts`) und werden von EINEM
 * Bauer gesetzt (`server/utils/sessionPrompt.ts`); die Formalien —
 * Quellen-Ehrlichkeit, Leitplanken, Form des Feldwerts, Zug-Vertrag,
 * OPTION-Pflicht — kommen unverändert aus `brandSlotInstructionTail`. Am
 * WORTLAUT hat der Umzug nichts geändert (Fixture-Beweis), also steigt
 * `ARCHETYPE_PROMPT_VERSION` nicht. Was hier bleibt, ist die Begründung dieses
 * Bausteins — vor allem das Interim, das man den Regeltexten ansehen muss.
 */

/**
 * Fassung dieser Aufträge. Steigt, sobald sich eine Aufgabe inhaltlich ändert —
 * oder der System-Prompt, mit dem sie gesendet werden.
 *
 * `george-archetype-5` (2026-09-09, Davids Team-Entscheidung): die Aufgaben
 * sind unverändert, das FUNDAMENT nicht (`george-a-14`, Solo-Weiche für
 * Markentexte). Betroffen sind die Stimme-Ableitungen dieses Bausteins —
 * `d.voiceSamples` schreibt drei Sätze IN der Markenstimme —, nicht die beiden
 * Archetyp-Auswahlen: deren Wert-Form steht seit a-13 auf „ohne Person" und
 * bleibt davon unberührt.
 *
 * `george-archetype-4` (2026-09-04, BW2 Paket 2b — Gegenlese-Runde): neue
 * Beispielwelt (Designstudio und Fotostudio statt Schmiede und Reisebüro),
 * Form des Werts an allen vier Ableitungen gesetzt, und `d.secondary` prüft
 * jetzt im Code, dass der zweite Archetyp nicht der erste ist.
 *
 * `george-archetype-3` (2026-09-04, BW2 Paket 2 — Session-Inhalte): die vier
 * Ableitungen dieses Bausteins tragen jetzt Qualitätsmerkmale, Anti-Muster und
 * ein Formvorbild aus einer fremden Branche. Die drei Regeltexte (leeres
 * Paarvergleich-Feld, Zwei-Kandidaten-Regel, Kohärenz-Regel) sind wörtlich
 * geblieben.
 *
 * `george-archetype-2` (2026-09-04, noch am selben Tag): Kohärenz-Regel für
 * die beiden Choice-Slots — Prosa und Wert müssen denselben Katalog-Archetyp
 * nennen, informelle Gesprächs-Namen werden hörbar auf den Katalog abgebildet
 * (Live-Fund: Prosa „Handwerker", Feld `sage`).
 *
 * `george-archetype-1` (2026-09-04): erste Fassung, System-Prompt `george-a-11`.
 * Die Zahl trägt bewusst NICHT „interim" im Namen: sie soll sagen, WELCHE
 * Aufträge einen Eintrag erzeugt haben, und der Weg zum Wert ist Teil der
 * Aufgabe. Kommt der Paarvergleich, steigt sie auf `-2`, und ein alter Eintrag
 * bleibt lesbar als das, was er war.
 */
export const ARCHETYPE_PROMPT_VERSION = 'george-archetype-5'

/**
 * DIE DREI REGELTEXTE DIESES BAUSTEINS — das leere Paarvergleich-Feld, die
 * Zwei-Kandidaten-Regel und die Kohärenz-Regel.
 *
 * Sie LIEGEN seit BW2 in `shared/sessionContent.ts`: jede von ihnen steht
 * wörtlich in ZWEI Verarbeitungsregeln (`d.primary`, `d.secondary`), und ein
 * Regeltext, der in einer Datei steht und in einer anderen gelesen wird, hat
 * irgendwann zwei Fassungen. Hier bleiben die NAMEN, unter denen die Beweise
 * sie kennen.
 */
export {
  ARCHETYPE_COHERENCE_RULE,
  ARCHETYPE_PAIRS_PENDING,
  ARCHETYPE_TWO_CANDIDATES_RULE,
} from '../../shared/sessionContent'
