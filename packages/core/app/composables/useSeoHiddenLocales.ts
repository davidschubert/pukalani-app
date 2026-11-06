import type { MaybeRefOrGetter, Ref } from 'vue'

/**
 * WELCHE SPRACHEN DIESE SEITE NICHT HAT — der VERTRAG zwischen der Seite, die
 * es weiss, und dem Kopf, der es schreibt (BI1 I3, Plan §9.5).
 *
 * Wörtlich dieselbe Bauart wie `useBrandOgImage()` und aus demselben Grund:
 * `useLocaleSeoHead()` ist der EINZIGE Ort, an dem hreflang-Alternates
 * entstehen (CLAUDE.md) — eine Seite, die ihre eigenen setzte, hätte einen
 * zweiten Kopf neben dem einen. Was sie stattdessen tut: sie SAGT, welche
 * Sprachfassung es hier nicht gibt, und der Kern lässt genau die weg.
 *
 * Leer ist der Default: jede App und jede Seite ohne Eintrag bekommt
 * unverändert alle Alternates.
 *
 * ── ZWEI NAMEN, ZWEI SEITEN ──────────────────────────────────────────────
 * `useSeoHiddenLocales(quelle)` ist die SEITEN-Seite und das Einzige, was eine
 * Seite je aufruft. `useSeoHiddenLocalesState()` ist die KOPF-Seite und hat
 * genau einen Aufrufer (`useLocaleSeoHead()`); der Ref ist `readonly`, damit
 * niemand am Wächter unten vorbei schreiben kann.
 */

/** Der app-weite State selbst — nur für den Kopf. NICHT aus einer Seite schreiben. */
function hiddenLocalesState(): Ref<string[]> {
  return useState<string[]>('pukalani-seo-hidden-locales', () => [])
}

/**
 * Die Sprachcodes, die die AKTUELLE Seite nicht hat — die Leseseite für
 * `useLocaleSeoHead()`. Leer heisst „nichts weglassen".
 */
export function useSeoHiddenLocalesState(): Readonly<Ref<readonly string[]>> {
  return readonly(hiddenLocalesState())
}

/**
 * DIESE SEITE MELDET, WELCHE SPRACHFASSUNGEN ES BEI IHR NICHT GIBT.
 *
 * @param source Sprachcodes (`['de']`), als Ref, Computed oder Getter. Leer =
 *   „diese Seite sagt nichts dazu" — nie „es gibt sie nirgends".
 *
 * ── WARUM DAS AUFRÄUMEN HIER LIEGT UND NICHT IN DER SEITE ────────────────
 * Der State ist APP-WEIT. Bliebe der Eintrag stehen, verlöre die nächste Seite
 * im selben Client-Lauf ihre zweite Adresse. Die naheliegende Antwort — jede
 * Seite setzt ihn im `onUnmounted` auf `[]` zurück — ist aber FALSCH, und zwar
 * lautlos: beim Wechsel im Browser wird zuerst die NEUE Seite aufgebaut (sie
 * schreibt ihren Wert), erst danach die alte abgeräumt. Das blinde Leeren
 * löscht damit genau den Eintrag der neuen Seite.
 *
 * Am 2026-09-10 im Klick-Beweis gemessen (pages-Layer, lokaler
 * Community-Host): Wechsel von einer zweisprachigen Seite auf eine nur
 * deutsche — der Hinweis für den Leser stand richtig da, der Kopf bewarb aber
 * weiter `hreflang="en"` auf einen Text, den es auf Englisch nicht gab. Die
 * Gegenrichtung fällt nicht auf, weil dort beide Seiten denselben Wert
 * schreiben. Alle vier Aufrufstellen (pages, insights/duels/rankings) hatten
 * dieselbe Zeile — deshalb steht der Wächter EINMAL hier und nicht je Seite.
 *
 * Geräumt wird nur, wenn im State noch GENAU DAS Array-Objekt liegt, das
 * dieser Aufruf hineingelegt hat (Identität, nicht Inhalt: zwei Seiten dürfen
 * dieselbe fehlende Sprache melden). Die Liste wird beim Schreiben kopiert,
 * damit die Identität wirklich uns gehört und nicht dem Aufrufer.
 *
 * ── NUR `onUnmounted`, KEIN `onBeforeRouteLeave` ─────────────────────────
 * Mit dem Identitätsvergleich braucht es den zweiten Haken nicht mehr: räumt
 * die alte Seite beim Abräumen, hat die neue längst geschrieben, und für eine
 * Seite ohne eigene Meldung liegt danach wieder `[]` im State. `onUnmounted`
 * allein ist sogar RICHTIGER — `onBeforeRouteLeave` feuert, BEVOR feststeht,
 * dass die Navigation überhaupt stattfindet: bricht ein anderer Guard sie ab,
 * bliebe die Seite stehen und hätte ihre eigene Meldung weggeräumt.
 */
export function useSeoHiddenLocales(source: MaybeRefOrGetter<readonly string[]>): void {
  const state = hiddenLocalesState()
  let own: string[] | null = null

  watchEffect(() => {
    const entry = [...toValue(source)]
    own = entry
    state.value = entry
  })

  onUnmounted(() => {
    if (own && state.value === own) state.value = []
  })
}
