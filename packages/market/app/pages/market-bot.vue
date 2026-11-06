<script setup lang="ts">
import {
  MARKET_BLOCKED_PATH_SEGMENTS,
  MARKET_MAX_BYTES_PER_PAGE,
  MARKET_MAX_CHARS_PER_PAGE,
  MARKET_MAX_PAGES,
} from '../../shared/marketCrawlRules'
import { MARKET_EVIDENCE_MAX } from '../../shared/marketProfile'
import { MARKET_RAW_TTL_MS } from '../../shared/marketRetention'

/**
 * DIE ERKLÄRSEITE DES ABRUF-BOTS (Plan §2.9 Nr. 1; MV1 M5).
 *
 * ── WARUM ES SIE GEBEN MUSS ───────────────────────────────────────────────
 * Der Absender jedes Abrufs lautet
 * `PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)`
 * (`BRAND_MARKET_USER_AGENT`). Diese Adresse steht damit im Zugriffs-Protokoll
 * JEDES fremden Servers, den wir lesen. Ein Betreiber, der dort nachschlägt,
 * darf nicht auf einem 404 landen — die Klammer im User-Agent ist eine Zusage,
 * und eine Zusage ohne Seite dahinter ist schlimmer als keine Klammer.
 *
 * ── SIE STEHT NICHT HINTER DEM PRODUKT-GATE, UND DAS IST ABSICHT ─────────
 * `apps/branding` führt `pukalani.market.enabled` auf `false`, bis die
 * Prod-Migrationen gelaufen sind; die Seite „Markt" antwortet dann 404 und
 * jede `/api/market`-Route ebenso. Diese Seite tut das NICHT. Der Grund ist
 * die Reihenfolge in der Wirklichkeit: sobald ein einziger Lauf passiert ist —
 * lokal, in einem Test, in einer Beta —, steht der Name in einem fremden Log,
 * und der wird nicht mit unserem Schalter zurückgenommen. Eine Erklärseite,
 * die nur solange existiert, wie das Produkt eingeschaltet ist, wäre genau
 * dann weg, wenn jemand sie am dringendsten sucht (nach dem Abschalten, mit
 * einer Frage zu einem Zugriff von letzter Woche).
 *
 * ── KEIN MARKETING ────────────────────────────────────────────────────────
 * Auftrag wörtlich. Kein CTA, kein Preis, kein Verweis auf den Wizard. Die
 * Leserin ist nicht unsere Kundin, sondern jemand, dessen Server wir gelesen
 * haben; was sie braucht, sind vier Auskünfte: was wir lesen, was wir nicht
 * lesen, wie lange wir es behalten und wie sie uns aussperrt. In dieser
 * Reihenfolge steht die Seite.
 *
 * ── DIE ZAHLEN KOMMEN AUS DEM VERTRAG, NICHT AUS DEM TEXT ────────────────
 * Seitenzahl, Zeichen- und Byte-Deckel, Zitatschranke, Frist und die
 * Pfad-Sperrliste werden aus `shared/marketCrawlRules.ts`,
 * `shared/marketProfile.ts` und `shared/marketRetention.ts` gelesen. Eine
 * abgetippte Zahl in einer Übersetzungsdatei wäre beim ersten Ändern eine
 * öffentliche Falschaussage über unser eigenes Verhalten — und zwar die eine
 * Sorte, die man erst bemerkt, wenn sich jemand beschwert.
 *
 * ── DIE CODE-BEISPIELE STEHEN IM MARKUP, NICHT IN DEN LOCALES ────────────
 * `robots.txt`- und Meta-Syntax ist sprachunabhängig — und Locale-Messages
 * dürfen in diesem Repo KEINE spitzen Klammern tragen (CLAUDE.md, am
 * 2026-08-04 live erwischt: der Nachrichten-Compiler hält sie für HTML und
 * steigt auf dem CLIENT aus, SSR rendert noch übersetzt, im Browser stehen
 * rohe Schlüssel).
 *
 * SEO: `useLocaleSeoHead()` läuft einmal in `app.vue` — hier nur Titel und
 * Beschreibung.
 */
const { t } = useI18n()

useSeoMeta({
  title: () => t('marketBot.seoTitle'),
  description: () => t('marketBot.seoDescription'),
  ogTitle: () => t('marketBot.title'),
  ogDescription: () => t('marketBot.seoDescription'),
})

const USER_AGENT = 'PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)'
const CONTACT = 'hello@branding.supply'

/** Die Frist in Stunden — die Zahl selbst kommt aus dem Vertrag. */
const ttlHours = Math.round(MARKET_RAW_TTL_MS / 3_600_000)

/**
 * Die Sperrliste als lesbare Zeile. Sie ist lang (über sechzig Segmente) und
 * gehört trotzdem vollständig auf die Seite: „wir lesen keine Kontaktseiten"
 * ist eine Behauptung, die Liste ist der Beleg.
 */
const blockedSegments = MARKET_BLOCKED_PATH_SEGMENTS.join(' · ')

/**
 * DIE VIER ANERKANNTEN FORMEN DES NUTZUNGSVORBEHALTS (§2.9 Nr. 1) — Schlüssel
 * für die Beschriftung, Beispiel als wörtlicher Code.
 *
 * Sie stehen als DATEN und nicht als vier `<pre>`-Blöcke im Markup, damit die
 * Liste an einer Stelle wächst, wenn eine fünfte Form üblich wird — und weil
 * `marketTdmReserved` genau diese vier prüft (`shared/marketCrawlRules.ts`).
 */
const RESERVATION_FORMS = [
  { key: 'header', code: 'TDM-Reservation: 1' },
  { key: 'meta', code: '<meta name="tdm-reservation" content="1">' },
  { key: 'robotsMeta', code: '<meta name="robots" content="noai, noimageai">' },
  { key: 'tdmrep', code: '/.well-known/tdmrep.json\n[{ "location": "/", "tdm-reservation": 1 }]' },
] as const
</script>

<template>
  <div class="pb-24">
    <div class="mx-auto max-w-3xl">
      <!-- 1 · Wer hier gelesen hat -->
      <section class="mt-14">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
          {{ t('marketBot.eyebrow') }}
        </p>
        <h1 class="mt-4 text-balance text-4xl font-extralight leading-tight tracking-tight sm:text-5xl">
          {{ t('marketBot.title') }}
        </h1>
        <p class="mt-6 text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.lead') }}
        </p>
        <pre class="bw-card mt-6 overflow-x-auto p-4 text-sm"><code>User-agent: {{ USER_AGENT }}</code></pre>
      </section>

      <!-- 2 · Was gelesen wird -->
      <section class="mt-16">
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('marketBot.reads.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.reads.body') }}
        </p>
        <ul class="mt-5 space-y-2">
          <li
            v-for="item in [
              t('marketBot.reads.pages', { max: MARKET_MAX_PAGES }),
              t('marketBot.reads.size', { chars: MARKET_MAX_CHARS_PER_PAGE.toLocaleString(), mb: Math.round(MARKET_MAX_BYTES_PER_PAGE / 1_000_000) }),
              t('marketBot.reads.noJs'),
              t('marketBot.reads.sequential'),
            ]"
            :key="item"
            class="flex gap-3 leading-relaxed"
          >
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ item }}
          </li>
        </ul>
      </section>

      <!-- 3 · Was NICHT gelesen wird -->
      <section class="mt-16">
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('marketBot.skips.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.skips.body') }}
        </p>
        <p class="bw-card mt-5 overflow-x-auto p-4 font-mono text-xs leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ blockedSegments }}
        </p>
        <p class="mt-4 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.skips.pii') }}
        </p>
      </section>

      <!-- 4 · Was mit dem Gelesenen passiert -->
      <section class="mt-16">
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('marketBot.keeps.title') }}</h2>
        <ul class="mt-5 space-y-2">
          <li
            v-for="item in [
              t('marketBot.keeps.ttl', { hours: ttlHours }),
              t('marketBot.keeps.quote', { max: MARKET_EVIDENCE_MAX }),
              t('marketBot.keeps.noRanking'),
              t('marketBot.keeps.noClaim'),
              t('marketBot.keeps.noTraining'),
            ]"
            :key="item"
            class="flex gap-3 leading-relaxed"
          >
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ item }}
          </li>
        </ul>
      </section>

      <!-- 5 · Wie man den Bot aussperrt -->
      <section class="mt-16">
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('marketBot.optOut.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.optOut.body') }}
        </p>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('marketBot.optOut.robotsTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('marketBot.optOut.robotsBody') }}</p>
        <pre class="bw-card mt-3 overflow-x-auto p-4 text-sm"><code>User-agent: PukalaniMarketBot
Disallow: /</code></pre>

        <h3 class="mt-8 text-lg font-medium tracking-tight">{{ t('marketBot.optOut.tdmTitle') }}</h3>
        <p class="mt-2 leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('marketBot.optOut.tdmBody') }}</p>
        <ul class="mt-4 space-y-4">
          <li v-for="form in RESERVATION_FORMS" :key="form.key">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t(`marketBot.optOut.form.${form.key}`) }}</p>
            <pre class="bw-card mt-2 overflow-x-auto p-4 text-sm"><code>{{ form.code }}</code></pre>
          </li>
        </ul>
        <p class="mt-6 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.optOut.doubt') }}
        </p>
      </section>

      <!-- 6 · Kontakt -->
      <section class="mt-16">
        <h2 class="text-2xl font-extralight tracking-tight">{{ t('marketBot.contact.title') }}</h2>
        <p class="mt-3 leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t('marketBot.contact.body') }}
        </p>
        <p class="mt-3">
          <ULink :to="`mailto:${CONTACT}`" class="underline underline-offset-4">{{ CONTACT }}</ULink>
        </p>
      </section>
    </div>
  </div>
</template>
