<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui'

/**
 * DAS INHALTSVERZEICHNIS DER LESE-SEITEN (Davids Wunsch 2026-09-05: „bau das
 * Inhaltsverzeichnis auch in die echte Dokument-Seite ein"). Vorbild und
 * abgenommene Form: `FdToc` im Playground.
 *
 * ── EINE KOMPONENTE, ZWEI SEITEN (Paket G2) ──────────────────────────────
 * Sie hiess bis G2 `BwDocumentToc` und war an `BrandDocumentChapter` gebunden.
 * Die Brand Foundation braucht dasselbe Verzeichnis über ANDERE Zeilen
 * (Handbuch-Kapitel statt Werkstatt-Kapitel, Kapitelnummer statt
 * Abnahme-Zähler) — eine zweite Komponente wäre dieselbe Mechanik zum zweiten
 * Mal, und die eine, die man später anfasst, ist garantiert nicht die andere.
 * Der Vertrag ist deshalb eine LINK-LISTE: Sprungmarke, Text, Zustand,
 * optionale Zusatzspalte rechts. Wer sie füllt, weiss die Seite.
 *
 * ES ERSETZT DEN „STAND" und ist zugleich einer: `UContentToc` bringt
 * Sprungmarken UND die Hervorhebung des sichtbaren Abschnitts (`useScrollspy`
 * beobachtet die Elemente mit den `links[].id` — die `<section :id="…">` der
 * Seite).
 *
 * DIE HÜLLE (`UPageAside`) LIEGT NICHT HIER, sondern bei der Seite: sie
 * unterscheidet sich je Ort (in der scrollenden Workspace-Spalte `static`, am
 * Seitenrand einer Leseansicht `sticky`), und eine Komponente, die ihren
 * eigenen Platz bestimmt, ist an zweiter Stelle nicht mehr brauchbar.
 *
 * ZWEI DINGE, die man nicht „vereinfachen" darf (beide im Playground live
 * erwischt):
 *  1. EINZEILIGE Einträge — die Hervorhebungs-Linie rechnet mit der festen
 *     Zeilenhöhe des Vorbilds (1,75 rem je Link); ein zweizeiliger Eintrag
 *     setzt sie an den falschen Eintrag. Deshalb steht rechts nur eine
 *     KURZFORM (`7/11` bzw. die Kapitelnummer): die Langform
 *     (`brand.acceptance.counter`, „7 von 11 abgenommen") bricht in dieser
 *     Spalte um.
 *  2. `@move` scrollt SELBST: `UContentToc` schiebt den Hash nur in den
 *     Router, und der scrollt das FENSTER — in der Werkstatt scrollt aber die
 *     Bühne (`main.bw-stage`). `scrollIntoView` findet den nächsten
 *     scrollenden Vorfahren und trifft damit beides.
 *
 * VORAUSSETZUNG in der App: `ui: { content: true }` (s. nuxt.config des
 * Layers) — ohne den Schalter registriert Nuxt UI `UContentToc` gar nicht.
 */

/**
 * Die Zustände beider Seiten in EINER Menge. `active` und `open` kennt nur das
 * Dokument (ein Kapitel, in dem gerade gearbeitet wird), `pending` nur die
 * Foundation („noch nicht abgenommen") — zusammengelegt, weil die GLYPHE die
 * gemeinsame Sprache ist: Haken · Halbkreis · Kreis · Schloss.
 */
export type BwTocState = 'done' | 'active' | 'pending' | 'open' | 'locked'

export interface BwTocLink {
  /** Die Sprungmarke — sie IST die `id` des Abschnitts auf der Seite. */
  id: string
  text: string
  state: BwTocState
  /** Kurzform rechts: Abnahme-Zähler (`7/11`) oder Kapitelnummer (`07`). */
  counter?: string
  /**
   * Verschachtelungs-Tiefe. 2 = Kapitel (die Vorgabe), 3 = Unterpunkt — heute
   * die fünf Abschnitte des vollen Kapitels 10 (Brand Design D8). `UContentToc`
   * rückt Tiefe 3 selbst ein; die Zeilenhöhe bleibt dieselbe, und damit auch
   * die Rechnung der Hervorhebungs-Linie (s. Kopf, Punkt 1).
   */
  depth?: 2 | 3
}

const props = defineProps<{
  links: BwTocLink[]
  /** Überschrift der Spalte — die Seite kennt ihren eigenen Namen dafür. */
  title: string
}>()

interface BwTocContentLink extends ContentTocLink {
  state: BwTocState
  counter: string
}

const tocLinks = computed<BwTocContentLink[]>(() => props.links.map(link => ({
  id: link.id,
  depth: link.depth ?? 2,
  text: link.text,
  state: link.state,
  counter: link.counter ?? '',
})))

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/**
 * Haken · Halbkreis · Kreis · Schloss — dieselbe Reihenfolge wie überall im
 * Wizard. Die Seite hat den Zustand schon entschieden (im Dokument schlägt der
 * GESPEICHERTE „abgenommen" den geltenden), hier wird er nur gezeichnet.
 */
function glyph(state: BwTocState): { name: string, style: string } {
  if (state === 'done') return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
  if (state === 'active') return { name: 'i-ph-circle-half-fill', style: 'color: var(--bw-ink)' }
  if (state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  if (state === 'pending') return { name: 'i-ph-circle', style: 'color: var(--bw-draft)' }
  return { name: 'i-ph-circle', style: 'color: var(--bw-muted)' }
}
</script>

<template>
  <UContentToc
    :title="title"
    :links="tocLinks"
    color="neutral"
    highlight
    highlight-color="neutral"
    default-open
    :ui="{
      root: 'static max-h-none mx-0 px-0 sm:mx-0 sm:px-0 bg-transparent backdrop-blur-none',
      container: 'pt-0 sm:pt-0 lg:py-0 pb-0 sm:pb-0 border-0',
      trigger: 'bw-label uppercase tracking-wider font-normal',
      title: 'text-(--bw-muted)',
      link: 'rounded-md',
      list: 'border-(--bw-line)',
      indicatorActive: 'bg-(--bw-ink)',
    }"
    @move="scrollToSection"
  >
    <template #link="{ link }">
      <span class="flex w-full min-w-0 items-center gap-2">
        <UIcon :name="glyph(link.state).name" class="size-4 flex-none" :style="glyph(link.state).style" />
        <span class="min-w-0 flex-1 truncate">{{ link.text }}</span>
        <span
          v-if="link.counter"
          class="bw-label flex-none tabular-nums" style="color: var(--bw-muted)"
        >{{ link.counter }}</span>
      </span>
    </template>
  </UContentToc>
</template>
