<script setup lang="ts">
import { demoFoundation } from '../../../utils/demoFoundation'

/**
 * KLICKDUMMY „BRAND FOUNDATION" — die ÖFFENTLICHE Empfänger-Ansicht
 * (Screen 5 aus §2.11; im Echtbetrieb `/brand/share/:token`).
 *
 * DERSELBE Renderer wie die private Seite (`FdChapter`) und DASSELBE
 * Inhaltsverzeichnis (`FdToc`, Davids Wunsch 2026-09-05) — aber kein
 * Workspace, keine Sidebar, kein Zähler: der zweite Leser will wissen, WAS
 * gilt, nicht wie weit die Abnahme ist (§1.1). Das Verzeichnis sitzt als
 * `UPageAside` rechts in einer `UPage` und scrollt mit dem FENSTER; ohne
 * Kopfzeile ist `--ui-header-height` hier 0, sonst klebte es 4 rem zu tief.
 *
 * Drei Unterschiede, alle aus dem Konzept:
 *  1. Der Snapshot enthält nur BESTÄTIGTES — das offene Kapitel „Name" fehlt
 *     hier ganz (die Seite filtert, wie es später `share.post.ts` tut).
 *  2. Das gesperrte Kapitel schrumpft auf EINEN Satz, ohne CTA und ohne
 *     Preisanker (§2.6) — das erledigt `variant="share"` im Renderer.
 *  3. Export ist nur Drucken.
 *
 * Kopf-Meta: `og:title`/`og:description` für die Messenger-Vorschau, dazu
 * `noindex` — ein geteilter Link ist privat, aber er wird verschickt.
 */

/* Der Snapshot: nur Bestätigtes reist. */
const chapters = computed(() => demoFoundation.chapters.filter(c => c.state !== 'pending'))

/* Der erste Satz der Story ist die Messenger-Beschreibung (§2.6). */
const storyLead = 'Bei einer Tomate steht die Herkunft auf dem Schild. Bei einer Tasse Kaffee steht dort ein Preis.'
const pageTitle = `Brand Foundation · ${demoFoundation.brand.title}`

useHead({
  title: pageTitle,
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: storyLead },
  ],
})

function print(): void {
  if (import.meta.client) window.print()
}
</script>

<template>
  <div class="bw-root fd-share min-h-dvh px-6 pb-16" style="--ui-header-height: 0px">
    <div class="mx-auto max-w-5xl">
      <!-- Schlanker Kopf statt Seiten-Navigation: der Empfänger hat hier
           nichts zu bedienen ausser dem Druck. -->
      <header class="fd-share-head flex flex-wrap items-end justify-between gap-4 border-b py-8" style="border-color: var(--bw-line)">
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Foundation</p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">{{ demoFoundation.brand.title }}</h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">Stand {{ demoFoundation.brand.standDate }}</p>
        </div>
        <UButton
          class="fd-noprint rounded-full" color="neutral" variant="outline" icon="i-ph-printer"
          label="Drucken" style="background: var(--bw-surface-hi)" @click="print"
        />
      </header>

      <!-- 7 + 3 Spalten statt 8 + 2: bei zwei Spalten kürzt das Verzeichnis
           „Kontext & Zielgruppe“ auf „Kontext & Zie…“ (Playwright-Screenshot). -->
      <UPage :ui="{ root: 'lg:gap-12', center: 'lg:col-span-7 min-w-0', right: 'lg:col-span-3' }">
        <div class="mt-10 flex flex-col gap-10">
          <FdChapter
            v-for="(chapter, i) in chapters" :key="chapter.id"
            :chapter="chapter" :index="i" variant="share"
          />
        </div>
        <template #right>
          <UPageAside class="fd-noprint" :ui="{ root: 'py-10 lg:pe-0' }">
            <FdToc :chapters="chapters" />
          </UPageAside>
        </template>
      </UPage>

      <!-- Der einzige Marketing-Zug, dezent (§2.6). -->
      <footer class="fd-noprint mt-14 border-t pt-6" style="border-color: var(--bw-line)">
        <p class="bw-label" style="color: var(--bw-muted)">
          Erstellt mit <NuxtLink to="/" class="underline" style="color: var(--bw-ink-soft)">Branding Supply</NuxtLink>
        </p>
      </footer>
    </div>
  </div>
</template>

<style>
/* Druck der Empfänger-Ansicht: dieselbe Regel wie privat — keine Knöpfe,
 * volle Lesebreite. Der Kopf mit Marke und Stand bleibt stehen. */
@media print {
  .fd-share .fd-noprint { display: none !important; }
  .fd-share { padding: 0 !important; }
}
</style>
