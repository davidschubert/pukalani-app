<script setup lang="ts">
import { BRAND_DNA_DIMENSIONS, BRAND_INSPIRATION_AREAS, BRAND_READING_VERDICTS, brandDnaDimension, brandTermById, brandTermLabel } from '../../shared/brandDesignVocab'
import { BRAND_DESIGN_READING_DAILY_LIMIT, brandAiRejectionMessageKey } from '../../shared/brandAiLimits'
import type { BrandReadingVerdict } from '../../shared/brandReading'
import { BRAND_RUN_POLL_TIMEOUT_MS } from '../../shared/brandRun'
import { RUN_LEASE_BUSY_CODE, RUN_LEASE_POLL_MS } from '../../../core/shared/runLease'
import type { BrandInspirationReadResponse } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE LESUNG DER VORBILDER (`g.reading`, Konzept
 * docs/archiv/BRAND-DESIGN.md §2.2 Schritt 3, Paket D2b).
 *
 * Gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/dna.vue`, Abschnitt `g.reading`):
 * das FAZIT zuerst in zwei Listen („Trägt schon · n" / „Geht besser · n"),
 * darunter je Vorbild Bild, Urteil, die Foundation-Stelle, die beobachteten
 * Belegungen als Chips, die Begründung und — bei Spannung und Widerspruch —
 * der Übernehmen-/Nicht-übernehmen-Satz.
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Kein Chat, kein Zug, keine Sprechblase: dieser Abschnitt ist ein LAUF. Der
 * Mensch drückt einen Knopf, wartet und bekommt eine Lesung — die Stimme der
 * Beraterin steht im Kapitel darüber und in den Sätzen, die hier erscheinen,
 * nicht in einem zweiten Gesprächsfaden (§2.1: nichts Neues an der
 * Zustandsmaschine).
 *
 * ── BESTÄTIGT WIRD WIE JEDE ANDERE HERLEITUNG ─────────────────────────────
 * `g.reading` ist `type: 'derivation'` mit `editor: 'none'` — die Karte in der
 * Bühne trägt den Übernehmen-Knopf, wie bei `d.primary` oder `h.ramp`. Dieser
 * Abschnitt zeigt den INHALT und startet den Lauf; er bestätigt nichts.
 *
 * DESHALB LÄDT ER DEN BAUSTEIN NACH: der Lauf schreibt den Slot-Wert
 * SERVER-seitig und erhöht dabei die `revision` der Kapitel-Zeile. Ohne das
 * Nachladen stünde die Karte in der Bühne weiter leer (nichts zu bestätigen),
 * und der nächste Autosave liefe in einen `revision_conflict` gegen eine
 * Änderung, die derselbe Mensch gerade selbst ausgelöst hat.
 *
 * ── DAS BILD KOMMT AUS DER EIGENEN ROUTE ──────────────────────────────────
 * Wie im Upload-Instrument: `…/inspiration/:id/image`, nur für den Besitzer,
 * `private, no-store`. Es gibt keine Bucket-Adresse (§2.13).
 *
 * ── DER LAUF RECHNET IM HINTERGRUND (LL1 b, 2026-11-17) ──────────────────
 * Der Start antwortet sofort (`202`); ein Vision-Zug über zwölf Bilder
 * braucht länger, als eine Anfrage warten sollte. Solange der Lauf läuft,
 * fragt der Abschnitt die Liste alle paar Sekunden ab (`useRunPolling`, nur
 * bei sichtbarem Reiter) — dort stehen Lesungen, Fazit UND Lauf-Stand. Wer
 * die Seite neu lädt oder in einem zweiten Reiter öffnet, sieht denselben
 * Stand: „läuft", fertig, gescheitert mit Grund, oder unterbrochen. Ein
 * zweiter Start während eines Laufs ist kein Fehler, sondern ein ruhiger
 * Hinweis (`run_running`). Der Baustein wird nachgeladen, sobald der Lauf
 * ENDET — erst dann stehen Slot-Wert und Revision.
 */
const props = defineProps<{
  profileId: string
  /** Sperrt den Lauf — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
}>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()
const inspiration = useBrandInspiration(props.profileId)
const { items, runLine, summary, state, unread, run: runState } = inspiration

/** Der Start-Aufruf ist unterwegs — danach trägt der Lauf-Stand das „läuft". */
const starting = ref(false)
const errorKey = ref('')
/** Der ruhige Hinweis „läuft schon" nach einem zweiten Start. */
const alreadyRunning = ref(false)
/** `null` = noch kein Lauf in dieser Sitzung; die Zeile steht dann nicht da. */
const remaining = ref<number | null>(null)

/** Läuft gerade ein Lauf — der eigene Start oder einer aus einem anderen Reiter? */
const running = computed(() => starting.value || runState.value.state === 'running')

/**
 * WAS DER JÜNGSTE LAUF HINTERLASSEN HAT — eine Zeile unter dem Knopf, aus dem
 * Lauf-Stand gelesen und nicht aus einer Merkvariable: nach einem Neuladen
 * steht dort dasselbe. Die Gründe sind dieselben Wörter, die früher als
 * Fehler-Code der Anfrage kamen.
 */
const runMessageKey = computed(() => {
  const view = runState.value
  if (view.state === 'stalled') return 'brand.reading.interrupted'
  if (view.state !== 'failed') return ''
  if (view.failure === 'ai_endpoint_unavailable') return 'error.aiEndpointUnavailableHint'
  if (view.failure === 'reading_too_large') return 'brand.reading.error.tooLarge'
  return 'brand.reading.error.failed'
})

const VERDICT_TONE: Record<BrandReadingVerdict, string> = {
  fits: 'confirmed',
  tension: 'draft',
  off: 'stale',
}
const VERDICT_ICON: Record<BrandReadingVerdict, string> = {
  fits: 'i-ph-check-circle-fill',
  tension: 'i-ph-warning-circle-fill',
  off: 'i-ph-x-circle-fill',
}

/**
 * Die Etiketten kommen AUS DEM VOKABULAR, nicht aus dem i18n-Katalog —
 * dieselbe Begründung wie im Upload-Instrument: `brandDesignVocab.ts` trägt
 * beide Sprachen selbst und ist dieselbe Quelle, aus der der Server den Prompt
 * und den Slot-Wert baut.
 */
function verdictLabel(verdict: BrandReadingVerdict): string {
  const term = brandTermById(BRAND_READING_VERDICTS, verdict)
  return term ? brandTermLabel(term, locale.value) : verdict
}

function areaLabel(areaId: string): string {
  const term = brandTermById(BRAND_INSPIRATION_AREAS, areaId)
  return term ? brandTermLabel(term, locale.value) : areaId
}

function dimensionLabel(dimensionId: string): string {
  const dimension = brandDnaDimension(dimensionId)
  return dimension ? brandTermLabel(dimension, locale.value) : dimensionId
}

function valueLabel(dimensionId: string, valueId: string): string {
  const value = BRAND_DNA_DIMENSIONS
    .find(dimension => dimension.id === dimensionId)?.values
    .find(entry => entry.id === valueId)
  return value ? brandTermLabel(value, locale.value) : valueId
}

const verdictCount = computed(() => {
  const count: Record<BrandReadingVerdict, number> = { fits: 0, tension: 0, off: 0 }
  for (const item of items.value) if (item.reading) count[item.reading.verdict] += 1
  return count
})

/**
 * DIE BESCHRIFTUNG DES KNOPFES sagt, was der Lauf tut: das erste Mal lesen,
 * die Neuzugänge nachziehen oder alles noch einmal. Sie hängt am ZUSTAND und
 * nicht an einer Merkvariable — ein Knopf, der nach einem Reload etwas anderes
 * verspricht als vorher, ist schlimmer als einer ohne Nuance.
 */
const runLabelKey = computed(() => {
  if (state.value === 'none') return 'brand.reading.run.first'
  return unread.value > 0 ? 'brand.reading.run.more' : 'brand.reading.run.again'
})

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` und kommt als `error.data.reason`
 * an (CLAUDE.md). Die DROSSEL-Codes haben ihre eigene Abbildung
 * (`brandAiRejectionMessageKey`) — sie sagt „heute genug" statt „ging nicht",
 * und das ist die Auskunft, die der Mensch hier braucht.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  const throttled = brandAiRejectionMessageKey(reason)
  if (throttled) return throttled
  if (reason === 'vision_unavailable' || status === 503) return 'brand.reading.error.unavailable'
  if (reason === 'reading_no_images') return 'brand.reading.error.noImages'
  if (status === 429) return 'brand.reading.error.rateLimited'
  if (status === 404) return 'brand.reading.error.notFound'
  return 'brand.reading.error.generic'
}

/**
 * DEN ZÄHLER AUS DEM LAUF-STAND NACHZIEHEN. Läuft ein Lauf, ist sein Zähler
 * der aktuelle — auch in einem Reiter, der ihn nicht gestartet hat. Ist er
 * zu Ende, zählt sein Stand nur, wenn hier schon eine Zahl steht: der Zähler
 * eines Laufs von gestern sagt über heute nichts.
 */
function syncRemaining(): void {
  const view = runState.value
  if (!view.quota) return
  if (view.state === 'running' || remaining.value !== null) remaining.value = view.quota.remaining
}

// Die Liste lädt das Ablage-Instrument darüber (`BwUploadsEditor`) — kommt
// dabei ein laufender Lauf an, steht sein Zähler sofort da.
watch(() => runState.value.state, (next, previous) => {
  syncRemaining()
  // DER LAUF IST ZU ENDE: der neue Slot-Wert und die neue Revision (s. Kopf).
  // Auch nach einem gescheiterten Lauf — er hat nichts geschrieben, und das
  // Nachladen ist dann ein No-op.
  if (previous === 'running' && next !== 'running') {
    alreadyRunning.value = false
    void store.loadStep(props.profileId, 'dna')
  }
}, { immediate: true })

/** EINE NACHFRAGE, solange ein Lauf läuft: Liste, Fazit und Lauf-Stand in einem Zug. */
async function poll(): Promise<void> {
  await inspiration.load({ timeout: BRAND_RUN_POLL_TIMEOUT_MS })
}

useRunPolling({ active: running, intervalMs: RUN_LEASE_POLL_MS, tick: poll })

async function run(): Promise<void> {
  if (props.disabled || running.value) return
  starting.value = true
  errorKey.value = ''
  alreadyRunning.value = false
  try {
    const res = await $fetch<BrandInspirationReadResponse>(`${inspiration.base}/read`, {
      method: 'POST',
    })
    runState.value = res.run
    remaining.value = res.quota.remaining
  }
  catch (error) {
    // „Läuft schon" ist KEIN Fehler: ein zweiter Reiter (oder ein Doppelklick)
    // hat den Lauf gestartet. Stand holen — dann zeigt auch dieser Reiter ihn.
    if ((error as FetchErrorLike | null)?.data?.reason === RUN_LEASE_BUSY_CODE) {
      alreadyRunning.value = true
      await inspiration.load().catch(() => {})
    }
    else {
      errorKey.value = messageKey(error)
      // Eine Drossel-Absage IST eine Auskunft über das Kontingent: null.
      if (errorKey.value.endsWith('readingLimit')) remaining.value = 0
    }
  }
  finally {
    starting.value = false
  }
}

function imageSrc(id: string, createdAt: string): string {
  return `${inspiration.base}/${encodeURIComponent(id)}/image?v=${encodeURIComponent(createdAt)}`
}
</script>

<template>
  <section data-brand-reading>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.reading.title') }}</h2>
      <span v-if="state === 'read'" class="bw-state bw-state--confirmed">
        <UIcon name="i-ph-check" /> {{ t('brand.reading.state.read') }}
      </span>
      <span v-else-if="state === 'stale'" class="bw-state bw-state--stale">
        <UIcon name="i-ph-clock-counter-clockwise" /> {{ t('brand.reading.state.stale') }}
      </span>
      <span v-if="runLine" class="bw-label ms-auto" style="color: var(--bw-muted)">{{ runLine }}</span>
    </div>
    <p class="bw-doc-text mt-2">{{ t('brand.reading.intro') }}</p>

    <!-- Das Fazit zuerst: zwei Listen, wie David es gesagt hat. -->
    <div v-if="summary.keeps.length || summary.improves.length" class="mt-4 grid gap-3 sm:grid-cols-2">
      <div class="bw-frame px-5 py-4" style="background: var(--bw-surface)">
        <p class="bw-label" style="color: var(--bw-accent)">
          {{ t('brand.reading.keeps', { count: verdictCount.fits }) }}
        </p>
        <ul class="mt-2 flex flex-col gap-1.5">
          <li
            v-for="line in summary.keeps" :key="line"
            class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
          >
            <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
            <span class="min-w-0">{{ line }}</span>
          </li>
        </ul>
      </div>
      <div class="bw-frame px-5 py-4" style="background: var(--bw-surface)">
        <p class="bw-label" style="color: var(--bw-draft)">
          {{ t('brand.reading.improves', { count: verdictCount.tension + verdictCount.off }) }}
        </p>
        <ul class="mt-2 flex flex-col gap-1.5">
          <li
            v-for="line in summary.improves" :key="line"
            class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
          >
            <UIcon name="i-ph-arrow-bend-down-right" class="mt-0.5 size-4 flex-none" style="color: var(--bw-draft)" />
            <span class="min-w-0">{{ line }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Je Bild: Beobachtung, Urteil, Foundation-Stelle, Vorschlag. -->
    <div v-if="items.length" class="mt-4 flex flex-col gap-2">
      <div
        v-for="entry in items" :key="entry.id"
        class="bw-frame grid gap-x-4 gap-y-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
        style="background: var(--bw-surface)"
      >
        <div class="min-w-0">
          <img
            :src="imageSrc(entry.id, entry.createdAt)"
            :alt="t('brand.inspiration.itemLabel', { number: entry.number })"
            class="aspect-[4/3] w-full rounded-xl object-cover"
            style="background: var(--bw-surface-hi)"
            loading="lazy"
          >
          <p class="mt-2 text-sm font-medium">
            {{ t('brand.inspiration.itemLabel', { number: entry.number }) }}
          </p>
          <p class="bw-label" style="color: var(--bw-muted)">{{ areaLabel(entry.area) }}</p>
        </div>
        <div v-if="entry.reading" class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="bw-state" :class="`bw-state--${VERDICT_TONE[entry.reading.verdict]}`">
              <UIcon :name="VERDICT_ICON[entry.reading.verdict]" /> {{ verdictLabel(entry.reading.verdict) }}
            </span>
            <span class="bw-label" style="color: var(--bw-muted)">
              {{ t('brand.reading.anchor', { anchor: entry.reading.anchor }) }}
            </span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="observation in entry.reading.observed" :key="observation.dimension"
              class="bw-chip bw-chip--quiet" style="cursor: default"
            >
              {{ dimensionLabel(observation.dimension) }}: {{ valueLabel(observation.dimension, observation.value) }}
            </span>
          </div>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.reading.reason }}</p>
          <p v-if="entry.reading.suggestion" class="mt-2 flex items-start gap-2 text-sm leading-relaxed">
            <UIcon name="i-ph-arrow-bend-down-right" class="mt-0.5 size-4 flex-none" style="color: var(--bw-draft)" />
            <span class="min-w-0">{{ entry.reading.suggestion }}</span>
          </p>
        </div>
        <div v-else class="flex min-w-0 flex-col justify-center gap-2">
          <span class="bw-state bw-state--draft">{{ t('brand.reading.unread') }}</span>
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.reading.unreadHint') }}
          </p>
        </div>
      </div>
    </div>
    <p v-else class="bw-pending mt-4">{{ t('brand.reading.empty') }}</p>

    <div class="mt-3 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle"
          :label="t(runLabelKey, { count: unread })"
          color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)"
          data-reading-run
          :loading="running"
          :disabled="disabled || running || items.length === 0"
          @click="run"
        />
        <p v-if="running" class="bw-pending" data-reading-running>
          {{ alreadyRunning ? t('brand.reading.alreadyRunning') : t('brand.reading.running') }}
        </p>
      </div>
      <p v-if="running" class="bw-pending">{{ t('brand.reading.background') }}</p>
      <p class="bw-pending">
        {{ remaining === null
          ? t('brand.reading.limits', { max: BRAND_DESIGN_READING_DAILY_LIMIT })
          : t('brand.reading.remaining', { count: remaining, max: BRAND_DESIGN_READING_DAILY_LIMIT }) }}
      </p>
      <p v-if="errorKey" class="text-sm" style="color: var(--bw-stale)">{{ t(errorKey) }}</p>
      <p
        v-else-if="runMessageKey && !running" class="text-sm" style="color: var(--bw-stale)"
        data-reading-run-outcome
      >
        {{ t(runMessageKey) }}
      </p>
    </div>
  </section>
</template>
