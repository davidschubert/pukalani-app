<script setup lang="ts">
/**
 * VERGLEICHSTABELLE UNTER DEN KARTEN (U10, Wettbewerb E4 + Muster M5).
 *
 * „Karten für die Entscheidung, Tabelle für den Zweifler": alle fünf
 * Benchmark-Preisseiten (Vercel, Framer, Webflow, Notion, Linear) und alle
 * Wettbewerber legen unter die Karten eine Merkmals-Tabelle. Pukalani hatte
 * nur Karten mit Fließtext — `plans.personal.desc` ist EIN Satz mit sieben
 * Merkmalen darin. Wer zwischen 29 € und 149 € schwankt, will die Zeile
 * „Eigene Domain" mit einem Häkchen sehen, keinen Absatz.
 *
 * ── JEDE ZEILE HAT EINE QUELLE IM CODE, KEINE IST ERFUNDEN ────────────────
 * Autorität ist `pukalani.tenancy.products` in apps/platform/app/app.config.ts
 * (Produkt-Key → Mindest-Plan; durchgesetzt von `requirePlanProduct` an den
 * API-Einstiegen, angezeigt über `useTenantPlan().planAllows()`) plus
 * `pukalani.tenancy.quota.plans` für die zwei Mengen-Zeilen. Was dort NICHT
 * gelistet ist, ist laut dem Kommentar über jener Tabelle „Basic = frei" —
 * daher die ✓/✓-Zeilen oben. Die Herkunft steht je Zeile in `ROWS`.
 *
 * ES IST EINE ABSCHRIFT, UND DAS IST BEWUSST: `marketing` erbt die
 * platform-Config nicht (eigene App, eigener extends-Zweig), und ein
 * Laufzeit-Abruf für eine öffentliche Landing-Seite wäre ein Server-Aufruf für
 * Text, der sich zweimal im Jahr ändert. Wer eine Zeile in `tenancy.products`
 * verschiebt, ändert sie HIER mit — dieselbe bewusste Doppelpflege wie bei
 * `customDomain: 'pro'` ⇄ `CUSTOM_DOMAIN_MIN_PLAN`.
 *
 * ── WARUM KEINE DRITTE SPALTE FÜR ENTERPRISE ──────────────────────────────
 * Enterprise/Studio ist kein Plan-Key und kein Selbstbedienungs-Kauf (P4);
 * die Spalte trüge in jeder Zeile dieselbe Auskunft („nach Absprache") und
 * machte aus zwei vergleichbaren Angeboten drei unvergleichbare. Die
 * Studio-Karte bleibt deshalb die eigene, liegende Karte darüber.
 *
 * ── WARUM EINE GEBAUTE TABELLE UND KEIN `UTable` ──────────────────────────
 * `UTable` ist der Standard für DATENLISTEN im Dashboard (B6) — Sortierung,
 * Auswahl, Paginierung. Nichts davon ist hier erwünscht: das ist Marketing-
 * Text in zwei Spalten. Die Breite fängt `overflow-x-auto` ab.
 */
const { t, n } = useI18n()

/**
 * `personal`/`pro`: `true` = enthalten, `false` = nicht enthalten, `number` =
 * Menge (wird lokalisiert formatiert). `source` ist der Nachweis und wandert
 * NICHT in die Anzeige — er steht hier, damit der nächste Leser jede Zeile
 * prüfen kann, ohne zu raten.
 */
interface CompareRow {
  key: string
  personal: boolean | number
  pro: boolean | number
  source: string
}

const ROWS: readonly CompareRow[] = [
  { key: 'discussions', personal: true, pro: true, source: 'nicht in tenancy.products ⇒ Basic = frei (comments, moderation)' },
  { key: 'pages', personal: true, pro: true, source: 'nicht in tenancy.products ⇒ Basic = frei (pages)' },
  { key: 'themes', personal: true, pro: true, source: 'nicht in tenancy.products ⇒ Basic = frei (themes-Katalog)' },
  { key: 'activity', personal: true, pro: true, source: 'tenancy.products.activity = basic' },
  { key: 'posts', personal: true, pro: true, source: 'tenancy.products.posts = personal' },
  { key: 'media', personal: true, pro: true, source: 'tenancy.products.media = personal' },
  { key: 'analytics', personal: true, pro: true, source: 'tenancy.products.analytics = personal' },
  { key: 'messages', personal: true, pro: true, source: 'tenancy.products.messages = personal' },
  { key: 'events', personal: false, pro: true, source: 'tenancy.products.events = pro' },
  { key: 'courses', personal: false, pro: true, source: 'tenancy.products.courses = pro' },
  { key: 'ai', personal: false, pro: true, source: 'tenancy.products.ai = pro' },
  /**
   * BEWUSST in beiden Plänen: das Gate der translate-Routen ist das jeweilige
   * INHALTS-Produkt, nicht 'ai' (Davids Entscheidung 2026-08-17) — wer den
   * Inhalt hat, kann ihn übersetzen. In Personal betrifft das Diskussionen,
   * Kommentare und den Feed; Events und Kurse übersetzen dort mit, wo sie
   * enthalten sind (Pro).
   */
  { key: 'translations', personal: true, pro: true, source: 'translate-Routen gaten auf das Inhalts-Produkt (posts/comments/events/courses), nicht auf ai' },
  /**
   * Die Zeile, um die es U13 ging (Davids Entscheidung 2026-08-10: bleibt
   * Pro-only). Sie steht hier ohne Beschönigung — sie ist das stärkste
   * Verkaufsargument von Pro UND die härteste Sperre im Vergleichsfeld;
   * beides zu verschweigen wäre das Schlechteste von beidem.
   */
  { key: 'customDomain', personal: false, pro: true, source: 'tenancy.products.customDomain = pro ⇄ CUSTOM_DOMAIN_MIN_PLAN' },
  { key: 'commentsPerDay', personal: 1000, pro: 5000, source: 'tenancy.quota.plans.{personal,pro}.comments.perDay' },
  { key: 'mediaFiles', personal: 300, pro: 1000, source: 'tenancy.quota.plans.{personal,pro}.media.total' },
]

/** Formatiert IM computed, nicht in `ROWS`: die Zahlengruppierung hängt an
 *  der Sprache (1.000 ⇄ 1,000), und ein einmal berechnetes Modul-Literal
 *  bliebe beim Sprachwechsel stehen. */
const rows = computed(() => ROWS.map(row => ({
  key: row.key,
  label: t(`marketing.pricing.compare.rows.${row.key}`),
  cells: (['personal', 'pro'] as const).map(plan => ({
    plan,
    included: typeof row[plan] === 'boolean' ? row[plan] : null,
    amount: typeof row[plan] === 'number' ? n(row[plan]) : '',
  })),
})))
</script>

<template>
  <div class="mkt-inner" data-reveal>
    <div class="compare-head">
      <h3 class="compare-title">{{ t('marketing.pricing.compare.title') }}</h3>
      <p class="mkt-lead">{{ t('marketing.pricing.compare.description') }}</p>
    </div>

    <!-- Die Tabelle scrollt IN IHREM EIGENEN Kasten. Der Seitenkörper darf nie
         waagerecht scrollen — auf dem Telefon sind zwei Plan-Spalten neben
         einer Merkmalsspalte genau die Stelle, an der er es sonst tut. -->
    <div class="compare-scroll">
      <table class="compare">
        <caption class="sr-only">{{ t('marketing.pricing.compare.title') }}</caption>
        <thead>
          <tr class="border-b border-default">
            <th scope="col" class="text-highlighted">{{ t('marketing.pricing.compare.feature') }}</th>
            <th scope="col" class="text-highlighted">{{ t('marketing.pricing.plans.personal.name') }}</th>
            <th scope="col" class="text-highlighted">{{ t('marketing.pricing.plans.pro.name') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" class="border-b border-default last:border-b-0">
            <th scope="row" class="font-normal text-toned">{{ row.label }}</th>
            <td v-for="cell in row.cells" :key="cell.plan">
              <!--
                Häkchen und Strich sind BILDER: ohne Text daneben liest ein
                Screenreader an dieser Stelle gar nichts vor, und die Zeile
                „Eigene Domain" wäre für ihn leer. Der Text steht deshalb
                sichtbar-versteckt dabei.
              -->
              <template v-if="cell.included !== null">
                <UIcon
                  :name="cell.included ? 'i-ph-check-bold' : 'i-ph-minus-bold'"
                  class="size-4"
                  :class="cell.included ? 'text-primary-600' : 'text-dimmed'"
                  aria-hidden="true"
                />
                <span class="sr-only">{{ cell.included ? t('marketing.pricing.compare.yes') : t('marketing.pricing.compare.no') }}</span>
              </template>
              <template v-else>{{ cell.amount }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="compare-note text-dimmed">{{ t('marketing.pricing.compare.note') }}</p>
  </div>
</template>

<style scoped>
/* Nur Maße und Ausrichtung stehen hier; jede FARBE kommt als Utility aus dem
   Design-System (text-highlighted/-toned/-dimmed, border-default) — dieselbe
   Trennung wie in den übrigen Marketing-Sektionen. */
.compare-head { margin-top: 3.5rem; text-align: center; }
.compare-head .mkt-lead { margin-inline: auto; }

.compare-title {
  font-size: clamp(1.35rem, 2.4vw, 1.7rem);
  font-weight: 700;
  line-height: 1.25;
}

.compare-scroll { margin-top: 1.75rem; overflow-x: auto; }

.compare {
  width: 100%;
  /* Unter dieser Breite verlieren die zwei Plan-Spalten ihre Lesbarkeit —
     ab hier scrollt der Kasten oben, nicht die Seite. */
  min-width: 30rem;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.compare th,
.compare td {
  padding: 0.7rem 0.9rem;
  text-align: left;
}

/* Die zwei Plan-Spalten stehen mittig und gleich breit — sonst wandert das
   Häkchen mit der Länge der Merkmalsbezeichnung hin und her. */
.compare thead th:not(:first-child),
.compare tbody td { width: 22%; text-align: center; }

.compare-note { margin-top: 0.9rem; font-size: var(--text-sm); text-align: center; }
</style>
