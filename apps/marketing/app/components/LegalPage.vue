<script setup lang="ts">
// Geteiltes Gerüst der Rechtsseiten (Impressum · Datenschutz · AGB).
//
// Diese Seiten sind ENTWÜRFE: die Struktur steht, die verbindlichen Texte
// kommen von David bzw. seiner Rechtsberatung. Deshalb ist der Entwurfs-Hinweis
// nicht kleingedruckt, sondern der erste Block — und die Seiten sind bis dahin
// `noindex`: ein Impressum-Platzhalter im Suchindex wäre schlimmer als keiner.
const props = defineProps<{
  /** i18n-Basis unter marketing.legal (imprint | privacy | terms | operator) */
  scope: 'imprint' | 'privacy' | 'terms' | 'operator'
  /** Anzahl der Abschnitte im jeweiligen Scope */
  sectionCount: number
}>()

const { t, te } = useI18n()
const localePath = useLocalePath()
useReveal()

const base = computed(() => `marketing.legal.${props.scope}`)

/**
 * ABSÄTZE UND LISTEN (seit 2026-11-16, für die Betreiber-Bedingungen). Ein
 * `body` darf mehrere Zeilen tragen (`\n`): jede Zeile ist ein Absatz, Zeilen
 * mit „– " vorn werden zu einer Liste zusammengefasst. Ein einzeiliger Body —
 * so stehen alle älteren Rechtstexte da — bleibt genau ein Absatz.
 */
interface LegalBlock { kind: 'p' | 'ul', lines: string[] }
const LIST_MARK = '– '
function toBlocks(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const isItem = line.startsWith(LIST_MARK)
    const text = isItem ? line.slice(LIST_MARK.length) : line
    const last = blocks.at(-1)
    if (isItem && last?.kind === 'ul') last.lines.push(text)
    else blocks.push({ kind: isItem ? 'ul' : 'p', lines: [text] })
  }
  return blocks
}

const sections = computed(() =>
  Array.from({ length: props.sectionCount }, (_, i) => ({
    title: t(`${base.value}.sections.${i}.title`),
    blocks: toBlocks(t(`${base.value}.sections.${i}.body`)),
  })),
)

// Ein Scope darf den allgemeinen Entwurfs-Hinweis durch einen eigenen ersetzen
// (die Betreiber-Bedingungen sind kein Platzhalter, sondern ein Entwurf in
// Prüfung) und eine Fassungs-Zeile tragen.
const draftNote = computed(() => te(`${base.value}.draftNote`) ? t(`${base.value}.draftNote`) : t('marketing.legal.draftNote'))
const versionLine = computed(() => te(`${base.value}.version`) ? t(`${base.value}.version`) : '')

useSeoMeta({
  title: () => t(`${base.value}.metaTitle`),
  // Solange die Texte Entwürfe sind: aus dem Index halten.
  robots: 'noindex, follow',
})
</script>

<template>
  <div class="legal-page">
    <!--
      Auch der Rechtsseiten-Kopf ist ein `UPageHero`, kein `UPageHeader`:
      dessen Trennlinie und feste `py-8` gehören zu einer Dashboard-Kopfzeile,
      hier steht ein randloses `tone-mist`-Band mit dem Rhythmus aller anderen
      Köpfe. Die zwei Maße dieses etwas gedrängteren Kopfes stehen als
      Variablen an der Wurzel.
    -->
    <UPageHero
      as="section"
      class="tone-mist [--mkt-hero-pb:clamp(2rem,4vw,3rem)] [--mkt-hero-pt:clamp(3rem,7vw,5rem)] [--mkt-hero-title:clamp(1.8rem,4.2vw,2.6rem)]"
      :title="t(`${base}.title`)"
      :description="t(`${base}.lead`)"
      :ui="{ body: 'mt-7' }"
    >
      <template #headline>
        <UButton
          :to="localePath('/')" variant="link" color="neutral" size="sm"
          icon="i-ph-arrow-left-bold"
          class="mb-3 px-0 font-semibold text-toned hover:text-primary-600"
          :label="t('marketing.legal.backHome')"
        />
      </template>

      <template #body>
        <!-- Der Entwurfs-Hinweis ist der erste Block der Seite, nicht das
             Kleingedruckte: Titel (das frühere Badge) + Text.
             `primary` (die Sonne), NICHT `warning`: der Bestand malte diesen
             Kasten in --puka-sun; es ist ein Ehrlichkeits-Hinweis der Marke,
             keine Fehlermeldung — und `warning` wirkt auf den kühlen
             tone-*-Flächen oliv statt warm. -->
        <UAlert
          color="primary" variant="subtle" icon="i-ph-warning-bold"
          :title="t('marketing.legal.draftBadge')"
          :description="draftNote"
          :ui="{
            title: 'text-sm font-extrabold uppercase tracking-wide',
            description: 'text-base/relaxed opacity-100',
          }"
        />

        <!-- Von der verbindlichen Datenschutzerklärung zur technischen
             Erklärseite verlinken (und nur dort). Route-NAME statt Pfad-String
             (Regel in MarketingFooter.vue): EN liegt sie unter /gdpr. -->
        <p v-if="scope === 'privacy'" class="mt-5">
          <ULink
            :to="localePath({ name: 'dsgvo' })"
            class="inline-flex items-center gap-1.5 font-bold text-primary-600"
          >
            {{ t('marketing.legal.privacy.seeAlso') }}
            <UIcon name="i-ph-arrow-right-bold" class="size-4" />
          </ULink>
        </p>
      </template>
    </UPageHero>

    <section class="mkt-section tone-cloud">
      <div class="mkt-inner mkt-narrow legal-body" data-reveal>
        <section v-for="(section, i) in sections" :key="section.title" class="legal-section">
          <h2 class="legal-h2">{{ i + 1 }}. {{ section.title }}</h2>
          <template v-for="(block, j) in section.blocks" :key="j">
            <ul v-if="block.kind === 'ul'" class="legal-list">
              <li v-for="line in block.lines" :key="line">{{ line }}</li>
            </ul>
            <p v-else>{{ block.lines[0] }}</p>
          </template>
        </section>
        <p v-if="versionLine" class="legal-version">{{ versionLine }}</p>
        <p class="legal-contact">{{ t('marketing.legal.contactHint') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.legal-body {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.legal-section p,
.legal-section li {
  color: hsl(var(--puka-ink-soft));
  line-height: 1.65;
}
.legal-section p + p,
.legal-section p + .legal-list,
.legal-section .legal-list + p {
  margin-top: 0.6rem;
}
.legal-list {
  list-style: disc;
  padding-inline-start: 1.25rem;
  margin-top: 0.4rem;
}
.legal-list li + li {
  margin-top: 0.25rem;
}
.legal-version {
  font-size: 0.9rem;
  color: hsl(var(--puka-ink-soft));
}
.legal-h2 {
  font-size: 1.1rem;
  font-weight: 800;
  color: hsl(var(--puka-ink));
  margin-bottom: 0.35rem;
}
.legal-contact {
  margin-top: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--puka-card-edge);
  color: hsl(var(--puka-ink-soft));
}
</style>
