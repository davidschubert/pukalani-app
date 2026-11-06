<script setup lang="ts">
import type { MarketFinding } from '../../shared/marketProfile'

/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * EIN MARKT-BEFUND ALS CHIP (Plan §2.3 Nr. 4, §2.11 Nr. 4).
 *
 * ── WARUM ER NEBEN `BwFindingChip` STEHT UND NICHT STATT SEINER ──────────
 * Er ist dessen Zwilling in Form und Farbe — bewusst, denn ein Markt-Befund
 * soll sich anfühlen wie ein Konflikt-Befund: Bernstein (`--bw-stale`), kein
 * rotes Fehler-Design, beratend statt sperrend. Er ist trotzdem eine EIGENE
 * Komponente, aus drei Gründen, die alle erst die Umsetzung auflösen kann:
 *
 *  1. `BwFindingChip` kennt genau drei Arten (`conflict | affected | gap`) —
 *     als TYP und als Enum-Spalte `brand_findings.kind` (Migration
 *     brand-014). Die Art `market` einzuführen ist eine MIGRATION, also M1/M3,
 *     nicht der Prototyp.
 *  2. Er entscheidet SELBST per `$fetch` gegen `/api/brand/profiles/…` — der
 *     Prototyp spricht mit niemandem.
 *  3. Ein Markt-Befund hat GENAU EIN eigenes Feld (ein Konflikt hat zwei),
 *     also gibt es hier keine Feld-Wahl beim Annehmen.
 *
 * Sobald M3 die Art `market` in den Befund-Speicher einträgt, ersetzt
 * `BwFindingChip` diese Komponente — die Optik ist deshalb absichtlich
 * dieselbe und nicht „eigenständiger".
 *
 * ── ER NENNT NIE EINEN WETTBEWERBER (§2.9 Nr. 5, § 6 UWG) ────────────────
 * Weder `why` noch `suggestion` dürfen einen Dritten nennen oder erkennbar
 * machen — „euer Satz klingt wie zwei andere im Feld" statt „anders als X".
 * Die Regel wohnt beim Erzeuger (Prompt + Filter, M3); dass die Komponente
 * dafür keinen Platz vorsieht (kein Feld für einen Wettbewerber-Namen), ist
 * die zweite Sicherung.
 */
const props = withDefaults(defineProps<{
  finding: MarketFinding
  /**
   * Die Beschriftung des EIGENEN Feldes — aufgelöst von der Seite gegen die
   * brand-Registry (Vertrag, s. `nuxt.config.ts`). Diese Komponente kennt die
   * Registry nicht.
   */
  fieldLabel: string
  /** Zugeklappt (Log/Leiste): Kopfzeile und ein gekürzter Satz. */
  compact?: boolean
}>(), { compact: false })

const emit = defineEmits<{
  accept: [id: string]
  dismiss: [id: string]
  field: [slotId: string]
}>()

const { t } = useI18n()
const expanded = ref(!props.compact)
</script>

<template>
  <div class="rounded-xl px-2.5 py-2" style="background: var(--bw-stale-soft)">
    <div class="flex items-start gap-2">
      <UIcon name="i-ph-compass" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        :aria-expanded="expanded"
        :title="finding.why"
        @click="expanded = !expanded"
      >
        <span class="bw-label block" style="color: var(--bw-stale)">{{ t('market.finding.kind') }}</span>
        <span class="block text-sm leading-snug" :class="expanded ? '' : 'truncate'">{{ finding.why }}</span>
      </button>

      <!-- Entschieden: ein stilles Etikett statt zweier Knöpfe — dieselbe
           Regel wie beim Konflikt-Chip. -->
      <span
        v-if="finding.status !== 'open'"
        class="bw-label flex-none"
        style="color: var(--bw-muted)"
      >{{ t(finding.status === 'accepted' ? 'market.finding.accepted' : 'market.finding.dismissed') }}</span>
    </div>

    <div v-if="expanded" class="mt-2 pl-6">
      <p class="text-sm leading-snug" style="color: var(--bw-ink-soft)">{{ finding.suggestion }}</p>

      <div class="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="bw-label" style="color: var(--bw-muted)">{{ t('market.finding.field') }}</span>
        <button
          type="button" class="bw-label underline" style="color: var(--bw-ink-soft)"
          @click="emit('field', finding.slotId)"
        >{{ fieldLabel }}</button>
      </div>

      <div v-if="finding.status === 'open'" class="mt-2 flex flex-wrap items-center gap-2">
        <UButton
          size="xs" color="neutral" variant="ghost" class="rounded-full"
          icon="i-ph-check" :label="t('market.finding.accept')"
          @click="emit('accept', finding.id)"
        />
        <UButton
          size="xs" color="neutral" variant="ghost" class="rounded-full"
          icon="i-ph-x" :label="t('market.finding.dismiss')"
          @click="emit('dismiss', finding.id)"
        />
      </div>
    </div>
  </div>
</template>
