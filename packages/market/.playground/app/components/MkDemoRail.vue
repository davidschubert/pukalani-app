<script setup lang="ts">
/**
 * PROTOTYP (M0) — DIE LEISTE DER WERKSTATT mit dem NEUEN Ebene-1-Eintrag
 * „Markt" unter „Euer Branding" (Plan §2.5).
 *
 * ── WARUM SIE IM PLAYGROUND WOHNT UND NICHT IM LAYER ─────────────────────
 * Die echte Leiste ist `BwWorkspaceSidebar` im brand-Layer; „Markt" wird dort
 * ein Eintrag mehr (Paket M4). Diese Datei ist nur die ANSICHT dieser
 * Änderung — sie zeigt Davids Entscheidung, wo der Eintrag sitzt, ohne die
 * echte Leiste vorzeitig umzubauen. Sie ist bewusst schlanker als das
 * Original (keine Marken-Umschaltung, keine Info-Layer, kein Sync-Zustand):
 * beurteilt werden soll die STELLE, nicht die Leiste noch einmal.
 *
 * ── ZWEI GLYPHEN, ZWEI WELTEN (§2.5) ─────────────────────────────────────
 * Buch für das Dokument, Kompass für den Markt. Der Zähler am Markt-Eintrag
 * zeigt offene Befunde — und steht als ZAHL da, nicht als Punkt: „2" sagt,
 * wie viel Arbeit wartet, ein Punkt sagt nur „irgendwas".
 */
withDefaults(defineProps<{
  active: 'branding' | 'market'
  findings?: number
  /** Screen 4: die Session „Erste Wahl für" ist offen. */
  sessionActive?: boolean
}>(), { findings: 0, sessionActive: false })

const { t } = useI18n()
const localePath = useLocalePath()

/** Die Kapitel der Foundation — Namen aus dem brand-Katalog, nie doppelt getippt. */
const chapters = computed(() => [
  { key: 'context', state: 'done' as const },
  { key: 'pvm', state: 'done' as const },
  { key: 'values', state: 'active' as const },
  { key: 'archetype', state: 'open' as const },
  { key: 'manifesto', state: 'open' as const },
])

const GLYPH = {
  done: { name: 'i-ph-check-circle', tone: 'var(--bw-accent)' },
  active: { name: 'i-ph-circle-half', tone: 'var(--bw-ink)' },
  open: { name: 'i-ph-circle', tone: 'var(--bw-muted)' },
} as const
</script>

<template>
  <nav :aria-label="t('brand.workspace.rail.progressNav')">
    <!-- Kopf: die Marke, wie im echten Switcher — hier ohne Menü. -->
    <div class="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
      <span
        class="grid size-7 flex-none place-items-center rounded-lg text-xs font-semibold"
        style="background: var(--bw-ink); color: var(--bw-paper)"
      >K</span>
      <span class="min-w-0 flex-1 truncate text-sm font-medium">Kailua Coffee Co.</span>
    </div>

    <div class="mt-4 space-y-1">
      <!-- Ebene 1: Euer Branding -->
      <div>
        <NuxtLink
          :to="localePath('/market/demo/werkstatt')"
          class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium"
          :style="active === 'branding'
            ? 'background: var(--bw-surface-hi); color: var(--bw-ink); box-shadow: var(--bw-shadow-card)'
            : 'color: var(--bw-ink-soft)'"
        >
          <UIcon name="i-ph-book-open" class="size-4 flex-none" style="color: var(--bw-muted)" />
          <span class="min-w-0 flex-1 truncate">{{ t('market.nav.branding') }}</span>
        </NuxtLink>

        <ul class="ml-5 mt-0.5 space-y-0.5 border-l pl-1.5" style="border-color: var(--bw-line)">
          <li v-for="chapter in chapters" :key="chapter.key">
            <span
              class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-sm"
              :style="`color: ${chapter.state === 'open' ? 'var(--bw-muted)' : 'var(--bw-ink-soft)'}`"
            >
              <UIcon :name="GLYPH[chapter.state].name" class="size-3.5 flex-none" :style="`color: ${GLYPH[chapter.state].tone}`" />
              <span class="min-w-0 flex-1 truncate">{{ t(`brand.steps.${chapter.key}`) }}</span>
            </span>

            <!-- Screen 4: die offene Session unter ihrem Kapitel. -->
            <ul
              v-if="chapter.key === 'pvm' && sessionActive"
              class="ml-5 mt-0.5 space-y-0.5 border-l pl-1.5" style="border-color: var(--bw-line)"
            >
              <li>
                <span
                  class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium"
                  style="background: var(--bw-surface-hi); color: var(--bw-ink)"
                  aria-current="true"
                >
                  <UIcon name="i-ph-circle-half" class="size-3.5 flex-none" style="color: var(--bw-ink)" />
                  <span class="min-w-0 flex-1 truncate">{{ t('brand.labels.b.positioningFirstChoice') }}</span>
                  <!-- Der offene Befund am Feld: Punkt UND Titel, nie nur Farbe. -->
                  <span
                    class="size-1.5 flex-none rounded-full"
                    style="background: var(--bw-stale)"
                    :title="t('market.finding.kind')"
                  />
                </span>
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <!-- Ebene 1: Markt — der neue Eintrag (Plan §2.5). -->
      <NuxtLink
        :to="localePath('/market/demo/markt')"
        class="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium"
        :style="active === 'market'
          ? 'background: var(--bw-surface-hi); color: var(--bw-ink); box-shadow: var(--bw-shadow-card)'
          : 'color: var(--bw-ink-soft)'"
      >
        <UIcon name="i-ph-compass" class="size-4 flex-none" style="color: var(--bw-muted)" />
        <span class="min-w-0 flex-1 truncate">{{ t('market.nav.market') }}</span>
        <span
          v-if="findings > 0"
          class="bw-label flex-none rounded-full px-1.5"
          style="background: var(--bw-stale-soft); color: var(--bw-stale)"
          :title="t('market.nav.findings', { count: findings })"
        >{{ findings }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
