<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui'
import type { FdChapterData } from '../utils/demoFoundation'

/**
 * DAS INHALTSVERZEICHNIS der Brand Foundation — EIN Baustein für beide
 * Ansichten (Davids Wunsch 2026-09-05: „UPageAside mit UContentToc", zuerst
 * privat, dann auch auf der Share-Seite). Die HÜLLE (`UPageAside`) stellt
 * jede Seite selbst, weil sie sich unterscheidet: privat lebt sie in der
 * scrollenden Workspace-Spalte (static), öffentlich am Seitenrand (sticky).
 *
 * `UContentToc` bringt Sprungmarken + Hervorhebung des sichtbaren Kapitels:
 * `useScrollspy` beobachtet die Elemente mit den `links[].id`, also unsere
 * `<section :id="anchor">`. Die Links tragen ZUSÄTZLICH Zustand und Nummer,
 * damit der `link`-Slot Haken · Kreis · Schloss zeigen kann (der Vertrag ist
 * generisch: `T extends ContentTocLink`).
 *
 * ZWEI DINGE, die man nicht „vereinfachen" darf (beide live erwischt):
 *  1. EINZEILIGE Einträge — die Hervorhebungs-Linie rechnet mit der festen
 *     Zeilenhöhe des Vorbilds (1,75 rem je Link); ein zweizeiliger Eintrag
 *     setzt sie an den falschen Eintrag. Nummer und „offen" stehen rechts.
 *  2. `@move` scrollt SELBST: `UContentToc` schiebt den Hash in den Router,
 *     und der scrollt das FENSTER — in der privaten Ansicht scrollt aber die
 *     Bühne (`main.bw-stage`). `scrollIntoView` findet den nächsten
 *     scrollenden Vorfahren, auf der Share-Seite ist das das Fenster.
 */
const props = defineProps<{
  chapters: readonly FdChapterData[]
}>()

type FdTocState = FdChapterData['state']

interface FdTocLink extends ContentTocLink {
  state: FdTocState
  num: string
}

const links = computed<FdTocLink[]>(() => props.chapters.map((chapter, i) => ({
  id: chapter.anchor,
  depth: 2,
  text: chapter.title,
  state: chapter.state,
  num: String(i).padStart(2, '0'),
})))

function scrollToChapter(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function glyph(state: FdTocState): { name: string, style: string } {
  if (state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  if (state === 'pending') return { name: 'i-ph-circle', style: 'color: var(--bw-draft)' }
  return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
}
</script>

<template>
  <UContentToc
    title="Inhalt"
    :links="links"
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
    @move="scrollToChapter"
  >
    <template #link="{ link }">
      <span class="flex w-full min-w-0 items-center gap-2">
        <UIcon :name="glyph(link.state).name" class="size-4 flex-none" :style="glyph(link.state).style" />
        <span class="min-w-0 flex-1 truncate">{{ link.text }}</span>
        <span class="bw-label flex-none tabular-nums" style="color: var(--bw-muted)">
          {{ link.num }}<template v-if="link.state === 'pending'"> · offen</template>
        </span>
      </span>
    </template>
  </UContentToc>
</template>
