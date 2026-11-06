<script setup lang="ts">
/**
 * DIE KAPITEL-EINSTIEGSSÄTZE DER DRITTEN SCHICHT (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7, Paket K5) — übernommen aus dem
 * freigegebenen Klickdummy (`DK_ADVISOR_MOVES` in
 * `.playground/app/utils/demoKit.ts`).
 *
 * ── ES IST GEORGE, DER HIER SPRICHT ───────────────────────────────────────
 * Auch in den Kapiteln von Otto und Nika. Die „Züge" sind SEINE Sätze ÜBER
 * die beiden („Beim Namen halte ich mich an Otto") — keine zweite Sprechblase,
 * keine zweite Stimme (Eine Stimme, 2026-09-02). Das Muster ist dasselbe wie
 * beim Phasen-Intro der Werkstatt (`brand.advisors.<key>.intro`), nur eine
 * Zoomstufe tiefer: das Intro sagt, mit WESSEN Blick George das Kapitel
 * angeht, die Züge sagen, WAS hier gleich passiert.
 *
 * ── SIE STEHEN ÜBER DEM GESPRÄCH UND NICHT DARIN ──────────────────────────
 * Sie werden NICHT gespeichert und tauchen in keinem Verlauf auf — dieselbe
 * Entscheidung wie beim Phasen-Intro (wer zwischen zwei Kapiteln hin- und
 * herspringt, bekäme sonst bei jedem Sprung Zeilen in seinen Verlauf).
 *
 * ── ZWEI ZEILEN JE ZUG, DIE ZWEITE OPTIONAL ───────────────────────────────
 * `text` ist der Satz, `help` die leise Herkunfts- oder Hinweiszeile darunter
 * — nie eine zweite Frage (so steht es am Typ im Dummy). Fehlt der
 * Hilfe-Schlüssel im Katalog, bleibt die Zeile weg: ein nicht übersetzter
 * Schlüssel rendert sich selbst, und genau so stand vier Tage lang
 * `legal.imprint` im Fuss von comments.pukalani.app.
 *
 * ── GEORGE SPRICHT IN DER ANREDE DER MARKE (BW1-Inhaltsrunde 2026-09-09) ──
 * Die Züge gehen über `useBrandTeamText()` statt über `t()`: liegt unter
 * `….text` ein Paar `{solo, team}`, kommt die passende Fassung, sonst der
 * Basis-Schlüssel. Ein neues Kapitel braucht die Weiche also nicht zu kennen
 * — es bekommt sie durch das blosse Anlegen der zwei Kinder im Katalog.
 */
const props = defineProps<{
  /** Kapitel-Schlüssel: `nomenclature` · `aiguide` · `presskit`. */
  chapter: string
  /** Wie viele Züge dieses Kapitel hat — der Katalog trägt sie durchnummeriert. */
  count: number
}>()

const { teamText, hasTeamText } = useBrandTeamText()

const moves = computed(() => Array.from({ length: props.count }, (_, index) => {
  const base = `brand.kit.moves.${props.chapter}.m${index + 1}`
  return {
    id: base,
    text: teamText(`${base}.text`),
    help: hasTeamText(`${base}.help`) ? teamText(`${base}.help`) : '',
  }
}))
</script>

<template>
  <div class="flex flex-col gap-3" data-brand-kit-moves>
    <div v-for="move in moves" :key="move.id">
      <p class="bw-doc-text">{{ move.text }}</p>
      <p v-if="move.help" class="bw-msg-help">{{ move.help }}</p>
    </div>
  </div>
</template>
