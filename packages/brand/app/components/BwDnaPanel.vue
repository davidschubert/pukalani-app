<script setup lang="ts">
import { BRAND_AI_SLOT_DAILY_LIMIT, brandAiRejectionMessageKey } from '../../shared/brandAiLimits'
import {
  brandDnaDimensionLabel,
  brandDnaOriginLabel,
  brandDnaValueLabel,
} from '../../shared/brandDesignDna'
import { brandDnaDimension } from '../../shared/brandDesignVocab'
import type { BrandDnaProposeResponse } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DER DNA-VORSCHLAG (`g.dna`, Konzept docs/archiv/BRAND-DESIGN.md §2.2 Schritt
 * 4, Paket D2c).
 *
 * Gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/dna.vue`, Abschnitt `g.dna`): zehn
 * Zeilen, je Zeile Dimension, Wert, Begründung — und, wo ein Vorbild sie
 * bestätigt oder korrigiert, der Vorbild-Satz plus der Herkunfts-Chip (§2.2
 * Leitplanke e).
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie bei der Lesung (D2b): kein Chat, kein Zug, keine Sprechblase. Dieser
 * Abschnitt ist ein LAUF — der Mensch drückt einen Knopf, wartet, bekommt
 * einen Vorschlag.
 *
 * ── BESTÄTIGT WIRD WIE JEDE ANDERE HERLEITUNG ─────────────────────────────
 * `g.dna` ist `type: 'derivation'`; die Karte auf der Bühne trägt den
 * Übernehmen-Knopf. Dieser Abschnitt zeigt den INHALT und startet den Lauf; er
 * bestätigt nichts und schreibt nichts.
 *
 * DESHALB LÄDT ER DEN BAUSTEIN NACH: der Lauf schreibt den Slot-Wert
 * SERVER-seitig und erhöht dabei die `revision` der Kapitel-Zeile. Ohne das
 * Nachladen stünde die Karte in der Bühne weiter leer, und der nächste
 * Autosave liefe in einen `revision_conflict` gegen eine Änderung, die derselbe
 * Mensch gerade selbst ausgelöst hat.
 *
 * ── DIE HERKUNFT STEHT NUR DA, WO ES SIE GIBT ─────────────────────────────
 * Auf dem Weg „Frida schlägt vor" ist jede Zeile `foundation`. Ein Chip, der
 * zehnmal dasselbe sagt, ist kein Hinweis, sondern Lärm — deshalb erscheint er
 * nur, wenn der Lauf mit Vorbildern gerechnet hat.
 */
const props = defineProps<{
  profileId: string
  /** Hat dieses Branding Vorbilder abgelegt? Steuert Chip und Vorbild-Satz. */
  withInspiration?: boolean
  /** Sperrt den Lauf — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
}>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()

const running = ref(false)
const errorKey = ref('')
/** `null` = noch kein Lauf in dieser Sitzung; die Zeile steht dann nicht da. */
const remaining = ref<number | null>(null)
/** Der Vorschlag kommt aus dem SLOT-WERT — die Antwort ist nur die Abkürzung. */
const { proposal } = useBrandDnaBoards()

/** Zeigt eine Zeile ihre Herkunft? Nur, wenn es überhaupt zwei Quellen gibt. */
const showOrigin = computed(() => props.withInspiration === true)

function dimensionLabel(dimensionId: string): string {
  return brandDnaDimensionLabel(dimensionId, locale.value)
}

function dimensionHint(dimensionId: string): string {
  const dimension = brandDnaDimension(dimensionId)
  if (!dimension) return ''
  return locale.value.startsWith('de') ? dimension.hintDe : dimension.hintEn
}

function valueLabel(dimensionId: string, valueId: string): string {
  return brandDnaValueLabel(dimensionId, valueId, locale.value)
}

function originLabel(origin: string): string {
  return brandDnaOriginLabel(origin === 'both' ? 'both' : 'foundation', locale.value)
}

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` und kommt als `error.data.reason`
 * an (CLAUDE.md). Die DROSSEL-Codes haben ihre eigene Abbildung
 * (`brandAiRejectionMessageKey`) — sie sagt „heute genug" statt „ging nicht".
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  const throttled = brandAiRejectionMessageKey(reason)
  if (throttled) return throttled
  if (reason === 'dna_no_foundation') return 'brand.dna.error.noFoundation'
  if (reason === 'dna_unavailable' || status === 503) return 'brand.dna.error.unavailable'
  if (status === 429) return 'brand.dna.error.rateLimited'
  if (status === 404) return 'brand.dna.error.notFound'
  return 'brand.dna.error.generic'
}

async function run(): Promise<void> {
  if (props.disabled || running.value) return
  running.value = true
  errorKey.value = ''
  try {
    const res = await $fetch<BrandDnaProposeResponse>(
      `/api/brand/profiles/${encodeURIComponent(props.profileId)}/dna/propose`,
      { method: 'POST' },
    )
    remaining.value = res.quota.remaining
    // Der neue Slot-Wert und die neue Revision (s. Kopf).
    await store.loadStep(props.profileId, 'dna')
  }
  catch (error) {
    errorKey.value = messageKey(error)
    // Eine Drossel-Absage IST eine Auskunft über das Kontingent: null.
    if (errorKey.value.endsWith('slotLimit')) remaining.value = 0
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <section data-brand-dna>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.dna.title') }}</h2>
      <span v-if="proposal.length" class="bw-state bw-state--confirmed">
        <UIcon name="i-ph-check" /> {{ t('brand.dna.state.ready') }}
      </span>
    </div>
    <p class="bw-doc-text mt-2">
      {{ withInspiration ? t('brand.dna.introWithReferences') : t('brand.dna.intro') }}
    </p>

    <div v-if="proposal.length" class="mt-4 flex flex-col gap-2">
      <div
        v-for="entry in proposal" :key="entry.dimension"
        class="bw-frame grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_9rem_minmax(0,1fr)]"
        style="background: var(--bw-surface)"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ dimensionLabel(entry.dimension) }}</p>
          <p class="bw-label" style="color: var(--bw-muted)">{{ dimensionHint(entry.dimension) }}</p>
        </div>
        <p class="text-sm">{{ valueLabel(entry.dimension, entry.value) }}</p>
        <div class="min-w-0">
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.reason }}</p>
          <p
            v-if="withInspiration && entry.inspirationReason"
            class="mt-1 flex items-start gap-2 text-sm leading-relaxed"
            style="color: var(--bw-ink-soft)"
          >
            <UIcon name="i-ph-images" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
            <span class="min-w-0">{{ entry.inspirationReason }}</span>
          </p>
          <p v-if="showOrigin" class="bw-label mt-1.5" style="color: var(--bw-muted)">
            {{ t('brand.dna.origin', { origin: originLabel(entry.origin) }) }}
          </p>
        </div>
      </div>
    </div>
    <p v-else class="bw-pending mt-4">{{ t('brand.dna.empty') }}</p>

    <div class="mt-3 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle"
          :label="proposal.length ? t('brand.dna.run.again') : t('brand.dna.run.first')"
          color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)"
          :loading="running"
          :disabled="disabled || running"
          @click="run"
        />
        <p v-if="running" class="bw-pending">{{ t('brand.dna.running') }}</p>
      </div>
      <p class="bw-pending">
        {{ remaining === null
          ? t('brand.dna.limits', { max: BRAND_AI_SLOT_DAILY_LIMIT })
          : t('brand.dna.remaining', { count: remaining, max: BRAND_AI_SLOT_DAILY_LIMIT }) }}
      </p>
      <p v-if="errorKey" class="text-sm" style="color: var(--bw-stale)">{{ t(errorKey) }}</p>
    </div>
  </section>
</template>
