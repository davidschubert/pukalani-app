<script setup lang="ts">
/**
 * PROTOTYP (I0) — DIE HAUPTNAVIGATION, WIE SIE NACH I3 AUSSÄHE.
 *
 * ── WARUM DAS HIER STEHT UND NICHT IN `BwSiteNav` ───────────────────────
 * Die echte Navigation (`packages/brand/app/components/BwSiteNav.vue`) führt
 * seit Davids 404-Audit vom 2026-09-03 NUR ECHTE ZIELE: „Brand Insights"
 * steht dort bewusst NICHT, weil es die Seiten noch nicht gibt (der
 * i18n-Schlüssel `brand.nav.insights` wartet dort schon). Ein Prototyp, der
 * die echte Navigation ändert, baut das 404 wieder ein, das dieser Audit
 * beseitigt hat.
 *
 * Diese Hülle ist deshalb eine VORSCHAU im Playground: dieselbe Form, dieselbe
 * Schrift, dieselben zwei Punkte — und der eine neue daneben, aktiv. I3 trägt
 * ihn dann in die echte Navigation, wenn `/insights` wirklich antwortet.
 *
 * Beschriftungen: `brand.nav.*` aus dem brand-Katalog (der Playground erweitert
 * ihn). Sie heissen in BEIDEN Sprachen englisch — Davids Design, dieselbe
 * Ausnahme wie bei den Hauptpunkten der echten Navigation.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const items = computed(() => [
  { label: t('brand.nav.discover'), to: localePath('/insights/demo/journal'), active: false },
  { label: t('brand.nav.insights'), to: localePath('/insights/demo/journal'), active: route.path.includes('/insights/') },
])
</script>

<template>
  <UHeader
    :to="localePath('/')" class="bw-root -mx-6 mb-10"
    :ui="{ container: 'max-w-full px-6', title: 'flex items-center gap-2.5 text-sm font-semibold' }"
    style="background: color-mix(in srgb, var(--bw-paper) 88%, transparent); border-color: var(--bw-line)"
  >
    <template #title>
      <span class="grid size-8 flex-none place-items-center rounded-full" style="background: var(--bw-ink); color: var(--bw-paper)">
        <UIcon name="i-ph-fingerprint" class="size-5" />
      </span>
      <span class="whitespace-nowrap text-[18px]" style="color: var(--bw-ink); font-weight: 400; letter-spacing: -0.01em">Branding Supply</span>
    </template>

    <UNavigationMenu
      :items="items" variant="link" color="neutral"
      :ui="{ link: 'text-sm text-(--bw-muted) data-active:text-(--bw-ink) hover:text-(--bw-ink)', viewport: 'bw-root' }"
    />

    <template #right>
      <p class="bw-label" style="color: var(--bw-muted)">Prototyp I0</p>
    </template>

    <template #body>
      <UNavigationMenu
        :items="items" orientation="vertical" variant="link" color="neutral" class="-mx-2.5"
        :ui="{ link: 'text-sm text-(--bw-muted) data-active:text-(--bw-ink) hover:text-(--bw-ink)' }"
      />
    </template>
  </UHeader>
</template>
