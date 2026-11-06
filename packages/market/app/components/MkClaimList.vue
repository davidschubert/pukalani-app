<script setup lang="ts">
import type { MarketClaimList, MarketFieldId } from '../../shared/marketProfile'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DIE DREI LISTEN: Konventionen &middot; Überschneidungen &middot; freie
 * Stellen (Plan §2.3 Nr. 4).
 *
 * ── EINE KOMPONENTE, DREI ARTEN — WEIL ES DIESELBE FORM IST ──────────────
 * Alle drei sind „eine Aussage, ein Feld, Belege dazu"; nur Überschrift,
 * Glyphe und die Zählzeile unterscheiden sich. Drei Komponenten wären drei
 * Orte, an denen das Zitat anders aussieht.
 *
 * ── DIE SPRACHE IST DIE HALBE ARBEIT (§1.10, Scheinpräzision) ────────────
 * „Freie Stellen" heissen NICHT „Marktlücke": ein freier Claim kann frei
 * sein, weil ihn niemand glaubt. Die Einträge stehen deshalb als FRAGE da,
 * und der Hinweistext sagt das auch. Ebenso „Konventionen": was alle sagen,
 * ist die Eintrittskarte — nicht der Beweis, dass man es auch sagen muss.
 *
 * ── DIE AUSSAGE IST INHALT, DIE ZAHL IST OBERFLÄCHE ──────────────────────
 * `statement` steht in der Inhaltssprache der Marke und läuft nie über i18n
 * (es ist ein Satz, den jemand gesagt hat). „3 von 3 sagen das" dagegen ist
 * ein Satz von uns und trägt Platzhalter — sonst wäre er in der zweiten
 * Sprache englisch.
 */
withDefaults(defineProps<{
  list: MarketClaimList
  fieldLabels?: Partial<Record<MarketFieldId, string>>
  resolveHref?: (sourceUrl: string) => string
}>(), {
  fieldLabels: () => ({}),
  resolveHref: (sourceUrl: string) => sourceUrl,
})

const { t } = useI18n()

const GLYPH = {
  convention: 'i-ph-users-three',
  overlap: 'i-ph-intersect',
  whitespace: 'i-ph-circle-dashed',
} as const
</script>

<template>
  <section>
    <h3 class="flex items-center gap-2 text-base font-medium tracking-tight">
      <UIcon :name="GLYPH[list.kind]" class="size-4 flex-none" style="color: var(--bw-muted)" />
      {{ t(`market.claims.${list.kind}.title`) }}
    </h3>
    <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
      {{ t(`market.claims.${list.kind}.hint`) }}
    </p>

    <ul class="mt-3 space-y-2">
      <li v-for="entry in list.entries" :key="entry.id" class="bw-card p-4">
        <p class="bw-label" style="color: var(--bw-muted)">
          {{ fieldLabels[entry.fieldId] ?? t(`market.field.${entry.fieldId}`) }}
        </p>
        <p class="mt-1 text-sm leading-snug" style="color: var(--bw-ink)">{{ entry.statement }}</p>

        <!-- ZWEI ZAHLEN, ZWEI FRAGEN: „wie viele Marken" ist Breite,
             „auf wie vielen Seiten" ist Gewicht (§7.4). -->
        <p
          v-if="entry.sharedBy !== undefined && entry.of !== undefined && list.kind !== 'whitespace'"
          class="bw-label mt-1.5 flex flex-wrap items-center gap-x-1.5"
          style="color: var(--bw-ink-soft)"
        >
          <span>{{ t(`market.claims.${list.kind}.count`, { shared: entry.sharedBy, of: entry.of }) }}</span>
          <template v-if="entry.frequency">
            <span style="color: var(--bw-muted)">&middot;</span>
            <span style="color: var(--bw-muted)">
              {{ t('market.frequency.pages', { pages: entry.frequency.pages, of: entry.frequency.of }) }}
            </span>
          </template>
        </p>

        <div v-if="entry.citations?.length" class="mt-2 space-y-1.5">
          <p v-if="list.kind === 'overlap'" class="bw-label" style="color: var(--bw-muted)">
            {{ t('market.claims.overlap.also') }}
          </p>
          <div
            v-for="citation in entry.citations"
            :key="`${citation.competitorId}-${citation.evidence.sourceUrl}`"
          >
            <MkEvidence
              :evidence="citation.evidence"
              :label="citation.competitorName"
              :resolve-href="resolveHref"
            />
            <p v-if="citation.frequency" class="bw-label mt-0.5" style="color: var(--bw-muted)">
              {{ t('market.frequency.pages', { pages: citation.frequency.pages, of: citation.frequency.of }) }}
            </p>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
