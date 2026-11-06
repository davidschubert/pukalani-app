<script setup lang="ts">
import type { InsightsLocale, InsightsPost } from '../../../../../shared/insightsPost'
import type { InsightsPublicPostListItem } from '../../../../../shared/insightsPublic'
import { DEMO_GRADIENTS, DEMO_POSTS } from '../../../utils/demoInsights'

/**
 * SCREEN 1 — DIE JOURNAL-LISTE (Plan §9.5, Adresse `/insights`).
 *
 * Sie zeigt ALLE VIER Formate in einer Liste — das ist die Entscheidung, die
 * hier zur Abnahme steht: Insights ist EIN Bereich mit vier Formaten und
 * nicht vier Bereiche. Der Filter trennt sie, die Liste nicht.
 *
 * ── WAS DAVID HIER PRÜFEN SOLL ──────────────────────────────────────────
 *  · Die Werkzeugleiste: Themen als Chips, Format/Sprache/Sortierung als
 *    Auswahl, Raster/Liste rechts (und in der Adresse, `?display=list`).
 *  · „Meistgelesen" ist SICHTBAR gesperrt, mit dem Grund darunter.
 *  · Der englische Beitrag „Why good names are uncomfortable" trägt auf der
 *    deutschen Oberfläche den Hinweis „Nur auf English" — und verschwindet,
 *    sobald man den Sprachfilter auf Deutsch stellt. Das ist die Sicherung
 *    aus §3.2 („eine unredigierte Fassung ist nie öffentlich"), von aussen
 *    gesehen.
 *
 * OHNE `BwSiteFooter`: dessen Punkte („About", „Team") sind Seiten der
 * branding-App und im Playground nicht vorhanden — der Fuss stünde hier mit
 * zwei toten Links da, und genau die hat Davids 404-Audit vom 2026-09-03
 * beseitigt. Ein Prototyp soll das nicht wieder vorführen.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()

const readerLocale = computed<InsightsLocale>(() => (locale.value === 'de' ? 'de' : 'en'))

/**
 * Im Produkt (BI1 I3) baut der SERVER Adresse und Farbwelt und liefert sie am
 * Listen-Item mit (`href`, `gradient`) — der Pfad eines Markenprofils braucht
 * den Slug der MARKE, und der Verlauf gehört dem brand-Layer. Der Prototyp
 * hat weder das eine noch das andere und setzt beides hier von Hand; die FORM
 * ist dieselbe, damit `InPostList` in beiden Welten dasselbe bekommt.
 */
function demoHref(post: InsightsPost): string {
  if (post.format === 'profile') return '/insights/demo/profil'
  if (post.format === 'duel') return '/insights/demo/duell'
  if (post.format === 'ranking') return '/insights/demo/ranking'
  return '/insights/demo/artikel'
}

const items = computed<InsightsPublicPostListItem[]>(() => DEMO_POSTS.map((post, index) => ({
  ...post,
  id: `demo-${index}`,
  href: demoHref(post),
  gradient: DEMO_GRADIENTS[post.brandRefs[0]?.brandId ?? ''] ?? ['#e6e2da', '#8f867a'],
})))
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <InDemoNav />
    <div class="mx-auto max-w-7xl">
      <div class="mb-2 text-center">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Insights</p>
        <h1 class="mt-1 text-4xl leading-tight">
          {{ locale === 'de' ? 'Markenwissen, das trägt' : 'Brand knowledge that holds' }}
        </h1>
      </div>
      <p class="bw-label text-center" style="color: var(--bw-muted)">
        {{ locale === 'de'
          ? 'Markenprofile, Duelle, Artikel und Rankings — verknüpft statt verbloggt.'
          : 'Brand profiles, duels, articles and rankings — linked, not blogged.' }}
      </p>

      <div class="mt-8">
        <InPostList
          :posts="items"
          :locale="readerLocale"
          :localize="localePath"
        />
      </div>

      <p class="bw-pending mt-12 text-center">
        {{ t('insights.article.byline') }} · Prototyp I0 — alle Marken erfunden, keine fremden Logos.
      </p>
    </div>
  </div>
</template>
