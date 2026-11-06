<script setup lang="ts">
import {
  brandCheckCompareLeader,
  compareBrandCheckInsights,
  compareBrandChecks,
} from '../../../shared/brandCheckCompare'
import { brandCheckCategoryScores } from '../../../shared/brandCheck'
import type {
  BrandCheckResult,
  BrandCheckRankingItem,
  BrandCheckRankingResponse,
} from '../../../shared/types/brand'

/**
 * DER VERGLEICH — `/brand-check/vergleich?a=…&b=…`
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §4 und §10, Paket P4).
 *
 * Zwei Checks als Quartett-Karten: Kopf links/rechts, ein Markenabdruck mit
 * beiden Serien übereinander, acht Kategorie-Zeilen gegeneinander, ein Fazit.
 * Die Seite RECHNET nur eines selbst — den Vergleich —, und auch den nicht
 * hier, sondern in `shared/brandCheckCompare.ts`.
 *
 * ── DIE AUSWAHL STEHT IN DER ADRESSZEILE ──────────────────────────────────
 * `?a=` und `?b=` sind die einzige Wahrheit über die Ansicht, wie beim Ranking:
 * ein Vergleich ist etwas, das man weiterschickt. „Tauschen" schreibt nur die
 * Adresse um; dass dadurch niemand gewinnt, ist eine zugesicherte Eigenschaft
 * der puren Regel (Symmetrie-Test).
 *
 * ── `noindex`, ANDERS ALS DAS RANKING ─────────────────────────────────────
 * Die Kombinationen sind unendlich (n²) — eine Suchmaschine soll davon keine
 * Seiten sammeln. Trotzdem SSR: der geteilte Link muss sofort Inhalt zeigen.
 *
 * ── DIE AUSWAHL-LISTE IST BEWUSST NUR DAS RANKING ─────────────────────────
 * Angeboten werden ausschliesslich Auftritte, deren Prüfer das Häkchen gesetzt
 * hat (Opt-in, §8.1). Ein privater Check bleibt vergleichbar — aber nur, wer
 * seinen LINK hat, kann ihn eintragen. Eine Suche über alle Checks wäre die
 * Hintertür um genau dieses Häkchen herum.
 *
 * ── WARUM DIE LISTE MEHRERE SEITEN HOLT ───────────────────────────────────
 * `/api/brand/check/ranking` liefert 25 Zeilen je Seite; eine Suche über 25
 * Hosts wäre keine Suche. Die Auswahl holt deshalb beim ÖFFNEN bis zu
 * `PICKER_PAGES` Seiten (die Antwort ist server-seitig 60 s microgecacht, kostet
 * also keine KI und kaum Last) und sucht darin im Browser. Was jenseits davon
 * liegt, erreicht man über das Ranking selbst — dort gibt es Filter.
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const request = useRequestFetch()

/** Wie viele Ranking-Seiten die Auswahl höchstens lädt (s. Kopf). */
const PICKER_PAGES = 4

function queryValue(raw: unknown): string {
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : ''
  return typeof raw === 'string' ? raw : ''
}

const idA = computed(() => queryValue(route.query.a))
const idB = computed(() => queryValue(route.query.b))

// ── Die beiden Checks ──────────────────────────────────────────────────────

/** Ein 404 ist ein ZUSTAND, kein Fehler — derselbe Umgang wie auf der Ergebnisseite. */
async function loadCheck(id: string): Promise<BrandCheckResult | null> {
  if (!id) return null
  try {
    return await request<BrandCheckResult>(`/api/brand/check/${encodeURIComponent(id)}`)
  }
  catch {
    return null
  }
}

const { data: pair, status: loadStatus } = await useAsyncData(
  'brand-check-compare',
  async () => {
    const [a, b] = await Promise.all([loadCheck(idA.value), loadCheck(idB.value)])
    return { a, b }
  },
  { watch: [idA, idB] },
)

const checkA = computed<BrandCheckResult | null>(() => pair.value?.a ?? null)
const checkB = computed<BrandCheckResult | null>(() => pair.value?.b ?? null)

/** Angefragt, aber nicht da — nur dann ist die Leermeldung die Wahrheit. */
const missingA = computed(() => !!idA.value && !checkA.value && loadStatus.value !== 'pending')
const missingB = computed(() => !!idB.value && !checkB.value && loadStatus.value !== 'pending')
const anyMissing = computed(() => missingA.value || missingB.value)

useSeoMeta({
  title: () => (checkA.value && checkB.value
    ? t('brand.checkCompare.seoTitle', { a: checkA.value.host, b: checkB.value.host })
    : t('brand.checkCompare.seoTitleEmpty')),
  robots: 'noindex, nofollow',
})

// ── Der Vergleich ──────────────────────────────────────────────────────────

const comparison = computed(() => compareBrandChecks(checkA.value, checkB.value))
const bothThere = computed(() => !!checkA.value && !!checkB.value)
const leader = computed(() => brandCheckCompareLeader(comparison.value.summary))

/**
 * Die Erkenntnisse unter dem Fazit (P6b). Die Reihenfolge kommt aus der puren
 * Regel — die Seite reicht sie nur durch und sortiert nichts nach.
 */
const insights = computed(() => compareBrandCheckInsights(checkA.value, checkB.value))

/** Die acht Werte einer Seite in Katalog-Reihenfolge — die Serie des Abdrucks. */
function seriesValues(side: 'a' | 'b'): (number | null)[] {
  return comparison.value.rows.map(row => row[side])
}

const fingerprintSeries = computed(() => {
  const series: { values: (number | null)[], color: 'accent' | 'pop' | 'ink', label?: string }[] = []
  if (checkA.value) series.push({ values: seriesValues('a'), color: 'accent', label: checkA.value.host })
  if (checkB.value) series.push({ values: seriesValues('b'), color: 'pop', label: checkB.value.host })
  return series
})

/**
 * Der Balken einer Zeile. Der Wert IST der Prozentsatz (0–100) — er kommt aus
 * derselben Normalisierung wie das Ranking, also braucht ihn niemand noch
 * einmal umzurechnen. `null` ergibt eine leere Hälfte, keine Null-Länge-Lüge.
 */
function barWidth(value: number | null): string {
  return typeof value === 'number' ? `${Math.max(0, Math.min(100, value))}%` : '0%'
}

/** Gewinner in voller Farbe, Verlierer gedämpft, Gleichstand beide neutral. */
function barTone(winner: string, side: 'a' | 'b'): string {
  if (winner === 'na') return 'var(--bw-line)'
  if (winner === 'tie') return 'var(--bw-line-strong)'
  const own = side === 'a' ? 'var(--bw-accent)' : 'var(--bw-pop)'
  return winner === side ? own : 'var(--bw-line-strong)'
}

function barOpacity(winner: string, side: 'a' | 'b'): string {
  if (winner === 'na' || winner === 'tie') return '1'
  return winner === side ? '1' : '0.55'
}

function categoryLabel(key: string): string {
  const messageKey = `brand.check.categories.${key}`
  return te(messageKey) ? t(messageKey) : key
}

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
  dateStyle: 'long',
  // Ohne feste Zone rechnete der Server anders als der Browser (Hydration).
  timeZone: 'UTC',
}))
function formatDate(value: string | undefined): string {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

// ── Tauschen ───────────────────────────────────────────────────────────────

const canSwap = computed(() => !!idA.value || !!idB.value)

function swap(): void {
  const next: Record<string, string> = {}
  if (idB.value) next.a = idB.value
  if (idA.value) next.b = idA.value
  router.replace({ query: next })
}

function setSide(side: 'a' | 'b', id: string): void {
  const next: Record<string, string> = {}
  const a = side === 'a' ? id : idA.value
  const b = side === 'b' ? id : idB.value
  if (a) next.a = a
  if (b) next.b = b
  router.replace({ query: next })
}

// ── Die Auswahl aus dem Ranking ────────────────────────────────────────────

const pickerOpen = ref(false)
const pickerSide = ref<'a' | 'b'>('a')
const pickerSearch = ref('')
const pickerItems = ref<BrandCheckRankingItem[]>([])
const pickerStatus = ref<'idle' | 'pending' | 'ready' | 'error'>('idle')

function openPicker(side: 'a' | 'b'): void {
  pickerSide.value = side
  pickerSearch.value = ''
  pickerOpen.value = true
  void loadPicker()
}

async function loadPicker(): Promise<void> {
  if (pickerStatus.value === 'ready' || pickerStatus.value === 'pending') return
  pickerStatus.value = 'pending'
  try {
    const first = await $fetch<BrandCheckRankingResponse>('/api/brand/check/ranking', { query: { page: 1 } })
    const pageSize = first.pageSize || 25
    const pages = Math.min(PICKER_PAGES, Math.max(1, Math.ceil(first.total / pageSize)))
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_unused, index) =>
        $fetch<BrandCheckRankingResponse>('/api/brand/check/ranking', { query: { page: index + 2 } })),
    )
    pickerItems.value = [first, ...rest].flatMap(response => response.items)
    pickerStatus.value = 'ready'
  }
  catch {
    pickerStatus.value = 'error'
  }
}

/** Suche im HOST, nicht im ganzen Eintrag: das ist der Name, den man tippt. */
const pickerResults = computed<BrandCheckRankingItem[]>(() => {
  const needle = pickerSearch.value.trim().toLowerCase()
  const taken = pickerSide.value === 'a' ? idB.value : idA.value
  return pickerItems.value
    .filter(item => item.id !== taken)
    .filter(item => !needle || item.host.toLowerCase().includes(needle))
})

function choose(item: BrandCheckRankingItem): void {
  setSide(pickerSide.value, item.id)
  pickerOpen.value = false
}

// ── Der Erklär-Zustand: eine Vorschau des Abdrucks ─────────────────────────

/**
 * Ohne `a` und `b` gibt es nichts zu zeichnen — und ein leeres Netz ist eine
 * bessere Erklärung als ein Bild, das es nicht gibt. Die Werte sind
 * ausdrücklich NULL, nicht erfunden: eine Beispielmarke mit hübschen Zahlen
 * wäre auf einer Seite über echte Auftritte eine Behauptung.
 */
const emptySeries = computed(() => [{
  values: comparison.value.rows.map(() => null),
  color: 'ink' as const,
}])

/** Der Score einer Seite — die Kategorie-Werte stehen schon im Vergleich. */
function categoryCount(check: BrandCheckResult | null): number {
  return check ? brandCheckCategoryScores(check.categories).filter(entry => entry.score !== null).length : 0
}
</script>

<template>
  <div class="pb-10">
    <div class="mx-auto mt-10 max-w-5xl">
      <div class="mb-8">
        <BwBrandCheckTabs current="compare" />
      </div>

      <header class="mx-auto max-w-3xl text-center" data-compare-head>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkCompare.eyebrow') }}</p>
        <h1 class="mt-3 text-balance text-4xl font-extralight tracking-tight sm:text-5xl">{{ t('brand.checkCompare.title') }}</h1>
        <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkCompare.lead') }}</p>
      </header>

      <!-- Ein angefragter Check, den es nicht gibt: sagen, nicht verschweigen -->
      <div v-if="anyMissing" class="bw-card mt-10 p-8 text-center" data-compare-missing>
        <span class="mx-auto grid size-12 place-items-center rounded-full" style="background: var(--bw-surface-hi)">
          <UIcon name="i-ph-link-break" class="size-5" style="color: var(--bw-muted)" />
        </span>
        <h2 class="mt-5 text-balance text-2xl font-extralight tracking-tight">{{ t('brand.checkCompare.missingTitle') }}</h2>
        <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkCompare.missingText') }}</p>
        <div class="mt-6">
          <UButton
            :label="t('brand.checkCompare.missingCta')" :to="localePath('/brand-check/ranking')"
            size="lg" color="neutral" class="rounded-full"
          />
        </div>
      </div>

      <!-- 1 · Die zwei Karten -->
      <section class="mt-10 grid gap-6 md:grid-cols-2" data-compare-cards>
        <article
          v-for="side in (['a', 'b'] as const)" :key="side" class="bw-card p-8"
          :data-compare-card="side"
        >
          <div class="flex items-center gap-2">
            <span
              class="size-2.5 rounded-full"
              :style="`background: ${side === 'a' ? 'var(--bw-accent)' : 'var(--bw-pop)'}`"
            />
            <span class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
              {{ t(`brand.checkCompare.side${side === 'a' ? 'A' : 'B'}`) }}
            </span>
          </div>

          <template v-if="side === 'a' ? checkA : checkB">
            <div class="mt-5 flex flex-wrap items-center gap-6">
              <BwScoreRing :value="(side === 'a' ? checkA : checkB)!.score" :size="88" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xl font-extralight tracking-tight">{{ (side === 'a' ? checkA : checkB)!.host }}</p>
                <div class="mt-2">
                  <BwScorePill
                    :value="(side === 'a' ? checkA : checkB)!.score"
                    :band="(side === 'a' ? checkA : checkB)!.band"
                  />
                </div>
                <p class="bw-label mt-2" style="color: var(--bw-muted)">
                  {{ t('brand.checkCompare.stand', { date: formatDate((side === 'a' ? checkA : checkB)!.createdAt) }) }}
                </p>
              </div>
            </div>
            <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <UButton
                :label="t('brand.checkCompare.open')"
                :to="localePath(`/brand-check/${(side === 'a' ? checkA : checkB)!.id}`)"
                size="sm" color="neutral" variant="ghost" class="rounded-full"
              />
              <UButton
                :label="t('brand.checkCompare.pick')" icon="i-ph-arrows-clockwise"
                size="sm" color="neutral" variant="ghost" class="rounded-full"
                :data-compare-pick="side" @click="openPicker(side)"
              />
            </div>
          </template>

          <!-- Leerer Platz: er zeigt, was fehlt, und wie man es füllt -->
          <template v-else>
            <p class="mt-5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkCompare.slotEmpty') }}</p>
            <div class="mt-6">
              <UButton
                :label="t('brand.checkCompare.pick')" icon="i-ph-magnifying-glass"
                color="neutral" class="rounded-full"
                :data-compare-pick="side" @click="openPicker(side)"
              />
            </div>
          </template>
        </article>
      </section>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-4" data-compare-actions>
        <UButton
          :label="t('brand.checkCompare.swap')" icon="i-ph-arrows-left-right"
          :disabled="!canSwap" color="neutral" variant="ghost" class="rounded-full"
          data-compare-swap @click="swap"
        />
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.checkCompare.pickHint') }}</p>
      </div>

      <!-- 2 · Der Markenabdruck -->
      <section class="bw-card mt-10 p-8 sm:p-10" data-compare-fingerprint>
        <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 class="text-2xl font-extralight tracking-tight sm:text-3xl">{{ t('brand.fingerprint.title') }}</h2>
          <ul v-if="fingerprintSeries.length" class="flex flex-wrap items-center gap-4">
            <li v-for="(series, index) in fingerprintSeries" :key="`legend-${index}`" class="flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                :style="`background: ${series.color === 'accent' ? 'var(--bw-accent)' : 'var(--bw-pop)'}`"
              />
              <span class="bw-label" style="color: var(--bw-ink-soft)">{{ series.label }}</span>
            </li>
          </ul>
        </div>
        <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.fingerprint.lead') }}</p>
        <div class="mt-8 flex justify-center">
          <BwBrandFingerprint
            :series="fingerprintSeries.length ? fingerprintSeries : emptySeries"
            :size="380"
          />
        </div>
      </section>

      <!-- 3 · Acht Zeilen gegeneinander -->
      <section class="bw-card mt-6 p-8 sm:p-10" data-compare-rows>
        <h2 class="text-2xl font-extralight tracking-tight sm:text-3xl">{{ t('brand.checkCompare.rowsTitle') }}</h2>
        <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkCompare.rowsLead') }}</p>

        <ul class="mt-8 space-y-5">
          <li v-for="row in comparison.rows" :key="row.id" :data-compare-row="row.id">
            <p class="text-center text-sm font-medium tracking-tight">{{ categoryLabel(row.id) }}</p>
            <div class="mt-2 flex items-center gap-3">
              <span class="w-14 flex-none text-right tabular-nums text-sm" style="color: var(--bw-ink-soft)">
                <span v-if="row.a !== null">{{ row.a }}</span>
                <span v-else class="bw-label inline-flex items-center gap-1" style="color: var(--bw-muted)">
                  <UIcon name="i-ph-lock-simple" class="size-3" />{{ t('brand.checkCompare.notAssessable') }}
                </span>
              </span>

              <span class="flex min-w-0 flex-1 items-center gap-1">
                <span class="flex h-2 flex-1 justify-end overflow-hidden rounded-full" style="background: var(--bw-line)">
                  <span
                    class="h-full rounded-full"
                    :style="`inline-size: ${barWidth(row.a)}; background: ${barTone(row.winner, 'a')}; opacity: ${barOpacity(row.winner, 'a')}`"
                  />
                </span>
                <span class="flex h-2 flex-1 overflow-hidden rounded-full" style="background: var(--bw-line)">
                  <span
                    class="h-full rounded-full"
                    :style="`inline-size: ${barWidth(row.b)}; background: ${barTone(row.winner, 'b')}; opacity: ${barOpacity(row.winner, 'b')}`"
                  />
                </span>
              </span>

              <span class="w-14 flex-none tabular-nums text-sm" style="color: var(--bw-ink-soft)">
                <span v-if="row.b !== null">{{ row.b }}</span>
                <span v-else class="bw-label inline-flex items-center gap-1" style="color: var(--bw-muted)">
                  <UIcon name="i-ph-lock-simple" class="size-3" />{{ t('brand.checkCompare.notAssessable') }}
                </span>
              </span>
            </div>
          </li>
        </ul>

        <p class="bw-label mt-6 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkCompare.notAssessableHint') }}</p>
      </section>

      <!-- 4 · Das Fazit -->
      <section v-if="bothThere" class="bw-card mt-6 p-8 sm:p-10" data-compare-summary>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkCompare.summary.eyebrow') }}</p>
        <h2 class="mt-3 text-balance text-2xl font-extralight leading-snug tracking-tight sm:text-3xl" data-compare-verdict>
          <template v-if="leader === 'tie'">{{ t('brand.checkCompare.summary.tie') }}</template>
          <template v-else>
            {{ t('brand.checkCompare.summary.leader', { host: (leader === 'a' ? checkA : checkB)!.host }) }}
          </template>
        </h2>
        <ul class="mt-6 space-y-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          <li>{{ t('brand.checkCompare.summary.wins', { host: checkA!.host, count: comparison.summary.aWins }, comparison.summary.aWins) }}</li>
          <li>{{ t('brand.checkCompare.summary.wins', { host: checkB!.host, count: comparison.summary.bWins }, comparison.summary.bWins) }}</li>
          <li>{{ t('brand.checkCompare.summary.ties', { count: comparison.summary.ties }, comparison.summary.ties) }}</li>
          <li v-if="comparison.summary.notAssessable > 0">
            {{ t('brand.checkCompare.summary.notAssessable', { count: comparison.summary.notAssessable }, comparison.summary.notAssessable) }}
          </li>
        </ul>
        <p class="bw-label mt-6 leading-relaxed" style="color: var(--bw-muted)">
          {{ t('brand.checkCompare.summary.basis', {
            a: categoryCount(checkA), b: categoryCount(checkB),
          }) }}
        </p>
      </section>

      <!-- Ohne Auswahl: erklären statt leer bleiben -->
      <section v-else class="bw-card mt-6 p-8 text-center sm:p-10" data-compare-choose>
        <h2 class="text-balance text-2xl font-extralight tracking-tight">{{ t('brand.checkCompare.chooseTitle') }}</h2>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkCompare.chooseText') }}</p>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <UButton
            :label="t('brand.checkCompare.chooseA')" color="neutral" class="rounded-full"
            data-compare-choose-a @click="openPicker('a')"
          />
          <UButton
            :label="t('brand.checkCompare.chooseB')" color="neutral" variant="outline" class="rounded-full"
            data-compare-choose-b @click="openPicker('b')"
          />
        </div>
      </section>

      <!-- 5 · Die Erkenntnisse (P6b) — das Bento unter dem Fazit -->
      <BwBrandCompareInsights
        v-if="bothThere && insights.length"
        :a="checkA!" :b="checkB!" :insights="insights"
      />
    </div>

    <!-- Die Auswahl aus dem Ranking -->
    <UModal v-model:open="pickerOpen" :title="t('brand.checkCompare.pickTitle')" :description="t('brand.checkCompare.pickLead')">
      <template #body>
        <div data-compare-picker>
          <UInput
            v-model="pickerSearch" icon="i-ph-magnifying-glass" class="w-full"
            :placeholder="t('brand.checkCompare.pickSearch')"
            :aria-label="t('brand.checkCompare.pickSearch')"
            data-compare-picker-search
          />

          <p v-if="pickerStatus === 'pending'" class="mt-6 text-center text-sm" style="color: var(--bw-muted)">
            {{ t('brand.checkCompare.pickLoading') }}
          </p>
          <p v-else-if="pickerStatus === 'error'" class="mt-6 text-center text-sm" style="color: var(--bw-muted)">
            {{ t('brand.checkCompare.pickFailed') }}
          </p>
          <template v-else>
            <ul v-if="pickerResults.length" class="mt-4 max-h-80 space-y-1 overflow-y-auto">
              <li v-for="item in pickerResults" :key="item.id">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bw-line)]"
                  :data-compare-picker-item="item.id"
                  @click="choose(item)"
                >
                  <span class="min-w-0 truncate text-sm font-medium tracking-tight">{{ item.host }}</span>
                  <BwScorePill :value="item.score" :band="item.band" />
                </button>
              </li>
            </ul>
            <p v-else class="mt-6 text-center text-sm" style="color: var(--bw-muted)" data-compare-picker-empty>
              {{ t('brand.checkCompare.pickEmpty') }}
            </p>
            <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">
              {{ t('brand.checkCompare.pickCount', { count: pickerItems.length }, pickerItems.length) }}
            </p>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
