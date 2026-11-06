<script setup lang="ts">
import { resolveBrandLegalLinks } from '../../../shared/brandLegalLinks'
import {
  BRAND_CHECK_CACHE_MS,
  BRAND_CHECK_CATEGORIES,
  BRAND_CHECK_CRITERIA,
  BRAND_SCORE_BAND_RANGES,
  brandCheckCriteriaOf,
} from '../../../shared/brandCheck'
import { BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT } from '../../../shared/brandCheckCorrections'
import { BRAND_SITE_ANALYSIS_MAX_TEXT } from '../../../shared/brandSiteAnalysis'
import { brandJsonLdScript } from '../../utils/brandJsonLd'

/**
 * DIE METHODIK-SEITE DES BRAND-SCORES — `/brand-check/methodik`
 * (BS1 Paket R2a, vorgezogen aus BRAND-INSIGHTS §4.2).
 *
 * ── WARUM ES SIE GEBEN MUSS ───────────────────────────────────────────────
 * Der Datenschutz-Abschnitt „Öffentliche Bewertung fremder Marken"
 * (docs/plans/BRANDING-SUPPLY-FAKTENBLATT.md §4c) sagt ZWEIMAL zu, die
 * Methodik sei „öffentlich einsehbar und von jedem Ergebnis aus verlinkt".
 * Solange es diese Seite nicht gab, durfte der Abschnitt nicht live gehen —
 * er hätte den Fehler der drei Fußzeilen-Wörter wiederholt: eine Zusage ohne
 * Ziel. Sie ist zugleich die Antwort auf die Frage, die ein bewerteter
 * Fremder als erstes stellt: „warum dürft ihr uns bewerten?"
 *
 * ── SIE STEHT HINTER KEINEM GATE ──────────────────────────────────────────
 * Kein Konto, kein Produkt-Schalter, kein `noindex` — anders als die
 * Ergebnisseite (die über eine FREMDE Website urteilt und deshalb nicht
 * indexiert wird) soll genau diese Seite gefunden werden. Dieselbe Haltung
 * wie bei `/market-bot`: wer nachschlagen will, warum wir etwas tun, darf
 * nicht auf einem 404 landen.
 *
 * ── KEINE ZAHL WIRD ABGETIPPT ─────────────────────────────────────────────
 * Kriterienzahl, Kategorienzahl, Gewichte, Bandgrenzen, Zeichendeckel,
 * Zwischenspeicher-Frist und Korrektur-Drossel kommen aus den Verträgen
 * (`shared/brandCheck.ts`, `shared/brandSiteAnalysis.ts`,
 * `shared/brandCheckCorrections.ts`). Eine abgetippte Zahl in einer
 * Übersetzungsdatei wäre beim ersten Ändern eine öffentliche Falschaussage
 * über die eigene Rechnung — und zwar die Sorte, die niemand bemerkt, bis
 * sich jemand beschwert. Die Locale-Texte tragen deshalb Platzhalter
 * (`{criteria}`, `{measured}`, `{min}`, …), nie die Ziffern selbst.
 * Genagelt in `tests/brandCheckMethod.test.ts`.
 *
 * ── DER ABSENDER STEHT ALS LITERAL DA, UND DAS IST GEWOLLT ────────────────
 * `BRAND_CHECK_USER_AGENT` lebt in `server/utils/brandSiteFetch.ts`; eine
 * Seite darf dort nicht hineingreifen. Dieselbe Lage wie bei `/market-bot`,
 * dieselbe Lösung: die Zeichenkette steht hier, und der Unit-Test vergleicht
 * sie mit der Konstanten (Tests dürfen `server/` lesen). Weicht sie ab, wird
 * der Test rot, nicht die Seite still falsch.
 *
 * ── DER ROBOTS-ABSATZ WAR EIN BEFUND — SEIT R2b IST ER EINE ZUSAGE ───────
 * Bis zum 2026-09-08 stand hier, dass der Einseiten-Abruf WEDER `robots.txt`
 * NOCH einen Nutzungsvorbehalt auswertet; die Seite nannte das ausdrücklich,
 * weil eine Methodik-Seite, die die unbequeme Hälfte weglässt, das Gegenteil
 * dessen ist, wofür es sie gibt. Mit BS1 R2b (Davids Entscheidung) tut der
 * Check beides — `server/utils/brandCheckFetch.ts`, mit denselben Regeln wie
 * der Marktvergleich (`shared/brandRobots.ts`, `shared/brandTdm.ts`) und einem
 * eigenen Absender. Der Abschnitt sagt jetzt, was gilt, nennt die drei Wege
 * zum Aussperren UND die eine verbliebene Grenze (Wirt-Wechsel per
 * Weiterleitung, eigene Website im Wizard). Eine Zusage ohne ihre Grenze wäre
 * wieder dieselbe Halbwahrheit, nur andersherum.
 *
 * SEO: `useLocaleSeoHead()` läuft einmal in `app.vue` — hier nur Titel,
 * Beschreibung und das JSON-LD.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const appConfig = useAppConfig()

/**
 * DER ABSENDER DES BRAND-CHECKS — wörtlich `BRAND_CHECK_USER_AGENT`
 * (`server/utils/brandSiteFetch.ts`). Er steht in den Zugriffsprotokollen
 * aller Auftritte, die wir lesen; wer dort nachschlägt, soll die Zeile hier
 * wiederfinden. Der Test nagelt beide aneinander.
 *
 * Seit BS1 R2b ist es ein EIGENER Name, nicht mehr der des Wizards: der
 * Betreiber soll den Vorgang, den er verbieten will, benennen können — und
 * „ein Fremder lässt meine Startseite bewerten" ist etwas anderes als „ich
 * trage meine eigene Seite in einen Wizard ein". Die `+`-Adresse zeigt genau
 * hierher.
 */
const USER_AGENT = 'PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)'

/**
 * DIE ROBOTS-ZEILE, mit der man uns aussperrt — der TOKEN-Teil des Absenders,
 * wie ihn `BRAND_CHECK_BOT_TOKEN` erwartet. Wörtlich wie auf `/market-bot`.
 */
const ROBOTS_BLOCK = 'User-agent: PukalaniBrandCheck\nDisallow: /'

/**
 * DIE VIER ANERKANNTEN FORMEN DES NUTZUNGSVORBEHALTS — Schlüssel für die
 * Beschriftung, Beispiel als wörtlicher Code (dasselbe Muster und dieselben
 * vier Formen wie auf `/market-bot`, weil `brandTdmReserved` genau diese
 * vier prüft: `shared/brandTdm.ts`).
 */
const RESERVATION_FORMS = [
  { key: 'header', code: 'TDM-Reservation: 1' },
  { key: 'meta', code: '<meta name="tdm-reservation" content="1">' },
  { key: 'robotsMeta', code: '<meta name="robots" content="noai, noimageai">' },
  { key: 'tdmrep', code: '/.well-known/tdmrep.json\n[{ "location": "/", "tdm-reservation": 1 }]' },
] as const

// ── Die Zahlen, alle aus dem Katalog ───────────────────────────────────────

const criteriaCount = BRAND_CHECK_CRITERIA.length
const categoryCount = BRAND_CHECK_CATEGORIES.length
const measuredCount = BRAND_CHECK_CRITERIA.filter(criterion => criterion.kind === 'measured').length
const judgedCount = criteriaCount - measuredCount
/** Die Summe der Gewichte — 100, aber gerechnet statt behauptet. */
const weightTotal = BRAND_CHECK_CATEGORIES.reduce((sum, category) => sum + category.weight, 0)
const cacheDays = Math.round(BRAND_CHECK_CACHE_MS / 86_400_000)

/**
 * DIE ACHT KATEGORIEN mit Gewicht, Kriterienzahl und je einem Satz. Der NAME
 * kommt aus `brand.check.categories.*` — demselben Schlüssel wie auf der
 * Ergebnisseite und im Ranking (kein zweiter Katalog von Überschriften).
 */
const categories = computed(() => BRAND_CHECK_CATEGORIES.map(category => ({
  key: category.key,
  weight: category.weight,
  count: brandCheckCriteriaOf(category.key).length,
  label: t(`brand.check.categories.${category.key}`),
  body: t(`brand.checkMethod.judge.categories.${category.key}`),
})))

/**
 * DIE SIEBEN BÄNDER mit ihrer Spanne. Die UNTERGRENZE steht in der Tabelle;
 * die Obergrenze eines Bandes ist die Untergrenze seines Vorgängers minus
 * eins — deshalb wird sie hier gerechnet und steht nirgends als Zahl.
 */
const bands = computed(() => BRAND_SCORE_BAND_RANGES.map((range, index) => {
  const previous = BRAND_SCORE_BAND_RANGES[index - 1]
  return {
    key: range.band,
    label: t(`brand.check.bands.${range.band}`),
    // Das schwächste Band hat keine eigene Untergrenze („unter 50"), jedes
    // andere eine Spanne bzw. — das stärkste — eine offene obere Seite.
    range: range.min === 0
      ? t('brand.checkMethod.what.bandUnder', { max: previous ? previous.min : 0 })
      : previous
        ? `${range.min}–${previous.min - 1}`
        : t('brand.checkMethod.what.bandFrom', { min: range.min }),
  }
}))

/** Die öffentliche Kontaktadresse der Site, falls gesetzt (`pukalani.brand.contactEmail`). */
const contactEmail = computed(() => {
  const value = appConfig.pukalani?.brand?.contactEmail
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : ''
})

/** Das Impressum, falls die App eines hat (`pukalani.brand.legalLinks`). */
const imprint = computed(() =>
  resolveBrandLegalLinks(appConfig.pukalani?.brand?.legalLinks).find(link => link.id === 'imprint') ?? null)

const READS = ['l1', 'l2', 'l3', 'l4'] as const
const SKIPS = ['s1', 's2', 's3', 's4'] as const
const NOTS = ['not1', 'not2', 'not3', 'not4'] as const
const LIMITS = ['l1', 'l2', 'l3', 'l4', 'l5'] as const

useSeoMeta({
  title: () => t('brand.checkMethod.seoTitle'),
  description: () => t('brand.checkMethod.seoDescription', { criteria: criteriaCount, categories: categoryCount }),
  ogTitle: () => t('brand.checkMethod.title'),
  ogDescription: () => t('brand.checkMethod.seoDescription', { criteria: criteriaCount, categories: categoryCount }),
})

useHead({
  script: computed(() => [brandJsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('brand.checkMethod.seoTitle'),
    'description': t('brand.checkMethod.seoDescription', { criteria: criteriaCount, categories: categoryCount }),
    'inLanguage': locale.value,
  })]),
})
</script>

<template>
  <div class="pb-24">
    <div class="mx-auto max-w-3xl">
      <!-- 0 · Die Reiter des Instruments -->
      <div class="mt-10">
        <BwBrandCheckTabs current="method" />
      </div>

      <!-- 1 · Wozu diese Seite da ist -->
      <section class="mt-12" data-method-intro>
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('brand.checkMethod.eyebrow') }}
        </p>
        <h1 class="mt-4 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
          {{ t('brand.checkMethod.title') }}
        </h1>
        <p class="mt-6 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.checkMethod.lead') }}
        </p>
        <p class="mt-4 text-sm leading-relaxed" style="color: var(--bw-muted)">
          {{ t('brand.checkMethod.updated') }}
        </p>
      </section>

      <!-- 2 · Was der Score ist — und was nicht -->
      <section class="mt-16" data-method-what>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.what.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.what.body') }}</p>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.what.opinion') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.what.notTitle') }}</h3>
        <ul class="mt-4 space-y-2">
          <li v-for="key in NOTS" :key="key" class="flex gap-3 leading-relaxed" style="color: var(--bw-ink-soft)">
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ t(`brand.checkMethod.what.${key}`) }}
          </li>
        </ul>

        <h3 class="mt-10 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.what.bandsTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.what.bandsLead') }}</p>
        <ul class="bw-card mt-4 divide-y p-0" style="border-color: var(--bw-line)" data-method-bands>
          <li
            v-for="band in bands" :key="band.key"
            class="flex items-baseline justify-between gap-4 px-5 py-3"
            :data-method-band="band.key"
          >
            <span class="tracking-tight">{{ band.label }}</span>
            <span class="bw-label flex-none tabular-nums" style="color: var(--bw-muted)">{{ band.range }}</span>
          </li>
        </ul>
      </section>

      <!-- 3 · Was gelesen wird -->
      <section class="mt-16" data-method-reads>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.reads.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.body') }}</p>
        <ul class="mt-5 space-y-2">
          <li v-for="key in READS" :key="key" class="flex gap-3 leading-relaxed" style="color: var(--bw-ink-soft)">
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>
            {{ t(`brand.checkMethod.reads.${key}`, { chars: BRAND_SITE_ANALYSIS_MAX_TEXT.toLocaleString(locale) }) }}
          </li>
        </ul>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.skipsTitle') }}</h3>
        <ul class="mt-4 space-y-2">
          <li v-for="key in SKIPS" :key="key" class="flex gap-3 leading-relaxed" style="color: var(--bw-ink-soft)">
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ t(`brand.checkMethod.reads.${key}`) }}
          </li>
        </ul>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.keepsTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.keepsBody') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.agentTitle') }}</h3>
        <pre class="bw-card mt-3 overflow-x-auto p-4 text-sm" data-method-agent><code>User-agent: {{ USER_AGENT }}</code></pre>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.robotsTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)" data-method-robots>
          {{ t('brand.checkMethod.reads.robotsBody') }}
        </p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.blockTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.blockBody') }}</p>
        <pre class="bw-card mt-3 overflow-x-auto p-4 text-sm" data-method-block><code>{{ ROBOTS_BLOCK }}</code></pre>

        <h4 class="mt-6 text-lg tracking-tight">{{ t('brand.checkMethod.reads.tdmTitle') }}</h4>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.tdmBody') }}</p>
        <ul class="mt-4 space-y-4" data-method-tdm-forms>
          <li v-for="form in RESERVATION_FORMS" :key="form.key">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t(`brand.checkMethod.reads.form.${form.key}`) }}</p>
            <pre class="bw-card mt-2 overflow-x-auto p-4 text-sm"><code>{{ form.code }}</code></pre>
          </li>
        </ul>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.doubt') }}</p>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.reads.blockContact') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.reads.limitTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)" data-method-robots-limit>
          {{ t('brand.checkMethod.reads.limitBody') }}
        </p>
        <p class="mt-3">
          <ULink :to="localePath('/market-bot')" class="underline underline-offset-4">
            {{ t('brand.checkMethod.reads.botLink') }}
          </ULink>
        </p>
      </section>

      <!-- 4 · Wie bewertet wird -->
      <section class="mt-16" data-method-judge>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.judge.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.checkMethod.judge.body', { criteria: criteriaCount, categories: categoryCount, total: weightTotal }) }}
        </p>

        <ul class="mt-6 space-y-4">
          <li v-for="category in categories" :key="category.key" class="bw-card p-5" :data-method-category="category.key">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 class="text-lg tracking-tight">{{ category.label }}</h3>
              <p class="bw-label flex-none tabular-nums" style="color: var(--bw-muted)">
                {{ t('brand.checkMethod.judge.weight', { weight: category.weight, total: weightTotal }) }}
                ·
                {{ t('brand.checkMethod.judge.criteriaCount', { count: category.count }) }}
              </p>
            </div>
            <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ category.body }}</p>
          </li>
        </ul>

        <h3 class="mt-10 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.judge.splitTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.checkMethod.judge.splitBody', { measured: measuredCount, judged: judgedCount, criteria: criteriaCount }) }}
        </p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.judge.modelTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.judge.modelBody') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.judge.varianceTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.checkMethod.judge.varianceBody', { days: cacheDays }) }}
        </p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.judge.nullTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.judge.nullBody') }}</p>
      </section>

      <!-- 5 · Die zweite Zahl -->
      <section class="mt-16" data-method-maturity>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.maturity.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.maturity.body') }}</p>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('brand.checkMethod.maturity.labelBody', { measured: measuredCount }) }}
        </p>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkMethod.maturity.note') }}</p>
      </section>

      <!-- 6 · Was öffentlich ist, und die zwei Wege zurück -->
      <section class="mt-16" data-method-public>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.public.title') }}</h2>

        <h3 class="mt-6 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.public.privateTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.privateBody') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.public.linkTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.linkBody') }}</p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.public.ownerTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.ownerBody') }}</p>

        <div class="bw-card mt-5 p-5" data-method-correction>
          <h4 class="text-lg tracking-tight">{{ t('brand.checkMethod.public.correctionTitle') }}</h4>
          <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.correctionBody') }}</p>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">
            {{ t('brand.checkMethod.public.correctionLimit', { limit: BRAND_CHECK_CORRECTION_IP_HOUR_LIMIT }) }}
          </p>
        </div>

        <div class="bw-card mt-4 p-5" data-method-removal>
          <h4 class="text-lg tracking-tight">{{ t('brand.checkMethod.public.removalTitle') }}</h4>
          <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.removalBody') }}</p>
        </div>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('brand.checkMethod.public.contactTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkMethod.public.contactBody') }}</p>
        <p v-if="contactEmail" class="mt-3">
          {{ t('brand.checkMethod.public.contactMail') }}
          <a :href="`mailto:${contactEmail}`" class="underline underline-offset-4">{{ contactEmail }}</a>
        </p>
        <p v-if="imprint" class="mt-3">
          <ULink :to="localePath(imprint.to)" class="underline underline-offset-4">
            {{ t('brand.checkMethod.public.imprint') }}
          </ULink>
        </p>
      </section>

      <!-- 7 · Grenzen -->
      <section class="mt-16" data-method-limits>
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('brand.checkMethod.limits.title') }}</h2>
        <ul class="mt-6 space-y-6">
          <li v-for="key in LIMITS" :key="key">
            <h3 class="text-lg font-medium tracking-tight">{{ t(`brand.checkMethod.limits.${key}Title`) }}</h3>
            <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`brand.checkMethod.limits.${key}Body`) }}</p>
          </li>
        </ul>
      </section>

      <!-- 8 · Zurück ins Instrument -->
      <section class="mt-16 flex flex-wrap gap-3">
        <UButton
          :label="t('brand.checkMethod.back.check')" :to="localePath('/brand-check')"
          size="lg" color="neutral" class="rounded-full"
        />
        <UButton
          :label="t('brand.checkMethod.back.ranking')" :to="localePath('/brand-check/ranking')"
          size="lg" color="neutral" variant="ghost" class="rounded-full"
        />
      </section>
    </div>
  </div>
</template>
