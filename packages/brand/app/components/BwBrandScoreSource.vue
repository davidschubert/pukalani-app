<script setup lang="ts">
import type { BrandCheckResult } from '../../shared/types/brand'

/**
 * DIE HERKUNFTS-ZEILE UNTER DEM SCORE — eine Zeile, zwei Wahrheiten
 * (BRAND-CHECK-SEITE §5b).
 *
 * Ein Website-Check sagt „Stand: Aussen-Check der Startseite kailua.coffee,
 * 5. September 2026". Ein DOKUMENT-Check hat keine geprüfte Adresse: sein
 * `url` ist leer, sein `host` trägt den MARKENNAMEN. Derselbe Satz stünde
 * dort als „Aussen-Check der Startseite " ohne Adresse da — die eine Zeile,
 * die das Ergebnis falsch erklärt.
 *
 * Deshalb eine eigene Komponente statt einer Verzweigung in der Seite: die
 * Ergebnis-Seite ist für beide Quellen DIESELBE (§5b: „derselbe
 * `/brand-check/<id>`"), und die Unterscheidung gehört an genau eine Stelle.
 *
 * ── DAS DATUM RECHNET IN UTC ─────────────────────────────────────────────
 * Wie auf der Ergebnis-Seite: Server und Browser stehen in verschiedenen
 * Zeitzonen, und ohne feste Zone bräche die Hydration an einer Zeichenkette,
 * die tagesgenau ohnehin dieselbe sein soll.
 */
const props = defineProps<{ result: BrandCheckResult }>()

const { t, locale } = useI18n()

const isDocument = computed(() => props.result.source === 'document')

const createdAt = computed(() => {
  const date = new Date(props.result.createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date)
})

/**
 * Ohne Markennamen der kürzere Satz — eine Brand ohne Arbeitstitel ist der
 * Normalfall am ersten Tag, und „Fundament-Dokument von , Stand …" wäre der
 * sichtbare Beweis, dass hier eine Lücke steht.
 */
const line = computed(() => {
  if (!isDocument.value) {
    return t('brand.check.result.stand', { host: props.result.host, date: createdAt.value })
  }
  return props.result.host
    ? t('brand.check.document.source', { host: props.result.host, date: createdAt.value })
    : t('brand.check.document.sourceUnnamed', { date: createdAt.value })
})
</script>

<template>
  <div data-check-source>
    <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">{{ line }}</p>
    <p v-if="isDocument" class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">
      {{ t('brand.check.document.hint') }}
    </p>
  </div>
</template>
