<script setup lang="ts">
import {
  BRAND_FINDING_REASON_MAX,
  type BrandFindingKind,
} from '../../shared/brandFindings'
import { acceptTargets, dismissReasonValid } from '../../shared/brandWorkspaceNav'
import type {
  BrandFindingDecisionResponse,
  BrandFindingView,
} from '../../shared/types/brand'
import { useBrandFieldLabel } from '../composables/useBrandFieldLabel'

/**
 * EIN BEFUND ALS CHIP (BW2 Paket 5, docs/archiv/BRAND-WIZARD-SESSIONS.md §8).
 *
 * ── „BERATEND, NIE SPERREND — AUSSER AN DER KAPITEL-GRENZE" ───────────────
 * Deshalb BERNSTEIN (`--bw-stale`, dieselbe Farbe wie „veraltet") und kein
 * rotes Fehler-Design: ein Befund ist ein Hinweis des Spezialisten, keine
 * Absage des Servers. Die EINE Stelle, an der er Zwang ausübt, ist die Finale
 * Abnahme (§5a Schritt 3) — und die sperrt der SERVER, nicht dieser Chip.
 *
 * ── DER CHIP IST DER BLEIBENDE WEG ────────────────────────────────────────
 * George spricht einen Befund GENAU EINMAL aus (Paket 4, `mentionedAt`);
 * danach lebt er hier. Damit bekommt der alte offene Punkt „Rückfragen zeigen
 * auf Felder fertiger Kapitel ohne Weg" seinen Weg: die Feld-Links springen in
 * die Session, in der das Feld wohnt.
 *
 * ── ER ENTSCHEIDET SELBST, STATT NACH OBEN ZU FRAGEN ──────────────────────
 * Drei Orte zeigen ihn (Abnahme, Log, Bühne — §8 „im Log und in beiden
 * Sessions"), und alle drei bräuchten sonst denselben `$fetch`, dieselbe
 * 409-Behandlung und dasselbe Modal. Nach oben reist nur, WAS PASSIERT IST
 * (`decided`) — die Seite entscheidet dann, ob sie eine Liste nachlädt.
 *
 * ── ZWEI AUSGÄNGE, ZWEI BEDEUTUNGEN (§8) ──────────────────────────────────
 * ANNEHMEN heisst „stimmt, da muss ich ran" und zieht die Korrektur EINES der
 * Felder nach sich: bei zwei beteiligten Feldern fragt der Chip vorher, welches
 * — eine Wahl, die niemand sonst treffen kann. ABLEHNEN heisst „ich habe
 * entschieden, dass es passt", und verlangt deshalb einen Grund; der landet als
 * Notiz an der Quell-Session, sonst wäre die Ablehnung später nicht von „nie
 * gesehen" zu unterscheiden.
 *
 * ── DER IMPACT-HINWEIS LIEGT EINE EBENE HÖHER (§9, Paket 6) ───────────────
 * `jumpTo()` emittiert wie bisher; die WERKSTATT-Seite legt den Hinweis
 * dazwischen (`correctThenGo`) und springt erst nach dem Annehmen — dieselbe
 * Kette wie „Bearbeiten" auf der Abnahme-Seite. Sie gehört dorthin, weil ein
 * Feld-Link ausdrücklich in ein FREMDES Kapitel zeigen darf: dessen Stand
 * kennt dieser Chip nicht, die Seite holt ihn.
 */
const props = withDefaults(defineProps<{
  finding: BrandFindingView
  profileId: string
  /**
   * KOMPAKT heisst „zugeklappt" (Log): Icon und ein gekürzter Satz, der Rest
   * auf Klick. Auf der Bühne und in der Abnahme steht der Chip offen — dort
   * hat er Platz, und dort wird entschieden.
   */
  compact?: boolean
}>(), { compact: false })

const emit = defineEmits<{
  /** Ein Feld-Link wurde geklickt — die SEITE navigiert (Autosave, Kapitelwechsel). */
  field: [slotId: string]
  /** Der Befund ist entschieden — Listen nachladen, Sperren neu rechnen. */
  decided: [decision: BrandFindingDecisionResponse]
  /** Der Bildschirm war alt (409) — die Liste stimmt nicht mehr. */
  stale: []
}>()

const { t } = useI18n()
const toast = useToast()
const fieldLabel = useBrandFieldLabel()

const KIND: Record<BrandFindingKind, { icon: string, key: string }> = {
  conflict: { icon: 'i-ph-warning', key: 'brand.finding.kind.conflict' },
  affected: { icon: 'i-ph-clock-counter-clockwise', key: 'brand.finding.kind.affected' },
  gap: { icon: 'i-ph-circle-dashed', key: 'brand.finding.kind.gap' },
  // MV1 M3: der Marktvergleich hängt seine Befunde in dieselbe Liste. Der
  // Kompass ist die Glyphe des Marktes (Plan §2.5) — dieselbe wie in der
  // Leiste, damit ein Chip verrät, woher er kommt, ohne es zu erklären.
  market: { icon: 'i-ph-compass', key: 'brand.finding.kind.market' },
}

const kind = computed(() => KIND[props.finding.kind])

/**
 * DER LOKALE STAND NACH EINEM KLICK.
 *
 * Alle drei Listen, aus denen ein Chip kommt, tragen NUR offene Befunde
 * (`BrandStepDetailResponse.findings`, `BrandAcceptanceSessionView.findings`).
 * Nach einer Entscheidung ist der Chip also dem Nachladen der Seite VORAUS —
 * bis dahin steht hier das stille Etikett statt der zwei Knöpfe. Ohne diesen
 * Zwischenstand blieben die Knöpfe klickbar, und der zweite Klick liefe in ein
 * 409 `already_decided`.
 */
const decided = ref<BrandFindingView | null>(null)
const current = computed<BrandFindingView>(() => decided.value ?? props.finding)
watch(() => props.finding.id, () => { decided.value = null })

const open = computed(() => current.value.status === 'open')
const expanded = ref(!props.compact)

/** Die Felder als Links — unbekannte Ids fallen in der puren Regel weg. */
const targets = computed(() => acceptTargets(current.value)
  .map(slotId => ({ slotId, label: fieldLabel(slotId) })))

/**
 * WELCHES FELD ANFASSEN? Bei ZWEI beteiligten Feldern eine echte Wahl, bei
 * einem der direkte Weg. Die Zahl der Ziele IST die Antwort auf „braucht es
 * eine Auswahl" (s. `acceptTargets`).
 */
const needsChoice = computed(() => targets.value.length > 1)

const busy = ref(false)

async function decide(status: 'accepted' | 'dismissed', reason?: string): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  try {
    const response = await $fetch<BrandFindingDecisionResponse>(
      `/api/brand/profiles/${props.profileId}/findings/${current.value.id}`,
      {
        method: 'POST',
        body: { status, ...(reason ? { dismissReason: reason.slice(0, BRAND_FINDING_REASON_MAX) } : {}) },
      },
    )
    decided.value = response.finding
    emit('decided', response)
    return true
  }
  catch (error) {
    const already = (error as { data?: { reason?: string } }).data?.reason === 'already_decided'
    // TOAST NUR BEI FEHLER: eine geglückte Entscheidung sieht man am Chip.
    toast.add({
      color: 'warning',
      title: t(already ? 'brand.finding.alreadyDecided' : 'brand.finding.decideFailed'),
    })
    // Ein 409 heisst „dein Bildschirm ist alt" — die Liste wird geholt, nicht
    // geraten (dieselbe Familie wie `revision_conflict`).
    if (already) emit('stale')
    return false
  }
  finally {
    busy.value = false
  }
}

/**
 * DER SPRUNG IN DIE SESSION — die SEITE entscheidet, ob vorher der
 * Impact-Hinweis steht (§9, s. Kopf).
 */
function jumpTo(slotId: string): void {
  emit('field', slotId)
}

async function accept(slotId: string | null): Promise<void> {
  const ok = await decide('accepted')
  if (ok && slotId) jumpTo(slotId)
}

// ── Ablehnen: der Grund ist Pflicht ───────────────────────────────────────

const dismissOpen = ref(false)
const reason = ref('')
const reasonReady = computed(() => dismissReasonValid(reason.value))

function openDismiss(): void {
  reason.value = ''
  dismissOpen.value = true
}

async function confirmDismiss(): Promise<void> {
  if (!reasonReady.value) return
  const ok = await decide('dismissed', reason.value.trim())
  if (ok) dismissOpen.value = false
}
</script>

<template>
  <div
    class="rounded-xl px-2.5 py-2"
    style="background: var(--bw-stale-soft)"
  >
    <div class="flex items-start gap-2">
      <UIcon :name="kind.icon" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
      <!-- Der Satz IST der Aufklapper: eine gekürzte Zeile mit vollem Text im
           Tooltip, ein Klick zeigt Felder, Vorschlag und die Handlungen. -->
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        :aria-expanded="expanded"
        :title="current.why"
        @click="expanded = !expanded"
      >
        <span class="bw-label block" style="color: var(--bw-stale)">{{ t(kind.key) }}</span>
        <span class="block text-sm leading-snug" :class="expanded ? '' : 'truncate'">{{ current.why }}</span>
      </button>
      <!-- ENTSCHIEDEN: ein stilles Etikett statt zweier Knöpfe. Der Grund einer
           Ablehnung steht im Tooltip — er ist die Auskunft, warum hier nichts
           mehr zu tun ist. -->
      <span
        v-if="!open"
        class="bw-label flex-none"
        style="color: var(--bw-muted)"
        :title="current.dismissReason || undefined"
      >{{ t(current.status === 'accepted' ? 'brand.finding.accepted' : 'brand.finding.dismissed') }}</span>
    </div>

    <div v-if="expanded" class="mt-2 pl-6">
      <p v-if="current.suggestion" class="text-sm leading-snug" style="color: var(--bw-ink-soft)">
        {{ current.suggestion }}
      </p>

      <div v-if="targets.length" class="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="bw-label" style="color: var(--bw-muted)">{{ t('brand.finding.fields') }}</span>
        <button
          v-for="target in targets" :key="target.slotId"
          type="button" class="bw-label underline" style="color: var(--bw-ink-soft)"
          @click="jumpTo(target.slotId)"
        >{{ target.label }}</button>
      </div>

      <div v-if="open" class="mt-2 flex flex-wrap items-center gap-2">
        <!-- ZWEI FELDER ⇒ EINE FRAGE. Das Menü teleportiert an den Body, also
             AUSSERHALB des Token-Wirtes `.bw-root` — ohne `bw-root bw-overlay`
             am Inhalt sind alle `--bw-*`-Farben leer (R19b/c live erwischt). -->
        <UDropdownMenu
          v-if="needsChoice"
          :items="[targets.map(target => ({
            label: target.label,
            onSelect: () => { void accept(target.slotId) },
          }))]"
          :content="{ align: 'start' }"
          :ui="{ content: 'bw-root bw-overlay' }"
        >
          <UButton
            size="sm" color="neutral" variant="ghost" class="bw-chip-action rounded-full"
            icon="i-ph-check" :label="t('brand.finding.accept')"
            :disabled="busy" :aria-label="t('brand.finding.acceptWhich')"
          />
        </UDropdownMenu>
        <UButton
          v-else
          size="sm" color="neutral" variant="ghost" class="bw-chip-action rounded-full"
          icon="i-ph-check" :label="t('brand.finding.accept')"
          :disabled="busy"
          @click="accept(targets[0]?.slotId ?? null)"
        />
        <UButton
          size="sm" color="neutral" variant="ghost" class="bw-chip-action rounded-full"
          icon="i-ph-x" :label="t('brand.finding.dismiss')"
          :disabled="busy"
          @click="openDismiss"
        />
      </div>
    </div>

    <!-- ABLEHNEN MIT GRUND. NIE per v-if aus dem Baum nehmen (Reka-Falle) —
         `v-model:open` allein steuert ihn. -->
    <UModal v-model:open="dismissOpen" :title="t('brand.finding.dismissTitle')">
      <template #content>
        <div class="bw-root bw-overlay max-h-[85vh] overflow-y-auto p-8">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-stale)">
            {{ t(kind.key) }}
          </p>
          <h2 class="mt-1 text-[24px] font-extralight leading-tight tracking-tight">
            {{ t('brand.finding.dismissTitle') }}
          </h2>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ current.why }}</p>

          <p class="mt-5 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.finding.dismissPrompt') }}</p>
          <UTextarea
            v-model="reason" class="mt-2 w-full" :rows="3"
            :maxlength="BRAND_FINDING_REASON_MAX"
            :aria-label="t('brand.finding.dismissPrompt')"
          />
          <p v-if="!reasonReady" class="bw-label mt-1" style="color: var(--bw-muted)">
            {{ t('brand.finding.dismissTooShort') }}
          </p>

          <div class="mt-6 flex flex-wrap justify-end gap-2">
            <UButton
              variant="ghost" color="neutral" class="rounded-full"
              :label="t('brand.acceptance.restart.cancel')" @click="dismissOpen = false"
            />
            <UButton
              color="neutral" class="rounded-full"
              :disabled="!reasonReady" :loading="busy"
              :label="t('brand.finding.dismiss')" @click="confirmDismiss"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
