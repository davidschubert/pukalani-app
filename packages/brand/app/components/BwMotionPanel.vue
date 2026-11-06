<script setup lang="ts">
import { brandMotionDurationText, brandTempoOrFirst } from '../../shared/brandDesignMotion'
import { BRAND_LOGO_MOTION_OPTIONS, BRAND_TEMPO_OPTIONS, brandTermLabel } from '../../shared/brandDesignVocab'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE BEWEGUNG (Kapitel `motion`, Konzept docs/archiv/BRAND-DESIGN.md §2.7,
 * Paket D7) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/motion.vue`), mit einem Zusatz: die
 * drei Tempos stehen als drei SZENEN nebeneinander und spielen GLEICHZEITIG.
 *
 * ── DIE VORSCHAU IST DIE ENTSCHEIDUNG ─────────────────────────────────────
 * Tempo liest man nicht, man sieht es. Drei Karten mit Zahlen wären eine
 * Auswahl zwischen 240, 180 und 120 — und niemand weiss, wie sich eine Zahl
 * anfühlt. Nebeneinander abgespielt ist der Unterschied in einer Sekunde
 * entschieden (§2.9: „drei Szenen nebeneinander für Vergleiche"). Darunter
 * steht dieselbe Szene noch einmal gross, im GEWÄHLTEN Tempo: dort lässt sich
 * der Knopf anfassen (Hover) und hell gegen dunkel prüfen.
 *
 * ── „WENIGER BEWEGUNG" IST KEIN SONDERFALL, SONDERN DIE ZWEITE HÄLFTE ─────
 * Der Schalter simuliert die Systemeinstellung: die Szenen spielen dann NICHTS
 * und schreiben ihre Werte als Text hin — keine „halb so schnelle"
 * Ersatz-Animation. Wer das Kapitel abnimmt, muss beides gesehen haben. Die
 * ECHTE Einstellung des Betriebssystems respektiert die Szene ohnehin von
 * selbst (`prefers-reduced-motion`, s. `BwDesignScene`), auch ohne diesen
 * Schalter.
 *
 * ── EINE SZENE IN EINER KARTE HAT KEINEN UMSCHALTER ───────────────────────
 * Die Karte IST ein `<button>`; ein Button darin ist ungültiges HTML, und die
 * Hydration findet danach einen anderen Baum vor (2026-09-08 live erwischt).
 * Deshalb bekommen die drei Vergleichs-Szenen ein festes `scheme` — dann
 * rendert der Umschalter als `<span>`. Nicht „aufräumen".
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie in Farbwelt, Typografie, Zeichen und Bildsprache: kein Chat, kein Zug,
 * kein Lauf. Dieses Kapitel rechnet JEDEN seiner vier Werte; bestätigt wird
 * jede Session unten auf ihrer Karte (`RENDERED_ABOVE`).
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ───────────────────────────
 * Sie schreibt keinen Slot; jede Wahl geht als `pick(slotId, value)` an die
 * Seite, und die ist die einzige Stelle mit `setSlotValue` + Autosave.
 */

const props = withDefaults(defineProps<{
  /** Sperrt JEDE Auswahl — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
  /** Die bestätigten Sessions dieses Kapitels: ein bestätigter Slot ist zu. */
  confirmed?: readonly string[]
}>(), { disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()
const { colors, fonts, defaults, tempoId, logoId, tokens, rules, sceneMotion } = useBrandMotionWorld()

function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

function pick(slotId: string, value: string): void {
  if (locked(slotId)) return
  emit('pick', slotId, value)
}

/** Der Name, wie er gesetzt wird — der Platzhalter nur für namenlose Marken. */
const wordmark = computed(() => store.profile?.title?.trim() || t('brand.scene.wordmarkFallback'))

/**
 * ABSPIELEN IST BEDIENZUSTAND, KEIN ERGEBNIS (s. `useBrandMotionWorld`): ein
 * Zähler, den alle Szenen teilen. Eine Szene, die bei jedem Rendern von selbst
 * wackelte, wäre im Dreier-Vergleich unbrauchbar.
 */
const playKey = ref(0)
const simulateReduced = ref(false)

function play(): void {
  if (simulateReduced.value) return
  playKey.value += 1
}

/** Ein Tempo wählen heisst: es sofort hören. */
function pickTempo(id: string): void {
  pick('l.tempo', id)
  play()
}

const tempo = computed(() => brandTempoOrFirst(tempoId.value))
</script>

<template>
  <section data-brand-motion class="flex flex-col gap-8">
    <!-- ── l.tempo ──────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.motion.tempo.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.motion.tempo.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.motion.tempo.intro') }}</p>

      <!-- Die zwei Knöpfe stehen ÜBER den Karten und nicht in ihnen: eine
           Karte ist selbst ein Button (s. Kopf). -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          size="sm" color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)"
          icon="i-ph-play" :label="t('brand.motion.tempo.play')"
          :disabled="simulateReduced" data-motion-play
          @click="play()"
        />
        <UButton
          size="sm" color="neutral" :variant="simulateReduced ? 'solid' : 'ghost'" class="rounded-full"
          :icon="simulateReduced ? 'i-ph-eye-slash' : 'i-ph-eye'"
          :label="simulateReduced ? t('brand.motion.tempo.reducedOn') : t('brand.motion.tempo.reduced')"
          :aria-pressed="simulateReduced" data-motion-reduced
          @click="simulateReduced = !simulateReduced"
        />
      </div>

      <div class="mt-3 grid gap-3 lg:grid-cols-3">
        <button
          v-for="option in BRAND_TEMPO_OPTIONS" :key="option.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="tempoId === option.id ? 'bw-choice-card--selected' : ''"
          :data-motion-tempo="option.id"
          :data-motion-base="option.base"
          :aria-pressed="tempoId === option.id"
          :disabled="locked('l.tempo')"
          @click="pickTempo(option.id)"
        >
          <!-- DIE SZENE SPIELT MIT DEN WERTEN DIESER KARTE — nicht mit denen
               der gewählten: der Vergleich ist der ganze Zweck. -->
          <BwDesignScene
            :colors="colors" :fonts="fonts" :motion="sceneMotion(option.id)"
            :play-key="playKey" :simulate-reduced-motion="simulateReduced"
            :wordmark="wordmark" scheme="light" compact
          />
          <span class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ brandTermLabel(option, locale) }}</span>
            <span v-if="option.id === defaults.tempo" class="bw-pop-chip">
              {{ t('brand.motion.tempo.proposed') }}
            </span>
            <span class="bw-label ms-auto tabular-nums" style="color: var(--bw-muted)">
              {{ brandMotionDurationText(option.base) }}
            </span>
            <UIcon
              v-if="tempoId === option.id" name="i-ph-check-circle-fill"
              class="size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`brand.motion.tempo.note.${option.id}`) }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── l.transitions ────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.motion.transitions.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          {{ t('brand.motion.transitions.tag') }}
        </span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.motion.transitions.intro') }}</p>

      <!-- Breite Tabellen scrollen in ihrem eigenen Kasten (CLAUDE.md). -->
      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                v-for="col in ['token', 'duration', 'easing', 'usage']" :key="col"
                class="bw-label border-b px-0 pb-2 pr-4 font-normal uppercase tracking-wider"
                style="color: var(--bw-muted); border-color: var(--bw-line)"
              >{{ t(`brand.motion.transitions.col.${col}`) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="token in tokens" :key="token.id" :data-motion-token="token.id">
              <td class="border-b py-2.5 pr-4 font-medium" style="border-color: var(--bw-line)">
                {{ token.label }}
              </td>
              <td
                class="border-b py-2.5 pr-4 tabular-nums"
                style="border-color: var(--bw-line); color: var(--bw-ink-soft)"
                :data-motion-duration="token.durationMs"
              >{{ brandMotionDurationText(token.durationMs) }}</td>
              <!-- ALLE VIER ZEILEN TRAGEN IHRE KURVE — auch der Versatz, der
                   selbst nichts bewegt. Sie steht so im Slot-Wert und so im
                   Preset (`brandMotionTransitions`, D0); ein „—" an dieser
                   Stelle wäre die zweite Fassung derselben Tabelle, und beim
                   nächsten Blick stimmte eine von beiden nicht mehr. Der
                   Prototyp zeigte hier „—" (Davids Inhalts-Gate). -->
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                <span class="bw-label">{{ token.easing }}</span>
              </td>
              <td class="border-b py-2.5 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ token.usage }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Die Szene im gewählten Tempo ─────────────────────────────────── -->
    <div>
      <h2 class="text-xl font-medium">{{ t('brand.motion.scene.title') }}</h2>
      <p class="bw-doc-text mt-2">{{ t('brand.motion.scene.intro') }}</p>
      <div class="mt-3" data-motion-scene>
        <BwDesignScene
          :colors="colors" :fonts="fonts" :motion="sceneMotion(tempoId)"
          :play-key="playKey" :simulate-reduced-motion="simulateReduced"
          :wordmark="wordmark"
        />
      </div>
      <p class="bw-pending mt-3">
        {{ t('brand.motion.scene.note', { duration: brandMotionDurationText(tempo.base) }) }}
      </p>
    </div>

    <div class="grid gap-8 lg:grid-cols-2">
      <!-- ── l.logo ─────────────────────────────────────────────────────── -->
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">{{ t('brand.motion.logo.title') }}</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.motion.logo.tag') }}</span>
        </div>
        <p class="bw-doc-text mt-2">{{ t('brand.motion.logo.intro') }}</p>

        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="option in BRAND_LOGO_MOTION_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="logoId === option.id ? 'bw-choice-card--selected' : ''"
            :data-motion-logo="option.id"
            :aria-pressed="logoId === option.id"
            :disabled="locked('l.logo')"
            @click="pick('l.logo', option.id)"
          >
            <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="text-sm font-medium">{{ brandTermLabel(option, locale) }}</span>
              <span v-if="option.id === defaults.logo" class="bw-pop-chip">
                {{ t('brand.motion.tempo.proposed') }}
              </span>
              <UIcon
                v-if="logoId === option.id" name="i-ph-check-circle-fill"
                class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
              />
            </span>
            <!-- DIE WORTMARKE ALS PROBE: bei „ja" baut sie sich auf, sobald
                 abgespielt wird — im Schriftpaar und in der Tinte der Marke,
                 damit man die Bewegung an DIESEM Namen beurteilt. -->
            <span
              :key="`${option.id}-${playKey}`"
              class="bw-motion-mark mt-2 block truncate"
              :class="option.id === 'yes' && !simulateReduced ? 'bw-motion-mark--kinetic' : ''"
              :style="`font-family: ${fonts.headingStack}; font-weight: ${fonts.headingWeight ?? 400};`
                + `letter-spacing: ${fonts.headingTracking ?? 0}px;`
                + `text-transform: ${fonts.headingUppercase ? 'uppercase' : 'none'};`
                + `color: ${colors.rampLight[700]}`"
            >{{ wordmark }}</span>
            <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ t(`brand.motion.logo.note.${option.id}`) }}
            </span>
          </button>
        </div>
      </div>

      <!-- ── l.rules ────────────────────────────────────────────────────── -->
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">{{ t('brand.motion.rules.title') }}</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.motion.rules.tag') }}</span>
        </div>
        <p class="bw-doc-text mt-2">{{ t('brand.motion.rules.intro') }}</p>
        <ul class="mt-3 flex flex-col gap-2" data-motion-rules>
          <li
            v-for="(rule, index) in rules" :key="index"
            class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
          >
            <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
            <span class="min-w-0">{{ rule }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Die Probe des kinetischen Zeichens: EIN Aufbau, zwei Eigenschaften
 * (Deckkraft und eine Verschiebung) — genau das, was die Regel oben erlaubt.
 * Die Dauer ist die des Aufbaus (`BRAND_LOGO_MOTION_BUILD_MS`), nicht die des
 * Tempos: ein Zeichen-Aufbau ist ein Vorspann, kein Übergang. */
.bw-motion-mark {
  font-size: 1.35rem;
  line-height: 1.2;
}
.bw-motion-mark--kinetic {
  animation: bw-motion-mark-build 800ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes bw-motion-mark-build {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .bw-motion-mark--kinetic { animation: none; }
}
</style>
