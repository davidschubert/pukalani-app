<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui'
import type { InsightsLocale } from '../../shared/insightsPost'
import { insightsPublicFassung, insightsTopicLabel } from '../../shared/insightsPost'
import type { InsightsPublicPostView } from '../../shared/insightsPublic'
import { insightsDay } from '../utils/insightsFormat'

/**
 * PROTOTYP (I0) — DIE ARTIKEL-SEITE (§2.3, §9.5; Vorlage: der Klickdummy
 * `brand/.playground/app/pages/brand/demo/artikel.vue`).
 *
 * ── DER SCROLLSPY IST NICHT MEHR HANDGEBAUT ─────────────────────────────
 * Der Klickdummy rechnete ihn selbst (Lese-Linie im oberen Drittel, eigener
 * `scroll`-Hörer). `UContentToc` bringt Sprungmarken UND Hervorhebung mit
 * (`useScrollspy` beobachtet die Elemente mit den `links[].id` — hier die
 * `<section :id="…">` des Textes). Voraussetzung ist `ui: { content: true }`,
 * und der Schalter steht im LAYER (s. `nuxt.config.ts`) — ohne ihn bliebe die
 * Spalte lautlos leer.
 *
 * ── DIE ÜBERSCHRIFTEN KOMMEN AUS DEM TEXT, NICHT AUS EINEM FELD ─────────
 * §9.5: „die Überschriften kommen aus dem gerenderten Markdown (h2/h3 — mehr
 * kennt der Parser nicht, das begrenzt die Tiefe automatisch auf zwei
 * Ebenen)". Im Prototyp reicht die Seite sie als `toc` herein; in I3 baut sie
 * der Renderer. Die FORM ist schon die richtige: Id, Text, Tiefe 2 oder 3.
 *
 * ── EIN AUTORENNAME STEHT HIER NICHT ────────────────────────────────────
 * Entscheidung 4: Wir-Stimme ohne Namen, „keine erfundenen Autoren, nie".
 * Der Klickdummy trug noch „Lena K." und „Jonas T." — genau das ist hier weg.
 */
const props = defineProps<{
  /**
   * Der ÖFFENTLICHE Beitrag (ohne die sechs internen Felder, BI1 I3). Die
   * Komponente braucht die Zeilen-Id nicht — die ist eine Sache der Route
   * (Korrekturziel) — und darf sie deshalb nicht verlangen.
   */
  post: InsightsPublicPostView
  locale: InsightsLocale
  /** Überschriften des Textes (Tiefe 2 und 3) — aus `markdownHeadings()` (core). */
  toc: readonly { id: string, text: string, depth: 2 | 3 }[]
}>()

const { t } = useI18n()
const toast = useToast()

const view = computed(() => insightsPublicFassung(props.post, props.locale))
const topicLabels = computed(() => props.post.topics.map(key => insightsTopicLabel(key)))
const tocLinks = computed<ContentTocLink[]>(() => props.toc.map(entry => ({
  id: entry.id,
  text: entry.text,
  depth: entry.depth,
})))

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/**
 * Teilen über die Zwischenablage. `navigator.share` gibt es nicht überall und
 * `clipboard` kann abgelehnt werden — beide Zweige sagen etwas, keiner
 * schweigt.
 */
async function share(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.add({ title: t('insights.article.shareCopied'), duration: 2000 })
  }
  catch {
    toast.add({ title: t('insights.article.shareFailed'), duration: 2000, color: 'warning' })
  }
}
</script>

<template>
  <div>
    <!-- Zentrierter Kopf: Datum · Thema · Lesezeit, darunter der eine Einstieg
         (Entscheidung 9: „je Format EIN klarer Einstieg" — Artikel ⇒ Wizard). -->
    <div class="mx-auto max-w-3xl text-center">
      <p class="bw-label" style="color: var(--bw-muted)">
        {{ insightsDay(post.publishedAt, locale) }}
        <template v-if="topicLabels.length"> · {{ topicLabels.join(' · ') }}</template>
        · {{ t('insights.list.readingMinutes', { count: post.readingMinutes }) }}
      </p>
      <h1 class="mt-5 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">{{ view.title }}</h1>
      <p class="mx-auto mt-5 max-w-2xl text-lg leading-relaxed" style="color: var(--bw-ink-soft)">{{ view.dek }}</p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
        <slot name="cta" />
      </div>
    </div>

    <!-- Der Zustand „diese Sprache ist noch nicht redigiert" (§3.2). Er steht
         ÜBER dem Text, nicht darunter: der Leser soll wissen, was er liest,
         bevor er es liest. -->
    <UAlert
      v-if="view.fallback"
      class="mx-auto mt-8 max-w-4xl"
      icon="i-ph-translate" color="warning" variant="subtle"
      :title="t('insights.article.translationMissing')"
    />

    <div class="mx-auto mt-12 max-w-4xl">
      <USeparator :ui="{ border: 'border-(--bw-line)' }" />
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="bw-label" style="color: var(--bw-muted)">
          {{ t('insights.article.byline') }} · {{ t('insights.article.updatedNote') }}
        </p>
        <button class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)" @click="share">
          <UIcon name="i-ph-link" class="size-4" /> {{ t('insights.article.share') }}
        </button>
      </div>
    </div>

    <div class="mx-auto mt-10 grid max-w-4xl gap-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <!-- Inhaltsverzeichnis: sticky, mit mitgeliefertem Scrollspy. -->
      <div class="hidden self-start lg:sticky lg:top-10 lg:block">
        <UContentToc
          :title="t('insights.article.toc')"
          :links="tocLinks"
          color="neutral" highlight highlight-color="neutral" default-open
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
        />
      </div>

      <article class="min-w-0">
        <!-- Der Fliesstext. In I3 kommt er aus `core/shared/markdown.ts`; im
             Prototyp reicht die Seite die Abschnitte herein, damit die
             Sprungmarken echte Elemente haben. -->
        <slot />

        <section v-if="post.brandRefs.length" class="mt-12">
          <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.article.mentioned') }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <slot name="brands" />
          </div>
        </section>

        <div class="mt-12">
          <InSourceList :sources="post.sources" :locale="locale" />
        </div>
      </article>
    </div>
  </div>
</template>
