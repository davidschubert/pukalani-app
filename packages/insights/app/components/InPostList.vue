<script setup lang="ts">
import type {
  InsightsFormat,
  InsightsLocale,
  InsightsSort,
  InsightsTopicKey,
} from '../../shared/insightsPost'
import {
  INSIGHTS_FORMATS,
  INSIGHTS_LOCALES,
  INSIGHTS_SORTS,
  INSIGHTS_SORTS_AVAILABLE,
  INSIGHTS_TOPICS,
  INSIGHTS_TOPIC_KEYS,
  insightsFilterPosts,
  insightsSortPosts,
} from '../../shared/insightsPost'
import type { InsightsPublicPostListItem } from '../../shared/insightsPublic'

/**
 * DIE JOURNAL-LISTE (§9.5, Adresse `/insights`).
 *
 * ── JEDE FACETTE STEHT IN DER ADRESSE ───────────────────────────────────
 * `?display=` · `?format=` · `?topic=` · `?lang=` · `?sort=`. §9.5 verlangt
 * „Facetten und Seite als Query-Parameter (teilbar)" — eine gefilterte Liste
 * ist ein Ergebnis, das jemand weiterschicken können soll, und ein Zustand nur
 * im Speicher wäre nach dem Weiterschicken des Links weg.
 *
 * WICHTIG für die Hydration: der Anfangswert kommt aus der QUERY und nicht aus
 * einem `onMounted` — auf dem Server derselbe Zweig wie im Browser. Ungültige
 * Werte fallen auf den Default zurück, statt eine leere Liste zu erzeugen:
 * `?format=quatsch` zeigt alles, nicht nichts.
 *
 * GEFILTERT WIRD IM BROWSER, mit denselben puren Regeln wie in der Redaktion
 * (`insightsFilterPosts`, `insightsSortPosts`). Die Route trägt deshalb keine
 * Parameter und hat EINEN Microcache-Eintrag (Begründung in ihrem Kopf).
 *
 * ── „MEISTGELESEN" IST SICHTBAR GESPERRT ────────────────────────────────
 * Die Zahl käme aus Plausible, und das ist auf branding.supply erst mit BS1
 * R2c eingeschaltet (§11 Frage 3: „erst Text, dann Schalter"). Die Option
 * steht deshalb IN der Leiste, deaktiviert, mit dem Grund darunter — eine
 * unsichtbare Sperre erklärt sich nie, und eine stille Ersatz-Sortierung wäre
 * eine Zahl, die niemand gemessen hat.
 *
 * ── EIN BEITRAG OHNE ZIELSPRACHE BLEIBT SICHTBAR ────────────────────────
 * §11.2 Frage 4: er steht mit seiner Grundfassung da und sagt „Nur auf …".
 * Ausgeblendet wird er erst, wenn der SPRACHFILTER ausdrücklich gesetzt ist —
 * ein vorhandener Beitrag, den die Liste verschweigt, ist für den Leser nicht
 * von einem fehlenden zu unterscheiden.
 *
 * ── ADRESSE UND FARBWELT STEHEN AM EINTRAG ──────────────────────────────
 * Beide kommen vom Server (`href`, `gradient`) — der Pfad eines Markenprofils
 * braucht den Slug der MARKE, und der Verlauf gehört dem brand-Layer, den
 * `app/`-Code hier nicht kennen darf (CONCEPT A14). Die Seite reicht nur
 * `localize` herein, weil nur sie `localePath()` hat.
 */
const props = defineProps<{
  posts: readonly InsightsPublicPostListItem[]
  locale: InsightsLocale
  /** `localePath` der Seite — der Layer kennt die Sprache des Lesers nicht. */
  localize: (href: string) => string
  /**
   * Themen-Seite (`/topics/<slug>`): das Thema steht fest, die Chips fallen
   * weg. Ohne diese Klammer stünde auf einer Themen-Seite eine Chip-Leiste,
   * mit der man das Thema der Seite wieder abwählen kann — und die Adresse
   * behauptete danach etwas anderes als die Liste zeigt.
   */
  fixedTopic?: InsightsTopicKey
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** Ein Query-Wert, der im Katalog steht — sonst der Default. */
function fromQuery<T extends string>(key: string, allowed: readonly T[], fallback: T | 'all'): T | 'all' {
  const raw = route.query[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return fallback
  if (value === 'all') return 'all'
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

const activeFormat = ref<InsightsFormat | 'all'>(fromQuery('format', INSIGHTS_FORMATS, 'all'))
const activeTopic = ref<InsightsTopicKey | 'all'>(props.fixedTopic ?? fromQuery('topic', INSIGHTS_TOPIC_KEYS, 'all'))
const activeLocale = ref<InsightsLocale | 'all'>(fromQuery('lang', INSIGHTS_LOCALES, 'all'))
/**
 * Die Sortierung kennt kein „alle" und braucht deshalb ihren eigenen Leser.
 * Gelesen wird gegen die VERFÜGBAREN Werte: `?sort=mostRead` (gesperrt, s.
 * Kopf) fällt auf `newest` zurück, statt eine Sortierung zu wählen, die die
 * Leiste selbst nicht anbietet.
 */
function sortFromQuery(): InsightsSort {
  const raw = route.query.sort
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && (INSIGHTS_SORTS_AVAILABLE as readonly string[]).includes(value)
    ? value as InsightsSort
    : 'newest'
}

const activeSort = ref<InsightsSort>(sortFromQuery())
const display = ref<'grid' | 'list'>(route.query.display === 'list' ? 'list' : 'grid')

/**
 * ZURÜCKSCHREIBEN — `replace` und nicht `push`: ein Filterklick ist keine
 * Station im Verlauf. Sonst müsste man nach fünf Chips fünfmal zurück, um zur
 * vorigen Seite zu kommen.
 *
 * Der Default-Wert wird ENTFERNT statt geschrieben: `/insights` bleibt
 * `/insights` und wird nicht zu `/insights?format=all&topic=all&lang=all`.
 * Zwei Adressen für dieselbe Liste wären zwei Kandidaten in derselben Suche.
 */
function writeQuery(): void {
  /** Was fremde Parameter angeht (z. B. eine Kampagnen-Kennung): sie bleiben. */
  const own = new Set(['format', 'topic', 'lang', 'sort', 'display'])
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (!own.has(key) && typeof value === 'string') query[key] = value
  }
  /** Der Default wird WEGGELASSEN statt geschrieben (s. Kopf). */
  const set = (key: string, value: string, fallback: string) => {
    if (value !== fallback) query[key] = value
  }
  set('format', activeFormat.value, 'all')
  // Auf einer Themen-Seite steht das Thema im PFAD, nicht in der Query — dort
  // wird es also nie geschrieben.
  if (!props.fixedTopic) set('topic', activeTopic.value, 'all')
  set('lang', activeLocale.value, 'all')
  set('sort', activeSort.value, 'newest')
  set('display', display.value, 'grid')
  void router.replace({ query })
}

watch([activeFormat, activeTopic, activeLocale, activeSort, display], writeQuery)

// Wechselt die Themen-Seite (gleiche Komponente, anderer Pfad), zieht das
// feste Thema mit — sonst zeigte `/topics/b` die Liste von `/topics/a`.
watch(() => props.fixedTopic, (topic) => {
  if (topic) activeTopic.value = topic
})

const formatItems = computed(() => [
  { label: t('insights.format.all'), value: 'all' },
  ...INSIGHTS_FORMATS.map(format => ({ label: t(`insights.format.${format}`), value: format })),
])
const localeItems = computed(() => [
  { label: t('insights.list.localeAll'), value: 'all' },
  { label: t('insights.list.localeDe'), value: 'de' },
  { label: t('insights.list.localeEn'), value: 'en' },
])
const sortItems = computed(() => INSIGHTS_SORTS.map(sort => ({
  label: t(`insights.list.sort${sort.charAt(0).toUpperCase()}${sort.slice(1)}`),
  value: sort,
  // Gesperrt statt versteckt (s. Kopf).
  disabled: !INSIGHTS_SORTS_AVAILABLE.includes(sort),
})))

const visible = computed(() => insightsSortPosts(
  insightsFilterPosts(props.posts, {
    format: activeFormat.value,
    topic: activeTopic.value,
    locale: activeLocale.value,
  }),
  activeSort.value,
))
</script>

<template>
  <div>
    <!-- Werkzeugleiste: Themen (Chips) · Format · Sprache · Sortierung · Ansicht -->
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="!fixedTopic">
        <button
          class="bw-select-card rounded-full px-4 py-2 text-sm"
          :class="activeTopic === 'all' ? 'bw-select-card--on' : ''"
          @click="activeTopic = 'all'"
        >{{ t('insights.list.topicAll') }}</button>
        <button
          v-for="topic in INSIGHTS_TOPICS" :key="topic.key"
          class="bw-select-card rounded-full px-4 py-2 text-sm"
          :class="activeTopic === topic.key ? 'bw-select-card--on' : ''"
          @click="activeTopic = activeTopic === topic.key ? 'all' : topic.key"
        >{{ topic.label }}</button>
      </template>

      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <USelect
          v-model="activeFormat" :items="formatItems" value-key="value"
          color="neutral" variant="ghost" class="w-40 justify-between rounded-full text-sm"
          :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)"
          :aria-label="t('insights.format.all')"
        />
        <USelect
          v-model="activeLocale" :items="localeItems" value-key="value"
          color="neutral" variant="ghost" class="w-40 justify-between rounded-full text-sm"
          :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)"
          :aria-label="t('insights.list.localeAll')"
        />
        <USelect
          v-model="activeSort" :items="sortItems" value-key="value"
          color="neutral" variant="ghost" class="w-48 justify-between rounded-full text-sm"
          :ui="{ base: 'px-4 py-2' }" style="background: var(--bw-surface-hi)"
          :aria-label="t('insights.list.sortNewest')"
        />
        <div class="flex items-center gap-1 rounded-full p-1" style="background: var(--bw-surface-hi)">
          <button
            class="grid size-8 place-items-center rounded-full transition-colors"
            :style="display === 'grid' ? 'background: var(--bw-ink); color: var(--bw-paper)' : 'color: var(--bw-muted)'"
            :aria-label="t('insights.list.viewGrid')" @click="display = 'grid'"
          ><UIcon name="i-ph-squares-four" class="size-4" /></button>
          <button
            class="grid size-8 place-items-center rounded-full transition-colors"
            :style="display === 'list' ? 'background: var(--bw-ink); color: var(--bw-paper)' : 'color: var(--bw-muted)'"
            :aria-label="t('insights.list.viewList')" @click="display = 'list'"
          ><UIcon name="i-ph-list-bullets" class="size-4" /></button>
        </div>
      </div>
    </div>

    <p class="bw-label mt-3 flex flex-wrap items-center gap-x-3 gap-y-1" style="color: var(--bw-muted)">
      <span>{{ t('insights.list.count', { count: visible.length }) }}</span>
      <span>{{ t('insights.list.sortMostReadHint') }}</span>
    </p>

    <!-- Leerer Zustand: der Core-Baustein, nie eine leere Fläche. -->
    <CoreEmptyState
      v-if="visible.length === 0"
      class="mt-10"
      icon="i-ph-newspaper"
      :title="t('insights.list.emptyTitle')"
      :description="t('insights.list.emptyDescription')"
    />

    <div v-else-if="display === 'grid'" class="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
      <InPostCard
        v-for="post in visible" :key="post.id"
        :post="post" :locale="locale" :to="localize(post.href)"
        :gradient="post.gradient" display="grid"
      />
    </div>

    <div v-else class="mt-10">
      <InPostCard
        v-for="post in visible" :key="post.id"
        :post="post" :locale="locale" :to="localize(post.href)"
        :gradient="post.gradient" display="list"
      />
    </div>
  </div>
</template>
