<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES, brandCheckCategoryScores, brandCheckCriteriaOf, brandScoreBand } from '../../../shared/brandCheck'
import {
  type BrandCheckImprovementEntry,
  brandCheckFacts,
  brandCheckHeadlineFindings,
  brandCheckImprovementPlan,
} from '../../../shared/brandCheckInsights'
import type { BrandCheckCriterionResult, BrandCheckResult } from '../../../shared/types/brand'

/**
 * DIE ERGEBNISSEITE DES BRAND-CHECKS — `/brand-check/<id>`
 * (Konzept: docs/archiv/BRAND-CHECK.md §4, Fassung v2 nach
 * docs/archiv/BRAND-CHECK-SEITE.md §10).
 *
 * ── DREI ZOOMSTUFEN DERSELBEN DATEN, IN DIESER REIHENFOLGE ────────────────
 *  1. **Score = Urteil.** Der Ring, das Band, die Herkunft — dazu das Delta
 *     zum Vorgänger („↑ +7 seit dem 12. August") und der Platz im Ranking.
 *  2. **Das Fazit als Bento.** Acht Karten, die die 40 Kriterien auf das
 *     eindampfen, was ein Mensch mitnimmt: Stärke · Chance · nächster Schritt,
 *     stärkste und schwächste Kategorie, Abdeckung, Branche, Herkunft.
 *  3. **Markenabdruck = Profil**, darunter die acht Kategorie-Karten in
 *     eigener Section, alle offen mit ihren fünf Kriterien (Davids Zuschnitt
 *     2026-09-06: kein Auf-/Zuklappen).
 *  4. **Ampel-Matrix = Diagnose** (8 × 5, vier Zustände).
 *  5. **Der Plan** — jedes Kriterium unter der vollen Punktzahl, sortiert nach
 *     dem, was es am Gesamtwert ausmacht, mit „+X Punkte" je Zeile.
 *  6. Der Weg weiter (Relaunch, Report per Mail).
 *
 * Die alte Balken-Liste und die zugeklappte 40er-Liste sind ERSETZT: Matrix
 * und Plan sagen dasselbe vollständiger und ohne Klick ins Nichts.
 *
 * ── SIE RECHNET NICHTS, SIE FRAGT ─────────────────────────────────────────
 * Score, Bänder, Punkte, Vorgänger und Rangplatz kommen fertig vom Server;
 * „+X Punkte", die Rangfolge des Plans und die Fakten kommen aus den PUREN
 * Regeln in `shared/brandCheckInsights.ts`. In dieser Datei steht Darstellung
 * und sonst nichts — jede Zahl hier hat einen Test dort.
 *
 * ── ÖFFENTLICH UND TEILBAR, ABER NICHT INDIZIERT ──────────────────────────
 * Kein Auth-Guard: der Check läuft ohne Konto, und ein Link, den man nicht
 * weiterschicken kann, ist kein Ergebnis. Deshalb SSR (der geteilte Link zeigt
 * sofort Inhalt) und `noindex, nofollow`: das Urteil über eine FREMDE Website
 * gehört nicht in eine Suchmaschine, solange die Badge-Frage offen ist (§6).
 *
 * ── DAS DATUM RECHNET IN UTC ──────────────────────────────────────────────
 * Server und Browser stehen in verschiedenen Zeitzonen; ohne feste Zone
 * lieferte dieselbe Zeichenkette zweimal ein anderes Ergebnis und die
 * Hydration bräche. Das Datum ist tagesgenau — die Zone ist hier kein Verlust.
 * Aus demselben Grund steht auf dieser Seite kein `Date.now()` und kein
 * `Math.random()`: was der Server rendert, muss der Browser wiederholen können.
 *
 * ── DER WEG INS WIZARD-KAPITEL IST BEWUSST EIN RELAUNCH-KNOPF ─────────────
 * Ein Kapitel-Link braucht eine BRAND (`/brand/<profileId>/<kapitel>`), und
 * ein öffentliches Ergebnis hat keine — es gehört niemandem. Die Karte nennt
 * das Kapitel deshalb beim Namen und führt in den Relaunch, wo die Brand
 * entsteht. Ein Link auf eine erfundene Id wäre eine 404 mit Anlauf.
 *
 * ── DER REPORT IST EHRLICH EIN VORAB-EINTRAG ──────────────────────────────
 * Der REPORT als Dokument kommt in Phase 2 — das Formular sagt genau das und
 * trägt `source: 'brand-check'` samt der geprüften Adresse.
 */
definePageMeta({ layout: 'default' })

const { t, te, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const request = useRequestFetch()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()

const id = computed(() => String(route.params.id ?? ''))

/**
 * Ein 404 ist hier kein Fehler, sondern ein Zustand: ein alter oder ein
 * getippter Link. `null` heisst „gibt es nicht (mehr)", die Seite zeigt dann
 * ihre ruhige Leerseite statt einer roten Fehlermeldung.
 */
const { data: result, status: loadStatus } = await useAsyncData<BrandCheckResult | null>(
  'brand-check',
  async () => {
    if (!id.value) return null
    try {
      return await request<BrandCheckResult>(`/api/brand/check/${encodeURIComponent(id.value)}`)
    }
    catch {
      return null
    }
  },
  { watch: [id] },
)

const host = computed(() => result.value?.host ?? '')

useSeoMeta({
  title: () => (host.value ? t('brand.check.result.seoTitle', { host: host.value }) : t('brand.check.result.seoTitleEmpty')),
  robots: 'noindex, nofollow',
})

// ── Die drei Auswertungen (pur, aus shared/brandCheckInsights.ts) ──────────

const facts = computed(() => (result.value ? brandCheckFacts(result.value) : null))
const headline = computed(() => (result.value ? brandCheckHeadlineFindings(result.value) : null))
const plan = computed(() => (result.value ? brandCheckImprovementPlan(result.value) : null))

/**
 * Die drei Befunde und die zwei Kategorie-Auszeichnungen liegen als EIGENE
 * Werte da und nicht als Pfad ins Ergebnis: eine Karte fällt weg, wenn ihr
 * Inhalt fehlt (`v-if`), und ein `facts?.strongest?.score` im Markup wäre drei
 * Fragezeichen für eine Zahl.
 */
const strength = computed(() => headline.value?.strength ?? null)
const opportunity = computed(() => headline.value?.opportunity ?? null)
const nextStep = computed(() => headline.value?.nextStep ?? null)
const strongest = computed(() => facts.value?.strongest ?? null)
const weakest = computed(() => facts.value?.weakest ?? null)

/** Die acht Kategorie-Werte 0–100 — dieselbe Umrechnung wie im Ranking. */
const categoryScores = computed(() => {
  const map = new Map<string, number | null>()
  for (const entry of brandCheckCategoryScores(result.value?.categories ?? [])) map.set(entry.id, entry.score)
  return map
})

interface CategoryCard {
  key: string
  label: string
  score: number | null
  weight: number
  criteria: BrandCheckCriterionResult[]
}

/**
 * Iteriert wird über den KATALOG, nicht über die Antwort: acht Karten sind
 * acht Karten, auch wenn eine gespeicherte Zeile aus einer älteren Fassung
 * stammt. Fehlt eine Kategorie dort, steht sie als „nicht bewertbar" da.
 */
const categoryCards = computed<CategoryCard[]>(() => {
  const check = result.value
  if (!check) return []
  return BRAND_CHECK_CATEGORIES.map(category => ({
    key: category.key,
    label: categoryLabel(category.key),
    score: categoryScores.value.get(category.key) ?? null,
    weight: category.weight,
    criteria: brandCheckCriteriaOf(category.key)
      .map(criterion => check.criteria.find(entry => entry.id === criterion.id))
      .filter((entry): entry is BrandCheckCriterionResult => !!entry),
  }))
})

/** Eine Serie = ein Markenabdruck (die zweite hat der Vergleich, P4). */
const fingerprintSeries = computed(() => [{
  values: BRAND_CHECK_CATEGORIES.map(category => categoryScores.value.get(category.key) ?? null),
  color: 'accent' as const,
}])

// ── Delta und Rang ─────────────────────────────────────────────────────────

const delta = computed(() => {
  const check = result.value
  if (!check?.previous) return null
  const diff = check.score - check.previous.score
  return { diff, date: formatDate(check.previous.createdAt), id: check.previous.id }
})

const deltaTone = computed(() => {
  const diff = delta.value?.diff ?? 0
  if (diff > 0) return 'var(--bw-accent)'
  if (diff < 0) return 'var(--bw-stale)'
  return 'var(--bw-muted)'
})

const deltaLabel = computed(() => {
  const value = delta.value
  if (!value) return ''
  if (value.diff > 0) return t('brand.checkResult.deltaUp', { points: value.diff, date: value.date })
  if (value.diff < 0) return t('brand.checkResult.deltaDown', { points: Math.abs(value.diff), date: value.date })
  return t('brand.checkResult.deltaSame', { date: value.date })
})

// ── Anzeige-Helfer ─────────────────────────────────────────────────────────

/** Wie überall im Layer in UTC — sonst bricht die Hydration. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date)
}

/** Titel und nächster Schritt eines Kriteriums — mit Rückfall, falls der
 *  Katalog dem Server einmal voraus ist (ein roher Schlüssel im Text wäre
 *  schlimmer als ein neutraler Satz). */
function criterionTitle(criterionId: string): string {
  const key = `brand.check.criteria.${criterionId}.title`
  return te(key) ? t(key) : t('brand.check.result.criterionFallback')
}
function criterionNext(criterionId: string): string {
  const key = `brand.check.criteria.${criterionId}.next`
  return te(key) ? t(key) : t('brand.check.result.nextFallback')
}
function categoryLabel(key: string): string {
  const messageKey = `brand.check.categories.${key}`
  return te(messageKey) ? t(messageKey) : key
}
function chapterLabel(stepKey: string): string {
  const key = `brand.steps.${stepKey}`
  return te(key) ? t(key) : stepKey
}
function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return te(key) ? t(key) : t('brand.industry.unknown')
}

/** Das Band-WORT zu einem Kategorie-Wert — dieselben sieben wie beim Score. */
function bandWord(score: number | null): string {
  return score === null ? t('brand.check.result.notAssessable') : t(`brand.check.bands.${brandScoreBand(score)}`)
}

/**
 * „+3 Punkte" — und bei einem Zugewinn unter einem halben Punkt der ehrliche
 * Satz statt einer aufgerundeten 1 (Begründung in `brandCheckScoreGain`).
 */
function gainLabel(gain: number): string {
  return gain > 0 ? t('brand.checkResult.gain', { points: gain }) : t('brand.checkResult.gainNone')
}

function criterionScoreLabel(criterion: BrandCheckCriterionResult): string {
  return criterion.score === null
    ? t('brand.check.result.notAssessable')
    : t('brand.check.result.criterionPoints', { score: criterion.score })
}

/** Die Ampel-Farbe eines gespeicherten Kriteriums — dieselbe wie in der Matrix. */
function criterionTone(score: 0 | 1 | 2 | null): string {
  if (score === 2) return 'var(--bw-accent)'
  if (score === 1) return 'var(--bw-draft)'
  if (score === 0) return 'var(--bw-stale)'
  return 'var(--bw-line-strong)'
}

// ── Zustand der Seite ──────────────────────────────────────────────────────

/** Ab dem achten Eintrag hinter einem Knopf: alle sind da, aber nicht alle
 *  auf einmal (Davids Auftrag: „gerne mehr als drei", kein Deckel). */
const PLAN_PREVIEW = 7
const showAllPlan = ref(false)
const planEntries = computed<BrandCheckImprovementEntry[]>(() => plan.value?.entries ?? [])
const visiblePlan = computed(() => (showAllPlan.value ? planEntries.value : planEntries.value.slice(0, PLAN_PREVIEW)))

/** Die Zeile, auf die eine Matrix-Zelle gezeigt hat. */
const highlighted = ref('')

/**
 * Klick auf eine Matrix-Zelle ⇒ zur Zeile im Plan. Kriterien mit voller
 * Punktzahl und Schlösser stehen dort NICHT (sie sind kein Vorhaben) — dann
 * passiert bewusst nichts, statt irgendwohin zu springen.
 */
function focusCriterion(criterionId: string): void {
  if (!planEntries.value.some(entry => entry.key === criterionId)) return
  if (!visiblePlan.value.some(entry => entry.key === criterionId)) showAllPlan.value = true
  highlighted.value = criterionId
  void nextTick(() => {
    document.getElementById(`plan-${criterionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

/** Eingeloggt in die Anlage mit vorgewähltem Pfad, sonst auf /invite —
 *  dieselbe Weiche wie auf der Startseite. */
const relaunchTarget = computed(() => (isLoggedIn.value
  ? localePath({ path: '/dashboard/brands/new', query: { path: 'relaunch' } })
  : localePath('/invite')))

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.add({ title: t('brand.check.result.copied'), duration: 2000 })
  }
  catch {
    toast.add({ title: t('brand.check.result.copyFailed'), duration: 2000, color: 'warning' })
  }
}

/** Das Bento-Raster: `UPageGrid` gibt 1 · 2 · 3 Spalten vor (wie im Vergleich,
 *  P4); die Karte mit Zitat darf breiter stehen. */
const CARD_UI = {
  root: 'bw-card',
  container: 'p-6 sm:p-7',
  title: 'text-base font-medium tracking-tight',
} as const
</script>

<template>
  <div class="pb-10">
    <div class="mx-auto mt-10 max-w-5xl">
      <!-- Die Reiter des Instruments: „Start" ist hier zugleich der Rückweg
           auf `/brand-check` (die Seite mit dem Formular). -->
      <div class="mb-8">
        <BwBrandCheckTabs current="start" />
      </div>

      <!-- Solange geladen wird, steht noch nichts fest — kein Urteil, keine
           Leermeldung, nur die Ansage, dass geholt wird. -->
      <div v-if="loadStatus === 'pending'" class="bw-card p-10 text-center" data-check-loading>
        <UIcon name="i-ph-circle-notch" class="mx-auto size-6 animate-spin" style="color: var(--bw-muted)" />
        <p class="mt-4 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.check.result.loading') }}</p>
      </div>

      <!-- Es gibt ihn nicht (mehr): ruhig, mit einem Weg zurück. -->
      <div v-else-if="!result" class="bw-card p-10 text-center" data-check-missing>
        <span class="mx-auto grid size-12 place-items-center rounded-full" style="background: var(--bw-surface-hi)">
          <UIcon name="i-ph-link-break" class="size-5" style="color: var(--bw-muted)" />
        </span>
        <h1 class="mt-6 text-balance text-3xl font-extralight tracking-tight">{{ t('brand.check.result.missingTitle') }}</h1>
        <p class="mx-auto mt-4 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.check.result.missingText') }}</p>
        <div class="mt-8">
          <!-- Zurück zum FORMULAR, nicht zur Startseite: dort steht der Check
               seit dem Teaser-Umbau nicht mehr (Plan §1). -->
          <UButton :label="t('brand.check.result.missingCta')" :to="localePath('/brand-check')" size="lg" color="neutral" class="rounded-full" />
        </div>
      </div>

      <template v-else>
        <!-- 1 · Score-Kopf: Urteil, Delta, Rang -->
        <section class="bw-card p-10 sm:p-12" data-check-head>
          <div class="flex flex-wrap items-center gap-8">
            <BwScoreRing :value="result.score" :size="132" />
            <!-- `basis-72` statt nur `flex-1`: ohne eine Grundbreite schrumpft die
                 Textspalte auf einem Telefon neben dem Ring zusammen, statt unter
                 ihn zu rutschen — die Überschrift stünde dann Wort für Wort. -->
            <div class="min-w-0 flex-1 basis-72">
              <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ result.source === 'document' ? t('brand.check.document.eyebrow') : t('brand.check.result.eyebrow') }}</p>
              <h1 class="mt-3 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
                {{ t(`brand.check.bands.${result.band}`) }}
              </h1>
              <BwBrandScoreSource :result="result" class="mt-3" />

              <!-- Delta und Rang stehen NEBEN dem Urteil, nicht darin: beide
                   sind Zugaben und dürfen fehlen (die Antwort liefert `null`,
                   wenn es keinen Vorgänger bzw. keinen Platz gibt). -->
              <div v-if="delta || result.rank" class="mt-4 flex flex-wrap items-center gap-2">
                <span
                  v-if="delta"
                  class="bw-label inline-flex items-center gap-1.5 rounded-full px-3 py-1"
                  style="background: var(--bw-surface-hi)"
                  data-check-delta
                >
                  <UIcon
                    :name="delta.diff > 0 ? 'i-ph-arrow-up' : delta.diff < 0 ? 'i-ph-arrow-down' : 'i-ph-equals'"
                    class="size-3.5 flex-none" :style="`color: ${deltaTone}`"
                  />
                  <span :style="`color: ${deltaTone}`">{{ deltaLabel }}</span>
                </span>
                <span
                  v-if="result.rank"
                  class="bw-label inline-flex items-center gap-1.5 rounded-full px-3 py-1"
                  style="background: var(--bw-surface-hi); color: var(--bw-ink-soft)"
                  data-check-rank
                >
                  <UIcon name="i-ph-trophy" class="size-3.5 flex-none" style="color: var(--bw-muted)" />
                  {{ t('brand.checkResult.rank', { position: result.rank.position, total: result.rank.total }) }}
                </span>
              </div>
            </div>
          </div>
          <p class="mt-8 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.check.result.maturity') }}</p>
          <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <UButton
              icon="i-ph-link-simple" size="sm" color="neutral" variant="ghost" class="rounded-full"
              :label="t('brand.check.result.copy')" data-check-copy @click="copyLink"
            />
            <!-- Vergleichen (P4): dieser Check als linke Seite, die rechte
                 wählt man dort aus dem Ranking. -->
            <UButton
              icon="i-ph-columns" size="sm" color="neutral" variant="ghost" class="rounded-full"
              :label="t('brand.checkCompare.fromResult')"
              :to="localePath({ path: '/brand-check/vergleich', query: { a: result.id } })"
              data-check-compare
            />
            <!-- „So rechnen wir" (BS1 R2a): das Faktenblatt §4c sagt zu, die
                 Methodik sei VON JEDEM ERGEBNIS AUS verlinkt. Der Reiter oben
                 erfüllt das schon; dieser Knopf steht trotzdem hier, weil die
                 Frage „wie kommt ihr auf diese Zahl?" beim Wert entsteht und
                 nicht in der Kopfleiste. -->
            <UButton
              icon="i-ph-scales" size="sm" color="neutral" variant="ghost" class="rounded-full"
              :label="t('brand.checkMethod.title')"
              :to="localePath('/brand-check/methodik')"
              data-check-method
            />
          </div>
        </section>

        <!-- 2 · Das Fazit als Bento -->
        <section class="mt-10" data-check-verdict>
          <h2 class="px-2 text-2xl font-extralight tracking-tight sm:text-3xl">{{ t('brand.checkResult.verdictTitle') }}</h2>
          <p class="bw-label mt-2 max-w-2xl px-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkResult.verdictLead') }}</p>

          <UPageGrid class="mt-6">
            <!-- Größte Stärke — nur MIT Beleg (ein Lob ohne Grund wäre das
                 „gefühlt", gegen das der ganze Check gebaut ist). -->
            <UPageCard
              v-if="strength"
              variant="ghost" :ui="CARD_UI" class="sm:col-span-2 lg:col-span-1"
              :title="t('brand.checkResult.strengthTitle')"
              data-verdict-strength
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">{{ criterionTitle(strength.key) }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">{{ categoryLabel(strength.category) }}</p>
              <blockquote
                class="bw-frame p-4 text-sm leading-relaxed"
                style="background: var(--bw-surface-hi); color: var(--bw-ink-soft)"
              >
                {{ strength.evidence }}
              </blockquote>
            </UPageCard>

            <!-- Größte Chance — die eine hervorgehobene Karte. Der Ring kommt
                 aus den Token (wie `.bw-chip--selected`) statt aus dem
                 Nuxt-UI-Highlight: die Seite hat EINE Akzentfarbe. -->
            <UPageCard
              v-if="opportunity"
              variant="ghost"
              :ui="CARD_UI"
              class="sm:col-span-2 lg:col-span-1"
              style="box-shadow: inset 0 0 0 1.5px var(--bw-accent)"
              :title="t('brand.checkResult.opportunityTitle')"
              data-verdict-opportunity
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">{{ criterionTitle(opportunity.key) }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">{{ categoryLabel(opportunity.category) }}</p>
              <p class="bw-num text-2xl" style="color: var(--bw-accent)">{{ gainLabel(opportunity.gain) }}</p>
            </UPageCard>

            <!-- Nächster Schritt: das Kapitel beim Namen, der Weg in den
                 Relaunch (s. Kopf — ein Kapitel-Link braucht eine Brand). -->
            <UPageCard
              v-if="nextStep"
              variant="ghost" :ui="CARD_UI" class="sm:col-span-2 lg:col-span-1"
              :title="t('brand.checkResult.nextStepTitle')"
              data-verdict-next
            >
              <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ criterionNext(nextStep.key) }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ nextStep.wizardStep
                  ? t('brand.checkResult.nextStepChapter', { chapter: chapterLabel(nextStep.wizardStep) })
                  : t('brand.checkResult.nextStepPlain') }}
              </p>
              <div>
                <UButton
                  :label="t('brand.checkResult.nextStepCta')" :to="relaunchTarget" size="sm"
                  color="neutral" class="rounded-full" data-verdict-next-cta
                />
              </div>
            </UPageCard>

            <!-- Stärkste und schwächste Kategorie -->
            <UPageCard
              v-if="strongest"
              variant="ghost" :ui="CARD_UI"
              :title="t('brand.checkResult.strongestTitle')"
              data-verdict-strongest
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">{{ categoryLabel(strongest.key) }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ t('brand.checkResult.categoryValue', { score: strongest.score }) }} · {{ bandWord(strongest.score) }}
              </p>
            </UPageCard>

            <UPageCard
              v-if="weakest"
              variant="ghost" :ui="CARD_UI"
              :title="t('brand.checkResult.weakestTitle')"
              data-verdict-weakest
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">{{ categoryLabel(weakest.key) }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ t('brand.checkResult.categoryValue', { score: weakest.score }) }} · {{ bandWord(weakest.score) }}
              </p>
            </UPageCard>

            <!-- Abdeckung: was wir angesehen haben — und was nicht. -->
            <UPageCard
              v-if="facts"
              variant="ghost" :ui="CARD_UI"
              :title="t('brand.checkResult.coverageTitle')"
              data-verdict-coverage
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">
                {{ t('brand.checkResult.coverageValue', { assessed: facts.assessed, total: facts.total }) }}
              </p>
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ facts.notAssessable > 0
                  ? t('brand.checkResult.coverageLocked', { count: facts.notAssessable })
                  : t('brand.checkResult.coverageComplete') }}
              </p>
              <p class="bw-label" style="color: var(--bw-muted)">
                {{ t('brand.checkResult.coverageGrades', { full: facts.full, partial: facts.partial, none: facts.none }) }}
              </p>
            </UPageCard>

            <!-- Branche — mit dem Korrekturweg genau dort, wo die Angabe steht. -->
            <UPageCard
              v-if="facts"
              variant="ghost" :ui="CARD_UI"
              :title="t('brand.checkResult.industryTitle')"
              data-verdict-industry
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">{{ industryLabel(facts.industry) }}</p>
              <div>
                <BwBrandCheckCorrectionForm :check-id="result.id" :current="result.industry" />
              </div>
            </UPageCard>

            <!-- Quelle und Stand -->
            <UPageCard
              v-if="facts"
              variant="ghost" :ui="CARD_UI"
              :title="t('brand.checkResult.sourceTitle')"
              data-verdict-source
            >
              <p class="text-pretty text-lg font-extralight leading-snug tracking-tight">
                {{ result.source === 'document' ? t('brand.checkResult.sourceDocument') : t('brand.checkResult.sourceWebsite') }}
              </p>
              <p class="bw-label break-words" style="color: var(--bw-muted)">
                <!-- Eine FREMDE Adresse: kein Empfehlungssignal, kein Referrer. -->
                <a v-if="result.url" :href="result.url" target="_blank" rel="noopener nofollow" class="underline underline-offset-4">{{ result.url }}</a>
                <template v-else>{{ result.host }}</template>
              </p>
              <p class="bw-label" style="color: var(--bw-muted)">{{ formatDate(result.createdAt) }}</p>
            </UPageCard>
          </UPageGrid>
        </section>

        <!-- 3 · Markenabdruck -->
        <section class="bw-card mt-10 grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-5" data-check-profile>
          <div class="lg:col-span-2">
            <h2 class="text-xl font-extralight tracking-tight">{{ t('brand.fingerprint.title') }}</h2>
            <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.fingerprint.lead') }}</p>
          </div>
          <div class="flex justify-center lg:col-span-3">
            <BwBrandFingerprint :series="fingerprintSeries" :size="360" />
          </div>
        </section>

        <!-- 3b · Die acht Kategorien — eigene Section, alle Karten OFFEN. Davids
             Zuschnitt (2026-09-06): kein Auf-/Zuklappen; wer die Kriterien einer
             Kategorie sehen will, soll nicht klicken müssen. -->
        <section class="mt-10" data-check-categories-section>
          <h2 class="px-2 text-xl font-extralight tracking-tight">{{ t('brand.check.result.categoriesTitle') }}</h2>
          <p class="bw-label mt-2 px-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkResult.categoriesLead') }}</p>
          <ul class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-check-categories>
            <li v-for="card in categoryCards" :key="card.key" class="bw-card flex flex-col p-5" :data-category-card="card.key">
              <div class="flex items-start justify-between gap-3">
                <span class="min-w-0">
                  <span class="block text-sm font-medium tracking-tight">{{ card.label }}</span>
                  <span class="bw-label mt-1 block" style="color: var(--bw-muted)">
                    {{ bandWord(card.score) }} · {{ t('brand.checkResult.categoryWeight', { weight: card.weight }) }}
                  </span>
                </span>
                <span class="bw-num flex-none text-xl">{{ card.score === null ? '—' : card.score }}</span>
              </div>

              <p v-if="card.score === null" class="bw-label mt-3 flex items-start gap-1.5 leading-relaxed" style="color: var(--bw-muted)">
                <UIcon name="i-ph-lock-simple" class="mt-0.5 size-3.5 flex-none" />
                {{ t('brand.check.result.locked') }}
              </p>

              <ul class="mt-4 space-y-2 border-t pt-4" style="border-color: var(--bw-line)" :data-category-criteria="card.key">
                <li v-for="criterion in card.criteria" :key="criterion.id" class="flex items-start gap-2.5">
                  <span class="mt-1.5 size-2 flex-none rounded-full" :style="`background: ${criterionTone(criterion.score)}`" />
                  <span class="min-w-0">
                    <span class="block text-sm leading-snug">{{ criterionTitle(criterion.id) }}</span>
                    <span class="bw-label" style="color: var(--bw-muted)">{{ criterionScoreLabel(criterion) }}</span>
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <!-- 4 · Die Ampel-Matrix -->
        <section class="bw-card mt-10 p-8 sm:p-10">
          <h2 class="text-2xl font-extralight tracking-tight sm:text-3xl">{{ t('brand.checkResult.matrixTitle') }}</h2>
          <p class="bw-label mt-2 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkResult.matrixLead') }}</p>
          <div class="mt-8">
            <BwBrandCheckMatrix :criteria="result.criteria" @select="focusCriterion" />
          </div>
        </section>

        <!-- 5 · Der Plan -->
        <section class="mt-10" data-check-plan>
          <h2 class="px-2 text-2xl font-extralight tracking-tight sm:text-3xl">{{ t('brand.checkResult.planTitle') }}</h2>
          <p class="bw-label mt-2 max-w-2xl px-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkResult.planLead') }}</p>
          <p v-if="plan && planEntries.length" class="mt-3 px-2 text-sm font-medium" style="color: var(--bw-accent)" data-plan-total>
            {{ t('brand.checkResult.planTotal', { points: plan.totalGain }) }}
          </p>

          <p v-if="!planEntries.length" class="bw-card mt-6 p-8 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.checkResult.planEmpty') }}
          </p>

          <ol v-else class="mt-6 space-y-3">
            <li
              v-for="(entry, index) in visiblePlan"
              :id="`plan-${entry.key}`"
              :key="entry.key"
              class="bw-card p-6"
              :style="highlighted === entry.key ? 'box-shadow: inset 0 0 0 1.5px var(--bw-accent)' : ''"
              :data-plan-entry="entry.key"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p class="min-w-0 font-medium tracking-tight">
                  <span class="bw-num mr-2" style="color: var(--bw-muted)">{{ index + 1 }}</span>
                  {{ criterionTitle(entry.key) }}
                </p>
                <p class="bw-num flex-none text-lg" style="color: var(--bw-accent)">{{ gainLabel(entry.gain) }}</p>
              </div>
              <p class="bw-label mt-1 flex flex-wrap items-center gap-2" style="color: var(--bw-muted)">
                <span class="size-2 flex-none rounded-full" :style="`background: ${criterionTone(entry.score)}`" />
                {{ categoryLabel(entry.category) }} · {{ t('brand.check.result.criterionPoints', { score: entry.score }) }}
              </p>
              <blockquote
                v-if="entry.evidence"
                class="bw-frame mt-4 p-4 text-sm leading-relaxed"
                style="background: var(--bw-surface-hi); color: var(--bw-ink-soft)"
              >
                {{ entry.evidence }}
              </blockquote>
              <p v-if="entry.note" class="bw-label mt-3 leading-relaxed" style="color: var(--bw-muted)">{{ entry.note }}</p>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ criterionNext(entry.key) }}</p>
              <p v-if="entry.wizardStep" class="bw-label mt-3" style="color: var(--bw-muted)">
                {{ t('brand.checkResult.planChapter', { chapter: chapterLabel(entry.wizardStep) }) }}
              </p>
            </li>
          </ol>

          <div v-if="planEntries.length > PLAN_PREVIEW" class="mt-6 px-2">
            <UButton
              size="sm" color="neutral" variant="ghost" class="rounded-full"
              :icon="showAllPlan ? 'i-ph-caret-up' : 'i-ph-caret-down'"
              :label="showAllPlan ? t('brand.checkResult.planShowLess') : t('brand.checkResult.planShowAll', { count: planEntries.length })"
              data-plan-toggle
              @click="showAllPlan = !showAllPlan"
            />
          </div>
        </section>

        <!-- 6 · Der Weg weiter -->
        <section class="bw-card mt-10 grid items-start gap-10 p-10 sm:p-12 lg:grid-cols-2" data-check-next>
          <div class="min-w-0">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.check.result.relaunchEyebrow') }}</p>
            <h2 class="mt-3 text-balance text-2xl font-extralight leading-snug tracking-tight sm:text-3xl">{{ t('brand.check.result.relaunchTitle') }}</h2>
            <p class="mt-4 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.check.result.relaunchBody') }}</p>
            <div class="mt-6">
              <UButton
                :label="t('brand.check.result.relaunchCta')" :to="relaunchTarget" size="lg"
                color="neutral" class="rounded-full" data-check-relaunch
              />
            </div>
          </div>
          <div class="min-w-0">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.check.result.reportEyebrow') }}</p>
            <h2 class="mt-3 text-balance text-2xl font-extralight leading-snug tracking-tight sm:text-3xl">{{ t('brand.check.result.reportTitle') }}</h2>
            <p class="mt-4 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.check.result.reportBody') }}</p>
            <div class="mt-6">
              <BwWaitlistForm source="brand-check" :website="result.url" />
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
