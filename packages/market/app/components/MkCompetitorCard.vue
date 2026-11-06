<script setup lang="ts">
import {
  MARKET_FIELDS,
  marketField,
  type MarketAiView,
  type MarketCompetitor,
  type MarketFieldId,
  type MarketProfile,
  type MarketProfileField,
} from '../../shared/marketProfile'
import { marketDate, marketHost } from '../utils/marketFormat'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DIE PROFIL-KARTE EINES WETTBEWERBERS (Plan §2.5 Nr. 5) — alle Felder mit
 * Zitat und Link, aufklappbar.
 *
 * ── LEERE FELDER STEHEN DRIN, MIT WORTEN ─────────────────────────────────
 * „nicht öffentlich formuliert" ist die zweitwichtigste Auskunft dieses
 * Produkts (§1.10): dass eine Marke keinen Purpose-Satz hat, sagt mehr über
 * die Kategorie als drei ausformulierte Versprechen. Wegzulassen wäre
 * bequemer und würde genau diese Auskunft verschlucken.
 *
 * ── SIE URTEILT NICHT — AUCH NICHT MIT DEM SCORE ─────────────────────────
 * Seit M0b steht hier der Brand-Check-Score (§7.3), und das ist KEIN
 * Widerspruch zu §1.4: er misst, wie gut ein AUFTRITT gemacht ist
 * (Reifegrad, nachprüfbar an 40 Kriterien), nicht wie erfolgreich eine Marke
 * damit ist — und er ist der BESTEHENDE Score des Brand-Checks mit Link auf
 * dessen Begründung, keine Note, die dieser Bericht sich ausdenkt. Was hier
 * weiterhin nicht steht: „stark/schwach", ein Ranking, ein Urteil über den
 * Wettbewerber.
 *
 * ── DIE KI-AUSSENSICHT STEHT UNTEN UND GETRENNT (§7.5 a/d) ───────────────
 * Eigener Block, eigenes Etikett, kein Beleg-Knopf. Sie mit den Feldern zu
 * mischen hiesse, die ungeprüfte Aussage mit der belegten gleichzusetzen.
 */
withDefaults(defineProps<{
  competitor: MarketCompetitor
  profile?: MarketProfile | null
  /** Die ungeprüfte Aussensicht zu DIESER Marke — schon gefiltert. */
  aiView?: MarketAiView | null
  fieldLabels?: Partial<Record<MarketFieldId, string>>
  resolveHref?: (sourceUrl: string) => string
  resolveBandLabel?: (band: string) => string
  resolveCheckHref?: (checkId: string) => string
  defaultOpen?: boolean
}>(), {
  profile: null,
  aiView: null,
  fieldLabels: () => ({}),
  resolveHref: (sourceUrl: string) => sourceUrl,
  resolveBandLabel: (band: string) => band,
  resolveCheckHref: (checkId: string) => `/brand-check/${checkId}`,
  defaultOpen: false,
})

const { t, locale } = useI18n()
const fields = MARKET_FIELDS

/**
 * Wert und Beleg EINES Feldes — der Beleg als null-oder-eins-Liste, damit das
 * Template ohne Nicht-null-Behauptung auskommt (s. MkComparisonTable).
 *
 * SIE HIESS EINMAL `valueOf`, UND DAS WAR EIN 500er (live erwischt): der
 * Render-Kontext löst einen solchen Namen gegen `Object.prototype.valueOf`
 * auf, das dann ohne `this` gerufen wird — „Cannot convert undefined or null
 * to object", mitten in einer Schleife, die aussieht, als wäre sie schuld.
 * Namen aus `Object.prototype` (`valueOf`, `toString`, `hasOwnProperty`)
 * gehören in einer Vue-Komponente nicht an eine Template-Funktion; gemessen:
 * Umbenennen behebt den 500er, sonst bleibt alles gleich.
 */
function fieldValue(profileFields: readonly MarketProfileField[], fieldId: MarketFieldId): string {
  return marketField(profileFields, fieldId)?.value ?? ''
}
function evidenceOf(profileFields: readonly MarketProfileField[], fieldId: MarketFieldId) {
  const evidence = marketField(profileFields, fieldId)?.evidence
  return evidence ? [evidence] : []
}
</script>

<template>
  <div class="bw-card p-4">
    <UCollapsible :default-open="defaultOpen">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 text-left"
      >
        <UIcon
          :name="competitor.status === 'excluded' ? 'i-ph-prohibit' : 'i-ph-storefront'"
          class="size-4 flex-none"
          :style="`color: ${competitor.status === 'excluded' ? 'var(--bw-draft)' : 'var(--bw-ink-soft)'}`"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ competitor.name }}</span>
          <span class="bw-label block truncate" style="color: var(--bw-muted)">
            {{ marketHost(competitor.url) }}
            <template v-if="competitor.pagesRead?.length && competitor.fetchedAt">
              &middot; {{ t('market.profiles.read', { count: competitor.pagesRead.length, date: marketDate(competitor.fetchedAt, locale) }) }}
            </template>
          </span>
        </span>

        <!-- OHNE LINK, und das ist kein Versehen: dieser Knopf IST die
             Aufklapp-Schaltfläche, und ein `<a>` in einem `<button>` ist
             ungültiges HTML — die Tastatur landet dann in einer Falle. Der
             Weg zum Brand-Check steht deshalb aufgeklappt darunter. -->
        <MkBrandScore
          v-if="competitor.status !== 'excluded'"
          :check="competitor.brandCheck"
          :resolve-band-label="resolveBandLabel"
          :linked="false"
        >
          <template #ring="ring">
            <slot name="score" v-bind="ring" />
          </template>
        </MkBrandScore>

        <UIcon name="i-ph-caret-down" class="size-4 flex-none" style="color: var(--bw-muted)" />
      </button>

      <template #content>
        <div class="mt-3 border-t pt-3" style="border-color: var(--bw-line)">
          <a
            v-for="check in competitor.brandCheck ? [competitor.brandCheck] : []"
            :key="check.checkId"
            :href="resolveCheckHref(check.checkId)"
            class="bw-label mb-3 inline-flex items-center gap-1 underline decoration-dotted underline-offset-2"
            style="color: var(--bw-muted)"
          >
            <UIcon name="i-ph-gauge" class="size-3.5 flex-none" />{{ t('market.score.link') }}
          </a>

          <p v-if="!profile" class="text-sm" style="color: var(--bw-ink-soft)">
            {{ t('market.profiles.none') }}
            <template v-if="competitor.excludedReason">
              {{ t(`market.reason.${competitor.excludedReason}`) }}
            </template>
          </p>

          <dl v-else class="space-y-3">
            <div v-for="field in fields" :key="field.id">
              <dt class="bw-label" style="color: var(--bw-muted)">
                {{ fieldLabels[field.id] ?? t(`market.field.${field.id}`) }}
              </dt>
              <dd class="mt-0.5">
                <template v-if="fieldValue(profile.fields, field.id)">
                  <p class="text-sm leading-snug">{{ fieldValue(profile.fields, field.id) }}</p>
                  <MkEvidence
                    v-for="evidence in evidenceOf(profile.fields, field.id)"
                    :key="evidence.sourceUrl"
                    class="mt-1"
                    :evidence="evidence"
                    :resolve-href="resolveHref"
                  />
                  <MkCellMeta :field="marketField(profile.fields, field.id)" />
                </template>
                <p v-else class="text-sm italic" style="color: var(--bw-muted)">{{ t('market.result.empty') }}</p>
              </dd>
            </div>
          </dl>

          <!-- Getrennt, unten, mit eigenem Etikett (§7.5 a). -->
          <section v-if="aiView?.statements.length" class="mt-4 border-t pt-3" style="border-color: var(--bw-line)">
            <h4 class="bw-label flex items-center gap-1.5" style="color: var(--bw-draft)">
              <UIcon name="i-ph-sparkle" class="size-3.5 flex-none" />
              {{ t('market.view.ai') }} &middot; {{ t('market.ai.label') }}
            </h4>
            <dl class="mt-2 space-y-2">
              <div v-for="statement in aiView.statements" :key="statement.fieldId">
                <dt class="bw-label" style="color: var(--bw-muted)">
                  {{ fieldLabels[statement.fieldId] ?? t(`market.field.${statement.fieldId}`) }}
                </dt>
                <dd class="mt-0.5">
                  <p class="text-sm leading-snug">{{ statement.value }}</p>
                  <p class="bw-label" style="color: var(--bw-muted)">
                    {{ t('market.ai.agree', { agree: statement.agree, asked: statement.asked }) }}
                  </p>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
