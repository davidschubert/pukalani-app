<script setup lang="ts">
/**
 * PROTOTYP (I0) — die Übersicht der SECHS Screens (Plan §9.9).
 *
 * Davids Einstieg für die Abnahme-Runde: sechs Adressen, die erfundene
 * Marken-Welt daneben, und der Satz, was dieser Prototyp NICHT tut (kein
 * Server, kein Modell, keine Tabellen, keine echte Marke).
 */
const localePath = useLocalePath()

const screens = [
  { key: 'journal', to: '/insights/demo/journal', icon: 'i-ph-list-bullets', de: 'Journal-Liste — vier Formate, Filter, Raster/Liste', en: 'Journal list — four formats, filters, grid/list' },
  { key: 'artikel', to: '/insights/demo/artikel', icon: 'i-ph-article', de: 'Artikel — Inhaltsverzeichnis, Quellen, Einstieg', en: 'Article — table of contents, sources, entry point' },
  { key: 'profil', to: '/insights/demo/profil', icon: 'i-ph-identification-card', de: 'Markenprofil einer fremden Marke — und der Zustand „auf Wunsch entfernt"', en: 'Profile of a brand we do not own — and the „removed on request" state' },
  { key: 'duell', to: '/insights/demo/duell', icon: 'i-ph-arrows-left-right', de: 'Brand-Duell — Statistik-Tafel mit Belegspalte', en: 'Brand duel — the scoreboard, every fact with its source' },
  { key: 'ranking', to: '/insights/demo/ranking', icon: 'i-ph-list-numbers', de: 'Ranking — zehn Plätze, Stand, Lücke', en: 'Ranking — ten places, as-of date, the gap' },
  { key: 'redaktion', to: '/insights/demo/redaktion', icon: 'i-ph-pencil-line', de: 'Redaktion — Liste, Editor, Prüfregeln, Themenradar', en: 'Desk — list, editor, checks, topic radar' },
]

const { locale } = useI18n()
const isDe = computed(() => locale.value === 'de')
</script>

<template>
  <div class="bw-root min-h-dvh px-6 py-12">
    <div class="mx-auto max-w-3xl">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Prototyp I0</p>
      <h1 class="mt-1 text-3xl font-extralight tracking-tight">Brand Insights</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ isDe
          ? 'Sechs Bildschirme mit den Datenformen aus dem Konzept (§9.3). Sie klicken, sie rechnen, sie prüfen — aber sie speichern nichts.'
          : 'Six screens carrying the data shapes from the concept (§9.3). They click, they compute, they check — but they save nothing.' }}
      </p>
      <p class="bw-pending mt-2">
        {{ isDe
          ? 'Kein Server, kein Modell, keine Tabelle. Alle Marken sind erfunden und tragen .example-Adressen — über eine echte Marke steht hier kein erfundener Satz.'
          : 'No server, no model, no table. Every brand here is invented and carries an .example address — not one invented sentence about a real brand.' }}
      </p>

      <ul class="mt-8 space-y-2">
        <li v-for="screen in screens" :key="screen.key">
          <NuxtLink :to="localePath(screen.to)" class="bw-card bw-card--hover flex items-center gap-3 p-4">
            <UIcon :name="screen.icon" class="size-5 flex-none" style="color: var(--bw-muted)" />
            <span class="min-w-0 flex-1 text-sm font-medium">{{ isDe ? screen.de : screen.en }}</span>
            <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
