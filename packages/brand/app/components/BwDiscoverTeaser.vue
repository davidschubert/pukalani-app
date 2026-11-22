<script setup lang="ts">
import { BRAND_PALETTES } from '../../shared/brandPalette'
import type { BrandDiscoverItem, BrandDiscoverListResponse } from '../../shared/types/brand'

/**
 * DER DISCOVER-TEASER — drei echte Kacheln aus der Galerie
 * (docs/archiv/DISCOVER-BRANDS.md §4.1, Paket D2).
 *
 * ── ER ZEIGT ECHTE MARKEN ODER GAR NICHTS ────────────────────────────────
 * Anders als `BwBrandCheckTeaser`, der ein erfundenes Beispiel mit Etikett
 * zeigt: hier stünden erfundene Marken auf einer Seite, die verspricht, genau
 * diese Marken seien gebaut worden. Also FAIL-SOFT ins Nichts — solange keine
 * Marke freigegeben ist, gibt es diesen Abschnitt schlicht nicht. Ein leerer
 * Rahmen mit „bald hier" wäre die Ankündigung eines Produkts statt eines
 * Beweises.
 *
 * ── DER ABRUF DARF DIE SEITE NIE KOSTEN ──────────────────────────────────
 * Ein Fehler ist kein Fehler dieser Seite: die Startseite hat mit der Galerie
 * nichts zu tun. `useFetch` bekommt deshalb einen eigenen Schlüssel und einen
 * `default`, und der Abschnitt verschwindet bei allem, was schiefgeht — auch
 * dann, wenn `brand_publications` noch gar nicht existiert.
 *
 * AUSFALL ≠ „NOCH NICHTS FREIGEGEBEN" (LZ1, 2026-11-22): bei einem echten
 * Ausfall (`isFetchOutage`: kein Status oder 5xx) bleiben Überschrift und
 * Weg zur Galerie stehen, und an Stelle der Kacheln steht eine ruhige Zeile
 * mit „Noch einmal versuchen". Ein 4xx bleibt still (der Abschnitt fehlt),
 * ebenso „keine Marke freigegeben" — beides ist kein Ausfall.
 */
const props = withDefaults(defineProps<{
  /** Wie viele Kacheln — drei passen neben den Text (§4.1). */
  limit?: number
}>(), { limit: 3 })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()

/**
 * Die Vorgaben der Galerie: neueste zuerst, keine Facette. Der Teaser ist eine
 * Einladung und keine Auswahl.
 *
 * KEIN `default`: `data` ist bei jedem Fehler ohnehin `null`, und ein
 * `default: () => null` verengt bei Nuxts Überladungen den Typ auf `Ref<undefined>`
 * statt auf die Antwort (Typecheck-Fehler TS2769/TS2339, live erwischt).
 */
const { data, error, refresh } = await useFetch<BrandDiscoverListResponse>('/api/discover', {
  key: 'brand-discover-teaser',
})

const items = computed<BrandDiscoverItem[]>(() => (data.value?.items ?? []).slice(0, props.limit))
/** Echter Ausfall (s. Kopf) — nur dann die Fehler-Zeile statt der Kacheln. */
const failed = computed(() => isFetchOutage(error.value))

function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return te(key) ? t(key) : t('brand.industry.unknown')
}

function scoreLabel(kind: string): string {
  const key = `brand.discover.score.${kind}`
  return te(key) ? t(key) : ''
}

const FALLBACK_GRADIENT = BRAND_PALETTES[0]!.gradient
function tileBackground(paletteId: string): string {
  const [a, b, c] = BRAND_PALETTES.find(entry => entry.id === paletteId)?.gradient ?? FALLBACK_GRADIENT
  return `linear-gradient(165deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}

/** Die Farbwelt-Namen sind Eigennamen und laufen nicht über i18n (Katalog). */
function paletteName(paletteId: string): string {
  const entry = BRAND_PALETTES.find(palette => palette.id === paletteId)
  if (!entry) return ''
  return locale.value.startsWith('de') ? entry.name.de : entry.name.en
}
</script>

<template>
  <section v-if="items.length || failed" data-discover-teaser>
    <div class="flex flex-wrap items-end justify-between gap-6">
      <div class="min-w-0">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('brand.discover.teaser.eyebrow') }}
        </p>
        <h2 class="mt-3 max-w-lg text-balance text-3xl font-extralight leading-snug tracking-tight sm:text-4xl">
          {{ t('brand.discover.teaser.title') }}
        </h2>
        <p class="mt-4 max-w-lg text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.discover.teaser.body') }}
        </p>
      </div>
      <UButton
        :to="localePath('/discover')" :label="t('brand.discover.teaser.cta')"
        size="lg" color="neutral" class="rounded-full" trailing-icon="i-ph-arrow-right"
        data-discover-teaser-cta
      />
    </div>

    <div v-if="failed" class="mt-10" data-discover-teaser-error>
      <CoreInlineLoadError :retry="refresh" />
    </div>

    <div v-else class="mt-10 grid gap-x-6 gap-y-10 @sm:grid-cols-3">
      <NuxtLink
        v-for="item in items" :key="item.slug"
        :to="localePath(`/discover/${item.slug}`)" class="group block"
      >
        <div class="bw-tile bw-on-dark relative overflow-hidden" style="aspect-ratio: 1 / 1">
          <div
            class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]"
            :style="`background: ${tileBackground(item.paletteId)}`"
          />
          <p
            class="absolute inset-0 grid place-items-center p-6 text-center text-2xl font-extralight leading-snug tracking-tight"
            style="color: var(--bw-ink); text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)"
          >{{ item.title }}</p>
        </div>
        <div class="mt-3 flex items-start justify-between gap-3">
          <p class="bw-label" style="color: var(--bw-muted)">
            {{ [industryLabel(item.industry), paletteName(item.paletteId)].filter(Boolean).join(' · ') }}
          </p>
          <BwScoreRing
            v-if="item.score" :value="item.score.value" :size="30"
            :label="scoreLabel(item.score.kind)" class="flex-none"
          />
        </div>
      </NuxtLink>
    </div>
  </section>
</template>
